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
        'cards', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', k.id, 'card_number', k.card_number, 'name', k.name, 'details', k.details,
            'status', k.status, 'public_notes', k.public_notes, 'customer_notes', k.customer_notes,
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
    insert into public.cards (submission_id, card_number, name, details, status, customer_notes)
      values (s.id, n, left(coalesce(card ->> 'name', ''), 200), left(coalesce(card ->> 'details', ''), 300),
              'submitted', left(coalesce(card ->> 'notes', ''), 2000))
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
