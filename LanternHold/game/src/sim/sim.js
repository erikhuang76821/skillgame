// LanternHold (守望之戰) — prototype sim v3. Spec: ../../../gdd/05_game_spec.md, numbers: ../../../gdd/04_combat.md,
// cards: ../../../gdd/06_cards.md.
// Deterministic: no rendering, no wall clock, no unseeded randomness. Same seed + same input bytes + same choices = same score.
//
// Input: one byte per tick (core/match.js logs bytes). A command is 3 consecutive bytes: [op, a, b].
// Byte 0 while idle = no command. Ops: see OP below. Invalid commands are ignored without touching the state.
// Card picks are core/match.js choices: while an offer is open phase() is 'choice' and the world is paused.
import { makeRng, createHasher, TPS, ONE, COS, SIN, angleOf } from './core/index.js';
import { buildScript, STAGES, DEFAULT_STAGE, BOSS_TIERS, foeHpPct } from './stages.js';
export { STAGES, STAGE_IDS, DEFAULT_STAGE, BOSS_TIERS } from './stages.js';

export { TICK_MS } from './core/index.js';

// --- §0 ---
export const VIEW_W = 720, VIEW_H = 1280;
export const CX = 360, CY = 600;                     // castle centre (px)

// --- §2 command protocol ---
export const OP = Object.freeze({ BUILD: 1, MENU: 2, MOVE: 3, WALL: 5 });
export const CELL_W = 60, CELL_H = 64, GRID_W = 12, GRID_H = 20;   // 240 placement cells over 720 x 1280
export const cellOf = (x, y) => Math.min(GRID_W - 1, Math.max(0, Math.floor(x / CELL_W))) + Math.min(GRID_H - 1, Math.max(0, Math.floor(y / CELL_H))) * GRID_W;
export const cellCenter = c => [(c % GRID_W) * CELL_W + CELL_W / 2, Math.floor(c / GRID_W) * CELL_H + CELL_H / 2];
export const encode = (op, a, b) => [op, a & 255, b & 255];
// Choices while an offer is open: 0–2 take that card, 3 reroll, 4–6 ignore the type of slot 0–2, 7–9 lock it.
export const CHOICE = Object.freeze({ REROLL: 3, IGNORE: 4, LOCK: 7 });

// --- §3 random streams ---
const rng = makeRng({ trickle: 1, event: 2, offer: 3, chest: 4, foe: 5 });

// --- tables (gdd/04) ---
const ARMOR = { light: 0, heavy: 1, bldg: 2 };
export const COUNTER = Object.freeze({ slash: [100, 125, 50], pierce: [150, 50, 25], blast: [75, 100, 200] });
export const LV_MUL = [100, 140, 180], LV_DEF = [0, 1, 2], XP_LV = [5, 15];

export const UNIT = Object.freeze({
  // archer: stands its ground. push = px a melee hit shoves it, pushMax = how far from its post, homeAfter = ticks with
  // nothing in reach before it walks back.
  archer: { armor: 0, hp: 35, def: 0, atk: 'pierce', dmg: 6, period: 50, range: 140, speed: 100, push: 6, pushMax: 48, homeAfter: 60, cost: 8, train: 120, barracksLv: 1 },
  // shield: engage = how close to its post a foe must come, leash = how far it chases, retreat / rally = hp % lines.
  shield: { armor: 1, hp: 140, def: 3, atk: 'slash', dmg: 4, period: 60, range: 20, speed: 80, engage: 90, leash: 70, retreatPct: 35, rallyPct: 70, taunt: 50, cost: 12, train: 240, barracksLv: 2 },
  // priest: aggro = watch radius around its post, callPct = the heal signal, range = healing distance, cast = chant
  // ticks before the heal lands, period = rest after a heal, leash = how far from its post it walks to heal.
  priest: { armor: 0, hp: 40, def: 0, heal: 10, cast: 40, period: 90, range: 60, speed: 90, aggro: 140, callPct: 80, leash: 100, cost: 12, train: 300, barracksLv: 3 },
  // trained at the castle; repairs walls and barracks by itself, fights back first when attacked
  worker: { armor: 0, hp: 30, def: 0, atk: 'slash', dmg: 3, period: 50, range: 16, speed: 110, aggro: 50, leash: 60, cost: 10, train: 180, repair: 3 },
});
export const UNIT_KINDS = ['archer', 'shield', 'priest'];        // barracks menu order

export const FOE = Object.freeze({
  // wall: what a ground foe does at a closed wall. 'bash' always attacks it; 'detour' walks the ring to the nearest
  // gap; 'mixed' is decided per foe (seeded, 50/50). With no gap left, everybody bashes.
  rat: { armor: 0, hp: 6, def: 0, atk: 'slash', dmg: 2, period: 40, range: 14, speed: 110, score: 1, gold: 2, wall: 'mixed' },
  beetle: { armor: 1, hp: 30, def: 1, atk: 'blast', dmg: 3, period: 60, range: 16, speed: 50, score: 3, gold: 4, wall: 'bash' },
  moth: { armor: 0, hp: 8, def: 0, atk: 'slash', dmg: 3, period: 40, range: 14, speed: 130, score: 2, gold: 2, fly: true },
  shroom: { armor: 0, hp: 12, def: 0, atk: 'blast', dmg: 30, period: 1, range: 16, speed: 70, score: 2, gold: 2, boom: 50, wall: 'bash' },
  snail: { armor: 1, hp: 260, def: 4, atk: 'blast', dmg: 20, period: 150, range: 140, speed: 25, score: 10, gold: 15, ranged: true, elite: true, wall: 'bash' },
  wolf: { armor: 1, hp: 160, def: 3, atk: 'slash', dmg: 10, period: 45, range: 20, speed: 120, score: 15, gold: 20, elite: true, wall: 'detour' },
  shade: { armor: 0, hp: 14, def: 0, atk: 'pierce', dmg: 4, period: 70, range: 110, speed: 60, score: 2, gold: 3, ranged: true, wall: 'bash' },
  bossWeak: { armor: 0, hp: 500, def: 1, atk: 'slash', dmg: 14, period: 60, range: 30, speed: 55, score: 20, gold: 30, aoe: 40, wall: 'bash', boss: true },
  bossMini: { armor: 1, hp: 1000, def: 2, atk: 'blast', dmg: 20, period: 90, range: 40, speed: 40, score: 40, gold: 50, aoe: 50, wall: 'bash', boss: true },
  boss: { armor: 1, hp: 1800, def: 3, atk: 'blast', dmg: 30, period: 120, range: 60, speed: 30, score: 60, gold: 80, aoe: 60, wall: 'bash', boss: true },
  bossSuper: { armor: 1, hp: 3600, def: 4, atk: 'blast', dmg: 40, period: 120, range: 70, speed: 26, score: 100, gold: 120, aoe: 70, wall: 'bash', boss: true },
});
export const FOE_KINDS = Object.keys(FOE);

// --- §5 economy & buildings: one currency (gold). Everything else grows through cards (gdd/06). ---
export const START_GOLD = 30;
export const POP_BASE = 4, POP_PER_BARRACKS = 4, POP_MAX = 32, LIGHT_BASE = 220;
export const CASTLE = Object.freeze({ hp: 1000, def: 3, atk: 'pierce', dmg: 6, period: 60, r: 56 });
export const BARRACKS = Object.freeze({ cost: 20, costStep: 15, hp: [150, 220, 300], up: [30, 50] });   // n-th costs 20 + 15n; Lv2 / Lv3 unlock shield / priest
export const BUILD_TICKS = 60, QUEUE_MAX = 3, WORKER_MAX = 4, BLDG_AGGRO = 70;
export const REDEPLOY_CD = 600, SETUP_TICKS = 60, DEPLOY_NEAR_ALLY = 120;
export const MAX_UNITS = 64, MAX_FOES = 400;

// 12 build slots: 6 inner (r 120), 6 outer (r 185).
const ring = (n, r, off) => Array.from({ length: n }, (_, i) => { const a = (off + (i * 256) / n) & 255; return [CX + Math.trunc((COS[a] * r) / ONE), CY + Math.trunc((SIN[a] * r) / ONE)]; });
export const SLOTS = Object.freeze([...ring(6, 120, 21), ...ring(6, 185, 0)]);

// Walls: 24 segments on a ring. Gold builds and upgrades them (palisade -> stone -> iron); workers repair them.
// Gaps are routes: detouring foes walk the ring to the nearest gap, so the player shapes where enemies come in.
export const WALL_R = 240, WALL_SEGS = 24;
export const WALL = Object.freeze([null, { hp: 80, def: 1, cost: 5 }, { hp: 180, def: 3, cost: 12 }, { hp: 320, def: 5, cost: 20 }]);
export const segAngle = seg => ((seg * 256) / WALL_SEGS) & 255;   // centre angle of a segment
export const DETOUR_BAND = 36;                                  // how far out a foe starts looking for a gap
/** Direction (+1 / −1) along the ring to the nearest open segment, or 0 when the ring is closed. */
export function gapDir(sim, seg) {
  for (let k = 1; k <= WALL_SEGS / 2; k++) {
    if (sim.walls[(seg + k) % WALL_SEGS].lv === 0) return 1;
    if (sim.walls[(seg - k + WALL_SEGS) % WALL_SEGS].lv === 0) return -1;
  }
  return 0;
}
export const segOf = a => Math.floor(((a + 256 / WALL_SEGS / 2) & 255) * WALL_SEGS / 256) % WALL_SEGS;

