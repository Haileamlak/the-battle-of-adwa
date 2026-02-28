// ============================================================
//  CONSTANTS — Battle of Adwa  (side-scrolling platformer)
// ============================================================
const C = {
  // ── Endless World Configuration ──────────────────────────
  CHUNK_SIZE: 1800,    // Width of one procedural segment
  VIEW_DISTANCE: 2,    // Number of chunks to keep ahead/behind
  PROGRESSION: {
    DIFF_STEP: 1500,   // Distance in px to increase difficulty
    HP_GROWTH: 0.12,   // +12% HP per step
    DMG_GROWTH: 0.08,  // +8% DMG per step
    SPAWN_INC: 0.10,   // +10% more enemies per step
  },
  WORLD_H: 930,
  GROUND_Y: 730,

  // ── Side-view camera ──────────────────────────────────────
  CAMERA: {
    LEAD_X: 0.35,  // player screen X ratio 
    LEAD_Y: 0.58,  // player screen Y ratio
    LERP_X: 0.97,
    LERP_Y: 0.92,
    SHAKE_DECAY: 7.0,
  },

  // ── Physics ───────────────────────────────────────────────
  GRAVITY: 3400,
  TERMINAL_V: 3400,

  // ── Ethiopian Palette ─────────────────────────────────────
  COLOR: {
    SKY_TOP: '#0c1824',
    SKY_MID: '#38250e',
    SKY_BOT: '#c8741c',
    HORIZON: '#e8a040',

    MTN_FAR: '#1e1a2e',
    MTN_MID: '#3a2e1e',
    MTN_NEAR: '#5a4020',
    MTN_HILLS: '#4a5820',

    GROUND: '#c8a06a',
    GROUND_DARK: '#7a5820',
    ROCK_TOP: '#b09060',
    ROCK_FACE: '#5a4028',
    ROCK_EDGE: '#d4b878',
    GRASS: '#58701e',
    PATH: '#d4b878',

    PLAYER_BODY: '#1a0a00',
    PLAYER_CAPE: '#7b0a0a',
    PLAYER_SHIELD: '#c08030',
    PLAYER_SWORD: '#c8c8a0',
    PLAYER_WRAP: '#ffe090',

    ENEMY_COAT: '#3a4a28',
    ENEMY_SKIN: '#c8a068',
    ENEMY_BOSS: '#1a2030',

    HIT_SPARK: '#ffe060',
    BLOOD: '#8b0000',
    MUZZLE: '#ffffaa',

    UI_GOLD: '#d4a017',
    UI_PARCHMENT: '#c8b28a',
    UI_DARK: '#1a1208',
    UI_GREEN: '#2a5a1a',
    UI_RED: '#8b1a1a',
  },

  // ── Player ────────────────────────────────────────────────
  PLAYER: {
    RADIUS: 18,
    SPEED: 225,
    SPRINT_MULT: 1.68,
    JUMP_FORCE: 1450,
    DBL_JUMP: 1100,
    COYOTE_TIME: 0.10,
    JUMP_BUFFER: 0.12,
    DODGE_DIST: 155,
    DODGE_DUR: 0.21,
    DODGE_CD: 0.85,
    HP_MAX: 100,
    STAMINA_MAX: 100,
    STAMINA_REGEN: 28,
    STAMINA_SPRINT: 22,
    STAMINA_DODGE: 28,
  },

  // ── Combat ────────────────────────────────────────────────
  COMBAT: {
    ATTACK_RANGE: 88,
    ATTACK_DAMAGE: 20,
    ATTACK_CD: 0.38,
    ATTACK_DUR: 0.20,
    HEAVY_RANGE: 112,
    HEAVY_DAMAGE: 44,
    HEAVY_CD: 1.10,
    HEAVY_DUR: 0.30,
    COMBO_WINDOW: 0.55,
    COMBO_MULT: [1.0, 1.3, 1.7],
    KNOCKBACK_X: 230,
    KNOCKBACK_Y: -290,
    HEAVY_KBX: 340,
    HEAVY_KBY: -400,
    HIT_STUN: 0.17,
    IFRAMES: 0.34,
    PROJ_SPEED: 420,
    PROJ_DAMAGE: 14,
    PROJ_LIFE: 2.2,
    PROJ_GRAVITY: 600,
  },

  // ── Enemies ───────────────────────────────────────────────
  ENEMY: {
    SOLDIER: {
      RADIUS: 16,
      SPEED: 108,
      HP: 40,
      DAMAGE: 10,
      ATTACK_RANGE: 62,
      ATTACK_CD: 0.90,
      DETECT_R: 340,
      LOSE_R: 520,
      SCORE: 10,
      JUMP_FORCE: 720,
    },
    RIFLEMAN: {
      RADIUS: 14,
      SPEED: 82,
      HP: 28,
      DAMAGE: 15,
      ATTACK_RANGE: 360,
      ATTACK_CD: 1.6,
      DETECT_R: 420,
      LOSE_R: 640,
      SCORE: 15,
      JUMP_FORCE: 680,
      PREFERRED_DIST: 220,
    },
    BOSS: {
      RADIUS: 30,
      SPEED: 135,
      CHARGE_SPEED: 500,
      HP: 370,
      DAMAGE: 24,
      CHARGE_DAMAGE: 40,
      ATTACK_RANGE: 95,
      ATTACK_CD: 0.82,
      DETECT_R: 800,
      SCORE: 300,
      PHASE2_HP: 185,
      JUMP_FORCE: 780,
    },
  },

  // ── Waves ─────────────────────────────────────────────────
  WAVE: {
    WAVE_DEFS: [
      { soldiers: 4, riflemen: 0, label: 'Italian Scouts' },
      { soldiers: 3, riflemen: 2, label: 'First Column Advance' },
      { soldiers: 5, riflemen: 3, label: 'Albertone Pushes Forward' },
      { soldiers: 2, riflemen: 2, boss: true, label: 'General Albertone' },
    ],
  },

  // ── AI ────────────────────────────────────────────────────
  AI: {
    PATROL_DIST: 180,
    GROUP_SPACING: 44,
    JUMP_DY: 100,
    WANDER_INTERVAL: 3.0,
  },

  // ── Particles ─────────────────────────────────────────────
  PARTICLE: {
    HIT_COUNT: 7,
    DUST_COUNT: 4,
    LIFE_MIN: 0.14,
    LIFE_MAX: 0.52,
  },
};

const KEYS = {
  MOVE_LEFT: ['KeyA', 'ArrowLeft'],
  MOVE_RIGHT: ['KeyD', 'ArrowRight'],
  JUMP: ['KeyW', 'ArrowUp', 'Space'],
  DOWN: ['KeyS', 'ArrowDown'],
  SPRINT: ['ShiftLeft', 'ShiftRight'],
  DODGE: ['KeyQ'],
  ATTACK: ['KeyJ'],
  HEAVY: ['KeyK'],
  PAUSE: ['KeyP', 'Escape'],
};
