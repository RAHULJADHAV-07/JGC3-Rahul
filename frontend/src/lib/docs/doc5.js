import { grnSheet, splitRanges, priceListDateOf, numCell, blockRow, blockSheetRow, WB, attr, bcDescription, ddmm, esc, exRate, fitSheet, orderAgg, poHeaderList, sum, upDiv, wbRupee } from "./common.js";

/* Doc 5 · Sales — against 5-Sales.xlsx. The purchase sheet's twin, priced the
   other way round: FOB per hundred pieces in dollars, then the RBI reference in
   rupees at the day's rate. That rate lives in one cell (O3) exactly as it does
   in their sheet, so changing it there re-values the whole column — which is
   the point of the sheet. The price date sits beside the banner, in red. */
export function salesSheet(ctx, rows) {
  const ex = exRate(ctx);
  const banner = [{ v: `PO NO : ${poHeaderList(ctx)}`, s: WB.poBox }];
  for (let i = 1; i < 11; i++) banner.push({ v: "", s: WB.poBox });
  banner.push({ v: ddmm(priceListDateOf(ctx, rows, "fobFrom")), s: WB.headRed }, { v: "", s: WB.headRed },
    { v: "", s: WB.plain }, { v: "", s: WB.plain });

  const H = (v) => ({ v, s: WB.head });
  const out = [
    banner,
    [H("CODE"), H("GD CODE "), H("GL CODE"), H("SIZE"), H("LENGTH"),
      { v: "PACKING", s: WB.headL }, { v: "", s: WB.headR }, H("DESCRIPTION"), H("Bar Codes"),
      { v: "Quantity", s: WB.headL }, { v: "", s: WB.headR },
      H("FOB/100 PCS US$"), H(""), H("RBI REFERENCE"), H("")],
    [H(""), H(""), H(""), H("MM"), H("MM"), H("UNIT "), H("BOX"), H(""), H(""),
      H("Pcs"), H("Box"), H("Unit"), H("Total"), H("RATE @ Rs."), { v: ex, t: "n", s: WB.rate }],
  ];
  const heights = [undefined, 19.5, 19.5];

  const first = out.length + 1;
  const bandMerges = [];
  rows.forEach((r) => {
    // A block of the range (Setup → Item groups) opens under its own heading.
    if (r.blockHead) { out.push(blockSheetRow(r.blockHead, 15, out.length + 1, bandMerges)); heights.push(15); }
    const line = out.length + 1;
    const it = r.it;
    out.push([
      { v: it.code || "", s: WB.gd },
      { v: it.gd || "", s: WB.gd },
      { v: it.gl || "", s: WB.gdC },
      numCell(it.size, WB.head),
      numCell(it.length, WB.head),
      { v: it.packUnit || "", s: WB.numC },
      { v: r.packing, t: "n", s: WB.numC },
      { v: bcDescription(it), s: WB.desc },
      { v: String(it.barcode || ""), t: "s", s: WB.code },
      { v: r.qty, t: "n", s: WB.num },
      { f: upDiv(`J${line}`, `G${line}`), s: WB.num },
      { v: r.fobPc * 100, t: "n", s: WB.usd },
      { f: `J${line}*L${line}/100`, s: WB.usd },
      { f: `IF(J${line}=0,0,O${line}/J${line})`, s: WB.rs },
      { f: `M${line}*$O$3`, s: WB.money },
    ]);
    heights.push(25.5);
  });
  const last = out.length;
  const st = (col, style) => ({ f: `SUBTOTAL(9,${col}${first}:${col}${last})`, s: style });

  out.push(rows.length ? [
    { v: "", s: WB.endGd }, { v: "", s: WB.endGd }, { v: "", s: WB.endGd },
    { v: "", s: WB.endB }, { v: "", s: WB.endB }, { v: "", s: WB.end }, { v: "", s: WB.end },
    { v: "", s: WB.endDesc }, { v: "TOTAL", s: WB.tot },
    st("J", WB.tot), st("K", WB.tot), { v: "", s: WB.usd },
    st("M", WB.totUsd), { v: "", s: WB.totRs }, st("O", WB.totMoney),
  ] : []);

  return fitSheet({
    name: "Sales",
    rows: out,
    heights,
    merges: ["A1:K1", "L1:M1", "N1:O1", "F2:G2", "J2:K2", "L2:M2", "N2:O2", ...bandMerges],
    /* Their money columns are the default 9.14 — wide enough only because the
       rate cell in their copy is empty. Filled in, the rupee columns print
       ###, so the three that carry a total are given room. */
    widths: [13.42578125, 11.28515625, 13.42578125, 5.140625, 8.5703125, 6, 6.28515625,
      32.7109375, 14.140625, 7, 7.28515625, 9.140625, 11.5, 12, 13.5],
    defaultColWidth: 9.140625,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    baseFont: "normArial",
    tabColor: "FF903C3A",
    page: {
      paper: 9, orientation: "portrait", scale: 19, fit: true,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0, footer: 0 },
    },
  }, { widen: false });
}

