import { FileText, ExternalLink, Inbox } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Pill } from "../../components/ui/index.jsx";
import { DOC_META } from "../../lib/docs.js";
import { MODE_CHECKLIST, modeLabel } from "../../lib/modes.js";

/* The papers a shipment of this mode needs — the ones the app generates (each
   opens in Documents, on this invoice) and the ones that arrive from outside.
   The air set is Docs/JG_Air_Docs. */
export default function ModeDocs({ mode, invId, onOpen }) {
  const nav = useNavigate();
  const list = MODE_CHECKLIST[mode] || MODE_CHECKLIST.water;
  const open = (no) => {
    onOpen?.();
    nav(`/documents?doc=${encodeURIComponent(no)}${invId ? `&inv=${encodeURIComponent(invId)}` : ""}`);
  };
  return (
    <div className="wiz-card mode-docs">
      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        <FileText size={14} style={{ color: "var(--teal)" }} />
        <span style={{ fontWeight: 650, color: "var(--ink)", fontSize: 13 }}>Documents for this {modeLabel(mode)} shipment</span>
        <Pill>{list.generated.length + list.external.length}</Pill>
      </div>
      <div className="mode-docs-grid">
        {list.generated.filter((no) => DOC_META[no]).map((no) => (
          <button key={no} type="button" className="mode-doc" onClick={() => open(no)} title={`Open document ${no} in Documents`}>
            <span className="doc-no">{no}</span>
            <span className="grow">{DOC_META[no]}</span>
            <ExternalLink size={12} />
          </button>
        ))}
      </div>
      <div className="stack-sm" style={{ marginTop: 10 }}>
        {list.external.map(([name, why]) => (
          <div key={name} className="row" style={{ gap: 8, fontSize: 12.5, alignItems: "flex-start" }}>
            <Inbox size={13} style={{ color: "var(--faint)", marginTop: 2, flexShrink: 0 }} />
            <span><b style={{ color: "var(--ink)" }}>{name}</b> <span style={{ color: "var(--muted)" }}>— {why}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}
