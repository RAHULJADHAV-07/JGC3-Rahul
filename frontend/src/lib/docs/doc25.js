import { L, ddmm, esc, exRate, gstFor, num, sum, tableOf } from "./common.js";

export const B_25 = (ctx) => {
  const rows = L(ctx), ex = exRate(ctx);
  const cols = [
    { h: "Code", f: (r) => esc(r.it.code) }, { h: "HSN", f: (r) => esc(r.it.hsn) }, { h: "Description", f: (r) => esc(r.it.description) },
    { h: "Qty", r: 1, key: "qty", t: "int", v: (r) => r.pieces, f: (r) => r.pieces.toLocaleString("en-IN") },
    { h: "Taxable ₹", r: 1, key: "taxable", t: "inr", v: (r) => r.fobTotal * ex, f: (r) => num(r.fobTotal * ex) },
    { h: "IGST %", c: 1, f: (r) => `${Number((gstFor(ctx, r.it, r.supId) * 100).toFixed(2))}%` },
    { h: "IGST ₹", r: 1, key: "igst", t: "inr", fml: (r) => `{taxable}*${gstFor(ctx, r.it, r.supId)}`, f: (r) => num(r.fobTotal * ex * gstFor(ctx, r.it, r.supId)) },
    { h: "Total ₹", r: 1, key: "total", t: "inr", fml: "{taxable}+{igst}", f: (r) => num(r.fobTotal * ex * (1 + gstFor(ctx, r.it, r.supId))) },
  ];
  const tax = sum(rows, "fobTotal") * ex, gst = rows.reduce((a, r) => a + r.fobTotal * ex * gstFor(ctx, r.it, r.supId), 0);
  const html = `<div class="title">25 · E-INVOICE (IRN)</div>
    <table style="width:100%"><tr><td class="k">Invoice No.</td><td class="b">${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)}</td><td class="k">IRN</td><td class="sub">5049ef43c7126a4c35bf29795ce49390de0338c2897a4b</td></tr>
    <tr><td class="k">Ack No</td><td>122632432448548</td><td class="k">Ack Dt</td><td>${ddmm(ctx.inv.date)}</td></tr></table>
    ${tableOf(cols, rows, [{ v: "TOTAL", span: 4 }, { v: num(tax), r: 1, sum: "taxable", t: "inr" }, { v: "" },
    { v: num(gst), r: 1, sum: "igst", t: "inr" }, { v: num(tax + gst), r: 1, sum: "total", t: "inr" }])}`;
  return { name: "E_Invoice_25", html };
};
