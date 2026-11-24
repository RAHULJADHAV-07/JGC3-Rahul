"""Security tests: who may reach what, what a request may carry, and how a
session can be forged, replayed or stolen. Every route the app has is walked, so
one added without a guard fails here by name."""
import json
import re
from datetime import datetime, timedelta, timezone
from unittest import mock

import jwt
from fastapi.testclient import TestClient

from tests.base import ApiCase, ORIGIN
from app import models, security
from app.bodyguard import MAX_BYTES
from app.config import PLACEHOLDER_SECRETS, guard_secrets, settings
from app.database import SessionLocal
from app.main import app
from app.permissions import ALL_PERMS
from app.security import create_challenge_token, create_stepup_token, create_token, create_unlock_token, hash_password

# The only doors that open without a session.
PUBLIC = {
    ("GET", "/api/auth/status"), ("GET", "/api/auth/permissions"), ("POST", "/api/auth/bootstrap"),
    ("POST", "/api/auth/login"), ("POST", "/api/auth/verify-otp"), ("POST", "/api/auth/resend-otp"),
    ("POST", "/api/auth/logout"), ("POST", "/api/auth/unlock/start"), ("POST", "/api/auth/unlock/verify"),
}
# What anybody signed in may read, whatever they are granted: the masters every
# screen is drawn from, and themselves.
ANYBODY = {
    ("GET", "/api/auth/me"), ("GET", "/api/items"), ("GET", "/api/items/grouped"), ("GET", "/api/items/groups"),
    ("GET", "/api/buyers"), ("GET", "/api/suppliers"), ("GET", "/api/transports"), ("GET", "/api/options"),
    ("GET", "/api/options/item-columns"), ("GET", "/api/options/doc-columns"), ("GET", "/api/dashboard/badges"),
    ("GET", "/api/masters/seed"), ("POST", "/api/masters/derive"), ("GET", "/api/masters/formulas"),
    ("POST", "/api/auth/change-password/forced"),   # refuses unless one is owed
}


def routes():
    # Read off the published map, which lists every route however it is mounted.
    for path, ops in app.openapi()["paths"].items():
        for method in ops:
            if path.startswith("/api/"):
                yield method.upper(), path


def fill(path):
    return re.sub(r"\{[^}]+\}", "zzz", path)


class Guarded(ApiCase):
    def user(self, email="u@jaikvin-test.com", access=(), role="user", **kw):
        db = SessionLocal()
        fields = {"status": "active", "email_verified": True, "token_version": 1, "name": "U", **kw}
        u = models.User(email=email, password_hash=hash_password("Corr3ct-horse!"), role=role, access=list(access), **fields)
        db.add(u)
        db.commit()
        uid = u.id
        db.close()
        return uid

    def sign_in(self, uid, version=1):
        self.client.cookies.set(settings.cookie_name, create_token(uid, version))

    def call(self, method, path):
        return self.client.request(method, fill(path), json={} if method not in ("GET", "DELETE") else None)


