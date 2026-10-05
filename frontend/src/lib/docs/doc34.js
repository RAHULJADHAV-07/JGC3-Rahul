import { CWD_BLUE, CWD_BOX, CWD_CARGO, CWD_CLOSE, CWD_COMMODITY, CWD_METHOD, CWD_NOTES, CWD_RING, CWD_STATUS, CWD_UNIT, cwd34, esc, fitSheet, formGrid } from "./common.js";
import { SIGN_SRC, STAMP_SRC, imgTag, signImage, stampImage } from "../logo.js";
import { buildDOCX } from "../docx.js";

/* 34 · Container weight declaration. Their forwarder's statutory form, printed
   as their file prints it — see the note in common.js. It is a Word document of
   theirs, so this one hands over a .docx beside the PDF, the way 24 does.

   Their sheet is ruled on a grid of twips (1440 to the inch): the two blocks at
   the head take 2627 and 8054 of the 10681 the page is wide, and the run of
   choices under them is cut into six. The same numbers rule all three renderings
   below, so the paper, the preview and the Word copy line up. */

const CW_TW = [2654, 1565, 1700, 1701, 1560, 1501];
const CW_HEAD_TW = [2627, 8054];
/* The load-distribution box and the signature block are set narrower than the
   page on their sheet, as a form leaves room to write beside them. */
const CW_LOAD_TW = [2627, 4568];
const CW_SIGN_TW = [3794, 3890];
/* The run the methods are set on: the instruction, the four lines, and the room
   the stamp and the signature stand in to the right of them. */
const CW_METH_TW = [2700, 3000, 1500, 3481];
/* The stamp and the signature as their signed copy sizes them, in EMU — 914400
   to the inch — which is the measure a Word picture is stated in. */
const STAMP_EMU = Math.round(0.80 * 914400);
const SIGN_EMU = Math.round(1.90 * 914400);

const TOTAL = CW_TW.reduce((a, x) => a + x, 0);
const pct = (tw) => `${((tw / TOTAL) * 100).toFixed(3)}%`;
const cols = (g) => `<colgroup>${g.map((w) => `<col style="width:${pct(w)}">`).join("")}</colgroup>`;
const span = (n) => (n > 1 ? ` colspan="${n}"` : "");

/* A run of choices with the one that applies ringed. Their form asks for it to
   be circled by hand; ringing it here is the same mark, made before it prints,
   and keeps this sheet saying what document 27 says about the same box. */
const opts = (list, on) => list.map((o) => `<td class="opt${o === on ? " on" : ""}"><span>${esc(o)}</span></td>`).join("");

