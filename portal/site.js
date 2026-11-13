// Website section of the admin portal (#/site/<tab>) and the Quote panel on each submission.
//
// Website content (prices, announcement bar, news, events, Instagram) is saved in Supabase
// (table site_content, admin-only writes); the public site reads it with site_get().
// Reviews still live in the Google Sheet's Reviews tab and quotes are worked out by the
// Apps Script (Code.gs), so those two go through the Apps Script web app with the
// signed-in admin's token, exactly like "Send status email".
import { api, DEMO, esc, $, $$, toast, fmtDate, mediaUrl, prepareImage, uid } from "./common.js";

const GAS = window.RR_CONFIG?.emailEndpoint || "";
const IG_DEFAULT = (window.RR_CONFIG?.instagram || "").replace(/^.*instagram\.com\//, "").replace(/\/.*$/, "") || "restored.raritytcg";

// The site's built-in prices (index.html CLEAN_TIERS / REPAIR_TIERS / ADDON_TIERS / PRICE_RULES).
// Shown until prices are saved here once. Keep in step with index.html.
export const DEFAULT_PRICES = {
  "services": [
    {
      "title": "Card Cleaning",
      "price": 10,
      "type": "clean",
      "desc": "A meticulous cleaning performed under magnification to safely lift dirt, grime, fingerprints, and surface buildup while restoring the card's natural presentation and holo brilliance. Does not include scratch repair or buffing.",
      "sub": "",
      "bulk": true
    },
    {
      "title": "Card Cleaning + Scratch Repair",
      "price": 15,
      "type": "clean",
      "desc": "Everything included in our Card Cleaning service, with additional surface refinement and precision buffing to reduce visible scratches, scuffs, and holo wear while preserving the card's original finish.",
      "sub": ""
    },
    {
      "title": "Grade-Ready Evaluation + Deep Clean",
      "price": 20,
      "type": "clean",
      "desc": "Our most comprehensive grading-prep service. Includes a detailed evaluation under magnification, deep cleaning, scratch and surface refinement, identification and correction of addressable surface defects, and minor corner or edge flattening where appropriate. Your card is cleaned, evaluated, refined, and ready to submit.",
      "sub": ""
    },
    {
      "title": "Base Repair",
      "price": 35,
      "type": "repair",
      "desc": "Targeted restoration for localized damage, including minor corner or edge lifting, dents or gouges under ¼ inch, and creases under ½ inch. Each repair is carefully addressed to stabilize the affected area and restore the card as close as possible to its original appearance.",
      "sub": ""
    },
    {
      "title": "Major Repair",
      "price": 50,
      "type": "repair",
      "desc": "Advanced restoration for significant damage, including major corner or edge lifting, delamination or layer separation, dents or gouges over ¼ inch, and creases over ½ inch. Designed for cards requiring more extensive techniques, additional working time, or multiple rounds of restoration to achieve the best result possible.",
      "sub": ""
    },
    {
      "title": "Slab Cracking",
      "price": 15,
      "type": "addon",
      "desc": "Careful removal of your card from a graded slab so it can be cleaned, restored, or resubmitted. The slab is opened with care to protect the card's surface, edges, and corners.",
      "sub": ""
    },
    {
      "title": "Grading Submission (PSA, CGC, BGS, TAG)",
      "price": 15,
      "type": "grading",
      "desc": "We package your card and submit it to the grading company you choose: PSA, CGC, BGS or TAG. The grading company\u2019s own fees are separate (see How grading fees work).",
      "sub": ""
    }
  ],
  "bulk": [
    {
      "min": 21,
      "price": 8
    },
    {
      "min": 41,
      "price": 6
    }
  ],
  "slabAddon": 10,
  "gradingNext": 5,
  "gradingAddon": 5,
  "psaDeposit": 75,
  "psaLevels": [
    { "name": "Value", "price": 39.99, "maxValue": 500, "days": "90–100 business days" },
    { "name": "Standard", "price": 59.99, "maxValue": 1000, "days": "70–80 business days" },
    { "name": "Priority", "price": 79.99, "maxValue": 1500, "days": "50–60 business days" },
    { "name": "Express", "price": 199, "maxValue": 2500, "days": "20–30 business days" },
    { "name": "Super Express", "price": 349, "maxValue": 5000, "days": "10–15 business days" },
    { "name": "Premier", "price": 599, "maxValue": 10000, "days": "7–10 business days" },
    { "name": "Premium 1", "price": 999, "maxValue": 25000, "days": "5–7 business days" }
  ],
  "surcharge": [
    {
      "upTo": 250,
      "rate": 0
    },
    {
      "upTo": 1500,
      "rate": 10
    },
    {
      "upTo": 3000,
      "rate": 12
    }
  ],
  "referral": 10
};

const TABS = [["reviews", "Reviews"], ["prices", "Prices"], ["announcement", "Announcement"],
  ["news", "News"], ["events", "Events"], ["instagram", "Instagram"]];

// ------------------------------------------------------------ helpers
const clone = (v) => JSON.parse(JSON.stringify(v));
const num = (v) => { const n = parseFloat(String(v ?? "").replace(/[$,%\s]/g, "")); return isFinite(n) ? n : NaN; };
const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const errBox = (e) => `<div class="empty" style="text-align:left">⚠ ${esc(e.message || e)}</div>`;
const LIVE_NOTE = `<p class="muted small" style="margin:12px 0 0">Saved changes show on the website within about a minute
  (open it and refresh; phones may need a pull-to-refresh).</p>`;

// Apps Script web app (reviews + quotes). Checks the script is new enough before posting,
// because an older script would treat any unknown POST as a brand-new website submission.
let gasCaps = null;
async function gas(type, body = {}) {
  if (DEMO) return demoGas(type, body);
  if (!GAS) throw new Error("The Apps Script address isn't set (emailEndpoint in config.js).");
  if (!gasCaps) gasCaps = await fetch(`${GAS}?action=portalEmails`).then((r) => r.json()).catch(() => null);
  const need = type === "portalReviews" ? "reviews" : type === "portalCardServices" ? "services" : type === "portalPsa" ? "psa" : "quotes";
  if (!gasCaps?.success || !gasCaps[need]) {
    gasCaps = null;
    throw new Error("The Apps Script hasn't been updated yet: paste the new Code.gs into the Sheet's Apps Script and deploy a new version.");
  }
  const token = (await api.session())?.access_token;
  const res = await fetch(GAS, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ type, token, ...body }) });
  const out = await res.json().catch(() => null);
  if (!out?.success) throw new Error(out?.error || `The Apps Script answered ${res.status}.`);
  return out;
}

