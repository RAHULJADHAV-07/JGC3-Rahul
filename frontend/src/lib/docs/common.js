/* The export document engine — everything the forty documents are built out
   of, and nothing that belongs to any one of them.

   Every builder pulls live data from ONE selected invoice + the order masters,
   so each document cross-references the same PO / invoice / shipment figures
   (the "enter once, generate everything" story).

   ctx = { inv, buyer, items, buyerMaster, invoices, SUPPLIERS, BUYERS, EXPORTER, supCode }

   `docCtx()` in lib/docCtx.js adapts the API's records into this shape. The
   documents themselves live one to a file beside this one; lib/docs/index.js
   gathers them into the registry the app asks by number. */

import { ADDR_ASPECT, LOGO_SRC, imgTag, logoImage, primeLogo } from "../logo.js";
import { colLetter } from "../xlsx.js";

// The supplier order prints on the letterhead, so the mark is fetched up front.
primeLogo();

/* ---- formatting (self-contained, matches App.jsx conventions) ---- */
export const inr = (n) => "₹" + Math.round(Number(n || 0)).toLocaleString("en-IN");

export const inr2 = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const usd = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const usdp = (n) => "$" + Number(n || 0).toFixed(4);

export const num = (n, d = 2) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });

export const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const ddmm = (s) => { if (!s) return ""; const d = new Date(s); return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`; };

export const dmy = (s) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");

export const gstRate = (hsn) => (String(hsn).startsWith("4819") ? 0.05 : 0.18);

/* Barcode stickers per box — the item's own rule, mirroring calc.stickers_per_box:
   a typed-in total wins, otherwise (bag + piece) x multiplier, rounded on the
   GRN range. Labels then carry the item's allowance (1.05 on Oswin). */
export function stickersPerBox(it) {
  const fixed = Number(it.stickersFixed) || 0;
  if (fixed) return fixed;
  const base = (Number(it.bgPerBox) || 0) + (Number(it.pPerBox) || 0);
  const total = base * (it.stickerMult == null ? 1.1 : Number(it.stickerMult));
  return it.stickerRound ? Math.floor(total + 0.5) : total;
}

export function labelsFor(it, boxes) {
  return boxes * stickersPerBox(it) * (Number(it.labelSpoilage) || 1);
}

export function sheetsFor(it, boxes) {
  const up = Number(it.typeUp) || 0;
  const labels = labelsFor(it, boxes);
  return up && labels ? Math.ceil(labels / up) : 0;
}

/* FOB per piece — Oswin quotes per piece, the PP/GRN ranges per 100. */
export function fobPerPiece(it) {
  const unit = Number(it.unitFob100) || 0;
  return (it.fobMode || "100") === "100" ? unit / 100 : unit;
}

/* ---- output ----------------------------------------------------------------
   Downloads go through lib/download.js: Excel is a real .xlsx with the
   arithmetic still live (lib/xlsx.js), PDF is the same HTML through the
   browser's print engine. The builders below annotate the cells that carry a
   calculation — see `tableOf` — and lib/sheet.js reads those annotations back
   out when it converts a document into a worksheet.                        */

/* ---- shared derived data ---- */
export function exRate(ctx) { return Number(ctx.inv.ship?.exRate) || 92.5; }

export function marksStart(ctx) { const m = (ctx.inv.ship?.marks || "").match(/(\d{3,})/); return m ? Number(m[1]) : 2001; }

export function supFor(ctx, id) { return ctx.SUPPLIERS.find((s) => s.id === id) || {}; }

/* The order reference a buyer-stage document prints. A PO-stage context
   (Documents → PO Reports) is built around one purchase order, so that number
   is the reference; the invoice-stage contexts fall back to the buyer's own
   standing order number, as before. */
export function orderRefOf(ctx) { return ctx.po || ctx.buyer.orderNo || "—"; }

// Shipment lines (from the selected invoice) with every derived figure a document may need
export function L(ctx) {
  const ex = exRate(ctx);
  let sr = Number(ctx.inv.serialStart) || marksStart(ctx);
  return ctx.inv.lines.map((l) => {
    const master = ctx.items.find((x) => x.id === l.itemId) || l.item || {};
    /* Priced as invoiced, not as the master reads today. Everything else —
       packing, volume, weights, stickers — is a physical fact of the item and
       still comes from the master. */
    const it = l.unitValue == null && l.unitFob100 == null ? master : {
      ...master,
      unitValue: l.unitValue == null ? master.unitValue : Number(l.unitValue),
      valueMode: l.valueMode || master.valueMode,
      unitFob100: l.unitFob100 == null ? master.unitFob100 : Number(l.unitFob100),
      fobMode: l.fobMode || master.fobMode,
    };
    const boxes = Number(l.boxes) || 0, packing = Number(it.packing) || 0;
    const pieces = boxes * packing;
    const volTotal = boxes * (Number(it.volume) || 0);
    const netTotal = boxes * (Number(it.netPerBox) || 0);
    const grossTotal = boxes * (Number(it.grossPerBox) || 0);
    const fobPc = fobPerPiece(it), fobTotal = pieces * fobPc;
    const valUnit = Number(it.unitValue) || 0, valTotal = pieces * valUnit;
    const rbiTotal = fobTotal * ex, rateKg = netTotal ? fobTotal / netTotal : 0;
    const bg = Number(it.bgPerBox) || 0, pc = Number(it.pPerBox) || 0, ttl = stickersPerBox(it);
    const stickers = Math.ceil(labelsFor(it, boxes)), sheets = sheetsFor(it, boxes);
    const from = sr, to = sr + boxes - 1; sr += boxes;
    const range = boxes ? `${from}-${to}` : "—";
    const pos = [...new Set(ctx.buyerMaster.filter((r) => r.itemId === it.id).map((r) => r.po))].sort();
    // Stickers a single box consumes, allowance included — inlined into the
    // Excel formulas so the sticker and sheet counts follow the box count.
    const stkPerBox = ttl * (Number(it.labelSpoilage) || 1);
    const typeUp = Number(it.typeUp) || 0;
    return { it, sup: supFor(ctx, l.supplierId), supId: l.supplierId, boxes, packing, pieces, volTotal, netTotal, grossTotal, fobPc, fobTotal, valUnit, valTotal, rbiTotal, rateKg, bg, pc, ttl, stkPerBox, typeUp, stickers, sheets, range, pos };
  });
}

// Buyer-order-stage rows — aggregate the whole order book by item (docs 2A–6)
export function orderAgg(ctx) {
  const ex = exRate(ctx), g = {};
  ctx.buyerMaster.forEach((r) => {
    const it = ctx.items.find((x) => x.id === r.itemId) || r.item;
    if (!it) return;
    if (!g[it.id]) g[it.id] = { it, qty: 0, pos: new Set(), rbi: r.rbi };
    g[it.id].qty += Number(r.qty) || 0; g[it.id].pos.add(r.po); g[it.id].rbi = r.rbi;
  });
  return Object.values(g).map((x) => {
    const it = x.it, qty = x.qty, packing = Number(it.packing) || 0;
    const boxes = Math.ceil(qty / packing) || 0;
    const volTotal = boxes * (Number(it.volume) || 0);
    const netTotal = boxes * (Number(it.netPerBox) || 0), grossTotal = boxes * (Number(it.grossPerBox) || 0);
    const fobPc = fobPerPiece(it), fobTotal = qty * fobPc;
    const valUnit = Number(it.unitValue) || 0, valTotal = qty * valUnit;
    const rbiTotal = fobTotal * ex;
    const bg = Number(it.bgPerBox) || 0, pc = Number(it.pPerBox) || 0, ttl = stickersPerBox(it);
    const stickers = Math.ceil(labelsFor(it, boxes)), sheets = sheetsFor(it, boxes);
    const typeUp = Number(it.typeUp) || 0;
    const stkPerBox = ttl * (Number(it.labelSpoilage) || 1);
    return { it, pos: [...x.pos].sort(), qty, packing, boxes, volTotal, netTotal, grossTotal, fobPc, fobTotal, valUnit, valTotal, rbiTotal, bg, pc, ttl, stkPerBox, stickers, sheets, typeUp };
  }).sort((a, b) => String(a.it.gd || "").localeCompare(String(b.it.gd || "")));
}

/* The order book seen the way the supplier PO needs it — one row per item,
   tagged with the factory that makes it. Ordered pieces, not packed boxes:
   the supplier's order exists the moment the buyer's does, long before
   anything has been invoiced. */
export function orderRows(ctx) {
  return orderAgg(ctx).map((r) => ({
    ...r, pieces: r.qty, supId: r.it.supplierId, sup: supFor(ctx, r.it.supplierId),
  }));
}

export function poHeaderList(ctx) {
  const seen = {};
  ctx.buyerMaster.forEach((r) => { if (!seen[r.po]) seen[r.po] = r.date; });
  return Object.entries(seen).sort((a, b) => a[1].localeCompare(b[1])).map(([po, d]) => `${po} DT ${ddmm(d)}`).join(", ");
}

/* ---- reusable HTML fragments ---- */
export function exporterBlock(ctx) {
  const E = ctx.EXPORTER;
  return `<div class="lg">${esc(E.name)}</div><div class="sub">${esc(E.sub)}</div>
    <div class="sub">${esc(E.addr)}</div>
    <div class="sub">Tel: ${esc(E.tel)} &nbsp;E-Mail: ${esc(E.email)}</div>
    <div class="sub">IEC ${esc(E.iec)} &nbsp;GSTIN ${esc(E.gstin)} &nbsp;PAN ${esc(E.pan)}</div>`;
}

// Two-column masthead: exporter identity (left) + invoice / shipment meta (right)
export function masthead(ctx, docTitle, opts = {}) {
  const inv = ctx.inv, s = inv.ship || {}, b = ctx.buyer;
  const meta = [
    ["Invoice No.", `${inv.invoiceNo} DT ${ddmm(inv.date)}`],
    ["Buyer's Order No.", `${b.orderNo || "—"}`],
    opts.po ? ["PO No(s).", poHeaderList(ctx)] : null,
    ["IEC", ctx.EXPORTER.iec],
    s.blNo ? ["BL No.", `${s.blNo} DT ${ddmm(s.blDate)}`] : null,
    s.sbNo ? ["S/B No.", `${s.sbNo} DT ${ddmm(s.sbDate)}`] : null,
    s.vessel ? ["Shipped per", s.vessel] : null,
    ["Country of Origin", ctx.EXPORTER.origin],
    ["Final Destination", s.finalDest || b.country],
  ].filter(Boolean);
  const metaRows = meta.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="b">${esc(v)}</td></tr>`).join("");
  const consignee = `<tr><td class="k">On Account &amp; Risk of</td><td class="b">Messrs ${esc(b.name)} &nbsp;T/A ${esc(b.brand)}<br>${esc(b.addr || "")}</td></tr>`;
  return `<div class="title">${esc(docTitle)}</div>
    <table style="width:100%"><tr>
      <td style="width:52%">${exporterBlock(ctx)}</td>
      <td><table style="width:100%">${metaRows}</table></td>
    </tr>
    <tr><td colspan="2"><table style="width:100%">${consignee}</table></td></tr></table>`;
}

/* Generic data table.

   cols = [{ h, r?, c?, f(row) -> cell html,
             key?, t?, v?(row) -> number, fml? }]

   The last four are what make the Excel download live rather than a picture
   of one. `key` names the column; `t` is the number format; `v` gives the
   exact value (no ₹, no thousands separator, no rounding); `fml` is a formula
   written in terms of other columns' names — "{qty}*{rate}" — which
   lib/sheet.js resolves to real cell references at conversion time. Anything
   a row genuinely holds as a constant is inlined into the formula, so the
   figures that depend on it still move when a quantity is edited.

   foot = [{ v, r?, span?, sum?, t? }] — `sum` names the column to total.  */
export const attr = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function cellData(c, row) {
  const bits = [];
  if (c.t) bits.push(`data-t="${attr(c.t)}"`);
  if (c.fml) {
    const f = typeof c.fml === "function" ? c.fml(row) : c.fml;
    if (f) bits.push(`data-f="${attr(f)}"`);
  } else if (c.v) {
    const n = Number(c.v(row));
    if (Number.isFinite(n)) bits.push(`data-v="${n}"`);
  }
  return bits.length ? " " + bits.join(" ") : "";
}

export function tableOf(cols, rows, foot, sectionRows) {
  const head = `<tr>${cols.map((c) => `<th${c.key ? ` data-k="${attr(c.key)}"` : ""}>${c.h}</th>`).join("")}</tr>`;
  const dataRow = (row) => `<tr>${cols.map((c) => `<td class="${c.r ? "r" : c.c ? "c" : ""}"${cellData(c, row)}>${c.f(row)}</td>`).join("")}</tr>`;
  const body = rows.map((row, i) => (sectionRows && sectionRows[i]
    ? `<tr><td class="sec" colspan="${cols.length}">${esc(sectionRows[i])}</td></tr>${dataRow(row)}`
    : dataRow(row))).join("");
  const f = foot
    ? `<tr class="tot">${foot.map((cell) => {
      const bits = [];
      if (cell.t) bits.push(`data-t="${attr(cell.t)}"`);
      if (cell.sum) bits.push(`data-sum="${attr(cell.sum)}"`);
      return `<td class="${cell.r ? "r" : ""}"${cell.span ? ` colspan="${cell.span}"` : ""}${bits.length ? " " + bits.join(" ") : ""}>${cell.v}</td>`;
    }).join("")}</tr>`
    : "";
  return `<table>${head}${body}${f}</table>`;
}

/* RoundUp that survives a zero divisor — Excel would show #DIV/0! and the
   client's sheets never do. */
export const upDiv = (a, b) => `IF(${b}=0,0,ROUNDUP(${a}/${b},0))`;

export const sum = (a, k) => a.reduce((s, x) => s + (Number(x[k]) || 0), 0);

/* Who signs the export papers, and where they are signed. */
export const SIGNATORY = "Mr Aalok M Shah";

export const declBlock = (ctx) => { const E = ctx.EXPORTER; return `<table style="width:100%"><tr><td class="k" style="width:20%">Place</td><td>Mumbai</td><td class="k" style="width:20%">Date</td><td>${ddmm(ctx.inv.date)}</td></tr>
  <tr><td class="k">Signature</td><td colspan="3">For ${esc(E.name)} &nbsp;— &nbsp;${SIGNATORY}, Proprietor</td></tr></table>`; };

/* ---------- The client's own workbooks, rebuilt cell for cell ---------------
   Docs 2 and 3 are the sheets the client reads as files rather than as
   reports — 2 goes to the label printer, 3 to the packer — so both are
   reproduced against the workbooks in Docs/Jaikvin Process/Numbering:
   2-Barcode.xlsx and 3-Packing.xlsx. Same columns, same two-line header, the
   PO banner merged across the top, Arial 10 on a black hairline grid, codes in
   their green, and the derived columns still worked out by formula. They write
   the worksheet directly instead of going through htmlToSheet — the layout is
   theirs, not the app's — and the preview and PDF use the same grid.

   The description prints as they print it, with the size dropped to a second
   line where the master already ends on it.                                */
export function bcDescription(it) {
  const d = String(it.description || "").trim();
  const size = String(it.size || "").trim();
  const length = String(it.length || "").trim();
  if (!size) return d;
  /* Their second line is the size as the master spells it — "15MM" on a plain
     item, "80 x 15MM" where there is a length — so the longest of those the
     description actually ends on is where it breaks. */
  const endings = [size, `${size}MM`, `${size} MM`];
  if (length) endings.push(`${length} x ${size}MM`, `${length} x ${size} MM`);
  const low = d.toLowerCase();
  const at = endings
    .map((e) => (low.endsWith(e.toLowerCase()) ? d.length - e.length : -1))
    .reduce((best, i) => (i > 0 && (best < 0 || i < best) ? i : best), -1);
  return at > 0 ? `${d.slice(0, at).trim()}\n${d.slice(at)}` : d;
}

/* Their packing sheet writes the HSN the customs way — 39174000 as 3917.4000
   — so an 8-digit code is printed on that scale. Anything else stays as typed. */
export function hsnValue(it) {
  const raw = String(it.hsn || "").trim();
  return /^\d{8}$/.test(raw) ? Number(raw) / 10000 : null;
}

export const hsnText = (it) => { const n = hsnValue(it); return n == null ? String(it.hsn || "") : n.toFixed(4); };

/* Their purchase sheet writes money as "₹ 1,234.00" — the rupee sign, a space,
   then the figure — and heads the price columns with the date the price list
   was agreed on, in red. */
export const RUPEE = '"₹"\\ #,##0.00';

export const RS = '"Rs."\\ #,##0.00';

export const USD = '"$"#,##0.00';

export const ddmmyy = (s) => { if (!s) return ""; const d = new Date(s); return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getFullYear()).slice(2)}`; };

/* On screen a figure has to read exactly as the cell it copies: "0.000" carries
   no separators at all, and their rupee format groups in thousands, not lakhs. */
export const wbFixed = (n, d) => Number(n || 0).toFixed(d);

export const wbRupee = (n) => `₹ ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* Their column widths and row heights are the design, and they fit their own
   data — a five-digit order number, a two-line description. Ours is not always
   that short: a line can carry half a dozen purchase orders, and a description
   can run past the column. So the sheet is measured after it is built. A column
   may widen to what is actually in it (never past a point where the layout
   stops looking like theirs), and a row grows to as many lines as its wrapped
   cells need. Nothing is ever cut off, and a sheet whose data is as short as
   theirs comes out at exactly their sizes. */
export const LINE_PT = 12.75;

export function fitSheet(sheet, opts = {}) {
  const { widen = true, maxGrow = 2, maxWidth = 46 } = opts;
  const widths = (sheet.widths || []).slice();
  const heights = (sheet.heights || []).slice();
  const rows = sheet.rows || [];

  /* A run of merged cells is one cell on the page: its text says nothing about
     how wide any single column should be, and it has all of their widths to
     wrap into. */
  const covered = new Set();
  const spanOf = new Map();
  (sheet.merges || []).forEach((ref) => {
    const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(String(ref));
    if (!m) return;
    const col = (s) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    const [c1, r1, c2, r2] = [col(m[1]), +m[2], col(m[3]), +m[4]];
    spanOf.set(`${r1}:${c1}`, [c1, c2]);
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) covered.add(`${r}:${c}`);
  });
  const roomAt = (r, i) => {
    const span = spanOf.get(`${r}:${i + 1}`);
    if (!span) return widths[i] ?? 9.14;
    let w = 0;
    for (let c = span[0]; c <= span[1]; c++) w += widths[c - 1] ?? 9.14;
    return w;
  };

  if (widen) {
    rows.forEach((row, ri) => (row || []).forEach((cell, i) => {
      if (!cell || cell.f || widths[i] == null || covered.has(`${ri + 1}:${i + 1}`)) return;
      const text = String(cell.v ?? "");
      if (!text) return;
      /* Text left in a cell whose neighbour is empty simply runs on across it —
         that is how a section label sits over the columns beside it, and it
         needs no more room. A figure has nowhere to run to, so it always does. */
      const s = cell.s || {};
      const flows = !s.align || s.align === "left";
      const next = (row || [])[i + 1];
      const nextHasText = next && String(next.v ?? "") !== "";
      if (cell.t !== "n" && !s.fmt && flows && !nextHasText) return;
      const wrap = !!s.wrap;
      const longest = text.split("\n").reduce((m, s2) => Math.max(m, s2.length), 0);
      // A column's width is in characters, plus what Excel keeps for padding.
      const want = longest + 0.7;
      // A wrapped column grows only so far; past that the row takes the lines.
      const grown = Math.min(want, wrap ? 24 : maxWidth, widths[i] * maxGrow);
      if (grown > widths[i] + 0.1) widths[i] = grown;
    }));
  }

  rows.forEach((row, ri) => {
    let lines = 1;
    (row || []).forEach((cell, i) => {
      if (!cell || !cell.s || !cell.s.wrap) return;
      const text = String(cell.v ?? "");
      if (!text || (covered.has(`${ri + 1}:${i + 1}`) && !spanOf.has(`${ri + 1}:${i + 1}`))) return;
      const per = Math.max(4, Math.floor(roomAt(ri + 1, i) - 1));
      lines = Math.max(lines, text.split("\n")
        .reduce((n, seg) => n + Math.max(1, Math.ceil(seg.length / per)), 0));
    });
    const need = lines * LINE_PT;
    if (lines > 1 && need > (heights[ri] || 0)) heights[ri] = need;
  });

  return { ...sheet, widths, heights };
}

/* ---- printed forms ---------------------------------------------------------
   The e-way bill and the despatch instruction are not tables. They are runs of
   merged cells laid across one fixed grid — a label two columns wide, the box
   beside it five — and that is what makes the boxes on the sheet line up the
   way they line up on the form.

   A row is written as [span, cell] pairs whose spans add up to the grid, and
   the builder does the two things that are easy to get wrong by hand: it
   merges the run, and it gives the cells the run covers only the edges the run
   itself owns. Leave them their own left and right and Excel rules a line down
   every column the run crosses — the box comes out striped.               */
export const trimEdges = (edges, first, last) =>
  [...edges].filter((c) => (c !== "l" || first) && (c !== "r" || last)).join("");

export function formGrid(width) {
  const rows = [];
  const merges = [];
  const heights = [];

  const edgesOf = (s, first, last) => {
    const b = s ? s.border : undefined;
    // A border ruling its edges in different weights trims the same way: the
    // run's left edge stays on the first cell, its right edge on the last.
    if (b && typeof b === "object") {
      return { ...s, border: { ...b, l: first ? b.l : "", r: last ? b.r : "" } };
    }
    if (typeof b !== "string") return s;                 // false / undefined pass through
    const [raw, rgb] = b.split("#");
    const kept = trimEdges(raw === "box" ? "lrtb" : raw, first, last);
    return { ...s, border: kept ? (rgb ? `${kept}#${rgb}` : kept) : false };
  };

  /* `cells` is [[span, cell], …]; a cell is the workbook writer's own
     { v | f, t?, s? }. A trailing gap in the grid is left blank. A third
     element carries the run down that many further rows, for the few boxes on
     a form that are taller than the line they start on — the exporter's name on
     the customs invoice, set at 18pt across two of them, or on the letter to
     the CHA the tick that answers for the two lines beside it.

     The rows under such a run still give a cell for every column it covers:
     they are inside the merge, so nothing of them is printed, but the grid is
     laid straight and every later run on those rows lands where it was meant
     to. Leave them out and the row shifts left by the width of the run. */
  const row = (cells = [], height) => {
    const out = [];
    (cells || []).forEach(([span, cell, down = 0]) => {
      const room = width - out.length;
      if (room < 1) return;                              // the grid is full
      const n = Math.max(1, Math.min(span, room));
      const at = out.length + 1;
      for (let k = 0; k < n; k++) {
        const s = edgesOf(cell.s, k === 0, k === n - 1);
        out.push(k === 0 ? { ...cell, s } : { v: "", s });
      }
      const r0 = rows.length + 1;
      if (n > 1 || down) merges.push(`${colLetter(at)}${r0}:${colLetter(at + n - 1)}${r0 + down}`);
    });
    rows.push(out);
    if (height) heights[rows.length - 1] = height;
    return rows.length;
  };
  /* A gap carries one blank styled cell: a row with nothing in it at all is
     left out of the file, and its height would go with it. */
  const gap = (height) => row([[1, { v: "", s: { border: false } }]], height);

  return { rows, merges, heights, row, gap, at: () => rows.length };
}

export const WB = {
  poL: { font: "refb", border: "ltb", valign: "center" },
  poM: { font: "refb", border: "tb", valign: "center" },
  poR: { font: "refb", border: "rtb", valign: "center" },
  poB: { font: "refb", border: "b", valign: "center" },
  poBox: { font: "refb", border: "box", valign: "center" },
  head: { font: "refb", border: "box", align: "center", valign: "center" },
  headRed: { font: "refr", border: "box", align: "center", valign: "center" },
  money: { font: "ref", border: "box", valign: "center", fmt: RUPEE },
  totMoney: { font: "refb", border: "box", valign: "center", fmt: RUPEE },
  usd: { font: "ref", border: "box", valign: "center", fmt: USD },
  totUsd: { font: "refb", border: "box", valign: "center", fmt: USD },
  rs: { font: "ref", border: "box", valign: "center", fmt: RS },
  totRs: { font: "refb", border: false, valign: "center", fmt: RS },
  rate: { font: "refb", border: "box", valign: "center", fmt: RUPEE },
  plain: { font: "ref", border: "box", valign: "center" },
  headW: { font: "refb", border: "box", align: "center", valign: "center", wrap: true },
  headL: { font: "refb", border: "ltb", align: "center", valign: "center" },
  headR: { font: "refb", border: "rtb", align: "center", valign: "center" },
  gd: { font: "refg", border: "box", align: "left", valign: "center" },
  gdC: { font: "refg", border: "box", align: "center", valign: "center" },
  desc: { font: "ref", border: "box", valign: "center", wrap: true },
  code: { font: "refb", border: "box", align: "center", valign: "center", quote: true },
  hsn: { font: "ref", border: "box", align: "center", valign: "center", fmt: "0.0000", quote: true },
  textL: { font: "ref", border: "box", align: "left", valign: "center" },
  barNum: { font: "ref", border: "box", align: "center", valign: "center", fmt: "0" },
  numC: { font: "ref", border: "box", align: "center", valign: "center" },
  num: { font: "ref", border: "box", valign: "center" },
  num2: { font: "ref", border: "box", valign: "center", fmt: "0.00" },
  num3: { font: "ref", border: "box", valign: "center", fmt: "0.000" },
  endGd: { font: "refg", border: "tb", align: "left", valign: "center" },
  endB: { font: "refb", border: "tb", align: "left", valign: "center" },
  end: { font: "ref", border: "tb", align: "left", valign: "center" },
  endDesc: { font: "ref", border: "tb", valign: "center", wrap: true },
  tot: { font: "refb", border: "box", valign: "center" },
  totC: { font: "refb", border: "box", align: "center", valign: "center" },
  tot2: { font: "refb", border: "box", valign: "center", fmt: "0.00" },
  tot3: { font: "refb", border: "box", valign: "center", fmt: "0.000" },
};

/* ---------- Doc 6 · Suppliers' PO ------------------------------------------
   Rebuilt against 6-Suppliers' PO.xlsx, which is not a report but a letter:
   a printed order form on the exporter's letterhead, then an annexure sheet of
   the items per range. Each factory still receives its own paper — that split
   is what the whole document is for — so a supplier's workbook is the letter
   followed by its annexures, and the downloads stay supplier by supplier.

   Their letter groups the goods the way their master does, PP mouldings first
   and nylon (GRN) after, each under its own sub-heading, with one annexure
   sheet per range. `stickerRule` on the item is what says which range it is.  */
export const RANGES = [
  { key: "pp", head: "PP MOULDED FITTINGS", tab: "PP", tabColor: "FFC00000", scale: 78, is: (r) => (r.it.stickerRule || "pp") !== "grn" },
  { key: "grn", head: "NYLON MOULDED FITTINGS", tab: "GRN", tabColor: "FFFFFF00", scale: 88, is: (r) => r.it.stickerRule === "grn" },
];

export const rangesOf = (arr) => RANGES.map((g) => ({ ...g, rows: arr.filter(g.is) })).filter((g) => g.rows.length);

export const perUnitOf = (it) => (it.uom === "MTR" ? "Per Metre" : "Per Piece");

export const poRefOf = (ctx, s) => `${orderRefOf(ctx)}-${s.code || ""} DT ${ddmm(ctx.inv.date)}`;

/* The exporter's own lines, as the letterhead prints them. */
export const addrLines = (E) => String(E.addr || "").split(",").reduce((out, part) => {
  const line = out[out.length - 1];
  if (line && (line + "," + part).length <= 52) out[out.length - 1] = `${line},${part}`;
  else out.push(part.trim());
  return out;
}, []);

