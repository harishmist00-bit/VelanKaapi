from datetime import datetime, time, timedelta

from django.db.models import Q
from django.utils import timezone
from django_filters import rest_framework as df
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.exceptions import BusinessRuleError
from apps.common.idempotency import run_idempotent
from apps.common.permissions import ADMIN, CASHIER, IsManagerOrAdmin, IsStaffUser, role_of
from apps.payments import services as pay
from apps.settings_app.models import RestaurantSettings
from apps.settings_app.serializers import RestaurantSettingsSerializer

from .models import HeldOrder, Order
from .serializers import (CalculateSerializer, HeldOrderSerializer, OrderCreateSerializer, OrderDetailSerializer, OrderListSerializer,
                          PaymentInputSerializer, PaymentSerializer, RefundSerializer)
from .services import lifecycle
from .services import orders as svc


def day_start(d):
    return timezone.make_aware(datetime.combine(d, time.min))


class OrderFilter(df.FilterSet):
    date_from = df.DateFilter(method="f_from")
    date_to = df.DateFilter(method="f_to")
    search = df.CharFilter(method="f_search")

    class Meta:
        model = Order
        fields = ["status", "kitchen_status", "payment_status", "order_type", "cashier", "table", "customer"]

    def f_from(self, qs, name, value):
        return qs.filter(created_at__gte=day_start(value))

    def f_to(self, qs, name, value):
        return qs.filter(created_at__lt=day_start(value + timedelta(days=1)))

    def f_search(self, qs, name, value):
        return qs.filter(Q(order_number__icontains=value) | Q(invoice_number__icontains=value) | Q(customer__name__icontains=value) | Q(customer__phone__icontains=value))


class OrderViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsStaffUser]
    filterset_class = OrderFilter
    ordering_fields = ["created_at", "grand_total"]

    def get_queryset(self):
        qs = Order.objects.select_related("table", "cashier", "customer").prefetch_related("items", "payments", "refunds")
        if role_of(self.request.user) == CASHIER:  # cashiers only see their own orders
            qs = qs.filter(cashier=self.request.user)
        return qs

    def get_serializer_class(self):
        return OrderListSerializer if self.action == "list" else OrderDetailSerializer

    def get_permissions(self):
        if self.action in ("cancel", "refunds_create", "merge"):
            return [IsManagerOrAdmin()]
        return super().get_permissions()

    def create(self, request):
        ser = OrderCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        def work():
            key = request.headers.get("Idempotency-Key")
            order = svc.create_order(request.user, ser.validated_data, key_prefix=f"{request.user.id}:{key}" if key else None)
            return 201, OrderDetailSerializer(order).data

        return run_idempotent(request, "order.create", work)

    @action(detail=False, methods=["post"])
    def calculate(self, request):
        ser = CalculateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return Response(svc.preview(request.user, ser.validated_data))

    @action(detail=True, methods=["get"])
    def receipt(self, request, pk=None):
        order = self.get_object()
        return Response({"order": OrderDetailSerializer(order).data, "restaurant": RestaurantSettingsSerializer(RestaurantSettings.get()).data})

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        order = lifecycle.cancel_order(self.get_object(), request.data.get("reason", ""), request.user)
        return Response(OrderDetailSerializer(self.get_queryset().get(pk=order.pk)).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        order = lifecycle.complete_order(self.get_object(), request.user)
        return Response(OrderDetailSerializer(self.get_queryset().get(pk=order.pk)).data)

    @action(detail=True, methods=["post"], url_path="transfer-table")
    def transfer_table(self, request, pk=None):
        if not request.data.get("table_id"):
            raise BusinessRuleError("table_id is required.")
        order = lifecycle.transfer_table(self.get_object(), request.data["table_id"], request.user)
        return Response(OrderDetailSerializer(self.get_queryset().get(pk=order.pk)).data)

    @action(detail=True, methods=["post"])
    def merge(self, request, pk=None):
        source = Order.objects.filter(pk=request.data.get("source_order_id")).first()
        if not source:
            raise BusinessRuleError("source_order_id does not match an order.")
        order = lifecycle.merge_orders(self.get_object(), source, request.user)
        return Response(OrderDetailSerializer(self.get_queryset().get(pk=order.pk)).data)

    @action(detail=True, methods=["get", "post"], url_path="payments")
    def payments(self, request, pk=None):
        order = self.get_object()
        if request.method == "GET":
            return Response(PaymentSerializer(order.payments.all(), many=True).data)
        ser = PaymentInputSerializer(data=request.data.get("payments", [request.data]) if isinstance(request.data, dict) else request.data, many=True)
        ser.is_valid(raise_exception=True)

        def work():
            key = request.headers.get("Idempotency-Key")
            updated = pay.record_payments(order, ser.validated_data, request.user, key_prefix=f"{order.id}:{key}" if key else None)
            return 201, OrderDetailSerializer(self.get_queryset().get(pk=updated.pk)).data

        return run_idempotent(request, f"order.pay.{order.id}", work)

    @action(detail=True, methods=["get", "post"], url_path="refunds")
    def refunds_create(self, request, pk=None):
        order = self.get_object()
        if request.method == "GET":
            return Response(RefundSerializer(order.refunds.all(), many=True).data)
        refund = pay.create_refund(order, request.data.get("amount", 0), request.data.get("reason", ""), request.user, restock=bool(request.data.get("restock", False)))
        return Response(RefundSerializer(refund).data, status=status.HTTP_201_CREATED)


class HeldOrderViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.RetrieveModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = HeldOrderSerializer
    permission_classes = [IsStaffUser]
    pagination_class = None

    def get_queryset(self):
        qs = HeldOrder.objects.select_related("cashier")
        return qs if role_of(self.request.user) in (ADMIN, "MANAGER") else qs.filter(cashier=self.request.user)

    def perform_create(self, serializer):
        serializer.save(cashier=self.request.user)


KITCHEN_ACTIVE = ["PENDING", "PREPARING", "READY"]


class KitchenOrdersView(APIView):
    permission_classes = [IsStaffUser]

    def get(self, request):
        qs = Order.objects.filter(status__in=KITCHEN_ACTIVE, kitchen_status__in=["NEW", "PREPARING", "READY"]).select_related("table").prefetch_related("items").order_by("created_at")
        data = [{
            "id": o.id, "order_number": o.order_number, "order_type": o.order_type, "table_number": o.table.number if o.table else None,
            "kitchen_status": o.kitchen_status, "payment_status": o.payment_status, "notes": o.notes, "created_at": o.created_at,
            "items": [{"id": i.id, "name": i.name, "quantity": i.quantity, "notes": i.notes} for i in o.items.all()],
        } for o in qs]
        return Response(data)


class KitchenStatusView(APIView):
    permission_classes = [IsStaffUser]

    def patch(self, request, pk):
        order = Order.objects.filter(pk=pk).first()
        if not order:
            return Response({"error": {"code": "not_found", "message": "Order not found.", "details": {}}}, status=404)
        order = lifecycle.set_kitchen_status(order, request.data.get("status", ""), request.user)
        return Response({"id": order.id, "kitchen_status": order.kitchen_status, "status": order.status})
