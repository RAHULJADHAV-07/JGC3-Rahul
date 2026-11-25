/* Demo task — verify the export documents end to end, without a database.

     npm run verify:docs

   Builds a small demo shipment that touches every rule the papers have to get
   right, renders the documents from it with the app's own document engine, and
   checks each rule. Then, if Chrome / Chromium is installed, it opens every
   preview and every PDF in a headless browser and checks the layout: no text
   cut off in a cell, no paper wider than its content, no sheet spilling a few
   lines onto a page of its own. Every paper's Word copy is built in the same
   browser and checked against its PDF: the package opens, it says everything
   the paper says, and — with LibreOffice installed — it comes to the same
   number of pages.

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

process.on("unhandledRejection", () => {});
/* The letterhead, the mark, the signature and the stamp are fetched from the
   app's own public folder, so the papers here carry them as the real ones do. */
const netFetch = globalThis.fetch;
globalThis.fetch = async (src, ...a) => {
  if (typeof src !== "string" || !src.startsWith("/")) return netFetch(src, ...a);
  return new Response(fs.readFileSync(path.join(ROOT, "public", src)));
};
const server = await createServer({
  root: ROOT, server: { middlewareMode: true }, appType: "custom", logLevel: "error",
  optimizeDeps: { noDiscovery: true, entries: [] },   // no browser bundle needed here
});
const { docCtx, poCtx } = await server.ssrLoadModule("/src/lib/docCtx.js");
const docs = await server.ssrLoadModule("/src/lib/docs.js");
const C = await server.ssrLoadModule("/src/lib/docs/common.js");
await (await server.ssrLoadModule("/src/lib/logo.js")).primeLogo();

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
/* Custom PO: the packer took PP1509 off PO-D, the newest order, instead of the
   oldest. The API's ledger sends those legs and freezes the line at PO-D's price;
   every paper must then cite PO-D for that line and bill at that price. */
group("Custom PO", () => {
const custom = JSON.parse(JSON.stringify(D));
const inv = custom.invoices[1];
inv.allocation = "custom";
const pp = inv.lines.find((l) => l.item_id === "i-pp1509");
pp.unit_value = 7.25; pp.value_mode = "piece";
pp.po_alloc = [{ po: "PO-D", boxes: 10 }];
inv.po_legs["i-pp1509"] = [{ po: "PO-D", date: "2026-04-02", boxes: 10 }];
const c = ctxOf(custom);
const row = C.L(c).find((r) => r.it.id === "i-pp1509");
check("Custom PO", "the line carries the order it was taken off", row.pos.join(",") === "PO-D", row.pos.join(", "));
check("Custom PO", "the line bills at the price that order agreed", row.valUnit === 7.25, String(row.valUnit));
check("Custom PO", "its carton serials are not disturbed", row.range === C.L(ctx).find((r) => r.it.id === "i-pp1509").range, row.range);
["7", "8", "9"].forEach((no) => {
  const t = text(html(no, c));
  const m = t.match(/\d+-\d+ (PO-[A-D][ ,PO\-A-D]*?) PP1509/);
  check("Custom PO", `doc ${no}: PP1509 row lists PO-D only`, m && m[1].replace(/\s/g, "") === "PO-D", m ? m[1] : "row not found");
  check("Custom PO", `doc ${no}: the banner cites PO-D`, /PO-D/.test(t));
});
// The orders the other lines cleared stay as they were.
check("Custom PO", "another line's order is untouched", C.L(c).find((r) => r.it.id === "i-90441600").pos.join(",") === "PO-A");
// Nothing is thrown by any paper raised from a Custom PO invoice.
Object.keys(docs.DOC_META).forEach((no) => {
  if (docs.isPoDoc?.(no)) return;
  try { html(no, c); } catch (e) { check("Custom PO", `doc ${no} renders`, false, e.message); }
});
check("Custom PO", "every invoice paper renders", true);
});

/* A plain pipe, then its PH twin — the plain one is cut to inches up to 25 MM
   and is the longer of the two, which is what used to put it second. */
