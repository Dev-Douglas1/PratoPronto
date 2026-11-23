create index if not exists payment_gateway_accounts_vault_secret_id_idx
  on private.payment_gateway_accounts(vault_secret_id);
create index if not exists company_registration_documents_user_id_idx
  on public.company_registration_documents(user_id);
create index if not exists company_registration_requests_restaurant_id_idx
  on public.company_registration_requests(restaurant_id);
create index if not exists company_registration_requests_reviewed_by_idx
  on public.company_registration_requests(reviewed_by);
create index if not exists empresas_dono_id_idx
  on public.empresas(dono_id);
create index if not exists enderecos_usuario_user_id_idx
  on public.enderecos_usuario(user_id);
create index if not exists equipe_empresa_user_id_idx
  on public.equipe_empresa(user_id);
