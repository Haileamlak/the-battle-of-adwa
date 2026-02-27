// ============================================================
//  TERRAIN — Procedural map generation for the Adwa highlands
// ============================================================

class TerrainObject {
    constructor(x, y, type, radius, data = {}) {
        this.x = x;
        this.y = y;
        this.type = type;    // 'rock' | 'hill' | 'tree' | 'bush' | 'path'
        this.radius = radius;
        this.data = data;    // type-specific config
        this.solid = data.solid !== false;
        this.slowZone = data.slowZone || false;
        this.slowMult = data.slowMult || 1.0;
    }
}

// ── Deterministic RNG so the map is repeatable ─────────────
class SeededRNG {
    constructor(seed = 42) { this.state = seed; }
    next() {
        this.state ^= this.state << 13;
        this.state ^= this.state >> 17;
        this.state ^= this.state << 5;
        return (this.state >>> 0) / 0xFFFFFFFF;
    }
    range(min, max) { return min + this.next() * (max - min); }
    int(min, max) { return Math.floor(this.range(min, max + 1)); }
}

// ── Terrain generator ─────────────────────────────────────
class TerrainGenerator {
    constructor(worldW, worldH, seed = 1896) {
        this.worldW = worldW;
        this.worldH = worldH;
        this.rng = new SeededRNG(seed);
        this.objects = [];
        this.heightmap = [];   // simple 2d height grid for shading
        this._buildHeightmap();
    }

    // Fast-ish noise for terrain colouring (not collision)
    _buildHeightmap() {
        const cols = Math.ceil(this.worldW / 80);
        const rows = Math.ceil(this.worldH / 80);
        for (let r = 0; r < rows; r++) {
            this.heightmap[r] = [];
            for (let c = 0; c < cols; c++) {
                // layered noise using RNG
                const n1 = this.rng.next();
                const n2 = this.rng.next() * 0.4;
                this.heightmap[r][c] = Math.min(1, n1 * 0.7 + n2);
            }
        }
    }

    getHeight(wx, wy) {
        const c = Math.floor(wx / 80);
        const r = Math.floor(wy / 80);
        const row = this.heightmap[r];
        if (!row) return 0;
        return row[c] || 0;
    }

    generate() {
        this.objects = [];
        this._placePath();
        this._placeRocks();
        this._placeHills();
        this._placeTrees();
        this._placeBushes();
        return this.objects;
    }

    _placePath() {
        // Winding dirt path through the centre (not solid, just visual + slower)
        const points = [];
        let cx = this.worldW * 0.1;
        for (let i = 0; i < 12; i++) {
            cx += this.worldW * 0.07;
            const cy = this.worldH * 0.4 + this.rng.range(-140, 140);
            points.push({ x: cx, y: cy });
        }
        this._pathPoints = points;
    }

    _placeRocks() {
        const count = C.MAP.ROCK_COUNT;
        const margin = 80;
        const safeZone = 160; // centre safe for player spawn
        for (let i = 0; i < count; i++) {
            const x = this.rng.range(margin, this.worldW - margin);
            const y = this.rng.range(margin, this.worldH - margin);
            if (Math.hypot(x - this.worldW / 2, y - this.worldH / 2) < safeZone) continue;
            const r = this.rng.range(24, 60);
            const obj = new TerrainObject(x, y, 'rock', r, {
                solid: true,
                variant: this.rng.int(0, 2),
                angle: this.rng.range(0, Math.PI * 2),
            });
            if (!this._overlapsExisting(obj, 24)) this.objects.push(obj);
        }
    }

    _placeHills() {
        for (let i = 0; i < C.MAP.HILL_COUNT; i++) {
            const x = this.rng.range(120, this.worldW - 120);
            const y = this.rng.range(120, this.worldH - 120);
            const r = this.rng.range(90, 180);
            const obj = new TerrainObject(x, y, 'hill', r, {
                solid: false,
                slowZone: true,
                slowMult: 0.65,
                height: this.rng.range(0.3, 1.0),
            });
            if (!this._overlapsExisting(obj, 60)) this.objects.push(obj);
        }
    }

