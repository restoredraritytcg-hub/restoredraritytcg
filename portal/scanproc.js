// Browser version of the scanner app's image processing (cardcrop.py + detail.py):
// find cards on a flatbed scan, straighten and crop them, cut corner/edge close-ups
// and measure centering. Works on ImageData-like objects {width, height, data(RGBA)}.

export const CARD_W_IN = 2.5, CARD_H_IN = 3.5;
export const CROP_PAD_IN = 0.06;
export const DETECT_MAX_SIDE = 1400;
const CORNER_IN = 0.40, EDGE_IN = 0.22, OUTSIDE_IN = 0.06;
const CENTER_FROM_CORNER_IN = 0.5, SEARCH_IN = 0.75, DEFAULT_IN = 0.125;
export const STANDARD_DPI = [150, 200, 300, 400, 600, 800, 1200, 1600, 2400, 3200, 4800];

// ------------------------------------------------------------------ color
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
const f3 = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
// sRGB -> Lab scaled like OpenCV's 8-bit Lab (L 0..255, a/b offset 128) so thresholds match the desktop app.
function lab(r, g, b, out, o) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const X = (0.412453 * R + 0.357580 * G + 0.180423 * B) / 0.950456;
  const Y = 0.212671 * R + 0.715160 * G + 0.072169 * B;
  const Z = (0.019334 * R + 0.119193 * G + 0.950227 * B) / 1.088754;
  const fy = f3(Y);
  out[o] = (Y > 0.008856 ? 116 * fy - 16 : 903.3 * Y) * 255 / 100;
  out[o + 1] = 500 * (f3(X) - fy) + 128;
  out[o + 2] = 200 * (fy - f3(Z)) + 128;
}
function toLab(img) {
  const n = img.width * img.height, out = new Float32Array(n * 3), d = img.data;
  for (let i = 0, j = 0; i < n; i++, j += 4) lab(d[j], d[j + 1], d[j + 2], out, i * 3);
  return out;
}
function median(arr) { const a = Float32Array.from(arr).sort(); return a[a.length >> 1]; }

// ------------------------------------------------------------ binary ops
function boxCount(src, w, h, r, horizontal) {
  // number of set pixels in a (2r+1) window along one axis, window clamped to the image
  const out = new Int32Array(w * h);
  const [len, lines, step, lstep] = horizontal ? [w, h, 1, w] : [h, w, w, 1];
  for (let l = 0; l < lines; l++) {
    const base = l * lstep;
    let sum = 0;
    for (let k = 0; k <= Math.min(r, len - 1); k++) sum += src[base + k * step];
    for (let i = 0; i < len; i++) {
      out[base + i * step] = sum;
      const add = i + r + 1, rem = i - r;
      if (add < len) sum += src[base + add * step];
      if (rem >= 0) sum -= src[base + rem * step];
    }
  }
  return out;
}
function morph(mask, w, h, size, dilate) {
  const r = (size - 1) >> 1;
  const pass = (m, horizontal) => {
    const c = boxCount(m, w, h, r, horizontal), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, p = horizontal ? x : y, len = horizontal ? w : h;
      const win = Math.min(len - 1, p + r) - Math.max(0, p - r) + 1;
      out[i] = dilate ? (c[i] > 0 ? 1 : 0) : (c[i] === win ? 1 : 0);
    }
    return out;
  };
  return pass(pass(mask, true), false);
}
function fillHoles(mask, w, h) {
  const seen = new Uint8Array(w * h), stack = [];
  const push = (i) => { if (!mask[i] && !seen[i]) { seen[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1); if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w); if (y < h - 1) push(i + w);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = seen[i] ? 0 : 1;
  return out;
}
function otsu(v) {
  const hist = new Float64Array(256); for (const x of v) hist[x]++;
  const n = v.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0, sB = 0, best = 0, t = 0;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue; const wF = n - wB; if (!wF) break;
    sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; t = i; }
  }
  return t;
}

