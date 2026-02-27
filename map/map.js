// ============================================================
//  MAP — Endless Side-view world streaming
// ============================================================

class Camera {
    constructor(w, h) {
        this.x = 0; this.y = 0;
        this.w = w; this.h = h;
        this._shakeX = 0; this._shakeY = 0;
        this._shakeAmt = 0; this._shakeDur = 0;
    }

    project(wx, wy) {
        return { x: wx - this.x + this._shakeX, y: wy - this.y + this._shakeY };
    }

    follow(targetX, targetY, dt) {
        const tx = targetX - this.w * C.CAMERA.LEAD_X;
        const ty = targetY - this.h * C.CAMERA.LEAD_Y;
        const lx = 1 - Math.pow(1 - C.CAMERA.LERP_X, dt * 60);
        const ly = 1 - Math.pow(1 - C.CAMERA.LERP_Y, dt * 60);
        this.x += (tx - this.x) * lx;
        this.y += (ty - this.y) * ly;

        if (this._shakeDur > 0) {
            this._shakeDur -= dt;
            const s = this._shakeAmt * Math.max(0, this._shakeDur / 0.25);
            this._shakeX = (Math.random() - 0.5) * s * 2;
            this._shakeY = (Math.random() - 0.5) * s * 1.2;
        } else { this._shakeX = 0; this._shakeY = 0; }
    }

    doShake(dur = 0.25, amt = 8) { this._shakeDur = dur; this._shakeAmt = amt; }

    isVisible(wx, wy, r = 0) {
        const p = this.project(wx, wy);
        return p.x + r > -80 && p.x - r < this.w + 80 &&
            p.y + r > -80 && p.y - r < this.h + 80;
    }
}

class GameMap {
    constructor(canvasW, canvasH) {
        this.worldH = C.WORLD_H;
        this.camera = new Camera(canvasW, canvasH);
        this.renderer = new TerrainRenderer();
    }

    update(player, enemies, combat) {
        this.renderer.updateActiveChunks(this.camera.x);
        this._spawnEnemies(enemies, combat);
    }

    _spawnEnemies(enemies, combat) {
        for (const chunk of this.renderer.activeChunks) {
            if (!chunk.spawned) {
                chunk.spawned = true;
                for (const e of chunk.enemiesToSpawn) {
                    let enemy;
                    if (e.type === 'soldier') enemy = new Soldier(e.x, e.y, combat);
                    else if (e.type === 'rifleman') enemy = new Rifleman(e.x, e.y, combat);
                    else if (e.type === 'boss') {
                        enemy = new Boss(e.x, e.y, combat);
                        UI.showWaveBanner(`⚔ BOSS: ALBERTONE ⚔`);
                    }
                    if (enemy) {
                        // Scale difficulty
                        const scale = 1 + e.difficulty * C.PROGRESSION.HP_GROWTH;
                        enemy.hpMax = Math.round(enemy.hpMax * scale);
                        enemy.hp = enemy.hpMax;
                        enemy.map = this;
                        enemies.push(enemy);
                    }
                }
            }
        }
        // Cleanup enemies far behind
        const threshold = this.camera.x - C.CHUNK_SIZE * 2;
        for (let i = enemies.length - 1; i >= 0; i--) {
            if (enemies[i].x < threshold && !enemies[i].isBoss) {
                enemies.splice(i, 1);
            }
        }
    }

    getPlayerSpawn() { return { x: 300, y: C.GROUND_Y - 50 }; }

    resolveCollision(entity) {
        const r = entity.radius;
        const cl = entity._prevY ?? entity.y;

        // No horizontal world bounds in endless mode
        if (entity.y - r < 0) { entity.y = r; if (entity.vy < 0) entity.vy = 0; }

        entity.grounded = false;
        entity.currentPlatform = null;

        for (const chunk of this.renderer.activeChunks) {
            for (const plat of chunk.platforms) {
                const feet = entity.y + r;
                const prevFeet = cl + r;
                const ex = entity.x;

                const xOverlap = ex + r * 0.78 > plat.left && ex - r * 0.78 < plat.right;
                if (!xOverlap) continue;

                if (entity.vy >= -1 && prevFeet <= plat.top + 4 && feet >= plat.top) {
                    entity.y = plat.top - r;
                    entity.vy = 0;
                    entity.grounded = true;
                    entity.currentPlatform = plat;
                    entity.jumpsLeft = 2;
                    entity.coyoteTimer = C.PLAYER.COYOTE_TIME;
                    return;
                }

                if (plat.type === 'solid') {
                    const head = entity.y - r;
                    const prevHead = cl - r;
                    if (entity.vy < 0 && prevHead >= plat.bottom && head <= plat.bottom) {
                        entity.y = plat.bottom + r;
                        entity.vy = 0;
                    }
                }
            }
        }
    }

    hasGroundAhead(entity, dir) {
        const lookX = entity.x + dir * (entity.radius + 15);
        const lookY = entity.y + entity.radius + 12;
        for (const chunk of this.renderer.activeChunks) {
            for (const p of chunk.platforms) {
                if (lookX >= p.left && lookX <= p.right &&
                    lookY >= p.top && lookY <= p.bottom + 5) return true;
            }
        }
        return false;
    }

    drawBackground(ctx, cw, ch) { this.renderer.drawBackground(ctx, this.camera, cw, ch); }
    drawPlatforms(ctx) { this.renderer.drawPlatforms(ctx, this.camera); }
    drawDecorations(ctx) { this.renderer.drawDecorations(ctx, this.camera); }

    drawMinimap(mmCtx, player) {
        const mw = mmCtx.canvas.width, mh = mmCtx.canvas.height;
        mmCtx.clearRect(0, 0, mw, mh);
        mmCtx.fillStyle = 'rgba(20,10,0,0.85)';
        mmCtx.fillRect(0, 0, mw, mh);

        // Abstract dist meter
        const dist = Math.floor(player.x / 100);
        mmCtx.fillStyle = C.COLOR.UI_GOLD;
        mmCtx.font = "bold 14px Cinzel";
        mmCtx.textAlign = "center";
        mmCtx.fillText(`DISTANCE: ${dist}m`, mw / 2, mh / 2 + 5);

        mmCtx.strokeStyle = C.COLOR.UI_GOLD; mmCtx.lineWidth = 1;
        mmCtx.strokeRect(0, 0, mw, mh);
    }

    resize(w, h) { this.camera.w = w; this.camera.h = h; }
}
