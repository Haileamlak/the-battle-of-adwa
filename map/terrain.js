// ============================================================
//  TERRAIN — Procedural Endless Generation
// ============================================================

class SeededRNG {
    constructor(seed = 42) { this.state = seed; }
    next() {
        this.state ^= this.state << 13;
        this.state ^= this.state >> 17;
        this.state ^= this.state << 5;
        return (this.state >>> 0) / 0xFFFFFFFF;
    }
    range(a, b) { return a + this.next() * (b - a); }
    int(a, b) { return Math.floor(this.range(a, b + 1)); }
}

// ── Platform Chunk ────────────────────────────────────────────
class Chunk {
    constructor(index, x) {
        this.index = index;
        this.x = x;
        this.w = C.CHUNK_SIZE;
        this.platforms = [];
        this.decorations = [];
        this.enemiesToSpawn = [];
        this.spawned = false;
    }
}

class Platform {
    constructor(x, y, w, h, opts = {}) {
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.type = opts.type || 'solid';
        this.texture = opts.texture || 'rock';
    }
    get top() { return this.y; }
    get bottom() { return this.y + this.h; }
    get left() { return this.x; }
    get right() { return this.x + this.w; }
}

// ── Procedural Generator ─────────────────────────────────────
class ProceduralGenerator {
    constructor(seed = 1896) {
        this.rng = new SeededRNG(seed);
        this.chunks = new Map();
    }

    getChunk(index) {
        if (this.chunks.has(index)) return this.chunks.get(index);
        const chunk = this._generate(index);
        this.chunks.set(index, chunk);
        return chunk;
    }

    _generate(idx) {
        const chunkX = idx * C.CHUNK_SIZE;
        const chunk = new Chunk(idx, chunkX);
        const rng = new SeededRNG(1896 + idx * 777); // Deterministic per chunk

        // Basic ground (sometimes gaps)
        const hasGap = idx > 0 && rng.next() < 0.35;
        if (!hasGap) {
            chunk.platforms.push(new Platform(chunkX, C.GROUND_Y, C.CHUNK_SIZE, 200, { texture: 'ground' }));
        } else {
            // Split ground with a gap
            const gapW = rng.range(120, 220);
            const leftW = rng.range(200, 600);
            chunk.platforms.push(new Platform(chunkX, C.GROUND_Y, leftW, 200, { texture: 'ground' }));
            const rightStart = leftW + gapW;
            if (rightStart < C.CHUNK_SIZE) {
                chunk.platforms.push(new Platform(chunkX + rightStart, C.GROUND_Y, C.CHUNK_SIZE - rightStart, 200, { texture: 'ground' }));
            }
        }

        // Platforms
        let lastX = 100;
        while (lastX < C.CHUNK_SIZE - 200) {
            const w = rng.range(180, 450);
            const h = rng.range(40, 70);
            const x = chunkX + lastX;
            const y = C.GROUND_Y - rng.range(140, 380);

            chunk.platforms.push(new Platform(x, y, w, h, { type: 'passthrough', texture: 'rock' }));

            // Decorations on platform
            if (rng.next() < 0.6) {
                chunk.decorations.push({ type: 'tree', x: x + w / 2, y: y, h: rng.range(50, 90) });
            }

            lastX += w + rng.range(100, 250);
        }

        // Enemies (Difficulty scales with idx)
        if (idx === 0) return chunk;
        const difficulty = Math.floor((idx * C.CHUNK_SIZE) / C.PROGRESSION.DIFF_STEP);
        const spawnCount = 2 + Math.floor(difficulty * 0.5);
        for (let i = 0; i < spawnCount; i++) {
            // Find a platform to spawn on
            const plat = chunk.platforms[rng.int(0, chunk.platforms.length - 1)];
            chunk.enemiesToSpawn.push({
                type: rng.next() < 0.3 ? 'rifleman' : 'soldier',
                x: plat.x + rng.range(20, plat.w - 20),
                y: plat.y - 40,
                difficulty
            });
        }

        // Boss at thresholds
        if (idx > 0 && idx % 8 === 0) {
            chunk.enemiesToSpawn.push({ type: 'boss', x: chunkX + C.CHUNK_SIZE / 2, y: C.GROUND_Y - 500, difficulty });
        }

        return chunk;
    }

    purgeOld(thresholdIndex) {
        for (const [idx] of this.chunks) {
            if (idx < thresholdIndex - C.VIEW_DISTANCE) this.chunks.delete(idx);
        }
    }
}

// ── Parallax Background (Endless) ─────────────────────────────
class ParallaxBackground {
    constructor() {
        this.rng = new SeededRNG(42);
        this._layers = [
            { factor: 0.04, color: C.COLOR.MTN_FAR, minY: 60, maxY: 200, n: 8 },
            { factor: 0.12, color: C.COLOR.MTN_MID, minY: 130, maxY: 320, n: 10 },
            { factor: 0.28, color: C.COLOR.MTN_NEAR, minY: 220, maxY: 460, n: 12 },
            { factor: 0.50, color: C.COLOR.MTN_HILLS, minY: 340, maxY: 560, n: 10 },
        ];
        this._bakedLayers = this._layers.map(l => this._genBakedLayer(l));
    }

