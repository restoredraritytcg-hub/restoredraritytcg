// Multipoint centering + tilt ("cant") for a straightened card picture.
//
// The picture comes from photo.js / scanproc.js: the card is an upright 2.5 × 3.5 in rectangle at `dpi`, with
// CROP_PAD_IN of background all round. Along each border we measure many points (not just the 2 per side of the
// standard tool), fit a straight line through the card's outer edge and one through the inner edge of the border,
// then compare the two:
//   centering = border widths (left vs right, top vs bottom), taken from the fitted lines
//   tilt      = how far the printed frame is turned relative to the card's cut edges (degrees)
//
// Model (what the editor moves): for each side, two positions along the side (`t`, px) and, at each, where the
// outer edge and the inner edge are (px across). Left/right lines are x = f(y); top/bottom lines are y = f(x).
//   { dpi, w, h, sides: { left: { t:[t1,t2], outer:[a1,a2], inner:[b1,b2], found, samples:[...] }, ... } }
import * as P from "./shared/scanproc.js";

export const SIDES = ["top", "right", "bottom", "left"];
const VERTICAL = { left: true, right: true, top: false, bottom: false };
const INWARD = { left: 1, top: 1, right: -1, bottom: -1 };   // +1: inner edge has the larger coordinate
const MARGIN_IN = 0.3;          // keep away from the rounded corners
const SEARCH_IN = 0.75, DEFAULT_IN = 0.125;
const HANDLE_AT = [0.15, 0.85]; // handle positions along each side (fraction of the card's side)

// ------------------------------------------------------------ colour helpers
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
const f3 = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
function lab(r, g, b, out, o) {        // same scaling as scanproc.js (OpenCV 8-bit Lab)
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const X = (0.412453 * R + 0.357580 * G + 0.180423 * B) / 0.950456;
  const Y = 0.212671 * R + 0.715160 * G + 0.072169 * B;
  const Z = (0.019334 * R + 0.119193 * G + 0.950227 * B) / 1.088754;
  const fy = f3(Y);
  out[o] = (Y > 0.008856 ? 116 * fy - 16 : 903.3 * Y) * 255 / 100;
  out[o + 1] = 500 * (f3(X) - fy) + 128;
  out[o + 2] = 200 * (fy - f3(Z)) + 128;
}
const median = (a) => { const s = Float64Array.from(a).sort(); return s.length ? s[s.length >> 1] : 0; };

// Mean Lab across a short band, sampled along a line running inward from the border.
// vertical side (left/right): the band is a row at y=pos, the profile runs along x.
function profile(img, vertical, pos, hw) {
  const { width: w, height: h, data } = img, len = vertical ? w : h, across = vertical ? h : w;
  const a0 = Math.max(0, Math.round(pos - hw)), a1 = Math.min(across - 1, Math.round(pos + hw)), n = a1 - a0 + 1;
  const out = new Float32Array(len * 3), tmp = new Float32Array(3);
  for (let i = 0; i < len; i++) {
    let L = 0, A = 0, B = 0;
    for (let a = a0; a <= a1; a++) {
      const j = vertical ? (a * w + i) * 4 : (i * w + a) * 4;
      lab(data[j], data[j + 1], data[j + 2], tmp, 0); L += tmp[0]; A += tmp[1]; B += tmp[2];
    }
    out[i * 3] = L / n; out[i * 3 + 1] = A / n; out[i * 3 + 2] = B / n;
  }
  const sm = new Float32Array(out.length);
  for (let i = 0; i < len; i++) for (let c = 0; c < 3; c++) {
    const p = Math.max(0, i - 1), q = Math.min(len - 1, i + 1);
    sm[i * 3 + c] = 0.25 * out[p * 3 + c] + 0.5 * out[i * 3 + c] + 0.25 * out[q * 3 + c];
  }
  return { seq: sm, len };
}

