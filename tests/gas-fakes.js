// In-memory stand-ins for the Apps Script services SNA-Skills-Sync.gs uses, so
// the storage script runs under node — for tests/skills-sync.test.js and for
// tools/dev-server.js. Same idea as the hub's tests/gas-fakes.js, cut down to
// what this script touches.
//
// The fake sheet copies the one Sheets behaviour that has bitten this stack
// before: a number-looking string in a cell that isn't plain-text formatted
// ("@") comes back as a number, and a string starting with "=" runs as a
// formula and reads back "#ERROR!".
"use strict";
const fs = require("fs");

function makeGas(opts){
  const o = opts || {};
  const state = {props:new Map(Object.entries(o.props || {})), spreadsheets:new Map(), seq:0, flushes:0,
                 lockBusy:!!o.lockBusy,
                 now:o.now || null,          // a fixed clock for the script: new Date() inside the .gs reads this
                 dropWrites:false};          // true = setValues silently does nothing (a save the sheet never keeps)

  const a1 = ref => {                        // "B4" or "A1:B4" -> [row, col, rows, cols]
    const m = String(ref).match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
    if(!m) throw new Error("Range not found: " + ref);
    const col = s => s.split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    const r1 = +m[2], c1 = col(m[1]), r2 = m[4] ? +m[4] : r1, c2 = m[3] ? col(m[3]) : c1;
    return [r1, c1, r2 - r1 + 1, c2 - c1 + 1];
  };

  class Range {
    constructor(sheet, row, col, rows, cols){
      if(row < 1 || col < 1 || rows < 1 || cols < 1) throw new Error("The coordinates or dimensions of the range are invalid.");
      Object.assign(this, {sheet, row, col, rows, cols});
    }
    each(fn){ for(let i = 0; i < this.rows; i++) for(let j = 0; j < this.cols; j++) fn(this.row + i, this.col + j, i, j); }
    getValues(){
      const out = [];
      for(let i = 0; i < this.rows; i++){ const line = []; for(let j = 0; j < this.cols; j++) line.push(this.sheet.get(this.row + i, this.col + j)); out.push(line); }
      return out;
    }
    getValue(){ return this.sheet.get(this.row, this.col); }
    setValues(grid){
      if(grid.length !== this.rows || !grid.every(line => line.length === this.cols))
        throw new Error(`The number of rows or columns in the data does not match the range (${this.rows}x${this.cols}).`);
      if(state.dropWrites) return this;
      this.each((r, c, i, j) => this.sheet.put(r, c, grid[i][j]));
      return this;
    }
    setValue(v){ if(!state.dropWrites) this.sheet.put(this.row, this.col, v); return this; }
    setNumberFormat(f){ this.each((r, c) => this.sheet.formats.set(r + ":" + c, f)); return this; }
    setFontWeight(){ return this; }
    clearContent(){ this.each((r, c) => this.sheet.cells.delete(r + ":" + c)); return this; }
  }

  class Sheet {
    constructor(name){ this.name = name; this.cells = new Map(); this.formats = new Map(); this.maxRows = 1000; }
    get(r, c){ const v = this.cells.get(r + ":" + c); return v === undefined ? "" : v; }
    put(r, c, v){
      const plain = this.formats.get(r + ":" + c) === "@";
      if(typeof v === "string"){
        if(v.startsWith("=")) v = "#ERROR!";
        else if(!plain && /^-?\d+(\.\d+)?$/.test(v)) v = Number(v);
      }
      if(v === "" || v === null || v === undefined) this.cells.delete(r + ":" + c); else this.cells.set(r + ":" + c, v);
    }
    getRange(row, col, rows, cols){
      if(typeof row === "string") [row, col, rows, cols] = a1(row);
      const n = rows === undefined ? 1 : rows;
      if(row + n - 1 > this.maxRows) throw new Error("The coordinates of the range are outside the dimensions of the sheet.");
      return new Range(this, row, col, n, cols === undefined ? 1 : cols);
    }
    getMaxRows(){ return this.maxRows; }
    getLastRow(){ let m = 0; for(const k of this.cells.keys()) m = Math.max(m, Number(k.split(":")[0])); return m; }
    setFrozenRows(){ return this; }
    setColumnWidth(){ return this; }
  }

  class Spreadsheet {
    constructor(name){ this.id = "ss" + String(++state.seq).padStart(4, "0"); this.name = name; this.sheets = []; }
    getId(){ return this.id; }
    getUrl(){ return "https://docs.google.com/spreadsheets/d/" + this.id + "/edit"; }
    getSheetByName(n){ return this.sheets.find(s => s.name === n) || null; }
    insertSheet(n){ const s = new Sheet(n); this.sheets.push(s); return s; }
  }
  const SpreadsheetApp = {
    create(name){ const ss = new Spreadsheet(name); state.spreadsheets.set(ss.id, ss); return ss; },
    openById(id){ const ss = state.spreadsheets.get(id); if(!ss) throw new Error("No spreadsheet with that id."); return ss; },
    flush(){ state.flushes++; }
  };
  const PropertiesService = {getScriptProperties:() => ({
    getProperty:k => (state.props.has(k) ? state.props.get(k) : null),
    setProperty(k, v){ state.props.set(k, String(v)); return this; }
  })};
  const LockService = {getScriptLock:() => ({
    waitLock(){ if(state.lockBusy) throw new Error("Lock timeout: another process was holding the lock for too long."); },
    releaseLock(){}
  })};
  const ContentService = {
    MimeType:{JSON:"application/json"},
    createTextOutput(s){ return {setMimeType(){ return this; }, getContent:() => s}; }
  };
  const Logger = {log(){}};
  /* the script's clock: new Date() with no arguments is state.now when one is set */
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a){ if(a.length === 0 && state.now) super(new RealDate(state.now).getTime()); else super(...a); }
    static now(){ return state.now ? new RealDate(state.now).getTime() : RealDate.now(); }
  }

  return {globals:{SpreadsheetApp, PropertiesService, LockService, ContentService, Logger, Date:FakeDate}, state};
}

/* Run a .gs file with the fakes as its globals. `transform` may rewrite the
   source first (the tests use it to build a copy from before API 2). Returns
   the entry points plus post()/get(), which speak JSON the way the page does. */
function loadGs(file, globals, transform){
  let src = fs.readFileSync(file, "utf8");
  if(transform) src = transform(src);
  const names = Object.keys(globals);
  const api = new Function(...names, src + "\n;return {doGet, doPost, setup};")(...names.map(n => globals[n]));
  api.post = body => JSON.parse(api.doPost({postData:{contents:JSON.stringify(body)}}).getContent());
  api.get = params => JSON.parse(api.doGet({parameter:params || {}}).getContent());
  return api;
}

module.exports = {makeGas, loadGs};
