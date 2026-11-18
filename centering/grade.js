// Grade side of CardVestIQ: best grade the centering allows at each grader (front + back), where the card sits
// against each grader's published tolerances, and the submit-or-skip calculator.
import { CENTERING_RULES, gradeCaps } from "./multipoint.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pair = (x) => `${Math.round(x)}/${100 - Math.round(x)}`;
// PSA service levels: Restored Rarity's built-in list (index.html PRICE_RULES.psaLevels, Nov 2026 — PSA sets these).
// [name, fee, max declared value]
export const PSA_LEVELS = [["Value", 39.99, 500], ["Standard", 59.99, 1000], ["Priority", 79.99, 1500], ["Express", 199, 2500],
  ["Super Express", 349, 5000], ["Premier", 599, 10000], ["Premium 1", 999, 25000]];
export const psaLevelFor = (value) => PSA_LEVELS.find((l) => value <= l[2]) || PSA_LEVELS.at(-1);
export const RR_GRADING_FEE = 15;                       // Restored Rarity grading submission, first card
export const gradeNum = (g) => { const n = parseFloat(String(g).replace(/^Pristine\s*/, "")); return isNaN(n) ? 0 : n; };

// ------------------------------------------------------------ caps panel
// front/back: worse-axis share (58 = 58/42) or null; frontPm/backPm: ± margin.
export function capsHtml(front, back, { frontPm = 0, backPm = 0 } = {}) {
  const g = gradeCaps(front, back);
  if (!g) return "";
  const names = { PSA: "PSA", CGC: "CGC", BGS: "Beckett (BGS) centering subgrade" };
  const rows = Object.entries(g.companies).map(([co, r]) => {
    const need = r.next && [r.next.front && `front ${pair(r.next.front)}`, r.next.back && `back ${pair(r.next.back)}`].filter(Boolean).join(" and ");
    // would the margin of error change the answer?
    const lo = gradeCaps(Math.max(50, front - frontPm), back == null ? null : Math.max(50, back - backPm))?.companies[co].grade;
    const hi = gradeCaps(front + frontPm, back == null ? null : back + backPm)?.companies[co].grade;
    const edge = (lo !== r.grade || hi !== r.grade) ? `<span class="tag warn" title="Within the margin of error of the next line">on the line</span>` : "";
    return `<div class="cap"><div class="cap-co">${esc(names[co])}</div><div class="cap-g">${esc(r.grade)}</div>
      <div class="cap-note">${need ? `a ${esc(r.next.grade)} needs ${need}` : "top of the scale"} ${edge}</div></div>`;
  }).join("");
  const p = g.companies.PSA.grade, b = g.companies.BGS.grade;
  const headline = gradeNum(p) >= 10 && gradeNum(b) < 10 ? `Centers for a PSA 10, but only a BGS ${esc(b)} centering subgrade.`
    : `Centering allows up to PSA ${esc(p)} · CGC ${esc(g.companies.CGC.grade)} · BGS ${esc(b)}.`;
  return `<p class="headline">${headline}</p><div class="caps">${rows}</div>
    <p class="muted small">Front ${pair(g.front)}${g.back != null ? ` · back ${pair(g.back)}` : " · <b>back not measured</b>, so back limits aren't applied"}
    (worse direction, middle of the card). Centering only — corners, edges and surface decide the rest. TAG isn't shown: it doesn't publish fixed centering limits.</p>`;
}

// ------------------------------------------------- where it falls (scale)
// One bar per grader and side: 50/50 on the left to 90/10 on the right, coloured bands per grade, a marker for the card.
export function scaleHtml(front, back) {
  const X = (v) => ((Math.min(90, Math.max(50, v)) - 50) / 40) * 100;
  const bar = (co, side, val) => {
    const col = side === "front" ? 1 : 2, rules = CENTERING_RULES[co].rules.filter((r) => r[col] != null);
    let prev = 50, segs = "";
    rules.forEach((r, i) => {
      const lim = r[col]; if (lim <= prev && i) return;
      segs += `<div class="seg s${Math.min(i, 6)}" style="left:${X(prev)}%;width:${X(lim) - X(prev)}%" title="${esc(co)} ${esc(r[0])}: up to ${lim}/${100 - lim}">
        <span>${esc(r[0].replace("Pristine ", "P"))}</span></div>`;
      prev = lim;
    });
    if (prev < 90) segs += `<div class="seg s7" style="left:${X(prev)}%;width:${100 - X(prev)}%" title="${esc(co)} ${esc(CENTERING_RULES[co].floor)}"><span>${esc(CENTERING_RULES[co].floor.replace(" or lower", "↓"))}</span></div>`;
    const mk = val == null ? `<span class="nomk">not measured</span>`
      : `<div class="mk" style="left:${X(val)}%" title="This card: ${pair(val)}"></div>`;
    return `<div class="sc-row"><div class="sc-l">${esc(co)} <span class="muted">${side}</span></div><div class="sc-bar">${segs}${mk}</div></div>`;
  };
  let h = `<div class="scale"><div class="sc-row sc-axis"><div class="sc-l"></div><div class="sc-bar">
    ${[50, 60, 70, 80, 90].map((v) => `<span style="left:${X(v)}%">${v}/${100 - v}</span>`).join("")}</div></div>`;
  for (const co of Object.keys(CENTERING_RULES)) h += bar(co, "front", front) + bar(co, "back", back);
  return h + `</div><p class="muted small">Each band is the worst centering a grade allows (from each grader's published standards). The white line is this card.</p>`;
}

