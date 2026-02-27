// ============================================================
//  PLAYER — Perspective-aware controller, rendering with 3D depth
// ============================================================

class InputManager {
    constructor() {
        this.keys = new Set();
        this.mouse = { x: 0, y: 0, left: false };
        this._bind();
    }
    _bind() {
        window.addEventListener('keydown', e => {
            this.keys.add(e.code);
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
                e.preventDefault();
        });
        window.addEventListener('keyup', e => this.keys.delete(e.code));
        window.addEventListener('mousedown', e => { if (e.button === 0) this.mouse.left = true; });
        window.addEventListener('mouseup', e => { if (e.button === 0) this.mouse.left = false; });
        window.addEventListener('mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    }
    isDown(codes) { for (const c of codes) if (this.keys.has(c)) return true; return false; }
    consume(codes) { for (const c of codes) this.keys.delete(c); }
}

class Player {
    constructor(x, y, input, combat) {
        this.x = x; this.y = y;
        this.input = input;
        this.combat = combat;

        // Stats
        this.hp = C.PLAYER.HP_MAX;
        this.hpMax = C.PLAYER.HP_MAX;
        this.stamina = C.PLAYER.STAMINA_MAX;
        this.radius = C.PLAYER.RADIUS;
        this.elevation = 0;  // visual z, set from terrain each frame

        // Movement
        this.vx = 0; this.vy = 0;
        this.facing = 0;
        this.isSprinting = false;
        this.speedMult = 1.0;

        // Dodge
        this.isDodging = false;
        this.dodgeTimer = 0;
        this.dodgeCD = 0;
        this.dodgeDirX = 0;
        this.dodgeDirY = 0;

        // Combat
        this.isAttacking = false;
        this.attackTimer = 0;
        this.attackCD = 0;
        this.heavyCD = 0;
        this.comboCount = 0;
        this.comboTimer = 0;
        this.invincible = 0;
        this.hitStun = 0;
        this.knockbackX = 0;
        this.knockbackY = 0;
        this._attackExecuted = false;
        this.isHeavy = false;

        this.alive = true;
        this.deathTimer = 0;

        // Visual
        this.walkCycle = 0;
        this.attackAnim = 0;

        // Stats
        this.kills = 0; this.damageDealt = 0; this.damageTaken = 0;
    }

    // ── Update ─────────────────────────────────────────────────
    update(dt, map) {
        if (!this.alive) { this.deathTimer += dt; return; }
        this._updateTimers(dt);
        this._handleInput(dt, map);
        this._applyKnockback(dt);
        map.resolveCollision(this);
        this.speedMult = map.getSpeedMult(this.x, this.y);
        this.elevation = map.getElevationAt(this.x, this.y);
    }

    _updateTimers(dt) {
        if (this.attackCD > 0) this.attackCD -= dt;
        if (this.heavyCD > 0) this.heavyCD -= dt;
        if (this.dodgeCD > 0) this.dodgeCD -= dt;
        if (this.invincible > 0) this.invincible -= dt;
        if (this.hitStun > 0) this.hitStun -= dt;
        if (this.attackTimer > 0) {
            this.attackTimer -= dt;
            if (this.attackTimer <= 0) { this.isAttacking = false; }
        }
        if (this.comboTimer > 0) {
            this.comboTimer -= dt;
            if (this.comboTimer <= 0) this.comboCount = 0;
        }
        if (this.isDodging) {
            this.dodgeTimer -= dt;
            if (this.dodgeTimer <= 0) { this.isDodging = false; this.invincible = 0.1; }
        }
        if (!this.isSprinting && !this.isDodging)
            this.stamina = Math.min(this.stamina + C.PLAYER.STAMINA_REGEN * dt, C.PLAYER.STAMINA_MAX);
    }

    _handleInput(dt, map) {
        if (this.hitStun > 0) return;
        const input = this.input;
        const wantsAttack = input.isDown(KEYS.ATTACK) || input.mouse.left;
        const wantsHeavy = input.isDown(KEYS.HEAVY);
        const wantsDodge = input.isDown(KEYS.DODGE);
        input.consume(KEYS.DODGE);

        let mx = 0, my = 0;
        if (input.isDown(KEYS.MOVE_LEFT)) mx -= 1;
        if (input.isDown(KEYS.MOVE_RIGHT)) mx += 1;
        if (input.isDown(KEYS.MOVE_UP)) my -= 1;
        if (input.isDown(KEYS.MOVE_DOWN)) my += 1;
        const len = Math.hypot(mx, my);
        if (len > 0) { mx /= len; my /= len; }

        this.isSprinting = input.isDown(KEYS.SPRINT) && len > 0 && this.stamina > 2;
        if (this.isSprinting) this.stamina -= C.PLAYER.STAMINA_SPRINT * dt;

        if (wantsDodge && this.dodgeCD <= 0 && !this.isDodging && this.stamina >= C.PLAYER.STAMINA_DODGE)
            this._startDodge(mx || Math.cos(this.facing), my || Math.sin(this.facing));

        if (!this.isDodging) {
            let speed = C.PLAYER.SPEED * this.speedMult;
            if (this.isSprinting) speed *= C.PLAYER.SPRINT_MULT;
            this.vx = mx * speed;
            this.vy = my * speed;
            if (len > 0) {
                this.facing = Math.atan2(my, mx);
                this.walkCycle += dt * (this.isSprinting ? 10 : 7);
            } else {
                this.walkCycle *= 0.85;
            }
        } else {
            const dodgeSpeed = C.PLAYER.DODGE_DIST / C.PLAYER.DODGE_DUR;
            this.vx = this.dodgeDirX * dodgeSpeed;
            this.vy = this.dodgeDirY * dodgeSpeed;
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        if (this.isSprinting && Math.random() < 0.3)
            this.combat.spawnDustParticle(this.x, this.y + this.radius * 0.5, this.elevation);

        if (wantsHeavy && this.heavyCD <= 0 && !this.isAttacking) this._startAttack(true);
        else if (wantsAttack && this.attackCD <= 0 && !this.isAttacking) this._startAttack(false);
    }

    _startDodge(dx, dy) {
        const len = Math.hypot(dx, dy) || 1;
        this.dodgeDirX = dx / len; this.dodgeDirY = dy / len;
        this.isDodging = true;
        this.dodgeTimer = C.PLAYER.DODGE_DUR;
        this.dodgeCD = C.PLAYER.DODGE_CD;
        this.stamina -= C.PLAYER.STAMINA_DODGE;
        this.invincible = C.PLAYER.DODGE_DUR + 0.05;
    }

    _startAttack(isHeavy) {
        this._attackExecuted = false;
        this.isAttacking = true;
        this.isHeavy = isHeavy;
        this.attackAnim = 1.0;
        if (isHeavy) {
            this.attackTimer = 0.3; this.heavyCD = C.COMBAT.HEAVY_CD;
        } else {
            this.attackTimer = 0.2; this.attackCD = C.COMBAT.ATTACK_CD;
            this.comboTimer = C.COMBAT.COMBO_WINDOW;
            this.comboCount = (this.comboCount + 1) % 3;
        }
    }

    executeAttack(targets) {
        if (!this.isAttacking || this.attackTimer < (this.isHeavy ? 0.2 : 0.12)) return [];
        if (this._attackExecuted) return [];
        this._attackExecuted = true;
        const combo = C.COMBAT.COMBO_MULT[this.comboCount] || 1;
        const config = {
            range: this.isHeavy ? C.COMBAT.HEAVY_RANGE : C.COMBAT.ATTACK_RANGE,
            damage: Math.round((this.isHeavy ? C.COMBAT.HEAVY_DAMAGE : C.COMBAT.ATTACK_DAMAGE) * combo),
            knockback: C.COMBAT.KNOCKBACK,
            type: this.isHeavy ? 'heavy' : 'normal',
        };
        const hits = this.combat.performAttack(this, targets, config);
        this.damageDealt += hits.length * config.damage;
        return hits;
    }

    _applyKnockback(dt) {
        if (Math.abs(this.knockbackX) < 1 && Math.abs(this.knockbackY) < 1) return;
        this.x += this.knockbackX * dt;
        this.y += this.knockbackY * dt;
        this.knockbackX *= 0.75; this.knockbackY *= 0.75;
    }

    receiveDamage(amount, opts = {}) {
        if (!this.alive || this.invincible > 0 || this.isDodging) return;
        this.hp = Math.max(0, this.hp - amount);
        this.damageTaken += amount;
        this.hitStun = C.COMBAT.HIT_STUN;
        this.invincible = C.COMBAT.IFRAMES;
        this.knockbackX = opts.knockbackX || 0;
        this.knockbackY = opts.knockbackY || 0;
        UI.flashHit();
        if (this.hp <= 0) {
            this.alive = false;
            this.combat.spawnDeathEffect(this.x, this.y, this.elevation);
        }
    }

    // ── Draw (pseudo-3D perspective) ───────────────────────────
    draw(ctx, cam) {
        const elev = this.elevation || 0;
        const proj = cam.project(this.x, this.y, elev);
        const pGnd = cam.project(this.x, this.y, 0);   // ground projection
        const scale = cam.perspScale(proj.y);            // perspective size
        const r = this.radius * scale;

        if (!cam.isVisible(this.x, this.y, r * 3)) return;

        ctx.save();

        // ── Soft ground shadow ──────────────────────────────────
        drawEntityShadow(ctx, cam, this.x, this.y, r * 0.95, 0);

        ctx.translate(proj.x, proj.y);

        // Death anim
        if (!this.alive) {
            ctx.globalAlpha = Math.max(0, 1 - this.deathTimer * 1.5);
            ctx.rotate(Math.PI / 2 * Math.min(1, this.deathTimer * 2));
        }

        // Dodge glow
        if (this.isDodging) {
            ctx.shadowColor = 'rgba(255,220,100,0.95)';
            ctx.shadowBlur = 20;
        }

        // iFrame flicker
        if (this.invincible > 0 && !this.isDodging && Math.floor(this.invincible * 12) % 2 === 0)
            ctx.globalAlpha *= 0.4;

        // ── Body drawn in perspective-squished space ─────────────
        // Rotate toward facing, then squish Y by TILT to simulate looking down
        ctx.rotate(this.facing + Math.PI / 2);
        ctx.scale(scale, scale * C.CAMERA.TILT);

        const legSwing = Math.sin(this.walkCycle) * 5;
        const baseR = this.radius; // un-scaled, we applied scale via ctx.scale

        // Legs
        ctx.fillStyle = '#2a1a08';
        ctx.beginPath(); ctx.ellipse(-baseR * 0.28, baseR * 0.5 + legSwing, baseR * 0.22, baseR * 0.38, 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(baseR * 0.28, baseR * 0.5 - legSwing, baseR * 0.22, baseR * 0.38, -0.15, 0, Math.PI * 2); ctx.fill();

        // Cape with movement flap
        const capeFlap = Math.sin(this.walkCycle * 0.7) * 0.12;
        ctx.beginPath();
        ctx.moveTo(-baseR * 0.3, -baseR * 0.1);
        ctx.quadraticCurveTo(-baseR * 0.7 - capeFlap * baseR, baseR * 0.3, -baseR * 0.25, baseR * 0.7);
        ctx.quadraticCurveTo(baseR * 0.25, baseR * 0.5, baseR * 0.15, -baseR * 0.15);
        ctx.closePath();
        ctx.fillStyle = C.COLOR.PLAYER_CAPE;
        ctx.fill();

        // Torso with light shading (lit from top-left)
        const bodyGrad = ctx.createLinearGradient(-baseR * 0.5, -baseR * 0.65, baseR * 0.5, baseR * 0.65);
        bodyGrad.addColorStop(0, '#2a1008');
        bodyGrad.addColorStop(0.4, '#1a0a00');
        bodyGrad.addColorStop(1, '#0a0500');
        ctx.beginPath();
        ctx.ellipse(0, 0, baseR * 0.5, baseR * 0.65, 0, 0, Math.PI * 2);
        ctx.fillStyle = bodyGrad;
        ctx.fill();
        ctx.strokeStyle = '#ffe090';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Shield (left arm) — Ethiopian round shield
        ctx.save();
        ctx.translate(-baseR * 0.65, 0);
        ctx.beginPath();
        ctx.ellipse(0, 0, baseR * 0.4, baseR * 0.52, -0.2, 0, Math.PI * 2);
        // Shield gradient — lit top-left
        const shGrad = ctx.createRadialGradient(-baseR * 0.12, -baseR * 0.15, 0, 0, 0, baseR * 0.45);
        shGrad.addColorStop(0, '#e0a040');
        shGrad.addColorStop(0.6, C.COLOR.PLAYER_SHIELD);
        shGrad.addColorStop(1, '#6a3808');
        ctx.fillStyle = shGrad;
        ctx.fill();
        ctx.strokeStyle = '#8b5010';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.strokeStyle = '#8b5010';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -baseR * 0.35); ctx.lineTo(0, baseR * 0.35);
        ctx.moveTo(-baseR * 0.25, 0); ctx.lineTo(baseR * 0.25, 0);
        ctx.stroke();
        ctx.restore();

        // Shotel blade (right arm)
        ctx.save();
        ctx.translate(baseR * 0.5, 0);
        if (this.isAttacking) {
            const swing = this.isHeavy
                ? (1 - this.attackTimer / 0.3) * Math.PI * 1.2
                : (1 - this.attackTimer / 0.2) * Math.PI * 0.9;
            ctx.rotate(swing - Math.PI * 0.3);
        }
        // Blade gradient (lit shimmer)
        ctx.strokeStyle = C.COLOR.PLAYER_SWORD;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(200,200,160,0.4)';
        ctx.shadowBlur = this.isAttacking ? 8 : 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(baseR * 0.3, -baseR * 0.4, baseR * 0.6, -baseR * 0.8, baseR * 0.2, -baseR * 1.2);
        ctx.stroke();
        ctx.strokeStyle = '#8b6020';
        ctx.lineWidth = 3; ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(-baseR * 0.1, 0); ctx.lineTo(baseR * 0.2, 0);
        ctx.stroke();
        ctx.restore();

        // Head & wrap
        ctx.beginPath();
        ctx.arc(0, -baseR * 0.75, baseR * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = '#1a0a00'; ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -baseR * 0.9, baseR * 0.28, Math.PI, 0);
        ctx.fillStyle = '#ffe080'; ctx.fill();
        // Eye
        ctx.fillStyle = 'rgba(255,240,200,0.9)';
        ctx.beginPath();
        ctx.arc(baseR * 0.1, -baseR * 0.75, 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.restore();

        // Attack arc (drawn in world-projected space, not local)
        if (this.isAttacking)
            this.combat.drawAttackArc(ctx, cam, this,
                this.isHeavy ? C.COMBAT.HEAVY_RANGE : C.COMBAT.ATTACK_RANGE,
                this.isHeavy);
    }

    // Sort key for painter's algorithm
    sortKey() { return this.y + (this.elevation || 0) * 0.5; }

    getStats() { return { kills: this.kills, damageDealt: this.damageDealt, damageTaken: this.damageTaken }; }
}
