// ============================================================
//  STATE MACHINE — generic FSM + enemy AI states (platformer)
// ============================================================

const AIState = Object.freeze({
    IDLE: 'IDLE',
    PATROL: 'PATROL',
    CHASE: 'CHASE',
    ATTACK: 'ATTACK',
    DEAD: 'DEAD',
    ENRAGE: 'ENRAGE',
    CHARGE: 'CHARGE',
    ROAR: 'ROAR',
});

class StateMachine {
    constructor(entity) {
        this.entity = entity;
        this.current = null;
        this.states = {};
    }
    addState(name, def) { this.states[name] = def; return this; }
    transition(name) {
        if (!this.states[name]) return;
        if (this.states[this.current]?.exit) this.states[this.current].exit(this.entity);
        this.current = name;
        if (this.states[name].enter) this.states[name].enter(this.entity);
    }
    update(dt) {
        if (this.states[this.current]?.update) this.states[this.current].update(this.entity, dt);
    }
    is(name) { return this.current === name; }
}

// ── Build default enemy FSM (platformer-adapted) ─────────────
function buildEnemyStateMachine(enemy) {
    const sm = new StateMachine(enemy);

    sm.addState(AIState.IDLE, {
        enter(e) { e.vx = 0; e._idleTimer = 0.8 + Math.random() * 1.2; },
        update(e, dt) {
            e.vx *= 0.85;
            e._idleTimer -= dt;
            if (e._idleTimer <= 0) e.sm.transition(AIState.PATROL);
            if (e.player && Math.abs(e.player.x - e.x) < e.cfg.DETECT_R) e.sm.transition(AIState.CHASE);
        },
    });

    sm.addState(AIState.PATROL, {
        enter(e) {
            if (!e._patrolOrigin) e._patrolOrigin = e.x;
            e._patrolDir = 1;
            e._patrolTimer = C.AI.WANDER_INTERVAL + Math.random() * 2;
        },
        update(e, dt) {
            e._patrolTimer -= dt;
            const speed = e.cfg.SPEED * 0.55;
            const target = e._patrolOrigin + e._patrolDir * C.AI.PATROL_DIST;
            const dx = target - e.x;
            if (Math.abs(dx) < 20 || e._patrolTimer <= 0) {
                e._patrolDir *= -1;
                e._patrolTimer = C.AI.WANDER_INTERVAL + Math.random() * 1.5;
            }
            e.vx = dx > 0 ? speed : -speed;
            e.facingDir = dx > 0 ? 1 : -1;
            if (e.player && Math.abs(e.player.x - e.x) < e.cfg.DETECT_R) e.sm.transition(AIState.CHASE);
        },
    });

    sm.addState(AIState.CHASE, {
        update(e, dt) {
            if (!e.player || !e.player.alive) { e.sm.transition(AIState.IDLE); return; }
            const dx = e.player.x - e.x;
            const dy = e.player.y - e.y;
            const dist = Math.abs(dx);

            if (dist > e.cfg.LOSE_R) { e.sm.transition(AIState.IDLE); return; }

            // Run toward player
            const speed = (e.cfg.SPEED || 100) * (e.grounded ? 1 : 0.6);
            e.vx = dx > 0 ? speed : -speed;
            e.facingDir = dx > 0 ? 1 : -1;

            // Try to jump if player is significantly above and we're grounded
            if (dy < -C.AI.JUMP_DY && e.grounded && e.cfg.JUMP_FORCE) {
                e.vy = -(e.cfg.JUMP_FORCE || 530);
                e.grounded = false;
            }

            // Attack range check
            if (dist < e.cfg.ATTACK_RANGE + e.player.radius && Math.abs(dy) < e.radius * 3) {
                e.sm.transition(AIState.ATTACK);
            }
        },
    });

    sm.addState(AIState.ATTACK, {
        enter(e) { e._attackCooldown = e.cfg.ATTACK_CD; },
        update(e, dt) {
            e.vx *= 0.82;
            e._attackCooldown -= dt;
            if (e._attackCooldown <= 0) {
                e._attackCooldown = e.cfg.ATTACK_CD;
                e._doAttack();
            }
            // Re-chase if player moved away
            if (!e.player || !e.player.alive) { e.sm.transition(AIState.IDLE); return; }
            const dx = e.player.x - e.x;
            const dy = e.player.y - e.y;
            if (Math.abs(dx) > e.cfg.ATTACK_RANGE * 1.5 || Math.abs(dy) > e.radius * 4) {
                e.sm.transition(AIState.CHASE);
            }
        },
    });

    sm.addState(AIState.DEAD, {
        enter(e) { e.alive = false; e.vx *= 0.4; },
        update(e) { e.vx *= 0.88; },
    });

    return sm;
}
