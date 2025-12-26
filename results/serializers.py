from rest_framework import serializers

from .models import Track, Result

from django.contrib.auth.models import User



# --- TRACK SERIALIZER (Változatlan, de kell a működéshez) ---

class TrackSerializer(serializers.ModelSerializer):

    """

    Serializer a Track modellhez. Kezeli a képet és a tulajdonost is.

    """

    surface_display = serializers.CharField(source='get_surface_type_display', read_only=True)

    created_by = serializers.StringRelatedField(read_only=True)

    image = serializers.ImageField(required=False, allow_null=True)



    class Meta:

        model = Track

        fields = '__all__'



# --- RESULT SERIALIZER (EZT BŐVÍTETTÜK!) ---

class ResultSerializer(serializers.ModelSerializer):

    """

    Serializer a Result modellhez.

    Kezeli a köridőket, dátumot és a jogosultságokat.

    """

    # Ez a mező megmondja a Frontendnek, hogy a lekérdező user szerkesztheti-e ezt az eredményt

    can_edit = serializers.SerializerMethodField()

    # A futó User ID-ja (ha van), hogy tudjuk azonosítani

    runner_id = serializers.ReadOnlyField(source='user.id')



    class Meta:

        model = Result

        # FONTOS: Itt kell felsorolni mindent, amit a JavaScript használ!

        # - id: kell a törléshez/szerkesztéshez

        # - date: az új dátum mező

        # - can_edit: a gombok megjelenítéséhez

        fields = ('id', 'track', 'runner_name', 'time', 'laps_count', 'lap_times', 'date', 'runner_id', 'can_edit')



    def get_can_edit(self, obj):

        """

        Dinamikusan eldönti, hogy a jelenlegi felhasználó (request.user)

        jogosult-e szerkeszteni ezt az eredményt.

        """

        request = self.context.get('request', None)

        if request and request.user.is_authenticated:

            # Admin mindig szerkeszthet

            if request.user.is_staff:

                return True

            # A saját eredményét mindenki szerkesztheti

            if obj.user == request.user:

                return True

        return False



# --- USER SERIALIZER (Kicsit okosítva) ---

class UserSerializer(serializers.ModelSerializer):

    """

    Serializer a bejelentkezett felhasználó adataihoz.

    """

    full_name = serializers.SerializerMethodField()



    class Meta:

        model = User

        fields = ('username', 'email', 'id', 'is_staff', 'full_name')



    def get_full_name(self, obj):

        # Visszaadja a teljes nevet, vagy ha nincs megadva, akkor a felhasználónevet

        return obj.get_full_name() or obj.username