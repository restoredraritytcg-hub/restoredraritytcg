-- One-time update (Nov 22, 2026): Card Cleaning and Grade-Ready Evaluation bulk tiers.
-- Paste into Supabase -> SQL Editor -> Run. Safe to re-run.
-- Does NOT change any other service price (repairs, scratch repair, slab cracking,
-- grading submission $15 / $5, PSA levels, surcharges, or referral discount).
--
-- The prices row is what the website and quotes use after Website → Prices has been saved.
-- If that row does not exist yet, the site uses the built-in list in index.html instead,
-- and this update changes nothing.
--
-- Both services use the same bands. One rate applies to every card of that service.
-- The tier follows the order's card count.
--
-- Card Cleaning (the service price, unchanged at $10, covers 1–25 cards):
--   26–50 cards       $7.50 per card
--   51 or more cards  $5 per card
-- Grade-Ready Evaluation (the service price, unchanged at $20, covers 1–25 cards):
--   26–50 cards       $16 per card
--   51 or more cards  $14 per card

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
