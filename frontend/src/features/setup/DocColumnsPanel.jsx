import { useEffect, useMemo, useState } from "react";
import { Columns3, Eye, EyeOff, Trash2, RotateCcw, Save, Search, Copy, FileText, AlertTriangle } from "lucide-react";
import {
  Card, CardHead, Btn, Pill, Mono, Note, Empty, Spinner, Modal, SearchInput,
} from "../../components/ui/index.jsx";
import {
  useInvoices, usePoList, useItems, useBuyers, useSuppliers, useTransports, usePoLines, useOptions,
  useDocColumns, useSaveDocColumns,
} from "../../api/hooks.js";
import { useToast } from "../../providers/ToastProvider.jsx";
import { useIsMobile } from "../../lib/useIsMobile.js";
import { docCtx, poCtx } from "../../lib/docCtx.js";
import { renderDocument, DOC_META, DOC_GROUPS, PREVIEW_CSS, isPoDoc } from "../../lib/docs.js";
import { discoverColumns, rulesByDoc, sameColumn } from "../../lib/docColumns.js";
import { safeHtml } from "../../lib/safeHtml.js";
import { FitPaper } from "../documents/DocumentsPage.jsx";

/* Setup → Document columns.

   Any column a document prints can be hidden or deleted here, paper by paper
   (lib/docColumns.js does the taking out). The columns offered are the ones
   the document actually prints today, read off the latest invoice (or, for
   the PO papers, the latest purchase order) — so what is listed is what is on
   the paper.

   Picking Hide or Delete for a column offers to do the same wherever else the
   library prints a column of that name — "LEN (MM)" on the invoice is
   "LENGTH" on the packing sheet — the same name ticked, a similar one left for
   the client to decide. Nothing is saved until Save: the moment anything is
   changed a pop-up stands at the foot of the screen with Save in it, and
   leaving the tab (or the page) with changes unsaved asks first. Each paper
   can be reset to print every column again. */

const DOCS = [...new Set(DOC_GROUPS.flatMap((g) => g.docs))];

const MODES = [
  { k: "show", label: "Show", icon: Eye },
  { k: "hide", label: "Hide", icon: EyeOff },
  { k: "delete", label: "Delete", icon: Trash2 },
];
const MODE_TONE = { hide: "amber", delete: "red" };
const MODE_WORD = { show: "show", hide: "hide", delete: "delete" };

const id = (doc, key) => `${doc}|${key}`;

/* Show / Hide / Delete for one column. */
function ModePick({ value, onChange }) {
  return (
    <div className="seg" style={{ flexShrink: 0 }}>
      {MODES.map(({ k, label, icon: Icon }) => (
        <button key={k} type="button" className={value === k ? "on" : ""} onClick={() => onChange(k)}
          title={k === "show" ? "Print this column" : k === "hide"
            ? "Leave it off the preview and PDF; hidden (not removed) in the Excel"
            : "Leave it off the preview and PDF; removed from the Excel too"}>
          <Icon size={13} /> {label}
        </button>
      ))}
    </div>
  );
}

/* `leave` is a tab Setup wants to switch to while this panel is open;
   `onLeave(true)` lets it go, `onLeave(false)` keeps the panel. `onDirty`
   tells Setup whether there is anything unsaved. */
