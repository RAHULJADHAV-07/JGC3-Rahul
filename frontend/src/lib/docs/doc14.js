import { AIR_CUSTOMS, DL, LETTER_DATE, SCOMET_TERMS, SIGNATORY, airOf, ddmm, scometAirText, esc, formGrid, letterFootBlock, letterFootRows, letterSheet, letterheadBlock, letterheadRows, scometRef } from "./common.js";

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

/* By air the declaration is a letter to customs at the air cargo complex
   (Docs/JG_Air_Docs/Scomet Declaration.pdf). */
export function scomet14AirSheet(ctx) {
  const E = ctx.EXPORTER;
  const t = scometAirText(ctx);
  const G = formGrid(6);
  const { row, gap } = G;
  letterheadRows(G, E);
  row([[6, { v: LETTER_DATE(ctx.inv.date), s: DL.body }]]);
  gap();
  row([[6, { v: "To,", s: DL.body }]]);
  AIR_CUSTOMS.forEach((l) => row([[6, { v: l, s: DL.body }]]));
  gap();
  row([[1, { v: "Subject", s: DL.key }], [5, { v: "Scomet Declaration", s: DL.b }]]);
  row([[1, { v: "Ref", s: DL.key }], [5, { v: `Invoice No ${scometRef(ctx)}`, s: DL.b }]]);
  gap();
  row([[6, { v: "Dear Sir,", s: DL.body }]]);
  gap();
  row([[6, { v: t.lead, s: DL.just }]]);
  gap();
  row([[6, { v: t.declare, s: DL.just }]]);
  gap();
  row([[1, { v: "End Use", s: DL.key }], [5, { v: t.endUse, s: DL.body }]]);
  gap();
  row([[6, { v: "Thanking you", s: DL.body }]]);
  row([[6, { v: "Yours Faithfully", s: DL.body }]]);
  gap(18);
  gap(18);
  row([[3, { v: `For M/s. ${E.name}`, s: DL.body }]]);
  row([[3, { v: `Proprietor- ${SIGNATORY}`, s: DL.body }]]);
  gap();
  letterFootRows(G, E);
  return letterSheet("SCOMET", G);
}

function scometAirHtml(ctx) {
  const E = ctx.EXPORTER;
  const t = scometAirText(ctx);
  return `<div class="dl just a4">
    ${letterheadBlock(E)}
    <p>${esc(LETTER_DATE(ctx.inv.date))}</p>
    <p class="to">To,<br>${AIR_CUSTOMS.map(esc).join("<br>")}</p>
    ${letterFieldBlock("Subject", "Scomet Declaration")}
    ${letterFieldBlock("Ref", `Invoice No ${scometRef(ctx)}`)}
    <p>Dear Sir,</p>
    <p>${esc(t.lead)}</p>
    <p>${esc(t.declare)}</p>
    ${letterFieldBlock("End Use", t.endUse)}
    <p>Thanking you<br>Yours Faithfully</p>
    <p class="sign">For M/s. ${esc(E.name)}<br>Proprietor- ${esc(SIGNATORY)}</p>
    ${letterFootBlock(E)}
  </div>`;
}

export const B_14 = (ctx) => {
  const E = ctx.EXPORTER;
  if (airOf(ctx)) return { name: "Scomet_Declaration_14", html: scometAirHtml(ctx), sheet: scomet14AirSheet(ctx), page: "portrait" };
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
