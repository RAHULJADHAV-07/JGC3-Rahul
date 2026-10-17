import { DL, SCOMET_TERMS, SIGNATORY, ddmm, esc, formGrid, letterFootBlock, letterFootRows, letterSheet, letterheadBlock, letterheadRows, scometRef } from "./common.js";

export const letterFieldBlock = (label, value) => `<table class="fld"><tr>
      <td class="lbl">${esc(label)}</td><td class="b">${esc(value)}</td></tr></table>`;

export function scomet14Sheet(ctx) {
  const E = ctx.EXPORTER;
  const G = formGrid(6);
  const { row, gap } = G;

  letterheadRows(G, E);
  row([[2, { v: "Invoice No & Date", s: DL.body }], [4, { v: scometRef(ctx), s: DL.b }]]);
  gap();
  row([[6, { v: `WE M/S. ${E.name} FURTHER UNDERTAKE AND CONFIRM`, s: DL.mid }]]);
  gap();
  SCOMET_TERMS.forEach((t) => {
    row([[1, { v: "•", s: DL.n }], [5, { v: t, s: DL.just }]]);
    gap(6);
  });
  gap();
  row([[6, { v: "Thanking you.", s: DL.body }]]);
  gap();
  row([[3, { v: `For M/s. ${E.name}`, s: DL.body }]]);
  gap(18);
  gap(18);
  row([[3, { v: `Proprietor- ${SIGNATORY}`, s: DL.body }]]);
  gap();
  row([[3, { v: ddmm(ctx.inv.date), s: DL.body }]]);
  gap();

  letterFootRows(G, E);
  return letterSheet("SCOMET", G);
}

export const B_14 = (ctx) => {
  const E = ctx.EXPORTER;
  const html = `<div class="dl just a4">
    ${letterheadBlock(E)}

    ${letterFieldBlock("Invoice No & Date", scometRef(ctx))}
    <p class="mid">WE M/S. ${esc(E.name)} FURTHER UNDERTAKE AND CONFIRM</p>

    <table class="ins">
      ${SCOMET_TERMS.map((t) => `<tr><td class="n">•</td><td>${esc(t)}</td></tr>`).join("")}
    </table>

    <p>Thanking you.</p>
    <p class="sign">For M/s. ${esc(E.name)}<br>Proprietor- ${esc(SIGNATORY)}</p>
    <p>${ddmm(ctx.inv.date)}</p>

    ${letterFootBlock(E)}
  </div>`;
  return { name: "Scomet_Declaration_14", html, sheet: scomet14Sheet(ctx), page: "portrait" };
};
