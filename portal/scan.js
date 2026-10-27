// Scan station: works on any Mac or Windows computer in Chrome/Edge.
// Scan with the computer's own scanner software into a folder (ideally a Google Drive
// folder so originals sync between computers). This page watches that folder, finds the
// card(s) in each new scan, straightens them, cuts corner/edge close-ups, measures
// centering and saves everything to the portal under the chosen submission and card.
import { api, DEMO, esc, $, $$, pill, toast, STAGE_LABEL } from "./common.js";
import * as P from "./scanproc.js";

const app = $("#app");
let S = null;
const SETTINGS_KEY = "rr-scan-settings";
const cfg = Object.assign({ defaultDpi: 1200, perScan: 1, autoSave: true, organize: true, webLong: 2400 },
  JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"));
const saveCfg = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(cfg)); } catch {} };

const st = { subId: null, stage: "before", next: 1, side: "front", cap: { front: null, back: null },
             dir: null, watching: false, queue: [], busy: false, seen: new Map(), timer: null };
const IMG_RE = /\.(png|jpe?g)$/i;
const pad3 = (n) => String(n).padStart(3, "0");

if (DEMO) $("#demo").innerHTML = '<div class="demo-banner">Demo mode — sample data, nothing is saved to the cloud.</div>';

// ------------------------------------------------------------------ start
async function start() {
  if (DEMO) await import("./demo/demo-data.js").catch(() => {});
  const session = await api.session().catch(() => null);
  if (!session) return login();
  if (!(await api.isAdmin().catch(() => false))) {
    app.innerHTML = `<div class="empty">This login isn't on the admin list.</div>`; return;
  }
  $("#topbar").hidden = false;
  $("#signout").onclick = async () => { await api.signOut(); location.reload(); };
  S = await api.loadAll();
  skeleton();
  const remembered = await idbGet("dir").catch(() => null);
  if (remembered) offerResume(remembered);
  // Admin "📷 Scan" links open scan.html#sub=<id>&card=<n>&stage=<stage> in the tab named "rr-scan";
  // only the hash changes when this tab is already open, so folder watching keeps running.
  window.name = "rr-scan";
  window.addEventListener("hashchange", applyHash);
  applyHash();
  window.rrScan ={ useDirectory: (d) => startWatching(d), state: st, process: (f) => enqueue({ file: f, name: f.name }) };
}

function login() {
  app.innerHTML = `<div class="panel" style="max-width:380px;margin:60px auto"><h1>Sign in</h1>
    <form id="lf"><label class="f">Email</label><input type="email" id="le" required>
    <label class="f">Password</label><input type="password" id="lp" required>
    <div style="margin-top:14px"><button class="btn gold">Sign in</button></div><p class="muted small" id="lerr"></p></form></div>`;
  $("#lf").onsubmit = async (e) => { e.preventDefault();
    try { await api.signIn($("#le").value.trim(), $("#lp").value); location.reload(); } catch (err) { $("#lerr").textContent = err.message; } };
}

