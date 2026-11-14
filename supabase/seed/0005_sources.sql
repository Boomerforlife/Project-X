-- Seed 0005: content sources.
-- NTA stays reuse_permitted=false / unapproved: ingestion from it is blocked until an admin records licensing approval.
-- Re-running this seed never revokes or overwrites an approval already recorded.
insert into sources (code, name, kind, publisher, homepage_url, reuse_permitted, approved_at, notes) values
  ('NTA', 'National Testing Agency', 'OFFICIAL_EXAM_BODY', 'National Testing Agency', 'https://nta.ac.in', false, null,
   'Licensing for PYQ reuse not yet cleared. Do not set reuse_permitted/approved_at without a recorded licence.'),
  ('PROJECTX_EDITORIAL', 'ProjectX Editorial Team', 'EDITORIAL_TEAM', 'ProjectX', null, true, now(),
   'Original, editorially authored questions.'),
  ('PROJECTX_AI', 'ProjectX AI Generation', 'AI_GENERATION', 'ProjectX', null, true, now(),
   'AI-generated practice questions (always labelled AI_GENERATED).')
on conflict (code) do update
  set name = excluded.name,
      kind = excluded.kind,
      publisher = excluded.publisher,
      homepage_url = coalesce(excluded.homepage_url, sources.homepage_url);