    _placeTrees() {
        for (let i = 0; i < C.MAP.TREE_COUNT; i++) {
            const x = this.rng.range(80, this.worldW - 80);
            const y = this.rng.range(80, this.worldH - 80);
            const r = this.rng.range(14, 22);
            const obj = new TerrainObject(x, y, 'tree', r, {
                solid: true,
                trunkR: r * 0.4,
            });
            if (!this._overlapsExisting(obj, 40)) this.objects.push(obj);
        }
    }

    _placeBushes() {
        for (let i = 0; i < C.MAP.BUSH_COUNT; i++) {
            const x = this.rng.range(60, this.worldW - 60);
            const y = this.rng.range(60, this.worldH - 60);
            const r = this.rng.range(12, 20);
            const obj = new TerrainObject(x, y, 'bush', r, {
                solid: false,
                slowZone: true,
                slowMult: 0.8,
            });
            if (!this._overlapsExisting(obj, 12)) this.objects.push(obj);
        }
    }

    _overlapsExisting(obj, minGap = 0) {
        for (const o of this.objects) {
            if (o.type !== obj.type) continue;
            if (Math.hypot(o.x - obj.x, o.y - obj.y) < o.radius + obj.radius + minGap)
                return true;
        }
        return false;
    }

    // Returns speed multiplier at a given world position
    getSpeedMult(x, y) {
        let mult = 1.0;
        for (const obj of this.objects) {
            if (!obj.slowZone) continue;
            const d = Math.hypot(x - obj.x, y - obj.y);
            if (d < obj.radius) {
                mult = Math.min(mult, obj.slowMult);
            }
        }
        return mult;
    }

    // Returns solid obstacles (rocks, trees)
    getSolids() {
        return this.objects.filter(o => o.solid);
    }
}

// ── Terrain Renderer ─────────────────────────────────────
class TerrainRenderer {
    constructor(terrain) {
        this.terrain = terrain;
    }

    // Draw everything below actors
    drawGround(ctx, cam) {
        const W = this.terrain.worldW;
        const H = this.terrain.worldH;

        // Sky gradient (dawn/dusk)
        const skyGrad = ctx.createLinearGradient(0, cam.y, 0, cam.y + cam.h);
        skyGrad.addColorStop(0, C.COLOR.SKY_TOP);
        skyGrad.addColorStop(1, C.COLOR.SKY_BOT);
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, cam.w, cam.h);

        // Tiled ground with height-based tone variation
        const tileSize = 80;
        const startC = Math.max(0, Math.floor(cam.x / tileSize));
        const endC = Math.min(Math.ceil(W / tileSize), Math.ceil((cam.x + cam.w) / tileSize));
        const startR = Math.max(0, Math.floor(cam.y / tileSize));
        const endR = Math.min(Math.ceil(H / tileSize), Math.ceil((cam.y + cam.h) / tileSize));

        for (let r = startR; r < endR; r++) {
            for (let c = startC; c < endC; c++) {
                const wx = c * tileSize;
                const wy = r * tileSize;
                const sx = wx - cam.x;
                const sy = wy - cam.y;
                const h = this.terrain.getHeight(wx + tileSize / 2, wy + tileSize / 2);
                ctx.fillStyle = this._groundColor(h);
                ctx.fillRect(sx, sy, tileSize + 1, tileSize + 1);
            }
        }

