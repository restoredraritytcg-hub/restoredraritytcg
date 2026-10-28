// Card Check: a public, no-login page. Phone photos or scanner files → straightened card, centering,
// corner/edge close-ups, centering grade caps and listing photos. Nothing leaves the device.
import { esc, $, $$, toast, centeringGrades } from "./common.js";
import * as P from "./scanproc.js";
import * as U from "./scanupload.js";
import { analyzePhoto } from "./photoproc.js";

const C = window.RRCentering;
const cards = [];                 // { front: side|null, back: side|null }
const busy = new Set();           // "i|side" slots being processed
let target = null;                // slot the file picker fills
let lastBacks = null;             // card indexes filled by one multi-card back scan (for ⇄)

const pair = (x) => `${x}/${100 - x}`;
const fmt = (p) => (p ? `${Math.round(p[0])}/${100 - Math.round(p[0])}` : "—");

function cropOf(src, [x, y, w, h]) {
  const c = P.canvas(Math.max(1, w), Math.max(1, h));
  c.getContext("2d").drawImage(src, x, y, w, h, 0, 0, w, h); return c;
}
const urlOf = async (cv, q = 0.9) => URL.createObjectURL(await U.toBlob(cv, "image/jpeg", q));

// A scan (dpi in the file) goes through the scan station's processing; a photo gets flattened first.
// Only card-shaped results count (a sliver of something at the scan's edge isn't a card).
const cardShaped = (c) => { const r = c.canvas.height / c.canvas.width; return c.ok && Math.max(r, 1 / r) > 1.25 && Math.max(r, 1 / r) < 1.6; };
async function processFile(file) {
  const meta = await P.fileDpi(file).catch(() => null);
  if (meta && meta >= 150) {
    const ok = (await U.analyze(file, { maxCards: 3, defaultDpi: meta })).cards.filter(cardShaped);
    if (ok.length) return ok;
  }
  const ph = await analyzePhoto(file);
  if (ph) return [ph];
  return (await U.analyze(file, { maxCards: 3, defaultDpi: 600 })).cards.filter(cardShaped);
}

async function makeSide(c) {
  const close = {};
  for (const k of [...P.CORNERS, ...P.EDGES]) close[k] = await urlOf(cropOf(c.canvas, c.regions[k]));
  return { c, centering: c.centering, auto: c.centering, url: await urlOf(U.resized(c.canvas, 1600)), close };
}

async function fill(files, i, side) {
  for (const f of files) {
    if (!f.type.startsWith("image/") && !/\.(jpe?g|png|tiff?|webp|heic)$/i.test(f.name)) continue;
    busy.add(`${i}|${side}`); render();
    let found = [];
    try { found = await processFile(f); }
    catch (e) { console.error(e); toast(/heic/i.test(f.name) ? "This browser can't open HEIC photos. Use JPEG." : "Couldn't open " + f.name); }
    busy.delete(`${i}|${side}`);
    if (!found.length) { toast("No card found in " + f.name + ". Try a darker, plain background."); render(); continue; }
    const filled = [];
    for (const c of found) {
      while (cards.length <= i) cards.push({ front: null, back: null });
      cards[i][side] = await makeSide(c); filled.push(i); i++;
    }
    lastBacks = side === "back" && filled.length > 1 ? filled : lastBacks;
    render();
  }
}

// --------------------------------------------------------------- render
function gradeLine(card) {
  const sum = (s) => (s?.centering ? C.summary(s.centering) : null);
  const g = centeringGrades(sum(card.front), sum(card.back));
  if (!g) return "";
  const cos = Object.entries(g.companies).map(([co, r]) => `<span>${co} <b>${esc(r.grade)}</b></span>`).join("");
  return `<div class="grades">${cos}</div><div class="muted small">Best grade the centering allows (worse direction: front
    ${pair(g.front)}${g.back != null ? `, back ${pair(g.back)}` : " — add the back for its limits too"}).</div>`;
}

