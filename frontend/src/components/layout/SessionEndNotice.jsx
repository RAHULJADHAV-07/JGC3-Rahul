import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { Btn } from "../ui/index.jsx";
import { useAuth } from "../../auth/AuthProvider.jsx";

/* Heads-up before the session closes (midnight by default — app/config.py
   SESSION_END_MODE), so nobody loses a half-typed form to 00:00. Shows in the
   last WARN_MS, top centre (the update notice owns bottom left, toasts bottom
   right); "OK" puts it away for this session. */
const WARN_MS = 10 * 60 * 1000;

export default function SessionEndNotice() {
  const { user, isAdmin, sessionEnds, sessionEndsAt, otpDailyFor } = useAuth();
  const codeNext = otpDailyFor === "all" || (otpDailyFor === "admin" && isAdmin);
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState(null);

  const end = sessionEndsAt ? new Date(sessionEndsAt).getTime() : NaN;
  const left = end - now;
  const soon = Boolean(user) && Number.isFinite(end) && left > 0 && left <= WARN_MS;

  // Tick every 20 s once inside the window; one timer to reach it before that.
  useEffect(() => {
    if (!user || !Number.isFinite(end)) return undefined;
    const untilWarn = end - WARN_MS - Date.now();
    const t = untilWarn > 0
      ? setTimeout(() => setNow(Date.now()), Math.min(2 ** 31 - 1, untilWarn + 500))
      : setInterval(() => setNow(Date.now()), 20000);
    return () => { clearTimeout(t); clearInterval(t); };
  }, [user, end, soon]);

  if (!soon || dismissed === sessionEndsAt) return null;
  const mins = Math.max(1, Math.ceil(left / 60000));
  const endsAt = new Date(end);
  const at = sessionEnds === "midnight" && endsAt.getHours() === 0 && endsAt.getMinutes() === 0
    ? "12:00 midnight"
    : endsAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="update-notice session-notice" role="status">
      <Timer size={18} strokeWidth={2.3} className="un-i" />
      <div className="un-text">
        <b>Session ends at {at} — {mins} min left</b>
        <span>
          Save what you are working on. After that, sign in again
          {codeNext ? " with the code emailed to you." : "."}
        </span>
      </div>
      <div className="un-btns">
        <Btn size="sm" variant="ghost" onClick={() => setDismissed(sessionEndsAt)}>OK</Btn>
      </div>
    </div>
  );
}
