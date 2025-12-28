
document.addEventListener('DOMContentLoaded', async () => {
    // Várjuk meg a felhasználót
    await loadCurrentUser();
    // Várjuk meg a pályákat, és UTÁNA inicializáljuk az Isotope-ot
    await loadTracks();

    // Csillagozó rendszer inicializálása
    initStarRating();
});

let allTracksData = [];
let $grid; // Itt tároljuk majd az Isotope példányt
let mapInstance = null; // Globális változó a térképnek
let mapMarker = null;

// FONTOS: Itt TÖRÖLTÜK a 'let currentUser = null' sort,
// mert a script.js már létrehozta globálisan!

// --- FELHASZNÁLÓ BETÖLTÉSE ---
async function loadCurrentUser() {
    try {
        const response = await fetch('/api/whoami/');
        const userData = await response.json();

        if (userData.username) {
            // A globális (window) változót frissítjük
            window.currentUser = userData;
        }
    } catch (error) {
        console.error('Hiba a felhasználó betöltésekor:', error);
    }
}

// --- PÁLYÁK BETÖLTÉSE ÉS ISOTOPE INDÍTÁSA ---
async function loadTracks() {
    const gridEl = document.getElementById('tracks-grid');

    try {
        const response = await fetch('/api/tracks/');
        allTracksData = await response.json();

        if ($grid) {
            $grid.isotope('destroy');
        }

        gridEl.innerHTML = '';

        allTracksData.forEach(track => {
            const card = createTrackCard(track);
            gridEl.appendChild(card);
        });

        // --- ISOTOPE INICIALIZÁLÁSA ---
        $grid = $('#tracks-grid').isotope({
            itemSelector: '.card-wrapper',
            layoutMode: 'fitRows',
            transitionDuration: '0.6s'
        });

        setupFilters();
        setupEditListeners();

    } catch (error) {
        console.error('Hiba:', error);
        gridEl.innerHTML = '<div style="text-align:center; width:100%; color:red;">Hiba a pályák betöltésekor.</div>';
    }
}

// --- KÁRTYA GENERÁLÁS ---
function createTrackCard(track) {
    // A globális változót olvassuk ki
    const user = window.currentUser;

    const isOwner = user && track.created_by === user.username;
    const isAdmin = user && (user.is_staff === true);
    const canEditOrDelete = isOwner || isAdmin;

    const fallbackUrl = 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80';
    const imgUrl = track.image_thumbnail ? track.image_thumbnail : (track.image ? track.image : fallbackUrl);

    const div = document.createElement('div');
    div.className = 'card-wrapper';

    // Osztályok hozzáadása a szűréshez
    const surface = (track.surface_type || "").toLowerCase();
    if (surface.includes('rekort') || surface.includes('gumi')) div.classList.add('rekortan');
    else if (surface.includes('beton') || surface.includes('aszfalt')) div.classList.add('concrete');

    if (track.is_free) div.classList.add('free');
    if (track.has_lighting) div.classList.add('lighting');
    if (track.is_dog_friendly) div.classList.add('dog');

    // --- VÍZ LOGIKA ---
    let waterHtml = '';
    if (track.water_option === 'tap') {
        waterHtml = `<div class="amenity-box active"><i class="fas fa-faucet"></i><span>Ivókút</span></div>`;
    } else if (track.water_option === 'paid') {
        waterHtml = `<div class="amenity-box active"><i class="fas fa-shop"></i><span>Büfé</span></div>`;
    }

    div.innerHTML = `
        <div class="track-card">
            <div class="image-container">
                <img src="${imgUrl}" alt="${track.name}" class="card-image" onerror="this.onerror=null; this.src='${fallbackUrl}';">

                <div class="badges">
                    </div>
            </div>

            <h2 class="card-title">${track.name}</h2>

            <div class="details-row">
                <span class="detail-item"><i class="fas fa-route"></i> ${track.distance_km_per_lap} km</span>
                <span class="detail-item"><i class="fas fa-layer-group"></i> ${track.surface_type || 'Egyéb'}</span>
            </div>

            <div class="amenities">
                 ${track.is_free ? `<div class="amenity-box active"><i class="fas fa-wallet"></i><span>Ingyenes</span></div>` : ''}

                 ${track.has_lighting ? `<div class="amenity-box active"><i class="fas fa-lightbulb"></i><span>Fény</span></div>` : ''}
                 ${track.has_lockers ? `<div class="amenity-box active"><i class="fas fa-lock"></i><span>Öltöző</span></div>` : ''}
                 ${track.has_parking ? `<div class="amenity-box active"><i class="fas fa-square-parking"></i><span>Parkoló</span></div>` : ''}
                 ${track.has_shower ? `<div class="amenity-box active"><i class="fas fa-shower"></i><span>Zuhany</span></div>` : ''}
                 ${track.is_dog_friendly ? `<div class="amenity-box active"><i class="fas fa-dog"></i><span>Kutyás</span></div>` : ''}

                 ${track.has_toilet ? `<div class="amenity-box active"><i class="fas fa-restroom"></i><span>WC</span></div>` : ''}
                 ${track.has_public_transport ? `<div class="amenity-box active"><i class="fas fa-bus"></i><span>BKV</span></div>` : ''}
                 ${track.is_24_7 ? `<div class="amenity-box active"><i class="fas fa-clock"></i><span>0-24</span></div>` : ''}

                 ${waterHtml}
            </div>

            <div class="action-bar">
                ${canEditOrDelete ? `
                    <button class="btn btn-icon btn-edit-track" data-track-id="${track.id}"><i class="fas fa-pen"></i></button>
                    <button class="btn btn-icon del btn-delete-track" data-track-id="${track.id}"><i class="fas fa-trash"></i></button>
                ` : '<div></div><div></div>'}

                <button onclick="openDetailOverlay('${track.id}')" class="btn btn-primary" style="width:100%;">Kiválasztás</button>
            </div>
        </div>
    `;
    return div;
}

