from django.contrib import admin

from .models import Ingredient, Recipe, RecipeIngredient, StockMovement, Supplier

admin.site.register(Supplier)
admin.site.register(Ingredient)


class RIInline(admin.TabularInline):
    model = RecipeIngredient
    extra = 1


@admin.register(Recipe)
class RecipeAdmin(admin.ModelAdmin):
    inlines = [RIInline]


@admin.register(StockMovement)
class MovementAdmin(admin.ModelAdmin):
    list_display = ("created_at", "ingredient", "movement_type", "quantity_delta", "order")

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
