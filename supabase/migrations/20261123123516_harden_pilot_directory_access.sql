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
