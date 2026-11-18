// Phone-photo (and scan) processing for ScanStationIQ: find the card's four corners, undo the
// camera's perspective so the card becomes an exact 2.5 x 3.5 in rectangle, then cut close-ups and
// measure centering with the same code as the scan station (shared/scanproc.js).
import * as P from "./shared/scanproc.js";

export const MAX_DPI = 800, MIN_DPI = 150;
const PAD = P.CROP_PAD_IN;

// ------------------------------------------------------------- geometry
function hull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop(); return lo.concat(up);
}
const triArea = (a, b, c) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Shrinks a convex polygon to 4 corners by dropping the vertex that removes the least area each time.
function reduceToQuad(poly) {
  const p = poly.slice();
  while (p.length > 4) {
    let mi = 0, ma = Infinity;
    for (let i = 0; i < p.length; i++) {
      const a = triArea(p[(i - 1 + p.length) % p.length], p[i], p[(i + 1) % p.length]);
      if (a < ma) { ma = a; mi = i; }
    }
    p.splice(mi, 1);
  }
  return p;
}

// Straight-line fit (total least squares) through each side's edge pixels, skipping the rounded
// corners, then intersect neighbouring sides: corners land where the straight edges meet.
function fitLine(sel) {
  let mx = 0, my = 0; for (const [x, y] of sel) { mx += x; my += y; } mx /= sel.length; my /= sel.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of sel) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { p: [mx, my], d: [Math.cos(th), Math.sin(th)] };
}
function refineQuad(q, pts) {
  const lines = [];
  for (let i = 0; i < 4; i++) {
    // the rough corners sit on the rounded corners, so the rough side can be off the real edge:
    // take a wide band first, then refit on the points that hug the first fit
    const a = q[i], b = q[(i + 1) % 4], L = dist(a, b);
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    let sel = pts.filter(([x, y]) => {
      const t = ((x - a[0]) * ux + (y - a[1]) * uy) / L, d = Math.abs((x - a[0]) * -uy + (y - a[1]) * ux);
      return t > 0.15 && t < 0.85 && d < L * 0.08;
    });
    if (sel.length < 10) return q;
    let line = fitLine(sel);
    for (const tol of [Math.max(3, L * 0.02), Math.max(1.5, L * 0.006)]) {
      const near = sel.filter(([x, y]) => Math.abs((x - line.p[0]) * -line.d[1] + (y - line.p[1]) * line.d[0]) < tol);
      if (near.length < 10) break;
      sel = near; line = fitLine(sel);
    }
    lines.push(line);
  }
  const out = [];
  for (let i = 0; i < 4; i++) {
    const l1 = lines[(i + 3) % 4], l2 = lines[i];          // corner i sits between side i-1 and side i
    const det = l1.d[0] * -l2.d[1] - l1.d[1] * -l2.d[0];
    if (Math.abs(det) < 1e-6) return q;
    const rx = l2.p[0] - l1.p[0], ry = l2.p[1] - l1.p[1];
    const t = (rx * -l2.d[1] - ry * -l2.d[0]) / det;
    out.push([l1.p[0] + t * l1.d[0], l1.p[1] + t * l1.d[1]]);
  }
  // a refined corner far from the rough one means a bad fit: keep the rough quad
  return out.every((c, i) => dist(c, q[i]) < 0.15 * dist(q[0], q[2])) ? out : q;
}

// Orders corners clockwise starting top-left, with the card upright (short side on top).
export function orderQuad(q) {
  let p = q.slice();
  const s = p.reduce((acc, a, i) => { const b = p[(i + 1) % 4]; return acc + a[0] * b[1] - b[0] * a[1]; }, 0);
  if (s < 0) p.reverse();                                // clockwise on screen (y points down)
  let start = 0;
  for (let i = 1; i < 4; i++) if (p[i][0] + p[i][1] < p[start][0] + p[start][1]) start = i;
  p = [...p.slice(start), ...p.slice(0, start)];
  const top = (dist(p[0], p[1]) + dist(p[2], p[3])) / 2, side = (dist(p[1], p[2]) + dist(p[3], p[0])) / 2;
  if (top > side) p = [p[3], p[0], p[1], p[2]];          // card lies sideways: turn it upright
  return p;
}
export const rotateQuad = (q, quarterTurns) => { const k = ((quarterTurns % 4) + 4) % 4; return [...q.slice(k), ...q.slice(0, k)]; };

