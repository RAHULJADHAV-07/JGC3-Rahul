"""Two people saving in the same second. Needs real transactions, so these run
on Postgres only:

    JG_TEST_DATABASE_URL=postgresql+psycopg2://… python -m unittest tests.test_race
"""
import threading
import unittest

from fastapi.testclient import TestClient

from tests.base import ApiCase, ORIGIN
from app.config import settings
from app.database import engine
from app.main import app


@unittest.skipUnless(engine.dialect.name == "postgresql", "needs Postgres")
class Together(ApiCase):
    def at_once(self, calls):
        """Run every call at the same moment, each on a client of its own."""
        cookie = self.client.cookies.get(settings.cookie_name)
        gate, out = threading.Barrier(len(calls)), [None] * len(calls)

        def run(i, fn):
            c = TestClient(app)
            c.cookies.set(settings.cookie_name, cookie)
            c.headers.update({"Origin": ORIGIN})
            gate.wait()
            out[i] = fn(c)
        ts = [threading.Thread(target=run, args=(i, fn)) for i, fn in enumerate(calls)]
        [t.start() for t in ts]
        [t.join(60) for t in ts]
        return out

    def post(self, no, boxes, pins=None):
        body = self.invoice_body(no, boxes, pins)
        return lambda c: c.post("/api/invoices", json=body)

    def test_the_same_boxes_are_not_taken_twice(self):
        for n in range(4):
            got = [r.status_code for r in self.at_once([self.post(f"R{n}-{k}", {4: 20}, {4: {"PO2": 20}}) for k in range(4)])]
            if n == 0:                       # PO2 holds 30: one of four fits
                self.assertEqual(sorted(got), [201, 409, 409, 409])
            else:
                self.assertEqual(got, [409] * 4)
        self.assertEqual(self.pending("PO2", 4), 10)

    def test_no_order_is_ever_overdrawn(self):
        got = self.at_once([self.post(f"S{k}", {1: 7}, {1: {"PO2": 7}}) for k in range(8)])
        self.assertEqual(sum(r.status_code == 201 for r in got), 4)                 # 4 × 7 = 28 of 30
        self.assertEqual(self.pending("PO2", 1), 2)
        self.assertEqual(self.pending("PO1", 1), 20)                                # nothing spilled onto another order
        for inv in self.ok(self.client.get("/api/invoices")):
            self.assertEqual(self.legs(inv, 1), {"PO2": 7})

    def test_one_number_is_one_invoice(self):
        got = sorted(r.status_code for r in self.at_once([self.post("SAME", {2: 1}) for _ in range(6)]))
        self.assertEqual(got, [201] + [409] * 5)

    def test_an_order_cut_while_its_boxes_are_packed(self):
        rows = self.ok(self.client.get("/api/purchase-orders/lines"))
        lines = [{"id": r["id"], "qty": 100 if r["item_id"] == self.i[4] else r["qty"]} for r in rows if r["po"] == "PO2"]
        inv, cut = self.at_once([self.post("C1", {4: 25}, {4: {"PO2": 25}}), lambda c: c.put("/api/purchase-orders/PO2", json={"lines": lines})])
        self.assertEqual(cut.status_code, 200)
        self.assertIn(inv.status_code, (201, 409))
        self.assertLessEqual(self.pending("PO2", 4), 10)

    def test_two_edits_of_two_invoices_onto_the_same_boxes(self):
        a, b = self.record("A", {1: 5}, {1: {"PO1": 5}}), self.record("B", {1: 5}, {1: {"PO1": 5}})
        line = lambda n: {"lines": self.invoice_body("-", {1: n}, {1: {"PO2": n}})["lines"]}
        got = sorted(r.status_code for r in self.at_once([lambda c: c.put(f"/api/invoices/{a['id']}", json=line(20)), lambda c: c.put(f"/api/invoices/{b['id']}", json=line(20))]))
        self.assertEqual(got, [200, 409])
        self.assertEqual(self.pending("PO2", 1), 10)
