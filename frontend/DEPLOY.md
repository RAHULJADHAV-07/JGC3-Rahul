# Deploying — Render (backend) + Vercel (frontend)

Two hosts, and each one holds its own settings. Nothing about either address is
written down in this repository, and nothing has to be configured in GitHub.

```
browser ──► https://<your-app>.vercel.app            (Vercel: static build)
              │  /api/*
              ▼
            api/[...path].js                          (Vercel: edge function)
              │  forwards to API_ORIGIN
              ▼
            https://<your-service>.onrender.com/api/* (Render: FastAPI)
```

## Why the browser never calls Render directly

Two things in this app break the moment the API is on a different origin, and
both fail as the same unhelpful message — **"Failed to fetch"**:

* **The session cookie.** It is `httpOnly` (page JavaScript cannot read it, so
  an injected script cannot steal it) and `SameSite=lax` (the browser will not
  attach it to a cross-site request). Aimed at `onrender.com`, every call
  arrives signed out.
* **The Content-Security-Policy.** `vercel.json` sends `connect-src 'self'`.
  A `fetch()` to any other host is refused by the browser *before it is sent*,
  and a refused fetch raises `TypeError: Failed to fetch`.

So setting `VITE_API_URL` to the Render URL cannot work, no matter what the
backend's CORS says. A build ignores that variable for exactly this reason —
see the note at the top of `src/api/client.js`.

The edge function is what makes the API same-origin: the browser talks to
Vercel, and Vercel talks to Render server-to-server, where none of the above
applies.

## Vercel — the frontend

**Project settings**

| Setting | Value |
| --- | --- |
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Build Command | `npm run build` (from `vercel.json`) |
| Output Directory | `dist` (from `vercel.json`) |

**Environment Variables** (Settings → Environment Variables), for Production,
Preview and Development alike:

| Name | Value |
| --- | --- |
| `API_ORIGIN` | `https://<your-service>.onrender.com` — scheme and host only, **no trailing slash, no `/api`** |

That is the only variable Vercel needs.

If `VITE_API_URL` is already set from the older setup, the proxy accepts it as
a temporary migration fallback; it is still ignored by the browser build.
Replace it with the server-only `API_ORIGIN` setting, then remove it so there
is one unambiguous backend address.

Moving the backend again — a new Render account, a renamed service — is this
one field plus a redeploy. No commit.

## Render — the backend

Environment (Render → your service → Environment). The two that decide whether
the frontend can reach it:

| Name | Value |
| --- | --- |
| `CORS_ORIGINS` | `https://<your-app>.vercel.app` — every Vercel domain that should be allowed, comma-separated, no trailing slash |
| `ENVIRONMENT` | `production` |

`CORS_ORIGINS` is doing two jobs, which is why a missing entry bites twice: the
CORS middleware reads it, and so does the origin guard in `app/main.py`, which
refuses any `POST`/`PUT`/`DELETE` carrying an unknown `Origin` with **403 "This
request did not come from a known origin"**. Reads keep working while writes
fail — a distinctive symptom worth recognising.

Include every hostname the app is actually opened at:

```
CORS_ORIGINS=https://jaikvin.vercel.app,https://www.jaikvin.com
```

Vercel preview deployments get a fresh hostname per commit, so previews will
not be able to write unless that exact hostname is listed too.

The rest — `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECURE=true`, the mail
settings — is documented in `backend/.env.example`. Set them in Render's
Environment tab; do not commit a `.env`.

### Free instance hours

Render's free plan gives a workspace **750 instance-hours a month** and stops a
container after 15 quiet minutes. Keeping it permanently awake spends about
**744** of those 750 — the entire allowance, on one service, whether or not
anyone is using it. That is how a free tier runs out without much real traffic.

`KEEPALIVE_ENABLED` is therefore **off** unless you set it, and there is no
longer a scheduled GitHub Action pinging the service either. The cost of
letting it sleep is that the first visitor after a quiet spell waits about a
minute for the cold start; the edge function reports that case as *"the API may
be waking up — try again in a minute"* rather than as a failure.

Turn `KEEPALIVE_ENABLED=true` on Render only if that cold start is worse for
you than the hours it spends.

## Checking a deployment

```bash
# 1. Render itself is up (no Vercel involved)
curl -i https://<your-service>.onrender.com/health

# 2. Vercel is forwarding to it — same answer, through the app's own domain
curl -i https://<your-app>.vercel.app/api/auth/status
```

If (1) answers and (2) does not, the problem is `API_ORIGIN` on Vercel — the
function says which in its response body.

## Troubleshooting

| What you see | What it is |
| --- | --- |
| `Failed to fetch` on every call | The browser is being pointed off-origin. Check `VITE_API_URL` is unset on Vercel, and that `/api/*` reaches the function (curl step 2 above). |
| `503 API_ORIGIN is not set…` | The Vercel variable is missing, or was added without redeploying. |
| `502 The API did not answer` | `API_ORIGIN` points somewhere that is not answering — a renamed service, a deleted one, or a free instance mid-cold-start. |
| `403 This request did not come from a known origin` on saves only | The Vercel domain is missing from `CORS_ORIGINS` on Render. |
| Signed out again on every page load | The session cookie is not coming back. In production `COOKIE_SECURE=true` and `COOKIE_SAMESITE=lax`, and the API must be reached through `/api` on the app's own domain. |

## Docker (self-hosting, unchanged)

`docker-compose.yml` at the repository root runs both. nginx serves the build
and proxies `/api` to the backend container, which is the same same-origin
arrangement by different means — no `API_ORIGIN`, no edge function.
