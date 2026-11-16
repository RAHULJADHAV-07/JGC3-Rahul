"""Mode of transport (V-7.5.0): Setup ticks which modes each port / term
serves, the shipment offers only those, and an air shipment's status follows
its own steps — airports picked, then air waybill and flight."""
from tests.base import ApiCase
from app import calc


class ModeTags(ApiCase):
    def save(self, key, values, renames=None, modes=None):
        body = {"values": values, "renames": renames or {}}
        if modes is not None:
            body["modes"] = modes
        return self.ok(self.client.put(f"/api/options/list/{key}", json=body))

    def modes(self, key):
        return self.ok(self.client.get("/api/options"))["modes"][key]

    def test_modes_are_saved_and_read_back_in_a_fixed_order(self):
        out = self.save("ports_loading", ["NHAVA SHEVA", "SAHAR AIR CARGO, MUMBAI (INDIA)"],
                        modes={"NHAVA SHEVA": ["water"], "SAHAR AIR CARGO, MUMBAI (INDIA)": ["land", "air"]})
        self.assertEqual(out["modes"]["SAHAR AIR CARGO, MUMBAI (INDIA)"], ["air", "land"])
        self.assertEqual(self.modes("ports_loading"),
                         {"NHAVA SHEVA": ["water"], "SAHAR AIR CARGO, MUMBAI (INDIA)": ["air", "land"]})

    def test_an_entry_saved_before_modes_existed_is_unconfirmed_not_lost(self):
        self.save("ports_ship_to", ["FREMANTLE"])                     # an old client: no modes key
        self.assertEqual(self.modes("ports_ship_to"), {})
        self.assertEqual(self.ok(self.client.get("/api/options"))["ports_ship_to"], ["FREMANTLE"])

    def test_saving_without_modes_keeps_the_ones_there(self):
        self.save("terms_delivery", ["FOB MUMBAI", "CFR PERTH"], modes={"FOB MUMBAI": ["water"], "CFR PERTH": ["air"]})
        self.save("terms_delivery", ["FOB MUMBAI", "CFR PERTH", "CIF SYDNEY"])
        self.assertEqual(self.modes("terms_delivery"), {"FOB MUMBAI": ["water"], "CFR PERTH": ["air"]})

    def test_a_rename_carries_the_modes_of_the_old_spelling(self):
        self.save("ports_ship_to", ["PERHT"], modes={"PERHT": ["air"]})
        self.save("ports_ship_to", ["PERTH"], renames={"PERHT": "PERTH"})
        self.assertEqual(self.modes("ports_ship_to"), {"PERTH": ["air"]})

    def test_a_removed_entry_drops_its_modes(self):
        self.save("ports_ship_to", ["PERTH", "FREMANTLE"], modes={"PERTH": ["air"], "FREMANTLE": ["water"]})
        self.save("ports_ship_to", ["FREMANTLE"])
        self.assertEqual(self.modes("ports_ship_to"), {"FREMANTLE": ["water"]})

    def test_unknown_modes_and_unknown_entries_are_dropped(self):
        out = self.save("ports_loading", ["NHAVA SHEVA"], modes={
            "NHAVA SHEVA": ["water", "rocket", "<script>"], "NOT ON THE LIST": ["air"]})
        self.assertEqual(out["modes"], {"NHAVA SHEVA": ["water"]})

    def test_an_empty_mode_set_leaves_the_entry_unconfirmed(self):
        out = self.save("ports_loading", ["NHAVA SHEVA"], modes={"NHAVA SHEVA": []})
        self.assertEqual(out["modes"], {})

    def test_modes_follow_the_spelling_on_the_list_case_insensitively(self):
        out = self.save("ports_ship_to", ["Perth"], modes={"PERTH": ["air"]})
        self.assertEqual(out["modes"], {"Perth": ["air"]})

    def test_a_list_without_modes_refuses_them(self):
        resp = self.client.put("/api/options/list/packaging_types", json={"values": ["Cartons"], "modes": {"Cartons": ["air"]}})
        self.assertEqual(resp.status_code, 400)

    def test_a_malformed_modes_body_is_rejected_not_stored(self):
        resp = self.client.put("/api/options/list/ports_loading", json={"values": ["A"], "modes": {"A": "air"}})
        self.assertEqual(resp.status_code, 422)

    def test_only_setup_may_tag_modes(self):
        from app.database import SessionLocal
        from app import models
        from app.security import create_token, hash_password
        from app.config import settings
        db = SessionLocal()
        u = models.User(email="packer@jaikvin-test.com", password_hash=hash_password("x"), name="Packer",
                        role="user", status="active", access=["shipment.packing"], email_verified=True, token_version=1)
        db.add(u)
        db.commit()
        token = create_token(u.id, 1)
        db.close()
        self.client.cookies.set(settings.cookie_name, token)
        resp = self.client.put("/api/options/list/ports_loading", json={"values": ["X"], "modes": {"X": ["air"]}})
        self.assertEqual(resp.status_code, 403)
        # …but reading them is open to anyone signed in, as the shipment forms need.
        self.assertIn("modes", self.ok(self.client.get("/api/options")))


