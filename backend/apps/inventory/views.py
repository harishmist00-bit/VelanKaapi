from django.db.models import F
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.common.permissions import IsManagerOrAdmin, IsStaffUser

from . import services
from .models import Ingredient, Recipe, StockMovement, Supplier
from .serializers import (AdjustSerializer, IngredientSerializer, MovementSerializer, RecipeSerializer, SupplierSerializer)


class ManagerViewSet(viewsets.ModelViewSet):
    permission_classes = [IsManagerOrAdmin]


class IngredientViewSet(ManagerViewSet):
    queryset = Ingredient.objects.select_related("supplier")
    serializer_class = IngredientSerializer
    search_fields = ["name"]
    filterset_fields = ["supplier", "is_active"]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get("low_stock") in ("1", "true"):
            qs = qs.filter(current_quantity__lte=F("reorder_level"))
        return qs


class SupplierViewSet(ManagerViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    search_fields = ["name", "phone"]


class RecipeViewSet(ManagerViewSet):
    queryset = Recipe.objects.select_related("menu_item").prefetch_related("ingredients__ingredient")
    serializer_class = RecipeSerializer
    filterset_fields = ["menu_item"]


class MovementViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = StockMovement.objects.select_related("ingredient", "order", "created_by")
    serializer_class = MovementSerializer
    permission_classes = [IsManagerOrAdmin]
    filterset_fields = ["ingredient", "movement_type"]


@api_view(["POST"])
@permission_classes([IsManagerOrAdmin])
def adjust(request):
    ser = AdjustSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    d = ser.validated_data
    mv = services.adjust_stock(d["ingredient"], d["movement_type"], d["quantity"], d["reason"], request.user, d.get("unit_cost"))
    return Response(MovementSerializer(mv).data, status=status.HTTP_201_CREATED)
