-- 0005: questions, options, assets, slug redirects + question triggers
-- (FKs to solution_versions / source_questions are added in 0006 / 0007)
create table questions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  exam_id uuid not null references exams,
  subject_id uuid references subjects,
  chapter_id uuid references chapters,
  topic_id uuid references topics,
  paper_id uuid references exam_papers,
  origin question_origin not null,
  question_type question_type not null,
  marking_scheme marking_scheme not null default 'STANDARD',
  difficulty difficulty,
  marks numeric(5,2) not null default 4 check (marks > 0),
  negative_marks numeric(5,2) not null default 1 check (negative_marks >= 0),
  year smallint check (year between 1978 and 2100),
  shift smallint check (shift between 1 and 4),
  session_label text,
  question_number text,
  question_text text not null check (length(question_text) between 1 and 20000),
  structured_content jsonb not null check (jsonb_typeof(structured_content) = 'array'),
  answer_key jsonb check (answer_key is null or jsonb_typeof(answer_key) = 'object'),
  answer_key_source answer_key_source,
  source_id uuid references sources,
  source_question_id uuid unique,
  content_hash text,
  dedupe_text text,
  ingestion_status ingestion_status not null default 'IMPORTED',
  verification_status verification_status not null default 'PENDING',
  publication_status publication_status not null default 'DRAFT',
  indexability indexability not null default 'AUTO',
  sitemap_include boolean not null default false,
  access_tier access_tier not null default 'FREE',
  current_solution_id uuid,
  seo_title text check (length(seo_title) <= 70),
  seo_description text check (length(seo_description) <= 170),
  search_tsv tsvector,
  is_indexable boolean generated always as (
    publication_status = 'PUBLISHED' and indexability = 'AUTO'
    and verification_status in ('OFFICIAL_KEY_MATCHED', 'HUMAN_VERIFIED') and current_solution_id is not null
  ) stored,
  row_version int not null default 1,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  first_published_at timestamptz,
  archived_at timestamptz,
  constraint questions_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 120),
  constraint questions_pyq_requires_source check (origin <> 'PYQ' or source_id is not null),
  constraint questions_answer_key_source_pair check ((answer_key is null) = (answer_key_source is null))
);

create table question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions on delete cascade,
  label text not null check (label in ('A','B','C','D','E')),
  sort_order smallint not null check (sort_order between 0 and 9),
  content jsonb not null check (jsonb_typeof(content) = 'array'),
  content_text text not null,
  external_option_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, label),
  unique (question_id, sort_order)
);

