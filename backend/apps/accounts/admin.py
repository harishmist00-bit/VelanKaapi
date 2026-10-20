from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class RestaurantUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("POS", {"fields": ("role", "phone", "max_discount_percent")}),)
    list_display = ("username", "first_name", "role", "is_active")
