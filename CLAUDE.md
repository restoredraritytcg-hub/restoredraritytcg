# Restored Rarity — Card Portal, Scan Station & Desktop Scanner

Context for Claude Code. Restored Rarity is a trading card restoration business (cleaning, repair,
grading prep). This adds a card-intake and customer portal to the existing site
(restoredraritytcg.com, GitHub Pages, repo `restoredraritytcg-hub/restoredraritytcg`).

## What's here

| Path | What it is |
|---|---|
| `portal/` | Static web app (no build step). Deployed as-is under `/portal/` on GitHub Pages. |
| `portal/admin.html` + `admin.js` | Owner's admin portal (Supabase email/password login): submissions, all cards, customer profiles, card detail, photos, notes, statuses, customer links. Hash router (`#/`, `#/cards`, `#/customers`, `#/customer/<id>`, `#/submission/<id>`, `#/card/<id>`, `#/new[/<customerId>]`). |
| `portal/view.html` + `view.js` | Customer view opened by a private link `view.html#t=<share_token>` (no login). Shows everything on that customer's profile; customer can upload/delete their own photos. |
| `portal/scan.html` + `scan.js` | **Scan station** (Mac or Windows, Chrome/Edge): watches a scan folder via the File System Access API, processes each new scan in the browser and saves it to the portal. Front → back → auto-save → next card. Moves originals into `<folder>/<code>/<code>_C001_<stage>_<side>.<ext>`. Folder handle remembered in IndexedDB. |
| `portal/scanproc.js` | Browser image processing: card detection, straighten/crop, corner/edge regions, centering measurement, dpi from PNG pHYs / JPEG JFIF/EXIF. Port of `desktop-scanner/cardcrop.py` + `detail.py`. |
| `portal/check.html` + `check.js` + `photoproc.js` | **Card Check**: public, no-login tool (no Supabase, nothing uploaded). Phone photo or scanner file → straightened card, centering (editable), corners/edges, surface relief view, PSA/CGC/BGS centering caps, eBay listing photos + text. `photoproc.js` flattens tilted phone photos (edge line fits → homography); files with ≥150 dpi metadata use the scan path (`scanupload.analyze`, up to 3 cards). |
| `portal/centering.js` | Interactive centering tool (plain script, `window.RRCentering`): zoom/pan canvas, draggable markers, save/reset. Used by portal and by the desktop app's local reports. |
| `portal/common.js` | Shared: data API (`realApi` = Supabase, `demoApi` = in-memory), card report renderer, lightbox, helpers. |
| `portal/cardsearch.js` + `cards.json` | Card-name suggestions (plain script, `window.RRCardSearch.attach(input[, {details}])`) on the intake form in `index.html` and the admin portal's card fields (add card, card detail, new submission). `cards.json` = 21k English cards from TCGdex, built by `tools/build_card_catalog.py`; pictures load from assets.tcgdex.net. Free typing still allowed. |
| `portal/config.js` | Supabase URL + anon key (public by design). **Never put the service_role key here.** Placeholder values ⇒ demo mode. |
| `portal/demo/` | Sample data/images for `?demo` previews (built by `tools/make_demo.py`). Optional to deploy. |
| `supabase/schema.sql` | Whole database: tables, RLS, RPC functions, storage bucket + policies. Idempotent — re-run safely in the Supabase SQL editor. |
| `desktop-scanner/` | Windows Python/Tk app (backup scanning path) for the Canon CanoScan LiDE 400 via WIA. Same processing in Python; pushes to Supabase with the service_role key stored locally in `config.json`. |
| `tools/make_demo.py` | Rebuilds `portal/demo/` from a desktop-scanner output folder. |
| `tests/` | `make_parity_images.py` (synthetic scans + Python results) and `parity.html` (runs `scanproc.js` on them). |

## Architecture & decisions (already made with the owner — don't relitigate)

