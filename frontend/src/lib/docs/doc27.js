import { DL, VGM_NOTES, esc, formGrid, letterFootBlock, letterFootRows, letterSheet, letterheadBlock, letterheadRows, vgm27Rows, vgm27Sign } from "./common.js";
import { HEAD27_ASPECT, HEAD27_SRC, SIGN_SRC, STAMP_SRC, head27Image, imgTag, signImage, stampImage } from "../logo.js";
import { calibriLines } from "../calibri.js";

const EMU_PX = 9525;

/* 27 · Declaration of verified gross mass. Their letter paper, a heading, and
   the fifteen particulars ruled into three columns — the serial, what is asked,
   and what is answered.

   The sheet is laid to the page (download.js · .vgm): 9.5pt type on a 1.25
   line, the particulars at 6 / 50 / 44 per cent of the width, and under them
   the signing lines over the first 52%, the stamp in the next 20% and the
   signature in the last 28%. Seven columns put an edge at each of those —
   the second is the width of the signing lines' labels. */
const VGM_W = [6, 7, 39, 4, 16, 14, 14];
const VGM_PX = 190 * 96 / 25.4;               // the text's width inside 10mm margins
const VGM_LINE = 9.5 * 1.25;
/* The particulars and the signing lines are boxes and instruction lines of
   the letter, which the page sets at the letters' 10.5pt (.dl table.bx td,
   .dl .ins td) on the sheet's 1.25 line; the rest is the sheet's 9.5pt. */
const BOX_PT = 10.5;
const BOX_LINE = BOX_PT * 1.25;
const px = (from, to) => VGM_W.slice(from, to).reduce((a, b) => a + b, 0) / 100 * VGM_PX;
const VG = {
  mid: { font: "vgbu", border: false, align: "center", valign: "center" },
  head: { font: "letb", border: "box", valign: "center", wrap: true },
  cell: { font: "base", border: "box", valign: "center", wrap: true },
  line: { font: "base", border: false, valign: "top" },
  body: { font: "vg", border: false, valign: "center" },
  u: { font: "vgu", border: false, valign: "center" },
};

export function vgm27Sheet(ctx) {
  const E = ctx.EXPORTER;
  const G = formGrid(7);
  const { row, gap } = G;
  G.footLh = 1.25;
  const images = [];

  /* The scanned letterhead across the width of the text, then the rule 5px
     under it. Should the scan not have arrived, the letters' typeset head. */
  const head = head27Image(Math.round(VGM_PX * EMU_PX));
  if (head) {
    // The scan's dead black edge clipped off, as the page clips it (.vghimg).
    images.push({ ...head, row: 0, rowOff: 0, x: 0, cropR: 0.32 });
    row([[7, { v: "", s: DL.rule }]], (VGM_PX / HEAD27_ASPECT + 5) * 0.75);
    gap(6);
  } else letterheadRows(G, E);

  row([[7, { v: "DECLARATION OF VERIFIED GROSS MASS OF CONTAINER", s: VG.mid }]], VGM_LINE);
  gap(4.5);

  // Each box is as tall as its lines, 1px over and under them.
  const tall = (texts) => Math.max(...texts.map(([t, w]) => calibriLines(t, BOX_PT, (w - 8) * 0.75 * 0.99).length)) * BOX_LINE + 2.25;
  const box = (cells, st) => {
    const fit = [[cells[0], px(0, 1)], [cells[1], px(1, 4)], [cells[2], px(4, 7)]];
    // A box whose text fits on its line is not wrapped, so nothing re-reckons it.
    const cell = (i) => ({ v: cells[i], s: tall([fit[i]]) > BOX_LINE + 3 ? st : { ...st, wrap: false } });
    row([[1, cell(0)], [3, cell(1)], [3, cell(2)]], tall(fit));
  };
  box(["Sr No.", "Details of information", "Particulars"], VG.head);
  vgm27Rows(ctx).forEach((r) => box(r, VG.cell));
  gap(6);

  row([[7, { v: "Signature of authorized person of shipper", s: VG.body }]], VGM_LINE);
  gap(3.75);
  /* The signing lines, 3px apart; the stamp centred beside them and the
     signature against the right margin, level with their top. The scan reads
     "For M/s. … Proprietor- …", so it stands in for those typed lines. */
  const at = G.rows.length;
  const sign = signImage(Math.round(px(5, 7) * EMU_PX));
  const lines = vgm27Sign(ctx);
  lines.forEach(([k, v], i) => {
    row([[2, { v: k, s: VG.line }], [2, { v: `:${v}`, s: VG.line }],
      [3, { v: sign ? "" : [`For M/s. ${E.name}`, `Proprietor- ${lines[0][1]}`][i] || "", s: VG.line }]], BOX_LINE + 2.25);
  });
  gap(7.5);
  const signH = lines.length * (BOX_LINE + 2.25) + 7.5;
  const stamp = stampImage(Math.round(px(4, 5) * 0.55 * EMU_PX));
  if (stamp) images.push({ ...stamp, row: at, rowOff: Math.max(0, Math.round((signH * 12700 - stamp.cy) / 2)), x: px(0, 4) + (px(4, 5) - stamp.cx / EMU_PX) / 2 });
  if (sign) images.push({ ...sign, row: at, rowOff: 0, x: px(0, 5) });
  gap(6);

  row([[7, { v: "Remarks:", s: VG.u }]], VGM_LINE);
  VGM_NOTES.forEach((t) => row([[7, { v: t, s: VG.body }]], VGM_LINE));

  letterFootRows(G, E);
  return letterSheet("VGM", G, VGM_W, images, { mark: !head, linePt: BOX_LINE });
}

