// Shared by the scan station and the admin portal: turn a scan file into straightened card crops,
// corner/edge close-ups and centering, and upload one side of one card to the portal.
import { api } from "./common.js";
import * as P from "./scanproc.js";

const pad3 = (n) => String(n).padStart(3, "0");

export function resized(src, maxSide) {
  const s = Math.min(1, maxSide / Math.max(src.width, src.height));
  const c = P.canvas(Math.max(1, Math.round(src.width * s)), Math.max(1, Math.round(src.height * s)));
  const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
function cropOf(src, [x, y, w, h]) {
  const c = P.canvas(Math.max(1, w), Math.max(1, h));
  c.getContext("2d").drawImage(src, x, y, w, h, 0, 0, w, h); return c;
}
export function toBlob(c, type, q) {
  return c.convertToBlob ? c.convertToBlob({ type, quality: q }) : new Promise((r) => c.toBlob(r, type, q));
}

// Finds up to maxCards cards in a scan. Each card: { canvas, ok, dpi, centering, boxes, regions, thumbUrl }.
export async function analyze(file, { maxCards = 1, defaultDpi = 1200 } = {}) {
  const meta = await P.fileDpi(file);
  const bmp = await createImageBitmap(file);
  try {
    const { cards, dpi } = P.detectCards(bmp, bmp.width, bmp.height, meta || defaultDpi, maxCards);
    const out = [];
    for (const c of cards) {
      const m = 0.25 * dpi, [x, y, w, h] = c.box;
      const x0 = Math.max(0, Math.floor(x - m)), y0 = Math.max(0, Math.floor(y - m));
      const x1 = Math.min(bmp.width, Math.ceil(x + w + m)), y1 = Math.min(bmp.height, Math.ceil(y + h + m));
      const reg = P.canvas(x1 - x0, y1 - y0);
      reg.getContext("2d").drawImage(bmp, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
      const cr = P.cropCard(reg, x1 - x0, y1 - y0, dpi);
      const cv = cr.canvas, W = cv.width, H = cv.height;
      let centering = null, boxes = {}, regions = {};
      if (cr.ok) {
        ({ boxes, regions } = P.detailRegions(W, H, dpi));
        try { centering = P.measureCentering(cv.getContext("2d").getImageData(0, 0, W, H), dpi); } catch { centering = null; }
      }
      const thumb = await toBlob(resized(cv, 520), "image/jpeg", 0.85);
      out.push({ canvas: cv, ok: cr.ok, dpi, centering, boxes, regions, thumbUrl: URL.createObjectURL(thumb) });
    }
    return { cards: out, dpi };
  } finally { bmp.close(); }
}

// The whole picture as the card image when no card edge is found (a photo, an odd scan):
// no close-ups and no centering.
export async function asIs(file, defaultDpi = 1200) {
  const bmp = await createImageBitmap(file);
  const cv = P.canvas(bmp.width, bmp.height);
  cv.getContext("2d").drawImage(bmp, 0, 0); bmp.close();
  return { canvas: cv, ok: false, dpi: (await P.fileDpi(file)) || defaultDpi, centering: null, boxes: {}, regions: {} };
}

const scanFiles = (f) => (f ? [f.web, f.thumb, ...Object.values(f.corners || {}), ...Object.values(f.edges || {})].filter(Boolean) : []);

// Uploads one side of one card (c from analyze/asIs) and saves its scans row, replacing any earlier
// scan of that stage/side and deleting the files it used. Returns the saved row.
export async function saveSide({ storageKey, code, card, stage, side, c, original, oldRow, webLong = 2400 }) {
  const ver = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const base = `s/${storageKey}/${code}/C${pad3(card.card_number)}/${stage}`;
  const put = async (name, canvasEl, q = 0.93) => api.putFile(`${base}/${name}_${ver}.jpg`, await toBlob(canvasEl, "image/jpeg", q));
  const files = { boxes: c.boxes, corners: {}, edges: {}, original };
  if (c.centering) files.centering = c.centering;
  const jobs = [
    put(`${side}_web`, resized(c.canvas, webLong), 0.9).then((p) => { files.web = p; }),
    put(`${side}_thumb`, resized(c.canvas, 420), 0.85).then((p) => { files.thumb = p; }),
  ];
  if (c.ok) for (const k of P.CORNERS) jobs.push(put(`corners/${side}_${k}`, cropOf(c.canvas, c.regions[k])).then((p) => { files.corners[k] = p; }));
  if (c.ok) for (const k of P.EDGES) jobs.push(put(`edges/${side}_${k}`, cropOf(c.canvas, c.regions[k])).then((p) => { files.edges[k] = p; }));
  await Promise.all(jobs);
  const row = await api.upsert("scans", { card_id: card.id, stage, side, dpi: c.dpi, files,
                                          scanned_at: new Date().toISOString() }, "card_id,stage,side");
  const keep = new Set(scanFiles(files));
  const stale = scanFiles(oldRow?.files).filter((p) => !keep.has(p));
  if (stale.length) api.removeFiles(stale).catch(() => {});
  return row;
}

// Deletes one scan (one stage/side of a card) and its files.
export async function deleteScan(row) {
  await api.remove("scans", row.id);
  await api.removeFiles(scanFiles(row.files)).catch(() => {});
}
