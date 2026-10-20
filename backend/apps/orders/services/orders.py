from django.db import transaction

from apps.audit.services import log
from apps.common.exceptions import BusinessRuleError, ConflictError
from apps.customers.models import Customer
from apps.menu.models import MenuItem
from apps.orders.models import HeldOrder, Order, OrderItem
from apps.payments import services as pay
from apps.settings_app.models import RestaurantSettings
from apps.tables.models import RestaurantTable

from . import billing


def build_lines(items):
    menu = MenuItem.objects.in_bulk([i["menu_item_id"] for i in items])
    lines = []
    for i in items:
        mi = menu.get(i["menu_item_id"])
        if mi is None:
            raise BusinessRuleError("An item in the cart no longer exists.")
        if not mi.is_active or not mi.is_available:
            raise BusinessRuleError(f"{mi.name} is currently unavailable.")
        lines.append({"menu_item": mi, "unit_price": mi.price, "tax_rate": mi.tax_rate, "quantity": i["quantity"], "notes": i.get("notes", "")})
    return lines


def preview(user, data):
    """Totals for the POS cart. Same code path as order creation, so the numbers always match."""
    cfg = RestaurantSettings.get()
    lines = build_lines(data["items"])
    calc = billing.calculate(lines, data.get("discount_type", "NONE"), data.get("discount_value", 0), cfg.prices_include_tax, cfg.round_off_enabled)
    billing.check_discount_permission(user, cfg, calc["subtotal"], calc["discount_amount"])
    for src, out in zip(lines, calc["lines"]):
        out["menu_item_id"], out["name"], out["unit_price"], out["quantity"] = src["menu_item"].id, src["menu_item"].name, src["unit_price"], src["quantity"]
    return calc


def _customer(data):
    if data.get("customer_id"):
        c = Customer.objects.filter(pk=data["customer_id"]).first()
        if not c:
            raise BusinessRuleError("Customer not found.")
        return c
    phone = (data.get("customer_phone") or "").strip()
    if phone:
        c, _ = Customer.objects.get_or_create(phone=phone, defaults={"name": data.get("customer_name") or "Guest"})
        return c
    return None


@transaction.atomic
def create_order(user, data, key_prefix=None):
    cfg = RestaurantSettings.locked()  # serializes order numbering
    lines = build_lines(data["items"])
    calc = billing.calculate(lines, data.get("discount_type", "NONE"), data.get("discount_value", 0), cfg.prices_include_tax, cfg.round_off_enabled)
    billing.check_discount_permission(user, cfg, calc["subtotal"], calc["discount_amount"])

    order_type = data.get("order_type") or cfg.default_order_type
    table = None
    if order_type == "DINE_IN":
        if not data.get("table_id"):
            raise BusinessRuleError("Select a table for dine-in orders.")
        table = RestaurantTable.objects.select_for_update().filter(pk=data["table_id"], is_active=True).first()
        if not table:
            raise BusinessRuleError("Table not found.")
        if Order.objects.filter(table=table, status__in=Order.ACTIVE_STATUSES).exists():
            raise ConflictError(f"{table} already has an open order.")
        table.status = "OCCUPIED"
        table.save(update_fields=["status", "updated_at"])

    cfg.order_counter += 1
    cfg.save(update_fields=["order_counter", "updated_at"])
    order = Order.objects.create(
        order_number=f"ORD-{cfg.order_counter:06d}", order_type=order_type, table=table, customer=_customer(data), cashier=user,
        subtotal=calc["subtotal"], discount_type=calc["discount_type"], discount_value=calc["discount_value"], discount_amount=calc["discount_amount"],
        tax_total=calc["tax_total"], round_off=calc["round_off"], grand_total=calc["grand_total"], prices_include_tax=cfg.prices_include_tax,
        notes=data.get("notes", ""),
    )
    OrderItem.objects.bulk_create([
        OrderItem(order=order, menu_item=src["menu_item"], name=src["menu_item"].name, unit_price=src["unit_price"], tax_rate=src["tax_rate"],
                  quantity=src["quantity"], line_subtotal=out["line_subtotal"], line_discount=out["line_discount"], line_tax=out["line_tax"],
                  line_total=out["line_total"], notes=src["notes"])
        for src, out in zip(lines, calc["lines"])
    ])
    log(user, "order.create", "Order", order.id, after={"order_number": order.order_number, "grand_total": order.grand_total})
    if calc["discount_amount"] > 0:
        log(user, "order.discount", "Order", order.id, after={"type": calc["discount_type"], "value": calc["discount_value"], "amount": calc["discount_amount"]})
    if data.get("payments"):
        pay.record_payments(order, data["payments"], user, key_prefix)
    elif order.grand_total == 0:
        pay.refresh_payment_status(order)
        order.save()
    if data.get("held_order_id"):
        HeldOrder.objects.filter(pk=data["held_order_id"], cashier=user).delete()
    order.refresh_from_db()
    return order
