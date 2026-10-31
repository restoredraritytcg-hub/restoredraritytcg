// Scan Station by Restored Rarity: accounts, photograph/upload cards, auto straighten + crop,
// corner/edge close-ups, centering, and an eBay-ready .zip per card.
// Hash router: #/ (my cards), #/todo (cards still to finish), #/add (bulk add: camera, many files,
// watched folder), #/new (one card step by step), #/card/<id>, #/account, #/reset (new password after the email link).
import { api, DEMO } from "./store.js";
import * as Ph from "./photo.js";
import * as P from "../portal/scanproc.js";
import { openCamera } from "./camera.js";
import { Zip } from "./zip.js";

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000"
  .replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
const tick = () => new Promise((r) => setTimeout(r, 30));
const SIDES = [["front", "Front"], ["back", "Back"]];
const CORNERS = P.CORNERS, EDGES = P.EDGES;
const CLOSEUP_MIN = 800;            // eBay wants >= 500 px; close-ups are enlarged to this
const WEB_LONG = 1600;              // eBay's recommended photo size
const app = () => $("#app");
const st = { session: null, profile: null, cards: null, ed: null, gen: 0 };
// Views await data; if the user has moved on meanwhile, they must not draw over the new page.
const moved = (g) => g !== st.gen;

function toast(msg, ms = 2800) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.append(t); }
  t.textContent = msg; t.classList.add("on");
  clearTimeout(t._h); if (ms) t._h = setTimeout(() => t.classList.remove("on"), ms);
}
const toBlob = (c, type = "image/jpeg", q = 0.92) =>
  c.convertToBlob ? c.convertToBlob({ type, quality: q }) : new Promise((r) => c.toBlob(r, type, q));
function resized(src, maxSide, minSide = 0) {
  const big = Math.max(src.width, src.height);
  const s = big > maxSide ? maxSide / big : big < minSide ? minSide / big : 1;
  const c = P.canvas(Math.max(1, Math.round(src.width * s)), Math.max(1, Math.round(src.height * s)));
  const x = c.getContext("2d"); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
  x.drawImage(src, 0, 0, c.width, c.height); return c;
}
function cropOf(src, [x, y, w, h]) {
  const c = P.canvas(Math.max(1, w), Math.max(1, h));
  c.getContext("2d").drawImage(src, x, y, w, h, 0, 0, w, h); return c;
}
const filesOf = (f) => (f ? [f.web, f.thumb, ...Object.values(f.corners || {}), ...Object.values(f.edges || {})].filter(Boolean) : []);
const badge = (c) => (c && window.RRCentering ? window.RRCentering.badge(c) : "");
const slug = (s) => String(s || "card").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-")
  .replace(/^-|-$/g, "").slice(0, 50) || "card";
const autoTitle = (c) => `${c.name || ""} ${String(c.details || "").replace(/\s*·\s*/g, " ")}`.replace(/\s+/g, " ").trim().slice(0, 80);

// ------------------------------------------------------------------ boot
async function boot() {
  if (DEMO) $("#demo").innerHTML = '<div class="demo-banner">Demo mode — nothing is saved; reloading the page clears it.</div>';
  const h = location.hash, recovering = /type=recovery/.test(h);
  const linkError = /error_description=([^&]+)/.exec(h);
  st.session = await api.session();                // also signs in from an email link
  if (/access_token=|error_description=/.test(h)) history.replaceState(null, "", location.pathname + location.search + (recovering ? "#/reset" : "#/"));
  if (linkError) toast(decodeURIComponent(linkError[1].replace(/\+/g, " ")), 8000);
  api.onAuth((ev, s) => {
    const was = !!st.session; st.session = s;
    if (ev === "PASSWORD_RECOVERY") { location.hash = "#/reset"; return; }
    if (was !== !!s) { st.profile = null; st.cards = null; route(); }
  });
  $("#signout").onclick = async () => { await api.signOut(); location.hash = "#/"; };
  window.addEventListener("hashchange", route);
  window.addEventListener("beforeunload", (e) => { if (st.ed?.dirty()) { e.preventDefault(); e.returnValue = ""; } });
  route();
}

