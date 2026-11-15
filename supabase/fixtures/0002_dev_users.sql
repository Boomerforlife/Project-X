-- DEV-ONLY fixture (never load in production): fixed local users for AUTH_MODE=test tokens.
-- The handle_new_user trigger creates the profile and streak rows.
--   dev1  e0000000-0000-4000-8000-000000000001
--   dev2  e0000000-0000-4000-8000-000000000002
--   admin e0000000-0000-4000-8000-0000000000a1 (ADMIN role)
-- Idempotent.
insert into auth.users (id, email, raw_user_meta_data) values
  ('e0000000-0000-4000-8000-000000000001', 'dev1@projectx.local', '{"display_name":"Dev One"}'),
  ('e0000000-0000-4000-8000-000000000002', 'dev2@projectx.local', '{"display_name":"Dev Two"}'),
  ('e0000000-0000-4000-8000-0000000000a1', 'admin@projectx.local', '{"display_name":"Dev Admin"}')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('e0000000-0000-4000-8000-0000000000a1', 'ADMIN')
on conflict do nothing;
