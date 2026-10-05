import { Sparkles, History, Check } from "lucide-react";
import { Modal, Btn, Pill } from "../ui/index.jsx";
import { RELEASES, versionLabel } from "../../lib/releases.js";
import { dmy } from "../../lib/format.js";

/* What changed — one line per change, in the office's words. */
const Notes = ({ notes }) => (
  <ul className="rn-list">
    {notes.map((n) => (
      <li key={n}><Check size={13} /><span>{n}</span></li>
    ))}
  </ul>
);

/* Shown once, the first time somebody signs in after an update — with the
   update before it underneath, so whoever missed that one's popup still
   reads what it brought. */
export function WhatsNewModal({ onClose }) {
  const [r, prev] = RELEASES;
  return (
    <Modal size="sm" className="rn-modal" title={`What's new in ${versionLabel(r.version)}`} icon={Sparkles} onClose={onClose}
      footer={<>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Released {dmy(r.date)}</span>
        <Btn size="sm" onClick={onClose}>Got it</Btn>
      </>}>
      <Notes notes={r.notes} />
      {prev && (
        <section className="rn-rel rn-prev">
          <div className="rn-head">
            <b>Previous update · {versionLabel(prev.version)}</b>
            <span className="grow" />
            <span className="rn-date">{dmy(prev.date)}</span>
          </div>
          <Notes notes={prev.notes} />
        </section>
      )}
    </Modal>
  );
}

/* Every release from this one onward, newest first — opened from the version
   in the footer while on Setup. */
export function ReleaseNotesModal({ onClose }) {
  return (
    <Modal size="sm" className="rn-modal" title="Release notes" icon={History} onClose={onClose}
      footer={<Btn size="sm" variant="ghost" onClick={onClose}>Close</Btn>}>
      <div className="stack-sm">
        {RELEASES.map((r, i) => (
          <section key={r.version} className="rn-rel">
            <div className="rn-head">
              <b>{versionLabel(r.version)}</b>
              {i === 0 && <Pill tone="teal">current</Pill>}
              <span className="grow" />
              <span className="rn-date">{dmy(r.date)}</span>
            </div>
            <Notes notes={r.notes} />
          </section>
        ))}
      </div>
    </Modal>
  );
}
