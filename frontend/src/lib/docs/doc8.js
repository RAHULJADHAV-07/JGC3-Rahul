import { L, P7, RUPEE, bcDescription, ddmm, esc, fitSheet, hsnText, hsnValue, pctText, poBannerList, poStack, sum, supplierTax, wbRupee } from "./common.js";

/* The GST the sheet closes on. Each supplier's lines are taxed at its own
   rate (18 % unless Setup → Suppliers gives it one), and under the heads its
   state calls for: CGST + SGST at half the rate each for a factory in
   Maharashtra, IGST for one outside it. A sheet holding both kinds closes on
   all three lines, each over the goods it applies to. */
export function purchaseGst(ctx, rows) {
  const taxOf = (r) => supplierTax(ctx, r.supId);
  const heads = ["CGST", "SGST", "IGST"].map((name) => {
    const share = (r) => taxOf(r).heads.find((h) => h.name === name)?.rate;
    const mine = rows.filter((r) => share(r) != null);
    if (!mine.length) return null;
    const rates = [...new Set(mine.map(share))];
    return {
      name,
      rateOf: share,
      label: rates.length === 1 ? `${name} @ ${pctText(rates[0])}` : `${name} (supplier GST %)`,
      // One rate over every line on the sheet: the total at it, as their sheet has it.
      single: rates.length === 1 && mine.length === rows.length ? rates[0] : null,
      amount: Math.round(mine.reduce((n, r) => n + r.valTotal * share(r), 0)),
    };
  }).filter(Boolean);
  return { heads, amount: heads.reduce((n, h) => n + h.amount, 0) };
}

/* Doc 8 · Purchase (Supplier) — against 8-Purchase.xlsx. The packing sheet
   without the volumes and weights, and with what we pay the factory on the end:
   the price columns are headed with the date the rate was agreed, and the sheet
   closes on TOTAL → IGST @ 18% → INV VALUE, all three by formula. */
