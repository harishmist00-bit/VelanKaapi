from django.db import models

from apps.common.models import TimeStampedModel


class RestaurantTable(TimeStampedModel):
    class Status(models.TextChoices):
        AVAILABLE = "AVAILABLE", "Available"
        OCCUPIED = "OCCUPIED", "Occupied"
        RESERVED = "RESERVED", "Reserved"

    number = models.CharField(max_length=20, unique=True)
    capacity = models.PositiveSmallIntegerField(default=4)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.AVAILABLE, db_index=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["number"]
        constraints = [models.CheckConstraint(check=models.Q(capacity__gte=1), name="table_capacity_gte_1")]

    def __str__(self):
        return f"Table {self.number}"
