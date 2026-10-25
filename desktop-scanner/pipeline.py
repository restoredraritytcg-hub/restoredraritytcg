"""Preview scan -> find cards -> high-res scan of each card -> crop."""

from dataclasses import dataclass

import numpy as np

from cardcrop import detect_cards, crop_card
from detail import measure_centering


CROP_PAD_IN = 0.06  # background kept around the card; detail.py relies on this inset


class NoCardError(Exception):
    pass


@dataclass
class CardCapture:
    image: np.ndarray      # cropped, straightened card (BGR)
    dpi: int               # actual scan resolution
    position_in: tuple     # (x, y, w, h) on the glass, inches
    cropped: bool          # False if auto-crop failed and the raw region was kept
    pad_in: float = CROP_PAD_IN  # card edge sits exactly this far inside the image
    centering: dict = None       # auto border measurements (see detail.measure_centering)


def capture_side(scanner, dpi, side, preview_dpi=100, max_cards=2,
                 margin_in=0.25, progress=lambda msg: None):
    progress(f"Preview scan ({side})…")
    preview, pdpi = scanner.scan(preview_dpi, None, side)
    bed_w_in = preview.shape[1] / pdpi
    bed_h_in = preview.shape[0] / pdpi

    cards = detect_cards(preview, pdpi, max_cards=max_cards)
    if not cards:
        raise NoCardError(
            "No card found on the glass. Place the card face-down and close the lid "
            "(a black sheet behind the card helps with white-bordered cards)."
        )

    results = []
    for i, c in enumerate(cards, 1):
        x, y, w, h = c["box_in"]
        x0 = max(0.0, x - margin_in)
        y0 = max(0.0, y - margin_in)
        x1 = min(bed_w_in, x + w + margin_in)
        y1 = min(bed_h_in, y + h + margin_in)
        region = (x0, y0, x1 - x0, y1 - y0)
        progress(f"Scanning {side} of card {i}/{len(cards)} at {dpi} dpi…")
        raw, actual = scanner.scan(dpi, region, side)
        progress(f"Cropping card {i}/{len(cards)}…")
        img, ok = crop_card(raw, actual, pad_in=CROP_PAD_IN)
        cen = None
        if ok:
            try:
                cen = measure_centering(img, actual, CROP_PAD_IN)
            except Exception:
                cen = None
        results.append(CardCapture(img, actual, region, ok, CROP_PAD_IN, cen))
    return results
