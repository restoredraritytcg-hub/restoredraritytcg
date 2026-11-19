# AGENTS.md — Shiny Asset Exchange demo

Project brief for AI coding agents (Cursor, Grok, Claude, Codex…). Read this before changing anything.

## What this is

A **pitch demo**: a rebuild of shinyassetexchange.com (today a Shopify store) built by Restored Rarity to show the
owner of Shiny Asset Exchange (SAE) what a custom site could do. SAE is **a card restoration company first and a
card-care product company second** — every page and menu is ordered that way.

It has three parts, all static files (no build step), all running **in the browser on demo data**:

| Part | Entry | What it does |
|---|---|---|
| Storefront | `index.html` + `shop.js` | Home, Pricing, Free Card Review quiz, Submit Cards (restoration intake), Order Status, FAQ, Products (shop with inventory), product pages, cart, checkout (Stripe-style test cards), Tools, Recs, policies. |
| Shop admin | `admin.html` + `admin.js` | Dashboard, orders, **Shipping (Shippo)**, inventory + stock history, product editor, shop customers, prices & shop settings. Any password works in the demo. |
| Work portal | `portal/admin.html` (+ `view.html`, `scan.html`) | A rebranded copy of the **Restored Rarity work portal**: restoration submissions, cards, statuses, quotes, scans/centering, customer private links, PSA tracking, Return shipping, Website section (announcement, news, events, Instagram). |

Nothing is charged or sent anywhere: payments use Stripe **test** card numbers in a fake form, shipping labels are
simulated Shippo calls, data lives in `localStorage`. The live backend is **planned, not built** (see "Going live").

## Run it

```bash
npm install            # Playwright, only needed for the tests
npm start              # serves this folder on http://localhost:8765 (no caching)
# or: python3 -m http.server 8765
```

- Store: `http://localhost:8765/index.html` · Shop admin: `/admin.html` · Work portal: `/portal/admin.html`
- Test cards: `4242 4242 4242 4242` works, `4000 0000 0000 0002` is declined (any future date, any CVC).
- **Reset demo data:** Shop admin → Prices & shop settings → "Reset demo data" (resets shop + portal), or clear site data.

## Tests

```bash
npx playwright install chromium   # once
npm start                          # in one terminal
npm test                           # in another: runs tests/e2e/run-all.js
```

Plain Node + Playwright scripts (not the Playwright test runner). Each prints what it checked and ends with
`ERRORS [...]`; a non-empty list sets a failing exit code. Screenshots go to `test-output/` (git-ignored).

| Script | Covers |
|---|---|
| `shop-flow.js` | home, product → cart → checkout (declined then approved card), stock goes down, quiz, intake, info pages, admin pages, ship an order, receive stock, phone width |
| `intake-to-portal.js` | Submit Cards → SAE-#### in the portal → quote → card service editor → announcement round trip → customer link → Order Status, phone width |
| `shipping-shippo.js` | Priority Mail checkout → Shipping queue → rates → buy → print label → scans to Delivered → customer tracking → bulk buy → void → portal Return shipping → customer link → live checkout rates |
| `all-pages.js` | every storefront page at 1280 and 390 px: no JS errors, no sideways scroll |

**Run the suite after every change.** Also check pages at 390 px wide (phones): no horizontal scroll.

## File map

