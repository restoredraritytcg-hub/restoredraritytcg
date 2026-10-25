"""Card library: per-card detail reports and a searchable index.

Everything is plain HTML with relative image links, so a submission folder can
be zipped or copied anywhere and the reports still open in any browser.
"""

import datetime
import html
import json
from pathlib import Path

import storage
from detail import CORNERS, EDGES

STAGE_ORDER = ["before", "progress", "after"]
STAGE_LABEL = {"before": "Before (intake)", "progress": "In progress", "after": "After (restored)"}
CORNER_LABEL = {"top-left": "Top left", "top-right": "Top right",
                "bottom-right": "Bottom right", "bottom-left": "Bottom left"}
EDGE_LABEL = {"top": "Top edge", "right": "Right edge", "bottom": "Bottom edge", "left": "Left edge"}

esc = html.escape


# ------------------------------------------------------------------ data ----

def load_cards(out_dir):
    """Group every saved side into cards. Newest-scanned card first."""
    cards = {}
    for sidecar, rec in storage.iter_sidecars(out_dir):
        cdir = sidecar.parent.parent  # <sub>/<card>/<stage>/<side>.json
        card = cards.setdefault(str(cdir), {
            "dir": cdir, "submission_id": rec.get("submission_id", ""),
            "card_number": rec.get("card_number", 0), "card_name": "", "customer": "",
            "notes": "", "stages": {}, "latest": "",
        })
        card["stages"].setdefault(rec.get("stage", "before"), {})[rec["side"]] = rec
        ts = rec.get("timestamp", "")
        if ts >= card["latest"]:
            card["latest"] = ts
            for k in ("card_name", "customer", "notes"):
                if rec.get(k):
                    card[k] = rec[k]
    out = list(cards.values())
    for c in out:
        c["stage_keys"] = sorted(c["stages"], key=lambda s: STAGE_ORDER.index(s) if s in STAGE_ORDER else 9)
        c["report"] = c["dir"] / "report.html"
    out.sort(key=lambda c: c["latest"], reverse=True)
    return out


def rebuild(out_dir):
    cards = load_cards(out_dir)
    for c in cards:
        build_report(c)
    build_index(out_dir, cards)
    return cards


# ---------------------------------------------------------------- styling ----

CSS = """
:root{--bg:#0b1220;--panel:#141d30;--panel2:#0f1626;--line:#24314d;--fg:#e8eef7;--muted:#8b97ad;
--gold:#f5b301;--cyan:#2ad4e6}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 "Segoe UI",system-ui,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:24px 16px 60px}
a{color:var(--cyan)}
header .brand{color:var(--gold);font-weight:600;letter-spacing:.08em;text-transform:uppercase;font-size:12px}
h1{margin:4px 0 6px;font-size:28px}
h2{margin:36px 0 4px;font-size:21px;color:var(--gold)}
h3{margin:22px 0 10px;font-size:16px;color:var(--cyan);text-transform:uppercase;letter-spacing:.06em}
h4{margin:18px 0 8px;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.meta{display:flex;flex-wrap:wrap;gap:8px 22px;color:var(--muted);font-size:14px}
.meta b{color:var(--fg);font-weight:600}
.notes{margin-top:10px;padding:10px 12px;background:var(--panel);border-left:3px solid var(--gold);border-radius:4px}
nav.toc{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 0}
nav.toc a{padding:6px 12px;background:var(--panel);border:1px solid var(--line);border-radius:999px;
text-decoration:none;font-size:13px}
.sub{color:var(--muted);font-size:13px}
.sides{display:grid;grid-template-columns:1fr 1fr;gap:20px}
@media(max-width:860px){.sides{grid-template-columns:1fr}.cmp{grid-template-columns:64px 1fr 1fr}}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px}
.ov{position:relative;max-width:330px;margin:0 auto 6px}
.ov>img{width:100%;display:block;border-radius:4px}
.hot{position:absolute;border:1.5px solid rgba(42,212,230,.5);border-radius:2px;cursor:zoom-in;
background:transparent;padding:0}
.hot.c{z-index:2;border-color:rgba(245,179,1,.85)}
.hot:hover{background:rgba(42,212,230,.2);border-color:var(--cyan)}
.hint{text-align:center;color:var(--muted);font-size:12px;margin:0 0 4px}
.corners{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.corners figure,.cmp figure{margin:0}
figure img{width:100%;display:block;border-radius:4px;background:var(--panel2)}
figcaption{font-size:12px;color:var(--muted);margin-top:4px;text-align:center}
.hedges figure{margin:0 0 10px}
.vedges{display:flex;gap:14px}
.vedges figure{margin:0;flex:1;text-align:center}
.vedges img{height:460px;width:auto;max-width:100%;object-fit:contain;margin:0 auto}
img.zoom{cursor:zoom-in}
.cmp{display:grid;grid-template-columns:120px 1fr 1fr;gap:8px 12px;align-items:center}
.cmp>div{min-width:0}
.cmp img{width:100%;max-height:420px;object-fit:contain;display:block;background:var(--panel2);border-radius:4px}
.cmp .h{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
.cmp .lbl{color:var(--fg);font-size:13px}
.warn{color:#ff8f8f;font-size:13px}
.cen{display:flex;gap:8px;align-items:center;margin:0 0 10px;padding:8px 10px;background:var(--panel2);border-radius:8px;color:var(--muted);font-size:13px}.cen b{color:var(--fg)}
.cbtn{margin-left:auto;background:#1d2942;color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:5px 10px;cursor:pointer;font:inherit}
#lb{position:fixed;inset:0;background:rgba(3,6,12,.94);display:none;overflow:auto;z-index:9;cursor:zoom-out}
#lb.on{display:block}
#lb img{display:block;margin:20px auto;max-width:none}
#lb.fit img{max-width:96vw;max-height:92vh}
#lbbar{position:fixed;top:10px;right:14px;z-index:10;display:none;gap:8px}
#lb.on + #lbbar{display:flex}
#lbbar button{background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:6px;
padding:6px 12px;cursor:pointer}
footer{margin-top:50px;color:var(--muted);font-size:12px}
/* index */
.search{width:100%;padding:12px 14px;font-size:16px;background:var(--panel);color:var(--fg);
border:1px solid var(--line);border-radius:8px;margin:16px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
.tile{display:block;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px;
text-decoration:none;color:var(--fg)}
.tile:hover{border-color:var(--gold)}
.tile img{width:100%;aspect-ratio:5/7;object-fit:contain;background:var(--panel2);border-radius:6px}
.tile .n{font-weight:600;margin-top:8px;line-height:1.3}
.tile .s{color:var(--muted);font-size:12px}
.badge{display:inline-block;font-size:11px;padding:1px 7px;border-radius:999px;margin:6px 4px 0 0;
border:1px solid var(--line);color:var(--cyan)}
.badge.after{color:#111;background:var(--gold);border-color:var(--gold)}
@media print{#lb,#lbbar,nav.toc{display:none}body{background:#fff;color:#000}.panel{border-color:#ccc}}
"""

