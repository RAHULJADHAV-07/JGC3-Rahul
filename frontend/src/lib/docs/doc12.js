import { BV, CONTAINER_CBM, L, commonOf, ddmm, esc, exRate, fitSheet, hsnText, hsnValue, inr, supplierGst, usd, wbFixed } from "./common.js";

/* GST on a factory's line: its own rate when Setup → Suppliers gives it one,
   otherwise the sheet's 18 %. */
const gstOf = (ctx, supId) => supplierGst(ctx, supId) ?? 0.18;
const pctOf = (x) => `${Number((x * 100).toFixed(2))}%`;

/* A block per factory, a line per range inside it — OSWIN on its own, VP as
   VP-PP and VP-GRN, which is how their column A reads. */
export function boxVolBlocks(ctx) {
  const bySup = new Map();
  L(ctx).forEach((x) => {
    if (!bySup.has(x.supId)) bySup.set(x.supId, { code: x.sup.code || x.supId, gst: gstOf(ctx, x.supId), ranges: new Map() });
    const b = bySup.get(x.supId);
    const key = (x.it.stickerRule || "pp") === "grn" ? "GRN" : "PP";
    if (!b.ranges.has(key)) b.ranges.set(key, { key, hsn: [], box: 0, vol: 0, qty: 0, net: 0, gross: 0, pur: 0, usd: 0, inr: 0 });
    const g = b.ranges.get(key);
    g.hsn.push(x.it.hsn);
    g.box += x.boxes; g.vol += x.volTotal; g.qty += x.pieces;
    g.net += x.netTotal; g.gross += x.grossTotal;
    g.pur += x.valTotal; g.usd += x.fobTotal; g.inr += x.rbiTotal;
  });
  return [...bySup.values()].map((b) => ({
    code: b.code,
    rows: [...b.ranges.values()]
      .sort((p, q) => (p.key === q.key ? 0 : p.key === "PP" ? -1 : 1))
      .map((g) => {
        // One line stands for a whole range, so it takes the range's own HSN.
        const raw = commonOf(g.hsn, (h) => h);
        return {
          ...g,
          gst: b.gst,
          label: b.ranges.size > 1 ? `${b.code}-${g.key}` : b.code,
          hsn: hsnValue({ hsn: raw }),
          hsnText: raw,
        };
      }),
  }));
}

