// CardVestIQ collection: each card is a holding (what you paid, value now, value if graded), valued with the same
// centering caps + submit-or-skip math as the Check page. Holdings live on this device (localStorage); the demo adds
// made-up sample cards (demo/*.jpg) with sample prices, clearly marked.
import * as M from "./multipoint.js";
import * as G from "./grade.js";

const KEY = "cvq-collection";
const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } },
  set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); return true; } catch { return false; } },
};
export const SHIP = 25, SELL_PCT = 13.25;

// ------------------------------------------------------------------ demo cards (made up; prices are samples)
export const DEMO = [
  { id: "d-voltflare", name: "Voltflare ex", set: "Storm Crown · 012/180", paid: 38, boughtOn: "2026-03-02", condition: "flawless",
    raw: "45, 52, 48", values: { 10: "310, 295, 330", 9: "120, 110", 8: "70", 7: "50" }, status: "raw", img: "voltflare" },
  { id: "d-emberdrake", name: "Ember Drake (holo)", set: "First Flame · 004/102", paid: 120, boughtOn: "2026-01-18", condition: "near",
    raw: "160, 150, 170", values: { 10: "900", 9: "300, 320", 8: "190", 7: "150" }, status: "raw", img: "emberdrake" },
  { id: "d-tidecaller", name: "Tidecaller", set: "Deep Current · 031/165", paid: 22, boughtOn: "2026-06-11", condition: "near",
    raw: "25, 28", values: { 10: "140", 9: "55", 8: "35", 7: "25" }, status: "raw", img: "tidecaller" },
  { id: "d-marcushale", name: "Marcus Hale rookie", set: "Prime Rookies · #88", paid: 60, boughtOn: "2026-05-20", condition: "flawless",
    raw: "75, 80", values: { 10: "420", 9: "160, 150", 8: "95", 7: "80" }, status: "raw", img: "marcushale" },
  { id: "d-ironroot", name: "Ironroot Golem", set: "Wildwood · 077/200", paid: 55, boughtOn: "2026-04-03", condition: "near",
    raw: "70", values: { 10: "380", 9: "140", 8: "90", 7: "70" }, status: "grading", company: "PSA", sentOn: "2026-10-12",
    fees: 39.99 + SHIP, predicted: "9", img: "ironroot" },
  { id: "d-nightglass", name: "Nightglass Owl", set: "Moonlit · 009/120", paid: 30, boughtOn: "2026-02-14", condition: "flawless",
    raw: "35", values: { 10: "240", 9: "80", 8: "50", 7: "35" }, status: "sold", company: "PSA", predicted: "10", realGrade: 10,
    fees: 39.99 + SHIP, soldFor: 255, soldOn: "2026-10-30", img: "nightglass" },
];
// Demo version of the shared track record (labelled as demo numbers on the page).
export const DEMO_STATS = { PSA: { n: 142, cap_held: 93, sub_n: 0 }, CGC: { n: 38, cap_held: 89, sub_n: 0 },
                            BGS: { n: 51, cap_held: 90, sub_n: 44, sub_exact: 77, sub_half: 95 } };

export const isDemo = () => !!window.CVQ_DEMO || /[?&]demo\b/.test(location.search);
export function list() { return [...(isDemo() ? DEMO : []), ...store.get()]; }
export function add(h) {
  const all = store.get(); h.id = "h-" + Date.now().toString(36); all.unshift(h);
  return store.set(all) ? h : null;
}
export function update(id, patch) {
  const all = store.get(), i = all.findIndex((h) => h.id === id); if (i < 0) return false;
  Object.assign(all[i], patch); return store.set(all);
}
export function remove(id) { store.set(store.get().filter((h) => h.id !== id)); }

