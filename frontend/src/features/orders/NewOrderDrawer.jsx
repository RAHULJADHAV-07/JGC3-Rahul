import { useMemo, useState } from "react";
import { ClipboardList, Check, Search, Trash2 } from "lucide-react";
import {
  Card, Btn, Field, Input, NumberInput, Select, Pill, Mono, DataTable, Drawer, Step, Empty, SearchInput,
  FootStats, ResultState, Spinner, ErrorState,
} from "../../components/ui/index.jsx";
import { useGroupedItems, useBuyers, useSuppliers, usePoMutations, useDerive, useItems, useOptions } from "../../api/hooks.js";
import { blockOf, blockHeads } from "../../lib/sequence.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import { todayISO, num, boxesExact } from "../../lib/format.js";
import { useDebounced } from "../../lib/useDebounced.js";
import { hidePriceCols } from "../../lib/priceCols.js";
import PackTag from "../../components/ui/PackTag.jsx";

/* New buyer order — three steps.

   The master carries a row per supplier per product, so a GD code that two
   factories make appears once with a box against each of them. That is
   exactly the question being asked: how many pieces, from which supplier.

   There is no RBI rate here. It belongs to the packing date, not the order
   date, so it is captured at Record packing. */
export default function NewOrderDrawer({ onClose }) {
  const buyers = useBuyers().data || [];
  const suppliers = useSuppliers().data || [];
  const { create } = usePoMutations();
  const toast = useToast();

  const [po, setPo] = useState("");
  const [date, setDate] = useState(todayISO());
  const [buyerId, setBuyerId] = useState("");
  const [qtys, setQtys] = useState({});      // item id → typed quantity
  // item id → "bundle" | "carton" picked under the line (V-7.10.2); absent = as set.
  const [packs, setPacks] = useState({});
  const setPack = (id, v) => setPacks((p) => { const n = { ...p }; if (v) n[id] = v; else delete n[id]; return n; });
  const [q, setQ] = useState("");

  const dq = useDebounced(q);
  const found = useGroupedItems({ q: dq });
  const groups = found.data || [];
  /* The picker above is filtered by the search box; the summary below has to
     resolve any item's siblings whether or not the search still shows them,
     so it reads the unfiltered master. React Query caches it either way. */
  const allGroups = useGroupedItems({}).data || [];
  const supName = (id) => suppliers.find((s) => s.id === id)?.name || "—";
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";

  const setQty = (id, v) => setQtys((p) => ({ ...p, [id]: v }));

  /* item id → the other suppliers who make the same product, so the summary
     can move a line from one factory to another. */
  const siblings = useMemo(() => {
    const m = {};
    allGroups.forEach((g) => g.variants.forEach((v) => { m[v.item_id] = g; }));
    return m;
  }, [allGroups]);

  /* Retyping the pieces in the summary is the same edit as retyping them in
     step 2 — one piece of state, so the two can never disagree. */
  const moveSupplier = (fromId, toId) => {
    if (!toId || toId === fromId) return;
    setQtys((p) => {
      const next = { ...p };
      const moved = Number(next[fromId]) || 0;
      delete next[fromId];
      next[toId] = String((Number(next[toId]) || 0) + moved);
      return next;
    });
    // A packaging picked for the line goes with it to the other supplier.
    setPacks((p) => {
      if (!p[fromId]) return p;
      const n = { ...p, [toId]: p[fromId] };
      delete n[fromId];
      return n;
    });
  };
  const dropLine = (id) => { setQtys((p) => { const n = { ...p }; delete n[id]; return n; }); setPack(id, null); };

  /* Priced as the order will be: the prices in force on its date, the
     buyer's own where the buyer has a price list (Other Reports → Price list). */
  const chosen = useMemo(
    () => Object.entries(qtys).map(([id, v]) => ({ item_id: id, qty: Number(v) || 0, rbi: 0, buyer_id: buyerId || null, date: date || null }))
      .filter((r) => r.qty > 0),
    [qtys, buyerId, date],
  );
  const derived = useDerive(useDebounced(chosen, 350));
  const t = derived.data?.totals || {};
  /* The API returns the lines in the item sequence; where a block of a range
     opens (Oswin, then Oswin · PMF …) the summary heads it, exactly as the
     order's documents will print it. */
  const items = useItems().data || [];
  const optsData = useOptions().data;
  const itemGroups = optsData?.item_groups;
  const itemById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const rows = useMemo(() => {
    // Nothing typed is nothing to show — not the last answer held over.
    const list = chosen.length ? derived.data?.rows || [] : [];
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    const heads = blockHeads(list, blockOf({
      suppliers, groups: itemGroups, getItem: (r) => byId[r.item_id] || r, supplierOf: (r) => r.supplier_id,
    }));
    return list.map((r, i) => ({ ...r, head: heads[i] }));
  }, [derived.data, chosen.length, items, suppliers, itemGroups]);

  const save = () => {
    if (!po || !chosen.length) return;
    create.mutate(
      { po, date, buyer_id: buyerId || null, rbi: 0,
        lines: chosen.map((r) => ({ item_id: r.item_id, qty: r.qty, packaging: packs[r.item_id] || null })) },
      {
        onSuccess: () => {
          toast(`Order ${po} added — ${chosen.length} line${chosen.length === 1 ? "" : "s"}, ${t.boxes || 0} boxes`);
          onClose();
        },
      },
    );
  };

  return (
    <Drawer title="New buyer order"
      icon={ClipboardList} onClose={onClose}
      footer={<>
        {/* The summary table's own totals, column by column. */}
        <FootStats empty="Type a quantity to begin" items={chosen.length ? [
          { label: "Pieces", value: num(t.qty || 0, 0) },
          { label: "Boxes", value: boxesExact(t.boxes_exact || 0) },
          { label: "Volume m³", value: num(t.vol_total || 0, 3) },
          { label: "Label sheets", value: num(Math.round(t.sheets || 0), 0) },
        ] : []} />
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn icon={Check} disabled={!po || !chosen.length || create.isPending} onClick={save}>
            {create.isPending ? "Saving…" : `Add ${chosen.length || ""} line${chosen.length === 1 ? "" : "s"} to order`}
          </Btn>
        </div>
      </>}>
      <div className="stack">
        <section>
          <Step n="1" title="Who is this order for?" hint="Buyer, PO number and order date. The RBI rate is captured later, at Record packing." />
          <div className="grid-3">
            <Field label="Buyer">
              <Select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
                <option value="">—</option>
                {buyers.map((b) => <option key={b.id} value={b.id}>{b.name}{b.brand ? ` — ${b.brand}` : ""}</option>)}
              </Select>
            </Field>
            <Field label="PO number"><Input value={po} onChange={(e) => setPo(e.target.value)} placeholder="e.g. 03540" /></Field>
            <Field label="Order date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
        </section>

        <section>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
            <Step n="2" title="How many pieces, from which supplier?" hint="Leave a box empty to skip that supplier." />
            <div style={{ width: 240, marginBottom: 10 }}>
              <SearchInput value={q} onChange={setQ} placeholder="Find an item…" />
            </div>
          </div>
          <Card>
            <div style={{ maxHeight: 340, overflowY: "auto" }}>
              <ResultState query={found} count={groups.length} pending={dq !== q} loading="Loading items…"
                empty={<Empty icon={Search} title="No item matches">Try the GD code, the item code, the supplier, or part of the description.</Empty>}>
              {groups.map((g, i) => (
                <div key={g.key} style={{ padding: "11px 14px", borderTop: i ? "1px solid var(--border)" : "none" }}>
                  <div className="row" style={{ marginBottom: 8 }}>
                    <Mono>{g.gd}</Mono>
                    <span style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink)", whiteSpace: "pre-line" }}>{g.description}</span>
                    <span className="grow" />
                    <span style={{ fontSize: 11, color: "var(--faint)" }}>
                      {g.mixed_packing ? "packing varies by supplier" : `${g.packing} ${g.uom === "MTR" ? "m" : "pcs"} / box`}
                    </span>
                  </div>
                  <div className="stack-sm">
                    {g.variants.map((v, si) => {
                      const qty = Number(qtys[v.item_id]) || 0;
                      return (
                        <div key={v.item_id} className="row" style={{ justifyContent: "space-between" }}>
                          <span className="row" style={{ minWidth: 0, gap: 8 }}>
                            <Pill tone={si ? "" : "teal"}>{supCode(v.supplier_id)}</Pill>
                            <span style={{ fontSize: 11.5, color: "var(--faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {supName(v.supplier_id)}{g.mixed_packing ? ` · ${v.packing}/box` : ""}
                            </span>
                          </span>
                          <span className="row" style={{ gap: 8 }}>
                            {/* Boxes to two decimals, undivided. 2000 pieces at
                                2800 to a box is 0.71 of one — not "1 box" —
                                so you can see whether to push the quantity up
                                to a full carton or pull it back. */}
                            {qty > 0 && (
                              <span style={{ fontSize: 11.5, color: "var(--teal-ink)", fontWeight: 600 }}>
                                = {boxesExact(qty / (v.packing || 1))} boxes
                              </span>
                            )}
                            <NumberInput className={`input-sm num-in${qty ? " filled" : ""}`} style={{ width: 118 }}
                              placeholder="0" aria-label={`Pieces from ${supCode(v.supplier_id)}`}
                              value={qtys[v.item_id] || ""} onChange={(val) => setQty(v.item_id, val)} />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              </ResultState>
            </div>
          </Card>
        </section>

        <section>
          <Step n="3" title="Check the summary"
            hint="Edit the pieces or switch the supplier right here — step 2 follows along. Boxes and volume update as you type." />
          {chosen.length && !rows.length ? (
            /* Typed, but the figures are still being worked out (or failed). */
            <Card>{derived.isError
              ? <ErrorState error={derived.error} onRetry={derived.refetch} title="Could not work out the boxes and volume" />
              : <Spinner label="Working out boxes and volume…" />}</Card>
          ) : rows.length ? (
            <Card>
              <DataTable serial section={(r) => r.head}
                freeze={5}
                columns={hidePriceCols([
                  { key: "gd", w: 104, label: "GD code", render: (r) => (
                    <span className="pack-cell">
                      <Mono>{r.gd}</Mono>
                      <PackTag item={itemById[r.item_id] || r} value={packs[r.item_id]}
                        name={r.gd} onChange={(v) => setPack(r.item_id, v)} />
                    </span>
                  ) },
                  { key: "code", w: 92, label: "Code", render: (r) => <Mono>{r.code}</Mono> },
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
                    key: "qty", w: 120, label: "Pieces", align: "r",
                    render: (r) => (
                      <NumberInput className="input-sm num-in filled" style={{ width: 106 }}
                        aria-label={`Pieces for ${r.gd}`}
                        value={qtys[r.item_id] ?? ""} onChange={(val) => setQty(r.item_id, val)} />
                    ),
                  },
                  {
                    key: "boxes", w: 84, label: "Boxes", align: "r", strong: true,
                    render: (r) => (
                      <span title={`${r.boxes} carton(s) will be packed`}>
                        {boxesExact(r.boxes_exact)}
                      </span>
                    ),
                  },
                  { key: "vol", label: "Volume m³", align: "r", render: (r) => num(r.vol_total, 3) },
                  { key: "sheets", label: "Label sheets", align: "r", render: (r) => r.sheets },
                  { key: "val", label: "Cost ₹", align: "r" },
                  { key: "fob", label: "FOB $", align: "r" },
                  {
                    key: "_x", w: 48, label: "", align: "r",
                    render: (r) => (
                      <button className="icon-btn bare" title="Remove this line" onClick={() => dropLine(r.item_id)}>
                        <Trash2 size={14} />
                      </button>
                    ),
                  },
                ])}
                rows={rows} rowKey={(r) => r.item_id}
                footer={[
                  { v: `Total · ${rows.length} line(s)`, span: 3 },
                  { v: num(t.qty || 0, 0), align: "r" }, { v: boxesExact(t.boxes_exact || 0), align: "r" },
                  { v: num(t.vol_total, 3), align: "r" }, { v: Math.round(t.sheets || 0), align: "r" },
                  { v: "" },
                ]}
              />
              <div className="card-foot">
              </div>
            </Card>
          ) : (
            <Card><Empty icon={ClipboardList} title="Nothing entered yet">Type a quantity above and the line appears here, with boxes and volume already calculated.</Empty></Card>
          )}
        </section>
      </div>
    </Drawer>
  );
}
