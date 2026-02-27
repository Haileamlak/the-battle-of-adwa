// ============================================================
//  MAP — Camera with perspective projection, world, collision
// ============================================================

class Camera {
    constructor(w, h) {
        this.x = 0; this.y = 0;
        this.w = w; this.h = h;
        this.tx = 0; this.ty = 0;
        this.shake = 0; this.shakeStrength = 0;
        this._shakeOffX = 0; this._shakeOffY = 0;
    }

    // ── Core perspective projection ───────────────────────────
    // World (wx, wy, wz) → Screen (sx, sy)
    // TILT compresses the Y axis to create a tilted-view illusion.
    // ELEV_SCALE lifts rendered objects above the ground plane.
    project(wx, wy, wz = 0) {
        const relX = wx - this.x + this._shakeOffX;
        const relY = (wy - this.y) * C.CAMERA.TILT + this._shakeOffY;
        return {
            x: relX,
            y: relY - wz * C.CAMERA.ELEV_SCALE,
        };
    }

    // Inverse: screen → approximate world (elevation assumed 0)
    unproject(sx, sy) {
        return {
            x: sx + this.x - this._shakeOffX,
            y: (sy + this._shakeOffY - this.y * (C.CAMERA.TILT - 1)) / C.CAMERA.TILT + this.y,
        };
    }

    // Perspective scale: objects lower on screen appear slightly larger
    // (simulates closer distance to camera in tilted view)
    perspScale(screenY) {
        const normalised = Math.max(0, Math.min(1, screenY / this.h));
        return 1.0 + normalised * C.CAMERA.PERSP_MULT;
    }

    // ── Camera follow with smooth lerp ────────────────────────
    follow(targetX, targetY, worldW, worldH, dt) {
        // For a tilted camera, centre the world Y a bit higher on screen.
        // We offset by half the "invisible" world height lost to tilt compression.
        const verticalBias = (this.h * (1 - C.CAMERA.TILT)) * 0.5;
        this.tx = targetX - this.w / 2;
        this.ty = targetY - this.h / (2 * C.CAMERA.TILT) + verticalBias;

        this.tx = Math.max(0, Math.min(worldW - this.w, this.tx));
        this.ty = Math.max(0, Math.min(worldH - this.h / C.CAMERA.TILT, this.ty));

        const lerpFactor = 1 - Math.pow(0.08, dt);
        this.x += (this.tx - this.x) * lerpFactor;
        this.y += (this.ty - this.y) * lerpFactor;

        // Shake
        if (this.shake > 0) {
            this.shake -= dt;
            const s = this.shakeStrength * Math.max(0, this.shake / 0.3);
            this._shakeOffX = (Math.random() - 0.5) * s * 2;
            this._shakeOffY = (Math.random() - 0.5) * s * 1.2;
        } else {
            this._shakeOffX = 0;
            this._shakeOffY = 0;
        }
    }

    doShake(duration = 0.3, strength = 10) {
        this.shake = duration;
        this.shakeStrength = strength;
    }

    // Is a world-space point visible on screen? (with margin)
    isVisible(wx, wy, r = 0, margin = 80) {
        const p = this.project(wx, wy, 0);
        return p.x + r + margin > 0 && p.x - r - margin < this.w &&
            p.y + r + margin > 0 && p.y - r - margin < this.h;
    }
}

// ── Spawn point ───────────────────────────────────────────────
class SpawnPoint {
    constructor(x, y, type, id) { this.x = x; this.y = y; this.type = type; this.id = id; }
}