export function cwd34Html(ctx) {
  const d = cwd34(ctx);
  const party = (lines) => lines.map((l) => `<div class="v">${esc(l)}</div>`).join("");
  const HINT = "Name Address &amp; Phone Number Mandatory for Responsible Entity";
  /* Their head table sets a clear row between one block and the next, so the
     three stand as three boxes rather than one ruled run. */
  const GAP = '<tr class="gap"><td></td><td></td></tr>';
  const block = (label, inner) => `<tr><td class="k">${label}</td><td>${inner}</td></tr>`;

  return `<div class="cwd">
    <p class="ttl">Container Weight Declaration (CWD)</p>

    <table class="cwt hd">${cols(CW_HEAD_TW)}
      ${block("Container Number:", `<div class="hint">Mandatory</div><div class="v">${esc(d.container)}</div>`)}
      ${GAP}
      ${block("Consignor / Sender:", `<div class="hint">${HINT}</div>${party(d.consignor)}`)}
      ${GAP}
      ${block("Consignee / Receiver:", `<div class="hint">${HINT}</div>${party(d.consignee)}`)}
    </table>

    <table class="cwt gr">${cols(CW_TW)}
      <tr><td class="k">Status:</td>${opts(CWD_STATUS, CWD_RING.status)}
        <td class="note" colspan="3">(Please circle where applicable)</td></tr>
      <tr><td class="k">Cargo Type:</td>${opts(CWD_CARGO, CWD_RING.cargo)}<td></td></tr>
      <tr><td class="k">Container Type:</td>${opts(CWD_BOX.slice(0, 3), CWD_RING.box)}
        <td class="oth">${esc(CWD_BOX[3])}<div class="spec">Please specify:</div></td><td></td></tr>
      <tr><td class="k">Commodity:</td><td class="cmd" colspan="5">${esc(CWD_COMMODITY)}</td></tr>
      <tr><td class="k b">Weight:</td><td class="wh b">Container Tare Weight:</td>
        <td class="wh b" colspan="2">Cargo &amp; Packaging<br>Weight:</td>
        <td class="wh b" colspan="2">Container&amp; Cargo Gross Weight:</td></tr>
      <tr><td></td><td class="wv b">${esc(d.tare)}<br>${CWD_UNIT}</td>
        <td class="wv b" colspan="2">${esc(d.cargo)}<br>${CWD_UNIT}</td>
        <td class="wv b" colspan="2">${esc(d.gross)}<br>${CWD_UNIT}</td></tr>
    </table>

    <table class="cwt ld">${cols(CW_LOAD_TW)}
      <tr><td class="k">Indicate if uneven load Distribution:
        <div class="hint bl">(Mark X for Centre of Mass)</div></td>
        <td class="lb"><span class="dr">Doors<br>this<br>side</span>
          <svg class="xm" viewBox="0 0 60 60" preserveAspectRatio="xMidYMid meet" aria-hidden="true"
            ><line x1="8" y1="8" x2="52" y2="52"/><line x1="52" y1="8" x2="8" y2="52"/></svg></td></tr>
    </table>

    <table class="mth">
      <tr><td class="ml1">Method of Determining Weight:
          <div class="bl b">(Please circle where applicable)</div></td>
        <td class="ml">${CWD_METHOD.map((m, i) => `<div class="opt${i + 1 === CWD_RING.method ? " on" : ""}"><span>${i + 1}. ${esc(m)}</span></div>`).join("")}</td>
        <td class="sk">${imgTag(STAMP_SRC, "cwstamp")}</td>
        <td class="sn">${imgTag(SIGN_SRC, "cwsign")}</td></tr>
    </table>

    <p class="b re">Responsible Entity</p>
    <p class="b">Full Name &amp; Signature of Person Making Declaration:</p>

    <table class="cwt sg">${cols(CW_SIGN_TW)}
      <tr><td class="b"><span class="ul">Full Name:  ${esc(d.name)}</span></td>
        <td class="b">Signature:<span class="rule"></span></td></tr>
      <tr><td class="b">Date:  ${d.date.split("/").map((x) => `<span class="du">${esc(x.trim())}</span>`).join(" / ")}</td><td></td></tr>
    </table>

    <p class="nt hd2">Notes:</p>
    ${CWD_NOTES.map((t) => `<p class="nt">${esc(t)}</p>`).join("")}
    <p class="b cl">${esc(CWD_CLOSE)}</p>
  </div>`;
}

/* The same form as a worksheet. Their file is a Word document, so there is no
   grid of theirs to copy — the six columns the choices are cut into carry it,
   and everything wider runs across them. */
const CW = {
  ttl: { font: "cal18b", border: false, align: "center" },
  k: { font: "calb", border: "box", valign: "center", wrap: true },
  kn: { font: "cal", border: "box", valign: "center", wrap: true },
  box: { font: "cal", border: "box", valign: "top", wrap: true },
  opt: { font: "cal", border: "box", align: "center", valign: "center" },
  optOn: { font: "calbu", border: "box", align: "center", valign: "center" },
  note: { font: "calb", border: "box", align: "center", valign: "center", wrap: true },
  wh: { font: "cal10b", border: "box", align: "center", valign: "center", wrap: true },
  wv: { font: "cal10b", border: "box", align: "center", valign: "center" },
  p: { font: "cal", border: false, wrap: true },
  pb: { font: "calb", border: false, wrap: true },
  nt: { font: "cal7", border: false, wrap: true },
};

