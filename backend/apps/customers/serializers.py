import re

from rest_framework import serializers

from .models import Customer


class CustomerSerializer(serializers.ModelSerializer):
    total_spent = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True, default=0)
    order_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Customer
        fields = ["id", "name", "phone", "email", "loyalty_points", "total_spent", "order_count", "created_at"]
        read_only_fields = ["loyalty_points"]

    def validate_phone(self, v):
        v = re.sub(r"[\s-]", "", v)
        if not re.fullmatch(r"\+?\d{7,15}", v):
            raise serializers.ValidationError("Enter a valid phone number (7 to 15 digits).")
        return v
