import { useMemo, useState } from "react";
import { RefreshCw, CalendarDays, History } from "lucide-react";
import { Note, Pill, Input, Btn } from "../../components/ui/index.jsx";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { localToday } from "../../lib/prices.js";
import { HistoryModal } from "../reports/PriceListPanel.jsx";
import { useSuppliers, useUpdateItem, usePendingForItem, useApplyPrices } from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import { inr, usdp, dmyNum } from "../../lib/format.js";
import RecordModal from "./RecordModal.jsx";
import { itemSchema } from "./itemFields.js";

/* Edit one master item. Every field the workbook carries is editable, grouped
   the way the add drawer groups them.

   Changing the purchase price or the FOB price raises the question the client
   asked for: orders already on the book were agreed at the old figure, so do
   they move or not? The tick below the form answers it at the moment of
   saving — leave it and the open orders keep the price they were placed at,
   tick it and they are restated. Either way, delivered lines never move, and
   every new order uses the new price. */

/* Compared numerically, not as text: retyping "2" as "2.00" is not a price
   change and must not raise the question. */
const PRICE_NUM = ["unit_value", "unit_fob100"];
const PRICE_MODE = ["value_mode", "fob_mode"];
const changed = (a, b) =>
  PRICE_NUM.some((k) => Math.abs((Number(a?.[k]) || 0) - (Number(b?.[k]) || 0)) > 1e-9)
  || PRICE_MODE.some((k) => String(a?.[k] ?? "") !== String(b?.[k] ?? ""));

