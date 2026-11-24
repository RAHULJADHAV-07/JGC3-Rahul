/* ============================================================================
   A real .docx writer, with no dependencies.

   Two of the client's papers are Word documents to begin with — the annexure
   that staples to the bill of lading (24), and the container weight
   declaration (34) — and are typed out here block by block. Every other paper
   is read off its print layout by lib/htmlDocx.js, which hands over the same
   kind of blocks.

   A document is a plain object:

     { blocks, page, font } ........... one run of pages, or
     { sections: [{ blocks, page, font }, …] } .. several, each on its own paper

   `blocks` is an array of:

     { kind: "p", ... } ....... a paragraph
     { kind: "tbl", ... } ..... a ruled table

   A paragraph is `{ text, align?, bold?, underline?, size?, color?, image? }`,
   or `{ runs: [...] }` when one line changes face part-way along. A run is
   `{ text, bold?, italic?, underline?, size?, color?, font?, spacing?, scale?,
   vert? }`, `{ tab: true }` or `{ image }`. `size` is in points, `color` a bare
   RRGGBB, `spacing` between letters in twips, `scale` the width of the letters
   in percent; all default to the document's own. A paragraph also takes
   `before` / `after` (twips), `line` (240 = single), `exact` (a line height in
   twips), `indent` { left, right }, `tabs` [twips], `rule` (a border along its
   top), `keepNext` and `pageBreak`.

   A table is `{ grid, rows, borders?, indent? }`. `grid` is the column widths
   in twips (1440 to the inch, as Word states them) and `rows` an array of rows.
   A row is an array of cells, or `{ cells, height?, header?, whole? }` — height
   in twips, `header` repeats it at the head of each page, `whole` keeps it on
   one. A cell is either

     [text] | [text, span] ......... plain, as most of them are, or
     { text | runs | paras | blocks, span?, align?, valign?, bold?, size?,
       color?, shade?, edges?, margins?, vmerge? }

   when it has a face of its own. `edges` is { top, left, bottom, right }, each
   { val, sz, color }; `margins` the same four in twips; `vmerge` "start" or
   "on" for a cell that runs down several rows. `borders` on the table is "word"
   — dotted between one line and the next, solid down between the columns, solid
   under the last, nothing around the outside, which is how Word rules the
   annexure — or "box", every cell ruled all round, which is how the
   declaration's forwarder rules theirs, or "none", where the cells say.

   `page` is `{ w, h, top, bottom, left, right, landscape? }` in twips. A form
   ruled on a grid wider than a typed letter's measure needs its margins
   narrowed to it, or Word puts the overflow on a page of its own.

   `image` is `{ data, cx, cy, ext?, crop?, float? }` — the bytes and the size
   in EMU (914400 to the inch), as lib/logo.js hands them over; `crop` the share
   cut off its right edge, `float` { x, y } in EMU for a mark that stands beside
   the text of its paragraph rather than in the line.
   ============================================================================ */
import { X, utf8, zipBlob, zipBlobPacked } from "./zip.js";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
  + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
  + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';

/* Word measures type in half-points, and a paragraph's own run properties have
   to be repeated on the paragraph mark as well or the line spacing jumps. The
   order the properties stand in is the schema's, which Word holds a file to. */
const runPr = (f, r = {}) => {
  const sz = Math.max(2, Math.round((r.size || f.size) * 2));
  const name = X(r.font || f.name);
  return `<w:rPr><w:rFonts w:ascii="${name}" w:hAnsi="${name}" w:cs="${name}"/>`
    + `${r.bold ? "<w:b/>" : ""}${r.italic ? "<w:i/>" : ""}`
    + `${r.color ? `<w:color w:val="${X(String(r.color).replace("#", ""))}"/>` : ""}`
    + `${r.spacing ? `<w:spacing w:val="${Math.round(r.spacing)}"/>` : ""}`
    + `${r.scale && r.scale !== 100 ? `<w:w w:val="${Math.round(r.scale)}"/>` : ""}`
    + `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`
    + `${r.underline ? '<w:u w:val="single"/>' : ""}`
    + `${r.vert ? `<w:vertAlign w:val="${r.vert === "sub" ? "subscript" : "superscript"}"/>` : ""}</w:rPr>`;
};