// Phone photos are rarely evenly lit: a window or lamp makes one side of the table brighter and lenses
// darken the corners. The scan mask compares every pixel with ONE background colour, so on such photos
// the bright side of the table looks like "card". Here the background is a smooth surface (quadratic in
// x and y, per Lab channel) fitted to the photo's outer band, refitted without outliers (a card that
// touches the edge), and each pixel is compared with the background expected at its own position.
function solve(A, B) {                                   // small dense system, Gaussian elimination
  const n = B.length;
  for (let c = 0; c < n; c++) {
    let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]]; [B[c], B[piv]] = [B[piv], B[c]];
    if (Math.abs(A[c][c]) < 1e-12) return null;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      B[r] -= f * B[c];
    }
  }
  return B.map((v, i) => v / A[i][i]);
}
export function photoMask(img) {
  const { width: w, height: h } = img, L = P.toLab(img);
  const b = Math.max(3, Math.floor(Math.min(w, h) * 0.03));
  const feat = (x, y) => { const u = x / w - 0.5, v = y / h - 0.5; return [1, u, v, u * u, v * v, u * v]; };
  let samples = [];
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2)
    if (y < b || y >= h - b || x < b || x >= w - b) samples.push([x, y]);
  let coef = null;
  for (let pass = 0; pass < 3; pass++) {
    const AtA = [...Array(6)].map(() => new Float64Array(6)), Atb = [0, 1, 2].map(() => new Float64Array(6));
    for (const [x, y] of samples) {
      const f = feat(x, y), o = (y * w + x) * 3;
      for (let i = 0; i < 6; i++) { for (let j = 0; j < 6; j++) AtA[i][j] += f[i] * f[j]; for (let c = 0; c < 3; c++) Atb[c][i] += f[i] * L[o + c]; }
    }
    const next = [0, 1, 2].map((c) => solve(AtA.map((r) => Array.from(r)), Array.from(Atb[c])));
    if (next.some((x) => !x)) break;
    coef = next;
    const res = samples.map(([x, y]) => { const f = feat(x, y), o = (y * w + x) * 3;
      return Math.hypot(...[0, 1, 2].map((c) => L[o + c] - f.reduce((s2, fi, i) => s2 + fi * coef[c][i], 0))); });
    const med = Float32Array.from(res).sort()[res.length >> 1];
    const keep = samples.filter((_, i) => res[i] <= Math.max(4, 3 * med));
    if (keep.length < 50 || keep.length === samples.length) break;
    samples = keep;
  }
  if (!coef) return P.foregroundMask(img);
  const d8 = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const f = feat(x, y), i = y * w + x, o = i * 3;
    let s2 = 0;
    for (let c = 0; c < 3; c++) { const e = L[o + c] - (f[0] * coef[c][0] + f[1] * coef[c][1] + f[2] * coef[c][2] + f[3] * coef[c][3] + f[4] * coef[c][4] + f[5] * coef[c][5]); s2 += e * e; }
    d8[i] = Math.min(255, Math.floor(Math.sqrt(s2) * 2));
  }
  // Threshold: Otsu, capped just above the table's own variation. A textured table under uneven light
  // varies more on its bright side, so use the second-busiest side of the outer band (one side may
  // touch the card, so not the busiest).
  const p99 = (vals) => { vals.sort((p, q) => p - q); return vals[Math.floor(vals.length * 0.99)]; };
  const strip = (x0, y0, x1, y1) => { const v = []; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) v.push(d8[y * w + x]); return v; };
  const sides = [p99(strip(0, 0, w, b)), p99(strip(0, h - b, w, h)), p99(strip(0, 0, b, h)), p99(strip(w - b, 0, w, h))].sort((p, q) => p - q);
  return finishMask(d8, w, h, Math.max(30, Math.min(P.otsu(d8), sides[2] + 20)));
}
// Phone photos under a lamp (owner's test, Nov 14, 2026): the card's SHADOW and the lamp-lit wood grain both differ from
// the table's average colour, so photoMask counted them as card and the crop came out skewed. Shadows and lit grain are the
// same colour as the table, only darker or brighter; a card is a different colour, or much brighter. So: model the table's
// colour (RGB, smooth surface) from the whole photo outside a first guess at the card, then score each pixel by how far its
// chromaticity is from the table's (weighted down where it's too dark to tell) and by how much brighter it is. Being
// darker only counts when the colour differs too, so a shadow stays "table".
export function shadeMask(img) {
  const { width: w, height: h, data } = img, n = w * h;
  const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0; i < n; i++) { R[i] = data[i * 4]; G[i] = data[i * 4 + 1]; B[i] = data[i * 4 + 2]; }
  const feat = (x, y, cubic) => { const u = x / w - 0.5, v = y / h - 0.5;
    return cubic ? [1, u, v, u * u, v * v, u * v, u * u * u, v * v * v, u * u * v, u * v * v] : [1, u, v, u * u, v * v, u * v]; };
  const fit = (pts, cubic) => {
    const k = cubic ? 10 : 6, AtA = [...Array(k)].map(() => new Float64Array(k)), Atb = [0, 1, 2].map(() => new Float64Array(k));
    for (const i of pts) { const f = feat(i % w, (i / w) | 0, cubic);
      for (let a = 0; a < k; a++) { for (let b = 0; b < k; b++) AtA[a][b] += f[a] * f[b]; Atb[0][a] += f[a] * R[i]; Atb[1][a] += f[a] * G[i]; Atb[2][a] += f[a] * B[i]; } }
    const c = [0, 1, 2].map((ch) => solve(AtA.map((r) => Array.from(r)), Array.from(Atb[ch])));
    return c.some((x) => !x) ? null : { c, cubic };
  };
  const score = (bg) => {
    const d8 = new Uint8Array(n);
    const [cr, cg, cb] = bg.c, k = bg.cubic ? 10 : 6, at = (c, u, v) => {
      let r = c[0] + c[1] * u + c[2] * v + c[3] * u * u + c[4] * v * v + c[5] * u * v;
      if (k === 10) r += c[6] * u * u * u + c[7] * v * v * v + c[8] * u * u * v + c[9] * u * v * v;
      return Math.max(2, r);
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w - 0.5, v = y / h - 0.5, i = y * w + x;
      const rb = at(cr, u, v), gb = at(cg, u, v), bb = at(cb, u, v);
      const s = R[i] + G[i] + B[i] + 3, sb = rb + gb + bb + 3, lk = Math.log(s / sb);
      const c = Math.hypot(R[i] / s - rb / sb, G[i] / s - gb / sb, B[i] / s - bb / sb) * Math.min(1, s / 150) * 600;
      const bright = Math.max(0, lk) * 160, dark = Math.max(0, -lk) * 160 * (c > 25 ? 1 : 0.15);
      d8[i] = Math.min(255, Math.round(Math.max(c, bright, dark)));
    }
    return d8;
  };
  const band = Math.max(3, Math.floor(Math.min(w, h) * 0.04)), edge = [];
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (y < band || y >= h - band || x < band || x >= w - band) edge.push(y * w + x);
  let bg = fit(edge, false); if (!bg) return null;
  const thresh = (d8) => {
    const p99 = (v) => { v.sort((p, q) => p - q); return v[Math.floor(v.length * 0.99)] || 0; };
    const strip = (x0, y0, x1, y1) => { const v = []; for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) v.push(d8[y * w + x]); return v; };
    const sides = [p99(strip(0, 0, w, band)), p99(strip(0, h - band, w, h)), p99(strip(0, 0, band, h)), p99(strip(w - band, 0, w, h))].sort((p, q) => p - q);
    return Math.max(30, Math.min(P.otsu(d8), sides[2] + 20));
  };
  // second pass: refit the table from every pixel well away from the first guess (catches a lamp's hot spot in the middle)
  let d8 = score(bg), m = finishMask(d8, w, h, thresh(d8));
  const away = P.morph(m, w, h, (Math.max(5, Math.floor(Math.min(w, h) * 0.03)) | 1), true), rest = [];
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) { const i = y * w + x; if (!away[i]) rest.push(i); }
  // a curved (cubic) table model needs table all round; when the card fills most of the photo, stay with the flat one
  const share = rest.length / Math.ceil(w / 3) / Math.ceil(h / 3);
  if (rest.length > 500) { const bg2 = fit(rest, share > 0.45); if (bg2) { bg = bg2; d8 = score(bg); m = finishMask(d8, w, h, thresh(d8)); } }
  return m;
}
function finishMask(d8, w, h, t) {
  let m = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) m[i] = d8[i] > t ? 1 : 0;
  const k = Math.max(3, Math.floor(Math.min(h, w) * 0.006)) | 1;
  m = P.morph(P.morph(m, w, h, k * 3, true), w, h, k * 3, false);   // close
  m = P.morph(P.morph(m, w, h, k, false), w, h, k, true);           // open
  return P.fillHoles(m, w, h);
}