group("Plain then PH", () => {
const A = "Plain then PH";
const want = [["PE2524", "25", "610"], ["PE2524PH", '1"', "600"], ["PE2548", "25", "1220"], ["PE2548PH", '1"', "1200"],
  ["PE3212", "32", "300"], ["PE3212PH", '1-1/4"', "300"]];
const set = JSON.parse(JSON.stringify(D));
const order = [3, 0, 5, 1, 4, 2];
set.items = order.map((n) => want[n]).map(([gd, size, length]) => item(`i-${gd}`, {
  code: gd.endsWith("PH") ? `9044${gd.slice(2, 6)}` : gd, gd, size, length, packing: 10, group: size.startsWith("1-") || size === "32" ? '32 MM (1.1/4")' : '25 MM (1")',
  description: `${gd} P/RISER M X M`, unit_value: 9, unit_fob100: 0.2, supplier_id: OSW,
}));
set.poLines = PO("PO-Z", "2026-01-08", set.items.map((x) => [x.id, 100]));
set.invoices = [{ ...set.invoices[1], lines: set.items.map((x) => line(x.id, OSW, 2)) }];
poLegs(set.invoices, set.poLines, set.items);
const c = ctxOf(set), o = poCtx({ po: "PO-Z", items: set.items, buyers: set.buyers, suppliers: set.suppliers, poLines: set.poLines, transports: [] });
const gds = want.map((w) => w[0]);
check(A, "invoice lines", C.L(c).map((r) => r.it.gd).join() === gds.join(), C.L(c).map((r) => r.it.gd).join());
check(A, "order lines", C.orderAgg(o).map((r) => r.it.gd).join() === gds.join(), C.orderAgg(o).map((r) => r.it.gd).join());
/* And as printed: wherever a paper lists the goods by GD code, in that order. */
let listed = 0;
Object.keys(docs.DOC_META).forEach((no) => {
  const t = text(html(no, docs.isPoDoc(no) ? o : c));
  const hits = gds.map((g) => [...t.matchAll(new RegExp(`\\b${g}\\b`, "g"))].map((m) => m.index));
  if (hits.some((x) => !x.length)) return;
  listed += 1;
  // A paper of several tabs names a plain pipe on each (its code is its GD
  // code) and a PH pipe, coded otherwise, on the last — where both are listed.
  const at = hits.map((x) => x[x.length - 1]);
  check(A, `doc ${no} prints them in order`, at.every((x, i) => !i || at[i - 1] < x), at.join(", "));
});
check(A, "the papers that list goods were all looked at", listed >= 15, String(listed));
});

/* Papers go by their names: no number heads one, names a file or a tab. */
group("No numbers", () => {
const A = "No numbers";
const o = poCtx({ po: "PO-B", items: D.items, buyers: D.buyers, suppliers: D.suppliers, poLines: D.poLines, transports: D.transports });
check(A, "the Buyers Order is gone", !docs.DOC_META["1"] && !docs.PO_DOCS.includes("1") && !docs.hasBuilder("1"));
const files = {};
Object.keys(docs.DOC_META).forEach((no) => {
  const c = docs.isPoDoc(no) ? o : ctx;
  const title = /<div class="title">([^<]*)/.exec(html(no, c))?.[1] || "";
  check(A, `doc ${no}: its heading`, !/^\s*\d/.test(title), title);
  const file = docs.documentFilename(no, c);
  check(A, `doc ${no}: its file name`, !/^Doc_|^\d/.test(file) && !new RegExp(`_${no}(_|$)`).test(file.replace(/_(PO-B|DEMO-2)$/, "")), file);
  (files[file] ||= []).push(no);
});
const shared = Object.entries(files).filter(([, nos]) => nos.length > 1);
check(A, "no two papers are saved under one name", !shared.length, JSON.stringify(shared));
const tabs = docs.DOC_GROUPS.flatMap((g) => g.docs).map(docs.docFullTitle);
check(A, "no tab is named by a number", tabs.every((t) => !/\d/.test(t)), tabs.join(", "));
});

group("Transporter", () => {
const renamed = JSON.parse(JSON.stringify(D));
const inv = renamed.invoices[1];
inv.vehicles = { [OSW]: { vehicleNo: "MH04", transportId: "t1", transportName: "OLD NAME", source: "Daman", dest: "Nhava Sheva" } };
renamed.transports = [{ id: "t1", name: "NEW NAME", transport_id: "27ABC", supplier_id: OSW, supplier_ids: [OSW] }];
const c = docCtx({ invoice: inv, items: renamed.items, buyers: renamed.buyers, suppliers: renamed.suppliers, poLines: renamed.poLines, transports: renamed.transports, invoices: renamed.invoices });
check("Transporter", "a renamed transporter prints renamed", C.transportInfo(c, OSW).name === "NEW NAME", C.transportInfo(c, OSW).name);
renamed.transports = [];
const gone = docCtx({ invoice: inv, items: renamed.items, buyers: renamed.buyers, suppliers: renamed.suppliers, poLines: renamed.poLines, transports: [], invoices: renamed.invoices });
check("Transporter", "one since removed from Setup keeps the name on the invoice", C.transportInfo(gone, OSW).name === "OLD NAME", C.transportInfo(gone, OSW).name);
});

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
check("Length column", "no range prints a LEN column — the PP pipes neither", C.packingBands(ctx).every((b) => !b.len) && C.invoiceBands(ctx).every((b) => !b.len));
check("Length column", "docs 18, 19, 31 print no LEN (MM) heading", ["18", "19", "31"].every((no) => !/LEN \(MM\)/.test(html(no))));
check("Length column", "doc 19: PET1512 prints no 300 length", /PET1512 15 300 /.test(t19) && !/PET1512 15 300 300/.test(t19), "PET1512 → size 15, then Qty/Ctn 300");
});

// 4 · bundles in brackets (19)
group("Bundles (19)", () => {
check("Bundles (19)", "the 1800 mm pipe in bundles shows (BUNDLES) beside its size", t19.includes('2" (BUNDLES)'));
check("Bundles (19)", "corrugated boxes show (BUNDLES) beside the size", t19.includes("570 X 368 X 178 (BUNDLES)"));
check("Bundles (19)", "Excel carries the same", cells("19").includes('2" (BUNDLES)'));
});

