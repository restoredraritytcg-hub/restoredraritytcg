// CardVestIQ (prototype) — centering + tilt check, grade decision, collection (Restored Rarity, built on ScanStationIQ's card finder).
// Everything runs in the browser: pictures are never uploaded. Only an optional, anonymous grade report is sent.
import * as P from "./shared/scanproc.js";
import * as Ph from "./photo.js";
import { openCamera } from "./camera.js";
import * as M from "./multipoint.js";
import * as G from "./grade.js";
import * as T from "./track.js";
import { createEditor } from "./editor.js";
import * as PF from "./portfolio.js";

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const mm = (inches) => (inches * 25.4).toFixed(2);
const pair = (a) => (a ? `${a[0].toFixed(1)}/${a[1].toFixed(1)}` : "—");
const share = (v) => (v == null ? "—" : `${v.toFixed(1)}/${(100 - v).toFixed(1)}`);
const RR_SUBMIT = "https://restoredraritytcg.com/#submit", SSIQ = "https://scanstationiq.com/";
const { PSA_LEVELS, RR_GRADING_FEE } = G;

const S = {
  side: "front", sides: { front: null, back: null }, holder: false, holding: null, meas: {}, thumbs: {}, editor: null, showPts: true, batch: [], busy: false,
  calc: { company: "PSA", condition: "near", level: "auto", fee: "", viaRR: false, ship: "25", prep: "0", sellPct: "13.25",
          raw: "", values: {}, odds: null, oddsEdited: false, feeEdited: false, name: "" },
};

// ================================================================ pictures
async function decode(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => createImageBitmap(file));
  let dpi = await P.fileDpi(file).catch(() => null);
  if (dpi && dpi < Ph.MIN_DPI) dpi = null;                  // 72/96/144 dpi = screen pictures, not a scan
  return { bmp, dpi };
}
// ScanStationIQ app.js processPage: tight crops are the card itself; otherwise find + straighten the card.
async function processPage(bmp, dpi) {
  const shaped = Ph.cardShaped(bmp.width, bmp.height);
  if (shaped && dpi && Math.abs(Math.min(bmp.width, bmp.height) / P.CARD_W_IN - dpi) / dpi < 0.05) return Ph.wholeCard(bmp, dpi);
  const res = await Ph.processImage(bmp, null, dpi);
  if (!shaped) return res;
  if (!res.ok || Ph.quadShare(res.quad, bmp.width, bmp.height) < 0.6) return Ph.wholeCard(bmp, dpi) || res;
  return res;
}
// In a toploader / sleeve the first outline found is usually the holder: look again inside it for the card itself.
function inHolder(res) {
  const q = Ph.findQuad(res.canvas);
  if (!q) return res;
  const sh = Ph.quadShare(q, res.canvas.width, res.canvas.height);
  if (sh < 0.5 || sh > 0.93) return res;
  const dpi = Math.round(Math.max(Ph.MIN_DPI, Math.min(Ph.MAX_DPI, Ph.quadDpi(q))));
  return { ...res, canvas: Ph.warp(res.canvas, q, dpi), dpi, holderFound: true };
}
// One file → one or more measured cards ({ canvas, dpi, model, source, ok }).
async function measureFile(file, { holder = S.holder, camera = false, maxCards = 1 } = {}) {
  const { bmp, dpi } = await decode(file);
  const pages = [];
  if (dpi && maxCards > 1) {
    const { cards, dpi: used } = P.detectCards(bmp, bmp.width, bmp.height, dpi, maxCards);
    if (cards.length > 1) {
      const boxes = cards.map((c) => c.box);
      for (let i = 0; i < boxes.length; i++) pages.push(await processPage(Ph.cardRegion(bmp, boxes, i, used).canvas, used));
    }
  }
  if (!pages.length) pages.push(await processPage(bmp, dpi));
  bmp.close?.();
  return pages.map((res) => {
    if (!res.ok) return { ok: false, file: file.name };
    if (holder) res = inHolder(res);
    const ctx = res.canvas.getContext("2d", { willReadFrequently: true });
    const model = M.autoMeasure(ctx.getImageData(0, 0, res.canvas.width, res.canvas.height), res.dpi);
    if (res.quad) model.srcDpi = Math.round(Ph.quadDpi(res.quad));
    const source = dpi ? "scan" : !camera && (model.srcDpi || res.dpi) < 220 ? "screenshot" : "photo";
    return { ok: true, canvas: res.canvas, dpi: res.dpi, model, auto: M.clone(model), source, file: file.name || "picture",
             holderFound: !!res.holderFound };
  });
}

// ================================================================ measure view
function toast(msg, ms = 3500) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, ms);
}
async function addPicture(file, opts = {}) {
  if (!file) return;
  if (S.busy) return toast("Still working on the last picture…");
  S.busy = true; setStatus(`<span class="spinner"></span> Finding the card and measuring ${S.side === "front" ? "the front" : "the back"}…`);
  try {
    const [r] = await measureFile(file, opts);
    if (!r?.ok) { setStatus(`<span class="bad">Couldn't find the card's edges in that picture.</span> Try a plain background that's a different colour from the card's border, with the whole card in view.`); return; }
    S.sides[S.side] = r;
    if (S.holder && !r.holderFound) toast("Couldn't see a separate card edge inside the holder — measured the outline it found. Check the gold lines.", 6000);
    setStatus("");
    renderMeasure();
  } catch (e) { console.error(e); setStatus(`<span class="bad">That picture couldn't be read (${esc(e.message)}).</span>`); }
  finally { S.busy = false; }
}
const setStatus = (h) => { $("#status").innerHTML = h; $("#status").hidden = !h; };

