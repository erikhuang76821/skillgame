// BladeOath (暫名) — deterministic rules, v5: a side-scrolling brawler (spec gdd/05).
// No rendering, no wall clock, no unseeded randomness (RULE-SIM-PURITY). Same seed + same input bytes + same choices
// = same score. Only + - * /, Math.trunc / floor / sqrt and the core tables: identical on every JS engine.
//
// v5 in one paragraph: every stage is a long strip. x runs along the scroll (left to right), y is depth (0 = far,
// DEPTH = near the camera), z is height above the floor. The camera only moves right; walking into a fight zone
// ("wave") locks it until the wave is down. Facing is left or right. A hit needs the target on the same line
// (depth within DEPTH_HIT) and in front within the move's length. The move timelines of v3 stay (startup / active /
// recovery, lunge, armor, cancel windows, poise, posture), as do the three glows, parry, perfect dodge, interrupt and
// execution. New: jump and the air slash, grabs and throws, obstacles and breakables with fixed drops, a route choice.
import { makeRng, createHasher, TPS, ONE, DX, DY } from './core/index.js';

export { TICK_MS } from './core/index.js';

// ---------------------------------------------------------------- §0 meta
export const MATCH_TICKS = 25200;
export const MAX_CHOICES = 300;
export const VIEW_W = 480;
export const VIEW_H = 270;
export const DEPTH = 96;
export const FLOOR_TOP = 150;
const PX = ONE;

// ---------------------------------------------------------------- §2 input byte
export const IN_DIR = 7;
export const IN_MOVE = 8;
export const ACT_SHIFT = 4;
export const ACT_ATTACK = 1, ACT_BLOCK = 2, ACT_DODGE = 3;
export const ACT_SKILL1 = 4, ACT_SKILL2 = 5, ACT_SKILL3 = 6, ACT_SKILL4 = 7;
export const ACT_ESCAPE = 8, ACT_INTERACT = 9, ACT_JUMP = 10;
export const BUFFER_TICKS = 8;
export const encodeInput = (dir, act = 0) => (dir >= 0 ? (dir & IN_DIR) | IN_MOVE : 0) | ((act & 15) << ACT_SHIFT);

// ---------------------------------------------------------------- §3 random streams (never renumber)
const rng = makeRng({ spawn: 1, combo: 2, enter: 3, look: 4 });

// ---------------------------------------------------------------- §5.0 physics & hit constants
export const FRICTION = 200;
export const KNOCK_SCALE = 16;
export const SLAM_SPEED = 768;
export const SLAM_DMG = 10;
export const SLAM_STUN = 45;
export const SEPARATE_PCT = 50;
export const CLASH_PUSH = 120;
export const CLASH_POSTURE = 10;
export const GRAVITY = 48;
export const LAND_STUN = 20;
export const DASH_STRIKE_WIN = 8;
export const DEPTH_HIT = 10;
export const HIT_Z = 24;

// ---------------------------------------------------------------- §5.1 movement & scroll
export const MOVE_SPD = 384;
export const FACE_LOCK_TICKS = 6;
export const CAM_LEAD = 200;
export const EDGE_PAD = 12;

// ---------------------------------------------------------------- §5.3–§5.7
export const BLOCK_ACTIVE = 30;
export const PARRY_WIN = 8;
export const BLOCK_CD = 90;
export const PARRY_CD_REFUND = 75;
export const BLOCK_DMG_PCT = 20;
export const PARRY_POSTURE_PCT = 150;
export const QI_PARRY = 15;

export const DODGE_TICKS = 20;
export const DODGE_IFRAME_FROM = 1;
export const DODGE_IFRAME_TO = 12;
export const PERFECT_DODGE_WIN = 6;
export const DODGE_STA = 250;
export const COUNTER_WIN = 40;
export const QI_PERFECT = 20;

export const INTERRUPT_STUN = 90;
export const INTERRUPT_POSTURE_PCT = 40;
export const QI_INTERRUPT = 20;

export const ESCAPE_CD = 1200;
export const ESCAPE_IFRAME = 20;
export const HITSTUN = 20;
export const CONTROL_TICKS = 60;
export const CONTROL_CAP = 90;
export const CONTROL_IFRAME = 30;
export const FOE_ESCAPE_AT = 20;
export const FOE_ESCAPE_CD = 1500;
export const DEFLECT_STUN = 18;

export const FORGE_DMG_PCT = 10;
export const BACK_POSTURE_PCT = 200;
export const POSTURE_REGEN_DELAY = 90;
export const POSTURE_REGEN = 1;
export const BROKEN_TICKS = 120;
export const EXEC_PCT = 40;
export const HP_BASE = 100;
export const STA_MAX = 1000;
export const STA_REGEN = 6;
export const STA_DELAY = 30;
export const POSTURE_BASE = 100;
export const QI_BASE = 100;

export const WINDUP_WHITE_MIN = 18;
export const WINDUP_GOLD_MIN = 60;
export const WINDUP_RED_MIN = 24;

// ---------------------------------------------------------------- §5.9 AI
export const FOE_GAP = 36;
const FOE_GAP_ELITE = 28, FOE_GAP_BOSS = 20;
export const MAX_ATTACKERS = 2;
export const FOE_TURN = 12;
export const WAIT_GAP = 64;
export const ENTER_SPREAD = 90;

// ---------------------------------------------------------------- §5.11–§5.12
export const LEVEL_CAP = 10;
export const XP_TABLE = Object.freeze([80, 120, 170, 230, 300, 380, 470, 570, 680]);
export const XP_DECAY_PCT = Object.freeze([100, 50, 25, 0]);
export const FORGE_COST = Object.freeze([3, 5, 8]);

// ---------------------------------------------------------------- §5.16–§5.19
export const JUMP_VZ = 1024;
export const JUMP_STA = 120;
export const JUMP_LAND = 6;
export const GRAB_PUSH = 10;
export const GRAB_TICKS = 90;
export const GRAB_HITS = 3;
export const THROW_FORCE = 260;
export const THROW_DMG = 15;
export const WAVE_LOCK = 480;
export const GO_DELAY = 30;

// ---------------------------------------------------------------- §6 scoring
export const BOSS_PTS = 2000;
export const FINAL_PTS = 5000;
export const TIME_PTS = 10;
export const PARRY_PTS = 30;
export const PERFECT_PTS = 30;
export const INTERRUPT_PTS = 60;
export const EXEC_PTS = 80;
const EXEC_PTS_MINION = 20;
export const TECH_CAP = 60;
const INTERRUPT_CAP = 30, EXEC_CAP = 30;
// (this chapter has one middle boss: 2000 + 5000 + 4200 + 7800 = 19,000; the full chapter's 21,000 is in gdd/05 §6.)
export const SCORE_MAX = BOSS_PTS + FINAL_PTS + (MATCH_TICKS / TPS) * TIME_PTS
  + TECH_CAP * PARRY_PTS + TECH_CAP * PERFECT_PTS + INTERRUPT_CAP * INTERRUPT_PTS + EXEC_CAP * EXEC_PTS;

// ---------------------------------------------------------------- facing: 0 = right, 128 = left
export const FACE_RIGHT = 0, FACE_LEFT = 128;
/** +1 facing right, −1 facing left. */
export const fdir = face => (face === FACE_LEFT ? -1 : 1);
const faceOf = d => (d < 0 ? FACE_LEFT : FACE_RIGHT);
/** Is an attacker at x `ax` behind a body at `tx` facing `face`? (on the side it is not facing) */
export const behind = (face, tx, ax) => (ax - tx) * fdir(face) < 0;
const inFront = (face, tx, ax) => (ax - tx) * fdir(face) >= 0;
const sgn = v => (v > 0 ? 1 : v < 0 ? -1 : 0);

// ---------------------------------------------------------------- move timelines (§5.0, gdd/12 §3)
// w startup, a active, r recovery (ticks). v5 hit shape: from the attacker along its facing, `len` px (both = also
// behind it); the target must be on the same line (|Δy| ≤ DEPTH_HIT + its radius / 2) and its z ≤ zHi (low: only z = 0).
// force = knockback and interrupt power (vs poise); every = re-hit period; lunge = px moved forward during the active
// ticks; back = px stepped back at the start; track = startup ticks still turning toward the target; armor = super
// armor during startup + active; iframe = invulnerable ticks from the active start; cancel = recovery tick from which
// a dodge / the next combo hit / a skill may cut the recovery. reach / dash are kept for bots and telegraphs.
const mv = o => {
  const m = { w: 0, a: 1, r: 0, dmg: 0, pos: 0, force: 0, glow: 0, brk: false, len: 20, both: false, zHi: HIT_Z, low: false,
    lunge: 0, back: 0, iframe: 0, every: 0, launch: 0, knock: false, armor: false, stance: false, cd: 0, qi: 0, track: 0,
    cancel: { dodge: 99, combo: 99, skill: 99 }, ...o };
  m.reach = m.len; m.dash = m.lunge; m.aoe = m.both;
  return Object.freeze(m);
};

export const COMBO = Object.freeze([
  mv({ name: '一段', w: 6, a: 4, r: 14, dmg: 8, pos: 6, force: 60, len: 26, lunge: 10, cancel: { dodge: 8, combo: 6, skill: 8 } }),
  mv({ name: '二段', w: 6, a: 4, r: 14, dmg: 8, pos: 6, force: 60, len: 26, lunge: 10, cancel: { dodge: 8, combo: 6, skill: 8 } }),
  mv({ name: '三段', w: 8, a: 4, r: 20, dmg: 12, pos: 10, force: 140, len: 30, lunge: 16, cancel: { dodge: 14, combo: 99, skill: 14 } }),
]);
export const DASH_STRIKE = mv({ name: '回身斬', w: 4, a: 6, r: 14, dmg: 10, pos: 10, force: 100, len: 28, both: true, cancel: { dodge: 10, combo: 99, skill: 10 } });
export const AIR_SLASH = mv({ name: '跳斬', w: 3, a: 6, r: 4, dmg: 10, pos: 10, force: 100, len: 24, zHi: 999, knock: true });
// Sword school, spec §5.5. Indices 0–1 unlocked at the start; 2–5 by sword-tree nodes 8–11.
export const SKILLS = Object.freeze([
  mv({ name: '疾刺', w: 5, a: 6, r: 14, dmg: 10, pos: 8, force: 80, brk: true, len: 10, lunge: 64, iframe: 6, cd: 180, cancel: { dodge: 8, combo: 99, skill: 99 } }),
  mv({ name: '點穴', w: 3, a: 2, r: 16, dmg: 4, pos: 4, force: 30, brk: true, len: 22, cd: 120, cancel: { dodge: 8, combo: 99, skill: 99 } }),
  mv({ name: '回風', w: 8, a: 4, r: 12, dmg: 10, pos: 10, force: 90, len: 28, back: 32, cd: 240, qi: 10, cancel: { dodge: 6, combo: 99, skill: 99 } }),
  mv({ name: '連星', w: 6, a: 12, r: 16, dmg: 6, pos: 6, force: 40, len: 28, every: 4, cd: 300, qi: 20, cancel: { dodge: 8, combo: 99, skill: 99 } }),
  mv({ name: '劍幕', w: 2, a: 24, r: 10, stance: true, cd: 480, qi: 25, len: 0 }),
  mv({ name: '流光', w: 12, a: 20, r: 14, dmg: 12, pos: 6, force: 50, brk: true, len: 120, cd: 360, qi: 30, cancel: { dodge: 8, combo: 99, skill: 99 } }),
]);

