-- 0031: a full previous-year paper fits in one practice session (2026-11-28).
-- 0010 capped practice_sessions.question_ids at 50, but a JEE Main paper has 75 to 90 questions and the API selects up
-- to FULL_PAPER_MAX_QUESTIONS (200) for a PYQ_PAPER session, so every full-paper start failed the check (23514, sent to
-- students as "Invalid value"). Raise the cap to the API's limit. Other modes stay limited by the API itself
-- (CreateSessionBody.size <= 50). Existing rows hold at most 30 questions, so the new check validates instantly.

alter table practice_sessions drop constraint if exists practice_sessions_question_ids_check;
alter table practice_sessions
  add constraint practice_sessions_question_ids_check check (cardinality(question_ids) between 1 and 200);
