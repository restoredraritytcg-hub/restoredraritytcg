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
- Admin: http://localhost:8765/admin.html (any password in the demo)

Test cards: `4242 4242 4242 4242` (works), `4000 0000 0000 0002` (declined), any future date, any CVC.

## What's in it

Storefront (`index.html` + `shop.js`), the same pages and wording as their site:
- Home (hero, how-it-works graphic, featured products, Bestseller), Products (collections), product pages with
  sizes, live stock status (In stock / Low stock / Sold out), quantity, Add to cart / Buy it now.
- Cart drawer + cart page, checkout (contact, address, card payment), order confirmation. Checkout re-checks
  stock and won't overbook. Shipping/free-shipping threshold/sales tax come from admin settings.
- Pricing (from saved prices), **Free Card Review** quiz (their exact questions and verdict logic, now using saved
  prices), **Submit Cards**: one form for many cards (their Jotform did one card per form), card-name
  suggestions (the 21k-card list from restoredraritytcg.com), photos, live quote, weekly 40-card queue message,
  Non Liability Agreement checkbox.
- **Order Status**: look up a shop order (#1001) or a restoration (SAE-1041) with your email.
- **Private customer link** (`#/my/<token>`, like the RR portal): every restoration (timeline, cards, notes,
  invoice) and shop order; **Pay invoice** by card.
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
- Restoration submissions: status flow (submitted → invoice sent → paid → received → in progress → restored →
  shipped back → completed), per-card value/service/add-ons/status with the price recalculated, customer and
  internal notes, **Send invoice** (email with a pay link), mark paid (cash / trade), "✉ needs email" tracking
  like the RR portal, + New submission for walk-ins.
- Customers: orders, submissions, spend, private link (copy / new link).
- Website & prices: announcement bar, home-page text, restoration tiers, cleaning, add-ons, weekly capacity,
  shipping/tax, Stripe keys, contact + drop-off details, reset demo data.

## Files

| File | |
|---|---|
| `seed.js` | Their 11 products (copy, options, prices, photo URLs) + demo stock. |
| `content.js` | FAQ / Tools / Recs / Privacy copy, the Free Card Review questions and verdict logic. |
| `data.js` | Data layer (`store`): catalogue, stock movements, orders, customers, submissions, settings, quote math, demo payments. |
| `shop.js` / `index.html` | Storefront. |
| `admin.js` / `admin.html` | Admin portal. |
| `sae.css` | Styles for both (their theme colours: #121212, red #cc0000). |
| `cardsearch.js` | Copy of `portal/cardsearch.js`, set to load restoredraritytcg.com's `cards.json`. |

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
4. Emails: Supabase/Resend or their Gmail via Apps Script (as on Restored Rarity).
5. Domain: move shinyassetexchange.com off Shopify once they're happy (keep Shopify until orders are moved).
