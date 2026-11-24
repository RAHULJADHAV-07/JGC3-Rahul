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
