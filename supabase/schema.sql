-- =====================================================================
-- Restored Rarity portal — Supabase schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run: it only creates what's missing and replaces functions.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- admins
-- Anyone whose login email is in this table can see and edit everything.
create table if not exists public.admins (
  email text primary key
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.rand_key(n int default 18)
returns text language sql volatile as $$ select encode(gen_random_bytes(n), 'hex') $$;

-- ------------------------------------------------------------- customers
-- A customer "profile". One private link (share_token) shows everything
-- under the profile: all submissions, cards, scans and photos.
create table if not exists public.customers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default '',
  email        text,
  phone        text,
  internal_notes text not null default '',
  share_token  text not null unique default public.rand_key(18), -- in the customer's link
  storage_key  text not null unique default public.rand_key(12), -- folder name for their files
  created_at   timestamptz not null default now()
);
create unique index if not exists customers_email_uniq
  on public.customers (lower(email)) where coalesce(email, '') <> '';

-- ----------------------------------------------------------- submissions
create sequence if not exists public.submission_seq start 1001;

create table if not exists public.submissions (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique default ('RR-' || nextval('public.submission_seq')),
  customer_id   uuid not null references public.customers on delete cascade,
  status        text not null default 'received' check (status in
                  ('submitted','received','in_progress','restored','ready','completed')),
  service       text not null default '',
  public_notes  text not null default '',  -- customer can see
  internal_notes text not null default '', -- only you
  customer_notes text not null default '', -- what they wrote on the intake form
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists submissions_customer_idx on public.submissions (customer_id);
-- Last status the customer was emailed about (null = only the intake confirmation, i.e. "submitted").
alter table public.submissions add column if not exists emailed_status text check (emailed_status in
  ('submitted','received','in_progress','restored','ready','completed'));
alter table public.submissions add column if not exists emailed_at timestamptz;
-- Your discount on the order's quote ("10%" or "15"), set in the admin portal's Quote panel.
alter table public.submissions add column if not exists quote_discount text not null default '';
-- Status the order had just before every card being completed marked the order completed.
-- Null when that rule did not complete the order. See 2026-11-24_order_completed_when_cards_completed.sql.
alter table public.submissions add column if not exists auto_completed_from text;

-- ----------------------------------------------------------------- cards
create table if not exists public.cards (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions on delete cascade,
  card_number   int  not null,
  name          text not null default '',
  details       text not null default '',  -- set / number / year
  status        text not null default 'received' check (status in
                  ('submitted','received','in_progress','restored','ready','completed')),
  public_notes  text not null default '',
  internal_notes text not null default '',
  customer_notes text not null default '',
  created_at    timestamptz not null default now(),
  unique (submission_id, card_number)
);
-- Each card's own service (as written on the order, e.g. "Base Repair ($35) + Grading Submission ($5) — grading: PSA")
-- and the grading company it's being submitted to ('' = not being graded).
alter table public.cards add column if not exists service text not null default '';
alter table public.cards add column if not exists grading text not null default '';
-- PSA service level picked for the card (e.g. "Value"), and the result once PSA grades it.
alter table public.cards add column if not exists grade_level  text not null default '';
alter table public.cards add column if not exists grade_result text not null default '';   -- e.g. "PSA 10 GEM MT"
alter table public.cards add column if not exists cert_no      text not null default '';   -- PSA certification number
-- Picked up / shipped back. Only while status is completed; the trigger below clears it otherwise.
-- Not used to decide holding-fee emails (those follow the card's status).
alter table public.cards add column if not exists picked_up boolean not null default false;
alter table public.cards add column if not exists picked_up_at timestamptz;

-- PSA tracking + payments for a submission, edited in the admin portal (PSA panel). Customers see it on
-- their private link. Shape: {"stage":"shipped","history":[{"stage","at"}],"order_no","ship_tracking",
-- "return_tracking","pay":{"fees","deposit","deposit_paid_at","final","shipping","upcharge","final_paid_at"}}
alter table public.submissions add column if not exists grading_track jsonb not null default '{}'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cards_grading_check') then
    alter table public.cards add constraint cards_grading_check
      check (grading in ('', 'PSA', 'CGC', 'BGS', 'TAG', 'Not sure yet'));
  end if;
end $$;
create index if not exists cards_grading_idx on public.cards (grading) where grading <> '';

-- ----------------------------------------------------------------- scans
-- One row per card + stage + side. "files" holds storage paths:
--   {"web": ..., "thumb": ..., "corners": {"top-left": ...}, "edges": {"top": ...},
--    "boxes": {"top-left": [x0,y0,x1,y1], ...}}
create table if not exists public.scans (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references public.cards on delete cascade,
  stage      text not null check (stage in ('before','progress','after')),
  side       text not null check (side in ('front','back')),
  dpi        int,
  files      jsonb not null default '{}'::jsonb,
  scanned_at timestamptz not null default now(),
  unique (card_id, stage, side)
);

-- ---------------------------------------------------------------- photos
-- Photos from the intake form, from you, or added later by the customer.
create table if not exists public.photos (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers on delete cascade,
  submission_id uuid references public.submissions on delete set null,
  card_id       uuid references public.cards on delete set null,
  path          text not null,
  source        text not null check (source in ('intake','admin','customer')),
  caption       text not null default '',
  created_at    timestamptz not null default now()
);
create index if not exists photos_customer_idx on public.photos (customer_id);

-- keep submissions.updated_at fresh
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists submissions_touch on public.submissions;
create trigger submissions_touch before update on public.submissions
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------ row level security
-- Tables are locked down: only admins can read/write them directly.
-- Customers only ever go through the portal_* functions below.
do $$
declare t text;
begin
  foreach t in array array['admins','customers','submissions','cards','scans','photos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated
                    using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- =====================================================================
-- Customer-facing functions (work with just the private link token)
-- =====================================================================

-- Everything a customer may see. Internal notes are never included.
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

-- Record a photo the customer (or the intake form) already uploaded to
-- storage under u/<storage_key>/...
create or replace function public.portal_add_photo(
  p_token text, p_path text, p_caption text default '',
  p_card_id uuid default null, p_submission_code text default null, p_source text default 'customer')
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare c public.customers; v_sub uuid; v_id uuid;
begin
  select * into c from public.customers where share_token = p_token;
  if not found then raise exception 'invalid link'; end if;
  if p_source not in ('customer', 'intake') then raise exception 'bad source'; end if;
  if p_path is null or p_path not like ('u/' || c.storage_key || '/%') or p_path like '%..%' then
    raise exception 'bad path';
  end if;
  if (select count(*) from public.photos where customer_id = c.id) >= 300 then
    raise exception 'photo limit reached';
  end if;
  if p_card_id is not null then
    select k.submission_id into v_sub from public.cards k
      join public.submissions s on s.id = k.submission_id
      where k.id = p_card_id and s.customer_id = c.id;
    if not found then raise exception 'card not found'; end if;
  elsif p_submission_code is not null then
    select id into v_sub from public.submissions where code = p_submission_code and customer_id = c.id;
  end if;
  insert into public.photos (customer_id, submission_id, card_id, path, source, caption)
    values (c.id, v_sub, p_card_id, p_path, p_source, left(coalesce(p_caption, ''), 500))
    returning id into v_id;
  return v_id;
end $$;

-- Customer can remove only photos they added themselves.
create or replace function public.portal_delete_photo(p_token text, p_photo_id uuid)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare c public.customers;
begin
  select * into c from public.customers where share_token = p_token;
  if not found then return false; end if;
  delete from public.photos where id = p_photo_id and customer_id = c.id and source = 'customer';
  return found;
end $$;

-- Used by the storage upload rule below.
create or replace function public.valid_storage_key(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.customers where storage_key = p_key);
$$;

-- Intake form: creates (or reuses, by email) the customer profile, a new
-- submission and its cards. Returns the submission code + private link token
-- so the form can upload photos and show the customer their link.
create or replace function public.intake_submit(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_email text := nullif(lower(trim(p ->> 'email')), '');
  c public.customers; s public.submissions; card jsonb; n int := 0;
  v_card uuid; v_ids jsonb := '[]'::jsonb;
begin
  if coalesce(trim(p ->> 'name'), '') = '' then raise exception 'name required'; end if;
  if jsonb_typeof(p -> 'cards') <> 'array' or jsonb_array_length(p -> 'cards') = 0 then
    raise exception 'at least one card required';
  end if;
  if jsonb_array_length(p -> 'cards') > 100 then raise exception 'too many cards'; end if;

  if v_email is not null then
    select * into c from public.customers where lower(email) = v_email;
  end if;
  if c.id is null then
    insert into public.customers (name, email, phone)
      values (left(trim(p ->> 'name'), 120), v_email, left(nullif(trim(p ->> 'phone'), ''), 40))
      returning * into c;
  else
    update public.customers set
      phone = coalesce(phone, left(nullif(trim(p ->> 'phone'), ''), 40))
      where id = c.id returning * into c;
  end if;

  -- intake_info: delivery / address / referral from the site form. Goes to
  -- internal_notes so it never shows on the customer's link.
  insert into public.submissions (customer_id, status, service, customer_notes, internal_notes)
    values (c.id, 'submitted', left(coalesce(p ->> 'service', ''), 200),
            left(coalesce(p ->> 'notes', ''), 4000), left(coalesce(p ->> 'intake_info', ''), 4000))
    returning * into s;

  for card in select * from jsonb_array_elements(p -> 'cards') loop
    n := n + 1;
    insert into public.cards (submission_id, card_number, name, details, status, customer_notes, service, grading, grade_level)
      values (s.id, n, left(coalesce(card ->> 'name', ''), 200), left(coalesce(card ->> 'details', ''), 300),
              'submitted', left(coalesce(card ->> 'notes', ''), 2000), left(coalesce(card ->> 'service', ''), 300),
              case when card ->> 'grading' in ('PSA', 'CGC', 'BGS', 'TAG', 'Not sure yet') then card ->> 'grading' else '' end,
              left(coalesce(card ->> 'grade_level', ''), 60))
      returning id into v_card;
    v_ids := v_ids || to_jsonb(v_card);
  end loop;

  -- card_ids are in the same order as p.cards, for attaching intake photos.
  return jsonb_build_object('code', s.code, 'token', c.share_token,
                            'storage_key', c.storage_key, 'cards', n, 'card_ids', v_ids);
end $$;

-- Admin: issue a new private link (the old one stops working).
create or replace function public.admin_new_link(p_customer uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare t text;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  update public.customers set share_token = public.rand_key(18) where id = p_customer
    returning share_token into t;
  return t;
end $$;

-- Who may call what.
revoke all on function public.portal_get(text) from public;
revoke all on function public.portal_add_photo(text, text, text, uuid, text, text) from public;
revoke all on function public.portal_delete_photo(text, uuid) from public;
revoke all on function public.intake_submit(jsonb) from public;
revoke all on function public.admin_new_link(uuid) from public;
grant execute on function public.portal_get(text) to anon, authenticated;
grant execute on function public.portal_add_photo(text, text, text, uuid, text, text) to anon, authenticated;
grant execute on function public.portal_delete_photo(text, uuid) to anon, authenticated;
grant execute on function public.intake_submit(jsonb) to anon, authenticated;
grant execute on function public.admin_new_link(uuid) to authenticated;
grant execute on function public.valid_storage_key(text) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- =====================================================================
-- Storage: one public bucket "portal". Files are only reachable by their
-- exact URL, and every folder name contains a random key, so a photo is
-- only visible to someone who was given the link. Nobody can list files
-- except admins.
--   s/<storage_key>/...  scans (uploaded by the scanner app)
--   p/<storage_key>/...  photos you add in the admin portal
--   u/<storage_key>/...  photos from the customer / intake form
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portal', 'portal', true, 26214400,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists portal_admin_all on storage.objects;
create policy portal_admin_all on storage.objects for all to authenticated
  using (bucket_id = 'portal' and public.is_admin())
  with check (bucket_id = 'portal' and public.is_admin());

drop policy if exists portal_customer_upload on storage.objects;
create policy portal_customer_upload on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'portal'
    and (storage.foldername(name))[1] = 'u'
    and public.valid_storage_key((storage.foldername(name))[2])
  );

-- =====================================================================
-- Website content edited in the admin portal (Website section)
-- =====================================================================
-- One row per section. Only admins can change it; anyone can read it through
-- site_get(), which is what the website calls on every page load.

create table if not exists public.site_content (
  key        text primary key check (key in ('prices','announcement','news','shows','instagram')),
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.site_content enable row level security;
drop policy if exists admin_all on public.site_content;
create policy admin_all on public.site_content for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.site_content_touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.jwt() ->> 'email', new.updated_by);
  return new;
end $$;
drop trigger if exists site_content_touch on public.site_content;
create trigger site_content_touch before insert or update on public.site_content
  for each row execute function public.site_content_touch();

-- Everything the public website needs, as {"prices": {...}, "news": [...], ...}.
-- Sections that were never saved are simply missing (the site then uses its built-in defaults).
create or replace function public.site_get()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.site_content;
$$;
grant execute on function public.site_get() to anon, authenticated;

-- Card set / number / year (from supabase/2026-11-08_card_set_year.sql)
alter table public.cards add column if not exists set_name text not null default '';
alter table public.cards add column if not exists card_no  text not null default '';
alter table public.cards add column if not exists year     text not null default '';

-- "Base Set · 4/102 · 1999" -> ('Base Set', '4/102', '1999'). Parts can come in any order; unknown parts go to the set.
create or replace function public.split_card_details(d text, out set_name text, out card_no text, out year text)
language plpgsql immutable set search_path = public as $$
declare parts text[]; rest text[] := '{}'; i int; pick int := 0; p text;
begin
  set_name := ''; card_no := ''; year := '';
  select coalesce(array_agg(btrim(x)) filter (where btrim(x) <> ''), '{}') into parts from regexp_split_to_table(coalesce(d, ''), '\s*·\s*') x;
  -- the year: the last part that is a 4-digit year
  for i in reverse coalesce(array_length(parts, 1), 0) .. 1 loop
    if parts[i] ~ '^(19|20)\d{2}$' then year := parts[i]; parts := parts[1:i-1] || parts[i+1:]; exit; end if;
  end loop;
  -- the card #: a part with "/" (4/102), else a short number-like part (H01, SVP 085, #58) when there is also a set
  for i in 1 .. coalesce(array_length(parts, 1), 0) loop
    if parts[i] ~ '/' and parts[i] ~ '\d' and length(parts[i]) <= 20 then pick := i; end if;
  end loop;
  if pick = 0 then
    for i in 1 .. coalesce(array_length(parts, 1), 0) loop
      p := parts[i];
      if p ~ '^#' or (array_length(parts, 1) > 1 and p ~ '^[A-Za-z-]{0,6} ?\d+[A-Za-z]{0,3}$') then pick := i; end if;
    end loop;
  end if;
  if pick > 0 then card_no := regexp_replace(parts[pick], '^#', ''); parts := parts[1:pick-1] || parts[pick+1:]; end if;
  set_name := left(array_to_string(parts, ' · '), 120);
end $$;

create or replace function public.cards_split_details() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.details is not distinct from old.details then return new; end if;
  select s.set_name, s.card_no, s.year into new.set_name, new.card_no, new.year from public.split_card_details(new.details) s;
  return new;
end $$;
drop trigger if exists cards_split_details on public.cards;
create trigger cards_split_details before insert or update of details on public.cards
  for each row execute function public.cards_split_details();
revoke all on function public.cards_split_details() from public, anon, authenticated;

-- fill in (or refresh) cards that already have details
update public.cards c set set_name = s.set_name, card_no = s.card_no, year = s.year
  from public.cards c2, lateral public.split_card_details(c2.details) s
 where c.id = c2.id and (c.set_name, c.card_no, c.year) is distinct from (s.set_name, s.card_no, s.year);

-- --------------------------------------------------------------------- order completion
-- When every card is completed, the order is completed.
-- Same as supabase/2026-11-24_order_completed_when_cards_completed.sql (kept here so a fresh schema has it).

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
-- Same as supabase/2026-11-24_holding_fee_per_card.sql (kept here so a fresh schema has it).
-- A card that is not Completed cannot stay marked picked up.
-- Cards that are already Completed are marked picked up once.

comment on column public.cards.picked_up is
  'True when a Completed card has been picked up or shipped back. Cleared when the card leaves Completed. Not used to decide holding-fee emails.';

comment on column public.cards.picked_up_at is
  'When picked_up was turned on. Null when the card is not marked picked up.';

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