// --------------------------------------------------------------- layout
function skeleton() {
  const subs = [...S.submissions].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const cust = (s) => S.customers.find((c) => c.id === s.customer_id) || {};
  const fsOK = "showDirectoryPicker" in window;
  app.innerHTML = `<div class="station">
  <div>
    <div class="panel">
      <label class="f" style="margin-top:0">1 · Submission</label>
      <input type="search" id="subq" list="subs" placeholder="Type a code or customer name…" autocomplete="off">
      <datalist id="subs">${subs.map((s) => `<option value="${esc(s.code)} · ${esc(cust(s).name || "")}">`).join("")}</datalist>
      <div id="subinfo"></div>
      <label class="f">2 · Stage</label>
      <div class="seg" id="stage">${["before", "progress", "after"].map((k) =>
        `<button data-v="${k}" class="${k === st.stage ? "on" : ""}">${esc(STAGE_LABEL[k].split(" (")[0])}</button>`).join("")}</div>
      <div class="grid2" style="gap:10px">
        <div><label class="f">3 · Card #</label><input type="text" id="cardno" inputmode="numeric" value="1"></div>
        <div><label class="f">Cards per scan</label><div class="seg" id="perscan">
          <button data-v="1" class="${cfg.perScan === 1 ? "on" : ""}">1</button><button data-v="2" class="${cfg.perScan === 2 ? "on" : ""}">2</button></div></div>
      </div>
      <div style="margin-top:14px" class="muted small">Next scan</div>
      <div class="next" id="nextlbl"></div>
      <div class="muted small" id="nexthint"></div>
    </div>
    <div class="panel" style="margin-top:14px">
      <label class="f" style="margin-top:0">4 · Where scans arrive</label>
      ${fsOK ? `<div id="watchbox"></div>` : `<p class="small" style="color:var(--gold)">Automatic folder watching needs
        <b>Chrome</b> or <b>Edge</b>. In this browser, drop each scan below.</p>`}
      <div class="drop2" id="drop">Drop a scan here, or <label style="color:var(--cyan);cursor:pointer;text-decoration:underline">
        choose a file<input type="file" id="pick" accept="image/png,image/jpeg" multiple hidden></label></div>
      <details style="margin-top:12px"><summary class="small muted" style="cursor:pointer">Settings</summary>
        <label class="f">Resolution if the file doesn't say</label>
        <select id="ddpi">${[600, 1200, 2400].map((d) => `<option ${d === cfg.defaultDpi ? "selected" : ""}>${d}</option>`).join("")}</select>
        <label class="small" style="display:block;margin-top:10px"><input type="checkbox" id="autosave" ${cfg.autoSave ? "checked" : ""}>
          Save to the portal automatically after the back is scanned</label>
        <label class="small" style="display:block;margin-top:6px"><input type="checkbox" id="organize" ${cfg.organize ? "checked" : ""}>
          Move each original into a folder named after its submission</label>
      </details>
    </div>
  </div>
  <div>
    <div class="panel"><div class="row" style="margin-bottom:10px"><h2 style="margin:0" class="grow">Current card</h2>
      <button class="btn" id="redoF">Redo front</button><button class="btn" id="redoB">Redo back</button>
      <button class="btn" id="swap" hidden>⇄ Swap backs</button>
      <button class="btn" id="discard">Discard</button><button class="btn gold" id="save" disabled>Save to portal</button></div>
      <div id="capture"></div></div>
    <div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Activity</h3><div class="log" id="log"></div></div>
  </div></div>`;

  $("#subq").addEventListener("change", () => {
    const code = $("#subq").value.split(" · ")[0].trim().toUpperCase();
    const s = S.submissions.find((x) => x.code.toUpperCase() === code);
    if (!s) return toast("No submission with that code.");
    selectSub(s.id);
  });
  $("#stage").onclick = (e) => { const b = e.target.closest("[data-v]"); if (!b) return;
    setStage(b.dataset.v);
    st.next = firstUnscanned(); $("#cardno").value = st.next; renderSub(); renderNext(); };
  $("#perscan").onclick = (e) => { const b = e.target.closest("[data-v]"); if (!b) return;
    cfg.perScan = +b.dataset.v; saveCfg(); $$("#perscan button").forEach((x) => x.classList.toggle("on", x === b)); renderNext(); };
  $("#cardno").oninput = () => { const n = parseInt($("#cardno").value, 10); if (n > 0) { st.next = n; renderNext(); renderSub(); } };
  $("#ddpi").onchange = () => { cfg.defaultDpi = +$("#ddpi").value; saveCfg(); };
  $("#autosave").onchange = () => { cfg.autoSave = $("#autosave").checked; saveCfg(); };
  $("#organize").onchange = () => { cfg.organize = $("#organize").checked; saveCfg(); };
  $("#pick").onchange = () => { [...$("#pick").files].forEach((f) => enqueue({ file: f, name: f.name })); $("#pick").value = ""; };
  const drop = $("#drop");
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over");
    [...e.dataTransfer.files].filter((f) => IMG_RE.test(f.name)).forEach((f) => enqueue({ file: f, name: f.name })); };
  $("#redoF").onclick = () => { st.side = "front"; renderNext(); toast("Next scan replaces the front."); };
  $("#redoB").onclick = () => { if (!st.cap.front) return; st.side = "back"; renderNext(); toast("Next scan replaces the back."); };
  $("#swap").onclick = () => { const b = st.cap.back; if (b?.cards.length === 2) { b.cards.reverse(); renderCapture(); } };
  $("#discard").onclick = () => { st.cap = { front: null, back: null }; st.side = "front"; renderCapture(); renderNext(); };
  $("#save").onclick = () => save();
  renderWatch(); renderSub(); renderNext(); renderCapture();
}