// --- §5.5 level-ups, cards, synergies, evolutions, chests (gdd/06) ---
export const XP_NEED = L => 4 + 3 * L + 2 * L * L;          // watch XP needed for level L -> L+1 (L from 0)
export const LEVEL_MAX = 30, CARD_MAX = 3, REROLLS = 2, IGNORES = 1, LOCKS = 1;
// Chests: no dice. The number of cards depends only on where the chest came from (store rule: luck never decides).
export const CHEST_KILLS = [100, 250], CHEST_CARDS = Object.freeze({ kills: 1, event: 2, boss: 1 });   // boss: + its tier bonus
export const POUCH_GOLD = 15;

export const CARDS = Object.freeze({
  rapid: { type: 'archer', name: '連射', tags: ['bow'], text: '弓箭手攻速 +15%/級' },
  split: { type: 'archer', name: '分裂箭', tags: ['bow'], text: '弓箭手的箭再打中目標旁 1/2/3 隻' },
  reinforce: { type: 'archer', name: '援軍', tags: ['bow', 'gold'], text: '立刻來 2/3/4 名弓箭手（不佔人口）' },
  fireArrow: { type: 'archer', name: '火箭', tags: ['fire', 'bow'], text: '弓箭手點燃敵人：每 0.5 秒 1/2/3 傷害，2 秒' },
  burst: { type: 'castle', name: '爆裂', tags: ['fire'], text: '敵人死亡時爆炸：半徑 50，8/12/16 傷害' },
  fireWall: { type: 'wall', name: '火牆', tags: ['fire', 'fort'], text: '城牆灼燒貼牆的敵人 2/4/6 每 0.5 秒' },
  frostArrow: { type: 'archer', name: '冰箭', tags: ['frost', 'bow'], text: '弓箭手緩速敵人 40%：1.5/2/2.5 秒' },
  frostAura: { type: 'castle', name: '寒霧', tags: ['frost'], text: '燈光內敵人移速 −10/20/30%' },
  frostShield: { type: 'shield', name: '霜盾', tags: ['frost', 'fort'], text: '盾兵的攻擊凍住敵人 0.33/0.67/1 秒' },
  thunder: { type: 'castle', name: '落雷', tags: ['storm'], text: '每 5/4.2/3.3 秒雷擊血最多的敵人 25/35/45' },
  chain: { type: 'archer', name: '感電', tags: ['storm', 'bow'], text: '弓箭手每第 4 箭放電，跳 2/3/4 隻' },
  rod: { type: 'castle', name: '避雷塔', tags: ['storm', 'fort'], text: '主城光束連鎖 0/1/2 隻、攻速 +15%/級' },
  shieldWall: { type: 'shield', name: '盾陣', tags: ['fort'], text: '盾兵血量 +40%/級、防禦 +1/級' },
  prayer: { type: 'priest', name: '祝禱', tags: ['fort'], text: '牧師治療 +50%/級，並治療目標旁 40 內友軍' },
  chant: { type: 'priest', name: '速詠', tags: ['fort'], text: '牧師詠唱 −25%/級、施法間隔 −15%/級' },
  blessing: { type: 'priest', name: '庇護', tags: ['fort'], text: '被治療的友軍 3 秒內防禦 +1/2/3' },
  charge: { type: 'shield', name: '衝鋒', tags: ['fort'], text: '盾兵迎敵距離 +30/級、追擊距離 +20/級、攻擊 +2/級' },
  cleave: { type: 'shield', name: '橫掃', tags: ['fort'], text: '盾兵每擊多打目標旁 1/2/3 隻' },
  longbow: { type: 'archer', name: '長弓', tags: ['bow'], text: '弓箭手射程 +20/級' },
  sturdy: { type: 'archer', name: '穩步', tags: ['bow'], text: '弓箭手血量 +30%/級、被推開的距離 −30%/級' },
  stoneWall: { type: 'wall', name: '石牆', tags: ['fort'], text: '城牆耐久 +50%/級、防禦 +1/級，選到時全牆補滿' },
  beacon: { type: 'castle', name: '燈塔', tags: ['fort'], text: '燈光半徑（放置範圍、主城射程）+40/級' },
  bounty: { type: 'economy', name: '賞金', tags: ['gold'], text: '擊殺金幣 +50%/級' },
  ranch: { type: 'economy', name: '牧場', tags: ['gold'], text: '每 10 秒 +4/8/12 金幣' },
  artisan: { type: 'worker', name: '工匠', tags: ['fort'], text: '工人修復 +50%/級、血量 +30%/級' },
});
export const CARD_IDS = Object.freeze(Object.keys(CARDS));
// Card types (by unit) for ignore / lock.
export const CARD_TYPES = Object.freeze({ archer: '弓箭手', shield: '盾兵', priest: '牧師', worker: '工人', castle: '主城', wall: '城牆', economy: '經濟' });

export const EVOS = Object.freeze({
  arrowStorm: { name: '箭雨', from: 'rapid', with: 'split', text: '每 4 秒朝最密的怪群降 3 波箭雨（半徑 90，每波 8）' },
  inferno: { name: '煉獄', from: 'burst', with: 'fireArrow', text: '死亡爆炸半徑 80，並點燃周圍敵人' },
  tempest: { name: '雷暴', from: 'thunder', with: 'rod', text: '落雷一次打 3 隻，每道都會跳' },
  winter: { name: '永冬', from: 'frostAura', with: 'frostArrow', text: '每 5 秒冰封燈光內所有敵人 1 秒' },
});
export const EVO_IDS = Object.freeze(Object.keys(EVOS));

// Tag synergies: active when you own `n` different cards with that tag.
export const SYNERGY = Object.freeze({
  fire: { n: 2, name: '燎原', text: '燃燒中的敵人死亡時，火焰傳給 50 內的敵人' },
  frost: { n: 2, name: '碎冰', text: '緩速中的敵人每次受傷 +2' },
  storm: { n: 2, name: '導電', text: '所有電擊多跳 1 隻；落雷間隔 ×2/3' },
  bow: { n: 3, name: '鷹眼', text: '弓箭手射程與警戒 +40' },
  fort: { n: 3, name: '鐵壁', text: '城牆、盾兵、主城防禦 +2' },
  gold: { n: 2, name: '豐收', text: '寶箱多 1 張' },
});
export const TAGS = Object.freeze(Object.keys(SYNERGY));
// Element reactions: active when you own at least one card of both elements.
export const REACTIONS = Object.freeze({
  steam: { a: 'fire', b: 'frost', name: '蒸汽', text: '同時燃燒＋緩速的敵人爆出蒸汽：半徑 40，12 傷害' },
  overload: { a: 'fire', b: 'storm', name: '超載', text: '電擊打到燃燒中的敵人：爆炸半徑 40，10 傷害' },
  shatter: { a: 'frost', b: 'storm', name: '凍雷', text: '電擊打到緩速中的敵人：冰封 0.67 秒' },
});

// --- §5.6 spawn script (gdd/07) ---
export const GATES = 8, SPAWN_R = 700;
export const PREWARN_TICKS = 360, LULL_TICKS = 480, EVENT_CLEAR_TICKS = 30 * TPS;
const s = t => Math.round(t * TPS);
// The trickle tiers and the event timeline come from the stage (stages.js buildScript); they live on sim.script.
export const SPAWN_GAP = 12;

// --- §6 scoring ---
export const SCORE = Object.freeze({ eventClear: 40, eventPerSec: 5, boss: 300, bossPerSec: 10, castlePct: 2, vet: 10 });

// ---------------------------------------------------------------------------------------------
const F = v => v * ONE;                                     // px -> fixed
const isqrt = n => Math.floor(Math.sqrt(n));                // exact for n < 2^52
const d2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const within = (ax, ay, bx, by, r) => d2(ax, ay, bx, by) <= F(r) * F(r);
const perTick = pxPerSec => Math.trunc(F(pxPerSec) / TPS);
const emit = (sim, ev) => { if (sim.recordEvents) sim.events.push(ev); };
export function damage(atk, dmg, armor, def) { return Math.max(1, Math.floor((dmg * COUNTER[atk][armor]) / 100) - def); }

function gateXY(g) { const a = (g * 32 + 192) & 255; return [F(CX) + COS[a] * SPAWN_R, F(CY) + SIN[a] * SPAWN_R]; }   // gate 0 = top

export function createSim(seed, stage = DEFAULT_STAGE) {
  const script = buildScript(stage);
  const sim = {
    seed: seed >>> 0, stage, script, tick: 0, killScore: 0, eventScore: 0, bossScore: 0,
    gold: START_GOLD, xp: 0, level: 0, picks: 0, pending: 0, rerolls: REROLLS, ignores: IGNORES, locks: LOCKS, lockType: '',
    cards: Object.fromEntries(CARD_IDS.map(id => [id, 0])), evo: Object.fromEntries(EVO_IDS.map(id => [id, false])),
    owned: [], ignored: Object.fromEntries(Object.keys(CARD_TYPES).map(t => [t, false])), offer: null, rerollN: 0,
    chests: 0, chestKillN: 0, synOn: Object.fromEntries(TAGS.map(t => [t, false])), reactOn: {},
    thunderCd: 0, rainCd: 0, rain: null, winterCd: 0, arrowN: 0,
    castle: { hp: CASTLE.hp, cd: 0, queue: 0, progress: 0 },
    slots: SLOTS.map(() => ({ kind: '', lv: 0, hp: 0, build: 0, queue: [], progress: 0 })),
    walls: Array.from({ length: WALL_SEGS }, () => ({ lv: 0, hp: 0 })),
    units: Array.from({ length: MAX_UNITS }, () => ({ alive: false })),
    unitGen: 0,
    foes: [], foeId: 0,
    trickleNext: 60, trickleN: 0,
    eventState: script.events.map(() => ({ started: false, spawned: 0, total: 0, alive: 0, cleared: false, gates: [0, 0] })),
    spawnQueue: [],
    cmd: [], curFoe: -1, kills: 0, bossDead: false, bossTick: 0,
    events: [], recordEvents: true,
  };
  for (let e = 0; e < script.events.length; e++) {
    const a = rng.int(sim.seed, 'event', e, GATES), n = (a + 1 + rng.int(sim.seed, 'event', e + 100, GATES - 1)) % GATES;
    sim.eventState[e].gates = [a, n];
  }
  spawnUnit(sim, 'archer', F(CX), F(CY + 90));               // the opening archer
  return sim;
}

