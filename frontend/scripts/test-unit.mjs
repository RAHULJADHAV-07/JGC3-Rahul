/* Unit tests for the browser's own figures — no server, no browser.

     npm run test:unit
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chosenFor, eligiblePos, fillOldest, forget, fromLines, leftAfter, pickForAll, placeRow, placement, toPins, togglePick, typeCell,
} from "../src/lib/poAlloc.js";
import { portsFor } from "../src/lib/ports.js";

const leg = (po, date, open) => ({ po, date, buyer_id: "b", open });
/* The brief: PO1 and PO2 hold what was entered; PO3 and PO4 do not. */
const OPEN = {
  i1: [leg("PO1", "2026-01-10", 20), leg("PO2", "2026-02-10", 30)],
  i2: [leg("PO1", "2026-01-10", 20), leg("PO2", "2026-02-10", 30)],
  i3: [leg("PO1", "2026-01-10", 20)],
  i4: [leg("PO2", "2026-02-10", 30)],
  i5: [],
};
const rows = (o) => Object.entries(o).map(([item_id, boxes]) => ({ item_id, boxes }));

test("only the orders holding an entered item are offered", () => {
  const pos = eligiblePos(rows({ i1: 5, i3: 2 }), OPEN);
  assert.deepEqual(pos.map((p) => p.po), ["PO1", "PO2"]);
  assert.equal(pos[0].items, 2);
  assert.equal(pos[0].boxes, 40);
  assert.equal(pos[1].items, 1);
});

test("an order holding only items not entered is not offered", () => {
  assert.deepEqual(eligiblePos(rows({ i3: 2 }), OPEN).map((p) => p.po), ["PO1"]);
  assert.deepEqual(eligiblePos(rows({ i5: 2 }), OPEN), []);
  assert.deepEqual(eligiblePos(rows({ i1: 2 }), undefined), []);
});

test("offered oldest first, whichever item came first", () => {
  assert.deepEqual(eligiblePos(rows({ i4: 1, i3: 1 }), OPEN).map((p) => p.po), ["PO1", "PO2"]);
});

/* An item three orders hold, the numbers as they really are — all digits. */
const THREE = [leg("2036048", "2026-01-10", 20), leg("2035525", "2026-02-10", 30), leg("2036486", "2026-03-10", 50)];
const NONE = { picks: {}, manual: {} };

test("the brief: i1 is on p1, p2 and p3; choosing p2 takes it off p2 and nothing else", () => {
  const open = { i1: [leg("p1", "2026-01-10", 20), leg("p2", "2026-02-10", 30), leg("p3", "2026-03-10", 40)], i2: [leg("p1", "2026-01-10", 9), leg("p3", "2026-03-10", 9)] };
  const c = togglePick(NONE, "i1", "p2");
  const p = placement(rows({ i1: 25 }), open, c.picks, c.manual);
  assert.deepEqual(toPins(p.byItem.i1), [{ po: "p2", boxes: 25 }]);
  assert.equal(p.ok, true);
  assert.deepEqual(leftAfter(open.i1, p.byItem.i1).map((o) => [o.po, o.left]), [["p1", 20], ["p2", 5], ["p3", 40]]);
});

test("each item's choice is its own: one item's order never moves another's", () => {
  let c = togglePick(NONE, "i1", "PO2");
  c = togglePick(c, "i2", "PO1");
  const p = placement(rows({ i1: 5, i2: 6 }), OPEN, c.picks, c.manual);
  assert.deepEqual(toPins(p.byItem.i1), [{ po: "PO2", boxes: 5 }]);
  assert.deepEqual(toPins(p.byItem.i2), [{ po: "PO1", boxes: 6 }]);
  const off = togglePick(c, "i1", "PO2");
  assert.deepEqual(off.picks.i2, ["PO1"]);
  assert.equal(placement(rows({ i1: 5, i2: 6 }), OPEN, off.picks, off.manual).short, 5);
});

test("orders fill in the order they are chosen, not by age or by number", () => {
  const p = placeRow({ boxes: 60 }, THREE, ["2036486", "2036048", "2035525"]);
  assert.deepEqual(p.legs, [{ po: "2036486", boxes: 50 }, { po: "2036048", boxes: 10 }]);
  assert.equal(p.cells["2035525"], 0);                       // chosen, not reached
  assert.equal(p.short, 0);
  assert.deepEqual(toPins(p), [{ po: "2036486", boxes: 50 }, { po: "2036048", boxes: 10 }]);
});

test("choosing a second order leaves what the first already took", () => {
  const one = placeRow({ boxes: 35 }, THREE, ["2035525"]);
  assert.deepEqual([one.cells["2035525"], one.short], [30, 5]);
  const two = placeRow({ boxes: 35 }, THREE, ["2035525", "2036048"]);   // the older order, chosen second
  assert.deepEqual([two.cells["2035525"], two.cells["2036048"], two.short], [30, 5, 0]);
});

test("an order not chosen takes nothing", () => {
  assert.deepEqual(placeRow({ boxes: 25 }, OPEN.i1, ["PO2"]).cells, { PO2: 25 });
  assert.equal(placeRow({ boxes: 25 }, OPEN.i1, []).short, 25);
  assert.equal(placeRow({ boxes: 25 }, OPEN.i1, undefined).short, 25);
});

test("an order that does not hold the item, or is named twice, is ignored", () => {
  assert.deepEqual(chosenFor(OPEN.i1, ["PO9", "PO2", "PO2"]), ["PO2"]);
  assert.equal(placeRow({ boxes: 5 }, OPEN.i1, ["PO9"]).short, 5);
});

test("an item one order holds needs no choosing, and cannot be split", () => {
  const p = placeRow({ boxes: 7 }, OPEN.i3, []);
  assert.deepEqual(p.legs, [{ po: "PO1", boxes: 7 }]);
  assert.equal(p.short, 0);
  assert.deepEqual(placeRow({ boxes: 7 }, OPEN.i3, [], { PO1: 2 }).legs, [{ po: "PO1", boxes: 7 }]);
  const over = placeRow({ boxes: 27 }, OPEN.i3, []);
  assert.deepEqual([over.placed, over.spare, over.short], [20, 7, 0]);
});

test("the chosen orders running out leaves boxes short", () => {
  const p = placeRow({ boxes: 25 }, OPEN.i1, ["PO1"]);
  assert.deepEqual(p.cells, { PO1: 20 });
  assert.equal(p.short, 5);
});

test("boxes beyond every order are spare, not short", () => {
  const p = placeRow({ boxes: 60 }, OPEN.i1, ["PO1", "PO2"]);
  assert.equal(p.required, 50);
  assert.equal(p.spare, 10);
  assert.equal(p.short, 0);
  const none = placeRow({ boxes: 4 }, OPEN.i5, []);
  assert.equal(none.spare, 4);
  assert.equal(none.short, 0);
});

test("a hand split is kept, capped at what the order holds", () => {
  const p = placeRow({ boxes: 25 }, OPEN.i1, ["PO1", "PO2"], { PO1: 99, PO2: 5 });
  assert.deepEqual(p.cells, { PO1: 20, PO2: 5 });
  const q = placeRow({ boxes: 25 }, OPEN.i1, ["PO1", "PO2"], { PO1: 5, PO2: 5 });
  assert.equal(q.short, 15);
});