/* --- the letter (their "Page1") --- */
export function supplierLetterSheet(ctx, s, arr) {
  const E = ctx.EXPORTER;
  const [addr1 = "", addr2 = ""] = addrLines(E);
  const groups = rangesOf(arr);
  const marks = ctx.inv.ship?.marks || "";

  const L = {                                            // the form's own styles
    title: { font: "refr", border: "ltb", align: "center" },
    brand: { font: "brand", border: "lt", align: "right" },
    sub: { font: "refmn", border: "l", align: "right" },
    addr: { font: "refbl", border: "l", align: "right" },
    addrEnd: { font: "refbl", border: "lb", align: "right" },
    label: { font: "refbb", border: "lt" },
    labelB: { font: "refbb", border: "lb" },
    value: { font: "ref", border: "t" },
    valueP: { font: "ref", border: false },
    to: { font: "refbb", border: "lt" },
    party: { font: "ref", border: "l", align: "left" },
    partyEnd: { font: "ref", border: "lb", align: "left" },
    gst: { font: "refbb", border: "lt", align: "center", valign: "center", wrap: true },
    marksHd: { font: "refbb", border: "lt", align: "center" },
    marks: { font: "refbb", border: "l", align: "center" },
    goods: { font: "refbb", border: "ltb" },
    colHd: { font: "refbb", border: "box", align: "center" },
    band: { font: "refb", border: "ltb", valign: "center" },
    bandC: { font: "refb", border: "lr", align: "center" },
    exw: { font: "refbu", border: "lrt", align: "center" },
    rs: { font: "refb", border: "lr", align: "center" },
    hCode: { font: "refb", border: "ltb" },
    hDesc: { font: "refb", border: "tb" },
    hHsn: { font: "refb", border: "box" },
    code: { font: "ref", border: "box", align: "left", valign: "center" },
    desc: { font: "ref", border: "box", valign: "center", wrap: true },
    hsn: { font: "ref", border: "box", align: "left", valign: "center", wrap: true, fmt: "0.0000" },
    qty: { font: "ref", border: "box", align: "center", valign: "center", fmt: "0" },
    price: { font: "ref", border: "box", align: "center", valign: "center", fmt: RUPEE },
    per: { font: "ref", border: "box", align: "center", valign: "center" },
    total: { font: "ref", border: "box", align: "right", valign: "center", fmt: RUPEE },
    totLabel: { font: "ref", border: "l", align: "right", valign: "center" },
    totLabelU: { font: "refun", border: "l", align: "left", valign: "center" },
    totVal: { font: "ref", border: "lr", align: "right", valign: "center", fmt: RUPEE },
    nettVal: { font: "ref", border: "box", align: "right", valign: "center", fmt: RUPEE },
    term: { font: "refbb", border: "l" },
    termT: { font: "refbb", border: "lt" },
    termB: { font: "refbb", border: "lb" },
    termVal: { font: "refbb", border: false },
    termValT: { font: "refbb", border: "t" },
    docLine: { font: "ref", border: false },
    conf: { font: "refbb", border: "lt" },
    confR: { font: "refbl", border: "lt", align: "right" },
    blankL: { font: "ref", border: "l" },
    blankR: { font: "ref", border: "r" },
    note: { font: "refb", border: "lb" },
    buyer: { font: "refur", border: "b", align: "right" },
    juris: { font: "refb", border: "t" },
  };
  const out = [];
  const merges = [];
  const heights = [];
  const CL = (n) => "ABCDEFG"[n - 1];
  const row = (cells) => { out.push(cells); return out.length; };
  /* A merged run is one cell on the page, so the cells it covers must not rule
     their own left and right edges — Excel and the PDF printers both draw them
     and the form ends up striped. Only the horizontal edges carry over. */
  const spans = [];
  const span = (from, to, r) => { merges.push(`${CL(from)}${r}:${CL(to)}${r}`); spans.push([r, from, to]); };
  const midStyle = (s) => {
    const b = s && s.border;
    if (b === false || b == null) return s;
    const kept = String(b === "box" ? "lrtb" : b).replace(/[lr]/g, "");
    return { ...s, border: kept || false };
  };
  const closeSpans = () => spans.forEach(([r, from, to]) => {
    for (let c = from + 1; c <= to; c++) {
      const cell = out[r - 1][c - 1];
      if (cell && cell.s) out[r - 1][c - 1] = { ...cell, s: midStyle(cell.s) };
    }
  });

  // 1 · title + letterhead
  let r = row([{ v: "EXPORT PURCHASE ORDER", s: L.title }, ...Array(6).fill({ v: "", s: L.title })]);
  span(1, 7, r);
  r = row([{ v: E.name, s: L.brand }, { v: "", s: L.brand }, { v: "", s: L.brand },
    { v: "Purchase Order", s: L.label }, { v: poRefOf(ctx, s), s: L.value }, { v: "", s: L.value }, { v: "", s: L.value }]);
  span(1, 3, r); span(5, 7, r);
  // The name runs across two rows in their sheet, so no rule under it here.
  r = row([{ v: "", s: L.party }, { v: "", s: L.party }, { v: "", s: L.party },
    { v: "No and Date :", s: L.labelB }, { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP }]);
  span(1, 3, r); span(5, 7, r);
  r = row([{ v: E.sub || "Merchant Exporters", s: L.sub }, { v: "", s: L.sub }, { v: "", s: L.sub },
    { v: "Your Ref:", s: L.label }, { v: s.yourReference || "", s: L.value }, { v: "", s: L.value }, { v: "", s: L.value }]);
  span(1, 3, r); span(5, 7, r);
  r = row([{ v: addr1, s: L.addr }, { v: "", s: L.addr }, { v: "", s: L.addr },
    { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP }]);
  span(1, 3, r); span(5, 7, r);
  r = row([{ v: addr2, s: L.addr }, { v: "", s: L.addr }, { v: "", s: L.addr },
    { v: "Order of:", s: L.label }, { v: "PP & NYLON MOULDED FITTINGS", s: L.value }, { v: "", s: L.value }, { v: "", s: L.value }]);
  span(1, 3, r); span(5, 7, r);
  r = row([{ v: `Tel: ${E.tel} E-Mail: ${E.email}`, s: L.addrEnd }, { v: "", s: L.addrEnd }, { v: "", s: L.addrEnd },
    { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP }]);
  span(1, 3, r); span(5, 7, r);

  /* 2 · addressee on the left, our own GSTIN and the buyer's marks on the
     right. At order stage there are no marks yet — the field prints empty,
     which is how the client's own copy leaves it until the buyer confirms. */
  const party = [`Messrs. ${s.name || ""}`, s.addr || "", s.place || "",
    s.gstin ? `GSTIN : ${s.gstin}` : ""].filter(Boolean);
  const rightOf = (i) => (i === 1 ? { v: "Shipping Marks", s: L.marksHd }
    : i === 2 ? { v: marks, s: L.marks } : { v: "", s: L.party });

  r = row([{ v: "To,", s: L.to }, { v: "", s: L.to }, { v: "", s: L.to },
    { v: `GSTIN : ${E.gstin}\nPAN No: ${E.pan}`, s: L.gst }, { v: "", s: L.gst }, { v: "", s: L.gst }, { v: "", s: L.gst }]);
  span(1, 3, r); span(4, 7, r);
  heights[r - 1] = 26;
  party.forEach((line, i) => {
    const last = i === party.length - 1;
    const right = rightOf(i);
    r = row([{ v: line, s: last ? L.partyEnd : L.party }, { v: "", s: last ? L.partyEnd : L.party },
      { v: "", s: last ? L.partyEnd : L.party },
      right, { v: "", s: right.s }, { v: "", s: right.s }, { v: "", s: right.s }]);
    span(1, 3, r); span(4, 7, r);
  });

  // 3 · the goods table
  r = row([{ v: "DESCRIPTION OF GOODS.", s: L.goods }, { v: "", s: L.goods }, { v: "", s: L.goods },
    { v: "QUANTITY", s: L.colHd }, { v: "Unit Price.", s: L.colHd }, { v: "Per Unit", s: L.colHd }, { v: "Total Value.", s: L.colHd }]);
  span(1, 3, r);
  r = row([{ v: "PP & NYLON MOULDED FITTINGS", s: L.band }, { v: "", s: L.band }, { v: "", s: L.band },
    { v: "PIECES", s: L.bandC }, { v: "Rs.", s: L.bandC }, { v: "", s: L.bandC }, { v: "Ex-Works.", s: L.exw }]);
  span(1, 3, r);

  let first = 0;
  let last = 0;
  groups.forEach((g, gi) => {
    r = row([{ v: g.head, s: L.band }, { v: "", s: L.band }, { v: "", s: L.band },
      { v: "", s: L.bandC }, { v: "", s: L.bandC }, { v: "", s: L.bandC },
      gi === 0 ? { v: "Rs.", s: L.rs } : { v: "", s: L.rs }]);
    span(1, 3, r);
    if (gi === 0) {
      row([{ v: "CODE ", s: L.hCode }, { v: "DESCRIPTION", s: L.hDesc }, { v: "HSN CODE", s: L.hHsn },
        { v: "", s: L.bandC }, { v: "", s: L.bandC }, { v: "", s: L.bandC }, { v: "", s: L.rs }]);
    }
    g.rows.forEach((x) => {
      const line = out.length + 1;
      const hsn = hsnValue(x.it);
      out.push([
        { v: x.it.code || "", s: L.code },
        { v: bcDescription(x.it), s: L.desc },
        hsn == null ? { v: String(x.it.hsn || ""), t: "s", s: L.hsn } : { v: hsn, t: "n", s: L.hsn },
        { v: x.pieces, t: "n", s: L.qty },
        { v: x.valUnit, t: "n", s: L.price },
        { v: perUnitOf(x.it), s: L.per },
        { f: `E${line}*D${line}`, s: L.total },
      ]);
      if (!first) first = line;
      last = line;
      heights[line - 1] = 25.5;
    });
  });

  // 4 · totals
  const sumRange = first ? `SUM(G${first}:G${last})` : "0";
  r = row(Array(7).fill(null).map((_, i) => ({ v: "", s: i === 0 ? L.totLabel : i === 6 ? L.totVal : L.valueP })));
  r = row([{ v: "TOTAL VALUE….", s: L.totLabel }, { v: "", s: L.totLabel }, { v: "", s: L.totLabel },
    { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP }, { f: sumRange, s: L.totVal }]);
  span(1, 3, r);
  const valueRow = r;
  r = row([{ v: "ADD : IGST @ 18%", s: L.totLabelU }, { v: "", s: L.totLabelU }, { v: "", s: L.totLabelU },
    { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP }, { f: `ROUND(G${valueRow}*18%,0)`, s: L.totVal }]);
  span(1, 3, r);
  const gstRowNo = r;
  r = row([{ v: "TOTAL  NETT VALUE…………………", s: L.totLabel }, { v: "", s: L.totLabel }, { v: "", s: L.totLabel },
    { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP },
    { f: `SUM(G${valueRow}:G${gstRowNo})`, s: L.nettVal }]);
  span(1, 3, r);

  // 5 · terms and signatures
  const term = (label, value, right, style, vstyle) => {
    const rr = row([{ v: label, s: style }, { v: value, s: vstyle }, { v: "", s: vstyle },
      { v: right ? right[0] : "", s: right ? L.termValT : L.valueP },
      { v: right ? right[1] : "", s: L.docLine }, { v: "", s: L.docLine }, { v: "", s: L.docLine }]);
    span(2, 3, rr);
    span(5, 7, rr);
    return rr;
  };
  term("Delivery", "", ["Documents:", "1. Invoice"], L.termT, L.termValT);
  term("Payment", "Against Delivery as usual", ["", "2. Packing cum weight List"], L.term, L.termVal);
  term("Packing", "As per attached Sheet", null, L.term, L.termVal);
  term("GST", "IGST @ 18% TO BE CHARGED", null, L.termB, L.termVal);
  r = row([{ v: "SELLER'S CONFIRMATION", s: L.conf }, { v: "", s: L.conf }, { v: "", s: L.conf },
    { v: `For ${E.name}`, s: L.confR }, { v: "", s: L.confR }, { v: "", s: L.confR }, { v: "", s: L.confR }]);
  span(1, 3, r); span(4, 7, r);
  const signFrom = out.length + 1;
  for (let i = 0; i < 3; i++) {
    r = row([{ v: "", s: L.blankL }, { v: "", s: L.valueP }, { v: "", s: L.valueP },
      { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.blankR }]);
    span(1, 3, r);
  }
  merges.push(`D${signFrom}:G${signFrom + 2}`);
  r = row([{ v: "(Please send us one copy duly signed & stamped as confirmation)", s: L.note },
    { v: "", s: L.note }, { v: "", s: L.note }, { v: "", s: L.note }, { v: "", s: L.note },
    { v: "BUYER.", s: L.buyer }, { v: "", s: L.buyer }]);
  span(1, 5, r); span(6, 7, r);
  r = row([{ v: "Subject to Mumbai Jurisdiction", s: L.juris }, { v: "", s: L.juris }, { v: "", s: L.juris },
    { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP }, { v: "", s: L.valueP }]);
  span(1, 3, r);
  closeSpans();

  return fitSheet({
    name: "Page1",
    rows: out,
    heights,
    merges,
    image: logoImage(),
    widths: [11.6640625, 32.5, 22.5, 16.6640625, 16.6640625, 16.6640625, 16.6640625],
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    page: {
      paper: 9, orientation: "portrait", scale: 76, fit: true,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0, footer: 0 },
    },
  }, { widen: false });
}

/* --- the annexure (their "PP" / "GRN" tabs): the items, no prices ---------
   The two tabs are not the same sheet. The PP range carries a works code and a
   length; the nylon range has neither, and its descriptions run to one line, so
   that tab is nine columns of shorter rows. Both are reproduced as they are. */
export const ANNEX = {
  pp: {
    widths: [15.6640625, 13.1640625, 6, 10, 7, 7.33203125, 38.1640625, 16.5, 16.5, 8.1640625, 8.5],
    span: "K", packCol: "F", qtyCol: "J", totalAt: 8, headHt: 19.5, rowHt: 25.5,
    merges: ["A1:K1", "E2:F2", "J2:K2"],
    head: [
      ["CODE", "GD CODE ", "SIZE", "LENGTH", ["PACKING"], "DESCRIPTION", "Bar Codes", "HSN CODES", ["Quantity"]],
      ["", "", "MM", "MM", "UNIT ", "BOX", "", "", "", "Pcs", "Box"],
    ],
    cells: (x, hsn, line) => [
      { v: x.it.code || "", s: WB.gd },
      { v: x.it.gd || "", s: WB.gd },
      { v: x.it.size || "", s: WB.head },
      { v: x.it.length || "", s: WB.head },
      { v: x.it.packUnit || "", s: WB.numC },
      { v: x.packing, t: "n", s: WB.numC },
      { v: bcDescription(x.it), s: WB.desc },
      { v: String(x.it.barcode || ""), t: "s", s: WB.code },
      hsn == null ? { v: String(x.it.hsn || ""), t: "s", s: WB.numC } : { v: hsn, t: "n", s: WB.hsn },
      { v: x.pieces, t: "n", s: WB.num },
      { f: upDiv(`J${line}`, `F${line}`), s: WB.num },
    ],
    tail: [WB.endGd, WB.endGd, WB.endB, WB.endB, WB.end, WB.end, WB.endDesc],
    html: (x) => [["gd", esc(x.it.code)], ["gd", esc(x.it.gd)], ["bh", esc(x.it.size)], ["bh", esc(x.it.length)],
      ["c", esc(x.it.packUnit || "")], ["c", x.packing, "int"], ["desc", esc(bcDescription(x.it)).replace(/\n/g, "<br>")],
      ["code", esc(x.it.barcode)], ["c", esc(hsnText(x.it))], ["r", x.pieces, "int"], ["r", x.boxes, "fml"]],
    htmlHead: [
      ["CODE", 1], ["GD CODE", 1], ["SIZE", 1], ["LENGTH", 1], ["PACKING", 2],
      ["DESCRIPTION", 1], ["Bar Codes", 1], ["HSN CODES", 1], ["Quantity", 2]],
    htmlSub: ["", "", "MM", "MM", "UNIT", "BOX", "", "", "", "Pcs", "Box"],
  },
  /* The nylon tab is plainer than the PP one in their book: codes in black
     rather than the green, sizes unbolded, and the bar code held as a number
     rather than as text. Reproduced as it stands. */
  grn: {
    widths: [13.1640625, 6, 7, 7.33203125, 38.1640625, 16.5, 16.5, 10.6640625, 10.83203125],
    span: "I", packCol: "D", qtyCol: "H", totalAt: 6, headHt: 20.25, rowHt: undefined,
    merges: ["A1:I1", "C2:D2", "H2:I2"],
    banner: "box", pairs: { Quantity: "box" },
    margins: { left: 0.51181102362204722, right: 0.51181102362204722, top: 0.51181102362204722, bottom: 0.51181102362204722, header: 0, footer: 0 },
    head: [
      ["GD CODE ", "SIZE", ["PACKING"], "DESCRIPTION", "Bar Codes", "HSN CODES", ["Quantity"]],
      ["", "MM", "UNIT ", "BOX", "", "", "", "Pcs", "Box"],
    ],
    cells: (x, hsn, line) => {
      const bar = String(x.it.barcode || "");
      return [
        { v: x.it.gd || "", s: WB.textL },
        { v: x.it.size || "", s: WB.numC },
        { v: x.it.packUnit || "", s: WB.numC },
        { v: x.packing, t: "n", s: WB.numC },
        { v: bcDescription(x.it), s: WB.desc },
        /^\d+$/.test(bar) ? { v: Number(bar), t: "n", s: WB.barNum } : { v: bar, t: "s", s: WB.numC },
        hsn == null ? { v: String(x.it.hsn || ""), t: "s", s: WB.numC } : { v: hsn, t: "n", s: WB.hsn },
        { v: x.pieces, t: "n", s: WB.num },
        { f: upDiv(`H${line}`, `D${line}`), s: WB.num },
      ];
    },
    tail: [WB.endGd, WB.endB, WB.end, WB.end, WB.endDesc],
    html: (x) => [["", esc(x.it.gd)], ["c", esc(x.it.size)], ["c", esc(x.it.packUnit || "")],
      ["c", x.packing, "int"], ["desc", esc(bcDescription(x.it)).replace(/\n/g, "<br>")],
      ["c", esc(x.it.barcode)], ["c", esc(hsnText(x.it))], ["r", x.pieces, "int"], ["r", x.boxes, "fml"]],
    htmlHead: [["GD CODE", 1], ["SIZE", 1], ["PACKING", 2], ["DESCRIPTION", 1], ["Bar Codes", 1], ["HSN CODES", 1], ["Quantity", 2]],
    htmlSub: ["", "MM", "UNIT", "BOX", "", "", "", "Pcs", "Box"],
  },
};

export function supplierAnnexSheet(ctx, group) {
  const A = ANNEX[group.key];
  const n = A.widths.length;
  const H = (v) => ({ v, s: WB.head });
  /* A pair under one heading is normally open between its two cells; on the
     nylon tab their book boxes both, and boxes the banner too. */
  const headRow = A.head[0].flatMap((h) => (Array.isArray(h)
    ? (A.pairs?.[h[0]] === "box" ? [H(h[0]), H("")] : [{ v: h[0], s: WB.headL }, { v: "", s: WB.headR }])
    : [H(h)]));
  const banner = A.banner === "box"
    ? Array(n).fill(null).map(() => ({ v: "", s: WB.poBox }))
    : [...Array(n - 1).fill({ v: "", s: WB.poM }), { v: "", s: WB.poM }];
  banner[0] = { v: `PO NO : ${poHeaderList(ctx)}`, s: A.banner === "box" ? WB.poBox : WB.poL };
  const out = [banner, headRow, A.head[1].map(H)];
  const heights = [undefined, A.headHt, A.headHt];

  const first = out.length + 1;
  group.rows.forEach((x) => {
    const line = out.length + 1;
    out.push(A.cells(x, hsnValue(x.it), line));
    heights.push(A.rowHt);
  });
  const last = out.length;
  const st = (col) => ({ f: `SUBTOTAL(9,${col}${first}:${col}${last})`, s: WB.tot });
  const boxCol = String.fromCharCode(A.qtyCol.charCodeAt(0) + 1);

  out.push(group.rows.length ? [
    ...A.tail.map((s) => ({ v: "", s })),
    { v: "TOTAL", s: WB.tot }, { v: "", s: WB.tot }, st(A.qtyCol), st(boxCol),
  ] : []);

  return fitSheet({
    name: group.tab,
    rows: out,
    heights,
    merges: A.merges,
    widths: A.widths,
    defaultColWidth: 10.6640625,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    tabColor: group.tabColor,
    page: {
      paper: 9, orientation: "landscape", scale: group.scale, fit: true,
      margins: A.margins || { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0, footer: 0 },
    },
  });
}

/* The same letter on screen and on paper. */
export function supplierPoBlock(ctx, sid, arr) {
  const s = supFor(ctx, sid);
  const E = ctx.EXPORTER;
  const [addr1 = "", addr2 = ""] = addrLines(E);
  const groups = rangesOf(arr);
  const marks = ctx.inv.ship?.marks || "";
  const party = [`Messrs. ${s.name || ""}`, s.addr || "", s.place || "", s.gstin ? `GSTIN : ${s.gstin}` : ""].filter(Boolean);
  const value = sum(arr, "valTotal");
  const igst = Math.round(value * 0.18);

  const items = groups.map((g, gi) => `
      <tr class="band"><td class="l" colspan="3">${esc(g.head)}</td><td></td><td></td><td></td><td class="c b">${gi === 0 ? "Rs." : ""}</td></tr>
      ${gi === 0 ? `<tr><th class="l">CODE</th><th class="l">DESCRIPTION</th><th class="l">HSN CODE</th><th></th><th></th><th></th><th></th></tr>` : ""}
      ${g.rows.map((x) => `<tr>
        <td>${esc(x.it.code)}</td>
        <td class="desc">${esc(bcDescription(x.it)).replace(/\n/g, "<br>")}</td>
        <td>${esc(hsnText(x.it))}</td>
        <td class="c" data-t="int" data-v="${x.pieces}">${x.pieces}</td>
        <td class="c" data-t="inr" data-v="${x.valUnit}">${wbRupee(x.valUnit)}</td>
        <td class="c">${esc(perUnitOf(x.it))}</td>
        <td class="r" data-t="inr" data-v="${x.valTotal}">${wbRupee(x.valTotal)}</td>
      </tr>`).join("")}`).join("");

  return `<table class="wb letter">
      <colgroup><col style="width:11%"><col style="width:26%"><col style="width:18%">
        <col style="width:11%"><col style="width:11%"><col style="width:11%"><col style="width:12%"></colgroup>
      <tr><td class="ttl" colspan="7">EXPORT PURCHASE ORDER</td></tr>
      <tr><td class="brand" colspan="3" rowspan="2">${imgTag(LOGO_SRC, "logo")}${esc(E.name)}</td>
        <td class="lbl">Purchase Order</td><td class="val" colspan="3">${esc(poRefOf(ctx, s))}</td></tr>
      <tr><td class="lbl">No and Date :</td><td colspan="3"></td></tr>
      <tr><td class="sub" colspan="3">${esc(E.sub || "Merchant Exporters")}</td>
        <td class="lbl">Your Ref:</td><td class="val" colspan="3">${esc(s.yourReference || "")}</td></tr>
      <tr><td class="addr" colspan="3">${esc(addr1)}</td><td></td><td colspan="3"></td></tr>
      <tr><td class="addr" colspan="3">${esc(addr2)}</td>
        <td class="lbl">Order of:</td><td class="val" colspan="3">PP &amp; NYLON MOULDED FITTINGS</td></tr>
      <tr><td class="addr" colspan="3">Tel: ${esc(E.tel)} E-Mail: ${esc(E.email)}</td><td></td><td colspan="3"></td></tr>
      <tr><td class="lbl" colspan="3">To,</td>
        <td class="gst c" colspan="4">GSTIN : ${esc(E.gstin)}<br>PAN No: ${esc(E.pan)}</td></tr>
      ${party.map((line, i) => `<tr><td class="party" colspan="3">${esc(line)}</td>
        <td class="lbl c" colspan="4">${i === 1 ? "Shipping Marks" : i === 2 ? esc(marks) : ""}</td></tr>`).join("")}
      <tr><td class="lbl l" colspan="3">DESCRIPTION OF GOODS.</td>
        <th>QUANTITY</th><th>Unit Price.</th><th>Per Unit</th><th>Total Value.</th></tr>
      <tr class="band"><td class="l" colspan="3">PP &amp; NYLON MOULDED FITTINGS</td>
        <td class="c b">PIECES</td><td class="c b">Rs.</td><td></td><td class="c b u">Ex-Works.</td></tr>
      ${items}
      <tr><td colspan="6"></td><td></td></tr>
      <tr><td class="r" colspan="3">TOTAL VALUE….</td><td colspan="3"></td>
        <td class="r" data-t="inr" data-v="${value}">${wbRupee(value)}</td></tr>
      <tr><td class="u" colspan="3">ADD : IGST @ 18%</td><td colspan="3"></td>
        <td class="r" data-t="inr" data-v="${igst}">${wbRupee(igst)}</td></tr>
      <tr><td class="r" colspan="3">TOTAL  NETT VALUE…………………</td><td colspan="3"></td>
        <td class="r bx" data-t="inr" data-v="${value + igst}">${wbRupee(value + igst)}</td></tr>
      <tr><td class="lbl">Delivery</td><td class="lbl" colspan="2"></td>
        <td class="lbl">Documents:</td><td colspan="3">1. Invoice</td></tr>
      <tr><td class="lbl">Payment</td><td class="lbl" colspan="2">Against Delivery as usual</td>
        <td></td><td colspan="3">2. Packing cum weight List</td></tr>
      <tr><td class="lbl">Packing</td><td class="lbl" colspan="2">As per attached Sheet</td><td></td><td colspan="3"></td></tr>
      <tr><td class="lbl">GST</td><td class="lbl" colspan="2">IGST @ 18% TO BE CHARGED</td><td></td><td colspan="3"></td></tr>
      <tr><td class="lbl" colspan="3">SELLER'S CONFIRMATION</td>
        <td class="sgn r" colspan="4">For ${esc(E.name)}</td></tr>
      <tr class="sign"><td colspan="3"></td><td colspan="4"></td></tr>
      <tr><td class="b" colspan="5">(Please send us one copy duly signed &amp; stamped as confirmation)</td>
        <td class="buyer r" colspan="2">BUYER.</td></tr>
      <tr><td class="b" colspan="3">Subject to Mumbai Jurisdiction</td><td colspan="4"></td></tr>
    </table>`;
}

/* The annexure as it reads on screen — the same columns as its tab. */
export function supplierAnnexBlock(ctx, group) {
  const A = ANNEX[group.key];
  const boxFml = attr(upDiv("{qty}", "{packbox}"));
  const cell = ([cls, v, kind]) => {
    if (kind === "int") return `<td class="${cls}" data-t="int" data-v="${v}">${v}</td>`;
    if (kind === "fml") return `<td class="${cls}" data-t="int" data-f="${boxFml}">${v}</td>`;
    return `<td class="${cls}">${v}</td>`;
  };
  return `<div class="sub">ANNEXURE · ${esc(group.tab)} — PO NO : ${esc(poHeaderList(ctx))}</div>
    <table class="wb">
      <tr>${A.htmlHead.map(([h, span]) => `<th${span > 1 ? ` colspan="${span}"` : ""}>${h}</th>`).join("")}</tr>
      <tr class="hd2">${A.htmlSub.map((h, i) => {
    const key = h === "BOX" ? " data-k=\"packbox\"" : h === "Pcs" ? " data-k=\"qty\"" : h === "Box" ? " data-k=\"box\"" : "";
    return `<th${key}>${h}</th>`;
  }).join("")}</tr>
      ${group.rows.map((x) => `<tr>${A.html(x).map(cell).join("")}</tr>`).join("")}
      <tr class="tot">${A.tail.map(() => '<td class="o"></td>').join("")}<td>TOTAL</td><td></td>
        <td class="r" data-t="int" data-sum="qty">${sum(group.rows, "pieces")}</td>
        <td class="r" data-t="int" data-sum="box">${sum(group.rows, "boxes")}</td></tr>
    </table>`;
}

/* One supplier purchase order per supplier — for the split download. Each
   carries its own workbook: the letter, then an annexure per range. */
export function supplierPoDocs(ctx) {
  const rows = orderRows(ctx);
  const bySup = {};
  rows.forEach((x) => { (bySup[x.supId] = bySup[x.supId] || []).push(x); });
  return Object.entries(bySup).map(([sid, arr]) => {
    const sp = supFor(ctx, sid);
    const groups = rangesOf(arr);
    return {
      supplierId: sid, code: sp.code || sid, name: sp.name || sid,
      docName: `Suppliers_PO_6_${(sp.code || sid).replace(/[^A-Za-z0-9]+/g, "_")}`,
      html: supplierPoBlock(ctx, sid, arr)
        + groups.map((g) => `<div class="pgbrk">${supplierAnnexBlock(ctx, g)}</div>`).join(""),
      sheets: [supplierLetterSheet(ctx, sp, arr), ...groups.map((g) => supplierAnnexSheet(ctx, g))],
    };
  });
}

/* On the supplier sheets the boxes are the packed fact and the pieces follow
   from them, so the formulas run the other way round to the buyer sheets:
   Qty = Box × Packing. */
export const QTY_FROM_BOX = "{box}*{pack}";

/* Doc 7 · Packing (Supplier) — against 7-Packing.xlsx.

   The packer's own sheet: eighteen columns under a two-line header, the goods
   broken into the size bands their master keeps them in ("15 MM (1/2\")",
   "25mm(1\")", "PP PIPES M/F THREADED" …), which is the item's Group. A band is
   ruled in wherever the group changes — the rows are left in the order they
   were packed, never re-sorted, because the serial numbers run down the sheet.

   Its arithmetic, kept as theirs: Box = Pcs ÷ pack, Volume = Box × per-box, and
   the weights follow the box count too. Pieces, quantities and volumes total
   with SUBTOTAL so a filtered sheet re-totals itself; the weights with SUM. */
export const P7 = {
  banner: { font: "refb", border: "b", valign: "center" },
  head: { font: "refb", border: "box", align: "center", valign: "center" },
  headW: { font: "refb", border: "box", align: "center", valign: "center", wrap: true },
  headV: { font: "refb", border: "box", valign: "center" },
  headL: { font: "refb", border: "ltb", align: "center", valign: "center" },
  headR: { font: "refb", border: "rtb", align: "center", valign: "center" },
  headT: { font: "refb", border: "lrt", align: "center", valign: "center" },
  headTL: { font: "refb", border: "lrt", valign: "center" },
  headB: { font: "refb", border: "lrb", align: "center", valign: "center" },
  headRT: { font: "refb", border: "rt", valign: "center" },
  bandC: { font: "refb", border: "tb", align: "left", valign: "center" },
  bandD: { font: "refb", border: "ltb", align: "left", valign: "center" },
  bandFill: { font: "ref", border: "box", valign: "center" },
  sr: { font: "ref", border: "box", valign: "center" },
  po: { font: "ref", border: "box", align: "center", valign: "center", wrap: true, quote: true },
  codeC: { font: "refgd", border: "rtb", align: "left", valign: "center" },
  code: { font: "refgd", border: "box", align: "left", valign: "center" },
  mid: { font: "ref", border: "box", align: "center", valign: "center" },
  desc: { font: "refb", border: "box", align: "left", valign: "center", wrap: true },
  bar: { font: "refb", border: "box", align: "center", valign: "center", quote: true },
  hsn: { font: "refb", border: "box", align: "center", valign: "center", fmt: "0.0000" },
  num: { font: "ref", border: "box", valign: "center" },
  num2: { font: "ref", border: "box", valign: "center", fmt: "0.00" },
  num3: { font: "ref", border: "box", valign: "center", fmt: "0.000" },
  endGd: { font: "refgd", border: "t", valign: "center" },
  end: { font: "ref", border: "t", valign: "center" },
  endL: { font: "ref", border: "t", align: "left", valign: "center" },
  endR: { font: "ref", border: "rt", valign: "center" },
  tot: { font: "refb", border: "box", align: "center", valign: "center" },
  totV: { font: "refb", border: "box", valign: "center" },
  tot2: { font: "refb", border: "box", valign: "center", fmt: "0.00" },
  tot3: { font: "refb", border: "box", valign: "center", fmt: "0.000" },
};

/* Their PO column stacks the orders a line each, rather than running them
   together and letting the column decide where to break. */
export const poStack = (pos) => (pos || []).join(",\n");

/* Their banner writes the order list with a stop after DT. */
export const poBannerList = (ctx) => {
  const seen = {};
  ctx.buyerMaster.forEach((r) => { if (!seen[r.po]) seen[r.po] = r.date; });
  return Object.entries(seen).sort((a, b) => a[1].localeCompare(b[1]))
    .map(([po, d]) => `${po} DT.${ddmm(d)}`).join(", ");
};

// Resolve the transport (transporter name + vehicle no) for a supplier on this
// invoice — from the shipment vehicle details, falling back to the packing pick.
export function transportInfo(ctx, sid) {
  const v = (ctx.inv.vehicles || {})[sid] || {};
  let name = v.transportName || "", veh = v.vehicleNo || "";
  const tid = v.transportId || (ctx.inv.packingTransports || {})[sid];
  const t = (ctx.transports || []).find((x) => x.id === tid);
  if (!name) {
    name = t?.name || ""; if (!v.vehicleNo && t) veh = veh || "";
  }
  // The transporter's own GST/enrolment id — the e-way form asks for it.
  return { name: name || "—", veh: veh || "—", transportId: t?.transportId || "" };
}

/* Doc 10 · E-way bill (inward) — laid out as the portal's own entry form
   (Docs/Jaikvin Process/Numbering/10-E Way Bill - Format.pdf), so whoever keys
   it in reads the boxes in the order the site asks for them. What the form
   leaves for the operator to type — the supplier's own tax invoice number and
   date, the distance, the truck number, the LR — prints as grey prompts, the
   way their format sheet does.

   The consignment is one line, as the portal takes it: the range's name, the
   four-digit HSN chapter heading, total pieces, and the taxable value. Coming
   from Daman to Maharashtra it is interstate, so the tax is all IGST.       */