export const lv = (sim, id) => sim.cards[id];
export const barracksCount = sim => sim.slots.reduce((n, sl) => n + (sl.kind === 'barracks' ? 1 : 0), 0);
export const barracksCost = sim => BARRACKS.cost + BARRACKS.costStep * barracksCount(sim);
export const popCap = sim => Math.min(POP_MAX, POP_BASE + sim.level + POP_PER_BARRACKS * barracksCount(sim));
export const pop = sim => sim.units.reduce((n, u) => n + (u.alive && !u.free ? 1 : 0), 0) + sim.slots.reduce((n, sl) => n + sl.queue.length, 0) + sim.castle.queue;
export const workerCount = sim => sim.units.reduce((n, u) => n + (u.alive && u.kind === 'worker' ? 1 : 0), 0) + sim.castle.queue;
export const barracksMaxHp = sl => BARRACKS.hp[Math.max(1, sl.lv) - 1];
export const lightR = sim => LIGHT_BASE + 40 * sim.cards.beacon;
export const tagCount = (sim, tag) => CARD_IDS.reduce((n, id) => n + (sim.cards[id] > 0 && CARDS[id].tags.includes(tag) ? 1 : 0), 0);
export const synergy = (sim, tag) => sim.synOn[tag];
const hasEl = (sim, tag) => tagCount(sim, tag) > 0;
export const reaction = (sim, id) => !!sim.reactOn[id];
const fortDef = sim => (sim.synOn.fort ? 2 : 0);
export const wallMaxHp = (sim, lv) => (lv > 0 ? Math.trunc((WALL[lv].hp * (100 + 50 * sim.cards.stoneWall)) / 100) : 0);
const wallDef = (sim, lv) => WALL[lv].def + sim.cards.stoneWall + fortDef(sim);

function spawnUnit(sim, kind, x, y, free = false) {
  const i = sim.units.findIndex(u => !u.alive);
  if (i < 0) return -1;
  const d = UNIT[kind];
  sim.units[i] = { alive: true, gen: ++sim.unitGen, kind, lv: 1, xp: 0, xpAcc: 0, hp: d.hp, x, y, hx: x, hy: y,
    state: 'guard', cd: 0, redeploy: 0, setup: 0, target: -1, free, hurt: 0, job: -1, idle: 0, retreat: false, cast: 0, healTo: -1, bless: 0, blessDef: 0 };
  sim.units[i].hp = unitMaxHp(sim, sim.units[i]);
  emit(sim, { type: 'unitTrained', i, kind });
  return i;
}
export const unitMaxHp = (sim, u) => {
  const base = Math.trunc((UNIT[u.kind].hp * LV_MUL[u.lv - 1]) / 100);
  if (u.kind === 'worker') return Math.trunc((base * (100 + 30 * sim.cards.artisan)) / 100);
  if (u.kind === 'archer') return Math.trunc((base * (100 + 30 * sim.cards.sturdy)) / 100);
  return u.kind === 'shield' ? Math.trunc((base * (100 + 40 * sim.cards.shieldWall)) / 100) : base;
};
const unitDef = (sim, u) => UNIT[u.kind].def + LV_DEF[u.lv - 1] + (u.kind === 'shield' ? sim.cards.shieldWall + fortDef(sim) : 0) + (u.blessDef || 0);
const unitDmg = (sim, u) => {
  const v = Math.trunc(((UNIT[u.kind].dmg ?? UNIT[u.kind].heal) * LV_MUL[u.lv - 1]) / 100);
  if (u.kind === 'shield') return v + 2 * sim.cards.charge;
  return u.kind === 'priest' ? Math.trunc((v * (100 + 50 * sim.cards.prayer)) / 100) : v;
};
const unitPeriod = (sim, u) => (u.kind === 'archer' ? Math.trunc((UNIT.archer.period * (100 - 15 * sim.cards.rapid)) / 100) : UNIT[u.kind].period);
export const unitReach = (sim, u) => (u.kind === 'archer' ? archerReachOf(sim, u) : u.kind === 'shield' ? shieldEngage(sim) : UNIT[u.kind].range);

function gainXp(sim, i, n) {
  const u = sim.units[i];
  if (!u.alive || u.lv >= 3) return;
  u.xp += n;
  while (u.lv < 3 && u.xp >= XP_LV[u.lv - 1]) {
    const before = unitMaxHp(sim, u);
    u.lv++;
    u.hp += unitMaxHp(sim, u) - before;
    emit(sim, { type: 'unitLevelUp', i, lv: u.lv });
  }
}

// --- placement rule (§5.4) ---
export function canPlace(sim, x, y, self = -1) {
  if (within(x, y, F(CX), F(CY), lightR(sim))) return true;
  for (let i = 0; i < MAX_UNITS; i++) { const u = sim.units[i]; if (i !== self && u.alive && within(x, y, u.x, u.y, DEPLOY_NEAR_ALLY)) return true; }
  for (let k = 0; k < SLOTS.length; k++) if (sim.slots[k].kind && within(x, y, F(SLOTS[k][0]), F(SLOTS[k][1]), DEPLOY_NEAR_ALLY)) return true;
  return false;
}

// --- commands ---
function applyByte(sim, b) {
  if (sim.cmd.length === 0) { if (b !== 0) sim.cmd.push(b); return; }
  sim.cmd.push(b);
  if (sim.cmd.length < 3) return;
  const [op, a, c] = sim.cmd;
  sim.cmd = [];
  runCommand(sim, op, a, c);
}

function runCommand(sim, op, a, b) {
  if (op === OP.BUILD) {                                    // a = slot; only barracks are bought with gold
    const sl = sim.slots[a];
    const cost = barracksCost(sim);
    if (!sl || sl.kind || b !== 0 || sim.gold < cost) return;
    sim.gold -= cost;
    Object.assign(sl, { kind: 'barracks', lv: 1, hp: 1, build: BUILD_TICKS, queue: [], progress: 0 });
    emit(sim, { type: 'build', slot: a, kind: 'barracks' });
  } else if (op === OP.MENU) {
    if (a === 255) {                                        // castle: 0 = train a worker
      if (b !== 0 || sim.castle.queue >= QUEUE_MAX || workerCount(sim) >= WORKER_MAX || pop(sim) >= popCap(sim) || sim.gold < UNIT.worker.cost) return;
      sim.gold -= UNIT.worker.cost; sim.castle.queue++;
      emit(sim, { type: 'queued', slot: 255, kind: 'worker' });
      return;
    }
    const sl = sim.slots[a];                                // barracks: 0 archer / 1 shield / 2 priest / 3 upgrade
    if (!sl || sl.kind !== 'barracks' || sl.build > 0) return;
    if (b === 3) {
      if (sl.lv >= 3 || sim.gold < BARRACKS.up[sl.lv - 1]) return;
      sim.gold -= BARRACKS.up[sl.lv - 1]; sl.lv++; sl.hp += BARRACKS.hp[sl.lv - 1] - BARRACKS.hp[sl.lv - 2];
      emit(sim, { type: 'upgrade', slot: a, lv: sl.lv });
      return;
    }
    const kind = UNIT_KINDS[b];
    if (!kind || sl.lv < UNIT[kind].barracksLv || sl.queue.length >= QUEUE_MAX || pop(sim) >= popCap(sim) || sim.gold < UNIT[kind].cost) return;
    sim.gold -= UNIT[kind].cost; sl.queue.push(kind);
    emit(sim, { type: 'queued', slot: a, kind });
  } else if (op === OP.MOVE) {                              // a = unit index, b = cell (workers decide for themselves)
    const u = sim.units[a];
    if (!u || !u.alive || u.kind === 'worker' || u.redeploy > 0 || b >= GRID_W * GRID_H) return;
    const [px, py] = cellCenter(b), x = F(px), y = F(py);
    if (!canPlace(sim, x, y, a)) return;
    u.hx = x; u.hy = y; u.state = 'moving'; u.redeploy = REDEPLOY_CD; u.target = -1;
    emit(sim, { type: 'unitMoved', i: a, x: px, y: py });
  } else if (op === OP.WALL) {                              // a = segment, b = 0 build / upgrade
    const w = sim.walls[a];
    if (!w || b !== 0 || w.lv >= 3) return;
    const next = w.lv + 1;
    if (sim.gold < WALL[next].cost) return;
    const before = wallMaxHp(sim, w.lv);
    sim.gold -= WALL[next].cost; w.lv = next; w.hp = w.hp + wallMaxHp(sim, next) - before;
    emit(sim, { type: 'wallBuild', seg: a, lv: next });
  }
}