class Doors(Guarded):
    def test_the_map_is_complete(self):
        self.assertGreater(len(list(routes())), 70)
        self.assertEqual({r for r in PUBLIC | ANYBODY if r not in set(routes())}, set(), "named here but no longer a route")

    def test_nothing_opens_without_a_session(self):
        self.client.cookies.clear()
        for method, path in routes():
            if (method, path) in PUBLIC:
                continue
            with self.subTest(route=f"{method} {path}"):
                self.assertEqual(self.call(method, path).status_code, 401)

    def test_somebody_granted_nothing_reaches_only_the_masters(self):
        self.sign_in(self.user())
        for method, path in routes():
            if (method, path) in PUBLIC:
                continue
            with self.subTest(route=f"{method} {path}"):
                code = self.call(method, path).status_code
                if (method, path) in ANYBODY:
                    self.assertNotEqual(code, 403 if method == "GET" else 401)
                else:
                    self.assertEqual(code, 403)

    def test_every_permission_but_admin_still_stops_at_the_admins_doors(self):
        self.sign_in(self.user(access=ALL_PERMS))
        admin_only = [("GET", "/api/users"), ("POST", "/api/users"), ("PUT", "/api/users/{uid}"), ("DELETE", "/api/users/{uid}"),
                      ("PUT", "/api/users/{uid}/password"), ("POST", "/api/users/{uid}/unlock"), ("POST", "/api/users/{uid}/sign-out"),
                      ("GET", "/api/audit"), ("GET", "/api/audit/summary"), ("POST", "/api/masters/import"),
                      ("DELETE", "/api/invoices/{iid}"), ("DELETE", "/api/purchase-orders/{po}"),
                      ("POST", "/api/auth/step-up/start"), ("POST", "/api/auth/change-password")]
        for method, path in admin_only:
            with self.subTest(route=f"{method} {path}"):
                self.assertEqual(self.call(method, path).status_code, 403)

    def test_a_password_an_admin_set_opens_one_door_only(self):
        self.sign_in(self.user(access=ALL_PERMS, must_change_password=True))
        for method, path in routes():
            if (method, path) in PUBLIC | {("GET", "/api/auth/me"), ("POST", "/api/auth/change-password/forced")}:
                continue
            with self.subTest(route=f"{method} {path}"):
                r = self.call(method, path)
                self.assertEqual(r.status_code, 403)

    def test_packing_rights_do_not_reach_orders_or_setup(self):
        self.sign_in(self.user(access=["shipment.packing"]))
        for method, path in [("POST", "/api/purchase-orders"), ("PUT", "/api/purchase-orders/{po}"), ("POST", "/api/items"),
                             ("PUT", "/api/buyers/{bid}"), ("PUT", "/api/options/list/{key}"), ("GET", "/api/costing"),
                             ("POST", "/api/purchase-orders/apply-prices")]:
            with self.subTest(route=f"{method} {path}"):
                self.assertEqual(self.call(method, path).status_code, 403)


# What each area's own screens read. Somebody granted one area and nothing else
# must be able to work in it.
SCREENS = {
    "home": ["/api/dashboard/matrix", "/api/dashboard/hidden-pos", "/api/invoices"],
    "orders.entry": ["/api/purchase-orders", "/api/purchase-orders/lines", "/api/reports/item-detail", "/api/purchase-orders/price-drift", "/api/masters/order/PO1"],
    "orders.reports": ["/api/purchase-orders", "/api/purchase-orders/lines", "/api/invoices"],
    "shipment.packing": ["/api/invoices", "/api/reports/balance", "/api/purchase-orders/lines"],
    "shipment.details": ["/api/invoices", "/api/purchase-orders/lines"],
    "shipment.reports": ["/api/purchase-orders", "/api/purchase-orders/lines", "/api/invoices"],
    "pre-shipment": ["/api/purchase-orders", "/api/purchase-orders/lines", "/api/invoices"],
    "post-shipment": ["/api/purchase-orders", "/api/purchase-orders/lines", "/api/invoices"],
    "reports.balance": ["/api/reports/balance", "/api/reports/supply-details", "/api/purchase-orders", "/api/purchase-orders/lines", "/api/invoices"],
    "reports.costing": ["/api/costing", "/api/costing/params", "/api/costing/formulas"],
    "setup.items": ["/api/purchase-orders", "/api/purchase-orders/lines", "/api/invoices", "/api/purchase-orders/price-drift"],
    "setup.parties": ["/api/purchase-orders", "/api/purchase-orders/lines", "/api/invoices"],
}
SHARED = ["/api/auth/me", "/api/items", "/api/items/grouped", "/api/buyers", "/api/suppliers", "/api/transports", "/api/options", "/api/options/doc-columns", "/api/options/item-columns", "/api/dashboard/badges"]


