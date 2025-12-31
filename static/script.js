// /static/script.js

// --- AUTHENTIKÁCIÓ ÉS FELHASZNÁLÓ KEZELÉS ---
var currentUser = null;
var currentEditingId = null;

async function checkAuthStatus() {
    try {
        const response = await fetch('/api/whoami/');
        const data = await response.json();
        if (data.is_authenticated) {
            currentUser = data;
            updateUserUI(true);
        } else {
            currentUser = null;
            updateUserUI(false);
        }
    } catch (err) {
        console.error("Auth Check Error", err);
    }
}

function updateUserUI(isLoggedIn) {
    const loginBtn = document.getElementById('login-btn');
    const profileDisplay = document.getElementById('user-profile-display');

    if (loginBtn && profileDisplay) {
        if (isLoggedIn) {
            loginBtn.classList.add('hidden');
            profileDisplay.classList.remove('hidden');

            const nameText = document.getElementById('user-name-text');

            // --- JAVÍTÁS ITT: ---
            // Nem ID-t keresünk (mert az nincs), hanem a .avatar-mini osztályt!
            const avatar = document.querySelector('.avatar-mini');

            if (nameText && currentUser.full_name) {
                nameText.textContent = currentUser.full_name; // Vagy currentUser.username
            } else if (nameText) {
                nameText.textContent = currentUser.username;
            }

            // Kezdőbetű beállítása
            if (avatar && currentUser.username) {
                avatar.textContent = currentUser.username.charAt(0).toUpperCase();
            }

        } else {
            loginBtn.classList.remove('hidden');
            profileDisplay.classList.add('hidden');
        }
    }
}

async function performLogin() {
    const u = document.getElementById('login-username').value;
    const p = document.getElementById('login-password').value;
    try {
        const response = await fetch('/api/login/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
            body: JSON.stringify({ username: u, password: p })
        });
        if (response.ok) {
            closeModal('login-modal');
            window.location.reload();
        } else {
            alert('Hibás adatok!');
        }
    } catch (err) {
        alert('Hiba történt.');
    }
}

// static/script.js

async function performRegister() {
    const u = document.getElementById('reg-username').value;
    const f = document.getElementById('reg-fullname').value;
    const p = document.getElementById('reg-password').value;

    // Új mezők
    const by = document.getElementById('reg-birthyear').value;
    const g = document.getElementById('reg-gender').value;
    const w = document.getElementById('reg-weight').value;
    const h = document.getElementById('reg-height').value;

    if (!u || !f || !p) {
        alert("A felhasználónév, név és jelszó kötelező!");
        return;
    }

    // Payload összeállítása
    const payload = {
        username: u,
        full_name: f,
        password: p,
        birth_year: by,
        gender: g,
        weight: w,
        height: h
    };

    try {
        const response = await fetch('/api/register/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (response.ok) {
            alert(data.message);
            switchToLogin();
        } else {
            alert(data.message);
        }
    } catch (err) {
        alert('Hiba történt a kommunikációban.');
        console.error(err);
    }
}

async function logout() {
    if (!confirm("Biztosan ki szeretnél lépni?")) return;
    try {
        const response = await fetch('/api/logout/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') }
        });
        if (response.ok) {
            currentUser = null;
            window.location.href = "/";
        } else {
            alert("Nem sikerült kijelentkezni.");
        }
    } catch (error) {
        console.error('Hálózati hiba:', error);
    }
}

// --- MODAL KEZELÉS ---
function openLoginModal() { document.getElementById('login-modal').classList.add('active'); }
function switchToRegister() { closeModal('login-modal'); setTimeout(() => { document.getElementById('register-modal').classList.add('active'); }, 200); }
function switchToLogin() { closeModal('register-modal'); setTimeout(() => { openLoginModal(); }, 200); }

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    if (id === 'admin-modal') {
        resetAdminForm();
    }
}

