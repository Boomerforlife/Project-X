-- 0028: full previous-year papers (owner decision 2026-11-20: "paper-only publish").
-- Additive; changes no question rows.
--
-- About half of each JEE Main paper has an official answer but no chapter the keyword rules are sure of. Those
-- questions are published for full papers only: each subject gets one hidden chapter, "Not yet tagged"
-- (is_active = false). The publication guard (chapter required) is unchanged. The API leaves questions in an inactive
-- chapter out of every public list, page, count, search and non-paper practice set; a PYQ_PAPER session includes them.
-- A person can move a question to its real chapter later in the admin questions page.

insert into public.chapters (subject_id, slug, segment, name, unit_number, class_level, description, is_active, sort_order)
select s.id, s.slug || '-not-yet-tagged', 'not-yet-tagged', 'Not yet tagged', null, null,
       'Previous-year questions published for full papers only, until a person sets their chapter.', false, 999
  from public.subjects s
  join public.exams e on e.id = s.exam_id
 where e.slug = 'jee-main'
on conflict (slug) do nothing;