function slotHtml(i, side) {
  const s = cards[i]?.[side], label = side === "front" ? "Front" : "Back";
  if (busy.has(`${i}|${side}`)) return `<div class="slot"><h3>${label}</h3><div class="busy">Finding the card…</div></div>`;
  if (!s) return `<div class="slot" data-drop="${i}|${side}"><h3>${label}</h3><div class="pick">
    <button class="btn gold" data-pick="${i}|${side}">📷 Photo or scan</button><span>or drop a file here</span></div></div>`;
  const sum = s.centering ? C.summary(s.centering) : null;
  const unsure = s.centering && (Object.values(s.centering.lines).some((l) => l.found === false) || sum.check.length);
  const warn = [...(s.c.warn || []), ...(unsure ? ["Some borders weren't measured cleanly. Check them with 📐 Centering."] : [])];
  return `<div class="slot full" data-drop="${i}|${side}"><h3>${label}</h3>
    <div class="img"><img src="${s.url}" alt="${label}" data-view="${i}|${side}|card"></div>
    <div class="ratio">${sum ? `L/R <b>${fmt(sum.lr)}</b> · T/B <b>${fmt(sum.tb)}</b>` : `<span class="muted">Centering not measured</span>`}</div>
    <div class="row">
      ${s.centering ? `<button class="btn sm" data-act="center|${i}|${side}">📐 Centering</button>` : ""}
      <button class="btn sm" data-act="surface|${i}|${side}">🔍 Surface</button>
      <button class="btn sm" data-act="edges|${i}|${side}">Edges</button>
      <button class="btn sm" data-pick="${i}|${side}">↻ Replace</button>
      <button class="btn sm danger" data-act="del|${i}|${side}">✕</button></div>
    <div class="close8">${P.CORNERS.map((k) => `<img src="${s.close[k]}" alt="${k}" title="${k}" data-view="${i}|${side}|${k}">`).join("")}</div>
    ${warn.map((w) => `<p class="warn">⚠ ${esc(w)}</p>`).join("")}</div>`;
}

function render() {
  if (!cards.length) cards.push({ front: null, back: null });
  $("#cards").innerHTML = (lastBacks ? `<div class="panel row cardbox"><span class="grow small">Backs from one scan went to cards
      ${lastBacks.map((i) => i + 1).join(", ")}. Wrong order?</span><button class="btn sm" data-act="reverse">⇄ Reverse those backs</button>
      <button class="btn sm" data-act="okbacks">They're right</button></div>` : "") +
    cards.map((card, i) => `<section class="panel cardbox">
      <div class="row"><h2 class="grow">Card ${i + 1}</h2>
        ${cards.length > 1 ? `<button class="btn sm danger" data-act="rmcard|${i}">Remove card</button>` : ""}</div>
      ${gradeLine(card)}
      <div class="slots2">${slotHtml(i, "front")}${slotHtml(i, "back")}</div>
      ${card.front || card.back ? `<div class="kit" style="margin-top:12px"><div class="row">
        <button class="btn gold" data-act="kit|${i}">⬇ Listing photos</button>
        <button class="btn" data-act="copy|${i}">Copy listing text</button></div>
        <textarea readonly id="txt${i}">${esc(listingText(card))}</textarea></div>` : ""}
    </section>`).join("");
}

// --------------------------------------------------------------- viewer
function viewer(title, urls) {
  const v = document.createElement("div");
  v.className = "viewer";
  v.innerHTML = `<div class="bar"><b class="grow">${esc(title)}</b><span class="muted small">Tap to zoom</span>
    <button class="btn sm" data-x>Close</button></div><div class="body"><div>${urls.map((u) => `<img src="${u}" style="display:block;margin:0 auto 10px">`).join("")}</div></div>`;
  v.addEventListener("click", (e) => {
    if (e.target.closest("[data-x]")) v.remove();
    else if (e.target.tagName === "IMG") v.classList.toggle("zoom");
  });
  document.body.append(v);
}

