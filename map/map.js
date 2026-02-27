// ============================================================
//  MAP — World setup: spawn points, zones, camera, collision
// ============================================================

class Camera {
    constructor(w, h) {
        this.x = 0;
        this.y = 0;
        this.w = w;
        this.h = h;
        this.tx = 0;
        this.ty = 0;
        this.shake = 0;
        this.shakeStrength = 0;
    }

    follow(targetX, targetY, worldW, worldH, dt) {
        // Target is centred on screen
        this.tx = targetX - this.w / 2;
        this.ty = targetY - this.h / 2;
        // Clamp to world
        this.tx = Math.max(0, Math.min(worldW - this.w, this.tx));
        this.ty = Math.max(0, Math.min(worldH - this.h, this.ty));
        // Smooth lerp
        const lerpFactor = 1 - Math.pow(0.08, dt);
        this.x += (this.tx - this.x) * lerpFactor;
        this.y += (this.ty - this.y) * lerpFactor;
        // Screen shake
        if (this.shake > 0) {
            this.shake -= dt;
            const s = this.shakeStrength * (this.shake / 0.3);
            this.x += (Math.random() - 0.5) * s * 2;
            this.y += (Math.random() - 0.5) * s * 2;
        }
    }

    doShake(duration = 0.3, strength = 10) {
        this.shake = duration;
        this.shakeStrength = strength;
    }

    // World → screen
    toScreen(wx, wy) {
        return { x: wx - this.x, y: wy - this.y };
    }

    // Screen → world
    toWorld(sx, sy) {
        return { x: sx + this.x, y: sy + this.y };
    }

    // Is a world-space circle visible on screen (with margin)?
    isVisible(wx, wy, r = 0, margin = 60) {
        const sx = wx - this.x;
        const sy = wy - this.y;
        return sx + r + margin > 0 && sx - r - margin < this.w &&
            sy + r + margin > 0 && sy - r - margin < this.h;
    }
}

class SpawnPoint {
    constructor(x, y, type, id) {
        this.x = x; this.y = y; this.type = type; this.id = id;
    }
}

class GameMap {
    constructor(canvasW, canvasH) {
        this.worldW = C.WORLD_W;
        this.worldH = C.WORLD_H;
        this.camera = new Camera(canvasW, canvasH);
        this.terrain = new TerrainGenerator(this.worldW, this.worldH, 1896);
        this.renderer = new TerrainRenderer(this.terrain);
        this.solids = [];
        this.spawnPoints = [];
        this._init();
    }

    _init() {
        this.terrain.generate();
        this.solids = this.terrain.getSolids();
        this._buildSpawnPoints();
    }

    _buildSpawnPoints() {
        // Player always spawns at centre
        const cx = this.worldW / 2;
        const cy = this.worldH / 2;

        // Enemy spawn ring — cardinal and diagonal directions
        const angles = [0, 45, 90, 135, 180, 225, 270, 315].map(d => d * Math.PI / 180);
        angles.forEach((a, i) => {
            const dist = C.WAVE.SPAWN_DIST_MIN + Math.random() * (C.WAVE.SPAWN_DIST_MAX - C.WAVE.SPAWN_DIST_MIN);
            const x = cx + Math.cos(a) * dist;
            const y = cy + Math.sin(a) * dist;
            const bx = Math.max(60, Math.min(this.worldW - 60, x));
            const by = Math.max(60, Math.min(this.worldH - 60, y));
            this.spawnPoints.push(new SpawnPoint(bx, by, 'enemy', i));
        });

        // Boss spawn — far north
        this.spawnPoints.push(new SpawnPoint(cx, cy - 750, 'boss', 99));
    }

    getPlayerSpawn() {
        return { x: this.worldW / 2, y: this.worldH / 2 };
    }

    getEnemySpawnPoints() {
        return this.spawnPoints.filter(sp => sp.type === 'enemy');
    }

    getBossSpawnPoint() {
        return this.spawnPoints.find(sp => sp.type === 'boss') ||
            { x: this.worldW / 2, y: this.worldH / 2 - 700 };
    }