class AirStatus(ApiCase):
    def put_ship(self, inv, ship, skip=None):
        body = {"ship": ship}
        if skip is not None:
            body["step_skip"] = skip
        return self.ok(self.client.put(f"/api/invoices/{inv['id']}", json=body))

    def test_a_sea_shipment_still_moves_on_container_seal_then_bl(self):
        inv = self.record("SEA", {1: 1})
        st = self.put_ship(inv, {"container": "C1", "seal": "S1"}, {"vehicle": True})["status"]
        self.assertEqual(st, "Ready to Ship")
        st = self.put_ship(inv, {"container": "C1", "seal": "S1", "blNo": "B", "blDate": "2026-06-01", "vessel": "V"})["status"]
        self.assertEqual(st, "Shipped")

    def test_an_air_shipment_is_ready_once_its_airports_are_picked(self):
        inv = self.record("AIR", {1: 1})
        st = self.put_ship(inv, {"mode": "air", "pol": "SAHAR AIR CARGO", "pod": "PERTH"}, {"vehicle": True})["status"]
        self.assertEqual(st, "Ready to Ship")

    def test_an_air_shipment_needs_no_container(self):
        inv = self.record("AIR", {1: 1})
        st = self.put_ship(inv, {"mode": "air", "pol": "SAHAR AIR CARGO"}, {"vehicle": True})["status"]
        self.assertEqual(st, "Dispatched")

    def test_an_air_shipment_is_shipped_with_its_awb_and_flight(self):
        inv = self.record("AIR", {1: 1})
        base = {"mode": "air", "pol": "SAHAR AIR CARGO", "pod": "PERTH",
                "awbNo": "232-19269504", "awbDate": "2026-11-09", "airline": "MALAYSIA AIRLINES"}
        self.assertEqual(self.put_ship(inv, base, {"vehicle": True})["status"], "Ready to Ship")
        out = self.put_ship(inv, {**base, "flights": [{"no": "MH195", "date": "2026-11-11"}, {"no": "MH 127", "date": "2026-11-13"}]})
        self.assertEqual(out["status"], "Shipped")
        self.assertEqual(out["ship"]["flights"][1], {"no": "MH 127", "date": "2026-11-13"})

    def test_a_bl_does_not_ship_an_air_consignment(self):
        inv = self.record("AIR", {1: 1})
        out = self.put_ship(inv, {"mode": "air", "pol": "A", "pod": "B", "blNo": "X", "blDate": "2026-06-01", "vessel": "V"}, {"vehicle": True})
        self.assertEqual(out["status"], "Ready to Ship")

    def test_a_stray_mode_reads_as_sea(self):
        inv = self.record("ODD", {1: 1})
        out = self.put_ship(inv, {"mode": "submarine", "container": "C", "seal": "S"}, {"vehicle": True})
        self.assertEqual(out["ship"]["mode"], "water")
        self.assertEqual(out["status"], "Ready to Ship")

    def test_mode_set_while_packing_is_kept(self):
        body = self.invoice_body("PK", {1: 1})
        body["ship"] = {"mode": "AIR", "pol": "SAHAR AIR CARGO"}
        inv = self.ok(self.client.post("/api/invoices", json=body), 201)
        self.assertEqual(inv["ship"]["mode"], "air")

    def test_flight_legs_are_cleaned_and_capped(self):
        inv = self.record("AIR", {1: 1})
        legs = [{"no": f"  MH{n}  ", "date": "2026-11-11T00:00:00Z"} for n in range(10)] + ["junk", None]
        out = self.put_ship(inv, {"mode": "air", "flights": legs})
        self.assertEqual(len(out["ship"]["flights"]), calc.MAX_FLIGHTS)
        self.assertEqual(out["ship"]["flights"][0], {"no": "MH0", "date": "2026-11-11"})

    def test_a_runaway_field_is_cut(self):
        inv = self.record("BIG", {1: 1})
        out = self.put_ship(inv, {"marks": "X" * 50000})
        self.assertEqual(len(out["ship"]["marks"]), calc.MAX_SHIP_TEXT)

    def test_a_skipped_step_counts_whatever_the_mode(self):
        inv = self.record("AIR", {1: 1})
        out = self.put_ship(inv, {"mode": "air"}, {"vehicle": True, "container": True, "ship": True})
        self.assertEqual(out["status"], "Shipped")

    def test_a_rename_reaches_an_open_air_invoice(self):
        self.ok(self.client.put("/api/options/list/ports_loading", json={"values": ["SAHAR"], "modes": {"SAHAR": ["air"]}}))
        inv = self.record("AIR", {1: 1})
        self.put_ship(inv, {"mode": "air", "pol": "SAHAR"})
        self.ok(self.client.put("/api/options/list/ports_loading", json={
            "values": ["SAHAR AIR CARGO, MUMBAI (INDIA)"], "renames": {"SAHAR": "SAHAR AIR CARGO, MUMBAI (INDIA)"}}))
        fresh = self.ok(self.client.get(f"/api/invoices/{inv['id']}"))
        self.assertEqual(fresh["ship"]["pol"], "SAHAR AIR CARGO, MUMBAI (INDIA)")
        self.assertEqual(self.ok(self.client.get("/api/options"))["modes"]["ports_loading"],
                         {"SAHAR AIR CARGO, MUMBAI (INDIA)": ["air"]})

    def test_the_dashboard_counts_an_air_shipment_shipped(self):
        inv = self.record("AIR", {1: 1})
        before = self.ok(self.client.get("/api/dashboard/badges"))["shipments"]
        self.put_ship(inv, {"mode": "air", "pol": "A", "pod": "B", "awbNo": "1", "awbDate": "2026-11-09",
                            "airline": "MH", "flights": [{"no": "MH1", "date": ""}]}, {"vehicle": True})
        self.assertEqual(self.ok(self.client.get("/api/dashboard/badges"))["shipments"], before - 1)


