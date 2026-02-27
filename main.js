// ============================================================
//  MAIN — Game state manager, game loop, orchestration
// ============================================================

const GamePhase = Object.freeze({
    TITLE: 'title',
    PLAYING: 'playing',
    PAUSED: 'paused',
    VICTORY: 'victory',
    DEFEAT: 'defeat',
});

class Game {
    constructor() {
        this.phase = GamePhase.TITLE;

        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.mmCanvas = document.getElementById('minimap-canvas');
        this.mmCtx = this.mmCanvas.getContext('2d');

        this.input = null;
        this.map = null;
        this.combat = null;
        this.events = null;
        this.player = null;

        this.enemies = [];
        this.wave = 0;
        this.waveDefs = C.WAVE.WAVE_DEFS;
        this.waveActive = false;
        this.waveClearing = false;
        this.boss = null;
        this.bossActive = false;

        this._artilleryWarnings = [];
        this._lastTime = 0;
        this._rafId = null;

        this._initResize();
        UI.init();
        this._bindButtons();
        this._loop = this._loop.bind(this);
    }

    _initResize() {
        const resize = () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            if (this.map) this.map.resize(this.canvas.width, this.canvas.height);
        };
        window.addEventListener('resize', resize);
        resize();
    }

    _bindButtons() {
        const get = id => document.getElementById(id);
        get('btn-start')?.addEventListener('click', () => this.startGame());
        get('btn-play-again')?.addEventListener('click', () => this.startGame());
        get('btn-retry')?.addEventListener('click', () => this.startGame());
        get('btn-resume')?.addEventListener('click', () => this.resume());
        get('btn-pause')?.addEventListener('click', () => this.pause());
        get('btn-restart-pause')?.addEventListener('click', () => this.startGame());
        get('btn-menu-pause')?.addEventListener('click', () => this._goTitle());
        get('btn-menu-victory')?.addEventListener('click', () => this._goTitle());
        get('btn-menu-defeat')?.addEventListener('click', () => this._goTitle());
        get('btn-howto')?.addEventListener('click', () => {
            UI.showEventBanner(
                'WASD/Arrows=Move | Shift=Sprint | Space=Dodge | J/Click=Attack | K=Heavy Attack | P=Pause',
                '#ffe060', 6
            );
        });

        window.addEventListener('keydown', e => {
            if (KEYS.PAUSE.includes(e.code)) {
                if (this.phase === GamePhase.PLAYING) this.pause();
                else if (this.phase === GamePhase.PAUSED) this.resume();
            }
        });
    }

    _goTitle() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this.phase = GamePhase.TITLE;
        UI.showScreen('title-screen');
        UI.hideBossHUD();
    }

    // ── Game start ────────────────────────────────────────────
    startGame() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this._setup();
        this.phase = GamePhase.PLAYING;
        UI.showScreen('game-screen');
        this._lastTime = performance.now();
        this._rafId = requestAnimationFrame(this._loop);
        this._startNextWave();
    }

    _setup() {
        this.input = new InputManager();
        this.combat = new CombatSystem();
        this.map = new GameMap(this.canvas.width, this.canvas.height);
        this.events = new EventSystem();

        const spawn = this.map.getPlayerSpawn();
        this.player = new Player(spawn.x, spawn.y, this.input, this.combat);

        this.enemies = [];
        this.wave = 0;
        this.waveActive = false;
        this.waveClearing = false;
        this.boss = null;
        this.bossActive = false;
        this._artilleryWarnings = [];

        // Snap camera to player
        const cam = this.map.camera;
        cam.x = spawn.x - cam.w / 2;
        cam.y = spawn.y - cam.h / (2 * C.CAMERA.TILT);

        UI.hideBossHUD();
        UI.updateKills(0);
        UI.updateWave(1);
    }

    // ── Waves ─────────────────────────────────────────────────
    _startNextWave() {
        this.wave++;
        if (this.wave > this.waveDefs.length) { this._triggerVictory(); return; }

        const def = this.waveDefs[this.wave - 1];
        const spawnPts = this.map.getEnemySpawnPoints();
        UI.updateWave(this.wave);
        UI.showWaveBanner(`⚔ WAVE ${this.wave} — ${def.label} ⚔`);

        let spawnIdx = 0;
        const nextPt = () => {
            const pt = spawnPts[spawnIdx % spawnPts.length];
            spawnIdx++;
            return pt;
        };

        let delay = 0;
        for (let i = 0; i < (def.soldiers || 0); i++) {
            const pt = nextPt();
            setTimeout(() => {
                if (this.phase !== GamePhase.PLAYING) return;
                const e = new Soldier(pt.x + (Math.random() - 0.5) * 80, pt.y + (Math.random() - 0.5) * 80, this.combat);
                e.player = this.player; e.map = this.map;
                this.enemies.push(e);
            }, delay * 1000);
            delay += 0.25;
        }

        for (let i = 0; i < (def.riflemen || 0); i++) {
            const pt = nextPt();
            setTimeout(() => {
                if (this.phase !== GamePhase.PLAYING) return;
                const e = new Rifleman(pt.x + (Math.random() - 0.5) * 80, pt.y + (Math.random() - 0.5) * 80, this.combat);
                e.player = this.player; e.map = this.map;
                this.enemies.push(e);
            }, delay * 1000);
            delay += 0.25;
        }

        if (def.boss && !this.bossActive) {
            setTimeout(() => {
                if (this.phase !== GamePhase.PLAYING) return;
                this._spawnBoss();
            }, (delay + 1.0) * 1000);
        }

        this.waveActive = true;
    }

    _spawnBoss() {
        const bpt = this.map.getBossSpawnPoint();
        this.boss = new Boss(bpt.x, bpt.y, this.combat);
        this.boss.player = this.player; this.boss.map = this.map;
        this.enemies.push(this.boss);
        this.bossActive = true;
        UI.showBossHUD(this.boss.name);
        UI.showWaveBanner('⚔ GENERAL ALBERTONE APPROACHES ⚔');
        this.map.camera.doShake(0.8, 14);
    }

    _checkWaveComplete() {
        if (this.enemies.filter(e => e.alive).length > 0) return;
        if (this.waveClearing) return;
        this.waveClearing = true;
        if (this.bossActive) { this.bossActive = false; UI.hideBossHUD(); }
        setTimeout(() => {
            this.waveClearing = false;
            this.enemies = [];
            this._startNextWave();
        }, 2200);
    }

    // ── State transitions ─────────────────────────────────────
    pause() {
        if (this.phase !== GamePhase.PLAYING) return;
        this.phase = GamePhase.PAUSED;
        UI.showScreen('pause-screen');
    }

    resume() {
        if (this.phase !== GamePhase.PAUSED) return;
        this.phase = GamePhase.PLAYING;
        UI.showScreen('game-screen');
        this._lastTime = performance.now();
        this._rafId = requestAnimationFrame(this._loop);
    }

    _triggerVictory() {
        this.phase = GamePhase.VICTORY;
        UI.showVictory({ kills: this.player.kills, damageDealt: this.player.damageDealt, damageTaken: this.player.damageTaken });
        UI.hideBossHUD();
    }

    _triggerDefeat() {
        this.phase = GamePhase.DEFEAT;
        UI.showDefeat({ kills: this.player.kills, damageDealt: this.player.damageDealt, wave: this.wave });
        UI.hideBossHUD();
    }

    // ── Artillery warnings ────────────────────────────────────
    _addArtilleryWarning(x, y, dur) {
        if (dur <= 0) {
            this._artilleryWarnings = this._artilleryWarnings.filter(
                w => !(Math.abs(w.x - x) < 5 && Math.abs(w.y - y) < 5)
            );
            return;
        }
        this._artilleryWarnings.push({ x, y, dur, maxDur: dur, r: 80 });
    }

    _updateArtilleryWarnings(dt) {
        for (const w of this._artilleryWarnings) w.dur -= dt;
        this._artilleryWarnings = this._artilleryWarnings.filter(w => w.dur > 0);
    }

    _drawArtilleryWarnings(ctx, cam) {
        for (const w of this._artilleryWarnings) {
            const flicker = Math.abs(Math.sin(w.dur * 12));
            const p = cam.project(w.x, w.y, 0);
            ctx.save();
            ctx.globalAlpha = 0.4 + 0.4 * flicker;
            ctx.strokeStyle = '#ff6020'; ctx.lineWidth = 2 + 2 * flicker;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, w.r, w.r * C.CAMERA.TILT, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = `rgba(255,80,20,${0.04 * flicker})`;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    // ── Main loop ─────────────────────────────────────────────
    _loop(timestamp) {
        if (this.phase !== GamePhase.PLAYING) return;
        const dt = Math.min((timestamp - this._lastTime) / 1000, 0.05);
        this._lastTime = timestamp;
        this._update(dt);
        this._draw();
        this._rafId = requestAnimationFrame(this._loop);
    }

    _update(dt) {
        const wasAlive = this.player.alive;
        this.player.update(dt, this.map);
        if (wasAlive && !this.player.alive) {
            setTimeout(() => this._triggerDefeat(), 1300);
            return;
        }

        // Resolve player attacks
        const liveEnemies = this.enemies.filter(e => e.alive);
        const hits = this.player.executeAttack(liveEnemies);
        hits.forEach(h => {
            if (!h.alive) {
                this.player.kills++;
                UI.updateKills(this.player.kills);
                this.map.camera.doShake(0.18, 5);
            }
        });

        // Update all enemies
        for (const e of this.enemies) e.update(dt, this.map, this.player);
        applyGroupSeparation(liveEnemies);

        // Camera
        this.map.camera.follow(this.player.x, this.player.y, this.map.worldW, this.map.worldH, dt);

        // Combat effects
        this.combat.update(dt);

        // Battlefield events
        this.events.update(dt, {
            player: this.player, enemies: this.enemies,
            map: this.map, combat: this.combat, wave: this.wave,
            _addArtilleryWarning: this._addArtilleryWarning.bind(this),
        });

        this._updateArtilleryWarnings(dt);

        // HUD
        UI.updatePlayerHealth(this.player.hp, this.player.hpMax);
        UI.updateStamina(this.player.stamina, C.PLAYER.STAMINA_MAX);

        if (this.boss && this.boss.alive) {
            UI.updateBossHealth(this.boss.hp, this.boss.hpMax, this.boss.phase);
        } else if (this.boss && !this.boss.alive && this.bossActive) {
            this.bossActive = false;
            UI.hideBossHUD();
            this.map.camera.doShake(0.6, 18);
            UI.showWaveBanner('⚔ GENERAL ALBERTONE HAS FALLEN! ⚔');
        }

        if (this.waveActive && !this.waveClearing) this._checkWaveComplete();
    }

    _draw() {
        const ctx = this.ctx;
        const cam = this.map.camera;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // ── Terrain (ground + 3D objects) ─────────────────────
        this.map.draw(ctx);

        // ── Artillery warning ellipses ─────────────────────────
        this._drawArtilleryWarnings(ctx, cam);

        // ── Painter's algorithm sort by projected Y + elevation ─
        // All drawables: sort back→front for correct occlusion
        const drawables = [...this.enemies, this.player].filter(Boolean);
        drawables.sort((a, b) => a.sortKey() - b.sortKey());

        for (const entity of drawables) {
            entity.draw(ctx, cam);
        }

        // ── Combat particles & float texts ────────────────────
        this.combat.draw(ctx, cam);

        // ── Atmospheric post-processing ────────────────────────
        this._drawAtmosphere(ctx);
        this._drawVignette(ctx);
    }

    // Warm haze / dust at the horizon (top portion of screen)
    _drawAtmosphere(ctx) {
        const w = this.canvas.width, h = this.canvas.height;
        // Horizon dust haze
        const haze = ctx.createLinearGradient(0, 0, 0, h * 0.35);
        haze.addColorStop(0, 'rgba(180,120,50,0.28)');
        haze.addColorStop(1, 'rgba(180,120,50,0)');
        ctx.fillStyle = haze;
        ctx.fillRect(0, 0, w, h * 0.35);
    }

    _drawVignette(ctx) {
        const w = this.canvas.width, h = this.canvas.height;
        const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.22, w / 2, h / 2, h * 0.88);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(0.65, 'rgba(15,8,0,0.16)');
        vg.addColorStop(1, 'rgba(8,4,0,0.58)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, w, h);

        // Subtle grain
        if (Math.random() < 0.5) {
            ctx.globalAlpha = 0.022;
            for (let i = 0; i < 200; i++) {
                ctx.fillStyle = `hsl(${Math.random() * 40 + 20},20%,60%)`;
                ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
            }
            ctx.globalAlpha = 1;
        }
    }
}

// ── Bootstrap ─────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    window._game = game;
});