| File | Role |
|---|---|
| `seed.js` | SAE's 11 real products (copy, options, prices, photo URLs from their Shopify CDN) — generated, don't hand-edit copy. |
| `content.js` | Their FAQ / Tools / Recs / Privacy copy **word for word**, and the Free Card Review quiz (questions + verdict logic ported from their site; fees read from the price list). |
| `data.js` | Shop data layer `store`: products, variants (price, cost, stock, low-stock level, packed `weight_oz`), stock movements log, orders, shop customers, site settings (`DEFAULT_CONTENT`), `totals()` (shipping method + tax), `quote()` (restoration pricing), demo payment. localStorage key `sae-demo-v3`. |
| `shop.js` | Storefront hash router (`#/`, `#/pricing`, `#/review`, `#/submit`, `#/status`, `#/faq`, `#/shop`, `#/p/<handle>`, `#/cart`, `#/checkout`, `#/thanks/<id>`, `#/my/<token>`, `#/tools`, `#/recs`, `#/privacy`, `#/agreement`). |
| `admin.js` | Shop admin hash router (`#/`, `#/orders`, `#/order/<id>`, `#/ship`, `#/inventory`, `#/product/<id|new>`, `#/stock`, `#/customers`, `#/customer/<id>`, `#/site`). |
| `shipping.js` | Shipping built around **Shippo**: queue (paid orders + restorations Ready that ship back), Shippo client (simulated in demo; live via the server function), `recordLabel`, tracking (`applyTracking`), void, printable label, rates widget shared with the portal, Pirate Ship spreadsheet export as a fallback. |
| `sae.css` | Base styles (store + shop admin). |
| `polish.css` | The polished look (see Design). Loaded by the storefront and shop admin. |
| `cardsearch.js` | Card-name suggestions (21k English cards); loads `https://restoredraritytcg.com/portal/cards.json`. Same file as Restored Rarity's — keep identical. |
| `portal/demostore.js` | The work portal's browser "database" (same tables as Restored Rarity's Supabase schema: customers, submissions, cards, scans, photos, site_content). `intake()` = the `intake_submit` RPC. localStorage key `sae-portal-v3`. |
| `portal/common.js` | Portal data API: `realApi` (Supabase) and `demoApi` (→ demostore). Demo mode is on while `portal/config.js` has placeholder values. |
| `portal/site.js` | Portal Website section + Quote panel. **SAE change:** prices come from the shop's list (`saePrices()`), quotes from `saeQuoteCard()`. |
| `portal/admin.js`, `view.js`, `psa.js`, `scan*.js`, `centering.js` | Restored Rarity portal code (rebranded). SAE changes in `admin.js`: per-card extras (Card Review, Estimated Grade, Express Lane), % tier, Return shipping panel. |
| `portal/returnship.js` | Portal Return shipping panel + tracking on the customer's link. |
| `server/supabase/functions/shippo/index.ts` | **Going live:** Supabase Edge Function holding the Shippo token (`rates`, `buy`, `void`, `quote`, tracking webhook). Passes `deno check`; **never deployed or run against Shippo.** |
| `server/shipping.sql` | `submissions.return_address` / `return_shipment` columns for the live portal. |
| `brand/` | **Logo refresh concept** (a pitch, not their adopted logo): SVG/PNG versions, pitch PDF; `brand/source/make_logo.py` rebuilds them (see `brand/README.md`). |
| `tests/e2e/` | The checks above. |

## How the pieces connect

- **One price list.** `data.js` → `content.prices` (restoration tiers by card value, cleaning, add-ons) is the only source.
  Read by the Pricing page, the quiz (`assessResult`), the Submit Cards quote (`quote()`), and the portal
  (`portal/site.js` `saePrices()` / `saeQuoteCard()`). Edit prices in Shop admin → Prices & shop settings.
- **Restorations live in the portal, products in the shop.** Submit Cards → `PS.intake(payload)` creates customer +
  `SAE-####` submission + cards + intake photos in `portal/demostore.js`; the customer gets `portal/view.html#t=<token>`.
  Delivery, return address, insurance and source go to `internal_notes` (never shown to customers) and
  `submissions.return_address`.
- **Service text wording** (parsed by the portal editor and quotes — keep it exact):
  `Restoration — Tier 1 ($80) + Card Review ($5) + Slab Cracking ($10) + Grading Submission ($20) — grading: PSA`,
  `Cleaning ($20)`. "Grading Submission" = SAE's Grade Prep & Ship (one fee per submission).
- **Statuses.** Restorations: `submitted → received → in_progress → restored → ready → completed`.
  Shop orders: `paid → fulfilled` (+ `refunded`, `cancelled`).
- **Shipping.** Queue = paid orders without a label + submissions `ready` that ship back (not "Drop-off").
  Buy label → order `fulfilled` / return gets `return_shipment`; tracking `DELIVERED` → submission `completed`.
- **Website content** (announcement, news, shows, Instagram) is edited in the portal's Website section
  (`site_content`) and read by `shop.js` via `PS.siteContent(key)`.
- **Stock** only changes through `store.adjustStock` / `setStock` / orders, so every change is in the stock log.
- **Changing seed data** (products, defaults, sample orders): bump the localStorage version (`sae-demo-vN` in
  `data.js`, `sae-portal-vN` in `portal/demostore.js`) so browsers reseed, and update the tests' keys.