async function route() {
  const h = location.hash.replace(/^#/, "") || "/";
  leaveEditor();
  const g = ++st.gen;
  $("#topbar").hidden = !st.session;
  if (!st.session) return landing();
  if (!st.profile) {
    try { st.profile = (await api.profile()) || { display_name: "", ebay_store: "", card_limit: 200 }; }
    catch (e) { app().innerHTML = `<div class="panel">Couldn't load your profile: ${esc(e.message)}</div>`; return; }
    if (moved(g)) return;
  }
  $$("#topbar nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + h || (h === "/" && a.getAttribute("href") === "#/")));
  window.scrollTo(0, 0);
  try {
    if (h === "/reset") return resetView();
    if (h === "/account") return accountView();
    if (h === "/new") return editor(null);
    if (h === "/add") return addView();
    if (h === "/todo") return library("todo");
    const m = /^\/card\/([\w-]+)$/.exec(h);
    if (m) return editor(m[1]);
    return library();
  } catch (e) { app().innerHTML = `<div class="panel">Something went wrong: ${esc(e.message)}</div>`; }
}

// --------------------------------------------------------------- landing
function landing() {
  app().innerHTML = `
  <section class="hero">
    <div>
      <div class="kicker">Scan Station · by Restored Rarity</div>
      <h1>Your cards, photographed and measured.<br>Ready for eBay.</h1>
      <p class="muted">Works in any browser — phone, tablet or computer. Snap cards with your phone, drop in a stack of scans,
        or point it at your scanner's folder. Every card is straightened, cropped, measured for centering and saved to your account.</p>
      <ol class="how">
        <li><b>Add</b> cards your way: shoot card after card (a built-in level takes the photo), pick a batch of photos, or sync a scanner folder.</li>
        <li><b>Name</b> them — start typing and pick the card from the list.</li>
        <li><b>Download</b> eBay-ready photos, corner and edge close-ups, and a listing title and description in one .zip.</li>
      </ol>
    </div>
    <div class="panel auth">
      <div class="seg"><button data-m="in" class="on">Sign in</button><button data-m="up">Create account</button></div>
      <form id="authf" autocomplete="on">
        <div id="f-name" hidden><label class="f">Your name (optional)</label><input type="text" id="a-name" autocomplete="name"></div>
        <label class="f">Email</label><input type="email" id="a-email" required autocomplete="email" autocapitalize="none" autocorrect="off">
        <div id="f-pw"><label class="f">Password</label><input type="password" id="a-pw" minlength="8" autocomplete="current-password" autocapitalize="none" autocorrect="off"></div>
        <button class="btn gold" style="width:100%;justify-content:center;margin-top:14px" id="a-go">Sign in</button>
        <p class="login-err" id="a-err"></p>
        <p class="small" style="margin:10px 0 0"><a href="#" id="a-forgot">Forgot your password?</a></p>
      </form>
    </div>
  </section>`;
  let mode = "in";
  const set = (m) => {
    mode = m;
    $$(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
    $("#f-name").hidden = m !== "up"; $("#f-pw").hidden = m === "reset";
    $("#a-pw").required = m !== "reset";
    $("#a-pw").autocomplete = m === "up" ? "new-password" : "current-password";
    $("#a-go").textContent = { in: "Sign in", up: "Create account", reset: "Email me a reset link" }[m];
    $("#a-err").textContent = "";
  };
  $$(".seg button").forEach((b) => (b.onclick = () => set(b.dataset.m)));
  $("#a-forgot").onclick = (e) => { e.preventDefault(); set("reset"); };
  $("#authf").onsubmit = async (e) => {
    e.preventDefault();
    const email = $("#a-email").value.trim(), pw = $("#a-pw").value, btn = $("#a-go");
    btn.disabled = true; $("#a-err").textContent = "";
    try {
      if (mode === "in") await api.signIn(email, pw);
      if (mode === "up") {
        if (pw.length < 8) throw new Error("Use at least 8 characters for your password.");
        const r = await api.signUp(email, pw, $("#a-name").value.trim());
        if (r.confirm) { $("#a-err").style.color = "var(--green)"; $("#a-err").textContent = "Almost done — open the link we just emailed you to confirm your account."; }
      }
      if (mode === "reset") { await api.resetPassword(email); $("#a-err").style.color = "var(--green)"; $("#a-err").textContent = "If that email has an account, a reset link is on its way."; }
    } catch (err) {
      $("#a-err").style.color = "";
      $("#a-err").textContent = /invalid login/i.test(err.message) ? "That email and password don't match." : err.message;
    } finally { btn.disabled = false; }
  };
}

function resetView() {
  app().innerHTML = `<div class="panel" style="max-width:420px;margin:30px auto"><h2 style="margin-top:0">Choose a new password</h2>
    <form id="rf"><label class="f">New password</label><input type="password" id="r-pw" minlength="8" required autocomplete="new-password">
    <button class="btn gold" style="margin-top:12px">Save password</button><p class="login-err" id="r-err"></p></form></div>`;
  $("#rf").onsubmit = async (e) => {
    e.preventDefault();
    try { await api.updatePassword($("#r-pw").value); toast("Password saved"); location.hash = "#/"; }
    catch (err) { $("#r-err").textContent = err.message; }
  };
}

// --------------------------------------------------------------- library
const needsWork = (c) => !c.name || SIDES.some(([k]) => c.sides?.[k] && c.sides[k].ok === false);

async function library(filter = "all") {
  const g = st.gen;
  app().innerHTML = `<div class="loading">Loading your cards…</div>`;
  const cards = await api.listCards();
  const thumbs = await api.urls(cards.map((c) => c.sides?.front?.thumb || c.sides?.back?.thumb));
  if (moved(g)) return;
  st.cards = cards;
  const lim = st.profile.card_limit || 200, todo = cards.filter(needsWork);
  const shown = filter === "todo" ? todo : cards, n = shown.length;
  st.todoMode = filter === "todo";
  app().innerHTML = `
    <div class="row" style="margin-bottom:6px"><h1 class="grow">My cards</h1>
      <span class="muted small">${cards.length} of ${lim} cards</span></div>
    ${todo.length || filter === "todo" ? `<div class="chips"><a href="#/" class="${filter === "all" ? "on" : ""}">All (${cards.length})</a>
      <a href="#/todo" class="${filter === "todo" ? "on" : ""}">To finish (${todo.length})</a></div>` : ""}
    <div class="row toolbar">
      <a class="btn gold" href="#/add">＋ Add cards</a>
      ${n ? `<button class="btn" id="selall">Select all</button>
      <button class="btn" id="dl" disabled><span>⬇ Download for eBay (<span id="nsel">0</span>)</span></button>` : ""}
    </div>
    ${n ? `<div class="tiles cards">${shown.map((c) => {
      const t = thumbs[c.sides?.front?.thumb || c.sides?.back?.thumb];
      return `<div class="tile" data-id="${esc(c.id)}">
        <label class="pick" title="Select"><input type="checkbox" value="${esc(c.id)}"></label>
        <a href="#/card/${esc(c.id)}">${t ? `<img class="ph" src="${esc(t)}" alt="" loading="lazy">` : '<div class="ph">No photo</div>'}</a>
        <div class="n">${c.name ? esc(c.name) : '<span class="todo">Add a name</span>'}</div><div class="s">${esc(c.details || "")}</div>
        ${SIDES.some(([k]) => c.sides?.[k]?.ok === false) ? '<div class="small warn">⚠ Card edge not found — retake</div>' : ""}
        <div class="small">${badge(c.sides?.front?.centering)}</div></div>`;
    }).join("")}</div>`
    : filter === "todo" ? `<div class="panel empty-state"><p><b>All done.</b> Every card has a name and good photos.</p></div>`
    : `<div class="panel empty-state"><p><b>No cards yet.</b></p><p class="muted">Tap <b>＋ Add cards</b> to photograph cards with your phone,
        or drop in photos and scans from any device.</p></div>`}`;
  if (!n) return;
  const boxes = () => $$(".tile input[type=checkbox]");
  const upd = () => { const k = boxes().filter((b) => b.checked).length; $("#nsel").textContent = k; $("#dl").disabled = !k;
    $("#selall").textContent = k === boxes().length ? "Select none" : "Select all";
    $$(".tile").forEach((t) => t.classList.toggle("sel", $("input", t).checked)); };
  $(".tiles.cards").onchange = upd;
  $("#selall").onclick = () => { const all = boxes().every((b) => b.checked); boxes().forEach((b) => (b.checked = !all)); upd(); };
  $("#dl").onclick = async () => {
    const ids = boxes().filter((b) => b.checked).map((b) => b.value);
    await downloadZip(cards.filter((c) => ids.includes(c.id)), $("#dl"));
  };
}

// ---------------------------------------------------------------- editor
async function editor(id) {
  const g = st.gen;
  let row = null;
  if (id) {
    app().innerHTML = `<div class="loading">Loading…</div>`;
    row = await api.getCard(id);
    if (moved(g)) return;
    if (!row) { app().innerHTML = `<div class="panel">That card wasn't found. <a href="#/">Back to my cards</a></div>`; return; }
  }
  const ed = st.ed = {
    id: row?.id || null, row, saved: structuredClone(row?.sides || {}), pending: {}, removed: {}, changed: false,
    dirty: () => ed.changed || Object.keys(ed.pending).length > 0 || Object.values(ed.removed).some(Boolean),
  };
  app().innerHTML = `
    <p style="margin:0 0 6px"><a href="#/" id="back">← My cards</a></p>
    <h1>${row ? esc(row.name || "Untitled card") : "New card"}</h1>
    <div class="panel">
      <div class="grid2">
        <div><label class="f">Card name</label><input type="text" id="kn" value="${esc(row?.name)}" placeholder="Start typing, e.g. Charizard"></div>
        <div><label class="f">Set · number · year</label><input type="text" id="kd" value="${esc(row?.details)}" placeholder="Base Set · 4/102 · 1999"></div>
      </div>
      <label class="f">eBay title <span class="muted" style="text-transform:none">(80 characters max)</span></label>
      <input type="text" id="kt" maxlength="80" value="${esc(row?.title)}">
      <label class="f">Notes for the listing (condition, flaws…)</label>
      <textarea id="kno">${esc(row?.notes)}</textarea>
    </div>
    <div class="sides2">${SIDES.map(([k, l]) => `<div class="panel side" id="side-${k}" data-side="${k}"><h3>${l}</h3><div class="sbody"></div></div>`).join("")}</div>
    <div class="row actions">
      <button class="btn gold" id="save">Save card</button>
      ${row && st.todoMode ? '<button class="btn gold" id="savenext">Save &amp; next ›</button>' : ""}
      ${row?.sides?.front && row?.sides?.back ? '<button class="btn" id="swap" title="Front and back are the wrong way round">⇄ Swap front/back</button>' : ""}
      <button class="btn" id="zip" ${row ? "" : "disabled"}>⬇ Download for eBay (.zip)</button>
      <span class="grow"></span>
      ${row ? '<button class="btn danger" id="del">Delete card</button>' : ""}
    </div>
    <p class="muted small">Tip: lay the card on a plain, dark surface, out of its sleeve, with light from the side (not overhead) to avoid glare.</p>`;
  window.RRCardSearch?.attach($("#kn"), { details: $("#kd") });
  const syncTitle = () => { $("#kt").placeholder = autoTitle({ name: $("#kn").value, details: $("#kd").value }) || "Card name, set, number, year"; };
  ["#kn", "#kd", "#kt", "#kno"].forEach((s) => $(s).addEventListener("input", () => { ed.changed = true; syncTitle(); }));
  $("#kd").addEventListener("change", syncTitle); syncTitle();
  $("#back").onclick = (e) => { if (ed.dirty() && !confirm("Leave without saving this card?")) e.preventDefault(); };
  $("#save").onclick = () => saveCard($("#save"));
  if ($("#savenext")) $("#savenext").onclick = () => saveCard($("#savenext"), true);
  if ($("#swap")) $("#swap").onclick = async () => {
    if (ed.dirty() && !confirm("Swap now? Unsaved changes on this page will be lost.")) return;
    const { front, back } = ed.saved;
    await api.updateCard(ed.id, { sides: { ...ed.saved, front: back, back: front } });
    ed.changed = false; ed.pending = {}; ed.removed = {}; editor(ed.id);
  };
  $("#zip").onclick = () => downloadZip([st.ed.row], $("#zip"));
  if (row) $("#del").onclick = deleteCard;
  for (const [k] of SIDES) renderSide(k);
}

async function renderSide(side) {
  const ed = st.ed, box = $(`#side-${side} .sbody`), pend = ed.pending[side];
  const saved = ed.removed[side] ? null : ed.saved[side];
  let img = "", info = "", tools = "", close = "";
  if (pend) {
    const r = pend.res;
    img = `<img class="cardimg" src="${esc(pend.preview)}" alt="">`;
    info = r.ok ? `<span class="muted small">${r.dpi} dpi · not saved yet</span> ${badge(r.centering)}`
      : `<span class="warn">⚠ Couldn't find the card's edges. Use <b>Adjust corners</b> to place them.</span>`;
    tools = `${r.ok ? `<button class="btn sm" data-a="turn">↻ Turn upside down</button>` : ""}
      <button class="btn sm" data-a="corners">⌖ Adjust corners</button>
      ${r.ok ? `<button class="btn sm" data-a="center">📐 Centering</button>` : ""}
      <button class="btn sm danger" data-a="drop">✕ Discard</button>`;
    if (r.ok) close = closeups(Object.fromEntries([...CORNERS].map((c) => [c, pend.closeUrls[c]])));
  } else if (saved) {
    const urls = await api.urls([saved.web, ...CORNERS.map((c) => saved.corners?.[c])]);
    if (st.ed !== ed) return;
    img = `<img class="cardimg" src="${esc(urls[saved.web])}" alt="">`;
    info = saved.ok === false ? `<span class="warn">⚠ The card's edges weren't found in this photo. Retake it with the card on a plain, dark surface.</span>`
      : `<span class="muted small">${saved.dpi ? saved.dpi + " dpi" : ""}</span> ${badge(saved.centering)}`;
    tools = `${saved.centering ? '<button class="btn sm" data-a="center">📐 Centering</button>' : ""}
      <button class="btn sm danger" data-a="remove">🗑 Remove</button>`;
    close = closeups(Object.fromEntries(CORNERS.map((c) => [c, urls[saved.corners?.[c]]])));
  } else {
    img = `<div class="cardimg empty">No ${side} photo yet</div>`;
  }
  box.innerHTML = `${img}
    <div class="row shoot">
      <button class="btn gold" data-a="camera">📷 Camera</button>
      <label class="btn">⤴ Upload<input type="file" accept="image/*" hidden data-a="file"></label>
    </div>
    <div class="info">${info}</div><div class="row tools">${tools}</div>${close}`;
  box.onclick = (e) => { const a = e.target.closest("button[data-a]")?.dataset.a; if (a) sideAction(side, a); };
  $("input[data-a=file]", box).onchange = (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) sideAction(side, "file", f); };
}
const closeups = (urls) => `<div class="closeups">${CORNERS.map((c) => urls[c]
  ? `<figure><img src="${esc(urls[c])}" alt=""><figcaption>${c.replace("-", " ")}</figcaption></figure>` : "").join("")}</div>`;

async function sideAction(side, a, file) {
  const ed = st.ed, pend = ed.pending[side];
  try {
    if (a === "file") await takeFile(side, file);
    if (a === "camera") { const f = await openCamera(side === "front" ? "Front of the card" : "Back of the card"); if (f) await takeFile(side, f); }
    if (a === "drop") { dropPending(side); renderSide(side); }
    if (a === "remove" && confirm(`Remove the ${side} photo? It's deleted when you save the card.`)) { ed.removed[side] = true; renderSide(side); }
    if (a === "turn") {
      busy(side, "Turning…"); await tick();
      const r = pend.res; r.canvas = Ph.turn180(r.canvas); r.quad = Ph.rotateQuad(r.quad, 2);
      Object.assign(r, Ph.measure(r.canvas, r.dpi)); delete r.centering_auto;
      await refreshPending(side);
    }
    if (a === "corners") {
      const q = await adjustCorners(pend.bmp, pend.res.quad);
      if (!q) return;
      busy(side, "Straightening…"); await tick();
      pend.res = await Ph.processImage(pend.bmp, q);
      await refreshPending(side);
    }
    if (a === "center") openCentering(side);
  } catch (e) {
    toast(a === "file" ? "Couldn't read that picture (" + e.message + "). Try a JPG or PNG." : e.message, 6000);
    if (st.ed === ed) renderSide(side);
  }
}
const busy = (side, msg) => { $(`#side-${side} .sbody`).innerHTML = `<div class="cardimg empty"><span><span class="spinner"></span> ${esc(msg)}</span></div>`; };

function leaveEditor() {
  if (!st.ed) return;
  for (const [k] of SIDES) dropPending(k);
  st.ed = null;
}

function dropPending(side) {
  const p = st.ed.pending[side]; if (!p) return;
  p.bmp?.close?.(); URL.revokeObjectURL(p.preview); Object.values(p.closeUrls || {}).forEach(URL.revokeObjectURL);
  delete st.ed.pending[side];
}

async function takeFile(side, file) {
  busy(side, "Finding the card…"); await tick();
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { bmp = await createImageBitmap(file); }
  const res = await Ph.processImage(bmp);
  dropPending(side);
  st.ed.pending[side] = { bmp, res, preview: "", closeUrls: {} };
  await refreshPending(side);
}

async function refreshPending(side) {
  const p = st.ed.pending[side];
  URL.revokeObjectURL(p.preview); Object.values(p.closeUrls).forEach(URL.revokeObjectURL);
  p.preview = URL.createObjectURL(await toBlob(resized(p.res.canvas, 1400), "image/jpeg", 0.88));
  p.closeUrls = {};
  if (p.res.ok) for (const c of CORNERS) p.closeUrls[c] = URL.createObjectURL(await toBlob(cropOf(p.res.canvas, p.res.regions[c]), "image/jpeg", 0.85));
  renderSide(side);
}

function openCentering(side) {
  const ed = st.ed, pend = ed.pending[side];
  const title = `${$("#kn").value || "Card"} · ${side === "front" ? "Front" : "Back"}`;
  if (pend) {
    const r = pend.res;
    window.RRCentering.open({ imageUrl: pend.preview, centering: r.centering, autoCentering: r.centering_auto || r.centering,
      title, editable: true,
      onSave: (c) => { r.centering_auto ||= r.centering; r.centering = c; },
      onClose: () => renderSide(side) });
    return;
  }
  const f = ed.saved[side];
  api.urls([f.web]).then((u) => window.RRCentering.open({ imageUrl: u[f.web], centering: f.centering,
    autoCentering: f.centering_auto || f.centering, title, editable: true,
    onSave: async (c) => {
      const sides = structuredClone(ed.saved);
      sides[side].centering_auto ||= f.centering; sides[side].centering = c;
      ed.row = await api.updateCard(ed.id, { sides }); ed.saved = structuredClone(ed.row.sides);
    },
    onClose: () => renderSide(side) }));
}

// Lets the user drag the four corner dots onto the card (for busy backgrounds or cards in a holder).
function adjustCorners(bmp, quad) {
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.className = "cq";
    root.innerHTML = `<div class="cq-bar"><span class="grow">Drag the 4 dots onto the card's corners</span>
      <button class="btn sm" data-a="cancel">Cancel</button><button class="btn sm gold" data-a="ok">Apply</button></div>
      <div class="cq-stage"><canvas></canvas></div>`;
    document.body.append(root); document.documentElement.style.overflow = "hidden";
    const stage = $(".cq-stage", root), cv = $("canvas", stage), ctx = cv.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    let s = 1, ox = 0, oy = 0, active = -1;
    const W = bmp.width, H = bmp.height;
    let q = quad ? quad.map((p) => p.slice()) : (() => {     // a 5:7 box in the middle as a start
      const h = H * 0.6, w = Math.min(W * 0.8, h * 5 / 7), x = (W - w) / 2, y = (H - h) / 2;
      return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    })();
    const view = (p) => [ox + p[0] * s, oy + p[1] * s];
    function layout() {
      const r = stage.getBoundingClientRect();
      cv.width = r.width * dpr; cv.height = r.height * dpr; cv.style.width = r.width + "px"; cv.style.height = r.height + "px";
      s = Math.min(r.width / W, r.height / H) * 0.94; ox = (r.width - W * s) / 2; oy = (r.height - H * s) / 2; draw();
    }
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(bmp, ox, oy, W * s, H * s);
      ctx.beginPath(); q.forEach((p, i) => { const [x, y] = view(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
      ctx.strokeStyle = "#2ad4e6"; ctx.lineWidth = 2; ctx.stroke();
      q.forEach((p, i) => { const [x, y] = view(p);
        ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fillStyle = i === active ? "#2ad4e6" : "rgba(245,179,1,.85)"; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = "#111"; ctx.stroke(); });
      if (active >= 0) {                                   // magnifier, so a finger doesn't hide the corner
        const [x, y] = view(q[active]), R = 70, Z = 4, r = stage.getBoundingClientRect();
        const lx = x < r.width / 2 ? r.width - R - 12 : R + 12, ly = R + 12;
        ctx.save(); ctx.beginPath(); ctx.arc(lx, ly, R, 0, 7); ctx.clip();
        ctx.fillStyle = "#000"; ctx.fillRect(lx - R, ly - R, 2 * R, 2 * R);
        const ss = s * Z, sx = lx - q[active][0] * ss, sy = ly - q[active][1] * ss;
        ctx.drawImage(bmp, sx, sy, W * ss, H * ss);
        ctx.strokeStyle = "#2ad4e6"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(lx - R, ly); ctx.lineTo(lx + R, ly); ctx.moveTo(lx, ly - R); ctx.lineTo(lx, ly + R); ctx.stroke();
        ctx.restore(); ctx.beginPath(); ctx.arc(lx, ly, R, 0, 7); ctx.strokeStyle = "#f5b301"; ctx.lineWidth = 2; ctx.stroke();
      }
    }
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    let grab = [0, 0];
    cv.addEventListener("pointerdown", (e) => {
      const [x, y] = pos(e), tol = e.pointerType === "touch" ? 34 : 16;
      let best = -1, bd = Infinity;
      q.forEach((p, i) => { const [vx, vy] = view(p), d = Math.hypot(vx - x, vy - y); if (d < bd) { bd = d; best = i; } });
      if (bd > tol) return;
      active = best; const [vx, vy] = view(q[best]); grab = [vx - x, vy - y];
      cv.setPointerCapture(e.pointerId); draw();
    });
    cv.addEventListener("pointermove", (e) => {
      if (active < 0) return;
      const [x, y] = pos(e);
      q[active] = [Math.max(0, Math.min(W, (x + grab[0] - ox) / s)), Math.max(0, Math.min(H, (y + grab[1] - oy) / s))]; draw();
    });
    const up = () => { active = -1; draw(); };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    const done = (v) => { window.removeEventListener("resize", layout); document.documentElement.style.overflow = ""; root.remove(); resolve(v); };
    $(".cq-bar", root).onclick = (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "cancel") done(null);
      if (a === "ok") done(Ph.orderQuad(q));
    };
    window.addEventListener("resize", layout); layout();
  });
}

// One side's processed images go to <user>/<card>/<side>_*_<version>.jpg in the private bucket.
async function uploadSide(base, side, r, ver) {
  const put = async (name, c, q = 0.92) => api.putFile(`${base}/${side}_${name}_${ver}.jpg`, await toBlob(c, "image/jpeg", q));
  const f = { ok: r.ok, dpi: r.dpi, boxes: r.boxes, corners: {}, edges: {}, source: "photo" };
  if (r.centering) f.centering = r.centering;
  if (r.centering_auto) f.centering_auto = r.centering_auto;
  const jobs = [put("web", resized(r.canvas, WEB_LONG), 0.9).then((p) => { f.web = p; }),
                put("thumb", resized(r.canvas, 420), 0.85).then((p) => { f.thumb = p; })];
  if (r.ok) {
    for (const k of CORNERS) jobs.push(put(`corner-${k}`, cropOf(r.canvas, r.regions[k])).then((p) => { f.corners[k] = p; }));
    for (const k of EDGES) jobs.push(put(`edge-${k}`, cropOf(r.canvas, r.regions[k])).then((p) => { f.edges[k] = p; }));
  }
  await Promise.all(jobs);
  return f;
}

async function saveCard(btn, next = false) {
  const ed = st.ed;
  const hasFront = ed.pending.front || (ed.saved.front && !ed.removed.front);
  if (!hasFront) { toast("Add a photo of the front first."); return; }
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving…';
  const uploaded = [], stale = [];
  try {
    if (!ed.id) {
      const lim = st.profile.card_limit || 200;
      if ((await api.countCards()) >= lim) throw new Error(`You've reached your limit of ${lim} cards. Delete some to add more.`);
    }
    const id = ed.id || uid(), base = `${st.session.user.id}/${id}`;
    const ver = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    const sides = structuredClone(ed.saved);
    for (const [k] of SIDES) {
      if (ed.pending[k]) {
        const f = await uploadSide(base, k, ed.pending[k].res, ver);
        uploaded.push(...filesOf(f)); stale.push(...filesOf(sides[k])); sides[k] = f;
      } else if (ed.removed[k]) { stale.push(...filesOf(sides[k])); delete sides[k]; }
    }
    const fields = { name: $("#kn").value.trim(), details: $("#kd").value.trim(),
      title: $("#kt").value.trim(), notes: $("#kno").value.trim(), sides };
    const row = ed.id ? await api.updateCard(id, fields) : await api.insertCard({ id, ...fields });
    if (stale.length) api.removeFiles(stale).catch(() => {});
    for (const [k] of SIDES) dropPending(k);
    ed.removed = {}; ed.changed = false;
    toast("Saved ✓");
    if (next) {
      const nx = (await api.listCards()).filter(needsWork).find((c) => c.id !== row.id);
      location.hash = nx ? `#/card/${nx.id}` : "#/todo";
      return;
    }
    if (location.hash === `#/card/${row.id}`) editor(row.id); else location.hash = `#/card/${row.id}`;
  } catch (e) {
    if (uploaded.length) api.removeFiles(uploaded).catch(() => {});
    toast("Couldn't save: " + e.message, 7000);
    btn.disabled = false; btn.textContent = next ? "Save & next ›" : "Save card";
  }
}

async function deleteCard() {
  const ed = st.ed;
  if (!confirm("Delete this card and all its photos? This can't be undone.")) return;
  try {
    await api.removeFiles(SIDES.flatMap(([k]) => filesOf(ed.saved[k])));
    await api.deleteCard(ed.id);
    for (const [k] of SIDES) dropPending(k);
    ed.removed = {}; ed.pending = {}; ed.changed = false;
    toast("Card deleted"); location.hash = "#/";
  } catch (e) { toast("Couldn't delete: " + e.message, 6000); }
}

// -------------------------------------------------------------- add cards
// Photos from the camera, a multi-pick, drag & drop or a watched folder go through one queue. Each is
// processed on this device and saved straight to the account (no Save step), so the card shows up on
// every device right away. With "front + back" on, photos alternate front, back, front, back…
const IMG_RE = /\.(jpe?g|png|webp|heic|heif|avif|gif|bmp)$/i;
const q = { items: [], running: false, pairs: true, open: null, watch: null };
let qSeq = 0;

// fresh: this batch starts with a front, even if the last batch ended on a front without its back.
function enqueue(files, fresh = false) {
  files.forEach((f, i) => q.items.push({ id: ++qSeq, file: f, name: f.name || "photo", status: "waiting", msg: "", fresh: fresh && !i }));
  renderQueue(); pump();
}

async function pump() {
  if (q.running) return;
  q.running = true;
  let it;
  while ((it = q.items.find((i) => i.status === "waiting"))) {
    it.status = "working"; renderQueue();
    try { await addOne(it); it.status = "done"; }
    catch (e) {
      it.status = "error"; it.msg = e.message;
      if (/limit/i.test(e.message)) q.items.forEach((i) => { if (i.status === "waiting") { i.status = "error"; i.msg = "Card limit reached"; } });
    }
    it.file = null; renderQueue();
  }
  q.running = false; renderQueue();
}

async function addOne(it) {
  let bmp;
  try { bmp = await createImageBitmap(it.file, { imageOrientation: "from-image" }); }
  catch { try { bmp = await createImageBitmap(it.file); } catch { throw new Error("This picture type can't be opened here — save it as JPG or PNG."); } }
  await tick();
  let res;
  try { res = await Ph.processImage(bmp); } finally { bmp.close(); }
  it.thumb = URL.createObjectURL(await toBlob(resized(res.canvas, 200), "image/jpeg", 0.8));
  it.ok = res.ok;
  const ver = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const user = st.session.user.id;
  if (it.fresh) q.open = null;
  if (q.pairs && q.open) {                                  // the back of the card we just started
    const card = q.open; q.open = null;
    const f = await uploadSide(`${user}/${card.id}`, "back", res, ver);
    try { await api.updateCard(card.id, { sides: { ...card.sides, back: f } }); }
    catch (e) { api.removeFiles(filesOf(f)).catch(() => {}); throw e; }
    it.side = "back"; it.cardNo = card.no; it.cardId = card.id;
    return;
  }
  const id = uid();
  const f = await uploadSide(`${user}/${id}`, "front", res, ver);
  let row;
  try { row = await api.insertCard({ id, sides: { front: f } }); }
  catch (e) { api.removeFiles(filesOf(f)).catch(() => {}); throw e; }
  const no = q.items.filter((i) => i.side === "front").length + 1;
  it.side = "front"; it.cardNo = no; it.cardId = id;
  if (q.pairs) q.open = { id, sides: row.sides, no };
}

function queueCounts() {
  const c = { waiting: 0, working: 0, done: 0, error: 0 };
  q.items.forEach((i) => c[i.status]++);
  c.cards = new Set(q.items.filter((i) => i.status === "done").map((i) => i.cardId)).size;
  return c;
}

// Progress pill on every page while photos are still being processed.
function renderQueue() {
  const c = queueCounts(), left = c.waiting + c.working;
  let pill = $("#qpill");
  if (!pill) { pill = document.createElement("a"); pill.id = "qpill"; pill.href = "#/add"; document.body.append(pill); }
  pill.hidden = !left || location.hash === "#/add";
  pill.innerHTML = `<span class="spinner"></span> Adding cards · ${left} photo${left > 1 ? "s" : ""} left`;
  const box = $("#queue");
  if (!box) return;
  $("#qsum").innerHTML = !q.items.length ? "" : left
    ? `<span class="spinner"></span> Working… ${c.done} done, ${left} to go. You can keep adding — or leave this page; it carries on.`
    : `✓ ${c.cards} card${c.cards === 1 ? "" : "s"} added${c.error ? ` · ${c.error} problem${c.error > 1 ? "s" : ""}` : ""}.`;
  $("#qnext").hidden = !q.items.some((i) => i.status === "done") || !!left;
  box.innerHTML = q.items.slice().reverse().map((i) => `<div class="qrow ${i.status}">
    ${i.thumb ? `<img src="${esc(i.thumb)}" alt="">` : '<div class="qph"></div>'}
    <div class="grow"><div>${i.cardNo ? `Card ${i.cardNo} · ${i.side}` : esc(i.name)}</div>
      <div class="small muted">${{ waiting: "Waiting", working: '<span class="spinner"></span> Straightening & measuring…',
        done: i.ok ? "✓ Saved" : '<span class="warn">Saved, but the card edge wasn\'t found — retake this one</span>',
        error: `<span class="warn">${esc(i.msg)}</span>` }[i.status]}</div></div>
    ${i.cardId && i.status === "done" ? `<a class="btn sm" href="#/card/${esc(i.cardId)}">Open</a>` : ""}</div>`).join("");
}

function addView() {
  const folderOk = "showDirectoryPicker" in window;
  app().innerHTML = `
    <h1>Add cards</h1>
    <p class="muted" style="margin-top:0">Add as many as you like. Each card is straightened, measured and saved to your account automatically —
      it shows up on all your devices.</p>
    <div class="panel">
      <label class="f" style="margin-top:0">Your photos are</label>
      <div class="seg" id="pairs"><button data-p="1">Front, then back</button><button data-p="0">Fronts only</button></div>
      <p class="small muted" id="pairhint"></p>
      <div class="addgrid">
        <button class="bigbtn gold" id="shoot"><b>📷 Take photos</b><span>Card after card — the level shoots for you</span></button>
        <label class="bigbtn"><b>🖼 Choose photos</b><span>From your photo library or files — pick many at once</span>
          <input type="file" accept="image/*" multiple hidden id="pick"></label>
        ${folderOk ? `<button class="bigbtn" id="watch"><b>📁 Watch a folder</b><span>Scanner or camera sync folder — new pictures are added automatically</span></button>` : ""}
      </div>
      <div class="drop3" id="drop">or drag photos and scans here</div>
      <div id="watching"></div>
    </div>
    <div class="panel" style="margin-top:14px">
      <div class="row"><div class="grow" id="qsum"></div><a class="btn gold" id="qnext" href="#/todo" hidden>Name your cards ›</a></div>
      <div id="queue"></div>
      ${q.items.length ? "" : '<p class="muted small" id="qempty">Nothing added yet.</p>'}
    </div>
    <p class="muted small">Best results: plain dark surface, card out of its sleeve, light from the side, no flash.
      Prefer one card at a time with full control? <a href="#/new">Add a single card</a>.</p>`;
  const setPairs = (v) => {
    if (q.pairs !== v) q.open = null;
    q.pairs = v;
    $$("#pairs button").forEach((b) => b.classList.toggle("on", (b.dataset.p === "1") === v));
    $("#pairhint").textContent = v ? "Photos are paired in order: 1st = front of card 1, 2nd = its back, 3rd = front of card 2…"
      : "Every photo becomes its own card (you can add backs later).";
  };
  setPairs(q.pairs);
  $$("#pairs button").forEach((b) => (b.onclick = () => setPairs(b.dataset.p === "1")));
  $("#pick").onchange = (e) => { enqueue([...e.target.files], true); e.target.value = ""; };
  $("#shoot").onclick = async () => {
    let n = 0;
    const label = () => (q.pairs ? `Card ${Math.floor(n / 2) + 1} · ${n % 2 ? "back" : "front"}` : `Card ${n + 1}`);
    try {
      await openCamera(label(), { onShot: (f) => { enqueue([f], n === 0); n++; return label(); } });
    } catch (e) { toast(e.message, 6000); }
  };
  const drop = $("#drop");
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => {
    e.preventDefault(); drop.classList.remove("over");
    const files = [...e.dataTransfer.files].filter((f) => IMG_RE.test(f.name) || f.type.startsWith("image/"))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (files.length) enqueue(files, true);
  };
  if (folderOk) $("#watch").onclick = () => watchFolder().catch((e) => { if (e.name !== "AbortError") toast(e.message, 6000); });
  renderWatch(); renderQueue();
  if (q.items.length) $("#qempty")?.remove();
}

// Polls a folder the user picked (Chrome/Edge on a computer) and adds new pictures once they've
// finished writing (same size on two checks in a row).
async function watchFolder() {
  stopWatch();
  const dir = await window.showDirectoryPicker({ id: "rr-scanner", mode: "read" });
  const w = q.watch = { dir, seen: new Set(), sizes: new Map(), existing: [], timer: 0, first: true };
  for await (const [name, h] of dir.entries()) if (h.kind === "file" && IMG_RE.test(name)) { w.seen.add(name); w.existing.push(h); }
  w.timer = setInterval(() => checkFolder(w).catch(() => {}), 3000);
  renderWatch();
}
async function checkFolder(w) {
  if (q.watch !== w) return;
  const fresh = [];
  for await (const [name, h] of w.dir.entries()) {
    if (h.kind !== "file" || !IMG_RE.test(name) || w.seen.has(name) || name.startsWith(".") || name.startsWith("~")) continue;
    const f = await h.getFile();
    if (f.size && w.sizes.get(name) === f.size) { w.seen.add(name); w.sizes.delete(name); fresh.push(f); }
    else w.sizes.set(name, f.size);
  }
  if (fresh.length) { enqueue(fresh.sort((a, b) => a.lastModified - b.lastModified || a.name.localeCompare(b.name)), w.first); w.first = false; }
}
function stopWatch() { if (q.watch) clearInterval(q.watch.timer); q.watch = null; renderWatch(); }
function renderWatch() {
  const box = $("#watching"); if (!box) return;
  const w = q.watch;
  box.innerHTML = w ? `<div class="watchbar"><span class="dot on"></span><span class="grow">Watching <b>${esc(w.dir.name)}</b> — new pictures are added automatically while this page is open.</span>
    ${w.existing.length ? `<button class="btn sm" id="wold">Add the ${w.existing.length} already there</button>` : ""}
    <button class="btn sm" id="wstop">Stop</button></div>` : "";
  if (!w) return;
  $("#wstop").onclick = stopWatch;
  if ($("#wold")) $("#wold").onclick = async () => {
    const files = await Promise.all(w.existing.map((h) => h.getFile()));
    w.existing = []; renderWatch();
    enqueue(files.sort((a, b) => a.lastModified - b.lastModified || a.name.localeCompare(b.name)), true);
  };
}
window.addEventListener("beforeunload", (e) => {
  if (queueCounts().waiting + queueCounts().working) { e.preventDefault(); e.returnValue = ""; }
});
window.addEventListener("hashchange", () => renderQueue());

// ---------------------------------------------------------- eBay package
function centerLine(c) {
  const s = c && window.RRCentering?.summary(c);
  if (!s?.lr || !s?.tb) return "not measured";
  const pair = ([a]) => `${Math.round(a)}/${100 - Math.round(a)}`;
  return `Left/Right ${pair(s.lr)} · Top/Bottom ${pair(s.tb)}`;
}
export function listingText(card, profile) {
  const title = (card.title || autoTitle(card) || "Trading card").slice(0, 80);
  const f = card.sides?.front, b = card.sides?.back;
  const lines = [
    "TITLE (paste into eBay's title box — 80 characters max)", title, "",
    "DESCRIPTION", card.name || "", card.details || "", "",
    "Centering (measured from photos — an estimate, not a grade):",
    `  Front: ${centerLine(f?.centering)}`, ...(b ? [`  Back:  ${centerLine(b?.centering)}`] : []), "",
    ...(card.notes ? ["Notes:", card.notes, ""] : []),
    "Photos: front and back, plus close-ups of every corner and edge. Please look at all photos for condition.",
    ...(profile?.ebay_store ? ["", `More cards in my eBay store: ${profile.ebay_store}`] : []),
    "", "—", "PHOTO ORDER: upload the files in number order; 01 (the front) becomes the main gallery photo.",
  ];
  return lines.join("\r\n");
}

async function enlarge(blob, minLong) {
  const bmp = await createImageBitmap(blob);
  try {
    if (Math.max(bmp.width, bmp.height) >= minLong) return blob;
    return await toBlob(resized(bmp, minLong, minLong), "image/jpeg", 0.92);
  } finally { bmp.close(); }
}

async function addCard(zip, card, folder) {
  let n = 0;
  const num = () => String(++n).padStart(2, "0");
  const get = (p) => api.getFile(p);
  const S = card.sides || {};
  for (const [k] of SIDES) if (S[k]?.web) zip.add(`${folder}${num()}_${k}.jpg`, await get(S[k].web));
  for (const [k] of SIDES) for (const c of CORNERS) if (S[k]?.corners?.[c])
    zip.add(`${folder}${num()}_${k}_corner_${c}.jpg`, await enlarge(await get(S[k].corners[c]), CLOSEUP_MIN));
  for (const [k] of SIDES) for (const e of EDGES) if (S[k]?.edges?.[e])
    zip.add(`${folder}${num()}_${k}_edge_${e}.jpg`, await enlarge(await get(S[k].edges[e]), CLOSEUP_MIN));
  zip.add(`${folder}listing.txt`, listingText(card, st.profile));
}

async function downloadZip(cards, btn) {
  const label = btn.innerHTML; btn.disabled = true;
  try {
    const zip = new Zip(), many = cards.length > 1, used = new Set();
    for (let i = 0; i < cards.length; i++) {
      btn.innerHTML = `<span class="spinner"></span> Packing ${many ? `${i + 1} of ${cards.length}` : "…"}`;
      let f = slug(cards[i].name); while (used.has(f)) f += "-" + cards[i].id.slice(0, 4); used.add(f);
      await addCard(zip, cards[i], many ? f + "/" : "");
    }
    const blob = await zip.blob();
    const name = many ? `cards-for-ebay-${new Date().toISOString().slice(0, 10)}.zip` : `${slug(cards[0].name)}.zip`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60e3);
    toast(`Downloaded ${name}`);
  } catch (e) { toast("Couldn't build the download: " + e.message, 7000); }
  finally { btn.disabled = false; btn.innerHTML = label; }
}

