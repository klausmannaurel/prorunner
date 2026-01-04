
from django.contrib.auth.decorators import login_required
from django.shortcuts import render, get_object_or_404
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated, AllowAny
from django.views.decorators.csrf import ensure_csrf_cookie
from .models import LiveRun
from django.db.models import Avg, Count
from django.utils import timezone
from .models import Track, Result, Profile, TrackReview
from .serializers import TrackSerializer, ResultSerializer, TrackReviewSerializer

# --- 1. HTML OLDALAK MEGJELENÍTÉSE ---

def home(request):
    """A Landing Page (index.html) renderelése."""
    return render(request, 'index.html')

def dashboard(request):
    """A Térképes Dashboard (dashboard.html) renderelése."""
    return render(request, 'dashboard.html')

def tracks(request):
    """A Pályák lista (tracks.html) renderelése."""
    return render(request, 'tracks.html')

def stopwatch(request):
    """A Stopper oldal renderelése."""
    return render(request, 'stopwatch.html')

def calculate_pace_and_speed(distance_delta_m, time_delta_sec):
    """
    Kiszámolja a sebességet (km/h) és a tempót (min/km).
    """
    if time_delta_sec <= 0 or distance_delta_m <= 0:
        return 0.0, "-:--"

    # Sebesség: m/s -> km/h
    speed_mps = distance_delta_m / time_delta_sec
    speed_kmh = speed_mps * 3.6

    # Pace: min/km
    # 1000m / (m/s) = másodperc/km
    seconds_per_km = 1000 / speed_mps
    pace_min = int(seconds_per_km // 60)
    pace_sec = int(seconds_per_km % 60)
    pace_str = f"{pace_min}:{pace_sec:02d}"

    return round(speed_kmh, 2), pace_str

# --- 2. JOGOSULTSÁGOK (Permissions) ---

class IsOwnerOrReadOnly(permissions.BasePermission):
    """
    Egyedi jogosultság: csak az objektum létrehozója szerkesztheti/törölheti azt.
    Olvasni (GET) bárki tudja.
    """
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.created_by == request.user or request.user.is_staff

# --- 3. API: PÁLYÁK KEZELÉSE ---

class TrackViewSet(viewsets.ModelViewSet):
    """
    Kezeli a pályák lekérdezését (GET) ÉS létrehozását (POST).
    """
    # Itt adjuk hozzá az átlagot és a darabszámot a lekérdezéshez!
    queryset = Track.objects.annotate(
        average_rating=Avg('reviews__rating'),
        review_count=Count('reviews')
    ).order_by('name')

    serializer_class = TrackSerializer
    permission_classes = [IsAuthenticatedOrReadOnly, IsOwnerOrReadOnly]

    def perform_create(self, serializer):
        if self.request.user.is_authenticated:
            serializer.save(created_by=self.request.user)
        else:
            serializer.save()

# --- 4. API: ÉRTÉKELÉSEK KEZELÉSE ---

# --- LIVE TRACKER APIK ---


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def set_run_ready(request):
    """
    1. LÉPÉS: A felhasználó kiválasztja a pályát és a köröket.
    Létrehozunk egy 'ready' státuszú futást.
    """
    track_id = request.data.get('track_id')
    target_laps = int(request.data.get('target_laps', 1))

    # Töröljük a korábbi beragadt futást
    LiveRun.objects.filter(user=request.user).delete()

    track = get_object_or_404(Track, id=track_id)

    LiveRun.objects.create(
        user=request.user,
        track=track,
        target_laps=target_laps,
        current_distance=0,
        status='ready',
        lap_times_log="[]"
    )

    return Response({"status": "ready", "message": "Várakozás a rajtvonalnál (GPS jelre vár)..."})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_live_status(request):
    """
    A KLIENS (Böngésző) ezt hívogatja (Polling), hogy frissítse a kijelzőt.
    Az időt NEM a böngésző méri, hanem a szerver start_time alapján számoljuk!
    """
    try:
        run = LiveRun.objects.get(user=request.user)

        # Eltelt idő számítása szerver oldalon
        elapsed_seconds = 0
        if run.start_time and run.status in ['running', 'finished']:
            # Ha fut, akkor most - start. Ha kész, akkor last_update - start.
            end_time = run.last_update if run.status == 'finished' else timezone.now()
            delta = end_time - run.start_time
            elapsed_seconds = delta.total_seconds()

        return Response({
            "status": run.status,
            "track_name": run.track.name,
            "current_distance": run.current_distance,
            "total_distance": run.track.distance_km_per_lap * 1000 * run.target_laps,
            "current_lap": run.current_lap,
            "target_laps": run.target_laps,
            "speed": run.current_speed,
            "pace": run.current_pace,
            "elapsed_seconds": elapsed_seconds, # A kliens ebből formázza az órát (HH:MM:SS)
            "progress": run.progress_percent
        })
    except LiveRun.DoesNotExist:
        return Response({"status": "idle"}, status=200)


@api_view(['POST'])
@permission_classes([AllowAny]) # Az óra lehet, hogy nem küld Django session cookie-t, ezért username alapú
def update_gps_position(request):
    """
    A "SMART BRAIN". Az óra (vagy telefon) ide küldi a nyers koordinátát.
    A szerver dönt: Elindítja az órát? Számol sebességet? Célba ért?
    Payload: { lat: 47.123, lon: 19.123, username: 'user1' }
    """
    lat = request.data.get('lat')
    lon = request.data.get('lon')
    username = request.data.get('username')

    if not lat or not lon or not username:
        return Response({"error": "Hiányzó adatok"}, status=400)

    try:
        user = User.objects.get(username=username)
        run = LiveRun.objects.get(user=user)
        track = run.track

        # Ha már célbaért, nem csinálunk semmit
        if run.status == 'finished':
             return Response({"status": "finished"})

        now = timezone.now()

        # -------------------------------------------------
        # 1. MAP MATCHING: Hol vagyunk a pályán? (Méterben)
        # -------------------------------------------------
        matched_distance = track.get_distance_from_lat_lon(float(lat), float(lon))

        # Pálya hossza (1 kör) méterben
        lap_len_m = track.distance_km_per_lap * 1000
        total_race_len_m = lap_len_m * run.target_laps

        # Jelenlegi teljes táv (Körök + aktuális pozíció)
        # Megjegyzés: A get_distance_from_lat_lon csak a körön belüli pozíciót adja (0 - lap_len)
        # Ki kell találnunk, hogy új körbe léptünk-e.

        # Egyszerűsített logika a prototípushoz:
        # A távolságot abszolút értékben kezeljük. Ha az óra küldi a "kör" jelzést, akkor növeljük.
        # DE a prompt szerint "Hands-free" kell.
        # TRÜKK: Ha az előző mérés 900m volt, a mostani meg 50m, akkor kört váltottunk!

        last_lap_dist = run.current_distance % lap_len_m # Hol jártunk körön belül legutóbb

        # Körváltás detektálása (Ha nagyot ugrott hátrafelé a táv, pl 900m -> 10m)
        if run.status == 'running' and last_lap_dist > (lap_len_m * 0.9) and matched_distance < (lap_len_m * 0.1):
            run.current_lap += 1
            # Részidő mentése logba (Opcionális)

        # Tényleges kumulatív távolság számítása
        # (current_lap - 1) * körhossz + matched_distance
        # Figyelem: A current_lap 0-ról indul (ready), 1-re vált startnál.
        current_lap_calc = max(1, run.current_lap)
        real_total_dist = ((current_lap_calc - 1) * lap_len_m) + matched_distance

        # -------------------------------------------------
        # 2. ÁLLAPOTGÉP (State Machine)
        # -------------------------------------------------

        # A) RAJT (Ready -> Running)
        if run.status == 'ready':
            # Ha a felhasználó a pálya elején van (pl. < 50m) VAGY ez az első jel
            run.status = 'running'
            run.start_time = now
            run.current_lap = 1
            run.current_lap_start = now
            run.current_distance = matched_distance
            run.save()
            return Response({"status": "started", "msg": "Rajt érzékelve!"})

        # B) FUTÁS (Running -> Telemetria)
        elif run.status == 'running':
            # Fizika számítása
            time_diff = (now - run.last_update).total_seconds()
            dist_diff = real_total_dist - run.current_distance

            # Csak akkor számolunk, ha előre haladt és telt el idő
            if time_diff > 0 and dist_diff > 0:
                speed, pace = calculate_pace_and_speed(dist_diff, time_diff)
                run.current_speed = speed
                run.current_pace = pace

            # Adatok frissítése
            run.current_distance = real_total_dist

            # Progress %
            if total_race_len_m > 0:
                run.progress_percent = min(100.0, (real_total_dist / total_race_len_m) * 100)

            # C) CÉLBAÉRÉS (Finish Check)
            # Ha elértük a teljes táv 95%-át (GPS pontatlanság miatt hagyunk ráhagyást)
            # ÉS az utolsó körben vagyunk.
            if real_total_dist >= (total_race_len_m * 0.98):
                run.status = 'finished'
                run.current_distance = total_race_len_m # Kerekítjük a végére
                run.progress_percent = 100.0
                run.save()
                return Response({"status": "finished", "msg": "Gratulálok, célba értél!"})

            run.save()
            return Response({"status": "running", "dist": real_total_dist, "pace": run.current_pace})

    except User.DoesNotExist:
        return Response({"error": "User not found"}, status=404)
    except Exception as e:
        return Response({"error": str(e)}, status=500)

    return Response({"status": "ok"})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def start_live_run(request):
    """Futás indítása VAGY Folytatása"""
    track_id = request.data.get('track_id')

    # Megpróbáljuk lekérni, vagy létrehozni, ha nincs
    # Így ha véletlenül újratöltöd az oldalt, nem veszik el a futásod
    run, created = LiveRun.objects.get_or_create(
        user=request.user,
        defaults={
            'track_id': track_id,
            'current_distance': 0,
            'status': 'running'
        }
    )

    # Ha már létezett (tehát folytatás), és nem 'finished', akkor állítsuk 'running'-ra
    if not created:
        if run.status != 'finished':
            run.status = 'running'
            run.save()

    return Response({"status": "started", "is_resumed": not created})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def pause_live_run(request):
    """Szünet (Stopper Stop gomb) - NEM TÖRLI AZ ADATOT!"""
    try:
        run = LiveRun.objects.get(user=request.user)
        # Csak akkor állítjuk megálltra, ha nem végzett
        if run.status != 'finished':
            run.status = 'paused'
            run.save()
        return Response({"status": "paused"})
    except LiveRun.DoesNotExist:
        return Response({"status": "no_run"})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_live_distance(request):
    """Távolság frissítése és Célbaérés figyelése"""
    try:
        distance = int(request.data.get('distance'))
        run = LiveRun.objects.get(user=request.user)
        run.current_distance = distance

        # Pálya hossza méterben
        track_len_m = run.track.distance_km_per_lap * 1000

        # Ha elértük vagy túlléptük a hosszt -> FINISHED
        if distance >= track_len_m:
            run.status = 'finished'
        else:
            # Ha futás közben nyomkodja a gombot, és 'paused' volt, váltson vissza 'running'-ra
            if run.status == 'paused':
                run.status = 'running'

        run.save()
        return Response({"status": "updated", "run_status": run.status})
    except LiveRun.DoesNotExist:
        return Response({"error": "Nincs futás"}, status=404)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def stop_live_run(request):
    """Végleges törlés (Stopper Reset gomb)"""
    LiveRun.objects.filter(user=request.user).delete()
    return Response({"status": "stopped"})

@api_view(['GET'])
def get_active_runners(request):
    """Dashboardnak: Ki fut éppen, hol és milyen státuszban?"""
    # Az elmúlt 1 órában aktív futások (hogy a 'finished' is látszódjon egy darabig)
    cutoff = timezone.now() - timezone.timedelta(hours=1)
    runs = LiveRun.objects.filter(last_update__gte=cutoff)

    data = []
    for run in runs:
        coords = run.track.get_lat_lon_at_distance(run.current_distance)
        data.append({
            'full_name': run.user.get_full_name() or run.user.username,
            'track_id': run.track.id,
            'track_name': run.track.name,
            'distance': run.current_distance,
            'position': coords,
            'status': run.status # Fontos: ezt is küldjük a színezéshez!
        })
    return Response(data)

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticatedOrReadOnly])
def track_reviews(request, track_id):
    """
    GET: Visszaadja a pálya értékeléseit + átlagot + darabszámot.
    POST: Új értékelés mentése (Napi 1 limit/user/pálya).
    """

    # 1. GET: Listázás és Statisztika
    if request.method == 'GET':
        reviews = TrackReview.objects.filter(track_id=track_id)
        serializer = TrackReviewSerializer(reviews, many=True)

        # Statisztikák számolása
        stats = reviews.aggregate(Avg('rating'), Count('id'))
        average = stats['rating__avg'] or 0
        count = stats['id__count'] or 0

        return Response({
            'reviews': serializer.data,
            'average_rating': round(average, 1),
            'rating_count': count
        })

    # 2. POST: Új vélemény mentése
    elif request.method == 'POST':
        if not request.user.is_authenticated:
            return Response({"message": "Jelentkezz be az értékeléshez!"}, status=403)

        # --- KORLÁTOZÁS: Napi 1 értékelés ---
        today = timezone.now().date()
        existing_review = TrackReview.objects.filter(
            user=request.user,
            track_id=track_id,
            created_at__date=today
        ).exists()

        if existing_review:
            return Response(
                {"message": "Ma már értékelted ezt a pályát! Holnap újra próbálhatod."},
                status=400
            )

        # Adatok mentése
        data = request.data.copy()
        data['track'] = track_id # A track ID-t az URL-ből vesszük

        serializer = TrackReviewSerializer(data=data)
        if serializer.is_valid():
            serializer.save(user=request.user)
            return Response(serializer.data, status=201)

        return Response(serializer.errors, status=400)

