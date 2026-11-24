/* ============================================================================
   A laid-out paper → Word.

   The papers are built as HTML, and the PDF is that HTML laid out by the
   browser in the print styling. This reads the same layout back and says it in
   the blocks lib/docx.js writes: every table with its columns where the browser
   set them, its spans, rules, shading, row heights and type; every paragraph
   with its face, its indent and the space above it; every picture. So the Word
   copy is the PDF, page for page, only typed — and a paper added to the library
   has its Word copy the moment it has its print layout, with nothing further to
   write for it.

   Everything is taken off what the browser measured rather than off the
   stylesheet, which is what lets one reader serve forty papers that are each
   ruled their own way. It needs a real layout to read: the caller lays the
   paper out in an off-screen frame (lib/download.js) and hands over the
   elements. Lengths are CSS pixels until they are written — 15 twips to the
   pixel, 9525 EMU, ¾ of a point.
   ============================================================================ */

const TW = 15;
const EMU = 9525;
const MM = 96 / 25.4;
const tw = (px) => Math.round(px * TW);

/* Word's own single line, as a share of the type size, for the faces the papers
   are set in — what a CSS line-height has to be divided by to be said in Word's
   terms. A face not here is taken as Arial's. */
const SINGLE = {
  calibri: 1.2207, carlito: 1.2207, arial: 1.149, helvetica: 1.149,
  "times new roman": 1.149, times: 1.149, georgia: 1.136, centaur: 1.11,
};
const GENERIC = { serif: "Times New Roman", "sans-serif": "Arial", monospace: "Courier New" };

/* A page that overruns by less than this is brought onto its one page, as the
   PDF's fitPages does; past it the paper is genuinely several pages long. */
const SLACK = 1.3;
/* How full a page may be. Word sets its lines a hair deeper than the browser
   does and a ruled row a hair taller, and a page filled to the edge here spills
   its last line there. */
const FULL = 0.955;

