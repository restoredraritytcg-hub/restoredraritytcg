// PSA submissions: the admin PSA panel on each submission + the tracker on the customer's link.
//
// The record lives in Supabase: submissions.grading_track (step, history, PSA order #, tracking #s, payments) and
// cards.grade_level / grade_result / cert_no. Saving also posts {type:"portalPsa"} to the Apps Script, which copies it
// to the Sheet (so the website's Track Your Submission shows it) and emails the customer when "Email" is ticked.
// Payment rule (Nov 13, 2026): grading fee + 75% of PSA's fee once the card is evaluated; the other 25%, return
// shipping and any PSA upcharge on the final invoice. The % comes from the price list (psaDeposit).
import { api, esc, $, $$, toast, fmtDate } from "./common.js";

export const PSA_STEPS = [
  ["cleared", "Cleared for PSA"], ["shipped", "Shipped to PSA"], ["arrived", "Arrived at PSA"], ["grading", "Being graded"],
  ["assembly", "Slabbing & quality check"], ["graded", "Grades are in"], ["returning", "On the way back"], ["back", "Back at Restored Rarity"]];
const stepLabel = (k) => (PSA_STEPS.find((s) => s[0] === k) || [])[1] || "";
const stepIndex = (k) => PSA_STEPS.findIndex((s) => s[0] === k);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const money = (n) => "$" + r2(n).toLocaleString("en-US", { minimumFractionDigits: r2(n) % 1 ? 2 : 0, maximumFractionDigits: 2 });
const num = (v) => { const n = parseFloat(String(v ?? "").replace(/[$,\s]/g, "")); return isFinite(n) && n >= 0 ? n : 0; };

/** The PSA level written in a card's service text: "… — grading: PSA (Value)". */
export const levelFromService = (t) => ((String(t || "").match(/grading:\s*PSA\s*\(([^)]+)\)/i) || [])[1] || "").trim();
export const isPsaCard = (k) => k.grading === "PSA";

/** What's owed, from the price list: grading fee + X% of PSA now; the rest of PSA + shipping + upcharge later. */
export function psaMoney(cards, P, extra = {}) {
  const psaCards = cards.filter(isPsaCard).filter((k) => k.status !== "cancelled");
  const gradeTier = (P.services || []).find((x) => x.type === "grading");
  let soloSeen = 0, gradingFees = 0, fees = 0;
  const lines = psaCards.map((k) => {
    const level = k.grade_level || levelFromService(k.service);
    const l = (P.psaLevels || []).find((x) => x.name.toLowerCase() === level.toLowerCase());
    const solo = /^grading submission/i.test(String(k.service || "").trim());
    const gf = solo ? (soloSeen++ ? num(P.gradingNext) : num(gradeTier ? gradeTier.price : 15)) : num(P.gradingAddon);
    gradingFees += gf; if (l) fees += l.price;
    return { k, level, fee: l ? l.price : null, gradingFee: gf };
  });
  // Grading fees are already counted once per order in the whole-order rules above (first card / each after).
  const dep = P.psaDeposit ?? 75, psaNow = r2(fees * dep / 100);
  const deposit = r2(gradingFees + psaNow), finalBase = r2(fees - psaNow);
  const final = r2(finalBase + num(extra.shipping) + num(extra.upcharge));
  return { lines, fees: r2(fees), gradingFees: r2(gradingFees), dep, deposit, finalBase, final };
}

// ------------------------------------------------------------ admin panel
export const psaPanel = (cards) => cards.some(isPsaCard)
  ? `<div class="panel psa-panel" id="psa" style="margin-top:14px"><div class="row"><h3 class="grow" style="margin:0">PSA submission</h3>
      <span id="psanow" class="pill"></span></div><div id="psabody" class="muted small" style="margin-top:8px">Loading…</div></div>` : "";

