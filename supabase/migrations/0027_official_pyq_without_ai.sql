-- 0027: publish official-key previous-year questions without AI (owner decision 2026-11-20, docs/CONTENT_SOURCES.md).
-- Additive; changes no rows.
--  1. Publication guard: an OFFICIAL_KEY_MATCHED PYQ may publish with difficulty null (rated later from attempts).
--  2. Problem families: previous-year questions are unique exam items, not variant families, and their text is OCR from
--     an image crop (unfit for a library title). They no longer join families; existing families are unaffected.
--  3. difficulty_source gains 'STATS' (difficulty measured from students' attempts).

create or replace function app_private.question_publish_violation(q public.questions) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_final jsonb;
  v_review public.solution_review_status;
  v_sol_question uuid;
  v_options int;
  v_bad int;
begin
  -- AI-generated practice items may publish on AUTOMATED_CHECKS_PASSED (shown to students as "AI-checked");
  -- PYQ and editorial items still need an official-key match or a human reviewer.
  if not (q.verification_status in ('OFFICIAL_KEY_MATCHED', 'HUMAN_VERIFIED')
          or (q.origin = 'AI_GENERATED' and q.verification_status = 'AUTOMATED_CHECKS_PASSED')) then
    return 'verification_status must be OFFICIAL_KEY_MATCHED or HUMAN_VERIFIED (AUTOMATED_CHECKS_PASSED allowed for AI_GENERATED)';
  end if;
  -- 0021: AI-checked items are practice-only. The database, not just the loader, keeps them out of search and the sitemap.
  if q.origin = 'AI_GENERATED' and q.verification_status = 'AUTOMATED_CHECKS_PASSED'
     and (q.indexability <> 'NOINDEX' or q.sitemap_include) then
    return 'AI-checked (not human-verified) questions must be NOINDEX and excluded from the sitemap';
  end if;
  if q.current_solution_id is null then
    return 'current_solution_id is required';
  end if;
  select sv.final_answer, sv.review_status, sv.question_id
    into v_final, v_review, v_sol_question
    from public.solution_versions sv where sv.id = q.current_solution_id;
  if not found or v_sol_question is distinct from q.id then
    return 'current solution does not belong to this question';
  end if;
  if v_review <> 'APPROVED' then
    return 'current solution is not APPROVED';
  end if;
  if q.answer_key is null then
    return 'answer_key is required';
  end if;
  if not app_private.answer_keys_equivalent(q.answer_key, v_final) then
    return 'answer_key does not match the current solution final_answer';
  end if;
  if q.subject_id is null or q.chapter_id is null then
    return 'subject_id and chapter_id are required';
  end if;
  -- 0027: an official-key-matched previous-year question may publish before it has a difficulty (shown as "not rated yet";
  -- rated later from real attempts, difficulty_source = 'STATS'). Every other question still needs one.
  if q.difficulty is null and not (q.origin = 'PYQ' and q.verification_status = 'OFFICIAL_KEY_MATCHED') then
    return 'difficulty is required';
  end if;
  if q.answer_key ->> 'type' is distinct from q.question_type::text then
    return 'answer_key type does not match question_type';
  end if;
  select count(*) into v_options from public.question_options o where o.question_id = q.id;
  if q.question_type = 'NUMERICAL' then
    if v_options <> 0 then
      return 'NUMERICAL questions must have no options';
    end if;
  else
    if v_options < 2 then
      return 'MCQ questions need at least 2 options';
    end if;
    select count(*) into v_bad
      from jsonb_array_elements_text(coalesce(q.answer_key -> 'correct_option_ids', '[]'::jsonb)) as c(id)
     where not exists (select 1 from public.question_options o where o.question_id = q.id and o.id::text = c.id);
    if v_bad > 0 or jsonb_array_length(coalesce(q.answer_key -> 'correct_option_ids', '[]'::jsonb)) = 0 then
      return 'answer_key references options that do not belong to this question';
    end if;
  end if;
  return null;
end $$;
revoke all on function app_private.question_publish_violation(public.questions) from public, anon, authenticated;

create or replace function app_private.questions_assign_family() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.family_id is null and new.chapter_id is not null and new.subject_id is not null and new.origin <> 'PYQ' then
    new.family_id := app_private.family_for(new.exam_id, new.subject_id, new.chapter_id, new.question_text, new.difficulty);
  end if;
  return new;
end $$;
revoke all on function app_private.questions_assign_family() from public, anon, authenticated;

alter table public.questions drop constraint if exists questions_difficulty_source_check;
alter table public.questions add constraint questions_difficulty_source_check
  check (difficulty_source is null or difficulty_source in ('ADMIN', 'AI', 'IMPORT', 'STATS'));

-- Same trigger as 0026, now also accepting STATS from set_config('app.difficulty_source', 'STATS', true).
create or replace function app_private.questions_difficulty_meta() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_src text := nullif(current_setting('app.difficulty_source', true), '');
  v_by text := nullif(current_setting('app.difficulty_set_by', true), '');
begin
  if new.difficulty is distinct from old.difficulty then
    new.difficulty_set_at := now();
    if new.difficulty is null or v_src is null or v_src not in ('ADMIN', 'AI', 'IMPORT', 'STATS') then
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
