from django.db.models import Count, Q, Sum
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.common.permissions import IsManagerOrAdmin, IsStaffUser

from .models import Customer
from .serializers import CustomerSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = [IsStaffUser]
    search_fields = ["name", "phone", "email"]
    ordering_fields = ["name", "created_at", "total_spent"]

    def get_queryset(self):
        paid = Q(orders__status__in=["PENDING", "PREPARING", "READY", "COMPLETED"])
        return Customer.objects.annotate(
            total_spent=Sum("orders__grand_total", filter=paid), order_count=Count("orders", filter=paid)
        )

    def get_permissions(self):
        if self.action == "destroy":
            return [IsManagerOrAdmin()]
        return super().get_permissions()

    @action(detail=True, methods=["get"])
    def orders(self, request, pk=None):
        from apps.orders.models import Order
        from apps.orders.serializers import OrderListSerializer

        qs = Order.objects.filter(customer_id=pk).select_related("table", "cashier").order_by("-created_at")[:100]
        return Response(OrderListSerializer(qs, many=True).data)