// --------------------------------------------------- submit-or-skip
// Grade ladders; the last rung means "this grade or lower".
export const LADDER = { PSA: [10, 9, 8, 7], CGC: [10, 9.5, 9, 8, 7], BGS: [10, 9.5, 9, 8, 7] };
// Rough chance of each grade from corners/edges/surface alone (before centering). A starting guess, editable.
const CONDITION = {
  flawless: { label: "Flawless — sharp corners, clean edges, no scratches", p: { 10: 55, 9.5: 25, 9: 15, 8: 5, 7: 0 } },
  near: { label: "Near perfect — maybe one tiny flaw under a loupe", p: { 10: 20, 9.5: 25, 9: 40, 8: 12, 7: 3 } },
  light: { label: "Light wear — a soft corner or a little whitening", p: { 10: 3, 9.5: 7, 9: 30, 8: 40, 7: 20 } },
  worn: { label: "Visible wear — whitening, scratches or a ding", p: { 10: 0, 9.5: 0, 9: 10, 8: 30, 7: 60 } },
};
export const CONDITIONS = Object.entries(CONDITION).map(([k, v]) => [k, v.label]);

// Final grade = the lower of condition and the centering cap. Returns { grade: percent } on the company's ladder.
export function gradeOdds(company, condition, capGrade) {
  const lad = LADDER[company], cap = gradeNum(capGrade), base = CONDITION[condition].p, out = Object.fromEntries(lad.map((g) => [g, 0]));
  for (const [g0, pct] of Object.entries(base)) {
    let g = Math.min(Number(g0), cap);
    if (!lad.includes(g)) g = lad.find((r) => r <= g) ?? lad.at(-1);   // e.g. 9.5 at PSA → 9; 6 → "7 or lower"
    out[g] += pct;
  }
  return out;
}

// Median of "120, 135 110" style input; a single number passes through.
export function comps(text) {
  const v = String(text || "").replace(/\$/g, "").split(/[\s,;]+/).map(Number).filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  return v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
}

// inputs: { raw, values:{grade:number}, odds:{grade:%}, fee, ship, prep, sellPct }
export function submitOrSkip({ raw, values, odds, fee = 0, ship = 0, prep = 0, sellPct = 0 }) {
  const net = (v) => v * (1 - sellPct / 100);
  const total = Object.values(odds).reduce((a, b) => a + b, 0) || 1;
  let ev = 0, missing = [];
  for (const [g, pct] of Object.entries(odds)) {
    if (!pct) continue;
    const v = values[g];
    if (v == null || isNaN(v)) { missing.push(g); continue; }
    ev += (pct / total) * net(v);
  }
  if (raw == null || isNaN(raw) || missing.length) return { missing, ready: false };
  const cost = fee + ship + prep, gain = ev - cost - net(raw);
  const margin = Math.max(15, 0.15 * raw);
  const verdict = gain > margin ? "submit" : gain > 0 ? "borderline" : "skip";
  // chance of the top grade needed to break even, if the rest of the odds keep their shape
  const top = Object.keys(odds).map(Number).sort((a, b) => b - a)[0];
  let breakEven = null;
  if (values[top] != null) {
    const restP = total - (odds[top] || 0);
    const restEv = restP > 0 ? Object.entries(odds).filter(([g]) => Number(g) !== top)
      .reduce((s, [g, p]) => s + (p / restP) * net(values[g] ?? 0), 0) : net(raw);
    const need = (cost + net(raw) - restEv) / (net(values[top]) - restEv);
    breakEven = isFinite(need) ? Math.round(Math.min(1, Math.max(0, need)) * 100) : null;
  }
  return { ready: true, ev, cost, gain, verdict, breakEven, top };
}

export const ebaySold = (name, label) =>
  `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(`${name} ${label}`.trim())}&LH_Sold=1&LH_Complete=1`;