function renderMeasure() {
  const cur = S.sides[S.side];
  $$("#sidetabs button").forEach((b) => {
    const s = S.sides[b.dataset.side];
    b.classList.toggle("on", b.dataset.side === S.side);
    b.querySelector("small").textContent = s ? summaryLine(s) : "not added";
  });
  $("#start").hidden = !!cur;
  $("#work").hidden = !cur;
  if (!cur) { S.editor?.destroy(); S.editor = null; renderResults(); return; }
  if (S.editor && S.editor.card === cur) { renderResults(); return; }
  S.editor?.destroy();
  S.editor = createEditor($("#editor"), { image: cur.canvas, model: cur.model, onChange: () => { renderResults(); updateSel(); } });
  S.editor.card = cur;
  S.editor.showSamples(S.showPts);
  renderResults(); updateSel();
}
function summaryLine(s) {
  const a = M.analyze(s.model);
  return `${pair(a.lr)} · ${pair(a.tb)} · ${a.tilt == null ? "" : Math.abs(a.tilt).toFixed(2) + "°"}`;
}
const updateSel = () => { $("#selinfo").textContent = S.editor?.label() || "Tap a handle (or press Next point), then nudge it."; };

function tiltSvg(a) {
  // exaggerated drawing: card outline + printed frame turned 10× the measured tilt
  const t = (a.tilt || 0) * 10, w = 50, h = 70;
  const ins = (side) => Math.max(3, Math.min(14, a.widths[side].mid * 40));
  const iw = w - ins("left") - ins("right"), ih = h - ins("top") - ins("bottom");
  const cx = ins("left") + iw / 2 + 5, cy = ins("top") + ih / 2 + 5;
  return `<svg viewBox="0 0 60 80" class="tiltsvg" aria-hidden="true"><rect x="5" y="5" width="${w}" height="${h}" rx="3" fill="none" stroke="#f5b301" stroke-width="1.5"/>
    <rect x="${cx - iw / 2}" y="${cy - ih / 2}" width="${iw}" height="${ih}" fill="rgba(42,212,230,.12)" stroke="#2ad4e6" stroke-width="1.5"
      transform="rotate(${t.toFixed(2)} ${cx} ${cy})"/></svg>`;
}