// --- IDŐJÁRÁS KEZELÉS (Open-Meteo) ---

// WMO Időjárás kódok fordítása FontAwesome ikonokra és szövegre
const weatherCodeMap = {
    0: { icon: 'fa-sun', text: 'Tiszta idő', class: 'sunny' },
    1: { icon: 'fa-cloud-sun', text: 'Enyhén felhős', class: 'cloudy' },
    2: { icon: 'fa-cloud', text: 'Felhős', class: 'cloudy' },
    3: { icon: 'fa-cloud', text: 'Borult', class: 'cloudy' },
    45: { icon: 'fa-smog', text: 'Köd', class: 'cloudy' },
    48: { icon: 'fa-smog', text: 'Zúzmarás köd', class: 'cloudy' },
    51: { icon: 'fa-cloud-rain', text: 'Szitálás', class: 'rainy' },
    53: { icon: 'fa-cloud-rain', text: 'Mérsékelt szitálás', class: 'rainy' },
    61: { icon: 'fa-umbrella', text: 'Eső', class: 'rainy' },
    63: { icon: 'fa-umbrella', text: 'Mérsékelt eső', class: 'rainy' },
    80: { icon: 'fa-cloud-showers-heavy', text: 'Zápor', class: 'rainy' },
    95: { icon: 'fa-bolt', text: 'Zivatar', class: 'rainy' },
    // További kódok igény szerint... alapértelmezett fallback van.
};

// --- PROFI IDŐJÁRÁS LEKÉRÉS (Mindent bele verzió) ---

