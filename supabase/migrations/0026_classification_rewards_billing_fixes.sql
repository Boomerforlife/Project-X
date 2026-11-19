-- 0026: question classification metadata, rewarded-ad credits, billing fixes (Owner A).
--
-- ADDITIVE ONLY. Safe on the live database:
--   * new nullable columns (no default => no table rewrite, no existing row is touched),
--   * one NOT NULL column with a constant default on billing_orders (metadata-only change in Postgres 11+),
--   * new tables (RLS on, no client grants: written only by the API with the service role, like 0018),
--   * new indexes on questions (about 7.8k rows on 2026-11-19; builds in well under a second).
-- No UPDATE, DELETE or DROP of anything that exists. Rollback: see the bottom of this file.
--
-- Difficulty: NULL keeps meaning "UNCLASSIFIED". It is deliberately NOT a new enum value: the publication guard
-- (0013/0014/0021) refuses to publish a question whose difficulty is NULL, and an 'UNCLASSIFIED' value would slip past
-- that check. The API and UI show NULL as "Unclassified".

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Who set a question's difficulty, and when. NULL source on a classified row = set before this migration (import).
-- ---------------------------------------------------------------------------------------------------------------------
alter table questions add column if not exists difficulty_source text
  check (difficulty_source is null or difficulty_source in ('ADMIN', 'AI', 'IMPORT'));
alter table questions add column if not exists difficulty_set_by uuid references auth.users on delete set null;
alter table questions add column if not exists difficulty_set_at timestamptz;

-- Keep the provenance honest whichever code path changes difficulty. A writer declares itself for the current transaction
-- with set_config('app.difficulty_source', 'ADMIN'|'AI'|'IMPORT', true) and set_config('app.difficulty_set_by', <uuid>, true);
-- a writer that does not (an older endpoint, a pipeline job) leaves source/by NULL = "not recorded". The time is always set.
create or replace function app_private.questions_difficulty_meta() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_src text := nullif(current_setting('app.difficulty_source', true), '');
  v_by text := nullif(current_setting('app.difficulty_set_by', true), '');
begin
  if new.difficulty is distinct from old.difficulty then
    new.difficulty_set_at := now();
    if new.difficulty is null or v_src is null or v_src not in ('ADMIN', 'AI', 'IMPORT') then
      new.difficulty_source := null;
      new.difficulty_set_by := null;
    else
      new.difficulty_source := v_src;
      new.difficulty_set_by := case when v_by ~ '^[0-9a-f-]{36}$' then v_by::uuid end;
    end if;
  end if;
  return new;
end $$;
revoke all on function app_private.questions_difficulty_meta() from public, anon, authenticated;
drop trigger if exists questions_difficulty_meta on questions;
create trigger questions_difficulty_meta
  before update of difficulty on questions
  for each row execute function app_private.questions_difficulty_meta();

-- Admin classification queue and difficulty/year filters.
create index if not exists questions_exam_unclassified_idx on questions (exam_id, subject_id, year desc) where difficulty is null;
create index if not exists questions_exam_difficulty_idx on questions (exam_id, publication_status, difficulty);
create index if not exists questions_exam_year_paper_idx on questions (exam_id, year desc, paper_id);

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Billing: partial refunds no longer revoke a whole pass.
-- ---------------------------------------------------------------------------------------------------------------------
alter table billing_orders add column if not exists refunded_paise integer not null default 0 check (refunded_paise >= 0);

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Rewarded-ad credits (Google Ad Manager rewarded ads for web).
--
-- Honest limit, recorded here so nobody oversells it: Google offers server-side verification for rewarded ads in apps
-- only. On the web the completion signal is GPT's `rewardedSlotGranted` event in the browser. So a claim is accepted
-- only with a single-use server nonce issued when the student chose to watch, after the rule's minimum time, inside
-- daily and monthly caps. Rewards are deliberately small (one extra full paper) so a forged claim gains little.
-- Rules are data: change amounts, caps or switch a rule off with an UPDATE, no deploy.
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists ad_reward_rules (
  code text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  benefit text not null check (benefit in ('FULL_PAPER_CREDIT')),
  amount integer not null check (amount between 1 and 10),
  daily_cap integer not null check (daily_cap between 0 and 50),
  monthly_cap integer not null check (monthly_cap between 0 and 500),
  min_seconds integer not null default 5 check (min_seconds between 0 and 600),
  label text not null check (char_length(label) between 1 and 80),
  description text not null check (char_length(description) between 1 and 300),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists ad_reward_rules_updated_at on ad_reward_rules;
create trigger ad_reward_rules_updated_at before update on ad_reward_rules
  for each row execute function app_private.set_updated_at();

create table if not exists ad_reward_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  rule_code text not null references ad_reward_rules,
  nonce text not null unique check (char_length(nonce) >= 32),
  status text not null default 'ISSUED' check (status in ('ISSUED', 'GRANTED', 'NOT_GRANTED')),
  benefit text not null,
  amount integer not null check (amount > 0),
  -- First day of the month in IST (same period as billing_full_paper_usage).
  period date not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  outcome text check (outcome is null or char_length(outcome) <= 40)
);
create index if not exists ad_reward_claims_user_idx on ad_reward_claims (user_id, rule_code, issued_at desc);
create index if not exists ad_reward_claims_granted_idx on ad_reward_claims (user_id, benefit, period) where status = 'GRANTED';

alter table ad_reward_rules enable row level security;
alter table ad_reward_claims enable row level security;
revoke all on ad_reward_rules from anon, authenticated;
revoke all on ad_reward_claims from anon, authenticated;

insert into ad_reward_rules (code, benefit, amount, daily_cap, monthly_cap, min_seconds, label, description, sort_order) values
  ('extra_full_paper', 'FULL_PAPER_CREDIT', 1, 1, 3, 5,
   'One extra full paper',
   'Watch one short ad to unlock one more full paper this month. Optional: closing the ad early just means no reward.', 10)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------------------------------------------------
-- Rollback (manual, only if this migration must be undone; drops nothing that existed before 0026):
--   drop table if exists ad_reward_claims; drop table if exists ad_reward_rules;
--   alter table billing_orders drop column if exists refunded_paise;
--   drop trigger if exists questions_difficulty_meta on questions; drop function if exists app_private.questions_difficulty_meta();
--   drop index if exists questions_exam_unclassified_idx, questions_exam_difficulty_idx, questions_exam_year_paper_idx;
--   alter table questions drop column if exists difficulty_set_at, drop column if exists difficulty_set_by,
--     drop column if exists difficulty_source;
-- ---------------------------------------------------------------------------------------------------------------------