// Website content rows from Supabase
let SC = null;
async function loadSite() {
  try {
    const rows = await api.select("site_content");
    SC = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch (e) {
    if (/site_content|relation|does not exist|schema cache/i.test(e.message))
      throw new Error("The website content table isn't set up yet. In Supabase → SQL Editor, run supabase/2026-11-04_site_content.sql, then refresh.");
    throw e;
  }
}
/** Send changed card services to the Sheet so the website order's quote follows them.
 *  Returns {onSheet, updated}; throws if the Apps Script is too old or refuses. */
export async function saveServicesToSheet(code, cards) { return gas("portalCardServices", { code, cards }); }
/** PSA panel → Sheet copy (website tracker) + the step email. */
export async function savePsaToSheet(body) { return gas("portalPsa", body); }

/** The current price list (saved in the portal, or the website's built-in one), for the New submission service menu. */
export async function currentPrices() {
  if (!SC) { try { await loadSite(); } catch (e) { SC = {}; } }
  return withDefaults(clone(SC.prices && SC.prices.services ? SC.prices : DEFAULT_PRICES));
}
async function saveSite(key, value, msg = "Saved. It's live on the site within a minute.") {
  await api.upsert("site_content", { key, value }, "key");
  SC[key] = clone(value);   // a copy, so later edits on the page don't change the saved version
  toast(msg, 4000);
}

// ------------------------------------------------------------ page shell
export async function sitePage(app, tab) {
  if (!TABS.some(([k]) => k === tab)) tab = "reviews";
  app.innerHTML = `<div class="row"><h1 class="grow">Website</h1>
      <a class="btn sm" href="../index.html" target="_blank" rel="noopener">Open the website ↗</a></div>
    <nav class="tabs" aria-label="Website sections">${TABS.map(([k, l]) =>
      `<a href="#/site/${k}" class="${k === tab ? "on" : ""}">${l}</a>`).join("")}</nav>
    <div id="sitebody"><div class="loading">Loading…</div></div>`;
  const body = $("#sitebody");
  try {
    if (tab !== "reviews" && !SC) await loadSite();
    await ({ reviews, prices, announcement, news, events, instagram })[tab](body);
  } catch (e) { body.innerHTML = errBox(e); }
}

// ------------------------------------------------------------ reviews
let rvFilter = "all";
async function reviews(body) {
  const list = (await gas("portalReviews", { op: "list" })).reviews || [];
  const stars = (n) => `<span class="stars" aria-label="${n} of 5 stars">${"★".repeat(n)}<span class="off">${"★".repeat(Math.max(0, 5 - n))}</span></span>`;
  const draw = () => {
    const off = list.filter((r) => !r.approved).length, on = list.length - off;
    const shown = list.filter((r) => rvFilter === "all" || (rvFilter === "on" ? r.approved : !r.approved));
    body.innerHTML = `<div class="seg" role="tablist">
        <button data-f="all" class="${rvFilter === "all" ? "on" : ""}">All (${list.length})</button>
        <button data-f="off" class="${rvFilter === "off" ? "on" : ""}">Hidden (${off})</button>
        <button data-f="on" class="${rvFilter === "on" ? "on" : ""}">On the site (${on})</button></div>
      <p class="muted small">New reviews start hidden. Switch one on and it shows in the Reviews section and the ticker at the top of the site.</p>
      ${shown.map((r) => `<div class="panel rv ${r.approved ? "is-on" : ""}" style="margin-top:10px"><div class="row" style="align-items:flex-start">
          <div class="grow"><b>${esc(r.name || "Anonymous")}</b> ${stars(r.rating)}
            <div class="muted small">${esc([r.card, fmtDate(r.at)].filter(Boolean).join(" · "))}</div></div>
          <label class="switch"><input type="checkbox" data-row="${r.row}" ${r.approved ? "checked" : ""}>
            <span class="track"></span><span class="sw-l">${r.approved ? "On the site" : "Hidden"}</span></label></div>
          <p style="margin:8px 0 0;white-space:pre-line">${esc(r.text)}</p></div>`).join("")
        || `<div class="empty" style="margin-top:10px">${list.length ? "Nothing here." : "No reviews yet."}</div>`}`;
    $$(".seg button", body).forEach((b) => b.onclick = () => { rvFilter = b.dataset.f; draw(); });
    $$("input[data-row]", body).forEach((cb) => cb.onchange = async () => {
      const r = list.find((x) => String(x.row) === cb.dataset.row);
      cb.disabled = true;
      try {
        await gas("portalReviews", { op: "set", row: r.row, at: r.at, approved: cb.checked });
        r.approved = cb.checked;
        toast(r.approved ? "Now showing on the site." : "Hidden from the site.");
        draw();
      } catch (e) { cb.checked = !cb.checked; cb.disabled = false; toast(e.message, 6000); }
    });
  };
  draw();
}

// ------------------------------------------------------------ prices
const GROUPS = [["clean", "Cleaning & grading prep"], ["repair", "Repairs"], ["addon", "Slab cracking on its own"],
  ["grading", "Grading submission on its own (first card)"]];
/** Fill in anything a saved price list predates: the grading service and its two prices. */
function withDefaults(P) {
  if (!P.services.some((x) => x.type === "grading")) P.services.push(clone(DEFAULT_PRICES.services.find((x) => x.type === "grading")));
  if (P.gradingNext == null) P.gradingNext = DEFAULT_PRICES.gradingNext;
  if (P.gradingAddon == null) P.gradingAddon = DEFAULT_PRICES.gradingAddon;
  if (P.psaDeposit == null) P.psaDeposit = DEFAULT_PRICES.psaDeposit;
  if (!Array.isArray(P.psaLevels) || !P.psaLevels.length) P.psaLevels = clone(DEFAULT_PRICES.psaLevels);
  return P;
}
async function prices(body) {
  let P = withDefaults(clone(SC.prices && SC.prices.services ? SC.prices : DEFAULT_PRICES));
  const saved = !!SC.prices;
  const svcRow = (x, i) => `<div class="panel svc" data-i="${i}" data-type="${x.type}" style="margin-top:8px">
      <div class="row">
        <input type="text" class="t grow" value="${esc(x.title)}" placeholder="Service name" aria-label="Service name" style="width:auto;min-width:180px">
        <span class="money"><span>$</span><input type="text" class="p" inputmode="decimal" value="${esc(x.price)}" aria-label="Price"></span>
        <span class="row" style="gap:4px">
          <button class="btn sm" data-mv="-1" title="Move up" aria-label="Move up">▲</button>
          <button class="btn sm" data-mv="1" title="Move down" aria-label="Move down">▼</button>
          ${x.type !== "addon" && x.type !== "grading" ? `<button class="btn sm danger" data-rm title="Remove" aria-label="Remove">✕</button>` : ""}</span></div>
      <label class="f">Description</label><textarea class="d" rows="3">${esc(x.desc)}</textarea>
      <label class="f">Extra note <span style="text-transform:none">(optional, small print under the description)</span></label>
      <input type="text" class="s" value="${esc(x.sub || "")}">
      ${x.type === "clean" ? `<label class="small" style="display:block;margin-top:8px"><input type="radio" name="bulkpick" class="b" ${x.bulk ? "checked" : ""}>
        Bulk pricing below applies to this service</label>` : ""}</div>`;
  const draw = () => {
    body.innerHTML = `${saved ? "" : `<div class="panel" style="border-color:var(--gold);margin-bottom:12px">These are the prices built into the website right now.
        Once you save here, the website and your order quotes both use this list.</div>`}
      ${GROUPS.map(([type, label]) => `<h2>${label}</h2>${P.services.map((x, i) => x.type === type ? svcRow(x, i) : "").join("")}
        ${type === "grading" ? "" : type !== "addon" ? `<button class="btn sm" data-add="${type}" style="margin-top:8px">+ Add a ${type === "clean" ? "cleaning" : "repair"} service</button>`
          : (P.services.some((x) => x.type === "addon") ? "" : `<button class="btn sm" data-add="addon" style="margin-top:8px">+ Add slab cracking</button>`)}`).join("")}
      <h2>Bulk cleaning</h2>
      <div class="panel">${P.bulk.map((b, i) => `<div class="row brow" style="margin-bottom:6px">From
          <input type="text" class="bm" inputmode="numeric" value="${esc(b.min)}" style="width:70px" aria-label="Number of cards"> cards:
          <span class="money"><span>$</span><input type="text" class="bp" inputmode="decimal" value="${esc(b.price)}" aria-label="Price per card"></span> per card
          <button class="btn sm danger" data-brm="${i}" aria-label="Remove">✕</button></div>`).join("") || `<p class="muted small" style="margin:0 0 6px">No bulk pricing.</p>`}
        <button class="btn sm" id="badd">+ Add a bulk level</button></div>
      <h2>Slab cracking with another service</h2>
      <div class="panel row">Added to another service:
        <span class="money"><span>$</span><input type="text" id="slab" inputmode="decimal" value="${esc(P.slabAddon)}" aria-label="Slab cracking add-on price"></span>
        <span class="muted small">(on its own it's the Slab Cracking price above)</span></div>
      <h2>Grading submission prices</h2>
      <div class="panel"><div class="row" style="margin-bottom:6px">On its own, each card after the first:
          <span class="money"><span>$</span><input type="text" id="gnext" inputmode="decimal" value="${esc(P.gradingNext)}" aria-label="Grading on its own, each additional card"></span></div>
        <div class="row">Added to another service, per card:
          <span class="money"><span>$</span><input type="text" id="gadd" inputmode="decimal" value="${esc(P.gradingAddon)}" aria-label="Grading added to another service"></span></div>
        <p class="muted small" style="margin:6px 0 0">The first card on its own is the Grading Submission price above. Customers pick PSA, CGC, BGS or TAG on the order form.</p></div>
      <h2>PSA service levels <span class="muted small" style="text-transform:none">(PSA's own fees, passed through)</span></h2>
      <div class="panel"><p class="muted small" style="margin:0 0 8px">PSA sets these and changes them often. Check psacard.com before saving.
          The order form suggests the cheapest level that covers each card's value.</p>
        ${P.psaLevels.map((l, i) => `<div class="row prow" style="margin-bottom:6px;flex-wrap:wrap">
          <input type="text" class="pn" value="${esc(l.name)}" placeholder="Level name" aria-label="PSA level name" style="width:150px">
          <span class="money"><span>$</span><input type="text" class="pp" inputmode="decimal" value="${esc(l.price)}" aria-label="Price per card"></span> per card,
          cards worth up to <span class="money"><span>$</span><input type="text" class="pm" inputmode="decimal" value="${esc(l.maxValue || "")}" aria-label="Max card value"></span>
          <input type="text" class="pd" value="${esc(l.days || "")}" placeholder="e.g. 70–80 business days" aria-label="Turnaround" style="width:190px">
          <button class="btn sm danger" data-prm="${i}" aria-label="Remove level">✕</button></div>`).join("")}
        <button class="btn sm" id="padd">+ Add a level</button>
        <div class="row" style="margin-top:12px">Due once a card is evaluated:
          <input type="text" id="pdep" inputmode="decimal" value="${esc(P.psaDeposit)}" style="width:70px" aria-label="Percent due once evaluated"> % of PSA's fee
          <span class="muted small">(plus your grading fee; the rest goes on the final invoice)</span></div></div>
      <h2>Card value surcharge <span class="muted small" style="text-transform:none">(repairs only)</span></h2>
      <div class="panel">${P.surcharge.map((t, i) => `<div class="row srow" style="margin-bottom:6px">${i ? `${money(P.surcharge[i - 1].upTo + 1)} up to` : "Up to"}
          <span class="money"><span>$</span><input type="text" class="su" inputmode="decimal" value="${esc(t.upTo)}" aria-label="Up to card value"></span>:
          <input type="text" class="sr" inputmode="decimal" value="${esc(t.rate)}" style="width:70px" aria-label="Percent"> %
          ${P.surcharge.length > 1 ? `<button class="btn sm danger" data-srm="${i}" aria-label="Remove">✕</button>` : ""}</div>`).join("")}
        <p class="muted small" style="margin:6px 0 8px">Over ${money(P.surcharge.at(-1).upTo)}: custom quote. Use 0 % for "no surcharge". Surcharges round up to the nearest dollar.</p>
        <button class="btn sm" id="sadd">+ Add a level</button></div>
      <h2>Referral code discount</h2>
      <div class="panel row"><input type="text" id="ref" inputmode="decimal" value="${esc(P.referral)}" style="width:80px" aria-label="Referral percent"> % off</div>
      <div class="panel" style="margin-top:18px;border-color:var(--line)"><p class="small" style="margin:0">
        ⚠ Your <b>Terms &amp; Conditions</b> and the dated "Pricing update" notice on the site also mention prices. Those don't change from here.
        Ask for an update to them when they need to match.<br><br>
        Renaming a service doesn't change orders already placed: their quotes use the price written in the old name.</p></div>
      <div class="row sticky-save"><button class="btn gold" id="psave">Save prices</button>
        <button class="btn" id="pundo">Undo changes</button><span class="grow"></span>
        <button class="btn sm" id="preset" title="Go back to the prices built into the website">Use the site's built-in prices</button></div>
      ${LIVE_NOTE}`;
    $$("[data-add]", body).forEach((b) => b.onclick = () => { collect(); P.services.push({ title: "", price: 0, type: b.dataset.add, desc: "", sub: "" }); draw(); });
    $$("[data-rm]", body).forEach((b) => b.onclick = () => { collect(); P.services.splice(+b.closest(".svc").dataset.i, 1); draw(); });
    $$("[data-mv]", body).forEach((b) => b.onclick = () => {
      collect();
      const i = +b.closest(".svc").dataset.i, type = P.services[i].type, d = +b.dataset.mv;
      let j = i + d; while (j >= 0 && j < P.services.length && P.services[j].type !== type) j += d;
      if (j < 0 || j >= P.services.length) return;
      [P.services[i], P.services[j]] = [P.services[j], P.services[i]]; draw();
    });
    $("#badd").onclick = () => { collect(); const l = P.bulk.at(-1); P.bulk.push({ min: l ? l.min + 20 : 21, price: l ? Math.max(0, l.price - 2) : 8 }); draw(); };
    $$("[data-brm]", body).forEach((b) => b.onclick = () => { collect(); P.bulk.splice(+b.dataset.brm, 1); draw(); });
    $("#sadd").onclick = () => { collect(); const l = P.surcharge.at(-1); P.surcharge.push({ upTo: l.upTo + 1000, rate: l.rate }); draw(); };
    $("#padd").onclick = () => { collect(); P.psaLevels.push({ name: "", price: 0, maxValue: 0, days: "" }); draw(); };
    $$("[data-prm]", body).forEach((b) => b.onclick = () => { collect(); P.psaLevels.splice(+b.dataset.prm, 1); draw(); });
    $$("[data-srm]", body).forEach((b) => b.onclick = () => { collect(); P.surcharge.splice(+b.dataset.srm, 1); draw(); });
    $("#pundo").onclick = () => { P = withDefaults(clone(SC.prices && SC.prices.services ? SC.prices : DEFAULT_PRICES)); draw(); toast("Changes undone."); };
    $("#preset").onclick = () => { if (confirm("Fill in the prices built into the website? Nothing is saved until you click Save prices.")) { P = clone(DEFAULT_PRICES); draw(); } };
    $("#psave").onclick = async () => {
      collect();
      const err = check(P);
      if (err) return toast(err, 6000);
      const btn = $("#psave"); btn.disabled = true; btn.textContent = "Saving…";
      try { await saveSite("prices", P, "Prices saved. The website and new quotes use them within a few minutes."); draw(); }
      catch (e) { toast(e.message, 6000); btn.disabled = false; btn.textContent = "Save prices"; }
    };
  };
  const collect = () => {
    P.services = $$(".svc", body).map((el) => {
      const o = { title: $(".t", el).value.trim(), price: num($(".p", el).value), type: el.dataset.type,
        desc: $(".d", el).value.trim(), sub: $(".s", el).value.trim() };
      if ($(".b", el)?.checked) o.bulk = true;
      return o;
    });
    P.bulk = $$(".brow", body).map((r) => ({ min: Math.round(num($(".bm", r).value)), price: num($(".bp", r).value) }));
    P.slabAddon = num($("#slab").value);
    P.gradingNext = num($("#gnext").value);
    P.gradingAddon = num($("#gadd").value);
    P.psaLevels = $$(".prow", body).map((r) => ({ name: $(".pn", r).value.trim(), price: num($(".pp", r).value),
      maxValue: num($(".pm", r).value) || 0, days: $(".pd", r).value.trim() }));
    P.psaDeposit = num($("#pdep").value);
    P.surcharge = $$(".srow", body).map((r) => ({ upTo: num($(".su", r).value), rate: num($(".sr", r).value) }));
    P.referral = num($("#ref").value);
  };
  draw();
}
function check(P) {
  const seen = new Set();
  for (const x of P.services) {
    if (!x.title) return "Every service needs a name.";
    const k = x.title.toLowerCase();
    if (seen.has(k)) return `Two services are called "${x.title}".`;
    seen.add(k);
    if (!(x.price >= 0)) return `"${x.title}" needs a price (a number, like 35).`;
  }
  if (!P.services.some((x) => x.type !== "addon" && x.type !== "grading")) return "Add at least one cleaning or repair service.";
  for (const [i, b] of P.bulk.entries()) {
    if (!(b.min >= 2) || !(b.price >= 0)) return "Each bulk level needs a number of cards (2 or more) and a price.";
    if (i && b.min <= P.bulk[i - 1].min) return "Bulk levels must go from fewer cards to more cards.";
  }
  if (P.bulk.length && !P.services.some((x) => x.bulk)) return "Pick which cleaning service the bulk pricing applies to.";
  if (!(P.slabAddon >= 0)) return "The slab cracking add-on needs a price.";
  if (!(P.gradingNext >= 0) || !(P.gradingAddon >= 0)) return "The grading submission prices need numbers (like 5).";
  const seenL = new Set();
  for (const l of P.psaLevels || []) {
    if (!l.name) return "Every PSA level needs a name.";
    if (seenL.has(l.name.toLowerCase())) return `Two PSA levels are called "${l.name}".`;
    seenL.add(l.name.toLowerCase());
    if (!(l.price >= 0)) return `PSA level "${l.name}" needs a price.`;
  }
  if (!(P.psaDeposit >= 0 && P.psaDeposit <= 100)) return "The PSA amount due once evaluated must be a percent from 0 to 100.";
  for (const [i, t] of P.surcharge.entries()) {
    if (!(t.upTo > 0) || !(t.rate >= 0 && t.rate <= 100)) return "Each surcharge level needs a card value and a percent from 0 to 100.";
    if (i && t.upTo <= P.surcharge[i - 1].upTo) return "Surcharge levels must go from lower card values to higher ones.";
  }
  if (!(P.referral >= 0 && P.referral <= 100)) return "The referral discount must be a percent from 0 to 100.";
  return "";
}

// ------------------------------------------------------------ announcement
async function announcement(body) {
  const A = Object.assign({ on: false, text: "", link: "", linkText: "", until: "" }, SC.announcement || {});
  body.innerHTML = `<p class="muted small">A bar across the top of every page, for sales, holiday hours, show weekends and so on.
      Visitors can close it; it comes back for them when you change the text.</p>
    <div class="panel">
      <label class="switch"><input type="checkbox" id="aon" ${A.on ? "checked" : ""}><span class="track"></span><span class="sw-l">Show the bar</span></label>
      <label class="f">Message</label><textarea id="atext" maxlength="200" rows="2" placeholder="e.g. Holiday turnaround: orders received by Dec 10 ship before Christmas.">${esc(A.text)}</textarea>
      <div class="grid2"><div><label class="f">Link <span style="text-transform:none">(optional: a web address, or #submit, #pricing, #news…)</span></label>
          <input type="text" id="alink" value="${esc(A.link)}" placeholder="#submit"></div>
        <div><label class="f">Link text</label><input type="text" id="altext" value="${esc(A.linkText)}" placeholder="Submit now"></div></div>
      <label class="f">Hide automatically after <span style="text-transform:none">(optional)</span></label>
      <input type="date" id="auntil" value="${esc(A.until)}" style="max-width:220px">
      <label class="f">Preview</label><div class="ann-preview" id="aprev"></div>
      <div class="row" style="margin-top:14px"><button class="btn gold" id="asave">Save</button></div>${LIVE_NOTE}</div>`;
  const prev = () => {
    const t = $("#atext").value.trim(), l = $("#altext").value.trim() || "Learn more";
    $("#aprev").innerHTML = t ? `<span>${esc(t)}</span>${$("#alink").value.trim() ? ` <u><b>${esc(l)} →</b></u>` : ""}` : `<span style="opacity:.6">Type a message to see it here.</span>`;
    $("#aprev").style.opacity = $("#aon").checked ? 1 : .45;
  };
  $$("#atext,#alink,#altext,#aon", body).forEach((el) => el.oninput = el.onchange = prev); prev();
  $("#asave").onclick = async () => {
    const v = { on: $("#aon").checked, text: $("#atext").value.trim(), link: $("#alink").value.trim(),
      linkText: $("#altext").value.trim(), until: $("#auntil").value };
    if (v.on && !v.text) return toast("Type a message, or switch the bar off.");
    try { await saveSite("announcement", v, v.on ? "Saved. The bar shows on the site within a minute." : "Saved. The bar is off."); }
    catch (e) { toast(e.message, 6000); }
  };
}

// ------------------------------------------------------------ news
async function news(body, editId) {
  const posts = clone(Array.isArray(SC.news) ? SC.news : []);
  const sorted = [...posts].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.date).localeCompare(String(a.date)));
  const editing = editId === "new" ? { id: uid(), date: today(), title: "", body: "", image: "", imagePath: "", link: "", linkText: "", published: true, pinned: false }
    : posts.find((p) => p.id === editId);
  body.innerHTML = `${editing ? "" : `<div class="row"><p class="muted small grow" style="margin:0">Posts show in a News section under Upcoming shows (newest 3, with "show older posts").
      Pinned posts stay first. Drafts aren't shown.</p><button class="btn gold" id="nnew">+ New post</button></div>`}
    <div id="ned"></div>
    ${editing ? "" : sorted.map((p) => `<div class="panel row" style="margin-top:10px">
        ${p.image ? `<img src="${esc(p.image)}" alt="" style="width:64px;height:48px;object-fit:cover;border-radius:6px">` : ""}
        <div class="grow"><b>${esc(p.title || "(no title)")}</b>
          <div class="muted small">${esc(p.date ? fmtDate(p.date + "T12:00") : "")}${p.pinned ? " · 📌 pinned" : ""}${p.published === false ? " · <b style='color:var(--gold)'>draft</b>" : ""}</div></div>
        <button class="btn sm" data-ed="${esc(p.id)}">Edit</button><button class="btn sm danger" data-del="${esc(p.id)}">Delete</button></div>`).join("")
      || `<div class="empty" style="margin-top:12px">No posts yet. The News section stays hidden on the site until you publish one.</div>`}`;
  if (!editing) {
    $("#nnew").onclick = () => news(body, "new");
    $$("[data-ed]", body).forEach((b) => b.onclick = () => news(body, b.dataset.ed));
    $$("[data-del]", body).forEach((b) => b.onclick = async () => {
      const p = posts.find((x) => x.id === b.dataset.del);
      if (!confirm(`Delete "${p.title || "this post"}"?`)) return;
      try {
        await saveSite("news", posts.filter((x) => x !== p), "Post deleted.");
        if (p.imagePath) api.removeFiles([p.imagePath]).catch(() => {});
        news(body);
      } catch (e) { toast(e.message, 6000); }
    });
    return;
  }
  const P = clone(editing);
  $("#ned").innerHTML = `<div class="panel" style="border-color:var(--gold)">
    <h3 style="margin-top:0">${editId === "new" ? "New post" : "Edit post"}</h3>
    <div class="grid2"><div><label class="f">Title</label><input type="text" id="nt" value="${esc(P.title)}" maxlength="120"></div>
      <div><label class="f">Date</label><input type="date" id="nd" value="${esc(P.date)}"></div></div>
    <label class="f">Text</label><textarea id="nb" rows="6" maxlength="3000">${esc(P.body)}</textarea>
    <label class="f">Picture <span style="text-transform:none">(optional)</span></label>
    <div class="row" id="nimgrow"></div>
    <div class="grid2"><div><label class="f">Link <span style="text-transform:none">(optional)</span></label><input type="text" id="nl" value="${esc(P.link)}" placeholder="https://…"></div>
      <div><label class="f">Link text</label><input type="text" id="nlt" value="${esc(P.linkText)}" placeholder="Read more"></div></div>
    <div class="row" style="margin-top:10px;gap:18px"><label class="small"><input type="checkbox" id="np" ${P.published !== false ? "checked" : ""}> Published (uncheck to keep as a draft)</label>
      <label class="small"><input type="checkbox" id="npin" ${P.pinned ? "checked" : ""}> 📌 Pin to the top</label></div>
    <div class="row" style="margin-top:14px"><button class="btn gold" id="nsave">Save post</button><button class="btn" id="ncancel">Cancel</button></div></div>`;
  const imgRow = () => {
    $("#nimgrow").innerHTML = P.image
      ? `<img src="${esc(P.image)}" alt="" style="max-width:220px;max-height:140px;border-radius:8px"><button class="btn sm danger" id="nimgrm">Remove picture</button>`
      : `<label class="btn sm">📷 Add a picture<input type="file" id="nimg" accept="image/*" hidden></label><span class="muted small" id="nimgst"></span>`;
    $("#nimgrm") && ($("#nimgrm").onclick = () => { P.image = ""; P.imagePath = ""; imgRow(); });
    $("#nimg") && ($("#nimg").onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      $("#nimgst").textContent = "Uploading…";
      try {
        const { blob, ext } = await prepareImage(f, 1600);
        const path = `site/news/${uid()}.${ext}`;
        const out = await api.putFile(path, blob);
        P.image = DEMO ? out : mediaUrl(path); P.imagePath = DEMO ? "" : path; imgRow();
      } catch (err) { $("#nimgst").textContent = ""; toast("Picture not uploaded: " + err.message, 6000); }
    });
  };
  imgRow();
  $("#ncancel").onclick = () => news(body);
  $("#nsave").onclick = async () => {
    Object.assign(P, { title: $("#nt").value.trim(), date: $("#nd").value || today(), body: $("#nb").value.trim(),
      link: $("#nl").value.trim(), linkText: $("#nlt").value.trim(), published: $("#np").checked, pinned: $("#npin").checked });
    if (!P.title && !P.body) return toast("Give the post a title or some text.");
    const next = posts.some((p) => p.id === P.id) ? posts.map((p) => p.id === P.id ? P : p) : [...posts, P];
    try {
      await saveSite("news", next, P.published ? "Post saved. It's on the site within a minute." : "Draft saved (not on the site).");
      const old = posts.find((p) => p.id === P.id);
      if (old?.imagePath && old.imagePath !== P.imagePath) api.removeFiles([old.imagePath]).catch(() => {});
      news(body);
    } catch (e) { toast(e.message, 6000); }
  };
}

// ------------------------------------------------------------ events (shows)
async function events(body, editIdx) {
  const shows = clone(Array.isArray(SC.shows) ? SC.shows : []);
  const t = today();
  const isPast = (s) => (s.endDate || s.date) < t;
  const order = shows.map((s, i) => ({ s, i })).sort((a, b) => String(a.s.date).localeCompare(String(b.s.date)));
  const editing = editIdx === "new" ? { date: "", endDate: "", name: "", location: "", time: "", link: "" } : shows[editIdx];
  const when = (s) => [fmtDate(s.date + "T12:00"), s.endDate && s.endDate !== s.date ? fmtDate(s.endDate + "T12:00") : ""].filter(Boolean).join(" – ");
  body.innerHTML = `${editing ? "" : `<div class="row"><p class="muted small grow" style="margin:0">Shows and events appear under "Upcoming shows". Each one hides itself the day after it ends.</p>
      <button class="btn gold" id="enew">+ Add an event</button></div>`}
    <div id="eed"></div>
    ${editing ? "" : order.map(({ s, i }) => `<div class="panel row" style="margin-top:10px;${isPast(s) ? "opacity:.55" : ""}">
        <div class="grow"><b>${esc(s.name)}</b><div class="muted small">${esc(when(s))}${s.location ? " · " + esc(s.location) : ""}${isPast(s) ? " · past, hidden on the site" : ""}</div></div>
        <button class="btn sm" data-ed="${i}">Edit</button><button class="btn sm danger" data-del="${i}">Delete</button></div>`).join("")
      || `<div class="empty" style="margin-top:12px">No events. The site says "No upcoming shows scheduled right now".</div>`}`;
  if (!editing) {
    $("#enew").onclick = () => events(body, "new");
    $$("[data-ed]", body).forEach((b) => b.onclick = () => events(body, +b.dataset.ed));
    $$("[data-del]", body).forEach((b) => b.onclick = async () => {
      const s = shows[+b.dataset.del];
      if (!confirm(`Delete "${s.name}"?`)) return;
      try { await saveSite("shows", shows.filter((x) => x !== s), "Event deleted."); events(body); } catch (e) { toast(e.message, 6000); }
    });
    return;
  }
  $("#eed").innerHTML = `<div class="panel" style="border-color:var(--gold)"><h3 style="margin-top:0">${editIdx === "new" ? "New event" : "Edit event"}</h3>
    <label class="f">Name</label><input type="text" id="en" value="${esc(editing.name)}" placeholder="e.g. Collect-A-Con Houston">
    <div class="grid2"><div><label class="f">Date</label><input type="date" id="ed" value="${esc(editing.date)}"></div>
      <div><label class="f">Last day <span style="text-transform:none">(if more than one day)</span></label><input type="date" id="ee" value="${esc(editing.endDate || "")}"></div></div>
    <label class="f">Where</label><input type="text" id="el" value="${esc(editing.location)}" placeholder="Venue, address">
    <label class="f">Times <span style="text-transform:none">(optional)</span></label><input type="text" id="et" value="${esc(editing.time)}" placeholder="Sat 9 AM – 5 PM · Sun 10 AM – 4 PM">
    <label class="f">Link <span style="text-transform:none">(optional: tickets, map or event page)</span></label><input type="text" id="elk" value="${esc(editing.link)}" placeholder="https://…">
    <div class="row" style="margin-top:14px"><button class="btn gold" id="esave">Save event</button><button class="btn" id="ecancel">Cancel</button></div></div>`;
  $("#ecancel").onclick = () => events(body);
  $("#esave").onclick = async () => {
    const v = { date: $("#ed").value, endDate: $("#ee").value, name: $("#en").value.trim(), location: $("#el").value.trim(),
      time: $("#et").value.trim(), link: $("#elk").value.trim() };
    if (!v.name || !v.date) return toast("An event needs a name and a date.");
    if (v.endDate && v.endDate < v.date) return toast("The last day can't be before the first day.");
    if (!v.endDate || v.endDate === v.date) delete v.endDate;
    const next = editIdx === "new" ? [...shows, v] : shows.map((s, i) => i === editIdx ? v : s);
    try { await saveSite("shows", next, "Event saved. It's on the site within a minute."); events(body); } catch (e) { toast(e.message, 6000); }
  };
}

// ------------------------------------------------------------ instagram
export const igPostUrl = (u) => {
  const m = String(u || "").match(/instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(p|reel|tv)\/([A-Za-z0-9_-]+)/);
  return m ? `https://www.instagram.com/${m[1]}/${m[2]}/` : null;
};
async function instagram(body) {
  const I = Object.assign({ on: false, handle: IG_DEFAULT, heading: "", sub: "", posts: [] }, SC.instagram || {});
  body.innerHTML = `<p class="muted small">Feature up to 6 of your posts on the site, with a Follow button. On Instagram, open a post,
      tap <b>⋯</b> (or the paper-plane share icon) → <b>Copy link</b>, and paste it here. Posts must be public.</p>
    <div class="panel">
      <label class="switch"><input type="checkbox" id="ion" ${I.on ? "checked" : ""}><span class="track"></span><span class="sw-l">Show the Instagram section</span></label>
      <div class="grid2"><div><label class="f">Your Instagram username</label><input type="text" id="ih" value="${esc(I.handle)}" autocapitalize="none" spellcheck="false"></div>
        <div><label class="f">Heading <span style="text-transform:none">(optional)</span></label><input type="text" id="ihd" value="${esc(I.heading)}" placeholder="On Instagram"></div></div>
      <label class="f">Line under the heading <span style="text-transform:none">(optional)</span></label>
      <input type="text" id="isub" value="${esc(I.sub)}" placeholder="Before-and-afters, works in progress and show updates.">
      <label class="f">Post links, one per line</label>
      <textarea id="ip" rows="6" placeholder="https://www.instagram.com/p/…">${esc((I.posts || []).join("\n"))}</textarea>
      <div id="ichk" class="small" style="margin-top:6px"></div>
      <div class="row" style="margin-top:14px"><button class="btn gold" id="isave">Save</button></div>${LIVE_NOTE}</div>`;
  const lines = () => $("#ip").value.split(/\s*\n\s*/).map((s) => s.trim()).filter(Boolean);
  const chk = () => {
    const ls = lines();
    $("#ichk").innerHTML = ls.map((l, i) => {
      const u = igPostUrl(l);
      return `<div>${u ? (i < 6 ? "✅" : "⏸ only the first 6 show:") : "❌ not an Instagram post link:"} ${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>` : esc(l)}</div>`;
    }).join("") || `<span class="muted">No posts yet: the section will show just the Follow button.</span>`;
  };
  $("#ip").oninput = chk; chk();
  $("#isave").onclick = async () => {
    const posts = [...new Set(lines().map(igPostUrl).filter(Boolean))].slice(0, 6);
    const bad = lines().filter((l) => !igPostUrl(l)).length;
    const v = { on: $("#ion").checked, handle: $("#ih").value.trim().replace(/^@/, "") || IG_DEFAULT,
      heading: $("#ihd").value.trim(), sub: $("#isub").value.trim(), posts };
    try {
      await saveSite("instagram", v, bad ? `Saved (${bad} link${bad > 1 ? "s" : ""} skipped: not Instagram post links).` : (v.on ? "Saved. The Instagram section is on the site within a minute." : "Saved. The Instagram section is off."));
      $("#ip").value = posts.join("\n"); chk();
    } catch (e) { toast(e.message, 6000); }
  };
}

// ------------------------------------------------------------ quote panel (submission page)
export const quotePanel = () => `<div class="panel" id="quote" style="margin-top:14px"><div class="row">
    <h3 class="grow" style="margin:0">Quote</h3><button class="btn sm" id="qcopy" hidden>Copy for a text/email</button></div>
  <div id="qbody" class="muted small" style="margin-top:8px">Working out the quote…</div></div>`;

// Cards from the website carry "Service: …" and "NM value: $…" lines in their intake notes.
function quoteCards(s, cards) {
  return cards.map((k) => {
    const n = k.customer_notes || "";
    return { num: k.card_number, card: k.name || `Card #${k.card_number}`,
      service: k.service || (n.match(/^Service:\s*(.+)$/mi) || [])[1] || s.service || "",
      value: (n.match(/^(?:NM|Estimated|Card)?\s*value:\s*(.+)$/mi) || [])[1] || "",
      status: "" };
  });
}

