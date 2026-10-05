import { CI_HSN_ROWS, CI_P1_BODY, CI_P1_TOP, CI_P2_TOP, CI_PCT, CI_PLAIN, CI_USD, CI_USDT, L, P7, RUPEE, USD, addrLines, amountWords, ciMarks, ciP2Body, ddmm, esc, exRate, fitSheet, formGrid, formLogo, goodsWrapped, gstFor, hsnRuns, hsnText, inr, invoiceBands, invoiceLayout, num, numOrText, poHeaderList, rangeRefs, sum, usd, wbFixed, wbRupee } from "./common.js";
import { LOGO_SRC, imgTag } from "../logo.js";
import { colLetter } from "../xlsx.js";

export function customsInvoiceSheets(ctx) {
  const E = ctx.EXPORTER, b = ctx.buyer, s = ctx.inv.ship || {};
  const rows = L(ctx), ex = exRate(ctx);
  const bands = invoiceBands(ctx);
  const { p1, p2 } = invoiceLayout(bands);
  const marks = ciMarks(ctx, rows);

  /* Their whole form is Arial 9; only the masthead and the labels stand out,
     and every cell is set to shrink rather than wrap so a long entry stays on
     its one ruled line. */
  const F = { font: "ref9", border: false, valign: "center", shrink: true };
  const C = {
    txt: F,
    lbl: { ...F, font: "ref9b" },
    mer: { ...F, font: "ref9bu" },
    ttl: { ...F, font: "ref9b", align: "center" },
    brand: { ...F, font: "brandk", align: "right" },
    ctr: { ...F, align: "center" },
    rgt: { ...F, align: "right" },
    /* The boxes down the left of the head are typed centred in them — the
       label over the answer, both in the middle of the box — where the boxes
       on the right are typed against their label. */
    lblC: { ...F, font: "ref9b", align: "center" },
  };
  /* The frame: solid down the columns, hairline across between the goods. */
  const rule = (t, b2, font = "ref9", extra = {}) =>
    ({ ...F, font, border: { l: "thin", r: "thin", t, b: b2 }, ...extra });
  const V = rule("", "");                                   // the columns only
  /* The goods are typed in the same plain Arial as the rest of the form —
     their sheet sets neither the band headings nor the column headers in bold,
     and the totals it carries forward are bold only in the words, never in the
     figures. Nothing in this table stands out but the line it is ruled on. */
  const G = {
    colA: V,
    head: rule("thin", "thin", "ref9"),                       // a band heading
    cols: rule("thin", "thin", "ref9", { align: "center" }),  // its column header
    code: rule("hair", "hair", "ref9", { align: "center" }),
    ctr: rule("hair", "hair", "ref9", { align: "center" }),
    num: rule("hair", "hair", "ref9", { align: "center" }),   // a plain count, as their sheet leaves it
    usd: rule("hair", "hair", "ref9", { align: "center", fmt: CI_USD }),
    usdL: rule("hair", "hair", "ref9", { fmt: CI_USD }),
    inrC: rule("hair", "hair", "ref9", { align: "center", fmt: RUPEE }),
    inr: rule("hair", "hair", "ref9", { fmt: RUPEE }),
    pct: rule("hair", "hair", "ref9", { align: "center", fmt: CI_PCT }),
    fill: V,
    totL: rule("", "thin", "ref9b", { align: "center" }),
    totV: rule("", "thin", "ref9"),
    sumU: { ...F, font: "ref9", border: { l: "thin", r: "thin", t: "thin", b: "double" }, fmt: CI_USDT },
    sumR: { ...F, font: "ref9", border: { l: "thin", r: "thin", t: "thin", b: "double" }, fmt: RUPEE },
  };
  const blank = (n, s2 = C.txt) => Array.from({ length: n }, () => [1, { v: "", s: s2 }]);

  /* ---- the head of the invoice, rows 1-25 -------------------------------- */
  const invRef = `${ctx.inv.invoiceNo || ""}${ctx.inv.date ? ` DT ${ddmm(ctx.inv.date)}` : ""}`;
  const orderRef = ctx.buyer.orderNo
    ? `${ctx.buyer.orderNo}${ctx.inv.date ? ` DT ${ddmm(ctx.inv.date)}` : ""}` : poHeaderList(ctx);
  const dated = (no, d) => (no ? `${no}${d ? ` DT. ${ddmm(d)}` : ""}` : "");
  const desc3 = goodsWrapped(bands, 42, 3);
  const desc2 = goodsWrapped(bands, 44, 2);
  const irn = String(s.irn || "");

  function headBlock(grid) {
    const { row } = grid;
    row([[1, { v: "MERCHANT", s: C.mer }], [10, { v: "INVOICE", s: { ...C.ttl, border: "b" } }]]);
    row([[5, { v: E.name, s: { ...C.brand, border: "lt" } }, 1],
      [1, { v: "Invoice No. ", s: { ...C.lbl, border: "lt" } }],
      [4, { v: invRef, s: { ...C.txt, border: "rt" } }],
      [1, { v: "Exporter's Ref.", s: { ...C.lbl, border: "rt" } }]], 12.75);
    row([...blank(1, { ...C.txt, border: "l" }), ...blank(4),
      [1, { v: "Date:", s: { ...C.lbl, border: "l" } }], [4, { v: "", s: { ...C.txt, border: "r" } }],
      [1, { v: E.iec ? `IEC ${E.iec}` : "", s: { ...C.lbl, border: "r" } }]], 12.75);
    /* The exporter's own block is ranged right under the name, against the
       mark anchored in the corner of the form beside it. */
    row([[5, { v: E.sub || "", s: { ...C.rgt, border: "l" } }],
      [2, { v: "Buyers Order No: ", s: { ...C.lbl, border: "l" } }],
      [4, { v: orderRef, s: { ...C.txt, border: "r" } }]]);
    const addr = addrLines(E);
    row([[5, { v: addr[0] || "", s: { ...C.rgt, border: "l" } }],
      [2, { v: "", s: { ...C.txt, border: "l" } }], [4, { v: "", s: { ...C.txt, border: "r" } }]]);
    row([[5, { v: addr[1] || "", s: { ...C.rgt, border: "l" } }],
      [2, { v: "Other Reference(s):", s: { ...C.lbl, border: "l" } }],
      [4, { v: s.otherRef || "", s: { ...C.txt, border: "r" } }]]);
    row([[5, { v: [E.tel && `Tel: ${E.tel}`, E.email && `E-Mail: ${E.email}`].filter(Boolean).join(" "), s: { ...C.rgt, border: "lb" } }],
      [2, { v: "", s: { ...C.txt, border: "l" } }], [4, { v: "", s: { ...C.txt, border: "r" } }]]);
    row([[2, { v: "On Account & Risks of:", s: { ...C.lbl, border: "lt" } }],
      [3, { v: "", s: { ...C.txt, border: "t" } }],
      [1, { v: "IRN No", s: { ...C.lbl, border: "lt" } }],
      [5, { v: irn.slice(0, 38), s: { ...C.txt, border: "rt" } }]], 12.75);
    row([[5, { v: b.name ? `Messrs ${b.name},` : "", s: { ...C.txt, border: "l" } }],
      [1, { v: "", s: { ...C.txt, border: "l" } }],
      [5, { v: irn.slice(38), s: { ...C.txt, border: "r" } }]], 12.75);
    row([[5, { v: b.brand ? `T/A ${b.brand}` : "", s: { ...C.txt, border: "l" } }],
      [1, { v: "Ack No", s: { ...C.lbl, border: "l" } }],
      [5, { v: s.ackNo || "", s: { ...C.txt, border: "r" } }]], 12.75);
    const bAddr = addrLines({ addr: b.addr });
    row([[5, { v: bAddr[0] || "", s: { ...C.txt, border: "l" } }],
      [1, { v: "", s: { ...C.txt, border: "l" } }], [5, { v: "", s: { ...C.txt, border: "r" } }]], 12.75);
    row([[5, { v: [bAddr[1], b.country && `(${b.country})`].filter(Boolean).join(" "), s: { ...C.txt, border: "lb" } }],
      [1, { v: "Ack Dt", s: { ...C.lbl, border: "l" } }],
      [5, { v: s.ackDt || "", s: { ...C.txt, border: "r" } }]], 12.75);
    row([[1, { v: "Invoice of:", s: { ...C.lbl, border: "lt" } }],
      [4, { v: desc3[0], s: { ...C.txt, border: "t", align: "left" } }],
      [3, { v: "Country of Origin", s: { ...C.lbl, border: "lt", align: "center" } }],
      [3, { v: "Country of Final Destination", s: { ...C.lbl, border: "rt", align: "center" } }]]);
    row([[1, { v: "", s: { ...C.txt, border: "l" } }],
      [4, { v: desc3[1], s: { ...C.txt, align: "left" } }],
      [3, { v: E.origin || "INDIA", s: { ...C.lblC, border: "lb" } }],
      [3, { v: (s.finalDest || b.country || "").toUpperCase(), s: { ...C.lblC, border: "rb" } }]], 12.75);
    row([[1, { v: "", s: { ...C.txt, border: "l" } }],
      [4, { v: desc3[2], s: { ...C.txt, align: "left" } }],
      [1, { v: "BL. NO.", s: { ...C.lbl, border: "l" } }],
      [5, { v: dated(s.blNo, s.blDate), s: { ...C.txt, border: "r" } }]], 12.75);
    row([[2, { v: "Pre-Carraige by:", s: { ...C.lblC, border: "lt" } }],
      [3, { v: "Place of Receipt by Pre-Carraige", s: { ...C.lblC, border: "lrt" } }],
      [1, { v: "Shipped Per", s: { ...C.lbl, border: "l" } }],
      [5, { v: s.vessel || "", s: { ...C.txt, border: "r" } }]]);
    row([[2, { v: s.preCarriage || "", s: { ...C.ctr, border: "lb" } }],
      [3, { v: s.receiptPlace || "", s: { ...C.ctr, border: "lrb" } }],
      [1, { v: "S/B No:", s: { ...C.lbl, border: "l" } }],
      [5, { v: dated(s.sbNo, s.sbDate), s: { ...C.txt, border: "r" } }]], 12.75);
    row([[2, { v: "Shipped per:", s: { ...C.lblC, border: "lt" } }],
      [3, { v: "Port of Loading:", s: { ...C.lblC, border: "lrt" } }],
      [2, { v: "Terms of Delivery:", s: { ...C.lbl, border: "lt" } }],
      [4, { v: (s.terms || "").toUpperCase(), s: { ...C.txt, border: "rt" } }]], 12.75);
    row([[2, { v: s.vessel || "", s: { ...C.ctr, border: "lb" } }],
      // The port it loads at is the one answer in that block typed in bold.
      [3, { v: s.pol || "", s: { ...C.lblC, border: "lrb" } }],
      [2, { v: "Terms of Payment:", s: { ...C.lbl, border: "l" } }],
      [4, { v: s.payment || "D.P.SIGHT DRAFT", s: { ...C.txt, border: "r" } }]], 12.75);
    row([[2, { v: "Port of Discharge:", s: { ...C.lblC, border: "lt" } }],
      [3, { v: "Port of destination", s: { ...C.lblC, border: "lrt" } }],
      [2, { v: "Through:", s: { ...C.lbl, border: "l" } }],
      // The bank the documents go through is typed in bold, both its lines.
      [4, { v: s.bank || "", s: { ...C.lbl, border: "r" } }]], 12.75);
    row([[2, { v: (s.pod || b.shipTo || "").toUpperCase(), s: { ...C.ctr, border: "lb" } }],
      [3, { v: (s.finalDest || s.pod || b.shipTo || "").toUpperCase(), s: { ...C.ctr, border: "lrb" } }],
      [2, { v: "", s: { ...C.txt, border: "lb" } }],
      [4, { v: s.bankAddr || "", s: { ...C.lbl, border: "rb" } }]], 12.75);
  }

  /* Row 22 is the column header of the goods, and 23-25 the marks and the
     description that stand beside them. Both pages carry them. */
  function goodsHead(grid, mirror) {
    const { row } = grid;
    const H = (v) => ({ v, s: { ...C.lbl, border: "box", align: "center" } });
    // The marks column is headed against its own left edge, the rest centred.
    row([[1, { v: "Marks & Nos.", s: { ...C.lbl, border: "box" } }],
      [3, H("No & Kinds of Pkgs   Description of Goods")],
      [1, H("Quantity")], [1, H("Rate")], [1, H("Amount")], [1, H("Rate")],
      [1, H("Taxable Amount")], [1, H("GST Rate")], [1, H("GST Amount")]]);
    const M = (v, r) => (mirror ? { f: `Page1!${r}`, s: { ...C.txt, border: "lr" } } : { v, s: { ...C.txt, border: "lr" } });
    row([[1, M(`${marks.prefix} NOS :`, "A23")],
      [4, mirror ? { f: "Page1!B23", s: { ...C.txt, border: "lr", align: "left" } }
        : { v: `${s.pkgs || `${sum(rows, "boxes")} PACKAGES`} CONTAINING`, s: { ...C.txt, border: "lr", align: "left" } }],
      [2, { v: "FOB MUMBAI IN US$", s: { ...C.ctr, border: "lr" } }],
      [2, { v: "FOB MUMBAI IN INR", s: { ...C.ctr, border: "lr" } }],
      [2, { v: "", s: { ...C.txt, border: "lr" } }]]);
    row([[1, M(`${marks.start} - ${marks.end}`, "A24")],
      [4, mirror ? { f: "Page1!B24", s: { ...C.txt, border: "lr", align: "left" } }
        : { v: desc2[0], s: { ...C.txt, border: "lr", align: "left" } }],
      [2, { v: "", s: { ...C.txt, border: "lr" } }],
      [2, { v: `EX. RATE @ Rs.${num(ex)}`, s: { ...C.txt, border: "lr", align: "center" } }],
      [2, { v: "", s: { ...C.txt, border: "lr" } }]], 12.75);
  }

  /* One line of the goods frame, whichever page it lands on. */
  function bodyLine(grid, line, at) {
    const { row } = grid;
    if (!line) { row([[1, { v: "", s: G.colA }], [10, { v: "", s: G.fill }]]); return; }
    if (line.kind === "head") {
      row([[1, { v: "", s: G.colA }], [6, { v: line.band.head, s: G.head }], ...blank(4, G.fill)]);
      return;
    }
    if (line.kind === "cols") {
      const B = line.band;
      const cells = [[1, { v: "", s: G.colA }], [1, { v: "CODE", s: G.cols }],
        [B.wide ? 2 : 1, { v: B.size, s: G.cols }]];
      if (B.len) cells.push([1, { v: "LEN (MM)", s: G.cols }]);
      else if (!B.wide) cells.push([1, { v: "", s: G.fill }]);
      cells.push([1, { v: "PIECES", s: G.cols }], [1, { v: B.rate, s: G.cols }], ...blank(5, G.fill));
      row(cells);
      return;
    }
    const { band, r } = line;
    const rate = band.per100 ? r.fobPc * 100 : r.fobPc;
    const gst = gstFor(ctx, r.it, r.supId);
    const cells = [[1, { v: "", s: G.colA }], [1, numOrText(r.it.code, G.code)],
      [band.wide ? 2 : 1, { v: r.it.size || "", s: G.ctr }]];
    if (band.len) cells.push([1, { v: r.it.length || "", s: G.ctr }]);
    else if (!band.wide) cells.push([1, { v: "", s: G.ctr }]);
    cells.push(
      [1, { v: r.pieces, t: "n", s: G.num }],
      [1, { v: rate, t: "n", s: G.usd }],
      [1, { f: `E${at}*F${at}${band.per100 ? "/100" : ""}`, s: G.usdL }],
      [1, { f: `I${at}/E${at}`, s: G.inrC }],
      [1, { f: `G${at}*${ex}`, s: G.inr }],
      [1, { v: gst, t: "n", s: G.pct }],
      [1, { f: `ROUND(I${at}*J${at},)`, s: G.inr }],
    );
    row(cells);
  }

  /* The declaration and the signature, at the foot of both pages. */
  function footBlock(grid) {
    const { row } = grid;
    const L7 = (v, edge) => [7, { v, s: { ...C.lbl, border: edge } }];
    const R4 = (v, edge, fmt) => [4, { v, s: { ...C.lbl, border: edge, align: "right", ...(fmt ? { fmt } : {}) } }];
    row([L7(E.gstin ? `GSTIN : ${E.gstin}` : "", "lt"), R4(" FOR JAIKVIN GLOBAL".replace("JAIKVIN GLOBAL", E.name), "rt", CI_PLAIN)], 13.5);
    row([L7(E.pan ? `PAN No: ${E.pan}` : "", "l"), R4("", "r")], 12.75);
    /* The declaration itself is typed plain; what is claimed under it is not. */
    const P7 = (v, edge) => [7, { v, s: { ...C.txt, border: edge } }];
    row([P7("Declaration:-", "l"), R4("", "r")], 12.75);
    row([P7("We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.", "l"), R4("", "r")], 12.75);
    row([L7("SUPPLY MEANT FOR EXPORT WITH PAYMENT OF INTEGRATED TAX", "l"), R4("", "r")], 12.75);
    row([L7("We intend to claim rewards under RoDTEP", "lb"), R4(" PROPRIETOR", "rb", CI_PLAIN)]);
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
  // Row 25 closes the description box; Page 2 mirrors it rather than repeat it.
  g1.row([[1, { v: String(marks.end), s: { ...C.txt, border: "lr" } }],
    [4, { v: desc2[1], s: { ...C.txt, border: "lr", align: "left" } }],
    ...blank(6, { ...C.txt, border: "lr" })], 12.75);
  for (let i = 0; i < CI_P1_BODY; i++) bodyLine(g1, p1[i], CI_P1_TOP + i);
  const p1First = CI_P1_TOP + p1.findIndex((l) => l.kind === "item");
  const p1Last = CI_P1_TOP + CI_P1_BODY - 1;
  const p1Has = p1.some((l) => l.kind === "item");
  const cf = (col) => (p1Has ? `SUM(${col}${p1First}:${col}${p1Last})` : "0");
  g1.row([[1, { v: "", s: G.totV }], [3, { v: "Total C/F Page :2", s: G.totL }],
    [2, { v: "", s: G.totV }], [1, { f: cf("G"), s: G.sumU }], [1, { v: "", s: G.totV }],
    [1, { f: cf("I"), s: G.sumR }], [1, { v: "", s: G.totV }], [1, { f: cf("K"), s: G.sumR }]], 12.75);
  footBlock(g1);

  /* ---- Page 2 — its head is Page 1's, cell for cell ---------------------- */
  const g2 = formGrid(11);
  const mirror = (r) => (g1.rows[r - 1] || []).map((c, i) => (c && (c.f || (c.v !== "" && c.v != null))
    ? { s: c.s, f: `Page1!${colLetter(i + 1)}${r}` } : c));
  for (let r = 1; r <= 21; r++) {
    const cells = mirror(r);
    // The title runs a column short on this page: the sheet is numbered in the
    // corner it gives up.
    if (r === 1) cells[10] = { v: "Page 2", s: { ...C.lbl, border: "b", align: "right" } };
    g2.rows.push(cells);
    g2.heights[r - 1] = g1.heights[r - 1];
  }
  // Rows 2-21's merges are Page 1's, and row 2's name box runs down into row 3.
  g1.merges.filter((m) => /^[A-K](\d+):/.test(m) && Number(/^[A-K](\d+):/.exec(m)[1]) <= 21)
    .forEach((m) => g2.merges.push(m === "B1:K1" ? "B1:J1" : m));
  goodsHead(g2, true);
  g2.row([[1, { f: "Page1!A25", s: { ...C.txt, border: "lr" } }],
    [4, { f: "Page1!B25", s: { ...C.txt, border: "lr", align: "left" } }],
    [1, { v: "BAL B/F…", s: { ...C.ctr, border: "lr" } }],
    [1, { f: "Page1!G82", s: { ...C.txt, border: "lr", fmt: USD } }],
    [1, { v: "", s: { ...C.txt, border: "lr" } }],
    [1, { f: "Page1!I82", s: { ...C.txt, border: "lr", fmt: RUPEE } }],
    [1, { v: "", s: { ...C.txt, border: "lr" } }],
    [1, { f: "Page1!K82", s: { ...C.txt, border: "lr", fmt: RUPEE } }]], 12.75);
  const p2Body = ciP2Body(p2);
  for (let i = 0; i < p2Body; i++) bodyLine(g2, p2[i], CI_P2_TOP + i);

  /* The left margin of Page 2 states the container, the weights and the freight
     terms — the only things on the form that are not part of the grid. */
  const netWt = Number(s.netWt) || sum(rows, "netTotal");
  const grossWt = Number(s.grossWt) || sum(rows, "grossTotal");
  const fobUsd = sum(rows, "fobTotal");
  /* Every line of it is typed centred in the margin — the weights to three
     places and with no separators, as their sheet formats them. */
  const wt3 = { ...C.ctr, fmt: "0.000" };
  const margin = {
    5: ["Container No.", C.lblC], 6: [s.container || "", C.ctr],
    15: ["Seal No.", C.lblC], 16: [s.seal || "", C.ctr],
    24: ["Nett Wt.", C.lblC], 25: [netWt, wt3], 26: ["KGS", C.ctr],
    33: ["Gross Wt", C.lblC], 34: [grossWt, wt3], 35: ["KGS", C.ctr],
    41: ["Freight", C.lblC], 42: ["Payable at", C.lblC], 43: ["Destination", C.lblC],
  };
  /* Keyed by how far down the frame each stands rather than by an absolute
     row, so they keep their place however deep the goods run. */
  const setA = (r, cell, st) => {
    const was = g2.rows[r - 1]?.[0];
    if (was) g2.rows[r - 1][0] = { ...was, ...cell, s: { ...st, border: was.s?.border } };
  };
  Object.entries(margin).forEach(([i, [v, st]]) => setA(CI_P2_TOP + Number(i), { v }, st));

  const p2First = CI_P2_TOP - 1;                 // the brought-forward line
  const p2Last = CI_P2_TOP + p2Body - 1;
  /* The FOB value box hangs off the totals rather than off a fixed row: the
     label, the dollars under it, and the rupees on the totals line itself. */
  const totRow = p2Last + 1;
  setA(totRow - 2, { v: "FOB VALUE" }, C.lblC);
  setA(totRow - 1, { v: undefined, f: `G${totRow}` }, { ...C.lblC, fmt: USD });
  const tot = (col) => `SUM(${col}${p2First}:${col}${p2Last})`;
  g2.row([[1, { f: `I${totRow}`, s: { ...C.lblC, border: "lr", fmt: RUPEE } }],
    [3, { v: "Total FOB Mumbai Value :", s: { ...G.totL, align: "left" } }],
    [2, { v: "", s: G.totV }], [1, { f: tot("G"), s: G.sumU }], [1, { v: "", s: G.totV }],
    [1, { f: tot("I"), s: G.sumR }], [1, { v: "", s: G.totV }], [1, { f: tot("K"), s: G.sumR }]], 12.75);

  /* ---- the GST breakup, totalled by HSN code ---------------------------- */
  const box = (v, st = C.txt, fmt) => ({ v, s: { ...st, border: "box", ...(fmt ? { fmt } : {}) } });
  const bh = (v) => box(v, { ...C.lbl, align: "center" });
  /* The breakup starts a column in from the frame, as their sheet sets it: the
     marks column runs on blank beside it. */
  g2.row([[1, { v: "", s: { ...C.txt, border: "lb" } }], [2, box("BREAKUP OF GST", C.lbl)], [1, bh("UOM")],
    [1, bh("VALUE (US$)")], [2, bh("TAXABLE VALUE (INR)")], [1, bh("CGST")], [1, bh("SGST")],
    [1, bh("IGST")], [1, bh("TOTAL GST")]], 12.75);

  const codes = [...new Set(bands.map((x) => x.hsn).filter(Boolean))];
  const first = g2.at() + 1;
  const slots = Math.max(codes.length, CI_HSN_ROWS);
  Array.from({ length: slots }, (_, i) => codes[i]).forEach((hsn) => {
    const at = g2.at() + 1;
    if (!hsn) {                                    // a reserved line, ruled but empty
      const e = { ...C.txt, border: "box" };
      g2.row([[1, { v: "", s: C.txt }], [2, { v: "", s: e }], [1, { v: "", s: e }], [1, { v: "", s: e }],
        [2, { v: "", s: e }], [1, { v: "", s: e }], [1, { v: "", s: e }], [1, { v: "", s: e }],
        [1, { v: "", s: e }]], 13.5);
      return;
    }
    const r1 = hsnRuns(p1, CI_P1_TOP, hsn), r2 = hsnRuns(p2, CI_P2_TOP, hsn);
    const agg = (col) => {
      const refs = [rangeRefs(r1, col, "Page1"), rangeRefs(r2, col, "")].filter(Boolean).join(",");
      return refs ? `SUM(${refs})` : "0";
    };
    /* A code's line is typed plain against its own bold heading — only the
       words on this block are set in bold, never the figures. */
    g2.row([[1, { v: "", s: C.txt }], [2, box(`HSN CODE : ${hsn}`, C.lbl)],
      [1, { f: agg("E"), s: { ...C.txt, border: "box", align: "center", fmt: "0" } }],
      [1, { f: agg("G"), s: { ...C.txt, border: "box", fmt: CI_USDT } }],
      [2, { f: agg("I"), s: { ...C.txt, border: "box", fmt: RUPEE } }],
      [1, box(0, C.txt, RUPEE)], [1, box(0, C.txt, RUPEE)],
      [1, { f: agg("K"), s: { ...C.txt, border: "box", fmt: RUPEE } }],
      [1, { f: `SUM(H${at}:J${at})`, s: { ...C.txt, border: "box", fmt: RUPEE } }]], 13.5);
  });
  const last = g2.at();
  const down = (col) => (codes.length ? `SUM(${col}${first}:${col}${last})` : "0");
  // The line the breakup adds up on is closed off under it, as the totals are.
  const dbl = { l: "thin", r: "thin", t: "thin", b: "double" };
  const totB = (f, extra = {}) => ({ f, s: { ...C.txt, border: dbl, ...extra } });
  g2.row([[1, { v: "", s: C.txt }], [2, box("TOTAL", C.lbl)],
    [1, totB(down("D"), { align: "center", fmt: "0" })],
    [1, totB(down("E"), { fmt: CI_USDT })],
    [2, totB(down("F"), { fmt: RUPEE })],
    [1, totB(down("H"), { fmt: RUPEE })],
    [1, totB(down("I"), { fmt: RUPEE })],
    [1, totB(down("J"), { fmt: RUPEE })],
    [1, totB(down("K"), { fmt: RUPEE })]], 13.5);

  const taxTot = fobUsd * ex;
  g2.row([[1, { v: "", s: { ...C.txt, border: "lb" } }],
    [10, { v: amountWords(fobUsd, "US DOLLARS", "CENTS", false), s: { ...C.txt, border: "rb" } }]], 12.75);
  g2.row([[1, { v: "", s: { ...C.txt, border: "l" } }],
    [10, { v: amountWords(taxTot, "INDIAN RUPEES", "PAISE", true), s: { ...C.txt, border: "r" } }]], 12.75);
  footBlock(g2);

  /* ---- Annx — the annexure customs asks for -----------------------------
     Not typed on the invoice form at all: a plain Calibri sheet with the
     printed letterhead pasted across the top of it, and the goods under it
     ruled the same way — solid down the columns, hairline between the lines. */
  const A = { font: "cal", border: false, valign: "center" };
  const AB = { ...A, font: "calb" };
  const abox = (v, st = A, extra = {}) => ({ v, s: { ...st, border: "box", ...extra } });
  const aRule = (b2, st = A, extra = {}) => ({ ...st, border: { l: "thin", r: "thin", t: "", b: b2 }, ...extra });
  const ga = formGrid(7);

  /* The letterhead: the name in red Centaur over the address in blue, its
     numbers in red, ranged right in a box of its own — and the mark in the box
     beside it, which is where their sheet anchors the picture. */
  const eAddr = addrLines(E);
  const lhText = (v, edge, font = "cal") => ({ v, s: { ...A, font, border: edge, align: "right" } });
  const lhRuns = (runs, edge) => ({ rt: runs, s: { ...A, border: edge, align: "right" } });
  const inked = (label, value) => (value ? [{ t: label, font: "calbl" }, { t: `${value} `, font: "calr" }] : []);
  const markBox = (edge) => [2, { v: "", s: { ...A, border: edge } }];
  ga.row([[5, lhText(E.name, "lrt", "brandr")], markBox("lrt")], 24);
  ga.row([[5, lhText(E.sub || "", "lr")], markBox("lr")]);
  ga.row([[5, lhText(eAddr[0] || "", "lr", "calbl")], markBox("lr")]);
  ga.row([[5, lhRuns([{ t: `${eAddr[1] || ""} `, font: "calbl" },
    ...inked("Tel: ", E.tel), ...inked("E-Mail: ", E.email)], "lr")], markBox("lr")]);
  ga.row([[5, lhRuns([...inked("GSTIN: ", E.gstin), ...inked("PAN No : ", E.pan)], "lr")], markBox("lr")]);
  ga.row([[5, lhText("", "lrb")], markBox("lrb")]);
  ga.row([[7, { v: "", s: A }]]);

  ga.row([[7, { v: "ANNEXTURE TO INVOICE", s: { ...A, align: "center" } }]]);
  ga.row([[1, { v: "", s: A }]]);
  // Only the answers are ruled on this line; the labels beside them are not.
  const aUnder = { ...A, border: "b" };
  ga.row([[1, { v: "Inv No & Dt", s: A }], [1, { v: invRef, s: aUnder }], [1, { v: "NO OF PKGS", s: A }],
    [1, { v: sum(rows, "boxes"), t: "n", s: { ...aUnder, align: "center" } }],
    [1, { v: "Shipment to", s: A }], [2, { v: (s.pod || b.shipTo || "").toUpperCase(), s: aUnder }]]);

  bands.forEach((band) => {
    ga.row([[1, { v: "", s: A }]]);
    const per = band.per100 ? "FOB / 100 PCS US$" : "FOB / PC US$";
    ga.row([[2, abox("ITEM CODE", AB)], [1, abox("QUANTITY", AB, { align: "center" })],
      [2, abox(per, AB, { align: "center" })], [1, abox("NET WT", AB, { align: "center" })],
      [1, abox("RATE / KG", AB)]]);
    ga.row([[2, abox(band.label, AB)], [1, abox("PCS", AB, { align: "center" })],
      [1, abox("Unit ", AB, { align: "center" })], [1, abox("Total ", AB, { align: "center" })],
      [1, abox("KGS", AB, { align: "center" })], [1, abox("US$", AB, { align: "center" })]]);
    band.rows.forEach((r, i) => {
      const at = ga.at() + 1;
      // The band is closed off under its last line rather than left hanging.
      const e = i === band.rows.length - 1 ? "thin" : "hair";
      const code = numOrText(r.it.code, aRule(e, A, { align: "left" }));
      ga.row([[2, code],
        [1, { v: r.pieces, t: "n", s: aRule(e, A, { align: "center" }) }],
        [1, { v: band.per100 ? r.fobPc * 100 : r.fobPc, t: "n", s: aRule(e, A, { fmt: USD }) }],
        [1, { f: `C${at}*D${at}${band.per100 ? "/100" : ""}`, s: aRule(e, A, { fmt: USD }) }],
        [1, { v: r.netTotal, t: "n", s: aRule(e, A, { fmt: "0.000" }) }],
        [1, { f: `IF(F${at},E${at}/F${at},0)`, s: aRule(e, A, { fmt: USD }) }]]);
    });
  });
  ga.row([[1, { v: "", s: A }]]);
  const aRows = [];
  ga.rows.forEach((r, i) => { if (r[4] && r[4].f && String(r[4].f).startsWith("C")) aRows.push(i + 1); });
  const aRuns = aRows.reduce((acc, n) => {
    const l = acc[acc.length - 1];
    if (l && n === l[1] + 1) l[1] = n; else acc.push([n, n]);
    return acc;
  }, []);
  const aSum = (col) => (aRuns.length ? `SUM(${rangeRefs(aRuns, col, "")})` : "0");
  ga.row([[1, { v: "TOTAL", s: { ...AB, border: "box" } }], ...blank(3, { ...A, border: "box" }),
    [1, { f: aSum("E"), s: { ...AB, border: "box", fmt: USD } }],
    [1, { f: aSum("F"), s: { ...AB, border: "box", fmt: "#,##0.000" } }],
    [1, { v: "", s: { ...A, border: "box" } }]]);

  /* The letterhead mark, on each of the three sheets as their file has it. The
     annexure is a wider sheet and carries it over its own title instead. */
  return [
    fitSheet({ name: "Page1", rows: g1.rows, merges: g1.merges, heights: g1.heights, image: formLogo(), ...SHEET }, { widen: false }),
    fitSheet({ name: "Page2", rows: g2.rows, merges: g2.merges, heights: g2.heights, image: formLogo(), ...SHEET }, { widen: false }),
    fitSheet({
      name: "Annx", rows: ga.rows, merges: ga.merges, heights: ga.heights,
      image: formLogo({ col: 5, colOff: 371475 }),
      widths: [12.6640625, 30.83203125, 13.83203125, 13.33203125, 14.33203125, 13.33203125, 11.5],
      defaultColWidth: 13.1640625, defaultRowHeight: 15, colStyle: A,
      page: {
        paper: 9, orientation: "portrait", scale: 83, fit: true, fitH: 0,
        margins: { left: 0.511811, right: 0.511811, top: 0.511811, bottom: 0.511811, header: 0, footer: 0 },
      },
    }, { widen: false }),
  ];
}

/* The same form on screen and on paper. The worksheet above rules the frame
   with cell borders; here the eleven columns are one table per page, ruled by
   the same rules — solid down, hairline between the goods — so the preview,
   the PDF and the .xlsx are the one document. */
export function customsInvoiceHtml(ctx) {
  const E = ctx.EXPORTER, b = ctx.buyer, s = ctx.inv.ship || {};
  const rows = L(ctx), ex = exRate(ctx);
  const bands = invoiceBands(ctx);
  const { p1, p2 } = invoiceLayout(bands);
  const marks = ciMarks(ctx, rows);
  const desc3 = goodsWrapped(bands, 42, 3);
  const desc2 = goodsWrapped(bands, 44, 2);
  const addr = addrLines(E), bAddr = addrLines({ addr: b.addr });
  const dated = (no, d) => (no ? `${no}${d ? ` DT. ${ddmm(d)}` : ""}` : "");
  const invRef = `${ctx.inv.invoiceNo || ""}${ctx.inv.date ? ` DT ${ddmm(ctx.inv.date)}` : ""}`;
  const orderRef = b.orderNo ? `${b.orderNo}${ctx.inv.date ? ` DT ${ddmm(ctx.inv.date)}` : ""}` : poHeaderList(ctx);
  const irn = String(s.irn || "");
  const fobUsd = sum(rows, "fobTotal"), taxTot = fobUsd * ex;

  const td = (v, cls = "", span = 1) =>
    `<td${span > 1 ? ` colspan="${span}"` : ""}${cls ? ` class="${cls}"` : ""}>${v == null || v === "" ? "&nbsp;" : v}</td>`;
  const vl = (v, span = 1) => td(esc(v), "", span);

  /* On screen a figure has to read exactly as the cell it copies. The form
     itself is typed in formats that carry no separators — "$"0.00 for the
     money, a plain integer for the pieces — and its rupees are grouped in
     thousands rather than in lakhs. The annexure is the one sheet of the three
     set in Excel's own grouped dollar, and its weights to three places. */
  const ciUsd = (n) => `$${Number(n || 0).toFixed(2)}`;
  const ciInr = (n) => wbRupee(n);
  const ciInt = (n) => String(Math.round(Number(n) || 0));

  /* The letterhead: the mark alongside the name, the trading line under it and
     the address below that — one block down the left of the form, as the sheet
     anchors it across rows 2 to 7, with the boxes on the right keeping their
     own rows beside it. */
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
    <tr>${td(esc("Buyers Order No: "), "k lf", 2)}${td(esc(orderRef), "rt0", 4)}</tr>
    <tr>${td("", "lf", 2)}${td("", "rt0", 4)}</tr>
    <tr>${td("Other Reference(s):", "k lf", 2)}${td(esc(s.otherRef || ""), "rt0", 4)}</tr>
    <tr>${td("", "lf", 2)}${td("", "rt0", 4)}</tr>
    <tr>${td("On Account &amp; Risks of:", "k lt", 2)}${td("", "lt0", 3)}${td("IRN No", "k lt")}${td(esc(irn.slice(0, 38)), "rt", 5)}</tr>
    <tr>${td(esc(b.name ? `Messrs ${b.name},` : ""), "lf", 5)}${td("", "lf")}${td(esc(irn.slice(38)), "rt0", 5)}</tr>
    <tr>${td(esc(b.brand ? `T/A ${b.brand}` : ""), "lf", 5)}${td("Ack No", "k lf")}${td(esc(s.ackNo || ""), "rt0", 5)}</tr>
    <tr>${td(esc(bAddr[0] || ""), "lf", 5)}${td("", "lf")}${td("", "rt0", 5)}</tr>
    <tr>${td(esc([bAddr[1], b.country && `(${b.country})`].filter(Boolean).join(" ")), "lf bb", 5)}
      ${td("Ack Dt", "k lf")}${td(esc(s.ackDt || ""), "rt0", 5)}</tr>
    <tr>${td("Invoice of:", "k lt")}${td(esc(desc3[0]), "lt", 4)}
      ${td("Country of Origin", "k lt c", 3)}${td("Country of Final Destination", "k rt c", 3)}</tr>
    <tr>${td("", "lf")}${td(esc(desc3[1]), "", 4)}
      ${td(esc(E.origin || "INDIA"), "k lf bb c", 3)}${td(esc((s.finalDest || b.country || "").toUpperCase()), "k rt0 bb c", 3)}</tr>
    <tr>${td("", "lf")}${td(esc(desc3[2]), "", 4)}${td("BL. NO.", "k lf")}${td(esc(dated(s.blNo, s.blDate)), "rt0", 5)}</tr>
    <tr>${td("Pre-Carraige by:", "k lt c", 2)}${td("Place of Receipt by Pre-Carraige", "k lrt c", 3)}
      ${td("Shipped Per", "k lf")}${td(esc(s.vessel || ""), "rt0", 5)}</tr>
    <tr>${td(esc(s.preCarriage || ""), "lf bb c", 2)}${td(esc(s.receiptPlace || ""), "lrb c", 3)}
      ${td("S/B No:", "k lf")}${td(esc(dated(s.sbNo, s.sbDate)), "rt0", 5)}</tr>
    <tr>${td("Shipped per:", "k lt c", 2)}${td("Port of Loading:", "k lrt c", 3)}
      ${td("Terms of Delivery:", "k lt", 2)}${td(esc((s.terms || "").toUpperCase()), "rt", 4)}</tr>
    <tr>${td(esc(s.vessel || ""), "lf bb c", 2)}${td(esc(s.pol || ""), "k lrb c", 3)}
      ${td("Terms of Payment:", "k lf", 2)}${td(esc(s.payment || "D.P.SIGHT DRAFT"), "rt0", 4)}</tr>
    <tr>${td("Port of Discharge:", "k lt c", 2)}${td("Port of destination", "k lrt c", 3)}
      ${td("Through:", "k lf", 2)}${td(esc(s.bank || ""), "k rt0", 4)}</tr>
    <tr>${td(esc((s.pod || b.shipTo || "").toUpperCase()), "lf bb c", 2)}${td(esc((s.finalDest || s.pod || b.shipTo || "").toUpperCase()), "lrb c", 3)}
      ${td("", "lf bb", 2)}${td(esc(s.bankAddr || ""), "k rt0 bb", 4)}</tr>
    <tr>${td("Marks &amp; Nos.", "h l")}${td("No &amp; Kinds of Pkgs   Description of Goods", "h", 3)}
      ${["Quantity", "Rate", "Amount", "Rate", "Taxable Amount", "GST Rate", "GST Amount"].map((h) => td(h, "h")).join("")}</tr>
    <tr>${vl(`${marks.prefix} NOS :`)}${td(esc(`${s.pkgs || `${sum(rows, "boxes")} PACKAGES`} CONTAINING`), "l", 4)}
      ${td("FOB MUMBAI IN US$", "c", 2)}${td("FOB MUMBAI IN INR", "c", 2)}${td("", "", 2)}</tr>
    <tr>${vl(`${marks.start} - ${marks.end}`)}${td(esc(desc2[0]), "l", 4)}${td("", "", 2)}
      ${td(esc(`EX. RATE @ Rs.${num(ex)}`), "c", 2)}${td("", "", 2)}</tr>
    <tr>${vl(String(marks.end))}${td(esc(desc2[1]), "l", 4)}${td("", "", 6)}</tr>`;

  const line = (l) => {
    if (!l) return `<tr class="gd">${td("")}${td("", "", 10)}</tr>`;
    if (l.kind === "head") return `<tr class="gd"><td>&nbsp;</td>${td(esc(l.band.head), "bnd l", 6)}${td("", "", 4)}</tr>`;
    if (l.kind === "cols") {
      const B = l.band;
      const cells = [td("CODE", "hd"), td(esc(B.size), "hd", B.wide ? 2 : 1)];
      if (B.len) cells.push(td("LEN (MM)", "hd"));
      else if (!B.wide) cells.push(td(""));
      cells.push(td("PIECES", "hd"), td(esc(B.rate), "hd"), td("", "", 5));
      return `<tr class="gd"><td>&nbsp;</td>${cells.join("")}</tr>`;
    }
    const { band, r } = l;
    const rate = band.per100 ? r.fobPc * 100 : r.fobPc;
    const g = gstFor(ctx, r.it, r.supId), tax = r.fobTotal * ex;
    const cells = [td(esc(r.it.code), "c"), td(esc(r.it.size), "c", band.wide ? 2 : 1)];
    if (band.len) cells.push(td(esc(r.it.length), "c"));
    else if (!band.wide) cells.push(td(""));
    /* Where each figure sits in its column is the cell's own setting on their
       sheet: the quantity, the rate per piece and the GST rate centred, the
       money ranged right against the rule. */
    cells.push(
      `<td class="c" data-t="int" data-v="${r.pieces}">${ciInt(r.pieces)}</td>`,
      `<td class="c" data-t="usd" data-v="${rate}">${ciUsd(rate)}</td>`,
      `<td class="r" data-t="usd" data-v="${r.fobTotal}">${ciUsd(r.fobTotal)}</td>`,
      `<td class="c" data-t="inr" data-v="${r.pieces ? tax / r.pieces : 0}">${ciInr(r.pieces ? tax / r.pieces : 0)}</td>`,
      `<td class="r" data-t="inr" data-v="${tax}">${ciInr(tax)}</td>`,
      `<td class="c">${Number((g * 100).toFixed(2))}%</td>`,
      `<td class="r" data-t="inr" data-v="${Math.round(tax * g)}">${ciInr(Math.round(tax * g))}</td>`,
    );
    return `<tr class="ln"><td>&nbsp;</td>${cells.join("")}</tr>`;
  };

  const foot = () => `
    <tr>${td(esc(E.gstin ? `GSTIN : ${E.gstin}` : ""), "k lt", 7)}${td(esc(` FOR ${E.name}`), "k rt r", 4)}</tr>
    <tr>${td(esc(E.pan ? `PAN No: ${E.pan}` : ""), "k lf", 7)}${td("", "rt0", 4)}</tr>
    <tr>${td("Declaration:-", "lf", 7)}${td("", "rt0", 4)}</tr>
    <tr>${td("We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.", "lf", 7)}${td("", "rt0", 4)}</tr>
    <tr>${td("SUPPLY MEANT FOR EXPORT WITH PAYMENT OF INTEGRATED TAX", "k lf", 7)}${td("", "rt0", 4)}</tr>
    <tr>${td("We intend to claim rewards under RoDTEP", "k lf bb", 7)}${td(" PROPRIETOR", "k rt0 bb r", 4)}</tr>`;

  const cfUsd = p1.reduce((n, l) => n + (l.kind === "item" ? l.r.fobTotal : 0), 0);
  const cfTax = cfUsd * ex;
  const cfGst = p1.reduce((n, l) => n + (l.kind === "item" ? Math.round(l.r.fobTotal * ex * gstFor(ctx, l.r.it, l.r.supId)) : 0), 0);
  const gstAll = rows.reduce((n, r) => n + Math.round(r.fobTotal * ex * gstFor(ctx, r.it, r.supId)), 0);

  const colg = `<colgroup>${[12.6, 12.9, 10.8, 10.8, 10.8, 12.1, 12.1, 12.1, 15.5, 12.1, 12.1]
    .map((w) => `<col style="width:${(w / 133.9) * 100}%">`).join("")}</colgroup>`;

  const page1 = `<table class="wb ci">${colg}<tbody>${head(false)}
    ${Array.from({ length: CI_P1_BODY }, (_, i) => line(p1[i])).join("")}
    <tr class="tt">${td("")}${td("Total C/F Page :2", "k c", 3)}${td("", "", 2)}
      ${td(ciUsd(cfUsd), "r dbl")}${td("")}${td(ciInr(cfTax), "r dbl")}${td("")}${td(ciInr(cfGst), "r dbl")}</tr>
    ${foot()}</tbody></table>`;

  /* Page 2's left margin carries the container, the weights and the freight
     terms; the rest of it is the same frame continued. */
  const netWt = Number(s.netWt) || sum(rows, "netTotal");
  const grossWt = Number(s.grossWt) || sum(rows, "grossTotal");
  // Keyed by the line's place in the frame, so it lands on the same row of the
  // form as the worksheet puts it — the frame starts at row CI_P2_TOP.
  // Every line of the margin is typed centred in it, the weights to three
  // places and with no separators, as their sheet formats them.
  const margin = {
    5: ["Container No.", "k c"], 6: [s.container || "", "c"],
    15: ["Seal No.", "k c"], 16: [s.seal || "", "c"],
    24: ["Nett Wt.", "k c"], 25: [wbFixed(netWt, 3), "c"], 26: ["KGS", "c"],
    33: ["Gross Wt", "k c"], 34: [wbFixed(grossWt, 3), "c"], 35: ["KGS", "c"],
    41: ["Freight", "k c"], 42: ["Payable at", "k c"], 43: ["Destination", "k c"],
    // The FOB value box sits at the foot of the frame, whatever its depth.
    [ciP2Body(p2) - 2]: ["FOB VALUE", "k c"], [ciP2Body(p2) - 1]: [ciUsd(fobUsd), "k c"],
  };
  const body2 = Array.from({ length: ciP2Body(p2) }, (_, i) => {
    const html = line(p2[i]);
    const m = margin[i];
    return m ? html.replace("<td>&nbsp;</td>", td(esc(String(m[0])), m[1])) : html;
  }).join("");

  const hsnCodes = [...new Set(bands.map((x) => x.hsn).filter(Boolean))];
  const breakup = Array.from({ length: Math.max(hsnCodes.length, CI_HSN_ROWS) },
    (_, i) => hsnCodes[i]).map((hsn) => {
    if (!hsn) return `<tr>${td("", "lf")}${td("", "bx", 2)}${td("", "bx")}${td("", "bx")}${td("", "bx", 2)}
      ${td("", "bx")}${td("", "bx")}${td("", "bx")}${td("", "bx")}</tr>`;
    const mine = rows.filter((r) => hsnText(r.it) === hsn);
    const pcs = sum(mine, "pieces"), val = sum(mine, "fobTotal");
    const tax = val * ex, g = mine.reduce((n, r) => n + Math.round(r.fobTotal * ex * gstFor(ctx, r.it, r.supId)), 0);
    return `<tr>${td("", "lf")}${td(esc(`HSN CODE : ${hsn}`), "k bx", 2)}
      ${td(ciInt(pcs), "bx c")}${td(ciUsd(val), "bx r")}${td(ciInr(tax), "bx r", 2)}
      ${td(ciInr(0), "bx r")}${td(ciInr(0), "bx r")}${td(ciInr(g), "bx r")}${td(ciInr(g), "bx r")}</tr>`;
  }).join("");

  const page2 = `<table class="wb ci">${colg}<tbody>${head(true)}
    <tr class="ln">${td("")}${td("", "l", 4)}${td("BAL B/F…", "c")}${td(usd(cfUsd), "r")}${td("")}
      ${td(ciInr(cfTax), "r")}${td("")}${td(ciInr(cfGst), "r")}</tr>
    ${body2}
    <tr class="tt">${td(ciInr(taxTot), "k c")}${td("Total FOB Mumbai Value :", "k l", 3)}${td("", "", 2)}
      ${td(ciUsd(fobUsd), "r dbl")}${td("")}${td(ciInr(taxTot), "r dbl")}${td("")}${td(ciInr(gstAll), "r dbl")}</tr>
    <tr>${td("", "lf bb")}${td("BREAKUP OF GST", "k bx", 2)}${td("UOM", "k bx c")}${td("VALUE (US$)", "k bx c")}
      ${td("TAXABLE VALUE (INR)", "k bx c", 2)}${td("CGST", "k bx c")}${td("SGST", "k bx c")}
      ${td("IGST", "k bx c")}${td("TOTAL GST", "k bx c")}</tr>
    ${breakup}
    <tr>${td("", "lf")}${td("TOTAL", "k bx", 2)}${td(ciInt(sum(rows, "pieces")), "bx c dbl")}
      ${td(ciUsd(fobUsd), "bx r dbl")}${td(ciInr(taxTot), "bx r dbl", 2)}${td(ciInr(0), "bx r dbl")}${td(ciInr(0), "bx r dbl")}
      ${td(ciInr(gstAll), "bx r dbl")}${td(ciInr(gstAll), "bx r dbl")}</tr>
    <tr>${td("", "lf bb")}${td(esc(amountWords(fobUsd, "US DOLLARS", "CENTS", false)), "rt0 bb", 10)}</tr>
    <tr>${td("", "lf")}${td(esc(amountWords(taxTot, "INDIAN RUPEES", "PAISE", true)), "rt0", 10)}</tr>
    ${foot()}</tbody></table>`;

  /* The annexure carries the printed letterhead across the head of it — the
     name in red, the address under it in blue with the numbers in red — and
     the mark in a box of its own beside them, as their sheet pastes it. */
  const inked = (label, value) => (value
    ? `<span class="lb">${esc(label)}</span><span class="rd">${esc(value)} </span>` : "");
  const annxHead = `<tr><td class="alh bx" colspan="5">
      <div class="brand">${esc(E.name)}</div>
      <div class="sub">${esc(E.sub || "")}</div>
      <div class="addr lb">${esc(addr[0] || "")}</div>
      <div class="addr"><span class="lb">${esc(addr[1] || "")} </span>${inked("Tel: ", E.tel)}${inked("E-Mail: ", E.email)}</div>
      <div class="addr">${inked("GSTIN: ", E.gstin)}${inked("PAN No : ", E.pan)}</div></td>
    <td class="amark bx" colspan="2">${imgTag(LOGO_SRC, "pllogo")}</td></tr>`;

  const annx = `<table class="wb ci annx">
    <colgroup>${[12.7, 30.8, 13.8, 13.3, 14.3, 13.3, 11.5]
    .map((w) => `<col style="width:${(w / 109.7) * 100}%">`).join("")}</colgroup>
    ${annxHead}
    <tr class="nb"><td class="nb" colspan="7">&nbsp;</td></tr>
    <tr class="nb"><td class="nb attl" colspan="7">ANNEXTURE TO INVOICE</td></tr>
    <tr class="nb"><td class="nb" colspan="7">&nbsp;</td></tr>
    <tr>${td("Inv No &amp; Dt")}${td(esc(invRef), "bb")}${td("NO OF PKGS")}
      ${td(ciInt(sum(rows, "boxes")), "bb c")}
      ${td("Shipment to")}${td(esc((s.pod || b.shipTo || "").toUpperCase()), "bb", 2)}</tr>
    ${bands.map((band) => `
      <tr class="nb"><td class="nb" colspan="7">&nbsp;</td></tr>
      <tr>${td("ITEM CODE", "h l", 2)}${td("QUANTITY", "h")}${td(band.per100 ? "FOB / 100 PCS US$" : "FOB / PC US$", "h", 2)}
        ${td("NET WT", "h")}${td("RATE / KG", "h l")}</tr>
      <tr>${td(esc(band.label), "h l bnl", 2)}${td("PCS", "h")}${td("Unit", "h")}${td("Total", "h")}
        ${td("KGS", "h")}${td("US$", "h")}</tr>
      ${band.rows.map((r) => {
    const rate = band.per100 ? r.fobPc * 100 : r.fobPc;
    return `<tr class="ln">${td(esc(r.it.code), "l", 2)}${td(ciInt(r.pieces), "c")}
        ${td(usd(rate), "r")}${td(usd(r.fobTotal), "r")}${td(wbFixed(r.netTotal, 3), "r")}
        ${td(r.netTotal ? usd(r.fobTotal / r.netTotal) : "—", "r")}</tr>`;
  }).join("")}`).join("")}
    <tr class="nb"><td class="nb" colspan="7">&nbsp;</td></tr>
    <tr>${td("TOTAL", "k bx")}${td("", "bx", 3)}${td(usd(fobUsd), "k bx r")}
      ${td(wbFixed(sum(rows, "netTotal"), 3), "k bx r")}${td("", "nb")}</tr>
  </table>`;

  return `${page1}<div class="pgbrk"></div>${page2}<div class="pgbrk"></div>${annx}`;
}

export const B_18 = (ctx) => ({
  name: "Custom_Invoice_18",
  html: customsInvoiceHtml(ctx),
  sheets: customsInvoiceSheets(ctx),
  page: "portrait",
});
