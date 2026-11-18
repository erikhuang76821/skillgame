// LanternHold (守望之戰) — prototype sim v3. Spec: ../../../gdd/05_game_spec.md, numbers: ../../../gdd/04_combat.md,
// cards: ../../../gdd/06_cards.md.
// Deterministic: no rendering, no wall clock, no unseeded randomness. Same seed + same input bytes + same choices = same score.
//
// Input: one byte per tick (core/match.js logs bytes). A command is 3 consecutive bytes: [op, a, b].
// Byte 0 while idle = no command. Ops: see OP below. Invalid commands are ignored without touching the state.
// Card picks are core/match.js choices: while an offer is open phase() is 'choice' and the world is paused.
import { makeRng, createHasher, TPS, ONE, COS, SIN, angleOf } from './core/index.js';

export { TICK_MS } from './core/index.js';

// --- §0 ---
export const MATCH_TICKS = 270 * TPS;
export const VIEW_W = 720, VIEW_H = 1280;
export const CX = 360, CY = 600;                     // castle centre (px)

// --- §2 command protocol ---
export const OP = Object.freeze({ BUILD: 1, MENU: 2, MOVE: 3, WALL: 5 });
export const CELL_W = 60, CELL_H = 64, GRID_W = 12, GRID_H = 20;   // 240 placement cells over 720 x 1280
export const cellOf = (x, y) => Math.min(GRID_W - 1, Math.max(0, Math.floor(x / CELL_W))) + Math.min(GRID_H - 1, Math.max(0, Math.floor(y / CELL_H))) * GRID_W;
export const cellCenter = c => [(c % GRID_W) * CELL_W + CELL_W / 2, Math.floor(c / GRID_W) * CELL_H + CELL_H / 2];
export const encode = (op, a, b) => [op, a & 255, b & 255];
// Choices while an offer is open: 0–2 take that card, 3 reroll, 4–6 ban the card in slot 0–2.
export const CHOICE = Object.freeze({ REROLL: 3, BAN: 4 });

// --- §3 random streams ---
const rng = makeRng({ trickle: 1, event: 2, offer: 3, chest: 4 });

// --- tables (gdd/04) ---
const ARMOR = { light: 0, heavy: 1, bldg: 2 };
export const COUNTER = Object.freeze({ slash: [100, 125, 50], pierce: [150, 50, 25], blast: [75, 100, 200] });
export const LV_MUL = [100, 140, 180], LV_DEF = [0, 1, 2], XP_LV = [5, 15];

export const UNIT = Object.freeze({
  archer: { armor: 0, hp: 35, def: 0, atk: 'pierce', dmg: 6, period: 50, range: 160, speed: 100, aggro: 160, leash: 20, cost: 8 },
  shield: { armor: 1, hp: 140, def: 3, atk: 'slash', dmg: 4, period: 60, range: 20, speed: 80, aggro: 80, leash: 30, taunt: 50, cost: 12 },
  priest: { armor: 0, hp: 40, def: 0, heal: 6, period: 60, range: 120, speed: 90, aggro: 120, leash: 60, cost: 12 },
});
export const UNIT_KINDS = ['archer', 'shield', 'priest'];

export const FOE = Object.freeze({
  rat: { armor: 0, hp: 6, def: 0, atk: 'slash', dmg: 2, period: 40, range: 14, speed: 110, score: 1, gold: 2 },
  beetle: { armor: 1, hp: 30, def: 1, atk: 'blast', dmg: 3, period: 60, range: 16, speed: 50, score: 3, gold: 4 },
  moth: { armor: 0, hp: 8, def: 0, atk: 'slash', dmg: 3, period: 40, range: 14, speed: 130, score: 2, gold: 2, fly: true },
  shroom: { armor: 0, hp: 12, def: 0, atk: 'blast', dmg: 30, period: 1, range: 16, speed: 70, score: 2, gold: 2, boom: 50 },
  snail: { armor: 1, hp: 260, def: 4, atk: 'blast', dmg: 20, period: 150, range: 140, speed: 25, score: 10, gold: 15, wallBreaker: true, elite: true },
  wolf: { armor: 1, hp: 160, def: 3, atk: 'slash', dmg: 10, period: 45, range: 20, speed: 120, score: 15, gold: 20, elite: true },
  boss: { armor: 1, hp: 1800, def: 3, atk: 'blast', dmg: 30, period: 120, range: 60, speed: 30, score: 0, gold: 0, aoe: 60 },
});
export const FOE_KINDS = Object.keys(FOE);

