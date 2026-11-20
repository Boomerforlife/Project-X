-- 0029: per-paper marking rules for full previous-year papers (owner decision 2026-11-20).
--
--  1. exam_papers.numerical_negative_marks: the negative mark of every NUMERICAL question of the paper (null = keep
--     each question's own). JEE Main 2021 numericals had no negative marking: 0. Existing questions are corrected and a
--     trigger applies the paper's value to questions inserted later (re-imports).
--  2. exam_papers.numerical_counted_per_subject: in a full-paper session only the best N numerical scores per subject
--     count (null = all count). JEE Main 2021 and 2024 printed 10 numericals per subject of which 5 count: 5.
--     A trigger recomputes the session score after every attempt in such a session. Per-question scores are unchanged.

alter table public.exam_papers
  add column if not exists numerical_negative_marks numeric(5,2) check (numerical_negative_marks >= 0),
  add column if not exists numerical_counted_per_subject smallint check (numerical_counted_per_subject > 0);

update public.exam_papers p set numerical_negative_marks = 0
 where p.slug like 'jee-main-2021-%' and p.numerical_negative_marks is distinct from 0;
update public.exam_papers p set numerical_counted_per_subject = 5
 where (p.slug like 'jee-main-2021-%' or p.slug like 'jee-main-2024-%') and p.numerical_counted_per_subject is distinct from 5;

update public.questions q set negative_marks = p.numerical_negative_marks
  from public.exam_papers p
 where q.paper_id = p.id and q.question_type = 'NUMERICAL' and p.numerical_negative_marks is not null
   and q.negative_marks is distinct from p.numerical_negative_marks;

create or replace function app_private.questions_paper_marking() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v numeric(5,2);
begin
  if new.paper_id is not null and new.question_type = 'NUMERICAL' then
    select p.numerical_negative_marks into v from public.exam_papers p where p.id = new.paper_id;
    if v is not null then new.negative_marks := v; end if;
  end if;
  return new;
end $$;
revoke all on function app_private.questions_paper_marking() from public, anon, authenticated;
drop trigger if exists questions_paper_marking on public.questions;
create trigger questions_paper_marking
  before insert or update of paper_id, question_type, negative_marks on public.questions
  for each row execute function app_private.questions_paper_marking();

-- Runs after attempts_after_insert and attempts_family_stats (triggers fire in name order), which add the attempt's
-- score to the running total; for a capped paper this replaces the total with the capped sum.
create or replace function app_private.attempts_zz_paper_score() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_cap smallint;
begin
  if new.session_id is null then return null; end if;
  select p.numerical_counted_per_subject into v_cap
    from public.practice_sessions s join public.exam_papers p on p.id = s.paper_id
   where s.id = new.session_id and s.mode = 'PYQ_PAPER';
  if v_cap is null then return null; end if;
  update public.practice_sessions ps
     set score = (
       select coalesce(sum(x.score) filter (where x.question_type <> 'NUMERICAL' or x.rn <= v_cap), 0)
         from (select a.score, q.question_type,
                      row_number() over (partition by q.subject_id, q.question_type = 'NUMERICAL'
                                         order by a.score desc, a.submitted_at, a.id) as rn
                 from public.attempts a join public.questions q on q.id = a.question_id
                where a.session_id = new.session_id) x)
   where ps.id = new.session_id;
  return null;
end $$;
revoke all on function app_private.attempts_zz_paper_score() from public, anon, authenticated;
drop trigger if exists attempts_zz_paper_score on public.attempts;
create trigger attempts_zz_paper_score
  after insert on public.attempts
  for each row execute function app_private.attempts_zz_paper_score();