/* The GRN tab of 5-Sales.xlsx: no CODE, no LENGTH. Its money columns are
   given the same room as the PP tab's, so a filled-in rate never prints ###. */
const SALES_GRN = {
  name: "SalesGRN", drop: [0, 4], tabColor: "FFC3D69B",
  widths: [11.28515625, 11.28515625, 5.140625, 6, 6.28515625, 32.7109375, 14.140625,
    9.140625, 9.28515625, 9.140625, 11.5, 12, 13.5],
};

function salesHtml(ctx, rows, grn) {
  const pp = (x) => (grn ? "" : x);                 // a cell only the PP tab has
  const n = grn ? 9 : 11;
  const ex = exRate(ctx);
  const boxFml = attr(upDiv("{qty}", "{packbox}"));
  const usd2 = (n) => `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const rs2 = (n) => `Rs. ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const body = rows.map((r) => {
    const it = r.it;
    return `${blockRow(r, n + 4)}<tr>
      ${pp(`<td class="gd">${esc(it.code)}</td>`)}
      <td class="${grn ? "" : "gd"}">${esc(it.gd)}</td>
      <td class="${grn ? "c" : "gdc"}">${esc(it.gl)}</td>
      <td class="${grn ? "c" : "bh"}">${esc(it.size)}</td>
      ${pp(`<td class="bh">${esc(it.length)}</td>`)}
      <td class="c">${esc(it.packUnit || "")}</td>
      <td class="c" data-t="int" data-v="${r.packing}">${r.packing}</td>
      <td class="desc">${esc(bcDescription(it)).replace(/\n/g, "<br>")}</td>
      <td class="${grn ? "c" : "code"}">${esc(it.barcode)}</td>
      <td class="r" data-t="int" data-v="${r.qty}">${r.qty}</td>
      <td class="r" data-t="int" data-f="${boxFml}">${r.boxes}</td>
      <td class="r" data-t="usd" data-v="${r.fobPc * 100}">${usd2(r.fobPc * 100)}</td>
      <td class="r" data-t="usd" data-f="{qty}*{fob100}/100">${usd2(r.fobTotal)}</td>
      <td class="r" data-t="inr" data-v="${r.qty ? r.rbiTotal / r.qty : 0}">${rs2(r.qty ? r.rbiTotal / r.qty : 0)}</td>
      <td class="r" data-t="inr" data-f="{fobtot}*${ex}">${wbRupee(r.rbiTotal)}</td>
    </tr>`;
  }).join("");

  return `<div class="title">SALES${grn ? " · GRN" : ""}</div>
    <table class="wb">
      <tr class="sec po"><td colspan="${n}">PO NO : ${esc(poHeaderList(ctx))}</td>
        <td class="red c" colspan="2">${esc(ddmm(priceListDateOf(ctx, rows, "fobFrom")))}</td><td colspan="2"></td></tr>
      <tr>${pp("<th>CODE</th>")}<th>GD CODE</th><th>GL CODE</th><th>SIZE</th>${pp("<th>LENGTH</th>")}
        <th colspan="2">PACKING</th><th>DESCRIPTION</th><th>Bar Codes</th>
        <th colspan="2">Quantity</th><th colspan="2">FOB/100 PCS US$</th><th colspan="2">RBI REFERENCE</th></tr>
      <tr class="hd2">${pp("<th></th>")}<th></th><th></th><th>MM</th>${pp("<th>MM</th>")}<th>UNIT</th><th data-k="packbox">BOX</th>
        <th></th><th></th><th data-k="qty">Pcs</th><th data-k="box">Box</th>
        <th data-k="fob100">Unit</th><th data-k="fobtot">Total</th>
        <th>RATE @ Rs.</th><th class="r" data-k="rbi">${wbRupee(ex)}</th></tr>
      ${body}
      <tr class="tot">${'<td class="o"></td>'.repeat(grn ? 6 : 8)}<td>TOTAL</td>
        <td class="r" data-t="int" data-sum="qty">${sum(rows, "qty")}</td>
        <td class="r" data-t="int" data-sum="box">${sum(rows, "boxes")}</td>
        <td></td>
        <td class="r" data-t="usd" data-sum="fobtot">${usd2(sum(rows, "fobTotal"))}</td>
        <td class="nb"></td>
        <td class="r" data-t="inr" data-sum="rbi">${wbRupee(sum(rows, "rbiTotal"))}</td></tr>
    </table>`;
}

/* PP on SalesPP, nylon on SalesGRN, each dated by its own price list. */
export const B_5 = (ctx) => {
  const parts = splitRanges(ctx, orderAgg(ctx));
  const html = parts.map((p) => salesHtml(ctx, p.rows, p.key === "grn")).join('<div class="pgbrk"></div>');
  const sheets = parts.map((p) => (p.key === "grn"
    ? grnSheet(salesSheet(ctx, p.rows), SALES_GRN)
    : { ...salesSheet(ctx, p.rows), name: "SalesPP" }));
  return { name: "Sales", html, sheets, page: "portrait" };
};
