document.addEventListener('DOMContentLoaded', () => {
    initNavbar();
});

// Ez a biztonsági frissítés betöltés után
window.addEventListener('load', () => {
    if (window.innerWidth > 900) {
        const activeLink = document.querySelector('.nav-link.active');
        if (activeLink) updateIndicator(activeLink);
    }
});

function initNavbar() {
    // 1. HAMBURGER MENÜ LOGIKA
    const hamburger = document.getElementById("hamburger-btn");
    const navMenu = document.getElementById("nav-menu");

    if (hamburger && navMenu) {
        hamburger.addEventListener("click", () => {
            hamburger.classList.toggle("active");
            navMenu.classList.toggle("active");
            // Ikon animáció
            const spans = hamburger.querySelectorAll('span');
            if (hamburger.classList.contains('active')) {
                spans[0].style.transform = "rotate(45deg) translate(5px, 5px)";
                spans[1].style.opacity = "0";
                spans[2].style.transform = "rotate(-45deg) translate(5px, -5px)";
            } else {
                spans[0].style.transform = "none";
                spans[1].style.opacity = "1";
                spans[2].style.transform = "none";
            }
        });
        // Bezárás kattintásra
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove("active");
                navMenu.classList.remove("active");
                // Ikon reset
                const spans = hamburger.querySelectorAll('span');
                spans[0].style.transform = "none";
                spans[1].style.opacity = "1";
                spans[2].style.transform = "none";
            });
        });
    }

    // 2. AKTÍV LINK BEÁLLÍTÁSA
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPath || (currentPath === '/' && href === '/')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    // 3. NEON INDICATOR (A LÉNYEG!)
    const navItemsContainer = document.querySelector('.nav-items');

    // Csak PC-n fusson
    if (navItemsContainer && window.innerWidth > 900) {

        // --- ITT HOZZUK LÉTRE A CSÍKOT ---
        let indicator = document.querySelector('.nav-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.classList.add('nav-indicator'); // Fontos: a CSS erre hivatkozik!
            navItemsContainer.appendChild(indicator);
        }

        const activeLink = document.querySelector('.nav-link.active');

        // Pozícionálás
        if (activeLink) {
            // Kis timeout, hogy a CSS biztosan betöltsön
            setTimeout(() => updateIndicator(activeLink), 100);
        } else {
            indicator.style.opacity = '0';
        }

        // Hover események
        navLinks.forEach(link => {
            link.addEventListener('mouseenter', (e) => updateIndicator(e.target));
        });

        navItemsContainer.addEventListener('mouseleave', () => {
            const currentActive = document.querySelector('.nav-link.active');
            if (currentActive) updateIndicator(currentActive);
            else indicator.style.opacity = '0';
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 900) {
                const currentActive = document.querySelector('.nav-link.active');
                if (currentActive) updateIndicator(currentActive);
            }
        });
    }
}

function updateIndicator(element) {
    const indicator = document.querySelector('.nav-indicator');
    if (!indicator || !element) return;

    // Debug log a konzolra, hogy lásd, fut-e:
    // console.log("Indikátor mozgatása ide:", element.innerText);

    const left = element.offsetLeft;
    const width = element.offsetWidth;

    indicator.style.left = `${left}px`;
    indicator.style.width = `${width}px`;
    indicator.style.opacity = '1';
}