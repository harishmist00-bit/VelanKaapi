from rest_framework.routers import DefaultRouter

from .views import CategoryViewSet, MenuItemViewSet

router = DefaultRouter()
router.register("menu/items", MenuItemViewSet, basename="menu-item")
router.register("menu/categories", CategoryViewSet, basename="menu-category")
urlpatterns = router.urls
