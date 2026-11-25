import { L, bandOpener, P7, RS, RUPEE, USD, bcDescription, ddmm, esc, exRate, fitSheet, inr, poBannerList, poStack, sum, usd, wbRupee } from "./common.js";

/* Doc 9 · Sales (Supplier) — against 9-Sales.xlsx. The purchase sheet priced
   the other way round: FOB per piece in dollars, then the RBI reference in
   rupees at the day's rate, which lives in one cell (Q3) exactly as it does in
   their sheet — change it there and the whole column re-values. The price date
   sits beside the banner in red, and there is no HSN column on this one. */
export function supplierSalesSheet(ctx, rows) {
  const ex = exRate(ctx);
  const S = {
    ...P7,
    dateRed: { font: "refr", border: "b", align: "center", valign: "center" },
    gdC: { font: "refgd", border: "box", align: "center", valign: "center" },
    usd: { font: "ref", border: "box", valign: "center", fmt: USD },
    rs: { font: "ref", border: "box", valign: "center", fmt: RS },
    inr: { font: "ref", border: "box", valign: "center", fmt: RUPEE },
    rateHd: { font: "refb", border: "box", align: "center", valign: "center", fmt: RS },
    rate: { font: "refb", border: "box", valign: "center", fmt: RUPEE },
    totUsd: { font: "refb", border: "box", valign: "center", fmt: USD },
    totRs: { font: "refb", border: "box", valign: "center", fmt: RS },
    totInr: { font: "refb", border: "box", valign: "center", fmt: RUPEE },
  };
  const H = (v) => ({ v, s: S.head });
  const groups = [...new Set(rows.map((r) => String(r.it.group || "").trim()).filter(Boolean))];
  const firstBand = groups.length ? groups[0] : "";

  const out = [
    [{ v: `PO NO. ${poBannerList(ctx)}`, s: S.banner }, ...Array(12).fill({ v: "", s: S.banner }),
      { v: ddmm(ctx.inv.date), s: S.dateRed }, { v: "", s: S.dateRed },
      { v: "", s: S.banner }, { v: "", s: S.banner }],
    [{ v: "SR. NO.", s: S.headW }, { v: "PO NO.", s: S.headW },
      { v: "CODE ", s: S.headRT }, { v: "GD CODE", s: S.headV }, { v: "GL CODE", s: S.head },
      H("SIZE "), H("LENGTH"), { v: "PACKING ", s: S.headL }, { v: "", s: S.headR },
      { v: "DESCRIPTION", s: S.headT }, { v: "BAR CODES", s: S.headT },
      { v: "QUANTITY", s: S.headL }, { v: "", s: S.headR },
      H("FOB/PC US$"), H(""), H("RBI REFERENCE"), H("")],
    [{ v: "", s: S.headW }, { v: "", s: S.headW },
      { v: firstBand, s: S.bandC }, { v: "", s: S.bandD }, { v: "", s: S.head },
      H("MM / IN"), H("MM"), H("UNIT"), H("BOX"),
      { v: "", s: S.headB }, { v: "", s: S.headB },
      H("PCS"), H("BOX"), H("Unit"), H("Total"),
      { v: "RATE @ Rs.", s: S.rateHd }, { v: ex, t: "n", s: S.rate }],
  ];
  const heights = [undefined, 12.75, undefined];

  const bandAt = bandOpener(rows, firstBand);
  let first = 0;
  let last = 0;
  rows.forEach((r, ri) => {
    const g = bandAt(r, ri);
    if (g) {
      out.push([{ v: "", s: S.sr }, { v: "", s: S.po },
        { v: g, s: S.bandC }, { v: "", s: S.bandD }, { v: "", s: S.gdC },
        ...[S.mid, S.mid, S.mid, S.mid, S.desc, S.bar, S.num, S.num, S.usd, S.usd, S.rs, S.inr]
          .map((s) => ({ v: "", s }))]);
      heights.push(15);
    }
    const line = out.length + 1;
    const it = r.it;
    out.push([
      { v: r.range || "", s: S.sr },
      { v: poStack(r.pos), s: S.po },
      { v: it.code || "", s: S.codeC },
      { v: it.gd || "", s: S.code },
      { v: it.gl || "", s: S.gdC },
      { v: it.size || "", s: S.mid },
      { v: it.length || "", s: S.mid },
      { v: it.packUnit || "", s: S.mid },
      { v: r.packing, t: "n", s: S.mid },
      { v: bcDescription(it), s: S.desc },
      { v: String(it.barcode || ""), t: "s", s: S.bar },
      { v: r.pieces, t: "n", s: S.num },
      { f: `$L${line}/$I${line}`, s: S.num },
      { v: r.fobPc, t: "n", s: S.usd },
      { f: `$L${line}*N${line}`, s: S.usd },
      { f: `IF(L${line}=0,0,Q${line}/L${line})`, s: S.rs },
      { f: `O${line}*$Q$3`, s: S.inr },
    ]);
    if (!first) first = line;
    last = line;
    heights.push(25.5);
  });

  const st = (col, style) => ({ f: first ? `SUBTOTAL(9,${col}${first}:${col}${last})` : "0", s: style });
  out.push(rows.length ? [
    null, null, { v: "", s: S.endGd }, { v: "", s: S.end }, { v: "", s: S.endGd },
    { v: "", s: S.endL }, { v: "", s: S.endL }, { v: "", s: S.endL }, { v: "", s: S.endL },
    { v: "", s: S.endR }, { v: "TOTAL", s: S.tot },
    st("L", S.totV), st("M", S.totV), { v: "", s: S.num },
    st("O", S.totUsd), { v: "", s: S.totRs }, st("Q", S.totInr),
  ] : []);

  return fitSheet({
    name: "Sales",
    rows: out,
    heights,
    merges: ["A1:M1", "N1:O1", "A2:A3", "B2:B3", "E2:E3", "H2:I2", "J2:J3", "K2:K3", "L2:M2", "N2:O2", "P2:Q2"],
    widths: [9.140625, 9.140625, 13.42578125, 12.5703125, 13.42578125, 7.7109375, 8.5703125, 6, 6.140625,
      25.140625, 14.28515625, 9.140625, 9.140625, 9.140625, 10.140625, 11.5703125, 13.42578125],
    defaultColWidth: 9.140625,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    page: {
      paper: 9, orientation: "landscape", scale: 40, fit: true, fitH: 0,
      margins: { left: 0.39370078740157499, right: 0.39370078740157499, top: 0.39370078740157499, bottom: 0.39370078740157499, header: 0, footer: 0 },
    },
  });
}