class ModeSecurity(ApiCase):
    def test_reading_the_lists_needs_a_session(self):
        self.client.cookies.clear()
        self.assertEqual(self.client.get("/api/options").status_code, 401)

    def test_writing_modes_from_a_foreign_origin_is_refused(self):
        resp = self.client.put("/api/options/list/ports_loading", json={"values": ["X"], "modes": {"X": ["air"]}},
                               headers={"Origin": "https://evil.example"})
        self.assertEqual(resp.status_code, 403)

    def test_a_flood_of_modes_keeps_only_the_listed_entries(self):
        modes = {f"PORT {n}": ["air"] for n in range(5000)}
        out = self.ok(self.client.put("/api/options/list/ports_loading", json={"values": ["PORT 1", "PORT 2"], "modes": modes}))
        self.assertEqual(out["modes"], {"PORT 1": ["air"], "PORT 2": ["air"]})

    def test_a_mode_that_is_not_a_string_reads_as_sea(self):
        inv = self.record("ODD", {1: 1})
        out = self.ok(self.client.put(f"/api/invoices/{inv['id']}", json={"ship": {"mode": ["air"], "container": "C", "seal": "S"},
                                                                             "step_skip": {"vehicle": True}}))
        self.assertEqual(out["ship"]["mode"], "water")
        self.assertEqual(out["status"], "Ready to Ship")

    def test_markup_in_a_port_is_stored_as_text(self):
        bad = '<img src=x onerror="alert(1)">'
        out = self.ok(self.client.put("/api/options/list/ports_loading", json={"values": [bad], "modes": {bad: ["air"]}}))
        self.assertEqual(out["values"], [bad])
        self.assertEqual(out["modes"], {bad: ["air"]})

    def test_too_many_ship_fields_are_cut(self):
        inv = self.record("WIDE", {1: 1})
        out = self.ok(self.client.put(f"/api/invoices/{inv['id']}", json={"ship": {f"k{n}": "v" for n in range(400)}}))
        self.assertLessEqual(len(out["ship"]), calc.MAX_SHIP_KEYS)