// Mask of everything that differs from the background (lid or backing sheet), holes filled.
export function foregroundMask(img) {
  const { width: w, height: h } = img, L = toLab(img);
  const b = Math.max(2, Math.floor(Math.min(h, w) * 0.02));
  const ch = [[], [], []];
  const take = (x, y) => { const o = (y * w + x) * 3; ch[0].push(L[o]); ch[1].push(L[o + 1]); ch[2].push(L[o + 2]); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (y < b || y >= h - b || x < b || x >= w - b) take(x, y);
  const bg = ch.map(median);
  const d8 = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 3, dist = Math.hypot(L[o] - bg[0], L[o + 1] - bg[1], L[o + 2] - bg[2]);
    d8[i] = Math.min(255, Math.floor(dist * 2));
  }
  // Otsu alone can land above a dark card border (Pokémon backs on a black sheet), so cap it just above
  // the backing sheet's own variation, measured on the same outer band. Each side is measured on its own
  // and the quietest one wins, so a card touching one edge of the scan doesn't count as "background".
  const p99 = (vals) => { vals.sort((p, q) => p - q); return vals[Math.floor(vals.length * 0.99)]; };
  const strip = (x0, y0, x1, y1) => { const v = []; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) v.push(d8[y * w + x]); return v; };
  const noise = Math.min(p99(strip(0, 0, w, b)), p99(strip(0, h - b, w, h)), p99(strip(0, 0, b, h)), p99(strip(w - b, 0, w, h)));
  const t = Math.max(40, Math.min(otsu(d8), noise + 20));
  let m = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) m[i] = d8[i] > t ? 1 : 0;
  const k = Math.max(3, Math.floor(Math.min(h, w) * 0.006)) | 1;
  m = morph(morph(m, w, h, k * 3, true), w, h, k * 3, false);   // close
  m = morph(morph(m, w, h, k, false), w, h, k, true);           // open
  return fillHoles(m, w, h);
}

// ------------------------------------------------------------- geometry
export function components(mask, w, h) {
  const label = new Int32Array(w * h), comps = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || label[s]) continue;
    const id = comps.length + 1, stack = [s], pts = [];
    let area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    label[s] = id;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i / w) | 0;
      area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      let edge = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) { edge = true; continue; }
        const j = ny * w + nx;
        if (!mask[j]) { edge = true; continue; }
        if (!label[j]) { label[j] = id; stack.push(j); }
      }
      if (edge) pts.push([x, y]);
    }
    comps.push({ area, pts, bbox: [x0, y0, x1 - x0 + 1, y1 - y0 + 1] });
  }
  return comps;
}
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
// Minimum-area rectangle, normalized so the angle is within ±45° (card stays upright).
export function minAreaRect(points) {
  const H = hull(points);
  let best = null;
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!len) continue;
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, vx = -uy, vy = ux;
    let mnU = Infinity, mxU = -Infinity, mnV = Infinity, mxV = -Infinity;
    for (const q of H) {
      const u = q[0] * ux + q[1] * uy, v = q[0] * vx + q[1] * vy;
      if (u < mnU) mnU = u; if (u > mxU) mxU = u; if (v < mnV) mnV = v; if (v > mxV) mxV = v;
    }
    const area = (mxU - mnU) * (mxV - mnV);
    if (!best || area < best.area) {
      const cu = (mnU + mxU) / 2, cvv = (mnV + mxV) / 2;
      best = { area, cx: cu * ux + cvv * vx, cy: cu * uy + cvv * vy, w: mxU - mnU, h: mxV - mnV, angle: Math.atan2(uy, ux) };
    }
  }
  if (!best) return null;
  // normalize: rotate by multiples of 90° until |angle| <= 45°
  let { angle, w, h } = best;
  while (angle > Math.PI / 4) { angle -= Math.PI / 2; [w, h] = [h, w]; }
  while (angle <= -Math.PI / 4) { angle += Math.PI / 2; [w, h] = [h, w]; }
  // pixel centers -> pixel extent (+1), like OpenCV's contour-based rect on edges
  return { cx: best.cx + 0.5, cy: best.cy + 0.5, w: w + 1, h: h + 1, angle, area: (w + 1) * (h + 1) };
}

// ------------------------------------------------------- canvas helpers
export function canvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
}
export function getData(src, w, h) {
  const c = canvas(w, h), x = c.getContext("2d", { willReadFrequently: true });
  x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, w, h);
  return x.getImageData(0, 0, w, h);
}
function scaledData(src, sw, sh, maxSide) {
  const s = Math.min(1, maxSide / Math.max(sw, sh));
  return { img: getData(src, Math.max(1, Math.round(sw * s)), Math.max(1, Math.round(sh * s))), s };
}

