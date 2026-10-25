"""Build portal/demo/ (sample images + demo-data.js) from a local scan library.

  python tools/make_demo.py "<scanner output folder>" [path/to/rr-card-scan]

Lets the portal be previewed (admin.html?demo, view.html?demo#t=demo-token)
before Supabase is set up.
"""

import json
import shutil
import sys
from datetime import datetime, timedelta
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
PORTAL = HERE.parent / "portal"


def main():
    lib = Path(sys.argv[1])
    sys.path.insert(0, str(Path(sys.argv[2]) if len(sys.argv) > 2 else HERE.parent / "desktop-scanner"))
    import storage
    import uploader

    out = PORTAL / "demo"
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    now = datetime.now().replace(microsecond=0)
    iso = lambda d: d.isoformat()  # noqa: E731

    customers = [
        {"id": "cust-1", "name": "Jordan Taylor", "email": "jordan@example.com", "phone": "(555) 010-2233",
         "internal_notes": "Repeat customer. Prefers text updates.", "share_token": "demo-token",
         "storage_key": "demo-sk", "created_at": iso(now - timedelta(days=40))},
        {"id": "cust-2", "name": "Sam Rivera", "email": "sam@example.com", "phone": "",
         "internal_notes": "", "share_token": "demo-token-2", "storage_key": "demo-sk2",
         "created_at": iso(now - timedelta(days=1))},
    ]
    submissions, cards, scans, photos = [], [], [], []
    subs_by_code = {}

    recs = [r for _, r in storage.iter_sidecars(lib)]
    for r in recs:
        code = r["submission_id"]
        if code not in subs_by_code:
            s = {"id": f"sub-{code}", "code": code, "customer_id": "cust-1", "status": "restored",
                 "service": "Clean + press", "public_notes": "Card #1 is done — see the before/after! "
                 "Card #2 is next in line.", "internal_notes": "Charizard needed 2 press cycles.",
                 "customer_notes": "Please be extra careful with the Charizard.",
                 "created_at": iso(now - timedelta(days=9)), "updated_at": iso(now - timedelta(hours=3))}
            subs_by_code[code] = s
            submissions.append(s)
        sub = subs_by_code[code]
        cid = f"card-{code}-{r['card_number']}"
        if not any(c["id"] == cid for c in cards):
            num = int(r["card_number"])
            cards.append({"id": cid, "submission_id": sub["id"], "card_number": num,
                          "name": r.get("card_name", ""), "details": "Base Set · 1999",
                          "status": "restored" if num == 1 else "in_progress",
                          "public_notes": "Whitening on two corners cleaned up; surface pressed flat." if num == 1 else "",
                          "internal_notes": "", "customer_notes": "Small crease near top" if num == 1 else "",
                          "created_at": sub["created_at"]})
        items, files = uploader.portal_files(r, "demo-sk", version="demo")
        for local, remote, as_jpeg in items:
            dest = out / remote
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(uploader.jpeg_bytes(local, as_jpeg))
        scans.append({"id": f"scan-{len(scans)}", "card_id": cid, "stage": r["stage"], "side": r["side"],
                      "dpi": r.get("dpi"), "files": files, "scanned_at": r.get("timestamp")})

    # A couple of "phone photos" from the customer, made from the scans.
    first_web = next((out / s["files"]["web"] for s in scans
                      if s["stage"] == "before" and s["side"] == "front"), None)
    if first_web is not None:
        card = cv2.imread(str(first_web))
        for i, (ang, cap, src, day) in enumerate([(8, "How it arrived — note the corner", "intake", 9),
                                                  (-5, "Back of the card", "intake", 9),
                                                  (3, "Found this old photo of it from 2003!", "customer", 2)]):
            h, w = card.shape[:2]
            bg = np.zeros((int(h * 1.5), int(w * 1.5), 3), np.uint8)
            bg[:] = (60, 90, 130) if i != 2 else (200, 200, 205)
            noise = np.random.default_rng(i).normal(0, 8, bg.shape)
            bg = np.clip(bg + noise, 0, 255).astype(np.uint8)
            M = cv2.getRotationMatrix2D((w / 2, h / 2), ang, 1)
            M[:, 2] += [(bg.shape[1] - w) / 2, (bg.shape[0] - h) / 2]
            mask = cv2.warpAffine(np.full((h, w), 255, np.uint8), M, (bg.shape[1], bg.shape[0]))
            rot = cv2.warpAffine(card, M, (bg.shape[1], bg.shape[0]))
            bg[mask > 0] = rot[mask > 0]
            bg = cv2.resize(bg, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
            rel = f"u/demo-sk/photo{i}.jpg"
            (out / "u/demo-sk").mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(out / rel), bg, [cv2.IMWRITE_JPEG_QUALITY, 85])
            photos.append({"id": f"ph-{i}", "customer_id": "cust-1",
                           "submission_id": submissions[0]["id"] if submissions else None,
                           "card_id": cards[0]["id"] if cards and i < 2 else None, "path": rel, "source": src,
                           "caption": cap, "created_at": iso(now - timedelta(days=day))})

    # A brand-new online submission that hasn't arrived yet.
    submissions.append({"id": "sub-new", "code": "RR-1043", "customer_id": "cust-2", "status": "submitted",
                        "service": "Clean only", "public_notes": "", "internal_notes": "",
                        "customer_notes": "Shipping Friday.", "created_at": iso(now - timedelta(days=1)),
                        "updated_at": iso(now - timedelta(days=1))})
    for n, (nm, det) in enumerate([("Pikachu", "Jungle 60/64"), ("Mewtwo", "Base Set 10/102"),
                                   ("Gengar", "Fossil 5/62")], 1):
        cards.append({"id": f"card-new-{n}", "submission_id": "sub-new", "card_number": n, "name": nm,
                      "details": det, "status": "submitted", "public_notes": "", "internal_notes": "",
                      "customer_notes": "", "created_at": iso(now - timedelta(days=1))})

    data = {"customers": customers, "submissions": submissions, "cards": cards, "scans": scans, "photos": photos}
    (out / "demo-data.js").write_text("window.RR_DEMO = " + json.dumps(data, indent=1) + ";\n")
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    print(f"demo: {len(cards)} cards, {len(scans)} scans, {len(photos)} photos, {size / 1e6:.1f} MB -> {out}")


if __name__ == "__main__":
    main()
