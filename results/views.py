from django.contrib.auth.decorators import login_required # <--- Ezt tedd a fájl legtetejére az importokhoz!
from django.shortcuts import render
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAuthenticated
from django.views.decorators.csrf import ensure_csrf_cookie
from .models import Track, Result
from .serializers import TrackSerializer, ResultSerializer

# --- 1. HTML OLDALAK MEGJELENÍTÉSE ---

# Ezek kellenek ahhoz, hogy a urls.py-ban beállított útvonalak (home, dashboard, tracks) működjenek.



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





# --- 2. JOGOSULTSÁGOK (Permissions) ---



class IsOwnerOrReadOnly(permissions.BasePermission):

    """

    Egyedi jogosultság: csak az objektum létrehozója szerkesztheti/törölheti azt.

    Olvasni (GET) bárki tudja.

    """

    def has_object_permission(self, request, view, obj):

        # Olvasási jog (GET, HEAD, OPTIONS) mindenkinek van

        if request.method in permissions.SAFE_METHODS:

            return True



        # Írási jog (PUT, DELETE):

        # 1. Ha a user a tulajdonos

        # 2. VAGY ha a user admin (is_staff)

        return obj.created_by == request.user or request.user.is_staff





# --- 3. API: PÁLYÁK KEZELÉSE ---



class TrackViewSet(viewsets.ModelViewSet):

    """

    Kezeli a pályák lekérdezését (GET) ÉS létrehozását (POST).

    """

    queryset = Track.objects.all()

    serializer_class = TrackSerializer

    

    # Jogosultságok:

    # 1. Olvasni bárki tud (IsAuthenticatedOrReadOnly)

    # 2. Módosítani csak a tulajdonos (IsOwnerOrReadOnly)

    permission_classes = [IsAuthenticatedOrReadOnly, IsOwnerOrReadOnly]



    def perform_create(self, serializer):

        """

        Mentéskor automatikusan beállítjuk a tulajdonost a jelenlegi felhasználóra.

        """

        if self.request.user.is_authenticated:

            serializer.save(created_by=self.request.user)

        else:

            serializer.save()





# --- 4. API: EREDMÉNYEK KEZELÉSE ---



@api_view(['GET'])

def result_list(request, track_id):

    """

    Visszaadja egy adott pálya eredményeit idő szerint rendezve.

    URL: /api/results/<track_id>/

    """

    try:

        results = Result.objects.filter(track_id=track_id).order_by('time')

        serializer = ResultSerializer(results, many=True)

        return Response(serializer.data)

    except Exception as e:

        return Response({"message": f"Hiba: {str(e)}"}, status=400)



@api_view(['POST'])

@permission_classes([IsAuthenticated])

def result_save(request):

    """

    Új eredmény mentése. Csak bejelentkezett felhasználóknak.

    URL: /api/results/save/

    """

    data = request.data.copy()



    # Frontend track_id -> Backend track konverzió

    if 'track_id' in data:

        data['track'] = data.pop('track_id')



    # Név kezelése: Admin megadhat nevet, sima usernek a saját neve kerül be

    if request.user.is_staff:

        if not data.get('runner_name'):

             data['runner_name'] = request.user.get_full_name() or request.user.username

    else:

        data['runner_name'] = request.user.get_full_name() or request.user.username



    serializer = ResultSerializer(data=data)



    if serializer.is_valid():

        try:

            # Elmentjük az eredményt, és hozzárendeljük a bejelentkezett user-t

            serializer.save(user=request.user)

            return Response({"message": "Sikeres mentés"}, status=status.HTTP_201_CREATED)

        except Exception as e:

             return Response({"message": f"Adatbázis hiba: {str(e)}"}, status=400)



    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)



@api_view(['GET', 'PUT', 'DELETE'])

@permission_classes([IsAuthenticated])

def result_detail(request, pk):

    """

    Egy konkrét eredmény lekérdezése, módosítása vagy törlése.

    URL: /api/results/<pk>/

    """

    try:

        result = Result.objects.get(pk=pk)

    except Result.DoesNotExist:

        return Response({'message': 'Az eredmény nem található.'}, status=status.HTTP_404_NOT_FOUND)



    # JOGOSULTSÁG ELLENŐRZÉS:

    # 1. Admin mindent törölhet/szerkeszthet

    # 2. A tulajdonos (aki létrehozta) törölheti/szerkesztheti a sajátját

    is_owner = (result.user == request.user)



    if not (request.user.is_staff or is_owner):

        return Response({'message': 'Nincs jogosultságod ehhez a művelethez!'}, status=status.HTTP_403_FORBIDDEN)



    # --- GET: Lekérdezés ---

    if request.method == 'GET':

        serializer = ResultSerializer(result)

        return Response(serializer.data)



    # --- PUT: Szerkesztés ---

    elif request.method == 'PUT':

        serializer = ResultSerializer(result, data=request.data, partial=True)

        if serializer.is_valid():

            serializer.save()

            return Response(serializer.data)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)



    # --- DELETE: Törlés ---

    elif request.method == 'DELETE':

        result.delete()

        return Response({'message': 'Sikeres törlés.'}, status=status.HTTP_204_NO_CONTENT)





# --- 5. API: AUTHENTIKÁCIÓ ---



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



    if not username or not password or not full_name:

        return Response({"message": "Minden mező kitöltése kötelező!"}, status=400)



    if User.objects.filter(username=username).exists():

        return Response({"message": "Ez a felhasználónév már foglalt."}, status=400)



    try:

        user = User.objects.create_user(username=username, password=password)

        user.first_name = full_name

        user.save()

        return Response({"message": "Sikeres regisztráció! Most már bejelentkezhetsz."}, status=201)

    except Exception as e:

        return Response({"message": "Hiba történt a regisztráció során."}, status=500)

@login_required(login_url='home') # Ha nincs belépve, visszaküldi a főoldalra
def my_results(request):
    """
    A bejelentkezett felhasználó saját eredményeinek listázása.
    """
    # Lekérjük a user eredményeit, dátum szerint csökkenő sorrendben (legújabb elöl)
    # A 'select_related' segít, hogy a pálya adatait (név, hossz) is hatékonyan elérjük
    results = Result.objects.filter(user=request.user).select_related('track').order_by('-date', '-recorded_at')
    
    return render(request, 'my_results.html', {'results': results})
