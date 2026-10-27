/* Restored Rarity — centering tool.
 *
 * Plain script (no modules) so it works in the online portal and in the
 * report.html files opened straight from the scanning PC.
 *
 *   RRCentering.open({ imageUrl, centering, title, editable, onSave })
 *   RRCentering.summary(centering)     -> { left_in, right_in, top_in, bottom_in, lr:[a,b], tb:[a,b], widths_in, check }
 *   RRCentering.badge(centering)       -> short HTML like "L/R 55/45 · T/B 52/48"
 *
 * centering = { w_in, h_in, lines: { "top@left": {axis:"y", pos, outer, inner, found}, ... } }
 * All positions are fractions of the image width/height, so any scaled copy works.
 */
(function () {
  "use strict";
  var ORDER = ["top@left", "top@right", "bottom@left", "bottom@right",
               "left@top", "left@bottom", "right@top", "right@bottom"];
  var NICE = {
    "top@left": "Top · near left corner", "top@right": "Top · near right corner",
    "bottom@left": "Bottom · near left corner", "bottom@right": "Bottom · near right corner",
    "left@top": "Left · near top corner", "left@bottom": "Left · near bottom corner",
    "right@top": "Right · near top corner", "right@bottom": "Right · near bottom corner"
  };
  var GOLD = "#f5b301", CYAN = "#2ad4e6", RED = "#ff7a7a";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var r1 = function (x) { return Math.round(x * 10) / 10; };

  function summary(c) {
    if (!c || !c.lines) return null;
    var size = { y: c.h_in, x: c.w_in }, w = {};
    ORDER.forEach(function (k) { var l = c.lines[k]; if (l) w[k] = Math.abs(l.inner - l.outer) * size[l.axis]; });
    function avg(side) {
      var a = ORDER.filter(function (k) { return k.indexOf(side + "@") === 0 && w[k] != null; }).map(function (k) { return w[k]; });
      return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : 0;
    }
    var L = avg("left"), R = avg("right"), T = avg("top"), B = avg("bottom");
    var lr = L + R ? r1(100 * L / (L + R)) : null, tb = T + B ? r1(100 * T / (T + B)) : null;
    var check = ["top", "bottom", "left", "right"].filter(function (s) {
      var pair = (s === "top" || s === "bottom") ? [s + "@left", s + "@right"] : [s + "@top", s + "@bottom"];
      return w[pair[0]] != null && w[pair[1]] != null && Math.abs(w[pair[0]] - w[pair[1]]) > 0.025;
    });
    return { widths_in: w, left_in: L, right_in: R, top_in: T, bottom_in: B,
             lr: lr == null ? null : [lr, r1(100 - lr)], tb: tb == null ? null : [tb, r1(100 - tb)], check: check };
  }

  function fmtPair(p) { if (!p) return "—"; var a = Math.round(p[0]); return a + "/" + (100 - a); }

  function badge(c, showWarn) {
    var s = summary(c);
    if (!s) return "";
    if (showWarn === undefined) showWarn = !window.RR_CUSTOMER_VIEW;
    var unsure = showWarn && ORDER.some(function (k) { return c.lines[k] && c.lines[k].found === false; }) || s.check.length;
    return '<span class="rrc-badge">L/R <b>' + fmtPair(s.lr) + "</b> · T/B <b>" + fmtPair(s.tb) + "</b>" +
      (c.auto === false ? ' <span class="rrc-ok">✓ checked</span>' : unsure ? ' <span class="rrc-warn">⚠ check</span>' : "") +
      "</span>";
  }

  // ------------------------------------------------------------- styles
  var CSS = [
    ".rrc{position:fixed;inset:0;z-index:50;background:#070b14;color:#e8eef7;display:flex;flex-direction:column;",
    "font:14px/1.45 'Segoe UI',system-ui,-apple-system,sans-serif}",
    ".rrc-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid #24314d;background:#0f1626}",
    ".rrc-bar .t{font-weight:600;margin-right:auto;color:#f5b301}",
    ".rrc button{font:inherit;color:#e8eef7;background:#1d2942;border:1px solid #24314d;border-radius:8px;padding:6px 12px;cursor:pointer}",
    ".rrc button:hover{background:#26365a}.rrc button.g{background:#f5b301;border-color:#f5b301;color:#111;font-weight:600}",
    ".rrc button[disabled]{opacity:.5;cursor:default}",
    ".rrc-main{flex:1;display:flex;min-height:0}",
    ".rrc-stage{flex:1;position:relative;min-width:0;touch-action:none;cursor:grab;background:#05080f}",
    ".rrc-stage.drag{cursor:grabbing}.rrc-stage canvas{position:absolute;inset:0;width:100%;height:100%}",
    ".rrc-side{width:330px;overflow:auto;border-left:1px solid #24314d;padding:14px;background:#0b1220}",
    "@media(max-width:820px){.rrc-main{flex-direction:column}.rrc-side{width:auto;max-height:42vh;border-left:0;border-top:1px solid #24314d}}",
    ".rrc-big{display:flex;gap:10px;margin-bottom:10px}.rrc-big div{flex:1;background:#141d30;border:1px solid #24314d;border-radius:10px;padding:10px;text-align:center}",
    ".rrc-big small{display:block;color:#8b97ad;font-size:11px;text-transform:uppercase;letter-spacing:.06em}",
    ".rrc-big b{font-size:24px;color:#f5b301}",
    ".rrc table{width:100%;border-collapse:collapse;font-size:13px}",
    ".rrc td{padding:6px 4px;border-bottom:1px solid #1b2640}.rrc tr{cursor:pointer}.rrc tr:hover td,.rrc tr.on td{background:#18233a}",
    ".rrc td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}",
    ".rrc .grp td{color:#8b97ad;font-size:11px;text-transform:uppercase;letter-spacing:.06em;cursor:default;background:none!important;padding-top:12px}",
    ".rrc .help{color:#8b97ad;font-size:12px;margin:10px 0 0}",
    ".rrc .zoomlbl{position:absolute;left:10px;bottom:10px;background:rgba(0,0,0,.6);padding:3px 8px;border-radius:6px;font-size:12px;color:#8b97ad;pointer-events:none}",
    ".rrc-badge{font-size:13px;color:#8b97ad}.rrc-badge b{color:#e8eef7}.rrc-warn{color:#ffb347}.rrc-ok{color:#4ade80}"
  ].join("");
  function injectCss() {
    if (document.getElementById("rrc-css")) return;
    var st = document.createElement("style"); st.id = "rrc-css"; st.textContent = CSS; document.head.appendChild(st);
  }
  injectCss();

  // --------------------------------------------------------------- tool
  function open(opts) {
    injectCss();
    var orig = clone(opts.centering), c = clone(opts.centering), editable = !!opts.editable;
    var dirty = false, active = null;
    var root = document.createElement("div");
    root.className = "rrc";
    root.innerHTML =
      '<div class="rrc-bar"><span class="t">📐 ' + esc(opts.title || "Centering") + "</span>" +
      '<button data-a="out" title="Zoom out">−</button><button data-a="fit">Fit</button><button data-a="in" title="Zoom in">+</button>' +
      (editable ? '<button data-a="reset">Reset to auto</button><button data-a="save" class="g" disabled>Save</button>' : "") +
      '<button data-a="close">Close ✕</button></div>' +
      '<div class="rrc-main"><div class="rrc-stage"><canvas></canvas><div class="zoomlbl"></div></div>' +
      '<div class="rrc-side"></div></div>';
    document.body.appendChild(root);
    document.documentElement.style.overflow = "hidden";
    var stage = root.querySelector(".rrc-stage"), cv = stage.querySelector("canvas"), ctx = cv.getContext("2d");
    var side = root.querySelector(".rrc-side"), zl = root.querySelector(".zoomlbl");
    var img = new Image(), iw = 1, ih = 1, s = 1, tx = 0, ty = 0, dpr = window.devicePixelRatio || 1;

    function resize() {
      var r = stage.getBoundingClientRect();
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      draw();
    }
    function fit() {
      var r = stage.getBoundingClientRect();
      s = Math.min(r.width / iw, r.height / ih) * 0.94;
      tx = (r.width - iw * s) / 2; ty = (r.height - ih * s) / 2; draw();
    }
    function zoomAt(f, sx, sy) {
      var ns = Math.max(0.05, Math.min(60, s * f));
      tx = sx - (sx - tx) * ns / s; ty = sy - (sy - ty) * ns / s; s = ns; draw();
    }
    function lineGeom(l) { // in image pixels
      if (l.axis === "y") return { x1: l.pos * iw, y1: l.outer * ih, x2: l.pos * iw, y2: l.inner * ih };
      return { x1: l.outer * iw, y1: l.pos * ih, x2: l.inner * iw, y2: l.pos * ih };
    }
    function toScreen(x, y) { return [x * s + tx, y * s + ty]; }
    function widthIn(l) { return Math.abs(l.inner - l.outer) * (l.axis === "y" ? c.h_in : c.w_in); }

    function draw() {
      var W = cv.width, H = cv.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
      if (!img.complete || !img.naturalWidth) return;
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * tx, dpr * ty);
      ctx.imageSmoothingEnabled = s < 2.5;
      ctx.drawImage(img, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ORDER.forEach(function (k) {
        var l = c.lines[k]; if (!l) return;
        var g = lineGeom(l), a = toScreen(g.x1, g.y1), b = toScreen(g.x2, g.y2);
        var on = k === active, warn = editable && l.found === false;
        // ticks across the line at both ends show exactly where each edge was put
        var tick = Math.max(10, Math.min(60, 0.12 * s * (l.axis === "y" ? iw / c.w_in : ih / c.h_in)));
        ctx.lineWidth = on ? 2 : 1.4;
        [[a, GOLD], [b, CYAN]].forEach(function (pc) {
          ctx.strokeStyle = pc[1]; ctx.beginPath();
          if (l.axis === "y") { ctx.moveTo(pc[0][0] - tick, pc[0][1]); ctx.lineTo(pc[0][0] + tick, pc[0][1]); }
          else { ctx.moveTo(pc[0][0], pc[0][1] - tick); ctx.lineTo(pc[0][0], pc[0][1] + tick); }
          ctx.stroke();
        });
        ctx.strokeStyle = warn ? RED : (on ? "#fff" : "rgba(255,255,255,.75)");
        ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
        [[a, GOLD], [b, CYAN]].forEach(function (pc) {
          ctx.beginPath(); ctx.arc(pc[0][0], pc[0][1], on ? 6 : 4.5, 0, Math.PI * 2);
          ctx.fillStyle = pc[1]; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = "#000"; ctx.stroke();
        });
        if (s * Math.max(iw / c.w_in, 1) > 250 || on) { // label once zoomed in
          var mm = (widthIn(l) * 25.4).toFixed(2) + " mm", mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
          ctx.font = "12px Segoe UI, system-ui, sans-serif";
          var tw = ctx.measureText(mm).width + 10, ox = l.axis === "y" ? 14 : -tw / 2, oy = l.axis === "y" ? -9 : 16;
          ctx.fillStyle = "rgba(0,0,0,.72)"; ctx.fillRect(mx + ox, my + oy, tw, 18);
          ctx.fillStyle = warn ? RED : "#fff"; ctx.fillText(mm, mx + ox + 5, my + oy + 13);
        }
      });
      var ppi = s * iw / c.w_in;
      zl.textContent = "Zoom " + (s * 100 / (Math.min(stage.clientWidth / iw, stage.clientHeight / ih) || 1)).toFixed(0) +
        "% · " + Math.round(ppi) + " screen px per inch";
    }

    function renderSide() {
      var sm = summary(c);
      var rows = "", groups = [["Top border", "top"], ["Bottom border", "bottom"], ["Left border", "left"], ["Right border", "right"]];
      groups.forEach(function (gp) {
        rows += '<tr class="grp"><td colspan="3">' + gp[0] + (editable && sm.check.indexOf(gp[1]) >= 0 ? ' <span class="rrc-warn">⚠ the two don\'t match</span>' : "") + "</td></tr>";
        ORDER.filter(function (k) { return k.indexOf(gp[1] + "@") === 0; }).forEach(function (k) {
          var l = c.lines[k]; if (!l) return;
          var w = widthIn(l);
          rows += '<tr data-k="' + k + '" class="' + (k === active ? "on" : "") + '"><td>' +
            (editable && l.found === false ? '<span class="rrc-warn">⚠</span> ' : "") + esc(NICE[k].split(" · ")[1]) +
            '</td><td class="n">' + (w * 25.4).toFixed(2) + ' mm</td><td class="n">' + w.toFixed(3) + '"</td></tr>';
        });
      });
      side.innerHTML =
        '<div class="rrc-big"><div><small>Left / Right</small><b>' + fmtPair(sm.lr) + '</b></div>' +
        '<div><small>Top / Bottom</small><b>' + fmtPair(sm.tb) + "</b></div></div>" +
        '<div style="color:#8b97ad;font-size:12px;margin-bottom:6px">Average border: L ' + (sm.left_in * 25.4).toFixed(2) +
        " · R " + (sm.right_in * 25.4).toFixed(2) + " · T " + (sm.top_in * 25.4).toFixed(2) + " · B " +
        (sm.bottom_in * 25.4).toFixed(2) + " mm" + (dirty ? ' · <span class="rrc-warn">edited — not saved yet</span>' : c.auto === false ? ' · <span class="rrc-ok">checked by hand</span>' : " · auto-measured") + "</div>" +
        "<table>" + rows + "</table>" +
        '<p class="help">Each border is measured 0.5 in from each corner. Click a row to zoom to it. ' +
        (editable ? "Drag the <b style=\"color:" + GOLD + "\">gold</b> dot onto the card's outer edge and the <b style=\"color:" + CYAN +
          "\">blue</b> dot onto the inner edge of the border. Arrow keys nudge the selected line one pixel (Shift = 5). "
          : "Gold = card edge, blue = inner edge of the border. ") +
        "Scroll or pinch to zoom, drag to move around.</p>";
      side.querySelectorAll("tr[data-k]").forEach(function (tr) {
        tr.onclick = function () { focusLine(tr.getAttribute("data-k")); };
      });
    }

    function focusLine(k) {
      active = k;
      var l = c.lines[k], g = lineGeom(l), r = stage.getBoundingClientRect();
      var ppiTarget = 900; // screen px per inch: border becomes easy to place
      s = ppiTarget / (iw / c.w_in);
      tx = r.width / 2 - (g.x1 + g.x2) / 2 * s; ty = r.height / 2 - (g.y1 + g.y2) / 2 * s;
      renderSide(); draw();
    }

    function changed() {
      dirty = JSON.stringify(c.lines) !== JSON.stringify(orig.lines);
      var sv = root.querySelector('[data-a="save"]'); if (sv) sv.disabled = !dirty;
      renderSide(); draw();
    }

    // ------------------------------------------------------ pointer input
    var pointers = {}, drag = null, pinch = null;
    function local(e) { var r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    function hit(sx, sy, radius) {
      var best = null, bd = radius || 14; // fingertips need a bigger target than a mouse
      ORDER.forEach(function (k) {
        var l = c.lines[k]; if (!l) return;
        var g = lineGeom(l);
        [["outer", g.x1, g.y1], ["inner", g.x2, g.y2]].forEach(function (h) {
          var p = toScreen(h[1], h[2]), d = Math.hypot(p[0] - sx, p[1] - sy);
          if (d < bd) { bd = d; best = { k: k, end: h[0] }; }
        });
      });
      return best;
    }
    stage.addEventListener("pointerdown", function (e) {
      stage.setPointerCapture(e.pointerId);
      var p = local(e); pointers[e.pointerId] = p;
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: s, cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2 };
        drag = null; return;
      }
      var h = editable ? hit(p[0], p[1], e.pointerType === "touch" ? 28 : 14) : null;
      if (h) { active = h.k; drag = { type: "handle", k: h.k, end: h.end }; renderSide(); }
      else { drag = { type: "pan", x: p[0], y: p[1], tx: tx, ty: ty }; stage.classList.add("drag"); }
    });
    stage.addEventListener("pointermove", function (e) {
      var p = local(e);
      if (pointers[e.pointerId]) pointers[e.pointerId] = p;
      if (pinch) {
        var ids = Object.keys(pointers); if (ids.length < 2) return;
        var a = pointers[ids[0]], b = pointers[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        zoomAt((pinch.s * d / pinch.d) / s, pinch.cx, pinch.cy); return;
      }
      if (!drag) {
        stage.style.cursor = editable && hit(p[0], p[1]) ? "pointer" : "";
        return;
      }
      if (drag.type === "pan") { tx = drag.tx + p[0] - drag.x; ty = drag.ty + p[1] - drag.y; draw(); return; }
      var l = c.lines[drag.k], ix = (p[0] - tx) / s, iy = (p[1] - ty) / s;
      var v = l.axis === "y" ? iy / ih : ix / iw;
      l[drag.end] = Math.max(0, Math.min(1, Math.round(v * 1e5) / 1e5));
      if (drag.end === "inner") l.found = true;
      changed();
    });
    function up(e) {
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) pinch = null;
      drag = null; stage.classList.remove("drag");
    }
    stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
    stage.addEventListener("wheel", function (e) {
      e.preventDefault(); var p = local(e); zoomAt(Math.exp(-e.deltaY * 0.0015), p[0], p[1]);
    }, { passive: false });
    stage.addEventListener("dblclick", function (e) { var p = local(e); zoomAt(2, p[0], p[1]); });

    function key(e) {
      if (e.key === "Escape") return close();
      if (!editable || !active) return;
      var l = c.lines[active], step = (e.shiftKey ? 5 : 1) / (l.axis === "y" ? ih : iw);
      var map = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 };
      if (!(e.key in map)) return;
      var vertical = e.key === "ArrowUp" || e.key === "ArrowDown";
      if ((l.axis === "y") !== vertical) return;
      e.preventDefault();
      var end = e.altKey ? "outer" : "inner"; // Alt moves the gold (outer) dot
      l[end] = Math.max(0, Math.min(1, l[end] + map[e.key] * step));
      changed();
    }
    document.addEventListener("keydown", key);

    function close() {
      if (dirty && editable && !confirm("Close without saving your changes?")) return;
      document.removeEventListener("keydown", key); window.removeEventListener("resize", resize);
      document.documentElement.style.overflow = ""; root.remove();
      if (opts.onClose) opts.onClose();
    }
    root.querySelector(".rrc-bar").addEventListener("click", function (e) {
      var a = e.target.getAttribute && e.target.getAttribute("data-a"); if (!a) return;
      var r = stage.getBoundingClientRect();
      if (a === "in") zoomAt(1.6, r.width / 2, r.height / 2);
      if (a === "out") zoomAt(1 / 1.6, r.width / 2, r.height / 2);
      if (a === "fit") { active = null; fit(); renderSide(); }
      if (a === "close") close();
      if (a === "reset") {
        var auto = opts.autoCentering || orig;
        if (!confirm("Put every marker back where the scanner measured it?")) return;
        c = clone(auto); c.auto = true; changed();
      }
      if (a === "save") {
        var btn = e.target; btn.disabled = true; btn.textContent = "Saving…";
        var out = clone(c);
        out.auto = JSON.stringify(out.lines) === JSON.stringify((opts.autoCentering || {}).lines) ? true : false;
        out.edited_at = new Date().toISOString();
        out.summary = summary(out);
        Promise.resolve(opts.onSave && opts.onSave(out)).then(function () {
          orig = clone(c); dirty = false; btn.textContent = "Saved ✓";
          setTimeout(function () { btn.textContent = "Save"; }, 1500);
        }, function (err) { alert("Couldn't save: " + (err && err.message || err)); btn.disabled = false; btn.textContent = "Save"; });
      }
    });

    window.addEventListener("resize", resize);
    img.onload = function () { iw = img.naturalWidth; ih = img.naturalHeight; resize(); fit(); renderSide(); };
    img.onerror = function () { side.innerHTML = '<p class="rrc-warn">Couldn\'t load the image.</p>'; };
    img.src = opts.imageUrl;
    renderSide();
    return { close: close };
  }

  window.RRCentering = { open: open, summary: summary, badge: badge, ORDER: ORDER, NICE: NICE };
})();
