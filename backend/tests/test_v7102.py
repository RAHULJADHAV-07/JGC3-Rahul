"""V-7.10.2: price list changes carried onto orders from their date; packaging
by length and per line; the line's packaging through orders, invoices and the
ledger."""
from tests.base import ApiCase


class Base(ApiCase):
    def lines(self, po):
        return [l for l in self.ok(self.client.get("/api/purchase-orders/lines")) if l["po"] == po]

    def price_of(self, po, n):
        return next(l["unit_value"] for l in self.lines(po) if l["item_id"] == self.i[n])

    def fob_of(self, po, n):
        return next(l["unit_fob100"] for l in self.lines(po) if l["item_id"] == self.i[n])

    def save_supplier(self, effective, rows, apply=False, code=200):
        r = self.client.post("/api/prices/supplier",
                             json={"effective": effective, "rows": rows, "apply_to_orders": apply})
        self.assertEqual(r.status_code, code, r.text)
        return r.json()

    def save_buyer(self, buyer_id, effective, rows, apply=False):
        r = self.client.post(f"/api/prices/buyer/{buyer_id}",
                             json={"effective": effective, "rows": rows, "apply_to_orders": apply})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()


class PriceListToOrders(Base):
    def test_unticked_nothing_on_the_book_moves(self):
        out = self.save_supplier("2026-02-01", [{"item_id": self.i[1], "unit_value": 130.0}])
        self.assertEqual(out["repriced"], 0)
        self.assertEqual(self.price_of("PO1", 1), 100.0)
        self.assertEqual(self.price_of("PO2", 1), 100.0)

    def test_ticked_orders_from_that_day_move_older_ones_do_not(self):
        out = self.save_supplier("2026-02-01", [{"item_id": self.i[1], "unit_value": 130.0, "unit_fob100": 65.0}],
                                 apply=True)
        self.assertEqual((out["repriced"], out["pos"]), (1, ["PO2"]))
        self.assertEqual(self.price_of("PO1", 1), 100.0)      # dated before the change
        self.assertEqual(self.price_of("PO2", 1), 130.0)      # dated after: restated
        self.assertEqual(self.fob_of("PO2", 1), 65.0)
        self.assertEqual(self.price_of("PO2", 2), 100.0)      # another item on the same order
        # A new order dated after the change takes it too.
        self.place_order("PO5", "2026-06-01", {1: 3})
        self.assertEqual(self.price_of("PO5", 1), 130.0)

    def test_each_order_takes_its_own_dates_price(self):
        self.save_supplier("2026-03-01", [{"item_id": self.i[6], "unit_value": 150.0}])
        out = self.save_supplier("2026-01-01", [{"item_id": self.i[6], "unit_value": 120.0}], apply=True)
        # PO3 (10 Mar) and PO4 (10 Apr) are both after 1 Jan, but the 1 Mar price
        # is the one in force on their dates.
        self.assertEqual(self.price_of("PO3", 6), 150.0)
        self.assertEqual(self.price_of("PO4", 6), 150.0)
        self.assertEqual(out["repriced"], 2)

    def test_delivered_lines_never_move(self):
        self.record("INV1", {4: 30})                          # PO2's item 4 delivered in full
        self.save_supplier("2026-02-01", [{"item_id": self.i[4], "unit_value": 140.0}], apply=True)
        self.assertEqual(self.price_of("PO2", 4), 100.0)

    def test_reach_lists_what_the_tick_would_move(self):
        self.record("INV1", {6: 5})                           # PO3's item 6 delivered
        r = self.ok(self.client.post("/api/prices/reach", json={"effective": "2026-04-01",
                                                                "item_ids": [self.i[6], self.i[1]]}))
        self.assertEqual([p["po"] for p in r["pos"]], ["PO4"])
        self.assertEqual(r["boxes"], 5)
        self.assertEqual(r["older_pos"], ["PO1", "PO2"])      # item 1 is open on both, older
        empty = self.ok(self.client.post("/api/prices/reach", json={"effective": "2026-04-01", "item_ids": []}))
        self.assertEqual(empty["pos"], [])

    def test_buyer_prices_reach_only_that_buyer(self):
        other = self.ok(self.client.post("/api/buyers", json={"name": "Other", "brand": "OTH", "ports": []}))
        self.ok(self.client.post("/api/purchase-orders", json={
            "po": "PO9", "date": "2026-03-01", "buyer_id": other["id"], "rbi": 80.0,
            "lines": [{"item_id": self.i[1], "qty": 50}]}))
        out = self.save_buyer(self.buyer["id"], "2026-02-01",
                              [{"item_id": self.i[1], "mode": "manual", "unit_value": 100.0, "unit_fob100": 70.0}],
                              apply=True)
        self.assertEqual(out["pos"], ["PO2"])
        self.assertEqual(self.fob_of("PO2", 1), 70.0)
        self.assertEqual(self.fob_of("PO1", 1), 50.0)
        self.assertEqual(self.fob_of("PO9", 1), 50.0)         # the other buyer's order

    def test_setup_apply_honours_the_from_date(self):
        self.ok(self.client.put(f"/api/items/{self.i[1]}", json={"unit_value": 125.0, "price_from": "2026-02-01"}))
        pend = self.ok(self.client.get(f"/api/purchase-orders/pending-for-item/{self.i[1]}",
                                       params={"since": "2026-02-01"}))
        self.assertEqual([p["po"] for p in pend["pos"]], ["PO2"])
        self.assertEqual(pend["older"], ["PO1"])
        out = self.ok(self.client.post("/api/purchase-orders/apply-prices",
                                       params={"item_id": self.i[1], "since": "2026-02-01"}))
        self.assertEqual(out["pos"], ["PO2"])
        self.assertEqual(self.price_of("PO1", 1), 100.0)
        self.assertEqual(self.price_of("PO2", 1), 125.0)
        bad = self.client.post("/api/purchase-orders/apply-prices", params={"item_id": self.i[1], "since": "02/01/2026"})
        self.assertEqual(bad.status_code, 422)


