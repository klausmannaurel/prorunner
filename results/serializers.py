from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Track, Result, TrackReview

# --- TRACK SERIALIZER ---
class TrackSerializer(serializers.ModelSerializer):
    """
    Serializer a Track modellhez. Kezeli a képet, tulajdonost, értékeléseket ÉS MOST MÁR A GPX ADATOKAT IS.
    """
    surface_display = serializers.CharField(source='get_surface_type_display', read_only=True)
    created_by = serializers.StringRelatedField(read_only=True)
    image = serializers.ImageField(required=False, allow_null=True)

    # Értékelés mezők (az annotálásból jönnek)
    average_rating = serializers.FloatField(read_only=True)
    review_count = serializers.IntegerField(read_only=True)

    # --- ÚJ MEZŐK A GPX MIATT ---
    coordinates = serializers.SerializerMethodField()
    gpx_url = serializers.SerializerMethodField()

    class Meta:
        model = Track
        fields = '__all__'

    # --- ÚJ SEGÉDFÜGGVÉNYEK ---
    def get_coordinates(self, obj):
        # Ez hívja meg a models.py-ban írt get_coordinates_list() függvényt
        return obj.get_coordinates_list()

    def get_gpx_url(self, obj):
        # Visszaadja a fájl elérési útját, ha van
        if obj.gpx_file:
            return obj.gpx_file.url
        return None

# --- RESULT SERIALIZER ---
class ResultSerializer(serializers.ModelSerializer):
    """
    Serializer a Result modellhez.
    Kezeli a köridőket, dátumot és a jogosultságokat.
    """
    can_edit = serializers.SerializerMethodField()
    runner_id = serializers.ReadOnlyField(source='user.id')

    class Meta:
        model = Result
        fields = ('id', 'track', 'runner_name', 'time', 'laps_count', 'lap_times', 'date', 'runner_id', 'can_edit', 'runner_weight', 'runner_height')

    def get_can_edit(self, obj):
        request = self.context.get('request', None)
        if request and request.user.is_authenticated:
            if request.user.is_staff:
                return True
            if obj.user == request.user:
                return True
        return False

# --- USER SERIALIZER ---
class UserSerializer(serializers.ModelSerializer):
    """
    Serializer a bejelentkezett felhasználó adataihoz.
    """
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('username', 'email', 'id', 'is_staff', 'full_name')

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username

# --- TRACK REVIEW SERIALIZER ---
class TrackReviewSerializer(serializers.ModelSerializer):
    """
    Serializer a véleményekhez és csillagozáshoz.
    """
    username = serializers.ReadOnlyField(source='user.username') # Hogy lássuk ki írta

    class Meta:
        model = TrackReview
        fields = ['id', 'track', 'user', 'username', 'rating', 'comment', 'created_at']
        read_only_fields = ['user', 'created_at']
