-- 0010: practice sessions, attempts, bookmarks, mistakes, daily aggregates, streaks, goals + triggers
create table practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  client_request_id uuid not null,
  mode practice_mode not null,
  exam_id uuid not null references exams,
  subject_id uuid references subjects,
  chapter_id uuid references chapters,
  topic_id uuid references topics,
  paper_id uuid references exam_papers,
  filters jsonb not null default '{}',
  question_ids uuid[] not null check (cardinality(question_ids) between 1 and 50),
  status session_status not null default 'ACTIVE',
  attempted_count int not null default 0,
  correct_count int not null default 0,
  score numeric(7,2) not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_request_id)
);
create index practice_sessions_user_started_idx on practice_sessions (user_id, started_at desc);

create table attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  question_id uuid not null references questions,
  session_id uuid references practice_sessions on delete cascade,
  client_attempt_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response jsonb not null,
  is_correct boolean not null,
  score numeric(5,2) not null,
  time_spent_ms int check (time_spent_ms between 0 and 10800000),
  exam_id uuid not null,
  subject_id uuid not null,
  chapter_id uuid not null,
  topic_id uuid,
  activity_date date not null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, client_attempt_id)
);
create unique index attempts_session_question_uidx on attempts (session_id, question_id) where session_id is not null;
create index attempts_user_submitted_idx on attempts (user_id, submitted_at desc);
create index attempts_user_question_idx on attempts (user_id, question_id, submitted_at desc);
create index attempts_user_chapter_idx on attempts (user_id, chapter_id);
create index attempts_question_idx on attempts (question_id);