async function loadWeather(lat, lon) {
    const card = document.getElementById('weather-card');
    const extras = document.getElementById('weather-extras');

    // UI Reset
    card.style.display = 'block';
    card.classList.remove('loaded');
    document.getElementById('weather-icon').className = 'fas fa-circle-notch fa-spin';
    document.getElementById('weather-temp').textContent = '--°C';
    document.getElementById('weather-desc').textContent = 'Adatok...';
    document.getElementById('location-name').innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Helyszín...';

    // URL-ek
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=uv_index_max,sunrise,sunset&timezone=auto`;
    const elevationUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
    const geoUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14`;
    const airQualityUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm2_5`;

    try {
        const [weatherRes, elevRes, geoRes, airRes] = await Promise.all([
            fetch(weatherUrl),
            fetch(elevationUrl),
            fetch(geoUrl),
            fetch(airQualityUrl)
        ]);

        const wData = await weatherRes.json();
        const eData = await elevRes.json();
        const gData = await geoRes.json();
        const aData = await airRes.json();

        // --- NAPKELTE / NAPNYUGTA IDŐZÍTÉS ---
        const daily = wData.daily;
        const sunriseDate = new Date(daily.sunrise[0]);
        const sunsetDate = new Date(daily.sunset[0]);
        const now = new Date(); // Jelenlegi idő

        // Ellenőrizzük, hogy éjszaka van-e (napkelte előtt VAGY napnyugta után)
        const isNight = now < sunriseDate || now > sunsetDate;

        // --- IDŐJÁRÁS IKON LOGIKA ---
        const current = wData.current_weather;
        // Lemásoljuk az eredeti infót, hogy ne írjuk felül a globális változót
        let info = { ... (weatherCodeMap[current.weathercode] || { icon: 'fa-cloud', text: 'Változékony', class: 'cloudy' }) };

        // HA ÉJSZAKA VAN, CSERÉLJÜK AZ IKONOKAT
        if (isNight) {
            if (current.weathercode === 0) {
                // Tiszta idő -> Hold
                info.icon = 'fa-moon';
                // Opcionális: a sárga "sunny" osztályt lecserélhetjük, ha akarjuk, de a Hold is lehet sárga/fehér
            } else if ([1, 2, 3].includes(current.weathercode)) {
                // Felhős -> Felhős Hold
                info.icon = 'fa-cloud-moon';
            }
            // A többi (eső, hó, köd) maradhat semleges, vagy használhatsz 'fa-cloud-moon-rain'-t ha van.
        }

        document.getElementById('weather-icon').className = `fas ${info.icon} ${info.class}`;
        document.getElementById('weather-temp').textContent = `${Math.round(current.temperature)}°C`;
        document.getElementById('weather-desc').textContent = info.text;

        // --- EXTRÁK MEGJELENÍTÉSE ---

        // UV
        const uvMax = daily.uv_index_max[0];
        document.getElementById('uv-display').textContent = `UV: ${uvMax.toFixed(1)}`;
        document.getElementById('uv-display').style.color = uvMax > 6 ? '#ff6b6b' : 'inherit';

        // Szél
        const windSpeed = Math.round(current.windspeed);
        document.getElementById('wind-detail').textContent = `${windSpeed} km/h`;
        const arrow = document.getElementById('wind-arrow');
        arrow.style.transform = `rotate(${current.winddirection}deg)`;

        // Idők formázása (HH:MM)
        const formatTime = (isoString) => isoString.split('T')[1];
        document.getElementById('sunrise-display').textContent = formatTime(daily.sunrise[0]);
        document.getElementById('sunset-display').textContent = formatTime(daily.sunset[0]);

        // PM2.5
        if (aData.current && aData.current.pm2_5) {
            const pm25 = aData.current.pm2_5;
            const aqiEl = document.getElementById('aqi-display');
            aqiEl.textContent = `${Math.round(pm25)} µg`;
            if (pm25 < 10) aqiEl.style.color = '#00b894';
            else if (pm25 < 25) aqiEl.style.color = '#fdcb6e';
            else aqiEl.style.color = '#ff7675';
        }

        // Magasság
        if (eData.elevation && eData.elevation.length > 0) {
            document.getElementById('elevation-display').textContent = `${Math.round(eData.elevation[0])} m`;
        }

        // Városnév
        let locationName = "Ismeretlen";
        if (gData.address) {
             locationName = gData.address.suburb || gData.address.city || gData.address.town || "Helyszín";
             if (gData.address.city && gData.address.suburb && gData.address.city !== gData.address.suburb) {
                 locationName = `${gData.address.city}, ${gData.address.suburb}`;
            }
        }
        document.getElementById('location-name').innerHTML = `<i class="fas fa-map-marker-alt"></i> ${locationName}`;

        card.classList.add('loaded');

    } catch (error) {
        console.error('Weather error:', error);
        document.getElementById('weather-desc').textContent = 'Adathiba';
    }
}

// ==========================================================
// RÉSZLETES ADATLAP (OVERLAY) LOGIKA
// ==========================================================

function openDetailOverlay(trackId) {
    const track = allTracksData.find(t => t.id === trackId);
    if (!track) return;

    const overlay = document.getElementById('full-page-detail');
    // --- JAVÍTÁS: GÖRGETÉS VISSZAÁLLÍTÁSA ---
    if (overlay) overlay.scrollTop = 0;
    const fallbackUrl = 'https://images.unsplash.com/photo-1533560906234-a4b9e38e146c?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80';
    const imgUrl = track.image ? track.image : fallbackUrl;

    // 1. Háttér és Cím
    const bg = document.getElementById('detail-bg-image');
    if(bg) bg.style.backgroundImage = `url('${imgUrl}')`;

    document.getElementById('detail-hero-name').textContent = track.name;

    // 2. Hero Badges - MÓDOSÍTOTT
    const badgeContainer = document.getElementById('detail-hero-badges');
    let badgesHtml = '';

    // 1. BADGE: Nyitvatartás (0-24 vagy Változó)
    if (track.is_24_7) {
        badgesHtml += '<div class="hero-badge" style="border-color: var(--neon-blue); color: #fff;"><i class="fas fa-clock"></i> 0-24 Nyitva</div>';
    } else {
        badgesHtml += '<div class="hero-badge" style="border-color: #f1c40f; color: #f1c40f;"><i class="fas fa-door-open"></i> Nyitvatartás: Változó</div>';
    }

    // 2. BADGE: Borítás típusa (Fizetős/Ingyenes helyett)
    // Nagy kezdőbetűssé alakítjuk (pl. "rekortan" -> "Rekortan")
    let surfaceDisplay = track.surface_type ? track.surface_type.charAt(0).toUpperCase() + track.surface_type.slice(1) : 'Vegyes';

    badgesHtml += `<div class="hero-badge" style="border-color: rgba(255,255,255,0.5); color: #ddd;"><i class="fas fa-layer-group"></i> ${surfaceDisplay}</div>`;

    badgeContainer.innerHTML = badgesHtml;

    // 3. Leírás
    const descEl = document.getElementById('detail-desc');
    descEl.innerHTML = `
        Ez a(z) <strong>${track.name}</strong> egy kiváló választás, ha ${track.surface_type} borításon szeretnél futni.
        A pálya hossza ${track.distance_km_per_lap} km. <br><br>
        ${track.has_lighting ? '<i class="fas fa-lightbulb" style="color:var(--neon-blue)"></i> <strong>Kivilágított:</strong> Éjszaka is nyugodtan használhatod.<br>' : ''}
        ${track.is_dog_friendly ? '<i class="fas fa-dog" style="color:var(--neon-green)"></i> <strong>Kutyabarát:</strong> Kutyusodat is bátran magaddal hozhatod!<br>' : ''}
        ${track.has_shower ? '<i class="fas fa-shower"></i> <strong>Zuhanyzási lehetőség</strong> biztosított.<br>' : ''}
    `;

    // 4. Statisztikák
    document.getElementById('stat-dist').textContent = track.distance_km_per_lap + " km";
    document.getElementById('stat-surface').textContent = track.surface_type || "Vegyes";
    document.getElementById('stat-open').textContent = track.is_24_7 ? "0-24" : "Változó";

    // --- 5. Szolgáltatások (Amenities) - GRID NÉZET ---
    const amContainer = document.getElementById('detail-amenities');

    // Segédfüggvény a kártya generáláshoz
    // isAvailable: true/false
    // icon: FontAwesome class (pl. 'fa-lightbulb')
    // text: A felirat (pl. 'Világítás')
    // extraClass: Opcionális extra class (pl. 'free-badge' az ingyeneshez)
    const createAmenityCard = (isAvailable, icon, text, extraClass = '') => {
        const statusClass = isAvailable ? `present ${extraClass}` : 'missing';
        return `
            <div class="amenity-card ${statusClass}">
                <i class="fas ${icon}"></i>
                <span>${text}</span>
            </div>
        `;
    };

    let amHtml = '<div class="amenities-grid-modal">';

    // 1. Fizetős / Ingyenes
    // Ha track.is_free true -> Ingyenes (Zöld, aktív)
    // Ha track.is_free false -> Fizetős (Pirosas vagy simán nem ingyenes)
    // A kérésed szerint: ha "Nincs", akkor is fel kell tüntetni.
    // Itt a logikát megfordítjuk vizuálisan: Ha ingyenes -> Aktív, Ha fizetős -> Inaktív "Ingyenes" (vagy fordítva).
    // A legegyértelműbb: Ha ingyenes, akkor "Ingyenes" (aktív), ha fizetős, akkor "Ingyenes" (áthúzva/inaktív).
    amHtml += createAmenityCard(track.is_free, 'fa-wallet', 'Ingyenes', 'free-badge');

    // 2. Fény
    amHtml += createAmenityCard(track.has_lighting, 'fa-lightbulb', 'Világítás');

    // 3. Öltöző
    amHtml += createAmenityCard(track.has_lockers, 'fa-lock', 'Öltöző');

    // 4. Parkoló
    amHtml += createAmenityCard(track.has_parking, 'fa-square-parking', 'Parkoló');

    // 5. Zuhany
    amHtml += createAmenityCard(track.has_shower, 'fa-shower', 'Zuhany');

    // 6. Kutyás
    amHtml += createAmenityCard(track.is_dog_friendly, 'fa-dog', 'Kutyabarát');

    // 7. WC
    amHtml += createAmenityCard(track.has_toilet, 'fa-restroom', 'WC');

    // 8. BKV / Tömegközlekedés
    amHtml += createAmenityCard(track.has_public_transport, 'fa-bus', 'BKV-val elérhető');

    // 9. 0-24 Nyitva
    amHtml += createAmenityCard(track.is_24_7, 'fa-clock', '0-24 Nyitva');
    // ----------------------------------

    // 10. VÍZ / BÜFÉ LOGIKA
    if (track.water_option === 'tap') {
        amHtml += createAmenityCard(true, 'fa-faucet', 'Ingyenes Ivókút');
    } else if (track.water_option === 'paid') {
        amHtml += createAmenityCard(true, 'fa-shop', 'Büfé / Bolt');
    } else {
        // Ha nincs víz (inaktív)
        amHtml += createAmenityCard(false, 'fa-faucet', 'Nincs víz');
    }

    amHtml += '</div>'; // Grid lezárása

    amContainer.innerHTML = amHtml;

    // --- 6. KOORDINÁTA ALAPÚ FUNKCIÓK (Térkép + Időjárás) ---
    const mapCard = document.getElementById('map-card-container');
    const weatherCard = document.getElementById('weather-card'); // ÚJ: Időjárás kártya

    const lat = parseFloat(track.lat);
    const lon = parseFloat(track.lon);

    // Koordináták ellenőrzése
    if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
        document.getElementById('stat-coords').textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

        // Kártyák megjelenítése
        mapCard.style.display = 'block';
        if(weatherCard) weatherCard.style.display = 'block'; // ÚJ

        // >> IDŐJÁRÁS LEKÉRÉSE <<
        loadWeather(lat, lon); // Ez hívja meg az új időjárás függvényt

        // Google Maps link frissítése
        const gmapsLink = document.getElementById('google-maps-link');
        if(gmapsLink) gmapsLink.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

        // Leaflet térkép inicializálása (késleltetve a modal animáció miatt)
        setTimeout(() => {
            if (!mapInstance) {
                mapInstance = L.map('track-map').setView([lat, lon], 14);

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors',
                    maxZoom: 19
                }).addTo(mapInstance);
            } else {
                mapInstance.invalidateSize(); // Fontos: újraszámolja a méretet
                mapInstance.setView([lat, lon], 14);
            }

            // Marker kezelés
            if (mapMarker) {
                mapInstance.removeLayer(mapMarker);
            }
            mapMarker = L.marker([lat, lon]).addTo(mapInstance)
                .bindPopup(`<b>${track.name}</b><br>${track.distance_km_per_lap} km`)
                .openPopup();

        }, 300);

    } else {
        // Ha nincs koordináta, elrejtjük a térképet és az időjárást is
        document.getElementById('stat-coords').textContent = "-";
        mapCard.style.display = 'none';
        if(weatherCard) weatherCard.style.display = 'none'; // ÚJ
    }

    // 7. Végső megjelenítés
    resetStars();
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeDetailView() {
    const overlay = document.getElementById('full-page-detail');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
}

// --- CSILLAG ÉRTÉKELŐ LOGIKA ---
function initStarRating() {
    const container = document.getElementById('stars-box');
    const display = document.getElementById('display-rating');
    let currentRating = 0;

    if(!container) return;

    window.updateStars = function(rating) {
        const stars = document.querySelectorAll('.star-wrapper');
        stars.forEach((star, index) => {
            const filledLayer = star.querySelector('.star-filled');
            const starIdx = index + 1;

            if (rating >= starIdx) {
                filledLayer.style.width = '100%';
            } else if (rating >= starIdx - 0.5) {
                filledLayer.style.width = '50%';
            } else {
                filledLayer.style.width = '0%';
            }
        });
    }

    window.resetStars = function() {
        currentRating = 0;
        if(display) display.textContent = "0.0";
        updateStars(0);
    }

    container.addEventListener('mousemove', (e) => {
        const star = e.target.closest('.star-wrapper');
        if (!star) return;

        const rect = star.getBoundingClientRect();
        const starIndex = parseInt(star.getAttribute('data-index'));
        const x = e.clientX - rect.left;
        const width = rect.width;

        let isHalf = x < (width / 2);
        let hoverRating = isHalf ? starIndex - 0.5 : starIndex;

        updateStars(hoverRating);
    });

    container.addEventListener('click', (e) => {
        const star = e.target.closest('.star-wrapper');
        if (!star) return;

        const rect = star.getBoundingClientRect();
        const starIndex = parseInt(star.getAttribute('data-index'));
        const x = e.clientX - rect.left;
        let isHalf = x < (rect.width / 2);

        currentRating = isHalf ? starIndex - 0.5 : starIndex;

        if(display) display.textContent = currentRating.toFixed(1);

        star.classList.remove('click-anim');
        void star.offsetWidth;
        star.classList.add('click-anim');

        updateStars(currentRating);
    });

    container.addEventListener('mouseleave', () => {
        updateStars(currentRating);
    });
}

// --- SZŰRŐK ---
function setupFilters() {
    $('.filter-btn').off('click').on('click', function () {
        const $this = $(this);
        $('.filter-btn').removeClass('active');
        $this.addClass('active');

        let filterValue = $this.attr('data-filter');
        filterValue = (filterValue === 'all') ? '*' : '.' + filterValue;

        $grid.isotope({ filter: filterValue });

        $('html, body').animate({
            scrollTop: $(".tracks-header").offset().top - 20
        }, 500);
    });
}

function setupEditListeners() {
    document.body.addEventListener('click', function(e) {
        if(e.target.closest('.btn-edit-track')) {
            e.preventDefault();
            const btn = e.target.closest('.btn-edit-track');
            const trackId = btn.getAttribute('data-track-id');
            openEditModal(trackId);
        }

        if(e.target.closest('.btn-delete-track')) {
            e.preventDefault();
            const btn = e.target.closest('.btn-delete-track');
            const trackId = btn.getAttribute('data-track-id');
            deleteTrack(trackId);
        }
    });
}

// --- ADMIN MODAL FÜGGVÉNYEK ---
function openTrackModal() {
    // Mezők törlése
    document.getElementById('new-track-name').value = "";
    document.getElementById('new-track-dist').value = "";
    document.getElementById('new-track-lat').value = "";
    document.getElementById('new-track-lon').value = "";
    document.getElementById('new-track-img').value = "";
    document.getElementById('new-track-surface').selectedIndex = 0;

    // Checkboxok alaphelyzetbe állítása
    document.getElementById('check-free').checked = true;
    document.getElementById('check-lighting').checked = false;
    document.getElementById('check-dog').checked = false;
    document.getElementById('check-shower').checked = false;
    document.getElementById('check-parking').checked = false;
    document.getElementById('check-lockers').checked = false;

    // --- ÚJ MEZŐK RESETELÉSE ---
    document.getElementById('check-toilet').checked = false;
    document.getElementById('check-transport').checked = true; // BKV legyen alapból pipa? Ha nem, írd át false-ra.
    document.getElementById('check-24-7').checked = true;      // 0-24 legyen alapból pipa
    document.getElementById('water-option').value = 'none';
    // ----------------------------

    const modalTitle = document.getElementById('modal-title');
    if (modalTitle) modalTitle.innerHTML = '<i class="fas fa-map-marker-alt" style="color: var(--neon-blue);"></i> Új Pálya';

    const submitButton = document.querySelector('#track-modal .btn-submit');
    if (submitButton) {
        delete submitButton.dataset.mode;
        delete submitButton.dataset.trackId;
        submitButton.innerHTML = 'Pálya Mentése <i class="fas fa-save" style="margin-left: 8px;"></i>';
    }

    document.getElementById('track-modal').classList.add('active');
}

window.closeModal = function(id) {
    const el = document.getElementById(id);
    if(el) el.classList.remove('active');
}

// static/js/tracks.js

async function openEditModal(trackId) {
    const track = allTracksData.find(t => t.id === trackId);
    if (!track) { alert("Hiba: A pálya adatai nem találhatók!"); return; }

    openTrackModal(); // Reseteli az űrlapot

    document.getElementById('modal-title').innerText = `Pálya módosítása: ${track.name}`;
    document.getElementById('new-track-name').value = track.name;
    document.getElementById('new-track-dist').value = track.distance_km_per_lap;
    document.getElementById('new-track-lat').value = track.lat;
    document.getElementById('new-track-lon').value = track.lon;

    const surfaceSelect = document.getElementById('new-track-surface');
    if (surfaceSelect) surfaceSelect.value = track.surface_type;

    // Checkboxok betöltése
    document.getElementById('check-free').checked = track.is_free;
    document.getElementById('check-lighting').checked = track.has_lighting;
    document.getElementById('check-dog').checked = track.is_dog_friendly;
    document.getElementById('check-shower').checked = track.has_shower;
    document.getElementById('check-parking').checked = track.has_parking;
    document.getElementById('check-lockers').checked = track.has_lockers;

    // --- HIÁNYZÓ SOROK PÓTLÁSA ---
    document.getElementById('check-toilet').checked = track.has_toilet;
    document.getElementById('check-transport').checked = track.has_public_transport;

    // EZ A SOR HIÁNYZOTT (ezért nem volt pipa, pedig 0-24-es):
    document.getElementById('check-24-7').checked = track.is_24_7;

    const waterSelect = document.getElementById('water-option');
    if(waterSelect) waterSelect.value = track.water_option;

    const fileInput = document.getElementById('new-track-img');
    if (fileInput) fileInput.value = ""; // Fájl inputot nem lehet JS-ből beállítani, csak törölni

    const submitButton = document.querySelector('#track-modal .btn-submit');
    if (submitButton) {
        submitButton.dataset.mode = 'edit';
        submitButton.dataset.trackId = trackId;
        submitButton.innerHTML = 'Módosítás <i class="fas fa-edit" style="margin-left: 8px;"></i>';
    }
}

async function saveNewTrack() {
    const submitButton = document.querySelector('#track-modal .btn-submit');
    if (submitButton.dataset.mode === 'edit') {
        saveEditedTrack(submitButton.dataset.trackId);
        return;
    }

    const name = document.getElementById('new-track-name').value;
    const dist = document.getElementById('new-track-dist').value;
    const surfaceRaw = document.getElementById('new-track-surface').value;
    const lat = document.getElementById('new-track-lat').value;
    const lon = document.getElementById('new-track-lon').value;
    const fileInput = document.getElementById('new-track-img');

    if (!name || !dist || !surfaceRaw || !lat || !lon) {
        alert("Kérlek töltsd ki a kötelező mezőket!");
        return;
    }

    const generatedId = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const surfaceMap = {'Rekortán': 'rekortan', 'Beton': 'beton', 'Aszfalt': 'beton', 'Salak': 'salak', 'Erdei út': 'föld', 'Föld/Füves': 'föld', 'Vegyes': 'vegyes'};
    const surfaceCode = surfaceMap[surfaceRaw] || 'vegyes';

    const formData = new FormData();
    formData.append('id', generatedId);
    formData.append('name', name);
    formData.append('distance_km_per_lap', parseFloat(dist));
    formData.append('surface_type', surfaceCode);
    formData.append('lat', parseFloat(lat));
    formData.append('lon', parseFloat(lon));

    // Checkboxok
    formData.append('is_free', document.getElementById('check-free').checked);
    formData.append('has_lighting', document.getElementById('check-lighting').checked);
    formData.append('is_dog_friendly', document.getElementById('check-dog').checked);
    formData.append('has_shower', document.getElementById('check-shower').checked);
    formData.append('has_parking', document.getElementById('check-parking').checked);
    formData.append('has_lockers', document.getElementById('check-lockers').checked);

    // --- FRISSÍTVE: 0-24 nyitvatartás checkboxból ---
    formData.append('is_24_7', document.getElementById('check-24-7').checked);

    // Új mezők
    formData.append('has_toilet', document.getElementById('check-toilet').checked);
    formData.append('has_public_transport', document.getElementById('check-transport').checked);
    formData.append('water_option', document.getElementById('water-option').value);

    if (fileInput.files.length > 0) formData.append('image', fileInput.files[0]);

    const btn = document.querySelector('#track-modal .btn-submit');
    const origText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Feltöltés...';
    btn.disabled = true;

    try {
        let csrf = getCookie('csrftoken');
        const response = await fetch('/api/tracks/', { method: 'POST', headers: { 'X-CSRFToken': csrf }, body: formData });
        if (response.ok) {
            alert("Sikeres mentés!");
            closeModal('track-modal');
            loadTracks();
        } else {
            const errData = await response.json();
            alert("Hiba történt: " + JSON.stringify(errData));
        }
    } catch (error) { console.error(error); alert("Hálózati hiba."); }
    finally { btn.innerHTML = origText; btn.disabled = false; }
}

async function saveEditedTrack(trackId) {
    const name = document.getElementById('new-track-name').value;
    const dist = document.getElementById('new-track-dist').value;
    const surfaceRaw = document.getElementById('new-track-surface').value;
    const lat = document.getElementById('new-track-lat').value;
    const lon = document.getElementById('new-track-lon').value;
    const fileInput = document.getElementById('new-track-img');

    const surfaceMap = {'Rekortán': 'rekortan', 'Beton': 'beton', 'Aszfalt': 'beton', 'Salak': 'salak', 'Erdei út': 'föld', 'Föld/Füves': 'föld', 'Vegyes': 'vegyes'};
    const surfaceCode = surfaceMap[surfaceRaw] || 'vegyes';

    const formData = new FormData();
    formData.append('name', name);
    formData.append('distance_km_per_lap', parseFloat(dist));
    formData.append('surface_type', surfaceCode);
    formData.append('lat', parseFloat(lat));
    formData.append('lon', parseFloat(lon));

    // Checkboxok
    formData.append('is_free', document.getElementById('check-free').checked);
    formData.append('has_lighting', document.getElementById('check-lighting').checked);
    formData.append('is_dog_friendly', document.getElementById('check-dog').checked);
    formData.append('has_shower', document.getElementById('check-shower').checked);
    formData.append('has_parking', document.getElementById('check-parking').checked);
    formData.append('has_lockers', document.getElementById('check-lockers').checked);

    // --- FRISSÍTVE: 0-24 nyitvatartás checkboxból ---
    formData.append('is_24_7', document.getElementById('check-24-7').checked);

    // Új mezők
    formData.append('has_toilet', document.getElementById('check-toilet').checked);
    formData.append('has_public_transport', document.getElementById('check-transport').checked);
    formData.append('water_option', document.getElementById('water-option').value);

    if (fileInput.files.length > 0) formData.append('image', fileInput.files[0]);

    const btn = document.querySelector('#track-modal .btn-submit');
    const origText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Mentés...';
    btn.disabled = true;

    try {
        let csrf = getCookie('csrftoken');
        const response = await fetch(`/api/tracks/${trackId}/`, { method: 'PATCH', headers: { 'X-CSRFToken': csrf }, body: formData });
        if (response.ok) {
            alert("Sikeres módosítás!");
            closeModal('track-modal');
            loadTracks();
        } else {
            const errData = await response.json();
            alert("Hiba: " + JSON.stringify(errData));
        }
    } catch (error) { console.error(error); alert("Hálózati hiba."); }
    finally { btn.innerHTML = origText; btn.disabled = false; btn.dataset.mode = 'new'; }
}

async function deleteTrack(trackId) {
    if (!confirm("Biztosan törölni szeretnéd ezt a pályát?")) return;
    try {
        let csrf = getCookie('csrftoken');
        const response = await fetch(`/api/tracks/${trackId}/`, { method: 'DELETE', headers: { 'X-CSRFToken': csrf } });
        if (response.ok) { alert("Pálya törölve!"); loadTracks(); }
        else { const errData = await response.json(); alert("Hiba: " + JSON.stringify(errData)); }
    } catch (error) { console.error(error); alert("Hálózati hiba."); }
}

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

// --- EGYEDI SMOOTH SCROLL (OPTIMALIZÁLT) ---
window.scrollToDetails = function() {
    const overlay = document.getElementById('full-page-detail');
    const sheet = document.querySelector('.details-sheet');

    if (!overlay || !sheet) return;

    const duration = 1500; // Marad az 1.5 mp, mert a sebesség tetszett
    const targetPos = sheet.offsetTop;
    const startPos = overlay.scrollTop;
    const distance = targetPos - startPos;
    let startTime = null;

    function animation(currentTime) {
        if (startTime === null) startTime = currentTime;
        const timeElapsed = currentTime - startTime;

        // ÚJ EASING: easeInOutCubic (Még selymesebb mozgás, mint a Quad)
        const ease = (t, b, c, d) => {
            t /= d / 2;
            if (t < 1) return c / 2 * t * t * t + b;
            t -= 2;
            return c / 2 * (t * t * t + 2) + b;
        };

        const nextScroll = ease(timeElapsed, startPos, distance, duration);

        // FONTOS JAVÍTÁS: Math.round() használata
        // Ez megakadályozza a szub-pixel vibrálást (szaggatást)
        overlay.scrollTop = Math.round(nextScroll);

        if (timeElapsed < duration) {
            requestAnimationFrame(animation);
        } else {
            // Biztosítjuk, hogy a végén pontosan a célnál álljon meg
            overlay.scrollTop = targetPos;
        }
    }

    requestAnimationFrame(animation);
};
