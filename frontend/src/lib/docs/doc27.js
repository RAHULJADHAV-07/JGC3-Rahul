import { DL, VGM_NOTES, esc, formGrid, letterFootBlock, letterFootRows, letterSheet, letterheadBlock, letterheadRows, vgm27Rows, vgm27Sign } from "./common.js";
import { HEAD27_SRC, SIGN_SRC, STAMP_SRC, imgTag } from "../logo.js";

/* 27 · Declaration of verified gross mass. Their letter paper, a heading, and
   the fifteen particulars ruled into three columns — the serial, what is asked,
   and what is answered. The six columns of the letter are divided so those
   three come out at the widths their form gives them. */

const VGM_W = [6, 24, 24, 14, 14, 14];

export function vgm27Sheet(ctx) {
  const E = ctx.EXPORTER;
  const G = formGrid(6);
  const { row, gap } = G;

  letterheadRows(G, E);
  row([[6, { v: "DECLARATION OF VERIFIED GROSS MASS OF CONTAINER", s: DL.midBU }]]);
  gap();

  row([[1, { v: "Sr No.", s: DL.bxB }], [2, { v: "Details of information", s: DL.bxB }],
    [3, { v: "Particulars", s: DL.bxB }]]);
  vgm27Rows(ctx).forEach(([sr, ask, answer]) => row([
    [1, { v: sr, s: DL.bx }], [2, { v: ask, s: DL.bx }], [3, { v: answer, s: DL.bx }],
  ]));
  gap();

  row([[6, { v: "Signature of authorized person of shipper", s: DL.body }]]);
  gap();
  vgm27Sign(ctx).forEach(([k, v], i) => row([
    [2, { v: `${k}   :   ${v}`, s: DL.body }],
    [4, { v: i === 0 ? `For M/s. ${E.name}` : i === 1 ? `Proprietor- ${vgm27Sign(ctx)[0][1]}` : "", s: DL.body }],
  ]));
  row([[6, { v: "Remarks:", s: DL.u }]]);
  VGM_NOTES.forEach((t) => row([[6, { v: t, s: DL.body }]]));
  gap();

  letterFootRows(G, E);
  return letterSheet("VGM", G, VGM_W);
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
  name: "VGM_27",
  html: vgmDeclaration(ctx),
  sheet: vgm27Sheet(ctx),
  page: "portrait",
});
