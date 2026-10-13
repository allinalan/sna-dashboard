// node tests/call-count.test.js
// How the Coaching Calls card counts a mentee's 1-on-1s, pulled out of
// index.html (the CALL_COUNT block) and run under node. Three rules, all
// Alan's, 2026-10-13: a month is a Vector month (a 9/30 call is an October
// call); a purple square in the same Tue–Mon week as a Calendly call is that
// call, not a second one; and OVERDUE starts when the month's last week does.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = src.match(/\/\*CALL_COUNT_BEGIN\*\/([\s\S]*?)\/\*CALL_COUNT_END\*\//);
if(!m){ console.error("FAIL: no CALL_COUNT block in index.html"); process.exit(1); }

/* the block reads four things off the page: the Calls and CallSurvey tabs, the
   hub's check-in board, and what a program owes. Dates here are already Dates,
   so the page's sheet-date parser is a pass-through. */
function page(calls, board, surveys){
  return new Function("CALLS_RAW", "SURVEY_RAW", "HUB_CAL", "callsRequired", "ciParseDate", "monthNorm",
    m[1] + "\n;return {vectorMonthOf, callTally, hubSquares, callState};")(
    calls || [], surveys || [], board === null ? null : {checkins: board || {}},     // null: the hub's feed never arrived
    r => ({Dojo:0, Path:1, Masters:2})[r.tier], v => v instanceof Date ? v : null, v => String(v || "").trim());
}
const at = (mo, d, h, mi) => new Date(2026, mo - 1, d, h || 0, mi || 0);
const call = (RepID, Status, when, Month) => ({RepID, Status, CallDateTime: when, Month: Month || ""});
const fall = marks => ({"Fall 2026": marks});
const PATH = {id:"r42", tier:"Path"}, MASTERS = {id:"r02", tier:"Masters"};
/* the four fields the card's words are built from */
const read = (pg, r, now) => { const c = pg.callState(r, now); return [c.completed, c.status, c.upcoming, c.hubWeek]; };
const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

