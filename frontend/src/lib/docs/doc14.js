import { AIR_CUSTOMS, DL, DL_SIGN_GAP, LETTER_DATE, SCOMET_TERMS, SIGNATORY, airOf, ddmm, scometAirText, esc, formGrid, letterFootBlock, letterFootRows, letterSheet, letterSignImages, letterheadBlock, letterheadRows, scometRef, signedHtml } from "./common.js";

export const letterFieldBlock = (label, value, bold = true) => `<table class="fld"><tr>
      <td class="lbl">${esc(label)}</td><td${bold ? ' class="b"' : ""}>${esc(value)}</td></tr></table>`;

export function scomet14Sheet(ctx) {
  const E = ctx.EXPORTER;
  const G = formGrid(6);
  const { row, gap } = G;

  letterheadRows(G, E, { a4: true });
  // Spaced as the page spaces it: a field line 10px clear, a paragraph 16px,
  // each instruction 8px, the signature 64px under the text.
  row([[2, { v: "Invoice No & Date", s: DL.body }], [4, { v: scometRef(ctx), s: DL.b }]]);
  gap(7.5);
  row([[6, { v: `WE M/S. ${E.name} FURTHER UNDERTAKE AND CONFIRM`, s: DL.mid }]]);
  gap();
  SCOMET_TERMS.forEach((t) => {
    row([[1, { v: "•", s: DL.dot }], [5, { v: t, s: DL.just }]]);
    gap(6);
  });
  gap(7.5);
  row([[6, { v: "Thanking you.", s: DL.body }]]);
  gap(DL_SIGN_GAP);
  row([[6, { v: `For M/s. ${E.name}`, s: DL.body }]]);
  row([[6, { v: `Proprietor- ${SIGNATORY}`, s: DL.body }]]);
  gap();
  row([[6, { v: ddmm(ctx.inv.date), s: DL.body }]]);
  gap();

  letterFootRows(G, E);
  return letterSheet("SCOMET", G, undefined, undefined);
}

/* By air the declaration is a letter to customs at the air cargo complex
   (Docs/JG_Air_Docs/Scomet Declaration.pdf). */
export function scomet14AirSheet(ctx) {
  const E = ctx.EXPORTER;
  const t = scometAirText(ctx);
  const G = formGrid(6);
  const { row, gap } = G;
  letterheadRows(G, E, { a4: true });
  row([[6, { v: LETTER_DATE(ctx.inv.date), s: DL.body }]]);
  gap();
  row([[6, { v: "To,", s: DL.body }]]);
  AIR_CUSTOMS.forEach((l) => row([[6, { v: l, s: DL.body }]]));
  gap();
  // Their air letter sets the subject, the reference and the end use plain,
  // each a field line with its label in the first quarter of the page.
  row([[2, { v: "Subject", s: DL.key }], [4, { v: "Scomet Declaration", s: DL.body }]]);
  gap(7.5);
  row([[2, { v: "Ref", s: DL.key }], [4, { v: `Invoice No ${scometRef(ctx)}`, s: DL.body }]]);
  gap(7.5);
  row([[6, { v: "Dear Sir,", s: DL.body }]]);
  gap();
  row([[6, { v: t.lead, s: DL.just }]]);
  gap();
  row([[6, { v: t.declare, s: DL.just }]]);
  gap();
  row([[2, { v: "End Use", s: DL.key }], [4, { v: t.endUse, s: DL.body }]]);
  gap(7.5);
  row([[6, { v: "Thanking you", s: DL.body }]]);
  row([[6, { v: "Yours Faithfully", s: DL.body }]]);
  // Signed and stamped, as their copy goes out.
  const sg = letterSignImages(G);
  if (!sg) {
    gap(DL_SIGN_GAP);
    row([[6, { v: `For M/s. ${E.name}`, s: DL.body }]]);
    row([[6, { v: `Proprietor- ${SIGNATORY}`, s: DL.body }]]);
    gap();
  }
  letterFootRows(G, E);
  return letterSheet("SCOMET", G, undefined, sg);
}

function scometAirHtml(ctx) {
  const E = ctx.EXPORTER;
  const t = scometAirText(ctx);
  return `<div class="dl just a4">
    ${letterheadBlock(E)}
    <p>${esc(LETTER_DATE(ctx.inv.date))}</p>
    <p class="to">To,<br>${AIR_CUSTOMS.map(esc).join("<br>")}</p>
    ${letterFieldBlock("Subject", "Scomet Declaration", false)}
    ${letterFieldBlock("Ref", `Invoice No ${scometRef(ctx)}`, false)}
    <p>Dear Sir,</p>
    <p>${esc(t.lead)}</p>
    <p>${esc(t.declare)}</p>
    ${letterFieldBlock("End Use", t.endUse, false)}
    <p>Thanking you<br>Yours Faithfully</p>
    ${signedHtml() || `<p class="sign">For M/s. ${esc(E.name)}<br>Proprietor- ${esc(SIGNATORY)}</p>`}
    ${letterFootBlock(E)}
  </div>`;
}

export const B_14 = (ctx) => {
  const E = ctx.EXPORTER;
  if (airOf(ctx)) return { name: "Scomet_Declaration", html: scometAirHtml(ctx), sheet: scomet14AirSheet(ctx), page: "portrait" };
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
  return { name: "Scomet_Declaration", html, sheet: scomet14Sheet(ctx), page: "portrait" };
};