// Outer edge = strongest colour change near where the card should start; inner edge = first place, moving
// inward, where the colour leaves the border's own colour for good. Same rules as scanproc.js detectLine,
// with sub-pixel refinement of both edges (needed: tilt is a fraction of a pixel per point).
function detect(prof, outerNom, dir, dpi) {
  const { seq, len } = prof;
  const back = Math.max(3, Math.round(0.04 * dpi)), fwd = Math.round(SEARCH_IN * dpi), n = back + fwd + 1;
  const arr = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const i = Math.min(len - 1, Math.max(0, outerNom + dir * (k - back)));
    arr[k * 3] = seq[i * 3]; arr[k * 3 + 1] = seq[i * 3 + 1]; arr[k * 3 + 2] = seq[i * 3 + 2];
  }
  const grad = new Float32Array(n);
  for (let k = 1; k < n - 1; k++) grad[k] = Math.hypot(arr[(k + 1) * 3] - arr[(k - 1) * 3],
    arr[(k + 1) * 3 + 1] - arr[(k - 1) * 3 + 1], arr[(k + 1) * 3 + 2] - arr[(k - 1) * 3 + 2]);
  const argmax = (a, b) => { let m = a; for (let k = a; k <= b; k++) if (grad[k] > grad[m]) m = k; return m; };
  const sub = (k) => {             // parabola through the gradient peak
    if (k <= 0 || k >= n - 1) return k;
    const a = grad[k - 1], b = grad[k], c = grad[k + 1], d = a - 2 * b + c;
    return d < 0 ? k + Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / d)) : k;
  };
  const outerK = argmax(1, Math.min(n - 2, 2 * back));
  const toPx = (k) => outerNom + dir * (k - back);
  const s = Math.max(2, Math.round(0.015 * dpi));
  const b0 = outerK + Math.max(2, Math.round(0.02 * dpi)), b1 = outerK + Math.max(4, Math.round(0.05 * dpi));
  const border = [0, 1, 2].map((c) => median(Array.from({ length: b1 - b0 }, (_, t) => arr[(b0 + t) * 3 + c])));
  const dist = new Float32Array(n);
  for (let k = 0; k < n; k++) dist[k] = Math.hypot(arr[k * 3] - border[0], arr[k * 3 + 1] - border[1], arr[k * 3 + 2] - border[2]);
  let mean = 0; for (let k = b0; k < b1; k++) mean += dist[k]; mean /= (b1 - b0);
  let v = 0; for (let k = b0; k < b1; k++) v += (dist[k] - mean) ** 2;
  const spread = Math.sqrt(v / (b1 - b0));
  const outer = toPx(sub(outerK));
  // colour just outside the card vs the border's colour: near-equal means the "border" is background seen through a holder
  const oe = Math.max(1, outerK - 2), outside = [0, 1, 2].map((c) => median(Array.from({ length: oe }, (_, t) => arr[t * 3 + c])));
  const bgDist = Math.hypot(outside[0] - border[0], outside[1] - border[1], outside[2] - border[2]);
  const miss = { outer, inner: outer + dir * DEFAULT_IN * dpi, found: false, bgDist };
  if (spread > 10) return miss;
  const thr = Math.max(22, 6 * spread);
  const start = outerK + Math.max(3, Math.round(0.035 * dpi));
  for (let k = start; k < n - s; k++) {
    let mn = Infinity; for (let t = k; t < k + s; t++) mn = Math.min(mn, dist[t]);
    if (mn > thr) {
      const w0 = Math.max(start - 1, k - s), w1 = Math.min(n - 2, k + Math.max(1, s >> 1));
      return { outer, inner: toPx(sub(argmax(w0, w1))), found: true, bgDist };
    }
  }
  return miss;
}

// Share of a sample's border band (outer edge → inner edge) that is blown-out white: glare from a sleeve,
// toploader or lamp. Pixels count only when they're brighter than the border's own colour can be.
const GLARE_SHARE = 0.18;
function glareShare(img, vertical, t, hw, from, to) {
  const { width: w, height: h, data } = img;
  const lo = Math.round(Math.min(from, to)), hi = Math.round(Math.max(from, to));
  let n = 0, hot = 0;
  for (let a = Math.round(t - hw); a <= Math.round(t + hw); a++) for (let k = lo; k <= hi; k++) {
    const x = vertical ? k : a, y = vertical ? a : k;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const j = (y * w + x) * 4, mn = Math.min(data[j], data[j + 1], data[j + 2]);
    n++; if (mn >= 246) hot++;
  }
  return n ? hot / n : 0;
}

// ---------------------------------------------------------------- line fits
// Least squares v = a + b·t, then drop points far from the line and refit (art touching the border,
// a nick in the edge, a speck of dust). Returns { a, b, used:[bool] } or null with < 3 points.
export function robustFit(pts, tolPx) {
  let used = pts.map(() => true);
  let fit = null;
  for (let iter = 0; iter < 4; iter++) {
    const sel = pts.filter((_, i) => used[i]);
    if (sel.length < 3) return fit && { ...fit, used };
    let st = 0, sv = 0; for (const [t, v] of sel) { st += t; sv += v; } st /= sel.length; sv /= sel.length;
    let num = 0, den = 0; for (const [t, v] of sel) { num += (t - st) * (v - sv); den += (t - st) ** 2; }
    const b = den ? num / den : 0, a = sv - b * st;
    fit = { a, b };
    const res = pts.map(([t, v]) => Math.abs(v - (a + b * t)));
    const mad = median(res.filter((_, i) => used[i])) * 1.4826;
    const lim = Math.max(tolPx, 3 * mad);
    const next = res.map((r) => r <= lim);
    if (next.every((x, i) => x === used[i])) break;
    used = next;
  }
  return { ...fit, used };
}

