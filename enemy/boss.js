// ============================================================
//  BOSS — General Albertone: officer boss with multi-phase AI
// ============================================================

class Boss extends Enemy {
    constructor(x, y, combat) {
        super(x, y, C.ENEMY.BOSS, combat);
        this.type = 'boss';
        this.isBoss = true;
        this.name = 'General Albertone';

        // Phase tracking
        this.phase = 1;   // 1 = normal, 2 = enraged
        this.roarDone = false;

        // Boss-specific timers
        this._chargeCD = 4.0;
        this._chargeDur = 0;
        this._chargeX = 0;
        this._chargeY = 0;
        this._roarTimer = 0;
        this._enrageFlash = 0;
        this._auraParticles = [];
        this._sweepAnim = 0;
        this.walkCycle = 0;

        // Build extended state machine
        this.sm = this._buildBossStateMachine();
        this.sm.transition(AIState.IDLE);
    }

    _buildBossStateMachine() {
        const baseSM = buildEnemyStateMachine(this);

        // Add boss-specific states
        baseSM.states[AIState.ROAR] = {
            enter(b) {
                b._roarTimer = 1.8;
                b.vx = 0; b.vy = 0;
                // Announce phase 2
                UI.showEventBanner('⚔ GENERAL ALBERTONE ENRAGES! ⚔', '#ff4040', 3.0);
            },
            update(b, dt) {
                b._roarTimer -= dt;
                b._enrageFlash = Math.abs(Math.sin(b._roarTimer * 8));
                // Screen shake
                if (b.map) b.map.camera.doShake(0.1, 6);
                if (b._roarTimer <= 0) {
                    b.sm.transition(AIState.ENRAGE);
                }
            },
        };

        baseSM.states[AIState.ENRAGE] = {
            enter(b) {
                b.cfg = { ...C.ENEMY.BOSS };          // copy
                b.cfg.SPEED *= 1.4;
                b.cfg.DAMAGE = C.ENEMY.BOSS.CHARGE_DAMAGE;
                b.cfg.ATTACK_CD *= 0.7;
                b._chargeCD = 2.5;
            },
            update(b, dt) {
                // Behaves like CHASE but faster with periodic charge
                b.pathTimer -= dt;
                if (b.pathTimer <= 0) {
                    b.pathTimer = C.AI.PATH_INTERVAL;
                    b._computeChaseVector();
                }
                const speed = b.cfg.SPEED * b._terrainMult;
                b.vx = b._chaseX * speed;
                b.vy = b._chaseY * speed;

                // Charge attack
                b._chargeCD -= dt;
                if (b._chargeCD <= 0) {
                    b._chargeCD = 2.5 + Math.random() * 1.5;
                    b._startCharge();
                }

                const d = b._distToPlayer();
                if (d < b.cfg.ATTACK_RANGE * 0.9) {
                    b.sm.transition(AIState.ATTACK);
                }
            },
        };

        baseSM.states[AIState.CHARGE] = {
            enter(b) {
                b._chargeDur = 0.55;
                const spd = 440;
                b.vx = b._chargeX * spd;
                b.vy = b._chargeY * spd;
                b.combat.spawnDustParticle(b.x, b.y);
                if (b.map) b.map.camera.doShake(0.25, 8);
            },
            update(b, dt) {
                b._chargeDur -= dt;
                // Hit detection during charge
                const d = b._distToPlayer();
                if (d < b.cfg.ATTACK_RANGE + b.player.radius) {
                    b.player.receiveDamage(C.ENEMY.BOSS.CHARGE_DAMAGE, {
                        knockbackX: b._chargeX * 120,
                        knockbackY: b._chargeY * 120,
                    });
                    b.sm.transition(AIState.ENRAGE);
                    return;
                }
                if (b._chargeDur <= 0) {
                    b.vx = 0; b.vy = 0;
                    b.sm.transition(AIState.ENRAGE);
                }
            },
        };

        // Patch base IDLE/CHASE to allow phase transition check
        const baseChaseUpdate = baseSM.states[AIState.CHASE].update;
        baseSM.states[AIState.CHASE].update = (b, dt, t) => {
            b._checkPhaseTransition();
            baseChaseUpdate(b, dt, t);
        };
        baseSM.states[AIState.ATTACK].update = (b, dt) => {
            b.vx *= 0.85; b.vy *= 0.85;
            b._attackCooldown -= dt;
            if (b._attackCooldown <= 0) {
                b._attackCooldown = b.cfg.ATTACK_CD || C.ENEMY.BOSS.ATTACK_CD;
                b._doAttack();
            }
            b._checkPhaseTransition();
            const d = b._distToPlayer();
            if (d > b.cfg.ATTACK_RANGE * 1.4) {
                b.sm.transition(b.phase === 2 ? AIState.ENRAGE : AIState.CHASE);
            }
        };

        return baseSM;
    }