# --- 5. API: EREDMÉNYEK KEZELÉSE ---

@api_view(['GET'])
def result_list(request, track_id):
    try:
        results = Result.objects.filter(track_id=track_id).order_by('time')
        serializer = ResultSerializer(results, many=True)
        return Response(serializer.data)
    except Exception as e:
        return Response({"message": f"Hiba: {str(e)}"}, status=400)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def result_save(request):
    data = request.data.copy()
    if 'track_id' in data:
        data['track'] = data.pop('track_id')

    if request.user.is_staff:
        if not data.get('runner_name'):
             data['runner_name'] = request.user.get_full_name() or request.user.username
    else:
        data['runner_name'] = request.user.get_full_name() or request.user.username

    serializer = ResultSerializer(data=data)
    if serializer.is_valid():
        try:
            serializer.save(user=request.user)
            return Response({"message": "Sikeres mentés"}, status=status.HTTP_201_CREATED)
        except Exception as e:
             return Response({"message": f"Adatbázis hiba: {str(e)}"}, status=400)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def result_detail(request, pk):
    try:
        result = Result.objects.get(pk=pk)
    except Result.DoesNotExist:
        return Response({'message': 'Az eredmény nem található.'}, status=status.HTTP_404_NOT_FOUND)

    is_owner = (result.user == request.user)
    if not (request.user.is_staff or is_owner):
        return Response({'message': 'Nincs jogosultságod ehhez a művelethez!'}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'GET':
        serializer = ResultSerializer(result)
        return Response(serializer.data)
    elif request.method == 'PUT':
        serializer = ResultSerializer(result, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    elif request.method == 'DELETE':
        result.delete()
        return Response({'message': 'Sikeres törlés.'}, status=status.HTTP_204_NO_CONTENT)

# --- 6. API: AUTHENTIKÁCIÓ ---

@api_view(['POST'])
def api_login(request):
    username = request.data.get('username')
    password = request.data.get('password')
    user = authenticate(request, username=username, password=password)
    if user is not None:
        login(request, user)
        return Response({
            "message": "Sikeres bejelentkezés",
            "username": user.username,
            "full_name": user.get_full_name() or user.username,
            "is_staff": user.is_staff
        })
    else:
        return Response({"message": "Hibás felhasználónév vagy jelszó"}, status=400)

@api_view(['POST'])
def api_logout(request):
    logout(request)
    return Response({"message": "Sikeres kijelentkezés"})

@api_view(['GET'])
def current_user(request):
    if request.user.is_authenticated:
        return Response({
            "is_authenticated": True,
            "username": request.user.username,
            "full_name": request.user.get_full_name() or request.user.username,
            "is_staff": request.user.is_staff,
            "id": request.user.id
        })
    return Response({"is_authenticated": False})

@api_view(['POST'])
def api_register(request):
    username = request.data.get('username')
    password = request.data.get('password')
    full_name = request.data.get('full_name')
    birth_year = request.data.get('birth_year')
    gender = request.data.get('gender')
    weight = request.data.get('weight')
    height = request.data.get('height')

    if not username or not password or not full_name:
        return Response({"message": "A felhasználónév, jelszó és név kötelező!"}, status=400)
    if User.objects.filter(username=username).exists():
        return Response({"message": "Ez a felhasználónév már foglalt."}, status=400)
    try:
        user = User.objects.create_user(username=username, password=password)
        user.first_name = full_name
        user.save()
        Profile.objects.create(
            user=user,
            birth_year=int(birth_year) if birth_year else None,
            gender=gender if gender else None,
            weight_kg=float(weight) if weight else None,
            height_cm=int(height) if height else None
        )
        return Response({"message": "Sikeres regisztráció! Most már bejelentkezhetsz."}, status=201)
    except Exception as e:
        print(f"Regisztrációs hiba: {e}")
        return Response({"message": "Hiba történt a regisztráció során."}, status=500)

@api_view(['POST'])
@permission_classes([AllowAny]) # Bárki hívhatja (óra miatt kell)
def update_gps_position(request):
    """
    Az Apple Watch ide küldi a {lat: ..., lon: ..., username: ...} adatot.
    """
    lat = request.data.get('lat')
    lon = request.data.get('lon')
    username = request.data.get('username') # Ezt is várjuk az órától!

    if lat is None or lon is None or username is None:
        return Response({"error": "Hiányzó adatok (lat, lon vagy username)"}, status=400)

    try:
        # 1. Megkeressük a felhasználót név alapján
        user = User.objects.get(username=username)

        # 2. Megkeressük az aktív futását
        run = LiveRun.objects.get(user=user)

        # 3. Ha már célbaért, ne frissítsünk
        if run.status == 'finished':
             return Response({"status": "finished", "message": "A futás már véget ért."})

        # 4. Pálya távolság kiszámolása a koordinátából (Map Matching)
        matched_distance = run.track.get_distance_from_lat_lon(float(lat), float(lon))

        # 5. Frissítés
        run.current_distance = matched_distance
        run.status = 'running' # Visszaváltunk futásra

        # Célbaérés vizsgálata (ha 95%-nál jár, tekintsük késznek a GPS pontatlanság miatt)
        track_len_m = run.track.distance_km_per_lap * 1000
        if matched_distance >= track_len_m * 0.95:
             run.status = 'finished'

        run.save()

        return Response({
            "status": "updated",
            "distance": matched_distance
        })

    except User.DoesNotExist:
        return Response({"error": "Hibás felhasználónév"}, status=404)
    except LiveRun.DoesNotExist:
        return Response({"error": "Nincs aktív futásod. Indítsd el előbb a weboldalon!"}, status=404)
    except Exception as e:
        return Response({"error": str(e)}, status=500)

@login_required(login_url='home')
def my_results(request):
    results = Result.objects.filter(user=request.user).select_related('track').order_by('-date', '-recorded_at')
    return render(request, 'my_results.html', {'results': results})

@login_required
def runner_results(request, runner_name):
    if not request.user.is_staff:
        return render(request, 'index.html')
    results = Result.objects.filter(runner_name=runner_name).select_related('track').order_by('-date', '-recorded_at')
    context = {
        'results': results,
        'page_title': f"{runner_name} eredményei",
        'is_admin_view': True
    }
    return render(request, 'my_results.html', context)