class Areas(Guarded):
    def test_every_area_works_on_its_own(self):
        self.assertEqual(set(SCREENS), set(ALL_PERMS), "an area with no screens listed")
        for perm, urls in SCREENS.items():
            self.sign_in(self.user(email=f"{perm.replace('.', '-')}@jaikvin-test.com", access=[perm]))
            for url in urls + SHARED:
                with self.subTest(area=perm, url=url):
                    self.assertEqual(self.client.get(url).status_code, 200)

    def test_reading_is_not_writing(self):
        """Wider reads for the papers open no write anywhere."""
        writes = {
            "orders.entry": [("POST", "/api/purchase-orders"), ("PUT", "/api/purchase-orders/PO1")],
            "shipment.packing": [("POST", "/api/invoices"), ("POST", "/api/invoices/open-orders"), ("POST", "/api/invoices/allocation-preview")],
            "shipment.details": [("POST", "/api/invoices"), ("PUT", "/api/invoices/zzz")],
            "setup.items": [("POST", "/api/items"), ("PUT", "/api/options/item-sequence")],
            "setup.parties": [("POST", "/api/buyers"), ("POST", "/api/suppliers"), ("POST", "/api/transports")],
            "reports.costing": [("PUT", "/api/costing/params")],
        }
        allowed = {w: {p for p, ws in writes.items() if w in ws} for ws in writes.values() for w in ws}
        allowed[("POST", "/api/invoices")] = {"shipment.packing", "shipment.details"}
        allowed[("PUT", "/api/invoices/zzz")] = {"shipment.packing", "shipment.details"}
        allowed[("POST", "/api/invoices/open-orders")] = allowed[("POST", "/api/invoices/allocation-preview")] = {"shipment.packing", "shipment.details"}
        for perm in ALL_PERMS:
            self.sign_in(self.user(email=f"w-{perm.replace('.', '-')}@jaikvin-test.com", access=[perm]))
            for (method, url), who in allowed.items():
                with self.subTest(area=perm, route=f"{method} {url}"):
                    code = self.client.request(method, url, json={}).status_code
                    self.assertEqual(code == 403, perm not in who, code)

    def test_costing_alone_never_reads_the_registers(self):
        self.sign_in(self.user(access=["reports.costing"]))
        for url in ("/api/reports/balance", "/api/invoices", "/api/purchase-orders", "/api/reports/item-detail"):
            self.assertEqual(self.client.get(url).status_code, 403)


