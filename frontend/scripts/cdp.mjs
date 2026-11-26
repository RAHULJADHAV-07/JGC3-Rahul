/* A small Chrome DevTools driver for the checks: launch headless Chrome, open a
   page, run an async expression to completion and hand back its value.

   `--dump-dom` with a virtual-time budget (what the other checks use) stops
   the clock as soon as nothing is loading, and a PDF drawn page by page
   through images is still working then — so these checks wait for the real
   answer instead. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export async function withChrome(fn, { width = 1400, height = 1000 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jg-cdp-"));
  const proc = spawn("google-chrome", ["--headless=new", "--disable-gpu", "--no-sandbox", "--remote-debugging-port=0",
    `--user-data-dir=${dir}`, `--window-size=${width},${height}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = "";
    const t = setTimeout(() => rej(new Error("Chrome did not start")), 20000);
    proc.stderr.on("data", (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(t); res(m[1]); }
    });
  });
  const port = new URL(wsUrl).port;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const waiting = new Map();
  const listeners = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && waiting.has(msg.id)) { const { res, rej } = waiting.get(msg.id); waiting.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
    else listeners.forEach((l) => l(msg));
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; waiting.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method, params })); });
  const api = {
    send,
    on: (l) => listeners.push(l),
    async open(url) {
      await send("Page.enable");
      const loaded = new Promise((r) => listeners.push((m) => { if (m.method === "Page.loadEventFired") r(); }));
      await send("Page.navigate", { url });
      await loaded;
    },
    async eval(expression, timeout = 300000) {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, timeout });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
  };
  try {
    return await fn(api);
  } finally {
    try { ws.close(); } catch (e) { /* gone */ }
    proc.kill("SIGKILL");
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
