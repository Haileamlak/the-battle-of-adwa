// ============================================================
//  EVENT SYSTEM — Battlefield events with triggers & effects
// ============================================================

const EventType = Object.freeze({
    REINFORCEMENTS: 'reinforcements',
    AMBUSH: 'ambush',
    MORALE_BOOST: 'morale_boost',
    ARTILLERY: 'artillery',
    RETREAT_COMMAND: 'retreat_command',
});

class BattlefieldEvent {
    constructor(type, label, triggerFn, effectFn, cooldown = 60) {
        this.type = type;
        this.label = label;
        this.triggerFn = triggerFn;   // (gameState) => bool — should this fire?
        this.effectFn = effectFn;    // (gameState) => void — what it does
        this.cooldown = cooldown;    // seconds between firings
        this._cd = cooldown * 0.3; // start with partial cooldown
        this.firedCount = 0;
    }

    tick(dt, gameState) {
        this._cd -= dt;
        if (this._cd <= 0 && this.triggerFn(gameState)) {
            this._cd = this.cooldown;
            this.firedCount++;
            this.effectFn(gameState);
            return true; // event fired
        }
        return false;
    }
}

class EventSystem {
    constructor() {
        this.events = [];
        this.log = [];   // recent event messages
        this._buildEvents();
    }

    _buildEvents() {
        // ── REINFORCEMENTS — Ethiopian warriors arrive ─────────
        this.events.push(new BattlefieldEvent(
            EventType.REINFORCEMENTS,
            '🛡 Ethiopian Reinforcements Arrive!',
            (gs) => gs.enemies.filter(e => e.alive).length < 2 && gs.wave < 4,
            (gs) => {
                const spawn = gs.map.getEnemySpawnPoints();
                const pt = spawn[Math.floor(Math.random() * spawn.length)];
                const e1 = new Soldier(pt.x + 30, pt.y, gs.combat);
                const e2 = new Soldier(pt.x - 30, pt.y, gs.combat);
                e1.player = gs.player; e1.map = gs.map;
                e2.player = gs.player; e2.map = gs.map;
                gs.enemies.push(e1, e2);
                UI.showEventBanner('🛡 Reinforcements — more Italians approach!', '#cc4020', 3.0);
                this._log('Italian reinforcements have arrived!');
            },
            45
        ));

        // ── AMBUSH — enemies flank from a new direction ────────
        this.events.push(new BattlefieldEvent(
            EventType.AMBUSH,
            '⚠ Ambush!',
            (gs) => gs.player && gs.player.hp < gs.player.hpMax * 0.7 && gs.wave >= 2,
            (gs) => {
                // Spawn from opposite side of screen in side view
                const fromLeft = gs.player.x > gs.map.camera.x + gs.map.camera.w / 2;
                const sx = fromLeft ? gs.map.camera.x - 30 : gs.map.camera.x + gs.map.camera.w + 30;
                const sy = C.GROUND_Y - C.ENEMY.RIFLEMAN.RADIUS;
                const e1 = new Rifleman(sx, sy, gs.combat);
                const e2 = new Soldier(sx + (fromLeft ? 55 : -55), sy, gs.combat);
                e1.player = gs.player; e1.map = gs.map;
                e2.player = gs.player; e2.map = gs.map;
                // Immediately chase
                e1.sm.transition(AIState.CHASE);
                e2.sm.transition(AIState.CHASE);
                gs.enemies.push(e1, e2);
                UI.showEventBanner('⚠ AMBUSH — enemies flank from the ridge!', '#ff6020', 3.5);
                gs.map.camera.doShake(0.4, 10);
                this._log('Flanking ambush sprung!');
            },
            70
        ));

        // ── MORALE BOOST — player heals slightly ──────────────
        this.events.push(new BattlefieldEvent(
            EventType.MORALE_BOOST,
            '✝ Morale Boost!',
            (gs) => gs.player && gs.player.hp < gs.player.hpMax * 0.4 && gs.player.kills >= 3,
            (gs) => {
                const heal = 25;
                gs.player.hp = Math.min(gs.player.hpMax, gs.player.hp + heal);
                gs.combat.floatTexts.push(new FloatingText(
                    gs.player.x, gs.player.y - 40,
                    `+${heal} ✝`,
                    '#88ffaa',
                    22
                ));
                UI.showEventBanner('✝ Ethiopia\'s saints watch over you — courage restored!', '#60c060', 3.5);
                this._log('Morale boost — the faithful rally!');
            },
            90
        ));

        // ── ARTILLERY (Italian) — circle bomb zones ────────────
        this.events.push(new BattlefieldEvent(
            EventType.ARTILLERY,
            '💥 Artillery Strike!',
            (gs) => gs.wave >= 3 && gs.enemies.filter(e => e.alive).length >= 3,
            (gs) => {
                // Spawn warning circles then delayed explosions
                const px = gs.player.x;
                const shots = 2 + Math.floor(Math.random() * 2);
                for (let i = 0; i < shots; i++) {
                    const tx = px + (Math.random() - 0.5) * 260;
                    const ty = C.GROUND_Y;  // lands on the ground
                    // Schedule explosion via combat particles + damage
                    setTimeout(() => {
                        if (!gs.player) return;
                        const dx = gs.player.x - tx;
                        const dy = gs.player.y - ty;
                        const d = Math.hypot(dx, dy);
                        if (d < 80) {
                            gs.player.receiveDamage(18, {
                                knockbackX: (dx / (d || 1)) * 100,
                                knockbackY: (dy / (d || 1)) * 100,
                            });
                        }
                        for (let j = 0; j < 16; j++) {
                            const a = Math.random() * Math.PI * 2;
                            const s = 80 + Math.random() * 140;
                            gs.combat.particles.push(new Particle(
                                tx, ty,
                                Math.cos(a) * s, Math.sin(a) * s - 100,
                                0.5 + Math.random() * 0.4,
                                j % 2 === 0 ? '#ff8020' : '#ffe060',
                                4
                            ));
                        }
                        gs.map.camera.doShake(0.35, 12);
                        gs._addArtilleryWarning(tx, ty, 0); // clear warning
                    }, (1.5 + i * 0.4) * 1000);

                    gs._addArtilleryWarning(tx, ty, 1.5 + i * 0.4);
                }
                UI.showEventBanner('💥 Italian artillery incoming — take cover!', '#ff4020', 3.0);
                this._log('Artillery bombardment!');
            },
            80
        ));

        // ── RETREAT COMMAND — wounded enemies pull back ────────
        this.events.push(new BattlefieldEvent(
            EventType.RETREAT_COMMAND,
            '↩ Retreat!',
            (gs) => gs.player && gs.player.kills >= 6 && gs.wave < 4,
            (gs) => {
                let count = 0;
                for (const e of gs.enemies) {
                    if (!e.alive || e.isBoss) continue;
                    if (e.hp < e.hpMax * 0.35) {
                        e.sm.transition(AIState.IDLE);
                        e._wanderDx = -e._chaseX;
                        e._wanderDy = -e._chaseY;
                        count++;
                    }
                }
                if (count > 0) {
                    UI.showEventBanner('↩ Italian forces fall back — but regroup soon!', '#ffe060', 2.5);
                    this._log('Retreat order issued to wounded Italians.');
                }
            },
            55
        ));
    }

    update(dt, gameState) {
        for (const event of this.events) {
            event.tick(dt, gameState);
        }
    }

    _log(msg) {
        this.log.unshift({ msg, time: Date.now() });
        if (this.log.length > 10) this.log.pop();
    }
}
