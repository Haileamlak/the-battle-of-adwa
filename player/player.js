// ============================================================
//  PLAYER — Procedural Animated Character (Side-Scrolling)
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
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
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

        this.hp = C.PLAYER.HP_MAX;
        this.hpMax = C.PLAYER.HP_MAX;
        this.stamina = C.PLAYER.STAMINA_MAX;
        this.radius = C.PLAYER.RADIUS;

        this.vx = 0; this.vy = 0;
        this._prevY = y;
        this.grounded = false;
        this.jumpsLeft = 2;
        this.coyoteTimer = 0;

        this.facingDir = 1;

        this.isSprinting = false;
        this.isDodging = false;
        this.dodgeTimer = 0;
        this.dodgeCD = 0;

        this.isAttacking = false;
        this.attackTimer = 0;
        this.attackCD = 0;
        this.heavyCD = 0;
        this.isHeavy = false;
        this.comboCount = 0;
        this.comboTimer = 0;

        this.invincible = 0;
        this.hitStun = 0;
        this.knockbackX = 0;
        this.knockbackY = 0;

        // Animation Properties
        this.walkCycle = 0;
        this.tilt = 0;
        this.squash = 1;
        this.stretch = 1;
        this.bob = 0;

        this.alive = true;
        this.deathTimer = 0;
        this.kills = 0; this.damageDealt = 0; this.damageTaken = 0;
    }

    update(dt, map) {
        if (!this.alive) { this.deathTimer += dt; return; }
        this._prevY = this.y;
        this._updateTimers(dt);
        this._handleInput(dt);
        this._applyPhysics(dt);
        if (map) map.resolveCollision(this);
        this._updateAnimations(dt);
    }

    _updateTimers(dt) {
        if (this.attackCD > 0) this.attackCD -= dt;
        if (this.heavyCD > 0) this.heavyCD -= dt;
        if (this.dodgeCD > 0) this.dodgeCD -= dt;
        if (this.invincible > 0) this.invincible -= dt;
        if (this.hitStun > 0) this.hitStun -= dt;
        if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.comboCount = 0; }
        if (this.coyoteTimer > 0) this.coyoteTimer -= dt;
        if (this.isDodging) {
            this.dodgeTimer -= dt;
            if (this.dodgeTimer <= 0) this.isDodging = false;
        }
        if (this.attackTimer > 0) {
            this.attackTimer -= dt;
            if (this.attackTimer <= 0) this.isAttacking = false;
        }
    }

    _handleInput(dt) {
        if (this.hitStun > 0) return;
        const inp = this.input;
        const goLeft = inp.isDown(KEYS.MOVE_LEFT);
        const goRight = inp.isDown(KEYS.MOVE_RIGHT);
        const wantsJump = inp.isDown(KEYS.JUMP);
        const wantsDodge = inp.isDown(KEYS.DODGE);
        const wantsHeavy = inp.isDown(KEYS.HEAVY);
        const wantsAttack = inp.isDown(KEYS.ATTACK) || inp.mouse.left;

        inp.consume(KEYS.JUMP); inp.consume(KEYS.DODGE);

        this.isSprinting = inp.isDown(KEYS.SPRINT) && (goLeft || goRight) && this.stamina > 5;
        if (this.isSprinting) this.stamina -= C.PLAYER.STAMINA_SPRINT * dt;
        else this.stamina = Math.min(C.PLAYER.STAMINA_MAX, this.stamina + C.PLAYER.STAMINA_REGEN * dt);

        if (!this.isDodging) {
            let speed = C.PLAYER.SPEED * (this.isSprinting ? C.PLAYER.SPRINT_MULT : 1);
            if (goLeft) { this.vx = -speed; this.facingDir = -1; }
            else if (goRight) { this.vx = speed; this.facingDir = 1; }
            else { this.vx *= 0.82; }
        }

        if (wantsJump) {
            if (this.grounded || this.coyoteTimer > 0) {
                this.vy = -C.PLAYER.JUMP_FORCE;
                this.grounded = false; this.coyoteTimer = 0;
                this.jumpsLeft = 1;
            } else if (this.jumpsLeft > 0) {
                this.vy = -C.PLAYER.DBL_JUMP;
                this.jumpsLeft = 0;
                this.stretch = 1.15;
            }
        }

        if (wantsDodge && this.dodgeCD <= 0 && this.stamina >= C.PLAYER.STAMINA_DODGE) {
            this.isDodging = true;
            this.dodgeTimer = C.PLAYER.DODGE_DUR;
            this.dodgeCD = C.PLAYER.DODGE_CD;
            this.stamina -= C.PLAYER.STAMINA_DODGE;
            this.invincible = C.PLAYER.DODGE_DUR + 0.1;
            this.vx = this.facingDir * C.PLAYER.DODGE_DIST * 4;
        }

        if (wantsHeavy && this.heavyCD <= 0 && !this.isAttacking) this._startAttack(true);
        else if (wantsAttack && this.attackCD <= 0 && !this.isAttacking) this._startAttack(false);
    }

    _startAttack(isHeavy) {
        this.isAttacking = true;
        this.isHeavy = isHeavy;
        this.attackTimer = isHeavy ? C.COMBAT.HEAVY_DUR : C.COMBAT.ATTACK_DUR;
        this.attackCD = isHeavy ? 0 : C.COMBAT.ATTACK_CD;
        this.heavyCD = isHeavy ? C.COMBAT.HEAVY_CD : 0;
        this.comboCount = (this.comboCount + 1) % 3;
        this.comboTimer = C.COMBAT.COMBO_WINDOW;
        this.tilt = this.facingDir * 0.45;

        const speedScale = isHeavy ? 1.8 : 1.0;
        this.combat.fireProjectile(this, this.x + this.facingDir * 500, this.y - 20, Math.round((isHeavy ? C.COMBAT.HEAVY_DAMAGE : C.COMBAT.ATTACK_DAMAGE) * 0.8), 6, 'arrow', speedScale);
    }

    executeAttack(targets) {
        if (!this.isAttacking || this.attackTimer > (this.isHeavy ? 0.1 : 0.08)) return [];
        const combo = C.COMBAT.COMBO_MULT[this.comboCount] || 1;
        const config = {
            range: this.isHeavy ? C.COMBAT.HEAVY_RANGE : C.COMBAT.ATTACK_RANGE,
            damage: Math.round((this.isHeavy ? C.COMBAT.HEAVY_DAMAGE : C.COMBAT.ATTACK_DAMAGE) * combo),
            type: this.isHeavy ? 'heavy' : 'normal',
        };
        const hits = this.combat.performAttack(this, targets, config);
        if (hits.length > 0) this.damageDealt += hits.length * config.damage;
        return hits;
    }

    _applyPhysics(dt) {
        this.vy = Math.min(this.vy + C.GRAVITY * dt, C.TERMINAL_V);
        this.x += (this.vx + this.knockbackX) * dt;
        this.y += (this.vy + this.knockbackY) * dt;
        this.knockbackX *= 0.85; this.knockbackY *= 0.85;
    }

    _updateAnimations(dt) {
        // Grounding squish
        if (this.grounded) {
            this.stretch = Math.max(1, this.stretch - dt * 15);
            this.squash = Math.max(1, this.squash - dt * 15);
        } else {
            this.stretch = 1.05 + Math.abs(this.vy / 3000);
            this.squash = 0.95;
        }

        // Tilt and Bob
        if (this.vx !== 0 && this.grounded) {
            this.walkCycle += dt * (this.isSprinting ? 18 : 12);
            this.bob = Math.sin(this.walkCycle) * 6;
            this.tilt = Math.sin(this.walkCycle * 0.5) * 0.12;
        } else {
            this.walkCycle = 0;
            this.bob = Math.sin(Date.now() / 300) * 2.5; // Idle breathing
            this.tilt *= 0.85;
        }

        if (this.isAttacking) {
            this.tilt = this.facingDir * 0.45 * (this.attackTimer / 0.3);
        }
    }

    draw(ctx, cam) {
        const p = cam.project(this.x, this.y);
        const sx = p.x, sy = p.y, r = this.radius;

        ctx.save();

        // Shadow
        drawEntityShadow(ctx, cam, this);

        ctx.translate(sx, sy + this.bob);

        if (this.invincible > 0 && Math.floor(Date.now() / 50) % 2 === 0) ctx.globalAlpha = 0.4;
        if (!this.alive) {
            ctx.globalAlpha = Math.max(0, 1 - this.deathTimer);
            ctx.rotate(Math.PI / 2);
        }

        ctx.scale(this.facingDir, 1);
        ctx.rotate(this.tilt);
        ctx.scale(this.squash, this.stretch);

        // Apply Modular Look
        const img = window._assets?.player_move;
        if (img && img.complete && img.naturalWidth > 0) {
            const aspect = img.naturalWidth / img.naturalHeight;
            const h = r * 12.0, w = h * aspect;
            ctx.drawImage(img, -w / 2, -h * 0.85, w, h);
        } else {
            // Fallback placeholder
            ctx.fillStyle = C.COLOR.PLAYER_BODY;
            ctx.fillRect(-r * 0.6, -r * 1.8, r * 1.2, r * 2.2);
            ctx.fillStyle = C.COLOR.PLAYER_CAPE;
            ctx.fillRect(-r * 0.7, -r * 1.5, r * 0.4, r * 1.2);
        }

        ctx.restore();
        if (this.isAttacking) this.combat.drawAttackArc(ctx, cam, this, this.isHeavy ? C.COMBAT.HEAVY_RANGE : C.COMBAT.ATTACK_RANGE, this.isHeavy);
    }

    receiveDamage(amount, opts) {
        if (!this.alive || this.invincible > 0 || this.isDodging) return;
        this.hp = Math.max(0, this.hp - amount);
        this.hitStun = C.COMBAT.HIT_STUN;
        this.invincible = C.COMBAT.IFRAMES;
        this.knockbackX = opts.knockbackX || 0;
        this.knockbackY = opts.knockbackY || -120;
        UI.flashHit();
        if (this.hp <= 0) { this.alive = false; this.combat.spawnDeathEffect(this.x, this.y); }
    }

    sortKey() { return this.y; }
}
