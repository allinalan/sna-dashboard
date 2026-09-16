/**
 * Sharp Ninja Academy — Skillset tracker storage
 * ─────────────────────────────────────────────────────────────────────────
 * Holds every mentee's 1–10 self rating (and their coach's read) for the 137
 * skills on the Skillset tab of https://allinalan.github.io/sna-dashboard/.
 *
 * It is deliberately its OWN script and its OWN spreadsheet, separate from the
 * performance sheet and from the hub's data: a rep tapping numbers on their
 * phone can never touch the sheet the whole academy's sales run on.
 *
 * SETUP — about three minutes, once:
 *   1. script.google.com  ▸  New project  ▸  paste this whole file over
 *      whatever is there  ▸  name it "SNA Skills Sync".
 *   2. Run  setup()  once. Approve the permission prompt (it's your own script
 *      asking to make a spreadsheet). The Execution log prints the new sheet's
 *      URL — that's where the ratings will live.
 *   3. Deploy ▸ New deployment ▸ type "Web app"
 *        Execute as:      Me
 *        Who has access:  Anyone
 *      ▸ Deploy ▸ copy the /exec URL.
 *   4. Paste that URL into  CONFIG.SKILLS_URL  in index.html and push.
 *      Until you do, the tracker still works — it just keeps each rating in
 *      the browser that made it, and says so on the page.
 *
 * If you ever change this file, you must Deploy ▸ Manage deployments ▸ edit ▸
 * New version, or the web app keeps serving the old code.
 */

// Must match CONFIG.SKILLS_TOKEN in the dashboard's index.html.
var TOKEN = 'sharpninja';

var PROP_SHEET = 'SKILLS_SHEET_ID';
var TAB = 'Skills';
var HEAD = ['RepID', 'Campaign', 'Self', 'Coach', 'Focus', 'UpdatedAt', 'UpdatedBy'];

/* ── one-time setup ─────────────────────────────────────────────────── */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_SHEET);
  var ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
    Logger.log('Already set up. Reusing: ' + ss.getUrl());
  } else {
    ss = SpreadsheetApp.create('SNA Skills Data');
    props.setProperty(PROP_SHEET, ss.getId());
    Logger.log('Created: ' + ss.getUrl());
  }
  var sh = ss.getSheetByName(TAB) || ss.insertSheet(TAB);
  if (!sh.getRange('A1').getValue()) {
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 90);
    sh.setColumnWidth(2, 110);
  }
  // Columns C–E hold JSON. Plain text, or Sheets will happily decide a map
  // that starts with a digit is a number and quietly eat it — the same bite
  // the hub's sync took twice. Safe to re-run.
  sh.getRange(1, 3, sh.getMaxRows(), 3).setNumberFormat('@');
  Logger.log('Tab "' + TAB + '" ready.');
  Logger.log('NEXT: Deploy > New deployment > Web app > Execute as Me, Access Anyone.');
  Logger.log('THEN: paste the /exec URL into CONFIG.SKILLS_URL in index.html.');
  return ss.getUrl();
}

function sheet_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_SHEET);
  if (!id) throw new Error('Run setup() first');
  var sh = SpreadsheetApp.openById(id).getSheetByName(TAB);
  if (!sh) throw new Error('Tab "' + TAB + '" is missing — run setup() again');
  return sh;
}

/* ── read ───────────────────────────────────────────────────────────────
   ?token=…            every row (the coaches' team board)
   ?token=…&rep=r01    just that mentee (what a rep's own page asks for) */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if ((p.token || '') !== TOKEN) return json_({ ok: false, error: 'bad token' });
    var want = String(p.rep || '').trim().toLowerCase();
    var rows = readAll_().filter(function (r) {
      return !want || String(r.RepID).toLowerCase() === want;
    });
    return json_({ ok: true, rows: rows });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ── write ──────────────────────────────────────────────────────────────
   { token, action:'saveSkills', repId, campaign,
     self:{ skillId: 1..10 | null }, coach:{ … }, focus:[ skillId ] | null, by }

   self/coach are PATCHES, not replacements: only the skills that changed come
   up the wire, and they are merged into whatever is stored. A rep rating
   themselves while their coach rates them therefore can't wipe the coach's
   column, and neither of them can wipe a skill they didn't touch. A null value
   means "clear this one". focus, when present, replaces the list outright —
   it's five items, and it's always the whole list the page is holding. */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = JSON.parse(e.postData.contents);
    if ((body.token || '') !== TOKEN) return json_({ ok: false, error: 'bad token' });
    if (body.action !== 'saveSkills') return json_({ ok: false, error: 'unknown action' });

    var repId = String(body.repId || '').trim();
    var campaign = String(body.campaign || '').trim();
    if (!repId || !campaign) return json_({ ok: false, error: 'repId and campaign are required' });

    var sh = sheet_();
    var found = findRow_(sh, repId, campaign);          // 1-based sheet row, or 0
    var cur = found
      ? { Self: parseMap_(sh.getRange(found, 3).getValue()),
          Coach: parseMap_(sh.getRange(found, 4).getValue()),
          Focus: parseList_(sh.getRange(found, 5).getValue()) }
      : { Self: {}, Coach: {}, Focus: [] };

    mergeRatings_(cur.Self, body.self);
    mergeRatings_(cur.Coach, body.coach);
    if (body.focus !== null && body.focus !== undefined && body.focus.length !== undefined)
      cur.Focus = body.focus.slice(0, 20).map(String);

    var stamp = new Date().toISOString();
    var row = [repId, campaign, JSON.stringify(cur.Self), JSON.stringify(cur.Coach),
               JSON.stringify(cur.Focus), stamp, String(body.by || '')];
    var at = found || sh.getLastRow() + 1;
    var target = sh.getRange(at, 1, 1, HEAD.length);
    sh.getRange(at, 3, 1, 3).setNumberFormat('@');
    target.setValues([row]);
    SpreadsheetApp.flush();

    return json_({ ok: true, updated: stamp, rated: Object.keys(cur.Self).length });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/* ── helpers ────────────────────────────────────────────────────────── */
function readAll_() {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, HEAD.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!String(r[0] || '').trim()) continue;
    out.push({
      RepID: String(r[0]), Campaign: String(r[1]),
      Self: parseMap_(r[2]), Coach: parseMap_(r[3]), Focus: parseList_(r[4]),
      UpdatedAt: r[5] instanceof Date ? r[5].toISOString() : String(r[5] || ''),
      UpdatedBy: String(r[6] || '')
    });
  }
  return out;
}
function findRow_(sh, repId, campaign) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var keys = sh.getRange(2, 1, last - 1, 2).getValues();
  for (var i = 0; i < keys.length; i++)
    if (String(keys[i][0]).trim() === repId && String(keys[i][1]).trim() === campaign)
      return i + 2;
  return 0;
}
/* a rating is a whole number 1–10 or it isn't a rating */
function mergeRatings_(into, patch) {
  if (!patch || typeof patch !== 'object') return;
  for (var k in patch) {
    if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
    var v = patch[k];
    if (v === null || v === undefined || v === '') { delete into[k]; continue; }
    v = Math.round(Number(v));
    if (!(v >= 1 && v <= 10)) { delete into[k]; continue; }
    into[k] = v;
  }
}
function parseMap_(v) {
  try { var o = JSON.parse(String(v || '{}')); return (o && typeof o === 'object' && !(o instanceof Array)) ? o : {}; }
  catch (e) { return {}; }
}
function parseList_(v) {
  try { var a = JSON.parse(String(v || '[]')); return (a instanceof Array) ? a : []; }
  catch (e) { return []; }
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
