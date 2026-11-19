-- Remove the retired proximity search RPC. Its only caller was the orphaned
-- useNearbyStores hook, which has no imports in the application.
DROP FUNCTION IF EXISTS public.buscar_empresas_ranqueadas(numeric, numeric) RESTRICT;
