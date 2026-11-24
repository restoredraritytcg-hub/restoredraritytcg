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
