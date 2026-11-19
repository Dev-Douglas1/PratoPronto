-- CANDIDATO HISTÓRICO, NÃO CORRESPONDÊNCIA CONFIRMADA.
-- Recuperado do diff do commit 19492ccd45256b93f641a761ccaab4120f9837ee.
-- Caminho original removido: supabase/migrations/20261106004700_harden_legacy_company_functions.sql
-- No histórico remoto consta 20261106004642_harden_legacy_company_functions (timestamp diferente).
-- Não renomear para 20261106004642 nem executar sem comparar o schema e o histórico.

-- The legacy ranking RPC is not used by the current application and reads the
-- retired public.empresas model. Remove API execution while retaining the
-- function for controlled administrative migrations if ever needed.
ALTER FUNCTION public.buscar_empresas_ranqueadas(numeric, numeric) SET search_path = '';
REVOKE ALL ON FUNCTION public.buscar_empresas_ranqueadas(numeric, numeric) FROM PUBLIC, anon, authenticated;

-- This function is invoked only by the empresas trigger. Trigger execution does
-- not require callers to hold EXECUTE on the trigger function.
ALTER FUNCTION public.vincular_dono_equipe() SET search_path = '';
REVOKE ALL ON FUNCTION public.vincular_dono_equipe() FROM PUBLIC, anon, authenticated;
