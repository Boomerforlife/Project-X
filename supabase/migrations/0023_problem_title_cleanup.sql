-- 0023: cleaner problem titles. LaTeX spacing escapes (\, \; \! \:) and escaped symbols (\% \$ \&) survived
-- strip_latex and showed up as "60\, m s -1". Titles are rebuilt from each family's earliest question.
-- Regex notes (standard_conforming_strings = on): '\\([%$&#])' matches a backslash before one of % $ & #;
-- '\\[,;:! ]' matches a LaTeX spacing command.
create or replace function app_private.problem_title(t text) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(btrim(left(regexp_replace(
           split_part(btrim(regexp_replace(
             app_private.strip_latex(regexp_replace(regexp_replace(coalesce(t, ''), '\\([%$&#])', '\1', 'g'), '\\[,;:! ]', ' ', 'g')),
             '\s+', ' ', 'g')), '. ', 1),
           '[\s,:;-]+$', ''), 90)), ''), 'Untitled problem')
$$;
revoke all on function app_private.problem_title(text) from public, anon, authenticated;

update question_families f
   set title = app_private.problem_title(q.question_text)
  from (select distinct on (family_id) family_id, question_text from questions
         where family_id is not null order by family_id, created_at, id) q
 where q.family_id = f.id;
