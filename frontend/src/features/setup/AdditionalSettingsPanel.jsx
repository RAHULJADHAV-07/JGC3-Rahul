import { useEffect, useState } from "react";
import {
  Truck, Package, Wallet, Anchor, MapPin, Landmark, ListOrdered, Plus, Pencil, Trash2, Check, X,
  ArrowUp, ArrowDown, RotateCcw, AlertTriangle,
} from "lucide-react";
import {
  Card, CardHead, Btn, Field, Input, Pill, Mono, Note, Empty, Spinner, ErrorState, Modal,
} from "../../components/ui/index.jsx";
import { useOptions, useOptionMutations } from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import { DEFAULT_SEQUENCE, RANGE_LABEL } from "../../lib/sequence.js";

/* Setup → Additional settings.

   The short lists the shipment forms pick from, each kept here once rather
   than typed fresh on every invoice: terms of delivery, packaging types,
   terms of payment, ports of loading and the ports buyers are shipped to — and
   the bank accounts the export proceeds come in through. Then the order every
   list in the app is read in.

   Each list works the same way: type an entry, Add, and it joins the list
   underneath; the pencil corrects one, the bin removes it. */

const LISTS = [
  { key: "terms_delivery", title: "Terms of delivery", icon: Truck, eg: "e.g. FOB MUMBAI",
    hint: "Offered on the shipment details and on record packing." },
  { key: "packaging_types", title: "Packaging types", icon: Package, eg: "e.g. Bundles",
    hint: "What an item travels in — picked on each item. Every existing item is in Cartons." },
  { key: "terms_payment", title: "Terms of payment", icon: Wallet, eg: "e.g. D.P.SIGHT DRAFT",
    hint: "Offered on the shipment details and on record packing." },
  { key: "ports_loading", title: "Port of loading", icon: Anchor, eg: "e.g. NHAVA SHEVA-MUMBAI (INDIA)",
    hint: "Where the container is loaded." },
  { key: "ports_ship_to", title: "Ship to port", icon: MapPin, eg: "e.g. FREMANTLE",
    hint: "The ports buyers take delivery at — a buyer is given theirs under Buyers." },
];