export function vgmDeclaration(ctx) {
  const E = ctx.EXPORTER;
  const body = vgm27Rows(ctx).map(([sr, ask, answer]) => `<tr>
      <td class="sr">${esc(sr)}</td><td class="ask">${esc(ask)}</td><td class="ans">${esc(answer)}</td></tr>`).join("");
  const sign = vgm27Sign(ctx).map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>:</td><td>${esc(v)}</td></tr>`).join("");
  /* This one is headed by the scanned strip rather than by the name set in
     type, so the paper carries their letterhead as it really prints. Should the
     scan not have arrived — offline, or the fetch blocked — the letters' own
     typeset head stands in, rather than the sheet coming out with no head. */
  const head = HEAD27_SRC
    ? `<div class="vghead">${imgTag(HEAD27_SRC, "vghimg")}</div><div class="rule"></div>`
    : letterheadBlock(E);

  return `<div class="dl vgm">
    ${head}

    <p class="mid b u">DECLARATION OF VERIFIED GROSS MASS OF CONTAINER</p>

    <table class="bx vgmt"><tr>
      <td class="sr b">Sr No.</td><td class="ask b">Details of information</td><td class="ans b">Particulars</td>
    </tr>${body}</table>

    <p>Signature of authorized person of shipper</p>
    <table class="sg"><tr><td>
      <table class="ins">${sign}</table>
    </td><td class="sgst">${imgTag(STAMP_SRC, "vgstamp")}</td><td class="sgr">
      ${SIGN_SRC ? imgTag(SIGN_SRC, "vgsign")
    : `<div>For M/s. ${esc(E.name)}</div><div>Proprietor- ${esc(vgm27Sign(ctx)[0][1])}</div>`}
    </td></tr></table>

    <p class="u nb">Remarks:</p>
    ${VGM_NOTES.map((t) => `<p class="nb">${esc(t)}</p>`).join("")}

    ${letterFootBlock(E)}
  </div>`;
}

export const B_27 = (ctx) => ({
  name: "VGM",
  html: vgmDeclaration(ctx),
  sheet: vgm27Sheet(ctx),
  page: "portrait",
});
