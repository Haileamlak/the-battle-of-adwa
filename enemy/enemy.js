// ============================================================
//  ENEMY — Base class + Soldier + Rifleman types
// ============================================================

class Enemy {
    constructor(x, y, cfg, combat) {
        this.x = x;
        this.y = y;
        this.cfg = cfg;
        this.combat = combat;

        this.hp = cfg.HP;
        this.hpMax = cfg.HP;
        this.radius = cfg.RADIUS;
        this.alive = true;
        this.isBoss = false;

        this.vx = 0;
        this.vy = 0;
        this.facing = Math.random() * Math.PI * 2;

        // AI references (set by game before first update)
        this.player = null;
        this.map = null;
        this._chaseX = 0;
        this._chaseY = 0;
        this._terrainMult = 1.0;
        this._attackCooldown = 0;
        this.wanderTimer = 0;
        this.pathTimer = 0;
        this.deathTimer = 0;

        // Visual
        this.hitFlash = 0;
        this.attackAnim = 0;
        this.isAttacking = false;

        // Score value
        this.score = cfg.SCORE || 10;

        // State machine (built in subclass or here)
        this.sm = buildEnemyStateMachine(this);
        this.sm.transition(AIState.IDLE);
    }

    // ── AI helpers ─────────────────────────────────────────
    _distToPlayer() {
        if (!this.player) return Infinity;
        return Math.hypot(this.player.x - this.x, this.player.y - this.y);
    }

    _computeChaseVector() {
        if (!this.player) return;
        const dx = this.player.x - this.x;
        const dy = this.player.y - this.y;
        const d = Math.hypot(dx, dy) || 1;
        this._chaseX = dx / d;
        this._chaseY = dy / d;
        this.facing = Math.atan2(dy, dx);
        this._terrainMult = this.map ? this.map.getSpeedMult(this.x, this.y) : 1.0;
    }

    _doAttack() {
        // Overridden by subclass
    }

    // ── Receive damage ─────────────────────────────────────
    receiveDamage(amount, opts = {}) {
        if (!this.alive) return;
        this.hp = Math.max(0, this.hp - amount);
        this.hitFlash = 0.2;
        this.knockbackX = opts.knockbackX || 0;
        this.knockbackY = opts.knockbackY || 0;
        if (this.hp <= 0) {
            this.combat.spawnDeathEffect(this.x, this.y);
            this.sm.transition(AIState.DEAD);
        }
    }

    // ── Update ─────────────────────────────────────────────
    update(dt, map, player) {
        this.player = player;
        this.map = map;

        if (!this.alive) {
            this.deathTimer += dt;
            return;
        }

        // Timers
        if (this.hitFlash > 0) this.hitFlash -= dt;
        if (this.attackAnim > 0) this.attackAnim -= dt * 3;

        // Knockback
        if (Math.abs(this.knockbackX) > 0.5 || Math.abs(this.knockbackY) > 0.5) {
            this.x += this.knockbackX * dt;
            this.y += this.knockbackY * dt;
            this.knockbackX *= 0.72;
            this.knockbackY *= 0.72;
        }

        // State machine
        this.sm.update(dt);

        // Apply velocity
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Collision
        if (map) map.resolveCollision(this);

        // Separation from other enemies (simple avoidance)
        this._applyGroupSeparation();
    }

    _applyGroupSeparation() {
        // Implemented in GameManager by passing neighbour list
        // Kept here as hook
    }

    // ── Draw methods (shared helpers) ──────────────────────
    _drawShadow(ctx) {
        ctx.beginPath();
        ctx.ellipse(0, this.radius * 0.85, this.radius * 0.88, this.radius * 0.28, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fill();
    }

    _drawHealthBar(ctx) {
        if (this.hp >= this.hpMax) return;
        const bw = this.radius * 2.2;
        const bh = 4;
        const bx = -bw / 2;
        const by = -this.radius - 12;
        ctx.fillStyle = '#1a0a0a';
        ctx.fillRect(bx, by, bw, bh);
        const pct = this.hp / this.hpMax;
        ctx.fillStyle = pct > 0.5 ? '#2a8a1a' : pct > 0.25 ? '#ca8010' : '#aa1010';
        ctx.fillRect(bx, by, bw * pct, bh);
    }
}

// ============================================================
//  SOLDIER — Melee infantry
// ============================================================
class Soldier extends Enemy {
    constructor(x, y, combat) {
        super(x, y, C.ENEMY.SOLDIER, combat);
        this.type = 'soldier';
        this.walkCycle = Math.random() * Math.PI * 2;
    }

