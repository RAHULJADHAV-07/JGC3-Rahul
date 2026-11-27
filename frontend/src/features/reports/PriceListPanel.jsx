import { useEffect, useMemo, useState } from "react";
import {
  Tags, Truck, Users, History, RotateCcw, Check, CalendarDays, AlertTriangle, Undo2, Percent, ListChecks, X,
} from "lucide-react";
import {
  Card, CardHead, Btn, Seg, Mono, Pill, DataTable, Input, NumberInput, Select, Note, Modal, Spinner,
  ErrorState, SearchInput, Field, IconBtn, errorText,
} from "../../components/ui/index.jsx";
import DownloadMenu from "../../components/ui/DownloadMenu.jsx";
import {
  useItems, useSuppliers, useBuyers, useSupplierPrices, useBuyerPrices, usePriceHistory,
  usePriceRevisions, usePriceMutations,
} from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import { useDebounced } from "../../lib/useDebounced.js";
import { dmyNum, num, todayISO } from "../../lib/format.js";
import { downloadGridExcel, downloadGridPDF, downloadGridWord } from "../../lib/download.js";
import { setLeaveGuard, clearLeaveGuard, guardedLeave } from "../../lib/leaveGuard.js";
import { markedUp, basisLabel, localToday, figure, sameFig } from "../../lib/prices.js";
import { UNIT_MODES } from "../../lib/constants.js";

/* Other Reports → Price list (V-7.9.0).

   Suppliers — every item's purchase price, FOB and basis, the figure in force
   printed over each box and the new one typed in it. One date at the head says
   when the new figures hold from: a price agreed in April may only reach the
   office in June, so that is the office's to say, not the computer's.

   Buyers — the same list, priced for one buyer: a margin over the supplier's
   price (both the ₹ price and the FOB move by it), or figures typed for a line.

   Nothing on the book moves. An order is placed at the prices in force on its
   own date, and every order and invoice already raised keeps what it was
   raised at. Any save can be withdrawn and any earlier price gone back to —
   the history is kept, never overwritten. Leaving with unsaved changes asks
   first (lib/leaveGuard.js). */

const rs = (v, d = 2) => `₹${num(v, d)}`;
const ds = (v) => `$${num(v, 4)}`;
/* The API keeps naive UTC: read it as UTC, show the office's day. */
const when = (s) => {
  if (!s) return "";
  const d = new Date(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB");
};
const descLine = (s) => String(s || "").split("\n")[0];

/* ---- Unsaved changes ------------------------------------------------------ */
function useUnsaved({ count, save, discard, canSave, what }) {
  const [pending, setPending] = useState(null);     // the move waiting on an answer
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const guard = useMemo(() => ({ ask: (proceed) => { setErr(""); setPending(() => proceed); } }), []);
  const dirty = count > 0;
  useEffect(() => {
    if (!dirty) return undefined;
    setLeaveGuard(guard);
    return () => clearLeaveGuard(guard);
  }, [dirty, guard]);

  const go = () => {
    const p = pending;
    clearLeaveGuard(guard);
    setPending(null);
    p?.();
  };
  const modal = pending && (
    <Modal size="sm" title="Save the price changes?" icon={AlertTriangle} onClose={() => setPending(null)}
      footer={<>
        <Btn variant="ghost" size="sm" onClick={() => setPending(null)}>Stay</Btn>
        <Btn variant="ghost" size="sm" icon={X} onClick={() => { discard(); go(); }}>Discard</Btn>
        <Btn size="sm" icon={Check} disabled={!canSave || busy} onClick={async () => {
          setBusy(true);
          setErr("");
          try { await save(); go(); } catch (e) { setErr(errorText(e).text); } finally { setBusy(false); }
        }}>{busy ? "Saving…" : "Save & leave"}</Btn>
      </>}>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.55 }}>
        {count} {what}{count === 1 ? " has" : "s have"} been changed on this list and not saved.
        Save {count === 1 ? "it" : "them"} before leaving, or let {count === 1 ? "it" : "them"} go?
      </p>
      {!canSave && <Note tone="amber" icon={CalendarDays}>Pick the date the prices hold from (at the head of the list) to save them.</Note>}
      {err && <Note tone="amber" icon={AlertTriangle}>{err}</Note>}
    </Modal>
  );
  return modal;
}

/* ---- One box with the figure in force printed over it -------------------- */
function OldNew({ old, value, onChange, placeholder, width = 112, disabled, changed, decimal = true }) {
  return (
    <span className="pl-cell">
      <span className="pl-old">{old}</span>
      <NumberInput decimal={decimal} className={`input-sm num-in pl-in${changed ? " filled" : ""}`} style={{ width }}
        value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} aria-label={placeholder} />
    </span>
  );
}

