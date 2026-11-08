-- One-time update (Nov 7, 2026): each card's own service and grading company.
-- Paste into Supabase -> SQL Editor -> Run. Safe to re-run. (schema.sql already includes this.)
-- Run it BEFORE uploading the new website and portal files.
--
-- * cards.service  — the service written on the order, e.g. "Base Repair ($35) + Grading Submission ($5) — grading: PSA"
-- * cards.grading  — where the card is being sent for grading: PSA, CGC, BGS, TAG, "Not sure yet", or '' (not being graded)
-- * intake_submit saves both from the website form; portal_get returns them on the customer's link.

-- Each card's own service (as written on the order, e.g. "Base Repair ($35) + Grading Submission ($5) — grading: PSA")
-- and the grading company it's being submitted to ('' = not being graded).
alter table public.cards add column if not exists service text not null default '';
alter table public.cards add column if not exists grading text not null default '';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cards_grading_check') then
    alter table public.cards add constraint cards_grading_check
      check (grading in ('', 'PSA', 'CGC', 'BGS', 'TAG', 'Not sure yet'));
  end if;
end $$;

create index if not exists cards_grading_idx on public.cards (grading) where grading <> '';

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
    insert into public.cards (submission_id, card_number, name, details, status, customer_notes, service, grading)
      values (s.id, n, left(coalesce(card ->> 'name', ''), 200), left(coalesce(card ->> 'details', ''), 300),
              'submitted', left(coalesce(card ->> 'notes', ''), 2000), left(coalesce(card ->> 'service', ''), 300),
              case when card ->> 'grading' in ('PSA', 'CGC', 'BGS', 'TAG', 'Not sure yet') then card ->> 'grading' else '' end)
      returning id into v_card;
    v_ids := v_ids || to_jsonb(v_card);
  end loop;

  -- card_ids are in the same order as p.cards, for attaching intake photos.
  return jsonb_build_object('code', s.code, 'token', c.share_token,
                            'storage_key', c.storage_key, 'cards', n, 'card_ids', v_ids);
end $$;

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
            'service', k.service, 'grading', k.grading,
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

grant execute on function public.intake_submit(jsonb) to anon, authenticated;
grant execute on function public.portal_get(text) to anon, authenticated;