export function wirePsa(s, cards, { prices, saveToSheet }) {
  const box = $("#psabody");
  if (!box) return;
  const T = Object.assign({ stage: "", history: [], order_no: "", ship_tracking: "", return_tracking: "", pay: {} }, s.grading_track || {});
  if (!("grading_track" in s)) {
    box.innerHTML = `⚠ The database needs a one-time update first: in Supabase → SQL Editor, run <b>supabase/2026-11-13_psa_tracking.sql</b>, then refresh.`;
    return;
  }
  const psaCards = cards.filter(isPsaCard);
  let step = T.stage || "";
  prices().then((P) => {
    const draw = () => {
      const pay = Object.assign({ shipping: "", upcharge: "", deposit_paid_at: "", final_paid_at: "" }, T.pay || {});
      const M = psaMoney(cards, P, pay);
      const idx = stepIndex(step);
      $("#psanow").textContent = step ? stepLabel(step) : "Not started";
      box.className = "";
      box.innerHTML = `
        <label class="f">Where it is</label>
        <div class="psa-steps" role="radiogroup" aria-label="PSA step">${PSA_STEPS.map(([k, l], i) => `
          <button type="button" role="radio" aria-checked="${k === step}" class="psa-step ${k === step ? "on" : i < idx ? "done" : ""}" data-step="${k}">
            <span class="n">${i < idx ? "✓" : i + 1}</span>${esc(l)}</button>`).join("")}</div>
        <label class="small" style="display:block;margin-top:8px"><input type="checkbox" id="psamail" ${step !== (T.stage || "") ? "checked" : ""}>
          Email the customer about this step</label>
        <div class="grid2" style="margin-top:6px">
          <div><label class="f">PSA order #</label><input type="text" id="psaord" value="${esc(T.order_no)}" placeholder="from PSA's order page"></div>
          <div><label class="f">Tracking # to PSA</label><input type="text" id="psaship" value="${esc(T.ship_tracking)}"></div>
          <div><label class="f">Return tracking # (PSA → you)</label><input type="text" id="psaret" value="${esc(T.return_tracking)}"></div></div>
        <label class="f">Cards going to PSA</label>
        <div style="overflow:auto"><table class="list psa-cards"><thead><tr><th>#</th><th>Card</th><th>Level</th><th>PSA fee</th><th>Grade</th><th>Cert #</th></tr></thead><tbody>
          ${M.lines.map(({ k, level, fee }) => `<tr data-id="${k.id}"><td>${k.card_number}</td><td>${esc(k.name || "")}</td>
            <td>${level ? esc(level) : `<span class="setneed">Pick a level</span>`}</td><td>${fee == null ? "—" : money(fee)}</td>
            <td><input type="text" class="pg" value="${esc(k.grade_result || "")}" placeholder="e.g. PSA 10 GEM MT" style="min-width:140px"></td>
            <td><input type="text" class="pc" value="${esc(k.cert_no || "")}" inputmode="numeric" style="min-width:100px"></td></tr>`).join("")}
        </tbody></table></div>
        <p class="muted small" style="margin:4px 0 0">Change a card's level under <b>Services &amp; levels</b> below.</p>
        <label class="f">Payments</label>
        <div class="psa-pay">
          <div class="qline"><span><b>Due once evaluated</b><span class="muted small" style="display:block">your grading fee ${money(M.gradingFees)} + ${M.dep}% of PSA's ${money(M.fees)}</span></span>
            <span>${money(M.deposit)}</span></div>
          <label class="small psa-paid"><input type="checkbox" id="psadp" ${pay.deposit_paid_at ? "checked" : ""}> Paid${pay.deposit_paid_at ? ` ${esc(fmtDate(pay.deposit_paid_at))}` : ""}</label>
          <div class="row" style="gap:10px;margin-top:10px;flex-wrap:wrap">
            <label class="small">Return shipping <span class="money"><span>$</span><input type="text" id="psash" inputmode="decimal" value="${esc(pay.shipping)}" style="width:80px"></span></label>
            <label class="small">PSA upcharge <span class="money"><span>$</span><input type="text" id="psaup" inputmode="decimal" value="${esc(pay.upcharge)}" style="width:80px"></span></label></div>
          <div class="qline"><span><b>Final invoice</b><span class="muted small" style="display:block">the other ${100 - M.dep}% of PSA's fee ${money(M.finalBase)} + shipping + upcharge</span></span>
            <span id="psafinal">${money(M.final)}</span></div>
          <label class="small psa-paid"><input type="checkbox" id="psafp" ${pay.final_paid_at ? "checked" : ""}> Paid${pay.final_paid_at ? ` ${esc(fmtDate(pay.final_paid_at))}` : ""}</label>
          ${M.lines.some((l) => l.fee == null) ? `<p class="small" style="color:var(--gold);margin:6px 0 0">A card has no PSA level, so its PSA fee isn't counted yet.</p>` : ""}
        </div>
        <div class="row" style="margin-top:14px;flex-wrap:wrap"><button class="btn gold" id="psasave">Save PSA</button>
          <button class="btn sm" id="psacopy1">Copy payment request</button><button class="btn sm" id="psacopy2">Copy final invoice</button>
          <span class="muted small" id="psamsg"></span></div>`;
      $$(".psa-step", box).forEach((b) => b.onclick = () => { collect(); step = b.dataset.step; draw(); $("#psamail").checked = step !== (T.stage || ""); });
      const refresh = () => { const m = psaMoney(cards, P, { shipping: $("#psash").value, upcharge: $("#psaup").value }); $("#psafinal").textContent = money(m.final); };
      $("#psash").oninput = refresh; $("#psaup").oninput = refresh;
      const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast("Copied."); } catch { toast("Couldn't copy on this device."); } };
      $("#psacopy1").onclick = () => copy([`Restored Rarity — ${s.code}`, `Your card${M.lines.length > 1 ? "s are" : " is"} evaluated and cleared for PSA.`,
        ...M.lines.map((l) => `#${l.k.card_number} ${l.k.name || "Card"} · PSA ${l.level || "?"}${l.fee != null ? ` (${money(l.fee)})` : ""}`),
        `Due now: ${money(M.deposit)} (grading fee ${money(M.gradingFees)} + ${M.dep}% of PSA's fee).`,
        `The other ${100 - M.dep}% (${money(M.finalBase)}), return shipping and any PSA upcharge are on the final invoice when grades are back.`].join("\n"));
      $("#psacopy2").onclick = () => { collect(); const m = psaMoney(cards, P, T.pay); copy([`Restored Rarity — ${s.code} final invoice`,
        ...psaCards.map((k) => { const row = $(`tr[data-id="${k.id}"]`, box); const g = row ? $(".pg", row).value.trim() : ""; return `#${k.card_number} ${k.name || "Card"}${g ? `: ${g}` : ""}`; }),
        `Rest of PSA's fee: ${money(m.finalBase)}`, num(T.pay.shipping) ? `Return shipping: ${money(T.pay.shipping)}` : "",
        num(T.pay.upcharge) ? `PSA upcharge: ${money(T.pay.upcharge)}` : "", `Total due: ${money(m.final)}`].filter(Boolean).join("\n")); };
      $("#psasave").onclick = save;
    };
    // Keep typed values when the step buttons redraw the panel.
    const collect = () => {
      if (!$("#psaord")) return;
      T.order_no = $("#psaord").value.trim(); T.ship_tracking = $("#psaship").value.trim(); T.return_tracking = $("#psaret").value.trim();
      T.pay = Object.assign({}, T.pay, { shipping: $("#psash").value.trim(), upcharge: $("#psaup").value.trim(),
        deposit_paid_at: $("#psadp").checked ? (T.pay.deposit_paid_at || new Date().toISOString()) : "",
        final_paid_at: $("#psafp").checked ? (T.pay.final_paid_at || new Date().toISOString()) : "" });
      for (const k of psaCards) { const row = $(`tr[data-id="${k.id}"]`, box); if (row) { k._g = $(".pg", row).value.trim(); k._c = $(".pc", row).value.trim(); } }
    };
    const save = async () => {
      collect();
      const email = $("#psamail").checked, btn = $("#psasave"), msg = $("#psamsg");
      if (email && !step) return toast("Pick a step first, or untick Email.");
      btn.disabled = true; msg.textContent = "Saving…";
      const M = psaMoney(cards, P, T.pay);
      const track = { stage: step, order_no: T.order_no, ship_tracking: T.ship_tracking, return_tracking: T.return_tracking,
        history: [...(T.history || [])], pay: Object.assign({}, T.pay, { fees: M.fees, deposit: M.deposit, final: M.final }) };
      if (step && step !== (T.stage || "")) track.history.push({ stage: step, at: new Date().toISOString() });
      try {
        Object.assign(s, await api.update("submissions", s.id, { grading_track: track }));
        Object.assign(T, track);
        for (const k of psaCards) {
          if ((k._g ?? k.grade_result ?? "") !== (k.grade_result || "") || (k._c ?? "") !== (k.cert_no || ""))
            Object.assign(k, await api.update("cards", k.id, { grade_result: k._g || "", cert_no: k._c || "" }));
        }
      } catch (e) {
        btn.disabled = false; msg.textContent = "";
        return toast(/grading_track|grade_result|cert_no|column/i.test(e.message)
          ? "The database needs a one-time update first: in Supabase → SQL Editor, run supabase/2026-11-13_psa_tracking.sql, then try again." : e.message, 9000);
      }
      let note = "Saved.";
      try {
        const out = await saveToSheet({ code: s.code, step, email, orderNo: track.order_no, shipTracking: track.ship_tracking, returnTracking: track.return_tracking,
          cards: psaCards.map((k) => ({ num: k.card_number, card: k.name || "", level: k.grade_level || levelFromService(k.service), grade: k.grade_result || "", cert: k.cert_no || "" })),
          pay: { deposit: M.deposit, depositPaid: !!track.pay.deposit_paid_at, final: M.final, finalPaid: !!track.pay.final_paid_at } });
        note = out.emailed ? "Saved and emailed the customer." : out.error ? `Saved. ${out.error}` : email ? "Saved." : "Saved (no email).";
        if (!out.onSheet) note += " This order isn't on the Sheet, so the website tracker won't show it; their private link does.";
      } catch (e) {
        note = `Saved in the portal (their private link shows it), but ${email ? "no email was sent and " : ""}the Sheet wasn't updated: ${e.message}`;
      }
      toast(note, 8000);
      btn.disabled = false; msg.textContent = "";
      draw();
    };
    draw();
  }).catch((e) => { box.textContent = "Couldn't load the price list: " + e.message; });
}

