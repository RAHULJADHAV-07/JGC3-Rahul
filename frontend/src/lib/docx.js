/* ============================================================================
   A real .docx writer, with no dependencies.

   Two of the client's papers are Word documents rather than workbooks — the
   annexure that staples to the bill of lading (24), and the container weight
   declaration (34). They are typed sheets: a heading, some lines, a couple of
   ruled tables. Handing those out as a spreadsheet would be handing out
   something the client would have to retype before sending it on, so they are
   written as what they are.

   A document is a plain object:

     { blocks, page, font }

   `blocks` is an array of:

     { kind: "p", ... } ....... a paragraph
     { kind: "tbl", ... } ..... a ruled table

   A paragraph is `{ text, align?, bold?, underline?, size?, color?, image? }`,
   or `{ runs: [...] }` when one line changes face part-way along. A run is
   `{ text, bold?, underline?, size?, color? }`. `size` is in points and
   `color` a bare RRGGBB; both default to the document's own.

   A table is `{ grid, rows, borders? }`. `grid` is the column widths in twips
   (1440 to the inch, as Word states them) and `rows` an array of rows, a row
   an array of cells. A cell is either

     [text] | [text, span] ......... plain, as most of them are, or
     { text | runs | paras, span?, align?, valign?, bold?, size?, color? }

   when it has a face of its own. `borders` is "word" — dotted between one line
   and the next, solid down between the columns, solid under the last, nothing
   around the outside, which is how Word rules the annexure — or "box", every
   cell ruled all round, which is how the declaration's forwarder rules theirs.

   `page` is `{ w, h, top, bottom, left, right }` in twips. A form ruled on a
   grid wider than a typed letter's measure needs its margins narrowed to it,
   or Word puts the overflow on a page of its own.

   `image` on a paragraph is `{ data, cx, cy }` — the bytes and the size in EMU
   (914400 to the inch), as lib/logo.js hands them over.
   ============================================================================ */
import { X, utf8, zipBlob } from "./zip.js";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
  + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
  + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';

/* Word measures type in half-points, and a paragraph's own run properties have
   to be repeated on the paragraph mark as well or the line spacing jumps. */