/* One run. A newline inside it is a line break, which Word will not take from
   the text itself — each line is set as its own piece with a break before it. */
const run = (f, r) => {
  if (!r) return "";
  if (r.image) return drawing(r.image);
  if (r.tab) return `<w:r>${runPr(f, r)}<w:tab/></w:r>`;
  if (!r.text) return "";
  const lines = String(r.text).split("\n");
  return `<w:r>${runPr(f, r)}${lines
    .map((l, i) => `${i ? "<w:br/>" : ""}${l ? `<w:t xml:space="preserve">${X(l)}</w:t>` : ""}`).join("")}</w:r>`;
};

/* A picture — in the line, or floated beside the text. Word wants the same size
   stated twice: once for the space it takes, once for the picture drawn into it.

   The pictures a build collects are gathered here and emptied at the start of
   each one: writing the body is what finds them, and the package cannot be
   sealed until it knows what it is carrying. Writing the body is synchronous,
   so a build always finishes before the next begins. A picture used twice — the
   mark on every paper of a bundle — is carried once. */
let imgSeq = 0;
let media = [];
function drawing(img) {
  let id = media.findIndex((m) => m.data === img.data);
  if (id < 0) { id = media.length; media.push(img); }
  const rid = `rIdImg${id}`;
  const n = ++imgSeq;
  const cx = Math.max(1, Math.round(img.cx)), cy = Math.max(1, Math.round(img.cy));
  const src = img.crop ? `<a:srcRect r="${Math.round(img.crop * 100000)}"/>` : "";
  const doc = `<wp:docPr id="${1000 + n}" name="Picture ${n}"/>`
    + `<wp:cNvGraphicFramePr/>`
    + `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">`
    + `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:nvPicPr><pic:cNvPr id="${1000 + n}" name="image${id}.${img.ext || "png"}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rid}"/>${src}<a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + `</pic:pic></a:graphicData></a:graphic>`;
  if (img.float) {
    return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${1000 + n}"`
      + ` behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>`
      + `<wp:positionH relativeFrom="column"><wp:posOffset>${Math.round(img.float.x)}</wp:posOffset></wp:positionH>`
      + `<wp:positionV relativeFrom="paragraph"><wp:posOffset>${Math.round(img.float.y)}</wp:posOffset></wp:positionV>`
      + `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>${doc}</wp:anchor></w:drawing></w:r>`;
  }
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">`
    + `<wp:extent cx="${cx}" cy="${cy}"/>${doc}</wp:inline></w:drawing></w:r>`;
}

const para = (f, b = {}) => {
  const runs = b.runs ? b.runs : [b];
  const body = runs.map((r) => run(f, r)).join("");
  const ind = b.indent && (b.indent.left || b.indent.right)
    ? `<w:ind w:left="${Math.round(b.indent.left || 0)}" w:right="${Math.round(b.indent.right || 0)}"/>` : "";
  const spacing = `<w:spacing${b.before ? ` w:before="${Math.round(b.before)}"` : ""} w:after="${Math.round(b.after || 0)}"`
    + (b.exact ? ` w:line="${Math.max(1, Math.round(b.exact))}" w:lineRule="exact"/>` : ` w:line="${Math.round(b.line || 240)}" w:lineRule="auto"/>`);
  /* The mark at the end of the paragraph carries the first run's face, so an
     empty line after a small one does not open up to the document's own size. */
  return `<w:p><w:pPr>${b.keepNext ? "<w:keepNext/>" : ""}${b.pageBreak ? "<w:pageBreakBefore/>" : ""}`
    + `${b.rule ? `<w:pBdr><w:top w:val="${b.rule.val || "single"}" w:sz="${b.rule.sz}" w:space="0" w:color="${X(b.rule.color)}"/></w:pBdr>` : ""}`
    + `${b.tabs?.length ? `<w:tabs>${[...new Set(b.tabs.map(Math.round))].sort((x, y) => x - y).map((t) => `<w:tab w:val="left" w:pos="${t}"/>`).join("")}</w:tabs>` : ""}`
    + `${spacing}${ind}${b.align ? `<w:jc w:val="${b.align}"/>` : ""}`
    + `${runPr(f, runs.find((r) => r && !r.image) || b)}${b.sect || ""}</w:pPr>${body}</w:p>`;
};

