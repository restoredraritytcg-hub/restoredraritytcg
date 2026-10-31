# Scan Station by Restored Rarity (restoredraritytcg.com/scanner/)

A standalone web app for anyone (not just Restored Rarity customers). It works on phones and computers.

1. **Create an account** with email and password. It works in any browser (phone, tablet, Mac, Windows,
   Chromebook) with nothing to install. Cards sync to every device the user signs in on.
2. **Add cards** (`#/add`), as many at once as they like:
   - **Take photos**: the camera stays open, card after card (front, flip, back, next card). A **bubble level**
     takes each photo by itself once the phone is flat and still, then waits 2.5 s for the next card.
   - **Choose photos**: pick many from the photo library or files.
   - **Drag & drop** a stack of photos or scans (computer).
   - **Watch a folder** (Chrome/Edge on a computer): the scanner's save folder, or a camera or cloud sync folder
     (Google Drive, Dropbox, OneDrive, iCloud). New pictures are added automatically while the page is open.
   - "Front, then back" pairs photos in order. "Fronts only" makes one card per photo.
   Each photo is processed on the device and **saved automatically**, with no Save button. A progress pill
   shows on every page while photos are still being processed.
3. **Finish** (`#/todo`): cards without a name, or whose card edge wasn't found, are listed under **To finish**.
   Start typing a name, pick the card from the list, then **Save & next**. The app finds the card, undoes the
   camera angle (perspective), crops it to an exact 2.5 × 3.5 in card, cuts **close-ups of all 4 corners and
   4 edges**, and **measures centering** (the same 8-point method as the portal). Users can fine-tune the
   centering lines, swap front and back, or retake a side. "Add a single card" (`#/new`) also lets them drag
   the corner dots and turn the card upside down before saving.
4. **Download for eBay**: a .zip per card (or one .zip for several cards, a folder each) with:
   - `01_front.jpg`, `02_back.jpg`: straightened, 1600 px (eBay's recommended size)
   - `03…10`: corner close-ups (enlarged to 800 px; eBay needs at least 500)
   - `11…18`: edge close-ups
   - `listing.txt`: a suggested title (≤ 80 characters) and description with the centering numbers and notes.
   That's 18 photos, under eBay's 24-photo limit. Upload them in number order so the front is the main photo.

All the image processing runs **on the user's phone or computer**. Only the finished JPGs are uploaded.

Try it without any setup: open `scanner/index.html?demo` through a local web server
(`python -m http.server` in the repo root, then http://localhost:8000/scanner/index.html?demo).
Demo mode keeps everything in memory, so reloading the page clears it.

## Files

| File | What |
|---|---|
| `index.html`, `app.css` | Page shell and styles (on top of `../portal/portal.css`) |
| `app.js` | Screens: sign in/up, My cards / To finish, Add cards (queue, pairing, folder watch), card editor, account; eBay .zip |
| `photo.js` | Finds the card's 4 corners, perspective warp, close-ups + centering (uses `../portal/scanproc.js`) |
| `camera.js` | Full-screen camera with card outline, bubble level and auto-capture |
| `zip.js` | Small .zip writer (no library) |
| `store.js` | Supabase data layer, or the in-memory demo |
| `config.js` | The scanner's own Supabase URL + publishable key. Placeholders mean demo mode |
| `schema.sql` | Database for the scanner's own Supabase project |

It shares `../portal/scanproc.js`, `../portal/centering.js`, `../portal/cardsearch.js` + `cards.json` and the
icons with the portal. If the app ever moves to its own domain, copy those files in.

## One-time setup

The scanner uses its **own Supabase project**, separate from the Restored Rarity portal. Public sign-ups stay
off on the business portal, and app users never share a database with your customers.

1. supabase.com → **New project** (e.g. "rr-card-scanner"). The free plan allows 2 projects.
2. **SQL Editor** → paste all of `scanner/schema.sql` → **Run**. It's safe to run again later.
3. **Authentication → Sign In / Providers → Email**: leave email sign-up **on** and **Confirm email on**.
4. **Authentication → URL Configuration**:
   - Site URL: `https://restoredraritytcg.com/scanner/`
   - Redirect URLs: add `https://restoredraritytcg.com/scanner/**`
5. **Project Settings → API**: copy the Project URL and the **publishable** (anon) key into `scanner/config.js`.
   Never use the service_role/secret key there.
6. Upload the `scanner/` folder to the site. Also upload `portal/` if it isn't already up to date.

Optional: under Authentication → Emails, change the confirmation and password-reset email text to mention
"Scan Station by Restored Rarity". Supabase's built-in email sender only allows a few emails per hour, which is
fine for testing. Before launching publicly, set up custom SMTP (Authentication → Emails → SMTP settings), for
example Gmail or Resend.

## Limits and cost

- Each account can hold **200 cards** (`profiles.card_limit`). To raise one person's limit, run in the SQL editor:
  `update profiles set card_limit = 500 where id = (select id from auth.users where email = 'them@example.com');`
- A card uses roughly **1–1.5 MB** of storage (front + back + 16 close-ups), so a full 200-card account is
  about 300 MB. The free tier's 1 GB fills after a few active users. **Supabase Pro ($25/month)** includes
  100 GB, enough for a few hundred full accounts.
- Photos are in a **private** bucket. Each user can only read, add or delete files under their own folder,
  and the app shows them through links that expire after an hour.

## Accuracy

Centering from a phone photo is an **estimate**. On synthetic test photos taken at strong angles, the
measurement came within half a point of the true value (e.g. 40/60 measured as 39.9/60.1). Real photos
add lens blur and glare. The best results come from:
- a plain, dark surface (not a playmat or a busy desk)
- the card out of its sleeve or toploader
- light from the side (overhead light reflects off holo cards), and no flash
- the card filling most of the outline

The resolution depends on how close the phone is. A card that fills the outline comes out at around
400–800 dpi, which is plenty for eBay and for centering.
