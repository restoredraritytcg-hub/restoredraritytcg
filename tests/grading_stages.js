// Grading-company stages: checks portal/grading.js against the SQL map in
// supabase/2026-11-25_grading_stages.sql, and the Apps Script's daily
// second-50% reminder decision (apps-script/Code.gs gradingReminderDue_).
// Run: node tests/grading_stages.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let failed = 0;
function check(name, cond) {
  if (cond) console.log("ok  " + name);
  else { failed++; console.error("FAIL " + name); }
}

// ---- portal/grading.js (an ES module that imports common.js; load it with stand-ins)
let src = fs.readFileSync(path.join(__dirname, "../portal/grading.js"), "utf8");
src = src.replace(/^import .*$/m, "").replace(/^export (const|function|async function) /gm, "$1 ");
const names = [...src.matchAll(/^(?:const|function|async function) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
const G = {};
vm.runInNewContext(src + `\n;Object.assign(__out, {${names.join(",")}});`, {
  __out: G, api: {}, DEMO: false, esc: (s) => String(s ?? ""), $: () => null, $$: () => [], toast() {},
  fmtDate: (d) => String(d), window: {}, console,
});

// ---- SQL map
const sql = fs.readFileSync(path.join(__dirname, "../supabase/2026-11-25_grading_stages.sql"), "utf8");
const sqlMap = {};
for (const m of sql.matchAll(/when '([a-z_]+)' then return '([a-z_]+)'/g)) sqlMap[m[1]] = m[2];
for (const m of sql.matchAll(/if k in \(([^)]*)\) then return '([a-z_]+)'/g))
  for (const k of m[1].matchAll(/'([a-z_]+)'/g)) if (/^rr_/.test(k[1])) sqlMap[k[1]] = m[2];
const sqlNormals = (sql.match(/cards_grading_stage_check[\s\S]*?check \(grading_stage in \(([\s\S]*?)\)\)/) || [])[1] || "";
const allowed = new Set([...sqlNormals.matchAll(/'([a-z_]*)'/g)].map((m) => m[1]));

for (const g of G.GRADERS) {
  for (const [k] of G.stagesFor(g)) {
    check(`${g} ${k}: JS and SQL map agree (${G.mapStage(g, k)})`, sqlMap[k] === G.mapStage(g, k));
    check(`${g} ${k}: normalized stage allowed by the check constraint`, allowed.has(G.mapStage(g, k)));
    check(`${g} ${k}: has a label`, !!G.stageLabel(k));
  }
}
check("every SQL key is offered in the portal", Object.keys(sqlMap).every((k) => G.GRADERS.some((g) => G.stagesFor(g).some(([x]) => x === k))));
check("on hold stage exists for every company", G.GRADERS.every((g) => G.stagesFor(g).some(([k]) => k === "rr_on_hold")));
check("company prefixes match", G.GRADERS.every((g) => G.GRADER_STAGES[g].every(([k]) => k.startsWith(g.toLowerCase() + "_"))));
let threw = false; try { G.mapStage("PSA", "nope"); } catch { threw = true; }
check("unknown stage throws", threw);
check("CGC marked [to confirm] in the admin dropdown", /CGC \[to confirm\]/.test(G.stageOptions("CGC")));
check("[to confirm] not in PSA dropdown", !/to confirm/.test(G.stageOptions("PSA")));
check("mixed selection offers RR stages only", !/psa_|cgc_|bgs_|tag_/.test(G.stageOptions("")));

// 50/50 of the estimate, rounded to cents, adding up.
const h1 = G.halves("100.01"), h2 = G.halves(79.98), h3 = G.halves("");
check("halves 100.01 → 50.01 + 50.00", h1.first === 50.01 && h1.second === 50);
check("halves 79.98 → 39.99 + 39.99", h2.first === 39.99 && h2.second === 39.99);
check("no estimate → null", h3 === null);
check("negative estimate → null", G.halves(-5) === null);

// Email defaults (design §2.6).
check("shipped to grader emails by default", G.emailDefault("shipped_to_grader") === true);
check("research/ID does not", G.emailDefault("research_id") === false);
check("preparing emails only if first 50% is due", G.emailDefault("preparing", { est_fee: 80 }) === true &&
  G.emailDefault("preparing", { est_fee: 80, first_half_paid_at: "2026-11-25" }) === false && G.emailDefault("preparing", {}) === false);
check("on hold off by default", G.emailDefault("on_hold") === false);

// Customer block: paid status + amounts, no internal notes, no [to confirm].
const html = G.gradingCustomerHtml({
  grading_lots: [{ id: "L1", grader: "CGC", est_fee: 60, first_half_paid_at: "2026-11-20T10:00:00Z", second_half_paid_at: null,
                   balance_due_on: "2026-12-09", notes: "visible", internal_notes: "SECRET" }],
  cards: [{ id: "k1", card_number: 1, name: "Card A", grading_lot_id: "L1", grader_stage: "cgc_qc", grading_stage: "qa_assembly",
            grading_history: [{ grader: "CGC", grading_stage: "shipped_to_grader", at: "2026-11-25T10:00:00Z" }] }] });
check("customer block shows first 50% paid", /first 50%[^<]*: <b>\$30\.00<\/b> — paid ✓/.test(html));
check("customer block shows second 50% due date", /the other 50%: <b>\$30\.00<\/b> — due Dec 9, 2026/.test(html));
check("customer block has no internal notes", !/SECRET/.test(html));
check("customer block has no [to confirm]", !/to confirm/.test(html));
check("customer block shows official CGC label", /CGC: Quality Control \/ Finalized/.test(html));

// ---- Apps Script reminder decision
const code = fs.readFileSync(path.join(__dirname, "../apps-script/Code.gs"), "utf8");
const ctx = { console, Utilities: { formatDate(d) { const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`; } } };
vm.createContext(ctx); vm.runInContext(code, ctx);
const due = ctx.gradingReminderDue_;
const shipped = "2026-11-25T15:00:00Z";
check("reminder not due on day 13", !due({ shippedAt: shipped }, new Date("2026-12-08T15:00:00Z")));
check("reminder due on day 14", due({ shippedAt: shipped }, new Date("2026-12-09T15:00:00Z")));
check("reminder due after day 14 too (missed run)", due({ shippedAt: shipped }, new Date("2026-12-11T15:00:00Z")));
check("no reminder when second 50% is paid", !due({ shippedAt: shipped, secondPaidAt: "2026-12-01T00:00:00Z" }, new Date("2026-12-09T15:00:00Z")));
check("no second reminder", !due({ shippedAt: shipped, reminderSent: "2026-12-09T15:00:00Z" }, new Date("2026-12-10T15:00:00Z")));
check("no reminder before shipping", !due({ shippedAt: "" }, new Date("2026-12-31T15:00:00Z")));
check("agreed date wins", !due({ shippedAt: shipped, dueOn: "2026-12-20" }, new Date("2026-12-09T15:00:00Z")) &&
  due({ shippedAt: shipped, dueOn: "2026-12-20" }, new Date("2026-12-20T15:00:00Z")));
check("lead stage is the card furthest behind", ctx.gradingLeadStage_([{ normal: "grading" }, { normal: "received_by_grader" }, { normal: "on_hold" }]).normal === "received_by_grader");
check("all on hold → on hold", ctx.gradingLeadStage_([{ normal: "on_hold" }]).normal === "on_hold");

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nAll grading checks passed.");
