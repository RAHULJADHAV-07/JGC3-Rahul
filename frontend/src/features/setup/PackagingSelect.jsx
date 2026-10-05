import { useState } from "react";
import { Plus, Check, X } from "lucide-react";
import { Select, Input } from "../../components/ui/index.jsx";
import { useOptions, useOptionMutations } from "../../api/hooks.js";

/* "Type of packaging" on an item: the list kept under Setup → Additional
   settings, with a "+" beside it so a new type can be added from the item
   form itself — it joins that list for every other item too. */
export default function PackagingSelect({ value, onChange, className = "" }) {
  const types = useOptions().data?.packaging_types || ["Cartons"];
  const { saveList } = useOptionMutations();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const current = value || "Cartons";
  // An item saved with a type since removed from the list still shows it.
  const list = types.some((t) => t === current) ? types : [...types, current];

  const add = () => {
    const t = text.trim().replace(/\s+/g, " ");
    if (!t) return;
    const known = types.find((x) => x.toLowerCase() === t.toLowerCase());
    if (known) { onChange(known); setAdding(false); setText(""); return; }
    saveList.mutate({ key: "packaging_types", values: [...types, t] }, {
      onSuccess: () => { onChange(t); setAdding(false); setText(""); setErr(""); },
      onError: (e) => setErr(e.message),
    });
  };

  if (adding) {
    return (
      <span className="sel-plus">
        <Input className={className} value={text} autoFocus placeholder="New packaging type, e.g. Bundles"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } if (e.key === "Escape") setAdding(false); }} />
        <button type="button" className="icon-btn" title="Add this type" disabled={saveList.isPending} onClick={add}><Check size={15} /></button>
        <button type="button" className="icon-btn" title="Cancel" onClick={() => { setAdding(false); setErr(""); }}><X size={15} /></button>
        {err && <span style={{ fontSize: 11, color: "var(--red)" }}>{err}</span>}
      </span>
    );
  }
  return (
    <span className="sel-plus">
      <Select className={className} value={current} onChange={(e) => onChange(e.target.value)} aria-label="Type of packaging">
        {list.map((t) => <option key={t} value={t}>{t}</option>)}
      </Select>
      <button type="button" className="icon-btn" title="Add a packaging type" onClick={() => setAdding(true)}><Plus size={15} /></button>
    </span>
  );
}