/* How a table is ruled. Word's own — and the annexure's — leaves the outside
   open and dots between the lines; a form ruled as a grid is boxed all round. */
const BORDERS = {
  word: '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>'
    + '<w:insideH w:val="dotted" w:sz="4" w:space="0" w:color="auto"/>'
    + '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>',
  box: ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((e) => `<w:${e} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`).join(""),
  /* A table used only to hold a run of lines in step with one another, which
     is a steadier way to set a column of text than a row of tab stops. */
  none: ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((e) => `<w:${e} w:val="nil"/>`).join(""),
};

const EDGES = ["top", "left", "bottom", "right"];
const cellEdges = (e) => {
  const xml = EDGES.filter((k) => e?.[k])
    .map((k) => `<w:${k} w:val="${e[k].val}" w:sz="${e[k].sz}" w:space="0" w:color="${X(e[k].color)}"/>`).join("");
  return xml ? `<w:tcBorders>${xml}</w:tcBorders>` : "";
};
const cellMargins = (m) => (m
  ? `<w:tcMar>${EDGES.map((k) => `<w:${k} w:w="${Math.max(0, Math.round(m[k] || 0))}" w:type="dxa"/>`).join("")}</w:tcMar>` : "");

/* A cell may not be empty, nor may it end on a table: Word wants a paragraph
   there, so one too small to see is added after a table set inside a cell. */
const TINY = { kind: "p", size: 1, exact: 20 };
const closed = (blocks) => (!blocks.length || blocks[blocks.length - 1].kind === "tbl" ? [...blocks, TINY] : blocks);
/* Two tables standing directly one after the other are one table to Word. */
const parted = (blocks) => blocks.flatMap((b, i) => (b.kind === "tbl" && blocks[i - 1]?.kind === "tbl" ? [TINY, b] : [b]));
const body = (f, blocks) => parted(blocks).map((b) => (b.kind === "tbl" ? table(f, b) : para(f, b))).join("");