// Largest card-shaped object in a mask: four straight sides that cover the shape, roughly 5:7 even
// when seen at an angle. Returns its rough quad + edge pixels, or null.
function bestCard(mask, w, h) {
  // not almost the whole frame: that's a busy background (playmat, noise) mistaken for one big shape
  const comps = P.components(mask, w, h).filter((c) => c.area > w * h * 0.03 && c.area < w * h * 0.85 && c.pts.length >= 20);
  let best = null;
  for (const c of comps) {
    const H = hull(c.pts); if (H.length < 4) continue;
    const q = reduceToQuad(H);
    const quadArea = triArea(q[0], q[1], q[2]) + triArea(q[0], q[2], q[3]);
    const hullArea = H.reduce((acc, a, i) => { const b = H[(i + 1) % H.length]; return acc + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
    const o = orderQuad(q);
    const ar = ((dist(o[1], o[2]) + dist(o[3], o[0])) / 2) / ((dist(o[0], o[1]) + dist(o[2], o[3])) / 2);
    if (quadArea < Math.abs(hullArea) * 0.9 || ar < 1.1 || ar > 1.9) continue;
    if (!best || c.area > best.c.area) best = { c, q };
  }
  return best;
}

// Owner's real photos (Nov 14, 2026): a shadow from the phone or hand joins the card in the mask, and the blob's outline
// (hull → 4 corners) then runs off into the shadow. The card's own edges are still there: four long straight runs in the
// blob's outline. So find straight lines in the outline (Hough), pair the near-parallel ones, and keep the two pairs that
// cross at about a right angle and make a card-shaped (5:7) quad with the most outline along its sides. Curvy shadow and
// glare outlines don't make long straight lines, so they're ignored. Returns 4 corners or null.
function houghQuad(pts, w, h) {
  const P0 = pts.filter(([x, y]) => x > 1 && y > 1 && x < w - 2 && y < h - 2);   // not the photo's own edge
  if (P0.length < 80) return null;
  const step = Math.max(1, Math.floor(P0.length / 6000)), Q = P0.filter((_, i) => i % step === 0);
  const NT = 360, diag = Math.ceil(Math.hypot(w, h)), NR = 2 * diag + 1, acc = new Int32Array(NT * NR);
  const cs = new Float64Array(NT), sn = new Float64Array(NT);
  for (let t = 0; t < NT; t++) { cs[t] = Math.cos(t * Math.PI / NT); sn[t] = Math.sin(t * Math.PI / NT); }
  for (const [x, y] of Q) for (let t = 0; t < NT; t++) acc[t * NR + Math.round(x * cs[t] + y * sn[t]) + diag]++;
  // strongest lines, keeping only one per neighbourhood
  const peaks = [], rTol = Math.max(4, Math.round(Math.min(w, h) * 0.02)), tTol = 8;
  const used = new Uint8Array(NT * NR);
  const cand = []; for (let i = 0; i < acc.length; i++) if (acc[i] >= 15) cand.push(i);
  cand.sort((a, b) => acc[b] - acc[a]);
  for (let k = 0, c = 0; k < 18; k++) {
    while (c < cand.length && used[cand[c]]) c++;
    const bi = c < cand.length ? cand[c] : -1, bv = bi < 0 ? 0 : acc[bi];
    if (bi < 0 || bv < 15) break;
    const t = (bi / NR) | 0, r = (bi % NR) - diag;
    peaks.push({ t, r, v: bv });
    for (let dt = -tTol; dt <= tTol; dt++) {
      const tt = (t + dt + NT) % NT, flip = t + dt < 0 || t + dt >= NT;      // theta wraps with rho negated
      for (let dr = -rTol; dr <= rTol; dr++) { const rr = (flip ? -r : r) + dr + diag; if (rr >= 0 && rr < NR) used[tt * NR + rr] = 1; }
    }
  }
  const angDiff = (a, b) => { const d = Math.abs(a - b) % NT; return Math.min(d, NT - d) * 180 / NT; };
  const line = (pk) => ({ n: [cs[pk.t], sn[pk.t]], r: pk.r });
  const meet = (a, b) => { const det = a.n[0] * b.n[1] - a.n[1] * b.n[0]; if (Math.abs(det) < 1e-6) return null;
    return [(a.r * b.n[1] - b.r * a.n[1]) / det, (a.n[0] * b.r - b.n[0] * a.r) / det]; };
  const pairs = [];
  for (let i = 0; i < peaks.length; i++) for (let j = i + 1; j < peaks.length; j++) {
    if (angDiff(peaks[i].t, peaks[j].t) > 10) continue;
    const a = line(peaks[i]), b = line(peaks[j]);
    const sep = Math.abs(a.r - b.r * (a.n[0] * b.n[0] + a.n[1] * b.n[1] < 0 ? -1 : 1));
    if (sep > Math.min(w, h) * 0.12) pairs.push([i, j, sep]);
  }
  const near = (L, a, b) => {                 // outline points along segment a-b, within 2.5 px of line L
    const len = dist(a, b); let n = 0;
    for (const [x, y] of Q) {
      if (Math.abs(x * L.n[0] + y * L.n[1] - L.r) > 2.5) continue;
      const t = ((x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1])) / (len * len);
      if (t > 0.05 && t < 0.95) n++;
    }
    return n * step / len;                      // fraction of the side covered (≈ 1 when the whole side is outline)
  };
  let best = null;
  for (let a = 0; a < pairs.length; a++) for (let b = a + 1; b < pairs.length; b++) {
    const [i1, j1, s1] = pairs[a], [i2, j2, s2] = pairs[b];
    if (new Set([i1, j1, i2, j2]).size < 4) continue;
    const cross = angDiff(peaks[i1].t, peaks[i2].t); if (cross < 60) continue;
    const L1 = line(peaks[i1]), L2 = line(peaks[i2]), L3 = line(peaks[j1]), L4 = line(peaks[j2]);
    const q = [meet(L1, L2), meet(L2, L3), meet(L3, L4), meet(L4, L1)];
    if (q.some((c) => !c || c[0] < -0.02 * w || c[1] < -0.02 * h || c[0] > 1.02 * w || c[1] > 1.02 * h)) continue;
    const sides = [dist(q[0], q[1]), dist(q[1], q[2]), dist(q[2], q[3]), dist(q[3], q[0])];
    const ar = Math.max(sides[0] + sides[2], sides[1] + sides[3]) / Math.min(sides[0] + sides[2], sides[1] + sides[3]);
    if (ar < 1.22 || ar > 1.62) continue;
    const cov = [near(L2, q[0], q[1]), near(L3, q[1], q[2]), near(L4, q[2], q[3]), near(L1, q[3], q[0])];
    if (Math.min(...cov) < 0.35) continue;
    const score = cov.reduce((x, c, k) => x + Math.min(1, c) * sides[k], 0) * (1 - Math.abs(ar - 1.4) * 0.5);
    if (!best || score > best.score) best = { score, q };
  }
  if (!best) return null;
  // refit each side only on outline points right on its line (holes and shadow bits nearby don't pull it)
  const q = best.q, lines = [];
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], L = dist(a, b), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    let sel = P0.filter(([x, y]) => { const t = ((x - a[0]) * ux + (y - a[1]) * uy) / L;
      return t > 0.08 && t < 0.92 && Math.abs((x - a[0]) * -uy + (y - a[1]) * ux) < 3; });
    if (sel.length < 10) { lines.push({ p: a, d: [ux, uy] }); continue; }
    let fit = fitLine(sel);
    for (const tol of [2, 1.2]) {
      const nb = sel.filter(([x, y]) => Math.abs((x - fit.p[0]) * -fit.d[1] + (y - fit.p[1]) * fit.d[0]) < tol);
      if (nb.length < 10) break; sel = nb; fit = fitLine(sel);
    }
    lines.push(fit);
  }
  const out = [];
  for (let i = 0; i < 4; i++) {
    const l1 = lines[(i + 3) % 4], l2 = lines[i], det = l1.d[0] * -l2.d[1] - l1.d[1] * -l2.d[0];
    if (Math.abs(det) < 1e-6) return q;
    const rx = l2.p[0] - l1.p[0], ry = l2.p[1] - l1.p[1], t = (rx * -l2.d[1] - ry * -l2.d[0]) / det;
    out.push([l1.p[0] + t * l1.d[0], l1.p[1] + t * l1.d[1]]);
  }
  return out.every((c, i) => dist(c, q[i]) < 0.05 * dist(q[0], q[2])) ? out : q;
}

