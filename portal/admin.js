// Admin portal: every customer, submission, card, scan and photo.
import { api, DEMO, esc, $, $$, pill, STATUSES, renderReport, wireReport, thumbOf, mediaUrl, fmtDate,
  fmtDateTime, installLightbox, installHint, toast, customerLink, progressSteps, STAGE_LABEL } from "./common.js";
import * as U from "./scanupload.js";
import { sitePage, quotePanel, wireQuote, currentPrices, saveServicesToSheet, savePsaToSheet } from "./site.js";
import { psaPanel, wirePsa, levelFromService } from "./psa.js";

const app = $("#app");
let S = null; // { customers, submissions, cards, scans, photos }

if (DEMO) $("#demo").innerHTML = '<div class="demo-banner">Demo mode — sample data, changes are not saved. ' +
  'Fill in config.js to connect your Supabase project.</div>';
installLightbox();

// ----------------------------------------------------------------- lookups
const byId = (t, id) => S[t].find((x) => x.id === id);
const customerOf = (sub) => byId("customers", sub.customer_id);
const subCards = (subId) => S.cards.filter((c) => c.submission_id === subId).sort((a, b) => a.card_number - b.card_number);
const custSubs = (custId) => S.submissions.filter((s) => s.customer_id === custId)
  .sort((a, b) => b.created_at.localeCompare(a.created_at));
const cardScans = (cardId) => S.scans.filter((x) => x.card_id === cardId);
const statusSelect = (id, val, extra = "") => `<select id="${id}" ${extra}>${STATUSES.map(([k, l]) =>
  `<option value="${k}" ${k === val ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
const cardTitle = (c) => c.name || `Card #${c.card_number}`;

// ---------------------------------------------------------- status emails
// The intake confirmation email covers "submitted"; every later status needs its own email.
const emailedStatus = (s) => s.emailed_status || "submitted";
const needsEmail = (s) => s.status !== emailedStatus(s);
const statusLabel = (k) => (STATUSES.find(([x]) => x === k) || [k, k])[1];
const EMAIL_ENDPOINT = window.RR_CONFIG?.emailEndpoint || "";

async function markEmailed(s) {
  Object.assign(s, await api.update("submissions", s.id, { emailed_status: s.status, emailed_at: new Date().toISOString() }));
}
// Asks the Apps Script web app to send the status email from the business Gmail. It gets only the
// submission code and the signed-in admin's session token, checks that token with Supabase, and reads
// the submission itself, so nobody else can trigger emails or change what they say.
// Returns { sent, cards }. sent:false = the Sheet had already emailed this status.
async function sendStatusEmail(s) {
  if (DEMO) return { sent: true, cards: 1 };
  // An Apps Script without PortalEmails.gs would treat the request as a new website submission,
  // so check that it's installed first.
  const ping = await fetch(`${EMAIL_ENDPOINT}?action=portalEmails`).then((r) => r.json()).catch(() => null);
  if (!ping?.success) throw new Error("the Apps Script hasn't been updated yet (see apps-script/PortalEmails.gs)");
  const token = (await api.session())?.access_token;
  const res = await fetch(EMAIL_ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ type: "statusEmail", token, code: s.code }) });
  const out = await res.json().catch(() => null);
  if (!out?.success) throw new Error(out?.error || `Email service answered ${res.status}`);
  return out;
}
function emailBar(s) {
  const last = s.emailed_at ? ` · ${fmtDate(s.emailed_at)}` : "";
  if (!needsEmail(s)) return `<p class="muted small" style="margin:10px 0 0">✉ Customer emailed about
    <b>${esc(statusLabel(s.status))}</b>${esc(last)}</p>`;
  const c = customerOf(s) || {};
  return `<div class="panel" style="margin-top:12px;border-color:var(--gold)"><div class="row">
    <div class="grow">✉ <b>${esc(c.name || "Customer")} hasn't been emailed about “${esc(statusLabel(s.status))}”.</b>
      <div class="muted small">Last email: ${esc(statusLabel(emailedStatus(s)))}${esc(last)}${c.email ? "" : " · no email address on file"}</div></div>
    ${EMAIL_ENDPOINT && c.email ? `<button class="btn gold sm" id="esend">Send status email</button>` : ""}
    <button class="btn sm" id="emark" title="You told them another way (text, call, in person)">Mark as emailed</button></div></div>`;
}
function wireEmailBar(s) {
  $("#emark") && ($("#emark").onclick = async () => {
    try { await markEmailed(s); toast("Marked as emailed."); route(); } catch (e) { toast(e.message, 5000); } });
  $("#esend") && ($("#esend").onclick = async () => {
    $("#esend").disabled = true; $("#esend").textContent = "Sending…";
    try {
      const out = await sendStatusEmail(s); await markEmailed(s);
      toast(out.sent ? `Email sent (${out.cards} card${out.cards === 1 ? "" : "s"}).`
        : "Already emailed from the Sheet. Marked as emailed.", 5000);
      route();
    }
    catch (e) { toast(`Not sent: ${e.message}`, 6000); $("#esend").disabled = false; $("#esend").textContent = "Send status email"; }
  });
}

// -------------------------------------------------------------------- auth
async function start() {
  if (DEMO) await import("./demo/demo-data.js").catch(() => {});
  let session = null;
  try { session = await api.session(); }
  catch (err) { return loginPage(signInError(err)); }
  if (!session) return loginPage();
  if (!(await api.isAdmin().catch(() => false))) {
    app.innerHTML = `<div class="empty" style="margin-top:40px">Signed in as ${esc(session.user.email)}, but this
      account isn't on the admin list. Add it to the <b>admins</b> table in Supabase.<br><br>
      <button class="btn" id="so">Sign out</button></div>`;
    $("#so").onclick = async () => { await api.signOut(); location.reload(); };
    return;
  }
  $("#topbar").hidden = false;
  installHint("RR Portal");
  $("#signout").onclick = async () => { await api.signOut(); location.reload(); };
  // Installed as a phone app there's no browser reload, so offer one here.
  $("#refresh").onclick = async () => {
    const b = $("#refresh"); b.disabled = true; b.textContent = "Refreshing…";
    try { await reload(); route(); toast("Up to date."); }
    catch (err) { toast("Couldn't refresh: " + err.message); }
    finally { b.disabled = false; b.textContent = "↻ Refresh"; }
  };
  await reload();
  window.addEventListener("hashchange", route);
  route();
}

// Phone-friendly wording for what Supabase / the browser report.
function signInError(err) {
  const m = String((err && err.message) || err || "");
  if (/invalid login credentials/i.test(m)) return "Wrong email or password. Passwords are case-sensitive.";
  if (/email not confirmed/i.test(m)) return "This login hasn't been confirmed yet. Confirm the user in Supabase → Authentication → Users.";
  if (/rate limit|too many/i.test(m)) return "Too many tries. Wait a minute and try again.";
  if (/fetch|network|load|import|module/i.test(m))
    return "Couldn't reach the sign-in service. Check your connection (turn off any content blocker for this site) and try again.";
  return m || "Sign-in failed. Please try again.";
}