function table(f, { grid, rows, borders = "word", indent }) {
  const total = grid.reduce((a, x) => a + x, 0);
  const cols = grid.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  const trs = rows.map((raw) => {
    const r = Array.isArray(raw) ? { cells: raw } : raw;
    let at = 0;
    const cells = r.cells.map((rawCell) => {
      // A cell is [text, span] where it is plain, or an object where it is not.
      const c = Array.isArray(rawCell) ? { text: rawCell[0], span: rawCell[1] || 1 } : rawCell;
      const span = c.span || 1;
      const w = grid.slice(at, at + span).reduce((a, x) => a + x, 0);
      at += span;
      const inside = c.blocks ? closed(c.blocks) : c.paras ? c.paras
        : [{ text: c.text, runs: c.runs, align: c.align, bold: c.bold, underline: c.underline, size: c.size, color: c.color }];
      return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>`
        + `${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ""}`
        + `${c.vmerge ? (c.vmerge === "start" ? '<w:vMerge w:val="restart"/>' : "<w:vMerge/>") : ""}`
        + cellEdges(c.edges)
        + `${c.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${X(c.shade)}"/>` : ""}`
        + cellMargins(c.margins)
        + `${c.valign ? `<w:vAlign w:val="${c.valign}"/>` : ""}</w:tcPr>`
        + body(f, inside) + `</w:tc>`;
    }).join("");
    const trPr = `${r.whole ? "<w:cantSplit/>" : ""}`
      + `${r.height ? `<w:trHeight w:val="${Math.round(r.height)}" w:hRule="${r.fixed ? "exact" : "atLeast"}"/>` : ""}`
      + `${r.header ? "<w:tblHeader/>" : ""}`;
    return `<w:tr>${trPr ? `<w:trPr>${trPr}</w:trPr>` : ""}${cells}</w:tr>`;
  }).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>`
    + `${indent !== undefined ? `<w:tblInd w:w="${Math.round(indent)}" w:type="dxa"/>` : ""}`
    + `<w:tblBorders>${BORDERS[borders] || BORDERS.word}</w:tblBorders>`
    + `<w:tblLayout w:type="fixed"/></w:tblPr>`
    + `<w:tblGrid>${cols}</w:tblGrid>${trs}</w:tbl>`;
}

const DEFAULT_FONT = { name: "Calibri", size: 12 };
const fontOf = (font = {}) => ({ name: font.name || DEFAULT_FONT.name, size: font.size || DEFAULT_FONT.size });

/* Word's page is stated in twips. A4 and the margins of a typed letter are
   what these papers are set on unless the caller says otherwise. */
const sectXml = (page = {}) => {
  const p = {
    w: page.w || 11905, h: page.h || 16837,
    top: page.top ?? 1440, bottom: page.bottom ?? 1440,
    left: page.left ?? 1800, right: page.right ?? 1800,
  };
  return `<w:sectPr><w:pgSz w:w="${p.w}" w:h="${p.h}"${page.landscape ? ' w:orient="landscape"' : ""}/>`
    + `<w:pgMar w:top="${p.top}" w:right="${p.right}" w:bottom="${p.bottom}" w:left="${p.left}"`
    + ` w:header="${Math.min(720, p.top)}" w:footer="${Math.min(720, p.bottom)}" w:gutter="0"/></w:sectPr>`;
};

/* The parts of the package for a document. */
function packageFiles({ blocks, page, font, sections, modern } = {}) {
  media = [];
  imgSeq = 0;
  const list = sections?.length ? sections : [{ blocks: blocks || [], page, font }];
  const f0 = fontOf(list[0].font);
  /* A table may not be the last thing in a body — Word wants a paragraph after
     it — so one is added if the document ends on a table. Every section but the
     last is closed by the paragraph that carries its page. */
  const bodyXml = list.map((s, i) => {
    const f = fontOf(s.font);
    const own = s.blocks || [];
    const last = i === list.length - 1;
    const tail = own[own.length - 1];
    if (last) return body(f, tail?.kind === "tbl" || !own.length ? [...own, s.measured ? TINY : { kind: "p" }] : own);
    // The closing paragraph is the section's own last one where it has one.
    if (tail && tail.kind !== "tbl") return body(f, [...own.slice(0, -1), { ...tail, sect: sectXml(s.page) }]);
    return body(f, [...own, { ...TINY, sect: sectXml(s.page) }]);
  }).join("") + sectXml(list[list.length - 1].page);

  const files = [
    {
      name: "[Content_Types].xml",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>${modern ? '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' : ""}</Types>`),
    },
    {
      name: "_rels/.rels",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    },
    {
      name: "word/_rels/document.xml.rels",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${modern ? '<Relationship Id="rIdSe" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' : ""}${media.map((m, i) => `<Relationship Id="rIdImg${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${i}.${m.ext || "png"}"/>`).join("")}</Relationships>`),
    },
    {
      name: "word/styles.xml",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${X(f0.name)}" w:hAnsi="${X(f0.name)}" w:cs="${X(f0.name)}"/><w:sz w:val="${f0.size * 2}"/><w:szCs w:val="${f0.size * 2}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`),
    },
    {
      name: "word/document.xml",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${bodyXml}</w:body></w:document>`),
    },
  ];
  /* The papers read off the print layout are measured to the edge of the cell,
     which is where Word has set a table's indent from since 2013. Without this
     it takes the file for an older one and hangs every table out to the left. */
  if (modern) {
    files.push({
      name: "word/settings.xml",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings ${W}><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`),
    });
  }
  media.forEach((m, i) => files.push({ name: `word/media/image${i}.${m.ext || "png"}`, data: m.data }));
  return files;
}

/** Build the .docx package for a document and hand back a Blob. */
export const buildDOCX = (doc) => zipBlob(packageFiles(doc), DOCX_MIME);

/** The same, compressed — a list of some hundred lines runs to megabytes of
 *  markup otherwise. Async, because the browser's own compressor is. */
export const buildDOCXPacked = (doc) => zipBlobPacked(packageFiles(doc), DOCX_MIME);