// Finds the card in a bitmap. Returns its 4 corners in full-resolution px (TL, TR, BR, BL) or null.
// dpi (scans: read from the file) = the card's true size in pixels is known (2.5 × 3.5 in), so every method is tried and the
// result closest to that size wins (a missed same-colour border or a shadow rim makes the card the wrong size). Without dpi
// (phone photos): straight-edge search first (ignores shadows joined to the card), then the outline-shape method.
export function findQuad(bmp, dpi = null) {
  const s = Math.min(1, P.DETECT_MAX_SIDE / Math.max(bmp.width, bmp.height));
  const img = P.getData(bmp, Math.max(1, Math.round(bmp.width * s)), Math.max(1, Math.round(bmp.height * s)));
  const { width: w, height: h } = img, sm = shadeMask(img);
  let pm = null; const pmask = () => pm || (pm = photoMask(img));      // only made when needed
  const full = (q) => orderQuad(q).map(([x, y]) => [(x + 0.5) / s, (y + 0.5) / s]);
  const houghs = function* (m) {
    if (!m) return;
    const comps = P.components(m, w, h).filter((c) => c.area > w * h * 0.03 && c.area < w * h * 0.92).sort((a, b) => b.area - a.area).slice(0, 3);
    for (const c of comps) { const q = houghQuad(c.pts, w, h); if (q) yield q; }
  };
  const shape = (m) => { const b = m && bestCard(m, w, h); return b ? refineQuad(b.q, b.c.pts) : null; };
  if (dpi && dpi >= MIN_DPI) {
    const W = P.CARD_W_IN * dpi * s, H = P.CARD_H_IN * dpi * s, cands = [];
    for (const m of [sm, pmask(), P.foregroundMask(img)]) { for (const q of houghs(m)) cands.push(q); const q2 = shape(m); if (q2) cands.push(q2); }
    const off = (q) => { const a = (dist(q[0], q[1]) + dist(q[2], q[3])) / 2, b = (dist(q[1], q[2]) + dist(q[3], q[0])) / 2;
      return Math.max(Math.abs(Math.min(a, b) / W - 1), Math.abs(Math.max(a, b) / H - 1)); };
    let best = null, bo = Infinity;
    for (const q of cands) { const o = off(q); if (o < bo) { bo = o; best = q; } }
    if (best && bo < 0.04) return full(best);
    // A border the same colour as the backing (black card on a black sheet, white on the white lid): only the inner frame was
    // found, smaller than a card on both sides by about the border's width. Widen it evenly to the card's true size.
    if (best && bo < 0.18) {
      const cx = best.reduce((a, p) => a + p[0], 0) / 4, cy = best.reduce((a, p) => a + p[1], 0) / 4;
      const a = (dist(best[0], best[1]) + dist(best[2], best[3])) / 2, b = (dist(best[1], best[2]) + dist(best[3], best[0])) / 2;
      const [sa, sb] = a < b ? [W / a, H / b] : [H / a, W / b];
      if (sa >= 0.97 && sb >= 0.97 && sa < 1.2 && sb < 1.2) {
        const ux = [(best[1][0] - best[0][0] + best[2][0] - best[3][0]) / 2, (best[1][1] - best[0][1] + best[2][1] - best[3][1]) / 2];
        const vx = [(best[3][0] - best[0][0] + best[2][0] - best[1][0]) / 2, (best[3][1] - best[0][1] + best[2][1] - best[1][1]) / 2];
        const lu = Math.hypot(...ux), lv = Math.hypot(...vx), u = [ux[0] / lu, ux[1] / lu], v = [vx[0] / lv, vx[1] / lv];
        return full(best.map(([x, y]) => { const du = (x - cx) * u[0] + (y - cy) * u[1], dv = (x - cx) * v[0] + (y - cy) * v[1];
          return [cx + u[0] * du * sa + v[0] * dv * sb, cy + u[1] * du * sa + v[1] * dv * sb]; }));
      }
      return full(best);                                     // closest to a card's size beats the photo guess
    }
  }
  for (const m of [sm, pmask()]) for (const q of houghs(m)) return full(q);
  const q = shape(sm) || shape(pmask()) || shape(P.foregroundMask(img));
  return q ? full(q) : null;
}