// ------------------------------------------------------------ customer link
/** Tracker for a submission on the customer's private link (plain HTML string). */
export function psaCustomerHtml(s) {
  const T = s.grading_track || {}, cards = (s.cards || []).filter(isPsaCard);
  if (!T.stage && !cards.length) return "";
  const idx = stepIndex(T.stage), when = {};
  (T.history || []).forEach((h) => { when[h.stage] = h.at; });
  const pay = T.pay || {};
  return `<div class="psa-cust"><div class="lbl">PSA SUBMISSION</div>
    <div class="now">${T.stage ? esc(stepLabel(T.stage)) : "Waiting for evaluation"}</div>
    <ol class="psa-track">${PSA_STEPS.map(([k, l], i) => `<li class="${i < idx || (i === idx && i === PSA_STEPS.length - 1) ? "done" : i === idx ? "current" : ""}">
      <span class="dot">${i < idx || (i === idx && i === PSA_STEPS.length - 1) ? "✓" : ""}</span>${esc(l)}${when[k] && i <= idx ? ` <span class="when">${esc(fmtDate(when[k]))}</span>` : ""}</li>`).join("")}</ol>
    ${T.order_no ? `<p>PSA order #: <b>${esc(T.order_no)}</b></p>` : ""}
    ${T.ship_tracking ? `<p>Tracking to PSA: <b>${esc(T.ship_tracking)}</b></p>` : ""}
    ${T.return_tracking ? `<p>Return tracking: <b>${esc(T.return_tracking)}</b></p>` : ""}
    <ul class="psa-cards-c">${cards.map((k) => `<li>${esc(k.name || "Card " + k.card_number)}${(k.grade_level || levelFromService(k.service)) ? ` · PSA ${esc(k.grade_level || levelFromService(k.service))}` : ""}${k.grade_result ? ` — <b>${esc(k.grade_result)}</b>` : ""}${k.cert_no ? ` (cert #${esc(k.cert_no)})` : ""}</li>`).join("")}</ul>
    ${pay.deposit ? `<p>Due once evaluated: <b>${money(pay.deposit)}</b>${pay.deposit_paid_at ? " — paid ✓" : idx >= 0 ? " — due" : ""}</p>` : ""}
    ${pay.final && idx >= 5 ? `<p>Final invoice: <b>${money(pay.final)}</b>${pay.final_paid_at ? " — paid ✓" : " — due"}</p>` : ""}
  </div>`;
}
