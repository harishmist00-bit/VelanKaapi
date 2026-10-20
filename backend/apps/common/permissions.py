from rest_framework.permissions import SAFE_METHODS, BasePermission

ADMIN, MANAGER, CASHIER = "ADMIN", "MANAGER", "CASHIER"


def role_of(user):
    if not user or not user.is_authenticated:
        return None
    return ADMIN if user.is_superuser else user.role


class IsStaffUser(BasePermission):
    """Any authenticated, active user with a role (Admin, Manager, Cashier)."""

    def has_permission(self, request, view):
        return role_of(request.user) in (ADMIN, MANAGER, CASHIER)


class IsManagerOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return role_of(request.user) in (ADMIN, MANAGER)


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return role_of(request.user) == ADMIN


class ReadAnyWriteManager(BasePermission):
    """Everyone signed in may read; only Manager/Admin may write."""

    def has_permission(self, request, view):
        role = role_of(request.user)
        if role is None:
            return False
        if request.method in SAFE_METHODS:
            return True
        return role in (ADMIN, MANAGER)