// Several cards in one scan (P.detectCards boxes): cut out card i with a small margin, painting over any part of a
// neighbouring card's box with the scan's background colour, so the detector sees one card on plain backing (with the
// neighbours' edges left in, it found the gap between two cards as a "card", or lost the card). Returns
// { canvas, x0, y0 } (canvas = the cut-out, x0/y0 = its offset in the scan).
export function cardRegion(bmp, boxes, i, dpi) {
  const m = 0.25 * dpi, [x, y, w, h] = boxes[i];
  const x0 = Math.max(0, Math.floor(x - m)), y0 = Math.max(0, Math.floor(y - m));
  const x1 = Math.min(bmp.width, Math.ceil(x + w + m)), y1 = Math.min(bmp.height, Math.ceil(y + h + m));
  const cv = P.canvas(x1 - x0, y1 - y0), ctx = cv.getContext("2d");
  ctx.drawImage(bmp, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
  const others = boxes.filter((b, k) => k !== i && b[0] < x1 && b[0] + b[2] > x0 && b[1] < y1 && b[1] + b[3] > y0);
  if (others.length) {
    // backing colour: median of the scan's outer edge
    const sm = P.getData(bmp, Math.max(1, Math.round(bmp.width / 8)), Math.max(1, Math.round(bmp.height / 8))), v = [[], [], []];
    for (let yy = 0; yy < sm.height; yy++) for (let xx = 0; xx < sm.width; xx++) {
      if (yy > 1 && yy < sm.height - 2 && xx > 1 && xx < sm.width - 2) continue;
      const o2 = (yy * sm.width + xx) * 4; v[0].push(sm.data[o2]); v[1].push(sm.data[o2 + 1]); v[2].push(sm.data[o2 + 2]);
    }
    const med = v.map((a) => a.sort((p, q) => p - q)[a.length >> 1] || 0);
    ctx.fillStyle = `rgb(${med[0]},${med[1]},${med[2]})`;
    // paint the neighbour's box, but never inside this card's own box (it can overlap a tilted neighbour's box)
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cv.width, cv.height); ctx.rect(x - x0, y - y0, w, h); ctx.clip("evenodd");
    for (const b of others) ctx.fillRect(b[0] - x0, b[1] - y0, b[2], b[3]);
    ctx.restore();
  }
  return { canvas: cv, x0, y0 };
}

