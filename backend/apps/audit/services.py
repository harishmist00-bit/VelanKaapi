import json

from rest_framework.renderers import JSONRenderer

from .models import AuditLog


def _clean(value):
    if value is None:
        return None
    return json.loads(JSONRenderer().render(value))


def log(request_or_user, action, entity_type, entity_id, before=None, after=None):
    """Append an audit entry. Accepts a DRF/Django request or a bare user."""
    user = getattr(request_or_user, "user", request_or_user)
    ip = None
    meta = getattr(request_or_user, "META", None)
    if meta:
        ip = (meta.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip() or meta.get("REMOTE_ADDR")) or None
    return AuditLog.objects.create(
        user=user if getattr(user, "pk", None) else None,
        action=action, entity_type=entity_type, entity_id=str(entity_id),
        before=_clean(before), after=_clean(after), ip_address=ip,
    )
