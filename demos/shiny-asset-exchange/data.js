// Shiny Asset Exchange demo — data layer.
// Demo mode keeps everything in this browser's localStorage so the shop, the cart, checkout,
// the customer's private link and the admin portal all share one "database".
// Swap `store` for a Supabase-backed version to go live (see README.md); the shape stays the same.
import { SEED_PRODUCTS } from './seed.js';

const KEY = 'sae-demo-v1';
const listeners = new Set();

export const STATUSES = {
  order: ['paid', 'fulfilled', 'refunded', 'cancelled'],
  submission: ['submitted', 'invoiced', 'paid', 'received', 'in_progress', 'restored', 'shipped', 'completed', 'cancelled'],
};
export const STATUS_LABEL = {
  paid: 'Paid', fulfilled: 'Shipped', refunded: 'Refunded', cancelled: 'Cancelled', unfulfilled: 'Unfulfilled',
  submitted: 'Submitted', invoiced: 'Invoice sent', received: 'Cards received', in_progress: 'In progress',
  restored: 'Restored', shipped: 'Shipped back', completed: 'Completed',
};
export const MOVE_REASONS = {
  sale: 'Sale', refund: 'Refund (restocked)', received: 'Stock received', damaged: 'Damaged / lost',
  count: 'Count correction', studio: 'Used in studio', cancel: 'Order cancelled (restocked)', new: 'New variant',
};

export const DEFAULT_CONTENT = {
  announcement: 'Welcome to Shiny Asset Exchange!',
  hero: { kicker: 'Revive Your Collection', title: 'Restore Your Cards. Restore Their Value.',
    sub: 'Professional card restoration. Professional Results.', line: 'Turn old cards into shiny new assets!' },
  bestseller: 'The hydration phase spray is the only one of its kind on the market. If you’re looking for a true hydration without the side effects, your search ends here.',
  prices: {
    tiers: [
      { name: 'Tier 1', min: 1, max: 499, price: 80 },
      { name: 'Tier 2', min: 500, max: 999, price: 150 },
      { name: 'Tier 3', min: 1000, max: 2000, price: 200 },
      { name: 'Tier 4', min: 2000, max: null, pct: 10 },
    ],
    cleaning: 20,
    addons: [
      { key: 'review', name: 'Card Review', price: 5, unit: 'card', desc: 'We assess your card from photos and tell you honestly what’s possible' },
      { key: 'grade', name: 'Estimated Grade', price: 10, unit: 'card', desc: 'Our estimate of what your card would likely grade at, including centering measurements with front and back ratios' },
      { key: 'slab', name: 'Slab Crack', price: 10, unit: 'slab', desc: 'Card safely removed from its slab' },
      { key: 'ship', name: 'Grade Prep & Ship', price: 20, unit: 'submission', desc: 'Packaged and shipped directly to the grading company of your choice' },
      { key: 'express', name: 'Express Lane', price: 50, unit: 'card', desc: 'Skip the line — moves your card to the front of the queue' },
    ],
  },
  capacity: 40,
  shop: { shipping: 5.99, free_over: 75, tax_rate: 8.25 },
  contact: { email: 'shinyassetexchange@gmail.com', phone: '(512) 981-5869',
    address: ['Shiny Asset Exchange', '17912 Majestic Elm Lane', 'Elgin, TX 78621'] },
  dropoff: { name: 'Home Town Cards & Collectibles', address: ['1514 Ed Bluestein Blvd, Suite 101', 'Austin, TX 78721'], phone: '(512) 876-9702' },
  payments: { provider: 'stripe', mode: 'demo', publishable_key: '' },
};

const uid = (p = '') => p + Math.random().toString(36).slice(2, 10);
export const token = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
const now = () => new Date().toISOString();
const daysAgo = d => new Date(Date.now() - d * 864e5).toISOString();

