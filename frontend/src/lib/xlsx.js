/* ============================================================================
   A real .xlsx writer, with no dependencies.

   The old exports were HTML pretending to be a workbook: Excel opened them,
   but every figure arrived as dead text. The client needs the arithmetic to
   survive the download — change the pieces in the sheet and the total value
   must follow — so this writes the genuine OOXML package with `<f>` formulas
   in it.

   A workbook is a plain object:

     { sheets: [{ name, rows, merges, widths, freeze }] }

   `rows` is an array of rows, a row an array of cells, a cell one of:

     null | "" ................. blank
     "text" .................... an inline string
     { v: 1234, t: "n", fmt } .. a number, optionally with a format name
     { f: "D5*E5", fmt } ....... a formula — Excel works the value out itself
     { v, s: { … } } ........... any of the above with explicit styling

   Cells carry no cached result, and the workbook asks for a full calculation
   on load, so what opens is always what the formulas say — never a stale
   number baked in at download time.
   ============================================================================ */

import { X, utf8, zipBlob } from "./zip.js";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function colLetter(n) {
  let s = "";
  let x = Math.max(1, Math.floor(n));
  while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); }
  return s;
}
export const cellRef = (row, col) => `${colLetter(col)}${row}`;

/* ---- number formats, by name ---- */
export const FORMATS = {
  int: "#,##0",
  num: "#,##0.00",
  num1: "#,##0.0",
  num3: "#,##0.000",
  inr: '"₹"#,##0.00',
  inr0: '"₹"#,##0',
  usd: '"$"#,##0.00',
  usd4: '"$"#,##0.0000',
  pct: "0.00%",
  pct1: "0.0",
  date: "dd/mm/yyyy",
};

/* ---- style registry ------------------------------------------------------
   Styles are described by name rather than by index, and the registry hands
   out the OOXML indices at write time, so a builder never has to know what
   number a font ended up as.                                              */
