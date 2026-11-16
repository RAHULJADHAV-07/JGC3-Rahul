import { useMemo, useState } from "react";
import { PackageCheck, Check, Search, Boxes, Trash2 } from "lucide-react";
import {
  Card, CardHead, Btn, Field, Input, NumberInput, Select, Pill, Mono, DataTable, Drawer, Step,
  Empty, SearchInput, FootStats, ResultState, Spinner, ErrorState,
} from "../../components/ui/index.jsx";
import {
  useGroupedItems, useBuyers, useSuppliers, useTransports, useInvoiceMutations, useBalance,
  useItems, useOptions, useAllocationPreview, useOpenOrders,
} from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import { todayISO, num } from "../../lib/format.js";
import { useDebounced } from "../../lib/useDebounced.js";
import { transportsFor } from "../../lib/transports.js";
import { sortBySequence, blockOf, blockHeads } from "../../lib/sequence.js";
import { placement, toPins } from "../../lib/poAlloc.js";
import ShipTermsFields, { ModePicker } from "../shipments/ShipTermsFields.jsx";
import { shipMode } from "../../lib/modes.js";
import CustomPoPanel from "./CustomPoPanel.jsx";

/* Record packing — boxes clear the oldest open order first (FIFO), or come off
   the orders picked for them (Custom PO).

   The RBI reference rate lives here, not at order entry: it is the rate on
   the day the goods were packed, which is what the customs invoice and the
   bank need. Serial (carton) numbers start here too — allotted when the
   invoice is created and kept by each line from then on. */
