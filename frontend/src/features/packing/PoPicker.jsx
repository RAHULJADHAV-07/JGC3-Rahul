import { useId } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { ShipSpin } from "../../components/ui/ShipLoader.jsx";
import { Btn, Mono, NumberInput, Pill, Select } from "../../components/ui/index.jsx";
import { useBuyers } from "../../api/hooks.js";
import { dmy } from "../../lib/format.js";
import { eligiblePos } from "../../lib/poAlloc.js";

/* Custom PO, item by item: how many purchase orders hold the item, and which of
   them its boxes come off. It stands under the item it belongs to — in record
   packing and in edit invoice — so the order is chosen where the boxes are
   typed, and the choice for one item never moves another's.

   Orders are filled in the order they are chosen; a figure can be retyped to
   split the boxes by hand. An item only one order holds needs no choice. */

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function PoPicker({ name, boxes, legs, query, placed, buyerId, onToggle, onCell, onFill }) {
  const buyers = useBuyers().data || [];
  const head = useId();

  if (!Array.isArray(legs)) {
    return (
      <div className="po-pick">
        {query.isError
          ? <div className="po-pick-head" role="alert"><AlertTriangle size={13} /> Could not read the open orders.
            <Btn size="sm" variant="ghost" onClick={() => query.refetch()}>Retry</Btn></div>
          : <div className="po-pick-head" role="status"><ShipSpin size={16} /> Finding the purchase orders that hold this item…</div>}
      </div>
    );
  }
  if (!legs.length) {
    return (
      <div className="po-pick">
        <div className="po-pick-head"><AlertTriangle size={13} /> No open purchase order holds this item — {plural(boxes, "box", "boxes")} will be recorded beyond what is on order.</div>
      </div>
    );
  }

  const only = legs.length === 1;
  const p = placed;
  return (
    <div className="po-pick" role="group" aria-labelledby={head}>
      <div className="po-pick-head" id={head}>
        <span>
          <b>In {plural(legs.length, "purchase order")}</b>
          {only ? " — these boxes come off it" : " — choose the one these boxes come off"}
        </span>
        <span className="grow" />
        {!only && p.short > 0 && (
          <button type="button" className="po-fill" onClick={onFill}
            title="Put the boxes still to place on this item's other orders, oldest first">
            {p.placed ? "Rest, oldest first" : "Oldest first"}
          </button>
        )}
        {p.short > 0 ? <Pill tone="amber">{p.short} to place</Pill>
          : p.short < 0 ? <Pill tone="amber">{-p.short} too many</Pill>
            : <Pill tone="green"><Check size={11} /> placed</Pill>}
        {p.spare > 0 && <Pill tone="amber">{p.spare} beyond what is on order</Pill>}
      </div>
      <div className="po-chips">
        {legs.map((o) => {
          const on = p.chosen.includes(o.po);
          const n = p.cells[o.po] || 0;
          const other = buyerId && o.buyer_id && o.buyer_id !== buyerId;
          return (
            <div key={o.po} className={`po-chip${on ? " on" : ""}`}>
              <label>
                <input type="checkbox" checked={on} disabled={only} onChange={() => onToggle(o.po)}
                  aria-label={`Deduct ${name} from PO ${o.po}`} />
                <span className="po-chip-t">
                  <span className="row wrap" style={{ gap: 6 }}>
                    <Mono>PO {o.po}</Mono>
                    {other ? <Pill tone="amber">{buyers.find((b) => b.id === o.buyer_id)?.brand || "another buyer"}</Pill> : null}
                  </span>
                  <span className="po-chip-s">{dmy(o.date)} · {plural(o.open, "box", "boxes")} open</span>
                  {on && n > 0 && <span className="po-chip-s po-chip-left">{n} deducted · {o.open - n ? `${o.open - n} left` : "order cleared"}</span>}
                </span>
              </label>
              {on && !only && (
                <NumberInput className="input-sm num-in" style={{ width: 74 }} placeholder="0"
                  aria-label={`Boxes of ${name} from PO ${o.po}`}
                  value={n || ""} onChange={(v) => onCell(o.po, v, o.open)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Several items at once: one order for every item it holds, or the rest of
   everything oldest first. Shown once there is more than one item to place. */
export function PoForAll({ rows, open, place, onPick, onFillAll }) {
  if (rows.length < 2) return null;
  const pos = eligiblePos(rows, open);
  if (!pos.length) return null;
  return (
    <div className="po-all">
      <span className="po-all-l">Same order for every item</span>
      <Select className="input-sm" style={{ width: 260 }} value="" placeholder="— choose an order —"
        aria-label="Same order for every item" onChange={(e) => e.target.value && onPick(e.target.value)}>
        {pos.map((p) => <option key={p.po} value={p.po}>PO {p.po} — holds {p.items} of {rows.length} items</option>)}
      </Select>
      {place.short > 0 && place.known && (
        <Btn size="sm" variant="ghost" onClick={onFillAll}>Rest, oldest first</Btn>
      )}
    </div>
  );
}

/* Where one line's boxes come off, in words — the check table's column. */
export const PoFrom = ({ placed }) => {
  if (!placed?.known) return <span style={{ color: "var(--faint)" }}>…</span>;
  return (
    <span className="row wrap" style={{ gap: 5 }}>
      {placed.legs.map((l) => <Pill key={l.po} tone="green">PO {l.po} ({l.boxes})</Pill>)}
      {placed.short > 0 && <Pill tone="amber">{placed.short} to place</Pill>}
      {placed.short < 0 && <Pill tone="amber">{-placed.short} too many</Pill>}
      {placed.spare > 0 && <Pill tone="amber">{placed.spare} beyond orders</Pill>}
    </span>
  );
};
