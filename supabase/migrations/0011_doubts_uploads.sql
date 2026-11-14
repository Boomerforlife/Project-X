-- 0011: user uploads and doubts
create table user_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  purpose upload_purpose not null,
  bucket storage_bucket not null default 'USER_UPLOADS' check (bucket = 'USER_UPLOADS'),
  r2_key text not null unique,
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')),
  bytes int not null check (bytes between 1 and 5242880),
  sha256 text not null,
  status upload_status not null default 'CONFIRMED',
  created_at timestamptz not null default now()
);
create index user_uploads_user_created_idx on user_uploads (user_id, created_at desc);

create table doubts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete set null,
  question_id uuid references questions on delete set null,
  body text not null check (length(body) between 1 and 4000),
  upload_id uuid references user_uploads on delete set null,
  status doubt_status not null default 'OPEN',
  is_public boolean not null default false,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index doubts_user_created_idx on doubts (user_id, created_at desc);
create index doubts_status_created_idx on doubts (status, created_at);
create index doubts_ip_created_idx on doubts (ip_hash, created_at);

create trigger doubts_set_updated_at
  before update on doubts
  for each row execute function app_private.set_updated_at();

create or replace function app_private.doubts_never_auto_public() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.is_public := false;
  elsif new.is_public and not old.is_public
        and coalesce(current_setting('app.actor_role', true), '') <> 'ADMIN' then
    raise exception 'DOUBT_PUBLIC_REQUIRES_ADMIN';
  end if;
  return new;
end $$;

create trigger doubts_never_auto_public
  before insert or update of is_public on doubts
  for each row execute function app_private.doubts_never_auto_public();