test("a hand split overshooting reads as negative short", () => {
  assert.equal(placeRow({ boxes: 10 }, OPEN.i1, ["PO1", "PO2"], { PO1: 8, PO2: 8 }).short, -6);
});

test("a hand split on an order not chosen does not count", () => {
  assert.deepEqual(placeRow({ boxes: 5 }, OPEN.i1, ["PO2"], { PO1: 5 }).legs, []);
});

test("retyping one figure keeps the others as they read, capped at what is open", () => {
  let c = { picks: { i1: ["PO1", "PO2"] }, manual: {} };
  const placed = placeRow({ boxes: 25 }, OPEN.i1, c.picks.i1);
  c = typeCell(c, "i1", placed, "PO1", "12", 20);
  assert.deepEqual(c.manual.i1, { PO1: 12, PO2: 5 });
  c = typeCell(c, "i1", placeRow({ boxes: 25 }, OPEN.i1, c.picks.i1, c.manual.i1), "PO2", "9999", 30);
  assert.deepEqual(c.manual.i1, { PO1: 12, PO2: 30 });
  c = typeCell(c, "i1", placeRow({ boxes: 25 }, OPEN.i1, c.picks.i1, c.manual.i1), "PO2", "", 30);
  assert.equal(c.manual.i1.PO2, 0);
});

test("choosing or letting go of an order fills that item afresh, and only that item", () => {
  const c = { picks: { i1: ["PO1", "PO2"], i2: ["PO1"] }, manual: { i1: { PO1: 1, PO2: 2 }, i2: { PO1: 3 } } };
  const t = togglePick(c, "i1", "PO2");
  assert.deepEqual(t.picks.i1, ["PO1"]);
  assert.equal(t.manual.i1, undefined);
  assert.deepEqual(t.manual.i2, { PO1: 3 });
  assert.deepEqual(c.picks.i1, ["PO1", "PO2"], "the state it was given is not changed under it");
});

test("the rest, oldest first, follows what was chosen", () => {
  const open = { x: THREE };
  let c = togglePick(NONE, "x", "2036486");
  c = fillOldest(c, "x", open.x, 75);
  assert.deepEqual(toPins(placeRow({ boxes: 75 }, THREE, c.picks.x, c.manual.x)),
    [{ po: "2036486", boxes: 50 }, { po: "2036048", boxes: 20 }, { po: "2035525", boxes: 5 }]);
  const fresh = fillOldest(NONE, "x", open.x, 75);
  assert.deepEqual(toPins(placeRow({ boxes: 75 }, THREE, fresh.picks.x, fresh.manual.x)),
    [{ po: "2036048", boxes: 20 }, { po: "2035525", boxes: 30 }, { po: "2036486", boxes: 25 }]);
  // Enough already: nothing is added.
  assert.deepEqual(fillOldest({ picks: { x: ["2036486"] }, manual: {} }, "x", open.x, 10).picks.x, ["2036486"]);
});

test("the rest, oldest first, keeps what was typed by hand", () => {
  const c = fillOldest({ picks: { x: ["2036486"] }, manual: { x: { "2036486": 7 } } }, "x", THREE, 30);
  const p = placeRow({ boxes: 30 }, THREE, c.picks.x, c.manual.x);
  assert.deepEqual(p.cells, { "2036486": 7, "2036048": 20, "2035525": 3 });
  assert.equal(p.short, 0);
});

test("filling never asks an order for more than it holds, nor places more than was packed", () => {
  for (let boxes = 0; boxes <= 130; boxes += 7) {
    for (const start of [[], ["2036486"], ["2035525", "2036048"]]) {
      for (const hand of [undefined, { "2036486": 3 }, { "2035525": 99, "2036048": 1 }]) {
        const c = fillOldest({ picks: { x: start }, manual: hand ? { x: hand } : {} }, "x", THREE, boxes);
        const p = placeRow({ boxes }, THREE, c.picks.x, c.manual.x);
        assert.equal(p.placed, Math.min(boxes, 100), `${boxes} ${start} ${JSON.stringify(hand)}`);
        p.legs.forEach((l) => assert.ok(l.boxes <= THREE.find((o) => o.po === l.po).open));
      }
    }
  }
});

test("filling with nothing known, or nothing open, changes nothing that matters", () => {
  assert.deepEqual(fillOldest(NONE, "x", undefined, 10).picks.x, []);
  assert.deepEqual(fillOldest(NONE, "x", [], 10).picks.x, []);
});

test("one order for every item it holds; the others keep theirs", () => {
  const r = rows({ i1: 5, i3: 2, i4: 3 });
  const c = pickForAll({ picks: { i1: ["PO1"], i3: ["PO1"] }, manual: { i1: { PO1: 2 }, i3: { PO1: 1 } } }, r, OPEN, "PO2");
  assert.deepEqual(c.picks, { i1: ["PO2"], i3: ["PO1"], i4: ["PO2"] });
  assert.deepEqual(c.manual, { i3: { PO1: 1 } });
  assert.equal(placement(r, OPEN, c.picks, {}).ok, true);
});

test("new boxes drop the split but keep the orders; an item taken off drops both", () => {
  const c = { picks: { i1: ["PO2"], i2: ["PO1"] }, manual: { i1: { PO2: 4 }, i2: { PO1: 1 } } };
  assert.deepEqual(forget(c, ["i1"]), { picks: c.picks, manual: { i2: { PO1: 1 } } });
  assert.deepEqual(forget(c, ["i1"], true), { picks: { i2: ["PO1"] }, manual: { i2: { PO1: 1 } } });
});

test("nonsense in a box reads as nothing", () => {
  assert.deepEqual(placeRow({ boxes: "x" }, OPEN.i1, ["PO1"]).legs, []);
  assert.deepEqual(placeRow({ boxes: 5 }, OPEN.i1, ["PO1"], { PO1: "x" }).legs, []);
  assert.deepEqual(placeRow({ boxes: -5 }, OPEN.i1, ["PO1"]).legs, []);
  assert.deepEqual(placeRow({ boxes: 2.9 }, OPEN.i1, ["PO1"]).legs, [{ po: "PO1", boxes: 2 }]);
  assert.deepEqual(placeRow({ boxes: 5 }, [leg("A", "d", "x"), leg("B", "d", 3)], ["A", "B"]).legs, [{ po: "B", boxes: 3 }]);
});

test("placement is ok only when everything sits on an order", () => {
  const r = rows({ i1: 25, i2: 2 });
  assert.equal(placement(r, OPEN, {}, {}).ok, false);
  assert.equal(placement(r, OPEN, {}, {}).short, 27);
  assert.equal(placement(r, OPEN, { i1: ["PO2"] }, {}).short, 2);
  assert.equal(placement(r, OPEN, { i1: ["PO1", "PO2"], i2: ["PO2"] }, {}).ok, true);
});

