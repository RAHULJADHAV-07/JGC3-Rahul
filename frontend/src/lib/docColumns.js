/* Document columns — Setup → Document columns.

   The client can hide or delete any column a document prints: pick the paper,
   pick the column, choose what happens to it. The 40 builders are left alone.
   Every document comes out of its builder as HTML (the preview and the PDF)
   and, for the papers that copy a client workbook, as a sheet model too (the
   Excel), and this works on both after the fact, finding a column by the
   heading printed over it.

   A column is named by its heading, normalised (`colKey`) so the same column
   is recognised wherever and however it is printed — "LEN (MM)" on the
   invoice, "LENGTH" over "MM" on the packing sheet — and so a heading that
   carries a date or a rate ("VALUE - 12.02.26") still matches next month. A
   heading over sub-headings is a group; its sub-columns are columns of their
   own ("PACKING › UNIT"), and so is the group as a whole.

   What happens to a chosen column:

     hide    — not on the preview or the PDF; in the Excel the column is hidden
               (still in the file, right-click → Unhide brings it back).
     delete  — not on the preview or the PDF; in the Excel it is hidden and its
               values cleared — except a figure another cell's formula reads,
               which stays (hidden) so no total quietly changes.

   How it is taken out of a table, which is the delicate part:

     · A heading belongs to a header band (consecutive header rows) and rules
       the rows under it down to the next band — the goods of one range on the
       invoice, each with its own headings.
     · The grid columns every occurrence of the heading agrees on are taken out
       of the whole table, below the first header band. Where one band prints
       the heading wider (the corrugated boxes' SIZE over two columns), that
       band's cells under it are blanked instead.
     · Nothing above a table's first header band is ever lost: a column that
       carries anything there (a form's own head — the consignee, the ports) is
       blanked under its heading rather than taken out.
     · The column then goes outright, so the paper closes up — no empty
       strip where it was. A ruled form (one with its own column widths)
       shares the column's width out over the columns it keeps. */

/* ---------- naming a column ---------- */

const SYNONYMS = {
  LEN: "LENGTH", LENGHT: "LENGTH", QTY: "QUANTITY", VOLUMN: "VOLUME", VOL: "VOLUME",
  NETT: "NET", WT: "WEIGHT", WGT: "WEIGHT", LABLES: "LABEL", LABLE: "LABEL", AMT: "AMOUNT",
  DESC: "DESCRIPTION", DESCRIPTIONS: "DESCRIPTION", NOS: "NO", NUMBER: "NO", NUM: "NO",
  PCS: "PIECE", PC: "PIECE", BOXES: "BOX", CTN: "BOX", CTNS: "BOX", KGS: "KG",
};

const word = (w) => {
  const s = SYNONYMS[w] || w;
  // Plurals read as one column: CODES / CODE, PIECES / PIECE — not GROSS.
  return s.length > 3 && s.endsWith("S") && !s.endsWith("SS") ? s.slice(0, -1) : s;
};

/** The name a heading is matched by, here and across the other documents. */
export function colKey(label) {
  const raw = String(label || "").toUpperCase().replace(/\s+/g, " ").trim();
  const k = raw
    .replace(/&/g, " AND ")
    .replace(/\([^)]*\)/g, " ")                              // units: (MM), (IN / MM)
    .replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/g, " ")    // a date in the heading
    .replace(/[^A-Z0-9%]+/g, " ")
    .split(" ").filter(Boolean)
    .filter((w) => !/^\d+(\.\d+)?$/.test(w))                 // a rate in the heading
    .map(word).join(" ");
  if (k) return k;
  /* A heading that is nothing but a figure names the column by what it is —
     the date its values are dated, the rate they are taken at — so it still
     matches when the figure changes. */
  if (/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(raw)) return "DATE";
  if (/\d/.test(raw)) return "RATE";
  return raw;
}

const keyOf = (parts) => parts.map(colKey).join(" > ");
const labelOf = (parts) => parts.join(" › ");

/* ---------- reading a table as a grid ---------- */

const cellText = (el) => String(el.textContent || "").replace(/\s+/g, " ").trim();

/* What marks a heading, across the library's three ways of printing one:
   a <th> (the workbook-style grids); a heading cell or a heading row on the
   invoice-style forms (`h` / `hd` on a ruled `ci` table, `tr.hc` and
   `colh` on the packing list, `tr.hd` on the e-way bill's goods); and a row of bold boxed
   cells on the typed forms (the suppliers' details, the e-way bill). */