export async function wireQuote(s, cards) {
  const box = $("#qbody");
  if (!box) return;
  const ref = ((s.internal_notes || "").match(/Referral code:\s*(\S+)/i) || [])[1] || "";
  const base = { code: s.code, cards: quoteCards(s, cards), referralCode: ref, savedDiscount: s.quote_discount || "" };
  let q = null, onSheet = false;
  const render = () => {
    const row = (l, r, cls = "") => `<div class="qline ${cls}"><span>${l}</span><span>${r}</span></div>`;
    box.className = "";
    box.innerHTML = q.cards.map((l) => `<div class="qline"><span><b>#${esc(l.num)} ${esc(l.card || "")}</b>
          <span class="muted small" style="display:block">${esc(l.breakdown)}</span></span>
        <span>${l.price === null ? `<b style="color:var(--gold)">Custom</b>` : esc(money(l.price))}</span></div>`).join("") +
      row("Subtotal", esc(money(q.subtotal)), "sub") +
      (q.referralAmt ? row(`Referral code${ref ? " " + esc(ref) : ""}`, "−" + esc(money(q.referralAmt)), "minus") : "") +
      (q.discountAmt ? row(`Your discount (${esc(/%$/.test(q.discount) ? q.discount : money(num(q.discount)))})`, "−" + esc(money(q.discountAmt)), "minus") : "") +
      row(q.complete ? "Total to charge" : "Total so far <span class='muted small'>(plus custom-quote cards)</span>", esc(money(q.total)), "total") +
      (q.notes?.length ? `<ul class="qnotes">${q.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : "") +
      `<form class="row" id="qdisc" style="margin-top:12px"><label class="small" for="qd">Your discount</label>
        <input type="text" id="qd" value="${esc(q.discount || "")}" placeholder="10% or 15" style="width:120px">
        <button class="btn gold sm" type="submit">Apply</button>
        ${q.discount ? `<button class="btn sm" type="button" id="qdrm">Remove</button>` : ""}</form>
      <p class="muted small" style="margin:10px 0 0">${onSheet
        ? "Same quote as the Sheet's Quote Total. For a card over the custom-quote value, type its price in the Sheet's Price Override column."
        : "This order isn't on the Sheet (made in the portal), so it's priced from each card's Service (set on the card's page) and its card value, or the submission's Service."}
        Customers never see quotes.</p>`;
    $("#qcopy").hidden = false;
    $("#qdisc").onsubmit = (e) => { e.preventDefault(); apply($("#qd").value.trim()); };
    $("#qdrm") && ($("#qdrm").onclick = () => apply(""));
  };
  const apply = async (d) => {
    try {
      const out = await gas("portalQuote", { ...base, discount: d, savedDiscount: d });
      q = out.quote; onSheet = out.onSheet;
      if ((s.quote_discount || "") !== (q.discount || "")) Object.assign(s, await api.update("submissions", s.id, { quote_discount: q.discount || "" }));
      render(); toast(d ? "Discount applied." : "Discount removed.");
    } catch (e) { toast(e.message, 6000); }
  };
  $("#qcopy").onclick = async () => {
    const lines = [`Quote for ${s.code}`, ...q.cards.map((l) => `#${l.num} ${l.card}: ${l.price === null ? "custom quote" : money(l.price)}`),
      `Subtotal: ${money(q.subtotal)}`, q.referralAmt ? `Referral discount: -${money(q.referralAmt)}` : "",
      q.discountAmt ? `Discount: -${money(q.discountAmt)}` : "", `Total: ${money(q.total)}${q.complete ? "" : " (plus custom-quote cards)"}`].filter(Boolean);
    try { await navigator.clipboard.writeText(lines.join("\n")); toast("Quote copied."); } catch { toast("Couldn't copy on this device."); }
  };
  try {
    const out = await gas("portalQuote", base);
    q = out.quote; onSheet = out.onSheet;
    // The Sheet's "Your Discount" is the source for Sheet orders; keep the portal's copy in step.
    if (onSheet && (s.quote_discount || "") !== (q.discount || "")) api.update("submissions", s.id, { quote_discount: q.discount || "" }).then((r) => Object.assign(s, r)).catch(() => {});
    if ($("#qbody") === box) render();
  } catch (e) { box.className = ""; box.innerHTML = `<span class="muted small">⚠ ${esc(e.message)}</span>`; }
}