class PackagingRule(Base):
    def set_types(self, *values, renames=None):
        self.ok(self.client.put("/api/options/list/packaging_types",
                                json={"values": list(values), "renames": renames or {}}))

    def test_one_length_per_type_on_the_list(self):
        self.assertEqual(self.ok(self.client.get("/api/options"))["packaging_rules"], [])
        self.set_types("Cartons", "Bundle", "Demo pack")
        r = self.ok(self.client.put("/api/options/packaging-rules", json={"rules": [
            {"type": "bundle", "above_mm": "1000.0"},          # any case, the list's spelling kept
            {"type": "DEMO PACK", "above_mm": 3000},
            {"type": "Crate", "above_mm": 900},                # not on the list: dropped
            {"type": "Cartons", "above_mm": -5},               # no length: dropped
            {"type": "Bundle", "above_mm": 1200}]}))           # the last one for a type wins
        self.assertEqual(r["rules"], [{"type": "Bundle", "above_mm": 1200}, {"type": "Demo pack", "above_mm": 3000}])
        self.assertEqual(self.ok(self.client.get("/api/options"))["packaging_rules"], r["rules"])
        # Renamed on the list, the length follows; removed, it goes.
        self.set_types("Cartons", "Bundles", "Demo pack", renames={"Bundle": "Bundles"})
        self.assertEqual(self.ok(self.client.get("/api/options"))["packaging_rules"],
                         [{"type": "Bundles", "above_mm": 1200}, {"type": "Demo pack", "above_mm": 3000}])
        self.set_types("Cartons", "Bundles")
        self.assertEqual(self.ok(self.client.get("/api/options"))["packaging_rules"], [{"type": "Bundles", "above_mm": 1200}])
        self.assertEqual(self.ok(self.client.put("/api/options/packaging-rules", json={"rules": []}))["rules"], [])


