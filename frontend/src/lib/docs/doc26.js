import { CHA_HELD, SI_W, esc, fitSheet, formGrid, si26Rows, siClass, siStyle } from "./common.js";

/* 26 · Shipping instructions. One description of the line's booking form
   (common.js) laid out three ways, so what the line is sent is what was on
   screen. */

export function si26Sheet(ctx, name) {
  const rows = si26Rows(ctx);
  const G = formGrid(SI_W.length);
  rows.forEach((r) => G.row(
    r.cells.map(([span, v, spec, down = 0]) => [span, { v, s: siStyle(spec) }, down]), r.h,
  ));
  return fitSheet({
    name,
    rows: G.rows,
    merges: G.merges,
    // Their form is ruled to a fixed depth, so every row is given its height.
    heights: Array.from({ length: G.rows.length }, (_, i) => G.heights[i] || 12.75),
    widths: SI_W,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false },
    /* A4 portrait and their own margins — the form is nearly as wide as the
       paper, so it is set almost against both edges. Printed at the scale their
       own file states: the columns are cut to the type at that size, and a
       form left to fit the page on its own comes out a size larger, at which
       the longest labels no longer sit inside the boxes ruled for them. */
    page: {
      paper: 9, orientation: "portrait", scale: 85,
      margins: { left: 0.129861, right: 0.05, top: 0.859722, bottom: 0.15, header: 0.511811, footer: 0.511811 },
    },
  }, { widen: false });
}

export function shippingInstructions(ctx) {
  const all = si26Rows(ctx);
  const total = SI_W.reduce((a, x) => a + x, 0);
  const colg = SI_W.map((x) => `<col style="width:${((x / total) * 100).toFixed(3)}%">`).join("");
  /* The marks stand five rows deep and the cargo description ten. The cells the
     sheet needs under them (CHA_HELD) are left out here — the rowspan already
     occupies those columns. */
  const body = all.map((r) => `<tr>${r.cells
    .filter(([, , spec]) => spec !== CHA_HELD)
    .map(([span, v, spec, down = 0]) => {
      const cls = siClass(spec);
      const rs = down ? ` rowspan="${down + 1}"` : "";
      return `<td${cls ? ` class="${cls}"` : ""}${span > 1 ? ` colspan="${span}"` : ""}${rs}>${esc(v) || "&nbsp;"}</td>`;
    }).join("")}</tr>`).join("");
  return `<div class="si"><table><colgroup>${colg}</colgroup>${body}</table></div>`;
}

export const B_26 = (ctx) => ({
  name: "Shipping_Instructions_26",
  html: shippingInstructions(ctx),
  sheet: si26Sheet(ctx, "Shipping Instructions"),
  page: "portrait",
});
