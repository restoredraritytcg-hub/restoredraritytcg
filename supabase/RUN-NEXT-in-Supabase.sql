-- =====================================================================
--  RUN NEXT IN SUPABASE
--  Supabase → SQL Editor → New query → paste ALL of this file → Run.
--  Safe to run more than once.
--
--  Waiting to be run (newest last):
--    • 2026-11-22_cleaning_eval_pricing.sql — Card Cleaning and Grade-Ready
--      Evaluation bulk tiers. Does not change any other service price.
--
--  After you run it, tell Claude "I ran the Supabase update" and this
--  file is emptied until the next one. Every update is also kept in its
--  own dated file in this folder (e.g. 2026-11-13_psa_tracking.sql).
-- =====================================================================

-- One-time update (Nov 22, 2026): Card Cleaning and Grade-Ready Evaluation bulk tiers.
-- Does NOT change any other service price (repairs, scratch repair, slab cracking,
-- grading submission $15 / $5, PSA levels, surcharges, or referral discount).
--
-- Both services use the same bands. One rate applies to every card of that service.
-- The tier follows the order's card count.
-- Card Cleaning (the service price, unchanged at $10, covers 1–25 cards):
--   26–50 cards       $7.50 per card
--   51 or more cards  $5 per card
-- Grade-Ready Evaluation (the service price, unchanged at $20, covers 1–25 cards):
--   26–50 cards       $16 per card
--   51 or more cards  $14 per card
-- If the prices row does not exist yet, this changes nothing (the site uses its built-in list).

update public.site_content
set value = jsonb_set(
      jsonb_set(
        value,
        '{bulk}',
        '[{"min":26,"price":7.5},{"min":51,"price":5}]'::jsonb,
        true
      ),
      '{evalBulk}',
      '[{"min":26,"price":16},{"min":51,"price":14}]'::jsonb,
      true
    )
where key = 'prices'
  and jsonb_typeof(value) = 'object';

