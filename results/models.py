from django.db import models

from django.contrib.auth.models import User

from django.utils import timezone



class Track(models.Model):

    """

    Futópálya modell képpel és tulajdonossal kiegészítve.

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



    # --- ÚJ: TULAJDONOS (Ki hozta létre?) ---

    # Ha törlődik a felhasználó, a pálya megmarad, de a mező üres lesz (SET_NULL)

    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='tracks', verbose_name="Létrehozó")



    # --- MÓDOSÍTOTT: VALÓDI KÉP FELTÖLTÉS ---

    # A régi img_url helyett most ImageField van.

    image = models.ImageField(upload_to='track_images/', blank=True, null=True, verbose_name="Pálya fotó")



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



    # (A régi img_url mezőt töröljük, mert már az 'image' mezőt használjuk)



    def __str__(self):

        return self.name



class Result(models.Model):

    """

    Eredmények (Ez változatlan maradt)

    """

    track = models.ForeignKey(Track, on_delete=models.CASCADE)

    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    runner_name = models.CharField(max_length=100)

    laps_count = models.IntegerField(default=1)

    lap_times = models.CharField(max_length=500, default="")

    time = models.CharField(max_length=10)

    recorded_at = models.DateTimeField(auto_now_add=True)

    date = models.DateField(default=timezone.now) # Vagy null=True, ha a régieknél nem gond



    class Meta:

        ordering = ['time']



    def __str__(self):

        return f"{self.runner_name} - {self.time} ({self.track.name})"