// --- level-ups and offers (gdd/06 §2) ---
// The k-th offer (k = picks made so far) and its r-th reroll come from a seeded weighted order of the card list:
// every card holds 2 tickets, cards of the locked type 3 (×1.5); maxed cards and ignored types are left out.
// Integer tickets only, so every engine draws the same order. A ready evolution always comes first, then the first
// card you already own in that order, then the rest of the order.
export function readyEvos(sim) { return EVO_IDS.filter(e => !sim.evo[e] && sim.cards[EVOS[e].from] >= CARD_MAX && sim.cards[EVOS[e].with] > 0); }
export const cardOk = (sim, id) => sim.cards[id] < CARD_MAX && !sim.ignored[CARDS[id].type];
function offerOrder(sim) {
  const pool = CARD_IDS.filter(id => cardOk(sim, id)), order = [];
  const w = id => (CARDS[id].type === sim.lockType ? 3 : 2);
  const base = (sim.picks * 8 + sim.rerollN) * 64;
  for (let j = 0; pool.length; j++) {
    let t = rng.int(sim.seed, 'offer', base + j, pool.reduce((n, id) => n + w(id), 0)), k = 0;
    while (t >= w(pool[k])) t -= w(pool[k++]);
    order.push(pool.splice(k, 1)[0]);
  }
  return order;
}
function drawOffer(sim) {
  const order = offerOrder(sim);
  const ids = [];
  const evo = readyEvos(sim)[0];
  if (evo) ids.push(evo);
  const owned = order.find(id => sim.cards[id] > 0);       // one slot always levels something you own
  if (owned) ids.push(owned);
  for (const id of order) { if (ids.length >= 3) break; if (!ids.includes(id)) ids.push(id); }
  while (ids.length < 3) ids.push('pouch');
  sim.offer = { ids, k: sim.picks };
  emit(sim, { type: 'offer', ids: ids.slice(), k: sim.picks });
}
function applyCard(sim, id, how) {
  if (id === 'pouch') { sim.gold += POUCH_GOLD; emit(sim, { type: 'card', id, lv: 0, how }); return; }
  if (EVOS[id]) { sim.evo[id] = true; emit(sim, { type: 'evolve', id, how }); return; }
  const lvl = ++sim.cards[id];
  if (lvl === 1) sim.owned.push(id);
  if (id === 'reinforce') for (let n = 0; n <= lvl; n++) spawnUnit(sim, 'archer', F(CX - 30 + n * 20), F(CY + 80), true);
  if (id === 'stoneWall') for (const w of sim.walls) if (w.lv > 0) w.hp = wallMaxHp(sim, w.lv);
  if (id === 'shieldWall') for (const u of sim.units) if (u.alive && u.kind === 'shield') u.hp = Math.min(unitMaxHp(sim, u), u.hp + 40);
  emit(sim, { type: 'card', id, lv: lvl, how });
  refreshCombos(sim);
}
function refreshCombos(sim) {
  for (const t of TAGS) {
    const on = tagCount(sim, t) >= SYNERGY[t].n;
    if (on && !sim.synOn[t]) emit(sim, { type: 'synergy', tag: t, name: SYNERGY[t].name });
    sim.synOn[t] = on;
  }
  for (const [id, r] of Object.entries(REACTIONS)) {
    const on = hasEl(sim, r.a) && hasEl(sim, r.b);
    if (on && !sim.reactOn[id]) emit(sim, { type: 'reactionOn', id, name: r.name });
    sim.reactOn[id] = on;
  }
}

export function choose(sim, index) {
  const o = sim.offer;
  if (!o || !Number.isInteger(index)) return false;
  if (index >= 0 && index < 3) {
    sim.offer = null; sim.picks++; sim.pending--; sim.rerollN = 0;
    applyCard(sim, o.ids[index], 'pick');
  } else if (index === CHOICE.REROLL) {
    if (sim.rerolls <= 0) return false;
    sim.rerolls--; sim.rerollN++;
    drawOffer(sim);
  } else if (index >= CHOICE.IGNORE && index < CHOICE.IGNORE + 3) {   // this type never shows again this match
    const id = o.ids[index - CHOICE.IGNORE];
    if (sim.ignores <= 0 || !CARDS[id]) return false;
    sim.ignores--; sim.ignored[CARDS[id].type] = true;
    emit(sim, { type: 'ignore', cardType: CARDS[id].type });
    drawOffer(sim);
  } else if (index >= CHOICE.LOCK && index < CHOICE.LOCK + 3) {       // this type comes up 50% more often
    const id = o.ids[index - CHOICE.LOCK];
    if (sim.locks <= 0 || !CARDS[id] || CARDS[id].type === sim.lockType) return false;
    sim.locks--; sim.lockType = CARDS[id].type;
    emit(sim, { type: 'lock', cardType: sim.lockType });
  } else return false;
  if (!sim.offer && sim.pending > 0) drawOffer(sim);
  return true;
}

function gainWatchXp(sim, n) {
  if (sim.level >= LEVEL_MAX) return;
  sim.xp += n;
  while (sim.level < LEVEL_MAX && sim.xp >= XP_NEED(sim.level)) {
    sim.xp -= XP_NEED(sim.level); sim.level++; sim.pending++;
    emit(sim, { type: 'levelUp', level: sim.level });
  }
}

// Chests: clearing a chest event in time, boss kills, and the kill milestones in CHEST_KILLS.
function openChest(sim, why, bonus = 0) {
  sim.chests++;
  let n = CHEST_CARDS[why] + bonus;
  if (sim.synOn.gold) n++;
  const ups = [];
  for (let j = 0; j < n; j++) {
    const evo = readyEvos(sim)[0];
    if (evo) { ups.push(evo); applyCard(sim, evo, 'chest'); continue; }
    // the lowest-level card you own, oldest first: a fixed rule, so the player can plan around it
    let id = 'pouch';
    for (const k of sim.owned) if (sim.cards[k] < CARD_MAX && (id === 'pouch' || sim.cards[k] < sim.cards[id])) id = k;
    ups.push(id); applyCard(sim, id, 'chest');
  }
  emit(sim, { type: 'chest', n, ups, why });
}

// --- spawning ---
function spawnFoe(sim, kind, gate, ev) {
  if (sim.foes.length >= MAX_FOES) return;
  const [x, y] = gateXY(gate), d = FOE[kind];
  const detour = d.wall === 'detour' || (d.wall === 'mixed' && rng.int(sim.seed, 'foe', sim.foeId, 2) === 1);
  const hp = d.boss ? d.hp : Math.trunc((d.hp * foeHpPct(Math.trunc(sim.tick / TPS))) / 100);
  sim.foes.push({ id: sim.foeId++, kind, x, y, hp, cd: 0, ev, tKind: '', target: -1, gate, burn: 0, burnDmg: 0, slow: 0, stun: 0, done: false, detour });
  if (ev >= 0) sim.eventState[ev].alive++;
  emit(sim, { type: 'spawn', kind, gate, id: sim.foeId - 1, hp });
}

function tierAt(sim, t) { const tr = sim.script.trickle; let k = 0; while (k + 1 < tr.length && t >= tr[k + 1].from) k++; return tr[k]; }
export const lullUntil = sim => sim.eventState.reduce((m, e) => (e.cleared ? Math.max(m, e.clearTick + LULL_TICKS) : m), 0);

function stepSpawns(sim) {
  const EVENTS = sim.script.events;
  for (let e = 0; e < EVENTS.length; e++) {
    const ev = EVENTS[e], st = sim.eventState[e];
    if (sim.tick === ev.at - PREWARN_TICKS || (ev.at < PREWARN_TICKS && sim.tick === 0)) emit(sim, { type: 'prewarn', ev: e, gates: st.gates, name: ev.name });
    if (sim.tick === ev.at) {
      st.started = true;
      let k = 0;
      for (const g of ev.groups) {
        const gates = g.gate === 'all' ? [0, 1, 2, 3, 4, 5, 6, 7] : [g.gate === 'a' ? st.gates[0] : g.gate === 'b' ? (st.gates[0] + 4) % 8 : st.gates[1]];
        for (const gate of gates) for (let n = 0; n < g.n; n++) { sim.spawnQueue.push({ tick: sim.tick + k * 3 + n * SPAWN_GAP, kind: g.kind, gate, ev: e }); st.total++; }
        k++;
      }
      emit(sim, { type: 'eventStart', ev: e, name: ev.name, gates: st.gates });
    }
  }
  if (sim.tick >= sim.trickleNext) {
    const tier = tierAt(sim, sim.tick), i = sim.trickleN++;
    const lull = sim.tick < lullUntil(sim);
    const count = lull ? 1 : 1 + rng.int(sim.seed, 'trickle', i * 3, 2 + (sim.tick > 120 * TPS ? 1 : 0));
    const gate = (rng.int(sim.seed, 'trickle', i * 3 + 1, tier.gates) * (8 / tier.gates)) % 8;
    for (let n = 0; n < count; n++) {
      const kind = tier.kinds[rng.int(sim.seed, 'trickle', i * 3 + 2 + n * 1000, tier.kinds.length)];
      sim.spawnQueue.push({ tick: sim.tick + n * SPAWN_GAP, kind, gate, ev: -1 });
    }
    sim.trickleNext = sim.tick + (lull ? tier.period * 2 : tier.period);
  }
  if (sim.spawnQueue.length) {
    const keep = [];
    for (const q of sim.spawnQueue) { if (q.tick <= sim.tick) { spawnFoe(sim, q.kind, q.gate, q.ev); if (q.ev >= 0) sim.eventState[q.ev].spawned++; } else keep.push(q); }
    sim.spawnQueue = keep;
  }
}

// --- economy ---
function stepEconomy(sim) {
  const c = sim.castle;
  if (c.queue > 0 && ++c.progress >= UNIT.worker.train) {
    c.progress = 0; c.queue--;
    const i = spawnUnit(sim, 'worker', F(CX - 30), F(CY + 70));
    if (i >= 0) emit(sim, { type: 'workerBorn', i });
  }
  for (let k = 0; k < SLOTS.length; k++) {
    const sl = sim.slots[k];
    if (sl.kind !== 'barracks') continue;
    if (sl.build > 0) { sl.build--; sl.hp = Math.max(sl.hp, Math.trunc((barracksMaxHp(sl) * (BUILD_TICKS - sl.build)) / BUILD_TICKS)); continue; }
    if (sl.queue.length && ++sl.progress >= UNIT[sl.queue[0]].train) {
      sl.progress = 0;
      spawnUnit(sim, sl.queue.shift(), F(SLOTS[k][0]), F(SLOTS[k][1] + 40));
    }
  }
  if (sim.cards.ranch && sim.tick % 600 === 599) {            // the 牧場 card: gold on a timer, no building
    const amount = 4 * sim.cards.ranch;
    sim.gold += amount;
    emit(sim, { type: 'produce', amount });
  }
}

