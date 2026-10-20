import hashlib
import json

from django.db import IntegrityError, transaction
from rest_framework.exceptions import ValidationError
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response

from .exceptions import ConflictError
from .models import IdempotencyRecord


def _hash(payload):
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def run_idempotent(request, endpoint, func):
    """Run func() -> (status_code, data) at most once per Idempotency-Key.

    The record is inserted first inside the same transaction as the work, so two concurrent
    requests with one key serialize on the unique index; the loser replays the stored result.
    A request that fails validation rolls back, which also removes its record, so it can be retried.
    """
    key = request.headers.get("Idempotency-Key")
    if not key:
        code, data = func()
        return Response(data, status=code)
    if len(key) > 100:
        raise ValidationError({"Idempotency-Key": "Key is too long (max 100 characters)."})
    request_hash = _hash(request.data)

    def replay(rec):
        if rec.request_hash != request_hash:
            raise ConflictError("This Idempotency-Key was already used with a different request.")
        if rec.response_status is None:
            raise ConflictError("A request with this Idempotency-Key is still being processed.")
        return Response(rec.response_body, status=rec.response_status, headers={"Idempotent-Replay": "true"})

    existing = IdempotencyRecord.objects.filter(user=request.user, key=key, endpoint=endpoint).first()
    if existing:
        return replay(existing)
    try:
        with transaction.atomic():
            rec = IdempotencyRecord.objects.create(user=request.user, key=key, endpoint=endpoint, request_hash=request_hash)
            code, data = func()
            rec.response_status = code
            rec.response_body = json.loads(JSONRenderer().render(data))
            rec.save(update_fields=["response_status", "response_body"])
            return Response(data, status=code)
    except IntegrityError:
        existing = IdempotencyRecord.objects.filter(user=request.user, key=key, endpoint=endpoint).first()
        if existing is None:
            raise
        return replay(existing)
