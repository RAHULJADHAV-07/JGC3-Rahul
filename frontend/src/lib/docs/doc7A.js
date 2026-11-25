import { L, QTY_FROM_BOX, esc, exRate, num, poHeaderList, sum, tableOf, upDiv, usd, usdp } from "./common.js";

/* ---------- Stage B · Supplier packing (7A–11) ---------- */
export function supplierTable(ctx, cols, footBuilder, title, sub) {
  const rows = L(ctx);
  const foot = footBuilder ? footBuilder(rows) : null;
  return `<div class="title">${esc(title)}</div><div class="sub">${esc(sub)}</div>${tableOf(cols, rows, foot)}`;
}

export const B_7A = (ctx) => {
  const ex = exRate(ctx);
  const cols = [
    { h: "Sr No", c: 1, f: (r) => r.range }, { h: "PO No", f: (r) => r.pos.join(", ") },
    { h: "Code", f: (r) => esc(r.it.code) }, { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "OSWIN Code", f: (r) => esc(r.it.oswin) }, { h: "GL Code", f: (r) => esc(r.it.gl) },
    { h: "Size", c: 1, f: (r) => esc(r.it.size) }, { h: "Length", c: 1, f: (r) => esc(r.it.length) },
    { h: "Packing", c: 1, key: "pack", t: "int", v: (r) => r.packing, f: (r) => r.packing },
    { h: "Description", f: (r) => esc(r.it.description) }, { h: "Bar Codes", f: (r) => esc(r.it.barcode) }, { h: "HSN", f: (r) => esc(r.it.hsn) },
    { h: "Qty Pcs", r: 1, key: "qty", t: "int", fml: QTY_FROM_BOX, f: (r) => r.pieces.toLocaleString("en-IN") },
    { h: "Box", r: 1, key: "box", t: "int", v: (r) => r.boxes, f: (r) => r.boxes },
    { h: "Vol/Box", r: 1, key: "volbox", t: "num3", v: (r) => r.it.volume, f: (r) => num(r.it.volume, 3) },
    { h: "Total Vol", r: 1, key: "voltot", t: "num", fml: "{box}*{volbox}", f: (r) => num(r.volTotal, 2) },
    { h: "BG", r: 1, key: "bg", t: "int", v: (r) => r.bg, f: (r) => r.bg },
    { h: "PC", r: 1, key: "pc", t: "int", v: (r) => r.pc, f: (r) => r.pc },
    { h: "TTL", r: 1, key: "ttl", t: "num1", v: (r) => r.ttl, f: (r) => r.ttl },
    { h: "Barcode Stk", r: 1, key: "stk", t: "int", fml: (r) => `ROUNDUP({box}*${r.stkPerBox},0)`, f: (r) => r.stickers },
    { h: "Sheets", r: 1, key: "sheets", t: "int", fml: (r) => upDiv("{stk}", String(r.typeUp || 0)), f: (r) => r.sheets },
    { h: "Cost/Unit ₹", r: 1, key: "costunit", t: "inr", v: (r) => r.valUnit, f: (r) => num(r.valUnit) },
    { h: "Total Cost ₹", r: 1, key: "costtot", t: "inr", fml: "{qty}*{costunit}", f: (r) => num(r.valTotal) },
    { h: "FOB/pc $", r: 1, key: "fobpc", t: "usd4", v: (r) => r.fobPc, f: (r) => usdp(r.fobPc) },
    { h: "Total FOB $", r: 1, key: "fobtot", t: "usd", fml: "{qty}*{fobpc}", f: (r) => usd(r.fobTotal) },
    { h: "RBI Ref ₹", r: 1, key: "rbi", t: "inr", fml: `{fobtot}*${ex}`, f: (r) => num(r.rbiTotal) },
  ];
  const foot = (rows) => [{ v: "TOTAL", span: 12 }, { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1, sum: "qty", t: "int" },
    { v: sum(rows, "boxes"), r: 1, sum: "box", t: "int" }, { v: "" },
    { v: num(sum(rows, "volTotal"), 2), r: 1, sum: "voltot", t: "num" }, { v: "", span: 3 },
    { v: sum(rows, "stickers"), r: 1, sum: "stk", t: "int" }, { v: sum(rows, "sheets"), r: 1, sum: "sheets", t: "int" },
    { v: "" }, { v: num(sum(rows, "valTotal")), r: 1, sum: "costtot", t: "inr" }, { v: "" },
    { v: usd(sum(rows, "fobTotal")), r: 1, sum: "fobtot", t: "usd" },
    { v: num(sum(rows, "rbiTotal")), r: 1, sum: "rbi", t: "inr" }];
  return { name: "Supplier_Master", html: supplierTable(ctx, cols, foot, "MOULDED ORDER MASTER (Supplier)", `PO NO : ${poHeaderList(ctx)} · Rate @ Rs. ${ex}`) };
};
