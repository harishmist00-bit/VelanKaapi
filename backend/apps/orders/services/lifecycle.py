from django.db import transaction
from django.utils import timezone

from apps.audit.services import log
from apps.common.exceptions import BusinessRuleError, ConflictError
from apps.orders.models import Order
from apps.settings_app.models import RestaurantSettings
from apps.tables.models import RestaurantTable

KITCHEN_FLOW = {"NEW": {"PREPARING", "READY"}, "PREPARING": {"READY"}, "READY": {"COMPLETED"}}


def release_table(order):
    if order.table_id and not Order.objects.filter(table_id=order.table_id, status__in=Order.ACTIVE_STATUSES).exclude(pk=order.pk).exists():
        RestaurantTable.objects.filter(pk=order.table_id).update(status="AVAILABLE")


@transaction.atomic
def complete_order(order, user):
    """Close an order: needs full payment, deducts stock once, frees the table. Idempotent."""
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.status == Order.Status.COMPLETED:
        return order
    if order.status == Order.Status.CANCELLED:
        raise ConflictError("A cancelled order cannot be completed.")
    if order.payment_status != Order.PaymentStatus.PAID:
        raise BusinessRuleError("The order must be fully paid before it can be completed.")
    from apps.inventory import services as inv

    inv.deduct_for_order(order, user)
    order.refresh_from_db()
    order.status, order.kitchen_status, order.completed_at = Order.Status.COMPLETED, Order.KitchenStatus.COMPLETED, timezone.now()
    order.save()
    release_table(order)
    cfg = RestaurantSettings.get()
    if cfg.loyalty_enabled and order.customer_id:
        points = int(order.grand_total // 100) * cfg.loyalty_points_per_100
        if points:
            from django.db.models import F

            type(order.customer).objects.filter(pk=order.customer_id).update(loyalty_points=F("loyalty_points") + points)
    log(user, "order.complete", "Order", order.id, after={"invoice": order.invoice_number})
    return order


def try_finalize(order, user):
    """Auto-complete once the kitchen has finished AND the order is paid. Never raises."""
    order.refresh_from_db()
    if order.status in Order.ACTIVE_STATUSES and order.kitchen_status == "COMPLETED" and order.payment_status == "PAID":
        try:
            with transaction.atomic():
                complete_order(order, user)
        except (ConflictError, BusinessRuleError):
            pass  # e.g. insufficient stock: stays open; a manager can resolve and press Complete


@transaction.atomic
def set_kitchen_status(order, new_status, user):
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.status in (Order.Status.CANCELLED, Order.Status.COMPLETED):
        raise ConflictError(f"Order is already {order.status.lower()}.")
    if new_status not in KITCHEN_FLOW.get(order.kitchen_status, set()):
        raise BusinessRuleError(f"Cannot move an order from {order.kitchen_status} to {new_status}.")
    order.kitchen_status = new_status
    if new_status in ("PREPARING", "READY"):
        order.status = new_status
    elif new_status == "COMPLETED":
        order.status = Order.Status.READY  # order itself closes only when paid
    order.save()
    try_finalize(order, user)
    order.refresh_from_db()
    return order


@transaction.atomic
def cancel_order(order, reason, user):
    order = Order.objects.select_for_update().get(pk=order.pk)
    if not reason.strip():
        raise BusinessRuleError("A cancellation reason is required.")
    if order.status == Order.Status.COMPLETED:
        raise ConflictError("Completed orders cannot be cancelled. Use a refund instead.")
    if order.status == Order.Status.CANCELLED:
        raise ConflictError("Order is already cancelled.")
    if order.paid_total - order.refunded_total > 0:
        raise BusinessRuleError("Refund the recorded payments before cancelling this order.")
    before = {"status": order.status}
    order.status, order.cancel_reason, order.cancelled_by = Order.Status.CANCELLED, reason.strip(), user
    order.save()
    release_table(order)
    log(user, "order.cancel", "Order", order.id, before=before, after={"status": "CANCELLED", "reason": reason})
    return order


@transaction.atomic
def transfer_table(order, table_id, user):
    order = Order.objects.select_for_update().get(pk=order.pk)
    if order.order_type != Order.OrderType.DINE_IN or order.status not in Order.ACTIVE_STATUSES:
        raise BusinessRuleError("Only open dine-in orders can be moved to another table.")
    ids = sorted({order.table_id, int(table_id)})
    tables = {t.id: t for t in RestaurantTable.objects.select_for_update().filter(pk__in=ids).order_by("id")}
    new = tables.get(int(table_id))
    if not new or not new.is_active:
        raise BusinessRuleError("Choose a valid table.")
    if new.id == order.table_id:
        raise BusinessRuleError("The order is already on that table.")
    if Order.objects.filter(table=new, status__in=Order.ACTIVE_STATUSES).exists():
        raise ConflictError(f"{new} already has an open order. Merge the orders instead.")
    old_id = order.table_id
    order.table = new
    order.save()
    new.status = "OCCUPIED"
    new.save(update_fields=["status", "updated_at"])
    if old_id:
        RestaurantTable.objects.filter(pk=old_id).update(status="AVAILABLE")
    log(user, "order.transfer_table", "Order", order.id, before={"table": old_id}, after={"table": new.id})
    return order


@transaction.atomic
def merge_orders(target, source, user):
    """Move all items from `source` into `target`; both must be open, unpaid and on the same footing."""
    from .billing import calculate

    ids = sorted([target.pk, source.pk])
    locked = {o.pk: o for o in Order.objects.select_for_update().filter(pk__in=ids).order_by("id")}
    target, source = locked[target.pk], locked[source.pk]
    if target.pk == source.pk:
        raise BusinessRuleError("Choose two different orders.")
    for o in (target, source):
        if o.status not in Order.ACTIVE_STATUSES or o.paid_total > 0:
            raise BusinessRuleError(f"{o.order_number} must be open and unpaid to merge.")
    source.items.update(order=target)
    items = list(target.items.all())
    calc = calculate([{"unit_price": i.unit_price, "quantity": i.quantity, "tax_rate": i.tax_rate} for i in items],
                     "NONE", 0, target.prices_include_tax, RestaurantSettings.get().round_off_enabled)
    for item, ln in zip(items, calc["lines"]):
        item.line_subtotal, item.line_discount, item.line_tax, item.line_total = ln["line_subtotal"], ln["line_discount"], ln["line_tax"], ln["line_total"]
        item.save()
    target.subtotal, target.discount_type, target.discount_value, target.discount_amount = calc["subtotal"], "NONE", 0, 0
    target.tax_total, target.round_off, target.grand_total = calc["tax_total"], calc["round_off"], calc["grand_total"]
    target.save()
    source.subtotal = source.tax_total = source.grand_total = source.discount_amount = source.round_off = 0
    source.status, source.cancel_reason, source.cancelled_by = Order.Status.CANCELLED, f"Merged into {target.order_number}", user
    source.save()
    release_table(source)
    log(user, "order.merge", "Order", target.id, after={"merged_from": source.order_number, "discount_reset": True})
    return target
