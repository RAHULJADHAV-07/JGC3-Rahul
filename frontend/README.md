# Jaikvin Global — Frontend (React + Vite)

Production UI for the export system. Talks to the FastAPI backend over REST
(`/api/*`) using React Query — **no dummy/seed data**. Every list, form and
report reflects real records created through the app.

## Structure

```
src/
  api/          client.js (fetch wrapper) · endpoints.js (REST map) · hooks.js (React Query)
  components/
    ui/         shared atoms (Button, Card, Modal, DataTable, Field, …)
    layout/     AppShell (top nav, page chrome)
  features/
    dashboard/  balance matrix + invoice status
    orders/     purchase orders (list, create, item-detail)
    packing/    record packing → invoices
    shipments/  shipment step editor (vehicle → container → BL) + status
    reports/    balance register
    setup/      masters CRUD (items, buyers, suppliers, transports)
    documents/  document catalogue (generation = next phase)
  lib/          format.js (₹/$/date) · constants.js
  providers/    QueryProvider
```

## Run locally

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173  (proxies /api → http://localhost:8000)
```

Set `VITE_API_PROXY` if the backend runs elsewhere in dev. Both it and
`VITE_API_URL` are development-only — a production build has no API address in
it at all and always calls same-origin `/api`.

## Deploying

Backend on Render, frontend on Vercel, and `/api/*` bridged by the edge
function in `api/[...path].js` so the browser only ever talks to one origin —
which is what the httpOnly session cookie and the `connect-src 'self'` CSP both
require. The backend's address lives in one Vercel variable, `API_ORIGIN`, and
nowhere in this repository.

**See [DEPLOY.md](DEPLOY.md)** for the settings on each host and for what each
failure mode looks like.

## Docker

Built as static assets served by nginx, which proxies `/api` to the backend.
Use the root `docker-compose.yml` to run the whole stack.
