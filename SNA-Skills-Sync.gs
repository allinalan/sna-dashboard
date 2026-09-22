/**
 * Sharp Ninja Academy — Skillset tracker storage
 * ─────────────────────────────────────────────────────────────────────────
 * Holds every mentee's 1–10 ratings (and their coach's read) for the skills on
 * the Skillset tab of https://allinalan.github.io/sna-dashboard/, plus the
 * skill catalog itself so coaches can add, rename and retire skills without a
 * code change.
 *
 * It is deliberately its OWN script and its OWN spreadsheet, separate from the
 * performance sheet and from the hub's data: a rep tapping numbers on their
 * phone can never touch the sheet the whole academy's sales run on.
 *
 * RATINGS ARE VERSIONED, NEVER OVERWRITTEN (Ben, 2026-09-21). Each rep's board
 * is a series of dated versions. A version stays editable for a week; the first
 * edit after that opens a new one carrying every rating forward. The ROLLOVER
 * IS DECIDED HERE, not in the browser, so forty devices with forty slightly
 * wrong clocks can't disagree about which version an edit belongs to.
 *
 * SETUP — about three minutes, once:
 *   1. script.google.com  ▸  New project  ▸  paste this whole file over
 *      whatever is there  ▸  name it "SNA Skills Sync".
 *   2. SAVE FIRST (disk icon, or Cmd/Ctrl+S). The toolbar's function dropdown
 *      only lists what is in the SAVED file, so until you save it still says
 *      "myFunction" and there is no setup to pick — which looks exactly like
 *      this step is missing. Then pick  setup  in that dropdown  ▸  ▷ Run.
 *      Google warns "Google hasn't verified this app" — expected for a script
 *      you wrote yourself this morning. Review permissions ▸ your account ▸
 *      Advanced (bottom left) ▸ "Go to SNA Skills Sync (unsafe)" ▸ Allow.
 *      It only ever touches the spreadsheet it creates itself.
 *      The Execution log then prints the new sheet's URL.
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
var CAT_TAB = 'Catalog';
var HEAD = ['RepID', 'VersionID', 'CreatedAt', 'ClosesAt', 'Campaign',
            'Self', 'Coach', 'Focus', 'UpdatedAt', 'UpdatedBy'];
var DEFAULT_WINDOW_DAYS = 7;
var CHUNK = 40000;          // a cell holds ~50k chars; leave headroom
var CHUNK_MARK = '~';

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
    sh.setColumnWidth(2, 140);
  }
  // F–H hold JSON. Plain text, or Sheets decides a map that starts with a
  // digit is a number and quietly eats it — the bite the hub's sync took
  // twice. Safe to re-run.
  sh.getRange(1, 6, sh.getMaxRows(), 3).setNumberFormat('@');

  var cat = ss.getSheetByName(CAT_TAB) || ss.insertSheet(CAT_TAB);
  if (!cat.getRange('A1').getValue()) {
    cat.getRange('A1:B4').setValues([['rev', 0], ['updated', ''], ['by', ''], ['json', '']]);
    cat.getRange('A1:A4').setFontWeight('bold');
    cat.setColumnWidth(1, 90);
  }
  cat.getRange(4, 2, cat.getMaxRows() - 3, 1).setNumberFormat('@');

  Logger.log('Tabs "' + TAB + '" and "' + CAT_TAB + '" ready.');
  Logger.log('NEXT: Deploy > New deployment > Web app > Execute as Me, Access Anyone.');
  Logger.log('THEN: paste the /exec URL into CONFIG.SKILLS_URL in index.html.');
  return ss.getUrl();
}

function book_() {
  var id = PropertiesService.getScriptProperties().getProperty(PROP_SHEET);
  if (!id) throw new Error('Run setup() first');
  return SpreadsheetApp.openById(id);
}
function sheet_() {
  var sh = book_().getSheetByName(TAB);
  if (!sh) throw new Error('Tab "' + TAB + '" is missing — run setup() again');
  return sh;
}
function catSheet_() {
  var sh = book_().getSheetByName(CAT_TAB);
  if (!sh) throw new Error('Tab "' + CAT_TAB + '" is missing — run setup() again');
  return sh;
}

/* ── read ───────────────────────────────────────────────────────────────
   ?token=…            every version of everyone (the coaches' team board)
   ?token=…&rep=r01    just that mentee (what a rep's own page asks for)
   Both also get the catalog, which is shared. */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if ((p.token || '') !== TOKEN) return json_({ ok: false, error: 'bad token' });
    var want = String(p.rep || '').trim().toLowerCase();
    var rows = readAll_().filter(function (r) {
      return !want || String(r.RepID).toLowerCase() === want;
    });
    var cat = readCatalog_();
    return json_({ ok: true, versions: rows, catalog: cat.catalog, catalogRev: cat.rev });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ── write ────────────────────────────────────────────────────────────── */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = JSON.parse(e.postData.contents);
    if ((body.token || '') !== TOKEN) return json_({ ok: false, error: 'bad token' });

    if (body.action === 'saveSkills')  return saveSkills_(body);
    if (body.action === 'saveCatalog') return saveCatalog_(body);
    if (body.action === 'seedCatalog') return seedCatalog_(body);
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/* { token, action:'saveSkills', repId, self:{id:1..10|null}, coach:{…},
     focus:[id] | null, campaign, windowDays, by }

   self/coach are PATCHES, not replacements: only the skills that changed come
   up the wire and they are merged into whatever the open version holds. A rep
   rating themselves while their coach rates them therefore can't wipe the
   coach's column, and neither can wipe a skill they didn't touch. A null value
   clears one. focus, when present, replaces the list outright — it is five
   items and the ORDER IS THE RANK, so it always travels whole. */