    _checkPhaseTransition() {
        if (this.phase === 1 && this.hp <= C.ENEMY.BOSS.PHASE2_HP && !this.roarDone) {
            this.phase = 2;
            this.roarDone = true;
            this.sm.transition(AIState.ROAR);
        }
    }

    _startCharge() {
        if (!this.player) return;
        const dx = this.player.x - this.x;
        const dy = this.player.y - this.y;
        const d = Math.hypot(dx, dy) || 1;
        this._chargeX = dx / d;
        this._chargeY = dy / d;
        this.facing = Math.atan2(dy, dx);
        this.sm.transition(AIState.CHARGE);
    }

    _doAttack() {
        if (!this.player || !this.player.alive) return;
        const d = this._distToPlayer();
        if (d <= this.cfg.ATTACK_RANGE + this.player.radius + 10) {
            this.isAttacking = true;
            this.attackAnim = 1.0;
            this._sweepAnim = 1.0;
            this.combat.performAttack(this, [this.player], {
                range: this.cfg.ATTACK_RANGE + 15,
                damage: this.cfg.DAMAGE,
                knockback: 80,
                type: this.phase === 2 ? 'heavy' : 'normal',
            });
            if (this.map) this.map.camera.doShake(0.15, 5);
        }
    }

    update(dt, map, player) {
        super.update(dt, map, player);
        if (!this.alive) return;
        this.walkCycle += dt * 6;
        if (this._enrageFlash > 0) this._enrageFlash -= dt * 2;
        if (this._sweepAnim > 0) this._sweepAnim -= dt * 4;

        // Boss-specific charge state continuous movement
        if (this.sm.is(AIState.CHARGE) && map) {
            map.resolveCollision(this);
        }
    }

