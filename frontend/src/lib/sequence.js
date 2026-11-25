/* The item sequence — the order items are listed in, everywhere.

   Oswin's pipes first, smallest bore up (15 MM, 20 MM, 25 MM …), then VP's PP
   fittings, Hansa's PP, Hansa's nylon (GRN) and VP's nylon. VP and Hansa make
   both kinds, so it is the range that decides an item's place, not the
   supplier. A range the list does not name follows them.

   A supplier none of those ranges belong to (one added under Setup →
   Suppliers since) is a range of its own, "sup:<supplier id>" — keyed by id
   so renaming the supplier or changing its code keeps its place and groups.

   Inside a range, Setup → Item groups may split the goods into blocks that
   each print as a table of their own (Oswin's PMF pipes, by default).

   This mirrors calc.range_key / calc.item_rank on the server — the API sorts
   its own lists with that, and this sorts what the browser lays out itself
   (the documents). Keep the two in step. */

export const DEFAULT_SEQUENCE = ["Oswin", "VP-PP", "Hansa-PP", "Hansa-GRN", "VP-GRN", "Kiran"];

const KNOWN = Object.fromEntries(DEFAULT_SEQUENCE.map((k) => [k.toLowerCase(), k]));

export const SUPPLIER_RANGE = "sup:";
export const isSupplierRange = (k) => String(k || "").startsWith(SUPPLIER_RANGE);

/* What each range is called on screen. */
export const RANGE_LABEL = {
  Oswin: "Oswin (by bore — 15 MM, 20 MM …)",
  "VP-PP": "VP Plastics — PP",
  "Hansa-PP": "Hansa — PP",
  "Hansa-GRN": "Hansa — GRN (Nylon)",
  "VP-GRN": "VP Plastics — GRN (Nylon)",
  Kiran: "Kiran",
};

const INCH_TO_MM = { 0.5: 15, 0.75: 20, 1: 25, 1.25: 32, 1.5: 40, 2: 50, 2.5: 65, 3: 80, 4: 100 };

/* Accepts an item in either spelling — the API's (source_sheet, sticker_rule)
   or the document engine's (sourceSheet, stickerRule). */
const pick = (it, a, b) => (it?.[a] ?? it?.[b] ?? "");

/* The known range a supplier code names, or "" for any other supplier. */
function codeRange(supplierCode, grn = false) {
  const code = String(supplierCode || "").trim().toLowerCase();
  if (code.startsWith("oswin")) return "Oswin";
  if (code.startsWith("vp")) return grn ? "VP-GRN" : "VP-PP";
  if (code.startsWith("hansa")) return grn ? "Hansa-GRN" : "Hansa-PP";
  if (code.startsWith("kiran")) return "Kiran";
  return "";
}

/* `supplier` is the supplier itself (or just its code): one no known range
   belongs to is a range of its own. */
export function rangeKey(it, supplier = "") {
  const sheet = String(pick(it, "source_sheet", "sourceSheet")).trim().toLowerCase();
  if (KNOWN[sheet]) return KNOWN[sheet];
  const grn = String(pick(it, "sticker_rule", "stickerRule")).toLowerCase() === "grn";
  const known = codeRange(typeof supplier === "string" ? supplier : supplier?.code, grn);
  if (known) return known;
  return typeof supplier === "object" && supplier?.id ? SUPPLIER_RANGE + supplier.id : "";
}

/* The ranges of their own the suppliers no known range covers, by name.
   Mirrors calc.supplier_ranges. */
export function supplierRanges(suppliers = []) {
  return (suppliers || [])
    .filter((x) => x?.id && !codeRange(x.code))
    .map((x) => [String(x.name || x.code || "").toLowerCase(), x.id])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([, id]) => SUPPLIER_RANGE + id);
}

/* The sequence as it stands: the saved order, less ranges whose supplier is
   gone, then any range it does not name yet — a known one, or a supplier
   added since. What options.get_sequence returns, worked out again here so
   a supplier added a moment ago shows before the settings are read again. */
export function fullSequence(saved = [], suppliers = []) {
  const all = [...DEFAULT_SEQUENCE, ...supplierRanges(suppliers)];
  const live = Object.fromEntries(all.map((k) => [k.toLowerCase(), k]));
  const kept = [...new Set((saved || []).map((k) => live[String(k).toLowerCase()]).filter(Boolean))];
  const have = new Set(kept.map((k) => k.toLowerCase()));
  return [...kept, ...all.filter((k) => !have.has(k.toLowerCase()))];
}

const supplierOfRange = (range, suppliers = []) =>
  isSupplierRange(range) ? (suppliers || []).find((x) => x?.id === range.slice(SUPPLIER_RANGE.length)) : null;