// --------------------------------------------------------------- account
async function accountView() {
  const g = st.gen, p = st.profile, n = await api.countCards();
  if (moved(g)) return;
  app().innerHTML = `<h1>Account</h1>
    <div class="panel" style="max-width:560px">
      <p class="muted small" style="margin-top:0">Signed in as <b>${esc(st.session.user.email)}</b> · ${n} of ${p.card_limit || 200} cards used</p>
      <form id="pf">
        <label class="f">Your name</label><input type="text" id="p-name" value="${esc(p.display_name)}">
        <label class="f">eBay store name or link (added to each listing text)</label><input type="text" id="p-store" value="${esc(p.ebay_store)}" autocapitalize="none">
        <button class="btn gold" style="margin-top:12px">Save</button>
      </form>
    </div>
    <div class="panel" style="max-width:560px;margin-top:14px">
      <h3 style="margin-top:0">Password</h3>
      <form id="pwf" class="row"><input type="password" id="p-pw" minlength="8" required placeholder="New password (8+ characters)" autocomplete="new-password" class="grow" style="width:auto">
        <button class="btn">Change password</button></form>
    </div>
    <div class="panel" style="max-width:560px;margin-top:14px">
      <h3 style="margin-top:0;color:var(--red)">Delete account</h3>
      <p class="muted small">Deletes your account, every card and every photo. This can't be undone.</p>
      <button class="btn danger" id="delacct">Delete my account</button>
    </div>`;
  $("#pf").onsubmit = async (e) => {
    e.preventDefault();
    try { await api.saveProfile({ display_name: $("#p-name").value.trim(), ebay_store: $("#p-store").value.trim() });
      Object.assign(p, { display_name: $("#p-name").value.trim(), ebay_store: $("#p-store").value.trim() }); toast("Saved ✓"); }
    catch (err) { toast(err.message, 6000); }
  };
  $("#pwf").onsubmit = async (e) => {
    e.preventDefault();
    try { await api.updatePassword($("#p-pw").value); $("#p-pw").value = ""; toast("Password changed ✓"); }
    catch (err) { toast(err.message, 6000); }
  };
  $("#delacct").onclick = async () => {
    if (prompt('Type DELETE to delete your account and all your cards.') !== "DELETE") return;
    try {
      toast("Deleting…", 0);
      const cards = await api.listCards();
      const paths = cards.flatMap((c) => SIDES.flatMap(([k]) => filesOf(c.sides?.[k])));
      for (let i = 0; i < paths.length; i += 500) await api.removeFiles(paths.slice(i, i + 500));
      await api.deleteAccount();
      toast("Your account was deleted."); location.hash = "#/";
    } catch (err) { toast("Couldn't delete the account: " + err.message, 8000); }
  };
}

boot();
