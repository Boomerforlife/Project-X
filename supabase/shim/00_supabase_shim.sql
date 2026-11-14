-- TEST/LOCAL-ONLY stand-in for the parts of Supabase our migrations depend on.
-- Applied by @projectx/db to PGlite / plain Postgres. NEVER apply to real Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema if not exists auth;
create schema if not exists extensions;
grant usage on schema public, auth, extensions to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}',
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now()
);

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true), auth.jwt() ->> 'sub'), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(current_setting('request.jwt.claim.role', true), auth.jwt() ->> 'role')
$$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- mimic Supabase default privileges on public (our 0012 migration revokes them again, as it must on real Supabase)
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