// 4b · the HS code table on the shipping instructions (26)
group("HS code table (26)", () => {
const t26 = text(html("26"));
const hs = C.siHsnTable(C.L(ctx));
check("HS code table (26)", "a line per HS code, under its heading", /HS CODE DESCRIPTION PACKAGES GROSS WEIGHT TOTAL CBM/.test(t26) && hs.length === 3, hs.map((x) => x.hsn).join(", "));
check("HS code table (26)", "packages add up to the shipment", hs.reduce((n, x) => n + x.packages, 0) === C.L(ctx).reduce((n, r) => n + r.boxes, 0));
check("HS code table (26)", "grand total printed", /Grand Total 57 616\.200 3\.42/.test(t26), (t26.match(/Grand Total[^A-Z]*/) || [""])[0]);
check("HS code table (26)", "Excel carries it", cells("26").includes("Grand Total"));
});

// 4c · where the goods were made, on the letter to the CHA (22)
group("Made in (22)", () => {
check("Made in (22)", "outside Maharashtra by town, Maharashtra by state, last", /Goods manufactured in Daman & Maharashtra/.test(text(html("22"))), (text(html("22")).match(/Goods manufactured in [^0-9]*/) || [""])[0]);
const only = (sid) => docCtx({ invoice: D.invoices[1], items: D.items, buyers: D.buyers, suppliers: D.suppliers, poLines: D.poLines, transports: D.transports, invoices: D.invoices, supplierId: sid });
check("Made in (22)", "one supplier's letter names its own place only", C.madeIn(only(OSW)) === "Daman" && C.madeIn(only(HAN)) === "Maharashtra", `${C.madeIn(only(OSW))} / ${C.madeIn(only(HAN))}`);
});

