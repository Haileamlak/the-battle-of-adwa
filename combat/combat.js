// ============================================================
//  COMBAT — Side-view hitboxes, projectiles, particles, effects
// ============================================================

class Particle {
    constructor(x, y, vx, vy, life, color, size) {
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.life = life; this.maxLife = life;
        this.color = color; this.size = size;
        this.active = true;
    }
    update(dt) {
        this.vy += C.GRAVITY * 0.35 * dt;
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.vx *= 0.92; this.life -= dt;
        if (this.life <= 0) this.active = false;
    }
    draw(ctx, cam) {
        const p = cam.project(this.x, this.y);
        const a = Math.max(0, this.life / this.maxLife);
        ctx.globalAlpha = a;
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, this.size * a), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
    }
}

class FloatingText {
    constructor(x, y, text, color = '#ffe060', size = 18) {
        this.x = x; this.y = y; this.text = text; this.color = color; this.size = size;
        this.vy = -75; this.life = 1.05; this.maxLife = 1.05; this.active = true;
    }
    update(dt) { this.y += this.vy * dt; this.vy *= 0.92; this.life -= dt; if (this.life <= 0) this.active = false; }
    draw(ctx, cam) {
        const p = cam.project(this.x, this.y);
        const a = Math.max(0, this.life / this.maxLife);
        ctx.globalAlpha = a;
        ctx.font = `bold ${this.size}px Cinzel, serif`;
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
        ctx.strokeText(this.text, p.x, p.y);
        ctx.fillStyle = this.color; ctx.fillText(this.text, p.x, p.y);
        ctx.globalAlpha = 1;
    }
}

// ── Projectile (bullet / cannonball) ─────────────────────────
class Projectile {
    constructor(firer, x, y, vx, vy, damage, size = 5, type = 'bullet') {
        this.firer = firer;
        this.x = x; this.y = y; this.vx = vx; this.vy = vy;
        this.damage = damage; this.size = size;
        this.type = type;
        this.life = C.COMBAT.PROJ_LIFE;
        this.active = true;
    }
    update(dt, platforms) {
        this.vy += C.COMBAT.PROJ_GRAVITY * dt;  // slight arc
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.life -= dt; if (this.life <= 0) { this.active = false; return; }
        // Hit platform
        for (const p of platforms) {
            if (this.x > p.left && this.x < p.right && this.y > p.top && this.y < p.bottom) {
                this.active = false; return;
            }
        }
    }
    draw(ctx, cam) {
        if (!this.active) return;
        const p = cam.project(this.x, this.y);
        const angle = Math.atan2(this.vy, this.vx);
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(angle);

        if (this.type === 'arrow') {
            // Draw a spear (270px total: 90% of old 300px)
            ctx.strokeStyle = '#5a3e1a'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(-135, 0); ctx.lineTo(135, 0); ctx.stroke();
            // Spear head
            ctx.fillStyle = '#e0e0e0';
            ctx.beginPath(); ctx.moveTo(135, 0); ctx.lineTo(110, -10); ctx.lineTo(110, 10); ctx.fill();
            // Glow/Trailing effect
            ctx.shadowColor = '#d4a017'; ctx.shadowBlur = 6;
        } else {
            const grd = ctx.createRadialGradient(0, 0, 0, this.size * 0.5, 0, this.size * 2.2);
            grd.addColorStop(0, '#ffffcc'); grd.addColorStop(0.4, '#ffaa30'); grd.addColorStop(1, 'transparent');
            ctx.fillStyle = grd;
            ctx.beginPath(); ctx.ellipse(0, 0, this.size * 2.2, this.size * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
}

// ── CombatSystem ─────────────────────────────────────────────
class CombatSystem {
    constructor() {
        this.particles = [];
        this.floatTexts = [];
        this.projectiles = [];
    }

    // ── Melee (side-view horizontal hitbox) ───────────────────
    performAttack(attacker, targets, config) {
        const hits = [];
        const dir = attacker.facingDir || 1;
        const range = config.range || C.COMBAT.ATTACK_RANGE;
        const dmg = config.damage || C.COMBAT.ATTACK_DAMAGE;
        const kbx = config.type === 'heavy' ? C.COMBAT.HEAVY_KBX : C.COMBAT.KNOCKBACK_X;
        const kby = config.type === 'heavy' ? C.COMBAT.HEAVY_KBY : C.COMBAT.KNOCKBACK_Y;

        for (const target of targets) {
            if (!target.alive) continue;
            if (target.invincible > 0) continue;
            const dx = target.x - attacker.x;
            const dy = target.y - attacker.y;
            // Must be in facing direction
            if (dx * dir < -target.radius) continue;
            // Horizontal range
            if (Math.abs(dx) > range + target.radius) continue;
            // Vertical range (body height)
            if (Math.abs(dy) > attacker.radius * 2 + target.radius * 2) continue;

            target.receiveDamage(dmg, {
                knockbackX: (dx >= 0 ? 1 : -1) * kbx,
                knockbackY: kby,
                type: config.type || 'normal',
            });
            hits.push(target);
            this._spawnHitEffect(target.x, target.y, config.type);
            this.floatTexts.push(new FloatingText(
                target.x, target.y - target.radius,
                `-${dmg}`,
                config.type === 'heavy' ? '#ff8020' : '#ffe060',
                config.type === 'heavy' ? 22 : 16,
            ));
        }
        return hits;
    }

    // ── Ranged (fires Projectile) ──────────────────────────────
    fireProjectile(attacker, targetX, targetY, damage, size = 5, type = 'bullet', speedScale = 1) {
        const dx = targetX - attacker.x;
        const dy = targetY - attacker.y;
        const d = Math.hypot(dx, dy) || 1;
        const spd = (type === 'arrow' ? C.COMBAT.PROJ_SPEED * 1.5 : C.COMBAT.PROJ_SPEED) * speedScale;

        // Spawn from chest position (attacker.y is at the feet)
        const spawnX = attacker.x + (attacker.facingDir * (attacker.radius + 15));
        const spawnY = attacker.y - 95;

        this.projectiles.push(
            new Projectile(attacker, spawnX, spawnY, (dx / d) * spd, (dy / d) * spd - 10, damage, size, type)
        );
    }

    updateProjectiles(dt, platforms, entities) {
        for (const proj of this.projectiles) {
            proj.update(dt, platforms);
            if (!proj.active) continue;

            for (const target of entities) {
                if (!target || !target.alive || target === proj.firer) continue;

                // For long arrows, check hit at multiple points along the shaft (135px is the tip)
                const checkPoints = proj.type === 'arrow' ? [135, 90, 45, 0] : [0];
                let isHit = false;

                const angle = Math.atan2(proj.vy, proj.vx);
                const cos = Math.cos(angle), sin = Math.sin(angle);

                for (const offset of checkPoints) {
                    const px = proj.x + cos * offset;
                    const py = proj.y + sin * offset;
                    const dx = target.x - px, dy = (target.y - target.radius) - py;
                    if (Math.hypot(dx, dy) < target.radius + proj.size + 15) {
                        isHit = true; break;
                    }
                }

                if (isHit) {
                    target.receiveDamage(proj.damage, {
                        knockbackX: proj.vx > 0 ? C.COMBAT.KNOCKBACK_X * 0.5 : -C.COMBAT.KNOCKBACK_X * 0.5,
                        knockbackY: -80,
                        type: 'ranged',
                    });
                    this._spawnHitEffect(target.x, target.y, 'ranged');
                    this.floatTexts.push(new FloatingText(target.x, target.y - target.radius, `-${proj.damage}`, '#ff6060', 15));
                    proj.active = false;
                    break;
                }
            }
        }
        this.projectiles = this.projectiles.filter(p => p.active);
    }

    // ── Effects ───────────────────────────────────────────────
    _spawnHitEffect(x, y, type) {
        const n = C.PARTICLE.HIT_COUNT + (type === 'heavy' ? 10 : (type === 'ranged' ? 8 : 0));
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = (type === 'ranged' ? 120 : 70) + Math.random() * 130;
            this.particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s - 60,
                C.PARTICLE.LIFE_MIN + Math.random() * (C.PARTICLE.LIFE_MAX - C.PARTICLE.LIFE_MIN),
                type === 'heavy' || type === 'ranged' ? '#ff8020' : C.COLOR.HIT_SPARK,
                type === 'heavy' ? 5 : (type === 'ranged' ? 4 : 3)));
        }
        for (let i = 0; i < 3; i++) {
            const a = Math.random() * Math.PI; // downward arc for blood
            this.particles.push(new Particle(x, y, Math.cos(a) * 45, Math.sin(a) * 55,
                0.4 + Math.random() * 0.4, C.COLOR.BLOOD, 2));
        }
    }