// Új eredmény VAGY Szerkesztés modal megnyitása
function openResultModal() {
    if (!currentUser) { alert("Az eredmény rögzítéséhez kérlek jelentkezz be!"); openLoginModal(); return; }

    const modal = document.getElementById('admin-modal');

    // --- ÚJ: Dátum beállítása MAI napra ---
    const dateInput = document.getElementById('input-date');
    if (dateInput) {
        // A toISOString() pl: "2023-10-27T14:00:00.000Z", a split('T')[0] pedig csak a dátum rész
        dateInput.value = new Date().toISOString().split('T')[0];
    }
    // ------------------------------------------

    if (!currentEditingId) {
        resetAdminForm();

        const nameInput = document.getElementById('input-name');
        const lockMsg = document.getElementById('name-lock-msg');
        const lockedName = document.getElementById('locked-name');

        if (currentUser.is_staff) {
            nameInput.readOnly = false;
            nameInput.value = currentUser.full_name || currentUser.username;
            lockMsg.style.display = 'none';
        } else {
            nameInput.readOnly = true;
            nameInput.value = currentUser.full_name;
            lockMsg.style.display = 'block';
            lockedName.textContent = currentUser.full_name;
        }

        const mainSelect = document.getElementById('track-select');
        const adminSelect = document.getElementById('input-track');
        if (mainSelect && adminSelect && mainSelect.value) {
            adminSelect.value = mainSelect.value;
        }
    }

    modal.classList.add('active');
}

function resetAdminForm() {
    currentEditingId = null;
    document.querySelector('#admin-modal h3').innerHTML = '<i class="fas fa-stopwatch" style="color: var(--accent-color);"></i> Új Eredmény';
    const btn = document.querySelector('#admin-modal .btn-submit');
    if(btn) btn.innerHTML = 'Rögzítés <i class="fas fa-arrow-right" style="margin-left: 8px;"></i>';

    document.getElementById('input-name').value = "";
    document.getElementById('laps-container').innerHTML = '';

    // Dátumot is visszaállítjuk maira resetnél
    const dateInput = document.getElementById('input-date');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

    addLapInput();
}

// --- SEGÉDFÜGGVÉNYEK ---
function addLapInput(value = "") {
    const container = document.getElementById('laps-container');
    if (!container) return;

    const index = container.children.length + 1;
    const div = document.createElement('div');
    div.className = 'lap-input-row';
    div.style.cssText = "display:flex; gap:10px; margin-bottom:8px; align-items:center;";
    div.innerHTML = `<span style="font-size:0.8rem; color:#64748b; width:20px;">${index}.</span><input type="text" class="form-control lap-input-field" placeholder="05:00" value="${value}" style="padding:8px;"><button type="button" onclick="this.parentElement.remove(); updateLapCount()" style="border:none; background:none; color:#ef4444; cursor:pointer;"><i class="fas fa-trash"></i></button>`;
    container.appendChild(div);
    updateLapCount();
}

function updateLapCount() {
    const count = document.getElementsByClassName('lap-input-field').length;
    const lapInput = document.getElementById('input-laps');
    if (lapInput) lapInput.value = count > 0 ? count : 1;
}

function getCookie(name) {
    let c = null;
    if (document.cookie) {
        document.cookie.split(';').forEach(el => {
            let [k, v] = el.trim().split('=');
            if (k === name) c = decodeURIComponent(v);
        });
    }
    return c;
}

function timeToSeconds(s) {
    if (!s) return 0;
    // JAVÍTÁS: parseFloat használata parseInt helyett a tizedesek miatt
    const p = s.split(':').map(x => parseFloat(x) || 0);
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return 0;
}

