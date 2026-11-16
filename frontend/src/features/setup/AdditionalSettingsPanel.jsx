import { useEffect, useMemo, useState } from "react";
import {
  Truck, Package, Wallet, Anchor, MapPin, Landmark, ListOrdered, Plus, Pencil, Trash2, Check, X,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, RotateCcw, AlertTriangle, Layers, Loader2,
} from "lucide-react";
import {
  Card, CardHead, Btn, Field, Input, Pill, Mono, Note, Empty, Spinner, ErrorState, Modal, Seg, Select,
} from "../../components/ui/index.jsx";
import { useOptions, useOptionMutations, useSaveList, useItems, useSuppliers } from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import {
  DEFAULT_GROUPS, rangeBlocks, rangeKey, itemCategory, fullSequence, rangeLabel, rangeShort,
} from "../../lib/sequence.js";
import { MODES, MODE_LISTS } from "../../lib/modes.js";

/* Setup → Additional settings.

   The short lists the shipment forms pick from, each kept here once rather
   than typed fresh on every invoice: terms of delivery, packaging types,
   terms of payment, ports of loading and the ports buyers are shipped to — and
   the bank accounts the export proceeds come in through. Then the order every
   list in the app is read in, and the groups a range is split into.

   Each list works the same way: type an entry, Add, and it joins the list
   underneath; the pencil corrects one, the bin removes it. Terms of delivery,
   ports of loading and ship-to ports also say which modes of transport they
   serve — Water, Air, Land — and a shipment offers only the ones ticked for
   its own mode. */

const LISTS = [
  { key: "terms_delivery", title: "Terms of delivery", icon: Truck, eg: "e.g. FOB MUMBAI",
    hint: "Offered on the shipment details and on record packing, for the modes ticked. A corrected entry follows onto unshipped invoices." },
  { key: "packaging_types", title: "Packaging types", icon: Package, eg: "e.g. Bundles",
    hint: "What an item travels in — picked on each item. Every existing item is in Cartons." },
  { key: "terms_payment", title: "Terms of payment", icon: Wallet, eg: "e.g. D.P.SIGHT DRAFT",
    hint: "Offered on the shipment details and on record packing." },
  { key: "ports_loading", title: "Port of loading", icon: Anchor, eg: "e.g. NHAVA SHEVA-MUMBAI (INDIA)",
    hint: "Where the goods are loaded — a sea port, an air cargo terminal or a land border. Offered on shipments of the modes ticked." },
  { key: "ports_ship_to", title: "Ship to port", icon: MapPin, eg: "e.g. FREMANTLE",
    hint: "Offered on shipments of the modes ticked — a buyer's own ports (Setup → Buyers) come first. Removing one takes it off the buyers too." },
];

/* The small turning circle every Setup save shows on whatever it is saving. */
const Spin = ({ size = 13 }) => <Loader2 size={size} className="spin" aria-hidden="true" />;
const SpinIcon = (p) => <Loader2 {...p} className="spin" aria-hidden="true" />;

/* The Water / Air / Land toggles beside an entry, or under the box that adds
   one. `value` is the modes ticked; an unconfirmed entry passes none.
   `savingKey` is the chip whose click is being saved — it turns while the
   rest wait. */
function ModeToggles({ value, onToggle, disabled, label, savingKey }) {
  return (
    <span className="opt-modes" role="group" aria-label={label} aria-busy={savingKey ? true : undefined}>
      {MODES.map((m) => {
        const on = value.includes(m.k);
        const turning = savingKey === m.k;
        return (
          <button key={m.k} type="button" className={`mode-chip${on ? " on" : ""}${turning ? " saving" : ""}`} aria-pressed={on}
            disabled={disabled} title={turning ? `Saving ${m.label}…` : `${on ? "Untick" : "Tick"} ${m.label} — ${m.long}`} onClick={() => onToggle(m.k)}>
            {turning ? <Spin size={11} /> : on && <Check size={11} />}{m.label}
          </button>
        );
      })}
    </span>
  );
}

