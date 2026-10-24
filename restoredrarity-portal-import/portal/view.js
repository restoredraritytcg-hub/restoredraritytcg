// Customer view: everything under one profile, opened by a private link.
import { api, DEMO, esc, $, $$, pill, progressSteps, renderReport, wireReport, thumbOf, mediaUrl,
  fmtDate, installLightbox, toast } from "./common.js";

const CFG = window.RR_CONFIG || {};
const app = $("#app");
let data = null;

const params = () => new URLSearchParams(location.hash.slice(1));
const token = () => params().get("t") || "";

if (DEMO && window.RR_CONFIG) {
  $("#demo").innerHTML = '<div class="demo-banner">Demo preview — sample data, nothing is saved.</div>';
}
$("#contact").href = `mailto:${CFG.contactEmail || ""}`;
installLightbox();

async function load() {
  if (DEMO) await import("./demo/demo-data.js").catch(() => {});
  if (!token()) return fail("This link is missing its code. Please use the full link we sent you.");
  try {
    data = await api.portalGet(token());
  } catch (e) {
    return fail("We couldn't load your cards right now. Please try again in a minute.");
  }
  if (!data) return fail("This link isn't valid anymore. Please contact us for a new one.");
  route();
}

function fail(msg) {
  app.innerHTML = `<div class="empty" style="margin-top:40px">${esc(msg)}<br><br>
    <a href="mailto:${esc(CFG.contactEmail || "")}">${esc(CFG.contactEmail || "")}</a></div>`;
}

const allCards = () => data.submissions.flatMap((s) => s.cards.map((c) => ({ ...c, sub: s })));