// Relief view: light from the top-left, so dents, creases and scratches stand out.
async function surfaceUrl(s) {
  const src = U.resized(s.c.canvas, 2000), w = src.width, h = src.height;
  const d = src.getContext("2d").getImageData(0, 0, w, h), g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = 0.299 * d.data[i * 4] + 0.587 * d.data[i * 4 + 1] + 0.114 * d.data[i * 4 + 2];
  const out = new ImageData(w, h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const v = Math.max(0, Math.min(255, 128 + 3 * (g[(y + 1) * w + x + 1] - g[(y - 1) * w + x - 1])));
    const o = (y * w + x) * 4; out.data[o] = out.data[o + 1] = out.data[o + 2] = v; out.data[o + 3] = 255;
  }
  const c = P.canvas(w, h); c.getContext("2d").putImageData(out, 0, 0);
  return urlOf(c);
}

// --------------------------------------------------------------- listing kit
function listingText(card) {
  const line = (s, n) => {
    const sum = s?.centering ? C.summary(s.centering) : null;
    return sum ? `${n}: L/R ${fmt(sum.lr)}, T/B ${fmt(sum.tb)}` : null;
  };
  const rows = [line(card.front, "Front"), line(card.back, "Back")].filter(Boolean);
  return (rows.length ? `Centering (measured from photos):\n${rows.join("\n")}\n` : "") +
    "Close-up photos of all four corners included. Raw card, not professionally graded.";
}

function stamp(x, w, h) {
  x.fillStyle = "#0f1626"; x.fillRect(0, h - 34, w, 34);
  x.fillStyle = "#f5b301"; x.font = "600 16px system-ui, sans-serif"; x.textBaseline = "middle";
  x.fillText("Checked with Restored Rarity · restoredraritytcg.com", 12, h - 17);
}

// 4 corners per side in a row, front on top.
function cornersSheet(card) {
  const sides = ["front", "back"].filter((k) => card[k]), t = 360, gap = 8, head = 30;
  const w = 4 * t + 5 * gap, h = sides.length * (t + head + gap) + gap + 34;
  const c = P.canvas(w, h), x = c.getContext("2d");
  x.fillStyle = "#111"; x.fillRect(0, 0, w, h);
  sides.forEach((k, r) => {
    const y0 = gap + r * (t + head + gap), s = card[k];
    x.fillStyle = "#fff"; x.font = "600 18px system-ui, sans-serif"; x.textBaseline = "middle";
    x.fillText(k === "front" ? "Front corners" : "Back corners", gap, y0 + head / 2);
    P.CORNERS.forEach((cn, j) => {
      const [sx, sy, sw, sh] = s.c.regions[cn], f = Math.min(t / sw, t / sh);
      x.drawImage(s.c.canvas, sx, sy, sw, sh, gap + j * (t + gap) + (t - sw * f) / 2, y0 + head + (t - sh * f) / 2, sw * f, sh * f);
    });
  });
  stamp(x, w, h);
  return c;
}

// The card with the 8 border measurements drawn on (gold = card edge, cyan = inside of the border).
function centeringSheet(s, label) {
  const img = U.resized(s.c.canvas, 1400), W = img.width, H = img.height, top = 44;
  const c = P.canvas(W, H + top + 34), x = c.getContext("2d");
  x.fillStyle = "#0f1626"; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(img, 0, top);
  const sum = C.summary(s.centering);
  x.fillStyle = "#fff"; x.font = "600 22px system-ui, sans-serif"; x.textBaseline = "middle";
  x.fillText(`${label} centering  L/R ${fmt(sum.lr)}  ·  T/B ${fmt(sum.tb)}`, 12, top / 2);
  const tick = Math.max(10, W * 0.02);
  for (const l of Object.values(s.centering.lines)) {
    const at = (f) => (l.axis === "y" ? [l.pos * W, top + f * H] : [f * W, top + l.pos * H]);
    const [ax, ay] = at(l.outer), [bx, by] = at(l.inner);
    x.lineWidth = 3; x.strokeStyle = "rgba(255,255,255,.8)";
    x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
    for (const [px, py, col] of [[ax, ay, "#f5b301"], [bx, by, "#2ad4e6"]]) {
      x.strokeStyle = col; x.lineWidth = 4; x.beginPath();
      if (l.axis === "y") { x.moveTo(px - tick, py); x.lineTo(px + tick, py); } else { x.moveTo(px, py - tick); x.lineTo(px, py + tick); }
      x.stroke();
    }
  }
  stamp(x, c.width, c.height);
  return c;
}

