from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.core.validators import MinValueValidator, MaxValueValidator
from PIL import Image
from io import BytesIO
from django.core.files.base import ContentFile
import os
import gpxpy
import math
import json

class Track(models.Model):
    """
    Futópálya modell képpel, THUMBNAIL-LEL, GPX fájllal és tulajdonossal kiegészítve.
    """
    SURFACE_CHOICES = [
        ('beton', 'Beton'),
        ('salak', 'Salak'),
        ('rekortan', 'Rekortán'),
        ('föld', 'Föld/Füves'),
        ('vegyes', 'Vegyes')
    ]

    id = models.CharField(max_length=50, primary_key=True)
    name = models.CharField(max_length=100)
    distance_km_per_lap = models.FloatField(default=1.0)
    surface_type = models.CharField(max_length=20, choices=SURFACE_CHOICES, default='vegyes')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='tracks', verbose_name="Létrehozó")

    # EREDETI (NAGY) KÉP
    image = models.ImageField(upload_to='track_images/', blank=True, null=True, verbose_name="Pálya fotó")

    # KICSI KÉP (Thumbnail)
    image_thumbnail = models.ImageField(upload_to='track_images/thumbs/', blank=True, null=True, verbose_name="Kicsi kép")

    # --- ÚJ MEZŐ: GPX fájl feltöltése ---
    gpx_file = models.FileField(upload_to='track_gpx/', blank=True, null=True, verbose_name="GPX Fájl")

    # Szolgáltatások
    is_free = models.BooleanField(default=True, verbose_name="Ingyenes?")
    is_24_7 = models.BooleanField(default=True, verbose_name="0-24 nyitva?")
    has_lighting = models.BooleanField(default=False, verbose_name="Van világítás?")
    has_shower = models.BooleanField(default=False, verbose_name="Van zuhany?")
    has_lockers = models.BooleanField(default=False, verbose_name="Van öltöző/szekrény?")
    has_public_transport = models.BooleanField(default=True, verbose_name="BKV-val elérhető?")
    has_parking = models.BooleanField(default=False, verbose_name="Van parkoló?")
    has_toilet = models.BooleanField(default=False, verbose_name="Van WC?")
    is_dog_friendly = models.BooleanField(default=True, verbose_name="Kutyabarát?")

    WATER_CHOICES = [
        ('none', 'Nincs (Hozni kell)'),
        ('tap', 'Ingyenes ivókút'),
        ('paid', 'Fizetős büfé/bolt'),
    ]
    water_option = models.CharField(max_length=10, choices=WATER_CHOICES, default='none')

    # Térkép adatok
    lat = models.FloatField()
    lon = models.FloatField()
    zoom = models.IntegerField(default=12)

    def __str__(self):
        return self.name

    # --- Koordináták kinyerése a térképhez (Leaflet útvonalrajzoláshoz) ---
    def get_coordinates_list(self):
        """
        Visszaadja a GPX-ből a koordinátákat [[lat, lon], [lat, lon], ...] formátumban
        a Leaflet térkép számára.
        """
        if not self.gpx_file:
            return []

        try:
            # Fájl megnyitása olvasásra
            self.gpx_file.open()
            gpx = gpxpy.parse(self.gpx_file)

            points = []
            for track in gpx.tracks:
                for segment in track.segments:
                    for point in segment.points:
                        # A Leaflet [szélesség, hosszúság] párokat vár
                        points.append([point.latitude, point.longitude])

            self.gpx_file.close() # Fontos bezárni!
            return points
        except Exception as e:
            print(f"Hiba a GPX olvasásakor: {e}")
            return []

    # --- ÚJ FÜGGVÉNY: GPS pont kiszámolása távolság alapján (Live Trackerhez) ---
    def get_lat_lon_at_distance(self, target_meters):
        """
        Kiszámolja, hogy a GPX útvonalon hol van a 'target_meters' távolság.
        Visszaadja: {'lat': x, 'lon': y} vagy None
        """
        if not self.gpx_file:
            return None

        try:
            self.gpx_file.open()
            gpx = gpxpy.parse(self.gpx_file)
            self.gpx_file.seek(0) # Visszatekerjük az elejére

            total_dist = 0
            prev_point = None

            # Végigmegyünk a pontokon
            for track in gpx.tracks:
                for segment in track.segments:
                    for point in segment.points:
                        if prev_point:
                            # Távolság az előző ponttól (méterben)
                            dist = point.distance_2d(prev_point)
                            total_dist += dist

                            # Ha átléptük a cél távolságot, ez a mi pontunk!
                            if total_dist >= target_meters:
                                return {'lat': point.latitude, 'lon': point.longitude}

                        prev_point = point

            # Ha a futó többet nyomott, mint a pálya hossza, visszaadjuk az utolsó pontot
            if prev_point:
                 return {'lat': prev_point.latitude, 'lon': prev_point.longitude}

        except Exception as e:
            print(f"GPX hiba: {e}")
            return None
        return None

    # --- SAVE METÓDUS: KÉP + GPX LOGIKA EGYBEN ---
    def save(self, *args, **kwargs):
        # 1. KÉP FELDOLGOZÁSA
        if self.image:
            try:
                img = Image.open(self.image)
                if img.mode in ("RGBA", "P"):
                    img = img.convert("RGB")
                img.thumbnail((400, 400))
                thumb_io = BytesIO()
                img.save(thumb_io, format='JPEG', quality=85)
                thumb_filename = os.path.basename(self.image.name).split('.')[0] + '_thumb.jpg'
                if not self.image_thumbnail:
                     self.image_thumbnail.save(thumb_filename, ContentFile(thumb_io.getvalue()), save=False)
            except Exception as e:
                print(f"Thumbnail hiba: {e}")

        # 2. GPX FELDOLGOZÁSA
        if self.gpx_file:
            try:
                self.gpx_file.open() # Kinyitjuk olvasásra
                gpx = gpxpy.parse(self.gpx_file)

                # Hossz kiszámolása
                length_2d = gpx.length_2d()
                if length_2d > 0:
                    self.distance_km_per_lap = round(length_2d / 1000, 2)

                # Kezdőpont beállítása
                if self.lat == 0 or self.lon == 0:
                    # Először próbáljuk track-ként
                    if gpx.tracks and gpx.tracks[0].segments and gpx.tracks[0].segments[0].points:
                        start_pt = gpx.tracks[0].segments[0].points[0]
                        self.lat = start_pt.latitude
                        self.lon = start_pt.longitude
                    # Ha nincs track, próbáljuk route-ként
                    elif gpx.routes and gpx.routes[0].points:
                        start_pt = gpx.routes[0].points[0]
                        self.lat = start_pt.latitude
                        self.lon = start_pt.longitude

                # Visszatekerjük a fájlt mentés előtt
                self.gpx_file.seek(0)

            except Exception as e:
                print(f"GPX feldolgozási hiba: {e}")

        super().save(*args, **kwargs)

    def get_distance_from_lat_lon(self, runner_lat, runner_lon):
        """
        Map Matching: Megkeresi a GPX útvonalon a legközelebbi pontot,
        és visszaadja a starttól mért távolságot (float).
        """
        if not self.gpx_file:
            return 0.0  # Módosítva: 0 -> 0.0

        try:
            self.gpx_file.open()
            # Az import gpxpy maradhat itt is, vagy a fájl elején
            import gpxpy
            gpx = gpxpy.parse(self.gpx_file)
            self.gpx_file.seek(0)

            best_distance = 0.0
            min_diff = float('inf')

            current_track_dist = 0.0
            prev_point = None

            for track in gpx.tracks:
                for segment in track.segments:
                    for point in segment.points:
                        # 1. Pálya távolság növelése
                        if prev_point:
                            step = point.distance_2d(prev_point)
                            current_track_dist += step

                        # 2. Távolság mérése a futótól
                        dist_to_runner = point.distance_2d(gpxpy.gpx.GPXTrackPoint(runner_lat, runner_lon))

                        if dist_to_runner < min_diff:
                            min_diff = dist_to_runner
                            best_distance = current_track_dist

                        prev_point = point

            return float(best_distance) # Módosítva: int() helyett float()

        except Exception as e:
            print(f"Map matching hiba: {e}")
            return 0.0 # Módosítva: 0 -> 0.0


