-- 0003: exams -> subjects -> chapters -> topics
create table exams (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]*$'),
  slug text not null unique,
  name text not null,
  short_name text not null,
  description text,
  is_active boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exams_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table subjects (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams,
  code text not null check (code in ('PHYSICS','CHEMISTRY','MATHEMATICS','BIOLOGY','BOTANY','ZOOLOGY')),
  slug text not null unique,
  segment text not null,
  name text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, code),
  unique (exam_id, segment),
  constraint subjects_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint subjects_segment_format check (segment ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table chapters (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects,
  slug text not null unique,
  segment text not null,
  name text not null,
  unit_number smallint,
  class_level smallint check (class_level in (11,12)),
  description text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, segment),
  constraint chapters_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint chapters_segment_format check (segment ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table topics (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters,
  slug text not null unique,
  segment text not null,
  name text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chapter_id, segment),
  constraint topics_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint topics_segment_format check (segment ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index subjects_exam_sort_idx on subjects (exam_id, sort_order);
create index chapters_subject_sort_idx on chapters (subject_id, sort_order);
create index topics_chapter_sort_idx on topics (chapter_id, sort_order);

do $$
declare t text;
begin
  foreach t in array array['exams','subjects','chapters','topics'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app_private.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;