function saveSkills_(body) {
  var repId = String(body.repId || '').trim();
  if (!repId) return json_({ ok: false, error: 'repId is required' });

  var windowDays = Math.min(90, Math.max(1, Number(body.windowDays) || DEFAULT_WINDOW_DAYS));
  var sh = sheet_();
  var all = readAll_().filter(function (r) { return String(r.RepID) === repId; });
  all.sort(function (a, b) { return new Date(a.CreatedAt) - new Date(b.CreatedAt); });

  var now = new Date();
  var last = all.length ? all[all.length - 1] : null;
  var isOpen = last && now.getTime() < new Date(last.ClosesAt).getTime();
  var ver, rowAt;

  if (isOpen) {
    ver = last;
    rowAt = findRow_(sh, repId, ver.VersionID);
  } else {
    // a new dated version, carrying every rating forward — nothing resets
    ver = {
      RepID: repId,
      // the browser proposes the id so both sides name the same version; it is
      // only ever taken when a new version is actually being opened, so two
      // devices rolling over at once still end up in one version
      VersionID: String(body.newVersionId || ('v' + now.getTime())).slice(0, 40),
      CreatedAt: now.toISOString(),
      ClosesAt: new Date(now.getTime() + windowDays * 86400000).toISOString(),
      Campaign: String(body.campaign || (last && last.Campaign) || ''),
      Self: last ? cloneMap_(last.Self) : {},
      Coach: last ? cloneMap_(last.Coach) : {},
      Focus: last ? (last.Focus || []).slice() : []
    };
    rowAt = 0;
  }

  mergeRatings_(ver.Self = ver.Self || {}, body.self);
  mergeRatings_(ver.Coach = ver.Coach || {}, body.coach);
  if (body.focus !== null && body.focus !== undefined && body.focus.length !== undefined)
    ver.Focus = body.focus.slice(0, 20).map(String);

  ver.UpdatedAt = now.toISOString();
  ver.UpdatedBy = String(body.by || '');

  var row = [ver.RepID, ver.VersionID, ver.CreatedAt, ver.ClosesAt, ver.Campaign,
             JSON.stringify(ver.Self), JSON.stringify(ver.Coach), JSON.stringify(ver.Focus || []),
             ver.UpdatedAt, ver.UpdatedBy];
  var at = rowAt || sh.getLastRow() + 1;
  sh.getRange(at, 6, 1, 3).setNumberFormat('@');
  sh.getRange(at, 1, 1, HEAD.length).setValues([row]);
  SpreadsheetApp.flush();

  return json_({ ok: true, version: ver, opened: !isOpen, rated: Object.keys(ver.Self).length });
}

/* { token, action:'saveCatalog', catalog, baseRev, by }
   Optimistic concurrency, same as the hub's sync: if someone else edited the
   skills since this browser last read them, hand theirs back rather than
   silently flattening it. */
