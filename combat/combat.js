// ============================================================
//  COMBAT — Hit detection, damage, combos, particles, effects
// ============================================================

// ── Particle ─────────────────────────────────────────────
class Particle {
    constructor(x, y, vx, vy, life, color, size) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.life = life;
        this.maxLife = life;
        this.color = color;
        this.size = size;
        this.active = true;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vy += 180 * dt; // gravity
        this.vx *= 0.94;
        this.life -= dt;
        if (this.life <= 0) this.active = false;
    }

    draw(ctx, cam) {
        const alpha = Math.max(0, this.life / this.maxLife);
        const sx = this.x - cam.x;
        const sy = this.y - cam.y;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(sx, sy, this.size * alpha + 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

// ── FloatingText ─────────────────────────────────────────
class FloatingText {
    constructor(x, y, text, color = '#ffe060', size = 18) {
        this.x = x; this.y = y;
        this.text = text;
        this.color = color;
        this.size = size;
        this.life = 1.1;
        this.maxLife = 1.1;
        this.vy = -60;
        this.active = true;
    }

    update(dt) {
        this.y += this.vy * dt;
        this.vy *= 0.92;
        this.life -= dt;
        if (this.life <= 0) this.active = false;
    }

    draw(ctx, cam) {
        const alpha = Math.max(0, this.life / this.maxLife);
        const sx = this.x - cam.x;
        const sy = this.y - cam.y;
        ctx.globalAlpha = alpha;
        ctx.font = `bold ${this.size}px Cinzel, serif`;
        ctx.fillStyle = this.color;
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 3;
        ctx.strokeText(this.text, sx, sy);
        ctx.fillText(this.text, sx, sy);
        ctx.globalAlpha = 1;
    }
}

// ── CombatSystem ─────────────────────────────────────────
class CombatSystem {
    constructor() {
        this.particles = [];
        this.floatTexts = [];
        this.attackFlashTimer = 0;
        this.attackFlashX = 0;
        this.attackFlashY = 0;
    }

    // ── Attack resolution ─────────────────────────────────
    /**
     * attacker: entity with { x, y, facing, radius }
     * targets:  array of entities with { x, y, radius, receiveDamage() }
     * config:   { range, damage, knockback, type: 'normal'|'heavy' }
     * Returns array of hit entities
     */
    performAttack(attacker, targets, config) {
        const hits = [];
        const aRange = config.range || C.COMBAT.ATTACK_RANGE;
        const dmg = config.damage || C.COMBAT.ATTACK_DAMAGE;
        const kb = config.knockback !== undefined ? config.knockback : C.COMBAT.KNOCKBACK;

        // Attack arc — 150° cone in front of attacker
        const arcHalf = (Math.PI * 5) / 6; // wider arc for melee feel
        const facingAngle = attacker.facing || 0;

        for (const target of targets) {
            if (!target.alive) continue;
            if (target.invincible && target.invincible > 0) continue;

            const dx = target.x - attacker.x;
            const dy = target.y - attacker.y;
            const dist = Math.hypot(dx, dy);
            if (dist > aRange + target.radius) continue;

            // Angle check
            const angleToTarget = Math.atan2(dy, dx);
            let angleDiff = angleToTarget - facingAngle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            if (Math.abs(angleDiff) > arcHalf) continue;

            // Hit!
            const result = target.receiveDamage(dmg, {
                knockbackX: (dx / (dist || 1)) * kb,
                knockbackY: (dy / (dist || 1)) * kb,
                type: config.type || 'normal',
            });
            hits.push(target);
            this._spawnHitEffect(target.x, target.y, config.type);
            this.floatTexts.push(new FloatingText(
                target.x, target.y - target.radius - 10,
                `-${dmg}`,
                config.type === 'heavy' ? '#ff8020' : '#ffe060',
                config.type === 'heavy' ? 22 : 16
            ));
        }
        return hits;
    }

    // ── Ranged hit (used by rifleman enemy) ───────────────
    performRangedAttack(attacker, target, damage) {
        if (!target || !target.alive) return false;
        if (target.invincible && target.invincible > 0) return false;
        const dx = target.x - attacker.x;
        const dy = target.y - attacker.y;
        const dist = Math.hypot(dx, dy);
        target.receiveDamage(damage, {
            knockbackX: (dx / (dist || 1)) * 30,
            knockbackY: (dy / (dist || 1)) * 30,
            type: 'ranged',
        });
        this._spawnHitEffect(target.x, target.y, 'ranged');
        this.floatTexts.push(new FloatingText(
            target.x, target.y - target.radius - 10,
            `-${damage}`,
            '#ff6060',
            16
        ));
        this._spawnBulletTrail(attacker.x, attacker.y, target.x, target.y);
        return true;
    }

    // ── Particles ──────────────────────────────────────────
    _spawnHitEffect(x, y, type) {
        const count = C.PARTICLE.HIT_COUNT;
        const isHeavy = type === 'heavy';
        for (let i = 0; i < count + (isHeavy ? 4 : 0); i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 80 + Math.random() * 140;
            this.particles.push(new Particle(
                x + (Math.random() - 0.5) * 10,
                y + (Math.random() - 0.5) * 10,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 60,
                0.15 + Math.random() * 0.35,
                isHeavy ? '#ff8020' : C.COLOR.HIT_SPARK,
                isHeavy ? 4 : 3
            ));
        }
        // Blood splatter
        for (let i = 0; i < 3; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 30 + Math.random() * 60;
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 20,
                0.4 + Math.random() * 0.4,
                C.COLOR.BLOOD,
                2
            ));
        }
    }

    _spawnBulletTrail(x1, y1, x2, y2) {
        const steps = 6;
        for (let i = 0; i < steps; i++) {
            const t = i / steps;
            this.particles.push(new Particle(
                x1 + (x2 - x1) * t + (Math.random() - 0.5) * 4,
                y1 + (y2 - y1) * t + (Math.random() - 0.5) * 4,
                0, 0,
                0.08 + Math.random() * 0.1,
                'rgba(255,200,50,0.8)',
                1.5
            ));
        }
    }

    spawnDustParticle(x, y) {
        for (let i = 0; i < C.PARTICLE.DUST_COUNT; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 20 + Math.random() * 40;
            this.particles.push(new Particle(
                x + (Math.random() - 0.5) * 8,
                y + (Math.random() - 0.5) * 8,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 30,
                0.2 + Math.random() * 0.3,
                '#b8903a',
                2
            ));
        }
    }

    spawnDeathEffect(x, y) {
        for (let i = 0; i < 14; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 50 + Math.random() * 120;
            this.particles.push(new Particle(
                x, y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 80,
                0.4 + Math.random() * 0.5,
                i % 3 === 0 ? '#ffe060' : C.COLOR.BLOOD,
                3
            ));
        }
    }

    // ── Update & Draw ──────────────────────────────────────
    update(dt) {
        this.attackFlashTimer = Math.max(0, this.attackFlashTimer - dt);
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

    // Draw attack arc for visual feedback
    drawAttackArc(ctx, cam, attacker, range, isHeavy) {
        if (!attacker || !attacker.isAttacking) return;
        const alpha = Math.max(0, attacker.attackTimer / (isHeavy ? 0.25 : 0.15));
        const sx = attacker.x - cam.x;
        const sy = attacker.y - cam.y;
        ctx.save();
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = isHeavy ? 'rgba(255,120,0,0.6)' : C.COLOR.ATTACK_RING;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.arc(sx, sy, range, attacker.facing - Math.PI * 5 / 6, attacker.facing + Math.PI * 5 / 6);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
    }
}
