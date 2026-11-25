import { BLA_TW, BLA_W, bla24Rows, esc, fitSheet, formGrid } from "./common.js";
import { buildDOCX } from "../docx.js";

/* 24 · Annexure to the bill of lading. One description of their typed sheet
   (common.js) laid out three ways. It is a Word document rather than a
   worksheet, so there is no grid of theirs to copy — the three columns their
   tables are typed across carry it, and the paragraphs run right across them. */

/* A paragraph, and the rules a table draws. Their tables are ruled the way Word
   rules them: a dotted line between one line and the next, a solid one down
   between the columns, and a solid one under the last of them. */
const BLA = {
  ttl: { font: "cal12b", border: false, align: "center" },
  mid: { font: "cal12", border: false, align: "center" },
  hd: { font: "cal12bu", border: false },
  n: { font: "cal12", border: false },
};

/* Word rules only between the columns, not around the table, so the last one
   on a line is left open at its right edge. */
const cell = (lastRow, lastCol) => ({
  font: "cal12", align: "left", valign: "bottom",
  border: { l: "", r: lastCol ? "" : "thin", t: "", b: lastRow ? "thin" : "dotted" },
});

export function bla24Sheet(ctx, name) {
  const G = formGrid(3);
  bla24Rows(ctx).forEach((b) => {
    if (b.kind === "p") { G.row([[3, { v: b.text, s: BLA[b.k] }]], 15.75); return; }
    b.rows.forEach((r, i) => G.row(
      r.map(([v, span = 1], j) => [span, { v, s: cell(i === b.rows.length - 1, j === r.length - 1) }]),
      15.75,
    ));
  });
  return fitSheet({
    name,
    rows: G.rows,
    merges: G.merges,
    heights: G.heights,
    widths: BLA_W,
    defaultRowHeight: 15.75,
    colStyle: { font: "cal12", border: false },
    /* Their page: A4 portrait, an inch top and bottom and a wider inch and a
       quarter down each side, as a typed letter is set. */
    page: {
      paper: 9, orientation: "portrait", fit: true, fitW: 1, fitH: 0,
      margins: { left: 1.25, right: 1.25, top: 1, bottom: 1, header: 0.5, footer: 0.5 },
    },
  }, { widen: false });
}

export function blAnnexure(ctx) {
  const total = BLA_W.reduce((a, x) => a + x, 0);
  const colg = BLA_W.map((x) => `<col style="width:${((x / total) * 100).toFixed(3)}%">`).join("");
  const body = bla24Rows(ctx).map((b) => {
    if (b.kind === "p") {
      return `<tr><td colspan="3" class="p ${b.k}">${esc(b.text) || "&nbsp;"}</td></tr>`;
    }
    return b.rows.map((r, i) => {
      const cls = `c${i === b.rows.length - 1 ? " last" : ""}`;
      return `<tr>${r.map(([v, span = 1]) => `<td class="${cls}"${span > 1 ? ` colspan="${span}"` : ""}>${esc(v) || "&nbsp;"}</td>`).join("")}</tr>`;
    }).join("");
  }).join("");
  return `<div class="bla"><table><colgroup>${colg}</colgroup>${body}</table></div>`;
}

/* How each kind of line is set, for the Word document to be typed from. */
const BLA_DOCX = {
  ttl: { align: "center", bold: true },
  mid: { align: "center" },
  hd: { bold: true, underline: true },
  n: {},
};

/* The same sheet as a Word document — which is what their file is. The tables
   are laid on the one grid their three-column ones use, so a bore and a code
   start in the same place down the page; their own file types the pipes across
   a grid of their own and the two do not line up. */
export function bla24Docx(ctx) {
  return {
    font: { name: "Calibri", size: 12 },
    blocks: bla24Rows(ctx).map((b) => (b.kind === "p"
      ? { kind: "p", text: b.text, ...BLA_DOCX[b.k] }
      : { kind: "tbl", grid: BLA_TW, rows: b.rows })),
  };
}

export const B_24 = (ctx) => ({
  name: "BL_Annexure",
  html: blAnnexure(ctx),
  sheet: bla24Sheet(ctx, "Attached Sheet"),
  docx: bla24Docx(ctx),
  page: "portrait",
});