/* What a range is called on screen, and the short name its block headings
   start with — a supplier's own range by the supplier's name. */
export function rangeLabel(range, suppliers = []) {
  const sup = supplierOfRange(range, suppliers);
  return RANGE_LABEL[range] || (sup ? sup.name || sup.code : isSupplierRange(range) ? "Removed supplier" : range);
}

export function rangeShort(range, suppliers = []) {
  const sup = supplierOfRange(range, suppliers);
  return RANGE_SHORT[range] || (sup ? sup.name || sup.code : range) || "Other";
}

/* The bore in millimetres: "15", '1/2"', '1-1/4"', or the "15 MM (1/2")" the
   group is named. Unknown sorts last. */
export function boreMm(it) {
  const raw = String(it?.size ?? "").trim();
  if (raw && Number.isFinite(Number(raw))) return Number(raw);
  const m = /^\s*(\d+)(?:\s*[-\s.]\s*(\d+)\s*\/\s*(\d+)|\s*\/\s*(\d+))?\s*(?:"|in|inch)/i.exec(raw);
  if (m) {
    const whole = Number(m[1]);
    const inches = m[2] ? whole + Number(m[2]) / Number(m[3]) : m[4] ? whole / Number(m[4]) : whole;
    const key = Math.round(inches * 100) / 100;
    return INCH_TO_MM[key] ?? Math.round(inches * 25.4);
  }
  const g = /(\d+(?:\.\d+)?)\s*MM/i.exec(String(it?.group ?? ""));
  return g ? Number(g[1]) : 1e9;
}

/* Where a pipe sits among those of its bore: [nominal length, the code it
   shares with its PH twin, 0 plain / 1 PH].

   A pipe's GD code spells out what it is — PE 25 24 is 25 MM by 24 inches, and
   a PH after it is the same pipe cut to a round metric length. The plain pipe
   leads and its PH twin follows; the master's length cannot decide that, since
   up to 25 MM the plain ones are cut to inches (PE2524 is 610 mm) and the PH
   ones are shorter (600 mm). A code that does not read as a length, or does
   not agree with the master's to within a tenth, goes by the master.
   Mirrors calc.pipe_length. */
const PIPE_CODE = /^([A-Z]+)[\s-]*(\d{2})(\d{2})[\s-]*(PH)?$/;

export function pipeLength(it) {
  const n = Number(String(it?.length ?? "").trim());
  const length = Number.isFinite(n) ? n : 0;
  const gd = String(it?.gd || it?.code || "").trim().toUpperCase();
  const m = PIPE_CODE.exec(gd);
  if (!m) return [length, gd, 0];
  const inches = Number(m[3]);
  const stem = m[1] + m[2] + m[3];
  const ph = m[4] ? 1 : 0;
  if (length && Math.abs(inches * 25.4 - length) > length / 10) return [length, stem, ph];
  return [inches * 25, stem, ph];
}

/* ---- Item groups inside a range ----
   A range can be split into blocks that print as tables of their own — Oswin's
   M/F threaded pipes (PMF…) below the rest of Oswin, for one. An item's
   category is the letters its GD code starts with (PE, PEL, PFH, PMF, PP …);
   Setup → Additional settings → Item groups puts categories into named groups
   and orders them. What no group names stays in the range's "rest" block, in
   the range's own order (Oswin by bore). Mirrors calc.item_block on the server.

   { range: [ { id, name, rest?, cats: [..], sort: "listed" | "natural" } ] } */
export const REST_GROUP = { id: "rest", name: "", rest: true, cats: [], sort: "natural" };

export const DEFAULT_GROUPS = {
  Oswin: [REST_GROUP, { id: "pmf", name: "PMF", cats: ["PMF"], sort: "listed" }],
};

/* The short name a block heading starts with. */
export const RANGE_SHORT = {
  Oswin: "Oswin", "VP-PP": "VP Plastics — PP", "Hansa-PP": "Hansa — PP",
  "Hansa-GRN": "Hansa — GRN", "VP-GRN": "VP Plastics — GRN", Kiran: "Kiran",
};

export function itemCategory(it) {
  const raw = String(it?.gd || "").trim() || String(it?.code || "").trim();
  const m = /^[A-Za-z]+/.exec(raw);
  return m ? m[0].toUpperCase() : "";
}

export function rangeBlocks(range, groups = DEFAULT_GROUPS) {
  const all = groups || DEFAULT_GROUPS;
  const key = Object.keys(all).find((k) => k.toLowerCase() === String(range || "").toLowerCase());
  const list = (key ? all[key] : []).map((g) => ({ ...g, cats: (g.cats || []).map((c) => String(c).toUpperCase()) }));
  return list.some((g) => g.rest) ? list : [{ ...REST_GROUP }, ...list];
}

/* Which block of its range an item sits in. `label` is what a heading prints:
   the range for its rest block, "Oswin · PMF" for a named group. */
export function itemBlock(it, supplier = "", groups = DEFAULT_GROUPS) {
  const range = rangeKey(it, supplier);
  const blocks = rangeBlocks(range, groups);
  const cat = itemCategory(it);
  let at = blocks.findIndex((g) => !g.rest && cat && g.cats.includes(cat));
  if (at < 0) at = blocks.findIndex((g) => g.rest);
  const g = blocks[at];
  const listed = !g.rest && (g.sort || "listed") === "listed";
  const short = rangeShort(range, typeof supplier === "object" && supplier ? [supplier] : []);
  return {
    range, at, catAt: listed && g.cats.includes(cat) ? g.cats.indexOf(cat) : 0,
    key: `${range}#${g.id || at}`, name: g.name || "", rest: !!g.rest,
    label: g.rest ? (g.name ? `${short} · ${g.name}` : short) : `${short} · ${g.name || g.cats.join(" + ")}`,
  };
}

/* A sort key: [range place, block, category in block, bore, group, length,
   code shared with the PH twin, PH, GD code, code]. */
export function itemRank(it, supplier = "", sequence = DEFAULT_SEQUENCE, groups = DEFAULT_GROUPS) {
  const seq = (sequence?.length ? sequence : DEFAULT_SEQUENCE).map((s) => String(s).toLowerCase());
  const key = rangeKey(it, supplier);
  const found = key ? seq.indexOf(key.toLowerCase()) : -1;
  const at = found < 0 ? seq.length : found;
  const blk = itemBlock(it, supplier, groups);
  const gd = String(it?.gd || it?.code || "");
  const code = String(it?.code || "");
  if (key === "Oswin") {
    const [len, stem, ph] = pipeLength(it);
    return [at, blk.at, blk.catAt, boreMm(it), String(it?.group || ""), len, stem, ph, gd, code];
  }
  return [at, blk.at, blk.catAt, 0, "", 0, gd, 0, gd, code];
}

/* Letter by letter, as the server compares them — not localeCompare, which
   passes over a hyphen or a capital, so that the papers could list two codes
   the other way round from the cartons the server numbered. */
export const cmpKey = (a, b) => {
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    const s = String(x), t = String(y);
    if (s !== t) return s < t ? -1 : 1;
  }
  return 0;
};

