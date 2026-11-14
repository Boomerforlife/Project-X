-- 0007: job queue, staging questions, official answer keys, pipeline functions
create table pipeline_jobs (
  id uuid primary key default gen_random_uuid(),
  kind job_kind not null,
  idempotency_key text not null unique,
  status job_status not null default 'QUEUED',
  priority int not null default 100,
  payload jsonb not null default '{}',
  result jsonb,
  attempts int not null default 0,
  max_attempts int not null default 5 check (max_attempts between 1 and 20),
  run_after timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz,
  lease_expires_at timestamptz,
  last_error text,
  source_document_id uuid references source_documents on delete set null,
  question_id uuid references questions on delete set null,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index pipeline_jobs_claim_idx on pipeline_jobs (status, kind, priority, run_after) where status in ('QUEUED','RUNNING');
create index pipeline_jobs_question_idx on pipeline_jobs (question_id);
create index pipeline_jobs_source_document_idx on pipeline_jobs (source_document_id);

create table pipeline_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references pipeline_jobs on delete cascade,
  level job_event_level not null,
  stage text,
  message text not null check (length(message) <= 2000),
  data jsonb,
  created_at timestamptz not null default now()
);
create index pipeline_job_events_job_idx on pipeline_job_events (job_id, id);
create trigger pipeline_job_events_append_only
  before update or delete on pipeline_job_events
  for each row execute function app_private.append_only();

create table source_questions (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references source_documents on delete cascade,
  job_id uuid references pipeline_jobs on delete set null,
  question_number text not null,
  external_question_id text,
  page_start int not null,
  page_end int not null,
  status source_question_status not null default 'EXTRACTED',
  normalized jsonb not null,
  normalized_text text not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  extraction_method text not null check (extraction_method in ('TEXT','OCR','MIXED')),
  ocr_mean_confidence real,
  warnings text[] not null default '{}',
  duplicate_of_question_id uuid references questions on delete set null,
  possible_duplicate_of uuid references questions on delete set null,
  duplicate_similarity real,
  promoted_question_id uuid references questions on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_document_id, question_number)
);
create index source_questions_content_hash_idx on source_questions (content_hash);
create index source_questions_doc_status_idx on source_questions (source_document_id, status);
create unique index source_questions_doc_external_uidx on source_questions (source_document_id, external_question_id)
  where external_question_id is not null;

create table official_answer_keys (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references source_documents on delete cascade,
  paper_id uuid not null references exam_papers,
  question_number text,
  external_question_id text,
  raw_answer text not null,
  normalized_answer jsonb not null,
  is_dropped boolean not null default false,
  question_id uuid references questions on delete set null,
  created_at timestamptz not null default now(),
  check (question_number is not null or external_question_id is not null),
  unique nulls not distinct (paper_id, question_number, external_question_id)
);
create index official_answer_keys_paper_idx on official_answer_keys (paper_id);
create index official_answer_keys_question_idx on official_answer_keys (question_id);

alter table questions
  add constraint questions_source_question_fk
  foreign key (source_question_id) references source_questions (id) on delete set null;
alter table question_assets
  add constraint question_assets_source_question_fk
  foreign key (source_question_id) references source_questions (id) on delete set null;
create index question_assets_source_question_idx on question_assets (source_question_id) where source_question_id is not null;