    _doAttack() {
        if (!this.player || !this.player.alive) return;
        const d = this._distToPlayer();
        if (d <= this.cfg.ATTACK_RANGE + this.player.radius) {
            this.isAttacking = true;
            this.attackAnim = 1.0;
            this.combat.performAttack(this, [this.player], {
                range: this.cfg.ATTACK_RANGE,
                damage: this.cfg.DAMAGE,
                knockback: 50,
                type: 'normal',
            });
        }
    }

    update(dt, map, player) {
        super.update(dt, map, player);
        if (this.alive) this.walkCycle += dt * 7;
    }

    draw(ctx, cam) {
        if (!this.alive && this.deathTimer > 1.5) return;
        if (!cam.isVisible(this.x, this.y, this.radius * 2)) return;

        const sx = this.x - cam.x;
        const sy = this.y - cam.y;
        const r = this.radius;

        ctx.save();
        ctx.translate(sx, sy);

        if (!this.alive) {
            ctx.globalAlpha = Math.max(0, 1 - (this.deathTimer - 0.4) * 1.2);
            ctx.rotate(Math.PI / 2);
        }

        if (this.hitFlash > 0) {
            ctx.shadowColor = '#ff4040';
            ctx.shadowBlur = 14;
        }

        this._drawShadow(ctx);
        ctx.rotate(this.facing + Math.PI / 2);

        // Legs
        const legSwing = Math.sin(this.walkCycle) * 4;
        ctx.fillStyle = '#2a3520';
        ctx.beginPath(); ctx.ellipse(-r * 0.28, r * 0.5 + legSwing, r * 0.22, r * 0.38, 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(r * 0.28, r * 0.5 - legSwing, r * 0.22, r * 0.38, -0.15, 0, Math.PI * 2); ctx.fill();

        // Coat (Italian colonial khaki/grey-green)
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.52, r * 0.68, 0, 0, Math.PI * 2);
        ctx.fillStyle = C.COLOR.ENEMY_SOLDIER;
        ctx.fill();
        ctx.strokeStyle = '#1a2a10';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Helmet (pith helmet shape)
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.8, r * 0.42, r * 0.22, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#8a8a60';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.65, r * 0.52, r * 0.14, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#7a7a50';
        ctx.fill();

        // Face
        ctx.beginPath();
        ctx.arc(0, -r * 0.72, r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = '#c8a878';
        ctx.fill();

        // Rifle (right arm)
        ctx.save();
        ctx.translate(r * 0.55, -r * 0.1);
        if (this.isAttacking && this.attackAnim > 0) {
            ctx.rotate(-0.5 * this.attackAnim);
        }
        ctx.strokeStyle = '#5a3a10';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, r * 0.3);
        ctx.lineTo(0, -r * 1.1);
        ctx.stroke();
        ctx.strokeStyle = '#888870';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.5);
        ctx.lineTo(0, -r * 1.1);
        ctx.stroke();
        // Bayonet
        ctx.strokeStyle = '#c0c0a0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.1);
        ctx.lineTo(0, -r * 1.5);
        ctx.stroke();
        ctx.restore();

        this._drawHealthBar(ctx);
        ctx.restore();
    }
}

// ============================================================
//  RIFLEMAN — Ranged enemy, keeps distance
// ============================================================
class Rifleman extends Enemy {
    constructor(x, y, combat) {
        super(x, y, C.ENEMY.RIFLEMAN, combat);
        this.type = 'rifleman';
        this.sm.transition(AIState.IDLE);
        this._shootAnim = 0;
        this._muzzleFlash = 0;
        this._bulletTrails = [];

        // Override chase state to maintain preferred distance
        this.sm.states[AIState.CHASE].update = (e, dt) => {
            e.pathTimer -= dt;
            if (e.pathTimer <= 0) {
                e.pathTimer = C.AI.PATH_INTERVAL;
                e._computeChaseVector();
            }
            const d = e._distToPlayer();
            const preferred = e.cfg.PREFERRED_DIST;
            let speed = e.cfg.SPEED * e._terrainMult;

            if (d < preferred * 0.6) {
                // Too close — back away
                e.vx = -e._chaseX * speed;
                e.vy = -e._chaseY * speed;
            } else if (d > preferred * 1.4) {
                // Too far — approach
                e.vx = e._chaseX * speed * 0.7;
                e.vy = e._chaseY * speed * 0.7;
            } else {
                // Good range — sidestep
                const side = (Math.sin(Date.now() * 0.001) > 0) ? 1 : -1;
                e.vx = (-e._chaseY) * speed * 0.3 * side;
                e.vy = (e._chaseX) * speed * 0.3 * side;
            }

            if (d > e.cfg.LOSE_R) { e.sm.transition(AIState.IDLE); return; }
            if (d < e.cfg.ATTACK_RANGE) e.sm.transition(AIState.ATTACK);
        };
    }