function secondsToTimeStr(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;

    // JAVÍTÁS: Másodperc formázása tizedesjegyekkel
    let secStr;
    if (sec % 1 === 0) {
        // Ha egész szám (nincs tizedes)
        secStr = String(sec).padStart(2, '0');
    } else {
        // Ha van tizedes (pl. 28.51), akkor fix 2 tizedesjegy és vezető nulla ha kell
        secStr = sec.toFixed(2);
        if (sec < 10) secStr = "0" + secStr;
    }

    return (h > 0 ? String(h).padStart(2, '0') + ':' : '') +
           String(m).padStart(2, '0') + ':' +
           secStr;
}

function calculateMetrics(sec, dist) {
    if (dist <= 0 || sec <= 0) return { pace: 'N/A', speed: 'N/A' };
    const min = sec / 60, paceMin = Math.floor(min / dist), paceSec = Math.round((min / dist - paceMin) * 60);
    return { pace: `${paceMin}:${String(paceSec).padStart(2, '0')}`, speed: (dist / (sec / 3600)).toFixed(2) };
}

function toggleLapDetails(id) {
    const el = document.getElementById(`details-${id}`), btn = document.getElementById(`btn-${id}`);
    const isHidden = (!el.style.display || el.style.display === 'none');
    el.style.display = isHidden ? 'block' : 'none';
    btn.innerHTML = isHidden ? '<i class="fas fa-chevron-up"></i> Kevesebb' : '<i class="fas fa-list-ol"></i> Köridők';
}

// --- TÉRKÉP ÉS ADATOK KEZELÉSE ---
let map = null;

if (document.getElementById('map') && typeof L !== 'undefined') {
    map = L.map('map', { zoomControl: false }).setView([47.4979, 19.0402], 12);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO', maxZoom: 20 }).addTo(map);
}

const selectMain = document.getElementById('track-select');
const selectAdmin = document.getElementById('input-track');
const markers = {};
let tracksData = [];

async function initTracks() {
    try {
        const response = await fetch('/api/tracks/');
        if (!response.ok) throw new Error('Hiba');
        tracksData = await response.json();

        if (selectMain) selectMain.innerHTML = '<option value="" disabled selected>Válassz Pályát</option>';
        if (selectAdmin) selectAdmin.innerHTML = '<option value="" disabled selected>Válassz Pályát</option>';

        tracksData.forEach(track => {
            if (map && typeof L !== 'undefined') {
                const marker = L.marker([track.lat, track.lon]).addTo(map).bindPopup(`<b>${track.name}</b>`);
                markers[track.id] = marker;
                marker.on('click', () => {
                    if (selectMain) selectMain.value = track.id;
                    if (selectAdmin) selectAdmin.value = track.id;
                    loadResults(track.id);
                });
            }

            if (selectMain && selectAdmin) {
                let opt = new Option(track.name, track.id);
                selectMain.add(opt);
                selectAdmin.add(opt.cloneNode(true));
            }
        });

        if (selectMain) {
            selectMain.addEventListener('change', (e) => loadResults(e.target.value));
        }

        checkUrlForTrack();

    } catch (error) { console.error(error); }
}

function checkUrlForTrack() {
    const urlParams = new URLSearchParams(window.location.search);
    const trackId = urlParams.get('track_id');

    if (trackId && selectMain) {
        selectMain.value = trackId;
        loadResults(trackId);
        const mapEl = document.getElementById('map');
        if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth' });
    }
}

