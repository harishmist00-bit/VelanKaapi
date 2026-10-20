from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.common.testing import client_for, make_user


class AuthTests(TestCase):
    def setUp(self):
        self.cashier = make_user("cash", "CASHIER")
        self.manager = make_user("mgr", "MANAGER")
        self.admin = make_user("adm", "ADMIN")

    def test_login_returns_tokens_and_user(self):
        r = APIClient().post("/api/auth/login/", {"username": "cash", "password": "Pass@12345x"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertIn("access", r.data)
        self.assertEqual(r.data["user"]["role"], "CASHIER")

    def test_bad_login_uses_error_shape(self):
        r = APIClient().post("/api/auth/login/", {"username": "cash", "password": "nope"}, format="json")
        self.assertEqual(r.status_code, 401)
        self.assertIn("error", r.data)

    def test_unauthenticated_is_rejected(self):
        self.assertEqual(APIClient().get("/api/orders/").status_code, 401)

    def test_me(self):
        r = client_for(self.cashier).get("/api/auth/me/")
        self.assertEqual(r.data["username"], "cash")

    def test_cashier_cannot_manage_users_or_settings(self):
        c = client_for(self.cashier)
        self.assertEqual(c.get("/api/users/").status_code, 403)
        self.assertEqual(c.patch("/api/settings/restaurant/", {"name": "X"}, format="json").status_code, 403)

    def test_manager_cannot_change_settings_but_admin_can(self):
        self.assertEqual(client_for(self.manager).patch("/api/settings/restaurant/", {"name": "X"}, format="json").status_code, 403)
        r = client_for(self.admin).patch("/api/settings/restaurant/", {"name": "Cafe Z"}, format="json")
        self.assertEqual((r.status_code, r.data["name"]), (200, "Cafe Z"))

    def test_admin_creates_user_with_hashed_password(self):
        r = client_for(self.admin).post("/api/users/", {"username": "new", "password": "Strong#Pass99", "role": "CASHIER"}, format="json")
        self.assertEqual(r.status_code, 201)
        from apps.accounts.models import User
        self.assertTrue(User.objects.get(username="new").check_password("Strong#Pass99"))
        self.assertNotIn("password", r.data)

    @override_settings(REST_FRAMEWORK={**__import__("django.conf", fromlist=["settings"]).settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {"login": "3/min"}})
    def test_login_is_throttled(self):
        from django.core.cache import cache
        from rest_framework.throttling import SimpleRateThrottle
        cache.clear()
        SimpleRateThrottle.THROTTLE_RATES = {"login": "3/min"}
        c = APIClient()
        codes = [c.post("/api/auth/login/", {"username": "cash", "password": "bad"}, format="json").status_code for _ in range(5)]
        SimpleRateThrottle.THROTTLE_RATES = {"login": "10/min"}
        cache.clear()
        self.assertIn(429, codes)
