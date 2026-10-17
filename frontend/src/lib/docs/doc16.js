import { DL, RODTEP_LEAD, RODTEP_TERMS, RODTEP_TITLE, esc, formGrid, letterFootBlock, letterFootRows, letterSheet, letterSignRows, letterheadBlock, letterheadRows, scometRef } from "./common.js";
import { letterFieldBlock } from "./doc14.js";
import { letterSignBlock } from "./doc15.js";

export function rodtep16Sheet(ctx) {
  const E = ctx.EXPORTER;
  const G = formGrid(6);
  const { row, gap } = G;

  letterheadRows(G, E);
  row([[6, { v: "Annexure", s: DL.mid }]]);
  gap();
  row([[6, { v: RODTEP_TITLE, s: DL.mid }]]);
  gap();
  row([[2, { v: "Invoice No & Date", s: DL.body }], [4, { v: scometRef(ctx), s: DL.b }]]);
  gap();
  row([[6, { v: RODTEP_LEAD, s: DL.just }]]);
  gap();
  RODTEP_TERMS.forEach((t) => { row([[6, { v: t, s: DL.just }]]); gap(6); });
  gap();

  letterSignRows(G, ctx, E);
  letterFootRows(G, E);
  return letterSheet("RoDTEP", G);
}

export const B_16 = (ctx) => {
  const E = ctx.EXPORTER;
  const html = `<div class="dl just a4">
    ${letterheadBlock(E)}

    <p class="mid">Annexure</p>
    <p class="mid">${esc(RODTEP_TITLE)}</p>
    ${letterFieldBlock("Invoice No & Date", scometRef(ctx))}

    <p>${esc(RODTEP_LEAD)}</p>
    ${RODTEP_TERMS.map((t) => `<p>${esc(t)}</p>`).join("")}

    ${letterSignBlock(ctx, E)}

    ${letterFootBlock(E)}
  </div>`;
  return { name: "RoDTEP_Declaration_16", html, sheet: rodtep16Sheet(ctx), page: "portrait" };
};
