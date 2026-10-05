/* Thin fetch wrapper. Every call goes to /api on the origin the page was
   served from — never to the backend's own host.

   That is not a preference, it is the only arrangement that works here:

     * the session is an httpOnly cookie, invisible to page JavaScript, which
       is what stops one injected line from walking off with an admin session.
       The browser attaches it only to a same-site request, so a fetch aimed at
       onrender.com arrives with no session at all;
     * the CSP in vercel.json says connect-src 'self'. A fetch to any other
       host is refused by the browser before it is sent, and a refused fetch
       raises TypeError — which reaches the screen as "Failed to fetch".

   In production /api is answered by api/[...path].js, the Vercel function that
   forwards to whatever API_ORIGIN says; in development by the Vite proxy in
   vite.config.js. Either way the browser only ever talks to one origin.

   VITE_API_URL is honoured in development only — pointing it at a remote API
   is occasionally useful while working, and in a deployed build it can only
   break the two rules above. A stale value left in a hosting dashboard is
   exactly how this app once went dark, so a build ignores it rather than
   trusting it.

   A 401 means the session expired or was revoked server-side, so subscribers
   are notified rather than the page reloaded, and nothing in flight is lost.
   A 403 carrying X-Password-Change-Required means the account is holding a
   password an admin set and must replace it before anything else opens. */
const BASE = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL || "").replace(/\/$/, "")
  : "";

const listeners = new Set();
const passwordChangeListeners = new Set();

export const onUnauthorized = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const onPasswordChangeRequired = (fn) => {
  passwordChangeListeners.add(fn);
  return () => passwordChangeListeners.delete(fn);
};

export class ApiError extends Error {
  constructor(message, status, retryAfter) {
    super(message);
    this.status = status;
    /* Seconds until a rate limit or a timed lockout lifts, straight off the
       response, so the UI can count down instead of showing a dead end. */
    this.retryAfter = retryAfter || null;
  }
}

async function request(method, path, body, extraHeaders) {
  const headers = { ...(extraHeaders || {}) };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  /* Marks the call as programmatic. A cross-site form post cannot set it, so
     it is one more thing an attacker cannot forge. */
  headers["X-Requested-With"] = "XMLHttpRequest";

  const res = await fetch(BASE + path, {
    method,
    headers,
    credentials: "include",   // send and accept the session cookie
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch (e) { /* non-JSON error */ }

    if (res.status === 401) {
      listeners.forEach((fn) => fn());
    }
    if (res.status === 403 && res.headers.get("X-Password-Change-Required")) {
      passwordChangeListeners.forEach((fn) => fn());
    }

    const retry = Number(res.headers.get("Retry-After")) || null;
    throw new ApiError(typeof detail === "string" ? detail : JSON.stringify(detail), res.status, retry);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const apiGet = (path, headers) => request("GET", path, undefined, headers);
export const apiPost = (path, body, headers) => request("POST", path, body ?? {}, headers);
export const apiPut = (path, body, headers) => request("PUT", path, body ?? {}, headers);
export const apiDelete = (path) => request("DELETE", path);

/* `headers` carries the step-up grant (`X-Step-Up`) on the call that sets a
   password — see app/deps.py:require_stepup. The grant is short-lived and held
   in memory only, never written to storage. */
export const stepUpHeader = (grant) => (grant ? { "X-Step-Up": grant } : undefined);
