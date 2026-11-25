"""The item sequence: a plain pipe, then its PH twin — at every bore.

The client's own workbook (data/masters_seed.json, `source_row`) is the answer
sheet: inside a bore, the app must list Oswin's pipes exactly as it does."""
import json
import math
import random
import unittest
from pathlib import Path
from types import SimpleNamespace as NS

from tests import base  # noqa: F401  (pins the environment before app.* loads)
from tests.base import ApiCase, SessionLocal, models
from app import calc

SEED = [NS(**x) for x in json.loads((Path(__file__).parents[1] / "app/data/masters_seed.json").read_text())["items"]]
OSWIN = [x for x in SEED if x.source_sheet == "Oswin"]


def rank(it):
    return calc.item_rank(it, it.supplier_code)


def pipe(gd, size, length, group="25 MM (1\")", code=None):
    return NS(gd=gd, code=code or gd, size=size, length=length, group=group, source_sheet="Oswin", sticker_rule="oswin")


def in_order(items):
    shuffled = list(items)
    random.Random(7).shuffle(shuffled)
    return [x.gd for x in sorted(shuffled, key=rank_plain)]


def rank_plain(it):
    return calc.item_rank(it, "Oswin")


class Sequence(unittest.TestCase):
    def test_the_lines_in_the_photo(self):
        # 25 MM, as reported: PH stood ahead of plain down to PE2548PH.
        want = [("PE2524", "25", "610"), ("PE2524PH", '1"', "600"), ("PE2530", "25", "760"), ("PE2530PH", '1"', "750"),
                ("PE2536", "25", "915"), ("PE2536PH", '1"', "900"), ("PE2548", "25", "1220"), ("PE2548PH", '1"', "1200"),
                ("PE2572", "25", "1800"), ("PE2572PH", '1"', "1800")]
        self.assertEqual(in_order(pipe(*w) for w in want), [w[0] for w in want])

    def test_every_bore_reads_as_the_client_sheet_does(self):
        rows = sorted(OSWIN, key=lambda x: random.Random(x.code).random())
        rows.sort(key=rank)
        groups = {}
        for x in rows:
            groups.setdefault(x.group, []).append(x.source_row)
        self.assertEqual(len(groups), 10)
        for group, at in groups.items():
            self.assertEqual(at, sorted(at), group)

    def test_bores_climb_and_pmf_stays_last(self):
        rows = sorted(OSWIN, key=rank)
        pmf = [x.gd.startswith("PMF") for x in rows]
        self.assertEqual(pmf, sorted(pmf))
        bores = [calc.bore_mm(x) for x in rows if not x.gd.startswith("PMF")]
        self.assertEqual(bores, sorted(bores))

    def test_every_ph_pipe_follows_its_plain_twin(self):
        gds = [x.gd for x in sorted(OSWIN, key=rank)]
        pairs = [g for g in gds if g.endswith("PH") and g[:-2] in gds]
        self.assertGreater(len(pairs), 30)
        for g in pairs:
            self.assertEqual(gds[gds.index(g) - 1], g[:-2])

    def test_a_ph_pipe_with_no_twin_takes_its_length_s_place(self):
        want = [("PE2572", "25", "1800"), ("PE2583PH", '1"', "2100")]
        self.assertEqual(in_order(pipe(*w) for w in want), [w[0] for w in want])

    def test_spelling_of_the_code_does_not_matter(self):
        for twin in ("PE2524PH", "pe2524ph", "PE 2524 PH", "PE-2524-PH", " PE2524PH "):
            self.assertEqual(in_order([pipe(twin, '1"', "600"), pipe("PE2524", "25", "610")]), ["PE2524", twin])

    def test_a_code_that_is_not_bore_and_inches_goes_by_the_master(self):
        # PFH-1905 is five metres of 19 mm tube, not five inches.
        want = [("PFH-1905", "19", "5"), ("PFH-1910", "19", "10"), ("PFH-1925", "19", "25")]
        self.assertEqual(in_order(pipe(*w, group="HYDRO TUBES") for w in want), [w[0] for w in want])
        # A length typed since that the code no longer agrees with: the length wins.
        self.assertEqual(calc.pipe_length(pipe("PE2524", "25", "1500"))[0], 1500)

    def test_no_length_in_the_master_reads_it_off_the_code(self):
        self.assertEqual(in_order([pipe("PE2536", "25", ""), pipe("PE2524", "25", "610")]), ["PE2524", "PE2536"])

    def test_odd_master_fields_never_break_the_order(self):
        odd = [pipe(gd, size, length) for gd in ("", "PE2524", "PE25", "X", "PE252424PH", "९९", None)
               for size in ("", "nan", "inf", "25", None, '1"', "abc") for length in ("", "nan", "-inf", "1,220", None, "610")]
        a = sorted(odd, key=rank_plain)
        b = sorted(reversed(a), key=rank_plain)
        self.assertEqual([rank_plain(x) for x in a], [rank_plain(x) for x in b])
        for x in odd:
            self.assertTrue(all(math.isfinite(v) for v in rank_plain(x) if isinstance(v, (int, float))))

    def test_other_ranges_are_listed_as_they_were(self):
        for x in SEED:
            if x.source_sheet == "Oswin":
                continue
            k = rank(x)
            self.assertEqual((k[3], k[4], k[5], k[6], k[-2], k[-1]), (0.0, "", 0.0, x.gd or x.code, x.gd or x.code, x.code))


