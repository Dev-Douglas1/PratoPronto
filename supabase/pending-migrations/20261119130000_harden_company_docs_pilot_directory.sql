-- Conservative security hardening for pilot discovery, company documents and delivery secrets.
-- This migration preserves existing rows and keeps company documents private.

-- 1) The pilot directory is operational data for restaurant staff, not a public user directory.
CREATE OR REPLACE FUNCTION public.list_available_pilots()
RETURNS TABLE(
  profile_id uuid,
  display_name text,
  vehicle_type text,
  city text,
  accepting_offers boolean,
  motorcycle_type text,
  vehicle_color text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL
     OR NOT private.verified(uid)
     OR NOT EXISTS (
       SELECT 1
       FROM auth.users u
       WHERE u.id = uid
         AND (u.banned_until IS NULL OR u.banned_until <= now())
     )
  THEN
    RAISE EXCEPTION 'Entre com uma conta verificada para continuar.'
      USING errcode = '42501';
  END IF;

  PERFORM private.enforce_rate_limit('pilots.directory', 30, 60);

  IF NOT EXISTS (
    SELECT 1
    FROM public.restaurant_members rm
    JOIN public.restaurantes r ON r.id = rm.restaurante_id
    WHERE rm.profile_id = uid
      AND rm.active = true
      AND rm.role IN ('owner', 'admin', 'attendant')
      AND r.account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'A lista de pilotos está disponível somente para a equipe de empresas ativas.'
      USING errcode = '42501';
  END IF;

  RETURN QUERY
    SELECT pp.profile_id, pp.display_name, pp.vehicle_type, pp.city,
           pp.accepting_offers, pp.motorcycle_type, pp.vehicle_color
    FROM public.pilot_profiles pp
    WHERE pp.accepting_offers = true
      AND pp.approval_status = 'approved'
      AND pp.account_status = 'active'
    ORDER BY pp.display_name
    LIMIT 100;
END
$function$;

REVOKE ALL ON FUNCTION public.list_available_pilots() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_available_pilots() TO authenticated, service_role;

-- 2) Company document uploads and replacements are limited to the owner's
--    pending request and the canonical document filename format used by the app.
DROP POLICY IF EXISTS company_docs_upload_owner ON storage.objects;
CREATE POLICY company_docs_upload_owner
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-registration-documents'
  AND CASE
    WHEN array_length(storage.foldername(name), 1) = 2
      AND name ~* (
        '^' || (SELECT auth.uid())::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' ||
        '(cnpj_card|cpf_card|identity|proof_of_address|authorization)\.(pdf|jpg|png|webp)$'
      )
    THEN public.can_upload_company_registration_document(
      ((storage.foldername(name))[2])::uuid
    )
    ELSE false
  END
);

DROP POLICY IF EXISTS company_docs_update_owner ON storage.objects;
CREATE POLICY company_docs_update_owner
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-registration-documents'
  AND CASE
    WHEN array_length(storage.foldername(name), 1) = 2
      AND name ~* (
        '^' || (SELECT auth.uid())::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' ||
        '(cnpj_card|cpf_card|identity|proof_of_address|authorization)\.(pdf|jpg|png|webp)$'
      )
    THEN public.can_upload_company_registration_document(
      ((storage.foldername(name))[2])::uuid
    )
    ELSE false
  END
)
WITH CHECK (
  bucket_id = 'company-registration-documents'
  AND CASE
    WHEN array_length(storage.foldername(name), 1) = 2
      AND name ~* (
        '^' || (SELECT auth.uid())::text ||
        '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' ||
        '(cnpj_card|cpf_card|identity|proof_of_address|authorization)\.(pdf|jpg|png|webp)$'
      )
    THEN public.can_upload_company_registration_document(
      ((storage.foldername(name))[2])::uuid
    )
    ELSE false
  END
);

-- 3) A registration record must point to the exact uploaded object owned by
--    the applicant. A client cannot register a fabricated storage path.
CREATE OR REPLACE FUNCTION public.register_company_document(
  p_request_id uuid,
  p_type text,
  p_path text,
  p_mime text,
  p_size bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  uid uuid := auth.uid();
  request_kind text;
  required_id_type text;
  file_extension text;
  expected_path text;
BEGIN
  IF uid IS NULL OR NOT private.verified(uid) THEN
    RAISE EXCEPTION 'Entre com uma conta verificada.'
      USING errcode = '42501';
  END IF;

  IF p_request_id IS NULL
     OR p_type IS NULL
     OR p_type NOT IN ('cnpj_card','cpf_card','identity','proof_of_address','authorization')
  THEN
    RAISE EXCEPTION 'Tipo ou solicitação de documento inválida.'
      USING errcode = '22023';
  END IF;

  IF p_mime IS NULL
     OR p_mime NOT IN ('application/pdf','image/jpeg','image/png','image/webp')
     OR p_size IS NULL
     OR p_size NOT BETWEEN 1 AND 5242880
  THEN
    RAISE EXCEPTION 'Arquivo inválido. Use PDF, JPG, PNG ou WEBP de até 5 MB.'
      USING errcode = '22023';
  END IF;

  file_extension := CASE p_mime
    WHEN 'application/pdf' THEN 'pdf'
    WHEN 'image/jpeg' THEN 'jpg'
    WHEN 'image/png' THEN 'png'
    WHEN 'image/webp' THEN 'webp'
  END;

  expected_path := uid::text || '/' || p_request_id::text || '/' ||
                   p_type || '.' || file_extension;

  IF p_path IS DISTINCT FROM expected_path THEN
    RAISE EXCEPTION 'Caminho de arquivo inválido.'
      USING errcode = '42501';
  END IF;

  SELECT q.person_type
    INTO request_kind
  FROM public.company_registration_requests q
  WHERE q.id = p_request_id
    AND q.user_id = uid
    AND q.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada ou já analisada.'
      USING errcode = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'company-registration-documents'
      AND o.name = expected_path
      AND o.owner_id = uid::text
  ) THEN
    RAISE EXCEPTION 'O arquivo não foi localizado no armazenamento privado da sua conta.'
      USING errcode = '22023';
  END IF;

  required_id_type := CASE WHEN request_kind = 'pj' THEN 'cnpj_card' ELSE 'cpf_card' END;
  IF p_type IN ('cnpj_card','cpf_card') AND p_type <> required_id_type THEN
    RAISE EXCEPTION 'O documento enviado não corresponde ao tipo de cadastro.'
      USING errcode = '22023';
  END IF;

  INSERT INTO public.company_registration_documents(
    request_id, user_id, document_type, storage_path, mime_type, file_size
  )
  VALUES (p_request_id, uid, p_type, expected_path, p_mime, p_size)
  ON CONFLICT (request_id, document_type) DO UPDATE
    SET storage_path = EXCLUDED.storage_path,
        mime_type = EXCLUDED.mime_type,
        file_size = EXCLUDED.file_size,
        created_at = now();

  RETURN jsonb_build_object('saved', true, 'type', p_type);
END
$function$;

REVOKE ALL ON FUNCTION public.register_company_document(uuid, text, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_company_document(uuid, text, text, text, bigint)
TO authenticated, service_role;

-- 4) The customer reads their own delivery code through the app. No client
--    writes are needed: checkout and delivery confirmation use privileged RPCs.
REVOKE ALL ON TABLE public.delivery_secrets FROM anon, authenticated;
GRANT SELECT ON TABLE public.delivery_secrets TO authenticated;

COMMENT ON TABLE public.delivery_secrets IS
  'Private delivery verification secrets. Authenticated customers may read only their own code through RLS; writes are restricted to trusted RPCs.';
