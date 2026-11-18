// Shiny Asset Exchange demo — shipping built around Shippo (product orders + card returns).
//
// Shippo's API: create a shipment (from/to/parcel) → rates; buy a rate (transaction) → label PDF + tracking number;
// tracking updates arrive by webhook (event "track_updated"); unused labels can be refunded (voided).
// The Shippo API token is secret, so live calls go through a server function (server/supabase/functions/shippo).
// In this demo, `shippo` simulates those calls in the browser (like the Stripe test-card form): plausible rates,
// test labels marked "SAMPLE", and a "carrier scan" button that plays the role of Shippo's tracking webhook.
import { store, esc, money } from './data.js';
import * as PS from './portal/demostore.js';

export const DEFAULT_SHIPPING = {
  from: { name: 'Shiny Asset Exchange', company: '', line1: '17912 Majestic Elm Lane', line2: '', city: 'Elgin', state: 'TX', zip: '78621', phone: '(512) 981-5869', email: 'shinyassetexchange@gmail.com' },
  boxes: [
    { key: 'card', name: 'Card return box (rigid) 7×5×2', l: 7, w: 5, h: 2, oz: 3 },
    { key: 'mailer', name: 'Padded mailer 6×9', l: 9, w: 6, h: 1, oz: 1 },
    { key: 'small', name: 'Small box 8×6×4', l: 8, w: 6, h: 4, oz: 4 },
    { key: 'medium', name: 'Medium box 12×10×6', l: 12, w: 10, h: 6, oz: 8 },
    { key: 'jug', name: 'Jug box 12×8×12', l: 12, w: 8, h: 12, oz: 14 },
  ],
  cardReturn: { box: 'card', per_card_oz: 0.5, insure: true, prefer: 'USPS Ground Advantage' },
  shippo: { mode: 'demo', function_url: '', label_format: 'PDF_4x6', checkout_rates: 'flat' },
};
export const shipCfg = () => { const c = store.content().shipping || {}; return { ...DEFAULT_SHIPPING, ...c, shippo: { ...DEFAULT_SHIPPING.shippo, ...(c.shippo || {}) }, cardReturn: { ...DEFAULT_SHIPPING.cardReturn, ...(c.cardReturn || {}) } }; };

// ---------------- what's waiting for a label ----------------
const valueOf = (notes) => parseFloat(((notes || '').match(/^(?:NM|Estimated|Card)?\s*value:\s*\$?\s*([\d,.]+)/mi) || [])[1]?.replace(/,/g, '') || '0') || 0;
/** "Street, City ST 12345" (free text from older intakes) → fields. */
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
const boxForOrder = (oz, cfg) => cfg.boxes.find((b) => b.key === (oz >= 48 ? 'jug' : oz > 24 ? 'medium' : oz > 8 ? 'small' : 'mailer')) || cfg.boxes[0];
export const shipsBack = (s) => !/Delivery:\s*Drop-off/i.test(s.internal_notes || '');

/** One shipment row for a card return (used by the queue and the portal's Return shipping panel). */
export function returnRow(s) {
  const cfg = shipCfg(), d = PS.db(), c = d.customers.find((x) => x.id === s.customer_id) || {}, cards = d.cards.filter((k) => k.submission_id === s.id);
  const box = cfg.boxes.find((b) => b.key === cfg.cardReturn.box) || cfg.boxes[0];
  const insure = /Insured return shipping:\s*No/i.test(s.internal_notes || '') ? false : cfg.cardReturn.insure;
  return { kind: 'return', id: s.id, ref: s.code, name: c.name, email: c.email || '', phone: c.phone || '', address: returnAddressOf(s),
    box: box.key, oz: Math.ceil(box.oz + cards.length * cfg.cardReturn.per_card_oz), insured: insure ? Math.round(cards.reduce((t, k) => t + valueOf(k.customer_notes), 0)) : 0,
    prefer: cfg.cardReturn.prefer, contents: `${cards.length} restored trading card${cards.length === 1 ? '' : 's'}` };
}
/** Paid product orders + restorations marked Ready that ship back, without a label yet. */
export function queue() {
  const cfg = shipCfg(), out = [];
  for (const o of store.orders().filter((x) => x.status === 'paid' && !x.shipment)) {
    const c = store.customer(o.customer_id) || {};
    const oz = o.items.reduce((t, i) => t + (store.variant(i.variant_id)?.weight_oz || 4) * i.qty, 0), box = boxForOrder(oz, cfg);
    out.push({ kind: 'order', id: o.id, ref: o.number, name: o.ship?.name || c.name, email: o.email, phone: c.phone || '', address: o.ship,
      box: box.key, oz: Math.ceil(oz + box.oz), insured: 0, prefer: o.ship?.method_name || 'USPS Ground Advantage',
      contents: o.items.map((i) => `${i.qty}× ${i.title}${i.variant ? ' ' + i.variant : ''}`).join(', ') });
  }
  for (const s of PS.db().submissions.filter((x) => x.status === 'ready' && !x.return_shipment && shipsBack(x))) out.push(returnRow(s));
  return out;
}
export const addressOk = (a) => !!(a && a.line1 && a.city && a.state && a.zip);

