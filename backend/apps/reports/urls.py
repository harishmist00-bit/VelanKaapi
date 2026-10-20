from django.urls import path

from . import views

urlpatterns = [
    path("dashboard/summary/", views.dashboard_summary),
    path("dashboard/sales-chart/", views.dashboard_sales_chart),
    path("reports/sales/", views.sales),
    path("reports/payments/", views.payments_report),
    path("reports/top-items/", views.top_items),
    path("reports/export-csv/", views.export_csv),
]
