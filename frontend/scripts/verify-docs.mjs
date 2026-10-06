/* Demo task — verify the export documents end to end, without a database.

     npm run verify:docs

   Builds a small demo shipment that touches every rule the papers have to get
   right, renders the documents from it with the app's own document engine, and
   checks each rule. Then, if Chrome / Chromium is installed, it opens every
   preview and every PDF in a headless browser and checks the layout: no text
   cut off in a cell, no paper wider than its content, no sheet spilling a few
   lines onto a page of its own.

   Everything it renders is written to verify-output/ — open
   verify-output/index.html to look through the previews and the PDFs
   yourself. Exit code 0 when every check passes, 1 otherwise.

   The demo shipment (invoice DEMO/2, after an earlier DEMO/1):
     · Oswin (Daman)        — pipes sized in mm and in inches ('1/2"', '1-1/4"'),
                              an 1800 mm pipe packed in BUNDLES, an M/F pipe
     · Hansa (Maharashtra)  — a PP moulded riser that has a length in the master,
                              a nylon (PA) tee, corrugated boxes in BUNDLES
     · four purchase orders; DEMO/1 already cleared part of the oldest, so DEMO/2's
       PP1509 boxes clear the rest of PO-A and part of PO-B — and never PO-D. */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "verify-output");
const { createServer } = await import(path.join(ROOT, "node_modules/vite/dist/node/index.js"));

process.on("unhandledRejection", () => {});   // the logo fetch has no server to talk to
const server = await createServer({
  root: ROOT, server: { middlewareMode: true }, appType: "custom", logLevel: "error",
  optimizeDeps: { noDiscovery: true, entries: [] },   // no browser bundle needed here
});
const { docCtx } = await server.ssrLoadModule("/src/lib/docCtx.js");
const docs = await server.ssrLoadModule("/src/lib/docs.js");
const C = await server.ssrLoadModule("/src/lib/docs/common.js");

