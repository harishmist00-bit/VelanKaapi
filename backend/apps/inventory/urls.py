from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("inventory/items", views.IngredientViewSet, basename="ingredient")
router.register("inventory/suppliers", views.SupplierViewSet, basename="supplier")
router.register("inventory/recipes", views.RecipeViewSet, basename="recipe")
router.register("inventory/movements", views.MovementViewSet, basename="movement")

urlpatterns = [path("inventory/adjust/", views.adjust)] + router.urls
