// ============================================================
//  TERRAIN — Procedural terrain with elevation and 3D rendering
// ============================================================

class TerrainObject {
    constructor(x, y, type, radius, data = {}) {
        this.x = x;
        this.y = y;
        this.type = type;   // 'rock' | 'hill' | 'tree' | 'bush'
        this.radius = radius;
        this.data = data;
        this.solid = data.solid !== false;
        this.slowZone = data.slowZone || false;
        this.slowMult = data.slowMult || 1.0;
        // Visual elevation (z) — used only for rendering, not collision
        this.elevation = data.elevation || 0;
    }
}

// ── Deterministic seeded RNG ─────────────────────────────────
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

// ── Terrain generator ─────────────────────────────────────────
class TerrainGenerator {
    constructor(worldW, worldH, seed = 1896) {
        this.worldW = worldW;
        this.worldH = worldH;
        this.rng = new SeededRNG(seed);
        this.objects = [];

        // Heightmap grid (80px cells), stores 0–1 base height & light factor
        this._hmCols = Math.ceil(worldW / 80);
        this._hmRows = Math.ceil(worldH / 80);
        this._hmHeight = new Float32Array(this._hmCols * this._hmRows);
        this._hmLight = new Float32Array(this._hmCols * this._hmRows);
        this._buildHeightmap();
        this._buildLightmap();
    }

    // ── Layered RNG noise heightmap ───────────────────────────
    _buildHeightmap() {
        const rng2 = new SeededRNG(9999);
        for (let i = 0; i < this._hmHeight.length; i++) {
            const n1 = rng2.next();
            const n2 = rng2.next() * 0.4;
            this._hmHeight[i] = Math.min(1, n1 * 0.65 + n2);
        }
    }

