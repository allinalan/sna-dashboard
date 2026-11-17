#!/usr/bin/env node
// Preview the dashboard on this machine with a fake skillset backend, so the
// Skillset tab can be driven end to end (rate, Save, correct a past version)
// without touching Google, the live sheet, or anyone's real ratings.
//
//   node tools/dev-server.js   → http://localhost:8822/?rep=r01&tab=skills   a rep's own page
//                                http://localhost:8822/?tab=skills           the coaches' page
//                                http://localhost:8822/__hub                 the page inside a stand-in
//                                                                            for the hub's Performance tab
//
// The page it serves is index.html with five constants rewritten; nothing in
// index.html knows about this server:
//   USE_LIVE_DATA  → false      the built-in sample mentees, no sheet is read
//   REP_LINKS_LIVE → true       so ?rep= opens instead of the "almost ready" card
//   SKILLS_URL     → /__skills  the real SNA-Skills-Sync.gs, running on in-memory fakes
//   WEBAPP_URL     → /__off     the check-in script is never called
//   HUB_SYNC_URL   → /__off     neither is the hub's feed
// and fills the Scripts tab with the sample library below (SCRIPTS_RAW / SCRIPT_FOLDERS_RAW),
// the rows the hub's Scripts tab writes: a hidden one, a removed one and a Masters-only one
// must not show for r01 (Path); http://localhost:8822/?rep=r01&tab=scripts
// It refuses to start if any of the five can't be found, rather than serve a
// page that talks to the real backends.
//
// The fake sheet starts with: r01 — three versions (two closed, one open),
// r02 — one closed version, everyone else — nothing rated.
//
//   API=1 node tools/dev-server.js          the storage script as it was before 2026-10-06:
//                                           no "api" in its replies and versionId ignored, so
//                                           the page must not offer Edit on a past version
//   SLOW=1500 node tools/dev-server.js      every skills reply takes 1.5 s
//   curl -X POST localhost:8822/__fail -d 2 the next 2 skills calls get an HTML error page,
//                                           the way Apps Script's /exec sometimes answers
//   curl localhost:8822/__sheet             what the fake Skills tab holds right now
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const {makeGas, loadGs} = require("../tests/gas-fakes.js");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 8822);
const SLOW = Number(process.env.SLOW || 0);
const OLD = process.env.API === "1";
const DAY = 86400000;

const REWRITES = [
  [/USE_LIVE_DATA:\s*true/, "USE_LIVE_DATA: false"],
  [/REP_LINKS_LIVE:\s*false/, "REP_LINKS_LIVE: true"],
  [/SKILLS_URL:\s*"[^"]*"/, 'SKILLS_URL: "/__skills"'],
  [/WEBAPP_URL:\s*"[^"]*"/, 'WEBAPP_URL: "/__off"'],
  [/HUB_SYNC_URL:\s*"[^"]*"/, 'HUB_SYNC_URL: "/__off"'],
  [/let SCRIPTS_RAW=\[\], SCRIPT_FOLDERS_RAW=\[\];/, () => "let SCRIPTS_RAW=" + JSON.stringify(SAMPLE_SCRIPTS) + ", SCRIPT_FOLDERS_RAW=" + JSON.stringify(SAMPLE_FOLDERS) + ";"],
];
/* the script library as the hub writes it (the check-in script's SCRIPTS block): folders, then scripts */
const fold = (FolderID, Name, ParentID, Order, Removed = "") => ({FolderID, Name, ParentID, Order, Removed});
const SAMPLE_FOLDERS = [fold("f1", "Booth Scripts", "", 1), fold("f2", "New Customer", "f1", 1), fold("f3", "Past Customer", "f1", 2), fold("f4", "Cookware", "f1", 3),
  fold("f7", "Demo Scripts", "", 2), fold("f8", "New Customer", "f7", 1), fold("f13", "Phoning Scripts", "", 3),
  fold("f14", "Service Call Scripts", "", 4), fold("f15", "Cookware", "f14", 1), fold("f19", "Other Scripts", "", 5), fold("f20", "Old stuff", "", 6, "Y")];
