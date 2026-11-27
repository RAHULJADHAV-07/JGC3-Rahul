import { useState } from "react";
import { Plus, Check, X } from "lucide-react";
import { Select, Input } from "../../components/ui/index.jsx";
import { useOptions, useSaveList } from "../../api/hooks.js";

/* A dropdown over one of the lists kept under Setup → Additional settings,
   with a "+" beside it so a new entry can be added from the item form itself —
   it joins that list for every other item too. A value saved before it was
   taken off the list still shows, so opening the form never changes it.

   `listKey` "packaging_types" (Type of packaging, never blank, Cartons by
   default) or "groups" (Group, may be left blank). */
export function ListSelect({ listKey, value, onChange, className = "", fallback, allowEmpty, label, placeholder }) {
  const values = useOptions().data?.[listKey] || (fallback ? [fallback] : []);
  const saveList = useSaveList();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const current = value || (allowEmpty ? "" : fallback || "");
  const list = !current || values.some((t) => t === current) ? values : [...values, current];

  const add = () => {
    const t = text.trim().replace(/\s+/g, " ");
    if (!t) return;
    const known = values.find((x) => x.toLowerCase() === t.toLowerCase());
    if (known) { onChange(known); setAdding(false); setText(""); return; }
    saveList.mutate({ key: listKey, values: [...values, t] }, {
      onSuccess: () => { onChange(t); setAdding(false); setText(""); setErr(""); },
      onError: (e) => setErr(e.message),
    });
  };

  if (adding) {
    return (
      <span className="sel-plus">
        <Input className={className} value={text} autoFocus placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } if (e.key === "Escape") setAdding(false); }} />
        <button type="button" className="icon-btn" title="Add to the list" disabled={saveList.isPending} onClick={add}><Check size={15} /></button>
        <button type="button" className="icon-btn" title="Cancel" onClick={() => { setAdding(false); setErr(""); }}><X size={15} /></button>
        {err && <span style={{ fontSize: 11, color: "var(--red)" }}>{err}</span>}
      </span>
    );
  }
  return (
    <span className="sel-plus">
      <Select className={className} value={current} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {allowEmpty && <option value="">— none —</option>}
        {list.map((t) => <option key={t} value={t}>{t}</option>)}
      </Select>
      <button type="button" className="icon-btn" title={`Add a new one to ${label}`} onClick={() => setAdding(true)}><Plus size={15} /></button>
    </span>
  );
}

/* "Type of packaging" on an item. */
export default function PackagingSelect(props) {
  return <ListSelect listKey="packaging_types" fallback="Cartons" label="Type of packaging"
    placeholder="New packaging type, e.g. Bundles" {...props} />;
}

/* "Group" on an item — Setup → Additional settings → Groups (V-7.10.2). */
export function GroupSelect(props) {
  return <ListSelect listKey="groups" allowEmpty label="Group" placeholder='New group, e.g. 63 MM (2")' {...props} />;
}
