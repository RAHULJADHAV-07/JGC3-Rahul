/* What the checks need to look inside a .docx: the zip it is, and whether the
   XML in it is well formed and in the order Word holds it to. */
import zlib from "node:zlib";

/** The files in a zip, by name — read off its central directory, and every
 *  entry checked against the CRC it was stored with. */
export function readZip(buf) {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("not a zip");
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const out = {};
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error("the central directory is broken");
    const method = buf.readUInt16LE(at + 10), crc = buf.readUInt32LE(at + 16), packed = buf.readUInt32LE(at + 20), size = buf.readUInt32LE(at + 24);
    const nl = buf.readUInt16LE(at + 28), xl = buf.readUInt16LE(at + 30), cl = buf.readUInt16LE(at + 32), local = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nl);
    const from = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(from, from + packed);
    const data = method === 8 ? zlib.inflateRawSync(raw) : raw;
    if (data.length !== size) throw new Error(`${name} is ${data.length} bytes, not ${size}`);
    if (zlib.crc32 && zlib.crc32(data) !== crc) throw new Error(`${name} does not match its checksum`);
    if (name in out) throw new Error(`${name} is there twice`);
    out[name] = data;
    at += 46 + nl + xl + cl;
  }
  return out;
}

/* The order the schema lists an element's children in, where Word is strict. */
const ORDER = {
  "w:pPr": ["w:pStyle", "w:keepNext", "w:keepLines", "w:pageBreakBefore", "w:pBdr", "w:shd", "w:tabs", "w:spacing", "w:ind", "w:jc", "w:rPr", "w:sectPr"],
  "w:rPr": ["w:rFonts", "w:b", "w:i", "w:color", "w:spacing", "w:w", "w:sz", "w:szCs", "w:u", "w:vertAlign"],
  "w:tblPr": ["w:tblW", "w:tblInd", "w:tblBorders", "w:tblLayout", "w:tblCellMar"],
  "w:tcPr": ["w:tcW", "w:gridSpan", "w:vMerge", "w:tcBorders", "w:shd", "w:noWrap", "w:tcMar", "w:vAlign"],
  "w:tcBorders": ["w:top", "w:left", "w:bottom", "w:right"],
  "w:tcMar": ["w:top", "w:left", "w:bottom", "w:right"],
  "w:sectPr": ["w:type", "w:pgSz", "w:pgMar"],
  "w:tbl": ["w:tblPr", "w:tblGrid", "w:tr"],
  "w:tr": ["w:trPr", "w:tc"],
};

/** What is wrong with a part: tags that do not close, children out of order,
 *  and — in a document body — cells, rows and spans that do not add up. */
export function xmlErrors(xml, name = "") {
  const errs = [];
  const root = { tag: "#", kids: [], attrs: {} };
  const stack = [root];
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/.test(xml)) errs.push(`${name}: an illegal character`);
  if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(xml)) errs.push(`${name}: a bare &`);
  if (/(NaN|undefined|Infinity)(?=")/.test(xml)) errs.push(`${name}: a figure that is not one`);
  const re = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|<\?[^>]*\?>|<!--[\s\S]*?-->|([^<]+)|(<)/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[6]) { errs.push(`${name}: a stray < at ${m.index}: ${xml.slice(m.index, m.index + 60)}`); break; }
    if (!m[2]) continue;
    if (m[1]) {
      const open = stack.pop();
      if (open.tag !== m[2]) { errs.push(`${name}: </${m[2]}> closes <${open.tag}>`); break; }
    } else {
      const node = { tag: m[2], attrs: Object.fromEntries([...(m[3] || "").matchAll(/([\w:.-]+)="([^"]*)"/g)].map((x) => [x[1], x[2]])), kids: [] };
      stack[stack.length - 1].kids.push(node);
      if (!m[4]) stack.push(node);
    }
  }
  if (!errs.length && stack.length !== 1) errs.push(`${name}: <${stack[stack.length - 1].tag}> is never closed`);
  const walk = (n, parent) => {
    const order = ORDER[n.tag];
    // The run properties on a paragraph mark are a w:rPr inside a w:pPr, the same list.
    if (order) {
      let at = -1;
      n.kids.forEach((k) => {
        const i = order.indexOf(k.tag);
        if (i < 0) errs.push(`${name}: <${k.tag}> in <${n.tag}>`);
        else if (i < at) errs.push(`${name}: <${k.tag}> out of order in <${n.tag}>`);
        else at = i;
      });
    }
    if (n.tag === "w:tc") {
      const last = n.kids[n.kids.length - 1];
      if (!last || last.tag !== "w:p") errs.push(`${name}: a cell that does not end in a paragraph`);
    }
    if (n.tag === "w:tbl") {
      const cols = n.kids.find((k) => k.tag === "w:tblGrid").kids.map((k) => Number(k.attrs["w:w"]));
      if (cols.length > 63) errs.push(`${name}: ${cols.length} columns — Word allows 63`);
      const open = new Array(cols.length).fill(0);
      n.kids.filter((k) => k.tag === "w:tr").forEach((tr, ri) => {
        let at = 0;
        tr.kids.filter((k) => k.tag === "w:tc").forEach((tc) => {
          const pr = tc.kids.find((k) => k.tag === "w:tcPr");
          const get = (t) => pr.kids.find((k) => k.tag === t);
          const span = Number(get("w:gridSpan")?.attrs["w:val"] || 1);
          const w = cols.slice(at, at + span).reduce((a, b) => a + b, 0);
          if (Number(get("w:tcW").attrs["w:w"]) !== w) errs.push(`${name}: row ${ri + 1}: a cell ${get("w:tcW").attrs["w:w"]} wide over columns ${w} wide`);
          const vm = get("w:vMerge");
          if (vm && vm.attrs["w:val"] !== "restart" && open[at] !== span) errs.push(`${name}: row ${ri + 1}: a merged cell carries on from nothing`);
          for (let i = 0; i < span; i += 1) open[at + i] = 0;
          if (vm) open[at] = span;
          at += span;
        });
        if (at !== cols.length) errs.push(`${name}: row ${ri + 1} spans ${at} of ${cols.length} columns`);
      });
      const i = parent.kids.indexOf(n);
      if (parent.kids[i + 1]?.tag === "w:tbl") errs.push(`${name}: two tables with nothing between them`);
    }
    if (n.tag === "w:body" && n.kids[n.kids.length - 1]?.tag !== "w:sectPr") errs.push(`${name}: the body does not end on its page`);
    n.kids.forEach((k) => walk(k, n));
  };
  if (!errs.length) walk(root, root);
  return [...new Set(errs)];
}
