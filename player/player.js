// ============================================================
//  PLAYER — Controller, movement, combat, rendering
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
            e.preventDefault && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && e.preventDefault();
        });
        window.addEventListener('keyup', e => this.keys.delete(e.code));
        window.addEventListener('mousedown', e => { if (e.button === 0) this.mouse.left = true; });
        window.addEventListener('mouseup', e => { if (e.button === 0) this.mouse.left = false; });
        window.addEventListener('mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    }

    isDown(codes) {
        for (const code of codes) if (this.keys.has(code)) return true;
        return false;
    }

    consume(codes) {
        for (const code of codes) this.keys.delete(code);
    }
}

class Player {
    constructor(x, y, input, combat) {
        this.x = x;
        this.y = y;
        this.input = input;
        this.combat = combat;

        // Stats
        this.hp = C.PLAYER.HP_MAX;
        this.hpMax = C.PLAYER.HP_MAX;
        this.stamina = C.PLAYER.STAMINA_MAX;
        this.radius = C.PLAYER.RADIUS;

        // Movement
        this.vx = 0;
        this.vy = 0;
        this.facing = 0;          // angle in radians
        this.isSprinting = false;
        this.speedMult = 1.0;   // from terrain

        // Dodge state
        this.isDodging = false;
        this.dodgeTimer = 0;
        this.dodgeCD = 0;
        this.dodgeDirX = 0;
        this.dodgeDirY = 0;

        // Combat state
        this.isAttacking = false;
        this.attackTimer = 0;
        this.attackCD = 0;
        this.heavyCD = 0;
        this.comboCount = 0;
        this.comboTimer = 0;
        this.invincible = 0;    // iframes after being hit
        this.hitStun = 0;
        this.knockbackX = 0;
        this.knockbackY = 0;

        // Alive
        this.alive = true;
        this.deathTimer = 0;

        // Visual
        this.walkCycle = 0;
        this.attackAnim = 0;
        this.isHeavy = false;

        // Stats tracking
        this.kills = 0;
        this.damageDealt = 0;
        this.damageTaken = 0;
    }

    // ── Update ─────────────────────────────────────────────
    update(dt, map) {
        if (!this.alive) {
            this.deathTimer += dt;
            return;
        }

        this._updateTimers(dt);
        this._handleInput(dt, map);
        this._applyKnockback(dt);
        map.resolveCollision(this);
        this.speedMult = map.getSpeedMult(this.x, this.y);
    }

    _updateTimers(dt) {
        if (this.attackCD > 0) this.attackCD -= dt;
        if (this.heavyCD > 0) this.heavyCD -= dt;
        if (this.dodgeCD > 0) this.dodgeCD -= dt;
        if (this.invincible > 0) this.invincible -= dt;
        if (this.hitStun > 0) this.hitStun -= dt;
        if (this.attackTimer > 0) {
            this.attackTimer -= dt;
            if (this.attackTimer <= 0) this.isAttacking = false;
        }
        if (this.comboTimer > 0) {
            this.comboTimer -= dt;
            if (this.comboTimer <= 0) this.comboCount = 0;
        }

        // Dodge timer
        if (this.isDodging) {
            this.dodgeTimer -= dt;
            if (this.dodgeTimer <= 0) {
                this.isDodging = false;
                this.invincible = 0.1; // brief iframes at end of dodge
            }
        }

        // Stamina regen
        if (!this.isSprinting && !this.isDodging) {
            this.stamina = Math.min(this.stamina + C.PLAYER.STAMINA_REGEN * dt, C.PLAYER.STAMINA_MAX);
        }
    }

