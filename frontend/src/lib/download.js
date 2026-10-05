/* Browser downloads.

   Every report and every export document offers the same two formats:

     Excel — a real .xlsx (lib/xlsx.js) with the arithmetic still live, so
             changing a quantity in the sheet re-totals the row.
     PDF   — the same layout, rendered through the browser's own print
             engine, which is what turns it into a PDF the client can send on.

   `downloadCSV` stays for the plain machine-readable dump. */
import { buildXLSX } from "./xlsx.js";
import { buildDOCX } from "./docx.js";
import { gridToSheet, gridToHtml, htmlToSheet } from "./sheet.js";

function saveBlob(blob, filename) {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch (e) {
    alert("Download blocked by the browser — the table on screen holds the same data.");
    return false;
  }
}

export function downloadCSV(filename, headers, rows) {
  const esc = (c) => `"${String(c ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
  saveBlob(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), filename);
}

const xlsxName = (name) => (/\.xlsx$/i.test(name) ? name : `${name.replace(/\.(xls|csv)$/i, "")}.xlsx`);

/** Save a workbook — `sheets` is what lib/sheet.js produces. */
export function downloadWorkbook(filename, sheets) {
  const list = Array.isArray(sheets) ? sheets : [sheets];
  if (!list.length) return;
  saveBlob(buildXLSX({ sheets: list }), xlsxName(filename));
}

const docxName = (name) => (/\.docx$/i.test(name) ? name : `${name.replace(/\.(doc|docx)$/i, "")}.docx`);

/** Save a document that is a Word document rather than a workbook — the
 *  annexure to the bill of lading (24) is typed, not tabulated, and the client
 *  sends it on as it stands. */
export function downloadDocsWord(filename, docx) {
  if (!docx) return false;
  return saveBlob(buildDOCX(docx), docxName(filename));
}

/** Save one of the app's own tables as Excel, formulas included. */
export function downloadGridExcel(filename, sheetName, columns, rows, opts) {
  downloadWorkbook(filename, [gridToSheet(sheetName, columns, rows, opts)]);
}

/** Save one or more export documents (HTML) as Excel, formulas included.
 *
 *  A document that reproduces one of the client's own workbooks carries its
 *  worksheet ready-built (`d.sheet`) — that layout is the client's, down to the
 *  column widths, so it is written as it stands rather than derived from the
 *  HTML. Its tab still takes the name the caller gave the document, so a
 *  whole-stage workbook stays numbered the way the others are. */
/* Renaming a document's tabs moves the ground under its own formulas: the
   packing list's second page reads its first by name, so a page prefixed into
   "20 Page1" leaves the reference behind pointing at nothing. Every reference a
   document makes to its own tabs is rewritten with them — quoted, because the
   prefixed name carries a space. Only whole names followed by "!" are matched,
   so a sheet called Page never rewrites one called Page1. */
function renameSheets(sheets, prefix) {
  const named = sheets.map((s) => [String(s.name), `${prefix} ${s.name}`]);
  const ref = (name) => (/^[A-Za-z0-9_]+$/.test(name) ? `${name}!` : `'${name.replace(/'/g, "''")}'!`);
  const fix = (f) => named.reduce((out, [from, to]) => out.split(`${from}!`).join(ref(to)), String(f));
  return sheets.map((s, i) => ({
    ...s,
    name: named[i][1],
    rows: (s.rows || []).map((row) => (row || [])
      .map((c) => (c && typeof c === "object" && c.f ? { ...c, f: fix(c.f) } : c))),
  }));
}

export function downloadDocsExcel(filename, docs) {
  const list = (Array.isArray(docs) ? docs : [docs]).filter((d) => d && (d.html || d.sheet || d.sheets?.length));
  if (!list.length) return;
  const many = list.length > 1;
  downloadWorkbook(filename, list.flatMap((d, i) => {
    const name = d.name || `Sheet${i + 1}`;
    // A document may be a whole workbook of its own — the supplier purchase
    // order is a letter plus an annexure per range, the packing list two pages
    // and its item-wise details. Taken on its own it keeps the tab names its
    // source file uses; gathered with others, each tab is prefixed so one
    // supplier's annexure can't be mistaken for another's.
    if (d.sheets?.length) return many ? renameSheets(d.sheets, name) : d.sheets;
    return [d.sheet ? { ...d.sheet, name } : htmlToSheet(d.html, name)];
  }));
}

/** Print one of the app's own tables, for the client to save as PDF. */
export function downloadGridPDF(title, columns, rows, opts) {
  downloadPDF(title, [{ html: gridToHtml(columns, rows, { title, ...opts }) }]);
}

/* ---- PDF ------------------------------------------------------------------
   Rendered by the browser: the document goes into an off-screen frame with
   print styling and `print()` is called on it, so the client picks "Save as
   PDF" (or a printer) from the dialog they already know. No PDF library ships
   with the app, and nothing leaves the machine.                            */
/* Most of the library is wide enough to want landscape; a document that copies
   a client workbook prints the way that workbook is set up (2 · Barcode is
   portrait, as its sheet is), so the page rule is chosen per print job.

   The margin is zero on purpose. The browser prints its own header and footer
   — the date, the page's title, the localhost URL, "1/1" — into the margin
   box of the paper, and nothing in CSS switches that off; leave no margin and
   there is nowhere for it to go. The inset every document needs comes back as
   padding on the document itself, below. */
const pageRule = (orientation) => `@page { size: A4 ${orientation === "portrait" ? "portrait" : "landscape"}; margin: 0; }`;