// Foe moves: white tracks until 8 ticks before the hit, gold / red until 10 ticks before (then commits); red = armor.
const F = glow => o => mv({ glow, track: Math.max(0, o.w - (glow ? 10 : 8)), armor: glow === 2, ...o });
const W = F(0), G = F(1), R = F(2);
// `air` = the anti-air move an elite or boss uses when the player jumps within its reach (§5.9 rule 7).
export const FOES = Object.freeze([
  { name: '屍兵', kind: 0, hp: 40, pos: 30, xp: 20, ore: 1, spd: 256, guard: true, r: 6, mass: 1, poise: 40,
    pool: [W({ name: '揮砍', w: 26, a: 4, r: 22, dmg: 10, pos: 10, force: 70, len: 22 }),
      W({ name: '揮砍', w: 26, a: 4, r: 22, dmg: 10, pos: 10, force: 70, len: 22 }),
      W({ name: '撲擊', w: 28, a: 6, r: 26, dmg: 12, pos: 12, force: 90, len: 8, lunge: 32 })] },
  { name: '蠱蟲', kind: 0, hp: 16, pos: 10, xp: 8, ore: 0, spd: 384, guard: false, r: 4, mass: 1, poise: 10,
    pool: [W({ name: '啃咬', w: 24, a: 3, r: 24, dmg: 6, pos: 6, force: 30, len: 16, zHi: 8 })] },
  { name: '蠱師', kind: 0, hp: 50, pos: 40, xp: 40, ore: 1, spd: 224, guard: true, r: 6, mass: 1, poise: 40,
    pool: [G({ name: '吐蠱', w: 90, a: 8, r: 24, dmg: 18, pos: 16, force: 80, len: 64 }),
      W({ name: '揮杖', w: 24, a: 4, r: 22, dmg: 10, pos: 10, force: 70, len: 24 })] },
  { name: '屍傀力士', kind: 0, hp: 70, pos: 60, xp: 60, ore: 2, spd: 224, guard: false, r: 9, mass: 3, poise: 120,
    pool: [R({ name: '衝撞', w: 34, a: 10, r: 30, dmg: 18, pos: 20, force: 160, len: 12, lunge: 72, launch: 480 }),
      W({ name: '重拳', w: 28, a: 5, r: 24, dmg: 14, pos: 14, force: 120, len: 22 }),
      R({ name: '掃地', w: 32, a: 6, r: 30, dmg: 16, pos: 16, force: 140, len: 30, both: true, low: true, launch: 480 })] },
  { name: '蠱母', kind: 1, hp: 360, pos: 150, xp: 200, ore: 4, spd: 256, guard: true, escape: true, r: 10, mass: 4, poise: 150,
    pool: [W({ name: '噬咬', w: 20, a: 4, r: 20, dmg: 14, pos: 12, force: 90, len: 24 }),
      W({ name: '噬咬', w: 20, a: 4, r: 20, dmg: 14, pos: 12, force: 90, len: 24 }),
      G({ name: '蠱霧', w: 120, a: 10, r: 26, dmg: 22, pos: 20, force: 100, len: 40, both: true }),
      R({ name: '甩尾', w: 26, a: 6, r: 28, dmg: 18, pos: 16, force: 150, len: 34, both: true, low: true, launch: 480 })],
    air: W({ name: '仰噬', w: 20, a: 6, r: 20, dmg: 12, pos: 10, force: 90, len: 26, zHi: 64 }) },
  { name: '屍傀將', kind: 2, hp: 900, pos: 300, xp: 400, ore: 0, spd: 256, guard: true, escape: true, r: 12, mass: 8, poise: 9999,
    pool: [W({ name: '斬', w: 20, a: 4, r: 18, dmg: 16, pos: 14, force: 100, len: 28 }),
      W({ name: '回斬', w: 22, a: 4, r: 20, dmg: 16, pos: 14, force: 100, len: 28 }),
      W({ name: '突', w: 24, a: 6, r: 24, dmg: 18, pos: 16, force: 120, len: 10, lunge: 48 }),
      G({ name: '裂地斬', w: 90, a: 8, r: 30, dmg: 30, pos: 30, force: 160, len: 56 })],
    air: W({ name: '上挑', w: 20, a: 6, r: 22, dmg: 14, pos: 12, force: 100, len: 30, zHi: 64 }) },
  { name: '墮仙', kind: 2, hp: 1300, pos: 450, xp: 0, ore: 0, spd: 288, guard: true, escape: true, final: true, r: 12, mass: 8, poise: 9999,
    pool: [W({ name: '劍落', w: 20, a: 4, r: 18, dmg: 13, pos: 14, force: 100, len: 30 }),
      W({ name: '橫掃', w: 22, a: 4, r: 20, dmg: 13, pos: 14, force: 100, len: 30 }),
      W({ name: '刺', w: 18, a: 4, r: 20, dmg: 11, pos: 12, force: 90, len: 34 }),
      G({ name: '墮光', w: 80, a: 8, r: 28, dmg: 22, pos: 30, force: 150, len: 64 }),
      G({ name: '咒縛', w: 100, a: 10, r: 26, dmg: 18, pos: 26, force: 100, len: 44, both: true }),
      R({ name: '天墜', w: 30, a: 8, r: 30, dmg: 20, pos: 24, force: 150, len: 40, both: true, launch: 480 }),
      R({ name: '貫心', w: 28, a: 8, r: 28, dmg: 18, pos: 22, force: 160, len: 10, lunge: 80, launch: 480 })],
    phase2: [W({ name: '劍落・二', w: 18, a: 8, r: 18, dmg: 11, pos: 14, force: 90, len: 30, every: 4 }),
      W({ name: '橫掃・二', w: 20, a: 8, r: 20, dmg: 11, pos: 14, force: 90, len: 30, every: 4 }),
      W({ name: '刺・二', w: 18, a: 8, r: 20, dmg: 10, pos: 12, force: 90, len: 34, every: 4 }),
      G({ name: '墮光', w: 80, a: 8, r: 28, dmg: 22, pos: 30, force: 150, len: 64 }),
      G({ name: '咒縛', w: 100, a: 10, r: 26, dmg: 18, pos: 26, force: 100, len: 44, both: true }),
      R({ name: '天墜', w: 30, a: 8, r: 30, dmg: 20, pos: 24, force: 150, len: 40, both: true, launch: 480 }),
      R({ name: '貫心', w: 28, a: 8, r: 28, dmg: 18, pos: 22, force: 160, len: 10, lunge: 80, launch: 480 }),
      R({ name: '墮仙域', w: 36, a: 10, r: 34, dmg: 21, pos: 26, force: 170, len: 64, both: true, low: true, launch: 480 })],
    air: W({ name: '昇劍', w: 18, a: 6, r: 20, dmg: 12, pos: 12, force: 100, len: 30, zHi: 64 }) },
]);
export const T_SOLDIER = 0, T_BUG = 1, T_CASTER = 2, T_BRUTE = 3, T_MOTHER = 4, T_GENERAL = 5, T_FALLEN = 6;
const PLAYER_R = 6 * PX, PLAYER_MASS = 2;

// ---------------------------------------------------------------- stages (§5.14, §5.18; constant, never the match seed)
// Props: kind 0 酒罈, 1 木箱, 2 石燈, 3 斷碑. Breakables drop a fixed item: 0 肉包 (+30 hp), 1 丹藥 (+30 qi), 2 鍛材.
export const PROPS = Object.freeze([
  { name: '酒罈', hp: 10, w: 12, d: 8 },
  { name: '木箱', hp: 20, w: 20, d: 12 },
  { name: '石燈', hp: 0, w: 12, d: 10 },
  { name: '斷碑', hp: 0, w: 24, d: 14 },
]);
export const ITEMS = Object.freeze([{ name: '肉包', hp: 30 }, { name: '丹藥', qi: 30 }, { name: '鍛材', ore: 1 }]);
const ITEM_R = 12 * PX;
const S0 = T_SOLDIER, S1 = T_BUG, S2 = T_CASTER, S3 = T_BRUTE;
// waves: cam = the locked screen's left edge (px); ys = each slot's depth; pool = the foe types the spawn stream deals
// onto those slots; unique = one elite / boss entering from the right.
// Built once from CHAPTER_SEED by hand-placing within the §5.18 rules, then written down here: the layout is data.
export const CHAPTER_SEED = 20261126;
export const STAGES = Object.freeze([
  { id: 'gate', name: '山門', len: 2400, tier: 1, next: -1,
    waves: [{ cam: 300, ys: [30, 66], pool: [S0, S1] },
      { cam: 900, ys: [20, 50, 80], pool: [S0, S1, S1] },
      { cam: 1440, ys: [26, 56, 84], pool: [S0, S0, S1] },
      { cam: 1920, ys: [18, 40, 62, 86], pool: [S0, S0, S1, S0] }],
    props: [[2, 560, 26], [0, 760, 72], [1, 1220, 64, 1], [3, 1680, 30], [0, 2180, 52]] },
  { id: 'forest', name: '蠱林', len: 2400, tier: 2, next: 3,
    waves: [{ cam: 300, ys: [24, 52, 80], pool: [S0, S0, S2] },
      { cam: 900, ys: [20, 50, 80], pool: [S0, S2, S2] },
      { cam: 1440, ys: [16, 40, 64, 88], pool: [S0, S0, S2, S2] },
      { cam: 1920, ys: [48], unique: { type: T_MOTHER, drop: { ore: 4 } } }],
    props: [[1, 620, 30, 2], [0, 1100, 78], [3, 1320, 44], [0, 1760, 20], [2, 2060, 70]] },
  { id: 'well', name: '枯井', len: 2000, tier: 2, next: 3,
    waves: [{ cam: 300, ys: [30, 70], pool: [S2, S1] },
      { cam: 860, ys: [24, 72], pool: [S2, S1] },
      { cam: 1400, ys: [30, 60, 86], pool: [S2, S1, S1] }],
    props: [[0, 520, 62], [1, 1020, 26, 1], [2, 1260, 52], [0, 1700, 72]],
    chest: { x: 1880, y: 40, ore: 3 } },
  { id: 'hall', name: '屍傀將殿', len: 960, tier: 4, next: 4,
    waves: [{ cam: 240, ys: [48], unique: { type: T_GENERAL, boss: 0, drop: { armor: 1 } } }],
    props: [[2, 300, 12], [2, 660, 12], [0, 520, 88]] },
  { id: 'cloister', name: '殿後迴廊', len: 2400, tier: 5, next: 5,
    // Red glows appear here for the first time: the first one comes alone (knowledge-base/16 §2.1).
    waves: [{ cam: 300, ys: [48], pool: [S3] },
      { cam: 900, ys: [24, 52, 80], pool: [S3, S2, S0] },
      { cam: 1440, ys: [20, 48, 76], pool: [S3, S2, S0] },
      { cam: 1920, ys: [24, 52, 80], pool: [S3, S3, S2] }],
    props: [[0, 620, 72], [1, 1020, 22, 2], [3, 1260, 56], [0, 1620, 30], [1, 2080, 62, 1]] },
  { id: 'terrace', name: '墮仙台', len: 960, tier: 6, next: -1,
    waves: [{ cam: 240, ys: [48], unique: { type: T_FALLEN, boss: 1 } }],
    props: [[2, 300, 12], [2, 660, 12]] },
]);
export const ROUTES = Object.freeze([1, 2]);      // route choice after the gate: 0 = 蠱林, 1 = 枯井
export const SHRINE_X = 40;                         // every stage opens with a sword mound here (px)
export const STAGE_END = 40;                        // walking within 40 px of the stage's right end leaves it
const WAVE_BASE = []; { let k = 0; for (const s of STAGES) { WAVE_BASE.push(k); k += s.waves.length; } }

