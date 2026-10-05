import { esc, exRate, num, orderAgg, poHeaderList, sum, tableOf, upDiv, usd, usdp } from "./common.js";

export const B_2A = (ctx) => {
  const rows = orderAgg(ctx);
  const ex = exRate(ctx);
  const cols = [
    { h: "Code", f: (r) => esc(r.it.code) }, { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "GL Code", f: (r) => esc(r.it.gl) },
    { h: "Size (MM)", c: 1, f: (r) => esc(r.it.size) }, { h: "Length", c: 1, f: (r) => esc(r.it.length) },
    { h: "Pack/Unit", c: 1, key: "pack", t: "int", v: (r) => r.packing, f: (r) => r.packing },
    { h: "Pack/Box", c: 1, f: (r) => (r.boxes ? Math.round(r.qty / r.boxes) : "") },
    { h: "Description", f: (r) => esc(r.it.description) }, { h: "Bar Code", f: (r) => esc(r.it.barcode) }, { h: "HSN", f: (r) => esc(r.it.hsn) },
    { h: "Qty Pcs", r: 1, key: "qty", t: "int", v: (r) => r.qty, f: (r) => r.qty.toLocaleString("en-IN") },
    { h: "Box", r: 1, key: "box", t: "int", fml: () => upDiv("{qty}", "{pack}"), f: (r) => r.boxes },
    { h: "Vol/Box", r: 1, key: "volbox", t: "num3", v: (r) => r.it.volume, f: (r) => num(r.it.volume, 3) },
    { h: "Total Vol", r: 1, key: "voltot", t: "num", fml: "{box}*{volbox}", f: (r) => num(r.volTotal, 2) },
    { h: "Net/Box", r: 1, key: "netbox", t: "num3", v: (r) => r.it.netPerBox, f: (r) => num(r.it.netPerBox, 3) },
    { h: "Gross/Box", r: 1, key: "grossbox", t: "num3", v: (r) => r.it.grossPerBox, f: (r) => num(r.it.grossPerBox, 3) },
    { h: "Total Net kg", r: 1, key: "nettot", t: "num3", fml: "{box}*{netbox}", f: (r) => num(r.netTotal, 3) },
    { h: "Total Gross kg", r: 1, key: "grosstot", t: "num3", fml: "{box}*{grossbox}", f: (r) => num(r.grossTotal, 3) },
    { h: "Stickers", r: 1, key: "stk", t: "int", fml: (r) => `ROUNDUP({box}*${r.stkPerBox},0)`, f: (r) => r.stickers },
    { h: "Type UPS", r: 1, key: "typeup", t: "int", v: (r) => r.typeUp, f: (r) => r.typeUp },
    { h: "Sheets", r: 1, key: "sheets", t: "int", fml: () => upDiv("{stk}", "{typeup}"), f: (r) => r.sheets },
    { h: "Value Unit ₹", r: 1, key: "valunit", t: "inr", v: (r) => r.valUnit, f: (r) => num(r.valUnit) },
    { h: "Value Total ₹", r: 1, key: "valtot", t: "inr", fml: "{qty}*{valunit}", f: (r) => num(r.valTotal) },
    { h: "FOB/pc $", r: 1, key: "fobpc", t: "usd4", v: (r) => r.fobPc, f: (r) => usdp(r.fobPc) },
    { h: "FOB Total $", r: 1, key: "fobtot", t: "usd", fml: "{qty}*{fobpc}", f: (r) => usd(r.fobTotal) },
    { h: "RBI Ref ₹", r: 1, key: "rbi", t: "inr", fml: `{fobtot}*${ex}`, f: (r) => num(r.rbiTotal) },
  ];
  const foot = [{ v: "TOTAL", span: 10 }, { v: sum(rows, "qty").toLocaleString("en-IN"), r: 1, sum: "qty", t: "int" },
    { v: sum(rows, "boxes"), r: 1, sum: "box", t: "int" },
    { v: "", span: 1 }, { v: num(sum(rows, "volTotal"), 2), r: 1, sum: "voltot", t: "num" },
    { v: "", span: 2 }, { v: num(sum(rows, "netTotal"), 3), r: 1, sum: "nettot", t: "num3" },
    { v: num(sum(rows, "grossTotal"), 3), r: 1, sum: "grosstot", t: "num3" },
    { v: sum(rows, "stickers"), r: 1, sum: "stk", t: "int" }, { v: "" }, { v: sum(rows, "sheets"), r: 1, sum: "sheets", t: "int" },
    { v: "" }, { v: num(sum(rows, "valTotal")), r: 1, sum: "valtot", t: "inr" },
    { v: "" }, { v: usd(sum(rows, "fobTotal")), r: 1, sum: "fobtot", t: "usd" },
    { v: num(sum(rows, "rbiTotal")), r: 1, sum: "rbi", t: "inr" }];
  const html = `<div class="title">2A · MASTER (Buyer Order)</div><div class="sub">PO NO : ${esc(poHeaderList(ctx))} &nbsp;— &nbsp;Rate @ Rs. ${ex}/US$</div>${tableOf(cols, rows, foot)}`;
  return { name: "Master_2A", html };
};
