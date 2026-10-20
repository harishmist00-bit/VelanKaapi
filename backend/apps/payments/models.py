from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class Payment(TimeStampedModel):
    class Method(models.TextChoices):
        CASH = "CASH", "Cash"
        UPI = "UPI", "UPI"
        CARD = "CARD", "Card"
        OTHER = "OTHER", "Other"

    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT, related_name="payments")
    method = models.CharField(max_length=6, choices=Method.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    tendered = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    change_due = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    # UPI transaction id or the LAST 4 digits of a card only. Never store full card data.
    reference = models.CharField(max_length=40, blank=True)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    idempotency_key = models.CharField(max_length=120, null=True, blank=True, unique=True)

    class Meta:
        ordering = ["id"]
        indexes = [models.Index(fields=["created_at"]), models.Index(fields=["method", "created_at"])]
        constraints = [models.CheckConstraint(check=models.Q(amount__gt=0), name="payment_amount_gt_0")]


class Refund(TimeStampedModel):
    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT, related_name="refunds")
    payment = models.ForeignKey(Payment, null=True, blank=True, on_delete=models.PROTECT, related_name="refunds")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.CharField(max_length=255)
    restock = models.BooleanField(default=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["id"]
        indexes = [models.Index(fields=["created_at"])]
        constraints = [models.CheckConstraint(check=models.Q(amount__gt=0), name="refund_amount_gt_0")]
