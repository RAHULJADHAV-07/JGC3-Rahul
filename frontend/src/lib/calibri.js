/* Calibri's advance widths, in thousandths of an em — read off Carlito, the
   face metric-compatible with it, so a line measured here is the line Excel
   sets. Used to break the A4 declarations' paragraphs into the lines the page
   shows (docs/common.js · a4Letter): a worksheet cannot space the lines of a
   wrapped cell, so each line takes a row of its own at the page's spacing.

   A character not in the table is reckoned at the width of an "m" — wide, so a
   line with one in it breaks early rather than running past the cell. */
const CHARS = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~–—•‘’“”₹×°";
const REG = [226, 326, 401, 498, 507, 715, 682, 221, 303, 303, 498, 498, 250, 306, 252, 386, 507, 507, 507, 507, 507, 507, 507, 507, 507, 507, 268, 268, 498, 498, 498, 463, 894, 579, 544, 533, 615, 488, 459, 631, 623, 252, 319, 520, 420, 855, 646, 662, 517, 673, 543, 459, 487, 642, 567, 890, 519, 487, 468, 307, 386, 307, 498, 498, 291, 479, 525, 423, 525, 498, 305, 471, 525, 229, 239, 455, 229, 799, 525, 527, 525, 525, 349, 391, 335, 525, 452, 715, 433, 453, 395, 314, 460, 314, 498, 498, 905, 498, 250, 250, 418, 418, 507, 498, 339];
const BOLD = [226, 326, 438, 498, 507, 729, 705, 233, 312, 312, 498, 498, 258, 306, 267, 430, 507, 507, 507, 507, 507, 507, 507, 507, 507, 507, 276, 276, 498, 498, 498, 463, 898, 606, 561, 529, 630, 488, 459, 637, 631, 267, 331, 547, 423, 874, 659, 676, 532, 686, 563, 473, 495, 653, 591, 906, 551, 520, 478, 325, 430, 325, 498, 498, 300, 494, 537, 418, 537, 503, 316, 474, 537, 246, 255, 480, 246, 813, 537, 538, 537, 537, 355, 399, 347, 537, 473, 745, 459, 474, 397, 344, 475, 344, 498, 498, 905, 498, 258, 258, 435, 435, 507, 498, 342];

const table = (w) => new Map([...CHARS].map((c, i) => [c, w[i]]));
const R = table(REG), B = table(BOLD);

/** Width of `text` set in Calibri at `pt` points, in points. */
export function calibriWidth(text, pt, bold = false) {
  const t = bold ? B : R;
  let em = 0;
  for (const c of String(text)) em += t.get(c) ?? 799;
  return (em / 1000) * pt;
}

/** Break `text` into lines no wider than `maxPt`, at the spaces, as a browser
 *  or Excel would. A word longer than a line stands on a line of its own. */
export function calibriLines(text, pt, maxPt, bold = false) {
  const out = [];
  String(text).split("\n").forEach((para) => {
    let line = "";
    para.split(/ +/).forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (line && calibriWidth(next, pt, bold) > maxPt) {
        out.push(line);
        line = word;
      } else line = next;
    });
    out.push(line);
  });
  return out;
}

/** The same for a line typed in runs of more than one weight —
 *  [{ t, bold }, …] — breaking it into lines of runs. */
export function calibriRunLines(runs, pt, maxPt) {
  const chars = [];
  runs.forEach((r) => [...String(r.t ?? "")].forEach((c) => chars.push({ c, bold: !!r.bold })));
  const width = (cs) => cs.reduce((n, x) => n + calibriWidth(x.c, pt, x.bold), 0);
  const toRuns = (cs) => cs.reduce((out, x) => {
    const last = out[out.length - 1];
    if (last && last.bold === x.bold) last.t += x.c;
    else out.push({ t: x.c, bold: x.bold });
    return out;
  }, []);
  // Words, each with the space before it.
  const words = [];
  let cur = [];
  chars.forEach((x) => {
    if (x.c === " " && cur.length && cur[cur.length - 1].c !== " ") { words.push(cur); cur = []; }
    cur.push(x);
  });
  if (cur.length) words.push(cur);
  const lines = [];
  let line = [];
  words.forEach((w) => {
    const next = [...line, ...w];
    if (line.length && width(next) > maxPt) {
      lines.push(line);
      line = w.slice(w.findIndex((x) => x.c !== " "));
    } else line = next;
  });
  lines.push(line);
  return lines.map(toRuns);
}
