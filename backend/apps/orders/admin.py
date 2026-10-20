from django.contrib import admin

from .models import HeldOrder, Order, OrderItem


class ItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    can_delete = False
    readonly_fields = [f.name for f in OrderItem._meta.fields]


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("order_number", "invoice_number", "order_type", "status", "payment_status", "grand_total", "created_at")
    list_filter = ("status", "payment_status", "order_type")
    search_fields = ("order_number", "invoice_number")
    inlines = [ItemInline]

    def has_delete_permission(self, request, obj=None):
        return False  # invoices are never deleted


admin.site.register(HeldOrder)
