// ============================================================
//  COMBAT — Hit detection, damage, combos, particles, effects
// ============================================================

// ── Particle (perspective-aware) ─────────────────────────────
class Particle {
    constructor(x, y, vx, vy, life, color, size, wz = 0) {
        this.x = x; this.y = y;
        this.wz = wz;   // world elevation at spawn — particles project from here
        this.vx = vx; this.vy = vy;
        this.vz = 40 + Math.random() * 60; // initial upward velocity in z
        this.life = life; this.maxLife = life;
        this.color = color; this.size = size;
        this.active = true;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.wz = Math.max(0, this.wz + this.vz * dt);
        this.vz -= 220 * dt;         // gravity in elevation space
        this.vx *= 0.93;
        this.life -= dt;
        if (this.life <= 0) this.active = false;
    }

    draw(ctx, cam) {
        const alpha = Math.max(0, this.life / this.maxLife);
        const p = cam.project(this.x, this.y, this.wz);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, this.size * alpha + 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

// ── Floating damage text ──────────────────────────────────────
class FloatingText {
    constructor(x, y, text, color = '#ffe060', size = 18, wz = 20) {
        this.x = x; this.y = y; this.wz = wz;
        this.text = text; this.color = color; this.size = size;
        this.life = 1.1; this.maxLife = 1.1;
        this.vy = -50; this.vzv = 60;
        this.active = true;
    }

    update(dt) {
        this.y += this.vy * dt;
        this.wz = Math.max(0, this.wz + this.vzv * dt);
        this.vzv -= 90 * dt;
        this.vy *= 0.93;
        this.life -= dt;
        if (this.life <= 0) this.active = false;
    }

    draw(ctx, cam) {
        const alpha = Math.max(0, this.life / this.maxLife);
        const p = cam.project(this.x, this.y, this.wz);
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${this.size}px Cinzel, serif`;
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 3;
        ctx.strokeText(this.text, p.x, p.y);
        ctx.fillStyle = this.color;
        ctx.fillText(this.text, p.x, p.y);
        ctx.globalAlpha = 1;
    }
}

// ── CombatSystem ─────────────────────────────────────────────
class CombatSystem {
    constructor() {
        this.particles = [];
        this.floatTexts = [];
    }

    // ── Attack resolution ─────────────────────────────────────
    performAttack(attacker, targets, config) {
        const hits = [];
        const aRange = config.range || C.COMBAT.ATTACK_RANGE;
        const dmg = config.damage || C.COMBAT.ATTACK_DAMAGE;
        const kb = (config.knockback !== undefined) ? config.knockback : C.COMBAT.KNOCKBACK;
        const arcHalf = Math.PI * 5 / 6;
        const facingAngle = attacker.facing || 0;

        for (const target of targets) {
            if (!target.alive) continue;
            if (target.invincible && target.invincible > 0) continue;
            const dx = target.x - attacker.x;
            const dy = target.y - attacker.y;
            const dist = Math.hypot(dx, dy);
            if (dist > aRange + target.radius) continue;
            let angleDiff = Math.atan2(dy, dx) - facingAngle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            if (Math.abs(angleDiff) > arcHalf) continue;

            target.receiveDamage(dmg, {
                knockbackX: (dx / (dist || 1)) * kb,
                knockbackY: (dy / (dist || 1)) * kb,
                type: config.type || 'normal',
            });
            hits.push(target);
            this._spawnHitEffect(target.x, target.y, config.type, target.elevation || 0);
            this.floatTexts.push(new FloatingText(
                target.x, target.y - target.radius,
                `-${dmg}`,
                config.type === 'heavy' ? '#ff8020' : '#ffe060',
                config.type === 'heavy' ? 22 : 16,
                (target.elevation || 0) + target.radius * 1.5,
            ));
        }
        return hits;
    }

    performRangedAttack(attacker, target, damage) {
        if (!target || !target.alive) return false;
        if (target.invincible && target.invincible > 0) return false;
        const dx = target.x - attacker.x, dy = target.y - attacker.y;
        const dist = Math.hypot(dx, dy);
        target.receiveDamage(damage, {
            knockbackX: (dx / (dist || 1)) * 30,
            knockbackY: (dy / (dist || 1)) * 30,
            type: 'ranged',
        });
        this._spawnHitEffect(target.x, target.y, 'ranged', target.elevation || 0);
        this.floatTexts.push(new FloatingText(
            target.x, target.y - target.radius,
            `-${damage}`,
            '#ff6060', 16,
            (target.elevation || 0) + target.radius,
        ));
        this._spawnBulletTrail(attacker, target);
        return true;
    }

    // ── Particles ─────────────────────────────────────────────
    _spawnHitEffect(x, y, type, elev = 0) {
        const count = C.PARTICLE.HIT_COUNT;
        const isHeavy = type === 'heavy';
        for (let i = 0; i < count + (isHeavy ? 5 : 0); i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 80 + Math.random() * 140;
            this.particles.push(new Particle(
                x + (Math.random() - 0.5) * 10,
                y + (Math.random() - 0.5) * 10,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                0.15 + Math.random() * 0.38,
                isHeavy ? '#ff8020' : C.COLOR.HIT_SPARK,
                isHeavy ? 4 : 3,
                elev + 2,
            ));
        }
        // Blood drops
        for (let i = 0; i < 3; i++) {
            const angle = Math.random() * Math.PI * 2;
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * (30 + Math.random() * 50),
                Math.sin(angle) * (30 + Math.random() * 50),
                0.4 + Math.random() * 0.45,
                C.COLOR.BLOOD, 2, elev,
            ));
        }
    }

    _spawnBulletTrail(attacker, target) {
        const steps = 7;
        for (let i = 0; i < steps; i++) {
            const t = i / steps;
            this.particles.push(new Particle(
                attacker.x + (target.x - attacker.x) * t + (Math.random() - 0.5) * 4,
                attacker.y + (target.y - attacker.y) * t + (Math.random() - 0.5) * 4,
                0, 0,
                0.07 + Math.random() * 0.1,
                'rgba(255,210,60,0.85)', 2, 8,
            ));
        }
    }

    spawnDustParticle(x, y, elev = 0) {
        for (let i = 0; i < C.PARTICLE.DUST_COUNT; i++) {
            const angle = Math.random() * Math.PI * 2;
            this.particles.push(new Particle(
                x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8,
                Math.cos(angle) * (20 + Math.random() * 40),
                Math.sin(angle) * (20 + Math.random() * 40),
                0.25 + Math.random() * 0.35,
                '#b8903a', 2, elev,
            ));
        }
    }

    spawnDeathEffect(x, y, elev = 0) {
        for (let i = 0; i < 16; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 50 + Math.random() * 120;
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                0.45 + Math.random() * 0.55,
                i % 3 === 0 ? '#ffe060' : C.COLOR.BLOOD,
                3, elev,
            ));
        }
    }

    // ── Update & Draw ─────────────────────────────────────────
    update(dt) {
        for (const p of this.particles) p.update(dt);
        for (const ft of this.floatTexts) ft.update(dt);
        this.particles = this.particles.filter(p => p.active);
        this.floatTexts = this.floatTexts.filter(ft => ft.active);
    }

    draw(ctx, cam) {
        ctx.save();
        for (const p of this.particles) p.draw(ctx, cam);
        for (const ft of this.floatTexts) ft.draw(ctx, cam);
        ctx.restore();
    }

    // ── Attack arc visual ──────────────────────────────────────
    drawAttackArc(ctx, cam, attacker, range, isHeavy) {
        if (!attacker || !attacker.isAttacking) return;
        const alpha = Math.max(0, attacker.attackTimer / (isHeavy ? 0.25 : 0.15));
        const elev = attacker.elevation || 0;
        const p = cam.project(attacker.x, attacker.y, elev + attacker.radius);
        const scale = cam.perspScale(p.y);
        ctx.save();
        ctx.globalAlpha = alpha * 0.45;
        ctx.fillStyle = isHeavy ? 'rgba(255,120,0,0.65)' : C.COLOR.ATTACK_RING;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        // Perspective-squish the arc slightly
        ctx.save();
        ctx.scale(scale, scale * C.CAMERA.TILT * 0.8);
        ctx.translate(p.x / scale - p.x, p.y / (scale * C.CAMERA.TILT * 0.8) - p.y);
        ctx.arc(p.x, p.y, range,
            attacker.facing - Math.PI * 5 / 6,
            attacker.facing + Math.PI * 5 / 6);
        ctx.restore();
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
    }
}