// --------------------------------------------------------------- auto measure
// img: ImageData of the straightened card picture; dpi of that picture; n: points per side.
export function autoMeasure(img, dpi, { n = 11, padIn = P.CROP_PAD_IN } = {}) {
  const { width: w, height: h } = img, p = Math.round(padIn * dpi);
  const x0 = p, y0 = p, x1 = w - 1 - p, y1 = h - 1 - p, hw = Math.max(1, Math.round(0.02 * dpi));
  const m = MARGIN_IN * dpi, tol = Math.max(1.5, 0.006 * dpi);
  const sides = {};
  for (const side of SIDES) {
    const vertical = VERTICAL[side], dir = INWARD[side];
    const [a, b] = vertical ? [y0, y1] : [x0, x1];
    const outerNom = { left: x0, right: x1, top: y0, bottom: y1 }[side];
    const samples = [];
    for (let i = 0; i < n; i++) {
      const t = a + m + (b - a - 2 * m) * (n === 1 ? 0.5 : i / (n - 1));
      const r = detect(profile(img, vertical, t, hw), outerNom, dir, dpi);
      const glare = glareShare(img, vertical, t, hw, r.outer, r.found ? r.inner : r.outer + dir * DEFAULT_IN * dpi);
      samples.push({ t, outer: r.outer + 0.5, inner: r.inner + 0.5, found: r.found, glare: glare > GLARE_SHARE, bg: r.bgDist });
    }
    // a genuinely white border (sports, Magic) is bright at most points: that's the border colour, not glare
    if (samples.filter((s) => s.glare).length > n * 0.5) samples.forEach((s) => { s.glare = false; });
    // glare over the border: those points aren't trusted (a white streak looks like an edge)
    const bright = samples.filter((s) => !s.glare);
    const of = robustFit((bright.length >= 3 ? bright : samples).map((s) => [s.t, s.outer]), tol);
    const good = samples.filter((s) => s.found && !s.glare);
    const inf = good.length >= 3 ? robustFit(good.map((s) => [s.t, s.inner]), tol) : null;
    const oSet = bright.length >= 3 ? bright : samples;
    samples.forEach((s) => { s.outerUsed = false; s.innerUsed = false; });
    if (of) oSet.forEach((s, i) => { s.outerUsed = of.used[i]; });
    if (inf) good.forEach((s, i) => { s.innerUsed = inf.used[i]; });
    const innerCount = samples.filter((s) => s.innerUsed).length;
    const found = !!inf && innerCount >= Math.max(3, Math.ceil(n * 0.4));
    const T = HANDLE_AT.map((f) => a + (b - a) * f);
    const outerAt = (t) => (of ? of.a + of.b * t : outerNom);
    const innerAt = (t) => (found ? inf.a + inf.b * t : outerAt(t) + dir * DEFAULT_IN * dpi);
    // standard error of the border width at the middle of the side, from how well the points sit on the lines (px)
    const se = (fit, set, key) => {
      const pts = set.filter((s) => s[key + "Used"]);
      if (!fit || pts.length < 3) return null;
      const r = pts.map((s) => s[key] - (fit.a + fit.b * s.t));
      return Math.sqrt(r.reduce((q, x) => q + x * x, 0) / (pts.length - 2) / pts.length);
    };
    const seO = se(of, oSet, "outer"), seI = found ? se(inf, good, "inner") : null;
    sides[side] = { t: T, outer: T.map(outerAt), inner: T.map(innerAt), found, samples,
                    innerCount, outerCount: samples.filter((s) => s.outerUsed).length,
                    glare: samples.filter((s) => s.glare).length, bgLike: median(samples.map((s) => s.bg)) < 16,
                    se: seO != null && seI != null ? Math.hypot(seO, seI) : null };
  }
  return { dpi, w, h, padPx: p, sides, auto: true };
}

