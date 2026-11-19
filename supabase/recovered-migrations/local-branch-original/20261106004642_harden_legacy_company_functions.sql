-- The legacy ranking RPC is not used by the current application and reads the
-- retired public.empresas model. Remove API execution while retaining the
-- function for controlled administrative migrations if ever needed.
ALTER FUNCTION public.buscar_empresas_ranqueadas(numeric, numeric) SET search_path = '';
REVOKE ALL ON FUNCTION public.buscar_empresas_ranqueadas(numeric, numeric) FROM PUBLIC, anon, authenticated;

-- This function is invoked only by the empresas trigger. Trigger execution does
-- not require callers to hold EXECUTE on the trigger function.
ALTER FUNCTION public.vincular_dono_equipe() SET search_path = '';
REVOKE ALL ON FUNCTION public.vincular_dono_equipe() FROM PUBLIC, anon, authenticated;
