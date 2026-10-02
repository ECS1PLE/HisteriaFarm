from django.urls import path
from . import views
urlpatterns = [
 path("status/", views.status), path("login/", views.panel_login), path("logout/", views.panel_logout),
 path("telegram/settings/", views.telegram_settings), path("workspace/", views.workspace),
 path("telegram/login/", views.start_login), path("telegram/login/<uuid:attempt_id>/", views.finish_login),
 path("accounts/<uuid:account_id>/", views.account_detail), path("accounts/<uuid:account_id>/profile/", views.profile),
 path("accounts/<uuid:account_id>/avatar/", views.avatar),
]
