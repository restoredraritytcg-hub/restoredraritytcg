// Interactive multipoint centering editor.
// Shows the straightened card with 8 lines: gold = the card's cut edge, cyan = the inner edge of the border.
// Each line has two handles (drag one to tilt the line, drag the line itself to slide it), plus the auto-detected
// sample points. Zoom with the wheel / pinch / buttons, pan by dragging empty space. A loupe shows the spot
// under your finger while dragging. Arrow keys nudge the selected handle (Shift = 5 px).
//
//   const ed = createEditor(el, { image, model, onChange(model) });
//   ed.setModel(m); ed.nudge(±1); ed.next(); ed.fit(); ed.zoom(f); ed.showSamples(bool); ed.destroy();
import { SIDES } from "./multipoint.js";

const GOLD = "#f5b301", CYAN = "#2ad4e6", RED = "#ff5a5a";
const HANDLE_R = 9, HIT_R = 26, LINE_HIT = 14;
const VERT = { left: true, right: true, top: false, bottom: false };

export function createEditor(root, { image, model, onChange }) {
  root.classList.add("ed");
  root.innerHTML = `<canvas class="ed-cv" tabindex="0" aria-label="Centering editor: drag the lines to the card's edges"></canvas>
    <div class="ed-zoom"><button type="button" data-z="in" aria-label="Zoom in">+</button>
      <button type="button" data-z="out" aria-label="Zoom out">−</button><button type="button" data-z="fit">Fit</button></div>`;
  const cv = root.querySelector("canvas"), ctx = cv.getContext("2d");
  let m = model, samples = true, sel = null, drag = null, view = { s: 1, tx: 0, ty: 0 }, fitView = null;
  const pointers = new Map();
  let pinch = null, raf = 0;

  // ---------------------------------------------------------- geometry
  const handles = () => {
    const out = [];
    for (const side of SIDES) for (const kind of ["outer", "inner"]) for (const i of [0, 1]) out.push({ side, kind, i });
    return out;
  };
  const ALL = handles();
  const pt = (side, t, v) => (VERT[side] ? [v, t] : [t, v]);            // image px
  const handlePos = (h) => { const S = m.sides[h.side]; return pt(h.side, S.t[h.i], S[h.kind][h.i]); };
  const lineEnds = (side, kind) => {
    const S = m.sides[side], len = VERT[side] ? m.h : m.w;
    const f = (t) => S[kind][0] + (S[kind][1] - S[kind][0]) * (t - S.t[0]) / (S.t[1] - S.t[0]);
    const a = m.padPx * 0.5, b = len - m.padPx * 0.5;
    return [pt(side, a, f(a)), pt(side, b, f(b))];
  };
  const toScreen = ([x, y]) => [x * view.s + view.tx, y * view.s + view.ty];
  const toImage = ([X, Y]) => [(X - view.tx) / view.s, (Y - view.ty) / view.s];

  // ------------------------------------------------------------ sizing
  const dpr = () => window.devicePixelRatio || 1;
  function resize() {
    const w = root.clientWidth, h = Math.max(260, Math.min(window.innerHeight * 0.78, w * (m.h / m.w)));
    cv.style.height = h + "px";
    cv.width = Math.round(w * dpr()); cv.height = Math.round(h * dpr());
    const s = Math.min(w / m.w, h / m.h);
    fitView = { s, tx: (w - m.w * s) / 2, ty: (h - m.h * s) / 2 };
    if (!view.fitted) view = { ...fitView, fitted: true };
    draw();
  }
  const ro = new ResizeObserver(() => { view.fitted = false; resize(); });
  ro.observe(root);

  // ------------------------------------------------------------ drawing
  function draw() { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); }
  function paint() {
    const k = dpr(), W = cv.width / k, H = cv.height / k;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = "#0b111c"; ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = view.s < 3; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, view.tx, view.ty, m.w * view.s, m.h * view.s);
    drawOverlay(ctx, (p) => toScreen(p), 1);
    if (drag?.type === "handle" || (sel && drag?.type === "nudge")) loupe(W, H);
  }
  function drawOverlay(c, map, scale) {
    if (samples) for (const side of SIDES) for (const s of m.sides[side].samples || []) {
      const o = map(pt(side, s.t, s.outer)), i = map(pt(side, s.t, s.inner));
      dot(c, o, 2.5 * scale, s.outerUsed ? GOLD : RED, s.outerUsed);
      if (s.found || s.glare) dot(c, i, 2.5 * scale, s.innerUsed ? CYAN : RED, s.innerUsed);
    }
    for (const side of SIDES) for (const kind of ["outer", "inner"]) {
      const [a, b] = lineEnds(side, kind).map(map);
      c.strokeStyle = kind === "outer" ? GOLD : CYAN; c.lineWidth = 1.6 * scale;
      c.setLineDash(m.sides[side].found === false && kind === "inner" ? [6 * scale, 5 * scale] : []);
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    }
    c.setLineDash([]);
    for (const h of ALL) {
      const [x, y] = map(handlePos(h)), on = sel && same(sel, h);
      c.beginPath(); c.arc(x, y, (on ? HANDLE_R + 3 : HANDLE_R) * scale, 0, 7);
      c.fillStyle = h.kind === "outer" ? "rgba(245,179,1,.35)" : "rgba(42,212,230,.35)"; c.fill();
      c.lineWidth = (on ? 3 : 2) * scale; c.strokeStyle = on ? "#fff" : h.kind === "outer" ? GOLD : CYAN; c.stroke();
      c.beginPath(); c.arc(x, y, 1.6 * scale, 0, 7); c.fillStyle = "#fff"; c.fill();
    }
  }
  function dot(c, [x, y], r, color, filled) {
    c.beginPath(); c.arc(x, y, r, 0, 7);
    if (filled) { c.fillStyle = color; c.fill(); } else { c.strokeStyle = color; c.lineWidth = 1.2; c.stroke(); }
  }
  function loupe(W, H) {
    const h = sel; if (!h) return;
    const [ix, iy] = handlePos(h), R = Math.min(78, W * 0.2), z = Math.max(view.s * 4, 3);
    const [sx] = toScreen([ix, iy]);
    const cx = sx < W / 2 ? W - R - 10 : R + 10, cy = R + 10;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
    ctx.fillStyle = "#000"; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    ctx.imageSmoothingEnabled = false;
    const map = ([x, y]) => [cx + (x - ix) * z, cy + (y - iy) * z];
    const [x0, y0] = map([0, 0]); ctx.drawImage(image, x0, y0, m.w * z, m.h * z);
    drawOverlay(ctx, map, 1);
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke();
  }

  // ------------------------------------------------------------ hit test
  const same = (a, b) => a.side === b.side && a.kind === b.kind && a.i === b.i;
  function hit(X, Y) {
    let best = null, bd = HIT_R;
    for (const h of ALL) { const [x, y] = toScreen(handlePos(h)), d = Math.hypot(x - X, y - Y); if (d < bd) { bd = d; best = h; } }
    if (best) return { type: "handle", h: best };
    let line = null, ld = LINE_HIT;
    for (const side of SIDES) for (const kind of ["outer", "inner"]) {
      const [a, b] = lineEnds(side, kind).map(toScreen), d = segDist([X, Y], a, b);
      if (d < ld) { ld = d; line = { side, kind }; }
    }
    return line ? { type: "line", ...line } : null;
  }
  const segDist = ([x, y], [x1, y1], [x2, y2]) => {
    const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / L)) : 0;
    return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
  };

  // ------------------------------------------------------------ input
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function changed(side) {
    const S = m.sides[side]; S.manual = true; S.se = null; S.found = true; m.auto = false;
    onChange?.(m); draw();
  }
  cv.addEventListener("pointerdown", (e) => {
    cv.focus({ preventScroll: true });
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), view: { ...view }, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
      drag = null; return;
    }
    const p = local(e), h = hit(p[0], p[1]);
    if (h?.type === "handle") { sel = h.h; drag = { type: "handle", start: p, v0: m.sides[sel.side][sel.kind][sel.i] }; }
    else if (h?.type === "line") { sel = { side: h.side, kind: h.kind, i: 0 };
      drag = { type: "line", side: h.side, kind: h.kind, start: p, v0: m.sides[h.side][h.kind].slice() }; }
    else drag = { type: "pan", start: p, tx: view.tx, ty: view.ty };
    draw();
  });
  cv.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, local(e));
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      zoomAt(pinch.mid, (pinch.view.s * d / pinch.d) / view.s); return;
    }
    if (!drag) return;
    const p = local(e), dx = p[0] - drag.start[0], dy = p[1] - drag.start[1];
    if (drag.type === "pan") { view.tx = drag.tx + dx; view.ty = drag.ty + dy; view.fitted = false; draw(); return; }
    const side = drag.type === "handle" ? sel.side : drag.side, dv = (VERT[side] ? dx : dy) / view.s;
    if (drag.type === "handle") m.sides[side][sel.kind][sel.i] = drag.v0 + dv;
    else m.sides[side][drag.kind] = drag.v0.map((v) => v + dv);
    changed(side);
  });
  const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; drag = null; draw(); };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(local(e), Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  cv.addEventListener("dblclick", (e) => zoomAt(local(e), 2));
  cv.addEventListener("keydown", (e) => {
    const dirs = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
    if (e.key in dirs && sel) { e.preventDefault(); nudge(dirs[e.key] * (e.shiftKey ? 5 : 1)); }
    else if (e.key === "Tab" && sel) { e.preventDefault(); next(e.shiftKey ? -1 : 1); }
  });
  root.querySelector(".ed-zoom").addEventListener("click", (e) => {
    const z = e.target.closest("[data-z]")?.dataset.z; if (!z) return;
    if (z === "fit") fit(); else zoomAt([cv.clientWidth / 2, cv.clientHeight / 2], z === "in" ? 1.6 : 1 / 1.6);
  });

  function zoomAt([X, Y], f) {
    const s = Math.max(fitView.s * 0.8, Math.min(fitView.s * 40, view.s * f)), r = s / view.s;
    view = { s, tx: X - (X - view.tx) * r, ty: Y - (Y - view.ty) * r, fitted: false }; draw();
  }
  function fit() { view = { ...fitView, fitted: true }; draw(); }
  function nudge(px) {
    if (!sel) sel = ALL[0];
    m.sides[sel.side][sel.kind][sel.i] += px * Math.max(0.25, 1 / Math.max(1, view.s));
    drag = { type: "nudge" }; changed(sel.side);
    clearTimeout(nudge.t); nudge.t = setTimeout(() => { if (drag?.type === "nudge") drag = null; draw(); }, 900);
  }
  function next(step = 1) {
    const i = sel ? ALL.findIndex((h) => same(h, sel)) : -1;
    sel = ALL[(i + step + ALL.length) % ALL.length];
    // bring the handle into view when zoomed in
    const [x, y] = toScreen(handlePos(sel)), W = cv.clientWidth, H = cv.clientHeight;
    if (x < 0 || y < 0 || x > W || y > H) { view.tx += W / 2 - x; view.ty += H / 2 - y; view.fitted = false; }
    drag = { type: "nudge" }; draw();
    clearTimeout(nudge.t); nudge.t = setTimeout(() => { drag = null; draw(); }, 900);
  }
  const label = () => sel && `${sel.side} border · ${sel.kind === "outer" ? "card edge (gold)" : "inner edge (cyan)"} · ${
    VERT[sel.side] ? (sel.i ? "lower" : "upper") : (sel.i ? "right" : "left")} point`;

  resize();
  return {
    setModel(mm) { m = mm; view.fitted = false; resize(); },
    showSamples(v) { samples = v; draw(); },
    nudge, next, fit, zoom: (f) => zoomAt([cv.clientWidth / 2, cv.clientHeight / 2], f), label,
    selected: () => sel,
    destroy() { ro.disconnect(); cancelAnimationFrame(raf); root.innerHTML = ""; },
  };
}
