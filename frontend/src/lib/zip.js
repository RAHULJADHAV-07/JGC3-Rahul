/* ============================================================================
   The OOXML packaging both writers share — a zip, and the XML escaping that
   goes into it. An .xlsx and a .docx are the same kind of parcel: a handful of
   XML parts zipped together with a content-type map, so the machinery for the
   parcel itself lives here and each writer only has to say what goes in it.
   No dependencies: entries are stored rather than deflated, which is a valid
   zip and keeps it that way — or deflated by the browser's own compressor where
   the caller can wait for it (zipBlobPacked).
   ============================================================================ */

/* ---- CRC-32, for the zip entries ---- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* ---- ZIP (stored, no compression — valid, and keeps this dependency-free) ---- */
export function zipBlob(files, type) {
  return pack(files.map((f) => ({ ...f, raw: f.data })), type);
}

/* Deflated by the browser, entry by entry; one it cannot make smaller — a PNG —
   is stored as it stands, and so is everything in a browser too old to offer
   the compressor. */
export async function zipBlobPacked(files, type) {
  const out = [];
  for (const f of files) {
    let data = null;
    if (typeof CompressionStream === "function" && f.data.length > 512) {
      try {
        const stream = new Blob([f.data]).stream().pipeThrough(new CompressionStream("deflate-raw"));
        data = new Uint8Array(await new Response(stream).arrayBuffer());
      } catch (e) { data = null; }
    }
    out.push(data && data.length < f.data.length
      ? { ...f, raw: f.data, data, method: 8 } : { ...f, raw: f.data });
  }
  return pack(out, type);
}

function pack(files, type) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;

  files.forEach((f) => {
    const name = enc.encode(f.name);
    const data = f.data;
    const crc = crc32(f.raw);
    const method = f.method || 0;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);       // version needed to extract
    lv.setUint16(6, 0x0800, true);   // UTF-8 file names
    lv.setUint16(8, method, true);   // 0 stored, 8 deflated
    lv.setUint16(10, 0, true);       // mod time
    lv.setUint16(12, 0x21, true);    // mod date (1980-01-01)
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, f.raw.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    parts.push(local, data);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, f.raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    central.push(cd);

    offset += local.length + data.length;
  });

  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  return new Blob([...parts, ...central, end], { type });
}

/* ---- XML helpers ---- */
export const X = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  // Control characters are illegal in XML 1.0 and would make Excel refuse
  // the whole file, so they are dropped rather than escaped.
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, "");

export const utf8 = (s) => new TextEncoder().encode(s);

