"""Corner and edge close-ups from a straightened card scan (dig-report style).

The straightened image from cardcrop.crop_card has the card inset by exactly
pad_in on every side, so the card's outline is known precisely.
"""

import numpy as np

CORNER_IN = 0.40   # how far into the card each corner close-up reaches
EDGE_IN = 0.22     # how far into the card each edge strip reaches
OUTSIDE_IN = 0.06  # background kept outside the card edge (shows the cut/whitening)

CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"]
EDGES = ["top", "right", "bottom", "left"]


def _crop(img, x0, y0, x1, y1):
    h, w = img.shape[:2]
    x0, y0 = max(0, int(x0)), max(0, int(y0))
    x1, y1 = min(w, int(x1)), min(h, int(y1))
    return img[y0:y1, x0:x1].copy()


def extract(img, dpi, pad_in):
    """Return (corners, edges, boxes).

    corners/edges: name -> BGR image.
    boxes: name -> [x0, y0, x1, y1] as fractions of the image size, used to draw
    clickable outlines on the whole-card view in the report.
    """
    h, w = img.shape[:2]
    p = round(pad_in * dpi)
    x0, y0, x1, y1 = p, p, w - p, h - p          # card outline
    c = round(CORNER_IN * dpi)
    e = round(EDGE_IN * dpi)
    o = round(OUTSIDE_IN * dpi)

    regions = {
        "top-left": (x0 - o, y0 - o, x0 + c, y0 + c),
        "top-right": (x1 - c, y0 - o, x1 + o, y0 + c),
        "bottom-right": (x1 - c, y1 - c, x1 + o, y1 + o),
        "bottom-left": (x0 - o, y1 - c, x0 + c, y1 + o),
        "top": (x0 - o, y0 - o, x1 + o, y0 + e),
        "right": (x1 - e, y0 - o, x1 + o, y1 + o),
        "bottom": (x0 - o, y1 - e, x1 + o, y1 + o),
        "left": (x0 - o, y0 - o, x0 + e, y1 + o),
    }
    corners = {k: _crop(img, *regions[k]) for k in CORNERS}
    edges = {k: _crop(img, *regions[k]) for k in EDGES}
    boxes = {}
    for k, (a, b, cc, d) in regions.items():
        boxes[k] = [round(max(0, a) / w, 4), round(max(0, b) / h, 4),
                    round(min(w, cc) / w, 4), round(min(h, d) / h, 4)]
    return corners, edges, boxes


# ------------------------------------------------------------- centering
#
# Border width is measured on 8 lines per side, each 0.5 in in from a corner:
#   "top@left"  = top border, measured 0.5 in from the left edge, and so on.
# For each line we find the card's outer edge and the inner edge of the
# border (where the border color ends), as fractions of the image size, so
# they line up with any scaled copy of the image (web JPG, thumbnail...).

CENTER_FROM_CORNER_IN = 0.5
LINES = ["top@left", "top@right", "bottom@left", "bottom@right",
         "left@top", "left@bottom", "right@top", "right@bottom"]
_SEARCH_IN = 0.75   # how far inside the card to look for the end of the border
_DEFAULT_IN = 0.125  # where to park the inner marker when nothing is found


def _oriented(seq, outer, direction, back, fwd):
    idx = outer + direction * np.arange(-back, fwd + 1)
    idx = np.clip(idx, 0, len(seq) - 1)
    return seq[idx]


