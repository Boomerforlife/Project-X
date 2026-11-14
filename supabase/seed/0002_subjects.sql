-- Seed 0002: subjects (slug = {exam.slug}-{segment})
insert into subjects (exam_id, code, slug, segment, name, is_active, sort_order)
select e.id, v.code, e.slug || '-' || v.segment, v.segment, v.name, true, v.sort_order
from (values
  ('jee-main',     'PHYSICS',     'physics',     'Physics',     1),
  ('jee-main',     'CHEMISTRY',   'chemistry',   'Chemistry',   2),
  ('jee-main',     'MATHEMATICS', 'mathematics', 'Mathematics', 3),
  ('jee-advanced', 'PHYSICS',     'physics',     'Physics',     1),
  ('jee-advanced', 'CHEMISTRY',   'chemistry',   'Chemistry',   2),
  ('jee-advanced', 'MATHEMATICS', 'mathematics', 'Mathematics', 3),
  ('neet-ug',      'PHYSICS',     'physics',     'Physics',     1),
  ('neet-ug',      'CHEMISTRY',   'chemistry',   'Chemistry',   2),
  ('neet-ug',      'BOTANY',      'botany',      'Botany',      3),
  ('neet-ug',      'ZOOLOGY',     'zoology',     'Zoology',     4)
) as v(exam_slug, code, segment, name, sort_order)
join exams e on e.slug = v.exam_slug
on conflict (slug) do update
  set name = excluded.name,
      segment = excluded.segment,
      sort_order = excluded.sort_order;
