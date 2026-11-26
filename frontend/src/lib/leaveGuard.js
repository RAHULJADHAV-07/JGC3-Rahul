/* Work not yet saved.

   A screen holding changes it has not saved — the price list, today —
   registers a guard here, and every way of leaving that screen asks it first:

     · the menu bar and the other in-app moves (`guardedLeave`),
     · the browser's back and forward buttons (the hash router hears those as
       `popstate`; the address is put back and the guard asked before the
       router ever sees the move),
     · closing or reloading the tab (the browser's own "Leave site?" prompt —
       the one thing a page cannot word for itself).

   `guard.ask(proceed)` shows the screen's own question and calls `proceed`
   once the work is saved or let go. One guard at a time: the screen on show. */

let current = null;
let armed = null;          // where the guarded screen sits: { href, state }
let navigate = null;       // the router's navigate, for a move held at popstate

export function setLeaveGuard(guard) {
  current = guard;
  armed = guard && typeof window !== "undefined" ? { href: window.location.href, state: window.history.state } : null;
}

export function clearLeaveGuard(guard) {
  if (current === guard) {
    current = null;
    armed = null;
  }
}

export const hasLeaveGuard = () => !!current;

/** Run `proceed` now, or once the screen holding unsaved work agrees. */
export function guardedLeave(proceed) {
  if (!current) return proceed();
  return current.ask(proceed);
}

/** The app shell hands over the router's navigate once, on mount. */
export function setNavigator(fn) {
  navigate = fn;
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (!current) return;
    e.preventDefault();
    e.returnValue = "";
  });

  /* Captured on the window, so this runs before the router's own listener
     (capture listeners at the target go first) and can keep it from hearing
     the move at all. */
  window.addEventListener("popstate", (e) => {
    if (!current || !armed) return;
    const target = window.location.hash.replace(/^#/, "") || "/";
    e.stopImmediatePropagation();
    window.history.pushState(armed.state, "", armed.href);
    current.ask(() => {
      current = null;
      armed = null;
      if (navigate) navigate(target);
      else window.location.hash = target;
    });
  }, true);
}
