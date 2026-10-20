from django.db.models import Count
from django_filters import rest_framework as df
from rest_framework import viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser

from apps.audit.services import log
from apps.common.permissions import ReadAnyWriteManager

from .models import Category, MenuItem
from .serializers import CategorySerializer, MenuItemSerializer


class MenuItemFilter(df.FilterSet):
    min_price = df.NumberFilter(field_name="price", lookup_expr="gte")
    max_price = df.NumberFilter(field_name="price", lookup_expr="lte")

    class Meta:
        model = MenuItem
        fields = ["category", "is_veg", "is_available", "is_active"]


class MenuItemViewSet(viewsets.ModelViewSet):
    queryset = MenuItem.objects.select_related("category")
    serializer_class = MenuItemSerializer
    permission_classes = [ReadAnyWriteManager]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    filterset_class = MenuItemFilter
    search_fields = ["name", "sku", "description"]
    ordering_fields = ["name", "price", "created_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        # POS and cashiers only see active items unless explicitly asking otherwise.
        params = self.request.query_params
        if "is_active" not in params and "include_inactive" not in params and self.action == "list":
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        obj = serializer.save()
        log(self.request, "menu.create", "MenuItem", obj.id, after={"name": obj.name, "price": obj.price})

    def perform_update(self, serializer):
        before = {"price": serializer.instance.price, "is_available": serializer.instance.is_available, "is_active": serializer.instance.is_active}
        obj = serializer.save()
        log(self.request, "menu.update", "MenuItem", obj.id, before=before, after={"price": obj.price, "is_available": obj.is_available, "is_active": obj.is_active})

    def perform_destroy(self, instance):
        # Deactivate rather than delete: past invoices keep their item references.
        instance.is_active = False
        instance.is_available = False
        instance.save(update_fields=["is_active", "is_available", "updated_at"])
        log(self.request, "menu.deactivate", "MenuItem", instance.id)


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.annotate(item_count=Count("items"))
    serializer_class = CategorySerializer
    permission_classes = [ReadAnyWriteManager]
    filterset_fields = ["is_active"]
    search_fields = ["name"]
    pagination_class = None

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
        log(self.request, "category.deactivate", "Category", instance.id)
