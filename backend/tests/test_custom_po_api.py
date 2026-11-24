"""Integration tests: Custom PO through the API, and every register after it."""
from tests.base import ApiCase
from app import models
from app.config import settings
from app.database import SessionLocal
from app.security import create_token, hash_password


class RecordCustom(ApiCase):
    def test_the_brief(self):
        """Four POs; i1…i6 packed; only the orders holding them are offered."""
        ids = [self.i[n] for n in (1, 2, 4)]
        open_ = self.ok(self.client.post("/api/invoices/open-orders", json={"item_ids": ids}))
        self.assertEqual({x["po"] for rows in open_.values() for x in rows}, {"PO1", "PO2"})
        self.assertEqual([x["po"] for x in open_[self.i[1]]], ["PO1", "PO2"])     # oldest first
        self.assertEqual(open_[self.i[4]][0]["open"], 30)

    def test_boxes_come_off_the_chosen_order_not_the_oldest(self):
        inv = self.record("C1", {1: 5, 2: 6}, {1: {"PO2": 5}, 2: {"PO2": 6}})
        self.assertEqual(inv["allocation"], "custom")
        self.assertEqual(self.legs(inv, 1), {"PO2": 5})
        self.assertEqual(self.pending("PO1", 1), 20)                               # PO1 untouched
        self.assertEqual(self.pending("PO2", 1), 25)

    def test_every_register_agrees(self):
        self.record("C1", {1: 5, 4: 7}, {1: {"PO2": 5}, 4: {"PO2": 7}})
        # PO summary
        pos = {p["po"]: p for p in self.ok(self.client.get("/api/purchase-orders"))}
        self.assertEqual(pos["PO1"]["completed"], 0)
        self.assertEqual(pos["PO2"]["completed"], 12)
        self.assertEqual(pos["PO2"]["pending"], 100 - 12)
        cleared = next(d for d in pos["PO2"]["detail"] if d["item_id"] == self.i[1])["cleared"]
        self.assertEqual(cleared, [{"invoice_no": "C1", "boxes": 5}])
        # Dashboard
        matrix = self.ok(self.client.get("/api/dashboard/matrix"))
        cells = next(r for r in matrix["rows"] if r["supplier"]["id"] == self.sup["id"])["cells"]
        self.assertEqual(cells["PO1"]["boxes"], 60)
        self.assertEqual(cells["PO2"]["boxes"], 90 - 12)
        # Menu bar: 170 boxes ordered in all (60 + 100 + 5 + 5), 12 packed
        self.assertEqual(self.ok(self.client.get("/api/dashboard/badges"))["packing"], 170 - 12)
        # Balance register, item wise
        item = next(r for r in self.ok(self.client.get("/api/reports/balance"))["item"] if r["item_id"] == self.i[1])
        self.assertEqual(item["pending"], 45)
        self.assertEqual([(d["po"], d["remaining"]) for d in item["pending_detail"]], [("PO1", 20), ("PO2", 25)])
        # Doc 37
        row = next(r for r in self.ok(self.client.get("/api/reports/item-detail"))["rows"] if r["item_id"] == self.i[1])
        self.assertEqual((row["recd"], row["pending"]), (5, 45))
        # Doc 38: what is still owed, in pieces
        supply = self.ok(self.client.get("/api/reports/supply-details"))
        per = next(r for r in supply["rows"] if r["item_id"] == self.i[1])["per_col"]
        self.assertEqual(per, {"PO1": 200, "PO2": 250})

    def test_price_is_what_the_chosen_order_agreed(self):
        # Reprice the master, then raise a later order at the new price.
        self.ok(self.client.put(f"/api/items/{self.i[1]}", json={"unit_value": 300.0, "unit_fob100": 90.0}))
        self.place_order("PO9", "2026-04-20", {1: 10})
        inv = self.record("C1", {1: 4}, {1: {"PO9": 4}})
        self.assertEqual(inv["lines"][0]["unit_value"], 300.0)
        self.assertEqual(inv["lines"][0]["unit_fob100"], 90.0)
        fifo = self.record("F1", {1: 4})
        self.assertEqual(fifo["lines"][0]["unit_value"], 100.0)                   # still the oldest order's

    def test_split_price_is_weighted(self):
        self.ok(self.client.put(f"/api/items/{self.i[1]}", json={"unit_value": 300.0}))
        self.place_order("PO9", "2026-04-20", {1: 10})
        inv = self.record("C1", {1: 10}, {1: {"PO1": 5, "PO9": 5}})
        self.assertEqual(inv["lines"][0]["unit_value"], 200.0)

    def test_fifo_is_the_same_process(self):
        inv = self.record("F1", {1: 25})
        self.assertEqual(inv["allocation"], "fifo")
        self.assertIsNone(inv["lines"][0]["po_alloc"])
        self.assertEqual(self.legs(inv, 1), {"PO1": 20, "PO2": 5})

    def test_pins_sent_on_a_fifo_invoice_are_ignored(self):
        body = self.invoice_body("F1", {1: 5}, {1: {"PO2": 5}}, mode="fifo")
        inv = self.ok(self.client.post("/api/invoices", json=body), 201)
        self.assertEqual(self.legs(inv, 1), {"PO1": 5})

    def test_later_fifo_clears_around_custom(self):
        self.record("C1", {1: 20}, {1: {"PO1": 20}})
        self.assertEqual(self.legs(self.record("F1", {1: 3}), 1), {"PO2": 3})

    def test_preview_shows_what_the_save_will_do(self):
        self.record("C1", {1: 20}, {1: {"PO1": 20}})
        out = self.ok(self.client.post("/api/invoices/allocation-preview", json={"date": "2026-05-02", "lines": [{"item_id": self.i[1], "boxes": 3}]}))
        self.assertEqual([(l["po"], l["boxes"]) for l in out[self.i[1]]["legs"]], [("PO2", 3)])

    def test_item_on_no_open_order_is_excess_like_fifo(self):
        self.place_order("PO5", "2026-04-11", {3: 1})
        self.record("C0", {3: 21}, {3: {"PO1": 20, "PO5": 1}})
        inv = self.record("C1", {3: 4}, {3: {}})
        self.assertEqual(self.legs(inv, 3), {})

    def test_serials_and_status_unaffected(self):
        inv = self.record("C1", {2: 5, 1: 3}, {1: {"PO2": 3}, 2: {"PO1": 5}})
        froms = {l["item_id"]: l["serial_from"] for l in inv["lines"]}
        self.assertEqual(froms, {self.i[1]: 1001, self.i[2]: 1004})
        self.assertEqual(inv["status"], "Ready to dispatch")