    // ── Precompute directional lighting per tile ───────────────
    // Uses finite-difference normals from the heightmap
    _buildLightmap() {
        const L = C.CAMERA.LIGHT;
        const cols = this._hmCols;
        const rows = this._hmRows;
        const h = this._hmHeight;
        const scale = 8.0; // amplifies normal differences

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const idx = r * cols + c;
                const idxR = r * cols + Math.min(c + 1, cols - 1);
                const idxD = Math.min(r + 1, rows - 1) * cols + c;

                // Finite difference normal
                const dX = (h[idxR] - h[idx]) * scale;
                const dY = (h[idxD] - h[idx]) * scale;
                // Normal (not fully normalised — cheap)
                const nx = -dX;
                const ny = -dY;
                const nz = 1.0;
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
                const dot = (nx / len) * L.x + (ny / len) * L.y + (nz / len) * L.z;
                // Light factor: 0.55–1.0
                this._hmLight[idx] = 0.55 + Math.max(0, dot) * 0.45;
            }
        }
    }

    getHeight(wx, wy) {
        const c = Math.min(this._hmCols - 1, Math.floor(wx / 80));
        const r = Math.min(this._hmRows - 1, Math.floor(wy / 80));
        return this._hmHeight[r * this._hmCols + c] || 0;
    }

    getLight(wx, wy) {
        const c = Math.min(this._hmCols - 1, Math.floor(wx / 80));
        const r = Math.min(this._hmRows - 1, Math.floor(wy / 80));
        return this._hmLight[r * this._hmCols + c] || 0.75;
    }

    // ── Get visual elevation at any world position ─────────────
    // Sums elevation contributed by nearby hills (gaussian falloff)
    getElevationAt(wx, wy) {
        let elev = 0;
        for (const obj of this.objects) {
            if (obj.type !== 'hill') continue;
            const d = Math.hypot(wx - obj.x, wy - obj.y);
            if (d < obj.radius * 1.2) {
                const t = 1 - (d / (obj.radius * 1.2));
                elev += obj.elevation * t * t; // quadratic falloff
            }
        }
        return elev;
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
        let cx = this.worldW * 0.1;
        const points = [];
        for (let i = 0; i < 12; i++) {
            cx += this.worldW * 0.07;
            const cy = this.worldH * 0.4 + this.rng.range(-140, 140);
            points.push({ x: cx, y: cy });
        }
        this._pathPoints = points;
    }

    _placeRocks() {
        const margin = 80, safeZone = 160;
        const cx = this.worldW / 2, cy = this.worldH / 2;
        for (let i = 0; i < C.MAP.ROCK_COUNT; i++) {
            const x = this.rng.range(margin, this.worldW - margin);
            const y = this.rng.range(margin, this.worldH - margin);
            if (Math.hypot(x - cx, y - cy) < safeZone) continue;
            const r = this.rng.range(24, 60);
            const elev = this.rng.range(C.ELEV.ROCK_MIN, C.ELEV.ROCK_MAX);
            const obj = new TerrainObject(x, y, 'rock', r, {
                solid: true,
                elevation: elev,
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
            const elev = this.rng.range(C.ELEV.HILL_MIN, C.ELEV.HILL_MAX);
            const obj = new TerrainObject(x, y, 'hill', r, {
                solid: false,
                slowZone: true,
                slowMult: 0.65,
                elevation: elev,
                height: elev / C.ELEV.HILL_MAX,
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
                elevation: 0, // trees sit on ground; their height is just visual
                trunkR: r * 0.4,
                treeH: r * 3.5,  // visual height of tree canopy top
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
                elevation: 0,
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

    getSpeedMult(x, y) {
        let mult = 1.0;
        for (const obj of this.objects) {
            if (!obj.slowZone) continue;
            if (Math.hypot(x - obj.x, y - obj.y) < obj.radius)
                mult = Math.min(mult, obj.slowMult);
        }
        return mult;
    }

    getSolids() { return this.objects.filter(o => o.solid); }
}

// ── Terrain Renderer (Pseudo-3D) ─────────────────────────────
class TerrainRenderer {
    constructor(terrain) {
        this.terrain = terrain;
    }

    // ── Ground with perspective tilt + directional lighting (smooth) 
    drawGround(ctx, cam) {
        const W = this.terrain.worldW;
        const H = this.terrain.worldH;

        // Sky gradient (dawn)
        const skyGrad = ctx.createLinearGradient(0, 0, 0, cam.h);
        skyGrad.addColorStop(0, C.COLOR.SKY_TOP);
        skyGrad.addColorStop(1, C.COLOR.SKY_BOT);
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, cam.w, cam.h);

        // Build/cache the offscreen terrain texture at low res for smooth blending
        if (!this._terrainCanvas) this._bakeTerrainTexture();

        // Compute visible world rect (accounting for tilt showing extra Y)
        const yExtra = (cam.h / C.CAMERA.TILT - cam.h) * 0.5 + 80;
        const wStartX = Math.max(0, cam.x - 80);
        const wStartY = Math.max(0, cam.y - 80);
        const wEndX = Math.min(W, cam.x + cam.w + 80);
        const wEndY = Math.min(H, cam.y + cam.h / C.CAMERA.TILT + yExtra);

        // Source region on baked texture
        const BAKE_SCALE = this._bakeScale;
        const srcX = wStartX * BAKE_SCALE;
        const srcY = wStartY * BAKE_SCALE;
        const srcW = (wEndX - wStartX) * BAKE_SCALE;
        const srcH = (wEndY - wStartY) * BAKE_SCALE;

        // Destination: project world corners → screen
        const p1 = cam.project(wStartX, wStartY, 0);
        const p2 = cam.project(wEndX, wStartY, 0);
        const p3 = cam.project(wEndX, wEndY, 0);
        const p4 = cam.project(wStartX, wEndY, 0);

        // Draw the terrain texture as a perspective-squished quad using a clip + skew
        // Since tilt just compresses Y uniformly we can use a simple drawImage with
        // ctx.transform to apply the Y compression in world→screen space.
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';

        // Transform: draw from (p1.x, p1.y) with full width and Y-compressed height
        const dstX = p1.x;
        const dstY = p1.y;
        const dstW = p2.x - p1.x;   // same width as world (no X distortion)
        const dstH = p4.y - p1.y;   // compressed height (TILT applied)

        ctx.drawImage(this._terrainCanvas, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH);
        ctx.restore();

        this._drawPath(ctx, cam);
    }

    // Bake the terrain color image at 1/4 resolution into an offscreen canvas
    _bakeTerrainTexture() {
        const BAKE_SCALE = 0.125; // 1/8th resolution = smooth, cheap
        this._bakeScale = BAKE_SCALE;
        const bW = Math.ceil(this.terrain.worldW * BAKE_SCALE);
        const bH = Math.ceil(this.terrain.worldH * BAKE_SCALE);
        const oc = document.createElement('canvas');
        oc.width = bW; oc.height = bH;
        const octx = oc.getContext('2d');
        octx.imageSmoothingEnabled = false;

        // Draw one pixel per baked cell
        const cell = 1 / BAKE_SCALE; // world pixels per baked pixel
        const img = octx.createImageData(bW, bH);
        const d = img.data;
        for (let ry = 0; ry < bH; ry++) {
            for (let cx = 0; cx < bW; cx++) {
                const wx = cx / BAKE_SCALE + cell * 0.5;
                const wy = ry / BAKE_SCALE + cell * 0.5;
                const h = this.terrain.getHeight(wx, wy);
                const l = this.terrain.getLight(wx, wy);
                // Base: sand(200,169,110) → dark rock(107,89,62)
                const t = Math.pow(h, 1.4);
                const r = Math.round(Math.min(255, (200 + (107 - 200) * t) * l));
                const g = Math.round(Math.min(255, (169 + (89 - 169) * t) * l));
                const b = Math.round(Math.min(255, (110 + (62 - 110) * t) * l));
                const idx = (ry * bW + cx) * 4;
                d[idx] = r; d[idx + 1] = g; d[idx + 2] = b; d[idx + 3] = 255;
            }
        }
        octx.putImageData(img, 0, 0);
        this._terrainCanvas = oc;
    }

    _groundColor(h, light) {
        // Base: sand → rock based on height
        const r1 = 200, g1 = 169, b1 = 110;
        const r2 = 107, g2 = 89, b2 = 62;
        const t = Math.pow(h, 1.4);
        const rb = r1 + (r2 - r1) * t;
        const gb = g1 + (g2 - g1) * t;
        const bb = b1 + (b2 - b1) * t;
        // Apply directional light
        const r = Math.round(Math.min(255, rb * light));
        const g = Math.round(Math.min(255, gb * light));
        const b = Math.round(Math.min(255, bb * light));
        return `rgb(${r},${g},${b})`;
    }

    _drawPath(ctx, cam) {
        const pts = this.terrain._pathPoints;
        if (!pts || pts.length < 2) return;
        ctx.save();
        ctx.strokeStyle = C.COLOR.PATH;
        ctx.lineWidth = 28;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        const p0 = cam.project(pts[0].x, pts[0].y, 0);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < pts.length; i++) {
            const pi = cam.project(pts[i].x, pts[i].y, 0);
            ctx.lineTo(pi.x, pi.y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    // ── Terrain object sort key for painter's algorithm ───────
    sortKey(obj) {
        // Sort by world-Y + small elevation boost for hills
        return obj.y + (obj.type === 'hill' ? obj.elevation * 0.3 : 0);
    }

    // ── Draw all terrain objects ──────────────────────────────
    drawObjects(ctx, cam) {
        // Sort hills first (background), then bushes, rocks, trees
        const hills = this.terrain.objects.filter(o => o.type === 'hill');
        const bushes = this.terrain.objects.filter(o => o.type === 'bush');
        const rocks = this.terrain.objects.filter(o => o.type === 'rock');
        const trees = this.terrain.objects.filter(o => o.type === 'tree');

        // Hills – draw back to front (by world Y)
        hills.sort((a, b) => a.y - b.y).forEach(o => this._drawHill3D(ctx, cam, o));
        bushes.sort((a, b) => a.y - b.y).forEach(o => this._drawBush(ctx, cam, o));
        rocks.sort((a, b) => a.y - b.y).forEach(o => this._drawRock3D(ctx, cam, o));
        trees.sort((a, b) => a.y - b.y).forEach(o => {
            this._drawEntityShadow(ctx, cam, o.x, o.y, o.radius * 1.0, 0);
            this._drawTree3D(ctx, cam, o);
        });
    }

    // ── 3D Hill (raised mound with lit face + shadow face) ────
    _drawHill3D(ctx, cam, obj) {
        const p = cam.project(obj.x, obj.y, 0);
        if (!cam.isVisible(obj.x, obj.y, obj.radius * 2)) return;

        const r = obj.radius;
        const rx = r;
        const ry = r * C.CAMERA.TILT;                      // footprint ellipse
        const elev = obj.elevation * C.CAMERA.ELEV_SCALE;   // visual height pixels

        // ── Shadow face (south/east side of hill) ─────────────
        const shadowGrad = ctx.createLinearGradient(p.x, p.y, p.x + r * 0.3, p.y + ry * 0.5);
        shadowGrad.addColorStop(0, 'rgba(50,30,5,0.45)');
        shadowGrad.addColorStop(1, 'rgba(30,15,0,0.6)');

        ctx.save();
        ctx.beginPath();
        // Bottom-left arc of footprint → offset up by elevation → right
        ctx.ellipse(p.x, p.y, rx * 0.85, ry * 0.55, 0, Math.PI * 0.1, Math.PI * 1.0);
        ctx.lineTo(p.x - rx * 0.5, p.y - elev * 0.45);
        ctx.closePath();
        ctx.fillStyle = shadowGrad;
        ctx.fill();
        ctx.restore();

        // ── Lit top face ───────────────────────────────────────
        const h = obj.data.height || 0.5;
        const topGrad = ctx.createRadialGradient(
            p.x - rx * 0.2, p.y - elev - ry * 0.2, 0,
            p.x, p.y - elev, rx * 1.1
        );
        const lr = Math.round(180 + h * 40);
        const lg = Math.round(130 + h * 30);
        const lb = Math.round(60 + h * 20);
        topGrad.addColorStop(0, `rgb(${lr + 20},${lg + 15},${lb + 10})`);
        topGrad.addColorStop(0.6, `rgb(${lr},${lg},${lb})`);
        topGrad.addColorStop(1, 'rgba(90,60,24,0.85)');

        ctx.beginPath();
        ctx.ellipse(p.x, p.y - elev, rx, ry * 0.88, 0, 0, Math.PI * 2);
        ctx.fillStyle = topGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(50,30,5,0.25)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // ── Front face connecting top ellipse base to ground ellipse
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, rx * 0.85, ry * 0.55, 0, Math.PI, Math.PI * 2, true); // bottom arc
        ctx.ellipse(p.x, p.y - elev, rx * 0.85, ry * 0.55, 0, Math.PI * 2, Math.PI, true); // top arc
        ctx.closePath();
        const sideGrad = ctx.createLinearGradient(p.x - rx, p.y - elev, p.x + rx, p.y);
        sideGrad.addColorStop(0, `rgba(${lr + 15},${lg + 10},${lb + 5},0.9)`);
        sideGrad.addColorStop(0.5, `rgba(${lr},${lg},${lb},0.85)`);
        sideGrad.addColorStop(1, `rgba(70,45,15,0.9)`);
        ctx.fillStyle = sideGrad;
        ctx.fill();
    }

    // ── 3D Rock (base footprint + extruded top with face) ─────
    _drawRock3D(ctx, cam, obj) {
        if (!cam.isVisible(obj.x, obj.y, obj.radius * 2)) return;
        const p = cam.project(obj.x, obj.y, 0);
        const pTop = cam.project(obj.x, obj.y, obj.elevation);
        const r = obj.radius;
        const dy = p.y - pTop.y; // vertical pixel offset (top vs bottom)

        ctx.save();

        const v = obj.data.variant || 0;
        ctx.translate(p.x, p.y);
        ctx.rotate(obj.data.angle || 0);

        // ── Shadow beneath rock ────────────────────────────────
        this._drawEntityShadow(ctx, cam, obj.x, obj.y, r * 0.9, 0, true, true);

        // ── Rock side face (dark) ──────────────────────────────
        ctx.save();
        ctx.translate(0, 0);
        // Build 2 polygons offset by dy: base and top
        const pts = v === 0
            ? this._rockPoly0(r)
            : v === 1 ? this._rockPoly1(r) : this._rockPoly2(r);

        // Side face = bottom poly + flipped top poly
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const pt of pts) ctx.lineTo(pt.x, pt.y);
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y - dy);
        for (let i = pts.length - 1; i >= 0; i--)
            ctx.lineTo(pts[i].x, pts[i].y - dy);
        ctx.closePath();
        ctx.fillStyle = '#3a2e1e';
        ctx.fill();

        // ── Rock top face ──────────────────────────────────────
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y - dy);
        for (const pt of pts) ctx.lineTo(pt.x, pt.y - dy);
        ctx.closePath();
        const grad = ctx.createLinearGradient(-r, -r - dy, r, r - dy);
        grad.addColorStop(0, '#9a8060');
        grad.addColorStop(0.45, '#6b5a3e');
        grad.addColorStop(1, '#2a1e0e');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = '#1a120a';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Highlight on top
        ctx.beginPath();
        ctx.ellipse(-r * 0.2, -r * 0.2 - dy, r * 0.28, r * 0.18, -0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,200,0.14)';
        ctx.fill();

        ctx.restore();
        ctx.restore();
    }

    // Rock polygon helpers
    _rockPoly0(r) {
        return [{ x: -r, y: r * 0.3 }, { x: -r * 0.4, y: -r * 0.6 }, { x: r * 0.5, y: -r * 0.5 }, { x: r, y: r * 0.35 }];
    }
    _rockPoly1(r) {
        return [{ x: -r * 0.8, y: r * 0.3 }, { x: -r * 0.5, y: -r * 0.5 }, { x: r * 0.4, y: -r * 0.7 }, { x: r * 0.9, y: r * 0.1 }, { x: r * 0.4, y: r * 0.5 }];
    }
    _rockPoly2(r) {
        return [{ x: 0, y: -r }, { x: r * 0.8, y: r * 0.3 }, { x: -r * 0.8, y: r * 0.3 }];
    }

    // ── 3D Tree (trunk cylinder + flat canopy elevated) ────────
    _drawTree3D(ctx, cam, obj) {
        if (!cam.isVisible(obj.x, obj.y, obj.radius * 3)) return;
        const p = cam.project(obj.x, obj.y, 0);
        const elev = obj.data.treeH || obj.radius * 3;

        // Trunk (two lines forming a flat slab)
        const tw = obj.data.trunkR * 0.9;
        const projElev = elev * C.CAMERA.ELEV_SCALE;
        ctx.fillStyle = '#5a3a1a';
        ctx.beginPath();
        ctx.rect(p.x - tw * 0.5, p.y - projElev, tw, projElev * 0.55);
        ctx.fill();

        // Canopy top face (ellipses at elevation)
        const pCanopy = cam.project(obj.x, obj.y, elev * 0.7);
        const cr = obj.radius;

        // Main canopy
        ctx.beginPath();
        ctx.ellipse(pCanopy.x, pCanopy.y, cr * 1.3, cr * 0.55, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#3a5a1a';
        ctx.fill();
        // Side canopy (darker)
        ctx.beginPath();
        ctx.ellipse(pCanopy.x - cr * 0.35, pCanopy.y + cr * 0.15, cr * 0.9, cr * 0.38, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#243c10';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(pCanopy.x + cr * 0.35, pCanopy.y + cr * 0.1, cr * 0.9, cr * 0.38, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#2a4810';
        ctx.fill();
        // Light top
        ctx.beginPath();
        ctx.ellipse(pCanopy.x - cr * 0.2, pCanopy.y - cr * 0.1, cr * 0.6, cr * 0.22, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(80,130,30,0.6)';
        ctx.fill();
    }

    _drawBush(ctx, cam, obj) {
        if (!cam.isVisible(obj.x, obj.y, obj.radius)) return;
        const p = cam.project(obj.x, obj.y, 0);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, obj.radius, obj.radius * 0.45 * C.CAMERA.TILT, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#4a6020';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(p.x - obj.radius * 0.35, p.y - obj.radius * 0.15, obj.radius * 0.65, obj.radius * 0.35 * C.CAMERA.TILT, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#3a5018';
        ctx.fill();
    }

    // ── Shared soft shadow helper ──────────────────────────────
    // Called by entities too (exported separately below)
    _drawEntityShadow(ctx, cam, wx, wy, r, elevation, inLocalSpace = false, skipProject = false) {
        drawEntityShadow(ctx, cam, wx, wy, r, elevation);
    }

    drawBoundary(ctx, cam) {
        ctx.save();
        const p1 = cam.project(0, 0, 0);
        const p2 = cam.project(this.terrain.worldW, 0, 0);
        const p3 = cam.project(this.terrain.worldW, this.terrain.worldH, 0);
        const p4 = cam.project(0, this.terrain.worldH, 0);
        ctx.strokeStyle = '#5a3e18';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    }
}

// ── Global shadow helper — called by all entities ────────────
function drawEntityShadow(ctx, cam, wx, wy, r, elevation = 0) {
    const groundProj = cam.project(wx, wy, elevation);
    // Shadow is offset in light direction and slightly scaled by elevation
    const shadowX = groundProj.x + elevation * 0.35 * C.CAMERA.ELEV_SCALE;
    const shadowY = groundProj.y + 4 + elevation * 0.18 * C.CAMERA.ELEV_SCALE;
    const shadowRx = r * C.CAMERA.SHADOW_STRETCH;
    const shadowRy = r * 0.32 * C.CAMERA.TILT;
    const shadowAlpha = Math.max(0.08, C.CAMERA.SHADOW_ALPHA - elevation * 0.004);

    const sGrad = ctx.createRadialGradient(shadowX, shadowY, 0, shadowX, shadowY, shadowRx);
    sGrad.addColorStop(0, `rgba(0,0,0,${shadowAlpha})`);
    sGrad.addColorStop(0.6, `rgba(0,0,0,${shadowAlpha * 0.6})`);
    sGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.fillStyle = sGrad;
    ctx.beginPath();
    ctx.ellipse(shadowX, shadowY, shadowRx, shadowRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}
