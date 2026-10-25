"""Make synthetic flatbed scans + the desktop app's results for them (expected.json).

  python tests/make_parity_images.py <out_dir> [path/to/rr-card-scan]
"""
import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, sys.argv[2] if len(sys.argv) > 2 else str(Path(__file__).resolve().parents[1] / "desktop-scanner"))
sys.path.insert(0, str(Path(sys.path[0]) / "tests"))
from test_centering import card, bed_with  # noqa: E402
import test_centering  # noqa: E402
from pipeline import capture_side  # noqa: E402
from scanners import MockScanner  # noqa: E402


def save(name, bgr, dpi, fmt="png"):
    p = out / f"{name}.{fmt}"
    im = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    if fmt == "png":
        im.save(p, dpi=(dpi, dpi) if dpi else None, compress_level=1) if dpi else im.save(p, compress_level=1)
    else:
        im.save(p, quality=95, dpi=(dpi, dpi))
    return p


def python_result(path, dpi, max_cards):
    caps = capture_side(MockScanner(str(path), bed_dpi=dpi), dpi, "front", max_cards=max_cards)
    return [{"w": c.image.shape[1], "h": c.image.shape[0], "lr": c.centering["summary"]["lr"],
             "tb": c.centering["summary"]["tb"], "widths": c.centering["summary"]["widths_in"],
             "all_found": c.centering["summary"]["all_found"]} for c in caps]


cases = []
for name, (L, R, T, B, ang, bg, border) in {
    "centered": (0.13, 0.13, 0.14, 0.14, 2.5, (15, 15, 15), (40, 200, 235)),
    "offcenter": (0.156, 0.104, 0.182, 0.098, 2.5, (15, 15, 15), (40, 200, 235)),
    "whitelid": (0.12, 0.15, 0.10, 0.16, -3, (245, 245, 245), (40, 200, 235)),
    "silver": (0.14, 0.11, 0.13, 0.15, 2.5, (15, 15, 15), (192, 192, 196)),
}.items():
    img = bed_with(card(600, L, R, T, B, border=border), ang, bg)
    p = save(name, img, 600)
    cases.append({"file": p.name, "default_dpi": 1200, "cards": 1, "truth": [L, R, T, B],
                  "python": python_result(p, 600, 1)})

# same off-center card, PNG without any dpi info (browser must work it out)
img = bed_with(card(600, 0.156, 0.104, 0.182, 0.098), 1.5, (15, 15, 15))
p = save("nodpi", img, None)
cases.append({"file": p.name, "default_dpi": 1200, "cards": 1, "truth": [0.156, 0.104, 0.182, 0.098],
              "python": python_result(p, 600, 1)})

# two cards on one scan
W, H = int(8.5 * 600), int(11.7 * 600)
two = np.full((H, W, 3), 15, np.uint8)
for cx, ang, borders, seed in [(2.2, -2.0, (0.15, 0.11, 0.14, 0.14), 1), (5.8, 1.5, (0.12, 0.12, 0.17, 0.11), 2)]:
    c = card(600, *borders, art_seed=seed)
    h, w = c.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), ang, 1.0); M[:, 2] += [cx * 600 - w / 2, 3.0 * 600 - h / 2]
    mask = cv2.warpAffine(np.full((h, w), 255, np.uint8), M, (W, H))
    rot = cv2.warpAffine(c, M, (W, H), flags=cv2.INTER_CUBIC)
    a = (mask.astype(np.float32) / 255)[..., None]
    two = (two * (1 - a) + rot * a).astype(np.uint8)
p = save("twocards", two, 600)
cases.append({"file": p.name, "default_dpi": 1200, "cards": 2,
              "truth": [[0.15, 0.11, 0.14, 0.14], [0.12, 0.12, 0.17, 0.11]], "python": python_result(p, 600, 2)})

# 1200 dpi JPEG (what a real scan at intake resolution looks like), scan area 4.5 x 5.5 in
test_centering.DPI = 1200
c = card(1200, 0.17, 0.11, 0.16, 0.12)
Wb, Hb = int(4.5 * 1200), int(5.5 * 1200)
bed = np.full((Hb, Wb, 3), 15, np.uint8)
h, w = c.shape[:2]
M = cv2.getRotationMatrix2D((w / 2, h / 2), 1.8, 1.0); M[:, 2] += [Wb / 2 - w / 2, Hb / 2 - h / 2]
mask = cv2.warpAffine(np.full((h, w), 255, np.uint8), M, (Wb, Hb))
rot = cv2.warpAffine(c, M, (Wb, Hb), flags=cv2.INTER_CUBIC)
a = (mask.astype(np.float32) / 255)[..., None]
bed = np.clip((bed * (1 - a) + rot * a) + np.random.default_rng(5).normal(0, 2, bed.shape), 0, 255).astype(np.uint8)
p = save("jpeg1200", bed, 1200, "jpg")
cases.append({"file": p.name, "default_dpi": 600, "cards": 1, "truth": [0.17, 0.11, 0.16, 0.12],
              "python": python_result(p, 1200, 1)})

(out / "expected.json").write_text(json.dumps(cases, indent=1))
print("wrote", len(cases), "cases to", out, [f"{(out / c['file']).stat().st_size // 1024} KB" for c in cases])