function loginPage(initialError = "") {
  app.innerHTML = `<div class="panel" style="max-width:380px;margin:60px auto">
    <div style="color:var(--gold);font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:13px">Restored Rarity</div>
    <h1>Portal sign in</h1>
    <form id="lf"><label class="f">Email</label><input type="email" id="le" autocomplete="username"
      inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false" required>
    <label class="f">Password</label><input type="password" id="lp" autocomplete="current-password"
      autocapitalize="none" autocorrect="off" spellcheck="false" required>
    <div style="margin-top:14px"><button class="btn gold" type="submit" id="lsub">Sign in</button></div>
    <p class="login-err" id="lerr" role="alert"></p></form></div>`;
  $("#lerr").textContent = initialError;
  $("#lf").onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("#lsub");
    btn.disabled = true; btn.textContent = "Signing in…"; $("#lerr").textContent = "";
    try { await api.signIn($("#le").value.trim().toLowerCase(), $("#lp").value); location.reload(); }
    catch (err) { $("#lerr").textContent = signInError(err); btn.disabled = false; btn.textContent = "Sign in"; }
  };
}

async function reload() { S = await api.loadAll(); }

// ------------------------------------------------------------------ router
function route() {
  const [page, id] = location.hash.replace(/^#\/?/, "").split("?")[0].split("/");
  $$("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === (page || "")));
  // On phones the tabs are one swipeable row: keep the current one in view.
  $("[data-nav].on")?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  const pages = { "": dashboard, cards: allCards, customers, customer, submission, card, new: newSubmission,
    site: (tab) => sitePage(app, tab) };
  (pages[page] || dashboard)(decodeURIComponent(id || ""));
}
const go = (h) => { if (location.hash === h) route(); else location.hash = h; };

// --------------------------------------------------------------- dashboard
function dashboard() {
  const counts = Object.fromEntries(STATUSES.map(([k]) => [k, 0]));
  S.submissions.forEach((s) => counts[s.status]++);
  let h = `<div class="row"><h1 class="grow">Submissions</h1><a class="btn gold" href="#/new">+ New submission</a></div>
    <div class="row" style="margin:12px 0">${STATUSES.map(([k, l]) =>
      `<button class="btn sm" data-f="${k}">${esc(l)} <b style="color:var(--gold)">${counts[k]}</b></button>`).join("")}
      <button class="btn sm" data-f="">All <b style="color:var(--gold)">${S.submissions.length}</b></button>
      <button class="btn sm" data-f="email">✉ Needs email <b style="color:var(--gold)">${S.submissions.filter(needsEmail).length}</b></button></div>
    <input type="search" id="q" placeholder="Search code, customer, email, card name…">
    <div class="panel" style="margin-top:12px;padding:0;overflow:auto"><table class="list"><thead><tr>
      <th>Code</th><th>Customer</th><th>Cards</th><th>Status</th><th class="hide-sm">Received</th><th class="hide-sm">Updated</th>
    </tr></thead><tbody id="rows"></tbody></table></div>`;
  app.innerHTML = h;
  let filter = "";
  const draw = () => {
    const words = $("#q").value.toLowerCase().split(/\s+/).filter(Boolean);
    const rows = S.submissions.filter((s) => !filter || (filter === "email" ? needsEmail(s) : s.status === filter)).filter((s) => {
      const c = customerOf(s) || {};
      const hay = [s.code, c.name, c.email, c.phone, s.service, ...subCards(s.id).map((k) => k.name + " " + k.details)]
        .join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    }).sort((a, b) => b.created_at.localeCompare(a.created_at));
    $("#rows").innerHTML = rows.map((s) => {
      const c = customerOf(s) || {};
      return `<tr class="click" data-go="#/submission/${s.id}"><td><b>${esc(s.code)}</b></td>
        <td>${esc(c.name)}<div class="muted small">${esc(c.email || c.phone || "")}</div></td>
        <td>${subCards(s.id).length}</td><td>${pill(s.status)}${needsEmail(s)
          ? ` <span title="Customer not emailed about this status yet" style="color:var(--gold)">✉</span>` : ""}</td>
        <td class="hide-sm">${esc(fmtDate(s.created_at))}</td><td class="hide-sm">${esc(fmtDate(s.updated_at))}</td></tr>`;
    }).join("") || `<tr><td colspan="6" class="muted">Nothing matches.</td></tr>`;
    $$("[data-go]").forEach((r) => r.onclick = () => go(r.dataset.go));
  };
  $("#q").oninput = draw;
  $$("[data-f]").forEach((b) => b.onclick = () => { filter = b.dataset.f; draw();
    $$("[data-f]").forEach((x) => x.classList.toggle("gold", x === b && !!filter)); });
  draw();
}

// --------------------------------------------------------------- all cards
// ------------------------------------------------------------ grading submissions
// cards.grading = where the card is being sent: PSA, CGC, BGS, TAG, "Not sure yet", or "" (not being graded).
const GRADERS = ["PSA", "CGC", "BGS", "TAG"];
const gradeTag = (g) => g ? `<span class="pill gtag" title="Grading submission">→ ${esc(g === "Not sure yet" ? "Grading (company?)" : g)}</span>` : "";
const gradingSelect = (id, val, blank = "Not being graded", cls = "") => `<select ${cls ? `class="${cls}"` : `id="${id}"`}><option value="">${blank}</option>
  ${GRADERS.map((g) => `<option ${g === val ? "selected" : ""}>${g}</option>`).join("")}
  <option value="Not sure yet" ${val === "Not sure yet" ? "selected" : ""}>Not sure yet</option></select>`;
const moneyTxt = (n) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
/** Keep a card's service text in step with its grading company (same wording as the website order form). */
function withGrading(service, grading, P, level = "") {
  let t = String(service || "").replace(/\s+—\s+grading.*$/i, "").trim();
  const solo = /^grading submission/i.test(t);
  if (!grading) return solo ? t : t.replace(/\s*\+\s*grading submission\s*\([^)]*\)/i, "").trim();
  if (t && !solo && !/\+\s*grading submission/i.test(t)) t += ` + Grading Submission (${moneyTxt(P ? P.gradingAddon : 5)})`;
  return `${t} — ${grading === "Not sure yet" ? "grading company not chosen yet" : "grading: " + grading}${grading === "PSA" && level ? ` (${level})` : ""}`.trim();
}
/** PSA service level menu (from the price list). */
const psaLevelSelect = (P, val) => `<select class="kgl"><option value="">Choose a level…</option>${(P.psaLevels || []).map((l) =>
  `<option value="${esc(l.name)}" ${l.name === val ? "selected" : ""}>${esc(l.name)} — ${moneyTxt(l.price)}${l.maxValue ? `, up to ${moneyTxt(l.maxValue)}` : ""}</option>`).join("")}</select>`;
const levelOf = (k) => k.grade_level || levelFromService(k.service);
const gradingSummary = (cards) => {
  const n = {}; cards.forEach((k) => { if (k.grading) n[k.grading] = (n[k.grading] || 0) + 1; });
  return Object.entries(n).map(([g, c]) => `${c} × ${g}`).join(", ");
};

// ------------------------------------------------------------ service editor
// One menu for New submission, the submission page and the card page, built from the price list.
function buildMenu(P) {
  const items = P.services.filter((x) => x && x.title).map((x) => {
    const solo = x.type === "addon" || x.type === "grading";
    return { kind: x.type === "addon" ? "slab" : x.type === "grading" ? "grading" : x.type, title: x.title,
      value: solo ? `${x.title} only (${moneyTxt(x.price)})` : `${x.title} (${moneyTxt(x.price)})`,
      label: x.type === "grading" ? `${x.title} only — ${moneyTxt(x.price)} first card, ${moneyTxt(P.gradingNext)} each after`
        : solo ? `${x.title} only — ${moneyTxt(x.price)}` : `${x.title} — ${moneyTxt(x.price)}${x.bulk ? " (bulk pricing in the quote)" : ""}` };
  });
  const GROUP = { clean: "Cleaning & grading prep", repair: "Repairs", slab: "On its own", grading: "On its own" };
  const labels = [...new Set(Object.values(GROUP))];
  const html = (sel = "", other = "") => `<option value="">Choose a service</option>` +
    labels.map((l) => `<optgroup label="${esc(l)}">${items.map((m, i) => GROUP[m.kind] === l
      ? `<option value="${i}" ${String(sel) === String(i) ? "selected" : ""}>${esc(m.label)}</option>` : "").join("")}</optgroup>`).join("") +
    (other ? `<option value="other" selected>As written: ${esc(other)}</option>` : "");
  return { items, html };
}
/** "Base Repair ($35) + Slab Cracking ($10) + Grading Submission ($5) — grading: PSA" → menu pick + add-ons. */
function parseService(text, M) {
  const t = String(text || "").trim();
  const crack = /\+\s*slab\s*cracking/i.test(t), grade = /\+\s*grading\s*submission/i.test(t);
  const base = t.replace(/\s*\+\s*(slab\s*cracking|grading\s*submission).*$/i, "").replace(/\s+—\s+grading.*$/i, "").trim();
  let idx = -1, len = 0;
  M.items.forEach((m, i) => { if (base.toLowerCase().startsWith(m.title.toLowerCase()) && m.title.length > len) { idx = i; len = m.title.length; } });
  return { idx, other: idx < 0 ? base : "", crack, grade };
}
const valueOf = (k) => (((k.customer_notes || "").match(/^(?:NM|Estimated|Card)?\s*value:\s*\$?\s*(.+)$/mi) || [])[1] || "").trim();
function withValue(notes, v) {
  const line = v ? `Card value: $${String(v).replace(/^\$/, "")}` : "";
  const re = /^(?:NM|Estimated|Card)?\s*value:.*$/mi;
  if (re.test(notes || "")) return String(notes).replace(re, line).replace(/\n{2,}/g, "\n").trim();
  return [notes, line].filter(Boolean).join("\n");
}
const cardServiceText = (k) => k.service || ((k.customer_notes || "").match(/^Service:\s*(.+)$/mi) || [])[1] || "";
/** Editor fields for one card (row class "svrow"). */
function serviceFields(k, M, P) {
  const cur = parseService(cardServiceText(k), M);
  return `<div class="svrow" data-id="${k.id}">
    <div class="grid2"><div><label class="f">Service</label><select class="ksv">${M.html(cur.idx >= 0 ? cur.idx : "", cur.other)}</select></div>
      <div><label class="f">Card value <span style="text-transform:none">(for repair surcharges)</span></label>
        <input type="text" class="kv" inputmode="decimal" placeholder="e.g. 300" value="${esc(valueOf(k))}"></div></div>
    <div class="row" style="margin-top:6px;gap:16px;flex-wrap:wrap">
      <label class="small kcw"><input type="checkbox" class="kc" ${cur.crack ? "checked" : ""}> Slab cracking (+${moneyTxt(P.slabAddon)})</label>
      <label class="small kgw"><input type="checkbox" class="kgb" ${cur.grade ? "checked" : ""}> Grading submission (+${moneyTxt(P.gradingAddon)})</label>
      <span class="kgco"><label class="small">Grading company ${gradingSelect("", k.grading || "", "Choose…", "kgs")}</label></span>
      <span class="kglw"><label class="small">PSA level ${psaLevelSelect(P, levelOf(k))}</label></span></div></div>`;
}
function wireServiceFields(r, M) {
  const sync = () => {
    const v = $(".ksv", r).value, m = M.items[v] || {};
    $(".kcw", r).hidden = m.kind === "slab"; if (m.kind === "slab") $(".kc", r).checked = false;
    $(".kgw", r).hidden = m.kind === "grading"; if (m.kind === "grading") $(".kgb", r).checked = false;
    $(".kgco", r).hidden = !(m.kind === "grading" || $(".kgb", r).checked);
    $(".kglw", r).hidden = $(".kgco", r).hidden || $(".kgs", r).value !== "PSA";
  };
  $(".ksv", r).onchange = sync; $(".kgb", r).onchange = sync; $(".kgs", r).onchange = sync; sync();
}
/** Read one editor → {service, grading, value} or {error}. */
function readServiceFields(r, M, P, label) {
  const sel = $(".ksv", r).value, m = M.items[sel];
  let service = sel === "other" ? $(".ksv option[value=other]", r).textContent.replace(/^As written:\s*/, "") : m ? m.value : "";
  const kind = m ? m.kind : "";
  if (service && $(".kc", r).checked && kind !== "slab") service += ` + Slab Cracking (${moneyTxt(P.slabAddon)})`;
  let grading = "", level = "";
  if (service && (kind === "grading" || $(".kgb", r).checked)) {
    grading = $(".kgs", r).value;
    if (!grading) return { error: `Choose a grading company for ${label} (or "Not sure yet").` };
    level = grading === "PSA" ? $(".kgl", r).value : "";
    if (grading === "PSA" && !level) return { error: `Choose a PSA service level for ${label}.` };
    service = withGrading(service, grading, P, level);
  }
  return { service, grading, grade_level: level, value: $(".kv", r).value.trim().replace(/^\$/, "") };
}
/** Save changed services: portal first, then the Sheet (so a website order's quote follows). Returns a message. */
async function saveServices(s, changes) {
  for (const { k, service, grading, grade_level, value } of changes) {
    const row = { service, grading, customer_notes: withValue(k.customer_notes, value) };
    if ("grade_level" in k || grade_level) row.grade_level = grade_level || "";   // column added by 2026-11-13_psa_tracking.sql
    Object.assign(k, await api.update("cards", k.id, row));
  }
  if (!changes.length) return "Nothing changed.";
  try {
    const out = await saveServicesToSheet(s.code, changes.map(({ k, service, value }) => ({ num: k.card_number, service, value })));
    return out.onSheet ? `Saved. The Sheet and the quote are updated (${out.updated} card${out.updated === 1 ? "" : "s"}).`
      : "Saved. This order was made in the portal, so its quote uses these services.";
  } catch (e) {
    return `Saved in the portal, but the Sheet wasn't updated: ${e.message}`;
  }
}

function cardTile(c) {
  const s = byId("submissions", c.submission_id) || {}, cu = customerOf(s) || {};
  const t = thumbOf(cardScans(c.id));
  return `<a class="tile" href="#/card/${c.id}">
    ${t ? `<img class="ph" src="${esc(mediaUrl(t))}" alt="" loading="lazy">` : `<div class="ph">Not scanned</div>`}
    <div class="n">${esc(cardTitle(c))}</div>
    <div class="s">${esc(s.code)} · #${c.card_number} · ${esc(cu.name || "")}</div>${pill(c.status)} ${gradeTag(c.grading)}</a>`;
}

function allCards() {
  app.innerHTML = `<div class="row"><h1 class="grow">All cards</h1>
    <select id="st" style="max-width:240px"><option value="">Any status</option>${STATUSES.map(([k, l]) =>
      `<option value="${k}">${esc(l)}</option>`).join("")}</select>
    <select id="sc" style="max-width:200px"><option value="">Scanned or not</option>
      <option value="no">Not scanned yet</option><option value="before">Has before scan</option>
      <option value="after">Has after scan</option></select>
    <select id="gr" style="max-width:200px"><option value="">Any grading</option><option value="any">Being graded</option>
      ${GRADERS.map((g) => `<option>${g}</option>`).join("")}<option value="Not sure yet">Grading, company not chosen</option></select></div>
    <input type="search" id="q" placeholder="Search card, set, customer, code…" style="margin:12px 0">
    <p class="muted small" id="cnt"></p><div class="tiles" id="g"></div>`;
  const draw = () => {
    const words = $("#q").value.toLowerCase().split(/\s+/).filter(Boolean), st = $("#st").value, sc = $("#sc").value, gr = $("#gr").value;
    const list = S.cards.filter((c) => {
      const s = byId("submissions", c.submission_id) || {}, cu = customerOf(s) || {};
      const scans = cardScans(c.id);
      if (st && c.status !== st) return false;
      if (gr === "any" ? !c.grading : gr && c.grading !== gr) return false;
      if (sc === "no" && scans.length) return false;
      if ((sc === "before" || sc === "after") && !scans.some((x) => x.stage === sc)) return false;
      const hay = [c.name, c.details, s.code, cu.name, cu.email, c.public_notes, c.internal_notes, c.service, c.grading].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    }).sort((a, b) => b.created_at.localeCompare(a.created_at));
    $("#cnt").textContent = `${list.length} of ${S.cards.length} cards`;
    $("#g").innerHTML = list.map(cardTile).join("") || `<div class="empty">No cards match.</div>`;
  };
  ["#q", "#st", "#sc", "#gr"].forEach((s) => $(s).oninput = draw);
  const want = new URLSearchParams(location.hash.split("?")[1] || "").get("grading");   // #/cards?grading=PSA
  if (want) { $("#gr").value = want; }
  draw();
}

// --------------------------------------------------------------- customers
function customers() {
  app.innerHTML = `<div class="row"><h1 class="grow">Customers</h1><a class="btn gold" href="#/new">+ New submission</a></div>
    <input type="search" id="q" placeholder="Search name, email, phone…" style="margin:12px 0">
    <div class="panel" style="padding:0;overflow:auto"><table class="list"><thead><tr><th>Name</th><th class="hide-sm">Email</th>
    <th class="hide-sm">Phone</th><th>Submissions</th><th>Cards</th><th class="hide-sm">Since</th></tr></thead><tbody id="rows"></tbody></table></div>`;
  const draw = () => {
    const words = $("#q").value.toLowerCase().split(/\s+/).filter(Boolean);
    $("#rows").innerHTML = S.customers.filter((c) =>
      words.every((w) => [c.name, c.email, c.phone].join(" ").toLowerCase().includes(w)))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "")).map((c) => {
        const subs = custSubs(c.id);
        const n = subs.reduce((t, s) => t + subCards(s.id).length, 0);
        return `<tr class="click" data-go="#/customer/${c.id}"><td><b>${esc(c.name || "(no name)")}</b></td>
          <td class="hide-sm">${esc(c.email || "")}</td><td class="hide-sm">${esc(c.phone || "")}</td>
          <td>${subs.length}</td><td>${n}</td><td class="hide-sm">${esc(fmtDate(c.created_at))}</td></tr>`;
      }).join("") || `<tr><td colspan="6" class="muted">No customers yet.</td></tr>`;
    $$("[data-go]").forEach((r) => r.onclick = () => go(r.dataset.go));
  };
  $("#q").oninput = draw; draw();
}