// ------------------------------------------------------------------- analysis
const at = (pair, t, T) => pair[0] + (pair[1] - pair[0]) * (t - T[0]) / (T[1] - T[0]);
const slope = (pair, T) => (pair[1] - pair[0]) / (T[1] - T[0]);
// Rotation of a line in degrees, clockwise positive on screen (y points down).
const rotation = (side, pair, T) => {
  const s = slope(pair, T);
  return (VERTICAL[side] ? -Math.atan(s) : Math.atan(s)) * 180 / Math.PI;
};
// Border width (inches) of one side at position t along it.
export const widthAt = (model, side, t) => {
  const S = model.sides[side];
  return INWARD[side] * (at(S.inner, t, S.t) - at(S.outer, t, S.t)) / model.dpi;
};
const share = (a, b) => (a + b > 0 ? Math.round(1000 * a / (a + b)) / 10 : null);

export function analyze(model) {
  const { dpi, sides } = model;
  // where on the card the borders are compared: near each end (0.5 in in, like the standard tool) and the middle
  const card = { x0: model.padPx, y0: model.padPx, x1: model.w - 1 - model.padPx, y1: model.h - 1 - model.padPx };
  const d = 0.5 * dpi;
  const posV = { start: card.y0 + d, mid: (card.y0 + card.y1) / 2, end: card.y1 - d };   // along left/right
  const posH = { start: card.x0 + d, mid: (card.x0 + card.x1) / 2, end: card.x1 - d };   // along top/bottom
  const widths = {};
  for (const side of SIDES) {
    const pos = VERTICAL[side] ? posV : posH;
    widths[side] = Object.fromEntries(Object.entries(pos).map(([k, t]) => [k, widthAt(model, side, t)]));
  }
  const lr = share(widths.left.mid, widths.right.mid), tb = share(widths.top.mid, widths.bottom.mid);
  // ± on each share (1 standard error, as percentage points): line fit scatter + half a pixel for where an edge
  // really is. Low-resolution pictures (screenshots, listing photos) get a wide margin automatically.
  // srcDpi: the card's real resolution in the original picture (a small listing photo is enlarged to at least 150 dpi)
  const res = Math.min(dpi, model.srcDpi || dpi), up = dpi / res;
  const eIn = (side) => Math.hypot(sides[side].se ?? 0.5, 0.5 * up) / dpi;
  const pm = (a, b, ea, eb) => (a + b > 0 ? Math.round(1000 * Math.hypot(b * ea, a * eb) / (a + b) ** 2) / 10 : null);
  const plusMinus = { lr: pm(widths.left.mid, widths.right.mid, eIn("left"), eIn("right")),
                      tb: pm(widths.top.mid, widths.bottom.mid, eIn("top"), eIn("bottom")) };
  // left/right compared at the top and at the bottom; top/bottom at the left and at the right
  const lrAt = { top: share(widths.left.start, widths.right.start), bottom: share(widths.left.end, widths.right.end) };
  const tbAt = { left: share(widths.top.start, widths.bottom.start), right: share(widths.top.end, widths.bottom.end) };
  const worst = (vals) => Math.max(...vals.filter((v) => v != null).map((v) => Math.max(v, 100 - v)));

  // tilt: inner edge's rotation minus the outer edge's, per side, weighted by side length
  const per = {}, outerRot = {};
  let sw = 0, sum = 0;
  for (const side of SIDES) {
    const S = sides[side];
    outerRot[side] = rotation(side, S.outer, S.t);
    per[side] = rotation(side, S.inner, S.t) - outerRot[side];
    if (S.found !== false) { const wgt = VERTICAL[side] ? 3.5 : 2.5; sum += per[side] * wgt; sw += wgt; }
  }
  const tilt = sw ? sum / sw : null;
  const used = SIDES.filter((s) => sides[s].found !== false);
  const tiltSpread = used.length >= 2 ? Math.max(...used.map((s) => per[s])) - Math.min(...used.map((s) => per[s])) : null;
  // card's own edges: should be square to each other after straightening (if not: photo not flat, or a miscut card)
  const outerSquare = Math.max(Math.abs(outerRot.left - outerRot.right), Math.abs(outerRot.top - outerRot.bottom),
    Math.abs((outerRot.left + outerRot.right) / 2 - (outerRot.top + outerRot.bottom) / 2));
  const drift = (side) => widths[side].end - widths[side].start;   // inches the border grows from start to end

  const warn = [];
  const glared = SIDES.filter((s) => sides[s].glare);
  if (glared.length) warn.push(`Glare on the ${list(glared)} border — ${SIDES.reduce((q, s) => q + (sides[s].glare || 0), 0)} point(s) left out. Tilt the card or light a little to remove it.`);
  if (res < 200) warn.push(`Low-resolution picture (about ${Math.round(res)} dpi across the card) — results are rougher; see the ± margin.`);
  if (SIDES.filter((s) => sides[s].bgLike).length >= 3 || SIDES.some((s) => sides[s].found !== false && widths[s].mid > 0.3))
    warn.push("The borders look like background (or are very wide) — if the card is in a toploader or sleeve, switch that on and add the picture again.");
  const missing = SIDES.filter((s) => sides[s].found === false);
  if (missing.length) warn.push(`The inner edge of the ${list(missing)} border wasn't found clearly (full art, or the art runs into the border) — place ${missing.length > 1 ? "those lines" : "that line"} by hand.`);
  if (tiltSpread != null && tiltSpread > 0.35) warn.push(`The four sides disagree on the tilt (by ${tiltSpread.toFixed(2)}°). The photo may not be flat, or a line needs adjusting.`);
  if (outerSquare > 0.3) warn.push(`The card's own edges aren't square (${outerSquare.toFixed(2)}° off). Retake the photo straight on, or the card may be miscut.`);
  return {
    lr: lr == null ? null : [lr, r1(100 - lr)], tb: tb == null ? null : [tb, r1(100 - tb)],
    plusMinus, lrAt, tbAt, worst: worst([lr, tb, lrAt.top, lrAt.bottom, tbAt.left, tbAt.right]),
    widths, tilt, tiltPerSide: per, tiltSpread, outerSquare, drift: Object.fromEntries(SIDES.map((s) => [s, drift(s)])),
    verdict: tiltVerdict(tilt), warn, dpi, srcDpi: res,
  };
}
const r1 = (x) => Math.round(x * 10) / 10;
const list = (a) => (a.length < 2 ? a[0] : a.slice(0, -1).join(", ") + " and " + a.at(-1));

