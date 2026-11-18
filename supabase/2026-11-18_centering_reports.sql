-- Centering IQ track record (Nov 18, 2026).
-- People who used the free Centering IQ tool (restoredraritytcg.com/centering/) report the real grade once their slab
-- comes back. The page shows the combined hit rate once enough reports exist. Anonymous: no names, emails or pictures —
-- only the grader, the grade, what Centering IQ predicted and the measured centering.
-- Nobody can read the rows directly (RLS on, no policies): only the two functions below. Safe to run more than once.

create table if not exists public.centering_reports (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  client      text not null,                        -- random id kept in the reporter's browser (rate limit only)
  company     text not null check (company in ('PSA','CGC','BGS')),
  predicted   numeric(3,1) not null check (predicted between 1 and 10),     -- best grade the centering allowed
  real_grade  numeric(3,1) not null check (real_grade between 1 and 10),
  subgrade    numeric(3,1) check (subgrade between 1 and 10),                -- BGS centering subgrade, if given
  front_share numeric(4,1) check (front_share between 50 and 100),
  back_share  numeric(4,1) check (back_share between 50 and 100),
  tilt        numeric(4,2),
  source      text check (source in ('photo','scan','screenshot'))
);
alter table public.centering_reports enable row level security;
revoke all on public.centering_reports from anon, authenticated;
create index if not exists centering_reports_client on public.centering_reports (client, created_at);

create or replace function public.centering_report_add(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c text := left(coalesce(p->>'client', ''), 64);
begin
  if length(c) < 16 then raise exception 'bad client'; end if;
  if (select count(*) from centering_reports where client = c and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Too many reports today — thanks! Try again tomorrow.';
  end if;
  if (select count(*) from centering_reports where created_at > now() - interval '1 hour') >= 500 then
    raise exception 'Busy — try again later.';
  end if;
  insert into centering_reports (client, company, predicted, real_grade, subgrade, front_share, back_share, tilt, source)
  values (c, p->>'company', (p->>'predicted')::numeric, (p->>'real_grade')::numeric, nullif(p->>'subgrade','')::numeric,
          nullif(p->>'front_share','')::numeric, nullif(p->>'back_share','')::numeric,
          nullif(p->>'tilt','')::numeric, nullif(p->>'source',''));
  return jsonb_build_object('ok', true);
end $$;

-- Per grader: reports, how often the real grade stayed at or under the centering cap ("cap held"), and for BGS how often
-- the centering subgrade matched exactly / within half a grade. Rates only once a grader has 25+ reports.
create or replace function public.centering_report_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(company, s), '{}'::jsonb) from (
    select company, jsonb_build_object(
      'n', count(*),
      'cap_held', case when count(*) >= 25 then round(100.0 * count(*) filter (where real_grade <= predicted) / count(*)) end,
      'sub_n', count(subgrade),
      'sub_exact', case when count(subgrade) >= 25 then round(100.0 * count(*) filter (where subgrade = predicted) / count(subgrade)) end,
      'sub_half', case when count(subgrade) >= 25 then round(100.0 * count(*) filter (where abs(subgrade - predicted) <= 0.5) / count(subgrade)) end
    ) s from centering_reports group by company) x
$$;

revoke all on function public.centering_report_add(jsonb) from public;
revoke all on function public.centering_report_stats() from public;
grant execute on function public.centering_report_add(jsonb) to anon, authenticated;
grant execute on function public.centering_report_stats() to anon, authenticated;
