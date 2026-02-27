// ============================================================
//  UI MANAGER — HUD, screens, transitions, banners
// ============================================================

const UI = (() => {
    // ── Element cache ─────────────────────────────────────────
    const els = {};

    function init() {
        const ids = [
            'player-health-fill', 'player-health-text',
            'player-stamina-fill',
            'boss-health-panel', 'boss-health-fill', 'boss-health-text',
            'boss-name-label', 'boss-phase-label',
            'event-banner', 'wave-banner',
            'hud-kills', 'hud-wave',
            'hit-flash',
            'minimap-canvas',
            'victory-stats', 'defeat-stats',
            'title-screen', 'game-screen', 'pause-screen',
            'victory-screen', 'defeat-screen',
            'btn-start', 'btn-howto',
            'btn-resume', 'btn-restart-pause', 'btn-menu-pause',
            'btn-play-again', 'btn-menu-victory',
            'btn-retry', 'btn-menu-defeat',
            'btn-pause',
        ];
        ids.forEach(id => { els[id] = document.getElementById(id); });
    }

    // ── Screen management ─────────────────────────────────────
    function showScreen(id) {
        ['title-screen', 'game-screen', 'pause-screen', 'victory-screen', 'defeat-screen']
            .forEach(s => {
                const el = els[s];
                if (!el) return;
                if (s === id) {
                    el.classList.remove('hidden');
                    el.classList.add('active');
                } else if (s === 'game-screen') {
                    el.classList.remove('active');
                    // Keep game-screen in DOM but hidden for pause/overlay
                } else {
                    el.classList.add('hidden');
                    el.classList.remove('active');
                }
            });
        // Overlays shown on top of game screen
        if (['pause-screen', 'victory-screen', 'defeat-screen'].includes(id)) {
            const g = els['game-screen'];
            if (g) g.classList.add('active');  // keep game visible beneath overlay
        }
    }

    // ── Player HUD ────────────────────────────────────────────
    function updatePlayerHealth(hp, hpMax) {
        const pct = Math.max(0, hp / hpMax);
        if (els['player-health-fill']) {
            els['player-health-fill'].style.width = `${pct * 100}%`;
            const hue = pct > 0.5 ? 120 : pct > 0.25 ? 40 : 0;
            els['player-health-fill'].style.background =
                `linear-gradient(90deg, hsl(${hue},70%,35%), hsl(${hue},80%,50%))`;
        }
        if (els['player-health-text'])
            els['player-health-text'].textContent = `${Math.ceil(hp)} / ${hpMax}`;
    }

    function updateStamina(stamina, max) {
        const pct = Math.max(0, stamina / max);
        if (els['player-stamina-fill'])
            els['player-stamina-fill'].style.width = `${pct * 100}%`;
    }

    function updateKills(count) {
        if (els['hud-kills']) els['hud-kills'].textContent = `⚔ Fallen: ${count}`;
    }

    function updateWave(wave) {
        if (els['hud-wave']) els['hud-wave'].textContent = `Wave: ${wave}`;
    }

    // ── Boss HUD ─────────────────────────────────────────────
    function showBossHUD(name) {
        const panel = els['boss-health-panel'];
        if (panel) panel.classList.remove('hidden');
        if (els['boss-name-label']) els['boss-name-label'].textContent = name.toUpperCase();
    }

    function hideBossHUD() {
        const panel = els['boss-health-panel'];
        if (panel) panel.classList.add('hidden');
    }

    function updateBossHealth(hp, hpMax, phase) {
        const pct = Math.max(0, hp / hpMax);
        if (els['boss-health-fill']) {
            els['boss-health-fill'].style.width = `${pct * 100}%`;
        }
        if (els['boss-health-text'])
            els['boss-health-text'].textContent = `${Math.ceil(hp)} / ${hpMax}`;
        if (els['boss-phase-label'])
            els['boss-phase-label'].textContent = phase === 2 ? '⚔ ENRAGED' : '';
    }

    // ── Event banner ─────────────────────────────────────────
    let _bannerTimer = null;
    function showEventBanner(msg, color = '#ffe060', duration = 3.0) {
        const el = els['event-banner'];
        if (!el) return;
        el.textContent = msg;
        el.style.color = color;
        el.style.borderColor = color;
        el.classList.remove('hidden');
        el.classList.add('banner-show');
        if (_bannerTimer) clearTimeout(_bannerTimer);
        _bannerTimer = setTimeout(() => {
            el.classList.remove('banner-show');
            el.classList.add('banner-hide');
            setTimeout(() => {
                el.classList.add('hidden');
                el.classList.remove('banner-hide');
            }, 500);
        }, duration * 1000);
    }

    let _waveBannerTimer = null;
    function showWaveBanner(msg, duration = 2.5) {
        const el = els['wave-banner'];
        if (!el) return;
        el.textContent = msg;
        el.classList.remove('hidden');
        el.classList.add('banner-show');
        if (_waveBannerTimer) clearTimeout(_waveBannerTimer);
        _waveBannerTimer = setTimeout(() => {
            el.classList.remove('banner-show');
            el.classList.add('banner-hide');
            setTimeout(() => {
                el.classList.add('hidden');
                el.classList.remove('banner-hide');
            }, 600);
        }, duration * 1000);
    }

    // ── Hit flash ────────────────────────────────────────────
    let _flashTimer = null;
    function flashHit() {
        const el = els['hit-flash'];
        if (!el) return;
        el.classList.add('flashing');
        if (_flashTimer) clearTimeout(_flashTimer);
        _flashTimer = setTimeout(() => el.classList.remove('flashing'), 160);
    }

    // ── Victory / Defeat screens ─────────────────────────────
    function showVictory(stats) {
        showScreen('victory-screen');
        if (els['victory-stats']) {
            els['victory-stats'].innerHTML = `
        <div class="stat-row"><span>Enemies Slain</span><span>${stats.kills}</span></div>
        <div class="stat-row"><span>Damage Dealt</span><span>${stats.damageDealt}</span></div>
        <div class="stat-row"><span>Damage Taken</span><span>${stats.damageTaken}</span></div>
      `;
        }
    }

    function showDefeat(stats) {
        showScreen('defeat-screen');
        if (els['defeat-stats']) {
            els['defeat-stats'].innerHTML = `
        <div class="stat-row"><span>Enemies Slain</span><span>${stats.kills}</span></div>
        <div class="stat-row"><span>Damage Dealt</span><span>${stats.damageDealt}</span></div>
        <div class="stat-row"><span>Waves Survived</span><span>${stats.wave}</span></div>
      `;
        }
    }

    return {
        init, showScreen,
        updatePlayerHealth, updateStamina, updateKills, updateWave,
        showBossHUD, hideBossHUD, updateBossHealth,
        showEventBanner, showWaveBanner,
        flashHit,
        showVictory, showDefeat,
        els,
    };
})();
