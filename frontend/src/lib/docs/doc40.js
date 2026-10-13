import { EBR_HEAD_PLACE, EBR_W, PKD_ADDR_CX, PKD_COL_AJ, PKD_HEAD_CY, PKD_PLACE, ebr40Rows, ebrClass, ebrStyle, esc, fitSheet, formGrid } from "./common.js";
import { ADDRESS_SRC, LOGO_SRC, addressImage, imgTag, logoImage } from "../logo.js";

/* 40 · Export bill regularisation submission. One description of their letter
   (common.js) laid out three ways, on the declaration's own paper — the same
   ten columns and the same printed letterhead across the head of it. */

export function ebr40Sheet(ctx, name) {
  const rows = ebr40Rows(ctx);
  const G = formGrid(10);
  const rowBreaks = [];
  rows.forEach((r) => {
    const at = G.row(r.cells.map(([span, v, spec]) => [span, { v, s: ebrStyle(spec) }]), r.h);
    if (r.brk) rowBreaks.push(at - 1);
  });
  const mark = logoImage();
  const addr = addressImage(PKD_ADDR_CX);
  return fitSheet({
    name,
    rows: G.rows,
    merges: G.merges,
    heights: G.heights,
    rowBreaks,
    widths: EBR_W,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false },
    /* The three pieces of the letterhead are drawn corner to corner, the way
       their own file draws them, so each keeps its place against the columns
       rather than being pinned to one cell and sized in inches. */
    images: [
      addr && { ...addr, ...EBR_HEAD_PLACE.addr },
      mark && { ...mark, name: "Mark", ...EBR_HEAD_PLACE.mark },
    ].filter(Boolean),
    frames: [{ name: "Mark frame", ...EBR_HEAD_PLACE.box }],
    /* Their paper: A4 portrait, running on down as many pages as the
       declarations take.

       Their file says 86% and also asks to be fitted to one page across, and
       the fit is what actually decides the size. It lands on 88% — not because
       the form is that wide, but because of a stray space somebody left in K21,
       one column past the last one the form uses, which drags the printed range
       out with it. Their copy therefore comes off the printer at 88%, and this
       says 88% flatly rather than reproducing a typo to arrive there. */
    page: {
      paper: 9, orientation: "portrait", scale: 88, fitH: 0,
      margins: { left: 0.75, right: 0.5, top: 0.5, bottom: 0.5, header: 0, footer: 0 },
    },
  }, { widen: false });
}

export function billRegularisation(ctx) {
  const all = ebr40Rows(ctx);
  const total = EBR_W.reduce((a, x) => a + x, 0);
  const colg = EBR_W.map((x) => `<col style="width:${((x / total) * 100).toFixed(3)}%">`).join("");
  const pc = (v, of) => `${(v / of * 100).toFixed(3)}%`;
  const place = (p) => `left:${pc(p.x, PKD_COL_AJ)};top:${pc(p.y, PKD_HEAD_CY)};width:${pc(p.cx, PKD_COL_AJ)}`
    + (p.cy ? `;height:${pc(p.cy, PKD_HEAD_CY)}` : "");
  const letterhead = `<tr><td colspan="10" class="lh"><div class="lhbox"
    >${imgTag(ADDRESS_SRC, "lhaddr", place(PKD_PLACE.addr))}<span class="lhbx" style="${place(PKD_PLACE.box)}"></span
    >${imgTag(LOGO_SRC, "lhlogo", place(PKD_PLACE.mark))}</div></td></tr>`;
  /* Rows carry the depth the sheet gives them — their blocks stand on rows
     twice the letter's — so the paper reads the same in all three. */
  const line = (r) => {
    const h = r.h ? ` style="height:calc(var(--ebrpt) * ${r.h})"` : "";
    return `<tr${h}>${r.cells.map(([span, v, spec]) => {
      const cls = ebrClass(spec);
      return `<td${cls ? ` class="${cls}"` : ""}${span > 1 ? ` colspan="${span}"` : ""}>${esc(v) || "&nbsp;"}</td>`;
    }).join("")}</tr>`;
  };
  /* The page ends where the sheet says it ends, not where the paper runs out.
     Each sheet is cut as its own block, as doc17.js cuts the order's, so every
     one keeps the whole A4 inset — one table broken by the print engine keeps
     it only at the head of the first page, which left the declarations flush
     against the top of the paper. */
  const sheets = [[]];
  all.filter((r) => !r.lh).forEach((r) => {
    if (r.brk) sheets.push([]);
    sheets[sheets.length - 1].push(r);
  });
  return sheets.map((rs, i) => `<div class="ebrpg"><div class="ebr"><table><colgroup>${colg}</colgroup>${
    i === 0 ? letterhead : ""}${rs.map(line).join("")}</table></div></div>`).join("");
}

export const B_40 = (ctx) => ({
  name: "Bill_Regularisation_40",
  html: billRegularisation(ctx),
  sheet: ebr40Sheet(ctx, "Regularisation"),
  page: "portrait",
});