// ---------------------------------------------------------------- equipment, tree (§5.11–§5.12)
export const ARMORS = Object.freeze([
  { name: '布衣', weight: 0, cut: 0, escapeCut: 0 },
  { name: '鎖甲', weight: 3, cut: 20, escapeCut: 0 },
]);
const SWORD_WEIGHT = 1;
export const NODES = Object.freeze(['氣血+20', '體力上限+200', '閃避距離+16', '卸勁窗口+2', '脫離冷卻-300', '內力上限+30', '架勢上限+30', '負重+1',
  '解鎖回風', '解鎖連星', '解鎖劍幕', '解鎖流光', '普攻架勢+25%', '劍招冷卻-15%']);
const has = (p, n) => (p.nodes >> n) & 1;
const unlocked = (p, s) => s < 2 || has(p, 6 + s);
const weightOf = p => SWORD_WEIGHT + ARMORS[p.armor].weight - has(p, 7);
const dodgeDist = p => (weightOf(p) <= 3 ? 64 : weightOf(p) <= 5 ? 48 : 32) + 16 * has(p, 2);
const parryWin = p => PARRY_WIN + 2 * has(p, 3);
const escapeCd = p => ESCAPE_CD - 300 * has(p, 4);
const skillCd = (p, s) => SKILLS[s].cd - Math.trunc((SKILLS[s].cd * 15 * has(p, 13)) / 100);
const recompute = p => {
  p.hpMax = HP_BASE + 20 * has(p, 0); p.staMax = STA_MAX + 200 * has(p, 1);
  p.qiMax = QI_BASE + 30 * has(p, 5); p.posMax = POSTURE_BASE + 30 * has(p, 6);
  p.hp = Math.min(p.hp, p.hpMax); p.sta = Math.min(p.sta, p.staMax); p.qi = Math.min(p.qi, p.qiMax);
  for (let i = 0; i < 4; i++) if (p.slots[i] >= 0 && !unlocked(p, p.slots[i])) p.slots[i] = -1;
};

// ---------------------------------------------------------------- state (§1)
export const S = Object.freeze({ IDLE: 0, MOVE: 1, WINDUP: 2, ACTIVE: 3, RECOVER: 4, BLOCK: 5, DODGE: 6, HITSTUN: 7, CONTROL: 8,
  BROKEN: 9, DOWN: 10, READY: 11, DEAD: 13, JUMP: 14, LAND: 15, GRAB: 16, HELD: 17 });
// Player move ids: 0..2 combo, 3 dash strike, 4 air slash, 10 + s sword skill s
export const MOVE_DASH = 3, MOVE_AIR = 4, MOVE_SKILL = 10;
export const playerMove = id => (id >= MOVE_SKILL ? SKILLS[id - MOVE_SKILL] : id === MOVE_DASH ? DASH_STRIKE : id === MOVE_AIR ? AIR_SLASH : COMBO[id]);

/** Every spawn slot of the chapter, in stage / wave order (only the seed decides types, entry sides and delays). */
export function layout(seed) {
  const out = [];
  STAGES.forEach((st, si) => st.waves.forEach((w, wi) => {
    const wave = WAVE_BASE[si] + wi;
    if (w.unique) { out.push({ stage: si, wave, type: w.unique.type, y: w.ys[0], side: 1, delay: 0, boss: w.unique.boss ?? -1, drop: w.unique.drop ?? null }); return; }
    const pool = rng.shuffle(seed, 'spawn', wave, w.pool);
    w.ys.forEach((y, i) => {
      const slot = out.length;
      out.push({ stage: si, wave, type: pool[i], y, side: rng.int(seed, 'enter', slot * 2, 2), delay: rng.int(seed, 'enter', slot * 2 + 1, ENTER_SPREAD), boss: -1, drop: null });
    });
  }));
  return out;
}

function makeFoe(slot, spec) {
  const f = FOES[spec.type];
  return { id: slot, slot, type: spec.type, kind: f.kind, boss: spec.boss, on: 0, wait: 0, inside: 0, x: 0, y: spec.y * PX, z: 0,
    vx: 0, vy: 0, vz: 0, kb: 0, face: FACE_LEFT, st: S.READY, stT: 0, mv: -1, mvT: 0, k: 0, i: 0, order: null, hp: f.hp, hpMax: f.hp,
    pos: 0, posT: 0, gap: FOE_GAP, cd: 0, iframe: 0, hit: 0, turnT: 0, phase: 1, alive: 1, phaseLock: 0, thrown: 0, tossed: -1, air: 0 };
}
const freshProps = s => STAGES[s].props.map(([kind, x, y, drop], id) => ({ id, kind, x: x * PX, y: y * PX, hp: PROPS[kind].hp || -1, drop: drop ?? 0 }));

export function createSim(seed) {
  seed >>>= 0;
  const plan = layout(seed);
  const p = { x: 0, y: 48 * PX, z: 0, vx: 0, vy: 0, vz: 0, jx: 0, jy: 0, kb: 0, face: FACE_RIGHT, st: S.IDLE, stT: 0, mv: -1, mvT: 0,
    hitMask: [], hp: HP_BASE, hpMax: HP_BASE, sta: STA_MAX, staMax: STA_MAX, staWait: 0, pos: 0, posMax: POSTURE_BASE, posT: 0,
    qi: 0, qiMax: QI_BASE, cd: [0, 0, 0, 0, 0, 0], iframe: 0, ctl: 0, counter: 0, combo: 0, lv: 1, xp: 0, sp: 0, nodes: 0,
    slots: [0, 1, -1, -1], armor: 0, armors: 1, forge: 0, ore: 0, buf: 0, bufT: 0, dodgeDir: 0, dodgeX: 0, dodgeY: 0, dodgeEnd: -999,
    perfectFrom: -1, blockT: 0, stun: 0, grab: -1, grabT: 0, grabHits: 0, push: 0, airAtk: 0 };
  const sim = {
    seed, tick: 0, over: 0, panel: 0, p, plan,
    foes: plan.map((s, i) => makeFoe(i, s)),
    slotKills: new Array(plan.length).fill(0),
    stage: 0, route: -1, cam: 0, wave: 0, waveOn: 0, goT: 0, shrine: 0, opened: 0, bossDown: 0, deaths: 0, props: [], items: [], itemSeq: 0,
    tech: { parry: 0, perfect: 0, interrupt: 0, exec: 0, parryPts: 0, perfectPts: 0, interruptPts: 0, execPts: 0 },
    bossPts: 0, timePts: 0,
    events: [], recordEvents: true,
  };
  enterStage(sim, 0);
  return sim;
}

const emit = (sim, ev) => { if (sim.recordEvents) sim.events.push(ev); };
export const bodyR = e => (e.type === undefined ? PLAYER_R : FOES[e.type].r * PX);
const massOf = e => (e.type === undefined ? PLAYER_MASS : FOES[e.type].mass);
export const stageLen = sim => STAGES[sim.stage].len * PX;
/** Global index of the stage's current wave. */
export const waveIndex = sim => WAVE_BASE[sim.stage] + sim.wave;

function enterStage(sim, s) {
  const p = sim.p;
  sim.stage = s; sim.cam = 0; sim.wave = 0; sim.waveOn = 0; sim.goT = 0; sim.shrine = s;
  sim.props = freshProps(s); sim.items = [];
  Object.assign(p, { x: (SHRINE_X + 24) * PX, y: 48 * PX, z: 0, vx: 0, vy: 0, vz: 0, kb: 0, face: FACE_RIGHT, st: S.IDLE, stT: 0, mv: -1 });
  emit(sim, { type: 'stageEnter', stage: s });
}

