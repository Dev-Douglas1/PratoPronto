-- Harden actor verification across privileged application RPCs.
-- SECURITY DEFINER remains intentional for server-side data access; each public entry point
-- validates the authenticated actor and the relevant business/pilot role.

CREATE OR REPLACE FUNCTION private.verified(actor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = actor
      AND (email_confirmed_at IS NOT NULL OR phone_confirmed_at IS NOT NULL)
      AND deleted_at IS NULL
      AND (banned_until IS NULL OR banned_until < now())
  )
$function$;

CREATE OR REPLACE FUNCTION private.restaurant_role(
  p_restaurant_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT rm.role
  FROM public.restaurant_members rm
  JOIN public.restaurantes r ON r.id = rm.restaurante_id
  WHERE rm.restaurante_id = p_restaurant_id
    AND rm.profile_id = p_user_id
    AND rm.active = true
    AND r.account_status = 'active'
    AND private.verified(p_user_id)
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION private.restaurant_membership_exists(
  p_restaurant_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT private.verified(p_user_id) AND EXISTS (
    SELECT 1
    FROM public.restaurant_members rm
    JOIN public.restaurantes r ON r.id = rm.restaurante_id
    WHERE rm.restaurante_id = p_restaurant_id
      AND rm.profile_id = p_user_id
      AND rm.active = true
      AND r.account_status <> 'blocked'
  )
$function$;

CREATE OR REPLACE FUNCTION private.pilot_available(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT private.verified(p_user_id) AND EXISTS (
    SELECT 1
    FROM public.pilot_profiles pp
    WHERE pp.profile_id = p_user_id
      AND pp.approval_status = 'approved'
      AND pp.account_status = 'active'
      AND pp.accepting_offers = true
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  SELECT private.verified(auth.uid()) AND EXISTS (
    SELECT 1
    FROM public.platform_admins a
    WHERE a.profile_id = auth.uid()
      AND a.active = true
  )
$function$;

CREATE OR REPLACE FUNCTION public.set_pilot_availability(p_accepting boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  uid uuid := auth.uid();
  pp public.pilot_profiles;
BEGIN
  IF uid IS NULL OR NOT private.verified(uid) THEN
    RAISE EXCEPTION 'Confirme sua conta antes de alterar a disponibilidade.' USING errcode = '42501';
  END IF;
  PERFORM private.enforce_rate_limit('pilot.availability', 30, 60);
  SELECT * INTO pp FROM public.pilot_profiles WHERE profile_id = uid FOR UPDATE;
  IF pp.profile_id IS NULL THEN RAISE EXCEPTION 'Cadastro de piloto não encontrado.'; END IF;
  IF pp.approval_status <> 'approved' THEN RAISE EXCEPTION 'Seu cadastro precisa estar aprovado para receber ofertas.'; END IF;
  IF pp.account_status <> 'active' THEN RAISE EXCEPTION 'Seu acesso como Piloto Parceiro está suspenso ou bloqueado.'; END IF;

  UPDATE public.pilot_profiles
  SET accepting_offers = coalesce(p_accepting, false), updated_at = now()
  WHERE profile_id = uid;

  RETURN jsonb_build_object('accepting_offers', coalesce(p_accepting, false));
END
$function$;

CREATE OR REPLACE FUNCTION public.can_upload_company_registration_document(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT private.verified(auth.uid()) AND EXISTS (
    SELECT 1
    FROM public.company_registration_requests q
    WHERE q.id = p_request_id
      AND q.user_id = auth.uid()
      AND q.status = 'pending'
  )
$function$;

CREATE OR REPLACE FUNCTION public.get_my_restaurant_subscription(p_restaurant_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  rid uuid;
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT private.verified(auth.uid()) THEN
    RAISE EXCEPTION 'Confirme sua conta para consultar a assinatura.' USING errcode = '42501';
  END IF;

  rid := private.restaurant_id_from_slug(p_restaurant_slug);
  IF rid IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.restaurant_members rm
    WHERE rm.restaurante_id = rid
      AND rm.profile_id = auth.uid()
      AND rm.active = true
      AND rm.role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para consultar a assinatura desta empresa.' USING errcode = '42501';
  END IF;

  SELECT jsonb_build_object(
    'subscriptionId', s.id,
    'status', s.status,
    'periodStart', s.current_period_start,
    'periodEnd', s.current_period_end,
    'cancelAtPeriodEnd', s.cancel_at_period_end,
    'plan', jsonb_build_object(
      'code', p.code,
      'name', p.name,
      'description', p.description,
      'monthlyPriceCents', p.monthly_price_cents,
      'productLimit', p.product_limit,
      'memberLimit', p.member_limit,
      'monthlyOrderLimit', p.monthly_order_limit
    ),
    'usage', jsonb_build_object(
      'products', (SELECT count(*) FROM public.products x WHERE x.restaurant_id = rid),
      'members', (SELECT count(*) FROM public.restaurant_members x WHERE x.restaurante_id = rid AND x.active = true),
      'monthlyOrders', (
        SELECT count(*) FROM public.orders x
        WHERE x.restaurant_id = rid
          AND x.created_at >= date_trunc('month', now())
          AND x.created_at < date_trunc('month', now()) + interval '1 month'
      )
    ),
    'entitled', private.subscription_is_entitled(rid)
  ) INTO result
  FROM public.restaurant_subscriptions s
  JOIN public.subscription_plans p ON p.id = s.plan_id
  WHERE s.restaurant_id = rid;

  RETURN coalesce(result, jsonb_build_object('status', 'missing', 'entitled', false));
END
$function$;

CREATE OR REPLACE FUNCTION public.list_company_registration_documents(p_request_id uuid)
RETURNS TABLE(document_type text, storage_path text, mime_type text, file_size bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT private.verified(uid) THEN
    RAISE EXCEPTION 'Confirme sua conta para consultar documentos.' USING errcode = '42501';
  END IF;
  IF NOT public.is_platform_admin() AND NOT EXISTS (
    SELECT 1
    FROM public.company_registration_requests
    WHERE id = p_request_id AND user_id = uid
  ) THEN
    RAISE EXCEPTION 'Acesso não autorizado.' USING errcode = '42501';
  END IF;
  RETURN QUERY
    SELECT d.document_type, d.storage_path, d.mime_type, d.file_size
    FROM public.company_registration_documents d
    WHERE d.request_id = p_request_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.my_company_registration_request_v2()
RETURNS TABLE(
  id uuid, person_type text, cnpj text, cpf text, legal_name text, trade_name text,
  contact_phone text, status text, review_note text, created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT private.verified(auth.uid()) THEN
    RAISE EXCEPTION 'Entre em uma conta verificada.' USING errcode = '42501';
  END IF;
  RETURN QUERY
    SELECT q.id, q.person_type, q.cnpj, q.cpf, q.legal_name, q.trade_name,
           q.contact_phone, q.status, q.review_note, q.created_at
    FROM public.company_registration_requests q
    WHERE q.user_id = auth.uid()
    ORDER BY q.created_at DESC
    LIMIT 1;
END
$function$;

CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT private.verified(uid) THEN
    RAISE EXCEPTION 'Entre em uma conta verificada.' USING errcode = '42501';
  END IF;
  PERFORM private.enforce_rate_limit('account.delete_request', 3, 86400);
  IF EXISTS (
    SELECT 1
    FROM public.restaurant_members rm
    WHERE rm.profile_id = uid AND rm.role = 'owner' AND rm.active = true
  ) THEN
    RAISE EXCEPTION 'Transfira a propriedade das empresas antes de excluir sua conta.';
  END IF;
  INSERT INTO public.privacy_requests(user_id, status, data, updated_at)
  VALUES (uid, 'pendente', '{}'::jsonb, now())
  ON CONFLICT (user_id) DO UPDATE SET status = 'pendente', updated_at = now();
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION public.submit_order_review(
  p_order_id uuid, p_food integer, p_delivery integer, p_comment text DEFAULT ''
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  uid uuid := auth.uid();
  o public.orders;
  prof public.profiles;
BEGIN
  IF uid IS NULL OR NOT private.verified(uid) THEN
    RAISE EXCEPTION 'Confirme sua conta antes de avaliar pedidos.' USING errcode = '42501';
  END IF;
  PERFORM private.enforce_rate_limit('orders.review', 10, 3600);
  SELECT * INTO o FROM public.orders WHERE id = p_order_id;
  IF o.id IS NULL OR o.user_id <> uid OR o.status <> 'entregue' THEN
    RAISE EXCEPTION 'Este pedido ainda não pode ser avaliado.';
  END IF;
  IF p_food NOT BETWEEN 1 AND 5 OR p_delivery NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Escolha notas de 1 a 5.';
  END IF;
  IF char_length(coalesce(p_comment, '')) > 1000 THEN
    RAISE EXCEPTION 'Comentário muito longo.';
  END IF;
  SELECT * INTO prof FROM public.profiles WHERE id = uid;
  INSERT INTO public.reviews(id, user_id, restaurant_id, data, updated_at)
  VALUES (
    o.id, uid, o.restaurant_id,
    jsonb_build_object(
      'orderId', o.id, 'userId', uid, 'nome', prof.nome,
      'notaComida', p_food, 'notaEntrega', p_delivery,
      'comentario', coalesce(p_comment, ''), 'createdAt', now()
    ),
    now()
  );
  RETURN true;
END
$function$;

CREATE OR REPLACE FUNCTION public.submit_refund_request(p_order_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  uid uuid := auth.uid();
  o public.orders;
BEGIN
  IF uid IS NULL OR NOT private.verified(uid) THEN
    RAISE EXCEPTION 'Confirme sua conta antes de solicitar um estorno.' USING errcode = '42501';
  END IF;
  PERFORM private.enforce_rate_limit('orders.refund_request', 5, 3600);
  SELECT * INTO o FROM public.orders WHERE id = p_order_id;
  IF o.id IS NULL OR o.user_id <> uid THEN
    RAISE EXCEPTION 'Pedido não encontrado.';
  END IF;
  IF char_length(trim(coalesce(p_reason, ''))) < 5 OR char_length(trim(coalesce(p_reason, ''))) > 500 THEN
    RAISE EXCEPTION 'Explique o problema em até 500 caracteres.';
  END IF;
  INSERT INTO public.refund_requests(id, user_id, restaurant_id, status, data, updated_at)
  VALUES (
    o.id, uid, o.restaurant_id, 'pendente',
    jsonb_build_object('orderId', o.id, 'userId', uid, 'motivo', trim(p_reason), 'status', 'pendente'),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN true;
END
$function$;
