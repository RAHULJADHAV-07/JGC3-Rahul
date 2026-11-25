/* Is there a newer build on the server than the one running in this tab?

   The app is one page that stays open all day, so a tab opened yesterday goes
   on running yesterday's code until somebody reloads it. Every build is
   stamped (vite.config.js): the page it serves carries the stamp in a
   <meta name="app-build">, and /version.json beside it always names the latest
   one. A tab whose stamp no longer matches is out of date, and says so
   (components/layout/UpdateNotice.jsx).

   Nothing is ever reloaded by itself — half-typed packing would go with it.
   A check that fails says nothing: offline, a deploy half-way through, or a
   host that answers the page for a file it does not have. */

export const VERSION_URL = "/version.json";
export const CHECK_EVERY = 5 * 60_000;   // while the tab is open
export const CHECK_GAP = 60_000;         // at most this often, however much the tab is switched to
export const SNOOZE = 30 * 60_000;       // "Later"

/* The build this tab is running — "" in development, where there is none. */
export const runningBuild = (doc = document) => doc.querySelector('meta[name="app-build"]')?.getAttribute("content") || "";

/* What the server has now, or null when it cannot be told. */
export async function latestBuild(fetchFn = fetch) {
  try {
    const res = await fetchFn(VERSION_URL, {
      cache: "no-store",
      ...(typeof AbortSignal !== "undefined" && AbortSignal.timeout ? { signal: AbortSignal.timeout(15_000) } : {}),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j && typeof j.build === "string" && j.build ? { build: j.build, version: String(j.version || "") } : null;
  } catch (e) {
    return null;
  }
}

/* Watches until stopped. `onChange` gets the newer build, or null once the
   server is back on the one running here (a deploy taken back). */
export function watchForUpdate({
  build, onChange, fetchFn, win = window, doc = document, now = () => Date.now(), every = CHECK_EVERY, gap = CHECK_GAP,
}) {
  if (!build) return () => {};
  let stopped = false, busy = false, last = -Infinity;
  const check = async () => {
    if (stopped || busy || doc.visibilityState === "hidden" || now() - last < gap) return;
    busy = true;
    last = now();
    const latest = await latestBuild(fetchFn);
    busy = false;
    if (!stopped && latest) onChange(latest.build === build ? null : latest);
  };
  const timer = win.setInterval(check, every);
  doc.addEventListener("visibilitychange", check);
  win.addEventListener("focus", check);
  win.addEventListener("online", check);
  check();
  return () => {
    stopped = true;
    win.clearInterval(timer);
    doc.removeEventListener("visibilitychange", check);
    win.removeEventListener("focus", check);
    win.removeEventListener("online", check);
  };
}