class ItemByItem(ApiCase):
    """Each item comes off the order chosen for it, whatever the others do."""

    def setUp(self):
        super().setUp()
        # i1 is on three orders, the brief's p1, p2 and p3.
        self.place_order("PO7", "2026-03-20", {1: 40})

    def test_the_brief(self):
        open_ = self.ok(self.client.post("/api/invoices/open-orders", json={"item_ids": [self.i[1]]}))[self.i[1]]
        self.assertEqual([(o["po"], o["open"]) for o in open_], [("PO1", 20), ("PO2", 30), ("PO7", 40)])
        inv = self.record("C1", {1: 25}, {1: {"PO2": 25}})
        self.assertEqual(self.legs(inv, 1), {"PO2": 25})
        self.assertEqual([self.pending(p, 1) for p in ("PO1", "PO2", "PO7")], [20, 5, 40])

    def test_two_items_off_two_different_orders(self):
        inv = self.record("C1", {1: 5, 2: 6}, {1: {"PO7": 5}, 2: {"PO1": 6}})
        self.assertEqual(self.legs(inv, 1), {"PO7": 5})
        self.assertEqual(self.legs(inv, 2), {"PO1": 6})
        self.assertEqual((self.pending("PO1", 1), self.pending("PO1", 2)), (20, 14))

    def test_the_order_of_choosing_is_kept(self):
        inv = self.record("C1", {1: 45}, {1: {"PO7": 40, "PO1": 5}})
        self.assertEqual(inv["lines"][0]["po_alloc"], [{"po": "PO7", "boxes": 40}, {"po": "PO1", "boxes": 5}])
        # Cut later, it is the last chosen that gives way.
        out = self.ok(self.client.put(f"/api/invoices/{inv['id']}", json={"lines": self.invoice_body("-", {1: 42})["lines"]}))
        self.assertEqual(out["lines"][0]["po_alloc"], [{"po": "PO7", "boxes": 40}, {"po": "PO1", "boxes": 2}])

    def test_moving_one_item_leaves_the_others_prices_and_orders(self):
        self.ok(self.client.put(f"/api/items/{self.i[1]}", json={"unit_value": 300.0}))
        self.place_order("PO9", "2026-04-20", {1: 10})
        inv = self.record("C1", {1: 4, 2: 6}, {1: {"PO1": 4}, 2: {"PO2": 6}})
        out = self.ok(self.client.put(f"/api/invoices/{inv['id']}", json={"lines": self.invoice_body("-", {1: 4, 2: 6}, {1: {"PO9": 4}, 2: {"PO2": 6}})["lines"]}))
        by = {l["item_id"]: l for l in out["lines"]}
        self.assertEqual((by[self.i[1]]["unit_value"], by[self.i[2]]["unit_value"]), (300.0, 100.0))
        self.assertEqual((self.legs(inv, 1), self.legs(inv, 2)), ({"PO9": 4}, {"PO2": 6}))

    def test_the_same_item_twice_cannot_take_the_same_boxes_twice(self):
        body = self.invoice_body("X", {1: 15}, {1: {"PO1": 15}})
        body["lines"] *= 2
        r = self.client.post("/api/invoices", json=body)
        self.assertEqual(r.status_code, 409)
        self.assertIn("only 5 boxes", r.json()["detail"])
        body["lines"][1] = {**body["lines"][1], "po_alloc": [{"po": "PO2", "boxes": 15}]}
        inv = self.ok(self.client.post("/api/invoices", json=body), 201)
        self.assertEqual(self.legs(inv, 1), {"PO1": 15, "PO2": 15})

    def test_an_order_named_twice_on_a_line_is_added_up(self):
        body = self.invoice_body("X", {1: 10}, {1: {"PO2": 10}})
        body["lines"][0]["po_alloc"] = [{"po": "PO2", "boxes": 4}, {"po": "PO2", "boxes": 6}, {"po": "PO1", "boxes": 0}]
        inv = self.ok(self.client.post("/api/invoices", json=body), 201)
        self.assertEqual(inv["lines"][0]["po_alloc"], [{"po": "PO2", "boxes": 10}])

    def test_every_screen_and_register_after_it(self):
        self.record("C1", {1: 25, 4: 7}, {1: {"PO2": 25}, 4: {"PO2": 7}})
        self.record("F1", {1: 22})                                  # FIFO goes round what was chosen
        pend = {p: self.pending(p, 1) for p in ("PO1", "PO2", "PO7")}
        self.assertEqual(pend, {"PO1": 0, "PO2": 3, "PO7": 40})
        bal = next(r for r in self.ok(self.client.get("/api/reports/balance"))["item"] if r["item_id"] == self.i[1])
        self.assertEqual(bal["pending"], 43)
        self.assertEqual(bal["pending_pos"], ["PO2", "PO7"])
        lists = {p["po"]: p for p in self.ok(self.client.get("/api/purchase-orders"))}
        self.assertEqual(sum(p["pending"] for p in lists.values()), self.ok(self.client.get("/api/dashboard/badges"))["packing"])
        open_ = self.ok(self.client.post("/api/invoices/open-orders", json={"item_ids": [self.i[1]]}))[self.i[1]]
        self.assertEqual({o["po"]: o["open"] for o in open_}, {"PO2": 3, "PO7": 40})
        supply = next(r for r in self.ok(self.client.get("/api/reports/supply-details"))["rows"] if r["item_id"] == self.i[1])
        self.assertEqual(supply["per_col"], {"PO2": 30, "PO7": 400})