test("placement is not ok until the orders are known", () => {
  assert.equal(placement(rows({ i1: 5 }), undefined, { i1: ["PO1"] }, {}).ok, false);
  assert.equal(placement(rows({ unasked: 5 }), OPEN, { unasked: ["PO1"] }, {}).ok, false);
  assert.equal(placement(rows({ unasked: 5 }), OPEN, {}, {}).known, false);
});

test("an item not answered for yet is not called beyond what is on order", () => {
  const p = placeRow({ boxes: 5 }, undefined, ["PO1"]);
  assert.equal(p.spare, 0);
  assert.equal(p.known, false);
});

test("an item no order holds does not block the save", () => {
  const p = placement(rows({ i5: 5 }), OPEN, {}, {});
  assert.equal(p.ok, true);
  assert.equal(p.spare, 5);
});

test("overshoot blocks the save", () => {
  const p = placement(rows({ i1: 5 }), OPEN, { i1: ["PO1"] }, { i1: { PO1: 9 } });
  assert.equal(p.over, 4);
  assert.equal(p.ok, false);
});

test("what is stored drops the empties", () => {
  assert.deepEqual(toPins(placeRow({ boxes: 5 }, OPEN.i1, ["PO1", "PO2"])), [{ po: "PO1", boxes: 5 }]);
  assert.deepEqual(toPins(undefined), []);
});

test("a saved invoice opens as it was saved, orders in the order they were chosen", () => {
  const { picks, manual } = fromLines([
    { item_id: "i1", po_alloc: [{ po: "PO2", boxes: 5 }, { po: "PO1", boxes: 1 }] },
    { item_id: "i2", po_alloc: null },
    { item_id: "i3", po_alloc: [{ po: "PO1", boxes: 4 }] },
  ]);
  assert.deepEqual(picks, { i1: ["PO2", "PO1"], i3: ["PO1"] });
  assert.deepEqual(manual, { i1: { PO2: 5, PO1: 1 }, i3: { PO1: 4 } });
  assert.deepEqual(toPins(placeRow({ boxes: 6 }, OPEN.i1, picks.i1, manual.i1)), [{ po: "PO2", boxes: 5 }, { po: "PO1", boxes: 1 }]);
  assert.deepEqual(fromLines(undefined), { picks: {}, manual: {} });
});

test("editing a saved line: new boxes follow the orders it was on, in the same order", () => {
  let c = fromLines([{ item_id: "x", po_alloc: [{ po: "2036486", boxes: 4 }, { po: "2036048", boxes: 6 }] }]);
  c = forget(c, ["x"]);
  assert.deepEqual(toPins(placeRow({ boxes: 55 }, THREE, c.picks.x, c.manual.x)), [{ po: "2036486", boxes: 50 }, { po: "2036048", boxes: 5 }]);
});

test("every port on the list is offered, the buyer's own first", () => {
  const list = { ports_ship_to: ["A", "B", "NEW"] };
  assert.deepEqual(portsFor({ ports: ["B"] }, list), ["B", "A", "NEW"]);   // the reported bug: NEW was hidden
});

test("no buyer, or a buyer with no ports, is offered the whole list", () => {
  const list = { ports_ship_to: ["A", "B"] };
  assert.deepEqual(portsFor(undefined, list), ["A", "B"]);
  assert.deepEqual(portsFor({ ports: [] }, list), ["A", "B"]);
  assert.deepEqual(portsFor({ ports: ["A"] }, undefined), []);
});

test("a port removed from the list is not offered, even if a buyer holds it", () => {
  assert.deepEqual(portsFor({ ports: ["GONE", "A"] }, { ports_ship_to: ["A"] }), ["A"]);
});

/* ---- mode of transport (V-7.5.0) ------------------------------------------ */
import {
  shipMode, entryModes, listFor, unconfirmed, containerDone, shipStepDone, shipComplete,
  docsForMode, docInMode, carriageRef, flightLegs, MODE_CHECKLIST, SEA_ONLY_DOCS, AIR_ONLY_DOCS,
} from "../src/lib/modes.js";

const OPTS = {
  ports_loading: ["NHAVA SHEVA", "SAHAR AIR CARGO", "PETRAPOLE", "OLD PORT"],
  ports_ship_to: ["FREMANTLE", "PERTH"],
  terms_delivery: ["FOB MUMBAI", "CFR PERTH"],
  terms_payment: ["D.P.SIGHT DRAFT"],
  modes: {
    ports_loading: { "NHAVA SHEVA": ["water"], "SAHAR AIR CARGO": ["air"], PETRAPOLE: ["land"] },
    ports_ship_to: { FREMANTLE: ["water"], PERTH: ["water", "air"] },
    terms_delivery: { "FOB MUMBAI": ["water", "air"], "CFR PERTH": ["air"] },
  },
};

test("an invoice with no mode, or a stray one, is a sea shipment", () => {
  assert.equal(shipMode(undefined), "water");
  assert.equal(shipMode({}), "water");
  assert.equal(shipMode({ mode: "AIR" }), "air");
  assert.equal(shipMode({ mode: "rocket" }), "water");
  assert.equal(shipMode({ mode: "land" }), "land");
});

test("each mode is offered only the ports ticked for it", () => {
  assert.deepEqual(listFor(OPTS, "ports_loading", "air"), ["SAHAR AIR CARGO"]);
  assert.deepEqual(listFor(OPTS, "ports_loading", "land"), ["PETRAPOLE"]);
  assert.deepEqual(listFor(OPTS, "ports_ship_to", "air"), ["PERTH"]);
  assert.deepEqual(listFor(OPTS, "terms_delivery", "air"), ["FOB MUMBAI", "CFR PERTH"]);
});

test("an entry saved before modes existed counts as sea, and is flagged", () => {
  assert.deepEqual(entryModes(OPTS, "ports_loading", "OLD PORT"), ["water"]);
  assert.ok(listFor(OPTS, "ports_loading", "water").includes("OLD PORT"));
  assert.ok(!listFor(OPTS, "ports_loading", "air").includes("OLD PORT"));
  assert.deepEqual(unconfirmed(OPTS, "ports_loading"), ["OLD PORT"]);
  assert.deepEqual(unconfirmed(OPTS, "terms_payment"), []);
});

test("a list without modes is offered whole whatever the mode", () => {
  assert.deepEqual(listFor(OPTS, "terms_payment", "air"), ["D.P.SIGHT DRAFT"]);
  assert.deepEqual(listFor({}, "ports_loading", "air"), []);
});

test("sea step 2 needs container and seal; air step 2 needs both airports", () => {
  assert.equal(containerDone({ container: "C", seal: "S" }), true);
  assert.equal(containerDone({ container: "C" }), false);
  assert.equal(containerDone({ mode: "air", container: "C", seal: "S" }), false);
  assert.equal(containerDone({ mode: "air", pol: "SAHAR", pod: "PERTH" }), true);
  assert.equal(containerDone({ mode: "air", pol: "SAHAR" }), false);
  assert.equal(containerDone({}, { container: true }), true);
});