function OldNewBasis({ old, value, onChange, disabled, changed }) {
  return (
    <span className="pl-cell">
      <span className="pl-old">{basisLabel(old)}</span>
      <Select className={`input-sm pl-sel${changed ? " filled" : ""}`} style={{ width: 120 }} value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)} aria-label="Basis">
        {UNIT_MODES.map((m) => <option key={m.value} value={m.value}>{basisLabel(m.value)}</option>)}
      </Select>
    </span>
  );
}

const fromCell = (effective, setAt, setBy, none = "as in the item master") => (
  <span className="pl-from">
    {effective ? <b>{dmyNum(effective)}</b> : <span style={{ color: "var(--faint)" }}>{none}</span>}
    {setAt && <span>set {when(setAt)}{setBy ? ` · ${setBy}` : ""}</span>}
  </span>
);

/* ---- The head: the date, the note, save ---------------------------------- */
function SaveBar({ day, setDay, note, setNote, count, hidden, saving, canEdit, onSave, onDiscard, onRevisions, extra }) {
  return (
    <Card>
      <div className="pl-bar">
        <Field label="Prices hold from *" hint="The day the new figures took effect — it may be before today.">
          <Input type="date" className="input-sm" style={{ width: 170 }} value={day} max={localToday()}
            onChange={(e) => setDay(e.target.value)} disabled={!canEdit} aria-label="Prices hold from" />
        </Field>
        <Field label="Note" hint="Optional — e.g. the supplier's letter">
          <Input className="input-sm" style={{ width: 240 }} value={note} maxLength={300}
            onChange={(e) => setNote(e.target.value)} disabled={!canEdit} placeholder="e.g. Kiran price list, April" />
        </Field>
        {extra}
        <span className="grow" />
        <div className="row wrap pl-actions">
          <Btn variant="ghost" size="sm" icon={ListChecks} onClick={onRevisions}>Price changes</Btn>
          {count > 0 && <Btn variant="ghost" size="sm" icon={Undo2} onClick={onDiscard}>Discard</Btn>}
          {canEdit && (
            <Btn size="sm" icon={Check} disabled={!count || !day || saving} onClick={onSave}
              title={!day && count ? "Pick the date the prices hold from" : undefined}>
              {saving ? "Saving…" : count ? `Save ${count} change${count === 1 ? "" : "s"}` : "Save"}
            </Btn>
          )}
        </div>
      </div>
      {count > 0 && (
        <div className="pl-status">
          <b>{count}</b> item{count === 1 ? "" : "s"} changed{hidden ? ` (${hidden} not shown by the filter)` : ""}.
          {!day && <span className="pl-need"> Pick the date the prices hold from to save.</span>}
          {" "}Orders and invoices already raised keep their prices; a new order takes the price in force on its own date.
        </div>
      )}
    </Card>
  );
}