const FONTS = [
  { key: "base", xml: '<font><sz val="10.5"/><color theme="1"/><name val="Calibri"/></font>' },
  { key: "bold", xml: '<font><b/><sz val="10.5"/><color rgb="FF0B2C4D"/><name val="Calibri"/></font>' },
  { key: "white", xml: '<font><b/><sz val="10.5"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' },
  { key: "title", xml: '<font><b/><sz val="15"/><color rgb="FF0B2C4D"/><name val="Calibri"/></font>' },
  { key: "h2", xml: '<font><b/><sz val="12"/><color rgb="FF0B2C4D"/><name val="Calibri"/></font>' },
  { key: "sub", xml: '<font><sz val="9.5"/><color rgb="FF516170"/><name val="Calibri"/></font>' },
  /* Arial 10 — the client's own workbooks, so a document rebuilt cell for cell
     against one of them (2 · Barcode) opens looking like the file it copies. */
  { key: "ref", xml: '<font><sz val="10"/><name val="Arial"/><family val="2"/></font>' },
  { key: "refb", xml: '<font><b/><sz val="10"/><name val="Arial"/><family val="2"/></font>' },
  { key: "refg", xml: '<font><b/><sz val="10"/><color rgb="FF339966"/><name val="Arial"/><family val="2"/></font>' },
  { key: "refr", xml: '<font><b/><sz val="10"/><color rgb="FFFF0000"/><name val="Arial"/><family val="2"/></font>' },
  // The supplier packing sheet writes its codes in a darker green than the
  // buyer sheets do — their two workbooks were built years apart.
  { key: "refgd", xml: '<font><b/><sz val="10"/><color rgb="FF008000"/><name val="Arial"/><family val="2"/></font>' },
  { key: "refb11", xml: '<font><b/><sz val="11"/><name val="Arial"/><family val="2"/></font>' },
  // The buyer's own name across the top of their purchase order (17).
  { key: "refb14", xml: '<font><b/><sz val="14"/><name val="Arial"/><family val="2"/></font>' },
  // The contact strip along the foot of that same order — small print on their
  // paper, and small here, so the four lines sit close together.
  { key: "ref8", xml: '<font><sz val="8"/><name val="Arial"/><family val="2"/></font>' },
  /* Arial 9 — the customs invoice (18) is typed a point smaller than the
     packing books, so two pages of goods fit the page the way their own file
     does. Its masthead is the same Centaur 18 as the letterhead but in black,
     which is how that workbook was set. */
  { key: "ref9", xml: '<font><sz val="9"/><name val="Arial"/><family val="2"/></font>' },
  { key: "ref9b", xml: '<font><b/><sz val="9"/><name val="Arial"/><family val="2"/></font>' },
  { key: "ref9bu", xml: '<font><b/><u/><sz val="9"/><name val="Arial"/><family val="2"/></font>' },
  /* The shipper's own name across the head of the letter to the CHA (22),
     set large over the two rows their form gives it. */
  { key: "ref18b", xml: '<font><b/><sz val="18"/><name val="Arial"/><family val="2"/></font>' },
  { key: "brandk", xml: '<font><b/><sz val="18"/><name val="Centaur"/><family val="1"/></font>' },
  /* The annexure to that invoice (18 · Annx) is not typed on the form at all —
     it is a plain Calibri sheet with the printed letterhead pasted over the top
     of it, the name in red Centaur and the address below it in blue. */
  { key: "brandr", xml: '<font><sz val="18"/><color rgb="FFFF0000"/><name val="Centaur"/><family val="1"/></font>' },
  /* The packing book (19) is typed in colour where the invoice book (18) is
     not: its title and the answers customs reads off it are red, its labels
     blue. Their file stores these as Excel's indexed palette — 10, 12 and 8 —
     which is the same ink as the rgb below. */
  { key: "ref9r", xml: '<font><b/><sz val="9"/><color rgb="FFFF0000"/><name val="Arial"/><family val="2"/></font>' },
  { key: "ref9bb", xml: '<font><b/><sz val="9"/><color rgb="FF0000FF"/><name val="Arial"/><family val="2"/></font>' },
  { key: "ref9bl", xml: '<font><sz val="9"/><color rgb="FF0000FF"/><name val="Arial"/><family val="2"/></font>' },
  /* The supplier purchase order is a printed letter, not a table: their
     letterhead is Centaur in maroon, the form's labels are blue, and a few
     words on it are underlined. */
  { key: "refbb", xml: '<font><b/><sz val="10"/><color rgb="FF0000FF"/><name val="Arial"/><family val="2"/></font>' },
  { key: "refbl", xml: '<font><sz val="10"/><color rgb="FF3366FF"/><name val="Arial"/><family val="2"/></font>' },
  { key: "refmn", xml: '<font><sz val="10"/><color rgb="FF800000"/><name val="Arial"/><family val="2"/></font>' },
  { key: "brand", xml: '<font><b/><sz val="18"/><color rgb="FF800000"/><name val="Centaur"/><family val="1"/></font>' },
  { key: "refbu", xml: '<font><b/><u/><sz val="10"/><name val="Arial"/><family val="2"/></font>' },
  { key: "refun", xml: '<font><u/><sz val="10"/><name val="Arial"/><family val="2"/></font>' },
  { key: "refur", xml: '<font><u/><sz val="10"/><color rgb="FFFF0000"/><name val="Arial"/><family val="2"/></font>' },
  /* The e-way bill is the portal's entry form: the options it offers are set
     in italic and the boxes the operator still has to fill carry the site's
     own grey prompt. */
  { key: "refi", xml: '<font><i/><sz val="10"/><name val="Arial"/><family val="2"/></font>' },
  { key: "refgy", xml: '<font><sz val="10"/><color rgb="FF808080"/><name val="Arial"/><family val="2"/></font>' },
  /* The despatch instruction is a letter on the printed letterhead — Calibri
     body, Centaur maroon masthead, and the contact strip along the foot. */
  { key: "letb", xml: '<font><b/><sz val="10.5"/><color theme="1"/><name val="Calibri"/></font>' },
  // The heading of the gross-mass declaration (27) is underlined as well, and
  // so is the word its notes are gathered under.
  { key: "letbu", xml: '<font><b/><u/><sz val="10.5"/><color theme="1"/><name val="Calibri"/></font>' },
  { key: "letu", xml: '<font><u/><sz val="10.5"/><color theme="1"/><name val="Calibri"/></font>' },
  /* Calibri 11 — the workbooks the client built in Excel's own default face
     rather than in the older Arial books (12 · Shipment boxes & volume). */
  { key: "cal", xml: '<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>' },
  { key: "calb", xml: '<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>' },
  // The letterhead's own two inks, in that same Calibri.
  /* Calibri 10 — the shipping instructions (26) state their column widths in
     the Arial their workbook's normal style is set in, but the form itself is
     typed a size down in Calibri, which is what it has to be measured in. */
  { key: "cal10", xml: '<font><sz val="10"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>' },
  { key: "cal10b", xml: '<font><b/><sz val="10"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>' },
  /* Calibri 12 — the annexure to the bill of lading (24) is a typed sheet, not
     a worksheet, and that is the face and size it is typed at. */
  { key: "cal12", xml: '<font><sz val="12"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>' },
  { key: "cal12b", xml: '<font><b/><sz val="12"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>' },
  { key: "cal12bu", xml: '<font><b/><u/><sz val="12"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>' },
  /* Calibri 18, 11 underlined and 7 — the container weight declaration (34) is
     a typed form of their forwarder's: its title is set large, the choice that
     applies is ruled under rather than ringed, since a cell cannot draw a
     circle, and the seven notes at the foot are set very small. */
  { key: "cal18b", xml: '<font><b/><sz val="18"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>' },
  { key: "calbu", xml: '<font><b/><u/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>' },
  { key: "cal7", xml: '<font><sz val="7"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>' },
  { key: "calbl", xml: '<font><sz val="11"/><color rgb="FF0000FF"/><name val="Calibri"/><family val="2"/></font>' },
  { key: "calr", xml: '<font><sz val="11"/><color rgb="FFFF0000"/><name val="Calibri"/><family val="2"/></font>' },
  /* Times New Roman — the customs declarations are typed forms, and that is
     the face they are typed in (13 · Export value declaration). */
  { key: "tnr", xml: '<font><sz val="12"/><color theme="1"/><name val="Times New Roman"/><family val="1"/></font>' },
  { key: "tnru", xml: '<font><u/><sz val="12"/><color theme="1"/><name val="Times New Roman"/><family val="1"/></font>' },
  { key: "brands", xml: '<font><sz val="11"/><color rgb="FF8B0000"/><name val="Centaur"/><family val="1"/></font>' },
  { key: "letmn", xml: '<font><sz val="9"/><color rgb="FF8B0000"/><name val="Calibri"/></font>' },
  { key: "letmnb", xml: '<font><b/><sz val="9"/><color rgb="FF8B0000"/><name val="Calibri"/></font>' },
];
const FILLS = [
  { key: "none", xml: '<fill><patternFill patternType="none"/></fill>' },
  { key: "gray", xml: '<fill><patternFill patternType="gray125"/></fill>' },
  { key: "head", xml: '<fill><patternFill patternType="solid"><fgColor rgb="FF0B2C4D"/><bgColor indexed="64"/></patternFill></fill>' },
  { key: "key", xml: '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F5F8"/><bgColor indexed="64"/></patternFill></fill>' },
  { key: "sec", xml: '<fill><patternFill patternType="solid"><fgColor rgb="FFE6EDF4"/><bgColor indexed="64"/></patternFill></fill>' },
  { key: "tot", xml: '<fill><patternFill patternType="solid"><fgColor rgb="FFFBE6C2"/><bgColor indexed="64"/></patternFill></fill>' },
  // White at 25% shade — what the client's own sheets band their headings,
  // labels and totals with.
  { key: "grey", xml: '<fill><patternFill patternType="solid"><fgColor rgb="FFBFBFBF"/><bgColor indexed="64"/></patternFill></fill>' },
];
/* Black hairline edges, as Excel's own grid draws them — `box` is all four,
   the rest are the partial frames the client's sheets use on a banner row.
   An edge may name its own colour, which is how the letterhead rules print in
   the house red rather than in black. */
