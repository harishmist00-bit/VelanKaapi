from collections import defaultdict
from decimal import Decimal

from rest_framework import serializers

from apps.payments.models import Payment, Refund

from .models import HeldOrder, Order, OrderItem


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ["id", "menu_item", "name", "unit_price", "quantity", "tax_rate", "line_subtotal", "line_discount", "line_tax", "line_total", "notes"]


class PaymentSerializer(serializers.ModelSerializer):
    received_by_name = serializers.CharField(source="received_by.display_name", read_only=True)

    class Meta:
        model = Payment
        fields = ["id", "method", "amount", "tendered", "change_due", "reference", "received_by_name", "created_at"]


class RefundSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.display_name", read_only=True)

    class Meta:
        model = Refund
        fields = ["id", "amount", "reason", "restock", "payment", "created_by_name", "created_at"]


class OrderListSerializer(serializers.ModelSerializer):
    table_number = serializers.CharField(source="table.number", read_only=True, default=None)
    cashier_name = serializers.CharField(source="cashier.display_name", read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True, default=None)
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ["id", "order_number", "invoice_number", "order_type", "table", "table_number", "customer", "customer_name", "cashier", "cashier_name",
                  "status", "kitchen_status", "payment_status", "subtotal", "discount_amount", "tax_total", "grand_total", "paid_total",
                  "refunded_total", "item_count", "created_at"]

    def get_item_count(self, obj):
        return sum(i.quantity for i in obj.items.all())


class OrderDetailSerializer(OrderListSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    refunds = RefundSerializer(many=True, read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True, default=None)
    amount_due = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    tax_breakdown = serializers.SerializerMethodField()

    class Meta(OrderListSerializer.Meta):
        fields = OrderListSerializer.Meta.fields + ["items", "payments", "refunds", "customer_phone", "amount_due", "tax_breakdown", "notes",
                                                    "cancel_reason", "discount_type", "discount_value", "round_off", "prices_include_tax", "completed_at"]

    def get_tax_breakdown(self, obj):
        """Group tax by rate for the receipt; CGST and SGST are each half of the tax at that rate."""
        groups = defaultdict(lambda: {"taxable": Decimal("0"), "tax": Decimal("0")})
        for i in obj.items.all():
            g = groups[i.tax_rate]
            g["taxable"] += i.line_subtotal - i.line_discount - (i.line_tax if obj.prices_include_tax else 0)
            g["tax"] += i.line_tax
        rows = []
        for rate, g in sorted(groups.items()):
            half = (g["tax"] / 2).quantize(Decimal("0.01"))
            rows.append({"rate": str(rate), "taxable": str(g["taxable"]), "cgst": str(half), "sgst": str(g["tax"] - half), "tax": str(g["tax"])})
        return rows


class CartItemSerializer(serializers.Serializer):
    menu_item_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1, max_value=99)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=255)


class PaymentInputSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=["CASH", "UPI", "CARD", "OTHER"])
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    tendered = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    reference = serializers.CharField(required=False, allow_blank=True, max_length=40)


class CalculateSerializer(serializers.Serializer):
    items = CartItemSerializer(many=True, allow_empty=False)
    discount_type = serializers.ChoiceField(choices=["NONE", "PERCENT", "FIXED"], required=False, default="NONE")
    discount_value = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, default=0, min_value=Decimal("0"))


class OrderCreateSerializer(CalculateSerializer):
    order_type = serializers.ChoiceField(choices=["DINE_IN", "TAKEAWAY", "DELIVERY"], required=False)
    table_id = serializers.IntegerField(required=False, allow_null=True)
    customer_id = serializers.IntegerField(required=False, allow_null=True)
    customer_name = serializers.CharField(required=False, allow_blank=True, max_length=120)
    customer_phone = serializers.RegexField(r"^\+?\d{7,15}$", required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    payments = PaymentInputSerializer(many=True, required=False)
    held_order_id = serializers.IntegerField(required=False, allow_null=True)


class HeldOrderSerializer(serializers.ModelSerializer):
    cashier_name = serializers.CharField(source="cashier.display_name", read_only=True)

    class Meta:
        model = HeldOrder
        fields = ["id", "label", "payload", "cashier_name", "created_at"]
