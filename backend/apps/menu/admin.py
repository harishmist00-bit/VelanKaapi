from django.contrib import admin

from .models import Category, MenuItem

admin.site.register(Category)


@admin.register(MenuItem)
class MenuItemAdmin(admin.ModelAdmin):
    list_display = ("name", "sku", "category", "price", "tax_rate", "is_available", "is_active")
    search_fields = ("name", "sku")