export default function ItemEditModal({ item, onClose }) {
  const suppliers = useSuppliers().data || [];
  const update = useUpdateItem();
  const applyPrices = useApplyPrices();
  const toast = useToast();
  const { has } = useAuth();
  const [applyToPending, setApplyToPending] = useState(false);
  /* The day a price changed here holds from (V-7.9.0): today unless said
     otherwise, never before the price now in force. Orders dated before it
     keep the price before it — and so does "apply to pending orders", which
     reaches only the open orders dated from it (V-7.10.2). */
  const [since, setSince] = useState(localToday());
  const pending = usePendingForItem(item.id, since);
  // The supplier's reference for the new price — the supplier PO's "Your Ref" (V-7.10.1).
  const [priceRef, setPriceRef] = useState("");
  const [hist, setHist] = useState(false);
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
  const when = (s) => (s ? new Date(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`).toLocaleDateString("en-GB") : "");

  const supOpts = useMemo(
    () => suppliers.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })),
    [suppliers],
  );

  const open = pending.data || { pos: [], boxes: 0, lines: 0, older: [] };
  const older = open.older || [];
  const hasPending = open.pos.length > 0;

  const save = (draft) => {
    const priceMoved = changed(item, draft);
    const { price_set_at: _a, price_from: _b, ...body } = draft;
    if (priceMoved) body.price_from = since;
    if (priceMoved && priceRef.trim()) body.price_ref = priceRef.trim();
    update.mutate({ id: item.id, body }, {
      onSuccess: () => {
        // Only ever apply when a price actually moved and the tick is on.
        if (priceMoved && applyToPending && hasPending) {
          applyPrices.mutate({ item_id: item.id, since }, {
            onSuccess: (res) => toast(
              res.updated
                ? `Item updated — ${res.updated} pending order line${res.updated === 1 ? "" : "s"} repriced (PO ${res.pos.join(", ")})`
                : "Item updated — no pending order needed repricing",
            ),
            onSettled: onClose,
          });
          return;
        }
        toast(priceMoved && hasPending
          ? `Item updated — open orders keep the price they were placed at`
          : `Item ${body.gd || body.code} updated`);
        onClose();
      },
    });
  };

  /* Sits under the form, above Save, and appears the moment a price is
     touched — never silently. When nothing is outstanding it still says so,
     rather than vanishing and leaving you wondering whether the system
     noticed the change at all. */
  const sinceBlock = (
    <Note tone="teal" icon={CalendarDays}>
      <span className="row wrap" style={{ gap: 10, alignItems: "center" }}>
        <b>The new price holds from</b>
        <Input type="date" className="input-sm" style={{ width: 160 }} value={since}
          min={item.price_from || undefined} max={localToday()} onChange={(e) => setSince(e.target.value || localToday())}
          aria-label="The new price holds from" />
        <b>Your Ref</b>
        <Input className="input-sm" style={{ width: 240 }} value={priceRef} maxLength={300}
          onChange={(e) => setPriceRef(e.target.value)} placeholder="optional — printed on the supplier PO"
          aria-label="Your Ref for the new price" />
        <span style={{ color: "var(--muted)" }}>
          Orders dated before it keep the old price{item.price_from ? ` — and it cannot be before ${item.price_from.split("-").reverse().join("/")}, when the price now in force began (an earlier one goes in on Other Reports → Price list)` : ""}.
        </span>
      </span>
    </Note>
  );

  /* When the prices now in force were set — shown on every edit, price
     touched or not. */
  const datedBlock = (
    <div className="row wrap" style={{ gap: 10, fontSize: 12.5, color: "var(--muted)", alignItems: "center" }}>
      <CalendarDays size={14} />
      {item.price_from
        ? <span>Prices in force from <b style={{ color: "var(--ink)" }}>{item.price_from.split("-").reverse().join("/")}</b>
          {item.price_set_at ? <> · updated on {when(item.price_set_at)}</> : null}</span>
        : <span>Prices as they came in with the item master — not revised since.</span>}
      <Btn size="sm" variant="ghost" icon={History} onClick={() => setHist(true)}>Price history</Btn>
    </div>
  );

  const applyBlock = (
    <Note tone={applyToPending ? "amber" : "teal"} icon={RefreshCw}>
      {hasPending ? (
        <label className="row" style={{ gap: 9, alignItems: "flex-start", cursor: "pointer" }}>
          <input type="checkbox" checked={applyToPending} onChange={(e) => setApplyToPending(e.target.checked)}
            style={{ width: 15, height: 15, accentColor: "var(--teal)", cursor: "pointer", marginTop: 2, flexShrink: 0 }} />
          <span>
            <b>Apply the new price to the pending orders for this item dated from {dmyNum(since)}.</b>
            <div style={{ marginTop: 3 }}>
              {open.boxes} box{open.boxes === 1 ? "" : "es"} still outstanding across{" "}
              <span className="row wrap" style={{ gap: 4, display: "inline-flex", verticalAlign: "middle" }}>
                {open.pos.map((p) => (
                  <Pill key={p.po} tone="amber">{p.po} ({dmyNum(p.date)}) · {p.boxes}</Pill>
                ))}
              </span>
            </div>
            <div style={{ marginTop: 4, color: "var(--muted)" }}>
              Leave this unticked and those orders keep the price
              {item.unit_value ? <> they were placed at ({inr(item.unit_value)}
                {item.unit_fob100 ? <> · {usdp(item.unit_fob100)}{item.fob_mode === "100" ? "/100" : "/pc"}</> : null})</> : null}.
              Anything already delivered never moves either way, and new orders dated from {dmyNum(since)} always use the new price.
            </div>
            {older.length > 0 && (
              <div style={{ marginTop: 4, color: "var(--muted)" }}>
                Older open order{older.length === 1 ? "" : "s"} {older.join(", ")} — dated before {dmyNum(since)} — keep {older.length === 1 ? "its" : "their"} price.
              </div>
            )}
          </span>
        </label>
      ) : (
        <span>
          <b>Price changed.</b>{" "}
          {pending.isLoading ? "Checking which orders are still open…"
            : pending.isError ? "Could not check the open orders — the new price still saves, and every new order will use it."
              : `There is nothing outstanding on this item dated from ${dmyNum(since)}, so no order is affected${older.length ? ` (older open order${older.length === 1 ? "" : "s"} ${older.join(", ")} keep${older.length === 1 ? "s" : ""} the old price)` : ""}. Every new order will use the new price; anything already delivered keeps what it was invoiced at.`}
        </span>
      )}
    </Note>
  );

  return (
    <>
    <RecordModal
      title={`Edit item · ${item.gd || item.code}`}
      schema={itemSchema(supOpts)}
      value={item}
      cols={4}
      saving={update.isPending || applyPrices.isPending}
      onClose={onClose}
      onSave={save}
      /* Only surfaced once a price field is actually touched — editing a
         barcode should not ask about purchase orders. */
      beforeSave={(draft) => (
        <div className="stack-sm">
          {datedBlock}
          {changed(item, draft) && sinceBlock}
          {changed(item, draft) && applyBlock}
        </div>
      )}
    />
    {hist && <HistoryModal item={item} scope="supplier" canEdit={has("reports.prices")} supCode={supCode} onClose={() => setHist(false)} />}
    </>
  );
}