export function boxesVolumeSheet(ctx, blocks, ex) {
  const H = (v) => ({ v, s: BV.hdC });
  /* The rate sits in the heading and every line reads it, as their sheet has
     it — unless the factories on the sheet are taxed at different rates, when
     each line carries its own. */
  const rates = [...new Set(blocks.flatMap((b) => b.rows.map((g) => g.gst)))];
  const one = rates.length <= 1 ? (rates[0] ?? 0.18) : null;
  const rateHead = one != null ? { v: one, t: "n", s: BV.hdPct } : H("GST");
  const out = [[
    { v: "", s: BV.hd }, { v: "HSN", s: BV.hd }, H("BOX"), H("VOLUME"), H("QUANTITY"), H("NET WT"), H("GROSS WT"),
    H("Taxable Purchase"), rateHead, H("Total Pur value"),
    H("Taxable Sales (USD)"), H("Taxable Sales (INR)"), { ...rateHead }, H("Total Sale value"),
    { v: ex, t: "n", s: BV.hdRate }, H("DIFF"),
  ]];
  const heights = [30];

  const blank = () => Array(16).fill(null).map(() => ({ v: "", s: BV.band }));
  const totals = [];                       // the row each block totals on
  blocks.forEach((b) => {
    const first = out.length + 1;
    b.rows.forEach((g) => {
      const r = out.length + 1;
      out.push([
        { v: g.label, s: BV.lbl },
        g.hsn == null ? { v: g.hsnText, s: { ...BV.hsn, fmt: undefined } } : { v: g.hsn, t: "n", s: BV.hsn },
        { v: g.box, t: "n", s: BV.int },
        { v: g.vol, t: "n", s: BV.vol },
        { v: g.qty, t: "n", s: BV.int },
        { v: g.net, t: "n", s: BV.wt },
        { v: g.gross, t: "n", s: BV.wt },
        { v: g.pur, t: "n", s: BV.acc },
        { f: one != null ? `H${r}*$I$1` : `H${r}*${pctOf(g.gst)}`, s: BV.acc },
        { f: `H${r}+I${r}`, s: BV.acc },
        { v: g.usd, t: "n", s: BV.acc },
        { v: g.inr, t: "n", s: BV.acc },
        { f: one != null ? `L${r}*$M$1` : `L${r}*${pctOf(g.gst)}`, s: BV.acc },
        { f: `L${r}+M${r}`, s: BV.acc },
        { f: `K${r}*$O$1`, s: BV.acc },
        { f: `L${r}-O${r}`, s: BV.acc },
      ]);
    });
    const last = out.length;
    const sumOf = (col, style) => ({ f: `SUM(${col}${first}:${col}${last})`, s: style });
    out.push([
      { v: "TOTAL", s: BV.lbl }, { v: "", s: BV.lbl },
      sumOf("C", BV.tInt), sumOf("D", BV.tVol), sumOf("E", BV.tInt), sumOf("F", BV.tWt), sumOf("G", BV.tWt),
      ..."HIJKLMNOP".split("").map((c) => sumOf(c, BV.tAcc)),
    ]);
    totals.push(out.length);
    out.push(blank());
  });

  const add = (col, style) => (totals.length
    ? { f: totals.map((r) => `${col}${r}`).join("+"), s: style }
    : { v: "", s: style });
  out.push([
    { v: "TOTAL", s: BV.lbl }, { v: "", s: BV.lbl },
    add("C", BV.tInt), add("D", BV.tVol), add("E", BV.tInt), add("F", BV.tWt), add("G", BV.tWt),
    ..."HIJKLMNOP".split("").map((c) => add(c, BV.tAcc)),
  ]);
  const grand = out.length;

  const foot = (label, cell) => {
    const row = Array(16).fill(null).map(() => ({ v: "", s: BV.band }));
    row[0] = { v: label, s: BV.lbl };
    row[3] = cell;
    out.push(row);
    return out.length;
  };
  const cap = foot("CAPACITY", { v: CONTAINER_CBM, t: "n", s: BV.tVol });
  foot("BALANCE", { f: `D${cap}-D${grand}`, s: BV.tVol });

  /* Their widths are the design and the headings are wrapped to fit them, so
     the sheet is not re-measured. Only the label column is: their factories
     are OSWIN and KP, ours can be VPPlastics-GRN. */
  const label = out.reduce((m, r) => Math.max(m, String(r[0]?.v ?? "").length), 8);
  return fitSheet({
    name: "Boxes & volume",
    rows: out,
    heights,
    widths: [Math.max(9.85546875, label + 1.5), 10.42578125, 9.140625, 9.140625, 9.140625, 9.140625, 9.140625,
      16, 13.28515625, 13.85546875, 12.85546875, 12.5703125, 12.28515625, 12.5703125, 12.85546875, 13.5703125],
    defaultColWidth: 9.140625,
    defaultRowHeight: 15,
    colStyle: { font: "cal", border: false },
    freeze: 1,
    /* Their copy was never set up to print — A4 portrait, default margins —
       and sixteen columns do not go on portrait paper. It is turned and fitted
       to one page across, which is how the PDF of it prints too. */
    page: {
      paper: 9, orientation: "landscape", fit: true, fitH: 0,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  }, { widen: false });
}

export const B_12 = (ctx) => {
  const ex = exRate(ctx);
  const blocks = boxVolBlocks(ctx);
  const acc = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cell = (v, t, val) => `<td class="r" data-t="${t}" data-v="${val}">${v}</td>`;
  const money = (n) => cell(acc(n), "num", n);

  const lineRow = (g) => `<tr>
      <td class="g b">${esc(g.label)}</td>
      <td class="g b r">${esc(g.hsn == null ? g.hsnText : g.hsn.toFixed(4))}</td>
      ${cell(g.box, "int", g.box)}
      ${cell(wbFixed(g.vol, 2), "num", g.vol)}
      ${cell(g.qty, "int", g.qty)}
      ${cell(wbFixed(g.net, 3), "num3", g.net)}
      ${cell(wbFixed(g.gross, 3), "num3", g.gross)}
      ${money(g.pur)}${money(g.pur * g.gst)}${money(g.pur * (1 + g.gst))}
      ${money(g.usd)}${money(g.inr)}${money(g.inr * g.gst)}${money(g.inr * (1 + g.gst))}
      ${money(g.usd * ex)}${money(g.inr - g.usd * ex)}
    </tr>`;

  const totalRow = (label, rows) => {
    const t = (k) => rows.reduce((s, g) => s + (Number(g[k]) || 0), 0);
    const g = { box: t("box"), vol: t("vol"), qty: t("qty"), net: t("net"), gross: t("gross"), pur: t("pur"), usd: t("usd"), inr: t("inr") };
    const purGst = rows.reduce((s, x) => s + x.pur * x.gst, 0);
    const saleGst = rows.reduce((s, x) => s + x.inr * x.gst, 0);
    return `<tr class="g b">
      <td class="g b">${label}</td><td class="g"></td>
      <td class="r g">${g.box}</td><td class="r g">${wbFixed(g.vol, 2)}</td><td class="r g">${g.qty}</td>
      <td class="r g">${wbFixed(g.net, 3)}</td><td class="r g">${wbFixed(g.gross, 3)}</td>
      <td class="r g">${acc(g.pur)}</td><td class="r g">${acc(purGst)}</td><td class="r g">${acc(g.pur + purGst)}</td>
      <td class="r g">${acc(g.usd)}</td><td class="r g">${acc(g.inr)}</td><td class="r g">${acc(saleGst)}</td>
      <td class="r g">${acc(g.inr + saleGst)}</td><td class="r g">${acc(g.usd * ex)}</td>
      <td class="r g">${acc(g.inr - g.usd * ex)}</td></tr>`;
  };

  const all = blocks.flatMap((b) => b.rows);
  const spacer = `<tr class="g">${Array(16).fill('<td class="g"></td>').join("")}</tr>`;
  const volume = all.reduce((s, g) => s + g.vol, 0);
  const footRow = (label, value) => `<tr><td class="g b">${label}</td><td class="g"></td><td class="g"></td>
      <td class="r g b">${wbFixed(value, 2)}</td>${Array(12).fill('<td class="g"></td>').join("")}</tr>`;

  const rates = [...new Set(all.map((g) => g.gst))];
  const one = rates.length <= 1 ? (rates[0] ?? 0.18) : null;
  const rateTh = one != null ? pctOf(one) : "GST";
  const html = `<div class="title">12 · SHIPMENT BOXES &amp; VOLUME</div>
    <div class="sub">Invoice ${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)} · GST ${one != null ? pctOf(one) : "as per supplier"} · Rate @ Rs. ${ex}/$</div>
    <table class="wb">
      <tr>
        <th class="g"></th><th class="g">HSN</th><th class="g">BOX</th><th class="g">VOLUME</th><th class="g">QUANTITY</th>
        <th class="g">NET WT</th><th class="g">GROSS WT</th><th class="g">Taxable Purchase</th><th class="g">${rateTh}</th>
        <th class="g">Total Pur value</th><th class="g">Taxable Sales (USD)</th><th class="g">Taxable Sales (INR)</th>
        <th class="g">${rateTh}</th><th class="g">Total Sale value</th><th class="g">${ex}</th><th class="g">DIFF</th>
      </tr>
      ${blocks.map((b) => b.rows.map(lineRow).join("") + totalRow("TOTAL", b.rows) + spacer).join("")}
      ${totalRow("TOTAL", all)}
      ${footRow("CAPACITY", CONTAINER_CBM)}
      ${footRow("BALANCE", CONTAINER_CBM - volume)}
    </table>`;
  return { name: "Shipment_Boxes_Volume_12", html, sheet: boxesVolumeSheet(ctx, blocks, ex) };
};