// ------------------------------------------------------------ demo (?demo)
function demoGas(type, body) {
  if (type === "portalPsa") { window._rrDemoPsa = (window._rrDemoPsa || []).concat([body]); return { success: true, onSheet: false, emailed: !!body.email }; }
  if (type === "portalCardServices") { window._rrDemoSheetWrites = (window._rrDemoSheetWrites || []).concat([body]); return { success: true, onSheet: false, updated: 0 }; }
  if (type === "portalReviews") {
    window._rrDemoReviews ||= [
      { row: 2, at: "2026-10-30T15:00:00Z", name: "Sam", rating: 5, card: "Charizard, Base Set", text: "Crease is basically gone. Amazing work!", approved: true },
      { row: 3, at: "2026-11-02T18:30:00Z", name: "Pat", rating: 4, card: "", text: "Quick turnaround and great communication.", approved: false }];
    if (body.op === "set") { window._rrDemoReviews.find((r) => r.row === body.row).approved = body.approved; return { success: true }; }
    return { success: true, reviews: clone(window._rrDemoReviews) };
  }
  const d = body.discount !== undefined ? body.discount : body.savedDiscount || "";
  const lines = body.cards.map((c) => ({ num: c.num, card: c.card, price: 35, breakdown: `${c.service || "Base Repair"} → $35 (demo)` }));
  const subtotal = lines.length * 35;
  const dAmt = /%$/.test(d) ? Math.round(subtotal * parseFloat(d)) / 100 : (parseFloat(d) || 0);
  return { success: true, onSheet: false, quote: { cards: lines, subtotal, referralAmt: 0, discount: d, discountAmt: dAmt,
    total: subtotal - dAmt, complete: true, notes: ["Demo mode: sample prices."] } };
}