export function supplierPurchaseSheet(ctx, rows) {
  const S = {
    ...P7,
    money: { font: "ref", border: "box", valign: "center", fmt: RUPEE },
    totMoney: { font: "refb", border: "box", valign: "center", fmt: RUPEE },
    // Their two closing lines are set a point larger than the sheet.
    tailLabel: { font: "refb11", border: "box", valign: "center", fmt: RUPEE },
    tailBlank: { font: "ref", border: false, valign: "center" },
  };
  const H = (v) => ({ v, s: S.head });
  const groups = [...new Set(rows.map((r) => String(r.it.group || "").trim()).filter(Boolean))];
  const firstBand = groups.length ? groups[0] : "";

  const out = [
    [{ v: `PO NO. ${poBannerList(ctx)}`, s: S.banner }, ...Array(15).fill({ v: "", s: S.banner })],
    [{ v: "SR. NO.", s: S.headW }, { v: "PO NO.", s: S.headW },
      { v: "CODE ", s: S.headRT }, { v: "GD CODE", s: S.headV }, { v: "OSWIN CODE", s: S.headTL },
      H("SIZE "), H("LENGTH"), { v: "PACKING ", s: S.headL }, { v: "", s: S.headR },
      { v: "DESCRIPTION", s: S.headT }, { v: "BAR CODES", s: S.headT }, { v: "HSN CODE", s: S.headT },
      { v: "QUANTITY", s: S.headL }, { v: "", s: S.headR },
      { v: ddmm(ctx.inv.date), s: S.head }, { v: "", s: S.head }],
    [{ v: "", s: S.headW }, { v: "", s: S.headW },
      { v: firstBand, s: S.bandC }, { v: "", s: S.bandD }, { v: "", s: S.bandD },
      H("MM / IN"), H("MM"), H("UNIT"), H("BOX"),
      { v: "", s: S.headB }, { v: "", s: S.headB }, { v: "", s: S.headB },
      H("PCS"), H("BOX"), H("UNIT"), H("TOTAL")],
  ];
  const heights = [undefined, 12.75, undefined];

  let band = firstBand;
  let first = 0;
  let last = 0;
  const gst = purchaseGst(ctx, rows);
  const lineAt = [];                     // [sheet row, line] per goods line
  rows.forEach((r) => {
    const g = String(r.it.group || "").trim();
    if (g && g !== band) {
      band = g;
      out.push([{ v: "", s: S.sr }, { v: "", s: S.po },
        { v: g, s: S.bandC }, { v: "", s: S.bandD }, { v: "", s: S.bandD },
        ...[S.mid, S.mid, S.mid, S.mid, S.desc, S.bar, S.hsn, S.num, S.num, S.money, S.money]
          .map((s) => ({ v: "", s }))]);
      heights.push(15);
    }
    const line = out.length + 1;
    const it = r.it;
    const hsn = hsnValue(it);
    out.push([
      { v: r.range || "", s: S.sr },
      { v: poStack(r.pos), s: S.po },
      { v: it.code || "", s: S.codeC },
      { v: it.gd || "", s: S.code },
      { v: it.oswin || "", s: S.code },
      { v: it.size || "", s: S.mid },
      { v: it.length || "", s: S.mid },
      { v: it.packUnit || "", s: S.mid },
      { v: r.packing, t: "n", s: S.mid },
      { v: bcDescription(it), s: S.desc },
      { v: String(it.barcode || ""), t: "s", s: S.bar },
      hsn == null ? { v: String(it.hsn || ""), t: "s", s: S.mid } : { v: hsn, t: "n", s: S.hsn },
      { v: r.pieces, t: "n", s: S.num },
      { f: `$M${line}/$I${line}`, s: S.num },
      { v: r.valUnit, t: "n", s: S.money },
      { f: `O${line}*$M${line}`, s: S.money },
    ]);
    if (!first) first = line;
    last = line;
    lineAt.push([line, r]);
    heights.push(25.5);
  });

  const st = (col, style) => ({ f: first ? `SUBTOTAL(9,${col}${first}:${col}${last})` : "0", s: style });
  if (rows.length) {
    out.push([
      null, null, { v: "", s: S.endGd }, { v: "", s: S.end }, { v: "", s: S.end },
      { v: "", s: S.endL }, { v: "", s: S.endL }, { v: "", s: S.endL }, { v: "", s: S.endL },
      { v: "", s: S.endR }, { v: "TOTAL", s: S.tot }, { v: "", s: S.tot },
      st("M", S.totV), st("N", S.totV), { v: "", s: S.money }, st("P", S.totMoney),
    ]);
    const valueRow = out.length;
    const blanks = () => Array(14).fill(null).map(() => ({ v: "", s: S.tailBlank }));
    /* One rate over the whole sheet: the total at it. Otherwise each rate
       against the lines it applies to. */
    gst.heads.forEach((h) => {
      let fml;
      if (h.single != null) fml = `ROUND(P${valueRow}*${pctText(h.single)},0)`;
      else {
        const byRate = new Map();
        lineAt.forEach(([row, r]) => {
          const rate = h.rateOf(r);
          if (rate != null) byRate.set(rate, [...(byRate.get(rate) || []), `P${row}`]);
        });
        fml = `ROUND(${[...byRate].map(([rate, cells]) => `SUM(${cells.join(",")})*${pctText(rate)}`).join("+")},0)`;
      }
      out.push([...blanks(), { v: h.label, s: S.tailLabel }, { f: fml, s: S.totMoney }]);
      heights[out.length - 1] = 15;
    });
    out.push([...blanks(), { v: "INV VALUE", s: S.tailLabel },
      { f: `SUM(P${valueRow}:P${valueRow + gst.heads.length})`, s: S.totMoney }]);
    heights[out.length - 1] = 15;
  }

  return fitSheet({
    name: "Purchase",
    rows: out,
    heights,
    merges: ["A1:P1", "A2:A3", "B2:B3", "H2:I2", "J2:J3", "K2:K3", "L2:L3", "M2:N2", "O2:P2"],
    widths: [9.140625, 9.140625, 13.42578125, 12.5703125, 14.5703125, 7.7109375, 8.5703125, 6, 6.140625,
      25.140625, 14.28515625, 14.28515625, 9.140625, 9.140625, 11.140625, 13.42578125],
    defaultColWidth: 9.140625,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    page: {
      paper: 9, orientation: "landscape", scale: 40, fit: true, fitH: 0,
      margins: { left: 0.39370078740157499, right: 0.39370078740157499, top: 0.39370078740157499, bottom: 0.39370078740157499, header: 0, footer: 0 },
    },
  });
}

