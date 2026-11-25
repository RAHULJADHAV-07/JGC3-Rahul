import { PKD, PKD_ADDR, PKD_ADDR_CX, PKD_BASE, PKD_CLASS, PKD_COL_AJ, PKD_DEFAULT_W, PKD_HEAD_CY, PKD_MARK, PKD_MARK_BOX, PKD_MARK_BOX_CX, PKD_MARK_BOX_CY, PKD_MARK_CX, PKD_MARK_CY, PKD_PLACE, PKD_SCALE, esc, fitSheet, formGrid, pkd21Rows, pkdWidths } from "./common.js";
import { ADDRESS_SRC, LOGO_SRC, addressImage, imgTag, logoImage } from "../logo.js";

export function pkd21Sheet(ctx, name, opts) {
  const rows = pkd21Rows(ctx, opts);
  const G = formGrid(10);
  rows.forEach((r) => G.row(r.cells.map(([span, v, k]) => [span, { v, s: PKD[k] }]), r.h));
  const mark = logoImage();
  return fitSheet({
    name,
    rows: G.rows,
    merges: G.merges,
    heights: G.heights,
    // The columns their sheet sets, widened to the text this consignment carries.
    widths: pkdWidths(rows, PKD_BASE),
    defaultColWidth: PKD_DEFAULT_W * PKD_SCALE,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    /* The letterhead: the printed block where their text box sits, and the mark
       inside the frame ruled beside it — each anchored where their file anchors
       it rather than squared off to the columns it happens to cross. */
    images: [
      addressImage(PKD_ADDR_CX) && { ...addressImage(PKD_ADDR_CX), ...PKD_ADDR },
      mark && { ...mark, name: "Mark", ...PKD_MARK, cx: PKD_MARK_CX, cy: PKD_MARK_CY },
    ].filter(Boolean),
    frames: [{ name: "Mark frame", ...PKD_MARK_BOX, cx: PKD_MARK_BOX_CX, cy: PKD_MARK_BOX_CY }],
    /* Their file fits the form to one page both ways. Say only the height and
       a reader takes the width as unbounded, fits the form to the page's depth
       alone, and — this being a short form — prints it half again too big. */
    page: {
      paper: 9, orientation: "portrait", fit: true, fitW: 1, fitH: 1,
      margins: { left: 0.75, right: 0.5, top: 0.5, bottom: 0.5, header: 0.511811, footer: 0.511811 },
    },
  }, { widen: false });
}

/* The same form on screen and on paper: the ten columns of the worksheet as
   one table, so the preview, the PDF and the .xlsx are the one document. */
export function packagingDeclaration(ctx, opts) {
  const all = pkd21Rows(ctx, opts);
  // The same columns the worksheet is ruled to, so the two read alike.
  const w = pkdWidths(all, PKD_BASE);
  const total = w.reduce((a, x) => a + x, 0);
  const colg = w.map((x) => `<col style="width:${((x / total) * 100).toFixed(3)}%">`).join("");
  const cell = ([span, v, k]) => {
    const cls = PKD_CLASS[k];
    return `<td${cls ? ` class="${cls}"` : ""}${span > 1 ? ` colspan="${span}"` : ""}>${esc(v) || "&nbsp;"}</td>`;
  };
  /* The letterhead is the two blocks the worksheet floats over its first eight
     rows, and they float here too, each placed by the share of the form and of
     those eight rows its own anchor gives it. That is what keeps the block set
     in from the left and down from the top and the mark stopping short of the
     right edge, the way their sheet has it; laid on the cells instead, both
     would be dragged out to whichever column edges they fell between. Each
     carries its own frame — the block's is part of the printed block. */
  // The block is left to the height of its own picture; the frame and the mark
  // are given theirs, since the anchors set both.
  const pc = (v, of) => `${(v / of * 100).toFixed(3)}%`;
  const place = (p) => `left:${pc(p.x, PKD_COL_AJ)};top:${pc(p.y, PKD_HEAD_CY)};width:${pc(p.cx, PKD_COL_AJ)}`
    + (p.cy ? `;height:${pc(p.cy, PKD_HEAD_CY)}` : "");
  // Either picture may still be on its way; the frame is ruled either way, as it
  // is on the sheet.
  const letterhead = `<tr><td colspan="10" class="lh"><div class="lhbox"
    >${imgTag(ADDRESS_SRC, "lhaddr", place(PKD_PLACE.addr))}<span class="lhbx" style="${place(PKD_PLACE.box)}"></span
    >${imgTag(LOGO_SRC, "lhlogo", place(PKD_PLACE.mark))}</div></td></tr>`;
  const body = all.filter((r) => !r.lh)
    .map((r) => `<tr>${r.cells.map(cell).join("")}</tr>`).join("");
  return `<div class="pkd"><table><colgroup>${colg}</colgroup>
    ${letterhead}${body}</table></div>`;
}

export const B_21 = (ctx) => ({
  name: "Packing_Declaration",
  html: packagingDeclaration(ctx),
  sheet: pkd21Sheet(ctx, "Declaration"),
  page: "portrait",
});