LIGHTBOX = """
<div id="lb" class="fit"><img alt=""></div>
<div id="lbbar"><button id="lbfit">Actual size</button><button id="lbx">Close ✕</button></div>
<script>
(function(){
  var lb=document.getElementById('lb'),im=lb.querySelector('img'),fit=document.getElementById('lbfit');
  function close(){lb.classList.remove('on');im.removeAttribute('src');}
  document.addEventListener('click',function(e){
    var t=e.target;
    if(t.classList&&t.classList.contains('zoom')){im.src=t.getAttribute('data-full')||t.src;
      lb.classList.add('on','fit');fit.textContent='Actual size';e.preventDefault();}
  });
  lb.addEventListener('click',close);
  document.getElementById('lbx').addEventListener('click',close);
  fit.addEventListener('click',function(){lb.classList.toggle('fit');
    fit.textContent=lb.classList.contains('fit')?'Actual size':'Fit to screen';});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')close();});
})();
</script>
"""


def _img(src, full=None, cls="", alt=""):
    if not src:
        return '<div class="sub">—</div>'
    full = full or src
    return (f'<img class="zoom {cls}" src="{esc(src)}" data-full="{esc(full)}" '
            f'alt="{esc(alt)}" loading="lazy">')


def _fig(src, caption):
    return f"<figure>{_img(src, alt=caption)}<figcaption>{esc(caption)}</figcaption></figure>"