/* One list: the box that adds to it, and the entries under it. A list that
   carries modes (`modes` is its { entry: [mode] }) asks for them on every
   entry, a new one before it can be added.

   While a change is being saved the card says so — "Saving…" in its head, and
   a turning circle on the very chip or button that was clicked, which already
   shows the state it is being saved to. The rest of the card waits (each save
   sends the whole list, so two at once would overwrite each other); the other
   cards stay free. */
function ListCard({ cfg, values, modes }) {
  const toast = useToast();
  const saveList = useSaveList();
  const withModes = !!modes;
  const [draft, setDraft] = useState("");
  const [draftModes, setDraftModes] = useState([]);
  const [editAt, setEditAt] = useState(-1);
  const [editText, setEditText] = useState("");
  const [askAt, setAskAt] = useState(-1);
  const [err, setErr] = useState("");
  // What is being saved right now: { kind: "add" | "mode" | "confirm" | "edit" | "remove", v, k, next, i }.
  const [saving, setSaving] = useState(null);
  const busy = !!saving;

  const has = (text, except = -1) => values.some((v, i) => i !== except && v.toLowerCase() === text.toLowerCase());
  const modesOf = (v) => (modes?.[v]?.length ? modes[v] : []);
  const unset = withModes ? values.filter((v) => !modesOf(v).length) : [];
  const flip = (list, k) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
  const ordered = (list) => MODES.map((m) => m.k).filter((k) => list.includes(k));
  // An entry's chips as they read now — the state being saved, while it is.
  const shownModes = (v) => (saving?.kind === "mode" && saving.v === v ? saving.next
    : saving?.kind === "confirm" && !modesOf(v).length ? ["water"]
      : modesOf(v).length ? modesOf(v) : ["water"]);

  // `nextModes` is the whole map as it should be saved; only lists with modes send one.
  const commit = (what, next, done, renames, nextModes) => {
    setSaving(what);
    setErr("");
    saveList.mutate({ key: cfg.key, values: next, renames, modes: withModes ? (nextModes || modes) : undefined }, {
      onSuccess: () => done?.(),
      onError: (e) => setErr(e.message),
      onSettled: () => setSaving(null),
    });
  };

  const add = () => {
    if (busy) return;
    const text = draft.trim().replace(/\s+/g, " ");
    if (!text) return;
    if (has(text)) { setErr(`“${text}” is already on the list.`); return; }
    if (withModes && !draftModes.length) { setErr(`Tick the mode of transport “${text}” serves — Water, Air or Land.`); return; }
    commit({ kind: "add" }, [...values, text], () => { setDraft(""); setDraftModes([]); toast(`${cfg.title}: “${text}” added`); }, undefined,
      withModes ? { ...modes, [text]: ordered(draftModes) } : undefined);
  };
  const saveEdit = (i) => {
    if (busy) return;
    const text = editText.trim().replace(/\s+/g, " ");
    if (!text) return;
    if (has(text, i)) { setErr(`“${text}” is already on the list.`); return; }
    // The corrected spelling keeps the modes the old one had.
    let nextModes;
    if (withModes) {
      nextModes = { ...modes };
      if (nextModes[values[i]]) { nextModes[text] = nextModes[values[i]]; if (text !== values[i]) delete nextModes[values[i]]; }
    }
    // Named as a rename, so what already picked the old spelling can follow it.
    commit({ kind: "edit", i }, values.map((v, j) => (j === i ? text : v)), () => { setEditAt(-1); toast(`${cfg.title} updated`); }, { [values[i]]: text }, nextModes);
  };
  const remove = (i) => {
    if (busy) return;
    let nextModes;
    if (withModes) { nextModes = { ...modes }; delete nextModes[values[i]]; }
    commit({ kind: "remove", i }, values.filter((_, j) => j !== i), () => { setAskAt(-1); toast(`${cfg.title}: “${values[i]}” removed`); }, undefined, nextModes);
  };
  /* An entry with nothing confirmed counts as Water, so the first tick on it
     starts from Water as shown. The last mode cannot be taken off. */
  const toggle = (v, k) => {
    if (busy) return;
    const cur = modesOf(v).length ? modesOf(v) : ["water"];
    const next = ordered(modesOf(v).length ? flip(cur, k) : (k === "water" ? ["water"] : [...cur, k]));
    if (!next.length) { setErr(`“${v}” must serve at least one mode of transport.`); return; }
    commit({ kind: "mode", v, k, next }, values, () => toast(`${v}: ${next.map((x) => MODES.find((m) => m.k === x).label).join(" + ")}`), undefined, { ...modes, [v]: next });
  };
  const confirmWater = () => {
    if (busy) return;
    commit({ kind: "confirm" }, values, () => toast(`${cfg.title}: ${unset.length} entr${unset.length === 1 ? "y" : "ies"} confirmed as Water`),
      undefined, { ...modes, ...Object.fromEntries(unset.map((v) => [v, ["water"]])) });
  };

  return (
    <Card className="opt-card">
      <CardHead icon={cfg.icon} title={cfg.title}>
        {busy && <span className="opt-saving" role="status"><Spin /> Saving…</span>}
        <Pill>{values.length}</Pill>
      </CardHead>
      <div className="opt-body">
        <div className="opt-add">
          <Input value={draft} placeholder={cfg.eg} aria-label={`New ${cfg.title.toLowerCase()}`}
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <Btn icon={saving?.kind === "add" ? SpinIcon : Plus} disabled={!draft.trim() || busy || (withModes && !draftModes.length)} onClick={add}>
            {saving?.kind === "add" ? "Adding…" : "Add"}
          </Btn>
        </div>
        {withModes && (
          <div className="opt-mode-ask">
            <span>Mode of transport:</span>
            <ModeToggles value={draftModes} disabled={busy} label={`Modes for the new ${cfg.title.toLowerCase()}`}
              onToggle={(k) => setDraftModes((m) => flip(m, k))} />
          </div>
        )}
        <div className="opt-hint">{cfg.hint}</div>
        {unset.length > 0 && (
          <Note tone="amber" icon={AlertTriangle}>
            {unset.length === 1 ? "One entry was" : `${unset.length} entries were`} added before modes of transport existed
            and count as <b>Water</b> until confirmed — tick Air or Land on any that also serve those.{" "}
            <button type="button" className="btn btn-quiet btn-sm" style={{ height: 22, padding: "0 6px" }} disabled={busy} onClick={confirmWater}>
              {saving?.kind === "confirm" ? <><Spin size={12} /> Confirming…</> : `Confirm ${unset.length === 1 ? "it" : "all"} as Water`}
            </button>
          </Note>
        )}
        {err && <Note tone="amber" icon={AlertTriangle}>{err}</Note>}
        {values.length ? (
          <ul className="opt-list">
            {values.map((v, i) => (
              <li key={`${v}:${i}`} className={`opt-item${withModes ? " has-modes" : ""}`}>
                {editAt === i ? (
                  <>
                    <Input className="input-sm" value={editText} autoFocus disabled={busy}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(i); if (e.key === "Escape" && !busy) setEditAt(-1); }} />
                    <button type="button" className="icon-btn bare" title={saving?.kind === "edit" ? "Saving…" : "Save"} disabled={busy} onClick={() => saveEdit(i)}>
                      {saving?.kind === "edit" && saving.i === i ? <Spin size={15} /> : <Check size={15} />}
                    </button>
                    <button type="button" className="icon-btn bare" title="Cancel" disabled={busy} onClick={() => setEditAt(-1)}><X size={15} /></button>
                  </>
                ) : askAt === i ? (
                  <>
                    <span className="opt-text">Remove “{v}”?</span>
                    <Btn size="sm" variant="danger" icon={saving?.kind === "remove" ? SpinIcon : Trash2} disabled={busy} onClick={() => remove(i)}>
                      {saving?.kind === "remove" ? "Removing…" : "Remove"}
                    </Btn>
                    <Btn size="sm" variant="ghost" disabled={busy} onClick={() => setAskAt(-1)}>Keep</Btn>
                  </>
                ) : (
                  <>
                    <span className="opt-text">
                      {v}
                      {withModes && !modesOf(v).length && saving?.kind !== "confirm" && !(saving?.kind === "mode" && saving.v === v)
                        && <span className="opt-unset" title="Added before modes existed — counted as Water until confirmed"> · mode?</span>}
                    </span>
                    {withModes && (
                      <ModeToggles value={shownModes(v)} disabled={busy}
                        savingKey={saving?.kind === "mode" && saving.v === v ? saving.k : null}
                        label={`Modes for ${v}`} onToggle={(k) => toggle(v, k)} />
                    )}
                    <button type="button" className="icon-btn bare" title="Edit" disabled={busy} onClick={() => { setEditAt(i); setEditText(v); setAskAt(-1); }}><Pencil size={14} /></button>
                    <button type="button" className="icon-btn bare" title="Remove" disabled={busy} onClick={() => { setAskAt(i); setEditAt(-1); }}><Trash2 size={14} /></button>
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
          <Btn size="sm" icon={busy ? SpinIcon : Check} disabled={busy} onClick={submit}>{busy ? "Saving…" : editing ? "Save bank" : "Add bank"}</Btn>
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
        {busy && <span className="opt-saving" role="status"><Spin /> Saving…</span>}
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
                    <Btn size="sm" variant="danger" icon={m.removeBank.isPending ? SpinIcon : Trash2} disabled={busy}
                      onClick={() => m.removeBank.mutate(b.id, { onSuccess: () => { setAskId(null); toast(`Bank ${b.bank_name} removed`); } })}>
                      {m.removeBank.isPending ? "Removing…" : "Remove"}
                    </Btn>
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

function SequenceCard({ sequence, defaults, suppliers, counts, m }) {
  const toast = useToast();
  const [list, setList] = useState(sequence);
  useEffect(() => setList(sequence), [sequence.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = list.join("|") !== sequence.join("|");
  const swap = (i, j) => setList((l) => { const a = [...l]; [a[i], a[j]] = [a[j], a[i]]; return a; });

  return (
    <Card className="opt-card">
      <CardHead icon={ListOrdered} title="Supplier sequence" />
      <div className="opt-body">
        <div className="opt-hint">
          The order items are listed in on every report and download when “All suppliers” is chosen,
          and the order record packing numbers cartons in. Oswin sorts by bore — 15 MM, 20 MM, 25 MM …
          A supplier added under Suppliers joins the end.
        </div>
        <ol className="seq-list">
          {list.map((k, i) => (
            <li key={k} className="seq-item">
              <span className="seq-n">{i + 1}</span>
              <span className="opt-text">
                {rangeLabel(k, suppliers)}
                {counts && !counts[k] && <span className="grp-sub"> · No items</span>}
              </span>
              <button type="button" className="icon-btn bare" title="Move up" disabled={i === 0} onClick={() => swap(i, i - 1)}><ArrowUp size={14} /></button>
              <button type="button" className="icon-btn bare" title="Move down" disabled={i === list.length - 1} onClick={() => swap(i, i + 1)}><ArrowDown size={14} /></button>
            </li>
          ))}
        </ol>
        <div className="row wrap" style={{ gap: 8 }}>
          <Btn size="sm" icon={m.saveSequence.isPending ? SpinIcon : Check} disabled={!dirty || m.saveSequence.isPending}
            onClick={() => m.saveSequence.mutate(list, { onSuccess: () => toast("Supplier sequence saved") })}>
            {m.saveSequence.isPending ? "Saving…" : "Save order"}
          </Btn>
          <Btn size="sm" variant="ghost" icon={RotateCcw} disabled={list.join("|") === defaults.join("|")}
            onClick={() => setList(defaults)}>Default order</Btn>
        </div>
      </div>
    </Card>
  );
}

/* ---------------- the item groups inside each range ----------------

   A range's goods can print as more than one table — Oswin's M/F threaded
   pipes (PMF…) in a block of their own below the rest of Oswin, by default.
   An item's category is the letters its GD code starts with (PE, PEL, PFH,
   PMF, PP …). Here each range's categories are put into groups: the groups
   are listed in order (move them up or down), a group's categories in the
   order they should print, and anything no group names stays in "Everything
   else", in the range's own order (Oswin by bore). A category typed here that
   no item has yet is kept for the items added under it later. */

const clone = (g) => JSON.parse(JSON.stringify(g || {}));
/* Two settings that print the same: ranges with only their rest block
   dropped, every block in one shape — so "unsaved" means a real change. */
const norm = (g) => JSON.stringify(Object.keys(g || {}).sort().map((r) => [r, (g[r] || [])
  .map((b) => ({ id: b.rest ? "rest" : b.id, name: b.name || "", rest: !!b.rest, cats: b.rest ? [] : b.cats || [], sort: b.rest ? "natural" : b.sort || "listed" }))])
  .filter(([, list]) => list.length > 1 || list.some((b) => !b.rest || b.name)));
const sameGroups = (a, b) => norm(a) === norm(b);

function GroupBlock({ g, i, count, cats, free, onChange, onMove, onRemove }) {
  const [pick, setPick] = useState("");
  const [typed, setTyped] = useState("");
  const set = (patch) => onChange({ ...g, ...patch });
  const addCat = (c) => {
    const code = String(c || "").replace(/[^A-Za-z]/g, "").toUpperCase();
    if (!code || g.cats.includes(code)) return;
    set({ cats: [...g.cats, code] });
    setPick(""); setTyped("");
  };
  const moveCat = (from, to) => {
    if (to < 0 || to >= g.cats.length) return;
    const next = [...g.cats];
    [next[from], next[to]] = [next[to], next[from]];
    set({ cats: next });
  };
  const countOf = (c) => cats.find((x) => x.cat === c)?.count || 0;

  return (
    <li className="grp-card">
      <div className="grp-head">
        <span className="seq-n">{i + 1}</span>
        {g.rest ? (
          <span className="opt-text">Everything else <span className="grp-sub">— whatever no group names, in the range's own order</span></span>
        ) : (
          <Input className="input-sm grp-name" value={g.name} placeholder="Group name, e.g. PMF"
            aria-label="Group name" onChange={(e) => set({ name: e.target.value })} />
        )}
        <button type="button" className="icon-btn bare" title="Print this block earlier" disabled={i === 0} onClick={() => onMove(i, i - 1)}><ArrowUp size={14} /></button>
        <button type="button" className="icon-btn bare" title="Print this block later" disabled={i === count - 1} onClick={() => onMove(i, i + 1)}><ArrowDown size={14} /></button>
        {!g.rest && <button type="button" className="icon-btn bare" title="Remove this group — its categories go back to “Everything else”" onClick={onRemove}><Trash2 size={14} /></button>}
      </div>

      {g.rest ? (
        <div className="grp-cats">
          {free.length
            ? free.map((c) => <span key={c.cat} className="grp-chip ro"><Mono>{c.cat}</Mono> <span className="grp-n">{c.count}</span></span>)
            : <span className="grp-sub">Every category is in a group.</span>}
        </div>
      ) : (
        <>
          <div className="grp-cats">
            {g.cats.length ? g.cats.map((c, ci) => (
              <span key={c} className="grp-chip">
                {g.sort === "listed" && g.cats.length > 1 && (
                  <button type="button" className="icon-btn bare" title="Earlier in the group" disabled={ci === 0} onClick={() => moveCat(ci, ci - 1)}><ArrowLeft size={12} /></button>
                )}
                <Mono>{c}</Mono> <span className="grp-n">{countOf(c) || "new"}</span>
                {g.sort === "listed" && g.cats.length > 1 && (
                  <button type="button" className="icon-btn bare" title="Later in the group" disabled={ci === g.cats.length - 1} onClick={() => moveCat(ci, ci + 1)}><ArrowRight size={12} /></button>
                )}
                <button type="button" className="icon-btn bare" title={`Take ${c} out of this group`} onClick={() => set({ cats: g.cats.filter((x) => x !== c) })}><X size={12} /></button>
              </span>
            )) : <span className="grp-sub" style={{ color: "var(--amber-ink)" }}>Add at least one category.</span>}
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <Select className="input-sm" style={{ flex: "1 1 170px", maxWidth: 220 }} value={pick} aria-label="Add a category to this group"
              onChange={(e) => { setPick(e.target.value); addCat(e.target.value); }}>
              <option value="">Add a category…</option>
              {free.map((c) => <option key={c.cat} value={c.cat}>{c.cat} · {c.count} item{c.count === 1 ? "" : "s"} ({c.sample.join(", ")})</option>)}
            </Select>
            <Input className="input-sm" style={{ flex: "1 1 120px", maxWidth: 170 }} value={typed} placeholder="or type one, e.g. PFH"
              aria-label="Type a category" onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCat(typed)} />
            <Btn size="sm" variant="ghost" icon={Plus} disabled={!typed.trim()} onClick={() => addCat(typed)}>Add</Btn>
            <span className="grow" />
            <Seg value={g.sort} onChange={(v) => set({ sort: v })}
              options={[["listed", "As listed"], ["natural", "By size"]]} />
          </div>
        </>
      )}
    </li>
  );
}

/* { categories: { range: [{ cat, count, sample }] }, counts: { range: items } }
   — the categories the item master holds in each range, and how many items
   each range has, worked out here from the items the browser already has
   rather than asked of the server on every settings read. `counts` is null
   until the items are in, so no range reads "No items" while they load. */
function useCategories(suppliers) {
  const items = useItems().data;
  return useMemo(() => {
    const supOf = Object.fromEntries((suppliers || []).map((x) => [x.id, x]));
    const found = {};
    const counts = {};
    (items || []).forEach((it) => {
      const range = rangeKey(it, supOf[it.supplier_id] || "");
      if (!range) return;
      counts[range] = (counts[range] || 0) + 1;
      const cat = itemCategory(it);
      if (!cat) return;
      const c = ((found[range] ||= {})[cat] ||= { cat, count: 0, sample: [] });
      c.count += 1;
      if (c.sample.length < 3) c.sample.push(it.gd || it.code);
    });
    const categories = Object.fromEntries(Object.entries(found)
      .map(([r, cs]) => [r, Object.values(cs).sort((a, b) => a.cat.localeCompare(b.cat))]));
    return { categories, counts: items && suppliers ? counts : null };
  }, [items, suppliers]);
}

/* What a range prints as — "Oswin → Oswin · PMF", or one table. `short` is
   the range's short name (rangeShort). */
const printsAs = (short, blocks) => blocks.map((b) => (b.rest
  ? short + (b.name ? ` · ${b.name}` : "")
  : `${short} · ${b.name || b.cats.join(" + ") || "…"}`)).join("  →  ");

/* One range's groups, edited in a popup: the blocks in print order, Reset to
   the range's default, and Save — which writes this range and leaves every
   other range as it was saved. */
function RangeGroupsModal({ range, short, empty, saved, categories, m, onClose }) {
  const toast = useToast();
  const [blocks, setBlocks] = useState(() => clone(rangeBlocks(range, saved)));
  const cats = categories[range] || [];
  const taken = new Set(blocks.flatMap((b) => (b.rest ? [] : b.cats)));
  const free = cats.filter((c) => !taken.has(c.cat));
  const withThis = (list) => ({ ...clone(saved), [range]: list });
  const dirty = !sameGroups(withThis(blocks), saved);
  const isDefault = sameGroups(withThis(blocks), withThis(rangeBlocks(range, DEFAULT_GROUPS)));
  const incomplete = blocks.some((b) => !b.rest && !(b.cats || []).length);

  const move = (from, to) => {
    if (to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    [next[from], next[to]] = [next[to], next[from]];
    setBlocks(next);
  };
  const save = () => m.saveGroups.mutate(withThis(blocks), {
    onSuccess: () => { toast(`${short}: item groups saved — lists and documents follow them now`); onClose(); },
  });

  return (
    <Modal title={`Item groups · ${short}`} icon={Layers} onClose={onClose}
      footer={<>
        <Btn size="sm" variant="ghost" icon={RotateCcw} disabled={isDefault} onClick={() => setBlocks(clone(rangeBlocks(range, DEFAULT_GROUPS)))}>
          Reset to default
        </Btn>
        <div className="row" style={{ gap: 8 }}>
          <Btn size="sm" variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn size="sm" icon={m.saveGroups.isPending ? SpinIcon : Check} disabled={!dirty || incomplete || m.saveGroups.isPending} onClick={save}>
            {m.saveGroups.isPending ? "Saving…" : "Save groups"}
          </Btn>
        </div>
      </>}>
      <div className="stack-sm">
        <div className="opt-hint">
          Each block prints as a table of its own, in this order, on the order and invoice summaries and
          on every download. Anything no group names stays in “Everything else”. Inside a group, “As
          listed” prints the categories in the order shown; “By size” mixes them in the range's own
          order (Oswin by bore).
        </div>
        {empty && <Note tone="amber" icon={AlertTriangle}>No items for {short} yet — groups set here apply to its items once they are added.</Note>}
        <ol className="grp-list">
          {blocks.map((g, i) => (
            <GroupBlock key={g.id || i} g={g} i={i} count={blocks.length} cats={cats} free={free}
              onChange={(ng) => setBlocks(blocks.map((b, j) => (j === i ? ng : b)))}
              onMove={move} onRemove={() => setBlocks(blocks.filter((_, j) => j !== i))} />
          ))}
        </ol>
        <div className="opt-hint">
          Prints as: {printsAs(short, blocks)}{blocks.length < 2 && " (one table, as before)"}
        </div>
        {incomplete && <Note tone="amber" icon={AlertTriangle}>Every group needs at least one category — add one, or remove the group.</Note>}
        <div>
          <Btn size="sm" variant="teal" icon={Plus}
            onClick={() => setBlocks([...blocks, { id: `g${Date.now().toString(36)}`, name: "", cats: [], sort: "listed" }])}>
            Add a group
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* The card itself: one row per range, saying what it prints as. Clicking a
   range opens its groups in a popup. */
function ItemGroupsCard({ saved, sequence, suppliers, categories, counts, m }) {
  const [open, setOpen] = useState(null);

  return (
    <Card className="opt-card">
      <CardHead icon={Layers} title="Item groups" />
      <div className="opt-body">
        <div className="opt-hint">
          Split a supplier's range into blocks that print as tables of their own. A category is the
          letters a GD code starts with (PE, PMF, PFH …). Click a range to change its groups.
        </div>
        <ol className="seq-list">
          {sequence.map((r) => {
            const blocks = rangeBlocks(r, saved);
            const short = rangeShort(r, suppliers);
            const empty = counts && !counts[r];
            return (
              <li key={r}>
                <button type="button" className="seq-item grp-row" onClick={() => setOpen(r)}
                  title={`Change ${short}'s item groups`}>
                  <span className="opt-text">
                    {r === "Oswin" ? "Oswin" : rangeLabel(r, suppliers)}
                    <span className="grp-sub grp-prints">
                      {empty ? "No items" : blocks.length > 1 ? printsAs(short, blocks) : "One table"}
                    </span>
                  </span>
                  {blocks.length > 1 && <Pill tone="teal">{blocks.length} blocks</Pill>}
                  <Pencil size={14} style={{ color: "var(--faint)", flexShrink: 0 }} />
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      {open && <RangeGroupsModal range={open} short={rangeShort(open, suppliers)} empty={!!counts && !counts[open]}
        saved={saved} categories={categories} m={m} onClose={() => setOpen(null)} />}
    </Card>
  );
}

export default function AdditionalSettingsPanel() {
  const q = useOptions();
  const m = useOptionMutations();
  const suppliers = useSuppliers().data;
  const { categories, counts } = useCategories(suppliers);
  /* Worked out against the suppliers on hand, not just read from the saved
     settings, so a supplier added or removed shows here straight away. */
  const sequence = useMemo(() => fullSequence(q.data?.item_sequence, suppliers), [q.data?.item_sequence, suppliers]);
  const defaults = useMemo(() => fullSequence([], suppliers), [suppliers]);

  if (q.isLoading) return <Spinner label="Loading the settings…" />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const o = q.data || {};

  return (
    <div className="opt-grid">
      {LISTS.map((cfg) => (
        <ListCard key={cfg.key} cfg={cfg} values={o[cfg.key] || []}
          modes={MODE_LISTS.includes(cfg.key) ? (o.modes?.[cfg.key] || {}) : null} />
      ))}
      <SequenceCard sequence={sequence} defaults={defaults} suppliers={suppliers} counts={counts} m={m} />
      <ItemGroupsCard saved={o.item_groups || DEFAULT_GROUPS} sequence={sequence} suppliers={suppliers}
        categories={categories} counts={counts} m={m} />
      <BanksCard banks={o.banks || []} m={m} />
    </div>
  );
}
