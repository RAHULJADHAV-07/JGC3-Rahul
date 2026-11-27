"""Purchase heading (V-7.10.0): each order line carries the date of the
supplier price list its price came from, `price_from` on /purchase-orders/lines."""
from tests.test_prices import Prices


class PriceListDate(Prices):
    def date_of(self, po, n):
        return next(l for l in self.lines(po) if l["item_id"] == self.i[n])["price_from"]

    def test_never_repriced_has_no_date(self):
        # PO1's items came in with the master: no price list, no date (the
        # report then prints the order's own date).
        self.assertIsNone(self.date_of("PO1", 1))

    def test_new_order_takes_the_list_in_force_on_its_date(self):
        self.set_supplier("2026-10-01", [{"item_id": self.i[1], "unit_value": 110.45}])
        self.place_order("TEST-PO", "2026-11-06", {1: 5, 2: 5})
        self.assertEqual(self.date_of("TEST-PO", 1), "2026-10-01")
        self.assertIsNone(self.date_of("TEST-PO", 2))       # item 2 never repriced

    def test_later_list_wins_for_an_order_after_it(self):
        self.set_supplier("2026-10-01", [{"item_id": self.i[1], "unit_value": 110.0}])
        self.set_supplier("2026-11-01", [{"item_id": self.i[1], "unit_value": 120.0}])
        self.place_order("A", "2026-10-15", {1: 1})
        self.place_order("B", "2026-11-06", {1: 1})
        self.assertEqual(self.date_of("A", 1), "2026-10-01")
        self.assertEqual(self.date_of("B", 1), "2026-11-01")

    def test_same_price_again_is_not_a_new_list(self):
        # Re-saving the price already in force is ignored by the price list,
        # so it cannot be used to date an order already raised.
        out = self.set_supplier("2026-01-01", [{"item_id": self.i[1], "unit_value": 100.0}])
        self.assertEqual(out["changed"], 0)
        self.assertIsNone(self.date_of("PO2", 1))

    def test_existing_order_keeps_no_date_after_a_new_price(self):
        # PO2 (10.02.2026) was placed at the master's 100; a new price dated
        # before it does not reprice it, so it is not on that list.
        self.set_supplier("2026-01-01", [{"item_id": self.i[1], "unit_value": 120.0}])
        self.assertEqual(next(l for l in self.lines("PO2") if l["item_id"] == self.i[1])["unit_value"], 100.0)
        self.assertIsNone(self.date_of("PO2", 1))

    def test_list_dated_after_the_order_does_not_apply(self):
        self.place_order("C", "2026-11-06", {1: 1})
        self.set_supplier("2026-11-20", [{"item_id": self.i[1], "unit_value": 130.0}])
        self.assertIsNone(self.date_of("C", 1))


class FobListDate(Prices):
    """Sales heads its FOB with the date of our own price list (V-7.10.0)."""
    def fob_of(self, po, n):
        return next(l for l in self.lines(po) if l["item_id"] == self.i[n])["fob_from"]

    def test_buyer_price_list_dates_the_fob(self):
        self.set_buyer("2026-09-01", [{"item_id": self.i[1], "mode": "manual", "unit_value": 150.0, "unit_fob100": 80.0}])
        self.place_order("S1", "2026-11-06", {1: 1})
        self.assertEqual(self.fob_of("S1", 1), "2026-09-01")

    def test_without_a_buyer_list_the_supplier_fob_date(self):
        self.set_supplier("2026-08-01", [{"item_id": self.i[2], "unit_fob100": 55.0}])
        self.place_order("S2", "2026-11-06", {2: 1})
        self.assertEqual(self.fob_of("S2", 2), "2026-08-01")

    def test_never_priced_has_no_fob_date(self):
        self.assertIsNone(self.fob_of("PO1", 1))