class Refused(ApiCase):
    def refused(self, code, *args, **kw):
        r = self.client.post("/api/invoices", json=self.invoice_body(*args, **kw))
        self.assertEqual(r.status_code, code, r.text)
        self.assertEqual(self.ok(self.client.get("/api/invoices")), [])            # nothing half-saved
        return r.json()["detail"]

    def test_order_does_not_hold_the_item(self):
        self.assertIn("PO3 has no GD1", self.refused(409, "X", {1: 5}, {1: {"PO3": 5}}))

    def test_more_than_the_order_holds(self):
        self.assertIn("only 20 boxes of GD1", self.refused(409, "X", {1: 25}, {1: {"PO1": 25}}))

    def test_room_taken_by_another_invoice(self):
        self.record("C1", {1: 15}, {1: {"PO1": 15}})
        r = self.client.post("/api/invoices", json=self.invoice_body("C2", {1: 10}, {1: {"PO1": 10}}))
        self.assertEqual(r.status_code, 409)
        self.assertIn("only 5 boxes", r.json()["detail"])

    def test_boxes_left_without_an_order(self):
        self.assertIn("3 more boxes", self.refused(400, "X", {1: 8}, {1: {"PO1": 5}}))

    def test_nothing_ticked_at_all(self):
        self.assertIn("5 more boxes", self.refused(400, "X", {1: 5}, {}))

    def test_more_placed_than_packed(self):
        self.assertIn("only 2 were packed", self.refused(400, "X", {1: 2}, {1: {"PO1": 5}}))

    def test_unknown_mode(self):
        self.refused(422, "X", {1: 2}, {1: {"PO1": 2}}, mode="lifo")

    def test_duplicate_invoice_number(self):
        self.record("C1", {1: 1})
        r = self.client.post("/api/invoices", json=self.invoice_body("C1", {1: 1}))
        self.assertEqual(r.status_code, 409)
        self.assertIn("already exists", r.json()["detail"])

    def test_renaming_onto_another_invoice_number(self):
        self.record("C1", {1: 1})
        b = self.record("C2", {1: 1})
        r = self.client.put(f"/api/invoices/{b['id']}", json={"invoice_no": "C1"})
        self.assertEqual(r.status_code, 409)
        self.assertEqual(self.ok(self.client.get(f"/api/invoices/{b['id']}"))["invoice_no"], "C2")


