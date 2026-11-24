// Shared code for the admin portal and the customer view.
const CFG = window.RR_CONFIG || {};
export const DEMO = new URLSearchParams(location.search).has("demo") ||
  !CFG.supabaseUrl || CFG.supabaseUrl.includes("YOUR-PROJECT");

// ------------------------------------------------------------ helpers
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined,
  { month: "short", day: "numeric", year: "numeric" }) : "";
export const fmtDateTime = (d) => d ? new Date(d).toLocaleString(undefined,
  { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";

export const STATUSES = [
  ["submitted", "Submitted online"],
  ["received", "Received"],
  ["in_progress", "Restoration in progress"],
  ["restored", "Restored"],
  ["ready", "Ready for pickup / shipping"],
  ["completed", "Completed"],
];
export const STATUS_LABEL = Object.fromEntries(STATUSES);
export const pill = (s) => `<span class="pill ${esc(s)}">${esc(STATUS_LABEL[s] || s)}</span>`;

// Completed cards can be marked picked up. Hidden when the card isn't Completed,
// and when the row has no picked_up value yet (the SQL hasn't been run).
export function pickedUpBox(card, opts = {}) {
  if (!card || card.status !== "completed" || typeof card.picked_up !== "boolean") return "";
  const when = card.picked_up && card.picked_up_at
    ? ` <span class="muted">· ${esc(fmtDate(card.picked_up_at))}</span>` : "";
  return `<label class="pickup-flag"><input type="checkbox" class="pick pickup" data-card="${esc(card.id || "")}"
    ${card.picked_up ? "checked" : ""} ${opts.editable ? "" : "disabled"}> Picked up${when}</label>`;
}
export function pickedUpNote(card) {
  if (!card || card.status !== "completed" || card.picked_up !== true) return "";
  return ` <span class="muted small">Picked up</span>`;
}
export const STAGE_LABEL = { before: "Before (intake)", progress: "In progress", after: "After (restored)" };
const STAGE_ORDER = ["before", "progress", "after"];
const CORNERS = [["top-left", "Top left"], ["top-right", "Top right"],
                 ["bottom-left", "Bottom left"], ["bottom-right", "Bottom right"]];
const EDGES = [["top", "Top edge"], ["bottom", "Bottom edge"], ["left", "Left edge"], ["right", "Right edge"]];
const LABEL = Object.fromEntries([...CORNERS, ...EDGES]);

export function progressSteps(status) {
  const keys = STATUSES.map((s) => s[0]).filter((k) => k !== "submitted");
  const idx = Math.max(0, keys.indexOf(status));
  const bars = keys.map((_, i) => `<div class="${status !== "submitted" && i <= idx ? "on" : ""}"></div>`).join("");
  const labels = ["Received", "Restoring", "Restored", "Ready", "Done"]
    .map((l, i) => `<span class="${i === idx ? "cur" : ""}">${l}</span>`).join("");
  return `<div class="steps">${bars}</div><div class="steplbl">${labels}</div>`;
}

export function mediaUrl(path) {
  if (!path) return "";
  if (/^https?:|^data:|^blob:/.test(path)) return path;
  if (DEMO) return "demo/" + path;
  return `${CFG.supabaseUrl}/storage/v1/object/public/${CFG.bucket || "portal"}/${path
    .split("/").map(encodeURIComponent).join("/")}`;
}

export function toast(msg, ms = 2600) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.append(t); }
  t.textContent = msg; t.classList.add("on");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), ms);
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : Date.now().toString(36) + Math.random().toString(36).slice(2));

// Shrink big phone photos before upload (keeps storage and data use down).
export async function prepareImage(file, maxSide = 3000) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { blob: file, ext: (file.name.split(".").pop() || "jpg").toLowerCase() };
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (s === 1 && file.size < 4e6) return { blob: file, ext: file.type.split("/")[1].replace("jpeg", "jpg") };
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
    return { blob, ext: "jpg" };
  } catch { return { blob: file, ext: "jpg" }; }
}

