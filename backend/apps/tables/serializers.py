from rest_framework import serializers

from .models import RestaurantTable


class TableSerializer(serializers.ModelSerializer):
    current_order = serializers.SerializerMethodField()

    class Meta:
        model = RestaurantTable
        fields = ["id", "number", "capacity", "status", "is_active", "current_order"]

    def get_current_order(self, obj):
        from apps.orders.models import Order

        order = Order.objects.filter(table=obj, status__in=Order.ACTIVE_STATUSES).order_by("-created_at").first()
        if not order:
            return None
        return {"id": order.id, "order_number": order.order_number, "grand_total": str(order.grand_total),
                "payment_status": order.payment_status, "status": order.status, "created_at": order.created_at}
