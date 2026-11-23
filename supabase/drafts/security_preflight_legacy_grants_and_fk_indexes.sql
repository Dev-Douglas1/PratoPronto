-- PREPARAÇÃO APENAS — NÃO APLICAR AUTOMATICAMENTE.
-- Revisar em staging antes de executar.
--
-- Objetivos:
-- 1) Revogar grants diretos em tabelas legadas que não são usadas por rotas
--    atuais. RLS permanece habilitado e sem policies (default-deny).
-- 2) Criar índices para as seis FKs apontadas pelo Supabase Advisor.
--
-- Evidência de uso:
-- - CadastroEmpresa.jsx e AddressModal.jsx contêm consultas diretas, mas não
--   são importados nem roteados na aplicação atual.
-- - equipe_empresa é escrita por public.vincular_dono_equipe(), trigger
--   SECURITY DEFINER; não conceder acesso direto ao cliente.
-- - Revalidar referências antes de qualquer aplicação.

REVOKE ALL ON TABLE public.empresas FROM anon, authenticated;
REVOKE ALL ON TABLE public.enderecos_usuario FROM anon, authenticated;
REVOKE ALL ON TABLE public.equipe_empresa FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS company_registration_documents_user_id_idx
  ON public.company_registration_documents (user_id);

CREATE INDEX IF NOT EXISTS company_registration_requests_restaurant_id_idx
  ON public.company_registration_requests (restaurant_id);

CREATE INDEX IF NOT EXISTS company_registration_requests_reviewed_by_idx
  ON public.company_registration_requests (reviewed_by);

CREATE INDEX IF NOT EXISTS empresas_dono_id_idx
  ON public.empresas (dono_id);

CREATE INDEX IF NOT EXISTS enderecos_usuario_user_id_idx
  ON public.enderecos_usuario (user_id);

CREATE INDEX IF NOT EXISTS equipe_empresa_user_id_idx
  ON public.equipe_empresa (user_id);
