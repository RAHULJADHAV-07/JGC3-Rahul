import { SUP_COL, SUP_HEAD, SUP_HEAD_PLACE, SUP_LH_ROW, SUP_PLACE, SUP_W, esc, fitSheet, formGrid, sup23Rows, supClass, supStyle } from "./common.js";
import { ADDRESS_SRC, LOGO_SRC, addressImage, imgTag, logoImage } from "../logo.js";

/* 23 · Suppliers' details. One description of their banded form (common.js)
   laid out three ways, with the printed letterhead across the head of it — the
   same block the packing declaration carries, sized to this sheet's own head. */

export function sup23Sheet(ctx, name) {
  const rows = sup23Rows(ctx);
  const G = formGrid(8);
  rows.forEach((r) => G.row(r.cells.map(([span, v, spec]) => [span, { v, s: supStyle(spec) }]), r.h));
  const mark = logoImage();
  const addr = addressImage(SUP_PLACE.addr.cx);
  return fitSheet({
    name,
    rows: G.rows,
    merges: G.merges,
    heights: Array.from({ length: G.rows.length }, (_, i) => G.heights[i] || 15),
    widths: SUP_W,
    defaultRowHeight: 15,
    colStyle: { font: "cal", border: false },
    /* The three pieces of the letterhead drawn corner to corner over the head,
       where their own file draws them. */
    images: [
      addr && { ...addr, ...SUP_HEAD_PLACE.addr },
      mark && { ...mark, name: "Mark", ...SUP_HEAD_PLACE.mark },
    ].filter(Boolean),
    frames: [{ name: "Mark frame", ...SUP_HEAD_PLACE.box }],
    /* A4 portrait, their own margins, fitted to the width of it and left to run
       on down as many pages as the shipment needs — a long order is a longer
       list, not a smaller one. */
    page: {
      paper: 9, orientation: "portrait", fit: true, fitW: 1, fitH: 0,
      margins: { left: 0.511811, right: 0.511811, top: 0.511811, bottom: 0.511811, header: 0, footer: 0 },
    },
  }, { widen: false });
}

export function suppliersDetails(ctx) {
  const all = sup23Rows(ctx);
  const total = SUP_W.reduce((a, x) => a + x, 0);
  const colg = SUP_W.map((x) => `<col style="width:${((x / total) * 100).toFixed(3)}%">`).join("");
  /* The letterhead stands over the first seven rows here as it stands over the
     first eight of the declaration, and is placed the same way: by the share of
     the form and of those rows its own measurements give it. */
  const pc = (v, of) => `${(v / of * 100).toFixed(3)}%`;
  const wide = SUP_COL.reduce((a, x) => a + x, 0);
  const deep = SUP_LH_ROW * SUP_HEAD;
  const place = (p) => `left:${pc(p.x, wide)};top:${pc(p.y, deep)};width:${pc(p.cx, wide)}`
    + (p.cy ? `;height:${pc(p.cy, deep)}` : "");
  const letterhead = `<tr><td colspan="8" class="lh"><div class="lhbox"
    >${imgTag(ADDRESS_SRC, "lhaddr", place(SUP_PLACE.addr))}<span class="lhbx" style="${place(SUP_PLACE.box)}"></span
    >${imgTag(LOGO_SRC, "lhlogo", place(SUP_PLACE.mark))}</div></td></tr>`;
  const body = all.filter((r) => !r.lh).map((r) => `<tr>${r.cells.map(([span, v, spec]) => {
    const cls = supClass(spec);
    return `<td${cls ? ` class="${cls}"` : ""}${span > 1 ? ` colspan="${span}"` : ""}>${esc(v) || "&nbsp;"}</td>`;
  }).join("")}</tr>`).join("");
  return `<div class="sup"><table><colgroup>${colg}</colgroup>${letterhead}${body}</table></div>`;
}

export const B_23 = (ctx) => ({
  name: "Suppliers_Details",
  html: suppliersDetails(ctx),
  sheet: sup23Sheet(ctx, "Suppliers Details"),
  page: "portrait",
});
