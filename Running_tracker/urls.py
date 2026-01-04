from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from results import views
from django.conf import settings
from django.conf.urls.static import static

# Router a Track modellekhez (API)
router = DefaultRouter()
router.register(r'tracks', views.TrackViewSet, basename='track')

urlpatterns = [
    # Admin felület
    path('admin/', admin.site.urls),

    path('stopwatch/', views.stopwatch, name='stopwatch'),

    # --- HTML OLDALAK ---
    path('', views.home, name='home'),
    path('dashboard/', views.dashboard, name='dashboard'),
    path('my-results/', views.my_results, name='my_results'),
    path('results/runner/<str:runner_name>/', views.runner_results, name='runner_results'),
    path('tracks/', views.tracks, name='tracks'),


    # --- API VÉGPONTOK ---

    # Auth APIk
    path('api/login/', views.api_login, name='api_login'),
    path('api/register/', views.api_register, name='api_register'),
    path('api/logout/', views.api_logout, name='api_logout'),
    path('api/whoami/', views.current_user, name='current_user'),

    # Mentés (Új eredmény)
    path('api/results/save/', views.result_save, name='result-save'),

    # Eredmény törlése és szerkesztése
    path('api/results/<int:pk>/', views.result_detail, name='result-detail'),
    path('api/results/<int:pk>/update/', views.result_detail, name='result-update'),

    # Eredmények listázása Pálya ID alapján
    path('api/results/<str:track_id>/', views.result_list, name='result-list'),

    # Értékelések
    path('api/tracks/<str:track_id>/reviews/', views.track_reviews, name='track-reviews'),

    # --- ÚJ: LIVE TRACKER API VÉGPONTOK (IDE SZÚRD BE) ---
    path('api/live/start/', views.start_live_run, name='live-start'),
    path('api/live/update/', views.update_live_distance, name='live-update'),
    path('api/live/stop/', views.stop_live_run, name='live-stop'),
    path('api/live/active/', views.get_active_runners, name='live-active'),
    path('api/live/pause/', views.pause_live_run, name='live-pause'),
    path('api/live/gps-update/', views.update_gps_position, name='live-gps-update'),
    path('api/live/set-ready/', views.set_run_ready, name='live-set-ready'),
    path('api/live/status/', views.get_live_status, name='live-status'),

    # Router a pályákhoz (api/tracks/) - Ez maradhat a végén
    path('api/', include(router.urls)),
]

# --- MÉDIA FÁJLOK KISZOLGÁLÁSA (Képekhez) ---
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
