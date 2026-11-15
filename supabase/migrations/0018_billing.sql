-- 0018: Tabby Plus billing (prepaid passes through Razorpay one-time Orders).
-- Separate module: every table is prefixed billing_, written only by the API with the service role.
-- RLS is on with no client grants at all (same pattern as the editorial tables in migration 0012).
-- Numbered 0018: Owner B owns 0016 (pin_helper_search_path) and 0017 (shared_rate_limits).
--
-- Rules encoded here:
--   * Prices live on the server (billing_plans); the client never sends an amount.
--   * The Razorpay webhook is the only thing that marks an order PAID and grants access.
--   * Passes stack: a new pass starts at max(now(), the end of the current access).
--   * Refunds revoke the pass bought by that order (later stacked passes move earlier).
--   * Free users get a monthly allowance of full papers (billing_full_paper_usage); expiry needs no cron.

create type billing_order_status as enum ('CREATED', 'PAID', 'FAILED', 'REFUNDED');
create type billing_entitlement_source as enum ('PURCHASE', 'PROMO', 'SUPPORT_GRANT');

create table billing_plans (
  code text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  price_paise integer not null check (price_paise >= 100),
  currency text not null default 'INR' check (currency = 'INR'),
  duration_days integer not null check (duration_days between 1 and 400),
  badge text check (badge in ('RECOMMENDED', 'BEST_VALUE', 'LAUNCH')),
  launch_only boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  features text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger billing_plans_updated_at before update on billing_plans
  for each row execute function app_private.set_updated_at();

create table billing_payment_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique check (char_length(token) >= 32),
  user_id uuid not null references auth.users on delete cascade,
  plan_code text not null references billing_plans,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_order_id uuid
);
create index billing_payment_links_user_idx on billing_payment_links (user_id, created_at desc);

create table billing_orders (
  id uuid primary key default gen_random_uuid(),
  -- Kept (user_id set null) when an account is deleted: payment records must survive for accounting.
  user_id uuid references auth.users on delete set null,
  client_request_id uuid,
  plan_code text not null references billing_plans,
  amount_paise integer not null check (amount_paise >= 100),
  list_price_paise integer not null check (list_price_paise >= amount_paise),
  currency text not null default 'INR',
  promo_code text,
  payer text not null default 'SELF' check (payer in ('SELF', 'PAYMENT_LINK')),
  payment_link_id uuid references billing_payment_links on delete set null,
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  status billing_order_status not null default 'CREATED',
  refund_requested_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  receipt text not null unique,
  unique (user_id, client_request_id)
);
create index billing_orders_user_idx on billing_orders (user_id, created_at desc);
create index billing_orders_status_idx on billing_orders (status, created_at desc);
alter table billing_payment_links
  add constraint billing_payment_links_paid_order_fk foreign key (paid_order_id) references billing_orders on delete set null;

-- Every webhook delivery we accepted (signature verified). Event id = idempotency key.
create table billing_events (
  id text primary key,
  type text not null,
  razorpay_order_id text,
  razorpay_payment_id text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text,
  error text
);
create index billing_events_order_idx on billing_events (razorpay_order_id);

create table billing_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  source billing_entitlement_source not null,
  order_id uuid unique references billing_orders on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  revoked_at timestamptz,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index billing_entitlements_user_idx on billing_entitlements (user_id, ends_at desc) where revoked_at is null;

create table billing_promo_codes (
  code text primary key check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  percent_off integer check (percent_off between 1 and 100),
  amount_off_paise integer check (amount_off_paise > 0),
  plan_codes text[],
  max_redemptions integer check (max_redemptions > 0),
  redeemed integer not null default 0,
  new_users_only boolean not null default false,
  valid_from timestamptz,
  valid_to timestamptz,
  active boolean not null default true,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint billing_promo_one_discount check ((percent_off is null) <> (amount_off_paise is null))
);

create table billing_promo_redemptions (
  code text not null references billing_promo_codes,
  user_id uuid not null references auth.users on delete cascade,
  order_id uuid not null references billing_orders on delete cascade,
  created_at timestamptz not null default now(),
  primary key (code, user_id)
);

-- One row per full-paper (PYQ_PAPER) session a free user starts; period = first day of the month in IST.
create table billing_full_paper_usage (
  user_id uuid not null references auth.users on delete cascade,
  client_request_id uuid not null,
  period date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, client_request_id)
);
create index billing_full_paper_usage_period_idx on billing_full_paper_usage (user_id, period);

-- Access end for a user (null = never had access). Time comparison only, so expiry needs no job.
create or replace function app_private.plus_until(p_user uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select max(e.ends_at) from public.billing_entitlements e
   where e.user_id = p_user and e.revoked_at is null
$$;

do $$
declare t text;
begin
  foreach t in array array['billing_plans','billing_payment_links','billing_orders','billing_events','billing_entitlements',
                           'billing_promo_codes','billing_promo_redemptions','billing_full_paper_usage'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on function app_private.plus_until(uuid) from public;

-- Clients read prices only through GET /billing/plans (service role), so no table grants are needed.

insert into billing_plans (code, name, price_paise, duration_days, badge, launch_only, sort_order, features) values
  ('plus_monthly',   'Plus Monthly',   5900,  30, null,         false, 10, '{cbt_unlimited}'),
  ('plus_quarterly', 'Plus Quarterly', 14900, 90, 'RECOMMENDED', false, 20, '{cbt_unlimited}'),
  ('plus_annual',    'Plus Annual',    49900, 365, 'BEST_VALUE', false, 30, '{cbt_unlimited}'),
  ('plus_launch',    'Launch Pass',    2900,  30, 'LAUNCH',     true,   5, '{cbt_unlimited}')
on conflict (code) do nothing;
