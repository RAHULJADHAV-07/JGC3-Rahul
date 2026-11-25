import { CS_COL, CS_HEAD, CS_PLACE, CS_ROW, CS_W, anchorAt, cs28Docs, csClass, csStyle, esc, fitSheet, formGrid } from "./common.js";
import { ADDRESS_SRC, LOGO_SRC, addressImage, imgTag, logoImage } from "../logo.js";

/* 28 · Cost sheets. One sheet per factory on the invoice, each on the printed
   letterhead — the same block the suppliers' details (23) carries, sized to the
   head of this paper. */

const at = (p) => anchorAt(CS_COL, CS_ROW, p);

function csSheet(ctx, name, rows) {
  const G = formGrid(12);
  rows.forEach((r) => G.row(r.cells.map(([span, v, spec]) => [span, { v, s: csStyle(spec) }]), r.h));
  const mark = logoImage();
  const addr = addressImage(CS_PLACE.addr.cx);
  return fitSheet({
    name,
    rows: G.rows,
    merges: G.merges,
    heights: Array.from({ length: G.rows.length }, (_, i) => G.heights[i] || 15),
    widths: CS_W,
    defaultRowHeight: 15,
    colStyle: { font: "cal", border: false },
    images: [
      addr && { ...addr, ...at(CS_PLACE.addr) },
      mark && { ...mark, name: "Mark", ...at(CS_PLACE.mark) },
    ].filter(Boolean),
    frames: [{ name: "Mark frame", ...at(CS_PLACE.box) }],
    /* Their own paper: A4 portrait, fitted to the width and left to run on down
       if a factory's list is long. */
    page: {
      paper: 9, orientation: "portrait", fit: true, fitW: 1, fitH: 0,
      margins: { left: 0.748031, right: 0.511811, top: 0.511811, bottom: 0.511811, header: 0, footer: 0 },
    },
  }, { widen: false });
}

function csHtml(rows) {
  const total = CS_W.reduce((a, x) => a + x, 0);
  const colg = CS_W.map((x) => `<col style="width:${((x / total) * 100).toFixed(3)}%">`).join("");
  const wide = CS_COL.reduce((a, x) => a + x, 0);
  const deep = CS_ROW * CS_HEAD;
  const pc = (v, of) => `${(v / of * 100).toFixed(3)}%`;
  const place = (p) => `left:${pc(p.x, wide)};top:${pc(p.y, deep)};width:${pc(p.cx, wide)}`
    + (p.cy ? `;height:${pc(p.cy, deep)}` : "");
  const letterhead = `<tr><td colspan="12" class="lh"><div class="lhbox"
    >${imgTag(ADDRESS_SRC, "lhaddr", place(CS_PLACE.addr))}<span class="lhbx" style="${place(CS_PLACE.box)}"></span
    >${imgTag(LOGO_SRC, "lhlogo", place(CS_PLACE.mark))}</div></td></tr>`;
  const body = rows.filter((r) => !r.lh).map((r) => `<tr>${r.cells.map(([span, v, spec]) => {
    const cls = csClass(spec);
    return `<td${cls ? ` class="${cls}"` : ""}${span > 1 ? ` colspan="${span}"` : ""}>${esc(v) || "&nbsp;"}</td>`;
  }).join("")}</tr>`).join("");
  return `<div class="cs"><table><colgroup>${colg}</colgroup>${letterhead}${body}</table></div>`;
}

export const B_28 = (ctx) => {
  const docs = cs28Docs(ctx);
  return {
    name: "Cost_Sheets",
    // One paper per factory, each starting a page of its own.
    html: docs.map((d) => csHtml(d.rows)).join('<div class="pgbrk"></div>'),
    sheets: docs.map((d) => csSheet(ctx, d.code, d.rows)),
    page: "portrait",
  };
};