// --- movement helpers ---
function moveToward(e, tx, ty, speed) {
  const dx = tx - e.x, dy = ty - e.y, dd = dx * dx + dy * dy;
  if (dd === 0) return true;
  const d = isqrt(dd), st = perTick(speed);
  if (d <= st) { e.x = tx; e.y = ty; return true; }
  e.x += Math.trunc((dx * st) / d); e.y += Math.trunc((dy * st) / d);
  return false;
}
const segCache = new Map();
function wallSegAt(x, y) {
  const cx = Math.floor(x / ONE / 8), cy = Math.floor(y / ONE / 8), key = cx * 100003 + cy;
  let v = segCache.get(key);
  if (v === undefined) { v = segOf(angleOf(cx * 8 + 4 - CX, cy * 8 + 4 - CY)); segCache.set(key, v); }
  return v;
}

// --- foes ---
function foeRetarget(sim, f) {
  const d = FOE[f.kind];
  f.tKind = ''; f.target = -1;
  let best = -1, bestD = Infinity;
  if (!d.fly) {                                            // buildings first: a barracks in reach draws every ground foe
    for (let k = 0; k < SLOTS.length; k++) {
      if (sim.slots[k].kind !== 'barracks') continue;
      const dd = d2(f.x, f.y, F(SLOTS[k][0]), F(SLOTS[k][1]));
      if (dd <= F(BLDG_AGGRO) * F(BLDG_AGGRO) && dd < bestD) { bestD = dd; best = k; }
    }
    if (best >= 0) { f.tKind = 'slot'; f.target = best; return; }
  }
  for (let i = 0; i < MAX_UNITS; i++) {
    const u = sim.units[i];
    if (!u.alive) continue;
    const r = UNIT[u.kind].taunt ?? 40, dd = d2(f.x, f.y, u.x, u.y);
    if (dd <= F(r) * F(r) && dd < bestD) { bestD = dd; best = i; }
  }
  if (best >= 0) { f.tKind = 'unit'; f.target = best; return; }
  if (d.fly) {
    for (let k = 0; k < SLOTS.length; k++) {
      if (sim.slots[k].kind !== 'barracks') continue;
      const dd = d2(f.x, f.y, F(SLOTS[k][0]), F(SLOTS[k][1]));
      if (dd < bestD) { bestD = dd; best = k; }
    }
    if (best >= 0) { f.tKind = 'slot'; f.target = best; }
  }
}

function hurtUnit(sim, i, dmg, atk) {
  const u = sim.units[i], dd = damage(atk, dmg, UNIT[u.kind].armor, unitDef(sim, u));
  u.hp -= dd; u.hurt = 120;
  if (u.kind === 'shield') { u.xpAcc += dd; while (u.xpAcc >= 20) { u.xpAcc -= 20; gainXp(sim, i, 1); } }
  emit(sim, { type: 'hit', who: 'unit', i, dmg: dd, counter: COUNTER[atk][UNIT[u.kind].armor] - 100 });
  if (u.hp <= 0) { u.alive = false; emit(sim, { type: 'unitDown', i, kind: u.kind }); }
}
function hurtSlot(sim, k, dmg, atk) {
  const sl = sim.slots[k];
  if (sl.kind !== 'barracks') return;
  sl.hp -= damage(atk, dmg, ARMOR.bldg, 2);
  emit(sim, { type: 'hit', who: 'slot', k, by: sim.curFoe });
  if (sl.hp <= 0) {
    emit(sim, { type: 'bldgDown', slot: k, kind: sl.kind });
    Object.assign(sl, { kind: '', hp: 0, build: 0, queue: [], progress: 0 });
  }
}
function hurtWall(sim, w, dmg, atk) {
  const wl = sim.walls[w], max = wallMaxHp(sim, wl.lv), before = wl.hp;
  wl.hp -= damage(atk, dmg, ARMOR.bldg, wallDef(sim, wl.lv));
  emit(sim, { type: 'wallHit', seg: w, crack: before * 10 >= max * 6 && wl.hp * 10 < max * 6, by: sim.curFoe });
  if (wl.hp <= 0) { wl.lv = 0; wl.hp = 0; emit(sim, { type: 'wallBreak', seg: w }); }
}
function hurtCastle(sim, dmg, atk) {
  sim.castle.hp -= damage(atk, dmg, ARMOR.bldg, CASTLE.def + fortDef(sim));
  emit(sim, { type: 'castleHit', by: sim.curFoe });
}

function splash(sim, x, y, r, dmg, atk) {                  // enemy area attacks: hit our side
  for (let i = 0; i < MAX_UNITS; i++) { const u = sim.units[i]; if (u.alive && within(x, y, u.x, u.y, r)) hurtUnit(sim, i, dmg, atk); }
  for (let k = 0; k < SLOTS.length; k++) if (sim.slots[k].kind === 'barracks' && within(x, y, F(SLOTS[k][0]), F(SLOTS[k][1]), r)) hurtSlot(sim, k, dmg, atk);
  const seg = wallSegAt(x, y), wl = sim.walls[seg];
  const rr = isqrt(d2(x, y, F(CX), F(CY)));
  if (wl.lv > 0 && Math.abs(rr - F(WALL_R)) <= F(r)) hurtWall(sim, seg, dmg, atk);
  if (within(x, y, F(CX), F(CY), r + CASTLE.r)) hurtCastle(sim, dmg, atk);
}

function foeSpeed(sim, f, d) {
  let v = d.speed;
  if (f.slow > 0) v = Math.trunc((v * 60) / 100);
  const fa = sim.cards.frostAura;
  if (fa && within(f.x, f.y, F(CX), F(CY), lightR(sim))) v = Math.trunc((v * (100 - 10 * fa)) / 100);
  return v;
}

function stepFoe(sim, fi) {
  const f = sim.foes[fi], d = FOE[f.kind];
  if (f.burn > 0) { f.burn--; if (f.burn % 30 === 0) trueHurt(sim, fi, f.burnDmg, 'burn'); if (f.hp <= 0) return; }
  if (f.slow > 0) f.slow--;
  if (f.stun > 0) { f.stun--; return; }
  if (f.cd > 0) f.cd--;
  if ((f.id + sim.tick) % 6 === 0) foeRetarget(sim, f);
  if (f.tKind === 'unit' && !sim.units[f.target].alive) { f.tKind = ''; f.target = -1; }
  if (f.tKind === 'slot' && sim.slots[f.target].kind !== 'barracks') { f.tKind = ''; f.target = -1; }
  const speed = foeSpeed(sim, f, d);

  const attack = fn => { if (f.cd === 0) { f.cd = d.period; fn(); emit(sim, { type: 'foeAtk', id: f.id }); if (d.boom) { f.hp = 0; f.boomed = true; } } };
  const boom = () => { splash(sim, f.x, f.y, d.boom, d.dmg, d.atk); emit(sim, { type: 'boom', x: f.x / ONE, y: f.y / ONE }); };
  if (d.boom && f.tKind === 'unit' && within(f.x, f.y, sim.units[f.target].x, sim.units[f.target].y, d.range + 8)) { attack(boom); return; }
  if (f.tKind === 'unit') {
    const u = sim.units[f.target];
    if (within(f.x, f.y, u.x, u.y, d.range + 8)) {
      attack(() => { if (d.aoe) splash(sim, u.x, u.y, d.aoe, d.dmg, d.atk); else { hurtUnit(sim, f.target, d.dmg, d.atk); if (u.alive && u.kind === 'archer' && !d.ranged) pushUnit(sim, u, f); } });
      return;
    }
    moveToward(f, u.x, u.y, speed); return;
  }
  if (f.tKind === 'slot') {
    const tx = F(SLOTS[f.target][0]), ty = F(SLOTS[f.target][1]);
    if (within(f.x, f.y, tx, ty, d.range + 24)) { attack(() => hurtSlot(sim, f.target, d.dmg, d.atk)); return; }
    moveToward(f, tx, ty, speed); return;
  }
  const r = isqrt(d2(f.x, f.y, F(CX), F(CY)));
  if (!d.fly) {
    const seg = wallSegAt(f.x, f.y), wl = sim.walls[seg];
    const reach = d.ranged ? d.range : d.range + 8;
    if (wl.lv > 0 && r > F(WALL_R) && r <= F(WALL_R + Math.max(reach, DETOUR_BAND))) {
      const dir = f.detour ? gapDir(sim, seg) : 0;
      if (dir) {                                              // walk along the outside of the ring, one segment at a time
        const a = segAngle((seg + dir + WALL_SEGS) % WALL_SEGS);
        moveToward(f, F(CX) + COS[a] * (WALL_R + DETOUR_BAND - 8), F(CY) + SIN[a] * (WALL_R + DETOUR_BAND - 8), speed);
        return;
      }
      if (r <= F(WALL_R + reach)) { attack(() => (d.boom ? boom() : hurtWall(sim, seg, d.dmg, d.atk))); return; }
    }
    for (let k = 0; k < SLOTS.length; k++) {
      if (sim.slots[k].kind === 'barracks' && within(f.x, f.y, F(SLOTS[k][0]), F(SLOTS[k][1]), 30 + d.range)) { attack(() => (d.boom ? boom() : hurtSlot(sim, k, d.dmg, d.atk))); return; }
    }
  }
  if (r <= F(CASTLE.r + d.range)) { attack(() => (d.boom ? boom() : hurtCastle(sim, d.dmg, d.atk))); return; }
  moveToward(f, F(CX), F(CY), speed);
}

