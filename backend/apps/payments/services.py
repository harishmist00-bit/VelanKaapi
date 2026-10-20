import re
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum

from apps.audit.services import log
from apps.common.exceptions import BusinessRuleError
from apps.orders.models import Order
from apps.orders.services import lifecycle
from apps.settings_app.models import RestaurantSettings

from .models import Payment, Refund

ZERO = Decimal("0.00")


def refresh_payment_status(order):
    """Recompute paid/refunded totals and payment_status from the payment and refund rows."""
    paid = Payment.objects.filter(order=order).aggregate(s=Sum("amount"))["s"] or ZERO
    refunded = Refund.objects.filter(order=order).aggregate(s=Sum("amount"))["s"] or ZERO
    order.paid_total, order.refunded_total = paid, refunded
    if refunded > 0:
        order.payment_status = Order.PaymentStatus.REFUNDED if refunded >= paid else Order.PaymentStatus.PARTIALLY_REFUNDED
    elif order.grand_total == 0 or paid >= order.grand_total:
        order.payment_status = Order.PaymentStatus.PAID
    elif paid > 0:
        order.payment_status = Order.PaymentStatus.PARTIAL
    else:
        order.payment_status = Order.PaymentStatus.UNPAID
    return order


def _assign_invoice_number(order):
    if order.invoice_number or order.payment_status != Order.PaymentStatus.PAID:
        return
    cfg = RestaurantSettings.locked()
    cfg.invoice_counter += 1
    cfg.save(update_fields=["invoice_counter", "updated_at"])
    order.invoice_number = f"{cfg.invoice_prefix}{order.created_at.year}-{cfg.invoice_counter:06d}"


@transaction.atomic
def record_payments(order, payments, user, key_prefix=None):
    """Record one or more payments (split payment = several entries). Atomic and over-payment safe."""
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.status in (Order.Status.CANCELLED,):
        raise BusinessRuleError("Cannot take payment for a cancelled order.")
    cfg = RestaurantSettings.get()
    already = Payment.objects.filter(order=order).aggregate(s=Sum("amount"))["s"] or ZERO
    if Refund.objects.filter(order=order).exists():
        raise BusinessRuleError("Cannot take payment for a refunded order.")
    due = order.grand_total - already
    if not payments:
        raise BusinessRuleError("Add at least one payment.")

    total_new = ZERO
    prepared = []
    for i, p in enumerate(payments):
        method, amount = p["method"], Decimal(p["amount"]).quantize(Decimal("0.01"))
        if method not in cfg.enabled_payment_methods:
            raise BusinessRuleError(f"{method.title()} payments are not enabled.")
        if amount <= 0:
            raise BusinessRuleError("Payment amount must be greater than zero.")
        ref = (p.get("reference") or "").strip()
        tendered, change = None, ZERO
        if method == "CASH":
            tendered = Decimal(p.get("tendered") if p.get("tendered") is not None else amount).quantize(Decimal("0.01"))
            if tendered < amount:
                raise BusinessRuleError("Cash tendered is less than the cash amount.")
            change = tendered - amount
        elif method == "CARD" and ref and not re.fullmatch(r"\d{4}", ref):
            raise BusinessRuleError("For card payments enter only the last 4 digits (never the full number).")
        elif method in ("UPI", "OTHER") and ref and not re.fullmatch(r"[A-Za-z0-9\-_/]{1,40}", ref):
            raise BusinessRuleError("Reference may contain letters, digits and - _ / only.")
        total_new += amount
        prepared.append(dict(method=method, amount=amount, tendered=tendered, change_due=change, reference=ref,
                             key=f"{key_prefix}:{i}" if key_prefix else None))
    if total_new > due:
        raise BusinessRuleError(f"Payment of {total_new} exceeds the amount due of {due}.")
    if total_new < due and not cfg.allow_partial_payments:
        raise BusinessRuleError(f"Full payment of {due} is required (partial payments are turned off).")

    for p in prepared:
        Payment.objects.create(order=order, method=p["method"], amount=p["amount"], tendered=p["tendered"], change_due=p["change_due"],
                               reference=p["reference"], received_by=user, idempotency_key=p["key"])
    refresh_payment_status(order)
    _assign_invoice_number(order)
    order.save()
    log(user, "payment.record", "Order", order.id, after={"amount": total_new, "methods": [p["method"] for p in prepared], "payment_status": order.payment_status})
    lifecycle.try_finalize(order, user)
    return order


@transaction.atomic
def create_refund(order, amount, reason, user, restock=False, payment=None):
    from apps.inventory import services as inv

    order = Order.objects.select_for_update().get(pk=order.pk)
    amount = Decimal(amount).quantize(Decimal("0.01"))
    refundable = order.paid_total - order.refunded_total
    if amount <= 0:
        raise BusinessRuleError("Refund amount must be greater than zero.")
    if amount > refundable:
        raise BusinessRuleError(f"Refund cannot exceed the refundable balance of {refundable}.")
    if not reason.strip():
        raise BusinessRuleError("A refund reason is required.")
    if restock and (order.refunded_total + amount < order.paid_total or not order.stock_deducted):
        raise BusinessRuleError("Stock can be restored only when the full amount of a completed order is refunded.")
    refund = Refund.objects.create(order=order, payment=payment, amount=amount, reason=reason.strip(), restock=restock, created_by=user)
    refresh_payment_status(order)
    order.save()
    if restock:
        inv.reverse_for_order(order, user)
    log(user, "refund.create", "Order", order.id, after={"refund_id": refund.id, "amount": amount, "reason": reason, "restock": restock})
    return refund