    // ── Collision resolution against solid terrain ─────────────
    resolveCollision(entity) {
        const r = entity.radius;
        // World boundary
        entity.x = Math.max(r, Math.min(this.worldW - r, entity.x));
        entity.y = Math.max(r, Math.min(this.worldH - r, entity.y));

        // Solid obstacle collision
        for (const obj of this.solids) {
            const dx = entity.x - obj.x;
            const dy = entity.y - obj.y;
            const dist = Math.hypot(dx, dy);
            const minDist = r + obj.radius * 0.85; // 0.85 = use inner radius for rocks
            if (dist < minDist && dist > 0.01) {
                const nx = dx / dist;
                const ny = dy / dist;
                const push = minDist - dist;
                entity.x += nx * push;
                entity.y += ny * push;
            }
        }
    }

    // Returns speed multiplier from terrain features
    getSpeedMult(x, y) {
        return this.terrain.getSpeedMult(x, y);
    }

    // ── Draw world ─────────────────────────────────────────────
    draw(ctx) {
        this.renderer.drawGround(ctx, this.camera);
        this.renderer.drawObjects(ctx, this.camera);
        this.renderer.drawBoundary(ctx, this.camera);
        this._drawSpawnIndicators(ctx);
    }

    _drawSpawnIndicators(ctx) {
        // Debug: draw spawn points (hidden in production)
        // Comment out to hide
    }

    // Minimap rendering
    drawMinimap(mmCtx, entities, player) {
        const scaleX = mmCtx.canvas.width / this.worldW;
        const scaleY = mmCtx.canvas.height / this.worldH;

        mmCtx.clearRect(0, 0, mmCtx.canvas.width, mmCtx.canvas.height);

        // Background
        mmCtx.fillStyle = 'rgba(20,10,0,0.85)';
        mmCtx.fillRect(0, 0, mmCtx.canvas.width, mmCtx.canvas.height);

        // Terrain objects
        for (const obj of this.terrain.objects) {
            const mx = obj.x * scaleX;
            const my = obj.y * scaleY;
            if (obj.type === 'rock') {
                mmCtx.fillStyle = '#6b5a3e';
                mmCtx.beginPath();
                mmCtx.arc(mx, my, Math.max(1.5, obj.radius * scaleX), 0, Math.PI * 2);
                mmCtx.fill();
            } else if (obj.type === 'hill') {
                mmCtx.fillStyle = 'rgba(120,90,40,0.4)';
                mmCtx.beginPath();
                mmCtx.ellipse(mx, my, obj.radius * scaleX, obj.radius * 0.65 * scaleY, 0, 0, Math.PI * 2);
                mmCtx.fill();
            }
        }

        // Enemies
        if (entities) {
            for (const e of entities) {
                if (!e.alive) continue;
                mmCtx.fillStyle = e.isBoss ? '#ff4040' : '#cc3030';
                mmCtx.beginPath();
                mmCtx.arc(e.x * scaleX, e.y * scaleY, 2.5, 0, Math.PI * 2);
                mmCtx.fill();
            }
        }

        // Player
        if (player) {
            mmCtx.fillStyle = '#ffe060';
            mmCtx.beginPath();
            mmCtx.arc(player.x * scaleX, player.y * scaleY, 3.5, 0, Math.PI * 2);
            mmCtx.fill();
            // Camera view rect
            mmCtx.strokeStyle = 'rgba(255,220,100,0.5)';
            mmCtx.lineWidth = 1;
            mmCtx.strokeRect(
                this.camera.x * scaleX, this.camera.y * scaleY,
                this.camera.w * scaleX, this.camera.h * scaleY
            );
        }

        // Border
        mmCtx.strokeStyle = C.COLOR.UI_GOLD;
        mmCtx.lineWidth = 1.5;
        mmCtx.strokeRect(0, 0, mmCtx.canvas.width, mmCtx.canvas.height);
    }

    resize(w, h) {
        this.camera.w = w;
        this.camera.h = h;
    }
}
