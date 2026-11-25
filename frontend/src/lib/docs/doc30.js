import { LTB_COL, LTB_HEAD, LTB_PLACE, LTB_ROW, LTB_SIGN_CX, LTB_STAMP_CX, LTB_W, anchorAt, esc, fitSheet, formGrid, ltb30Rows, ltbClass, ltbStyle } from "./common.js";
import { ADDRESS_SRC, LOGO_SRC, SIGN_SRC, STAMP_SRC, addressImage, imgTag, logoImage, signImage, stampImage } from "../logo.js";

/* 30 · Letter to the buyer. Their letterhead over the head of it, the letter
   itself, and the client's own signature and stamp at the foot — the one paper
   in the library that goes out already signed. */

const at = (p) => anchorAt(LTB_COL, LTB_ROW, p);

/* Where the two scans sit: the block against the left margin and the stamp a
   little to the right of it, both standing on the rows left clear for them. */
const signAt = (rows) => {
  const row = rows.findIndex((r) => r.sg);
  const sign = signImage(LTB_SIGN_CX);
  const stamp = stampImage(LTB_STAMP_CX);
  return { row, sign, stamp };
};

export function ltb30Sheet(ctx, name) {
  const rows = ltb30Rows(ctx);
  const G = formGrid(17);
  rows.forEach((r) => G.row(r.cells.map(([span, v, spec]) => [span, { v, s: ltbStyle(spec) }]), r.h));
  const mark = logoImage();
  const addr = addressImage(LTB_PLACE.addr.cx);
  const { row, sign, stamp } = signAt(rows);
  return fitSheet({
    name,
    rows: G.rows,
    merges: G.merges,
    heights: G.heights,
    widths: LTB_W,
    defaultRowHeight: 15,
    colStyle: { font: "ref", border: false },
    images: [
      addr && { ...addr, ...at(LTB_PLACE.addr) },
      mark && { ...mark, name: "Mark", ...at(LTB_PLACE.mark) },
      sign && { ...sign, col: 0, colOff: 28440, row, rowOff: 28440 },
      stamp && { ...stamp, col: 10, colOff: 9360, row, rowOff: 57240 },
    ].filter(Boolean),
    frames: [{ name: "Mark frame", ...at(LTB_PLACE.box) }],
    // Their paper: A4 portrait, printed as it stands.
    page: {
      paper: 9, orientation: "portrait", fit: true, fitW: 1, fitH: 1,
      margins: { left: 0.75, right: 0.5, top: 0.5, bottom: 0.5, header: 0.511811, footer: 0.511811 },
    },
  }, { widen: false });
}

export function letterToBuyer(ctx) {
  const all = ltb30Rows(ctx);
  const total = LTB_W.reduce((a, x) => a + x, 0);
  const colg = LTB_W.map((x) => `<col style="width:${((x / total) * 100).toFixed(3)}%">`).join("");
  const wide = LTB_COL.reduce((a, x) => a + x, 0);
  const deep = LTB_ROW * LTB_HEAD;
  const pc = (v, of) => `${(v / of * 100).toFixed(3)}%`;
  const place = (p) => `left:${pc(p.x, wide)};top:${pc(p.y, deep)};width:${pc(p.cx, wide)}`
    + (p.cy ? `;height:${pc(p.cy, deep)}` : "");
  const letterhead = `<tr><td colspan="17" class="lh"><div class="lhbox"
    >${imgTag(ADDRESS_SRC, "lhaddr", place(LTB_PLACE.addr))}<span class="lhbx" style="${place(LTB_PLACE.box)}"></span
    >${imgTag(LOGO_SRC, "lhlogo", place(LTB_PLACE.mark))}</div></td></tr>`;
  /* The signature and the stamp stand over the rows left clear for them, at the
     share of the sheet's width their own measurements give them. */
  const signed = `<tr><td colspan="17" class="sgbox">
    ${imgTag(SIGN_SRC, "sgsign", `width:${pc(LTB_SIGN_CX, wide)}`)}
    ${imgTag(STAMP_SRC, "sgstamp", `width:${pc(LTB_STAMP_CX, wide)}`)}</td></tr>`;
  let signDone = false;
  const body = all.filter((r) => !r.lh).map((r) => {
    if (r.sg) { if (signDone) return ""; signDone = true; return signed; }
    return `<tr>${r.cells.map(([span, v, spec]) => {
      const cls = ltbClass(spec);
      return `<td${cls ? ` class="${cls}"` : ""}${span > 1 ? ` colspan="${span}"` : ""}>${esc(v) || "&nbsp;"}</td>`;
    }).join("")}</tr>`;
  }).join("");
  return `<div class="ltb"><table><colgroup>${colg}</colgroup>${letterhead}${body}</table></div>`;
}

export const B_30 = (ctx) => ({
  name: "Letter_to_Buyer",
  html: letterToBuyer(ctx),
  sheet: ltb30Sheet(ctx, "Letter to Buyer"),
  page: "portrait",
});