class LinePackaging(Base):
    def setUp(self):
        super().setUp()
        self.ok(self.client.put("/api/options/list/packaging_types", json={"values": ["Cartons", "Bundle", "Demo pack"]}))

    def test_order_lines_keep_and_change_their_packaging(self):
        self.ok(self.client.post("/api/purchase-orders", json={
            "po": "PO7", "date": "2026-05-01", "buyer_id": self.buyer["id"],
            "lines": [{"item_id": self.i[1], "qty": 10, "packaging": "bundle"},
                      {"item_id": self.i[2], "qty": 10}]}))
        got = {l["item_id"]: l["packaging"] for l in self.lines("PO7")}
        self.assertEqual(got, {self.i[1]: "Bundle", self.i[2]: None})       # the list's spelling
        ids = {l["item_id"]: l["id"] for l in self.lines("PO7")}
        # Lines sent without packaging keep theirs; one sent with it changes.
        self.ok(self.client.put("/api/purchase-orders/PO7", json={"lines": [
            {"id": ids[self.i[1]], "item_id": self.i[1], "qty": 20},
            {"id": ids[self.i[2]], "item_id": self.i[2], "qty": 10, "packaging": "Demo pack"}]}))
        got = {l["item_id"]: (l["packaging"], l["qty"]) for l in self.lines("PO7")}
        self.assertEqual(got, {self.i[1]: ("Bundle", 20), self.i[2]: ("Demo pack", 10)})
        # Blank goes back to "as the item goes".
        self.ok(self.client.put("/api/purchase-orders/PO7", json={"lines": [
            {"id": ids[self.i[1]], "item_id": self.i[1], "qty": 20, "packaging": ""},
            {"id": ids[self.i[2]], "item_id": self.i[2], "qty": 10}]}))
        self.assertEqual({l["item_id"]: l["packaging"] for l in self.lines("PO7")},
                         {self.i[1]: None, self.i[2]: "Demo pack"})
        po = self.ok(self.client.get("/api/purchase-orders/PO7"))
        self.assertEqual({d["item_id"]: d["packaging"] for d in po["detail"]}, {self.i[1]: None, self.i[2]: "Demo pack"})
        # Renamed on the list, the order line follows.
        self.ok(self.client.put("/api/options/list/packaging_types",
                                json={"values": ["Cartons", "Bundle", "Crate"], "renames": {"Demo pack": "Crate"}}))
        self.assertEqual({l["item_id"]: l["packaging"] for l in self.lines("PO7")}, {self.i[1]: None, self.i[2]: "Crate"})
        # Taken off the list, a line that has it may still be saved with it; nothing else may pick it.
        self.ok(self.client.put("/api/options/list/packaging_types", json={"values": ["Cartons", "Bundle"]}))
        self.ok(self.client.put("/api/purchase-orders/PO7", json={"lines": [
            {"id": ids[self.i[1]], "item_id": self.i[1], "qty": 20, "packaging": None},
            {"id": ids[self.i[2]], "item_id": self.i[2], "qty": 10, "packaging": "Crate"}]}))
        refused = self.client.put("/api/purchase-orders/PO7", json={"lines": [
            {"id": ids[self.i[1]], "item_id": self.i[1], "qty": 20, "packaging": "Crate"},
            {"id": ids[self.i[2]], "item_id": self.i[2], "qty": 10}]})
        self.assertEqual(refused.status_code, 422, refused.text)
        bad = self.client.post("/api/purchase-orders", json={
            "po": "PO8", "date": "2026-05-01", "lines": [{"item_id": self.i[1], "qty": 10, "packaging": "crate"}]})
        self.assertEqual(bad.status_code, 422)

    def test_invoice_lines_keep_their_packaging_through_edits(self):
        body = self.invoice_body("INV1", {1: 5, 2: 5})
        body["lines"][0]["packaging"] = "BUNDLE"
        inv = self.ok(self.client.post("/api/invoices", json=body), 201)
        got = {l["item_id"]: l["packaging"] for l in inv["lines"]}
        self.assertEqual(got, {self.i[1]: "Bundle", self.i[2]: None})
        # An edit that does not mention packaging keeps it; one that does, changes it.
        edit = [{"item_id": self.i[1], "supplier_id": self.sup["id"], "boxes": 4},
                {"item_id": self.i[2], "supplier_id": self.sup["id"], "boxes": 5, "packaging": "Demo pack"}]
        out = self.ok(self.client.put(f"/api/invoices/{inv['id']}", json={"lines": edit}))
        self.assertEqual({l["item_id"]: l["packaging"] for l in out["lines"]}, {self.i[1]: "Bundle", self.i[2]: "Demo pack"})
        bad = self.client.put(f"/api/invoices/{inv['id']}", json={"lines": [dict(edit[0], packaging="Crate"), edit[1]]})
        self.assertEqual(bad.status_code, 422, bad.text)
        # Switching Custom PO → FIFO restates the lines and keeps their packaging.
        body = self.invoice_body("INV2", {3: 4}, pins={3: {"PO1": 4}})
        body["lines"][0]["packaging"] = "Cartons"
        inv2 = self.ok(self.client.post("/api/invoices", json=body), 201)
        out = self.ok(self.client.put(f"/api/invoices/{inv2['id']}", json={"allocation": "fifo"}))
        self.assertEqual([(l["item_id"], l["packaging"], l["po_alloc"]) for l in out["lines"]], [(self.i[3], "Cartons", None)])

    def test_the_orders_packaging_reaches_the_ledger(self):
        ids = {l["item_id"]: l["id"] for l in self.lines("PO1")}
        self.ok(self.client.put("/api/purchase-orders/PO1", json={"lines": [
            {"id": ids[self.i[1]], "item_id": self.i[1], "qty": 200, "packaging": "Bundle"},
            {"id": ids[self.i[2]], "item_id": self.i[2], "qty": 200},
            {"id": ids[self.i[3]], "item_id": self.i[3], "qty": 200}]}))
        inv = self.record("INV1", {1: 25})                    # 20 off PO1, 5 off PO2
        legs = self.ok(self.client.get(f"/api/invoices/{inv['id']}"))["po_legs"][self.i[1]]
        self.assertEqual([(x["po"], x["boxes"], x.get("packaging")) for x in legs],
                         [("PO1", 20, "Bundle"), ("PO2", 5, None)])
        prev = self.ok(self.client.post("/api/invoices/allocation-preview", json={
            "date": "2026-06-01", "lines": [{"item_id": self.i[2], "boxes": 3}]}))
        self.assertEqual([(x["po"], x["packaging"]) for x in prev[self.i[2]]["legs"]], [("PO1", None)])
        opened = self.ok(self.client.post("/api/invoices/open-orders", json={"item_ids": [self.i[1]]}))
        self.assertEqual([(x["po"], x["packaging"]) for x in opened[self.i[1]]], [("PO2", None)])


