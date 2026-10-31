-- Scan Station by Restored Rarity — database for its OWN Supabase project
-- (not the Restored Rarity portal project). Idempotent: re-run safely in the SQL editor.
--
-- Anyone can create an account. Each user only ever sees their own profile, cards and photos.
-- Photos live in the private "cards" bucket under <user id>/<card id>/..., shown via signed links.

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ tables
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  ebay_store text not null default '',
  card_limit int not null default 200,          -- raise per user if they need more
  created_at timestamptz not null default now()
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null default '',
  details text not null default '',             -- "Base Set · 4/102 · 1999"
  title text not null default '',               -- eBay title (empty = built from name + details)
  notes text not null default '',
  -- {"front": {web, thumb, corners:{...4}, edges:{...4}, boxes, centering, centering_auto?, dpi, source}, "back": {...}}
  sides jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cards_user_idx on public.cards (user_id, created_at desc);

-- --------------------------------------------------------------- triggers
-- A profile for every new account.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;

-- Card limit per user (keeps storage costs bounded).
create or replace function public.cards_quota() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; n int;
begin
  select card_limit into lim from public.profiles where id = new.user_id;
  select count(*) into n from public.cards where user_id = new.user_id;
  if n >= coalesce(lim, 200) then
    raise exception 'You''ve reached your limit of % cards. Delete some to add more.', coalesce(lim, 200);
  end if;
  return new;
end $$;
drop trigger if exists cards_quota on public.cards;
create trigger cards_quota before insert on public.cards for each row execute function public.cards_quota();

create or replace function public.cards_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.user_id := old.user_id; return new; end $$;
drop trigger if exists cards_touch on public.cards;
create trigger cards_touch before update on public.cards for each row execute function public.cards_touch();

-- ---------------------------------------------------------------- security
alter table public.profiles enable row level security;
alter table public.cards enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, ebay_store) on public.profiles to authenticated;   -- not card_limit

drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

revoke all on public.cards from anon;
grant select, insert, update, delete on public.cards to authenticated;
drop policy if exists "own cards" on public.cards;
create policy "own cards" on public.cards for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Delete my account (the app removes the photos first; cards and profile go with the user).
create or replace function public.delete_me() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_me() from public, anon;
grant execute on function public.delete_me() to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.cards_quota() from public, anon, authenticated;

-- ----------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cards', 'cards', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "scanner own read" on storage.objects;
create policy "scanner own read" on storage.objects for select to authenticated
  using (bucket_id = 'cards' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "scanner own insert" on storage.objects;
create policy "scanner own insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'cards' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "scanner own update" on storage.objects;
create policy "scanner own update" on storage.objects for update to authenticated
  using (bucket_id = 'cards' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'cards' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "scanner own delete" on storage.objects;
create policy "scanner own delete" on storage.objects for delete to authenticated
  using (bucket_id = 'cards' and (storage.foldername(name))[1] = auth.uid()::text);
