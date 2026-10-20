from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from .models import Ingredient, Recipe, RecipeIngredient, StockMovement, Supplier


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ["id", "name", "phone", "email", "address", "is_active"]


class IngredientSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True, default=None)
    is_low = serializers.BooleanField(read_only=True)

    class Meta:
        model = Ingredient
        fields = ["id", "name", "unit", "current_quantity", "reorder_level", "supplier", "supplier_name", "is_active", "is_low"]
        # Quantity changes only through stock movements so history stays complete.
        read_only_fields = ["current_quantity"]


class MovementSerializer(serializers.ModelSerializer):
    ingredient_name = serializers.CharField(source="ingredient.name", read_only=True)
    unit = serializers.CharField(source="ingredient.unit", read_only=True)
    order_number = serializers.CharField(source="order.order_number", read_only=True, default=None)
    created_by_name = serializers.CharField(source="created_by.display_name", read_only=True, default=None)

    class Meta:
        model = StockMovement
        fields = ["id", "ingredient", "ingredient_name", "unit", "movement_type", "quantity_delta", "balance_after", "unit_cost", "order_number", "reason", "created_by_name", "created_at"]


class AdjustSerializer(serializers.Serializer):
    ingredient = serializers.IntegerField()
    movement_type = serializers.ChoiceField(choices=["PURCHASE", "ADJUSTMENT", "WASTE"])
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3)
    reason = serializers.CharField(required=False, allow_blank=True, default="", max_length=255)
    unit_cost = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)

    def validate_ingredient(self, v):
        if not Ingredient.objects.filter(pk=v).exists():
            raise serializers.ValidationError("Ingredient not found.")
        return v


class RecipeLineSerializer(serializers.ModelSerializer):
    ingredient_name = serializers.CharField(source="ingredient.name", read_only=True)
    unit = serializers.CharField(source="ingredient.unit", read_only=True)

    class Meta:
        model = RecipeIngredient
        fields = ["ingredient", "ingredient_name", "unit", "quantity"]

    def validate_quantity(self, v):
        if v <= Decimal("0"):
            raise serializers.ValidationError("Quantity must be positive.")
        return v


class RecipeSerializer(serializers.ModelSerializer):
    ingredients = RecipeLineSerializer(many=True)
    menu_item_name = serializers.CharField(source="menu_item.name", read_only=True)

    class Meta:
        model = Recipe
        fields = ["id", "menu_item", "menu_item_name", "ingredients"]

    def validate_ingredients(self, lines):
        ids = [l["ingredient"].id for l in lines]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError("Each ingredient may appear once.")
        return lines

    @transaction.atomic
    def create(self, validated):
        lines = validated.pop("ingredients")
        recipe = Recipe.objects.create(**validated)
        RecipeIngredient.objects.bulk_create([RecipeIngredient(recipe=recipe, **l) for l in lines])
        return recipe

    @transaction.atomic
    def update(self, instance, validated):
        lines = validated.pop("ingredients", None)
        if lines is not None:
            instance.ingredients.all().delete()
            RecipeIngredient.objects.bulk_create([RecipeIngredient(recipe=instance, **l) for l in lines])
        return instance
