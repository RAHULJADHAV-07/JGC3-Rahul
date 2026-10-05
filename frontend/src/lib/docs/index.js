import { B_1 } from "./doc1.js";
import { B_2A } from "./doc2A.js";
import { B_2 } from "./doc2.js";
import { B_3 } from "./doc3.js";
import { B_4 } from "./doc4.js";
import { B_5 } from "./doc5.js";
import { B_6 } from "./doc6.js";
import { B_7A } from "./doc7A.js";
import { B_7 } from "./doc7.js";
import { B_8 } from "./doc8.js";
import { B_9 } from "./doc9.js";
import { B_10 } from "./doc10.js";
import { B_11A } from "./doc11A.js";
import { B_11 } from "./doc11.js";
import { B_12 } from "./doc12.js";
import { B_13 } from "./doc13.js";
import { B_14 } from "./doc14.js";
import { B_15 } from "./doc15.js";
import { B_16 } from "./doc16.js";
import { B_17 } from "./doc17.js";
import { B_18 } from "./doc18.js";
import { B_19 } from "./doc19.js";
import { B_20 } from "./doc20.js";
import { B_21 } from "./doc21.js";
import { B_22 } from "./doc22.js";
import { B_23 } from "./doc23.js";
import { B_24 } from "./doc24.js";
import { B_25 } from "./doc25.js";
import { B_26 } from "./doc26.js";
import { B_27 } from "./doc27.js";
import { B_28 } from "./doc28.js";
import { B_29 } from "./doc29.js";
import { B_30 } from "./doc30.js";
import { B_31 } from "./doc31.js";
import { B_32 } from "./doc32.js";
import { B_33 } from "./doc33.js";
import { B_34 } from "./doc34.js";
import { B_35 } from "./doc35.js";
import { B_36 } from "./doc36.js";
import { B_37 } from "./doc37.js";
import { B_38 } from "./doc38.js";
import { B_39 } from "./doc39.js";
import { B_40 } from "./doc40.js";
import { buildBalanceReport, despatchSupplierDocs, esc, ewaySupplierDocs, supplierPoDocs } from "./common.js";
import { downloadDocsExcel, downloadDocsWord, downloadPDF } from "../download.js";

/* Base filename, no extension — the download helper adds the right one.
   A PO-stage document is stamped with its purchase order, an invoice-stage
   one with its invoice. */