    _genBakedLayer(l) {
        const pts = [];
        for (let i = 0; i < 50; i++) { // Wide enough for scrolling
            pts.push({ x: i * 800, y: this.rng.range(l.minY, l.maxY) });
        }
        return { ...l, pts };
    }

    draw(ctx, cam, cw, ch) {
        const sky = ctx.createLinearGradient(0, 0, 0, ch);
        sky.addColorStop(0, C.COLOR.SKY_TOP);
        sky.addColorStop(0.45, C.COLOR.SKY_MID);
        sky.addColorStop(1, C.COLOR.SKY_BOT);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, cw, ch);

        for (const layer of this._bakedLayers) {
            ctx.save();
            const ox = (cam.x * layer.factor) % 1600;
            ctx.translate(-ox, -cam.y * layer.factor * 0.2);
            ctx.beginPath();
            ctx.moveTo(-1600, ch + 200);
            const pts = layer.pts;
            for (let i = 0; i < pts.length - 1; i++) {
                const mx = (pts[i].x + pts[i + 1].x) / 2;
                const my = (pts[i].y + pts[i + 1].y) / 2;
                ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
            }
            ctx.lineTo(pts[pts.length - 1].x + 1600, ch + 200);
            ctx.closePath();
            ctx.fillStyle = layer.color;
            ctx.fill();
            ctx.restore();
        }
    }
}

// ── Terrain Renderer ──────────────────────────────────────────
class TerrainRenderer {
    constructor() {
        this.generator = new ProceduralGenerator();
        this.parallax = new ParallaxBackground();
        this.activeChunks = [];
    }

    updateActiveChunks(camX) {
        const currentIdx = Math.floor(camX / C.CHUNK_SIZE);
        this.activeChunks = [];
        for (let i = -1; i <= C.VIEW_DISTANCE; i++) {
            this.activeChunks.push(this.generator.getChunk(currentIdx + i));
        }
        this.generator.purgeOld(currentIdx);
    }

    drawBackground(ctx, cam, cw, ch) {
        this.parallax.draw(ctx, cam, cw, ch);
    }

    drawPlatforms(ctx, cam) {
        for (const chunk of this.activeChunks) {
            for (const p of chunk.platforms) {
                const sx = p.x - cam.x, sy = p.top - cam.y;
                if (p.texture === 'ground') this._drawGround(ctx, sx, sy, p.w);
                else this._drawRockPlatform(ctx, sx, sy, p.w, p.h);
            }
        }
    }

    _drawGround(ctx, sx, sy, w) {
        ctx.fillStyle = C.COLOR.GRASS;
        ctx.fillRect(sx, sy - 6, w, 10);
        const grd = ctx.createLinearGradient(sx, sy + 4, sx, sy + 80);
        grd.addColorStop(0, C.COLOR.GROUND);
        grd.addColorStop(1, C.COLOR.GROUND_DARK);
        ctx.fillStyle = grd;
        ctx.fillRect(sx, sy + 4, w, 300);
    }

    _drawRockPlatform(ctx, sx, sy, w, h) {
        ctx.fillStyle = C.COLOR.ROCK_EDGE;
        ctx.fillRect(sx, sy, w, 5);
        ctx.fillStyle = C.COLOR.ROCK_TOP;
        ctx.fillRect(sx, sy + 5, w, 10);
        ctx.fillStyle = C.COLOR.ROCK_FACE;
        ctx.fillRect(sx, sy + 15, w, h - 15);
    }

    drawDecorations(ctx, cam) {
        for (const chunk of this.activeChunks) {
            for (const d of chunk.decorations) {
                const sx = d.x - cam.x, sy = d.y - cam.y;
                if (d.type === 'tree') this._drawTree(ctx, sx, sy, d.h);
            }
        }
    }

    _drawTree(ctx, sx, sy, h) {
        ctx.fillStyle = '#5a3a18';
        ctx.fillRect(sx - 4, sy - h * 0.5, 8, h * 0.5);
        ctx.beginPath();
        ctx.ellipse(sx, sy - h * 0.8, h * 0.3, h * 0.4, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#3a5018'; ctx.fill();
    }
}

function drawEntityShadow(ctx, cam, entity) {
    const sx = entity.x - cam.x;
    const groundY = (entity.currentPlatform ? entity.currentPlatform.top : C.GROUND_Y) - cam.y;
    const dist = groundY - (entity.y + entity.radius - cam.y);
    const scale = Math.max(0.1, 1 - dist / 350);
    const alpha = Math.max(0.04, 0.38 * scale);
    const rx = entity.radius * 1.5 * scale;
    const ry = entity.radius * 0.28 * scale;
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(sx, groundY, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}