const BOXED = ["el", "er", "et", "eb"];
function isHead(el, tr, table) {
  // `colh` marks a heading a form draws as a plain cell (the packing list's).
  if (el.tagName === "TH" || el.classList.contains("colh")) return true;
  const ci = table.classList.contains("ci");
  if (ci && (el.classList.contains("h") || el.classList.contains("hd"))) return true;
  if (tr.classList.contains("hc") || (tr.classList.contains("hd") && !ci)) return true;
  const full = [...tr.cells].filter((c) => cellText(c));
  return full.length >= 2 && full.every((c) => c.classList.contains("fb") && BOXED.every((b) => c.classList.contains(b)));
}

/* An HTML table's own rows (not a nested table's) as positioned cells. */
function htmlGrid(table) {
  const cells = [];
  const taken = [];                    // row → Set of columns a rowspan holds
  const own = [...table.rows];
  own.forEach((tr, r) => {
    let c = 0;
    [...tr.cells].forEach((el) => {
      while (taken[r]?.has(c)) c++;
      const cs = Math.max(1, el.colSpan || 1), rs = Math.max(1, el.rowSpan || 1);
      for (let rr = r; rr < r + rs; rr++) {
        taken[rr] ||= new Set();
        for (let cc = c; cc < c + cs; cc++) taken[rr].add(cc);
      }
      cells.push({
        r0: r, r1: r + rs - 1, c0: c, c1: c + cs - 1, text: cellText(el), el,
        head: isHead(el, tr, table),
      });
      c += cs;
    });
  });
  return { cells, rows: own.length, cols: cells.reduce((m, x) => Math.max(m, x.c1 + 1), 0) };
}

const A1 = /^([A-Z]+)(\d+)$/;
const colNo = (letters) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/* A sheet model's rows and merges as positioned cells. Which are headings is
   decided by the caller (a sheet has no <th>). */
function sheetGrid(sheet) {
  const rows = sheet.rows || [];
  const under = new Map();             // "r,c" of a merge's covered cells → its anchor
  const span = new Map();
  (sheet.merges || []).forEach((m) => {
    const [a, b] = String(m).split(":");
    const x = A1.exec(a), y = A1.exec(b || a);
    if (!x || !y) return;
    const r0 = Number(x[2]) - 1, c0 = colNo(x[1]), r1 = Number(y[2]) - 1, c1 = colNo(y[1]);
    span.set(`${r0},${c0}`, { r1, c1 });
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (r !== r0 || c !== c0) under.set(`${r},${c}`, 1);
  });
  const cells = [];
  let cols = 0;
  rows.forEach((row, r) => (row || []).forEach((raw, c) => {
    if (under.has(`${r},${c}`)) return;
    const s = span.get(`${r},${c}`) || { r1: r, c1: c };
    const v = raw && typeof raw === "object" ? (raw.v ?? (Array.isArray(raw.rt) ? raw.rt.map((x) => x.t).join("") : "")) : raw;
    cells.push({ r0: r, r1: s.r1, c0: c, c1: s.c1, text: String(v ?? "").replace(/\s+/g, " ").trim(), raw, at: [r, c] });
    cols = Math.max(cols, s.c1 + 1);
  }));
  (sheet.widths || []).length > cols && (cols = sheet.widths.length);
  return { cells, rows: rows.length, cols };
}

/* ---------- the columns of one grid ---------- */