// ------------------------------------------------------------- detection
// Find cards on a scan. src: ImageBitmap/canvas of the whole scan (W x H). Returns rects in full px,
// sorted top-to-bottom then left-to-right, plus the dpi actually used.
export function detectCards(src, W, H, dpi, maxCards = 2) {
  const { img, s } = scaledData(src, W, H, DETECT_MAX_SIDE);
  const mask = foregroundMask(img);
  const comps = components(mask, img.width, img.height);
  const rects = comps.filter((c) => c.pts.length >= 8).map((c) => ({ c, r: minAreaRect(c.pts) })).filter((x) => x.r);
  const pick = (dpiUse) => {
    const eff = dpiUse * s, expected = CARD_W_IN * CARD_H_IN * eff * eff;
    return rects.filter(({ r }) => r.area >= expected * 0.35 && r.area <= expected * 4);
  };
  let used = dpi, found = pick(dpi);
  if (!found.length) {
    // dpi unknown or wrong: accept card-shaped objects and work the dpi out from their size
    const cand = rects.filter(({ r }) => {
      const ar = Math.max(r.w, r.h) / Math.min(r.w, r.h);
      return r.area > img.width * img.height * 0.01 && ar > 1.25 && ar < 1.6;
    });
    if (cand.length) {
      const big = cand.sort((a, b) => b.r.area - a.r.area)[0].r;
      used = snapDpi(Math.min(big.w, big.h) / s / CARD_W_IN) || Math.round(Math.min(big.w, big.h) / s / CARD_W_IN);
      found = pick(used);
    }
  }
  found.sort((a, b) => b.r.area - a.r.area);
  found = found.slice(0, maxCards);
  const rowH = CARD_H_IN * used * 0.6;
  const out = found.map(({ c, r }) => {
    const [x, y, w, h] = c.bbox.map((v) => v / s);
    return { box: [x, y, w, h], rect: { cx: r.cx / s, cy: r.cy / s, w: r.w / s, h: r.h / s, angle: r.angle } };
  });
  out.sort((a, b) => Math.round((a.box[1] + a.box[3] / 2) / rowH) - Math.round((b.box[1] + b.box[3] / 2) / rowH)
    || a.box[0] - b.box[0]);
  return { cards: out, dpi: used };
}

export function snapDpi(v) {
  for (const d of STANDARD_DPI) if (Math.abs(v - d) / d < 0.08) return d;
  return null;
}

// Straighten + crop the largest card in a region canvas. Returns {canvas, ok, cardWpx}.
export function cropCard(region, rw, rh, dpi, padIn = CROP_PAD_IN) {
  const { img, s } = scaledData(region, rw, rh, DETECT_MAX_SIDE);
  const mask = foregroundMask(img);
  const comps = components(mask, img.width, img.height);
  if (!comps.length) return { canvas: region, ok: false };
  const c = comps.sort((a, b) => b.area - a.area)[0];
  const eff = dpi * s;
  if (c.area < CARD_W_IN * CARD_H_IN * eff * eff * 0.3) return { canvas: region, ok: false };
  const r = minAreaRect(c.pts);
  const pad = padIn * dpi;
  const cw = r.w / s, ch = r.h / s;
  const outW = Math.round(cw + 2 * pad), outH = Math.round(ch + 2 * pad);
  const out = canvas(outW, outH), x = out.getContext("2d", { willReadFrequently: true });
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
  x.translate(outW / 2, outH / 2); x.rotate(-r.angle); x.translate(-r.cx / s, -r.cy / s);
  x.drawImage(region, 0, 0);
  return { canvas: out, ok: true, cardWpx: Math.min(cw, ch) };
}

// ---------------------------------------------------- close-up regions
export const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"];
export const EDGES = ["top", "right", "bottom", "left"];
export function detailRegions(w, h, dpi, padIn = CROP_PAD_IN) {
  const p = Math.round(padIn * dpi), x0 = p, y0 = p, x1 = w - p, y1 = h - p;
  const c = Math.round(CORNER_IN * dpi), e = Math.round(EDGE_IN * dpi), o = Math.round(OUTSIDE_IN * dpi);
  const R = {
    "top-left": [x0 - o, y0 - o, x0 + c, y0 + c], "top-right": [x1 - c, y0 - o, x1 + o, y0 + c],
    "bottom-right": [x1 - c, y1 - c, x1 + o, y1 + o], "bottom-left": [x0 - o, y1 - c, x0 + c, y1 + o],
    "top": [x0 - o, y0 - o, x1 + o, y0 + e], "right": [x1 - e, y0 - o, x1 + o, y1 + o],
    "bottom": [x0 - o, y1 - e, x1 + o, y1 + o], "left": [x0 - o, y0 - o, x0 + e, y1 + o],
  };
  const regions = {}, boxes = {};
  for (const [k, [a, b, cc, d]] of Object.entries(R)) {
    const ra = Math.max(0, a), rb = Math.max(0, b), rc = Math.min(w, cc), rd = Math.min(h, d);
    regions[k] = [ra, rb, rc - ra, rd - rb];
    const r4 = (v) => Math.round(v * 1e4) / 1e4;
    boxes[k] = [r4(ra / w), r4(rb / h), r4(rc / w), r4(rd / h)];
  }
  return { regions, boxes };
}

