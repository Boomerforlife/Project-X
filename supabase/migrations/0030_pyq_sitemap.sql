-- 0030: list official-key previous-year questions in the sitemap (SEO, 2026-11-21).
-- A question page is listed (sitemap_include) when it is indexable (published, AUTO, official/human verified, has a
-- current solution), sits in an active chapter (the hidden "not yet tagged" chapters have no public page), and its
-- stem has readable text (>= 40 chars; image-only stems with no OCR text are thin pages). AI-checked practice items
-- stay NOINDEX and out of the sitemap (0021).
--  1. Backfill: every question that qualifies today.
--  2. Trigger: an official-key PYQ that is published, or moved out of a hidden chapter into a real one, joins the
--     sitemap. It only ever turns the flag on at those moments, so an admin who later sets sitemap_include = false
--     keeps that choice.

update public.questions q
   set sitemap_include = true
  from public.chapters c
 where c.id = q.chapter_id
   and c.is_active
   and q.is_indexable
   and q.access_tier = 'FREE'
   and length(coalesce(q.question_text, '')) >= 40
   and not q.sitemap_include;

create or replace function app_private.questions_pyq_sitemap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_active boolean;
  v_was_active boolean;
begin
  if new.sitemap_include
     or new.origin <> 'PYQ'
     or new.publication_status <> 'PUBLISHED'
     or new.indexability <> 'AUTO'
     or new.verification_status not in ('OFFICIAL_KEY_MATCHED', 'HUMAN_VERIFIED')
     or new.current_solution_id is null
     or new.access_tier <> 'FREE'
     or length(coalesce(new.question_text, '')) < 40 then
    return new;
  end if;
  select c.is_active into v_active from public.chapters c where c.id = new.chapter_id;
  if not coalesce(v_active, false) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.sitemap_include := true;
  elsif old.publication_status is distinct from 'PUBLISHED' then
    new.sitemap_include := true;  -- just published
  elsif old.chapter_id is distinct from new.chapter_id then
    select c.is_active into v_was_active from public.chapters c where c.id = old.chapter_id;
    if not coalesce(v_was_active, false) then
      new.sitemap_include := true;  -- tagged out of a hidden chapter
    end if;
  end if;
  return new;
end $$;

drop trigger if exists questions_pyq_sitemap on public.questions;
create trigger questions_pyq_sitemap
  before insert or update of publication_status, chapter_id, verification_status, current_solution_id on public.questions
  for each row execute function app_private.questions_pyq_sitemap();