const EDGES = ["left", "right", "top", "bottom"];
const edge = (rgb) => (rgb ? `<color rgb="${rgb}"/>` : '<color indexed="64"/>');
/* `sides` names the Excel line style to rule each edge with, or "" to leave it
   open — most sheets want "thin" all round, but a workbook that rules its
   columns solid and its rows faintly (18 · Custom invoice) needs the two to
   differ on the same cell. */
const frame = (sides, rgb) =>
  `<border>${EDGES.map((n) => (sides[n]
    ? `<${n} style="${sides[n]}">${edge(rgb)}</${n}>`
    : `<${n}/>`)).join("")}<diagonal/></border>`;
const BORDERS = [
  { key: "none", xml: "<border><left/><right/><top/><bottom/><diagonal/></border>" },
  {
    key: "thin",
    xml: '<border><left style="thin"><color rgb="FFAEBCCB"/></left><right style="thin"><color rgb="FFAEBCCB"/></right>'
      + '<top style="thin"><color rgb="FFAEBCCB"/></top><bottom style="thin"><color rgb="FFAEBCCB"/></bottom><diagonal/></border>',
  },
];
const fontIx = (k) => Math.max(0, FONTS.findIndex((f) => f.key === k));
const fillIx = (k) => Math.max(0, FILLS.findIndex((f) => f.key === k));