const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString();
const scr = (ScriptID, FolderID, Title, o = {}) => Object.assign({ScriptID, FolderID, Title, Note:"", Kind:"link", URL:"", FileID:"", FileName:"", MimeType:"",
  Programs:"Dojo,Path,Masters", Hidden:"", Order:1, AddedAt:daysAgo(30), AddedBy:"Alan", UpdatedAt:"", Removed:""}, o);
const SAMPLE_SCRIPTS = [
  scr("sc1", "f2", "Booth opener: first-time customer", {Kind:"file", FileID:"devfile1", URL:"https://drive.google.com/file/d/devfile1/view", FileName:"booth-opener.pdf", MimeType:"application/pdf", Note:"The first 20 seconds at the table", AddedAt:daysAgo(2)}),
  scr("sc2", "f3", "Welcome back, past customer", {URL:"https://docs.google.com/document/d/devdoc2/edit", Note:"Thank them first, then the new piece"}),
  scr("sc3", "f4", "Cookware at the booth", {URL:"https://docs.google.com/presentation/d/devslides3/edit", Order:1}),
  scr("sc4", "f8", "Demo intro (Masters only)", {URL:"https://docs.google.com/document/d/devdoc4/edit", Programs:"Masters"}),
  scr("sc5", "f13", "Phoning past customers", {URL:"https://docs.google.com/document/d/devdoc5/edit", Note:"Service-call booking script", AddedAt:daysAgo(5)}),
  scr("sc6", "f15", "Service call: cookware check", {Kind:"file", FileID:"devfile6", URL:"https://drive.google.com/file/d/devfile6/view", FileName:"svc-cookware.docx", MimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}),
  scr("sc7", "f19", "Not ready yet", {URL:"https://docs.google.com/document/d/devdoc7/edit", Hidden:"Y"}),
  scr("sc8", "f19", "Retired script", {URL:"https://docs.google.com/document/d/devdoc8/edit", Removed:"Y"}),
  scr("sc9", "f19", "Cutco product guide", {URL:"https://www.cutco.com/", Note:"A plain web link opens in a new tab"}),
];
function page(){
  let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  for(const [re, to] of REWRITES){
    if(!re.test(html)) throw new Error("dev-server: can't find " + re + " in index.html — refusing to serve a page wired to the real backends");
    html = html.replace(re, typeof to === "function" ? to() : to);
  }
  return html;
}
page();                                              // fail at startup, not on the first request

/* ── the storage script on fakes ── */
const gas = makeGas();
const beforeApi2 = src => {
  const a = "var target = String(body.versionId || '').trim();";
  if(!src.includes(a) || !src.includes("api: API, ")) throw new Error("dev-server: API=1 can't find what to take out of SNA-Skills-Sync.gs");
  return src.replace(a, "var target = '';").split("api: API, ").join("");
};
const script = loadGs(path.join(ROOT, "SNA-Skills-Sync.gs"), gas.globals, OLD ? beforeApi2 : null);
script.setup();
(function seed(){
  const sh = [...gas.state.spreadsheets.values()][0].getSheetByName("Skills");
  const now = Date.now(), iso = t => new Date(t).toISOString();
  const row = (rep, id, daysAgo, self, coach, focus) => [rep, id, iso(now - daysAgo * DAY), iso(now - (daysAgo - 7) * DAY), "Fall 2026",
    JSON.stringify(self), JSON.stringify(coach), JSON.stringify(focus), iso(now - (daysAgo - 1) * DAY), rep === "r01" ? "Arri McDonald" : "rep"];
  const A = "demos.selling-ultimates.", B = "demos.handling-objections.";
  const rows = [
    row("r01", "vOLD", 35, {[A + "selling-ultimates"]:3, [A + "creating-needs"]:4, [A + "closing"]:2, [B + "spouse"]:3}, {}, []),
    row("r01", "vMID", 14, {[A + "selling-ultimates"]:5, [A + "creating-needs"]:5, [A + "closing"]:4, [B + "spouse"]:3, [B + "think-about-it"]:6},
        {[A + "closing"]:8}, [A + "closing"]),
    row("r01", "vOPEN", 2, {[A + "selling-ultimates"]:6, [A + "creating-needs"]:5, [A + "building-value"]:7, [A + "closing"]:4, [B + "spouse"]:3, [B + "think-about-it"]:6, [B + "all-or-nothing"]:9},
        {[A + "closing"]:8, [A + "selling-ultimates"]:5}, [A + "closing", B + "spouse"]),
    row("r02", "vSEP", 21, {[A + "selling-ultimates"]:8, [A + "closing"]:7}, {}, []),
  ];
  sh.getRange(2, 6, rows.length, 3).setNumberFormat("@");
  sh.getRange(2, 1, rows.length, 10).setValues(rows);
})();

