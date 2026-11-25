-- Local check for supabase/2026-11-25_grading_stages.sql (not run against the live project).
-- Run on a scratch database, in this order:
--   psql -f tests/grading_stages_stubs.sql
--   psql -f supabase/schema.sql
--   psql -f supabase/2026-11-25_grading_stages.sql   (twice, to prove it is re-runnable)
--   psql -f tests/grading_stages.sql
-- Raises on the first wrong result.
\set ON_ERROR_STOP on
begin;

do $$
declare
  v_tok text; v_sub uuid; v_card uuid; v_card2 uuid; v_lot uuid; v_lot2 uuid;
  r public.cards; l public.grading_lots; j jsonb; n int; ok boolean;
begin
  -- Website intake (security definer, as anon) still works with a grading company and makes no lot.
  j := public.intake_submit('{"name":"Test Person","email":"t@example.com","cards":[
        {"name":"Card A","grading":"PSA"},{"name":"Card B","grading":"CGC"},{"name":"Card C","grading":"Not sure yet"}]}'::jsonb);
  v_tok := j ->> 'token';
  select id into v_sub from public.submissions where code = j ->> 'code';
  v_card := (j -> 'card_ids' ->> 0)::uuid;
  v_card2 := (j -> 'card_ids' ->> 1)::uuid;
  if (select count(*) from public.grading_lots) <> 0 then raise exception 'intake should not create lots'; end if;

  -- Map: every company list → normalized.
  if public.map_grading_stage('PSA', 'psa_research_id') <> 'research_id' then raise exception 'map psa'; end if;
  if public.map_grading_stage('CGC', 'cgc_qc') <> 'qa_assembly' then raise exception 'map cgc'; end if;
  if public.map_grading_stage('BGS', 'bgs_invoicing') <> 'order_prep' then raise exception 'map bgs'; end if;
  if public.map_grading_stage('TAG', 'tag_pending_receipt') <> 'shipped_to_grader' then raise exception 'map tag'; end if;
  if public.map_grading_stage('TAG', 'rr_on_hold') <> 'on_hold' then raise exception 'map on hold'; end if;

  -- Stage on a PSA card: normalized stage, lot per order + company, history row.
  update public.cards set grader_stage = 'rr_preparing' where id = v_card returning * into r;
  if r.grading_stage <> 'preparing' or r.grading_lot_id is null or r.grading_stage_at is null then raise exception 'sync failed: %', row_to_json(r); end if;
  v_lot := r.grading_lot_id;
  if (select count(*) from public.grading_stage_events where card_id = v_card) <> 1 then raise exception 'history not logged'; end if;

  -- Shipped to grader: shipped_at set once, balance due 14 days later (Central).
  update public.cards set grader_stage = 'rr_shipped_to_grader' where id = v_card;
  select * into l from public.grading_lots where id = v_lot;
  if l.shipped_at is null or l.balance_due_on <> ((now() at time zone 'America/Chicago')::date + 14) then raise exception 'ship clock: %', row_to_json(l); end if;

  -- Estimate + 50/50 amounts (odd cent: halves still add up).
  update public.grading_lots set est_fee = 100.01 where id = v_lot returning * into l;
  if l.first_half_amount <> 50.01 or l.second_half_amount <> 50.00 then raise exception 'halves: %', row_to_json(l); end if;
  update public.grading_lots set est_fee = 79.98 where id = v_lot returning * into l;
  if l.first_half_amount <> 39.99 or l.second_half_amount <> 39.99 then raise exception 'halves2: %', row_to_json(l); end if;

  -- Received at RR does not touch the work status.
  update public.cards set status = 'restored' where id = v_card;
  update public.cards set grader_stage = 'psa_shipped' where id = v_card;
  update public.cards set grader_stage = 'rr_received_at_rr' where id = v_card returning * into r;
  if r.status <> 'restored' or r.grading_stage <> 'received_at_rr' then raise exception 'received_at_rr changed work status: %', r.status; end if;

  -- Wrong company's stage is rejected.
  ok := false;
  begin update public.cards set grader_stage = 'cgc_grading' where id = v_card; exception when others then ok := true; end;
  if not ok then raise exception 'PSA card accepted a CGC stage'; end if;
  -- "Not sure yet" can't have a stage.
  ok := false;
  begin update public.cards set grader_stage = 'rr_preparing' where submission_id = v_sub and card_number = 3; exception when others then ok := true; end;
  if not ok then raise exception 'Not sure yet card accepted a stage'; end if;

  -- Switching company drops the old company's stage, keeps an RR stage, and moves the card to the new lot.
  update public.cards set grading = 'BGS' where id = v_card returning * into r;
  if r.grader_stage <> 'rr_received_at_rr' then raise exception 'rr stage should survive a company switch'; end if;
  if r.grading_lot_id = v_lot then raise exception 'card should move to the BGS lot'; end if;
  update public.cards set grader_stage = 'bgs_grading' where id = v_card;
  update public.cards set grading = 'TAG' where id = v_card returning * into r;
  if r.grader_stage <> '' or r.grading_stage <> '' then raise exception 'bgs stage should be dropped on switch to TAG'; end if;
  update public.cards set grading = 'CGC', grader_stage = 'cgc_received' where id = v_card returning * into r;
  if r.grading_stage <> 'received_by_grader' then raise exception 'same-update company + stage'; end if;

  -- Two CGC cards on one order share one lot.
  update public.cards set grader_stage = 'cgc_grading' where id = v_card2 returning * into r;
  select grading_lot_id into v_lot2 from public.cards where id = v_card;
  if r.grading_lot_id <> v_lot2 then raise exception 'one lot per order + company'; end if;
  if (select count(*) from public.grading_lots where submission_id = v_sub and grader = 'CGC') <> 1 then raise exception 'duplicate lot'; end if;

  -- Clearing the company clears stage and lot.
  update public.cards set grading = '' where id = v_card2 returning * into r;
  if r.grader_stage <> '' or r.grading_lot_id is not null then raise exception 'clear company'; end if;

  -- On hold.
  update public.cards set grader_stage = 'rr_on_hold' where id = v_card returning * into r;
  if r.grading_stage <> 'on_hold' then raise exception 'on hold'; end if;

  -- Customer link: lots with amounts + paid dates, never internal notes.
  update public.grading_lots set internal_notes = 'SECRET-INTERNAL', notes = 'visible note', est_fee = 60,
         second_half_paid_at = now() where id = v_lot;
  j := public.portal_get(v_tok);
  if position('SECRET-INTERNAL' in j::text) > 0 then raise exception 'internal notes leaked'; end if;
  select count(*) into n from jsonb_array_elements(j -> 'submissions' -> 0 -> 'grading_lots') x
   where x ->> 'id' = v_lot::text and (x ->> 'first_half_amount')::numeric = 30 and x ->> 'second_half_paid_at' is not null;
  if n <> 1 then raise exception 'portal_get lots: %', j -> 'submissions' -> 0 -> 'grading_lots'; end if;
  if jsonb_array_length(j -> 'submissions' -> 0 -> 'cards' -> 0 -> 'grading_history') < 3 then raise exception 'portal_get history'; end if;

  -- Bad estimate rejected.
  ok := false;
  begin update public.grading_lots set est_fee = -1 where id = v_lot; exception when others then ok := true; end;
  if not ok then raise exception 'negative estimate accepted'; end if;

  raise notice 'grading_stages: all checks passed';
end $$;

rollback;
