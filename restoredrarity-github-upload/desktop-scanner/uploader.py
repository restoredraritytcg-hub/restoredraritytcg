"""Push saved scans into the Restored Rarity portal (Supabase).

For each saved side it uploads the web image, thumbnail, 4 corner and 4 edge
close-ups to Storage, then records them in the `scans` table for the matching
submission code + card number. The submission must already exist in the portal
(from the intake form or created by you); a missing card number is added.

Uses the project's service_role key, which stays in config.json on this PC only.
"""

import io
import time
from pathlib import Path

import requests
from PIL import Image

TIMEOUT = 60
BUCKET = "portal"


class UploadError(Exception):
    pass


# ----------------------------------------------------------- file mapping
def portal_files(record, storage_key, version=None):
    """Plan the upload for one saved side.

    Returns (items, files) where items = [(local_path, portal_path, as_jpeg)] and
    files is the JSON stored in scans.files (portal paths + overlay boxes).
    """
    card_dir = Path(record["web_file"]).parent.parent
    local = record.get("files", {})
    version = version or time.strftime("%Y%m%d%H%M%S")
    side, stage = record["side"], record["stage"]
    base = f"s/{storage_key}/{record['submission_id']}/C{int(record['card_number']):03d}/{stage}"
    items, files = [], {"corners": {}, "edges": {}, "boxes": local.get("boxes", {})}
    if local.get("centering") and "lines" in local["centering"]:
        files["centering"] = local["centering"]

    def add(rel, name, as_jpeg):
        p = f"{base}/{name}_{version}.jpg"
        items.append((card_dir / rel, p, as_jpeg))
        return p

    if local.get("web"):
        files["web"] = add(local["web"], f"{side}_web", False)
    if local.get("thumb"):
        files["thumb"] = add(local["thumb"], f"{side}_thumb", False)
    for k, rel in local.get("corners", {}).items():
        files["corners"][k] = add(rel, f"corners/{side}_{k}", True)
    for k, rel in local.get("edges", {}).items():
        files["edges"][k] = add(rel, f"edges/{side}_{k}", True)
    return items, files


def jpeg_bytes(path, as_jpeg):
    if not as_jpeg:
        return Path(path).read_bytes()
    im = Image.open(path).convert("RGB")
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=93, subsampling=0)
    return buf.getvalue()


# --------------------------------------------------------------- client
class Portal:
    def __init__(self, url, service_key):
        if not url or not service_key:
            raise UploadError("Set the Supabase URL and service key in Settings.")
        self.url = url.rstrip("/")
        self.s = requests.Session()
        self.s.headers.update({"apikey": service_key, "Authorization": f"Bearer {service_key}"})

    def _check(self, r, what):
        if r.status_code >= 300:
            try:
                msg = r.json().get("message") or r.json().get("error") or r.text
            except ValueError:
                msg = r.text
            raise UploadError(f"{what} failed ({r.status_code}): {msg[:300]}")
        return r

    def get(self, table, params):
        r = self.s.get(f"{self.url}/rest/v1/{table}", params=params, timeout=TIMEOUT)
        return self._check(r, f"Reading {table}").json()

    def post(self, table, body, prefer="return=representation", params=None):
        r = self.s.post(f"{self.url}/rest/v1/{table}", json=body, params=params,
                        headers={"Prefer": prefer}, timeout=TIMEOUT)
        return self._check(r, f"Saving {table}").json()

    def patch(self, table, match, body):
        r = self.s.patch(f"{self.url}/rest/v1/{table}", params=match, json=body,
                         headers={"Prefer": "return=minimal"}, timeout=TIMEOUT)
        self._check(r, f"Updating {table}")

    def put_object(self, path, data):
        r = self.s.post(f"{self.url}/storage/v1/object/{BUCKET}/{path}", data=data,
                        headers={"Content-Type": "image/jpeg", "x-upsert": "true",
                                 "Cache-Control": "max-age=31536000"}, timeout=TIMEOUT)
        self._check(r, f"Uploading {path.rsplit('/', 1)[-1]}")

    def delete_objects(self, paths):
        if paths:
            r = self.s.delete(f"{self.url}/storage/v1/object/{BUCKET}", json={"prefixes": paths},
                              timeout=TIMEOUT)
            self._check(r, "Removing old images")


def test_connection(url, key):
    p = Portal(url, key)
    p.get("submissions", {"select": "id", "limit": "1"})
    n = p.get("customers", {"select": "id"})
    return {"ok": True, "sheet": f"portal reachable · {len(n)} customer profile(s)"}


def find_submission(p, code):
    rows = p.get("submissions", {"code": f"eq.{code}", "select": "id,customer_id,customers(storage_key)"})
    if not rows:
        raise UploadError(f"Submission {code} isn't in the portal yet. Create it there first "
                          "(or check the code), then use File → Upload pending scans.")
    return rows[0]


def upload_side(url, key, record):
    """Upload one saved side. Returns a short description of where it went."""
    p = Portal(url, key)
    code = record["submission_id"]
    sub = find_submission(p, code)
    storage_key = sub["customers"]["storage_key"]
    num = int(record["card_number"])

    cards = p.get("cards", {"submission_id": f"eq.{sub['id']}", "card_number": f"eq.{num}",
                            "select": "id,name,status"})
    if cards:
        card = cards[0]
        patch = {}
        if not card["name"] and record.get("card_name"):
            patch["name"] = record["card_name"]
        if card["status"] == "submitted":
            patch["status"] = "received"
        if patch:
            p.patch("cards", {"id": f"eq.{card['id']}"}, patch)
    else:
        card = p.post("cards", {"submission_id": sub["id"], "card_number": num,
                                "name": record.get("card_name", ""), "status": "received"})[0]

    items, files = portal_files(record, storage_key)
    for local, remote, as_jpeg in items:
        p.put_object(remote, jpeg_bytes(local, as_jpeg))

    old = p.get("scans", {"card_id": f"eq.{card['id']}", "stage": f"eq.{record['stage']}",
                          "side": f"eq.{record['side']}", "select": "files"})
    p.post("scans", {"card_id": card["id"], "stage": record["stage"], "side": record["side"],
                     "dpi": record.get("dpi"), "files": files,
                     "scanned_at": record.get("timestamp")},
           prefer="resolution=merge-duplicates,return=representation",
           params={"on_conflict": "card_id,stage,side"})
    if old:
        f = old[0].get("files") or {}
        stale = [f.get("web"), f.get("thumb"), *f.get("corners", {}).values(), *f.get("edges", {}).values()]
        new = {x[1] for x in items}
        p.delete_objects([x for x in stale if x and x not in new])
    return f"{code} card #{num} {record['stage']} {record['side']}"