async function kit(i) {
  const card = cards[i], files = [], n = `card${i + 1}`;
  const add = async (cv, name) => files.push(new File([await U.toBlob(cv, "image/jpeg", 0.92)], name, { type: "image/jpeg" }));
  for (const k of ["front", "back"]) if (card[k]) await add(U.resized(card[k].c.canvas, 1600), `${n}_${k}.jpg`);
  await add(cornersSheet(card), `${n}_corners.jpg`);
  for (const k of ["front", "back"]) if (card[k]?.centering) await add(centeringSheet(card[k], k === "front" ? "Front" : "Back"), `${n}_${k}_centering.jpg`);
  if (navigator.canShare?.({ files })) {
    try { await navigator.share({ files, text: listingText(card) }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  for (const f of files) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name;
    document.body.append(a); a.click(); a.remove();
    await new Promise((r) => setTimeout(r, 250));
  }
  toast(`Downloaded ${files.length} pictures`);
}

// --------------------------------------------------------------- events
document.addEventListener("click", async (e) => {
  const pick = e.target.closest("[data-pick]");
  if (pick) { target = pick.dataset.pick; $("#file").click(); return; }
  const view = e.target.closest("[data-view]");
  if (view) {
    const [i, side, k] = view.dataset.view.split("|"), s = cards[i][side];
    viewer(k === "card" ? `Card ${+i + 1} ${side}` : `${side} · ${k}`, [k === "card" ? s.url : s.close[k]]);
    return;
  }
  const act = e.target.closest("[data-act]");
  if (!act) return;
  const [a, i, side] = act.dataset.act.split("|"), s = cards[i]?.[side];
  if (a === "center") {
    C.open({ imageUrl: s.url, centering: s.centering, autoCentering: s.auto, title: `Card ${+i + 1} ${side}`, editable: true,
      onSave: (c) => { s.centering = c; render(); } });
  } else if (a === "surface") {
    toast("Building surface view…"); viewer(`Card ${+i + 1} ${side} · surface`, [await surfaceUrl(s)]);
  } else if (a === "edges") {
    viewer(`Card ${+i + 1} ${side} · edges`, P.EDGES.map((k) => s.close[k]));
  } else if (a === "del") { cards[i][side] = null; render(); }
  else if (a === "rmcard") { cards.splice(i, 1); lastBacks = null; render(); }
  else if (a === "kit") { act.disabled = true; try { await kit(+i); } finally { act.disabled = false; } }
  else if (a === "copy") {
    const t = $(`#txt${i}`).value;
    try { await navigator.clipboard.writeText(t); toast("Copied"); } catch { $(`#txt${i}`).select(); }
  } else if (a === "reverse") {
    const backs = lastBacks.map((j) => cards[j].back).reverse();
    lastBacks.forEach((j, n) => { cards[j].back = backs[n]; }); lastBacks = null; render();
  } else if (a === "okbacks") { lastBacks = null; render(); }
});

$("#add").addEventListener("click", () => {
  const empty = cards.findIndex((c) => !c.front && !c.back);
  const i = empty >= 0 ? empty : cards.push({ front: null, back: null }) - 1;
  render(); target = `${i}|front`; $("#file").click();
});
$("#file").addEventListener("change", (e) => {
  const files = [...e.target.files]; e.target.value = "";
  if (!files.length || !target) return;
  const [i, side] = target.split("|"); fill(files, +i, side);
});
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  $$(".slot.over").forEach((x) => x.classList.remove("over"));
  e.target.closest("[data-drop]")?.classList.add("over");
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  $$(".slot.over").forEach((x) => x.classList.remove("over"));
  const d = e.target.closest("[data-drop]"), files = [...(e.dataTransfer?.files || [])];
  if (!files.length) return;
  const free = cards.findIndex((c) => !c.front);
  const [i, side] = d ? d.dataset.drop.split("|") : [free >= 0 ? free : cards.length, "front"];
  fill(files, +i, side);
});

render();
