// Grading-company stages (PSA, CGC, BGS, TAG): the admin Grading panel on each submission + the tracker on the
// customer's private link. Approved by the owner Nov 25, 2026.
//
// Kept apart from the work status (cards.status). A grading stage never changes the work status: "Received at
// Restored Rarity" leaves it alone, and the owner sets Ready (which starts the holding-fee clock) himself.
//
// Database (supabase/2026-11-25_grading_stages.sql):
//   cards.grading        company (PSA / CGC / BGS / TAG / "Not sure yet" / "")
//   cards.grader_stage   that company's own stage key, or a Restored Rarity stage (rr_*)
//   cards.grading_stage  normalized customer stage — set by a database trigger from grader_stage (mapStage below)
//   grading_lots         one per order + company: order #, tracking #s, notes, estimated total grading fee,
//                        First 50% / Second 50% paid dates, ship date, second-50% due date, reminder sent
//   grading_stage_events history (stepper dates; emailed_at stops a second email for the same stage)
// Emails + the Sheet copy go through the Apps Script ({type:"portalGrading"}). The second-50% reminder is sent by the
// Apps Script's daily runGradingReminders (14 days after "Shipped to grader", skipped once Second 50% is ticked).
// Nothing here charges anyone.
import { api, DEMO, esc, $, $$, toast, fmtDate } from "./common.js";

export const GRADERS = ["PSA", "CGC", "BGS", "TAG"];
export const isGrader = (g) => GRADERS.includes(g);

// Restored Rarity's own stages, shown for every company.
export const RR_BEFORE = [["rr_preparing", "Preparing for submission"], ["rr_shipped_to_grader", "Shipped to grader"]];
export const RR_AFTER = [["rr_grades_in", "Grades are in"], ["rr_received_at_rr", "Received at Restored Rarity"]];
export const RR_SIDE = [["rr_on_hold", "On hold / problem at grader"]];

// Each company's own public stage names (sources in the design doc, Nov 25, 2026).
// CGC: [to confirm] — taken from collector reports + CGC's FAQ, not from a logged-in CGC account. The marker shows
// only in the admin dropdown's group label, never on the customer link or in emails.
export const GRADER_STAGES = {
  PSA: [["psa_order_arrived", "Order Arrived"], ["psa_order_prep", "Order Prep"], ["psa_research_id", "Research & ID"],
        ["psa_grading", "Grading"], ["psa_assembly", "Assembly"], ["psa_qa_checks", "QA Checks"],
        ["psa_complete", "Complete"], ["psa_shipped", "Shipped"]],
  CGC: [["cgc_received", "Received"], ["cgc_scheduled", "Scheduled for Grading"], ["cgc_grading", "In Grading"],
        ["cgc_encapsulation", "Encapsulation"], ["cgc_qc", "Quality Control / Finalized"], ["cgc_shipped", "Shipped"]],
  BGS: [["bgs_receiving", "Receiving"], ["bgs_invoicing", "Invoicing"], ["bgs_verification", "Verification"],
        ["bgs_grading", "Grading"], ["bgs_labels", "Labels"], ["bgs_production_qc", "Production & QC"],
        ["bgs_shipping", "Shipping & Pickup"]],
  TAG: [["tag_pending_receipt", "Pending Receipt"], ["tag_received", "Received"], ["tag_order_prep", "Order Prep"],
        ["tag_card_id", "Card ID"], ["tag_image_processing", "Image Processing"], ["tag_verification", "Verification"],
        ["tag_slab_assembly", "Slab Assembly"], ["tag_qa", "QA"], ["tag_slab_imaging", "Slab Imaging"],
        ["tag_order_complete", "Order Complete"], ["tag_shipment", "Shipment"]],
};
export const TO_CONFIRM = { CGC: true };

// Normalized customer stages, in order. on_hold sits outside the stepper.
export const NORMAL = [["preparing", "Preparing for submission"], ["shipped_to_grader", "Shipped to grader"],
  ["received_by_grader", "Received by grader"], ["order_prep", "Order prep"], ["research_id", "Research / ID"],
  ["grading", "Grading"], ["grades_in", "Grades are in"], ["qa_assembly", "QA / Assembly"],
  ["shipped_back", "Shipped back to Restored Rarity"], ["received_at_rr", "Back at Restored Rarity"]];
export const ON_HOLD_LABEL = "On hold / problem at grader";
export const normalLabel = (n) => n === "on_hold" ? ON_HOLD_LABEL : (NORMAL.find((x) => x[0] === n) || [])[1] || "";
const normalIndex = (n) => NORMAL.findIndex((x) => x[0] === n);

