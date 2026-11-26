/* A PDF made in the browser, saved straight to Downloads — no print dialog
   (V-7.9.0).

   The papers are laid out exactly as the print path lays them out: the same
   off-screen frame, the same print styles, the same fitting (fitCells /
   fitWidths / fitPages). Then, instead of handing the frame to the print
   engine, this

     1. cuts the layout into A4 pages the way the print engine does — a new
        page wherever the styles ask for one (each document, each sheet of a
        multi-sheet paper), and between table rows where a long table runs on,
        with the table's heading row repeated at the head of the next page;
     2. draws each page through the browser's own renderer (the document as
        an SVG <foreignObject>, onto a canvas at print resolution), so what is
        on the paper is what the browser draws — fonts, rules, stamps and all;
     3. lays the text over each page, invisible, where the browser set it, so
        the PDF can be searched and its figures copied;
     4. writes a plain PDF 1.4 file — one picture and one text layer a page.

   Nothing leaves the machine and no library ships with it. A browser that
   cannot do one of these steps throws, and the caller falls back to the
   print dialog. */
import { fitCells, fitPages, fitWidths } from "./fitCells.js";

const PX = 96 / 25.4;            // CSS px per mm
const PT = 72 / 96;              // PDF points per CSS px
const A4 = { w: 210, h: 297 };

const isPage = (v) => v === "page" || v === "always" || v === "left" || v === "right" || v === "recto" || v === "verso";
const isAvoid = (v) => v === "avoid" || v === "avoid-page";
const SKIP = new Set(["TD", "TH", "SPAN", "B", "I", "U", "EM", "STRONG", "BR", "IMG", "SUP", "SUB", "SMALL", "FONT", "A", "LABEL", "S"]);
const BLOCKISH = new Set(["block", "flex", "grid", "list-item", "table", "flow-root"]);

/* ---- 1 · the layout --------------------------------------------------------- */
async function layOut(bodyHtml, css, widthPx, orientation) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${widthPx}px;height:1200px;opacity:0;border:0;pointer-events:none;`;
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${bodyHtml}</body></html>`);
  doc.close();
  const pending = [...doc.images].filter((i) => !i.complete);
  await Promise.race([
    Promise.all([
      new Promise((r) => setTimeout(r, 120)),
      ...pending.map((i) => new Promise((r) => { i.addEventListener("load", r, { once: true }); i.addEventListener("error", r, { once: true }); })),
    ]),
    new Promise((r) => setTimeout(r, 2000)),
  ]);
  try {
    fitCells(doc.body);
    fitWidths(doc);
    fitPages(doc, orientation);
  } catch (e) { /* drawn as laid out */ }
  return frame;
}

