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
--    • 2026-11-24_holding_fee_per_card.sql — picked up checkbox on each
--      Completed card. Cards that are already Completed are marked picked up.
--      Does not send email and does not change the holding-fee schedule.
--    • 2026-11-25_grading_stages.sql — grading-company stages (PSA, CGC,
--      BGS, TAG) per card, one lot per order + company with the estimated
--      grading fee and First/Second 50% paid dates. Does not change work
--      statuses, the holding-fee clock, or send email. Never charges.
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


-- --------------------------------------------------------------------- picked up
-- From supabase/2026-11-24_holding_fee_per_card.sql

-- One-time update (Nov 24, 2026): picked up is recorded on each card.
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.
-- (schema.sql already includes this. Also appended to RUN-NEXT-in-Supabase.sql.)
--
-- Holding-fee emails are NOT sent from the database. The Sheet's hourly
-- script decides them, one card at a time, and a card whose status is
-- Completed is never included. This file does not change that rule and
-- does not schedule anything. picked_up is only the checkbox in the portal.
--
-- A card that is not Completed cannot stay marked picked up.
-- Cards that are already Completed are marked picked up (the work was
-- already handed back). A later Completed card starts unchecked.

alter table public.cards
  add column if not exists picked_up boolean not null default false;

alter table public.cards
  add column if not exists picked_up_at timestamptz;

comment on column public.cards.picked_up is
  'True when a Completed card has been picked up or shipped back. Cleared when the card leaves Completed. Not used to decide holding-fee emails.';

comment on column public.cards.picked_up_at is
  'When picked_up was turned on. Null when the card is not marked picked up.';

-- Keep the flag in step with the status. Runs before the row is saved,
-- including inserts and updates that don't mention these columns.
create or replace function public.cards_picked_up_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from 'completed' then
    new.picked_up := false;
    new.picked_up_at := null;
  elsif new.picked_up is true then
    if new.picked_up_at is null then
      new.picked_up_at := now();
    end if;
  else
    new.picked_up := false;
    new.picked_up_at := null;
  end if;
  return new;
end $$;

drop trigger if exists cards_picked_up_guard on public.cards;
create trigger cards_picked_up_guard
  before insert or update on public.cards
  for each row
  execute function public.cards_picked_up_guard();

revoke all on function public.cards_picked_up_guard() from public, anon, authenticated;

-- Existing Completed cards count as already picked up, once.
-- A later run does not check the box again: the owner may have unchecked it.
-- The table comment is the marker. Replacing the trigger function does not clear it.
do $$
begin
  if coalesce(obj_description('public.cards'::regclass), '') not ilike '%backfill applied%' then
    update public.cards
    set picked_up = true,
        picked_up_at = coalesce(picked_up_at, now())
    where status = 'completed'
      and picked_up is distinct from true;
    comment on table public.cards is 'Backfill applied 2026-11-24.';
  end if;
end $$;

-- The customer's private link can show the checkbox (read-only).
-- Admins read the columns directly; this function is what the customer page uses.
create or replace function public.portal_get(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.customers;
begin
  select * into c from public.customers where share_token = p_token;
  if not found or length(coalesce(p_token, '')) < 20 then
    return null;
  end if;
  return jsonb_build_object(
    'customer', jsonb_build_object('name', c.name, 'storage_key', c.storage_key),
    'submissions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'code', s.code, 'status', s.status, 'service', s.service,
        'public_notes', s.public_notes, 'created_at', s.created_at, 'updated_at', s.updated_at,
        'grading_track', s.grading_track,
        'cards', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', k.id, 'card_number', k.card_number, 'name', k.name, 'details', k.details,
            'status', k.status, 'public_notes', k.public_notes, 'customer_notes', k.customer_notes,
            'service', k.service, 'grading', k.grading, 'grade_level', k.grade_level,
            'grade_result', k.grade_result, 'cert_no', k.cert_no,
            'picked_up', k.picked_up, 'picked_up_at', k.picked_up_at,
            'scans', coalesce((
              select jsonb_agg(jsonb_build_object('stage', x.stage, 'side', x.side, 'dpi', x.dpi,
                                                  'files', x.files, 'scanned_at', x.scanned_at))
              from public.scans x where x.card_id = k.id), '[]'::jsonb))
            order by k.card_number)
          from public.cards k where k.submission_id = s.id), '[]'::jsonb))
        order by s.created_at desc)
      from public.submissions s where s.customer_id = c.id), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'path', p.path, 'source', p.source,
                                          'caption', p.caption, 'card_id', p.card_id,
                                          'submission_id', p.submission_id, 'created_at', p.created_at)
                       order by p.created_at)
      from public.photos p where p.customer_id = c.id), '[]'::jsonb)
  );