test("sea step 3 needs the BL; air step 3 needs the AWB, airline and a flight", () => {
  assert.equal(shipStepDone({ blNo: "B", blDate: "2026-01-01", vessel: "V" }), true);
  const air = { mode: "air", awbNo: "232-1", awbDate: "2026-11-09", airline: "MH" };
  assert.equal(shipStepDone(air), false);
  assert.equal(shipStepDone({ ...air, flights: [{ no: " ", date: "" }] }), false);
  assert.equal(shipStepDone({ ...air, flights: [{ no: "MH195", date: "" }] }), true);
  assert.equal(shipStepDone({ mode: "air", blNo: "B", blDate: "2026-01-01", vessel: "V" }), false);
  assert.equal(shipStepDone({}, { ship: true }), true);
});

test("the land rules are the sea rules", () => {
  assert.equal(containerDone({ mode: "land", container: "C", seal: "S" }), true);
  assert.equal(shipStepDone({ mode: "land", blNo: "B", blDate: "d", vessel: "V" }), true);
});

test("complete shipment details follow the mode", () => {
  assert.equal(shipComplete({ blNo: "B", vessel: "V", container: "C", pod: "P" }), true);
  assert.equal(shipComplete({ mode: "air", awbNo: "1", airline: "MH", flights: [{ no: "MH1" }], pod: "PERTH" }), true);
  assert.equal(shipComplete({ mode: "air", awbNo: "1", airline: "MH", pod: "PERTH" }), false);
});

test("the papers offered follow the mode", () => {
  const all = ["14", "16", "16A", "18", "24", "26", "26A", "27", "34"];
  // By air only the client's air set (Docs/JG_Air_Docs) — no RoDTEP (16), no container papers.
  assert.deepEqual(docsForMode(all, "air"), ["14", "16A", "18", "26A"]);
  assert.deepEqual(docsForMode(["7", "8", "20", "22", "29", "32", "35"], "air"), []);
  MODE_CHECKLIST.air.generated.forEach((no) => assert.equal(docInMode(no, "air"), true, no));
  assert.deepEqual(docsForMode(all, "water"), ["14", "16", "18", "24", "26", "27", "34"]);
  assert.deepEqual(docsForMode(all, "land"), docsForMode(all, "water"));
  SEA_ONLY_DOCS.forEach((no) => assert.equal(docInMode(no, "air"), false));
  AIR_ONLY_DOCS.forEach((no) => assert.equal(docInMode(no, "water"), false));
});

test("the air checklist lists no container paper and every air-only paper", () => {
  const g = MODE_CHECKLIST.air.generated;
  SEA_ONLY_DOCS.forEach((no) => assert.ok(!g.includes(no), no));
  AIR_ONLY_DOCS.forEach((no) => assert.ok(g.includes(no), no));
  AIR_ONLY_DOCS.forEach((no) => assert.ok(!MODE_CHECKLIST.water.generated.includes(no), no));
});

test("the consignment is named by its container by sea, its AWB by air", () => {
  assert.equal(carriageRef({ container: "OOCU1" }), "OOCU1");
  assert.equal(carriageRef({ mode: "air", awbNo: "232-1", container: "OOCU1" }), "AWB 232-1");
  assert.equal(carriageRef({ mode: "air" }), "");
  assert.deepEqual(flightLegs({ flights: [{ no: "" }, null, { no: "MH1" }] }), [{ no: "MH1" }]);
  assert.deepEqual(flightLegs({ flights: "junk" }), []);
});

/* ---- the Word copies ------------------------------------------------------ */
import { readZip, xmlErrors } from "./docx-check.mjs";
import { buildDOCX, buildDOCXPacked } from "../src/lib/docx.js";
import { zipBlob, zipBlobPacked, X } from "../src/lib/zip.js";
import { faceOf, gridLines, halfPoints, hexOf, lineOf, perLine, winner } from "../src/lib/htmlDocx.js";
import { wordBlob } from "../src/lib/download.js";

const open = async (blob) => readZip(Buffer.from(await blob.arrayBuffer()));
const bodyOf = async (blob) => (await open(blob))["word/document.xml"].toString("utf8");
const sound = async (blob) => {
  const files = await open(blob);
  const bad = Object.entries(files).filter(([n]) => /\.(xml|rels)$/.test(n)).flatMap(([n, d]) => xmlErrors(d.toString("utf8"), n));
  assert.deepEqual(bad, []);
  return files;
};
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
const edge = { val: "single", sz: 6, color: "000000" };

test("colours: solid, tinted over white, and none", () => {
  assert.equal(hexOf("rgb(11, 44, 77)"), "0B2C4D");
  assert.equal(hexOf("rgba(0, 0, 0, 0)"), "");
  assert.equal(hexOf("rgba(0, 0, 0, 0.5)"), "808080");
  assert.equal(hexOf("rgb(11 44 77 / 50%)"), "8596A6");
  assert.equal(hexOf("transparent"), "");
  assert.equal(hexOf(undefined), "");
});

test("faces: the first a list asks for, generics by a name Word knows", () => {
  assert.equal(faceOf('"Times New Roman", Times, serif'), "Times New Roman");
  assert.equal(faceOf("Centaur, Georgia, serif"), "Centaur");
  assert.equal(faceOf("sans-serif"), "Arial");
  assert.equal(faceOf(""), "Calibri");
});

test("type is measured to the half point and never rounded up past its cell", () => {
  assert.equal(halfPoints(13.3333), 10);      // 10pt
  assert.equal(halfPoints(8.66667), 6.5);     // 6.5pt
  assert.equal(halfPoints(9.2), 6.5);         // 6.9pt
  assert.equal(halfPoints(0.1), 1);
});

test("line heights are said against the face's own single line", () => {
  assert.equal(lineOf("normal", 14, "Calibri"), 240);
  assert.equal(lineOf("17.0898px", 14, "Calibri"), 240);
  assert.ok(lineOf("28px", 14, "Arial") > 400);
  assert.equal(lineOf("2px", 14, "Arial"), 200);     // never so tight the type is cut
  assert.equal(lineOf("500px", 14, "Arial"), 600);
});

test("of two rules on one edge: the wider, then the stronger, then the first", () => {
  const thin = { style: "solid", px: 1, color: "D9D9D9" }, thick = { style: "solid", px: 2, color: "000000" };
  const dbl = { style: "double", px: 1, color: "000000" }, other = { ...thin, color: "000000" };
  assert.equal(winner(thin, thick), thick);
  assert.equal(winner(thin, dbl), dbl);
  assert.equal(winner(thin, other), thin);
  assert.equal(winner(null, other), other);
  assert.equal(winner(null, null), null);
});

test("edges a hair apart are one column line", () => {
  assert.deepEqual(gridLines([0, 100.2, 100, 50, 50.4, 100]), [0, 50, 100]);
  assert.deepEqual(gridLines([]), []);
});

test("a justified paragraph is split at its typed breaks, and only a justified one", () => {
  const p = { kind: "p", align: "both", before: 100, runs: [{ text: "a\nb", bold: true }, { text: "c\n\nd" }] };
  const out = perLine(p);
  assert.deepEqual(out.map((q) => q.runs.map((r) => r.text).join("")), ["a", "bc", "", "d"]);
  assert.deepEqual(out.map((q) => q.before), [100, undefined, undefined, undefined]);
  assert.ok(out[1].runs[0].bold);
  assert.equal(perLine({ align: "", runs: [{ text: "a\nb" }] }).length, 1);
  assert.equal(perLine({ align: "both", runs: [{ image: {} }, { text: "a" }] }).length, 1);
});