// --- §5 economy & buildings: one currency (gold). Everything else grows through cards (gdd/06). ---
export const START_GOLD = 30;
export const POP_BASE = 4, POP_PER_BARRACKS = 4, POP_MAX = 32, LIGHT_BASE = 220;
export const CASTLE = Object.freeze({ hp: 1000, def: 3, atk: 'pierce', dmg: 6, period: 60, r: 56 });
export const BARRACKS = Object.freeze({ cost: 20, costStep: 15, hp: 150 });   // n-th barracks costs 20 + 15n
export const TRAIN_TICKS = 180, BUILD_TICKS = 60, QUEUE_MAX = 3;
export const REDEPLOY_CD = 600, SETUP_TICKS = 60, DEPLOY_NEAR_ALLY = 120;
export const MAX_UNITS = 64, MAX_FOES = 400;

// 12 build slots: 6 inner (r 120), 6 outer (r 185).
const ring = (n, r, off) => Array.from({ length: n }, (_, i) => { const a = (off + (i * 256) / n) & 255; return [CX + Math.trunc((COS[a] * r) / ONE), CY + Math.trunc((SIN[a] * r) / ONE)]; });
export const SLOTS = Object.freeze([...ring(6, 120, 21), ...ring(6, 185, 0)]);

// Walls: 24 segments on a ring. Gold builds a palisade; the 石牆 card makes every segment tougher.
export const WALL_R = 240, WALL_SEGS = 24;
export const WALL = Object.freeze({ hp: 80, def: 1, cost: 5 });
export const REPAIR = Object.freeze({ cost: 3, ticks: 120 });
export const segOf = a => Math.floor(((a + 256 / WALL_SEGS / 2) & 255) * WALL_SEGS / 256) % WALL_SEGS;

// --- §5.5 level-ups, cards, synergies, evolutions, chests (gdd/06) ---
export const XP_NEED = L => 4 + 3 * L + 2 * L * L;          // watch XP needed for level L -> L+1 (L from 0)
export const LEVEL_MAX = 12, CARD_MAX = 3, REROLLS = 2, BANS = 1;
export const CHEST_KILLS = [100, 250], CHEST_ROLL = [[55, 1], [85, 3], [100, 5]];   // roll 0–99 -> count
export const POUCH_GOLD = 15;

