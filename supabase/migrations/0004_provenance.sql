-- 0004: sources, exam papers, source documents
create table sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name text not null,
  kind source_kind not null,
  publisher text,
  homepage_url text,
  license_name text,
  license_url text,
  reuse_permitted boolean not null default false,
  attribution_text text,
  approved_by uuid references auth.users on delete set null,
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_approval_requires_reuse check (approved_at is null or reuse_permitted)
);

create table exam_papers (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams,
  slug text not null unique,
  title text not null,
  year smallint not null check (year between 1978 and 2100),
  session_label text,
  exam_date date,
  shift smallint check (shift between 1 and 4),
  paper_code text,
  language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_papers_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  unique nulls not distinct (exam_id, exam_date, shift, paper_code, language)
);

create table source_documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources,
  paper_id uuid references exam_papers,
  kind source_document_kind not null,
  bucket storage_bucket not null default 'SOURCE_DOCS' check (bucket = 'SOURCE_DOCS'),
  r2_key text not null unique,
  original_filename text not null,
  mime_type text not null check (mime_type in ('application/pdf','text/html','image/png','image/jpeg')),
  bytes bigint not null check (bytes > 0),
  sha256 text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  page_count int,
  uploaded_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create index exam_papers_exam_idx on exam_papers (exam_id, year);
create index source_documents_source_idx on source_documents (source_id);
create index source_documents_paper_idx on source_documents (paper_id) where paper_id is not null;

create or replace function app_private.source_documents_require_approved_source() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.sources s
    where s.id = new.source_id and s.reuse_permitted and s.approved_at is not null
  ) then
    raise exception 'SOURCE_NOT_APPROVED';
  end if;
  return new;
end $$;

create trigger source_documents_require_approved_source
  before insert on source_documents
  for each row execute function app_private.source_documents_require_approved_source();

do $$
declare t text;
begin
  foreach t in array array['sources','exam_papers'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app_private.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;