// ------------------------------------------------------- customer profile
function linkBox(c) {
  return `<div class="panel" style="border-left:3px solid var(--gold)"><h3 style="margin-top:0">Customer link</h3>
    <p class="muted small" style="margin:0 0 8px">Send this to ${esc(c.name || "the customer")}. It shows every submission,
    card, scan and photo on this profile — and lets them add photos. No password needed.</p>
    <div class="row"><input type="text" readonly value="${esc(customerLink(c.share_token))}" id="link" class="grow" style="width:auto">
    <button class="btn gold" id="copy">Copy</button><a class="btn" target="_blank" href="${esc(customerLink(c.share_token))}">Open</a>
    <button class="btn danger" id="relink" title="The old link stops working">New link</button></div></div>`;
}
function wireLinkBox(c) {
  $("#copy").onclick = async () => { await navigator.clipboard.writeText($("#link").value); toast("Link copied."); };
  $("#relink").onclick = async () => {
    if (!confirm("Make a new link? The old link will stop working.")) return;
    c.share_token = await api.newLink(c.id); toast("New link made."); route();
  };
}

function photosAdmin(photos, ctx) {
  const opts = ctx.cards.map((k) => {
    const s = byId("submissions", k.submission_id);
    return `<option value="${k.id}">${esc(s?.code)} · #${k.card_number} ${esc(k.name)}</option>`;
  }).join("");
  return `${photos.length ? `<div class="photos">${photos.map((p) => {
      const k = p.card_id && byId("cards", p.card_id);
      const src = { intake: "Intake form", admin: "Added by you", customer: "Customer" }[p.source];
      return `<figure><img class="zoom" src="${esc(mediaUrl(p.path))}" alt="" loading="lazy">
        <button class="x" data-delp="${p.id}" title="Delete">✕</button>
        <figcaption title="${esc(p.caption)}">${esc(src)}${k ? ` · #${k.card_number}` : ""}${p.caption ? " · " + esc(p.caption) : ""}</figcaption></figure>`;
    }).join("")}</div>` : `<p class="muted small">No photos yet.</p>`}
    <div class="drop"><div class="row"><input type="file" id="pf" accept="image/*" multiple style="max-width:250px">
    ${ctx.fixedCard ? "" : `<select id="pc" style="max-width:260px"><option value="">Whole profile (no card)</option>${opts}</select>`}
    <input type="text" id="pcap" placeholder="Caption (optional)" class="grow" style="width:auto;min-width:150px">
    <button class="btn gold" id="pup">Add photos</button></div></div>`;
}
function wirePhotosAdmin(ctx) {
  $("#pup").onclick = async () => {
    const files = [...$("#pf").files];
    if (!files.length) return toast("Choose photos first.");
    const cardId = ctx.fixedCard || $("#pc")?.value || null;
    const card = cardId && byId("cards", cardId);
    $("#pup").disabled = true;
    try {
      for (const [i, f] of files.entries()) {
        $("#pup").textContent = `Uploading ${i + 1}/${files.length}…`;
        const path = await api.adminUpload(ctx.customer.storage_key, f);
        S.photos.push(await api.insert("photos", { customer_id: ctx.customer.id, card_id: cardId,
          submission_id: card ? card.submission_id : (ctx.submissionId || null),
          path, source: "admin", caption: $("#pcap").value }));
      }
      toast("Photos added."); route();
    } catch (e) { toast("Upload failed: " + e.message, 5000); $("#pup").disabled = false; $("#pup").textContent = "Add photos"; }
  };
  $$("[data-delp]").forEach((b) => b.onclick = async () => {
    if (!confirm("Delete this photo?")) return;
    const p = byId("photos", b.dataset.delp);
    await api.remove("photos", p.id); await api.removeFiles([p.path]).catch(() => {});
    S.photos = S.photos.filter((x) => x.id !== p.id); route();
  });
}