class Sessions(Guarded):
    def me(self):
        return self.client.get("/api/auth/me").status_code

    def forge(self, secret=None, alg="HS256", **over):
        uid = getattr(self, "uid", None) or self.user(access=ALL_PERMS)
        self.uid = uid
        now = datetime.now(timezone.utc)
        payload = {"sub": uid, "iat": now, "exp": now + timedelta(hours=1), "purpose": "session", "tv": 1, **over}
        return jwt.encode(payload, secret if secret is not None else settings.jwt_secret, algorithm=alg)

    def with_token(self, token):
        self.client.cookies.set(settings.cookie_name, token)
        return self.me()

    def test_a_real_token_works(self):
        self.assertEqual(self.with_token(self.forge()), 200)

    def test_forged_tokens_do_not(self):
        good = self.forge()
        head, body, sig = good.split(".")
        for name, token in {
            "another secret": self.forge(secret="x" * 48),
            "no algorithm": self.forge(secret="", alg="none"),
            "expired": self.forge(exp=datetime.now(timezone.utc) - timedelta(seconds=5)),
            "another purpose": self.forge(purpose="otp"),
            "no purpose": self.forge(purpose=None),
            "an older session": self.forge(tv=0),
            "no version": self.forge(tv=None),
            "nobody": self.forge(sub="nobody"),
            "signature cut off": f"{head}.{body}.",
            "signature changed": f"{head}.{body}.{sig[:-3]}AAA",
            "not a token": "x", "empty": " ",
            "a passcode ticket": create_challenge_token(self.uid),
            "a step-up grant": create_stepup_token(self.uid),
            "an unlock ticket": create_unlock_token(self.uid),
        }.items():
            with self.subTest(token=name):
                self.assertEqual(self.with_token(token), 401)

    def test_placeholder_secret_signs_nothing_in_production(self):
        for bad in [*PLACEHOLDER_SECRETS, "", "short"]:
            with mock.patch.object(settings, "jwt_secret", bad), mock.patch.object(settings, "environment", "production"):
                with self.subTest(secret=bad), self.assertRaises(RuntimeError):
                    guard_secrets()

    def test_signing_out_ends_every_copy(self):
        token = self.forge()
        self.assertEqual(self.with_token(token), 200)
        self.assertEqual(self.client.post("/api/auth/logout").status_code, 204)
        self.assertEqual(self.with_token(token), 401)

    def test_cut_rights_end_the_session_at_once(self):
        admin = self.client.cookies.get(settings.cookie_name)
        token = self.forge()
        self.client.cookies.set(settings.cookie_name, admin)
        for change in ({"access": []}, {"status": "disabled"}):
            self.ok(self.client.put(f"/api/users/{self.uid}", json=change))
            self.assertEqual(self.with_token(token), 401)
            self.client.cookies.set(settings.cookie_name, admin)

    def test_disabled_pending_and_locked_accounts_are_shut_out(self):
        for i, (kw, code) in enumerate([({"status": "disabled"}, 403), ({"status": "pending"}, 403), ({"hard_locked": True}, 423)]):
            uid = self.user(email=f"s{i}@jaikvin-test.com", access=ALL_PERMS, **kw)
            self.sign_in(uid)
            with self.subTest(**kw):
                self.assertEqual(self.client.get("/api/items").status_code, code)

    def test_the_cookie_cannot_be_read_or_sent_from_elsewhere(self):
        self.user(email="c@jaikvin-test.com")
        self.client.cookies.clear()
        for production in (False, True):
            with mock.patch.object(settings, "environment", "production" if production else "development"):
                r = self.client.post("/api/auth/login", json={"email": "c@jaikvin-test.com", "password": "Corr3ct-horse!"})
            self.assertEqual(r.status_code, 200, r.text)
            cookie = r.headers["set-cookie"].lower()
            self.assertIn("httponly", cookie)
            self.assertIn("samesite=lax", cookie)
            if production:
                self.assertIn("secure", cookie)
            self.assertNotIn(r.cookies.get(settings.cookie_name) or "?", r.text, "the token must not be in the body")
            self.assertNotIn("password_hash", r.text)


class SigningIn(Guarded):
    def login(self, email, password="wrong"):
        return self.client.post("/api/auth/login", json={"email": email, "password": password})

    def test_a_wrong_password_and_no_such_account_read_the_same(self):
        self.user(email="real@jaikvin-test.com")
        self.user(email="off@jaikvin-test.com", status="disabled")
        a, b, c = self.login("real@jaikvin-test.com"), self.login("nobody@jaikvin-test.com"), self.login("off@jaikvin-test.com", "Corr3ct-horse!")
        self.assertEqual({a.status_code, b.status_code, c.status_code}, {401})
        self.assertEqual({a.text, b.text, c.text}, {a.text})

    def test_guessing_locks_the_account(self):
        self.user(email="real@jaikvin-test.com")
        codes = [self.login("real@jaikvin-test.com").status_code for _ in range(settings.lockout_soft_threshold)]
        self.assertEqual(codes[:-1], [401] * (settings.lockout_soft_threshold - 1))
        self.assertEqual(codes[-1], 423)
        # Locked, the right password is no different from a wrong one.
        self.assertEqual(self.login("real@jaikvin-test.com", "Corr3ct-horse!").status_code, 423)

    def test_guessing_from_one_address_is_stopped(self):
        with mock.patch.object(settings, "rate_limit_enabled", True), mock.patch.object(settings, "rl_login_ip", "6/15m"):
            codes = [self.login(f"n{i}@jaikvin-test.com").status_code for i in range(8)]
        self.assertEqual(codes[:6], [401] * 6)
        self.assertEqual(codes[6:], [429] * 2)

    def test_a_refused_sign_in_never_repeats_the_password(self):
        for body in ({"email": "x", "password": "S3cret-typed"}, {"email": "a@b.co", "password": ["S3cret-typed"]}, {"password": "S3cret-typed"}):
            r = self.client.post("/api/auth/login", json=body)
            self.assertEqual(r.status_code, 422)
            self.assertNotIn("S3cret-typed", r.text)
            self.assertIsInstance(r.json()["detail"], str)

    def test_bootstrap_is_closed_once_there_is_an_admin(self):
        r = self.client.post("/api/auth/bootstrap", json={"email": "e@jaikvin-test.com", "first_name": "E", "password": "Corr3ct-horse!9", "confirm_password": "Corr3ct-horse!9"})
        self.assertEqual(r.status_code, 409)