// Rough guide for how visible a tilt is (not a grading rule): over a 3.5 in side, 0.25° moves the border by ~0.4 mm.
export const TILT_LEVELS = [[0.15, "Straight", "ok"], [0.4, "Very slight tilt", "ok"], [0.8, "Slight tilt", "warn"],
                            [1.5, "Noticeable tilt", "bad"], [Infinity, "Strong tilt", "bad"]];
export function tiltVerdict(t) {
  if (t == null) return null;
  const [, label, tone] = TILT_LEVELS.find(([lim]) => Math.abs(t) < lim);
  return { label, tone, dir: Math.abs(t) < 0.05 ? "" : t > 0 ? "clockwise" : "counter-clockwise" };
}

// ------------------------------------------------------------ grade caps
// Copy of Restored Rarity portal/common.js CENTERING_RULES (keep in sync): [grade, front max, back max]
// as the larger share of the worse axis (55 = 55/45). Centering only.
export const CENTERING_RULES = {
  PSA: { floor: "1", rules: [["10", 55, 75], ["9", 60, 90], ["8", 65, 90], ["7", 70, 90], ["6", 80, 90], ["5", 85, 90], ["3", 90, 90]] },
  CGC: { floor: "3 or lower", rules: [["Pristine 10", 50, 50], ["10", 55, 75], ["9", 60, 90], ["8", 65, null], ["7", 70, null],
                                       ["6", 75, null], ["4.5", 85, null], ["3.5", 90, null]] },
  BGS: { floor: "5.5 or lower", rules: [["Pristine 10", 50, 55], ["9.5", 55, 60], ["9", 55, 70], ["8", 60, 80],
                                         ["7", 65, 90], ["6", 70, 95]] },
};
// front/back: worse-axis share (e.g. 58 for 58/42), back may be null.
export function gradeCaps(front, back) {
  if (front == null) return null;
  const f = Math.round(front), b = back == null ? null : Math.round(back);
  const fits = (r) => f <= r[1] && (b == null || r[2] == null || b <= r[2]);
  const out = {};
  for (const [co, { floor, rules }] of Object.entries(CENTERING_RULES)) {
    const i = rules.findIndex(fits), up = i < 0 ? rules.at(-1) : rules[i - 1];
    out[co] = { grade: i < 0 ? floor : rules[i][0],
      next: up && { grade: up[0], front: f > up[1] ? up[1] : null, back: b != null && up[2] != null && b > up[2] ? up[2] : null } };
  }
  return { front: f, back: b, companies: out };
}

export const worseShare = (a) => (a?.lr && a?.tb ? Math.max(a.lr[0], a.lr[1], a.tb[0], a.tb[1]) : null);
export const clone = (m) => JSON.parse(JSON.stringify(m));
