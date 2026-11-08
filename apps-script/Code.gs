/*******************************************************************
 * RESTORED RARITY — Submission backend
 * Version: 2026-11-04 (branded emails + pickup reminders + automatic quotes + portal reviews)
 *
 * What this does
 *  • Saves website submissions to the "Submissions" + "Cards" tabs
 *  • Emails the customer a branded confirmation with their reference number
 *  • Emails YOU a branded alert for every new submission
 *  • Each card has its own Status dropdown on the Cards tab. When you
 *    change it, the customer is emailed about that card automatically
 *    and the tracker on the website updates
 *  • The Submissions tab's Status column fills itself in with the
 *    overall progress (the stage of the furthest-behind card)
 *  • Powers the "Track Your Submission" lookup on the website
 *  • When a card is "Ready to Ship / Pick Up", reminds the customer at day 25
 *    and sends the holding-fee notice at day 30 ($1/card/day, forfeiture at day 60).
 *    Setting the card to "Order Completed / Picked Up / Shipped" stops reminders.
 *  • All emails use the Restored Rarity logo + site colors (upload email-logo.jpg
 *    to the website repo next to index.html)
 *  • Works out a price quote for every submission from the price list
 *    (Cards: Quote / Quote Breakdown / Price Override; Submissions:
 *    Quote Subtotal … Quote Total). Type a discount in "Your Discount"
 *    (10% or 15). The quote is in your new-submission email.
 *  • Keeps the existing Reviews + Referral Codes features
 *
 * ONE-TIME SETUP: make sure "setup" is selected in the function menu at
 * the top of the editor and click Run. Approve the permissions. Then
 * redeploy (Deploy → Manage deployments → pencil → New version → Deploy).
 * After that, the sheet has a "Restored Rarity" menu that re-runs setup.
 *******************************************************************/

/* =================================================================
 *  ONE-TIME SETUP  — select "setup" above and click Run
 * ================================================================= */
function setup() {
  var t0 = Date.now();
  var step = function (msg) { console.log('[' + Math.round((Date.now() - t0) / 1000) + 's] ' + msg); };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('This script is not attached to your spreadsheet. Open the Google Sheet and use Extensions → Apps Script, then paste the code there.');
  var subSheet = ss.getSheetByName(SUBMISSIONS_TAB);
  var cardSheet = ss.getSheetByName(CARDS_TAB);
  if (!subSheet) throw new Error('Could not find a tab named "' + SUBMISSIONS_TAB + '". Check the tab names at the bottom of the sheet (spelling and capitals must match).');
  if (!cardSheet) throw new Error('Could not find a tab named "' + CARDS_TAB + '". Check the tab names at the bottom of the sheet (spelling and capitals must match).');

  // 1) Email trigger (replaces any older copy so it never runs twice)
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onStatusEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onStatusEdit').forSpreadsheet(ss).onEdit().create();
  step('Email trigger ready');

  // 1b) Hourly pickup-reminder check (day 25 / day 30)
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runPickupReminders') ScriptApp.deleteTrigger(t);
  });
  if (SEND_PICKUP_REMINDERS) ScriptApp.newTrigger('runPickupReminders').timeBased().everyHours(1).create();
  step('Pickup reminder trigger ' + (SEND_PICKUP_REMINDERS ? 'ready' : 'off'));

  // 2) History tab
  historySheet_();
  step('"' + HISTORY_TAB + '" tab ready');

  // 3) Headers on the Cards tab (J–R) and Submissions (N)
  cardSheet.getRange(1, CC.STATUS, 1, CARD_HEADERS.length).setValues([CARD_HEADERS]).setFontWeight('bold');
  subSheet.getRange(1, SC.STATUS_UPDATED).setValue('Status Updated').setFontWeight('bold');
  step('Headers ready');

  // 4) Fill in existing card rows (no emails are sent for these)
  var subRows = lastDataRow_(subSheet, SC.ID);
  var subStatus = {};
  if (subRows >= 2) {
    subSheet.getRange(2, 1, subRows - 1, SC.STATUS).getValues().forEach(function (r) {
      if (r[SC.ID - 1]) subStatus[String(r[SC.ID - 1])] = canonicalStatus_(r[SC.STATUS - 1]);
    });
  }
  var cardRows = lastDataRow_(cardSheet, CC.ID);
  if (cardRows >= 2) {
    var range = cardSheet.getRange(2, 1, cardRows - 1, CC.LAST_EMAILED);
    var rows = range.getValues();
    var now = new Date();
    rows.forEach(function (r) {
      var id = String(r[CC.ID - 1] || '');
      if (!id) return;
      var s = r[CC.STATUS - 1] ? canonicalStatus_(r[CC.STATUS - 1]) : (subStatus[id] || STAGES[0]);
      r[CC.STATUS - 1] = s;
      if (!r[CC.UPDATED - 1]) r[CC.UPDATED - 1] = now;
      if (!r[CC.LAST_EMAILED - 1]) r[CC.LAST_EMAILED - 1] = s;
    });
    range.setValues(rows);
  }
  step('Existing cards updated (' + Math.max(0, cardRows - 1) + ')');

  // 5) Status dropdown on the Cards tab: existing rows + 500 spare rows
  var dropRows = Math.max(cardRows, 1) + 500 - 1;
  if (cardSheet.getMaxRows() < dropRows + 1) cardSheet.insertRowsAfter(cardSheet.getMaxRows(), dropRows + 1 - cardSheet.getMaxRows());
  cardSheet.getRange(2, CC.STATUS, dropRows, 1).setDataValidation(statusRule_());
  cardSheet.getRange(2, CC.UPDATED, dropRows, 1).setNumberFormat('m/d/yyyy h:mm am/pm');
  cardSheet.getRange(2, CC.COMPLETED, dropRows, 3).setNumberFormat('m/d/yyyy h:mm am/pm');
  cardSheet.getRange(2, CC.FEE_START, dropRows, 1).setNumberFormat('m/d/yyyy');
  step('Card Status dropdowns added to Cards rows 2–' + (dropRows + 1));

  // 6) Submissions Status is now automatic: remove any dropdown there and recalculate
  var subClear = Math.min(subSheet.getMaxRows() - 1, Math.max(subRows, 1) + 500);
  if (subClear > 0) subSheet.getRange(2, SC.STATUS, subClear, 1).clearDataValidations();
  Object.keys(subStatus).forEach(function (id) { updateOverallStatus_(id); });
  SpreadsheetApp.flush();
  step('Submissions overall status recalculated');

  // 7) Quote columns (added after the last column, found by header name) + quotes for every submission
  QUOTE_CARD_HEADERS_.forEach(function (h) { quoteCol_(cardSheet, h); });
  QUOTE_SUB_HEADERS_.forEach(function (h) { quoteCol_(subSheet, h); });
  cardSheet.getRange(2, quoteCol_(cardSheet, 'Price Override'), dropRows, 1).setNumberFormat(QUOTE_MONEY_FORMAT);
  subSheet.getRange(2, quoteCol_(subSheet, 'Your Discount'), Math.max(subRows, 1) + 500, 1).setNumberFormat('@');
  var nq = recalcAllQuotes();
  SpreadsheetApp.flush();
  step('Quotes calculated (' + nq + ' submissions)');

  var msg = 'Setup complete. Each card on the Cards tab has a Status dropdown (including "' + FINAL_STAGE + '"), customers are emailed when you change one, ' +
            'pickup reminders go out at day ' + REMINDER_DAY + ' and day ' + HOLDING_DAY + ', and every submission has an automatic quote.';
  console.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (ignore) {}
}

// ─── Settings you can change ──────────────────────────────────────
var SITE_URL      = 'https://restoredraritytcg.com';
var BUSINESS_NAME = 'Restored Rarity';
var OWNER_EMAIL   = '';   // leave blank to use the Google account that owns this script
var SEND_CUSTOMER_EMAILS = true;   // set to false to pause all customer emails
var SEND_OWNER_ALERTS    = true;   // set to false to stop new-submission alerts to you
var BUSINESS_EMAIL = 'restoredraritytcg@gmail.com';
var BUSINESS_PHONE = '(281) 814-1968';
var INSTAGRAM      = 'restored.raritytcg';
var TIMEZONE       = 'America/Chicago';
// Logo at the top of every email. Upload email-logo.jpg to the website repo (next to
// index.html) so it's live at this address. Leave '' for a text-only header.
var LOGO_URL       = 'https://restoredraritytcg.com/email-logo.jpg';
var TERMS_EFFECTIVE = 'October 19, 2026';   // update when you publish new Terms
var TERMS_SECTION   = 'Section 29 of the Restored Rarity Terms & Conditions';

// Pickup reminders for cards left at "Ready to Ship / Pick Up"
var SEND_PICKUP_REMINDERS = true;  // set to false to pause the day-25 / day-30 emails
var REMINDER_DAY = 25;             // friendly reminder
var HOLDING_DAY  = 30;             // holding fee notice; fees start the next day
var FORFEIT_DAY  = 60;             // cards may be forfeited after this
var FEE_PER_CARD_PER_DAY = 1;

// The stages, in order. These become the dropdown on the Cards tab.
var STAGES = [
  'Submission Received',
  'Assessment Complete',
  'In Queue',
  'In Progress',
  'Stabilizing',
  'Ready to Ship / Pick Up',
  'Order Completed / Picked Up / Shipped'
];
var READY_STAGE = 'Ready to Ship / Pick Up';
var FINAL_STAGE = 'Order Completed / Picked Up / Shipped';
// Extra statuses that sit outside the normal flow.
var SIDE_STATUSES = ['On Hold', 'Cancelled'];

// Older status names are converted to the new ones automatically.
var LEGACY_STATUS = {
  'new': 'Submission Received', 'submitted': 'Submission Received',
  'approved to send': 'Assessment Complete', 'cards received': 'In Queue',
  'in restoration': 'In Progress', 'quality check': 'Stabilizing', 'awaiting payment': 'Stabilizing',
  'shipped / ready for pickup': 'Ready to Ship / Pick Up', 'complete': 'Ready to Ship / Pick Up',
  'shipped': 'Order Completed / Picked Up / Shipped', 'picked up': 'Order Completed / Picked Up / Shipped',
  'order completed': 'Order Completed / Picked Up / Shipped', 'order complete': 'Order Completed / Picked Up / Shipped'
};

