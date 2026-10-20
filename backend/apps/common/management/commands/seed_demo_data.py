from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import User
from apps.customers.models import Customer
from apps.inventory.models import Ingredient, Recipe, RecipeIngredient, Supplier
from apps.menu.models import Category, MenuItem
from apps.settings_app.models import RestaurantSettings
from apps.tables.models import RestaurantTable

MENU = {
    "Starters": [("Paneer Tikka", "180", True, "5"), ("Chicken 65", "220", False, "5"), ("Veg Spring Roll", "140", True, "5"), ("Gobi Manchurian", "160", True, "5")],
    "Main Course": [("Butter Chicken", "320", False, "5"), ("Paneer Butter Masala", "280", True, "5"), ("Dal Tadka", "180", True, "5"), ("Chicken Biryani", "290", False, "5"), ("Veg Biryani", "220", True, "5"), ("Mutton Rogan Josh", "380", False, "5")],
    "Breads": [("Butter Naan", "45", True, "5"), ("Tandoori Roti", "30", True, "5"), ("Parotta", "25", True, "5"), ("Garlic Naan", "60", True, "5")],
    "Rice & Noodles": [("Jeera Rice", "130", True, "5"), ("Veg Fried Rice", "170", True, "5"), ("Chicken Hakka Noodles", "210", False, "5")],
    "Desserts": [("Gulab Jamun (2 pcs)", "80", True, "5"), ("Ice Cream Scoop", "70", True, "18"), ("Rasmalai", "110", True, "5")],
    "Beverages": [("Masala Chai", "30", True, "5"), ("Filter Coffee", "40", True, "5"), ("Fresh Lime Soda", "60", True, "5"), ("Mineral Water 1L", "25", True, "18"), ("Mango Lassi", "90", True, "5")],
}


class Command(BaseCommand):
    help = "Load demo users, menu, tables, customers and ingredients. Safe to run more than once."

    @transaction.atomic
    def handle(self, *args, **opts):
        for username, role, pw, extra in [
            ("admin", "ADMIN", "Admin@12345", {"is_staff": True, "is_superuser": True}),
            ("manager", "MANAGER", "Manager@12345", {"is_staff": True}),
            ("cashier", "CASHIER", "Cashier@12345", {}),
        ]:
            u, created = User.objects.get_or_create(username=username, defaults={"role": role, "first_name": username.title(), **extra})
            if created:
                u.set_password(pw)
                u.save()

        s = RestaurantSettings.get()
        if s.name == "My Restaurant":
            s.name, s.address, s.phone = "Spice Route Kitchen", "12 Temple Road, Coimbatore, Tamil Nadu 641001", "+91 98765 43210"
            s.receipt_footer = "Thank you for dining with us!"
            s.save()

        for order, (cat_name, items) in enumerate(MENU.items()):
            cat, _ = Category.objects.get_or_create(name=cat_name, defaults={"sort_order": order})
            for i, (name, price, veg, tax) in enumerate(items):
                sku = f"{cat_name[:3].upper()}{i + 1:02d}"
                MenuItem.objects.get_or_create(sku=sku, defaults=dict(category=cat, name=name, price=Decimal(price), is_veg=veg, tax_rate=Decimal(tax)))
        for n in range(1, 11):
            RestaurantTable.objects.get_or_create(number=f"T{n}", defaults={"capacity": 2 if n <= 4 else 4 if n <= 8 else 6})

        sup, _ = Supplier.objects.get_or_create(name="Fresh Farms Traders", defaults={"phone": "+91 90000 11111"})
        ing = {}
        for name, unit, qty, reorder in [("Paneer", "kg", "20", "5"), ("Chicken", "kg", "30", "8"), ("Basmati Rice", "kg", "50", "10"), ("Tea Powder", "kg", "5", "1"), ("Milk", "l", "20", "5")]:
            ing[name], _ = Ingredient.objects.get_or_create(name=name, defaults=dict(unit=unit, current_quantity=Decimal(qty), reorder_level=Decimal(reorder), supplier=sup))
        for item_name, parts in [("Paneer Tikka", [("Paneer", "0.150")]), ("Chicken Biryani", [("Chicken", "0.200"), ("Basmati Rice", "0.150")]), ("Masala Chai", [("Tea Powder", "0.005"), ("Milk", "0.100")])]:
            mi = MenuItem.objects.filter(name=item_name).first()
            if mi and not hasattr(mi, "recipe"):
                r = Recipe.objects.create(menu_item=mi)
                for iname, q in parts:
                    RecipeIngredient.objects.create(recipe=r, ingredient=ing[iname], quantity=Decimal(q))
        for name, phone in [("Ravi Kumar", "9876500001"), ("Priya S", "9876500002")]:
            Customer.objects.get_or_create(phone=phone, defaults={"name": name})
        self.stdout.write(self.style.SUCCESS("Demo data loaded. Logins: admin/Admin@12345, manager/Manager@12345, cashier/Cashier@12345 (change these!)"))
