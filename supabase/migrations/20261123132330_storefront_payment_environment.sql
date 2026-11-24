-- Keep storefront payment availability aligned with the Edge Function runtime.
-- Legacy clients that send only p_slug continue to default to production.
DO $migration$
DECLARE
  original text;
  updated text;
BEGIN
  SELECT pg_get_functiondef('public.get_storefront(text)'::regprocedure) INTO original;
  updated := replace(
    original,
    'CREATE OR REPLACE FUNCTION public.get_storefront(p_slug text)',
    'CREATE OR REPLACE FUNCTION public.get_storefront(p_slug text, p_payment_environment text DEFAULT ''production'')'
  );
  updated := replace(updated, $old$a.environment='production'$old$, $new$a.environment=p_payment_environment$new$);
  updated := replace(updated, $old$'environment','production'$old$, $new$'environment',p_payment_environment$new$);
  updated := replace(updated, $old$begin
  rid:=private.restaurant_id_from_slug(p_slug);$old$,
    $new$begin
  IF p_payment_environment NOT IN ('production','sandbox') THEN
    RAISE EXCEPTION 'Ambiente de pagamento inválido.' USING errcode = '22023';
  END IF;
  rid:=private.restaurant_id_from_slug(p_slug);$new$);

  IF updated = original
     OR position('p_payment_environment text DEFAULT' in updated) = 0
     OR position('a.environment=p_payment_environment' in updated) = 0
     OR position('IF p_payment_environment NOT IN' in updated) = 0
     OR position($check$'environment',p_payment_environment$check$ in updated) = 0 THEN
    RAISE EXCEPTION 'Não foi possível alinhar a vitrine ao ambiente Asaas configurado.';
  END IF;

  EXECUTE updated;
  DROP FUNCTION public.get_storefront(text);
  REVOKE ALL ON FUNCTION public.get_storefront(text,text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.get_storefront(text,text) TO anon, authenticated, service_role;
  COMMENT ON FUNCTION public.get_storefront(text,text) IS
    'Public read-only storefront. p_payment_environment must match ASAAS_ENVIRONMENT in Edge Functions.';
END
$migration$;
