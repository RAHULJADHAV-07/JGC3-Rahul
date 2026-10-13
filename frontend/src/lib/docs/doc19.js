import { L, PL_FORMS, bundled, PL_P2_TOP, PL_TOP, PL_WEIGHTS, PL_WT, addrLines, ciMarks, ddmm, esc, familyOf, fitSheet, formGrid, formLogo, lineRuns, numOrText, packingBands, packingDescribe, packingLayout, plOrderBox, plP2Body, poHeaderList, rangeRefs, sum, wbFixed } from "./common.js";

/* The break-up of weights by material is printed only when the consignment
   carries corrugated boxes — it exists to separate the cartons' weight from
   the goods'. Without them the foot carries the signature alone. */
const withBreakup = (form, bands) => form.breakup && bands.some((b) => b.key === "box");
import { LOGO_SRC, SIGN_SRC, STAMP_SRC, imgTag, signImage, stampImage } from "../logo.js";
import { colLetter } from "../xlsx.js";

export function packingListSheets(ctx, form) {
  const E = ctx.EXPORTER, b = ctx.buyer, s = ctx.inv.ship || {};
  const rows = L(ctx);
  const bands = packingBands(ctx, form.buyer);
  const { p1, carry, p2 } = packingLayout(bands, form);
  const marks = ciMarks(ctx, rows);
  const desc = packingDescribe(ctx, bands, rows, form.buyer);

  /* Their whole form is Arial 9 — only the address block above it is the 10pt
     of the letterhead — and every cell shrinks rather than wraps, so a long
     entry stays on its one ruled line. */
  const F = { font: "ref9", border: false, valign: "center", shrink: true };
  /* Unlike the invoice book, this one is typed in colour, and the colour means
     something: the form's own printed labels are blue, the answers customs
     reads straight off the head of it — origin, destination, port of loading —
     are red, and so is the title. What the operator types in against a label
     (the invoice number, the vessel, the container) stays black, as does the
     whole of the goods table. The letterhead is the house maroon over the blue
     the address is set in. */
  const C = {
    txt: F,                                          // black — everything typed in
    lbl: { ...F, font: "ref9bb" },                   // blue — the form's own labels
    key: { ...F, font: "ref9b" },                    // black bold — the marks boxes
    ans: { ...F, font: "ref9r" },                    // red — what customs reads off it
    ttl: { ...F, font: "ref9r", align: "center" },
    brand: { ...F, font: "brand", align: "right" },  // maroon Centaur, the letterhead
    sub: { ...F, font: "refmn", align: "right" },    // maroon, the line under it
    addr: { ...F, font: "refbl", align: "right" },   // blue, the address and the phone
    sign: { ...F, font: "ref9bl", align: "right" },  // blue, the line it is signed for
    ctr: { ...F, align: "center" },
    rgt: { ...F, align: "right" },
  };
  /* The frame: solid down the columns, and whatever each row rules across. */
  const rule = (t, b2, extra = {}) =>
    ({ ...F, border: { l: "thin", r: "thin", t, b: b2 }, ...extra });
  const G = {
    band: rule("thin", "thin"),                       // a band heading, and its columns
    bandL: rule("thin", "thin", { align: "left" }),
    cols: rule("thin", "thin", { align: "center" }),
    open: rule("", ""),                               // the columns only — a blank line
    sr: rule("hair", "hair"),
    ctr: rule("hair", "hair", { align: "center" }),
    wt: rule("hair", "hair", { align: "center", fmt: PL_WT }),
    tot: { ...F, border: "box", align: "center", fmt: PL_WT },
  };
  const blank = (n, s2 = C.txt) => Array.from({ length: n }, () => [1, { v: "", s: s2 }]);

  /* ---- the head of the list, rows 1-24 ----------------------------------- */
  const invRef = `${ctx.inv.invoiceNo || ""}${ctx.inv.date ? ` DT ${ddmm(ctx.inv.date)}` : ""}`;
  const orderRef = b.orderNo
    ? `${b.orderNo}${ctx.inv.date ? ` DT ${ddmm(ctx.inv.date)}` : ""}` : poHeaderList(ctx);
  const blLine = s.blNo ? `BL : ${s.blNo}${s.blDate ? `  DT. ${ddmm(s.blDate)}` : ""}` : "";
  const addr = addrLines(E), bAddr = addrLines({ addr: b.addr });

  // Rows 4-7: the letterhead down the left of them, the order box beside it.
  const orderBox = plOrderBox(ctx, form, orderRef, s);
  const headLeft = [
    [E.sub || "", C.sub, "lr"],
    [addr[0] || "", C.addr, "lr"],
    [addr[1] || "", C.addr, "lr"],
    [[E.tel && `Tel: ${E.tel}`, E.email && `E-Mail: ${E.email}`].filter(Boolean).join(" "), C.addr, "lrb"],
  ];

  function headBlock(grid) {
    const { row } = grid;
    row([[9, { v: "PACKING LIST", s: { ...C.ttl, border: "box" } }]]);
    row([[4, { v: E.name, s: { ...C.brand, border: "lt" } }, 1],
      [2, { v: "Invoice No. ", s: { ...C.lbl, border: "lt" } }],
      [3, { v: invRef, s: { ...C.txt, border: "rt" } }]], 12.75);
    // The name box runs down into this row, so the columns it covers are left
    // as single cells here rather than merged a second time.
    row([[1, { v: "", s: { ...C.txt, border: "l" } }], ...blank(2),
      [1, { v: "", s: { ...C.txt, border: "r" } }],
      [2, { v: "", s: { ...C.txt, border: "lb" } }], [3, { v: "", s: { ...C.txt, border: "rb" } }]], 12.75);
    headLeft.forEach(([text, style, edge], i) => {
      const [lbl, val, [lb, vb]] = orderBox[i];
      // Only a line that carries a label is set in the form's blue; the rest of
      // the box is the plain face the answer is typed in.
      row([[4, { v: text, s: { ...style, border: edge } }],
        [2, { v: lbl, s: { ...(lbl ? C.lbl : C.txt), border: lb } }],
        [3, { v: val, s: { ...C.txt, border: vb } }]], 12.75);
    });
    row([[3, { v: "On Account & risks of", s: { ...C.lbl, border: "lt" } }],
      [1, { v: "", s: { ...C.txt, border: "rt" } }],
      [5, { v: blLine, s: { ...C.lbl, border: "lrt" } }]]);
    row([[4, { v: b.name ? `Messrs. ${b.name},` : "", s: { ...C.txt, border: "lr" } }],
      [5, { v: "", s: { ...C.txt, border: "lr" } }]]);
    row([[4, { v: b.brand ? `T/A ${b.brand},` : "", s: { ...C.txt, border: "lr" } }],
      [5, { v: s.vessel ? `Shipped per: ${s.vessel}` : "", s: { ...C.txt, border: "lr" } }]]);
    row([[4, { v: bAddr[0] || "", s: { ...C.txt, border: "lr" } }],
      [5, { v: "", s: { ...C.txt, border: "lr" } }]]);
    row([[4, { v: [bAddr[1], b.country && `(${b.country})`].filter(Boolean).join(" "), s: { ...C.txt, border: "lr" } }],
      [5, { v: "", s: { ...C.txt, border: "lrb" } }]]);
    row([[4, { v: "", s: { ...C.txt, border: "lr" } }],
      [3, { v: "Country of Origin", s: { ...C.lbl, border: "lrt", align: "center" } }],
      [2, { v: "Country of Final Destination", s: { ...C.lbl, border: "lrt", align: "center" } }]]);
    row([[4, { v: "", s: { ...C.txt, border: "lr" } }],
      [3, { v: E.origin || "INDIA", s: { ...C.ans, border: "lrb", align: "center" } }],
      [2, { v: (s.finalDest || b.country || "").toUpperCase(), s: { ...C.ans, border: "lrb", align: "center" } }]]);
    row([[4, { v: "", s: { ...C.txt, border: "lr" } }],
      [2, { v: "Shipping Marks ", s: { ...C.lbl, border: "l" } }],
      [3, { v: "CONTAINER NO : ", s: { ...C.key, border: "lrt" } }]]);
    row([[3, { v: "Pre-Carraige by:", s: { ...C.lbl, border: "lt" } }],
      [1, { v: "Place of Receipt by Pre-Carraige", s: { ...C.lbl, border: "lrt" } }],
      [2, { v: marks.prefix, s: { ...C.key, border: "l" } }],
      [3, { v: s.container || "", s: { ...C.key, border: "lr" } }]]);
    /* The marks their form types under the prefix: the range this consignment
       takes out of the running series, over the serial it ends on. */
    row([[3, { v: s.preCarriage || "", s: { ...C.txt, border: "lb" } }],
      [1, { v: s.receiptPlace || "", s: { ...C.txt, border: "lrb" } }],
      [2, { v: `${marks.start} - ${marks.end} / ${marks.end}`, s: { ...C.txt, border: "l" } }],
      [3, { v: "", s: { ...C.key, border: "lrb" } }]]);
    row([[3, { v: "Shipped per:", s: { ...C.lbl, border: "lrt" } }],
      [1, { v: "Port of Loading:", s: { ...C.lbl, border: "lrt" } }],
      [2, { v: "", s: { ...C.txt, border: "lr" } }],
      [3, { v: "SEAL NO : ", s: { ...C.key, border: "lr" } }]]);
    row([[3, { v: s.vessel || "", s: { ...C.txt, border: "lrb" } }],
      [1, { v: s.pol || "", s: { ...C.ans, border: "lrb", align: "center" } }],
      [2, { v: "", s: { ...C.txt, border: "lr" } }],
      [3, { v: s.seal || "", s: { ...C.key, border: "lr" } }]]);
    row([[3, { v: "Port of Discharge:", s: { ...C.lbl, border: "lrt" } }],
      [1, { v: "Final Destination:", s: { ...C.lbl, border: "lrt" } }],
      [2, { v: "", s: { ...C.txt, border: "lr" } }], [3, { v: "", s: { ...C.txt, border: "lr" } }]]);
    row([[3, { v: (s.pod || b.shipTo || "").toUpperCase(), s: { ...C.txt, border: "lrb", align: "center" } }],
      [1, { v: (s.finalDest || s.pod || b.shipTo || "").toUpperCase(), s: { ...C.txt, border: "lrb", align: "center" } }],
      [2, { v: "", s: { ...C.txt, border: "lrb" } }], [3, { v: "", s: { ...C.txt, border: "lrb" } }]]);
  }

  /* Rows 22-24 head the goods, and carry the description of the consignment
     beside them. Page 2 refers back rather than repeating it. */
  function goodsHead(grid, mirror) {
    const { row } = grid;
    const D = (i) => (mirror
      ? { f: `Page1!B${23 + i}`, s: { ...C.txt, border: "lr", align: "left" } }
      : { v: desc[i], s: { ...C.txt, border: "lr", align: "left" } });
    row([[1, { v: "Sr.Nos.", s: { ...C.key, border: "l" } }],
      [5, { v: "No. & Kind of Pkgs                       Description of Goods", s: { ...C.key, border: "lrt", align: "left" } }],
      [1, { v: "Quantity", s: { ...C.key, border: "lrt" } }],
      [2, { v: "WEIGHT", s: { ...C.key, border: "rt", align: "center" } }]]);
    row([[1, { v: "", s: { ...C.txt, border: "l" } }], [5, D(0)],
      [1, { v: "", s: { ...C.txt, border: "lr" } }],
      [1, { v: "NETT", s: { ...C.key, border: "box", align: "center" } }],
      [1, { v: "GROSS", s: { ...C.key, border: "box", align: "center" } }]]);
    row([[1, { v: "", s: { ...C.txt, border: "l" } }], [5, D(1)],
      [1, { v: "", s: { ...C.txt, border: "l" } }],
      [1, { v: "KGS", s: { ...C.key, border: "lrb", align: "center" } }],
      [1, { v: "KGS", s: { ...C.key, border: "lrb", align: "center" } }]]);
  }

  /* One line of the goods frame, whichever page it lands on. */
  function bodyLine(grid, line, at) {
    const { row } = grid;
    if (!line) { row(blank(9, G.open)); return; }
    if (line.kind === "head") {
      row([[1, { v: "", s: G.band }], [5, { v: line.band.head, s: G.bandL }],
        ...blank(3, G.band)]);
      return;
    }
    if (line.kind === "cols") {
      const B2 = line.band;
      const cells = [[1, { v: "SR NOS", s: G.band }], [1, { v: "CODE", s: G.cols }],
        [B2.len ? 1 : 2, { v: B2.size, s: G.cols }]];
      if (B2.len) cells.push([1, { v: "LEN (MM)", s: G.cols }]);
      cells.push([1, { v: B2.per, s: G.band }], [1, { v: B2.pkg, s: G.cols }],
        [1, { v: "PIECES", s: G.cols }], ...blank(2, G.band));
      row(cells);
      return;
    }
    const { band, r } = line;
    const cells = [[1, { v: r.range, s: G.sr }], [1, numOrText(r.it.code, G.ctr)],
      // Goods in bundles say so in brackets — beside the length, or beside the
      // size where the band has no length column.
      [band.len ? 1 : 2, numOrText(band.len ? r.it.size : bundled(r.it.size, r.it), G.ctr)]];
    if (band.len) cells.push([1, numOrText(bundled(r.it.length, r.it), G.ctr)]);
    cells.push(
      [1, { v: r.packing, t: "n", s: G.ctr }],
      /* Their own formula: the packages a line takes are its pieces over what
         one package holds, rounded up — a part-filled package is still one.
         Where the master does not say how many go in a package, the count
         actually packed stands, so the weights below never quietly go to nil
         on a half-filled master. */
      [1, { f: `IF(E${at}=0,${r.boxes},ROUNDUP(G${at}/E${at},0))`, s: G.ctr }],
      [1, { v: r.pieces, t: "n", s: G.ctr }],
      [1, { f: `F${at}*${Number(r.it.netPerBox) || 0}`, s: G.wt }],
      [1, { f: `F${at}*${Number(r.it.grossPerBox) || 0}`, s: G.wt }],
    );
    row(cells);
  }

  /* The line the list is carried forward or totalled on. */
  function totalLine(grid, label, last) {
    grid.row([...blank(3, { ...C.txt, border: "lb" }),
      [1, { v: label, s: { ...C.key, border: "rb", align: "right" } }],
      ...blank(3, { ...C.txt, border: "lrb" }),
      [1, { f: `SUM(H${PL_TOP}:H${last})`, s: G.tot }],
      [1, { f: `SUM(I${PL_TOP}:I${last})`, s: G.tot }]]);
  }

  /* The space the list is signed in, at the foot of page 1 — the name it is
     signed for, four rows clear for the stamp, then who signs it. */
  /* The customs copy types the name it is signed for and leaves the space
     under it for a wet signature; the buyer's copy (32) goes out already
     signed, so those two lines are left blank and the client's own scans are
     stood over the block instead. */
  const signed = !!form.signed;
  const signRows = [];
  function signBlock(grid, forText) {
    const { row } = grid;
    signRows.push(grid.at());
    const left = (edge) => [[1, { v: "", s: { ...C.txt, border: `l${edge}` } }],
      ...blank(3, { ...C.txt, border: edge }), [1, { v: "", s: { ...C.txt, border: `r${edge}` } }]];
    row([...left(""), [4, { v: signed ? "" : forText, s: { ...C.sign, border: "lrt" } }]], 12.75);
    row([...left(""), [4, { v: "", s: { ...C.txt, border: "lr" } }, 2]], 12.75);
    for (let i = 0; i < 2; i++) {
      row([...left(""), [1, { v: "", s: { ...C.txt, border: "l" } }], ...blank(2),
        [1, { v: "", s: { ...C.txt, border: "r" } }]], 12.75);
    }
    row([...left("b"), [2, { v: "", s: { ...C.txt, border: "lb" } }],
      [2, { v: signed ? "" : "PROPRIETOR", s: { ...C.txt, border: "rb", align: "right" } }]], 12.75);
  }

  /* The foot of page 2 where there is no break-up to put beside the signature:
     the left of the block is one empty box six rows deep, as their item-wise
     file rules it, with the space it is signed in against the right margin. The
     two lines of it point back at page 1 rather than being typed again, so the
     two pages cannot sign for different names. */
  function signBlock2(grid, forRef, propRef) {
    const { row } = grid;
    signRows.push(grid.at());
    const box = () => blank(5, { ...C.txt, border: "box", align: "center" });
    row([[5, { v: "", s: { ...C.txt, border: "box" } }, 5],
      [4, signed ? { v: "", s: { ...C.sign, border: "lrt" } } : { f: forRef, s: { ...C.sign, border: "lrt", align: "right" } }]], 12.75);
    row([...box(), [4, { v: "", s: { ...C.txt, border: "lr" } }, 3]], 12.75);
    for (let i = 0; i < 3; i++) row(box(), 12.75);
    row([...box(), [2, { v: "", s: { ...C.txt, border: "lb" } }],
      [2, signed ? { v: "", s: { ...C.txt, border: "rb" } } : { f: propRef, s: { ...C.txt, border: "rb", align: "right" } }]], 12.75);
  }

  const SHEET = {
    widths: [11.83203125, 9.33203125, 9.33203125, 36.5, 12.6640625, form.colF[0],
      9.1640625, 12.33203125, 12.33203125],
    defaultColWidth: 9.33203125,
    defaultRowHeight: 12,
    colStyle: F,
    page: {
      paper: 9, orientation: "portrait", scale: form.scale[0],
      margins: { left: 0.393701, right: 0.393701, top: 0.393701, bottom: 0.393701, header: 0, footer: 0 },
    },
  };

  /* Where the client's own signature and stamp sit on their copy, measured off
     it: the stamp a little past the middle of the form and the signature block
     filling the last quarter of it, both standing the depth of the block they
     are in. Sized to end inside the form — a picture hanging past the last
     column widens the print range, and the sheet then comes off the side of the
     paper. */
  const SIGN_CX = 2230000, STAMP_CX = 692000;
  const scans = (row) => (signed && row
    ? [signImage(SIGN_CX) && { ...signImage(SIGN_CX), name: "Signature", col: 4, colOff: 412000, row, rowOff: 20000 },
      stampImage(STAMP_CX) && { ...stampImage(STAMP_CX), name: "Stamp", col: 3, colOff: 2003000, row, rowOff: 20000 }]
    : []);

  /* ---- Page 1 ------------------------------------------------------------ */
  const g1 = formGrid(9);
  headBlock(g1);
  goodsHead(g1, false);
  for (let i = 0; i < form.p1Body; i++) bodyLine(g1, p1[i], PL_TOP + i);
  const cfRow = PL_TOP + form.p1Body;                    // the carried-forward line
  totalLine(g1, "BALANCE C/F….", cfRow - 1);
  const forRow = g1.at() + 1;
  signBlock(g1, `FOR ${E.name}`.toUpperCase());
  const propRow = g1.at();

  /* ---- Page 2 — its head is Page 1's, cell for cell ---------------------- */
  const g2 = formGrid(9);
  g2.row([[7, { v: "PACKING LIST", s: { ...C.ttl, border: "ltb" } }],
    [2, { v: "Page 2", s: { ...C.ans, border: "rtb", align: "right" } }]]);
  const mirror = (r) => (g1.rows[r - 1] || []).map((c, i) => (c && (c.f || (c.v !== "" && c.v != null))
    ? { s: c.s, f: `Page1!${colLetter(i + 1)}${r}` } : c));
  for (let r = 2; r <= 21; r++) {
    g2.rows.push(mirror(r));
    g2.heights[r - 1] = g1.heights[r - 1];
  }
  // Rows 2-21's merges are Page 1's, and row 2's name box runs down into row 3.
  g1.merges.filter((m) => {
    const at = Number(/^[A-I](\d+):/.exec(m)?.[1]);
    return at >= 2 && at <= 21;
  }).forEach((m) => g2.merges.push(m));
  goodsHead(g2, true);

  /* The balance brought forward, with the band it carries on with typed on the
     same line — page 2 has one line fewer of goods for it. */
  g2.row([[1, { v: "", s: rule("", "thin") }],
    [4, { v: carry ? carry.head : "", s: rule("", "thin", { align: "left" }) }],
    [2, { v: "BAL B/F…", s: { ...rule("", "thin", { align: "right" }), font: "ref9b" } }],
    [1, { f: `Page1!H${cfRow}`, s: { ...G.wt, border: { l: "thin", r: "thin" } } }],
    [1, { f: `Page1!I${cfRow}`, s: { ...G.wt, border: { l: "thin", r: "thin" } } }]], 12.75);
  const p2Body = plP2Body(p2, form);
  for (let i = 0; i < p2Body; i++) bodyLine(g2, p2[i], PL_P2_TOP + i);
  const totRow = PL_P2_TOP + p2Body;
  totalLine(g2, "TOTAL WEIGHTS……….", totRow - 1);

  /* ---- the break-up of weights, totalled by material ---------------------- */
  if (withBreakup(form, bands)) {
    const box = (v, st = C.txt, extra = {}) => ({ v, s: { ...st, border: "box", ...extra } });
    g2.row([[3, box("BREAK-UP OF WEIGHTS")], [1, box("NET WT", C.txt, { align: "center" })],
      [1, box("GROSS WT", C.txt, { align: "center" })],
      [4, { f: `Page1!F${forRow}`, s: { ...C.txt, border: "lrt", align: "right" } }]], 12.75);

    const first = g2.at() + 1;
    PL_WEIGHTS.forEach(([label, keys], i) => {
      const has = (l) => keys.includes(l.band.key);
      const agg = (col) => {
        const refs = [rangeRefs(lineRuns(p1, PL_TOP, has), col, "Page1"),
          rangeRefs(lineRuns(p2, PL_P2_TOP, has), col, "")].filter(Boolean).join(",");
        return refs ? `SUM(${refs})` : "0";
      };
      const edge = { l: "thin", r: "thin", t: i ? "hair" : "thin", b: "hair" };
      const wt = (col) => ({ f: agg(col), s: { ...F, border: edge, align: "center", fmt: PL_WT } });
      /* The space the list is signed in stands beside the break-up, as one box
         down the four lines of it. */
      const right = i === 0
        ? [[4, { v: "", s: { ...C.txt, border: "lr" } }, PL_WEIGHTS.length - 1]]
        : [[1, { v: "", s: { ...C.txt, border: "l" } }], ...blank(2),
          [1, { v: "", s: { ...C.txt, border: "r" } }]];
      g2.row([[3, { v: label, s: { ...F, border: edge } }], [1, wt("H")], [1, wt("I")], ...right], 12.75);
    });
    const last = g2.at();
    const dbl = { ...F, border: { l: "thin", r: "thin", t: "thin", b: "double" }, align: "center", fmt: PL_WT };
    g2.row([[3, box("TOTAL WEIGHTS")],
      [1, { f: `SUM(D${first}:D${last})`, s: dbl }], [1, { f: `SUM(E${first}:E${last})`, s: dbl }],
      [2, { v: "", s: { ...C.txt, border: "lb" } }],
      [2, { f: `Page1!H${propRow}`, s: { ...C.txt, border: "rb", align: "right" } }]], 12.75);
  } else {
    // The make-up of the consignment is on the four tabs behind this page, so
    // its foot carries the signature alone.
    signBlock2(g2, `Page1!F${forRow}`, `Page1!H${propRow}`);
  }

  // The letterhead mark, on both sheets as their file has it.
  const page2 = { ...SHEET, page: { ...SHEET.page, scale: form.scale[1] } };
  page2.widths = [...SHEET.widths];
  page2.widths[5] = form.colF[1];
  return [
    fitSheet({ name: "Page1", rows: g1.rows, merges: g1.merges, heights: g1.heights, images: [formLogo({ colOff: 57150, rowOff: 85726, cy: 704850 }), ...scans(signRows[0])].filter(Boolean), ...SHEET }, { widen: false }),
    fitSheet({ name: "Page2", rows: g2.rows, merges: g2.merges, heights: g2.heights, images: [formLogo({ colOff: 57150, rowOff: 85726 }), ...scans(signRows[1])].filter(Boolean), ...page2 }, { widen: false }),
  ];
}