## Design (keep it consistent)

- Restored Rarity's design language in SAE's colours: black `#08080a`, logo red `#e3202a` (deep `#a8121b`),
  warm gold `#e8c27e` (from their Instagram price list), text `#f5f2f3`.
- Fonts: **Space Grotesk** (everything) + **Playfair Display italic** for small gold accent lines (`.script`).
- Building blocks in `polish.css`: `pageHead()` / `.page-head` (script line + gradient `h1.grad` + intro), `secHead()` /
  `.sec-head` (eyebrow + uppercase h2 with red→gold underline), `.btn.red` (primary), `.btn.ghost` (gold outline),
  `.btn.gold`, `.panel`, `.callout`, `.notice` (gold tag), `.group-label` + `.tier` ladder with round price badges,
  `.cta-band`, `.promo` (glowing strip), `.step-h` (numbered form steps), `.rv` (fade in on scroll; `reveal()` runs after
  every route).
- Restoration first: header = Pricing · Free Card Review · Submit Cards · Order Status · FAQ · Products + red
  "Restore My Card"; Tools/Recs live in the footer and phone menu. Home: restoration sections before products.
- Every page must work at 390 px with no sideways scroll; inputs are 16 px (no iOS zoom).

## Decisions already made (don't relitigate without asking)

- Restoration first, products second. Polished Restored Rarity-style look, not Shopify's.
- **Their copy word for word** (from shinyassetexchange.com, Nov 2026). Deliberate deviations: Submit Cards takes many cards
  in one form (their Jotform was one per form); home chips and the can/can't-fix panel summarise their FAQ; added headings.
- Backend when going live: **Supabase** (Postgres/Auth/Storage/Edge Functions) — same as Restored Rarity.
- Payments: **Stripe** (Checkout Sessions + webhook). Shipping: **Shippo API** (Pirate Ship has no API; its spreadsheet
  export is kept as a fallback). Work portal = Restored Rarity's portal.
- Express Lane ($50/card) is on their website but not on their Instagram price list — kept; owner asked to confirm.

## Rules

- **Never put secrets in front-end files**: Stripe secret key, Shippo API token, Supabase `service_role` key. They belong
  in Edge Function secrets. Publishable/anon keys are fine.
- Pages are `noindex`. Don't deploy this anywhere that could pass for SAE's real site; it's shown to their owner.
- Product photos and the current logo load from SAE's Shopify CDN (`shiny-asset-exchange.myshopify.com/cdn/shop/…`).
- No customer data in the repo. Sample people use `@example.com`.
- Escape everything rendered into HTML with `esc()`. No frameworks, no build step, ES modules only.
- Keep `cardsearch.js` identical to Restored Rarity's `portal/cardsearch.js`.

## Going live (not built)

1. Supabase project for SAE: Restored Rarity's `supabase/schema.sql` (portal tables, RLS, `intake_submit`, `portal_get`) +
   `server/shipping.sql` + new shop tables (`products`, `variants`, `stock_movements`, `orders`/`order_items` with
   `shipment jsonb`, `site_content`). Fill `portal/config.js` (that alone switches the portal from demo to Supabase).
2. Stripe: Edge Function `create-checkout` (re-price the cart server-side → Checkout Session) + `stripe-webhook`
   (`checkout.session.completed` → write order + decrement stock in one transaction); restoration invoices via Checkout
   Session or Payment Link.
3. Replace `store` in `data.js` with Supabase calls (same method names), and the storefront intake's `PS.intake` with the
   `intake_submit` RPC (Restored Rarity's `index.html` `portalRpc` shows how, with plain `fetch`).
4. Shippo: deploy `server/supabase/functions/shippo` with secrets `SHIPPO_API_TOKEN` (test key first) +
   `SHIPPO_WEBHOOK_SECRET`, add a `track_updated` webhook, then set mode + function URL in Shop admin → Shippo.
5. Emails (order confirmation, status updates), real domain cut-over from Shopify.

## Origin

Built Nov 18–19, 2026 in `restoredraritytcg-hub/restoredraritytcg` (folder `demos/shiny-asset-exchange/`, branch
`claude/upbeat-volta-l5jlbh`). The portal is a copy of that repo's `portal/` and does **not** sync automatically.