// What the customer email says about a card at each stage.
// {ref}, {delivery} and {final} are filled in automatically. null = no email for that stage.
var STAGE_EMAILS = {
  'Submission Received': null, // the confirmation email covers this one
  'Assessment Complete': 'I’ve finished assessing this card. Any details about your quote or the work planned are in the note. ' +
                         'If you haven’t sent your cards in yet, you’re now cleared to ship them — pack them in sleeves and toploaders ' +
                         '(or semi-rigids) and include a slip of paper with your reference number <b>{ref}</b>.',
  'In Queue':            'This card is checked in and in the restoration queue. I’ll let you know as soon as work begins.',
  'In Progress':         'This card is on the bench and restoration is underway.',
  'Stabilizing':         'The hands-on work is done. This card is now stabilizing so the restoration sets properly before it heads back to you.',
  'Ready to Ship / Pick Up': 'This card is finished and ready to come home! {delivery}',
  'Order Completed / Picked Up / Shipped': 'Your order for this card is complete. {final}',
  'On Hold':             'This card is temporarily on hold. I’ll reach out with details, or you can reply to this email with any questions.',
  'Cancelled':           'Work on this card has been cancelled. If this is unexpected, reply to this email and I’ll sort it out.'
};

// ─── Sheet layout (don't change unless you move columns) ─────────
var SUBMISSIONS_TAB = 'Submissions';
var CARDS_TAB       = 'Cards';
var HISTORY_TAB     = 'Card Status History';
// Submissions tab
var SC = {
  TIMESTAMP: 1, ID: 2, NAME: 3, EMAIL: 4, PHONE: 5, DELIVERY: 6, ADDRESS: 7,
  INSURED: 8, TERMS: 9, STATUS: 10, CARD_COUNT: 11, REF_CODE: 12, REF_DISCOUNT: 13,
  STATUS_UPDATED: 14    // N — overall status is filled in automatically
};
// Cards tab
var CC = {
  ID: 1, NUM: 2, NAME: 3, VALUE: 4, SERVICE: 5, NOTES: 6, FRONT: 7, BACK: 8, DETAILS: 9,
  STATUS: 10,           // J — the dropdown you change
  UPDATED: 11,          // K — filled in automatically
  NOTE: 12,             // L — message to the customer about this card (type it BEFORE changing Status)
  TRACKING: 13,         // M — return tracking number
  LAST_EMAILED: 14,     // N — used by the script so a stage is never emailed twice
  COMPLETED: 15,        // O — when the card was set to Ready (starts the pickup clock)
  R25: 16,              // P — day-25 pickup reminder sent
  R30: 17,              // Q — day-30 holding fee notice sent
  FEE_START: 18         // R — date holding fees begin
};
var CARD_HEADERS = ['Status', 'Status Updated', 'Note to Customer', 'Return Tracking #', 'Last Emailed Status',
                    'Ready Notice Sent', '25-Day Reminder Sent', '30-Day Notice Sent', 'Holding Fee Starts'];


/* =================================================================
 *  WEB APP: POST (new submissions + reviews)
 * ================================================================= */
function doPost(e) {
  if (!e || !e.postData) {
    throw new Error('doPost only runs when the website sends a submission. To set things up, pick "setup" in the function menu and click Run.');
  }
  try {
    var record = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Reviews
    if (record.type === 'review') {
      var rvSheet = ss.getSheetByName('Reviews');
      rvSheet.appendRow([new Date(), record.name || '', record.rating || '', record.card || '', record.text || '', 'NO']);
      return json_({ success: true });
    }
        if (record.type === 'statusEmail') return json_(portalStatusEmail_(record));
    if (record.type === 'portalQuote') return json_(portalQuote_(record));
    if (record.type === 'portalReviews') return json_(portalReviews_(record));

    // Submissions
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    var ref, refCode, refValid, quote = null;
    try {
      var subSheet = ss.getSheetByName(SUBMISSIONS_TAB);
      var cardSheet = ss.getSheetByName(CARDS_TAB);
      var timestamp = new Date();
      refCode = String(record.referralCode || '').trim().toUpperCase();
      refValid = refCode && isValidReferralCode(refCode);
      ref = refFromId_(record.id || '');
      var firstStage = STAGES[0];

      subSheet.appendRow([
        timestamp, record.id || '', record.name || '', record.email || '', record.phone || '',
        record.deliveryMethod || '', record.address || '', record.insuredShipping ? 'Yes' : 'No',
        record.agreedToTerms ? 'Yes' : 'No', firstStage, (record.cards || []).length,
        refCode, refValid ? referralPctText_() : '', timestamp
      ]);

      (record.cards || []).forEach(function (card, i) {
        var details = (card.photos && card.photos.details || []).join(', ');
        cardSheet.appendRow([
          record.id || '', i + 1, card.card || '', card.value || '', card.service || '', card.notes || '',
          (card.photos && card.photos.front) || '', (card.photos && card.photos.back) || '', details,
          firstStage, timestamp, '', '', firstStage
        ]);
        applyDropdown_(cardSheet, cardSheet.getLastRow());
        logHistory_(record.id || '', i + 1, card.card || '', firstStage, 'Submitted on website');
      });
      try { quote = recalcQuote_(record.id || ''); } catch (err) { console.error('Quote failed: ' + err); }
    } finally {
      lock.releaseLock();
    }

    // Emails never block a submission — if one fails it's just logged.
    try { sendConfirmationEmail_(record, ref); } catch (err) { console.error('Confirmation email failed: ' + err); }
    try { sendOwnerAlert_(record, ref, refValid ? refCode : '', quote); } catch (err) { console.error('Owner alert failed: ' + err); }

    return json_({ success: true, id: record.id, ref: ref });
  } catch (err) {
    return json_({ success: false, error: err.toString() });
  }
}


/* =================================================================
 *  WEB APP: GET (referral codes, reviews, tracking)
 * ================================================================= */
function doGet(e) {
  if (!e || !e.parameter) {
    throw new Error('doGet only runs when the website asks for data. To set things up, pick "setup" in the function menu and click Run.');
  }
  try {
    var action = e.parameter.action;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (action === 'referralCodes') {
      return json_({ success: true, codes: getActiveReferralCodes() });
    }

    if (action === 'reviews') {
      var rvSheet = ss.getSheetByName('Reviews');
      var reviews = [];
      if (rvSheet && rvSheet.getLastRow() > 1) {
        rvSheet.getRange(2, 1, rvSheet.getLastRow() - 1, 6).getValues().forEach(function (r) {
          if (String(r[5]).trim().toUpperCase() === 'YES') reviews.push({ name: r[1], rating: r[2], card: r[3], text: r[4] });
        });
      }
      return json_({ success: true, reviews: reviews });
    }

    if (action === 'track') {
      return json_(trackSubmission_(e.parameter.ref || '', e.parameter.email || ''));
    }
        if (action === 'portalEmails') return json_({ success: true, version: 1, quotes: true, reviews: true });

    return json_({ success: false, error: 'Unknown action' });
  } catch (err) {
    return json_({ success: false, error: err.toString() });
  }
}

function trackSubmission_(refInput, emailInput) {
  var notFound = { success: false, error: 'We couldn’t find a submission matching that reference number and email.' };
  var wantRef = normRef_(refInput);
  var wantEmail = String(emailInput || '').trim().toLowerCase();
  if (!wantRef || !wantEmail) return notFound;

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBMISSIONS_TAB);
  var last = sheet.getLastRow();
  if (last < 2) return notFound;
  var rows = sheet.getRange(2, 1, last - 1, SC.STATUS_UPDATED).getValues();

  for (var i = rows.length - 1; i >= 0; i--) {
    var r = rows[i];
    var id = String(r[SC.ID - 1] || '');
    if (!id) continue;
    if (normRef_(refFromId_(id)) !== wantRef) continue;
    if (String(r[SC.EMAIL - 1] || '').trim().toLowerCase() !== wantEmail) continue;

    var history = getHistoryFor_(id);
    var cards = getCardsFor_(id).map(function (c) {
      return {
        num: c.num, card: c.card, service: c.service, status: c.status,
        stageIndex: STAGES.indexOf(c.status), updated: isoOrBlank_(c.updated),
        note: c.note, tracking: c.tracking,
        history: history.filter(function (h) { return String(h.num) === String(c.num); })
                        .map(function (h) { return { status: h.status, at: h.at }; })
      };
    });
    var overall = overallStatus_(cards.map(function (c) { return c.status; })) || canonicalStatus_(r[SC.STATUS - 1]);
    return {
      success: true,
      ref: refFromId_(id),
      name: firstName_(r[SC.NAME - 1]),
      status: overall,
      stageIndex: STAGES.indexOf(overall),
      stages: STAGES,
      submitted: isoOrBlank_(r[SC.TIMESTAMP - 1]),
      updated: isoOrBlank_(r[SC.STATUS_UPDATED - 1] || r[SC.TIMESTAMP - 1]),
      delivery: String(r[SC.DELIVERY - 1] || ''),
      cards: cards
    };
  }
  return notFound;
}


/* =================================================================
 *  CARD STATUS CHANGES  (installable trigger — created by setup())
 *  Type the "Note to Customer" first, then change the card's Status.
 * ================================================================= */
function onStatusEdit(e) {
  if (!e || !e.range) { console.log('onStatusEdit runs automatically when you change a card Status. Nothing to do when run by hand.'); return; }
  var sheet = e.range.getSheet();
  try { quoteOnEdit_(e); } catch (err) { console.error('Quote update failed: ' + err); }
  if (sheet.getName() !== CARDS_TAB) return;

  var firstCol = e.range.getColumn();
  var lastCol = firstCol + e.range.getNumColumns() - 1;
  if (CC.STATUS < firstCol || CC.STATUS > lastCol) return;

  var firstRow = Math.max(2, e.range.getRow());
  var lastRow = e.range.getRow() + e.range.getNumRows() - 1;
  if (lastRow < firstRow) return;

  var rows = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, CC.LAST_EMAILED).getValues();
  var now = new Date();
  var changesById = {};
  var order = [];

  rows.forEach(function (v, i) {
    var row = firstRow + i;
    var id = String(v[CC.ID - 1] || '');
    var raw = String(v[CC.STATUS - 1] || '').trim();
    if (!id || !raw) return;
    var status = canonicalStatus_(raw);
    if (STAGES.indexOf(status) === -1 && SIDE_STATUSES.indexOf(status) === -1) return;

    sheet.getRange(row, CC.UPDATED).setValue(now);
    if (status === String(v[CC.LAST_EMAILED - 1] || '').trim()) return;

    var note = String(v[CC.NOTE - 1] || '');
    logHistory_(id, v[CC.NUM - 1], v[CC.NAME - 1], status, note);
    sheet.getRange(row, CC.LAST_EMAILED).setValue(status);
    if (status === READY_STAGE) {
      // Start (or restart) the pickup clock for this card.
      sheet.getRange(row, CC.COMPLETED).setValue(now);
      sheet.getRange(row, CC.R25, 1, 3).clearContent();
    }
    if (!changesById[id]) { changesById[id] = []; order.push(id); }
    changesById[id].push({
      num: v[CC.NUM - 1], card: String(v[CC.NAME - 1] || 'Card'), status: status,
      note: note, tracking: String(v[CC.TRACKING - 1] || '')
    });
  });

  order.forEach(function (id) {
    try {
      var sub = updateOverallStatus_(id);
      if (sub && SEND_CUSTOMER_EMAILS && sub.email) sendCardUpdateEmail_(sub, changesById[id]);
    } catch (err) {
      console.error('Update for ' + id + ' failed: ' + err);
    }
  });
}