// ------------------------------------------------------------ lightbox
export function installLightbox() {
  if ($("#lb")) return;
  document.body.insertAdjacentHTML("beforeend",
    `<div id="lb" class="fit"><img alt=""></div><div id="lbbar"><button class="btn sm" id="lbfit">Actual size</button>
     <button class="btn sm" id="lbx">Close ✕</button></div>`);
  const lb = $("#lb"), im = lb.querySelector("img"), fit = $("#lbfit");
  const close = () => { lb.classList.remove("on"); im.removeAttribute("src"); };
  document.addEventListener("click", (e) => {
    const t = e.target.closest(".zoom");
    if (!t) return;
    e.preventDefault();
    im.src = t.dataset.full || t.src; lb.classList.add("on", "fit"); fit.textContent = "Actual size";
  });
  lb.addEventListener("click", close); $("#lbx").addEventListener("click", close);
  fit.addEventListener("click", () => { lb.classList.toggle("fit");
    fit.textContent = lb.classList.contains("fit") ? "Actual size" : "Fit to screen"; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}

// ---------------------------------------------------------- card report
const img = (path, alt = "", cls = "") => path
  ? `<img class="zoom ${cls}" src="${esc(mediaUrl(path))}" data-full="${esc(mediaUrl(path))}" alt="${esc(alt)}" loading="lazy">`
  : `<div class="muted small">—</div>`;
const fig = (path, cap) => `<figure>${img(path, cap)}<figcaption>${esc(cap)}</figcaption></figure>`;

function sidePanel(scan) {
  const f = scan.files || {}, c = f.corners || {}, e = f.edges || {}, b = f.boxes || {};
  let h = `<div class="panel"><h3>${scan.side === "front" ? "Front" : "Back"}
    <span class="muted small" style="text-transform:none;letter-spacing:0">· ${scan.dpi || ""} dpi · ${esc(fmtDateTime(scan.scanned_at))}</span></h3>`;
  if (!window.RR_CUSTOMER_VIEW) {
    const id = `${esc(scan.stage)}|${esc(scan.side)}`;
    h += `<div class="row" style="margin:-4px 0 10px;gap:6px"><span class="grow"></span>
      <button class="btn sm" data-scanact="rep|${id}" title="Upload a new image for this side; it's cropped and measured like a scan">⤴ Replace</button>
      <button class="btn sm danger" data-scanact="del|${id}">🗑 Delete</button></div>`;
  }
  h += centeringRow(scan);
  h += `<div class="ov">${img(f.web, scan.side)}`;
  for (const [group, cls] of [[e, "e"], [c, "c"]]) {
    for (const [k, path] of Object.entries(group)) {
      const bx = b[k]; if (!bx) continue;
      const st = `left:${bx[0] * 100}%;top:${bx[1] * 100}%;width:${(bx[2] - bx[0]) * 100}%;height:${(bx[3] - bx[1]) * 100}%`;
      h += `<button class="hot ${cls} zoom" style="${st}" data-full="${esc(mediaUrl(path))}" title="${esc(LABEL[k] || k)}" aria-label="${esc(LABEL[k] || k)}"></button>`;
    }
  }
  h += `</div>`;
  if (Object.keys(c).length) {
    h += `<p class="hint">Tap a gold corner or blue edge box to zoom in.</p>`;
    h += `<h4>Corners</h4><div class="corners">${CORNERS.map(([k, l]) => fig(c[k], l)).join("")}</div>`;
    h += `<h4>Edges</h4><div class="hedges">${fig(e.top, "Top edge")}${fig(e.bottom, "Bottom edge")}</div>`;
    h += `<div class="vedges">${fig(e.left, "Left edge")}${fig(e.right, "Right edge")}</div>`;
  }
  return h + `</div>`;
}

function compare(stA, stB, byStage) {
  let h = `<p class="muted small">Same spot, side by side. Tap any image to zoom.</p>`;
  for (const side of ["front", "back"]) {
    const a = byStage[stA]?.[side], b = byStage[stB]?.[side];
    if (!a || !b) continue;
    const fa = a.files || {}, fb = b.files || {};
    h += `<div class="panel" style="margin-top:12px"><h3>${side === "front" ? "Front" : "Back"}</h3><div class="cmp">
      <div></div><div class="h">${esc(STAGE_LABEL[stA])}</div><div class="h">${esc(STAGE_LABEL[stB])}</div>
      <div class="small">Whole card</div><div>${img(fa.web)}</div><div>${img(fb.web)}</div>`;
    for (const [k, l] of CORNERS) h += `<div class="small">${l}</div><div>${img(fa.corners?.[k])}</div><div>${img(fb.corners?.[k])}</div>`;
    for (const [k, l] of EDGES) h += `<div class="small">${l}</div><div>${img(fa.edges?.[k])}</div><div>${img(fb.edges?.[k])}</div>`;
    h += `</div></div>`;
  }
  return h;
}

// ------------------------------------------------- centering → grade caps
// Best grade the centering alone allows, from each company's published standards
// (psacard.com/gradingstandards and cgccards.com/card-grading/grading-scale, read Oct 27, 2026).
// [grade, front, back]: the larger share of the worse axis, rounded, may be at most this (55 = 55/45).
// back null = not stated. CGC publishes numbers for only some grades, so the ones in between are left out.
export const CENTERING_RULES = {
  PSA: { floor: "1", rules: [["10", 55, 75], ["9", 60, 90], ["8", 65, 90], ["7", 70, 90], ["6", 80, 90], ["5", 85, 90], ["3", 90, 90]] },
  CGC: { floor: "3 or lower", rules: [["Pristine 10", 50, 50], ["10", 55, 75], ["9", 60, 90], ["8", 65, null], ["7", 70, null],
                                       ["6", 75, null], ["4.5", 85, null], ["3.5", 90, null]] },
  // beckett.com/grading/scale (owner's screenshots, Oct 27, 2026). Black Label 10 has the same centering as Pristine 10.
  // TODO: 5 and below not added yet.
  BGS: { floor: "5.5 or lower", rules: [["Pristine 10", 50, 55], ["9.5", 55, 60], ["9", 55, 70], ["8", 60, 80],
                                         ["7", 65, 90], ["6", 70, 95]] },
};
const worstShare = (s) => (s?.lr && s?.tb ? Math.round(Math.max(s.lr[0], s.lr[1], s.tb[0], s.tb[1])) : null);

// front/back: RRCentering.summary() results (back may be null). Returns null without a front.
export function centeringGrades(front, back) {
  const f = worstShare(front), b = worstShare(back);
  if (f == null) return null;
  const fits = (r) => f <= r[1] && (b == null || r[2] == null || b <= r[2]);
  const companies = {};
  for (const [co, { floor, rules }] of Object.entries(CENTERING_RULES)) {
    const i = rules.findIndex(fits), up = i < 0 ? rules.at(-1) : rules[i - 1];
    companies[co] = { grade: i < 0 ? floor : rules[i][0],
      next: up && { grade: up[0], front: f > up[1] ? up[1] : null, back: b != null && up[2] != null && b > up[2] ? up[2] : null } };
  }
  return { front: f, back: b, companies };
}

// Admin-only panel above a stage's scans: "PSA 9 · a 10 needs front 55/45 (now 57/43)".
function gradePanel(bySide) {
  if (window.RR_CUSTOMER_VIEW || !window.RRCentering) return "";
  const cen = (s) => (s?.files?.centering?.lines ? s.files.centering : null);
  const fc = cen(bySide.front), bc = cen(bySide.back);
  const g = centeringGrades(window.RRCentering.summary(fc), window.RRCentering.summary(bc));
  if (!g) return "";
  const pair = (x) => `${x}/${100 - x}`;
  const rows = Object.entries(g.companies).map(([co, r]) => {
    const need = r.next && [r.next.front && `front ${pair(r.next.front)} (now ${pair(g.front)})`,
      r.next.back && `back ${pair(r.next.back)} (now ${pair(g.back)})`].filter(Boolean).join(" and ");
    return `<div><b style="color:var(--gold)">${co} ${esc(r.grade)}</b>${need ? `<span class="muted small"> · a ${esc(r.next.grade)} needs ${need}</span>` : ""}</div>`;
  }).join("");
  const unsure = [fc, bc].some((c) => c && c.auto !== false && (Object.values(c.lines).some((l) => l.found === false)
    || window.RRCentering.summary(c).check.length));
  return `<div class="panel grades"><h3 style="margin-top:0">Best grade the centering allows</h3>${rows}
    <p class="muted small" style="margin:8px 0 0">Front ${pair(g.front)}${g.back != null ? ` · back ${pair(g.back)}` : " · back not scanned, so back limits aren't applied"}
    (worse direction). Centering only — corners, edges and surface can still lower the grade.</p>
    ${unsure ? `<p class="small" style="color:var(--gold);margin:6px 0 0">⚠ Some borders weren't measured cleanly — check them with 📐 before trusting this.</p>` : ""}</div>`;
}

// Returns HTML for one card's scans; call wireReport(root) after inserting it.
function centeringRow(scan) {
  const c = scan.files?.centering;
  if (!c?.lines || !window.RRCentering) return "";
  return `<div class="row centering-row"><span class="grow">${window.RRCentering.badge(c)}</span>
    <button class="btn sm" data-center="${esc(scan.stage)}|${esc(scan.side)}">📐 Centering tool</button></div>`;
}

export function renderReport(scans) {
  if (!scans?.length) return `<div class="empty">No scans yet for this card.</div>`;
  const byStage = {};
  for (const s of scans) (byStage[s.stage] ||= {})[s.side] = s;
  const stages = STAGE_ORDER.filter((k) => byStage[k]);
  const tabs = stages.map((k) => [k, STAGE_LABEL[k]]);
  const cmp = byStage.before && stages.length > 1 ? stages[stages.length - 1] : null;
  if (cmp) tabs.push(["compare", "Before / after"]);
  const first = cmp ? "compare" : stages[stages.length - 1];
  let h = `<div class="report"><div class="stagebar">${tabs.map(([k, l]) =>
    `<button data-tab="${k}" class="${k === first ? "on" : ""}">${esc(l)}</button>`).join("")}</div>`;
  for (const k of stages) {
    h += `<section data-pane="${k}" ${k === first ? "" : "hidden"}>${gradePanel(byStage[k])}<div class="sides">${
      ["front", "back"].filter((s) => byStage[k][s]).map((s) => sidePanel(byStage[k][s])).join("")}</div></section>`;
  }
  if (cmp) h += `<section data-pane="compare" ${first === "compare" ? "" : "hidden"}>${compare("before", cmp, byStage)}</section>`;
  return h + `</div>`;
}

// opts: { scans, editable, onSaveCentering(scan, centering), onScanAction("rep"|"del", stage, side, scan) }
export function wireReport(root, opts = {}) {
  $$(".report", root).forEach((r) => r.addEventListener("click", (e) => {
    const ab = e.target.closest("[data-scanact]");
    if (ab) {
      const [act, stage, side] = ab.dataset.scanact.split("|");
      opts.onScanAction?.(act, stage, side, (opts.scans || []).find((x) => x.stage === stage && x.side === side));
      return;
    }
    const cb = e.target.closest("[data-center]");
    if (cb) {
      const [stage, side] = cb.dataset.center.split("|");
      const scan = (opts.scans || []).find((x) => x.stage === stage && x.side === side);
      if (!scan) return;
      const f = scan.files;
      window.RRCentering.open({
        imageUrl: mediaUrl(f.web), centering: f.centering,
        autoCentering: f.centering_auto || (f.centering.auto !== false ? f.centering : null),
        title: `${opts.title ? opts.title + " · " : ""}${side === "front" ? "Front" : "Back"} · ${STAGE_LABEL[stage] || stage}`,
        editable: !!opts.editable,
        onSave: async (c) => { await opts.onSaveCentering(scan, c); },
        onClose: () => opts.onClose && opts.onClose(),
      });
      return;
    }
    const b = e.target.closest("[data-tab]"); if (!b) return;
    $$("[data-tab]", r).forEach((x) => x.classList.toggle("on", x === b));
    $$("[data-pane]", r).forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.tab; });
  }));
}

