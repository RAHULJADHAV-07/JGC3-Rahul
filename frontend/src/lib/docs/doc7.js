import { L, bandOpener, P7, bcDescription, esc, fitSheet, hsnText, hsnValue, poBannerList, poStack, sum, wbFixed } from "./common.js";

export function supplierPackingSheet(ctx, rows) {
  const H = (v) => ({ v, s: P7.head });
  const groups = [...new Set(rows.map((r) => String(r.it.group || "").trim()).filter(Boolean))];
  const firstBand = groups.length ? groups[0] : "";

  const out = [
    [{ v: `PO NO. ${poBannerList(ctx)}`, s: P7.banner }, ...Array(17).fill({ v: "", s: P7.banner })],
    [{ v: "SR. NO.", s: P7.headW }, { v: "PO NO.", s: P7.headW },
      { v: "CODE ", s: P7.headRT }, { v: "GD CODE", s: P7.headV }, { v: "OSWIN CODE", s: P7.headTL },
      H("SIZE "), H("LENGTH"), { v: "PACKING ", s: P7.headL }, { v: "", s: P7.headR },
      { v: "DESCRIPTION", s: P7.headT }, { v: "BAR CODES", s: P7.headT }, { v: "HSN CODE", s: P7.headT },
      { v: "QUANTITY", s: P7.headL }, { v: "", s: P7.headR },
      H("VOLUMN"), H(""), H("TOTAL"), H("")],
    [{ v: "", s: P7.headW }, { v: "", s: P7.headW },
      { v: firstBand, s: P7.bandC }, { v: "", s: P7.bandD }, { v: "", s: P7.bandD },
      H("MM / IN"), H("MM"), H("UNIT"), H("BOX"),
      { v: "", s: P7.headB }, { v: "", s: P7.headB }, { v: "", s: P7.headB },
      H("PCS"), H("BOX"), H("PER BOX"), H("TOTAL"),
      { v: "NET WT", s: P7.headV }, { v: "GROSS WT", s: P7.headV }],
  ];
  const heights = [undefined, 12.75, undefined];

  const bandAt = bandOpener(rows, firstBand);
  let first = 0;
  let last = 0;
  rows.forEach((r, ri) => {
    const g = bandAt(r, ri);
    if (g) {                       // a new size band opens
      /* The cells either side of the label keep their column's own formatting,
         as theirs do — the band is a break in the list, not a different table. */
      out.push([{ v: "", s: P7.sr }, { v: "", s: P7.po },
        { v: g, s: P7.bandC }, { v: "", s: P7.bandD }, { v: "", s: P7.bandD },
        ...[P7.mid, P7.mid, P7.mid, P7.mid, P7.desc, P7.bar, P7.hsn,
          P7.num, P7.num, P7.num2, P7.num2, P7.num3, P7.num3].map((s) => ({ v: "", s }))]);
      heights.push(15);
    }
    const line = out.length + 1;
    const it = r.it;
    const hsn = hsnValue(it);
    out.push([
      { v: r.range || "", s: P7.sr },
      { v: poStack(r.pos), s: P7.po },
      { v: it.code || "", s: P7.codeC },
      { v: it.gd || "", s: P7.code },
      { v: it.oswin || "", s: P7.code },
      { v: it.size || "", s: P7.mid },
      { v: it.length || "", s: P7.mid },
      { v: it.packUnit || "", s: P7.mid },
      { v: r.packing, t: "n", s: P7.mid },
      { v: bcDescription(it), s: P7.desc },
      { v: String(it.barcode || ""), t: "s", s: P7.bar },
      hsn == null ? { v: String(it.hsn || ""), t: "s", s: P7.mid } : { v: hsn, t: "n", s: P7.hsn },
      { v: r.pieces, t: "n", s: P7.num },
      { f: `$M${line}/$I${line}`, s: P7.num },
      { v: Number(it.volume) || 0, t: "n", s: P7.num2 },
      { f: `$N${line}*$O${line}`, s: P7.num2 },
      { f: `$N${line}*${Number(it.netPerBox) || 0}`, s: P7.num3 },
      { f: `$N${line}*${Number(it.grossPerBox) || 0}`, s: P7.num3 },
    ]);
    if (!first) first = line;
    last = line;
    heights.push(25.5);
  });

  const st = (col, style) => ({ f: first ? `SUBTOTAL(9,${col}${first}:${col}${last})` : "0", s: style });
  const sm = (col, style) => ({ f: first ? `SUM(${col}${first}:${col}${last})` : "0", s: style });
  // Their totals row starts at the code column; A and B are left untouched.
  out.push(rows.length ? [
    null, null, { v: "", s: P7.endGd }, { v: "", s: P7.end }, { v: "", s: P7.end },
    { v: "", s: P7.endL }, { v: "", s: P7.endL }, { v: "", s: P7.endL }, { v: "", s: P7.endL },
    { v: "", s: P7.endR }, { v: "TOTAL", s: P7.tot }, { v: "", s: P7.tot },
    st("M", P7.totV), st("N", P7.totV), { v: "", s: P7.num },
    st("P", P7.tot2), sm("Q", P7.tot3), sm("R", P7.tot3),
  ] : []);

  return fitSheet({
    name: "Packing",
    rows: out,
    heights,
    merges: ["A1:R1", "A2:A3", "B2:B3", "H2:I2", "J2:J3", "K2:K3", "L2:L3", "M2:N2", "O2:P2", "Q2:R2"],
    widths: [9.140625, 9.140625, 13.42578125, 12.5703125, 14.5703125, 7.7109375, 8.5703125, 6, 6.140625,
      25.140625, 14.28515625, 14.28515625, 9.140625, 9.140625, 9.140625, 9.140625, 9.140625, 11],
    defaultColWidth: 9.140625,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    page: {
      paper: 9, orientation: "landscape", scale: 74, fit: true, fitH: 0,
      margins: { left: 0.39370078740157499, right: 0.39370078740157499, top: 0.39370078740157499, bottom: 0.39370078740157499, header: 0, footer: 0 },
    },
  });
}

