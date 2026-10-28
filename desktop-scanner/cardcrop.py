"""Find trading cards on a scan and crop/straighten them."""

import cv2
import numpy as np

CARD_W_IN = 2.5
CARD_H_IN = 3.5
DETECT_MAX_SIDE = 1400  # detection runs on a downscaled copy for speed


def _border_pixels(img):
    h, w = img.shape[:2]
    b = max(2, int(min(h, w) * 0.02))
    ch = img.shape[2] if img.ndim == 3 else 1
    return np.concatenate([
        img[:b].reshape(-1, ch), img[-b:].reshape(-1, ch),
        img[:, :b].reshape(-1, ch), img[:, -b:].reshape(-1, ch),
    ])


def _border_color(img):
    return np.median(_border_pixels(img), axis=0)


def foreground_mask(img):
    """Mask of everything that differs from the background (lid or backing sheet)."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    bg = _border_color(lab)
    dist = np.linalg.norm(lab - bg, axis=2)
    d8 = np.clip(dist * 2.0, 0, 255).astype(np.uint8)
    t, _ = cv2.threshold(d8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    # Otsu alone can land above a dark card border (Pokémon backs on a black sheet), so cap it just above
    # the backing sheet's own variation, measured on the same outer band. Each side is measured on its own
    # and the quietest one wins, so a card touching one edge of the scan doesn't count as "background".
    b = max(2, int(min(d8.shape[:2]) * 0.02))
    noise = min(float(np.percentile(s, 99)) for s in (d8[:b], d8[-b:], d8[:, :b], d8[:, -b:]))
    t = max(40, min(t, noise + 20))
    mask = (d8 > t).astype(np.uint8) * 255
    k = max(3, int(min(img.shape[:2]) * 0.006)) | 1
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE,
                            cv2.getStructuringElement(cv2.MORPH_RECT, (k * 3, k * 3)))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,
                            cv2.getStructuringElement(cv2.MORPH_RECT, (k, k)))
    # Fill holes so glare/holo areas inside the card don't split it.
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(mask)
    cv2.drawContours(filled, cnts, -1, 255, thickness=cv2.FILLED)
    return filled


def _downscale(img, max_side=DETECT_MAX_SIDE):
    h, w = img.shape[:2]
    s = min(1.0, max_side / max(h, w))
    if s < 1.0:
        img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    return img, s


def detect_cards(img, dpi, max_cards=2):
    """Return card rectangles found on a (preview) scan.

    Each item: {"box_px": (x, y, w, h) axis-aligned in img pixels,
                "box_in": (x, y, w, h) in inches, "rect": cv2 minAreaRect}
    Sorted top-to-bottom, then left-to-right.
    """
    small, s = _downscale(img)
    mask = foreground_mask(small)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    eff_dpi = dpi * s
    expected = CARD_W_IN * CARD_H_IN * eff_dpi * eff_dpi
    found = []
    for c in cnts:
        rect = cv2.minAreaRect(c)
        (_, _), (rw, rh), _ = rect
        area = rw * rh
        # 0.35x..4x a raw card: covers raw cards, toploaders and slabs.
        if area < expected * 0.35 or area > expected * 4:
            continue
        x, y, w, h = cv2.boundingRect(c)
        found.append((area, (x / s, y / s, w / s, h / s), rect))
    found.sort(key=lambda f: -f[0])
    found = found[:max_cards]
    row_h = CARD_H_IN * dpi * 0.6
    found.sort(key=lambda f: (round((f[1][1] + f[1][3] / 2) / row_h), f[1][0]))
    out = []
    for _, (x, y, w, h), rect in found:
        out.append({
            "box_px": (int(x), int(y), int(w), int(h)),
            "box_in": (x / dpi, y / dpi, w / dpi, h / dpi),
            "rect": rect,
        })
    return out


def _order_points(pts):
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()
    return np.array([pts[np.argmin(s)], pts[np.argmin(d)],
                     pts[np.argmax(s)], pts[np.argmax(d)]], dtype=np.float32)


def crop_card(img, dpi, pad_in=0.03):
    """Straighten and crop the largest card in img. Returns (image, found)."""
    small, s = _downscale(img)
    mask = foreground_mask(small)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return img, False
    c = max(cnts, key=cv2.contourArea)
    eff_dpi = dpi * s
    if cv2.contourArea(c) < CARD_W_IN * CARD_H_IN * eff_dpi * eff_dpi * 0.3:
        return img, False
    (cx, cy), (rw, rh), ang = cv2.minAreaRect(c)
    pad = pad_in * eff_dpi
    rect = ((cx / s, cy / s), ((rw + 2 * pad) / s, (rh + 2 * pad) / s), ang)
    pts = _order_points(cv2.boxPoints(rect).astype(np.float32))
    tl, tr, br, bl = pts
    out_w = int(round(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl))))
    out_h = int(round(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr))))
    dst = np.array([[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]],
                   dtype=np.float32)
    M = cv2.getPerspectiveTransform(pts, dst)
    warped = cv2.warpPerspective(img, M, (out_w, out_h), flags=cv2.INTER_CUBIC,
                                 borderMode=cv2.BORDER_REPLICATE)
    return warped, True
