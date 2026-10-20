import os
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.common.models import TimeStampedModel


def validate_image(f):
    ext = os.path.splitext(f.name)[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        raise ValidationError("Only JPG, PNG or WEBP images are allowed.")
    if f.size > 2 * 1024 * 1024:
        raise ValidationError("Image must be 2 MB or smaller.")


class Category(TimeStampedModel):
    name = models.CharField(max_length=80, unique=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["sort_order", "name"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class MenuItem(TimeStampedModel):
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="items")
    name = models.CharField(max_length=120)
    sku = models.CharField(max_length=30, unique=True)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0.00"))])
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("5.00"),
                                   validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("100"))],
                                   help_text="GST percent for this item. Configure according to applicable rules.")
    is_veg = models.BooleanField(default=True)
    image = models.ImageField(upload_to="menu/", null=True, blank=True, validators=[validate_image])
    is_available = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["category__sort_order", "name"]
        indexes = [models.Index(fields=["category", "is_active"]), models.Index(fields=["name"])]
        constraints = [models.CheckConstraint(check=models.Q(price__gte=0), name="menuitem_price_gte_0")]

    def __str__(self):
        return self.name
