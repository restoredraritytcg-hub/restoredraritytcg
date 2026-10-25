"""End-to-end: scan (mock) -> save with corners/edges -> before/after -> reports.

Run:  python tests/test_library.py [output_dir]
"""

import json
import os
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import library  # noqa: E402
import storage  # noqa: E402
from detail import CORNERS, EDGES  # noqa: E402
from pipeline import capture_side  # noqa: E402
from scanners import MockScanner  # noqa: E402
from test_pipeline import make_bed, BED_DPI  # noqa: E402


def styled_card(dpi, worn=False, back=False, seed=0):
    w, h = int(2.5 * dpi), int(3.5 * dpi)
    if back:
        card = np.full((h, w, 3), (140, 70, 20), np.uint8)
        cv2.circle(card, (w // 2, h // 2), int(0.8 * dpi), (30, 40, 200), -1)
        cv2.circle(card, (w // 2, h // 2), int(0.8 * dpi), (240, 240, 240), int(0.08 * dpi))
    else:
        card = np.full((h, w, 3), (40, 200, 235), np.uint8)
        # card 1 is printed off-center (about 60/40 L/R, 57/43 T/B); others are centered
        L, R, T, B = (0.17, 0.11, 0.16, 0.12) if seed == 1 else (0.14, 0.14, 0.14, 0.14)
        rng = np.random.default_rng(seed)
        art = cv2.GaussianBlur(rng.integers(0, 255, (h, w, 3), dtype=np.uint8), (0, 0), 8)
        art = cv2.addWeighted(art, 0.6, np.full_like(art, (110, 70, 150)), 0.4, 0)
        y0, y1, x0, x1 = int(T * dpi), h - int(B * dpi), int(L * dpi), w - int(R * dpi)
        card[y0:y1, x0:x1] = art[y0:y1, x0:x1]
        cv2.putText(card, "SAMPLE 4/102", (x0 + 10, y1 - 20), cv2.FONT_HERSHEY_SIMPLEX,
                    dpi / 300, (20, 20, 20), max(1, dpi // 150))
    if worn:  # whitening on two corners + an edge nick
        r = int(0.08 * dpi)
        cv2.circle(card, (0, 0), r, (250, 250, 250), -1)
        cv2.circle(card, (w, h), r, (250, 250, 250), -1)
        cv2.rectangle(card, (w // 2, 0), (w // 2 + int(0.15 * dpi), int(0.03 * dpi)), (250, 250, 250), -1)
    return card


def bed(cards, path):
    cv2.imwrite(str(path), make_bed(cards, (15, 15, 15)))


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(tempfile.mkdtemp()) / "Restored Rarity Scans"
    tmp = Path(tempfile.mkdtemp())
    d = BED_DPI
    # Before: two cards, card 1 worn. Backs are flipped in place (same positions).
    bed([(styled_card(d, worn=True, seed=1), 2.2, 2.8, 2.5), (styled_card(d, seed=2), 5.8, 3.0, -1)], tmp / "f.png")
    bed([(styled_card(d, worn=True, back=True), 2.2, 2.8, -2.5), (styled_card(d, back=True), 5.8, 3.0, 1)],
        tmp / "b.png")
    # After: card 1 alone, restored.
    bed([(styled_card(d, seed=1), 3.0, 4.0, 1.0)], tmp / "fa.png")
    bed([(styled_card(d, back=True), 3.0, 4.0, -1.0)], tmp / "ba.png")

    def scan_and_save(front, back, stage, start, names, dpi=600):
        sc = MockScanner(str(front), str(back), bed_dpi=d)
        fronts = capture_side(sc, dpi, "front", max_cards=2)
        backs = capture_side(sc, dpi, "back", max_cards=2)
        assert len(fronts) == len(backs) == len(names)
        for i, (fr, bk) in enumerate(zip(fronts, backs)):
            for side, cap in (("front", fr), ("back", bk)):
                meta = {"submission_id": "RR-1042", "customer": "Jordan T.", "card_number": start + i,
                        "card_name": names[i], "stage": stage, "side": side,
                        "notes": "Whitening top-left & bottom-right" if stage == "before" and i == 0 else ""}
                storage.save_side(out, meta, cap)

    scan_and_save(tmp / "f.png", tmp / "b.png", "before", 1, ["Charizard Base Set 4/102", "Blastoise 2/102"])
    scan_and_save(tmp / "fa.png", tmp / "ba.png", "after", 1, ["Charizard Base Set 4/102"])

    cards = library.rebuild(out)
    assert len(cards) == 2, cards
    c1 = next(c for c in cards if c["card_number"] == 1)
    assert c1["stage_keys"] == ["before", "after"], c1["stage_keys"]
    for stage in ("before", "after"):
        for side in ("front", "back"):
            files = c1["stages"][stage][side]["files"]
            assert set(files["corners"]) == set(CORNERS) and set(files["edges"]) == set(EDGES)
            for rel in list(files["corners"].values()) + list(files["edges"].values()):
                im = cv2.imread(str(c1["dir"] / rel))
                assert im is not None and im.size > 0, rel
    # Corner close-up size check at 600 dpi: (0.40 + 0.06) in ≈ 276 px
    tl = cv2.imread(str(c1["dir"] / c1["stages"]["before"]["front"]["files"]["corners"]["top-left"]))
    assert abs(tl.shape[0] - 276) <= 3 and abs(tl.shape[1] - 276) <= 3, tl.shape
    html = c1["report"].read_text()
    assert 'id="compare"' in html and "Top left" in html
    assert (out / "index.html").exists()
    cen = c1["stages"]["before"]["front"]["files"]["centering"]["summary"]
    assert abs(cen["lr"][0] - 60.7) < 2.5 and abs(cen["tb"][0] - 57.1) < 2.5, cen
    assert 'data-center="before|front"' in html and "_assets/centering.js" in html
    assert (out / "_assets" / "centering.js").exists()
    print("centering card 1 front:", cen["lr"], cen["tb"])
    print("PASS library:", len(cards), "cards;", sum(1 for _ in out.rglob("*.png")), "PNGs")
    print("folders:", sorted(p.relative_to(out).as_posix() for p in out.glob("*/*")))
    print("report:", c1["report"])
    print("index:", out / "index.html")
    print(json.dumps(c1["stages"]["before"]["front"]["files"], indent=1)[:400])


if __name__ == "__main__":
    main()
