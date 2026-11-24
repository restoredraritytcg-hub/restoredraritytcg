-- =====================================================================
--  RUN NEXT IN SUPABASE
--  Supabase → SQL Editor → New query → paste ALL of this file → Run.
--  Safe to run more than once.
--
--  Waiting to be run (newest last):
--    • 2026-11-22_cleaning_eval_pricing.sql — Card Cleaning and Grade-Ready
--      Evaluation bulk tiers. Does not change any other service price.
--    • 2026-11-24_order_completed_when_cards_completed.sql — when every card
--      on an order is Completed, mark the order Completed. Does not send email.
--
--  After you run it, tell Claude "I ran the Supabase update" and this
--  file is emptied until the next one. Every update is also kept in its
--  own dated file in this folder (e.g. 2026-11-13_psa_tracking.sql).
-- =====================================================================

-- One-time update (Nov 22, 2026): Card Cleaning and Grade-Ready Evaluation bulk tiers.
-- Does NOT change any other service price (repairs, scratch repair, slab cracking,
-- grading submission $15 / $5, PSA levels, surcharges, or referral discount).
--
-- Both services use the same bands. One rate applies to every card of that service.
-- The tier follows the order's card count.
-- Card Cleaning (the service price, unchanged at $10, covers 1–25 cards):
--   26–50 cards       $7.50 per card
--   51 or more cards  $5 per card
-- Grade-Ready Evaluation (the service price, unchanged at $20, covers 1–25 cards):
--   26–50 cards       $16 per card
--   51 or more cards  $14 per card
-- If the prices row does not exist yet, this changes nothing (the site uses its built-in list).

update public.site_content
set value = jsonb_set(
      jsonb_set(
        value,
        '{bulk}',
        '[{"min":26,"price":7.5},{"min":51,"price":5}]'::jsonb,
        true
      ),
      '{evalBulk}',
      '[{"min":26,"price":16},{"min":51,"price":14}]'::jsonb,
      true
    )
where key = 'prices'
  and jsonb_typeof(value) = 'object';



-- --------------------------------------------------------------------- order completion
-- From supabase/2026-11-24_order_completed_when_cards_completed.sql

-- One-time update (Nov 24, 2026): when every card on an order is Completed,
-- mark the order Completed. Paste into Supabase → SQL Editor → Run.
-- Safe to re-run. (schema.sql already includes this.)
--
-- Fires when cards are inserted, deleted, or updated, including one update
-- that changes several cards at once (the portal's "Set selected to").
-- Orders with no cards are never completed by this rule.
--
-- If a card later leaves Completed, the order goes back to the status it had
-- just before this rule completed it (saved in submissions.auto_completed_from).
-- If you set the order to Completed yourself, it stays Completed when a card
-- changes — that column is cleared on a hand edit of the order status.
--
-- This does not send email. emailed_status is left alone, so the portal shows
-- the usual "hasn't been emailed" banner and you send the status email the
-- same way as any other status change.
--
-- Orders that already have every card Completed are left as they are until a
-- card on that order is added, removed, or saved again (the status value does
-- not have to change). Saving every selected card as Completed does that.

alter table public.submissions
  add column if not exists auto_completed_from text;

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'submissions_auto_completed_from_check'
  ) then
    alter table public.submissions
      add constraint submissions_auto_completed_from_check
      check (auto_completed_from is null or auto_completed_from in
        ('submitted', 'received', 'in_progress', 'restored', 'ready'));
  end if;
end $$;

comment on column public.submissions.auto_completed_from is
  'Status the order had just before it was marked completed because every card was completed. Null when this rule did not complete the order. Cleared when the order status is edited by hand.';

-- The write lives in a schema the API does not expose, and runs as the database
-- owner, so an admin's card save can update the order without a second request.
-- anon and authenticated are not granted access. The API cannot call it.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Lock the order, then look at its cards. Called once per order per statement,
-- so a bulk status change still completes the order a single time.
create or replace function private.sync_submission_completion(p_submission uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_open int;
  v_status text;
  v_from text;
begin
  if p_submission is null then
    return;
  end if;

  select status, auto_completed_from
    into v_status, v_from
  from public.submissions
  where id = p_submission
  for update;

  -- The order is being deleted and its cards are going with it.
  if not found then
    return;
  end if;

  select count(*),
         count(*) filter (where status is distinct from 'completed')
    into v_total, v_open
  from public.cards
  where submission_id = p_submission;

  if v_total > 0 and v_open = 0 then
    if v_status is distinct from 'completed' then
      update public.submissions
        set status = 'completed',
            auto_completed_from = v_status
      where id = p_submission;
    end if;
  elsif v_status = 'completed' and v_from is not null then
    update public.submissions
      set status = v_from,
          auto_completed_from = null
    where id = p_submission;
  end if;
end $$;

-- These only run as triggers. They are security definer so they may call the
-- private function above; execute is revoked so the API cannot call them.
create or replace function public.cards_order_completion_ins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare sid uuid;
begin
  for sid in select distinct submission_id from new_cards where submission_id is not null loop
    perform private.sync_submission_completion(sid);
  end loop;
  return null;
end $$;

create or replace function public.cards_order_completion_upd()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare sid uuid;
begin
  for sid in
    select distinct q.submission_id
    from (
      select submission_id from new_cards
      union
      select submission_id from old_cards
    ) q
    where q.submission_id is not null
  loop
    perform private.sync_submission_completion(sid);
  end loop;
  return null;
end $$;

create or replace function public.cards_order_completion_del()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare sid uuid;
begin
  for sid in select distinct submission_id from old_cards where submission_id is not null loop
    perform private.sync_submission_completion(sid);
  end loop;
  return null;
end $$;

-- A hand edit of the order status forgets an earlier automatic completion,
-- so a later card edit does not put the order back to a stale status.
create or replace function public.submissions_forget_auto_complete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and new.auto_completed_from is not distinct from old.auto_completed_from then
    new.auto_completed_from := null;
  end if;
  return new;
end $$;

drop trigger if exists cards_order_completion_ins on public.cards;
create trigger cards_order_completion_ins
  after insert on public.cards
  referencing new table as new_cards
  for each statement
  execute function public.cards_order_completion_ins();

drop trigger if exists cards_order_completion_upd on public.cards;
create trigger cards_order_completion_upd
  after update on public.cards
  referencing old table as old_cards new table as new_cards
  for each statement
  execute function public.cards_order_completion_upd();

drop trigger if exists cards_order_completion_del on public.cards;
create trigger cards_order_completion_del
  after delete on public.cards
  referencing old table as old_cards
  for each statement
  execute function public.cards_order_completion_del();

drop trigger if exists submissions_forget_auto_complete on public.submissions;
create trigger submissions_forget_auto_complete
  before update of status on public.submissions
  for each row
  execute function public.submissions_forget_auto_complete();

-- Not part of the API. Triggers still run; anon and authenticated cannot call these.
drop function if exists public.sync_submission_completion(uuid);
revoke all on function private.sync_submission_completion(uuid) from public, anon, authenticated;
revoke all on function public.cards_order_completion_ins() from public, anon, authenticated;
revoke all on function public.cards_order_completion_upd() from public, anon, authenticated;
revoke all on function public.cards_order_completion_del() from public, anon, authenticated;
revoke all on function public.submissions_forget_auto_complete() from public, anon, authenticated;