/* Header bands, each heading's leaf columns and the rows each one rules. */
function columnsOf(grid) {
  const heads = grid.cells.filter((x) => x.head && x.text);
  if (!heads.length) return { leaves: [], firstBand: grid.rows };
  const headRows = new Set();
  heads.forEach((h) => { for (let r = h.r0; r <= h.r1; r++) headRows.add(r); });
  const bands = [];
  [...headRows].sort((a, b) => a - b).forEach((r) => {
    const last = bands[bands.length - 1];
    if (last && last.r1 === r - 1) last.r1 = r; else bands.push({ r0: r, r1: r });
  });
  bands.forEach((b, i) => { b.end = i + 1 < bands.length ? bands[i + 1].r0 - 1 : grid.rows - 1; });

  const leaves = [];
  bands.forEach((band) => {
    const inBand = heads.filter((h) => h.r0 >= band.r0 && h.r0 <= band.r1);
    const within = (a, b) => b.c0 >= a.c0 && b.c1 <= a.c1 && b.r0 > a.r0;
    const overlaps = (a, b) => b.c0 <= a.c1 && b.c1 >= a.c0;
    inBand.forEach((h) => {
      const up = inBand.filter((p) => within(p, h)).sort((a, b) => a.r0 - b.r0);
      /* A unit under a heading ("MM" under SIZE) is the heading's, not a
         column of its own. */
      if (up.some((p) => p.c0 === h.c0 && p.c1 === h.c1)) return;
      /* A label laid across several headings above it (a range's name in the
         sub-heading row) heads no column. */
      if (inBand.filter((p) => p.r0 < h.r0 && overlaps(p, h) && !within(p, h)).length >= 2) return;
      const parts = [...up.map((p) => p.text), h.text];
      leaves.push({ key: keyOf(parts), label: labelOf(parts), c0: h.c0, c1: h.c1, band, cell: h, end: band.end });
    });
  });

  /* How far down a heading reaches. A heading of the table's own header row
     rules everything under it — the sub-headings printed inside its width
     further down (CODE / SIZE / LEN under "Description of Goods" on the
     invoice, PIECES under "Quantity") and their goods — until a heading
     further down straddles its edge, or the table's headings are printed over
     again. A sub-heading rules its own group only: "Qty/Pkg-Pcs" over the
     pipes is not "Qty/Ctn-Pcs" over the fittings, though they share the
     column. */
  const tops = leaves.filter((l) => l.band === bands[0]);
  const top = new Set(tops.map((l) => l.key));
  /* A later header row is a sub-heading row only when each of its headings
     sits inside one heading of the table's own header row; one that does not
     (the e-way bill's "3. Goods Details" under its "From" / "To") starts a
     new section, and no heading above reaches past it. */
  const nested = bands.map((b) => leaves.filter((x) => x.band === b)
    .every((x) => tops.some((t) => x.c0 >= t.c0 && x.c1 <= t.c1)));
  leaves.forEach((l) => {
    if (l.band !== bands[0]) return;
    for (let i = 1; i < bands.length; i++) {
      if (!nested[i]) break;
      const stop = leaves.some((x) => {
        if (x.band !== bands[i] || x.c1 < l.c0 || x.c0 > l.c1) return false;
        if (x.c0 < l.c0 || x.c1 > l.c1) return true;   // straddles its edge
        return top.has(x.key);                          // the headings again
      });
      if (stop) break;
      l.end = bands[i].end;
    }
  });
  /* …and nothing reaches past a section title across the whole table ("3.
     Goods Details" on the e-way bill). */
  const titles = grid.cells.filter((x) => !x.head && x.text && x.c0 === 0 && x.c1 >= grid.cols - 1)
    .map((x) => x.r0);
  leaves.forEach((l) => {
    const t = titles.filter((r) => r > l.band.r1 && r <= l.end);
    if (t.length) l.end = Math.min(...t) - 1;
  });
  return { leaves, firstBand: bands[0].r0 };
}

/* ---------- discovering a document's columns ---------- */

const parseHtml = (html) => (typeof DOMParser === "undefined" ? null
  : new DOMParser().parseFromString(`<body><div id="jg-root">${html}</div></body>`, "text/html"));

/** Every column a document's HTML prints: [{ key, label }], in reading order. */
export function discoverColumns(html) {
  const doc = parseHtml(html);
  if (!doc) return [];
  const seen = new Map();
  doc.querySelectorAll("table").forEach((t) => {
    columnsOf(htmlGrid(t)).leaves.forEach((l) => {
      if (!seen.has(l.key)) seen.set(l.key, { key: l.key, label: l.label });
    });
  });
  return [...seen.values()];
}

/* ---------- taking columns out ---------- */

/* Which grid columns to take out of a table, and which cells to blank where
   a band prints the heading wider than the rest do. */
