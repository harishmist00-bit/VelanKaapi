from decimal import Decimal

from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.menu.models import Category, MenuItem
from apps.settings_app.models import RestaurantSettings
from apps.tables.models import RestaurantTable


def make_user(username, role, **kw):
    u = User.objects.create_user(username=username, password="Pass@12345x", role=role, **kw)
    return u


def client_for(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def seed_basic():
    RestaurantSettings.get()
    cat = Category.objects.create(name="Mains")
    a = MenuItem.objects.create(category=cat, name="Biryani", sku="B1", price=Decimal("200.00"), tax_rate=Decimal("5.00"))
    b = MenuItem.objects.create(category=cat, name="Cola", sku="C1", price=Decimal("50.00"), tax_rate=Decimal("18.00"))
    t = RestaurantTable.objects.create(number="T1", capacity=4)
    t2 = RestaurantTable.objects.create(number="T2", capacity=4)
    return a, b, t, t2
