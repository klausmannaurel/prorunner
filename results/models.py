from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.core.validators import MinValueValidator, MaxValueValidator

# --- EZEK AZ ÚJ IMPORTOK KELLENEK A KÉPFELDOLGOZÁSHOZ ---
from PIL import Image
from io import BytesIO
from django.core.files.base import ContentFile
import os

class Track(models.Model):
    """
    Futópálya modell képpel, THUMBNAIL-LEL és tulajdonossal kiegészítve.
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

    # --- ÚJ MEZŐ: KICSI KÉP (Thumbnail) ---
    image_thumbnail = models.ImageField(upload_to='track_images/thumbs/', blank=True, null=True, verbose_name="Kicsi kép")

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

    # --- ITT TÖRTÉNIK A VARÁZSLAT: SAVE METÓDUS FELÜLÍRÁSA ---
    def save(self, *args, **kwargs):
        # Csak akkor generálunk, ha van nagy kép
        if self.image:
            # Megnyitjuk a nagy képet a PIL könyvtárral
            img = Image.open(self.image)

            # Ha szükséges, konvertáljuk RGB-be (pl. PNG esetén az átlátszóság miatt)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")

            # Átméretezzük (thumbnail metódus megtartja az arányokat!)
            # 400x400 pixel lesz a maximum méret (elég a kártyákhoz)
            img.thumbnail((400, 400))

            # Mentés memóriába (BytesIO)
            thumb_io = BytesIO()
            img.save(thumb_io, format='JPEG', quality=85)

            # Fájlnév generálása a thumbnailhez
            thumb_filename = os.path.basename(self.image.name).split('.')[0] + '_thumb.jpg'

            # Fontos: A save paraméterben False-t adunk meg, hogy ne kerüljünk végtelen ciklusba!
            # De mivel itt a save() elején vagyunk, és a mezőhöz rendeljük hozzá,
            # a Django FileField mechanizmusa kezeli.
            # A legjobb módszer: ellenőrizni, hogy változott-e, de egyszerűsítve:

            # Csak akkor mentjük el a thumbnailt, ha még nincs, vagy ha az image mező változott.
            # (Egyszerűsített megoldás: mindig legeneráljuk, ha mentés van és nincs thumbnail)
            if not self.image_thumbnail:
                 self.image_thumbnail.save(thumb_filename, ContentFile(thumb_io.getvalue()), save=False)

        super().save(*args, **kwargs)

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
