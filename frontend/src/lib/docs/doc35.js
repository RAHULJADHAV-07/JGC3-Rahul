import { L, ddmm, esc, exRate, num, sum, tableOf, usd } from "./common.js";

/* ---------- Stage E · Reports (35–39) & F · Banking (40) ---------- */
export const B_35 = (ctx) => {
  const rows = L(ctx), ex = exRate(ctx);
  const cols = [
    { h: "GD Code", f: (r) => esc(r.it.gd) },
    { h: "Qty Pcs", r: 1, key: "qty", t: "int", v: (r) => r.pieces, f: (r) => r.pieces.toLocaleString("en-IN") },
    { h: "Box", r: 1, key: "box", t: "int", v: (r) => r.boxes, f: (r) => r.boxes },
    { h: "FOB $", r: 1, key: "fob", t: "usd", v: (r) => r.fobTotal, f: (r) => usd(r.fobTotal) },
    { h: "Realised ₹", r: 1, key: "real", t: "inr", fml: `{fob}*${ex}`, f: (r) => num(r.fobTotal * ex) },
    { h: "Purchase ₹", r: 1, key: "pur", t: "inr", v: (r) => r.valTotal, f: (r) => num(r.valTotal) },
    { h: "Cartons ₹", r: 1, key: "carton", t: "inr", fml: "{box}*16", f: (r) => num(r.boxes * 16) },
    { h: "Overheads ₹", r: 1, key: "oh", t: "inr", fml: "{real}*0.11", f: (r) => num(r.fobTotal * ex * 0.11) },
    { h: "Gross Profit ₹", r: 1, key: "gp", t: "inr", fml: "{real}-{pur}-{carton}-{oh}", f: (r) => num(r.fobTotal * ex - r.valTotal - r.boxes * 16 - r.fobTotal * ex * 0.11) },
  ];
  const gp = rows.reduce((a, r) => a + (r.fobTotal * ex - r.valTotal - r.boxes * 16 - r.fobTotal * ex * 0.11), 0);
  const foot = [{ v: "TOTAL", span: 1 }, { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1, sum: "qty", t: "int" },
    { v: sum(rows, "boxes"), r: 1, sum: "box", t: "int" },
    { v: usd(sum(rows, "fobTotal")), r: 1, sum: "fob", t: "usd" },
    { v: num(sum(rows, "fobTotal") * ex), r: 1, sum: "real", t: "inr" },
    { v: num(sum(rows, "valTotal")), r: 1, sum: "pur", t: "inr" },
    { v: "", span: 2 }, { v: num(gp), r: 1, sum: "gp", t: "inr" }];
  const html = `<div class="title">COSTING</div><div class="sub">Invoice ${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)} · Rate @ Rs. ${ex}</div>${tableOf(cols, rows, foot)}`;
  return { name: "Costing", html };
};