/** Sets the Submissions row's Status to the overall progress. Returns the submission's info. */
function updateOverallStatus_(id) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var subSheet = ss.getSheetByName(SUBMISSIONS_TAB);
  var last = subSheet.getLastRow();
  if (last < 2) return null;
  var ids = subSheet.getRange(2, SC.ID, last - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) !== id) continue;
    var row = i + 2;
    var v = subSheet.getRange(row, 1, 1, SC.STATUS_UPDATED).getValues()[0];
    var cards = getCardsFor_(id);
    var overall = overallStatus_(cards.map(function (c) { return c.status; }));
    if (overall && overall !== v[SC.STATUS - 1]) {
      subSheet.getRange(row, SC.STATUS).setValue(overall);
      subSheet.getRange(row, SC.STATUS_UPDATED).setValue(new Date());
    }
    return {
      id: id, ref: refFromId_(id), name: v[SC.NAME - 1], email: String(v[SC.EMAIL - 1] || '').trim(),
      delivery: String(v[SC.DELIVERY - 1] || ''), overall: overall, cards: cards
    };
  }
  return null;
}

/** Overall = the stage of the furthest-behind active card. */
function overallStatus_(statuses) {
  var active = statuses.filter(function (s) { return s && s !== 'Cancelled'; });
  if (!statuses.length) return '';
  if (!active.length) return 'Cancelled';
  if (active.indexOf('On Hold') !== -1) return 'On Hold';
  var min = STAGES.length - 1;
  active.forEach(function (s) { var k = STAGES.indexOf(s); if (k !== -1 && k < min) min = k; });
  return STAGES[min];
}


/* =================================================================
 *  MENU + DROPDOWN HELPERS
 * ================================================================= */
function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Restored Rarity')
      .addItem('Set up / refresh card status dropdowns', 'setup')
      .addItem('Send me sample emails', 'sendTestEmail')
      .addItem('Run pickup reminders now', 'runPickupReminders')
      .addItem('Recalculate all quotes', 'recalcAllQuotesMenu')
      .addToUi();
  } catch (e) { console.log('Menu is added when the spreadsheet is opened.'); }
}
function statusRule_() {
  return SpreadsheetApp.newDataValidation()
    .requireValueInList(STAGES.concat(SIDE_STATUSES), true)
    .setAllowInvalid(false)
    .setHelpText('Pick a stage for this card. The customer is emailed automatically.')
    .build();
}
function applyDropdown_(sheet, row) {
  try { sheet.getRange(row, CC.STATUS).setDataValidation(statusRule_()); } catch (e) {}
}


/* =================================================================
 *  EMAILS  (all branded: logo, site colors, footer)
 * ================================================================= */
var BRAND = {
  bg: '#070b16', panel: '#0d1730', panel2: '#101d3d', line: '#243468',
  cyan: '#49dbe8', orange: '#f68a1e', yellow: '#ffd23f', white: '#f5f7fb', muted: '#b7c3de'
};

