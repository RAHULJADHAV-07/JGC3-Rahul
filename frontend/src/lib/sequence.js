/* The item sequence — the order items are listed in, everywhere.

   Oswin's pipes first, smallest bore up (15 MM, 20 MM, 25 MM …), then VP's PP
   fittings, Hansa's PP, Hansa's nylon (GRN) and VP's nylon. VP and Hansa make
   both kinds, so it is the range that decides an item's place, not the
   supplier. A range the list does not name follows them.

   This mirrors calc.range_key / calc.item_rank on the server — the API sorts
   its own lists with that, and this sorts what the browser lays out itself
   (the documents). Keep the two in step. */

export const DEFAULT_SEQUENCE = ["Oswin", "VP-PP", "Hansa-PP", "Hansa-GRN", "VP-GRN", "Kiran"];

const KNOWN = Object.fromEntries(DEFAULT_SEQUENCE.map((k) => [k.toLowerCase(), k]));

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

export function rangeKey(it, supplierCode = "") {
  const sheet = String(pick(it, "source_sheet", "sourceSheet")).trim().toLowerCase();
  if (KNOWN[sheet]) return KNOWN[sheet];
  const code = String(supplierCode || "").trim().toLowerCase();
  const grn = String(pick(it, "sticker_rule", "stickerRule")).toLowerCase() === "grn";
  if (code.startsWith("oswin")) return "Oswin";
  if (code.startsWith("vp")) return grn ? "VP-GRN" : "VP-PP";
  if (code.startsWith("hansa")) return grn ? "Hansa-GRN" : "Hansa-PP";
  if (code.startsWith("kiran")) return "Kiran";
  return "";
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

/* A sort key: [range place, bore, group, length, GD code, code]. */
export function itemRank(it, supplierCode = "", sequence = DEFAULT_SEQUENCE) {
  const seq = (sequence?.length ? sequence : DEFAULT_SEQUENCE).map((s) => String(s).toLowerCase());
  const key = rangeKey(it, supplierCode);
  const found = key ? seq.indexOf(key.toLowerCase()) : -1;
  const at = found < 0 ? seq.length : found;
  const gd = String(it?.gd || it?.code || "");
  const code = String(it?.code || "");
  if (key === "Oswin") {
    const len = Number(String(it?.length ?? "").trim()) || 0;
    return [at, boreMm(it), String(it?.group || ""), len, gd, code];
  }
  return [at, 0, "", 0, gd, code];
}

const cmpKey = (a, b) => {
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x).localeCompare(String(y));
  }
  return 0;
};

/* A comparator over items, given the suppliers they point at. `getItem` lets
   it sort anything that carries an item (a line, a row) rather than the item
   itself. Stable: equal items keep the order they came in. */
export function bySequence({ suppliers = [], sequence, getItem = (x) => x, supplierOf } = {}) {
  const codeOf = Object.fromEntries((suppliers || []).map((s) => [s.id, s.code]));
  const keyOf = (x) => {
    const it = getItem(x) || {};
    const sid = supplierOf ? supplierOf(x) : (it.supplier_id ?? it.supplierId);
    return itemRank(it, codeOf[sid] || "", sequence);
  };
  return (a, b) => cmpKey(keyOf(a), keyOf(b));
}

/* Sorted copy — never mutates what it was handed. */
export const sortBySequence = (list, opts) => {
  const cmp = bySequence(opts);
  return (list || []).map((x, i) => [x, i]).sort((p, q) => cmp(p[0], q[0]) || p[1] - q[1]).map(([x]) => x);
};
