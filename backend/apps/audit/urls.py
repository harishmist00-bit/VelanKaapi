from rest_framework import viewsets
from rest_framework.routers import DefaultRouter

from apps.common.permissions import IsManagerOrAdmin

from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related("user")
    serializer_class = AuditLogSerializer
    permission_classes = [IsManagerOrAdmin]
    filterset_fields = ["action", "entity_type", "entity_id"]
    search_fields = ["action", "entity_id"]


router = DefaultRouter()
router.register("audit-logs", AuditLogViewSet, basename="audit-log")
urlpatterns = router.urls