/* The same form on screen and on paper. The worksheet above rules the frame
   with cell borders; here the nine columns are one table per page, ruled by
   the same rules, so the preview, the PDF and the .xlsx are the one document. */
export function packingListHtml(ctx, form) {
  /* The customs copy types the name it is signed for and leaves the space under
     it; the buyer's copy (32) carries the client's own signature and stamp. */
  const signed = !!form.signed;
  const E = ctx.EXPORTER, b = ctx.buyer, s = ctx.inv.ship || {};
  const rows = L(ctx);
  const bands = packingBands(ctx, form.buyer);
  const { p1, carry, p2 } = packingLayout(bands, form);
  const marks = ciMarks(ctx, rows);
  const desc = packingDescribe(ctx, bands, rows, form.buyer);
  const addr = addrLines(E), bAddr = addrLines({ addr: b.addr });
  const invRef = `${ctx.inv.invoiceNo || ""}${ctx.inv.date ? ` DT ${ddmm(ctx.inv.date)}` : ""}`;
  const orderRef = b.orderNo
    ? `${b.orderNo}${ctx.inv.date ? ` DT ${ddmm(ctx.inv.date)}` : ""}` : poHeaderList(ctx);
  const blLine = s.blNo ? `BL : ${s.blNo}${s.blDate ? `  DT. ${ddmm(s.blDate)}` : ""}` : "";

  const td = (v, cls = "", span = 1) =>
    `<td${span > 1 ? ` colspan="${span}"` : ""}${cls ? ` class="${cls}"` : ""}>${v == null || v === "" ? "&nbsp;" : v}</td>`;
  const vl = (v, cls = "", span = 1) => td(esc(v), cls, span);
  const nm = (v, d, cls = "") => `<td class="${cls}" data-t="num" data-v="${v}">${wbFixed(v, d)}</td>`;

  /* The letterhead: the mark alongside the name, the trading line under it and
     the address below that — one block down the left of the form, as the sheet
     anchors it across rows 2 to 7, with the boxes on the right keeping their
     own rows beside it. */
  const letterhead = `<td class="lhead lf rt0" rowspan="6" colspan="4">
    ${imgTag(LOGO_SRC, "pllogo")}
    <div class="brand">${esc(E.name)}</div>
    <div class="sub">${esc(E.sub || "")}</div>
    ${[addr[0], addr[1], [E.tel && `Tel: ${E.tel}`, E.email && `E-Mail: ${E.email}`].filter(Boolean).join(" ")]
    .map((l) => `<div class="addr">${esc(l || "")}</div>`).join("")}</td>`;

  /* The order box, as the worksheet writes it — one order and the reference
     under it, or the whole run of purchase orders across its four lines. The
     edges are the worksheet's own, read off through the classes that rule the
     same lines on paper, so the two can never disagree. */
  const EDGE = { lt: "lt", lrt: "lrt", lb: "lf bb", lrb: "lrb", l: "lf", lr: "lf rt0" };
  const orderBox = plOrderBox(ctx, form, orderRef, s)
    .map(([lbl, val, [lb, vb]]) => `<tr>${vl(lbl, `${lbl ? "k lb " : ""}${EDGE[lb]}`, 2)}${vl(val, EDGE[vb], 3)}</tr>`)
    .join("");

  const head = (page2) => `
    <tr>${page2 ? `${vl("PACKING LIST", "ttl lt bb", 7)}${vl("Page 2", "rd rt bb r", 2)}`
    : vl("PACKING LIST", "ttl lt rt0 bb", 9)}</tr>
    <tr>${letterhead}${vl("Invoice No. ", "k lb lt", 2)}${vl(invRef, "rt", 3)}</tr>
    <tr>${td("", "lf bb", 2)}${td("", "rt0 bb", 3)}</tr>
    ${orderBox}
    <tr>${vl("On Account & risks of", "k lb lt", 3)}${td("", "rt")}${vl(blLine, "k lb lrt", 5)}</tr>
    <tr>${vl(b.name ? `Messrs. ${b.name},` : "", "lf rt0", 4)}${td("", "lf rt0", 5)}</tr>
    <tr>${vl(b.brand ? `T/A ${b.brand},` : "", "lf rt0", 4)}${vl(s.vessel ? `Shipped per: ${s.vessel}` : "", "lf rt0", 5)}</tr>
    <tr>${vl(bAddr[0] || "", "lf rt0", 4)}${td("", "lf rt0", 5)}</tr>
    <tr>${vl([bAddr[1], b.country && `(${b.country})`].filter(Boolean).join(" "), "lf rt0", 4)}${td("", "lrb", 5)}</tr>
    <tr>${td("", "lf rt0", 4)}${vl("Country of Origin", "k lb lrt c", 3)}${vl("Country of Final Destination", "k lb lrt c", 2)}</tr>
    <tr>${td("", "lf rt0", 4)}${vl(E.origin || "INDIA", "k rd lrb c", 3)}
      ${vl((s.finalDest || b.country || "").toUpperCase(), "k rd lrb c", 2)}</tr>
    <tr>${td("", "lf rt0", 4)}${vl("Shipping Marks ", "k lb lf", 2)}${vl("CONTAINER NO : ", "k lrt", 3)}</tr>
    <tr>${vl("Pre-Carraige by:", "k lb lt", 3)}${vl("Place of Receipt by Pre-Carraige", "k lb lrt")}
      ${vl(marks.prefix, "k lf", 2)}${vl(s.container || "", "k lf rt0", 3)}</tr>
    <tr>${vl(s.preCarriage || "", "lf bb", 3)}${vl(s.receiptPlace || "", "lrb")}
      ${vl(`${marks.start} - ${marks.end} / ${marks.end}`, "lf", 2)}${td("", "k lrb", 3)}</tr>
    <tr>${vl("Shipped per:", "k lb lrt", 3)}${vl("Port of Loading:", "k lb lrt")}${td("", "lf rt0", 2)}
      ${vl("SEAL NO : ", "k lf rt0", 3)}</tr>
    <tr>${vl(s.vessel || "", "lrb", 3)}${vl(s.pol || "", "k rd lrb c")}${td("", "lf rt0", 2)}
      ${vl(s.seal || "", "k lf rt0", 3)}</tr>
    <tr>${vl("Port of Discharge:", "k lb lrt", 3)}${vl("Final Destination:", "k lb lrt")}${td("", "lf rt0", 2)}
      ${td("", "lf rt0", 3)}</tr>
    <tr>${vl((s.pod || b.shipTo || "").toUpperCase(), "lrb c", 3)}
      ${vl((s.finalDest || s.pod || b.shipTo || "").toUpperCase(), "lrb c")}${td("", "lrb", 2)}${td("", "lrb", 3)}</tr>
    <tr>${vl("Sr.Nos.", "k lf colh")}${vl("No. & Kind of Pkgs   Description of Goods", "k lrt l colh", 5)}
      ${vl("Quantity", "k lrt c colh")}${vl("WEIGHT", "k rt c colh", 2)}</tr>
    <tr>${td("", "lf")}${vl(desc[0], "lf rt0 l", 5)}${td("", "lf rt0")}
      ${vl("NETT", "k bx c colh")}${vl("GROSS", "k bx c colh")}</tr>
    <tr>${td("", "lf")}${vl(desc[1], "lf rt0 l", 5)}${td("", "lf")}
      ${vl("KGS", "k lrb c colh")}${vl("KGS", "k lrb c colh")}</tr>`;

  const line = (l) => {
    if (!l) return `<tr class="fl">${Array(9).fill(td("")).join("")}</tr>`;
    if (l.kind === "head") return `<tr class="gd">${td("")}${vl(l.band.head, "l", 5)}${Array(3).fill(td("")).join("")}</tr>`;
    if (l.kind === "cols") {
      const B2 = l.band;
      const cells = [vl("SR NOS"), vl("CODE", "c"), vl(B2.size, "c", B2.len ? 1 : 2)];
      if (B2.len) cells.push(vl("LEN (MM)", "c"));
      cells.push(vl(B2.per), vl(B2.pkg, "c"), vl("PIECES", "c"), td(""), td(""));
      // Their column header is wider than the column it sits in and the sheet
      // shrinks it to fit; `hc` is that same squeeze on paper.
      return `<tr class="gd hc">${cells.join("")}</tr>`;
    }
    const { band, r } = l;
    const cells = [vl(r.range), vl(r.it.code, "c"), vl(band.len ? r.it.size : bundled(r.it.size, r.it), "c", band.len ? 1 : 2)];
    if (band.len) cells.push(vl(bundled(r.it.length, r.it), "c"));
    cells.push(
      `<td class="c" data-t="int" data-v="${r.packing}">${r.packing}</td>`,
      `<td class="c" data-t="int" data-v="${r.boxes}">${r.boxes}</td>`,
      `<td class="c" data-t="int" data-v="${r.pieces}">${r.pieces}</td>`,
      nm(r.netTotal, 3, "c"), nm(r.grossTotal, 3, "c"),
    );
    return `<tr class="ln">${cells.join("")}</tr>`;
  };

  const totalRow = (label, list) => `<tr class="tt">${td("", "lf bb", 3)}${vl(label, "k rt0 bb r")}
    ${td("", "lrb", 3)}${nm(sum(list, "netTotal"), 3, "bx c")}${nm(sum(list, "grossTotal"), 3, "bx c")}</tr>`;

  const p1Rows = p1.filter((l) => l.kind === "item").map((l) => l.r);
  // The sheet's own column widths, to the two places the page is ruled in.
  const colg = `<colgroup>${[11.83, 9.33, 9.33, 36.5, 12.66, Math.round(form.colF[0] * 100) / 100, 9.16, 12.33, 12.33]
    .map((w) => `<col style="width:${(w / 112.6) * 100}%">`).join("")}</colgroup>`;

  /* The scans stand the whole depth of the block, as they do on the sheet — the
     stamp in the column before it and the signature across the block itself. */
  const scanCells = (edge) => `<td class="sgstamp ${edge}" rowspan="5">${imgTag(STAMP_SRC, "plstamp")}</td>`
    + `<td class="sgbox lf rt0 bb" rowspan="5" colspan="4">${imgTag(SIGN_SRC, "plsign")}</td>`;

  const sign = (forText) => (signed
    ? `<tr>${td("", "lf")}${td("", "", 3)}${scanCells("rt0 bb")}</tr>
      ${Array.from({ length: 3 }, () => `<tr>${td("", "lf")}${td("", "", 3)}</tr>`).join("")}
      <tr>${td("", "lf bb")}${td("", "bb", 3)}</tr>`
    : `
    <tr>${td("", "lf")}${td("", "", 3)}${td("", "rt0")}${vl(forText, "sg lrt r", 4)}</tr>
    ${Array.from({ length: 3 }, () => `<tr>${td("", "lf")}${td("", "", 3)}${td("", "rt0")}${td("", "lf rt0", 4)}</tr>`).join("")}
    <tr>${td("", "lf bb")}${td("", "bb", 3)}${td("", "rt0 bb")}${td("", "lf bb", 2)}
      ${vl("PROPRIETOR", "rt0 bb r", 2)}</tr>`);

  const page1 = `<table class="wb ci pl">${colg}<tbody>${head(false)}
    ${Array.from({ length: form.p1Body }, (_, i) => line(p1[i])).join("")}
    ${totalRow("BALANCE C/F….", p1Rows)}
    ${sign(`FOR ${E.name}`.toUpperCase())}</tbody></table>`;

  const bf = `<tr class="gd">${td("")}${vl(carry ? carry.head : "", "l", 4)}
    ${vl("BAL B/F…", "k r", 2)}${nm(sum(p1Rows, "netTotal"), 3, "c")}${nm(sum(p1Rows, "grossTotal"), 3, "c")}</tr>`;

  const breakup = PL_WEIGHTS.map(([label, keys]) => {
    const mine = rows.filter((r) => keys.includes(familyOf(r.it)));
    return `<tr>${vl(label, "lf rt0", 3)}${nm(sum(mine, "netTotal"), 3, "lf rt0 c")}
      ${nm(sum(mine, "grossTotal"), 3, "lf rt0 c")}${td("", "lf rt0", 4)}</tr>`;
  }).join("");

  const forLine = signed ? "" : `FOR ${E.name}`.toUpperCase();
  const propLine = signed ? "" : "PROPRIETOR";
  /* The foot of page 2: the break-up of weights beside the signature, or — in
     the item-wise book, whose make-up is on the tabs behind it — the empty box
     its file rules there instead. */
  const foot = withBreakup(form, bands)
    ? `<tr>${vl("BREAK-UP OF WEIGHTS", "bx", 3)}${vl("NET WT", "bx c")}${vl("GROSS WT", "bx c")}
        ${vl(forLine, "sg lrt r", 4)}</tr>
      ${breakup}
      <tr>${vl("TOTAL WEIGHTS", "bx", 3)}${nm(sum(rows, "netTotal"), 3, "bx dbl c")}
        ${nm(sum(rows, "grossTotal"), 3, "bx dbl c")}${td("", "lf bb", 2)}${vl(propLine, "rt0 bb r", 2)}</tr>`
    : signed
      ? `<tr>${td("", "bx", 4)}${scanCells("bx")}</tr>
        ${Array.from({ length: 4 }, () => `<tr>${td("", "bx", 4)}</tr>`).join("")}`
      : `<tr>${td("", "bx", 5)}${vl(forLine, "sg lrt r", 4)}</tr>
        ${Array.from({ length: 4 }, () => `<tr>${td("", "bx", 5)}${td("", "lf rt0", 4)}</tr>`).join("")}
        <tr>${td("", "bx", 5)}${td("", "lf bb", 2)}${vl(propLine, "rt0 bb r", 2)}</tr>`;

  const page2 = `<table class="wb ci pl">${colg}<tbody>${head(true)}
    ${bf}
    ${Array.from({ length: plP2Body(p2, form) }, (_, i) => line(p2[i])).join("")}
    ${totalRow("TOTAL WEIGHTS……….", rows)}
    ${foot}</tbody></table>`;

  return `${page1}<div class="pgbrk"></div>${page2}`;
}

export const B_19 = (ctx) => ({
  name: "Packing_List_19",
  html: packingListHtml(ctx, PL_FORMS[19]),
  sheets: packingListSheets(ctx, PL_FORMS[19]),
  page: "portrait",
});