class Edit(ApiCase):
    def put(self, inv, **body):
        return self.ok(self.client.put(f"/api/invoices/{inv['id']}", json=body))

    def lines(self, boxes, pins=None):
        return self.invoice_body("-", boxes, pins)["lines"]

    def test_own_boxes_count_as_free(self):
        inv = self.record("C1", {1: 20}, {1: {"PO1": 20}})
        self.assertEqual([x["po"] for x in self.ok(self.client.post("/api/invoices/open-orders", json={"item_ids": [self.i[1]]}))[self.i[1]]], ["PO2"])
        mine = self.ok(self.client.post("/api/invoices/open-orders", json={"item_ids": [self.i[1]], "exclude_invoice_id": inv["id"]}))
        self.assertEqual({x["po"]: x["open"] for x in mine[self.i[1]]}, {"PO1": 20, "PO2": 30})

    def test_moving_boxes_to_another_order(self):
        inv = self.record("C1", {1: 5}, {1: {"PO1": 5}})
        self.put(inv, lines=self.lines({1: 5}, {1: {"PO2": 5}}))
        self.assertEqual(self.legs(inv, 1), {"PO2": 5})
        self.assertEqual(self.pending("PO1", 1), 20)

    def test_moving_to_an_order_at_another_price_reprices_the_line(self):
        self.ok(self.client.put(f"/api/items/{self.i[1]}", json={"unit_value": 300.0}))
        self.place_order("PO9", "2026-04-20", {1: 10})
        inv = self.record("C1", {1: 4}, {1: {"PO1": 4}})
        self.assertEqual(inv["lines"][0]["unit_value"], 100.0)
        out = self.put(inv, lines=self.lines({1: 4}, {1: {"PO9": 4}}))
        self.assertEqual(out["lines"][0]["unit_value"], 300.0)

    def test_boxes_on_the_same_order_keep_their_price(self):
        inv = self.record("C1", {1: 4}, {1: {"PO1": 4}})
        self.ok(self.client.put(f"/api/items/{self.i[1]}", json={"unit_value": 999.0}))
        out = self.put(inv, lines=self.lines({1: 2}, {1: {"PO1": 2}}))
        self.assertEqual(out["lines"][0]["unit_value"], 100.0)
        self.assertEqual(out["lines"][0]["serial_from"], 1001)

    def test_edit_without_po_figures_keeps_the_orders_and_trims_them(self):
        inv = self.record("C1", {1: 10}, {1: {"PO2": 6, "PO1": 4}})
        self.put(inv, lines=self.lines({1: 7}))
        self.assertEqual(self.legs(inv, 1), {"PO2": 6, "PO1": 1})

    def test_growing_a_line_needs_an_order_for_the_extra(self):
        inv = self.record("C1", {1: 5}, {1: {"PO2": 5}})
        r = self.client.put(f"/api/invoices/{inv['id']}", json={"lines": self.lines({1: 8})})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.legs(inv, 1), {"PO2": 5})

    def test_custom_to_fifo(self):
        inv = self.record("C1", {1: 5}, {1: {"PO2": 5}})
        out = self.put(inv, allocation="fifo", lines=self.lines({1: 5}))
        self.assertEqual(out["allocation"], "fifo")
        self.assertIsNone(out["lines"][0]["po_alloc"])
        self.assertEqual(self.legs(inv, 1), {"PO1": 5})

    def test_mode_change_alone_restates_the_lines(self):
        inv = self.record("C1", {1: 5}, {1: {"PO2": 5}})
        out = self.put(inv, allocation="fifo")
        self.assertIsNone(out["lines"][0]["po_alloc"])
        self.assertEqual(self.legs(inv, 1), {"PO1": 5})

    def test_fifo_to_custom(self):
        inv = self.record("F1", {1: 5})
        out = self.put(inv, allocation="custom", lines=self.lines({1: 5}, {1: {"PO2": 5}}))
        self.assertEqual(out["allocation"], "custom")
        self.assertEqual(self.legs(inv, 1), {"PO2": 5})

    def test_fifo_to_custom_without_orders_is_refused(self):
        inv = self.record("F1", {1: 5})
        self.assertEqual(self.client.put(f"/api/invoices/{inv['id']}", json={"allocation": "custom"}).status_code, 400)
        self.assertEqual(self.ok(self.client.get(f"/api/invoices/{inv['id']}"))["allocation"], "fifo")

    def test_saving_shipment_details_leaves_the_allocation_alone(self):
        inv = self.record("C1", {1: 5}, {1: {"PO2": 5}})
        out = self.put(inv, ship={"pod": "FREMANTLE", "container": "C"})
        self.assertEqual(out["allocation"], "custom")
        self.assertEqual(self.legs(inv, 1), {"PO2": 5})

    def test_removing_a_line_keeps_the_others(self):
        inv = self.record("C1", {1: 5, 2: 3}, {1: {"PO2": 5}, 2: {"PO1": 3}})
        out = self.put(inv, lines=self.lines({2: 3}, {2: {"PO1": 3}}))
        self.assertEqual(len(out["lines"]), 1)
        self.assertEqual(self.pending("PO2", 1), 30)
        self.assertEqual(self.pending("PO1", 2), 17)

    def test_deleting_the_invoice_gives_the_boxes_back(self):
        inv = self.record("C1", {1: 5}, {1: {"PO2": 5}})
        self.ok(self.client.delete(f"/api/invoices/{inv['id']}"), 204)
        self.assertEqual(self.pending("PO2", 1), 30)


