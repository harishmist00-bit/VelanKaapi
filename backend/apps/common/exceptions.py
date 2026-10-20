import logging

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class ConflictError(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "The request conflicts with the current state."
    default_code = "conflict"


class BusinessRuleError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "Business rule violated."
    default_code = "business_rule"


def api_exception_handler(exc, context):
    """All errors share one shape: {"error": {"code", "message", "details"}}."""
    if isinstance(exc, Http404):
        pass
    response = exception_handler(exc, context)
    if response is None:
        if isinstance(exc, DjangoPermissionDenied):
            return Response({"error": {"code": "permission_denied", "message": str(exc) or "Permission denied.", "details": {}}}, status=403)
        logger.exception("Unhandled error", exc_info=exc)
        return Response({"error": {"code": "server_error", "message": "An unexpected error occurred.", "details": {}}}, status=500)

    data = response.data
    if isinstance(exc, ValidationError):
        code, message, details = "validation_error", "Please correct the highlighted fields.", data
        if isinstance(data, list):
            message, details = " ".join(str(x) for x in data), {}
        elif isinstance(data, dict) and "non_field_errors" in data:
            message = " ".join(str(x) for x in data["non_field_errors"])
    else:
        code = getattr(exc, "default_code", "error")
        if hasattr(exc, "detail") and hasattr(exc.detail, "code"):
            code = exc.detail.code
        message = data.get("detail", "Request failed.") if isinstance(data, dict) else str(data)
        details = {}
    response.data = {"error": {"code": str(code), "message": str(message), "details": details}}
    return response
