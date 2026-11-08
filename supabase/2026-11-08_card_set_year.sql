-- One-time update (Nov 8, 2026): each card's set, card # and year as their own columns.
-- Paste into Supabase -> SQL Editor -> Run. Safe to re-run. (schema.sql already includes this.)
--
-- The portal and the website keep writing the "Set / number / year" text into cards.details
-- (e.g. "Base Set · 4/102 · 1999"); a trigger splits it into set_name / card_no / year on every save,
-- so later features (like a safety sheet) can read clean columns. Existing cards are filled in once below.
-- Blank set_name = "Set needed" in the portal.

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
