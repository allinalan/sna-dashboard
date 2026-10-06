// node tests/skills-sync.test.js
// SNA-Skills-Sync.gs — the skillset tracker's storage — run under node on
// in-memory fakes: the weekly versions, the patch merge, correcting a version
// in place (2026-10-06), and the read-back every save answers with.
"use strict";
const assert = require("assert");
const path = require("path");
const {makeGas, loadGs} = require("./gas-fakes.js");

const GS = path.join(__dirname, "..", "SNA-Skills-Sync.gs");
const T = "sharpninja";
const DAY = 86400000;

/* a fresh script on a fresh sheet, with the clock at `now` */
function boot(now){
  const gas = makeGas({now: now || "2026-09-01T17:00:00.000Z"});
  const api = loadGs(GS, gas.globals);
  api.setup();
  const at = iso => { gas.state.now = iso; };
  const save = (repId, extra) => api.post(Object.assign({token:T, action:"saveSkills", repId, by:"test"}, extra));
  const versions = repId => api.get({token:T, rep:repId}).versions;
  return {gas, api, at, save, versions};
}

const cases = [
  ["a wrong token reads nothing and writes nothing", () => {
    const {api, versions} = boot();
    assert.deepStrictEqual(api.get({token:"nope"}), {ok:false, error:"bad token"});
    assert.strictEqual(api.post({token:"nope", action:"saveSkills", repId:"r01", self:{a:5}}).ok, false);
    assert.strictEqual(versions("r01").length, 0);
  }],

  ["every reply says what this deployment can do", () => {
    const {api, save} = boot();
    assert.strictEqual(api.get({token:T}).api, 2);
    assert.strictEqual(save("r01", {self:{a:5}}).api, 2);
  }],

  ["the first rating opens a version that closes a week later", () => {
    const {save} = boot("2026-09-01T17:00:00.000Z");
    const j = save("r01", {self:{a:5}, newVersionId:"vFIRST", campaign:"Fall 2026"});
    assert.strictEqual(j.ok, true);
    assert.strictEqual(j.opened, true);
    assert.strictEqual(j.edited, false);
    assert.strictEqual(j.version.VersionID, "vFIRST");
    assert.strictEqual(j.version.ClosesAt, "2026-09-08T17:00:00.000Z");
    assert.deepStrictEqual(j.version.Self, {a:5});
  }],

  ["inside the week, saves merge into the open version: a patch, never a replacement", () => {
    const {at, save, versions} = boot();
    save("r01", {self:{a:5, b:7}, newVersionId:"v1"});
    at("2026-09-03T17:00:00.000Z");
    const j = save("r01", {self:{b:8}, coach:{a:3}, focus:["b", "a"], newVersionId:"vIGNORED"});
    assert.strictEqual(j.opened, false);
    assert.strictEqual(j.version.VersionID, "v1");
    assert.deepStrictEqual(j.version.Self, {a:5, b:8});
    assert.deepStrictEqual(j.version.Coach, {a:3});
    assert.deepStrictEqual(j.version.Focus, ["b", "a"]);
    assert.strictEqual(versions("r01").length, 1);
  }],

  ["a null clears a rating, and anything that isn't 1-10 is dropped", () => {
    const {save} = boot();
    save("r01", {self:{a:5, b:7, c:9}});
    const j = save("r01", {self:{a:null, b:11, c:"4", d:0, e:2.6}});
    assert.deepStrictEqual(j.version.Self, {c:4, e:3});
  }],

  ["after the week, the next rating opens a new version carrying everything forward", () => {
    const {at, save, versions} = boot("2026-09-01T17:00:00.000Z");
    save("r01", {self:{a:5, b:7}, coach:{a:4}, focus:["a"], newVersionId:"v1"});
    at("2026-09-09T17:00:00.000Z");
    const j = save("r01", {self:{b:8}, newVersionId:"v2"});
    assert.strictEqual(j.opened, true);
    assert.strictEqual(j.version.VersionID, "v2");
    assert.deepStrictEqual(j.version.Self, {a:5, b:8});
    assert.deepStrictEqual(j.version.Coach, {a:4});
    assert.deepStrictEqual(j.version.Focus, ["a"]);
    const all = versions("r01");
    assert.strictEqual(all.length, 2);
    assert.deepStrictEqual(all.find(v => v.VersionID === "v1").Self, {a:5, b:7});   // the old board is untouched
  }],

  ["a save that names a closed version corrects it in place and opens nothing", () => {
    const {at, save, versions} = boot("2026-09-01T17:00:00.000Z");
    save("r01", {self:{a:5, b:7}, newVersionId:"v1"});
    at("2026-09-09T17:00:00.000Z");
    save("r01", {self:{b:8}, newVersionId:"v2"});
    at("2026-10-06T19:30:00.000Z");
    const j = save("r01", {versionId:"v1", self:{a:3, b:null}, by:"Arri McDonald"});
    assert.strictEqual(j.ok, true);
    assert.strictEqual(j.opened, false);
    assert.strictEqual(j.edited, true);
    assert.strictEqual(j.version.VersionID, "v1");
    assert.deepStrictEqual(j.version.Self, {a:3});
    assert.strictEqual(j.version.CreatedAt, "2026-09-01T17:00:00.000Z");            // its dates don't move
    assert.strictEqual(j.version.ClosesAt, "2026-09-08T17:00:00.000Z");
    assert.strictEqual(j.version.UpdatedAt, "2026-10-06T19:30:00.000Z");            // after ClosesAt = "edited"
    assert.strictEqual(j.version.UpdatedBy, "Arri McDonald");
    const all = versions("r01");
    assert.strictEqual(all.length, 2);                                               // no third version
    assert.deepStrictEqual(all.find(v => v.VersionID === "v2").Self, {a:5, b:8});   // later boards keep what they carried
  }],

  ["a correction to a closed version does not roll the board over", () => {
    const {at, save, versions} = boot("2026-09-01T17:00:00.000Z");
    save("r01", {self:{a:5}, newVersionId:"v1"});
    at("2026-10-06T19:30:00.000Z");                     // v1 closed weeks ago and nothing is open
    const j = save("r01", {versionId:"v1", self:{a:6}});
    assert.strictEqual(j.version.VersionID, "v1");
    assert.strictEqual(versions("r01").length, 1);
  }],

  ["an unknown version id is refused: it never falls through to the open version", () => {
    const {save, versions} = boot();
    save("r01", {self:{a:5}, newVersionId:"v1"});
    const j = save("r01", {versionId:"vNOPE", self:{a:9}});
    assert.strictEqual(j.ok, false);
    assert.strictEqual(j.error, "version not found");
    assert.deepStrictEqual(versions("r01")[0].Self, {a:5});
  }],

  ["one mentee's version id can't be used to write on another's board", () => {
    const {save, versions} = boot();
    save("r01", {self:{a:5}, newVersionId:"v1"});
    save("r02", {self:{a:2}, newVersionId:"v9"});
    const j = save("r02", {versionId:"v1", self:{a:10}});
    assert.strictEqual(j.ok, false);
    assert.deepStrictEqual(versions("r01")[0].Self, {a:5});
    assert.deepStrictEqual(versions("r02")[0].Self, {a:2});
  }],

  ["the coach's column in a past version is corrected without touching the rep's", () => {
    const {at, save} = boot("2026-09-01T17:00:00.000Z");
    save("r01", {self:{a:5}, coach:{a:2}, newVersionId:"v1"});
    at("2026-09-20T17:00:00.000Z");
    const j = save("r01", {versionId:"v1", coach:{a:4}, by:"coach"});
    assert.deepStrictEqual(j.version.Self, {a:5});
    assert.deepStrictEqual(j.version.Coach, {a:4});
  }],

  ["the answer is the row read back from the sheet: a save the sheet didn't keep is an error", () => {
    const {gas, save, versions} = boot();
    save("r01", {self:{a:5}, newVersionId:"v1"});
    gas.state.dropWrites = true;
    const lost = save("r02", {self:{a:9}, newVersionId:"v2"});
    assert.strictEqual(lost.ok, false);
    assert.strictEqual(lost.error, "the sheet did not keep the save");
    const stale = save("r01", {self:{a:9}});            // the row exists, but the new number never landed
    assert.strictEqual(stale.ok, true);
    assert.deepStrictEqual(stale.version.Self, {a:5});   // the page compares this with what it sent and says so
    gas.state.dropWrites = false;
    assert.strictEqual(versions("r02").length, 0);
  }],

  ["ratings survive the sheet: maps are stored as plain text, never as numbers", () => {
    const {gas, save, versions} = boot();
    save("r01", {self:{a:5}, focus:["a"], newVersionId:"v1"});
    const sh = [...gas.state.spreadsheets.values()][0].getSheetByName("Skills");
    assert.strictEqual(sh.getRange(2, 6).getValue(), '{"a":5}');
    assert.deepStrictEqual(versions("r01")[0].Focus, ["a"]);
  }],

  ["a rep's page gets only its own versions; the coaches' gets everyone's", () => {
    const {api, save} = boot();
    save("r01", {self:{a:5}});
    save("r02", {self:{a:6}});
    assert.deepStrictEqual(api.get({token:T, rep:"R01"}).versions.map(v => v.RepID), ["r01"]);
    assert.strictEqual(api.get({token:T}).versions.length, 2);
  }],

  ["the catalog keeps a section's description (g.d) exactly as the coach wrote it", () => {
    const {api} = boot();
    const cat = [{k:"demos", n:"Demos", g:[{k:"selling-ultimates", n:"Selling Ultimates", d:"=Presenting the Ultimate \"first\"", s:[["demos.x", "X"]]}]}];
    assert.strictEqual(api.post({token:T, action:"seedCatalog", catalog:cat}).seeded, true);
    const got = api.get({token:T});
    assert.strictEqual(got.catalogRev, 1);
    assert.deepStrictEqual(got.catalog, cat);
    cat[0].g[0].d = "";                                  // cleared on purpose: stays cleared
    assert.strictEqual(api.post({token:T, action:"saveCatalog", catalog:cat, baseRev:1}).catalogRev, 2);
    assert.strictEqual(api.get({token:T}).catalog[0].g[0].d, "");
    assert.strictEqual(api.post({token:T, action:"saveCatalog", catalog:cat, baseRev:1}).conflict, true);
  }],

  ["a busy lock is an error, not a silent drop", () => {
    const {gas, save} = boot();
    gas.state.lockBusy = true;
    const j = save("r01", {self:{a:5}});
    assert.strictEqual(j.ok, false);
    assert.ok(/Lock timeout/.test(j.error));
  }],
];

let failed = 0;
for(const [name, fn] of cases){
  try{ fn(); }
  catch(e){ failed++; console.error("FAIL: " + name + "\n  " + (e && e.message)); }
}
if(failed){ console.error(`\n${failed} of ${cases.length} failing`); process.exit(1); }
console.log(`\nall ${cases.length} passing`);
