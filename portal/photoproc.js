// Phone photos: a card shot at an angle is a slanted four-sided shape, not a rectangle. Fit a line to each
// edge, intersect them for the four corners and flatten the card, then measure it like a scan.
// Returns the same shape as scanupload.analyze's cards: { canvas, ok, dpi, centering, boxes, regions, warn }.
import * as P from "./scanproc.js";

const MAX_SRC = 4096;      // iPhone canvases top out around 16.7 M pixels
const DETECT_SIDE = 1000;
const MAX_DPI = 800;

// Total-least-squares line through pts, refit once without the worst points. Returns { px, py, dx, dy }.
function fitLine(pts) {
  const fit = (p) => {
    let mx = 0, my = 0; for (const [x, y] of p) { mx += x; my += y; } mx /= p.length; my /= p.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of p) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
    const a = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    return { px: mx, py: my, dx: Math.cos(a), dy: Math.sin(a) };
  };
  const dist = (l, [x, y]) => Math.abs((x - l.px) * l.dy - (y - l.py) * l.dx);
  let l = fit(pts);
  const d = pts.map((q) => dist(l, q)).sort((a, b) => a - b), cut = 2 * d[d.length >> 1] + 1;
  const keep = pts.filter((q) => dist(l, q) <= cut);
  if (keep.length >= 8) l = fit(keep);
  return l;
}
function intersect(a, b) {
  const den = a.dx * b.dy - a.dy * b.dx; if (Math.abs(den) < 1e-9) return null;
  const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / den;
  return [a.px + t * a.dx, a.py + t * a.dy];
}

// Four corners [TL, TR, BR, BL] of the largest card-shaped object in a detection-size image, or null.
function findQuad(img) {
  const mask = P.foregroundMask(img), { width: w, height: h } = img;
  let best = null;
  for (const c of P.components(mask, w, h)) {
    if (c.pts.length < 40) continue;
    const r = P.minAreaRect(c.pts); if (!r) continue;
    const ar = Math.max(r.w, r.h) / Math.min(r.w, r.h);
    if (r.area < w * h * 0.03 || ar < 1.15 || ar > 1.75) continue;
    if (!best || r.area > best.r.area) best = { c, r };
  }
  if (!best) return null;
  const { c, r } = best, ux = Math.cos(r.angle), uy = Math.sin(r.angle);
  // Sort edge pixels to the nearest side of the bounding rectangle, skipping the rounded corners.
  const side = { top: [], right: [], bottom: [], left: [] };
  for (const [x, y] of c.pts) {
    const dx = x + 0.5 - r.cx, dy = y + 0.5 - r.cy, u = dx * ux + dy * uy, v = -dx * uy + dy * ux;
    const d = { left: Math.abs(u + r.w / 2), right: Math.abs(u - r.w / 2), top: Math.abs(v + r.h / 2), bottom: Math.abs(v - r.h / 2) };
    const k = Object.keys(d).reduce((a, b) => (d[a] <= d[b] ? a : b));
    const along = k === "left" || k === "right" ? Math.abs(v) / r.h : Math.abs(u) / r.w;
    if (along < 0.38) side[k].push([x + 0.5, y + 0.5]);
  }
  if (Object.values(side).some((p) => p.length < 10)) return null;
  const quad = (L) => [intersect(L.top, L.left), intersect(L.top, L.right), intersect(L.bottom, L.right), intersect(L.bottom, L.left)];
  let q = quad(Object.fromEntries(Object.entries(side).map(([k, p]) => [k, fitLine(p)])));
  if (!q.every(Boolean)) return null;
  // Second pass along the real sides: on a steep shot the far side is short, so the first pass's window
  // (measured on the bounding rectangle) still includes its rounded corners.
  const tol = 0.02 * Math.min(r.w, r.h) + 2, ends = { top: [0, 1], right: [1, 2], bottom: [3, 2], left: [0, 3] }, L2 = {};
  for (const [k, [ia, ib]] of Object.entries(ends)) {
    const [ax, ay] = q[ia], [bx, by] = q[ib], len = Math.hypot(bx - ax, by - ay), dx = (bx - ax) / len, dy = (by - ay) / len;
    const pts = c.pts.map(([x, y]) => [x + 0.5, y + 0.5]).filter(([x, y]) => {
      const t = ((x - ax) * dx + (y - ay) * dy) / len;
      return t > 0.15 && t < 0.85 && Math.abs((x - ax) * dy - (y - ay) * dx) < tol;
    });
    L2[k] = pts.length >= 10 ? fitLine(pts) : fitLine(side[k]);
  }
  q = quad(L2);
  return q.every(Boolean) ? q : null;
}

