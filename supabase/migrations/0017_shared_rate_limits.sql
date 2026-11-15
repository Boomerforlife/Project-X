-- 0017: shared (cross-instance) fixed-window rate-limit counters for sensitive endpoint classes.
-- Used by the API on its service connection; never exposed to anon/authenticated.
create table app_private.rate_limit_windows (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

-- Atomically count one hit for `p_key` in the current window; returns the hit count and seconds until the window resets.
create or replace function app_private.rate_limit_hit(p_key text, p_period_sec integer)
returns table (hits integer, retry_after_sec integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_period_sec) * p_period_sec);
  v_hits integer;
begin
  if p_period_sec not in (10, 60) then raise exception 'invalid period'; end if;
  insert into app_private.rate_limit_windows as w (key, window_start, hits)
  values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = w.hits + 1
  returning w.hits into v_hits;
  -- Opportunistic cleanup keeps the table tiny (about 1% of calls).
  if random() < 0.01 then
    delete from app_private.rate_limit_windows where window_start < now() - interval '10 minutes';
  end if;
  return query select v_hits,
    greatest(1, ceil(extract(epoch from (v_start + make_interval(secs => p_period_sec) - now())))::integer);
end $$;

revoke all on table app_private.rate_limit_windows from public, anon, authenticated;
revoke all on function app_private.rate_limit_hit(text, integer) from public, anon, authenticated;
