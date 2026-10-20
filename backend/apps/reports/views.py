import csv
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.common.exceptions import BusinessRuleError
from apps.common.permissions import CASHIER, IsManagerOrAdmin, IsStaffUser, role_of
from apps.inventory.models import Ingredient
from apps.orders.models import Order
from apps.orders.serializers import OrderListSerializer
from apps.payments.models import Payment, Refund

from . import services as svc

ZERO = Decimal("0.00")


def scope(request):
    return request.user if role_of(request.user) == CASHIER else None


@api_view(["GET"])
@permission_classes([IsStaffUser])
def dashboard_summary(request):
    today = timezone.localdate()
    cashier = scope(request)
    orders = svc.sales_orders(today, today, cashier)
    a = orders.aggregate(n=Count("id"), total=Sum("grand_total"))
    n, total = a["n"], a["total"] or ZERO
    lo, hi = svc.bounds(today, today)
    pq = Payment.objects.filter(created_at__gte=lo, created_at__lt=hi)
    rq = Refund.objects.filter(created_at__gte=lo, created_at__lt=hi)
    oq = Order.objects.filter(created_at__gte=lo, created_at__lt=hi)
    if cashier:
        pq, rq, oq = pq.filter(order__cashier=cashier), rq.filter(order__cashier=cashier), oq.filter(cashier=cashier)
    collected = (pq.aggregate(s=Sum("amount"))["s"] or ZERO) - (rq.aggregate(s=Sum("amount"))["s"] or ZERO)
    pending_qs = Order.objects.filter(status__in=Order.ACTIVE_STATUSES + ["COMPLETED"]).exclude(payment_status__in=["PAID", "REFUNDED", "PARTIALLY_REFUNDED"])
    if cashier:
        pending_qs = pending_qs.filter(cashier=cashier)
    pend = pending_qs.aggregate(due=Sum("grand_total"), paid=Sum("paid_total"), n=Count("id"))
    types = {t: {"orders": 0, "total": ZERO} for t in ("DINE_IN", "TAKEAWAY", "DELIVERY")}
    for r in orders.values("order_type").annotate(c=Count("id"), t=Sum("grand_total")):
        types[r["order_type"]] = {"orders": r["c"], "total": r["t"]}
    recent = Order.objects.select_related("table", "cashier", "customer").prefetch_related("items")
    recent = (recent.filter(cashier=cashier) if cashier else recent).order_by("-created_at")[:8]
    return Response({
        "date": today, "total_sales": total, "orders": n, "revenue_collected": collected,
        "pending_payments": (pend["due"] or ZERO) - (pend["paid"] or ZERO), "pending_orders": pend["n"],
        "cancelled_orders": oq.filter(status="CANCELLED").count(), "average_order_value": (total / n).quantize(Decimal("0.01")) if n else ZERO,
        "order_types": types, "top_items": svc.top_items(today - timedelta(days=29), today, 5, cashier),
        "recent_transactions": OrderListSerializer(recent, many=True).data,
        "low_stock_count": 0 if cashier else sum(1 for i in Ingredient.objects.filter(is_active=True) if i.is_low),
    })


@api_view(["GET"])
@permission_classes([IsStaffUser])
def dashboard_sales_chart(request):
    days = 30 if request.query_params.get("days") == "30" else 7
    today = timezone.localdate()
    start = today - timedelta(days=days - 1)
    data = {r["period"]: r for r in svc.sales_report(start, today, "day", scope(request))["series"]}
    out = []
    for i in range(days):
        d = (start + timedelta(days=i)).isoformat()
        out.append({"date": d, "total": data.get(d, {}).get("total", ZERO), "orders": data.get(d, {}).get("orders", 0)})
    return Response(out)


def _params(request):
    start, end = svc.parse_range(request.query_params, 6)
    if end < start:
        raise BusinessRuleError("The end date is before the start date.")
    return start, end


@api_view(["GET"])
@permission_classes([IsManagerOrAdmin])
def sales(request):
    start, end = _params(request)
    group = request.query_params.get("group", "day")
    if group not in ("day", "week", "month"):
        raise BusinessRuleError("group must be day, week or month.")
    res = svc.sales_report(start, end, group)
    res.update({"date_from": start, "date_to": end, "group": group, "categories": svc.category_sales(start, end), "cashiers": svc.cashier_sales(start, end)})
    return Response(res)


@api_view(["GET"])
@permission_classes([IsManagerOrAdmin])
def payments_report(request):
    start, end = _params(request)
    return Response({**svc.payment_report(start, end), "date_from": start, "date_to": end})


@api_view(["GET"])
@permission_classes([IsManagerOrAdmin])
def top_items(request):
    start, end = _params(request)
    return Response(svc.top_items(start, end, int(request.query_params.get("limit", 10))))


@api_view(["GET"])
@permission_classes([IsManagerOrAdmin])
def export_csv(request):
    start, end = _params(request)
    kind = request.query_params.get("type", "sales")
    if kind == "sales":
        header, rows = ["Period", "Orders", "Total"], [[r["period"], r["orders"], r["total"]] for r in svc.sales_report(start, end, request.query_params.get("group", "day"))["series"]]
    elif kind == "payments":
        header, rows = ["Method", "Payments", "Total"], [[r["method"], r["count"], r["total"]] for r in svc.payment_report(start, end)["methods"]]
    elif kind == "top-items":
        header, rows = ["Item", "Quantity", "Revenue"], [[r["name"], r["quantity"], r["revenue"]] for r in svc.top_items(start, end, 100)]
    elif kind == "categories":
        header, rows = ["Category", "Quantity", "Revenue"], [[r["category"], r["quantity"], r["revenue"]] for r in svc.category_sales(start, end)]
    elif kind == "cashiers":
        header, rows = ["Cashier", "Orders", "Total"], [[r["cashier"], r["orders"], r["total"]] for r in svc.cashier_sales(start, end)]
    elif kind == "orders":
        header = ["Order", "Invoice", "Date", "Type", "Status", "Payment", "Subtotal", "Discount", "Tax", "Total", "Paid", "Refunded"]
        rows = [[o.order_number, o.invoice_number or "", timezone.localtime(o.created_at).strftime("%Y-%m-%d %H:%M"), o.order_type, o.status, o.payment_status,
                 o.subtotal, o.discount_amount, o.tax_total, o.grand_total, o.paid_total, o.refunded_total] for o in svc.sales_orders(start, end).order_by("created_at")]
    else:
        raise BusinessRuleError("Unknown export type.")
    resp = HttpResponse(content_type="text/csv")
    resp["Content-Disposition"] = f'attachment; filename="{kind}_{start}_{end}.csv"'
    w = csv.writer(resp)
    w.writerow(header)
    # Guard against spreadsheet formula injection from user-entered text.
    w.writerows([[("'" + c) if isinstance(c, str) and c[:1] in "=+-@" else c for c in r] for r in rows])
    return resp
