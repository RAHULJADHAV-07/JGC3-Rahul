import { WB, attr, bcDescription, esc, fitSheet, orderAgg, poHeaderList, sum, upDiv } from "./common.js";

export function barcodeSheet(ctx, rows) {
  const out = [
    [{ v: `PO NO : ${poHeaderList(ctx)}`, s: WB.poL }, { v: "", s: WB.poM }, { v: "", s: WB.poM },
      { v: "", s: WB.poM }, { v: "", s: WB.poM }, { v: "", s: WB.poR }],
    ["GD CODE ", "DESCRIPTION", "Bar Codes", "Lables", "TYPE", "SHEETS"].map((h) => ({ v: h, s: WB.head })),
    ["", "", "", "", "UPS", "REQD"].map((h) => ({ v: h, s: WB.head })),
  ];
  const heights = [undefined, 19.5, 19.5];

  const first = out.length + 1;
  rows.forEach((r) => {
    const line = out.length + 1;
    out.push([
      { v: r.it.gd || "", s: WB.gd },
      { v: bcDescription(r.it), s: WB.desc },
      { v: String(r.it.barcode || ""), t: "s", s: WB.code },
      { v: r.stickers, t: "n", s: WB.numC },
      { v: r.typeUp, t: "n", s: WB.numC },
      { f: upDiv(`D${line}`, `E${line}`), s: WB.num },
    ]);
    heights.push(25.5);
  });
  const last = out.length;

  /* The client totals the labels with SUBTOTAL so a filtered sheet re-totals
     itself, and the sheets column with a plain SUM. Both kept as they are. */
  out.push(rows.length ? [
    { v: "", s: WB.endGd }, { v: "", s: WB.endDesc }, { v: "TOTAL", s: WB.tot },
    { f: `SUBTOTAL(9,D${first}:D${last})`, s: WB.totC },
    { v: "", s: WB.tot }, { f: `SUM(F${first}:F${last})`, s: WB.tot },
  ] : []);

  return fitSheet({
    name: "Barcode",
    rows: out,
    heights,
    merges: ["A1:F1"],
    widths: [11.28515625, 32.7109375, 14.140625, 7, 7, 8.28515625],
    defaultColWidth: 9.140625,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    tabColor: "FF00B0F0",
    page: {
      paper: 9, orientation: "portrait", scale: 19, fit: true,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0, footer: 0 },
    },
  });
}

/* The same grid on screen and in the PDF: the banner row, the two-line header,
   green GD codes on a black hairline grid — the client's sheet, not the app's
   house style, which is why this one document builds its own table rather than
   going through `tableOf`. The data annotations are still on the cells, so the
   HTML converts to a worksheet correctly if it is ever asked to. */
export const B_2 = (ctx) => {
  const rows = orderAgg(ctx);
  const sheetFml = attr(upDiv("{stk}", "{typeup}"));
  const body = rows.map((r) => `<tr>
      <td class="gd">${esc(r.it.gd)}</td>
      <td class="desc">${esc(bcDescription(r.it)).replace(/\n/g, "<br>")}</td>
      <td class="code">${esc(r.it.barcode)}</td>
      <td class="c" data-t="int" data-v="${r.stickers}">${r.stickers}</td>
      <td class="c" data-t="int" data-v="${r.typeUp}">${r.typeUp}</td>
      <td class="r" data-t="int" data-f="${sheetFml}">${r.sheets}</td>
    </tr>`).join("");

  const html = `<div class="title">BARCODE</div>
    <table class="wb fit">
      <colgroup><col style="width:14%"><col style="width:40.7%"><col style="width:17.6%">
        <col style="width:8.7%"><col style="width:8.7%"><col style="width:10.3%"></colgroup>
      <tr class="sec po"><td colspan="6">PO NO : ${esc(poHeaderList(ctx))}</td></tr>
      <tr><th>GD CODE</th><th>DESCRIPTION</th><th>Bar Codes</th>
        <th data-k="stk">Lables</th><th data-k="typeup">TYPE</th><th data-k="sheets">SHEETS</th></tr>
      <tr class="hd2"><th></th><th></th><th></th><th></th><th>UPS</th><th>REQD</th></tr>
      ${body}
      <tr class="tot"><td class="o"></td><td class="o"></td><td>TOTAL</td>
        <td class="c" data-t="int" data-sum="stk">${sum(rows, "stickers")}</td>
        <td></td>
        <td class="r" data-t="int" data-sum="sheets">${sum(rows, "sheets")}</td></tr>
    </table>`;
  return { name: "Barcode", html, sheet: barcodeSheet(ctx, rows), page: "portrait" };
};
