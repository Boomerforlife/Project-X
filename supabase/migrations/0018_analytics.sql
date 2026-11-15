-- 0018: privacy-light product analytics. Aggregate daily counters only:
-- no user id, no IP, no device id, no free text. Dimension is an allow-listed short code (e.g. a plan code).
create table analytics_daily (
  day date not null,
  event text not null check (event ~ '^[a-z_]{3,40}$'),
  dim text not null default '' check (dim ~ '^[a-z0-9_]{0,40}$'),
  count bigint not null default 0,
  primary key (day, event, dim)
);
alter table analytics_daily enable row level security;
revoke all on analytics_daily from anon, authenticated;