const PRINT_CSS = `
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #243b53; margin: 0; padding: 0; }
  /* The page's own margin, now that @page has none. A document that runs past
     one page keeps its side inset and starts the next page nearer the top. */
  .jg-doc { padding: 10mm; }
  table { border-collapse: collapse; margin-bottom: 6px; width: 100%; page-break-inside: auto; }
  tr { page-break-inside: avoid; page-break-after: auto; }
  thead { display: table-header-group; }
  td, th { border: 1px solid #aebccb; padding: 3px 6px; vertical-align: top; font-size: 8.5pt; word-break: break-word; }
  th { background: #0b2c4d !important; color: #fff !important; font-weight: 700; text-align: center; }
  .title { font-size: 15pt; font-weight: 800; color: #0b2c4d; display: block; margin-bottom: 3px; }
  .sub { font-size: 8.5pt; color: #516170; display: block; margin-bottom: 6px; }
  .lg { font-size: 12pt; font-weight: 800; color: #0b2c4d; }
  .r { text-align: right; } .c { text-align: center; } .b { font-weight: 700; }
  .sec { background: #e6edf4 !important; font-weight: 700; color: #0b2c4d; }
  .tot { background: #fbe6c2 !important; font-weight: 800; color: #0b2c4d; }
  .k { background: #f2f5f8 !important; font-weight: 700; white-space: nowrap; color: #0b2c4d; }
  .plain td { border: none; padding: 1px 6px; }
  p { font-size: 9pt; line-height: 1.5; margin: 5px 0; }
  .jg-doc + .jg-doc { page-break-before: always; }

  /* 2 · Barcode and 3 · Packing print as the client's own workbooks print —
     Arial on a black hairline grid, green codes, bold barcodes — so the paper,
     the preview and the .xlsx are the same sheet. */
  table.wb { font-family: Arial, Helvetica, sans-serif; color: #000; }
  /* Codes and figures are single tokens — never let the printer split one
     across two lines to save a column. Everything else wraps, so a wide sheet
     grows its rows instead of running off the edge of the paper. */
  table.wb td, table.wb th { border: 1px solid #000 !important; padding: 3px 4px; font-size: 8.5pt; vertical-align: middle; word-break: normal; white-space: normal; }
  table.wb .gd, table.wb .gdc, table.wb .bh, table.wb .code,
  table.wb td.c, table.wb td.r { white-space: nowrap; }
  table.wb td.po { white-space: normal; text-align: center; max-width: 150px; }
  table.wb th { background: #fff !important; color: #000 !important; font-weight: 700; text-align: center; }
  table.wb tr.po td { background: #fff !important; color: #000 !important; font-weight: 700; text-align: left; }
  table.wb tr.po.rule td { border-left: none !important; border-right: none !important; border-top: none !important; }
  table.wb tr.po td.red, table.wb th.red { color: #ff0000 !important; }
  table.wb th.r { text-align: right; }
  table.wb .nb { border: none !important; }
  /* 12 · Boxes & volume bands its headings, labels and totals in the 25% grey
     its workbook uses, rather than leaving them white like the older sheets. */
  table.wb td.g, table.wb th.g { background: #bfbfbf !important; color: #000 !important; }
  table.wb tr.g td { background: #bfbfbf !important; color: #000 !important; }
  table.wb tr.tot td { background: #fff !important; color: #000 !important; font-weight: 700; }
  table.wb tr.tot td.o { border-left: none !important; border-right: none !important; }
  table.wb .gd { color: #339966 !important; font-weight: 700; }
  table.wb .gdc { color: #339966 !important; font-weight: 700; text-align: center; }
  table.wb .bh { font-weight: 700; text-align: center; }
  table.wb .code { font-weight: 700; text-align: center; }
  /* 17 · Proforma — the buyer's purchase order form.

     Their paper is set much tighter than the rest of the library: a 7pt body
     on a 9pt line, their name at 14pt over it and the contact strip at 6.5pt.
     The sizes are measured off their own printed form, so the copy fills the
     page the way theirs does rather than running on to a second sheet. */
  table.bpo { table-layout: fixed; width: 100%; }
  table.bpo td, table.bpo th { font-size: 7pt; padding: 0 4px; line-height: 1.3; }
  table.bpo .big { font-size: 14pt; font-weight: 700; color: #000; }
  table.bpo .tag { font-size: 10pt; }
  table.bpo .ttl { font-size: 8pt; }
  table.bpo .val { font-size: 8.5pt; }
  table.bpo .foot { font-size: 6.5pt; }
  /* The freight terms and the line the order is signed for stand side by side.
     Both are set to the top of the run — the rest of the sheet centres in its
     row — so the name sits level with the top of the freight box and the space
     under it comes out clear, to be stamped and signed once it is printed. */
  table.bpo tr.sig td { vertical-align: top; }
  table.bpo .sign { font-size: 7pt; padding-top: 1px; }
  /* The contact strip is small print set close — four lines that read as one
     block, not four rows of the grid above them. */
  table.bpo tr.ft td { padding: 0 4px; line-height: 1.5; }
  table.bpo .party { text-align: left; vertical-align: top; white-space: normal; font-weight: 700; text-transform: uppercase; padding: 3px 5px; }
  table.bpo td.nb, table.bpo th.nb { border: none !important; }
  table.bpo .bpo-logo { height: 44pt; width: auto; display: block; margin: 0 auto 1px; }
  /* Their goods are ruled down the columns but not across — one line under the
     headings, then nothing between the items. */
  table.bpo tr.ln td { border-top: none !important; border-bottom: none !important; }
  /* A band heading stranded at the foot of a page, with its columns overleaf,
     reads as a heading for nothing — keep it with what it heads. */
  table.bpo tr.po { break-after: avoid; page-break-after: avoid; }
  /* A run of the form that is one unbroken box: the cell gives up its padding
     to the table inside it, and that table draws no rules of its own. */
  table.bpo td.bx { padding: 0; }
  table.bpo table.in { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 0; }
  table.bpo table.in td { border: none !important; padding: 1px 5px; font-size: 7pt; }
  /* Their order runs to as many sheets as the goods need, and doc17.js cuts the
     pages itself — one table to a sheet, each with the masthead and the contact
     strip their form repeats. So the inset is taken here rather than on .jg-doc:
     a run the print engine broke across pages keeps its padding only at the top
     of the first page and the foot of the last, and @page has no margin to fall
     back on, which left the goods flush against the edge of the paper. Each
     sheet is its own unbroken block, so each gets the whole inset. */
  .jg-doc:has(.bpo-page) { padding: 0; }
  .bpo-page { padding: 10mm; }
  .bpo-page + .bpo-page { page-break-before: always; }
  /* The sheet number, top right, once the order runs past one sheet. */
  table.bpo .pg { font-size: 7pt; }

  /* 18 · Custom invoice — the customs copy, ruled as one frame rather than a
     grid: solid down the columns, hairline between the goods, open wherever
     the form is only typing. Its cells therefore start with no rule and each
     names the edges it draws. Set at 6.5pt, which is their own 9pt Arial at
     the 72% their file prints at. */
  /* Unlike the rest of the library, this one is a whole page in itself — its
     margins are the form's own — so it takes the printable area rather than
     sitting inside the page padding the other documents are laid out in. */
  .jg-doc:has(table.ci) { padding: 4mm; }
  table.ci { table-layout: fixed; width: 100%; }
  /* Their form is typed on plain paper, so the app's own key/value banding and
     navy are cleared rather than inherited. The padding is a hair either side:
     the columns are the widths of their sheet and the text has to sit in them. */
  table.ci td { border: none !important; font-size: 6.5pt; line-height: 1.25; padding: 0 1.5px;
    white-space: nowrap; overflow: hidden; vertical-align: middle;
    background: none !important; color: #000 !important; }
  table.ci .lt { border-left: 1px solid #000 !important; border-top: 1px solid #000 !important; }
  table.ci .rt { border-right: 1px solid #000 !important; border-top: 1px solid #000 !important; }
  table.ci .lf { border-left: 1px solid #000 !important; }
  table.ci .rt0 { border-right: 1px solid #000 !important; }
  table.ci .lrt { border-left: 1px solid #000 !important; border-right: 1px solid #000 !important; border-top: 1px solid #000 !important; }
  table.ci .lrb { border-left: 1px solid #000 !important; border-right: 1px solid #000 !important; border-bottom: 1px solid #000 !important; }
  table.ci .lt0 { border-top: 1px solid #000 !important; }
  table.ci .bb { border-bottom: 1px solid #000 !important; }
  table.ci .bx, table.ci .h, table.ci .bnd, table.ci .hd { border: 1px solid #000 !important; }
  /* Only the form's own column headings are set in bold. A band's heading and
     the columns under it are typed in the same plain face as the goods, which
     is how their sheet has them. */
  table.ci .k, table.ci .b, table.ci .h { font-weight: 700; }
  table.ci .bnd, table.ci .hd { font-weight: 400; }
  table.ci .h, table.ci .hd, table.ci .c, table.ci .ttl { text-align: center; }
  table.ci .l { text-align: left; }
  table.ci .r { text-align: right; }
  table.ci .dbl { border-bottom: 3px double #000 !important; }
  table.ci .mer { font-weight: 700; text-decoration: underline; }
  table.ci .ttl { font-weight: 700; }
  table.ci .nb { border: none !important; }
  table.ci .brand { font-family: Centaur, Georgia, serif; font-size: 13pt; font-weight: 700; text-align: right; }
  /* The letterhead block: the mark set against the left margin with the name
     and the address ranged right of it, which is how their sheet anchors the
     picture over the corner of the form. The cell wraps, unlike the rest of
     this table, because it is five typed lines rather than one ruled row. */
  table.ci .lhead { vertical-align: top; padding: 1px 3px 1px 1px; white-space: normal; overflow: visible; }
  table.ci .lhead .pllogo { float: left; width: 44px; height: auto; margin: 1px 3px 0 0; }
  table.ci .lhead .brand { display: block; line-height: 1.05; }
  table.ci .lhead .sub, table.ci .lhead .addr {
    display: block; text-align: right; font-size: 7pt; line-height: 1.25; margin: 0; color: inherit; }
  table.ci tr.gd td, table.ci tr.ln td { border-left: 1px solid #000 !important; border-right: 1px solid #000 !important; }
  table.ci tr.ln td { border-top: 1px solid #d9d9d9 !important; border-bottom: 1px solid #d9d9d9 !important; }
  table.ci tr.gd td:first-child, table.ci tr.ln td:first-child { border-top: none !important; border-bottom: none !important; }
  table.ci tr.gd .bnd, table.ci tr.gd .h, table.ci tr.gd .hd { border: 1px solid #000 !important; }
  table.ci tr.tt td { border-left: 1px solid #000 !important; border-right: 1px solid #000 !important; border-bottom: 1px solid #000 !important; }
  table.ci tr.tt .dbl { border-top: 1px solid #000 !important; border-bottom: 3px double #000 !important; }

  /* 18 · Annx — the annexure is not typed on the form at all. It is a plain
     Calibri sheet with the printed letterhead pasted across the head of it,
     the name in red over the address in blue with its numbers in red, and the
     mark in a box of its own beside them. Its goods are ruled like the form's:
     solid down the columns, hairline between the lines. */
  table.ci.annx td { font-family: Calibri, Carlito, Arial, sans-serif; font-size: 7.5pt; padding: 0 3px; }
  table.ci.annx tr.ln td, table.ci.annx tr.ln td:first-child {
    border-left: 1px solid #000 !important; border-right: 1px solid #000 !important;
    border-top: 1px solid #d9d9d9 !important; border-bottom: 1px solid #d9d9d9 !important; }
  table.ci.annx .attl { text-align: center; }
  table.ci.annx .alh { vertical-align: top; padding: 2px 4px; white-space: normal; }
  table.ci.annx .amark { text-align: center; vertical-align: middle; }
  table.ci.annx .amark .pllogo { width: 54px; height: auto; margin: 0 auto; }
  table.ci.annx .brand { font-family: Centaur, Georgia, serif; font-size: 15pt; font-weight: 400;
    color: #ff0000 !important; text-align: right; line-height: 1.1; letter-spacing: 1.5px; }
  table.ci.annx .sub, table.ci.annx .addr {
    display: block; text-align: right; font-size: 7.5pt; line-height: 1.25; margin: 0; color: #000; }
  table.ci.annx .lb { color: #0000ff !important; }
  table.ci.annx .rd { color: #ff0000 !important; }

  /* 21 and 33 · the packing declaration — the same typed form on paper: ruled
     only where their sheet rules it, with the letterhead across the head, and
     at their sheet's own size. Their ten columns come to 501.6pt of paper, the
     rows are 12.75pt and the type is Arial 10, so the printed form is the
     worksheet 1:1 rather than a copy stretched to the width of the page. */
  .pkd { --pkdpt: 1pt; --pkdrow: calc(var(--pkdpt) * 12.75);
    font-family: Arial, Helvetica, sans-serif; font-size: calc(var(--pkdpt) * 10);
    color: #000; width: calc(var(--pkdpt) * 501.6); }
  .pkd table { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 0; }
  .pkd td { border: none !important; padding: 0 2px; height: var(--pkdrow); vertical-align: middle;
    white-space: nowrap; }
  .pkd .ttl { font-size: calc(var(--pkdpt) * 14); font-weight: 700; text-align: center; }
  .pkd .b { font-weight: 700; }
  .pkd .c { text-align: center; }
  .pkd .bx { border: 1px solid #000 !important; text-align: center; font-weight: 700; }
  .pkd .lead { border-right: 1px solid #000 !important; }
  /* The letterhead floats over the eight rows their sheet floats it over, each
     of its two blocks where that sheet's own anchor puts it. */
  .pkd .lh { padding: 0; border: none !important; }
  .pkd .lhbox { position: relative; height: calc(var(--pkdrow) * 8); }
  .pkd .lhbox img, .pkd .lhbx { position: absolute; }
  .pkd .lhaddr { height: auto; }
  .pkd .lhbx { border: 1px solid #000 !important; box-sizing: border-box; }

  /* 22 · Letter to the CHA — their ruled instruction form. Their sheet is 629pt
     across and their file prints it to fit, stepping the whole form down — type
     and all — to land on the paper; --chapt does the same stepping here, onto
     the A4 this prints on. Nothing is re-cut to fit: the form is theirs, one
     size smaller. */
  .cha { --chapt: 0.856pt; --charow: calc(var(--chapt) * 12);
    font-family: Arial, Helvetica, sans-serif; font-size: calc(var(--chapt) * 9);
    color: #000; width: calc(var(--chapt) * 629); }
  .cha table { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 0; }
  .cha td { border: none !important; padding: 0 2px; height: var(--charow); line-height: 1.1;
    vertical-align: bottom; white-space: pre; overflow: hidden; }
  .cha .el { border-left: 1px solid #000 !important; }
  .cha .er { border-right: 1px solid #000 !important; }
  .cha .et { border-top: 1px solid #000 !important; }
  .cha .eb { border-bottom: 1px solid #000 !important; }
  .cha .fb { font-weight: 700; }
  .cha .fx { font-size: calc(var(--chapt) * 18); font-weight: 700; }
  .cha .fm { vertical-align: middle; }
  .cha .fc { text-align: center; }
  .cha .fr { text-align: right; }
  .cha .fl { text-align: left; }

  /* 23 · Suppliers' details — their banded list. Their sheet is 802pt across and
     their file fits it to the width of the paper, stepping the whole list down;
     --suppt does the same stepping onto the A4 this prints on. The face is set
     a shade under the sheet's 11pt: the print engine measures Calibri a little
     wider than the spreadsheet does, and the columns here are cut to what fits
     in the spreadsheet — a GSTIN losing its last letter to that difference is
     worth more than the third of a point. */
  .sup { --suppt: 0.671pt; --suprow: calc(var(--suppt) * 15); --suplh: calc(var(--suppt) * 19.5);
    font-family: Calibri, Carlito, Arial, sans-serif; font-size: calc(var(--suppt) * 10.4);
    color: #000; width: calc(var(--suppt) * 802); }
  .sup table { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 0; }
  .sup td { border: none !important; padding: 0 calc(var(--suppt) * 2.5); height: var(--suprow); line-height: 1.15;
    vertical-align: bottom; white-space: nowrap; overflow: hidden; }
  .sup .el { border-left: 1px solid #000 !important; }
  .sup .er { border-right: 1px solid #000 !important; }
  .sup .et { border-top: 1px solid #000 !important; }
  .sup .eb { border-bottom: 1px solid #000 !important; }
  .sup .fb { font-weight: 700; }
  .sup .fs { font-size: 80%; }
  .sup .fv { overflow: visible; }
  .sup .fc { text-align: center; }
  .sup .fr { text-align: right; }
  .sup .fl { text-align: left; }
  .sup .lh { padding: 0; border: none !important; }
  .sup .lhbox { position: relative; height: calc(var(--suplh) * 7); }
  .sup .lhbox img, .sup .lhbx { position: absolute; }
  .sup .lhaddr { height: auto; }
  .sup .lhbx { border: 1px solid #000 !important; box-sizing: border-box; }

  /* 24 · Annexure to the bill of lading — a typed sheet at its own size: their
     Calibri 12 over the three columns their tables are typed across, ruled the
     way Word rules them. */
  .bla { --blapt: 1pt; font-family: Calibri, Carlito, Arial, sans-serif;
    font-size: calc(var(--blapt) * 12); line-height: 1.32; color: #000;
    width: calc(var(--blapt) * 401.4); }
  .bla table { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 0; }
  .bla td { border: none !important; padding: 0 calc(var(--blapt) * 3); vertical-align: bottom;
    text-align: left; }
  .bla td.p { white-space: pre; padding-left: 0; }
  .bla .ttl { font-weight: 700; text-align: center; }
  .bla .mid { text-align: center; }
  .bla .hd { font-weight: 700; text-decoration: underline; }
  .bla td.c { border-bottom: 1px dotted #000 !important; border-right: 1px solid #000 !important; }
  .bla td.c:last-child { border-right: none !important; }
  .bla td.last { border-bottom: 1px solid #000 !important; }

  /* 26 · Shipping instructions — the line's booking form. Their four columns
     come to 574pt and their file prints them at 85%, type and all; --sipt does
     the same stepping here, so the printed form is theirs at their size. */
  .si { --sipt: 0.85pt; --sirow: calc(var(--sipt) * 12.75);
    font-family: Calibri, Carlito, Arial, sans-serif; font-size: calc(var(--sipt) * 10);
    line-height: 1.2; color: #000; width: calc(var(--sipt) * 574); }
  .si table { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 0; }
  .si td { border: none !important; padding: 0 calc(var(--sipt) * 2); height: var(--sirow);
    vertical-align: bottom; white-space: nowrap; overflow: hidden; }
  .si .el { border-left: 1px solid #000 !important; }
  .si .er { border-right: 1px solid #000 !important; }
  .si .et { border-top: 1px solid #000 !important; }
  .si .eb { border-bottom: 1px solid #000 !important; }
  .si .fb { font-weight: 700; }
  .si .fc { text-align: center; }
  .si .fg { background: #c0c0c0 !important; }
  .si .fw { white-space: pre-wrap; vertical-align: top; }

  /* 27 · Declaration of verified gross mass, on the letter paper. */
  .vgm .vgmt { margin: 8px 0 12px; }
  .vgm .vgmt td { border: 1px solid #000 !important; padding: 1.5px 4px; white-space: normal;
    vertical-align: middle; }
  .vgm .vgmt .sr { width: 6%; }
  .vgm .vgmt .ask { width: 50%; }
  .vgm .vgmt .ans { width: 44%; white-space: pre-line; }
  .vgm .u { text-decoration: underline; }
  .vgm .nb { margin: 0; }
  .vgm .sg { width: 100%; margin: 0 0 8px; }
  .vgm .sg>tbody>tr>td:first-child { width: 52%; }
  .vgm .sg .k { min-width: 88px; }
  .vgm .sgr { text-align: right; vertical-align: top; }
  /* Their letterhead as it really prints — the scanned strip across the head of
     the sheet, sized to the width of the paper. */
  .vgm .vghead { text-align: left; }
  /* The scan carries two dead columns of black down its right edge — the edge
     of the platen, not the letterhead — so that sliver is clipped off rather
     than printed as a rule down the middle of the sheet. Trimming a clean
     scan by the same fraction would not show. */
  .vgm .vghimg { width: 100%; height: auto; display: block; clip-path: inset(0 0.32% 0 0); }
  /* The stamp and the signature the declaration goes out under, standing where
     their own signed copy puts them: the stamp between the particulars and the
     signature, the scan itself against the right margin. The scan carries the
     "For M/s." line and the name under it, so no type is set beside it.

     Both are sized as a share of the run they stand in rather than in points,
     so they hold their proportion of the paper whatever it is printed on. */
  .vgm .sg .sgst { width: 20%; text-align: center; vertical-align: middle; }
  .vgm .sg .sgr { width: 28%; }
  .vgm .vgstamp { width: 55%; height: auto; }
  .vgm .vgsign { width: 100%; height: auto; display: block; margin-left: auto; }
  /* The whole declaration is a one-page paper, so it is set close enough to
     come off one — fifteen ruled particulars, the signature block and the notes
     under them do not fit at the size the letters are set at. */
  .dl.vgm { font-size: 9.5pt; line-height: 1.25; }
  /* The paragraph rule the letters are set by (.dl p, further down) carries a
     size and a leading of its own, and being the more specific of the two it was
     re-setting every line of this sheet back to the letters' 10.5pt on 1.45 —
     so the notes came out a size large and a line apart, though the sheet asks
     for 9.5 on 1.25 just above. Handing them back to the sheet keeps the whole
     declaration on one measure. */
  .dl.vgm p { margin: 0 0 5px; font-size: inherit; line-height: inherit; }
  /* The remarks are a block of lines, not a run of paragraphs: their own gap is
     none. Stated at this weight so it outranks the rule above. */
  .dl.vgm .nb { margin: 0; }
  .dl.vgm .vgmt { margin: 6px 0 8px; }
  .dl.vgm .vgmt td { padding: 1px 4px; }
  .dl.vgm .rule { margin: 5px 0 8px; }

  /* 29 · E-way bill, export leg — the portal's printed bill. */
  .ewx { --ewpt: 1pt; font-family: Arial, Helvetica, sans-serif;
    font-size: calc(var(--ewpt) * 9); line-height: 1.25; color: #000;
    width: calc(var(--ewpt) * 520); }
  .ewx table { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 0; }
  .ewx td { border: none !important; padding: 2px 4px; vertical-align: middle;
    white-space: nowrap; overflow: hidden; }
  .ewx .el { border-left: 1px solid #999 !important; }
  .ewx .er { border-right: 1px solid #999 !important; }
  .ewx .et { border-top: 1px solid #999 !important; }
  .ewx .eb { border-bottom: 1px solid #999 !important; }
  .ewx .fb { font-weight: 700; }
  .ewx .ft { font-size: calc(var(--ewpt) * 15); font-weight: 700; padding: 5px 0; }
  .ewx .fc { text-align: center; }
  .ewx .fr { text-align: right; }
  .ewx .fw { white-space: normal; vertical-align: top; }

  /* 28 · Cost sheets — their grey form, one per factory, on the letterhead. */
  .cs { --cspt: 0.85pt; --csrow: calc(var(--cspt) * 15);
    font-family: Calibri, Carlito, Arial, sans-serif; font-size: calc(var(--cspt) * 10.6);
    line-height: 1.2; color: #000; width: calc(var(--cspt) * 613); }
  .cs table { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 0; }
  .cs td { border: none !important; padding: 0 calc(var(--cspt) * 2); height: var(--csrow);
    vertical-align: middle; white-space: nowrap; overflow: hidden; }
  .cs .el { border-left: 1px solid #000 !important; }
  .cs .er { border-right: 1px solid #000 !important; }
  .cs .et { border-top: 1px solid #000 !important; }
  .cs .eb { border-bottom: 1px solid #000 !important; }
  .cs .fb { font-weight: 700; }
  .cs .fc { text-align: center; }
  .cs .fr { text-align: right; }
  .cs .fg { background: #c0c0c0 !important; }
  .cs .fw { white-space: normal; vertical-align: top; }
  .cs .lh { padding: 0; border: none !important; }
  .cs .lhbox { position: relative; height: calc(var(--csrow) * 7); }
  .cs .lhbox img, .cs .lhbx { position: absolute; }
  .cs .lhaddr { height: auto; }
  .cs .lhbx { border: 1px solid #000 !important; box-sizing: border-box; }

  /* 30 · Letter to the buyer — their letterhead, the letter, and the client's
     own signature and stamp at the foot of it. */
  .ltb { --ltbpt: 0.79pt; --ltbrow: calc(var(--ltbpt) * 15);
    font-family: Arial, Helvetica, sans-serif; font-size: calc(var(--ltbpt) * 10);
    line-height: 1.25; color: #000; width: calc(var(--ltbpt) * 679); }
  .ltb table { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 0; }
  .ltb td { border: none !important; padding: 0 calc(var(--ltbpt) * 2); height: var(--ltbrow);
    vertical-align: middle; white-space: nowrap; overflow: visible; }
  .ltb .et { border-top: 1px solid #000 !important; }
  .ltb .eb { border-bottom: 1px solid #000 !important; }
  .ltb .fb { font-weight: 700; }
  .ltb .fc { text-align: center; }
  .ltb .fl { text-align: left; }
  .ltb .lh { padding: 0; border: none !important; }
  .ltb .lhbox { position: relative; height: calc(var(--ltbrow) * 7); }
  .ltb .lhbox img, .ltb .lhbx { position: absolute; }
  .ltb .lhaddr { height: auto; }
  .ltb .lhbx { border: 1px solid #000 !important; box-sizing: border-box; }
  .ltb .sgbox { padding: calc(var(--ltbpt) * 4) 0 0; height: auto; white-space: nowrap; }
  .ltb .sgsign, .ltb .sgstamp { display: inline-block; height: auto; vertical-align: top; }
  .ltb .sgstamp { margin-left: calc(var(--ltbpt) * 18); }

  /* 31 · Commercial invoice — the customs book's frame without its rupee half. */
  table.ci.ci31 .bnd { border: 1px solid #000 !important; font-weight: 700; }
  table.ci.ci31 .dbl { border-top: 1px solid #000 !important; border-bottom: 3px double #000 !important; }
  table.ci.ci31 .mer { font-weight: 700; text-decoration: underline; }

  /* 32 · the buyer's copy of the packing list is signed and stamped. */
  table.ci.pl .sgbox { text-align: left; vertical-align: middle; padding: 1px 4px; }
  table.ci.pl .sgstamp { text-align: center; vertical-align: middle; padding: 1px 2px; }
  /* Sized against the boxes they stand in, so neither can force a column wider
     than the share of the form their own copy gives it. */
  table.ci.pl .plsign { max-width: 82%; width: auto; height: auto; vertical-align: middle; }
  table.ci.pl .plstamp { max-width: 88%; width: auto; height: auto; vertical-align: middle; }

  /* 40 · Export bill regularisation — the letter to the bank, on the
     declaration's own paper and at the scale their file prints it. */
  /* The face is set a shade under the sheet's 10pt: the print engine measures
     Arial a little wider than the spreadsheet does, and these paragraphs are
     already broken to the lines their file breaks them on. */
  .ebr { --ebrpt: 0.86pt; --ebrrow: calc(var(--ebrpt) * 12.75);
    font-family: Arial, Helvetica, sans-serif; font-size: calc(var(--ebrpt) * 9.5);
    line-height: 1.25; color: #000; width: calc(var(--ebrpt) * 501.6); }
  .ebr table { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 0; }
  /* Their letter is typed line by line, each already broken where their file
     breaks it, so a line runs on over the white beside it rather than being
     re-wrapped — which is what it does on the sheet. Only the boxes that ask
     for it wrap. */
  .ebr td { border: none !important; padding: 1px 3px; height: var(--ebrrow);
    vertical-align: middle; white-space: pre; overflow: visible; }
  .ebr .fw { white-space: pre-line; overflow: hidden; }
  .ebr .el { border-left: 1px solid #000 !important; }
  .ebr .er { border-right: 1px solid #000 !important; }
  .ebr .et { border-top: 1px solid #000 !important; }
  .ebr .eb { border-bottom: 1px solid #000 !important; }
  /* The Calibri declarations under the letter are set justified in their
     file, as the Arial letter above them is not. */
  .ebr .fj { font-family: Calibri, Carlito, Arial, sans-serif; font-size: calc(var(--ebrpt) * 11);
    text-align: justify; }
  .ebr .fb { font-weight: 700; }
  .ebr .fc { text-align: center; }
  .ebr .fr { text-align: right; }
  .ebr tr.pb { page-break-before: always; }
  .ebr .lh { padding: 0; border: none !important; }
  .ebr .lhbox { position: relative; height: calc(var(--ebrrow) * 8); }
  .ebr .lhbox img, .ebr .lhbx { position: absolute; }
  .ebr .lhaddr { height: auto; }
  .ebr .lhbx { border: 1px solid #000 !important; box-sizing: border-box; }

  /* 19 and 20 · the packing list is typed in colour where the invoice book is
     not: the form's own labels are blue, the answers customs reads off the head
     of it are red, and the line it is signed for is blue. */
  table.ci.pl .lb, table.ci.pl .sg { color: #0000ff !important; }
  table.ci.pl .rd, table.ci.pl .ttl { color: #ff0000 !important; }
  table.ci.pl .hc { font-size: 5.5pt; }

  /* 20 · the item-wise packing details — the four sheets behind that list.
     Arial 10 on a black grid, the exporter's own codes in their green and the
     buyer's part numbers plain, with each sheet named above it since paper has
     no tabs to read the name off. */
  .dth { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; font-weight: 700;
    letter-spacing: .06em; color: #000; margin: 0 0 3px; }
  table.wb.dt td, table.wb.dt th { padding: 2px 3px; font-size: 7.5pt; }
  table.wb.dt th.l { text-align: left; }
  table.wb.dt .gd, table.wb.dt .code { text-align: left; }
  table.wb.dt .gd { color: #008000 !important; }
  table.wb.dt td.desc { white-space: normal; text-align: left; }
  table.wb.dt tr.bnd td { font-weight: 700; }
  table.wb.dt tr.tot td.o { border-bottom: none !important; }
  /* A band's name is wider than the two columns it is typed across — their
     sheet shrinks it to fit rather than widening the form, and so does this. */
  table.ci.annx .bnl { font-size: 6.8pt; }

  /* 19 · Packing list — the customs invoice's frame again, but ruled the whole
     way across: its marks column is part of the goods table here rather than
     the open margin the invoice leaves beside it, so the hairlines run under
     that column too. Set at 7.5pt, their 9pt Arial at the 86% their file
     prints at, and its address block at the 10pt of their letterhead. */
  table.ci.pl td { font-size: 7.5pt; }
  table.ci.pl .big { font-size: 8.5pt; }
  table.ci.pl tr.gd td, table.ci.pl tr.ln td, table.ci.pl tr.fl td {
    border-left: 1px solid #000 !important; border-right: 1px solid #000 !important; }
  table.ci.pl tr.gd td, table.ci.pl tr.gd td:first-child {
    border-top: 1px solid #000 !important; border-bottom: 1px solid #000 !important; }
  table.ci.pl tr.ln td, table.ci.pl tr.ln td:first-child {
    border-top: 1px solid #d9d9d9 !important; border-bottom: 1px solid #d9d9d9 !important; }
  table.ci.pl .dbl { border-bottom: 3px double #000 !important; }
  /* A band's column header is wider than the column it heads — their sheet
     shrinks it to fit rather than widening the form, so it is set smaller here
     for the same reason. */
  table.ci.pl tr.hc td { font-size: 6.2pt; }
  /* The packing book is typed in colour where the invoice book is not, and the
     colour carries meaning: the form's own labels are blue, the answers customs
     reads off the head of it are red, and so is the title. What is typed in
     against a label stays black, as does the whole goods table. These override
     the black this table otherwise forces on every cell. */
  table.ci.pl .lb { color: #0000ff !important; }
  table.ci.pl .rd, table.ci.pl .ttl { color: #ff0000 !important; }
  table.ci.pl .sg { color: #0000ff !important; font-weight: 400; }
  table.ci.pl .lhead .brand { color: #800000 !important; }
  table.ci.pl .lhead .sub { color: #800000 !important; }
  table.ci.pl .lhead .addr { color: #3366ff !important; }

  /* 6 · Suppliers' PO — the letter, printed as their Page1 prints. */
  table.wb.letter { border: 1px solid #000; table-layout: fixed; width: 100%; }
  table.wb.letter td, table.wb.letter th { border: none !important; padding: 2px 5px; white-space: normal; }
  table.wb.letter th { border: 1px solid #000 !important; background: #fff !important; color: #000 !important; }
  table.wb.letter .ttl { color: #f00 !important; font-weight: 700; text-align: center; border-bottom: 1px solid #000 !important; }
  table.wb.letter .brand { font-family: Centaur, Georgia, serif; font-size: 17pt; font-weight: 700; color: #800000 !important; text-align: right; vertical-align: top; }
  table.wb.letter .logo { float: left; width: 54px; height: auto; margin: 1px 0 0 1px; }
  /* .sub is a block elsewhere in the library; inside the letter it is a cell. */
  table.wb.letter td.sub { display: table-cell; color: #800000 !important; text-align: right; font-size: 8.5pt; margin: 0; }
  table.wb.letter .addr { color: #3366ff !important; text-align: right; }
  table.wb.letter .lbl { color: #00f !important; font-weight: 700; }
  table.wb.letter .gst { color: #00f !important; font-weight: 700; text-align: center; vertical-align: top; }
  table.wb.letter tr.band td { font-weight: 700; }
  table.wb.letter .u { text-decoration: underline; }
  table.wb.letter .bx { border: 1px solid #000 !important; }
  table.wb.letter .sgn { color: #3366ff !important; }
  table.wb.letter tr.sign td { height: 46px; }
  table.wb.letter .buyer { color: #f00 !important; text-decoration: underline; }
  table.wb.letter tr td.l, table.wb.letter tr.band td { border-top: 1px solid #000 !important; border-bottom: 1px solid #000 !important; }
  .pgbrk { page-break-before: always; }

  /* 10 · E-way bill — the portal's entry form, printed as their format sheet. */
  .ew { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; color: #000; }
  .ew table { border-collapse: collapse; width: 100%; margin: 0 0 3px; }
  .ew td { border: none !important; padding: 2px 4px; vertical-align: middle; }
  .ew .lbl { background: none !important; color: #000 !important; font-weight: 400; white-space: nowrap; }
  .ew .hd { font-weight: 400; padding-top: 7px; }
  .ew .fld { border: 1px solid #000 !important; }
  .ew .ph { color: #999 !important; }
  .ew .b { font-weight: 700; }
  .ew .c { text-align: center; }
  .ew .i { font-style: italic; text-align: center; }
  .ew .on { font-weight: 700; font-style: normal; }
  .ew .ewtop td { padding-bottom: 9px; }
  .ew .ewband td { border-top: 1px solid #000 !important; border-bottom: 1px solid #000 !important; padding: 5px 4px; }
  .ew .ewband td:first-child { border-left: 1px solid #000 !important; }
  .ew .ewband td:last-child { border-right: 1px solid #000 !important; }
  .ew .ewitems .hd td, .ew .ewtot .hd td { text-align: center; border: none !important; }
  .ew .ewgrid .gap td { height: 12px; }
  .ew .ewpart { width: auto; margin-left: 110px; }
  .ew .ewpart .lbl { padding-right: 10px; }
  .ew .ewline .fld { min-width: 110px; }

  /* 13 · Export value declaration — the customs form, typed. Every line is a
     run across the same 24-column grid, so the boxes sit under one another. */
  .evd { font-family: "Times New Roman", Times, serif; font-size: 12pt; color: #000; }
  .evd table { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 0; }
  .evd td { border: none !important; padding: 1px 2px; vertical-align: middle; font-size: 12pt; white-space: nowrap; }
  .evd .ttl { text-align: center; }
  .evd .c { text-align: center; }
  .evd .u { text-decoration: underline; }
  .evd .w { white-space: normal; vertical-align: top; }
  .evd .nt { vertical-align: top; }
  .evd .bx { border: 1px solid #000 !important; text-align: center; }
  .evd tr.gap td { height: 8pt; }

  /* 11 · Despatch instructions — the letter, on the letterhead. */
  .dl { font-family: Calibri, Arial, sans-serif; font-size: 10.5pt; color: #000; line-height: 1.45; }
  .dl table { border-collapse: collapse; width: 100%; margin: 0; }
  .dl td { border: none !important; padding: 0; vertical-align: top; }
  /* The letter's own tables are the letter: its instructions, its field lines
     and its particulars box read at the body's size, not the 8.5pt the rest of
     the library sets for a table cell. The masthead and the contact strip keep
     the sizes of their own. */
  .dl .ins td, .dl table.fld td, .dl table.bx td { font-size: 10.5pt; }
  .dl .brand { font-family: Centaur, Georgia, serif; font-size: 34pt; font-weight: 700; color: #8b0000 !important; letter-spacing: 1px; line-height: 1; }
  .dl .sub { font-family: Centaur, Georgia, serif; font-size: 13pt; color: #8b0000 !important; letter-spacing: 2px; padding-left: 48px; }
  .dl .lg { width: 100px; text-align: right; }
  .dl .lg img { width: 86px; height: auto; }
  .dl .rule { border-top: 1px solid #c00; margin: 6px 0 12px; }
  .dl .ref { margin-bottom: 14px; }
  .dl p { margin: 0 0 10px; font-size: 10.5pt; line-height: 1.45; }
  .dl .to { margin-bottom: 14px; }
  .dl .refline .k { display: inline-block; min-width: 30px; }
  .dl .k { background: none !important; color: #000 !important; font-weight: 400; }
  .dl .b { font-weight: 700; }
  .dl .sign { margin-top: 38px; }
  .dl .ins { margin: 0 0 10px; width: auto; }
  .dl .ins td { padding: 0 0 3px; }
  .dl .ins .n { width: 50px; padding-left: 22px; }
  .dl .mid { text-align: center; }
  .dl.just p, .dl.just .ins td { text-align: justify; }
  .dl.just .mid { text-align: center; }
  .dl.just .sign { text-align: left; }
  .dl table.fld { width: 100%; margin: 0 0 10px; }
  .dl table.fld .lbl { width: 25%; }
  .dl .encl .ans { padding-left: 26px; white-space: nowrap; }
  .dl table.bx { margin: 12px 0; width: 100%; }
  .dl table.bx td { border: 1px solid #000 !important; padding: 2px 5px; }
  .dl .dlfoot { margin-top: 2px; font-size: 9pt; color: #8b0000 !important; }
  .dl .dlfoot .r { text-align: right; }
  /* The contact strip is set open on their paper, not run together — the space
     goes between the lines rather than around them, so the block gains air
     without the rule above it drifting off the foot of the sheet. */
  .dl .dlfoot div + div { margin-top: 6px; }

  /* 34 · Container weight declaration — their forwarder's typed form. Not one
     of the exporter's papers and on no letterhead, so it is set as their file
     sets it: Calibri on a plain ruled grid, the title large over it, and the
     instructions on it in their own blue. The sizes below are their file's:
     the title 18pt, the hints 8, the notes 7, the weights and signature 10. */
  .cwd { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #000; line-height: 1.2; }
  .cwd .ttl { font-size: 18pt; font-weight: 700; text-align: center; margin: 0 0 14px; }
  .cwd table.cwt { width: 100%; border-collapse: collapse; margin: 0 0 10px; table-layout: fixed; }
  .cwd table.cwt td { border: 1px solid #000 !important; padding: 2px 5px; vertical-align: top;
    font-size: 11pt; word-break: break-word; }
  /* The library bands a key cell navy-on-grey; this form is typed on plain
     paper, so that is cleared rather than inherited, and its labels wrap. */
  .cwd .k { font-weight: 700; background: none !important; color: #000 !important; white-space: normal; }
  /* Their head table sets a clear row between one block and the next, so the
     three read as three boxes rather than one ruled run. */
  .cwd .hd .gap td { border: none !important; height: 7px; padding: 0; }
  /* The note over each box saying what belongs in it — small, bold, ruled under. */
  .cwd .hint { font-size: 8pt; font-weight: 700; text-decoration: underline; }
  .cwd .v { font-size: 11pt; }
  .cwd .b { font-weight: 700; }
  /* Their form writes its own instructions to the reader in blue. */
  .cwd .bl, .cwd .note { color: #0070C0 !important; }
  .cwd .note { font-weight: 700; text-align: center; vertical-align: middle; }
  .cwd .hint.bl { text-decoration: none; font-size: 9pt; }
  /* A choice is ringed rather than ticked, as their form asks for it to be —
     an oval very nearly as wide as the cell, which is how theirs is drawn. */
  .cwd .opt { text-align: center; vertical-align: middle; }
  .cwd .opt.on span { border: 1pt solid #000; border-radius: 50%;
    display: block; width: 94%; margin: 0 auto; padding: 1px 0; }
  /* "Other" carries its own "Please specify" under it, in one cell. */
  .cwd .oth { vertical-align: top; }
  .cwd .spec { font-size: 6pt; }
  /* The goods stand on one line of their sheet. Calibri is not on every machine
     that prints this, and the fallback sets wider, so the line is given a size
     that holds it rather than a rule that would run it off the edge of the box. */
  .cwd .cmd { font-size: 9.5pt; vertical-align: middle; }
  /* The three weights: the tare in a single column, the other two across two
     each, so each figure sits under the heading that names it. The tare column
     is narrow enough that its figure turns onto a second line, as theirs does. */
  .cwd .wh, .cwd .wv { text-align: center; vertical-align: middle; font-size: 10pt; }
  /* The load box is set narrower than the page, as a form leaves room beside it
     to write in. The door edge is labelled in its top corner and the centre of
     mass marked with a cross drawn corner to corner. */
  .cwd table.ld, .cwd table.sg { width: 67%; }
  .cwd .lb { position: relative; height: 54pt; }
  .cwd .dr { position: absolute; top: 2pt; right: 4pt; font-size: 8pt; line-height: 1.1; text-align: center; }
  .cwd .xm { display: block; width: 34pt; height: 34pt; margin: 5pt auto 0; }
  .cwd .xm line { stroke: #000; stroke-width: 1.2; }
  /* The four methods, the instruction beside them, and the stamp and signature
     the sheet goes out under — which stand to the right of the run on their own
     signed copy rather than inside the block below it. */
  .cwd table.mth { width: 100%; border-collapse: collapse; margin: 0 0 10px; table-layout: fixed; }
  .cwd table.mth td { border: none !important; padding: 0 4px 0 0; vertical-align: top; font-size: 9pt; }
  .cwd .ml1 { width: 26%; font-size: 8.5pt; }
  .cwd .ml { width: 32%; }
  .cwd .sk { width: 12%; text-align: center; vertical-align: middle; }
  .cwd .sn { width: 30%; text-align: right; vertical-align: middle; }
  /* Each method stands on one line — theirs does, and a ring drawn round a
     phrase that has turned reads as a ring round nothing. */
  .cwd .ml .opt { text-align: left; padding: 0; white-space: nowrap; }
  .cwd .ml .opt.on span { display: inline-block; width: auto; padding: 0 10px; }
  .cwd .cwstamp { width: 62pt; height: auto; }
  .cwd .cwsign { width: 150pt; height: auto; }
  .cwd p { margin: 0 0 4px; font-size: 11pt; }
  .cwd .re { margin-top: 10px; }
  /* The lines their form leaves to be written on, and the rules under the day,
     the month and the year of the date. */
  .cwd .sg td { height: 22pt; font-size: 10pt; }
  .cwd .ul { border-bottom: 1px solid #000; display: inline-block; min-width: 88%; }
  .cwd .rule { border-bottom: 1px solid #000; display: inline-block; width: 62%; margin-left: 3pt; }
  .cwd .du { border-bottom: 1px solid #000; display: inline-block; padding: 0 3px; }
  /* The seven notes are set very small on their sheet, and run close. */
  .cwd .nt { font-size: 7pt; margin: 0 0 2px; line-height: 1.3; }
  .cwd .hd2 { font-size: 8pt; margin-top: 8px; }
  .cwd .cl { margin-top: 10px; font-size: 10pt; }

`;