// ---------------- Shippo client ----------------
const r2 = (n) => Math.round(n * 100) / 100;
function zone(fromZip, toZip) { const a = +String(fromZip).slice(0, 3) || 786, b = +String(toZip).slice(0, 3) || 786; return Math.min(8, Math.max(1, 1 + Math.round(Math.abs(a - b) / 110))); }
const SERVICES = [
  { provider: 'USPS', name: 'Ground Advantage', token: 'usps_ground_advantage', days: [2, 5], f: (oz, z) => 4.6 + 0.17 * oz + 0.32 * z },
  { provider: 'USPS', name: 'Priority Mail', token: 'usps_priority', days: [1, 3], f: (oz, z) => 8.1 + 0.09 * oz + 0.55 * z },
  { provider: 'USPS', name: 'Priority Mail Express', token: 'usps_priority_express', days: [1, 2], f: (oz, z) => 27.9 + 0.12 * oz + 1.1 * z },
  { provider: 'UPS', name: 'Ground Saver', token: 'ups_ground_saver', days: [3, 6], f: (oz, z) => 9.4 + 0.11 * oz + 0.45 * z },
  { provider: 'UPS', name: 'Ground', token: 'ups_ground', days: [1, 5], f: (oz, z) => 11.3 + 0.14 * oz + 0.7 * z },
];
const rid = (p) => p + '_' + Math.random().toString(36).slice(2, 12);
const digits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
async function callFunction(action, body) {
  const cfg = shipCfg();
  if (!cfg.shippo.function_url) throw new Error('Shippo isn’t connected yet: set the shipping function address in Prices & shop settings → Shippo.');
  const res = await fetch(cfg.shippo.function_url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(window.SAE_AUTH ? { Authorization: 'Bearer ' + window.SAE_AUTH } : {}) },
    body: JSON.stringify({ action, ...body }) });
  const out = await res.json().catch(() => null);
  if (!res.ok || !out || out.error) throw new Error((out && out.error) || `The shipping function answered ${res.status}.`);
  return out;
}
const live = () => shipCfg().shippo.mode !== 'demo';