export const CARDS = Object.freeze({
  rapid: { name: '連射', tags: ['bow'], text: '弓箭手攻速 +15%/級' },
  split: { name: '分裂箭', tags: ['bow'], text: '弓箭手的箭再打中目標旁 1/2/3 隻' },
  reinforce: { name: '援軍', tags: ['bow', 'gold'], text: '立刻來 2/3/4 名弓箭手（不佔人口）' },
  fireArrow: { name: '火箭', tags: ['fire', 'bow'], text: '弓箭手點燃敵人：每 0.5 秒 1/2/3 傷害，2 秒' },
  burst: { name: '爆裂', tags: ['fire'], text: '敵人死亡時爆炸：半徑 50，8/12/16 傷害' },
  fireWall: { name: '火牆', tags: ['fire', 'fort'], text: '城牆灼燒貼牆的敵人 2/4/6 每 0.5 秒' },
  frostArrow: { name: '冰箭', tags: ['frost', 'bow'], text: '弓箭手緩速敵人 40%：1.5/2/2.5 秒' },
  frostAura: { name: '寒霧', tags: ['frost'], text: '燈光內敵人移速 −10/20/30%' },
  frostShield: { name: '霜盾', tags: ['frost', 'fort'], text: '盾兵的攻擊凍住敵人 0.33/0.67/1 秒' },
  thunder: { name: '落雷', tags: ['storm'], text: '每 5/4.2/3.3 秒雷擊血最多的敵人 25/35/45' },
  chain: { name: '感電', tags: ['storm', 'bow'], text: '弓箭手每第 4 箭放電，跳 2/3/4 隻' },
  rod: { name: '避雷塔', tags: ['storm', 'fort'], text: '主城光束連鎖 0/1/2 隻、攻速 +15%/級' },
  shieldWall: { name: '盾陣', tags: ['fort'], text: '盾兵血量 +40%/級、防禦 +1/級' },
  prayer: { name: '祝禱', tags: ['fort'], text: '牧師治療 +50%/級，並治療目標旁 40 內友軍' },
  stoneWall: { name: '石牆', tags: ['fort'], text: '城牆耐久 +50%/級、防禦 +1/級，選到時全牆補滿' },
  beacon: { name: '燈塔', tags: ['fort'], text: '燈光半徑（放置範圍、主城射程）+40/級' },
  bounty: { name: '賞金', tags: ['gold'], text: '擊殺金幣 +50%/級' },
  ranch: { name: '牧場', tags: ['gold'], text: '蓋一座牧場：每 10 秒 +4/8/12 金幣' },
});
export const CARD_IDS = Object.freeze(Object.keys(CARDS));

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
export const TRICKLE = Object.freeze([
  { from: 0, period: 216, gates: 1, kinds: ['rat'] },
  { from: s(30), period: 192, gates: 4, kinds: ['rat'] },
  { from: s(60), period: 180, gates: 4, kinds: ['rat', 'rat', 'beetle'] },
  { from: s(90), period: 168, gates: 8, kinds: ['rat', 'rat', 'beetle'] },
  { from: s(120), period: 150, gates: 8, kinds: ['rat', 'beetle', 'moth'] },
  { from: s(150), period: 138, gates: 8, kinds: ['rat', 'beetle', 'moth'] },
  { from: s(180), period: 126, gates: 8, kinds: ['rat', 'beetle', 'moth', 'wolf'] },
  { from: s(210), period: 114, gates: 8, kinds: ['rat', 'beetle', 'moth', 'shroom'] },
]);
export const EVENTS = Object.freeze([                       // ordered by load: each event is a step up (gdd/07)
  { at: s(25), name: '小股突襲', groups: [{ kind: 'rat', n: 18, gate: 'a' }] },
  { at: s(50), name: '飛蛾群', groups: [{ kind: 'moth', n: 30, gate: 'a' }] },
  { at: s(75), name: '鼠潮', groups: [{ kind: 'rat', n: 18, gate: 'a' }, { kind: 'rat', n: 18, gate: 'b' }] },
  { at: s(100), name: '甲蟲隊', chest: true, groups: [{ kind: 'beetle', n: 6, gate: 'a' }, { kind: 'beetle', n: 6, gate: 'n' }] },
  { at: s(120), name: '爆裂菇', groups: [{ kind: 'shroom', n: 21, gate: 'a' }, { kind: 'beetle', n: 9, gate: 'a' }] },
  { at: s(145), name: '攻城蝸牛', chest: true, limit: s(45), groups: [{ kind: 'snail', n: 1, gate: 'a' }, { kind: 'snail', n: 1, gate: 'n' }, { kind: 'rat', n: 24, gate: 'a' }, { kind: 'beetle', n: 4, gate: 'n' }, { kind: 'moth', n: 12, gate: 'n' }] },
  { at: s(170), name: '精英夾擊', chest: true, groups: [{ kind: 'wolf', n: 2, gate: 'a' }, { kind: 'rat', n: 18, gate: 'a' }, { kind: 'wolf', n: 2, gate: 'b' }, { kind: 'rat', n: 18, gate: 'b' }] },
  { at: s(195), name: '月蝕', chest: true, groups: [{ kind: 'rat', n: 9, gate: 'all' }, { kind: 'beetle', n: 4, gate: 'all' }, { kind: 'moth', n: 4, gate: 'all' }] },
  { at: s(225), name: '永夜之喉', groups: [{ kind: 'boss', n: 1, gate: 'a' }, { kind: 'beetle', n: 12, gate: 'a' }, { kind: 'wolf', n: 4, gate: 'b' }] },
]);
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