class OrdersMove(ApiCase):
    def test_renaming_an_order_carries_the_pins(self):
        inv = self.record("C1", {1: 5}, {1: {"PO2": 5}})
        self.ok(self.client.put("/api/purchase-orders/PO2", json={"po": "PO2-R"}))
        self.assertEqual(self.legs(inv, 1), {"PO2-R": 5})
        self.assertEqual(self.ok(self.client.get(f"/api/invoices/{inv['id']}"))["lines"][0]["po_alloc"], [{"po": "PO2-R", "boxes": 5}])

    def test_deleting_an_order_lets_the_pins_go(self):
        inv = self.record("C1", {1: 5}, {1: {"PO2": 5}})
        self.ok(self.client.delete("/api/purchase-orders/PO2"), 204)
        fresh = self.ok(self.client.get(f"/api/invoices/{inv['id']}"))
        self.assertIsNone(fresh["lines"][0]["po_alloc"])
        self.assertEqual(self.legs(inv, 1), {"PO1": 5})

    def test_cutting_a_pinned_order_moves_the_rest_on(self):
        inv = self.record("C1", {1: 30}, {1: {"PO2": 30}})
        rows = self.ok(self.client.get("/api/purchase-orders/lines"))
        line = next(r for r in rows if r["po"] == "PO2" and r["item_id"] == self.i[1])
        others = [{"id": r["id"], "qty": r["qty"]} for r in rows if r["po"] == "PO2" and r["id"] != line["id"]]
        self.ok(self.client.put("/api/purchase-orders/PO2", json={"lines": [{"id": line["id"], "qty": 100}] + others}))
        self.assertEqual(self.legs(inv, 1), {"PO1": 20, "PO2": 10})


class Access(ApiCase):
    def as_user(self, *access):
        db = SessionLocal()
        u = models.User(email=f"u{len(access)}@jaikvin-test.com", password_hash=hash_password("x"), name="U",
                        role="user", status="active", access=list(access), email_verified=True, token_version=1)
        db.add(u)
        db.commit()
        self.client.cookies.set(settings.cookie_name, create_token(u.id, 1))
        db.close()

    def test_packing_staff_can_use_custom_po(self):
        self.as_user("shipment.packing")
        self.assertEqual(self.client.post("/api/invoices/open-orders", json={"item_ids": [self.i[1]]}).status_code, 200)
        self.record("C1", {1: 5}, {1: {"PO2": 5}})

    def test_someone_without_packing_cannot(self):
        self.as_user("home")
        self.assertEqual(self.client.post("/api/invoices/open-orders", json={"item_ids": [self.i[1]]}).status_code, 403)
        self.assertEqual(self.client.post("/api/invoices", json=self.invoice_body("X", {1: 5}, {1: {"PO2": 5}})).status_code, 403)