export const shippo = {
  /** Rates for one parcel (Shippo: POST /shipments, async false). */
  async rates(row, quote = false) {
    const cfg = shipCfg(), box = cfg.boxes.find((b) => b.key === row.box) || cfg.boxes[0];
    const shipment = { address_from: cfg.from, address_to: { name: row.name, ...row.address, email: row.email, phone: row.phone },
      parcel: { length: box.l, width: box.w, height: box.h, distance_unit: 'in', weight: row.oz, mass_unit: 'oz' },
      insurance: row.insured ? { amount: row.insured, currency: 'USD', content: row.contents } : null, metadata: row.ref };
    if (live()) return (await callFunction(quote ? 'quote' : 'rates', { shipment })).rates;
    await new Promise((r) => setTimeout(r, 350));
    const z = zone(cfg.from.zip, row.address?.zip), ins = row.insured ? Math.max(1.0, r2(row.insured * 0.0085)) : 0;
    const rates = SERVICES.filter((s) => !(s.token === 'usps_ground_advantage' && row.oz > 1120)).map((s) => ({
      id: rid('rate'), provider: s.provider, service: s.name, token: s.token, amount: r2(s.f(row.oz, z) + ins), insurance: ins,
      days: s.days[0] + Math.min(s.days[1] - s.days[0], Math.floor(z / 3)), zone: z })).sort((a, b) => a.amount - b.amount);
    rates[0].tags = ['Cheapest']; const f = [...rates].sort((a, b) => a.days - b.days || a.amount - b.amount)[0]; f.tags = [...(f.tags || []), 'Fastest'];
    return rates;
  },
  /** Buy a rate (Shippo: POST /transactions) → tracking number + label. */
  async buy(row, rate) {
    if (live()) return callFunction('buy', { rate_id: rate.id, ref: row.ref, label_format: shipCfg().shippo.label_format });
    await new Promise((r) => setTimeout(r, 450));
    const tracking = rate.provider === 'UPS' ? '1Z' + Math.random().toString(36).slice(2, 8).toUpperCase() + digits(10) : '9400' + digits(18);
    const eta = new Date(Date.now() + rate.days * 864e5).toISOString();
    return { transaction: rid('txn'), tracking_number: tracking, label_url: '', eta, test: true };
  },
  /** Void an unused label (Shippo: POST /refunds). */
  async void(sh) { if (live()) return callFunction('void', { transaction: sh.transaction }); return { status: 'QUEUED' }; },
};

// ---------------- recording + tracking ----------------
export const STATUS = { PRE_TRANSIT: 'Label created', TRANSIT: 'In transit', OUT: 'Out for delivery', DELIVERED: 'Delivered', RETURNED: 'Returned to sender', FAILURE: 'Delivery problem', VOIDED: 'Label voided' };
export const trackingUrl = (sh) => { const n = String(sh.tracking).replace(/\s/g, ''); return sh.carrier === 'UPS' ? `https://www.ups.com/track?tracknum=${n}` : `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`; };
export const trackingLink = (sh) => sh && sh.tracking ? `<a class="link" href="${esc(trackingUrl(sh))}" target="_blank" rel="noopener">${esc(sh.carrier)} ${esc(sh.tracking)}</a>` : '';
export const statusLabel = (sh) => (sh.status === 'TRANSIT' && /out for delivery/i.test(sh.status_details || '')) ? STATUS.OUT : STATUS[sh.status] || sh.status;

