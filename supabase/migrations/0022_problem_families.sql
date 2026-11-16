-- 0022: LeetCode-style problem set.
-- A "problem" is a family of questions that differ only in their numbers (template variants), plus every one-off
-- question as a family of one. Families get a stable number (#1, #2, ...), a short title, a difficulty, a premium tier
-- and live counters. Counters and each student's status are kept current by a trigger on attempts, so the problem list
-- never scans attempts and no AI or heavy query runs per request.

create sequence question_family_number_seq;

create table question_families (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique default nextval('question_family_number_seq'),
  exam_id uuid not null references exams,
  subject_id uuid not null references subjects,
  chapter_id uuid not null references chapters,
  title text not null check (length(title) between 1 and 120),
  signature text not null,
  difficulty difficulty,
  access_tier access_tier not null default 'FREE',
  attempts integer not null default 0 check (attempts >= 0),
  attempters integer not null default 0 check (attempters >= 0),
  solvers integer not null default 0 check (solvers >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter sequence question_family_number_seq owned by question_families.number;
create index question_families_chapter_idx on question_families (chapter_id);
create index question_families_sig_trgm on question_families using gin (signature extensions.gin_trgm_ops);
create trigger question_families_updated_at before update on question_families
  for each row execute function app_private.set_updated_at();

alter table questions add column family_id uuid references question_families on delete set null;
create index questions_family_idx on questions (family_id) where family_id is not null;

create table user_family_status (
  user_id uuid not null references auth.users on delete cascade,
  family_id uuid not null references question_families on delete cascade,
  attempts integer not null default 0,
  first_attempt_at timestamptz not null,
  last_attempt_at timestamptz not null,
  solved_at timestamptz,
  primary key (user_id, family_id)
);
create index user_family_status_family_idx on user_family_status (family_id);

-- Numbers in a stem are what varies between template variants, so they are masked before comparing.
create or replace function app_private.question_signature(t text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(lower(coalesce(t, '')), '[0-9]+(\.[0-9]+)?', '#', 'g')
$$;

-- Short display title: first sentence (or first ~12 words) of the stem, LaTeX stripped, at most 90 chars.
create or replace function app_private.problem_title(t text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(btrim(left(regexp_replace(
           split_part(btrim(regexp_replace(app_private.strip_latex(t), '\s+', ' ', 'g')), '. ', 1),
           '[\s,:;-]+$', ''), 90)), ''), 'Untitled problem')
$$;

-- Join the most similar family in the same chapter (trigram similarity > 0.8 on the masked stem) or start a new one.
create or replace function app_private.family_for(
  p_exam uuid, p_subject uuid, p_chapter uuid, p_text text, p_difficulty public.difficulty
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_sig text := app_private.question_signature(p_text);
  v_id uuid;
begin
  select f.id into v_id
    from public.question_families f
   where f.chapter_id = p_chapter and extensions.similarity(f.signature, v_sig) > 0.8
   order by extensions.similarity(f.signature, v_sig) desc, f.number
   limit 1;
  if v_id is null then
    insert into public.question_families (exam_id, subject_id, chapter_id, title, signature, difficulty)
    values (p_exam, p_subject, p_chapter, app_private.problem_title(p_text), v_sig, p_difficulty)
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function app_private.questions_assign_family() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.family_id is null and new.chapter_id is not null and new.subject_id is not null then
    new.family_id := app_private.family_for(new.exam_id, new.subject_id, new.chapter_id, new.question_text, new.difficulty);
  end if;
  return new;
end $$;
create trigger questions_assign_family
  before insert or update of chapter_id, subject_id, question_text on questions
  for each row execute function app_private.questions_assign_family();

-- Per-attempt counters (runs after the existing attempts_after_insert trigger; independent of it).
create or replace function app_private.attempts_family_stats() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_family uuid;
  v_first boolean := false;
  v_prev_solved timestamptz;
begin
  select q.family_id into v_family from public.questions q where q.id = new.question_id;
  if v_family is null then return null; end if;

  insert into public.user_family_status (user_id, family_id, attempts, first_attempt_at, last_attempt_at)
  values (new.user_id, v_family, 0, new.submitted_at, new.submitted_at)
  on conflict (user_id, family_id) do nothing
  returning true into v_first;

  -- Row lock serializes concurrent attempts by the same student on the same problem.
  select s.solved_at into v_prev_solved from public.user_family_status s
   where s.user_id = new.user_id and s.family_id = v_family for update;

  update public.user_family_status s
     set attempts = s.attempts + 1,
         last_attempt_at = greatest(s.last_attempt_at, new.submitted_at),
         solved_at = coalesce(s.solved_at, case when new.is_correct then new.submitted_at end)
   where s.user_id = new.user_id and s.family_id = v_family;

  update public.question_families f
     set attempts = f.attempts + 1,
         attempters = f.attempters + case when coalesce(v_first, false) then 1 else 0 end,
         solvers = f.solvers + case when new.is_correct and v_prev_solved is null then 1 else 0 end
   where f.id = v_family;
  return null;
end $$;
create trigger attempts_family_stats
  after insert on attempts
  for each row execute function app_private.attempts_family_stats();

-- ---------------------------------------------------------------------------------------------------- backfill
-- Assign families to existing questions in a tidy order (subject, chapter, oldest first) so numbers read naturally.
do $$
declare r record;
begin
  for r in
    select q.id, q.exam_id, q.subject_id, q.chapter_id, q.question_text, q.difficulty
      from public.questions q
      join public.subjects s on s.id = q.subject_id
      join public.chapters c on c.id = q.chapter_id
     where q.family_id is null
     order by s.sort_order, c.sort_order, q.created_at, q.id
  loop
    update public.questions
       set family_id = app_private.family_for(r.exam_id, r.subject_id, r.chapter_id, r.question_text, r.difficulty)
     where id = r.id;
  end loop;
end $$;

-- Family difficulty = the most common member difficulty (ties go to the harder label).
update question_families f set difficulty = d.difficulty
  from (
    select distinct on (family_id) family_id, difficulty
      from (select family_id, difficulty, count(*) n from questions
             where family_id is not null and difficulty is not null group by 1, 2) x
     order by family_id, n desc, difficulty desc
  ) d
 where d.family_id = f.id;

-- Counters and status from any attempts that already exist.
insert into user_family_status (user_id, family_id, attempts, first_attempt_at, last_attempt_at, solved_at)
select a.user_id, q.family_id, count(*), min(a.submitted_at), max(a.submitted_at), min(a.submitted_at) filter (where a.is_correct)
  from attempts a join questions q on q.id = a.question_id
 where q.family_id is not null
 group by a.user_id, q.family_id
on conflict do nothing;
update question_families f set
  attempts = coalesce(x.attempts, 0), attempters = coalesce(x.attempters, 0), solvers = coalesce(x.solvers, 0)
  from (select family_id, sum(attempts)::int attempts, count(*)::int attempters, count(solved_at)::int solvers
          from user_family_status group by family_id) x
 where x.family_id = f.id;

-- ---------------------------------------------------------------------------------------------------- access
-- Served only through the API on its service connection (same pattern as the content tables in 0012).
alter table question_families enable row level security;
alter table user_family_status enable row level security;
revoke all on question_families, user_family_status from anon, authenticated;
revoke all on sequence question_family_number_seq from anon, authenticated;
revoke all on function app_private.family_for(uuid, uuid, uuid, text, public.difficulty) from public, anon, authenticated;
revoke all on function app_private.questions_assign_family() from public, anon, authenticated;
revoke all on function app_private.attempts_family_stats() from public, anon, authenticated;
revoke all on function app_private.question_signature(text) from public, anon, authenticated;
revoke all on function app_private.problem_title(text) from public, anon, authenticated;
