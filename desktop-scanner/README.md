# Restored Rarity — Card Intake Scanner

> **Tip:** the portal's **scan station** (`portal/scan.html`) now does everything this app does from any Mac or
> Windows computer in Chrome or Edge. Keep this app as a backup — both save to the same portal.

A small Windows app for the **Canon CanoScan LiDE 400**. It scans a card's front and back,
finds and straightens the card automatically, saves full-resolution files, and (optionally)
sends every scan to your **Restored Rarity portal** so you and the customer can pull it up online.

## What it does

1. You type the **Submission ID** from the intake form and pick the stage (Before / After / In progress).
2. **Scan Front** — a quick low-res preview finds the card(s) on the glass, then only the card
   area is rescanned at high resolution (so 2400 dpi doesn't scan the whole bed).
3. Flip each card **in place**, then **Scan Back**. Backs are paired to fronts left-to-right.
4. Add a card name and condition notes, then **Save**.

Every side also gets **4 corner close-ups and 4 edge strips**, cut automatically from the
straightened high-res scan (like a dig/grading report). Everything is organized one folder per card:

```
Pictures\Restored Rarity Scans\
  index.html                              ← searchable library of every card (opens in your browser)
  scan_log.csv                            ← one row per scan, opens in Excel
  RR-1042\                                ← one folder per submission
    C001_Charizard-Base-Set-4-102\        ← one folder per card
      report.html                         ← card detail report
      before\                             ← one folder per stage: before / progress / after
        front.png  back.png               ← full resolution, lossless
        front_web.jpg  back_web.jpg       ← ~2400px JPG (what gets uploaded)
        corners\front_top-left.png … back_bottom-right.png   (8 files)
        edges\front_top.png … back_left.png                  (8 files)
      after\                              ← same layout once you scan it after restoring
```

### Card detail report

Each card's `report.html` shows, for every stage:
- The whole card, front and back, with outlines marking each corner (gold) and edge (blue).
  Click any outline to zoom straight into that close-up.
- All 4 corners and all 4 edges for each side, labeled. Click any image for a full-screen view,
  then **Actual size** to see every scanned pixel.
- When a card has both **Before** and **After** scans, a **Before / after** section lines up the
  same corner or edge side by side — great for showing customers the restoration.

The back is shown as scanned, so the back's left edge is the front's right edge.

### Centering

Every saved side is measured for centering automatically: the border width 0.5 in from each corner
in both directions (2 measurements per border, 8 per side), giving Left/Right and Top/Bottom (e.g. 55/45).
The numbers show under each thumbnail right after scanning, and in each card's report with a
**📐 Centering tool** to zoom in and inspect every measurement. On full-art or borderless cards,
or when the two measurements on a side disagree, you'll see **⚠ check**. Adjust those by dragging
the markers in the portal's centering tool, where corrections are saved.
(`assets/centering.js` here is a copy of the portal's `centering.js`; keep them the same.)

### Pulling up a card later

- **Library → Find a card** (Ctrl+L, or the 🔍 Library button): search by submission ID, customer,
  card name or notes. Double-click a card to open its report.
- From there, **Scan this card (after restore)** fills in the submission and card number and
  sets the stage, so the new scan lands in the same card folder and the report gets a before/after section.
- **Library → Open library in browser** opens `index.html`: every card as a thumbnail with search.
- After saving, the **📄 Last report** button opens the report for the cards you just scanned.

Keyboard: **Ctrl+1** scan front · **Ctrl+2** scan back · **Ctrl+S** save · **Ctrl+L** library.

## Install (one time)

1. Plug in the LiDE 400 and install Canon's driver for it from canon.com (search "LiDE 400 drivers").
2. Install **Python 3.11 or newer** from python.org — tick **"Add python.exe to PATH"**.
3. Unzip this folder somewhere permanent (e.g. `Documents\rr-card-scan`).
4. Double-click **setup.bat**. When it finishes, double-click **run.bat**.
5. In the app: **File → Settings → Test scanner** should say it found the Canon.

## Connect it to the portal (optional)

Without this, everything still saves to your PC.

1. Set up the portal first (see the portal's README).
2. In this app: **File → Settings**:
   - **Portal (Supabase) URL**: `https://<your-project>.supabase.co`
   - **Service role key**: Supabase → Project Settings → API → `service_role` (secret).
     It stays in `config.json` on this PC only — never put it on the website or share it.
3. **Test portal** → **Save**.

Each saved side sends the front/back image, a thumbnail and all 8 corner/edge close-ups to the
portal, attached to the matching **submission code + card number**. The submission must exist in the
portal first (from the intake form or **+ New** in the portal); a card number that isn't there yet
is added automatically. Rescanning the same card/stage/side replaces the old images.
If the internet drops, scans stay on your PC — use **File → Upload pending scans** later.

## Tips for good scans

- **Put a black sheet of paper (or black card stock) behind the cards.** The white lid makes
  white- and silver-bordered cards hard to find. Black works for every card.
- Remove penny sleeves for the sharpest detail. Toploaders work but the plastic adds glare.
- Keep cards at least ~½ inch apart and away from the very edge of the glass.
- Wipe the glass with a microfiber cloth — at 2400 dpi every speck of dust shows.
- **Resolution:** 1200 dpi is a good default for intake records. Use 2400 dpi for close-up
  condition detail; each side is then ~6000×8400 px and takes longer to scan.
  If the scanner's driver doesn't allow a resolution, the app uses the closest one it does
  and the actual dpi is recorded on every file.

## Troubleshooting

| Problem | Fix |
|---|---|
| "No scanner found" | Check USB, reinstall Canon's driver, unplug/replug, close Canon IJ Scan Utility. |
| "No card found on the glass" | Use the black backing sheet; make sure the lid is closed. |
| "⚠ auto-crop failed" | The raw area around the card is saved instead. Rescan with the black backing. |
| Backs paired to wrong fronts | Click **⇄ Swap backs**, or flip cards in place next time. |
| Portal upload failed | Files are safe locally. Check the submission exists in the portal and the key is right, then **File → Upload pending scans**. |

## Testing without the scanner

Settings → Scanner = **mock**, then point "Mock front image" / "Mock back image" at photos of
the whole scanner bed (assumed 600 dpi). `python tests/test_pipeline.py` and
`python tests/test_library.py` and `python tests/test_centering.py` run the automated checks (the second builds a sample
submission with before/after reports you can open).
