import { Fragment, useMemo, useState } from "react";
import { FileText, Check, Trash2, Hash, Plus, X, AlertTriangle } from "lucide-react";
import {
  Modal, Btn, Field, Input, NumberInput, Pill, Mono, Note, Empty, XScroll, Spinner, ErrorState, Select,
} from "../../components/ui/index.jsx";
import ItemPicker from "../../components/ItemPicker.jsx";
import { useItems, useSuppliers, useInvoiceMutations, useOptions, useOpenOrders } from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { bySequence } from "../../lib/sequence.js";
import { previewSerials, rangeText } from "../../lib/serials.js";
import { fillOldest, forget as forgetPicks, fromLines, pickForAll, placement, toPins, togglePick, typeCell } from "../../lib/poAlloc.js";
import { useDebounced } from "../../lib/useDebounced.js";
import { PoForAll, PoPicker } from "./PoPicker.jsx";

/* Edit an invoice — number, date, serial start, and the lines themselves:
   retype the boxes, drop an item that never went on the container, or add one
   that was missed when the packing was recorded. Serial ranges preview live,
   so what each line's cartons will be numbered is visible before saving.

   Carton numbers are locked once allotted (lib/serials.js): customs already
   have them, so removing an item leaves its numbers unused instead of
   shifting every line after it, and an added item takes the numbers after the
   last one given. "Renumber all cartons" is the deliberate way to close the
   gaps — for an invoice whose numbers have not gone to customs yet.

   An item already on the invoice keeps the price it was raised at; a line
   added here is priced from the orders its boxes clear, exactly as recording
   the packing would have priced it. A line whose boxes move to other orders
   under Custom PO takes those orders' prices. Deleting the invoice outright is left to
   an admin (the API refuses anyone else). */
