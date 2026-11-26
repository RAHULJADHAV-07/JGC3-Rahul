"""Other Reports → Price list (V-7.9.0): dated supplier and buyer prices, and
everything already on the book staying where it is."""
from tests.base import ApiCase
from app import models, prices as P
from app.database import SessionLocal


class Prices(ApiCase):
    def set_supplier(self, effective, rows, code=200):
        r = self.client.post("/api/prices/supplier", json={"effective": effective, "rows": rows})
        self.assertEqual(r.status_code, code, r.text)
        return r.json()

    def set_buyer(self, effective, rows, margin=None, code=200):
        r = self.client.post(f"/api/prices/buyer/{self.buyer['id']}",
                             json={"effective": effective, "margin_pct": margin, "rows": rows})
        self.assertEqual(r.status_code, code, r.text)
        return r.json()

    def item(self, n):
        return next(i for i in self.ok(self.client.get("/api/items")) if i["id"] == self.i[n])

    def lines(self, po):
        return [l for l in self.ok(self.client.get("/api/purchase-orders/lines")) if l["po"] == po]


class Supplier(Prices):
    def test_a_save_moves_the_master_and_dates_it(self):
        out = self.set_supplier("2026-04-01", [{"item_id": self.i[1], "unit_value": 120.0, "unit_fob100": 60.0}])
        self.assertEqual(out["changed"], 1)
        it = self.item(1)
        self.assertEqual((it["unit_value"], it["unit_fob100"], it["price_from"]), (120.0, 60.0, "2026-04-01"))
        self.assertIsNotNone(it["price_set_at"])
        self.assertIsNone(self.item(2)["price_from"])          # untouched items stay undated

    def test_orders_already_placed_do_not_move(self):
        before = {l["item_id"]: l["unit_value"] for l in self.lines("PO1")}
        self.set_supplier("2026-01-01", [{"item_id": self.i[1], "unit_value": 120.0}])
        after = {l["item_id"]: l["unit_value"] for l in self.lines("PO1")}
        self.assertEqual(before, after)

    def test_lines_without_a_snapshot_are_frozen_first(self):
        db = SessionLocal()
        db.query(models.PurchaseOrderLine).filter_by(po="PO1").update({"unit_value": None, "unit_fob100": None,
                                                                       "value_mode": None, "fob_mode": None})
        db.commit()
        db.close()
        self.set_supplier("2026-01-01", [{"item_id": self.i[1], "unit_value": 120.0}])
        by = {l["item_id"]: l for l in self.lines("PO1")}
        self.assertEqual(by[self.i[1]]["unit_value"], 100.0)    # the price it always read
        self.assertEqual(by[self.i[1]]["fob_mode"], "100")
        self.assertIsNone(by[self.i[2]]["unit_value"])          # another item: nothing to freeze

    def test_invoices_keep_what_they_were_raised_at(self):
        inv = self.record("F1", {1: 5})
        self.set_supplier("2026-01-01", [{"item_id": self.i[1], "unit_value": 120.0, "unit_fob100": 70.0}])
        line = self.ok(self.client.get(f"/api/invoices/{inv['id']}"))["lines"][0]
        self.assertEqual((line["unit_value"], line["unit_fob100"]), (100.0, 50.0))

    def test_an_order_takes_the_price_in_force_on_its_own_date(self):
        self.set_supplier("2026-04-01", [{"item_id": self.i[1], "unit_value": 120.0}])
        self.place_order("PO8", "2026-03-31", {1: 1})
        self.place_order("PO9", "2026-04-01", {1: 1})
        self.assertEqual(self.lines("PO8")[0]["unit_value"], 100.0)
        self.assertEqual(self.lines("PO9")[0]["unit_value"], 120.0)

    def test_a_back_dated_price_between_two_others(self):
        self.set_supplier("2026-06-01", [{"item_id": self.i[1], "unit_value": 150.0}])
        self.set_supplier("2026-03-01", [{"item_id": self.i[1], "unit_value": 120.0}])
        self.assertEqual(self.item(1)["unit_value"], 150.0)     # June's is still the one in force
        self.place_order("PO8", "2026-04-15", {1: 1})
        self.assertEqual(self.lines("PO8")[0]["unit_value"], 120.0)

    def test_no_day_still_to_come(self):
        self.set_supplier("2999-01-01", [{"item_id": self.i[1], "unit_value": 1.0}], code=422)

    def test_saying_what_is_already_there_is_not_a_change(self):
        out = self.set_supplier("2026-04-01", [{"item_id": self.i[1], "unit_value": 100.0, "unit_fob100": 50.0}])
        self.assertEqual(out["changed"], 0)
        self.assertEqual(self.ok(self.client.get("/api/prices/revisions")), [])

    def test_withdraw_and_reinstate_a_revision(self):
        self.set_supplier("2026-01-10", [{"item_id": self.i[1], "unit_value": 110.0}])
        march = self.set_supplier("2026-03-10", [{"item_id": self.i[1], "unit_value": 130.0}, {"item_id": self.i[2], "unit_value": 90.0}])
        self.ok(self.client.post(f"/api/prices/revisions/{march['revision']}/withdraw"))
        self.assertEqual((self.item(1)["unit_value"], self.item(1)["price_from"]), (110.0, "2026-01-10"))
        self.assertEqual((self.item(2)["unit_value"], self.item(2)["price_from"]), (100.0, None))   # back to the master's own
        revs = {r["id"]: r for r in self.ok(self.client.get("/api/prices/revisions"))}
        self.assertEqual(revs[march["revision"]]["status"], "withdrawn")
        self.ok(self.client.post(f"/api/prices/revisions/{march['revision']}/reinstate"))
        self.assertEqual(self.item(1)["unit_value"], 130.0)

    def test_go_back_to_an_earlier_price(self):
        self.set_supplier("2026-01-10", [{"item_id": self.i[1], "unit_value": 110.0}])
        self.set_supplier("2026-03-10", [{"item_id": self.i[1], "unit_value": 130.0}])
        hist = self.ok(self.client.get(f"/api/prices/history/{self.i[1]}"))["versions"]
        self.assertEqual([v["unit_value"] for v in hist], [130.0, 110.0, 100.0])
        self.assertTrue(hist[0]["current"])
        jan = hist[1]
        self.ok(self.client.post(f"/api/prices/versions/{jan['id']}/restore"))
        self.assertEqual(self.item(1)["unit_value"], 110.0)
        hist = self.ok(self.client.get(f"/api/prices/history/{self.i[1]}"))["versions"]
        self.assertEqual([(v["unit_value"], v["active"], v["current"]) for v in hist],
                         [(130.0, False, False), (110.0, True, True), (100.0, True, False)])
        # A March order placed while March was in force keeps March's price.
        # (none was placed here; a new one dated in March now takes January's)
        self.place_order("PO8", "2026-03-20", {1: 1})
        self.assertEqual(self.lines("PO8")[0]["unit_value"], 110.0)

    def test_setup_edit_is_a_revision_and_cannot_back_date_behind_one(self):
        self.ok(self.client.put(f"/api/items/{self.i[1]}", json={"unit_value": 140.0, "price_from": "2026-05-01"}))
        self.assertEqual(self.item(1)["price_from"], "2026-05-01")
        hist = self.ok(self.client.get(f"/api/prices/history/{self.i[1]}"))["versions"]
        self.assertEqual([v["mode"] for v in hist], ["set", "baseline"])
        r = self.client.put(f"/api/items/{self.i[1]}", json={"unit_value": 150.0, "price_from": "2026-02-01"})
        self.assertEqual(r.status_code, 422)
        # Anything else about the item still saves with no price question.
        self.ok(self.client.put(f"/api/items/{self.i[1]}", json={"description": "Renamed"}))
        self.assertEqual(len(self.ok(self.client.get(f"/api/prices/history/{self.i[1]}"))["versions"]), 2)


