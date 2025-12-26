// static/js/stopwatch.js

let startTime = 0;
let elapsedTime = 0;
let timerInterval;
let isRunning = false;

// Köridők tárolása
let laps = [];
let lastLapTime = 0;

// Felhasználó státusz
let userIsLoggedIn = false;

// Elemek
const displayMain = document.getElementById('display-main');
const displayLap = document.querySelector('#display-lap span');
const statusBadge = document.getElementById('timer-status');

const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnLap = document.getElementById('btn-lap');
const btnReset = document.getElementById('btn-reset');

const lapsWrapper = document.getElementById('laps-wrapper');
const lapsList = document.getElementById('laps-list');
const saveSection = document.getElementById('save-section');
const trackSelect = document.getElementById('sw-track-select');

// --- PÁLYÁK BETÖLTÉSE ---
async function loadTracksForSelect() {
    try {
        const response = await fetch('/api/tracks/');
        const tracks = await response.json();

        trackSelect.innerHTML = '<option value="" disabled selected>Válassz pályát a méréshez...</option>';

        tracks.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.innerText = t.name;
            trackSelect.appendChild(opt);
        });
    } catch (e) {
        console.error("Hiba a pályák betöltésekor", e);
    }
}

// --- JAVÍTOTT IDŐ FORMÁZÁS ---
// Fontos: A pont (.) választja el a másodpercet a századoktól mentéskor!
// Ez kompatibilissé teszi a script.js számolásával.
// --- JAVÍTOTT IDŐ FORMÁZÁS (Hossz optimalizálva) ---
function formatTime(ms, forDisplay = false) {
    if (ms < 0) ms = 0;

    const date = new Date(ms);
    const h = Math.floor(ms / 3600000);
    const m = date.getUTCMinutes().toString().padStart(2, '0');
    const s = date.getUTCSeconds().toString().padStart(2, '0');
    const msStr = Math.floor(date.getUTCMilliseconds() / 10).toString().padStart(2, '0');

    // Ha kijelzőre megy (Display), maradhat a szép hosszú formátum
    if (forDisplay) {
        const hStr = h.toString().padStart(2, '0');
        if (h > 0) return `${hStr}:${m}:${s}:${msStr}`;
        return `${m}:${s}:${msStr}`; // Kijelzőn: MM:SS:ms
    } else {
        // Mentéshez (ADATBÁZIS - MAX 10 KARAKTER!): 
        // A trükk: Ha nincs óra, levágjuk az elejét, hogy beférjen.

        if (h > 0) {
            // Ha van óra: H:MM:SS.ms (pl. 1:15:20.99 -> 10 kar)
            // Itt nem használunk vezető nullát az óránál, hogy spóroljunk a hellyel
            return `${h}:${m}:${s}.${msStr}`;
        } else {
            // Ha nincs óra: MM:SS.ms (pl. 16:09.55 -> 8 kar)
            // Ez befér a 10-es limitbe és a Dashboard is jól számol vele!
            return `${m}:${s}.${msStr}`;
        }
    }
}

// --- STOPPER LOGIKA ---
function updateDisplay() {
    const now = Date.now();
    const totalDiff = now - startTime + elapsedTime;

    // Fő idő (Display mód)
    displayMain.textContent = formatTime(totalDiff, true);

    // Aktuális kör (Display mód)
    const currentLapDiff = totalDiff - lastLapTime;
    displayLap.textContent = formatTime(currentLapDiff, true);
}

function startTimer() {
    if (!trackSelect.value) {
        alert("Kérlek válassz pályát először!");
        trackSelect.focus();
        return;
    }

    const tempLap = document.querySelector('.temp-lap-row');
    if (tempLap) tempLap.remove();

    startTime = Date.now();
    timerInterval = setInterval(updateDisplay, 10);
    isRunning = true;

    // UI
    btnStart.classList.add('hidden');
    btnStop.classList.remove('hidden');
    btnLap.disabled = false;
    btnReset.disabled = true;
    saveSection.classList.add('hidden');
    trackSelect.disabled = true;

    statusBadge.textContent = "FUTÁS...";
    statusBadge.style.background = "rgba(57, 255, 20, 0.2)";
    statusBadge.style.color = "var(--neon-green)";
}

function stopTimer() {
    clearInterval(timerInterval);
    elapsedTime += Date.now() - startTime;
    isRunning = false;

    // Utolsó szakasz megjelenítése
    const currentTotal = elapsedTime;
    if (currentTotal > lastLapTime) {
        const fragmentMs = currentTotal - lastLapTime;
        if (fragmentMs > 100) {
            // Itt is Display módot használunk a megjelenítéshez
            const lapTimeStr = formatTime(fragmentMs, true);
            const totalTimeStr = formatTime(currentTotal, true);
            const nextIndex = laps.length + 1;

            const tempRow = `
                <div class="lap-item temp-lap-row" style="border-left: 3px solid var(--neon-orange); background: rgba(255, 159, 67, 0.1);">
                    <span>${nextIndex}. kör (Stop)</span>
                    <span>${lapTimeStr}</span>
                    <span style="color:#64748b; font-size:0.8em;">${totalTimeStr}</span>
                </div>
            `;
            lapsWrapper.classList.remove('hidden');
            lapsList.insertAdjacentHTML('afterbegin', tempRow);
        }
    }

    // UI
    btnStop.classList.add('hidden');
    btnStart.classList.remove('hidden');
    btnStart.innerHTML = '<i class="fas fa-play"></i> Folytatás';
    btnLap.disabled = true;
    btnReset.disabled = false;
    saveSection.classList.remove('hidden');

    statusBadge.textContent = "MEGÁLLÍTVA";
    statusBadge.style.background = "rgba(255, 71, 87, 0.2)";
    statusBadge.style.color = "#ff4757";
}

