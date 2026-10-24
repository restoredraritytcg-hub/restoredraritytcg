"""Synthetic end-to-end test: draws cards on a fake scanner bed, runs the
mock scanner through the pipeline, and checks the crops.

Run:  python tests/test_pipeline.py
"""

import os
import sys
import tempfile

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pipeline import capture_side  # noqa: E402
from scanners import MockScanner  # noqa: E402

BED_DPI = 300
BED_W_IN, BED_H_IN = 8.5, 11.7


def make_card(dpi, border=(40, 200, 235), seed=0):
    w, h = int(2.5 * dpi), int(3.5 * dpi)
    rng = np.random.default_rng(seed)
    card = np.full((h, w, 3), border, np.uint8)
    b = int(0.12 * dpi)
    art = rng.integers(0, 255, (h - 2 * b, w - 2 * b, 3), dtype=np.uint8)
    art = cv2.GaussianBlur(art, (0, 0), 6)
    card[b:h - b, b:w - b] = art
    return card


def place(bed, card, cx_in, cy_in, angle, dpi):
    h, w = card.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    cos, sin = abs(M[0, 0]), abs(M[0, 1])
    nw, nh = int(h * sin + w * cos), int(h * cos + w * sin)
    M[0, 2] += nw / 2 - w / 2
    M[1, 2] += nh / 2 - h / 2
    rot = cv2.warpAffine(card, M, (nw, nh), flags=cv2.INTER_CUBIC, borderValue=(0, 0, 0))
    mask = cv2.warpAffine(np.full((h, w), 255, np.uint8), M, (nw, nh))
    x0, y0 = int(cx_in * dpi - nw / 2), int(cy_in * dpi - nh / 2)
    roi = bed[y0:y0 + nh, x0:x0 + nw]
    roi[mask > 127] = rot[mask > 127]


def make_bed(cards, background):
    bed = np.full((int(BED_H_IN * BED_DPI), int(BED_W_IN * BED_DPI), 3), background, np.uint8)
    noise = np.random.default_rng(1).normal(0, 3, bed.shape)
    bed = np.clip(bed + noise, 0, 255).astype(np.uint8)
    for card, cx, cy, ang in cards:
        place(bed, card, cx, cy, ang, BED_DPI)
    return bed


def check(results, expected_n, label):
    assert len(results) == expected_n, f"{label}: expected {expected_n} cards, got {len(results)}"
    for r in results:
        h, w = r.image.shape[:2]
        w_in, h_in = w / r.dpi, h / r.dpi
        assert r.cropped, f"{label}: crop failed"
        assert abs(w_in - 2.62) < 0.08 and abs(h_in - 3.62) < 0.08, \
            f"{label}: crop size {w_in:.2f}x{h_in:.2f} in"
    print(f"PASS {label}: " + ", ".join(
        f"{r.image.shape[1]}x{r.image.shape[0]}px @ {r.dpi}dpi" for r in results))


def main():
    tmp = tempfile.mkdtemp()

    # 1) One skewed card on a white lid.
    bed = make_bed([(make_card(BED_DPI), 3.0, 4.0, 4.0)], (245, 245, 245))
    p = os.path.join(tmp, "one_white.png")
    cv2.imwrite(p, bed)
    res = capture_side(MockScanner(p, bed_dpi=BED_DPI), 600, "front", max_cards=2)
    check(res, 1, "single card, white lid, 4° skew")

    # 2) Two cards on black backing, including a white-bordered card.
    bed = make_bed([
        (make_card(BED_DPI, border=(250, 250, 250), seed=2), 2.2, 2.8, -2.0),
        (make_card(BED_DPI, seed=3), 5.8, 3.0, 1.5),
    ], (15, 15, 15))
    p = os.path.join(tmp, "two_black.png")
    cv2.imwrite(p, bed)
    res = capture_side(MockScanner(p, bed_dpi=BED_DPI), 600, "front", max_cards=2)
    check(res, 2, "two cards, black backing")
    assert res[0].position_in[0] < res[1].position_in[0], "cards not sorted left-to-right"

    # 3) Empty bed -> NoCardError.
    from pipeline import NoCardError
    bed = make_bed([], (245, 245, 245))
    p = os.path.join(tmp, "empty.png")
    cv2.imwrite(p, bed)
    try:
        capture_side(MockScanner(p, bed_dpi=BED_DPI), 600, "front")
        raise AssertionError("expected NoCardError")
    except NoCardError:
        print("PASS empty bed raises NoCardError")

    out = os.path.join(tmp, "crop_example.png")
    cv2.imwrite(out, res[0].image)
    print("example crop:", out)


if __name__ == "__main__":
    main()
