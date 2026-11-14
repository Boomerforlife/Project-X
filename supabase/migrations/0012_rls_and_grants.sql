-- 0012: RLS on every public table, revoke Supabase default grants, grant exactly what clients need
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
-- future tables must be granted explicitly (no implicit anon/authenticated access)
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

revoke all on all functions in schema app_private from public;
revoke all on all functions in schema app_private from anon, authenticated;
revoke usage on schema app_private from anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.is_published_question(uuid) to authenticated;

-- ---- taxonomy: active rows are public ------------------------------------------------------
grant select on exams, subjects, chapters, topics to anon, authenticated;
create policy exams_select_anon on exams for select to anon using (is_active);
create policy exams_select_authenticated on exams for select to authenticated using (is_active);
create policy subjects_select_anon on subjects for select to anon using (is_active);
create policy subjects_select_authenticated on subjects for select to authenticated using (is_active);
create policy chapters_select_anon on chapters for select to anon using (is_active);
create policy chapters_select_authenticated on chapters for select to authenticated using (is_active);
create policy topics_select_anon on topics for select to anon using (is_active);
create policy topics_select_authenticated on topics for select to authenticated using (is_active);

-- ---- profiles -------------------------------------------------------------------------------
grant select on profiles to authenticated;
grant update (display_name, timezone, target_exam_id, target_year, daily_goal_attempts, onboarding_completed_at)
  on profiles to authenticated;
create policy profiles_select_authenticated on profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_authenticated on profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---- user_exam_preferences / goals: full owner CRUD ----------------------------------------
grant select, insert, update, delete on user_exam_preferences, goals to authenticated;
create policy user_exam_preferences_select_authenticated on user_exam_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_exam_preferences_insert_authenticated on user_exam_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy user_exam_preferences_update_authenticated on user_exam_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy user_exam_preferences_delete_authenticated on user_exam_preferences for delete to authenticated
  using (user_id = (select auth.uid()));

create policy goals_select_authenticated on goals for select to authenticated
  using (user_id = (select auth.uid()));
create policy goals_insert_authenticated on goals for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy goals_update_authenticated on goals for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy goals_delete_authenticated on goals for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---- bookmarks ------------------------------------------------------------------------------
grant select, insert, delete on bookmarks to authenticated;
grant update (note) on bookmarks to authenticated;
create policy bookmarks_select_authenticated on bookmarks for select to authenticated
  using (user_id = (select auth.uid()));
create policy bookmarks_insert_authenticated on bookmarks for insert to authenticated
  with check (user_id = (select auth.uid()) and app_private.is_published_question(question_id));
create policy bookmarks_update_authenticated on bookmarks for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy bookmarks_delete_authenticated on bookmarks for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---- mistakes: read + dismiss ---------------------------------------------------------------
grant select, delete on mistakes to authenticated;
create policy mistakes_select_authenticated on mistakes for select to authenticated
  using (user_id = (select auth.uid()));
create policy mistakes_delete_authenticated on mistakes for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---- server-written student tables: owner SELECT only ---------------------------------------
grant select on attempts, practice_sessions, daily_activity, streaks, user_chapter_stats, user_uploads, doubts
  to authenticated;
create policy attempts_select_authenticated on attempts for select to authenticated
  using (user_id = (select auth.uid()));
create policy practice_sessions_select_authenticated on practice_sessions for select to authenticated
  using (user_id = (select auth.uid()));
create policy daily_activity_select_authenticated on daily_activity for select to authenticated
  using (user_id = (select auth.uid()));
create policy streaks_select_authenticated on streaks for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_chapter_stats_select_authenticated on user_chapter_stats for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_uploads_select_authenticated on user_uploads for select to authenticated
  using (user_id = (select auth.uid()));
create policy doubts_select_authenticated on doubts for select to authenticated
  using (user_id = (select auth.uid()));

-- ---- user_roles -----------------------------------------------------------------------------
grant select on user_roles to authenticated;
create policy user_roles_select_authenticated on user_roles for select to authenticated
  using (user_id = (select auth.uid()));

-- All other tables (questions, question_options, question_assets, slug_redirects, solution_versions, sources,
-- exam_papers, source_documents, source_questions, official_answer_keys, pipeline_jobs, pipeline_job_events, ai_runs,
-- verification_runs, verification_checks, review_events, audit_log, usage_counters): RLS on, no policies, no grants.
