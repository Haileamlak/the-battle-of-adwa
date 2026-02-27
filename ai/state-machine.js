// ============================================================
//  AI STATE MACHINE — base finite state machine for all enemies
// ============================================================

const AIState = Object.freeze({
    IDLE: 'idle',
    WANDER: 'wander',
    CHASE: 'chase',
    ATTACK: 'attack',
    RETREAT: 'retreat',
    DEAD: 'dead',
    // Boss-specific
    ENRAGE: 'enrage',
    CHARGE: 'charge',
    ROAR: 'roar',
});

class StateMachine {
    constructor(owner, states) {
        this.owner = owner;
        this.states = states;   // { stateName: { enter, update, exit } }
        this.current = null;
        this.previous = null;
        this.stateTime = 0;     // time spent in current state
    }

    transition(newState, data = {}) {
        if (newState === this.current) return;

        const prev = this.states[this.current];
        if (prev && prev.exit) prev.exit(this.owner, data);

        this.previous = this.current;
        this.current = newState;
        this.stateTime = 0;

        const next = this.states[newState];
        if (next && next.enter) next.enter(this.owner, data);
    }

    update(dt) {
        this.stateTime += dt;
        const s = this.states[this.current];
        if (s && s.update) s.update(this.owner, dt, this.stateTime);
    }

    is(state) { return this.current === state; }
    isAny(...states) { return states.includes(this.current); }
}

// ── Build standard enemy state machine ───────────────────
function buildEnemyStateMachine(enemy) {
    return new StateMachine(enemy, {

        [AIState.IDLE]: {
            enter(e) {
                e.vx = 0; e.vy = 0;
                e.wanderTimer = e.cfg.WANDER_INTERVAL || C.AI.WANDER_INTERVAL;
            },
            update(e, dt, t) {
                e.wanderTimer -= dt;
                if (e.wanderTimer <= 0) e.sm.transition(AIState.WANDER);
                const d = e._distToPlayer();
                if (d < e.cfg.DETECT_R) e.sm.transition(AIState.CHASE);
            },
        },

        [AIState.WANDER]: {
            enter(e) {
                const a = Math.random() * Math.PI * 2;
                e._wanderDx = Math.cos(a);
                e._wanderDy = Math.sin(a);
                e._wanderDur = 1.0 + Math.random() * 1.5;
            },
            update(e, dt, t) {
                e._wanderDur -= dt;
                const speed = e.cfg.SPEED * 0.45;
                e.vx = e._wanderDx * speed;
                e.vy = e._wanderDy * speed;
                if (e._wanderDur <= 0) e.sm.transition(AIState.IDLE);
                const d = e._distToPlayer();
                if (d < e.cfg.DETECT_R) e.sm.transition(AIState.CHASE);
            },
        },

        [AIState.CHASE]: {
            enter(e) { e.pathTimer = 0; },
            update(e, dt, t) {
                e.pathTimer -= dt;
                if (e.pathTimer <= 0) {
                    e.pathTimer = C.AI.PATH_INTERVAL;
                    e._computeChaseVector();
                }
                const speed = e.cfg.SPEED * e._terrainMult;
                e.vx = e._chaseX * speed;
                e.vy = e._chaseY * speed;

                const d = e._distToPlayer();
                if (d > e.cfg.LOSE_R) e.sm.transition(AIState.IDLE);
                else if (d < (e.cfg.RANGED ? e.cfg.PREFERRED_DIST * 0.6 : e.cfg.ATTACK_RANGE * 0.9))
                    e.sm.transition(AIState.ATTACK);
            },
        },

        [AIState.ATTACK]: {
            enter(e) { e._attackCooldown = e.cfg.ATTACK_CD; },
            update(e, dt, t) {
                e.vx *= 0.85; e.vy *= 0.85; // slow during attack wind-up
                e._attackCooldown -= dt;
                if (e._attackCooldown <= 0) {
                    e._attackCooldown = e.cfg.ATTACK_CD;
                    e._doAttack();
                }

                const d = e._distToPlayer();
                if (d > e.cfg.ATTACK_RANGE * (e.cfg.RANGED ? 1.5 : 1.3)) {
                    e.sm.transition(AIState.CHASE);
                }
                if (d > e.cfg.LOSE_R) e.sm.transition(AIState.IDLE);
            },
        },

        [AIState.DEAD]: {
            enter(e) {
                e.alive = false;
                e.vx = 0; e.vy = 0;
                e.deathTimer = 0;
            },
            update(e, dt) {
                e.deathTimer += dt;
            },
        },
    });
}