export default function RecordPackingDrawer({ onClose }) {
  const buyers = useBuyers().data || [];
  const suppliers = useSuppliers().data || [];
  const transports = useTransports().data || [];
  const balanceQ = useBalance();
  const balance = balanceQ.data;
  const { create } = useInvoiceMutations();
  const toast = useToast();

  const [invoiceNo, setInvoiceNo] = useState("");
  const [date, setDate] = useState(todayISO());
  const [buyerId, setBuyerId] = useState("");
  const [rbi, setRbi] = useState("");
  const [serialStart, setSerialStart] = useState("2001");
  const [packingTransports, setPackingTransports] = useState({});
  /* The shipment's terms, known when the goods are packed — they are written
     to the invoice's shipment details, where they can still be changed. */
  const [ship, setShip] = useState({});
  /* FIFO, or the orders ticked once the boxes are in (lib/poAlloc.js). */
  const [allocation, setAllocation] = useState("fifo");
  const [picked, setPicked] = useState([]);
  const [manual, setManual] = useState({});
  const custom = allocation === "custom";
  const items = useItems().data || [];
  const opts = useOptions().data;
  const sequence = opts?.item_sequence;
  const itemGroups = opts?.item_groups;
  const itemById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const buyer = buyers.find((b) => b.id === buyerId);
  const [boxesBy, setBoxesBy] = useState({});
  const [q, setQ] = useState("");
  const [supFilter, setSupFilter] = useState("");

  const dq = useDebounced(q);
  const found = useGroupedItems({ q: dq, supplier_id: supFilter });
  const fetched = found.data || [];
  /* The picker above is filtered; the summary below and the supplier swap
     need the whole master. React Query caches both. */
  const allGroups = useGroupedItems({}).data || [];
  const supById = (id) => suppliers.find((s) => s.id === id) || {};
  const supCode = (id) => supById(id).code || "—";
  const supName = (id) => supById(id).name || "—";

  /* item id → the other factories that make the same product, so a line can
     be moved from one to another straight from the summary. */
  const siblings = useMemo(() => {
    const m = {};
    allGroups.forEach((g) => g.variants.forEach((v) => { m[v.item_id] = g; }));
    return m;
  }, [allGroups]);

  /* What each item still owes, before this draft. The balance register is the
     same ledger the packing allocation uses, so the projection below matches
     what the save will actually do. */
  const owed = useMemo(() => {
    const m = {};
    (balance?.item || []).forEach((r) => {
      m[r.item_id] = {
        boxes: r.pending,
        pos: r.pending_pos || [],
        // The open orders in the sequence they will actually be cleared —
        // oldest first. The API sorts them; nothing here re-sorts them.
        detail: r.pending_detail || [],
      };
    });
    return m;
  }, [balance]);

  /* Which PO each box goes to — shown under the input as it is typed, so
     nobody has to trust the word "FIFO" without seeing it. The API works it
     out with the ledger itself, at this invoice's date; until its answer for
     the figure on screen arrives, the same walk down the open orders is done
     here as a stand-in (exact unless the invoice is dated before others). */
  const typedLines = useDebounced(useMemo(
    () => Object.entries(boxesBy).map(([item_id, v]) => ({ item_id, boxes: Math.max(0, Math.floor(Number(v) || 0)) }))
      .filter((l) => l.boxes > 0).sort((a, b) => a.item_id.localeCompare(b.item_id)),
    [boxesBy],
  ), 350);
  const preview = useAllocationPreview(!custom && typedLines.length ? { date, lines: typedLines } : null).data || {};
  const openIds = useMemo(() => typedLines.map((l) => l.item_id), [typedLines]);
  const openQ = useOpenOrders(custom ? openIds : []);
  const fifoFor = (itemId, typed) => {
    let left = Math.max(0, Math.floor(Number(typed) || 0));
    if (!left) return { legs: [], spare: 0 };
    const srv = preview[itemId];
    if (srv && srv.legs.reduce((n, l) => n + l.boxes, 0) + srv.spare === left) return srv;
    const legs = [];
    (owed[itemId]?.detail || []).forEach((d) => {
      if (left <= 0) return;
      const take = Math.min(d.remaining, left);
      if (take > 0) { legs.push({ po: d.po, date: d.date, boxes: take, closes: take >= d.remaining }); left -= take; }
    });
    return { legs, spare: left };
  };

  /* Pending projected AFTER the boxes typed in this draft. Each supplier's
     row is its own master item, so the group's outstanding balance is the sum
     across its variants, less whatever has been typed against them. */
  const projPending = (variants) => {
    let boxes = 0;
    const pos = new Set();
    variants.forEach((v) => {
      const base = owed[v.item_id] || { boxes: 0, pos: [] };
      const left = Math.max(0, base.boxes - (Number(boxesBy[v.item_id]) || 0));
      boxes += left;
      if (left) base.pos.forEach((p) => pos.add(p));
    });
    return { boxes, pos: [...pos] };
  };

  /* Changing a line's boxes undoes any split typed for the old figure. */
  const forget = (...ids) => setManual((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !ids.includes(k))));
  const setB = (id, v) => { setBoxesBy((p) => ({ ...p, [id]: v })); forget(id); };

  /* Retyping the boxes in the summary is the same edit as retyping them in
     step 2 — one piece of state, so the two can never disagree. Switching the
     supplier moves the boxes onto that factory's own master row, which is
     what decides who we book the goods in from. */
  const moveSupplier = (fromId, toId) => {
    if (!toId || toId === fromId) return;
    forget(fromId, toId);
    setBoxesBy((p) => {
      const next = { ...p };
      const moved = Number(next[fromId]) || 0;
      delete next[fromId];
      next[toId] = String((Number(next[toId]) || 0) + moved);
      return next;
    });
  };
  const dropLine = (id) => { setBoxesBy((p) => { const n = { ...p }; delete n[id]; return n; }); forget(id); };

  /* What is still owed goes to the top — that is the work. Items with nothing
     pending sink below, most-owed first within each block, so the list reads
     in the order the boxes actually need entering. */
  const groups = useMemo(() => {
    const owe = (g) => g.variants.reduce((s, v) => s + (owed[v.item_id]?.boxes || 0), 0);
    return [...fetched]
      .map((g) => ({ ...g, _owed: owe(g) }))
      .sort((a, b) => (b._owed - a._owed) || String(a.gd).localeCompare(String(b.gd)));
  }, [fetched, owed]);
  const pendingCount = groups.filter((g) => g._owed > 0).length;

  /* The summary is built from the unfiltered master, not from the list above:
     narrowing the search or the supplier filter must never make a line you
     have already typed disappear from what you are about to invoice.

     It is in the item sequence (Oswin by bore, then VP-PP, Hansa-PP,
     Hansa-GRN, VP-GRN — Setup → Additional settings), which is the order the
     invoice numbers its cartons in: the serial ranges below are the ones the
     invoice will carry. */
  const rows = useMemo(() => {
    const out = [];
    allGroups.forEach((g) => g.variants.forEach((v) => {
      const b = Number(boxesBy[v.item_id]) || 0;
      if (b > 0) {
        out.push({
          key: v.item_id, gd: g.gd, description: g.description,
          item_id: v.item_id, supplier_id: v.supplier_id, boxes: b,
          volume: b * (v.volume || 0),
        });
      }
    }));
    const opt = {
      suppliers, sequence, groups: itemGroups,
      getItem: (r) => itemById[r.item_id] || { gd: r.gd, supplier_id: r.supplier_id },
      supplierOf: (r) => r.supplier_id,
    };
    const sorted = sortBySequence(out, opt);
    // Where a block of a range opens (Oswin, then Oswin · PMF …) — the same
    // breaks the documents print.
    const heads = blockHeads(sorted, blockOf(opt));
    let sr = Number(serialStart) || 0;
    return sorted.map((r, i) => {
      const from = sr; sr += r.boxes;
      return { ...r, range: `${from}–${sr - 1}`, head: heads[i] };
    });
  }, [allGroups, boxesBy, suppliers, sequence, itemGroups, itemById, serialStart]);

  const totalBoxes = rows.reduce((s, r) => s + r.boxes, 0);
  const totalVol = rows.reduce((s, r) => s + r.volume, 0);
  const supAgg = useMemo(() => {
    const g = {};
    rows.forEach((r) => {
      g[r.supplier_id] = g[r.supplier_id] || { supplierId: r.supplier_id, boxes: 0, volume: 0 };
      g[r.supplier_id].boxes += r.boxes;
      g[r.supplier_id].volume += r.volume;
    });
    return Object.values(g);
  }, [rows]);
  const supIds = supAgg.map((s) => s.supplierId);

  const place = useMemo(() => placement(rows, openQ.data, picked, manual), [rows, openQ.data, picked, manual]);
  const canSave = !!invoiceNo && rows.length > 0 && !create.isPending && (!custom || place.ok);

  const save = () => {
    if (!canSave) return;
    create.mutate(
      {
        invoice_no: invoiceNo, date, buyer_id: buyerId || null,
        rbi: Number(rbi) || 0, serial_start: Number(serialStart) || 0,
        packing_transports: packingTransports,
        ship: Object.fromEntries(Object.entries(ship).filter(([, v]) => v !== "" && v != null)),
        allocation,
        lines: rows.map((r) => ({
          item_id: r.item_id, supplier_id: r.supplier_id, boxes: r.boxes,
          ...(custom ? { po_alloc: toPins(place.byItem[r.item_id]?.cells) } : {}),
        })),
      },
      {
        onSuccess: () => {
          toast(`Invoice ${invoiceNo} created — ${totalBoxes} boxes · serials ${serialStart}–${(Number(serialStart) || 0) + totalBoxes - 1}`);
          onClose();
        },
      },
    );
  };

  return (
    <Drawer title="Record packing"
      subtitle={custom ? "Enter the boxes, then choose the orders they come off." : "Boxes you enter here clear the oldest open order first."}
      icon={PackageCheck} onClose={onClose}
      footer={<>
        {/* The summary table's own totals, plus the serial block the invoice
            will number its cartons with. */}
        <FootStats empty="Enter boxes packed to begin" items={rows.length ? [
          { label: "Boxes", value: num(totalBoxes, 0) },
          { label: "Volume m³", value: num(totalVol, 3) },
          { label: "Carton serials", value: `${Number(serialStart) || 0}–${(Number(serialStart) || 0) + totalBoxes - 1}` },
          ...(custom && place.short ? [{ label: "To place on a PO", value: num(place.short, 0) }] : []),
        ] : []} />
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn icon={Check} disabled={!canSave} onClick={save}>
            {create.isPending ? "Saving…" : "Create invoice"}
          </Btn>
        </div>
      </>}>
      <div className="stack">
        <section>
          <Step n="1" title="Which invoice are these boxes going on?" hint="One invoice can carry boxes from several suppliers. Set the RBI rate and the carton serial start here." />
          <div className="grid-3">
            <Field label="Buyer">
              <Select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
                <option value="">—</option>
                {buyers.map((b) => <option key={b.id} value={b.id}>{b.name}{b.brand ? ` — ${b.brand}` : ""}</option>)}
              </Select>
            </Field>
            <Field label="Invoice number"><Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="JG/26-27/6003" /></Field>
            <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="RBI rate ₹/$" hint="The Reserve Bank reference rate on the packing date — captured here, not at order entry.">
              <NumberInput className="rate" decimal value={rbi} onChange={setRbi} placeholder="e.g. 87.25" />
            </Field>
            <Field label="Serial (carton) start" hint="The first carton number. Each line takes the next block of numbers in the supplier sequence (Setup → Additional settings), so ranges never overlap. Once allotted, a line keeps its numbers: removing an item later leaves its numbers unused instead of shifting the rest.">
              <NumberInput value={serialStart} onChange={setSerialStart} placeholder="e.g. 2001" />
            </Field>
          </div>
          <div className="grid-3" style={{ marginTop: 12 }}>
            {/* The mode decides which ports and terms are offered beside it. */}
            <ModePicker value={shipMode(ship)} onChange={(mode) => setShip((p) => ({ ...p, mode }))} />
            <ShipTermsFields ship={ship} onSet={(patch) => setShip((p) => ({ ...p, ...patch }))} buyer={buyer} />
            <Field label="Deduct boxes from" hint="FIFO clears the oldest open order first. Custom PO lets you choose the orders once the boxes are entered.">
              <Select value={allocation} onChange={(e) => setAllocation(e.target.value)} aria-label="Deduct boxes from">
                <option value="fifo">FIFO — oldest order first</option>
                <option value="custom">Custom PO</option>
              </Select>
            </Field>
          </div>
        </section>

        <section>
          <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
            <Step n="2" title="How many boxes did each supplier pack?" hint={custom
              ? "Everything still pending is listed first. Type the boxes for every item — the orders holding them are offered below."
              : "Everything still pending is listed first. Type a figure and the line beneath it names the orders those boxes clear — oldest first."} />
            <div className="row" style={{ gap: 8, marginBottom: 10 }}>
              <Select className="input-sm" style={{ width: 210 }} value={supFilter} onChange={(e) => setSupFilter(e.target.value)}>
                <option value="">All suppliers</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
              </Select>
              <div style={{ width: 220, maxWidth: "100%" }}><SearchInput value={q} onChange={setQ} placeholder="Find an item…" /></div>
            </div>
          </div>
          <Card>
            <div style={{ maxHeight: 340, overflowY: "auto" }}>
              {/* Nothing is called "clear" or "no match" before both the item
                  list and the pending balances have actually arrived. */}
              {balance === undefined ? (
                balanceQ.isError
                  ? <ErrorState error={balanceQ.error} onRetry={balanceQ.refetch} title="Could not work out what is still pending" />
                  : <Spinner label="Working out what is still pending…" />
              ) : (
              <ResultState query={found} count={groups.length} pending={dq !== q} loading="Loading items…"
                empty={(
                  <Empty icon={Search} title="No item matches">
                    {supFilter
                      ? <>Nothing from {supCode(supFilter)}{q ? <> matches “{q}”</> : " is in the item master yet"}. Pick another supplier, or clear the search.</>
                      : <>Try the GD code, item code, supplier or description.</>}
                  </Empty>
                )}>
              {groups.map((g, i) => {
                const pi = projPending(g.variants);
                // One divider between what is still owed and what is clear.
                const firstClear = g._owed === 0 && i > 0 && groups[i - 1]._owed > 0;
                return (
                  <div key={g.key}>
                    {firstClear && (
                      <div style={{ padding: "7px 14px", background: "var(--surface-2)", borderTop: "1px solid var(--border)", fontSize: 11, letterSpacing: 0.6, color: "var(--faint)", textTransform: "uppercase" }}>
                        Nothing pending · {groups.length - pendingCount} item(s)
                      </div>
                    )}
                    <div style={{ padding: "11px 14px", borderTop: i && !firstClear ? "1px solid var(--border)" : "none" }}>
                    <div className="row" style={{ marginBottom: 8 }}>
                      <Mono>{g.gd}</Mono>
                      <span style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink)", whiteSpace: "pre-line" }}>{g.description}</span>
                      <span className="grow" />
                      {pi.boxes
                        ? <Pill tone="amber">{pi.boxes} still pending{pi.pos.length ? ` · PO ${pi.pos.join(", ")}` : ""}</Pill>
                        : <Pill tone="green"><Check size={11} /> clear</Pill>}
                    </div>
                    <div className="stack-sm">
                      {g.variants.map((v, si) => {
                        const placed = custom ? place.byItem[v.item_id] : null;
                        const fifo = custom
                          ? {
                            legs: toPins(placed?.cells).map((l) => ({ po: l.po, boxes: l.boxes })),
                            spare: placed?.spare || 0,
                          }
                          : fifoFor(v.item_id, boxesBy[v.item_id]);
                        return (
                          <div key={v.item_id} className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                            <span className="row" style={{ minWidth: 0, gap: 8, paddingTop: 5 }}>
                              <Pill tone={si ? "" : "teal"}>{supCode(v.supplier_id)}</Pill>
                              <span style={{ fontSize: 11.5, color: "var(--faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {supById(v.supplier_id).name}
                              </span>
                            </span>
                            {/* The input, and under it — right-aligned, mirroring the
                                amber "still pending" tag above — which orders these
                                boxes clear, oldest first, live as you type. */}
                            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, minWidth: 110 }}>
                              <NumberInput className={`input-sm num-in${boxesBy[v.item_id] ? " filled" : ""}`} style={{ width: 110 }}
                                placeholder="0" aria-label={`Boxes packed by ${supCode(v.supplier_id)}`}
                                value={boxesBy[v.item_id] || ""} onChange={(val) => setB(v.item_id, val)} />
                              {fifo.legs.length > 0 && (
                                <span className="fifo-tag">
                                  <Pill tone="green">
                                    {custom ? "From" : "Cleared"} : {fifo.legs.map((l) => `PO ${l.po}(${l.boxes})`).join(", ")}
                                  </Pill>
                                </span>
                              )}
                              {placed?.short > 0 && (
                                <span className="fifo-tag">
                                  <Pill tone="amber">{placed.short} to place on an order</Pill>
                                </span>
                              )}
                              {fifo.spare > 0 && (
                                <span className="fifo-tag">
                                  <Pill tone="amber">
                                    {fifo.spare} box{fifo.spare === 1 ? "" : "es"} beyond what is on order
                                  </Pill>
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    </div>
                  </div>
                );
              })}
              </ResultState>
              )}
            </div>
          </Card>
        </section>

        {custom && rows.length > 0 && (
          <CustomPoPanel n="3" rows={rows} query={openQ} picked={picked} onPicked={setPicked}
            manual={manual} onManual={setManual} place={place} buyerId={buyerId} />
        )}

        <section>
          <Step n={custom && rows.length ? "4" : "3"} title="Check before you create the invoice"
            hint="Edit the boxes or switch the supplier right here — step 2 follows along." />
          {rows.length ? (
            <div className="stack-sm">
              <Card>
                <DataTable serial
                  freeze={3}
                  columns={[
                    { key: "gd", w: 96, label: "GD code", render: (r) => <Mono>{r.gd}</Mono> },
                    { key: "desc", w: 220, label: "Description", render: (r) => <span style={{ whiteSpace: "pre-line" }}>{r.description}</span> },
                    { key: "range", w: 118, label: "Carton serials", render: (r) => <Mono>{r.range}</Mono> },
                    {
                      key: "sp", w: 190, label: "Supplier",
                      render: (r) => {
                        const variants = siblings[r.item_id]?.variants || [];
                        if (variants.length < 2) return <Pill>{supCode(r.supplier_id)}</Pill>;
                        return (
                          <Select className="input-sm" style={{ width: 174 }} value={r.item_id}
                            onChange={(e) => moveSupplier(r.item_id, e.target.value)}>
                            {variants.map((v) => (
                              <option key={v.item_id} value={v.item_id}>
                                {supCode(v.supplier_id)} — {supName(v.supplier_id)}
                              </option>
                            ))}
                          </Select>
                        );
                      },
                    },
                    {
                      key: "boxes", w: 116, label: "Boxes", align: "r", strong: true,
                      render: (r) => (
                        <NumberInput className="input-sm num-in filled" style={{ width: 100 }}
                          aria-label={`Boxes for ${r.gd}`}
                          value={boxesBy[r.item_id] ?? ""} onChange={(val) => setB(r.item_id, val)} />
                      ),
                    },
                    { key: "vol", w: 104, label: "Volume m³", align: "r", render: (r) => num(r.volume, 3) },
                    {
                      key: "_x", w: 48, label: "", align: "r",
                      render: (r) => (
                        <button className="icon-btn bare" title="Remove this line" onClick={() => dropLine(r.item_id)}>
                          <Trash2 size={14} />
                        </button>
                      ),
                    },
                  ]}
                  rows={rows} rowKey={(r) => r.key} section={(r) => r.head}
                  footer={[{ v: "Total", span: 4 }, { v: totalBoxes, align: "r" }, { v: num(totalVol, 3), align: "r" }, { v: "" }]}
                />
              </Card>
              <Card>
                <CardHead icon={Boxes} title="Supplier-wise totals" />
                <DataTable serial
                  columns={[
                    { key: "code", label: "Supplier", render: (s) => <Pill>{supCode(s.supplierId)}</Pill> },
                    { key: "boxes", label: "Total boxes", align: "r", strong: true, render: (s) => s.boxes },
                    { key: "vol", label: "Total volume m³", align: "r", render: (s) => num(s.volume, 3) },
                  ]}
                  rows={supAgg} rowKey={(s) => s.supplierId}
                />
              </Card>
            </div>
          ) : (
            <Card><Empty icon={PackageCheck} title="Nothing packed yet">Type the boxes each supplier delivered and the invoice preview builds itself.</Empty></Card>
          )}
        </section>

        {supIds.length > 0 && (
          <section>
            <Step n={custom ? "5" : "4"} title="Who is the transporter for each supplier?" hint="Pick the carrier that will move each supplier's boxes. Added under Setup → Transport." />
            <Card>
              <div className="stack-sm" style={{ padding: 14 }}>
                {supIds.map((sid) => {
                  const sp = supById(sid);
                  const opts = transportsFor(transports, sid);
                  return (
                    <div key={sid} className="row" style={{ justifyContent: "space-between", gap: 10 }}>
                      <span className="row" style={{ gap: 8 }}>
                        <Pill tone="teal">{sp.code}</Pill>
                        <span style={{ fontSize: 12.5, color: "var(--ink)" }}>{sp.name}</span>
                      </span>
                      <Select style={{ width: 300 }} value={packingTransports[sid] || ""}
                        onChange={(e) => setPackingTransports((p) => ({ ...p, [sid]: e.target.value }))}>
                        <option value="">— select transporter —</option>
                        {opts.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.transport_id}</option>)}
                        {!opts.length && <option value="" disabled>No transport added for {sp.code}</option>}
                      </Select>
                    </div>
                  );
                })}
              </div>
            </Card>
          </section>
        )}
      </div>
    </Drawer>
  );
}