/* `border` is false for none, undefined for the app's own thin grey grid, or
   the edges to rule as a string of l/r/t/b — "lrtb" (aliased "box") for a full
   cell, "tb" for a banner, "l" for the left edge of a printed form. A colour
   may follow the edges — "b#C00000" is the letterhead's red rule. Every
   combination a sheet asks for is registered as it is met.

   Where a sheet needs its edges ruled in different weights, `border` is instead
   an object naming the line style per edge, with the same optional colour:
   { l: "thin", r: "thin", t: "hair", b: "hair" }. */
const hex8 = (s) => {
  const h = String(s || "").replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  return h ? (h.length === 6 ? `FF${h}` : h.slice(0, 8)) : "";
};
function borderSpec(b) {
  const [raw, rgb] = String(b === "box" ? "lrtb" : b).split("#");
  return { edges: raw.toLowerCase().replace(/[^lrtb]/g, ""), rgb: hex8(rgb) };
}
/* Either form, as the { left, right, top, bottom } the writer rules from. */
function borderSides(b) {
  if (b && typeof b === "object") {
    const pick = (v) => (v === true ? "thin" : v || "");
    return {
      sides: { left: pick(b.l), right: pick(b.r), top: pick(b.t), bottom: pick(b.b) },
      rgb: hex8(b.rgb),
    };
  }
  const { edges, rgb } = borderSpec(b);
  const sides = {};
  EDGES.forEach((n) => { sides[n] = edges.includes(n[0]) ? "thin" : ""; });
  return { sides, rgb };
}
function borderRegistry() {
  const list = BORDERS.map((x) => x.xml);
  const seen = new Map(BORDERS.map((x, i) => [x.key, i]));
  return {
    index(b) {
      if (b === false) return 0;
      if (b == null || (typeof b !== "string" && typeof b !== "object")) return 1;
      const { sides, rgb } = borderSides(b);
      if (!EDGES.some((n) => sides[n])) return 0;
      const key = JSON.stringify([sides, rgb]);
      if (seen.has(key)) return seen.get(key);
      seen.set(key, list.length);
      list.push(frame(sides, rgb));
      return list.length - 1;
    },
    xml: () => list,
  };
}