function seed() {
  const products = JSON.parse(JSON.stringify(SEED_PRODUCTS));
  const db = { v: 1, products, movements: [], orders: [], customers: [], submissions: [], content: JSON.parse(JSON.stringify(DEFAULT_CONTENT)),
    seq: { order: 1000, sub: 1040 }, created: now() };
  // opening stock
  for (const p of products) for (const v of p.variants)
    db.movements.push({ id: uid('m'), at: daysAgo(30), variant_id: v.id, delta: v.stock, after: v.stock, reason: 'received', note: 'Opening count', by: 'admin' });
  // sample customers, orders and submissions so the admin has something to show
  const c1 = addCustomer(db, { name: 'Sample Collector', email: 'collector@example.com', phone: '(512) 555-0142' });
  const c2 = addCustomer(db, { name: 'Demo Shop Owner', email: 'shop@example.com', phone: '(512) 555-0199' });
  const find = (h, i = 0) => { const p = products.find(x => x.handle === h); return { p, v: p.variants[i] }; };
  const mk = (cust, lines, days, status, extra = {}) => {
    const items = lines.map(([h, i, qty]) => { const { p, v } = find(h, i); return { variant_id: v.id, product_id: p.id, title: p.title, variant: v.title, price: v.price, qty, image: p.images[0] }; });
    const o = buildOrder(db, cust, items, { name: cust.name, line1: '100 Example St', city: 'Austin', state: 'TX', zip: '78701', country: 'US' });
    o.created = daysAgo(days); o.history = [{ at: o.created, status: 'paid', note: 'Paid by card ending 4242' }];
    o.status = status; Object.assign(o, extra);
    if (status === 'fulfilled') o.history.push({ at: daysAgo(days - 1), status: 'fulfilled', note: 'Shipped USPS ' + o.tracking });
    db.orders.push(o);
    for (const it of items) moveStock(db, it.variant_id, -it.qty, 'sale', o.number, '', o.created);
  };
  mk(c1, [['card-restoration-starter-kit', 0, 1], ['holo-serum', 1, 1]], 6, 'fulfilled', { tracking: '9400 1000 0000 0000 0001' });
  mk(c2, [['card-spray', 1, 2], ['micro-abrasive-polish', 1, 1], ['recharge-refresh-pack', 0, 4]], 2, 'paid');
  mk(c1, [['hydration-phase-spray', 0, 1]], 0, 'paid');
  const s = {
    id: uid('s'), code: 'SAE-' + (++db.seq.sub), customer_id: c1.id, created: daysAgo(4), status: 'received', delivery: 'ship',
    cards: [
      { id: uid('c'), name: 'Charizard', details: 'Base Set · 4/102 · 1999', value: 420, service: 'restoration', addons: ['grade'], damage: 'Light crease on the front, top right', status: 'in_progress' },
      { id: uid('c'), name: 'Blastoise', details: 'Base Set · 2/102 · 1999', value: 180, service: 'cleaning', addons: [], damage: 'Fingerprints and dust', status: 'received' },
    ],
    public_notes: 'Cards arrived safely. Charizard is on the press this week.', internal_notes: 'Seed data for the demo.',
    invoice: { status: 'paid', paid_at: daysAgo(4), total: 0 }, history: [], emailed_status: 'received',
  };
  s.invoice.total = quote(db.content.prices, s.cards).total;
  s.history = [{ at: daysAgo(6), status: 'submitted' }, { at: daysAgo(5), status: 'invoiced' }, { at: daysAgo(4), status: 'paid' }, { at: daysAgo(3), status: 'received' }];
  db.submissions.push(s);
  return db;
}

function addCustomer(db, { name, email, phone }) {
  const e = (email || '').trim().toLowerCase();
  let c = db.customers.find(x => e && x.email === e);
  if (!c) { c = { id: uid('cu'), name, email: e, phone: phone || '', token: token(), created: now(), notes: '' }; db.customers.push(c); }
  else { if (name) c.name = name; if (phone) c.phone = phone; }
  return c;
}

function buildOrder(db, cust, items, ship) {
  const t = totals(db.content.shop, items);
  return { id: uid('o'), number: '#' + (++db.seq.order), customer_id: cust.id, email: cust.email, created: now(), items, ship, ...t,
    status: 'paid', tracking: '', notes: '', history: [] };
}

function moveStock(db, variantId, delta, reason, ref = '', note = '', at = now(), by = 'system') {
  const v = variantById(db, variantId); if (!v) return;
  v.stock = Math.max(0, (v.stock || 0) + delta);
  db.movements.push({ id: uid('m'), at, variant_id: variantId, delta, after: v.stock, reason, ref, note, by });
}

function variantById(db, id) { for (const p of db.products) { const v = p.variants.find(x => x.id === id); if (v) return v; } return null; }

export function totals(shop, items) {
  const subtotal = round(items.reduce((s, i) => s + i.price * i.qty, 0));
  const shipping = !items.length ? 0 : (shop.free_over && subtotal >= shop.free_over ? 0 : +shop.shipping || 0);
  const tax = round(subtotal * (+shop.tax_rate || 0) / 100);
  return { subtotal, shipping, tax, total: round(subtotal + shipping + tax) };
}
const round = n => Math.round(n * 100) / 100;

