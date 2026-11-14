-- 0001: schema for internal functions, pg_trgm, generic helpers
create schema if not exists app_private;
create extension if not exists pg_trgm with schema extensions;

create or replace function app_private.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function app_private.strip_latex(t text) returns text
language sql immutable as $$
  select btrim(regexp_replace(regexp_replace(coalesce(t, ''), '\\[a-zA-Z]+|[${}^_]', ' ', 'g'), '\s+', ' ', 'g'))
$$;

create or replace function app_private.slugify(t text) returns text
language sql immutable as $$
  select btrim(
    left(
      btrim(regexp_replace(lower(app_private.strip_latex(t)), '[^a-z0-9]+', '-', 'g'), '-'),
      80),
    '-')
$$;

-- Append-only guard. Direct UPDATE/DELETE raises; cascades / FK set-null actions run at trigger depth > 1 and are allowed.
create or replace function app_private.append_only() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'append-only table' using errcode = 'P0001';
end $$;
