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

Storefront (`index.html` + `shop.js`), the same pages and wording as their site:
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