/* ---- History of one item on one list ------------------------------------- */
export function HistoryModal({ item, scope, buyerId, canEdit, onClose, supCode }) {
  const params = scope === "buyer" ? { scope, buyer_id: buyerId } : undefined;
  const hq = usePriceHistory(item.id, params);
  const { restore } = usePriceMutations();
  const toast = useToast();
  const [ask, setAsk] = useState(null);
  const vs = hq.data?.versions || [];
  const curIdx = vs.findIndex((v) => v.current);
  const later = (v) => vs.filter((x) => x.active && (x.effective || "") + x.created_at > (v.effective || "") + v.created_at).length;

  const label = (v) => {
    if (v.mode === "baseline") return "The item master's own price";
    if (v.mode === "margin") return `Margin ${num(v.margin_pct, 1)}% over the supplier`;
    if (v.mode === "manual") return "Typed for this buyer";
    if (v.mode === "none") return "Back to the supplier's price";
    return "Set";
  };
  return (
    <Modal title={`Price history · ${item.gd || item.code}`} icon={History} onClose={onClose}>
      <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>
        {descLine(item.description)} · {supCode(item.supplier_id)}{scope === "buyer" ? " · this buyer's list" : " · supplier list"}.
        Newest first. Going back to an earlier price withdraws the ones after it — they stay here, and can be put back from
        “Price changes”.
      </p>
      {hq.isLoading ? <Spinner label="Reading the history…" />
        : hq.error ? <ErrorState error={hq.error} onRetry={hq.refetch} />
          : !vs.length ? <Note tone="teal" icon={History}>No price has been set on this list for this item yet.</Note>
            : (
              <div className="pl-hist">
                {vs.map((v, i) => (
                  <div key={v.id} className={`pl-hrow${v.current ? " on" : ""}${v.active ? "" : " off"}`}>
                    <div className="pl-hdate">
                      {v.effective ? <b>from {dmyNum(v.effective)}</b> : <b>Original</b>}
                      <span>{v.mode === "baseline" ? "before any revision" : `set ${when(v.created_at)}${v.created_by ? ` · ${v.created_by}` : ""}`}</span>
                    </div>
                    <div className="pl-hfig">
                      <span>{rs(v.unit_value)} <i>{basisLabel(v.value_mode)}</i></span>
                      <span>{ds(v.unit_fob100)} <i>{basisLabel(v.fob_mode)}</i></span>
                      <span className="pl-hmode">{label(v)}{v.note ? ` · ${v.note}` : ""}</span>
                    </div>
                    <div className="pl-hact">
                      {v.current ? <Pill tone="green">In force</Pill>
                        : !v.active ? <Pill>Withdrawn{v.withdrawn_at ? ` ${when(v.withdrawn_at)}` : ""}</Pill>
                          : i < curIdx ? <Pill tone="amber">Later date</Pill> : <Pill>Earlier</Pill>}
                      {canEdit && !v.current && (ask === v.id ? (
                        <span className="row" style={{ gap: 6 }}>
                          <Btn size="sm" variant="ghost" onClick={() => setAsk(null)}>Cancel</Btn>
                          <Btn size="sm" icon={RotateCcw} disabled={restore.isPending}
                            onClick={() => restore.mutate(v.id, {
                              onSuccess: (r) => { setAsk(null); toast(`${item.gd || item.code}: back to the price ${v.effective ? `from ${dmyNum(v.effective)}` : "it had at first"}${r.withdrawn ? ` — ${r.withdrawn} later price${r.withdrawn === 1 ? "" : "s"} withdrawn` : ""}`); },
                            })}>
                            {restore.isPending ? "Going back…" : later(v) ? `Withdraw ${later(v)} later & go back` : "Use this price"}
                          </Btn>
                        </span>
                      ) : (
                        <Btn size="sm" variant="ghost" icon={RotateCcw} onClick={() => setAsk(v.id)}>Go back to this</Btn>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
    </Modal>
  );
}

/* ---- Every save of a list -------------------------------------------------- */
function RevisionsModal({ scope, buyerId, canEdit, onClose }) {
  const rq = usePriceRevisions(scope === "buyer" ? { scope, buyer_id: buyerId } : { scope });
  const { withdraw, reinstate } = usePriceMutations();
  const toast = useToast();
  const [ask, setAsk] = useState(null);
  const revs = rq.data || [];
  const busy = withdraw.isPending || reinstate.isPending;
  const tone = { live: "green", partly: "amber", withdrawn: "" };
  const word = { live: "In the history", partly: "Partly gone back on", withdrawn: "Withdrawn" };
  return (
    <Modal title={scope === "buyer" ? "Price changes · this buyer" : "Price changes · suppliers"} icon={ListChecks} onClose={onClose}>
      <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>
        Every save, newest first. Withdraw one to go back to the prices before it — say January's after March's — and
        reinstate it to keep March's again. Orders and invoices already raised never move either way.
      </p>
      {rq.isLoading ? <Spinner label="Reading the price changes…" />
        : rq.error ? <ErrorState error={rq.error} onRetry={rq.refetch} />
          : !revs.length ? <Note tone="teal" icon={ListChecks}>Nothing has been saved on this list yet.</Note>
            : (
              <div className="pl-hist">
                {revs.map((r) => (
                  <div key={r.id} className={`pl-hrow${r.status === "withdrawn" ? " off" : ""}`}>
                    <div className="pl-hdate">
                      <b>from {dmyNum(r.effective)}</b>
                      <span>saved {when(r.created_at)}{r.created_by ? ` · ${r.created_by}` : ""}</span>
                    </div>
                    <div className="pl-hfig">
                      <span>{r.items} item{r.items === 1 ? "" : "s"}{r.status === "partly" ? ` · ${r.active} still on` : ""}</span>
                      {r.margin_pct != null && <span>margin {num(r.margin_pct, 1)}%</span>}
                      {r.note && <span className="pl-hmode">{r.note}</span>}
                      {r.your_ref && <span className="pl-hmode">Your Ref: {r.your_ref}</span>}
                    </div>
                    <div className="pl-hact">
                      <Pill tone={tone[r.status]}>{word[r.status]}</Pill>
                      {canEdit && (ask === r.id ? (
                        <span className="row" style={{ gap: 6 }}>
                          <Btn size="sm" variant="ghost" onClick={() => setAsk(null)}>Cancel</Btn>
                          {r.status !== "withdrawn" ? (
                            <Btn size="sm" variant="danger" icon={Undo2} disabled={busy}
                              onClick={() => withdraw.mutate(r.id, { onSuccess: () => { setAsk(null); toast(`Prices from ${dmyNum(r.effective)} withdrawn — ${r.items} item${r.items === 1 ? "" : "s"} back to the price before`); } })}>
                              {busy ? "Withdrawing…" : "Withdraw"}
                            </Btn>
                          ) : null}
                          {r.status !== "live" ? (
                            <Btn size="sm" icon={RotateCcw} disabled={busy}
                              onClick={() => reinstate.mutate(r.id, { onSuccess: () => { setAsk(null); toast(`Prices from ${dmyNum(r.effective)} reinstated`); } })}>
                              {busy ? "Reinstating…" : "Reinstate"}
                            </Btn>
                          ) : null}
                        </span>
                      ) : (
                        <Btn size="sm" variant="ghost" onClick={() => setAsk(r.id)}>
                          {r.status === "live" ? "Withdraw…" : r.status === "withdrawn" ? "Reinstate…" : "Withdraw / reinstate…"}
                        </Btn>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
    </Modal>
  );
}

/* ---- The filters ---------------------------------------------------------- */
function useFiltered(items, sup, q) {
  const dq = useDebounced(q, 150);
  return useMemo(() => {
    const s = dq.trim().toLowerCase();
    return items.filter((it) => (!sup || it.supplier_id === sup)
      && (!s || `${it.gd} ${it.code} ${it.description} ${it.hsn} ${it.oswin} ${it.gl}`.toLowerCase().includes(s)));
  }, [items, sup, dq]);
}

/* ============================================================================
   Suppliers
   ========================================================================== */
function SupplierPrices({ canEdit, sup, q }) {
  const items = useItems().data || [];
  const suppliers = useSuppliers().data || [];
  const meta = useSupplierPrices();
  const { saveSupplier } = usePriceMutations();
  const toast = useToast();
  const [day, setDay] = useState("");
  const [note, setNote] = useState("");
  const [yourRef, setYourRef] = useState("");
  const [draft, setDraft] = useState({});
  const [hist, setHist] = useState(null);
  const [revs, setRevs] = useState(false);
  const [err, setErr] = useState("");

  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
  const metaOf = useMemo(() => Object.fromEntries((meta.data?.rows || []).map((r) => [r.item_id, r])), [meta.data]);
  const shown = useFiltered(items, sup, q);

  const change = (it) => {
    const d = draft[it.id];
    if (!d) return null;
    const out = {};
    const uv = figure(d.unit_value);
    const uf = figure(d.unit_fob100);
    if (uv != null && !sameFig(uv, it.unit_value)) out.unit_value = uv;
    if (uf != null && !sameFig(uf, it.unit_fob100)) out.unit_fob100 = uf;
    if (d.value_mode && d.value_mode !== (it.value_mode || "piece")) out.value_mode = d.value_mode;
    if (d.fob_mode && d.fob_mode !== (it.fob_mode || "100")) out.fob_mode = d.fob_mode;
    return Object.keys(out).length ? out : null;
  };
  const changes = useMemo(() => items.map((it) => [it, change(it)]).filter(([, c]) => c), [items, draft]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownIds = useMemo(() => new Set(shown.map((i) => i.id)), [shown]);
  const hiddenCount = changes.filter(([it]) => !shownIds.has(it.id)).length;
  const behind = changes.filter(([it]) => day && it.price_from && day < it.price_from);

  const set = (id, k, v) => setDraft((p) => ({ ...p, [id]: { ...p[id], [k]: v } }));
  const discard = () => { setDraft({}); setErr(""); };
  const save = async () => {
    setErr("");
    const res = await saveSupplier.mutateAsync({
      effective: day, note, your_ref: yourRef,
      rows: changes.map(([it, c]) => ({ item_id: it.id, ...c })),
    });
    setDraft({});
    setYourRef("");
    toast(res.changed
      ? `Prices saved — ${res.changed} item${res.changed === 1 ? "" : "s"}, holding from ${dmyNum(day)}`
      : "Nothing to save — those were already the prices on that day");
    return res;
  };
  const onSave = () => save().catch((e) => setErr(errorText(e).text));
  const leave = useUnsaved({ count: changes.length, save, discard, canSave: !!day, what: "price" });

  const cols = [
    { key: "gd", w: 104, label: "GD code", primary: true, render: (it) => <Mono>{it.gd || it.code}</Mono> },
    { key: "desc", w: 220, label: "Description", render: (it) => <span className="pl-desc" title={it.description}>{descLine(it.description)}</span> },
    ...(sup ? [] : [{ key: "sup", w: 84, label: "Supplier", render: (it) => <Pill>{supCode(it.supplier_id)}</Pill> }]),
    { key: "hsn", w: 96, label: "HSN code", render: (it) => <Mono>{it.hsn || "—"}</Mono> },
    { key: "vm", label: "Purchase basis", render: (it) => (
      <OldNewBasis old={it.value_mode} value={draft[it.id]?.value_mode ?? (it.value_mode || "piece")} disabled={!canEdit}
        changed={!!change(it)?.value_mode} onChange={(v) => set(it.id, "value_mode", v)} />) },
    { key: "uv", label: "Purchase price ₹", align: "r", render: (it) => (
      <OldNew old={<>old <b>{rs(it.unit_value)}</b></>} value={draft[it.id]?.unit_value ?? ""} placeholder="new ₹" disabled={!canEdit}
        changed={change(it)?.unit_value != null} onChange={(v) => set(it.id, "unit_value", v)} />) },
    { key: "fm", label: "FOB basis", render: (it) => (
      <OldNewBasis old={it.fob_mode || "100"} value={draft[it.id]?.fob_mode ?? (it.fob_mode || "100")} disabled={!canEdit}
        changed={!!change(it)?.fob_mode} onChange={(v) => set(it.id, "fob_mode", v)} />) },
    { key: "uf", label: "FOB price $", align: "r", render: (it) => (
      <OldNew old={<>old <b>{ds(it.unit_fob100)}</b></>} value={draft[it.id]?.unit_fob100 ?? ""} placeholder="new $" disabled={!canEdit}
        changed={change(it)?.unit_fob100 != null} onChange={(v) => set(it.id, "unit_fob100", v)} />) },
    { key: "from", w: 150, label: "Prices from", render: (it) => (
      <>
        {fromCell(it.price_from, it.price_set_at, metaOf[it.id]?.set_by)}
        {day && it.price_from && day < it.price_from && change(it) && (
          <span className="pl-warn">a later price is in force — this one holds until {dmyNum(it.price_from)}</span>
        )}
      </>
    ) },
    { key: "h", w: 52, label: "", render: (it) => (
      <span className="row" style={{ gap: 2 }}>
        <IconBtn bare icon={History} size={15} title="Price history" onClick={() => setHist(it)} />
        {draft[it.id] && <IconBtn bare icon={Undo2} size={14} title="Undo this row" onClick={() => setDraft((p) => { const n = { ...p }; delete n[it.id]; return n; })} />}
      </span>
    ) },
  ];

  const supName = sup ? supCode(sup) : "All suppliers";
  const exportCols = [
    { h: "GD code", key: "gd", f: (it) => it.gd || it.code },
    { h: "Code", key: "code", f: (it) => it.code },
    { h: "Description", key: "description", f: (it) => descLine(it.description), w: 34 },
    { h: "Supplier", key: "supplier", f: (it) => supCode(it.supplier_id) },
    { h: "HSN code", key: "hsn", f: (it) => it.hsn || "" },
    { h: "Purchase basis", key: "vm", f: (it) => basisLabel(it.value_mode) },
    { h: "Purchase price ₹", key: "uv", t: "inr", v: (it) => it.unit_value },
    { h: "FOB basis", key: "fm", f: (it) => basisLabel(it.fob_mode || "100") },
    { h: "FOB price $", key: "uf", t: "usd4", v: (it) => it.unit_fob100 },
    { h: "Prices from", key: "from", f: (it) => (it.price_from ? dmyNum(it.price_from) : "Item master") },
  ];
  const title = `Price list — suppliers · ${supName}`;
  const opts = { title, subtitle: `${supName} · prices in force on ${dmyNum(localToday())}` };
  const file = `Price_list_suppliers${sup ? `_${supCode(sup).replace(/[^A-Za-z0-9]+/g, "")}` : ""}_${todayISO()}`;

  return (
    <>
      <SaveBar day={day} setDay={setDay} note={note} setNote={setNote} count={changes.length} hidden={hiddenCount}
        saving={saveSupplier.isPending} canEdit={canEdit} onSave={onSave} onDiscard={discard} onRevisions={() => setRevs(true)}
        extra={(
          /* The supplier's own reference for these rates — printed as "Your Ref"
             on every supplier PO dated from this day until the next change
             that gives one (V-7.10.1). */
          <Field label="Your Ref" hint="Printed on the supplier PO from this date on">
            <Input className="input-sm" style={{ width: 280 }} value={yourRef} maxLength={300}
              onChange={(e) => setYourRef(e.target.value)} disabled={!canEdit}
              placeholder="e.g. Your E-mail Dt 06.02.2023" aria-label="Your Ref" />
          </Field>
        )} />
      {err && <Note tone="amber" icon={AlertTriangle}>{err}</Note>}
      {behind.length > 0 && (
        <Note tone="amber" icon={CalendarDays}>
          {behind.length} of the changed item{behind.length === 1 ? " has" : "s have"} a later price already in force. The figures typed
          here go into the history for orders dated from {dmyNum(day)} until that later date; the item master keeps the later price.
        </Note>
      )}
      <Card>
        <CardHead icon={Truck} title={`Supplier prices · ${shown.length} item${shown.length === 1 ? "" : "s"}`}>
          <DownloadMenu name="supplier price list" disabled={!shown.length}
            onExcel={() => downloadGridExcel(file, "Supplier prices", exportCols, shown, opts)}
            onPDF={() => downloadGridPDF(title, exportCols, shown, opts)}
            onWord={() => downloadGridWord(file, title, exportCols, shown, opts)} />
        </CardHead>
        {!items.length ? <Spinner label="Reading the items…" />
          : <DataTable serial columns={cols} rows={shown} rowKey={(it) => it.id} freeze={2} maxHeight={600}
            empty="No item matches the filter." />}
      </Card>
      {hist && <HistoryModal item={hist} scope="supplier" canEdit={canEdit} supCode={supCode} onClose={() => setHist(null)} />}
      {revs && <RevisionsModal scope="supplier" canEdit={canEdit} onClose={() => setRevs(false)} />}
      {leave}
    </>
  );
}

/* ============================================================================
   Buyers
   ========================================================================== */
function BuyerPrices({ canEdit, sup, q, buyerId }) {
  const items = useItems().data || [];
  const suppliers = useSuppliers().data || [];
  const { saveBuyer } = usePriceMutations();
  const toast = useToast();
  const [day, setDay] = useState("");
  const [note, setNote] = useState("");
  const [margin, setMargin] = useState("");
  const [draft, setDraft] = useState({});
  const [hist, setHist] = useState(null);
  const [revs, setRevs] = useState(false);
  const [err, setErr] = useState("");
  const bq = useBuyerPrices(buyerId, day || undefined);

  const supCode = (id) => suppliers.find((s) => s.id === id)?.code || "—";
  const byId = useMemo(() => Object.fromEntries((bq.data?.rows || []).map((r) => [r.item_id, r])), [bq.data]);
  const shown = useFiltered(items, sup, q).filter((it) => byId[it.id]);
  useEffect(() => {
    if (margin === "" && bq.data?.margin_pct != null) setMargin(String(bq.data.margin_pct));
  }, [bq.data?.margin_pct]); // eslint-disable-line react-hooks/exhaustive-deps

  const baseOf = (it) => byId[it.id]?.base || { unit_value: it.unit_value, value_mode: it.value_mode, unit_fob100: it.unit_fob100, fob_mode: it.fob_mode };
  /* What a row's boxes show: worked out from the margin typed, or as typed. */
  const shownOf = (it) => {
    const d = draft[it.id];
    if (!d) return null;
    if (d.mode === "margin") {
      const m = figure(d.margin);
      return m == null ? null : markedUp(baseOf(it), m);
    }
    return { unit_value: d.unit_value, unit_fob100: d.unit_fob100 };
  };
  const change = (it) => {
    const d = draft[it.id];
    const cur = byId[it.id];
    if (!d || !cur) return null;
    const base = baseOf(it);
    if (d.mode === "margin") {
      const m = figure(d.margin);
      if (m == null || (cur.mode === "margin" && sameFig(cur.margin_pct, m))) return null;
      return { mode: "margin", margin_pct: m };
    }
    const uv = figure(d.unit_value);
    const uf = figure(d.unit_fob100);
    if (uv == null || uf == null) return null;
    if (cur.mode === "manual" && sameFig(uv, cur.unit_value) && sameFig(uf, cur.unit_fob100)) return null;
    return { mode: "manual", unit_value: uv, unit_fob100: uf, value_mode: base.value_mode, fob_mode: base.fob_mode };
  };
  const changes = useMemo(() => items.map((it) => [it, change(it)]).filter(([, c]) => c), [items, draft, byId]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownIds = useMemo(() => new Set(shown.map((i) => i.id)), [shown]);
  const hiddenCount = changes.filter(([it]) => !shownIds.has(it.id)).length;

  const setMarginRow = (it, v) => setDraft((p) => ({ ...p, [it.id]: { mode: "margin", margin: v } }));
  /* Typing a price itself makes the row a typed one: the other figure stays at
     what the box was showing. */
  const setFig = (it, k, v) => setDraft((p) => {
    const now = shownOf(it) || byId[it.id];
    const keep = (f) => (p[it.id]?.mode === "manual" ? p[it.id][f] : String(now?.[f] ?? ""));
    return { ...p, [it.id]: { mode: "manual", unit_value: keep("unit_value"), unit_fob100: keep("unit_fob100"), [k]: v } };
  });
  const applyAll = () => {
    if (figure(margin) == null) return;
    setDraft((p) => {
      const n = { ...p };
      shown.forEach((it) => { n[it.id] = { mode: "margin", margin }; });
      return n;
    });
  };
  const discard = () => { setDraft({}); setErr(""); };
  const save = async () => {
    setErr("");
    const res = await saveBuyer.mutateAsync({
      bid: buyerId,
      body: { effective: day, note, margin_pct: figure(margin), rows: changes.map(([it, c]) => ({ item_id: it.id, ...c })) },
    });
    setDraft({});
    toast(res.changed
      ? `Buyer prices saved — ${res.changed} item${res.changed === 1 ? "" : "s"}, holding from ${dmyNum(day)}`
      : "Nothing to save — those were already the prices on that day");
    return res;
  };
  const onSave = () => save().catch((e) => setErr(errorText(e).text));
  const leave = useUnsaved({ count: changes.length, save, discard, canSave: !!day, what: "price" });

  const curMargin = (cur) => (cur.mode === "margin" ? `${num(cur.margin_pct, 1)}%` : cur.mode === "manual" ? "typed" : "none");
  const cols = [
    { key: "gd", w: 104, label: "GD code", primary: true, render: (it) => <Mono>{it.gd || it.code}</Mono> },
    { key: "desc", w: 220, label: "Description", render: (it) => <span className="pl-desc" title={it.description}>{descLine(it.description)}</span> },
    ...(sup ? [] : [{ key: "sup", w: 84, label: "Supplier", render: (it) => <Pill>{supCode(it.supplier_id)}</Pill> }]),
    { key: "hsn", w: 96, label: "HSN code", render: (it) => <Mono>{it.hsn || "—"}</Mono> },
    { key: "base", label: day ? `Supplier price on ${dmyNum(day)}` : "Supplier price", render: (it) => {
      const b = baseOf(it);
      return (
        <span className="pl-from">
          <span>{rs(b.unit_value)} <i>{basisLabel(b.value_mode)}</i></span>
          <span>{ds(b.unit_fob100)} <i>{basisLabel(b.fob_mode)}</i></span>
        </span>
      );
    } },
    { key: "m", label: "Margin %", align: "r", render: (it) => (
      <OldNew old={<>old <b>{curMargin(byId[it.id])}</b></>} width={86} placeholder="%" disabled={!canEdit}
        value={draft[it.id]?.mode === "margin" ? draft[it.id].margin : ""}
        changed={change(it)?.mode === "margin"} onChange={(v) => setMarginRow(it, v)} />) },
    { key: "sv", label: "Sell price ₹", align: "r", render: (it) => (
      <OldNew old={<>old <b>{rs(byId[it.id].unit_value)}</b></>} placeholder="new ₹" disabled={!canEdit}
        value={shownOf(it) ? String(shownOf(it).unit_value ?? "") : ""}
        changed={!!change(it)} onChange={(v) => setFig(it, "unit_value", v)} />) },
    { key: "sf", label: "FOB price $", align: "r", render: (it) => (
      <OldNew old={<>old <b>{ds(byId[it.id].unit_fob100)}</b> <i>{basisLabel(baseOf(it).fob_mode)}</i></>} placeholder="new $" disabled={!canEdit}
        value={shownOf(it) ? String(shownOf(it).unit_fob100 ?? "") : ""}
        changed={!!change(it)} onChange={(v) => setFig(it, "unit_fob100", v)} />) },
    { key: "from", w: 150, label: "Prices from", render: (it) => {
      const cur = byId[it.id];
      return fromCell(cur.effective, cur.set_at, cur.set_by, "the supplier's price");
    } },
    { key: "h", w: 52, label: "", render: (it) => (
      <span className="row" style={{ gap: 2 }}>
        <IconBtn bare icon={History} size={15} title="Price history" onClick={() => setHist(it)} />
        {draft[it.id] && <IconBtn bare icon={Undo2} size={14} title="Undo this row" onClick={() => setDraft((p) => { const n = { ...p }; delete n[it.id]; return n; })} />}
      </span>
    ) },
  ];

  const supName = sup ? supCode(sup) : "All suppliers";
  const exportCols = [
    { h: "GD code", key: "gd", f: (it) => it.gd || it.code },
    { h: "Code", key: "code", f: (it) => it.code },
    { h: "Description", key: "description", f: (it) => descLine(it.description), w: 34 },
    { h: "Supplier", key: "supplier", f: (it) => supCode(it.supplier_id) },
    { h: "HSN code", key: "hsn", f: (it) => it.hsn || "" },
    { h: "Supplier price ₹", key: "bv", t: "inr", v: (it) => baseOf(it).unit_value },
    { h: "Supplier FOB $", key: "bf", t: "usd4", v: (it) => baseOf(it).unit_fob100 },
    { h: "Margin", key: "m", f: (it) => curMargin(byId[it.id]) },
    { h: "Sell price ₹", key: "sv", t: "inr", v: (it) => byId[it.id].unit_value },
    { h: "FOB basis", key: "fm", f: (it) => basisLabel(byId[it.id].fob_mode) },
    { h: "FOB price $", key: "sf", t: "usd4", v: (it) => byId[it.id].unit_fob100 },
    { h: "Prices from", key: "from", f: (it) => (byId[it.id].effective ? dmyNum(byId[it.id].effective) : "Supplier's price") },
  ];
  const buyers = useBuyers().data || [];
  const buyer = buyers.find((b) => b.id === buyerId);
  const bname = buyer ? (buyer.brand || buyer.name) : "";
  const title = `Price list — ${bname} · ${supName}`;
  const opts = { title, subtitle: `${supName} · prices in force on ${dmyNum(localToday())}` };
  const file = `Price_list_${bname.replace(/[^A-Za-z0-9]+/g, "_")}${sup ? `_${supCode(sup).replace(/[^A-Za-z0-9]+/g, "")}` : ""}_${todayISO()}`;

  if (!buyerId) return <Note tone="teal" icon={Users}>Add a buyer under Setup → Buyers & suppliers to give them a price list.</Note>;
  return (
    <>
      <SaveBar day={day} setDay={setDay} note={note} setNote={setNote} count={changes.length} hidden={hiddenCount}
        saving={saveBuyer.isPending} canEdit={canEdit} onSave={onSave} onDiscard={discard} onRevisions={() => setRevs(true)}
        extra={canEdit && (
          <Field label="Margin over the supplier's price" hint="Moves the ₹ price and the FOB alike — 50% on ₹100 / $1 is ₹150 / $1.50">
            <span className="row" style={{ gap: 6 }}>
              <NumberInput decimal className="input-sm num-in" style={{ width: 80 }} value={margin} onChange={setMargin} placeholder="%" aria-label="Margin %" />
              <Percent size={14} style={{ color: "var(--faint)" }} />
              <Btn size="sm" variant="ghost" disabled={figure(margin) == null || !shown.length} onClick={applyAll}>
                Apply to {shown.length} item{shown.length === 1 ? "" : "s"} shown
              </Btn>
            </span>
          </Field>
        )} />
      {err && <Note tone="amber" icon={AlertTriangle}>{err}</Note>}
      <Card>
        <CardHead icon={Users} title={`${bname || "Buyer"} · ${shown.length} item${shown.length === 1 ? "" : "s"}`}>
          <span style={{ fontSize: 11.5, color: "var(--faint)" }}>A margin follows the supplier's later prices; a typed price stays as typed.</span>
          <DownloadMenu name="buyer price list" disabled={!shown.length}
            onExcel={() => downloadGridExcel(file, "Buyer prices", exportCols, shown, opts)}
            onPDF={() => downloadGridPDF(title, exportCols, shown, opts)}
            onWord={() => downloadGridWord(file, title, exportCols, shown, opts)} />
        </CardHead>
        {bq.isLoading ? <Spinner label="Reading the buyer's prices…" />
          : bq.error ? <ErrorState error={bq.error} onRetry={bq.refetch} />
            : <DataTable serial columns={cols} rows={shown} rowKey={(it) => it.id} freeze={2} maxHeight={600}
              empty="No item matches the filter." />}
      </Card>
      {hist && <HistoryModal item={hist} scope="buyer" buyerId={buyerId} canEdit={canEdit} supCode={supCode} onClose={() => setHist(null)} />}
      {revs && <RevisionsModal scope="buyer" buyerId={buyerId} canEdit={canEdit} onClose={() => setRevs(false)} />}
      {leave}
    </>
  );
}

/* ============================================================================
   The tab
   ========================================================================== */
export default function PriceListPanel({ canEdit }) {
  const [side, setSide] = useState("supplier");
  const suppliers = useSuppliers().data || [];
  const buyers = useBuyers().data || [];
  const [sup, setSup] = useState("");
  const [q, setQ] = useState("");
  const [buyerId, setBuyerId] = useState("");
  useEffect(() => {
    if (!buyerId && buyers.length) setBuyerId(buyers[0].id);
  }, [buyers, buyerId]);

  return (
    <div className="stack">
      <div className="tabbar">
        <Seg options={[["supplier", "Suppliers", Truck], ["buyer", "Buyers", Users]]} value={side}
          onChange={(v) => v !== side && guardedLeave(() => setSide(v))} />
        {side === "buyer" && (
          <Select className="tab-filter" value={buyerId} aria-label="Buyer"
            onChange={(e) => { const v = e.target.value; if (v !== buyerId) guardedLeave(() => setBuyerId(v)); }}>
            {buyers.map((b) => <option key={b.id} value={b.id}>{b.brand ? `${b.brand} — ${b.name}` : b.name}</option>)}
          </Select>
        )}
        <Select className="tab-filter" value={sup} onChange={(e) => setSup(e.target.value)} aria-label="Supplier">
          <option value="">All suppliers · every item</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
        </Select>
        <div style={{ width: 230, maxWidth: "100%" }}><SearchInput value={q} onChange={setQ} placeholder="Find an item…" /></div>
        <span className="grow" />
        <span style={{ fontSize: 11.5, color: "var(--faint)" }} className="row"><Tags size={13} /> Old figure above each box · new one in it</span>
      </div>
      {side === "supplier"
        ? <SupplierPrices canEdit={canEdit} sup={sup} q={q} />
        : <BuyerPrices key={buyerId} canEdit={canEdit} sup={sup} q={q} buyerId={buyerId} />}
    </div>
  );
}
