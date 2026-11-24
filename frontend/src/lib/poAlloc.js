/* Custom PO — which purchase orders a packing's boxes come off.

   Pure figures, shared by record packing and edit invoice, with no React in
   them so the unit tests can run them. The API checks the same rules again when
   the invoice is saved (routers/invoices.py _resolve_allocation).

     rows    [{ item_id, boxes }]            what was entered
     open    { item_id: [{ po, date, buyer_id, open }] }   oldest first
     picks   { item_id: [po] }               the orders chosen for each item, in
                                             the order they were chosen
     manual  { item_id: { po: boxes } }      items split by hand; the others
                                             fill their orders as chosen

   Every item has its own choice: i1 can come off PO 2 while i2 comes off PO 1
   and PO 3. Figures are keyed by PO number, and an object lists numeric keys in
   number order whatever order they were set in — so anything whose order matters
   is an array. */

const whole = (v) => Math.max(0, Math.floor(Number(v) || 0));

/* The orders holding at least one entered item with boxes still open. Oldest
   first, each saying how many of the entered items it holds. */
export function eligiblePos(rows, open) {
  const by = new Map();
  rows.forEach((r) => (open?.[r.item_id] || []).forEach((o) => {
    const e = by.get(o.po) || { po: o.po, date: o.date, buyer_id: o.buyer_id, items: 0, boxes: 0 };
    e.items += 1;
    e.boxes += Number(o.open) || 0;
    by.set(o.po, e);
  }));
  return [...by.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.po).localeCompare(String(b.po)));
}

/* The orders an item's boxes come off, in the order they are filled: the ones
   chosen for it that still hold it. One order holding it is no choice at all. */
export function chosenFor(legs, picked) {
  if (legs?.length === 1) return [legs[0].po];
  const here = new Set((legs || []).map((o) => o.po));
  return [...new Set(picked || [])].filter((po) => here.has(po));
}

/* One item against the orders chosen for it.
     legs     [{ po, boxes }] placed, in the order chosen — empties left out
     cells    { po: boxes } the same by order, 0 for one chosen but not reached
     chosen   [po]
     required what must be placed: the boxes, or all the orders hold if less
     spare    boxes beyond everything on order — reported, not placed
     short    still to place; negative when a hand split overshoots
     known    false until the API has answered for this item — nothing may be
              called "beyond what is on order" before then */
export function placeRow(row, legs, picked, manual) {
  const known = Array.isArray(legs);
  const boxes = whole(row.boxes);
  const room = (legs || []).reduce((n, o) => n + (Number(o.open) || 0), 0);
  const required = Math.min(boxes, room);
  const roomOf = new Map((legs || []).map((o) => [o.po, Number(o.open) || 0]));
  const chosen = chosenFor(legs, picked);
  // A single order leaves nothing to split by hand.
  const split = legs?.length === 1 ? null : manual;
  const cells = {};
  let left = required;
  chosen.forEach((po) => {
    const n = split ? Math.min(whole(split[po]), roomOf.get(po)) : Math.min(roomOf.get(po), left);
    cells[po] = n;
    left -= n;
  });
  const out = chosen.filter((po) => cells[po] > 0).map((po) => ({ po, boxes: cells[po] }));
  const placed = out.reduce((n, l) => n + l.boxes, 0);
  return { chosen, cells, legs: out, placed, required, spare: known ? Math.max(0, boxes - room) : 0, short: required - placed, known };
}

/* Every item at once. `ok` is what the save needs: the orders are known, and
   every box they have room for sits on an order. */
export function placement(rows, open, picks, manual) {
  const byItem = {};
  let short = 0, over = 0, spare = 0, known = true;
  rows.forEach((r) => {
    if (!open?.[r.item_id]) known = false;
    const p = placeRow(r, open?.[r.item_id], picks?.[r.item_id], manual?.[r.item_id]);
    byItem[r.item_id] = p;
    if (p.short > 0) short += p.short; else over -= p.short;
    spare += p.spare;
  });
  return { byItem, short, over, spare, known, ok: known && !short && !over };
}

/* ---- the choices themselves: { picks, manual } in, { picks, manual } out ---- */

const without = (o, ids) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !ids.includes(k)));

/* An order chosen for an item, or let go of. Its figures are filled afresh: a
   split typed for the old choice no longer adds up. */
export function togglePick({ picks, manual }, itemId, po) {
  const had = picks?.[itemId] || [];
  const next = had.includes(po) ? had.filter((x) => x !== po) : [...had, po];
  return { picks: { ...picks, [itemId]: next }, manual: without(manual, [itemId]) };
}

/* A figure typed against one of an item's orders. The others stay as they read
   on screen, so the split is the one the packer sees. */
export function typeCell({ picks, manual }, itemId, placed, po, value, max) {
  return { picks, manual: { ...manual, [itemId]: { ...(placed?.cells || {}), [po]: Math.min(whole(value), whole(max)) } } };
}

/* The rest of an item's boxes onto its other orders, oldest first, after the
   ones already chosen. */
export function fillOldest({ picks, manual }, itemId, legs, boxes) {
  const next = chosenFor(legs, picks?.[itemId]);
  const kept = manual?.[itemId];
  // What was typed by hand stands; the boxes it leaves go to the orders after it.
  const cells = {};
  let left = Math.min(whole(boxes), (legs || []).reduce((n, o) => n + (Number(o.open) || 0), 0));
  next.forEach((po) => {
    const room = Number(legs.find((o) => o.po === po)?.open) || 0;
    cells[po] = Math.min(left, kept ? Math.min(whole(kept[po]), room) : room);
    left -= cells[po];
  });
  (legs || []).forEach((o) => {
    if (left <= 0) return;
    const add = Math.min(left, (Number(o.open) || 0) - (cells[o.po] || 0));
    if (add <= 0) return;
    if (!next.includes(o.po)) next.push(o.po);
    cells[o.po] = (cells[o.po] || 0) + add;
    left -= add;
  });
  return {
    picks: { ...picks, [itemId]: next },
    manual: kept ? { ...manual, [itemId]: cells } : without(manual, [itemId]),
  };
}

/* One order for every item it holds; the items it does not hold keep theirs. */
export function pickForAll({ picks, manual }, rows, open, po) {
  const held = rows.filter((r) => (open?.[r.item_id] || []).some((o) => o.po === po)).map((r) => r.item_id);
  return {
    picks: { ...picks, ...Object.fromEntries(held.map((id) => [id, [po]])) },
    manual: without(manual, held),
  };
}

/* The boxes typed for an item changed, or it was taken off: what was split by
   hand for the old figure goes, and with `drop` the orders chosen as well. */
export function forget({ picks, manual }, ids, drop = false) {
  return { picks: drop ? without(picks, ids) : (picks || {}), manual: without(manual, ids) };
}

/* What the API stores on the line. */
export const toPins = (placed) => (placed?.legs || []).map(({ po, boxes }) => ({ po, boxes }));

/* An invoice's saved lines back into the choices and hand-split figures, so
   editing it opens as it was saved. */
export function fromLines(lines) {
  const picks = {}, manual = {};
  (lines || []).forEach((l) => (l.po_alloc || []).forEach((p) => {
    (picks[l.item_id] ||= []).push(p.po);
    (manual[l.item_id] ||= {})[p.po] = Number(p.boxes) || 0;
  }));
  return { picks, manual };
}

/* An item's open orders once this draft is saved: what each will still hold. */
export const leftAfter = (legs, placed) => (legs || [])
  .map((o) => ({ ...o, left: (Number(o.open) || 0) - (placed?.cells?.[o.po] || 0) }));
