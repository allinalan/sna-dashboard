// node tests/call-words.test.js
// The words on the Coaching Calls card, pulled out of index.html (the
// CALL_WORDS block) and run under node. The Masters owe two 1-on-1s a month, so
// one down has to read as one down: it used to say "not booked", the same as
// none at all (2026-10-13).
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = src.match(/\/\*CALL_WORDS_BEGIN\*\/([\s\S]*?)\/\*CALL_WORDS_END\*\//);
if(!m){ console.error("FAIL: no CALL_WORDS block in index.html"); process.exit(1); }
const M = new Function(m[1] + "\n;return {callPart, callRowBits};")();

/* what callState() hands back, with only the fields the words read */
const cs = (req, completed, status, extra) => Object.assign({req, completed, status, overdue:false, upcoming:null, hubWeek:null}, extra);
const row = (...a) => M.callRowBits(cs(...a));

const cases = [
  ["one of two done, nothing else on the books, is its own state", () => {
    assert.deepStrictEqual(row(2, 1, "none"), {cls:"s-part", lab:"1 of 2 done · next not booked"});
  }],

  ["one of two done with the next one booked says both", () => {
    assert.deepStrictEqual(row(2, 1, "booked", {upcoming:new Date(2026, 9, 20, 16, 30)}), {cls:"s-booked", lab:"1 of 2 done · next booked 10/20"});
    assert.deepStrictEqual(row(2, 1, "booked", {hubWeek:new Date(2026, 9, 13)}), {cls:"s-booked", lab:"1 of 2 done · next booked · wk of 10/13"});
  }],

  ["nothing done reads exactly as it did before", () => {
    assert.deepStrictEqual(row(1, 0, "none"), {cls:"s-none", lab:"not booked"});
    assert.deepStrictEqual(row(2, 0, "none"), {cls:"s-none", lab:"not booked"});
    assert.deepStrictEqual(row(1, 0, "booked", {upcoming:new Date(2026, 9, 20)}), {cls:"s-booked", lab:"booked 10/20"});
    assert.deepStrictEqual(row(2, 0, "booked", {hubWeek:new Date(2026, 9, 13)}), {cls:"s-booked", lab:"booked · wk of 10/13"});
  }],

  ["a finished month reads exactly as it did before", () => {
    assert.deepStrictEqual(row(1, 1, "done"), {cls:"s-done", lab:"done ✓"});
    assert.deepStrictEqual(row(2, 2, "done"), {cls:"s-done", lab:"all 2 done ✓"});
    assert.deepStrictEqual(row(2, 3, "done"), {cls:"s-done", lab:"all 2 done ✓"});       // an extra call is still done
  }],

  ["overdue keeps its flag and still says how far along", () => {
    assert.deepStrictEqual(row(2, 1, "none", {overdue:true}), {cls:"s-part od", lab:"OVERDUE · 1 of 2 done · next not booked"});
    assert.deepStrictEqual(row(1, 0, "none", {overdue:true}), {cls:"s-none od", lab:"OVERDUE · not booked"});
  }],

  ["the lead-in is empty unless a month is partway", () => {
    assert.strictEqual(M.callPart(cs(2, 1, "none")), "1 of 2 done");
    for(const c of [cs(2, 0, "none"), cs(2, 2, "done"), cs(1, 0, "none"), cs(1, 1, "done"), cs(0, 0, "na")])
      assert.strictEqual(M.callPart(c), "");
  }]
];

let failed = 0;
for(const [name, fn] of cases){
  try{ fn(); }
  catch(e){ failed++; console.error("FAIL: " + name + "\n  " + (e && e.message)); }
}
if(failed){ console.error(`\n${failed} of ${cases.length} failing`); process.exit(1); }
console.log(`\nall ${cases.length} passing`);