// --- our damage and card effects ---
function hurtFoe(sim, fi, dmg, atk, by) {
  const f = sim.foes[fi], d = FOE[f.kind];
  if (f.hp <= 0) return;
  let dd = damage(atk, dmg, d.armor, d.def);
  if (f.slow > 0 && sim.synOn.frost) dd += 2;
  f.hp -= dd;
  emit(sim, { type: 'hit', who: 'foe', id: f.id, dmg: dd, counter: COUNTER[atk][d.armor] - 100 });
  if (f.hp <= 0 && by >= 0) gainXp(sim, by, 1);
}
function trueHurt(sim, fi, n, why) {
  const f = sim.foes[fi];
  if (f.hp <= 0 || n <= 0) return;
  f.hp -= n;
  emit(sim, { type: 'hit', who: 'foe', id: f.id, dmg: n, counter: 0, why });
}
function blastFoes(sim, x, y, r, dmg, atk, skip = -1) {
  for (let j = 0; j < sim.foes.length; j++) if (j !== skip && sim.foes[j].hp > 0 && within(x, y, sim.foes[j].x, sim.foes[j].y, r)) hurtFoe(sim, j, dmg, atk, -1);
}
function ignite(sim, fi, n, ticks = 120) {
  const f = sim.foes[fi];
  if (f.hp <= 0) return;
  f.burn = Math.max(f.burn, ticks); f.burnDmg = Math.max(f.burnDmg, n);
  react(sim, fi);
}
function chill(sim, fi, ticks) {
  const f = sim.foes[fi];
  if (f.hp <= 0) return;
  f.slow = Math.max(f.slow, ticks);
  react(sim, fi);
}
function react(sim, fi) {
  const f = sim.foes[fi];
  if (f.burn > 0 && f.slow > 0 && sim.reactOn.steam) {
    f.burn = 0; f.burnDmg = 0;
    emit(sim, { type: 'react', id: 'steam', x: f.x / ONE, y: f.y / ONE, r: 40 });
    blastFoes(sim, f.x, f.y, 40, 12, 'blast');
  }
}
// An electric strike that jumps between foes. Reactions fire on each foe it touches.
function zap(sim, fi, jumps, dmg, from) {
  if (sim.synOn.storm) jumps++;
  const pts = from ? [from] : [];
  const seen = new Set();
  let cur = fi;
  for (let j = 0; j <= jumps && cur >= 0; j++) {
    const f = sim.foes[cur];
    seen.add(cur); pts.push([f.x / ONE, f.y / ONE]);
    const wasBurning = f.burn > 0, wasSlow = f.slow > 0;
    hurtFoe(sim, cur, dmg, 'slash', -1);
    if (wasSlow && sim.reactOn.shatter && f.hp > 0) { f.stun = Math.max(f.stun, 40); emit(sim, { type: 'react', id: 'shatter', x: f.x / ONE, y: f.y / ONE, r: 20 }); }
    if (wasBurning && sim.reactOn.overload) { emit(sim, { type: 'react', id: 'overload', x: f.x / ONE, y: f.y / ONE, r: 40 }); blastFoes(sim, f.x, f.y, 40, 10, 'blast', cur); }
    let next = -1, bd = F(80) * F(80) + 1;
    for (let k = 0; k < sim.foes.length; k++) {
      if (seen.has(k) || sim.foes[k].hp <= 0) continue;
      const dd = d2(f.x, f.y, sim.foes[k].x, sim.foes[k].y);
      if (dd < bd) { bd = dd; next = k; }
    }
    cur = next;
  }
  emit(sim, { type: 'zap', pts });
}

// archer hit: card effects ride on every arrow
function archerHit(sim, i, fi) {
  const u = sim.units[i], f = sim.foes[fi], dmg = unitDmg(sim, u);
  hurtFoe(sim, fi, dmg, 'pierce', i);
  if (sim.cards.fireArrow) ignite(sim, fi, sim.evo.inferno ? 3 : sim.cards.fireArrow);
  if (sim.cards.frostArrow) chill(sim, fi, 60 + 30 * sim.cards.frostArrow);
  if (sim.cards.split) {
    let n = sim.cards.split;
    for (let k = 0; k < sim.foes.length && n > 0; k++) {
      if (k === fi || sim.foes[k].hp <= 0 || !within(f.x, f.y, sim.foes[k].x, sim.foes[k].y, 60)) continue;
      n--;
      emit(sim, { type: 'shot', i, kind: 'split', x: f.x / ONE, y: f.y / ONE, tx: sim.foes[k].x / ONE, ty: sim.foes[k].y / ONE });
      hurtFoe(sim, k, dmg, 'pierce', i);
      if (sim.cards.fireArrow) ignite(sim, k, sim.evo.inferno ? 3 : sim.cards.fireArrow);
      if (sim.cards.frostArrow) chill(sim, k, 60 + 30 * sim.cards.frostArrow);
    }
  }
  if (sim.cards.chain && ++sim.arrowN % 4 === 0) zap(sim, fi, 1 + sim.cards.chain, 6 + 2 * sim.cards.chain, [u.x / ONE, u.y / ONE]);
}

function nearestFoe(sim, x, y, r) {
  let best = -1, bestD = F(r) * F(r) + 1;
  for (let i = 0; i < sim.foes.length; i++) {
    const f = sim.foes[i];
    if (f.hp <= 0) continue;
    const dd = d2(x, y, f.x, f.y);
    if (dd < bestD) { bestD = dd; best = i; }
  }
  return best;
}

// --- allied units (gdd/04 §3.2): each kind has its own behaviour, every number in UNIT and tuned by cards ---
//   archer  never walks to a fight. Shoots what is in reach of where it stands; melee hits push it back (up to a
//           limit); when nothing has been in reach for a moment it walks back to its post.
//   shield  engages foes that come within its engage radius of its post, chases no further than its leash, and
//           falls back to its post when hurt below the retreat line until healed above the rally line.
//   priest  watches for an ally below the call line (the "heal signal"), walks to healing range (never past its
//           leash), chants for a moment, then the heal lands; the chant breaks if the target dies or leaves range.
const archerReachOf = (sim, u) => UNIT.archer.range + 20 * sim.cards.longbow + (sim.synOn.bow ? 40 : 0);
const shieldEngage = sim => UNIT.shield.engage + 30 * sim.cards.charge;
const shieldLeash = sim => UNIT.shield.leash + 20 * sim.cards.charge;
const priestCast = sim => Math.trunc((UNIT.priest.cast * (100 - 25 * sim.cards.chant)) / 100);
const priestPeriod = sim => Math.trunc((UNIT.priest.period * (100 - 15 * sim.cards.chant)) / 100);
export const archerPushMax = sim => Math.trunc((UNIT.archer.pushMax * (100 - 30 * sim.cards.sturdy)) / 100);

/** A melee hit shoves an archer away from the attacker, never further than pushMax from its post. */
function pushUnit(sim, u, f) {
  const max = archerPushMax(sim);
  if (max <= 0) return;
  const dx = u.x - f.x, dy = u.y - f.y, d = isqrt(dx * dx + dy * dy) || 1, st = F(UNIT.archer.push);
  let nx = u.x + Math.trunc((dx * st) / d), ny = u.y + Math.trunc((dy * st) / d);
  const hx = nx - u.hx, hy = ny - u.hy, hd = isqrt(hx * hx + hy * hy);
  if (hd > F(max)) { nx = u.hx + Math.trunc((hx * F(max)) / hd); ny = u.hy + Math.trunc((hy * F(max)) / hd); }
  u.x = nx; u.y = ny; u.idle = 0;
}

function unitStrike(sim, i, fi) {
  const u = sim.units[i], d = UNIT[u.kind], f = sim.foes[fi];
  u.cd = unitPeriod(sim, u);
  emit(sim, { type: 'shot', i, kind: u.kind, x: u.x / ONE, y: u.y / ONE, tx: f.x / ONE, ty: f.y / ONE });
  if (u.kind === 'archer') { archerHit(sim, i, fi); return; }
  hurtFoe(sim, fi, unitDmg(sim, u), d.atk, i);
  if (sim.cards.frostShield && f.hp > 0) { f.stun = Math.max(f.stun, 20 * sim.cards.frostShield); emit(sim, { type: 'react', id: 'freeze', x: f.x / ONE, y: f.y / ONE, r: 16 }); }
  let n = sim.cards.cleave;                                 // 橫掃: the swing also hits foes right next to the target
  for (let k = 0; k < sim.foes.length && n > 0; k++) {
    if (k === fi || sim.foes[k].hp <= 0 || !within(f.x, f.y, sim.foes[k].x, sim.foes[k].y, 30)) continue;
    n--; hurtFoe(sim, k, unitDmg(sim, u), d.atk, i);
  }
}

function stepArcher(sim, i) {
  const u = sim.units[i], d = UNIT.archer, reach = archerReachOf(sim, u);
  if ((i + sim.tick) % 4 === 0 || u.target < 0 || !sim.foes[u.target] || sim.foes[u.target].hp <= 0) u.target = nearestFoe(sim, u.x, u.y, reach);
  if (u.target >= 0) { u.idle = 0; if (u.cd === 0) unitStrike(sim, i, u.target); return; }
  if (++u.idle >= d.homeAfter) moveToward(u, u.hx, u.hy, d.speed);   // nothing in reach for a while: back to the post
}