class Escalation(Guarded):
    def test_a_user_cannot_make_or_become_an_admin(self):
        uid = self.user(access=ALL_PERMS)
        self.sign_in(uid)
        self.assertEqual(self.client.post("/api/users", json={"email": "z@jaikvin-test.com", "first_name": "Z", "password": "Corr3ct-horse!9", "confirm_password": "Corr3ct-horse!9", "role": "admin"}).status_code, 403)
        self.assertEqual(self.client.put(f"/api/users/{uid}", json={"role": "admin"}).status_code, 403)
        db = SessionLocal()
        self.assertEqual(db.get(models.User, uid).role, "user")
        db.close()

    def test_a_password_cannot_ride_along_with_an_edit(self):
        uid = self.user()
        self.assertEqual(self.client.put(f"/api/users/{uid}", json={"password": "Corr3ct-horse!9"}).status_code, 400)

    def test_setting_a_password_needs_a_fresh_code_of_ones_own(self):
        uid = self.user()
        body = {"new_password": "Corr3ct-horse!9", "confirm_password": "Corr3ct-horse!9"}
        url = f"/api/users/{uid}/password"
        self.assertEqual(self.client.put(url, json=body).status_code, 401)
        self.assertEqual(self.client.put(url, json=body, headers={"X-Step-Up": create_stepup_token(uid)}).status_code, 403)
        self.assertEqual(self.client.put(url, json=body, headers={"X-Step-Up": create_challenge_token(uid)}).status_code, 401)

    def test_the_last_admin_stays(self):
        me = self.ok(self.client.get("/api/auth/me"))
        self.assertEqual(self.client.put(f"/api/users/{me['id']}", json={"role": "user"}).status_code, 400)
        self.assertEqual(self.client.delete(f"/api/users/{me['id']}").status_code, 400)

    def test_unknown_permissions_are_not_stored(self):
        uid = self.user()
        out = self.ok(self.client.put(f"/api/users/{uid}", json={"access": ["shipment.packing", "root", "*"]}))
        self.assertEqual(out["access"], ["shipment.packing"])

    def test_no_answer_carries_a_password_hash_or_code(self):
        self.user()
        for url in ("/api/users", "/api/auth/me", "/api/audit"):
            text = self.ok(self.client.get(url)).__repr__()
            for secret in ("password_hash", "otp_hash", "password_history", "$2b$"):
                self.assertNotIn(secret, text)


