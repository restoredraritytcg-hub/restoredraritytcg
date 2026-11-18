# Shiny Asset Exchange — demo site (built Nov 18, 2026)

A pitch/demo rebuild of shinyassetexchange.com (currently a Shopify store) on the same kind of stack as
Restored Rarity's site + portal, with **inventory control, cart and Stripe-style checkout** added.
Copy, products, prices and photos come from their live site (product photos load from their Shopify CDN).
Stock counts and sample customers/orders are made up.

**Demo only.** Everything is stored in the viewer's browser (localStorage), and the payment form takes
Stripe's test card numbers and charges nothing. Pages carry `noindex`. Don't put it on a public URL as if it
were their site; show it to the business owner.

## Open it

```
cd demos/shiny-asset-exchange && python3 -m http.server 8765
```
- Store: http://localhost:8765/index.html
- Shop admin (orders, inventory, stock, prices): http://localhost:8765/admin.html (any password in the demo)
- **Work portal** (restorations — the Restored Rarity portal): http://localhost:8765/portal/admin.html
- Customer's private restoration page: the link shown after submitting on Submit Cards (`portal/view.html#t=…`)
- Scan station: http://localhost:8765/portal/scan.html

Test cards: `4242 4242 4242 4242` (works), `4000 0000 0000 0002` (declined), any future date, any CVC.

## What's in it

Storefront (`index.html` + `shop.js`), the same pages and wording as their site, **restoration first, products second**
(header: Pricing · Free Card Review · Submit Cards · Order Status · FAQ · Products + a "Restore My Card" button; Tools and
Recs live in the footer and the phone menu). Every page uses the polished design in `polish.css`:
- Home (hero, how-it-works graphic, featured products, Bestseller), Products (collections), product pages with
  sizes, live stock status (In stock / Low stock / Sold out), quantity, Add to cart / Buy it now.
- Cart drawer + cart page, checkout (contact, address, card payment), order confirmation. Checkout re-checks
  stock and won't overbook. Shipping/free-shipping threshold/sales tax come from admin settings.
- Pricing (from saved prices), **Free Card Review** quiz (their exact questions and verdict logic, now using saved
  prices).
- **Submit Cards = restoration & repair intake**, working like Restored Rarity's: one form for many cards (their
  Jotform did one card per form), card-name suggestions (the 21k-card list from restoredraritytcg.com), value,
  service (restoration & repair / cleaning), add-ons, grading company for Grade Prep & Ship, damage notes,
  front/back photos, delivery (ship + insured return / Austin drop-off), live quote, weekly 40-card queue
  message, Non Liability Agreement checkbox. Submitting calls `intake()` (= `intake_submit`), which creates the
  customer, an `SAE-…` submission, its cards and intake photos **in the work portal**, and gives the customer
  their private portal link. Delivery/address/source go to internal notes (never shown to the customer).