export const EW_SHIP_TO = {
  name: "ALL CARGO TERMINALS LTD", addr: "NEXT TO AMEYA CFS, JNPT AREA",
  place: "Village Khopta", pin: "410206", state: "MAHARASHTRA",
};

/* The value that turns up most often in a set of lines — what a paper that
   describes a whole consignment in one line has to print for it. */
export const commonOf = (arr, pick) => {
  const seen = {};
  arr.forEach((x) => { const k = String(pick(x) || "").trim(); if (k) seen[k] = (seen[k] || 0) + 1; });
  return Object.entries(seen).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
};

/* The form gives the street two lines and the town its own field, so an
   address held as one string is broken at a comma near the middle. */
export const ewAddr = (addr) => {
  const parts = String(addr || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return [parts[0] || "", ""];
  let n = 1;                                   // the first part always starts line one
  let len = parts[0].length;
  while (n < parts.length - 1 && len + parts[n].length <= 24) { len += parts[n].length + 2; n += 1; }
  return [`${parts.slice(0, n).join(", ")},`, parts.slice(n).join(", ")];
};

/* What the consignment is called on the bill — the factory's range, not the
   size band a particular line happens to sit in. */
export const ewGoods = (arr) => {
  const rule = commonOf(arr, (x) => x.it.stickerRule || "pp");
  if (rule === "grn") return "NYLON MOULDED FITTINGS";
  if (rule === "oswin") return "PP EXTRUDED PIPES";
  return "PP MOULDED FITTINGS";
};

export function eway10Block(ctx, sid, arr) {
  const sp = supFor(ctx, sid);
  const tr = transportInfo(ctx, sid);
  const qty = sum(arr, "pieces");
  const taxable = sum(arr, "valTotal");
  const igst = Math.round(taxable * 0.18 * 100) / 100;
  const goods = ewGoods(arr);
  const hsn = (commonOf(arr, (x) => x.it.hsn) || "").slice(0, 4);
  const [sAddr1, sAddr2] = ewAddr(sp.addr);
  const money = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const box = (v, cls = "") => `<td class="fld ${cls}">${v === "" ? "&nbsp;" : v}</td>`;
  const ph = (v) => `<td class="fld ph">${esc(v)}</td>`;

  const party = (title, right, name, gstin, state, addr1, addr2, place, pin, pinState) => `
      <tr><td class="hd" colspan="2">${title}</td><td class="hd" colspan="3">${right}</td></tr>
      <tr><td class="lbl">Name</td>${box(esc(name))}<td class="lbl">Address</td>${box(esc(addr1), "wide")}<td></td></tr>
      <tr><td class="lbl">GSTIN</td>${box(esc(gstin))}<td class="lbl"></td>${box(esc(addr2), "wide")}<td></td></tr>
      <tr><td class="lbl">State</td>${box(esc(state))}<td class="lbl">Place</td>${box(esc(place), "wide")}<td></td></tr>
      <tr><td></td><td></td><td class="lbl">Pincode</td>${box(esc(pin))}${box(esc(pinState), "c")}</tr>`;

  return `<div class="ew">
    <table class="ewtop"><tr><td class="b">EWAY BILL FORMAT</td>
      <td class="c">E - WAY BILL SYSTEM<br>e - WayBill Entry Form</td></tr></table>

    <div class="lbl">Transaction details</div>
    <table class="ewband"><tr>
      <td class="b">Transaction&nbsp; Type</td><td class="i">Outward</td><td class="i on">Inward</td>
      <td class="b">Sub Type</td><td class="i on">Supply</td><td class="i">Export</td><td class="i">Job Work</td>
      <td class="i">SKD / CKD</td><td class="i">Recipient Not Known</td><td class="i">For Own Use</td>
      <td class="i">Exhibition Or Fairs</td><td class="i">Line Sales</td><td class="i">Others</td></tr></table>

    <table class="ewline"><tr>
      <td class="lbl">Document Type</td>${ph("Tax Invoice")}
      <td class="lbl">Document No</td>${ph("Your Tax Invoice No")}
      <td class="lbl">Document Date</td>${ph("Your Tax Invoice Date")}</tr></table>

    <table class="ewgrid">
      ${party("Bill From", "Despatch From", sp.name, sp.gstin, sp.state || "DAMAN AND DIU",
    sAddr1, sAddr2, sp.place, sp.pin, sp.state || "DAMAN AND DIU")}
      <tr class="gap"><td colspan="5"></td></tr>
      ${party("Bill To", "Ship To", ctx.EXPORTER.name, ctx.EXPORTER.gstin, "MAHARASHTRA",
    EW_SHIP_TO.name, EW_SHIP_TO.addr, EW_SHIP_TO.place, EW_SHIP_TO.pin, EW_SHIP_TO.state)}
    </table>

    <div class="lbl">Item Details</div>
    <table class="ewitems">
      <tr class="hd"><td>Product Name</td><td>Descripton</td><td>HSN</td><td>Quantity</td><td>Unit</td>
        <td>Value/Taxable<br>Value(RS)</td><td colspan="4">Tax Rate (C+S+I+C)</td></tr>
      <tr>${box(esc(goods))}${box(esc(goods))}${box(esc(hsn), "c")}${box(qty, "c")}${box("PCS", "c")}
        ${box(money(taxable), "c")}${box("0.00", "c")}${box("0.00", "c")}${box("18.00", "c")}${box("0.00", "c")}</tr>
    </table>

    <table class="ewtot">
      <tr class="hd"><td>Total Amt / Taxable Amt</td><td>CGST Amount</td><td>SGST Amount</td>
        <td>IGST Amount</td><td>CESS Amount</td><td>Total Inv . Value</td></tr>
      <tr>${box(money(taxable), "c")}${box("0.00", "c")}${box("0.00", "c")}
        ${box(money(igst), "c")}${box("0.00", "c")}${box(money(taxable + igst), "c")}</tr>
    </table>

    <div class="lbl">Transportation Details</div>
    <table class="ewline"><tr>
      <td class="lbl">Transpoter Name</td>${box(esc(tr.name === "—" ? "" : tr.name), "c")}
      <td class="lbl">Transpoter ID</td>${box(esc(tr.transportId || ""), "c")}
      <td class="lbl">Approximate Distance (inKM)</td>${box("", "c")}</tr></table>

    <div class="lbl">PART - B</div>
    <table class="ewpart">
      <tr><td class="lbl">Mode</td><td class="fld c on">Road</td><td class="fld c">Rail</td><td class="fld c">Air</td><td class="fld c">Ship</td></tr>
      <tr><td class="lbl">Vehicle Type</td><td class="fld c on">Regular</td><td class="fld c" colspan="3">Over Dimensional Cargo</td></tr>
      <tr><td class="lbl">Vehicle No</td>${tr.veh && tr.veh !== "—"
    ? `<td class="fld c" colspan="4">${esc(tr.veh)}</td>`
    : `<td class="fld c ph" colspan="4">Please give the Truck Number Here</td>`}</tr>
      <tr><td class="lbl">Transpoter Doc. No &amp; Date</td><td class="fld c ph" colspan="2">LR Number</td>
        <td class="fld c ph" colspan="2">LR Date</td></tr>
    </table>
  </div>`;
}

/* The same form as a worksheet. Thirteen columns carry every band of it: the
   thirteen transaction-type options set the grid, and each of the other bands
   is a run of merged cells across the same thirteen — which is what keeps the
   boxes under one another instead of each table finding its own edges.

   The figures are live: the item's taxable value drives the IGST and the
   invoice total, so an operator who corrects a quantity or a value in the
   sheet before keying it in sees the tax follow.                            */
export const EW = {                                     // the form's own styles
  b: { font: "refb", border: false, valign: "center" },
  lbl: { font: "ref", border: false, valign: "center" },
  lblW: { font: "ref", border: false, valign: "center", wrap: true },
  hd: { font: "ref", border: false, valign: "bottom" },
  hdC: { font: "ref", border: false, align: "center", valign: "bottom", wrap: true },
  sys: { font: "ref", border: false, align: "center", valign: "center" },
  fld: { font: "ref", border: "box", valign: "center", wrap: true },
  fldC: { font: "ref", border: "box", align: "center", valign: "center", wrap: true },
  ph: { font: "refgy", border: "box", valign: "center", wrap: true },
  phC: { font: "refgy", border: "box", align: "center", valign: "center", wrap: true },
  num: { font: "ref", border: "box", align: "center", valign: "center", fmt: "int" },
  money: { font: "ref", border: "box", align: "center", valign: "center", fmt: "num" },
  bandB: { font: "refb", border: "tb", align: "center", valign: "center", wrap: true },
  bandI: { font: "refi", border: "tb", align: "center", valign: "center", wrap: true },
  bandOn: { font: "refb", border: "tb", align: "center", valign: "center", wrap: true },
  optOn: { font: "refb", border: "box", align: "center", valign: "center" },
  opt: { font: "refi", border: "box", align: "center", valign: "center" },
};

export function eway10Sheet(ctx, sid, arr) {
  const sp = supFor(ctx, sid);
  const tr = transportInfo(ctx, sid);
  const goods = ewGoods(arr);
  const hsn = (commonOf(arr, (x) => x.it.hsn) || "").slice(0, 4);
  const [sAddr1, sAddr2] = ewAddr(sp.addr);
  const G = formGrid(13);
  const { row, gap } = G;
  const cell = (v, s, extra) => [1, { v, s, ...extra }];
  const run = (span, v, s, extra) => [span, { v, s, ...extra }];

  /* Bill From / Bill To — label, box, label, box, and the state at the right,
     the five fields the portal puts on each of these lines. */
  const party = (title, right, p) => {
    row([run(5, title, EW.hd), run(8, right, EW.hd)]);
    row([run(2, "Name", EW.lbl), run(3, p.name, EW.fld), run(1, "Address", EW.lbl), run(5, p.addr1, EW.fld), run(2, "", EW.lbl)]);
    row([run(2, "GSTIN", EW.lbl), run(3, p.gstin, EW.fld), run(1, "", EW.lbl), run(5, p.addr2, EW.fld), run(2, "", EW.lbl)]);
    row([run(2, "State", EW.lbl), run(3, p.state, EW.fld), run(1, "Place", EW.lbl), run(5, p.place, EW.fld), run(2, "", EW.lbl)]);
    row([run(2, "", EW.lbl), run(3, "", EW.lbl), run(1, "Pincode", EW.lbl), run(5, p.pin, EW.fld), run(2, p.pinState, EW.fldC)]);
  };

  row([run(4, "EWAY BILL FORMAT", EW.b), run(3, "", EW.lbl), run(6, "E - WAY BILL SYSTEM", EW.sys)]);
  row([run(7, "", EW.lbl), run(6, "e - WayBill Entry Form", EW.sys)]);
  gap();
  row([run(4, "Transaction details", EW.lbl)]);
  row([cell("Transaction  Type", EW.bandB), cell("Outward", EW.bandI), cell("Inward", EW.bandOn),
    cell("Sub Type", EW.bandB), cell("Supply", EW.bandOn), cell("Export", EW.bandI), cell("Job Work", EW.bandI),
    cell("SKD / CKD", EW.bandI), cell("Recipient Not Known", EW.bandI), cell("For Own Use", EW.bandI),
    cell("Exhibition Or Fairs", EW.bandI), cell("Line Sales", EW.bandI), cell("Others", EW.bandI)]);
  gap();
  row([run(2, "Document Type", EW.lbl), run(3, "Tax Invoice", EW.ph),
    run(2, "Document No", EW.lbl), run(2, "Your Tax Invoice No", EW.ph),
    run(2, "Document Date", EW.lbl), run(2, "Your Tax Invoice Date", EW.ph)]);
  gap();

  party("Bill From", "Despatch From", {
    name: sp.name || "", gstin: sp.gstin || "", state: sp.state || "DAMAN AND DIU",
    addr1: sAddr1, addr2: sAddr2, place: sp.place || "", pin: sp.pin || "", pinState: sp.state || "DAMAN AND DIU",
  });
  gap(9);
  party("Bill To", "Ship To", {
    name: ctx.EXPORTER.name, gstin: ctx.EXPORTER.gstin, state: "MAHARASHTRA",
    addr1: EW_SHIP_TO.name, addr2: EW_SHIP_TO.addr, place: EW_SHIP_TO.place,
    pin: EW_SHIP_TO.pin, pinState: EW_SHIP_TO.state,
  });
  gap();

  row([run(4, "Item Details", EW.lbl)]);
  row([run(2, "Product Name", EW.hdC), run(2, "Descripton", EW.hdC), run(1, "HSN", EW.hdC),
    run(1, "Quantity", EW.hdC), run(1, "Unit", EW.hdC), run(2, "Value/Taxable\nValue(RS)", EW.hdC),
    run(4, "Tax Rate (C+S+I+C)", EW.hdC)], 26);
  const item = G.at() + 1;
  row([run(2, goods, EW.fld), run(2, goods, EW.fld), run(1, hsn, EW.fldC, { t: "s" }),
    run(1, sum(arr, "pieces"), EW.num, { t: "n" }), run(1, "PCS", EW.fldC),
    run(2, sum(arr, "valTotal"), EW.money, { t: "n" }),
    run(1, 0, EW.money, { t: "n" }), run(1, 0, EW.money, { t: "n" }),
    run(1, 18, EW.money, { t: "n" }), run(1, 0, EW.money, { t: "n" })], 25.5);
  gap();

  row([run(3, "Total Amt / Taxable Amt", EW.hdC), run(2, "CGST Amount", EW.hdC), run(2, "SGST Amount", EW.hdC),
    run(2, "IGST Amount", EW.hdC), run(2, "CESS Amount", EW.hdC), run(2, "Total Inv . Value", EW.hdC)]);
  const tot = G.at() + 1;
  row([[3, { f: `H${item}`, s: EW.money }], run(2, 0, EW.money, { t: "n" }), run(2, 0, EW.money, { t: "n" }),
    [2, { f: `ROUND(H${item}*L${item}/100,2)`, s: EW.money }], run(2, 0, EW.money, { t: "n" }),
    [2, { f: `A${tot}+D${tot}+F${tot}+H${tot}+J${tot}`, s: EW.money }]]);
  gap();

  row([run(4, "Transportation Details", EW.lbl)]);
  row([run(2, "Transpoter Name", EW.lbl), run(3, tr.name === "—" ? "" : tr.name, EW.fldC),
    run(2, "Transpoter ID", EW.lbl), run(2, tr.transportId || "", EW.fldC),
    run(2, "Approximate Distance (inKM)", EW.lblW), run(2, "", EW.fldC)]);
  gap();

  row([run(4, "PART - B", EW.lbl)]);
  row([run(3, "Mode", EW.lbl), run(3, "Road", EW.optOn), run(3, "Rail", EW.opt), run(2, "Air", EW.opt), run(2, "Ship", EW.opt)]);
  row([run(3, "Vehicle Type", EW.lbl), run(3, "Regular", EW.optOn), run(7, "Over Dimensional Cargo", EW.opt)]);
  const veh = tr.veh && tr.veh !== "—";
  row([run(3, "Vehicle No", EW.lbl), run(10, veh ? tr.veh : "Please give the Truck Number Here", veh ? EW.fldC : EW.phC)]);
  row([run(3, "Transpoter Doc. No & Date", EW.lbl), run(5, "LR Number", EW.phC), run(5, "LR Date", EW.phC)]);

  return fitSheet({
    name: "E-way",
    rows: G.rows,
    merges: G.merges,
    heights: G.heights,
    widths: [12, 10, 10, 10, 10, 12, 10, 10, 12, 12, 12, 10, 12],
    defaultRowHeight: 15,
    colStyle: { font: "ref", border: false, valign: "center" },
    page: {
      paper: 9, orientation: "landscape", fit: true, fitH: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  }, { widen: false });
}

// Supplier-wise e-way documents (one per supplier) — for the split download.
export function ewaySupplierDocs(ctx) {
  const lines = L(ctx), bySup = {}; lines.forEach((x) => { (bySup[x.supId] = bySup[x.supId] || []).push(x); });
  return Object.entries(bySup).map(([sid, arr]) => {
    const sp = supFor(ctx, sid);
    return {
      supplierId: sid, code: sp.code || sid, name: sp.name || sid,
      docName: `Eway_Purchase_10_${(sp.code || sid).replace(/[^A-Za-z0-9]+/g, "_")}`,
      html: eway10Block(ctx, sid, arr),
      sheets: [eway10Sheet(ctx, sid, arr)],
    };
  });
}

/* Doc 11 · Despatch Instructions — the letter each factory receives telling it
   how to send the goods (Docs/Jaikvin Process/Numbering/11-Despatch
   Instructions.pdf). On the letterhead, and addressed to one supplier, so it is
   raised supplier by supplier like the supplier order and the e-way bill.

   Everything the client highlights on their copy is what changes per despatch —
   the reference and date, the export orders, the despatch day, and the marks
   and package count — and every one of those is filled from the invoice here.
   The five instructions themselves are their standing terms, printed as they
   stand.                                                                    */
export const CFS = {
  agent: "Velji Dosabhai & Sons Pvt. Ltd.",
  lines: ["All Cargo Terminals Ltd (Transindia Logistics Pvt Ltd),",
    "Next To Ameya CFS, Village Khopta, JNPT Area, Raigad-410 206."],
  contacts: "Mr Ganpat Shinde Mobile: 9867873029 / Mr Gorakh Mobile: 9321349118 / Mr. Khandu Mobile : 7498802940",
};

export const LETTER_DAY = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return `${d.toLocaleDateString("en-GB", { weekday: "long" }).toUpperCase()}, ${ddmm(s)}`;
};

export const LETTER_DATE = (s) => (s ? new Date(s).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "");

export const letterRef = (ctx) => {
  const yr = new Date(ctx.inv.date).getFullYear();
  const n = String(ctx.inv.invoiceNo || "").match(/\d+/);
  return `JG/${yr}/${n ? n[0].slice(-4) : "DI"}`;
};

/* The marking line: the buyer's mark, the serial run this supplier's boxes
   carry, and how many packages that comes to. */
export function despatchMarks(ctx, arr) {
  const s = ctx.inv.ship || {};
  const mark = (s.marks || "G.D.W").replace(/[\d\s.–-]+$/, "").trim() || "G.D.W";
  const from = String(arr[0]?.range || "").split("-")[0] || "";
  const to = String(arr[arr.length - 1]?.range || "").split("-").pop() || "";
  const pkgs = sum(arr, "boxes");
  const kinds = s.pkgs ? ` (${s.pkgs})` : "";
  return `All Packages to be marked as ${mark}${from ? ` ${from} – ${to}` : ""} / ${pkgs} Packages${kinds}`;
}

/* The letterhead itself — the name in Centaur maroon with the mark against the
   right margin, the rule in the house red, and the contact strip along the
   foot. Both letters in the library are printed on it. */
export const letterheadBlock = (E) => `<table class="dlhead"><tr>
      <td><div class="brand">${esc(E.name)}</div><div class="sub">${esc(E.sub || "Merchant Exporters")}</div></td>
      <td class="lg">${imgTag(LOGO_SRC)}</td></tr></table>
    <div class="rule"></div>`;

export const letterFootBlock = (E) => `<div class="rule"></div>
    <table class="dlfoot"><tr>
      <td><div>${esc(E.iec)}</div><div class="b">${esc(E.gstin)}</div></td>
      <td class="r"><div>+91-${esc(E.tel)}</div><div class="b">${esc(E.email)}</div><div>${esc(E.addr)}</div></td>
    </tr></table>`;

/* Both letters that end this way — the undertaking, then the signature over
   the printed name, then the date and the space for the signature itself. */
export function letterSignRows(G, ctx, E) {
  G.row([[3, { v: "", s: DL.body }], [3, { v: `For M/s. ${E.name}`, s: DL.body }]]);
  G.gap(18);
  G.gap(18);
  G.row([[3, { v: "", s: DL.body }], [3, { v: `Proprietor- ${SIGNATORY}`, s: DL.body }]]);
  G.row([[2, { v: `Date   :   ${ddmm(ctx.inv.date)}`, s: DL.body }], [2, { v: "Signature   :", s: DL.body }], [2, { v: "", s: DL.body }]]);
  G.gap();
}

export function despatch11Block(ctx, sid, arr) {
  const sp = supFor(ctx, sid);
  const E = ctx.EXPORTER;
  const [addr1, addr2] = ewAddr(sp.addr);
  // The town is only added if the street lines have not already named it.
  const place = String(sp.place || "");
  const named = place && addr2.toLowerCase().includes(place.toLowerCase());
  const to = [`Messrs. ${sp.name || ""},`, addr1, [addr2, named ? "" : place, sp.pin].filter(Boolean).join(" ").replace(/\s+/g, " ")]
    .filter(Boolean).map(esc).join("<br>");

  const step = (n, body) => `<tr><td class="n">${n})</td><td>${body}</td></tr>`;
  return `<div class="dl">
    ${letterheadBlock(E)}

    <div class="ref">${esc(letterRef(ctx))}<br>${esc(LETTER_DATE(ctx.inv.date))}</div>
    <p class="to">${to}</p>
    <p class="refline"><span class="k">Ref</span>&nbsp;&nbsp;&nbsp;Our Export Order ${esc(poBannerList(ctx))}</p>
    <p class="b">DESPATCH DATE: ${esc(LETTER_DAY(ctx.inv.date))}</p>
    <p>With reference to the above, we give hereunder the dispatch instructions:</p>

    <table class="ins">
      ${step(1, esc(despatchMarks(ctx, arr)))}
      ${step(2, "Book the consignment for delivery at JNPT/Dhronagiri (Door Delivery)")}
      ${step(3, `Lorry receipt to be made in our name a/c. M/s. ${esc(CFS.agent)} Mumbai, on freight to pay.`)}
      ${step(4, "L/R to show goods for export")}
      ${step(5, `Goods to be delivered at:<br>Messrs ${esc(CFS.agent)},<br>${CFS.lines.map(esc).join("<br>")}`
    + `<br>Person to contact: ${esc(CFS.contacts)}`
    + `<br>They will assist them to off-load the cargo. All the contacts are of the representative of M/s. ${esc(CFS.agent)}`)}
    </table>

    <p>We hope the matter is clear and awaiting your early response.&nbsp; Upon dispatch of the goods send us your Invoice.</p>
    <p>Thanking you,</p>
    <p>Yours faithfully,<br>For ${esc(E.name)},</p>
    <p class="sign">Proprietor</p>

    ${letterFootBlock(E)}
  </div>`;
}

/* The same letter as a worksheet — six columns: a narrow one for the numbers
   of the instructions, four for the body, and the last for what the footer
   sets against the right margin. Nothing here is a table, so the sheet is the
   letter's own blocks laid on that grid, the mark anchored top right and the
   two rules drawn in the letterhead's red. */
export const DL = {
  brand: { font: "brand", border: false, valign: "center" },
  sub: { font: "brands", border: false, valign: "center" },
  rule: { font: "base", border: "b#C00000", valign: "center" },
  body: { font: "base", border: false, valign: "top", wrap: true },
  b: { font: "letb", border: false, valign: "top", wrap: true },
  key: { font: "base", border: false, valign: "top" },
  n: { font: "base", border: false, align: "left", valign: "top" },
  mid: { font: "base", border: false, align: "center", valign: "top", wrap: true },
  midB: { font: "letb", border: false, align: "center", valign: "top" },
  midBU: { font: "letbu", border: false, align: "center", valign: "top" },
  bx: { font: "base", border: "box", valign: "center", wrap: true },
  bxB: { font: "letb", border: "box", valign: "center", wrap: true },
  u: { font: "letu", border: false, valign: "top" },
  // The declarations are typed to both margins, as their copies are.
  just: { font: "base", border: false, valign: "top", wrap: true, align: "justify" },
  foot: { font: "letmn", border: false, valign: "center" },
  footB: { font: "letmnb", border: false, valign: "center" },
  footR: { font: "letmn", border: false, align: "right", valign: "center" },
  footRB: { font: "letmnb", border: false, align: "right", valign: "center" },
};

/* The same letterhead on the worksheet side: the masthead rows, the contact
   strip, and the paper both letters are set up on. */
export function letterheadRows(G, E) {
  G.row([[4, { v: E.name, s: DL.brand }], [2, { v: "", s: DL.brand }]], 30);
  G.row([[4, { v: E.sub || "Merchant Exporters", s: DL.sub }], [2, { v: "", s: DL.sub }]], 16);
  G.row([[6, { v: "", s: DL.rule }]], 6);
  G.gap(6);
}

export function letterFootRows(G, E) {
  G.row([[6, { v: "", s: DL.rule }]], 6);
  G.row([[3, { v: E.iec, s: DL.foot }], [3, { v: `+91-${E.tel}`, s: DL.footR }]]);
  G.row([[3, { v: E.gstin, s: DL.footB }], [3, { v: E.email, s: DL.footRB }]]);
  // The address is longer than the half-row it sits in on paper; a merged cell
  // clips rather than runs on, so it takes the width of the sheet.
  G.row([[6, { v: E.addr, s: { ...DL.footR, wrap: true } }]]);
}

export function letterSheet(name, G, widths) {
  const mark = logoImage();
  return fitSheet({
    name,
    rows: G.rows,
    merges: G.merges,
    heights: G.heights,
    /* Six columns of their letter paper. A document ruled into columns of its
       own — the gross-mass declaration's three (27) — says how it wants them
       divided; the letterhead and the foot sit across them either way. */
    widths: widths || [6, 18, 18, 18, 18, 18],
    defaultRowHeight: 14.25,
    colStyle: { font: "base", border: false, valign: "top" },
    // Top right of the letterhead, level with the exporter's name.
    image: mark ? { ...mark, col: 5, colOff: 190500, row: 0, rowOff: 19050, cy: 533400, cx: Math.round(533400 * (172 / 165)) } : null,
    page: {
      paper: 9, orientation: "portrait", fit: true, fitH: 0,
      margins: { left: 0.6, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  }, { widen: false });
}

export function despatch11Sheet(ctx, sid, arr) {
  const sp = supFor(ctx, sid);
  const E = ctx.EXPORTER;
  const [addr1, addr2] = ewAddr(sp.addr);
  const place = String(sp.place || "");
  const named = place && addr2.toLowerCase().includes(place.toLowerCase());
  const to = [`Messrs. ${sp.name || ""},`, addr1,
    [addr2, named ? "" : place, sp.pin].filter(Boolean).join(" ").replace(/\s+/g, " ")].filter(Boolean);

  const G = formGrid(6);
  const { row, gap } = G;
  const line = (text, s = DL.body) => row([[6, { v: text, s }]]);
  const step = (n, text) => row([[1, { v: `${n})`, s: DL.n }], [5, { v: text, s: DL.body }]]);

  letterheadRows(G, E);

  line(letterRef(ctx));
  line(LETTER_DATE(ctx.inv.date));
  gap();
  to.forEach((l) => line(l));
  gap();
  row([[1, { v: "Ref", s: DL.key }], [5, { v: `Our Export Order ${poBannerList(ctx)}`, s: DL.body }]]);
  gap();
  line(`DESPATCH DATE: ${LETTER_DAY(ctx.inv.date)}`, DL.b);
  gap();
  line("With reference to the above, we give hereunder the dispatch instructions:");
  gap();

  step(1, despatchMarks(ctx, arr));
  step(2, "Book the consignment for delivery at JNPT/Dhronagiri (Door Delivery)");
  step(3, `Lorry receipt to be made in our name a/c. M/s. ${CFS.agent} Mumbai, on freight to pay.`);
  step(4, "L/R to show goods for export");
  step(5, [`Goods to be delivered at:`, `Messrs ${CFS.agent},`, ...CFS.lines,
    `Person to contact: ${CFS.contacts}`,
    `They will assist them to off-load the cargo. All the contacts are of the representative of M/s. ${CFS.agent}`].join("\n"));
  gap();

  line("We hope the matter is clear and awaiting your early response.  Upon dispatch of the goods send us your Invoice.");
  gap();
  line("Thanking you,");
  gap();
  line("Yours faithfully,");
  line(`For ${E.name},`);
  gap(18);
  gap(18);
  line("Proprietor");
  gap();

  letterFootRows(G, E);
  return letterSheet("Despatch", G);
}

/* One despatch instruction per supplier — for the split download. */
export function despatchSupplierDocs(ctx) {
  const lines = L(ctx), bySup = {};
  lines.forEach((x) => { (bySup[x.supId] = bySup[x.supId] || []).push(x); });
  return Object.entries(bySup).map(([sid, arr]) => {
    const sp = supFor(ctx, sid);
    return {
      supplierId: sid, code: sp.code || sid, name: sp.name || sid,
      docName: `Despatch_Instructions_11_${(sp.code || sid).replace(/[^A-Za-z0-9]+/g, "_")}`,
      html: despatch11Block(ctx, sid, arr),
      sheets: [despatch11Sheet(ctx, sid, arr)],
    };
  });
}

/* ---------- Stage C · Pre-shipment (12–29) ---------- */

/* Doc 12 · Shipment boxes & volume — against 12-Shipment Boxes & volume.xlsx.

   Their sheet is the container weighed and valued: a line for every range a
   factory sent, that factory's lines totalled under them, and the whole
   shipment totalled at the foot — then the container's capacity in cubic
   metres and what is still free.

   Three cells drive the arithmetic and they sit in the heading, exactly where
   their sheet keeps them: the GST rate on the purchase (I1), the GST rate on
   the sale (M1) and the day's exchange rate (O1). Every line points at those,
   so correcting one re-values the sheet — which is the whole reason the client
   works in this file rather than reading a printout.

   The last two columns are the check the sheet exists for: O is the sales
   value converted at that rate and P is what it differs from the rupee figure
   the papers were raised at.                                              */

/* Their accounting format — figures aligned on the decimal, a dash for nil. */
export const ACC = '_ * #,##0.00_ ;_ * \\-#,##0.00_ ;_ * "-"??_ ;_ @_ ';

/* A 20ft container's usable volume. Their sheet types it in and takes the
   balance off it, so it stays a cell the client can overwrite for a 40ft. */
export const CONTAINER_CBM = 29;

export const BV = {                                     // 12 · their sheet's styles
  hd: { font: "calb", fill: "grey", border: "box", valign: "center" },
  hdC: { font: "calb", fill: "grey", border: "box", align: "center", valign: "center", wrap: true },
  hdPct: { font: "calb", fill: "grey", border: "box", align: "center", valign: "center", fmt: "0%" },
  hdRate: { font: "calb", fill: "grey", border: "box", align: "center", valign: "center", fmt: "0.00" },
  lbl: { font: "calb", fill: "grey", border: "box" },
  hsn: { font: "calb", fill: "grey", border: "box", fmt: "0.0000" },
  band: { font: "calb", fill: "grey", border: "box" },
  int: { font: "cal", border: "box", fmt: "0" },
  vol: { font: "cal", border: "box", fmt: "0.00" },
  wt: { font: "cal", border: "box", fmt: "0.000" },
  acc: { font: "cal", border: "box", fmt: ACC },
  tInt: { font: "calb", fill: "grey", border: "box", fmt: "0" },
  tVol: { font: "calb", fill: "grey", border: "box", fmt: "0.00" },
  tWt: { font: "calb", fill: "grey", border: "box", fmt: "0.000" },
  tAcc: { font: "calb", fill: "grey", border: "box", fmt: ACC },
};

/* Doc 13 · Export value declaration — against 13-Export Value Declaration.pdf.

   The customs Annexure-A: a typed form, ticked box by ticked box, not a table
   of answers. What changes per shipment is what their copy highlights — the
   shipping bill and invoice, the terms of payment and delivery, and the date
   under the signature; the rest is the form as printed.

   Their own copy carries boxes after only some of the options on lines 3 and
   4, so the X for a plain sale ended up in the first box there was. Every
   option is given its own box here and the one that applies is the one
   ticked — a declaration that reads "sale on consignment basis" against an
   FOB sale is worse than a form that does not match theirs box for box.

   The form is described once, as runs across a 24-column grid, and the page
   and the worksheet are both laid out from that description, so the paper the
   CHA signs and the sheet the office keeps cannot drift apart.            */
export const EV = {
  t: { font: "tnr", border: false, align: "center", valign: "center" },
  n: { font: "tnr", border: false, valign: "center" },
  nt: { font: "tnr", border: false, valign: "top" },
  w: { font: "tnr", border: false, valign: "top", wrap: true },
  u: { font: "tnru", border: false, valign: "center" },
  x: { font: "tnr", border: "box", align: "center", valign: "center" },
  c: { font: "tnr", border: false, align: "center", valign: "center" },
};

export function evd13Rows(ctx) {
  const s = ctx.inv.ship || {};
  const E = ctx.EXPORTER;
  // The bill is numbered when the CHA files it, which is after this is signed;
  // until then the line prints blank, as their copy does.
  const sb = s.sbNo ? `: ${s.sbNo} Dt. ${s.sbDate ? ddmm(s.sbDate) : ""}`.trim() : "";
  const R = (...cells) => ({ cells });
  const GAP = { gap: true };
  const tick = (on) => [1, on ? "X" : "", "x"];

  return [
    R([24, "ANNEXURE-A", "t"]),
    R([24, "EXPORT VALUE DECLARATION", "t"]),
    R([24, "(See Rule of customs Valuation (Determination of Value of export goods) Rules 2007)", "t"]),
    GAP,
    R([12, "1.  Shipping Bill No. & Date.", "n"], [12, sb, "n"]),
    GAP,
    R([12, "2.  Invoice No. & Date.", "n"], [12, `: ${ctx.inv.invoiceNo} Dt. ${ddmm(ctx.inv.date)}`, "n"]),
    GAP,
    R([24, "3.  Nature of Transaction.", "n"]),
    R([3, "Sale", "n"], tick(true), [9, "Sale on consignment basis", "n"], tick(false),
      [3, "Gift", "n"], tick(false), [6, "", "n"]),
    R([3, "Sample", "n"], tick(false), [3, "Other", "n"], tick(false), [16, "", "n"]),
    GAP,
    R([10, "4.  Method of Valuation", "n"], [2, "Rule 3", "n"], tick(true), [2, "Rule 4", "n"], tick(false),
      [2, "Rule 5", "n"], tick(false), [2, "Rule 6", "n"], tick(false), [2, "", "n"]),
    R([10, "", "n"], [14, "(See Export Valuation Rules)", "n"]),
    GAP,
    R([13, "5.  Whether seller and buyer are related", "n"], [2, "Yes", "n"], tick(false),
      [2, "No", "n"], tick(true), [5, "", "n"]),
    GAP,
    R([13, "6.  If yes, whether relationship", "n"], [2, "Yes", "n"], tick(false),
      [2, "No", "n"], tick(false), [5, "", "n"]),
    GAP,
    R([12, "7.  Terms of Payment", "n"], [12, `: ${s.payment || "D.P. SIGHT DRAFT"}`, "n"]),
    GAP,
    R([12, "8.  Terms of Delivery", "n"], [12, `: ${s.terms || "FOB MUMBAI"}`, "n"]),
    GAP,
    R([24, "9.  Previous exports of identical/similar goods if any", "n"]),
    R([12, "Shipping Bill No. & date.", "n"], [12, ": No.", "n"]),
    GAP,
    R([19, "10.  Any other relevant information (Attach separate sheet, if necessary)", "n"], [5, ":NIL", "n"]),
    GAP,
    R([24, "DECLARATION:", "u"]),
    R([1, "1.", "nt"], [23, "We hereby declare that the information furnished above is true, complete and correct in every respect.", "w"]),
    GAP,
    R([1, "2.", "nt"], [23, "We also undertake to bring to the notice of proper officer any particulars, which subsequently come to our knowledge, which will have bearing on a valuation.", "w"]),
    GAP,
    R([10, "Place: Mumbai", "n"], [14, `For M/s. ${E.name}`, "c"]),
    R([10, `Date: ${ddmm(ctx.inv.date)}`, "n"], [14, "", "c"]),
    { gap: true, h: 40 },                       // the stamp and the signature go here
    R([10, "", "n"], [14, `Proprietor- ${SIGNATORY}`, "c"]),
    R([10, "", "n"], [14, "Signature of the Exporter", "c"]),
    R([10, "", "n"], [14, "Name of the Signatory.", "c"]),
  ];
}

/* Doc 14 · SCOMET declaration — against 14-Scomet Declaration.pdf. The four
   undertakings the DGFT wants from an exporter, on the same letterhead as the
   despatch instruction. Only the invoice and the date change with the
   shipment; the undertakings are their standing text and are printed word for
   word, including the two slips their copy carries ("contravene the contravene
   the", "do not confirm to unclear transfer") — this is a declaration that has
   been filed in this wording for years, and editing it is the client's call,
   not ours. */
export const SCOMET_TERMS = [
  "Our products do not fall under restricted or negative list of items under FTP 2009-2014 nor these are categorized under SCOMET (Special Chemicals, Organisms, Materials, Equipment & Technologies) list.",
  "Export of our products are neither covered under EU Registration 423/2007 nor the Customer is listed under OFAC (Office of the Foreign Asset Control under U.S. Department of Treasury) SDN list.",
  "Supplier stated in the export invoice(s) are not meant for any military/nuclear activities or development. The Goods stated in the invoice do not confirm to unclear transfer or proliferation activities.",
  "These supplies do not contravene the contravene the Resolution 1929(2010) of United Nations Security Council or Provisions of INECIRC/254/Rev-9/Part2(IAEA Document)",
];

export const scometRef = (ctx) => `${ctx.inv.invoiceNo} Dt ${ddmm(ctx.inv.date)}`;

/* Doc 15 · SDF declaration — against 15-SDF Declaration.pdf. The customs SDF,
   on the letterhead: what is declared, what is enclosed and against which of
   the four heads, the particulars of the exporter, and the undertaking under
   FEMA. The customs broker's half of the particulars is left empty — the CHA
   fills it in when the shipping bill is filed. */
export const SDF_ENCLOSURES = [
  // The first head runs to three lines on their form, with its answer against
  // the middle one; the rest are a line each.
  [["Duty Exemption Entitlement Certificate /", "Advance Authorisation /", "Duty Free Import Authorisation Declaration"], "NOT APPLICABLE", 1],
  [["Invoice cum Packing-List"], "APPLICABLE", 0],
  [["Quota / Inspection Certificates"], "NOT APPLICABLE", 0],
  [["Others (Specify)"], "NOT APPLICABLE", 0],
];

export const SDF_FEMA = "I/We undertake to abide by the provisions of Foreign Exchange Management Act, 1999, as amended from time to time, including realization or repatriation of foreign exchange to or from India.";

/* The particulars box: ours on the left, the customs broker's on the right. */
export const sdfParticulars = (ctx) => [
  ["Invoice No", ctx.inv.invoiceNo, "Date", ddmm(ctx.inv.date)],
  ["Name of the Exporter", SIGNATORY, "Name of Customs Broker", ""],
  ["Designation", "Proprietor", "Designation", ""],
  ["", "", "Identity Card Number", ""],
];

/* Doc 16 · RoDTEP declaration — against 16-RoDTEP Declaration.pdf. The
   annexure the shipping bill is filed with when the shipment claims RoDTEP,
   on the letterhead. The three undertakings are the scheme's own wording and
   are printed as they stand; only the invoice and the date change. */
export const RODTEP_TITLE = "DECLARATION TO BE FILED AS PART OF SHIPPING BILL OR BILL OF EXPORT FOR EXPORT OF GOODS UNDER RoDTEP SCHEME";

export const RODTEP_LEAD = "“I/We, in regard to my/our claim under RoDTEP scheme made in this Shipping Bill or Bill of Export, hereby declare that:";

export const RODTEP_TERMS = [
  "1. I/ We undertake to abide by the provisions, including conditions, restrictions, exclusions and time-limits as provided under RoDTEP scheme, and relevant notifications, regulations, etc., as amended from time to time.",
  "2. Any claim made in this shipping bill or bill of export is not with respect to any duties or taxes or levies which are exempted or remitted or credited under any other mechanism outside RoDTEP.",
  "3. I/We undertake to preserve and make available relevant documents relating to the exported goods for the purposes of audit in the manner and for the time period prescribed in the Customs Audit Regulations, 2018.”",
];

/* Doc 17 · Proforma invoice — against 17-Proforma Invoice of Buyer.pdf, which
   is the buyer's own purchase order form: their name and tagline over the
   words PURCHASE ORDER, the order number and date, us in the TO box and their
   warehouse in the DELIVER TO box, the account code they file us under, then
   the goods banded by range — a band per item group, as their form bands them
   — priced per piece or per hundred, and the freight and delivery terms under
   it with their contact strip along the foot.

   Their letterhead is the buyer's, not ours, so it is held on the buyer master
   (Setup → Buyers) and prints from there — including the mark above their
   name, uploaded once as `logo` and carried as a data: URL. A buyer whose form
   we do not reproduce simply leaves those fields blank and the boxes print
   empty, which is what a blank form does.

   One thing about their paper this cannot follow: their grid is a fixed frame
   that carries its running value to the next page as "Balance c/f" and totals
   on the last; ours is one flow, so it rules the frame out to a full page and
   totals once. */
export const fobModeOf = (it) => it?.fobMode || "100";

export const perLabel = (it) => (fobModeOf(it) === "piece" ? "Per Piece" : "Per 100 Pieces");

/* Their purchase order bands the goods by product family, in the order the
   form runs — not by the size band the master groups them under. A pipe is a
   pipe to the buyer whether it is 15MM or 50MM; what separates the bands is
   what the thing IS: extruded pipe threaded male-to-male, the same male-to-
   female, moulded fittings, nylon fittings, and the cartons they travel in.
   The master's own group is what says which: the size bands and the plain
   pipe/tube groups are the MxM pipes, "PP PIPES M/F THREADED" the MxF ones. */
export const PROFORMA_FAMILIES = [
  ["mxm", "PP EXTRUDED PIPES : MxM THREADED"],
  ["mxf", "PP EXTRUDED PIPES : MxF THREADED"],
  ["ppm", "PP MOULDED FITTINGS"],
  ["grn", "NYLON MOULDED FITTINGS"],
  ["box", "CORRUGATED BOXES"],
];

export function familyOf(it) {
  const g = String(it.group || "").trim().toLowerCase();
  const code = String(it.code || it.gd || "").toUpperCase();
  if (g.includes("corrugated") || g.includes("carton") || /^GD\d/.test(code)) return "box";
  if ((it.stickerRule || "pp") === "grn" || g.includes("grn") || g.includes("nylon")) return "grn";
  if (g.includes("m/f") || g.includes("mxf")) return "mxf";
  if (g.includes("moulded")) return "ppm";
  if (/\d\s*mm|pipe|tube/.test(g)) return "mxm";
  return "ppm";
}

export const bandOf = (it) => PROFORMA_FAMILIES.find(([k]) => k === familyOf(it))[1];

/* Their form is a ruled frame, not a table that stops with the goods. */
export const PROFORMA_ROWS = 22;

/* The room their paper leaves between the line the order is signed for and the
   contact strip, for the stamp and the signature to be put in once it is
   printed — about five-eighths of an inch, in points. */
export const SIGN_PT = 44;

/* The contact strip is set small and close, not on the row the rest of the
   sheet is ruled to. */
export const FOOT_PT = 11;

/* Who the order is signed for, as their form sets it — in capitals, above the
   space their stamp and signature go in. */
export const forLine = (b) => `FOR ${b.name || ""}${b.brand ? ` T/A ${b.brand}` : ""}`.toUpperCase();

/* The month the goods are due — their form names it, in capitals. */
export const deliveryMonth = (ctx) => (ctx.inv.date
  ? new Date(ctx.inv.date).toLocaleDateString("en-GB", { month: "long", year: "numeric" }).toUpperCase() : "");

/* What one line is priced at: per piece as quoted, or per hundred. */
export const proformaRate = (r) => (fobModeOf(r.it) === "piece" ? r.fobPc : r.fobPc * 100);

/* The buyer's own contact strip, as the four centred lines their form ends on:
   who they are, where they are and how to call them set close together, then
   their web and email a line below — `spaced` is that line's own break, which
   their paper leaves. A line with nothing in it is left out rather than
   printed empty. */
export function proformaFooter(b) {
  const join = (parts, sep) => parts.filter(Boolean).join(sep);
  return [
    { text: join([b.name, b.abn && `ABN ${b.abn}`, b.acn && `ACN ${b.acn}`], " - ") },
    { text: join([b.addr, b.poBox], " * ") },
    { text: join([b.tel && `Tel : ${b.tel}`, b.fax && `Fax : ${b.fax}`], " * ") },
    { text: join([b.web && `Web : ${b.web}`, b.email && `Email : ${b.email}`], " * "), spaced: true },
  ].filter((l) => l.text);
}

/* Setup's upload keeps the buyer's mark as a data: URL — decoded here into the
   raw bytes a oneCellAnchor picture wants, the same shape logo.js builds for
   the exporter's own mark. It is anchored to sit above their name, roughly
   centred on the four columns the name is centred on, and stands about the
   five-eighths of an inch it stands on their own paper. */
export const LOGO_CY = 553000;              // EMU, 914400 to the inch
export const PROFORMA_COL_EMU = 766762;     // one column of the eight, at 11.5 characters

/* A PNG carries its pixel size in the IHDR chunk, at a fixed offset; a JPEG
   does not, so one is taken as square and the sheet shows it a shade wide
   rather than refusing to place it. */
export function pngAspect(data) {
  const be = (o) => (data[o] << 24 | data[o + 1] << 16 | data[o + 2] << 8 | data[o + 3]) >>> 0;
  if (data.length < 24 || data[0] !== 0x89 || data[1] !== 0x50) return 1;
  const w = be(16), h = be(20);
  return w && h ? w / h : 1;
}

export function buyerLogoImage(b) {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(b.logo || "");
  if (!m) return null;
  const ext = m[1].toLowerCase() === "jpg" ? "jpeg" : m[1].toLowerCase();
  const bin = atob(m[2]);
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  const cx = Math.round(LOGO_CY * pngAspect(data));
  // Centred on columns A–D, which is where their name sits under it.
  const left = Math.round((PROFORMA_COL_EMU * 4 - cx) / 2);
  return {
    data,
    ext,
    col: Math.floor(left / PROFORMA_COL_EMU),
    colOff: left % PROFORMA_COL_EMU,
    row: 0,
    rowOff: 20000,
    cy: LOGO_CY,
    cx,
  };
}

/* Doc 18 · Custom invoice — against 18-Custom Invoice.xlsx, the copy of the
   invoice that travels to customs with the shipping bill.

   Their file is three sheets. Page1 and Page2 are the printed form, one A4
   each at 72% and centred across the paper; Annx is the annexure customs asks
   for, every line's FOB against its net weight so the rate per kilo can be
   checked. The form is eleven columns wide and ruled as one continuous frame:
   solid down the columns, hairline between the goods, so a band of items reads
   as one block rather than a row of boxes.

   The goods are banded by what they are, priced on the band's own basis — per
   piece for the pipes and the cartons, per hundred for the moulded fittings —
   with the HSN code in the band heading, because the GST breakup at the foot
   of Page2 is totalled by code. Page1 carries its running value down as
   "Total C/F Page :2" and Page2 brings it back as "BAL B/F", which is how
   their book adds up; the grand totals, the breakup and the amount in words
   all sit on Page2.

   Everything on it stays live. Only the pieces and the rate are typed: the
   amount, the taxable value, the rupee rate and the GST are formulas off them,
   so a corrected quantity re-totals both pages and the breakup with them. The
   head of Page2 is a reference back to Page1, cell for cell, as their own
   sheet has it — the two pages cannot then drift apart. The one thing not
   copied is their taxable column, which is pasted in as constants; written as
   `amount x exchange rate` it prints the same figures and keeps the chain
   whole. */

/* Their number formats, off the reference file: dollars and rupees that print
   nothing at all in an empty cell (the ";;@" tail), and a whole-number percent
   for the GST rate. */
export const CI_USD = '"$"0.00;\\-0.00;;@';

export const CI_USDT = '"$"0.00;\\-"$"0.00;;@';

export const CI_PCT = "0%";

export const CI_PLAIN = "0.00;\\-0.00;;@";

/* The form's own frame. Page1 holds this many lines of goods between the head
   of the invoice and the carried-forward total, Page2 this many between the
   brought-forward line and the totals; a band's heading and its column header
   each take one of them, as they do on their sheet. */
export const CI_P1_BODY = 56;

/* The buyer's copy (31) draws one line fewer on Page1 than the customs copy
   does, so its carried-forward total and the declaration under it stand a row
   higher. Take the customs figure for both and the whole foot of the buyer's
   invoice sits a line low. */
export const CI_P1_BODY_BUYER = 55;

export const CI_P2_BODY = 49;

export const CI_P1_TOP = 26;                  // first row of Page1's goods frame
export const CI_P2_TOP = 26;                  // and of Page2's
/* The breakup at the foot of Page2 has a line per HSN code, and their form
   leaves room for the three they ship under. Fewer than that still takes the
   three lines — blank, but ruled — so the total, the two lines of words and
   the declaration stay on the rows the form prints them on. More than three
   and the block has to grow, which is better than leaving a code off it. */
export const CI_HSN_ROWS = 3;

/* The bands their invoice prints, in its order — the same five families the
   buyer's own purchase order (17) bands by, headed as customs wants them and
   with the HSN code the breakup totals by. */
export const CI_BANDS = [
  ["mxm", "PLASTIC (PP) EXTRUDED PIPES : BOTH SIDE THREADED PIPES"],
  ["mxf", "PLASTIC (PP) EXTRUDED PIPES : M / F THREADED PIPES"],
  ["ppm", "PLASTIC (PP) MOULDED FITTINGS"],
  ["grn", "PLASTIC (PA) MOULDED FITTINGS"],
  ["box", "CORRUGATED BOXES"],
];

/* The buyer's own invoice (31) bands by the same five families under the trade
   names its papers use, and heads them without the HSN code — that is customs'
   business, not the buyer's. */
export const CI_BUYER_BANDS = [
  ["mxm", "PP EXTRUDED PIPES : BOTH SIDE THREADED PIPES"],
  ["mxf", "PP EXTRUDED PIPES : M / F THREADED PIPES"],
  ["ppm", "PP MOULDED FITTINGS"],
  ["grn", "NYLON MOULDED FITTINGS"],
  ["box", "CORRUGATED BOXES"],
];

export function invoiceBands(ctx, labels = CI_BANDS) {
  const by = new Map();
  L(ctx).forEach((r) => {
    const k = familyOf(r.it);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  });
  const named = labels !== CI_BANDS;
  return labels.filter(([k]) => by.has(k)).map(([k, label]) => {
    const rows = by.get(k);
    const per100 = commonOf(rows, (r) => fobModeOf(r.it)) !== "piece";
    const hsn = hsnText(rows[0].it);
    return {
      key: k, rows, hsn, per100, label,
      head: hsn && !named ? `${label} (HSN CODE : ${hsn})` : label,
      // The pipes carry a length; the fittings do not, and the cartons give
      // the size that column as well — their size is three dimensions.
      len: k !== "box" && rows.some((r) => String(r.it.length || "").trim()),
      wide: k === "box",
      rate: per100 ? "PER 100 PCS" : "PER PC",
      size: k === "box" ? "SIZE ( MM)" : "SIZE (IN / MM)",
    };
  });
}

/* One line of the frame per heading, per column header and per item, split
   over the two pages. A band cut by the page break picks its heading and its
   columns back up at the top of the next one, as their form does; a band whose
   columns match the band above it does not repeat them. */
export function invoiceLayout(bands, body = CI_P1_BODY) {
  const all = [];
  let shape = null;
  bands.forEach((band) => {
    const sig = `${band.len}|${band.wide}|${band.rate}`;
    all.push({ kind: "head", band });
    if (sig !== shape) { all.push({ kind: "cols", band }); shape = sig; }
    band.rows.forEach((r) => all.push({ kind: "item", band, r }));
  });
  const p1 = all.slice(0, body);
  let p2 = all.slice(body);
  if (p2.length) {
    const band = p2[0].band;
    if (p2[0].kind === "item") p2 = [{ kind: "head", band }, { kind: "cols", band }, ...p2];
    else if (p2[0].kind === "cols") p2 = [{ kind: "head", band }, ...p2];
    else if (p2[1]?.kind !== "cols") p2 = [p2[0], { kind: "cols", band }, ...p2.slice(1)];
  }
  return { p1, p2 };
}

/* Page2's frame is as deep as their form draws it, or deeper if the goods need
   it. A consignment longer than the two pages hold runs the second one on and
   pushes its totals down rather than losing the lines off the end — the paper
   grows, the invoice stays whole. */
export const ciP2Body = (p2) => Math.max(CI_P2_BODY, p2.length);

/* Where a given HSN's goods sit, as the few contiguous runs of rows a SUM can
   name — a code can be split over two bands and both pages, which is why the
   breakup's formulas are built rather than written. */
export function lineRuns(lines, top, ok) {
  const runs = [];
  lines.forEach((l, i) => {
    if (l.kind !== "item" || !ok(l)) return;
    const at = top + i, last = runs[runs.length - 1];
    if (last && at === last[1] + 1) last[1] = at; else runs.push([at, at]);
  });
  return runs;
}

export const hsnRuns = (lines, top, hsn) => lineRuns(lines, top, (l) => l.band.hsn === hsn);

export const rangeRefs = (runs, col, sheet) =>
  runs.map(([a, b]) => `${sheet ? `${sheet}!` : ""}${col}${a}:${col}${b}`).join(",");

/* The amount in words, as the invoice states it twice — the dollars in
   international scale, the rupees in lakh and crore. */
export const W_ONES = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN",
  "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];

export const W_TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

export const words99 = (n) => (n < 20 ? W_ONES[n]
  : [W_TENS[Math.floor(n / 10)], W_ONES[n % 10]].filter(Boolean).join(" "));

export const words999 = (n) => [Math.floor(n / 100) ? `${W_ONES[Math.floor(n / 100)]} HUNDRED` : "", words99(n % 100)]
  .filter(Boolean).join(" ");

export function wordsBy(n, scales) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (!n) return "ZERO";
  const out = [];
  scales.forEach(([v, name]) => {
    const q = Math.floor(n / v);
    if (q) { out.push(`${words999(q)} ${name}`); n -= q * v; }
  });
  if (n) out.push(words999(n));
  return out.join(" ");
}

export const wordsIntl = (n) => wordsBy(n, [[1e9, "BILLION"], [1e6, "MILLION"], [1e3, "THOUSAND"]]);

export const wordsIndian = (n) => wordsBy(n, [[1e7, "CRORE"], [1e5, "LAKH"], [1e3, "THOUSAND"]]);

/* The fraction is read out as its own two digits — ninety cents, not nine. */
export const fracOf = (n) => Math.round((Math.abs(Number(n) || 0) % 1) * 100);

export function amountWords(n, unit, part, indian) {
  const whole = (indian ? wordsIndian : wordsIntl)(n);
  const f = fracOf(n);
  return `${unit} ${whole}${f ? ` AND ${part} ${words99(f)}` : ""} ONLY`;
}

/* The goods as the invoice describes them in prose — the families it actually
   carries, wrapped to the width of the box it is typed into. */
export const CI_DESCRIBE = {
  mxm: "PLASTIC (PP) EXTRUDED PIPES", mxf: "PLASTIC (PP) EXTRUDED PIPES",
  ppm: "PLASTIC (PP) MOULDED FITTINGS", grn: "PLASTIC (PA) MOULDED FITTINGS",
  box: "CORRUGATED BOXES",
};

/* A line of prose broken to the width of the box it is typed into, and given
   back as the fixed number of lines that box has — a short description leaves
   the rest of them blank rather than shortening the box. */
export function wrapTo(text, width, lines) {
  const out = [];
  String(text || "").split(/\s+/).filter(Boolean).forEach((w) => {
    const at = out.length - 1;
    if (at >= 0 && `${out[at]} ${w}`.length <= width) out[at] += ` ${w}`;
    else out.push(w);
  });
  /* Nothing is ever dropped. What will not fit in the lines the box has runs
     on along the last of them — the cell is set to shrink, so it is squeezed
     into the box rather than lost off the end of it. */
  if (out.length > lines) out.splice(lines - 1, out.length, out.slice(lines - 1).join(" "));
  return Array.from({ length: lines }, (_, i) => out[i] || "");
}

export function goodsWrapped(bands, width, lines) {
  const seen = [];
  bands.forEach((b) => { const t = CI_DESCRIBE[b.key]; if (t && !seen.includes(t)) seen.push(t); });
  return wrapTo(seen.join(", "), width, lines);
}

/* An entry that is all digits is a figure on their sheets rather than a label —
   a customs tariff number, a metric size, a length in millimetres — and is
   written back as one. Anything else (a part code, an inch size like 1/2") is
   text, as it has to be. */
export const numOrText = (v, s) => (/^\d+$/.test(String(v || "").trim())
  ? { v: Number(v), t: "n", s } : { v: String(v || ""), s });

export const ciMarks = (ctx, rows) => {
  const s = ctx.inv.ship || {};
  const start = Number(ctx.inv.serialStart) || marksStart(ctx);
  const boxes = sum(rows, "boxes");
  const prefix = String(s.marks || "").replace(/[\d\-–\s]+/g, " ").trim() || "GDW";
  return { prefix, start, end: start + Math.max(0, boxes - 1) };
};

/* The letterhead mark on the customs books (18 and 19). Both files anchor it in
   the same place — just inside the top left corner of the form, three quarters
   of an inch square, with the exporter's name set right against it, which is
   why that whole block is typed right-aligned. Sizes are EMU, 914400 to the
   inch. Null while the image is still loading, and the form simply prints
   without it, as it did before. */
export const CI_LOGO = { col: 0, colOff: 66675, row: 1, rowOff: 76200, cx: 733425, cy: 733425 };

export const formLogo = (place = {}) => {
  const img = logoImage();
  return img ? { ...img, ...CI_LOGO, ...place } : null;
};

/* Doc 19 · Packing list — against 19-Packing-List.xlsx, the list that travels
   with the customs invoice and tells the port what is in each package.

   Their file is two sheets, one A4 each at 86%, nine columns wide and ruled as
   one continuous frame: solid down the columns, hairline between the goods.
   The head of it is the customs invoice's head over again — the same boxes in
   the same order — because the two are typed out of the one book.

   The goods are banded by what they are, and a band is headed with the columns
   it actually needs: the pipes carry a length and travel in packages, the
   moulded fittings have no length and travel in cartons, and the cartons
   themselves go in bundles — which is why the same quantity column is headed
   three different ways down the one form. Page 1 carries its running weight
   down as "BALANCE C/F…." and page 2 brings it back as "BAL B/F…", typed on
   the same line as the band it carries on with rather than on one of its own;
   the total and the break-up of weights by material sit at the foot of page 2.

   Everything on it stays live. Only the pieces and the packing are typed: the
   package count is their own `pieces / qty per package`, and the two weights
   are that package count against the master's weight per package — so a
   corrected quantity re-totals its line, both pages and the break-up with it.
   The head of page 2 is a reference back to page 1, cell for cell, as their
   own sheet has it; the two pages cannot then drift apart. */

/* Their weights are typed to three places and carry no separators at all. */
export const PL_WT = "0.000";

/* The bands their list prints, in its order — the same five families the
   customs invoice (18) bands by, with the package each family travels in.
   The noun changes down the form and the quantity column is headed after it. */
export const PL_BANDS = [
  ["mxm", "PLASTIC (PP) EXTRUDED PIPES : BOTH SIDE THREADED PIPES", "PKGS", "Qty/Pkg-Pcs"],
  ["mxf", "PLASTIC (PP) EXTRUDED PIPES : M / F THREADED PIPES", "PKGS", "Qty/Pkg-Pcs"],
  ["ppm", "PLASTIC (PP) MOULDED FITTINGS", "CARTONS", "Qty/Ctn-Pcs"],
  ["grn", "PLASTIC (PA) MOULDED FITTINGS", "CARTONS", "Qty/Ctn-Pcs"],
  ["box", "CORRUGATED BOXES", "BUNDLES", "Qty/BDL-Pcs"],
];

/* The buyer's copy of the list (32) heads the same five under the trade names
   its papers use, as its invoice (31) and its declaration (33) do. */
export const PL_BUYER_BANDS = PL_BANDS.map(([k, head, pkg, per]) => [k,
  head.replace("PLASTIC (PP) ", "PP ").replace("PLASTIC (PA) MOULDED FITTINGS", "NYLON MOULDED FITTINGS"),
  pkg, per]);

/* The break-up at the foot of page 2 totals by material rather than by band:
   the two threads of extruded pipe are one line of it, as their sheet has it.
   All four lines are printed whether or not the shipment carries them, because
   the form is a fixed block and a nil line is the honest answer. */
export const PL_WEIGHTS = [
  ["PLASTIC (PP) EXTRUDED PIPES", ["mxm", "mxf"]],
  ["PLASTIC (PP) MOULDED FITTINGS", ["ppm"]],
  ["PLASTIC (PA) MOULDED FITTINGS", ["grn"]],
  ["CORRUGATED BOXES", ["box"]],
];

/* The form's own frame. Page 1 holds this many lines of goods between the head
   of the list and the weight it carries forward; page 2 opens on the line that
   brings it back and holds this many under it. A band's heading and its column
   header each take one of them, as they do on their sheet. */
export const PL_TOP = 25;                     // first row of the goods frame, both pages
export const PL_P2_TOP = 26;                  // page 2's first goods line — 25 is the B/F

/* Two of the client's books are typed on this one form: the packing list that
   travels with the customs invoice (19) and the same list with the item-wise
   packing details behind it (20). Same grid, same head, same frame — what
   differs is how deep each page is ruled, how the order is stated across the
   head of it, and what page 2 closes on. The item-wise book types the whole run
   of purchase orders into the order box and spends its last page on the four
   detail tabs, so it carries no break-up of weights; the list book states one
   order and totals the weights by material at the foot.

   `body` is the lines of goods a page holds, and `scale` what each page is
   printed at — theirs is set to fit the paper, and a deeper page is set
   smaller. Column F is a shade wider in the item-wise book. */
export const PL_FORMS = {
  19: { p1Body: 45, p2Body: 42, scale: [86, 86], colF: [9.33203125, 9.33203125], orders: "ref", breakup: true },
  20: { p1Body: 51, p2Body: 46, scale: [79, 81], colF: [10.1640625, 10.6640625], orders: "list", breakup: false },
  /* 32 · the buyer's copy of the list. The same frame as 19, headed with the
     buyer's own run of orders as 20 is, the goods under the trade names the
     buyer's papers use, no break-up of the weights at the foot — and signed and
     stamped, because this copy goes out rather than to customs. */
  32: { p1Body: 45, p2Body: 42, scale: [86, 86], colF: [9.33203125, 9.33203125], orders: "list", breakup: false, buyer: true, signed: true },
};

/* A consignment longer than the two pages hold runs page 2 on and pushes its
   totals down rather than losing the lines off the end. */
export const plP2Body = (p2, form) => Math.max(form.p2Body, p2.length);

/* Rows 4-7 of the head, right of the letterhead: the order the goods were
   bought on, as [label, answer, [label edges, answer edges]].

   The list book (19) names the buyer's own order with the reference under it,
   each on its own pair of ruled lines. The item-wise book (20) has four papers
   behind it that have to be read against the orders they came off, so it gives
   the whole box to the run of purchase orders — labelled once, ruled as one
   block, and broken over the four lines their file breaks it over. */
export const plOrderBox = (ctx, form, orderRef, s) => (form.orders === "list"
  ? wrapTo(poHeaderList(ctx), 40, 4).map((line, i) => [
    i === 0 ? "Buyers Order No: " : "", line,
    i === 0 ? ["lt", "lrt"] : i === 3 ? ["lb", "lrb"] : ["l", "lr"]])
  : [["Buyers Order No: ", orderRef, ["lt", "lrt"]], ["", "", ["lb", "lrb"]],
    ["Other Reference(s):", s.otherRef || "", ["lt", "lrt"]], ["", "", ["lb", "lrb"]]]);

export function packingBands(ctx, buyer = false) {
  const by = new Map();
  L(ctx).forEach((r) => {
    const k = familyOf(r.it);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  });
  return (buyer ? PL_BUYER_BANDS : PL_BANDS).filter(([k]) => by.has(k)).map(([key, head, pkg, per]) => {
    const rows = by.get(key);
    // The pipes carry a length in its own column; a family that has none gives
    // the size that column as well, which is what the cartons need — theirs is
    // three dimensions.
    const len = rows.some((r) => String(r.it.length || "").trim());
    return { key, rows, head, pkg, per, len, size: len ? "SIZE (MM/IN)" : "SIZE (MM)" };
  });
}

/* What a band's column header says. Two bands that say the same thing do not
   need it ruled twice over a page break. */
export const plShape = (band) => `${band.len}|${band.pkg}|${band.per}`;

/* One line of the frame per band heading, per column header and per item, in
   the order the form prints them, split over the two pages. */
export function packingLayout(bands, form) {
  const all = [];
  bands.forEach((band) => {
    all.push({ kind: "head", band });
    all.push({ kind: "cols", band });
    band.rows.forEach((r) => all.push({ kind: "item", band, r }));
  });
  let p1 = all.slice(0, form.p1Body);
  let p2 = all.slice(form.p1Body);
  if (!p2.length) return { p1, carry: null, p2 };
  const carry = p2[0].band;
  /* A heading left at the foot of page 1 with nothing under it heads nothing:
     it goes over the break with its band and the line it sat on is left blank,
     as their sheet leaves it. Either way page 2 types that heading on the line
     the balance is brought forward on rather than spending another on it. */
  if (p2[0].kind === "cols") p1 = p1.slice(0, -1);
  else if (p2[0].kind === "head") p2 = p2.slice(1);
  /* The columns are ruled again only where their shape changed over the break —
     the reader has just seen them at the foot of page 1. */
  const held = [...p1].reverse().find((l) => l.kind === "cols");
  if (p2[0]?.kind === "cols" && held && plShape(held.band) === plShape(carry)) p2 = p2.slice(1);
  return { p1, carry, p2 };
}

/* What is inside the packages, worded as their packing list words it — the two
   moulded families named together, "(PP) & (PA) MOULDED FITTINGS", so the whole
   description still fits the two lines the form types it on. The customs
   invoice (18) spells them out separately; this is the same goods, their
   shorter phrase for them. */
/* The same goods as the buyer's own papers name them (31, 33) — their invoice
   and their copy of the declaration call the pipes and the fittings by the
   trade names, where customs wants the material spelled out. */
export function buyerGoods(bands) {
  const has = (k) => bands.some((x) => x.key === k);
  const moulded = [has("ppm") && "PP", has("grn") && "NYLON"].filter(Boolean).join(" & ");
  const parts = [
    (has("mxm") || has("mxf")) && "PP EXTRUDED PIPES",
    moulded && `${moulded} MOULDED FITTINGS`,
    has("box") && "CORRUGATED BOXES",
  ].filter(Boolean);
  return parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} & ${parts.at(-1)}`;
}

export function packingGoods(bands) {
  const has = (k) => bands.some((x) => x.key === k);
  const moulded = [has("ppm") && "(PP)", has("grn") && "(PA)"].filter(Boolean).join(" & ");
  const parts = [
    (has("mxm") || has("mxf")) && "PLASTIC (PP) EXTRUDED PIPES",
    moulded && `PLASTIC ${moulded} MOULDED FITTINGS`,
    has("box") && "CORRUGATED BOXES",
  ].filter(Boolean);
  // Their prose joins the list with commas and the last of it with "&".
  return parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} & ${parts.at(-1)}`;
}

/* The consignment as the form describes it in prose — what it is made up of
   and what is inside it, broken over the two lines their form types it on. */
export const packingDescribe = (ctx, bands, rows, buyer = false) => wrapTo(
  `${ctx.inv.ship?.pkgs || `${sum(rows, "boxes")} PACKAGES`} CONTAINING ${(buyer ? buyerGoods : packingGoods)(bands)}`,
  70, 2,
);

/* ---------- Doc 20 · Packing list with item-wise packing details -------------
   Against 20-Packing List with item wise Packing Details.xlsx.

   The first two sheets are the packing list itself — the same form as 19, ruled
   deeper and headed with the whole run of purchase orders (see PL_FORMS). What
   makes this a different document is the four sheets behind it: the make-up of
   every line, family by family, as the factory packed it.

   They are not four copies of one grid. Their file gives each family the columns
   that family actually needs — the risers carry a length and are banded by the
   size they belong to, the moulded fittings are a flat list, the nylon range has
   no length at all, and the cartons are measured in three dimensions instead of
   one size — so each tab states its own columns below and one builder rules
   whatever it is given.

   Everything on them stays live: the packages are pieces over what one package
   holds, and both columns are totalled with SUBTOTAL, so a filtered tab
   re-totals itself the way their sheet does.                                 */

/* Their sheets set the exporter's own codes in green and the buyer's part
   numbers in plain black — the part numbers are all digits, which is what tells
   the two apart. */
export const houseCode = (v) => !/^\d+$/.test(String(v || "").trim());

export const DT = {                                     // 20 · the detail tabs' styles
  po: { font: "refb", border: "b", valign: "center" },
  poW: { font: "refb", border: "b", valign: "center", wrap: true },
  head: { font: "refb", border: "box", align: "center", valign: "center" },
  headL: { font: "refb", border: "box", align: "left", valign: "center" },
  band: { font: "refb11", border: "box", align: "left", valign: "center" },
  ctr: { font: "ref", border: "box", align: "center", valign: "center" },
  ctrB: { font: "refb", border: "box", align: "center", valign: "center" },
  // The nylon range is typed plain all the way across, codes included.
  left: { font: "ref", border: "box", align: "left", valign: "center" },
  desc: { font: "ref", border: "box", align: "left", valign: "center", wrap: true },
  descB: { font: "refb", border: "box", align: "left", valign: "center", wrap: true },
  qty: { font: "ref", border: "box", valign: "center" },
  foot: { font: "ref", border: "t", valign: "center" },
  tot: { font: "refb", border: "box", valign: "center" },
};

/* The identity columns of a line, in whichever ink the line calls for — the
   whole block takes its colour from the item's own code, so a part number the
   buyer numbers reads black across all of them rather than only in the column
   the number happens to sit in. */
export const dtCode = (align) => (r) => ({
  font: houseCode(r.it.code) ? "refgd" : "refb", border: "box", align, valign: "center",
});

export const dtCodeL = dtCode("left"), dtCodeC = dtCode("center");

/* The paper their detail tabs are printed on — landscape A4, and as tight to
   the edge as the list itself. */
export const DT_MARGIN = { left: 0.393701, right: 0.393701, top: 0.393701, bottom: 0.393701, header: 0, footer: 0 };

/* A carton is measured across three dimensions where every other item has one
   size, and the master holds them as it writes them — "570 X 368 X 178". */
export const boxDims = (it) => {
  const parts = String(it.size || "").split(/\s*[x×*]\s*/i).map((p) => p.trim()).filter(Boolean);
  const all = parts.length > 1 ? parts : [...parts, String(it.length || "").trim()].filter(Boolean);
  return [all[0] || "", all[1] || "", all[2] || ""];
};

/* The four tabs, in the order their workbook runs them. `keys` are the families
   (see familyOf) each one gathers, `band` the heading its goods are grouped
   under — only the risers are banded, and the rest are one list.

   A column is { h, sub, span, w, get, s }: `h` is the heading it takes on the
   first header line, `sub` the one under it, and `sub: null` runs the heading
   down over both. `span` is how many columns a heading covers — the column it
   covers then gives its own `sub` and nothing else. `pcs` marks the pieces
   column, `per` what one package holds, and `pkg` the packages the two work
   out between them. `labelCols` is how far the band's name runs along the
   identity columns their sheet types it into. */
export const PL20_TABS = [
  {
    name: "Risers", keys: ["mxm", "mxf"], scale: 74, fitH: 0, labelCols: 2,
    band: (r) => String(r.it.group || "").trim(),
    cols: [
      { h: "CODE", sub: "", w: 15.6640625, get: (r) => r.it.code, s: dtCodeL },
      { h: "GD CODE", sub: "", w: 14.6640625, get: (r) => r.it.gd, s: dtCodeL },
      { h: "GL CODE", sub: null, w: 15.6640625, get: (r) => r.it.gl, s: dtCodeC },
      { h: "SIZE", sub: "MM / IN", w: 9, get: (r) => r.it.size, s: DT.ctr },
      { h: "LENGTH", sub: "MM", w: 10, get: (r) => r.it.length, s: DT.ctr },
      { h: "PACKING", span: 2, sub: "UNIT", w: 7, get: (r) => r.it.packUnit, s: DT.ctr },
      { sub: "BOX", w: 7.1640625, get: (r) => r.packing, s: DT.ctr, per: 1 },
      { h: "DESCRIPTION", sub: null, w: 29.33203125, get: (r) => r.it.description, s: DT.descB },
      { h: "QUANTITY", span: 2, sub: "PCS", w: 10.6640625, pcs: 1, s: DT.qty },
      { sub: "BOX", w: 10.6640625, pkg: 1, s: DT.qty },
    ],
  },
  {
    name: "PP Fittings", keys: ["ppm"], scale: 92, head: [19.5, 19.5],
    margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0, footer: 0 },
    cols: [
      { h: "CODE", sub: "", w: 15.6640625, get: (r) => r.it.code, s: dtCodeL },
      { h: "GL CODE", sub: "", w: 15.6640625, get: (r) => r.it.gl, s: dtCodeC },
      { h: "SIZE", sub: "MM", w: 6, get: (r) => r.it.size, s: DT.ctrB },
      { h: "LENGTH", sub: "MM", w: 10, get: (r) => r.it.length, s: DT.ctrB },
      { h: "PACKING", span: 2, sub: "UNIT", w: 7, get: (r) => r.it.packUnit, s: DT.ctr },
      { sub: "BOX", w: 7.33203125, get: (r) => r.packing, s: DT.ctr, per: 1 },
      { h: "DESCRIPTION", sub: "", w: 38.1640625, get: (r) => r.it.description, s: DT.desc },
      { h: "Quantity", span: 2, sub: "Pcs", w: 8.1640625, pcs: 1, s: DT.qty },
      { sub: "Box", w: 8.5, pkg: 1, s: DT.qty },
    ],
  },
  {
    name: "Nylon Fittings", keys: ["grn"], scale: 96, head: [27, 20.1], poHeight: 30,
    cols: [
      { h: "GD CODE", sub: "", w: 14.6640625, get: (r) => r.it.gd, s: DT.left },
      { h: "GL CODE", sub: "", w: 14.6640625, get: (r) => r.it.gl, s: DT.ctr },
      { h: "SIZE", sub: "MM", w: 6.5, get: (r) => r.it.size, s: DT.ctr },
      { h: "PACKING", span: 2, sub: "UNIT", w: 6, get: (r) => r.it.packUnit, s: DT.ctr },
      { sub: "BOX", w: 7.1640625, get: (r) => r.packing, s: DT.ctr, per: 1 },
      { h: "DESCRIPTION", sub: "", w: 29.33203125, get: (r) => r.it.description, s: DT.desc },
      { h: "QUANTITY", span: 2, sub: "PCS", w: 10.6640625, pcs: 1, s: DT.qty },
      { sub: "BOX", w: 10.6640625, pkg: 1, s: DT.qty },
    ],
  },
  {
    name: "Boxes", keys: ["box"], scale: 81, labelCols: 1,
    margins: { left: 0.25, right: 0.25, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    /* The cartons' line under the CODE column is what the board is, not a size
       band, and it is the same for the whole sheet. The master has no field for
       it, so it is the form's own words unless the group names the board. */
    spec: (rows) => {
      const g = String(rows[0]?.it.group || "").trim();
      return /ply|flute/i.test(g) ? g : "3 PLY BROAD FLUTE";
    },
    cols: [
      { h: "CODE", sub: "", w: 23.33203125, get: (r) => r.it.code, s: DT.headL },
      { h: "SIZE", span: 3, sub: "MM", w: 6.5, get: (r) => boxDims(r.it)[0], s: DT.ctr },
      { sub: "MM", w: 9.6640625, get: (r) => boxDims(r.it)[1], s: DT.ctr },
      { sub: "MM", w: 4.83203125, get: (r) => boxDims(r.it)[2], s: DT.ctr },
      { h: "PACKING", sub: "S/W BDL", w: 11, get: (r) => r.packing, s: DT.ctr, per: 1 },
      { h: "DESCRIPTION", sub: "", w: 29.33203125, get: (r) => r.it.description, s: DT.descB },
      { h: "QUANTITY", span: 2, sub: "PCS", w: 10.6640625, pcs: 1, s: DT.qty },
      { sub: "BDL", w: 10.6640625, pkg: 1, s: DT.qty },
    ],
  },
];

/* The orders a tab's goods were bought on, headed as their sheet heads it —
   only the orders that family actually came off, in the order they were
   raised. */
export function poListFor(ctx, rows) {
  const when = new Map();
  ctx.buyerMaster.forEach((r) => { if (!when.has(r.po)) when.set(r.po, r.date); });
  const mine = [...new Set(rows.flatMap((r) => r.pos || []))]
    .sort((a, b) => String(when.get(a) || "").localeCompare(String(when.get(b) || "")));
  const list = mine.map((po) => `${po}${when.get(po) ? ` DT ${ddmm(when.get(po))}` : ""}`).join(", ");
  return list ? `PO NO${mine.length > 1 ? "S" : ""} : ${list}` : "";
}

/* The goods a tab carries, grouped as it groups them: one run of items when the
   tab is a flat list, a run per band when it is not. */
export function detailGroups(tab, rows) {
  if (!tab.band) return [{ label: "", rows }];
  const by = new Map();
  rows.forEach((r) => {
    const k = tab.band(r);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  });
  return [...by.entries()].map(([label, list]) => ({ label, rows: list }));
}

/* ---------- Doc 21 · Packing declaration -----------------------------------
   Against 21-Packaging Declaration.xlsx, and its twin 33-Packaging
   Declaration-Buyer.xlsx — the same form, one kept for the file and one sent
   to the buyer, which is why both numbers are printed from this one builder.

   It is the declaration Australia's Department of Agriculture wants with every
   consignment: what the goods are packed in, whether any of it is timber or
   bamboo, how that timber was treated if there is any, and that the container
   was clean. Not a table — a printed form on the exporter's letterhead, typed
   in Arial 10 with a box against each answer and an X in the one that applies.

   Only the head of it changes with the shipment: the vessel and its voyage,
   the bill of lading and its date, the container, and the marks and packages
   the consignment is made up of. The answers below do not: this exporter's
   goods travel in cartons and HDP bundles, so no unacceptable material and no
   timber or bamboo is used, and the treatment questions that follow from
   timber are therefore not applicable. Their own copies answer them exactly
   so, and a declaration that claimed otherwise would be a false one.

   Their working copy highlights the cells the operator fills — green over the
   vessel and the bill, yellow over the marks and the date. The copy that
   actually goes to the buyer (33) carries no highlighting at all, and neither
   does this: every one of those cells is filled from the invoice already.

   The form is described once, as runs across its ten columns, and the page and
   the worksheet are both laid out from that description.                    */

/* Their letterhead stands over the first eight rows of the form, running a
   little way into the last of them. Nothing in it is ruled on cells: the
   printed block and the frame beside it both float over those rows, so neither
   is held to a column edge. */
export const PKD_HEAD = 8;

export const PKD = {
  ttl: { font: "refb14", border: false, align: "center", valign: "center" },
  n: { font: "ref", border: false, valign: "center" },
  b: { font: "refb", border: false, valign: "center" },
  // A question ruled along to the box that answers it, as their form rules it.
  lead: { font: "ref", border: "r", valign: "center" },
  box: { font: "ref", border: "box", align: "center", valign: "center" },
  c: { font: "ref", border: false, align: "center", valign: "center" },
};

export const PKD_CLASS = { ttl: "ttl", n: "", b: "b", lead: "lead", box: "bx", c: "c" };

/* Their letterhead is not typed into the sheet at all — it is a printed block
   floated over the head of it: five lines against the right margin, in three
   inks, with the name letter-spaced, and its own frame around it. Setting that
   in cells can only ever approximate it, so the block itself is what goes on,
   scanned off their letterhead and anchored where their text box sits, with the
   mark in a second frame beside it.

   These are the anchors their own file uses, in EMU (914400 to the inch), and
   the columns below are set so that a column here is as wide as a column there
   — which is what makes the block land where it lands on their paper. */
export const PKD_COL = 609346;                    // a column of their sheet, in EMU
export const PKD_COL_D = 761810;                  // the two it widens for Q2a's answers
export const PKD_COL_E = 733400;

export const PKD_ROW = 161925;                    // one row of it, 12.75pt

/* The ten columns, and the head of the form, in the same units — what the three
   blocks below are placed against, on the sheet and on the page alike. */
export const PKD_COL_W = [PKD_COL, PKD_COL, PKD_COL, PKD_COL_D, PKD_COL_E,
  PKD_COL, PKD_COL, PKD_COL, PKD_COL, PKD_COL];

export const PKD_COL_AJ = PKD_COL_W.reduce((a, b) => a + b, 0);  // A..J, in EMU
export const PKD_HEAD_CY = PKD_ROW * PKD_HEAD;                   // the eight rows it stands over

/* Where the three of them sit, read straight off the anchors in their own file.
   None is squared off to a column: the block is set in a little from the left
   margin and a little down from the top of row 1, there is a hair of air
   between it and the frame beside it, and that frame begins part way into
   column H and stops part way into J rather than reaching the right edge of the
   form. Round any of them to the nearest column edge and the letterhead comes
   out both wider and deeper than it is on their paper. */
export const PKD_ADDR = { col: 0, colOff: 66600, row: 0, rowOff: 95400 };

export const PKD_ADDR_CX = 4842360;               // to 371160 into column H

/* The frame the mark stands in is a second empty box beside the first, ruled
   the same and squared off with it at the foot. The mark sits inside it with a
   little air all round. */
export const PKD_MARK_BOX = { col: 7, colOff: 399960, row: 0, rowOff: 85680 };

export const PKD_MARK_BOX_CX = PKD_COL * 2 - PKD_MARK_BOX.colOff + 352080;  // to 352080 into J

export const PKD_MARK_BOX_CY = PKD_ROW * 7 + 47160 - PKD_MARK_BOX.rowOff;

export const PKD_MARK = { col: 7, colOff: 542880, row: 1, rowOff: 28440 };

export const PKD_MARK_CX = 898560;

export const PKD_MARK_CY = 894960;

/* The three of them measured out from the top left of the form instead of from
   the cell each is anchored to. The sheet places them by the anchor; the page
   has no cells to anchor to and places them by this, so the two come out
   alike. */
const pkdAt = (o, cx, cy) => ({
  x: PKD_COL_W.slice(0, o.col).reduce((a, b) => a + b, 0) + o.colOff,
  y: PKD_ROW * o.row + o.rowOff, cx, cy,
});

export const PKD_PLACE = {
  addr: pkdAt(PKD_ADDR, PKD_ADDR_CX),
  box: pkdAt(PKD_MARK_BOX, PKD_MARK_BOX_CX, PKD_MARK_BOX_CY),
  mark: pkdAt(PKD_MARK, PKD_MARK_CX, PKD_MARK_CY),
};

/* Arial's own character widths, per 1000 of the type size. Counting characters
   is not good enough to tell a line that genuinely will not fit from one that
   only looks tight — a line of capitals is half again as wide as the same
   number of narrow letters — and getting that wrong either cuts words off the
   form or widens columns that did not need it. Measured this way a line comes
   out within a per cent of what the printer draws. */
export const ARIAL_W = (() => {
  const w = {};
  const put = (chars, widths) => [...chars].forEach((c, i) => { w[c] = widths[i]; });
  put("ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    [667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611]);
  put("abcdefghijklmnopqrstuvwxyz",
    [556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500]);
  put("0123456789", [556, 556, 556, 556, 556, 556, 556, 556, 556, 556]);
  return Object.assign(w, {
    " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191,
    "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
    ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
    "[": 278, "\\": 278, "]": 278, "^": 469, _: 556, "`": 333, "{": 334, "|": 260, "}": 334, "~": 584,
  });
})();

export const arialPt = (text, size) => [...String(text || "")]
  .reduce((w, c) => w + (ARIAL_W[c] == null ? 556 : ARIAL_W[c]), 0) / 1000 * size;

/* Their sheet leaves every column but D and E at its own default width, and a
   width stated in the file renders at exactly that same size — so the eight are
   written as the default itself, not scaled off it. Anything else throws the
   form out of proportion: D and E are set to the answers they carry, and
   padding the other eight leaves those two relatively narrow.

   That fixes what a width unit is worth in points, since their own drawing
   anchors give a default column as PKD_COL. Measure a line against any other
   figure and the form is widened for text that already fitted, or a line is cut
   off at the edge of the merge it is typed across. */
export const PKD_DEFAULT_W = 8.6796875;

export const PKD_UNIT = PKD_COL / 12700 / PKD_DEFAULT_W;

/* The two lines not typed in Arial 10, as [size, the extra bold carries]. */
export const PKD_FONT = { ttl: [14, 1.06], b: [10, 1.06] };

/* What a line needs, in columns, with a little over so a line sized to exactly
   its own columns is not left to the rounding to decide whether it fits. */
export function pkdUnits(text, k) {
  const [size, bold] = PKD_FONT[k] || [10, 1];
  return (arialPt(text, size) * bold * 1.02) / PKD_UNIT;
}

/* The ten as their sheet sets them — the two the answers to Q2a sit against
   widened, the rest left at the default. */
export const PKD_BASE = [PKD_DEFAULT_W, PKD_DEFAULT_W, PKD_DEFAULT_W, 10.7109375, 10.28515625,
  PKD_DEFAULT_W, PKD_DEFAULT_W, PKD_DEFAULT_W, PKD_DEFAULT_W, PKD_DEFAULT_W];

/* A column width is stated in characters of whatever the workbook's normal
   style is set in. Their file's is Arial 10 and this one's is not, so the same
   number renders a little under five per cent narrower here than it does there
   — measured against their own printed sheet, column by column. The widths are
   worked out above at their size and scaled by this on the way into the file,
   so the form comes out theirs. All ten are scaled: pushing only the eight
   default ones out, as widening them to a bigger number would, holds the total
   roughly right and leaves D and E relatively narrow, which is what moves every
   answer box on the form off where their form puts it. */
export const PKD_SCALE = 1.0465;

/* The same correction for the two forms whose file is set in Times New Roman 10
   — the letter to the CHA (22) and the suppliers' details (23). A width stated
   in that face is wider than the same number in this workbook's own, so their
   columns are scaled by this on the way in. Measured against their sheets as
   PKD_SCALE is against the declaration's. */
export const TNR_SCALE = 0.944;

/* Their column widths are set to the text their own copy carries; ours can be
   longer — a buyer with a longer address, a consignment described in more
   words. A line typed across merged columns is clipped by the merge rather than
   running on into the next cell, so the columns a line is typed across are
   widened together until it fits. The proportions their sheet sets are kept:
   every column in a run grows by the same factor, so the two wider ones stay
   wider. The page is printed to fit, as their file is, so a form that has grown
   this way still comes off on one sheet of paper. */
export function pkdWidths(rows, base) {
  const w = base.slice();
  rows.forEach((r) => r.cells.reduce((at, [span, v, k]) => {
    // A single cell runs on across the empty ones beside it; only a merged run
    // is held to its own width.
    if (span < 2) return at + span;
    const text = v;
    const need = pkdUnits(text, k);
    let have = 0;
    for (let i = at; i < at + span; i++) have += w[i];
    if (need > have) {
      const grow = need / have;
      for (let i = at; i < at + span; i++) w[i] *= grow;
    }
    return at + span;
  }, 0));
  return w.map((x) => Math.round(x * PKD_SCALE * 1e6) / 1e6);
}

/* Their shipment carries the vessel and its voyage in one field — "CAPE SYROS
   VOYAGE 092E", or the voyage code run straight onto the name as "XIN MEI ZHOU
   167 E" — and the form asks for them in two boxes. The word "voyage" splits it
   where it is used; otherwise the trailing code does. */
export function vesselVoyage(vessel) {
  const t = String(vessel || "").trim();
  if (!t) return ["", ""];
  const named = /^(.*?)\s*\bvoyage\b\s*(.*)$/i.exec(t);
  if (named) return [named[1].trim(), named[2].trim()];
  const trailing = /^(.*?)\s+(\d+\s*[A-Za-z]?)$/.exec(t);
  return trailing ? [trailing[1].trim(), trailing[2].trim()] : [t, ""];
}

/* The packages a consignment is made up of, with the split their forms ask for
   — the corrugated boxes travel in HDP bundles and everything else in cartons.
   A consignment with no bundles simply states its packages, rather than
   printing a nil half of a sentence. The declaration (21) and the letter to the
   CHA (22) both name it, so it is worded once. */
export function packagesMade(rows) {
  const total = sum(rows, "boxes");
  const bundles = sum(rows.filter((r) => familyOf(r.it) === "box"), "boxes");
  const cartons = total - bundles;
  return bundles && cartons
    ? `${total} PACKAGES (${cartons} CARTONS & ${bundles} HDP BUNDLES)`
    : `${total} PACKAGES`;
}

/* The mark alone, as those same two forms name it: their marks read
   "GDW 6001-6461/461", and the prefix left once the serials are stripped out of
   that keeps the slash between them. */
export function marksNos(ctx, rows) {
  const marks = ciMarks(ctx, rows);
  const prefix = String(marks.prefix).replace(/[^A-Za-z0-9.]+$/, "");
  return `${prefix} NOS : ${marks.start} - ${marks.end} / ${marks.end}`;
}

export function pkdPackages(ctx, rows) {
  return `${marksNos(ctx, rows)} - ${packagesMade(rows)} CONTAINING `;
}

/* The declaration, and the buyer's copy of it (33). Their two files are the
   same form; the buyer's names the goods the way the buyer's papers name them
   and sets the foot of it plainly, where the customs copy sets it bold. */
export function pkd21Rows(ctx, { buyer = false } = {}) {
  const E = ctx.EXPORTER, s = ctx.inv.ship || {};
  const rows = L(ctx);
  const [vessel, voyage] = vesselVoyage(s.vessel);
  const R = (...cells) => ({ cells });
  const BLANK = { cells: [[10, "", "n"]] };
  // Cells left singly rather than merged, so a long label beside them runs on.
  const blank = (n) => Array.from({ length: n }, () => [1, "", "n"]);
  // The box an answer is ticked in, and the X that ticks it.
  const tick = (on) => [1, on ? "X" : "", "box"];

  return [
    /* Rows 1-8 carry the letterhead. Both blocks on it float over those rows
       rather than being typed into them, and each brings its own frame, so the
       rows themselves are left empty and unruled. */
    ...Array.from({ length: PKD_HEAD }, () => ({ cells: [[10, "", "n"]], lh: 1 })),
    BLANK,
    /* The title stands on a slightly deeper row in the buyer's copy than in the
       customs one — their two files differ by that much. */
    { cells: [[10, "Packing Declaration", "ttl"]], h: buyer ? 18 : 17.35 },
    R([2, "Vessel Name", "n"], [2, vessel, "n"], [2, "Voyage Number", "n"], [4, voyage, "n"]),
    R([2, "BL Number", "n"], [2, s.blNo || "", "n"], [2, "Date", "n"],
      [4, s.blDate ? ddmm(s.blDate) : "", "n"]),
    BLANK,
    R([10, `Consignment Identifier (s) or Numerical link(s) - CONTAINER NO : ${s.container || ""}`, "n"]),
    R([10, pkdPackages(ctx, rows), "n"]),
    R([10, (buyer ? buyerGoods : packingGoods)(packingBands(ctx)), "n"]),
    BLANK,
    R([10, "Unacceptable Packaging Material Statement", "n"]),
    R([10, "(Packaging materials such as straw, peat, hay, chaff, used fruit & vegetable cartons are not permitted)", "n"]),
    BLANK,
    R([1, "Q1.", "n"], [9, "Have unacceptable packaging materials been used as packaging or dunnage in the consignments", "n"]),
    R([1, "", "n"], [9, "covered by this document?", "n"]),
    R([1, "A1.", "n"], [1, "Yes", "n"], tick(false), [1, "", "n"],
      [1, "No", "n"], tick(true), [4, "", "n"]),
    BLANK,
    BLANK,
    R([10, "Timber / Bamboo Packaging / Dunnage Statement", "n"]),
    R([10, "(Timber / Bamboo Packging / dunnage includes : crates, cases, pallets, skids and any other timber or bamboo ", "n"]),
    R([10, "used as a shipping aid)", "n"]),
    BLANK,
    R([1, "Q2a.", "n"], [9, "Has timber / bamboo packaging / dunnage been used in consignments covered by this document?", "n"]),
    R([1, "A2a.", "n"], [2, "Yes Timber", "n"], tick(false), [1, "", "n"],
      [2, "Yes Bamboo", "n"], tick(false), [1, "No", "n"], tick(true)),
    R([8, "", "n"], [2, "(nil timber / bamboo)", "n"]),
    BLANK,
    R([10, "Treatment Certification (Only if Timber / Bamboo  Packaging / Dunnage is declared in Question2)", "n"]),
    BLANK,
    R([1, "Q3", "n"], [9, "All timber / bamboo packaging / dunnage used in the consignment has been (Please indicate below)", "n"]),
    BLANK,
    R([1, "", "n"], [7, "Treated and marked in complaince with ISPM 15?", "lead"], [1, "NA", "box"], [1, "", "n"]),
    R([1, "", "n"], [9, "(Note : ISPM 15 is only applicable to timber packaging)", "n"]),
    R([1, "", "n"], [9, "Or", "n"]),
    BLANK,
    R([1, "", "n"], [9, "Treated in compliance with Department of Agriculture and Water Resources Treatment", "n"]),
    R([1, "", "n"], [7, "Requirements", "lead"], [1, "NA", "box"], [1, "", "n"]),
    R([1, "", "n"], [9, "(With accompanying treatment certificate)", "n"]),
    BLANK,
    R([1, "", "n"], [9, "Or", "n"]),
    BLANK,
    R([1, "", "n"], [7, "Not Treated", "lead"], [1, "NA", "box"], [1, "", "n"]),
    BLANK,
    R([10, "Container Cleanliness Statement (For FCL/X Consignments Only) - statement to be removed from document", "n"]),
    R([10, "when not relevant", "n"]),
    BLANK,
    R([10, "The container(s) covered by this document has / have been cleaned and is / are free from material of animal ", "n"]),
    R([10, "and / or plant origin and soil", "n"]),
    BLANK,
    R([10, `FOR ${E.name}`.toUpperCase(), buyer ? "n" : "b"]),
    // The room their form leaves for the stamp and the signature.
    BLANK,
    BLANK,
    BLANK,
    /* The buyer's copy signs off a line earlier and dates it on the line under,
       across the width of the form; the customs copy puts the two on one line,
       and there "PROPRIETOR" is wider than the column it is typed in and runs
       on across the ones beside it — merging them would clip the word. */
    ...(buyer
      ? [R([10, "PROPRIETOR", "n"]),
        R(...blank(5), [1, "Date:", "n"], [4, ctx.inv.date ? ddmm(ctx.inv.date) : "", "n"])]
      : [BLANK,
        R([1, "PROPRIETOR", "b"], ...blank(4), [1, "Date:", "n"],
          [4, ctx.inv.date ? ddmm(ctx.inv.date) : "", "n"])]),
  ];
}

/* ============================================================================
   22 · Letter to the CHA — the instruction the customs house agent prepares the
   shipping bill from (Docs/Jaikvin Process/Numbering/22-Letter to CHA.xlsx).

   Their sheet is a ruled form eleven columns wide, and every rule on it is a
   cell border rather than a table: a block's heading rules the top of it, the
   lines under it rule its sides, and the blank line that closes it rules the
   foot. So the form is described here the way it is drawn there — a run at a
   time, each naming the edges it rules — and the page, the print and the
   worksheet are all laid out from that one description.

   A spec is the edges to rule, then what the run is set in: "b" bold, "x" the
   18pt the shipper's name is typed at, and "c" / "r" / "l" where it is not set
   to the left. "-" rules nothing.

   Their working copy highlights two cells the operator fills — yellow over the
   reference, green over the invoice and its date. This carries no highlighting,
   as the declaration (21) carries none: the invoice fills itself in.        */

const CHA_FONT = { b: "ref9b", x: "ref18b" };
const CHA_ALIGN = { c: "center", r: "right", l: "left" };

/* "^" is a cell inside a run carried down from the row above: the sheet needs
   it so the grid stays straight under the merge, the page must not have it
   because the rowspan already occupies that column. */
export const CHA_HELD = "^";

export function chaStyle(spec) {
  if (spec === CHA_HELD) return { font: "ref9", border: false, valign: "bottom" };
  const [edges, ...flags] = String(spec).split(" ");
  const align = flags.map((f) => CHA_ALIGN[f]).find(Boolean);
  const font = flags.map((f) => CHA_FONT[f]).find(Boolean) || "ref9";
  return {
    font, border: edges === "-" ? false : edges,
    // A tick answers for both the lines it stands against, so it is set middle.
    valign: flags.includes("m") ? "center" : "bottom",
    ...(align ? { align } : {}),
  };
}

/* The same spec as classes for the page: an edge each, then the face and the
   setting. Kept apart from the sheet's own names so neither has to know how the
   other rules a cell. */
export function chaClass(spec) {
  const [edges, ...flags] = String(spec).split(" ");
  return [...(edges === "-" ? [] : [...edges].map((e) => `e${e}`)), ...flags.map((f) => `f${f}`)].join(" ");
}

/* Their columns, in the width units their own sheet states, and what those
   eleven come to on paper: near enough nine inches, half again as wide as the
   page they are printed on. Their file prints to fit, so the whole form —
   columns, rules and the 9pt it is typed in alike — is stepped down by about an
   eighth to land on the paper.

   That is why the widths are not simply set to the size the form comes out at.
   Build it at the printed size and the columns are right but the type is not
   stepped down with them, so the longest labels — "Delivery order", the
   carrier's name — run past the edge of cells they sit inside on their copy.
   The form is laid out at their size and left to be fitted, as theirs is. */
export const CHA_BASE = [3.83, 13.5, 15.83, 13.33, 13.33, 3.83, 12.83, 12.33, 12.33, 12.33, 12.33];

export const CHA_PT = 629;                        // A..K, in points, as their sheet sets them

export const CHA_W = CHA_BASE.map((w) => Math.round(w * TNR_SCALE * 1e6) / 1e6);

/* The agent the shipping bill is filed through — their own standing block, the
   same on every letter. */
export const CHA_AGENT = ["M/s. Velji Dosabhai & Sons P Ltd,",
  "Godrej Collseum,5th Floor, Behind Everard Nagar,",
  "Off Eastern Express Highway, Sion (E) Mumbai 400 022"];

/* The standing instructions at the foot of it — theirs verbatim, and the same
   on every letter but for the carting date. Nothing in the system records that
   date: their own copy carts a day or so after the invoice, and the nearest
   thing here is the invoice's own date, so that is what it is dated with. */
export const CHA_NOTES = (ctx) => [
  "1. This is a nominated 1 x 20' FCL shipment",
  "2. Freight Payable at Destination",
  "3. Goods manufactured in Daman, Vapi & Maharashtra",
  `4. Goods will be carted on ${ddmm(ctx.inv.date)}`,
  "5. Suppliers Details to be shown in S/Bill.",
  "6. FUMIGATION NOT REQUIRED.",
  "7. We don't claim under FTP",
  "8. Please obtain EGM Copy for GST Purpose",
];

/* Who the goods come from, what each of them sent and who carried it — the
   "Delivery of Goods" table on the right of the form. Their copy has room for
   three; a shipment drawn from more suppliers simply rules more lines. */
export function chaParties(ctx, rows) {
  const by = new Map();
  rows.forEach((r) => {
    const k = r.supId;
    if (!by.has(k)) by.set(k, { name: r.sup?.name || "—", boxes: 0, sid: k });
    by.get(k).boxes += r.boxes;
  });
  return [...by.values()].map((p) => ({ ...p, through: transportInfo(ctx, p.sid).name }));
}

export function cha22Rows(ctx) {
  const E = ctx.EXPORTER, b = ctx.buyer, s = ctx.inv.ship || {};
  const rows = L(ctx);
  const R = (...cells) => ({ cells });
  const H = (h, ...cells) => ({ cells, h });
  /* Their form types the shipper over three lines and the buyer over four, so
     each is broken to the box it is typed in rather than to wherever the commas
     in the record happen to fall. */
  const eAddr = wrapTo(E.addr, 46, 3);
  const bAddr = addrLines({ addr: b.addr });
  const party = (lead) => {
    const out = [`${lead} ${b.name || ""},`, b.brand ? `T/A ${b.brand},` : "",
      bAddr[0] ? `${bAddr[0]},` : "",
      [bAddr[1], b.country ? `(${b.country})` : ""].filter(Boolean).join(" ")].filter(Boolean);
    return Array.from({ length: 4 }, (_, i) => out[i] || "");
  };
  const consignee = party("Messrs."), notify = party("M/s.");
  // The marks and the packages, each broken over the two lines their box has.
  const [mk1, mk2] = wrapTo(marksNos(ctx, rows), 26, 2);
  const [pk1, pk2] = wrapTo(packagesMade(rows), 27, 2);
  const parties = chaParties(ctx, rows);
  const deliv = Math.max(3, parties.length);
  const notes = CHA_NOTES(ctx);
  // The order the shipping bill is raised against, and when it was placed.
  const po = ctx.buyerMaster.slice().sort((x, y) => String(x.date).localeCompare(String(y.date)))[0];
  const invDt = ddmm(ctx.inv.date);
  // Their sheet prints the weights plain, to three places and no separator.
  const wt = (v, k) => Number(v || sum(rows, k) || 0).toFixed(3);

  return [
    R([11, "INSTRUCTION FOR PREPARATION OF SHIPPING BILL", "b b c"]),
    /* The reference strip. Their own note against it reads "manual": it is the
       exporter's letter number, kept in their own series and nowhere in this
       system, so it is left for the operator as their sheet leaves it. */
    H(12.75, [2, "", "ltb b"], [3, E.name, "rt"], [2, "Ref No", "ltb b"], [2, "", "tb"],
      [1, "Dt", "- b"], [1, "", "rtb l"]),
    H(12.75, [5, `Shippers :           Phones: ${E.tel || ""}`, "lrt b l"], [6, "Shipping Agents", "lrt b"]),
    /* The shipper's name stands 18pt over two of their rows; the agent's three
       lines run down beside it. Both rows are given the height their sheet
       gives them — left to size themselves to the 18pt the pair would grow to
       a third again as deep, and the form would no longer come off one page. */
    H(12.75, [5, E.name, "lr x r", 1], [6, CHA_AGENT[0], "lr"]),
    H(15, [6, CHA_AGENT[1], "lr"]),
    R([5, eAddr[0], "lr r"], [6, CHA_AGENT[2], "lr"]),
    R([5, eAddr[1], "lr r"], [2, "Invoice No", "lt b"], [4, ctx.inv.invoiceNo || "", "rt"]),
    R([5, eAddr[2], "lb r"], [2, "Date", "lb b"], [4, invDt, "rb"]),
    R([5, "Consignee", "lrt b"], [2, "Notify", "lt b"], [4, "", "rt"]),
    ...consignee.map((line, i) => R([5, line, "lr"], [6, notify[i], "lr"])),
    R([5, "", "lrb"], [2, "", "lb l"], [1, "", "- l"], [3, "", "rb"]),
    R([3, "Shipment From", "lrt b"], [2, "Shipment To", "lrt b"],
      [6, "Type of Shipping Bill - DRAWBACK", "lrt b"]),
    R([3, s.receiptPlace || "", "lr"], [2, s.pod || b.shipTo || "", "lr"],
      [6, "(GST REFUND WILL BE CLAIMED)", "lr b"]),
    R([3, "", "lrb"], [2, "", "lrb"], [6, "", "lrb"]),
    R([3, "Vessel", "lrt b"], [2, "Port of Loading:", "lrt b"],
      [3, "Marks & Nos.", "lrt b"], [3, "No & Kind of Pkgs", "lrt b"]),
    R([3, s.vessel || "", "lrb"], [2, s.pol || "", "lrb b"], [3, mk1, "lr"], [3, pk1, "lr l"]),
    R([3, "Port of Discharge:", "lrt b"], [2, "Final Destination:", "lrt b"],
      [3, mk2, "lr"], [3, pk2, "lr"]),
    R([3, s.pod || "", "lr"], [2, s.finalDest || b.country || "", "lr"], [3, "", "lr"], [3, "", "lr"]),
    R([3, "", "lrb"], [2, "", "lrb"], [3, "", "lrb"], [3, "", "lr"]),
    R([3, "Container No", "lrt b"], [2, "Seal No", "lrt b"],
      [3, "Nett Weight (KGS)", "l b"], [3, "Gross Weight (KGS)", "lrt b"]),
    R([3, s.container || "", "lr"], [2, s.seal || "", "lr b"],
      [3, wt(s.netWt, "netTotal"), "l l"], [3, wt(s.grossWt, "grossTotal"), "lr l"]),
    R([3, "", "lrb"], [2, "", "lrb"], [3, "", "lb"], [3, "", "lrb l"]),
    R([3, "Freight.", "lrt b"], [2, "Number of Original BL", "lrt b"], [6, "Delivery of Goods", "lrt b"]),
    R([3, "Payable at Destination", "lr"], [2, "SEAWAY", "lr"],
      [3, "Party", "lrtb b"], [1, "Pkgs", "lrtb b c"], [2, "Through", "lrtb b c"]),
    /* The left of this block carries where and when the bill of lading is
       issued; the right carries a ruled line per supplier beside it. */
    ...Array.from({ length: deliv }, (_, i) => {
      const p = parties[i];
      const left = i === 0 ? [5, "Place & Date of Issue of Bill-of Lading", "lrt b"]
        : i === 1 ? [5, "Mumbai             Current.", "lr"] : [5, "", "lr"];
      return R(left, [3, p?.name || "", "lrtb"], [1, p ? String(p.boxes) : "", "lrtb c"],
        [2, p?.through || "", "lrtb"]);
    }),
    R([11, 'Documents attached marked "X"', "lrt b"]),
    /* The documents that travel with it. Each is ticked in a box of its own,
       and the four on the left carry the paper's number over its date. */
    R([1, "X", "lrtb b c m", 1], [1, "Invoice No ", "-"], [3, ctx.inv.invoiceNo || "", "rb"],
      [1, "X", "lrtb b c m"], [1, "SDF Dated", "-"], [1, invDt, "b"], [3, "", "r c"]),
    R([1, "", CHA_HELD], [1, "Date", "-"], [3, invDt, "tb"], [6, "", "r b"]),
    R([1, "", "ltb b c m"], [1, "", "-"], [3, "", "t"], [1, "X", "lrtb b c m"], [5, "Annexture 'A'", "lr"]),
    R([1, "X", "lrtb b c m", 1], [1, "Packing List", "-"], [3, ctx.inv.invoiceNo || "", "rb"], [6, "", "r b"]),
    R([1, "", CHA_HELD], [1, "Date", "-"], [3, invDt, "tb"], [1, "X", "lrtb b c m"],
      [1, "Delivery order", "l"], [4, "will Follow", "rb"]),
    R([1, "", "ltb b c m"], [1, "", "-"], [3, "", "t"], [6, "", "r b"]),
    R([1, "X", "lrtb b c m", 1], [1, "Order Copy", "-"], [3, po?.po || "", "b"],
      [1, "X", "lrtb b c m"], [1, "B/L Instruction", "-"], [4, "will Follow", "rb"]),
    R([1, "", CHA_HELD], [1, "Date", "-"], [3, po ? ddmm(po.date) : "", "tb"], [6, "", "r b"]),
    R([1, "", "lt b c m"], [1, "", "-"], [3, "", "t"], [1, "", "lrtb b c m"], [5, "Other Documents", "lr"]),
    R([1, "X", "lrtb b c m"], [4, "Packaging Declaration", "l"], [6, "", "r b"]),
    R([11, "", "lrb"]),
    R([5, "Special Requirements/Instructions", "lrt b"], [6, "", "lrt b"]),
    // The stamp and the seal go in the open half beside the instructions.
    ...notes.map((line, i) => R([5, line, i === notes.length - 1 ? "lrb" : "lr"],
      [6, i === 3 ? "SEAL" : i === 5 ? "STAMP" : "", i === notes.length - 1 ? "lrb r" : "lr r"])),
  ];
}

/* ============================================================================
   23 · Suppliers' details — who made what on this shipment, for the shipping
   bill (Docs/Jaikvin Process/Numbering/23-Suppliers Details.xlsx).

   Their sheet is not a fixed form like 21 and 22: it is the same eight-column
   band ruled once per family of goods, headed twice — the columns above, what
   the family is below — with a clear line between one band and the next. So it
   is described here as the bands the shipment happens to carry rather than as a
   fixed count of rows, and it runs on down as many pages as it needs.

   The letterhead is the same printed block the packing declaration stands on,
   and it is placed here by the same measurements (PKD_PLACE) rather than being
   set out a second time.                                                    */

/* Their eight columns, in the width units their own sheet states, scaled as the
   letter to the CHA's are — the two files are set in the same face. */
export const SUP_BASE = [12.6640625, 30.83203125, 13.83203125, 37.5,
  14.33203125, 21, 16.1640625, 14.1640625];

export const SUP_W = SUP_BASE.map((w) => Math.round(w * TNR_SCALE * 1e6) / 1e6);

/* What a column of it comes to in EMU, and a row — what the letterhead is
   anchored against. Their sheet's own width unit is a shade over five points
   and its rows are 15. */
export const SUP_COL = SUP_BASE.map((w) => Math.round(w * 5 * 12700));

export const SUP_ROW = 15 * 12700;

export const SUP_HEAD = 7;                        // the rows the letterhead stands over

/* The letterhead over those seven rows, drawn corner to corner exactly where
   their file draws it. Their block is a text box holding live text, so it can
   be as flat and wide as the head asks; ours is a picture of that block and
   would keep its own shape given only a size. Stretched to their rectangle it
   is a shade flatter than the scan, and stands where theirs stands — which is
   worth more than its proportions: sized from its own shape instead, the head
   has to be deepened by half to reach their width, and the letterhead comes out
   half again the size of theirs at the top of the page. */
export const SUP_HEAD_ANCHORS = {
  addr: { col: 0, colOff: 57150, row: 0, rowOff: 76200, to: { col: 5, colOff: 57150, row: 6, rowOff: 28575 } },
  box: { col: 5, colOff: 142875, row: 0, rowOff: 85725, to: { col: 6, colOff: 561975, row: 6, rowOff: 38100 } },
  mark: { col: 5, colOff: 371475, row: 1, rowOff: 76200, to: { col: 5, colOff: 1104900, row: 5, rowOff: 47625 } },
};

export const SUP_LH_ROW = SUP_ROW;

/* The printed letterhead sized to the head of whatever sheet carries it: the
   block set in from the left and filled to the depth of those rows, the frame
   beside it at the same depth, and the mark inside that frame with the air the
   declaration gives it. The declaration's own proportions (PKD_MARK_*) are what
   everything here is taken from — it is the same letterhead, only the paper
   under it changes. */
export function letterheadOver(rowCy, rows, y = 76200, x = 57150) {
  const cy = rowCy * rows - y * 2;
  const cx = Math.round(cy * ADDR_ASPECT);
  const boxCx = Math.round(cy * (PKD_MARK_BOX_CX / PKD_MARK_BOX_CY));
  const boxX = x + cx + 28800;                    // their gap between the two frames
  const markCx = Math.round(boxCx * (PKD_MARK_CX / PKD_MARK_BOX_CX));
  const markCy = Math.round(cy * (PKD_MARK_CY / PKD_MARK_BOX_CY));
  return {
    addr: { x, y, cx, cy },
    box: { x: boxX, y, cx: boxCx, cy },
    mark: { x: boxX + Math.round((boxCx - markCx) / 2), y: y + Math.round((cy - markCy) / 2), cx: markCx, cy: markCy },
  };
}

/* A letterhead is drawn corner to corner: the sheet wants the two corners, the
   preview and the printed copy want the plain rectangle, and the drawing part
   wants a size besides. State the corners once and take the other two from
   them — a reader that sizes the block from the stated size rather than from
   the corners will otherwise draw it half again too big. */
export function headPlace(anchors, cols, rowCy) {
  const out = { rect: {} };
  Object.entries(anchors).forEach(([k, a]) => {
    const r = rectOf(a, cols, rowCy);
    out[k] = { ...a, cx: r.cx, cy: r.cy };
    out.rect[k] = r;
  });
  return out;
}

/* One of those anchors as a plain rectangle. */
export function rectOf(a, cols, rowCy) {
  const x = (c, off) => cols.slice(0, c).reduce((n, w) => n + w, 0) + off;
  const left = x(a.col, a.colOff);
  const top = a.row * rowCy + a.rowOff;
  return { x: left, y: top, cx: x(a.to.col, a.to.colOff) - left, cy: a.to.row * rowCy + a.to.rowOff - top };
}

export const SUP_HEAD_PLACE = headPlace(SUP_HEAD_ANCHORS, SUP_COL, SUP_ROW);
export const SUP_PLACE = SUP_HEAD_PLACE.rect;

/* Their sheet sets the family's name to shrink into the two columns it is typed
   across rather than widening them for it, so the longest — the threaded pipes
   — is set a little smaller than the rest of the list. */
const SUP_NAME_PT = (SUP_BASE[0] + SUP_BASE[1]) * 5;

// Calibri runs a little narrower than the Arial these widths are measured in.
export const supFits = (t) => arialPt(t, 11) * 0.92 <= SUP_NAME_PT;

/* A place measured from the top left of a form, as the cell and offset a
   drawing is anchored to. The letterhead is described once, in those absolute
   terms (PKD_PLACE), and every sheet that carries it works out for itself which
   of its own cells that lands in. */
export function anchorAt(cols, rowCy, p) {
  let col = 0, x = p.x;
  while (col < cols.length - 1 && x >= cols[col]) { x -= cols[col]; col += 1; }
  return {
    col, colOff: Math.round(x),
    row: Math.floor(p.y / rowCy), rowOff: Math.round(p.y % rowCy),
    cx: p.cx, cy: p.cy,
  };
}

/* A style of this form, written the way the letter to the CHA's are: the edges
   to rule, then "b" bold and "c" centred. Its column widths are stated in the
   Times New Roman its file's normal style is set in, but the form itself is
   typed in Calibri 11 — which is the face this list is read in. */
const SUP_ALIGN = { c: "center", r: "right", l: "left" };

export function supStyle(spec) {
  const [edges, ...flags] = String(spec).split(" ");
  const align = flags.map((f) => SUP_ALIGN[f]).find(Boolean);
  return {
    font: flags.includes("b") ? "calb" : "cal",
    border: edges === "-" ? false : edges,
    valign: "bottom",
    ...(flags.includes("s") ? { shrink: true } : {}),
    ...(align ? { align } : {}),
  };
}

export const supClass = (spec) => chaClass(spec);

/* One band's worth of the form: the columns, what the family is, and a line per
   item in it. Their sheet rules every cell of it. */
function supBand(ctx, band, R) {
  const inv = ctx.inv.ship || {};
  return [
    R([2, "ITEM CODE", "lrtb b"], [1, "QUANTITY", "lrtb b c"],
      [3, "SUPPLIERS DETAILS", "lrtb b c"], [1, "TAX INV", "lrtb b c"], [1, "DATE", "lrtb b c"]),
    R([2, band.head, supFits(band.head) ? "lrtb b" : "lrtb b s"],
      [1, "PCS", "lrtb b c"], [1, "NAME", "lrtb b c"],
      [1, "DISTRICT", "lrtb b c"], [1, "GSTIN", "lrtb b c"], [1, "NO", "lrtb b c"],
      [1, "", "lrtb b c"]),
    ...band.rows.map((r) => R(
      [2, r.it.code || "", "lrtb"],
      // Their sheet writes the count plainly, without a separator.
      [1, String(r.pieces), "lrtb c"],
      [1, r.sup.name ? `M/s. ${r.sup.name}` : "", "lrtb"],
      [1, (r.sup.place || "").toUpperCase(), "lrtb"],
      [1, r.sup.gstin || "", "lrtb"],
      /* The supplier's own tax invoice against this shipment, and its date.
         Nothing in this system records either — the e-way bill (10) leaves the
         same two for whoever keys it in — so the columns are ruled and left
         blank rather than filled with something invented. */
      [1, "", "lrtb"], [1, "", "lrtb"],
    )),
    { cells: [[8, "", "-"]] },
  ];
}

export function sup23Rows(ctx) {
  const s = ctx.inv.ship || {};
  const R = (...cells) => ({ cells });
  const BLANK = { cells: [[8, "", "-"]] };
  const bands = packingBands(ctx);
  return [
    // The letterhead floats over the head of the sheet, as it does on 21.
    ...Array.from({ length: SUP_HEAD }, () => ({ cells: [[8, "", "-"]], h: 15, lh: 1 })),
    R([7, "SUPPLIERS DETAILS", "- c"]),
    BLANK,
    /* The strip over the list. Nothing here is ruled, so a long invoice number
       or port runs on over the white beside it rather than being cut off at a
       column edge that is not drawn — which is what their sheet does with it,
       and what the print engine would otherwise not do, measuring the same
       words a per cent or two wider than the spreadsheet does. */
    R([1, "Inv No & Dt", "- v"], [1, `${ctx.inv.invoiceNo || ""} DT ${ddmm(ctx.inv.date)}`, "- b v"],
      [1, "NO OF PKGS", "- v"], [1, s.pkgs || String(sum(L(ctx), "boxes")), "- b c v"],
      [1, "Shipment to", "- v"], [2, (s.pod || ctx.buyer.shipTo || "").toUpperCase(), "- b v"],
      [1, "", "-"]),
    BLANK,
    ...bands.flatMap((band) => supBand(ctx, band, R)),
  ];
}

/* ============================================================================
   24 · Annexure to the bill of lading — the "attached sheet" the carrier staples
   to the B/L (Docs/Jaikvin Process/Numbering/24-BL Annexure.docx).

   This one is a typed sheet rather than a worksheet: a heading, the B/L number,
   and then the consignment described family by family — the extruded pipes
   gathered into their bores and the rest listed by code — under the exporter's
   HSN codes and the invoice it belongs to.

   It carries no money at all, and must not: the annexure travels with the bill
   of lading, which is the carrier's document and the consignee's title to the
   goods. What a piece cost is between the exporter and the buyer.

   The sheet is described here as the blocks it is typed in — a paragraph or a
   ruled table at a time — and the page, the print and the worksheet are laid
   out from that one description.                                           */

/* Their table columns, in twips as their file states them. The pipes are typed
   across two columns and everything else across three; laid out here on the
   three, so a bore and a code start in the same place down the sheet. */
export const BLA_TW = [1458, 4746, 1824];

export const BLA_W = BLA_TW.map((t) => Math.round(t / 20 / 5.299 * 1e4) / 1e4);

/* A bore as their sheet writes it — the millimetre their master keeps and the
   inch that goes with it, which the item's own group carries ("15 MM (1/2\")").
   A group with no inch in it simply prints the millimetre. */
export const boreOf = (it) => {
  const mm = String(it.size || "").replace(/[^\d.]/g, "");
  const inch = /\(([^)]+)\)/.exec(String(it.group || ""));
  const q = inch ? inch[1].replace(/["”]/g, "").trim() : "";
  return { mm, text: q ? `SIZE : ${mm}MM (${q}”) X ASSORTED LENGTHS` : `SIZE : ${mm}MM X ASSORTED LENGTHS` };
};

/* The pipes gathered into bores: one line per size, the assorted lengths in it
   added up, smallest bore first, as their sheet runs them. */
export function blaBores(rows) {
  const by = new Map();
  rows.forEach((r) => {
    const { mm, text } = boreOf(r.it);
    if (!by.has(text)) by.set(text, { mm: Number(mm) || 0, text, pieces: 0 });
    by.get(text).pieces += r.pieces;
  });
  return [...by.values()].sort((a, b) => a.mm - b.mm);
}

/* The exporter's HSN codes on this consignment, written the customs way and
   each named once, in the order the goods run. */
export const blaHsn = (rows) => [...new Set(rows.map((r) => hsnText(r.it)).filter(Boolean))];

/* The five families as this sheet heads them. The pipes are headed above their
   table and the rest inside it, which is how their file is typed. */
const BLA_BANDS = [
  { key: "mxm", over: "PP EXTRUDED ITEM: BOTH SIDE THREADED PIPES", bore: true },
  { key: "mxf", over: "PP EXTRUDED ITEMS : M/F THREADED PIPES", bore: true },
  { key: "ppm", head: "PP MOULDED ITEMS" },
  { key: "grn", head: "NYLON MOULDED ITEMS" },
  { key: "box", over: "CORRUGATED BOX SETS", head: "SIZE" },
];

export function bla24Rows(ctx) {
  const rows = L(ctx), s = ctx.inv.ship || {};
  const P = (text, k = "n") => ({ kind: "p", text, k });
  const of = (key) => rows.filter((r) => familyOf(r.it) === key);
  const out = [
    P("ATTACHED SHEET", "ttl"),
    P(""),
    P(`BL NO :   ${s.blNo || ""}`),
    P("DESCRIPTION OF GOODS", "mid"),
    P(""),
  ];
  BLA_BANDS.forEach((band) => {
    const mine = of(band.key);
    if (!mine.length) return;
    if (band.over) out.push(P(band.over, "hd"));
    if (band.bore) {
      out.push({
        kind: "tbl",
        rows: [[["", 2], ["PIECES"]],
          ...blaBores(mine).map((b) => [[b.text, 2], [String(b.pieces)]])],
      });
    } else {
      // The cartons are described by the three dimensions their master keeps.
      const desc = (r) => (band.key === "box"
        ? `${boxDims(r.it).filter(Boolean).join(" X ")} MM`
        : r.it.description || "");
      out.push({
        kind: "tbl",
        rows: [[["CODE"], [band.head], ["PIECES"]],
          ...mine.map((r) => [[r.it.code || ""], [desc(r)], [String(r.pieces)]])],
      });
    }
    out.push(P(""));
  });
  const hsn = blaHsn(rows);
  if (hsn.length) out.push(P(`SHIPPERS HSN CODE: ${hsn.join(", ")}`));
  out.push(P(`AS PER OUR INV NO. ${ctx.inv.invoiceNo || ""} Dt ${ddmm(ctx.inv.date)}`));
  return out;
}

/* ============================================================================
   26 · Shipping instructions — what the exporter hands the shipping line so the
   line can raise the bill of lading (Docs/Jaikvin Process/Numbering/
   26-Shipping Instructions.xls).

   Their sheet is the line's own booking form: four columns, a grey ground with
   the boxes that carry a figure left white, and the cargo described in one tall
   block down the middle. It is ruled cell by cell, so it is described here the
   way the letter to the CHA is — a run at a time, each naming the edges it
   rules, then "b" bold, "c" centred, "w" wrapped down the box it is typed in
   and "g" for the grey the form is printed on.

   Their working copy highlights the cells the operator fills. The container and
   its seal are filled from the shipment here, and the description is written
   from the invoice, so only the line's own booking number is left to be typed —
   and, as on the declaration (21), nothing is highlighted.               */

const SI_ALIGN = { c: "center", r: "right", l: "left" };

export function siStyle(spec) {
  if (spec === CHA_HELD) return { font: "ref9", border: false, valign: "bottom" };
  const [edges, ...flags] = String(spec).split(" ");
  const align = flags.map((f) => SI_ALIGN[f]).find(Boolean);
  return {
    // Typed in Calibri, though the columns are measured in the Arial their
    // workbook's normal style is set in.
    font: flags.includes("b") ? "cal10b" : "cal10",
    border: edges === "-" ? false : edges,
    ...(flags.includes("g") ? { fill: "grey" } : {}),
    ...(flags.includes("w") ? { wrap: true, valign: "top" } : { valign: "bottom" }),
    ...(align ? { align } : {}),
  };
}

export const siClass = (spec) => chaClass(spec);

/* Their four columns, in the width units their own sheet states. It is set in
   Arial 10, as the packing declaration is, so it takes that same correction. */
export const SI_BASE = [20.4, 35.84, 32.41, 15.27];

export const SI_W = SI_BASE.map((w) => Math.round(w * PKD_SCALE * 1e6) / 1e6);

/* The two blocks of standing text on it — the line's terms, and what the form
   says the container holds. Theirs verbatim. */
export const SI_TERMS = [
  "SHIPPER LOAD, STOW, WEIGHT & COUNT TERMINAL / CONTAINER HANDLING CHARGES.",
  "DESTUFFING CHARGES AND TRANSPORTATION CHARGES AT DESTINATION AS PER LINES",
  "TARIFF ON CONSIGNEE'S ACCOUNT",
];

/* Their sheet dates the shipping bill with dashes where the rest of the library
   uses stops. */
export const dashDate = (s) => ddmm(s).replace(/\./g, "-");

/* A party as the form takes it — up to the five lines it allows, in capitals,
   the way a bill of lading is typed. */
export function siParty(lead, b) {
  const addr = addrLines({ addr: b.addr });
  return [`${lead} ${b.name || ""},`, b.brand ? `T/A, ${b.brand},` : "",
    addr[0] ? `${addr[0]},` : "",
    [addr[1], b.country ? `(${b.country}).` : ""].filter(Boolean).join(" ")]
    .filter(Boolean).slice(0, 5).join("\n").toUpperCase();
}

/* What the line is told the container holds: the packages counted in figures
   and again in words, the split their form asks for, what the goods are, and
   the shipping bill and HSN codes that go with them. */
export function siCargo(ctx, rows) {
  const s = ctx.inv.ship || {};
  const total = sum(rows, "boxes");
  const bundles = sum(rows.filter((r) => familyOf(r.it) === "box"), "boxes");
  const cartons = total - bundles;
  const hsn = [...new Set(rows.map((r) => String(r.it.hsn || "").trim()).filter(Boolean))];
  const sb = s.sbNo ? `S/BILL NO. : ${s.sbNo}${s.sbDate ? ` DT ${dashDate(s.sbDate)}` : ""}` : "";
  return [
    "SAID TO CONTAIN / WEIGHT",
    `TOTAL ${total} PACKAGES`,
    `(TOTAL ${wordsIntl(total)} PACKAGES ONLY)`,
    bundles && cartons ? `(${cartons} CARTONS & ${bundles} HDP BUNDLES) CONTAINING` : "CONTAINING",
    packingGoods(packingBands(ctx)),
    "DESCRIPTION AS PER ATTACHED SHEET",
    "",
    sb,
    hsn.length ? `SHIPPERS HSN CODE : ${hsn.join(", ")}` : "",
  ].filter((l, i, a) => l !== "" || a[i + 1]).join("\n");
}

export function si26Rows(ctx) {
  const E = ctx.EXPORTER, b = ctx.buyer, s = ctx.inv.ship || {};
  const rows = L(ctx);
  const R = (...cells) => ({ cells });
  const H = (h, ...cells) => ({ cells, h });
  const shipper = [`${E.name || ""},`, ...wrapTo(E.addr, 34, 3)].filter(Boolean).join("\n").toUpperCase();
  const party = siParty("MESSRS", b);
  const kg = (v, k) => Number(v || sum(rows, k) || 0).toFixed(3);
  const vol = sum(rows, "volTotal");
  const packages = String(sum(rows, "boxes"));
  // The eight blank lines their form leaves between the terms and the footer.
  const filler = Array.from({ length: 8 }, () => R([1, "", "lr g"], [2, "", "lr g"], [1, "", "lr c g"]));

  return [
    R([2, "SHIPPER (MAX 5 LINES)", "lrt b g"], [2, "BOOKING NO :", "lrt b g"]),
    /* The line's own booking number is the one box on the form with nothing
       behind it in this system, so it is left for whoever books the space. */
    H(50.25, [2, shipper, "lrb w g"], [2, "", "lrb w g"]),
    R([2, "CONSIGNEE (MAX 5 LINES)", "lrt b g"], [2, "B/L TYPE :", "lrt b g"]),
    H(52.5, [2, party, "lrb w g"], [2, "SEAWAY BL", "lrb w g"]),
    R([2, "NOTIFY PARTY 1 (MAX 5 LINES)", "lrt b g"], [2, "NOTIFY PARTY 2 (MAX 5 LINES)", "lrt b g"]),
    H(54, [2, party, "lrb w g"], [2, "", "lrb w g"]),
    R([2, "VESSEL AND VOYAGE", "lrt b g"], [2, "PLACE OF RECEIPT :", "lrt b g"]),
    R([2, s.vessel || "", "lrb g"], [2, s.receiptPlace || "", "lrb g"]),
    R([1, "PORT OF LOADING :", "lrt b g"], [1, "PORT OF DISCHARGE :", "lrt b g"],
      [2, "PLACE OF DELIVERY :", "lrt b g"]),
    R([1, s.pol || "", "lrb g"], [1, s.pod || b.shipTo || "", "lrb g"],
      [2, s.finalDest || b.country || "", "lrb g"]),
    R([1, "MARKS &\nNUMBERS", "lrt b w g"], [2, "CARGO DESCRIPTION", "lrtb b c g"],
      [1, "CARGO WEIGHTS", "lrtb b c g"]),
    /* The marks stand five rows deep and the description ten, as their form
       rules them; the weights run down the column beside both. */
    R([1, marksNos(ctx, rows), "lr w", 4], [2, siCargo(ctx, rows), "lrt w", 9],
      [1, "GROSS WEIGHT", "lrt b c g"]),
    /* The marks stand five rows deep and the description ten, so the rows under
       them give a cell for the columns those two cover before their own. */
    ...[["", kg(s.grossWt, "grossTotal"), "lr c"], ["", "KGS", "lr b c g"],
      ["", "", "lr c g"], ["", "", "lr c g"]]
      .map(([, v, k]) => R([1, "", CHA_HELD], [2, "", CHA_HELD], [1, v, k])),
    R([1, "CONTAINER NO :", "lr b g"], [2, "", CHA_HELD], [1, "", "lrb c g"]),
    R([1, s.container || "", "lr"], [2, "", CHA_HELD], [1, "NET WEIGHT", "lrt b c g"]),
    R([1, "", "lr g"], [2, "", CHA_HELD], [1, kg(s.netWt, "netTotal"), "lr c"]),
    R([1, "A/SEAL NO : ", "lr b g"], [2, "", CHA_HELD], [1, "KGS", "lr b c g"]),
    R([1, s.seal || "", "lr"], [2, "", CHA_HELD], [1, "", "lr c g"]),
    R([1, "", "lr g"], [2, "", "lr"], [1, "", "lr c g"]),
    R([1, "", "lr g"], [2, SI_TERMS[0], "lr"], [1, "", "lrb c g"]),
    R([1, "", "lr g"], [2, SI_TERMS[1], "lr"], [1, "FCL / FCL", "lrt b c g"]),
    R([1, "", "lr g"], [2, SI_TERMS[2], "lr"], [1, `${num(vol, 2)} cubic Mtr`, "lrt c"]),
    ...filler,
    H(24.75, [1, "", "lrb g"], [2, "", "lrb g"], [1, "", "lrb c g"]),
    R([1, "TOTAL NO OF PACKAGES", "lr b g"], [2, "SOB STAMPED AND DATE", "lrt b c g"],
      [1, "FREIGHT", "lr b c g"]),
    R([1, packages, "lr c"], [2, "", "lr g"], [1, "COLLECT", "lr c g"]),
    R([1, "", "lrb g"], [2, "", "lrb g"], [1, "", "lrb g"]),
  ];
}

/* ============================================================================
   27 · Declaration of verified gross mass — what the exporter signs to say what
   the loaded container weighs (Docs/Jaikvin Process/Numbering/27-VGM.pdf).

   It is one of the letter-paper declarations, like 13 to 16: their printed
   letterhead, a heading, a ruled table of fifteen numbered particulars, and the
   signature block and notes under it.

   Four of those particulars are not facts about the shipment at all but about
   the weighing — the line's booking number, the tare stamped on that container's
   door, the weighbridge slip and the time it was weighed. None is recorded
   here, and a verified gross mass is a legally declared weighed figure, so they
   are left for whoever has the weighbridge ticket in hand rather than worked
   out from an assumed tare.                                                 */

/* The weighbridge they use, as their form prints it. */
export const VGM_BRIDGE = ["CLM10072551", "SHRI NARAYAN WEIGH BRIDGE",
  "SARVE NO. 127/2, VILLAGE KHOPTE,  POST", "KOPROLI,TAL. URAN.", "DIST-RAIGAD"];

/* The notes at the foot, theirs verbatim. */
export const VGM_NOTES = ["*Indicates mandatory fields",
  "**Shippers not having IEC no. CIN No. may provide information as follows:",
  "Company - PAN NO.", "Individuals", "Indian National - AADHAR No",
  "Foreign National - PASSPORT No & Country of issue of passport."];

export const VGM_MAX = "30480 Kgs per Container";

/* Their form dates the weighing and the signature with slashes. */
export const slashDate = (s) => ddmm(s).replace(/\./g, "/");

/* The fifteen particulars, as [serial, what is asked, what is answered]. A
   serial ending in a star is one the form marks mandatory. */
export function vgm27Rows(ctx) {
  const E = ctx.EXPORTER, s = ctx.inv.ship || {};
  const rows = L(ctx);
  const gross = Number(s.grossWt) || sum(rows, "grossTotal");
  return [
    ["1*", "Booking No.", ""],
    ["2*", "Name of the shipper", E.name || ""],
    ["3*", "Shipper Registration /License no.( IEC No/CIN No)**", E.iec || ""],
    ["4*", "Name and designation of official of the shipper authorized to sign document",
      `${SIGNATORY} – Proprietor`],
    ["5*", "24 x 7 contact details of authorized official of shipper", E.tel || ""],
    ["6*", "Container No.", s.container || ""],
    ["7*", "Container Size ( TEU/FEU/other) 20' or 40'", "1x20’FCL"],
    ["8*", "Maximum permissible weight of container as per the CSC plate", VGM_MAX],
    ["9*", "Weighbridge registration no. & Address of Weighbridge", VGM_BRIDGE.join("\n")],
    ["10*", "Weighing Method (Method-1 /Method-2)", "METHOD-2"],
    /* The cargo's own weight is known; the container's tare is stamped on its
       door and the sum of the two is what the weighbridge certifies, so the
       line is printed for those two to be written in. */
    ["11*", "Verified Gross Mass of the Container (with unit of measure KG / MT / LBS)",
      `NT WT ${Number(gross || 0).toFixed(3)} + TARE WT __________ = VGM __________ KGS`],
    ["12*", "Date and time of weighing", ""],
    ["13*", "Weighing Slip No.", ""],
    ["14", "Type (Normal/Reefer/Hazardous/FLAT RACK/OPEN TOP)", "NORMAL"],
    ["15", "If Hazardous  UN NO.IMDG class", "NON HAZ"],
  ];
}

/* Who signs it and when — the block under the table. */
export const vgm27Sign = (ctx) => [
  ["Name", SIGNATORY.toUpperCase()],
  ["Designation", "PROPRIETOR"],
  ["Date", slashDate(ctx.inv.ship?.blDate || ctx.inv.date)],
  ["SEAL/STAMP", ""],
];

/* ============================================================================
   29 · E-way bill, export leg — the goods moving from the factory to the port
   (Docs/Jaikvin Process/Numbering/29-Eway Bill Format for Export (Sales).pdf).

   Where 10 is the portal's entry form for the inward leg, this is the bill the
   portal prints once the outward one has been raised: five numbered sections in
   ruled boxes. The number, the date it was generated, how long it is valid and
   the distance are the portal's own — it works them out when the bill is raised
   — so those boxes are ruled and left, and everything the exporter supplies is
   filled in. Printed this way it is both what to key in and what to check the
   portal's copy against.                                                    */

const EWX_ALIGN = { c: "center", r: "right", l: "left" };

export function ewxStyle(spec) {
  const [edges, ...flags] = String(spec).split(" ");
  const align = flags.map((f) => EWX_ALIGN[f]).find(Boolean);
  return {
    font: flags.includes("t") ? "refb11" : flags.includes("b") ? "ref9b" : "ref9",
    border: edges === "-" ? false : edges,
    /* Everything in their four blocks stands centred in the row, wrapped
       labels included — the rows are deep enough to hold two lines. */
    ...(flags.includes("w") ? { wrap: true } : {}),
    valign: "center",
    ...(align ? { align } : {}),
  };
}

export const ewxClass = (spec) => chaClass(spec);

/* Twelve columns, even but for the two the addresses need. */
export const EWX_BASE = [7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7];

export const EWX_W = EWX_BASE.map((w) => Math.round(w * PKD_SCALE * 1e6) / 1e6);

/* The goods as the portal lists them: a line per HSN, the pieces under it, what
   they come to in rupees at the invoice's own rate, and the rate of tax. */
export function ewxGoods(ctx, rows) {
  const ex = exRate(ctx);
  const by = new Map();
  rows.forEach((r) => {
    const k = String(r.it.hsn || "").trim() || "—";
    if (!by.has(k)) by.set(k, { hsn: k, names: [], pieces: 0, taxable: 0 });
    const g = by.get(k);
    const name = bandOf(r.it);
    if (!g.names.includes(name)) g.names.push(name);
    g.pieces += r.pieces;
    g.taxable += r.fobTotal * ex;
  });
  return [...by.values()].map((g) => ({ ...g, rate: gstRate(g.hsn) * 100 }));
}

export function ewx29Rows(ctx) {
  const E = ctx.EXPORTER, b = ctx.buyer, s = ctx.inv.ship || {};
  const rows = L(ctx);
  const R = (...cells) => ({ cells });
  const goods = ewxGoods(ctx, rows);
  const taxable = goods.reduce((a, g) => a + g.taxable, 0);
  const igst = goods.reduce((a, g) => a + g.taxable * g.rate / 100, 0);
  /* The goods leave the factory that made them. One supplier and the bill names
     it; several and it names the exporter, whose invoice the movement is on. */
  const sups = [...new Set(rows.map((r) => r.supId))].map((id) => supFor(ctx, id));
  const from = sups.length === 1 ? sups[0] : null;
  const dispatch = from
    ? [from.name || "", from.addr || "", [from.place, from.state, from.pin].filter(Boolean).join(", ")]
    : [E.name || "", ...wrapTo(E.addr, 44, 2)];
  const ship = [EW_SHIP_TO.name, EW_SHIP_TO.addr,
    `${EW_SHIP_TO.place},${EW_SHIP_TO.state}-${EW_SHIP_TO.pin}`.toUpperCase()];
  const band = (t) => R([12, t, "lrtb b"]);
  const money = (n) => num(n, 2);

  return [
    R([12, "e-Way Bill", "- t"]),
    band("1. E-WAY BILL Details"),
    R([4, "eWay Bill No: ", "lrt"], [4, "Generated Date: ", "lrt"],
      [4, `Generated By: ${E.gstin || ""}`, "lrt"]),
    R([4, "", "lrb"], [4, "", "lrb"], [4, "Valid Upto: ", "lrb"]),
    R([4, "Mode: Road", "lrtb"], [4, "Approx Distance: ", "lrtb"], [4, "", "lrtb"]),
    R([4, "Type: Outward - Export", "lrtb w"],
      [4, `Document Details: Tax Invoice - ${ctx.inv.invoiceNo || ""} - ${slashDate(ctx.inv.date)}`, "lrtb w"],
      [3, "Transaction type: Combination of 2 and 3", "lrtb w"], [1, "Portal: 1", "lrtb"]),
    band("2.Address Details"),
    R([6, "From", "lrtb b"], [6, "To", "lrtb b"]),
    R([6, `GSTIN : ${E.gstin || ""}`, "lrt"], [6, "GSTIN : URP", "lrt"]),
    R([6, (E.name || "").toUpperCase(), "lr"], [6, (b.name || "").toUpperCase(), "lr"]),
    R([6, "MAHARASHTRA", "lr"], [6, "OTHER COUNTRIES", "lr"]),
    R([6, ":: Dispatch From ::", "lr"], [6, ":: Ship To ::", "lr"]),
    ...Array.from({ length: 3 }, (_, i) => R(
      [6, (dispatch[i] || "").toUpperCase(), i === 2 ? "lrb w" : "lr w"],
      [6, (ship[i] || "").toUpperCase(), i === 2 ? "lrb w" : "lr w"],
    )),
    band("3. Goods Details"),
    R([2, "HSN Code", "lrtb b w c"], [4, "Product Name & Desc.", "lrtb b w c"],
      [2, "Quantity", "lrtb b w c"], [2, "Taxable Amount Rs.", "lrtb b w c"],
      [2, "Tax Rate (C+S+I+Cess+Cess Non.Advol)", "lrtb b w c"]),
    ...goods.map((g) => R(
      [2, g.hsn, "lrtb c"], [4, g.names.join(" & "), "lrtb w"],
      [2, `${num(g.pieces, 2)} PCS`, "lrtb c"], [2, money(g.taxable), "lrtb r"],
      [2, `NE+NE+${g.rate.toFixed(3)}+NE+0.00`, "lrtb c w"],
    )),
    R([2, "Tot. Tax'ble Amt", "lrtb b w c"], [1, "CGST Amt", "lrtb b w c"],
      [1, "SGST Amt", "lrtb b w c"], [2, "IGST Amt", "lrtb b w c"],
      [1, "CESS Amt", "lrtb b w c"], [2, "CESS Non.Advol Amt", "lrtb b w c"],
      [1, "Other Amt", "lrtb b w c"], [2, "Total Inv.Amt", "lrtb b w c"]),
    R([2, money(taxable), "lrtb c"], [1, "0.00", "lrtb c"], [1, "0.00", "lrtb c"],
      [2, money(igst), "lrtb c"], [1, "0.00", "lrtb c"], [2, "0.00", "lrtb c"],
      [1, "0.00", "lrtb c"], [2, money(taxable + igst), "lrtb c"]),
    band("4. Transportation Details"),
    R([6, "Transporter ID & Name : ", "lrtb"],
      [6, `Transporter Doc. No & Date : ${slashDate(ctx.inv.date)}`, "lrtb"]),
    band("5. Vehicle Details"),
    R([1, "Mode", "lrtb b w c"], [3, "Vehicle / Trans Doc No & Dt.", "lrtb b w c"],
      [2, "From", "lrtb b w c"], [2, "Entered Date", "lrtb b w c"],
      [2, "Entered By", "lrtb b w c"], [1, "CEWB No. (If any)", "lrtb b w c"],
      [1, "Portal", "lrtb b w c"]),
    R([1, "Road", "lrtb c"], [3, "", "lrtb"],
      [2, (from?.place || "").toUpperCase(), "lrtb c"], [2, "", "lrtb c"],
      [2, E.gstin || "", "lrtb c"], [1, "-", "lrtb c"], [1, "1", "lrtb c"]),
  ];
}

/* ============================================================================
   28 · Cost sheets — what the exporter shows the chamber so it can issue the
   certificate of origin (Docs/Jaikvin Process/Numbering/28-Cost-Sheets.xlsx).

   Their workbook is one sheet per factory: what that factory made, what it was
   bought for, what it cost to process and what it is being exported at. So this
   is one sheet per supplier on the invoice, in the order the packing list runs
   them, on the same grey ground and the same printed letterhead the suppliers'
   details (23) carries.

   The four figures under the FOB price are the costing the app already keeps
   (35): what was paid the factory, the cartons the goods travel in, and the
   overhead and profit that make up the rest. They add to the FOB exactly, which
   is what the chamber checks. Their own copy splits the last two on a ratio of
   their own; taking the app's keeps the cost sheet and the costing report
   saying the same thing about the same shipment.                            */

export const CS_BASE = [6.7109375, 9.140625, 9.140625, 10.28515625, 9.140625, 9.140625,
  9.140625, 9.140625, 9.140625, 9.140625, 10.28515625, 9.140625];

export const CS_W = CS_BASE.map((w) => Math.round(w * PKD_SCALE * 1e6) / 1e6);

export const CS_COL = CS_BASE.map((w) => Math.round(w * 5.5276 * 12700));

export const CS_ROW = Math.round(15 * 12700);

export const CS_HEAD = 7;

export const CS_PLACE = letterheadOver(CS_ROW, CS_HEAD);

/* The raw material every one of these goods is moulded or extruded from. Their
   sheet names it once, against the chapter heading it is imported under. */
export const CS_MATERIAL = { name: "POLYPROPYLENE", origin: "INDIA", hs: "3902", unit: "PCS" };

const CS_ALIGN = { c: "center", r: "right", l: "left" };

export function csStyle(spec) {
  const [edges, ...flags] = String(spec).split(" ");
  const align = flags.map((f) => CS_ALIGN[f]).find(Boolean);
  return {
    font: flags.includes("b") ? "calb" : "cal",
    border: edges === "-" ? false : edges,
    ...(flags.includes("g") ? { fill: "grey" } : {}),
    /* Everything in their four blocks stands centred in the row, wrapped
       labels included — the rows are deep enough to hold two lines. */
    ...(flags.includes("w") ? { wrap: true } : {}),
    valign: "center",
    ...(align ? { align } : {}),
  };
}

export const csClass = (spec) => chaClass(spec);

/* One factory's costing, on the model the costing report keeps (35): what the
   goods realise in rupees, what they were bought for, the cartons they travel
   in, and the overhead and profit that make up the difference. */
export function csCosting(ctx, arr) {
  const ex = exRate(ctx);
  const fob = sum(arr, "fobTotal") * ex;
  const purchase = sum(arr, "valTotal");
  const direct = sum(arr, "boxes") * 16;
  return { fob, purchase, direct, overhead: fob - purchase - direct };
}

/* One sheet's worth of the form, for one factory. */
export function cs28Rows(ctx, sp, arr) {
  const R = (...cells) => ({ cells });
  const H = (h, ...cells) => ({ cells, h });
  const c = csCosting(ctx, arr);
  const money = (n) => `₹ ${num(n, 2)}`;
  const hsn = [...new Set(arr.map((r) => hsnText(r.it)).filter(Boolean))].join(", ");
  const goods = packingGoods(PL_BANDS
    .filter(([k]) => arr.some((r) => familyOf(r.it) === k))
    .map(([key]) => ({ key })));
  // Two lines to a box, as their sheet rules them: the label over its second
  // line, and the figure against the first.
  const pair = (a, b, v) => [
    R([5, a, "lrt g"], [5, v, "lrt l g"], [2, "", "- g"]),
    R([5, b, "lrb g"], [5, "", "lrb l g"], [2, "", "- g"]),
  ];
  const head = (title) => [
    R([1, "No", "lrt g"], [2, "Name of Materials", "lrt g"], [1, "Country of", "lrt g"],
      [1, "HS", "lrt g"], [2, "BE / invoice No", "lrt g"], [1, "Per Unit", "lrt g"],
      [2, "Quantity used", "lrt g"], [2, "Value of material", "lrt g"]),
    R([1, "", "lr g"], [2, "Used", "lr g"], [1, "Origin", "lr g"], [1, "Code", "lr g"],
      [2, "& Date", "lr g"], [1, "", "lr g"], [2, "in the Finished", "lr g"], [2, "used in the", "lr g"]),
    R([1, "", "lrb g"], [2, "", "lrb g"], [1, "", "lrb g"], [1, "", "lrb g"], [2, "", "lb g"],
      [1, "", "lrb g"], [2, "Product", "lrb g"], [2, "Finished Product", "lrb g"]),
  ];
  const blank = () => R([1, "", "lrtb g"], [2, "", "ltb g"], [1, "", "lrtb g"], [1, "", "lrtb g"],
    [2, "", "ltb g"], [1, "", "lrtb g"], [2, "", "ltb g"], [2, "", "ltb g"]);

  return [
    ...Array.from({ length: CS_HEAD }, () => ({ cells: [[12, "", "- g"]], h: 15, lh: 1 })),
    R([12, "COST SHEET", "- c g"]),
    R([12, "(For Certificate of Origin to be issued to Manufacturer Exporter or Merchant Exporter)", "- c g"]),
    R([12, "", "- g"]),
    R([1, "Inv No", "- g"], [4, ctx.inv.invoiceNo || "", "-"], [1, "Date", "- g"],
      [4, ddmm(ctx.inv.date), "- l"], [2, "", "- g"]),
    R([12, "", "- g"]),
    R([5, "Name of the Finished Product", "lrtb g"], [5, goods, "lrtb g"], [2, "", "- g"]),
    R([5, "HS Code of the Product", "lrtb g"], [5, hsn, "lrtb l g"], [2, "", "- g"]),
    R([5, "FOB Price / Ex-Work Price of Product", "lrtb g"], [5, money(c.fob), "lrtb l"], [2, "", "- g"]),
    ...pair("1. Value of imported / undetermined : Origin", "    raw material", "NIL"),
    ...pair("2. Value of indigenous Raw Materials :", "", money(c.purchase)),
    ...pair("3. Direct Cost of Processing", "", money(c.direct)),
    ...pair("4. Overhead & Indirect Cost of Processing", "    Including Profit", money(c.overhead)),
    R([12, "", "t g"]),
    R([12, "(A) Details of Raw Materials of Imported / Undetermined Origin", "- g"]),
    R([12, "", "- g"]),
    ...head(),
    blank(),
    R([1, "", "lrtb g"], [11, "NOT APPLICABLE", "ltb c g"]),
    blank(),
    R([12, "", "t g"]),
    R([8, "", "- g"], [2, "TOTAL", "- g"], [2, "", "b g"]),
    R([12, "", "- g"]),
    R([12, "(B) Details of Raw Materials of Indian Origin", "- g"]),
    R([12, "", "b g"]),
    ...head(),
    /* The factory's own invoice for the material is not recorded here, so the
       column it is entered in is ruled and left, as the weighbridge's ticket is
       on the gross-mass declaration. */
    R([1, "1", "lrtb c g"], [2, CS_MATERIAL.name, "ltb g"], [1, CS_MATERIAL.origin, "lrtb g"],
      [1, CS_MATERIAL.hs, "lrtb c g"], [2, "", "ltb"], [1, CS_MATERIAL.unit, "lrtb g"],
      [2, "100%", "ltb c g"], [2, money(c.purchase), "ltb l"]),
    blank(),
    blank(),
    R([12, "", "t g"]),
    R([8, "", "- g"], [2, "TOTAL", "- g"], [2, money(c.purchase), "b l g"]),
    R([12, "", "- g"]),
    R([9, "Calculation of RVC/QVC/AIFTA Content as per the requirment of FTA / PTA / CEPA :", "- g"],
      [3, "", "b g"]),
    R([12, "", "- g"]),
    H(15, [12, "Seal", "- r"]),
    H(15, [12, "Stamp", "- r"]),
  ];
}

/* A cost sheet per factory on the invoice, in the order the packing list runs
   them. */
export function cs28Docs(ctx) {
  const lines = L(ctx), bySup = new Map();
  lines.forEach((x) => { if (!bySup.has(x.supId)) bySup.set(x.supId, []); bySup.get(x.supId).push(x); });
  return [...bySup.entries()].map(([sid, arr]) => {
    const sp = supFor(ctx, sid);
    return { supplierId: sid, code: sp.code || String(sid), name: sp.name || String(sid), rows: cs28Rows(ctx, sp, arr) };
  });
}

/* ============================================================================
   30 · Letter to the buyer — what goes out with the scanned documents once the
   container has sailed (Docs/Jaikvin Process/Numbering/30-Letter to Buyer.xlsx).

   A letter rather than a form: their printed letterhead across the head of it,
   the buyer's address, one ruled line describing the shipment, the enclosures
   numbered, the remittance asked for, and the signature and stamp at the foot.
   The last two are the client's own scans, which is why this paper is signed
   where the rest are left blank for a wet signature.                        */

/* Their seventeen columns. The sixth and seventh are the same width and their
   file states them as one range, which is easy to read as a single column —
   do that and everything from the sixth rightwards sits a column out of place,
   and the last of them takes the width of the sheet's default instead. */
export const LTB_BASE = [3.15, 2.29, 5.14, 7, 5.14, 2.86, 2.86, 3, 4, 3, 12.57,
  7.29, 10.57, 15.14, 9, 9.42, 12];

export const LTB_W = LTB_BASE.map((w) => Math.round(w * PKD_SCALE * 1e6) / 1e6);

export const LTB_COL = LTB_BASE.map((w) => Math.round(w * 5.5276 * 12700));

export const LTB_ROW = Math.round(15 * 12700);

export const LTB_HEAD = 7;

export const LTB_PLACE = letterheadOver(LTB_ROW, LTB_HEAD);

/* Where the signature and the stamp go: four rows deep at the foot, the block
   against the left margin and the stamp a little to the right of it, as the
   client signs and stamps their own copy. */
export const LTB_SIGN_CX = 2522080;
export const LTB_STAMP_CX = 735840;

/* The credit the buyer is given — their letter asks for the remittance thirty
   five days after the container sails, and names the day of the week it falls
   on so the buyer can diarise it. */
export const LTB_CREDIT_DAYS = 35;

/* Where the money goes. Their letter prints the branch, the SWIFT and the IFSC
   with the account, none of which the shipment record carries. */
export const LTB_BANK = {
  line1: "HDFC BANK LTD, Ghatkopar E Branch, Mumbai - SWIFT - HDFCINBBXXX , IFSC CODE: HDFC0000118",
  line2: "for credit to :Jaikvin Global, Mumbai A/C No. 50200050724100.",
};

/* The papers that travel with the letter, in the order it lists them. The first
   two carry the numbers and dates of the invoice and the bill of lading. */
export const LTB_ENCLOSURES = ["Packing List", "Packaging Declaration",
  "Container Weight Declaration (CWD)", "Certificate of Origin"];

const LTB_ALIGN = { c: "center", r: "right", l: "left" };

export function ltbStyle(spec) {
  const [edges, ...flags] = String(spec).split(" ");
  const align = flags.map((f) => LTB_ALIGN[f]).find(Boolean);
  return {
    font: flags.includes("b") ? "refb" : "ref",
    border: edges === "-" ? false : edges,
    /* Everything in their four blocks stands centred in the row, wrapped
       labels included — the rows are deep enough to hold two lines. */
    ...(flags.includes("w") ? { wrap: true } : {}),
    valign: "center",
    ...(align ? { align } : {}),
  };
}

export const ltbClass = (spec) => chaClass(spec);

/* The remittance date and the day it falls on. */
export function ltbDue(ctx) {
  const s = ctx.inv.ship || {};
  const sailed = s.blDate || ctx.inv.date;
  if (!sailed) return { day: "", date: "" };
  const d = new Date(sailed);
  d.setDate(d.getDate() + LTB_CREDIT_DAYS);
  return { day: d.toLocaleDateString("en-US", { weekday: "long" }), date: ddmm(d) };
}

export function ltb30Rows(ctx) {
  const E = ctx.EXPORTER, b = ctx.buyer, s = ctx.inv.ship || {};
  const rows = L(ctx);
  const R = (...cells) => ({ cells });
  const GAP = { cells: [[17, "", "-"]] };
  const bAddr = addrLines({ addr: b.addr });
  const due = ltbDue(ctx);
  const goods = packingGoods(packingBands(ctx));

  return [
    ...Array.from({ length: LTB_HEAD }, () => ({ cells: [[17, "", "-"]], lh: 1 })),
    /* Their own letter number runs in a series this system does not keep, so
       the line is left for it as the reference on the letter to the CHA is. */
    R([17, "", "-"]),
    R([17, LETTER_DATE(s.blDate || ctx.inv.date), "- l"]),
    GAP,
    R([17, `Messrs. ${b.brand || b.name || ""},`, "- l"]),
    ...[bAddr[0], bAddr[1], b.country ? `(${b.country})` : ""]
      .filter(Boolean).map((line) => R([17, line, "- l"])),
    /* The buyer's own contact is not kept here, so the line is printed for it
       to be written on. */
    R([3, "Kind Attn :", "-"], [14, "", "- l"]),
    GAP,
    R([2, "Ref :", "-"], [2, "Shipment of ", "-"], [1, String(sum(rows, "boxes")), "b c"],
      [3, "Packages", "-"], [9, goods, "b"]),
    /* The line the container sails with is not kept here either, so that box is
       ruled and left the way their own copy rules it. */
    R([1, "", "-"], [2, "per", "-"], [7, s.vessel || "", "b"], [1, "Ship of", "t"],
      [1, "", "tb"], [2, "Ship Sailed on ", "t"],
      [2, s.blDate ? ddmm(s.blDate) : "", "tb l"], [1, "", "-"]),
    R([4, "Your PO Nos", "-"], [13, poHeaderList(ctx), "b"]),
    GAP,
    R([17, "With reference to the above, hope you must have received our E-mail of this date, giving full shipment details.", "- l"]),
    GAP,
    R([17, "Enclosed please find herewith the following Scanned Documents duly signed:", "- l"]),
    GAP,
    R([1, "1", "-"], [7, `Our Invoice No : ${ctx.inv.invoiceNo || ""}`, "-"],
      [1, "Dt", "-"], [2, ddmm(ctx.inv.date), "b l"], [2, "for US$", "-"],
      [4, usd(sum(rows, "fobTotal")).replace(/^\$\s*/, ""), "b l"]),
    R([1, "2", "-"], [2, "B/L No. ", "-"], [5, s.blNo || "", "b l"], [1, "Dt", "-"],
      [2, s.blDate ? ddmm(s.blDate) : "", "b l"], [6, "", "-"]),
    ...LTB_ENCLOSURES.map((t, i) => R([1, String(i + 3), "-"], [16, t, "-"])),
    GAP,
    R([17, "We hope you will find the above in order.", "-"]),
    GAP,
    R([17, `Kindly arrange the remittance on ${due.day} ${due.date} (Shipment Date + ${LTB_CREDIT_DAYS} Days). This is due to forward`, "-"]),
    R([17, "contract as per our understanding.", "-"]),
    GAP,
    R([17, `Remittance to ${LTB_BANK.line1}`, "-"]),
    R([17, LTB_BANK.line2, "- b"]),
    GAP,
    R([17, "Please advice the remittance details upon doing so enabling us to check with our bankers.", "-"]),
    GAP,
    R([17, "Hope you will receive the consignment in good order and will open out your entire satisfaction.", "-"]),
    GAP,
    R([17, "Assuring you for our best services at all times.", "-"]),
    GAP,
    R([17, "Thanking You,", "-"]),
    GAP,
    R([17, "Yours Faithfully,", "-"]),
    // The four rows the signature and the stamp stand over.
    ...Array.from({ length: 5 }, () => ({ cells: [[17, "", "-"]], sg: 1 })),
    GAP,
    R([2, "Encl :", "-"], [15, "a/a.", "-"]),
  ];
}

/* ============================================================================
   40 · Export bill regularisation — what goes to the bank so it can issue the
   BRC once the money has landed (Docs/Jaikvin Process/Numbering/
   40-Export Bill Regularisation Submission.xlsx).

   A letter on their printed letterhead with four ruled blocks under it — the
   invoice, the shipping bill, the FIRC and the transport documents — and then
   the standing declarations the bank requires: FEMA, OFAC, and the three
   pro-formas that are filled in only if they apply (a buyer/remitter mismatch,
   a remittance more than 270 days late, a reduction in the invoice value).
   Those three are printed with their blanks, as their file prints them: they
   are forms to be completed by hand if the case arises, not statements this
   shipment makes.

   The FIRC's own number, its value date and the amount remitted are the bank's
   to supply — they come back with the remittance — so those boxes are ruled
   and left, as the weighbridge's ticket is on the gross-mass declaration.   */

export const EBR_AD_CODE = "0510001";

/* The account the proceeds are credited to — the same one the letter to the
   buyer asks for the remittance into (30). */
export const EBR_ACCOUNT = "50200050724100";

/* Why the documents are late, as their copy states it. */
export const EBR_DELAY_REASON = "AWAITING PAYMENT";

export const EBR_FEMA = [
  "I / We hereby declare that the above transaction does not involve, and is not designed for the purpose of any ",
  "contravention or evasion of the provisions of the FEMA 1999 or of any rule, regulation, notification, direction or order ",
  "made thereunder. I / We also hereby agree and undertake to give such information / documents as will reasonably",
  "satisfy you about this transaction in terms of the above declaration. I / We also undertake that if I / We refuse to ",
  "comply with any such requirements or make only unsatisfactory compliance therewith, the bank shall refuse in ",
  "writing to undertake the transaction and shall if it has reason to believe that any contravention / evasion is ",
  "contemplated by me / us report the matter to Reserve Bank Of India. *I / We further declare that the undersigned ",
  "has / have the authority to give this declaration and undertaking on behalf of the firm / company.",
];

export const EBR_OFAC = [
  "I / We hereby declare that the above transaction does not involve, and is not designed for the purpose of any",
  "contravention or evasion of the provisions of the OFAC.",
];

export const EBR_MISMATCH = [
  "Export consignment of............ (FCY Amount) vide GR Form / shipping bill no.....… dated …....",
  "The ……………………………………. (description of goods and quantity) was exported to M/s …………………………",
  "(name and country of the buyer). The invoice/ proforma invoice number is ……………..dated …….. (Copy ",
  "enclosed).",
  "We have received the proceeds / advance amount for the above invoice (FIRC number is ..............) from M/s ",
  "……………………… (name of the remitter and country) and not from the buyer due ",
  "to............................................................................... (reasons)",
  "",
  "We declare that the money has been remitted through normal banking channel and request you to kindly ",
  "adjust the export bill ……………vide above invoice number…… against the amount received........(FCY Amount) ",
  "vide your FIRC no. ……dated………. We also confirm that we are in the business of exports for a period of more ",
  "than six months.",
  "",
  "We also indemnify you against any possible loss arising due to whatsoever reasons in processing this ",
  "transaction.",
];

export const EBR_270 = [
  "This is to inform that We have received funds from consignee after 270 days due to___________",
  "________________________________(reason) whereas ship on board date is _______________",
  "",
  "Details of invoices are as below--",
];

export const EBR_REDUCTION = [
  /* One line in their file, set to justify, so it overflows into the blank row
     beneath it. Typed as the two lines it actually prints as, so everything
     under it stands where theirs does. */
  "M/s (exporter)……..requests you to permit reduction in invoice value in respect of Inv No……… drawn by us on",
  "(buyer’s name) ",
  "Inv no. ……", "", "Amount……", "", "Consignee……", "",
  "Shipping bill number…………….", "", "Shipping bill amount …………….", "", "Reduction amount………", "",
  "We hereby declare as follows:", "",
  "1.The reduction does not exceed 25 percent of the invoice value", "",
  "2.It does not relate to export commodities subject to floor price stipulations.", "",
  "3.M/s ……….(exporter)is not on the exporter’s caution list of Reserve Bank of India.", "",
  "4.M/s (exporter) undertakes to surrender proportionate export incentives availed.",
];

const EBR_ALIGN = { c: "center", r: "right", l: "left" };

export function ebrStyle(spec) {
  const [edges, ...flags] = String(spec).split(" ");
  /* The Arial half of the letter is typed plain and left to spill; the Calibri
     declarations under it are set justified, which is what gives them their
     stretched word spacing. */
  const align = flags.map((f) => EBR_ALIGN[f]).find(Boolean)
    || (flags.includes("j") ? "justify" : "");
  return {
    font: flags.includes("j") ? (flags.includes("b") ? "calb" : "cal")
      : flags.includes("b") ? "refb" : "ref",
    border: edges === "-" ? false : edges,
    /* Everything in their four blocks stands centred in the row, wrapped
       labels included — the rows are deep enough to hold two lines. */
    ...(flags.includes("w") ? { wrap: true } : {}),
    valign: "center",
    ...(align ? { align } : {}),
  };
}

export const ebrClass = (spec) => chaClass(spec);

/* Their paper is the declaration's (21) — the same ten columns, the same
   letterhead across the head of it. */
export const EBR_BASE = [PKD_DEFAULT_W, PKD_DEFAULT_W, PKD_DEFAULT_W, 10.7109375, 10.28515625,
  10.42578125, 10.42578125, PKD_DEFAULT_W, PKD_DEFAULT_W, PKD_DEFAULT_W];

export const EBR_W = EBR_BASE.map((w) => Math.round(w * PKD_SCALE * 1e6) / 1e6);

export const EBR_HEAD = 8;

/* Where the three pieces of the letterhead sit on this paper, corner to corner
   as their file draws them: the address across A to H, the mark's frame from
   there to J, and the globe inside it. */
export const EBR_HEAD_PLACE = headPlace({
  addr: { col: 0, colOff: 66675, row: 0, rowOff: 95250, to: { col: 7, colOff: 200025, row: 7, rowOff: 47625 } },
  box: { col: 7, colOff: 228600, row: 0, rowOff: 85725, to: { col: 9, colOff: 180975, row: 7, rowOff: 47625 } },
  mark: { col: 7, colOff: 371475, row: 1, rowOff: 28575, to: { col: 9, colOff: 47625, row: 6, rowOff: 114300 } },
}, PKD_COL_W, PKD_ROW);

export function ebr40Rows(ctx) {
  const E = ctx.EXPORTER, b = ctx.buyer, s = ctx.inv.ship || {};
  const rows = L(ctx);
  const R = (...cells) => ({ cells });
  const H = (h, ...cells) => ({ cells, h });
  const GAP = { cells: [[10, "", "-"]] };
  /* Their four ruled blocks stand on rows twice the depth of the letter's, and
     the declarations at the end on rows a little deeper again — which is what
     gives the form its spacing. Left to size themselves the rows come out tight
     where a line is short and deep where a label wraps, and the blocks read as
     a squashed copy of the form. */
  const BLOCK = 25.5, DECL = 15, TBL = 15.75;
  const GAPB = { cells: [[10, "", "-"]], h: BLOCK };
  const fob = sum(rows, "fobTotal");
  const money = (n) => Number(n || 0).toFixed(2);
  const dated = (d) => (d ? ddmm(d) : "");
  const party = `MESSRS ${(b.name || "").toUpperCase()}`;
  // A block's heading, then its lines: label, answer, label, answer.
  const head = (t) => H(BLOCK, [10, t, "lrtb b c"]);
  const pair = (k1, v1, k2, v2) => H(BLOCK, [2, k1, "lrtb w"], [3, v1, "lrtb c"], [2, k2, "lrtb w"], [3, v2, "lrtb c"]);
  const wide = (k, v) => H(BLOCK, [2, k, "lrtb w"], [8, v, "lrtb c"]);

  return [
    ...Array.from({ length: EBR_HEAD }, () => ({ cells: [[10, "", "-"]], lh: 1 })),
    R([5, "To,", "-"], [5, dated(s.blDate || ctx.inv.date), "- r"]),
    R([10, "The Branch Manager", "-"]),
    R([10, `${s.bank || "HDFC Bank Ltd,"}`, "-"]),
    R([10, s.bankAddr || "Mumbai", "-"]),
    GAP,
    R([1, "Sub", "- b"], [9, "Submission of Export Invoices for issuance of BRC", "- b"]),
    GAP,
    R([10, "Dear Sir / Madam,", "-"]),
    GAP,
    R([10, "Please find below following export documents for processing ", "-"]),
    GAP,
    head("INVOICE DETAILS"),
    pair("Invoice No", ctx.inv.invoiceNo || "", "Invoice Date", dated(ctx.inv.date)),
    pair("Invoice Currency", "US DOLLARS", "Invoice Amount", `$${money(fob)}`),
    H(BLOCK, [3, "Buyer / Consignee Name", "lrtb w"], [7, party, "lrtb c"]),
    GAPB,
    head("SHIPPING BILL DETAILS"),
    pair("Shipping Bill No", s.sbNo || "", "Shipping Bill Date", dated(s.sbDate)),
    pair("Shipping Bill Amount", `$${money(fob)}`, "AD Code", EBR_AD_CODE),
    GAPB,
    head("FIRC DETAILS"),
    /* The FIRC's own number, its date and what was remitted come back from the
       bank with the money, so those boxes are ruled and left. */
    pair("FIRC / Inward No", "", "Value Date of Inward Remittance", ""),
    wide("Remitter Name", party),
    H(BLOCK, [2, "FIRC / Inward Amount", "lrtb w"], [3, "", "lrtb c"], [5, "", "lrtb"]),
    H(BLOCK, [2, "FIRC / Inward Utilise Amount", "lrtb w"], [3, `$${money(fob)}`, "lrtb c"], [5, "", "lrtb"]),
    H(BLOCK, [2, "Balance in FIRC", "lrtb b w"], [3, "", "lrtb c"], [5, "", "lrtb"]),
    GAPB,
    head("TRANSPORT DOCUMENT DETAILS"),
    pair("Shipped on Board Date", dated(s.blDate), "BL / Airway Bill No", s.blNo || ""),
    pair("PORT OF LOADING\n(COUNTRY)", s.pol || "", "PORT OF DISCHARGE\n(COUNTRY)",
      (s.finalDest || b.country || "").toUpperCase()),
    GAP,
    R([10, "We request you to process the above bills and issue BRC at your earliest. Charges if any should be debited to our", "-"]),
    R([10, `Current A/c No ${EBR_ACCOUNT}. Please note the documents are submitted after 21 days from the GR/Shipping Bill`, "-"]),
    R([10, `date as ${EBR_DELAY_REASON} (reason for delay in submitting the documents).  We are eligible to export the above`, "-"]),
    R([10, `mentioned goods under the current Foreign Trade Policy in place and our IEC Code is ${E.iec || ""}.`, "-"]),
    GAP,
    R([10, `In case of any queries please contact us on Tel No. ${E.tel || ""} or email us at ${E.email || ""}.`, "-"]),
    GAP,
    /* Their file breaks the page here: the letter and its four blocks come off
       one sheet, and the standing declarations start the next. */
    { cells: [[10, "FEMA DECLARATION", "- b"]], brk: true },
    ...EBR_FEMA.map((t) => R([10, t, "-"])),
    GAP,
    R([10, "OFAC DECLARATION", "- b"]),
    ...EBR_OFAC.map((t) => R([10, t, "-"])),
    GAP,
    R([10, "BUYER REMITTER MISMATCH DECLARATION (IF ANY)", "- b"]),
    ...EBR_MISMATCH.map((t) => R([10, t, "-"])),
    GAP,
    R([10, `For M/s. ${E.name}`, "-"]),
    GAP, GAP, GAP,
    R([10, "Proprietor.", "-"]),
    GAP,
    H(DECL, [10, "270 Days Delay Declaration for Invoice No.- (If Required)", "- b j"]),
    { cells: [[10, "", "- j"]], h: DECL },
    ...EBR_270.map((t) => H(DECL, [10, t, "- j"])),
    { cells: [[10, "", "- j"]], h: TBL },
    /* The five columns their form rules for the invoices the delay covers, with
       the three lines it leaves to write them on. */
    H(45.75, ...["Sr. No.", "Invoice No.", "Our  invoice in CCY", "Your Ref.", "Amount Received in CCY"]
      .map((h) => [2, h, "lrtb j w"])),
    ...["1", "2", "3"].map((n) => H(TBL, [2, n, "lrtb j"], ...Array.from({ length: 4 }, () => [2, "", "lrtb j"]))),
    { cells: [[10, "", "- j"]], h: DECL },
    H(DECL, [10, "You are requested to process this transaction.", "- j"]),
    H(DECL, [10, "For, ________________", "- j"]),
    { cells: [[10, "", "- j"]], h: DECL },
    H(DECL, [10, "Authorized Signatory.", "- j"]),
    { cells: [[10, "", "- j"]], h: DECL },
    H(DECL, [10, "DECLARATION FOR INVOICE REDUCTION:-(IF REQUIRED)", "- b j"]),
    { cells: [[10, "", "- j"]], h: DECL },
    ...EBR_REDUCTION.map((t) => H(DECL, [10, t, "- j"])),
    { cells: [[10, "", "- j"]], h: DECL },
    H(DECL, [10, "Yours truly,", "- j"]),
    H(DECL, [10, "For, ________________", "- j"]),
    { cells: [[10, "", "- j"]], h: DECL },
    H(DECL, [10, "Authorized Signatory.", "- j"]),
  ];
}

// 36–39 balance reports need the ledger — pass it in ctx.report (from Reports state) when available
export function buildBalanceReport(no, ctx, data) {
  if (no === "36" || no === "38") return balanceSupplier(ctx, data, no);
  if (no === "37") return balanceItem(ctx, data);
  if (no === "39") return balanceBoxes(ctx, data);
}

export function balanceItem(ctx, data) {
  const rows = data.itemRows || [];
  const cols = [
    { h: "Date", c: 1, f: (r) => dmy(r.date) }, { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "Description", f: (r) => esc(r.it.description) },
    { h: "PO(s)", f: (r) => r.pos.join(", ") }, { h: "Invoice(s)", f: (r) => [...(r.invoices || [])].join(", ") || "—" },
    { h: "Qty Pcs", r: 1, key: "qty", t: "int", v: (r) => r.qty, f: (r) => r.qty.toLocaleString("en-IN") },
    { h: "Vol/Box", r: 1, key: "volbox", t: "num3", v: (r) => r.it.volume, f: (r) => num(r.it.volume, 3) },
    { h: "Total Boxes", r: 1, key: "ordered", t: "int", v: (r) => r.ordered, f: (r) => r.ordered },
    { h: "Recd Boxes", r: 1, key: "recd", t: "int", v: (r) => r.recd, f: (r) => r.recd },
    { h: "Pending Boxes", r: 1, key: "pending", t: "int", fml: "{ordered}-{recd}", f: (r) => r.pending },
    { h: "Total Vol m³", r: 1, key: "vol", t: "num", fml: "{ordered}*{volbox}", f: (r) => num(r.volume, 2) },
  ];
  const foot = [{ v: "TOTAL", span: 5 }, { v: sum(rows, "qty").toLocaleString("en-IN"), r: 1, sum: "qty", t: "int" }, { v: "" },
    { v: sum(rows, "ordered"), r: 1, sum: "ordered", t: "int" }, { v: sum(rows, "recd"), r: 1, sum: "recd", t: "int" },
    { v: sum(rows, "pending"), r: 1, sum: "pending", t: "int" }, { v: num(sum(rows, "volume"), 2), r: 1, sum: "vol", t: "num" }];
  return { name: "Balance_Order_Itemwise_37", html: `<div class="title">37 · BALANCE ORDER ITEM WISE</div><div class="sub">As on ${dmy(ctx.inv.date)}</div>${tableOf(cols, rows, foot)}` };
}

export function balanceSupplier(ctx, data, no) {
  const rows = data.supRows || [];
  const cols = [
    { h: "Date", c: 1, f: (r) => dmy(r.date) }, { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "Supplier", f: (r) => esc(ctx.supCode ? ctx.supCode(r.supplierId) : r.supplierId) },
    { h: "Description", f: (r) => esc(r.it.description) }, { h: "Invoice(s)", f: (r) => [...(r.invoices || [])].join(", ") || "—" },
    { h: "Recd Boxes", r: 1, key: "recd", t: "int", v: (r) => r.recd, f: (r) => r.recd },
    { h: "Pending Boxes", r: 1, key: "pending", t: "int", v: (r) => r.pending, f: (r) => r.pending },
    { h: "Total Vol m³", r: 1, key: "vol", t: "num", fml: (r) => `{recd}*${Number(r.it.volume) || 0}`, f: (r) => num(r.volume, 2) },
    { h: "Invoice Value ₹", r: 1, key: "value", t: "inr", v: (r) => r.value, f: (r) => num(r.value) },
  ];
  const title = no === "38" ? "38 · SUPPLY DETAILS (Item wise / Supplier wise)" : "36 · BALANCE ORDER SUPPLIER WISE";
  const foot = [{ v: "TOTAL", span: 5 }, { v: sum(rows, "recd"), r: 1, sum: "recd", t: "int" },
    { v: sum(rows, "pending"), r: 1, sum: "pending", t: "int" },
    { v: num(sum(rows, "volume"), 2), r: 1, sum: "vol", t: "num" },
    { v: num(sum(rows, "value")), r: 1, sum: "value", t: "inr" }];
  return { name: `Balance_Supplierwise_${no}`, html: `<div class="title">${title}</div><div class="sub">As on ${dmy(ctx.inv.date)}</div>${tableOf(cols, rows, foot)}` };
}

export function balanceBoxes(ctx, data) {
  const rows = data.itemRows || [];
  const cols = [
    { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "Description", f: (r) => esc(r.it.description) },
    { h: "Pending Boxes", r: 1, key: "pending", t: "int", v: (r) => r.pending, f: (r) => r.pending },
    { h: "Vol/Box", r: 1, key: "volbox", t: "num3", v: (r) => r.it.volume, f: (r) => num(r.it.volume, 3) },
    { h: "Pending Vol m³", r: 1, key: "pendvol", t: "num", fml: "{pending}*{volbox}", f: (r) => num(r.pending * (r.it.volume || 0), 2) },
    { h: "Net/Box kg", r: 1, key: "netbox", t: "num", v: (r) => r.it.netPerBox, f: (r) => num(r.it.netPerBox) },
    { h: "Pending Net kg", r: 1, key: "pendnet", t: "num", fml: "{pending}*{netbox}", f: (r) => num(r.pending * (r.it.netPerBox || 0)) },
  ];
  const pendVol = rows.reduce((a, r) => a + r.pending * (r.it.volume || 0), 0), pendNet = rows.reduce((a, r) => a + r.pending * (r.it.netPerBox || 0), 0);
  const foot = [{ v: "TOTAL", span: 2 }, { v: sum(rows, "pending"), r: 1, sum: "pending", t: "int" }, { v: "" },
    { v: num(pendVol, 2), r: 1, sum: "pendvol", t: "num" }, { v: "" }, { v: num(pendNet), r: 1, sum: "pendnet", t: "num" }];
  return { name: "Balance_Boxes_Volume_39", html: `<div class="title">39 · BALANCE ORDERS — BOXES &amp; VOLUME</div><div class="sub">As on ${dmy(ctx.inv.date)}</div>${tableOf(cols, rows, foot)}` };
}

// Fallback for 36–39 when the live balance register isn't supplied (context = this invoice only).
export function balanceFallback(ctx, title, fname) {
  const rows = L(ctx);
  const cols = [
    { h: "GD Code", f: (r) => esc(r.it.gd) }, { h: "Supplier", f: (r) => esc(r.sup.code || "—") }, { h: "Description", f: (r) => esc(r.it.description) },
    { h: "Invoice", f: () => esc(ctx.inv.invoiceNo) },
    { h: "Recd Boxes", r: 1, key: "box", t: "int", v: (r) => r.boxes, f: (r) => r.boxes },
    { h: "Qty Pcs", r: 1, key: "qty", t: "int", fml: QTY_FROM_BOX, f: (r) => r.pieces.toLocaleString("en-IN") },
    { h: "Pcs / box", r: 1, key: "pack", t: "int", v: (r) => r.packing, f: (r) => r.packing },
    { h: "Total Vol m³", r: 1, key: "vol", t: "num", fml: (r) => `{box}*${Number(r.it.volume) || 0}`, f: (r) => num(r.volTotal, 2) },
    { h: "FOB/pc $", r: 1, key: "fobpc", t: "usd4", v: (r) => r.fobPc, f: (r) => usdp(r.fobPc) },
    { h: "Invoice Value $", r: 1, key: "val", t: "usd", fml: "{qty}*{fobpc}", f: (r) => usd(r.fobTotal) },
  ];
  const foot = [{ v: "TOTAL", span: 4 }, { v: sum(rows, "boxes"), r: 1, sum: "box", t: "int" },
    { v: sum(rows, "pieces").toLocaleString("en-IN"), r: 1, sum: "qty", t: "int" }, { v: "" },
    { v: num(sum(rows, "volTotal"), 2), r: 1, sum: "vol", t: "num" }, { v: "" },
    { v: usd(sum(rows, "fobTotal")), r: 1, sum: "val", t: "usd" }];
  return { name: fname, html: `<div class="title">${esc(title)}</div><div class="sub">Invoice ${esc(ctx.inv.invoiceNo)} DT ${ddmm(ctx.inv.date)} · open the Reports tab for the full live balance register across all invoices.</div>${tableOf(cols, rows, foot)}` };
}

/* ============================================================================
   34 · Container weight declaration — what the road carrier is handed before
   the box is moved (Docs/Jaikvin Process/Numbering/
   34-Container Weight Declaration Form (CWD).docx).

   Not one of the exporter's own papers: it is the Australian statutory form
   their forwarder issues, so it is printed as their file prints it — the title
   over three ruled blocks, the four ways of arriving at a weight, the space the
   declaration is signed in, and the seven notes the form carries. It is on no
   letterhead at all, which is why this one is not built on the letter paper the
   declarations either side of it use.

   Their file is a Word document, so the download beside the PDF hands over a
   .docx rather than a workbook — see WORD_DOCS in docs/index.js. */

/* The tare their form declares for the twenty-foot box, in kilograms. It is
   stamped on the container door rather than recorded here, and their own filled
   copy carries this figure, so it stands as the form's own. */
export const CWD_TARE = 2185;

/* The goods, as their form words them — the same three families the proforma
   bands the order into, said in one line. */
export const CWD_COMMODITY = "PP EXTRUDED PIPES , PP & NYLON MOULDED FITTINGS AND CORRUGATED BOXES";

/* The runs of choices their form prints for the carrier to ring. The one that
   applies is marked here rather than left to a pen: what this shipment is comes
   from the same facts document 27 declares — a full twenty-foot box of ordinary
   goods — so the two papers cannot contradict one another. */
export const CWD_STATUS = ["Full", "Empty"];
export const CWD_CARGO = ["General", "Hazardous", "Oversize", "Reefer"];
export const CWD_BOX = ["20ft", "40ft", "40HC", "Other"];
export const CWD_RING = { status: "Full", cargo: "General", box: "20ft", method: 3 };

/* The ink their form marks its own instructions in — the "circle where
   applicable" notes and the one over the load box. */
export const CWD_BLUE = "#0070C0";

/* Their form sets each weight as two lines — the figure, and the unit under it. */
export const CWD_UNIT = "Kgs";

/* The four ways of arriving at a weight, theirs verbatim. Their form rings the
   third on the signed copy — the box and what is in it, weighed together, which
   is what the weighbridge ticket behind document 27 certifies. */
export const CWD_METHOD = ["Estimation", "Weighing of Contents",
  "Weighing of Container & Contents", "Weighing of Truck & Container"];

/* The seven notes at the foot, theirs verbatim, and the line the form closes
   on. Note 1 runs to a second line on their sheet, so it is carried as two. */
export const CWD_NOTES = [
  "1. The “Responsible entity” is responsible for providing an accurate Container Weight Declaration (CWD):",
  "This is usually the person in Australia who engages the road carrier or offers the container for transport by road in Australia.",
  "2. Including details of the packer enables easy identification of the person who packed the container. The packer could also be the “responsible entity”.",
  "3. Separating the weight of the container and its contents ensures there is no confusion as to whether the declared weight is a net weight or a gross weight.",
  "4. This enables the person who is relying on the CWD to determine its likely accuracy.",
  "5. CWD details could be included in another document e.g., the Export Pre Receival Advice (PRA), or provided separately.",
  "6. The contents of the CWD must be readily available to an authorised officer or police officer who seeks to ascertain its contents, there and then in the presence of the container (whether by examining documents located on or in the vehicle or by obtaining the information by radio or mobile or other means).",
  "7. Information contained in the Container Weight Declaration is provided to Fremantle Mart International Pty Ltd by the responsible entity. Freight Mart International accepts no liability for any losses arising from any inaccuracy of information provided to Freight Mart International by the responsible entity.",
];

export const CWD_CLOSE = "The Container Weight Declaration (CWD) is a statutory requirement for all container movements (full or empty) and should be sent no later than the day prior to the scheduled movement.";

/* Their form dates the declaration with spaced slashes, as it is typed. */
export const cwdDate = (s) => slashDate(s).replace(/\//g, " / ");

/* What the form has to say, gathered off the shipment.

   The three weights are the ones their form separates on purpose — note 3 says
   why: the tare off the door, the goods as packed, and the two added. The
   packed weight is the shipment's own gross, which is a weighed figure; only
   the tare is the container's, and it is the form's own. */
export function cwd34(ctx) {
  const E = ctx.EXPORTER, b = ctx.buyer, s = ctx.inv.ship || {};
  const cargo = Number(s.grossWt) || sum(L(ctx), "grossTotal");
  const kg = (n) => Number(n || 0).toFixed(3);
  const line = (parts, sep = ", ") => parts.filter(Boolean).join(sep);
  return {
    container: s.container || "",
    /* Both parties are named the way their form names them: who they are and
       where, then the number they are reached on, on a line of its own. */
    consignor: [line([E.name, E.addr]), E.tel ? `Phone: +91${E.tel}` : ""].filter(Boolean),
    consignee: [
      line([`${b.name || ""}${b.brand ? `, T/A ${b.brand}` : ""}`, b.addr || b.shipTo,
        b.country ? `(${b.country})` : ""], ", "),
      b.tel ? `Tel : +${b.tel}` : "",
    ].filter(Boolean),
    tare: kg(CWD_TARE),
    cargo: kg(cargo),
    gross: kg(CWD_TARE + cargo),
    name: SIGNATORY.toUpperCase(),
    date: cwdDate(ctx.inv.ship?.blDate || ctx.inv.date),
  };
}
