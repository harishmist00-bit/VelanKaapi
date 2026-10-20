from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.common.models import TimeStampedModel


class Order(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PREPARING = "PREPARING", "Preparing"
        READY = "READY", "Ready"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    class KitchenStatus(models.TextChoices):
        NEW = "NEW", "New"
        PREPARING = "PREPARING", "Preparing"
        READY = "READY", "Ready"
        COMPLETED = "COMPLETED", "Completed"

    class PaymentStatus(models.TextChoices):
        UNPAID = "UNPAID", "Unpaid"
        PARTIAL = "PARTIAL", "Partially paid"
        PAID = "PAID", "Paid"
        PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED", "Partially refunded"
        REFUNDED = "REFUNDED", "Refunded"

    class OrderType(models.TextChoices):
        DINE_IN = "DINE_IN", "Dine-in"
        TAKEAWAY = "TAKEAWAY", "Takeaway"
        DELIVERY = "DELIVERY", "Delivery"

    class DiscountType(models.TextChoices):
        NONE = "NONE", "None"
        PERCENT = "PERCENT", "Percent"
        FIXED = "FIXED", "Fixed amount"

    ACTIVE_STATUSES = ["PENDING", "PREPARING", "READY"]

    order_number = models.CharField(max_length=30, unique=True)
    invoice_number = models.CharField(max_length=30, unique=True, null=True, blank=True)
    order_type = models.CharField(max_length=10, choices=OrderType.choices, default=OrderType.DINE_IN)
    table = models.ForeignKey("tables.RestaurantTable", null=True, blank=True, on_delete=models.PROTECT, related_name="orders")
    customer = models.ForeignKey("customers.Customer", null=True, blank=True, on_delete=models.SET_NULL, related_name="orders")
    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="orders")

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    kitchen_status = models.CharField(max_length=10, choices=KitchenStatus.choices, default=KitchenStatus.NEW)
    payment_status = models.CharField(max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.UNPAID)

    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_type = models.CharField(max_length=8, choices=DiscountType.choices, default=DiscountType.NONE)
    discount_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    round_off = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    paid_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    refunded_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    prices_include_tax = models.BooleanField(default=False)

    notes = models.TextField(blank=True)
    cancel_reason = models.CharField(max_length=255, blank=True)
    cancelled_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    completed_at = models.DateTimeField(null=True, blank=True)
    stock_deducted = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["created_at"]),
            models.Index(fields=["status"]),
            models.Index(fields=["payment_status"]),
            models.Index(fields=["cashier", "created_at"]),
            models.Index(fields=["table", "status"]),
        ]
        constraints = [
            models.CheckConstraint(check=models.Q(grand_total__gte=0), name="order_grand_total_gte_0"),
            models.CheckConstraint(check=models.Q(paid_total__gte=0), name="order_paid_total_gte_0"),
        ]

    def __str__(self):
        return self.order_number

    @property
    def amount_due(self):
        return max(self.grand_total - self.paid_total, Decimal("0.00"))


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    menu_item = models.ForeignKey("menu.MenuItem", on_delete=models.PROTECT, related_name="order_items")
    # Snapshots keep old invoices unchanged when the menu changes later.
    name = models.CharField(max_length=120)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2)
    quantity = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(99)])
    line_subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    line_discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    line_tax = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=12, decimal_places=2)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["id"]
        constraints = [models.CheckConstraint(check=models.Q(quantity__gte=1), name="orderitem_qty_gte_1")]


class HeldOrder(TimeStampedModel):
    cashier = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="held_orders")
    label = models.CharField(max_length=80, blank=True)
    payload = models.JSONField()

    class Meta:
        ordering = ["-created_at"]
