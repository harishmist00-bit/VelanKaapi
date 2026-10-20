from rest_framework import serializers

from .models import RestaurantSettings


class RestaurantSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = RestaurantSettings
        exclude = ["created_at", "updated_at", "id"]
        read_only_fields = ["currency", "invoice_counter", "order_counter"]

    def validate_enabled_payment_methods(self, value):
        allowed = {"CASH", "UPI", "CARD", "OTHER"}
        if not value or not set(value) <= allowed:
            raise serializers.ValidationError(f"Choose one or more of {sorted(allowed)}.")
        return value

    def validate_gstin(self, value):
        value = value.strip().upper()
        if value and len(value) != 15:
            raise serializers.ValidationError("GSTIN must be 15 characters.")
        return value

    def validate(self, attrs):
        for f in ("default_tax_rate", "max_cashier_discount_percent"):
            v = attrs.get(f)
            if v is not None and not (0 <= v <= 100):
                raise serializers.ValidationError({f: "Must be between 0 and 100."})
        return attrs