const runPr = (f, r = {}) => {
  const sz = Math.round((r.size || f.size) * 2);
  return `<w:rPr><w:rFonts w:ascii="${X(f.name)}" w:hAnsi="${X(f.name)}" w:cs="${X(f.name)}"/>`
    + `${r.bold ? "<w:b/>" : ""}${r.underline ? '<w:u w:val="single"/>' : ""}`
    + `${r.color ? `<w:color w:val="${X(String(r.color).replace("#", ""))}"/>` : ""}`
    + `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;
};

/* One run. A newline inside it is a line break, which Word will not take from
   the text itself — each line is set as its own piece with a break before it. */
const run = (f, r) => {
  if (!r || (!r.text && !r.image)) return "";
  if (r.image) return drawing(r.image);
  const lines = String(r.text).split("\n");
  return `<w:r>${runPr(f, r)}${lines
    .map((l, i) => `${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${X(l)}</w:t>`).join("")}</w:r>`;
};

/* An inline picture. Word wants the same size stated twice — once for the space
   it takes in the line, once for the picture drawn into it.

   The pictures a build collects are gathered here and emptied at the start of
   each one: writing the body is what finds them, and the package cannot be
   sealed until it knows what it is carrying. buildDOCX is synchronous, so a
   build always finishes before the next begins. */
let imgSeq = 0;
let media = [];
function drawing(img) {
  const id = media.length;
  media.push(img);
  const rid = `rIdImg${id}`;
  const n = ++imgSeq;
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">`
    + `<wp:extent cx="${img.cx}" cy="${img.cy}"/><wp:docPr id="${1000 + n}" name="Picture ${n}"/>`
    + `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">`
    + `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:nvPicPr><pic:cNvPr id="${1000 + n}" name="image${id}.png"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${img.cx}" cy="${img.cy}"/></a:xfrm>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

const para = (f, b = {}) => {
  const jc = b.align ? `<w:jc w:val="${b.align}"/>` : "";
  const runs = b.runs ? b.runs : [b];
  const body = runs.map((r) => run(f, r)).join("");
  /* The mark at the end of the paragraph carries the first run's face, so an
     empty line after a small one does not open up to the document's own size. */
  return `<w:p><w:pPr>${jc}<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>`
    + `${runPr(f, runs[0] || {})}</w:pPr>${body}</w:p>`;
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

function table(f, { grid, rows, borders = "word" }) {
  const total = grid.reduce((a, x) => a + x, 0);
  const cols = grid.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  const body = rows.map((r) => {
    let at = 0;
    const cells = r.map((raw) => {
      // A cell is [text, span] where it is plain, or an object where it is not.
      const c = Array.isArray(raw) ? { text: raw[0], span: raw[1] || 1 } : raw;
      const span = c.span || 1;
      const w = grid.slice(at, at + span).reduce((a, x) => a + x, 0);
      at += span;
      const paras = c.paras ? c.paras
        : [{ text: c.text, runs: c.runs, align: c.align, bold: c.bold, underline: c.underline, size: c.size, color: c.color }];
      return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>`
        + `${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ""}`
        + `${c.valign ? `<w:vAlign w:val="${c.valign}"/>` : ""}</w:tcPr>`
        + paras.map((pp) => para(f, pp)).join("") + `</w:tc>`;
    }).join("");
    return `<w:tr>${cells}</w:tr>`;
  }).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>`
    + `<w:tblBorders>${BORDERS[borders] || BORDERS.word}</w:tblBorders>`
    + `<w:tblLayout w:type="fixed"/></w:tblPr>`
    + `<w:tblGrid>${cols}</w:tblGrid>${body}</w:tbl>`;
}

/** Build the .docx package for a document and hand back a Blob. */
export function buildDOCX({ blocks = [], page = {}, font = {} } = {}) {
  media = [];
  imgSeq = 0;
  const f = { name: font.name || "Calibri", size: font.size || 12 };
  /* Word's page is stated in twips. A4 and the margins of a typed letter are
     what these papers are set on unless the caller says otherwise. */
  const p = {
    w: page.w || 11905, h: page.h || 16837,
    top: page.top ?? 1440, bottom: page.bottom ?? 1440,
    left: page.left ?? 1800, right: page.right ?? 1800,
  };
  /* A table may not be the last thing in a body — Word wants a paragraph after
     it — so one is added if the document ends on a table. */
  const list = blocks[blocks.length - 1]?.kind === "tbl" ? [...blocks, { kind: "p" }] : blocks;
  const body = list.map((b) => (b.kind === "tbl" ? table(f, b) : para(f, b))).join("");
  const sect = `<w:sectPr><w:pgSz w:w="${p.w}" w:h="${p.h}"/>`
    + `<w:pgMar w:top="${p.top}" w:right="${p.right}" w:bottom="${p.bottom}" w:left="${p.left}"`
    + ' w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';

  const files = [
    {
      name: "[Content_Types].xml",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`),
    },
    {
      name: "_rels/.rels",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    },
    {
      name: "word/_rels/document.xml.rels",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${media.map((m, i) => `<Relationship Id="rIdImg${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${i}.${m.ext || "png"}"/>`).join("")}</Relationships>`),
    },
    {
      name: "word/styles.xml",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${X(f.name)}" w:hAnsi="${X(f.name)}" w:cs="${X(f.name)}"/><w:sz w:val="${f.size * 2}"/><w:szCs w:val="${f.size * 2}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`),
    },
    {
      name: "word/document.xml",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${body}${sect}</w:body></w:document>`),
    },
  ];

  media.forEach((m, i) => files.push({ name: `word/media/image${i}.${m.ext || "png"}`, data: m.data }));

  return zipBlob(files, DOCX_MIME);
}