class CrossSite(Guarded):
    def test_a_write_from_another_site_is_refused_everywhere(self):
        for method, path in routes():
            if method == "GET":
                continue
            for origin in ("https://evil.example", "null", ORIGIN + ".evil.example"):
                with self.subTest(route=f"{method} {path}", origin=origin):
                    r = self.client.request(method, fill(path), headers={"Origin": origin}, json={} if method != "DELETE" else None)
                    self.assertEqual(r.status_code, 403)

    def test_another_site_is_never_told_it_may_read(self):
        r = self.client.get("/api/items", headers={"Origin": "https://evil.example"})
        self.assertNotIn("access-control-allow-origin", r.headers)
        r = self.client.options("/api/items", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
        self.assertNotIn("access-control-allow-origin", r.headers)

    def test_every_answer_carries_the_headers(self):
        for r in (self.client.get("/api/items"), self.client.get("/api/nope"), self.client.post("/api/invoices", json={}),
                  self.client.post("/api/invoices", content="{\"a\":NaN}", headers={"Content-Type": "application/json"})):
            with self.subTest(status=r.status_code):
                self.assertIn("default-src 'none'", r.headers["content-security-policy"])
                self.assertEqual(r.headers["x-frame-options"], "DENY")
                self.assertEqual(r.headers["x-content-type-options"], "nosniff")
                self.assertEqual(r.headers["cache-control"], "no-store")


class Injection(Guarded):
    NASTY = ["' OR 1=1 --", "'; DROP TABLE items; --", "%' UNION SELECT password_hash FROM users --", "\\", "%", "_", "\"", "${7*7}", "{{7*7}}", "<script>alert(1)</script>"]

    def test_a_search_is_only_ever_a_search(self):
        for q in self.NASTY:
            with self.subTest(q=q):
                r = self.client.get("/api/items", params={"q": q, "supplier_id": q, "group": q})
                self.assertEqual(r.status_code, 200)
                self.assertNotIn("$2b$", r.text)
        self.assertEqual(len(self.ok(self.client.get("/api/items"))), 6)

    def test_an_address_is_only_ever_an_id(self):
        for q in self.NASTY:
            for path in ("/api/invoices/", "/api/buyers/", "/api/users/", "/api/masters/order/"):
                with self.subTest(path=path, q=q):
                    self.assertIn(self.client.get(path + q.replace("%", "%25").replace("/", "%2F").replace("{", "%7B").replace("}", "%7D")).status_code, (404, 405))

    def test_markup_is_kept_as_text(self):
        for q in self.NASTY:
            b = self.ok(self.client.post("/api/buyers", json={"name": q}))
            self.assertEqual(b["name"], q)
        r = self.client.get("/api/buyers")
        self.assertEqual(r.headers["content-type"], "application/json")


class Bodies(Guarded):
    """What cannot be stored is refused at the door, and nothing is half-saved."""
    READS = ("/api/invoices", "/api/purchase-orders", "/api/purchase-orders/lines", "/api/items", "/api/buyers",
             "/api/reports/balance", "/api/dashboard/matrix", "/api/costing/params", "/api/options")

    def raw(self, method, url, text):
        return self.client.request(method, url, content=text if isinstance(text, bytes) else text.encode(), headers={"Content-Type": "application/json"})

    def counts(self):
        return {u: len(self.ok(self.client.get(u))) for u in ("/api/invoices", "/api/purchase-orders/lines", "/api/items", "/api/buyers")}

    def test_figures_that_are_not_figures(self):
        before = self.counts()
        i = self.i[1]
        for text in ("NaN", "Infinity", "-Infinity", "1e999", "-1e999", "9" * 40, "9" * 6000):
            for method, url, body in [
                ("POST", "/api/invoices", '{"invoice_no":"X","date":"2026-05-01","rbi":%s,"lines":[]}'),
                ("POST", "/api/invoices", '{"invoice_no":"X","date":"2026-05-01","ship":{"a":[%s]},"lines":[]}'),
                ("POST", "/api/purchase-orders", '{"po":"X","date":"2026-05-01","rbi":%s,"lines":[{"item_id":"' + i + '","qty":1}]}'),
                ("PUT", f"/api/items/{i}", '{"unit_value":%s}'),
                ("POST", "/api/items", '{"code":"X","unit_fob100":%s}'),
                ("PUT", "/api/costing/params", '{"ex_rate":%s}'),
                ("POST", "/api/masters/derive", '[{"item_id":"' + i + '","qty":%s}]'),
            ]:
                with self.subTest(url=url, value=text[:12]):
                    r = self.raw(method, url, body % text)
                    self.assertEqual(r.status_code, 422, r.text[:200])
                    self.assertIsInstance(r.json()["detail"], str)
        self.assertEqual(self.counts(), before)
        for u in self.READS:
            self.ok(self.client.get(u))

    def test_text_that_cannot_be_stored(self):
        before = self.counts()
        for bad in ("a\\u0000b", "\\ud800", "x\\udfff"):
            for url, body in [("/api/buyers", '{"name":"%s"}'), ("/api/items", '{"code":"%s"}'),
                              ("/api/invoices", '{"invoice_no":"%s","date":"2026-05-01","lines":[]}'),
                              ("/api/invoices", '{"invoice_no":"Y","date":"2026-05-01","ship":{"%s":1},"lines":[]}')]:
                with self.subTest(url=url, bad=bad):
                    self.assertEqual(self.raw("POST", url, body % bad).status_code, 422)
        self.assertEqual(self.client.get("/api/items?q=%00").status_code, 400)
        self.assertEqual(self.counts(), before)
        # What people do type is left alone.
        for good in ("₹ 5 “quoted” — 2\" × ½", "\U0001F600 गुजरात", "tab\there\nline"):
            self.assertEqual(self.ok(self.client.post("/api/buyers", json={"name": good}))["name"], good)

    def test_depth_and_size(self):
        deep = '{"invoice_no":"D","date":"2026-05-01","lines":[],"ship":' + '{"a":' * 5000 + "1" + "}" * 5000 + "}"
        self.assertEqual(self.raw("POST", "/api/invoices", deep).status_code, 422)
        big = b'{"name":"' + b"x" * (MAX_BYTES + 10) + b'"}'
        self.assertEqual(self.raw("POST", "/api/buyers", big).status_code, 413)

        def chunks():                       # no Content-Length to go by
            for _ in range(80):
                yield b"x" * 65536
        self.assertEqual(self.client.post("/api/buyers", content=chunks(), headers={"Content-Type": "application/json"}).status_code, 413)

    def test_bodies_that_are_not_json(self):
        for text in (b"", b"{", b"[]", b"null", b"true", b'"x"', b"\xff\xfe", b"a=b"):
            with self.subTest(body=text):
                r = self.raw("POST", "/api/invoices", text)
                self.assertEqual(r.status_code, 422)
                self.assertIsInstance(r.json()["detail"], str)

    def test_counts_dates_and_numbers_an_invoice_may_carry(self):
        before = self.counts()
        line = {"item_id": self.i[1], "supplier_id": self.sup["id"], "boxes": 1}
        good = {"invoice_no": "OK", "date": "2026-05-01", "serial_start": 1, "lines": [line]}
        for over in ({"invoice_no": ""}, {"invoice_no": "  "}, {"invoice_no": "x" * 121}, {"date": ""}, {"date": "01/05/2026"}, {"date": "2026-13-01"},
                     {"date": "2026-02-30"}, {"serial_start": -1}, {"serial_start": 2 ** 31}, {"rbi": -1},
                     {"lines": [{**line, "boxes": -1}]}, {"lines": [{**line, "boxes": 10 ** 7}]}, {"lines": [{**line, "boxes": 1.5}]},
                     {"allocation": "custom", "lines": [{**line, "po_alloc": [{"po": "PO1", "boxes": -1}]}]},
                     {"lines": [line] * 5001}):
            with self.subTest(**{k: str(v)[:30] for k, v in over.items()}):
                r = self.client.post("/api/invoices", json={**good, **over})
                self.assertEqual(r.status_code, 422, r.text[:200])
        self.assertEqual(self.counts(), before)
        made = self.ok(self.client.post("/api/invoices", json={**good, "invoice_no": "  OK  1 ", "buyer_id": "", "lines": [{**line, "supplier_id": ""}]}), 201)
        self.assertEqual(made["invoice_no"], "OK 1")
        self.assertIsNone(made["buyer_id"])
        for over in ({"date": ""}, {"invoice_no": " "}, {"serial_start": -2}, {"lines": [{**line, "boxes": -4}]}):
            self.assertEqual(self.client.put(f"/api/invoices/{made['id']}", json=over).status_code, 422)
        # A null leaves what was there.
        kept = self.ok(self.client.put(f"/api/invoices/{made['id']}", json={"date": None, "invoice_no": None, "rbi": None, "ship": None, "serial_start": None}))
        self.assertEqual((kept["invoice_no"], kept["date"], kept["serial_start"]), ("OK 1", "2026-05-01", 1))

    def test_what_is_already_on_file_still_saves_as_it_is(self):
        """A number or a date from before the rules — only a changed one is held to them."""
        db = SessionLocal()
        db.add(models.Invoice(id="old", invoice_no=" JG  1 ", date="1/5/26", serial_start=1, vehicles={}, ship={}, step_skip={}, packing_transports={}))
        db.query(models.PurchaseOrderLine).filter_by(po="PO3").update({"date": "10.3.26", "po": " PO 3 "})
        db.commit()
        db.close()
        out = self.ok(self.client.put("/api/invoices/old", json={"invoice_no": " JG  1 ", "date": "1/5/26", "rbi": 3}))
        self.assertEqual((out["invoice_no"], out["date"], out["rbi"]), (" JG  1 ", "1/5/26", 3))
        self.assertEqual(self.client.put("/api/invoices/old", json={"date": "2/5/26"}).status_code, 422)
        self.assertEqual(self.client.put("/api/invoices/old", json={"invoice_no": "x" * 121}).status_code, 422)
        self.assertEqual(self.ok(self.client.put("/api/invoices/old", json={"date": "2026-05-01"}))["date"], "2026-05-01")
        self.ok(self.client.put("/api/purchase-orders/%20PO%203%20", json={"po": " PO 3 ", "date": "10.3.26"}))
        self.assertEqual(self.client.put("/api/purchase-orders/%20PO%203%20", json={"date": "later"}).status_code, 422)
        self.assertEqual(self.client.put("/api/purchase-orders/%20PO%203%20", json={"po": "  "}).status_code, 422)
        self.assertEqual(self.ok(self.client.put("/api/purchase-orders/%20PO%203%20", json={"po": "PO3", "date": "2026-03-10"}))["po"], "PO3")

    def test_counts_and_numbers_an_order_may_carry(self):
        i = self.i[1]
        for over in ({"po": ""}, {"date": "soon"}, {"rbi": -5}, {"lines": [{"item_id": i, "qty": -1}]}, {"lines": [{"item_id": i, "qty": 10 ** 10}]}):
            self.assertEqual(self.client.post("/api/purchase-orders", json={"po": "P", "date": "2026-01-01", "lines": [{"item_id": i, "qty": 1}], **over}).status_code, 422)
        for lines in ([{"item_id": i, "qty": "abc"}], [{"item_id": i, "qty": -3}], "x", [5]):
            self.assertEqual(self.client.put("/api/purchase-orders/PO1", json={"lines": lines}).status_code, 422)
        self.assertEqual(self.client.put("/api/purchase-orders/PO1", json={"lines": []}).status_code, 400)

    def test_renaming_an_order_never_merges_two(self):
        self.assertEqual(self.client.put("/api/purchase-orders/PO3", json={"po": "PO2"}).status_code, 409)
        self.assertEqual({p["po"] for p in self.ok(self.client.get("/api/purchase-orders"))}, {"PO1", "PO2", "PO3", "PO4"})
        self.ok(self.client.put("/api/purchase-orders/PO3", json={"po": "PO3"}))     # its own number is no clash

    def test_nulls_do_not_empty_a_master_record(self):
        i = self.i[2]
        out = self.ok(self.client.put(f"/api/items/{i}", json={"packing": None, "code": None, "unit_value": None, "supplier_id": None, "description": "Kept"}))
        self.assertEqual((out["packing"], out["code"], out["unit_value"], out["description"]), (10, "I2", 100.0, "Kept"))
        self.assertIsNone(out["supplier_id"])                                        # this one may be empty
        self.assertEqual(self.ok(self.client.put(f"/api/buyers/{self.buyer['id']}", json={"name": None}))["name"], "Corecomp")
        self.assertIsNone(self.ok(self.client.put(f"/api/suppliers/{self.sup['id']}", json={"gst_pct": None}))["gst_pct"])
        for body in ({"packing": -1}, {"unit_value": -0.5}, {"volume": 1e12}):
            self.assertEqual(self.client.put(f"/api/items/{i}", json=body).status_code, 422)

    def test_a_buyer_still_named_somewhere_is_not_deleted(self):
        r = self.client.delete(f"/api/buyers/{self.buyer['id']}")
        self.assertEqual(r.status_code, 409)
        spare = self.ok(self.client.post("/api/buyers", json={"name": "Spare"}))
        self.ok(self.client.delete(f"/api/buyers/{spare['id']}"), 204)