// Same map as public.map_grading_stage in the SQL (tests/grading_stages.js checks they agree).
const MAP = {
  rr_preparing: "preparing", rr_shipped_to_grader: "shipped_to_grader", rr_grades_in: "grades_in",
  rr_received_at_rr: "received_at_rr", rr_on_hold: "on_hold",
  psa_order_arrived: "received_by_grader", psa_order_prep: "order_prep", psa_research_id: "research_id",
  psa_grading: "grading", psa_assembly: "qa_assembly", psa_qa_checks: "qa_assembly", psa_complete: "qa_assembly",
  psa_shipped: "shipped_back",
  cgc_received: "received_by_grader", cgc_scheduled: "research_id", cgc_grading: "grading",
  cgc_encapsulation: "qa_assembly", cgc_qc: "qa_assembly", cgc_shipped: "shipped_back",
  bgs_receiving: "received_by_grader", bgs_invoicing: "order_prep", bgs_verification: "research_id",
  bgs_grading: "grading", bgs_labels: "qa_assembly", bgs_production_qc: "qa_assembly", bgs_shipping: "shipped_back",
  tag_pending_receipt: "shipped_to_grader", tag_received: "received_by_grader", tag_order_prep: "order_prep",
  tag_card_id: "research_id", tag_image_processing: "grading", tag_verification: "grading",
  tag_slab_assembly: "qa_assembly", tag_qa: "qa_assembly", tag_slab_imaging: "qa_assembly",
  tag_order_complete: "qa_assembly", tag_shipment: "shipped_back",
};
export function mapStage(grader, key) {
  const k = String(key || "").trim().toLowerCase();
  if (!k) return "";
  if (MAP[k]) return MAP[k];
  throw new Error(`Unknown grading stage "${key}" for ${grader || "this card"}.`);
}

/** All stage keys an admin can pick for a company, in dropdown order. */
export const stagesFor = (g) => isGrader(g) ? [...RR_BEFORE, ...GRADER_STAGES[g], ...RR_AFTER, ...RR_SIDE] : [];
/** Official (or RR) label for a stage key. */
export function stageLabel(key) {
  for (const [k, l] of [...RR_BEFORE, ...RR_AFTER, ...RR_SIDE, ...Object.values(GRADER_STAGES).flat()]) if (k === key) return l;
  return "";
}
const isRR = (k) => /^rr_/.test(k || "");

