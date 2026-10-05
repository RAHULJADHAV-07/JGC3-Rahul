import { L, ddmm, esc, exporterBlock, num, sum } from "./common.js";

export const B_11A = (ctx) => {
  const s = ctx.inv.ship || {};
  const html = `<div class="title">DELIVERY ORDER (D.O.)</div>${exporterBlock(ctx)}<br>
    <table style="width:100%">
      <tr><td class="k">Ref No.</td><td>JG/${new Date(ctx.inv.date).getFullYear()}/DO</td><td class="k">Date</td><td>${ddmm(ctx.inv.date)}</td></tr>
      <tr><td class="k">Invoice No.</td><td>${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)}</td><td class="k">Container</td><td>${esc(s.container || "—")}</td></tr>
      <tr><td class="k">Vessel</td><td>${esc(s.vessel || "—")}</td><td class="k">POD</td><td>${esc(s.pod || ctx.buyer.shipTo)}</td></tr>
      <tr><td class="k">Marks &amp; Nos</td><td>${esc(s.marks || "—")}</td><td class="k">Packages</td><td>${esc(s.pkgs || "—")}</td></tr>
    </table>
    <p>Please deliver the below consignment for export shipment against the above invoice.</p>
    <table><tr><th>GD Code</th><th>Description</th><th>Boxes</th><th>Net Wt kg</th><th>Gross Wt kg</th></tr>
    ${L(ctx).map((r) => `<tr><td>${esc(r.it.gd)}</td><td>${esc(r.it.description)}</td><td class="r">${r.boxes}</td><td class="r">${num(r.netTotal, 3)}</td><td class="r">${num(r.grossTotal, 3)}</td></tr>`).join("")}
    <tr class="tot"><td colspan="2">TOTAL</td><td class="r">${sum(L(ctx), "boxes")}</td><td class="r">${num(sum(L(ctx), "netTotal"), 3)}</td><td class="r">${num(sum(L(ctx), "grossTotal"), 3)}</td></tr></table>`;
  return { name: "Delivery_Order_11A", html };
};