do $$
declare t text;
begin
  foreach t in array array['pipeline_jobs','source_questions'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app_private.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;

-- --------------------------------------------------------------------------------------------
-- Job functions
-- --------------------------------------------------------------------------------------------
create or replace function app_private.enqueue_pipeline_job(
  p_kind public.job_kind,
  p_idempotency_key text,
  p_payload jsonb default '{}',
  p_priority int default 100,
  p_run_after timestamptz default now(),
  p_question_id uuid default null,
  p_source_document_id uuid default null,
  p_created_by uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.pipeline_jobs (kind, idempotency_key, payload, priority, run_after, question_id, source_document_id, created_by)
  values (p_kind, p_idempotency_key, coalesce(p_payload, '{}'::jsonb), coalesce(p_priority, 100), coalesce(p_run_after, now()),
          p_question_id, p_source_document_id, p_created_by)
  on conflict (idempotency_key) do nothing
  returning id into v_id;
  if v_id is null then
    select j.id into v_id from public.pipeline_jobs j where j.idempotency_key = p_idempotency_key;
  end if;
  return v_id;
end $$;

create or replace function app_private.claim_pipeline_job(
  p_worker_id text,
  p_kinds public.job_kind[],
  p_lease_seconds int default 600
) returns setof public.pipeline_jobs
language plpgsql security definer set search_path = '' as $$
declare
  v public.pipeline_jobs;
begin
  loop
    select j.* into v
    from public.pipeline_jobs j
    where (p_kinds is null or j.kind = any (p_kinds))
      and ((j.status = 'QUEUED' and j.run_after <= now())
        or (j.status = 'RUNNING' and j.lease_expires_at < now()))
    order by j.priority, j.run_after, j.created_at
    limit 1
    for update skip locked;

    if not found then
      return;
    end if;

    if v.attempts + 1 > v.max_attempts then
      update public.pipeline_jobs
         set status = 'DEAD', finished_at = now(), locked_by = null, lease_expires_at = null,
             last_error = coalesce(last_error, 'max attempts exceeded')
       where id = v.id;
      continue;
    end if;

    update public.pipeline_jobs
       set status = 'RUNNING', attempts = attempts + 1, locked_by = p_worker_id, locked_at = now(),
           lease_expires_at = now() + make_interval(secs => p_lease_seconds),
           started_at = coalesce(started_at, now())
     where id = v.id
    returning * into v;
    return next v;
    return;
  end loop;
end $$;

create or replace function app_private.heartbeat_pipeline_job(
  p_job_id uuid, p_worker_id text, p_lease_seconds int default 600
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  update public.pipeline_jobs
     set lease_expires_at = now() + make_interval(secs => p_lease_seconds)
   where id = p_job_id and status = 'RUNNING' and locked_by = p_worker_id;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

create or replace function app_private.complete_pipeline_job(
  p_job_id uuid, p_worker_id text, p_result jsonb
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  update public.pipeline_jobs
     set status = 'SUCCEEDED', result = p_result, finished_at = now(), lease_expires_at = null
   where id = p_job_id and status = 'RUNNING' and locked_by = p_worker_id;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

create or replace function app_private.fail_pipeline_job(
  p_job_id uuid, p_worker_id text, p_error text, p_retryable boolean default true
) returns public.job_status
language plpgsql security definer set search_path = '' as $$
declare
  v public.pipeline_jobs;
  v_status public.job_status;
begin
  select j.* into v from public.pipeline_jobs j where j.id = p_job_id for update;
  if not found then
    return null;
  end if;
  if v.status <> 'RUNNING' or v.locked_by is distinct from p_worker_id then
    return v.status;
  end if;
  if coalesce(p_retryable, true) and v.attempts < v.max_attempts then
    update public.pipeline_jobs
       set status = 'QUEUED',
           run_after = now() + make_interval(secs => least(3600, 30 * power(2, v.attempts - 1))),
           locked_by = null, lease_expires_at = null, last_error = left(p_error, 4000)
     where id = p_job_id
    returning status into v_status;
  else
    update public.pipeline_jobs
       set status = 'DEAD', finished_at = now(), locked_by = null, lease_expires_at = null,
           last_error = left(p_error, 4000)
     where id = p_job_id
    returning status into v_status;
  end if;
  return v_status;
end $$;

create or replace function app_private.log_pipeline_job_event(
  p_job_id uuid, p_level public.job_event_level, p_stage text, p_message text, p_data jsonb default null
) returns void
language sql security definer set search_path = '' as $$
  insert into public.pipeline_job_events (job_id, level, stage, message, data)
  values (p_job_id, p_level, p_stage, left(p_message, 2000), p_data)
$$;

create or replace function app_private.find_near_duplicates(
  p_text text, p_threshold real default 0.9, p_limit int default 5
) returns table (question_id uuid, similarity real)
language sql stable security definer set search_path = '' as $$
  select q.id, extensions.similarity(q.dedupe_text, p_text)::real as sim
  from public.questions q
  where q.dedupe_text is not null and extensions.similarity(q.dedupe_text, p_text) >= p_threshold
  order by sim desc
  limit p_limit
$$;

-- --------------------------------------------------------------------------------------------
-- Content helpers used by promotion
-- --------------------------------------------------------------------------------------------
-- plain text of a ContentBlock[] (for question_options.content_text)
create or replace function app_private.blocks_to_text(p_blocks jsonb) returns text
language sql immutable set search_path = '' as $$
  select coalesce(string_agg(
    case b.value ->> 'type'
      when 'paragraph' then b.value ->> 'text'
      when 'math' then '$' || (b.value ->> 'latex') || '$'
      when 'list' then (select string_agg(i.value, ' ') from jsonb_array_elements_text(b.value -> 'items') as i(value))
      when 'table' then (select string_agg(c.value, ' ') from jsonb_array_elements(b.value -> 'rows') as r(value),
                                                         jsonb_array_elements_text(r.value) as c(value))
      else null
    end, ' ' order by b.ord), '')
  from jsonb_array_elements(case when jsonb_typeof(p_blocks) = 'array' then p_blocks else '[]'::jsonb end) with ordinality as b(value, ord)
$$;

-- replaces {"type":"image","asset_ref":"x"} blocks with {"type":"image","asset_id":<uuid>,"alt":...} using normalized.assets;
-- asset ids missing from normalized.assets are looked up in question_assets (source_question_id + sha256).
create or replace function app_private.resolve_content_assets(p_blocks jsonb, p_assets jsonb, p_source_question uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_block jsonb;
  v_asset jsonb;
  v_asset_id uuid;
begin
  if p_blocks is null or jsonb_typeof(p_blocks) <> 'array' then
    return '[]'::jsonb;
  end if;
  for v_block in select value from jsonb_array_elements(p_blocks) loop
    if v_block ->> 'type' = 'image' and v_block ? 'asset_ref' then
      select a.value into v_asset
        from jsonb_array_elements(coalesce(p_assets, '[]'::jsonb)) as a(value)
       where a.value ->> 'asset_ref' = v_block ->> 'asset_ref'
       limit 1;
      v_asset_id := nullif(v_asset ->> 'asset_id', '')::uuid;
      if v_asset_id is null and v_asset is not null then
        select qa.id into v_asset_id from public.question_assets qa
         where qa.source_question_id = p_source_question and qa.sha256 = v_asset ->> 'sha256'
         limit 1;
      end if;
      if v_asset_id is null then
        raise exception 'ASSET_NOT_RESOLVED: %', v_block ->> 'asset_ref';
      end if;
      v_block := jsonb_strip_nulls(jsonb_build_object(
        'type', 'image', 'asset_id', v_asset_id, 'alt', coalesce(v_block ->> 'alt', ''),
        'caption', v_block -> 'caption'));
    end if;
    v_out := v_out || jsonb_build_array(v_block);
  end loop;
  return v_out;
end $$;

-- --------------------------------------------------------------------------------------------
-- promote_source_question
-- --------------------------------------------------------------------------------------------
create or replace function app_private.promote_source_question(
  p_source_question_id uuid, p_exam_id uuid, p_subject_code text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  sq public.source_questions;
  sd public.source_documents;
  src public.sources;
  pap public.exam_papers;
  norm jsonb;
  v_origin public.question_origin;
  v_type public.question_type;
  v_subject_id uuid;
  v_subject_code text;
  v_qid uuid;
  v_content jsonb;
  v_opt jsonb;
  v_opt_content jsonb;
  v_ord int;
begin
  select s.* into sq from public.source_questions s where s.id = p_source_question_id for update;
  if not found then
    raise exception 'SOURCE_QUESTION_NOT_FOUND';
  end if;
  if sq.status = 'PROMOTED' and sq.promoted_question_id is not null then
    return sq.promoted_question_id;
  end if;
  if sq.status <> 'NORMALIZED' or sq.duplicate_of_question_id is not null then
    raise exception 'SOURCE_QUESTION_NOT_PROMOTABLE: status=%', sq.status;
  end if;

  select d.* into sd from public.source_documents d where d.id = sq.source_document_id;
  select s.* into src from public.sources s where s.id = sd.source_id;
  if sd.paper_id is not null then
    select p.* into pap from public.exam_papers p where p.id = sd.paper_id;
  end if;
  norm := sq.normalized;

  v_origin := case src.kind
    when 'OFFICIAL_EXAM_BODY' then 'PYQ'
    when 'LICENSED_PUBLISHER' then 'PYQ'
    when 'EDITORIAL_TEAM' then 'EDITORIAL'
    else 'AI_GENERATED' end;

  v_type := coalesce(
    nullif(norm ->> 'question_type_guess', '')::public.question_type,
    case when jsonb_array_length(coalesce(norm -> 'options', '[]'::jsonb)) = 0
         then 'NUMERICAL'::public.question_type else 'SINGLE_MCQ'::public.question_type end);

  v_subject_code := coalesce(p_subject_code, nullif(norm ->> 'section_hint', ''));
  if v_subject_code is not null then
    select s.id into v_subject_id from public.subjects s where s.exam_id = p_exam_id and s.code = v_subject_code;
  end if;

  v_content := app_private.resolve_content_assets(norm -> 'content', norm -> 'assets', sq.id);
  if jsonb_array_length(v_content) = 0 then
    v_content := jsonb_build_array(jsonb_build_object('type', 'paragraph', 'text', norm ->> 'question_text'));
  end if;

  insert into public.questions (
    exam_id, subject_id, paper_id, origin, question_type, year, shift, session_label, question_number,
    question_text, structured_content, source_id, source_question_id, content_hash, dedupe_text, ingestion_status)
  values (
    p_exam_id, v_subject_id, pap.id, v_origin, v_type, pap.year, pap.shift, pap.session_label, sq.question_number,
    norm ->> 'question_text', v_content, src.id, sq.id, sq.content_hash, sq.normalized_text, 'IMPORTED')
  returning id into v_qid;

  v_ord := 0;
  for v_opt in select value from jsonb_array_elements(coalesce(norm -> 'options', '[]'::jsonb)) loop
    v_opt_content := app_private.resolve_content_assets(v_opt -> 'content', norm -> 'assets', sq.id);
    insert into public.question_options (question_id, label, sort_order, content, content_text, external_option_id)
    values (v_qid, v_opt ->> 'label', v_ord, v_opt_content, app_private.blocks_to_text(v_opt_content),
            nullif(v_opt ->> 'external_option_id', ''));
    v_ord := v_ord + 1;
  end loop;

  update public.question_assets set question_id = v_qid where source_question_id = sq.id;

  update public.source_questions set status = 'PROMOTED', promoted_question_id = v_qid where id = sq.id;

  if sd.paper_id is not null then
    perform app_private.link_official_answer_keys(sd.paper_id);
  end if;

  perform app_private.enqueue_pipeline_job(
    'AI_CLASSIFY', 'AI_CLASSIFY:' || v_qid::text || ':' || sq.content_hash, '{}'::jsonb, 100, now(), v_qid, null, null);

  return v_qid;
end $$;

-- --------------------------------------------------------------------------------------------
-- link_official_answer_keys
-- --------------------------------------------------------------------------------------------
create or replace function app_private.link_official_answer_keys(p_paper_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  k public.official_answer_keys;
  q public.questions;
  v_count int := 0;
  v_kind text;
  v_ids uuid[];
  v_expected int;
  v_key jsonb;
  v_ranges jsonb;
  v_display text;
begin
  for k in select * from public.official_answer_keys where paper_id = p_paper_id order by created_at, id loop
    q := null;
    if k.external_question_id is not null then
      select qq.* into q
        from public.questions qq
        join public.source_questions sq on sq.id = qq.source_question_id
       where qq.paper_id = p_paper_id and sq.external_question_id = k.external_question_id
       limit 1;
    end if;
    if q.id is null and k.question_number is not null then
      select qq.* into q from public.questions qq
       where qq.paper_id = p_paper_id and qq.question_number = k.question_number
       limit 1;
    end if;
    if q.id is null then
      continue;
    end if;

    update public.official_answer_keys set question_id = q.id where id = k.id and question_id is distinct from q.id;

    if q.answer_key_source = 'HUMAN' then
      continue;
    end if;

    v_kind := k.normalized_answer ->> 'kind';
    v_key := null;

    if k.is_dropped or v_kind = 'DROPPED' then
      update public.questions set verification_status = 'HUMAN_REVIEW_REQUIRED' where id = q.id;
      v_count := v_count + 1;
      continue;
    end if;

    if v_kind in ('OPTION_LABELS', 'EXTERNAL_OPTION_IDS') and q.question_type in ('SINGLE_MCQ', 'MULTI_MCQ') then
      if v_kind = 'OPTION_LABELS' then
        select coalesce(array_agg(o.id order by o.id::text), '{}'), count(*) into v_ids, v_expected
          from public.question_options o
         where o.question_id = q.id and o.label in (select jsonb_array_elements_text(k.normalized_answer -> 'labels'));
        v_expected := jsonb_array_length(k.normalized_answer -> 'labels');
      else
        select coalesce(array_agg(o.id order by o.id::text), '{}'), count(*) into v_ids, v_expected
          from public.question_options o
         where o.question_id = q.id and o.external_option_id in (select jsonb_array_elements_text(k.normalized_answer -> 'ids'));
        v_expected := jsonb_array_length(k.normalized_answer -> 'ids');
      end if;
      if coalesce(array_length(v_ids, 1), 0) >= 1 and array_length(v_ids, 1) = v_expected then
        v_key := jsonb_build_object('type', q.question_type::text, 'correct_option_ids', to_jsonb(v_ids));
      end if;
    elsif v_kind = 'NUMERIC' and q.question_type = 'NUMERICAL' then
      select jsonb_agg(jsonb_build_object('min', r.value ->> 'min', 'max', r.value ->> 'max')
                       order by (r.value ->> 'min')::numeric, (r.value ->> 'max')::numeric)
        into v_ranges
        from jsonb_array_elements(k.normalized_answer -> 'accepted_ranges') as r(value);
      if v_ranges is not null then
        v_display := v_ranges -> 0 ->> 'min';
        if (v_ranges -> 0 ->> 'min')::numeric <> (v_ranges -> 0 ->> 'max')::numeric then
          v_display := trim_scale(((v_ranges -> 0 ->> 'min')::numeric + (v_ranges -> 0 ->> 'max')::numeric) / 2)::text;
        end if;
        v_key := jsonb_build_object('type', 'NUMERICAL', 'accepted_ranges', v_ranges, 'display_value', v_display);
      end if;
    end if;

    if v_key is not null then
      update public.questions set answer_key = v_key, answer_key_source = 'OFFICIAL' where id = q.id;
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;
