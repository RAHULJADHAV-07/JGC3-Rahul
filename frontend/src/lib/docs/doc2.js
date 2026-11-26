import { RANGES, WB, attr, bcDescription, esc, fitSheet, orderAgg, poHeaderList, sum, supFor, upDiv } from "./common.js";

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
const isGrn = (r) => (r.block?.range ? /-GRN$/i.test(r.block.range) : RANGES[1].is(r));
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
  const sec = (name, tab, lines, opts) => (lines.length ? [{ name, tab, rows: lines, lines: laidOut(ctx, lines, opts) }] : []);
  if (ctx.supplierId) {
    const pp = rows.filter((r) => !isGrn(r)), grn = rows.filter(isGrn);
    if (pp.length && grn.length) {
      return [...sec("PP Fittings", "PP Fittings", pp), ...sec("Nylon Fittings", "Nylon Fittings", grn)];
    }
    return sec("", "Barcode", rows, { gaps: true });
  }
  const oswin = rows.filter(isOswin), rest = rows.filter((r) => !isOswin(r));
  const parts = [
    ...sec("Oswin", "Oswin", oswin, { gaps: true }),
    ...sec("PP Fittings", "PP Fittings", rest.filter((r) => !isGrn(r)), { bands: true }),
    ...sec("Nylon Fittings", "Nylon Fittings", rest.filter(isGrn), { bands: true }),
  ];
  return parts.length ? parts : sec("", "Barcode", rows);
}

export function barcodeSheet(ctx, section) {
  const { lines, rows } = section;
  const banner = `PO NO : ${poHeaderList(ctx)}${section.name ? ` · ${section.name.toUpperCase()}` : ""}`;
  const out = [
    [{ v: banner, s: WB.poL }, { v: "", s: WB.poM }, { v: "", s: WB.poM },
      { v: "", s: WB.poM }, { v: "", s: WB.poM }, { v: "", s: WB.poR }],
    ["GD CODE ", "DESCRIPTION", "Bar Codes", "Lables", "TYPE", "SHEETS"].map((h) => ({ v: h, s: WB.head })),
    ["", "", "", "", "UPS", "REQD"].map((h) => ({ v: h, s: WB.head })),
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
    name: section.tab || "Barcode",
    rows: out,
    heights,
    merges,
    widths: [11.28515625, 32.7109375, 14.140625, 7, 7, 8.28515625],
    defaultColWidth: 9.140625,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
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
  const sheetFml = attr(upDiv("{stk}", "{typeup}"));
  const body = lines.map((r) => {
    if (r.band != null) return `<tr class="sec po"><td colspan="6">${esc(r.band)}</td></tr>`;
    if (r.gap) return '<tr class="gap"><td colspan="6" style="border:none!important;height:12px"></td></tr>';
    return `<tr>
      <td class="gd">${esc(r.it.gd)}</td>
      <td class="desc">${esc(bcDescription(r.it)).replace(/\n/g, "<br>")}</td>
      <td class="code">${esc(r.it.barcode)}</td>
      <td class="c" data-t="int" data-v="${r.stickers}">${r.stickers}</td>
      <td class="c" data-t="int" data-v="${r.typeUp}">${r.typeUp}</td>
      <td class="r" data-t="int" data-f="${sheetFml}">${r.sheets}</td>
    </tr>`;
  }).join("");

  return `<div class="title">BARCODE${section.name ? ` · ${esc(section.name.toUpperCase())}` : ""}</div>
    <table class="wb fit">
      <colgroup><col style="width:14%"><col style="width:40.7%"><col style="width:17.6%">
        <col style="width:8.7%"><col style="width:8.7%"><col style="width:10.3%"></colgroup>
      <thead>
      <tr class="sec po"><td colspan="6">PO NO : ${esc(poHeaderList(ctx))}</td></tr>
      <tr><th>GD CODE</th><th>DESCRIPTION</th><th>Bar Codes</th>
        <th data-k="stk">Lables</th><th data-k="typeup">TYPE</th><th data-k="sheets">SHEETS</th></tr>
      <tr class="hd2"><th></th><th></th><th></th><th></th><th>UPS</th><th>REQD</th></tr>
      </thead><tbody>
      ${body}
      <tr class="tot"><td class="o"></td><td class="o"></td><td>TOTAL</td>
        <td class="c" data-t="int" data-sum="stk">${sum(rows, "stickers")}</td>
        <td></td>
        <td class="r" data-t="int" data-sum="sheets">${sum(rows, "sheets")}</td></tr>
      </tbody>
    </table>`;
}

export const B_2 = (ctx) => {
  const sections = barcodeSections(ctx);
  const html = sections.map((s) => barcodeHtml(ctx, s)).join('<div class="pgbrk"></div>');
  const sheets = sections.map((s) => barcodeSheet(ctx, s));
  return sections.length > 1
    ? { name: "Barcode", html, sheets, page: "portrait" }
    : { name: "Barcode", html, sheet: sheets[0], page: "portrait" };
};
