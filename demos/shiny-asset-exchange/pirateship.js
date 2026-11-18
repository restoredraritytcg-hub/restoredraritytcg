// Shiny Asset Exchange demo — Pirate Ship shipping (product orders + card returns).
// Pirate Ship has no public label API: labels are bought in Pirate Ship from a spreadsheet upload, and tracking numbers
// come back from Pirate Ship's shipment export (or are pasted in by hand). This module builds that spreadsheet from
// everything that's ready to ship, and reads the export back to mark orders shipped / cards on their way home.
import { store, esc } from './data.js';
import * as PS from './portal/demostore.js';

export const PIRATE_SHIP_URL = 'https://ship.pirateship.com/';
export const DEFAULT_SHIPPING = {
  from: { name: 'Shiny Asset Exchange', line1: '17912 Majestic Elm Lane', line2: '', city: 'Elgin', state: 'TX', zip: '78621', phone: '(512) 981-5869' },
  boxes: [
    { key: 'card', name: 'Card return box (rigid) 7×5×2', l: 7, w: 5, h: 2, oz: 3 },
    { key: 'mailer', name: 'Padded mailer 6×9', l: 9, w: 6, h: 1, oz: 1 },
    { key: 'small', name: 'Small box 8×6×4', l: 8, w: 6, h: 4, oz: 4 },
    { key: 'medium', name: 'Medium box 12×10×6', l: 12, w: 10, h: 6, oz: 8 },
    { key: 'jug', name: 'Jug box 12×8×12', l: 12, w: 8, h: 12, oz: 14 },
  ],
  cardReturn: { box: 'card', per_card_oz: 0.5, insure: true, service: 'USPS Ground Advantage' },
};
export const shipCfg = () => ({ ...DEFAULT_SHIPPING, ...(store.content().shipping || {}) });

// ---------------- what's ready to ship ----------------
const valueOf = (notes) => parseFloat(((notes || '').match(/^(?:NM|Estimated|Card)?\s*value:\s*\$?\s*([\d,.]+)/mi) || [])[1]?.replace(/,/g, '') || '0') || 0;
/** Parse "Street, City ST 12345" (free text from older intakes) into fields. */
export function parseAddress(text) {
  const t = String(text || '').replace(/\n/g, ', ').trim();
  const m = t.match(/^(.*?),\s*([^,]+?),?\s+([A-Za-z]{2})\.?\s+(\d{5}(?:-\d{4})?)\s*$/);
  if (!m) return null;
  const [line1, ...rest] = m[1].split(/,\s*/);
  return { line1, line2: rest.join(', '), city: m[2], state: m[3].toUpperCase(), zip: m[4] };
}
export function returnAddressOf(s) {
  if (s.return_address && s.return_address.line1) return s.return_address;
  return parseAddress(((s.internal_notes || '').match(/^Return address:\s*(.+)$/mi) || [])[1]);
}
function boxForOrder(oz, cfg) {
  const k = oz >= 48 ? 'jug' : oz > 24 ? 'medium' : oz > 8 ? 'small' : 'mailer';
  return cfg.boxes.find((b) => b.key === k) || cfg.boxes[0];
}
/** Every shipment waiting for a label: paid product orders + restorations marked Ready that ship back. */
export function queue() {
  const cfg = shipCfg(), out = [];
  for (const o of store.orders().filter((x) => x.status === 'paid')) {
    const c = store.customer(o.customer_id) || {};
    const oz = o.items.reduce((t, i) => t + (store.variant(i.variant_id)?.weight_oz || 4) * i.qty, 0);
    const box = boxForOrder(oz, cfg);
    out.push({ kind: 'order', id: o.id, ref: o.number, name: o.ship?.name || c.name, email: o.email, phone: c.phone || '',
      address: o.ship, box: box.key, oz: Math.ceil(oz + box.oz), insured: 0, service: o.ship?.method_name || 'USPS Ground Advantage',
      contents: o.items.map((i) => `${i.qty}× ${i.title}${i.variant ? ' ' + i.variant : ''}`).join(', '), exported_at: o.exported_at || '' });
  }
  const d = PS.db();
  for (const s of d.submissions.filter((x) => x.status === 'ready' && !x.return_shipment && !/Delivery:\s*Drop-off/i.test(x.internal_notes || ''))) {
    const c = d.customers.find((x) => x.id === s.customer_id) || {}, cards = d.cards.filter((k) => k.submission_id === s.id);
    const box = cfg.boxes.find((b) => b.key === cfg.cardReturn.box) || cfg.boxes[0];
    const insure = /Insured return shipping:\s*No/i.test(s.internal_notes || '') ? false : cfg.cardReturn.insure;
    out.push({ kind: 'return', id: s.id, ref: s.code, name: c.name, email: c.email || '', phone: c.phone || '',
      address: returnAddressOf(s), box: box.key, oz: Math.ceil(box.oz + cards.length * cfg.cardReturn.per_card_oz),
      insured: insure ? Math.round(cards.reduce((t, k) => t + valueOf(k.customer_notes), 0)) : 0, service: cfg.cardReturn.service,
      contents: `${cards.length} restored trading card${cards.length === 1 ? '' : 's'}`, exported_at: s.exported_at || '' });
  }
  return out;
}