- **Backend: Supabase** (Postgres + Storage + Auth). Free tier to start; Pro ($25/mo) recommended for real customers.
- **Customer access: private link per customer profile** (`customers.share_token`), no passwords. Admin can issue a new link (`admin_new_link`).
- **Customers see everything** (scans, close-ups, before/after, centering) except internal notes and ⚠ "check" warnings.
- **Photos**: from the intake form (`source='intake'`), added by admin (`'admin'`), or added by the customer (`'customer'`; they can delete only these).
- **Scanner hardware**: Canon CanoScan LiDE 400 (USB flatbed, no duplex — user flips the card). Chosen for budget + resolution. 1200 dpi default.
- **Full-res originals live in a Google Drive folder ("Card Scans")** synced to the owner's Mac and Windows PC. The portal stores processed JPGs only.
- **Scan station is the primary scanning path; the Windows desktop app is kept as a backup.** Both write the same storage layout and `scans` rows.
- Brand: dark navy/black, gold `#f5b301` and cyan `#2ad4e6` accents (Mewtwo mascot on the main site).

## Data model (see `supabase/schema.sql`)

`customers` (profile; `share_token` for the link, `storage_key` = random folder name) → `submissions`
(`code` like `RR-1042` from a sequence; status `submitted|received|in_progress|restored|ready|completed`;
`public_notes` / `internal_notes` / `customer_notes`) → `cards` (`card_number` unique per submission; same
status set and notes) → `scans` (unique `card_id, stage, side`; stage `before|progress|after`; `files` jsonb).
`photos` belong to a customer, optionally a submission/card.

`scans.files` shape:
```json
{"web": "path", "thumb": "path",
 "corners": {"top-left": "path", ...4}, "edges": {"top": "path", ...4},
 "boxes": {"top-left": [x0,y0,x1,y1], ...8},          // fractions of the image, for overlay hot-spots
 "centering": {"w_in","h_in","auto","lines": {"top@left": {"axis":"y","pos","outer","inner","found"}, ...8},
               "summary": {...}, "edited_at"?},
 "centering_auto": {...},                               // original auto measurement once a human edits
 "original": {"file": "RR-1042/RR-1042_C001_before_front.png", "folder": "Card Scans"}}
```
Storage bucket `portal` (public-read by exact URL, no listing except admin):
`s/<storage_key>/<code>/C001/<stage>/{side}_web_<ver>.jpg`, `.../corners/{side}_{corner}_<ver>.jpg`,
`.../edges/...`; admin photos `p/<storage_key>/<uuid>.jpg`; customer/intake uploads `u/<storage_key>/<uuid>.jpg`.
Versioned filenames bust caches; stale files are deleted on rescan.

## Security model

- RLS on every table: only emails in `admins` (via `is_admin()`) can read/write directly.
- Customers only use SECURITY DEFINER RPCs: `portal_get(token)` (never returns internal notes),
  `portal_add_photo`, `portal_delete_photo` (own `customer` photos only), and `intake_submit(jsonb)`.
- Storage: anon may only INSERT under `u/<valid storage_key>/`; admin full access. Image MIME types only, 25 MB cap.
- These rules were tested against a local Postgres with Supabase stand-ins (anon sees nothing, link ≠ other
  profiles, no cross-folder uploads, non-admin login sees nothing).

## Centering (owner's spec)

8 measurements per side: each border measured **0.5 in from each corner** (top@left, top@right, bottom@left,
bottom@right, left@top, left@bottom, right@top, right@bottom). Gold marker = card's outer edge, cyan = inner edge
of the border. L/R = avg left ÷ (left+right), same for T/B; displayed as e.g. `61/39` (second number = 100 − first).
Auto-detection flags `found:false` when the border isn't a uniform color (full-art cards) and lists sides whose two
measurements differ by > 0.025 in (`summary.check`). Admin can drag markers (constrained to their line), nudge with
arrow keys (Alt = outer marker), save, or reset to auto.

## Phone app (home-screen web app, no App Store)