export const B_8 = (ctx) => {
  const rows = L(ctx);
  const groups = [...new Set(rows.map((r) => String(r.it.group || "").trim()).filter(Boolean))];
  let band = groups.length ? groups[0] : "";
  const value = sum(rows, "valTotal");
  const gst = purchaseGst(ctx, rows);
  const gstTotal = gst.amount;
  const body = rows.map((r) => {
    const it = r.it;
    const g = String(it.group || "").trim();
    const open = g && g !== band ? (band = g, `<tr class="band"><td></td><td></td>`
      + `<td class="gd" colspan="3">${esc(g)}</td>${"<td></td>".repeat(11)}</tr>`) : "";
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
      <td class="r" data-t="inr" data-v="${r.valUnit}">${wbRupee(r.valUnit)}</td>
      <td class="r" data-t="inr" data-f="{qty}*{valunit}">${wbRupee(r.valTotal)}</td>
    </tr>`;
  }).join("");

  const html = `<div class="title">8 · PURCHASE (Supplier)</div>
    <table class="wb">
      <tr class="sec po rule"><td colspan="16">PO NO. ${esc(poBannerList(ctx))}</td></tr>
      <tr><th rowspan="2">SR. NO.</th><th rowspan="2">PO NO.</th><th>CODE</th><th>GD CODE</th><th>OSWIN CODE</th>
        <th>SIZE</th><th>LENGTH</th><th colspan="2">PACKING</th>
        <th rowspan="2">DESCRIPTION</th><th rowspan="2">BAR CODES</th><th rowspan="2">HSN CODE</th>
        <th colspan="2">QUANTITY</th><th colspan="2">${esc(ddmm(ctx.inv.date))}</th></tr>
      <tr class="hd2"><th class="gd" colspan="3">${esc(groups[0] || "")}</th>
        <th>MM / IN</th><th>MM</th><th>UNIT</th><th data-k="packbox">BOX</th>
        <th data-k="qty">PCS</th><th data-k="box">BOX</th>
        <th data-k="valunit">UNIT</th><th data-k="valtot">TOTAL</th></tr>
      ${body}
      <tr class="tot"><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td>
        <td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td><td class="o"></td>
        <td>TOTAL</td><td></td>
        <td class="r" data-t="int" data-sum="qty">${sum(rows, "pieces")}</td>
        <td class="r" data-t="int" data-sum="box">${sum(rows, "boxes")}</td>
        <td></td>
        <td class="r" data-t="inr" data-sum="valtot">${wbRupee(value)}</td></tr>
      ${gst.heads.map((h) => `<tr class="tot"><td class="nb" colspan="14"></td><td>${esc(h.label)}</td>
        <td class="r" data-t="inr" data-v="${h.amount}">${wbRupee(h.amount)}</td></tr>`).join("")}
      <tr class="tot"><td class="nb" colspan="14"></td><td>INV VALUE</td>
        <td class="r" data-t="inr" data-v="${value + gstTotal}">${wbRupee(value + gstTotal)}</td></tr>
    </table>`;
  return { name: "Purchase_8", html, sheet: supplierPurchaseSheet(ctx, rows) };
};