class Screens(ApiCase):
    """The same order out of every list the API sorts."""

    GDS = ["PE2524", "PE2524PH", "PE2530", "PE2530PH", "PE2548", "PE2548PH", "PE2572", "PE2572PH", "PE3212", "PE3212PH"]

    def setUp(self):
        super().setUp()
        seed = {x.gd: x for x in OSWIN}
        self.osw = self.ok(self.client.post("/api/suppliers", json={"code": "Oswin", "name": "Oswin Plastics", "place": "Daman"}))
        self.id = {}
        for gd in reversed(self.GDS):
            x = seed[gd]
            self.id[gd] = self.ok(self.client.post("/api/items", json={
                "code": x.code, "gd": gd, "description": x.description, "packing": 10, "size": x.size, "length": x.length,
                "group": x.group, "supplier_id": self.osw["id"], "sticker_rule": "oswin", "unit_value": 1, "unit_fob100": 1,
            }))["id"]
        shuffled = list(self.GDS)
        random.Random(3).shuffle(shuffled)
        self.ok(self.client.post("/api/purchase-orders", json={
            "po": "OSW1", "date": "2026-03-01", "buyer_id": self.buyer["id"], "rbi": 80.0,
            "lines": [{"item_id": self.id[g], "qty": 100} for g in shuffled]}))
        self.inv = self.ok(self.client.post("/api/invoices", json={
            "invoice_no": "JG/1", "date": "2026-05-01", "buyer_id": self.buyer["id"], "serial_start": 1,
            "lines": [{"item_id": self.id[g], "supplier_id": self.osw["id"], "boxes": 2} for g in shuffled]}), 201)

    def gds(self, rows):
        by_id = {v: k for k, v in self.id.items()}
        return [by_id[r["item_id"]] for r in rows if r["item_id"] in by_id]

    def test_every_list(self):
        get = lambda u: self.ok(self.client.get(u))  # noqa: E731
        self.assertEqual([x["gd"] for x in get("/api/items") if x["gd"] in self.GDS], self.GDS)
        self.assertEqual(self.gds(get("/api/masters/order/OSW1")["rows"]), self.GDS)
        self.assertEqual(self.gds(get(f"/api/masters/supplier/{self.osw['id']}")["rows"]), self.GDS)
        self.assertEqual(self.gds(get("/api/reports/supply-details")["rows"]), self.GDS)
        self.assertEqual(self.gds(get("/api/reports/item-detail")["rows"]), self.GDS)
        bal = get("/api/reports/balance")
        for k in ("po", "item", "supplier"):
            self.assertEqual(self.gds([r for r in bal[k] if r.get("po", "OSW1") == "OSW1"]), self.GDS, k)
        order = next(p for p in get("/api/purchase-orders") if p["po"] == "OSW1")
        self.assertEqual(self.gds(order["detail"]), self.GDS)
        self.assertEqual(self.gds(self.inv["lines"]), self.GDS)
        # …and the cartons of an invoice raised now climb down that same list.
        froms = [l["serial_from"] for l in sorted(self.inv["lines"], key=lambda l: self.GDS.index(self.gds([l])[0]))]
        self.assertEqual(froms, [1 + 2 * i for i in range(len(self.GDS))])

    def test_an_invoice_numbered_in_the_old_order_keeps_its_cartons(self):
        """Raised before the order was put right: PH ahead of plain. Re-listed
        and saved again, no carton changes its number."""
        db = SessionLocal()
        inv = db.get(models.Invoice, self.inv["id"])
        old = ["PE2524PH", "PE2524", "PE2530PH", "PE2530", "PE2548PH", "PE2548", "PE2572", "PE2572PH", "PE3212", "PE3212PH"]
        by_gd = {self.gds([{"item_id": l.item_id}])[0]: l for l in inv.lines}
        for n, gd in enumerate(old):
            by_gd[gd].position, by_gd[gd].serial_from = n, 1 + 2 * n
        db.commit()
        db.close()
        before = {self.gds([l])[0]: l["serial_from"] for l in self.ok(self.client.get(f"/api/invoices/{self.inv['id']}"))["lines"]}
        self.assertEqual(before["PE2524PH"], 1)
        saved = self.ok(self.client.put(f"/api/invoices/{self.inv['id']}", json={
            "lines": [{"item_id": self.id[g], "supplier_id": self.osw["id"], "boxes": 2} for g in self.GDS]}))
        self.assertEqual({self.gds([l])[0]: l["serial_from"] for l in saved["lines"]}, before)
        self.assertEqual(self.gds(saved["lines"]), self.GDS)
        # Numbering afresh is explicit, and then follows the list.
        again = self.ok(self.client.put(f"/api/invoices/{self.inv['id']}", json={"renumber": True}))
        self.assertEqual([l["serial_from"] for l in again["lines"]], [1 + 2 * i for i in range(len(self.GDS))])


if __name__ == "__main__":
    unittest.main()
