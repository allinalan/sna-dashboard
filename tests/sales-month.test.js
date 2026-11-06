// node tests/sales-month.test.js
// The Monthly Sales vs Standard board (2026-11-06): Ben asked to see each mentee's sales
// month by month against the standard; Alan set The Dojo $4,000 and The Path $6,000.
// Pulls the SALES_MONTH block out of index.html and pins the rules the texting job
// (sharpninja sales_standard.py, test_sales_standard.py) keeps too: the same Vector
// months, the same judgement day, the same "who is not judged", the same streak.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = src.match(/\/\*SALES_MONTH_BEGIN\*\/([\s\S]*?)\/\*SALES_MONTH_END\*\//);
if(!m){ console.error("FAIL: no SALES_MONTH block in index.html"); process.exit(1); }
const S = new Function(m[1] + ";return {SALES_STANDARD, salesMonths, salesMonthBefore, salesJudge, salesStreak, salesWeekly};")();

const D = (y, mo, d) => new Date(y, mo - 1, d);
const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const wk = obj => Array.from({length: 17}, (_, i) => obj[i + 1] === undefined ? null : obj[i + 1]);
const LATER = D(2026, 11, 6);
const path_ = (joined) => ({tier: "Path", joined: joined || D(2026, 7, 1)});
let n = 0;
const eq = (got, want, what) => { n++; assert.deepStrictEqual(got, want, what); };

// the calendar
const fall = S.salesMonths("Fall 2026");
eq(fall.map(x => [x.name, x.from, x.to]), [["September", 1, 4], ["October", 5, 8], ["November", 9, 12], ["December", 13, 17]], "Vector months");
eq(ymd(fall[1].first), "2026-09-29", "October starts 9/29 (a 9/30 call is October's)");
eq(ymd(fall[2].judge), "2026-11-26", "November is judged the Thursday after it ends");
eq(S.salesMonthBefore(fall[0]).campaign + " " + S.salesMonthBefore(fall[0]).name, "Summer 2026 August", "September's month before is August");

// one month
const OCT = fall[1];
const j = (w, rep, today) => S.salesJudge(OCT, wk(w), rep, today || LATER);
eq(j({5: 1500, 6: 1500, 7: 1500, 8: 1500}, path_()).status, "met", "$6,000 meets the Path standard");
eq(j({5: 1500, 6: 1500, 7: 1500}, path_()).status, "miss", "$4,500 is under it");
eq(j({5: 1500, 6: 1500, 7: 1500}, {tier: "Dojo"}).status, "met", "and meets the Dojo's $4,000");
eq(j({5: 1500}, path_()).reported, 1, "weeks with no check-in are not counted as reported");
eq(j({5: 10}, {tier: "Masters"}).status, "nostd", "The Masters has no standard");
eq(j({}, path_()).status, "noreport", "no check-ins = not judged");
eq(j({5: 10}, path_(D(2026, 10, 14))).status, "partial", "joined partway = not judged");
eq(j({5: 10}, path_(D(2026, 10, 2))).status, "miss", "joined in the first week counts");
eq(j({5: 10}, path_(D(2026, 11, 2))).status, "none", "joined after the month");
eq(j({5: 10}, path_(), D(2026, 10, 28)).status, "open", "the day before judgement it is still running");

// the streak, back across campaigns
const salesOf = map => c => wk(map[c] || {});
eq(S.salesStreak(OCT, salesOf({"Summer 2026": {16: 100}, "Fall 2026": {2: 100, 6: 100}}), path_(), LATER), 3, "Aug, Sep, Oct");
eq(S.salesStreak(OCT, salesOf({"Fall 2026": {2: 9000, 6: 100}}), path_(), LATER), 1, "a met September breaks it");
eq(S.salesStreak(OCT, salesOf({"Fall 2026": {6: 100}}), path_(), LATER), 1, "a September with no check-ins breaks it");
eq(S.salesStreak(OCT, salesOf({"Fall 2026": {6: 9000}}), path_(), LATER), 0, "a met month is no streak");

// every check-in counts: a mentee picked "Week 3" twice (9/22 and 9/29, really week 4), and filed week 1 on Monday night
const row = (Week, Timestamp, Demos_CPO, SVC_CPO) => ({RepID: "r9", Week: String(Week), Campaign: "Fall 2026", Timestamp, Demos_CPO, SVC_CPO: SVC_CPO || ""});
const twice = [row(3, D(2026, 9, 29), "0", "700"), row(1, new Date(2026, 8, 7, 22, 52), "200"), row(2, new Date(2026, 8, 15, 9, 56), "400"), row(3, new Date(2026, 8, 22, 11, 12), "0", "30")];
const wkD = S.salesWeekly(twice, "r9", "Fall 2026", w => w.Campaign, v => v);
eq(wkD.slice(0, 5), [200, 400, 30, 700, null], "a week picked twice lands on the week its timestamp closes");
eq(S.salesJudge(fall[0], wkD, {tier: "Dojo"}, LATER).sales, 1330, "so September keeps all $1,330");
eq(S.salesWeekly([row(7, new Date(2026, 9, 21, 10, 4), ""), row(7, new Date(2026, 9, 28, 10, 6), "500")], "r9", "Fall 2026", w => w.Campaign, v => v)[7], 500, "a second week 7 filed the next Tuesday is week 8");

console.log("all " + n + " passed");
