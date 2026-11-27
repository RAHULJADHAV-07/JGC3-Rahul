"""Sessions end at local midnight (SESSION_END_MODE=midnight), whatever hour
they began; the first sign-in after 00:00 is where the daily passcode is asked,
and the session it opens lasts until the next 00:00."""
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

import jwt

from tests.base import ORIGIN, TestClient, app, settings, Base, SessionLocal, engine, models, create_token, hash_password
from app.security import ALGORITHM, session_day_over, session_expiry
from app.timeutil import next_local_midnight, to_local

UTC = timezone.utc


def ist(y, m, d, hh, mm=0):
    """An IST wall-clock time as aware UTC."""
    return datetime(y, m, d, hh, mm, tzinfo=UTC) - timedelta(hours=5, minutes=30)


class SessionExpiryRule(unittest.TestCase):
    def setUp(self):
        self._mode, self._cap = settings.session_end_mode, settings.jwt_expire_minutes
        settings.session_end_mode, settings.jwt_expire_minutes = "midnight", 1440

    def tearDown(self):
        settings.session_end_mode, settings.jwt_expire_minutes = self._mode, self._cap

    def test_any_hour_ends_at_next_ist_midnight(self):
        for hh, mm in ((0, 5), (9, 0), (18, 30), (23, 55)):
            ends = session_expiry(ist(2026, 11, 27, hh, mm))
            self.assertEqual(ends, ist(2026, 11, 28, 0), f"signed in {hh:02}:{mm:02}")
            local = to_local(ends)
            self.assertEqual((local.hour, local.minute, local.day), (0, 0, 28))

    def test_cap_still_applies(self):
        settings.jwt_expire_minutes = 60
        now = ist(2026, 11, 27, 9)
        self.assertEqual(session_expiry(now), now + timedelta(hours=1))

    def test_rolling_mode_is_the_old_24h(self):
        settings.session_end_mode = "rolling"
        now = ist(2026, 11, 27, 18)
        self.assertEqual(session_expiry(now), now + timedelta(hours=24))
        self.assertFalse(session_day_over(int((now - timedelta(days=2)).timestamp()), now))

    def test_issued_yesterday_is_over(self):
        now = ist(2026, 11, 28, 0, 1)
        self.assertTrue(session_day_over(int(ist(2026, 11, 27, 23, 59).timestamp()), now))
        self.assertFalse(session_day_over(int(ist(2026, 11, 28, 0, 0).timestamp()), now))
        self.assertTrue(session_day_over(None, now))
        # 18:00 UTC = 23:30 IST, 18:31 UTC = 00:01 IST next day — the office's day decides.
        self.assertTrue(session_day_over(int(datetime(2026, 11, 27, 18, 0, tzinfo=UTC).timestamp()),
                                         datetime(2026, 11, 27, 18, 31, tzinfo=UTC)))


class SessionMidnightApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        self._saved = (settings.session_end_mode, settings.otp_enabled, settings.otp_daily_for,
                       settings.otp_admin_reverify_mode)
        settings.session_end_mode = "midnight"
        settings.otp_admin_reverify_mode = "midnight"
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        self.client.cookies.clear()
        self.client.headers.update({"Origin": ORIGIN})

    def tearDown(self):
        (settings.session_end_mode, settings.otp_enabled, settings.otp_daily_for,
         settings.otp_admin_reverify_mode) = self._saved

    def make(self, email, role="admin", verified_at=None):
        db = SessionLocal()
        u = models.User(email=email, password_hash=hash_password("pw-x"), name=email.split("@")[0],
                        role=role, status="active", access=[], email_verified=True,
                        email_verified_at=verified_at, otp_verified_at=verified_at, token_version=1)
        db.add(u)
        db.commit()
        uid = u.id
        db.close()
        return uid

    def midnight(self):
        return next_local_midnight(datetime.utcnow())

    def assert_ends_at_midnight(self, resp_json, set_cookie):
        ends = datetime.fromisoformat(resp_json["session_expires_at"].replace("Z", "+00:00"))
        if ends.tzinfo is None:
            ends = ends.replace(tzinfo=UTC)
        self.assertEqual(ends, self.midnight())
        max_age = int(set_cookie.split("Max-Age=")[1].split(";")[0])
        left = (self.midnight() - datetime.now(UTC)).total_seconds()
        self.assertLessEqual(abs(max_age - left), 5, set_cookie)

    def login(self, email):
        return self.client.post("/api/auth/login", json={"email": email, "password": "pw-x"})

    def test_login_session_and_cookie_end_at_midnight(self):
        settings.otp_enabled = False
        self.make("boss@jaikvin-test.com")
        r = self.login("boss@jaikvin-test.com")
        self.assertEqual(r.status_code, 200, r.text)
        self.assert_ends_at_midnight(r.json(), r.headers["set-cookie"])
        token = self.client.cookies.get(settings.cookie_name)
        exp = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])["exp"]
        self.assertEqual(datetime.fromtimestamp(exp, UTC), self.midnight())
        me = self.client.get("/api/auth/me")
        self.assertEqual(me.status_code, 200, me.text)
        self.assertIsNotNone(me.json()["session_expires_at"])

    def test_old_24h_token_from_yesterday_is_refused(self):
        uid = self.make("boss@jaikvin-test.com")
        issued = datetime.now(UTC) - timedelta(days=1)
        token = jwt.encode({"sub": uid, "iat": issued, "exp": datetime.now(UTC) + timedelta(hours=2),
                            "purpose": "session", "tv": 1}, settings.jwt_secret, algorithm=ALGORITHM)
        self.client.cookies.set(settings.cookie_name, token)
        r = self.client.get("/api/auth/me")
        self.assertEqual(r.status_code, 401)
        self.assertIn("midnight", r.json()["detail"])
        # Today's token for the same account still works.
        self.client.cookies.set(settings.cookie_name, create_token(uid, 1))
        self.assertEqual(self.client.get("/api/auth/me").status_code, 200)

    def _otp_login(self, email, code="424242"):
        with mock.patch("app.routers.auth.generate_otp", return_value=code):
            r = self.login(email)
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()

    def test_admin_new_day_asks_code_then_session_until_midnight(self):
        settings.otp_enabled = True
        self.make("boss@jaikvin-test.com", verified_at=datetime.utcnow() - timedelta(days=1))
        ch = self._otp_login("boss@jaikvin-test.com")
        self.assertTrue(ch["otp_required"])
        self.assertEqual(ch["reason"], "admin_session_renewal")
        r = self.client.post("/api/auth/verify-otp", json={"challenge": ch["challenge"], "code": "424242"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assert_ends_at_midnight(r.json(), r.headers["set-cookie"])
        # Signing in again the same day: no second code.
        self.client.cookies.clear()
        again = self.login("boss@jaikvin-test.com").json()
        self.assertFalse(again["otp_required"])

    def test_user_daily_code_only_when_switched_on(self):
        settings.otp_enabled = True
        self.make("clerk@jaikvin-test.com", role="user", verified_at=datetime.utcnow() - timedelta(days=1))
        settings.otp_daily_for = "admin"
        self.assertFalse(self.login("clerk@jaikvin-test.com").json()["otp_required"])
        self.client.cookies.clear()
        settings.otp_daily_for = "all"
        ch = self._otp_login("clerk@jaikvin-test.com")
        self.assertEqual(ch["reason"], "daily_renewal")
        r = self.client.post("/api/auth/verify-otp", json={"challenge": ch["challenge"], "code": "424242"})
        self.assertEqual(r.status_code, 200, r.text)
        self.assert_ends_at_midnight(r.json(), r.headers["set-cookie"])


if __name__ == "__main__":
    unittest.main()
