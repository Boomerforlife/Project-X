-- 0024: re-linking official keys must not leave a stale official answer behind.
-- Before: when an official key row was DROPPED (or could not be mapped to this question's options/type), the question
-- was flagged for review but kept whatever OFFICIAL answer an earlier, possibly mis-parsed, key had written.
-- Now those cases also clear an OFFICIAL answer_key (HUMAN answers are never touched, as before). Same function
-- otherwise; a published question still can't lose its key without being unpublished first (publication guard).
create or replace function app_private.link_official_answer_keys(p_paper_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  k public.official_answer_keys;
  q public.questions;
  v_count int := 0;
  v_kind text;
  v_ids uuid[];
  v_expected int;
  v_key jsonb;
  v_ranges jsonb;
  v_display text;
begin
  for k in select * from public.official_answer_keys where paper_id = p_paper_id order by created_at, id loop
    q := null;
    if k.external_question_id is not null then
      select qq.* into q
        from public.questions qq
        join public.source_questions sq on sq.id = qq.source_question_id
       where qq.paper_id = p_paper_id and sq.external_question_id = k.external_question_id
       limit 1;
    end if;
    if q.id is null and k.question_number is not null then
      select qq.* into q from public.questions qq
       where qq.paper_id = p_paper_id and qq.question_number = k.question_number
       limit 1;
    end if;
    if q.id is null then
      continue;
    end if;

    update public.official_answer_keys set question_id = q.id where id = k.id and question_id is distinct from q.id;

    if q.answer_key_source = 'HUMAN' then
      continue;
    end if;

    v_kind := k.normalized_answer ->> 'kind';
    v_key := null;

    if not (k.is_dropped or v_kind = 'DROPPED') then
      if v_kind in ('OPTION_LABELS', 'EXTERNAL_OPTION_IDS') and q.question_type in ('SINGLE_MCQ', 'MULTI_MCQ') then
        if v_kind = 'OPTION_LABELS' then
          select coalesce(array_agg(o.id order by o.id::text), '{}') into v_ids
            from public.question_options o
           where o.question_id = q.id and o.label in (select jsonb_array_elements_text(k.normalized_answer -> 'labels'));
          v_expected := jsonb_array_length(k.normalized_answer -> 'labels');
        else
          select coalesce(array_agg(o.id order by o.id::text), '{}') into v_ids
            from public.question_options o
           where o.question_id = q.id and o.external_option_id in (select jsonb_array_elements_text(k.normalized_answer -> 'ids'));
          v_expected := jsonb_array_length(k.normalized_answer -> 'ids');
        end if;
        if coalesce(array_length(v_ids, 1), 0) >= 1 and array_length(v_ids, 1) = v_expected then
          v_key := jsonb_build_object('type', q.question_type::text, 'correct_option_ids', to_jsonb(v_ids));
        end if;
      elsif v_kind = 'NUMERIC' and q.question_type = 'NUMERICAL' then
        select jsonb_agg(jsonb_build_object('min', r.value ->> 'min', 'max', r.value ->> 'max')
                         order by (r.value ->> 'min')::numeric, (r.value ->> 'max')::numeric)
          into v_ranges
          from jsonb_array_elements(k.normalized_answer -> 'accepted_ranges') as r(value);
        if v_ranges is not null then
          v_display := v_ranges -> 0 ->> 'min';
          if (v_ranges -> 0 ->> 'min')::numeric <> (v_ranges -> 0 ->> 'max')::numeric then
            v_display := trim_scale(((v_ranges -> 0 ->> 'min')::numeric + (v_ranges -> 0 ->> 'max')::numeric) / 2)::text;
          end if;
          v_key := jsonb_build_object('type', 'NUMERICAL', 'accepted_ranges', v_ranges, 'display_value', v_display);
        end if;
      end if;
    end if;

    if v_key is not null then
      update public.questions set answer_key = v_key, answer_key_source = 'OFFICIAL' where id = q.id;
    else
      -- Dropped by the exam body, or the key could not be applied to this question: review, and never keep a stale
      -- official answer from an earlier import.
      update public.questions
         set verification_status = 'HUMAN_REVIEW_REQUIRED',
             answer_key = case when answer_key_source = 'OFFICIAL' then null else answer_key end,
             answer_key_source = case when answer_key_source = 'OFFICIAL' then null else answer_key_source end
       where id = q.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function app_private.link_official_answer_keys(uuid) from public, anon, authenticated;