        // Path
        this._drawPath(ctx, cam);
    }

    _groundColor(h) {
        // Blend between sand and rock based on height
        const r1 = 200, g1 = 169, b1 = 110; // sand
        const r2 = 107, g2 = 89, b2 = 62;  // rock
        const t = Math.pow(h, 1.4);
        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);
        return `rgb(${r},${g},${b})`;
    }

    _drawPath(ctx, cam) {
        const pts = this.terrain._pathPoints;
        if (!pts || pts.length < 2) return;
        ctx.save();
        ctx.translate(-cam.x, -cam.y);
        ctx.strokeStyle = C.COLOR.PATH;
        ctx.lineWidth = 28;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // Draw terrain objects (hills, rocks, trees, bushes)
    drawObjects(ctx, cam) {
        ctx.save();
        ctx.translate(-cam.x, -cam.y);

        // Draw hills first (they're wide background elements)
        for (const obj of this.terrain.objects) {
            if (obj.type === 'hill') this._drawHill(ctx, obj);
        }
        for (const obj of this.terrain.objects) {
            if (obj.type === 'bush') this._drawBush(ctx, obj);
        }
        for (const obj of this.terrain.objects) {
            if (obj.type === 'rock') this._drawRock(ctx, obj);
        }
        for (const obj of this.terrain.objects) {
            if (obj.type === 'tree') this._drawTree(ctx, obj);
        }
        ctx.restore();
    }

    _drawHill(ctx, obj) {
        const h = obj.data.height || 0.5;
        const grad = ctx.createRadialGradient(
            obj.x - obj.radius * 0.2, obj.y - obj.radius * 0.3, 0,
            obj.x, obj.y, obj.radius
        );
        const light = `rgba(${Math.round(180 + h * 30)},${Math.round(130 + h * 20)},${Math.round(60 + h * 20)},0.9)`;
        const dark = `rgba(90,60,24,0.6)`;
        grad.addColorStop(0, light);
        grad.addColorStop(1, dark);
        ctx.beginPath();
        ctx.ellipse(obj.x, obj.y, obj.radius, obj.radius * 0.65, 0, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        // Top shadow line
        ctx.strokeStyle = 'rgba(50,30,5,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    _drawRock(ctx, obj) {
        ctx.save();
        ctx.translate(obj.x, obj.y);
        ctx.rotate(obj.data.angle || 0);
        const v = obj.data.variant || 0;
        // Rock body
        ctx.beginPath();
        if (v === 0) {
            ctx.ellipse(0, 0, obj.radius, obj.radius * 0.7, 0, 0, Math.PI * 2);
        } else if (v === 1) {
            ctx.moveTo(-obj.radius, obj.radius * 0.3);
            ctx.lineTo(-obj.radius * 0.4, -obj.radius * 0.8);
            ctx.lineTo(obj.radius * 0.6, -obj.radius * 0.6);
            ctx.lineTo(obj.radius, obj.radius * 0.4);
            ctx.closePath();
        } else {
            ctx.moveTo(0, -obj.radius);
            ctx.lineTo(obj.radius * 0.8, obj.radius * 0.3);
            ctx.lineTo(-obj.radius * 0.8, obj.radius * 0.3);
            ctx.closePath();
        }
        const grad = ctx.createLinearGradient(-obj.radius, -obj.radius, obj.radius, obj.radius);
        grad.addColorStop(0, '#8a7055');
        grad.addColorStop(0.5, '#6b5a3e');
        grad.addColorStop(1, '#3a2e1e');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = '#2a1e0e';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // highlight
        ctx.beginPath();
        ctx.ellipse(-obj.radius * 0.2, -obj.radius * 0.2, obj.radius * 0.3, obj.radius * 0.2, -0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,200,0.12)';
        ctx.fill();
        ctx.restore();
    }

    _drawTree(ctx, obj) {
        // Trunk
        ctx.beginPath();
        ctx.rect(obj.x - obj.radius * 0.4 * 0.5, obj.y - obj.radius * 0.5, obj.radius * 0.4, obj.radius * 1.2);
        ctx.fillStyle = '#5a3a1a';
        ctx.fill();
        // Canopy (multiple overlapping circles for acacia style)
        const cr = obj.radius;
        ctx.beginPath();
        ctx.ellipse(obj.x, obj.y - cr * 0.8, cr * 1.2, cr * 0.45, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#3a5a1a';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(obj.x - cr * 0.4, obj.y - cr * 0.6, cr * 0.8, cr * 0.35, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#2a4810';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(obj.x + cr * 0.4, obj.y - cr * 0.6, cr * 0.8, cr * 0.35, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#2a4810';
        ctx.fill();
    }

    _drawBush(ctx, obj) {
        ctx.beginPath();
        ctx.ellipse(obj.x, obj.y, obj.radius, obj.radius * 0.6, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#4a6020';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(obj.x - obj.radius * 0.4, obj.y - obj.radius * 0.15, obj.radius * 0.65, obj.radius * 0.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#3a5018';
        ctx.fill();
    }

    // World boundary walls (visual only)
    drawBoundary(ctx, cam) {
        ctx.save();
        ctx.translate(-cam.x, -cam.y);
        ctx.strokeStyle = '#5a3e18';
        ctx.lineWidth = 6;
        ctx.strokeRect(0, 0, this.terrain.worldW, this.terrain.worldH);
        ctx.restore();
    }
}