# --- LIVE RUN MODELL BŐVÍTÉSE ---
class LiveRun(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='live_run')
    track = models.ForeignKey(Track, on_delete=models.CASCADE)

    # Időzítés
    start_time = models.DateTimeField(null=True, blank=True) # Csak induláskor állítjuk be
    last_update = models.DateTimeField(auto_now=True)

    # Távolság és Célok
    current_distance = models.FloatField(default=0.0) # float a pontosabb számoláshoz
    target_laps = models.IntegerField(default=1)      # Hány körre terveztünk?

    # Telemetria (ÚJ MEZŐK)
    current_speed = models.FloatField(default=0.0)    # km/h
    current_pace = models.CharField(max_length=10, default="-:--") # p/km (pl. "5:30")
    progress_percent = models.FloatField(default=0.0) # 0-100%

    # Kör kezelés
    current_lap = models.IntegerField(default=0)      # 0 = Még nem indult el
    current_lap_start = models.DateTimeField(null=True, blank=True) # Mikor kezdte az aktuális kört

    # Naplózás (JSON stringként tároljuk a részidőket)
    lap_times_log = models.TextField(default="[]", blank=True)

    STATUS_CHOICES = [
        ('ready', 'Rajtra Kész'),  # ÚJ: Várja az első GPS jelet
        ('running', 'Fut'),
        ('paused', 'Megállt'),
        ('finished', 'Célbaért'),
    ]
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='ready')

    def __str__(self):
        return f"{self.user.username} - {self.status} ({self.current_distance:.1f}m)"

    def add_lap_log(self, lap_time_str):
        """Segédfüggvény köridő hozzáadásához a JSON mezőhöz"""
        try:
            logs = json.loads(self.lap_times_log or "[]")
            logs.append(lap_time_str)
            self.lap_times_log = json.dumps(logs)
        except:
            self.lap_times_log = json.dumps([lap_time_str])