function save(kind, id, sh, note) {
  if (kind === 'order') {
    const o = store.order(id);
    const patch = { shipment: sh, tracking: sh.status === 'VOIDED' ? '' : `${sh.carrier} ${sh.tracking}` };
    if (sh.status === 'VOIDED') patch.status = 'paid'; else if (o.status === 'paid') patch.status = 'fulfilled';
    return store.updateOrder(id, patch, note);
  }
  const d = PS.db(), s = d.submissions.find((x) => x.id === id); if (!s) return;
  const now = new Date().toISOString();
  s.return_shipment = sh.status === 'VOIDED' ? null : sh; s.updated_at = now;
  if (sh.status === 'DELIVERED' && s.status !== 'completed') {
    s.status = 'completed'; s.status_changed_at = now;
    d.cards.filter((k) => k.submission_id === id).forEach((k) => { k.status = 'completed'; k.updated_at = now; });
  }
  PS.save(); return s;
}
/** After a label is bought: product order → Shipped; card return → tracking on the customer's page. */
export function recordLabel(row, rate, t) {
  const sh = { carrier: rate.provider, service: `${rate.provider} ${rate.service}`, tracking: t.tracking_number, cost: rate.amount, insured: row.insured || 0,
    transaction: t.transaction, label_url: t.label_url || '', eta: t.eta, status: 'PRE_TRANSIT', status_details: 'Label created, not yet in system',
    events: [{ at: new Date().toISOString(), status: 'PRE_TRANSIT', details: 'Shipping label created', location: `${shipCfg().from.city}, ${shipCfg().from.state}` }],
    to: { name: row.name, ...row.address }, box: row.box, oz: row.oz, ref: row.ref, test: !!t.test, source: 'shippo', shipped_at: new Date().toISOString() };
  return save(row.kind, row.id, sh, `Label bought with Shippo · ${sh.service} · ${money(sh.cost)} · ${sh.tracking}`);
}
export async function voidLabel(kind, id, sh) {
  await shippo.void(sh);
  return save(kind, id, { ...sh, status: 'VOIDED' }, `Shippo label ${sh.tracking} voided (refund requested)`);
}
/** A tracking update — what Shippo's "track_updated" webhook does live. */
export function applyTracking(kind, id, sh, ev) {
  const next = { ...sh, status: ev.status, status_details: ev.details, events: [...(sh.events || []), { at: new Date().toISOString(), ...ev }] };
  return save(kind, id, next, ev.status === 'DELIVERED' ? `Delivered (${sh.tracking})` : '');
}
/** Demo only: the next carrier scan for a label. */
export function nextScan(sh) {
  const to = sh.to || {}, from = shipCfg().from;
  const n = (sh.events || []).length;
  return [
    { status: 'TRANSIT', details: `Accepted at ${sh.carrier} facility`, location: `${from.city}, ${from.state}` },
    { status: 'TRANSIT', details: 'In transit to next facility', location: sh.carrier === 'UPS' ? 'Austin, TX' : 'Austin, TX Distribution Center' },
    { status: 'TRANSIT', details: 'Out for delivery', location: `${to.city || ''}, ${to.state || ''}` },
    { status: 'DELIVERED', details: 'Delivered, front door/porch', location: `${to.city || ''}, ${to.state || ''}` },
  ][Math.min(n - 1, 3)];
}
/** Every label, newest first, for the Shipping page. */
export function shipped() {
  const o = store.orders().filter((x) => x.shipment && x.shipment.source === 'shippo').map((x) => ({ kind: 'order', id: x.id, ref: x.number, name: x.ship?.name, sh: x.shipment }));
  const s = PS.db().submissions.filter((x) => x.return_shipment).map((x) => ({ kind: 'return', id: x.id, ref: x.code, name: (PS.db().customers.find((c) => c.id === x.customer_id) || {}).name, sh: x.return_shipment }));
  return [...o, ...s].sort((a, b) => b.sh.shipped_at.localeCompare(a.sh.shipped_at));
}

/** A printable 4×6 label. Live: Shippo's label PDF (label_url). Demo: a sample label marked not valid for postage. */
export function openLabel(sh) {
  if (sh.label_url) { window.open(sh.label_url, '_blank', 'noopener'); return; }
  const f = shipCfg().from, t = sh.to || {}, bars = String(sh.tracking).replace(/\D/g, '').split('').map((d) => `<i style="width:${1 + (+d % 3)}px;margin-right:${1 + (+d % 2)}px"></i>`).join('');
  const w = window.open('', '_blank'); if (!w) return;
  w.document.write(`<!doctype html><title>Label ${esc(sh.tracking)}</title><style>
    body{margin:0;background:#ddd;font:14px/1.3 Arial,sans-serif}.l{width:4in;height:6in;margin:20px auto;background:#fff;border:1px solid #000;position:relative;padding:10px;box-sizing:border-box}
    .svc{font:900 26px Arial;border-bottom:3px solid #000;padding-bottom:6px;margin-bottom:8px}.from{font-size:11px}.to{margin:18px 0 0 24px;font-size:16px;font-weight:bold;text-transform:uppercase}
    .bc{display:flex;align-items:stretch;height:70px;margin:22px 0 6px}.bc i{background:#000;display:block}.trk{text-align:center;font:bold 14px monospace;letter-spacing:1px}
    .x{position:absolute;inset:0;display:grid;place-items:center;font:900 42px Arial;color:rgba(227,32,42,.28);transform:rotate(-30deg);pointer-events:none;text-align:center}
    @media print{body{background:#fff}.l{margin:0;border:0}}</style>
    <div class="l"><div class="svc">${esc(sh.service.toUpperCase())}</div><div class="from">${esc(f.name)}<br>${esc(f.line1)}<br>${esc(f.city)} ${esc(f.state)} ${esc(f.zip)}</div>
    <div class="to">${esc(t.name || '')}<br>${esc(t.line1 || '')}${t.line2 ? '<br>' + esc(t.line2) : ''}<br>${esc(t.city || '')} ${esc(t.state || '')} ${esc(t.zip || '')}</div>
    <div class="bc">${bars}</div><div class="trk">${esc(sh.carrier)} TRACKING # ${esc(sh.tracking)}</div>
    <p style="font-size:11px;margin-top:14px">Ref ${esc(sh.ref || '')} · ${esc(String(sh.oz))} oz${sh.insured ? ' · insured ' + money(sh.insured) : ''}</p>
    <div class="x">SAMPLE<br>NOT VALID<br>FOR POSTAGE</div></div><script>setTimeout(()=>print(),300)<\/script>`);
  w.document.close();
}