// Homography taking points a[i] -> b[i] (4 pairs). Returns [h0..h7] (h8 = 1).
function homography(a, b) {
  const A = [], B = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = a[i], [u, v] = b[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
  }
  for (let c = 0; c < 8; c++) {                          // Gaussian elimination with pivoting
    let piv = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]]; [B[c], B[piv]] = [B[piv], B[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      B[r] -= f * B[c];
    }
  }
  return B.map((v, i) => v / A[i][i]);
}

// Estimated resolution of the card in the photo, from its corner-to-corner sizes.
export function quadDpi(q) {
  const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  return (w / P.CARD_W_IN + h / P.CARD_H_IN) / 2;
}

// Warps the card inside quad into a flat, upright canvas with PAD inches of margin.
export function warp(bmp, quad, dpi) {
  const cw = P.CARD_W_IN * dpi, ch = P.CARD_H_IN * dpi, p = PAD * dpi;
  const W = Math.round(cw + 2 * p), H = Math.round(ch + 2 * p);
  const dst = [[p, p], [p + cw, p], [p + cw, p + ch], [p, p + ch]];
  // only read the part of the photo around the card
  const xs = quad.map((c) => c[0]), ys = quad.map((c) => c[1]), m = Math.max(...[cw, ch]) * 0.1;
  const sx0 = Math.max(0, Math.floor(Math.min(...xs) - m)), sy0 = Math.max(0, Math.floor(Math.min(...ys) - m));
  const sx1 = Math.min(bmp.width, Math.ceil(Math.max(...xs) + m)), sy1 = Math.min(bmp.height, Math.ceil(Math.max(...ys) + m));
  const sw = sx1 - sx0, sh = sy1 - sy0;
  const sc = P.canvas(sw, sh), sctx = sc.getContext("2d", { willReadFrequently: true });
  sctx.drawImage(bmp, sx0, sy0, sw, sh, 0, 0, sw, sh);
  const src = sctx.getImageData(0, 0, sw, sh).data;
  const h = homography(dst, quad.map(([x, y]) => [x - sx0, y - sy0]));
  const out = new ImageData(W, H), o = out.data;
  for (let y = 0; y < H; y++) {
    const yc = y + 0.5;
    for (let x = 0; x < W; x++) {
      const xc = x + 0.5, d = h[6] * xc + h[7] * yc + 1;
      let u = (h[0] * xc + h[1] * yc + h[2]) / d - 0.5, v = (h[3] * xc + h[4] * yc + h[5]) / d - 0.5;
      u = Math.min(sw - 1.001, Math.max(0, u)); v = Math.min(sh - 1.001, Math.max(0, v));
      const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4, j = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * fx;
        const bot = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * fx;
        o[j + c] = top + (bot - top) * fy;
      }
      o[j + 3] = 255;
    }
  }
  const cv = P.canvas(W, H);
  cv.getContext("2d", { willReadFrequently: true }).putImageData(out, 0, 0);
  return cv;
}