// ------------------------------------------------------------ submission
const sub = () => S.submissions.find((s) => s.id === st.subId);
const subCards = () => S.cards.filter((c) => c.submission_id === st.subId).sort((a, b) => a.card_number - b.card_number);
const scansOf = (cardId) => S.scans.filter((x) => x.card_id === cardId);

function firstUnscanned() {
  const cards = subCards();
  const c = cards.find((k) => !scansOf(k.id).some((x) => x.stage === st.stage && x.side === "front"));
  return c ? c.card_number : (cards.length ? cards[cards.length - 1].card_number + 1 : 1);
}

function selectSub(id, cardNo) {
  st.subId = id; st.next = cardNo || firstUnscanned(); $("#cardno").value = st.next;
  const s = sub(), c = S.customers.find((x) => x.id === s.customer_id) || {};
  $("#subq").value = `${s.code} · ${c.name || ""}`;
  renderSub(); renderNext(); pump();
}

function setStage(stage) {
  st.stage = stage; $$("#stage button").forEach((x) => x.classList.toggle("on", x.dataset.v === stage));
}

// Pick up submission / card / stage from the link (admin's "📷 Scan" buttons).
async function applyHash() {
  const h = new URLSearchParams(location.hash.slice(1)), id = h.get("sub");
  if (!id) return;
  const cardNo = parseInt(h.get("card"), 10) || null, stage = h.get("stage");
  if (!S.submissions.some((x) => x.id === id) || (cardNo && !S.cards.some((k) => k.submission_id === id && k.card_number === cardNo))) {
    S = await api.loadAll();          // added in admin after this tab loaded
    const cust = (s) => S.customers.find((c) => c.id === s.customer_id) || {};
    $("#subs").innerHTML = [...S.submissions].sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((s) => `<option value="${esc(s.code)} · ${esc(cust(s).name || "")}">`).join("");
  }
  if (!S.submissions.some((x) => x.id === id)) return toast("That submission wasn't found.");
  if (st.cap.front && !confirm("Discard the scan that hasn't been saved yet?")) return;
  if (st.cap.front || st.cap.back) { st.cap = { front: null, back: null }; renderCapture(); }
  st.side = "front";
  if (["before", "progress", "after"].includes(stage)) setStage(stage);
  selectSub(id, cardNo);
  const s = sub(), k = subCards().find((c) => c.card_number === st.next);
  log(`Ready to scan ${s.code} card #${st.next}${k?.name ? " · " + esc(k.name) : ""} (${STAGE_LABEL[st.stage]}).`, "ok");
  window.focus();
}

function renderSub() {
  const s = sub(), box = $("#subinfo");
  if (!s) { box.innerHTML = `<p class="muted small">Pick the submission you're scanning.</p>`; return; }
  const c = S.customers.find((x) => x.id === s.customer_id) || {};
  const mark = (k, stage) => { const xs = scansOf(k.id).filter((x) => x.stage === stage);
    return ["front", "back"].map((sd) => (xs.some((x) => x.side === sd) ? "✓" : "·")).join(""); };
  box.innerHTML = `<div class="row" style="margin-top:8px"><b class="grow">${esc(c.name || "")}</b>${pill(s.status)}</div>
    <div class="cardlist">${subCards().map((k) => `<div data-n="${k.card_number}" class="${k.card_number === st.next ? "cur" : ""}">
      <span>#${k.card_number}</span><span>${esc(k.name || "—")}</span>
      <span class="st" title="front/back scanned for this stage">${esc(STAGE_LABEL[st.stage].split(" (")[0])} ${mark(k, st.stage)}</span></div>`).join("")
      || `<p class="muted">No cards yet — scanning adds them.</p>`}</div>`;
  $$(".cardlist [data-n]", box).forEach((d) => d.onclick = () => {
    st.next = +d.dataset.n; $("#cardno").value = st.next; renderSub(); renderNext(); });
}

