import { useMemo, useState } from "react";
import { BarChart3, ClipboardList, Layers, Truck, Boxes, Check, Calculator } from "lucide-react";
import {
  Card, CardHead, Btn, Seg, Pill, Mono, DataTable, Input, Note, Info, Empty, Stat,
  Spinner, ErrorState, DownloadPair, Select,
} from "../../components/ui/index.jsx";
import { useAuth } from "../../auth/AuthProvider.jsx";
import { useBalance, useSuppliers, useBuyers } from "../../api/hooks.js";
import { dmy, dmyNum, num, todayISO } from "../../lib/format.js";
import { downloadGridExcel, downloadGridPDF } from "../../lib/download.js";
import { hidePriceCols } from "../../lib/priceCols.js";
import { useHiddenFields, pruneColumns } from "../../lib/columnPrefs.js";
import CostingPanel from "../costing/CostingPanel.jsx";
import SupplyDetailsPanel from "./SupplyDetailsPanel.jsx";

/* Other Reports — the balance register, rebuilt from the packing ledger every
   time it is opened, plus the Costing sheet. Nothing here is stored, so it
   can never drift out of sync with the orders and invoices it reads. */
export default function ReportsPage() {
  const { has } = useAuth();
  const canBalance = has("reports.balance");
  const canCosting = has("reports.costing");
  const [tab, setTab] = useState(canBalance ? "po" : "costing");
  const [remarks, setRemarks] = useState({});
  const [sup, setSup] = useState("");          // one supplier, or all of them in the item sequence
  const hidden = useHiddenFields();

  const balq = useBalance();
  const suppliers = useSuppliers().data || [];
  const buyers = useBuyers().data || [];
  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
  const brand = (id) => buyers.find((b) => b.id === id)?.brand || "—";
  const joinInv = (l) => (l?.length ? l.join(", ") : "—");
  /* Which invoices cleared a line, with the boxes each one put on it. */
  const trail = (p) => (p.cleared?.length
    ? p.cleared.map((c) => `${c.invoice_no} (${c.boxes})`).join(", ")
    : joinInv(p.invoices));

  const data = balq.data || { po: [], item: [], supplier: [] };
  const poRows = data.po
    .filter((r) => !sup || r.supplier_id === sup)
    .map((r) => ({ ...r, key: `${r.po}|${r.item_id}|${r.date}` }));
  const itemRows = sup ? data.item.filter((r) => r.supplier_id === sup) : data.item;
  const supRows = sup ? data.supplier.filter((r) => r.supplier_id === sup) : data.supplier;

  const totals = useMemo(() => ({
    ordered: itemRows.reduce((s, r) => s + r.ordered, 0),
    recd: itemRows.reduce((s, r) => s + r.recd, 0),
    pending: itemRows.reduce((s, r) => s + r.pending, 0),
  }), [itemRows]);

  const pendingCell = (v) => <span style={{ fontWeight: 700, color: v ? "var(--amber-ink)" : "var(--green-ink)" }}>{v || "—"}</span>;
  const dateCell = (d) => <span style={{ color: "var(--muted)" }}>{d ? dmy(d) : "—"}</span>;

  const poCols = [
    { key: "date", w: 112, label: "Date", render: (p) => dateCell(p.date) },
    { key: "gd", w: 96, label: "GD code", render: (p) => <Mono>{p.gd}</Mono> },
    { key: "po", w: 92, label: "PO", render: (p) => <span style={{ fontFamily: "var(--mono)", fontWeight: 700, color: "var(--ink)" }}>{p.po}</span> },
    { key: "buyer", w: 140, label: "Buyer", render: (p) => brand(p.buyer_id) },
    { key: "desc", w: 220, label: "Description", render: (p) => <span style={{ color: "var(--ink)", whiteSpace: "pre-line" }}>{p.description}</span> },
    /* One invoice to a line, so a PO cleared over several shipments grows the
       row rather than widening the whole table. */
    { key: "inv", label: "Cleared by invoice (boxes)", render: (p) => (p.cleared?.length
      ? <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>{p.cleared.map((c) => <Mono key={c.invoice_no}>{`${c.invoice_no} (${c.boxes})`}</Mono>)}</span>
      : <Mono>{trail(p)}</Mono>) },
    { key: "qty", label: "Qty", align: "r", render: (p) => p.qty.toLocaleString("en-IN") },
    { key: "boxes", label: "Boxes", align: "r", strong: true, render: (p) => p.ordered },
    { key: "recd", label: "Received", align: "r", render: (p) => p.recd },
    { key: "pending", label: "Pending", align: "r", render: (p) => pendingCell(p.pending) },
    { key: "vol", label: "Total vol m³", align: "r", render: (p) => num(p.volume, 3) },
    { key: "rem", label: "Remarks", render: (p) => <Input className="input-sm" style={{ width: 150 }} value={remarks[p.key] || ""} onChange={(e) => setRemarks((x) => ({ ...x, [p.key]: e.target.value }))} placeholder="add note" /> },
  ];
  const cfg = {
    po: { cols: hidePriceCols(poCols), rows: poRows, key: (p) => p.key, doc: "37", title: "Balance order · PO wise (buyer)", foot: "Received = boxes delivered against that PO. The invoice column shows which invoice cleared it — remarks are typed here and travel into the download." },
  }[tab];

  /* The download carries every column, prices included, with the arithmetic
     still live — what is held back is only what shows on the monitor. */
  const poExport = pruneColumns([
    { h: "Date", key: "date", f: (p) => dmyNum(p.date) },
    { h: "GD code", key: "gd", field: "gd", f: (p) => p.gd },
    { h: "PO", key: "po", f: (p) => p.po },
    { h: "Buyer", key: "buyer", f: (p) => brand(p.buyer_id) },
    { h: "Supplier", key: "supplier", field: "supplier", f: (p) => supCode(p.supplier_id) },
    { h: "Description", key: "description", field: "description", f: (p) => p.description, w: 34 },
    { h: "Cleared by invoice (boxes)", key: "inv", f: (p) => trail(p) },
    { h: "Qty pcs", key: "qty", t: "int", v: (p) => p.qty, sum: true },
    { h: "Boxes ordered", key: "ordered", t: "int", v: (p) => p.ordered, sum: true },
    { h: "Received", key: "recd", t: "int", v: (p) => p.recd, sum: true },
    { h: "Pending", key: "pending", t: "int", fml: "{ordered}-{recd}", v: (p) => p.pending, sum: true },
    { h: "Total vol m³", key: "vol", t: "num3", v: (p) => p.volume, sum: true },
    { h: "Remarks", key: "rem", f: (p) => remarks[p.key] || "" },
  ], hidden);

  const exportTitle = `37 · Balance order — PO wise (buyer)${sup ? ` · ${supCode(sup)}` : ""}`;
  const exportOpts = { title: exportTitle, subtitle: `${sup ? supCode(sup) : "All suppliers · item sequence"} · as on ${todayISO()}` };

  const segOptions = [
    ...(canBalance ? [["po", "By purchase order", ClipboardList], ["item", "By item", Layers]] : []),
    ...(canCosting ? [["costing", "Costing", Calculator]] : []),
  ];

  return (
    <div className="stack">
      <div className="tabbar">
        {segOptions.length > 1 && <Seg options={segOptions} value={tab} onChange={setTab} />}
        {tab === "po" && <Pill tone="teal">Report 37</Pill>}
        {tab === "item" && <Pill tone="teal">Report 38</Pill>}
        {tab === "po" && (
          <Select className="tab-filter" value={sup} onChange={(e) => setSup(e.target.value)} aria-label="Supplier">
            <option value="">All suppliers</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
          </Select>
        )}
        <span className="grow" />
        {tab === "po" && (
          <DownloadPair size="md" disabled={!cfg.rows.length}
            onExcel={() => downloadGridExcel(`Report_37_PO_wise_Buyer${sup ? `_${supCode(sup).replace(/[^A-Za-z0-9]+/g, "")}` : ""}_${todayISO()}`, "PO wise", poExport, poRows, exportOpts)}
            onPDF={() => downloadGridPDF(exportTitle, poExport, poRows, exportOpts)} />
        )}
      </div>

      {tab === "costing" ? <CostingPanel />
        : tab === "item" ? <SupplyDetailsPanel />
          : balq.isLoading ? <Spinner label="Rebuilding the balance register…" />
            : balq.error ? <ErrorState error={balq.error} onRetry={balq.refetch} />
              : (
                <>
                  <div className="grid-4">
                    <Stat icon={Boxes} value={totals.ordered} label="Boxes ordered" sub="Across every open PO" />
                    <Stat icon={Check} tone="green" value={totals.recd} label="Boxes received" sub={`${totals.ordered ? Math.round((totals.recd / totals.ordered) * 100) : 0}% of the book`} />
                    <Stat icon={BarChart3} tone={totals.pending ? "amber" : "green"} value={totals.pending} label="Boxes pending" sub="Still owed by suppliers" />
                    <Stat icon={Truck} value={supRows.length} label="Supplier · item lines" sub="Delivered so far" />
                  </div>

                  <Card>
                    <CardHead icon={BarChart3} title={cfg.title}>
                      <span style={{ fontSize: 11.5, color: "var(--faint)" }}>The first five columns stay frozen while you scroll</span>
                    </CardHead>
                    {cfg.rows.length
                      ? <DataTable serial columns={cfg.cols} rows={cfg.rows} rowKey={cfg.key} freeze={5} maxHeight={520} />
                      : <Empty icon={BarChart3} title="Nothing to report yet">Record a packing invoice and the balance register fills in.</Empty>}
                  </Card>
                </>
              )}
    </div>
  );
}