export const B_7 = (ctx) => {
  const rows = L(ctx);
  const groups = [...new Set(rows.map((r) => String(r.it.group || "").trim()).filter(Boolean))];
  const bandAt = bandOpener(rows, groups.length ? groups[0] : "");
  const body = rows.map((r, ri) => {
    const it = r.it;
    const g = bandAt(r, ri);
    const open = g ? (`<tr class="band"><td></td><td></td>`
      + `<td class="gd" colspan="3">${esc(g)}</td>${"<td></td>".repeat(13)}</tr>`) : "";
    return `${open}<tr>
      <td class="c">${esc(r.range)}</td>
      <td class="po">${esc(poStack(r.pos)).replace(/\n/g, "<br>")}</td>
      <td class="gd">${esc(it.code)}</td>
      <td class="gd">${esc(it.gd)}</td>
      <td class="gd">${esc(it.oswin)}</td>
      <td class="c">${esc(it.size)}</td>
      <td class="c">${esc(it.length)}</td>
      <td class="c">${esc(it.packUnit || "")}</td>
      <td class="c" data-t="int" data-v="${r.packing}">${r.packing}</td>
      <td class="desc b">${esc(bcDescription(it)).replace(/\n/g, "<br>")}</td>
      <td class="code">${esc(it.barcode)}</td>
      <td class="code">${esc(hsnText(it))}</td>
      <td class="r" data-t="int" data-v="${r.pieces}">${r.pieces}</td>
      <td class="r" data-t="int" data-f="{qty}/{packbox}">${r.boxes}</td>
      <td class="r" data-t="num" data-v="${Number(it.volume) || 0}">${wbFixed(it.volume, 2)}</td>
      <td class="r" data-t="num" data-f="{box}*{volbox}">${wbFixed(r.volTotal, 2)}</td>
      <td class="r" data-t="num3" data-f="{box}*${Number(it.netPerBox) || 0}">${wbFixed(r.netTotal, 3)}</td>
      <td class="r" data-t="num3" data-f="{box}*${Number(it.grossPerBox) || 0}">${wbFixed(r.grossTotal, 3)}</td>
    </tr>`;
  }).join("");

  const html = `<div class="title">PACKING (Supplier)</div>
    <table class="wb">
      <tr class="sec po rule"><td colspan="18">PO NO. ${esc(poBannerList(ctx))}</td></tr>
      <tr><th rowspan="2">SR. NO.</th><th rowspan="2">PO NO.</th><th>CODE</th><th>GD CODE</th><th>OSWIN CODE</th>
        <th>SIZE</th><th>LENGTH</th><th colspan="2">PACKING</th>
        <th rowspan="2">DESCRIPTION</th><th rowspan="2">BAR CODES</th><th rowspan="2">HSN CODE</th>
        <th colspan="2">QUANTITY</th><th colspan="2">VOLUMN</th><th colspan="2">TOTAL</th></tr>
      <tr class="hd2"><th class="gd" colspan="3">${esc(groups[0] || "")}</th>
        <th>MM / IN</th><th>MM</th><th>UNIT</th><th data-k="packbox">BOX</th>
        <th data-k="qty">PCS</th><th data-k="box">BOX</th><th data-k="volbox">PER BOX</th><th data-k="voltot">TOTAL</th>
        <th data-k="nettot">NET WT</th><th data-k="grosstot">GROSS WT</th></tr>
      ${body}
      <tr class="tot"><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td>
        <td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td>
        <td>TOTAL</td><td></td>
        <td class="r" data-t="int" data-sum="qty">${sum(rows, "pieces")}</td>
        <td class="r" data-t="int" data-sum="box">${sum(rows, "boxes")}</td>
        <td></td>
        <td class="r" data-t="num" data-sum="voltot">${wbFixed(sum(rows, "volTotal"), 2)}</td>
        <td class="r" data-t="num3" data-sum="nettot">${wbFixed(sum(rows, "netTotal"), 3)}</td>
        <td class="r" data-t="num3" data-sum="grosstot">${wbFixed(sum(rows, "grossTotal"), 3)}</td></tr>
    </table>`;
  return { name: "Packing_Supplier", html, sheet: supplierPackingSheet(ctx, rows) };
};