/** <option>s for one company: RR before → company → RR after → on hold. Mixed companies (g = "") get RR stages only. */
export function stageOptions(g, sel = "", blank = "No grading stage yet") {
  const opt = ([k, l]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${esc(l)}</option>`;
  return `<option value="">${esc(blank)}</option>
    <optgroup label="Restored Rarity — before">${RR_BEFORE.map(opt).join("")}</optgroup>
    ${isGrader(g) ? `<optgroup label="${g}${TO_CONFIRM[g] ? " [to confirm]" : ""}">${GRADER_STAGES[g].map(opt).join("")}</optgroup>` : ""}
    <optgroup label="Restored Rarity — after">${RR_AFTER.map(opt).join("")}</optgroup>
    <optgroup label="Problem">${RR_SIDE.map(opt).join("")}</optgroup>`;
}

// Which changes email the customer by default (design §2.6). The admin can tick or untick any one.
export const EMAIL_DEFAULT = { preparing: "if_due", shipped_to_grader: true, received_by_grader: true, order_prep: false,
  research_id: false, grading: false, grades_in: true, qa_assembly: false, shipped_back: true, received_at_rr: true,
  on_hold: false };
/** Default for the "Email the customer" box. "Preparing" emails only while the first 50% is still due. */
export function emailDefault(normal, lot) {
  const d = EMAIL_DEFAULT[normal];
  if (d === "if_due") return !!(lot && Number(lot.est_fee) > 0 && !lot.first_half_paid_at);
  return !!d;
}

// ------------------------------------------------------------ money (never charged — reminders only)
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const money = (n) => "$" + r2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => { const n = parseFloat(String(v ?? "").replace(/[$,\s]/g, "")); return isFinite(n) && n >= 0 ? n : null; };
/** 50% of the estimate rounded to cents; the second half is the rest (same as the generated SQL columns). */
export function halves(est) {
  const e = num(est);
  if (e == null) return null;
  const cents = Math.round(e * 100), first = Math.round(cents / 2);
  return { est: cents / 100, first: first / 100, second: (cents - first) / 100 };
}
const ymd = (d) => { const x = new Date(d); return isNaN(x) ? "" : x.toISOString().slice(0, 10); };
const dayText = (d) => d ? new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
/** The lot fields the Apps Script copies to the Sheet ("Grading Lots" tab) for the tracker and the daily reminder. */
export function lotForSheet(lot) {
  const h = halves(lot.est_fee) || {};
  const pay = lot.pay || {};
  return { id: lot.id, grader: lot.grader, orderNo: lot.grader_order_no || "", shipTracking: lot.ship_tracking || "",
    returnTracking: lot.return_tracking || "", notes: lot.notes || "", estFee: h.est ?? null, firstAmount: h.first ?? null,
    secondAmount: h.second ?? null, firstPaidAt: lot.first_half_paid_at || "", secondPaidAt: lot.second_half_paid_at || "",
    shippedAt: lot.shipped_at || "", balanceDueOn: lot.balance_due_on || "", returnShipping: num(pay.return_shipping),
    upcharge: num(pay.upcharge), finalPaidAt: pay.final_paid_at || "" };
}

// ------------------------------------------------------------ admin panel
/** Shown when any card on the order is flagged for grading (company chosen under Services & levels). */
export const gradingPanel = (cards) => cards.some((k) => k.grading)
  ? `<div class="panel psa-panel" id="grd" style="margin-top:14px"><div class="row"><h3 class="grow" style="margin:0">Grading</h3>
      <span class="muted small">Separate from the work status above</span></div>
      <div id="grdbody" class="muted small" style="margin-top:8px">Loading…</div></div>` : "";

/**
 * @param s      submission row
 * @param cards  its card rows (mutated in place after saves)
 * @param opts.setCompany(changes)  [{k, grading}] → saves the company through the normal service editor path
 *                                  (keeps the service text + Sheet quote in step). Returns a message.
 * @param opts.saveToSheet(body)    posts {type:"portalGrading"} to the Apps Script.
 * @param opts.done()               re-render the page after a save.
 */
export function wireGrading(s, cards, { setCompany, saveToSheet, done }) {
  const box = $("#grdbody");
  if (!box) return;
  if (cards.length && !("grader_stage" in cards[0]) && !DEMO) {
    box.innerHTML = `⚠ The database needs a one-time update first: in Supabase → SQL Editor, run <b>supabase/RUN-NEXT-in-Supabase.sql</b>
      (it includes 2026-11-25_grading_stages.sql), then refresh.`;
    return;
  }
  const graded = () => cards.filter((k) => k.grading);
  let lots = [], events = [];
  const lotOf = (g) => lots.find((l) => l.grader === g);
  const eventsOf = (k) => events.filter((e) => e.card_id === k.id).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  const load = async () => {
    const [L, E] = await Promise.all([api.select("grading_lots").catch(() => []), api.select("grading_stage_events").catch(() => [])]);
    lots = (L || []).filter((l) => l.submission_id === s.id);
    const ids = new Set(cards.map((k) => k.id));
    events = (E || []).filter((e) => ids.has(e.card_id));
  };

  const rowHtml = (k) => {
    const g = k.grading || "", st = k.grader_stage || "";
    const since = st && k.grading_stage_at ? ` <span class="muted small">since ${esc(fmtDate(k.grading_stage_at))}</span>` : "";
    return `<tr data-id="${k.id}"><td class="pick"><input type="checkbox" class="gpick pick" value="${esc(k.id)}" aria-label="Select card ${k.card_number}"></td>
      <td>${k.card_number}</td><td><b>${esc(k.name || "—")}</b>${since}</td>
      <td><select class="gco" aria-label="Grading company">${[...GRADERS, "Not sure yet"].map((x) =>
        `<option ${x === g ? "selected" : ""}>${x}</option>`).join("")}</select></td>
      <td><select class="gst" aria-label="Grading stage" ${isGrader(g) ? "" : "disabled"}>${stageOptions(g, st)}</select></td>
      <td><label class="small"><input type="checkbox" class="gml" disabled> Email</label></td>
      <td><input type="text" class="ggr" value="${esc(k.grade_result || "")}" placeholder="e.g. PSA 10" style="min-width:110px"></td>
      <td><input type="text" class="gce" value="${esc(k.cert_no || "")}" inputmode="numeric" style="min-width:90px"></td></tr>`;
  };

  const lotHtml = (l) => {
    const h = halves(l.est_fee), pay = l.pay || {};
    const paid = (id, at, label, amt) => `<label class="small psa-paid" style="text-align:left"><input type="checkbox" id="${id}" ${at ? "checked" : ""}>
      ${label}${id.startsWith("lpf-") ? "" : ` — <b class="amt">${amt != null ? money(amt) : "enter the estimate"}</b>`}${at ? ` <span class="muted">paid ${esc(fmtDate(at))}</span>` : ""}</label>`;
    return `<div class="psa-pay glot" data-lot="${l.id}" style="margin-top:12px">
      <div class="row" style="margin-top:8px"><b class="grow">${esc(l.grader)} — this order's package</b>
        ${l.shipped_at ? `<span class="muted small">Shipped ${esc(fmtDate(l.shipped_at))}</span>` : `<span class="muted small">Not shipped yet</span>`}</div>
      <div class="grid2" style="margin-top:6px">
        <div><label class="f">${esc(l.grader)} order #</label><input type="text" class="lord" value="${esc(l.grader_order_no)}"></div>
        <div><label class="f">Tracking # to ${esc(l.grader)}</label><input type="text" class="lship" value="${esc(l.ship_tracking)}"></div>
        <div><label class="f">Return tracking # (${esc(l.grader)} → you)</label><input type="text" class="lret" value="${esc(l.return_tracking)}"></div>
        <div><label class="f">Estimated total grading fee</label><span class="money"><span>$</span><input type="text" class="lest" inputmode="decimal"
          value="${l.est_fee == null ? "" : esc(l.est_fee)}" placeholder="0.00" style="width:110px"></span></div>
        <div><label class="f">Note to customer (they see this)</label><textarea class="lnote">${esc(l.notes)}</textarea></div>
        <div><label class="f">Private notes (only you)</label><textarea class="lint">${esc(l.internal_notes)}</textarea></div></div>
      <label class="f">Payments (reminders only — nothing is charged)</label>
      ${paid("lp1-" + l.id, l.first_half_paid_at, "First 50% paid", h && h.first)}
      ${paid("lp2-" + l.id, l.second_half_paid_at, "Second 50% paid", h && h.second)}
      <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:4px">
        <label class="small">Second 50% due <input type="date" class="ldue" value="${esc(l.balance_due_on || "")}" style="width:auto"></label>
        <span class="muted small">${l.balance_due_on ? "" : "Set automatically to 14 days after “Shipped to grader”. "}${l.balance_reminder_sent_at
          ? `Reminder emailed ${esc(fmtDate(l.balance_reminder_sent_at))}.` : l.second_half_paid_at ? "No reminder needed (paid)." : "The reminder emails on the due date if Second 50% isn't ticked."}</span></div>
      <div class="row" style="gap:10px;margin-top:10px;flex-wrap:wrap">
        <label class="small">Return shipping <span class="money"><span>$</span><input type="text" class="lrs" inputmode="decimal" value="${esc(pay.return_shipping ?? "")}" style="width:80px"></span></label>
        <label class="small">${esc(l.grader)} upcharge <span class="money"><span>$</span><input type="text" class="lup" inputmode="decimal" value="${esc(pay.upcharge ?? "")}" style="width:80px"></span></label>
        ${paid("lpf-" + l.id, pay.final_paid_at, "Final invoice paid", null)}</div>
      <div class="row" style="margin-top:10px"><button class="btn sm gold lsave">Save ${esc(l.grader)} details</button><span class="muted small lmsg"></span></div></div>`;
  };

  const draw = () => {
    const G = graded();
    const companies = [...new Set(G.map((k) => k.grading).filter(isGrader))];
    const noLot = companies.filter((g) => !lotOf(g));
    box.className = "";
    box.innerHTML = `
      <p class="muted small" style="margin:0 0 8px">Pick the company, then that company's stage. Saving a stage never changes the work status —
        set Ready yourself when the cards are ready to go home (that starts the holding-fee clock).</p>
      <div class="row" style="margin:0 0 8px;gap:8px;flex-wrap:wrap">
        <span class="muted small" id="gcount">None selected</span><span class="grow"></span>
        <label class="small" for="gbco">Set selected to</label>
        <select id="gbco" style="width:auto"><option value="">Keep each card's company</option>${GRADERS.map((g) => `<option>${g}</option>`).join("")}</select>
        <select id="gbst" style="width:auto;max-width:260px">${stageOptions("", "", "Choose a stage…")}</select>
        <label class="small"><input type="checkbox" id="gbml"> Email the customer</label>
        <button class="btn sm gold" type="button" id="gbapply" disabled>Apply</button></div>
      <div style="overflow:auto"><table class="list psa-cards"><thead><tr><th class="pick"><input type="checkbox" id="gall" aria-label="Select all"></th>
        <th>#</th><th>Card</th><th>Company</th><th>Stage</th><th>Email</th><th>Grade</th><th>Cert #</th></tr></thead>
        <tbody>${G.map(rowHtml).join("")}</tbody></table></div>
      <div class="row" style="margin-top:8px"><button class="btn gold" id="gsave">Save changes</button><span class="muted small" id="gmsg"></span></div>
      ${lots.filter((l) => companies.includes(l.grader)).map(lotHtml).join("")}
      ${noLot.length ? `<p class="muted small" style="margin:10px 0 0">${noLot.join(", ")}: the order #, tracking and fee box appear once a card has a stage.</p>` : ""}`;
    wire();
  };

  const selectedIds = () => $$(".gpick", box).filter((b) => b.checked).map((b) => b.value);
  const bulkCompany = () => {
    const pick = $("#gbco").value;
    if (pick) return pick;
    const set = new Set(selectedIds().map((id) => cards.find((k) => k.id === id)?.grading));
    return set.size === 1 ? [...set][0] : "";
  };
  const refreshBulk = () => {
    const n = selectedIds().length, all = $$(".gpick", box);
    $("#gcount").textContent = n ? `${n} selected` : "None selected";
    $("#gbapply").disabled = n === 0 || !$("#gbst").value;
    $("#gall").checked = all.length > 0 && n === all.length; $("#gall").indeterminate = n > 0 && n < all.length;
    const g = bulkCompany(), cur = $("#gbst").value;
    $("#gbst").innerHTML = stageOptions(isGrader(g) ? g : "", stagesFor(g).some(([k]) => k === cur) || isRR(cur) ? cur : "", "Choose a stage…");
    $("#gbapply").disabled = n === 0 || !$("#gbst").value;
  };
  const wire = () => {
    $$(".gpick", box).forEach((b) => b.onchange = refreshBulk);
    $("#gall").onchange = () => { $$(".gpick", box).forEach((b) => { b.checked = $("#gall").checked; }); refreshBulk(); };
    $("#gbco").onchange = refreshBulk;
    $("#gbst").onchange = () => {
      const st = $("#gbst").value, lot = lotOf(bulkCompany());
      $("#gbml").checked = st ? emailDefault(mapStage("", st), lot) : false;
      $("#gbapply").disabled = !selectedIds().length || !st;
    };
    $$("tr[data-id]", box).forEach((tr) => {
      const k = cards.find((x) => x.id === tr.dataset.id);
      const co = $(".gco", tr), st = $(".gst", tr), ml = $(".gml", tr);
      co.onchange = () => {
        const keep = stagesFor(co.value).some(([x]) => x === st.value) ? st.value : "";
        st.innerHTML = stageOptions(co.value, keep); st.disabled = !isGrader(co.value); st.onchange();
      };
      st.onchange = () => {
        const changed = st.value !== (k.grader_stage || "") && !!st.value;
        ml.disabled = !changed;
        ml.checked = changed ? emailDefault(mapStage(co.value, st.value), lotOf(co.value)) : false;
      };
    });
    $("#gbapply").onclick = () => {
      const st = $("#gbst").value, co = $("#gbco").value, email = $("#gbml").checked;
      const list = selectedIds().map((id) => cards.find((k) => k.id === id)).map((k) => ({ k, grading: co || k.grading, grader_stage: st, email }));
      const bad = list.find((c) => !stagesFor(c.grading).some(([x]) => x === st));
      if (bad) return toast(`Card #${bad.k.card_number} is ${bad.k.grading ? `flagged for ${bad.k.grading}` : "not flagged for a company"}; pick a company first.`, 7000);
      apply(list, $("#gbapply"));
    };
    $("#gsave").onclick = () => {
      const list = $$("tr[data-id]", box).map((tr) => {
        const k = cards.find((x) => x.id === tr.dataset.id);
        return { k, grading: $(".gco", tr).value, grader_stage: $(".gst", tr).disabled ? "" : $(".gst", tr).value,
                 email: $(".gml", tr).checked && !$(".gml", tr).disabled, grade_result: $(".ggr", tr).value.trim(), cert_no: $(".gce", tr).value.trim() };
      });
      apply(list, $("#gsave"));
    };
    $$(".glot", box).forEach((el) => {
      const l = lots.find((x) => x.id === el.dataset.lot);
      $(".lest", el).oninput = () => {
        const h = halves($(".lest", el).value);
        [["lp1-", "first"], ["lp2-", "second"]].forEach(([p, key]) => {
          const b = $(".amt", $("#" + p + l.id, el).parentElement);
          if (b) b.textContent = h ? money(h[key]) : "enter the estimate";
        });
      };
      $(".lsave", el).onclick = () => saveLot(l, el);
    });
  };

  // Lot details + paid boxes. Ticking stores the time; unticking clears it.
  const saveLot = async (l, el) => {
    const estTxt = $(".lest", el).value.trim(), est = estTxt === "" ? null : num(estTxt);
    if (estTxt !== "" && est == null) return toast("The estimated grading fee needs a number (like 79.98).");
    const stamp = (box_, at) => box_.checked ? (at || new Date().toISOString()) : null;
    const rs = $(".lrs", el).value.trim(), up = $(".lup", el).value.trim();
    if ((rs && num(rs) == null) || (up && num(up) == null)) return toast("Return shipping and upcharge need numbers.");
    const patch = { grader_order_no: $(".lord", el).value.trim(), ship_tracking: $(".lship", el).value.trim(),
      return_tracking: $(".lret", el).value.trim(), notes: $(".lnote", el).value, internal_notes: $(".lint", el).value,
      est_fee: est == null ? null : r2(est),
      first_half_paid_at: stamp($("#lp1-" + l.id, el), l.first_half_paid_at),
      second_half_paid_at: stamp($("#lp2-" + l.id, el), l.second_half_paid_at),
      balance_due_on: $(".ldue", el).value || null,
      pay: Object.assign({}, l.pay || {}, { return_shipping: rs === "" ? null : num(rs), upcharge: up === "" ? null : num(up),
        final_paid_at: stamp($("#lpf-" + l.id, el), (l.pay || {}).final_paid_at) }) };
    const btn = $(".lsave", el); btn.disabled = true; $(".lmsg", el).textContent = "Saving…";
    try { Object.assign(l, await api.update("grading_lots", l.id, patch)); }
    catch (e) { btn.disabled = false; $(".lmsg", el).textContent = ""; return toast(e.message, 7000); }
    if (DEMO) { const h = halves(l.est_fee); l.first_half_amount = h?.first ?? null; l.second_half_amount = h?.second ?? null; }
    let note = "Saved.";
    try { await sheetCopy(l, [], false); } catch (e) { note = `Saved in the portal, but the Sheet copy (used by the website tracker and the payment reminder) wasn't updated: ${e.message}`; }
    toast(note, 8000);
    draw();
  };

  const cardsForSheet = (list) => list.map((k) => ({ num: k.card_number, card: k.name || "", stage: k.grader_stage || "",
    stageLabel: stageLabel(k.grader_stage), normal: k.grading_stage || "", grade: k.grade_result || "", cert: k.cert_no || "",
    level: k.grade_level || "" }));
  const sheetCopy = (lot, emailCards, email, stage = "") => saveToSheet({ code: s.code, grader: lot.grader, email, stage,
    stageLabel: stageLabel(stage), normal: stage ? mapStage(lot.grader, stage) : "", normalLabel: stage ? normalLabel(mapStage(lot.grader, stage)) : "",
    lot: lotForSheet(lot), emailCards: cardsForSheet(emailCards),
    cards: cardsForSheet(cards.filter((k) => k.grading === lot.grader && k.grader_stage)) });

  // Save a list of {k, grading, grader_stage, email, grade_result?, cert_no?}: company → stage → grades → emails.
  const apply = async (list, btn) => {
    for (const c of list) if (c.grader_stage) { try { mapStage(c.grading, c.grader_stage); } catch (e) { return toast(e.message, 6000); } }
    const companyChanges = list.filter((c) => c.grading !== (c.k.grading || ""));
    const stageChanges = list.filter((c) => c.grader_stage !== (c.k.grader_stage || "") || (companyChanges.includes(c) && c.grader_stage));
    const gradeChanges = list.filter((c) => c.grade_result != null && (c.grade_result !== (c.k.grade_result || "") || c.cert_no !== (c.k.cert_no || "")));
    if (!companyChanges.length && !stageChanges.length && !gradeChanges.length) return toast("Nothing changed.");
    btn.disabled = true; const msg = $("#gmsg"); if (msg) msg.textContent = "Saving…";
    const notes = [];
    try {
      if (companyChanges.length) notes.push(await setCompany(companyChanges.map((c) => ({ k: c.k, grading: c.grading }))));
      // One statement per stage, so a bulk change is one update.
      const byStage = {};
      stageChanges.forEach((c) => { (byStage[c.grader_stage] ||= []).push(c.k.id); });
      for (const [st, ids] of Object.entries(byStage)) {
        for (const row of await api.updateMany("cards", ids, { grader_stage: st })) {
          const k = cards.find((x) => x.id === row.id); if (k) Object.assign(k, row);
        }
      }
      for (const c of gradeChanges) Object.assign(c.k, await api.update("cards", c.k.id, { grade_result: c.grade_result, cert_no: c.cert_no }));
      if (DEMO) demoShim();
      await load();
    } catch (e) {
      btn.disabled = false; if (msg) msg.textContent = "";
      return toast(/grader_stage|grading_lot|column|relation/i.test(e.message)
        ? "The database needs a one-time update first: in Supabase → SQL Editor, run supabase/RUN-NEXT-in-Supabase.sql, then try again." : e.message, 9000);
    }
    // Emails (one per company + stage) and the Sheet copy of every lot that changed.
    const touched = new Set(list.filter((c) => isGrader(c.grading)).map((c) => c.grading));
    for (const g of touched) {
      const lot = lotOf(g); if (!lot) continue;
      const mail = {};
      stageChanges.filter((c) => c.email && c.grading === g && c.grader_stage).forEach((c) => {
        // Never email the same card about the same stage twice.
        const already = eventsOf(c.k).some((e) => e.grader === g && e.grader_stage === c.grader_stage && e.emailed_at);
        if (!already) (mail[c.grader_stage] ||= []).push(c.k);
      });
      const stages = Object.keys(mail);
      try {
        if (!stages.length) await sheetCopy(lot, [], false);
        for (const st of stages) {
          const out = await sheetCopy(lot, mail[st], true, st);
          if (out.emailed) {
            const evIds = mail[st].map((k) => eventsOf(k).filter((e) => e.grader_stage === st && !e.emailed_at).at(-1)?.id).filter(Boolean);
            if (evIds.length && !DEMO) await api.updateMany("grading_stage_events", evIds, { emailed_at: new Date().toISOString() }).catch(() => {});
            notes.push(`Emailed the customer (${g}: ${stageLabel(st)}).`);
          } else if (out.error) notes.push(out.error);
          if (!out.onSheet) notes.push("This order isn't on the Sheet, so the website tracker won't show it; their private link does.");
        }
      } catch (e) {
        notes.push(`Saved in the portal (their private link shows it), but ${stages.length ? "no email was sent and " : ""}the Sheet wasn't updated: ${e.message}`);
      }
    }
    toast(["Saved.", ...notes.filter((n) => n && n !== "Nothing changed.").map((n) => String(n).replace(/^Saved\.\s*/, ""))].filter(Boolean).join(" "), 9000);
    done ? done() : draw();
  };

  // ?demo has no database triggers: give cards their normalized stage and a lot, like the SQL does.
  const demoShim = () => {
    for (const k of cards) {
      k.grading_stage = k.grader_stage && isGrader(k.grading) ? mapStage(k.grading, k.grader_stage) : "";
      if (!isGrader(k.grading)) { k.grader_stage = ""; k.grading_lot_id = null; continue; }
      if (!k.grader_stage) continue;
      window._rrDemoLots ||= [];
      let l = window._rrDemoLots.find((x) => x.submission_id === s.id && x.grader === k.grading);
      if (!l) { l = { id: "lot-" + s.id + "-" + k.grading, submission_id: s.id, grader: k.grading, grader_order_no: "", ship_tracking: "",
        return_tracking: "", notes: "", internal_notes: "", est_fee: null, first_half_paid_at: null, second_half_paid_at: null,
        shipped_at: null, balance_due_on: null, balance_reminder_sent_at: null, pay: {} }; window._rrDemoLots.push(l); }
      if (k.grading_stage === "shipped_to_grader" && !l.shipped_at) {
        l.shipped_at = new Date().toISOString(); l.balance_due_on = ymd(Date.now() + 14 * 864e5);
      }
      k.grading_lot_id = l.id; k.grading_stage_at ||= new Date().toISOString();
    }
  };
  if (DEMO && window._rrDemo) window._rrDemoLots = (window._rrDemo.grading_lots ||= []);
  if (DEMO && !api._gradingShim) {
    api._gradingShim = true;
    api.select = ((orig) => async (t) => t === "grading_lots" ? (window._rrDemoLots || []) : t === "grading_stage_events" ? [] : orig.call(api, t))(api.select);
    const origUpdate = api.update.bind(api);
    api.update = async (t, id, patch) => t === "grading_lots" ? Object.assign((window._rrDemoLots || []).find((x) => x.id === id), patch) : origUpdate(t, id, patch);
  }

  load().then(draw).catch((e) => { box.textContent = "Couldn't load grading details: " + e.message; });
}

