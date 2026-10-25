"""Build portal/cards.json, the card list behind the "type a card name" suggestions
on the intake form (index.html) and in the admin portal.

    python tools/build_card_catalog.py [OUT]        # default OUT: portal/cards.json

Source: TCGdex (https://tcgdex.dev), free, no key. English cards only. Pokémon TCG
Pocket (digital-only) sets are left out. Re-run when a new set comes out, then
upload the new portal/cards.json.

File shape (kept short so the browser downloads it fast):
  {"v": "2026-10-24", "src": "TCGdex", "img": "https://assets.tcgdex.net/en/",
   "sets":  [[set_id, name, year, official_count, asset_path], ...]   # oldest first
   "cards": [[name, set_index, number, image], ...]}
image: 1 = <img><asset_path>/<number>/low.webp, 0 = no picture, or a full URL base.
"""
import json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date

API = "https://api.tcgdex.net/v2/en"
IMG = "https://assets.tcgdex.net/en/"
SKIP_SERIES = {"tcgp"}  # TCG Pocket: digital-only cards


def get(url, tries=4):
    req = urllib.request.Request(url, headers={"User-Agent": "RestoredRarity-catalog/1.0"})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


def main(out):
    briefs = get(f"{API}/sets")
    with ThreadPoolExecutor(6) as pool:
        sets = list(pool.map(lambda b: get(f"{API}/sets/{b['id']}"), briefs))
    sets = [s for s in sets if (s.get("serie") or {}).get("id") not in SKIP_SERIES and s.get("cards")]
    sets.sort(key=lambda s: (s.get("releaseDate") or "9999", s["id"]))

    out_sets, out_cards, odd = [], [], 0
    for i, s in enumerate(sets):
        imgs = [c for c in s["cards"] if c.get("image")]
        # asset path = the image URL minus the IMG prefix and "/<number>"
        path = ""
        if imgs:
            c = imgs[0]
            u = c["image"]
            if u.startswith(IMG) and u.endswith("/" + c["localId"]):
                path = u[len(IMG):-len(c["localId"]) - 1]
        out_sets.append([s["id"], s["name"], (s.get("releaseDate") or "")[:4],
                         (s.get("cardCount") or {}).get("official") or 0, path])
        for c in s["cards"]:
            u = c.get("image")
            if not u:
                img = 0
            elif path and u == f"{IMG}{path}/{c['localId']}":
                img = 1
            else:
                img, odd = u, odd + 1
            out_cards.append([c["name"], i, c["localId"], img])

    data = {"v": date.today().isoformat(), "src": "TCGdex", "img": IMG, "sets": out_sets, "cards": out_cards}
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    no_img = sum(1 for c in out_cards if c[3] == 0)
    print(f"{len(out_cards):,} cards in {len(out_sets)} sets -> {out} "
          f"({os.path.getsize(out) / 1048576:.1f} MB; {no_img:,} without a picture, {odd} with an unusual picture URL)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join("portal", "cards.json"))