/* A comparator over items, given the suppliers they point at. `getItem` lets
   it sort anything that carries an item (a line, a row) rather than the item
   itself. Stable: equal items keep the order they came in. */
export function bySequence({ suppliers = [], sequence, groups, getItem = (x) => x, supplierOf } = {}) {
  const supOf = Object.fromEntries((suppliers || []).map((s) => [s.id, s]));
  const keyOf = (x) => {
    const it = getItem(x) || {};
    const sid = supplierOf ? supplierOf(x) : (it.supplier_id ?? it.supplierId);
    return itemRank(it, supOf[sid] || "", sequence, groups || DEFAULT_GROUPS);
  };
  return (a, b) => cmpKey(keyOf(a), keyOf(b));
}

/* A function naming the block anything that carries an item sits in, for the
   headings a list is broken up by. Same arguments as bySequence. */
export function blockOf({ suppliers = [], groups, getItem = (x) => x, supplierOf } = {}) {
  const supOf = Object.fromEntries((suppliers || []).map((s) => [s.id, s]));
  return (x) => {
    const it = getItem(x) || {};
    const sid = supplierOf ? supplierOf(x) : (it.supplier_id ?? it.supplierId);
    return itemBlock(it, supOf[sid] || "", groups || DEFAULT_GROUPS);
  };
}

/* The heading each row of an ordered list opens, if any: the block's label
   where the block changes — or nothing at all when the whole list is one
   block, so a list of one range reads exactly as it always did. */
export function blockHeads(rows, block) {
  const blocks = rows.map(block);
  if (new Set(blocks.map((b) => b.key)).size < 2) return rows.map(() => null);
  return blocks.map((b, i) => (i === 0 || blocks[i - 1].key !== b.key ? b.label : null));
}

/* Sorted copy — never mutates what it was handed. */
export const sortBySequence = (list, opts) => {
  const cmp = bySequence(opts);
  return (list || []).map((x, i) => [x, i]).sort((p, q) => cmp(p[0], q[0]) || p[1] - q[1]).map(([x]) => x);
};