test("a document of every kind of block is a sound package", async () => {
  const doc = {
    modern: true,
    sections: [
      { page: { w: 16838, h: 11906, top: 500, bottom: 300, left: 500, right: 500, landscape: true }, font: { name: "Arial", size: 9 }, blocks: [
        { kind: "p", runs: [{ text: "Tab", bold: true, italic: true, underline: true, color: "#8B0000", spacing: 20, scale: 92, vert: "super" }, { tab: true }, { text: "to\nhere" }], tabs: [900, 300, 300], align: "both", before: 100, after: 40, indent: { left: 200 }, keepNext: true, rule: edge },
        { kind: "tbl", grid: [1000, 2000, 500], indent: -20, borders: "none", rows: [
          { header: true, whole: true, height: 300, cells: [{ text: "A", vmerge: "start", edges: { top: edge, right: edge }, shade: "C0C0C0", margins: { left: 30 }, valign: "center" }, ["B", 2]] },
          { fixed: true, height: 80, cells: [{ vmerge: "on", blocks: [] }, { span: 2, blocks: [{ kind: "tbl", grid: [2500], rows: [[["nested"]]] }] }] },
        ] },
        { kind: "tbl", grid: [3500], rows: [[["a second table straight after"]]] },
      ] },
      { page: {}, blocks: [{ kind: "p", text: "closing" }, { kind: "p", runs: [{ image: { data: PNG, cx: 9525, cy: 9525 } }, { image: { data: PNG, cx: 9525, cy: 9525, crop: 0.01, float: { x: 10, y: -10 } } }] }] },
      { page: {}, blocks: [] },
    ],
  };
  const files = await sound(buildDOCX(doc));
  const xml = files["word/document.xml"].toString("utf8");
  assert.equal((xml.match(/<w:sectPr>/g) || []).length, 3);
  assert.match(xml, /w:orient="landscape"/);
  assert.equal(Object.keys(files).filter((n) => n.startsWith("word/media/")).length, 1, "one picture, used twice, is carried once");
  assert.match(files["word/settings.xml"].toString("utf8"), /compatibilityMode/);
  // Compressed, it says the same.
  const packed = await sound(await buildDOCXPacked(doc));
  assert.equal(packed["word/document.xml"].toString("utf8"), xml);
});

test("what is typed cannot break the file", async () => {
  const nasty = 'A&B <b>"x"</b> ]]> \u0000\u0007￾￿ 😀 ₹ “q” \uD800';
  const files = await sound(buildDOCX({ blocks: [{ kind: "p", text: nasty }, { kind: "tbl", grid: [900], rows: [[{ text: nasty, shade: '"><x' }]] }], font: { name: 'Ari"al<' } }));
  assert.match(files["word/document.xml"].toString("utf8"), /A&amp;B &lt;b&gt;/);
  assert.equal(X("a\u0000b￿c"), "abc");
});

test("an empty document and one ending on a table still open", async () => {
  await sound(buildDOCX({}));
  await sound(buildDOCX({ blocks: [{ kind: "tbl", grid: [100], rows: [[["x"]]] }] }));
});

test("a zip survives compression, and stores what cannot be made smaller", async () => {
  const files = [
    { name: "a.xml", data: new TextEncoder().encode("<x>".repeat(5000)) },
    { name: "é₹.txt", data: new TextEncoder().encode("short") },
    { name: "n.bin", data: Uint8Array.from({ length: 4000 }, (_, i) => (i * 7919 * (i ^ 91)) & 255) },
    { name: "empty", data: new Uint8Array(0) },
  ];
  const plain = await open(zipBlob(files, "x/y"));
  const packed = await zipBlobPacked(files, "x/y");
  const back = await open(packed);
  files.forEach((f) => { assert.deepEqual([...back[f.name]], [...f.data]); assert.deepEqual([...plain[f.name]], [...f.data]); });
  assert.ok(packed.size < zipBlob(files, "x/y").size / 2);
});

test("without the browser's compressor the file is stored, not lost", async () => {
  const keep = globalThis.CompressionStream;
  try {
    globalThis.CompressionStream = undefined;
    const back = await open(await zipBlobPacked([{ name: "a", data: new TextEncoder().encode("z".repeat(2000)) }], "x/y"));
    assert.equal(back.a.toString(), "z".repeat(2000));
    globalThis.CompressionStream = class { constructor() { throw new Error("refused"); } };
    assert.equal((await open(await zipBlobPacked([{ name: "a", data: new TextEncoder().encode("z".repeat(2000)) }], "x/y"))).a.length, 2000);
  } finally { globalThis.CompressionStream = keep; }
});

test("nothing to write is nothing, and a typed document needs no layout", async () => {
  assert.equal(await wordBlob([]), null);
  assert.equal(await wordBlob([null, {}]), null);
  const xml = await bodyOf(await wordBlob([{ docx: { blocks: [{ kind: "p", text: "typed" }] }, html: "<p>not this</p>" }]));
  assert.match(xml, /typed/);
  assert.doesNotMatch(xml, /not this/);
});

test("the release notes and every version string agree", async () => {
  const fs = await import("node:fs");
  const { APP_VERSION, RELEASES } = await import("../src/lib/releases.js");
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
  assert.equal(JSON.parse(read("../package.json")).version, APP_VERSION);
  const lock = JSON.parse(read("../package-lock.json"));
  assert.equal(lock.version, APP_VERSION);
  assert.equal(lock.packages[""].version, APP_VERSION);
  assert.ok(read("../../backend/app/main.py").includes(`version="${APP_VERSION}"`));
  assert.equal(RELEASES[0].version, APP_VERSION);
  assert.deepEqual(RELEASES.map((r) => r.version), [...new Set(RELEASES.map((r) => r.version))]);
});

