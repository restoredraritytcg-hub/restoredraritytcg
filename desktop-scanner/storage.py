"""Save card scans in an organized folder per card, with corner/edge close-ups.

Layout:
  <output>/<Submission>/C001_<card-name>/
      report.html                 <- card detail report (built by library.py)
      before/                     <- one folder per stage: before / progress / after
          front.png  back.png     <- full resolution, lossless
          front_web.jpg ...       <- ~2400px JPG (uploaded)
          front_thumb.jpg ...     <- small preview for the library
          front.json  back.json   <- scan details + upload status
          corners/front_top-left.png ... back_bottom-left.png
          edges/front_top.png ... back_left.png
  <output>/index.html             <- searchable library of every card
  <output>/scan_log.csv
"""

import csv
import datetime
import json
import os
import re
from pathlib import Path

import cv2
from PIL import Image

import detail

LOG_FIELDS = ["timestamp", "submission_id", "customer", "card_number", "card_name",
              "stage", "side", "dpi", "auto_cropped", "full_res_file", "web_file", "notes"]


def safe(text, fallback="NA"):
    text = re.sub(r"[^A-Za-z0-9_-]+", "-", (text or "").strip()).strip("-")
    return text or fallback


def card_dir(out_dir, submission_id, card_number, card_name=""):
    """Existing folder for this card (any name suffix), or a new one."""
    sub = Path(out_dir) / safe(submission_id)
    prefix = f"C{int(card_number):03d}"
    if sub.exists():
        for d in sorted(sub.iterdir()):
            if d.is_dir() and (d.name == prefix or d.name.startswith(prefix + "_")):
                return d
    name = prefix + (f"_{safe(card_name)[:40]}" if (card_name or "").strip() else "")
    return sub / name


def _pil(bgr):
    return Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))


def _save_png(bgr, path, dpi):
    _pil(bgr).save(path, dpi=(dpi, dpi), compress_level=4)


def save_side(out_dir, meta, capture, web_long_side=2400):
    """Save one side of one card. Returns (full_res_path, web_path, sidecar_path)."""
    cdir = card_dir(out_dir, meta["submission_id"], meta["card_number"], meta.get("card_name", ""))
    stage = safe(meta["stage"])
    sdir = cdir / stage
    (sdir / "corners").mkdir(parents=True, exist_ok=True)
    (sdir / "edges").mkdir(parents=True, exist_ok=True)
    side = meta["side"]
    dpi = capture.dpi

    full_path = sdir / f"{side}.png"
    _save_png(capture.image, full_path, dpi)

    pil = _pil(capture.image)
    web = pil.copy()
    web.thumbnail((web_long_side, web_long_side), Image.LANCZOS)
    web_path = sdir / f"{side}_web.jpg"
    web.save(web_path, quality=90, dpi=(dpi, dpi))
    thumb = pil.copy()
    thumb.thumbnail((420, 420), Image.LANCZOS)
    thumb_path = sdir / f"{side}_thumb.jpg"
    thumb.save(thumb_path, quality=85)

    rel = lambda p: p.relative_to(cdir).as_posix()  # noqa: E731
    files = {"full": rel(full_path), "web": rel(web_path), "thumb": rel(thumb_path),
             "corners": {}, "edges": {}, "boxes": {}}
    if capture.cropped:
        corners, edges, files["boxes"] = detail.extract(capture.image, dpi, capture.pad_in)
        try:
            files["centering"] = capture.centering or detail.measure_centering(capture.image, dpi, capture.pad_in)
        except Exception as exc:  # never lose a scan over a measurement problem
            files["centering"] = {"error": str(exc)}
        for name, im in corners.items():
            p = sdir / "corners" / f"{side}_{name}.png"
            _save_png(im, p, dpi)
            files["corners"][name] = rel(p)
        for name, im in edges.items():
            p = sdir / "edges" / f"{side}_{name}.png"
            _save_png(im, p, dpi)
            files["edges"][name] = rel(p)

    record = dict(meta)
    record.update({
        "timestamp": datetime.datetime.now().isoformat(timespec="seconds"),
        "stage": stage,
        "dpi": dpi,
        "auto_cropped": capture.cropped,
        "full_res_file": str(full_path),
        "web_file": str(web_path),
        "files": files,
        "uploaded": False,
        "drive_url": "",
    })
    sidecar = sdir / f"{side}.json"
    sidecar.write_text(json.dumps(record, indent=2))
    append_log(out_dir, record)
    return full_path, web_path, sidecar


def append_log(out_dir, record):
    log = Path(out_dir) / "scan_log.csv"
    new = not log.exists()
    with open(log, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=LOG_FIELDS, extrasaction="ignore")
        if new:
            w.writeheader()
        w.writerow(record)


def iter_sidecars(out_dir):
    root = Path(out_dir)
    if not root.exists():
        return
    for p in sorted(root.glob("*/*/*/*.json")):
        try:
            data = json.loads(p.read_text())
        except Exception:
            continue
        if data.get("side") in ("front", "back"):
            yield p, data


def mark_uploaded(sidecar, drive_url):
    data = json.loads(Path(sidecar).read_text())
    data["uploaded"] = True
    data["drive_url"] = drive_url
    Path(sidecar).write_text(json.dumps(data, indent=2))


def pending_uploads(out_dir):
    return [(p, d) for p, d in iter_sidecars(out_dir) if not d.get("uploaded")]


def open_path(path):
    path = str(path)
    if os.name == "nt":
        os.startfile(path)  # noqa: S606


def open_folder(path):
    os.makedirs(str(path), exist_ok=True)
    open_path(path)
