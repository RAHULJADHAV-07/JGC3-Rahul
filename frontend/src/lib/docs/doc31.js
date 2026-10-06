import { CI_BUYER_BANDS, CI_P1_BODY_BUYER, CI_P1_TOP, CI_P2_TOP, CI_PLAIN, CI_USD, CI_USDT, L, USD, addrLines, amountWords, buyerGoods, ciMarks, ciP2Body, ddmm, esc, fitSheet, formGrid, formLogo, invoiceBands, invoiceLayout, num, numOrText, poHeaderList, sum, wrapTo } from "./common.js";
import { LOGO_SRC, imgTag } from "../logo.js";
import { colLetter } from "../xlsx.js";

/* 31 · Commercial invoice — the buyer's own invoice, in dollars.

   The same frame as the customs book (18), on the same eleven columns and the
   same paper, but this copy is the buyer's: there is no rupee half to it and no
   tax, so the description runs across the columns those took, and the goods are
   named the way the buyer's papers name them rather than the way customs wants
   them spelled out. It carries the buyer's own order numbers where the customs
   copy carries the exporter's, and it does not claim anything under RoDTEP. */

export function commercialInvoiceSheets(ctx) {
  const E = ctx.EXPORTER, b = ctx.buyer, s = ctx.inv.ship || {};
  const rows = L(ctx);
  const bands = invoiceBands(ctx, CI_BUYER_BANDS);
  const { p1, p2 } = invoiceLayout(bands, CI_P1_BODY_BUYER);
  const marks = ciMarks(ctx, rows);

  const F = { font: "ref9", border: false, valign: "center", shrink: true };
  const C = {
    txt: F,
    lbl: { ...F, font: "ref9b" },
    mer: { ...F, font: "ref9bu" },
    ttl: { ...F, font: "ref9b", align: "center" },
    brand: { ...F, font: "brandk", align: "right" },
    ctr: { ...F, align: "center" },
    rgt: { ...F, align: "right" },
    lblC: { ...F, font: "ref9b", align: "center" },
  };
  const rule = (t, b2, font = "ref9", extra = {}) =>
    ({ ...F, font, border: { l: "thin", r: "thin", t, b: b2 }, ...extra });
  const V = rule("", "");
  const G = {
    colA: V,
    head: rule("thin", "thin", "ref9"),
    cols: rule("thin", "thin", "ref9", { align: "center" }),
    code: rule("hair", "hair", "ref9", { align: "center" }),
    ctr: rule("hair", "hair", "ref9", { align: "center" }),
    num: rule("hair", "hair", "ref9", { align: "center" }),
    usd: rule("hair", "hair", "ref9", { align: "center", fmt: CI_USD }),
    usdL: rule("hair", "hair", "ref9", { fmt: CI_USD }),
    fill: V,
    totL: rule("", "thin", "ref9b", { align: "center" }),
    totV: rule("", "thin", "ref9"),
    sumU: { ...F, font: "ref9", border: { l: "thin", r: "thin", t: "thin", b: "double" }, fmt: CI_USDT },
  };
  const blank = (n, s2 = C.txt) => Array.from({ length: n }, () => [1, { v: "", s: s2 }]);

  const invRef = `${ctx.inv.invoiceNo || ""}${ctx.inv.date ? ` DT ${ddmm(ctx.inv.date)}` : ""}`;
  const dated = (no, d) => (no ? `${no}${d ? ` DT. ${ddmm(d)}` : ""}` : "");
  const desc2 = wrapTo(buyerGoods(bands), 44, 2);
  const desc3 = wrapTo(buyerGoods(bands), 42, 3);
  /* The buyer's own order numbers, broken over the four lines their form gives
     them — the customs copy prints the exporter's single reference instead. */
  const orders = wrapTo(poHeaderList(ctx), 44, 4);

  function headBlock(grid) {
    const { row } = grid;
    row([[1, { v: "MERCHANT", s: C.mer }], [10, { v: "INVOICE", s: { ...C.ttl, border: "b" } }]]);
    row([[5, { v: E.name, s: { ...C.brand, border: "lt" } }, 1],
      [1, { v: "Invoice No. ", s: { ...C.lbl, border: "lt" } }],
      [4, { v: invRef, s: { ...C.txt, border: "rt" } }],
      [1, { v: "Exporter's Ref.", s: { ...C.lbl, border: "lrt" } }]], 12.75);
    row([...blank(1, { ...C.txt, border: "l" }), ...blank(4),
      [1, { v: "Date:", s: { ...C.lbl, border: "lb" } }], [4, { v: "", s: { ...C.txt, border: "b" } }],
      [1, { v: E.iec ? `IEC ${E.iec}` : "", s: { ...C.lbl, border: "lrb" } }]], 12.75);
    row([[5, { v: E.sub || "", s: { ...C.rgt, border: "l" } }],
      [2, { v: "Buyers Order No: ", s: { ...C.lbl, border: "lt" } }],
      [4, { v: orders[0], s: { ...C.txt, border: "t" } }]]);
    const addr = addrLines(E);
    row([[5, { v: addr[0] || "", s: { ...C.rgt, border: "l" } }],
      [2, { v: "", s: { ...C.txt, border: "l" } }], [4, { v: orders[1], s: C.txt }]]);
    row([[5, { v: addr[1] || "", s: { ...C.rgt, border: "l" } }],
      [2, { v: "", s: { ...C.lbl, border: "l" } }], [4, { v: orders[2], s: C.txt }]]);
    row([[5, { v: [E.tel && `Tel: ${E.tel}`, E.email && `E-Mail: ${E.email}`].filter(Boolean).join(" "), s: { ...C.rgt, border: "lb" } }],
      [2, { v: "", s: { ...C.txt, border: "lb" } }], [4, { v: orders[3], s: { ...C.txt, border: "b" } }]]);
    /* Where the customs copy carries the e-invoice reference and its
       acknowledgement, this one carries the bill of lading, the ship and the
       shipping bill — what the buyer needs to trace the consignment. */
    row([[2, { v: "On Account & Risks of:", s: { ...C.lbl, border: "lt" } }],
      [3, { v: "", s: { ...C.txt, border: "t" } }],
      [1, { v: "BL. NO.", s: { ...C.lbl, border: "lt" } }],
      [5, { v: dated(s.blNo, s.blDate), s: { ...C.txt, border: "t" } }]], 12.75);
    row([[5, { v: b.name ? `Messrs ${b.name},` : "", s: { ...C.txt, border: "l" } }],
      [1, { v: "", s: { ...C.txt, border: "l" } }], [5, { v: "", s: C.txt }]], 12.75);
    row([[5, { v: b.brand ? `T/A ${b.brand}` : "", s: { ...C.txt, border: "l" } }],
      [1, { v: "Shipped Per", s: { ...C.lbl, border: "l" } }],
      [5, { v: s.vessel || "", s: C.txt }]], 12.75);
    const bAddr = addrLines({ addr: b.addr });
    row([[5, { v: bAddr[0] || "", s: { ...C.txt, border: "l" } }],
      [1, { v: "", s: { ...C.txt, border: "l" } }], [5, { v: "", s: C.txt }]], 12.75);
    row([[5, { v: [bAddr[1], b.country && `(${b.country})`].filter(Boolean).join(" "), s: { ...C.txt, border: "lb" } }],
      [1, { v: "S/B No:", s: { ...C.lbl, border: "lb" } }],
      [5, { v: dated(s.sbNo, s.sbDate), s: { ...C.txt, border: "b" } }]], 12.75);
    row([[1, { v: "Invoice of:", s: { ...C.lbl, border: "lt" } }],
      [4, { v: desc3[0], s: { ...C.txt, border: "t", align: "left" } }],
      [3, { v: "Country of Origin", s: { ...C.lbl, border: "lt", align: "center" } }],
      [3, { v: "Country of Final Destination", s: { ...C.lbl, border: "rt", align: "center" } }]]);
    row([[1, { v: "", s: { ...C.txt, border: "l" } }],
      [4, { v: desc3[1], s: { ...C.txt, align: "left" } }],
      [3, { v: E.origin || "INDIA", s: { ...C.lblC, border: "lb" } }],
      [3, { v: (s.finalDest || b.country || "").toUpperCase(), s: { ...C.lblC, border: "rb" } }]], 12.75);
    row([[1, { v: "", s: { ...C.txt, border: "lb" } }],
      [4, { v: desc3[2], s: { ...C.txt, border: "b", align: "left" } }],
      [2, { v: "", s: { ...C.txt, border: "l" } }], [4, { v: "", s: { ...C.txt, border: "r" } }]], 12.75);
    row([[2, { v: "Pre-Carraige by:", s: { ...C.lblC, border: "lt" } }],
      [3, { v: "Place of Receipt by Pre-Carraige", s: { ...C.lblC, border: "lrt" } }],
      [2, { v: "Terms of Delivery:", s: { ...C.lbl, border: "l" } }],
      [4, { v: (s.terms || "").toUpperCase(), s: { ...C.txt, border: "r" } }]]);
    row([[2, { v: s.preCarriage || "", s: { ...C.ctr, border: "lb" } }],
      [3, { v: s.receiptPlace || "", s: { ...C.ctr, border: "lrb" } }],
      [2, { v: "", s: { ...C.lbl, border: "l" } }], [4, { v: "", s: { ...C.txt, border: "r" } }]], 12.75);
    row([[2, { v: "Shipped per:", s: { ...C.lblC, border: "lt" } }],
      [3, { v: "Port of Loading:", s: { ...C.lblC, border: "lrt" } }],
      [2, { v: "Terms of Payment:", s: { ...C.lbl, border: "l" } }],
      [4, { v: s.payment || "D.P.SIGHT DRAFT", s: { ...C.txt, border: "r" } }]], 12.75);
    row([[2, { v: s.vessel || "", s: { ...C.ctr, border: "lb" } }],
      [3, { v: s.pol || "", s: { ...C.lblC, border: "lrb" } }],
      [2, { v: "", s: { ...C.lbl, border: "l" } }], [4, { v: "", s: { ...C.txt, border: "r" } }]], 12.75);
    row([[2, { v: "Port of Discharge:", s: { ...C.lblC, border: "lt" } }],
      [3, { v: "Port of destination", s: { ...C.lblC, border: "lrt" } }],
      [2, { v: "Through:", s: { ...C.lbl, border: "l" } }],
      [4, { v: s.bank || "", s: { ...C.lbl, border: "r" } }]], 12.75);
    row([[2, { v: (s.pod || b.shipTo || "").toUpperCase(), s: { ...C.ctr, border: "lb" } }],
      [3, { v: (s.finalDest || s.pod || b.shipTo || "").toUpperCase(), s: { ...C.ctr, border: "lrb" } }],
      [2, { v: "", s: { ...C.txt, border: "lb" } }],
      [4, { v: s.bankAddr || "", s: { ...C.lbl, border: "rb" } }]], 12.75);
  }

  /* The column header of the goods, and the marks and description beside it.
     Both pages carry them; Page 2 reads Page 1's cells rather than repeat. */
  function goodsHead(grid, mirror) {
    const { row } = grid;
    const H = (v) => ({ v, s: { ...C.lbl, border: "box", align: "center" } });
    row([[1, { v: "Marks & Nos.", s: { ...C.lbl, border: "box" } }],
      [7, H("No & Kinds of Pkgs   Description of Goods")],
      [1, H("Quantity")], [1, H("Rate")], [1, H("Amount")]]);
    const M = (v, r) => (mirror ? { f: `Page1!${r}`, s: { ...C.txt, border: "lr" } } : { v, s: { ...C.txt, border: "lr" } });
    row([[1, M(`${marks.prefix} NOS :`, "A23")],
      [7, mirror ? { f: "Page1!B23", s: { ...C.txt, border: "lr", align: "left" } }
        : { v: `${s.pkgs || `${sum(rows, "boxes")} PACKAGES`} CONTAINING`, s: { ...C.txt, border: "lr", align: "left" } }],
      [1, { v: "", s: { ...C.txt, border: "lr" } }],
      [2, { v: "FOB MUMBAI IN US$", s: { ...C.ctr, border: "lr" } }]]);
    row([[1, M(`${marks.start} - ${marks.end}`, "A24")],
      [7, mirror ? { f: "Page1!B24", s: { ...C.txt, border: "lr", align: "left" } }
        : { v: desc2[0], s: { ...C.txt, border: "lr", align: "left" } }],
      [1, { v: "", s: { ...C.txt, border: "lr" } }],
      [1, { v: "", s: { ...C.txt, border: "lr" } }],
      [1, { v: "", s: { ...C.txt, border: "lr" } }]], 12.75);
  }

  /* One line of the goods frame, whichever page it lands on. */
  function bodyLine(grid, line, at) {
    const { row } = grid;
    if (!line) { row([[1, { v: "", s: G.colA }], [10, { v: "", s: G.fill }]]); return; }
    if (line.kind === "head") {
      row([[1, { v: "", s: G.colA }], [7, { v: line.band.head, s: G.head }], ...blank(3, G.fill)]);
      return;
    }
    if (line.kind === "cols") {
      const B = line.band;
      const cells = [[1, { v: "", s: G.colA }], [1, { v: "CODE", s: G.cols }],
        [B.wide ? 2 : 1, { v: B.size, s: G.cols }]];
      if (B.len) cells.push([1, { v: "LEN (MM)", s: G.cols }]);
      else if (!B.wide) cells.push([1, { v: "", s: G.fill }]);
      // The columns the rupee half took on the customs copy run on blank here.
      cells.push(...blank(4, G.fill), [1, { v: "PIECES", s: G.cols }],
        [1, { v: B.rate, s: G.cols }], [1, { v: "", s: G.fill }]);
      row(cells);
      return;
    }
    const { band, r } = line;
    const rate = band.per100 ? r.fobPc * 100 : r.fobPc;
    const cells = [[1, { v: "", s: G.colA }], [1, numOrText(r.it.code, G.code)],
      [band.wide ? 2 : 1, { v: r.it.size || "", s: G.ctr }]];
    if (band.len) cells.push([1, { v: r.it.length || "", s: G.ctr }]);
    else if (!band.wide) cells.push([1, { v: "", s: G.ctr }]);
    cells.push(...blank(4, G.ctr),
      [1, { v: r.pieces, t: "n", s: G.num }],
      [1, { v: rate, t: "n", s: G.usd }],
      [1, { f: `I${at}*J${at}${band.per100 ? "/100" : ""}`, s: G.usdL }]);
    row(cells);
  }

  /* The declaration and the signature, at the foot of both pages. The buyer's
     copy claims nothing under RoDTEP — that line is the customs copy's. */
  function footBlock(grid) {
    const { row } = grid;
    const L7 = (v, edge) => [7, { v, s: { ...C.lbl, border: edge } }];
    const R4 = (v, edge, fmt) => [4, { v, s: { ...C.lbl, border: edge, align: "right", ...(fmt ? { fmt } : {}) } }];
    const P7 = (v, edge) => [7, { v, s: { ...C.txt, border: edge } }];
    row([L7(E.gstin ? `GSTIN : ${E.gstin}` : "", "lt"), R4(`FOR ${E.name}`.toUpperCase(), "rt", CI_PLAIN)], 13.5);
    row([L7(E.pan ? `PAN No: ${E.pan}` : "", "l"), R4("", "r")], 12.75);
    row([P7("Declaration:-", "l"), R4("", "r")], 12.75);
    row([P7("We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.", "l"), R4("", "r")], 12.75);
    row([L7("SUPPLY MEANT FOR EXPORT WITH PAYMENT OF INTEGRATED TAX", "lb"), R4(" PROPRIETOR", "rb", CI_PLAIN)], 12.75);
  }

  const SHEET = {
    widths: [13.83203125, 14.1640625, 11.83203125, 11.83203125, 11.83203125,
      13.33203125, 13.33203125, 13.33203125, 17, 13.33203125, 13.33203125],
    defaultRowHeight: 12,
    colStyle: F,
    page: {
      paper: 9, orientation: "portrait", scale: 72, fit: true, centered: true,
      margins: { left: 0.511811, right: 0.236220, top: 0.236220, bottom: 0.236220, header: 0, footer: 0 },
    },
  };

  /* ---- Page 1 ------------------------------------------------------------ */
  const g1 = formGrid(11);
  headBlock(g1);
  goodsHead(g1, false);
  g1.row([[1, { v: String(marks.end), s: { ...C.txt, border: "lr" } }],
    [7, { v: desc2[1], s: { ...C.txt, border: "lr", align: "left" } }],
    ...blank(3, { ...C.txt, border: "lr" })], 12.75);
  for (let i = 0; i < CI_P1_BODY_BUYER; i++) bodyLine(g1, p1[i], CI_P1_TOP + i);
  const p1First = CI_P1_TOP + p1.findIndex((l) => l.kind === "item");
  const p1Last = CI_P1_TOP + CI_P1_BODY_BUYER - 1;
  const p1Has = p1.some((l) => l.kind === "item");
  const cf = p1Has ? `SUM(K${p1First}:K${p1Last})` : "0";
  g1.row([[1, { v: "", s: G.totV }], [3, { v: "Total C/F Page :2", s: G.totL }],
    ...blank(6, G.totV), [1, { f: cf, s: G.sumU }]], 12.75);
  footBlock(g1);

  /* ---- Page 2 — its head is Page 1's, cell for cell ---------------------- */
  const g2 = formGrid(11);
  const mirror = (r) => (g1.rows[r - 1] || []).map((c, i) => (c && (c.f || (c.v !== "" && c.v != null))
    ? { s: c.s, f: `Page1!${colLetter(i + 1)}${r}` } : c));
  for (let r = 1; r <= 21; r++) {
    const cells = mirror(r);
    if (r === 1) cells[10] = { v: "Page 2", s: { ...C.lbl, border: "b", align: "right" } };
    g2.rows.push(cells);
    g2.heights[r - 1] = g1.heights[r - 1];
  }
  g1.merges.filter((m) => /^[A-K](\d+):/.test(m) && Number(/^[A-K](\d+):/.exec(m)[1]) <= 21)
    .forEach((m) => g2.merges.push(m === "B1:K1" ? "B1:J1" : m));
  goodsHead(g2, true);
  /* The row Page 1 carries its total forward on — the head of the frame plus
     the lines it holds. Read off the grid it would be the foot of the page, so
     it is worked out rather than asked for. */
  const cfRow = CI_P1_TOP + CI_P1_BODY_BUYER;
  g2.row([[1, { f: "Page1!A25", s: { ...C.txt, border: "lr" } }],
    [7, { f: "Page1!B25", s: { ...C.txt, border: "lr", align: "left" } }],
    [1, { v: "", s: { ...C.txt, border: "lr" } }], [1, { v: "", s: { ...C.txt, border: "lr" } }],
    [1, { f: `Page1!K${cfRow}`, s: { ...C.txt, border: "lr", fmt: USD } }]], 12.75);
  const p2Body = ciP2Body(p2);
  for (let i = 0; i < p2Body; i++) bodyLine(g2, p2[i], CI_P2_TOP + i);

  /* The left margin of Page 2 states the container, the weights, the freight
     terms and the value — the only things on the form outside the grid. */
  const netWt = Number(s.netWt) || sum(rows, "netTotal");
  const grossWt = Number(s.grossWt) || sum(rows, "grossTotal");
  const wt3 = { ...C.ctr, fmt: "0.000" };
  const margin = {
    5: ["Container No.", C.lblC], 6: [s.container || "", C.ctr],
    15: ["Seal No.", C.lblC], 16: [s.seal || "", C.ctr],
    24: ["Nett Wt.", C.lblC], 25: [netWt, wt3], 26: ["KGS", C.ctr],
    33: ["Gross Wt", C.lblC], 34: [grossWt, wt3], 35: ["KGS", C.ctr],
    41: ["Freight", C.lblC], 42: ["Payable at", C.lblC], 43: ["Destination", C.lblC],
  };
  const setA = (r, cell, st) => {
    const was = g2.rows[r - 1]?.[0];
    if (was) g2.rows[r - 1][0] = { ...was, ...cell, s: { ...st, border: was.s?.border } };
  };
  Object.entries(margin).forEach(([i, [v, st]]) => setA(CI_P2_TOP + Number(i), { v }, st));

  const p2First = CI_P2_TOP - 1;                 // the brought-forward line
  const p2Last = CI_P2_TOP + p2Body - 1;
  const totRow = p2Last + 1;
  setA(totRow - 2, { v: "FOB VALUE" }, C.lblC);
  setA(totRow - 1, { v: undefined, f: `K${totRow}` }, { ...C.lblC, fmt: USD });
  g2.row([[1, { v: "", s: { ...C.txt, border: "lr" } }],
    [3, { v: "Total FOB Mumbai Value :", s: { ...G.totL, align: "left" } }],
    ...blank(6, G.totV), [1, { f: `SUM(K${p2First}:K${p2Last})`, s: G.sumU }]], 12.75);
  /* The value in words, as the invoice reads it out — the dollars in
     international scale, which is what a buyer's invoice states. */
  g2.row([[1, { v: "", s: { ...C.txt, border: "lb" } }],
    [10, { v: amountWords(sum(rows, "fobTotal"), "US DOLLARS", "CENTS"), s: { ...C.txt, border: "rb" } }]], 12.75);
  footBlock(g2);

  return [
    fitSheet({ name: "Page1", rows: g1.rows, merges: g1.merges, heights: g1.heights, image: formLogo(), ...SHEET }, { widen: false }),
    fitSheet({ name: "Page2", rows: g2.rows, merges: g2.merges, heights: g2.heights, image: formLogo(), ...SHEET }, { widen: false }),
  ];
}