/* ---- 2 · the pages ---------------------------------------------------------- */
function paginate(doc, pageH) {
  const win = doc.defaultView;
  const sy = win.scrollY || 0;
  const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top + sy, bottom: r.bottom + sy }; };
  /* Measured to the fraction: a sheet set to fill its page exactly reads as
     1123 px rounded, a hair over the 1122.5 px of an A4 page. */
  const docH = Math.max(box(doc.body).bottom, ...[...doc.body.children].map((el) => box(el).bottom));

  // Where the styles start a new page, and the block edges a long run may break at.
  const starts = [0];
  const blocks = [];
  for (const el of doc.body.querySelectorAll("*")) {
    if (SKIP.has(el.tagName) || el.tagName === "TR" || el.tagName === "TBODY" || el.tagName === "THEAD") continue;
    const cs = win.getComputedStyle(el);
    if (cs.display === "none") continue;
    const b = box(el);
    if (isPage(cs.breakBefore) || isPage(cs.pageBreakBefore)) starts.push(b.top);
    if (isPage(cs.breakAfter) || isPage(cs.pageBreakAfter)) starts.push(b.bottom);
    if (BLOCKISH.has(cs.display) && !el.closest("td, th")) blocks.push(b.top);
  }
  const cuts = [...new Set(starts.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);

  // The rows of every table, outermost first at a tie, and the heads that repeat.
  const rows = [...doc.body.querySelectorAll("tr")].map((tr) => {
    const b = box(tr);
    const cs = win.getComputedStyle(tr);
    return { tr, top: b.top, bottom: b.bottom, avoidAfter: isAvoid(cs.breakAfter) || isAvoid(cs.pageBreakAfter) };
  }).filter((r) => r.bottom > r.top);
  rows.sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  const heads = [...doc.body.querySelectorAll("table")].map((t) => {
    const th = [...t.children].find((c) => c.tagName === "THEAD");
    if (!th || win.getComputedStyle(th).display !== "table-header-group") return null;
    const tb = box(t), hb = box(th);
    return hb.bottom > hb.top ? { top: tb.top, bottom: tb.bottom, y0: hb.top, y1: hb.bottom } : null;
  }).filter(Boolean);

  // The inset of the document a run belongs to: a continued page keeps it.
  const docs = [...doc.querySelectorAll(".jg-doc")].map((el) => {
    const cs = win.getComputedStyle(el);
    return { ...box(el), padT: parseFloat(cs.paddingTop) || 0, padB: parseFloat(cs.paddingBottom) || 0 };
  });
  const inset = (y) => docs.find((d) => y >= d.top - 0.5 && y < d.bottom) || { padT: 0, padB: 0 };

  const spanning = (c) => rows.filter((r) => r.top < c - 0.5 && r.bottom > c + 0.5);
  /* A break at `c` is clean when it splits no row that could have stayed
     whole on a page, leaves no row marked keep-with-next behind it, and does
     not strand a table's heading row at the foot of a page. */
  const clean = (c, y, room) => {
    if (spanning(c).some((r) => r.top > y + 0.5 && r.bottom - r.top <= room)) return false;
    const before = rows.filter((r) => Math.abs(r.bottom - c) < 0.75);
    if (before.some((r) => r.avoidAfter)) return false;
    if (heads.some((h) => h.top > y + 0.5 && Math.abs(h.y1 - c) < 0.75)) return false;
    return true;
  };
  let lineTops = null;
  const lines = () => {
    if (lineTops) return lineTops;
    const out = [];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const range = doc.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) out.push(r.top + sy);
    }
    lineTops = [...new Set(out.map((v) => Math.round(v)))].sort((a, b) => a - b);
    return lineTops;
  };
  const candidates = [...new Set([...rows.map((r) => r.top), ...blocks].map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);

  const cut = (y, limit, room) => {
    const lo = y + 24;
    for (let i = candidates.length - 1; i >= 0; i--) {
      const c = candidates[i];
      if (c > limit) continue;
      if (c <= lo) break;
      if (clean(c, y, room)) return c;
    }
    const ls = lines();
    for (let i = ls.length - 1; i >= 0; i--) {
      const c = ls[i] - 1;
      if (c > limit) continue;
      if (c <= lo) break;
      return c;
    }
    return limit;
  };
  // The heading rows to repeat over a page that continues a table at `c`.
  const headsAt = (c) => heads
    .filter((h) => h.y1 <= c + 0.75 && h.bottom > c + 0.75 && rows.some((r) => r.top >= c - 0.75 && r.top < h.bottom))
    .sort((a, b) => a.top - b.top)
    .map((h) => ({ y0: h.y0, h: h.y1 - h.y0 }));

  const pages = [];
  for (let s = 0; s < cuts.length; s++) {
    const from = cuts[s];
    const to = s + 1 < cuts.length ? cuts[s + 1] : docH;
    if (to - from < 1) continue;
    const { padT, padB } = inset(from);
    let y = from;
    let first = true;
    for (let guard = 0; y < to - 0.5 && guard < 500; guard++) {
      const dy = first ? 0 : padT;
      const repeat = first ? [] : headsAt(y);
      const headH = repeat.reduce((t, h) => t + h.h, 0);
      const avail = pageH - dy - headH;
      const pieces = [];
      let at = dy;
      repeat.forEach((h) => { pieces.push({ y0: h.y0, h: h.h, dy: at }); at += h.h; });
      // A few pixels of white over the foot are not worth a page of their own.
      if (to - y <= avail + 3) {
        pieces.push({ y0: y, h: Math.min(to - y, avail), dy: at });
        pages.push({ pieces });
        break;
      }
      const room = avail - padB;
      const c = cut(y, y + room, room);
      pieces.push({ y0: y, h: c - y, dy: at });
      pages.push({ pieces });
      y = c;
      first = false;
    }
  }
  return { pages, docH };
}