// --------------------------------------------------------------- centering
const LINE_SPECS = (x0, y0, x1, y1, d) => ({
  "top@left": ["y", x0 + d, y0, 1], "top@right": ["y", x1 - d, y0, 1],
  "bottom@left": ["y", x0 + d, y1, -1], "bottom@right": ["y", x1 - d, y1, -1],
  "left@top": ["x", y0 + d, x0, 1], "left@bottom": ["x", y1 - d, x0, 1],
  "right@top": ["x", y0 + d, x1, -1], "right@bottom": ["x", y1 - d, x1, -1],
});

// Mean Lab along a line: axis "y" = a vertical band at column pos (indexed by y); "x" = horizontal band.
function bandProfile(img, axis, pos, hw) {
  const { width: w, height: h, data } = img, len = axis === "y" ? h : w;
  const out = new Float32Array(len * 3), tmp = new Float32Array(3);
  const a0 = Math.max(0, pos - hw), a1 = Math.min((axis === "y" ? w : h) - 1, pos + hw), n = a1 - a0 + 1;
  for (let i = 0; i < len; i++) {
    let L = 0, A = 0, B = 0;
    for (let a = a0; a <= a1; a++) {
      const j = axis === "y" ? (i * w + a) * 4 : (a * w + i) * 4;
      lab(data[j], data[j + 1], data[j + 2], tmp, 0); L += tmp[0]; A += tmp[1]; B += tmp[2];
    }
    out[i * 3] = L / n; out[i * 3 + 1] = A / n; out[i * 3 + 2] = B / n;
  }
  // light smoothing along the line (matches the desktop app's 3x3 blur)
  const sm = new Float32Array(out.length);
  for (let i = 0; i < len; i++) for (let c = 0; c < 3; c++) {
    const p = Math.max(0, i - 1), q = Math.min(len - 1, i + 1);
    sm[i * 3 + c] = 0.25 * out[p * 3 + c] + 0.5 * out[i * 3 + c] + 0.25 * out[q * 3 + c];
  }
  return { seq: sm, len };
}

function detectLine(prof, outerNom, dir, dpi) {
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
  const outerK = argmax(1, Math.min(n - 2, 2 * back));
  const s = Math.max(2, Math.round(0.015 * dpi));
  const b0 = outerK + Math.max(2, Math.round(0.02 * dpi)), b1 = outerK + Math.max(4, Math.round(0.05 * dpi));
  const border = [0, 1, 2].map((c) => median(Array.from({ length: b1 - b0 }, (_, t) => arr[(b0 + t) * 3 + c])));
  const dist = new Float32Array(n);
  for (let k = 0; k < n; k++) dist[k] = Math.hypot(arr[k * 3] - border[0], arr[k * 3 + 1] - border[1], arr[k * 3 + 2] - border[2]);
  let mean = 0; for (let k = b0; k < b1; k++) mean += dist[k]; mean /= (b1 - b0);
  let v = 0; for (let k = b0; k < b1; k++) v += (dist[k] - mean) ** 2;
  const spread = Math.sqrt(v / (b1 - b0));
  const toPx = (k) => outerNom + dir * (k - back);
  const fallback = () => [toPx(outerK), toPx(outerK + Math.round(DEFAULT_IN * dpi)), false];
  if (spread > 10) return fallback();
  const thr = Math.max(22, 6 * spread);
  const start = outerK + Math.max(3, Math.round(0.035 * dpi));
  for (let k = start; k < n - s; k++) {
    let mn = Infinity; for (let t = k; t < k + s; t++) mn = Math.min(mn, dist[t]);
    if (mn > thr) {
      const w0 = Math.max(start - 1, k - s), w1 = Math.min(n - 2, k + Math.max(1, s >> 1));
      return [toPx(outerK), toPx(argmax(w0, w1)), true];
    }
  }
  return fallback();
}

