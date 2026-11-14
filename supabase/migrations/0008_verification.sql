-- 0008: AI runs, verification runs/checks, review events, audit log, usage counters
create table ai_runs (
  id uuid primary key default gen_random_uuid(),
  task ai_task not null,
  question_id uuid references questions on delete cascade,
  solution_version_id uuid references solution_versions on delete set null,
  job_id uuid references pipeline_jobs on delete set null,
  provider text not null check (provider in ('gemini','mock')),
  model text not null,
  prompt_id text not null,
  prompt_version text not null,
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  status ai_run_status not null,
  output jsonb,
  error text,
  input_tokens int,
  output_tokens int,
  cost_usd_micros bigint not null default 0,
  latency_ms int,
  created_at timestamptz not null default now()
);
create unique index ai_runs_task_input_succeeded_uidx on ai_runs (task, input_hash) where status = 'SUCCEEDED';
create index ai_runs_question_task_idx on ai_runs (question_id, task, created_at desc);
create index ai_runs_created_idx on ai_runs (created_at);

alter table solution_versions
  add constraint solution_versions_ai_run_fk
  foreign key (ai_run_id) references ai_runs (id) on delete set null;

create table verification_runs (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions on delete cascade,
  solution_version_id uuid references solution_versions on delete set null,
  job_id uuid references pipeline_jobs on delete set null,
  rules_version text not null,
  outcome verification_outcome,
  resulting_status verification_status,
  reasons text[] not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index verification_runs_question_idx on verification_runs (question_id, started_at desc);

create table verification_checks (
  id uuid primary key default gen_random_uuid(),
  verification_run_id uuid not null references verification_runs on delete cascade,
  kind check_kind not null,
  result check_result not null,
  details jsonb not null default '{}',
  ai_run_id uuid references ai_runs on delete set null,
  created_at timestamptz not null default now(),
  unique (verification_run_id, kind)
);

create table review_events (
  id bigint generated always as identity primary key,
  question_id uuid not null references questions on delete cascade,
  solution_version_id uuid references solution_versions on delete set null,
  actor_id uuid references auth.users on delete set null,
  action review_action not null,
  from_verification_status verification_status,
  to_verification_status verification_status,
  from_publication_status publication_status,
  to_publication_status publication_status,
  note text check (length(note) <= 4000),
  created_at timestamptz not null default now()
);
create index review_events_question_idx on review_events (question_id, id desc);
create trigger review_events_append_only
  before update or delete on review_events
  for each row execute function app_private.append_only();

create table audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_type text not null check (actor_type in ('USER','ADMIN','SYSTEM','WORKER')),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  request_id text,
  ip_hash text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on audit_log (entity_type, entity_id, id desc);
create index audit_log_created_idx on audit_log (created_at);
create trigger audit_log_append_only
  before update or delete on audit_log
  for each row execute function app_private.append_only();

create table usage_counters (
  day date not null,
  metric text not null check (metric ~ '^[a-z0-9_.]+$'),
  value bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, metric)
);
create trigger usage_counters_set_updated_at
  before update on usage_counters
  for each row execute function app_private.set_updated_at();