export function thumbOf(scans) {
  for (const st of ["after", "progress", "before"]) {
    const s = scans.find((x) => x.stage === st && x.side === "front") || scans.find((x) => x.stage === st);
    if (s?.files?.thumb || s?.files?.web) return s.files.thumb || s.files.web;
  }
  return null;
}

// ------------------------------------------------------------- data API
let _sb = null;
async function sb() {
  if (_sb) return _sb;
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  _sb = createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  return _sb;
}
const bucket = () => CFG.bucket || "portal";
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

async function fetchAll(client, table) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = must(await client.from(table).select("*").range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export const realApi = {
  // customer
  async portalGet(token) { return must(await (await sb()).rpc("portal_get", { p_token: token })); },
  async customerUpload(token, storageKey, file, caption, cardId, source = "customer", submissionCode = null) {
    const c = await sb();
    const { blob, ext } = await prepareImage(file);
    const path = `u/${storageKey}/${uid()}.${ext}`;
    must(await c.storage.from(bucket()).upload(path, blob, { contentType: blob.type || "image/jpeg" }));
    must(await c.rpc("portal_add_photo", { p_token: token, p_path: path, p_caption: caption || "",
      p_card_id: cardId || null, p_submission_code: submissionCode, p_source: source }));
    return path;
  },
  async customerDeletePhoto(token, id) {
    return must(await (await sb()).rpc("portal_delete_photo", { p_token: token, p_photo_id: id }));
  },
  // admin
  async session() { return (await (await sb()).auth.getSession()).data.session; },
  async signIn(email, password) { must(await (await sb()).auth.signInWithPassword({ email, password })); },
  async signOut() { await (await sb()).auth.signOut(); },
  async isAdmin() { return must(await (await sb()).rpc("is_admin")); },
  async loadAll() {
    const c = await sb();
    const [customers, submissions, cards, scans, photos] = await Promise.all(
      ["customers", "submissions", "cards", "scans", "photos"].map((t) => fetchAll(c, t)));
    return { customers, submissions, cards, scans, photos };
  },
  async insert(table, row) { return must(await (await sb()).from(table).insert(row).select().single()); },
  async update(table, id, patch) { return must(await (await sb()).from(table).update(patch).eq("id", id).select().single()); },
  // One update for many rows, so a bulk status change is a single statement
  // and the order-completion trigger sees every selected card together.
  async updateMany(table, ids, patch) {
    if (!ids?.length) return [];
    return must(await (await sb()).from(table).update(patch).in("id", ids).select());
  },
  async get(table, id) { return must(await (await sb()).from(table).select("*").eq("id", id).maybeSingle()); },
  async remove(table, id) { must(await (await sb()).from(table).delete().eq("id", id)); },
  async adminUpload(storageKey, file) {
    const c = await sb();
    const { blob, ext } = await prepareImage(file);
    const path = `p/${storageKey}/${uid()}.${ext}`;
    must(await c.storage.from(bucket()).upload(path, blob, { contentType: blob.type || "image/jpeg" }));
    return path;
  },
  async removeFiles(paths) {
    if (paths.length) must(await (await sb()).storage.from(bucket()).remove(paths));
  },
  async putFile(path, blob) {
    must(await (await sb()).storage.from(bucket()).upload(path, blob,
      { contentType: blob.type || "image/jpeg", upsert: true, cacheControl: "31536000" }));
    return path;
  },
  async upsert(table, row, onConflict) {
    return must(await (await sb()).from(table).upsert(row, { onConflict }).select().single());
  },
  async newLink(customerId) { return must(await (await sb()).rpc("admin_new_link", { p_customer: customerId })); },
  async select(table) { return fetchAll(await sb(), table); },
};

// Demo stand-in for the database trigger in
// supabase/2026-11-24_order_completed_when_cards_completed.sql.
// Every card completed → order completed, and the previous order status is kept.
// A later card leaving completed puts the order back. Zero cards never completes it.
// A status saved on the order itself is left alone (auto_completed_from is cleared there).
function syncOrderCompletion(store, submissionId) {
  if (!submissionId) return;
  const sub = store.submissions.find((s) => s.id === submissionId);
  if (!sub) return;
  const cards = store.cards.filter((c) => c.submission_id === submissionId);
  const allDone = cards.length > 0 && cards.every((c) => c.status === "completed");
  if (allDone) {
    if (sub.status !== "completed") {
      sub.auto_completed_from = sub.status;
      sub.status = "completed";
      sub.updated_at = new Date().toISOString();
    }
    return;
  }
  if (sub.status === "completed" && sub.auto_completed_from) {
    sub.status = sub.auto_completed_from;
    sub.auto_completed_from = null;
    sub.updated_at = new Date().toISOString();
  }
}

// Demo backend: in-memory copy of demo/demo-data.js so the portal can be
// tried before Supabase is set up. Nothing is saved.
// Same rule as cards_picked_up_guard: the flag only sticks on a Completed card.
function normalizePickedUp(card, { backfill = false } = {}) {
  if (typeof card.picked_up !== "boolean") card.picked_up = backfill && card.status === "completed";
  if (card.status !== "completed" || !card.picked_up) {
    card.picked_up = false;
    card.picked_up_at = null;
  } else if (!card.picked_up_at) {
    card.picked_up_at = card.updated_at || new Date().toISOString();
  }
  return card;
}
function demoStore() {
  if (!window._rrDemo) {
    const d = JSON.parse(JSON.stringify(window.RR_DEMO || {
      customers: [], submissions: [], cards: [], scans: [], photos: [] }));
    // Cards already Completed in the sample data count as picked up, matching the SQL backfill.
    (d.cards || []).forEach((c) => normalizePickedUp(c, { backfill: true }));
    window._rrDemo = d;
  }
  return window._rrDemo;
}
export const demoApi = {
  async portalGet(token) {
    const d = demoStore(), c = d.customers.find((x) => x.share_token === token);
    if (!c) return null;
    return {
      customer: { name: c.name, storage_key: c.storage_key },
      submissions: d.submissions.filter((s) => s.customer_id === c.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)).map((s) => ({
          ...s, internal_notes: undefined,
          cards: d.cards.filter((k) => k.submission_id === s.id).sort((a, b) => a.card_number - b.card_number)
            .map((k) => ({ ...k, internal_notes: undefined, scans: d.scans.filter((x) => x.card_id === k.id) })),
        })),
      photos: d.photos.filter((p) => p.customer_id === c.id),
    };
  },
  async customerUpload(token, storageKey, file, caption, cardId) {
    const d = demoStore(), c = d.customers.find((x) => x.share_token === token);
    const k = d.cards.find((x) => x.id === cardId);
    d.photos.push({ id: uid(), customer_id: c.id, card_id: cardId || null, submission_id: k?.submission_id || null,
      path: URL.createObjectURL(file), source: "customer", caption: caption || "", created_at: new Date().toISOString() });
  },
  async customerDeletePhoto(token, id) { const d = demoStore(); d.photos = d.photos.filter((p) => p.id !== id); return true; },
  async session() { return { user: { email: "demo@restoredrarity" } }; },
  async signIn() {}, async signOut() {}, async isAdmin() { return true; },
  async loadAll() { // copies, so the admin page's own bookkeeping doesn't double-add rows
    const d = demoStore(); return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, [...v]])); },
  async insert(table, row) {
    const d = demoStore(), r = { id: uid(), created_at: new Date().toISOString(), ...row };
    if (table === "customers") Object.assign(r, { share_token: uid().replace(/-/g, ""), storage_key: uid().slice(0, 12) });
    if (table === "submissions") {
      r.code ||= "RR-" + (1 + Math.max(1000, ...d.submissions.map((x) => +x.code.slice(3) || 0)));
      r.auto_completed_from ??= null;
    }
    d[table].push(r);
    if (table === "cards") {
      normalizePickedUp(r);
      syncOrderCompletion(d, r.submission_id);
    }
    return r;
  },
  async update(table, id, patch) {
    const d = demoStore(), r = d[table].find((x) => x.id === id);
    const oldStatus = r.status, oldSub = r.submission_id;
    Object.assign(r, patch);
    // Editing the order status by hand forgets an automatic completion.
    if (table === "submissions" && Object.prototype.hasOwnProperty.call(patch, "status")
        && patch.status !== oldStatus && !Object.prototype.hasOwnProperty.call(patch, "auto_completed_from")) {
      r.auto_completed_from = null;
    }
    // Any card save rechecks the order, matching the database trigger
    // (a bulk "Completed" on cards that are already completed still counts).
    if (table === "cards") {
      normalizePickedUp(r);
      syncOrderCompletion(d, r.submission_id);
      if (oldSub !== r.submission_id) syncOrderCompletion(d, oldSub);
    }
    return r;
  },
  async updateMany(table, ids, patch) {
    const rows = [];
    for (const id of ids || []) rows.push(await this.update(table, id, patch));
    return rows;
  },
  async get(table, id) { return demoStore()[table]?.find((x) => x.id === id) || null; },
  async remove(table, id) {
    const d = demoStore();
    const row = (d[table] || []).find((x) => x.id === id);
    d[table] = d[table].filter((x) => x.id !== id);
    if (table === "cards" && row) syncOrderCompletion(d, row.submission_id);
  },
  async adminUpload(storageKey, file) { return URL.createObjectURL(file); },
  async removeFiles() {},
  async putFile(path, blob) { return URL.createObjectURL(blob); },
  async upsert(table, row, onConflict) {
    const d = demoStore(), keys = onConflict.split(",");
    d[table] ||= [];
    const ex = d[table].find((r) => keys.every((k) => r[k] === row[k]));
    if (ex) { Object.assign(ex, row); return ex; }
    const r = { id: uid(), ...row }; d[table].push(r); return r;
  },
  async newLink(customerId) { const c = demoStore().customers.find((x) => x.id === customerId);
    c.share_token = uid().replace(/-/g, ""); return c.share_token; },
  async select(table) { return [...(demoStore()[table] || [])]; },
};