function customer(id) {
  const c = byId("customers", id);
  if (!c) return notFound();
  const subs = custSubs(id), cards = subs.flatMap((s) => subCards(s.id));
  app.innerHTML = `<p><a href="#/customers">← Customers</a></p>
    <div class="row"><h1 class="grow">${esc(c.name || "(no name)")}</h1>
      <a class="btn gold" href="#/new/${c.id}">+ New submission</a></div>
    <div class="meta"><span>Customer since <b>${esc(fmtDate(c.created_at))}</b></span>
      <span><b>${subs.length}</b> submissions</span><span><b>${cards.length}</b> cards</span></div>
    <div style="margin-top:14px">${linkBox(c)}</div>
    <div class="panel" style="margin-top:14px"><div class="grid2">
      <div><label class="f">Name</label><input type="text" id="cn" value="${esc(c.name)}"></div>
      <div><label class="f">Email</label><input type="email" id="ce" value="${esc(c.email || "")}"></div>
      <div><label class="f">Phone</label><input type="tel" id="cp" value="${esc(c.phone || "")}"></div>
      <div><label class="f">Private notes (only you)</label><textarea id="ci">${esc(c.internal_notes || "")}</textarea></div>
    </div><div class="row" style="margin-top:10px"><button class="btn gold" id="csave">Save profile</button>
      <span class="grow"></span><button class="btn danger" id="cdel">Delete profile</button></div></div>
    <h2>Submissions & cards</h2>
    ${subs.map((s) => `<div class="panel" style="margin-top:12px"><div class="row">
      <a class="grow" href="#/submission/${s.id}" style="text-decoration:none"><b style="font-size:17px">${esc(s.code)}</b>
      <span class="muted small"> · ${esc(fmtDate(s.created_at))}${s.service ? " · " + esc(s.service) : ""}</span></a>${pill(s.status)}</div>
      <div class="tiles" style="margin-top:12px">${subCards(s.id).map(cardTile).join("")}</div></div>`).join("")
      || `<div class="empty">No submissions yet.</div>`}
    <h2>Photos</h2>${photosAdmin(S.photos.filter((p) => p.customer_id === id), { cards })}`;
  wireLinkBox(c);
  wirePhotosAdmin({ customer: c, cards });
  $("#csave").onclick = async () => {
    try {
      Object.assign(c, await api.update("customers", c.id, { name: $("#cn").value.trim(),
        email: $("#ce").value.trim() || null, phone: $("#cp").value.trim() || null, internal_notes: $("#ci").value }));
      toast("Saved.");
    } catch (e) { toast(e.message, 5000); }
  };
  $("#cdel").onclick = async () => {
    if (!confirm(`Delete ${c.name} and ALL their submissions, cards, scans and photos? This can't be undone.`)) return;
    const paths = S.photos.filter((p) => p.customer_id === id).map((p) => p.path)
      .concat(cards.flatMap((k) => scanPaths(k.id)));
    await api.remove("customers", c.id); await api.removeFiles(paths).catch(() => {});
    await reload(); go("#/customers");
  };
}

