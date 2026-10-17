/* Shrink-to-fit for the papers, on screen and on paper.

   The client's workbooks set their one-line cells to "shrink to fit": a long
   run of purchase orders, a GSTIN in a narrow column, "IEC AVIPS4808H" under
   "Exporter's Ref." — Excel squeezes the type until it sits in the box. The
   browser has no such setting, so a cell that cannot wrap simply cuts its text
   off at the rule. This does what Excel does: every cell whose text is wider
   than the cell and cannot wrap onto another line has its type reduced until
   it fits, never below `MIN` of what it was set at.

   It runs once the paper is laid out — after the preview renders, and in the
   print frame before the dialog opens. Only cells that are actually cut are
   touched; the rest of the sheet keeps the sizes it was designed at. */

const MIN = 0.55;

const cutOff = (el, cs) => el.scrollWidth > el.clientWidth + 1
  && el.clientWidth > 0
  && (cs.whiteSpace === "nowrap" || cs.whiteSpace === "pre" || cs.overflow === "hidden" || cs.overflowX === "hidden");

export function fitCells(root) {
  if (!root?.querySelectorAll) return 0;
  const win = root.ownerDocument?.defaultView || window;
  let fixed = 0;
  root.querySelectorAll("td, th").forEach((el) => {
    if (!el.textContent.trim()) return;
    let cs = win.getComputedStyle(el);
    if (!cutOff(el, cs)) return;
    const base = parseFloat(cs.fontSize) || 12;
    let size = base;
    /* The width the text needs does not fall exactly in proportion to the type
       (padding stays put), so it is stepped down a few times rather than set
       once from the ratio. */
    for (let i = 0; i < 6 && cutOff(el, cs) && size > base * MIN; i++) {
      size = Math.max(base * MIN, size * Math.min(0.97, (el.clientWidth - 2) / el.scrollWidth));
      el.style.fontSize = `${size.toFixed(2)}px`;
      cs = win.getComputedStyle(el);
    }
    fixed++;
  });
  return fixed;
}

/* A sheet that runs a little past the foot of the paper — a few lines over —
   is shrunk onto its one page rather than leaving those lines alone on a page
   of their own (Excel's "fit to one page"). A document that is genuinely
   several pages long is left to run on. Measured in CSS pixels on an A4 page
   with no margin, which is how the print frame is set up. */
const MM = 96 / 25.4;
const SLACK = 1.3;

export function fitPages(doc, orientation) {
  // A few pixels short of the sheet: zoomed type does not scale exactly in
  // proportion, and a border a pixel over the foot is a blank page of its own.
  const pageH = (orientation === "portrait" ? 297 : 210) * MM - 12;
  /* Zoom `el` until `height()` sits inside `room`, re-measuring each time. */
  const squeeze = (el, height, room) => {
    let z = 1;
    for (let i = 0; i < 4 && height() > room; i++) {
      z *= room / height();
      el.style.zoom = String(Math.max(0.6, z));
    }
  };
  doc.querySelectorAll(".jg-doc").forEach((jd) => {
    const cs = doc.defaultView.getComputedStyle(jd);
    const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const kids = [...jd.children].filter((el) => el.offsetHeight > 0);
    const outer = (el) => el.getBoundingClientRect().height;
    // Sheets the document cuts itself (one table or block to a page).
    kids.forEach((el) => {
      const h = outer(el) + pad;
      if (h > pageH && h <= pageH * SLACK) squeeze(el, () => outer(el), pageH - pad);
    });
    // A one-page document made of several blocks that, together, run over.
    const all = outer(jd);
    if (kids.length > 1 && all > pageH && all <= pageH * SLACK && !kids.some((el) => el.style.zoom)) {
      squeeze(jd, () => outer(jd), pageH);
    }
  });
}