function plan(grid, rules) {
  const { leaves, firstBand } = columnsOf(grid);
  const chosen = leaves.filter((l) => rules[l.key]);
  if (!chosen.length) return null;
  const byKey = new Map();
  chosen.forEach((l) => { if (!byKey.has(l.key)) byKey.set(l.key, []); byKey.get(l.key).push(l); });

  const collapse = new Set();
  const blank = new Set();             // cells
  byKey.forEach((occ) => {
    // The columns every occurrence agrees on…
    let common = null;
    occ.forEach((o) => {
      const mine = new Set(); for (let c = o.c0; c <= o.c1; c++) mine.add(c);
      common = common ? new Set([...common].filter((c) => mine.has(c))) : mine;
    });
    common.forEach((c) => collapse.add(c));
    /* …and every cell under the heading, as far down as it reaches — with
       a line that starts in its column and runs mostly inside it (the
       goods' description over the description column), which is the
       column's own text, not its neighbour's. */
    occ.forEach((o) => grid.cells.forEach((x) => {
      if (x.r0 < o.band.r0 || x.r1 > o.end || x.c0 < o.c0 || x.c0 > o.c1) return;
      const inside = Math.min(x.c1, o.c1) - x.c0 + 1;
      if (x.c1 <= o.c1 || (!x.head && inside * 2 > x.c1 - x.c0 + 1)) blank.add(x);
    }));
  });

  /* A grid column another band prints a different heading over is that
     band's column as well ("Qty/Ctn-Pcs" under the fittings where the pipes
     have "Qty/Pkg-Pcs"): it stays, and only the chosen heading's cells go —
     folded into the cell beside them. A heading's own group, and every
     sub-heading within its reach (CODE / SIZE / LEN under the description
     of goods), is the same column, not another one. */
  const kin = (x) => chosen.some((l) => l.key === x.key || l.key.startsWith(`${x.key} > `) || x.key.startsWith(`${l.key} > `)
    || (x.band.r0 > l.band.r0 && x.band.r0 <= l.end && x.c0 >= l.c0 && x.c1 <= l.c1));
  leaves.forEach((l) => {
    if (kin(l)) return;
    for (let c = l.c0; c <= l.c1; c++) collapse.delete(c);
  });

  /* Never take out a column that carries anything above the table's first
     header band — that is the form's own head, not the column. The columns
     held back for it are noted: a ruled form can part its head from its
     goods and take them out of the goods all the same (applyTable). */
  const held = new Set();
  grid.cells.forEach((x) => {
    if (x.r0 >= firstBand || !x.text) return;
    let inside = true;
    for (let c = x.c0; c <= x.c1; c++) if (!collapse.has(c)) { inside = false; break; }
    if (inside) for (let c = x.c0; c <= x.c1; c++) { collapse.delete(c); held.add(c); }
  });

  /* Below the first band, everything wholly inside a column taken out goes
     with it. */
  grid.cells.forEach((x) => {
    if (x.r0 < firstBand) return;
    let inside = true;
    for (let c = x.c0; c <= x.c1; c++) if (!collapse.has(c)) { inside = false; break; }
    if (inside) blank.add(x);
  });
  return { collapse, blank, firstBand, held };
}

const wholly = (x, cols) => {
  for (let c = x.c0; c <= x.c1; c++) if (!cols.has(c)) return false;
  return true;
};

/* Each cell in `spill` is folded into the cell on its left in the same row
   (or, at the start of a row, the one on its right), which widens over it.
   `join(y, x)` does the folding for the medium; y's range is already widened.
   A cell nobody can take in is left blank where it is. */
function absorb(grid, spill, join, may = () => true) {
  const out = new Set(spill);
  const live = grid.cells.filter((x) => !x.gone);
  [...spill].sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0).forEach((x) => {
    if (!may(x)) return;
    const row = live.filter((y) => !y.gone && !out.has(y) && y.r0 === x.r0 && y.r1 === x.r1);
    const y = row.find((c) => c.c1 === x.c0 - 1) || row.find((c) => c.c0 === x.c1 + 1);
    if (!y) return;
    if (y.c1 < x.c0) y.c1 = x.c1; else y.c0 = x.c0;
    x.gone = true;
    join(y, x);
  });
}

/* A table's <col> elements, one per grid column (a span is split up). */
function colsOf(table) {
  const out = [];
  table.querySelectorAll(":scope > colgroup").forEach((g) => {
    const cols = g.querySelectorAll(":scope > col");
    if (!cols.length) { for (let i = 0; i < (g.span || 1); i++) out.push({ g, el: null }); return; }
    cols.forEach((el) => {
      const n = Math.max(1, Number(el.getAttribute("span")) || 1);
      if (n > 1) {
        el.removeAttribute("span");
        for (let i = 1; i < n; i++) { const c = el.cloneNode(); el.after(c); }
      }
    });
    g.querySelectorAll(":scope > col").forEach((el) => out.push({ g, el }));
  });
  return out;
}