class Groups(Base):
    def groups(self):
        return self.ok(self.client.get("/api/options"))["groups"]

    def item(self, n):
        return next(i for i in self.ok(self.client.get("/api/items")) if i["id"] == self.i[n])

    def test_the_list_starts_from_the_items_and_follows_them(self):
        for n, g in ((1, '25 MM (1")'), (2, '15 MM (1/2")'), (3, "PP Moulded"), (4, '100 MM (4")'), (5, "GRN Range")):
            self.ok(self.client.put(f"/api/items/{self.i[n]}", json={"group": g}))
        # Never saved: worked out from the items, sizes by their millimetres, then the rest.
        self.assertEqual(self.groups(), ['15 MM (1/2")', '25 MM (1")', '100 MM (4")', "GRN Range", "PP Moulded"])
        # Saved, edited and added to.
        self.ok(self.client.put("/api/options/list/groups", json={
            "values": ['15 MM (1/2")', '25 MM (1")', '100 MM (4")', "GRN Range", "PP Moulded", "HYDRO TUBES"]}))
        self.assertIn("HYDRO TUBES", self.groups())
        # Renamed: every item in it follows; untouched items keep theirs.
        self.ok(self.client.put("/api/options/list/groups", json={
            "values": ['15 MM (1/2")', '25 MM (1")', '100 MM (4")', "GRN Range", "PP MOULDED FITTINGS", "HYDRO TUBES"],
            "renames": {"PP Moulded": "PP MOULDED FITTINGS"}}))
        self.assertEqual(self.item(3)["group"], "PP MOULDED FITTINGS")
        self.assertEqual(self.item(1)["group"], '25 MM (1")')
        # Removed: the items keep it until changed; the list no longer offers it.
        self.ok(self.client.put("/api/options/list/groups", json={"values": ['15 MM (1/2")', '25 MM (1")', "HYDRO TUBES"]}))
        self.assertEqual(self.item(4)["group"], '100 MM (4")')
        self.assertNotIn('100 MM (4")', self.groups())

    def test_an_item_saved_with_a_new_group_or_packaging_joins_the_list(self):
        self.ok(self.client.put("/api/options/list/groups", json={"values": ["PP"]}))
        self.ok(self.client.put("/api/options/list/packaging_types", json={"values": ["Cartons"]}))
        self.ok(self.client.put(f"/api/items/{self.i[1]}", json={"group": "DEMO2", "packaging_type": "Crate"}))
        self.assertEqual(self.groups(), ["PP", "DEMO2"])
        self.assertEqual(self.ok(self.client.get("/api/options"))["packaging_types"], ["Cartons", "Crate"])
        made = self.ok(self.client.post("/api/items", json={
            "code": "N1", "gd": "N1", "description": "New", "packing": 10, "supplier_id": self.sup["id"],
            "group": "pp", "packaging_type": "Cartons"}), 201)
        self.assertEqual(self.groups(), ["PP", "DEMO2"])        # "pp" is PP already
        self.assertEqual(made["group"], "PP")                   # in the list's spelling