/* ---- the demo shipment ---------------------------------------------------- */
const item = (id, o) => ({
  id, oswin: "", gl: "", pack_unit: "", barcode: `93196960${id.length}${Math.abs(id.split("").reduce((n, c) => n * 31 + c.charCodeAt(0), 7)) % 100000}`,
  hsn: "39172200", volume: 0.06, net_per_box: 10, gross_per_box: 11, bg_per_box: 0, p_per_box: 0, type_up: 0,
  sticker_mult: 1.1, sticker_round: false, sticker_rule: "pp", stickers_fixed: 0, label_spoilage: 1, uom: "PCS",
  value_mode: "piece", fob_mode: "piece", source_sheet: "", packaging_type: "Cartons", ...o,
});
const OSW = "sup-oswin", HAN = "sup-hansa";
const D = {
  suppliers: [
    { id: OSW, code: "Oswin", name: "Oswin Plastics Pvt Ltd", state: "Daman and Dadra & Nagar Haveli", gstin: "26AAACO0802H1ZY", addr: "Plot 12, Kachigam, Daman", place: "Daman", pin: "396210", gst_pct: null },
    { id: HAN, code: "Hansa", name: "Hansa Polymers", state: "Maharashtra", gstin: "27AAKFH3234K1Z8", addr: "Gala 4, Vashere, Bhiwandi", place: "Bhiwandi", pin: "421302", gst_pct: null },
  ],
  buyers: [{ id: "b1", name: "Corecomp Pty Ltd", brand: "G D Watermark", country: "Australia", curr: "USD", ship_to: "FREMANTLE", addr: "13, Tesla Link, Wangara WA 6065", order_no: "" }],
  items: [
    item("i-pp1509", { code: "PP1509", gd: "PP1509", size: "15", length: "225", packing: 400, group: '15 MM (1/2")', description: "PP 1509 P/RISER M X M\n225 X 15MM", unit_value: 9.5, unit_fob100: 0.14, supplier_id: OSW }),
    item("i-90441600", { code: "90441600", gd: "90441600", size: '1/2"', length: "600", packing: 100, group: '15 MM (1/2")', description: "90441600 P/RISER\n1/2\" X 600MM", unit_value: 21.06, unit_fob100: 0.31, supplier_id: OSW }),
    item("i-90446400", { code: "90446400", gd: "90446400", size: '1-1/4"', length: "450", packing: 100, group: '32 MM (1.1/4")', description: "90446400 P/RISER\n1-1/4\" X 450MM", unit_value: 42.48, unit_fob100: 0.63, supplier_id: OSW }),
    item("i-90448820", { code: "90448820", gd: "90448820", size: '2"', length: "1800", packing: 20, group: '50 MM (2")', description: "90448820 P/RISER\n2\" X 1800MM", unit_value: 298.8, unit_fob100: 4.17, supplier_id: OSW, packaging_type: "Bundles" }),
    item("i-pmf2524", { code: "PMF2524", gd: "PMF2524", size: "25", length: "600", packing: 50, group: "PP PIPES M/F THREADED", description: "PMF 2524 M/F RISER\n600 X 25MM", unit_value: 42.93, unit_fob100: 0.63, supplier_id: OSW }),
    item("i-pet1512", { code: "PET1512", gd: "PET1512", size: "15", length: "300", packing: 300, group: "PP Moulded", hsn: "39174000", description: "PET 1512 Full Thread Riser\n300 X 15MM", unit_value: 9.36, unit_fob100: 14.4, fob_mode: "100", supplier_id: HAN }),
    item("i-grt15", { code: "GRT15", gd: "GRT15", size: "15", length: "", packing: 540, group: "GRN Range", sticker_rule: "grn", hsn: "39174000", description: "15MM TEE", unit_value: 3.1, unit_fob100: 4.5, fob_mode: "100", supplier_id: HAN }),
    item("i-gd3", { code: "GD3", gd: "GD3", size: "570 X 368 X 178", length: "", packing: 15, group: "CORRUGATED BOXES", hsn: "48191010", description: "CORRUGATED BOX GD3", unit_value: 38, unit_fob100: 0.55, net_per_box: 8.2, gross_per_box: 8.3, supplier_id: HAN, packaging_type: "Bundles" }),
  ],
  transports: [],
};
const PO = (po, date, rows) => rows.map(([itemId, qty], i) => ({ id: `${po}-${i}`, po, date, item_id: itemId, qty, rbi: 0, buyer_id: "b1" }));
D.poLines = [
  ...PO("PO-A", "2026-01-08", [["i-pp1509", 4000], ["i-90441600", 1000]]),
  ...PO("PO-B", "2026-02-12", [["i-pp1509", 8000], ["i-90446400", 1000], ["i-pet1512", 3000]]),
  ...PO("PO-C", "2026-03-04", [["i-90448820", 200], ["i-pmf2524", 500], ["i-grt15", 5400], ["i-gd3", 300]]),
  ...PO("PO-D", "2026-04-02", [["i-pp1509", 9000]]),             // never reached by DEMO/2
];
const line = (itemId, supplierId, boxes) => ({ item_id: itemId, supplier_id: supplierId, boxes, unit_value: null, unit_fob100: null });
const ship = { exRate: "95.10", marks: "GDW", pod: "FREMANTLE", finalDest: "AUSTRALIA" };
D.invoices = [
  { id: "inv1", invoice_no: "DEMO/1", date: "2026-05-01", buyer_id: "b1", rbi: 0, serial_start: 1001, ship, vehicles: {}, step_skip: {}, packing_transports: {},
    lines: [line("i-pp1509", OSW, 5)] },                         // 2000 of PO-A's 4000 PP1509
  { id: "inv2", invoice_no: "DEMO/2", date: "2026-06-01", buyer_id: "b1", rbi: 0, serial_start: 2001, ship, vehicles: {}, step_skip: {}, packing_transports: {},
    lines: [line("i-pp1509", OSW, 10), line("i-90441600", OSW, 10), line("i-90446400", OSW, 5), line("i-90448820", OSW, 4),
      line("i-pmf2524", OSW, 4), line("i-pet1512", HAN, 10), line("i-grt15", HAN, 10), line("i-gd3", HAN, 4)] },
];

/* Which orders each invoice's boxes clear — oldest order first, invoices in
   the order they were packed. The same FIFO the server's ledger runs
   (backend/app/calc.py compute_ledger), which is what the API sends the page. */
