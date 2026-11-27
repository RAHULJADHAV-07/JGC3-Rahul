import { grnSheet, isGrnRow, WB, attr, bcDescription, esc, fitSheet, orderAgg, poHeaderList, sum, supFor } from "./common.js";

/* 2 · Barcode, split into the sheets the client works from.

   One supplier's copy:
     · a supplier who makes both PP and nylon (GRN) fittings — Hansa, VP —
       gets a sheet for each: PP Fittings, then Nylon Fittings;
     · a supplier with one range (Oswin, Kiran) keeps the one sheet.
   All suppliers together:
     1 · Oswin — every Oswin line, a blank row between the rest and the PMF lines;
     2 · PP Fittings — everyone else's PP lines, supplier by supplier;
     3 · Nylon Fittings — the GRN lines, supplier by supplier.

   Which range a line is in comes off its block (Setup → Item groups): "Oswin",
   "Kiran", "Hansa-PP", "Hansa-GRN", "VP-PP", "VP-GRN". A line without one
   falls back to its sticker rule, as the supplier PO's annexures do. */
const isGrn = isGrnRow;
const isOswin = (r) => String(r.block?.range || "").toLowerCase() === "oswin";
const supName = (ctx, r) => {
  const s = supFor(ctx, r.it.supplierId);
  return s.code || s.name || "";
};

/* A sheet's lines with the breaks it prints: a supplier's name over each
   supplier's run (`bands`), or a blank row where a block of the range opens
   (`gaps`, Oswin's PMF). */
function laidOut(ctx, rows, { bands = false, gaps = false } = {}) {
  const out = [];
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    if (bands && (!prev || prev.it.supplierId !== r.it.supplierId)) out.push({ band: supName(ctx, r) });
    else if (gaps && prev && prev.block?.key !== r.block?.key) out.push({ gap: true });
    out.push(r);
  });
  return out;
}

export function barcodeSections(ctx) {
  const rows = orderAgg(ctx);
  const sec = (name, tab, lines, opts, grn = false) => (lines.length ? [{ name, tab, grn, rows: lines, lines: laidOut(ctx, lines, opts) }] : []);
  /* One supplier's goods — chosen, or the only supplier on the order — come
     out as their book has them: BarcodePP, then BarcodeGRN. */
  if (ctx.supplierId || new Set(rows.map((r) => r.it.supplierId)).size <= 1) {
    const pp = rows.filter((r) => !isGrn(r)), grn = rows.filter(isGrn);
    return [...sec(grn.length ? "PP Fittings" : "", "BarcodePP", pp, { gaps: true }),
      ...sec(pp.length ? "Nylon Fittings" : "", "BarcodeGRN", grn, {}, true)];
  }
  const oswin = rows.filter(isOswin), rest = rows.filter((r) => !isOswin(r));
  const parts = [
    ...sec("Oswin", "Oswin", oswin, { gaps: true }),
    ...sec("PP Fittings", "PP Fittings", rest.filter((r) => !isGrn(r)), { bands: true }),
    ...sec("Nylon Fittings", "Nylon Fittings", rest.filter(isGrn), { bands: true }, true),
  ];
  return parts.length ? parts : sec("", "Barcode", rows);
}