export default function DocColumnsPanel({ leave = null, onLeave = () => {}, onDirty = () => {} }) {
  const toast = useToast();
  const mobile = useIsMobile();

  /* ---- the papers, built off the latest invoice and the latest order ---- */
  const invq = useInvoices();
  const poq = usePoList();
  const items = useItems().data;
  const buyers = useBuyers().data;
  const suppliers = useSuppliers().data;
  const transports = useTransports().data;
  const poLines = usePoLines().data;
  const sequence = useOptions().data?.item_sequence;
  const invoices = invq.data || [];
  const pos = poq.data || [];
  const ready = !!(items && buyers && suppliers && transports && poLines && !invq.isLoading && !poq.isLoading);

  /* Built with no rules at all, so every column is on offer — including the
     ones already hidden. */
  const invCtx = useMemo(() => (ready && invoices[0] ? docCtx({
    invoice: invoices[0], items, buyers, suppliers, poLines, transports, invoices, sequence,
  }) : null), [ready, invoices, items, buyers, suppliers, poLines, transports, sequence]);
  const orderCtx = useMemo(() => (ready && pos[0] ? poCtx({
    po: pos[0].po, items, buyers, suppliers, poLines, transports, sequence,
  }) : null), [ready, pos, items, buyers, suppliers, poLines, transports, sequence]);
  const ctxFor = (no) => (isPoDoc(no) ? orderCtx : invCtx);

  /* Every document's columns. Building forty papers takes a moment, so it is
     done after the panel has drawn rather than holding it up. */
  const [catalog, setCatalog] = useState(null);
  useEffect(() => {
    if (!ready) return undefined;
    const t = setTimeout(() => {
      const out = {};
      DOCS.forEach((no) => {
        const ctx = isPoDoc(no) ? orderCtx : invCtx;
        try { out[no] = ctx ? discoverColumns(renderDocument(no, { ...ctx, autoColumns: false })) : []; } catch (e) { out[no] = []; }
      });
      setCatalog(out);
    }, 0);
    return () => clearTimeout(t);
  }, [ready, invCtx, orderCtx]);

  /* ---- the rules: saved, and the draft being edited ---- */
  const saved = useDocColumns();
  const save = useSaveDocColumns();
  const [draft, setDraft] = useState(null);       // Map id → { doc, key, label, mode }
  const fromSaved = () => new Map((saved.data?.rules || []).map((r) => [id(r.doc, r.key), r]));
  useEffect(() => { if (saved.data && !draft) setDraft(fromSaved()); }, [saved.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = useMemo(() => {
    if (!draft || !saved.data) return false;
    const a = fromSaved();
    if (a.size !== draft.size) return true;
    for (const [k, r] of draft) if (a.get(k)?.mode !== r.mode) return true;
    return false;
  }, [draft, saved.data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { onDirty(dirty); }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onDirty(false), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Closing or reloading the page with changes unsaved asks first.
  useEffect(() => {
    if (!dirty) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const modeOf = (doc, key) => draft?.get(id(doc, key))?.mode || "show";
  const countOf = (doc) => (draft ? [...draft.values()].filter((r) => r.doc === doc).length : 0);

  const setModes = (list) => setDraft((d) => {
    const next = new Map(d);
    list.forEach(({ doc, key, label, mode }) => {
      if (mode === "show") next.delete(id(doc, key));
      else next.set(id(doc, key), { doc, key, label, mode });
    });
    return next;
  });

  /* ---- which document is open, and its columns ---- */
  const [open, setOpen] = useState("31");
  const [q, setQ] = useState("");
  const [colQ, setColQ] = useState("");
  const docs = DOCS.filter((no) => {
    const ql = q.trim().toLowerCase();
    return !ql || no.toLowerCase().includes(ql) || (DOC_META[no] || "").toLowerCase().includes(ql);
  });
  const cols = useMemo(() => {
    const found = catalog?.[open] || [];
    const known = new Set(found.map((c) => c.key));
    /* A rule for a column this sample does not print (a range not on this
       invoice) is still listed, so it can be changed or cleared. */
    const extra = draft ? [...draft.values()].filter((r) => r.doc === open && !known.has(r.key))
      .map((r) => ({ key: r.key, label: r.label, absent: true })) : [];
    const ql = colQ.trim().toLowerCase();
    return [...found, ...extra].filter((c) => !ql || c.label.toLowerCase().includes(ql));
  }, [catalog, open, draft, colQ]);

  /* The same column elsewhere in the library. */
  const elsewhere = (col) => {
    if (!catalog) return [];
    const out = [];
    DOCS.forEach((no) => {
      if (no === open) return;
      (catalog[no] || []).forEach((c) => {
        const rel = sameColumn(col.key, c.key);
        if (rel) out.push({ doc: no, key: c.key, label: c.label, rel });
      });
    });
    return out;
  };

  /* ---- picking a mode, and the "also in" suggestion ---- */
  const [suggest, setSuggest] = useState(null);   // { col, mode, matches, ticked:Set }
  const pick = (col, mode) => {
    setModes([{ doc: open, key: col.key, label: col.label, mode }]);
    const matches = elsewhere(col).filter((m) => modeOf(m.doc, m.key) !== mode);
    if (matches.length) {
      setSuggest({
        col, mode, matches,
        ticked: new Set(matches.filter((m) => m.rel === "same").map((m) => id(m.doc, m.key))),
      });
    }
  };
  const applySuggest = () => {
    const { mode, matches, ticked } = suggest;
    const list = matches.filter((m) => ticked.has(id(m.doc, m.key))).map((m) => ({ ...m, mode }));
    setModes(list);
    if (list.length) toast(`${MODE_WORD[mode][0].toUpperCase()}${MODE_WORD[mode].slice(1)} applied to ${list.length} more column${list.length === 1 ? "" : "s"}`);
    setSuggest(null);
  };

  /* ---- preview of the open paper with the draft applied ---- */
  const [preview, setPreview] = useState(false);
  const draftRules = useMemo(() => rulesByDoc({ rules: draft ? [...draft.values()] : [] }), [draft]);
  const previewHtml = useMemo(() => {
    if (!preview) return "";
    const ctx = ctxFor(open);
    return ctx ? renderDocument(open, { ...ctx, colRules: draftRules }) : "";
  }, [preview, open, draftRules, invCtx, orderCtx]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (then) => save.mutate([...draft.values()], {
    onSuccess: (data) => {
      setDraft(new Map((data.rules || []).map((r) => [id(r.doc, r.key), r])));
      toast("Document columns saved — every preview and download now follows them");
      if (typeof then === "function") then();
    },
    onError: (e) => toast(e.message || "Could not save the document columns"),
  });

  /* Reset — a paper back to printing every column. Like any change it waits
     for Save. */
  const [resetting, setResetting] = useState(null); // doc no, or "all"
  const resetDoc = (no) => {
    setModes([...draft.values()].filter((r) => no === "all" || r.doc === no).map((r) => ({ ...r, mode: "show" })));
    setResetting(null);
  };

  if (saved.isLoading || !draft || !ready) return <Spinner label="Reading the documents…" />;
  if (!invCtx && !orderCtx) {
    return (
      <Card>
        <Empty icon={FileText} title="No invoice or purchase order to read the documents from yet">
          The columns are read off the papers themselves — enter a buyer order or record packing first.
        </Empty>
      </Card>
    );
  }

  const total = draft.size;
  const sample = (no) => (isPoDoc(no)
    ? (orderCtx ? `purchase order ${pos[0].po}` : null)
    : (invCtx ? `invoice ${invoices[0].invoice_no}` : null));

  return (
    <div className="stack" style={{ paddingBottom: dirty ? 80 : 0 }}>
      <Note tone="teal" icon={Columns3}>
        Choose, document by document, which columns print.{" "}
        <b>Hide</b> leaves the column off the preview and the PDF and hides it in the Excel (still in the
        file — right-click → Unhide brings it back). <b>Delete</b> leaves it off the preview and the PDF and
        clears it from the Excel as well. A figure another column is worked out from always stays in the
        Excel, hidden, so no total ever changes. Picking Hide or Delete offers to do the same wherever
        else the column is printed.
      </Note>

      <div className="split" style={{ gridTemplateColumns: mobile ? "1fr" : "minmax(0,0.8fr) minmax(0,1.6fr)" }}>
        {/* ---------- the documents ---------- */}
        <Card>
          <CardHead icon={FileText} title="Documents">
            {total > 0 && <Pill tone="amber">{total} column{total === 1 ? "" : "s"} changed</Pill>}
            {total > 0 && <Btn size="sm" variant="ghost" icon={RotateCcw} onClick={() => setResetting("all")}>Reset all</Btn>}
          </CardHead>
          <div style={{ padding: "10px 12px 4px" }}>
            <SearchInput value={q} onChange={setQ} placeholder="Find a document…" />
          </div>
          <div style={{ maxHeight: mobile ? 260 : 620, overflowY: "auto", padding: "4px 6px 8px" }}>
            {docs.map((no) => {
              const n = countOf(no);
              const has = catalog ? (catalog[no] || []).length : null;
              return (
                <button key={no} type="button" onClick={() => { setOpen(no); setColQ(""); setPreview(false); }}
                  className="row"
                  style={{
                    width: "100%", gap: 10, padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                    textAlign: "left", background: open === no ? "var(--teal-bg)" : "transparent",
                    color: "var(--ink)",
                  }}>
                  <Mono>{no}</Mono>
                  <span style={{ flex: 1, fontSize: 13 }}>{DOC_META[no]}</span>
                  {n > 0 ? <Pill tone="amber">{n}</Pill>
                    : has === 0 ? <span style={{ fontSize: 11, color: "var(--faint)" }}>no columns</span> : null}
                </button>
              );
            })}
          </div>
        </Card>

        {/* ---------- the open document's columns ---------- */}
        <Card>
          <CardHead icon={Columns3} title={`${open} · ${DOC_META[open] || ""}`}>
            <Btn size="sm" variant="ghost" icon={Eye} onClick={() => setPreview(true)} disabled={!ctxFor(open)}>Preview</Btn>
            <Btn size="sm" variant="ghost" icon={RotateCcw} disabled={!countOf(open)}
              title={countOf(open) ? "Print every column of this document again" : "Every column of this document already prints"}
              onClick={() => setResetting(open)}>
              Reset document
            </Btn>
          </CardHead>
          {!catalog ? <Spinner label="Reading the documents…" /> : (
            <div>
              <div className="row wrap" style={{ gap: 10, padding: "10px 14px", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "var(--faint)" }}>
                  {sample(open) ? <>Columns as printed on {sample(open)}.</> : <>No {isPoDoc(open) ? "purchase order" : "invoice"} to read this paper from yet.</>}
                </span>
                {(catalog[open] || []).length > 8 && (
                  <div style={{ minWidth: 200 }}><SearchInput value={colQ} onChange={setColQ} placeholder="Find a column…" /></div>
                )}
              </div>
              {!cols.length ? (
                <Empty icon={Columns3} title={colQ ? "No column by that name" : "This paper has no columns to choose"}>
                  {colQ ? null : "It is a letter or a form rather than a table — nothing on it is laid out in columns."}
                </Empty>
              ) : cols.map((c, i) => {
                const mode = modeOf(open, c.key);
                const also = elsewhere(c);
                const same = also.filter((m) => m.rel === "same").length;
                return (
                  <div key={c.key} className="row wrap"
                    style={{ gap: 10, padding: "9px 14px", borderTop: "1px solid var(--border)", justifyContent: "space-between" }}>
                    <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                        <span style={{
                          fontWeight: 600, fontSize: 13.5, color: "var(--ink)",
                          textDecoration: mode === "delete" ? "line-through" : "none",
                          opacity: mode === "show" ? 1 : 0.7,
                        }}>{c.label}</span>
                        {mode !== "show" && <Pill tone={MODE_TONE[mode]}>{mode === "hide" ? "Hidden" : "Deleted"}</Pill>}
                        {c.absent && <Pill>not on this sample</Pill>}
                      </div>
                      {also.length > 0 && (
                        <div className="row" style={{ gap: 5, fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}>
                          <Copy size={11} style={{ flexShrink: 0 }} />
                          {same ? `Also in ${[...new Set(also.filter((m) => m.rel === "same").map((m) => m.doc))].length} other document${same === 1 ? "" : "s"}` : "Similar columns elsewhere"}
                        </div>
                      )}
                    </div>
                    <ModePick value={mode} onChange={(m) => pick(c, m)} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ---------- unsaved changes: a pop-up with Save in it ---------- */}
      {dirty && !leave && (
        <div role="status" style={{
          position: "fixed", zIndex: 60, bottom: 16, left: mobile ? 16 : "50%", right: mobile ? 16 : "auto",
          transform: mobile ? "none" : "translateX(-50%)", maxWidth: mobile ? "none" : 640,
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "12px 14px",
          background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--amber)",
          borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,.28)",
        }}>
          <span className="row" style={{ gap: 8, flex: "1 1 220px", fontSize: 13 }}>
            <AlertTriangle size={16} style={{ color: "var(--amber-ink)", flexShrink: 0 }} />
            <span><b>Please save your changes.</b> {draft.size} column rule{draft.size === 1 ? "" : "s"} not saved yet — the documents still print as before.</span>
          </span>
          <Btn size="sm" variant="ghost" icon={RotateCcw} disabled={save.isPending} onClick={() => setDraft(fromSaved())}>Discard</Btn>
          <Btn size="sm" icon={Save} disabled={save.isPending} onClick={commit}>{save.isPending ? "Saving…" : "Save changes"}</Btn>
        </div>
      )}

      {/* ---------- leaving with changes unsaved ---------- */}
      {leave && (
        <Modal size="sm" title="Save unsaved changes?" icon={AlertTriangle} onClose={() => onLeave(false)}
          footer={<>
            <Btn variant="ghost" onClick={() => onLeave(false)}>Keep editing</Btn>
            <Btn variant="ghost" icon={RotateCcw} disabled={save.isPending}
              onClick={() => { setDraft(fromSaved()); onLeave(true); }}>Discard</Btn>
            <Btn icon={Save} disabled={save.isPending} onClick={() => commit(() => onLeave(true))}>
              {save.isPending ? "Saving…" : "Save"}
            </Btn>
          </>}>
          <div style={{ fontSize: 13 }}>
            The column changes you made here are not saved yet. Save them so every preview and download
            follows them, or discard them.
          </div>
        </Modal>
      )}

      {/* ---------- reset ---------- */}
      {resetting && (
        <Modal size="sm" title={resetting === "all" ? "Reset every document?" : `Reset document ${resetting}?`}
          icon={RotateCcw} onClose={() => setResetting(null)}
          footer={<>
            <Btn variant="ghost" onClick={() => setResetting(null)}>Cancel</Btn>
            <Btn icon={RotateCcw} onClick={() => resetDoc(resetting)}>Reset</Btn>
          </>}>
          <div style={{ fontSize: 13 }}>
            {resetting === "all"
              ? "Every document goes back to printing all its columns."
              : <>{DOC_META[resetting]} goes back to printing all its columns ({countOf(resetting)} hidden or deleted now).</>}
            {" "}Nothing changes on the papers until you save.
          </div>
        </Modal>
      )}

      {/* ---------- "also in other documents" ---------- */}
      {suggest && (
        <Modal title={`${suggest.mode === "show" ? "Show" : suggest.mode === "hide" ? "Hide" : "Delete"} “${suggest.col.label}” in other documents too?`}
          icon={Search} onClose={() => setSuggest(null)}
          footer={<>
            <Btn variant="ghost" onClick={() => setSuggest(null)}>Only document {open}</Btn>
            <Btn icon={suggest.mode === "delete" ? Trash2 : suggest.mode === "hide" ? EyeOff : Eye}
              disabled={!suggest.ticked.size} onClick={applySuggest}>
              {`${suggest.mode === "show" ? "Show" : suggest.mode === "hide" ? "Hide" : "Delete"} in ${suggest.ticked.size} more`}
            </Btn>
          </>}>
          <div className="stack-sm">
            <div style={{ fontSize: 13 }}>
              A column of this name is printed on these papers as well. The same name is ticked; a similar one
              is left for you to decide.
            </div>
            <div className="row" style={{ gap: 12, fontSize: 12 }}>
              <button type="button" className="link-btn" style={{ background: "none", border: "none", color: "var(--teal)", cursor: "pointer", padding: 0 }}
                onClick={() => setSuggest((s) => ({ ...s, ticked: new Set(s.matches.map((m) => id(m.doc, m.key))) }))}>Tick all</button>
              <button type="button" className="link-btn" style={{ background: "none", border: "none", color: "var(--teal)", cursor: "pointer", padding: 0 }}
                onClick={() => setSuggest((s) => ({ ...s, ticked: new Set() }))}>Untick all</button>
            </div>
            <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
              {suggest.matches.map((m, i) => {
                const k = id(m.doc, m.key);
                const on = suggest.ticked.has(k);
                const now = modeOf(m.doc, m.key);
                return (
                  <label key={k} className="row" style={{ gap: 10, padding: "8px 12px", cursor: "pointer", borderTop: i ? "1px solid var(--border)" : "none" }}>
                    <input type="checkbox" checked={on} onChange={() => setSuggest((s) => {
                      const t = new Set(s.ticked);
                      if (t.has(k)) t.delete(k); else t.add(k);
                      return { ...s, ticked: t };
                    })} />
                    <Mono>{m.doc}</Mono>
                    <span style={{ flex: 1, fontSize: 13 }}>
                      {DOC_META[m.doc]} — <b>{m.label}</b>
                    </span>
                    {now !== "show" && <Pill tone={MODE_TONE[now]}>{now === "hide" ? "Hidden" : "Deleted"} now</Pill>}
                    <Pill tone={m.rel === "same" ? "teal" : ""}>{m.rel === "same" ? "same name" : "similar"}</Pill>
                  </label>
                );
              })}
            </div>
          </div>
        </Modal>
      )}

      {/* ---------- preview ---------- */}
      {preview && (
        <Modal title={`${open} · ${DOC_META[open]} — with these columns`} icon={Eye} onClose={() => setPreview(false)}
          footer={<Btn variant="ghost" onClick={() => setPreview(false)}>Close</Btn>}>
          <div style={{ fontSize: 12, color: "var(--faint)", marginBottom: 8 }}>
            The changes as they stand{dirty ? " (not yet saved)" : ""}, on {sample(open)}.
          </div>
          <style>{PREVIEW_CSS}</style>
          <FitPaper html={safeHtml(previewHtml)} />
        </Modal>
      )}
    </div>
  );
}
