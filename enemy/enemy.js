// ============================================================
//  ENEMY — Procedural Animated Enemies (Side-Scrolling)
// ============================================================

class Enemy {
    constructor(x, y, cfg, combat) {
        this.x = x; this.y = y;
        this.cfg = cfg;
        this.combat = combat;

        this.hpMax = cfg.HP;
        this.hp = cfg.HP;
        this.radius = cfg.RADIUS;
        this.alive = true;
        this.isBoss = false;

        this.vx = 0; this.vy = 0;
        this._prevY = y;
        this.grounded = false;
        this.facingDir = -1;

        // Animation properties
        this.walkCycle = Math.random() * 10;
        this.tilt = 0;
        this.bob = 0;
        this.squash = 1;

        this.player = null; this.map = null;
        this._attackCooldown = 0;

        this.hitFlash = 0;
        this.isAttacking = false;
        this.attackAnim = 0;
        this.knockbackX = 0;
        this.knockbackY = 0;
        this.deathTimer = 0;

        this.sm = buildEnemyStateMachine(this);
        this.sm.transition(AIState.PATROL);
    }

    receiveDamage(amount, opts = {}) {
        if (!this.alive) return;
        this.hp = Math.max(0, this.hp - amount);
        this.hitFlash = 0.22;
        this.knockbackX = opts.knockbackX || 0;
        this.knockbackY = opts.knockbackY || -80;
        if (this.hp <= 0) {
            this.alive = false;
            this.combat.spawnDeathEffect(this.x, this.y);
            this.sm.transition(AIState.DEAD);
        }
    }

    update(dt, map, player) {
        this.player = player; this.map = map;
        if (!this.alive) { this.deathTimer += dt; return; }

        this._prevY = this.y;
        this.sm.update(dt);

        if (this.hitFlash > 0) this.hitFlash -= dt;
        if (this.attackAnim > 0) this.attackAnim -= dt * 3;

        // Physics
        this.vy = Math.min(this.vy + C.GRAVITY * dt, C.TERMINAL_V);
        this.x += (this.vx + this.knockbackX) * dt;
        this.y += (this.vy + this.knockbackY) * dt;
        this.knockbackX *= 0.82; this.knockbackY *= 0.82;

        if (map) map.resolveCollision(this);

        // AI edge detection
        if (this.grounded && Math.abs(this.vx) > 10 && !map.hasGroundAhead(this, this.vx > 0 ? 1 : -1)) {
            this.vx = 0;
            if (this.sm.is(AIState.PATROL)) this._patrolDir *= -1;
        }

        // Modular Animation Logic
        if (Math.abs(this.vx) > 10 && this.grounded) {
            this.walkCycle += dt * 10;
            this.bob = Math.sin(this.walkCycle) * 5;
            this.tilt = Math.sin(this.walkCycle * 0.5) * 0.1;
        } else {
            this.bob = Math.sin(Date.now() / 400 + this.x) * 2;
            this.tilt *= 0.9;
        }
    }

    _drawHealthBar(ctx, sx, sy) {
        if (this.hp >= this.hpMax) return;
        const bw = this.radius * 2.2, bh = 4;
        const bx = sx - bw / 2, by = sy - this.radius - 12;
        ctx.fillStyle = '#111'; ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = this.hp / this.hpMax > 0.4 ? '#2a2' : '#a22';
        ctx.fillRect(bx, by, bw * (this.hp / this.hpMax), bh);
    }

    sortKey() { return this.y; }
}

class Soldier extends Enemy {
    constructor(x, y, combat) {
        super(x, y, C.ENEMY.SOLDIER, combat);
        this.type = 'soldier';
    }
    _doAttack() {
        if (!this.player?.alive) return;
        this.combat.performAttack(this, [this.player], { range: this.cfg.ATTACK_RANGE, damage: this.cfg.DAMAGE });
        this.attackAnim = 1.0;
    }
    draw(ctx, cam) {
        const p = cam.project(this.x, this.y);
        const sx = p.x, sy = p.y, r = this.radius;
        if (!cam.isVisible(this.x, this.y, r * 4)) return;

        ctx.save();
        drawEntityShadow(ctx, cam, this);
        ctx.translate(sx, sy + this.bob);
        if (!this.alive) { ctx.globalAlpha = Math.max(0, 1 - this.deathTimer); ctx.rotate(Math.PI / 2); }
        if (this.hitFlash > 0) { ctx.shadowColor = '#f22'; ctx.shadowBlur = 10; }

        ctx.scale(this.facingDir, 1);
        ctx.rotate(this.tilt);

        const img = window._assets?.enemy;
        if (img && img.complete && img.naturalWidth > 0) {
            const aspect = img.naturalWidth / img.naturalHeight;
            const h = r * 10.0, w = h * aspect;
            ctx.drawImage(img, -w / 2, -h * 0.85, w, h);
        } else {
            ctx.fillStyle = C.COLOR.ENEMY_COAT;
            ctx.fillRect(-r * 0.6, -r * 1.8, r * 1.2, r * 2.2);
        }

        this._drawHealthBar(ctx, 0, 0);
        ctx.restore();
    }
}

class Rifleman extends Enemy {
    constructor(x, y, combat) {
        super(x, y, C.ENEMY.RIFLEMAN, combat);
        this.type = 'rifleman';
    }
    _doAttack() {
        if (!this.player?.alive) return;
        this.combat.fireProjectile(this, this.player.x, this.player.y - 20, this.cfg.DAMAGE);
        this.attackAnim = 1.0;
    }
    draw(ctx, cam) {
        const p = cam.project(this.x, this.y);
        const sx = p.x, sy = p.y, r = this.radius;
        if (!cam.isVisible(this.x, this.y, r * 4)) return;

        ctx.save();
        drawEntityShadow(ctx, cam, this);
        ctx.translate(sx, sy + this.bob);
        if (!this.alive) { ctx.globalAlpha = Math.max(0, 1 - this.deathTimer); ctx.rotate(Math.PI / 2); }

        ctx.scale(this.facingDir, 1);
        ctx.rotate(this.tilt);

        const img = window._assets?.enemy;
        if (img && img.complete && img.naturalWidth > 0) {
            const aspect = img.naturalWidth / img.naturalHeight;
            const h = r * 10.0, w = h * aspect;
            ctx.drawImage(img, -w / 2, -h * 0.85, w, h);
        } else {
            ctx.fillStyle = '#445';
            ctx.fillRect(-r * 0.6, -r * 1.8, r * 1.2, r * 2.2);
        }

        this._drawHealthBar(ctx, 0, 0);
        ctx.restore();
    }
}

function applyGroupSeparation(enemies) {
    for (let i = 0; i < enemies.length; i++) {
        const a = enemies[i]; if (!a.alive) continue;
        for (let j = i + 1; j < enemies.length; j++) {
            const b = enemies[j]; if (!b.alive) continue;
            const dx = b.x - a.x, dy = b.y - a.y;
            const d = Math.hypot(dx, dy);
            const min = a.radius + b.radius + C.AI.GROUP_SPACING;
            if (d < min && d > 0.01) {
                const push = (min - d) * 0.25;
                const nx = dx / d, ny = dy / d;
                a.x -= nx * push; b.x += nx * push;
            }
        }
    }
}
