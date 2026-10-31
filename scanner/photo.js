// Phone-photo (and scan) processing for Scan Station: find the card's four corners, undo the
// camera's perspective so the card becomes an exact 2.5 x 3.5 in rectangle, then cut close-ups and
// measure centering with the same code as the scan station (../portal/scanproc.js).
import * as P from "../portal/scanproc.js";

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

// Finds the card in a bitmap. Returns its 4 corners in full-resolution px (TL, TR, BR, BL) or null.
export function findQuad(bmp) {
  const s = Math.min(1, P.DETECT_MAX_SIDE / Math.max(bmp.width, bmp.height));
  const img = P.getData(bmp, Math.max(1, Math.round(bmp.width * s)), Math.max(1, Math.round(bmp.height * s)));
  const comps = P.components(P.foregroundMask(img), img.width, img.height)
    .filter((c) => c.area > img.width * img.height * 0.03 && c.pts.length >= 20);
  let best = null;
  for (const c of comps) {
    const H = hull(c.pts); if (H.length < 4) continue;
    const q = reduceToQuad(H);
    const quadArea = triArea(q[0], q[1], q[2]) + triArea(q[0], q[2], q[3]);
    const hullArea = H.reduce((acc, a, i) => { const b = H[(i + 1) % H.length]; return acc + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
    const o = orderQuad(q);
    const ar = ((dist(o[1], o[2]) + dist(o[3], o[0])) / 2) / ((dist(o[0], o[1]) + dist(o[2], o[3])) / 2);
    // card-like: four straight sides that cover the shape, roughly 5:7 even when seen at an angle
    if (quadArea < Math.abs(hullArea) * 0.9 || ar < 1.1 || ar > 1.9) continue;
    if (!best || c.area > best.c.area) best = { c, q };
  }
  if (!best) return null;
  return orderQuad(refineQuad(best.q, best.c.pts)).map(([x, y]) => [(x + 0.5) / s, (y + 0.5) / s]);
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
export async function processImage(bmp, quad = null) {
  const q = quad || findQuad(bmp);
  if (!q) {
    const cv = P.canvas(bmp.width, bmp.height); cv.getContext("2d").drawImage(bmp, 0, 0);
    return { canvas: cv, ok: false, dpi: null, quad: null, centering: null, regions: {}, boxes: {} };
  }
  const dpi = Math.round(Math.max(MIN_DPI, Math.min(MAX_DPI, quadDpi(q))));
  const cv = warp(bmp, q, dpi);
  return { canvas: cv, ok: true, dpi, quad: q, ...measure(cv, dpi) };
}
