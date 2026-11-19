# Shiny Asset Exchange — logo refresh concept (pitch)

A redraw of their current badge for a pitch: same idea (the Revive → Resale → Repeat cycle around trading cards,
name on a plate), as clean vector art. **A concept for discussion — not their adopted logo.**

| File | Use |
|---|---|
| `sae-logo-badge.svg/.png` | Primary badge |
| `sae-logo-horizontal-dark.svg/.png`, `-light` | Website header, banners, invoices |
| `sae-logo-mark.svg/.png` | Round mark, no words (Instagram avatar, stickers, bottle caps) |
| `sae-logo-icon.svg/.png` | App / favicon tile |
| `SAE-logo-refresh-concept.pdf` | One-page pitch sheet (`pitch.html` is its source) |

Lettering is converted to outlines (no fonts needed). Fonts used: Space Grotesk Bold, Playfair Display SemiBold Italic
(free Google Fonts, SIL Open Font License). Colours: ink #0A0A0C, red #E3202A, deep red #9E1119, gold #E8C27E.
Rebuild (fonts are included in `source/`):
```
pip install fonttools brotli
python3 source/make_logo.py source/out          # outlined SVGs
cd source && npm i playwright && node render.js '[["out/sae-logo-badge.svg",1000,1000,"out/sae-logo-badge.png"]]'   # PNGs
node pitch.js                                    # pitch PDF/PNG from out/pitch.html (copy ../pitch.html into out/ first)
```