function renderNext() {
  const nums = Array.from({ length: cfg.perScan }, (_, i) => st.next + i);
  const names = nums.map((n) => { const k = subCards().find((c) => c.card_number === n); return k?.name ? `${k.name}` : ""; })
    .filter(Boolean).join(" + ");
  $("#nextlbl").textContent = s(sub()) ? `Card ${nums.map((n) => "#" + n).join(" + ")} — ${st.side.toUpperCase()}` : "Pick a submission";
  $("#nexthint").textContent = sub()
    ? `${names ? names + " · " : ""}${st.side === "front" ? "Place the card face-down on the glass and scan" : "Flip the card in place, then scan again"}${st.queue.length ? ` · ${st.queue.length} scan(s) waiting` : ""}`
    : (st.queue.length ? `${st.queue.length} scan(s) waiting for a submission` : "");
  $("#save").disabled = !st.cap.front || st.busy;
}
const s = (x) => !!x;

// ------------------------------------------------------------ watching
async function renderWatch() {
  const box = $("#watchbox"); if (!box) return;
  if (st.watching) {
    box.innerHTML = `<div class="watch"><span class="dot on"></span><div class="grow"><b>Watching “${esc(st.dir.name)}”</b>
      <div class="muted small">New scans saved there are picked up automatically.</div></div>
      <button class="btn sm" id="stopw">Stop</button></div>`;
    $("#stopw").onclick = stopWatching;
  } else {
    box.innerHTML = `<button class="btn gold" id="choose">📁 Choose scan folder</button>
      <p class="muted small" style="margin:8px 0 0">Pick the folder your scanner software saves into
      (e.g. <b>Google Drive › Card Scans</b>). Chrome or Edge will ask to allow access.</p><div id="resume"></div>`;
    $("#choose").onclick = async () => {
      try {
        const dir = await window.showDirectoryPicker({ id: "rr-scans", mode: "readwrite" });
        await idbSet("dir", dir).catch(() => {});
        startWatching(dir);
      } catch (e) { if (e.name !== "AbortError") log(`Couldn't open that folder: ${e.message}. See the setup guide for a workaround.`, "err"); }
    };
  }
}
function offerResume(dir) {
  const box = $("#resume"); if (!box) return;
  box.innerHTML = `<button class="btn" style="margin-top:8px" id="res">▶ Resume watching “${esc(dir.name)}”</button>`;
  $("#res").onclick = async () => {
    const perm = await dir.requestPermission({ mode: "readwrite" }).catch(() => "denied");
    if (perm === "granted") startWatching(dir); else log("Permission to the folder wasn't granted.", "err");
  };
}

async function startWatching(dir) {
  st.dir = dir; st.watching = true; st.seen = new Map();
  let n = 0;
  for await (const [name, h] of dir.entries()) {
    if (h.kind !== "file" || !IMG_RE.test(name)) continue;
    const f = await h.getFile(); st.seen.set(name, { size: f.size, lm: f.lastModified, done: true }); n++;
  }
  log(`Watching “${dir.name}”.${n ? ` ${n} scan(s) already there were left alone.` : ""}`, "ok");
  renderWatch();
  clearInterval(st.timer); st.timer = setInterval(poll, 1500);
}
function stopWatching() { clearInterval(st.timer); st.watching = false; log("Stopped watching."); renderWatch(); }

async function poll() {
  if (!st.watching || st.polling) return;
  st.polling = true;
  try {
    for await (const [name, h] of st.dir.entries()) {
      if (h.kind !== "file" || !IMG_RE.test(name) || name.startsWith(".") || name.startsWith("~")) continue;
      const f = await h.getFile(), prev = st.seen.get(name);
      if (!prev) { st.seen.set(name, { size: f.size, lm: f.lastModified, done: false }); continue; }
      if (prev.done) continue;
      if (f.size > 0 && f.size === prev.size && f.lastModified === prev.lm) {   // finished writing
        prev.done = true; enqueue({ file: f, handle: h, name });
      } else { prev.size = f.size; prev.lm = f.lastModified; }
    }
  } catch (e) {
    log(`Lost access to the folder (${e.message}). Click “Resume watching”.`, "err"); stopWatching();
    const d = await idbGet("dir").catch(() => null); if (d) offerResume(d);
  } finally { st.polling = false; }
}

