-- 0024: Study plans (Tabby Plus). A plan is built from a diagnostic session by the pure @projectx/plans algorithm in the API.
-- Days are stored as jsonb because the plan is re-planned on read (days before today and started items are frozen, the rest
-- is regenerated), so per-item rows would churn on every read. `item_sessions` maps an item key to the practice session it
-- started; completion is derived from that session, never from client input.
-- Diagnostic sessions are ordinary practice_sessions rows (mode MIXED, ui_mode test) with filters.diagnostic = true.

create table study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  exam_id uuid not null references exams,
  client_request_id uuid not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
  diagnostic_session_id uuid not null references practice_sessions on delete restrict,
  chapter_ids uuid[] not null check (cardinality(chapter_ids) between 1 and 200),
  starts_on date not null,
  days smallint not null check (days in (7, 14)),
  daily_minutes smallint not null check (daily_minutes in (30, 60, 90, 120)),
  seed text not null check (length(seed) between 1 and 200),
  plan_days jsonb not null,
  item_sessions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_request_id)
);
-- One active plan per student per exam; starting a new one archives the old (never deletes).
create unique index study_plans_one_active on study_plans (user_id, exam_id) where status = 'ACTIVE';
create index study_plans_user_idx on study_plans (user_id, created_at desc);
create trigger study_plans_updated_at before update on study_plans
  for each row execute function app_private.set_updated_at();

-- Served only through the API on its service connection (same pattern as 0012 / 0022).
alter table study_plans enable row level security;
revoke all on study_plans from anon, authenticated;
