-- Seed 0001: exams (idempotent; re-running never changes is_active once set)
insert into exams (code, slug, name, short_name, description, is_active, sort_order) values
  ('JEE_MAIN',     'jee-main',     'JEE Main',                     'JEE Main',     'Joint Entrance Examination (Main) for admission to NITs, IIITs and CFTIs.', true,  1),
  ('JEE_ADVANCED', 'jee-advanced', 'JEE Advanced',                 'JEE Advanced', 'Joint Entrance Examination (Advanced) for admission to the IITs.',          false, 2),
  ('NEET_UG',      'neet-ug',      'NEET UG',                      'NEET UG',      'National Eligibility cum Entrance Test (UG) for medical admissions.',       false, 3)
on conflict (slug) do update
  set code = excluded.code,
      name = excluded.name,
      short_name = excluded.short_name,
      description = excluded.description,
      sort_order = excluded.sort_order;