// ------------------------------------------------------------ processing
function enqueue(item) { st.queue.push(item); log(`New scan: ${item.name}`); renderNext(); pump(); }

async function pump() {
  if (st.busy || !st.queue.length) return;
  if (!sub()) { toast(`Pick a submission — ${st.queue.length} scan(s) waiting.`, 4000); return; }
  st.busy = true; renderNext();
  const item = st.queue.shift();
  const side = st.side;
  try {
    setCaptureBusy(`Reading ${item.name}…`);
    const res = await analyze(item.file);
    if (!res.cards.length) throw new Error("No card found. Use a dark backing sheet and close the lid, then scan again.");
    if (res.cards.length !== cfg.perScan) log(`Found ${res.cards.length} card(s) in ${item.name} (expected ${cfg.perScan}).`, "err");
    for (const c of st.cap[side]?.cards || []) URL.revokeObjectURL(c.thumbUrl);
    st.cap[side] = { ...res, name: item.name, handle: item.handle || null };
    const sm = res.cards.map((c) => c.centering?.summary).filter(Boolean)
      .map((x) => `L/R ${Math.round(x.lr[0])}/${100 - Math.round(x.lr[0])} T/B ${Math.round(x.tb[0])}/${100 - Math.round(x.tb[0])}`).join(" · ");
    log(`${side === "front" ? "Front" : "Back"}: ${res.cards.length} card(s) at ${res.dpi} dpi${sm ? " — " + sm : ""}.`, "ok");
    if (side === "front") st.side = "back";
    st.busy = false;
    renderCapture(); renderNext();
    if (side === "back" && st.cap.front && cfg.autoSave) await save();
  } catch (e) {
    st.busy = false; log(`${item.name}: ${e.message}`, "err"); renderCapture(); renderNext();
  }
  pump();
}

async function analyze(file) {
  const meta = await P.fileDpi(file);
  const bmp = await createImageBitmap(file);
  try {
    const { cards, dpi } = P.detectCards(bmp, bmp.width, bmp.height, meta || cfg.defaultDpi, cfg.perScan);
    const out = [];
    for (const c of cards) {
      const m = 0.25 * dpi, [x, y, w, h] = c.box;
      const x0 = Math.max(0, Math.floor(x - m)), y0 = Math.max(0, Math.floor(y - m));
      const x1 = Math.min(bmp.width, Math.ceil(x + w + m)), y1 = Math.min(bmp.height, Math.ceil(y + h + m));
      const reg = P.canvas(x1 - x0, y1 - y0);
      reg.getContext("2d").drawImage(bmp, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0);
      const cr = P.cropCard(reg, x1 - x0, y1 - y0, dpi);
      const cv = cr.canvas, W = cv.width, H = cv.height;
      let centering = null, boxes = {}, regions = {};
      if (cr.ok) {
        ({ boxes, regions } = P.detailRegions(W, H, dpi));
        try { centering = P.measureCentering(cv.getContext("2d").getImageData(0, 0, W, H), dpi); } catch { centering = null; }
      }
      const thumb = await toBlob(resized(cv, 520), "image/jpeg", 0.85);
      out.push({ canvas: cv, ok: cr.ok, dpi, centering, boxes, regions, thumbUrl: URL.createObjectURL(thumb) });
    }
    return { cards: out, dpi };
  } finally { bmp.close(); }
}

function resized(src, maxSide) {
  const s = Math.min(1, maxSide / Math.max(src.width, src.height));
  const c = P.canvas(Math.max(1, Math.round(src.width * s)), Math.max(1, Math.round(src.height * s)));
  const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}
function cropOf(src, [x, y, w, h]) {
  const c = P.canvas(Math.max(1, w), Math.max(1, h));
  c.getContext("2d").drawImage(src, x, y, w, h, 0, 0, w, h); return c;
}
function toBlob(c, type, q) {
  return c.convertToBlob ? c.convertToBlob({ type, quality: q }) : new Promise((r) => c.toBlob(r, type, q));
}