class Renumber(Base):
    """An invoice whose lines were stored in an older item sequence: renumbering
    must number them in the sequence the papers print today."""

    def scramble(self, inv_id):
        """Store the lines back to front, numbered that way — what an invoice
        raised under an older sequence looks like."""
        from app.database import SessionLocal
        from app import models
        db = SessionLocal()
        inv = db.get(models.Invoice, inv_id)
        lines = sorted(inv.lines, key=lambda l: l.position)[::-1]
        nxt = inv.serial_start
        for pos, l in enumerate(lines):
            l.position, l.serial_from = pos, nxt
            nxt += l.boxes
        inv.serial_next = nxt
        db.commit()
        db.close()

    def test_renumber_follows_todays_sequence(self):
        inv = self.record("INV1", {1: 5, 2: 3, 3: 4})
        sequence = [l["item_id"] for l in sorted(inv["lines"], key=lambda l: l["position"])]
        self.scramble(inv["id"])
        stored = self.ok(self.client.get(f"/api/invoices/{inv['id']}"))
        self.assertEqual([l["item_id"] for l in stored["lines"]], sequence[::-1])
        # Renumber alone (no lines sent).
        out = self.ok(self.client.put(f"/api/invoices/{inv['id']}", json={"renumber": True}))
        froms = {l["item_id"]: l["serial_from"] for l in out["lines"]}
        self.assertEqual([l["item_id"] for l in out["lines"]], sequence)
        self.assertEqual(sorted(froms.values()), [froms[i] for i in sequence])
        self.assertEqual(froms[sequence[0]], 1001)
        # Renumber with the lines sent back in the stored (old) order, as the edit form does.
        self.scramble(inv["id"])
        stored = self.ok(self.client.get(f"/api/invoices/{inv['id']}"))
        body = {"renumber": True, "lines": [{"item_id": l["item_id"], "supplier_id": l["supplier_id"], "boxes": l["boxes"]}
                                            for l in stored["lines"]]}
        out = self.ok(self.client.put(f"/api/invoices/{inv['id']}", json=body))
        froms = {l["item_id"]: l["serial_from"] for l in out["lines"]}
        self.assertEqual([l["item_id"] for l in out["lines"]], sequence)
        self.assertEqual([froms[i] for i in sequence], sorted(froms.values()))
        last = sequence[-1]
        self.assertEqual(froms[last] + next(l["boxes"] for l in out["lines"] if l["item_id"] == last) - 1, 1012)