    draw(ctx, cam) {
        if (!this.alive && this.deathTimer > 2.5) return;
        if (!cam.isVisible(this.x, this.y, this.radius * 3)) return;

        const sx = this.x - cam.x;
        const sy = this.y - cam.y;
        const r = this.radius;

        ctx.save();
        ctx.translate(sx, sy);

        if (!this.alive) {
            ctx.globalAlpha = Math.max(0, 1 - (this.deathTimer - 0.6) * 0.8);
            ctx.rotate(Math.PI / 2);
        }

        // Enrage aura
        if (this.phase === 2 && this.alive) {
            const auraAlpha = 0.15 + Math.abs(Math.sin(Date.now() * 0.004)) * 0.2;
            const aura = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2.2);
            aura.addColorStop(0, `rgba(200,20,20,${auraAlpha})`);
            aura.addColorStop(1, 'transparent');
            ctx.fillStyle = aura;
            ctx.beginPath();
            ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Charge trail
        if (this.sm.is(AIState.CHARGE)) {
            ctx.shadowColor = '#ff6020';
            ctx.shadowBlur = 22;
        }

        // Hit flash
        if (this.hitFlash > 0) { ctx.shadowColor = '#ff2020'; ctx.shadowBlur = 20; }

        // Enrage flash overlay
        if (this._enrageFlash > 0.1) {
            ctx.globalAlpha = this._enrageFlash * 0.4;
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        this._drawShadow(ctx);
        ctx.rotate(this.facing + Math.PI / 2);

        const legSwing = Math.sin(this.walkCycle) * 5;

        // Legs (boots)
        ctx.fillStyle = '#1a1008';
        ctx.beginPath(); ctx.ellipse(-r * 0.3, r * 0.55 + legSwing, r * 0.28, r * 0.42, 0.1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(r * 0.3, r * 0.55 - legSwing, r * 0.28, r * 0.42, -0.1, 0, Math.PI * 2); ctx.fill();

        // Uniform (dark commander coat)
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.62, r * 0.8, 0, 0, Math.PI * 2);
        ctx.fillStyle = this.phase === 2 ? '#2a0808' : C.COLOR.ENEMY_BOSS;
        ctx.fill();
        ctx.strokeStyle = '#8a6020';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Epaulettes (officer rank)
        ctx.fillStyle = '#c8a020';
        ctx.beginPath(); ctx.ellipse(-r * 0.6, -r * 0.05, r * 0.2, r * 0.12, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(r * 0.6, -r * 0.05, r * 0.2, r * 0.12, -0.3, 0, Math.PI * 2); ctx.fill();

        // Medals / decorations
        ctx.fillStyle = '#d4a017';
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(-r * 0.1 + i * r * 0.13, -r * 0.1, r * 0.07, 0, Math.PI * 2);
            ctx.fill();
        }

        // Sabre (large sword, right arm)
        ctx.save();
        ctx.translate(r * 0.65, 0);
        if (this._sweepAnim > 0) ctx.rotate(-1.2 * this._sweepAnim + Math.PI * 0.1);
        else if (this.sm.is(AIState.CHARGE)) ctx.rotate(-0.6);
        ctx.strokeStyle = '#d0d0b0';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, r * 0.3);
        ctx.lineTo(0, -r * 1.5);
        ctx.stroke();
        ctx.strokeStyle = '#8a6020';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-r * 0.18, -r * 0.05);
        ctx.lineTo(r * 0.18, -r * 0.05);
        ctx.stroke();
        ctx.restore();

        // Officer hat (peaked cap / fez-inspired)
        ctx.beginPath();
        ctx.rect(-r * 0.48, -r * 1.1, r * 0.96, r * 0.38);
        ctx.fillStyle = this.phase === 2 ? '#3a0808' : '#1a2a10';
        ctx.fill();
        ctx.strokeStyle = '#c8a020';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Top badge
        ctx.fillStyle = '#ffd020';
        ctx.beginPath();
        ctx.arc(0, -r * 0.98, r * 0.12, 0, Math.PI * 2);
        ctx.fill();
        // Brim
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.72, r * 0.55, r * 0.13, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#0a160a';
        ctx.fill();

        // Face
        ctx.beginPath();
        ctx.arc(0, -r * 0.8, r * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = '#c8a068';
        ctx.fill();
        // Moustache
        ctx.strokeStyle = '#5a3820';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-r * 0.18, -r * 0.74);
        ctx.lineTo(r * 0.18, -r * 0.74);
        ctx.stroke();

        this._drawHealthBar(ctx);

        // Phase 2 crown of fire
        if (this.phase === 2 && this.alive) {
            const t = Date.now() * 0.003;
            ctx.save();
            ctx.translate(0, -r * 1.15);
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2 + t;
                const px = Math.cos(a) * r * 0.5;
                const py = Math.sin(a) * r * 0.2 - r * 0.15;
                const pg = ctx.createRadialGradient(px, py, 0, px, py, r * 0.3);
                pg.addColorStop(0, 'rgba(255,150,20,0.9)');
                pg.addColorStop(1, 'transparent');
                ctx.fillStyle = pg;
                ctx.beginPath();
                ctx.arc(px, py, r * 0.3, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        ctx.restore();
    }
}