// --------------------------------------------------------------- capture
function setCaptureBusy(msg) { $("#capture").innerHTML = `<div class="big-hint"><span class="spinner"></span> ${esc(msg)}</div>`; }

function renderCapture() {
  const f = st.cap.front, b = st.cap.back;
  $("#swap").hidden = !(b && b.cards.length === 2);
  $("#save").disabled = !f || st.busy;
  if (!f && !b) {
    $("#capture").innerHTML = `<div class="big-hint">Scan the <b>front</b> of the card${cfg.perScan === 2 ? "s" : ""} with your
      scanner software. It will show up here a few seconds after it's saved.</div>`; return;
  }
  const n = Math.max(f?.cards.length || 0, b?.cards.length || 0);
  const tile = (side, c) => {
    if (!c) return `<div><div class="ph">${side === "back" ? "Flip & scan the back" : "Waiting for front"}</div><div class="cap"></div></div>`;
    const sm = c.centering?.summary;
    return `<div><div class="ph"><img src="${esc(c.thumbUrl)}" alt=""></div><div class="cap">
      ${sm ? window.RRCentering.badge(c.centering) : ""}${!c.ok ? '<span style="color:var(--red)">⚠ couldn\'t find the card edge</span>' : ""}
      <div>${c.dpi} dpi · ${side === "front" ? esc(f.name) : esc(b?.name || "")}</div></div></div>`;
  };
  let h = `<div class="slots">`;
  for (let i = 0; i < n; i++) {
    const num = st.next + i, k = subCards().find((c) => c.card_number === num);
    h += `<div class="slot"><h3>Card #${num}${k?.name ? " · " + esc(k.name) : ""}</h3>
      <div class="pair">${tile("front", f?.cards[i])}${tile("back", b?.cards[i])}</div></div>`;
  }
  $("#capture").innerHTML = h + `</div>`;
}

