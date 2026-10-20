"""Report queries. Day/week/month grouping is done in Python (not SQL) so results are right even
when the MySQL/MariaDB time-zone tables have not been loaded (common on XAMPP)."""
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone

from apps.orders.models import Order, OrderItem
from apps.payments.models import Payment, Refund

ZERO = Decimal("0.00")


def parse_range(params, default_days=0):
    today = timezone.localdate()
    try:
        start = date.fromisoformat(params.get("date_from")) if params.get("date_from") else today - timedelta(days=default_days)
        end = date.fromisoformat(params.get("date_to")) if params.get("date_to") else today
    except ValueError:
        from apps.common.exceptions import BusinessRuleError

        raise BusinessRuleError("Dates must look like YYYY-MM-DD.")
    return start, end


def bounds(start, end):
    tz = timezone.get_current_timezone()
    return timezone.make_aware(datetime.combine(start, time.min), tz), timezone.make_aware(datetime.combine(end + timedelta(days=1), time.min), tz)


def sales_orders(start, end, cashier=None):
    lo, hi = bounds(start, end)
    qs = Order.objects.filter(created_at__gte=lo, created_at__lt=hi).exclude(status="CANCELLED")
    return qs.filter(cashier=cashier) if cashier else qs


def bucket(d, group):
    if group == "week":
        return d - timedelta(days=d.weekday())
    if group == "month":
        return d.replace(day=1)
    return d


def sales_report(start, end, group="day", cashier=None):
    qs = sales_orders(start, end, cashier)
    agg = qs.aggregate(orders=Count("id"), subtotal=Sum("subtotal"), discount=Sum("discount_amount"), tax=Sum("tax_total"), grand=Sum("grand_total"), refunded=Sum("refunded_total"))
    g = lambda k: agg[k] or ZERO
    summary = {
        "orders": agg["orders"], "gross_sales": g("subtotal"), "discounts": g("discount"), "refunds": g("refunded"), "tax_collected": g("tax"),
        "total_billed": g("grand"), "net_sales": g("grand") - g("tax") - g("refunded"),
    }
    series = defaultdict(lambda: {"orders": 0, "total": ZERO})
    for created, total in qs.values_list("created_at", "grand_total"):
        b = bucket(timezone.localtime(created).date(), group)
        series[b]["orders"] += 1
        series[b]["total"] += total
    return {"summary": summary, "series": [{"period": k.isoformat(), **v} for k, v in sorted(series.items())]}


def payment_report(start, end, cashier=None):
    lo, hi = bounds(start, end)
    pq = Payment.objects.filter(created_at__gte=lo, created_at__lt=hi)
    rq = Refund.objects.filter(created_at__gte=lo, created_at__lt=hi)
    if cashier:
        pq, rq = pq.filter(order__cashier=cashier), rq.filter(order__cashier=cashier)
    by = {r["method"]: r for r in pq.values("method").annotate(total=Sum("amount"), count=Count("id"))}
    rows = [{"method": m, "count": by[m]["count"], "total": by[m]["total"]} for m in sorted(by)]
    received, refunded = sum((r["total"] for r in rows), ZERO), rq.aggregate(s=Sum("amount"))["s"] or ZERO
    return {"methods": rows, "received": received, "refunded": refunded, "net_collected": received - refunded}


def item_rows(start, end, cashier=None):
    return OrderItem.objects.filter(order__in=sales_orders(start, end, cashier))


def top_items(start, end, limit=10, cashier=None):
    rows = item_rows(start, end, cashier).values("menu_item_id", "name").annotate(quantity=Sum("quantity"), revenue=Sum("line_total")).order_by("-quantity", "-revenue")[:limit]
    return list(rows)


def category_sales(start, end, cashier=None):
    return list(item_rows(start, end, cashier).values(category=__import__("django.db.models", fromlist=["F"]).F("menu_item__category__name")).annotate(quantity=Sum("quantity"), revenue=Sum("line_total")).order_by("-revenue"))


def cashier_sales(start, end):
    rows = sales_orders(start, end).values("cashier__username").annotate(orders=Count("id"), total=Sum("grand_total")).order_by("-total")
    return [{"cashier": r["cashier__username"], "orders": r["orders"], "total": r["total"]} for r in rows]