// ── Game Map ──────────────────────────────────────────────────
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
        const cx = this.worldW / 2, cy = this.worldH / 2;
        const angles = [0, 45, 90, 135, 180, 225, 270, 315].map(d => d * Math.PI / 180);
        angles.forEach((a, i) => {
            const dist = C.WAVE.SPAWN_DIST_MIN + Math.random() * (C.WAVE.SPAWN_DIST_MAX - C.WAVE.SPAWN_DIST_MIN);
            const x = Math.max(60, Math.min(this.worldW - 60, cx + Math.cos(a) * dist));
            const y = Math.max(60, Math.min(this.worldH - 60, cy + Math.sin(a) * dist));
            this.spawnPoints.push(new SpawnPoint(x, y, 'enemy', i));
        });
        this.spawnPoints.push(new SpawnPoint(cx, cy - 750, 'boss', 99));
    }

    getPlayerSpawn() { return { x: this.worldW / 2, y: this.worldH / 2 }; }
    getEnemySpawnPoints() { return this.spawnPoints.filter(sp => sp.type === 'enemy'); }
    getBossSpawnPoint() {
        return this.spawnPoints.find(sp => sp.type === 'boss') || { x: this.worldW / 2, y: this.worldH / 2 - 700 };
    }

    // ── Collision: unchanged (gameplay stays in flat 2D) ───────
    resolveCollision(entity) {
        const r = entity.radius;
        entity.x = Math.max(r, Math.min(this.worldW - r, entity.x));
        entity.y = Math.max(r, Math.min(this.worldH - r, entity.y));
        for (const obj of this.solids) {
            const dx = entity.x - obj.x, dy = entity.y - obj.y;
            const dist = Math.hypot(dx, dy);
            const min = r + obj.radius * 0.85;
            if (dist < min && dist > 0.01) {
                const nx = dx / dist, ny = dy / dist;
                entity.x += nx * (min - dist);
                entity.y += ny * (min - dist);
            }
        }
    }

    getSpeedMult(x, y) { return this.terrain.getSpeedMult(x, y); }

    // ── Visual elevation at a world position (for entity z) ────
    getElevationAt(x, y) { return this.terrain.getElevationAt(x, y); }

    // ── Draw world ─────────────────────────────────────────────
    draw(ctx) {
        this.renderer.drawGround(ctx, this.camera);
        this.renderer.drawObjects(ctx, this.camera);
        this.renderer.drawBoundary(ctx, this.camera);
    }

    // ── Minimap ────────────────────────────────────────────────
    drawMinimap(mmCtx, entities, player) {
        const scaleX = mmCtx.canvas.width / this.worldW;
        const scaleY = mmCtx.canvas.height / this.worldH;
        mmCtx.clearRect(0, 0, mmCtx.canvas.width, mmCtx.canvas.height);

        mmCtx.fillStyle = 'rgba(20,10,0,0.88)';
        mmCtx.fillRect(0, 0, mmCtx.canvas.width, mmCtx.canvas.height);

        for (const obj of this.terrain.objects) {
            const mx = obj.x * scaleX, my = obj.y * scaleY;
            if (obj.type === 'rock') {
                mmCtx.fillStyle = '#6b5a3e';
                mmCtx.beginPath();
                mmCtx.arc(mx, my, Math.max(1.5, obj.radius * scaleX), 0, Math.PI * 2);
                mmCtx.fill();
            } else if (obj.type === 'hill') {
                mmCtx.fillStyle = 'rgba(120,90,40,0.45)';
                mmCtx.beginPath();
                mmCtx.ellipse(mx, my, obj.radius * scaleX, obj.radius * 0.65 * scaleY, 0, 0, Math.PI * 2);
                mmCtx.fill();
            }
        }

        if (entities) {
            for (const e of entities) {
                if (!e.alive) continue;
                mmCtx.fillStyle = e.isBoss ? '#ff4040' : '#cc3030';
                mmCtx.beginPath();
                mmCtx.arc(e.x * scaleX, e.y * scaleY, e.isBoss ? 4 : 2.5, 0, Math.PI * 2);
                mmCtx.fill();
            }
        }

        if (player) {
            mmCtx.fillStyle = '#ffe060';
            mmCtx.beginPath();
            mmCtx.arc(player.x * scaleX, player.y * scaleY, 3.5, 0, Math.PI * 2);
            mmCtx.fill();
            // Camera frustum in minimap (compensate for tilt)
            mmCtx.strokeStyle = 'rgba(255,220,100,0.45)';
            mmCtx.lineWidth = 1;
            const cvw = this.camera.w * scaleX;
            const cvh = (this.camera.h / C.CAMERA.TILT) * scaleY;
            mmCtx.strokeRect(this.camera.x * scaleX, this.camera.y * scaleY, cvw, cvh);
        }

        mmCtx.strokeStyle = C.COLOR.UI_GOLD;
        mmCtx.lineWidth = 1.5;
        mmCtx.strokeRect(0, 0, mmCtx.canvas.width, mmCtx.canvas.height);
    }

    resize(w, h) { this.camera.w = w; this.camera.h = h; }
}
