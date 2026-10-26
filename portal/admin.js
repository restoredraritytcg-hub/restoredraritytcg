// Admin portal: every customer, submission, card, scan and photo.
import { api, DEMO, esc, $, $$, pill, STATUSES, renderReport, wireReport, thumbOf, mediaUrl, fmtDate,
  fmtDateTime, installLightbox, installHint, toast, customerLink, progressSteps } from "./common.js";

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
  const [page, id] = location.hash.replace(/^#\/?/, "").split("/");
  $$("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === (page || "")));
  const pages = { "": dashboard, cards: allCards, customers, customer, submission, card, new: newSubmission };
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
function cardTile(c) {
  const s = byId("submissions", c.submission_id) || {}, cu = customerOf(s) || {};
  const t = thumbOf(cardScans(c.id));
  return `<a class="tile" href="#/card/${c.id}">
    ${t ? `<img class="ph" src="${esc(mediaUrl(t))}" alt="" loading="lazy">` : `<div class="ph">Not scanned</div>`}
    <div class="n">${esc(cardTitle(c))}</div>
    <div class="s">${esc(s.code)} · #${c.card_number} · ${esc(cu.name || "")}</div>${pill(c.status)}</a>`;
}

function allCards() {
  app.innerHTML = `<div class="row"><h1 class="grow">All cards</h1>
    <select id="st" style="max-width:240px"><option value="">Any status</option>${STATUSES.map(([k, l]) =>
      `<option value="${k}">${esc(l)}</option>`).join("")}</select>
    <select id="sc" style="max-width:200px"><option value="">Scanned or not</option>
      <option value="no">Not scanned yet</option><option value="before">Has before scan</option>
      <option value="after">Has after scan</option></select></div>
    <input type="search" id="q" placeholder="Search card, set, customer, code…" style="margin:12px 0">
    <p class="muted small" id="cnt"></p><div class="tiles" id="g"></div>`;
  const draw = () => {
    const words = $("#q").value.toLowerCase().split(/\s+/).filter(Boolean), st = $("#st").value, sc = $("#sc").value;
    const list = S.cards.filter((c) => {
      const s = byId("submissions", c.submission_id) || {}, cu = customerOf(s) || {};
      const scans = cardScans(c.id);
      if (st && c.status !== st) return false;
      if (sc === "no" && scans.length) return false;
      if ((sc === "before" || sc === "after") && !scans.some((x) => x.stage === sc)) return false;
      const hay = [c.name, c.details, s.code, cu.name, cu.email, c.public_notes, c.internal_notes].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    }).sort((a, b) => b.created_at.localeCompare(a.created_at));
    $("#cnt").textContent = `${list.length} of ${S.cards.length} cards`;
    $("#g").innerHTML = list.map(cardTile).join("") || `<div class="empty">No cards match.</div>`;
  };
  ["#q", "#st", "#sc"].forEach((s) => $(s).oninput = draw);
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
    ${progressSteps(s.status)}${emailBar(s)}
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
    <h2>Cards</h2>
    <div class="panel" style="padding:0;overflow:auto"><table class="list"><thead><tr><th></th><th>#</th><th>Card</th>
      <th class="hide-sm">Set / number</th><th>Status</th><th class="hide-sm">Scans</th></tr></thead><tbody>
    ${cards.map((k) => { const t = thumbOf(cardScans(k.id)); const st = [...new Set(cardScans(k.id).map((x) => x.stage))];
      return `<tr class="click" data-go="#/card/${k.id}"><td style="width:54px">${t ? `<img src="${esc(mediaUrl(t))}" style="height:52px;border-radius:4px">` : ""}</td>
      <td>${k.card_number}</td><td><b>${esc(k.name || "—")}</b></td><td class="hide-sm">${esc(k.details)}</td>
      <td>${pill(k.status)}</td><td class="hide-sm muted small">${esc(st.join(", ") || "none")}</td></tr>`; }).join("")
      || `<tr><td colspan="6" class="muted">No cards.</td></tr>`}</tbody></table></div>
    <div class="panel" style="margin-top:12px"><h3 style="margin-top:0">Add a card</h3><div class="row">
      <input type="text" id="kn" placeholder="Card name" class="grow" style="width:auto">
      <input type="text" id="kd" placeholder="Set / number / year" class="grow" style="width:auto">
      <button class="btn gold" id="kadd">Add card #${(cards.at(-1)?.card_number || 0) + 1}</button></div>
      <p class="muted small" style="margin:8px 0 0">In the scanner app, use submission <b>${esc(s.code)}</b> and the card number to attach scans.</p></div>
    <h2>Photos</h2>${photosAdmin(S.photos.filter((p) => p.submission_id === id), { cards })}`;
  $$("[data-go]").forEach((r) => r.onclick = () => go(r.dataset.go));
  window.RRCardSearch?.attach($("#kn"), { details: $("#kd") });
  wireEmailBar(s);
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
      ${k.details ? `<span><b>${esc(k.details)}</b></span>` : ""}</div>
    <div class="panel" style="margin-top:14px"><div class="grid2">
      <div><label class="f">Card name</label><input type="text" id="kn" value="${esc(k.name)}"></div>
      <div><label class="f">Set / number / year</label><input type="text" id="kd" value="${esc(k.details)}"></div>
      <div><label class="f">Status</label>${statusSelect("ks", k.status)}</div><div></div>
      <div><label class="f">Note to customer (they see this)</label><textarea id="kp">${esc(k.public_notes)}</textarea></div>
      <div><label class="f">Private notes (only you)</label><textarea id="ki">${esc(k.internal_notes)}</textarea></div>
    </div>
    ${k.customer_notes ? `<label class="f">Customer's notes from intake</label><div class="muted">${esc(k.customer_notes)}</div>` : ""}
    <div class="row" style="margin-top:12px"><button class="btn gold" id="ksave">Save</button>
      <a class="btn" target="_blank" href="${esc(customerLink(c.share_token))}&c=${k.id}">View as customer</a>
      <span class="grow"></span><button class="btn danger" id="kdel">Delete card</button></div></div>
    <h2>Scans</h2>${renderReport(cardScans(id))}
    <p class="muted small">Scans arrive from the scanner app using submission <b>${esc(s.code)}</b>, card <b>#${k.card_number}</b>.</p>
    <h2>Photos</h2>${photosAdmin(S.photos.filter((p) => p.card_id === id), { cards: [k], fixedCard: id })}`;
  wireReport(app, {
    scans: cardScans(id), editable: true, title: cardTitle(k),
    onSaveCentering: async (scan, cen) => {
      const files = { ...scan.files, centering: cen };
      if (!files.centering_auto && scan.files.centering?.auto !== false) files.centering_auto = scan.files.centering;
      Object.assign(scan, await api.update("scans", scan.id, { files }));
    },
    onClose: () => route(),
  });
  wirePhotosAdmin({ customer: c, cards: [k], fixedCard: id });
  window.RRCardSearch?.attach($("#kn"), { details: $("#kd") });
  $("#ksave").onclick = async () => {
    try {
      Object.assign(k, await api.update("cards", id, { name: $("#kn").value.trim(), details: $("#kd").value.trim(),
        status: $("#ks").value, public_notes: $("#kp").value, internal_notes: $("#ki").value }));
      toast("Saved."); route();
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
function newSubmission(customerId) {
  const opts = [...S.customers].sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .map((c) => `<option value="${c.id}" ${c.id === customerId ? "selected" : ""}>${esc(c.name)}${c.email ? " — " + esc(c.email) : ""}</option>`).join("");
  app.innerHTML = `<h1>New submission</h1>
    <div class="panel"><label class="f">Customer</label>
      <select id="nc"><option value="">➕ New customer…</option>${opts}</select>
      <div id="newc" class="grid2" style="margin-top:6px">
        <div><label class="f">Name</label><input type="text" id="nn"></div>
        <div><label class="f">Email</label><input type="email" id="ne"></div>
        <div><label class="f">Phone</label><input type="tel" id="np"></div></div>
      <div class="grid2"><div><label class="f">Service</label><input type="text" id="nsv" placeholder="e.g. Clean + press"></div>
        <div><label class="f">Status</label>${statusSelect("nst", "received")}</div></div>
      <h3>Cards</h3><div id="ncards"></div>
      <button class="btn sm" id="nadd">+ Add another card</button>
      <div class="row" style="margin-top:16px"><button class="btn gold" id="ncreate">Create submission</button></div></div>`;
  const addRow = () => {
    $("#ncards").insertAdjacentHTML("beforeend", `<div class="row" style="margin-bottom:8px">
    <span class="muted" style="width:26px">#${$$("#ncards .row").length + 1}</span>
    <input type="text" class="kn grow" placeholder="Card name" style="width:auto">
    <input type="text" class="kd grow" placeholder="Set / number / year" style="width:auto"></div>`);
    const r = $$("#ncards .row").at(-1);
    window.RRCardSearch?.attach($(".kn", r), { details: $(".kd", r) });
  };
  addRow();
  $("#nadd").onclick = addRow;
  const sync = () => { $("#newc").style.display = $("#nc").value ? "none" : ""; };
  $("#nc").onchange = sync; sync();
  $("#ncreate").onclick = async () => {
    const rows = $$("#ncards .row").map((r) => ({ name: $(".kn", r).value.trim(), details: $(".kd", r).value.trim() }))
      .filter((r) => r.name || r.details);
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
      const sub = await api.insert("submissions", { customer_id: cust.id, status, service: $("#nsv").value.trim() });
      S.submissions.push(sub);
      for (const [i, r] of rows.entries()) {
        S.cards.push(await api.insert("cards", { submission_id: sub.id, card_number: i + 1, ...r, status }));
      }
      toast(`Created ${sub.code}.`);
      go(`#/submission/${sub.id}`);
    } catch (e) { toast(e.message, 6000); $("#ncreate").disabled = false; }
  };
}

function notFound() { app.innerHTML = `<div class="empty">Not found. <a href="#/">Back to submissions</a></div>`; }

start().catch((e) => { app.innerHTML = `<div class="empty">Couldn't load the portal: ${esc(e.message)}</div>`; });
