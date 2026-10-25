# Restored Rarity — Card Portal

Two web pages that live on your existing site (restoredraritytcg.com):

| Page | Who | What |
|---|---|---|
| `portal/admin.html` | You (login) | Every submission, card, customer profile, scan and photo. Change statuses, write notes, add cards and photos, copy a customer's link. |
| `portal/scan.html` | You, on Mac or Windows (Chrome/Edge) | Scan station: watches your scan folder and sends every scan to the portal. |
| `portal/view.html#t=…` | Your customer (private link, no password) | Everything on their profile: all submissions and cards, progress, scans with corner/edge close-ups, before/after, their photos — and they can add more photos. |

The data lives in **Supabase** (free tier to start). The scanner app sends scans straight in.

**Try it first, no setup:** open `portal/admin.html?demo` or `portal/view.html?demo#t=demo-token`
through any local web server (e.g. `python -m http.server` inside the `portal` folder, then
http://localhost:8000/admin.html?demo). Sample data; nothing is saved.

---

## How it's organized

```
Customer profile (one private link)
 ├─ Submission RR-1042  (status: Received → In progress → Restored → Ready → Completed)
 │   ├─ Card #1  — status, note to customer, private notes
 │   │   ├─ Scans: Before / In progress / After  (front + back, 4 corners, 4 edges each)
 │   │   └─ Photos for this card
 │   └─ Card #2 …
 ├─ Submission RR-1077 …
 └─ Photos: from the intake form, added by you, or added by the customer
```

- **Notes:** each submission and card has a *note to customer* (shown on their page) and
  *private notes* (only you). What the customer typed on the intake form is kept separately.
- **Customer link:** one per profile. **New link** makes a fresh one if a link gets shared too widely
  (the old one stops working).
- Customers can delete only photos they added themselves.

## Scan station — scan from your Mac or Windows computer

`portal/scan.html` (also in the portal's top menu) turns any computer with Chrome or Edge into a
scanning station. Plug the Canon LiDE 400 into whichever computer you're at; everything lands in the
portal, so all cards are available everywhere.

**How it works:** your computer's own scanner software saves each scan into a folder. The scan
station watches that folder and, a few seconds after each scan, finds the card(s), straightens and
crops them, cuts the 4 corners and 4 edges, measures centering, and saves it all to the portal
under the submission and card number you picked. Originals are then filed into a folder named
after the submission (e.g. `Card Scans/RR-1042/RR-1042_C001_before_front.png`).

### One-time setup on each computer
1. **Google Drive for desktop** (drive.google.com/download) — sign in with the business Gmail.
   In My Drive, create a folder **Card Scans**. It syncs to both computers, so the original full-resolution
   scans from either machine are on both (and in the cloud). 15 GB free; 100 GB is about $2/month.
2. **Canon driver + scan software** for the LiDE 400 from canon.com (Support → LiDE 400 → Drivers & Downloads),
   for macOS or Windows.
3. **Scanner settings** — set once in the scan software:
   - Mac: Apple's **Image Capture** works well → pick the LiDE 400 → **Show Details** → Kind: *Color*,
     Resolution: *1200*, Format: *PNG* (or JPEG), **Scan To: Card Scans**. Leave "Detect separate items" **off**.
   - Windows: in Canon's **IJ Scan Utility** use a custom/photo scan → Color, **1200 dpi**, save as **PNG** or **JPEG**,
     save in **Card Scans** (inside the Google Drive folder).
   - Not TIFF (browsers can't read it). For 2400 dpi, shrink the scan area to just the card(s) — a full
     glass at 2400 dpi is too big for a browser.
4. Open **restoredraritytcg.com/portal/scan.html** in **Chrome or Edge**, sign in, click
   **📁 Choose scan folder** and pick **Card Scans**. Next time just click **▶ Resume watching**.

### Each card
1. Pick the submission (type the code or name), the stage (Before / In progress / After) and the card #.
2. Put the card face-down on a black sheet, scan the **front** with your scan software. It appears on the page.
3. Flip it in place, scan the **back**. With auto-save on, it's saved to the portal and moves on to the next card #.
   (Set "Cards per scan" to 2 to do two at once; ⇄ Swap backs fixes a mix-up.)

### If Chrome won't open the Google Drive folder (Mac)
Chrome protects some system locations on Macs, and Google Drive's folder can live inside one. If you see
"can't open this folder": make a normal folder like **Documents › Card Scans**, point the scanner software
and the scan station at it, and in Google Drive for desktop → Preferences → **My Mac → Add folder** to back
it up to Drive. Safari and Firefox can't watch folders at all — drag each scan onto the page instead.

The Windows desktop app still works as a backup and saves to the same portal.

## Centering

Every scanned side is measured automatically by the scanner app: the border width at **0.5 in from
each corner, in both directions** — 2 measurements each for top, bottom, left and right (8 per side).
From those it works out **Left/Right** and **Top/Bottom** centering (e.g. 55/45).

On any card, click **📐 Centering tool** above the front or back:
- Gold dots sit on the card's outer edge, blue dots on the inner edge of the border.
- Scroll or pinch to zoom (up to pixel level), drag empty space to move around.
- Click a measurement in the list to jump straight to it, zoomed in.
- Drag any dot to where it belongs; it slides along its measuring line. Arrow keys nudge the
  selected line one pixel (Shift = 5); hold Alt with the arrows to move the gold dot instead.
- **Save** keeps your corrected numbers (the card then shows "✓ checked"); **Reset to auto** goes
  back to the scanner's measurement.
- A ⚠ means the scanner wasn't sure — e.g. a full-art card with no border, or the two measurements on
  one side disagree (a tilted print or a misread). Those warnings only show for you.

Customers see the same tool view-only (zoom and inspect, no dragging), with the numbers you saved.

## One-time setup (about 20 minutes)

### 1. Create the Supabase project
1. Sign up at supabase.com → **New project**. Pick a strong database password and a US region.
2. **SQL Editor → New query**, paste all of `supabase/schema.sql`, click **Run**.
   It creates the tables, the security rules and a `portal` storage bucket. Safe to run again later.

### 2. Make your admin login
1. **Authentication → Users → Add user → Create new user**: your email + a strong password
   (tick "Auto confirm").
2. **SQL Editor**, run (with your email):
   ```sql
   insert into admins (email) values ('restoredraritytcg@gmail.com');
   ```
3. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up".
   (Strangers couldn't see anything anyway, but there's no reason to allow it.)

### 3. Put the portal on your website
1. **Project Settings → API**: copy the **Project URL** and the **anon public** key.
2. Open `portal/config.js` and paste them in. (The anon key is designed to be public — the
   database rules decide what it can do. **Never** put the `service_role` key in this file.)
3. Delete the `portal/demo` folder (only needed for the preview).
4. Copy the `portal` folder into your website repo (`restoredraritytcg-hub/restoredraritytcg`) and push.
   Your pages are then:
   - https://restoredraritytcg.com/portal/admin.html  ← bookmark this
   - customer links look like `https://restoredraritytcg.com/portal/view.html#t=…`

### 4. (Optional) Connect the Windows backup app
In the Windows scanner app: **File → Settings** → Portal URL + the **service_role** key → **Test portal**.
(That key stays on your scanning PC only.)

## Daily workflow

1. A submission comes in from the intake form (or you create it with **+ New**). It shows as
   **Submitted online** until you mark it **Received**.
2. Scan each card at the **scan station** (or the Windows app) using the submission code (e.g. `RR-1042`) and card number —
   stage **Before**. The scans appear in the portal right away.
3. Update the status as you work; add notes or photos if needed.
4. After restoring, scan it again with stage **After** (scan station), or in the Windows app's Library → **Scan this card (after restore)**.
   The portal now shows a **Before / after** tab for that card.
5. Copy the customer link from their profile and text/email it. They see live progress any time.

## Storage & cost

Each card side uses roughly 1–2 MB in the portal (front/back image, thumbnail, 8 close-ups).
Supabase's free plan includes 1 GB of storage (≈ 250–500 card sides) and pauses a project after
a week with no activity. Once you're using it for real customers, the Pro plan ($25/month,
100 GB) removes both limits. Full-resolution PNGs always stay on your scanning PC.

## Still to connect: your intake form

The database already has an `intake_submit` function that creates the customer profile
(matched by email), the submission and its cards in one step, and returns the submission code
and the customer's private link; photos upload under the customer's folder and are tagged
"Intake form". Hooking up your existing `intake.html` (currently posting to Google Apps Script)
needs that file — send the site package and it's a small change.

## Security in short

- All tables are locked: only logins listed in `admins` can read or change them.
- A customer link only unlocks that one profile, through functions that never return private notes.
- Customer uploads can only go into their own folder, images only, 25 MB max.
- Image files are only reachable by their exact web address, which contains a random key
  (same idea as the private link). Nobody can browse or list files except you.

## Tests

- `python tests/make_parity_images.py tests/parity` makes synthetic scans and the
  desktop app's results; open `tests/parity.html` through a local web server to run the browser version
  on them. The two agree to within 0.05 mm per border.