// ------------------------------------------------------------------ valuation
// worst: { front, back } worse-axis shares (back may be null) or null when not measured yet.
export function value(h, worst) {
  const rawNow = G.comps(h.raw), vals = Object.fromEntries(Object.entries(h.values || {}).map(([g, t]) => [g, G.comps(t)]));
  const out = { rawNow, gainNow: rawNow != null && h.paid != null ? rawNow - h.paid : null };
  if (h.status === "sold") {
    const cost = h.paid + (h.fees || 0), net = h.soldFor * (1 - SELL_PCT / 100);
    return { ...out, realized: net - cost, realizedPct: cost ? Math.round(100 * (net - cost) / cost) : null };
  }
  if (!worst?.front) return out;
  const company = h.company || "PSA", caps = M.gradeCaps(worst.front, worst.back);
  const cap = caps.companies[company].grade, odds = G.gradeOdds(company, h.condition || "near", cap);
  const top = Math.max(0, ...Object.values(vals).filter(Boolean));
  const fee = company === "PSA" ? G.psaLevelFor(top)[1] : 0;
  const res = G.submitOrSkip({ raw: rawNow, values: vals, odds, fee, ship: SHIP, sellPct: SELL_PCT });
  return { ...out, caps, cap, odds, res, ev: res.ready ? res.ev : null, upside: res.ready ? res.gain : null };
}

