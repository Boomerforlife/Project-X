-- 0009: roles, profiles, exam preferences, new-user trigger, helper predicates
create table user_roles (
  user_id uuid not null references auth.users on delete cascade,
  role app_role not null,
  granted_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text check (length(display_name) <= 60),
  timezone text not null default 'Asia/Kolkata',
  target_exam_id uuid references exams on delete set null,
  target_year smallint check (target_year between 2020 and 2100),
  daily_goal_attempts smallint not null default 10 check (daily_goal_attempts between 1 and 500),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_exam_preferences (
  user_id uuid not null references auth.users on delete cascade,
  exam_id uuid not null references exams,
  is_primary boolean not null default false,
  target_year smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, exam_id)
);
create unique index user_exam_preferences_one_primary_uidx on user_exam_preferences (user_id) where is_primary;

do $$
declare t text;
begin
  foreach t in array array['profiles','user_exam_preferences'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app_private.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;

create or replace function app_private.profiles_validate_timezone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'INVALID_TIMEZONE';
  end if;
  return new;
end $$;

create trigger profiles_validate_timezone
  before insert or update of timezone on profiles
  for each row execute function app_private.profiles_validate_timezone();

-- handle_new_user also seeds public.streaks (table created in 0010; plpgsql resolves it at run time only).
create or replace function app_private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_tz text := nullif(new.raw_user_meta_data ->> 'timezone', '');
  v_name text := nullif(left(new.raw_user_meta_data ->> 'display_name', 60), '');
begin
  if v_tz is null or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_tz) then
    v_tz := 'Asia/Kolkata';
  end if;
  insert into public.profiles (id, display_name, timezone) values (new.id, v_name, v_tz)
  on conflict (id) do nothing;
  insert into public.streaks (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();

create or replace function app_private.is_staff(p_user uuid, p_role public.app_role default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = p_user
      and (p_role is null or r.role = p_role or r.role = 'ADMIN')
  )
$$;

create or replace function app_private.is_published_question(p_question uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.questions q where q.id = p_question and q.publication_status = 'PUBLISHED')
$$;