class Result(models.Model):
    # ... (A Result modell változatlan maradhat)
    track = models.ForeignKey(Track, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    runner_name = models.CharField(max_length=100)
    laps_count = models.IntegerField(default=1)
    lap_times = models.CharField(max_length=500, default="")
    time = models.CharField(max_length=10)
    recorded_at = models.DateTimeField(auto_now_add=True)
    date = models.DateField(default=timezone.now)
    # --- ÚJ MEZŐK A BMI SZÁMÍTÁSHOZ ---
    runner_weight = models.FloatField(null=True, blank=True, verbose_name="Futó súlya (kg)")
    runner_height = models.IntegerField(null=True, blank=True, verbose_name="Futó magassága (cm)")

    class Meta:
        ordering = ['time']

    def __str__(self):
        return f"{self.runner_name} - {self.time} ({self.track.name})"

class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    birth_year = models.IntegerField(null=True, blank=True, verbose_name="Születési év")
    gender = models.CharField(
        max_length=10,
        choices=[('male', 'Férfi'), ('female', 'Nő'), ('other', 'Egyéb')],
        null=True, blank=True, verbose_name="Nem"
    )
    weight_kg = models.FloatField(null=True, blank=True, verbose_name="Testsúly (kg)")
    height_cm = models.IntegerField(null=True, blank=True, verbose_name="Magasság (cm)")

    def __str__(self):
        return f"{self.user.username} profilja"

    @property
    def bmi(self):
        """BMI számítás: kg / (m * m)"""
        if self.weight_kg and self.height_cm:
            height_m = self.height_cm / 100
            return round(self.weight_kg / (height_m ** 2), 1)
        return None

class TrackReview(models.Model):
    track = models.ForeignKey(Track, on_delete=models.CASCADE, related_name='reviews')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    rating = models.FloatField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        verbose_name="Értékelés (1-5)"
    )
    comment = models.TextField(blank=True, null=True, verbose_name="Szöveges vélemény")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at'] # Legfrissebb elöl

    def __str__(self):
        return f"{self.user.username} - {self.track.name} ({self.rating})"
