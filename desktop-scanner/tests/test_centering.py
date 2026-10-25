"""Centering accuracy: draw cards with known border widths, scan (mock) and measure.

Run:  python tests/test_centering.py
"""

import os
import sys
import tempfile

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from detail import measure_centering  # noqa: E402
from pipeline import capture_side  # noqa: E402
from scanners import MockScanner  # noqa: E402

DPI = 600


def card(dpi, L, R, T, B, border=(40, 200, 235), art_seed=0, ss=4):
    """Card with given border widths (inches); drawn supersampled for clean edges."""
    d = dpi * ss
    w, h = int(2.5 * d), int(3.5 * d)
    im = np.full((h, w, 3), border, np.uint8)
    rng = np.random.default_rng(art_seed)
    art = cv2.resize(rng.integers(0, 255, (40, 30, 3), dtype=np.uint8), (w, h), interpolation=cv2.INTER_CUBIC)
    art = cv2.addWeighted(art, 0.7, np.full_like(art, (90, 60, 140)), 0.3, 0)
    im[int(T * d):h - int(B * d), int(L * d):w - int(R * d)] = art[int(T * d):h - int(B * d), int(L * d):w - int(R * d)]
    return cv2.resize(im, (int(2.5 * dpi), int(3.5 * dpi)), interpolation=cv2.INTER_AREA)


def bed_with(c, angle, background):
    W, H = int(8.5 * DPI), int(11.7 * DPI)
    bed = np.full((H, W, 3), background, np.uint8)
    h, w = c.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    M[:, 2] += [W / 2 - w / 2, H / 2 - h / 2]
    mask = cv2.warpAffine(np.full((h, w), 255, np.uint8), M, (W, H), flags=cv2.INTER_LINEAR)
    rot = cv2.warpAffine(c, M, (W, H), flags=cv2.INTER_CUBIC)
    a = (mask.astype(np.float32) / 255)[..., None]
    out = (bed * (1 - a) + rot * a).astype(np.uint8)
    noise = np.random.default_rng(3).normal(0, 2, out.shape)
    return np.clip(out + noise, 0, 255).astype(np.uint8)


def run(name, L, R, T, B, angle=2.5, background=(15, 15, 15), border=(40, 200, 235)):
    tmp = tempfile.mkdtemp()
    p = os.path.join(tmp, "bed.png")
    cv2.imwrite(p, bed_with(card(DPI, L, R, T, B, border=border), angle, background))
    cap = capture_side(MockScanner(p, bed_dpi=DPI), DPI, "front", max_cards=1)[0]
    m = measure_centering(cap.image, cap.dpi, cap.pad_in)
    s = m["summary"]
    exp_lr = 100 * L / (L + R)
    exp_tb = 100 * T / (T + B)
    errs = {"left": s["left_in"] - L, "right": s["right_in"] - R, "top": s["top_in"] - T, "bottom": s["bottom_in"] - B}
    worst = max(abs(v) for v in errs.values())
    ok = worst < 0.006 and abs(s["lr"][0] - exp_lr) < 2 and abs(s["tb"][0] - exp_tb) < 2 and s["all_found"]
    print(f"{'PASS' if ok else 'FAIL'} {name}: L/R {s['lr'][0]}/{s['lr'][1]} (exp {exp_lr:.1f}) "
          f"T/B {s['tb'][0]}/{s['tb'][1]} (exp {exp_tb:.1f}) worst border error {worst * 25.4:.3f} mm")
    return ok, m


if __name__ == "__main__":
    results = [
        run("well centered", 0.13, 0.13, 0.14, 0.14)[0],
        run("off-center 60/40 L/R, 65/35 T/B", 0.156, 0.104, 0.182, 0.098)[0],
        run("white lid, -3° skew", 0.12, 0.15, 0.10, 0.16, angle=-3, background=(245, 245, 245))[0],
        run("silver border on black", 0.14, 0.11, 0.13, 0.15, border=(192, 192, 196))[0],
    ]
    # Full-art style card (no border): markers should be flagged "not found", not crash.
    tmp = tempfile.mkdtemp(); bp = os.path.join(tmp, "bed.png")
    cv2.imwrite(bp, bed_with(card(DPI, 0, 0, 0, 0), 2.0, (15, 15, 15)))
    cap = capture_side(MockScanner(bp, bed_dpi=DPI), DPI, "front", max_cards=1)[0]
    m = measure_centering(cap.image, cap.dpi, cap.pad_in)
    flagged = not m["summary"]["all_found"]
    print(("PASS" if flagged else "FAIL") + " borderless card flagged for manual placement")
    sys.exit(0 if all(results) and flagged else 1)