/* ---- 3 · the text, where the browser set it --------------------------------- */
function textRuns(doc) {
  const win = doc.defaultView;
  const sy = win.scrollY || 0;
  const out = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue;
    if (!text || !text.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest("style, script")) continue;
    let run = null;
    const flush = () => { if (run) out.push(run); run = null; };
    const add = (word, r, glue) => {
      const top = r.top + sy, bottom = r.bottom + sy;
      if (run && Math.abs(run.top - top) < 2 && r.left >= run.right - 1) {
        run.text += glue ? word : ` ${word}`;
        run.right = r.right;
        run.bottom = Math.max(run.bottom, bottom);
      } else {
        flush();
        run = { text: word, left: r.left, right: r.right, top, bottom };
      }
    };
    const re = /\S+/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      range.setStart(n, m.index);
      range.setEnd(n, m.index + m[0].length);
      const rects = range.getClientRects();
      if (rects.length <= 1) {
        const r = range.getBoundingClientRect();
        if (r.width && r.height) add(m[0], r, false);
        continue;
      }
      /* A word the layout broke over two lines ("Gross/" "Box"): set it a
         letter at a time, so each line carries its own part. */
      let first = true;
      for (let i = 0; i < m[0].length; i++) {
        range.setStart(n, m.index + i);
        range.setEnd(n, m.index + i + 1);
        const r = range.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        add(m[0][i], r, !first);
        first = false;
      }
    }
    flush();
  }
  return out;
}

/* ---- 4 · drawing ------------------------------------------------------------ */
async function inlineImages(root, srcDoc) {
  const imgs = [...root.querySelectorAll("img")];
  await Promise.all(imgs.map(async (img) => {
    const src = img.getAttribute("src") || "";
    if (!src || src.startsWith("data:")) return;
    try {
      const blob = await (await fetch(new URL(src, srcDoc.baseURI).href)).blob();
      const url = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
      img.setAttribute("src", url);
    } catch (e) {
      img.removeAttribute("src");
    }
  }));
}

function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("The page could not be drawn"));
    img.src = url;
  });
}

async function pngBytes(canvas) {
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("The page could not be encoded");
  return new Uint8Array(await blob.arrayBuffer());
}

/* A PNG's own compressed pixels, ready for PDF's /FlateDecode with the PNG
   predictor — no re-encoding. Only an 8-bit RGB, non-interlaced PNG qualifies
   (what a canvas without alpha writes); anything else returns null. */
function pngToFlate(png) {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  if (dv.getUint32(0) !== 0x89504e47) return null;
  let p = 8;
  let w = 0, h = 0, ok = false;
  const parts = [];
  while (p + 8 <= png.length) {
    const len = dv.getUint32(p);
    const type = String.fromCharCode(png[p + 4], png[p + 5], png[p + 6], png[p + 7]);
    const data = png.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      w = dv.getUint32(p + 8); h = dv.getUint32(p + 12);
      ok = data[8] === 8 && data[9] === 2 && data[12] === 0;
    } else if (type === "IDAT") parts.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  if (!ok || !parts.length) return null;
  const size = parts.reduce((t, d) => t + d.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  parts.forEach((d) => { out.set(d, at); at += d.length; });
  return { w, h, data: out };
}

/* The fallback for a browser whose canvas writes RGBA: the pixels by hand,
   each row filtered "Up" and deflated by the browser's own compressor. */
async function rawToFlate(canvas) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  const px = ctx.getImageData(0, 0, w, h).data;
  const row = w * 3 + 1;
  const raw = new Uint8Array(row * h);
  for (let y = 0; y < h; y++) {
    const o = y * row, p = y * w * 4, q = p - w * 4;
    raw[o] = 2;
    for (let x = 0; x < w; x++) {
      for (let k = 0; k < 3; k++) {
        const v = px[p + x * 4 + k];
        raw[o + 1 + x * 3 + k] = y ? (v - px[q + x * 4 + k]) & 255 : v;
      }
    }
  }
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"));
  return { w, h, data: new Uint8Array(await new Response(stream).arrayBuffer()) };
}

