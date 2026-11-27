import { grnSheet, splitRanges, numCell, blockRow, blockSheetRow, WB, attr, bcDescription, esc, fitSheet, hsnText, hsnValue, orderAgg, poHeaderList, sum, upDiv, wbFixed } from "./common.js";

/* Doc 3 · Packing — the same treatment against 3-Packing.xlsx: fifteen
   columns under a two-line header with PACKING split into UNIT / BOX and
   Quantity into Pcs / Box, the weights carried to three decimals, and the row
   totals taken with SUBTOTAL so a filtered sheet re-totals itself.

   Boxes are rounded up rather than divided straight, as their sheet does — a
   part box is still a box — and the volume and weights follow the box count so
   editing a quantity re-totals the sheet. */
export function packingSheet(ctx, rows) {
  const sheet = packingSheetFit(ctx, rows);
  // Total Nett / Gross wrap inside cells merged down both heading rows, so
  // the rows keep their book's 19.5pt.
  sheet.heights[1] = 19.5;
  sheet.heights[2] = 19.5;
  return sheet;
}

function packingSheetFit(ctx, rows) {
  const banner = [{ v: `PO NO : ${poHeaderList(ctx)}`, s: WB.poL }];
  for (let i = 1; i < 14; i++) banner.push({ v: "", s: WB.poM });
  banner.push({ v: "", s: WB.poR });

  const H = (v) => ({ v, s: WB.head });
  const out = [
    banner,
    [H("CODE"), H("GD CODE "), H("GL CODE"), H("SIZE"), H("LENGTH"),
      { v: "PACKING", s: WB.headL }, { v: "", s: WB.headR }, H("DESCRIPTION"), H("Bar Codes"), H("HSN CODES"),
      { v: "Quantity", s: WB.headL }, { v: "", s: WB.headR }, H("Volumn"),
      { v: "Total Nett\nKGS", s: WB.headW }, { v: "Total Gross\nKgs", s: WB.headW }],
    [H(""), H(""), H(""), H("MM"), H("MM"), H("UNIT "), H("BOX"), H(""), H(""), H(""),
      H("Pcs"), H("Box"), H(""), { v: "", s: WB.headW }, { v: "", s: WB.headW }],
  ];
  const heights = [undefined, 19.5, 19.5];

  const first = out.length + 1;
  const bandMerges = [];
  rows.forEach((r) => {
    // A block of the range (Setup → Item groups) opens under its own heading.
    if (r.blockHead) { out.push(blockSheetRow(r.blockHead, 15, out.length + 1, bandMerges)); heights.push(15); }
    const line = out.length + 1;
    const it = r.it;
    const hsn = hsnValue(it);
    const box = `L${line}`;
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
      hsn == null ? { v: String(it.hsn || ""), t: "s", s: WB.numC } : { v: hsn, t: "n", s: WB.hsn },
      { v: r.qty, t: "n", s: WB.num },
      { f: upDiv(`K${line}`, `G${line}`), s: WB.num },
      { f: `${box}*${Number(it.volume) || 0}`, s: WB.num2 },
      { f: `${box}*${Number(it.netPerBox) || 0}`, s: WB.num3 },
      { f: `${box}*${Number(it.grossPerBox) || 0}`, s: WB.num3 },
    ]);
    heights.push(25.5);
  });
  const last = out.length;
  const st = (col, style) => ({ f: `SUBTOTAL(9,${col}${first}:${col}${last})`, s: style });

  out.push(rows.length ? [
    { v: "", s: WB.endGd }, { v: "", s: WB.endGd }, { v: "", s: WB.endGd },
    { v: "", s: WB.endB }, { v: "", s: WB.endB }, { v: "", s: WB.end }, { v: "", s: WB.end },
    { v: "", s: WB.endDesc }, { v: "TOTAL", s: WB.tot }, { v: "", s: WB.tot },
    st("K", WB.tot), st("L", WB.tot), st("M", WB.tot2), st("N", WB.tot3), st("O", WB.tot3),
  ] : []);

  return fitSheet({
    name: "Packing",
    rows: out,
    heights,
    merges: ["A1:O1", "F2:G2", "K2:L2", "N2:N3", "O2:O3", ...bandMerges],
    widths: [13.42578125, 11.28515625, 13.42578125, 5.140625, 8.5703125, 6, 6.28515625,
      32.7109375, 14.140625, 14.140625, 7, 7.28515625, 8, 9.140625, 9.140625],
    defaultColWidth: 9.140625,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    baseFont: "normArial",
    tabColor: "FFC00000",
    page: {
      paper: 9, orientation: "landscape", scale: 84, fit: true,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0, footer: 0 },
    },
  }, { widen: false });
}