- Admin portal installs from Safari → Share → Add to Home Screen as "RR Portal": `portal/manifest.webmanifest`
  (scope `portal/`, start `admin.html`), icons in `portal/icons/` (cropped from the site's Mewtwo logo), Apple
  meta tags in `admin.html` / `scan.html`. No service worker on purpose (uploads must never be served stale).
- Customer page `view.html` has Apple tags + icon ("My Cards") but **no manifest**, so iOS keeps the full private
  link; `view.js` also remembers the last valid token in localStorage (`rr-view-token`) and uses it when the hash
  has none.
- In-app there's no browser reload, so admin has a "↻ Refresh" button (reloads data). `installHint()` in
  `common.js` shows an install tip on iPhone Safari only (dismiss stored in `rr-install-hint`).
- Phones: compact sticky header (≤700px), 16px inputs (no iOS zoom), sign-in fields without autocapitalize/
  autocorrect and readable errors (`signInError`), centering markers use a 28px touch target.
- iPhone has no folder access, so the scan station falls back to "choose a file" there.

## Keep in sync

- `portal/centering.js` ⇄ `desktop-scanner/assets/centering.js` (identical copies).
- `portal/scanproc.js` ⇄ `desktop-scanner/cardcrop.py` + `detail.py` (same constants: crop pad 0.06 in, corner 0.40 in,
  edge 0.22 in, outside 0.06 in, centering search 0.75 in, default inner 0.125 in, thresholds).
- Storage path scheme and `scans.files` shape are shared by `portal/scan.js` and `desktop-scanner/uploader.py`.

## Testing

- Desktop/Python: `cd desktop-scanner && python tests/test_pipeline.py && python tests/test_centering.py && python tests/test_library.py`
  (needs `opencv-python numpy Pillow requests`; the GUI needs Tk on Windows).
- Browser parity: `python tests/make_parity_images.py tests/parity` then serve the repo root
  (`python -m http.server`) and run `runCase()` in `tests/parity.html`. JS and Python agree within 0.05 mm per border.
  Don't commit `tests/parity/` (large generated images).
- Portal preview without Supabase: serve `portal/` and open `admin.html?demo`, `view.html?demo#t=demo-token`, `scan.html?demo`.

## Status / next steps

1. **Done: intake wired.** There is no `intake.html`; the intake form lives in `index.html` (`#intake-form`).
   Decisions: **Apps Script stays in parallel** (it still does confirmation emails, referral codes, reviews,
   Track Your Submission and the Sheet; photos still go to Cloudinary too). **The portal code (`RR-1042`) is the
   customer's reference**: the form calls `intake_submit` first and sends that code to Apps Script as `id`.
   If `portal/config.js` still has placeholders, or Supabase errors, the form falls back to the old random
   `RR-XXXXXX` and Apps Script only. A retry after an Apps Script error reuses the same portal submission.
   After success, intake photos (compressed blobs kept in `cardEntries[id].blobs` / detail `item.blob`) go to
   `u/<storage_key>/<uuid>.jpg` + `portal_add_photo` with the card id, and the customer sees their link.
   Mapping: card name/set → `cards.name`; service + NM value + damage notes → `cards.customer_notes`;
   unique services → `submissions.service`; delivery/address/insured/referral → `submissions.internal_notes`
   (via `intake_submit`'s `intake_info`, so it never appears on the customer link). `intake_submit` now also
   returns `card_ids` in input order.
   Unverified: whether Apps Script stores the `id` it's sent (a console warning fires if it returns a different `ref`).
2. **Done: owner setup.** Supabase project `bcozwalfszzuecjjqgam` (free tier), schema run, admin login
   `restoredraritytcg@gmail.com` works, public sign-ups off, `portal/config.js` filled (publishable key), deployed.
   The owner updates the site by uploading files on GitHub.com (git on their Mac isn't signed in).
3. **Done: Google Sheet import.** `tools/import_sheet.py Submissions.csv Cards.csv OUT_DIR [--skip ID ...]`
   combines the Sheet's Submissions + Cards tabs (customers matched by email, then phone) and writes
   `combined.csv`, `customers.csv`, `issues.txt` and an idempotent `import.sql` (DO block; skips existing
   submission codes). Old references (`sub_…`, `RR-XXXXXX`) kept as `submissions.code`; Cloudinary URLs stored
   as photo paths (`mediaUrl` passes absolute URLs through). Sheet statuses: Submission Received→submitted,
   In Queue→received, In Progress→in_progress, Ready to Ship / Pick Up→ready. First run (Oct 2026) skipped
   Tung Ha's duplicate `sub_1790523531181_rh90ar` and 3 cards with no submission. OUT_DIR has customer
   details — never commit it (repo is public).
4. Owner setup reference (see README.md): create Supabase project, run `schema.sql`, create admin user + `insert into admins`,
   disable public sign-ups, fill `portal/config.js`, deploy.
5. **Verified on Windows (Oct 24, 2026):** Chrome's `showDirectoryPicker` opens and watches the Google Drive
   folder `G:\My Drive\Card Scans` (Google Drive for desktop, live site `portal/scan.html?demo` showed
   "Watching Card Scans"). The `Card Scans` folder was created then; it's empty so far.
   Not yet verified: a scan actually being picked up/processed from that folder; Canon LiDE 400 output via
   Image Capture (Mac) / IJ Scan Utility (Windows); whether Chrome on macOS lets `showDirectoryPicker` open the
   Google Drive folder (`~/Library/CloudStorage/...`) — README documents a fallback (local folder backed up by Drive).
6. Free tier: 1 GB storage, project pauses after a week idle.
7. **Done: client data imported (Oct 24, 2026).** Owner ran `import.sql` in Supabase; customers show in the portal.
   (The earlier "first run" in step 3 was never applied.) Built from the "Restored Rarity Intakes" Sheet's Submissions + Cards CSVs with
   `--skip sub_1790523531181_rh90ar`: 26 customers, 30 submissions, 74 cards, 171 photos. Output in the owner's
   `Downloads\RR import 2026-10-24\` (never commit). The scan station reads customers/submissions live from Supabase.
   Open question: the owner hasn't decided whether statuses get updated in the portal or the Sheet going forward
   (re-running the import won't sync Sheet changes to existing submissions). Python 3.12 is at
   `%LOCALAPPDATA%\Programs\Python\Python312\python.exe` on the owner's Windows PC.
   Fixed in `import_sheet.py`: the `submissions_touch` trigger was overwriting the Sheet's "Status Updated"
   time with the import time; the DO block now disables it for the run.
   Limitation: re-running skips submissions that already exist, so later Sheet status changes are not synced.

8. **Done (Oct 24, 2026), not yet uploaded: card-name suggestions.** `tools/build_card_catalog.py` → `portal/cards.json`
   (21,256 English cards, 201 sets, 0.5 MB; TCG Pocket left out). Tested locally in the admin portal (`?demo`) and the
   intake form, desktop + phone width. Picking a card in admin fills name + "Set · 4/102 · 1999" details; on the intake
   form it fills "Name — Set 4/102 (year)". Re-run the builder when a new set releases and upload `portal/cards.json`.
   Owner's choices: English only for now; Japanese can be added later (TCGdex has it).

9. **In progress: status emails from the portal (decided Oct 24, 2026).** Owner wants statuses managed in the
   portal, with a record of whether the customer was emailed about each status. Decisions: **per submission**
   (not per card), and **emails are sent by the existing Apps Script** (keeps the owner's Gmail + templates).
   Built (not yet uploaded): `submissions.emailed_status` / `emailed_at` (in `schema.sql`; owner must run
   `supabase/2026-10-24_emailed_status.sql` **before** uploading the portal, or every imported submission looks
   un-emailed). Admin portal: "✉ Needs email" filter + ✉ marker on the list, a banner on each submission
   ("hasn't been emailed about …") with **Mark as emailed** and, once `RR_CONFIG.emailEndpoint` is set,
   **Send status email**. `null` emailed_status counts as "submitted" (the intake confirmation email).
   **Send path built (Oct 24):** `apps-script/PortalEmails.gs` (a new file for the owner's Apps Script project,
   which otherwise lives only in the Sheet's Extensions → Apps Script; main file = "Submission backend",
   version 2026-10-19). Portal pings `?action=portalEmails` (guard: an old script would treat the POST as a new
   submission), then POSTs `{type:"statusEmail", token, code}`. The script checks the token via `rpc/is_admin`,
   reads the submission over REST with that token, maps portal → Sheet stage (received→In Queue,
   in_progress→In Progress, restored→Stabilizing, ready→Ready to Ship / Pick Up, completed→Order Completed…),
   sends the main file's `sendCardUpdateEmail_` for cards whose Sheet "Last Emailed Status" differs, and mirrors
   the change into the Cards tab (status, last emailed, pickup clock, history, overall status), so Track Your
   Submission and the pickup reminders keep working. Portal-only submissions (made in admin "+ New") have no
   Sheet rows: they get the email, but the website tracker won't find them.
   **Apps Script updated + redeployed (Oct 25, 2026):** project is now `Code.gs` + `Portal Emails.gs` (the old
   `Emails.gs`, which clashed with Code.gs's globals, was deleted); the 2 routing lines are in doPost/doGet;
   `setup` was run (onStatusEdit + hourly runPickupReminders triggers, Cards columns J–R, 78 card rows), so
   pickup clocks for already-Ready cards start Oct 25. Live web app answers `?action=portalEmails`.
   (A test POST sent before the redeploy created one blank junk row on the Submissions tab — owner told to delete it.)
   Branch `docs/windows-drive-scan-test` (card suggestions + email tracking + Send status email) is merged and live;
   the owner sees the Send status email button (needed Ctrl+Shift+R — GitHub Pages caches ~10 min).
   **Not yet confirmed (end of Oct 25 session):** that `2026-10-24_emailed_status.sql` was run in Supabase, and a
   real test send to the owner's own email. Ask about both before relying on it with customers.
   Possible next work: add "Assessment Complete" (the "cleared to ship" email), "On Hold", "Cancelled" and a
   return-tracking-# field to the portal; move the website's Track Your Submission to Supabase so portal-only
   submissions show up; upload `email-logo.jpg`.
   Gaps vs. the Sheet: the portal has no "Assessment Complete", "On Hold" or "Cancelled" statuses and no return
   tracking # field. `email-logo.jpg` isn't in the repo, so emails fall back to the text header.

10. **Bug found Oct 26, 2026: website intakes were silently skipping the portal.** Several submissions (e.g.
   `RR-B37QLP`) reached only the Sheet: the form's `portalIntake` loaded supabase-js from jsdelivr
   (`@supabase/supabase-js@2/+esm`, unpinned) at submit time; when that failed, it fell back to a random
   `RR-XXXXXX` code with only a console error. Worked from desktop Chromium, so likely phones/Safari or blockers.
   **Rule of thumb: a 6-character code (`RR-B37QLP`) = not in the portal; `RR-` + digits = in the portal.**
   Fix (branch `fix/intake-portal-direct`, not yet live): index.html now calls Supabase with plain `fetch`
   (`portalRpc`, storage upload via `/storage/v1/object/…`), no CDN; retries connection errors twice; older-Safari
   fallback for `crypto.randomUUID`. Verified locally against the live project with harmless invalid requests only.
   Fixed `index.html` handed to the owner (`Downloads\RR website fix 2026-10-26\`) to upload via GitHub web —
   not yet confirmed live. Catch-up import built Oct 26 from fresh exports
   (`Downloads\RR import 2026-10-26\import.sql`): adds RR-PE98Y8 (Alfonso), RR-B37QLP (Tim Franciskovich),
   RR-AJ3T6A (Ramon Duran), RR-JJMY7X (Houston Trading Society, no email) — 4 customers, 16 cards, 19 photos;
   the other 30 submissions are skipped as already present. Waiting for the owner to run it.
   Not yet verified: a real end-to-end submission from a phone after the fix is live.

11. **Scanner arrived (Oct 27, 2026) — setting up on Windows.** Canon LiDE 400 + IJ Scan Utility. Findings: IJ Scan
   Utility's Custom scan tops out at 600 dpi; 1200 dpi needs **ScanGear** (IJ Scan Utility → Driver; save folder/format
   under Settings → Driver Settings). ScanGear setup that works: Advanced Mode, Color, 1200 dpi, Output Size 100%,
   Unsharp Mask OFF; Preferences → Preview → Cropping Frame = **Display Last Frame** (otherwise it auto-crops tight to
   the card every preview); whole-glass view (not thumbnail view); frame ≈ 3.0 × 4.0 in around a card placed in the
   top-left corner; **black sheet behind the card** (lid is white). Full-glass uncompressed at 1200 dpi ≈ 408 MB —
   always crop to the card; JPEG ≈ 3–6 MB per side (≈1,500 cards in 15 GB free Drive). Cloudinary was ruled out for
   originals (10 MB free-plan file cap). Not yet verified: first real scan picked up by the scan station.
   Offered, not built: scan station re-saving originals as high-quality JPEG after processing.
   **Built (not yet uploaded): 📷 Scan buttons.** Admin submission page (per card row + "📷 Scan cards") and card page
   (Before / In progress / After; suggested stage in gold) link to `scan.html#sub=<id>&card=<n>&stage=<stage>` with
   `target="rr-scan"`; scan.js names its window `rr-scan` and applies the hash on load and on `hashchange`, so an open
   scan tab keeps watching the folder (reloads data if the submission/card is new; asks before discarding an unsaved
   front).
   **Built (not yet uploaded): centering grade caps.** `common.js` `CENTERING_RULES` + `centeringGrades(front, back)`:
   best grade the centering alone allows, from the official pages read Oct 27, 2026 — PSA (psacard.com/gradingstandards:
   10 55/45 front 75/25 back; 9 60/40 & 90/10; 8 65/35; 7 70/30; 6 80/20; 5–4 85/15; 3–1.5 90/10, all 90/10 back) and
   CGC (cgccards.com grading scale: Pristine 10 50/50; 10 55/45 & 75/25; 9 60/40 & 90/10; 8 65/35; 7.5 65/35; 7 70/30;
   6 75/25; 4.5 85/15; 3.5 90/10; 9.5/8.5/6.5/5.5/5/4 publish no number, so they're skipped). Uses the worse axis,
   rounded. Shown admin-only (hidden when `RR_CUSTOMER_VIEW`) as a panel atop each stage of the card report, with what the
   next grade needs, and as a one-liner in the scan station after each capture. Owner wants **PSA, CGC and Beckett only**.
   **Beckett partly added:** beckett.com/grading/scale sits behind a Cloudflare human check; the owner sent screenshots
   (Oct 27): Pristine 10 (and Black Label) 50/50 front, 55/45 back; 9.5 55/45 both ways front, 60/40 back; 9 55/45 front,
   70/30 back; 8 60/40 & 80/20; 7 65/35 & 90/10; 6 70/30 & 95/5. Anything worse shows "BGS 5.5 or lower" until the
   5-and-below centering lines are added (asked for).
   Files to upload: `portal/admin.js`, `portal/scan.js`, `portal/common.js` (copies in `Downloads\RR scan buttons 2026-10-27\`).
   Owner uploaded these 3 via GitHub web (Oct 27). **First real scan worked end to end** (IJ Scan Utility/ScanGear →
   `G:\My Drive\Card Scans` → scan station found, cropped, measured; 1200 dpi PNG 26 MB, sharp at 1:1). That test was at
   ScanGear Output Size 105% (must be 100%) and showed ⚠ check; ScanGear's "Retouch and save the image" option is what
   saves each scan (closes ScanGear; reopen with Driver). Suggested to the owner: JPEG instead of PNG, NAPS2 for one-click
   scanning (not installed).
   **Built (not yet uploaded): up to 3 cards per scan.** Scan station "Cards per scan" 1/2/3 (`detectCards` already
   handles any count, ordered by row then left to right); "⇄ Reverse backs" for any multi-card scan; warns when the
   numbers run past the submission's last card (extra cards would be created) or the back finds a different count than the
   front. Cards in one scan are consecutive card numbers of the selected submission. Tested with synthetic 3-card scans.
   Upload: `portal/scan.js` (copy in `Downloads\RR 3 cards per scan 2026-10-27\`).
   **Fixed (not yet uploaded): card backs cropped too small.** The black sheet scans as dark gray (RGB ~50) and the
   Pokémon back's dark-blue border (d8 ~90) fell under the Otsu threshold (134), so detection cut the border off.
   `foregroundMask` (scanproc.js) / `foreground_mask` (cardcrop.py) now cap the threshold at the outer band's 99th
   percentile + 20 (floor 40). Verified on the owner's real back + front scans and the Python tests. No backing-color
   change needed. Upload `portal/scanproc.js` with `scan.js` (same Downloads folder); `desktop-scanner/cardcrop.py`
   only matters for the backup Windows app. The owner's second test scan was still at ~105% Output Size.
   **Built (not yet uploaded): delete / replace / upload scans in the admin portal.** New `portal/scanupload.js`
   (shared by scan.js and admin.js): `analyze`, `asIs`, `saveSide`, `deleteScan` — the scan station's processing +
   upload moved there unchanged. Card page: each scan side has ⤴ Replace and 🗑 Delete (admin only, hidden when
   `RR_CUSTOMER_VIEW`); "⤴ Upload a scan or photo" with stage + side pickers. Uploads are cropped/measured like a scan;
   if no card edge is found the owner can save the picture as-is (no close-ups/centering). `files.original` =
   `{file, folder:"uploaded"}`. Replacing deletes the old storage files. Tested in demo with the owner's real scan.
   All of item 11 went live Oct 27 (owner uploaded the 5 files to `portal/`; a first attempt landed in the repo root
   and was deleted). The fixed `index.html` from item 10 is live too (main matched this branch).

12. **Customer link broke Oct 27, 2026 — fixed, waiting on upload.** The owner had committed the phone-app work
   (see "Phone app" above: icons, manifest, `installHint`, Refresh button, `signInError`, touch-size centering markers)
   straight to main on Oct 25 (`16ab0ab`), and this branch never had it. The `admin.js`/`common.js` handed over on
   Oct 27 overwrote main's copies, so `view.js` (which imports `installHint`) failed with a module SyntaxError and every
   customer link stuck on "Loading your cards…" from the first Oct 27 upload (~2:49 PM CT) until the fix. Fixed by
   merging origin/main into `fix/intake-portal-direct` and re-adding `installHint`, the Refresh handler and the sign-in
   changes. Upload `portal/admin.js` + `portal/common.js` from `Downloads\RR customer link fix 2026-10-27\`.
   **Lesson: the owner edits main directly on GitHub — always `git fetch` + merge origin/main before handing out files.**
   Still not uploaded as of the evening of Oct 27 (live `common.js` had no `installHint`).

13. **3-card backs cut off again (Oct 27 evening).** The owner switched to 3 cards per scan at **600 dpi** with a
   frame ≈ 8.5 × 3.8 in (5104 × 2288 px). Cards are 3.5 in, so there's < 0.15 in spare; after flipping, the backs sat
   lower and ran off the bottom edge. That put card border into the bottom band, the band's 99th percentile jumped
   (117 vs ~26), and the Otsu threshold (137–145) cut every back's blue border again. Fix: `foregroundMask` /
   `foreground_mask` now take the noise as the **quietest side's** 99th percentile (per-side strips), so one edge
   touching a card no longer raises the threshold. Verified on the owner's RR-JJMY7X and RR-45KCTP 3-card backs
   (≈1500 px wide = 2.5 in) and the Python tests. Cards that truly run off the scan are still cut, so the owner was
   told to make the frame ≈ 4.2 in tall and keep cards pushed to the top. Upload `admin.js`, `common.js`,
   `scanproc.js` from `Downloads\RR portal fixes 2026-10-27 night\` (includes item 12's fix).
   The owner then switched to a different backing color, which fixed the backs for them (color not recorded).
   The code fix still helps when a card touches the scan edge.

14. **Card Check built (Oct 28, 2026), not yet uploaded: first piece of a standalone product.** Owner wants to
   monetize the image processing: a standalone tool for eBay sellers, working from phone photos (owner sent a
   screen recording of the "gradevalue" app: centering lines, corner loupe, surface relief view) and from computer
   uploads/scans. Proposed plan (not yet agreed): free tool → Pro (~$5–10/mo) → Shop tier (the portal as SaaS),
   with a "Send to Restored Rarity" funnel; interview raw-card eBay/Whatnot sellers, people deciding whether to
   grade, card shops, other restorers (start with existing customers). Built `portal/check.html` (see table).
   Test (synthetic phone photos made from a real 600 dpi scan, flat/tilted/steep, 72 dpi JPEG): card edges land
   within ~0.008 in of where they should after flattening; T/B matched the scan within 0.2; L/R differed by up to
   2 points on that card because its right border is crowded (the scan itself flags ⚠ check there). Not yet
   tested with real phone photos. `scanproc.js` now exports `components` (no behavior change).
   Upload together (also fixes the still-broken customer links from items 12–13): `portal/admin.js`, `common.js`,
   `scanproc.js`, `check.html`, `check.js`, `photoproc.js` from `Downloads\RR card check 2026-10-28\`.
   Not built yet: live camera guide with auto-capture, accounts/payments, eBay API listing drafts, Beckett 5-and-below.
   **Uploaded Oct 28 (~2:11 PM CT, `ad479af`), verified live:** all 6 files in `portal/`; view.html loads again (fake
   token → "link isn't valid" message via Supabase), so the customer-link outage from items 12–13 is over;
   check.html loads. Waiting on the owner's real phone-photo test.

**Keep this file current:** the owner wants this Status section updated whenever a step is finished or a
next step is decided — do it as part of the work, without being asked.