// ---------------------------------------------------------------- movement & physics (§5.0, §5.1, §5.18)
/** x limits for a body: the player stays on screen; a foe that has walked in stays inside a locked screen. */
function xBounds(sim, e) {
  if (e.type === undefined) return [sim.cam + EDGE_PAD * PX, sim.cam + (VIEW_W - EDGE_PAD) * PX];
  const r = bodyR(e);
  if (sim.waveOn && e.inside) return [sim.cam + r, sim.cam + VIEW_W * PX - r];
  return [-64 * PX, stageLen(sim) + 64 * PX];
}
const solid = pr => pr.hp !== 0;                      // unbreakables have hp −1, broken breakables 0
/** The prop whose footprint (grown by the body's radius; depth by half of it) contains (x, y), or null. */
function propAt(sim, x, y, r) {
  for (const pr of sim.props) {
    if (!solid(pr)) continue;
    const k = PROPS[pr.kind];
    if (Math.abs(x - pr.x) < (k.w >> 1) * PX + r && Math.abs(y - pr.y) < (k.d >> 1) * PX + (r >> 1)) return pr;
  }
  return null;
}
/** Move by (dx, dy) sub-pixels, axis by axis; returns what stopped it. */
function moveBy(sim, e, dx, dy) {
  const out = { blockedX: false, blockedY: false, prop: null };
  const r = bodyR(e), [lo, hi] = xBounds(sim, e);
  if (dx) {
    let nx = e.x + dx;
    // (a body that landed on a prop from the air is already inside it: let it walk out)
    const pr = e.z > 0 ? null : propAt(sim, nx, e.y, r);
    if (pr && propAt(sim, e.x, e.y, r) !== pr) { out.blockedX = true; out.prop = pr; nx = e.x; }
    if (nx < lo) { nx = Math.max(Math.min(e.x, lo), nx); if (nx < lo) nx = lo; out.blockedX = true; }
    if (nx > hi) { nx = Math.min(Math.max(e.x, hi), nx); if (nx > hi) nx = hi; out.blockedX = true; }
    e.x = nx;
  }
  if (dy) {
    let ny = e.y + dy;
    const pr = e.z > 0 ? null : propAt(sim, e.x, ny, r);
    if (pr && propAt(sim, e.x, e.y, r) !== pr) { out.blockedY = true; out.prop = out.prop || pr; ny = e.y; }
    if (ny < 0) { ny = 0; out.blockedY = true; }
    if (ny > DEPTH * PX) { ny = DEPTH * PX; out.blockedY = true; }
    e.y = ny;
  }
  return out;
}
/** Knockback along x: speed = force × KNOCK_SCALE / mass, toward `dir` (±1). */
function push(e, dir, force) {
  e.vx += dir * Math.trunc((force * KNOCK_SCALE) / massOf(e)); e.kb = 20;
}
/** Integrate velocity with friction; returns 'slam' or null. A knocked body that runs into a breakable chips it. */
function integrate(sim, e) {
  if (!e.vx && !e.vy) { if (e.kb > 0) e.kb--; return null; }
  const r = moveBy(sim, e, e.vx, e.vy);
  let what = null;
  if (e.kb > 0 && r.blockedX && Math.abs(e.vx) >= SLAM_SPEED) {
    if (r.prop && PROPS[r.prop.kind].hp) damageProp(sim, r.prop, 10);
    else what = 'slam';
  }
  if (r.blockedX) e.vx = 0;
  if (r.blockedY) e.vy = 0;
  e.vx = Math.trunc((e.vx * FRICTION) / 256); e.vy = Math.trunc((e.vy * FRICTION) / 256);
  if (e.kb > 0) e.kb--;
  return what;
}
const live = f => f.alive && f.on && f.wait === 0;
/** Bodies push each other apart (fixed order by id, so deterministic). */
function separate(sim) {
  const list = [sim.p];
  for (const f of sim.foes) if (live(f) && f.st !== S.HELD) list.push(f);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.z > 0 || b.z > 0) continue;
    const rr = bodyR(a) + bodyR(b), dx = b.x - a.x, dy = b.y - a.y, dd = dx * dx + dy * dy;
    if (dd >= rr * rr) continue;
    const d = Math.floor(Math.sqrt(dd));
    const over = Math.trunc(((rr - d) * SEPARATE_PCT) / 100), ma = massOf(a), mb = massOf(b);
    const ux = d ? Math.trunc((dx * ONE) / d) : ONE, uy = d ? Math.trunc((dy * ONE) / d) : 0;
    const ka = Math.trunc((over * mb) / (ma + mb)), kb = over - ka;
    moveBy(sim, a, -Math.trunc((ux * ka) / ONE), -Math.trunc((uy * ka) / ONE));
    moveBy(sim, b, Math.trunc((ux * kb) / ONE), Math.trunc((uy * kb) / ONE));
  }
}

// ---------------------------------------------------------------- hit shape (§5.0 v5)
/** Same line: depth difference within DEPTH_HIT plus half the target's radius. */
export const onLine = (ay, ty, tr) => Math.abs(ty - ay) <= DEPTH_HIT * PX + (tr >> 1);
/**
 * Does move `m` of attacker `a` reach a body at (tx, ty, tz) of radius tr? (px = where the attacker stood before this
 * tick's lunge: a lunging strike covers the whole stretch it travelled.)
 */
export function hitReaches(m, a, tx, ty, tz, tr, px = a.x) {
  if (!onLine(a.y, ty, tr)) return false;
  if (m.low ? tz > 0 : tz > m.zHi * PX) return false;
  const d = fdir(a.face), len = m.len * PX + tr;
  if (m.both) return Math.abs(tx - a.x) <= len;
  return (tx - a.x) * d <= len && (tx - px) * d >= -tr;
}

// ---------------------------------------------------------------- props & items (§5.18)
function damageProp(sim, pr, dmg) {
  if (pr.hp <= 0) return;
  pr.hp = Math.max(0, pr.hp - dmg);
  emit(sim, { type: pr.hp ? 'propHit' : 'propBreak', prop: pr.id });
  if (pr.hp) return;
  const kind = pr.kind === 0 ? 0 : pr.drop;
  sim.items.push({ id: sim.itemSeq++, kind, x: pr.x, y: pr.y });
  emit(sim, { type: 'item', id: sim.itemSeq - 1, kind });
}
function pickItems(sim) {
  const p = sim.p;
  if (p.z > 0 || p.st === S.DOWN) return;
  for (let i = 0; i < sim.items.length; i++) {
    const it = sim.items[i], k = ITEMS[it.kind];
    if (Math.abs(it.x - p.x) > ITEM_R || Math.abs(it.y - p.y) > ITEM_R) continue;
    if (k.hp && p.hp >= p.hpMax) continue;
    if (k.qi && p.qi >= p.qiMax) continue;
    if (k.hp) p.hp = Math.min(p.hpMax, p.hp + k.hp);
    if (k.qi) p.qi = Math.min(p.qiMax, p.qi + k.qi);
    if (k.ore) p.ore += k.ore;
    sim.items.splice(i--, 1);
    emit(sim, { type: 'pickup', id: it.id, kind: it.kind });
  }
}

// ---------------------------------------------------------------- player
const canAct = p => (p.st === S.IDLE || p.st === S.MOVE) && p.z === 0;

function startMove(sim, id) {
  const p = sim.p, m = playerMove(id);
  p.st = S.WINDUP; p.stT = 0; p.mv = id; p.mvT = 0; p.hitMask = [];
  if (id >= MOVE_SKILL) { const s = id - MOVE_SKILL; p.cd[2 + p.slots.indexOf(s)] = skillCd(p, s); p.qi -= m.qi; }
  if (m.back) moveBy(sim, p, -fdir(p.face) * m.back * PX, 0);
  emit(sim, { type: 'swingStart', who: -1, mv: m.name, id, face: p.face });
}
/** Turn toward foes only behind: with nobody in front on this line and somebody behind, a swing turns round. */
function autoTurn(sim) {
  const p = sim.p;
  let front = false, back = false;
  for (const f of sim.foes) {
    if (!live(f) || !onLine(p.y, f.y, bodyR(f)) || Math.abs(f.x - p.x) > 64 * PX) continue;
    if (inFront(p.face, p.x, f.x)) front = true; else back = true;
  }
  if (!front && back) p.face = p.face === FACE_LEFT ? FACE_RIGHT : FACE_LEFT;
}

function interact(sim) {
  const p = sim.p;
  if (Math.abs(p.x - SHRINE_X * PX) <= 32 * PX) { rest(sim); return; }
  const c = STAGES[sim.stage].chest;
  if (c && !(sim.opened & 1) && Math.abs(p.x - c.x * PX) <= 32 * PX && Math.abs(p.y - c.y * PX) <= 32 * PX) {
    sim.opened |= 1; p.ore += c.ore; emit(sim, { type: 'chest', id: 0, ore: c.ore });
  }
}

function refill(p) {
  p.hp = p.hpMax; p.sta = p.staMax; p.qi = p.qiMax; p.pos = 0; p.cd.fill(0); p.st = S.IDLE; p.stT = 0; p.iframe = 0; p.ctl = 0;
  p.counter = 0; p.combo = 0; p.buf = 0; p.mv = -1; p.z = 0; p.vz = 0; p.vx = 0; p.vy = 0; p.kb = 0; p.grab = -1; p.push = 0;
}
function rest(sim) {
  refill(sim.p);
  sim.shrine = sim.stage; sim.panel = 1;
  emit(sim, { type: 'rest', shrine: sim.stage });
}

/** (Re)start the foes of the current wave at the screen's edges: same slots, same sides and delays. */
function spawnWave(sim) {
  const g = waveIndex(sim);
  for (const f of sim.foes) {
    if (sim.plan[f.slot].wave !== g) continue;
    const spec = sim.plan[f.slot], k = f.k, fresh = makeFoe(f.slot, spec);
    fresh.k = k;                                   // the combo round keeps counting: a restart is not a re-draw
    Object.assign(f, fresh);
    f.on = 1; f.wait = spec.delay;
    f.x = spec.boss >= 0 || FOES[spec.type].kind > 0 ? sim.cam + (VIEW_W - 72) * PX : spec.side ? sim.cam + (VIEW_W + 24) * PX : sim.cam - 24 * PX;
    f.face = f.x > sim.p.x ? FACE_LEFT : FACE_RIGHT;
    if (FOES[spec.type].kind > 0) { f.inside = 1; emit(sim, { type: 'bossRoom', boss: spec.boss, id: f.id }); }
  }
}

function hurtPlayer(sim, f, m) {
  const p = sim.p;
  if (p.iframe > 0) {
    if (p.st === S.DODGE && p.perfectFrom >= 0 && p.stT - DODGE_IFRAME_FROM < PERFECT_DODGE_WIN) {
      p.counter = COUNTER_WIN; p.qi = Math.min(p.qiMax, p.qi + QI_PERFECT); p.perfectFrom = -1;
      award(sim, 'perfect', f);
      emit(sim, { type: 'perfectDodge', id: f.id });
    }
    return;
  }
  const front = inFront(p.face, p.x, f.x), away = sgn(f.x - p.x) || -fdir(f.face);
  if (p.st === S.BLOCK && front) {
    if (m.glow === 2) { emit(sim, { type: 'hurt', by: f.id }); breakPlayer(sim); damagePlayer(sim, m.dmg); return; }   // red: guard broken
    if (p.blockT < parryWin(p)) {
      f.pos += Math.trunc((m.pos * PARRY_POSTURE_PCT) / 100); f.posT = 0;
      p.cd[0] = Math.max(0, BLOCK_CD - PARRY_CD_REFUND); p.qi = Math.min(p.qiMax, p.qi + QI_PARRY);
      award(sim, 'parry', f);
      emit(sim, { type: 'parry', id: f.id });
      push(f, away, m.force >> 1);                   // the blade bounces back
      checkBreak(sim, f);
      return;
    }
    p.pos += m.pos; p.posT = 0;
    emit(sim, { type: 'block', id: f.id });
    push(p, -away, m.force >> 1);
    if (p.pos >= p.posMax) { breakPlayer(sim); return; }
    damagePlayer(sim, Math.trunc((m.dmg * BLOCK_DMG_PCT) / 100));
    return;
  }
  if (p.st === S.ACTIVE && playerMove(p.mv).stance && m.glow === 0 && front) {   // 劍幕: auto-parry white
    f.pos += Math.trunc((m.pos * PARRY_POSTURE_PCT) / 100); f.posT = 0; p.qi = Math.min(p.qiMax, p.qi + QI_PARRY);
    award(sim, 'parry', f); emit(sim, { type: 'parry', id: f.id }); checkBreak(sim, f);
    return;
  }
  hit(sim, f, m, -away);
}

function release(sim, why) {
  const p = sim.p, f = sim.foes[p.grab];
  if (f && f.st === S.HELD) { f.st = S.READY; f.stT = 0; f.gap = gapOf(f); }
  p.grab = -1; p.grabT = 0; p.grabHits = 0;
  if (why) emit(sim, { type: why, id: f ? f.id : -1 });
}