function poLegs(invoices, poLines, items) {
  const pack = Object.fromEntries(items.map((i) => [i.id, Number(i.packing) || 1]));
  const open = {};
  [...poLines].sort((a, b) => a.date.localeCompare(b.date) || a.po.localeCompare(b.po)).forEach((r) => {
    (open[r.item_id] ||= []).push({ po: r.po, date: r.date, left: Math.ceil(r.qty / pack[r.item_id]) });
  });
  [...invoices].sort((a, b) => a.date.localeCompare(b.date)).forEach((inv) => {
    inv.po_legs = {};
    inv.lines.forEach((l) => {
      let want = l.boxes;
      for (const d of open[l.item_id] || []) {
        if (want <= 0) break;
        const take = Math.min(d.left, want);
        if (take > 0) { d.left -= take; want -= take; (inv.po_legs[l.item_id] ||= []).push({ po: d.po, date: d.date, boxes: take }); }
      }
    });
  });
}
poLegs(D.invoices, D.poLines, D.items);

const ctxOf = (data, no = "DEMO/2") => docCtx({
  invoice: data.invoices.find((i) => i.invoice_no === no), items: data.items, buyers: data.buyers,
  suppliers: data.suppliers, poLines: data.poLines, transports: data.transports, invoices: data.invoices,
});
const ctx = ctxOf(D);