class Buyer(Prices):
    def test_a_margin_marks_up_both_prices(self):
        self.set_buyer("2026-04-01", [{"item_id": self.i[1], "mode": "margin", "margin_pct": 50}], margin=50)
        row = next(r for r in self.ok(self.client.get(f"/api/prices/buyer/{self.buyer['id']}"))["rows"] if r["item_id"] == self.i[1])
        self.assertEqual((row["mode"], row["unit_value"], row["unit_fob100"]), ("margin", 150.0, 75.0))
        self.place_order("PO9", "2026-04-02", {1: 1})
        line = self.lines("PO9")[0]
        # The buyer pays the marked-up FOB; the supplier is still paid their price.
        self.assertEqual((line["unit_value"], line["unit_fob100"]), (100.0, 75.0))
        self.assertEqual(self.item(1)["unit_fob100"], 50.0)    # the master is the supplier list

    def test_a_margin_follows_a_later_supplier_price(self):
        self.set_buyer("2026-02-01", [{"item_id": self.i[1], "mode": "margin", "margin_pct": 50}])
        self.set_supplier("2026-03-01", [{"item_id": self.i[1], "unit_fob100": 60.0}])
        self.place_order("PO8", "2026-02-15", {1: 1})
        self.place_order("PO9", "2026-03-15", {1: 1})
        self.assertEqual(self.lines("PO8")[0]["unit_fob100"], 75.0)
        self.assertEqual(self.lines("PO9")[0]["unit_fob100"], 90.0)

    def test_manual_figures_and_back_to_the_supplier(self):
        self.set_buyer("2026-02-01", [{"item_id": self.i[1], "mode": "manual", "unit_value": 180.0, "unit_fob100": 66.0}])
        self.place_order("PO8", "2026-02-15", {1: 1})
        self.assertEqual(self.lines("PO8")[0]["unit_fob100"], 66.0)
        self.set_buyer("2026-03-01", [{"item_id": self.i[1], "mode": "none"}])
        self.place_order("PO9", "2026-03-15", {1: 1})
        self.assertEqual(self.lines("PO9")[0]["unit_fob100"], 50.0)
        hist = self.ok(self.client.get(f"/api/prices/history/{self.i[1]}?scope=buyer&buyer_id={self.buyer['id']}"))["versions"]
        self.assertEqual([v["mode"] for v in hist], ["none", "manual"])

    def test_an_order_for_no_buyer_takes_the_supplier_price(self):
        self.set_buyer("2026-02-01", [{"item_id": self.i[1], "mode": "margin", "margin_pct": 50}])
        self.ok(self.client.post("/api/purchase-orders", json={"po": "PO8", "date": "2026-03-01", "buyer_id": None, "rbi": 0,
                                                              "lines": [{"item_id": self.i[1], "qty": 10}]}))
        self.assertEqual(self.lines("PO8")[0]["unit_fob100"], 50.0)

    def test_derive_prices_as_the_order_will_be(self):
        self.set_buyer("2026-02-01", [{"item_id": self.i[1], "mode": "margin", "margin_pct": 20}])
        out = self.ok(self.client.post("/api/masters/derive", json=[{"item_id": self.i[1], "qty": 100, "buyer_id": self.buyer["id"], "date": "2026-03-01"}]))
        self.assertAlmostEqual(out["rows"][0]["unit_fob"], 60.0)
        plain = self.ok(self.client.post("/api/masters/derive", json=[{"item_id": self.i[1], "qty": 100}]))
        self.assertAlmostEqual(plain["rows"][0]["unit_fob"], 50.0)

    def test_apply_to_pending_orders_uses_the_buyer_price(self):
        self.set_buyer("2026-02-01", [{"item_id": self.i[1], "mode": "margin", "margin_pct": 10}])
        out = self.ok(self.client.post(f"/api/purchase-orders/apply-prices?item_id={self.i[1]}"))
        self.assertEqual(set(out["pos"]), {"PO1", "PO2"})
        self.assertEqual({l["unit_fob100"] for l in self.lines("PO1") if l["item_id"] == self.i[1]}, {55.0})