function hit(sim, f, m, dir) {
  const p = sim.p;
  emit(sim, { type: 'hurt', by: f.id, force: m.force, dir });
  if (p.grab >= 0) release(sim, 'breakFree');
  damagePlayer(sim, m.dmg);
  if (p.hp <= 0) return;
  push(p, dir, m.force);
  const stun = m.launch ? Math.trunc((2 * m.launch) / GRAVITY) + LAND_STUN : HITSTUN;
  if (p.st === S.CONTROL || p.st === S.HITSTUN) p.ctl += p.stT; else p.ctl = 0;
  if (p.ctl + stun > CONTROL_CAP) {          // control cap: stand up, briefly invulnerable
    p.st = S.IDLE; p.stT = 0; p.iframe = CONTROL_IFRAME; p.ctl = 0; p.vz = 0; p.z = 0; p.mv = -1;
    return;
  }
  if (m.launch) { p.vz = m.launch; emit(sim, { type: 'launch', who: -1 }); }
  p.st = m.launch || p.z > 0 ? S.CONTROL : S.HITSTUN; p.stT = 0; p.stun = stun; p.combo = 0; p.counter = 0; p.mv = -1;
}

function damagePlayer(sim, dmg) {
  const p = sim.p;
  dmg = Math.trunc((dmg * (100 - ARMORS[p.armor].cut)) / 100);
  p.hp -= dmg;
  emit(sim, { type: 'hit', who: -1, dmg });
  if (p.hp <= 0) { p.hp = 0; p.st = S.DOWN; p.stT = 0; p.mv = -1; if (p.grab >= 0) release(sim, null); emit(sim, { type: 'down' }); }
}

function breakPlayer(sim) {
  const p = sim.p;
  p.st = S.BROKEN; p.stT = 0; p.stun = BROKEN_TICKS / 2; p.pos = 0; p.combo = 0; p.mv = -1;
  emit(sim, { type: 'broken', id: -1 });
}

/** Down: back at this stage's sword mound with full bars; the whole stage starts over (§5.13). */
function die(sim) {
  const p = sim.p;
  sim.deaths++;
  refill(p);
  // The stage starts over from its sword mound: every wave of it comes back (cleared ones too), the props stay as they are.
  for (const f of sim.foes) if (sim.plan[f.slot].stage === sim.stage) { const k = f.k; Object.assign(f, makeFoe(f.slot, sim.plan[f.slot])); f.k = k; }
  sim.cam = 0; sim.wave = 0; sim.waveOn = 0; sim.goT = 0;
  Object.assign(p, { x: (SHRINE_X + 24) * PX, y: 48 * PX, face: FACE_RIGHT });
  emit(sim, { type: 'respawn', shrine: sim.stage });
}

function award(sim, kind, f) {
  const t = sim.tech, pct = f.kind === 0 ? XP_DECAY_PCT[Math.min(sim.slotKills[f.slot], 3)] : 100;
  t[kind]++;
  const cap = kind === 'parry' || kind === 'perfect' ? TECH_CAP : kind === 'interrupt' ? INTERRUPT_CAP : EXEC_CAP;
  if (t[kind] > cap) return;
  const base = kind === 'parry' ? PARRY_PTS : kind === 'perfect' ? PERFECT_PTS : kind === 'interrupt' ? INTERRUPT_PTS
    : f.kind === 0 ? EXEC_PTS_MINION : EXEC_PTS;
  t[`${kind}Pts`] += Math.trunc((base * pct) / 100);
}

/** Lunge displacement (sub-pixels along the facing) for active tick k. */
export const lungeStep = (m, k) => (m.lunge ? Math.trunc((m.lunge * PX * (k + 1)) / m.a) - Math.trunc((m.lunge * PX * k) / m.a) : 0);
/** Walking step for a direction code: depth moves at half speed (§5.1). */
const stepOf = (dir, spd) => [Math.trunc((DX[dir] * spd) / ONE), Math.trunc((DY[dir] * spd) / ONE / 2)];

/** A small foe the player can grab: adjacent on this line, in front, not swinging (§5.17). */
function grabbable(sim) {
  const p = sim.p, d = fdir(p.face);
  for (const f of sim.foes) {
    if (!live(f) || FOES[f.type].mass > 1 || f.z > 0 || f.st === S.WINDUP || f.st === S.ACTIVE || f.thrown) continue;
    if (!onLine(p.y, f.y, bodyR(f))) continue;
    const gap = (f.x - p.x) * d - PLAYER_R - bodyR(f);
    if (gap >= -PLAYER_R && gap <= 4 * PX) return f;
  }
  return null;
}

function stepPlayer(sim, input) {
  const p = sim.p;
  const act = (input >> ACT_SHIFT) & 15, moving = input & IN_MOVE, dir = input & IN_DIR;
  if (act) { p.buf = act; p.bufT = BUFFER_TICKS; }
  p.stT++;
  if (p.z > 0 || p.vz > 0) {                       // airborne: a jump drifts, a launch just flies
    if (p.st === S.JUMP || p.mv === MOVE_AIR) moveBy(sim, p, p.jx, p.jy);
    p.z += p.vz; p.vz -= GRAVITY;
    if (p.z <= 0) {
      p.z = 0; p.vz = 0; emit(sim, { type: 'land', who: -1 });
      if (p.st === S.JUMP || p.mv === MOVE_AIR) { p.stun = JUMP_LAND + (p.airAtk ? 4 : 0); p.st = S.LAND; p.stT = 0; p.mv = -1; }
    }
  }
  if (p.buf === ACT_ESCAPE && p.cd[1] === 0 && p.st !== S.DOWN && p.st !== S.DODGE) {
    p.buf = 0;
    if (p.grab >= 0) release(sim, null);
    p.cd[1] = escapeCd(p);
    p.st = S.IDLE; p.stT = 0; p.iframe = ESCAPE_IFRAME; p.ctl = 0; p.combo = 0; p.mv = -1; p.vx = 0; p.vy = 0; p.z = 0; p.vz = 0;
    moveBy(sim, p, -fdir(p.face) * 40 * PX, 0);
    emit(sim, { type: 'escape', who: -1 });
  }
  switch (p.st) {
    case S.DOWN:
      if (p.stT >= 60) die(sim);
      return;
    case S.HITSTUN: case S.CONTROL: case S.BROKEN: case S.LAND:
      if (p.stT >= p.stun && p.z === 0) { p.st = S.IDLE; p.stT = 0; p.ctl = 0; }
      break;
    case S.BLOCK:
      p.blockT++;
      if (p.blockT >= BLOCK_ACTIVE) { p.st = S.IDLE; p.stT = 0; }
      break;
    case S.DODGE: {
      if (p.stT === DODGE_IFRAME_FROM) { p.iframe = DODGE_IFRAME_TO - DODGE_IFRAME_FROM + 1; p.perfectFrom = p.stT; }
      if (p.stT <= 14) {
        const total = dodgeDist(p) * PX, share = Math.trunc((total * p.stT) / 14) - Math.trunc((total * (p.stT - 1)) / 14);
        const [sx, sy] = stepOf(p.dodgeDir, share);
        moveBy(sim, p, sx, sy);
      }
      if (p.stT >= DODGE_TICKS) { p.st = S.IDLE; p.stT = 0; p.perfectFrom = -1; p.dodgeEnd = sim.tick; }
      break;
    }
    case S.JUMP:
      if (p.buf === ACT_ATTACK && !p.airAtk) { p.buf = 0; p.airAtk = 1; startMove(sim, MOVE_AIR); emit(sim, { type: 'airAttack', who: -1 }); }
      break;
    case S.GRAB: {
      const f = sim.foes[p.grab];
      if (!f || !f.alive || f.st !== S.HELD) { release(sim, null); p.st = S.IDLE; p.stT = 0; break; }
      p.grabT++;
      f.x = p.x + fdir(p.face) * (PLAYER_R + bodyR(f)); f.y = p.y; f.face = p.face === FACE_LEFT ? FACE_RIGHT : FACE_LEFT;
      if (p.buf === ACT_ATTACK) {
        p.buf = 0;
        const sx = moving ? sgn(DX[dir]) : 0;
        if (sx) { throwFoe(sim, f, sx); break; }
        if (p.grabHits < GRAB_HITS) {
          p.grabHits++;
          f.pos += 12; f.posT = 0;
          emit(sim, { type: 'knee', id: f.id });
          damageFoe(sim, f, scaleDmg(p, 6));
          if (!f.alive) { release(sim, null); p.st = S.IDLE; p.stT = 0; }
        }
        break;
      }
      if (p.grabT >= GRAB_TICKS) {
        const d = fdir(p.face);
        release(sim, 'breakFree'); p.st = S.IDLE; p.stT = 0;
        moveBy(sim, p, -d * 16 * PX, 0); moveBy(sim, f, d * 16 * PX, 0);
      }
      break;
    }
    case S.WINDUP: case S.ACTIVE: case S.RECOVER: {
      const m = playerMove(p.mv);
      p.mvT++;
      if (p.st === S.WINDUP && p.stT >= m.w) { p.st = S.ACTIVE; p.stT = 0; if (m.iframe) p.iframe = m.iframe; emit(sim, { type: 'swing', who: -1, mv: m.name }); }
      else if (p.st === S.ACTIVE && p.stT >= m.a) { p.st = S.RECOVER; p.stT = 0; }
      else if (p.st === S.RECOVER) {
        if (p.stT === m.cancel.dodge) emit(sim, { type: 'cancelOpen' });
        // Cancel windows: the next combo hit, a skill or a dodge may cut the recovery from their tick on.
        if (p.buf === ACT_ATTACK && p.mv < 2 && p.stT >= m.cancel.combo) { p.buf = 0; p.combo = p.mv + 1; startMove(sim, p.combo); break; }
        if (p.buf >= ACT_SKILL1 && p.buf <= ACT_SKILL4 && p.stT >= m.cancel.skill && trySkill(sim, p.buf - ACT_SKILL1)) break;
        if (p.buf === ACT_DODGE && p.stT >= m.cancel.dodge && p.sta >= DODGE_STA) { startDodge(sim, moving, dir); break; }
        if (p.stT >= m.r) { p.st = p.z > 0 ? S.JUMP : S.IDLE; p.stT = 0; p.combo = 0; p.mv = -1; }
      }
      if (p.st === S.ACTIVE) {
        const px = p.x, step = lungeStep(m, p.stT);
        if (step) moveBy(sim, p, fdir(p.face) * step, 0);
        if (!m.stance) playerHits(sim, m, p.stT, px);
      }
      break;
    }
  }
  const what = integrate(sim, p);
  if (what === 'slam') { emit(sim, { type: 'slam', who: -1 }); damagePlayer(sim, SLAM_DMG); if (p.hp > 0) { p.st = S.HITSTUN; p.stT = 0; p.stun = SLAM_STUN; p.mv = -1; } }
  if (p.bufT > 0 && --p.bufT === 0) p.buf = 0;
  if (!canAct(p)) { p.push = 0; return; }

  const b = p.buf;
  if (b) {
    if (b === ACT_ATTACK) {
      p.buf = 0; p.combo = 0;
      if (moving && DX[dir]) p.face = faceOf(DX[dir]); else autoTurn(sim);
      startMove(sim, sim.tick - p.dodgeEnd <= DASH_STRIKE_WIN ? MOVE_DASH : 0);   // attack right after a dodge = dash strike
      return;
    }
    if (b === ACT_BLOCK && p.cd[0] === 0) {
      p.buf = 0; if (moving && DX[dir]) p.face = faceOf(DX[dir]);
      p.st = S.BLOCK; p.stT = 0; p.blockT = 0; p.cd[0] = BLOCK_CD; emit(sim, { type: 'guard' }); return;
    }
    if (b === ACT_DODGE && p.sta >= DODGE_STA) { startDodge(sim, moving, dir); return; }
    if (b >= ACT_SKILL1 && b <= ACT_SKILL4 && trySkill(sim, b - ACT_SKILL1, moving, dir)) return;
    if (b === ACT_INTERACT) { p.buf = 0; interact(sim); return; }
    if (b === ACT_JUMP && p.sta >= JUMP_STA) {
      p.buf = 0; p.sta -= JUMP_STA; p.staWait = STA_DELAY; p.airAtk = 0;
      [p.jx, p.jy] = moving ? stepOf(dir, MOVE_SPD) : [0, 0];
      if (moving && DX[dir]) p.face = faceOf(DX[dir]);
      p.vz = JUMP_VZ; p.st = S.JUMP; p.stT = 0; p.push = 0;
      emit(sim, { type: 'jump', who: -1 });
      return;
    }
  }
  if (moving) {
    const [sx, sy] = stepOf(dir, MOVE_SPD);
    if (DX[dir]) p.face = faceOf(DX[dir]);
    moveBy(sim, p, sx, sy);
    p.st = S.MOVE;
    // Grab: keep pushing into a small foe on this line for GRAB_PUSH ticks (§5.17).
    const f = DX[dir] ? grabbable(sim) : null;
    p.push = f ? p.push + 1 : 0;
    if (f && p.push >= GRAB_PUSH) {
      p.push = 0; p.grab = f.id; p.grabT = 0; p.grabHits = 0; p.st = S.GRAB; p.stT = 0;
      f.st = S.HELD; f.stT = 0; f.mv = -1; f.vx = 0; f.vy = 0;
      emit(sim, { type: 'grab', id: f.id });
    }
  } else { p.st = S.IDLE; p.push = 0; }
}

