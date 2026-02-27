// ============================================================
//  MAIN — Endless Game Orchestration
// ============================================================

const GamePhase = Object.freeze({
    TITLE: 'title', PLAYING: 'playing', PAUSED: 'paused', VICTORY: 'victory', DEFEAT: 'defeat', TRAILER: 'trailer',
});

// ── Asset Loader ──────────────────────────────────────────────
class AssetLoader {
    constructor() {
        this.assets = {};
        this.total = 0;
        this.loaded = 0;
    }
    load(name, url) {
        this.total++;
        const img = new Image();
        img.onload = () => { this.loaded++; };
        img.src = url;
        this[name] = img;
    }
    isDone() { return this.loaded >= this.total; }
}

class Game {
    constructor() {
        this.phase = GamePhase.TITLE;
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.mmCanvas = document.getElementById('minimap-canvas');
        this.mmCtx = this.mmCanvas.getContext('2d');

        this.input = null; this.map = null; this.combat = null;
        this.player = null; this.enemies = [];
        this._lastTime = 0; this._rafId = null;

        this._initAssets();
        this._initResize();
        UI.init();
        this._bindButtons();
        this._loop = this._loop.bind(this);
    }

    _initAssets() {
        window._assets = new AssetLoader();
        window._assets.load('player_move', 'assets/ethiopian_soldier1.png');
        window._assets.load('player_attack', 'assets/ethiopian_soldier2.png');
        window._assets.load('enemy', 'assets/italian_soldier3.png');
        window._assets.load('boss', 'assets/ethiopian_soldier1.png');
        window._assets.load('t1', 'assets/thumbnail1.png');
        window._assets.load('t2', 'assets/thumbnail2.png');
        window._assets.load('t3', 'assets/thumbnail3.png');
        window._assets.load('t4', 'assets/thumbnail4.png');
    }

    _initResize() {
        const res = () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            if (this.map) this.map.resize(this.canvas.width, this.canvas.height);
        };
        window.addEventListener('resize', res);
        res();
    }

    _bindButtons() {
        const get = id => document.getElementById(id);
        get('btn-start')?.addEventListener('click', () => this.startGame());
        get('btn-play-again')?.addEventListener('click', () => this.startGame());
        get('btn-retry')?.addEventListener('click', () => this.startGame());
        get('btn-resume')?.addEventListener('click', () => this.resume());
        get('btn-pause')?.addEventListener('click', () => this.pause());
    }

    startGame() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this.phase = GamePhase.TRAILER;
        UI.playTrailer(() => {
            this._setup();
            this.phase = GamePhase.PLAYING;
            UI.showScreen('game-screen');
            this._lastTime = performance.now();
            this._rafId = requestAnimationFrame(this._loop);
            UI.showWaveBanner('⚔ ENDLESS MARCH UPON ADWA ⚔');
        });
    }

    _setup() {
        this.input = new InputManager();
        this.combat = new CombatSystem();
        this.map = new GameMap(this.canvas.width, this.canvas.height);
        const spawn = this.map.getPlayerSpawn();
        this.player = new Player(spawn.x, spawn.y, this.input, this.combat);
        this.enemies = [];

        // Reset camera FIRST
        this.map.camera.x = this.player.x - this.canvas.width * 0.35;
        this.map.camera.y = this.player.y - this.canvas.height * 0.6;

        // Load chunks before first frame
        this.map.update(this.player, this.enemies, this.combat);
    }

    pause() { if (this.phase === GamePhase.PLAYING) this.phase = GamePhase.PAUSED; UI.showScreen('pause-screen'); }
    resume() { if (this.phase === GamePhase.PAUSED) { this.phase = GamePhase.PLAYING; UI.showScreen('game-screen'); this._lastTime = performance.now(); this._rafId = requestAnimationFrame(this._loop); } }

    _loop(timestamp) {
        if (this.phase !== GamePhase.PLAYING) return;
        const dt = Math.min((timestamp - this._lastTime) / 1000, 0.05);
        this._lastTime = timestamp;
        this._update(dt);
        this._draw();
        this._rafId = requestAnimationFrame(this._loop);
    }

    _update(dt) {
        // 1. Update World Streaming first so collisions are ready
        this.map.update(this.player, this.enemies, this.combat);
        this.map.camera.follow(this.player.x, this.player.y, dt);

        // 2. Update entities
        const wasAlive = this.player.alive;
        this.player.update(dt, this.map);

        // Hole detection
        if (this.player.y > C.WORLD_H + 400) {
            this.player.hp = 0;
            this.player.alive = false;
        }

        // Combat Logic
        const liveEnemies = this.enemies.filter(e => e.alive);
        const hits = this.player.executeAttack(liveEnemies);
        hits.forEach(h => { if (!h.alive) this.player.kills++; });

        for (const e of this.enemies) e.update(dt, this.map, this.player);
        applyGroupSeparation(liveEnemies);

        this.combat.updateProjectiles(dt, [], this.player);
        this.combat.update(dt);

        // Final Death Check (must happen after all combat logic)
        if (wasAlive && !this.player.alive) {
            this.phase = GamePhase.DEFEAT;
            UI.showDefeat({
                kills: this.player.kills,
                damageDealt: this.player.damageDealt,
                dist: Math.floor(this.player.x / 100)
            });
            return;
        }

        // UI
        UI.updatePlayerHealth(this.player.hp, this.player.hpMax);
        UI.updateStamina(this.player.stamina, C.PLAYER.STAMINA_MAX);
        UI.updateKills(this.player.kills);
        UI.updateWave(this.player.x);
    }

    _draw() {
        const ctx = this.ctx, cam = this.map.camera;
        const cw = this.canvas.width, ch = this.canvas.height;

        this.map.drawBackground(ctx, cw, ch);
        this.map.drawDecorations(ctx);
        this.map.drawPlatforms(ctx);

        const drawables = [...this.enemies, this.player].sort((a, b) => a.sortKey() - b.sortKey());
        for (const d of drawables) d.draw(ctx, cam);

        this.combat.draw(ctx, cam);
        this.map.drawMinimap(this.mmCtx, this.player);

        // Vignette
        const vg = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.2, cw / 2, ch / 2, ch * 0.8);
        vg.addColorStop(0, 'transparent'); vg.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, cw, ch);
    }
}

window.addEventListener('DOMContentLoaded', () => { window._game = new Game(); });