// ------------------------------------------------------------------ rendering
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $f = (x, d = 0) => (x == null || isNaN(x) ? "—" : `${x < 0 ? "−" : ""}$${Math.abs(x).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const pct = (a, b) => (a == null || !b ? "" : `${a >= b ? "+" : "−"}${Math.abs(Math.round(100 * (a - b) / b))}%`);
const VERDICT = { submit: ["Grade it", "good"], borderline: ["Borderline", "warn"], skip: ["Keep raw", "muted"] };

// rows: [{ h, v, thumb, meas: {lr, tb, tilt} | null, measuring }]
export function render(rows) {
  const open = rows.filter((r) => r.h.status !== "sold"), sold = rows.filter((r) => r.h.status === "sold");
  const sum = (f) => open.reduce((s, r) => s + (f(r) || 0), 0);
  const cost = sum((r) => r.h.paid), rawNow = sum((r) => r.v.rawNow);
  const upside = sum((r) => (r.h.status === "raw" && r.v.upside > 0 ? r.v.upside : 0));
  const graders = open.filter((r) => r.h.status === "raw" && r.v.res?.verdict === "submit").length;
  const realized = sold.reduce((s, r) => s + (r.v.realized || 0), 0);
  const kpi = (l, v, s, tone = "") => `<div class="kpi ${tone}"><div class="k-l">${l}</div><div class="k-v">${v}</div><div class="k-s">${s}</div></div>`;
  const ranked = [...open].sort((a, b) => (b.h.status === "raw") - (a.h.status === "raw") || (b.v.upside ?? -1e9) - (a.v.upside ?? -1e9));
  const row = (r) => {
    const { h, v, m } = { ...r, m: r.meas };
    const status = h.status === "grading" ? `<span class="pill info">At ${esc(h.company)} since ${esc(h.sentOn)}</span>`
      : r.measuring ? `<span class="pill muted"><span class="spinner"></span> measuring</span>`
      : v.res?.ready ? `<span class="pill ${VERDICT[v.res.verdict][1]}">${VERDICT[v.res.verdict][0]}</span>` : `<span class="pill muted">Add prices</span>`;
    return `<tr><td>${r.thumb ? `<img src="${r.thumb}" alt="">` : ""}</td>
      <td class="nm"><b>${esc(h.name)}</b><span class="muted small">${esc(h.set || "")}</span></td>
      <td class="num" data-l="Paid">${$f(h.paid)}</td>
      <td class="num" data-l="Raw now">${$f(v.rawNow)}<span class="small ${v.gainNow >= 0 ? "pos" : "neg"}">${pct(v.rawNow, h.paid)}</span></td>
      <td class="num" data-l="Centering">${m ? `${m.lr.toFixed(0)}/${(100 - m.lr).toFixed(0)}` : r.measuring ? `<span class="spinner"></span>` : "—"}<span class="small muted">${m && m.tilt != null ? `${Math.abs(m.tilt).toFixed(2)}° tilt` : ""}</span></td>
      <td class="num" data-l="Allows">${v.cap ? `PSA ${esc(v.cap)}` : h.predicted ? `PSA ${esc(h.predicted)}` : "—"}</td>
      <td class="num" data-l="If graded">${v.ev != null ? $f(v.ev) : "—"}<span class="small ${v.upside > 0 ? "pos" : "neg"}">${v.upside != null ? `${Math.abs(v.upside) < 0.5 ? "±$0" : `${v.upside >= 0 ? "+" : "−"}${$f(Math.abs(v.upside))}`} vs raw` : ""}</span></td>
      <td data-l="Decision">${status}</td>
      <td class="act"><button class="btn sm" data-hold="${esc(h.id)}">Open</button></td></tr>`;
  };
  return `
    <div class="kpis k5">
      ${kpi("Paid", $f(cost), `${open.length} card${open.length === 1 ? "" : "s"} held`)}
      ${kpi("Worth raw now", $f(rawNow), `<span class="${rawNow >= cost ? "pos" : "neg"}">${pct(rawNow, cost)} on cost</span>`)}
      ${kpi("Grading upside", $f(upside), `${graders} card${graders === 1 ? "" : "s"} worth grading`, upside > 0 ? "good" : "")}
      ${kpi("Realized", $f(realized), `${sold.length} sold`, realized >= 0 ? "good" : "bad")}
    </div>
    <div class="tablewrap"><table class="ptable"><thead><tr><th></th><th>Card</th><th class="num">Paid</th><th class="num">Raw now</th>
      <th class="num">Centering</th><th class="num">Allows</th><th class="num">If graded</th><th>Decision</th><th></th></tr></thead>
      <tbody>${ranked.map(row).join("") || `<tr><td colspan="9" class="muted">No cards yet. Check a card, then “Add to my collection”.</td></tr>`}</tbody></table></div>
    <p class="muted small">“If graded” is the expected sale after selling fees, from the grade odds (condition, capped by the measured centering)
      and sold prices. “vs raw” takes off grading fees and shipping and compares that with selling it raw today. Sorted by grading upside.</p>
    ${sold.length ? `<h3>Graded &amp; sold</h3><div class="tablewrap"><table class="ptable"><thead><tr><th></th><th>Card</th><th class="num">Paid + fees</th>
      <th class="num">Predicted</th><th class="num">Graded</th><th class="num">Sold</th><th class="num">Return</th></tr></thead><tbody>
      ${sold.map((r) => `<tr><td>${r.thumb ? `<img src="${r.thumb}" alt="">` : ""}</td><td class="nm"><b>${esc(r.h.name)}</b><span class="muted small">${esc(r.h.set || "")}</span></td>
        <td class="num" data-l="Paid + fees">${$f(r.h.paid + (r.h.fees || 0), 2)}</td><td class="num" data-l="Predicted">${esc(r.h.company)} ${esc(r.h.predicted)}</td>
        <td class="num" data-l="Graded"><b>${esc(r.h.company)} ${esc(r.h.realGrade)}</b> ${Number(r.h.realGrade) <= G.gradeNum(r.h.predicted) ? `<span class="pill good">cap held</span>` : `<span class="pill warn">beat cap</span>`}</td>
        <td class="num" data-l="Sold">${$f(r.h.soldFor)}<span class="small muted">${esc(r.h.soldOn)}</span></td>
        <td class="num ${r.v.realized >= 0 ? "pos" : "neg"}" data-l="Return"><b>${$f(r.v.realized, 2)}</b><span class="small">${r.v.realizedPct != null ? `${r.v.realizedPct >= 0 ? "+" : ""}${r.v.realizedPct}%` : ""}</span></td></tr>`).join("")}
      </tbody></table></div><p class="muted small">Return = sale after ${SELL_PCT}% selling fees − what you paid − grading fees and shipping.</p>` : ""}`;
}
