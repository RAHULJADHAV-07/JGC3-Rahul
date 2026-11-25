import { DT, DT_MARGIN, L, PL20_TABS, PL_FORMS, detailGroups, esc, familyOf, fitSheet, formGrid, houseCode, numOrText, poListFor, sum } from "./common.js";
import { packingListHtml, packingListSheets } from "./doc19.js";
import { colLetter } from "../xlsx.js";

/* One tab as a worksheet. */
export function detailSheet(ctx, tab, rows) {
  const cols = tab.cols, n = cols.length;
  const g = formGrid(n);
  const groups = detailGroups(tab, rows);
  /* The first band is typed over the units line rather than on a line of its
     own, which is how their sheet fits it; every band after it takes one. */
  const first = tab.band ? groups[0].label : (tab.spec ? tab.spec(rows) : "");

  // The orders, across the head of the sheet.
  g.row([[n, { v: poListFor(ctx, rows), s: tab.poHeight ? DT.poW : DT.po }]], tab.poHeight);

  /* The two header lines. A heading with nothing under it runs down over both;
     the line under it still carries a cell, as their file does, so the box is
     ruled whether or not Excel is showing the merge. */
  g.row(cols.filter((c) => c.h !== undefined)
    .map((c) => [c.span || 1, { v: c.h, s: DT.head }, c.sub === null ? 1 : 0]), (tab.head || [])[0] || 12.75);
  const lbl = tab.labelCols || 0;
  g.row(cols.map((c, i) => [1, {
    v: i < lbl && first ? first : (c.sub || ""),
    s: i < lbl && first ? DT.headL : DT.head,
  }]), (tab.head || [])[1]);

  // The two columns their formula reads: the pieces on the line, over what one
  // package of it holds.
  const pcsCol = colLetter(cols.findIndex((c) => c.pcs) + 1);
  const perCol = colLetter(cols.findIndex((c) => c.per) + 1);

  const top = g.at() + 1;
  groups.forEach((grp, gi) => {
    // A band after the first is headed on a line of its own, named in the
    // identity columns their sheet names it in.
    if (gi && grp.label) {
      g.row(cols.map((c, i) => [1, { v: i < lbl ? grp.label : "", s: i < lbl ? DT.band : DT.ctr }]), 15);
    }
    grp.rows.forEach((r) => {
      const at = g.at() + 1;
      g.row(cols.map((c) => {
        const s = typeof c.s === "function" ? c.s(r) : c.s;
        if (c.pcs) return [1, { v: r.pieces, t: "n", s }];
        /* Their own formula: the packages a line takes are its pieces over what
           one package holds. Where the master does not say, the count actually
           packed stands rather than the sheet going to nil. */
        if (c.pkg) return [1, { f: `IF($${perCol}${at}=0,${r.boxes},$${pcsCol}${at}/$${perCol}${at})`, s }];
        return [1, numOrText(c.get(r), s)];
      }));
    });
  });
  const last = g.at();

  /* The foot: the pieces and the packages totalled, and the columns that name
     the goods ruled off under them. */
  const pcsAt = cols.findIndex((c) => c.pcs);
  g.row(cols.map((c, i) => {
    if (i < pcsAt) return [1, { v: "", s: DT.foot }];
    const col = colLetter(i + 1);
    return [1, { f: `SUBTOTAL(9,${col}${top}:${col}${last})`, s: DT.tot }];
  }));

  return fitSheet({
    name: tab.name,
    rows: g.rows, merges: g.merges, heights: g.heights,
    widths: cols.map((c) => c.w),
    defaultColWidth: 10.6640625,
    defaultRowHeight: 12.75,
    colStyle: { font: "ref", border: false, valign: "center" },
    page: {
      paper: 9, orientation: "landscape", scale: tab.scale,
      ...(tab.fitH != null ? { fitH: tab.fitH, fit: 1 } : {}),
      margins: tab.margins || DT_MARGIN,
    },
  }, { widen: false });
}