    _doAttack() {
        if (!this.player || !this.player.alive) return;
        const d = this._distToPlayer();
        if (d <= this.cfg.ATTACK_RANGE) {
            this._shootAnim = 1.0;
            this._muzzleFlash = 0.12;
            this.isAttacking = true;
            this.combat.performRangedAttack(this, this.player, this.cfg.DAMAGE);
        }
    }

    update(dt, map, player) {
        super.update(dt, map, player);
        if (this._muzzleFlash > 0) this._muzzleFlash -= dt;
        if (this._shootAnim > 0) this._shootAnim -= dt * 2;
    }

    draw(ctx, cam) {
        if (!this.alive && this.deathTimer > 1.5) return;
        if (!cam.isVisible(this.x, this.y, this.radius * 2)) return;

        const sx = this.x - cam.x;
        const sy = this.y - cam.y;
        const r = this.radius;

        ctx.save();
        ctx.translate(sx, sy);

        if (!this.alive) {
            ctx.globalAlpha = Math.max(0, 1 - (this.deathTimer - 0.4) * 1.2);
            ctx.rotate(Math.PI / 2);
        }

        if (this.hitFlash > 0) { ctx.shadowColor = '#ff4040'; ctx.shadowBlur = 14; }

        this._drawShadow(ctx);
        ctx.rotate(this.facing + Math.PI / 2);

        // Body (lighter uniform — marksmen unit)
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.48, r * 0.65, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#4a5a38';
        ctx.fill();
        ctx.strokeStyle = '#2a3820';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Cap (brimmed, not pith helmet)
        ctx.beginPath();
        ctx.arc(0, -r * 0.75, r * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = '#6a7048';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.63, r * 0.46, r * 0.12, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#5a6040';
        ctx.fill();

        // Face
        ctx.beginPath();
        ctx.arc(0, -r * 0.7, r * 0.28, 0, Math.PI * 2);
        ctx.fillStyle = '#c8a068';
        ctx.fill();

        // Long rifle (bolt-action)
        ctx.save();
        ctx.translate(r * 0.5, -r * 0.2);
        if (this._shootAnim > 0) ctx.rotate(-0.3 * this._shootAnim);
        ctx.strokeStyle = '#4a3010';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, r * 0.4);
        ctx.lineTo(0, -r * 1.4);
        ctx.stroke();
        // Barrel (darker metal)
        ctx.strokeStyle = '#707060';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.6);
        ctx.lineTo(0, -r * 1.4);
        ctx.stroke();
        // Muzzle flash
        if (this._muzzleFlash > 0) {
            ctx.save();
            ctx.translate(0, -r * 1.4);
            ctx.globalAlpha = this._muzzleFlash / 0.12;
            const fgrad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.6);
            fgrad.addColorStop(0, '#ffffaa');
            fgrad.addColorStop(0.4, '#ffaa00');
            fgrad.addColorStop(1, 'transparent');
            ctx.fillStyle = fgrad;
            ctx.beginPath();
            ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.restore();
        }
        ctx.restore();

        this._drawHealthBar(ctx);
        ctx.restore();
    }
}

// ── Group separation helper ────────────────────────────────
function applyGroupSeparation(enemies) {
    const spacing = C.AI.GROUP_SPACING;
    for (let i = 0; i < enemies.length; i++) {
        const a = enemies[i];
        if (!a.alive) continue;
        for (let j = i + 1; j < enemies.length; j++) {
            const b = enemies[j];
            if (!b.alive) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.hypot(dx, dy);
            const min = a.radius + b.radius + spacing;
            if (d < min && d > 0.01) {
                const push = (min - d) * 0.3;
                const nx = dx / d;
                const ny = dy / d;
                a.x -= nx * push;
                a.y -= ny * push;
                b.x += nx * push;
                b.y += ny * push;
            }
        }
    }
}
