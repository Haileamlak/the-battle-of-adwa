// ============================================================
//  CONSTANTS — Battle of Adwa
//  Centralised game config. Tweak here first when balancing.
// ============================================================

const C = {
  // ── Canvas & World ────────────────────────────────────────
  WORLD_W: 2400,
  WORLD_H: 2400,
  TILE:     40,

  // ── Ethiopian Palette ─────────────────────────────────────
  COLOR: {
    // Terrain
    GROUND_BASE:   '#c8a96e',   // warm sand/earth
    GROUND_DARK:   '#8b6914',   // shadowed earth
    GROUND_ROCK:   '#6b5a3e',   // rocky outcrop
    HILL_LOW:      '#a07840',   // low hill face
    HILL_MID:      '#7a5c28',   // mid hill
    HILL_HIGH:     '#5a3e18',   // peak shadow
    GRASS:         '#6b7c3a',   // sparse highland grass
    PATH:          '#d4b97a',   // dirt path
    SKY_TOP:       '#1a3a5c',   // dawn sky top
    SKY_BOT:       '#c4763a',   // dawn horizon

    // Player
    PLAYER_BODY:   '#1a0a00',   // deep brown warrior
    PLAYER_CAPE:   '#6b0a0a',   // crimson cape
    PLAYER_SHIELD: '#c08030',   // traditional shield (round)
    PLAYER_SWORD:  '#c0c0a0',   // blade shimmer

    // Enemy
    ENEMY_SOLDIER: '#3a4a2a',   // Italian colonial green
    ENEMY_OFFICER: '#5a3010',   // officer brown
    ENEMY_BOSS:    '#1a1a2a',   // dark commander

    // Combat
    HIT_SPARK:     '#ffe060',   // impact flash
    BLOOD:         '#8b0000',
    ATTACK_RING:   'rgba(255,180,0,0.4)',

    // UI
    UI_GOLD:       '#d4a017',
    UI_PARCHMENT:  '#c8b28a',
    UI_DARK:       '#1a1208',
    UI_GREEN:      '#2a5a1a',
    UI_RED:        '#8b1a1a',
    UI_BOSS:       '#5a0a0a',
  },

  // ── Player ────────────────────────────────────────────────
  PLAYER: {
    RADIUS:        16,
    SPEED:         220,           // px/s walk
    SPRINT_MULT:   1.7,
    DODGE_DIST:    120,
    DODGE_DUR:     0.25,          // seconds
    DODGE_CD:      0.9,
    HP_MAX:        100,
    STAMINA_MAX:   100,
    STAMINA_REGEN: 25,            // per second
    STAMINA_SPRINT:20,            // per second cost
    STAMINA_DODGE: 30,            // flat cost
  },

  // ── Combat ────────────────────────────────────────────────
  COMBAT: {
    ATTACK_RANGE:  70,
    ATTACK_DAMAGE: 20,
    ATTACK_CD:     0.45,
    HEAVY_RANGE:   80,
    HEAVY_DAMAGE:  45,
    HEAVY_CD:      1.2,
    COMBO_WINDOW:  0.6,           // s between combo hits
    COMBO_MULT:    [1.0, 1.2, 1.5],
    KNOCKBACK:     90,
    HIT_STUN:      0.18,
    IFRAMES:       0.35,          // player invincibility after hit
  },

  // ── Enemy Base ────────────────────────────────────────────
  ENEMY: {
    SOLDIER: {
      RADIUS:     14,
      SPEED:      110,
      HP:         40,
      DAMAGE:     8,
      ATTACK_RANGE: 50,
      ATTACK_CD:  1.2,
      DETECT_R:   280,
      LOSE_R:     400,
      SCORE:      10,
    },
    RIFLEMAN: {
      RADIUS:     13,
      SPEED:      90,
      HP:         30,
      DAMAGE:     14,
      ATTACK_RANGE: 180,    // ranged
      ATTACK_CD:  2.0,
      DETECT_R:   340,
      LOSE_R:     450,
      SCORE:      15,
      RANGED:     true,
      PREFERRED_DIST: 150, // tries to stay at this distance
    },
    BOSS: {
      RADIUS:     24,
      SPEED:      100,
      HP:         320,
      DAMAGE:     20,
      CHARGE_DAMAGE: 35,
      ATTACK_RANGE: 70,
      ATTACK_CD:  0.9,
      DETECT_R:   500,
      LOSE_R:     600,
      SCORE:      200,
      PHASE2_HP:  160,      // triggers aggression phase
    },
  },

  // ── AI ────────────────────────────────────────────────────
  AI: {
    PATH_INTERVAL: 0.5,     // seconds between path recalculate
    GROUP_SPACING: 40,
    WANDER_RADIUS: 80,
    WANDER_INTERVAL: 2.5,
  },

  // ── Waves & Events ────────────────────────────────────────
  WAVE: {
    WAVE_DEFS: [
      { soldiers: 4, riflemen: 0, label: 'First Skirmish' },
      { soldiers: 4, riflemen: 2, label: 'Italian Advance' },
      { soldiers: 5, riflemen: 3, label: 'The Push' },
      { soldiers: 3, riflemen: 2, boss: true, label: 'General Albertone' },
    ],
    SPAWN_DIST_MIN: 600,
    SPAWN_DIST_MAX: 900,
  },

  // ── Particles ────────────────────────────────────────────
  PARTICLE: {
    HIT_COUNT:   6,
    DUST_COUNT:  4,
    LIFE_MIN:    0.15,
    LIFE_MAX:    0.5,
  },

  // ── Map ──────────────────────────────────────────────────
  MAP: {
    ROCK_COUNT:  28,
    HILL_COUNT:  14,
    TREE_COUNT:  20,
    BUSH_COUNT:  16,
  },
};

// ── Input Key Map ─────────────────────────────────────────
const KEYS = {
  MOVE_UP:    ['KeyW', 'ArrowUp'],
  MOVE_DOWN:  ['KeyS', 'ArrowDown'],
  MOVE_LEFT:  ['KeyA', 'ArrowLeft'],
  MOVE_RIGHT: ['KeyD', 'ArrowRight'],
  SPRINT:     ['ShiftLeft', 'ShiftRight'],
  DODGE:      ['Space'],
  ATTACK:     ['KeyJ'],
  HEAVY:      ['KeyK'],
  PAUSE:      ['KeyP', 'Escape'],
};
