/* How a line travels — which of Setup → Additional settings → Packaging types
   it goes in (V-7.10.2).

   Four things decide it, the first that speaks winning:

     1. the line itself — a type picked under it on the order or the invoice
        (po_lines.packaging / invoice_lines.packaging). An invoice line that
        names none takes what its orders named, when they all agree;
     2. Packaging by length (Setup → Additional settings) — each packaging
        type may carry a length: goods longer than it go in that type. Several
        types may carry one at once (Bundle above 1000 mm, Crate above 3000
        mm); the longest length an item passes wins;
     3. the item — Setup → Items → Packaging ("Cartons" unless set);
     4. the corrugated boxes, which always travel in HDP bundles.

   The papers know two kinds: bundles — any type whose name says bundle or bdl
   — print "(BUNDLES)" beside the length and count as HDP bundles; every other
   type counts as cartons, as an item's own packaging always has
   (docs/common.js inBundles / isBundle, read off `packKind`).

   The item argument may be an API item (packaging_type) or a document item
   (packagingType); both carry `length` as typed in the master ("1800"). */

export const DEFAULT_TYPE = "Cartons";
export const isBundleName = (t) => /bundle|bdl/i.test(String(t || ""));
/* The papers' two kinds, from a type's name. */
export const packKind = (t) => (cleanPack(t) ? (isBundleName(t) ? "bundle" : "carton") : null);
export const cleanPack = (v) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim() : null);
export const samePack = (a, b) => !!a && !!b && cleanPack(a).toLowerCase() === cleanPack(b).toLowerCase();

/* "1800", "1,800", "1800 mm", "1800MM" → 1800. Anything without a number → null. */
export function lengthMm(v) {
  const m = String(v ?? "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/* The rules as the API keeps them — [{type, above_mm}] — whatever shape came
   in ({rules: […]}, a bare list, or one {type, above_mm}). One per type, each
   with a length above nil, longest first. `types`, when given, keeps only the
   types still on the list, in the list's own spelling. */
export function cleanRules(r, types) {
  const list = Array.isArray(r) ? r : Array.isArray(r?.rules) ? r.rules : r?.type ? [r] : [];
  const canon = types ? Object.fromEntries(types.map((t) => [cleanPack(t)?.toLowerCase(), t])) : null;
  const by = new Map();
  list.forEach((x) => {
    const name = cleanPack(x?.type);
    const mm = Number(x?.above_mm);
    if (!name || !Number.isFinite(mm) || mm <= 0) return;
    const type = canon ? canon[name.toLowerCase()] : name;
    if (type) by.set(type.toLowerCase(), { type, above_mm: mm });
  });
  return [...by.values()].sort((a, b) => b.above_mm - a.above_mm);
}

/* The type the rules give this item — null when none speaks (no rule, no
   length, or not longer than any limit). */
export function rulePack(item, rules) {
  const len = lengthMm(item?.length);
  if (len == null) return null;
  return cleanRules(rules).find((r) => len > r.above_mm)?.type || null;
}

export const ownPack = (item) => cleanPack(item?.packaging_type ?? item?.packagingType) || DEFAULT_TYPE;

/* How the item goes by itself: the rules, else its own packaging. */
export function itemPack(item, rules) {
  return rulePack(item, rules) || ownPack(item);
}

/* The corrugated boxes — the same test docs/common.js familyOf makes. */
export function isBoxItem(item) {
  const g = String(item?.group || "").trim().toLowerCase();
  const code = String(item?.code || item?.gd || "").toUpperCase();
  return g.includes("corrugated") || g.includes("carton") || /^GD\d/.test(code);
}

/* The packaging the orders a line clears agree on — null when they name none
   or do not all name the same. `legs` are [{po, boxes, packaging}]. */
export function fromOrders(legs) {
  const list = (legs || []).filter((l) => (Number(l?.boxes) || 0) > 0 || l?.boxes == null);
  if (!list.length) return null;
  const first = cleanPack(list[0].packaging);
  return first && list.every((l) => samePack(l.packaging, first)) ? first : null;
}

/* What a line will be packed in, and why: { kind, source, bundle } — kind is
   the type's name; source "line" | "order" | "rule" | "item" | "box" |
   "default". `types` is the packaging list (for the bundle the corrugated
   boxes go in). */
export function linePack(item, rules, override, legs, types) {
  const done = (kind, source) => ({ kind, source, bundle: isBundleName(kind) });
  const own = cleanPack(override);
  if (own) return done(own, "line");
  const ord = fromOrders(legs);
  if (ord) return done(ord, "order");
  const byRule = rulePack(item, rules);
  if (byRule) return done(byRule, "rule");
  const mine = ownPack(item);
  if (isBundleName(mine)) return done(mine, "item");
  if (isBoxItem(item)) return done((types || []).find(isBundleName) || "Bundles", "box");
  return done(mine, samePack(mine, DEFAULT_TYPE) ? "default" : "item");
}

export const PACK_WHY = {
  line: "chosen on this line",
  order: "as chosen on the order",
  rule: "longer than its length in Setup → Additional settings → Packaging by length",
  item: "as set on the item (Setup → Items)",
  box: "corrugated boxes travel in HDP bundles",
  default: "cartons unless set",
};

/* A Custom PO line's orders as legs: `placed.cells` is {po: boxes} (lib/poAlloc.js),
   `open` the item's open orders [{po, packaging}] (api open-orders). */
export function legsFromPlaced(placed, open) {
  const byPo = Object.fromEntries((open || []).map((o) => [o.po, o.packaging || null]));
  return Object.entries(placed?.cells || {})
    .filter(([, boxes]) => (Number(boxes) || 0) > 0)
    .map(([po, boxes]) => ({ po, boxes: Number(boxes) || 0, packaging: byPo[po] || null }));
}