- **Order Status**: look up a shop order (#1001) or a restoration (SAE-1041) with your email.
- Home page: announcement bar, upcoming shows, news and an **Instagram** section (@shinyassetexchange, Follow
  button + up to 6 embedded posts), all managed in the work portal's Website section.
- `#/my/<token>`: the shop customer's order page.
- FAQ, Recs, Tools, Privacy, Non Liability Agreement.

Admin (`admin.html` + `admin.js`):
- Dashboard: sales today / 30 days, orders to ship, this week's queue vs capacity, stock alerts, best sellers.
- **Inventory**: every product option with SKU, price, on-hand count (type a count + Enter), low-stock level,
  status, quick −1/+1, "Receive…" (add/remove with a reason + note), filters, search, CSV export, value at
  retail/cost.
- Product editor: title, text, photos (upload or URL), collection, draft/active, home-page feature, options
  (size), SKU, price, cost, low-stock level, track inventory on/off, opening stock.
- **Stock history**: every change with reason (sale, refund, received, damaged, studio use, count), linked orders.
- Orders: to ship / shipped / refunded / cancelled; ship with carrier + tracking; refund or cancel with restock.
- Shop customers (orders, spend, private order link) and **Prices & shop settings**: restoration tiers,
  cleaning, add-ons, weekly capacity, home-page text, shipping/tax, Stripe keys, contact + drop-off, reset demo.
  This is the **one price list**: the Pricing page, the quiz, the Submit Cards quote and the work portal all read it.

Work portal (`portal/`) — a copy of Restored Rarity's `portal/`, rebranded, running on a browser-saved store
(`portal/demostore.js`, same tables as `supabase/schema.sql`):
- Submissions list with status filters and ✉ Needs email, submission page (status bar, Quote, PSA submission
  tracker, notes, cards, Services & levels editor, photos, 📷 Scan), All cards, card pages (scans, close-ups,
  centering tool, before/after), Customers with private links, + New for walk-ins, Scan station.
- Website: Prices (points to the shop's list), Announcement, News, Events, Instagram.
- Changes for Shiny Asset Exchange: SAE-codes; menu = Cleaning / Restoration — Tier 1–4 (Tier 4 = 10% of value) /
  Slab Cracking / Grading Submission (= Grade Prep & Ship, one fee per submission) plus per-card extras
  (Card Review, Estimated Grade, Express Lane) as checkboxes; quotes use the shop's rules; no Reviews tab (no
  Apps Script); demo images saved as data URLs.


## Shipping — built around Shippo

Product orders **and** restored cards going home share one workflow (shop admin → **Shipping**):

1. **Queue** — paid product orders + restorations set to “Ready for pickup / shipping” that ship back (not Austin drop-offs).
   Box, weight (from each product option's packed weight, or ½ oz per card + the card box) and insured value (card values
   from the intake, unless the customer said no) are filled in and editable.
2. **Get rates → Buy label** (Shippo `POST /shipments` → `POST /transactions`). The customer's chosen service is
   pre-selected; “Buy labels” does every ticked shipment at once. **Print label** opens the 4×6 label PDF.
3. **Tracking** — Shippo's `track_updated` webhook moves each label Label created → In transit → Out for delivery →
   Delivered (demo: **Simulate scan**). Delivered card returns complete their submission automatically.
4. **Void** an unused label (Shippo `POST /refunds`).

Also: the work portal's submission page has a **Return shipping** panel (edit the return address, rates, buy, track);
customers see carrier, tracking link, status, scans and ETA on Order Status and their private link; checkout offers
USPS Ground Advantage / Priority Mail at flat prices **or live Shippo rates** (setting); the intake collects the return
address as fields; a spreadsheet export remains for anyone who prefers Pirate Ship.

| File | |
|---|---|
| `shipping.js` | Queue, Shippo client (demo simulation / live via the server function), labels, tracking, rates widget. |
| `portal/returnship.js` | Work portal Return shipping panel + customer-link tracking. |
| `server/supabase/functions/shippo/index.ts` | **Going live:** Supabase Edge Function holding the Shippo token: `rates`, `buy`, `void` (admins only), `quote` (checkout), and the tracking webhook. Type-checks with Deno; **not yet deployed or run against Shippo.** |
| `server/shipping.sql` | `submissions.return_address` / `return_shipment` columns for the portal. |

Going live with Shippo: create a Shippo account → API token (test first: `shippo_test_…`) → `supabase functions deploy shippo`
with secrets `SHIPPO_API_TOKEN` and `SHIPPO_WEBHOOK_SECRET` → in Shippo add a `track_updated` webhook to
`https://<project>.supabase.co/functions/v1/shippo?webhook=<secret>` → in Shop admin → Prices & shop settings → Shippo set
the mode and the function address. Cost (third-party figures, check Shippo's pricing page): ~30 free API labels a month,
then roughly 5–7¢ a label; postage is separate. The demo's rates are simulated estimates, not Shippo's prices.

## Files

| File | |
|---|---|
| `seed.js` | Their 11 products (copy, options, prices, photo URLs) + demo stock. |
| `content.js` | FAQ / Tools / Recs / Privacy copy, the Free Card Review questions and verdict logic. |
| `data.js` | Data layer (`store`): catalogue, stock movements, orders, customers, submissions, settings, quote math, demo payments. |
| `shop.js` / `index.html` | Storefront. |
| `admin.js` / `admin.html` | Admin portal. |
| `sae.css` | Base styles for the store and shop admin. |
| `polish.css` | Storefront look in the Restored Rarity style (owner's request, Nov 18): glow background, Space Grotesk + Playfair Display italic, gradient headlines, glowing Free Card Review strip, numbered steps, can/can't-fix panels, price tiles, pricing ladder with round badges + calculator, red CTA band, branded footer, fade-in on scroll. Colours: black, logo red #e3202a, gold #e8c27e (from their Instagram price list). |
| `cardsearch.js` | Copy of `portal/cardsearch.js`, set to load restoredraritytcg.com's `cards.json`. |
| `brand/` | **Logo refresh concept** to pitch: badge, horizontal (dark/light), round mark, app icon (SVG + PNG) and a one-page pitch sheet PDF. See `brand/README.md`. |
| `portal/` | The work portal (copy of the RR portal). Changed vs RR: `common.js` (demo store), `site.js` (SAE prices/quotes, tabs), `admin.js` (SAE menu + extras), `config.js`, `portal.css` (theme), page titles. `demostore.js` is new. |

## Going live (not built yet)

1. **Supabase** (one project for them): tables mirroring `data.js`: `products`, `variants` (sku, price, cost,
   stock, low_at, track), `stock_movements`, `customers` (share_token), `orders` + `order_items`,
   `submissions` + `submission_cards`, `site_content`. RLS admin-only like `supabase/schema.sql`; customers use
   SECURITY DEFINER RPCs (`portal_get(token)`, `intake_submit`). Photos in Storage.
2. **Stripe**: a Supabase Edge Function `create-checkout` that re-prices the cart from the database and creates a
   Stripe Checkout Session (Stripe Tax optional); a `stripe-webhook` function that, on
   `checkout.session.completed`, writes the order and decrements stock in one transaction. Restoration invoices:
   a Checkout Session (or Payment Link) per invoice. Secret key only in the function's secrets.
3. Replace `store` in `data.js` with Supabase calls (same method names), point the payment step at the function.
   The work portal needs only `portal/config.js` filled in (it already has the Supabase code), plus RR's
   `schema.sql` + SQL files run in the new project; the website intake then calls `intake_submit` like RR's.
4. Instagram prices: their Instagram (@shinyassetexchange, 256 posts) only shows posts to signed-in visitors,
   so prices there couldn't be read. Prices in this demo come from their website's Pricing page.
5. Emails: Supabase/Resend or their Gmail via Apps Script (as on Restored Rarity).
6. Domain: move shinyassetexchange.com off Shopify once they're happy (keep Shopify until orders are moved).