function renderResults() {
  const box = $("#results");
  const f = S.sides.front, b = S.sides.back, cur = S.sides[S.side];
  if (!cur) { box.innerHTML = ""; renderGrades(); return; }
  const a = M.analyze(cur.model), v = a.verdict;
  const W = a.widths;
  const row = (side, l1, l3) => `<tr><th>${side}</th><td>${mm(W[side].start)}</td><td>${mm(W[side].mid)}</td><td>${mm(W[side].end)}</td>
    <td class="${Math.abs(a.drift[side]) * 25.4 > 0.25 ? "warnc" : "muted"}">${a.drift[side] >= 0 ? "+" : ""}${mm(a.drift[side])}</td></tr>`;
  const tiltTxt = a.tilt == null ? "Not enough borders found to measure the tilt."
    : `${Math.abs(a.tilt).toFixed(2)}° ${v.dir}`;
  const longDrift = Math.max(Math.abs(a.drift.left), Math.abs(a.drift.right));
  box.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="k-l">Left / Right</div><div class="k-v">${pair(a.lr)}</div><div class="k-s">± ${a.plusMinus.lr ?? "—"}</div></div>
      <div class="kpi"><div class="k-l">Top / Bottom</div><div class="k-v">${pair(a.tb)}</div><div class="k-s">± ${a.plusMinus.tb ?? "—"}</div></div>
      <div class="kpi tilt ${v?.tone || ""}"><div class="k-l">Tilt (cant)</div><div class="k-v">${a.tilt == null ? "—" : Math.abs(a.tilt).toFixed(2) + "°"}</div>
        <div class="k-s">${esc(v?.label || "")}</div></div>
    </div>
    <div class="tiltrow">${tiltSvg(a)}<div>
      <p><b>${esc(tiltTxt)}</b>${a.tilt != null ? ` — the printed frame is turned against the card's cut edges.` : ""}</p>
      <p class="muted small">Left/right measured at the top: <b>${share(a.lrAt.top)}</b> · at the bottom: <b>${share(a.lrAt.bottom)}</b><br>
      Top/bottom at the left: <b>${share(a.tbAt.left)}</b> · at the right: <b>${share(a.tbAt.right)}</b><br>
      ${longDrift > 0 ? `A side border changes by up to <b>${mm(longDrift)} mm</b> from one end to the other.` : ""}
      ${a.worst - Math.max(...(a.lr || [0]), ...(a.tb || [0])) >= 2 ? `<br>At its worst point the card measures <b>${a.worst.toFixed(1)}/${(100 - a.worst).toFixed(1)}</b> — a strict grader may go by that.` : ""}</p>
      <p class="muted small">Drawing exaggerates the tilt 10×.</p></div></div>
    <details class="borders"><summary>Border widths (mm) at each end and the middle</summary>
      <table><thead><tr><th></th><th>start</th><th>middle</th><th>end</th><th>change</th></tr></thead><tbody>
      ${row("top")}${row("bottom")}${row("left")}${row("right")}</tbody></table>
      <p class="muted small">Start = top end for left/right, left end for top/bottom. Picture resolution ≈ ${Math.round(cur.dpi)} dpi ·
      ${M.SIDES.map((s) => `${s} ${cur.model.sides[s].innerCount ?? "—"}/${cur.model.sides[s].samples?.length ?? "—"} points`).join(" · ")}.</p></details>
    ${a.warn.map((w) => `<p class="warnbox">⚠ ${esc(w)}</p>`).join("")}
    ${cur.model.auto ? "" : `<p class="muted small">Adjusted by hand — <button class="linkbtn" data-act="reset">reset to auto</button>.</p>`}`;
  renderGrades();
}

// ------------------------------------------------------------- grades + calculator
const worstOf = (s) => { if (!s) return null; const a = M.analyze(s.model); return M.worseShare(a); };
const pmOf = (s) => { if (!s) return 0; const a = M.analyze(s.model); return Math.max(a.plusMinus.lr || 0, a.plusMinus.tb || 0); };
function caps() { return M.gradeCaps(worstOf(S.sides.front), worstOf(S.sides.back)); }

function renderGrades() {
  const g = $("#grades"), f = S.sides.front;
  if (!f) { $("#addhold").hidden = true; renderHoldingBar(); g.innerHTML = `<p class="muted">Add the <b>front</b> to see the grade each grader's centering rules allow${S.sides.back ? "" : " (add the back too — graders check both)"}.</p>`; $("#calcwrap").hidden = true; $("#report").hidden = true; funnel(null); return; }
  const fr = worstOf(f), bk = worstOf(S.sides.back);
  g.innerHTML = G.capsHtml(fr, bk, { frontPm: pmOf(f), backPm: pmOf(S.sides.back) }) + G.scaleHtml(fr, bk)
    + (S.sides.back ? "" : `<p class="small"><button class="btn sm" data-act="goback">＋ Add the back</button> <span class="muted">Back limits are looser, but a badly centered back can still cost a 10.</span></p>`);
  $("#calcwrap").hidden = false; $("#report").hidden = false; $("#addhold").hidden = false;
  calcSync(); renderReportForm(); renderHoldingBar();
}

