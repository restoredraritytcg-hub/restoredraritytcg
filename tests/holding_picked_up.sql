-- Local check for supabase/2026-11-24_holding_fee_per_card.sql.
-- Builds the few tables that file touches, loads it, and raises if the
-- picked-up rule is wrong. Not run against the live project.
\set ON_ERROR_STOP on

-- Supabase provides these roles. A plain Postgres needs them only so the
-- migration's revoke statements can run.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

create extension if not exists pgcrypto;

create schema if not exists public;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  storage_key text not null default 'storekeystorekey',
  share_token text not null
);
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers,
  code text not null,
  status text not null,
  service text not null default '',
  public_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  grading_track jsonb not null default '{}'::jsonb
);
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.submissions,
  card_number int not null,
  name text not null default '',
  details text not null default '',
  status text not null,
  public_notes text not null default '',
  customer_notes text not null default '',
  service text not null default '',
  grading text not null default '',
  grade_level text not null default '',
  grade_result text not null default '',
  cert_no text not null default ''
);
create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  card_id uuid,
  stage text, side text, dpi int, files jsonb, scanned_at timestamptz
);
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid, card_id uuid, submission_id uuid,
  path text, source text, caption text, created_at timestamptz default now()
);

insert into public.customers (name, share_token)
values ('Test', 'token-token-token-token');
insert into public.submissions (customer_id, code, status)
select id, 'RR-1042', 'ready' from public.customers;
insert into public.cards (submission_id, card_number, name, status)
select id, 1, 'Already done', 'completed' from public.submissions
union all
select id, 2, 'Still ready', 'ready' from public.submissions;

\i supabase/2026-11-24_holding_fee_per_card.sql

do $$
declare
  v_done boolean; v_done_at timestamptz;
  v_ready boolean; v_ready_at timestamptz;
  v_stamp timestamptz;
  v_json jsonb;
  v_flag boolean;
begin
  select picked_up, picked_up_at into v_done, v_done_at
  from public.cards where card_number = 1;
  if v_done is not true or v_done_at is null then
    raise exception 'completed card was not backfilled as picked up';
  end if;

  select picked_up, picked_up_at into v_ready, v_ready_at
  from public.cards where card_number = 2;
  if v_ready is not false or v_ready_at is not null then
    raise exception 'ready card should not be picked up';
  end if;

  v_stamp := v_done_at;
  update public.cards set name = 'Already done' where card_number = 1;
  select picked_up_at into v_done_at from public.cards where card_number = 1;
  if v_done_at is distinct from v_stamp then
    raise exception 're-saving a picked-up card moved picked_up_at';
  end if;

  update public.cards set status = 'ready' where card_number = 1;
  select picked_up, picked_up_at into v_done, v_done_at from public.cards where card_number = 1;
  if v_done is not false or v_done_at is not null then
    raise exception 'leaving completed should clear picked up';
  end if;

  update public.cards set status = 'completed', picked_up = true where card_number = 2;
  select picked_up, picked_up_at into v_ready, v_ready_at from public.cards where card_number = 2;
  if v_ready is not true or v_ready_at is null then
    raise exception 'checking picked up should stamp picked_up_at';
  end if;

  update public.cards set picked_up = false where card_number = 2 and status = 'completed';
  select picked_up, picked_up_at into v_ready, v_ready_at from public.cards where card_number = 2;
  if v_ready is not false or v_ready_at is not null then
    raise exception 'unchecking should clear picked_up_at';
  end if;

  select public.portal_get('token-token-token-token') into v_json;
  select (c ->> 'picked_up')::boolean into v_flag
  from jsonb_array_elements(v_json -> 'submissions' -> 0 -> 'cards') c
  where (c ->> 'card_number')::int = 2;
  if v_flag is not false then
    raise exception 'customer link did not return picked_up';
  end if;
end $$;

-- Running the file again must not check a Completed card the owner unchecked.
\i supabase/2026-11-24_holding_fee_per_card.sql

do $$
declare v_ready boolean;
begin
  select picked_up into v_ready from public.cards where card_number = 2;
  if v_ready is not false then
    raise exception 'a second run checked a card that was left unchecked';
  end if;
end $$;