/* The same invoice on the page: the two sheets one after the other, so what is
   printed is what the workbook holds. It is laid out the way the customs book's
   page is (18) — the letterhead one block down the left of the form, the boxes
   on the right keeping their own rows beside it. */
export function commercialInvoiceHtml(ctx) {
  const E = ctx.EXPORTER, b = ctx.buyer, s = ctx.inv.ship || {};
  const rows = L(ctx);
  const bands = invoiceBands(ctx, CI_BUYER_BANDS);
  const { p1, p2 } = invoiceLayout(bands, CI_P1_BODY_BUYER);
  const marks = ciMarks(ctx, rows);
  const addr = addrLines(E), bAddr = addrLines({ addr: b.addr });
  const desc2 = wrapTo(buyerGoods(bands), 44, 2);
  const desc3 = wrapTo(buyerGoods(bands), 42, 3);
  const orders = wrapTo(poHeaderList(ctx), 44, 4);
  const dated = (no, d) => (no ? `${no}${d ? ` DT. ${ddmm(d)}` : ""}` : "");
  const invRef = `${ctx.inv.invoiceNo || ""}${ctx.inv.date ? ` DT ${ddmm(ctx.inv.date)}` : ""}`;

  const td = (v, cls = "", span = 1) =>
    `<td${span > 1 ? ` colspan="${span}"` : ""}${cls ? ` class="${cls}"` : ""}>${v == null || v === "" ? "&nbsp;" : v}</td>`;
  const vl = (v, span = 1) => td(esc(v), "", span);
  // The form is typed in formats that carry no separators, as the sheet is.
  const ciUsd = (n) => `$${Number(n || 0).toFixed(2)}`;
  const ciInt = (n) => String(Math.round(Number(n) || 0));

  const letterhead = `<td class="lhead lf" rowspan="6" colspan="5">
    ${imgTag(LOGO_SRC, "pllogo")}
    <div class="brand">${esc(E.name)}</div>
    ${[E.sub, addr[0], addr[1], [E.tel && `Tel: ${E.tel}`, E.email && `E-Mail: ${E.email}`].filter(Boolean).join(" ")]
    .map((l) => `<div class="addr">${esc(l || "")}</div>`).join("")}</td>`;

  const head = (second) => `
    <tr class="nb"><td class="nb mer">MERCHANT</td>${second
    ? `${td("INVOICE", "nb ttl bb", 9)}${td("Page 2", "nb ttl bb r")}`
    : td("INVOICE", "nb ttl bb", 10)}</tr>
    <tr>${letterhead}
      ${td(esc("Invoice No. "), "k lt")}${td(esc(invRef), "rt", 4)}${td(esc("Exporter's Ref."), "k rt")}</tr>
    <tr>${td("Date:", "k lf")}${td("", "rt0", 4)}${td(esc(E.iec ? `IEC ${E.iec}` : ""), "k rt0")}</tr>
    <tr>${td(esc("Buyers Order No: "), "k lf", 2)}${td(esc(orders[0]), "rt0", 4)}</tr>
    ${orders.slice(1).map((o) => `<tr>${td("", "lf", 2)}${td(esc(o), "rt0", 4)}</tr>`).join("")}
    <tr>${td("On Account &amp; Risks of:", "k lt", 2)}${td("", "lt0", 3)}${td("BL. NO.", "k lt")}${td(esc(dated(s.blNo, s.blDate)), "rt", 5)}</tr>
    <tr>${td(esc(b.name ? `Messrs ${b.name},` : ""), "lf", 5)}${td("", "lf")}${td("", "rt0", 5)}</tr>
    <tr>${td(esc(b.brand ? `T/A ${b.brand}` : ""), "lf", 5)}${td("Shipped Per", "k lf")}${td(esc(s.vessel || ""), "rt0", 5)}</tr>
    <tr>${td(esc(bAddr[0] || ""), "lf", 5)}${td("", "lf")}${td("", "rt0", 5)}</tr>
    <tr>${td(esc([bAddr[1], b.country && `(${b.country})`].filter(Boolean).join(" ")), "lf bb", 5)}
      ${td("S/B No:", "k lf")}${td(esc(dated(s.sbNo, s.sbDate)), "rt0", 5)}</tr>
    <tr>${td("Invoice of:", "k lt")}${td(esc(desc3[0]), "lt", 4)}
      ${td("Country of Origin", "k lt c", 3)}${td("Country of Final Destination", "k rt c", 3)}</tr>
    <tr>${td("", "lf")}${td(esc(desc3[1]), "", 4)}
      ${td(esc(E.origin || "INDIA"), "k lf bb c", 3)}${td(esc((s.finalDest || b.country || "").toUpperCase()), "k rt0 bb c", 3)}</tr>
    <tr>${td("", "lf bb")}${td(esc(desc3[2]), "bb", 4)}${td("", "lf", 2)}${td("", "rt0", 4)}</tr>
    <tr>${td("Pre-Carraige by:", "k lt c", 2)}${td("Place of Receipt by Pre-Carraige", "k lrt c", 3)}
      ${td("Terms of Delivery:", "k lt", 2)}${td(esc((s.terms || "").toUpperCase()), "rt", 4)}</tr>
    <tr>${td(esc(s.preCarriage || ""), "lf bb c", 2)}${td(esc(s.receiptPlace || ""), "lrb c", 3)}
      ${td("", "k lf", 2)}${td("", "rt0", 4)}</tr>
    <tr>${td("Shipped per:", "k lt c", 2)}${td("Port of Loading:", "k lrt c", 3)}
      ${td("Terms of Payment:", "k lf", 2)}${td(esc(s.payment || "D.P.SIGHT DRAFT"), "rt0", 4)}</tr>
    <tr>${td(esc(s.vessel || ""), "lf bb c", 2)}${td(esc(s.pol || ""), "k lrb c", 3)}
      ${td("", "k lf", 2)}${td("", "rt0", 4)}</tr>
    <tr>${td("Port of Discharge:", "k lt c", 2)}${td("Port of destination", "k lrt c", 3)}
      ${td("Through:", "k lf", 2)}${td(esc(s.bank || ""), "k rt0", 4)}</tr>
    <tr>${td(esc((s.pod || b.shipTo || "").toUpperCase()), "lf bb c", 2)}${td(esc((s.finalDest || s.pod || b.shipTo || "").toUpperCase()), "lrb c", 3)}
      ${td("", "lf bb", 2)}${td(esc(s.bankAddr || ""), "k rt0 bb", 4)}</tr>
    <tr>${td("Marks &amp; Nos.", "h l")}${td("No &amp; Kinds of Pkgs   Description of Goods", "h", 7)}
      ${["Quantity", "Rate", "Amount"].map((h) => td(h, "h")).join("")}</tr>
    <tr>${vl(`${marks.prefix} NOS :`)}${td(esc(`${s.pkgs || `${sum(rows, "boxes")} PACKAGES`} CONTAINING`), "l", 7)}
      ${td("")}${td("FOB MUMBAI IN US$", "c", 2)}</tr>
    <tr>${vl(`${marks.start} - ${marks.end}`)}${td(esc(desc2[0]), "l", 7)}${td("", "", 2)}
      ${td(second ? ciUsd(cfUsd) : "", "r")}</tr>
    <tr>${vl(String(marks.end))}${td(esc(desc2[1]), "l", 7)}${td("", "", 3)}</tr>`;

  const line = (l) => {
    if (!l) return `<tr class="gd fl">${td("")}${td("", "", 10)}</tr>`;
    if (l.kind === "head") return `<tr class="gd"><td>&nbsp;</td>${td(esc(l.band.head), "bnd l", 7)}${td("", "", 3)}</tr>`;
    if (l.kind === "cols") {
      const B = l.band;
      const cells = [td("CODE", "hd"), td(esc(B.size), "hd", B.wide ? 2 : 1)];
      if (B.len) cells.push(td("LEN (MM)", "hd"));
      else if (!B.wide) cells.push(td(""));
      // The columns the rupee half took on the customs copy run on blank here.
      cells.push(td("", "", 4), td("PIECES", "hd"), td(esc(B.rate), "hd"), td(""));
      return `<tr class="gd"><td>&nbsp;</td>${cells.join("")}</tr>`;
    }
    const { band, r } = l;
    const rate = band.per100 ? r.fobPc * 100 : r.fobPc;
    const cells = [td(esc(r.it.code), "c"), td(esc(r.it.size), "c", band.wide ? 2 : 1)];
    if (band.len) cells.push(td(esc(r.it.length), "c"));
    else if (!band.wide) cells.push(td(""));
    cells.push(td("", "", 4),
      `<td class="c" data-t="int" data-v="${r.pieces}">${ciInt(r.pieces)}</td>`,
      `<td class="c" data-t="usd" data-v="${rate}">${ciUsd(rate)}</td>`,
      `<td class="r" data-t="usd" data-v="${r.fobTotal}">${ciUsd(r.fobTotal)}</td>`);
    return `<tr class="ln"><td>&nbsp;</td>${cells.join("")}</tr>`;
  };

  /* The declaration at the foot of both pages. The buyer's copy claims nothing
     under RoDTEP — that line is the customs copy's. */
  const foot = () => `
    <tr>${td(esc(E.gstin ? `GSTIN : ${E.gstin}` : ""), "k lt", 7)}${td(esc(`FOR ${E.name}`.toUpperCase()), "k rt r", 4)}</tr>
    <tr>${td(esc(E.pan ? `PAN No: ${E.pan}` : ""), "k lf", 7)}${td("", "rt0", 4)}</tr>
    <tr>${td("Declaration:-", "lf", 7)}${td("", "rt0", 4)}</tr>
    <tr>${td("We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.", "lf", 7)}${td("", "rt0", 4)}</tr>
    <tr>${td("SUPPLY MEANT FOR EXPORT WITH PAYMENT OF INTEGRATED TAX", "k lf bb", 7)}${td(" PROPRIETOR", "k rt0 bb r", 4)}</tr>`;

  const cfUsd = p1.reduce((n, l) => n + (l.kind === "item" ? l.r.fobTotal : 0), 0);
  const fobAll = sum(rows, "fobTotal");
  const colg = `<colgroup>${[12.6, 12.9, 10.8, 10.8, 10.8, 12.1, 12.1, 12.1, 15.5, 12.1, 12.1]
    .map((w) => `<col style="width:${(w / 133.9) * 100}%">`).join("")}</colgroup>`;

  const page1 = `<table class="wb ci ci31">${colg}<tbody>${head(false)}
    ${Array.from({ length: CI_P1_BODY_BUYER }, (_, i) => line(p1[i])).join("")}
    <tr class="tt">${td("")}${td("Total C/F Page :2", "k c", 3)}${td("", "", 6)}
      ${td(ciUsd(cfUsd), "r dbl")}</tr>
    ${foot()}</tbody></table>`;

  /* Page 2's left margin carries the container, the weights, the freight terms
     and the value; the rest of it is the same frame continued. */
  const netWt = Number(s.netWt) || sum(rows, "netTotal");
  const grossWt = Number(s.grossWt) || sum(rows, "grossTotal");
  const margin = {
    5: "Container No.", 6: s.container || "", 15: "Seal No.", 16: s.seal || "",
    24: "Nett Wt.", 25: Number(netWt || 0).toFixed(3), 26: "KGS",
    33: "Gross Wt", 34: Number(grossWt || 0).toFixed(3), 35: "KGS",
    41: "Freight", 42: "Payable at", 43: "Destination",
  };
  const p2Body = ciP2Body(p2);
  const body2 = Array.from({ length: p2Body }, (_, i) => {
    const cell = margin[i];
    const out = line(p2[i]);
    return cell == null ? out
      : out.replace('<tr class="gd fl">', '<tr class="gd">').replace("<td>&nbsp;</td>", `<td class="c k">${esc(String(cell))}</td>`);
  }).join("");

  const page2 = `<table class="wb ci ci31">${colg}<tbody>${head(true)}${body2}
    <tr class="tt">${td(ciUsd(fobAll), "c k")}${td("Total FOB Mumbai Value :", "k", 3)}${td("", "", 6)}
      ${td(ciUsd(fobAll), "r dbl")}</tr>
    <tr>${td("")}${td(esc(amountWords(fobAll, "US DOLLARS", "CENTS")), "l", 10)}</tr>
    ${foot()}</tbody></table>`;

  return `${page1}<div class="pgbrk"></div>${page2}`;
}

export const B_31 = (ctx) => ({
  name: "Commercial_Invoice_31",
  html: commercialInvoiceHtml(ctx),
  sheets: commercialInvoiceSheets(ctx),
  page: "portrait",
});
