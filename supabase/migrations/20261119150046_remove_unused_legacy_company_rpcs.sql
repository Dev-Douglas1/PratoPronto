-- Remove legacy RPCs superseded by the current company-registration and catalog flows.
-- Each function was verified to have no references in application code, routines,
-- triggers, policies, or catalog dependencies. DROP uses RESTRICT (the default).
DROP FUNCTION IF EXISTS public.submit_company_registration(text, text, text, text) RESTRICT;
DROP FUNCTION IF EXISTS public.my_company_registration_request() RESTRICT;
DROP FUNCTION IF EXISTS public.list_company_registration_requests() RESTRICT;
DROP FUNCTION IF EXISTS public.company_catalog_list(uuid) RESTRICT;
DROP FUNCTION IF EXISTS public.company_catalog_save(uuid, uuid, text, text, text, integer, text, boolean) RESTRICT;
DROP FUNCTION IF EXISTS public.company_catalog_set_active(uuid, uuid, boolean) RESTRICT;
DROP FUNCTION IF EXISTS public.create_restaurant(text, text) RESTRICT;
