-- One-time update (Oct 24, 2026): track which status each customer was last emailed about.
-- Paste into Supabase -> SQL Editor -> Run. Safe to re-run. (schema.sql already includes the columns.)

alter table public.submissions add column if not exists emailed_status text check (emailed_status in
  ('submitted','received','in_progress','restored','ready','completed'));
alter table public.submissions add column if not exists emailed_at timestamptz;

-- Submissions imported from the Google Sheet: the Sheet's "Last Emailed Status" shows every one of them
-- had already been emailed about its current status, so start them as up to date.
-- (Trigger off so this doesn't change their "last updated" date.)
do $$ begin
  alter table public.submissions disable trigger submissions_touch;
  update public.submissions set emailed_status = status, emailed_at = updated_at
    where emailed_status is null and internal_notes like 'Imported from Google Sheet%';
  alter table public.submissions enable trigger submissions_touch;
end $$;

select status, emailed_status, count(*) from public.submissions group by 1, 2 order by 1;