    spawnDustParticle(x, y) {
        for (let i = 0; i < C.PARTICLE.DUST_COUNT; i++) {
            const a = Math.PI + Math.random() * Math.PI; // upward spread
            this.particles.push(new Particle(x, y, Math.cos(a) * 35, Math.sin(a) * 35 - 20,
                0.2 + Math.random() * 0.3, '#c8a04a', 2.5));
        }
    }

    spawnDeathEffect(x, y) {
        for (let i = 0; i < 18; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = 60 + Math.random() * 140;
            this.particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s - 80,
                0.4 + Math.random() * 0.6,
                i % 3 === 0 ? '#ffe060' : C.COLOR.BLOOD, 3));
        }
    }

    update(dt) {
        for (const p of this.particles) p.update(dt);
        for (const f of this.floatTexts) f.update(dt);
        this.particles = this.particles.filter(p => p.active);
        this.floatTexts = this.floatTexts.filter(f => f.active);
    }

    draw(ctx, cam) {
        ctx.save();
        for (const proj of this.projectiles) proj.draw(ctx, cam);
        for (const p of this.particles) p.draw(ctx, cam);
        for (const f of this.floatTexts) f.draw(ctx, cam);
        ctx.restore();
    }

    // Attack swing arc visual (side-view: arc in attack direction)
    drawAttackArc(ctx, cam, attacker, range, isHeavy) {
        if (!attacker.isAttacking) return;
        const prog = Math.max(0, attacker.attackTimer / (isHeavy ? C.COMBAT.HEAVY_DUR : C.COMBAT.ATTACK_DUR));
        const p = cam.project(attacker.x, attacker.y);
        const dir = attacker.facingDir;
        ctx.save();
        ctx.globalAlpha = prog * 0.4;
        const arcX = p.x + dir * attacker.radius;
        const arcGrd = ctx.createRadialGradient(arcX, p.y, 0, arcX, p.y, range);
        arcGrd.addColorStop(0, isHeavy ? 'rgba(255,120,0,0.8)' : 'rgba(255,220,0,0.7)');
        arcGrd.addColorStop(1, 'transparent');
        ctx.fillStyle = arcGrd;
        ctx.beginPath();
        ctx.arc(p.x, p.y, range,
            dir > 0 ? -Math.PI * 0.6 : Math.PI * 0.4,
            dir > 0 ? Math.PI * 0.6 : Math.PI * 1.6);
        ctx.fill();
        ctx.restore();
    }
}