/* A ruled form whose head (the consignee, the ports …) shares grid columns
   with its goods is parted in two at its first header row: the head keeps
   every column exactly as printed, and the goods below — a table of their own,
   same widths, drawn flush under it — can lose a column outright. Not when a
   cell runs across the parting. */
function partHead(table, grid, firstBand) {
  if (!firstBand || grid.cells.some((x) => x.r0 < firstBand && x.r1 >= firstBand)) return false;
  const head = table.cloneNode(false);
  head.removeAttribute("id");
  table.querySelectorAll(":scope > colgroup").forEach((g) => head.appendChild(g.cloneNode(true)));
  const body = table.ownerDocument.createElement("tbody");
  head.appendChild(body);
  [...table.rows].slice(0, firstBand).forEach((tr) => body.appendChild(tr));
  table.before(head);
  // Drawn flush, one rule between them, not two.
  head.setAttribute("style", `${head.getAttribute("style") || ""};margin-bottom:0`);
  table.setAttribute("style", `${table.getAttribute("style") || ""};margin-top:-1px`);
  return true;
}

const TOTALS = /\b(total|c\/f|b\/f|balance)\b/i;

/* Each label goes to the nearest empty cell left in its row, the one before
   it first. A row with none has nowhere to put it. */
function rehome(grid, labels) {
  labels.forEach(({ x, html, cls }) => {
    if (x.el.isConnected && cellText(x.el)) return;
    const free = grid.cells.filter((y) => y !== x && y.r0 === x.r0 && y.el.isConnected && !cellText(y.el) && !y.el.hasAttribute("data-v"));
    if (!free.length) return;
    const y = free.sort((a, b) => (a.c0 < x.c0 ? 0 : 1) - (b.c0 < x.c0 ? 0 : 1) || Math.abs(a.c0 - x.c0) - Math.abs(b.c0 - x.c0))[0];
    y.el.innerHTML = html;
    if (cls) y.el.className = cls;
  });
}

function applyTable(table, rules) {
  const grid = htmlGrid(table);
  const p = plan(grid, rules);
  if (!p) return;
  const cols = colsOf(table);
  const ruled = cols.length > 0 && cols.some((c) => c.el && /width/.test(c.el.getAttribute("style") || "") || c.el?.getAttribute("width"));
  /* A ruled form's head is laid out on the same grid as its goods, and a
     column out of it would reshape the head too — so the head is parted off
     first and kept exactly as printed. */
  if (ruled && (p.collapse.size || p.held.size) && partHead(table, grid, p.firstBand)) { applyTable(table, rules); return; }

  /* A totals label ("Total C/F Page :2", "BALANCE C/F") standing in a column
     that goes is not the column's own: it moves to an empty cell of its row. */
  const labels = [...p.blank].filter((x) => !x.head && TOTALS.test(x.text))
    .map((x) => ({ x, html: x.el.innerHTML, cls: x.el.className }));
  // Rows that say something now — one left with nothing to say goes (below).
  const said = new Set([...table.rows].filter((tr) => cellText(tr)));
  p.blank.forEach((x) => { x.el.innerHTML = "&nbsp;"; });
  /* What is blanked but stays in the grid — the column carries the form's own
     head as well — is handed to the cell beside it, so the column under the
     heading closes up rather than standing empty. A cell that runs on into a
     column that stays just narrows to it. */
  const kept = (x) => { for (let c = x.c0; c <= x.c1; c++) if (p.collapse.has(c)) return false; return true; };
  absorb(grid, [...p.blank].filter(kept), (y, x) => {
    y.el.colSpan = y.c1 - y.c0 + 1;
    x.el.remove();
  });
  if (!p.collapse.size) return;

  /* The column goes outright — a cell spanning it narrows, a cell wholly
     inside it goes — so the paper closes up rather than keeping an empty
     strip. (A column kept at no width instead is not safe: on an auto-width
     grid with ruled widths the browser stretches a 0 % column with a border
     across the page.) */
  const gone = new Set();              // data-k of the headings taken out
  grid.cells.forEach((x) => {
    if (x.gone) return;
    let keep = 0;
    for (let c = x.c0; c <= x.c1; c++) if (!p.collapse.has(c)) keep++;
    if (keep === x.c1 - x.c0 + 1) return;
    if (keep === 0) {
      const k = x.el.getAttribute("data-k");
      if (k) gone.add(k);
      x.el.remove();
    } else {
      x.el.colSpan = keep;
      /* Narrower now: what it says wraps rather than being cut off. */
      if (cellText(x.el)) x.el.setAttribute("style", `${x.el.getAttribute("style") || ""};white-space:normal;overflow:visible`);
    }
  });
  rehome(grid, labels);

  /* A row emptied by the columns taken out (a range's name that stood in the
     description) goes too, rather than standing as a blank stripe — unless a
     cell runs down into it or out of it. */
  const spans = grid.cells.filter((x) => x.r1 > x.r0 && x.el.isConnected);
  [...table.rows].forEach((tr, r) => {
    if (!said.has(tr) || cellText(tr)) return;
    if (spans.some((x) => r >= x.r0 && r <= x.r1)) return;
    tr.remove();
  });

  /* A ruled form's widths are shared out again over the columns it keeps, so
     it fills the same width it did. */
  if (ruled) {
    const pct = cols.map((c) => {
      const m = /width\s*:\s*([\d.]+)%/.exec(c.el?.getAttribute("style") || "");
      return m ? Number(m[1]) : null;
    });
    const total = pct.every((v) => v != null) ? pct.reduce((a, b) => a + b, 0) : null;
    const kept = total != null ? pct.reduce((a, v, i) => a + (p.collapse.has(i) ? 0 : v), 0) : null;
    if (kept) {
      cols.forEach((c, i) => {
        if (c.el && !p.collapse.has(i)) c.el.setAttribute("style", `width:${((pct[i] / kept) * total).toFixed(3)}%`);
      });
    }
  }
  cols.forEach((c, i) => { if (p.collapse.has(i) && c.el) c.el.remove(); });

  /* A figure worked out from a column that is gone keeps its printed value:
     the Excel built from this HTML would otherwise read the missing column
     as 0. */
  if (gone.size) {
    table.querySelectorAll("[data-f]").forEach((el) => {
      const f = el.getAttribute("data-f") || "";
      if ([...gone].some((k) => f.includes(`{${k}}`))) el.removeAttribute("data-f");
    });
  }
}

