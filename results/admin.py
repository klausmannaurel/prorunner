from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from .models import Track, Result, Profile  # Itt hozzáadtuk a Profile-t!

# --- 1. PROFIL BEÁGYAZÁSA A USER ADMINBA ---

class ProfileInline(admin.StackedInline):
    """Ez teszi lehetővé, hogy a Profil adatokat a User oldalon szerkeszd."""
    model = Profile
    can_delete = False
    verbose_name_plural = 'Profil Adatok (Súly, Magasság, stb.)'
    fk_name = 'user'

class UserAdmin(BaseUserAdmin):
    """A gyári User admin kiegészítése a Profil mezőkkel."""
    inlines = (ProfileInline,)

# User modell újraregisztrálása a mi bővített verziónkkal
admin.site.unregister(User)
admin.site.register(User, UserAdmin)


# --- 2. A TE MEGLÉVŐ BEÁLLÍTÁSAID (Változatlanul) ---

class TrackAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'distance_km_per_lap', 'surface_type')

class ResultAdmin(admin.ModelAdmin):
    list_display = ('runner_name', 'track', 'time', 'laps_count', 'recorded_at')
    list_filter = ('track', 'recorded_at')
    search_fields = ('runner_name', 'lap_times')

# A saját modellek regisztrálása
admin.site.register(Track, TrackAdmin)
admin.site.register(Result, ResultAdmin)
# Ha a Profilokat külön listában is látni akarod, vedd ki a kommentet:
# admin.site.register(Profile)
