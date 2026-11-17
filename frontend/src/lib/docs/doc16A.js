import { DL, LETTER_DATE, ORIGIN_TERMS, SIGNATORY, esc, formGrid, letterFootBlock, letterFootRows, letterSheet, letterSignRows, letterheadBlock, letterheadRows, originLead } from "./common.js";

/* 16A · Declaration of origin — that the goods are wholly of Indian origin,
   made from Indian materials, as an Australian buyer's customs asks of an air
   consignment (Docs/JG_Air_Docs/Australia Declaration.pdf). On the letterhead,
   like the other declarations (13–16). */
export function origin16aSheet(ctx) {
  const E = ctx.EXPORTER;
  const G = formGrid(6);
  const { row, gap } = G;
  letterheadRows(G, E);
  row([[6, { v: LETTER_DATE(ctx.inv.date), s: DL.body }]]);
  gap();
  row([[6, { v: "DECLARATION", s: DL.midB }]]);
  row([[6, { v: "TO WHOMSOEVER IT MAY CONCERN", s: DL.midB }]]);
  gap();
  row([[6, { v: originLead(ctx), s: DL.just }]]);
  gap();
  ORIGIN_TERMS.forEach((t) => { row([[6, { v: t, s: DL.just }]]); gap(6); });
  gap();
  // Dated at its head, the declaration is signed without a second date line.
  letterSignRows(G, ctx, E, { dated: false });
  letterFootRows(G, E);
  return letterSheet("Origin", G);
}

export const B_16A = (ctx) => {
  const E = ctx.EXPORTER;
  const html = `<div class="dl just a4">
    ${letterheadBlock(E)}
    <p>${esc(LETTER_DATE(ctx.inv.date))}</p>
    <p class="mid"><b>DECLARATION</b><br><b>TO WHOMSOEVER IT MAY CONCERN</b></p>
    <p>${esc(originLead(ctx))}</p>
    ${ORIGIN_TERMS.map((t) => `<p>${esc(t)}</p>`).join("")}
    <p class="sign">For M/s. ${esc(E.name)}<br>Proprietor- ${esc(SIGNATORY)}</p>
    ${letterFootBlock(E)}
  </div>`;
  return { name: "Origin_Declaration_16A", html, sheet: origin16aSheet(ctx), page: "portrait" };
};