function stepShield(sim, i) {
  const u = sim.units[i], d = UNIT.shield;
  const pct = Math.trunc((u.hp * 100) / unitMaxHp(sim, u));
  if (pct < d.retreatPct) u.retreat = true; else if (pct >= d.rallyPct) u.retreat = false;
  if (u.retreat) { moveToward(u, u.hx, u.hy, d.speed); u.target = -1; return; }
  if ((i + sim.tick) % 4 === 0 || u.target < 0 || !sim.foes[u.target] || sim.foes[u.target].hp <= 0) u.target = nearestFoe(sim, u.hx, u.hy, shieldEngage(sim));
  if (u.target < 0) { moveToward(u, u.hx, u.hy, d.speed); return; }
  const f = sim.foes[u.target];
  if (within(u.x, u.y, f.x, f.y, d.range + 8)) { if (u.cd === 0) unitStrike(sim, i, u.target); return; }
  const ox = u.x, oy = u.y;
  moveToward(u, f.x, f.y, d.speed);
  if (!within(u.x, u.y, u.hx, u.hy, shieldLeash(sim))) { u.x = ox; u.y = oy; }   // hold at the leash
}

function stepPriest(sim, i) {
  const u = sim.units[i], d = UNIT.priest;
  // heal signal: the most hurt ally below the call line within watch range of the post
  let best = -1, bestPct = d.callPct;
  for (let j = 0; j < MAX_UNITS; j++) {
    const v = sim.units[j];
    if (!v.alive || !within(v.x, v.y, u.hx, u.hy, d.aggro)) continue;
    const p = Math.trunc((v.hp * 100) / unitMaxHp(sim, v));
    if (p < bestPct) { bestPct = p; best = j; }
  }
  if (u.cast > 0) {                                         // chanting
    const v = sim.units[u.healTo];
    if (!v || !v.alive || !within(u.x, u.y, v.x, v.y, d.range + 16)) { u.cast = 0; emit(sim, { type: 'castBreak', i }); return; }
    if (--u.cast > 0) return;
    u.cd = priestPeriod(sim);
    const amt = unitDmg(sim, u);
    let healed = Math.min(amt, unitMaxHp(sim, v) - v.hp);
    v.hp += healed;
    if (sim.cards.blessing) { v.bless = 180; v.blessDef = sim.cards.blessing; }
    if (sim.cards.prayer) for (let j = 0; j < MAX_UNITS; j++) {
      const w = sim.units[j];
      if (j === u.healTo || !w.alive || !within(v.x, v.y, w.x, w.y, 40)) continue;
      const h = Math.min(amt, unitMaxHp(sim, w) - w.hp); w.hp += h; healed += h;
    }
    u.xpAcc += healed;
    while (u.xpAcc >= 20) { u.xpAcc -= 20; gainXp(sim, i, 1); }
    emit(sim, { type: 'heal', i, to: u.healTo });
    return;
  }
  if (best < 0) { moveToward(u, u.hx, u.hy, d.speed); return; }
  const v = sim.units[best];
  if (within(u.x, u.y, v.x, v.y, d.range)) {
    if (u.cd === 0) { u.cast = priestCast(sim); u.healTo = best; emit(sim, { type: 'castStart', i, to: best, ticks: u.cast }); }
    return;
  }
  const ox = u.x, oy = u.y;                                 // walk to the closest point in range, not past the leash
  moveToward(u, v.x, v.y, d.speed);
  if (!within(u.x, u.y, u.hx, u.hy, d.leash)) { u.x = ox; u.y = oy; }
}

function stepUnit(sim, i) {
  const u = sim.units[i];
  if (u.cd > 0) u.cd--;
  if (u.redeploy > 0) u.redeploy--;
  if (u.bless > 0 && --u.bless === 0) u.blessDef = 0;
  if (u.state === 'moving') { if (moveToward(u, u.hx, u.hy, UNIT[u.kind].speed)) { u.state = 'setup'; u.setup = SETUP_TICKS; emit(sim, { type: 'unitSetup', i }); } return; }
  if (u.state === 'setup') { if (--u.setup <= 0) u.state = 'guard'; return; }
  if (u.hurt > 0) u.hurt--;
  if (u.kind === 'worker') stepWorker(sim, i);
  else if (u.kind === 'archer') stepArcher(sim, i);
  else if (u.kind === 'shield') stepShield(sim, i);
  else stepPriest(sim, i);
}

// Workers: fight back first (when hit in the last 2 s or a foe is right next to them), else repair the most damaged
// wall or barracks that no other worker is on, else wait by the castle. Jobs: wall segment 0–23, barracks 100 + slot.
const jobPoint = j => {
  if (j >= 100) return [F(SLOTS[j - 100][0]), F(SLOTS[j - 100][1] + 30)];
  const a = segAngle(j);
  return [F(CX) + COS[a] * (WALL_R - 18), F(CY) + SIN[a] * (WALL_R - 18)];
};
function jobNeed(sim, j) {                                  // missing hp in per-mille, 0 = nothing to do
  if (j >= 100) { const sl = sim.slots[j - 100]; return sl.kind === 'barracks' && !sl.build && sl.hp < barracksMaxHp(sl) ? 1000 - Math.trunc((sl.hp * 1000) / barracksMaxHp(sl)) : 0; }
  const w = sim.walls[j], max = wallMaxHp(sim, w.lv);
  return w.lv > 0 && w.hp < max ? 1000 - Math.trunc((w.hp * 1000) / max) : 0;
}
function stepWorker(sim, i) {
  const u = sim.units[i], d = UNIT.worker;
  const near = nearestFoe(sim, u.x, u.y, u.hurt > 0 ? d.aggro + 30 : 30);
  if (near >= 0) {
    const f = sim.foes[near];
    if (within(u.x, u.y, f.x, f.y, d.range + 8)) {
      if (u.cd === 0) { u.cd = d.period; emit(sim, { type: 'shot', i, kind: 'worker', x: u.x / ONE, y: u.y / ONE, tx: f.x / ONE, ty: f.y / ONE }); hurtFoe(sim, near, unitDmg(sim, u), d.atk, i); }
    } else moveToward(u, f.x, f.y, d.speed);
    return;
  }
  if (u.job < 0 || !jobNeed(sim, u.job)) {
    u.job = -1;
    let best = -1, bestNeed = 0;
    const taken = j => sim.units.some((v, k) => k !== i && v.alive && v.kind === 'worker' && v.job === j);
    for (let j = 0; j < WALL_SEGS; j++) { const n = jobNeed(sim, j); if (n > bestNeed && !taken(j)) { bestNeed = n; best = j; } }
    for (let k = 0; k < SLOTS.length; k++) { const n = jobNeed(sim, 100 + k); if (n > bestNeed && !taken(100 + k)) { bestNeed = n; best = 100 + k; } }
    u.job = best;
  }
  if (u.job < 0) { moveToward(u, u.hx, u.hy, d.speed); return; }
  const [tx, ty] = jobPoint(u.job);
  if (!moveToward(u, tx, ty, d.speed)) return;
  u.xpAcc += d.repair * (100 + 50 * sim.cards.artisan);     // hp per second × 100
  let hp = 0;
  while (u.xpAcc >= 100 * TPS) { u.xpAcc -= 100 * TPS; hp++; }
  if (!hp) return;
  if (u.job >= 100) { const sl = sim.slots[u.job - 100]; sl.hp = Math.min(barracksMaxHp(sl), sl.hp + hp); }
  else { const w = sim.walls[u.job]; w.hp = Math.min(wallMaxHp(sim, w.lv), w.hp + hp); }
  if (sim.tick % 30 === i % 30) emit(sim, { type: 'repair', i, job: u.job });
}

function stepLeash(u, tx, ty, d) {
  const ox = u.x, oy = u.y;
  moveToward(u, tx, ty, d.speed);
  if (!within(u.x, u.y, u.hx, u.hy, d.leash)) { u.x = ox; u.y = oy; }
}

function stepCastle(sim) {
  const c = sim.castle;
  if (c.cd > 0) { c.cd--; return; }
  const t = nearestFoe(sim, F(CX), F(CY), lightR(sim));
  if (t < 0) return;
  c.cd = Math.trunc((CASTLE.period * (100 - 15 * sim.cards.rod)) / 100);
  const f = sim.foes[t];
  emit(sim, { type: 'shot', i: -1, kind: 'castle', x: CX, y: CY - 60, tx: f.x / ONE, ty: f.y / ONE });
  hurtFoe(sim, t, CASTLE.dmg, CASTLE.atk, -1);
  if (sim.cards.rod) zap(sim, t, sim.cards.rod - 1, CASTLE.dmg, null);
}