function capFor(company) { return caps()?.companies[company]?.grade ?? "10"; }
function calcSync() {
  const c = S.calc, lad = G.LADDER[c.company];
  if (!c.odds || !c.oddsEdited) c.odds = G.gradeOdds(c.company, c.condition, capFor(c.company));
  $("#c-cap").textContent = `Centering allows up to ${c.company} ${capFor(c.company)}.`;
  $("#c-rows").innerHTML = lad.map((gr, i) => {
    const label = `${c.company} ${gr}${i === lad.length - 1 ? " or lower" : ""}`;
    return `<tr><th>${esc(label)}</th>
      <td><input inputmode="decimal" data-odds="${gr}" value="${c.odds[gr] ?? 0}" aria-label="Chance of ${esc(label)} (%)"><span class="unit">%</span></td>
      <td><input inputmode="decimal" data-val="${gr}" value="${esc(c.values[gr] ?? "")}" placeholder="sold prices" aria-label="Sold prices for ${esc(label)}"></td>
      <td><a target="_blank" rel="noopener" href="${G.ebaySold(c.name, `${c.company} ${gr}`)}">eBay sold ↗</a></td></tr>`;
  }).join("");
  $("#c-rawlink").href = G.ebaySold(c.name, "");
  $("#c-level").closest("label").hidden = c.company !== "PSA";
  $("#c-feehint").textContent = c.company === "PSA" ? "PSA's fee for the level (PSA sets these — check psacard.com)."
    : `Enter ${c.company}'s current fee for the service level you'd use (${c.company === "CGC" ? "cgccards.com" : "beckett.com"}).`;
  calcRun();
}
function calcRun() {
  const c = S.calc, num = (x) => (x === "" || x == null ? null : Number(String(x).replace(/[$,]/g, "")));
  const values = Object.fromEntries(Object.entries(c.values).map(([g, t]) => [g, G.comps(t)]));
  // PSA: level from the best expected graded value (PSA's declared value), unless picked by hand
  let fee = num(c.fee);
  if (c.company === "PSA" && !c.feeEdited) {
    const top = Math.max(0, ...Object.values(values).filter(Boolean));
    const lvl = c.level === "auto" ? PSA_LEVELS.find((l) => top <= l[2]) || PSA_LEVELS.at(-1) : PSA_LEVELS.find((l) => l[0] === c.level);
    fee = lvl[1]; $("#c-fee").value = fee; $("#c-level-auto").textContent = c.level === "auto" ? `(auto: ${lvl[0]})` : "";
  }
  const total = (fee || 0) + (c.viaRR ? RR_GRADING_FEE : 0);
  const res = G.submitOrSkip({ raw: G.comps(c.raw), values, odds: c.odds, fee: total, ship: num(c.ship) || 0, prep: num(c.prep) || 0, sellPct: num(c.sellPct) || 0 });
  const sum = Object.values(c.odds).reduce((a, b) => a + Number(b || 0), 0);
  const out = $("#c-out");
  if (!res.ready) {
    out.className = "verdict";
    out.innerHTML = `Enter the raw value${res.missing?.length ? ` and sold prices for ${res.missing.map((g) => `${c.company} ${g}`).join(", ")}` : ""} to get a verdict.`;
  } else {
    const $f = (x) => `$${Math.abs(x).toFixed(2)}`;
    const words = { submit: "Worth submitting", borderline: "Borderline — small expected gain", skip: "Skip — sell it raw" };
    out.className = `verdict ${res.verdict}`;
    out.innerHTML = `<b>${words[res.verdict]}</b><br>
      Expected after grading: ${$f(res.ev)} (after selling fees) · costs ${$f(res.cost)} · raw sale ${$f(G.comps(c.raw) * (1 - (num(c.sellPct) || 0) / 100))}<br>
      <b>${res.gain >= 0 ? "Expected gain" : "Expected loss"}: ${$f(res.gain)}</b>
      ${res.breakEven != null ? `<br><span class="small">Breaks even if the chance of ${c.company} ${res.top} is about ${res.breakEven}%.</span>` : ""}`;
  }
  if (Math.abs(sum - 100) > 0.5) out.innerHTML += `<br><span class="small warnc">The chances add up to ${sum}% — they're scaled to 100%.</span>`;
  funnel(res);
}
function funnel(res) {
  const g = caps(), box = $("#funnel");
  if (!g) { box.innerHTML = ""; return; }
  const ten = G.gradeNum(g.companies.PSA.grade) >= 10 || G.gradeNum(g.companies.BGS.grade) >= 9.5;
  const items = [];
  if (ten || res?.verdict === "submit") items.push(`<div class="fn gold"><b>${ten ? "This centers for a 10." : "Worth grading."}</b>
    That's exactly when it pays to have it cleaned and prepped first — surface haze and dust cost grades centering can't win back.
    <a class="btn sm gold" href="${RR_SUBMIT}" target="_blank" rel="noopener">Clean, prep &amp; submit with Restored Rarity</a></div>`);
  if (!ten || res?.verdict === "skip") items.push(`<div class="fn"><b>Selling it raw?</b> ScanStationIQ turns one photo into the 18 straightened
    eBay photos (corners, edges, centering) plus the listing text.
    <a class="btn sm" href="${SSIQ}" target="_blank" rel="noopener">Make the eBay listing with ScanStationIQ</a></div>`);
  box.innerHTML = items.join("");
}

// ------------------------------------------------------------- report the real grade
function renderReportForm() {
  const f = $("#reportform"), co = f.company.value;
  f.querySelector(".sub").hidden = co !== "BGS";
  $("#r-pred").textContent = `CardVestIQ's cap for this card: ${co} ${capFor(co)}`;
}
async function submitReport(e) {
  e.preventDefault();
  const f = e.target, co = f.company.value, real = Number(f.real.value), sub = f.subgrade.value === "" ? null : Number(f.subgrade.value);
  if (!(real >= 1 && real <= 10)) return toast("Enter the grade on the slab (1–10).");
  const fa = M.analyze(S.sides.front.model), ba = S.sides.back && M.analyze(S.sides.back.model);
  const r = await T.addReport({ company: co, predicted: G.gradeNum(capFor(co)), real_grade: real, subgrade: co === "BGS" ? sub : null,
    front_share: M.worseShare(fa), back_share: ba ? M.worseShare(ba) : null, tilt: fa.tilt == null ? null : Math.round(fa.tilt * 100) / 100,
    source: S.sides.front.source, name: S.calc.name || "" });
  f.reset(); renderReportForm(); toast(r.note, 5000);
}

