-- Expose online payment methods when the merchant has an active Asaas
-- connection in the configured sandbox or production environment. The Edge
-- Functions still require ASAAS_ENVIRONMENT and retrieve only that environment's key.
DO $migration$
DECLARE
  original text;
  updated text;
BEGIN
  SELECT pg_get_functiondef('public.get_storefront(text)'::regprocedure) INTO original;
  updated := replace(
    original,
    $old$a.environment='production'$old$,
    $new$a.environment IN ('production','sandbox')$new$
  );
  IF updated = original OR position($check$a.environment IN ('production','sandbox')$check$ IN updated) = 0 THEN
    RAISE EXCEPTION 'Não foi possível habilitar métodos Asaas em sandbox na vitrine.';
  END IF;
  EXECUTE updated;
END
$migration$;
