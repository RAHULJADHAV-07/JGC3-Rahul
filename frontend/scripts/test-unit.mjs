/* Unit tests for the browser's own figures — no server, no browser.

     npm run test:unit
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { eligiblePos, placeRow, placement, toPins, fromLines } from "../src/lib/poAlloc.js";
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

test("boxes fill the ticked orders oldest first", () => {
  const p = placeRow({ boxes: 25 }, OPEN.i1, ["PO2", "PO1"]);
  assert.deepEqual(p.cells, { PO1: 20, PO2: 5 });
  assert.equal(p.short, 0);
});

test("an unticked order takes nothing", () => {
  assert.deepEqual(placeRow({ boxes: 25 }, OPEN.i1, ["PO2"]).cells, { PO2: 25 });
  assert.equal(placeRow({ boxes: 25 }, OPEN.i1, []).short, 25);
});

test("the ticked orders running out leaves boxes short", () => {
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

test("a hand split on an unticked order does not count", () => {
  assert.deepEqual(placeRow({ boxes: 5 }, OPEN.i1, ["PO2"], { PO1: 5 }).cells, {});
});

test("nonsense in a box reads as nothing", () => {
  assert.deepEqual(placeRow({ boxes: "x" }, OPEN.i1, ["PO1"]).cells, {});
  assert.deepEqual(placeRow({ boxes: 5 }, OPEN.i1, ["PO1"], { PO1: "x" }).cells, {});
  assert.deepEqual(placeRow({ boxes: -5 }, OPEN.i1, ["PO1"]).cells, {});
});

test("placement is ok only when everything sits on an order", () => {
  const r = rows({ i1: 25, i3: 2 });
  assert.equal(placement(r, OPEN, [], {}).ok, false);
  assert.equal(placement(r, OPEN, [], {}).short, 27);
  assert.equal(placement(r, OPEN, ["PO2"], {}).short, 2);
  assert.equal(placement(r, OPEN, ["PO1", "PO2"], {}).ok, true);
});

test("placement is not ok until the orders are known", () => {
  assert.equal(placement(rows({ i1: 5 }), undefined, ["PO1"], {}).ok, false);
  assert.equal(placement(rows({ unasked: 5 }), OPEN, ["PO1"], {}).ok, false);
});

test("an item not answered for yet is not called beyond what is on order", () => {
  const p = placeRow({ boxes: 5 }, undefined, ["PO1"]);
  assert.equal(p.spare, 0);
  assert.equal(p.known, false);
});

test("an item no order holds does not block the save", () => {
  const p = placement(rows({ i5: 5 }), OPEN, [], {});
  assert.equal(p.ok, true);
  assert.equal(p.spare, 5);
});

test("overshoot blocks the save", () => {
  const p = placement(rows({ i1: 5 }), OPEN, ["PO1"], { i1: { PO1: 9 } });
  assert.equal(p.over, 4);
  assert.equal(p.ok, false);
});

test("what is stored drops the empties", () => {
  assert.deepEqual(toPins({ PO1: 5, PO2: 0 }), [{ po: "PO1", boxes: 5 }]);
  assert.deepEqual(toPins(undefined), []);
});

test("a saved invoice opens as it was saved", () => {
  const { picked, manual } = fromLines([
    { item_id: "i1", po_alloc: [{ po: "PO2", boxes: 5 }, { po: "PO1", boxes: 1 }] },
    { item_id: "i2", po_alloc: null },
  ]);
  assert.deepEqual(picked.sort(), ["PO1", "PO2"]);
  assert.deepEqual(manual, { i1: { PO2: 5, PO1: 1 } });
  assert.deepEqual(placeRow({ boxes: 6 }, OPEN.i1, picked, manual.i1).cells, { PO1: 1, PO2: 5 });
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
  assert.deepEqual(docsForMode(all, "air"), ["14", "16", "16A", "18", "26A"]);
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
