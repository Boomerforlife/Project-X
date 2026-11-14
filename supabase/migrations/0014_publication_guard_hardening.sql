-- 0014: publication guard hardening (review findings H1, H4 + low items)
--  * guard runs on INSERT and on every UPDATE whenever the row is PUBLISHED
--  * deferred constraint triggers re-check the parent question when solutions/options of a PUBLISHED question change
--  * NUMERICAL answer_key vs solution final_answer compared semantically (ignores display_value, numeric min/max)
--  * future functions are not executable by public/anon/authenticated
--  * attempts.session_id must belong to the same user
--  * promote_source_question re-checks that the source is still reuse_permitted + approved

-- ---- semantic answer-key comparison ---------------------------------------------------------
create or replace function app_private.answer_keys_equivalent(a jsonb, b jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_type text := a ->> 'type';
begin
  if a is null or b is null then
    return false;
  end if;
  if v_type is distinct from b ->> 'type' then
    return false;
  end if;
  if v_type = 'NUMERICAL' then
    -- display_value is presentation only; ranges compare numerically ("5" = "5.0"), order-insensitive
    if (a - 'display_value' - 'accepted_ranges') is distinct from (b - 'display_value' - 'accepted_ranges') then
      return false;
    end if;
    return
      coalesce((select array_agg((r.value ->> 'min')::numeric order by (r.value ->> 'min')::numeric, (r.value ->> 'max')::numeric)
                  from jsonb_array_elements(coalesce(a -> 'accepted_ranges', '[]'::jsonb)) as r(value)), '{}'::numeric[])
      = coalesce((select array_agg((r.value ->> 'min')::numeric order by (r.value ->> 'min')::numeric, (r.value ->> 'max')::numeric)
                  from jsonb_array_elements(coalesce(b -> 'accepted_ranges', '[]'::jsonb)) as r(value)), '{}'::numeric[])
      and
      coalesce((select array_agg((r.value ->> 'max')::numeric order by (r.value ->> 'min')::numeric, (r.value ->> 'max')::numeric)
                  from jsonb_array_elements(coalesce(a -> 'accepted_ranges', '[]'::jsonb)) as r(value)), '{}'::numeric[])
      = coalesce((select array_agg((r.value ->> 'max')::numeric order by (r.value ->> 'min')::numeric, (r.value ->> 'max')::numeric)
                  from jsonb_array_elements(coalesce(b -> 'accepted_ranges', '[]'::jsonb)) as r(value)), '{}'::numeric[]);
  elsif v_type in ('SINGLE_MCQ', 'MULTI_MCQ') then
    if (a - 'correct_option_ids') is distinct from (b - 'correct_option_ids') then
      return false;
    end if;
    return
      coalesce((select array_agg(c.id order by c.id) from jsonb_array_elements_text(coalesce(a -> 'correct_option_ids', '[]'::jsonb)) as c(id)), '{}'::text[])
      = coalesce((select array_agg(c.id order by c.id) from jsonb_array_elements_text(coalesce(b -> 'correct_option_ids', '[]'::jsonb)) as c(id)), '{}'::text[]);
  end if;
  return a = b;
exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value or datatype_mismatch then
  return false; -- malformed numbers / shapes never count as equivalent
end $$;

-- ---- single source of truth for "is this question publishable?" -------------------------------
-- Returns null when all publish requirements hold, otherwise the human-readable reason.
create or replace function app_private.question_publish_violation(q public.questions) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_final jsonb;
  v_review public.solution_review_status;
  v_sol_question uuid;
  v_options int;
  v_bad int;
begin
  if q.verification_status not in ('OFFICIAL_KEY_MATCHED', 'HUMAN_VERIFIED') then
    return 'verification_status must be OFFICIAL_KEY_MATCHED or HUMAN_VERIFIED';
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

-- ---- guard on the question row itself ---------------------------------------------------------
create or replace function app_private.questions_publication_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_reason text;
begin
  -- DISPUTED while PUBLISHED -> automatic unpublish
  if tg_op = 'UPDATE' and new.verification_status = 'DISPUTED' and old.publication_status = 'PUBLISHED' then
    new.publication_status := 'DRAFT';
    new.published_at := null;
    return new;
  end if;

  if new.publication_status <> 'PUBLISHED' then
    return new;
  end if;

  v_reason := app_private.question_publish_violation(new);
  if v_reason is not null then
    raise exception 'PUBLISH_REQUIREMENTS_NOT_MET: %', v_reason;
  end if;
  return new;
end $$;

drop trigger questions_publication_guard on questions;
create trigger questions_publication_guard
  before insert or update on questions
  for each row
  execute function app_private.questions_publication_guard();

-- ---- dependents of a PUBLISHED question cannot be changed out from under it ---------------------
create or replace function app_private.dependents_publication_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_id uuid;
  q public.questions;
  v_reason text;
begin
  if tg_op = 'INSERT' then
    v_ids := array[new.question_id];
  elsif tg_op = 'DELETE' then
    v_ids := array[old.question_id];
  else
    v_ids := array[new.question_id, old.question_id];
  end if;
  foreach v_id in array v_ids loop
    select x.* into q from public.questions x where x.id = v_id;
    if found and q.publication_status = 'PUBLISHED' then
      v_reason := app_private.question_publish_violation(q);
      if v_reason is not null then
        raise exception 'PUBLISH_REQUIREMENTS_NOT_MET: % (change to % of a PUBLISHED question)', v_reason, tg_table_name;
      end if;
    end if;
  end loop;
  return null;
end $$;

create constraint trigger question_options_publication_guard
  after insert or update or delete on question_options
  deferrable initially deferred
  for each row execute function app_private.dependents_publication_guard();

create constraint trigger solution_versions_publication_guard
  after update of review_status or delete on solution_versions
  deferrable initially deferred
  for each row execute function app_private.dependents_publication_guard();

-- ---- LOW: future functions are not callable by default ------------------------------------------
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema app_private revoke execute on functions from public, anon, authenticated;
-- the schema-scoped form only subtracts schema-specific entries; also drop the global PUBLIC default
-- (applies to functions later created by the migration role).
alter default privileges revoke execute on functions from public;
revoke all on function app_private.answer_keys_equivalent(jsonb, jsonb) from public, anon, authenticated;
revoke all on function app_private.question_publish_violation(public.questions) from public, anon, authenticated;
revoke all on function app_private.dependents_publication_guard() from public, anon, authenticated;

-- ---- LOW: attempts.session_id must belong to the same user --------------------------------------
alter table practice_sessions add constraint practice_sessions_id_user_uniq unique (id, user_id);
alter table attempts
  add constraint attempts_session_user_fk foreign key (session_id, user_id)
  references practice_sessions (id, user_id) on delete cascade;

-- ---- LOW: promote_source_question re-checks source approval -------------------------------------
alter function app_private.promote_source_question(uuid, uuid, text) rename to promote_source_question_unchecked;
revoke all on function app_private.promote_source_question_unchecked(uuid, uuid, text) from public, anon, authenticated;

create or replace function app_private.promote_source_question(
  p_source_question_id uuid, p_exam_id uuid, p_subject_code text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  sq public.source_questions;
  v_ok boolean;
begin
  select s.* into sq from public.source_questions s where s.id = p_source_question_id;
  if found and not (sq.status = 'PROMOTED' and sq.promoted_question_id is not null) then
    select (s.reuse_permitted and s.approved_at is not null) into v_ok
      from public.source_documents d join public.sources s on s.id = d.source_id
     where d.id = sq.source_document_id;
    if not coalesce(v_ok, false) then
      raise exception 'SOURCE_NOT_APPROVED: source is not reuse_permitted and approved';
    end if;
  end if;
  return app_private.promote_source_question_unchecked(p_source_question_id, p_exam_id, p_subject_code);
end $$;
revoke all on function app_private.promote_source_question(uuid, uuid, text) from public, anon, authenticated;