function throwFoe(sim, f, d) {
  const p = sim.p;
  release(sim, null);
  f.st = S.CONTROL; f.stT = 0; f.gap = 40; f.mv = -1; f.thrown = 1; f.tossed = -1; f.face = d > 0 ? FACE_LEFT : FACE_RIGHT;
  f.vz = 512; push(f, d, THROW_FORCE);
  p.face = faceOf(d); p.st = S.LAND; p.stT = 0; p.stun = 12;
  emit(sim, { type: 'throw', id: f.id });
}

function startDodge(sim, moving, dir) {
  const p = sim.p;
  p.buf = 0; p.sta -= DODGE_STA; p.staWait = STA_DELAY; p.mv = -1;
  p.dodgeDir = moving ? dir : p.face === FACE_LEFT ? 2 : 6;            // no direction: step back
  p.st = S.DODGE; p.stT = 0; p.dodgeX = p.x; p.dodgeY = p.y;
  emit(sim, { type: 'dodge' });
}
function trySkill(sim, slot, moving = 0, dir = 0) {
  const p = sim.p, s = p.slots[slot];
  if (s < 0 || p.cd[2 + slot] !== 0 || p.qi < SKILLS[s].qi) return false;
  p.buf = 0;
  if (moving && DX[dir]) p.face = faceOf(DX[dir]); else autoTurn(sim);
  startMove(sim, MOVE_SKILL + s);
  return true;
}

function playerHits(sim, m, k, px) {
  const p = sim.p, group = m.every ? Math.trunc(k / m.every) : 0;
  for (const pr of sim.props) {                    // breakables (attacks pass over unbreakables)
    if (pr.hp <= 0) continue;
    const key = 2048 + group * 64 + pr.id;
    if (p.hitMask.includes(key) || !hitReaches({ ...m, low: false, zHi: 999 }, p, pr.x, pr.y, 0, (PROPS[pr.kind].w >> 1) * PX, px)) continue;
    p.hitMask.push(key); damageProp(sim, pr, m.dmg);
  }
  for (const f of sim.foes) {
    if (p.st !== S.ACTIVE) return;                 // deflected or clashed on an earlier target this tick: the swing is over
    if (!live(f) || f.iframe > 0 || f.st === S.HELD) continue;
    const key = group * 1024 + f.id;
    if (p.hitMask.includes(key) || !hitReaches(m, p, f.x, f.y, f.z, bodyR(f), px)) continue;
    p.hitMask.push(key);
    // Clash: this foe's white swing reaches the player in this same tick -> both blades bounce (the foe steps after the
    // player, so a wind-up on its last tick swings this tick too)
    const fw = f.mv >= 0 ? foeMove(f) : null;
    const fm = fw && (f.st === S.ACTIVE || (f.st === S.WINDUP && f.stT + 1 >= fw.w)) ? fw : null;
    if (fm && fm.glow === 0 && !f.hit && hitReaches(fm, f, p.x, p.y, p.z, PLAYER_R)) {
      const d = sgn(f.x - p.x) || fdir(p.face);
      f.hit = 1;
      f.pos += CLASH_POSTURE; p.pos += CLASH_POSTURE; f.posT = 0; p.posT = 0;
      push(f, d, CLASH_PUSH); push(p, -d, CLASH_PUSH);
      f.st = S.RECOVER; f.stT = 0; f.mv = -1; p.st = S.RECOVER; p.stT = 0;
      emit(sim, { type: 'clash', a: -1, b: f.id });
      checkBreak(sim, f);
      if (p.pos >= p.posMax) breakPlayer(sim);
      return;
    }
    hitFoe(sim, f, m);
  }
}

function hitFoe(sim, f, m) {
  const p = sim.p, spec = FOES[f.type], isBasic = p.mv < MOVE_SKILL;
  const fm = f.mv >= 0 ? foeMove(f) : null;
  const d = sgn(f.x - p.x) || fdir(p.face);
  if (f.st === S.BROKEN) {                                     // execution
    const dmg = f.kind === 0 ? f.hp : Math.trunc((f.hpMax * EXEC_PCT) / 100);
    award(sim, 'exec', f);
    emit(sim, { type: 'execute', id: f.id });
    f.st = S.HITSTUN; f.stT = 0; f.gap = 30; f.pos = 0; f.mv = -1;
    push(f, d, m.force * 2);
    damageFoe(sim, f, dmg);
    return;
  }
  if (m.brk && f.st === S.WINDUP && fm && fm.glow === 1) {     // interrupt
    f.st = S.HITSTUN; f.stT = 0; f.gap = INTERRUPT_STUN; f.pos += Math.trunc((spec.pos * INTERRUPT_POSTURE_PCT) / 100); f.posT = 0;
    f.i = 0; f.k++; f.order = null; f.mv = -1; f.air = 0;
    p.qi = Math.min(p.qiMax, p.qi + QI_INTERRUPT);
    award(sim, 'interrupt', f);
    emit(sim, { type: 'interrupt', id: f.id });
    push(f, d, m.force);
    damageFoe(sim, f, scaleDmg(p, m.dmg));
    checkBreak(sim, f);
    return;
  }
  const back = behind(f.face, f.x, p.x);
  let pos = m.pos;
  if (isBasic && has(p, 12)) pos += pos >> 2;
  if (back) pos = Math.trunc((pos * BACK_POSTURE_PCT) / 100);
  if (p.counter > 0) { pos *= 2; p.counter = 0; }
  if (spec.guard && f.st === S.READY && !back && f.z === 0) {  // a guarding foe deflects basic attacks
    if (isBasic && p.mv !== MOVE_AIR) {
      p.st = S.HITSTUN; p.stT = 0; p.stun = DEFLECT_STUN; p.combo = 0; p.mv = -1;
      push(p, -d, 50);
      f.pos += m.pos >> 1; f.posT = 0;
      emit(sim, { type: 'deflect', id: f.id });
      checkBreak(sim, f);
      return;
    }
    f.pos += pos; f.posT = 0;
    push(f, d, m.force >> 1);
    damageFoe(sim, f, Math.trunc((scaleDmg(p, m.dmg) * BLOCK_DMG_PCT) / 100));
    checkBreak(sim, f);
    return;
  }
  f.pos += pos; f.posT = 0;
  emit(sim, { type: 'hitFoe', id: f.id, back, force: m.force, dir: d });
  damageFoe(sim, f, scaleDmg(p, m.dmg));
  if (!f.alive) return;
  push(f, d, m.force);
  // Poise: a hit at least as strong as the foe's poise interrupts it, unless it is in super armor.
  const armored = fm && fm.armor && (f.st === S.WINDUP || f.st === S.ACTIVE);
  if (m.knock && f.kind === 0 && !armored) {                   // the air slash knocks a minion down
    f.st = S.CONTROL; f.stT = 0; f.gap = CONTROL_TICKS; f.mv = -1; f.vz = 384; f.air = 0;
    emit(sim, { type: 'launch', who: f.id });
  } else if (m.force >= spec.poise && !armored && f.st !== S.BROKEN && f.phaseLock === 0) {
    f.st = S.HITSTUN; f.stT = 0; f.gap = HITSTUN; f.mv = -1; f.air = 0;
    emit(sim, { type: 'stagger', who: f.id, force: m.force });
  }
  checkBreak(sim, f);
}

const scaleDmg = (p, dmg) => Math.trunc((dmg * (100 + p.forge * FORGE_DMG_PCT)) / 100);

function checkBreak(sim, f) {
  if (!f.alive || f.pos < FOES[f.type].pos || f.st === S.BROKEN || f.st === S.HELD) return;
  f.st = S.BROKEN; f.stT = 0; f.pos = 0; f.mv = -1; f.air = 0;
  emit(sim, { type: 'broken', id: f.id });
}

function damageFoe(sim, f, dmg) {
  if (f.phaseLock > 0) return;
  f.hp -= dmg;
  const spec = FOES[f.type];
  if (spec.phase2 && f.phase === 1 && f.hp * 2 <= f.hpMax && f.hp > 0) {
    f.phase = 2; f.order = null; f.i = 0; f.st = S.READY; f.stT = 0; f.phaseLock = 60; f.iframe = 60; f.mv = -1; f.air = 0;
    emit(sim, { type: 'bossPhase', id: f.id });
  }
  if (f.hp > 0) return;
  f.hp = 0; f.alive = 0; f.st = S.DEAD; f.vx = 0; f.vy = 0; f.thrown = 0;
  const p = sim.p, pct = f.kind === 0 ? XP_DECAY_PCT[Math.min(sim.slotKills[f.slot], 3)] : 100;
  const xp = Math.trunc((spec.xp * pct) / 100);
  p.xp += xp;
  if (f.kind === 0) { p.ore += spec.ore; sim.slotKills[f.slot]++; }
  const u = sim.plan[f.slot];
  if (u.drop) { if (u.drop.ore) p.ore += u.drop.ore; if (u.drop.armor) p.armors |= 1 << u.drop.armor; }
  emit(sim, { type: 'kill', id: f.id, xp });
  if (f.boss >= 0) {
    sim.bossDown |= 1 << f.boss;
    sim.bossPts += spec.final ? FINAL_PTS : BOSS_PTS;
    emit(sim, { type: 'bossDown', boss: f.boss });
    if (spec.final) { sim.timePts = Math.trunc((MATCH_TICKS - sim.tick) / TPS) * TIME_PTS; sim.over = 1; }
  }
}

