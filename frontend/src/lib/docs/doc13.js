import { DL_SIGN_CX, DL_STAMP_CX, EV, esc, evd13Rows, fitSheet, formGrid } from "./common.js";
import { SIGN_SRC, STAMP_SRC, imgTag, signImage, stampImage } from "../logo.js";

export const EVD_CLASS = { t: "ttl", n: "", nt: "nt", w: "w", u: "u", x: "bx", c: "c" };

export function evd13Sheet(ctx) {
  const G = formGrid(24);
  let sgRow = -1;
  evd13Rows(ctx).forEach((r) => {
    if (r.sg) sgRow = G.rows.length;
    if (r.gap) { G.gap(r.h || 8); return; }
    G.row(r.cells.map(([span, v, k]) => [span, { v, s: EV[k] }]));
  });
  /* Stamped and signed by air: the stamp under the place and date, the block
     over "Signature of the Exporter" (Docs/JG_Air_Docs). */
  const sign = sgRow >= 0 && signImage(DL_SIGN_CX), stamp = sgRow >= 0 && stampImage(DL_STAMP_CX);
  return fitSheet({
    name: "Declaration",
    images: [
      stamp && { ...stamp, col: 5, colOff: 0, row: sgRow, rowOff: 0 },
      sign && { ...sign, col: 14, colOff: 0, row: sgRow, rowOff: 76200 },
    ].filter(Boolean),
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
  const body = evd13Rows(ctx).map((r) => (r.sg
    ? `<tr class="sgr"><td colspan="10">${imgTag(STAMP_SRC, "sgstp")}</td><td colspan="14">${imgTag(SIGN_SRC, "sgsig")}</td></tr>`
    : r.gap
    ? '<tr class="gap"><td colspan="24"></td></tr>'
    : `<tr>${r.cells.map(([span, v, k]) => {
      const cls = EVD_CLASS[k];
      return `<td${cls ? ` class="${cls}"` : ""}${span > 1 ? ` colspan="${span}"` : ""}>${esc(v)}</td>`;
    }).join("")}</tr>`)).join("");
  const html = `<div class="evd a4"><table><colgroup>${'<col>'.repeat(24)}</colgroup>${body}</table></div>`;
  return { name: "Export_Value_Declaration", html, sheet: evd13Sheet(ctx), page: "portrait" };
};