/** A document's HTML with the chosen columns taken out. */
export function applyColumnsToHtml(html, rules) {
  if (!html || !rules || !Object.keys(rules).length) return html;
  const doc = parseHtml(html);
  if (!doc) return html;
  // Innermost tables first, so a nested table is settled before its host.
  [...doc.querySelectorAll("table")].reverse().forEach((t) => {
    try { applyTable(t, rules); } catch (e) { /* a table it cannot read is left as it is */ }
  });
  return doc.getElementById("jg-root").innerHTML;
}

/* ---------- the Excel side ---------- */

/* Every cell any formula in these sheets reads — conservatively, by address
   alone, whichever sheet it names — so a value something is calculated from
   is never cleared. */
function referenced(sheets) {
  const out = new Set();
  const REF = /(?:(?:'[^']*'|[A-Za-z0-9_]+)!)?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?/g;
  sheets.forEach((sh) => (sh.rows || []).forEach((row) => (row || []).forEach((c) => {
    if (!c || typeof c !== "object" || !c.f) return;
    String(c.f).replace(/"[^"]*"/g, "").replace(REF, (m, a, r1, b, r2) => {
      const c0 = colNo(a), c1 = b ? colNo(b) : c0, ra = Number(r1) - 1, rb = r2 ? Number(r2) - 1 : ra;
      if ((c1 - c0 + 1) * (rb - ra + 1) > 20000) return m;
      for (let r = Math.min(ra, rb); r <= Math.max(ra, rb); r++) for (let c = c0; c <= c1; c++) out.add(`${r},${c}`);
      return m;
    });
  })));
  return out;
}

/* A sheet has no <th>: a row is a header row when at least two of its cells,
   and at least half, carry a heading the document's HTML prints. */
function markSheetHeads(grid, headTexts) {
  const byRow = new Map();
  grid.cells.forEach((x) => { if (x.text) { if (!byRow.has(x.r0)) byRow.set(x.r0, []); byRow.get(x.r0).push(x); } });
  byRow.forEach((cells) => {
    const hits = cells.filter((x) => headTexts.has(x.text.toUpperCase()));
    if (hits.length >= 2 && hits.length * 2 >= cells.length) hits.forEach((x) => { x.head = true; });
  });
}

