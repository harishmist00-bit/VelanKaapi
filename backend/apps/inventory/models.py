from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class Supplier(TimeStampedModel):
    name = models.CharField(max_length=120, unique=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Ingredient(TimeStampedModel):
    name = models.CharField(max_length=120, unique=True)
    unit = models.CharField(max_length=10, default="kg", help_text="kg, g, l, ml, pcs ...")
    current_quantity = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    reorder_level = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    supplier = models.ForeignKey(Supplier, null=True, blank=True, on_delete=models.SET_NULL, related_name="ingredients")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    @property
    def is_low(self):
        return self.current_quantity <= self.reorder_level

    def __str__(self):
        return self.name


class Recipe(TimeStampedModel):
    menu_item = models.OneToOneField("menu.MenuItem", on_delete=models.CASCADE, related_name="recipe")


class RecipeIngredient(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name="ingredients")
    ingredient = models.ForeignKey(Ingredient, on_delete=models.PROTECT, related_name="recipe_lines")
    quantity = models.DecimalField(max_digits=12, decimal_places=3, help_text="Amount used per ONE portion")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["recipe", "ingredient"], name="uniq_recipe_ingredient"),
            models.CheckConstraint(check=models.Q(quantity__gt=0), name="recipeingredient_qty_gt_0"),
        ]


class StockMovement(models.Model):
    class Type(models.TextChoices):
        PURCHASE = "PURCHASE", "Purchase"
        ADJUSTMENT = "ADJUSTMENT", "Adjustment"
        WASTE = "WASTE", "Waste"
        SALE = "SALE", "Sale"
        REVERSAL = "REVERSAL", "Reversal"

    ingredient = models.ForeignKey(Ingredient, on_delete=models.PROTECT, related_name="movements")
    movement_type = models.CharField(max_length=12, choices=Type.choices)
    quantity_delta = models.DecimalField(max_digits=12, decimal_places=3)
    balance_after = models.DecimalField(max_digits=12, decimal_places=3)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    order = models.ForeignKey("orders.Order", null=True, blank=True, on_delete=models.PROTECT, related_name="stock_movements")
    reason = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["ingredient", "created_at"])]
        constraints = [
            # Order-linked rows exist only for SALE / REVERSAL. NULL orders never collide, so this
            # blocks a second deduction (or reversal) of the same ingredient for the same order.
            models.UniqueConstraint(fields=["order", "ingredient", "movement_type"], name="uniq_order_ingredient_movement"),
        ]
