// Work portal: "Return shipping" panel on a submission — buy the card-return label with Shippo, see tracking.
// Shares ../shipping.js with the shop admin's Shipping page (same queue, rates, labels and tracking).
import * as SHIP from "../shipping.js";
import * as DS from "./demostore.js";
import { esc, $, toast, fmtDateTime } from "./common.js";

const money = (n) => "$" + Number(n || 0).toFixed(2);
const sub = (id) => DS.db().submissions.find((x) => x.id === id);

export const returnPanel = () => `<div class="panel" id="retship" style="margin-top:14px"></div>`;

export function wireReturn(s, onChange) {
  const box = $("#retship"); if (!box) return;
  const draw = () => {
    const cur = sub(s.id) || s, sh = cur.return_shipment, a = SHIP.returnAddressOf(cur) || {};
    if (!SHIP.shipsBack(cur)) {
      box.innerHTML = `<div class="row"><h3 class="grow" style="margin:0">Return shipping</h3></div><p class="muted small" style="margin:6px 0 0">Austin drop-off — the customer picks the cards up, no label needed.</p>`;
      return;
    }
    if (sh) {
      box.innerHTML = `<div class="row"><h3 class="grow" style="margin:0">Return shipping</h3><span class="pill">${esc(SHIP.statusLabel(sh))}</span></div>
        <p style="margin:8px 0 4px">${SHIP.trackingLink(sh)} · ${esc(sh.service)} · ${money(sh.cost)}${sh.insured ? ` · insured ${money(sh.insured)}` : ""}${sh.test ? " · test label" : ""}</p>
        <p class="muted small" style="margin:0">${esc(sh.status_details || "")}${sh.eta && sh.status !== "DELIVERED" ? ` · ETA ${fmtDateTime(sh.eta)}` : ""}</p>
        ${(sh.events || []).length ? `<ul class="small muted" style="margin:8px 0 0;padding-left:18px">${sh.events.slice().reverse().map((e) => `<li>${fmtDateTime(e.at)} — ${esc(e.details)}${e.location ? ` (${esc(e.location)})` : ""}</li>`).join("")}</ul>` : ""}
        <div class="row" style="margin-top:10px"><button class="btn sm" id="rlabel">Print label</button>
          ${sh.status === "PRE_TRANSIT" ? `<button class="btn sm danger" id="rvoid">Void label</button>` : ""}
          ${sh.status !== "DELIVERED" && SHIP.shipCfg().shippo.mode === "demo" ? `<button class="btn sm" id="rscan" title="Demo: stands in for Shippo's tracking webhook">Simulate carrier scan</button>` : ""}
          <a class="btn sm" href="../admin.html#/ship" target="_blank">All shipping ↗</a></div>
        <p class="muted small" style="margin:8px 0 0">The customer sees this tracking on their private link. When it's delivered the submission moves to Completed by itself.</p>`;
      $("#rlabel").onclick = () => SHIP.openLabel(sh);
      $("#rvoid") && ($("#rvoid").onclick = async () => { if (!confirm(`Void label ${sh.tracking}? Shippo refunds unused labels.`)) return; await SHIP.voidLabel("return", s.id, sh); toast("Label voided."); draw(); onChange && onChange(); });
      $("#rscan") && ($("#rscan").onclick = () => { SHIP.applyTracking("return", s.id, sh, SHIP.nextScan(sh)); draw(); onChange && onChange(); });
      return;
    }
    const row = SHIP.returnRow(cur), boxes = SHIP.shipCfg().boxes;
    box.innerHTML = `<div class="row"><h3 class="grow" style="margin:0">Return shipping</h3><span class="muted small">Shippo${SHIP.shipCfg().shippo.mode === "demo" ? " · demo" : ""}</span></div>
      <div class="grid2" style="margin-top:6px"><div><label class="f">Ship to (return address)</label>
          <input type="text" id="ra1" placeholder="Street" value="${esc(a.line1 || "")}">
          <input type="text" id="ra2" placeholder="Apt / suite (optional)" value="${esc(a.line2 || "")}" style="margin-top:6px">
          <div class="row" style="margin-top:6px;flex-wrap:nowrap"><input type="text" id="rcity" placeholder="City" value="${esc(a.city || "")}">
            <input type="text" id="rst" placeholder="ST" value="${esc(a.state || "")}" style="max-width:70px"><input type="text" id="rzip" placeholder="ZIP" value="${esc(a.zip || "")}" style="max-width:100px"></div></div>
        <div><label class="f">Box</label><select id="rbox">${boxes.map((b) => `<option value="${b.key}" ${b.key === row.box ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select>
          <div class="grid2"><div><label class="f">Weight (oz)</label><input type="text" id="roz" value="${row.oz}" inputmode="decimal"></div>
            <div><label class="f">Insure for $</label><input type="text" id="rins" value="${row.insured || ""}" placeholder="—" inputmode="decimal"></div></div></div></div>
      <div class="row" style="margin-top:10px"><button class="btn gold sm" id="rrates">Get rates</button>
        <span class="muted small">${cur.status === "ready" ? "Ready to ship — this is also on the shop admin's Shipping list." : "You can buy it now, or set the status to “Ready for pickup / shipping” to queue it."}</span></div>
      <div id="rw" style="margin-top:10px"></div>`;
    $("#rrates").onclick = () => {
      const addr = { line1: $("#ra1").value.trim(), line2: $("#ra2").value.trim(), city: $("#rcity").value.trim(), state: $("#rst").value.trim().toUpperCase(), zip: $("#rzip").value.trim() };
      const live = sub(s.id); if (live) { live.return_address = addr; DS.save(); }
      Object.assign(row, { address: addr, box: $("#rbox").value, oz: Math.max(1, Math.ceil(+$("#roz").value || row.oz)), insured: Math.round(+$("#rins").value || 0) });
      SHIP.rateWidget($("#rw"), row, { btn: "gold", onDone: () => { toast("Return label bought — tracking is on the customer's link."); draw(); onChange && onChange(); } });
    };
  };
  draw();
}

/** Customer view (view.html): tracking for cards on their way back. */
export function customerReturnHtml(s) {
  const sh = s.return_shipment; if (!sh || sh.status === "VOIDED") return "";
  const done = sh.status === "DELIVERED";
  return `<div class="panel" style="margin-top:12px;border-left:3px solid ${done ? "#4ade80" : "var(--gold)"}">
    <b>${done ? "Your cards were delivered" : "Your cards are on the way back"}</b> <span class="pill">${esc(SHIP.statusLabel(sh))}</span>
    <div class="muted small" style="margin-top:4px">${esc(sh.service)} · ${SHIP.trackingLink(sh)}${sh.eta && !done ? ` · estimated ${fmtDateTime(sh.eta).replace(/,? \d+:\d+.*$/, "")}` : ""}</div></div>`;
}
