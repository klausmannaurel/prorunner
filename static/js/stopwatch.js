// static/js/stopwatch.js

let pollingInterval = null;
let isRunActive = false;
let userIsLoggedIn = false;

// Elemek a DOM-ból
const setupPanel = document.getElementById('setup-panel');
const monitorPanel = document.getElementById('monitor-panel');
const trackSelect = document.getElementById('sw-track-select');
const lapsInput = document.getElementById('target-laps');

// Monitor panel kijelző elemei
const elStatus = document.getElementById('monitor-status');
const elTime = document.getElementById('monitor-time');
const elTrackName = document.getElementById('monitor-track-name');
const elProgress = document.getElementById('monitor-progress');
const elSpeed = document.getElementById('val-speed');
const elPace = document.getElementById('val-pace');
const elDist = document.getElementById('val-dist');
const elLap = document.getElementById('val-lap');
const elTotalLaps = document.getElementById('val-total-laps');

// --- 1. INICIALIZÁLÁS ---

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();     // Ellenőrizzük, be van-e lépve
    await loadTracks();    // Betöltjük a pályákat (ez hiányzott!)
    startPolling();        // Elindítjuk a figyelést
});

// Auth ellenőrzés
async function checkAuth() {
    try {
        const response = await fetch('/api/whoami/');
        const user = await response.json();
        userIsLoggedIn = user.is_authenticated;
        
        // Ha nincs belépve, jelezzük a gomb helyén
        if (!userIsLoggedIn) {
            const btn = document.getElementById('btn-set-ready');
            if(btn) {
                btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> JELENTKEZZ BE!';
                btn.classList.add('btn-secondary'); 
                btn.onclick = () => { if(typeof openLoginModal === 'function') openLoginModal(); };
            }
        }
    } catch (e) {
        console.error("Auth check error:", e);
    }
}

// Pályák betöltése (EZ A FÜGGVÉNY HIÁNYZOTT NÁLAD)
async function loadTracks() {
    try {
        const res = await fetch('/api/tracks/');
        const tracks = await res.json();
        
        let html = '<option value="" disabled selected>Válassz pályát...</option>';
        tracks.forEach(t => {
            html += `<option value="${t.id}">${t.name} (${t.distance_km_per_lap} km)</option>`;
        });
        if(trackSelect) trackSelect.innerHTML = html;
    } catch (e) {
        console.error("Hiba a pályák betöltésekor:", e);
    }
}

// --- 2. SETUP PANEL LOGIKA (Beállítások) ---

// Körszám növelése/csökkentése a +/- gombokkal
window.changeLaps = function(delta) {
    if(!lapsInput) return;
    let val = parseInt(lapsInput.value) || 1;
    val += delta;
    if (val < 1) val = 1;
    lapsInput.value = val;
}

// "RAJTRA KÉSZ" gomb funkciója
window.setReady = async function() {
    if (!userIsLoggedIn) {
        if(typeof openLoginModal === 'function') openLoginModal();
        else alert("Jelentkezz be!");
        return;
    }

    const trackId = trackSelect.value;
    const laps = lapsInput.value;

    if (!trackId) {
        alert("Kérlek válassz pályát!");
        return;
    }

    const btn = document.getElementById('btn-set-ready');
    if(btn) {
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> KÜLDÉS...';
        btn.disabled = true;
    }

    try {
        const csrf = getCookie('csrftoken');
        const res = await fetch('/api/live/set-ready/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
            body: JSON.stringify({ track_id: trackId, target_laps: laps })
        });

        if (res.ok) {
            console.log("Státusz: READY. Várakozás a GPS adatokra...");
            // A polling rendszer a következő másodpercben érzékeli a változást és frissíti a UI-t
        } else {
            alert("Hiba a beállítás során.");
            if(btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check-circle"></i> RAJTRA KÉSZ';
            }
        }
    } catch (e) {
        console.error(e);
        if(btn) btn.disabled = false;
    }
}

// --- 3. POLLING ÉS MONITORING (A LÉNYEG) ---

function startPolling() {
    checkStatus(); // Azonnali hívás
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(checkStatus, 1000); // 1 másodperces frissítés
}

