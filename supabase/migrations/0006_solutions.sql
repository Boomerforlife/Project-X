-- 0006: versioned, immutable solutions
create table solution_versions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions on delete cascade,
  version int not null,
  final_answer jsonb not null,
  summary text check (length(summary) <= 2000),
  steps jsonb not null check (jsonb_typeof(steps) = 'array'),
  formulas jsonb not null default '[]' check (jsonb_typeof(formulas) = 'array'),
  concepts text[] not null default '{}',
  alternatives jsonb not null default '[]' check (jsonb_typeof(alternatives) = 'array'),
  shortcuts jsonb not null default '[]' check (jsonb_typeof(shortcuts) = 'array'),
  common_mistakes jsonb not null default '[]' check (jsonb_typeof(common_mistakes) = 'array'),
  sympy_checks jsonb not null default '[]' check (jsonb_typeof(sympy_checks) = 'array'),
  provenance solution_provenance not null,
  ai_run_id uuid,
  based_on_version_id uuid references solution_versions on delete set null,
  author_id uuid references auth.users on delete set null,
  edit_note text,
  review_status solution_review_status not null default 'PENDING',
  reviewed_by uuid references auth.users on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (question_id, version)
);

create index solution_versions_question_version_idx on solution_versions (question_id, version desc);

alter table questions
  add constraint questions_current_solution_fk
  foreign key (current_solution_id) references solution_versions (id)
  on delete set null deferrable initially deferred;

alter table question_assets
  add constraint question_assets_solution_version_fk
  foreign key (solution_version_id) references solution_versions (id) on delete cascade;

create or replace function app_private.solution_versions_assign_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.questions q where q.id = new.question_id for update;
  select coalesce(max(sv.version), 0) + 1 into new.version
  from public.solution_versions sv where sv.question_id = new.question_id;
  return new;
end $$;

create trigger solution_versions_assign_version
  before insert on solution_versions
  for each row execute function app_private.solution_versions_assign_version();

-- Only review_status / reviewed_by / reviewed_at may change. Deletion only as part of a cascade (trigger depth > 1).
-- FK actions (ON DELETE SET NULL on ai_run_id / author_id / based_on_version_id / reviewed_by) run at depth > 1 and are tolerated.
create or replace function app_private.solution_versions_immutable() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception 'SOLUTION_IMMUTABLE: solution versions cannot be deleted';
  end if;

  v_old := to_jsonb(old) - 'review_status' - 'reviewed_by' - 'reviewed_at';
  v_new := to_jsonb(new) - 'review_status' - 'reviewed_by' - 'reviewed_at';
  if pg_trigger_depth() > 1 then
    v_old := v_old - 'ai_run_id' - 'author_id' - 'based_on_version_id';
    v_new := v_new - 'ai_run_id' - 'author_id' - 'based_on_version_id';
  end if;
  if v_old is distinct from v_new then
    raise exception 'SOLUTION_IMMUTABLE: only review_status, reviewed_by, reviewed_at may change';
  end if;
  return new;
end $$;

create trigger solution_versions_immutable_update
  before update on solution_versions
  for each row execute function app_private.solution_versions_immutable();
create trigger solution_versions_immutable_delete
  before delete on solution_versions
  for each row execute function app_private.solution_versions_immutable();
