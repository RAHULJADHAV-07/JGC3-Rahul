import { CHA_HELD, CHA_W, cha22Rows, chaClass, chaStyle, esc, fitSheet, formGrid } from "./common.js";

/* 22 · Letter to the CHA. One description of their ruled form (common.js) laid
   out three ways — the worksheet, the preview and the printed page — so the
   copy the agent is sent is the copy that was on screen. */

export function cha22Sheet(ctx, name) {
  const G = formGrid(11);
  cha22Rows(ctx).forEach((r) => G.row(
    r.cells.map(([span, v, spec, down = 0]) => [span, { v, s: chaStyle(spec) }, down]), r.h,
  ));
  return fitSheet({
    name,
    rows: G.rows,
    merges: G.merges,
    /* Every row is given its height, as their sheet gives it: a row left to
       size itself grows to whatever is typed on it, and the two rows the 18pt
       name stands over would then push the form off the page. */
    heights: Array.from({ length: G.rows.length }, (_, i) => G.heights[i] || 12),
    widths: CHA_W,
    defaultRowHeight: 12,
    colStyle: { font: "ref9", border: false },
    /* Letter, portrait and their own margins, as their file prints it. The form
       is wider than the paper by design (see CHA_BASE), so it is printed down
       to fit — at a scale stated here rather than left to "fit to one page
       wide", which lands on whatever whole percentage the reader's spreadsheet
       happens to step to and so prints a different size in each of them. */
    page: {
      paper: 1, orientation: "portrait", fit: true, fitW: 1, fitH: 1,
      margins: { left: 0.511806, right: 0.236111, top: 0.236111, bottom: 0.236111, header: 0.511811, footer: 0.511811 },
    },
  }, { widen: false });
}

export function letterToCha(ctx) {
  const all = cha22Rows(ctx);
  // The same eleven columns the worksheet is ruled to, so the two read alike.
  const total = CHA_W.reduce((a, x) => a + x, 0);
  const colg = CHA_W.map((x) => `<col style="width:${((x / total) * 100).toFixed(3)}%">`).join("");
  /* A run carried down further rows takes those rows' columns with it, so the
     cells the sheet needs under it (CHA_HELD) are left out here — the rowspan
     already occupies them. */
  const body = all.map((r) => `<tr>${r.cells
    .filter(([, , spec]) => spec !== CHA_HELD)
    .map(([span, v, spec, down = 0]) => {
      const cls = chaClass(spec);
      const rs = down ? ` rowspan="${down + 1}"` : "";
      return `<td${cls ? ` class="${cls}"` : ""}${span > 1 ? ` colspan="${span}"` : ""}${rs}>${esc(v) || "&nbsp;"}</td>`;
    }).join("")}</tr>`).join("");
  return `<div class="cha"><table><colgroup>${colg}</colgroup>${body}</table></div>`;
}

export const B_22 = (ctx) => ({
  name: "Letter_to_CHA",
  html: letterToCha(ctx),
  sheet: cha22Sheet(ctx, "Letter to CHA"),
  page: "portrait",
});