// ------------------------------------------------------------ customer link
/** One block per company on the order (the customer's private link). "" when nothing is at a grader. */
export function gradingCustomerHtml(s) {
  const lots = s.grading_lots || [];
  return lots.map((lot) => {
    const ks = (s.cards || []).filter((k) => k.grading_lot_id === lot.id && k.grader_stage);
    if (!ks.length) return "";
    const G = lot.grader;
    // Where the package is: the card furthest behind (on hold is shown separately).
    const idxs = ks.filter((k) => k.grading_stage !== "on_hold").map((k) => normalIndex(k.grading_stage)).filter((i) => i >= 0);
    const idx = idxs.length ? Math.min(...idxs) : -1;
    const hold = ks.filter((k) => k.grading_stage === "on_hold");
    const when = {};
    ks.forEach((k) => (k.grading_history || []).forEach((h) => { if (h.grader === G && !when[h.grading_stage]) when[h.grading_stage] = h.at; }));
    const lead = ks.find((k) => normalIndex(k.grading_stage) === idx) || ks[0];
    const official = lead && !isRR(lead.grader_stage) ? stageLabel(lead.grader_stage) : "";
    const cur = idx >= 0 ? NORMAL[idx][1] : hold.length ? ON_HOLD_LABEL : "";
    const h = halves(lot.est_fee);
    const paidLine = (label, amt, at, dueTxt) => `<p>${label}${amt != null ? `: <b>${money(amt)}</b>` : ""}${at ? " — paid ✓" : dueTxt ? ` — ${dueTxt}` : ""}</p>`;
    const extra = (Number(lot.return_shipping) || 0) + (Number(lot.upcharge) || 0);
    return `<div class="psa-cust"><div class="lbl">${esc(G)} SUBMISSION</div>
      <div class="now">${esc(cur)}${official && official !== cur ? ` <span class="muted small">— ${esc(G)}: ${esc(official)}</span>` : ""}</div>
      ${hold.length ? `<p><b>${esc(ON_HOLD_LABEL)}</b>${hold.length < ks.length ? ` (${hold.map((k) => esc(k.name || "Card " + k.card_number)).join(", ")})` : ""}</p>` : ""}
      <ol class="psa-track">${NORMAL.map(([k, l], i) => { const done = i < idx || (i === idx && i === NORMAL.length - 1);
        return `<li class="${done ? "done" : i === idx ? "current" : ""}"><span class="dot">${done ? "✓" : ""}</span>${esc(l)}${when[k] && i <= idx
          ? ` <span class="when">${esc(fmtDate(when[k]))}</span>` : ""}</li>`; }).join("")}</ol>
      ${lot.grader_order_no ? `<p>${esc(G)} order #: <b>${esc(lot.grader_order_no)}</b></p>` : ""}
      ${lot.ship_tracking ? `<p>Tracking to ${esc(G)}: <b>${esc(lot.ship_tracking)}</b></p>` : ""}
      ${lot.return_tracking ? `<p>Return tracking: <b>${esc(lot.return_tracking)}</b></p>` : ""}
      ${lot.notes ? `<p>${esc(lot.notes)}</p>` : ""}
      <ul class="psa-cards-c">${ks.map((k) => `<li>${esc(k.name || "Card " + k.card_number)}${k.grade_level ? ` · ${esc(G)} ${esc(k.grade_level)}` : ""}${k.grade_result
        ? ` — <b>${esc(k.grade_result)}</b>` : ""}${k.cert_no ? ` (cert #${esc(k.cert_no)})` : ""}</li>`).join("")}</ul>
      ${h ? `<p>Estimated ${esc(G)} fee: <b>${money(h.est)}</b></p>` : ""}
      ${paidLine(`${esc(G)}'s fee, first 50% (when shipped to ${esc(G)})`, h && h.first, lot.first_half_paid_at, idx >= 0 ? "due" : "")}
      ${paidLine(`${esc(G)}'s fee, the other 50%`, h && h.second, lot.second_half_paid_at,
        lot.balance_due_on ? `due ${esc(dayText(lot.balance_due_on))}` : "due 14 days after shipping")}
      ${extra ? paidLine("Final invoice (return shipping + upcharges)", extra, lot.final_paid_at, "due when grades are in") : ""}
    </div>`;
  }).join("");
}