/* A style is { font, fill, border, align, valign, wrap, quote, fmt }. */
function styleXfs(specs) {
  const numFmts = [];
  const borders = borderRegistry();
  const fmtId = (name) => {
    if (!name) return 0;
    const pattern = FORMATS[name] || name;
    let i = numFmts.indexOf(pattern);
    if (i < 0) { numFmts.push(pattern); i = numFmts.length - 1; }
    return 164 + i;
  };
  const xfs = specs.map((s) => {
    const parts = [
      `numFmtId="${fmtId(s.fmt)}"`,
      `fontId="${fontIx(s.font || "base")}"`,
      `fillId="${fillIx(s.fill || "none")}"`,
      `borderId="${borders.index(s.border)}"`,
      'xfId="0"',
      // A barcode is digits that must stay text; the quote prefix is how Excel
      // remembers that when the client edits the cell.
      s.quote ? 'quotePrefix="1"' : "",
      s.fmt ? 'applyNumberFormat="1"' : "",
      "applyFont=\"1\" applyFill=\"1\" applyBorder=\"1\" applyAlignment=\"1\"",
    ].filter(Boolean).join(" ");
    const al = [
      s.align ? `horizontal="${s.align}"` : "",
      `vertical="${s.valign || "top"}"`,
      s.wrap ? 'wrapText="1"' : "",
      // The client's older forms set every cell to shrink rather than wrap, so
      // an over-long entry stays on its one ruled line instead of growing it.
      s.shrink ? 'shrinkToFit="1"' : "",
    ].filter(Boolean).join(" ");
    return `<xf ${parts}><alignment ${al}/></xf>`;
  });
  const nf = numFmts.length
    ? `<numFmts count="${numFmts.length}">${numFmts.map((p, i) => `<numFmt numFmtId="${164 + i}" formatCode="${X(p)}"/>`).join("")}</numFmts>`
    : "";
  const bd = borders.xml();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${nf}<fonts count="${FONTS.length}">${FONTS.map((f) => f.xml).join("")}</fonts><fills count="${FILLS.length}">${FILLS.map((f) => f.xml).join("")}</fills><borders count="${bd.length}">${bd.join("")}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

/* One registered font as the run properties a rich-text run wants. The two
   elements hold the same children but name the face differently — <name> on a
   cell font, <rFont> on a run — so that is the one thing swapped. */
const runProps = (key) => {
  const f = FONTS.find((x) => x.key === key) || FONTS[0];
  return f.xml.replace(/^<font>/, "").replace(/<\/font>$/, "").replace(/<name /, "<rFont ");
};

/* ---- turning one sheet's rows into worksheet XML ---- */
function sheetXml(sheet, styleOf) {
  const rows = sheet.rows || [];
  const heights = sheet.heights || [];
  const body = rows.map((row, ri) => {
    const r = ri + 1;
    const ht = Number(heights[ri]) > 0 ? ` ht="${Number(heights[ri])}" customHeight="1"` : "";
    const cells = (row || []).map((raw, ci) => {
      if (raw == null || raw === "") return "";
      const cell = (typeof raw === "object") ? raw : { v: raw };
      const ref = cellRef(r, ci + 1);
      const s = styleOf(cell.s || {});
      const sAttr = s ? ` s="${s}"` : "";

      if (cell.f) return `<c r="${ref}"${sAttr}><f>${X(String(cell.f).replace(/^=/, ""))}</f></c>`;

      /* A line typed in more than one ink — the letterhead's blue labels with
         their answers in red — is written as runs rather than as one string,
         each naming the registered font it is set in: [{ t, font }, …]. */
      if (Array.isArray(cell.rt)) {
        const runs = cell.rt.filter((r) => r && r.t !== "" && r.t != null)
          .map((r) => `<r><rPr>${runProps(r.font)}</rPr><t xml:space="preserve">${X(String(r.t))}</t></r>`).join("");
        return runs ? `<c r="${ref}"${sAttr} t="inlineStr"><is>${runs}</is></c>` : `<c r="${ref}"${sAttr}/>`;
      }

      const v = cell.v;
      const numeric = cell.t === "n"
        || (cell.t !== "s" && typeof v === "number" && Number.isFinite(v));
      if (numeric) {
        const n = Number(v);
        if (!Number.isFinite(n)) return `<c r="${ref}"${sAttr}/>`;
        return `<c r="${ref}"${sAttr}><v>${n}</v></c>`;
      }
      const text = String(v ?? "");
      if (!text) return sAttr ? `<c r="${ref}"${sAttr}/>` : "";
      return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${X(text)}</t></is></c>`;
    }).filter(Boolean).join("");
    return cells ? `<row r="${r}"${ht}>${cells}</row>` : "";
  }).filter(Boolean).join("");

  const widths = sheet.widths || [];
  // A width copied off one of the client's sheets is kept to the character
  // fraction Excel stored it at; the app's own guesses are whole characters.
  const width = (w) => String(Math.round(Math.max(2, Math.min(255, Number(w) || 12)) * 1e6) / 1e6);
  // The column's own default — what a cell typed in below the table inherits.
  // A copied workbook states it, so the client's font carries on down the sheet.
  const cs = sheet.colStyle ? ` style="${styleOf(sheet.colStyle)}"` : "";
  /* Columns Setup → Document columns hides (lib/docColumns.js) stay in the
     file, hidden — right-click → Unhide brings them back. */
  const hidden = new Set(sheet.hiddenCols || []);
  const hid = (i) => (hidden.has(i) ? ' hidden="1"' : "");
  const ncols = Math.max(widths.length, hidden.size ? Math.max(...hidden) + 1 : 0);
  const cols = ncols
    ? `<cols>${Array.from({ length: ncols }, (_, i) => {
      if (i < widths.length) return `<col min="${i + 1}" max="${i + 1}" width="${width(widths[i])}"${cs} customWidth="1"${hid(i)}/>`;
      // Past the stated widths only a hidden column needs an entry.
      return hidden.has(i) ? `<col min="${i + 1}" max="${i + 1}" width="${width(12)}"${cs}${hid(i)}/>` : "";
    }).join("")}</cols>`
    : "";

  const merges = (sheet.merges || []).filter(Boolean);
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${X(m)}"/>`).join("")}</mergeCells>`
    : "";

  const pane = sheet.freeze
    ? `<sheetView workbookViewId="0"><pane ySplit="${sheet.freeze}" topLeftCell="A${sheet.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView>`
    : '<sheetView workbookViewId="0"/>';

  /* Tab colour and the printed page. A sheet says nothing here and gets the
     app's defaults; one that copies a client workbook states what that file
     states, so it prints on the same paper at the same scale. */
  const page = sheet.page || null;
  const pr = (sheet.tabColor || page)
    ? `<sheetPr>${sheet.tabColor ? `<tabColor rgb="${X(sheet.tabColor)}"/>` : ""}${page && page.fit ? '<pageSetUpPr fitToPage="1"/>' : ""}</sheetPr>`
    : "";
  const fmtPr = `<sheetFormatPr${sheet.defaultColWidth ? ` defaultColWidth="${sheet.defaultColWidth}"` : ""} defaultRowHeight="${sheet.defaultRowHeight || 15}"/>`;
  const m = (page && page.margins) || { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };
  const margins = `<pageMargins left="${m.left}" right="${m.right}" top="${m.top}" bottom="${m.bottom}" header="${m.header ?? 0.3}" footer="${m.footer ?? 0.3}"/>`;
  /* fitH: 0 fits the sheet to one page across and lets it run on downwards —
     what a list of unknown length wants. fitW says the same for the width: the
     attribute defaults to one page in the format, but a reader that takes a
     missing one as "no limit" fits the sheet to the height alone and prints it
     a size the sheet never asked for, so a form that must come off one page
     across says so. */
  const fitH = page && page.fitH != null ? ` fitToHeight="${page.fitH}"` : "";
  const fitW = page && page.fitW != null ? ` fitToWidth="${page.fitW}"` : "";
  const setup = page
    ? `<pageSetup paperSize="${page.paper || 9}" scale="${page.scale || 100}"${fitW}${fitH} orientation="${page.orientation || "portrait"}"/>`
    : "";
  // A form narrower than the paper is centred across it rather than left to
  // sit against the left margin — what the client's invoice books do.
  const opts = page && page.centered ? '<printOptions horizontalCentered="1"/>' : "";

  /* A form that says where its pages end says so here, as their own files do:
     a letter with standing declarations under it breaks before the first of
     them rather than wherever the paper happens to run out. */
  const brks = (sheet.rowBreaks || []).filter((r) => r > 0);
  const breaks = brks.length
    ? `<rowBreaks count="${brks.length}" manualBreakCount="${brks.length}">${brks.map((r) => `<brk id="${r}" max="16383" man="1"/>`).join("")}</rowBreaks>`
    : "";

  // A sheet with anything drawn on it — pictures, ruled frames — points at its
  // own drawing part. The letterhead images are fetched and may not arrive, so
  // the frame beside them has to be able to stand on its own.
  const drawn = sheetImages(sheet).length > 0 || sheetFrames(sheet).length > 0;
  const drawing = drawn ? '<drawing r:id="rIdDr"/>' : "";
  const rNs = drawn ? ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"${rNs}>${pr}<sheetViews>${pane}</sheetViews>${fmtPr}${cols}<sheetData>${body}</sheetData>${mergeXml}${opts}${margins}${setup}${breaks}${drawing}</worksheet>`;
}

/* The pictures a sheet carries. `image` is one of them, `images` several — a
   letterhead that is a printed block beside a mark needs both — and either is
   read as the same list. */
const sheetImages = (sheet) => [...(sheet.images || []), sheet.image]
  .filter((i) => i && i.data);

/* A sheet may also rule an empty frame — the box the packing declaration stands
   its mark in, which is a shape on their file rather than a border on cells,
   because it begins and ends part way into a column. Same shape as a picture,
   { col, row, colOff, rowOff, cx, cy }, with no bytes behind it. */
const sheetFrames = (sheet) => (sheet.frames || []).filter(Boolean);

/* Pictures anchored to cells — the letterhead mark on the supplier order, the
   printed address block on the packing declaration. Each is
   { data, ext, col, row, colOff, rowOff, cx, cy }, sizes in EMU (914400 to the
   inch), anchored one-cell so it keeps its shape whatever the client does to
   the column widths. Empty frames are ruled the same way, after them. */
const RULE = `<a:ln w="9525"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>`;

const at = (p) => `<xdr:col>${p.col || 0}</xdr:col><xdr:colOff>${p.colOff || 0}</xdr:colOff><xdr:row>${p.row || 0}</xdr:row><xdr:rowOff>${p.rowOff || 0}</xdr:rowOff>`;

/* An object is pinned to one corner and given a size, unless it carries a `to`
   corner as well — then it stretches between the two and follows the columns it
   spans, which is how the letterheads in their own files are drawn. */
const anchorTo = (o, body) => (o.to
  ? `<xdr:twoCellAnchor editAs="oneCell"><xdr:from>${at(o)}</xdr:from><xdr:to>${at(o.to)}</xdr:to>${body}<xdr:clientData/></xdr:twoCellAnchor>`
  : `<xdr:oneCellAnchor><xdr:from>${at(o)}</xdr:from><xdr:ext cx="${o.cx}" cy="${o.cy}"/>${body}<xdr:clientData/></xdr:oneCellAnchor>`);

function drawingXml(imgs, frames = []) {
  const pics = imgs.map((img, i) => anchorTo(img, `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 1}" name="${X(img.name || `Picture ${i + 1}`)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId${i + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${img.cx}" cy="${img.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${img.line ? RULE : ""}</xdr:spPr></xdr:pic>`)).join("");
  const boxes = frames.map((f, i) => anchorTo(f, `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${imgs.length + i + 1}" name="${X(f.name || `Frame ${i + 1}`)}"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${f.cx}" cy="${f.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>${RULE}</xdr:spPr><xdr:txBody><a:bodyPr/><a:p><a:endParaRPr lang="en-US"/></a:p></xdr:txBody></xdr:sp>`)).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${pics}${boxes}</xdr:wsDr>`;
}

/* Excel forbids : \ / ? * [ ] in a sheet name, and caps it at 31 characters. */
function safeName(name, taken) {
  let n = String(name || "Sheet").replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Sheet";
  let i = 2;
  while (taken.has(n.toLowerCase())) {
    const suffix = ` (${i++})`;
    n = `${n.slice(0, 31 - suffix.length)}${suffix}`;
  }
  taken.add(n.toLowerCase());
  return n;
}

/** Build the .xlsx package for a workbook and hand back a Blob. */
export function buildXLSX(workbook) {
  const specs = [];
  const seen = new Map();
  const styleOf = (spec) => {
    const key = JSON.stringify(spec || {});
    if (key === "{}") return 0;
    if (seen.has(key)) return seen.get(key);
    const ix = specs.length;
    specs.push(spec);
    seen.set(key, ix);
    return ix;
  };
  specs.push({});           // index 0 — the plain, bordered default
  seen.set("{}", 0);

  const taken = new Set();
  const sheets = (workbook.sheets || []).map((s) => ({ ...s, name: safeName(s.name, taken) }));
  if (!sheets.length) sheets.push({ name: "Sheet1", rows: [] });

  // Styles must be collected before styles.xml is written, so render first.
  const sheetXmls = sheets.map((s) => sheetXml(s, styleOf));

  /* Pictures. A sheet carrying one gets a drawing part of its own, the image
     goes into xl/media, and the worksheet gets a rels file pointing at it.

     The bytes are stored once however many sheets show them: the letterhead
     mark on a three-sheet book is one media part pointed at three times, which
     is how the client's own files hold it — storing it per sheet would treble
     the size of the download for nothing. */
  const media = [];
  const mediaFor = (img) => {
    let m = media.find((x) => x.data === img.data && x.ext === (img.ext || "png"));
    if (!m) { m = { data: img.data, ext: img.ext || "png", n: media.length + 1 }; media.push(m); }
    return m;
  };
  const pics = sheets.map((s, i) => {
    const imgs = sheetImages(s);
    const frames = sheetFrames(s);
    return imgs.length || frames.length
      ? { sheet: i, imgs, frames, media: imgs.map(mediaFor) } : null;
  }).filter(Boolean);
  pics.forEach((p, k) => { p.n = k + 1; });
  const picFiles = [
    ...media.map((m) => ({ name: `xl/media/image${m.n}.${m.ext}`, data: m.data })),
    ...pics.flatMap((p) => [
      { name: `xl/drawings/drawing${p.n}.xml`, data: utf8(drawingXml(p.imgs, p.frames)) },
      {
        name: `xl/drawings/_rels/drawing${p.n}.xml.rels`,
        data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${p.media
  .map((m, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${m.n}.${m.ext}"/>`)
  .join("")}</Relationships>`),
      },
      {
        name: `xl/worksheets/_rels/sheet${p.sheet + 1}.xml.rels`,
        data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${p.n}.xml"/></Relationships>`),
      },
    ]),
  ];
  const picTypes = pics.length
    ? [...new Set(media.map((m) => m.ext))].map((e) => `<Default Extension="${e}" ContentType="image/${e === "jpg" ? "jpeg" : e}"/>`).join("")
      + pics.map((p) => `<Override PartName="/xl/drawings/drawing${p.n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join("")
    : "";

  const files = [
    {
      name: "[Content_Types].xml",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${picTypes}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    },
    {
      name: "_rels/.rels",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    },
    {
      name: "xl/workbook.xml",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${X(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr calcId="0" fullCalcOnLoad="1"/></workbook>`),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    },
    { name: "xl/styles.xml", data: utf8(styleXfs(specs)) },
    ...sheetXmls.map((xml, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: utf8(xml) })),
    ...picFiles,
  ];

  return zipBlob(files, XLSX_MIME);
}