// ---------------- Pirate Ship spreadsheet (fallback) ----------------
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function pirateShipCsv(rows) {
  const cfg = shipCfg();
  const head = ['Order ID', 'Name', 'Address 1', 'Address 2', 'City', 'State', 'Zip', 'Country', 'Email', 'Phone', 'Pounds', 'Ounces', 'Length', 'Width', 'Height', 'Insured Value', 'Rubber Stamp 1', 'Contents'];
  const lines = rows.map((r) => { const b = cfg.boxes.find((x) => x.key === r.box) || cfg.boxes[0], a = r.address || {};
    return [r.ref, r.name, a.line1, a.line2, a.city, a.state, a.zip, 'US', r.email, r.phone, Math.floor(r.oz / 16), r.oz % 16, b.l, b.w, b.h, r.insured || '', r.ref, r.contents]; });
  return [head, ...lines].map((l) => l.map(csvCell).join(',')).join('\r\n');
}

// ---------------- shared "buy a label" widget (shop admin + work portal) ----------------
/** Renders rates → buy into `box` for one shipment row. opts: { btn: 'red'|'gold', onDone(row) } */
export async function rateWidget(box, row, opts = {}) {
  const btn = opts.btn || 'red';
  if (!addressOk(row.address)) { box.innerHTML = `<p class="err">Add the full ship-to address first.</p>`; return; }
  box.innerHTML = `<p class="muted small">Getting rates from Shippo…</p>`;
  let rates;
  try { rates = await shippo.rates(row); } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  const pre = rates.findIndex((r) => `${r.provider} ${r.service}` === row.prefer); let pick = pre >= 0 ? pre : 0;
  const draw = () => {
    box.innerHTML = `<div class="rates">${rates.map((r, i) => `<label class="rate ${i === pick ? 'on' : ''}"><input type="radio" name="rate-${esc(row.id)}" value="${i}" ${i === pick ? 'checked' : ''}>
        <span><b>${esc(r.provider)} ${esc(r.service)}</b>${(r.tags || []).map((t) => ` <em class="tag-${t.toLowerCase()}">${t}</em>`).join('')}<small>${r.days} business day${r.days === 1 ? '' : 's'}${r.insurance ? ` · incl. ${money(r.insurance)} insurance` : ''}</small></span>
        <strong>${money(r.amount)}</strong></label>`).join('')}</div>
      <div class="row" style="margin-top:10px;gap:8px"><button class="btn ${btn} sm" data-buy>Buy label · ${money(rates[pick].amount)}</button>
        <span class="small muted">${row.oz} oz · ${row.insured ? 'insured ' + money(row.insured) : 'not insured'}${shipCfg().shippo.mode === 'demo' ? ' · demo: no charge' : ''}</span></div>`;
    box.querySelectorAll('input[type=radio]').forEach((r) => r.onchange = () => { pick = +r.value; draw(); });
    box.querySelector('[data-buy]').onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = 'Buying label…';
      try { const t = await shippo.buy(row, rates[pick]); recordLabel(row, rates[pick], t); opts.onDone && opts.onDone(row); }
      catch (err) { e.target.disabled = false; e.target.textContent = 'Buy label'; box.insertAdjacentHTML('beforeend', `<p class="err">${esc(err.message)}</p>`); }
    };
  };
  draw();
}