create table question_assets (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references questions on delete cascade,
  solution_version_id uuid,
  source_question_id uuid,
  kind asset_kind not null,
  bucket storage_bucket not null check (bucket in ('SOURCE_DOCS','PUBLIC_ASSETS')),
  r2_key text not null,
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')),
  width int check (width > 0),
  height int check (height > 0),
  bytes int check (bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  alt_text text,
  created_at timestamptz not null default now(),
  unique (bucket, r2_key),
  constraint question_assets_owner check (num_nonnulls(question_id, solution_version_id, source_question_id) >= 1)
);

create table slug_redirects (
  old_slug text primary key check (old_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  question_id uuid not null references questions on delete cascade,
  created_at timestamptz not null default now()
);

create index questions_chapter_pub_diff_idx on questions (chapter_id, publication_status, difficulty);
create index questions_subject_pub_idx on questions (subject_id, publication_status);
create index questions_topic_idx on questions (topic_id) where topic_id is not null;
create index questions_paper_number_idx on questions (paper_id, question_number);
create index questions_verification_updated_idx on questions (verification_status, updated_at desc);
create index questions_pub_published_at_idx on questions (publication_status, published_at desc);
create index questions_sitemap_idx on questions (is_indexable, sitemap_include, updated_at) where is_indexable and sitemap_include;
create index questions_search_tsv_idx on questions using gin (search_tsv);
create index questions_dedupe_trgm_idx on questions using gin (dedupe_text extensions.gin_trgm_ops);
create index questions_content_hash_idx on questions (content_hash);
create index question_options_question_idx on question_options (question_id);
create index question_assets_question_idx on question_assets (question_id);
create index question_assets_sha256_idx on question_assets (sha256);
create index slug_redirects_question_idx on slug_redirects (question_id);

-- --------------------------------------------------------------------------------------------
-- questions_before_write: slug, taxonomy consistency, FTS, row_version, publication timestamps
-- --------------------------------------------------------------------------------------------
create or replace function app_private.questions_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_exam_slug text;
  v_base text;
  v_cand text;
  v_n int := 1;
  v_exam_of_subject uuid;
  v_subject_of_chapter uuid;
  v_chapter_of_topic uuid;
begin
  -- 1. slug
  if tg_op = 'INSERT' then
    if new.slug is null then
      v_base := app_private.slugify(
        array_to_string((regexp_split_to_array(btrim(app_private.strip_latex(new.question_text)), '\s+'))[1:12], ' '));
      if new.year is not null then
        select e.slug into v_exam_slug from public.exams e where e.id = new.exam_id;
        if v_exam_slug is not null then
          v_base := nullif(v_base, '');
          v_base := coalesce(v_base, 'question') || '-' || v_exam_slug || '-' || new.year::text;
        end if;
      end if;
      v_base := coalesce(nullif(v_base, ''), 'question');
      v_base := btrim(left(v_base, 100), '-');
      v_cand := v_base;
      while exists (select 1 from public.questions q where q.slug = v_cand)
         or exists (select 1 from public.slug_redirects r where r.old_slug = v_cand) loop
        v_n := v_n + 1;
        v_cand := v_base || '-' || v_n::text;
      end loop;
      new.slug := v_cand;
    end if;
  elsif new.slug is distinct from old.slug then
    if old.first_published_at is not null
       and coalesce(current_setting('app.allow_slug_change', true), '') <> 'on' then
      raise exception 'SLUG_LOCKED';
    end if;
  end if;

  -- 2. taxonomy consistency
  if new.chapter_id is not null then
    select c.subject_id into v_subject_of_chapter from public.chapters c where c.id = new.chapter_id;
    if new.subject_id is null then
      new.subject_id := v_subject_of_chapter;
    end if;
  end if;
  if new.subject_id is not null then
    select s.exam_id into v_exam_of_subject from public.subjects s where s.id = new.subject_id;
    if v_exam_of_subject is distinct from new.exam_id then
      raise exception 'TAXONOMY_MISMATCH: subject does not belong to exam';
    end if;
  end if;
  if new.chapter_id is not null and v_subject_of_chapter is distinct from new.subject_id then
    raise exception 'TAXONOMY_MISMATCH: chapter does not belong to subject';
  end if;
  if new.topic_id is not null then
    select t.chapter_id into v_chapter_of_topic from public.topics t where t.id = new.topic_id;
    if v_chapter_of_topic is distinct from new.chapter_id then
      raise exception 'TAXONOMY_MISMATCH: topic does not belong to chapter';
    end if;
  end if;

  -- 3. full-text search vector
  new.search_tsv :=
    setweight(to_tsvector('english', coalesce(new.seo_title, '')), 'A')
    || setweight(to_tsvector('english', app_private.strip_latex(new.question_text)), 'B');

  -- 4. row_version
  if tg_op = 'UPDATE' then
    new.row_version := old.row_version + 1;
  end if;

  -- 5. publication timestamps
  if tg_op = 'INSERT' then
    if new.publication_status = 'PUBLISHED' then
      new.published_at := now();
      new.first_published_at := coalesce(new.first_published_at, now());
    elsif new.publication_status = 'ARCHIVED' then
      new.archived_at := now();
    end if;
  else
    if new.publication_status = 'PUBLISHED' and old.publication_status <> 'PUBLISHED' then
      new.published_at := now();
      new.first_published_at := coalesce(new.first_published_at, now());
    end if;
    if new.publication_status = 'ARCHIVED' and old.publication_status <> 'ARCHIVED' then
      new.archived_at := now();
    end if;
    if old.publication_status = 'PUBLISHED' and new.publication_status <> 'PUBLISHED' then
      new.published_at := null;
    end if;
  end if;

  return new;
end $$;

create trigger questions_before_write
  before insert or update on questions
  for each row execute function app_private.questions_before_write();

create or replace function app_private.questions_after_slug_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.slug_redirects (old_slug, question_id) values (old.slug, new.id)
  on conflict (old_slug) do update set question_id = excluded.question_id;
  delete from public.slug_redirects where old_slug = new.slug;
  return null;
end $$;

create trigger questions_after_slug_change
  after update of slug on questions
  for each row when (old.slug is distinct from new.slug)
  execute function app_private.questions_after_slug_change();

do $$
declare t text;
begin
  foreach t in array array['questions','question_options'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app_private.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;