// ---------------------------------------------------------------- foes (§5.9)
export const movePool = f => (f.phase === 2 ? FOES[f.type].phase2 : FOES[f.type].pool);
/** The move a foe is performing (its anti-air move or one from its pool). */
export const foeMove = f => (f.mv < 0 ? null : f.air ? FOES[f.type].air : movePool(f)[f.mv]);
const gapOf = f => (f.kind === 2 ? FOE_GAP_BOSS : f.kind === 1 ? FOE_GAP_ELITE : FOE_GAP);
/** Ticks until an airborne player lands (0 on the ground). */
export function ticksToLand(p) {
  if (p.z <= 0 && p.vz <= 0) return 0;
  let z = p.z, v = p.vz, t = 0;
  while (z > 0 || v > 0) { z += v; v -= GRAVITY; t++; if (t > 120) break; }
  return t;
}
/** Horizontal distance (sub-pixels) at which a foe's move reaches the player's body. */
const reachOf = m => m.len * PX + (m.lunge >> 1) * PX + PLAYER_R - 2 * PX;

function startFoeMove(sim, f, m, mvId, air) {
  f.face = faceOf(sim.p.x - f.x);
  f.mv = mvId; f.air = air ? 1 : 0; f.mvT = 0; f.st = S.WINDUP; f.stT = 0;
  emit(sim, { type: 'windup', id: f.id, mv: m.name, glow: m.glow, ticks: m.w });
}

function stepFoes(sim) {
  const p = sim.p;
  // Attacker limit (§5.9 rule 4): at most MAX_ATTACKERS swinging, one per side, one gold read at a time.
  let attackers = 0, golds = 0, sideL = 0, sideR = 0;
  for (const f of sim.foes) if (live(f) && (f.st === S.WINDUP || f.st === S.ACTIVE)) {
    attackers++; if (foeMove(f)?.glow === 1) golds++;
    if (f.x < p.x) sideL++; else sideR++;
  }
  const landIn = ticksToLand(p), playerUp = p.st !== S.DOWN;
  for (const f of sim.foes) {
    if (!f.alive || !f.on) continue;
    if (f.wait > 0) { f.wait--; continue; }
    const spec = FOES[f.type];
    f.stT++;
    if (f.iframe > 0) f.iframe--;
    if (f.st === S.HELD) continue;
    if (!f.inside) { const [lo, hi] = [sim.cam + bodyR(f), sim.cam + VIEW_W * PX - bodyR(f)]; if (f.x >= lo && f.x <= hi) f.inside = 1; }
    if (f.z > 0 || f.vz > 0) {                                   // knocked down or thrown: fly, then land
      f.z += f.vz; f.vz -= GRAVITY;
      if (f.thrown) tossHits(sim, f);
      if (f.z <= 0) {
        f.z = 0; f.vz = 0; emit(sim, { type: 'land', who: f.id });
        if (f.thrown) { f.thrown = 0; damageFoe(sim, f, THROW_DMG); if (!f.alive) continue; }
      }
    }
    const what = integrate(sim, f);
    if (what) {
      emit(sim, { type: what, who: f.id });
      damageFoe(sim, f, SLAM_DMG);
      if (!f.alive) continue;
      const armored = f.mv >= 0 && foeMove(f).armor;
      if (spec.poise < 9999 && !armored && f.st !== S.BROKEN) { f.st = S.HITSTUN; f.stT = 0; f.gap = SLAM_STUN; f.mv = -1; f.air = 0; }
    }
    if (f.phaseLock > 0) { f.phaseLock--; continue; }
    if (f.cd > 0) f.cd--;
    if (f.pos > 0 && ++f.posT > POSTURE_REGEN_DELAY && f.st !== S.BROKEN) f.pos = Math.max(0, f.pos - POSTURE_REGEN);
    const dx = p.x - f.x, dy = p.y - f.y;
    if (f.st === S.BROKEN) { if (f.stT >= BROKEN_TICKS) { f.st = S.READY; f.stT = 0; f.gap = gapOf(f); } continue; }
    if (f.st === S.HITSTUN || f.st === S.CONTROL) {
      if (spec.escape && f.st === S.HITSTUN && f.stT === FOE_ESCAPE_AT && f.cd === 0 && f.gap > FOE_ESCAPE_AT) {
        f.cd = FOE_ESCAPE_CD; f.iframe = ESCAPE_IFRAME; f.vx = 0; f.vy = 0;
        moveBy(sim, f, -fdir(f.face) * 40 * PX, 0);
        f.st = S.READY; f.stT = 0; f.gap = gapOf(f);
        emit(sim, { type: 'escape', who: f.id });
        continue;
      }
      if (f.stT >= f.gap && f.z === 0) { f.st = S.READY; f.stT = 0; f.gap = gapOf(f); }
      continue;
    }
    if (f.st === S.RECOVER && f.mv < 0) { if (f.stT >= 20) { f.st = S.READY; f.stT = 0; f.gap = gapOf(f); } continue; }   // after a clash
    if (f.st === S.WINDUP || f.st === S.ACTIVE || f.st === S.RECOVER) {
      const m = foeMove(f);
      f.mvT++;
      if (f.st === S.WINDUP) {
        // tracking until the commit point: it may still turn round once if the player slipped behind
        if (f.stT < m.track && playerUp && dx && faceOf(dx) !== f.face) f.face = faceOf(dx);
        if (f.stT >= m.w) { f.st = S.ACTIVE; f.stT = 0; f.hit = 0; emit(sim, { type: 'swing', who: f.id, mv: m.name }); }
      } else if (f.st === S.ACTIVE && f.stT >= m.a) { f.st = S.RECOVER; f.stT = 0; }
      else if (f.st === S.RECOVER && f.stT >= m.r) { f.st = S.READY; f.stT = 0; f.gap = gapOf(f); f.mv = -1; f.air = 0; continue; }
      if (f.st === S.ACTIVE) {
        const px = f.x, step = lungeStep(m, f.stT);
        if (step) moveBy(sim, f, fdir(f.face) * step, 0);
        if (m.every && f.stT % m.every === 0) f.hit = 0;
        const dodging = p.st === S.DODGE && p.iframe > 0;
        if (!f.hit && playerUp && (hitReaches(m, f, p.x, p.y, p.z, PLAYER_R, px)
          || (dodging && hitReaches(m, f, p.dodgeX, p.dodgeY, p.z, PLAYER_R, px)))) {
          f.hit = 1; hurtPlayer(sim, f, m);
        }
      }
      continue;
    }
    // READY: face the player (one turn per FOE_TURN ticks), line up, close in, attack when allowed
    if (dx && faceOf(dx) !== f.face) { if (++f.turnT >= FOE_TURN) { f.turnT = 0; f.face = faceOf(dx); } } else f.turnT = 0;
    if (!f.order) f.order = rng.shuffle(sim.seed, 'combo', f.slot * 64 + f.k, movePool(f).map((_, i) => i));
    let side = dx > 0 ? -1 : 1;                                 // which side of the player this foe is on
    const sideBusy = side < 0 ? sideL : sideR;
    const free = attackers < MAX_ATTACKERS && !sideBusy && playerUp;
    const line = Math.abs(dy) <= DEPTH_HIT * PX;
    const facing = faceOf(dx) === f.face || !dx;
    // Anti-air (elites and bosses): the player jumped within reach.
    if (spec.air && p.z > 0 && free && f.stT >= (f.gap >> 1) && line && facing && Math.abs(dx) <= reachOf(spec.air)) {
      startFoeMove(sim, f, spec.air, 0, true); attackers++; if (side < 0) sideL++; else sideR++;
      continue;
    }
    const mvId = f.order[f.i], m = movePool(f)[mvId];
    // Against a jump it times the swing for the landing (§5.16): no point swinging at someone in the air.
    const timing = !landIn || Math.abs(landIn - m.w) <= 3;
    if (f.stT >= f.gap && free && line && facing && timing && Math.abs(dx) <= reachOf(m) && (m.glow !== 1 || !golds)) {
      startFoeMove(sim, f, m, mvId, false); attackers++; if (m.glow === 1) golds++; if (side < 0) sideL++; else sideR++;
      if (++f.i >= f.order.length) { f.i = 0; f.k++; f.order = null; }
      continue;
    }
    // Where to stand: on its side of the player at striking distance, or (when it may not attack) back at WAIT_GAP,
    // a little off the player's line so the queue is readable.
    const waiting = !free;
    if (!waiting && line && Math.abs(dx) <= reachOf(m)) continue;             // in place: wait for the gap to pass
    const off = waiting ? ((f.id & 1) ? 20 : -20) * PX : 0;
    const stand = waiting ? WAIT_GAP * PX : Math.max(reachOf(m) - 4 * PX, bodyR(f) + PLAYER_R);
    const gy = Math.max(0, Math.min(DEPTH * PX, p.y + off));
    // That spot is inside an obstacle or past a locked screen's edge: stand on the player's other side instead
    // (no stand-off behind a prop or against a wall).
    const [lo, hi] = xBounds(sim, f), sx = p.x + side * stand;
    if (propAt(sim, sx, gy, bodyR(f)) || sx < lo || sx > hi) side = -side;
    const gx = p.x + side * stand;
    walk(sim, f, gx - f.x, gy - f.y, spec.spd);
  }
}

/** A thrown foe knocks down the foes and breaks the breakables it flies into (§5.17). */
function tossHits(sim, f) {
  for (const g of sim.foes) {
    if (g === f || !live(g) || g.st === S.HELD || g.tossed === f.id || g.z > 0) continue;
    if (Math.abs(g.x - f.x) > bodyR(f) + bodyR(g) || !onLine(f.y, g.y, bodyR(g))) continue;
    g.tossed = f.id;
    emit(sim, { type: 'hitFoe', id: g.id, back: false, force: THROW_FORCE, dir: sgn(f.vx) });
    damageFoe(sim, g, THROW_DMG);
    if (!g.alive) continue;
    const armored = g.mv >= 0 && foeMove(g).armor;
    if (FOES[g.type].poise < 9999 && !armored) { g.st = S.CONTROL; g.stT = 0; g.gap = 40; g.mv = -1; g.air = 0; g.vz = 384; push(g, sgn(f.vx) || 1, 120); }
  }
  for (const pr of sim.props) {
    if (pr.hp <= 0) continue;
    if (Math.abs(pr.x - f.x) <= bodyR(f) + (PROPS[pr.kind].w >> 1) * PX && onLine(f.y, pr.y, (PROPS[pr.kind].d >> 1) * PX)) damageProp(sim, pr, 99);
  }
}