class Rounding(Prices):
    def test_half_up_like_the_browser(self):
        self.assertEqual(P.round_to(5.175, 2), 5.18)
        self.assertEqual(P.round_to(1.005, 2), 1.01)
        self.assertEqual(P.marked_up({"unit_value": 3.45, "value_mode": "piece", "unit_fob100": 3.6, "fob_mode": "100"}, 50),
                         {"unit_value": 5.18, "value_mode": "piece", "unit_fob100": 5.4, "fob_mode": "100"})


class Dashboard(Prices):
    def test_cells_split_pp_and_grn(self):
        db = SessionLocal()
        db.query(models.Item).filter(models.Item.id == self.i[2]).update({"sticker_rule": "grn"})
        db.commit()
        db.close()
        m = self.ok(self.client.get("/api/dashboard/matrix"))
        cell = next(r for r in m["rows"] if r["supplier"]["id"] == self.sup["id"])["cells"]["PO1"]
        self.assertEqual((cell["boxes"], cell["pp"]["boxes"], cell["grn"]["boxes"]), (60, 40, 20))
        self.assertAlmostEqual(cell["grn"]["vol"], 2.0)
        self.assertEqual(m["totals"]["cells"]["PO1"]["grn"]["boxes"], 20)
        self.assertEqual(m["totals"]["split"]["pp"]["boxes"] + m["totals"]["split"]["grn"]["boxes"], m["totals"]["totBox"])
