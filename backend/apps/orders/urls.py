from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import HeldOrderViewSet, KitchenOrdersView, KitchenStatusView, OrderViewSet

router = DefaultRouter()
router.register("orders/held", HeldOrderViewSet, basename="held-order")  # must precede "orders"
router.register("orders", OrderViewSet, basename="order")

urlpatterns = [
    path("kitchen/orders/", KitchenOrdersView.as_view()),
    path("kitchen/orders/<int:pk>/status/", KitchenStatusView.as_view()),
] + router.urls