// Rotates a processed card canvas by 180° (card was upside down).
export function turn180(cv) {
  const o = P.canvas(cv.width, cv.height), x = o.getContext("2d", { willReadFrequently: true });
  x.translate(cv.width, cv.height); x.rotate(Math.PI); x.drawImage(cv, 0, 0); return o;
}

// Close-up regions + centering for a flat card canvas.
export function measure(cv, dpi) {
  const { regions, boxes } = P.detailRegions(cv.width, cv.height, dpi);
  let centering = null;
  try { centering = P.measureCentering(cv.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height), dpi); }
  catch { centering = null; }
  return { regions, boxes, centering };
}

// Whole pipeline for one picture. quad (optional) = corners the user placed by hand.
// Returns { canvas, ok, dpi, quad, centering, regions, boxes } — ok:false means no card edge was found
// and canvas is just the picture.
export async function processImage(bmp, quad = null, dpiHint = null) {
  const q = quad || findQuad(bmp, dpiHint);
  if (!q) {
    const cv = P.canvas(bmp.width, bmp.height); cv.getContext("2d").drawImage(bmp, 0, 0);
    return { canvas: cv, ok: false, dpi: null, quad: null, centering: null, regions: {}, boxes: {} };
  }
  const dpi = Math.round(Math.max(MIN_DPI, Math.min(MAX_DPI, quadDpi(q))));
  const cv = warp(bmp, q, dpi);
  return { canvas: cv, ok: true, dpi, quad: q, ...measure(cv, dpi) };
}