const letters = (c) => {
  let n = c + 1, out = "";
  while (n > 0) { const m = (n - 1) % 26; out = String.fromCharCode(65 + m) + out; n = Math.floor((n - 1) / 26); }
  return out;
};
const rangeOf = (x) => `${letters(x.c0)}${x.r0 + 1}:${letters(x.c1)}${x.r1 + 1}`;

function applySheet(sheet, rules, headTexts, refs) {
  const grid = sheetGrid(sheet);
  markSheetHeads(grid, headTexts);
  const p = plan(grid, rules);
  if (!p) return sheet;
  const modeOf = new Map();
  columnsOf(grid).leaves.forEach((l) => {
    if (!rules[l.key]) return;
    for (let c = l.c0; c <= l.c1; c++) {
      // Delete wins over hide where two rules meet in one column.
      if (modeOf.get(c) !== "delete") modeOf.set(c, rules[l.key]);
    }
  });
  const rows = (sheet.rows || []).map((r) => (r ? r.slice() : r));
  let merges = (sheet.merges || []).slice();
  const used = (x) => {
    for (let r = x.r0; r <= x.r1; r++) for (let c = x.c0; c <= x.c1; c++) if (refs.has(`${r},${c}`)) return true;
    return false;
  };
  const clear = (x) => {
    if (used(x)) return;
    const [r, c] = x.at;
    const cell = rows[r]?.[c];
    if (cell && typeof cell === "object") {
      const { f, rt, ...rest } = cell;  // eslint-disable-line no-unused-vars
      rows[r][c] = { ...rest, v: "" };
    } else if (rows[r]) rows[r][c] = "";
  };

  /* A column cannot be half hidden: where the heading's column also carries
     the form's own head, the cells under the heading are cleared and merged
     into the cell beside them, as the preview closes them up. */
  const spill = [...p.blank].filter((x) => !wholly(x, p.collapse));
  grid.cells.forEach((x) => { x.m = x.c0 !== x.c1 || x.r0 !== x.r1 ? rangeOf(x) : null; });
  spill.forEach(clear);
  absorb(grid, spill, (y, x) => {
    merges = merges.filter((m) => m !== y.m && m !== x.m);
    y.m = rangeOf(y);
    merges.push(y.m);
  }, (x) => !used(x));

  // A deleted column's values go too; a hidden one keeps them.
  p.blank.forEach((x) => {
    if (wholly(x, p.collapse) && modeOf.get(x.c0) === "delete") clear(x);
  });
  const hidden = [...p.collapse].sort((a, b) => a - b);
  return { ...sheet, rows, merges, hiddenCols: [...new Set([...(sheet.hiddenCols || []), ...hidden])] };
}

/** One built document part with the chosen columns taken out — its HTML and
 *  whatever sheet model it carries. */
export function applyColumnsToPart(part, rules) {
  if (!part || !rules || !Object.keys(rules).length || typeof DOMParser === "undefined") return part;
  const out = { ...part };
  if (part.html) out.html = applyColumnsToHtml(part.html, rules);
  const sheets = part.sheets || (part.sheet ? [part.sheet] : null);
  if (sheets) {
    const doc = parseHtml(part.html || "");
    const headTexts = new Set();
    doc?.querySelectorAll("table").forEach((t) => htmlGrid(t).cells.forEach((x) => {
      if (x.head && x.text) headTexts.add(x.text.toUpperCase());
    }));
    const refs = referenced(sheets);
    const done = sheets.map((sh) => {
      try { return applySheet(sh, rules, headTexts, refs); } catch (e) { return sh; }
    });
    if (part.sheets) out.sheets = done; else out.sheet = done[0];
  }
  return out;
}

/* ---------- the saved rules ---------- */

/** Saved rules → { docNo: { key: "hide" | "delete" } }. */
export function rulesByDoc(saved) {
  const out = {};
  (saved?.rules || []).forEach((r) => {
    if (!r || !r.doc || !r.key || !["hide", "delete"].includes(r.mode)) return;
    (out[String(r.doc)] ||= {})[r.key] = r.mode;
  });
  return out;
}

/* How alike two column names are, for the "also in other documents"
   suggestion: the same name, or one name's words all inside the other's. */
export function sameColumn(a, b) {
  if (a === b) return "same";
  const wa = new Set(a.split(/[ >]+/).filter(Boolean)), wb = new Set(b.split(/[ >]+/).filter(Boolean));
  const inside = (x, y) => x.size && [...x].every((w) => y.has(w));
  return inside(wa, wb) || inside(wb, wa) ? "similar" : null;
}
