// ============================================================
//  CONSTANTS — Battle of Adwa
//  Centralised game config. Tweak here first when balancing.
// ============================================================

const C = {
  // ── Canvas & World ────────────────────────────────────────
  WORLD_W: 2400,
  WORLD_H: 2400,
  TILE: 40,

  // ── Pseudo-3D Camera & Rendering ─────────────────────────
  CAMERA: {
    TILT: 0.60,   // Y-axis compression (1=top-down, 0=side-view)
    ELEV_SCALE: 1.10,   // screen pixels per elevation unit
    PERSP_MULT: 0.12,   // perspective size boost near camera bottom
    // Directional light: NW direction (normalised)
    LIGHT: { x: -0.45, y: -0.72, z: 0.52 },
    SHADOW_ALPHA: 0.38,
    SHADOW_STRETCH: 1.55, // how elongated blob shadows are (X * this)
  },

  // ── Terrain Elevation Ranges ──────────────────────────────
  ELEV: {
    FLAT: 0,
    HILL_MIN: 30,
    HILL_MAX: 70,
    ROCK_MIN: 8,
    ROCK_MAX: 24,
    TREE_BASE: 0,
  },

  // ── Ethiopian Palette ─────────────────────────────────────
  COLOR: {
    // Terrain
    GROUND_BASE: '#c8a96e',
    GROUND_DARK: '#8b6914',
    GROUND_ROCK: '#6b5a3e',
    HILL_LOW: '#a07840',
    HILL_MID: '#7a5c28',
    HILL_HIGH: '#5a3e18',
    GRASS: '#6b7c3a',
    PATH: '#d4b97a',
    SKY_TOP: '#1a3a5c',
    SKY_BOT: '#c4763a',

    // Player
    PLAYER_BODY: '#1a0a00',
    PLAYER_CAPE: '#6b0a0a',
    PLAYER_SHIELD: '#c08030',
    PLAYER_SWORD: '#c0c0a0',

    // Enemy
    ENEMY_SOLDIER: '#3a4a2a',
    ENEMY_OFFICER: '#5a3010',
    ENEMY_BOSS: '#1a1a2a',

    // Combat
    HIT_SPARK: '#ffe060',
    BLOOD: '#8b0000',
    ATTACK_RING: 'rgba(255,180,0,0.4)',

    // UI
    UI_GOLD: '#d4a017',
    UI_PARCHMENT: '#c8b28a',
    UI_DARK: '#1a1208',
    UI_GREEN: '#2a5a1a',
    UI_RED: '#8b1a1a',
    UI_BOSS: '#5a0a0a',
  },

  // ── Player ────────────────────────────────────────────────
  PLAYER: {
    RADIUS: 16,
    SPEED: 220,
    SPRINT_MULT: 1.7,
    DODGE_DIST: 120,
    DODGE_DUR: 0.25,
    DODGE_CD: 0.9,
    HP_MAX: 100,
    STAMINA_MAX: 100,
    STAMINA_REGEN: 25,
    STAMINA_SPRINT: 20,
    STAMINA_DODGE: 30,
  },

  // ── Combat ────────────────────────────────────────────────
  COMBAT: {
    ATTACK_RANGE: 70,
    ATTACK_DAMAGE: 20,
    ATTACK_CD: 0.45,
    HEAVY_RANGE: 80,
    HEAVY_DAMAGE: 45,
    HEAVY_CD: 1.2,
    COMBO_WINDOW: 0.6,
    COMBO_MULT: [1.0, 1.2, 1.5],
    KNOCKBACK: 90,
    HIT_STUN: 0.18,
    IFRAMES: 0.35,
  },

  // ── Enemy Base ────────────────────────────────────────────
  ENEMY: {
    SOLDIER: {
      RADIUS: 14,
      SPEED: 110,
      HP: 40,
      DAMAGE: 8,
      ATTACK_RANGE: 50,
      ATTACK_CD: 1.2,
      DETECT_R: 280,
      LOSE_R: 400,
      SCORE: 10,
    },
    RIFLEMAN: {
      RADIUS: 13,
      SPEED: 90,
      HP: 30,
      DAMAGE: 14,
      ATTACK_RANGE: 180,
      ATTACK_CD: 2.0,
      DETECT_R: 340,
      LOSE_R: 450,
      SCORE: 15,
      RANGED: true,
      PREFERRED_DIST: 150,
    },
    BOSS: {
      RADIUS: 24,
      SPEED: 100,
      HP: 320,
      DAMAGE: 20,
      CHARGE_DAMAGE: 35,
      ATTACK_RANGE: 70,
      ATTACK_CD: 0.9,
      DETECT_R: 500,
      LOSE_R: 600,
      SCORE: 200,
      PHASE2_HP: 160,
    },
  },

  // ── AI ────────────────────────────────────────────────────
  AI: {
    PATH_INTERVAL: 0.5,
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

  // ── Particles ─────────────────────────────────────────────
  PARTICLE: {
    HIT_COUNT: 6,
    DUST_COUNT: 4,
    LIFE_MIN: 0.15,
    LIFE_MAX: 0.5,
  },

  // ── Map ───────────────────────────────────────────────────
  MAP: {
    ROCK_COUNT: 28,
    HILL_COUNT: 14,
    TREE_COUNT: 20,
    BUSH_COUNT: 16,
  },
};

// ── Input Key Map ─────────────────────────────────────────
const KEYS = {
  MOVE_UP: ['KeyW', 'ArrowUp'],
  MOVE_DOWN: ['KeyS', 'ArrowDown'],
  MOVE_LEFT: ['KeyA', 'ArrowLeft'],
  MOVE_RIGHT: ['KeyD', 'ArrowRight'],
  SPRINT: ['ShiftLeft', 'ShiftRight'],
  DODGE: ['Space'],
  ATTACK: ['KeyJ'],
  HEAVY: ['KeyK'],
  PAUSE: ['KeyP', 'Escape'],
};
