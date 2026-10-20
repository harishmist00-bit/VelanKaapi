from django.urls import path
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.audit.services import log
from apps.common.permissions import IsAdmin, IsStaffUser

from .models import RestaurantSettings
from .serializers import RestaurantSettingsSerializer


@api_view(["GET", "PATCH"])
@permission_classes([IsStaffUser])
def restaurant_settings(request):
    obj = RestaurantSettings.get()
    if request.method == "PATCH":
        if not IsAdmin().has_permission(request, None):
            return Response({"error": {"code": "permission_denied", "message": "Only an Admin can change settings.", "details": {}}}, status=403)
        before = RestaurantSettingsSerializer(obj).data
        ser = RestaurantSettingsSerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        log(request, "settings.update", "RestaurantSettings", 1, before=before, after=ser.data)
        return Response(ser.data)
    return Response(RestaurantSettingsSerializer(obj).data)


urlpatterns = [path("settings/restaurant/", restaurant_settings)]