// --------------------------------------------------------------- submission
function submission(id) {
  const s = byId("submissions", id);
  if (!s) return notFound();
  const c = customerOf(s), cards = subCards(id);
  app.innerHTML = `<p><a href="#/">← Submissions</a> · <a href="#/customer/${c.id}">${esc(c.name)}</a></p>
    <div class="row"><h1 class="grow">${esc(s.code)}</h1>${pill(s.status)}</div>
    <div class="meta"><span>Customer <b><a href="#/customer/${c.id}">${esc(c.name)}</a></b></span>
      <span>Received <b>${esc(fmtDate(s.created_at))}</b></span><span><b>${cards.length}</b> cards</span></div>
    ${progressSteps(s.status)}${emailBar(s)}${quotePanel()}${psaPanel(cards)}
    <div class="panel" style="margin-top:14px"><div class="grid2">
      <div><label class="f">Status</label>${statusSelect("ss", s.status)}
        <label class="small" style="display:block;margin-top:6px"><input type="checkbox" id="sall" checked> Also set every card to this status</label></div>
      <div><label class="f">Service</label><input type="text" id="sv" value="${esc(s.service)}"></div>
      <div><label class="f">Note to customer (they see this)</label><textarea id="sp">${esc(s.public_notes)}</textarea></div>
      <div><label class="f">Private notes (only you)</label><textarea id="si">${esc(s.internal_notes)}</textarea></div>
    </div>
    ${s.customer_notes ? `<label class="f">Customer's notes from intake</label><div class="muted">${esc(s.customer_notes)}</div>` : ""}
    <div class="row" style="margin-top:12px"><button class="btn gold" id="ssave">Save</button>
      <span class="grow"></span><button class="btn danger" id="sdel">Delete submission</button></div></div>
    <div class="row"><h2 class="grow">Cards</h2>
      <a class="btn" target="rr-scan" href="${esc(scanUrl(id))}" title="Open the scan station at the first card without a scan">📷 Scan cards</a></div>
    ${gradingSummary(cards) ? `<p class="small" style="margin:0 0 8px">Grading submission: <b>${esc(gradingSummary(cards))}</b></p>` : ""}
    ${(n => n ? `<p class="small setneed-note">${n === 1 ? "1 card still needs" : `${n} cards still need`} a set — open the card and fill in Set / number / year.</p>` : "")(cards.filter((k) => !String(k.details || "").trim()).length)}
    <div class="panel" style="padding:0;overflow:auto"><table class="list"><thead><tr><th></th><th>#</th><th>Card</th>
      <th class="hide-sm">Set / number</th><th>Status</th><th>Grading</th><th class="hide-sm">Scans</th><th></th></tr></thead><tbody>
    ${cards.map((k) => { const t = thumbOf(cardScans(k.id)); const st = [...new Set(cardScans(k.id).map((x) => x.stage))];
      const ns = nextStage(k.id);
      return `<tr class="click" data-go="#/card/${k.id}"><td style="width:54px">${t ? `<img src="${esc(mediaUrl(t))}" style="height:52px;border-radius:4px">` : ""}</td>
      <td>${k.card_number}</td><td><b>${esc(k.name || "—")}</b>${k.details ? "" : ` <span class="setneed">Set needed</span>`}</td><td class="hide-sm">${esc(k.details)}</td>
      <td>${pill(k.status)}</td><td>${gradeTag(k.grading) || `<span class="muted small">—</span>`}</td><td class="hide-sm muted small">${esc(st.join(", ") || "none")}</td>
      <td><a class="btn sm" target="rr-scan" href="${esc(scanUrl(id, k.card_number, ns))}"
        title="Scan this card (${esc(STAGE_LABEL[ns])})">📷 Scan</a></td></tr>`; }).join("")
      || `<tr><td colspan="8" class="muted">No cards.</td></tr>`}</tbody></table></div>
    <div class="panel" id="svpanel" style="margin-top:12px"><div class="row"><h3 class="grow" style="margin:0">Services &amp; levels</h3>
      <button class="btn sm" id="svopen">Adjust services</button></div>
      <p class="muted small" style="margin:6px 0 0">Change any card's service, add-ons, grading company or value. Saving updates the Sheet and the quote.</p>
      <div id="svbody" hidden></div></div>
    <div class="panel" style="margin-top:12px"><h3 style="margin-top:0">Add a card</h3><div class="row">
      <input type="text" id="kn" placeholder="Card name" class="grow" style="width:auto">
      <input type="text" id="kd" placeholder="Set / number / year" class="grow" style="width:auto">
      <button class="btn gold" id="kadd">Add card #${(cards.at(-1)?.card_number || 0) + 1}</button></div>
      <p class="muted small" style="margin:8px 0 0">📷 Scan opens the scan station set to that card. In the Windows app, use submission <b>${esc(s.code)}</b> and the card number.</p></div>
    <h2>Photos</h2>${photosAdmin(S.photos.filter((p) => p.submission_id === id), { cards })}`;
  $$("[data-go]").forEach((r) => r.onclick = (e) => { if (!e.target.closest("a")) go(r.dataset.go); });
  window.RRCardSearch?.attach($("#kn"), { details: $("#kd") });
  $("#svopen").onclick = async () => {
    const body = $("#svbody");
    if (!body.hidden) { body.hidden = true; $("#svopen").textContent = "Adjust services"; return; }
    $("#svopen").textContent = "Close"; body.hidden = false; body.innerHTML = `<p class="muted small">Loading your services…</p>`;
    const P = await currentPrices(), M = buildMenu(P);
    body.innerHTML = cards.map((k) => `<div style="border-top:1px solid var(--line);margin-top:12px;padding-top:10px">
        <b>#${k.card_number} ${esc(k.name || "")}</b> ${cardServiceText(k) ? `<span class="muted small">— now: ${esc(cardServiceText(k))}</span>` : ""}
        ${serviceFields(k, M, P)}</div>`).join("") +
      `<div class="row" style="margin-top:14px"><button class="btn gold" id="svsave">Save services</button><span class="muted small" id="svmsg"></span></div>`;
    $$(".svrow", body).forEach((r) => wireServiceFields(r, M));
    $("#svsave").onclick = async () => {
      const changes = [];
      for (const r of $$(".svrow", body)) {
        const k = byId("cards", r.dataset.id), got = readServiceFields(r, M, P, `card #${k.card_number}`);
        if (got.error) return toast(got.error, 6000);
        if (got.service !== cardServiceText(k) || got.grading !== (k.grading || "") || got.value !== valueOf(k) || (got.grade_level || "") !== levelOf(k)) changes.push({ k, ...got });
      }
      $("#svsave").disabled = true; $("#svmsg").textContent = "Saving…";
      try { toast(await saveServices(s, changes), 7000); route(); }
      catch (e) { toast(e.message, 6000); $("#svsave").disabled = false; $("#svmsg").textContent = ""; }
    };
  };
  wireEmailBar(s);
  wireQuote(s, cards);
  wirePsa(s, cards, { prices: currentPrices, saveToSheet: savePsaToSheet });
  wirePhotosAdmin({ customer: c, cards, submissionId: id });
  $("#ssave").onclick = async () => {
    try {
      const status = $("#ss").value;
      Object.assign(s, await api.update("submissions", id, { status, service: $("#sv").value,
        public_notes: $("#sp").value, internal_notes: $("#si").value }));
      if ($("#sall").checked) for (const k of cards) if (k.status !== status) Object.assign(k, await api.update("cards", k.id, { status }));
      toast("Saved."); route();
    } catch (e) { toast(e.message, 5000); }
  };
  $("#kadd").onclick = async () => {
    const row = { submission_id: id, card_number: (cards.at(-1)?.card_number || 0) + 1,
      name: $("#kn").value.trim(), details: $("#kd").value.trim(), status: s.status === "submitted" ? "received" : s.status };
    try { S.cards.push(await api.insert("cards", row)); route(); } catch (e) { toast(e.message, 5000); }
  };
  $("#sdel").onclick = async () => {
    if (!confirm(`Delete ${s.code} with its ${cards.length} cards and their scans?`)) return;
    const paths = cards.flatMap((k) => scanPaths(k.id));
    await api.remove("submissions", id); await api.removeFiles(paths).catch(() => {});
    await reload(); go(`#/customer/${c.id}`);
  };
}