// Restoration quote, same rules as the Pricing page.
export function tierFor(prices, value) {
  const v = +value || 0;
  return prices.tiers.find(t => v >= t.min && (t.max == null || v <= t.max)) || prices.tiers[0];
}
export function cardPrice(prices, card) {
  let base = 0;
  if (card.service === 'restoration') { const t = tierFor(prices, card.value); base = t.pct ? round((+card.value || 0) * t.pct / 100) : t.price; }
  else if (card.service === 'cleaning') base = prices.cleaning;
  const add = (card.addons || []).map(k => prices.addons.find(a => a.key === k)).filter(a => a && a.unit !== 'submission')
    .reduce((s, a) => s + a.price, 0);
  return { base, addons: add, total: round(base + add) };
}
export function quote(prices, cards) {
  const lines = cards.map(c => ({ card: c, ...cardPrice(prices, c) }));
  const sub = prices.addons.filter(a => a.unit === 'submission' && cards.some(c => (c.addons || []).includes(a.key)));
  const total = round(lines.reduce((s, l) => s + l.total, 0) + sub.reduce((s, a) => s + a.price, 0));
  return { lines, perSubmission: sub, total };
}

// ---------- persistence ----------
let cache = null;
function load() {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { cache = null; }
  if (!cache || cache.v !== 1) { cache = seed(); save(); }
  return cache;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {} listeners.forEach(f => f()); }
window.addEventListener('storage', e => { if (e.key === KEY) { cache = null; listeners.forEach(f => f()); } });

export const store = {
  onChange(f) { listeners.add(f); return () => listeners.delete(f); },
  reset() { cache = seed(); save(); },
  db: () => load(),
  content: () => load().content,
  saveContent(patch) { const db = load(); db.content = { ...db.content, ...patch }; save(); },

  // catalogue
  products: ({ all = false } = {}) => load().products.filter(p => all || p.status === 'active'),
  product: h => load().products.find(p => p.handle === h || p.id === h),
  variant: id => variantById(load(), id),
  productOfVariant: id => load().products.find(p => p.variants.some(v => v.id === id)),
  saveProduct(p) {
    const db = load();
    p.handle = p.handle || slug(p.title);
    const i = db.products.findIndex(x => x.id === p.id);
    for (const v of p.variants) if (!v.id) { v.id = uid('v'); const s = v.stock || 0; v.stock = 0; moveStockLater.push([v.id, s]); }
    if (i < 0) { p.id = p.id || uid('p'); db.products.push(p); } else {
      // stock is only changed through adjustStock; keep the stored counts
      for (const v of p.variants) { const old = db.products[i].variants.find(x => x.id === v.id); if (old) v.stock = old.stock; }
      db.products[i] = p;
    }
    while (moveStockLater.length) { const [id, s] = moveStockLater.shift(); if (s) moveStock(db, id, s, 'new', '', 'Opening count', now(), 'admin'); }
    save(); return p;
  },
  deleteProduct(id) { const db = load(); db.products = db.products.filter(p => p.id !== id); save(); },
  adjustStock(variantId, delta, reason, note) { const db = load(); moveStock(db, variantId, delta, reason, '', note, now(), 'admin'); save(); },
  setStock(variantId, count, note) { const v = variantById(load(), variantId); if (!v) return; const d = Math.max(0, +count || 0) - v.stock; if (d) this.adjustStock(variantId, d, 'count', note); },
  movements: (variantId) => load().movements.filter(m => !variantId || m.variant_id === variantId).sort((a, b) => b.at.localeCompare(a.at)),

  // checkout: checks stock, takes payment result, writes order, decrements inventory — all in one step
  placeOrder({ customer, ship, cart, payment }) {
    const db = load();
    const short = [];
    const items = cart.map(l => {
      const p = db.products.find(x => x.variants.some(v => v.id === l.variant_id)); const v = p && p.variants.find(x => x.id === l.variant_id);
      if (!v || p.status !== 'active') { short.push({ ...l, have: 0 }); return null; }
      if (v.track && v.stock < l.qty) short.push({ ...l, have: v.stock, title: p.title, variant: v.title });
      return { variant_id: v.id, product_id: p.id, title: p.title, variant: v.title, price: v.price, qty: l.qty, image: p.images[0], sku: v.sku };
    });
    if (short.length) return { ok: false, short };
    const cust = addCustomer(db, customer);
    const o = buildOrder(db, cust, items, ship);
    o.payment = payment; o.history.push({ at: o.created, status: 'paid', note: `Paid by card ending ${payment.last4} (${payment.id})` });
    db.orders.push(o);
    for (const it of items) moveStock(db, it.variant_id, -it.qty, 'sale', o.number, '', o.created);
    save(); return { ok: true, order: o, customer: cust };
  },
  orders: () => load().orders.slice().sort((a, b) => b.created.localeCompare(a.created)),
  order: id => load().orders.find(o => o.id === id || o.number === id || o.number === '#' + id),
  updateOrder(id, patch, note) {
    const db = load(); const o = db.orders.find(x => x.id === id); if (!o) return;
    if (patch.status && patch.status !== o.status) {
      if ((patch.status === 'refunded' || patch.status === 'cancelled') && patch.restock && !o.restocked) {
        for (const it of o.items) moveStock(db, it.variant_id, it.qty, patch.status === 'refunded' ? 'refund' : 'cancel', o.number, '', now(), 'admin');
        o.restocked = true;
      }
      o.history.push({ at: now(), status: patch.status, note: note || '' });
    } else if (note) o.history.push({ at: now(), status: o.status, note });
    delete patch.restock; Object.assign(o, patch); save(); return o;
  },

  // customers
  customers: () => load().customers.slice().sort((a, b) => a.name.localeCompare(b.name)),
  customer: id => load().customers.find(c => c.id === id),
  customerByToken: t => load().customers.find(c => c.token === t),
  saveCustomer(id, patch) { const c = load().customers.find(x => x.id === id); Object.assign(c, patch); save(); return c; },
  newLink(id) { const c = load().customers.find(x => x.id === id); c.token = token(); save(); return c.token; },

  // restoration submissions
  submissions: () => load().submissions.slice().sort((a, b) => b.created.localeCompare(a.created)),
  submission: id => load().submissions.find(s => s.id === id || s.code.toLowerCase() === String(id).toLowerCase()),
  submit({ customer, delivery, cards, notes }) {
    const db = load(); const cust = addCustomer(db, customer);
    const s = { id: uid('s'), code: 'SAE-' + (++db.seq.sub), customer_id: cust.id, created: now(), status: 'submitted', delivery,
      cards: cards.map(c => ({ ...c, id: uid('c'), status: 'submitted' })), customer_notes: notes || '', public_notes: '', internal_notes: '',
      invoice: { status: 'unpaid', total: quote(db.content.prices, cards).total }, history: [{ at: now(), status: 'submitted' }], emailed_status: 'submitted' };
    db.submissions.push(s); save(); return { submission: s, customer: cust };
  },
  updateSubmission(id, patch) {
    const db = load(); const s = db.submissions.find(x => x.id === id);
    if (patch.status && patch.status !== s.status) s.history.push({ at: now(), status: patch.status });
    Object.assign(s, patch);
    if (patch.cards) s.invoice.total = quote(db.content.prices, s.cards).total;
    save(); return s;
  },
  payInvoice(id, payment) {
    const db = load(); const s = db.submissions.find(x => x.id === id);
    s.invoice = { ...s.invoice, status: 'paid', paid_at: now(), payment };
    if (['submitted', 'invoiced'].includes(s.status)) { s.status = 'paid'; s.history.push({ at: now(), status: 'paid', note: 'Invoice paid by card ending ' + payment.last4 }); }
    save(); return s;
  },
  // cards entering this week's queue (Monday start), for the 40-per-week message
  queueThisWeek() {
    const d = new Date(); const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    return load().submissions.filter(s => s.status !== 'cancelled' && new Date(s.created) >= monday).reduce((n, s) => n + s.cards.length, 0);
  },
};
const moveStockLater = [];
export const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid('item-');