function sendConfirmationEmail_(record, ref) {
  if (!SEND_CUSTOMER_EMAILS || !record.email) return;
  var cards = (record.cards || []);
  var n = cards.length;
  var hand = /hand/i.test(record.deliveryMethod || '');

  var shipBox = callout_(hand
    ? '<p style="margin:0 0 8px;"><b>Hand delivery:</b> I’ll reach out to set up a time and place to hand off ' + (n === 1 ? 'your card' : 'your cards') + '.</p>' +
      '<p style="margin:0;">Please don’t drop off or ship anything until we’ve confirmed the details.</p>'
    : '<p style="margin:0 0 8px;"><b>Please don’t ship your ' + (n === 1 ? 'card' : 'cards') + ' yet.</b></p>' +
      '<p style="margin:0;">Wait until I email you that you’re cleared to send them in, with shipping and packaging instructions. ' +
      'Cards sent before then may arrive before I’m ready to receive them.</p>');

  var steps = [
    ['Review', 'I’ll personally look over your submission and photos.'],
    ['Assessment', 'I’ll email you to confirm services, verified card values and any surcharge, ' +
      (hand ? 'hand-off details' : 'shipping') + ', and an estimated turnaround.'],
    [hand ? 'Hand off' : 'Ship', hand ? 'We meet up and I document your cards on arrival.'
      : 'Once you’re cleared, send your cards in. I document them on arrival.'],
    ['Restore & return', 'You’ll get an email as each card moves through the process, and when it’s ready to come home.']
  ];

  var inner =
    p_('Hi ' + esc_(firstName_(record.name)) + ',') +
    p_('Thanks for choosing ' + BUSINESS_NAME + '! I’ve received your submission of ' + (n === 1 ? '1 card' : n + ' cards') + '.') +
    refBox_(ref) +
    cardTable_(cards.map(function (c, i) {
      return { num: i + 1, card: c.card, right: c.service, sub: c.value ? 'est. value $' + String(c.value).replace(/^\$/, '') : '' };
    }), 'SERVICE') +
    shipBox +
    '<div style="color:' + BRAND.yellow + ';font-weight:bold;margin:18px 0 6px;">What happens next</div>' +
    '<ol style="margin:0 0 16px;padding-left:22px;">' + steps.map(function (s) {
      return '<li style="margin-bottom:6px;"><b>' + esc_(s[0]) + '.</b> ' + s[1] + '</li>';
    }).join('') + '</ol>' +
    trackButton_(ref) +
    '<p style="margin:18px 0 0;color:' + BRAND.muted + ';font-size:13px;">Final pricing is confirmed after evaluation. Questions? Just reply to this email.<br>' +
    'You accepted the ' + BUSINESS_NAME + ' Terms &amp; Conditions (effective ' + esc_(TERMS_EFFECTIVE) + ') with this submission. ' +
    'Read them anytime at ' + link_(SITE_URL, SITE_URL.replace(/^https?:\/\//, '')) + '.</p>';

  sendHtml_(record.email, 'Submission received — ' + BUSINESS_NAME + ' (' + ref + ')', inner,
    'Hi ' + firstName_(record.name) + ', thanks for your submission! Your reference number is ' + ref + '. ' +
    (hand ? 'I’ll reach out to set up a hand-off time.' : 'Please don’t ship your cards until I email you that you’re cleared to send them.') +
    ' Track it here: ' + trackUrl_(ref), 'Submission received!');
}

function sendCardUpdateEmail_(sub, changes) {
  var emailable = changes.filter(function (c) { return STAGE_EMAILS[c.status]; });
  if (!emailable.length) return;

  var hand = /hand/i.test(sub.delivery);
  var pickupBy = fmtDate_(addDays_(new Date(), HOLDING_DAY));
  var deliveryText = function (tracking) {
    return 'Reply to this email to arrange payment and ' + (hand ? 'a pickup time.' : 'return shipping (or an in-person pickup).');
  };
  var finalText = function (tracking) {
    if (tracking) return 'It’s on the way back to you. Tracking number: <b>' + esc_(tracking) + '</b>.';
    return hand ? 'Thanks for picking it up!' : 'It’s been handed off and is on its way back to you.';
  };

  var blocks = emailable.map(function (c) {
    var body = STAGE_EMAILS[c.status]
      .replace(/\{ref\}/g, esc_(sub.ref))
      .replace(/\{delivery\}/g, deliveryText(c.tracking))
      .replace(/\{final\}/g, finalText(c.tracking));
    return '<div style="margin:0 0 14px;padding:14px;background:' + BRAND.panel2 + ';border:1px solid ' + BRAND.line + ';border-radius:8px;">' +
             '<div style="color:' + BRAND.muted + ';font-size:12px;">CARD ' + esc_(c.num) + '</div>' +
             '<div style="color:' + BRAND.white + ';font-size:16px;font-weight:bold;margin:2px 0 6px;">' + esc_(c.card) + '</div>' +
             '<div style="color:' + BRAND.yellow + ';font-size:15px;font-weight:bold;margin:0 0 8px;">' + esc_(c.status) + '</div>' +
             '<div style="font-size:14px;">' + body + '</div>' +
             (c.note ? '<div style="margin-top:10px;padding:10px 12px;border-left:3px solid ' + BRAND.orange + ';background:' + BRAND.panel + ';">' +
               '<div style="color:' + BRAND.orange + ';font-size:11px;margin-bottom:3px;">NOTE FROM RESTORED RARITY</div>' +
               esc_(c.note).replace(/\n/g, '<br>') + '</div>' : '') +
           '</div>';
  }).join('');

  var readyNow = emailable.filter(function (c) { return c.status === READY_STAGE; }).length;
  var deadlineBox = readyNow ? callout_(
    '<p style="margin:0 0 8px;"><b>Please arrange ' + (hand ? 'pickup' : 'return shipping or pickup') + ' by ' + pickupBy + '.</b></p>' +
    '<p style="margin:0;">After that, a holding fee of $' + FEE_PER_CARD_PER_DAY + ' per card, per day applies, and cards not claimed within ' +
    FORFEIT_DAY + ' days may be forfeited, as described in ' + TERMS_SECTION + '.</p>') : '';

  var summary = '';
  if (sub.cards.length > 1) {
    summary = '<div style="color:' + BRAND.cyan + ';font-size:12px;letter-spacing:1px;margin:6px 0 6px;">ALL CARDS IN THIS SUBMISSION</div>' +
      '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:14px;">' +
      sub.cards.map(function (c) {
        return '<tr><td style="padding:6px 0;border-bottom:1px solid ' + BRAND.line + ';color:' + BRAND.white + ';">' + esc_(c.card || 'Card') + '</td>' +
               '<td align="right" style="padding:6px 0;border-bottom:1px solid ' + BRAND.line + ';color:' + BRAND.muted + ';">' + esc_(c.status) + '</td></tr>';
      }).join('') + '</table>';
  }

  var allDone = sub.overall === FINAL_STAGE;
  var inner =
    p_('Hi ' + esc_(firstName_(sub.name)) + ',') +
    p_(emailable.length === 1 ? 'There’s an update on one of your cards:' : 'There are updates on ' + emailable.length + ' of your cards:') +
    blocks + deadlineBox + summary +
    (allDone ? p_('Everything in this submission is complete — thank you for trusting me with your cards! If you’re happy with the work, ' +
      'I’d really appreciate a quick review: ' + link_(SITE_URL + '/#reviews', 'leave a review') + '.') : '') +
    refBox_(sub.ref) + trackButton_(sub.ref);

  var heading = readyNow ? (emailable.length === 1 ? 'Your card is ready!' : 'Your cards are ready!')
              : allDone ? 'Order complete — thank you!' : 'Card update';
  var subject = emailable.length === 1
    ? emailable[0].card + ' — ' + emailable[0].status + ' (' + sub.ref + ')'
    : emailable.length + ' cards updated (' + sub.ref + ')';

  var plain = 'Hi ' + firstName_(sub.name) + ', update on your submission ' + sub.ref + ':\n' +
    emailable.map(function (c) { return '• ' + c.card + ': ' + c.status + (c.note ? ' — ' + c.note : ''); }).join('\n') +
    (readyNow ? '\nPlease arrange return or pickup by ' + pickupBy + '. After that a $' + FEE_PER_CARD_PER_DAY + '/card/day holding fee applies.' : '') +
    '\nTrack it: ' + trackUrl_(sub.ref);

  sendHtml_(sub.email, subject.replace(/<[^>]+>/g, ''), inner, plain, heading);
}

function sendOwnerAlert_(record, ref, refCode, quote) {
  if (!SEND_OWNER_ALERTS) return;
  var to = ownerEmail_();
  if (!to) return;
  var cards = (record.cards || []);
  var n = cards.length;
  var row = function (k, v) {
    return v ? '<tr><td style="padding:4px 12px 4px 0;color:' + BRAND.muted + ';white-space:nowrap;vertical-align:top;">' + k + '</td>' +
               '<td style="padding:4px 0;color:' + BRAND.white + ';">' + v + '</td></tr>' : '';
  };
  var info = '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin:0 0 14px;">' +
    row('Name', esc_(record.name)) +
    row('Email', record.email ? link_('mailto:' + record.email, esc_(record.email)) : '<i>none given</i>') +
    row('Phone', esc_(record.phone)) +
    row('Delivery', esc_(record.deliveryMethod) + (record.insuredShipping ? ' (insured return requested)' : '')) +
    row('Address', esc_(record.address).replace(/\n/g, '<br>')) +
    row('Referral code', refCode ? esc_(refCode) + ' (valid, ' + referralPctText_() + ')' : (record.referralCode ? esc_(record.referralCode) + ' (not valid)' : '')) +
    '</table>';
  var list = cards.map(function (c, i) {
    var links = [];
    if (c.photos && c.photos.front) links.push(link_(c.photos.front, 'front photo'));
    if (c.photos && c.photos.back) links.push(link_(c.photos.back, 'back photo'));
    ((c.photos && c.photos.details) || []).forEach(function (u, k) { links.push(link_(u, 'detail ' + (k + 1))); });
    return '<li style="margin-bottom:10px;"><b>' + esc_(c.card || 'Card ' + (i + 1)) + '</b>' +
      '<div style="color:' + BRAND.muted + ';font-size:13px;">' + esc_(c.service || '') + (c.value ? ' · est. value $' + esc_(String(c.value).replace(/^\$/, '')) : '') + '</div>' +
      (quote && quote.cards[i] ? '<div style="color:' + BRAND.yellow + ';font-size:13px;">Quote: ' +
        (quote.cards[i].price === null ? '<b>CUSTOM QUOTE</b>' : '<b>' + quoteMoney_(quote.cards[i].price) + '</b>') +
        ' <span style="color:' + BRAND.muted + ';">(' + esc_(quote.cards[i].breakdown) + ')</span></div>' : '') +
      (c.notes ? '<div style="color:' + BRAND.muted + ';font-size:13px;">Notes: ' + esc_(c.notes) + '</div>' : '') +
      '<div style="font-size:13px;">' + (links.length ? links.join(' · ') : '<span style="color:' + BRAND.muted + ';">No photos</span>') + '</div></li>';
  }).join('');

  var inner =
    p_(esc_(record.name || 'Someone') + ' just submitted ' + (n === 1 ? '1 card' : n + ' cards') + '. ' +
       (record.email ? 'Reply to this email to respond to them directly.' : '<b>No email given — follow up by phone.</b>')) +
    info +
    '<div style="background:' + BRAND.bg + ';border:1px solid ' + BRAND.line + ';border-radius:8px;padding:10px 14px;margin:0 0 16px;">' +
      '<div style="color:' + BRAND.cyan + ';font-size:12px;letter-spacing:1px;font-weight:bold;">REFERENCE ' + esc_(ref) + '</div>' +
      '<ul style="margin:8px 0 0;padding-left:20px;">' + list + '</ul></div>' +
    quoteBox_(quote) +
    '<a href="' + SpreadsheetApp.getActiveSpreadsheet().getUrl() + '" style="display:inline-block;background:' + BRAND.orange + ';color:' + BRAND.bg +
      ';text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:6px;">OPEN THE SHEET</a>';

  var plain = ['New submission: ' + ref, 'Name: ' + (record.name || ''), 'Email: ' + (record.email || '—'),
    'Phone: ' + (record.phone || '—'), 'Delivery: ' + (record.deliveryMethod || ''), 'Cards: ' + n,
    quote ? 'Quote total: ' + quoteMoney_(quote.total) + (quote.complete ? '' : ' + custom-quote cards') : ''].join('\n');

  sendHtml_(to, 'New submission ' + ref + ' — ' + (record.name || '') + ' (' + n + ' card' + (n === 1 ? '' : 's') +
    (quote ? ', quote ' + quoteMoney_(quote.total) + (quote.complete ? '' : '+') : '') + ')',
    inner, plain, 'New submission: ' + ref, record.email || to, BUSINESS_NAME + ' Website');
}

/** Quote summary for the owner alert (never sent to customers). */
function quoteBox_(q) {
  if (!q) return '';
  var line = function (k, v, color, big) {
    return '<tr><td style="padding:4px 0;color:' + (color || BRAND.muted) + ';' + (big ? 'font-size:17px;font-weight:bold;' : '') + '">' + k + '</td>' +
           '<td align="right" style="padding:4px 0;color:' + (color || BRAND.white) + ';' + (big ? 'font-size:17px;font-weight:bold;' : '') + '">' + v + '</td></tr>';
  };
  return '<div style="background:' + BRAND.panel2 + ';border:1px solid ' + BRAND.yellow + ';border-radius:8px;padding:12px 14px;margin:0 0 16px;">' +
    '<div style="color:' + BRAND.yellow + ';font-size:12px;letter-spacing:1px;font-weight:bold;margin-bottom:6px;">QUOTE (PRIVATE)</div>' +
    '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">' +
      line('Subtotal', quoteMoney_(q.subtotal)) +
      (q.referralAmt ? line('Referral code (' + referralPctText_() + ')', '−' + quoteMoney_(q.referralAmt)) : '') +
      line(q.complete ? 'Total to charge' : 'Total so far (plus custom-quote cards)', quoteMoney_(q.total), BRAND.yellow, true) +
    '</table>' +
    (q.notes.length ? '<ul style="margin:8px 0 0;padding-left:18px;color:' + BRAND.orange + ';font-size:13px;">' +
      q.notes.map(function (n) { return '<li>' + esc_(n) + '</li>'; }).join('') + '</ul>' : '') +
    '<div style="color:' + BRAND.muted + ';font-size:12px;margin-top:8px;">To give a discount, type it (10% or 15) in <b>Your Discount</b> on the Submissions tab. ' +
    'For cards over $3,000, type your price in <b>Price Override</b> on the Cards tab.</div></div>';
}

/** Branded wrapper used by every email. */
function sendHtml_(to, subject, innerHtml, plainText, heading, replyTo, fromName) {
  var logo = getLogo_();
  var B = BRAND;
  var header = logo
    ? '<img src="cid:rrlogo" width="220" alt="Restored Rarity" style="display:block;margin:0 auto;width:220px;max-width:70%;height:auto;border:0;border-radius:8px;">'
    : '<div style="font-family:\'Courier New\',monospace;font-weight:bold;font-size:26px;letter-spacing:3px;line-height:1.1;text-align:center;">' +
      '<span style="color:' + B.cyan + ';">RESTORED</span><br><span style="color:' + B.yellow + ';">RARITY</span></div>';
  innerHtml = innerHtml.replace(/<a (?![^>]*style=)/g, '<a style="color:' + B.cyan + ';text-decoration:underline;" ');
  var html =
    '<div style="background:' + B.bg + ';padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">' +
      '<div style="max-width:580px;margin:0 auto;background:' + B.panel + ';border:1px solid ' + B.line + ';border-radius:12px;overflow:hidden;">' +
        '<div style="background:' + B.bg + ';padding:22px 22px 16px;text-align:center;">' + header + '</div>' +
        '<div style="height:4px;background:' + B.orange + ';background-image:linear-gradient(90deg,' + B.cyan + ',' + B.yellow + ',' + B.orange + ');"></div>' +
        '<div style="padding:22px 24px 8px;">' +
          (heading ? '<div style="color:' + B.yellow + ';font-size:21px;font-weight:bold;line-height:1.3;margin:0 0 14px;">' + esc_(heading) + '</div>' : '') +
          '<div style="color:' + B.white + ';font-size:15px;line-height:1.6;">' + innerHtml + '</div>' +
          '<p style="margin:22px 0 18px;color:' + B.white + ';font-size:15px;">— ' + BUSINESS_NAME + '<br>' +
          '<span style="color:' + B.muted + ';font-size:13px;">' + BUSINESS_EMAIL + ' · ' + BUSINESS_PHONE + '</span></p>' +
        '</div>' +
        '<div style="background:' + B.panel2 + ';border-top:1px solid ' + B.line + ';padding:12px 24px;color:' + B.muted + ';font-size:12px;text-align:center;">' +
          'Restore. Repair. Revive. · <a href="' + SITE_URL + '" style="color:' + B.cyan + ';text-decoration:none;">' + SITE_URL.replace(/^https?:\/\//, '') + '</a>' +
          ' · <a href="https://instagram.com/' + INSTAGRAM + '" style="color:' + B.cyan + ';text-decoration:none;">@' + INSTAGRAM + '</a>' +
        '</div>' +
      '</div></div>';
  var opts = { to: to, subject: subject, htmlBody: html, body: plainText || '', name: fromName || BUSINESS_NAME };
  var reply = replyTo || ownerEmail_();
  if (reply) opts.replyTo = reply;
  if (logo) opts.inlineImages = { rrlogo: logo };
  MailApp.sendEmail(opts);
}

var LOGO_BLOB_;
function getLogo_() {
  if (LOGO_BLOB_ !== undefined) return LOGO_BLOB_;
  LOGO_BLOB_ = null;
  if (!LOGO_URL) return null;
  try {
    var res = UrlFetchApp.fetch(LOGO_URL, { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) LOGO_BLOB_ = res.getBlob().setName('restored-rarity-logo.jpg');
    else console.warn('Logo not found at ' + LOGO_URL + ' (HTTP ' + res.getResponseCode() + ') — using text header.');
  } catch (e) { console.warn('Logo fetch failed — using text header. ' + e); }
  return LOGO_BLOB_;
}

function refBox_(ref) {
  return '<div style="margin:0 0 16px;padding:12px 14px;background:' + BRAND.panel2 + ';border:1px dashed ' + BRAND.cyan + ';border-radius:6px;">' +
         '<div style="color:' + BRAND.muted + ';font-size:12px;">YOUR REFERENCE NUMBER</div>' +
         '<div style="color:' + BRAND.cyan + ';font-size:22px;font-weight:bold;letter-spacing:2px;">' + esc_(ref) + '</div></div>';
}
function trackButton_(ref) {
  return '<a href="' + trackUrl_(ref) + '" style="display:inline-block;background:' + BRAND.orange + ';color:' + BRAND.bg +
         ';text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:6px;">TRACK MY SUBMISSION</a>';
}
function callout_(html) {
  return '<div style="background:#2a1d0c;border:1px solid ' + BRAND.orange + ';border-left:5px solid ' + BRAND.orange +
         ';border-radius:8px;padding:12px 14px;margin:14px 0;color:' + BRAND.white + ';">' + html + '</div>';
}
function cardTable_(rows, rightLabel) {
  if (!rows.length) return '';
  var th = 'padding:6px 10px;color:' + BRAND.cyan + ';font-size:12px;';
  return '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:14px;">' +
    '<tr><th align="left" style="' + th + '">#</th><th align="left" style="' + th + '">CARD</th><th align="left" style="' + th + '">' + rightLabel + '</th></tr>' +
    rows.map(function (r) {
      var td = 'padding:6px 10px;border-bottom:1px solid ' + BRAND.line + ';vertical-align:top;';
      return '<tr><td style="' + td + 'color:' + BRAND.muted + ';">' + esc_(r.num) + '</td>' +
             '<td style="' + td + 'color:' + BRAND.white + ';">' + esc_(r.card || 'Card') +
               (r.sub ? '<div style="color:' + BRAND.muted + ';font-size:12px;">' + esc_(r.sub) + '</div>' : '') + '</td>' +
             '<td style="' + td + 'color:' + BRAND.muted + ';">' + esc_(r.right || '') + '</td></tr>';
    }).join('') + '</table>';
}
function p_(html) { return '<p style="margin:0 0 14px;">' + html + '</p>'; }
function link_(url, text) { return '<a href="' + esc_(url) + '">' + text + '</a>'; }


/* =================================================================
 *  PICKUP REMINDERS  (hourly trigger — created by setup())
 *  Day 0  card set to "Ready to Ship / Pick Up" → card update email (above)
 *  Day 25 still ready → reminder: pay for return shipping or pick up
 *  Day 30 still ready → holding fee notice ($1/card/day), forfeiture at day 60
 *  Setting a card to "Order Completed / Picked Up / Shipped" stops these.
 * ================================================================= */
function runPickupReminders() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var cardSheet = ss.getSheetByName(CARDS_TAB);
    var last = lastDataRow_(cardSheet, CC.ID);
    if (last < 2) return;
    var rows = cardSheet.getRange(2, 1, last - 1, CC.FEE_START).getValues();
    var subs = submissionsById_();
    var now = new Date();
    var due = { r25: {}, r30: {} }, order = { r25: [], r30: [] };

    rows.forEach(function (r, i) {
      var rowNum = i + 2;
      var id = String(r[CC.ID - 1] || '');
      if (!id || canonicalStatus_(r[CC.STATUS - 1]) !== READY_STAGE) return;
      var completed = asDate_(r[CC.COMPLETED - 1]);
      if (!completed) {
        // Card was already ready before reminders were turned on: start its clock today, no email.
        cardSheet.getRange(rowNum, CC.COMPLETED).setValue(now);
        return;
      }
      var days = daysBetween_(completed, now);
      var item = { row: rowNum, num: r[CC.NUM - 1], card: String(r[CC.NAME - 1] || 'Card'), completed: completed };
      var bucket = null;
      if (days >= HOLDING_DAY && !r[CC.R30 - 1]) bucket = 'r30';
      else if (days >= REMINDER_DAY && days < HOLDING_DAY && !r[CC.R25 - 1]) bucket = 'r25';
      if (!bucket) return;
      var key = id + '|' + completed.toDateString();
      if (!due[bucket][key]) { due[bucket][key] = { id: id, items: [] }; order[bucket].push(key); }
      due[bucket][key].items.push(item);
    });

    ['r25', 'r30'].forEach(function (bucket) {
      order[bucket].forEach(function (key) {
        var g = due[bucket][key];
        var sub = subs[g.id];
        var stamp = now;
        try {
          if (sub && sub.email && SEND_CUSTOMER_EMAILS) {
            if (bucket === 'r25') sendPickupReminder_(sub, g.items);
            else sendHoldingNotice_(sub, g.items);
          } else {
            stamp = 'no email on file';
          }
        } catch (err) {
          console.error('Reminder for ' + g.id + ' failed: ' + err);
          return; // not stamped, so it retries next hour
        }
        g.items.forEach(function (it) {
          if (bucket === 'r25') {
            cardSheet.getRange(it.row, CC.R25).setValue(stamp);
          } else {
            cardSheet.getRange(it.row, CC.R30).setValue(stamp);
            cardSheet.getRange(it.row, CC.FEE_START).setValue(addDays_(it.completed, HOLDING_DAY + 1));
            var r25 = cardSheet.getRange(it.row, CC.R25);
            if (!r25.getValue()) r25.setValue('skipped');
          }
          logHistory_(g.id, it.num, it.card, READY_STAGE, bucket === 'r25' ? '25-day pickup reminder sent' : '30-day holding fee notice sent');
        });
      });
    });
  } finally {
    lock.releaseLock();
  }
}

function sendPickupReminder_(sub, items) {
  var n = items.length, hand = /hand/i.test(sub.delivery);
  var feeDate = fmtDate_(addDays_(items[0].completed, HOLDING_DAY + 1));
  var inner =
    p_('Hi ' + esc_(firstName_(sub.name)) + ',') +
    p_('Just a reminder that ' + (n === 1 ? 'your restored card is' : 'your ' + n + ' restored cards are') + ' still waiting for you:') +
    cardTable_(items.map(function (it) { return { num: it.num, card: it.card, right: READY_STAGE }; }), 'STATUS') +
    p_(hand ? '<b>Reply to set up a pickup time</b>, or if it’s easier, you can elect to pay for return shipping instead and I’ll send ' +
              (n === 1 ? 'it' : 'them') + ' out securely packaged with insurance.'
            : '<b>You can elect to pay for return shipping</b> and I’ll send ' + (n === 1 ? 'it' : 'them') +
              ' out securely packaged with insurance, or we can set up an in-person pickup. Just reply to this email with what works for you.') +
    callout_('<p style="margin:0;">To avoid holding fees, please arrange return or pickup within the next <b>' + (HOLDING_DAY - REMINDER_DAY) +
      ' days</b>. Starting <b>' + feeDate + '</b>, a holding fee of $' + FEE_PER_CARD_PER_DAY + ' per card, per day will apply.</p>') +
    refBox_(sub.ref) + trackButton_(sub.ref);
  sendHtml_(sub.email, 'Reminder: your ' + (n === 1 ? 'card is' : 'cards are') + ' waiting — ' + BUSINESS_NAME + ' (' + sub.ref + ')', inner,
    'Hi ' + firstName_(sub.name) + ', your restored ' + (n === 1 ? 'card is' : 'cards are') + ' still waiting (' + sub.ref + '). ' +
    'Reply to arrange paid return shipping or pickup. A $' + FEE_PER_CARD_PER_DAY + '/card/day holding fee starts ' + feeDate + '.',
    'Friendly reminder — ' + (n === 1 ? 'your card is' : 'your cards are') + ' ready to come home');
}

function sendHoldingNotice_(sub, items) {
  var n = items.length;
  var notice = items[0].completed;
  var feeDate = fmtDate_(addDays_(notice, HOLDING_DAY + 1));
  var forfeitDate = fmtDate_(addDays_(notice, FORFEIT_DAY));
  var daily = n * FEE_PER_CARD_PER_DAY;
  var max = daily * (FORFEIT_DAY - HOLDING_DAY);
  var inner =
    p_('Hi ' + esc_(firstName_(sub.name)) + ',') +
    p_('It has been ' + HOLDING_DAY + ' days since I let you know ' + (n === 1 ? 'your card was' : 'your ' + n + ' cards were') +
       ' ready, and ' + (n === 1 ? 'it hasn’t' : 'they haven’t') + ' been claimed yet:') +
    cardTable_(items.map(function (it) { return { num: it.num, card: it.card, right: READY_STAGE }; }), 'STATUS') +
    callout_('<p style="margin:0 0 8px;"><b>Starting ' + feeDate + '</b>, a holding fee of $' + FEE_PER_CARD_PER_DAY +
      ' per card, per day applies (<b>$' + daily + '/day</b> for ' + (n === 1 ? 'your card' : 'your ' + n + ' cards') + '), for up to the next ' +
      (FORFEIT_DAY - HOLDING_DAY) + ' days (up to $' + max + ').</p>' +
      '<p style="margin:0;"><b>If ' + (n === 1 ? 'the card is' : 'the cards are') + ' not claimed by ' + forfeitDate + '</b> (day ' + FORFEIT_DAY + '), ' +
      (n === 1 ? 'it' : 'they') + ' may be considered abandoned and forfeited to ' + BUSINESS_NAME + '.</p>') +
    p_('Holding fees must be paid before ' + (n === 1 ? 'the card is' : 'cards are') + ' returned. Reply to this email to arrange payment and ' +
       'return shipping or pickup. If something has come up and you need more time, let me know right away — exceptions are considered case by case.') +
    p_('Details are in ' + TERMS_SECTION + ' at ' + link_(SITE_URL, SITE_URL.replace(/^https?:\/\//, '')) + '.') +
    refBox_(sub.ref);
  sendHtml_(sub.email, 'Action needed: holding fees begin for your ' + (n === 1 ? 'card' : 'cards') + ' — ' + BUSINESS_NAME + ' (' + sub.ref + ')', inner,
    'Hi ' + firstName_(sub.name) + ', your ' + (n === 1 ? 'card has' : 'cards have') + ' not been claimed (' + sub.ref + '). ' +
    'Starting ' + feeDate + ' a holding fee of $' + FEE_PER_CARD_PER_DAY + ' per card, per day applies ($' + daily + '/day). ' +
    'Cards not claimed by ' + forfeitDate + ' may be forfeited. Reply to arrange return or pickup.',
    'Holding fees now apply');
}

/** Submission ID → { id, ref, name, email, delivery } from the Submissions tab. */
function submissionsById_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBMISSIONS_TAB);
  var out = {};
  var last = sheet.getLastRow();
  if (last < 2) return out;
  sheet.getRange(2, 1, last - 1, SC.STATUS_UPDATED).getValues().forEach(function (r) {
    var id = String(r[SC.ID - 1] || '');
    if (!id) return;
    out[id] = { id: id, ref: refFromId_(id), name: r[SC.NAME - 1], email: String(r[SC.EMAIL - 1] || '').trim(),
                delivery: String(r[SC.DELIVERY - 1] || '') };
  });
  return out;
}

/** Sends you a sample of every customer email plus the new-submission alert. */
function sendTestEmail() {
  var me = ownerEmail_();
  var record = {
    id: 'RR-TEST01', name: 'Test Customer', email: me, phone: '(555) 123-4567', deliveryMethod: 'Ship',
    address: '123 Main St\nHouston, TX 77001', insuredShipping: true, referralCode: '',
    cards: [{ card: 'Charizard — Base Set Holo', service: 'Major Repair ($50)', value: '420', notes: 'Corner crease' },
            { card: 'Blastoise — Base Set Holo', service: 'Base Repair ($35)', value: '150' }]
  };
  sendConfirmationEmail_(record, 'RR-TEST01');
  sendOwnerAlert_(record, 'RR-TEST01', '');
  var sub = { id: 'RR-TEST01', ref: 'RR-TEST01', name: 'Test Customer', email: me, delivery: 'Ship', overall: READY_STAGE,
              cards: [{ card: 'Charizard — Base Set Holo', status: READY_STAGE }, { card: 'Blastoise — Base Set Holo', status: READY_STAGE }] };
  sendCardUpdateEmail_(sub, [{ num: 1, card: 'Charizard — Base Set Holo', status: READY_STAGE, note: '', tracking: '' },
                             { num: 2, card: 'Blastoise — Base Set Holo', status: READY_STAGE, note: '', tracking: '' }]);
  var items = [{ num: 1, card: 'Charizard — Base Set Holo', completed: addDays_(new Date(), -30) },
               { num: 2, card: 'Blastoise — Base Set Holo', completed: addDays_(new Date(), -30) }];
  sendPickupReminder_(sub, items);
  sendHoldingNotice_(sub, items);
  var done = { id: 'RR-TEST01', ref: 'RR-TEST01', name: 'Test Customer', email: me, delivery: 'Ship', overall: FINAL_STAGE,
               cards: [{ card: 'Charizard — Base Set Holo', status: FINAL_STAGE }, { card: 'Blastoise — Base Set Holo', status: FINAL_STAGE }] };
  sendCardUpdateEmail_(done, [{ num: 1, card: 'Charizard — Base Set Holo', status: FINAL_STAGE, note: '', tracking: '9400 1000 0000 0000 0000 00' },
                              { num: 2, card: 'Blastoise — Base Set Holo', status: FINAL_STAGE, note: '', tracking: '9400 1000 0000 0000 0000 00' }]);
  console.log('6 sample emails sent to ' + me);
}


/* =================================================================
 *  QUOTES — automatic price quote for every submission
 *  • Cards tab gets "Quote", "Quote Breakdown" and "Price Override"
 *    (type a price in Price Override to set a card's price yourself,
 *    e.g. for a custom quote over $3,000).
 *  • Submissions tab gets "Quote Subtotal", "Referral Discount",
 *    "Your Discount" (type 10% or 15 for $15 off), "Your Discount ($)",
 *    "Quote Total" and "Quote Notes".
 *  • Recalculates by itself when you change a card's Value, Service,
 *    Status (Cancelled cards drop off) or Price Override, or the
 *    submission's "Your Discount".
 *  • The admin portal can ask for a quote and set your discount with
 *    {type:'portalQuote', token, code[, discount]} (admin sign-in checked
 *    the same way as Send status email). Also: Restored Rarity menu →
 *    Recalculate all quotes.
 *  • Private: customers never see these columns.
 * ================================================================= */
// Built-in price list. Used only when the portal's prices (Website → Prices,
// saved in Supabase) can't be read. Keep it in step with index.html's defaults.
var QUOTE_PRICING = {
  services: [   // longest names first so "Card Cleaning + Scratch Repair" isn't read as "Card Cleaning"
    { title: 'Grade-Ready Evaluation + Deep Clean', price: 20, type: 'clean' },
    { title: 'Card Cleaning + Scratch Repair',      price: 15, type: 'clean' },
    { title: 'Card Cleaning',                       price: 10, type: 'clean', bulk: true },
    { title: 'Base Repair',                         price: 35, type: 'repair' },
    { title: 'Major Repair',                        price: 50, type: 'repair' },
    { title: 'Slab Cracking',                       price: 15, type: 'addon' },  // on its own
    { title: 'Grading Submission (PSA, CGC, BGS, TAG)', price: 15, type: 'grading' }  // on its own: first card
  ],
  bulkCleaning: function (qty) { return qty > 40 ? 6 : qty > 20 ? 8 : 10; },
  slabAddon: 10,                 // slab cracking added to another service
  gradingNext: 5,                // grading submission on its own: each card after the first
  gradingAddon: 5,               // grading submission added to another service, per card
  surcharge: [                   // repairs only, on estimated card value
    { upTo: 250,  rate: 0 },
    { upTo: 1500, rate: 0.10 },
    { upTo: 3000, rate: 0.12 }   // above this: custom quote
  ],
  referralRate: 0.10
};
var QUOTE_CARD_HEADERS_ = ['Quote', 'Quote Breakdown', 'Price Override'];
var QUOTE_SUB_HEADERS_  = ['Quote Subtotal', 'Referral Discount ($)', 'Your Discount', 'Your Discount ($)', 'Quote Total', 'Quote Notes'];
var QUOTE_MONEY_FORMAT = '$#,##0.00';

/** The price list quotes use: the one saved in the admin portal (Website → Prices),
 *  cached for 5 minutes; QUOTE_PRICING if the portal can't be reached or has none. */
var QUOTE_LIVE_PRICING_ = null;
function quotePricing_() {
  if (QUOTE_LIVE_PRICING_) return QUOTE_LIVE_PRICING_;
  var pr = null;
  try {
    var cache = CacheService.getScriptCache();
    var hit = cache.get('site_prices_v1');
    if (hit) pr = JSON.parse(hit);
    else if (typeof SUPABASE_URL === 'string' && typeof SUPABASE_KEY === 'string') {
      var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/site_get', {
        method: 'post', contentType: 'application/json', payload: '{}', muteHttpExceptions: true,
        headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
      });
      if (res.getResponseCode() === 200) {
        pr = (JSON.parse(res.getContentText()) || {}).prices || null;
        cache.put('site_prices_v1', JSON.stringify(pr), 300);
      }
    }
  } catch (err) { console.warn('Portal prices not read, using built-in list: ' + err); }
  QUOTE_LIVE_PRICING_ = quotePricingFrom_(pr) || QUOTE_PRICING;
  return QUOTE_LIVE_PRICING_;
}
/** Portal price list {services, bulk, slabAddon, surcharge:[{upTo, rate%}], referral%} → quote format. */
function quotePricingFrom_(pr) {
  if (!pr || !pr.services || !pr.services.length) return null;
  var num = function (v) { v = Number(v); return isFinite(v) && v >= 0 ? v : 0; };
  var services = pr.services.filter(function (x) { return x && x.title && /^(clean|repair|addon|grading)$/.test(x.type); })
    .map(function (x) { return { title: String(x.title).trim(), price: num(x.price), type: x.type, bulk: !!x.bulk }; });
  // A price list saved before the grading service existed: use the built-in one
  if (!services.some(function (x) { return x.type === 'grading'; })) {
    services.push(QUOTE_PRICING.services.filter(function (x) { return x.type === 'grading'; })[0]);
  }
  services.sort(function (a, b) { return b.title.length - a.title.length; });   // longest first for name matching
  if (!services.length) return null;
  var bulkTier = services.filter(function (x) { return x.bulk; })[0];
  var bulk = (pr.bulk || []).map(function (b) { return { min: num(b.min), price: num(b.price) }; })
    .sort(function (a, b) { return a.min - b.min; });
  var surcharge = (pr.surcharge || []).map(function (t) { return { upTo: num(t.upTo), rate: num(t.rate) / 100 }; })
    .sort(function (a, b) { return a.upTo - b.upTo; });
  return {
    services: services,
    bulkCleaning: function (qty) {
      var p = bulkTier ? bulkTier.price : 10;
      bulk.forEach(function (b) { if (qty >= b.min) p = b.price; });
      return p;
    },
    slabAddon: pr.slabAddon != null ? num(pr.slabAddon) : QUOTE_PRICING.slabAddon,
    gradingNext: pr.gradingNext != null ? num(pr.gradingNext) : QUOTE_PRICING.gradingNext,
    gradingAddon: pr.gradingAddon != null ? num(pr.gradingAddon) : QUOTE_PRICING.gradingAddon,
    surcharge: surcharge.length ? surcharge : QUOTE_PRICING.surcharge,
    referralRate: pr.referral != null ? num(pr.referral) / 100 : QUOTE_PRICING.referralRate
  };
}
function referralPctText_() { return Math.round(quotePricing_().referralRate * 100) + '%'; }

/** Pure pricing math (no sheet access).
 *  cards: [{num, card, service, value, status, override}]
 *  opts:  {referral: bool, discount: '10%' | '15' | ''} */
function computeQuote_(cards, opts, pricing) {
  opts = opts || {};
  var QP = pricing || quotePricing_();
  var notes = [];
  var parsed = cards.map(function (c) {
    var svc = String(c.service || '').trim();
    var crack = /\+\s*slab\s*cracking/i.test(svc);
    var grade = /\+\s*grading\s*submission/i.test(svc);
    // strip the add-ons and the "— grading: PSA" note to get the main service
    var base = svc.replace(/\s*\+\s*(slab\s*cracking|grading\s*submission).*$/i, '').replace(/\s+—\s+grading.*$/i, '').trim();
    var tier = null;
    for (var i = 0; i < QP.services.length; i++) {
      if (base.toLowerCase().indexOf(QP.services[i].title.toLowerCase()) === 0) { tier = QP.services[i]; break; }
    }
    return { c: c, tier: tier, crack: crack, grade: grade, base: base, cancelled: canonicalStatus_(c.status) === 'Cancelled' };
  });
  var gradingSeen = 0;   // grading on its own: first card full price, each after at gradingNext
  var cleanQty = parsed.filter(function (p) { return !p.cancelled && p.tier && p.tier.bulk; }).length;

  var lines = parsed.map(function (p) {
    var c = p.c, num = c.num;
    if (p.cancelled) return { num: num, price: 0, breakdown: 'Cancelled — not charged', flag: '' };

    var ov = quoteParseMoney_(c.override);
    if (ov !== null) return { num: num, price: quoteRound2_(ov), breakdown: 'Your price override: ' + quoteMoney_(ov), flag: '' };

    var parts = [], price = 0, flag = '';
    if (p.tier) {
      var basePrice = p.tier.bulk ? QP.bulkCleaning(cleanQty) : p.tier.price;
      if (p.tier.type === 'grading' && gradingSeen++ > 0) basePrice = QP.gradingNext;
      price += basePrice;
      parts.push(p.tier.title + ' ' + quoteMoney_(basePrice) + (p.tier.bulk && basePrice !== p.tier.price ? ' (bulk, ' + cleanQty + ' cleanings)' : '')
        + (p.tier.type === 'grading' && basePrice !== p.tier.price ? ' (additional card)' : ''));
    } else {
      var m = p.base.match(/\$\s*([\d,]+(?:\.\d+)?)/);
      if (!m) return { num: num, price: null, breakdown: 'Service not recognized: "' + p.base + '"', flag: 'Card ' + num + ': service not recognized — set a Price Override' };
      var guess = Number(m[1].replace(/,/g, ''));
      price += guess;
      parts.push(p.base + ' ' + quoteMoney_(guess));
      flag = 'Card ' + num + ': service not in price list, used ' + quoteMoney_(guess) + ' from its name';
    }
    if (p.crack && !(p.tier && p.tier.type === 'addon')) { price += QP.slabAddon; parts.push('slab cracking ' + quoteMoney_(QP.slabAddon)); }
    if (p.grade && !(p.tier && p.tier.type === 'grading')) { price += QP.gradingAddon; parts.push('grading submission ' + quoteMoney_(QP.gradingAddon)); }

    if (p.tier && p.tier.type === 'repair') {
      var v = quoteParseValue_(c.value);
      if (v === null) {
        flag = 'Card ' + num + ': no card value given — surcharge assumed $0';
        parts.push('no value given, surcharge $0');
      } else {
        var last = QP.surcharge[QP.surcharge.length - 1];
        if (v > last.upTo) {
          return { num: num, price: null, breakdown: parts.join(' + ') + ' + custom quote (value ' + quoteMoney_(v) + ' is over ' + quoteMoney_(last.upTo) + ')',
                   flag: 'Card ' + num + ': value over ' + quoteMoney_(last.upTo) + ' — custom quote, set a Price Override' };
        }
        var rate = 0;
        for (var j = 0; j < QP.surcharge.length; j++) { if (v <= QP.surcharge[j].upTo) { rate = QP.surcharge[j].rate; break; } }
        if (rate > 0) {
          var sur = Math.ceil(v * rate);
          price += sur;
          parts.push('surcharge ' + Math.round(rate * 100) + '% of ' + quoteMoney_(v) + ' = ' + quoteMoney_(sur));
        }
        var raw = String(c.value == null ? '' : c.value).trim();
        if (rate > 0 && !/^\$?\s*[\d,]+(\.\d+)?$/.test(raw)) flag = 'Card ' + num + ': value read as ' + quoteMoney_(v) + ' from "' + raw + '" — check it';
      }
    }
    return { num: num, price: quoteRound2_(price), breakdown: parts.join(' + ') + ' → ' + quoteMoney_(price), flag: flag };
  });

  var subtotal = 0, pending = [];
  lines.forEach(function (l) {
    if (l.price === null) pending.push(l.num); else subtotal += l.price;
    if (l.flag) notes.push(l.flag);
  });
  subtotal = quoteRound2_(subtotal);
  var referralAmt = opts.referral ? quoteRound2_(subtotal * QP.referralRate) : 0;
  var afterRef = quoteRound2_(subtotal - referralAmt);

  var discText = String(opts.discount == null ? '' : opts.discount).trim();
  var discountAmt = 0;
  if (discText) {
    var pct = discText.match(/^(\d+(?:\.\d+)?)\s*%$/);
    if (pct) discountAmt = quoteRound2_(afterRef * Number(pct[1]) / 100);
    else {
      var d = quoteParseMoney_(discText);
      if (d === null) notes.push('Your Discount "' + discText + '" not understood — use 10% or 15');
      else discountAmt = quoteRound2_(d);
    }
    if (discountAmt > afterRef) discountAmt = afterRef;
  }
  var total = quoteRound2_(afterRef - discountAmt);
  if (pending.length) notes.unshift('Total leaves out card' + (pending.length > 1 ? 's ' : ' ') + pending.join(', ') + ' (needs a price)');

  return {
    cards: lines, subtotal: subtotal, referral: !!opts.referral, referralAmt: referralAmt,
    discount: discText, discountAmt: discountAmt, total: total,
    complete: pending.length === 0, notes: notes
  };
}

/** Recalculates one submission's quote and writes it to the sheet. Returns the quote. */
function recalcQuote_(id) {
  id = String(id || '');
  if (!id) return null;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var subSheet = ss.getSheetByName(SUBMISSIONS_TAB);
  var cardSheet = ss.getSheetByName(CARDS_TAB);
  var cq = {}, sq = {};
  QUOTE_CARD_HEADERS_.forEach(function (h) { cq[h] = quoteCol_(cardSheet, h); });
  QUOTE_SUB_HEADERS_.forEach(function (h) { sq[h] = quoteCol_(subSheet, h); });

  // Submission row
  var subLast = subSheet.getLastRow();
  if (subLast < 2) return null;
  var ids = subSheet.getRange(2, SC.ID, subLast - 1, 1).getValues();
  var subRow = 0;
  for (var i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === id) { subRow = i + 2; break; }
  if (!subRow) return null;
  var referral = String(subSheet.getRange(subRow, SC.REF_DISCOUNT).getValue() || '').trim() !== '';
  var discount = subSheet.getRange(subRow, sq['Your Discount']).getDisplayValue();

  // Card rows
  var cardLast = cardSheet.getLastRow();
  if (cardLast < 2) return null;
  var width = cardSheet.getLastColumn();
  var vals = cardSheet.getRange(2, 1, cardLast - 1, width).getValues();
  var disp = cardSheet.getRange(2, 1, cardLast - 1, width).getDisplayValues();
  var cards = [], rows = [];
  vals.forEach(function (r, k) {
    if (String(r[CC.ID - 1]) !== id) return;
    rows.push(k + 2);
    cards.push({ num: r[CC.NUM - 1], card: r[CC.NAME - 1], service: r[CC.SERVICE - 1], value: disp[k][CC.VALUE - 1],
                 status: r[CC.STATUS - 1], override: disp[k][cq['Price Override'] - 1] });
  });

  var q = computeQuote_(cards, { referral: referral, discount: discount });
  q.cards.forEach(function (l, k) {
    var row = rows[k];
    cardSheet.getRange(row, cq['Quote']).setValue(l.price === null ? 'Custom quote' : l.price).setNumberFormat(QUOTE_MONEY_FORMAT);
    cardSheet.getRange(row, cq['Quote Breakdown']).setValue(l.breakdown);
    l.card = String(cards[k].card || 'Card');
    l.service = String(cards[k].service || '');
    l.value = String(cards[k].value || '');
  });
  subSheet.getRange(subRow, sq['Quote Subtotal']).setValue(q.subtotal).setNumberFormat(QUOTE_MONEY_FORMAT);
  subSheet.getRange(subRow, sq['Referral Discount ($)']).setValue(q.referralAmt ? -q.referralAmt : '').setNumberFormat(QUOTE_MONEY_FORMAT);
  subSheet.getRange(subRow, sq['Your Discount ($)']).setValue(q.discountAmt ? -q.discountAmt : '').setNumberFormat(QUOTE_MONEY_FORMAT);
  subSheet.getRange(subRow, sq['Quote Total']).setValue(q.total).setNumberFormat(QUOTE_MONEY_FORMAT).setFontWeight('bold');
  subSheet.getRange(subRow, sq['Quote Notes']).setValue(q.notes.join('\n'));
  return q;
}

/** Recalculates quotes when a value, service, status, price override or discount is edited. */
function quoteOnEdit_(e) {
  var sheet = e.range.getSheet();
  var name = sheet.getName();
  var firstCol = e.range.getColumn(), lastCol = firstCol + e.range.getNumColumns() - 1;
  var firstRow = Math.max(2, e.range.getRow()), lastRow = e.range.getRow() + e.range.getNumRows() - 1;
  if (lastRow < firstRow) return;
  var hits = function (cols) { return cols.some(function (c) { return c >= firstCol && c <= lastCol; }); };
  var idCol;
  if (name === CARDS_TAB) {
    if (!hits([CC.VALUE, CC.SERVICE, CC.STATUS, quoteCol_(sheet, 'Price Override')])) return;
    idCol = CC.ID;
  } else if (name === SUBMISSIONS_TAB) {
    if (!hits([SC.REF_DISCOUNT, quoteCol_(sheet, 'Your Discount')])) return;
    idCol = SC.ID;
  } else return;
  var seen = {};
  sheet.getRange(firstRow, idCol, lastRow - firstRow + 1, 1).getValues().forEach(function (r) {
    var id = String(r[0] || '');
    if (id && !seen[id]) { seen[id] = true; recalcQuote_(id); }
  });
}

/** Menu item: recalculates every submission's quote (also run by setup). */
function recalcAllQuotes() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBMISSIONS_TAB);
  var last = sheet.getLastRow();
  var n = 0;
  if (last >= 2) {
    sheet.getRange(2, SC.ID, last - 1, 1).getValues().forEach(function (r) {
      if (r[0]) { try { recalcQuote_(String(r[0])); n++; } catch (err) { console.error('Quote for ' + r[0] + ' failed: ' + err); } }
    });
  }
  console.log('Quotes recalculated: ' + n);
  return n;
}
function recalcAllQuotesMenu() {
  var n = recalcAllQuotes();
  try { SpreadsheetApp.getUi().alert('Recalculated quotes for ' + n + ' submission' + (n === 1 ? '' : 's') + '.'); } catch (e) {}
}