// Opens the scan station (reusing its tab, so folder watching keeps running) set to this card.
const scanUrl = (subId, cardNo, stage) =>
  `scan.html${DEMO ? "?demo" : ""}#sub=${subId}${cardNo ? `&card=${cardNo}` : ""}${stage ? `&stage=${stage}` : ""}`;
const nextStage = (cardId) => (cardScans(cardId).some((x) => x.stage === "before") ? "after" : "before");

function scanPaths(cardId) {
  return cardScans(cardId).flatMap((x) => { const f = x.files || {};
    return [f.web, f.thumb, ...Object.values(f.corners || {}), ...Object.values(f.edges || {})].filter(Boolean); });
}

// --------------------------------------------------------------------- card
function card(id) {
  const k = byId("cards", id);
  if (!k) return notFound();
  const s = byId("submissions", k.submission_id), c = customerOf(s);
  app.innerHTML = `<p><a href="#/submission/${s.id}">← ${esc(s.code)}</a> · <a href="#/customer/${c.id}">${esc(c.name)}</a></p>
    <div class="row"><h1 class="grow">${esc(cardTitle(k))}</h1>${pill(k.status)}</div>
    <div class="meta"><span>Submission <b>${esc(s.code)}</b></span><span>Card <b>#${k.card_number}</b></span>
      ${k.details ? `<span><b>${esc(k.details)}</b></span>` : `<span class="setneed">Set needed</span>`}</div>
    <div class="panel" style="margin-top:14px"><div class="grid2">
      <div><label class="f">Card name</label><input type="text" id="kn" value="${esc(k.name)}"></div>
      <div><label class="f">Set / number / year</label><input type="text" id="kd" value="${esc(k.details)}" placeholder="e.g. Base Set · 4/102 · 1999"></div>
      <div><label class="f">Status</label>${statusSelect("ks", k.status)}</div><div></div>
      <div style="grid-column:1/-1" id="ksvc"><span class="muted small">Loading services…</span></div>
      <div><label class="f">Note to customer (they see this)</label><textarea id="kp">${esc(k.public_notes)}</textarea></div>
      <div><label class="f">Private notes (only you)</label><textarea id="ki">${esc(k.internal_notes)}</textarea></div>
    </div>
    ${k.customer_notes ? `<label class="f">Customer's notes from intake</label><div class="muted">${esc(k.customer_notes)}</div>` : ""}
    <div class="row" style="margin-top:12px"><button class="btn gold" id="ksave">Save</button>
      <a class="btn" target="_blank" href="${esc(customerLink(c.share_token))}&c=${k.id}">View as customer</a>
      <span class="grow"></span><button class="btn danger" id="kdel">Delete card</button></div></div>
    <div class="row"><h2 class="grow">Scans</h2><span class="muted small">📷 Scan</span>
      ${["before", "progress", "after"].map((g) => `<a class="btn sm${g === nextStage(id) ? " gold" : ""}" target="rr-scan"
        href="${esc(scanUrl(s.id, k.card_number, g))}">${esc(STAGE_LABEL[g].split(" (")[0])}</a>`).join("")}</div>
    ${renderReport(cardScans(id))}
    <div class="row" style="margin-top:10px;gap:8px"><span class="muted small">⤴ Upload a scan or photo:</span>
      <select id="upstage" style="width:auto">${["before", "progress", "after"].map((g) =>
        `<option value="${g}" ${g === nextStage(id) ? "selected" : ""}>${esc(STAGE_LABEL[g].split(" (")[0])}</option>`).join("")}</select>
      <select id="upside" style="width:auto"><option value="front">Front</option><option value="back">Back</option></select>
      <button class="btn sm" id="upbtn">Choose file…</button>
      <input type="file" id="upfile" accept="image/png,image/jpeg,image/webp" hidden><span class="muted small" id="upmsg"></span></div>
    <p class="muted small">📷 opens the scan station set to ${esc(s.code)} card #${k.card_number}; scan the front, flip, scan the back.
      An uploaded image is cropped and measured like a scan and replaces that stage/side if there is one.</p>
    <h2>Photos</h2>${photosAdmin(S.photos.filter((p) => p.card_id === id), { cards: [k], fixedCard: id })}`;
  wireReport(app, {
    scans: cardScans(id), editable: true, title: cardTitle(k),
    onSaveCentering: async (scan, cen) => {
      const files = { ...scan.files, centering: cen };
      if (!files.centering_auto && scan.files.centering?.auto !== false) files.centering_auto = scan.files.centering;
      Object.assign(scan, await api.update("scans", scan.id, { files }));
    },
    onClose: () => route(),
    onScanAction: async (act, stage, side, scan) => {
      if (act === "rep") { $("#upstage").value = stage; $("#upside").value = side; $("#upfile").click(); return; }
      if (!scan || !confirm(`Delete the ${side} scan (${STAGE_LABEL[stage]})? Its close-ups and centering go too.`)) return;
      try { await U.deleteScan(scan); S.scans = S.scans.filter((x) => x.id !== scan.id); toast("Scan deleted."); route(); }
      catch (e) { toast(e.message, 5000); }
    },
  });
  $("#upbtn").onclick = () => $("#upfile").click();
  $("#upfile").onchange = async () => {
    const file = $("#upfile").files[0]; $("#upfile").value = ""; if (!file) return;
    const stage = $("#upstage").value, side = $("#upside").value, msg = $("#upmsg");
    const old = cardScans(id).find((x) => x.stage === stage && x.side === side);
    if (old && !confirm(`Replace the ${side} scan (${STAGE_LABEL[stage]}) with ${file.name}?`)) return;
    try {
      msg.textContent = "Finding the card…";
      let cardImg = (await U.analyze(file)).cards[0];
      if (cardImg) URL.revokeObjectURL(cardImg.thumbUrl);
      if (!cardImg || !cardImg.ok) {
        if (!confirm("Couldn't find the card's edges in that image. Save the whole picture as it is (no close-ups or centering)?")) { msg.textContent = ""; return; }
        cardImg = await U.asIs(file);
      }
      msg.textContent = "Uploading…";
      const row = await U.saveSide({ storageKey: c.storage_key, code: s.code, card: k, stage, side, c: cardImg, oldRow: old,
        original: { file: file.name, folder: "uploaded" } });
      S.scans = S.scans.filter((x) => !(x.card_id === id && x.stage === stage && x.side === side)).concat([row]);
      toast(`${side === "front" ? "Front" : "Back"} saved (${STAGE_LABEL[stage]}).`); route();
    } catch (e) { msg.textContent = ""; toast(e.message, 5000); }
  };
  wirePhotosAdmin({ customer: c, cards: [k], fixedCard: id });
  window.RRCardSearch?.attach($("#kn"), { details: $("#kd") });
  let SV = null;   // the service editor, once the price list has loaded
  currentPrices().then((P) => {
    const M = buildMenu(P), box = $("#ksvc"); if (!box) return;
    box.innerHTML = serviceFields(k, M, P) + `<p class="muted small" style="margin:4px 0 0">Saving updates the Sheet and the quote too.</p>`;
    wireServiceFields($(".svrow", box), M); SV = { M, P };
  });
  $("#ksave").onclick = async () => {
    try {
      const got = SV ? readServiceFields($(".svrow", app), SV.M, SV.P, "this card") : null;
      if (got && got.error) return toast(got.error, 6000);
      if (!$("#kd").value.trim() && window.RRCardSearch?.info) $("#kd").value = RRCardSearch.detailsOf(await RRCardSearch.info($("#kn")));
      Object.assign(k, await api.update("cards", id, { name: $("#kn").value.trim(), details: $("#kd").value.trim(),
        status: $("#ks").value, public_notes: $("#kp").value, internal_notes: $("#ki").value }));
      const changed = got && (got.service !== cardServiceText(k) || got.grading !== (k.grading || "") || got.value !== valueOf(k) || (got.grade_level || "") !== levelOf(k));
      toast(changed ? await saveServices(s, [{ k, ...got }]) : "Saved.", 6000); route();
    } catch (e) { toast(e.message, 5000); }
  };
  $("#kdel").onclick = async () => {
    if (!confirm(`Delete ${cardTitle(k)} and its scans?`)) return;
    const paths = scanPaths(id);
    await api.remove("cards", id); await api.removeFiles(paths).catch(() => {});
    await reload(); go(`#/submission/${s.id}`);
  };
}