/** "rgb(11, 44, 77)" → "0B2C4D"; nothing for a colour that is not there. */
export function hexOf(css) {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+)(%?))?\s*\)$/.exec(String(css || "").trim());
  if (!m) return "";
  const a = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1);
  if (a === 0) return "";
  // A tint over white paper, worked out to the solid colour it reads as.
  return [m[1], m[2], m[3]].map((v) => Math.round(255 - (255 - Number(v)) * a).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** The face a font-family list asks for first, by the name Word knows it. */
export function faceOf(family) {
  const first = String(family || "").split(",")[0].trim().replace(/^["']|["']$/g, "");
  return GENERIC[first.toLowerCase()] || first || "Calibri";
}

/** Points, to the half Word measures type in — never larger than asked, so a
 *  line that fitted its cell still does. */
export const halfPoints = (px) => Math.max(1, Math.floor(px * 0.75 * 2 + 0.15) / 2);

/** A CSS line height as Word's multiple of single spacing, in 240ths. */
export function lineOf(lineHeight, fontPx, face) {
  const lh = parseFloat(lineHeight);
  if (!Number.isFinite(lh) || !fontPx) return 240;
  const single = SINGLE[String(face).toLowerCase()] || 1.149;
  return Math.min(600, Math.max(200, Math.round((lh / (fontPx * single)) * 240)));
}

const RANK = { double: 8, solid: 7, dashed: 6, dotted: 5, ridge: 4, outset: 3, groove: 2, inset: 1 };
const WORD_LINE = { solid: "single", double: "double", dashed: "dashed", dotted: "dotted" };

/** One side of a cell as the browser computed it, or null where it draws none. */
function edgeOf(cs, side) {
  const style = cs[`border${side}Style`];
  const px = parseFloat(cs[`border${side}Width`]) || 0;
  if (!px || style === "none" || style === "hidden") return null;
  return { style, px, color: hexOf(cs[`border${side}Color`]) || "000000" };
}

/** Which of two rules meeting on one edge is drawn: the wider, then the
 *  stronger style, then the one above or to the left — as collapsed borders
 *  are settled on the page. */
export function winner(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  if (a.px !== b.px) return a.px > b.px ? a : b;
  const ra = RANK[a.style] || 0, rb = RANK[b.style] || 0;
  return rb > ra ? b : a;
}

/** A justified paragraph, a paragraph to each of its typed lines. Word spreads a
 *  line ending in a typed break across the whole measure, where the browser
 *  leaves it — so each line is made the last of its own paragraph. */
export function perLine(p) {
  if (p.align !== "both" || !p.runs.some((r) => r.text?.includes("\n"))) return [p];
  const lines = [[]];
  p.runs.forEach((r) => {
    if (r.text === undefined) { lines[lines.length - 1].push(r); return; }
    r.text.split("\n").forEach((t, i) => {
      if (i) lines.push([]);
      if (t) lines[lines.length - 1].push({ ...r, text: t });
    });
  });
  const { before, pageBreak, ...rest } = p;
  return lines.map((runs, i) => ({ ...rest, ...(i ? {} : { before, pageBreak }), runs }));
}

const wordEdge = (e) => e && {
  val: WORD_LINE[e.style] || "single",
  // Eighths of a point. A double rule's width is all three of its bands.
  sz: Math.max(2, Math.round(e.style === "double" ? (e.px / 3) * 6 : e.px * 6)),
  color: e.color,
};
const sameEdge = (a, b) => (!a && !b) || (a && b && a.style === b.style && a.px === b.px && a.color === b.color);

/** Where a set of measured edges comes down to one line each. */
export function gridLines(xs, tol = 0.75) {
  const out = [];
  [...xs].sort((a, b) => a - b).forEach((x) => { if (!out.length || x - out[out.length - 1] > tol) out.push(x); });
  return out;
}
const lineAt = (lines, x) => {
  let best = 0;
  for (let i = 1; i < lines.length; i++) if (Math.abs(lines[i] - x) < Math.abs(lines[best] - x)) best = i;
  return best;
};

/* ---- pictures ---- */

const b64 = (s) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/* The bytes behind an <img>. A PNG or JPEG travels as it is; anything else —
   a buyer's mark uploaded as WebP, GIF or SVG — is redrawn as a PNG, which is
   what every copy of Word can read. */
function makePictures() {
  const held = new Map();
  return (img) => {
    const src = img.getAttribute("src") || "";
    if (held.has(src)) return held.get(src);
    let out = null;
    const m = /^data:image\/(png|jpe?g);base64,([\s\S]+)$/i.exec(src);
    try {
      if (m) out = { data: b64(m[2].replace(/\s+/g, "")), ext: m[1].toLowerCase() === "png" ? "png" : "jpeg" };
      else if (img.complete && img.naturalWidth) {
        const c = img.ownerDocument.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        out = { data: b64(c.toDataURL("image/png").split(",")[1]), ext: "png" };
      }
    } catch (e) { out = null; }   // a picture that cannot be read is left out, as the PDF leaves it
    held.set(src, out);
    return out;
  };
}

/* ---- the reader ---- */

class Reader {
  constructor(win) {
    this.win = win;
    this.styles = new WeakMap();
    this.faces = new WeakMap();
    this.picture = makePictures();
  }

  cs(el) {
    let s = this.styles.get(el);
    if (!s) { s = this.win.getComputedStyle(el); this.styles.set(el, s); }
    return s;
  }

  hidden(el) { return this.cs(el).display === "none"; }

  isInline(node) {
    if (node.nodeType === 3) return true;
    if (node.nodeType !== 1) return false;
    const tag = node.tagName;
    if (tag === "BR" || tag === "IMG") return true;
    const cs = this.cs(node);
    if (cs.position === "absolute" || cs.float !== "none") return true;
    return /^inline/.test(cs.display) && tag !== "TABLE";
  }

  /* The face of the text standing directly in an element. */
  face(el, block) {
    let f = this.faces.get(el);
    if (!f) {
      const cs = this.cs(el);
      const px = parseFloat(cs.fontSize) || 13;
      f = {
        font: faceOf(cs.fontFamily), px,
        bold: Number(cs.fontWeight) >= 600 || cs.fontWeight === "bold",
        italic: cs.fontStyle === "italic" || cs.fontStyle === "oblique",
        color: hexOf(cs.color) || "000000",
        tracking: parseFloat(cs.letterSpacing) || 0,
        vert: cs.verticalAlign === "super" ? "super" : cs.verticalAlign === "sub" ? "sub" : "",
        white: cs.whiteSpace, casing: cs.textTransform,
        under: false,
      };
      /* An underline is drawn by the element that asks for it under everything
         inside, and is not handed down as a style, so it is looked for. */
      for (let p = el; p; p = p.parentElement) {
        if (String(this.cs(p).textDecorationLine || "").includes("underline")) { f.under = true; break; }
        if (p === block || p.tagName === "TD" || p.tagName === "TH") break;
      }
      this.faces.set(el, f);
    }
    return f;
  }

  run(f, s, extra) {
    const out = { font: f.font, size: halfPoints(f.px * s), color: f.color, ...extra };
    if (f.bold) out.bold = true;
    if (f.italic) out.italic = true;
    if (f.under) out.underline = true;
    if (f.tracking) out.spacing = f.tracking * TW * s;
    if (f.vert) out.vert = f.vert;
    return out;
  }

  rectOf(nodes) {
    const doc = this.win.document;
    const r = doc.createRange();
    r.setStartBefore(nodes[0]);
    r.setEndAfter(nodes[nodes.length - 1]);
    return r.getBoundingClientRect();
  }

  image(img, s) {
    const pic = this.picture(img);
    const r = img.getBoundingClientRect();
    if (!pic || r.width < 1 || r.height < 1) return null;
    const out = { ...pic, cx: r.width * EMU * s, cy: r.height * EMU * s };
    /* A scan trimmed on its right edge (the letterhead of 27). */
    const inset = /^inset\(\s*\S+\s+([\d.]+)%/.exec(this.cs(img).clipPath || "");
    if (inset && Number(inset[1]) > 0) {
      out.crop = Number(inset[1]) / 100;
      out.cx *= 1 - out.crop;
    }
    return out;
  }

  /* A run of inline content → { runs, tabs }. `left` is where its lines begin,
     which is what a tab stop is measured from. */
  inline(nodes, block, left, s) {
    const runs = [];
    const tabs = [];
    const floats = [];
    let space = true;           // collapsing: nothing stands before this yet
    let right = null;           // where the last thing on this line ended
    const push = (text, f) => {
      const prev = runs[runs.length - 1];
      const r = this.run(f, s, { text });
      if (prev && prev.text !== undefined && ["font", "size", "color", "bold", "italic", "underline", "spacing", "vert"].every((k) => prev[k] === r[k])) prev.text += text;
      else runs.push(r);
    };
    const tabTo = (x) => {
      const at = tw(x - left);
      if (at > 0) { tabs.push(at); runs.push({ tab: true }); space = true; }
    };

    const visit = (node) => {
      if (node.nodeType === 3) {
        const f = this.face(node.parentElement, block);
        let t = node.nodeValue;
        if (f.white === "pre-line") t = t.replace(/[ \t\r\f]+/g, " ").replace(/ ?\n ?/g, "\n");
        else if (f.white !== "pre" && f.white !== "pre-wrap" && f.white !== "break-spaces") t = t.replace(/[ \t\r\n\f]+/g, " ");
        else t = t.replace(/\r\n?/g, "\n");
        if (!/^pre($|-wrap)|break-spaces/.test(f.white) && space) t = t.replace(/^ +/, "");
        if (!t) return;
        if (f.casing === "uppercase") t = t.toUpperCase();
        else if (f.casing === "lowercase") t = t.toLowerCase();
        else if (f.casing === "capitalize") t = t.replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase());
        space = / $|\n$/.test(t);
        push(t, f);
        right = null;
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName;
      if (tag === "BR") {
        push("\n", this.face(node.parentElement, block));
        space = true; right = null;
        return;
      }
      const cs = this.cs(node);
      if (cs.display === "none" || tag === "SVG" || tag === "svg") return;
      if (tag === "IMG") {
        const im = this.image(node, s);
        if (!im) return;
        const r = node.getBoundingClientRect();
        if (cs.float !== "none" || cs.position === "absolute") { floats.push({ im, r }); return; }
        // A picture set clear of what stands before it keeps the gap.
        if (right !== null && r.left - right > 4) tabTo(r.left);
        runs.push({ image: im });
        right = r.right; space = false;
        return;
      }
      if (cs.display === "inline-block" || cs.display === "inline-flex") {
        const before = runs.length;
        [...node.childNodes].forEach(visit);
        /* A label set to a width of its own, so that what follows it lines up
           down the page: the text stops short of the box, and a tab carries the
           line to where the box ends. */
        const r = node.getBoundingClientRect();
        if (runs.length > before && node.childNodes.length) {
          const inner = this.rectOf([...node.childNodes]);
          if (r.right - inner.right > 3) tabTo(r.right);
        }
        return;
      }
      [...node.childNodes].forEach(visit);
    };
    nodes.forEach(visit);

    // The space a line ends on is not drawn, and neither is a break closing it.
    while (runs.length) {
      const last = runs[runs.length - 1];
      if (last.text === undefined) break;
      last.text = last.text.replace(/[ \t]+$/, "");
      if (last.text) break;
      runs.pop();
    }
    const end = runs[runs.length - 1];
    if (end?.text !== undefined && runs.length && /[^\n]\n$/.test(end.text)) end.text = end.text.slice(0, -1);
    return { runs, tabs, floats };
  }

  /* The paragraph a run of inline nodes makes inside `el`. `box` is the content
     box it is set in, `area` what its indents are measured against. */
  paragraph(nodes, el, box, area, s, extra = {}) {
    const cs = this.cs(el);
    const px = parseFloat(cs.fontSize) || 13;
    const face = faceOf(cs.fontFamily);
    const { runs, tabs, floats } = this.inline(nodes, el, box.left, s);
    if (!runs.length && !floats.length) return null;
    const align = /^(center|right|justify)$/.test(cs.textAlign) ? { center: "center", right: "right", justify: "both" }[cs.textAlign]
      : cs.textAlign === "end" || cs.textAlign === "-webkit-right" ? "right" : cs.textAlign === "-webkit-center" ? "center" : "";
    const pics = runs.some((r) => r.image);
    const p = {
      kind: "p", runs, font: face, size: halfPoints(px * s),
      // A line holding a picture is as deep as the picture.
      line: pics ? 240 : lineOf(cs.lineHeight, px, face),
      ...extra,
    };
    if (align) p.align = align;
    if (tabs.length) p.tabs = tabs;
    const il = tw(box.left - area.left), ir = tw(area.right - box.right);
    if (il > 20 || ir > 20) p.indent = { left: Math.max(0, il), right: Math.max(0, ir) };
    if (floats.length) p.floats = floats;
    return p;
  }

  /* An area that places its pictures by hand — the letterhead of 21, 23, 28,
     30, 33 and 40, floated over the rows their sheet floats it over. It is
     drawn once, as one picture, so no copy of Word can shift the parts. */
  composite(el, s) {
    const doc = el.ownerDocument;
    const box = el.getBoundingClientRect();
    const kids = [...el.querySelectorAll("*")].filter((k) => !this.hidden(k));
    if (box.width < 2 || box.height < 2) return null;
    const k = 3;
    const c = doc.createElement("canvas");
    c.width = Math.round(box.width * k); c.height = Math.round(box.height * k);
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    let drawn = false;
    kids.forEach((n) => {
      const r = n.getBoundingClientRect();
      const x = (r.left - box.left) * k, y = (r.top - box.top) * k;
      if (n.tagName === "IMG" && n.complete && n.naturalWidth) {
        g.drawImage(n, x, y, r.width * k, r.height * k); drawn = true;
      }
      const cs = this.cs(n);
      const t = edgeOf(cs, "Top");
      if (t && r.width > 2) {
        g.strokeStyle = `#${t.color}`; g.lineWidth = t.px * k;
        g.strokeRect(x + (t.px * k) / 2, y + (t.px * k) / 2, r.width * k - t.px * k, r.height * k - t.px * k); drawn = true;
      }
    });
    if (!drawn) return null;
    try {
      return { data: b64(c.toDataURL("image/png").split(",")[1]), ext: "png", cx: box.width * EMU * s, cy: box.height * EMU * s };
    } catch (e) { return null; }
  }

  /* The blocks an element's content makes. `st` runs down the page: `y` is
     where the last thing ended, `brk` a page break waiting for the next. */
  content(el, area, st, s) {
    const out = [];
    const cs = this.cs(el);
    const r = el.getBoundingClientRect();
    const px = (k) => parseFloat(cs[k]) || 0;
    const box = {
      left: r.left + px("borderLeftWidth") + px("paddingLeft"),
      right: r.right - px("borderRightWidth") - px("paddingRight"),
      top: r.top + px("borderTopWidth") + px("paddingTop"),
    };
    /* The gap above a block is the distance the layout left, whatever made it —
       margins, padding, a row pinned to the foot of the sheet. A very wide one
       gives a little back, so a paper that fills its page in the browser does
       not need exactly the browser's line heights to stay on it. */
    const gapTo = (top) => {
      if (st.y === null) return 0;
      const gap = Math.max(0, top - st.y) * s;
      return gap > 60 ? gap - Math.min(44, gap * 0.4) : gap;
    };
    const place = (block, top, bottom) => {
      const gap = gapTo(top);
      if (block.kind === "tbl") {
        const prev = out[out.length - 1] || st.last;
        if (st.brk) out.push({ kind: "p", size: 1, exact: 20, pageBreak: true });
        else if (gap > 1) {
          if (prev && prev.kind === "p" && !prev.spacer) prev.after = tw(gap);
          else out.push({ kind: "p", size: 1, exact: Math.max(20, tw(gap)), spacer: true });
        }
      } else if (st.brk) block.pageBreak = true;
      else if (gap > 0.5) block.before = tw(gap);
      if (st.floats && block.kind === "p" && block.runs?.length) {
        block.runs = [...st.floats.map(({ im, r: f }) => ({
          image: { ...im, float: { x: (f.left - area.left) * EMU, y: (f.top - top) * EMU * s } },
        })), ...block.runs];
        st.floats = null;
      }
      st.brk = false;
      st.y = bottom;
      st.last = block;
      out.push(block);
    };

    let group = [];
    const flush = () => {
      const nodes = group;
      group = [];
      if (!nodes.some((n) => n.nodeType !== 3 || /[^ \t\r\n\f]/.test(n.nodeValue))) return;
      const p = this.paragraph(nodes, el, box, area, s);
      if (!p) return;
      /* A mark floated beside the text hangs from the line it stands next to.
         One that comes before any text waits for the first line. */
      if (p.floats) { st.floats = [...(st.floats || []), ...p.floats]; delete p.floats; }
      if (!p.runs.length) return;
      const range = this.rectOf(nodes.filter((n) => !(n.nodeType === 1 && this.cs(n).float !== "none")));
      const rect = range.height ? range : r;
      // The line box, not the ink: type set on a deep line has space above it.
      const lh = parseFloat(cs.lineHeight);
      const fs = parseFloat(cs.fontSize) || 13;
      const lead = Number.isFinite(lh) ? Math.max(0, (lh - fs * 1.17) / 2) : 0;
      const [first, ...rest] = perLine(p);
      place(first, rect.top - lead, rect.bottom + lead);
      rest.forEach((q) => { out.push(q); st.last = q; });
    };

    [...el.childNodes].forEach((node) => {
      if (node.nodeType === 8) return;
      if (node.nodeType === 1 && this.hidden(node)) return;
      if (this.isInline(node)) { group.push(node); return; }
      if (node.nodeType !== 1) return;
      flush();
      const kcs = this.cs(node);
      const k = node.getBoundingClientRect();
      if (kcs.breakBefore === "page" || kcs.pageBreakBefore === "always" || kcs.breakBefore === "always") {
        if (st.y !== null) { st.brk = true; st.y = null; }
      }
      if (node.tagName === "TABLE") {
        const t = this.table(node, area, s);
        if (t) place(t, k.top, k.bottom);
        return;
      }
      /* A box whose children are placed by hand. */
      if (kcs.position === "relative" && [...node.children].some((c) => this.cs(c).position === "absolute")) {
        const image = this.composite(node, s);
        if (image) place({ kind: "p", runs: [{ image }], size: 1, line: 240 }, k.top, k.bottom);
        return;
      }
      /* A row of things set side by side — the signature and the stamp. */
      if (kcs.display === "flex" && kcs.flexDirection.startsWith("row") && [...node.children].every((c) => this.isInline(c) || c.tagName === "IMG")) {
        const p = this.paragraph([...node.childNodes], node, { left: k.left, right: k.right, top: k.top }, area, s);
        if (p) place(p, k.top, k.bottom);
        return;
      }
      /* A rule across the page. (Lines left blank to write on are not empty:
         they hold the space that keeps them open.) */
      const top = edgeOf(kcs, "Top");
      if (!/[^ \t\r\n\f]/.test(node.textContent) && !node.querySelector("img, table")) {
        if (top) {
          const il = tw(k.left - area.left), ir = tw(area.right - k.right);
          place({
            kind: "p", size: 1, exact: 20, rule: wordEdge(top),
            ...(il > 20 || ir > 20 ? { indent: { left: Math.max(0, il), right: Math.max(0, ir) } } : {}),
          }, k.top, k.bottom);
        }
        return;
      }
      const inner = this.content(node, area, st, s);
      out.push(...inner);
      // The block's own padding and border below its content.
      if (inner.length && st.y !== null) st.y = Math.max(st.y, Math.min(k.bottom, st.y));
    });
    flush();
    // Nothing followed for it to hang from: it stands in a line of its own.
    if (st.floats && !out.length) {
      const own = st.floats;
      st.floats = null;
      place({ kind: "p", size: 1, line: 240, runs: own.map(({ im }) => ({ image: im })) }, own[0].r.top, Math.max(...own.map(({ r: f }) => f.bottom)));
    }
    return out;
  }

  /* ---- tables ---- */

  table(tbl, area, s) {
    const trs = [...tbl.rows].filter((tr) => !this.hidden(tr) && tr.cells.length);
    if (!trs.length) return null;

    /* Where each cell falls on the columns, and the edges the browser drew
       those columns at. */
    const spots = [];
    const taken = trs.map(() => []);
    trs.forEach((tr, r) => {
      let c = 0;
      [...tr.cells].forEach((el) => {
        if (this.hidden(el)) return;
        while (taken[r][c]) c += 1;
        const across = Math.max(1, el.colSpan || 1);
        let down = Math.max(1, el.rowSpan || 1);
        down = Math.min(down, trs.length - r);
        const spot = { el, r, c, across, down, rect: el.getBoundingClientRect() };
        for (let i = 0; i < down; i++) for (let j = 0; j < across; j++) taken[r + i][c + j] = spot;
        spots.push(spot);
        c += across;
      });
    });
    if (!spots.length) return null;
    let lines = gridLines(spots.flatMap((x) => [x.rect.left, x.rect.right]));
    if (lines.length < 2) return null;
    /* Wider than the paper: set smaller until it stands inside the margins, as
       the PDF sets it (fitWidths). */
    const wide = lines[lines.length - 1] - lines[0];
    const f = Math.max(0.4, Math.min(1, (area.right - Math.max(area.left, lines[0])) / wide));
    const shrink = wide - (area.right - lines[0]) > 1.5 && f < 1 ? f : 1;
    const n = lines.length - 1;
    spots.forEach((x) => {
      x.from = lineAt(lines, x.rect.left);
      x.to = Math.max(x.from + 1, lineAt(lines, x.rect.right));
      x.to = Math.min(x.to, n);
      x.from = Math.min(x.from, x.to - 1);
    });

    /* The same cells on the measured grid: every square knows whose it is. */
    const at = trs.map(() => new Array(n).fill(null));
    spots.forEach((x) => {
      for (let i = 0; i < x.down; i++) for (let j = x.from; j < x.to; j++) if (!at[x.r + i][j]) at[x.r + i][j] = x;
    });

    this.spill(at, spots, lines);
    if (shrink < 1) {
      lines = lines.map((x) => lines[0] + (x - lines[0]) * shrink);
      s *= shrink;
    }

    spots.forEach((x) => {
      const cs = this.cs(x.el);
      x.cs = cs;
      x.edge = { top: edgeOf(cs, "Top"), left: edgeOf(cs, "Left"), bottom: edgeOf(cs, "Bottom"), right: edgeOf(cs, "Right") };
    });
    /* Which rule is drawn along each edge of each square, once the two cells
       that share it — and, round the outside, the table — have each said. */
    const tcs = this.cs(tbl);
    const frame = { top: edgeOf(tcs, "Top"), left: edgeOf(tcs, "Left"), bottom: edgeOf(tcs, "Bottom"), right: edgeOf(tcs, "Right") };
    const R = trs.length;
    const H = Array.from({ length: R + 1 }, () => new Array(n).fill(null));
    const V = Array.from({ length: R }, () => new Array(n + 1).fill(null));
    for (let r = 0; r <= R; r++) {
      for (let c = 0; c < n; c++) {
        const up = r > 0 ? at[r - 1][c] : null, dn = r < R ? at[r][c] : null;
        if (up && up === dn) continue;
        const own = winner(up?.edge.bottom, dn?.edge.top);
        H[r][c] = r === 0 ? winner(own, frame.top) : r === R ? winner(own, frame.bottom) : own;
      }
    }
    for (let r = 0; r < R; r++) {
      for (let c = 0; c <= n; c++) {
        const lf = c > 0 ? at[r][c - 1] : null, rt = c < n ? at[r][c] : null;
        if (lf && lf === rt) continue;
        const own = winner(lf?.edge.right, rt?.edge.left);
        V[r][c] = c === 0 ? winner(own, frame.left) : c === n ? winner(own, frame.right) : own;
      }
    }
    /* One rule along the whole of a side is written on it. A side ruled only in
       part is left to the cells across it, which carry their own. */
    const along = (list) => (list.every((e) => sameEdge(e, list[0])) ? list[0] : null);
    const edgesAt = (r, from, to) => {
      const e = {
        top: along(H[r].slice(from, to)), bottom: along(H[r + 1].slice(from, to)),
        left: V[r][from], right: V[r][to],
      };
      const out = {};
      Object.keys(e).forEach((k) => { if (e[k]) out[k] = wordEdge(e[k]); });
      return Object.keys(out).length ? out : undefined;
    };

    const grid = [];
    let used = 0;
    for (let c = 0; c < n; c++) {
      // Rounded on the running edge, so the widths add up to the table's own.
      const edge = tw(lines[c + 1] - lines[0]);
      grid.push(Math.max(1, edge - used));
      used += grid[c];
    }

    const rows = trs.map((tr, r) => {
      const h = tr.getBoundingClientRect().height * s;
      const cells = [];
      let inked = false;
      for (let c = 0; c < n;) {
        const x = at[r][c];
        let to = c + 1;
        if (!x) {
          while (to < n && !at[r][to]) to += 1;
          cells.push({ span: to - c, blocks: [{ kind: "p", size: 1, exact: 20 }], edges: edgesAt(r, c, to), margins: {} });
          c = to;
          continue;
        }
        while (to < n && at[r][to] === x) to += 1;
        const cell = { span: to - c, edges: edgesAt(r, c, to) };
        if (x.down > 1) cell.vmerge = r === x.r ? "start" : "on";
        const fill = this.fill(x.el, tr, tbl);
        if (fill) cell.shade = fill;
        if (r === x.r) {
          const va = x.cs.verticalAlign;
          cell.valign = va === "middle" ? "center" : va === "bottom" ? "bottom" : "top";
          const pad = (k, f = 1) => Math.max(0, tw((parseFloat(x.cs[k]) || 0) * f));
          /* Half of a rule stands inside the cell on the page; a word processor
             may take the whole of it from the room there is for the text. */
          const side = (k, rule) => Math.max(0, pad(k, shrink) - (rule ? tw(rule.px) : 8));
          cell.blocks = this.cell(x, s, h, lines, shrink);
          /* Above and below, the room is the paragraph's own rather than the
             cell's: a row's least height is counted with a cell's margins by
             one word processor and without them by another, and the height is
             measured with them in. */
          const first = cell.blocks[0], last = cell.blocks[cell.blocks.length - 1];
          const inky = cell.blocks.some((y) => y.kind === "tbl" || y.runs?.length);
          const top = pad("paddingTop", s), bottom = pad("paddingBottom", s);
          if (inky) {
            inked = true;
            if (first.kind === "p") first.before = (first.before || 0) + top;
            if (last.kind === "p") last.after = (last.after || 0) + bottom;
          }
          cell.margins = {
            top: inky && first.kind === "tbl" ? top : 0, bottom: inky && last.kind === "tbl" ? bottom : 0,
            left: side("paddingLeft", x.edge.left), right: side("paddingRight", x.edge.right),
          };
        } else {
          cell.margins = {};
          cell.blocks = [{ kind: "p", size: 1, exact: 20 }];
        }
        cells.push(cell);
        c = to;
      }
      /* The measured depth has the rules in it — half of the one above and half
         of the one below — and a word processor adds them on. */
      const ruled = (list) => Math.max(0, ...list.map((e) => e?.px || 0));
      const ink = (ruled(H[r]) + ruled(H[r + 1])) / 2;
      const row = { cells, whole: true, height: Math.max(15, tw(h - ink)) };
      // A row that is only space is kept to the depth it was given.
      if (!inked && h < 12) row.fixed = true;
      if (tr.parentElement.tagName === "THEAD") row.header = true;
      return row;
    });
    // Only an unbroken run of rows at the head can be repeated.
    let heading = true;
    rows.forEach((row) => { if (!row.header) heading = false; else if (!heading) delete row.header; });

    return { kind: "tbl", grid, rows, borders: "none", indent: tw(lines[0] - area.left) };
  }

  fill(td, tr, tbl) {
    for (const el of [td, tr, tr.parentElement, tbl]) {
      const bg = hexOf(this.cs(el).backgroundColor);
      if (bg) return bg === "FFFFFF" ? "" : bg;
    }
    return "";
  }

  /* A line that may not wrap and is wider than its cell runs on over the white
     beside it, as it does on the sheet. Word would turn it, so the empty cells
     it runs over are given to it. */
  spill(at, spots, lines) {
    spots.forEach((x) => {
      const cs = this.cs(x.el);
      if (cs.whiteSpace !== "nowrap" && cs.whiteSpace !== "pre") return;
      if (cs.overflowX === "hidden" || x.down > 1 || !x.el.textContent.trim()) return;
      let over = this.rectOf([...x.el.childNodes]).right - (lines[x.to] - (parseFloat(cs.paddingRight) || 0));
      while (over > 0.5 && x.to < lines.length - 1) {
        const next = at[x.r][x.to];
        if (next) {
          if (next.down > 1 || next.el.textContent.trim() || next.el.querySelector("img, table") || next.from !== x.to) break;
          const ncs = this.cs(next.el);
          if (edgeOf(ncs, "Left") || edgeOf(cs, "Right") || hexOf(ncs.backgroundColor)) break;
          x.lent = [...(x.lent || []), next.el];
          for (let j = next.from; j < next.to; j++) at[x.r][j] = x;
          next.gone = true;
          over -= lines[next.to] - lines[next.from];
          x.to = next.to;
        } else {
          at[x.r][x.to] = x;
          over -= lines[x.to + 1] - lines[x.to];
          x.to += 1;
        }
      }
    });
  }

  cell(x, s, h, lines, shrink) {
    const { el, cs } = x;
    const px = (k) => parseFloat(cs[k]) || 0;
    const left = x.rect.left + px("borderLeftWidth") / 2 + px("paddingLeft");
    const right = x.rect.right - px("borderRightWidth") / 2 - px("paddingRight");
    const st = { y: null, brk: false, last: null };
    const blocks = this.content(el, { left, right }, st, s);
    blocks.forEach((b) => { if (b.kind === "p" && b.indent && b.indent.left <= 40 && b.indent.right <= 40) delete b.indent; });
    if (!blocks.length) {
      // Empty, but still a line of the cell's own type to be written on.
      const size = halfPoints(Math.min(px("fontSize") * s, Math.max(1.4, (h - 2) / 1.3)));
      return [{ kind: "p", font: faceOf(cs.fontFamily), size }];
    }
    this.snug(el, blocks, (lines[x.to] - lines[x.from]) / shrink - px("paddingLeft") - px("paddingRight"), cs);
    return blocks;
  }

  /* One line that only just fits its cell is set a hair narrower: Word's letters
     fall a fraction off the browser's, and a code or a figure turned onto a
     second line would push the whole row down. */
  snug(el, blocks, room, cs) {
    const flat = blocks.filter((b) => b.kind === "p" && b.runs?.some((r) => r.text !== undefined));
    if (flat.length !== blocks.length || !flat.length) return;
    const held = cs.whiteSpace === "nowrap" || cs.whiteSpace === "pre";
    const ink = this.rectOf([...el.childNodes]);
    const lines = flat.reduce((n, b) => n + 1 + b.runs.reduce((m, r) => m + (String(r.text || "").match(/\n/g) || []).length, 0), 0);
    const lh = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 13) * 1.25;
    if (!held && ink.height > lh * (lines + 0.6)) return;   // it already turns
    if (room <= 0 || ink.width <= room * 0.97) return;
    const scale = Math.max(50, Math.floor((room * 0.965 / ink.width) * 100));
    flat.forEach((b) => b.runs.forEach((r) => { if (r.text !== undefined) r.scale = scale; }));
  }

  /* ---- a whole paper ---- */

  section(jg, orientation) {
    const portrait = orientation === "portrait";
    const pageW = (portrait ? 210 : 297) * MM, pageH = (portrait ? 297 : 210) * MM;
    const pads = (el) => {
      const cs = this.cs(el);
      return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    };
    const r = jg.getBoundingClientRect();
    const kids = [...jg.children].filter((k) => !this.hidden(k));
    /* A paper that takes the whole sheet sets its margins on its own pages. */
    let p = pads(jg);
    const own = !p.left && kids.length > 0 && kids.every((k) => k.tagName !== "TABLE" && pads(k).left > 0);
    if (own) p = pads(kids[0]);
    const area = { left: r.left + p.left, right: r.left + pageW - p.right };

    /* Each page's depth, to find what it has to be set at to stay a page. */
    const pages = [];
    let run = null;
    kids.forEach((k) => {
      const b = k.getBoundingClientRect();
      const cs = this.cs(k);
      const breaks = cs.breakBefore === "page" || cs.pageBreakBefore === "always";
      // The inset a page opens on is the page's own margin in Word.
      if (!run || breaks) { run = { top: b.top + (own ? 0 : parseFloat(cs.paddingTop) || 0), bottom: b.bottom }; pages.push(run); } else run.bottom = Math.max(run.bottom, b.bottom);
    });
    const depth = (q) => q.bottom - q.top + (own ? 0 : p.top + p.bottom);
    /* A sheet laid out to fill its page (the declarations) is only as deep as
       what stands on it: the space it opens between is what gives. */
    const filled = (k) => kids.length === 1 && this.cs(k).display === "flex";
    const worst = Math.max(0, ...pages.map(depth).filter((d) => d <= pageH * SLACK));
    const s = worst > pageH * FULL && !(kids[0] && filled(kids[0]) && worst <= pageH) ? (pageH * FULL) / worst : 1;

    const st = { y: null, brk: false, last: null };
    let blocks;
    if (own) {
      blocks = [];
      kids.forEach((k, i) => {
        if (i) { st.brk = true; st.y = null; }
        blocks.push(...this.content(k, area, st, s));
      });
    } else blocks = this.content(jg, area, st, s);

    // Nothing in the foot of the page but the paper's edge: room for drift.
    const bottom = Math.min(p.bottom, 6 * MM);
    return {
      blocks, measured: true, font: { name: "Calibri", size: 10 },
      page: {
        w: tw(pageW), h: tw(pageH), landscape: !portrait,
        top: tw(p.top * s), right: tw(p.right), bottom: tw(bottom), left: tw(p.left),
      },
    };
  }
}

/** The sections of a Word document, read off laid-out papers.
 *  `papers` is [{ el, orientation }] or [{ docx }] for one typed already. */
export function readSections(papers, win) {
  const reader = new Reader(win);
  return papers.flatMap((p) => {
    if (p.docx) return p.docx.sections || [{ blocks: p.docx.blocks, page: p.docx.page, font: p.docx.font }];
    const sec = reader.section(p.el, p.orientation);
    return sec.blocks.length ? [sec] : [];
  });
}
