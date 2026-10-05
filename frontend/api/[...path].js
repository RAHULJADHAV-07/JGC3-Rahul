/* Same-origin bridge: the browser calls /api/* on the Vercel domain, this
   forwards it to the Render service, and the answer comes back as if Vercel
   had produced it.

   WHY A FUNCTION AND NOT A REWRITE IN vercel.json
   A rewrite destination is a literal string — it cannot read an environment
   variable, so the backend's address ends up committed. When the API moved to
   a different Render account the committed address was still the old one, the
   whole app answered "Failed to fetch", and fixing it needed a commit and a
   redeploy. Here the address is API_ORIGIN, set in Vercel → Settings →
   Environment Variables. Moving the backend again is one field and a redeploy,
   and nothing about either host is written down in the repository.

   WHY NOT JUST POINT THE BROWSER AT RENDER
   Two things in this app only work while the API looks same-origin:
     * the session is an httpOnly cookie with SameSite=lax, which the browser
       will not attach to a request going to a different site;
     * the CSP in vercel.json says connect-src 'self', so a fetch() to
       onrender.com is blocked before it is ever sent — and a blocked fetch
       surfaces as exactly that "Failed to fetch".
   Setting VITE_API_URL to the Render address therefore cannot work, whatever
   the backend's CORS says. src/api/client.js ignores it in production builds
   for that reason.

   The client's own headers ride along unchanged, which matters for two of
   them: Origin, which the backend's origin guard checks on every write, and
   X-Forwarded-For, which its rate limiter reads to tell one caller from
   another. */

export const config = { runtime: "edge" };

/* Headers that describe one hop and must not be copied onto the next one.
   content-encoding and content-length are in here because fetch has already
   decoded the body by the time we see it — forwarding the original values
   would describe a body that no longer exists. */
const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "transfer-encoding", "upgrade", "te", "trailer",
  "proxy-authenticate", "proxy-authorization", "content-encoding", "content-length",
]);

const problem = (status, detail) =>
  new Response(JSON.stringify({ detail }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

function resolveOrigin() {
  /* VITE_API_URL is retained as a migration fallback. Earlier deployment
     instructions told the owner to create that variable, so accepting it here
     lets an existing Vercel setting recover without exposing the address to
     browser code: src/api/client.js still ignores it in production. New
     deployments should use the server-only API_ORIGIN name. */
  const raw = (
    process.env.API_ORIGIN
    || process.env.BACKEND_URL
    || process.env.VITE_API_URL
    || ""
  ).trim();
  if (!raw) return { error: "No backend URL is configured for this Vercel deployment. Add API_ORIGIN (or the existing VITE_API_URL) in Vercel → Settings → Environment Variables as the Render base URL, with no trailing slash or /api, then redeploy." };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { error: `API_ORIGIN is not a valid URL: ${raw}` };
  }
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    return { error: "API_ORIGIN must be an https:// URL." };
  }
  // Only the scheme and host are ours to use; a path, query or fragment on the
  // variable is a typo that would otherwise corrupt every forwarded URL.
  return { origin: url.origin };
}

export default async function handler(request) {
  const { origin, error } = resolveOrigin();
  if (error) return problem(503, error);

  const incoming = new URL(request.url);
  // request.url already carries the /api prefix, and every backend route is
  // mounted under /api, so the path passes through untouched.
  const target = origin + incoming.pathname + incoming.search;

  const headers = new Headers(request.headers);
  for (const name of HOP_BY_HOP) headers.delete(name);
  // Host must describe the host being called, not the one that was called.
  headers.delete("host");

  const hasBody = !["GET", "HEAD"].includes(request.method);

  let upstream;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      // A redirect is the backend's answer to give, not ours to follow.
      redirect: "manual",
    });
  } catch (e) {
    /* Render's free instance stops after 15 quiet minutes and takes about a
       minute to come back; a request that arrives in that window is what times
       out here. Saying so beats a bare 502, because the fix is "try again in a
       minute" and not "something is broken". */
    return problem(502, `The API did not answer (${origin}). If it is a free Render instance it may be waking up — try again in a minute. (${e?.message || e})`);
  }

  const out = new Headers();
  for (const [key, value] of upstream.headers) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) out.set(key, value);
  }
  /* Set-Cookie is the one header that legitimately repeats, and the loop above
     would collapse the copies into one. The session cookie is set alongside a
     CSRF-ish companion on sign-in, so losing one of them loses the login. */
  const cookies = upstream.headers.getSetCookie?.() ?? [];
  if (cookies.length) {
    out.delete("set-cookie");
    for (const cookie of cookies) out.append("set-cookie", cookie);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}