// ================================================================ batch
async function runBatch(files) {
  files = [...files].filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/i.test(f.name));
  if (!files.length) return;
  location.hash = "#batch";
  const prog = $("#b-prog");
  for (let i = 0; i < files.length; i++) {
    prog.innerHTML = `<span class="spinner"></span> Measuring ${i + 1} of ${files.length}: ${esc(files[i].name)}`;
    try {
      for (const r of await measureFile(files[i], { maxCards: 3 })) {
        if (!r.ok) { S.batch.push({ file: files[i].name, ok: false }); continue; }
        const a = M.analyze(r.model), g = M.gradeCaps(M.worseShare(a), null);
        const th = P.canvas(120, Math.round(120 * r.canvas.height / r.canvas.width));
        th.getContext("2d").drawImage(r.canvas, 0, 0, th.width, th.height);
        const url = th.convertToBlob ? URL.createObjectURL(await th.convertToBlob({ type: "image/jpeg", quality: 0.8 })) : th.toDataURL("image/jpeg", 0.8);
        S.batch.push({ ok: true, file: files[i].name, r, a, g, url, n: S.batch.filter((x) => x.file === files[i].name).length + 1 });
      }
    } catch (e) { console.error(e); S.batch.push({ file: files[i].name, ok: false }); }
    renderBatch();
    await new Promise((res) => setTimeout(res, 0));
  }
  prog.innerHTML = `✓ ${files.length} picture${files.length > 1 ? "s" : ""} measured.`;
}
const score = (x) => (x.ok ? G.gradeNum(x.g.companies.PSA.grade) * 1000 + G.gradeNum(x.g.companies.BGS.grade) * 50 - x.a.worst - Math.abs(x.a.tilt || 0) * 5 : -1e9);
function renderBatch() {
  const list = [...S.batch].sort((p, q) => score(q) - score(p));
  $("#b-actions").hidden = !list.length;
  $("#b-list").innerHTML = list.length ? `<table class="btable"><thead><tr><th>#</th><th></th><th>Card</th><th>L / R</th><th>T / B</th><th>Tilt</th>
    <th>PSA</th><th>BGS</th><th></th></tr></thead><tbody>${list.map((x, i) => x.ok ? `<tr class="${G.gradeNum(x.g.companies.PSA.grade) >= 10 ? "top" : ""}">
      <td>${i + 1}</td><td><img src="${x.url}" alt=""></td><td class="fname">${esc(x.file)}${x.n > 1 || S.batch.filter((y) => y.file === x.file).length > 1 ? ` · card ${x.n}` : ""}</td>
      <td>${pair(x.a.lr)}</td><td>${pair(x.a.tb)}</td><td class="${x.a.verdict?.tone || ""}">${x.a.tilt == null ? "—" : Math.abs(x.a.tilt).toFixed(2) + "°"}</td>
      <td><b>${esc(x.g.companies.PSA.grade)}</b></td><td>${esc(x.g.companies.BGS.grade)}</td>
      <td><button class="btn sm" data-open="${S.batch.indexOf(x)}">Open</button></td></tr>`
    : `<tr><td>${i + 1}</td><td></td><td class="fname">${esc(x.file)}</td><td colspan="6" class="bad">No card found</td></tr>`).join("")}</tbody></table>
    <p class="muted small">Ranked by the best grade the front's centering allows, then how close to 50/50, then tilt. Fronts only — open a card to add its back.</p>` : "";
}
function batchCsv() {
  const rows = [["rank", "file", "lr", "tb", "tilt_deg", "psa_cap", "cgc_cap", "bgs_centering", "worst_point"]];
  [...S.batch].filter((x) => x.ok).sort((p, q) => score(q) - score(p)).forEach((x, i) =>
    rows.push([i + 1, x.file, pair(x.a.lr), pair(x.a.tb), x.a.tilt?.toFixed(2) ?? "", x.g.companies.PSA.grade, x.g.companies.CGC.grade, x.g.companies.BGS.grade, x.a.worst.toFixed(1)]));
  const blob = new Blob([rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "centering-batch.csv"; a.click();
}

// ================================================================ track record
async function renderTrack() {
  const loc = T.localStats(), list = T.localReports();
  $("#t-local").innerHTML = loc ? `<p>You've reported <b>${loc.n}</b> grade${loc.n > 1 ? "s" : ""}. The real grade stayed at or under CardVestIQ's centering cap
    <b>${loc.held}%</b> of the time${loc.subN ? `; BGS centering subgrade matched exactly ${loc.subExact}% (${loc.subN} reports)` : ""}.</p>
    <table class="btable"><thead><tr><th>Card</th><th>Grader</th><th>Predicted cap</th><th>Real</th><th>Front</th><th></th></tr></thead><tbody>
    ${list.map((r, i) => `<tr><td>${esc(r.name || "—")}</td><td>${esc(r.company)}</td><td>${r.predicted}</td><td><b>${r.real_grade}</b>${r.subgrade != null ? ` (cent. ${r.subgrade})` : ""}</td>
      <td>${r.front_share != null ? share(r.front_share) : "—"}</td><td><button class="linkbtn" data-delrep="${i}">remove</button></td></tr>`).join("")}</tbody></table>`
    : `<p class="muted">No grades reported from this device yet. After you measure a card and its slab comes back, add the grade under the results.</p>`;
  const sh = PF.isDemo() ? PF.DEMO_STATS : await T.sharedStats(), box = $("#t-shared");
  if (!sh) { box.innerHTML = `<p class="muted">The shared track record is being switched on. Reports you add are kept on this device in the meantime.</p>`; return; }
  const cos = ["PSA", "CGC", "BGS"].filter((c) => sh[c]);
  box.innerHTML = cos.length ? `<div class="caps">${cos.map((c) => { const s = sh[c]; return `<div class="cap"><div class="cap-co">${c}</div>
      <div class="cap-g">${s.cap_held != null ? s.cap_held + "%" : "—"}</div><div class="cap-note">${s.cap_held != null ? "cap held" : `needs 25 reports (${s.n} so far)`}${
      s.sub_exact != null ? ` · BGS centering subgrade exact ${s.sub_exact}%, within ½ ${s.sub_half}% (${s.sub_n})` : ""}</div></div>`; }).join("")}</div>
      <p class="muted small">"Cap held" = the slab's grade was at or under the best grade CardVestIQ said the centering allowed. Reported by users; no
      percentage is shown until a grader has 25 reports.</p>${PF.isDemo() ? `<p><span class="pill warn">Demo numbers, not real reports</span></p>` : ""}` : `<p class="muted">No shared reports yet — be the first.</p>`;
}

// ================================================================ routing + wiring
function route() {
  let v = (location.hash.match(/^#\/?(\w+)/) || [, "check"])[1];
  if (v === "measure" || !$(`[data-view="${v}"]`)) v = "check";
  $$("[data-view]").forEach((s) => { s.hidden = s.dataset.view !== v; });
  $$("nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#${v}`));
  if (v === "track") renderTrack();
  if (v === "collection") renderCollection();
  if (v === "check") requestAnimationFrame(() => S.editor?.fit());
}

function wire() {
  window.addEventListener("hashchange", route);
  const pick = (id, multiple) => { const i = $(id); i.multiple = multiple; i.value = ""; i.click(); };
  document.addEventListener("click", async (e) => {
    const a = e.target.closest("[data-act]")?.dataset.act;
    if (a === "file") pick("#file-one", false);
    if (a === "camera") {
      try { const f = await openCamera(S.side === "front" ? "Front" : "Back"); if (f) addPicture(f, { camera: true }); }
      catch (err) { toast(err.message || "The camera couldn't be opened."); }
    }
    if (a === "paste") pasteButton();
    if (a === "batchfiles") pick("#file-many", true);
    if (a === "csv") batchCsv();
    if (a === "clearbatch") { S.batch = []; renderBatch(); $("#b-prog").innerHTML = ""; }
    if (a === "goback") { S.side = "back"; renderMeasure(); window.scrollTo({ top: $("#sidetabs").offsetTop - 70, behavior: "smooth" }); }
    if (a === "reset") { const c = S.sides[S.side]; c.model = M.clone(c.auto); S.editor?.setModel(c.model); renderResults(); }
    if (a === "replace") pick("#file-one", false);
    if (a === "remove") { S.sides[S.side] = null; renderMeasure(); }
    if (a === "next") { S.editor?.next(); updateSel(); }
    if (a === "minus" || a === "plus") { S.editor?.nudge(a === "minus" ? -1 : 1); updateSel(); }
    if (a === "pts") { S.showPts = !S.showPts; S.editor?.showSamples(S.showPts); e.target.classList.toggle("on", S.showPts); }
    const o = e.target.closest("[data-open]");
    if (o) { const x = S.batch[+o.dataset.open]; S.side = "front"; S.sides.front = x.r; S.sides.back = null; S.holding = null; location.hash = "#check"; renderMeasure(); }
    const hb = e.target.closest("[data-hold]");
    if (hb) openHolding(hb.dataset.hold);
    if (a === "sample") openHolding(e.target.closest("[data-act]").dataset.id || "d-emberdrake");
    if (a === "saveholding") saveHoldingChanges();
    if (a === "leaveholding") { S.holding = null; renderHoldingBar(); }
    const d = e.target.closest("[data-delrep]");
    if (d) { T.deleteLocal(+d.dataset.delrep); renderTrack(); }
  });
  $("#sidetabs").addEventListener("click", (e) => { const b = e.target.closest("[data-side]"); if (b) { S.side = b.dataset.side; renderMeasure(); } });
  $("#file-one").addEventListener("change", (e) => addPicture(e.target.files[0]));
  $("#file-many").addEventListener("change", (e) => runBatch(e.target.files));
  $$(".holder-sw").forEach((i) => i.addEventListener("change", (e) => { S.holder = e.target.checked; $$(".holder-sw").forEach((x) => { x.checked = S.holder; }); }));

  // paste (Ctrl/⌘+V) and drop anywhere
  document.addEventListener("paste", (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (!item || e.target.closest("input, textarea")) return;
    e.preventDefault(); const f = item.getAsFile();
    if (/^#\/?batch/.test(location.hash)) runBatch([f]); else { location.hash = "#check"; addPicture(new File([f], "pasted picture", { type: f.type })); }
  });
  document.addEventListener("dragover", (e) => { e.preventDefault(); document.body.classList.add("dropping"); });
  document.addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.body.classList.remove("dropping"); });
  document.addEventListener("drop", (e) => {
    e.preventDefault(); document.body.classList.remove("dropping");
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length > 1 || /^#\/?batch/.test(location.hash)) runBatch(files); else if (files[0]) { location.hash = "#check"; addPicture(files[0]); }
  });

  // calculator
  const calc = $("#calc");
  calc.addEventListener("input", (e) => {
    const t = e.target, c = S.calc;
    if (t.dataset.odds) { c.odds[t.dataset.odds] = Number(t.value) || 0; c.oddsEdited = true; return calcRun(); }
    if (t.dataset.val) { c.values[t.dataset.val] = t.value; return calcRun(); }
    if (t.id === "c-fee") { c.fee = t.value; c.feeEdited = true; return calcRun(); }
    if (t.id === "c-name") { c.name = t.value; $$("#c-rows a").forEach((a, i) => { a.href = G.ebaySold(c.name, `${c.company} ${G.LADDER[c.company][i]}`); }); $("#c-rawlink").href = G.ebaySold(c.name, ""); return; }
    const k = { "c-raw": "raw", "c-ship": "ship", "c-prep": "prep", "c-sell": "sellPct" }[t.id];
    if (k) { c[k] = t.value; calcRun(); }
  });
  calc.addEventListener("change", (e) => {
    const t = e.target, c = S.calc;
    if (t.id === "c-company") { c.company = t.value; c.oddsEdited = false; c.feeEdited = false; c.fee = ""; if (t.value !== "PSA") $("#c-fee").value = ""; calcSync(); }
    if (t.id === "c-cond") { c.condition = t.value; c.oddsEdited = false; calcSync(); }
    if (t.id === "c-level") { c.level = t.value; c.feeEdited = false; calcRun(); }
    if (t.id === "c-rr") { c.viaRR = t.checked; calcRun(); }
  });
  $("#c-resetodds").addEventListener("click", () => { S.calc.oddsEdited = false; calcSync(); });
  $("#c-cond").innerHTML = G.CONDITIONS.map(([k, l]) => `<option value="${k}" ${k === "near" ? "selected" : ""}>${esc(l)}</option>`).join("");
  $("#c-level").innerHTML = `<option value="auto">Pick from the card's value</option>` + PSA_LEVELS.map(([n, p, mx]) => `<option value="${n}">${n} — $${p} (value up to $${mx.toLocaleString()})</option>`).join("");
  if (window.RRCardSearch) window.RRCardSearch.attach($("#c-name"));
  $("#c-name").addEventListener("change", (e) => { S.calc.name = e.target.value; calcSync(); });

  $("#holdform").addEventListener("submit", addHolding);
  $("#reportform").addEventListener("change", renderReportForm);
  $("#reportform").addEventListener("submit", submitReport);
}

async function pasteButton() {
  try {
    const items = await navigator.clipboard.read();
    for (const it of items) { const type = it.types.find((t) => t.startsWith("image/")); if (type) return addPicture(new File([await it.getType(type)], "pasted picture", { type })); }
    toast("No picture on the clipboard. Copy a listing photo or take a screenshot first.");
  } catch { toast(`Press ${/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"}+V to paste a picture.`); }
}

// test hook (tests/centering): measure a file without the UI
window.CIQ = { measureFile, analyze: M.analyze, S, addPicture, runBatch };

// ================================================================ collection (CardVestIQ)
const sideWorst = (c) => (c ? M.worseShare(M.analyze(c.model)) : null);
async function fetchFile(url) {
  const blob = await (await fetch(url)).blob();
  return new File([blob], url.split("/").pop(), { type: blob.type || "image/jpeg" });
}
function thumbOf(cv, w = 96) {
  const t = document.createElement("canvas"); t.width = w; t.height = Math.round(w * cv.height / cv.width);
  t.getContext("2d").drawImage(cv, 0, 0, t.width, t.height);
  return t.toDataURL("image/jpeg", 0.8);
}
// Measured sides of a holding: sample cards from demo/<img>-front|back.jpg, saved cards from their stored picture + lines.
async function holdingSides(h) {
  if (S.meas[h.id]) return S.meas[h.id];
  const out = { front: null, back: null };
  if (h.img) {
    for (const side of ["front", "back"]) {
      try { [out[side]] = await measureFile(await fetchFile(`demo/${h.img}-${side}.jpg`), { holder: false }); } catch (e) { console.warn(e); }
      if (out[side] && !out[side].ok) out[side] = null;
    }
  } else for (const side of ["front", "back"]) {
    const s = h.sides?.[side]; if (!s) continue;
    const img = new Image(); img.src = s.pic; await img.decode().catch(() => {});
    const cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight; cv.getContext("2d").drawImage(img, 0, 0);
    out[side] = { ok: true, canvas: cv, dpi: s.model.dpi, model: s.model, auto: M.clone(s.model), source: s.source || "photo", file: h.name };
  }
  if (out.front) S.thumbs[h.id] = thumbOf(out.front.canvas);
  return (S.meas[h.id] = out);
}
const measOf = (sides) => { if (!sides?.front) return null; const a = M.analyze(sides.front.model); return { lr: a.lr?.[0], tb: a.tb?.[0], tilt: a.tilt }; };

async function renderCollection() {
  const box = $("#c-list"), hs = PF.list();
  const pending = new Set(hs.filter((h) => !S.meas[h.id]).map((h) => h.id));
  const draw = () => {
    box.innerHTML = PF.render(hs.map((h) => {
      const m = S.meas[h.id];
      return { h, v: PF.value(h, m ? { front: sideWorst(m.front), back: sideWorst(m.back) } : null), thumb: S.thumbs[h.id] || h.thumb,
               meas: measOf(m), measuring: pending.has(h.id) };
    }));
  };
  draw();
  for (const h of hs) {
    if (!pending.has(h.id)) continue;
    await holdingSides(h); pending.delete(h.id);
    if (/^#\/?collection/.test(location.hash)) draw();
  }
}

async function openHolding(id) {
  const h = PF.list().find((x) => x.id === id); if (!h) return;
  location.hash = "#check";
  setStatus(`<span class="spinner"></span> Opening ${esc(h.name)}…`);
  const sides = await holdingSides(h);
  setStatus("");
  S.holding = h; S.side = "front"; S.sides.front = sides.front; S.sides.back = sides.back;
  Object.assign(S.calc, { name: h.name, raw: h.raw || "", values: { ...(h.values || {}) }, condition: h.condition || "near",
    company: h.company || "PSA", oddsEdited: false, feeEdited: false, fee: "", level: "auto" });
  $("#c-name").value = h.name; $("#c-raw").value = h.raw || ""; $("#c-cond").value = S.calc.condition;
  $("#c-company").value = S.calc.company; $("#c-level").value = "auto";
  renderMeasure();
  window.scrollTo({ top: 0 });
}

function renderHoldingBar() {
  const h = S.holding, bar = $("#holdbar"), form = $("#holdform");
  bar.hidden = !h; form.hidden = !!h;
  if (!h) return;
  const v = PF.value(h, { front: sideWorst(S.sides.front), back: sideWorst(S.sides.back) }), demo = h.id.startsWith("d-");
  const $f = (x) => (x == null ? "—" : `$${Math.round(x).toLocaleString()}`);
  bar.innerHTML = `<div class="hb-text"><b>${esc(h.name)}</b> <span class="muted">${esc(h.set || "")}</span>${demo ? ` <span class="pill warn">sample card</span>` : ""}<br>
    <span class="small">Paid ${$f(h.paid)}${h.boughtOn ? ` on ${esc(h.boughtOn)}` : ""} · raw now ${$f(v.rawNow)}${v.gainNow != null ? ` (${v.gainNow >= 0 ? "+" : "−"}${$f(Math.abs(v.gainNow))})` : ""}${
    h.status === "grading" ? ` · at ${esc(h.company)} since ${esc(h.sentOn)}` : ""}${h.status === "sold" ? ` · graded ${esc(h.company)} ${esc(h.realGrade)}, sold for ${$f(h.soldFor)}` : ""}</span></div>
    <div class="row">${demo ? "" : `<button class="btn sm" data-act="saveholding">Save prices to this card</button>`}
      <a class="btn sm" href="#collection">← Collection</a><button class="btn sm" data-act="leaveholding">Close</button></div>`;
}

// A picture up to 900 px wide plus the lines, scaled to match, so a saved card reopens without the original photo.
function sidePack(c) {
  if (!c) return null;
  const k = Math.min(1, 900 / c.canvas.width), cv = document.createElement("canvas");
  cv.width = Math.round(c.canvas.width * k); cv.height = Math.round(c.canvas.height * k);
  cv.getContext("2d").drawImage(c.canvas, 0, 0, cv.width, cv.height);
  const m = M.clone(c.model), sc = (v) => v * k;
  m.w = cv.width; m.h = cv.height; m.padPx = sc(m.padPx); m.dpi = m.dpi * k; if (m.srcDpi) m.srcDpi = Math.min(m.srcDpi, m.dpi);
  for (const s of Object.values(m.sides)) {
    s.t = s.t.map(sc); s.outer = s.outer.map(sc); s.inner = s.inner.map(sc); if (s.se != null) s.se *= k;
    (s.samples || []).forEach((q) => { q.t = sc(q.t); q.outer = sc(q.outer); q.inner = sc(q.inner); });
  }
  return { pic: cv.toDataURL("image/jpeg", 0.85), model: m, source: c.source };
}
function addHolding(e) {
  e.preventDefault();
  const f = e.target, c = S.calc, name = f.elements.hname.value.trim() || c.name || "Untitled card";
  const h = PF.add({ name, set: f.elements.hset.value.trim(), paid: Number(f.elements.hpaid.value) || 0, boughtOn: f.elements.hon.value || "",
    condition: c.condition, company: c.company, raw: c.raw, values: { ...c.values }, status: "raw", thumb: thumbOf(S.sides.front.canvas),
    sides: { front: sidePack(S.sides.front), back: sidePack(S.sides.back) } });
  if (!h) return toast("Couldn't save: this browser's storage is full or switched off.");
  S.meas[h.id] = { front: S.sides.front, back: S.sides.back }; S.thumbs[h.id] = h.thumb; S.holding = h;
  f.reset(); renderHoldingBar(); toast(`${name} added to your collection.`);
}
function saveHoldingChanges() {
  const h = S.holding, c = S.calc; if (!h) return;
  const patch = { raw: c.raw, values: { ...c.values }, condition: c.condition, company: c.company };
  if (PF.update(h.id, patch)) { Object.assign(h, patch); delete S.meas[h.id]; S.meas[h.id] = { front: S.sides.front, back: S.sides.back }; renderHoldingBar(); toast("Prices saved to this card."); }
}

// ================================================================ start
if (PF.isDemo()) { document.body.classList.add("demo"); if (!location.hash) history.replaceState(null, "", "#collection"); }
wire(); route(); renderMeasure(); renderBatch();