export function barcodeSheet(ctx, section) {
  const { lines, rows } = section;
  const banner = `PO NO : ${poHeaderList(ctx)}`;
  const out = [
    [{ v: banner, s: WB.poL }, { v: "", s: WB.poM }, { v: "", s: WB.poM },
      { v: "", s: WB.poM }, { v: "", s: WB.poM }, { v: "", s: WB.poR }],
    ["GD CODE ", "DESCRIPTION", "Bar Codes", "TYPE", "SHEETS", "LABELS"].map((h) => ({ v: h, s: WB.head })),
    ["", "", "", "UPS", "REQD", ""].map((h) => ({ v: h, s: WB.head })),
  ];
  const heights = [undefined, 19.5, 19.5];
  const merges = ["A1:F1"];

  const first = out.length + 1;
  lines.forEach((r) => {
    const line = out.length + 1;
    if (r.band != null) {
      // The supplier's name across the row, over its run of lines.
      out.push([{ v: r.band, s: WB.poBox }, ...Array(5).fill({ v: "", s: WB.poBox })]);
      merges.push(`A${line}:F${line}`);
      heights.push(19.5);
      return;
    }
    if (r.gap) {
      out.push([{ v: "", s: { border: false } }]);
      heights.push(12.75);
      return;
    }
    out.push([
      { v: r.it.gd || "", s: WB.gd },
      { v: bcDescription(r.it), s: WB.desc },
      { v: String(r.it.barcode || ""), t: "s", s: WB.code },
      { v: r.typeUp, t: "n", s: WB.numC },
      { v: r.sheets, t: "n", s: WB.num },
      { f: `D${line}*E${line}`, s: WB.num },
    ]);
    heights.push(25.5);
  });
  const last = out.length;

  /* The labels printed are whole sheets' worth — TYPE UPS × SHEETS REQD —
     not the raw count the boxes need (V-7.10.0). The sheets are totalled with
     a plain SUM and the labels with SUBTOTAL, so a filtered sheet re-totals. */
  out.push(rows.length ? [
    { v: "", s: WB.endGd }, { v: "", s: WB.endDesc }, { v: "TOTAL", s: WB.tot },
    { v: "", s: WB.tot }, { f: `SUM(E${first}:E${last})`, s: WB.tot },
    { f: `SUBTOTAL(9,F${first}:F${last})`, s: WB.tot },
  ] : []);

  return fitSheet({
    name: section.tab || "Barcode",
    rows: out,
    heights,
    merges,
    widths: [11.28515625, 32.7109375, 14.140625, 7, 8.28515625, 9],
    defaultColWidth: 9.140625,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    baseFont: "normArial",
    tabColor: "FF00B0F0",
    // The heading rows repeat at the top of every printed page.
    repeatRows: [1, 3],
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
   HTML converts to a worksheet correctly if it is ever asked to. Each sheet
   of the split is a table of its own, on a page of its own. */
function barcodeHtml(ctx, section) {
  const { lines, rows } = section;
  const labelFml = attr("{typeup}*{sheets}");
  const body = lines.map((r) => {
    if (r.band != null) return `<tr class="sec po"><td colspan="6">${esc(r.band)}</td></tr>`;
    if (r.gap) return '<tr class="gap"><td colspan="6" style="border:none!important;height:12px"></td></tr>';
    return `<tr>
      <td class="gd">${esc(r.it.gd)}</td>
      <td class="desc">${esc(bcDescription(r.it)).replace(/\n/g, "<br>")}</td>
      <td class="code">${esc(r.it.barcode)}</td>
      <td class="c" data-t="int" data-v="${r.typeUp}">${r.typeUp}</td>
      <td class="r" data-t="int" data-v="${r.sheets}">${r.sheets}</td>
      <td class="r" data-t="int" data-f="${labelFml}">${r.typeUp * r.sheets}</td>
    </tr>`;
  }).join("");

  return `<div class="title">BARCODE${section.name ? ` · ${esc(section.name.toUpperCase())}` : ""}</div>
    <table class="wb fit">
      <colgroup><col style="width:14%"><col style="width:40.7%"><col style="width:17.6%">
        <col style="width:8.7%"><col style="width:9.3%"><col style="width:9.7%"></colgroup>
      <thead>
      <tr class="sec po"><td colspan="6">PO NO : ${esc(poHeaderList(ctx))}</td></tr>
      <tr><th>GD CODE</th><th>DESCRIPTION</th><th>Bar Codes</th>
        <th data-k="typeup">TYPE</th><th data-k="sheets">SHEETS</th><th data-k="labels">LABELS</th></tr>
      <tr class="hd2"><th></th><th></th><th></th><th>UPS</th><th>REQD</th><th></th></tr>
      </thead><tbody>
      ${body}
      <tr class="tot"><td class="o"></td><td class="o"></td><td>TOTAL</td>
        <td></td>
        <td class="r" data-t="int" data-sum="sheets">${sum(rows, "sheets")}</td>
        <td class="r" data-t="int" data-sum="labels">${rows.reduce((n, r) => n + r.typeUp * r.sheets, 0)}</td></tr>
      </tbody>
    </table>`;
}

export const B_2 = (ctx) => {
  const sections = barcodeSections(ctx);
  const html = sections.map((s) => barcodeHtml(ctx, s)).join('<div class="pgbrk"></div>');
  /* The nylon tab of 2-Barcode.xlsx: the same columns, typed plainer and set
     landscape. */
  const sheets = sections.map((s) => (s.grn
    ? grnSheet(barcodeSheet(ctx, s), { name: s.tab, tabColor: "FF0070C0",
      widths: [11.28515625, 32.7109375, 14.140625, 9.140625, 9.140625, 9.140625] })
    : barcodeSheet(ctx, s)));
  return sections.length > 1
    ? { name: "Barcode", html, sheets, page: "portrait" }
    : { name: "Barcode", html, sheet: sheets[0], page: "portrait" };
};