export function createSim(seed) {
  const sim = {
    seed: seed >>> 0, tick: 0, killScore: 0, eventScore: 0, bossScore: 0,
    gold: START_GOLD, xp: 0, level: 0, picks: 0, pending: 0, rerolls: REROLLS, bans: BANS,
    cards: Object.fromEntries(CARD_IDS.map(id => [id, 0])), evo: Object.fromEntries(EVO_IDS.map(id => [id, false])),
    banned: Object.fromEntries(CARD_IDS.map(id => [id, false])), offer: null, rerollN: 0,
    chests: 0, chestKillN: 0, synOn: Object.fromEntries(TAGS.map(t => [t, false])), reactOn: {},
    thunderCd: 0, rainCd: 0, rain: null, winterCd: 0, arrowN: 0,
    castle: { hp: CASTLE.hp, cd: 0 },
    slots: SLOTS.map(() => ({ kind: '', hp: 0, build: 0, queue: [], progress: 0 })),
    walls: Array.from({ length: WALL_SEGS }, () => ({ lv: 0, hp: 0, repair: 0 })),
    units: Array.from({ length: MAX_UNITS }, () => ({ alive: false })),
    unitGen: 0,
    foes: [], foeId: 0,
    trickleNext: 60, trickleN: 0,
    eventState: EVENTS.map(() => ({ started: false, spawned: 0, total: 0, alive: 0, cleared: false, gates: [0, 0] })),
    spawnQueue: [],
    cmd: [], curFoe: -1, kills: 0, bossDead: false, bossTick: 0,
    events: [], recordEvents: true,
  };
  for (let e = 0; e < EVENTS.length; e++) {
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
export const pop = sim => sim.units.reduce((n, u) => n + (u.alive && !u.free ? 1 : 0), 0) + sim.slots.reduce((n, sl) => n + sl.queue.length, 0);
export const lightR = sim => LIGHT_BASE + 40 * sim.cards.beacon;
export const tagCount = (sim, tag) => CARD_IDS.reduce((n, id) => n + (sim.cards[id] > 0 && CARDS[id].tags.includes(tag) ? 1 : 0), 0);
export const synergy = (sim, tag) => sim.synOn[tag];
const hasEl = (sim, tag) => tagCount(sim, tag) > 0;
export const reaction = (sim, id) => !!sim.reactOn[id];
const fortDef = sim => (sim.synOn.fort ? 2 : 0);
export const wallMaxHp = sim => Math.trunc((WALL.hp * (100 + 50 * sim.cards.stoneWall)) / 100);
const wallDef = sim => WALL.def + sim.cards.stoneWall + fortDef(sim);

function spawnUnit(sim, kind, x, y, free = false) {
  const i = sim.units.findIndex(u => !u.alive);
  if (i < 0) return -1;
  const d = UNIT[kind];
  sim.units[i] = { alive: true, gen: ++sim.unitGen, kind, lv: 1, xp: 0, xpAcc: 0, hp: d.hp, x, y, hx: x, hy: y,
    state: 'guard', cd: 0, redeploy: 0, setup: 0, target: -1, free };
  sim.units[i].hp = unitMaxHp(sim, sim.units[i]);
  emit(sim, { type: 'unitTrained', i, kind });
  return i;
}
export const unitMaxHp = (sim, u) => {
  const base = Math.trunc((UNIT[u.kind].hp * LV_MUL[u.lv - 1]) / 100);
  return u.kind === 'shield' ? Math.trunc((base * (100 + 40 * sim.cards.shieldWall)) / 100) : base;
};
const unitDef = (sim, u) => UNIT[u.kind].def + LV_DEF[u.lv - 1] + (u.kind === 'shield' ? sim.cards.shieldWall + fortDef(sim) : 0);
const unitDmg = (sim, u) => {
  const v = Math.trunc(((UNIT[u.kind].dmg ?? UNIT[u.kind].heal) * LV_MUL[u.lv - 1]) / 100);
  return u.kind === 'priest' ? Math.trunc((v * (100 + 50 * sim.cards.prayer)) / 100) : v;
};
const unitPeriod = (sim, u) => (u.kind === 'archer' ? Math.trunc((UNIT.archer.period * (100 - 15 * sim.cards.rapid)) / 100) : UNIT[u.kind].period);
export const unitReach = (sim, u) => UNIT[u.kind].range + (u.kind === 'archer' && sim.synOn.bow ? 40 : 0);
const unitAggro = (sim, u) => UNIT[u.kind].aggro + (u.kind === 'archer' && sim.synOn.bow ? 40 : 0);

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
    Object.assign(sl, { kind: 'barracks', hp: 1, build: BUILD_TICKS, queue: [], progress: 0 });
    emit(sim, { type: 'build', slot: a, kind: 'barracks' });
  } else if (op === OP.MENU) {                              // a = barracks slot, b = 0 archer / 1 shield / 2 priest
    const sl = sim.slots[a], kind = UNIT_KINDS[b];
    if (!sl || sl.kind !== 'barracks' || sl.build > 0 || !kind) return;
    if (sl.queue.length >= QUEUE_MAX || pop(sim) >= popCap(sim) || sim.gold < UNIT[kind].cost) return;
    sim.gold -= UNIT[kind].cost; sl.queue.push(kind);
    emit(sim, { type: 'queued', slot: a, kind });
  } else if (op === OP.MOVE) {                              // a = unit index, b = cell
    const u = sim.units[a];
    if (!u || !u.alive || u.redeploy > 0 || b >= GRID_W * GRID_H) return;
    const [px, py] = cellCenter(b), x = F(px), y = F(py);
    if (!canPlace(sim, x, y, a)) return;
    u.hx = x; u.hy = y; u.state = 'moving'; u.redeploy = REDEPLOY_CD; u.target = -1;
    emit(sim, { type: 'unitMoved', i: a, x: px, y: py });
  } else if (op === OP.WALL) {                              // a = segment, b = 0 build / 1 repair
    const w = sim.walls[a];
    if (!w) return;
    if (b === 0) {
      if (w.lv > 0 || sim.gold < WALL.cost) return;
      sim.gold -= WALL.cost; w.lv = 1; w.hp = wallMaxHp(sim); w.repair = 0;
      emit(sim, { type: 'wallBuild', seg: a, lv: 1 });
    } else if (b === 1) {
      if (w.lv <= 0 || w.repair > 0 || w.hp >= wallMaxHp(sim) || sim.gold < REPAIR.cost) return;
      sim.gold -= REPAIR.cost; w.repair = REPAIR.ticks;
      emit(sim, { type: 'repair', seg: a });
    }
  }
}