async function loadResults(trackId) {
    if (!trackId) return;
    const container = document.getElementById('results-container');
    if (!container) return;

    const imgWrapper = document.getElementById('track-image-wrapper');
    const imgElem = document.getElementById('track-image');
    container.innerHTML = '<div style="text-align:center; padding:60px; color:#cbd5e1;"><i class="fas fa-circle-notch fa-spin fa-3x"></i></div>';

    try {
        const trackInfo = tracksData.find(t => t.id == trackId);
        if (imgWrapper && imgElem) {
            imgWrapper.style.display = trackInfo.img_url ? 'block' : 'none';
            if (trackInfo.img_url) imgElem.src = trackInfo.img_url;
        }

        const resultsResponse = await fetch(`/api/results/${trackId}/`);
        const results = await resultsResponse.json();

        if (map && typeof L !== 'undefined') {
            map.setView([trackInfo.lat, trackInfo.lon], 15);
            if (markers[trackId]) markers[trackId].openPopup();
        }

        updateTrackOverlay(trackInfo);

        let html = '';
        if (results.length === 0) {
            html = '<div class="placeholder-text"><div class="placeholder-icon-bg"><i class="fas fa-stopwatch"></i></div><div><strong>Nincs eredmény</strong><br>Légy te az első!</div></div>';
        } else {
            const lapDistance = trackInfo.distance_km_per_lap;
            results.forEach((res, idx) => {
                const rank = idx + 1;
                let rankClass = rank === 1 ? 'rank-1' : (rank === 2 ? 'rank-2' : (rank === 3 ? 'rank-3' : 'rank-other'));
                let icon = rank <= 3 ? (rank === 1 ? 'fa-trophy' : 'fa-medal') : '';
                const totalDist = res.laps_count * lapDistance;
                const totalSec = timeToSeconds(res.time);
                const metrics = calculateMetrics(totalSec, totalDist);
                const laps = res.lap_times ? res.lap_times.split(',').map(s => s.trim()).filter(s => s.length > 0) : [];
                const mono = res.runner_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

                let trs = '';
                laps.forEach((t, i) => {
                    const s = timeToSeconds(t), m = calculateMetrics(s, lapDistance);
                    trs += `<tr><td>${i + 1}.</td><td class="mono">${t}</td><td>${m.pace}</td><td>${m.speed}</td></tr>`;
                });

                // --- ÚJ RÉSZ KEZDETE: Név link generálása adminoknak ---
                let runnerNameDisplay = res.runner_name;

                // Csak akkor csinálunk linket, ha be van jelentkezve ÉS admin (staff)
                if (currentUser && currentUser.is_staff) {
                    runnerNameDisplay = `<a href="/results/runner/${encodeURIComponent(res.runner_name)}/"
                                            title="Összes futás megtekintése"
                                            style="color: var(--neon-blue); text-decoration: underline; cursor: pointer; position: relative; z-index: 20;">
                                            ${res.runner_name} <i class="fas fa-external-link-alt" style="font-size: 0.7em;"></i>
                                         </a>`;
                }
                // --- ÚJ RÉSZ VÉGE ---

                const canEdit = currentUser && (currentUser.is_staff || res.can_edit || res.runner_name === currentUser.full_name);

                const actionButtons = canEdit ? `
                    <div style="position: absolute; top: 10px; right: 10px; z-index: 10;">
                        <button onclick="startEdit(${res.id}, '${res.runner_name.replace(/'/g, "\\'")}', '${res.laps_count}', '${res.lap_times}', '${res.track}', ${res.runner_id}, '${res.date}')" class="btn-icon" style="background:white; border:1px solid #e2e8f0; border-radius:50%; width:30px; height:30px; cursor:pointer; color:#3b82f6; margin-right:5px;"><i class="fas fa-pencil-alt"></i></button>
                        <button onclick="deleteResult(${res.id}, '${res.track}')" class="btn-icon" style="background:white; border:1px solid #e2e8f0; border-radius:50%; width:30px; height:30px; cursor:pointer; color:#ef4444;"><i class="fas fa-trash"></i></button>
                    </div>` : '';

                html += `<div class="result-card" style="animation-delay:${idx * 0.1}s; position: relative;">
                            ${actionButtons}
                            <div class="rank-indicator ${rankClass}">${icon ? `<i class="fas ${icon}"></i>` : `#${rank}`}</div>
                            <div class="runner-section">
                                <div class="runner-avatar-lg">${mono}</div>
                                <div class="runner-details">
                                    <h3>${runnerNameDisplay}</h3>

                                    <div style="font-size: 0.85rem; color: #64748b; margin-bottom: 4px;">
                                        <i class="far fa-calendar-alt"></i> ${res.date}
                                    </div>

                                    <div class="runner-meta">
                                        <span><i class="fas fa-sync-alt"></i> ${res.laps_count} kör</span>
                                        <span>•</span>
                                        <span><i class="fas fa-route"></i> ${totalDist.toFixed(2)} km</span>
                                    </div>
                                </div>
                            </div>
                            <div class="data-grid">
                                <div class="main-time">${res.time}</div>
                                <div class="stat-pill"><small>Pace</small><span>${metrics.pace}</span></div>
                                <div class="stat-pill"><small>Sebesség</small><span>${metrics.speed}</span></div>
                            </div>
                            ${laps.length > 0 ? `<button id="btn-res-${idx}" class="details-btn" onclick="toggleLapDetails('res-${idx}')"><i class="fas fa-list-ol"></i> Köridők</button>` : ''}
                            <div id="details-res-${idx}" class="lap-details-wrapper">
                                <table class="lap-table">
                                    <thead><tr><th>Kör</th><th>Idő</th><th>Pace</th><th>km/h</th></tr></thead>
                                    <tbody>${trs}</tbody>
                                </table>
                            </div>
                        </div>`;
            });
        }
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = '<div style="color:#ef4444; text-align:center;">Hiba az adatok betöltésekor.</div>';
        console.error(error);
    }
}

function updateTrackOverlay(trackInfo) {
    const overlay = document.getElementById('track-info-overlay');
    if (!overlay) return;

    overlay.style.display = 'flex';
    document.getElementById('overlay-name').textContent = trackInfo.name;
    document.getElementById('overlay-dist').textContent = `${trackInfo.distance_km_per_lap} km`;
    document.getElementById('overlay-surface').textContent = trackInfo.surface_type;

    const featContainer = document.getElementById('overlay-features');
    let featsHTML = '';

    // Segédfüggvény: Keretes jelvény (Badge) - Pozitív dolgoknak
    const makeBadge = (active, icon, text) =>
        `<div class="feature-badge ${active ? 'active' : ''}"><i class="fas ${icon}"></i> ${text}</div>`;

    // Segédfüggvény: Keret nélküli figyelmeztető szöveg - Negatív/Figyelmeztető dolgoknak
    const makeWarningText = (icon, text) =>
        `<div class="feature-text-warning"><i class="fas ${icon}"></i> ${text}</div>`;


    // --- 1. ALAP TULAJDONSÁGOK ---

    // Fizetős / Ingyenes
    if (trackInfo.is_free) {
        featsHTML += makeBadge(true, 'fa-hand-holding-dollar', 'Ingyenes');
    } else {
        featsHTML += makeWarningText('fa-coins', 'Fizetős');
    }

    // A többi pozitív tulajdonság (Világítás, Öltöző, stb.)
    if (trackInfo.has_lighting) featsHTML += makeBadge(true, 'fa-lightbulb', 'Világítás');
    if (trackInfo.has_lockers) featsHTML += makeBadge(true, 'fa-lock', 'Öltöző');
    if (trackInfo.has_shower) featsHTML += makeBadge(true, 'fa-shower', 'Zuhany');
    if (trackInfo.has_parking) featsHTML += makeBadge(true, 'fa-square-parking', 'Parkoló');
    if (trackInfo.is_dog_friendly) featsHTML += makeBadge(true, 'fa-dog', 'Kutyabarát');


    // --- 2. EXTRA INFÓK (BKV, WC, Nyitvatartás, Víz) ---

    // MÓDOSÍTÁS ITT: BKV vagy Alternatíva
    if (trackInfo.has_public_transport) {
        featsHTML += makeBadge(true, 'fa-bus', 'BKV');
    } else {
        // Ha nincs BKV -> Figyelmeztetés
        featsHTML += makeWarningText('fa-car', 'Kocsi / Gyalog');
    }

    // WC (Ha van)
    if (trackInfo.has_toilet) {
        featsHTML += makeBadge(true, 'fa-restroom', 'WC');
    }

    // NYITVATARTÁS (Nem 0-24 -> Figyelmeztetés)
    if (trackInfo.is_24_7) {
        featsHTML += makeBadge(true, 'fa-clock', '0-24');
    } else {
        featsHTML += makeWarningText('fa-clock', 'Nem 0-24');
    }

    // VÍZVÉTELI LEHETŐSÉG (Nincs víz -> Figyelmeztetés)
    switch (trackInfo.water_option) {
        case 'tap':
            featsHTML += makeBadge(true, 'fa-faucet', 'Ivókút');
            break;
        case 'paid':
            featsHTML += makeBadge(true, 'fa-glass-water', 'Büfé/Bolt');
            break;
        case 'none':
        default:
            featsHTML += makeWarningText('fa-tint-slash', 'Vizet hozni kell');
            break;
    }

    featContainer.innerHTML = featsHTML;
}

// --- ÚJ PARAMÉTER: dateStr, és dátum betöltése ---
function startEdit(id, name, lapsCount, lapTimesStr, trackId, runnerId, dateStr) {
    if (!currentUser) return;

    currentEditingId = id;

    const modal = document.getElementById('admin-modal');
    document.querySelector('#admin-modal h3').innerHTML = '<i class="fas fa-pencil-alt" style="color: var(--accent-color);"></i> Eredmény Szerkesztése';
    document.querySelector('#admin-modal .btn-submit').innerHTML = 'Módosítás <i class="fas fa-save" style="margin-left: 8px;"></i>';

    document.getElementById('input-track').value = trackId;
    document.getElementById('input-name').value = name;

    // Dátum betöltése szerkesztésnél
    if (document.getElementById('input-date') && dateStr) {
        document.getElementById('input-date').value = dateStr;
    }

    const lapsContainer = document.getElementById('laps-container');
    lapsContainer.innerHTML = '';

    if (lapTimesStr) {
        const times = lapTimesStr.split(',').map(s => s.trim());
        times.forEach(time => addLapInput(time));
    } else {
        addLapInput();
    }

    modal.classList.add('active');
}

async function deleteResult(resultId, trackId) {
    if (!confirm("Biztosan törölni szeretnéd ezt az eredményt?")) return;

    try {
        // A '/delete/' részt töröltük az URL végéről!
        const response = await fetch(`/api/results/${resultId}/`, {
            method: 'DELETE',
            headers: { 'X-CSRFToken': getCookie('csrftoken') }
        });

        if (response.ok) { // A 204 No Content is OK-nak számít
            loadResults(trackId);
        } else {
            // Ha mégis hiba van (pl. 403 Forbidden), azt itt látni fogod
            console.error('Delete error status:', response.status);
            alert("Hiba a törlés során (Nincs jogosultság?)");
        }
    } catch (e) {
        console.error(e);
        alert("Hiba történt.");
    }
}

async function handleResultSubmit() {
    const tId = document.getElementById('input-track') ? document.getElementById('input-track').value : null;
    if (!tId) return;

    const tNameInput = document.getElementById('input-name');
    const lapInputs = document.querySelectorAll('.lap-input-field');
    const laps = Array.from(lapInputs).map(i => i.value.trim()).filter(v => v !== "");

    // --- ÚJ: Dátum input lekérése ---
    const tDateInput = document.getElementById('input-date');

    if (!tId || laps.length === 0) { alert("Válassz pályát és adj meg köridőket!"); return; }

    let totalSec = 0, valid = true;
    laps.forEach(t => {
        // JAVÍTÁS: A regex most már engedi az opcionális tizedes részt (pl. .51)
        // Elfogadott: 12:34 vagy 12:34.56 vagy 1:23:45.67
        if (!t.match(/^\d{1,2}:\d{2}(\.\d+)?$/) && !t.match(/^\d{1,2}:\d{2}:\d{2}(\.\d+)?$/)) valid = false;
        totalSec += timeToSeconds(t);
    });

    const btn = document.querySelector('#admin-modal .btn-submit');
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Mentés...';
    btn.disabled = true;

    try {
        const payload = {
            track_id: tId,
            laps_count: laps.length,
            lap_times: laps.join(', '),
            time: secondsToTimeStr(totalSec),
            // --- ÚJ: Dátum elküldése ---
            date: tDateInput ? tDateInput.value : new Date().toISOString().split('T')[0]
        };
        if (tNameInput.value.trim() !== "") payload.runner_name = tNameInput.value;

        let url = '/api/results/save/';
        let method = 'POST';

        if (currentEditingId) {
            url = `/api/results/${currentEditingId}/update/`;
            method = 'PUT';
        }

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('Hiba');

        closeModal('admin-modal');
        loadResults(tId);

    } catch (e) {
        console.error(e);
        alert("Hiba a mentés során.");
    } finally {
        btn.innerHTML = orig;
        btn.disabled = false;
    }
}

/* --- KIJELENTKEZÉS KEZELÉSE --- */

// 1. A gomb erre kattint: Megkérdezi, biztos-e
function confirmLogout() {
    if (confirm("Biztosan ki szeretnél lépni?")) {
        performLogout();
    }
}

// 2. Ez végzi el a tényleges kiléptetést az API-n keresztül
async function performLogout() {
    try {
        // CSRF Token megszerzése (biztonsági okokból kell a Django-nak)
        const csrfToken = getCookie('csrftoken');

        const response = await fetch('/api/logout/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            }
        });

        if (response.ok) {
            // Ha sikeres, újratöltjük az oldalt (így eltűnik a profil és visszajön a belépés gomb)
            // Vagy átirányítjuk a főoldalra:
            window.location.href = "/";
        } else {
            alert("Hiba történt a kijelentkezéskor.");
        }
    } catch (error) {
        console.error("Hálózati hiba:", error);
    }
}

// 3. Segédfüggvény a Cookie olvasáshoz
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

window.addNewResult = handleResultSubmit;

// --- LIVE TRACKER LOGIKA (DASHBOARD - VEVŐ) ---

// JAVÍTÁS: Kezdetben null érték, hogy ne dobjon hibát ott, ahol nincs Leaflet betöltve!
let liveLayer = null;
let activeLiveLine = null;

async function updateLiveRunners() {
    // Ha nincs Live Runner lista a DOM-ban (pl. nem a dashboardon vagyunk), kilépünk
    if (!document.getElementById('live-runners-list')) return;

    try {
        const res = await fetch('/api/live/active/');
        const runners = await res.json();

        const list = document.getElementById('live-runners-list');
        list.innerHTML = runners.length ? '' : '<div style="color:#64748b; font-size:0.8rem; font-style:italic;">Nincs aktív futó.</div>';

        // JAVÍTÁS: Csak akkor nyúlunk a térképhez, ha a Leaflet (L) és a térkép (map) is létezik
        if(typeof map !== 'undefined' && map && typeof L !== 'undefined') {
            if (!liveLayer) {
                liveLayer = L.layerGroup(); // Csak itt hozzuk létre!
            }
            liveLayer.clearLayers();
            liveLayer.addTo(map);
        }

        runners.forEach(r => {
            // STÁTUSZ LOGIKA
            let statusText = `${r.distance} méternél`;
            let statusColor = "var(--neon-blue)";
            let cardBorder = "var(--neon-blue)";
            let iconHtml = '<i class="fas fa-running" style="color:white; font-size:14px;"></i>';
            let pulseClass = 'runner-pulse-icon'; // Alap kék/pink lüktetés

            if (r.status === 'paused') {
                statusText = `Megállt (${r.distance}m)`;
                statusColor = "var(--neon-orange)"; // Narancs
                cardBorder = "var(--neon-orange)";
                pulseClass = 'runner-pulse-icon paused'; // Ezt majd CSS-ben átírhatjuk sárgára
                iconHtml = '<i class="fas fa-pause" style="color:white; font-size:12px;"></i>';
            }
            else if (r.status === 'finished') {
                statusText = `CÉLBAÉRT! 🏆`;
                statusColor = "var(--neon-gold)"; // Arany
                cardBorder = "var(--neon-gold)";
                pulseClass = 'runner-pulse-icon finished';
                iconHtml = '<i class="fas fa-flag-checkered" style="color:black; font-size:14px;"></i>';
            }

            // 1. KÁRTYA
            let card = document.createElement('div');
            card.className = 'live-runner-card';
            // Egyedi keretszín a státusz alapján
            card.style.borderLeft = `3px solid ${cardBorder}`;

            card.innerHTML = `
                <div style="font-weight:bold; color:#fff;">${r.full_name}</div>
                <div style="font-size:0.8rem; color:#94a3b8;">${r.track_name}</div>
                <div style="font-size:0.9rem; margin-top:5px; font-weight:bold; color:${statusColor};">
                    <i class="fas fa-map-marker-alt"></i> ${statusText}
                </div>
            `;
            card.onclick = () => focusLiveRunner(r);
            list.appendChild(card);

            // 2. MARKER (Státuszfüggő ikonnal)
            if(r.position && typeof map !== 'undefined' && map && typeof L !== 'undefined') {
                if (!liveLayer) { liveLayer = L.layerGroup(); liveLayer.addTo(map); }

                let icon = L.divIcon({
                    className: pulseClass, // Használjuk a státusz osztályt
                    html: iconHtml,
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                });

                L.marker([r.position.lat, r.position.lon], {icon: icon})
                 .bindPopup(`<b style="color:black">${r.full_name}</b><br>${statusText}`)
                 .addTo(liveLayer);
            }
        });

    } catch(e) {
        console.error("Live update hiba:", e);
    }
}

async function focusLiveRunner(runner) {
    if(typeof map === 'undefined' || !map) return;

    // 1. Megkeressük a pályát a memóriában lévő adatok között
    // (A tracksData-t már betöltötte az initTracks függvény)
    const track = tracksData.find(t => t.id === runner.track_id);

    // 2. Ha van korábbi útvonal berajzolva, töröljük
    if (activeLiveLine) {
        map.removeLayer(activeLiveLine);
        activeLiveLine = null;
    }

    // 3. Ha megvan a pálya és vannak koordináták, berajzoljuk
    if (track && track.coordinates && track.coordinates.length > 0) {
        activeLiveLine = L.polyline(track.coordinates, {
            color: '#bc13fe',       // Neon Lila (hogy különbözzön a sima pályanézegetőtől)
            weight: 5,              // Kicsit vastagabb
            opacity: 0.8,
            lineJoin: 'round',
            dashArray: '10, 10',    // Opcionális: szaggatott vonal, ami "aktív" hatást kelt
            className: 'anim-dash'  // Ha akarsz CSS animációt rá (lásd lentebb)
        }).addTo(map);
    }

    // 4. Térkép fókuszálása a futóra (zoomolás)
    if(runner.position) {
        // Finom animált repülés a futóhoz
        map.flyTo([runner.position.lat, runner.position.lon], 16, {
            animate: true,
            duration: 1.5
        });
    } else if (activeLiveLine) {
        // Ha nincs futó pozíció (bár kéne legyen), akkor a pályára igazítjuk
        map.fitBounds(activeLiveLine.getBounds());
    }
}

// Polling indítása
setInterval(updateLiveRunners, 5000);

// --- INICIALIZÁLÁS ---

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuthStatus();
    initTracks();
    updateLiveRunners();
});