/* The same tab on screen and on paper. */
export function detailHtml(ctx, tab, rows) {
  const cols = tab.cols, n = cols.length;
  const groups = detailGroups(tab, rows);
  const first = tab.band ? groups[0].label : (tab.spec ? tab.spec(rows) : "");
  const total = cols.reduce((a, c) => a + c.w, 0);
  const colg = `<colgroup>${cols.map((c) => `<col style="width:${(c.w / total) * 100}%">`).join("")}</colgroup>`;

  const th = (v, cls = "", span = 1, down = 1) =>
    `<th${span > 1 ? ` colspan="${span}"` : ""}${down > 1 ? ` rowspan="${down}"` : ""}${cls ? ` class="${cls}"` : ""}>${esc(v) || "&nbsp;"}</th>`;
  const cell = (v, cls) => `<td class="${cls}">${esc(v) === "" ? "&nbsp;" : esc(v)}</td>`;
  const nmc = (v, cls) => `<td class="${cls}" data-t="int" data-v="${v}">${v}</td>`;

  const lbl = tab.labelCols || 0;
  const head2 = cols.filter((c) => c.h !== undefined)
    .map((c) => th(c.h, "", c.span || 1, c.sub === null ? 2 : 1)).join("");
  const head3 = cols.map((c, i) => (c.sub === null ? ""
    : th(i < lbl && first ? first : (c.sub || ""), i < lbl && first ? "l" : ""))).join("");

  const body = groups.map((grp, gi) => {
    const band = gi && grp.label
      ? `<tr class="bnd">${cols.map((c, i) => cell(i < lbl ? grp.label : "", i < lbl ? "l" : "c")).join("")}</tr>`
      : "";
    return band + grp.rows.map((r) => `<tr>${cols.map((c) => {
      if (c.pcs) return nmc(r.pieces, "r");
      if (c.pkg) return nmc(r.boxes, "r");
      const v = c.get(r);
      const ident = typeof c.s === "function";
      const cls = c.s === DT.desc || c.s === DT.descB ? "desc"
        : ident ? (houseCode(r.it.code) ? "gd" : "code") : "c";
      return `<td class="${cls}">${esc(String(v ?? "")).replace(/\n/g, "<br>") || "&nbsp;"}</td>`;
    }).join("")}</tr>`).join("");
  }).join("");

  const pcsAt = cols.findIndex((c) => c.pcs);
  const foot = `<tr class="tot">${cols.map((c, i) => (i < pcsAt
    ? `<td class="o">&nbsp;</td>`
    : nmc(sum(rows, c.pcs ? "pieces" : "boxes"), "r"))).join("")}</tr>`;

  return `<table class="wb dt">${colg}<tbody>
    <tr class="po rule"><td colspan="${n}">${esc(poListFor(ctx, rows))}</td></tr>
    <tr>${head2}</tr><tr>${head3}</tr>
    ${body}${foot}</tbody></table>`;
}

/* The tabs this consignment actually needs — a family it does not carry gets no
   sheet, as an empty one would say nothing. */
export const detailTabs = (ctx) => {
  const rows = L(ctx);
  return PL20_TABS
    .map((tab) => ({ tab, rows: rows.filter((r) => tab.keys.includes(familyOf(r.it))) }))
    .filter((x) => x.rows.length);
};

export const B_20 = (ctx) => {
  const form = PL_FORMS[20];
  const tabs = detailTabs(ctx);
  return {
    name: "Packing_List_Itemwise",
    html: `${packingListHtml(ctx, form)}${tabs.map(({ tab, rows }) => `<div class="pgbrk"></div>
      <div class="dth">${esc(tab.name.toUpperCase())}</div>${detailHtml(ctx, tab, rows)}`).join("")}`,
    sheets: [...packingListSheets(ctx, form), ...tabs.map(({ tab, rows }) => detailSheet(ctx, tab, rows))],
    page: "portrait",
  };
};