def _side_panel(rec):
    side = rec["side"]
    f = rec.get("files", {})
    c, e = f.get("corners", {}), f.get("edges", {})
    title = f'{side.capitalize()} <span class="sub">· {rec.get("dpi")} dpi · {esc(rec.get("timestamp", "").replace("T", " "))}</span>'
    out = [f'<div class="panel"><h3>{title}</h3>']
    cen = f.get("centering") or {}
    if cen.get("lines"):
        sm = cen["summary"]
        warn = "" if sm.get("all_found") else ' <span class="warn">⚠ check</span>'
        out.append(f'<div class="cen">L/R <b>{round(sm["lr"][0])}/{100 - round(sm["lr"][0])}</b> · T/B '
                   f'<b>{round(sm["tb"][0])}/{100 - round(sm["tb"][0])}</b>{warn}'
                   f'<button class="cbtn" data-center="{esc(rec.get("stage", ""))}|{esc(side)}">📐 Centering tool</button></div>')
    if not rec.get("auto_cropped", True) or not c:
        out.append('<p class="warn">Auto-crop didn\'t find the card edge on this side, so there are no '
                   'corner/edge close-ups. The full scan area is shown.</p>')
        out.append(_img(f.get("web"), f.get("full"), alt=side))
        out.append("</div>")
        return "".join(out)
    # Whole card with clickable outlines of every corner and edge close-up.
    boxes = f.get("boxes", {})
    out.append(f'<div class="ov">{_img(f.get("web"), f.get("full"), alt=side)}')
    for group, cls, labels in ((e, "e", EDGE_LABEL), (c, "c", CORNER_LABEL)):
        for k, path in group.items():
            b = boxes.get(k)
            if not b:
                continue
            style = (f"left:{b[0]*100:.2f}%;top:{b[1]*100:.2f}%;"
                     f"width:{(b[2]-b[0])*100:.2f}%;height:{(b[3]-b[1])*100:.2f}%")
            out.append(f'<button class="hot {cls} zoom" style="{style}" data-full="{esc(path)}" '
                       f'title="{esc(labels[k])}" aria-label="{esc(labels[k])}"></button>')
    out.append('</div><p class="hint">Click a gold corner or blue edge box to zoom in.</p>')
    out.append("<h4>Corners</h4><div class='corners'>")
    out += [_fig(c.get(k), CORNER_LABEL[k]) for k in ("top-left", "top-right", "bottom-left", "bottom-right")]
    out.append("</div><h4>Edges</h4><div class='hedges'>")
    out += [_fig(e.get(k), EDGE_LABEL[k]) for k in ("top", "bottom")]
    out.append("</div><div class='vedges'>")
    out += [_fig(e.get(k), EDGE_LABEL[k]) for k in ("left", "right")]
    out.append("</div></div>")
    return "".join(out)


def _compare(card, a, b):
    sa, sb = card["stages"][a], card["stages"][b]
    out = [f'<h2 id="compare">Compare: {esc(STAGE_LABEL.get(a, a))} vs {esc(STAGE_LABEL.get(b, b))}</h2>',
           '<p class="sub">Same corner or edge, side by side. Click any image to zoom.</p>']
    for side in ("front", "back"):
        ra, rb = sa.get(side), sb.get(side)
        if not ra or not rb:
            continue
        fa, fb = ra.get("files", {}), rb.get("files", {})
        out.append(f'<div class="panel" style="margin-top:14px"><h3>{side.capitalize()}</h3><div class="cmp">')
        out.append(f'<div></div><div class="h">{esc(STAGE_LABEL.get(a, a))}</div>'
                   f'<div class="h">{esc(STAGE_LABEL.get(b, b))}</div>')
        out.append(f'<div class="lbl">Whole card</div><div>{_img(fa.get("web"), fa.get("full"))}</div>'
                   f'<div>{_img(fb.get("web"), fb.get("full"))}</div>')
        for k in CORNERS:
            out.append(f'<div class="lbl">{CORNER_LABEL[k]}</div>'
                       f'<div>{_img(fa.get("corners", {}).get(k))}</div>'
                       f'<div>{_img(fb.get("corners", {}).get(k))}</div>')
        for k in EDGES:
            out.append(f'<div class="lbl">{EDGE_LABEL[k]}</div>'
                       f'<div>{_img(fa.get("edges", {}).get(k))}</div>'
                       f'<div>{_img(fb.get("edges", {}).get(k))}</div>')
        out.append("</div></div>")
    return "".join(out)


def _page(title, body):
    return (f'<!doctype html><html lang="en"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{esc(title)}</title><style>{CSS}</style></head>'
            f'<body><div class="wrap">{body}</div>{LIGHTBOX}</body></html>')