export const B_9 = (ctx) => {
  const rows = L(ctx);
  const ex = exRate(ctx);
  const groups = [...new Set(rows.map((r) => String(r.it.group || "").trim()).filter(Boolean))];
  const bandAt = bandOpener(rows, groups.length ? groups[0] : "");
  const usd2 = (n) => `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const rs2 = (n) => `Rs. ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const body = rows.map((r, ri) => {
    const it = r.it;
    const g = bandAt(r, ri);
    const open = g ? (`<tr class="band"><td></td><td></td>`
      + `<td class="gd" colspan="2">${esc(g)}</td>${"<td></td>".repeat(13)}</tr>`) : "";
    const perPc = r.pieces ? r.rbiTotal / r.pieces : 0;
    return `${open}<tr>
      <td class="c">${esc(r.range)}</td>
      <td class="po">${esc(poStack(r.pos)).replace(/\n/g, "<br>")}</td>
      <td class="gd">${esc(it.code)}</td>
      <td class="gd">${esc(it.gd)}</td>
      <td class="gdc">${esc(it.gl)}</td>
      <td class="c">${esc(it.size)}</td>
      <td class="c">${esc(it.length)}</td>
      <td class="c">${esc(it.packUnit || "")}</td>
      <td class="c" data-t="int" data-v="${r.packing}">${r.packing}</td>
      <td class="desc b">${esc(bcDescription(it)).replace(/\n/g, "<br>")}</td>
      <td class="code">${esc(it.barcode)}</td>
      <td class="r" data-t="int" data-v="${r.pieces}">${r.pieces}</td>
      <td class="r" data-t="int" data-f="{qty}/{packbox}">${r.boxes}</td>
      <td class="r" data-t="usd" data-v="${r.fobPc}">${usd2(r.fobPc)}</td>
      <td class="r" data-t="usd" data-f="{qty}*{fobpc}">${usd2(r.fobTotal)}</td>
      <td class="r" data-t="inr" data-v="${perPc}">${rs2(perPc)}</td>
      <td class="r" data-t="inr" data-f="{fobtot}*${ex}">${wbRupee(r.rbiTotal)}</td>
    </tr>`;
  }).join("");

  const html = `<div class="title">SALES (Supplier)</div>
    <table class="wb">
      <tr class="sec po rule"><td colspan="13">PO NO. ${esc(poBannerList(ctx))}</td>
        <td class="red c" colspan="2">${esc(ddmm(ctx.inv.date))}</td><td colspan="2"></td></tr>
      <tr><th rowspan="2">SR. NO.</th><th rowspan="2">PO NO.</th><th>CODE</th><th>GD CODE</th><th rowspan="2">GL CODE</th>
        <th>SIZE</th><th>LENGTH</th><th colspan="2">PACKING</th>
        <th rowspan="2">DESCRIPTION</th><th rowspan="2">BAR CODES</th>
        <th colspan="2">QUANTITY</th><th colspan="2">FOB/PC US$</th><th colspan="2">RBI REFERENCE</th></tr>
      <tr class="hd2"><th class="gd" colspan="2">${esc(groups[0] || "")}</th>
        <th>MM / IN</th><th>MM</th><th>UNIT</th><th data-k="packbox">BOX</th>
        <th data-k="qty">PCS</th><th data-k="box">BOX</th>
        <th data-k="fobpc">Unit</th><th data-k="fobtot">Total</th>
        <th>RATE @ Rs.</th><th class="r" data-k="rbi">${wbRupee(ex)}</th></tr>
      ${body}
      <tr class="tot"><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td>
        <td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td>
        <td>TOTAL</td>
        <td class="r" data-t="int" data-sum="qty">${sum(rows, "pieces")}</td>
        <td class="r" data-t="int" data-sum="box">${sum(rows, "boxes")}</td>
        <td></td>
        <td class="r" data-t="usd" data-sum="fobtot">${usd2(sum(rows, "fobTotal"))}</td>
        <td class="nb"></td>
        <td class="r" data-t="inr" data-sum="rbi">${wbRupee(sum(rows, "rbiTotal"))}</td></tr>
    </table>`;
  return { name: "Sales_Supplier", html, sheet: supplierSalesSheet(ctx, rows) };
};