end $$;

grant execute on function public.portal_get(text) to anon, authenticated;

-- =====================================================================
-- Nov 25, 2026: grading-company stages (PSA, CGC, BGS, TAG) for each card.
-- Paste into Supabase → SQL Editor → Run (or run RUN-NEXT-in-Supabase.sql,
-- which includes this file). Safe to run more than once.
--
-- What it adds
--   • cards.grader_stage  — the grading company's own stage (e.g. psa_research_id)
--     or a Restored Rarity stage before/after the grader (rr_*).
--   • cards.grading_stage — the matching customer stage (e.g. research_id),
--     filled in by a trigger. Never set it by hand.
--   • grading_lots — one per order + grading company (Scott, Nov 25, 2026:
--     each package to a grader holds one customer's order). Holds the grader's
--     order #, tracking #s, notes, the estimated total grading fee, and the
--     two 50% "paid" dates.
--   • grading_stage_events — history of every stage change (customer stepper
--     and "already emailed" check).
--   • portal_get returns the new fields and the order's lots (no internal notes).
--
-- What it does NOT do
--   • It does not change cards.status / submissions.status, the order-completion
--     trigger, the holding-fee clock, or any email. "Received at Restored Rarity"
--     leaves the work status alone; Ready (which starts the holding-fee clock)
--     is still set by hand.
--   • It never charges anything. The 50% amounts are reminders only.
--   • No backfill: live data on Nov 25, 2026 had no grading_track or
--     cards.grading values, and Scott said not to import PSA rows from the Sheet.
-- =====================================================================

-- =====================================================================
-- Stage map: grader-specific key → normalized customer key
-- Same list as GRADER_STAGES / mapStage in portal/grading.js.
-- CGC keys are from collector reports + CGC's FAQ, not a logged-in CGC
-- account: [to confirm] with Scott.
-- =====================================================================
create or replace function public.map_grading_stage(p_grader text, p_grader_stage text)
returns text
language plpgsql
immutable
as $$
declare
  k text := lower(trim(coalesce(p_grader_stage, '')));
begin
  if k = '' then
    return null;
  end if;

  -- Restored Rarity bookends and legacy PSA panel keys (any company).
  if k in ('rr_preparing', 'cleared') then return 'preparing'; end if;
  if k in ('rr_shipped_to_grader', 'shipped') then return 'shipped_to_grader'; end if;
  if k in ('rr_grades_in', 'graded') then return 'grades_in'; end if;
  if k in ('rr_received_at_rr', 'back') then return 'received_at_rr'; end if;
  if k in ('rr_on_hold') then return 'on_hold'; end if;

  -- Legacy PSA panel keys that are company-specific.
  if k = 'arrived' then return 'received_by_grader'; end if;
  if k = 'grading' and coalesce(p_grader, 'PSA') in ('PSA', '') then return 'grading'; end if;
  if k = 'assembly' then return 'qa_assembly'; end if;
  if k = 'returning' then return 'shipped_back'; end if;

  case k
    -- PSA official tracker
    when 'psa_order_arrived' then return 'received_by_grader';
    when 'psa_order_prep' then return 'order_prep';
    when 'psa_research_id' then return 'research_id';
    when 'psa_grading' then return 'grading';
    when 'psa_assembly' then return 'qa_assembly';
    when 'psa_qa_checks' then return 'qa_assembly';
    when 'psa_complete' then return 'qa_assembly';
    when 'psa_shipped' then return 'shipped_back';
    -- CGC public tracker
    when 'cgc_received' then return 'received_by_grader';
    when 'cgc_scheduled' then return 'research_id';
    when 'cgc_grading' then return 'grading';
    when 'cgc_encapsulation' then return 'qa_assembly';
    when 'cgc_qc' then return 'qa_assembly';
    when 'cgc_shipped' then return 'shipped_back';
    -- BGS official process
    when 'bgs_receiving' then return 'received_by_grader';
    when 'bgs_invoicing' then return 'order_prep';
    when 'bgs_verification' then return 'research_id';
    when 'bgs_grading' then return 'grading';
    when 'bgs_labels' then return 'qa_assembly';
    when 'bgs_production_qc' then return 'qa_assembly';
    when 'bgs_shipping' then return 'shipped_back';
    -- TAG official process
    when 'tag_pending_receipt' then return 'shipped_to_grader';
    when 'tag_received' then return 'received_by_grader';
    when 'tag_order_prep' then return 'order_prep';
    when 'tag_card_id' then return 'research_id';
    when 'tag_image_processing' then return 'grading';
    when 'tag_verification' then return 'grading';
    when 'tag_slab_assembly' then return 'qa_assembly';
    when 'tag_qa' then return 'qa_assembly';
    when 'tag_slab_imaging' then return 'qa_assembly';
    when 'tag_order_complete' then return 'qa_assembly';
    when 'tag_shipment' then return 'shipped_back';
    else
      raise exception 'unknown grader_stage % for grader %', p_grader_stage, p_grader;
  end case;
end $$;

comment on function public.map_grading_stage(text, text) is
  'Maps a company-specific or RR bookend grading stage key to the normalized customer-facing stage.';

revoke all on function public.map_grading_stage(text, text) from public;
grant execute on function public.map_grading_stage(text, text) to authenticated;

-- =====================================================================
-- Lots: one per order + grading company
-- =====================================================================
create table if not exists public.grading_lots (
  id                       uuid primary key default gen_random_uuid(),
  submission_id            uuid not null references public.submissions on delete cascade,
  grader                   text not null check (grader in ('PSA', 'CGC', 'BGS', 'TAG')),
  grader_order_no          text not null default '',
  ship_tracking            text not null default '',
  return_tracking          text not null default '',
  notes                    text not null default '',  -- the customer can see this
  internal_notes           text not null default '',  -- admin only, never in portal_get
  est_fee                  numeric(10,2) check (est_fee is null or est_fee >= 0),
  first_half_paid_at       timestamptz,
  second_half_paid_at      timestamptz,
  shipped_at               timestamptz,
  balance_due_on           date,
  balance_reminder_sent_at timestamptz,
  pay                      jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (submission_id, grader)
);

-- 50% of the estimate, rounded to cents. The second half is the rest, so the
-- two always add up to the estimate (they can differ by 1¢ on an odd-cent total).
alter table public.grading_lots add column if not exists first_half_amount numeric(10,2)
  generated always as (round(est_fee / 2, 2)) stored;
alter table public.grading_lots add column if not exists second_half_amount numeric(10,2)
  generated always as (est_fee - round(est_fee / 2, 2)) stored;

comment on table public.grading_lots is
  'Cards from one order sent together to one grading company: order #, tracking, estimated fee, 50/50 paid dates. Never auto-charged.';
comment on column public.grading_lots.est_fee is
  'Estimated total grading fee (USD), entered by the admin. Null = not entered yet.';
comment on column public.grading_lots.first_half_paid_at is
  'When "First 50% paid" was ticked. Null = not paid. Unticking clears it.';
comment on column public.grading_lots.second_half_paid_at is
  'When "Second 50% paid" was ticked. Null = not paid. The +14-day reminder is skipped once this is set.';
comment on column public.grading_lots.shipped_at is
  'First time a card in this lot reached "Shipped to grader". Set by trigger.';
comment on column public.grading_lots.balance_due_on is
  'When the second 50% is due: shipped date + 14 days (America/Chicago) unless the admin set another date.';
comment on column public.grading_lots.balance_reminder_sent_at is
  'When the automatic second-50% reminder email went out (Apps Script, daily). Null = not sent.';
comment on column public.grading_lots.pay is
  'Final-invoice extras: return_shipping, upcharge, final_paid_at. Reminder state only, never charged.';

create index if not exists grading_lots_submission_idx on public.grading_lots (submission_id);

drop trigger if exists grading_lots_touch on public.grading_lots;
create trigger grading_lots_touch before update on public.grading_lots
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- Per-card grader stage + normalized stage
-- =====================================================================
alter table public.cards add column if not exists grading_lot_id uuid references public.grading_lots on delete set null;
alter table public.cards add column if not exists grader_stage text not null default '';
alter table public.cards add column if not exists grading_stage text not null default '';
alter table public.cards add column if not exists grading_stage_at timestamptz;
alter table public.cards add column if not exists grading_notes text not null default '';

comment on column public.cards.grader_stage is
  'Company-specific or RR stage key (e.g. psa_research_id, rr_shipped_to_grader). Empty = not in the grading pipeline. Separate from cards.status.';
comment on column public.cards.grading_stage is
  'Normalized customer-facing stage, filled by trigger from grader_stage. Empty if grader_stage is empty.';
comment on column public.cards.grading_notes is
  'Customer-visible note for the current grading stage.';

create index if not exists cards_grading_lot_idx on public.cards (grading_lot_id) where grading_lot_id is not null;
create index if not exists cards_grading_stage_idx on public.cards (grading_stage) where grading_stage <> '';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cards_grading_stage_check') then
    alter table public.cards add constraint cards_grading_stage_check
      check (grading_stage in (
        '', 'preparing', 'shipped_to_grader', 'received_by_grader', 'order_prep',
        'research_id', 'grading', 'grades_in', 'qa_assembly', 'shipped_back',
        'received_at_rr', 'on_hold'
      ));
  end if;
end $$;

-- A stage needs a real company (not blank / Not sure yet).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cards_grader_stage_company_check') then
    alter table public.cards add constraint cards_grader_stage_company_check
      check (grader_stage = '' or grading in ('PSA', 'CGC', 'BGS', 'TAG'));
  end if;
end $$;

create schema if not exists private;

-- The order + company lot for a card, created on first use.
create or replace function private.grading_lot_for(p_submission uuid, p_grader text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v uuid;
begin
  if p_submission is null or p_grader not in ('PSA', 'CGC', 'BGS', 'TAG') then
    return null;
  end if;
  insert into public.grading_lots (submission_id, grader) values (p_submission, p_grader)
    on conflict (submission_id, grader) do nothing;
  select id into v from public.grading_lots where submission_id = p_submission and grader = p_grader;
  return v;
end $$;

revoke all on function private.grading_lot_for(uuid, text) from public, anon, authenticated;

create or replace function public.cards_grading_stage_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.grader_stage := btrim(coalesce(new.grader_stage, ''));

  if new.grader_stage = '' then
    new.grading_stage := '';
    new.grading_stage_at := null;
    -- Keep the lot link while the company is still a real grader.
    if new.grading not in ('PSA', 'CGC', 'BGS', 'TAG') then
      new.grading_lot_id := null;
    end if;
    return new;
  end if;

  if coalesce(new.grading, '') not in ('PSA', 'CGC', 'BGS', 'TAG') then
    raise exception 'Set a grading company (PSA, CGC, BGS, or TAG) before setting a grader stage';
  end if;

  -- Prefix must match the company. RR stages (rr_*) fit every company.
  if (new.grader_stage like 'psa\_%' and new.grading <> 'PSA')
     or (new.grader_stage like 'cgc\_%' and new.grading <> 'CGC')
     or (new.grader_stage like 'bgs\_%' and new.grading <> 'BGS')
     or (new.grader_stage like 'tag\_%' and new.grading <> 'TAG') then
    raise exception 'Stage % does not belong to %', new.grader_stage, new.grading;
  end if;

  new.grading_stage := coalesce(public.map_grading_stage(new.grading, new.grader_stage), '');

  if tg_op = 'INSERT' or new.grader_stage is distinct from old.grader_stage
     or new.grading is distinct from old.grading then
    new.grading_stage_at := now();
  end if;

  -- One lot per order + company (Scott, Nov 25, 2026).
  new.grading_lot_id := private.grading_lot_for(new.submission_id, new.grading);
  return new;
end $$;

drop trigger if exists cards_grading_stage_sync on public.cards;
create trigger cards_grading_stage_sync
  before insert or update of grading, grader_stage, submission_id
  on public.cards
  for each row
  execute function public.cards_grading_stage_sync();

revoke all on function public.cards_grading_stage_sync() from public, anon, authenticated;

-- Switching or clearing the company drops the old company's stage, unless the
-- same update already supplies a stage that fits the new company (rr_* fit all).
-- Fires before cards_grading_stage_sync (triggers run in name order).
create or replace function public.cards_clear_stage_when_ungraded()
returns trigger
language plpgsql
as $$
declare
  v_stage text := btrim(coalesce(new.grader_stage, ''));
  v_keep boolean := false;
begin
  if new.grading in ('PSA', 'CGC', 'BGS', 'TAG') and v_stage <> '' then
    v_keep :=
      v_stage like 'rr\_%'
      or (new.grading = 'PSA' and v_stage like 'psa\_%')
      or (new.grading = 'CGC' and v_stage like 'cgc\_%')
      or (new.grading = 'BGS' and v_stage like 'bgs\_%')
      or (new.grading = 'TAG' and v_stage like 'tag\_%');
  end if;
  if not v_keep then
    new.grader_stage := '';
  end if;
  return new;
end $$;

drop trigger if exists cards_clear_stage_when_ungraded on public.cards;
create trigger cards_clear_stage_when_ungraded
  before update of grading
  on public.cards
  for each row
  when (new.grading is distinct from old.grading)
  execute function public.cards_clear_stage_when_ungraded();

revoke all on function public.cards_clear_stage_when_ungraded() from public, anon, authenticated;

-- =====================================================================
-- History (append-only) + lot ship date
-- =====================================================================
create table if not exists public.grading_stage_events (
  id            uuid primary key default gen_random_uuid(),
  card_id       uuid not null references public.cards on delete cascade,
  lot_id        uuid references public.grading_lots on delete set null,
  grader        text not null check (grader in ('PSA', 'CGC', 'BGS', 'TAG')),
  grader_stage  text not null,
  grading_stage text not null,
  notes         text not null default '',
  emailed_at    timestamptz,
  created_at    timestamptz not null default now()
);

comment on table public.grading_stage_events is
  'Append-only history of grading-stage changes, used for the customer stepper and email dedupe (emailed_at).';

create index if not exists grading_stage_events_card_idx
  on public.grading_stage_events (card_id, created_at);

create or replace function public.cards_log_grading_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.grader_stage = '' then
    return new;
  end if;
  if tg_op = 'INSERT' or new.grader_stage is distinct from old.grader_stage
     or new.grading is distinct from old.grading then
    insert into public.grading_stage_events (
      card_id, lot_id, grader, grader_stage, grading_stage, notes
    ) values (
      new.id, new.grading_lot_id, new.grading, new.grader_stage, new.grading_stage,
      left(coalesce(new.grading_notes, ''), 2000)
    );
    -- First "Shipped to grader" starts the second-50% clock: due 14 days later
    -- (Central time), unless the admin already set a date. Reminder only.
    if new.grading_stage = 'shipped_to_grader' and new.grading_lot_id is not null then
      update public.grading_lots
         set shipped_at = coalesce(shipped_at, now()),
             balance_due_on = coalesce(balance_due_on, ((now() at time zone 'America/Chicago')::date + 14))
       where id = new.grading_lot_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists cards_log_grading_stage on public.cards;
create trigger cards_log_grading_stage
  after insert or update of grader_stage, grading
  on public.cards
  for each row
  execute function public.cards_log_grading_stage();

revoke all on function public.cards_log_grading_stage() from public, anon, authenticated;

-- =====================================================================
-- RLS: admins only. Customers read through portal_get.
-- =====================================================================
alter table public.grading_lots enable row level security;
alter table public.grading_stage_events enable row level security;

drop policy if exists admin_all on public.grading_lots;
create policy admin_all on public.grading_lots for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists admin_all on public.grading_stage_events;
create policy admin_all on public.grading_stage_events for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.grading_lots to authenticated;
grant select, insert, update, delete on public.grading_stage_events to authenticated;

-- =====================================================================
-- Customer private link: per-card grading fields + history, and the order's
-- lots (estimate, 50% amounts, paid dates). internal_notes is never returned.
-- grading_track is still returned for older PSA records.
-- =====================================================================
create or replace function public.portal_get(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.customers;
begin
  select * into c from public.customers where share_token = p_token;
  if not found or length(coalesce(p_token, '')) < 20 then
    return null;
  end if;
  return jsonb_build_object(
    'customer', jsonb_build_object('name', c.name, 'storage_key', c.storage_key),
    'submissions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'code', s.code, 'status', s.status, 'service', s.service,
        'public_notes', s.public_notes, 'created_at', s.created_at, 'updated_at', s.updated_at,
        'grading_track', s.grading_track,
        'grading_lots', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', l.id, 'grader', l.grader, 'grader_order_no', l.grader_order_no,
            'ship_tracking', l.ship_tracking, 'return_tracking', l.return_tracking,
            'notes', l.notes, 'est_fee', l.est_fee,
            'first_half_amount', l.first_half_amount, 'second_half_amount', l.second_half_amount,
            'first_half_paid_at', l.first_half_paid_at, 'second_half_paid_at', l.second_half_paid_at,
            'shipped_at', l.shipped_at, 'balance_due_on', l.balance_due_on,
            'return_shipping', l.pay -> 'return_shipping', 'upcharge', l.pay -> 'upcharge',
            'final_paid_at', l.pay -> 'final_paid_at'
          ) order by l.grader)
          from public.grading_lots l where l.submission_id = s.id), '[]'::jsonb),
        'cards', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', k.id, 'card_number', k.card_number, 'name', k.name, 'details', k.details,
            'status', k.status, 'public_notes', k.public_notes, 'customer_notes', k.customer_notes,
            'service', k.service, 'grading', k.grading, 'grade_level', k.grade_level,
            'grade_result', k.grade_result, 'cert_no', k.cert_no,
            'picked_up', k.picked_up, 'picked_up_at', k.picked_up_at,
            'grading_lot_id', k.grading_lot_id,
            'grader_stage', k.grader_stage,
            'grading_stage', k.grading_stage,
            'grading_stage_at', k.grading_stage_at,
            'grading_notes', k.grading_notes,
            'grading_history', coalesce((
              select jsonb_agg(jsonb_build_object(
                'grader', e.grader, 'grader_stage', e.grader_stage,
                'grading_stage', e.grading_stage, 'at', e.created_at
              ) order by e.created_at)
              from public.grading_stage_events e where e.card_id = k.id), '[]'::jsonb),
            'scans', coalesce((
              select jsonb_agg(jsonb_build_object('stage', x.stage, 'side', x.side, 'dpi', x.dpi,
                                                  'files', x.files, 'scanned_at', x.scanned_at))
              from public.scans x where x.card_id = k.id), '[]'::jsonb))
            order by k.card_number)
          from public.cards k where k.submission_id = s.id), '[]'::jsonb))
        order by s.created_at desc)
      from public.submissions s where s.customer_id = c.id), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'path', p.path, 'source', p.source,
                                          'caption', p.caption, 'card_id', p.card_id,
                                          'submission_id', p.submission_id, 'created_at', p.created_at)
                       order by p.created_at)
      from public.photos p where p.customer_id = c.id), '[]'::jsonb)
  );
end $$;

revoke all on function public.portal_get(text) from public;
grant execute on function public.portal_get(text) to anon, authenticated;