    _handleInput(dt, map) {
        if (this.hitStun > 0) return; // stunned — no input

        const input = this.input;

        // ── Pause attack input check ─────────────
        const wantsAttack = input.isDown(KEYS.ATTACK) || input.mouse.left;
        const wantsHeavy = input.isDown(KEYS.HEAVY);
        const wantsDodge = input.isDown(KEYS.DODGE);
        input.consume(KEYS.DODGE); // dodge is one-shot per press

        // ── Movement ─────────────────────────────
        let mx = 0, my = 0;
        if (input.isDown(KEYS.MOVE_LEFT)) mx -= 1;
        if (input.isDown(KEYS.MOVE_RIGHT)) mx += 1;
        if (input.isDown(KEYS.MOVE_UP)) my -= 1;
        if (input.isDown(KEYS.MOVE_DOWN)) my += 1;

        const len = Math.hypot(mx, my);
        if (len > 0) { mx /= len; my /= len; }

        // Sprinting
        this.isSprinting = input.isDown(KEYS.SPRINT) && len > 0 && this.stamina > 2;
        if (this.isSprinting) this.stamina -= C.PLAYER.STAMINA_SPRINT * dt;

        // Dodge
        if (wantsDodge && this.dodgeCD <= 0 && !this.isDodging && this.stamina >= C.PLAYER.STAMINA_DODGE) {
            this._startDodge(mx || Math.cos(this.facing), my || Math.sin(this.facing));
        }

        // Apply movement
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

        // Dust particles while sprinting
        if (this.isSprinting && Math.random() < 0.3) {
            this.combat.spawnDustParticle(this.x, this.y + this.radius * 0.5);
        }

        // ── Attacks ──────────────────────────────
        if (wantsHeavy && this.heavyCD <= 0 && !this.isAttacking) {
            this._startAttack(true);
        } else if (wantsAttack && this.attackCD <= 0 && !this.isAttacking) {
            this._startAttack(false);
        }
    }

    _startDodge(dx, dy) {
        const len = Math.hypot(dx, dy) || 1;
        this.dodgeDirX = dx / len;
        this.dodgeDirY = dy / len;
        this.isDodging = true;
        this.dodgeTimer = C.PLAYER.DODGE_DUR;
        this.dodgeCD = C.PLAYER.DODGE_CD;
        this.stamina -= C.PLAYER.STAMINA_DODGE;
        this.invincible = C.PLAYER.DODGE_DUR + 0.05; // iframes during dodge
    }

    _startAttack(isHeavy) {
        this.isAttacking = true;
        this.isHeavy = isHeavy;
        this.attackAnim = 1.0;

        if (isHeavy) {
            this.attackTimer = 0.3;
            this.heavyCD = C.COMBAT.HEAVY_CD;
        } else {
            this.attackTimer = 0.2;
            this.attackCD = C.COMBAT.ATTACK_CD;
            this.comboTimer = C.COMBAT.COMBO_WINDOW;
            this.comboCount = (this.comboCount + 1) % 3;
        }
    }

