import { Package } from "lucide-react";
import { useOptions } from "../../api/hooks.js";
import { PACK_WHY, cleanPack, linePack, samePack } from "../../lib/packaging.js";

/* The small packaging tag under a line on a new order, an order being edited,
   record packing and an invoice being edited (V-7.10.2) — "Bundle",
   "Cartons", or whatever Setup → Additional settings → Packaging types holds.
   It says how the line will be packed, and why; clicking it picks another
   type for this line alone. "As set" goes back to whatever the orders,
   Packaging by length, or the item say. The list and the length rules come
   from the options every screen already loads, so a type added or renamed in
   Setup shows here at once.

   `item` is the API item, `value` the line's own choice (a type, or null),
   `legs` the orders the line clears ([{po, boxes, packaging}]) where known. */
export default function PackTag({ item, value, legs, onChange, disabled, name }) {
  const opts = useOptions().data;
  const types = opts?.packaging_types || ["Cartons"];
  const rules = opts?.packaging_rules;
  const now = linePack(item, rules, value, legs, types);
  const auto = linePack(item, rules, null, legs, types);
  const why = PACK_WHY[now.source] || "";
  /* A type picked earlier and since taken off the list stays on offer for this
     line, so opening the menu never changes what it says. */
  const own = cleanPack(value);
  const offer = own && !types.some((t) => samePack(t, own)) ? [...types, own] : types;
  const tone = now.bundle ? " pack-bundle" : samePack(now.kind, "Cartons") || now.kind.toLowerCase() === "carton" ? "" : " pack-other";
  return (
    <span className={`pack-tag${tone}${now.source === "line" ? " pack-set" : ""}`}
      title={`Packed in ${now.kind} — ${why}.${onChange && !disabled ? " Click to change for this line." : ""}`}>
      <Package size={11} strokeWidth={2.4} />
      {now.kind}
      {now.source === "line" && <i>· set here</i>}
      {onChange && !disabled && (
        <select value={own || ""} aria-label={`Packaging for ${name || "this line"}`}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange(e.target.value || null)}>
          <option value="">As set — {auto.kind}</option>
          {offer.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      )}
    </span>
  );
}
