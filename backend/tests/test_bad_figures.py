"""Figures that are not figures: refused at the door, and never able to close a
screen to everybody if one is already on file."""
import math
import unittest
from types import SimpleNamespace as NS

from tests.base import ApiCase, SessionLocal, models
from app import calc, schemas


class BadFigures(ApiCase):
    NOT_FIGURES = ("nan", "inf", "-inf", "Infinity", "1e400")

    def test_costing_parameters(self):
        for word in self.NOT_FIGURES + (1e300, -1e300):
            for field in ("ex_rate", "transport_fcl", "real_rate"):
                r = self.client.put("/api/costing/params", json={field: word})
                self.assertEqual(r.status_code, 422, (field, word))
        self.assertEqual(self.ok(self.client.get("/api/costing/params"))["ex_rate"], 90.0)
        self.assertEqual(self.ok(self.client.put("/api/costing/params", json={"ex_rate": 88.5}))["ex_rate"], 88.5)

    def test_costing_rows(self):
        for word in self.NOT_FIGURES + (1e300,):
            self.assertEqual(self.client.post("/api/costing", json={"gd": "X", "price_new": word}).status_code, 422, word)
            self.assertEqual(self.client.put("/api/costing/upsert-by-item", json=[{"item_id": self.i[1], "price_new": word}]).status_code, 422, word)
            self.assertEqual(self.client.post("/api/costing/preview", json=[{"item_id": self.i[1], "price_new": word}]).status_code, 422, word)
        for count in (2**31, -1):
            self.assertEqual(self.client.post("/api/costing", json={"gd": "X", "box": count}).status_code, 422)
        self.ok(self.client.put("/api/costing/upsert-by-item", json=[{"item_id": self.i[1], "price_new": 12.5}]))
        self.assertEqual(self.ok(self.client.get("/api/costing"))[0]["price_new"], 12.5)

    def test_one_already_on_file_does_not_close_the_sheet(self):
        db = SessionLocal()
        db.add(models.Setting(key="cost_params", value={"ex_rate": "nan", "real_rate": 91, "other_fcl": 1e300}))
        db.add(models.CostingLine(gd="OLD", fob_old=None, price_old=None, unit=None, length=None))
        db.commit()
        db.close()
        p = self.ok(self.client.get("/api/costing/params"))
        self.assertEqual((p["ex_rate"], p["real_rate"], p["other_fcl"]), (90.0, 91, 50000.0))
        row = self.ok(self.client.get("/api/costing"))[0]
        self.assertEqual((row["gd"], row["fob_old"], row["unit"], row["length"]), ("OLD", 0, 0, ""))

    def test_the_working_is_always_a_figure(self):
        p = schemas.CostParams(ex_rate=1e-300, real_rate=1e9)
        line = NS(price_old=1e-300, price_new=1e9, box=100_000_000, boxes_fcl=1, fob_now=1e9, fob_old=1e-300)
        self.assertTrue(all(math.isfinite(v) for v in calc.compute_costing(line, p).values()))

    def test_every_other_form(self):
        for word in self.NOT_FIGURES:
            po = {"po": "PX", "date": "2026-01-01", "buyer_id": self.buyer["id"], "rbi": word, "lines": [{"item_id": self.i[1], "qty": 10}]}
            self.assertEqual(self.client.post("/api/purchase-orders", json=po).status_code, 422, word)
            inv = {**self.invoice_body("X", {1: 1}), "rbi": word}
            self.assertEqual(self.client.post("/api/invoices", json=inv).status_code, 422, word)
            self.assertEqual(self.client.put(f"/api/items/{self.i[1]}", json={"unit_value": word}).status_code, 422, word)
            self.assertEqual(self.client.post("/api/items", json={"code": "Z", "gd": "Z", "volume": word}).status_code, 422, word)
        self.assertEqual(self.client.get("/api/items").status_code, 200)

    def test_ports_are_a_list(self):
        for ports in (1, "x", {"a": 1}, True):
            self.assertEqual(self.client.post("/api/buyers", json={"name": "B", "ports": ports}).status_code, 422, ports)
        for ports, kept in ((None, []), ([], []), (["FREMANTLE", "  ", None], ["FREMANTLE"])):
            self.assertEqual(self.ok(self.client.post("/api/buyers", json={"name": f"B{ports}", "ports": ports}))["ports"], kept)

    def test_audit_pages(self):
        self.assertEqual(self.client.get("/api/audit", params={"offset": "99999999999999999999"}).status_code, 422)
        self.assertEqual(self.client.get("/api/audit", params={"offset": 10}).status_code, 200)


if __name__ == "__main__":
    unittest.main()
