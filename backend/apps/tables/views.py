from rest_framework import viewsets

from apps.audit.services import log
from apps.common.exceptions import ConflictError
from apps.common.permissions import ReadAnyWriteManager

from .models import RestaurantTable
from .serializers import TableSerializer


class TableViewSet(viewsets.ModelViewSet):
    queryset = RestaurantTable.objects.all()
    serializer_class = TableSerializer
    permission_classes = [ReadAnyWriteManager]
    filterset_fields = ["status", "is_active"]
    search_fields = ["number"]
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if "is_active" not in params and "include_inactive" not in params and self.action == "list":
            qs = qs.filter(is_active=True)
        return qs

    def perform_update(self, serializer):
        from apps.orders.models import Order

        new_status = serializer.validated_data.get("status")
        if new_status == "AVAILABLE" and Order.objects.filter(table=serializer.instance, status__in=Order.ACTIVE_STATUSES).exists():
            raise ConflictError("This table has an open order. Complete or cancel it first.")
        serializer.save()

    def perform_destroy(self, instance):
        from apps.orders.models import Order

        if Order.objects.filter(table=instance, status__in=Order.ACTIVE_STATUSES).exists():
            raise ConflictError("This table has an open order.")
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
        log(self.request, "table.deactivate", "RestaurantTable", instance.id)