/* ---- what the page is served with ------------------------------------------ */
test("every nginx location that sets a header carries the security headers too", async () => {
  const fs = await import("node:fs");
  const conf = fs.readFileSync(new URL("../nginx.conf", import.meta.url), "utf8").replace(/#.*$/gm, "");
  const inc = "include /etc/nginx/security-headers.conf;";
  const locations = [...conf.matchAll(/location\s+([^{]+)\{([^}]*)\}/g)];
  assert.ok(locations.length >= 4);
  locations.forEach(([, where, body]) => {
    if (/add_header/.test(body)) assert.ok(body.includes(inc), `location ${where.trim()} drops them`);
  });
  assert.ok(conf.slice(0, conf.indexOf("location")).includes(inc), "the server itself");
  assert.match(fs.readFileSync(new URL("../Dockerfile", import.meta.url), "utf8"), /COPY security-headers\.conf \/etc\/nginx\/security-headers\.conf/);
  // The two hosts send the same policy.
  const sent = Object.fromEntries([...fs.readFileSync(new URL("../security-headers.conf", import.meta.url), "utf8").replace(/^#.*$/gm, "")
    .matchAll(/add_header (\S+) "([^"]+)" always;/g)].map((m) => [m[1], m[2]]));
  const vercel = Object.fromEntries(JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).headers[0].headers.map((h) => [h.key, h.value]));
  ["Content-Security-Policy", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Cross-Origin-Opener-Policy"].forEach((k) => assert.equal(sent[k], vercel[k], k));
  assert.match(sent["Content-Security-Policy"], /script-src 'self';/);
});

/* ---- the item sequence: a plain pipe, then its PH twin --------------------- */
const { sortBySequence, pipeLength } = await import("../src/lib/sequence.js");
const seedItems = async () => {
  const fs = await import("node:fs");
  const { items } = JSON.parse(fs.readFileSync(new URL("../../backend/app/data/masters_seed.json", import.meta.url), "utf8"));
  return items.map((x) => ({ ...x, supplier_id: x.supplier_code }));
};
const shuffle = (list) => { let n = 11; return list.map((x) => [(n = (n * 1103515245 + 12345) % 2147483648), x]).sort((a, b) => a[0] - b[0]).map(([, x]) => x); };
const suppliersOf = (items) => [...new Set(items.map((x) => x.supplier_code))].map((c) => ({ id: c, code: c, name: c }));

test("25 MM as photographed: the plain pipe leads, its PH pipe follows", () => {
  const want = [["PE2524", "610"], ["PE2524PH", "600"], ["PE2530", "760"], ["PE2530PH", "750"], ["PE2536", "915"], ["PE2536PH", "900"],
    ["PE2548", "1220"], ["PE2548PH", "1200"], ["PE2572", "1800"], ["PE2572PH", "1800"]];
  const items = want.map(([gd, length]) => ({ gd, code: gd, size: "25", length, group: '25 MM (1")', source_sheet: "Oswin" }));
  assert.deepEqual(sortBySequence(shuffle(items)).map((x) => x.gd), want.map((w) => w[0]));
});

test("every bore reads as the client's own sheet does", async () => {
  const items = await seedItems();
  const groups = {};
  sortBySequence(shuffle(items), { suppliers: suppliersOf(items) }).filter((x) => x.source_sheet === "Oswin")
    .forEach((x) => (groups[x.group] ||= []).push(x.source_row));
  assert.equal(Object.keys(groups).length, 10);
  Object.entries(groups).forEach(([g, at]) => assert.deepEqual(at, [...at].sort((a, b) => a - b), g));
});

test("a code that is not a bore and inches goes by the master's length", () => {
  assert.deepEqual(pipeLength({ gd: "PFH-1905", length: "5" }), [5, "PFH1905", 0]);
  assert.deepEqual(pipeLength({ gd: "PEL-153", length: "3000" }), [3000, "PEL-153", 0]);
  assert.equal(pipeLength({ gd: "PE2524", length: "1500" })[0], 1500);
  assert.equal(pipeLength({ gd: "PE2536", length: "" })[0], 900);
  assert.deepEqual(pipeLength({ gd: "pe 2524-ph", length: "600" }), [600, "PE2524", 1]);
  ["nan", "Infinity", "1,220", null, undefined].forEach((length) => assert.ok(Number.isFinite(pipeLength({ gd: "X", length })[0])));
});

test("codes are compared letter by letter, as the server does", () => {
  const items = ["b1", "A-2", "A1", "B1"].map((gd) => ({ gd, code: gd, source_sheet: "Kiran" }));
  assert.deepEqual(sortBySequence(items).map((x) => x.gd), ["A-2", "A1", "B1", "b1"]);
});

/* ---- the documents carry names, not numbers -------------------------------- */
const docsLib = await import("../src/lib/docs.js");
const { docSheets } = await import("../src/lib/download.js");

test("PO Reports no longer holds the Buyers Order", () => {
  const { DOC_GROUPS, DOC_META, PO_DOCS, hasBuilder, isPoDoc } = docsLib;
  assert.deepEqual(PO_DOCS, ["2", "3", "4", "5", "6"]);
  assert.ok(!DOC_GROUPS.some((g) => g.docs.includes("1")));
  assert.ok(!DOC_META["1"] && !hasBuilder("1") && !isPoDoc("1"));
  DOC_GROUPS.flatMap((g) => g.docs).forEach((no) => { assert.ok(DOC_META[no], no); assert.ok(hasBuilder(no), no); });
});

test("a paper's own name tells it apart from every other", () => {
  const { DOC_GROUPS, docFullTitle, docTitle } = docsLib;
  const nos = [...new Set(DOC_GROUPS.flatMap((g) => g.docs))];
  const names = nos.map(docFullTitle);
  assert.deepEqual(names.length, new Set(names).size);
  names.forEach((n) => assert.doesNotMatch(n, /\d/));
  // Under one menu head the short name is enough.
  DOC_GROUPS.forEach((g) => assert.equal(new Set(g.docs.map(docTitle)).size, g.docs.length, g.t));
});

test("a search finds a paper by its name, or by its old number typed whole", () => {
  const { docMatches } = docsLib;
  assert.ok(docMatches("18", "custom") && docMatches("18", "18") && docMatches("16A", "16a") && docMatches("27", " vgm "));
  assert.ok(!docMatches("18", "8") && !docMatches("18", "1") && docMatches("18", "") && docMatches("7", "supplier"));
});

test("no screen, file name or title prints a document number", async () => {
  const fs = await import("node:fs");
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(new URL(`${e.name}/`, d)) : [new URL(e.name, d)]));
  const files = walk(new URL("../src/", import.meta.url)).filter((f) => /\.jsx?$/.test(f.pathname) && !f.pathname.endsWith("releases.js"));
  const bad = [];
  files.forEach((f) => {
    // Comments may still speak of the papers by number; what is printed may not.
    const code = fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
    [/["'`>](\d{1,2}A?) · [A-Z]/, /\$\{(no|open)\} · /, /Document \$\{(no|open)\}/, /Report 3\d/, /Doc_\$\{/, /document \d{1,2}\b/i,
      /name: "[A-Za-z_]+_\d{1,2}A?"/, /[a-z] \((\d{2}A?|[1-9])\)[."<]/, /className="doc-no"/].forEach((re) => {
      const m = re.exec(code);
      if (m) bad.push(`${f.pathname.split("/src/")[1]}: ${m[0]}`);
    });
  });
  assert.deepEqual(bad, []);
});

test("gathered tabs keep Excel's limits, and the formulas between them follow", () => {
  const book = (cell) => [{ name: "Page1", rows: [[{ v: 1 }]] }, { name: "Page2", rows: [[{ f: cell }]] }];
  const long = "A paper with a very long name indeed";
  const tabs = docSheets([{ name: long, sheets: book("Page1!A1") }, { name: long, sheets: book("Page1!A1*2") }, { name: "Packing", sheet: { name: "x", rows: [] } },
    { name: "Packing", sheet: { name: "x", rows: [] } }]);
  const names = tabs.map((t) => t.name);
  assert.equal(new Set(names.map((n) => n.toLowerCase())).size, names.length);
  names.forEach((n) => assert.ok(n.length <= 31 && !/[\\/?*[\]:]/.test(n), n));
  assert.equal(tabs[1].rows[0][0].f, `'${names[0]}'!A1`);
  assert.equal(tabs[3].rows[0][0].f, `'${names[2]}'!A1*2`);
  // On its own a paper keeps the tab names its source file uses.
  assert.deepEqual(docSheets([{ name: long, sheets: book("Page1!A1") }]).map((t) => t.name), ["Page1", "Page2"]);
});

/* ---- "new update available" ------------------------------------------------ */
const { latestBuild, runningBuild, watchForUpdate, CHECK_GAP, VERSION_URL } = await import("../src/lib/appUpdate.js");
const target = () => {
  const on = {};
  return { on, addEventListener: (k, f) => { (on[k] ||= new Set()).add(f); }, removeEventListener: (k, f) => on[k]?.delete(f), fire: async (k) => { for (const f of on[k] || []) await f(); } };
};
function bench(build, answers) {
  const win = target(), doc = { ...target(), visibilityState: "visible" };
  let clock = 0, tick = null, calls = 0;
  win.setInterval = (f) => { tick = f; return 1; };
  win.clearInterval = () => { tick = null; };
  const seen = [];
  const fetchFn = async (url, opt) => {
    calls += 1;
    assert.equal(url, VERSION_URL);
    assert.equal(opt.cache, "no-store");
    const a = answers[Math.min(calls, answers.length) - 1];
    if (a instanceof Error) throw a;
    return { ok: a.ok ?? true, json: async () => { if (a.html) throw new SyntaxError("<!doctype"); return a.body; } };
  };
  const stop = watchForUpdate({ build, onChange: (x) => seen.push(x), fetchFn, win, doc, now: () => clock });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { win, doc, seen, stop, settle, get calls() { return calls; }, get ticking() { return !!tick; },
    later: async (ms, how = "tick") => { clock += ms; if (how === "tick") await tick?.(); else if (how === "visible") await doc.fire("visibilitychange"); else await win.fire(how); await settle(); } };
}
const V = (build, version = "9.9.9") => ({ body: { build, version } });

test("a tab on the latest build says nothing; a newer one is announced with its version", async () => {
  const b = bench("aaa", [V("aaa"), V("bbb")]);
  await b.settle();
  assert.deepEqual(b.seen, [null]);
  await b.later(CHECK_GAP);
  assert.deepEqual(b.seen[1], { build: "bbb", version: "9.9.9" });
  b.stop();
});

test("a deploy taken back takes the notice back too", async () => {
  const b = bench("aaa", [V("bbb"), V("aaa")]);
  await b.settle();
  await b.later(CHECK_GAP);
  assert.deepEqual(b.seen, [{ build: "bbb", version: "9.9.9" }, null]);
  b.stop();
});

test("coming back to the tab checks, but not more often than the gap", async () => {
  const b = bench("aaa", [V("aaa")]);
  await b.settle();
  await b.later(10, "visible");
  await b.later(10, "focus");
  assert.equal(b.calls, 1);
  await b.later(CHECK_GAP, "focus");
  assert.equal(b.calls, 2);
  await b.later(CHECK_GAP, "online");
  assert.equal(b.calls, 3);
  b.doc.visibilityState = "hidden";
  await b.later(CHECK_GAP);
  assert.equal(b.calls, 3, "a tab nobody is looking at does not ask");
  b.stop();
});

test("a check that fails says nothing, and the next one still works", async () => {
  const b = bench("aaa", [new TypeError("offline"), { ok: false, body: {} }, { html: true }, { body: null }, { body: { build: "" } }, { body: { build: 5 } }, V("bbb")]);
  await b.settle();
  for (let i = 0; i < 6; i++) await b.later(CHECK_GAP);
  assert.deepEqual(b.seen, [{ build: "bbb", version: "9.9.9" }]);
  b.stop();
});

test("once stopped nothing is listened to, and development never asks", async () => {
  const b = bench("aaa", [V("bbb")]);
  b.stop();
  await b.settle();
  assert.deepEqual(b.seen, [], "an answer that lands after it was stopped is dropped");
  assert.equal(b.ticking, false);
  [...Object.values(b.win.on), ...Object.values(b.doc.on)].forEach((s) => assert.equal(s.size, 0));
  const dev = bench("", [V("bbb")]);
  await dev.settle();
  assert.equal(dev.calls, 0);
  assert.equal(runningBuild({ querySelector: () => null }), "");
  assert.equal(await latestBuild(async () => { throw new Error("x"); }), null);
});

test("the build stamps the page and version.json alike, and only when something changed", async () => {
  const { buildStamp } = await import("../vite.config.js");
  const run = (files, html = "<html><head><title>x</title></head><body></body></html>") => {
    const bundle = { "index.html": { source: html }, ...Object.fromEntries(files.map((f) => [f, {}])) };
    const out = {};
    buildStamp().generateBundle.call({ emitFile: (f) => { out[f.fileName] = f.source; } }, {}, bundle);
    const json = JSON.parse(out["version.json"]);
    assert.match(bundle["index.html"].source, new RegExp(`<meta name="app-build" content="${json.build}" />\\s*</head>`));
    return json;
  };
  const { APP_VERSION } = await import("../src/lib/releases.js");
  const a = run(["assets/index-1.js", "assets/index-1.css"]);
  assert.equal(a.version, APP_VERSION);
  assert.equal(run(["assets/index-1.css", "assets/index-1.js"]).build, a.build);
  assert.notEqual(run(["assets/index-2.js", "assets/index-1.css"]).build, a.build);
  assert.notEqual(run(["assets/index-1.js", "assets/index-2.css"]).build, a.build);
  assert.throws(() => run([], ""), /index\.html/);
});

test("version.json is never cached, on either host", async () => {
  const fs = await import("node:fs");
  const conf = fs.readFileSync(new URL("../nginx.conf", import.meta.url), "utf8");
  assert.match(conf, /location = \/version\.json \{[^}]*no-store[^}]*\}/);
  const v = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.match(JSON.stringify(v.headers.find((h) => h.source === "/version.json")), /no-store/);
});