export const api = DEMO ? demoApi : realApi;

export function customerLink(token) {
  const base = location.origin + location.pathname.replace(/[^/]*$/, "");
  return `${base}view.html${DEMO ? "?demo" : ""}#t=${token}`;
}

// "Add to Home Screen" tip for iPhone/iPad Safari (they have no install prompt of their own).
// Shown until dismissed; never inside the installed app.
export function installHint(appName) {
  const ios = /iP(hone|od|ad)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed = navigator.standalone || matchMedia("(display-mode: standalone)").matches;
  let dismissed = false;
  try { dismissed = localStorage.getItem("rr-install-hint") === "no"; } catch {}
  if (!ios || installed || dismissed || $("#install-hint")) return;
  const d = document.createElement("div");
  d.id = "install-hint"; d.className = "install-hint";
  d.innerHTML = `<span>Install <b>${esc(appName)}</b> as an app: tap <b>Share</b>
    <svg width="14" height="16" viewBox="0 0 14 16" aria-label="Share icon" style="vertical-align:-2px"><path d="M7 1v9M3.5 4.5 7 1l3.5 3.5M2 7v7.5h10V7" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
    then <b>Add to Home Screen</b>.</span><button type="button" aria-label="Dismiss">✕</button>`;
  d.querySelector("button").onclick = () => { d.remove(); try { localStorage.setItem("rr-install-hint", "no"); } catch {} };
  document.body.prepend(d);
}