/* ---- 5 · the file ------------------------------------------------------------ */
const enc = new TextEncoder();

/* WinAnsi for the invisible text layer; what it cannot hold is spelled out. */
const WIN = { "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f };
function pdfText(s) {
  let out = "(";
  for (const ch of String(s).replace(/₹/g, "Rs.").replace(/[   ]/g, " ")) {
    let c = ch.codePointAt(0);
    if (WIN[ch]) c = WIN[ch];
    else if (c > 255 || (c < 32)) c = 63;
    if (c === 40 || c === 41 || c === 92) out += `\\${ch}`;
    else if (c < 127) out += String.fromCharCode(c);
    else out += `\\${c.toString(8).padStart(3, "0")}`;
  }
  return `${out})`;
}
function pdfTitle(s) {
  let hex = "FEFF";
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c > 0xffff) {
      const v = c - 0x10000;
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, "0") + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, "0");
    } else hex += c.toString(16).padStart(4, "0");
  }
  return `<${hex.toUpperCase()}>`;
}
const f2 = (n) => (Math.round(n * 100) / 100).toString();

function writePdf({ title, pages, pageW, pageH }) {
  const chunks = [];
  const offsets = [];
  let size = 0;
  const put = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; chunks.push(b); size += b.length; };
  const obj = (n, body, stream) => {
    offsets[n] = size;
    put(`${n} 0 obj\n`);
    if (stream) {
      put(`${body}\nstream\n`);
      put(stream);
      put("\nendstream\nendobj\n");
    } else put(`${body}\nendobj\n`);
  };
  put("%PDF-1.4\n%âãÏÓ\n".replace(/[\u0080-ÿ]/g, (c) => c));
  // 1 catalog · 2 pages · 3 font · 4 info · then three objects a page
  const kids = pages.map((_, i) => `${5 + i * 3} 0 R`).join(" ");
  obj(1, "<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /DisplayDocTitle true >> >>");
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  obj(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, "0");
  const stamp = `D:${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  obj(4, `<< /Title ${pdfTitle(title)} /Producer (Jaikvin Global Export System) /Creator (Jaikvin Global Export System) /CreationDate (${stamp}) >>`);
  const W = pageW * PT, H = pageH * PT;
  pages.forEach((pg, i) => {
    const n = 5 + i * 3;
    const ops = [`q ${f2(W)} 0 0 ${f2(H)} 0 0 cm /Im0 Do Q`];
    if (pg.text.length) {
      ops.push("BT 3 Tr");
      pg.text.forEach((t) => {
        const h = Math.max(1, t.bottom - t.top);
        const fs = Math.max(1, h * PT * 0.8);
        const est = t.text.length * 0.5 * fs;
        const tz = Math.min(1000, Math.max(10, ((t.right - t.left) * PT / est) * 100));
        ops.push(`/F1 ${f2(fs)} Tf ${f2(tz)} Tz 1 0 0 1 ${f2(t.left * PT)} ${f2(H - (t.bottom - h * 0.22) * PT)} Tm ${pdfText(t.text)} Tj`);
      });
      ops.push("ET");
    }
    const content = enc.encode(ops.join("\n"));
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f2(W)} ${f2(H)}] /Resources << /XObject << /Im0 ${n + 1} 0 R >> /Font << /F1 3 0 R >> >> /Contents ${n + 2} 0 R >>`);
    const im = pg.image;
    obj(n + 1, `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${im.w} >> /Length ${im.data.length} >>`, im.data);
    obj(n + 2, `<< /Length ${content.length} >>`, content);
  });
  const count = 5 + pages.length * 3;
  const xref = size;
  put(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) put(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  put(`trailer\n<< /Size ${count} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: "application/pdf" });
}

/* ---- all together ------------------------------------------------------------ */
/**
 * The PDF of one or more papers, as a Blob.
 * `bodyHtml` — the papers, each in its `.jg-doc`; `css` — the print styles;
 * `orientation` — "portrait" or "landscape"; `title` — the file's own title.
 * `onPage(i, n)` is told as each page is drawn.
 */
export async function buildPdf({ bodyHtml, css, orientation, title, scale, onPage }) {
  const portrait = orientation === "portrait";
  const pageW = (portrait ? A4.w : A4.h) * PX;
  const pageH = (portrait ? A4.h : A4.w) * PX;
  const width = Math.round(pageW);
  const frame = await layOut(bodyHtml, css, width, portrait ? "portrait" : "landscape");
  try {
    const doc = frame.contentWindow.document;
    const { pages, docH } = paginate(doc, pageH);
    if (!pages.length) throw new Error("Nothing to print");
    const runs = textRuns(doc);

    const clone = doc.documentElement.cloneNode(true);
    clone.querySelectorAll("script").forEach((s) => s.remove());
    await inlineImages(clone, doc);
    const xhtml = new XMLSerializer().serializeToString(clone);

    const s = scale || (pages.length > 30 ? 1.75 : pages.length > 12 ? 2.25 : 2.75);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(pageW * s);
    canvas.height = Math.round(pageH * s);
    const ctx = canvas.getContext("2d", { alpha: false });
    const cache = new Map();
    const piece = async (y0, h) => {
      const key = `${y0}|${h}`;
      if (cache.has(key)) return cache.get(key);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * s}" height="${h * s}" viewBox="0 ${y0} ${width} ${h}">`
        + `<foreignObject x="0" y="0" width="${width}" height="${Math.ceil(docH) + 4}">${xhtml}</foreignObject></svg>`;
      /* A data: URL, not a blob: one — a blob URL's SVG taints the canvas in
         some browsers (and from file://), and a tainted canvas cannot be read. */
      const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      if (img.decode) await img.decode().catch(() => {});
      cache.set(key, img);
      return img;
    };

    const out = [];
    for (let i = 0; i < pages.length; i++) {
      onPage?.(i, pages.length);
      const pg = pages[i];
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const pc of pg.pieces) {
        const img = await piece(pc.y0, pc.h);
        ctx.drawImage(img, 0, pc.dy * s, width * s, pc.h * s);
      }
      const png = await pngBytes(canvas);
      const image = pngToFlate(png) || await rawToFlate(canvas);
      const text = [];
      pg.pieces.forEach((pc) => {
        runs.forEach((r) => {
          const mid = (r.top + r.bottom) / 2;
          if (mid >= pc.y0 && mid < pc.y0 + pc.h) {
            const shift = pc.dy - pc.y0;
            text.push({ ...r, top: r.top + shift, bottom: r.bottom + shift });
          }
        });
      });
      out.push({ image, text });
      // A header kept for the next page; the body of this one is not needed again.
      for (const [k] of cache) if (!pages[i + 1]?.pieces.some((p) => `${p.y0}|${p.h}` === k)) cache.delete(k);
    }
    return writePdf({ title, pages: out, pageW, pageH });
  } finally {
    frame.remove();
  }
}

/** How many pages a set of papers comes to, without drawing them — for checks. */
export async function countPdfPages({ bodyHtml, css, orientation }) {
  const portrait = orientation === "portrait";
  const pageW = (portrait ? A4.w : A4.h) * PX;
  const pageH = (portrait ? A4.h : A4.w) * PX;
  const frame = await layOut(bodyHtml, css, Math.round(pageW), portrait ? "portrait" : "landscape");
  try {
    return paginate(frame.contentWindow.document, pageH).pages.length;
  } finally {
    frame.remove();
  }
}