export default function InvoiceEditModal({ inv, onClose }) {
  const itemsQ = useItems();
  const items = itemsQ.data || [];
  const suppliers = useSuppliers().data || [];
  const { update, remove } = useInvoiceMutations();
  const { isAdmin } = useAuth();
  const toast = useToast();

  const [invoiceNo, setInvoiceNo] = useState(inv.invoice_no);
  const [date, setDate] = useState(inv.date);
  const [serialStart, setSerialStart] = useState(String(inv.serial_start || ""));
  const [lines, setLines] = useState((inv.lines || []).map((l, i) => ({
    key: l.id || `l${i}`, item_id: l.item_id, supplier_id: l.supplier_id,
    boxes: String(l.boxes ?? ""),
  })));
  const [confirm, setConfirm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [renumber, setRenumber] = useState(false);
  const [allocation, setAllocation] = useState(inv.allocation || "fifo");
  const [choice, setChoice] = useState(() => fromLines(inv.lines));
  const custom = allocation === "custom";

  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
  const opts = useOptions().data;
  const sequence = opts?.item_sequence;
  const itemGroups = opts?.item_groups;

  /* Changing a line's boxes undoes any split typed for the old figure; the
     orders chosen for it stand. Removing the line lets those go as well. */
  const forget = (key, gone) => {
    const id = lines.find((l) => l.key === key)?.item_id;
    if (id) setChoice((c) => forgetPicks(c, [id], gone));
  };
  const setBoxes = (key, v) => { setLines((p) => p.map((l) => (l.key === key ? { ...l, boxes: v } : l))); forget(key); };
  const drop = (key) => { setLines((p) => p.filter((l) => l.key !== key)); forget(key, true); };
  /* Everything typed into the picker joins the invoice in one action — each
     line slotted in where the item sequence puts it, ahead of the first line
     that comes after it. The lines already there keep their order, so the
     cartons already numbered on this invoice do not move. */
  const add = (picked) => {
    const cmp = bySequence({ suppliers, sequence, groups: itemGroups, getItem: (l) => byId[l.item_id] || {}, supplierOf: (l) => l.supplier_id });
    setLines((p) => picked.reduce((list, { variant, qty }, i) => {
      const line = {
        key: `new:${variant.item_id}:${Date.now()}:${i}`, item_id: variant.item_id,
        supplier_id: variant.supplier_id, boxes: String(qty), fresh: true,
      };
      const at = list.findIndex((l) => cmp(line, l) < 0);
      return at < 0 ? [...list, line] : [...list.slice(0, at), line, ...list.slice(at)];
    }, p));
    setAdding(false);
  };

  const totalBoxes = lines.reduce((s, l) => s + (Number(l.boxes) || 0), 0);

  /* Custom PO — chosen line by line as in record packing, with this invoice's
     own boxes counted as free. */
  const poRows = useMemo(() => lines
    .map((l) => ({ item_id: l.item_id, boxes: Number(l.boxes) || 0, gd: byId[l.item_id]?.gd, description: byId[l.item_id]?.description }))
    .filter((r) => r.boxes > 0), [lines, byId]);
  const poIds = useDebounced(useMemo(() => poRows.map((r) => r.item_id).sort(), [poRows]), 350);
  const openQ = useOpenOrders(custom ? poIds : [], inv.id);
  const open = custom ? openQ.data : undefined;
  const place = useMemo(() => placement(poRows, open, choice.picks, choice.manual), [poRows, open, choice]);

  /* What the save will number each line — kept numbers for the lines already
     on the invoice, the next free ones for a line added here. */
  const serials = useMemo(
    () => previewSerials({ inv, lines, start: serialStart, renumber }),
    [inv, lines, serialStart, renumber],
  );
  const clashing = new Set(serials.clashes.flat());
  const gdOf = (key) => { const l = lines.find((x) => x.key === key); return byId[l?.item_id]?.gd || "a line"; };

  const save = () => update.mutate(
    {
      id: inv.id,
      body: {
        invoice_no: invoiceNo, date, serial_start: Number(serialStart) || 0,
        allocation,
        lines: lines.map((l) => ({
          item_id: l.item_id, supplier_id: l.supplier_id, boxes: Number(l.boxes) || 0,
          ...(custom ? { po_alloc: toPins(place.byItem[l.item_id]) } : {}),
        })),
        ...(renumber ? { renumber: true } : {}),
      },
    },
    // A refusal (an overlap the preview missed, a lost connection) is toasted
    // by the mutation itself, and the form stays open to correct it.
    { onSuccess: () => { toast(`Invoice ${invoiceNo} updated — ${lines.length} line${lines.length === 1 ? "" : "s"}, ${totalBoxes} boxes`); onClose(); } },
  );
  const del = () => remove.mutate(inv.id, {
    onSuccess: () => { toast(`Invoice ${inv.invoice_no} deleted`); onClose(); },
  });

  return (
    <Modal title={`Edit invoice · ${inv.invoice_no}`} icon={FileText} onClose={onClose}
      footer={<>
        {confirm
          ? <span className="row wrap" style={{ gap: 8 }}>
            <span style={{ fontSize: 12.5, color: "var(--amber-ink)" }}>Delete this invoice permanently?</span>
            <Btn variant="danger" size="sm" icon={Trash2} onClick={del}>Confirm delete</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setConfirm(false)}>Keep</Btn>
          </span>
          : isAdmin ? <Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirm(true)}>Delete invoice</Btn> : <span />}
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn size="sm" icon={Check} disabled={update.isPending || !lines.length || serials.clashes.length > 0 || (custom && !place.ok)} onClick={save}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Btn>
        </div>
      </>}>
      {/* The invoice's own fields, and the one thing you might add, on a line. */}
      <div className="row wrap" style={{ gap: 12, alignItems: "flex-end", marginBottom: 14 }}>
        <div className="grid-3" style={{ flex: "1 1 min(520px, 100%)" }}>
          <Field label="Invoice number"><Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} /></Field>
          <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Serial (carton) start" hint="The first carton number on this invoice. Changing it moves every line's numbers by the same amount; each line keeps its place.">
            <NumberInput value={serialStart} onChange={setSerialStart} placeholder="e.g. 2001" />
          </Field>
          <Field label="Deduct boxes from" hint="FIFO clears the oldest open order first. Custom PO comes off the order you choose under each item.">
            <Select value={allocation} onChange={(e) => setAllocation(e.target.value)} aria-label="Deduct boxes from">
              <option value="fifo">FIFO — oldest order first</option>
              <option value="custom">Custom PO</option>
            </Select>
          </Field>
        </div>
        <Btn variant={adding ? "ghost" : "teal"} icon={adding ? X : Plus} onClick={() => setAdding((a) => !a)}>
          {adding ? "Close" : "Add an item"}
        </Btn>
      </div>

      {adding && (
        <ItemPicker unit="boxes" where="on this invoice"
          chosen={lines.map((l) => l.item_id)} onAdd={add} />
      )}

      <Note tone="teal" icon={Hash}>
        {renumber
          ? <>Every line will be numbered afresh from {Number(serialStart) || "the start"}, closing any gaps.</>
          : <>Allotted serials stay with their line — removing an item leaves its numbers unused, and an added item takes the numbers from {serials.next}.</>}
        {" "}· <b style={{ color: "var(--ink)" }}>{totalBoxes} boxes</b> on {lines.length} line{lines.length === 1 ? "" : "s"}
        {!renumber && serials.gaps > 0 ? <> · {serials.gaps} number{serials.gaps === 1 ? "" : "s"} unused</> : null}.
      </Note>
      <label className="row" style={{ gap: 8, fontSize: 12.5, color: "var(--muted)", margin: "8px 0 12px" }}>
        <input type="checkbox" checked={renumber} onChange={(e) => setRenumber(e.target.checked)} />
        Renumber all cartons from the serial start — only if these numbers have not gone to customs yet
      </label>
      {serials.clashes.length > 0 && (
        <Note tone="amber" icon={AlertTriangle}>
          {serials.clashes.map(([a, b]) => `${gdOf(a)} now runs into ${gdOf(b)}’s cartons`).join("; ")}.
          Allotted serials are fixed, so the boxes cannot grow past the next line’s numbers — lower them,
          or tick “Renumber all cartons”.
        </Note>
      )}

      {custom && (
        <PoForAll rows={poRows} open={open} place={place}
          onPick={(po) => setChoice((c) => pickForAll(c, poRows, open, po))}
          onFillAll={() => setChoice((c) => poRows.reduce((x, r) => fillOldest(x, r.item_id, open?.[r.item_id], r.boxes), c))} />
      )}

      {itemsQ.data === undefined ? (
        itemsQ.isError ? <ErrorState error={itemsQ.error} onRetry={itemsQ.refetch} /> : <Spinner label="Loading the invoice lines…" />
      ) : lines.length ? (
        // The table scrolls sideways on its own, so a narrow screen does not
        // drag the invoice fields off with it.
        <XScroll className="tbl-wrap edit-tbl" deps={[lines.length]}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Item</th><th>Supplier</th><th className="r">Boxes</th><th>Serial range</th>
              <th className="r" style={{ width: 52 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const it = byId[l.item_id] || {};
              const placed = custom && Number(l.boxes) > 0 ? place.byItem[l.item_id] : null;
              return (
                <Fragment key={l.key}>
                <tr>
                  <td>
                    <Mono>{it.gd}</Mono>{" "}
                    <span style={{ color: "var(--ink)", whiteSpace: "pre-line" }}>{it.description}</span>
                    {l.fresh && <> <Pill tone="teal">new</Pill></>}
                  </td>
                  <td><Pill>{supCode(l.supplier_id)}</Pill></td>
                  <td className="r">
                    <NumberInput className="input-sm num-in" style={{ width: 90 }}
                      aria-label={`Boxes for ${it.gd || "this line"}`}
                      value={l.boxes} onChange={(v) => setBoxes(l.key, v)} />
                  </td>
                  <td style={clashing.has(l.key) ? { color: "var(--amber-ink)", fontWeight: 700 } : undefined}>
                    <Mono>{rangeText(serials.ranges[l.key], l.boxes)}</Mono>
                  </td>
                  <td className="r">
                    <button className="icon-btn bare" title={`Remove ${it.gd || "this line"} from the invoice`} onClick={() => drop(l.key)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
                {placed && (
                  <tr className="po-pick-row">
                    <td colSpan={5}>
                      <PoPicker name={it.gd || "this item"} boxes={Number(l.boxes) || 0} legs={open?.[l.item_id]} query={openQ} placed={placed} buyerId={inv.buyer_id}
                        onToggle={(po) => setChoice((c) => togglePick(c, l.item_id, po))}
                        onCell={(po, val, max) => setChoice((c) => typeCell(c, l.item_id, placed, po, val, max))}
                        onFill={() => setChoice((c) => fillOldest(c, l.item_id, open?.[l.item_id], l.boxes))} />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        </XScroll>
      ) : (
        <Empty icon={FileText} title="Every line has been removed">
          An invoice needs at least one item. Add one above{isAdmin ? ", or delete the invoice outright" : ""}.
        </Empty>
      )}
    </Modal>
  );
}
