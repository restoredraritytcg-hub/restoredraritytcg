/*******************************************************************
 * RESTORED RARITY — status emails sent from the portal
 * Version: 2026-10-24
 *
 * Lets the admin portal's "Send status email" button use the same branded
 * card-update email as the Sheet, and keeps the Sheet in step so the website's
 * "Track Your Submission" and the day-25 / day-30 pickup reminders keep working.
 *
 * Only someone signed in to the portal as an admin can use it: the portal sends
 * its Supabase sign-in token and a submission code; this script checks the token
 * with Supabase and reads the submission itself.
 *
 * SETUP (once)
 *  1. In the Apps Script editor: + (Add a file) → Script → name it PortalEmails,
 *     and paste this whole file in.
 *  2. In the main file's doPost, right after the "// Reviews" block, add:
 *         if (record.type === 'statusEmail') return json_(portalStatusEmail_(record));
 *  3. In the main file's doGet, next to the other "if (action === ...)" lines, add:
 *         if (action === 'portalEmails') return json_({ success: true, version: 1 });
 *  4. Deploy → Manage deployments → pencil → Version: New version → Deploy.
 *     (Same web app URL, so the website keeps working.)
 *******************************************************************/

// Same public values as portal/config.js (the publishable key is meant to be public).
var SUPABASE_URL = 'https://bcozwalfszzuecjjqgam.supabase.co';
var SUPABASE_KEY = 'sb_publishable_b2ZuOakWdzFaIJP3_jfLzg_VXePqruz';

// Portal status → the Sheet stage whose email wording is used (STAGE_EMAILS in the main file).
var PORTAL_STAGE = {
  submitted: 'Submission Received',
  received: 'In Queue',
  in_progress: 'In Progress',
  restored: 'Stabilizing',
  ready: 'Ready to Ship / Pick Up',
  completed: 'Order Completed / Picked Up / Shipped'
};

/** Returns { success, sent, cards } or { success: false, error }. Never throws. */
function portalStatusEmail_(record) {
  try {
    var token = String(record.token || ''), code = String(record.code || '').trim();
    if (!token || !code) return { success: false, error: 'Missing sign-in or submission code.' };
    if (!sbIsAdmin_(token)) return { success: false, error: 'Not signed in to the portal as an admin. Sign out and back in, then try again.' };

    var rows = sbGet_(token, 'submissions?code=eq.' + encodeURIComponent(code) +
      '&select=code,status,internal_notes,customers(name,email),cards(card_number,name,status,public_notes)');
    var s = rows && rows[0];
    if (!s) return { success: false, error: 'No submission ' + code + ' in the portal.' };
    var cust = s.customers || {};
    if (!cust.email) return { success: false, error: 'This customer has no email address on file.' };
    if (!SEND_CUSTOMER_EMAILS) return { success: false, error: 'Customer emails are paused (SEND_CUSTOMER_EMAILS in the script).' };

    var cards = (s.cards || []).sort(function (a, b) { return a.card_number - b.card_number; }).map(function (c) {
      return { num: c.card_number, card: c.name || 'Card ' + c.card_number,
               status: PORTAL_STAGE[c.status] || c.status, note: c.public_notes || '', tracking: '' };
    });

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      // Cards the Sheet already emailed about at this stage are left out, so nobody gets a status twice.
      var sheetRows = sheetCardRows_(code);
      var hasSheet = Object.keys(sheetRows).length > 0;
      var changes = cards.filter(function (c) {
        if (!STAGE_EMAILS[c.status]) return false;
        var r = sheetRows[String(c.num)];
        return !r || r.lastEmailed !== c.status;
      });
      if (!changes.length) return { success: true, sent: false, cards: 0 };

      var sheetSub = hasSheet ? (submissionsById_()[code] || {}) : {};
      var delivery = sheetSub.delivery || ((String(s.internal_notes || '').match(/Delivery:\s*(.*)/) || [])[1] || '');
      sendCardUpdateEmail_({
        id: code, ref: refFromId_(code), name: cust.name || '', email: cust.email, delivery: delivery,
        overall: PORTAL_STAGE[s.status] || '', cards: cards
      }, changes);

      // Mirror into the Sheet exactly like a dropdown change would (scripted edits don't fire onStatusEdit).
      if (hasSheet) {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CARDS_TAB);
        var now = new Date();
        changes.forEach(function (c) {
          var r = sheetRows[String(c.num)];
          if (!r) return;
          sheet.getRange(r.row, CC.STATUS).setValue(c.status);
          sheet.getRange(r.row, CC.UPDATED).setValue(now);
          sheet.getRange(r.row, CC.LAST_EMAILED).setValue(c.status);
          if (c.note) sheet.getRange(r.row, CC.NOTE).setValue(c.note);
          if (c.status === 'Ready to Ship / Pick Up') {
            sheet.getRange(r.row, CC.COMPLETED).setValue(now);   // starts the pickup clock
            sheet.getRange(r.row, CC.R25, 1, 3).clearContent();
          }
          logHistory_(code, c.num, c.card, c.status, (c.note ? c.note + ' ' : '') + '(sent from portal)');
        });
        updateOverallStatus_(code);
      }
      return { success: true, sent: true, cards: changes.length };
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error('Portal status email failed: ' + err);
    return { success: false, error: String(err) };
  }
}

/** Card # → { row, lastEmailed } for one submission on the Cards tab. */
function sheetCardRows_(id) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CARDS_TAB);
  var out = {};
  if (!sheet || sheet.getLastRow() < 2) return out;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, CC.LAST_EMAILED).getValues().forEach(function (r, i) {
    if (String(r[CC.ID - 1]) !== id) return;
    out[String(r[CC.NUM - 1])] = { row: i + 2, lastEmailed: canonicalStatus_(r[CC.LAST_EMAILED - 1]) };
  });
  return out;
}

function sbHeaders_(token) {
  return { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token };
}
/** True only for a valid, current sign-in whose email is on the portal's admins list. */
function sbIsAdmin_(token) {
  var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/is_admin', {
    method: 'post', contentType: 'application/json', payload: '{}',
    headers: sbHeaders_(token), muteHttpExceptions: true
  });
  return res.getResponseCode() === 200 && String(res.getContentText()).trim() === 'true';
}
function sbGet_(token, path) {
  var res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: sbHeaders_(token), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Supabase answered ' + res.getResponseCode() + ': ' + res.getContentText());
  return JSON.parse(res.getContentText());
}
