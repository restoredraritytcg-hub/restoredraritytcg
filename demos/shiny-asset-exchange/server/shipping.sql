-- Shiny Asset Exchange — shipping columns for the work portal (run in the SAE Supabase project, after the
-- Restored Rarity schema.sql copy). Idempotent. NOT YET RUN anywhere.
alter table public.submissions add column if not exists return_address jsonb;   -- {line1,line2,city,state,zip} from the intake form
alter table public.submissions add column if not exists return_shipment jsonb;  -- Shippo label: {carrier,service,tracking,cost,transaction,label_url,eta,status,events[],...}
create index if not exists submissions_return_tracking on public.submissions ((return_shipment->>'tracking'));
-- portal_get(token) returns submissions with s.* so return_shipment shows on the customer's link once added there;
-- intake_submit should also save p->'return_address' (one extra column in its insert).
-- The shop's own tables (products, variants, stock_movements, orders with a `shipment jsonb` column) are still to be
-- written — see the demo README "Going live".
