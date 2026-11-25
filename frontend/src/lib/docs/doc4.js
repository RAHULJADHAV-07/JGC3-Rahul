import { blockRow, blockSheetRow, WB, attr, bcDescription, ddmmyy, esc, fitSheet, hsnText, hsnValue, orderAgg, poHeaderList, sum, upDiv, wbRupee } from "./common.js";

/* Doc 4 · Purchase — against 4-Purchase.xlsx. The packing sheet without its
   GL code and volumes, and with what we pay the factory on the end: unit price
   and line value in rupees, under a red heading carrying the date the price
   list was agreed. The banner rules off rather than boxing in, as theirs does. */
export function purchaseSheet(ctx, rows) {
  const banner = [{ v: `PO NO : ${poHeaderList(ctx)}`, s: WB.poB }];
  for (let i = 1; i < 13; i++) banner.push({ v: "", s: WB.poB });

  const H = (v) => ({ v, s: WB.head });
  const out = [
    banner,
    [H("CODE"), H("GD CODE "), H("SIZE"), H("LENGTH"),
      { v: "PACKING", s: WB.headL }, { v: "", s: WB.headR }, H("DESCRIPTION"), H("Bar Codes"), H("HSN CODES"),
      { v: "Quantity", s: WB.headL }, { v: "", s: WB.headR },
      { v: `VALUE - ${ddmmyy(ctx.inv.date)}`, s: WB.headRed }, { v: "", s: WB.headRed }],
    [H(""), H(""), H("MM"), H("MM"), H("UNIT "), H("BOX"), H(""), H(""), H(""),
      H("Pcs"), H("Box"), H("UNIT"), H("Total")],
  ];
  const heights = [undefined, 19.5, 19.5];

  const first = out.length + 1;
  const bandMerges = [];
  rows.forEach((r) => {
    // A block of the range (Setup → Item groups) opens under its own heading.
    if (r.blockHead) { out.push(blockSheetRow(r.blockHead, 13, out.length + 1, bandMerges)); heights.push(15); }
    const line = out.length + 1;
    const it = r.it;
    const hsn = hsnValue(it);
    out.push([
      { v: it.code || "", s: WB.gd },
      { v: it.gd || "", s: WB.gd },
      { v: it.size || "", s: WB.head },
      { v: it.length || "", s: WB.head },
      { v: it.packUnit || "", s: WB.numC },
      { v: r.packing, t: "n", s: WB.numC },
      { v: bcDescription(it), s: WB.desc },
      { v: String(it.barcode || ""), t: "s", s: WB.code },
      hsn == null ? { v: String(it.hsn || ""), t: "s", s: WB.numC } : { v: hsn, t: "n", s: WB.hsn },
      { v: r.qty, t: "n", s: WB.num },
      { f: upDiv(`J${line}`, `F${line}`), s: WB.num },
      { v: r.valUnit, t: "n", s: WB.money },
      { f: `J${line}*L${line}`, s: WB.money },
    ]);
    heights.push(25.5);
  });
  const last = out.length;
  const st = (col, style) => ({ f: `SUBTOTAL(9,${col}${first}:${col}${last})`, s: style });

  out.push(rows.length ? [
    { v: "", s: WB.endGd }, { v: "", s: WB.endGd }, { v: "", s: WB.endB }, { v: "", s: WB.endB },
    { v: "", s: WB.end }, { v: "", s: WB.end }, { v: "", s: WB.endDesc },
    { v: "TOTAL", s: WB.tot }, { v: "", s: WB.tot },
    st("J", WB.tot), st("K", WB.tot), { v: "", s: WB.totMoney }, st("M", WB.totMoney),
  ] : []);

  return fitSheet({
    name: "Purchase",
    rows: out,
    heights,
    merges: ["A1:M1", "E2:F2", "J2:K2", "L2:M2", ...bandMerges],
    widths: [13.42578125, 11.28515625, 5.140625, 8.5703125, 6, 6.28515625, 32.7109375,
      14.140625, 14.140625, 7, 7.28515625, 9.140625, 11.7109375],
    defaultColWidth: 9.140625,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    tabColor: "FF00B050",
    page: {
      paper: 9, orientation: "portrait", scale: 19, fit: true,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0, footer: 0 },
    },
  });
}

export const B_4 = (ctx) => {
  const rows = orderAgg(ctx);
  const boxFml = attr(upDiv("{qty}", "{packbox}"));
  const body = rows.map((r) => {
    const it = r.it;
    return `${blockRow(r, 13)}<tr>
      <td class="gd">${esc(it.code)}</td>
      <td class="gd">${esc(it.gd)}</td>
      <td class="bh">${esc(it.size)}</td>
      <td class="bh">${esc(it.length)}</td>
      <td class="c">${esc(it.packUnit || "")}</td>
      <td class="c" data-t="int" data-v="${r.packing}">${r.packing}</td>
      <td class="desc">${esc(bcDescription(it)).replace(/\n/g, "<br>")}</td>
      <td class="code">${esc(it.barcode)}</td>
      <td class="c">${esc(hsnText(it))}</td>
      <td class="r" data-t="int" data-v="${r.qty}">${r.qty}</td>
      <td class="r" data-t="int" data-f="${boxFml}">${r.boxes}</td>
      <td class="r" data-t="inr" data-v="${r.valUnit}">${wbRupee(r.valUnit)}</td>
      <td class="r" data-t="inr" data-f="{qty}*{valunit}">${wbRupee(r.valTotal)}</td>
    </tr>`;
  }).join("");

  const html = `<div class="title">PURCHASE</div>
    <table class="wb">
      <tr class="sec po rule"><td colspan="13">PO NO : ${esc(poHeaderList(ctx))}</td></tr>
      <tr><th>CODE</th><th>GD CODE</th><th>SIZE</th><th>LENGTH</th>
        <th colspan="2">PACKING</th><th>DESCRIPTION</th><th>Bar Codes</th><th>HSN CODES</th>
        <th colspan="2">Quantity</th><th class="red" colspan="2">VALUE - ${esc(ddmmyy(ctx.inv.date))}</th></tr>
      <tr class="hd2"><th></th><th></th><th>MM</th><th>MM</th><th>UNIT</th><th data-k="packbox">BOX</th>
        <th></th><th></th><th></th><th data-k="qty">Pcs</th><th data-k="box">Box</th>
        <th data-k="valunit">UNIT</th><th data-k="valtot">Total</th></tr>
      ${body}
      <tr class="tot"><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td>
        <td class="o"></td><td class="o"></td><td class="o"></td><td>TOTAL</td><td></td>
        <td class="r" data-t="int" data-sum="qty">${sum(rows, "qty")}</td>
        <td class="r" data-t="int" data-sum="box">${sum(rows, "boxes")}</td>
        <td></td>
        <td class="r" data-t="inr" data-sum="valtot">${wbRupee(sum(rows, "valTotal"))}</td></tr>
    </table>`;
  return { name: "Purchase", html, sheet: purchaseSheet(ctx, rows), page: "portrait" };
};
