from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("apps.accounts.urls")),
    path("api/", include("apps.settings_app.urls")),
    path("api/", include("apps.audit.urls")),
    path("api/", include("apps.menu.urls")),
    path("api/", include("apps.tables.urls")),
    path("api/", include("apps.customers.urls")),
    path("api/", include("apps.orders.urls")),
    path("api/", include("apps.inventory.urls")),
    path("api/", include("apps.reports.urls")),
]
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
