import { EWX_W, esc, ewx29Rows, ewxClass, ewxStyle, fitSheet, formGrid } from "./common.js";

/* 29 · E-way bill, export leg. One description of the portal's printed bill
   (common.js) laid out three ways. */

export function ewx29Sheet(ctx, name) {
  const G = formGrid(12);
  ewx29Rows(ctx).forEach((r) => G.row(
    r.cells.map(([span, v, spec]) => [span, { v, s: ewxStyle(spec) }]), r.h,
  ));
  return fitSheet({
    name,
    rows: G.rows,
    merges: G.merges,
    heights: G.heights,
    widths: EWX_W,
    defaultRowHeight: 15,
    colStyle: { font: "ref9", border: false },
    page: {
      paper: 9, orientation: "portrait", fit: true, fitW: 1, fitH: 0,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  }, { widen: false });
}

export function ewayExport(ctx) {
  const total = EWX_W.reduce((a, x) => a + x, 0);
  const colg = EWX_W.map((x) => `<col style="width:${((x / total) * 100).toFixed(3)}%">`).join("");
  const body = ewx29Rows(ctx).map((r) => `<tr>${r.cells.map(([span, v, spec]) => {
    const cls = ewxClass(spec);
    return `<td${cls ? ` class="${cls}"` : ""}${span > 1 ? ` colspan="${span}"` : ""}>${esc(v) || "&nbsp;"}</td>`;
  }).join("")}</tr>`).join("");
  return `<div class="ewx"><table><colgroup>${colg}</colgroup>${body}</table></div>`;
}

export const B_29 = (ctx) => ({
  name: "Eway_Export",
  html: ewayExport(ctx),
  sheet: ewx29Sheet(ctx, "E-way Export"),
  page: "portrait",
});
