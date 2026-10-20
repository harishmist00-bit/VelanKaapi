from rest_framework import permissions, status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.audit.services import log
from apps.common.permissions import IsAdmin, IsManagerOrAdmin

from .models import User
from .serializers import LoginSerializer, UserSerializer


class LoginThrottle(AnonRateThrottle):
    scope = "login"


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    throttle_classes = [LoginThrottle]


@api_view(["GET", "PATCH"])
@permission_classes([permissions.IsAuthenticated])
def me(request):
    if request.method == "PATCH":
        # Users may only change their own name, email, phone and password.
        data = {k: v for k, v in request.data.items() if k in ("first_name", "last_name", "email", "phone", "password")}
        ser = UserSerializer(request.user, data=data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)
    return Response(UserSerializer(request.user).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def logout(request):
    token = request.data.get("refresh")
    if token:
        try:
            RefreshToken(token).blacklist()
        except TokenError:
            pass
    return Response(status=status.HTTP_204_NO_CONTENT)


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("username")
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]
    search_fields = ["username", "first_name", "last_name"]
    filterset_fields = ["role", "is_active"]

    def perform_create(self, serializer):
        user = serializer.save()
        log(self.request, "user.create", "User", user.id, after={"username": user.username, "role": user.role})

    def perform_update(self, serializer):
        before = {"role": serializer.instance.role, "is_active": serializer.instance.is_active}
        user = serializer.save()
        log(self.request, "user.update", "User", user.id, before=before, after={"role": user.role, "is_active": user.is_active})

    def perform_destroy(self, instance):
        # Users are deactivated, never deleted, so audit history stays intact.
        instance.is_active = False
        instance.save(update_fields=["is_active"])
        log(self.request, "user.deactivate", "User", instance.id)


@api_view(["GET"])
@permission_classes([IsManagerOrAdmin])
def staff_list(request):
    users = User.objects.filter(is_active=True).order_by("username")
    return Response([{"id": u.id, "name": u.display_name, "role": u.role} for u in users])