/* ---- Price list (V-7.9.0) ------------------------------------------------- */
test("a margin is worked out as the API works it: half up, ₹ to the paisa, $ to four places", async () => {
  const { roundTo, markedUp, marginOf, figure, sameFig } = await import("../src/lib/prices.js");
  assert.equal(roundTo(5.175, 2), 5.18);
  assert.equal(roundTo(1.005, 2), 1.01);
  assert.equal(roundTo(0.00005, 4), 0.0001);
  // The brief: ₹100 and $1 at 50% are ₹150 and $1.50.
  assert.deepEqual(markedUp({ unit_value: 100, value_mode: "piece", unit_fob100: 1, fob_mode: "piece" }, 50),
    { unit_value: 150, value_mode: "piece", unit_fob100: 1.5, fob_mode: "piece" });
  assert.deepEqual(markedUp({ unit_value: 3.45, value_mode: "piece", unit_fob100: 3.6, fob_mode: "100" }, 50),
    { unit_value: 5.18, value_mode: "piece", unit_fob100: 5.4, fob_mode: "100" });
  assert.equal(marginOf(150, 100), 50);
  assert.equal(marginOf(1, 0), null);
  assert.equal(figure(""), null);
  assert.equal(figure("1."), 1);
  assert.equal(figure("-2"), null);
  assert.ok(sameFig(0.1 + 0.2, 0.3));
});