def build_report(card):
    name = card["card_name"] or f"Card #{card['card_number']}"
    keys = card["stage_keys"]
    head = [
        '<header><div class="brand">Restored Rarity · Card detail report</div>',
        f'<h1>{esc(name)}</h1><div class="meta">',
        f'<span>Submission <b>{esc(str(card["submission_id"]))}</b></span>',
        f'<span>Card <b>#{esc(str(card["card_number"]))}</b></span>',
    ]
    if card["customer"]:
        head.append(f'<span>Customer <b>{esc(card["customer"])}</b></span>')
    head.append(f'<span>Last scanned <b>{esc(card["latest"].replace("T", " "))}</b></span></div>')
    if card["notes"]:
        head.append(f'<div class="notes">{esc(card["notes"])}</div>')
    head.append('<nav class="toc">')
    head += [f'<a href="#{k}">{esc(STAGE_LABEL.get(k, k))}</a>' for k in keys]
    cmp_pair = None
    if "before" in keys and len(keys) > 1:
        cmp_pair = ("before", keys[-1])
        head.append('<a href="#compare">Before / after</a>')
    head.append("</nav></header>")

    body = ["".join(head)]
    for k in keys:
        sides = card["stages"][k]
        body.append(f'<h2 id="{esc(k)}">{esc(STAGE_LABEL.get(k, k))}</h2>')
        notes = next((sides[s].get("notes") for s in ("front", "back") if sides.get(s, {}).get("notes")), "")
        if notes:
            body.append(f'<p class="sub">Notes: {esc(notes)}</p>')
        body.append('<div class="sides">')
        body += [_side_panel(sides[s]) for s in ("front", "back") if s in sides]
        body.append("</div>")
    if cmp_pair:
        body.append(_compare(card, *cmp_pair))
    gen = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    body.append(f'<footer>Generated {gen} by the Restored Rarity Card Intake Scanner. '
                'Close-ups are cut from the straightened scan; the back is shown as scanned, '
                'so its left edge is the front\'s right edge. <a href="../../index.html">All cards</a></footer>')
    cdata = {f"{k}|{side}": {"web": rec.get("files", {}).get("web"), "centering": rec.get("files", {}).get("centering")}
             for k in keys for side, rec in card["stages"][k].items()
             if (rec.get("files", {}).get("centering") or {}).get("lines")}
    body.append('<script src="../../_assets/centering.js"></script><script>(function(){var D='
                + json.dumps(cdata).replace("</", "<\\/") + ';document.addEventListener("click",function(e){'
                'var b=e.target.closest("[data-center]");if(!b||!window.RRCentering)return;var d=D[b.dataset.center];'
                'if(!d)return;var p=b.dataset.center.split("|");RRCentering.open({imageUrl:d.web,centering:d.centering,'
                'title:' + json.dumps(name) + '+" · "+(p[1]=="front"?"Front":"Back")+" · "+p[0],editable:false});});})();</script>')
    card["report"].write_text(_page(f"{name} — Restored Rarity", "".join(body)), encoding="utf-8")
    return card["report"]


def build_index(out_dir, cards=None):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cards = load_cards(out_dir) if cards is None else cards
    src = Path(__file__).resolve().parent / "assets" / "centering.js"
    if src.exists():
        (out_dir / "_assets").mkdir(exist_ok=True)
        (out_dir / "_assets" / "centering.js").write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    tiles = []
    for c in cards:
        rel_dir = c["dir"].relative_to(out_dir).as_posix()
        latest = c["stages"][c["stage_keys"][-1]]
        rec = latest.get("front") or latest.get("back")
        thumb = rec.get("files", {}).get("thumb") if rec else None
        name = c["card_name"] or f"Card #{c['card_number']}"
        search = " ".join(str(x) for x in (c["submission_id"], c["customer"], name, c["card_number"],
                                           " ".join(c["stage_keys"]))).lower()
        badges = "".join(f'<span class="badge {esc(k)}">{esc(STAGE_LABEL.get(k, k))}</span>'
                         for k in c["stage_keys"])
        img = f'<img src="{esc(rel_dir)}/{esc(thumb)}" alt="" loading="lazy">' if thumb else ""
        tiles.append(
            f'<a class="tile" href="{esc(rel_dir)}/report.html" data-s="{esc(search)}">{img}'
            f'<div class="n">{esc(name)}</div>'
            f'<div class="s">{esc(str(c["submission_id"]))} · #{esc(str(c["card_number"]))}'
            f'{" · " + esc(c["customer"]) if c["customer"] else ""}</div>{badges}</a>')
    body = (
        '<header><div class="brand">Restored Rarity</div><h1>Card library</h1>'
        f'<div class="meta"><span><b>{len(cards)}</b> cards</span></div></header>'
        '<input class="search" id="q" placeholder="Search submission ID, customer, card name…" autofocus>'
        f'<div class="grid" id="g">{"".join(tiles) or "<p class=sub>No scans yet.</p>"}</div>'
        '<script>document.getElementById("q").addEventListener("input",function(){'
        'var q=this.value.toLowerCase().trim().split(/\\s+/);'
        'document.querySelectorAll(".tile").forEach(function(t){var s=t.dataset.s;'
        't.style.display=q.every(function(w){return s.indexOf(w)>=0})?"":"none";});});</script>'
    )
    path = out_dir / "index.html"
    path.write_text(_page("Card library — Restored Rarity", body), encoding="utf-8")
    return path


if __name__ == "__main__":
    import sys
    target = sys.argv[1] if len(sys.argv) > 1 else json.loads(
        (Path(__file__).parent / "config.json").read_text())["output_dir"]
    print(f"Rebuilt {len(rebuild(target))} card reports in {target}")
