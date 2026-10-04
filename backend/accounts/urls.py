from django.urls import path
from . import views
urlpatterns = [
 path("publications/", views.prepare_publication),
 path("publications/<uuid:batch_id>/", views.publication_detail),
 path("publications/<uuid:batch_id>/deliveries/<uuid:delivery_id>/", views.publication_delivery),
 path("warmups/", views.start_warmup), path("warmups/<uuid:job_id>/stop/", views.stop_warmup),
 path("status/", views.status), path("login/", views.panel_login), path("logout/", views.panel_logout),
 path("telegram/settings/", views.telegram_settings), path("workspace/", views.workspace),
 path("telegram/login/", views.start_login), path("telegram/login/<uuid:attempt_id>/", views.finish_login),
 path("accounts/<uuid:account_id>/", views.account_detail), path("accounts/<uuid:account_id>/profile/", views.profile),
 path("accounts/<uuid:account_id>/avatar/", views.avatar),
 path("accounts/<uuid:account_id>/report/", views.prepare_report),
 path("accounts/<uuid:account_id>/report/<uuid:report_id>/", views.submit_report),
]