async function checkStatus() {
    try {
        const res = await fetch('/api/live/status/');
        const data = await res.json();

        // 1. Eset: Nincs aktív futás (IDLE) -> Setup Panel
        if (data.status === 'idle') {
            if(setupPanel) setupPanel.classList.remove('hidden');
            if(monitorPanel) monitorPanel.classList.add('hidden');
            
            // Ha volt mentés gomb, tüntessük el
            const saveContainer = document.getElementById('save-section');
            if (saveContainer) saveContainer.classList.add('hidden');
            
            isRunActive = false;
            return;
        }

        // 2. Eset: Van futás (Ready/Running/Finished) -> Monitor Panel
        if(setupPanel) setupPanel.classList.add('hidden');
        if(monitorPanel) monitorPanel.classList.remove('hidden');
        isRunActive = true;

        updateMonitorUI(data);

    } catch (e) {
        console.error("Polling hiba:", e);
    }
}

function updateMonitorUI(data) {
    // Pálya neve és Idő
    if(elTrackName) elTrackName.textContent = data.track_name || "Ismeretlen pálya";
    if(elTime) elTime.textContent = formatTime(data.elapsed_seconds);
    
    // Státusz kijelzés és színezés
    if(elStatus) {
        elStatus.textContent = translateStatus(data.status);
        setStatusColor(data.status);
    }

    // Telemetria adatok
    if(elSpeed) elSpeed.textContent = data.speed ? data.speed.toFixed(1) : "0.0";
    if(elPace) elPace.textContent = data.pace || "-:--";
    if(elDist) elDist.textContent = Math.round(data.current_distance || 0);
    
    // Körszámláló
    if(elLap) elLap.textContent = (data.current_lap === 0 ? 1 : data.current_lap);
    if(elTotalLaps) elTotalLaps.textContent = data.target_laps;

    // Progress Bar
    if(elProgress) elProgress.style.width = `${data.progress || 0}%`;

    // --- MENTÉS GOMB MEGJELENÍTÉSE (CSAK CÉLBAÉRÉSKOR) ---
    const saveContainer = document.getElementById('save-section');
    
    if (data.status === 'finished') {
        if (saveContainer) {
            // Csak akkor rajzoljuk ki újra, ha még nincs ott a gomb
            if(!saveContainer.innerHTML.includes('Eredmény Mentése')) {
                // A lap_times JSON string biztonságos átadása a függvénynek
                const safeLapTimes = escapeJs(data.lap_times); 
                
                 saveContainer.innerHTML = `
                    <div style="background:rgba(0,0,0,0.5); padding:20px; border-radius:15px; text-align:center; margin-top:20px; border:1px solid var(--neon-green);">
                        <h3 style="color:var(--neon-green); margin-bottom:10px;">⏱️ Célba értél!</h3>
                        <p style="color:white; font-size:1.2rem; margin-bottom:15px;">Hivatalos idő: ${formatTime(data.elapsed_seconds)}</p>
                        <button onclick="saveFinishedRun('${data.track_id}', ${data.elapsed_seconds}, '${safeLapTimes}')" 
                                class="btn-save-session" 
                                style="width:100%; padding:15px; background:linear-gradient(90deg, var(--neon-green), #27ae60); color:black; font-weight:bold; border:none; border-radius:10px; cursor:pointer; font-size:1.1rem; text-transform:uppercase;">
                            Eredmény Mentése <i class="fas fa-save"></i>
                        </button>
                    </div>
                `;
            }
            saveContainer.classList.remove('hidden');
        }
    } else {
        // Ha még nem ért célba, rejtsük el a mentés panelt
        if (saveContainer) {
            saveContainer.classList.add('hidden');
            saveContainer.innerHTML = ''; 
        }
    }
}

// --- 4. MENTÉS FUNKCIÓ (Backend hívás) ---

