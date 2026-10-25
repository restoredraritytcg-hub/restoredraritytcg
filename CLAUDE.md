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
| `portal/centering.js` | Interactive centering tool (plain script, `window.RRCentering`): zoom/pan canvas, draggable markers, save/reset. Used by portal and by the desktop app's local reports. |
| `portal/common.js` | Shared: data API (`realApi` = Supabase, `demoApi` = in-memory), card report renderer, lightbox, helpers. |
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
5. Not yet verified on real hardware/OS: Canon LiDE 400 output via Image Capture (Mac) / IJ Scan Utility (Windows);
   whether Chrome on macOS lets `showDirectoryPicker` open the Google Drive folder (`~/Library/CloudStorage/...`) —
   README documents a fallback (local folder backed up by Drive).
6. Free tier: 1 GB storage, project pauses after a week idle.