function saveCatalog_(body) {
  if (!(body.catalog instanceof Array) || !body.catalog.length)
    return json_({ ok: false, error: 'catalog must be a non-empty array' });
  var cur = readCatalog_();
  if (body.baseRev !== undefined && Number(body.baseRev) !== cur.rev)
    return json_({ ok: false, conflict: true, catalog: cur.catalog, catalogRev: cur.rev });
  var next = cur.rev + 1;
  writeCatalog_(body.catalog, next, String(body.by || ''));
  return json_({ ok: true, catalogRev: next });
}

/* First run anywhere: the dashboard offers its built-in list so there is
   something to edit. Taken only if nothing is stored, so forty browsers
   loading at once can't fight over it. */
function seedCatalog_(body) {
  var cur = readCatalog_();
  if (cur.catalog && cur.catalog.length)
    return json_({ ok: true, catalog: cur.catalog, catalogRev: cur.rev, seeded: false });
  if (!(body.catalog instanceof Array) || !body.catalog.length)
    return json_({ ok: false, error: 'catalog must be a non-empty array' });
  writeCatalog_(body.catalog, 1, 'seed');
  return json_({ ok: true, catalog: body.catalog, catalogRev: 1, seeded: true });
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
    if (!String(r[0] || '').trim() || !String(r[1] || '').trim()) continue;
    out.push({
      RepID: String(r[0]), VersionID: String(r[1]),
      CreatedAt: iso_(r[2]), ClosesAt: iso_(r[3]), Campaign: String(r[4] || ''),
      Self: parseMap_(r[5]), Coach: parseMap_(r[6]), Focus: parseList_(r[7]),
      UpdatedAt: iso_(r[8]), UpdatedBy: String(r[9] || '')
    });
  }
  return out;
}
function findRow_(sh, repId, versionId) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var keys = sh.getRange(2, 1, last - 1, 2).getValues();
  for (var i = 0; i < keys.length; i++)
    if (String(keys[i][0]).trim() === repId && String(keys[i][1]).trim() === versionId)
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
function cloneMap_(m) {
  var o = {};
  for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) o[k] = m[k];
  return o;
}
function readCatalog_() {
  var sh = catSheet_();
  var rev = Number(sh.getRange('B1').getValue() || 0);
  var text = readChunks_(sh);
  var cat = null;
  try { cat = text ? JSON.parse(text) : null; } catch (e) { cat = null; }
  return { rev: rev, catalog: (cat instanceof Array) ? cat : null };
}
function writeCatalog_(catalog, rev, by) {
  var sh = catSheet_();
  writeChunks_(sh, JSON.stringify(catalog));
  sh.getRange('B1').setValue(rev);
  sh.getRange('B2').setValue(new Date().toISOString());
  sh.getRange('B3').setValue(by || '');
  SpreadsheetApp.flush();
}
/* The catalog is split across cells so it can grow past one cell's limit, and
   every chunk is stored behind a "~" so Sheets can never read one as a
   formula, a number or TRUE — the same guard the hub's sync needed. */
function writeChunks_(sh, text) {
  var parts = [];
  for (var i = 0; i < text.length; i += CHUNK) parts.push([CHUNK_MARK + text.substr(i, CHUNK)]);
  if (!parts.length) parts = [[CHUNK_MARK]];
  var last = Math.max(sh.getLastRow(), 4);
  if (last >= 4) sh.getRange(4, 2, last - 3, 1).clearContent();
  var target = sh.getRange(4, 2, parts.length, 1);
  target.setNumberFormat('@');
  target.setValues(parts);
}
function readChunks_(sh) {
  var last = sh.getLastRow();
  if (last < 4) return '';
  var vals = sh.getRange(4, 2, last - 3, 1).getValues();
  return vals.map(function (r) {
    var s = String(r[0] || '');
    return s.charAt(0) === CHUNK_MARK ? s.slice(1) : s;
  }).join('');
}
function parseMap_(v) {
  try { var o = JSON.parse(String(v || '{}')); return (o && typeof o === 'object' && !(o instanceof Array)) ? o : {}; }
  catch (e) { return {}; }
}
function parseList_(v) {
  try { var a = JSON.parse(String(v || '[]')); return (a instanceof Array) ? a : []; }
  catch (e) { return []; }
}
function iso_(v) { return v instanceof Date ? v.toISOString() : String(v || ''); }
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}
