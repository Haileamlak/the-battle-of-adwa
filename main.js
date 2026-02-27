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

        // Canvas
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.mmCanvas = document.getElementById('minimap-canvas');
        this.mmCtx = this.mmCanvas.getContext('2d');

        // Core systems
        this.input = null;
        this.map = null;
        this.combat = null;
        this.events = null;
        this.player = null;

        // Game state
        this.enemies = [];
        this.wave = 0;
        this.waveDefs = C.WAVE.WAVE_DEFS;
        this.waveActive = false;
        this.waveClearing = false;
        this.boss = null;
        this.bossActive = false;

        // Artillery warnings (visual circles)
        this._artilleryWarnings = [];

        // Timing
        this._lastTime = 0;
        this._rafId = null;

        this._initResize();
        UI.init();
        this._bindButtons();
        this._loop = this._loop.bind(this);
    }

    // ── Canvas sizing ─────────────────────────────────────────
    _initResize() {
        const resize = () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            if (this.map) this.map.resize(this.canvas.width, this.canvas.height);
        };
        window.addEventListener('resize', resize);
        resize();
    }

    // ── Button wiring ─────────────────────────────────────────
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
                'WASD/Arrows=Move | Shift=Sprint | Space=Dodge | J/Click=Attack | K=Heavy | P=Pause',
                '#ffe060', 6
            );
        });

        // Keyboard pause
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

    // ── Game start / restart ──────────────────────────────────
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

        // Point camera at player immediately
        this.map.camera.x = spawn.x - this.canvas.width / 2;
        this.map.camera.y = spawn.y - this.canvas.height / 2;

        UI.hideBossHUD();
        UI.updateKills(0);
        UI.updateWave(1);
    }

    // ── Waves ─────────────────────────────────────────────────
    _startNextWave() {
        this.wave++;
        if (this.wave > this.waveDefs.length) {
            this._triggerVictory();
            return;
        }

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

        // Stagger spawns slightly for theatrics
        let delay = 0;
        for (let i = 0; i < (def.soldiers || 0); i++) {
            const pt = nextPt();
            setTimeout(() => {
                if (this.phase !== GamePhase.PLAYING) return;
                const e = new Soldier(
                    pt.x + (Math.random() - 0.5) * 80,
                    pt.y + (Math.random() - 0.5) * 80,
                    this.combat
                );
                e.player = this.player;
                e.map = this.map;
                this.enemies.push(e);
            }, delay * 1000);
            delay += 0.25;
        }

        for (let i = 0; i < (def.riflemen || 0); i++) {
            const pt = nextPt();
            setTimeout(() => {
                if (this.phase !== GamePhase.PLAYING) return;
                const e = new Rifleman(
                    pt.x + (Math.random() - 0.5) * 80,
                    pt.y + (Math.random() - 0.5) * 80,
                    this.combat
                );
                e.player = this.player;
                e.map = this.map;
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
        this.boss.player = this.player;
        this.boss.map = this.map;
        this.enemies.push(this.boss);
        this.bossActive = true;
        UI.showBossHUD(this.boss.name);
        UI.showWaveBanner('⚔ GENERAL ALBERTONE APPROACHES ⚔', 4.0);
        this.map.camera.doShake(0.8, 14);
    }

    _checkWaveComplete() {
        const alive = this.enemies.filter(e => e.alive);
        if (alive.length > 0) return;
        if (this.waveClearing) return;
        this.waveClearing = true;
        if (this.bossActive) {
            this.bossActive = false;
            UI.hideBossHUD();
        }
        setTimeout(() => {
            this.waveClearing = false;
            this.enemies = []; // clean up dead
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
        UI.showVictory({
            kills: this.player.kills,
            damageDealt: this.player.damageDealt,
            damageTaken: this.player.damageTaken,
        });
        UI.hideBossHUD();
    }

    _triggerDefeat() {
        this.phase = GamePhase.DEFEAT;
        UI.showDefeat({
            kills: this.player.kills,
            damageDealt: this.player.damageDealt,
            wave: this.wave,
        });
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
            const pct = w.dur / w.maxDur;
            const sx = w.x - cam.x;
            const sy = w.y - cam.y;
            const flicker = Math.abs(Math.sin(w.dur * 12));
            ctx.save();
            ctx.globalAlpha = 0.4 + 0.4 * flicker;
            ctx.strokeStyle = '#ff6020';
            ctx.lineWidth = 2 + 2 * flicker;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.arc(sx, sy, w.r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = `rgba(255,80,20,${0.05 * flicker})`;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.restore();
        }
    }

    // ── Main loop ─────────────────────────────────────────────
    _loop(timestamp) {
        if (this.phase !== GamePhase.PLAYING) return;

        const dt = Math.min((timestamp - this._lastTime) / 1000, 0.05); // cap at 50ms
        this._lastTime = timestamp;

        this._update(dt);
        this._draw();

        this._rafId = requestAnimationFrame(this._loop);
    }

    _update(dt) {
        // Player update
        const wasAlive = this.player.alive;
        this.player.update(dt, this.map);

        if (wasAlive && !this.player.alive) {
            setTimeout(() => this._triggerDefeat(), 1200);
            return;
        }

        // Player attack — execute against all living enemies
        const liveEnemies = this.enemies.filter(e => e.alive);
        const hits = this.player.executeAttack(liveEnemies);
        hits.forEach(h => {
            if (!h.alive) {
                this.player.kills++;
                UI.updateKills(this.player.kills);
                this.map.camera.doShake(0.18, 5);
            }
        });

        // Enemy updates
        for (const e of this.enemies) {
            e.update(dt, this.map, this.player);
        }

        // Group separation
        applyGroupSeparation(liveEnemies);

        // Camera
        this.map.camera.follow(
            this.player.x, this.player.y,
            this.map.worldW, this.map.worldH, dt
        );

        // Combat particles
        this.combat.update(dt);

        // Events (pass context as gameState)
        this.events.update(dt, {
            player: this.player,
            enemies: this.enemies,
            map: this.map,
            combat: this.combat,
            wave: this.wave,
            _addArtilleryWarning: this._addArtilleryWarning.bind(this),
        });

        // Artillery warnings
        this._updateArtilleryWarnings(dt);

        // HUD
        UI.updatePlayerHealth(this.player.hp, this.player.hpMax);
        UI.updateStamina(this.player.stamina, C.PLAYER.STAMINA_MAX);

        // Boss HUD
        if (this.boss && this.boss.alive) {
            UI.updateBossHealth(this.boss.hp, this.boss.hpMax, this.boss.phase);
        } else if (this.boss && !this.boss.alive && this.bossActive) {
            this.bossActive = false;
            UI.hideBossHUD();
            this.map.camera.doShake(0.6, 18);
            UI.showWaveBanner('⚔ GENERAL ALBERTONE HAS FALLEN! ⚔');
        }

        // Wave completion check
        if (this.waveActive && !this.waveClearing) {
            this._checkWaveComplete();
        }
    }

    _draw() {
        const ctx = this.ctx;
        const cam = this.map.camera;

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // ── World ──────────────────────────────────────────────
        this.map.draw(ctx);

        // Artillery warning circles
        this._drawArtilleryWarnings(ctx, cam);

        // ── Sort entities by Y for depth ──────────────────────
        const drawables = [...this.enemies, this.player].filter(Boolean);
        drawables.sort((a, b) => a.y - b.y);

        // Draw each entity
        for (const e of drawables) {
            e.draw(ctx, cam);
        }

        // ── Combat effects (particles, floats) ────────────────
        this.combat.draw(ctx, cam);

        // ── Player attack visual ──────────────────────────────
        // (drawn inside player.draw already)

        // ── Post-process vignette (Ethiopian atmosphere) ───────
        this._drawVignette(ctx);

        // ── Minimap ───────────────────────────────────────────
        this.map.drawMinimap(this.mmCtx, this.enemies, this.player);
    }

    _drawVignette(ctx) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        // Radial dark vignette with warm amber tint
        const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.85);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(0.7, 'rgba(20,10,0,0.18)');
        vg.addColorStop(1, 'rgba(10,5,0,0.55)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, w, h);

        // Film grain overlay (subtle)
        if (Math.random() < 0.5) {
            ctx.globalAlpha = 0.025;
            ctx.fillStyle = `hsl(${Math.random() * 360},30%,60%)`;
            for (let i = 0; i < 180; i++) {
                const gx = Math.random() * w;
                const gy = Math.random() * h;
                ctx.fillRect(gx, gy, 1, 1);
            }
            ctx.globalAlpha = 1;
        }
    }
}

// ── Bootstrap ────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    window._game = game; // dev access
});