function route() {
  const cardId = params().get("c");
  const card = cardId && allCards().find((c) => c.id === cardId);
  card ? cardPage(card) : home();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", () => data && route());
const go = (extra = "") => { location.hash = `t=${encodeURIComponent(token())}${extra}`; };

function tile(c) {
  const t = thumbOf(c.scans || []);
  return `<a class="tile" data-card="${esc(c.id)}">
    ${t ? `<img class="ph" src="${esc(mediaUrl(t))}" alt="" loading="lazy">` : `<div class="ph">Photos coming soon</div>`}
    <div class="n">${esc(c.name || `Card #${c.card_number}`)}</div>
    <div class="s">${esc(c.details || "")}</div>${pill(c.status)}</a>`;
}

function photosBlock(photos, cardId) {
  const list = photos.length
    ? `<div class="photos">${photos.map((p) => `<figure>
        <img class="zoom" src="${esc(mediaUrl(p.path))}" alt="" loading="lazy">
        ${p.source === "customer" ? `<button class="x" data-del="${esc(p.id)}" title="Remove">✕</button>` : ""}
        <figcaption>${esc(p.caption || (p.source === "admin" ? "From Restored Rarity" : "Your photo"))}</figcaption></figure>`).join("")}</div>`
    : `<p class="muted small">No photos yet.</p>`;
  const cards = allCards();
  const pick = cardId ? "" : `<select id="upcard" style="max-width:260px">
      <option value="">Not for a specific card</option>
      ${cards.map((c) => `<option value="${esc(c.id)}">${esc(c.sub.code)} · #${c.card_number} ${esc(c.name)}</option>`).join("")}
    </select>`;
  return `${list}<div class="drop"><div class="row">
    <input type="file" id="upfile" accept="image/*" multiple style="max-width:260px">
    ${pick}<input type="text" id="upcap" placeholder="Caption (optional)" class="grow" style="min-width:160px;width:auto">
    <button class="btn gold" id="upbtn" data-card="${esc(cardId || "")}">Upload photos</button></div>
    <p class="muted small" style="margin:8px 0 0">Add any photos that help — damage close-ups, how it looked before, etc.</p></div>`;
}

function wirePhotos(root) {
  const btn = $("#upbtn", root);
  btn?.addEventListener("click", async () => {
    const files = [...($("#upfile", root).files || [])];
    if (!files.length) return toast("Choose one or more photos first.");
    const cardId = btn.dataset.card || $("#upcard", root)?.value || null;
    btn.disabled = true;
    try {
      for (const [i, f] of files.entries()) {
        btn.textContent = `Uploading ${i + 1}/${files.length}…`;
        await api.customerUpload(token(), data.customer.storage_key, f, $("#upcap", root).value, cardId);
      }
      toast("Thanks! Your photos were added.");
      data = await api.portalGet(token());
      route();
    } catch (e) {
      toast("Upload failed: " + e.message, 5000);
      btn.disabled = false; btn.textContent = "Upload photos";
    }
  });
  $$("[data-del]", root).forEach((b) => b.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm("Remove this photo?")) return;
    await api.customerDeletePhoto(token(), b.dataset.del);
    data = await api.portalGet(token()); route();
  }));
}

function home() {
  const subs = data.submissions;
  const first = (data.customer.name || "").split(" ")[0];
  const nCards = allCards().length;
  let h = `<h1>Hi${first ? " " + esc(first) : ""} 👋</h1>
    <p class="muted">Here's everything you've sent to ${esc(CFG.businessName || "Restored Rarity")} —
    ${subs.length} submission${subs.length === 1 ? "" : "s"}, ${nCards} card${nCards === 1 ? "" : "s"}.
    Tap a card to see its scans, close-ups and before/after.</p>`;
  for (const s of subs) {
    h += `<section class="panel" style="margin-top:18px">
      <div class="row"><div class="grow"><h2 style="margin:0">${esc(s.code)}</h2>
        <div class="meta"><span>Sent <b>${esc(fmtDate(s.created_at))}</b></span>
        ${s.service ? `<span>Service <b>${esc(s.service)}</b></span>` : ""}
        <span><b>${s.cards.length}</b> card${s.cards.length === 1 ? "" : "s"}</span></div></div>
        <div>${pill(s.status)}</div></div>
      ${progressSteps(s.status)}
      ${s.public_notes ? `<p style="margin:12px 0 0">${esc(s.public_notes)}</p>` : ""}
      <div class="tiles" style="margin-top:14px">${s.cards.map(tile).join("") || '<p class="muted">No cards listed.</p>'}</div>
    </section>`;
  }
  if (!subs.length) h += `<div class="empty" style="margin-top:20px">No submissions yet.</div>`;
  h += `<h2>Your photos</h2>${photosBlock(data.photos, null)}`;
  h += footer();
  app.innerHTML = h;
  $$("[data-card]", app).forEach((t) => t.tagName === "A" && t.addEventListener("click", () => go(`&c=${t.dataset.card}`)));
  wirePhotos(app);
}

function cardPage(c) {
  const photos = data.photos.filter((p) => p.card_id === c.id);
  let h = `<p><a href="#" id="back">← All my cards</a></p>
    <div class="row"><div class="grow"><h1>${esc(c.name || `Card #${c.card_number}`)}</h1>
    <div class="meta">${c.details ? `<span><b>${esc(c.details)}</b></span>` : ""}
      <span>Submission <b>${esc(c.sub.code)}</b></span><span>Card <b>#${c.card_number}</b></span></div></div>
      <div>${pill(c.status)}</div></div>
    ${c.public_notes ? `<div class="panel" style="margin-top:12px;border-left:3px solid var(--gold)">${esc(c.public_notes)}</div>` : ""}
    <h2>Scans</h2>${renderReport(c.scans)}
    <h2>Photos</h2>${photosBlock(photos, c.id)}${footer()}`;
  app.innerHTML = h;
  wireReport(app, { scans: c.scans, editable: false, title: c.name }); wirePhotos(app);
  $("#back").addEventListener("click", (e) => { e.preventDefault(); go(); });
}

const footer = () => `<div class="footer">This page is private to you — anyone with this link can view it, so only share it
  with people you trust.<br>Questions? <a href="mailto:${esc(CFG.contactEmail || "")}">${esc(CFG.contactEmail || "")}</a>
  ${CFG.instagram ? ` · <a href="${esc(CFG.instagram)}">Instagram</a>` : ""}</div>`;

load();