// Timed card powers: thunder, arrow storm, eternal winter, burning walls.
function stepPowers(sim) {
  const th = sim.cards.thunder;
  if (th && --sim.thunderCd <= 0) {
    let period = 300 - 50 * (th - 1);
    if (sim.synOn.storm) period = Math.trunc((period * 2) / 3);
    sim.thunderCd = period;
    const R = lightR(sim) + 200, picks = [];
    for (let n = 0; n < (sim.evo.tempest ? 3 : 1); n++) {
      let best = -1;
      for (let k = 0; k < sim.foes.length; k++) {
        const f = sim.foes[k];
        if (f.hp <= 0 || picks.includes(k) || !within(f.x, f.y, F(CX), F(CY), R)) continue;
        if (best < 0 || f.hp > sim.foes[best].hp) best = k;
      }
      if (best >= 0) picks.push(best);
    }
    for (const k of picks) {
      const f = sim.foes[k];
      emit(sim, { type: 'thunder', x: f.x / ONE, y: f.y / ONE });
      zap(sim, k, sim.evo.tempest ? 2 : 0, 15 + 10 * th, [f.x / ONE, f.y / ONE - 400]);
    }
  }
  if (sim.evo.arrowStorm) {
    if (sim.rain && sim.tick >= sim.rain.next) {
      blastFoes(sim, sim.rain.x, sim.rain.y, 90, 8, 'pierce');
      emit(sim, { type: 'rain', x: sim.rain.x / ONE, y: sim.rain.y / ONE, r: 90 });
      sim.rain.next += 10;
      if (--sim.rain.waves <= 0) sim.rain = null;
    }
    if (--sim.rainCd <= 0) {
      sim.rainCd = 240;
      const R = lightR(sim) + 100;
      let best = -1, bestN = 0;
      for (let k = 0; k < sim.foes.length; k++) {
        const f = sim.foes[k];
        if (f.hp <= 0 || !within(f.x, f.y, F(CX), F(CY), R)) continue;
        let n = 0;
        for (let j = 0; j < sim.foes.length; j++) if (sim.foes[j].hp > 0 && within(f.x, f.y, sim.foes[j].x, sim.foes[j].y, 90)) n++;
        if (n > bestN) { bestN = n; best = k; }
      }
      if (best >= 0) sim.rain = { x: sim.foes[best].x, y: sim.foes[best].y, waves: 3, next: sim.tick };
    }
  }
  if (sim.evo.winter && --sim.winterCd <= 0) {
    sim.winterCd = 300;
    let n = 0;
    for (const f of sim.foes) if (f.hp > 0 && within(f.x, f.y, F(CX), F(CY), lightR(sim))) { f.stun = Math.max(f.stun, 60); f.slow = Math.max(f.slow, 60); n++; }
    emit(sim, { type: 'winter', n, r: lightR(sim) });
  }
  const fw = sim.cards.fireWall;
  if (fw && sim.tick % 30 === 0) {
    for (let k = 0; k < sim.foes.length; k++) {
      const f = sim.foes[k];
      if (f.hp <= 0 || FOE[f.kind].fly) continue;
      const r = isqrt(d2(f.x, f.y, F(CX), F(CY)));
      if (r < F(WALL_R) || r > F(WALL_R + 40) || sim.walls[wallSegAt(f.x, f.y)].lv === 0) continue;
      trueHurt(sim, k, 2 * fw, 'fireWall');
      if (sim.evo.inferno) ignite(sim, k, 3);
    }
  }
}

// --- death & events: kills cascade (burst, burning spread) inside one tick ---
function reap(sim) {
  let chain = 0;
  for (let guard = 0; guard < 64; guard++) {
    let found = false;
    for (let fi = 0; fi < sim.foes.length; fi++) {
      const f = sim.foes[fi];
      if (f.hp > 0 || f.done) continue;
      f.done = true; found = true;
      const d = FOE[f.kind];
      if (!f.boomed) {
        const gold = Math.trunc((d.gold * (100 + 50 * sim.cards.bounty)) / 100);
        sim.gold += gold; sim.killScore += d.score; sim.kills++; chain++;
        emit(sim, { type: 'kill', id: f.id, kind: f.kind, x: f.x / ONE, y: f.y / ONE, gold });
        gainWatchXp(sim, d.score || 1);
        if (sim.chestKillN < CHEST_KILLS.length && sim.kills >= CHEST_KILLS[sim.chestKillN]) { sim.chestKillN++; openChest(sim, 'kills'); }
        const b = sim.cards.burst;
        if (b) {
          const r = sim.evo.inferno ? 80 : 50;
          emit(sim, { type: 'explode', x: f.x / ONE, y: f.y / ONE, r, inferno: sim.evo.inferno });
          for (let j = 0; j < sim.foes.length; j++) {
            if (j === fi || sim.foes[j].hp <= 0 || !within(f.x, f.y, sim.foes[j].x, sim.foes[j].y, r)) continue;
            hurtFoe(sim, j, 4 + 4 * b, 'blast', -1);
            if (sim.evo.inferno) ignite(sim, j, 3);
          }
        }
        if (f.burn > 0 && sim.synOn.fire) {
          for (let j = 0; j < sim.foes.length; j++) if (j !== fi && sim.foes[j].hp > 0 && within(f.x, f.y, sim.foes[j].x, sim.foes[j].y, 50)) ignite(sim, j, f.burnDmg);
        }
      } else emit(sim, { type: 'kill', id: f.id, kind: f.kind, x: f.x / ONE, y: f.y / ONE, gold: 0 });
      if (d.boss && f.ev >= 0) {
        const ev = sim.script.events[f.ev];
        emit(sim, { type: 'bossDown', tier: ev.boss, final: ev.final });
        openChest(sim, 'boss', BOSS_TIERS[ev.boss].bonus);
        if (ev.final) { sim.bossDead = true; sim.bossTick = sim.tick; }
      }
      if (f.ev >= 0) {
        const st = sim.eventState[f.ev];
        st.alive--;
        if (st.alive === 0 && st.spawned === st.total && !st.cleared) {
          st.cleared = true; st.clearTick = sim.tick;
          const EV = sim.script.events[f.ev];
          const left = (EV.limit ?? EVENT_CLEAR_TICKS) - (sim.tick - EV.at);   // faster = more points
          const pts = left >= 0 ? SCORE.eventClear + Math.trunc(left / TPS) * SCORE.eventPerSec : 0;
          sim.eventScore += pts;
          emit(sim, { type: 'eventClear', ev: f.ev, pts });
          if (pts && EV.chest) openChest(sim, 'event');
        }
      }
    }
    if (!found) break;
  }
  if (chain >= 4) emit(sim, { type: 'chain', n: chain });
  if (!sim.foes.some(f => f.done)) return;
  sim.foes = sim.foes.filter(f => !f.done);
  for (const u of sim.units) if (u.alive) u.target = -1;
  for (const f of sim.foes) if (f.tKind === 'unit' && !sim.units[f.target].alive) { f.tKind = ''; f.target = -1; }
}

export function step(sim, input) {
  sim.events.length = 0;
  if (phase(sim) !== 'play') return;
  applyByte(sim, input & 255);
  stepEconomy(sim);
  stepSpawns(sim);
  for (let fi = 0; fi < sim.foes.length; fi++) if (sim.foes[fi].hp > 0) { sim.curFoe = sim.foes[fi].id; stepFoe(sim, fi); }
  sim.curFoe = -1;                                          // who caused a castleHit / slot hit (events only; never read by rules)
  for (let i = 0; i < MAX_UNITS; i++) if (sim.units[i].alive) stepUnit(sim, i);
  stepCastle(sim);
  stepPowers(sim);
  reap(sim);
  sim.tick++;
  if (sim.pending > 0 && !sim.offer && sim.castle.hp > 0) drawOffer(sim);
  if (phase(sim) === 'over') emit(sim, { type: 'over', win: sim.bossDead });
}

export const phase = sim => (sim.tick >= sim.script.matchTicks || sim.castle.hp <= 0 || sim.bossDead ? 'over' : sim.offer ? 'choice' : 'play');

export function scoreBreakdown(sim) {
  const castlePct = Math.max(0, Math.trunc((sim.castle.hp * 100) / CASTLE.hp));
  const vets = sim.units.filter(u => u.alive && u.lv === 3).length;
  const boss = sim.bossDead ? SCORE.boss + Math.trunc((sim.script.matchTicks - sim.bossTick) / TPS) * SCORE.bossPerSec : 0;
  const over = sim.tick >= sim.script.matchTicks || sim.castle.hp <= 0 || sim.bossDead;
  return { kills: sim.killScore, events: sim.eventScore, boss, castle: over ? castlePct * SCORE.castlePct : 0, veterans: vets * SCORE.vet };
}
export const score = sim => Object.values(scoreBreakdown(sim)).reduce((a, b) => a + b, 0);

export function stateHash(sim) {
  const h = createHasher(sim.tick).mixAll([sim.gold, sim.castle.hp, sim.killScore, sim.eventScore, sim.foes.length, sim.cmd.length,
    sim.xp, sim.level, sim.picks, sim.pending, sim.rerolls, sim.ignores, sim.locks, sim.lockType.length, sim.chests, sim.castle.queue]);
  for (const id of CARD_IDS) h.mix(sim.cards[id]);
  for (const t of Object.keys(CARD_TYPES)) h.mixAll([sim.ignored[t] ? 1 : 0, sim.lockType === t ? 1 : 0]);
  for (const id of EVO_IDS) h.mix(sim.evo[id] ? 1 : 0);
  for (const sl of sim.slots) h.mixAll([sl.kind.length, sl.lv, sl.hp, sl.queue.length]);
  for (const w of sim.walls) h.mixAll([w.lv, w.hp]);
  for (const u of sim.units) if (u.alive) h.mixAll([u.gen, u.lv, u.xp, u.hp, u.x, u.y, u.hx, u.hy, u.job, u.cast, u.retreat ? 1 : 0, u.bless]);
  for (const f of sim.foes) h.mixAll([f.id, f.hp, f.x, f.y, f.burn, f.slow, f.stun]);
  return h.value();
}

/** GameDef for one stage (core/match.js). Each stage is its own leaderboard: id `lantern-hold-<stage>`. */
export function makeGame(stage) {
  const ticks = buildScript(stage).matchTicks;
  return Object.freeze({
    id: `lantern-hold-${stage}`, stage, version: 7, maxTicks: ticks, maxChoices: LEVEL_MAX + REROLLS + IGNORES + LOCKS,
    createSim: seed => createSim(seed, stage), step, phase, choose, score, stateHash, scoreBreakdown,
  });
}
export const GAMES = Object.freeze(Object.fromEntries(Object.keys(STAGES).map(k => [k, makeGame(k)])));
/** The default stage's GameDef (tests, tools, audit). */
export const GAME = GAMES[DEFAULT_STAGE];