/* The GRN tab of 3-Packing.xlsx: no CODE, no LENGTH. */
const PACK_GRN = {
  name: "PackingGRN", drop: [0, 4], tabColor: "FFFFFF00",
  widths: [11.28515625, 11.28515625, 5.140625, 6, 6.28515625, 32.7109375, 14.140625, 14.140625,
    9.140625, 9.28515625, 9.140625, 9.140625, 9.140625],
};

function packingHtml(ctx, rows, grn) {
  const pp = (x) => (grn ? "" : x);                 // a cell only the PP tab has
  const n = grn ? 13 : 15;
  const boxFml = attr(upDiv("{qty}", "{packbox}"));
  const body = rows.map((r) => {
    const it = r.it;
    return `${blockRow(r, n)}<tr>
      ${pp(`<td class="gd">${esc(it.code)}</td>`)}
      <td class="${grn ? "" : "gd"}">${esc(it.gd)}</td>
      <td class="${grn ? "c" : "gdc"}">${esc(it.gl)}</td>
      <td class="${grn ? "c" : "bh"}">${esc(it.size)}</td>
      ${pp(`<td class="bh">${esc(it.length)}</td>`)}
      <td class="c">${esc(it.packUnit || "")}</td>
      <td class="c" data-t="int" data-v="${r.packing}">${r.packing}</td>
      <td class="desc">${esc(bcDescription(it)).replace(/\n/g, "<br>")}</td>
      <td class="${grn ? "c" : "code"}">${esc(it.barcode)}</td>
      <td class="c">${esc(hsnText(it))}</td>
      <td class="r" data-t="int" data-v="${r.qty}">${r.qty}</td>
      <td class="r" data-t="int" data-f="${boxFml}">${r.boxes}</td>
      <td class="r" data-t="num" data-f="{box}*${Number(it.volume) || 0}">${wbFixed(r.volTotal, 2)}</td>
      <td class="r" data-t="num3" data-f="{box}*${Number(it.netPerBox) || 0}">${wbFixed(r.netTotal, 3)}</td>
      <td class="r" data-t="num3" data-f="{box}*${Number(it.grossPerBox) || 0}">${wbFixed(r.grossTotal, 3)}</td>
    </tr>`;
  }).join("");

  return `<div class="title">PACKING${grn ? " · GRN" : ""}</div>
    <table class="wb">
      <tr class="sec po"><td colspan="${n}">PO NO : ${esc(poHeaderList(ctx))}</td></tr>
      <tr>${pp("<th>CODE</th>")}<th>GD CODE</th><th>GL CODE</th><th>SIZE</th>${pp("<th>LENGTH</th>")}
        <th colspan="2">PACKING</th><th>DESCRIPTION</th><th>Bar Codes</th><th>HSN CODES</th>
        <th colspan="2">Quantity</th><th data-k="voltot">Volumn</th>
        <th rowspan="2" data-k="nettot">Total Nett<br>KGS</th><th rowspan="2" data-k="grosstot">Total Gross<br>Kgs</th></tr>
      <tr class="hd2">${pp("<th></th>")}<th></th><th></th><th>MM</th>${pp("<th>MM</th>")}<th>UNIT</th><th data-k="packbox">BOX</th>
        <th></th><th></th><th></th><th data-k="qty">Pcs</th><th data-k="box">Box</th><th></th></tr>
      ${body}
      <tr class="tot">${'<td class="o"></td>'.repeat(grn ? 6 : 8)}<td>TOTAL</td><td></td>
        <td class="r" data-t="int" data-sum="qty">${sum(rows, "qty")}</td>
        <td class="r" data-t="int" data-sum="box">${sum(rows, "boxes")}</td>
        <td class="r" data-t="num" data-sum="voltot">${wbFixed(sum(rows, "volTotal"), 2)}</td>
        <td class="r" data-t="num3" data-sum="nettot">${wbFixed(sum(rows, "netTotal"), 3)}</td>
        <td class="r" data-t="num3" data-sum="grosstot">${wbFixed(sum(rows, "grossTotal"), 3)}</td></tr>
    </table>`;
}

/* The PP lines on PackingPP and the nylon on PackingGRN, as their book keeps
   them — on paper as in Excel, each range a page of its own. */
export const B_3 = (ctx) => {
  const parts = splitRanges(ctx, orderAgg(ctx));
  const html = parts.map((p) => packingHtml(ctx, p.rows, p.key === "grn")).join('<div class="pgbrk"></div>');
  const sheets = parts.map((p) => (p.key === "grn"
    ? grnSheet(packingSheet(ctx, p.rows), PACK_GRN)
    : { ...packingSheet(ctx, p.rows), name: "PackingPP" }));
  return { name: "Packing", html, sheets };
};