def _detect(seq, outer_nom, direction, dpi):
    """seq: Lab colors along the line. Returns (outer_px, inner_px, found)."""
    back = max(3, round(0.04 * dpi))
    fwd = round(_SEARCH_IN * dpi)
    arr = _oriented(seq, outer_nom, direction, back, fwd)
    grad = np.zeros(len(arr))
    grad[1:-1] = np.linalg.norm(arr[2:] - arr[:-2], axis=1)

    lo, hi = 1, min(len(arr) - 2, 2 * back)
    outer_k = lo + int(np.argmax(grad[lo:hi + 1]))

    s = max(2, round(0.015 * dpi))
    b0, b1 = outer_k + max(2, round(0.02 * dpi)), outer_k + max(4, round(0.05 * dpi))
    border = np.median(arr[b0:b1], axis=0)
    dist = np.linalg.norm(arr - border, axis=1)
    spread = float(np.std(dist[b0:b1]))
    thr = max(22.0, 6.0 * spread)
    if spread > 10.0:  # no solid border color here (full-art card, damage, glare)
        return outer_nom + direction * (outer_k - back), \
            outer_nom + direction * (outer_k + round(_DEFAULT_IN * dpi) - back), False

    start = outer_k + max(3, round(0.035 * dpi))
    inner_k, found = None, False
    for k in range(start, len(arr) - s):
        if dist[k:k + s].min() > thr:
            w0, w1 = max(start - 1, k - s), min(len(arr) - 2, k + max(1, s // 2))
            inner_k = w0 + int(np.argmax(grad[w0:w1 + 1]))
            found = True
            break
    if inner_k is None:
        inner_k = outer_k + round(_DEFAULT_IN * dpi)
    to_px = lambda k: outer_nom + direction * (k - back)  # noqa: E731
    return to_px(outer_k), to_px(inner_k), found


def measure_centering(img, dpi, pad_in):
    """Auto-measure the 8 border lines of a straightened card image."""
    import cv2
    h, w = img.shape[:2]
    lab = cv2.cvtColor(cv2.GaussianBlur(img, (3, 3), 0), cv2.COLOR_BGR2LAB).astype(np.float32)
    p = round(pad_in * dpi)
    x0, y0, x1, y1 = p, p, w - 1 - p, h - 1 - p
    d = round(CENTER_FROM_CORNER_IN * dpi)
    hw = max(1, round(0.03 * dpi))

    def col(x):   # mean color down a narrow vertical band at x
        return lab[:, max(0, x - hw):x + hw + 1].mean(axis=1)

    def row(y):   # mean color across a narrow horizontal band at y
        return lab[max(0, y - hw):y + hw + 1, :].mean(axis=0)

    specs = {
        "top@left": ("y", x0 + d, col, y0, 1), "top@right": ("y", x1 - d, col, y0, 1),
        "bottom@left": ("y", x0 + d, col, y1, -1), "bottom@right": ("y", x1 - d, col, y1, -1),
        "left@top": ("x", y0 + d, row, x0, 1), "left@bottom": ("x", y1 - d, row, x0, 1),
        "right@top": ("x", y0 + d, row, x1, -1), "right@bottom": ("x", y1 - d, row, x1, -1),
    }
    lines = {}
    for name, (axis, pos, band, outer, direction) in specs.items():
        o, i, found = _detect(band(pos), outer, direction, dpi)
        along, across = (h, w) if axis == "y" else (w, h)
        lines[name] = {"axis": axis, "pos": round(pos / across, 5),
                       "outer": round((o + 0.5) / along, 5), "inner": round((i + 0.5) / along, 5),
                       "found": bool(found)}
    return {"w_in": round(w / dpi, 4), "h_in": round(h / dpi, 4), "lines": lines,
            "auto": True, "summary": centering_summary(w / dpi, h / dpi, lines)}


def centering_summary(w_in, h_in, lines):
    """Border widths (inches) and the L/R, T/B split, e.g. 55/45."""
    size = {"y": h_in, "x": w_in}
    widths = {k: abs(v["inner"] - v["outer"]) * size[v["axis"]] for k, v in lines.items()}

    def avg(side):
        a = [widths[k] for k in widths if k.startswith(side + "@")]
        return sum(a) / len(a)

    L, R, T, B = avg("left"), avg("right"), avg("top"), avg("bottom")
    lr = round(100 * L / (L + R), 1) if L + R else None
    tb = round(100 * T / (T + B), 1) if T + B else None
    # Two measurements on the same side should roughly agree; flag sides that don't.
    check = [side for side in ("top", "bottom", "left", "right")
             if abs(widths[side + "@" + ("left" if side in ("top", "bottom") else "top")]
                    - widths[side + "@" + ("right" if side in ("top", "bottom") else "bottom")]) > 0.025]
    return {"widths_in": {k: round(v, 4) for k, v in widths.items()}, "check": check,
            "left_in": round(L, 4), "right_in": round(R, 4), "top_in": round(T, 4), "bottom_in": round(B, 4),
            "lr": [lr, round(100 - lr, 1)] if lr is not None else None,
            "tb": [tb, round(100 - tb, 1)] if tb is not None else None,
            "all_found": all(v.get("found", True) for v in lines.values()) and not check}