function resetTimer() {
    clearInterval(timerInterval);
    startTime = 0;
    elapsedTime = 0;
    laps = [];
    lastLapTime = 0;
    isRunning = false;

    displayMain.textContent = "00:00:00";
    displayLap.textContent = "00:00:00";
    lapsList.innerHTML = '';
    lapsWrapper.classList.add('hidden');
    saveSection.classList.add('hidden');
    trackSelect.disabled = false;

    btnStart.innerHTML = '<i class="fas fa-play"></i> Start';
    btnLap.disabled = true;
    btnReset.disabled = true;

    statusBadge.textContent = "VÁRAKOZÁS";
    statusBadge.style.background = "rgba(255,255,255,0.1)";
    statusBadge.style.color = "white";
}

function recordLap() {
    if (!isRunning) return;

    const now = Date.now();
    const currentTotal = now - startTime + elapsedTime;
    const lapTimeMs = currentTotal - lastLapTime;

    const lapObj = {
        index: laps.length + 1,
        // Megjelenítéshez (TRUE)
        lapTime: formatTime(lapTimeMs, true),
        totalTime: formatTime(currentTotal, true),
        rawLap: lapTimeMs
    };

    laps.unshift(lapObj);
    lastLapTime = currentTotal;

    renderLaps();
}

function renderLaps() {
    lapsWrapper.classList.remove('hidden');
    lapsList.innerHTML = laps.map(l => `
        <div class="lap-item">
            <span>${l.index}. kör</span>
            <span>${l.lapTime}</span>
            <span style="color:#64748b; font-size:0.8em;">${l.totalTime}</span>
        </div>
    `).join('');
}

// --- MENTÉS (A LÉNYEG) ---
async function saveSession() {
    let finalLaps = [...laps].reverse();

    const currentTotal = elapsedTime;
    if (currentTotal > lastLapTime) {
        const lastFragment = currentTotal - lastLapTime;
        if (lastFragment > 1000) {
            finalLaps.push({
                // Mentéshez (FALSE) -> HH:MM:SS.ms formátum
                lapTime: formatTime(lastFragment, false)
            });
        }
    }

    if (finalLaps.length === 0) {
        finalLaps.push({ lapTime: formatTime(currentTotal, false) });
    }

    const payload = {
        track_id: trackSelect.value,
        laps_count: finalLaps.length,
        // Itt használjuk a FALSE paramétert, hogy a backend helyes formátumot kapjon
        lap_times: finalLaps.map(l => {
            // Ha a listában már a 'display' formátum van, újra kell számolni a rawLap-ból
            // VAGY: ha a lapObj-ben csak a string van, konvertáljuk. 
            // Egyszerűbb, ha a rawLap alapján generáljuk újra a helyes stringet:
            if (l.rawLap) return formatTime(l.rawLap, false);
            // Ha az utolsó töredék (ami most lett hozzáadva), az már helyes string lehet
            return l.lapTime;
        }).join(', '),

        time: formatTime(currentTotal, false), // Ez is HH:MM:SS.ms lesz
        date: new Date().toISOString().split('T')[0]
    };

    const btn = document.querySelector('.btn-save-session');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Mentés...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/results/save/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            alert("Sikeres mentés!");
            window.location.href = `/dashboard/?track_id=${trackSelect.value}`;
        } else {
            const err = await response.json();
            alert("Hiba: " + JSON.stringify(err));
        }

    } catch (e) {
        console.error(e);
        alert("Hálózati hiba.");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
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

// --- AUTH ELLENŐRZÉS ÉS INICIALIZÁLÁS ---
async function initStopwatchPage() {
    await loadTracksForSelect();

    try {
        const response = await fetch('/api/whoami/');
        const user = await response.json();
        userIsLoggedIn = user.is_authenticated;
    } catch (e) {
        console.error("Auth check error:", e);
    }
}

function handleStartClick() {
    if (!userIsLoggedIn) {
        alert("A stopper használatához és az eredmény mentéséhez kérlek jelentkezz be!");
        if (typeof openLoginModal === 'function') {
            openLoginModal();
        }
        return;
    }
    startTimer();
}

if (btnStart) btnStart.addEventListener('click', handleStartClick);
if (btnStop) btnStop.addEventListener('click', stopTimer);
if (btnLap) btnLap.addEventListener('click', recordLap);
if (btnReset) btnReset.addEventListener('click', resetTimer);

document.addEventListener('DOMContentLoaded', initStopwatchPage);