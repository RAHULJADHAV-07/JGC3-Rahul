import { DL, SDF_ENCLOSURES, SDF_FEMA, SIGNATORY, ddmm, esc, formGrid, letterFootBlock, letterFootRows, letterSheet, letterSignRows, letterheadBlock, letterheadRows, sdfParticulars } from "./common.js";

export const letterSignBlock = (ctx, E) => `<p class="sign">For M/s. ${esc(E.name)}<br>Proprietor- ${esc(SIGNATORY)}</p>
    <p>Date &nbsp; : &nbsp; ${ddmm(ctx.inv.date)} &nbsp;&nbsp;&nbsp;&nbsp; Signature &nbsp; :</p>`;

export function sdf15Sheet(ctx) {
  const E = ctx.EXPORTER;
  const G = formGrid(6);
  const { row, gap } = G;

  letterheadRows(G, E);
  row([[6, { v: "D E C L A R A T I O N", s: DL.midB }]]);
  gap();
  row([[6, { v: "I/We declare that the particulars given herein above are true, correct and complete.", s: DL.body }]]);
  gap();
  row([[6, { v: "I/We enclose herewith copies of the following documents *:", s: DL.body }]]);
  gap();

  SDF_ENCLOSURES.forEach(([lines, answer, at], n) => lines.forEach((text, i) => {
    row([[1, { v: i === 0 ? `${n + 1}.` : "", s: DL.n }],
      [3, { v: text, s: DL.body }],
      [2, { v: i === at ? answer : "", s: DL.body }]]);
  }));
  gap();

  sdfParticulars(ctx).forEach((cells) => row([
    [2, { v: cells[0], s: DL.bx }], [1, { v: cells[1], s: DL.bx }],
    [2, { v: cells[2], s: DL.bx }], [1, { v: cells[3], s: DL.bx }],
  ]));
  gap();

  row([[6, { v: SDF_FEMA, s: DL.just }]]);
  gap();
  row([[6, { v: "* To be submitted with the exports goods in the warehouse.", s: DL.body }]]);
  gap();

  letterSignRows(G, ctx, E);
  letterFootRows(G, E);
  return letterSheet("SDF", G);
}

export const B_15 = (ctx) => {
  const E = ctx.EXPORTER;
  const encl = SDF_ENCLOSURES.map(([lines, answer, at], n) => lines.map((text, i) => `<tr>
        <td class="n">${i === 0 ? `${n + 1}.` : ""}</td>
        <td>${esc(text)}</td>
        <td class="ans">${i === at ? answer : ""}</td>
      </tr>`).join("")).join("");
  const box = sdfParticulars(ctx).map((cells) => `<tr>${cells
    .map((v, i) => `<td${i === 0 || i === 2 ? ' class="lbl"' : ""}>${esc(v)}</td>`).join("")}</tr>`).join("");

  const html = `<div class="dl just a4">
    ${letterheadBlock(E)}

    <p class="mid b">D E C L A R A T I O N</p>
    <p>I/We declare that the particulars given herein above are true, correct and complete.</p>
    <p>I/We enclose herewith copies of the following documents *:</p>

    <table class="ins encl">${encl}</table>
    <table class="bx">${box}</table>

    <p>${esc(SDF_FEMA)}</p>
    <p>* To be submitted with the exports goods in the warehouse.</p>

    ${letterSignBlock(ctx, E)}

    ${letterFootBlock(E)}
  </div>`;
  return { name: "SDF_Declaration_15", html, sheet: sdf15Sheet(ctx), page: "portrait" };
};