test("leaving a screen with unsaved work asks it first, and goes on once it agrees", async () => {
  const { guardedLeave, setLeaveGuard, clearLeaveGuard, hasLeaveGuard } = await import("../src/lib/leaveGuard.js");
  let went = 0;
  guardedLeave(() => { went += 1; });
  assert.equal(went, 1);
  let asked = null;
  const guard = { ask: (proceed) => { asked = proceed; } };
  setLeaveGuard(guard);
  assert.ok(hasLeaveGuard());
  guardedLeave(() => { went += 1; });
  assert.equal(went, 1);              // held until the screen answers
  asked();
  assert.equal(went, 2);
  clearLeaveGuard({ ask: () => {} });  // somebody else's guard does not clear this one
  assert.ok(hasLeaveGuard());
  clearLeaveGuard(guard);
  assert.ok(!hasLeaveGuard());
});

/* ---- Packaging: line → orders → length → item → box family (V-7.10.2) ---- */
import { cleanRules, fromOrders, itemPack, lengthMm, legsFromPlaced, linePack, packKind, rulePack } from "../src/lib/packaging.js";
import { bundled, inBundles, isBundle } from "../src/lib/docs/common.js";

const pipe = (length, packaging_type = "Cartons", extra = {}) => ({ code: "PP1512", gd: "PP1512", group: "15 MM", length, packaging_type, ...extra });
const TYPES = ["Cartons", "Bundle", "Demo pack"];
const RULES = [{ type: "Bundle", above_mm: 1000 }, { type: "Demo pack", above_mm: 3000 }];

test("lengths read as millimetres, whatever is typed round them", () => {
  assert.equal(lengthMm("1800"), 1800);
  assert.equal(lengthMm("1,800 mm"), 1800);
  assert.equal(lengthMm("457.5MM"), 457.5);
  assert.equal(lengthMm(""), null);
  assert.equal(lengthMm(undefined), null);
  assert.equal(lengthMm("N/A"), null);
});

test("lengths per packaging type: one each, on the list, longest first", () => {
  assert.deepEqual(cleanRules(RULES), [{ type: "Demo pack", above_mm: 3000 }, { type: "Bundle", above_mm: 1000 }]);
  assert.deepEqual(cleanRules({ rules: RULES }), cleanRules(RULES));
  assert.deepEqual(cleanRules({ type: "Bundle", above_mm: "900" }), [{ type: "Bundle", above_mm: 900 }]);
  assert.deepEqual(cleanRules([{ type: "Bundle", above_mm: 0 }, { type: "", above_mm: 5 }, null]), []);
  assert.deepEqual(cleanRules([{ type: "bundle", above_mm: 1000 }, { type: "Crate", above_mm: 9 }], TYPES), [{ type: "Bundle", above_mm: 1000 }]);
  assert.deepEqual(cleanRules(null), []);
});

test("an item goes in the type of the longest length it passes, else its own", () => {
  assert.equal(rulePack(pipe("1800"), RULES), "Bundle");
  assert.equal(rulePack(pipe("3500"), RULES), "Demo pack");          // past both: the longer wins
  assert.equal(rulePack(pipe("1000"), RULES), null);                 // not above
  assert.equal(rulePack(pipe(""), RULES), null);                     // no length
  assert.equal(itemPack(pipe("600", "Bundles"), RULES), "Bundles");  // the item's own
  assert.equal(itemPack(pipe("600", "Demo pack"), RULES), "Demo pack");
  assert.equal(itemPack(pipe("1800"), null), "Cartons");              // no rule: as before
  assert.equal(itemPack({ packagingType: "Bundles", length: "300" }, null), "Bundles"); // document item
  assert.equal(packKind("Bundle"), "bundle");
  assert.equal(packKind("HDP BDL"), "bundle");
  assert.equal(packKind("Demo pack"), "carton");
  assert.equal(packKind(""), null);
});

test("a line's own choice wins, then its orders', then the lengths, the item, the boxes", () => {
  const k = (...a) => { const x = linePack(...a); return [x.kind, x.source, x.bundle]; };
  assert.deepEqual(k(pipe("1800"), RULES, "Cartons"), ["Cartons", "line", false]);
  assert.deepEqual(k(pipe("300"), RULES, "Demo pack"), ["Demo pack", "line", false]);
  assert.deepEqual(k(pipe("300"), RULES, null, [{ po: "A", boxes: 3, packaging: "Bundle" }]), ["Bundle", "order", true]);
  assert.deepEqual(k(pipe("1800"), RULES, null, []), ["Bundle", "rule", true]);
  assert.deepEqual(k(pipe("300", "Bundles"), RULES), ["Bundles", "item", true]);
  assert.deepEqual(k(pipe("300", "Demo pack"), RULES), ["Demo pack", "item", false]);
  assert.deepEqual(k({ code: "GD3", group: "CORRUGATED BOXES", length: "" }, RULES, null, null, TYPES), ["Bundle", "box", true]);
  assert.deepEqual(k(pipe("300"), RULES), ["Cartons", "default", false]);
});

test("orders count only when every one the line clears agrees", () => {
  assert.equal(fromOrders([{ po: "A", boxes: 2, packaging: "Bundle" }, { po: "B", boxes: 1, packaging: "bundle" }]), "Bundle");
  assert.equal(fromOrders([{ po: "A", boxes: 2, packaging: "Bundle" }, { po: "B", boxes: 1 }]), null);
  assert.equal(fromOrders([{ po: "A", boxes: 2, packaging: "Bundle" }, { po: "B", boxes: 1, packaging: "Cartons" }]), null);
  assert.equal(fromOrders([]), null);
  assert.equal(fromOrders(null), null);
  assert.deepEqual(legsFromPlaced({ cells: { A: 2, B: 0 } }, [{ po: "A", packaging: "Bundle" }, { po: "B", packaging: "Cartons" }]),
    [{ po: "A", boxes: 2, packaging: "Bundle" }]);
});

test("the papers: (BUNDLES) beside the length, and the HDP bundle count", () => {
  const plain = { packagingType: "Cartons", code: "PP1512", group: "15 MM" };
  assert.equal(inBundles(plain), false);
  assert.equal(inBundles({ ...plain, packagingType: "Bundles" }), true);       // no `pack`: read as before
  assert.equal(inBundles({ ...plain, pack: "bundle" }), true);                 // the rule
  assert.equal(inBundles({ ...plain, packagingType: "Bundles", pack: "carton" }), false);
  assert.equal(bundled("1800", { ...plain, pack: "bundle" }), "1800 (BUNDLES)");
  assert.equal(bundled("1800", { ...plain, pack: "carton" }), "1800");
  const box = { code: "GD3", group: "CORRUGATED BOXES", packagingType: "Cartons", pack: "carton" };
  assert.equal(isBundle(box), true);                                          // boxes travel in HDP bundles
  assert.equal(inBundles(box), false);                                        // without "(BUNDLES)" by their size
  assert.equal(isBundle({ ...box, pack: "carton", packSet: true }), false);   // unless a line says cartons
  assert.equal(isBundle({ ...plain, pack: "bundle", packSet: true }), true);
});