// 4d · figures are figures, on every paper
group("Figures", () => {
  /* A rate that does not go into the paisa evenly: what is left over is nothing,
     and prints as nothing. */
  const odd = JSON.parse(JSON.stringify(D));
  odd.invoices[1].ship.exRate = "95.17";
  odd.items.forEach((i) => { i.unit_fob100 = i.unit_fob100 * 1.0137; });
  const oc = ctxOf(odd);
  Object.keys(docs.DOC_META).forEach((no) => {
    const t = text(html(no, docs.isPoDoc(no) ? ctx : oc));
    const bad = (t.match(/-0\.0+(?![0-9])|\bNaN\b|\bundefined\b|\[object|Infinity/g) || []);
    check("Figures", `doc ${no}: no "-0.00", NaN or undefined`, !bad.length, bad.slice(0, 3).join(", "));
  });
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

// 6b · Oswin's PMF pipes print as a block of their own (Setup → Item groups)
group("Item groups", () => {
const gds = C.L(ctx).map((r) => r.it.gd);
const at = (gd) => gds.indexOf(gd);
check("Item groups", "PMF2524 follows every other Oswin line, ahead of Hansa",
  at("PMF2524") > Math.max(at("PP1509"), at("90441600"), at("90446400"), at("90448820")) && at("PMF2524") < at("PET1512"), gds.join(", "));
const heads = C.L(ctx).filter((r) => r.blockHead).map((r) => r.blockHead);
check("Item groups", "each block opens under its own heading", heads.join(" | ") === "Oswin | Oswin · PMF | Hansa — PP | Hansa — GRN", heads.join(" | "));
const t7 = text(html("7"));
check("Item groups", "doc 7 rules a band in for the PMF block", /Oswin · PMF \d+-\d+ PO-C PMF2524/.test(t7));
check("Item groups", "the order's purchase sheet heads the PMF block too", text(html("4")).includes("Oswin · PMF"));
check("Item groups", "doc 6 gives the PMF pipes an annexure of their own",
  C.supplierPoDocs(ctx).find((d) => d.supplierId === OSW)?.sheets.some((sh) => /PMF/.test(sh.name)));
const one = JSON.parse(JSON.stringify(D));
one.invoices[1].lines = one.invoices[1].lines.filter((l) => l.item_id === "i-pp1509" || l.item_id === "i-90441600");
check("Item groups", "a paper that is all one block prints no headings", C.L(ctxOf(one)).every((r) => !r.blockHead));
const merged = docCtx({ invoice: D.invoices[1], items: D.items, buyers: D.buyers, suppliers: D.suppliers, poLines: D.poLines,
  transports: D.transports, invoices: D.invoices, groups: { Oswin: [] } });
check("Item groups", "with the group removed, PMF sorts back in by bore", C.L(merged).filter((r) => r.blockHead).every((r) => !r.blockHead.includes("PMF")));
});

// 6c · carton serials, once allotted, stay with their line
group("Locked serials", () => {
const locked = JSON.parse(JSON.stringify(D));
const inv = locked.invoices[1];
let next = 2001;
inv.lines.forEach((l) => { l.serial_from = next; next += l.boxes; });
const range = (c, gd) => C.L(c).find((r) => r.it.gd === gd)?.range;
const before = range(ctxOf(locked), "90446400");
inv.lines = inv.lines.filter((l) => l.item_id !== "i-90441600");     // the supplier could not send it
const c2 = ctxOf(locked);
check("Locked serials", "removing a line leaves the next line's cartons where they were", range(c2, "90446400") === before, `${before} → ${range(c2, "90446400")}`);
check("Locked serials", "PP1509 keeps 2001-2010", range(c2, "PP1509") === "2001-2010");
const m = C.ciMarks(c2, C.L(c2));
check("Locked serials", "the marks still run to the last carton allotted", m.start === 2001 && m.end === next - 1, `${m.start}-${m.end}`);
check("Locked serials", "doc 7 prints the kept range", text(html("7", c2)).includes(before));
});

// 7 · the one-page declarations are laid out as full A4 sheets (13–16)
group("A4 declarations", () => {
for (const no of ["13", "14", "15", "16"]) check("A4 declarations", `doc ${no} is set as a full A4 page`, /class="(evd|dl just) a4"/.test(html(no)));
});

// 8 · by air (V-7.5.0) — Docs/JG_Air_Docs
const AIR = JSON.parse(JSON.stringify(D));
AIR.invoices[1].ship = {
  ...AIR.invoices[1].ship, mode: "air", awbNo: "232-19269504", awbDate: "2026-11-09", airline: "Malaysia Airlines",
  flights: [{ no: "MH195", date: "2026-11-11" }, { no: "MH 127", date: "2026-11-13" }], terms: "CFR PERTH", freight: "352.50",
  skids: "2", skidWt: "16.6", dims: "40 X 40 X 40 CMS", pol: "SAHAR AIR CARGO, MUMBAI (INDIA)", pod: "PERTH",
  // Left over from a sea draft of the same invoice: none of it may print by air.
  container: "OOCU0793142", seal: "SEAL-LEFTOVER", blNo: "BL-LEFTOVER", vessel: "VESSEL-LEFTOVER",
};
const airCtx = ctxOf(AIR);
const M = await server.ssrLoadModule("/src/lib/modes.js");
group("Air mode", () => {
  const A = "Air mode";
  const t = (no) => text(html(no, airCtx));
  const total = C.L(airCtx).reduce((n, r) => n + r.fobTotal, 0);
  const gross = C.L(airCtx).reduce((n, r) => n + r.grossTotal, 0);
  const per = "MALAYSIA AIRLINES MH195 DT 11.11.2026, MH 127 DT 13.11.2026";
  const leftovers = (x) => !/OOCU0793142|SEAL-LEFTOVER|BL-LEFTOVER|VESSEL-LEFTOVER/.test(x);
  const t18 = t("18"), t31 = t("31"), t19 = t("19"), t21 = t("21"), t30 = t("30");
  check(A, "18: AWB No. with its date", t18.includes("AWB No. 232-19269504 DT 09.11.2026") && !t18.includes("BL. NO."));
  check(A, "18: shipped per the airline and every flight", t18.includes(per));
  check(A, "18: priced on the terms sold (CFR PERTH), totals named so", t18.includes("CFR PERTH IN US$") && t18.includes("CFR PERTH IN INR") && t18.includes("Total CFR PERTH Value"));
  check(A, "18: skids on the packages line", t18.includes("(02 SKIDS) CONTAINING"));
  check(A, "18: skid and total weights in the margin", t18.includes("Skid Wt") && t18.includes("16.600") && t18.includes((gross + 16.6).toFixed(3)), (gross + 16.6).toFixed(3));
  check(A, "18: approx freight and FOB = CFR − freight", t18.includes("Approx Freight $352.50") && t18.includes(`Approx FOB Value $${(total - 352.5).toFixed(2)}`), `${total}`);
  check(A, "18: no container, seal, BL or vessel", leftovers(t18) && !t18.includes("Container No.") && !t18.includes("Seal No."));
  const x18 = cells("18", airCtx);
  check(A, "18 Excel: AWB No. and the CFR total", x18.includes("AWB No.") && x18.includes("Total CFR PERTH Value :") && x18.includes("Approx Freight") && !x18.includes("Container No."));
  check(A, "18 annexure: CFR per piece", t18.includes("CFR / PC US$") || t18.includes("CFR / 100 PCS US$"));
  check(A, "31: AWB, flights, CFR, freight and no container", t31.includes("AWB No. 232-19269504") && t31.includes(per) && t31.includes("CFR PERTH IN US$") && t31.includes("Approx FOB Value") && leftovers(t31) && !t31.includes("Container No."));
  check(A, "19: AWB NO and shipped per", t19.includes("AWB NO : 232-19269504 DT 09.11.2026") && t19.includes(`Shipped per : ${per}`));
  check(A, "19: no container or seal box", !t19.includes("CONTAINER NO") && !t19.includes("SEAL NO") && leftovers(t19));
  check(A, "19: weight of the skids and the total weight", t19.includes("WEIGHT OF 2 SKIDS") && t19.includes(`TOTAL WEIGHT….. ${(gross + 16.6).toFixed(3)}`));
  const x19 = cells("19", airCtx);
  check(A, "19 Excel: the skid rows", x19.includes("WEIGHT OF 2 SKIDS") && x19.includes("TOTAL WEIGHT….."));
  check(A, "21: airline, flights, AWB and its date", t21.includes(`Air Lines MALAYSIA AIRLINES Flight Number MH195 DT 11.11.2026, MH 127 DT 13.11.2026`) && t21.includes("AWB Number 232-19269504 Date 09.11.2026"));
  check(A, "21: skids are timber, ISPM 15 YES", /Yes Timber X/.test(t21) && /ISPM 15\? YES/.test(t21) && !t21.includes("Vessel Name") && leftovers(t21));
  check(A, "33: the buyer's copy follows", text(html("33", airCtx)).includes("AWB Number 232-19269504"));
  check(A, "30: per the airline, its flights; AWB; freight certificate", t30.includes("per Malaysia Airlines Flight No MH195 DT 11.11.2026") && t30.includes("AWB No. 232-19269504 Dt 09.11.2026") && t30.includes("Freight Certificate") && !t30.includes("Container Weight Declaration"));
  check(A, "30: FOB + freight = CFR", t30.includes(`US$ 352.50 FREIGHT CHARGES = US$ ${C.usd(total).slice(1)} TOTAL CFR PERTH VALUE`));
  check(A, "14: SCOMET to customs at the air cargo complex", t("14").includes("Export Department, Air Cargo Complex") && t("14").includes("Scomet Declaration"));
  check(A, "11: delivered to the air forwarder at Saki Naka", t("11").includes("Saki Naka (Door Delivery)") && t("11").includes("Modern Cargo Services") && t("11").includes("DESPATCH DATE: Immediate"));
  check(A, "10: e-way ships to the air forwarder", t("10").includes("Modern Cargo Services") && !t("10").includes("ALL CARGO TERMINALS"));
  check(A, "17: air freight prepaid", t("17").includes("AIR FREIGHT PREPAID"));
  check(A, "22: the letter goes to the air forwarder, airline in place of the vessel", t("22").includes("Modern Cargo Services") && t("22").includes("Airline / Flight") && !t("22").includes("Velji"));
  check(A, "40: the AWB in the transport document details", t("40").includes("232-19269504"));
  check(A, "by sea, 22 still goes to Velji Dosabhai", text(html("22")).includes("Velji Dosabhai"));
  const t26a = t("26A");
  check(A, "26A: airline and flights, dimensions, skids, freight prepaid", t26a.includes(`AIRLINE NAME AND FLIGHT NUMBER PLACE OF RECEIPT : ${per}`) && t26a.includes("40 X 40 X 40 CMS") && t26a.includes("DIMENSION OF CTN") && t26a.includes("MUMBAI, INDIA") && /PREPAID/.test(t26a));
  check(A, "26A: the HS code table", /HS CODE DESCRIPTION PACKAGES GROSS WEIGHT TOTAL CBM/.test(t26a) && cells("26A", airCtx).includes("Grand Total"));
  check(A, "16A: origin declared against the invoice", t("16A").includes("Invoice No. DEMO/2 DATED 01-JUNE-2026 are wholly obtained Indian origin"));
  Object.keys(docs.DOC_META).forEach((no) => {
    if (docs.isPoDoc(no)) return;
    try { const h = html(no, airCtx); if (/Preview unavailable/.test(h)) throw new Error(text(h)); parts(no, airCtx); }
    catch (e) { check(A, `doc ${no} renders by air`, false, e.message); }
  });
  check(A, "every invoice paper renders by air", true);
  // The sea papers are untouched by any of it.
  const s18 = text(html("18"));
  check(A, "by sea, 18 still reads BL / vessel / container / FOB MUMBAI", s18.includes("BL. NO.") && s18.includes("FOB MUMBAI IN US$") && s18.includes("Container No.") && s18.includes("Total FOB Mumbai Value"));
  check(A, "by sea, 19 and 21 keep the container", text(html("19")).includes("CONTAINER NO") && text(html("21")).includes("Vessel Name"));
  check(A, "by sea, 30 lists the CWD and asks for the remittance date", text(html("30")).includes("Container Weight Declaration") && text(html("30")).includes("Kindly arrange the remittance"));
  check(A, "an air invoice sold FOB keeps the FOB value box", (() => {
    const fob = JSON.parse(JSON.stringify(AIR)); fob.invoices[1].ship.terms = "FOB MUMBAI";
    const f = text(html("18", ctxOf(fob)));
    return f.includes("FOB VALUE") && f.includes("Payable at") && !f.includes("Approx Freight");
  })());
  // Security: whatever is typed on the air shipment prints as text, never as markup.
  const XSS = JSON.parse(JSON.stringify(AIR));
  const bad = '<img src=x onerror="alert(1)">';
  Object.assign(XSS.invoices[1].ship, { airline: bad, awbNo: bad, terms: `CFR ${bad}`, pol: bad, pod: bad, dims: bad, awbType: bad,
    notify2: bad, deliveryPlace: bad, flights: [{ no: bad, date: "2026-11-11" }], freight: "1e9", skids: "<b>2</b>", skidWt: "x" });
  const xc = ctxOf(XSS);
  const leaks = Object.keys(docs.DOC_META).filter((no) => !docs.isPoDoc(no)).filter((no) => {
    try { return /<img src=x/i.test(html(no, xc)); } catch { return false; }
  });
  check(A, "typed markup is escaped on every air paper", leaks.length === 0, leaks.join(", "));
  check(A, "nonsense numbers do not break the papers", ["18", "19", "26A", "30", "31"].every((no) => !/NaN|undefined/.test(text(html(no, xc)))),
    ["18", "19", "26A", "30", "31"].filter((no) => /NaN|undefined/.test(text(html(no, xc)))).join(", "));
  check(A, "the air set leaves out the container papers", M.docsForMode(Object.keys(docs.DOC_META), "air").every((no) => !["24", "26", "27", "34"].includes(no)));
  check(A, "the air set has the AWB instructions and the origin declaration", ["16A", "26A"].every((no) => docs.DOC_META[no] && M.docInMode(no, "air") && !M.docInMode(no, "water")));
});

/* 9 · the air papers laid out as Docs/JG_Air_Docs lays them out:
   one page where the goods fit, the pipes' length, the air foot. */
group("Air layout", () => {
  const A = "Air layout";
  const tabs = (no, c) => parts(no, c).flatMap((p) => p.sheets || [p.sheet]).filter(Boolean).map((sh) => sh.name);
  check(A, "18: one page and the annexure by air, two pages and the annexure by sea",
    tabs("18", airCtx).join(",") === "Page1,Annx" && tabs("18", ctx).join(",") === "Page1,Page2,Annx", `${tabs("18", airCtx)} / ${tabs("18", ctx)}`);
  check(A, "31: one page by air, two by sea", tabs("31", airCtx).join(",") === "Page1" && tabs("31", ctx).join(",") === "Page1,Page2");
  // Corrugated boxes need the break-up of weights, which keeps the second page.
  const NOBOX = JSON.parse(JSON.stringify(AIR));
  NOBOX.invoices[1].lines = NOBOX.invoices[1].lines.filter((l) => l.item_id !== "i-gd3");
  check(A, "19: one page by air, two by sea or with corrugated boxes",
    tabs("19", ctxOf(NOBOX)).join(",") === "Page1" && tabs("19", airCtx).join(",") === "Page1,Page2" && tabs("19", ctx).join(",") === "Page1,Page2");
  const t18 = text(html("18", airCtx));
  check(A, "18: the pipes print LEN (MM) by air", t18.includes("LEN (MM)"));
  check(A, "18 / 19 by sea still leave LEN out", !text(html("18")).includes("LEN (MM)") && !t19.includes("LEN (MM)"));
  check(A, "18: no RoDTEP claim by air, and the GSTIN dated", !t18.includes("RoDTEP") && t18.includes("w.e.f 20.01.2021"));
  check(A, "18: the marks put the count under the run (NOS : start - end)", /NOS : \d+ - \d+/.test(t18) && !/GDW NOS :/.test(t18));
  check(A, "19: the pipes are counted in boxes by air", text(html("19", airCtx)).includes("Qty/Box-Pcs"));
  check(A, "17: SHIPMENT and the C&F total by air", /SHIPMENT/.test(text(html("17", airCtx))) && /TOTAL C&F PERTH VALUE/.test(text(html("17", airCtx))));
  check(A, "11: the air letter leaves its reference and date to be written in", !/JG\/\d{4}\//.test(text(html("11", airCtx))));
  const t26 = text(html("26A", airCtx));
  check(A, "26A: the gross weight stands over the net", t26.includes("NET WEIGHT") && t26.indexOf("GROSS WEIGHT") < t26.indexOf("NET WEIGHT"));
  check(A, "13: the air declaration is valued FOB MUMBAI", text(html("13", airCtx)).includes(": FOB MUMBAI"));
  check(A, "10: the e-way tax is to the whole rupee", /IGST Amount[\s\S]*?\d+\.00/.test(text(html("10", airCtx))));
});

/* ---- write the papers out ---------------------------------------------------- */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const { PRINT_CSS: PRINT } = await server.ssrLoadModule("/src/lib/download.js");
const PAPER = fs.readFileSync(path.join(ROOT, "src/index.css"), "utf8").match(/\.docprev-paper[^{]*\{[\s\S]*?\n\}/g).join("\n");
const FIT = `<script>${fs.readFileSync(path.join(ROOT, "src/lib/fitCells.js"), "utf8").replace(/export /g, "")}</script>`;
const AUDIT = `<script>addEventListener("load", () => setTimeout(() => {
  const preview = !!document.querySelector(".docprev-paper");
  fitCells(document.body); if (!preview) { fitWidths(document); fitPages(document, window.__orient); }
  const out = [];
  document.querySelectorAll("td, th").forEach((el) => {
    const cs = getComputedStyle(el);
    if (el.textContent.trim() && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2
      && (cs.whiteSpace === "nowrap" || cs.overflow === "hidden")) out.push("cut: " + el.textContent.trim().slice(0, 60));
  });
  // On paper: nothing past the margin (a hair is allowed for a rule's own width).
  document.querySelectorAll(".jg-doc").forEach((jd) => {
    const edge = jd.getBoundingClientRect().right - Math.min(6, parseFloat(getComputedStyle(jd).paddingRight) || 0);
    jd.querySelectorAll("table").forEach((t) => { const r = t.getBoundingClientRect(); if (r.right > edge + 2) out.push("runs off the paper: a table " + Math.round(r.right - edge) + "px past the margin"); });
  });
  const p = document.querySelector(".docprev-paper");
  if (p) { let r = 0; const l = p.getBoundingClientRect().left;
    p.querySelectorAll("table, .ew, .dl, .evd, .bla").forEach((t) => { r = Math.max(r, t.getBoundingClientRect().right - l); });
    if (p.getBoundingClientRect().width - r > 60) out.push("empty band on the right: paper " + Math.round(p.getBoundingClientRect().width) + "px, content " + Math.round(r) + "px"); }
  const pre = document.createElement("pre"); pre.id = "audit"; pre.style.display = "none"; pre.textContent = out.join("\\n"); document.body.appendChild(pre);
}, 300));</script>`;

// Every paper of a sea shipment, and the purchase-order papers off an order.
const NOS = Object.keys(docs.DOC_META).filter((no) => M.docInMode(no, "water"));
const orderCtx = poCtx({ po: "PO-B", items: D.items, buyers: D.buyers, suppliers: D.suppliers, poLines: D.poLines, transports: D.transports });
// The air papers, laid out from the air demo (V-7.5.0).
const AIR_NOS = ["10", "11", "14", "16A", "17", "18", "19", "21", "22", "26A", "30", "31", "33"];
const written = [];
for (const [no, c, tag] of [...NOS.map((n) => [n, docs.isPoDoc(n) ? orderCtx : ctx, ""]), ...AIR_NOS.map((n) => [n, airCtx, "air-"])]) {
  const key = `${tag}${no}`;
  let ps;
  try { ps = parts(no, c); } catch (e) { check("Renders", `doc ${key} renders`, false, e.message); continue; }
  check("Renders", `doc ${key} renders`, ps.length && ps.every((p) => p.html && p.html.length > 200));
  const orient = ps.every((p) => p.page === "portrait") ? "portrait" : "landscape";
  fs.writeFileSync(path.join(OUT, `preview-${key}.html`), `<!doctype html><html><head><meta charset="utf-8"><title>${key} · ${docs.DOC_META[no]} — preview</title>
    <style>body{margin:0;padding:18px;background:#e8edf2} ${docs.PREVIEW_CSS} ${PAPER}</style></head>
    <body><div class="docprev docprev-paper">${html(no, c)}</div>${FIT}${AUDIT}</body></html>`);
  fs.writeFileSync(path.join(OUT, `print-${key}.html`), `<!doctype html><html><head><meta charset="utf-8"><title>${key} · ${docs.DOC_META[no]} — PDF</title>
    <style>@page { size: A4 ${orient}; margin: 0; }${PRINT}</style></head>
    <body>${ps.map((p) => `<div class="jg-doc">${p.html}</div>`).join("")}<script>window.__orient="${orient}"</script>${FIT}${AUDIT}</body></html>`);
  written.push({ no: key, doc: no, orient });
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
      if (["13", "14", "15", "16", "21", "22", "23", "24", "26", "27", "29", "air-14", "air-16A", "air-21", "air-22", "air-26A"].includes(no)) check("Layout · PDF", `doc ${no}: one A4 page`, n === 1, `${n} page(s)`);
    }
  }
}

/* ---- the Word copies -------------------------------------------------------- */
if (chrome) await wordChecks();

async function wordChecks() {
  const A = "Word";
  const { buildSync } = await import(path.join(ROOT, "node_modules/esbuild/lib/main.js"));
  const { readZip, xmlErrors } = await import("./docx-check.mjs");
  const bundle = path.join(OUT, "word-engine.js");
  buildSync({ entryPoints: [path.join(ROOT, "src/lib/download.js")], bundle: true, format: "iife", globalName: "JG", outfile: bundle, logLevel: "error" });
  // Every document in the library, not only the ones laid out above.
  const all = [...Object.keys(docs.DOC_META).map((n) => [n, docs.isPoDoc(n) ? orderCtx : ctx, ""]), ...AIR_NOS.map((n) => [n, airCtx, "air-"])];
  const jobs = [];
  for (const [no, c, tag] of all) {
    let ps = [];
    try { ps = parts(no, c); } catch { /* reported under Renders */ }
    if (ps.length) jobs.push({ key: `${tag}${no}`, no, parts: ps.map(({ html: h, page, docx }) => ({ html: h, page, docx: docx || undefined })) });
  }
  const sup = C.supplierPoDocs(orderCtx)[0], bundleOf = (nos, c) => nos.flatMap((n) => parts(n, c)).map(({ html: h, page, docx }) => ({ html: h, page, docx: docx || undefined }));
  jobs.push({ key: "one-supplier-6", no: "6", parts: [{ html: sup.html, page: sup.page }] });
  jobs.push({ key: "stage-PRE", parts: bundleOf(["12", "13", "16", "18", "19", "24", "27"], ctx) });
  /* Pictures are bytes in a typed document (34): carried over as base64. */
  const enc = (k, v) => (v instanceof Uint8Array ? { __bytes: Buffer.from(v).toString("base64") } : v);
  for (const job of jobs) {
    const page = path.join(OUT, `word-${job.key}.html`);
    fs.writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"></head><body><script src="word-engine.js"></script><script>
      const parts = JSON.parse(${JSON.stringify(JSON.stringify(job.parts, enc)).replace(/</g, "\\u003c")}, (k, v) => v && v.__bytes ? Uint8Array.from(atob(v.__bytes), (c) => c.charCodeAt(0)) : v);
      JG.wordBlob(parts).then((b) => b.arrayBuffer()).then((buf) => {
        const u = new Uint8Array(buf); let t = "";
        for (let i = 0; i < u.length; i += 8192) t += String.fromCharCode(...u.subarray(i, i + 8192));
        const p = document.createElement("pre"); p.id = "out"; p.textContent = btoa(t); document.body.replaceChildren(p);
      }).catch((e) => { const p = document.createElement("pre"); p.id = "err"; p.textContent = e.stack; document.body.replaceChildren(p); });
    </script></body></html>`);
    let dom = "";
    try {
      dom = execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", "--virtual-time-budget=8000", "--window-size=1400,1000", "--dump-dom", `file://${page}`],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60000, maxBuffer: 1 << 28 });
    } catch (e) { dom = String(e.stdout || ""); }
    fs.rmSync(page, { force: true });
    const b64 = (dom.match(/<pre id="out">([^<]*)<\/pre>/) || [])[1];
    const err = (dom.match(/<pre id="err">([\s\S]*?)<\/pre>/) || [])[1];
    check(A, `${job.key}: builds`, !!b64, err || "no file came back");
    if (!b64) continue;
    job.file = path.join(OUT, `word-${job.key}.docx`);
    fs.writeFileSync(job.file, Buffer.from(b64, "base64"));
    let files;
    try { files = readZip(fs.readFileSync(job.file)); } catch (e) { check(A, `${job.key}: the package opens`, false, e.message); continue; }
    const doc = files["word/document.xml"]?.toString("utf8") || "";
    const bad = Object.entries(files).filter(([n]) => /\.(xml|rels)$/.test(n)).flatMap(([n, d]) => xmlErrors(d.toString("utf8"), n));
    check(A, `${job.key}: the package is well formed`, !bad.length, bad.slice(0, 3).join("; "));
    const rels = files["word/_rels/document.xml.rels"]?.toString("utf8") || "";
    const missing = [...doc.matchAll(/r:embed="([^"]+)"/g)].map((m) => m[1])
      .filter((id) => { const t = (rels.match(new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`)) || [])[1]; return !t || !files[`word/${t}`]; });
    check(A, `${job.key}: every picture is carried`, !missing.length, missing.join(", "));
    /* Every word the paper prints is in the Word copy, in the same order the
       letters come — spaces aside, which the two break lines at differently. */
    const said = [...doc.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/[\s\u00a0]+/g, "").toUpperCase();
    const asked = job.parts.filter((p) => !p.docx).map((p) => p.html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(style|script|svg)[\s\S]*?<\/\1>/g, "").replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/[\s\u00a0]+/g, "").toUpperCase());
    const lost = asked.filter((t) => !said.includes(t));
    const at = (t) => { let i = 0; while (i < t.length && said.includes(t.slice(0, i + 1))) i += 1; return t.slice(Math.max(0, i - 25), i + 25); };
    check(A, `${job.key}: says everything the paper says`, !lost.length, lost.map(at).join(" | "));
  }
  /* The same number of pages as the PDF, laid out by a word processor. */
  const office = ["soffice", "libreoffice"].find((b) => { try { execFileSync("which", [b], { stdio: "ignore" }); return true; } catch { return false; } });
  const built = jobs.filter((j) => j.file);
  const counter = (() => { try { execFileSync("which", ["pdfinfo"], { stdio: "ignore" }); return true; } catch { return false; } })();
  if (!office) { console.log("LibreOffice is not installed — the Word copies' page counts were not checked."); return; }
  try {
    execFileSync(office, [`-env:UserInstallation=file://${OUT}/office`, "--headless", "--convert-to", "pdf", "--outdir", path.join(OUT, "word-pdf"), ...built.map((j) => j.file)],
      { stdio: "ignore", timeout: 300000 });
  } catch (e) { check(A, "LibreOffice opens the Word copies", false, e.message); return; }
  for (const j of built) {
    const pdf = path.join(OUT, "word-pdf", `word-${j.key}.pdf`);
    check(A, `${j.key}: opens in a word processor`, fs.existsSync(pdf));
    const same = written.find((w) => w.no === j.key);
    if (counter && same?.pages && fs.existsSync(pdf)) {
      const n = Number((execFileSync("pdfinfo", [pdf], { encoding: "utf8" }).match(/Pages:\s*(\d+)/) || [])[1]);
      check(A, `${j.key}: as many pages as the PDF`, n === same.pages, `${n} in Word, ${same.pages} in the PDF`);
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
${written.map((w) => `<a href="preview-${w.no}.html">${w.no} · ${esc(docs.DOC_META[w.doc] || "")} — preview</a>
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