/* One list: the box that adds to it, and the entries under it. */
function ListCard({ cfg, values, save, busy }) {
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [editAt, setEditAt] = useState(-1);
  const [editText, setEditText] = useState("");
  const [askAt, setAskAt] = useState(-1);
  const [err, setErr] = useState("");

  const has = (text, except = -1) => values.some((v, i) => i !== except && v.toLowerCase() === text.toLowerCase());

  const commit = (next, done) => save(next, {
    onSuccess: () => { setErr(""); done?.(); },
    onError: (e) => setErr(e.message),
  });

  const add = () => {
    const text = draft.trim().replace(/\s+/g, " ");
    if (!text) return;
    if (has(text)) { setErr(`“${text}” is already on the list.`); return; }
    commit([...values, text], () => { setDraft(""); toast(`${cfg.title}: “${text}” added`); });
  };
  const saveEdit = (i) => {
    const text = editText.trim().replace(/\s+/g, " ");
    if (!text) return;
    if (has(text, i)) { setErr(`“${text}” is already on the list.`); return; }
    commit(values.map((v, j) => (j === i ? text : v)), () => { setEditAt(-1); toast(`${cfg.title} updated`); });
  };
  const remove = (i) => commit(values.filter((_, j) => j !== i), () => { setAskAt(-1); toast(`${cfg.title}: “${values[i]}” removed`); });

  return (
    <Card className="opt-card">
      <CardHead icon={cfg.icon} title={cfg.title}>
        <Pill>{values.length}</Pill>
      </CardHead>
      <div className="opt-body">
        <div className="opt-add">
          <Input value={draft} placeholder={cfg.eg} aria-label={`New ${cfg.title.toLowerCase()}`}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <Btn icon={Plus} disabled={!draft.trim() || busy} onClick={add}>Add</Btn>
        </div>
        <div className="opt-hint">{cfg.hint}</div>
        {err && <Note tone="amber" icon={AlertTriangle}>{err}</Note>}
        {values.length ? (
          <ul className="opt-list">
            {values.map((v, i) => (
              <li key={`${v}:${i}`} className="opt-item">
                {editAt === i ? (
                  <>
                    <Input className="input-sm" value={editText} autoFocus
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(i); if (e.key === "Escape") setEditAt(-1); }} />
                    <button type="button" className="icon-btn bare" title="Save" onClick={() => saveEdit(i)}><Check size={15} /></button>
                    <button type="button" className="icon-btn bare" title="Cancel" onClick={() => setEditAt(-1)}><X size={15} /></button>
                  </>
                ) : askAt === i ? (
                  <>
                    <span className="opt-text">Remove “{v}”?</span>
                    <Btn size="sm" variant="danger" icon={Trash2} disabled={busy} onClick={() => remove(i)}>Remove</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => setAskAt(-1)}>Keep</Btn>
                  </>
                ) : (
                  <>
                    <span className="opt-text">{v}</span>
                    <button type="button" className="icon-btn bare" title="Edit" onClick={() => { setEditAt(i); setEditText(v); setAskAt(-1); }}><Pencil size={14} /></button>
                    <button type="button" className="icon-btn bare" title="Remove" onClick={() => { setAskAt(i); setEditAt(-1); }}><Trash2 size={14} /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : <div className="opt-empty">Nothing added yet.</div>}
      </div>
    </Card>
  );
}

/* ---------------- banks ---------------- */

const BLANK_BANK = { bank_name: "", account_no: "", confirm_account_no: "", ifsc: "", branch: "", state: "", city: "" };
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

function BankForm({ initial, onClose, busy, onSave }) {
  const editing = !!initial?.id;
  const [f, setF] = useState(() => ({ ...BLANK_BANK, ...(initial || {}), confirm_account_no: "" }));
  const [err, setErr] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // A new account — or a changed number on an old one — is typed twice.
  const numberChanged = !editing || f.account_no.replace(/\s+/g, "") !== (initial.account_no || "");
  const acct = f.account_no.replace(/\s+/g, "");
  const again = f.confirm_account_no.replace(/\s+/g, "");
  const ifsc = f.ifsc.replace(/\s+/g, "").toUpperCase();
  const mismatch = numberChanged && again && acct !== again;

  const submit = () => {
    if (!f.bank_name.trim()) return setErr("Enter the bank's name.");
    if (!acct) return setErr("Enter the account number.");
    if (!/^[A-Za-z0-9]+$/.test(acct)) return setErr("An account number is letters and digits only.");
    if (numberChanged && acct !== again) return setErr("Re-enter the account number exactly — the two do not match.");
    if (ifsc && !IFSC_RE.test(ifsc)) return setErr("An IFSC code is 11 characters: 4 letters, a zero, then 6 letters or digits (e.g. HDFC0000123).");
    setErr("");
    const body = { ...f, account_no: acct, ifsc };
    if (numberChanged) body.confirm_account_no = again; else delete body.confirm_account_no;
    delete body.id;
    onSave(body, setErr);
  };

  return (
    <Modal title={editing ? `Edit bank · ${initial.bank_name}` : "Add a bank account"} icon={Landmark} onClose={onClose}
      footer={<>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
          {numberChanged ? "The account number is asked twice so a mistyped digit is caught here." : "Account number unchanged."}
        </span>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn size="sm" icon={Check} disabled={busy} onClick={submit}>{busy ? "Saving…" : editing ? "Save bank" : "Add bank"}</Btn>
        </div>
      </>}>
      <div className="rec-grid" style={{ "--rec-cols": 2 }}>
        <Field label="Bank name *" style={{ gridColumn: "span 2" }}>
          <Input value={f.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="e.g. HDFC BANK LTD" />
        </Field>
        <Field label="Account number *">
          <Input value={f.account_no} inputMode="numeric" autoComplete="off" onChange={(e) => set("account_no", e.target.value)} placeholder="e.g. 50200012345678" />
        </Field>
        <Field label={numberChanged ? "Re-enter account number *" : "Re-enter account number"}>
          <Input value={f.confirm_account_no} inputMode="numeric" autoComplete="off" disabled={!numberChanged}
            onPaste={(e) => e.preventDefault()}
            onChange={(e) => set("confirm_account_no", e.target.value)}
            placeholder={numberChanged ? "Type it again — pasting is off" : "Only when the number changes"} />
        </Field>
        <Field label="IFSC code">
          <Input value={f.ifsc} onChange={(e) => set("ifsc", e.target.value.toUpperCase())} placeholder="e.g. HDFC0000123" />
        </Field>
        <Field label="Branch">
          <Input value={f.branch} onChange={(e) => set("branch", e.target.value)} placeholder="e.g. GHATKOPAR (E)" />
        </Field>
        <Field label="City">
          <Input value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="e.g. MUMBAI" />
        </Field>
        <Field label="State">
          <Input value={f.state} onChange={(e) => set("state", e.target.value)} placeholder="e.g. MAHARASHTRA" />
        </Field>
      </div>
      {mismatch && <div style={{ marginTop: 12 }}><Note tone="amber" icon={AlertTriangle}>The two account numbers do not match yet.</Note></div>}
      {err && <div style={{ marginTop: 12 }}><Note tone="amber" icon={AlertTriangle}>{err}</Note></div>}
    </Modal>
  );
}

function BanksCard({ banks, m }) {
  const toast = useToast();
  const [form, setForm] = useState(null);     // null | {} (new) | bank (edit)
  const [askId, setAskId] = useState(null);
  const busy = m.addBank.isPending || m.updateBank.isPending || m.removeBank.isPending;

  const save = (body, setErr) => {
    const done = { onSuccess: () => { toast(form?.id ? "Bank updated" : `Bank ${body.bank_name} added`); setForm(null); }, onError: (e) => setErr(e.message) };
    if (form?.id) m.updateBank.mutate({ id: form.id, body }, done);
    else m.addBank.mutate(body, done);
  };

  return (
    <Card className="opt-card opt-wide">
      <CardHead icon={Landmark} title="Banks">
        <Pill>{banks.length}</Pill>
        <Btn size="sm" icon={Plus} onClick={() => setForm({})}>Add bank account</Btn>
      </CardHead>
      <div className="opt-body">
        <div className="opt-hint">The account export proceeds are routed through — picked on the shipment details and on record packing.</div>
        {banks.length ? (
          <div className="bank-grid">
            {banks.map((b) => (
              <div key={b.id} className="bank-card">
                <div className="row nowrap" style={{ justifyContent: "space-between", gap: 8 }}>
                  <b className="bank-name">{b.bank_name}</b>
                  <span className="row nowrap" style={{ gap: 2 }}>
                    <button type="button" className="icon-btn bare" title="Edit" onClick={() => setForm(b)}><Pencil size={14} /></button>
                    <button type="button" className="icon-btn bare" title="Remove" onClick={() => setAskId(b.id)}><Trash2 size={14} /></button>
                  </span>
                </div>
                <dl className="bank-dl">
                  <dt>Account</dt><dd><Mono>{b.account_no}</Mono></dd>
                  <dt>IFSC</dt><dd><Mono>{b.ifsc || "—"}</Mono></dd>
                  <dt>Branch</dt><dd>{b.branch || "—"}</dd>
                  <dt>City / State</dt><dd>{[b.city, b.state].filter(Boolean).join(", ") || "—"}</dd>
                </dl>
                {askId === b.id && (
                  <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                    <span style={{ fontSize: 12.5, color: "var(--amber-ink)" }}>Remove this account?</span>
                    <Btn size="sm" variant="danger" icon={Trash2} disabled={busy}
                      onClick={() => m.removeBank.mutate(b.id, { onSuccess: () => { setAskId(null); toast(`Bank ${b.bank_name} removed`); } })}>Remove</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => setAskId(null)}>Keep</Btn>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={Landmark} title="No bank accounts yet" action={<Btn size="sm" icon={Plus} onClick={() => setForm({})}>Add bank account</Btn>}>
            Add the account a buyer pays into; the shipment details then pick it from a list.
          </Empty>
        )}
      </div>
      {form && <BankForm initial={form.id ? form : null} busy={busy} onClose={() => setForm(null)} onSave={save} />}
    </Card>
  );
}

/* ---------------- the item sequence ---------------- */

function SequenceCard({ sequence, m }) {
  const toast = useToast();
  const [list, setList] = useState(sequence);
  useEffect(() => setList(sequence), [sequence.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = list.join("|") !== sequence.join("|");
  const swap = (i, j) => setList((l) => { const a = [...l]; [a[i], a[j]] = [a[j], a[i]]; return a; });

  return (
    <Card className="opt-card">
      <CardHead icon={ListOrdered} title="Item sequence" />
      <div className="opt-body">
        <div className="opt-hint">
          The order items are listed in on every report and download when “All suppliers” is chosen,
          and the order record packing numbers cartons in. Oswin sorts by bore — 15 MM, 20 MM, 25 MM …
        </div>
        <ol className="seq-list">
          {list.map((k, i) => (
            <li key={k} className="seq-item">
              <span className="seq-n">{i + 1}</span>
              <span className="opt-text">{RANGE_LABEL[k] || k}</span>
              <button type="button" className="icon-btn bare" title="Move up" disabled={i === 0} onClick={() => swap(i, i - 1)}><ArrowUp size={14} /></button>
              <button type="button" className="icon-btn bare" title="Move down" disabled={i === list.length - 1} onClick={() => swap(i, i + 1)}><ArrowDown size={14} /></button>
            </li>
          ))}
        </ol>
        <div className="row wrap" style={{ gap: 8 }}>
          <Btn size="sm" icon={Check} disabled={!dirty || m.saveSequence.isPending}
            onClick={() => m.saveSequence.mutate(list, { onSuccess: () => toast("Item sequence saved") })}>Save order</Btn>
          <Btn size="sm" variant="ghost" icon={RotateCcw} disabled={list.join("|") === DEFAULT_SEQUENCE.join("|")}
            onClick={() => setList(DEFAULT_SEQUENCE)}>Default order</Btn>
        </div>
      </div>
    </Card>
  );
}

export default function AdditionalSettingsPanel() {
  const q = useOptions();
  const m = useOptionMutations();

  if (q.isLoading) return <Spinner label="Loading the settings…" />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const o = q.data || {};

  return (
    <div className="opt-grid">
      {LISTS.map((cfg) => (
        <ListCard key={cfg.key} cfg={cfg} values={o[cfg.key] || []} busy={m.saveList.isPending}
          save={(values, cb) => m.saveList.mutate({ key: cfg.key, values }, cb)} />
      ))}
      <SequenceCard sequence={o.item_sequence || DEFAULT_SEQUENCE} m={m} />
      <BanksCard banks={o.banks || []} m={m} />
    </div>
  );
}