    // Called by game loop when attack frame is active
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
        this.damageDealt += hits.reduce((s, h) => s + config.damage, 0);
        if (hits.length) this._attackExecuted = false; // allow re-hit if still active (not ideal but simple)
        return hits;
    }

    // Reset executed flag on new attack
    _startAttack(isHeavy) {
        this._attackExecuted = false;
        this.isAttacking = true;
        this.isHeavy = isHeavy;
        this.attackAnim = 1.0;
        if (isHeavy) {
            this.attackTimer = 0.3;
            this.heavyCD = C.COMBAT.HEAVY_CD;
        } else {
            this.attackTimer = 0.2;
            this.attackCD = C.COMBAT.ATTACK_CD;
            this.comboTimer = C.COMBAT.COMBO_WINDOW;
            this.comboCount = (this.comboCount + 1) % 3;
        }
    }

    _applyKnockback(dt) {
        if (Math.abs(this.knockbackX) < 1 && Math.abs(this.knockbackY) < 1) return;
        this.x += this.knockbackX * dt;
        this.y += this.knockbackY * dt;
        this.knockbackX *= 0.75;
        this.knockbackY *= 0.75;
    }

    // ── Receive damage ─────────────────────────────────────
    receiveDamage(amount, opts = {}) {
        if (!this.alive) return;
        if (this.invincible > 0) return;
        if (this.isDodging) return; // dodge = invincible

        this.hp = Math.max(0, this.hp - amount);
        this.damageTaken += amount;
        this.hitStun = C.COMBAT.HIT_STUN;
        this.invincible = C.COMBAT.IFRAMES;
        this.knockbackX = opts.knockbackX || 0;
        this.knockbackY = opts.knockbackY || 0;

        // Screen flash via UI
        UI.flashHit();

        if (this.hp <= 0) {
            this.alive = false;
            this.combat.spawnDeathEffect(this.x, this.y);
        }
    }

    // ── Draw ───────────────────────────────────────────────
    draw(ctx, cam) {
        if (!cam.isVisible(this.x, this.y, this.radius * 2)) return;

        const sx = this.x - cam.x;
        const sy = this.y - cam.y;
        const r = this.radius;

        ctx.save();
        ctx.translate(sx, sy);

        // Death fade
        if (!this.alive) {
            ctx.globalAlpha = Math.max(0, 1 - this.deathTimer * 1.5);
        }

        // Dodge glint
        if (this.isDodging) {
            ctx.shadowColor = 'rgba(255,220,100,0.9)';
            ctx.shadowBlur = 18;
        }

        // iFrame flash
        if (this.invincible > 0 && !this.isDodging) {
            if (Math.floor(this.invincible * 12) % 2 === 0) ctx.globalAlpha = 0.45;
        }

        // Shadow
        ctx.beginPath();
        ctx.ellipse(0, r * 0.85, r * 0.85, r * 0.28, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fill();

        // Body rotation towards facing
        ctx.rotate(this.facing + Math.PI / 2);

        // Body (warrior silhouette)
        const legSwing = Math.sin(this.walkCycle) * 5;

        // Legs
        ctx.fillStyle = '#2a1a08';
        ctx.beginPath();
        ctx.ellipse(-r * 0.28, r * 0.5 + legSwing, r * 0.22, r * 0.38, 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(r * 0.28, r * 0.5 - legSwing, r * 0.22, r * 0.38, -0.15, 0, Math.PI * 2);
        ctx.fill();

        // Cape (flowing)
        const capeFlap = Math.sin(this.walkCycle * 0.7) * 0.12;
        ctx.beginPath();
        ctx.moveTo(-r * 0.3, -r * 0.1);
        ctx.quadraticCurveTo(-r * 0.7 - capeFlap * r, r * 0.3, -r * 0.25, r * 0.7);
        ctx.quadraticCurveTo(r * 0.25, r * 0.5, r * 0.15, -r * 0.15);
        ctx.closePath();
        ctx.fillStyle = C.COLOR.PLAYER_CAPE;
        ctx.fill();

        // Torso
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.5, r * 0.65, 0, 0, Math.PI * 2);
        ctx.fillStyle = C.COLOR.PLAYER_BODY;
        ctx.fill();
        // Garment (shemma / netela pattern)
        ctx.strokeStyle = '#ffe090';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Shield (left arm)
        ctx.save();
        ctx.translate(-r * 0.65, 0);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.4, r * 0.52, -0.2, 0, Math.PI * 2);
        ctx.fillStyle = C.COLOR.PLAYER_SHIELD;
        ctx.fill();
        ctx.strokeStyle = '#8b5010';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Shield cross pattern (Ethiopian)
        ctx.strokeStyle = '#8b5010';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.35);
        ctx.lineTo(0, r * 0.35);
        ctx.moveTo(-r * 0.25, 0);
        ctx.lineTo(r * 0.25, 0);
        ctx.stroke();
        ctx.restore();

        // Sword / Shotel (right arm) — curved blade
        ctx.save();
        ctx.translate(r * 0.5, 0);
        if (this.isAttacking) {
            const swingAngle = this.isHeavy
                ? (1 - this.attackTimer / 0.3) * Math.PI * 1.2
                : (1 - this.attackTimer / 0.2) * Math.PI * 0.9;
            ctx.rotate(swingAngle - Math.PI * 0.3);
        }
        ctx.strokeStyle = C.COLOR.PLAYER_SWORD;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        // Shotel curve (sickle-like)
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(r * 0.3, -r * 0.4, r * 0.6, -r * 0.8, r * 0.2, -r * 1.2);
        ctx.stroke();
        // Hilt
        ctx.strokeStyle = '#8b6020';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-r * 0.1, 0);
        ctx.lineTo(r * 0.2, 0);
        ctx.stroke();
        ctx.restore();

        // Head
        ctx.beginPath();
        ctx.arc(0, -r * 0.75, r * 0.38, 0, Math.PI * 2);
        ctx.fillStyle = '#1a0a00';
        ctx.fill();
        // Head wrap / gabi crown
        ctx.beginPath();
        ctx.arc(0, -r * 0.9, r * 0.28, Math.PI, 0);
        ctx.fillStyle = '#ffe080';
        ctx.fill();
        // Eye highlight
        ctx.fillStyle = 'rgba(255,240,200,0.9)';
        ctx.beginPath();
        ctx.arc(r * 0.1, -r * 0.75, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.restore();

        // Attack arc visual
        if (this.isAttacking) {
            this.combat.drawAttackArc(ctx, cam, this,
                this.isHeavy ? C.COMBAT.HEAVY_RANGE : C.COMBAT.ATTACK_RANGE,
                this.isHeavy);
        }
    }

    getStats() {
        return {
            kills: this.kills,
            damageDealt: this.damageDealt,
            damageTaken: this.damageTaken,
        };
    }
}