export function cwd34Sheet(ctx, name) {
  const d = cwd34(ctx);
  const G = formGrid(6);
  const { row, gap } = G;

  row([[6, { v: "Container Weight Declaration (CWD)", s: CW.ttl }]], 26);
  gap();

  /* The head runs on two columns of the six — one for the label, five for what
     is written against it — as their 2627/8054 divides the page. */
  const head = (label, lines, hint) => row([
    [1, { v: label, s: CW.k }],
    [5, { v: [hint, ...lines].join("\n"), s: CW.box }],
  ], Math.max(30, 14 * (lines.length + 1)));
  const HINT = "Name Address & Phone Number Mandatory for Responsible Entity";
  head("Container Number:", [d.container], "Mandatory");
  head("Consignor / Sender:", d.consignor, HINT);
  head("Consignee / Receiver:", d.consignee, HINT);
  gap();

  /* A ringed choice cannot be ringed on a worksheet, so the one that applies is
     set bold and underlined instead — the same mark, in what a cell can carry. */
  const choice = (label, list, on, tail) => row([
    [1, { v: label, s: CW.kn }],
    ...list.map((o) => [1, { v: o, s: o === on ? CW.optOn : CW.opt }]),
    ...(tail ? [[6 - 1 - list.length, { v: tail, s: CW.note }]] : []),
  ]);
  choice("Status:", CWD_STATUS, CWD_RING.status, "(Please circle where applicable)");
  choice("Cargo Type:", CWD_CARGO, CWD_RING.cargo, "");
  /* "Other" carries its own "Please specify" under it, in one cell, and the
     sixth of the run is left clear — as their form rules it. */
  choice("Container Type:", [...CWD_BOX.slice(0, 3), `${CWD_BOX[3]}\nPlease specify:`],
    CWD_RING.box, "");
  row([[1, { v: "Commodity:", s: CW.kn }], [5, { v: CWD_COMMODITY, s: CW.box }]], 28);
  row([[1, { v: "Weight:", s: CW.k }], [1, { v: "Container Tare Weight:", s: CW.wh }],
    [2, { v: "Cargo & Packaging\nWeight:", s: CW.wh }], [2, { v: "Container& Cargo Gross Weight:", s: CW.wh }]], 30);
  row([[1, { v: "", s: CW.kn }], [1, { v: `${d.tare}\n${CWD_UNIT}`, s: CW.wv }],
    [2, { v: `${d.cargo}\n${CWD_UNIT}`, s: CW.wv }], [2, { v: `${d.gross}\n${CWD_UNIT}`, s: CW.wv }]], 30);
  gap();

  row([[3, { v: "Indicate if uneven load Distribution:\n(Mark X for Centre of Mass)", s: CW.k }],
    [2, { v: "Doors this side", s: CW.box }], [1, { v: "", s: CW.p }]], 40);
  gap();

  const meth = (i) => `${i + 1}. ${CWD_METHOD[i]}`;
  const mstyle = (i) => (i + 1 === CWD_RING.method ? CW.optOn : CW.p);
  row([[3, { v: "Method of Determining Weight:", s: CW.pb }], [3, { v: meth(0), s: mstyle(0) }]]);
  row([[3, { v: "(Please circle where applicable)", s: CW.pb }], [3, { v: meth(1), s: mstyle(1) }]]);
  row([[3, { v: "", s: CW.p }], [3, { v: meth(2), s: mstyle(2) }]]);
  row([[3, { v: "", s: CW.p }], [3, { v: meth(3), s: mstyle(3) }]]);
  gap();

  row([[6, { v: "Responsible Entity", s: CW.pb }]]);
  row([[6, { v: "Full Name & Signature of Person Making Declaration:", s: CW.pb }]]);
  row([[3, { v: `Full Name:  ${d.name}`, s: CW.k }], [3, { v: "Signature:", s: CW.k }]], 24);
  // The space the stamp and the signature are put in once it is printed.
  row([[3, { v: `Date:  ${d.date}`, s: CW.k }], [3, { v: "", s: CW.k }]], 46);
  gap();

  row([[6, { v: "Notes:", s: CW.nt }]]);
  CWD_NOTES.forEach((t) => row([[6, { v: t, s: CW.nt }]], undefined));
  gap();
  row([[6, { v: CWD_CLOSE, s: CW.pb }]], 28);

  return fitSheet({
    name,
    rows: G.rows,
    merges: G.merges,
    heights: G.heights,
    widths: CW_TW.map((w) => Math.round((w / TOTAL) * 96)),
    defaultRowHeight: 15,
    colStyle: { font: "cal", border: false, valign: "top" },
    /* Their page: A4 portrait, printed as their file is set up. */
    page: {
      paper: 9, orientation: "portrait", fit: true, fitW: 1, fitH: 0,
      margins: { left: 0.6, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  }, { widen: false });
}

/* The same form as a Word document — which is what their file is, so this is
   the copy that goes out. Their measurements throughout: the title 18pt, the
   grid 11, the hints 8 ruled under, the weights and the signature block 10, the
   notes 7, and the instructions to the reader in their blue.

   Their page is ruled 10681 twips across — wider than a typed letter's measure
   — so the margins are narrowed to it. Left at a letter's inch and a quarter,
   Word puts the overflow on a second and third sheet. */
const CWD_PAGE = { w: 11905, h: 16837, top: 720, bottom: 720, left: 612, right: 612 };

export function cwd34Docx(ctx) {
  const d = cwd34(ctx);
  const HINT = "Name Address & Phone Number Mandatory for Responsible Entity";
  const hint = (t) => ({ text: t, bold: true, underline: true, size: 8 });
  const blue = (t) => ({ text: t, bold: true, color: CWD_BLUE, size: 9 });
  /* A cell cannot be ringed in Word without drawing a shape over it, so the one
     that applies is bracketed and set bold — the same mark, in what a cell can
     carry. Their own copy has the carrier ring it by hand. */
  const ring = (o, on) => (o === on
    ? { text: `( ${o} )`, bold: true, align: "center", valign: "center" }
    : { text: o, align: "center", valign: "center" });
  const mid = (t, extra = {}) => ({ text: t, align: "center", valign: "center", ...extra });
  const party = (lines) => ({ paras: [{ runs: [hint(HINT)] }, ...lines.map((l) => ({ text: l }))] });
  const weight = (v) => mid(`${v}\n${CWD_UNIT}`, { bold: true, size: 10 });
  const sign = signImage(SIGN_EMU);
  const stamp = stampImage(STAMP_EMU);

  return {
    font: { name: "Calibri", size: 11 },
    page: CWD_PAGE,
    blocks: [
      { kind: "p", text: "Container Weight Declaration (CWD)", align: "center", bold: true, size: 18 },
      { kind: "p", size: 8 },
      { kind: "tbl", grid: CW_HEAD_TW, borders: "box", rows: [
        [{ text: "Container Number:", bold: true },
          { paras: [{ runs: [hint("Mandatory")] }, { text: d.container }] }],
        [{ text: "Consignor / Sender:", bold: true }, party(d.consignor)],
        [{ text: "Consignee / Receiver:", bold: true }, party(d.consignee)],
      ] },
      { kind: "p", size: 8 },
      { kind: "tbl", grid: CW_TW, borders: "box", rows: [
        [{ text: "Status:" }, ...CWD_STATUS.map((o) => ring(o, CWD_RING.status)),
          { runs: [blue("(Please circle where applicable)")], span: 3, valign: "center" }],
        [{ text: "Cargo Type:" }, ...CWD_CARGO.map((o) => ring(o, CWD_RING.cargo)), { text: "" }],
        [{ text: "Container Type:" }, ...CWD_BOX.slice(0, 3).map((o) => ring(o, CWD_RING.box)),
          { paras: [{ text: CWD_BOX[3] }, { text: "Please specify:", size: 6 }] }, { text: "" }],
        [{ text: "Commodity:" }, { text: CWD_COMMODITY, span: 5, valign: "center" }],
        [{ text: "Weight:", bold: true }, mid("Container Tare Weight:", { bold: true, size: 10 }),
          mid("Cargo & Packaging\nWeight:", { bold: true, size: 10, span: 2 }),
          mid("Container& Cargo Gross Weight:", { bold: true, size: 10, span: 2 })],
        [{ text: "" }, weight(d.tare), { ...weight(d.cargo), span: 2 }, { ...weight(d.gross), span: 2 }],
      ] },
      { kind: "p", size: 8 },
      { kind: "tbl", grid: CW_LOAD_TW, borders: "box", rows: [
        [{ paras: [{ text: "Indicate if uneven load Distribution:" }, { runs: [blue("(Mark X for Centre of Mass)")] }] },
          { paras: [{ text: "Doors this side", size: 8, align: "right" }, { text: "" }, { text: "" }] }],
      ] },
      { kind: "p", size: 8 },
      /* The four methods, the instruction beside them, and the stamp and the
         signature the sheet goes out under — which their own signed copy carries
         out to the right of the run, not inside the block below it. Held on a
         table with no rules rather than on tab stops, so the four lines and the
         two scans stay in step wherever the type falls. */
      { kind: "tbl", grid: CW_METH_TW, borders: "none", rows: CWD_METHOD.map((m, i) => {
        const lead = ["Method of Determining Weight:", "(Please circle where applicable)"][i];
        const on = i + 1 === CWD_RING.method;
        return [
          lead ? (i ? { runs: [blue(lead)] } : { text: lead, size: 9 }) : { text: "" },
          { text: on ? `( ${i + 1}. ${m} )` : `${i + 1}. ${m}`, size: 9, bold: on },
          on && stamp ? { runs: [{ image: stamp }], align: "center" } : { text: "" },
          on && sign ? { runs: [{ image: sign }], align: "right" } : { text: "" },
        ];
      }) },
      { kind: "p", size: 8 },
      { kind: "p", text: "Responsible Entity", bold: true },
      { kind: "p", text: "Full Name & Signature of Person Making Declaration:", bold: true },
      { kind: "tbl", grid: CW_SIGN_TW, borders: "box", rows: [
        [{ text: `Full Name:  ${d.name}`, bold: true, size: 10 }, { text: "Signature:", bold: true, size: 10 }],
        [{ text: `Date:  ${d.date}`, bold: true, size: 10 }, { text: "" }],
      ] },
      { kind: "p", size: 8 },
      { kind: "p", text: "Notes:", size: 8 },
      ...CWD_NOTES.map((t) => ({ kind: "p", text: t, size: 7 })),
      { kind: "p", size: 8 },
      { kind: "p", text: CWD_CLOSE, bold: true, size: 10 },
    ],
  };
}

export const B_34 = (ctx) => ({
  name: "CWD_34",
  html: cwd34Html(ctx),
  sheet: cwd34Sheet(ctx, "CWD"),
  docx: cwd34Docx(ctx),
  page: "portrait",
});