/** Admin portal: returns the quote for a submission code, optionally setting
 *  "Your Discount" first (discount: '10%' | '15' | '' to remove). Never throws. */
function portalQuote_(record) {
  try {
    var token = String(record.token || ''), code = String(record.code || '').trim();
    if (!token || !code) return { success: false, error: 'Missing sign-in or submission code.' };
    if (typeof sbIsAdmin_ !== 'function' || !sbIsAdmin_(token)) return { success: false, error: 'Not signed in to the portal as an admin. Sign out and back in, then try again.' };
    var subSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SUBMISSIONS_TAB);
    var last = subSheet.getLastRow();
    var row = 0, id = '';
    if (last >= 2) {
      var ids = subSheet.getRange(2, SC.ID, last - 1, 1).getValues();
      for (var i = ids.length - 1; i >= 0; i--) {
        var v = String(ids[i][0] || '');
        if (v && (v === code || normRef_(refFromId_(v)) === normRef_(code))) { row = i + 2; id = v; break; }
      }
    }
    if (!row) {
      // Order made in the portal only: price the cards the portal sends ({num, card, service, value, status, override}).
      if (record.cards && record.cards.length) {
        var disc = record.discount !== undefined ? record.discount : (record.savedDiscount || '');
        var refOk = record.referralCode ? isValidReferralCode(record.referralCode) : !!record.referral;
        var q = computeQuote_(record.cards, { referral: refOk, discount: disc || '' });
        q.cards.forEach(function (l, k) { l.card = String(record.cards[k].card || 'Card'); });
        return { success: true, quote: q, onSheet: false };
      }
      return { success: false, error: 'Submission ' + code + ' isn’t on the Sheet, so there’s no quote for it.' };
    }
    if (record.discount !== undefined) {
      var text = String(record.discount || '').trim().replace(/^\$/, '');
      if (text && !/^\d+(\.\d+)?\s*%?$/.test(text)) return { success: false, error: 'Use a percent like 10% or a dollar amount like 15.' };
      if (/%$/.test(text) && parseFloat(text) > 100) return { success: false, error: 'A percent discount can’t be over 100%.' };
      subSheet.getRange(row, quoteCol_(subSheet, 'Your Discount')).setNumberFormat('@').setValue(text);
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try { return { success: true, quote: recalcQuote_(id), onSheet: true }; } finally { lock.releaseLock(); }
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// Column lookup by header name; adds the column at the end if it's missing.
var QUOTE_COL_CACHE_ = {};
function quoteCol_(sheet, header) {
  var key = sheet.getSheetId();
  if (!QUOTE_COL_CACHE_[key]) {
    QUOTE_COL_CACHE_[key] = {};
    var lc = sheet.getLastColumn();
    if (lc > 0) sheet.getRange(1, 1, 1, lc).getValues()[0].forEach(function (h, i) {
      h = String(h).trim();
      if (h && !QUOTE_COL_CACHE_[key][h]) QUOTE_COL_CACHE_[key][h] = i + 1;
    });
  }
  if (QUOTE_COL_CACHE_[key][header]) return QUOTE_COL_CACHE_[key][header];
  var c = Math.max(sheet.getLastColumn(), 1) + 1;
  if (sheet.getMaxColumns() < c) sheet.insertColumnsAfter(sheet.getMaxColumns(), c - sheet.getMaxColumns());
  sheet.getRange(1, c).setValue(header).setFontWeight('bold');
  QUOTE_COL_CACHE_[key][header] = c;
  return c;
}
function quoteParseMoney_(s) {
  if (typeof s === 'number') return isFinite(s) ? s : null;
  var t = String(s == null ? '' : s).replace(/[$,\s]/g, '');
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}
// Reads what customers type: "800", "$1,200", "1.2k", "~500", "500-600" (uses the first number).
function quoteParseValue_(s) {
  if (typeof s === 'number') return s > 0 ? s : null;
  var t = String(s == null ? '' : s).replace(/,/g, '');
  var m = t.match(/(\d+(?:\.\d+)?)\s*(k)?/i);
  if (!m) return null;
  var v = Number(m[1]) * (m[2] ? 1000 : 1);
  return v > 0 ? v : null;
}
function quoteRound2_(n) { return Math.round(n * 100) / 100; }
function quoteMoney_(n) {
  n = Number(n) || 0;
  return '$' + (n % 1 ? n.toFixed(2) : String(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}


/* =================================================================
 *  REVIEWS FROM THE ADMIN PORTAL
 *  {type:'portalReviews', token, op:'list'}  → every review, newest first
 *  {type:'portalReviews', token, op:'set', row, at, approved:true|false}
 *     turns one on/off (column F = YES/NO). "at" is the review's timestamp,
 *     so a row that moved (someone sorted the tab) is never changed by mistake.
 * ================================================================= */
function portalReviews_(record) {
  try {
    var token = String(record.token || '');
    if (!token || typeof sbIsAdmin_ !== 'function' || !sbIsAdmin_(token)) {
      return { success: false, error: 'Not signed in to the portal as an admin. Sign out and back in, then try again.' };
    }
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Reviews');
    if (!sheet) return { success: false, error: 'There’s no "Reviews" tab in the Sheet.' };
    var stamp = function (v) { return v instanceof Date ? v.toISOString() : String(v || ''); };

    if (record.op === 'set') {
      var row = Number(record.row);
      if (!(row >= 2 && row <= sheet.getLastRow())) return { success: false, error: 'That review wasn’t found. Refresh and try again.' };
      var lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try {
        var at = sheet.getRange(row, 1).getValue();
        if (stamp(at) !== String(record.at || '')) return { success: false, error: 'The Reviews tab changed. Refresh and try again.' };
        sheet.getRange(row, 6).setValue(record.approved ? 'YES' : 'NO');
      } finally { lock.releaseLock(); }
      return { success: true, row: row, approved: !!record.approved };
    }

    var out = [];
    if (sheet.getLastRow() >= 2) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues().forEach(function (r, i) {
        if (!r[1] && !r[4]) return;
        out.push({ row: i + 2, at: stamp(r[0]), name: String(r[1] || ''), rating: Number(r[2]) || 0,
                   card: String(r[3] || ''), text: String(r[4] || ''), approved: String(r[5]).trim().toUpperCase() === 'YES' });
      });
    }
    out.sort(function (a, b) { return b.at.localeCompare(a.at); });
    return { success: true, reviews: out };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}


/* =================================================================
 *  REFERRAL CODES (unchanged behaviour)
 * ================================================================= */
function getActiveReferralCodes() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Referral Codes');
  if (!sheet || sheet.getLastRow() < 2) return [];
  var codes = [];
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues().forEach(function (r) {
    var code = String(r[0] || '').trim().toUpperCase();
    if (code && String(r[2]).trim().toUpperCase() === 'YES') codes.push(code);
  });
  return codes;
}
function isValidReferralCode(code) {
  return getActiveReferralCodes().indexOf(String(code || '').trim().toUpperCase()) !== -1;
}


/* =================================================================
 *  HELPERS
 * ================================================================= */
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
// New website IDs look like "RR-7KQ4MX" and ARE the reference number.
// Older IDs ("sub_1727..._abc123") use their last 8 characters.
function refFromId_(id) {
  id = String(id || '');
  if (/^RR-/i.test(id)) return id.toUpperCase();
  return id.slice(-8).toUpperCase();
}
function normRef_(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function canonicalStatus_(s) {
  s = String(s || '').trim();
  if (!s) return STAGES[0];
  if (LEGACY_STATUS[s.toLowerCase()]) return LEGACY_STATUS[s.toLowerCase()];
  var all = STAGES.concat(SIDE_STATUSES);
  for (var i = 0; i < all.length; i++) if (all[i].toLowerCase() === s.toLowerCase()) return all[i];
  return s;
}
function firstName_(name) {
  var n = String(name || '').trim().split(/\s+/)[0];
  return n || 'there';
}
function trackUrl_(ref) {
  return SITE_URL + '/?track=' + encodeURIComponent(ref) + '#track';
}
function ownerEmail_() {
  if (OWNER_EMAIL) return OWNER_EMAIL;
  try { return Session.getEffectiveUser().getEmail(); } catch (e) { return ''; }
}
function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function asDate_(v) {
  if (v instanceof Date && !isNaN(v)) return v;
  if (typeof v === 'string' && v.trim()) { var d = new Date(v); return isNaN(d) ? null : d; }
  return null;
}
function addDays_(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
/** Whole calendar days from a to b in the business time zone. */
function daysBetween_(a, b) {
  var day = function (d) { return Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd').split('-').map(Number); };
  var x = day(a), y = day(b);
  return Math.round((Date.UTC(y[0], y[1] - 1, y[2]) - Date.UTC(x[0], x[1] - 1, x[2])) / 86400000);
}
function fmtDate_(d) { return Utilities.formatDate(d, TIMEZONE, 'EEEE, MMMM d, yyyy'); }
function isoOrBlank_(v) {
  if (v instanceof Date) return v.toISOString();
  return v ? String(v) : '';
}
function lastDataRow_(sheet, col) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  var vals = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]).trim()) return i + 2;
  return 1;
}
function historySheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hist = ss.getSheetByName(HISTORY_TAB);
  if (!hist) {
    hist = ss.insertSheet(HISTORY_TAB);
    hist.getRange(1, 1, 1, 6).setValues([['Timestamp', 'Submission ID', 'Card #', 'Card Name', 'Status', 'Note']]).setFontWeight('bold');
    hist.setFrozenRows(1);
  }
  return hist;
}
function logHistory_(id, num, cardName, status, note) {
  historySheet_().appendRow([new Date(), id, num, cardName || '', status, note || '']);
}
function getCardsFor_(id) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CARDS_TAB);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, CC.LAST_EMAILED).getValues()
    .filter(function (r) { return String(r[CC.ID - 1]) === id; })
    .map(function (r) {
      return {
        num: r[CC.NUM - 1], card: String(r[CC.NAME - 1] || ''), service: String(r[CC.SERVICE - 1] || ''),
        status: canonicalStatus_(r[CC.STATUS - 1]), updated: r[CC.UPDATED - 1],
        note: String(r[CC.NOTE - 1] || ''), tracking: String(r[CC.TRACKING - 1] || '')
      };
    });
}
function getHistoryFor_(id) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HISTORY_TAB);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues()
    .filter(function (r) { return String(r[1]) === id; })
    .map(function (r) { return { num: r[2], status: canonicalStatus_(r[4]), at: isoOrBlank_(r[0]) }; });
}