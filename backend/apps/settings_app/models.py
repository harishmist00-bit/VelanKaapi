from decimal import Decimal

from django.db import models

from apps.common.models import TimeStampedModel


class RestaurantSettings(TimeStampedModel):
    """Singleton row (pk=1) holding restaurant details, tax and billing configuration."""

    ORDER_TYPES = [("DINE_IN", "Dine-in"), ("TAKEAWAY", "Takeaway"), ("DELIVERY", "Delivery")]

    name = models.CharField(max_length=120, default="My Restaurant")
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    gstin = models.CharField(max_length=20, blank=True)
    currency = models.CharField(max_length=5, default="INR", editable=False)
    invoice_prefix = models.CharField(max_length=10, default="INV-")
    invoice_counter = models.PositiveIntegerField(default=0)
    order_counter = models.PositiveIntegerField(default=0)
    default_order_type = models.CharField(max_length=10, choices=ORDER_TYPES, default="DINE_IN")
    default_tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("5.00"))
    prices_include_tax = models.BooleanField(default=False)
    round_off_enabled = models.BooleanField(default=True)
    allow_partial_payments = models.BooleanField(default=False)
    allow_negative_stock = models.BooleanField(default=True)
    max_cashier_discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("10.00"))
    enabled_payment_methods = models.JSONField(default=list)
    receipt_footer = models.CharField(max_length=255, blank=True, default="Thank you! Visit again.")
    loyalty_enabled = models.BooleanField(default=False)
    loyalty_points_per_100 = models.PositiveIntegerField(default=1)

    class Meta:
        verbose_name_plural = "restaurant settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        if not self.enabled_payment_methods:
            self.enabled_payment_methods = ["CASH", "UPI", "CARD"]
        super().save(*args, **kwargs)

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    @classmethod
    def locked(cls):
        """Return the singleton locked FOR UPDATE; call inside transaction.atomic()."""
        cls.get()
        return cls.objects.select_for_update().get(pk=1)