/**
 * Next point to walk to on the way from (x, y) to (gx, gy) for a body of radius r: when a solid prop lies across the way,
 * first clear its depth band (toward the side nearer the goal that stays on the floor), or, beside the band, get past
 * its near end. Shared by the foes and by the comparison strategies (a player sees the props too).
 */
export function waypoint(sim, x, y, r, gx, gy) {
  for (const pr of sim.props) {
    if (!solid(pr)) continue;
    const k = PROPS[pr.kind], hw = (k.w >> 1) * PX + r, hd = (k.d >> 1) * PX + (r >> 1);
    const x0 = pr.x - hw, x1 = pr.x + hw, y0 = pr.y - hd, y1 = pr.y + hd;
    let hit = false;
    for (let i = 1; i <= 16 && !hit; i++) {
      const sx = x + Math.trunc(((gx - x) * i) / 16), sy = y + Math.trunc(((gy - y) * i) / 16);
      if (sx > x0 && sx < x1 && sy > y0 && sy < y1) hit = true;
    }
    if (!hit) continue;
    // Go round it along a corridor just above or below the box: reach the corridor, run past the end that faces the
    // goal, then turn to the goal's depth (outside the box's length nothing is in the way).
    const up = y0 - 2 * PX, down = y1 + 2 * PX, canUp = up >= 0, canDown = down <= DEPTH * PX;
    const lane = y <= y0 && canUp ? up : y >= y1 && canDown ? down
      : canUp && (!canDown || Math.abs(gy - up) + Math.abs(y - up) <= Math.abs(gy - down) + Math.abs(y - down)) ? up : down;
    if (Math.abs(y - lane) > 2 * PX && (y > y0 && y < y1 || (lane === up ? y > up : y < down))) return [x, lane];
    const end = gx > pr.x ? x1 + 2 * PX : x0 - 2 * PX;
    if (gx > pr.x ? x < end : x > end) return [end, y];
    return [x, gy];
  }
  return [gx, gy];
}

function walk(sim, f, dx, dy, spd) {
  const [tx, ty] = waypoint(sim, f.x, f.y, bodyR(f), f.x + dx, f.y + dy);
  const ex = tx - f.x, ey = ty - f.y, ax = Math.abs(ex), ay = Math.abs(ey);
  if (ax <= 2 * PX && ay <= 2 * PX) return;
  if (ax > 2 * PX) moveBy(sim, f, ex > 0 ? Math.min(spd, ax) : -Math.min(spd, ax), 0);
  if (ay > 2 * PX) moveBy(sim, f, 0, ey > 0 ? Math.min(spd >> 1, ay) : -Math.min(spd >> 1, ay));
}

// ---------------------------------------------------------------- scroll & waves (§5.19)
function scroll(sim) {
  const p = sim.p, st = STAGES[sim.stage];
  if (sim.waveOn) {
    const g = waveIndex(sim);
    if (sim.goT > 0) {
      if (--sim.goT === 0) { sim.waveOn = 0; sim.wave++; emit(sim, { type: 'go', wave: g }); }
    } else if (sim.foes.every(f => sim.plan[f.slot].wave !== g || !f.alive)) {
      sim.goT = GO_DELAY; emit(sim, { type: 'waveClear', wave: g });
    }
    return;
  }
  const next = st.waves[sim.wave];
  const limit = next ? next.cam * PX : stageLen(sim) - VIEW_W * PX;
  const want = Math.min(limit, p.x - CAM_LEAD * PX);
  if (want > sim.cam) sim.cam = want;
  if (next && sim.cam >= next.cam * PX) {
    sim.waveOn = 1; sim.goT = 0;
    spawnWave(sim);
    emit(sim, { type: 'waveLock', wave: waveIndex(sim) });
    return;
  }
  if (!next && p.x >= stageLen(sim) - STAGE_END * PX && p.st !== S.DOWN) {
    if (sim.stage === 0) { sim.panel = 2; emit(sim, { type: 'routePanel' }); }
    else if (st.next >= 0) enterStage(sim, st.next);
  }
}

// ---------------------------------------------------------------- §4 tick
export function step(sim, input) {
  sim.events.length = 0;
  if (sim.over || sim.panel) return;
  const p = sim.p;
  stepPlayer(sim, input);
  if (!sim.over && !sim.panel) { stepFoes(sim); separate(sim); }   // a mound opened this tick: the world waits
  for (let i = 0; i < p.cd.length; i++) if (p.cd[i] > 0 && !(i === 0 && p.st === S.BLOCK)) p.cd[i]--;
  if (p.iframe > 0) p.iframe--;
  if (p.counter > 0) p.counter--;
  if (p.staWait > 0) p.staWait--; else if (p.sta < p.staMax) p.sta = Math.min(p.staMax, p.sta + STA_REGEN);
  if (p.pos > 0 && ++p.posT > POSTURE_REGEN_DELAY && p.st !== S.BLOCK) p.pos = Math.max(0, p.pos - POSTURE_REGEN);
  if (!sim.over && !sim.panel) { pickItems(sim); scroll(sim); }
  sim.tick++;
  if (sim.tick >= MATCH_TICKS) sim.over = 1;
}

// ---------------------------------------------------------------- §8 mound panel and route choice
export const CH_LEAVE = 0, CH_LEVEL = 1, CH_NODE = 10, CH_RESET = 30, CH_SLOT = 40, CH_WEAPON = 80, CH_ARMOR = 90, CH_FORGE = 100, CH_ROUTE = 120;
export function choose(sim, index) {
  if (!sim.panel || !Number.isInteger(index)) return false;
  const p = sim.p;
  if (sim.panel === 2) {                          // route panel: only the two routes
    if (index !== CH_ROUTE && index !== CH_ROUTE + 1) return false;
    sim.route = index - CH_ROUTE; sim.panel = 0;
    emit(sim, { type: 'route', stage: ROUTES[sim.route] });
    enterStage(sim, ROUTES[sim.route]);
    return true;
  }
  if (index === CH_LEAVE) { sim.panel = 0; emit(sim, { type: 'leave' }); return true; }
  if (index === CH_LEVEL) {
    if (p.lv >= LEVEL_CAP || p.xp < XP_TABLE[p.lv - 1]) return false;
    p.xp -= XP_TABLE[p.lv - 1]; p.lv++; p.sp++;
    emit(sim, { type: 'levelUp', lv: p.lv });
    return true;
  }
  if (index >= CH_NODE && index < CH_NODE + NODES.length) {
    const n = index - CH_NODE;
    if (p.sp < 1 || has(p, n)) return false;
    p.sp--; p.nodes |= 1 << n; recompute(p); p.hp = p.hpMax; p.sta = p.staMax;
    return true;
  }
  if (index === CH_RESET) {
    if (!p.nodes) return false;
    for (let n = 0; n < NODES.length; n++) if (has(p, n)) p.sp++;
    p.nodes = 0; recompute(p);
    return true;
  }
  if (index >= CH_SLOT && index < CH_SLOT + 4 * 8) {
    const slot = (index - CH_SLOT) >> 3, s = (index - CH_SLOT) & 7;
    if (s >= SKILLS.length || !unlocked(p, s) || p.slots[slot] === s) return false;
    const other = p.slots.indexOf(s);
    if (other >= 0) p.slots[other] = p.slots[slot];
    p.slots[slot] = s;
    return true;
  }
  if (index === CH_WEAPON) return false;
  if (index >= CH_ARMOR && index < CH_ARMOR + ARMORS.length) {
    const a = index - CH_ARMOR;
    if (!((p.armors >> a) & 1) || p.armor === a) return false;
    p.armor = a; return true;
  }
  if (index === CH_FORGE) {
    if (p.forge >= FORGE_COST.length || p.ore < FORGE_COST[p.forge]) return false;
    p.ore -= FORGE_COST[p.forge]; p.forge++;
    emit(sim, { type: 'forge', level: p.forge });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- §6 / §7
export const phase = sim => (sim.over ? 'over' : sim.panel ? 'choice' : 'play');
export const score = sim => sim.bossPts + sim.timePts + sim.tech.parryPts + sim.tech.perfectPts + sim.tech.interruptPts + sim.tech.execPts;
export const scoreBreakdown = sim => ({
  bosses: sim.bossPts, time: sim.timePts,
  parry: sim.tech.parryPts, perfect: sim.tech.perfectPts, interrupt: sim.tech.interruptPts, exec: sim.tech.execPts,
  parries: sim.tech.parry, perfects: sim.tech.perfect, interrupts: sim.tech.interrupt, executions: sim.tech.exec,
  deaths: sim.deaths, level: sim.p.lv,
});

export function stateHash(sim) {
  const p = sim.p, h = createHasher(sim.tick);
  h.mixAll([sim.over, sim.panel, sim.stage, sim.route, sim.cam, sim.wave, sim.waveOn, sim.goT, sim.shrine, sim.opened, sim.bossDown,
    sim.deaths, sim.bossPts, sim.timePts, sim.itemSeq,
    p.x, p.y, p.z, p.vx, p.vy, p.vz, p.jx, p.jy, p.kb, p.face, p.st, p.stT, p.mv, p.mvT, p.hp, p.hpMax, p.sta, p.staMax, p.staWait, p.pos,
    p.posMax, p.posT, p.qi, p.qiMax, ...p.cd, p.iframe, p.ctl, p.counter, p.combo, p.lv, p.xp, p.sp, p.nodes, ...p.slots, p.armor, p.armors,
    p.forge, p.ore, p.buf, p.bufT, p.dodgeDir, p.dodgeX, p.dodgeY, p.dodgeEnd, p.blockT, p.stun, p.perfectFrom, p.grab, p.grabT,
    p.grabHits, p.push, p.airAtk, ...p.hitMask]);
  const t = sim.tech;
  h.mixAll([t.parry, t.perfect, t.interrupt, t.exec, t.parryPts, t.perfectPts, t.interruptPts, t.execPts]);
  for (const f of sim.foes) h.mixAll([f.id, f.alive, f.on, f.wait, f.inside, f.x, f.y, f.z, f.vx, f.vy, f.vz, f.kb, f.face, f.st, f.stT,
    f.mv, f.mvT, f.k, f.i, f.hp, f.pos, f.posT, f.gap, f.cd, f.iframe, f.hit, f.turnT, f.phase, f.phaseLock, f.thrown, f.tossed, f.air]);
  for (const pr of sim.props) h.mixAll([pr.id, pr.hp]);
  for (const it of sim.items) h.mixAll([it.id, it.kind, it.x, it.y]);
  h.mixAll(sim.slotKills);
  return h.value();
}

/** GameDef consumed by core/match.js (Recorder, replay, verify) and tools/skill-evidence.mjs. */
export const GAME = Object.freeze({
  id: 'blade-oath', version: 6, maxTicks: MATCH_TICKS, maxChoices: MAX_CHOICES,
  createSim, step, choose, phase, score, stateHash, scoreBreakdown,
});