export function centeringSummary(wIn, hIn, lines) {
  const size = { y: hIn, x: wIn }, widths = {};
  for (const [k, l] of Object.entries(lines)) widths[k] = Math.abs(l.inner - l.outer) * size[l.axis];
  const avg = (side) => { const a = Object.keys(widths).filter((k) => k.startsWith(side + "@")).map((k) => widths[k]);
    return a.reduce((s, x) => s + x, 0) / a.length; };
  const L = avg("left"), R = avg("right"), T = avg("top"), B = avg("bottom");
  const r1 = (x) => Math.round(x * 10) / 10, r4 = (x) => Math.round(x * 1e4) / 1e4;
  const lr = L + R ? r1(100 * L / (L + R)) : null, tb = T + B ? r1(100 * T / (T + B)) : null;
  const check = ["top", "bottom", "left", "right"].filter((side) => {
    const [a, b] = side === "top" || side === "bottom" ? [side + "@left", side + "@right"] : [side + "@top", side + "@bottom"];
    return Math.abs(widths[a] - widths[b]) > 0.025;
  });
  return {
    widths_in: Object.fromEntries(Object.entries(widths).map(([k, v]) => [k, r4(v)])), check,
    left_in: r4(L), right_in: r4(R), top_in: r4(T), bottom_in: r4(B),
    lr: lr == null ? null : [lr, r1(100 - lr)], tb: tb == null ? null : [tb, r1(100 - tb)],
    all_found: Object.values(lines).every((l) => l.found !== false) && !check.length,
  };
}

export function measureCentering(img, dpi, padIn = CROP_PAD_IN) {
  const { width: w, height: h } = img;
  const p = Math.round(padIn * dpi), d = Math.round(CENTER_FROM_CORNER_IN * dpi), hw = Math.max(1, Math.round(0.03 * dpi));
  const specs = LINE_SPECS(p, p, w - 1 - p, h - 1 - p, d), lines = {};
  const r5 = (x) => Math.round(x * 1e5) / 1e5;
  for (const [name, [axis, pos, outer, dir]] of Object.entries(specs)) {
    const prof = bandProfile(img, axis, pos, hw);
    const [o, i, found] = detectLine(prof, outer, dir, dpi);
    const along = axis === "y" ? h : w, across = axis === "y" ? w : h;
    lines[name] = { axis, pos: r5(pos / across), outer: r5((o + 0.5) / along), inner: r5((i + 0.5) / along), found };
  }
  const wIn = w / dpi, hIn = h / dpi;
  return { w_in: Math.round(wIn * 1e4) / 1e4, h_in: Math.round(hIn * 1e4) / 1e4, lines, auto: true,
           summary: centeringSummary(wIn, hIn, lines) };
}

// ------------------------------------------------------------ dpi metadata
// Reads the resolution stored in a PNG (pHYs) or JPEG (JFIF / EXIF) file. Returns null if absent.
export async function fileDpi(file) {
  const buf = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
  try {
    if (buf.getUint32(0) === 0x89504e47) {          // PNG
      let o = 8;
      while (o + 8 < buf.byteLength) {
        const len = buf.getUint32(o), type = buf.getUint32(o + 4);
        if (type === 0x70485973 && buf.getUint8(o + 16) === 1) return Math.round(buf.getUint32(o + 8) * 0.0254);
        if (type === 0x49444154) break;              // IDAT: no pHYs before image data
        o += 12 + len;
      }
    } else if (buf.getUint16(0) === 0xffd8) {        // JPEG
      let o = 2;
      while (o + 4 < buf.byteLength) {
        const marker = buf.getUint16(o), len = buf.getUint16(o + 2);
        if (marker === 0xffe0 && buf.getUint32(o + 4) === 0x4a464946) {   // JFIF
          const units = buf.getUint8(o + 11), xd = buf.getUint16(o + 12);
          if (units === 1 && xd > 1) return xd;
          if (units === 2 && xd > 1) return Math.round(xd * 2.54);
        }
        if (marker === 0xffe1 && buf.getUint32(o + 4) === 0x45786966) {   // EXIF
          const t = o + 10, le = buf.getUint16(t) === 0x4949;
          const u16 = (p) => buf.getUint16(t + p, le), u32 = (p) => buf.getUint32(t + p, le);
          const ifd = u32(4), n = u16(ifd);
          let xres = null, unit = 2;
          for (let i = 0; i < n; i++) {
            const e = ifd + 2 + i * 12, tag = u16(e);
            if (tag === 0x011a) { const vo = u32(e + 8); xres = u32(vo) / (u32(vo + 4) || 1); }
            if (tag === 0x0128) unit = u16(e + 8);
          }
          if (xres && xres > 1) return Math.round(unit === 3 ? xres * 2.54 : xres);
        }
        if ((marker & 0xff00) !== 0xff00) break;
        o += 2 + len;
      }
    }
  } catch { /* unreadable header: fall back to the default */ }
  return null;
}