// ------------------------------------------------------------------ save
async function save() {
  const s = sub(); if (!s || !st.cap.front || st.busy) return;
  const cust = S.customers.find((c) => c.id === s.customer_id);
  st.busy = true; renderNext(); $("#save").textContent = "Saving…";
  const cap = st.cap, stage = st.stage, count = Math.max(cap.front.cards.length, cap.back?.cards.length || 0);
  const nums = Array.from({ length: count }, (_, i) => st.next + i);
  const tag = `${s.code}_${nums.map((n) => "C" + pad3(n)).join("+")}_${stage}`;
  const savedAs = {};
  for (const side of ["front", "back"]) if (cap[side]) {
    const ext = (cap[side].name.match(/\.[^.]+$/) || [".png"])[0].toLowerCase();
    savedAs[side] = cap[side].handle && cfg.organize ? `${s.code}/${tag}_${side}${ext}` : cap[side].name;
  }
  try {
    const done = [];
    for (let i = 0; i < count; i++) {
      const num = nums[i];
      let card = S.cards.find((c) => c.submission_id === s.id && c.card_number === num);
      if (!card) {
        card = await api.insert("cards", { submission_id: s.id, card_number: num, name: "", status: "received" });
        S.cards.push(card); log(`Added card #${num} to ${s.code}.`);
      } else if (card.status === "submitted") {
        Object.assign(card, await api.update("cards", card.id, { status: "received" }));
      }
      for (const side of ["front", "back"]) {
        const c = cap[side]?.cards[i]; if (!c) continue;
        $("#save").textContent = `Uploading #${num} ${side}…`;
        const ver = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
        const base = `s/${cust.storage_key}/${s.code}/C${pad3(num)}/${stage}`;
        const put = async (name, canvasEl, q = 0.93) => api.putFile(`${base}/${name}_${ver}.jpg`, await toBlob(canvasEl, "image/jpeg", q));
        const files = { boxes: c.boxes, corners: {}, edges: {}, original: { file: savedAs[side], folder: st.dir?.name || "" } };
        if (c.centering) files.centering = c.centering;
        const jobs = [
          put(`${side}_web`, resized(c.canvas, cfg.webLong), 0.9).then((p) => { files.web = p; }),
          put(`${side}_thumb`, resized(c.canvas, 420), 0.85).then((p) => { files.thumb = p; }),
        ];
        if (c.ok) for (const k of P.CORNERS) jobs.push(put(`corners/${side}_${k}`, cropOf(c.canvas, c.regions[k])).then((p) => { files.corners[k] = p; }));
        if (c.ok) for (const k of P.EDGES) jobs.push(put(`edges/${side}_${k}`, cropOf(c.canvas, c.regions[k])).then((p) => { files.edges[k] = p; }));
        await Promise.all(jobs);
        const old = S.scans.find((x) => x.card_id === card.id && x.stage === stage && x.side === side);
        const row = await api.upsert("scans", { card_id: card.id, stage, side, dpi: c.dpi, files,
                                                scanned_at: new Date().toISOString() }, "card_id,stage,side");
        S.scans = S.scans.filter((x) => !(x.card_id === card.id && x.stage === stage && x.side === side)).concat([row]);
        if (old?.files) {
          const f = old.files, keep = new Set([files.web, files.thumb, ...Object.values(files.corners), ...Object.values(files.edges)]);
          const stale = [f.web, f.thumb, ...Object.values(f.corners || {}), ...Object.values(f.edges || {})].filter((p) => p && !keep.has(p));
          api.removeFiles(stale).catch(() => {});
        }
      }
      done.push(`<a href="admin.html${DEMO ? "?demo" : ""}#/card/${card.id}" target="_blank">#${num}</a>`);
    }
    if (cfg.organize) await organize(cap, savedAs);
    log(`Saved ${s.code} card ${done.join(", ")} (${STAGE_LABEL[stage]}) to the portal.`, "ok");
    toast(`Saved card ${nums.map((n) => "#" + n).join(" + ")}.`);
    for (const sd of ["front", "back"]) for (const c of cap[sd]?.cards || []) URL.revokeObjectURL(c.thumbUrl);
    st.cap = { front: null, back: null }; st.side = "front"; st.next += count; $("#cardno").value = st.next;
  } catch (e) {
    log(`Save failed: ${e.message}. Nothing was lost — click “Save to portal” to try again.`, "err");
  } finally {
    st.busy = false; $("#save").textContent = "Save to portal";
    renderSub(); renderNext(); renderCapture(); pump();
  }
}

// Move the original scan files into <scan folder>/<submission code>/ with clear names.
async function organize(cap, savedAs) {
  for (const side of ["front", "back"]) {
    const c = cap[side]; if (!c?.handle || !st.dir || !savedAs[side].includes("/")) continue;
    try {
      const [folder, name] = savedAs[side].split("/");
      const sub = await st.dir.getDirectoryHandle(folder, { create: true });
      let target = name, n = 2;
      while (await sub.getFileHandle(target).then(() => true, () => false)) target = name.replace(/(\.[^.]+)$/, `-${n++}$1`);
      const fh = await sub.getFileHandle(target, { create: true });
      const w = await fh.createWritable(); await w.write(await c.handle.getFile()); await w.close();
      await st.dir.removeEntry(c.name);
      st.seen.set(c.name, { done: true });
    } catch (e) { log(`Couldn't move ${c.name} (${e.message}); the original is still in the folder.`, "err"); }
  }
}

// ------------------------------------------------------------------- log
function log(msg, cls = "") {
  const box = $("#log"); if (!box) return;
  const t = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  box.insertAdjacentHTML("afterbegin", `<div class="${cls}"><span class="muted">${t}</span> ${msg.includes("<a ") ? msg : esc(msg)}</div>`);
}

// ------------------------------------------------- remember the folder (IndexedDB)
function idb() {
  return new Promise((res, rej) => { const r = indexedDB.open("rr-scan", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function idbSet(k, v) { const db = await idb(); return new Promise((res, rej) => {
  const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
async function idbGet(k) { const db = await idb(); return new Promise((res, rej) => {
  const r = db.transaction("kv").objectStore("kv").get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

start().catch((e) => { app.innerHTML = `<div class="empty">Couldn't start the scan station: ${esc(e.message)}</div>`; });
