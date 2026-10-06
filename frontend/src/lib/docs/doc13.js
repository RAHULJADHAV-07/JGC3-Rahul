import { EV, esc, evd13Rows, fitSheet, formGrid } from "./common.js";

export const EVD_CLASS = { t: "ttl", n: "", nt: "nt", w: "w", u: "u", x: "bx", c: "c" };

export function evd13Sheet(ctx) {
  const G = formGrid(24);
  evd13Rows(ctx).forEach((r) => {
    if (r.gap) { G.gap(r.h || 8); return; }
    G.row(r.cells.map(([span, v, k]) => [span, { v, s: EV[k] }]));
  });
  return fitSheet({
    name: "Declaration",
    rows: G.rows,
    merges: G.merges,
    heights: G.heights,
    widths: Array(24).fill(4),
    defaultRowHeight: 16.5,
    colStyle: { font: "tnr", border: false },
    page: {
      paper: 9, orientation: "portrait", fit: true, fitH: 0,
      margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
  }, { widen: false });
}

export const B_13 = (ctx) => {
  const body = evd13Rows(ctx).map((r) => (r.gap
    ? '<tr class="gap"><td colspan="24"></td></tr>'
    : `<tr>${r.cells.map(([span, v, k]) => {
      const cls = EVD_CLASS[k];
      return `<td${cls ? ` class="${cls}"` : ""}${span > 1 ? ` colspan="${span}"` : ""}>${esc(v)}</td>`;
    }).join("")}</tr>`)).join("");
  const html = `<div class="evd a4"><table><colgroup>${'<col>'.repeat(24)}</colgroup>${body}</table></div>`;
  return { name: "Export_Value_Declaration_13", html, sheet: evd13Sheet(ctx), page: "portrait" };
};