function fnameFor(no, name, ctx) {
  const stamp = String(ctx.po || ctx.inv.invoiceNo || "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // A paper narrowed to one supplier says so in its name.
  const sup = ctx.supplierId && ctx.supCode ? String(ctx.supCode(ctx.supplierId)).replace(/[^A-Za-z0-9]+/g, "") : "";
  return `Doc_${no}_${String(name).replace(/[^A-Za-z0-9]+/g, "_")}${stamp ? `_${stamp}` : ""}${sup ? `_${sup}` : ""}`;
}

/* ============================================================================
   BUILDERS — one per document number, each in a file of its own beside this
   one, so a paper can be read and reworked without the other thirty-nine.
   ============================================================================ */
const B = {
  "1": B_1,
  "2A": B_2A,
  "2": B_2,
  "3": B_3,
  "4": B_4,
  "5": B_5,
  "6": B_6,
  "7A": B_7A,
  "7": B_7,
  "8": B_8,
  "9": B_9,
  "10": B_10,
  "11A": B_11A,
  "11": B_11,
  "12": B_12,
  "13": B_13,
  "14": B_14,
  "15": B_15,
  "16": B_16,
  "17": B_17,
  "18": B_18,
  "19": B_19,
  "20": B_20,
  "21": B_21,
  "22": B_22,
  "23": B_23,
  "24": B_24,
  "25": B_25,
  "26": B_26,
  "27": B_27,
  "28": B_28,
  "29": B_29,
  "30": B_30,
  "31": B_31,
  "32": B_32,
  "33": B_33,
  "34": B_34,
  "35": B_35,
  "36": B_36,
  "37": B_37,
  "38": B_38,
  "39": B_39,
  "40": B_40,
};

/* ---- catalogue + public API ---- */

/* The 40 papers grouped under the client's own menu heads
   (Docs/Jaikvin Process/Menu Bar.xlsx) — each key `k` matches a navigation
   entry, so every document lives under the menu it belongs to. */
export const DOC_GROUPS = [
  // PO Reports are raised off the purchase order itself, so they exist the
  // moment the buyer's order is entered — nothing here waits on an invoice.
  { k: "PO", t: "PO Reports", hint: "Raised when the buyer places an order", docs: ["1", "2", "3", "4", "5", "6"], source: "po" },
  { k: "SUP", t: "Suppliers' Reports", hint: "Raised when suppliers deliver boxes", docs: ["7", "8", "9", "10", "11"] },
  /* 23 · Suppliers' details is filed under Other Reports in the client's own
     menu, but it also travels with the pre-shipment set, so it is listed under
     both heads. A paper may belong to more than one head: the command palette
     and the whole-library bundle each count a shared document once. */
  { k: "PRE", t: "Pre-Shipment Reports", hint: "Everything customs needs before loading", docs: ["12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29"] },
  { k: "POST", t: "Post Shipment Reports", hint: "Sent after the container sails, incl. bill regularisation for the bank", docs: ["30", "31", "32", "33", "34", "40"] },
  { k: "OTH", t: "Other Reports", hint: "Costing, supplier details and balance registers", docs: ["35", "23", "38", "36", "37", "39"] },
];

export const DOC_META = {
  "1": "Buyers Order", "2A": "Master", "2": "Barcode", "3": "Packing", "4": "Purchase", "5": "Sales", "6": "Suppliers’ PO",
  "7A": "Master (7A)", "7": "Packing", "8": "Purchase", "9": "Sales", "10": "E-way (inward)", "11A": "Delivery order", "11": "Delivery instr.",
  "12": "Boxes & volume", "13": "Export value decl.", "14": "SCOMET", "15": "SDF", "16": "RoDTEP", "17": "Proforma", "18": "Custom invoice",
  "19": "Packing list", "20": "Packing itemwise", "21": "Packaging decl.", "22": "Letter to CHA", "23": "Supplier details", "24": "BL annexure",
  "25": "E-invoice", "26": "Shipping instr.", "27": "VGM", "28": "Cost sheets", "29": "E-way (export)", "30": "Letter to buyer",
  "31": "Commercial invoice", "32": "Packing", "33": "Packaging decl.", "34": "CWD", "35": "Costing", "36": "Balance, supplier",
  "37": "Balance, item", "38": "Supply details", "39": "Balance boxes/vol", "40": "Bill regularisation",
};

/* Which documents belong to the purchase-order stage — they are built from a
   PO, never from an invoice (see DOC_GROUPS above). */
export const PO_DOCS = DOC_GROUPS.find((g) => g.k === "PO").docs.slice();

export const isPoDoc = (no) => PO_DOCS.includes(String(no));

/* The three papers each supplier receives on their own, rather than as one
   combined sheet: the purchase order, the inward e-way bill and the despatch
   instruction. */
export const SUPPLIER_SPLIT_DOCS = { 6: supplierPoDocs, 10: ewaySupplierDocs, 11: despatchSupplierDocs };

export function supplierSplitDocs(no, ctx) {
  const fn = SUPPLIER_SPLIT_DOCS[String(no)];
  try { return fn ? fn(ctx) : []; } catch (e) { return []; }
}

function buildOne(no, ctx, report) {
  if (["36", "37", "38", "39"].includes(no) && report) return buildBalanceReport(no, ctx, report);
  return B[no] ? B[no](ctx) : null;
}

/** One document as [{ name, html, sheet? }] — several entries when it splits
 *  per supplier, so Excel gets a sheet each and the PDF a page each.
 *
 *  A builder that copies one of the client's own workbooks hands back a `sheet`
 *  as well — or `sheets`, when the document is a workbook of its own. The Excel
 *  download uses those verbatim instead of converting the HTML, which is how
 *  doc 2 comes out looking like 2-Barcode.xlsx and doc 10 like the portal's
 *  entry form. */
export function documentParts(no, ctx, report) {
  const split = supplierSplitDocs(no, ctx);
  if (split.length > 1) return split.map((d) => ({ name: `${d.code}`, html: d.html, sheets: d.sheets, docName: d.docName }));
  const out = buildOne(no, ctx, report);
  return out ? [{ name: DOC_META[no] || out.name, html: out.html, sheet: out.sheet, sheets: out.sheets, page: out.page, docName: out.name }] : [];
}

export function documentFilename(no, ctx, report) {
  const out = buildOne(no, ctx, report);
  return fnameFor(no, out ? out.name : `Document_${no}`, ctx);
}

export function hasBuilder(no) { return !!B[no] || ["36", "37", "38", "39"].includes(no); }

/* The papers the client keeps as Word documents rather than workbooks. Their
   own file is a typed sheet and it is sent on as it stands, so the download
   beside the PDF hands over a .docx — a spreadsheet of it would only have to be
   retyped. They still take their place as a sheet in a whole-stage workbook,
   which is a bundle rather than the document itself. */
export const WORD_DOCS = ["24", "34"];

export const isWordDoc = (no) => WORD_DOCS.includes(String(no));

/* ---- downloads ----
   Both formats come off the same parts, so an Excel and a PDF of the same
   document can never show different figures. */
export function downloadDocumentExcel(no, ctx, report) {
  const parts = documentParts(no, ctx, report);
  if (!parts.length) { alert(`Document ${no} generator not available.`); return false; }
  // A Word paper hands over its own format from this same button.
  if (isWordDoc(no)) return downloadDocumentWord(no, ctx, report);
  downloadDocsExcel(documentFilename(no, ctx, report), parts);
  return true;
}

export function downloadDocumentWord(no, ctx, report) {
  const out = buildOne(String(no), ctx, report);
  if (!out?.docx) { alert(`Document ${no} is not a Word document.`); return false; }
  downloadDocsWord(documentFilename(no, ctx, report), out.docx);
  return true;
}

export function downloadDocumentPDF(no, ctx, report) {
  const parts = documentParts(no, ctx, report);
  if (!parts.length) { alert(`Document ${no} generator not available.`); return false; }
  // A document that copies a client workbook prints on that workbook's paper.
  const orientation = parts.every((p) => p.page === "portrait") ? "portrait" : undefined;
  downloadPDF(`${no} · ${DOC_META[no] || ""}`, parts, { orientation });
  return true;
}

/* A whole stage at once. `ctxFor` may be one context or a function of the
   document number — the full library mixes PO-stage and invoice-stage papers,
   and each has to be built from its own source. A document whose source does
   not exist yet is skipped rather than failing the batch. */
const resolveCtx = (ctxFor, no) => (typeof ctxFor === "function" ? ctxFor(no) : ctxFor);

function stageParts(numbers, ctxFor, report) {
  return numbers.flatMap((no) => {
    const ctx = resolveCtx(ctxFor, no);
    if (!ctx) return [];
    try { return documentParts(no, ctx, report); } catch (e) { return []; }
  });
}

/** The whole of a stage in one workbook — a sheet per document. */
export function downloadStageExcel(filename, numbers, ctxFor, report) {
  const parts = numbers.flatMap((no) => {
    const ctx = resolveCtx(ctxFor, no);
    if (!ctx) return [];
    let p = [];
    try { p = documentParts(no, ctx, report); } catch (e) { return []; }
    return p.map((x, i) => ({ ...x, name: `${no}${i || p.length > 1 ? ` ${x.name}` : ""}` }));
  });
  if (!parts.length) return false;
  downloadDocsExcel(filename, parts);
  return true;
}

export function downloadStagePDF(title, numbers, ctxFor, report) {
  const parts = stageParts(numbers, ctxFor, report);
  if (!parts.length) return false;
  downloadPDF(title, parts);
  return true;
}

/* Kept for the screens that offer a single one-click Excel grab. */
export const buildDocument = (no, ctx, report) => downloadDocumentExcel(no, ctx, report);

/** One supplier's copy of a split document (6 · PO, 10 · e-way, 11 · despatch). */
export function downloadSupplierDoc(no, ctx, supplierId, format = "excel") {
  const d = supplierSplitDocs(no, ctx).find((x) => x.supplierId === supplierId);
  if (!d) return false;
  const filename = `${d.docName}_${String(ctx.po || ctx.inv.invoiceNo || "").replace(/[^A-Za-z0-9]+/g, "-")}`;
  if (format === "pdf") downloadPDF(`${no} · ${DOC_META[no] || ""} · ${d.code}`, [{ html: d.html }], { orientation: "portrait" });
  else downloadDocsExcel(filename, [{ name: d.code, html: d.html, sheets: d.sheets }]);
  return true;
}

// Return the document's inner HTML (for an on-screen live preview) without downloading.
export function renderDocument(no, ctx, report) {
  let out;
  try {
    if (["36", "37", "38", "39"].includes(no) && report) out = buildBalanceReport(no, ctx, report);
    else if (B[no]) out = B[no](ctx);
  } catch (e) { return `<div class="sub">Preview unavailable: ${esc(e.message)}</div>`; }
  return out ? out.html : "";
}

// CSS for the on-screen preview — mirrors the workbook styling, scoped to .docprev so it
// never leaks onto the rest of the app's tables.
export const PREVIEW_CSS = `
  .docprev{font-family:Calibri,Arial,sans-serif;font-size:13px;color:#243b53;}
  .docprev table{border-collapse:collapse;margin-bottom:10px;width:auto;}
  .docprev td,.docprev th{border:1px solid #cdd8e3;padding:4px 8px;vertical-align:top;}
  .docprev th{background:var(--c-brand,#0b2c4d);color:#fff;font-weight:700;text-align:center;}
  .docprev .title{font-size:17px;font-weight:800;color:var(--c-navy,#0b2c4d);display:block;margin-bottom:4px;}
  .docprev .sub{font-size:11.5px;color:#627587;display:block;margin-bottom:8px;}
  .docprev .r{text-align:right;} .docprev .c{text-align:center;} .docprev .b{font-weight:700;}
  .docprev .lg{font-size:14px;font-weight:800;color:var(--c-navy,#0b2c4d);}
  .docprev .sec{background:#e9eff5;font-weight:700;color:var(--c-navy,#0b2c4d);}
  .docprev .tot{background:#fbe6c2;font-weight:800;color:#0b2c4d;}
  .docprev .k{background:#f2f5f8;font-weight:700;white-space:nowrap;color:var(--c-navy,#0b2c4d);}
  .docprev .amber{color:#B7791F;font-weight:700;}
  .docprev .plain td{border:none;padding:1px 8px;}
  .docprev p{font-size:12px;line-height:1.5;margin:6px 0;}

  /* 2 · Barcode and 3 · Packing are copies of the client's own workbooks, so on
     screen they keep those workbooks' look rather than the app's: Arial on a
     black hairline grid, codes in their green, barcodes and totals bold, the PO
     banner across the top and the header split over two lines — what the
     download opens as, cell for cell. */
  .docprev table.wb{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#000;}
  .docprev table.wb.fit{width:100%;max-width:760px;}
  /* Codes and figures are single tokens and never break; headings and
     descriptions wrap, so a long one grows its row rather than being cut. */
  .docprev table.wb td,.docprev table.wb th{border:1px solid #000;padding:4px 6px;height:26px;vertical-align:middle;white-space:normal;word-break:normal;}
  .docprev table.wb .gd,.docprev table.wb .gdc,.docprev table.wb .bh,
  .docprev table.wb .code,.docprev table.wb td.c,.docprev table.wb td.r{white-space:nowrap;}
  /* A line can carry half a dozen order numbers — they wrap rather than
     stretching the column, as they do in the sheet. */
  .docprev table.wb td.po{white-space:normal;text-align:center;max-width:190px;}
  .docprev table.wb th{background:#fff;color:#000;font-weight:700;text-align:center;}
  .docprev table.wb tr.po td{background:#fff;color:#000;font-weight:700;text-align:left;}
  .docprev table.wb tr.po.rule td{border-left:none;border-right:none;border-top:none;}
  .docprev table.wb tr.po td.red,.docprev table.wb th.red{color:#ff0000;}
  .docprev table.wb th.r{text-align:right;}
  .docprev table.wb .nb{border:none;}
  /* 12 · Boxes & volume bands its headings, labels and totals in the 25% grey
     its workbook uses, rather than leaving them white like the older sheets. */
  .docprev table.wb td.g,.docprev table.wb th.g,.docprev table.wb tr.g td{background:#bfbfbf;color:#000;}
  .docprev table.wb tr.hd2 th{height:20px;}
  .docprev table.wb tr.tot td{background:#fff;color:#000;font-weight:700;}
  .docprev table.wb tr.tot td.o{border-left:none;border-right:none;}
  .docprev table.wb .gd{color:#339966;font-weight:700;}
  .docprev table.wb .gdc{color:#339966;font-weight:700;text-align:center;}
  .docprev table.wb .bh{font-weight:700;text-align:center;}
  .docprev table.wb .code{font-weight:700;text-align:center;}
  .docprev table.wb .desc{white-space:normal;}

  /* 20 · the item-wise packing details — the four tabs behind the packing list.
     Arial 10 on a black grid, as their sheets are: the exporter's own codes in
     their green, the buyer's part numbers plain, a band's name ranged left
     across the identity columns, and the orders ruled off along the top. */
  .docprev .dth{font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;
    letter-spacing:.06em;color:#000;margin:0 0 4px;}
  .docprev table.wb.dt{font-size:11px;}
  .docprev table.wb.dt td,.docprev table.wb.dt th{padding:2px 5px;height:22px;vertical-align:middle;}
  .docprev table.wb.dt th{white-space:normal;}
  .docprev table.wb.dt th.l{text-align:left;}
  .docprev table.wb.dt .gd,.docprev table.wb.dt .code{text-align:left;}
  .docprev table.wb.dt .gd{color:#008000;}
  .docprev table.wb.dt td.desc{white-space:normal;text-align:left;}
  .docprev table.wb.dt tr.bnd td{font-weight:700;font-size:12px;}
  .docprev table.wb.dt tr.tot td.o{border-bottom:none;}

  /* The two customs books (19, 20) are typed in colour, and it means something:
     the form's own labels are blue, the answers customs reads straight off the
     head of it are red, and the line it is signed for is blue. Their cells
     shrink rather than wrap, so a long entry stays on its one ruled line. */
  .docprev table.ci.pl .lb{color:#00f;}
  .docprev table.ci.pl .rd,.docprev table.ci.pl .ttl{color:#f00;}
  .docprev table.ci.pl .sg{color:#00f;}
  .docprev table.ci.pl .hc{font-size:8px;}
  /* 17 · Proforma is the buyer's own purchase order form: their name across the
     top, the two address boxes under it, and the goods banded by range. */
  .docprev table.bpo .big{font-size:16px;font-weight:700;color:#000;}
  /* Both parties are set bold and in capitals on their form — it is the one
     thing on the page a warehouse reads across the room — whatever case the
     master itself keeps the name and address in. */
  /* Their paper is set tighter than the rest of the library — a small body
     under their name at full size. The preview keeps the same proportions as
     the print, a shade larger so it stays readable on screen. */
  /* The width has to be a definite length, not 100%. The preview paper sizes
     itself to max-content (see .docprev-paper — a wide sheet makes the paper as
     wide as it needs to be and the shell scrolls to it), so a percentage here
     has no definite basis to resolve against and computes to auto; and under a
     fixed table layout the cells never get to size the columns from their own
     content. All eight collapsed, and every cell narrower than the full span
     printed blank. 760px is the width .wb.fit gives a portrait sheet. */
  .docprev table.bpo{table-layout:fixed;width:760px;}
  /* The order runs to a sheet per page (see doc17.js) — on screen they stack,
     so a rule between them shows where the paper would change. */
  .docprev .bpo-page+.bpo-page{border-top:1px dashed #cdd8e3;padding-top:18px;margin-top:6px;}
  .docprev table.bpo .pg{font-size:9.5px;}
  .docprev table.bpo td,.docprev table.bpo th{font-size:10px;padding:0 5px;line-height:1.3;}
  .docprev table.bpo .big{font-size:20px;font-weight:700;color:#000;}
  .docprev table.bpo .tag{font-size:14px;}
  .docprev table.bpo .ttl{font-size:11.5px;}
  .docprev table.bpo .val{font-size:12px;}
  .docprev table.bpo .foot{font-size:8px;letter-spacing:.1px;}
  /* The freight terms and the line the order is signed for stand side by side.
     Both are set to the top of the run — the rest of the sheet centres in its
     row — so the name sits level with the top of the freight box and the space
     under it is left clear to stamp and sign in. */
  .docprev table.bpo tr.sig td{vertical-align:top;}
  .docprev table.bpo .sign{font-size:9.5px;padding-top:2px;}
  /* The contact strip is small print set close, not on the 26px row the goods
     above it are ruled to — four lines that read as one block. */
  .docprev table.bpo tr.ft td{height:auto;padding:0 5px;line-height:1.5;}
  .docprev table.bpo .party{text-align:left;vertical-align:top;white-space:normal;font-weight:700;text-transform:uppercase;padding:4px 6px;}
  .docprev table.bpo td.nb,.docprev table.bpo th.nb{border:none;}
  /* The mark above their name, uploaded on the buyer master — held to the
     name's own width below it so the two sit centred on one another. */
  .docprev table.bpo .bpo-logo{height:62px;width:auto;display:block;margin:0 auto 1px;}
  /* Ruled down the columns but not across, as their goods are. */
  .docprev table.bpo tr.ln td{border-top:none;border-bottom:none;}
  /* A run of the form that is one unbroken box: the cell gives up its padding
     to the table inside it, and that table draws no rules of its own. */
  .docprev table.bpo td.bx{padding:0;}
  .docprev table.bpo table.in{width:100%;table-layout:fixed;border-collapse:collapse;margin:0;}
  .docprev table.bpo table.in td{border:none;padding:1px 6px;font-size:10px;}

  /* 18 · Custom invoice is the customs copy, and their file rules it as one
     frame rather than as a grid of boxes: solid down the eleven columns,
     hairline between the goods, and open everywhere the form is just typing.
     So the cells start with no rule at all and each names the edges it draws —
     the opposite way round from the workbook sheets above, which are grids. */
  .docprev table.ci{table-layout:fixed;width:820px;font-family:Arial,Helvetica,sans-serif;}
  /* Their form is typed on plain paper: no cell on it is banded or coloured,
     so the app's own key/value tints are cleared rather than inherited. */
  .docprev table.ci td{border:none;font-size:9px;line-height:1.3;padding:0 3px;height:14px;
    white-space:nowrap;overflow:hidden;text-overflow:clip;vertical-align:middle;
    color:#000;background:none;}
  .docprev table.ci .lt{border-left:1px solid #000;border-top:1px solid #000;}
  .docprev table.ci .rt{border-right:1px solid #000;border-top:1px solid #000;}
  .docprev table.ci .lf{border-left:1px solid #000;}
  .docprev table.ci .rt0{border-right:1px solid #000;}
  .docprev table.ci .lrt{border-left:1px solid #000;border-right:1px solid #000;border-top:1px solid #000;}
  .docprev table.ci .lrb{border-left:1px solid #000;border-right:1px solid #000;border-bottom:1px solid #000;}
  .docprev table.ci .lt0{border-top:1px solid #000;}
  .docprev table.ci .bb{border-bottom:1px solid #000;}
  .docprev table.ci .bx,.docprev table.ci .h,.docprev table.ci .bnd,.docprev table.ci .hd{border:1px solid #000;}
  /* Only the form's own column headings are set in bold: a band's heading and
     the columns under it are typed in the same plain face as the goods. */
  .docprev table.ci .k,.docprev table.ci .b,.docprev table.ci .h{font-weight:700;}
  .docprev table.ci .bnd,.docprev table.ci .hd{font-weight:400;}
  .docprev table.ci .h,.docprev table.ci .hd{text-align:center;}
  .docprev table.ci .c{text-align:center;}
  .docprev table.ci .l{text-align:left;}
  .docprev table.ci .r{text-align:right;}
  .docprev table.ci .dbl{border-bottom:3px double #000;}
  .docprev table.ci .mer{font-weight:700;text-decoration:underline;}
  .docprev table.ci .ttl{font-weight:700;text-align:center;}
  .docprev table.ci .nb{border:none;}
  .docprev table.ci .brand{font-family:Centaur,Georgia,serif;font-size:18px;font-weight:700;text-align:right;
    vertical-align:middle;}
  /* The letterhead: the mark against the left margin with the name and the
     address ranged right of it, as the sheet anchors the picture over the
     corner of the form. This one cell wraps where the rest of the table does
     not — it is five typed lines, not one ruled row. */
  .docprev table.ci .lhead{vertical-align:top;padding:1px 4px 1px 2px;white-space:normal;overflow:visible;height:auto;}
  .docprev table.ci .lhead .pllogo{float:left;width:56px;height:auto;margin:1px 4px 0 0;}
  .docprev table.ci .lhead .brand{display:block;line-height:1.05;}
  .docprev table.ci .lhead .sub,.docprev table.ci .lhead .addr{
    display:block;text-align:right;font-size:9px;line-height:1.3;margin:0;color:#000;background:none;}
  /* The goods: every line keeps the columns, and only the lines between items
     are ruled — faintly, so a band reads as one block. */
  .docprev table.ci tr.gd td,.docprev table.ci tr.ln td{border-left:1px solid #000;border-right:1px solid #000;}
  .docprev table.ci tr.ln td{border-top:1px solid #d9d9d9;border-bottom:1px solid #d9d9d9;}
  .docprev table.ci tr.gd td:first-child,.docprev table.ci tr.ln td:first-child{border-top:none;border-bottom:none;}
  .docprev table.ci tr.gd .bnd,.docprev table.ci tr.gd .h,.docprev table.ci tr.gd .hd{border:1px solid #000;}
  .docprev table.ci tr.tt td{border-left:1px solid #000;border-right:1px solid #000;border-bottom:1px solid #000;}
  /* The three figures the page carries forward are closed with a double rule,
     as an added column is on their paper. */
  .docprev table.ci tr.tt .dbl{border-top:1px solid #000;border-bottom:3px double #000;}
  /* The annexure is the one sheet of the three not typed on the form: plain
     Calibri, with the printed letterhead pasted across the head of it — the
     name in red over the address in blue, its numbers in red — and the mark in
     a box of its own beside them. */
  .docprev table.ci.annx{width:640px;}
  .docprev table.ci.annx td{height:16px;font-size:10px;font-family:Calibri,Carlito,Arial,sans-serif;padding:0 4px;}
  .docprev table.ci.annx tr.ln td,.docprev table.ci.annx tr.ln td:first-child{
    border-left:1px solid #000;border-right:1px solid #000;
    border-top:1px solid #d9d9d9;border-bottom:1px solid #d9d9d9;}
  .docprev table.ci.annx .attl{text-align:center;}
  .docprev table.ci.annx .alh{vertical-align:top;padding:3px 5px;white-space:normal;height:auto;}
  .docprev table.ci.annx .amark{text-align:center;vertical-align:middle;}
  .docprev table.ci.annx .amark .pllogo{width:64px;height:auto;}
  .docprev table.ci.annx .brand{font-family:Centaur,Georgia,serif;font-size:21px;font-weight:400;color:#f00;
    text-align:right;line-height:1.15;letter-spacing:2px;}
  .docprev table.ci.annx .sub,.docprev table.ci.annx .addr{
    display:block;text-align:right;font-size:10px;line-height:1.3;margin:0;color:#000;}
  .docprev table.ci.annx .lb{color:#00f;}
  .docprev table.ci.annx .rd{color:#f00;}
  /* A band's name is wider than the two columns it is typed across — their
     sheet shrinks it to fit rather than widening the form, so it is set a
     little smaller here for the same reason. */
  .docprev table.ci.annx .bnl{font-size:7.8px;}

  /* 6 · Suppliers' PO is a letter, not a table: the exporter's name in Centaur
     maroon, the form's labels in blue, the title in red, and the whole page
     inside one frame — as the workbook's Page1 prints it. */
  .docprev table.wb.letter{width:100%;max-width:960px;table-layout:fixed;border:1px solid #000;}
  .docprev table.wb.letter td,.docprev table.wb.letter th{border:none;height:auto;padding:2px 6px;white-space:normal;}
  .docprev table.wb.letter th{border:1px solid #000;background:#fff;color:#000;}
  .docprev table.wb.letter .ttl{color:#f00;font-weight:700;text-align:center;border-bottom:1px solid #000;}
  .docprev table.wb.letter .brand{font-family:Centaur,Georgia,serif;font-size:22px;font-weight:700;color:#800000;text-align:right;vertical-align:top;}
  .docprev table.wb.letter .logo{float:left;width:62px;height:auto;margin:2px 0 0 2px;}
  .docprev table.wb.letter td.sub{display:table-cell;color:#800000;text-align:right;font-size:12px;margin:0;}
  .docprev table.wb.letter .addr{color:#3366ff;text-align:right;}
  .docprev table.wb.letter .lbl{color:#00f;font-weight:700;}
  .docprev table.wb.letter .gst{color:#00f;font-weight:700;text-align:center;vertical-align:top;}
  .docprev table.wb.letter .val,.docprev table.wb.letter .party{color:#000;}
  .docprev table.wb.letter tr.band td{font-weight:700;}
  .docprev table.wb.letter .u{text-decoration:underline;}
  .docprev table.wb.letter .bx{border:1px solid #000;}
  .docprev table.wb.letter .sgn{color:#3366ff;}
  .docprev table.wb.letter tr.sign td{height:52px;}
  .docprev table.wb.letter .buyer{color:#f00;text-decoration:underline;}
  .docprev table.wb.letter tr td.l,.docprev table.wb.letter tr.band td{border-top:1px solid #000;border-bottom:1px solid #000;}
  .docprev .pgbrk{margin-top:18px;}

  /* 10 · E-way bill — the portal's own entry form, boxes and all, so it can be
     keyed in field by field. Grey text is what the operator still has to fill. */
  .docprev .ew{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#000;max-width:1000px;}
  .docprev .ew table{border-collapse:collapse;width:100%;margin:0 0 4px;}
  .docprev .ew td{border:none;padding:2px 5px;vertical-align:middle;}
  .docprev .ew .lbl{color:#000;font-weight:400;white-space:nowrap;background:none;}
  .docprev .ew .hd{font-weight:400;padding-top:8px;}
  .docprev .ew .fld{border:1px solid #000;}
  .docprev .ew .ph{color:#9aa3ad;}
  .docprev .ew .b{font-weight:700;}
  .docprev .ew .c{text-align:center;}
  .docprev .ew .i{font-style:italic;text-align:center;}
  .docprev .ew .on{font-weight:700;font-style:normal;}
  .docprev .ew .ewtop td{padding-bottom:10px;}
  .docprev .ew .ewband td{border:1px solid #000;border-left:none;border-right:none;padding:6px 5px;}
  .docprev .ew .ewband td:first-child{border-left:1px solid #000;}
  .docprev .ew .ewband td:last-child{border-right:1px solid #000;}
  .docprev .ew .ewitems .hd td,.docprev .ew .ewtot .hd td{text-align:center;border:none;}
  .docprev .ew .ewgrid .gap td{height:14px;}
  .docprev .ew .ewpart{width:auto;margin-left:120px;}
  .docprev .ew .ewpart .lbl{padding-right:12px;}
  .docprev .ew .ewline .fld{min-width:120px;}

  /* 13 · Export value declaration — the customs form as it is typed: Times,
     centred heading, and a box against every option so the ticked one reads
     unambiguously. */
  /* A fixed table layout needs a width it can divide, and the paper around it
     is only as wide as its content — so the form states its own. */
  .docprev .evd{font-family:"Times New Roman",Times,serif;font-size:14px;color:#000;width:760px;}
  .docprev .evd table{border-collapse:collapse;width:100%;table-layout:fixed;}
  .docprev .evd td{border:none;padding:1px 3px;vertical-align:middle;white-space:nowrap;}
  .docprev .evd .ttl{text-align:center;}
  .docprev .evd .c{text-align:center;}
  .docprev .evd .u{text-decoration:underline;}
  .docprev .evd .w{white-space:normal;vertical-align:top;}
  .docprev .evd .nt{vertical-align:top;}
  .docprev .evd .bx{border:1px solid #000;text-align:center;font-weight:700;}
  .docprev .evd tr.gap td{height:10px;}

  /* 21 and 33 · the packing declaration — a typed form on the letterhead, its
     ten columns ruled only where their sheet rules them: a box against each
     answer and a line running along the question that leads to it.

     Their sheet at one scale throughout — a point of it is --pkdpt across, so
     the ten columns, the 12.75pt rows and the Arial 10 they are typed in all
     keep the proportions the worksheet has. Sized any other way the preview is
     the same form squashed: rows too shallow for their width, and the page
     reading tighter than the sheet it is a copy of. */
  .docprev .pkd{--pkdpt:1.515px;--pkdrow:calc(var(--pkdpt) * 12.75);
    font-family:Arial,Helvetica,sans-serif;font-size:calc(var(--pkdpt) * 10);
    color:#000;width:calc(var(--pkdpt) * 501.6);}
  .docprev .pkd table{border-collapse:collapse;width:100%;table-layout:fixed;}
  .docprev .pkd td{border:none;padding:0 2px;height:var(--pkdrow);vertical-align:middle;
    white-space:nowrap;color:#000;background:none;}
  .docprev .pkd .ttl{font-size:calc(var(--pkdpt) * 14);font-weight:700;text-align:center;}
  .docprev .pkd .b{font-weight:700;}
  .docprev .pkd .c{text-align:center;}
  .docprev .pkd .bx{border:1px solid #000;text-align:center;font-weight:700;}
  /* A question is ruled along to the box that answers it. */
  .docprev .pkd .lead{border-right:1px solid #000;}
  /* The letterhead: the eight rows their sheet floats it over, and the printed
     block and the mark placed on them where the sheet's own anchors put the two
     — neither stretched to a column edge. */
  .docprev .pkd .lh{padding:0;height:auto;border:none;}
  .docprev .pkd .lhbox{position:relative;height:calc(var(--pkdrow) * 8);}
  .docprev .pkd .lhbox img,.docprev .pkd .lhbx{position:absolute;}
  .docprev .pkd .lhaddr{height:auto;}
  .docprev .pkd .lhbx{border:1px solid #000;box-sizing:border-box;}

  /* 22 · Letter to the CHA — their ruled instruction form, at their own scale:
     a point of their sheet is --chapt across, so the eleven columns, the 12pt
     rows and the Arial 9 it is typed in all keep the worksheet's proportions.
     Their sheet is 629pt across and is stepped down to fit the paper, type and
     all; --chapt does the same stepping here. */
  .docprev .cha{--chapt:1.332px;--charow:calc(var(--chapt) * 12);
    font-family:Arial,Helvetica,sans-serif;font-size:calc(var(--chapt) * 9);
    color:#000;width:calc(var(--chapt) * 629);}
  .docprev .cha table{border-collapse:collapse;width:100%;table-layout:fixed;}
  /* Their form spaces two lines out with runs of spaces rather than with a
     column of their own, so the runs are kept rather than collapsed. */
  .docprev .cha td{border:none;padding:0 2px;height:var(--charow);line-height:1.1;
    vertical-align:bottom;white-space:pre;overflow:hidden;color:#000;background:none;}
  /* Every rule on the form is a cell edge, as it is on their sheet. */
  .docprev .cha .el{border-left:1px solid #000;}
  .docprev .cha .er{border-right:1px solid #000;}
  .docprev .cha .et{border-top:1px solid #000;}
  .docprev .cha .eb{border-bottom:1px solid #000;}
  .docprev .cha .fb{font-weight:700;}
  .docprev .cha .fx{font-size:calc(var(--chapt) * 18);font-weight:700;}
  .docprev .cha .fm{vertical-align:middle;}
  .docprev .cha .fc{text-align:center;}
  .docprev .cha .fr{text-align:right;}
  .docprev .cha .fl{text-align:left;}

  /* 23 · Suppliers' details — their banded list, at their own scale: a point of
     their sheet is --suppt across, so the eight columns, the 15pt rows and the
     Calibri 11 the list is typed in keep the worksheet's proportions. Their
     sheet is 802pt across and is fitted to the width of the paper, type and
     all; --suppt does the same stepping here. */
  .docprev .sup{--suppt:1.06px;--suprow:calc(var(--suppt) * 15);--suplh:calc(var(--suppt) * 19.5);
    font-family:Calibri,Carlito,Arial,sans-serif;font-size:calc(var(--suppt) * 11);
    color:#000;width:calc(var(--suppt) * 802);}
  .docprev .sup table{border-collapse:collapse;width:100%;table-layout:fixed;}
  .docprev .sup td{border:none;padding:0 calc(var(--suppt) * 2.5);height:var(--suprow);line-height:1.15;
    vertical-align:bottom;white-space:nowrap;overflow:hidden;color:#000;background:none;}
  .docprev .sup .el{border-left:1px solid #000;}
  .docprev .sup .er{border-right:1px solid #000;}
  .docprev .sup .et{border-top:1px solid #000;}
  .docprev .sup .eb{border-bottom:1px solid #000;}
  .docprev .sup .fb{font-weight:700;}
  /* Their sheet shrinks the longest family name into the two columns it is
     typed across rather than widening them; on the page it is set smaller by
     the same amount. */
  .docprev .sup .fs{font-size:80%;}
  .docprev .sup .fv{overflow:visible;}
  .docprev .sup .fc{text-align:center;}
  .docprev .sup .fr{text-align:right;}
  .docprev .sup .fl{text-align:left;}
  /* The letterhead over the seven rows their sheet floats it over — the same
     block the packing declaration carries, placed the same way. */
  .docprev .sup .lh{padding:0;height:auto;border:none;}
  .docprev .sup .lhbox{position:relative;height:calc(var(--suplh) * 7);}
  .docprev .sup .lhbox img,.docprev .sup .lhbx{position:absolute;}
  .docprev .sup .lhaddr{height:auto;}
  .docprev .sup .lhbx{border:1px solid #000;box-sizing:border-box;}

  /* 24 · Annexure to the bill of lading — a typed sheet, not a worksheet: their
     Calibri 12 at its own size, over the three columns their tables are typed
     across. Their tables are ruled the way Word rules them — dotted between one
     line and the next, solid down between the columns, solid under the last. */
  .docprev .bla{--blapt:1.5px;font-family:Calibri,Carlito,Arial,sans-serif;
    font-size:calc(var(--blapt) * 12);line-height:1.32;color:#000;
    width:calc(var(--blapt) * 401.4);}
  .docprev .bla table{border-collapse:collapse;width:100%;table-layout:fixed;}
  .docprev .bla td{border:none;padding:0 calc(var(--blapt) * 3);vertical-align:bottom;
    text-align:left;color:#000;background:none;}
  .docprev .bla td.p{white-space:pre;padding-left:0;}
  .docprev .bla .ttl{font-weight:700;text-align:center;}
  .docprev .bla .mid{text-align:center;}
  .docprev .bla .hd{font-weight:700;text-decoration:underline;}
  .docprev .bla td.c{border-bottom:1px dotted #000;border-right:1px solid #000;}
  .docprev .bla td.c:last-child{border-right:none;}
  .docprev .bla td.last{border-bottom:1px solid #000;}

  /* 26 · Shipping instructions — the line's booking form, at their own scale: a
     point of their sheet is --sipt across, so the four columns, the 12.75pt
     rows and the Arial 10 it is typed in keep the worksheet's proportions. The
     form is printed on a grey ground with the boxes that carry a figure left
     white, which is how their file is set. */
  .docprev .si{--sipt:1.15px;--sirow:calc(var(--sipt) * 12.75);
    font-family:Calibri,Carlito,Arial,sans-serif;font-size:calc(var(--sipt) * 10);
    line-height:1.2;color:#000;width:calc(var(--sipt) * 574);}
  .docprev .si table{border-collapse:collapse;width:100%;table-layout:fixed;}
  .docprev .si td{border:none;padding:0 calc(var(--sipt) * 2);height:var(--sirow);
    vertical-align:bottom;white-space:nowrap;overflow:hidden;color:#000;background:none;}
  .docprev .si .el{border-left:1px solid #000;}
  .docprev .si .er{border-right:1px solid #000;}
  .docprev .si .et{border-top:1px solid #000;}
  .docprev .si .eb{border-bottom:1px solid #000;}
  .docprev .si .fb{font-weight:700;}
  .docprev .si .fc{text-align:center;}
  .docprev .si .fg{background:#c0c0c0;}
  /* A box typed down rather than across — the parties, the marks, the cargo. */
  .docprev .si .fw{white-space:pre-wrap;vertical-align:top;}

  /* 27 · Declaration of verified gross mass — the same letter paper as the
     customs declarations, with the fifteen particulars ruled into three. */
  .docprev .vgm .vgmt{margin:10px 0 14px;}
  .docprev .vgm .vgmt td{border:1px solid #000;padding:2px 5px;white-space:normal;
    vertical-align:middle;}
  .docprev .vgm .vgmt .sr{width:6%;}
  .docprev .vgm .vgmt .ask{width:50%;}
  .docprev .vgm .vgmt .ans{width:44%;white-space:pre-line;}
  .docprev .vgm .u{text-decoration:underline;}
  .docprev .vgm .nb{margin:0;}
  .docprev .vgm .sg{width:100%;margin:0 0 10px;}
  .docprev .vgm .sg>tbody>tr>td:first-child{width:52%;}
  .docprev .vgm .sg .k{min-width:96px;}
  .docprev .vgm .sgr{text-align:right;vertical-align:top;}
  /* The scanned letterhead across the head of it, and the stamp and signature
     it goes out under — the same three pictures the printed sheet carries. */
  .docprev .vgm .vghimg{width:74%;height:auto;display:block;}
  .docprev .vgm .sg .sgst{width:20%;text-align:center;vertical-align:middle;}
  .docprev .vgm .vgstamp{width:78px;height:auto;}
  .docprev .vgm .vgsign{width:186px;height:auto;display:block;margin-left:auto;}

  /* 34 · Container weight declaration — their forwarder's typed form, on no
     letterhead, so it previews as their file sets it. */
  .docprev .cwd{font-family:Calibri,Arial,sans-serif;font-size:13px;color:#000;line-height:1.2;}
  .docprev .cwd .ttl{font-size:23px;font-weight:700;text-align:center;margin:0 0 16px;}
  .docprev .cwd table.cwt{width:100%;border-collapse:collapse;margin:0 0 12px;table-layout:fixed;}
  .docprev .cwd table.cwt td{border:1px solid #000;padding:3px 6px;vertical-align:top;font-size:13px;word-break:break-word;}
  .docprev .cwd .k{font-weight:700;background:none;color:#000;white-space:normal;}
  .docprev .cwd .hd .gap td{border:none;height:9px;padding:0;}
  .docprev .cwd .hint{font-size:10px;font-weight:700;text-decoration:underline;}
  .docprev .cwd .b{font-weight:700;}
  .docprev .cwd .bl,.docprev .cwd .note{color:#0070C0;}
  .docprev .cwd .note{font-weight:700;text-align:center;vertical-align:middle;}
  .docprev .cwd .hint.bl{text-decoration:none;font-size:11px;}
  .docprev .cwd .opt{text-align:center;vertical-align:middle;}
  .docprev .cwd .opt.on span{border:1.2px solid #000;border-radius:50%;display:block;width:94%;margin:0 auto;padding:1px 0;}
  .docprev .cwd .oth{vertical-align:top;}
  .docprev .cwd .spec{font-size:8px;}
  .docprev .cwd .cmd{font-size:12px;vertical-align:middle;}
  .docprev .cwd .wh,.docprev .cwd .wv{text-align:center;vertical-align:middle;font-size:12px;}
  .docprev .cwd table.ld,.docprev .cwd table.sg{width:67%;}
  .docprev .cwd .lb{position:relative;height:70px;}
  .docprev .cwd .dr{position:absolute;top:3px;right:5px;font-size:10px;line-height:1.1;text-align:center;}
  .docprev .cwd .xm{display:block;width:44px;height:44px;margin:7px auto 0;}
  .docprev .cwd .xm line{stroke:#000;stroke-width:1.2;}
  .docprev .cwd table.mth{width:100%;border-collapse:collapse;margin:0 0 12px;table-layout:fixed;}
  .docprev .cwd table.mth td{border:none;padding:0 5px 0 0;vertical-align:top;font-size:12px;}
  .docprev .cwd .ml1{width:26%;font-size:11px;}
  .docprev .cwd .ml{width:32%;}
  .docprev .cwd .sk{width:12%;text-align:center;vertical-align:middle;}
  .docprev .cwd .sn{width:30%;text-align:right;vertical-align:middle;}
  .docprev .cwd .ml .opt{text-align:left;padding:0;white-space:nowrap;}
  .docprev .cwd .ml .opt.on span{display:inline-block;width:auto;padding:0 12px;}
  .docprev .cwd .cwstamp{width:78px;height:auto;}
  .docprev .cwd .cwsign{width:190px;height:auto;}
  .docprev .cwd p{margin:0 0 5px;font-size:13px;}
  .docprev .cwd .re{margin-top:12px;}
  .docprev .cwd .sg td{height:28px;font-size:12px;}
  .docprev .cwd .ul{border-bottom:1px solid #000;display:inline-block;min-width:88%;}
  .docprev .cwd .rule{border-bottom:1px solid #000;display:inline-block;width:62%;margin-left:4px;}
  .docprev .cwd .du{border-bottom:1px solid #000;display:inline-block;padding:0 3px;}
  .docprev .cwd .nt{font-size:9px;margin:0 0 3px;line-height:1.3;}
  .docprev .cwd .hd2{font-size:10px;margin-top:10px;}
  .docprev .cwd .cl{margin-top:12px;font-size:12px;}

  /* 29 · E-way bill, export leg — the portal's printed bill: five numbered
     sections in ruled boxes, at the size the portal prints them. */
  .docprev .ewx{--ewpt:1.25px;font-family:Arial,Helvetica,sans-serif;
    font-size:calc(var(--ewpt) * 9);line-height:1.25;color:#000;width:calc(var(--ewpt) * 520);}
  .docprev .ewx table{border-collapse:collapse;width:100%;table-layout:fixed;}
  .docprev .ewx td{border:none;padding:2px 4px;vertical-align:middle;
    white-space:nowrap;overflow:hidden;color:#000;background:none;}
  .docprev .ewx .el{border-left:1px solid #999;}
  .docprev .ewx .er{border-right:1px solid #999;}
  .docprev .ewx .et{border-top:1px solid #999;}
  .docprev .ewx .eb{border-bottom:1px solid #999;}
  .docprev .ewx .fb{font-weight:700;}
  .docprev .ewx .ft{font-size:calc(var(--ewpt) * 15);font-weight:700;padding:6px 0;}
  .docprev .ewx .fc{text-align:center;}
  .docprev .ewx .fr{text-align:right;}
  .docprev .ewx .fw{white-space:normal;vertical-align:top;}

  /* 28 · Cost sheets — their grey form, one per factory, on the letterhead. */
  .docprev .cs{--cspt:1.05px;--csrow:calc(var(--cspt) * 15);
    font-family:Calibri,Carlito,Arial,sans-serif;font-size:calc(var(--cspt) * 11);
    line-height:1.2;color:#000;width:calc(var(--cspt) * 613);margin-bottom:14px;}
  .docprev .cs table{border-collapse:collapse;width:100%;table-layout:fixed;}
  .docprev .cs td{border:none;padding:0 calc(var(--cspt) * 2);height:var(--csrow);
    vertical-align:middle;white-space:nowrap;overflow:hidden;color:#000;background:none;}
  .docprev .cs .el{border-left:1px solid #000;}
  .docprev .cs .er{border-right:1px solid #000;}
  .docprev .cs .et{border-top:1px solid #000;}
  .docprev .cs .eb{border-bottom:1px solid #000;}
  .docprev .cs .fb{font-weight:700;}
  .docprev .cs .fc{text-align:center;}
  .docprev .cs .fr{text-align:right;}
  .docprev .cs .fg{background:#c0c0c0;}
  .docprev .cs .fw{white-space:normal;vertical-align:top;}
  .docprev .cs .lh{padding:0;height:auto;border:none;}
  .docprev .cs .lhbox{position:relative;height:calc(var(--csrow) * 7);}
  .docprev .cs .lhbox img,.docprev .cs .lhbx{position:absolute;}
  .docprev .cs .lhaddr{height:auto;}
  .docprev .cs .lhbx{border:1px solid #000;box-sizing:border-box;}

  /* 30 · Letter to the buyer — their letterhead, the letter, and the client's
     own signature and stamp at the foot of it. */
  .docprev .ltb{--ltbpt:1.45px;--ltbrow:calc(var(--ltbpt) * 15);
    font-family:Arial,Helvetica,sans-serif;font-size:calc(var(--ltbpt) * 10);
    line-height:1.25;color:#000;width:calc(var(--ltbpt) * 679);}
  .docprev .ltb table{border-collapse:collapse;width:100%;table-layout:fixed;}
  .docprev .ltb td{border:none;padding:0 calc(var(--ltbpt) * 2);height:var(--ltbrow);
    vertical-align:middle;white-space:nowrap;overflow:visible;color:#000;background:none;}
  .docprev .ltb .et{border-top:1px solid #000;}
  .docprev .ltb .eb{border-bottom:1px solid #000;}
  .docprev .ltb .fb{font-weight:700;}
  .docprev .ltb .fc{text-align:center;}
  .docprev .ltb .fl{text-align:left;}
  .docprev .ltb .lh{padding:0;height:auto;border:none;}
  .docprev .ltb .lhbox{position:relative;height:calc(var(--ltbrow) * 7);}
  .docprev .ltb .lhbox img,.docprev .ltb .lhbx{position:absolute;}
  .docprev .ltb .lhaddr{height:auto;}
  .docprev .ltb .lhbx{border:1px solid #000;box-sizing:border-box;}
  /* The two scans stand side by side on the rows left clear for them. */
  .docprev .ltb .sgbox{padding:calc(var(--ltbpt) * 4) 0 0;height:auto;white-space:nowrap;}
  .docprev .ltb .sgsign,.docprev .ltb .sgstamp{display:inline-block;height:auto;vertical-align:top;}
  .docprev .ltb .sgstamp{margin-left:calc(var(--ltbpt) * 18);}

  /* 31 · Commercial invoice — the customs book's frame without its rupee half,
     so the description runs across the columns those took. */
  .docprev .ci31 .bnd{border:1px solid #000 !important;font-weight:700;}
  .docprev .ci31 .dbl{border-top:1px solid #000 !important;border-bottom:3px double #000 !important;}
  .docprev .ci31 .mer{font-weight:700;text-decoration:underline;}

  /* 32 · the buyer's copy of the packing list is signed and stamped where the
     customs copy leaves the space blank. */
  .docprev .pl .sgbox{text-align:left;vertical-align:middle;padding:2px 5px;}
  .docprev .pl .sgstamp{text-align:center;vertical-align:middle;padding:2px;}
  .docprev .pl .plsign{max-width:82%;width:auto;height:auto;vertical-align:middle;}
  .docprev .pl .plstamp{max-width:88%;width:auto;height:auto;vertical-align:middle;}

  /* 40 · Export bill regularisation — the letter to the bank, on the
     declaration's own paper: their ten columns, the 12.75pt rows and the Arial
     10 it is typed in, with the ruled blocks under it. */
  .docprev .ebr{--ebrpt:1.42px;--ebrrow:calc(var(--ebrpt) * 12.75);
    font-family:Arial,Helvetica,sans-serif;font-size:calc(var(--ebrpt) * 10);
    line-height:1.25;color:#000;width:calc(var(--ebrpt) * 501.6);}
  .docprev .ebr table{border-collapse:collapse;width:100%;table-layout:fixed;}
  /* Each line is already broken where their file breaks it, so it runs on over
     the white beside it rather than being re-wrapped, as it does on the sheet.
     Only the boxes that ask for it wrap. */
  .docprev .ebr td{border:none;padding:1px 3px;height:var(--ebrrow);vertical-align:middle;
    white-space:pre;overflow:visible;color:#000;background:none;}
  .docprev .ebr .fw{white-space:pre-line;overflow:hidden;}
  .docprev .ebr .el{border-left:1px solid #000;}
  .docprev .ebr .er{border-right:1px solid #000;}
  .docprev .ebr .et{border-top:1px solid #000;}
  .docprev .ebr .eb{border-bottom:1px solid #000;}
  .docprev .ebr .fj{font-family:Calibri,Carlito,Arial,sans-serif;font-size:calc(var(--ebrpt) * 11);
    text-align:justify;}
  .docprev .ebr .fb{font-weight:700;}
  .docprev .ebr .fc{text-align:center;}
  .docprev .ebr .fr{text-align:right;}
  /* The declarations at the end are typed in Calibri, as their file types them. */
  .docprev .ebr .lh{padding:0;height:auto;border:none;}
  .docprev .ebr .lhbox{position:relative;height:calc(var(--ebrrow) * 8);}
  .docprev .ebr .lhbox img,.docprev .ebr .lhbx{position:absolute;}
  .docprev .ebr .lhaddr{height:auto;}
  .docprev .ebr .lhbx{border:1px solid #000;box-sizing:border-box;}

  /* 11 · Despatch instructions — the letter, on the letterhead. */
  .docprev .dl{font-family:Calibri,Arial,sans-serif;font-size:13px;color:#000;max-width:820px;line-height:1.45;}
  .docprev .dl table{border-collapse:collapse;width:100%;margin:0;}
  .docprev .dl td{border:none;padding:0;vertical-align:top;}
  .docprev .dl .ins td,.docprev .dl table.fld td,.docprev .dl table.bx td{font-size:13px;}
  .docprev .dl .brand{font-family:Centaur,Georgia,serif;font-size:44px;font-weight:700;color:#8b0000;letter-spacing:1px;line-height:1;}
  .docprev .dl .sub{font-family:Centaur,Georgia,serif;font-size:17px;color:#8b0000;letter-spacing:2px;padding-left:60px;}
  .docprev .dl .lg{width:120px;text-align:right;}
  .docprev .dl .lg img{width:104px;height:auto;}
  .docprev .dl .rule{border-top:1px solid #c00;margin:8px 0 14px;}
  .docprev .dl .ref{margin-bottom:16px;}
  .docprev .dl p{margin:0 0 12px;font-size:13px;}
  .docprev .dl .to{margin-bottom:16px;}
  .docprev .dl .refline .k{display:inline-block;min-width:34px;}
  .docprev .dl .k{background:none;color:#000;font-weight:400;white-space:normal;}
  .docprev .dl .b{font-weight:700;}
  .docprev .dl .sign{margin-top:42px;}
  .docprev .dl .ins{margin:0 0 12px;width:auto;}
  .docprev .dl .ins td{padding:0 0 4px;}
  .docprev .dl .ins .n{width:56px;padding-left:26px;}
  .docprev .dl .mid{text-align:center;}
  .docprev .dl.just p,.docprev .dl.just .ins td{text-align:justify;}
  .docprev .dl.just .mid,.docprev .dl.just .sign{text-align:left;}
  .docprev .dl.just .mid{text-align:center;}
  .docprev .dl table.fld{width:100%;margin:0 0 12px;}
  .docprev .dl table.fld .lbl{width:25%;}
  .docprev .dl .encl .ans{padding-left:30px;white-space:nowrap;}
  .docprev .dl table.bx{margin:14px 0;width:100%;}
  .docprev .dl table.bx td{border:1px solid #000;padding:3px 6px;}
  .docprev .dl .dlfoot{margin-top:2px;font-size:12px;color:#8b0000;}
  .docprev .dl .dlfoot .r{text-align:right;}
  /* The contact strip set open, as the printed sheet sets it. */
  .docprev .dl .dlfoot div+div{margin-top:6px;}
`;