// ---------------------------------------------- pictures that are just the card
// Feeders (and scanner auto-crop) often hand over a picture cropped to the card itself, with no background to find the
// edges against. When the picture has a card's shape (2.5 × 3.5 in, either way round, ±3%), it's taken as the card:
// a thin dark margin is added all round so the usual centering and close-up code can find the card's outer edge.
export const CARD_RATIO = P.CARD_H_IN / P.CARD_W_IN;          // 1.4
export const cardShaped = (w, h) => Math.abs(Math.max(w, h) / Math.min(w, h) - CARD_RATIO) <= 0.04;
export function wholeCard(src, dpiHint = null) {
  let w = src.width, h = src.height;
  if (!cardShaped(w, h)) return null;
  const sideways = w > h;                                     // fed sideways: stand it up
  const shortPx = Math.min(w, h), sizeDpi = shortPx / P.CARD_W_IN;
  const native = dpiHint && Math.abs(dpiHint - sizeDpi) / sizeDpi < 0.12 ? dpiHint : sizeDpi;
  const dpi = Math.round(Math.max(MIN_DPI, Math.min(MAX_DPI, native)));
  const s = dpi / native, cw = Math.round(shortPx * s), ch = Math.round(Math.max(w, h) * s);
  const pad = Math.round(PAD * dpi);
  const cv = P.canvas(cw + 2 * pad, ch + 2 * pad), x = cv.getContext("2d", { willReadFrequently: true });
  x.fillStyle = "#0b0b0d"; x.fillRect(0, 0, cv.width, cv.height);
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
  if (sideways) { x.save(); x.translate(pad + cw, pad); x.rotate(Math.PI / 2); x.drawImage(src, 0, 0, ch, cw); x.restore(); }
  else x.drawImage(src, pad, pad, cw, ch);
  return { canvas: cv, ok: true, dpi, quad: null, tight: true, ...measure(cv, dpi) };
}
// Share of the picture covered by a found card outline (0–1).
export function quadShare(q, w, h) {
  if (!q) return 0;
  let a = 0; for (let i = 0; i < 4; i++) { const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % 4]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a) / 2 / (w * h);
}
