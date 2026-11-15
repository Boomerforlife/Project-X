-- 0021: enforce in the database the "practice-only" half of the 0020 policy.
-- 0020 lets AI_GENERATED questions publish on AUTOMATED_CHECKS_PASSED; its policy also says they are never indexed and
-- never in the sitemap. That relied on the loader setting the right values; now the publication guard refuses otherwise.
-- Same function as 0020 plus one check, so every caller (row guard, dependent-row triggers) gets it.
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
  if q.subject_id is null or q.chapter_id is null or q.difficulty is null then
    return 'subject_id, chapter_id and difficulty are required';
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