// ---------- helpers ----------
export const money = n => '$' + (+n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money0 = n => '$' + (+n || 0).toLocaleString('en-US', { minimumFractionDigits: (+n % 1) ? 2 : 0, maximumFractionDigits: 2 });
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtDate = (iso, time = false) => !iso ? '' : new Date(iso).toLocaleString('en-US', time ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } : { month: 'short', day: 'numeric', year: 'numeric' });
export function stockState(v) {
  if (!v.track) return { key: 'in', label: 'In stock' };
  if (v.stock <= 0) return { key: 'out', label: 'Sold out' };
  if (v.stock <= v.low_at) return { key: 'low', label: `Low stock — ${v.stock} left` };
  return { key: 'in', label: 'In stock' };
}

// Demo payment (stands in for Stripe in test mode). 4242… succeeds, 4000 0000 0000 0002 is declined.
export function demoCharge({ number, exp, cvc, amount }) {
  const n = String(number).replace(/\D/g, '');
  if (n.length < 15) return { ok: false, error: 'Your card number is incomplete.' };
  if (!/^\d{2}\s*\/\s*\d{2}$/.test(exp || '')) return { ok: false, error: 'Your card’s expiration date is incomplete.' };
  const [mm, yy] = exp.split('/').map(x => +x.trim());
  const end = new Date(2000 + yy, mm, 1);
  if (mm < 1 || mm > 12 || end < new Date()) return { ok: false, error: 'Your card’s expiration date is in the past.' };
  if (!/^\d{3,4}$/.test(cvc || '')) return { ok: false, error: 'Your card’s security code is incomplete.' };
  if (n === '4000000000000002') return { ok: false, error: 'Your card was declined.' };
  if (n === '4000000000009995') return { ok: false, error: 'Your card has insufficient funds.' };
  return { ok: true, payment: { provider: 'stripe', mode: 'demo', id: 'pi_demo_' + Math.random().toString(36).slice(2, 12), last4: n.slice(-4), amount } };
}
