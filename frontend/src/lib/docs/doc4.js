import { grnSheet, splitRanges, numCell, blockRow, blockSheetRow, WB, attr, bcDescription, ddmmyy, esc, priceListDateOf, fitSheet, hsnText, hsnValue, orderAgg, poHeaderList, sum, upDiv, wbRupee } from "./common.js";

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
      { v: `VALUE - ${ddmmyy(priceListDateOf(ctx, rows))}`, s: WB.headRed }, { v: "", s: WB.headRed }],
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
      numCell(it.size, WB.head),
      numCell(it.length, WB.head),
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
    baseFont: "normArial",
    tabColor: "FF00B050",
    page: {
      paper: 9, orientation: "portrait", scale: 19, fit: true,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0, footer: 0 },
    },
  }, { widen: false });
}

/* The GRN tab of 4-Purchase.xlsx: no CODE, no LENGTH, the value heading in
   black. */
const PUR_GRN = {
  name: "Purchase GRN", drop: [0, 3], tabColor: "FF0070C0", plainHeads: true, boxBanner: true,
  widths: [11.28515625, 5.140625, 6, 6.28515625, 32.7109375, 14.140625, 14.140625,
    9.140625, 9.28515625, 10, 12.28515625],
};

function purchaseHtml(ctx, rows, grn) {
  const pp = (x) => (grn ? "" : x);                 // a cell only the PP tab has
  const n = grn ? 11 : 13;
  const boxFml = attr(upDiv("{qty}", "{packbox}"));
  const body = rows.map((r) => {
    const it = r.it;
    return `${blockRow(r, n)}<tr>
      ${pp(`<td class="gd">${esc(it.code)}</td>`)}
      <td class="${grn ? "" : "gd"}">${esc(it.gd)}</td>
      <td class="${grn ? "c" : "bh"}">${esc(it.size)}</td>
      ${pp(`<td class="bh">${esc(it.length)}</td>`)}
      <td class="c">${esc(it.packUnit || "")}</td>
      <td class="c" data-t="int" data-v="${r.packing}">${r.packing}</td>
      <td class="desc">${esc(bcDescription(it)).replace(/\n/g, "<br>")}</td>
      <td class="${grn ? "c" : "code"}">${esc(it.barcode)}</td>
      <td class="c">${esc(hsnText(it))}</td>
      <td class="r" data-t="int" data-v="${r.qty}">${r.qty}</td>
      <td class="r" data-t="int" data-f="${boxFml}">${r.boxes}</td>
      <td class="r" data-t="inr" data-v="${r.valUnit}">${wbRupee(r.valUnit)}</td>
      <td class="r" data-t="inr" data-f="{qty}*{valunit}">${wbRupee(r.valTotal)}</td>
    </tr>`;
  }).join("");

  return `<div class="title">PURCHASE${grn ? " · GRN" : ""}</div>
    <table class="wb">
      <tr class="sec po rule"><td colspan="${n}">PO NO : ${esc(poHeaderList(ctx))}</td></tr>
      <tr>${pp("<th>CODE</th>")}<th>GD CODE</th><th>SIZE</th>${pp("<th>LENGTH</th>")}
        <th colspan="2">PACKING</th><th>DESCRIPTION</th><th>Bar Codes</th><th>HSN CODES</th>
        <th colspan="2">Quantity</th><th class="${grn ? "" : "red"}" colspan="2">VALUE - ${esc(ddmmyy(priceListDateOf(ctx, rows)))}</th></tr>
      <tr class="hd2">${pp("<th></th>")}<th></th><th>MM</th>${pp("<th>MM</th>")}<th>UNIT</th><th data-k="packbox">BOX</th>
        <th></th><th></th><th></th><th data-k="qty">Pcs</th><th data-k="box">Box</th>
        <th data-k="valunit">UNIT</th><th data-k="valtot">Total</th></tr>
      ${body}
      <tr class="tot">${'<td class="o"></td>'.repeat(grn ? 5 : 7)}<td>TOTAL</td><td></td>
        <td class="r" data-t="int" data-sum="qty">${sum(rows, "qty")}</td>
        <td class="r" data-t="int" data-sum="box">${sum(rows, "boxes")}</td>
        <td></td>
        <td class="r" data-t="inr" data-sum="valtot">${wbRupee(sum(rows, "valTotal"))}</td></tr>
    </table>`;
}

/* PP on "Purchase PP", nylon on "Purchase GRN", each headed with the date of
   the price list its own lines were bought at. */
export const B_4 = (ctx) => {
  const parts = splitRanges(ctx, orderAgg(ctx));
  const html = parts.map((p) => purchaseHtml(ctx, p.rows, p.key === "grn")).join('<div class="pgbrk"></div>');
  const sheets = parts.map((p) => (p.key === "grn"
    ? grnSheet(purchaseSheet(ctx, p.rows), PUR_GRN)
    : { ...purchaseSheet(ctx, p.rows), name: "Purchase PP" }));
  return { name: "Purchase", html, sheets, page: "portrait" };
};