// --- level-ups and offers (gdd/06 §2) ---
// The k-th offer (k = picks made so far) and its r-th reroll are a shuffle of the whole card list by (seed, k, r).
// Everybody sees the same order; cards you maxed or banned are skipped. A ready evolution always comes first,
// then the first card you already own in that order, then the rest of the order.
export function readyEvos(sim) { return EVO_IDS.filter(e => !sim.evo[e] && sim.cards[EVOS[e].from] >= CARD_MAX && sim.cards[EVOS[e].with] > 0); }
function drawOffer(sim) {
  const order = rng.shuffle(sim.seed, 'offer', sim.picks * 8 + sim.rerollN, CARD_IDS);
  const ids = [], ok = id => sim.cards[id] < CARD_MAX && !sim.banned[id] && !ids.includes(id);
  const evo = readyEvos(sim)[0];
  if (evo) ids.push(evo);
  const owned = order.find(id => sim.cards[id] > 0 && ok(id));    // one slot always levels something you own
  if (owned) ids.push(owned);
  for (const id of order) { if (ids.length >= 3) break; if (ok(id)) ids.push(id); }
  while (ids.length < 3) ids.push('pouch');
  sim.offer = { ids, k: sim.picks };
  emit(sim, { type: 'offer', ids: ids.slice(), k: sim.picks });
}
function applyCard(sim, id, how) {
  if (id === 'pouch') { sim.gold += POUCH_GOLD; emit(sim, { type: 'card', id, lv: 0, how }); return; }
  if (EVOS[id]) { sim.evo[id] = true; emit(sim, { type: 'evolve', id, how }); return; }
  const lvl = ++sim.cards[id];
  if (id === 'reinforce') for (let n = 0; n <= lvl; n++) spawnUnit(sim, 'archer', F(CX - 30 + n * 20), F(CY + 80), true);
  if (id === 'stoneWall') for (const w of sim.walls) if (w.lv > 0) w.hp = wallMaxHp(sim);
  if (id === 'shieldWall') for (const u of sim.units) if (u.alive && u.kind === 'shield') u.hp = Math.min(unitMaxHp(sim, u), u.hp + 40);
  if (id === 'ranch' && lvl === 1) { const k = sim.slots.findIndex(sl => !sl.kind); if (k >= 0) Object.assign(sim.slots[k], { kind: 'ranch', hp: BARRACKS.hp, build: 0, queue: [], progress: 0 }); }
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
  } else if (index >= CHOICE.BAN && index < CHOICE.BAN + 3) {
    const id = o.ids[index - CHOICE.BAN];
    if (sim.bans <= 0 || !CARDS[id]) return false;
    sim.bans--; sim.banned[id] = true;
    drawOffer(sim);
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

// Chests: clearing a chest event in time, and the kill milestones in CHEST_KILLS. The c-th chest's size and upgrade order depend only on (seed, c).
function openChest(sim, why) {
  const c = sim.chests++;
  const roll = rng.int(sim.seed, 'chest', c * 32, 100);
  let n = CHEST_ROLL.find(([lim]) => roll < lim)[1];
  if (sim.synOn.gold) n++;
  const ups = [];
  for (let j = 0; j < n; j++) {
    const evo = readyEvos(sim)[0];
    if (evo) { ups.push(evo); applyCard(sim, evo, 'chest'); continue; }
    const order = rng.shuffle(sim.seed, 'chest', c * 32 + 1 + j, CARD_IDS);
    const id = order.find(id => sim.cards[id] > 0 && sim.cards[id] < CARD_MAX) ?? 'pouch';
    ups.push(id); applyCard(sim, id, 'chest');
  }
  emit(sim, { type: 'chest', n, ups, why });
}

// --- spawning ---
function spawnFoe(sim, kind, gate, ev) {
  if (sim.foes.length >= MAX_FOES) return;
  const [x, y] = gateXY(gate), d = FOE[kind];
  sim.foes.push({ id: sim.foeId++, kind, x, y, hp: d.hp, cd: 0, ev, tKind: '', target: -1, gate, burn: 0, burnDmg: 0, slow: 0, stun: 0, done: false });
  if (ev >= 0) sim.eventState[ev].alive++;
  emit(sim, { type: 'spawn', kind, gate, id: sim.foeId - 1 });
}

function tierAt(t) { let k = 0; while (k + 1 < TRICKLE.length && t >= TRICKLE[k + 1].from) k++; return TRICKLE[k]; }
export const lullUntil = sim => sim.eventState.reduce((m, e) => (e.cleared ? Math.max(m, e.clearTick + LULL_TICKS) : m), 0);

function stepSpawns(sim) {
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
    const tier = tierAt(sim.tick), i = sim.trickleN++;
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
  for (let k = 0; k < SLOTS.length; k++) {
    const sl = sim.slots[k];
    if (!sl.kind) continue;
    if (sl.build > 0) { sl.build--; sl.hp = Math.max(sl.hp, Math.trunc((BARRACKS.hp * (BUILD_TICKS - sl.build)) / BUILD_TICKS)); continue; }
    if (sl.kind === 'barracks' && sl.queue.length && ++sl.progress >= TRAIN_TICKS) {
      sl.progress = 0;
      spawnUnit(sim, sl.queue.shift(), F(SLOTS[k][0]), F(SLOTS[k][1] + 40));
    }
    if (sl.kind === 'ranch' && sim.tick % 600 === 599) {
      const amount = 4 * sim.cards.ranch;
      sim.gold += amount;
      emit(sim, { type: 'produce', slot: k, amount });
    }
  }
  for (const wl of sim.walls) if (wl.repair > 0) { wl.repair--; if (wl.lv > 0 && wl.repair % 2 === 0) wl.hp = Math.min(wallMaxHp(sim), wl.hp + 1); }
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
  u.hp -= dd;
  if (u.kind === 'shield') { u.xpAcc += dd; while (u.xpAcc >= 20) { u.xpAcc -= 20; gainXp(sim, i, 1); } }
  emit(sim, { type: 'hit', who: 'unit', i, dmg: dd, counter: COUNTER[atk][UNIT[u.kind].armor] - 100 });
  if (u.hp <= 0) { u.alive = false; emit(sim, { type: 'unitDown', i, kind: u.kind }); }
}
function hurtSlot(sim, k, dmg, atk) {
  const sl = sim.slots[k];
  if (sl.kind !== 'barracks') return;                      // the ranch is scenery for the 牧場 card: never a target
  sl.hp -= damage(atk, dmg, ARMOR.bldg, 2);
  emit(sim, { type: 'hit', who: 'slot', k, by: sim.curFoe });
  if (sl.hp <= 0) {
    emit(sim, { type: 'bldgDown', slot: k, kind: sl.kind });
    Object.assign(sl, { kind: '', hp: 0, build: 0, queue: [], progress: 0 });
  }
}
function hurtWall(sim, w, dmg, atk) {
  const wl = sim.walls[w], max = wallMaxHp(sim), before = wl.hp;
  wl.hp -= damage(atk, dmg, ARMOR.bldg, wallDef(sim));
  emit(sim, { type: 'wallHit', seg: w, crack: before * 10 >= max * 6 && wl.hp * 10 < max * 6 });
  if (wl.hp <= 0) { wl.lv = 0; wl.hp = 0; wl.repair = 0; emit(sim, { type: 'wallBreak', seg: w }); }
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
    if (within(f.x, f.y, u.x, u.y, d.range + 8)) { attack(() => (d.aoe ? splash(sim, u.x, u.y, d.aoe, d.dmg, d.atk) : hurtUnit(sim, f.target, d.dmg, d.atk))); return; }
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
    const reach = d.wallBreaker ? d.range : d.range + 8;
    if (wl.lv > 0 && r > F(WALL_R) && r <= F(WALL_R + reach)) { attack(() => (d.boom ? boom() : hurtWall(sim, seg, d.dmg, d.atk))); return; }
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

function stepUnit(sim, i) {
  const u = sim.units[i], d = UNIT[u.kind];
  if (u.cd > 0) u.cd--;
  if (u.redeploy > 0) u.redeploy--;
  if (u.state === 'moving') { if (moveToward(u, u.hx, u.hy, d.speed)) { u.state = 'setup'; u.setup = SETUP_TICKS; emit(sim, { type: 'unitSetup', i }); } return; }
  if (u.state === 'setup') { if (--u.setup <= 0) u.state = 'guard'; return; }

  if (d.heal) {
    let best = -1, bestPct = 100;
    for (let j = 0; j < MAX_UNITS; j++) {
      const v = sim.units[j];
      if (!v.alive || !within(v.x, v.y, u.hx, u.hy, d.aggro)) continue;
      const pct = Math.trunc((v.hp * 100) / unitMaxHp(sim, v));
      if (pct < bestPct) { bestPct = pct; best = j; }
    }
    if (best >= 0) {
      const v = sim.units[best];
      if (within(u.x, u.y, v.x, v.y, d.range)) {
        if (u.cd === 0) {
          u.cd = d.period;
          const amt = unitDmg(sim, u);
          let healed = Math.min(amt, unitMaxHp(sim, v) - v.hp);
          v.hp += healed;
          if (sim.cards.prayer) for (let j = 0; j < MAX_UNITS; j++) {
            const w = sim.units[j];
            if (j === best || !w.alive || !within(v.x, v.y, w.x, w.y, 40)) continue;
            const h = Math.min(amt, unitMaxHp(sim, w) - w.hp); w.hp += h; healed += h;
          }
          u.xpAcc += healed;
          while (u.xpAcc >= 20) { u.xpAcc -= 20; gainXp(sim, i, 1); }
          emit(sim, { type: 'heal', i, to: best });
        }
      } else stepLeash(u, v.x, v.y, d);
    } else moveToward(u, u.hx, u.hy, d.speed);
    return;
  }

  if ((i + sim.tick) % 4 === 0 || u.target < 0 || !sim.foes[u.target] || sim.foes[u.target].hp <= 0) u.target = nearestFoe(sim, u.hx, u.hy, unitAggro(sim, u));
  if (u.target >= 0) {
    const f = sim.foes[u.target];
    if (within(u.x, u.y, f.x, f.y, unitReach(sim, u) + 8)) {
      if (u.cd === 0) {
        u.cd = unitPeriod(sim, u);
        emit(sim, { type: 'shot', i, kind: u.kind, x: u.x / ONE, y: u.y / ONE, tx: f.x / ONE, ty: f.y / ONE });
        if (u.kind === 'archer') archerHit(sim, i, u.target);
        else {
          hurtFoe(sim, u.target, unitDmg(sim, u), d.atk, i);
          if (u.kind === 'shield' && sim.cards.frostShield && f.hp > 0) { f.stun = Math.max(f.stun, 20 * sim.cards.frostShield); emit(sim, { type: 'react', id: 'freeze', x: f.x / ONE, y: f.y / ONE, r: 16 }); }
        }
      }
    } else stepLeash(u, f.x, f.y, d);
  } else moveToward(u, u.hx, u.hy, d.speed);
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
      if (f.kind === 'boss') { sim.bossDead = true; sim.bossTick = sim.tick; }
      if (f.ev >= 0) {
        const st = sim.eventState[f.ev];
        st.alive--;
        if (st.alive === 0 && st.spawned === st.total && !st.cleared) {
          st.cleared = true; st.clearTick = sim.tick;
          const left = (EVENTS[f.ev].limit ?? EVENT_CLEAR_TICKS) - (sim.tick - EVENTS[f.ev].at);   // faster = more points
          const pts = left >= 0 ? SCORE.eventClear + Math.trunc(left / TPS) * SCORE.eventPerSec : 0;
          sim.eventScore += pts;
          emit(sim, { type: 'eventClear', ev: f.ev, pts });
          if (pts && EVENTS[f.ev].chest) openChest(sim, 'event');
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

export const phase = sim => (sim.tick >= MATCH_TICKS || sim.castle.hp <= 0 || sim.bossDead ? 'over' : sim.offer ? 'choice' : 'play');

export function scoreBreakdown(sim) {
  const castlePct = Math.max(0, Math.trunc((sim.castle.hp * 100) / CASTLE.hp));
  const vets = sim.units.filter(u => u.alive && u.lv === 3).length;
  const boss = sim.bossDead ? SCORE.boss + Math.trunc((MATCH_TICKS - sim.bossTick) / TPS) * SCORE.bossPerSec : 0;
  const over = sim.tick >= MATCH_TICKS || sim.castle.hp <= 0 || sim.bossDead;
  return { kills: sim.killScore, events: sim.eventScore, boss, castle: over ? castlePct * SCORE.castlePct : 0, veterans: vets * SCORE.vet };
}
export const score = sim => Object.values(scoreBreakdown(sim)).reduce((a, b) => a + b, 0);

export function stateHash(sim) {
  const h = createHasher(sim.tick).mixAll([sim.gold, sim.castle.hp, sim.killScore, sim.eventScore, sim.foes.length, sim.cmd.length,
    sim.xp, sim.level, sim.picks, sim.pending, sim.rerolls, sim.bans, sim.chests]);
  for (const id of CARD_IDS) h.mixAll([sim.cards[id], sim.banned[id] ? 1 : 0]);
  for (const id of EVO_IDS) h.mix(sim.evo[id] ? 1 : 0);
  for (const sl of sim.slots) h.mixAll([sl.kind.length, sl.hp, sl.queue.length]);
  for (const w of sim.walls) h.mixAll([w.lv, w.hp]);
  for (const u of sim.units) if (u.alive) h.mixAll([u.gen, u.lv, u.xp, u.hp, u.x, u.y, u.hx, u.hy]);
  for (const f of sim.foes) h.mixAll([f.id, f.hp, f.x, f.y, f.burn, f.slow, f.stun]);
  return h.value();
}

/** GameDef consumed by core/match.js. */
export const GAME = Object.freeze({
  id: 'lantern-hold', version: 5, maxTicks: MATCH_TICKS, maxChoices: LEVEL_MAX + REROLLS + BANS,
  createSim, step, phase, choose, score, stateHash, scoreBreakdown,
});