let failNext = 0;
const HUB = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>stand-in hub</title>
<body style="margin:0;font:14px system-ui;background:#EAE4D6">
<div style="height:64px;background:#191410;color:#F4EEDF;display:flex;align-items:center;padding:0 24px;position:sticky;top:0;z-index:5">stand-in for the hub — Performance tab</div>
<div style="max-width:1180px;margin:0 auto;padding:24px">
  <div style="height:160px">page head</div>
  <iframe id="dashIframe" src="/?embed=1&tab=skills" style="width:100%;border:0;height:1100px;display:block"></iframe>
  <div style="height:300px;padding-top:20px">the rest of the hub</div>
</div>
<script>
window.addEventListener("message", e => {
  const f = document.getElementById("dashIframe");
  if(f && e.data && e.data.type === "sna-dash-h" && Number(e.data.h) > 0)
    f.style.height = Math.max(500, Math.min(Number(e.data.h), 40000)) + "px";
});
</script>`;

const send = (res, code, type, body) => { res.writeHead(code, {"Content-Type":type, "Cache-Control":"no-store"}); res.end(body); };
const later = fn => (SLOW ? setTimeout(fn, SLOW) : fn());

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let body = "";
  req.on("data", c => { body += c; });
  req.on("end", () => {
    try{
      if(url.pathname === "/" || url.pathname === "/index.html") return send(res, 200, "text/html; charset=utf-8", page());
      if(url.pathname === "/__hub") return send(res, 200, "text/html; charset=utf-8", HUB);
      if(url.pathname === "/__off") return send(res, 200, "application/json", JSON.stringify({ok:false, error:"off in the dev server"}));
      if(url.pathname === "/__fail"){ failNext = Number(body) || 1; return send(res, 200, "text/plain", "next " + failNext + " skills calls will fail\n"); }
      if(url.pathname === "/__sheet"){
        const sh = [...gas.state.spreadsheets.values()][0].getSheetByName("Skills");
        const n = sh.getLastRow();
        return send(res, 200, "application/json", JSON.stringify(n > 1 ? sh.getRange(2, 1, n - 1, 10).getValues() : [], null, 1));
      }
      if(url.pathname === "/__skills"){
        return later(() => {
          if(failNext > 0){ failNext--; return send(res, 200, "text/html", "<!doctype html><title>Error</title><p>Service invoked too many times"); }
          const out = req.method === "POST"
            ? script.doPost({postData:{contents:body}})
            : script.doGet({parameter:Object.fromEntries(url.searchParams)});
          if(req.method === "POST") console.log("  skills POST", body.slice(0, 220));
          send(res, 200, "application/json", out.getContent());
        });
      }
      send(res, 404, "text/plain", "not found");
    }catch(e){ send(res, 500, "text/plain", String(e && e.stack || e)); }
  });
}).listen(PORT, () => {
  console.log(`dashboard dev server${OLD ? " (storage script as before API 2)" : ""}`);
  console.log(`  rep page    http://localhost:${PORT}/?rep=r01&tab=skills`);
  console.log(`  coach page  http://localhost:${PORT}/?tab=skills`);
  console.log(`  in the hub  http://localhost:${PORT}/__hub`);
});
