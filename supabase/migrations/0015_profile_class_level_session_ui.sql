-- 0015: profile class level (onboarding) + practice session UI mode / time limit (web integration, additive).
alter table profiles
  add column class_level text check (class_level in ('11', '12', 'dropper'));

grant update (class_level) on profiles to authenticated;

alter table practice_sessions
  add column ui_mode text not null default 'learning' check (ui_mode in ('learning', 'test')),
  add column time_limit_sec int check (time_limit_sec between 60 and 21600);