// ---------------- spreadsheet out ----------------
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const COLUMNS = ['Order ID', 'Name', 'Company', 'Address 1', 'Address 2', 'City', 'State', 'Zip', 'Country', 'Email', 'Phone',
  'Pounds', 'Ounces', 'Length', 'Width', 'Height', 'Insured Value', 'Rubber Stamp 1', 'Rubber Stamp 2', 'Requested Service', 'Contents'];
export function toCsv(rows) {
  const cfg = shipCfg();
  const lines = rows.map((r) => { const b = cfg.boxes.find((x) => x.key === r.box) || cfg.boxes[0], a = r.address || {};
    return [r.ref, r.name, '', a.line1, a.line2, a.city, a.state, a.zip, 'US', r.email, r.phone, Math.floor(r.oz / 16), r.oz % 16,
      b.l, b.w, b.h, r.insured || '', r.ref, r.kind === 'return' ? 'Card return' : 'Card care order', r.service, r.contents]; });
  return [COLUMNS, ...lines].map((l) => l.map(csvCell).join(',')).join('\r\n');
}
export function markExported(rows) {
  const at = new Date().toISOString();
  for (const r of rows) {
    if (r.kind === 'order') store.updateOrder(r.id, { exported_at: at }, 'Sent to Pirate Ship for a label');
    else { const s = PS.db().submissions.find((x) => x.id === r.id); if (s) { s.exported_at = at; PS.save(); } }
  }
}

// ---------------- tracking in ----------------
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}
export const carrierOf = (t) => /^1Z/i.test(String(t).replace(/\s/g, '')) ? 'UPS' : 'USPS';
export const trackingUrl = (t) => { const n = String(t).replace(/\s/g, ''); return carrierOf(n) === 'UPS' ? `https://www.ups.com/track?tracknum=${n}` : `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`; };
/** Match a Pirate Ship shipment export to waiting shipments. Column names are matched loosely
 *  (tracking / order ID or rubber stamp / recipient / service / cost), since they're chosen at upload. */
export function matchTracking(text) {
  const rows = parseCsv(text); if (rows.length < 2) return { error: 'That file has no rows.' };
  const H = rows[0].map((h) => h.trim().toLowerCase());
  const col = (re) => H.findIndex((h) => re.test(h));
  const ti = col(/tracking/), ri = col(/order\s*id|reference|rubber\s*stamp\s*1|^stamp|order\s*#|order number|memo/), ni = col(/^(recipient|name|ship to name|to name)/),
    si = col(/service|mail class|class/), ci = col(/cost|price|amount|total/);
  if (ti < 0) return { error: 'No tracking-number column found. In Pirate Ship, export your shipments (Reports → Shipments) and upload that file.' };
  const waiting = queue();
  const out = [];
  for (const r of rows.slice(1)) {
    const tracking = (r[ti] || '').trim(); if (!tracking) continue;
    const ref = ri >= 0 ? (r[ri] || '').trim() : '', name = ni >= 0 ? (r[ni] || '').trim() : '';
    const hit = waiting.find((w) => ref && (w.ref.toLowerCase() === ref.toLowerCase() || ('#' + ref) === w.ref))
      || (name ? waiting.filter((w) => (w.name || '').toLowerCase() === name.toLowerCase()) : []).find((w, _, a) => a.length === 1);
    out.push({ tracking, ref, name, service: si >= 0 ? r[si] : '', cost: ci >= 0 ? parseFloat(String(r[ci]).replace(/[^\d.]/g, '')) || 0 : 0, hit });
  }
  return { rows: out };
}

/** Record a label/tracking number: product order → Shipped; card return → Completed with the return tracking. */
export function markShipped(kind, id, { tracking, service = '', cost = 0 }) {
  const carrier = carrierOf(tracking), shipment = { carrier, service, tracking, cost, source: 'pirateship', shipped_at: new Date().toISOString() };
  if (kind === 'order') return store.updateOrder(id, { status: 'fulfilled', tracking: `${carrier} ${tracking}`, shipment }, `Shipped via Pirate Ship · ${carrier} ${tracking}`);
  const d = PS.db(), s = d.submissions.find((x) => x.id === id); if (!s) return;
  const now = new Date().toISOString();
  s.return_shipment = shipment; s.status = 'completed'; s.status_changed_at = now; s.updated_at = now;
  d.cards.filter((k) => k.submission_id === id).forEach((k) => { k.status = 'completed'; k.updated_at = now; });
  PS.save(); return s;
}
export const trackingLink = (sh) => sh && sh.tracking ? `<a class="link" href="${esc(trackingUrl(sh.tracking))}" target="_blank" rel="noopener">${esc(sh.carrier || carrierOf(sh.tracking))} ${esc(sh.tracking)}</a>` : '';