// --------------------------------------------------------- new submission
async function newSubmission(customerId) {
  const opts = [...S.customers].sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .map((c) => `<option value="${c.id}" ${c.id === customerId ? "selected" : ""}>${esc(c.name)}${c.email ? " — " + esc(c.email) : ""}</option>`).join("");
  app.innerHTML = `<div class="empty">Loading your services…</div>`;
  const P = await currentPrices(), M = buildMenu(P), MENU = M.items, menuHtml = M.html();
  app.innerHTML = `<h1>New submission</h1>
    <div class="panel"><label class="f">Customer</label>
      <select id="nc"><option value="">➕ New customer…</option>${opts}</select>
      <div id="newc" class="grid2" style="margin-top:6px">
        <div><label class="f">Name</label><input type="text" id="nn"></div>
        <div><label class="f">Email</label><input type="email" id="ne"></div>
        <div><label class="f">Phone</label><input type="tel" id="np"></div></div>
      <div class="grid2"><div><label class="f">Status</label>${statusSelect("nst", "received")}</div>
        <div><label class="f">Service summary <span style="text-transform:none">(optional; filled in from the cards if blank)</span></label>
          <input type="text" id="nsv" placeholder="e.g. Repairs + grading"></div></div>
      <h3>Cards</h3><div id="ncards"></div>
      <button class="btn sm" id="nadd">+ Add another card</button>
      <div class="row" style="margin-top:16px"><button class="btn gold" id="ncreate">Create submission</button>
        <span class="muted small">The quote on the next page is worked out from these services.</span></div></div>`;
  const addRow = () => {
    const n = $$("#ncards .ncard").length + 1;
    $("#ncards").insertAdjacentHTML("beforeend", `<div class="panel ncard" style="margin-bottom:10px">
      <div class="row" style="margin-bottom:6px"><b class="grow">Card #${n}</b>${n > 1 ? `<button class="btn sm danger nrm" aria-label="Remove card">✕</button>` : ""}</div>
      <div class="grid2"><div><label class="f">Card name</label><input type="text" class="kn" placeholder="Start typing, e.g. Charizard"></div>
        <div><label class="f">Set / number / year</label><input type="text" class="kd"></div>
        <div><label class="f">Service</label><select class="ksv">${menuHtml}</select></div>
        <div><label class="f">Card value <span style="text-transform:none">(for repair surcharges; optional)</span></label><input type="text" class="kv" inputmode="decimal" placeholder="e.g. 300"></div></div>
      <div class="row" style="margin-top:8px;gap:16px;flex-wrap:wrap">
        <label class="small kcw"><input type="checkbox" class="kc"> Slab cracking (+${moneyTxt(P.slabAddon)})</label>
        <label class="small kgw"><input type="checkbox" class="kgb"> Grading submission (+${moneyTxt(P.gradingAddon)})</label>
        <span class="kgco" hidden><label class="small">Grading company ${gradingSelect("", "", "Choose…", "kgs")}</label></span>
        <span class="kglw" hidden><label class="small">PSA level ${psaLevelSelect(P, "")}</label></span></div></div>`);
    const r = $$("#ncards .ncard").at(-1);
    window.RRCardSearch?.attach($(".kn", r), { details: $(".kd", r) });
    const sync = () => {
      const m = MENU[$(".ksv", r).value] || {};
      $(".kcw", r).hidden = m.kind === "slab"; if (m.kind === "slab") $(".kc", r).checked = false;
      $(".kgw", r).hidden = m.kind === "grading"; if (m.kind === "grading") $(".kgb", r).checked = false;
      $(".kgco", r).hidden = !(m.kind === "grading" || $(".kgb", r).checked);
      $(".kglw", r).hidden = $(".kgco", r).hidden || $(".kgs", r).value !== "PSA";
      // suggest the cheapest PSA level that covers the card's value
      const v = parseFloat($(".kv", r).value.replace(/[$,]/g, "")) || 0;
      if (!$(".kglw", r).hidden && !$(".kgl", r).dataset.touched) {
        const l = (P.psaLevels || []).find((x) => !(x.maxValue > 0) || !v || v <= x.maxValue) || (P.psaLevels || []).at(-1);
        if (l) $(".kgl", r).value = l.name;
      }
    };
    $(".ksv", r).onchange = sync; $(".kgb", r).onchange = sync; $(".kgs", r).onchange = sync; $(".kv", r).oninput = sync;
    $(".kgl", r).onchange = () => { $(".kgl", r).dataset.touched = "1"; };
    sync();
    $(".nrm", r)?.addEventListener("click", () => { r.remove(); $$("#ncards .ncard b").forEach((b, i) => { b.textContent = `Card #${i + 1}`; }); });
  };
  addRow();
  $("#nadd").onclick = addRow;
  const sync = () => { $("#newc").style.display = $("#nc").value ? "none" : ""; };
  $("#nc").onchange = sync; sync();
  $("#ncreate").onclick = async () => {
    const rows = [];
    for (const [i, r] of $$("#ncards .ncard").entries()) {
      if (!$(".kd", r).value.trim() && $(".kn", r).value.trim() && window.RRCardSearch?.info)
        $(".kd", r).value = RRCardSearch.detailsOf(await RRCardSearch.info($(".kn", r)));
      const name = $(".kn", r).value.trim(), details = $(".kd", r).value.trim(), m = MENU[$(".ksv", r).value];
      if (!name && !details && !m) continue;
      if (!name) return toast(`Card #${i + 1} needs a name.`);
      let service = "", grading = "", grade_level = "";
      if (m) {
        service = m.value;
        if ($(".kc", r).checked && m.kind !== "slab") service += ` + Slab Cracking (${moneyTxt(P.slabAddon)})`;
        if (m.kind === "grading" || $(".kgb", r).checked) {
          grading = $(".kgs", r).value;
          if (!grading) return toast(`Choose a grading company for card #${i + 1} (or "Not sure yet").`);
          grade_level = grading === "PSA" ? $(".kgl", r).value : "";
          if (grading === "PSA" && !grade_level) return toast(`Choose a PSA service level for card #${i + 1}.`);
          service = withGrading(service, grading, P, grade_level);
        }
      }
      const v = $(".kv", r).value.trim().replace(/^\$/, "");
      rows.push({ name, details, service, grading, ...(grade_level ? { grade_level } : {}), customer_notes: v ? `Card value: $${v}` : "", title: m ? m.title : "" });
    }
    if (!rows.length) return toast("Add at least one card.");
    $("#ncreate").disabled = true;
    try {
      let cust = $("#nc").value && byId("customers", $("#nc").value);
      if (!cust) {
        if (!$("#nn").value.trim()) { $("#ncreate").disabled = false; return toast("Enter the customer's name."); }
        cust = await api.insert("customers", { name: $("#nn").value.trim(),
          email: $("#ne").value.trim() || null, phone: $("#np").value.trim() || null });
        S.customers.push(cust);
      }
      const status = $("#nst").value;
      const summary = $("#nsv").value.trim() || [...new Set(rows.map((r) => r.title).filter(Boolean))].join(", ").slice(0, 200);
      const sub = await api.insert("submissions", { customer_id: cust.id, status, service: summary });
      S.submissions.push(sub);
      for (const [i, { title, ...r }] of rows.entries()) {
        S.cards.push(await api.insert("cards", { submission_id: sub.id, card_number: i + 1, ...r, status }));
      }
      toast(`Created ${sub.code}.`);
      go(`#/submission/${sub.id}`);
    } catch (e) {
      $("#ncreate").disabled = false;
      if (/grade_level/i.test(e.message)) return toast("The database needs a one-time update first: in Supabase → SQL Editor, run supabase/2026-11-13_psa_tracking.sql, then try again.", 9000);
      if (/service|grading|column/i.test(e.message)) return toast("The database needs a one-time update first: in Supabase → SQL Editor, run supabase/2026-11-07_card_grading.sql, then try again.", 9000);
      toast(e.message, 6000);
    }
  };
}

function notFound() { app.innerHTML = `<div class="empty">Not found. <a href="#/">Back to submissions</a></div>`; }

start().catch((e) => { app.innerHTML = `<div class="empty">Couldn't load the portal: ${esc(e.message)}</div>`; });