const escHtml = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Print one or more HTML documents, for the client to save as PDF.
 * `docs` is a single html string, or [{ name?, html }].
 * `opts.orientation` — "portrait" for a document whose sheet is set up that
 * way; anything else keeps the library's landscape default.
 */
export function downloadPDF(title, docs, opts = {}) {
  const list = (Array.isArray(docs) ? docs : [{ html: docs }]).filter((d) => d && d.html);
  if (!list.length) return;
  const body = list.map((d) => `<div class="jg-doc">${d.html}</div>`).join("");

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;";
  document.body.appendChild(frame);

  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    setTimeout(() => { try { frame.remove(); } catch (e) { /* already gone */ } }, 500);
  };

  try {
    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>${pageRule(opts.orientation)}${PRINT_CSS}</style></head><body>${body}</body></html>`);
    doc.close();

    const go = () => {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.onafterprint = cleanup;
        frame.contentWindow.print();
      } catch (e) {
        alert("The browser would not open the print dialog. Use the Excel download instead.");
      }
      // Safari never fires onafterprint from a frame; sweep up regardless.
      setTimeout(cleanup, 60000);
    };
    /* A tick to lay the tables out before measuring pages — and, if the
       document carries images, however much longer they need to decode. The
       buyer's mark on document 17 is a data: URL, which is fast but not free,
       and printing before it has decoded drops it from the sheet. Whatever is
       still not ready after a second is not going to be, so the print goes
       ahead rather than leaving the dialog waiting on it. */
    const ready = () => {
      const imgs = [...doc.images].filter((i) => !i.complete);
      if (!imgs.length) return Promise.resolve();
      return Promise.race([
        Promise.all(imgs.map((i) => new Promise((res) => {
          i.addEventListener("load", res, { once: true });
          i.addEventListener("error", res, { once: true });
        }))),
        new Promise((res) => setTimeout(res, 1000)),
      ]);
    };
    setTimeout(() => { ready().then(go); }, 120);
  } catch (e) {
    cleanup();
    alert("Could not build the PDF in this browser — use the Excel download instead.");
  }
}