const cases = [
  ["Fall 2026 is Sep Wk 1-4, Oct Wk 5-8, Nov Wk 9-12, Dec Wk 13-17, the hub board's months", () => {
    const {vectorMonthOf} = page();
    const span = d => { const v = vectorMonthOf(d); return [v.campaign, v.name, v.from, v.to, iso(v.weeks[0]), iso(v.weeks[v.weeks.length - 1]), v.calKey]; };
    assert.deepStrictEqual(span(at(9, 1)),   ["Fall 2026", "September", 1, 4, "2026-09-01", "2026-09-22", "2026-09"]);
    assert.deepStrictEqual(span(at(9, 28)),  ["Fall 2026", "September", 1, 4, "2026-09-01", "2026-09-22", "2026-09"]);
    assert.deepStrictEqual(span(at(9, 30)),  ["Fall 2026", "October", 5, 8, "2026-09-29", "2026-10-20", "2026-10"]);      // 9/30 is October
    assert.deepStrictEqual(span(at(10, 26)), ["Fall 2026", "October", 5, 8, "2026-09-29", "2026-10-20", "2026-10"]);      // a Monday closes its week
    assert.deepStrictEqual(span(at(10, 27)), ["Fall 2026", "November", 9, 12, "2026-10-27", "2026-11-17", "2026-11"]);    // Wk 9, though its Friday is 10/30
    assert.deepStrictEqual(span(at(11, 24)), ["Fall 2026", "December", 13, 17, "2026-11-24", "2026-12-22", "2026-12"]);   // Wk 13, though it starts in November
    assert.deepStrictEqual(span(at(12, 28)), ["Fall 2026", "December", 13, 17, "2026-11-24", "2026-12-22", "2026-12"]);
    assert.deepStrictEqual(span(at(12, 29)), ["Spring 2027", "January", 1, 4, "2026-12-29", "2027-01-19", "2027-01"]);    // its Friday is 1/1
  }],

  ["a Calendly call on 9/30 is an October call, whatever the Month column says", () => {
    const pg = page([call("r42", "completed", at(9, 30, 10, 15), "2026-09")]);
    assert.deepStrictEqual(read(pg, PATH, at(9, 22)), [0, "none", null, null]);      // September, Wk 4: not yet
    assert.deepStrictEqual(read(pg, PATH, at(10, 13)), [1, "done", null, null]);
  }],

  ["a purple square in the same week as a completed Calendly call is that call, not a second one", () => {
    const pg = page([call("r02", "completed", at(10, 7, 15))], fall({r02: {"2026-10-06": "one"}}));
    assert.deepStrictEqual(read(pg, MASTERS, at(10, 13)), [1, "none", null, null]);  // 1 of 2, where it used to read "all 2 done"
    assert.deepStrictEqual(read(pg, MASTERS, at(10, 8)), [1, "none", null, null]);   // and while that week is still running
  }],

  ["Maxton, 2026-10-13: a cancelled and a completed row on 9/30 plus a square on that week is one October call", () => {
    const pg = page([call("r42", "cancelled", at(9, 30, 10), "2026-09"), call("r42", "completed", at(9, 30, 10, 15), "2026-09")],
                    fall({r42: {"2026-09-29": "one"}}));
    assert.deepStrictEqual(read(pg, PATH, at(10, 13)), [1, "done", null, null]);
    assert.strictEqual(pg.callState({id:"r42", tier:"Masters"}, at(10, 13)).completed, 1);
  }],

  ["a square alone in its week is a call on Ben's calendar: booked while the week runs, completed once its Monday has passed", () => {
    const pg = page([], fall({r42: {"2026-10-13": "one"}}));
    assert.deepStrictEqual(read(pg, PATH, at(10, 13)), [0, "booked", null, at(10, 13)]);
    assert.deepStrictEqual(read(pg, PATH, at(10, 19)), [0, "booked", null, at(10, 13)]);   // Monday, the week's last day
    assert.deepStrictEqual(read(pg, PATH, at(10, 20)), [1, "done", null, null]);
  }],

  ["a cancelled Calendly row is not a call, so a square beside one counts by itself", () => {
    const pg = page([call("r42", "cancelled", at(10, 7, 9))], fall({r42: {"2026-10-06": "one"}}));
    assert.deepStrictEqual(read(pg, PATH, at(10, 13)), [1, "done", null, null]);
    assert.deepStrictEqual(read(page([call("r42", "cancelled", at(10, 7, 9))]), PATH, at(10, 13)), [0, "none", null, null]);
  }],

  ["a square beside a call Calendly still has as booked: the Calendly date while the week runs, done once it's over", () => {
    const pg = page([call("r42", "booked", at(10, 15, 16, 30))], fall({r42: {"2026-10-13": "one"}}));
    assert.deepStrictEqual(read(pg, PATH, at(10, 13)), [0, "booked", at(10, 15, 16, 30), null]);
    assert.deepStrictEqual(read(pg, PATH, at(10, 20)), [1, "done", null, null]);           // the coach's square says it happened
    assert.deepStrictEqual(read(page([call("r42", "booked", at(10, 15, 16, 30))]), PATH, at(10, 20)), [0, "booked", at(10, 15, 16, 30), null]);   // no square: Calendly's word stands
  }],

  ["a square covers one call in its week: two Calendly calls that week are still two", () => {
    const pg = page([call("r02", "completed", at(10, 6, 9)), call("r02", "survey_done", at(10, 8, 9))], fall({r02: {"2026-10-06": "one"}}));
    assert.deepStrictEqual(read(pg, MASTERS, at(10, 13)), [2, "done", null, null]);
  }],

  ["a square on a different week from the Calendly call is a second call", () => {
    const pg = page([call("r02", "completed", at(10, 1, 9))], fall({r02: {"2026-10-13": "one"}}));
    assert.deepStrictEqual(read(pg, MASTERS, at(10, 13)), [1, "booked", null, at(10, 13)]);
    assert.deepStrictEqual(read(pg, MASTERS, at(10, 20)), [2, "done", null, null]);
  }],

  ["Wk 9 (10/27) is November and Wk 13 (11/24) is December, for squares and Calendly calls alike", () => {
    const pg = page([call("r42", "completed", at(11, 25, 9), "2026-11")], fall({r42: {"2026-10-27": "one"}}));
    assert.deepStrictEqual(read(pg, PATH, at(10, 26)), [0, "none", null, null]);     // the square's Friday is 10/30, but October ended 10/26
    assert.deepStrictEqual(read(pg, PATH, at(10, 27)), [0, "booked", null, at(10, 27)]);
    assert.deepStrictEqual(read(pg, PATH, at(11, 3)), [1, "done", null, null]);
    const dec = page([call("r42", "completed", at(11, 25, 9), "2026-11")]);
    assert.deepStrictEqual(read(dec, PATH, at(11, 23)), [0, "none", null, null]);    // November's last day: an 11/25 call isn't November's
    assert.deepStrictEqual(read(dec, PATH, at(11, 24)), [1, "done", null, null]);
  }],

  ["the card turns over on the Tuesday a Vector month starts, not on the 1st", () => {
    const pg = page([call("r42", "completed", at(10, 8, 9))]);
    assert.strictEqual(pg.callState(PATH, at(10, 26)).status, "done");
    assert.strictEqual(pg.callState(PATH, at(10, 27)).status, "none");
    assert.strictEqual(pg.callState(PATH, at(11, 1)).status, "none");
  }],

  ["OVERDUE starts the day the month's last week does, and never on a finished month", () => {
    const none = page(), done = page([call("r42", "completed", at(10, 8, 9))]);
    assert.strictEqual(none.callState(PATH, at(10, 19)).overdue, false);             // Monday of Wk 7
    assert.strictEqual(none.callState(PATH, at(10, 20)).overdue, true);              // Tuesday, Wk 8 of 5-8
    assert.strictEqual(none.callState(PATH, at(10, 21)).overdue, true);              // the 21st was the old calendar cutoff
    assert.strictEqual(none.callState(PATH, at(10, 27)).overdue, false);             // November, Wk 9: a fresh month
    assert.strictEqual(none.callState(PATH, at(12, 21)).overdue, false);             // December has five weeks…
    assert.strictEqual(none.callState(PATH, at(12, 22)).overdue, true);              // …so it's Wk 17 that flags
    assert.strictEqual(done.callState(PATH, at(10, 22)).overdue, false);
    assert.strictEqual(done.callState({id:"r42", tier:"Masters"}, at(10, 22)).overdue, true);   // 1 of 2 in the last week
  }],

  ["a call still booked ahead holds OVERDUE off, through its own day and no longer", () => {
    const pg = page([call("r42", "booked", at(10, 22, 16, 30))]);
    assert.strictEqual(pg.callState(PATH, at(10, 20)).overdue, false);               // last week, but the call is Thursday
    assert.strictEqual(pg.callState(PATH, at(10, 22, 9)).overdue, false);            // the morning of the call
    assert.strictEqual(pg.callState(PATH, at(10, 22, 23)).overdue, false);           // that night, before Calendly's poll has marked it
    assert.deepStrictEqual([pg.callState(PATH, at(10, 23)).status, pg.callState(PATH, at(10, 23)).overdue], ["booked", true]);   // still "booked" the day after: never confirmed
    const romeo = page([call("r27", "booked", at(10, 20, 13))]);                     // Romeo, 2026-10-20: read OVERDUE on the day of his call
    assert.strictEqual(romeo.callState({id:"r27", tier:"Path"}, at(10, 20)).overdue, false);
  }],

  ["a purple square on the month's last week holds OVERDUE off too, while that week runs", () => {
    const pg = page([], fall({r42: {"2026-10-20": "one"}}));
    assert.deepStrictEqual([pg.callState(PATH, at(10, 20)).status, pg.callState(PATH, at(10, 20)).overdue], ["booked", false]);
    assert.deepStrictEqual([pg.callState(PATH, at(10, 26)).status, pg.callState(PATH, at(10, 26)).overdue], ["booked", false]);
  }],

  ["The Masters: one done and the next booked isn't overdue; one done and nothing booked is", () => {
    const next = page([call("r02", "completed", at(10, 7, 9)), call("r02", "booked", at(10, 23, 9))]);
    assert.strictEqual(next.callState(MASTERS, at(10, 20)).overdue, false);
    assert.strictEqual(page([call("r02", "completed", at(10, 7, 9))]).callState(MASTERS, at(10, 20)).overdue, true);
    assert.strictEqual(page([call("r02", "booked", at(10, 23, 9))]).callState(MASTERS, at(10, 20)).overdue, false);   // none done, one booked: quiet until that call is in
  }],

  ["a Calls row with no date is filed by its Month column, and can't be matched to a square", () => {
    const pg = page([call("r42", "completed", null, "2026-10"), call("r42", "completed", null, "2026-09")], fall({r42: {"2026-10-06": "one"}}));
    assert.strictEqual(pg.callState({id:"r42", tier:"Masters"}, at(10, 13)).completed, 2);   // the October row, plus the square
    assert.strictEqual(page([call("r42", "booked", null, "2026-10")]).callState(PATH, at(10, 13)).status, "none");   // an undated booking has nothing to show
  }],

  ["only this mentee's purple squares count: not a check-in, not another mentee's, not a bad key", () => {
    const pg = page([], {"Fall 2026": {r42: {"2026-10-06": "yes", "2026-09-29": "text", "nonsense": "one"}, r02: {"2026-10-06": "one"}}, "Summer 2026": {r42: {"2026-08-04": "one"}}});
    assert.deepStrictEqual(pg.hubSquares(PATH).map(iso), ["2026-08-04"]);
    assert.deepStrictEqual(read(pg, PATH, at(10, 13)), [0, "none", null, null]);
    assert.deepStrictEqual(read(page([], null), PATH, at(10, 13)), [0, "none", null, null]);   // the hub's feed never arrived
  }],

  ["The Dojo owes no 1-on-1s", () => {
    const c = page([call("r07", "completed", at(10, 8, 9))]).callState({id:"r07", tier:"Dojo"}, at(10, 13));
    assert.deepStrictEqual([c.req, c.status, c.overdue], [0, "na", false]);
  }]
];

let failed = 0;
for(const [name, fn] of cases){
  try{ fn(); }
  catch(e){ failed++; console.error("FAIL: " + name + "\n  " + (e && e.message)); }
}
if(failed){ console.error(`\n${failed} of ${cases.length} failing`); process.exit(1); }
console.log(`\nall ${cases.length} passing`);
