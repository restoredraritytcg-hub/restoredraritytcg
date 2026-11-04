-- One-time update (Nov 4, 2026): website content you edit from the admin portal
-- (Website → Prices, Announcement, News, Events, Instagram).
-- Paste into Supabase -> SQL Editor -> Run. Safe to re-run. (schema.sql already includes this.)
--
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

-- Your discount on an order's quote (e.g. "10%" or "15"), set from the order's Quote panel.
alter table public.submissions add column if not exists quote_discount text not null default '';

select key, updated_at, updated_by from public.site_content order by key;
