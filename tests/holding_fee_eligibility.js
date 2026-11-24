// The holding-fee notice is decided in apps-script/Code.gs (hourly trigger).
// This loads that file and checks the pure decision: one card at a time,
// Completed cards never qualify, and the dollar total follows whoever remains.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const code = fs.readFileSync(path.join(__dirname, "../apps-script/Code.gs"), "utf8");
const context = {
  console,
  Utilities: {
    formatDate(d) {
      const p = (n) => String(n).padStart(2, "0");
      return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
    },
  },
};
vm.createContext(context);
vm.runInContext(code, context);

const {
  holdingFeePlan_, holdingFeeEligible_, holdingFeeAmounts_, portalCompletedMap_,
  portalToSheetStage_, isCompletedCardStatus_, READY_STAGE, FINAL_STAGE, FEE_PER_CARD_PER_DAY,
} = context;

let failed = 0;
function check(name, cond) {
  if (cond) console.log("ok  " + name);
  else { failed++; console.error("FAIL " + name); }
}

const readyOn = (daysAgo) => {
  const d = new Date(Date.UTC(2026, 9, 31, 12, 0, 0)); // 2026-10-31
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
};
const now = new Date(Date.UTC(2026, 9, 31, 12, 0, 0));

function row(partial) {
  return Object.assign({
    id: "RR-1042", status: READY_STAGE, num: 1, card: "Card",
    completed: readyOn(30), r25: "", r30: "", row: 2, orderStatus: "ready",
  }, partial);
}

check("portal completed is a finished card", isCompletedCardStatus_("completed") === true);
check("sheet finished stage is a finished card", isCompletedCardStatus_(FINAL_STAGE) === true);
check("legacy complete (no d) is still Ready", isCompletedCardStatus_("complete") === false);
check("legacy complete maps to the ready stage", context.canonicalStatus_("complete") === READY_STAGE);
check("picked up legacy name is finished", isCompletedCardStatus_("picked up") === true);

check("a ready card is eligible", holdingFeeEligible_(READY_STAGE, "RR-1042", 1, null) === true);
check("a completed card is not eligible", holdingFeeEligible_("completed", "RR-1042", 1, null) === false);
check("portal map knocks out a sheet-ready card",
  holdingFeeEligible_(READY_STAGE, "RR-1042", 2, { "RR-1042|2": true }) === false);
check("a different card number stays eligible",
  holdingFeeEligible_(READY_STAGE, "RR-1042", 1, { "RR-1042|2": true }) === true);

const mixed = holdingFeePlan_([
  row({ num: 1, card: "Still here" }),
  row({ num: 2, card: "Done in portal", status: "completed" }),
  row({ num: 3, card: "Done on sheet", status: FINAL_STAGE }),
  row({ num: 4, card: "Portal says done", status: READY_STAGE }),
], now, portalCompletedMap_([{ card_number: 4, submissions: { code: "RR-1042" } }]));

check("one holding-fee group for the order", mixed.r30.length === 1);
check("only the still-ready card is listed",
  mixed.r30[0].items.length === 1 && mixed.r30[0].items[0].num === 1);
check("no day-25 notice once day 30 is reached", mixed.r25.length === 0);

const none = holdingFeePlan_([
  row({ num: 1, status: "completed" }),
  row({ num: 2, status: FINAL_STAGE }),
], now, null);
check("no email when every card is completed", none.r30.length === 0 && none.r25.length === 0);

const orderStillOpen = holdingFeePlan_([
  row({ num: 1, status: "completed", orderStatus: "ready" }),
  row({ num: 2, status: READY_STAGE, orderStatus: "ready" }),
], now, null);
check("order status is not what qualifies a card",
  orderStillOpen.r30.length === 1 && orderStillOpen.r30[0].items.length === 1
  && orderStillOpen.r30[0].items[0].num === 2);

const amounts = holdingFeeAmounts_(orderStillOpen.r30[0].items.length);
check("daily total is $1 for the one remaining card",
  amounts.daily === 1 && amounts.n === 1 && FEE_PER_CARD_PER_DAY === 1);
const both = holdingFeeAmounts_(2);
check("two eligible cards are $2/day, cap unchanged",
  both.daily === 2 && both.max === 2 * 30);

const early = holdingFeePlan_([
  row({ num: 1, completed: readyOn(25) }),
  row({ num: 2, status: "completed", completed: readyOn(25) }),
], now, null);
check("day-25 reminder also skips a completed card",
  early.r25.length === 1 && early.r25[0].items.length === 1 && early.r30.length === 0);

const stamped = holdingFeePlan_([row({ r30: new Date() })], now, null);
check("a notice already sent is not sent again", stamped.r30.length === 0);

const working = holdingFeePlan_([row({ status: "In Progress" })], now, null);
check("a card that is not ready is not billed", working.r30.length === 0);

check("portal completed maps to the sheet's finished stage",
  portalToSheetStage_("completed") === FINAL_STAGE);
check("portal ready maps to Ready to Ship / Pick Up",
  portalToSheetStage_("ready") === READY_STAGE);

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("all holding-fee checks passed");