create table bookmarks (
  user_id uuid not null references auth.users on delete cascade,
  question_id uuid not null references questions on delete cascade,
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index bookmarks_user_created_idx on bookmarks (user_id, created_at desc);

create table mistakes (
  user_id uuid not null references auth.users on delete cascade,
  question_id uuid not null references questions on delete cascade,
  subject_id uuid not null,
  chapter_id uuid not null,
  wrong_count int not null default 1,
  first_wrong_at timestamptz not null,
  last_wrong_at timestamptz not null,
  last_attempt_id uuid references attempts on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
create index mistakes_user_resolved_idx on mistakes (user_id, resolved_at, last_wrong_at desc);

create table daily_activity (
  user_id uuid not null references auth.users on delete cascade,
  activity_date date not null,
  attempts_count int not null default 0,
  correct_count int not null default 0,
  total_time_ms bigint not null default 0,
  first_attempt_at timestamptz not null,
  last_attempt_at timestamptz not null,
  primary key (user_id, activity_date)
);

create table streaks (
  user_id uuid primary key references auth.users on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_active_date date,
  updated_at timestamptz not null default now()
);

create table user_chapter_stats (
  user_id uuid not null references auth.users on delete cascade,
  chapter_id uuid not null references chapters,
  subject_id uuid not null,
  exam_id uuid not null,
  attempts_count int not null default 0,
  correct_count int not null default 0,
  total_time_ms bigint not null default 0,
  last_attempt_at timestamptz not null,
  primary key (user_id, chapter_id)
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind goal_kind not null,
  target_value int not null check (target_value > 0),
  chapter_id uuid references chapters,
  is_active boolean not null default true,
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'CHAPTER_ACCURACY' or chapter_id is not null)
);
create index goals_user_idx on goals (user_id);

do $$
declare t text;
begin
  foreach t in array array['practice_sessions','mistakes','streaks','goals'] loop
    execute format('create trigger %I before update on public.%I for each row execute function app_private.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;

-- --------------------------------------------------------------------------------------------
-- Streak functions
-- --------------------------------------------------------------------------------------------
create or replace function app_private.recompute_streak(p_user uuid, p_new_date date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.streaks;
  v_current int;
  v_longest_island int;
  v_max_date date;
begin
  insert into public.streaks (user_id) values (p_user) on conflict (user_id) do nothing;
  select st.* into s from public.streaks st where st.user_id = p_user for update;

  if s.last_active_date is null then
    v_current := 1;
  elsif p_new_date = s.last_active_date then
    return;
  elsif p_new_date = s.last_active_date + 1 then
    v_current := s.current_streak + 1;
  elsif p_new_date > s.last_active_date + 1 then
    v_current := 1;
  else
    -- backfill / timezone change: gaps-and-islands over all active dates
    with d as (
      select da.activity_date as dt from public.daily_activity da where da.user_id = p_user
    ), g as (
      select dt, dt - (row_number() over (order by dt))::int as grp from d
    ), islands as (
      select grp, max(dt) as mx, count(*)::int as len from g group by grp
    )
    select (select i.len from islands i order by i.mx desc limit 1),
           (select max(i.len) from islands i),
           (select max(dt) from d)
      into v_current, v_longest_island, v_max_date;
    update public.streaks
       set current_streak = coalesce(v_current, 1),
           longest_streak = greatest(s.longest_streak, coalesce(v_longest_island, 1), coalesce(v_current, 1)),
           last_active_date = greatest(s.last_active_date, p_new_date, v_max_date)
     where user_id = p_user;
    return;
  end if;

  update public.streaks
     set current_streak = v_current,
         longest_streak = greatest(s.longest_streak, v_current),
         last_active_date = greatest(s.last_active_date, p_new_date)
   where user_id = p_user;
end $$;

create or replace function app_private.get_streak(p_user uuid)
returns table (current_streak int, longest_streak int, last_active_date date, today date)
language sql stable security definer set search_path = '' as $$
  with tz as (
    select coalesce((select p.timezone from public.profiles p where p.id = p_user), 'Asia/Kolkata') as name
  ), t as (
    select (now() at time zone tz.name)::date as today from tz
  )
  select case when s.last_active_date >= t.today - 1 then s.current_streak else 0 end,
         coalesce(s.longest_streak, 0),
         s.last_active_date,
         t.today
  from t left join public.streaks s on s.user_id = p_user
$$;

-- --------------------------------------------------------------------------------------------
-- Attempt triggers
-- --------------------------------------------------------------------------------------------
create or replace function app_private.attempts_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  q record;
  v_tz text;
begin
  select qq.exam_id, qq.subject_id, qq.chapter_id, qq.topic_id into q
    from public.questions qq where qq.id = new.question_id;
  if not found or q.subject_id is null or q.chapter_id is null then
    raise exception 'QUESTION_NOT_PRACTICABLE';
  end if;
  new.exam_id := q.exam_id;
  new.subject_id := q.subject_id;
  new.chapter_id := q.chapter_id;
  new.topic_id := q.topic_id;

  select p.timezone into v_tz from public.profiles p where p.id = new.user_id;
  new.activity_date := (new.submitted_at at time zone coalesce(v_tz, 'Asia/Kolkata'))::date;
  return new;
end $$;

create trigger attempts_before_insert
  before insert on attempts
  for each row execute function app_private.attempts_before_insert();

create or replace function app_private.attempts_block_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'ATTEMPT_IMMUTABLE';
end $$;

create trigger attempts_block_update
  before update on attempts
  for each row execute function app_private.attempts_block_update();

create or replace function app_private.attempts_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_new_day boolean;
begin
  -- 1/2. daily aggregate (+ streak when the day is new)
  v_new_day := not exists (
    select 1 from public.daily_activity da where da.user_id = new.user_id and da.activity_date = new.activity_date);
  insert into public.daily_activity (user_id, activity_date, attempts_count, correct_count, total_time_ms, first_attempt_at, last_attempt_at)
  values (new.user_id, new.activity_date, 1, case when new.is_correct then 1 else 0 end,
          coalesce(new.time_spent_ms, 0), new.submitted_at, new.submitted_at)
  on conflict (user_id, activity_date) do update
    set attempts_count = public.daily_activity.attempts_count + 1,
        correct_count = public.daily_activity.correct_count + excluded.correct_count,
        total_time_ms = public.daily_activity.total_time_ms + excluded.total_time_ms,
        first_attempt_at = least(public.daily_activity.first_attempt_at, excluded.first_attempt_at),
        last_attempt_at = greatest(public.daily_activity.last_attempt_at, excluded.last_attempt_at);
  if v_new_day then
    perform app_private.recompute_streak(new.user_id, new.activity_date);
  end if;

  -- 3. mistakes
  if not new.is_correct then
    insert into public.mistakes (user_id, question_id, subject_id, chapter_id, wrong_count, first_wrong_at, last_wrong_at, last_attempt_id)
    values (new.user_id, new.question_id, new.subject_id, new.chapter_id, 1, new.submitted_at, new.submitted_at, new.id)
    on conflict (user_id, question_id) do update
      set wrong_count = public.mistakes.wrong_count + 1,
          last_wrong_at = excluded.last_wrong_at,
          last_attempt_id = excluded.last_attempt_id,
          resolved_at = null;
  else
    update public.mistakes
       set resolved_at = now(), last_attempt_id = new.id
     where user_id = new.user_id and question_id = new.question_id and resolved_at is null;
  end if;

  -- 4. per-chapter stats
  insert into public.user_chapter_stats (user_id, chapter_id, subject_id, exam_id, attempts_count, correct_count, total_time_ms, last_attempt_at)
  values (new.user_id, new.chapter_id, new.subject_id, new.exam_id, 1, case when new.is_correct then 1 else 0 end,
          coalesce(new.time_spent_ms, 0), new.submitted_at)
  on conflict (user_id, chapter_id) do update
    set attempts_count = public.user_chapter_stats.attempts_count + 1,
        correct_count = public.user_chapter_stats.correct_count + excluded.correct_count,
        total_time_ms = public.user_chapter_stats.total_time_ms + excluded.total_time_ms,
        last_attempt_at = greatest(public.user_chapter_stats.last_attempt_at, excluded.last_attempt_at);

  -- 5. practice session counters / auto-complete
  if new.session_id is not null then
    update public.practice_sessions ps
       set attempted_count = ps.attempted_count + 1,
           correct_count = ps.correct_count + case when new.is_correct then 1 else 0 end,
           score = ps.score + new.score,
           last_activity_at = now(),
           status = case when ps.status = 'ACTIVE' and ps.attempted_count + 1 >= cardinality(ps.question_ids)
                         then 'COMPLETED'::public.session_status else ps.status end,
           completed_at = case when ps.status = 'ACTIVE' and ps.attempted_count + 1 >= cardinality(ps.question_ids)
                               then now() else ps.completed_at end
     where ps.id = new.session_id;
  end if;
  return null;
end $$;

create trigger attempts_after_insert
  after insert on attempts
  for each row execute function app_private.attempts_after_insert();
