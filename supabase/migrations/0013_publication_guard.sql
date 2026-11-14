-- 0013: publication guard (needs solution_versions + question_options)
create or replace function app_private.questions_publication_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_final jsonb;
  v_review public.solution_review_status;
  v_sol_question uuid;
  v_options int;
  v_bad int;
  v_reason text;
begin
  -- DISPUTED while PUBLISHED -> automatic unpublish
  if new.verification_status = 'DISPUTED' and old.publication_status = 'PUBLISHED' then
    new.publication_status := 'DRAFT';
    new.published_at := null;
    return new;
  end if;

  if new.publication_status <> 'PUBLISHED' then
    return new;
  end if;

  if new.verification_status not in ('OFFICIAL_KEY_MATCHED', 'HUMAN_VERIFIED') then
    v_reason := 'verification_status must be OFFICIAL_KEY_MATCHED or HUMAN_VERIFIED';
  elsif new.current_solution_id is null then
    v_reason := 'current_solution_id is required';
  else
    select sv.final_answer, sv.review_status, sv.question_id
      into v_final, v_review, v_sol_question
      from public.solution_versions sv where sv.id = new.current_solution_id;
    if not found or v_sol_question is distinct from new.id then
      v_reason := 'current solution does not belong to this question';
    elsif v_review <> 'APPROVED' then
      v_reason := 'current solution is not APPROVED';
    elsif new.answer_key is null then
      v_reason := 'answer_key is required';
    elsif new.answer_key is distinct from v_final then
      v_reason := 'answer_key does not match the current solution final_answer';
    elsif new.subject_id is null or new.chapter_id is null or new.difficulty is null then
      v_reason := 'subject_id, chapter_id and difficulty are required';
    elsif new.answer_key ->> 'type' is distinct from new.question_type::text then
      v_reason := 'answer_key type does not match question_type';
    else
      select count(*) into v_options from public.question_options o where o.question_id = new.id;
      if new.question_type = 'NUMERICAL' then
        if v_options <> 0 then
          v_reason := 'NUMERICAL questions must have no options';
        end if;
      else
        if v_options < 2 then
          v_reason := 'MCQ questions need at least 2 options';
        else
          select count(*) into v_bad
            from jsonb_array_elements_text(coalesce(new.answer_key -> 'correct_option_ids', '[]'::jsonb)) as c(id)
           where not exists (select 1 from public.question_options o where o.question_id = new.id and o.id::text = c.id);
          if v_bad > 0 or jsonb_array_length(coalesce(new.answer_key -> 'correct_option_ids', '[]'::jsonb)) = 0 then
            v_reason := 'answer_key references options that do not belong to this question';
          end if;
        end if;
      end if;
    end if;
  end if;

  if v_reason is not null then
    raise exception 'PUBLISH_REQUIREMENTS_NOT_MET: %', v_reason;
  end if;
  return new;
end $$;

create trigger questions_publication_guard
  before update of publication_status, verification_status, current_solution_id, answer_key on questions
  for each row
  when (new.publication_status = 'PUBLISHED' or old.publication_status = 'PUBLISHED')
  execute function app_private.questions_publication_guard();