/* ---- the checks ------------------------------------------------------------ */
const results = [];
const check = (area, what, ok, detail = "") => results.push({ area, what, ok: !!ok, detail });
const text = (h) => String(h).replace(/<br\s*\/?>/g, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const html = (no, c = ctx) => docs.renderDocument(no, c);
const parts = (no, c = ctx) => docs.documentParts(no, c);
const cells = (no, c = ctx) => parts(no, c).flatMap((p) => p.sheets || (p.sheet ? [p.sheet] : []))
  .flatMap((sh) => (sh.rows || []).flat()).filter(Boolean).map((x) => (typeof x === "object" ? x.v : x)).filter((v) => v != null && v !== "");

/* Each group runs on its own: a group that throws (a rule missing outright)
   is reported as a failure and the rest still run. */
let t19 = "";
try { t19 = text(html("19")); } catch { /* reported under Renders */ }

const group = (area, fn) => {
  try { fn(); } catch (e) { check(area, "runs without error", false, e.message); }
};

// 1 · purchase orders on the supplier papers (7, 8, 9)
group("PO numbers (7, 8, 9)", () => {
const legs = ctx.inv.poLegs["i-pp1509"].map((x) => x.po);
check("PO numbers (7, 8, 9)", "PP1509's boxes clear the rest of PO-A, then PO-B", legs.join(",") === "PO-A,PO-B", legs.join(", "));
for (const no of ["7", "8", "9"]) {
  const row = text(html(no)).match(/\d+-\d+ (PO-[A-D][ ,PO\-A-D]*?) PP1509/);
  check(`PO numbers (7, 8, 9)`, `doc ${no}: PP1509 row lists PO-A, PO-B only`, row && row[1].replace(/\s/g, "") === "PO-A,PO-B", row ? row[1] : "row not found");
  check(`PO numbers (7, 8, 9)`, `doc ${no}: banner never cites PO-D`, !/PO-D/.test(text(html(no))));
}
});

// 2 · GST by the supplier's state (6, 8, 10)
group("GST (6, 8, 10)", () => {
const h8 = html("8");
const fig = (label) => Number((h8.match(new RegExp(`>${label.replace(/[()%]/g, "\\$&")}</td>\\s*<td[^>]*data-v="([\\d.]+)"`)) || [])[1]);
const val = (sup) => C.L(ctx).filter((r) => r.supId === sup).reduce((n, r) => n + r.valTotal, 0);
const vO = val(OSW), vH = val(HAN);
const igst = Math.round(vO * 0.18), cgst = Math.round(vH * 0.09);
check("GST (6, 8, 10)", "doc 8: CGST @ 9% and SGST @ 9% on Hansa (Maharashtra)", fig("CGST @ 9%") === cgst && fig("SGST @ 9%") === cgst, `CGST ${fig("CGST @ 9%")} / SGST ${fig("SGST @ 9%")}, expected ${cgst} each`);
check("GST (6, 8, 10)", "doc 8: IGST @ 18% on Oswin (Daman)", fig("IGST @ 18%") === igst, `IGST ${fig("IGST @ 18%")}, expected ${igst}`);
check("GST (6, 8, 10)", "doc 8: INV VALUE = goods + all three", Math.abs(fig("INV VALUE") - (vO + vH + igst + 2 * cgst)) < 1, `${fig("INV VALUE")}`);
const ew = C.ewaySupplierDocs(ctx);
const ewOf = (sid) => text(ew.find((d) => d.supplierId === sid).html);
check("GST (6, 8, 10)", "doc 10: Hansa e-way charges CGST 9 + SGST 9, no IGST", /9\.00 9\.00 0\.00 0\.00/.test(ewOf(HAN)));
check("GST (6, 8, 10)", "doc 10: Oswin e-way charges IGST 18 only", /0\.00 0\.00 18\.00 0\.00/.test(ewOf(OSW)));
check("GST (6, 8, 10)", "doc 6 rule: Hansa → CGST + SGST, Oswin → IGST",
  C.supplierTax(ctx, HAN).terms === "CGST @ 9% + SGST @ 9%" && C.supplierTax(ctx, OSW).terms === "IGST @ 18%");
});

// 3 · no length on the PLASTIC (PP) / (PA) moulded fittings (18, 19, 20, 31, 32)
group("Length column", () => {
const moulded = (bands) => bands.filter((b) => ["ppm", "grn"].includes(b.key));
check("Length column", "doc 18/31 bands: moulded fittings carry no LEN", moulded(C.invoiceBands(ctx)).every((b) => !b.len));
check("Length column", "doc 19/20/32 bands: moulded fittings carry no LEN", moulded(C.packingBands(ctx)).every((b) => !b.len));
check("Length column", "pipes keep their LEN", C.packingBands(ctx).filter((b) => ["mxm", "mxf"].includes(b.key)).every((b) => b.len));
check("Length column", "doc 19: PET1512 prints no 300 length", /PET1512 15 300 /.test(t19) && !/PET1512 15 300 300/.test(t19), "PET1512 → size 15, then Qty/Ctn 300");
});

// 4 · bundles in brackets (19)
group("Bundles (19)", () => {
check("Bundles (19)", "1800 mm pipe shows 1800 (BUNDLES) in LEN", t19.includes("1800 (BUNDLES)"));
check("Bundles (19)", "corrugated boxes show (BUNDLES) beside the size", t19.includes("570 X 368 X 178 (BUNDLES)"));
check("Bundles (19)", "Excel carries the same", cells("19").includes("1800 (BUNDLES)"));
});

// 5 · break-up of weights only with corrugated boxes (19)
group("Weight break-up (19)", () => {
check("Weight break-up (19)", "with corrugated boxes: break-up printed", /BREAK-UP OF WEIGHTS/.test(t19) && cells("19").includes("BREAK-UP OF WEIGHTS"));
const noBox = JSON.parse(JSON.stringify(D));
noBox.invoices[1].lines = noBox.invoices[1].lines.filter((l) => l.item_id !== "i-gd3");
const ctxNoBox = ctxOf(noBox);
check("Weight break-up (19)", "without corrugated boxes: no break-up", !/BREAK-UP OF WEIGHTS/.test(text(html("19", ctxNoBox))) && !cells("19", ctxNoBox).includes("BREAK-UP OF WEIGHTS"));
});

// 6 · BL annexure sizes (24)
group("BL annexure (24)", () => {
const bla = C.bla24Rows(ctx).filter((b) => b.kind === "tbl").flatMap((b) => b.rows.map((r) => r.map((c) => c[0]).join(" | ")));
const bores = bla.filter((l) => l.startsWith("SIZE"));
check("BL annexure (24)", "inch sizes read as their bore (1/2\" → 15MM, 1-1/4\" → 32MM)",
  bores.includes("SIZE : 15MM (1/2”) X ASSORTED LENGTHS | 5000") && bores.includes("SIZE : 32MM (1.1/4”) X ASSORTED LENGTHS | 500"), bores.join(" / "));
check("BL annexure (24)", "M/F pipes carry their inch too", bores.includes("SIZE : 25MM (1”) X ASSORTED LENGTHS | 200"));
check("BL annexure (24)", "no made-up sizes (12MM, 114MM …)", !bores.some((l) => /SIZE : (1|2|12|34|112|114)MM/.test(l)));
const pipePcs = C.L(ctx).filter((r) => ["mxm", "mxf"].includes(C.familyOf(r.it))).reduce((n, r) => n + r.pieces, 0);
check("BL annexure (24)", "pieces by bore add up to the pipes invoiced", bores.reduce((n, l) => n + Number(l.split(" | ")[1]), 0) === pipePcs, `${pipePcs} pcs`);
check("BL annexure (24)", "descriptions on one line", !bla.some((l) => l.includes("\n")));
});

// 7 · the one-page declarations are laid out as full A4 sheets (13–16)
group("A4 declarations", () => {
for (const no of ["13", "14", "15", "16"]) check("A4 declarations", `doc ${no} is set as a full A4 page`, /class="(evd|dl just) a4"/.test(html(no)));
});

/* ---- write the papers out ---------------------------------------------------- */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const PRINT = fs.readFileSync(path.join(ROOT, "src/lib/download.js"), "utf8").match(/const PRINT_CSS = `([\s\S]*?)`;\n/)[1];
const PAPER = fs.readFileSync(path.join(ROOT, "src/index.css"), "utf8").match(/\.docprev-paper[^{]*\{[\s\S]*?\n\}/g).join("\n");
const FIT = `<script>${fs.readFileSync(path.join(ROOT, "src/lib/fitCells.js"), "utf8").replace(/export /g, "")}</script>`;
const AUDIT = `<script>addEventListener("load", () => setTimeout(() => {
  const preview = !!document.querySelector(".docprev-paper");
  fitCells(document.body); if (!preview) fitPages(document, window.__orient);
  const out = [];
  document.querySelectorAll("td, th").forEach((el) => {
    const cs = getComputedStyle(el);
    if (el.textContent.trim() && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2
      && (cs.whiteSpace === "nowrap" || cs.overflow === "hidden")) out.push("cut: " + el.textContent.trim().slice(0, 60));
  });
  const p = document.querySelector(".docprev-paper");
  if (p) { let r = 0; const l = p.getBoundingClientRect().left;
    p.querySelectorAll("table, .ew, .dl, .evd, .bla").forEach((t) => { r = Math.max(r, t.getBoundingClientRect().right - l); });
    if (p.getBoundingClientRect().width - r > 60) out.push("empty band on the right: paper " + Math.round(p.getBoundingClientRect().width) + "px, content " + Math.round(r) + "px"); }
  const pre = document.createElement("pre"); pre.id = "audit"; pre.style.display = "none"; pre.textContent = out.join("\\n"); document.body.appendChild(pre);
}, 300));</script>`;

const NOS = ["7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29"];
const written = [];
for (const no of NOS) {
  let ps;
  try { ps = parts(no); } catch (e) { check("Renders", `doc ${no} renders`, false, e.message); continue; }
  check("Renders", `doc ${no} renders`, ps.length && ps.every((p) => p.html && p.html.length > 200));
  const orient = ps.every((p) => p.page === "portrait") ? "portrait" : "landscape";
  fs.writeFileSync(path.join(OUT, `preview-${no}.html`), `<!doctype html><html><head><meta charset="utf-8"><title>${no} · ${docs.DOC_META[no]} — preview</title>
    <style>body{margin:0;padding:18px;background:#e8edf2} ${docs.PREVIEW_CSS} ${PAPER}</style></head>
    <body><div class="docprev docprev-paper">${html(no)}</div>${FIT}${AUDIT}</body></html>`);
  fs.writeFileSync(path.join(OUT, `print-${no}.html`), `<!doctype html><html><head><meta charset="utf-8"><title>${no} · ${docs.DOC_META[no]} — PDF</title>
    <style>@page { size: A4 ${orient}; margin: 0; }${PRINT}</style></head>
    <body>${ps.map((p) => `<div class="jg-doc">${p.html}</div>`).join("")}<script>window.__orient="${orient}"</script>${FIT}${AUDIT}</body></html>`);
  written.push({ no, orient });
}

/* ---- the layout, in a real browser, if there is one --------------------------- */
const chrome = ["google-chrome", "chromium", "chromium-browser", "google-chrome-stable"].find((b) => {
  try { execFileSync("which", [b], { stdio: "ignore" }); return true; } catch { return false; }
});
const pdfPages = (file) => (fs.readFileSync(file, "latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
if (!chrome) {
  check("Layout", "Chrome / Chromium found for the layout checks", false, "install Chrome to run them; the rule checks above still ran");
} else {
  const run = (args) => { try { return execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60000 }); } catch (e) { return e.stdout || ""; } };
  const audit = (dom) => ((dom.match(/<pre id="audit"[^>]*>([\s\S]*?)<\/pre>/) || [])[1] || "").trim();
  for (const { no, orient } of written) {
    const w = orient === "portrait" ? 794 : 1123;
    const pv = audit(run(["--window-size=1400,1000", "--virtual-time-budget=3000", "--dump-dom", `file://${OUT}/preview-${no}.html`]));
    check("Layout · preview", `doc ${no}: nothing cut off, no empty band`, !pv, pv.split("\n").slice(0, 3).join("; "));
    const pr = audit(run([`--window-size=${w},1200`, "--virtual-time-budget=3000", "--dump-dom", `file://${OUT}/print-${no}.html`]));
    check("Layout · PDF", `doc ${no}: nothing cut off`, !pr, pr.split("\n").slice(0, 3).join("; "));
    const pdf = path.join(OUT, `doc-${no}.pdf`);
    run([`--window-size=${w},1200`, "--virtual-time-budget=3000", "--no-pdf-header-footer", `--print-to-pdf=${pdf}`, `file://${OUT}/print-${no}.html`]);
    if (fs.existsSync(pdf)) {
      const n = pdfPages(pdf);
      written.find((x) => x.no === no).pages = n;
      if (["13", "14", "15", "16", "21", "22", "23", "24", "26", "27", "29"].includes(no)) check("Layout · PDF", `doc ${no}: one A4 page`, n === 1, `${n} page(s)`);
    }
  }
}

/* ---- the report ------------------------------------------------------------------ */
const failed = results.filter((r) => !r.ok);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
fs.writeFileSync(path.join(OUT, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><title>Document check</title>
<style>body{font:14px/1.5 system-ui,sans-serif;margin:24px;color:#1d2b3a;background:#f6f8fa}h1{margin:0 0 4px}
.sum{margin:0 0 18px;color:#52606d}table{border-collapse:collapse;background:#fff;width:100%;max-width:1100px}
td,th{border:1px solid #d9e1ea;padding:6px 10px;text-align:left;vertical-align:top}th{background:#eef2f6}
.ok{color:#137333;font-weight:700}.no{color:#b3261e;font-weight:700}.d{color:#52606d;font-size:12.5px}
.docs{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px;max-width:1100px;margin-top:10px}
.docs a{display:block;background:#fff;border:1px solid #d9e1ea;border-radius:6px;padding:8px 10px;color:#0b57d0;text-decoration:none}</style></head>
<body><h1>Export documents — demo check</h1>
<p class="sum">Demo invoice DEMO/2 · ${results.length - failed.length} of ${results.length} checks passed${failed.length ? ` · <b class="no">${failed.length} failed</b>` : " · <b class=\"ok\">all passed</b>"}</p>
<table><tr><th>Area</th><th>Check</th><th>Result</th></tr>
${[...results].sort((a, b) => [...new Set(results.map((r) => r.area))].indexOf(a.area) - [...new Set(results.map((r) => r.area))].indexOf(b.area)).map((r) => `<tr><td>${esc(r.area)}</td><td>${esc(r.what)}${r.detail ? `<div class="d">${esc(r.detail)}</div>` : ""}</td><td class="${r.ok ? "ok" : "no"}">${r.ok ? "PASS" : "FAIL"}</td></tr>`).join("")}</table>
<h2>Look through them yourself</h2><div class="docs">
${written.map((w) => `<a href="preview-${w.no}.html">${w.no} · ${esc(docs.DOC_META[w.no] || "")} — preview</a>
  ${fs.existsSync(path.join(OUT, `doc-${w.no}.pdf`)) ? `<a href="doc-${w.no}.pdf">${w.no} · PDF (${w.pages} page${w.pages === 1 ? "" : "s"})</a>` : `<a href="print-${w.no}.html">${w.no} · print layout</a>`}`).join("")}
</div></body></html>`);

for (const area of [...new Set(results.map((r) => r.area))]) {
  console.log(`\n${area}`);
  results.filter((r) => r.area === area).forEach((r) =>
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.what}${!r.ok && r.detail ? `  — ${r.detail}` : ""}`));
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed.  Open ${path.relative(process.cwd(), path.join(OUT, "index.html"))} to look through the papers.`);
await server.close();
process.exit(failed.length ? 1 : 0);
