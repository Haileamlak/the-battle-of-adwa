// ============================================================
//  BOSS — Modular Animated General Albertone
// ============================================================

class Boss extends Enemy {
    constructor(x, y, combat) {
        super(x, y, C.ENEMY.BOSS, combat);
        this.isBoss = true;
        this.name = 'Imperial General';

        this._chargeCooldown = 4.0;
        this._isCharging = false;
        this._chargeTimer = 0;
        this._phase = 1;

        this.sm = this._buildBossSM();
        this.sm.transition(AIState.CHASE);
    }

    _buildBossSM() {
        const sm = new StateMachine(this);
        sm.addState(AIState.CHASE, {
            update: (e, dt) => {
                if (!e.player?.alive) return;
                const dx = e.player.x - e.x;
                e.facingDir = dx > 0 ? 1 : -1;
                e.vx = e.facingDir * e.cfg.SPEED;

                if (Math.abs(dx) < e.cfg.ATTACK_RANGE * 1.5) sm.transition(AIState.ATTACK);

                e._chargeCooldown -= dt;
                if (e._chargeCooldown <= 0 && e.grounded) sm.transition(AIState.CHARGE);
            }
        });
        sm.addState(AIState.ATTACK, {
            update: (e, dt) => {
                e.vx *= 0.8;
                e._attackCooldown -= dt;
                if (e._attackCooldown <= 0) { e._attackCooldown = e.cfg.ATTACK_CD; e._doAttack(); }
                if (this.player && Math.abs(this.player.x - e.x) > e.cfg.ATTACK_RANGE * 2) sm.transition(AIState.CHASE);
            }
        });
        sm.addState(AIState.CHARGE, {
            enter: (e) => { e._isCharging = true; e._chargeTimer = 1.0; e.vx = e.facingDir * e.cfg.CHARGE_SPEED; },
            update: (e, dt) => {
                e._chargeTimer -= dt;
                if (e._chargeTimer <= 0) { e._isCharging = false; sm.transition(AIState.CHASE); e._chargeCooldown = 5; }
                if (this.player && Math.abs(this.player.x - e.x) < e.radius * 2) {
                    this.player.receiveDamage(e.cfg.CHARGE_DAMAGE, { knockbackX: e.vx, knockbackY: -200 });
                }
            }
        });
        sm.addState(AIState.DEAD, { enter: (e) => { e.alive = false; e.vx = 0; } });
        return sm;
    }

    _doAttack() {
        if (!this.player?.alive) return;
        this.combat.performAttack(this, [this.player], { range: this.cfg.ATTACK_RANGE, damage: this.cfg.DAMAGE, type: 'heavy' });
        this.attackAnim = 1.0;
    }

    update(dt, map, player) {
        super.update(dt, map, player);
        if (this._phase === 1 && this.hp < this.hpMax * 0.5) this._phase = 2;
    }

    draw(ctx, cam) {
        const p = cam.project(this.x, this.y);
        const sx = p.x, sy = p.y, r = this.radius;
        if (!cam.isVisible(this.x, this.y, r * 5)) return;

        ctx.save();
        drawEntityShadow(ctx, cam, this);
        ctx.translate(sx, sy + this.bob);

        if (this._isCharging) { ctx.shadowColor = '#f60'; ctx.shadowBlur = 20; }
        if (this.hitFlash > 0) { ctx.shadowColor = '#f11'; ctx.shadowBlur = 15; }

        ctx.scale(this.facingDir, 1);
        ctx.rotate(this.tilt);

        const img = window._assets?.boss;
        if (img && img.complete && img.naturalWidth > 0) {
            const aspect = img.naturalWidth / img.naturalHeight;
            const h = r * 15.0, w = h * aspect;
            ctx.drawImage(img, -w / 2, -h * 0.85, w, h);
        } else {
            ctx.fillStyle = '#000';
            ctx.fillRect(-r * 0.6, -r * 1.8, r * 1.2, r * 2.2);
        }

        this._drawHealthBar(ctx, 0, 0);
        ctx.restore();
    }
}
