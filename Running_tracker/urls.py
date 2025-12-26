from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from results import views # Feltételezem, hogy 'results' az app neve. Ha más, írd át!
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
    
    # 1. FŐOLDAL: A Landing Page (index.html)
    path('', views.home, name='home'),

    # 2. DASHBOARD: A Térképes nézet (dashboard.html)
    path('dashboard/', views.dashboard, name='dashboard'),

    # 3. ÚJ: SAJÁT EREDMÉNYEK (my_results.html)
    # Ez köti össze a /my-results/ URL-t a views.py-ban lévő my_results függvénnyel
    path('my-results/', views.my_results, name='my_results'),

    # 4. PÁLYÁK: A kártyás lista (tracks.html)
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

    # Router a pályákhoz (api/tracks/)
    path('api/', include(router.urls)),
]

# --- MÉDIA FÁJLOK KISZOLGÁLÁSA (Képekhez) ---
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
