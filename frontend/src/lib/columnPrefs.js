/* Which item fields the reports may carry.

   Setup → Items → Customise columns is where the client ticks the columns
   they want. A column left unticked there is not only hidden from that table:
   it is held back from every report and download that would otherwise print
   that field of the item — the Excel and PDF of the PO detail, the buyers'
   summary, the balance and supply registers, the item master itself.

   The link is a `field` tag on a report's column, naming the item field it
   prints in the column manager's own keys (below). A column with no tag is a
   figure of the report itself — a quantity, a total — and always stays.
   Pruning a column another one's formula reads drops that formula too, so the
   dependent column falls back to its plain value rather than to a reference
   that now points at nothing (sheet.js would read it as 0). */
import { useMemo } from "react";
import { useItemColumns } from "../api/hooks.js";

/* The column manager's catalogue keys — features/setup/ItemsPanel.jsx COLS. */
export const ITEM_FIELD_KEYS = [
  "gd", "code", "oswin", "gl", "description", "size", "length", "packUnit", "packing",
  "packagingType", "barcode", "hsn", "volume", "netPerBox", "grossPerBox", "bgPerBox",
  "pPerBox", "stk", "typeUp", "range", "unitValue", "unitFob", "fobpc", "uom", "sheet",
  "supplier",
];

/* The saved layout → the set of item fields to hold back. Nothing is held
   back until a layout has been saved. A field removed with the bin is saved
   as unticked, so it is held back just the same; a field the layout has never
   heard of (one added to the app since) is not. */
export function hiddenFieldsOf(saved) {
  const cols = saved?.cols;
  if (!Array.isArray(cols)) return new Set();
  return new Set(cols.filter((c) => c && !c.custom && c.visible === false && ITEM_FIELD_KEYS.includes(c.key))
    .map((c) => c.key));
}

export function useHiddenFields() {
  const q = useItemColumns();
  return useMemo(() => hiddenFieldsOf(q.data), [q.data]);
}

const refs = (tpl) => {
  const out = new Set();
  String(tpl || "").replace(/\{(\w+)\}/g, (_, k) => { out.add(k); return ""; });
  return out;
};

/* A formula that reads a column the sheet no longer has falls back to the
   column's own value (`v`) — the sheet writer would otherwise read the
   missing column as 0 and print a wrong figure. */
export function dropDanglingFormulas(cols) {
  const list = (cols || []).filter(Boolean);
  const have = new Set(list.map((c) => c.key).filter(Boolean));
  const dangles = (tpl) => [...refs(tpl)].some((k) => !have.has(k));
  return list.map((c) => {
    if (!c.fml) return c;
    if (typeof c.fml === "function") {
      const orig = c.fml;
      return { ...c, fml: (r, rowNo) => { const t = orig(r, rowNo); return t && dangles(t) ? null : t; } };
    }
    return dangles(c.fml) ? { ...c, fml: undefined } : c;
  });
}

/* A report's column list with the held-back fields taken out. */
export function pruneColumns(cols, hidden) {
  const list = (cols || []).filter(Boolean);
  if (!hidden || !hidden.size) return list;
  return dropDanglingFormulas(list.filter((c) => !(c.field && hidden.has(c.field))));
}

/* Blank the item fields a paper should not print. Only the ones that are
   pure identity — codes a document prints and never calculates with — are
   blanked in the export papers: a customs form's totals, bands and HSN
   breakup are built from the others, and a hidden column must not quietly
   change a filed figure. */
export const DOC_BLANKABLE = { oswin: "oswin", gl: "gl", barcode: "barcode" };
