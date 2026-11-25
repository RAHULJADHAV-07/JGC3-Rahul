import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Btn } from "../ui/index.jsx";
import { APP_VERSION, versionLabel } from "../../lib/releases.js";
import { SNOOZE, runningBuild, watchForUpdate } from "../../lib/appUpdate.js";

/* "New update available" — shown to whoever has the app open when a newer one
   goes up, on every screen, the sign-in page included. Reloading keeps them on
   the page they are on; "Later" puts it away for half an hour. */
export default function UpdateNotice() {
  const [update, setUpdate] = useState(null);
  const [later, setLater] = useState(false);

  useEffect(() => watchForUpdate({ build: runningBuild(), onChange: setUpdate }), []);

  // A still newer build speaks up at once, whatever was put off before.
  useEffect(() => setLater(false), [update?.build]);
  useEffect(() => {
    if (!later) return undefined;
    const t = setTimeout(() => setLater(false), SNOOZE);
    return () => clearTimeout(t);
  }, [later]);

  if (!update || later) return null;
  const named = update.version && update.version !== APP_VERSION;
  return (
    <div className="update-notice" role="status">
      <RefreshCw size={18} strokeWidth={2.3} className="un-i" />
      <div className="un-text">
        <b>New update available{named ? ` — ${versionLabel(update.version)}` : ""}</b>
        <span>Reload to load it. Save anything you are typing first.</span>
      </div>
      <div className="un-btns">
        <Btn size="sm" variant="ghost" onClick={() => setLater(true)}>Later</Btn>
        <Btn size="sm" icon={RefreshCw} onClick={() => window.location.reload()}>Reload</Btn>
      </div>
    </div>
  );
}
