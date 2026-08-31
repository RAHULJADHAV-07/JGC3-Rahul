/* The exporter's own pictures — the mark, the printed address block, and the
   signature and stamp the client puts at the foot of a signed letter.

   The supplier purchase order is printed on Jaikvin's own letterhead, so the
   mark has to travel inside the .xlsx rather than be linked to it. The packing
   declaration (21, 33) needs the address block as well: its own file sets that
   block as a floating text box, five lines in three inks and a letter-spaced
   name, and the truest way to put that on a worksheet is the block itself.

   Both files are in public/, and the workbook writer wants the bytes, so each
   is fetched once and kept — the fetch starts as soon as the document engine
   loads, long before anyone clicks a download. Should either fail (offline,
   blocked), the document simply prints without it, which is what it did
   before.

   The previews want the same two pictures as an <img>, and cannot have them as
   a path: what a preview renders is passed through lib/safeHtml.js, which
   allows an image only if its src is a data: URI — a rule that exists so a
   document can never be made to fetch anything off another host. So the bytes
   already in hand are handed to the page as data: URIs. Point an <img> at
   "/logo.png" instead and the sanitiser drops the src, which is a letterhead
   that silently prints blank on screen while the .xlsx carries it fine. */

const SRC = "/logo.png";
const ADDR_SRC = "/Company Address .png";
/* The signature block and the round stamp, scanned as the client signs and
   stamps a letter (30). Both go on the page and into the workbook. */
const SIGN_FILE = "/Sign.png";
const STAMP_FILE = "/Stamp.png";
/* The gross-mass declaration (27) is printed on a letterhead of its own — the
   name, the trade and the mark scanned as one strip, rather than set in type
   the way the letters set it. */
const HEAD27_FILE = "/DOC 27 header .png";
/* Their sheet anchors the mark just inside the left margin of the letterhead
   block, about three quarters of an inch square (EMU: 914400 to the inch). */
const PLACE = { col: 0, colOff: 57150, row: 1, rowOff: 142876, cy: 685800 };
/* The address block as it was scanned off their letterhead. A form that has to
   size the block to the room it has — 23 fits it to the depth of its head —
   works the other dimension out from this. */
export const ADDR_ASPECT = 509 / 115;

/* The other two, as they were scanned. */
export const SIGN_ASPECT = 562 / 179;
export const STAMP_ASPECT = 177 / 178;
/* The declaration's letterhead strip, as it was scanned — a long shallow band,
   so a form that has the width works its depth out from this. */
export const HEAD27_ASPECT = 955 / 174;

const held = {};
const pending = {};

/* btoa wants a string, and spreading a forty-kilobyte array into
   String.fromCharCode overflows the argument stack, so it goes in chunks. */
function dataUri(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:image/png;base64,${btoa(s)}`;
}

function fetchOnce(src) {
  if (held[src]) return Promise.resolve(held[src]);
  if (!pending[src]) {
    pending[src] = (typeof fetch === "function" ? fetch(src) : Promise.reject())
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => {
        held[src] = new Uint8Array(buf);
        const uri = dataUri(held[src]);
        if (src === SRC) LOGO_SRC = uri;
        else if (src === ADDR_SRC) ADDRESS_SRC = uri;
        else if (src === SIGN_FILE) SIGN_SRC = uri;
        else if (src === STAMP_FILE) STAMP_SRC = uri;
        else HEAD27_SRC = uri;
        return held[src];
      })
      .catch(() => null);
  }
  return pending[src];
}

/** Start (or reuse) the fetches. Resolves once the letterhead is in hand. */
export function primeLogo() {
  return Promise.all([SRC, ADDR_SRC, SIGN_FILE, STAMP_FILE, HEAD27_FILE].map(fetchOnce)).then(([mark]) => mark);
}

/** The mark a sheet builder attaches, or null while it is still loading. */
export function logoImage(aspect = 172 / 165) {
  if (!held[SRC]) return null;
  return { data: held[SRC], ext: "png", ...PLACE, cx: Math.round(PLACE.cy * aspect) };
}

/** The address block, sized to the width the caller has room for. */
export function addressImage(cx) {
  if (!held[ADDR_SRC]) return null;
  return {
    data: held[ADDR_SRC], ext: "png", name: "Address",
    col: 0, colOff: 0, row: 0, rowOff: 0,
    cx, cy: Math.round(cx / ADDR_ASPECT),
  };
}

/** The signature block, sized to the width the caller has room for. */
export function signImage(cx) {
  if (!held[SIGN_FILE]) return null;
  return { data: held[SIGN_FILE], ext: "png", name: "Signature", cx, cy: Math.round(cx / SIGN_ASPECT) };
}

/** The stamp, likewise. */
export function stampImage(cx) {
  if (!held[STAMP_FILE]) return null;
  return { data: held[STAMP_FILE], ext: "png", name: "Stamp", cx, cy: Math.round(cx / STAMP_ASPECT) };
}

/** The declaration's own letterhead strip, sized to the width it is given. */
export function head27Image(cx) {
  if (!held[HEAD27_FILE]) return null;
  return { data: held[HEAD27_FILE], ext: "png", name: "Letterhead", cx, cy: Math.round(cx / HEAD27_ASPECT) };
}

/* What a preview points an <img> at. Empty until the fetch lands — a module
   binding, so a document built after it lands reads the URI rather than the
   blank it started as. */
export let LOGO_SRC = "";
export let ADDRESS_SRC = "";
export let SIGN_SRC = "";
export let STAMP_SRC = "";
export let HEAD27_SRC = "";

/** One of them as an <img> for a preview, or nothing at all while it loads —
 *  an <img> with no src is a broken picture, and a letterhead that has not
 *  arrived should print the way it does when the fetch fails: without it. */
export const imgTag = (src, cls, style) => (src
  ? `<img${cls ? ` class="${cls}"` : ""}${style ? ` style="${style}"` : ""} src="${src}" alt="">` : "");