// Homography taking (x, y) in the flattened card to the photo. src/dst: 4 points each.
function homography(dst, src) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = dst[i], [u, v] = src[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let i = 0; i < 8; i++) {                       // Gaussian elimination with partial pivoting
    let m = i; for (let k = i + 1; k < 8; k++) if (Math.abs(A[k][i]) > Math.abs(A[m][i])) m = k;
    [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]];
    for (let k = i + 1; k < 8; k++) {
      const f = A[k][i] / A[i][i]; for (let j = i; j < 8; j++) A[k][j] -= f * A[i][j]; b[k] -= f * b[i];
    }
  }
  const h = new Array(8);
  for (let i = 7; i >= 0; i--) { let s = b[i]; for (let j = i + 1; j < 8; j++) s -= A[i][j] * h[j]; h[i] = s / A[i][i]; }
  return [...h, 1];
}

function warp(src, H, outW, outH) {
  const { width: sw, height: sh, data: sd } = src, out = new ImageData(outW, outH), od = out.data;
  for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
    const X = x + 0.5, Y = y + 0.5, z = H[6] * X + H[7] * Y + H[8];
    let u = (H[0] * X + H[1] * Y + H[2]) / z - 0.5, v = (H[3] * X + H[4] * Y + H[5]) / z - 0.5;
    u = Math.min(sw - 1.001, Math.max(0, u)); v = Math.min(sh - 1.001, Math.max(0, v));
    const x0 = u | 0, y0 = v | 0, fx = u - x0, fy = v - y0, i = (y0 * sw + x0) * 4, j = i + sw * 4, o = (y * outW + x) * 4;
    for (let c = 0; c < 3; c++) {
      od[o + c] = (sd[i + c] * (1 - fx) + sd[i + 4 + c] * fx) * (1 - fy) + (sd[j + c] * (1 - fx) + sd[j + 4 + c] * fx) * fy;
    }
    od[o + 3] = 255;
  }
  return out;
}

export async function analyzePhoto(file) {
  const bmp = await createImageBitmap(file);
  try {
    const s0 = Math.min(1, MAX_SRC / Math.max(bmp.width, bmp.height));
    const W = Math.round(bmp.width * s0), H = Math.round(bmp.height * s0);
    const ds = Math.min(1, DETECT_SIDE / Math.max(W, H));
    const quad = findQuad(P.getData(bmp, Math.round(W * ds), Math.round(H * ds)));
    if (!quad) return null;
    const q = quad.map(([x, y]) => [x / ds, y / ds]);
    const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const top = len(q[0], q[1]), bottom = len(q[3], q[2]), left = len(q[0], q[3]), right = len(q[1], q[2]);
    const landscape = top + bottom > left + right;
    const [wIn, hIn] = landscape ? [P.CARD_H_IN, P.CARD_W_IN] : [P.CARD_W_IN, P.CARD_H_IN];
    const pxPerIn = Math.max(top, bottom) / wIn, dpi = Math.round(Math.min(MAX_DPI, pxPerIn));
    const pad = Math.round(P.CROP_PAD_IN * dpi), cw = Math.round(wIn * dpi), ch = Math.round(hIn * dpi);
    const Hm = homography([[pad, pad], [pad + cw, pad], [pad + cw, pad + ch], [pad, pad + ch]], q);
    const img = warp(P.getData(bmp, W, H), Hm, cw + 2 * pad, ch + 2 * pad);
    const canvas = P.canvas(img.width, img.height);
    canvas.getContext("2d").putImageData(img, 0, 0);

    const warn = [];
    if (pxPerIn < 250) warn.push("Low detail — move the phone closer so the card fills more of the picture.");
    const tilt = Math.max(top / bottom, bottom / top, left / right, right / left);
    if (tilt > 1.12) warn.push("Taken at a steep angle — hold the phone flatter, directly above the card, for a more accurate reading.");
    // Blown-out pixels inside the border (white borders themselves don't count).
    let glare = 0, n = 0;
    const inset = pad + Math.round(0.25 * dpi);
    for (let y = inset; y < pad + ch - inset + pad; y += 4) for (let x = inset; x < pad + cw - inset + pad; x += 4) {
      const o = (y * img.width + x) * 4; n++;
      if (img.data[o] > 250 && img.data[o + 1] > 250 && img.data[o + 2] > 250) glare++;
    }
    if (n && glare / n > 0.03) warn.push("Possible glare on the card — tilt the light or move away from overhead lights.");

    const { boxes, regions } = P.detailRegions(img.width, img.height, dpi);
    let centering = null;
    try { centering = P.measureCentering(img, dpi); } catch { centering = null; }
    return { canvas, ok: true, dpi, centering, boxes, regions, warn, photo: true };
  } finally { bmp.close(); }
}
