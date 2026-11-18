// Shiny Asset Exchange demo — the restoration portal's "database", saved in this browser.
// Same tables as the Restored Rarity portal (customers, submissions, cards, scans, photos, site_content),
// shared by the portal (common.js demoApi), the customer link (view.html) and the website's intake form.
// Live version: these are the Supabase tables in supabase/schema.sql and intake() is the intake_submit RPC.
const KEY = "sae-portal-v2";
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "x" + Math.random().toString(16).slice(2) + Date.now().toString(16));
const key18 = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(16).padStart(2, "0")).join("");
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();

function seed() {
  const d = { v: 2, customers: [], submissions: [], cards: [], scans: [], photos: [], site_content: [], seq: 1040 };
  const cust = (name, email, phone) => { const c = { id: uid(), name, email, phone, share_token: key18(), storage_key: key18().slice(0, 12), notes: "", created_at: ago(20) }; d.customers.push(c); return c; };
  const sub = (c, days, status, cards, extra = {}) => {
    const s = { id: uid(), code: "SAE-" + (++d.seq), customer_id: c.id, status, service: [...new Set(cards.map((k) => k.service))].join(", "),
      customer_notes: "", internal_notes: "", public_notes: "", created_at: ago(days), updated_at: ago(Math.max(0, days - 2)),
      status_changed_at: ago(Math.max(0, days - 2)), grading_track: null, quote_discount: "", emailed_status: status, emailed_at: ago(Math.max(0, days - 2)), ...extra };
    d.submissions.push(s);
    cards.forEach((k, i) => d.cards.push({ id: uid(), submission_id: s.id, card_number: i + 1, status, internal_notes: "", public_notes: "", grading: "",
      grade_level: "", grade_result: "", cert_no: "", set_name: "", card_no: "", year: "", created_at: s.created_at, updated_at: s.updated_at, ...k }));
    return s;
  };
  const a = cust("Sample Collector", "collector@example.com", "(512) 555-0142");
  const b = cust("Austin Walk-in", "walkin@example.com", "(512) 555-0177");
  sub(a, 9, "in_progress", [
    { name: "Charizard", details: "Base Set · 4/102 · 1999", service: "Restoration — Tier 1 ($80) + Estimated Grade ($10)",
      customer_notes: "Service: Restoration — Tier 1 ($80) + Estimated Grade ($10)\nCard value: $420\nDamage: Light crease on the front, top right" },
    { name: "Blastoise", details: "Base Set · 2/102 · 1999", service: "Cleaning ($20)",
      customer_notes: "Service: Cleaning ($20)\nCard value: $180\nDamage: Fingerprints and dust" },
  ], { public_notes: "Cards arrived safely. Charizard is on the press this week.", internal_notes: "Delivery: Ship\nReturn address: 100 Example St, Austin TX 78701\nPaid: invoice #INV-1041 (demo)" });
  sub(b, 2, "received", [
    { name: "Umbreon VMAX", details: "Evolving Skies · 215/203 · 2021", service: "Restoration — Tier 3 ($200) + Grade Prep & Ship ($20) — grading: PSA", grading: "PSA",
      customer_notes: "Service: Restoration — Tier 3 ($200) + Grade Prep & Ship ($20) — grading: PSA\nCard value: $1,350\nDamage: Indent on the back, small scratch on the holo" },
  ], { emailed_status: "submitted", internal_notes: "Delivery: Drop-off at Home Town Cards & Collectibles" });
  d.site_content.push({ id: uid(), key: "announcement", value: { on: true, text: "Welcome to Shiny Asset Exchange!", link: "", linkText: "", until: "" } });
  d.site_content.push({ id: uid(), key: "instagram", value: { on: true, handle: "shinyassetexchange", heading: "Follow the work on Instagram", sub: "Before-and-afters, product drops and card care tips.", posts: [] } });
  return d;
}

let cache = null;
export function db() {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { cache = null; }
  if (!cache || cache.v !== 2) { cache = seed(); save(); }
  return cache;
}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { console.warn("Demo store is full", e); throw e; } }
export function reset() { cache = seed(); save(); }
window.addEventListener("storage", (e) => { if (e.key === KEY) cache = null; });

export const nextCode = () => { const d = db(); return "SAE-" + (++d.seq); };
export const newCustomerKeys = () => ({ share_token: key18(), storage_key: key18().slice(0, 12) });

/** Same as the intake_submit RPC: find/create the customer by email, create the submission + cards. */
export function intake(p) {
  const d = db(); const now = new Date().toISOString();
  const email = (p.email || "").trim().toLowerCase();
  if (!(p.name || "").trim()) throw new Error("name required");
  if (!Array.isArray(p.cards) || !p.cards.length) throw new Error("at least one card required");
  let c = email && d.customers.find((x) => (x.email || "").toLowerCase() === email);
  if (!c) { c = { id: uid(), name: p.name.trim(), email, phone: p.phone || "", notes: "", created_at: now, ...newCustomerKeys() }; d.customers.push(c); }
  else if (!c.phone && p.phone) c.phone = p.phone;
  const s = { id: uid(), code: "SAE-" + (++d.seq), customer_id: c.id, status: "submitted", service: (p.service || "").slice(0, 200),
    customer_notes: p.notes || "", internal_notes: p.intake_info || "", public_notes: "", created_at: now, updated_at: now, status_changed_at: now,
    emailed_status: null, emailed_at: null, grading_track: null, quote_discount: "" };
  d.submissions.push(s);
  const ids = p.cards.map((k, i) => {
    const r = { id: uid(), submission_id: s.id, card_number: i + 1, name: k.name || "", details: k.details || "", status: "submitted",
      customer_notes: k.notes || "", internal_notes: "", public_notes: "", service: k.service || "", grading: k.grading || "", grade_level: "", grade_result: "", cert_no: "",
      set_name: "", card_no: "", year: "", created_at: now, updated_at: now };
    const parts = (r.details || "").split(" · "); if (parts.length === 3) Object.assign(r, { set_name: parts[0], card_no: parts[1], year: parts[2] });
    d.cards.push(r); return r.id;
  });
  (p.photos || []).forEach((set, i) => set.forEach((ph) => d.photos.push({ id: uid(), customer_id: c.id, submission_id: s.id, card_id: ids[i],
    path: ph.dataUrl, source: "intake", caption: ph.caption || "", created_at: now })));
  save();
  return { code: s.code, token: c.share_token, storage_key: c.storage_key, cards: ids.length, card_ids: ids };
}

/** Lookup for the website's Order Status page: a submission by code + the customer's email. */
export function findSubmission(code, email) {
  const d = db(), s = d.submissions.find((x) => x.code.toLowerCase() === String(code).trim().toLowerCase());
  const c = s && d.customers.find((x) => x.id === s.customer_id);
  if (!s || !c || (c.email || "").toLowerCase() !== String(email).trim().toLowerCase()) return null;
  return { submission: s, customer: c, cards: d.cards.filter((k) => k.submission_id === s.id).sort((a, b) => a.card_number - b.card_number) };
}
export const siteContent = (key) => (db().site_content.find((r) => r.key === key) || {}).value;
/** Cards entering this week's queue (Monday start), for the 40-per-week message. */
export function queueThisWeek() {
  const t = new Date(), monday = new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7));
  const subs = new Set(db().submissions.filter((s) => new Date(s.created_at) >= monday).map((s) => s.id));
  return db().cards.filter((k) => subs.has(k.submission_id)).length;
}