window.saveFinishedRun = async function(trackId, totalSeconds, lapTimesJson) {
    if(!confirm("Szeretnéd véglegesíteni és menteni az eredményt?")) return;

    // Köridők parse-olása (JSON stringből tömbbé)
    let lapTimesArray = [];
    try {
        if (typeof lapTimesJson === 'string') {
             // Ha '[]' vagy valódi JSON jön stringként
             lapTimesArray = JSON.parse(lapTimesJson);
        } else {
             lapTimesArray = lapTimesJson;
        }
    } catch(e) { console.error("JSON hiba a köridőknél:", e); }

    // Ha üres lenne a tömb, az összidőt vesszük fel egyetlen körnek
    if (!Array.isArray(lapTimesArray) || lapTimesArray.length === 0) {
        lapTimesArray = [formatTime(totalSeconds)];
    }

    const payload = {
        track_id: trackId,
        laps_count: lapTimesArray.length,
        lap_times: lapTimesArray.join(', '), 
        time: formatTime(totalSeconds),
        date: new Date().toISOString().split('T')[0] // Mai dátum
    };

    const btn = document.querySelector('.btn-save-session');
    if(btn) {
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Mentés...';
        btn.disabled = true;
    }

    try {
        const csrf = getCookie('csrftoken');
        
        // 1. Mentés a Results táblába
        const resSave = await fetch('/api/results/save/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
            body: JSON.stringify(payload)
        });

        if (resSave.ok) {
            alert("Eredmény sikeresen mentve!");
            
            // 2. LiveRun törlése (tiszta lappal indulunk legközelebb)
            await fetch('/api/live/stop/', { method: 'POST', headers: {'X-CSRFToken': csrf} });
            
            // 3. Átirányítás az eredményekhez
            window.location.href = "/my-results/";
        } else {
            const err = await resSave.json();
            alert("Hiba a mentéskor: " + JSON.stringify(err));
            if(btn) {
                btn.innerHTML = 'Eredmény Mentése <i class="fas fa-save"></i>';
                btn.disabled = false;
            }
        }
    } catch(e) {
        console.error(e);
        alert("Hálózati hiba.");
        if(btn) {
             btn.innerHTML = 'Eredmény Mentése <i class="fas fa-save"></i>';
             btn.disabled = false;
        }
    }
}

// --- 5. SEGÉDFÜGGVÉNYEK ---

// Idő formázása (HH:MM:SS)
function formatTime(totalSeconds) {
    if (!totalSeconds || totalSeconds < 0) return "00:00:00";
    
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);

    return [h, m, s]
        .map(v => v < 10 ? "0" + v : v)
        .join(":");
}

// Státusz szöveg magyarítása
function translateStatus(status) {
    switch(status) {
        case 'ready': return "RAJTRA KÉSZ (VÁRAKOZÁS GPS-RE...)";
        case 'running': return "FUTÁS FOLYAMATBAN";
        case 'paused': return "SZÜNETELTETVE";
        case 'finished': return "CÉLBAÉRÉS! GRATULÁLOK!";
        default: return status;
    }
}

// Státusz színkódok beállítása
function setStatusColor(status) {
    if(!elStatus) return;
    if (status === 'ready') {
        elStatus.style.background = "rgba(0, 243, 255, 0.2)";
        elStatus.style.color = "var(--neon-blue)";
        elStatus.classList.remove('blink');
    } else if (status === 'running') {
        elStatus.style.background = "rgba(57, 255, 20, 0.2)";
        elStatus.style.color = "var(--neon-green)";
        elStatus.classList.add('blink'); 
    } else if (status === 'paused') {
        elStatus.style.background = "rgba(255, 159, 67, 0.2)";
        elStatus.style.color = "var(--neon-orange)";
        elStatus.classList.remove('blink');
    } else if (status === 'finished') {
        elStatus.style.background = "rgba(255, 215, 0, 0.2)";
        elStatus.style.color = "#FFD700";
        elStatus.classList.add('blink');
    }
}

// Beragadt futás törlése
window.forceStopRun = async function() {
    if(!confirm("Biztosan törlöd a jelenlegi (esetleg beragadt) futást?")) return;
    try {
        const csrf = getCookie('csrftoken');
        await fetch('/api/live/stop/', { method: 'POST', headers: {'X-CSRFToken': csrf} });
        // A polling majd érzékeli az 'idle' státuszt és visszaáll alaphelyzetbe
    } catch(e) { console.error(e); }
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

// Biztonsági karaktercsere a HTML attribútumba írt JSON stringhez
function escapeJs(str) {
    if (!str) return '[]';
    // Escape-eljük az aposztrófokat és idézőjeleket
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
