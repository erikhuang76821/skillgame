// LanternHold (守望之戰) — prototype sim v3. Spec: ../../../gdd/05_game_spec.md, numbers: ../../../gdd/04_combat.md,
// cards: ../../../gdd/06_cards.md.
// Deterministic: no rendering, no wall clock, no unseeded randomness. Same seed + same input bytes + same choices = same score.
//
// Input: one byte per tick (core/match.js logs bytes). A command is 3 consecutive bytes: [op, a, b].
// Byte 0 while idle = no command. Ops: see OP below. Invalid commands are ignored without touching the state.
// Card picks are core/match.js choices: while an offer is open phase() is 'choice' and the world is paused.
import { makeRng, createHasher, TPS, ONE, COS, SIN, angleOf } from './core/index.js';
import { buildScript, STAGES, DEFAULT_STAGE, BOSS_TIERS, foeHpPct, bossHpPct, foeDmgPct, foeLevel, LEVEL_SEC } from './stages.js';
export { STAGES, STAGE_IDS, DEFAULT_STAGE, BOSS_TIERS } from './stages.js';

export { TICK_MS } from './core/index.js';

// --- §0 ---
export const VIEW_W = 720, VIEW_H = 1280;
export const CX = 360, CY = 600;                     // castle centre (px)

// --- §2 command protocol ---
export const OP = Object.freeze({ BUILD: 1, MENU: 2, MOVE: 3, WALL: 5, RALLY: 6 });
// RALLY: a = index in RALLY_KINDS, b = cell. Every soldier of that kind that is free to move goes there in formation.
export const RALLY_KINDS = Object.freeze(['archer', 'shield', 'priest', 'spearman', 'crossbow', 'knight']);
export const RALLY_GAP = 26;                                   // px between soldiers in a rally formation
export const CELL_W = 60, CELL_H = 64, GRID_W = 12, GRID_H = 20;   // 240 placement cells over 720 x 1280
export const cellOf = (x, y) => Math.min(GRID_W - 1, Math.max(0, Math.floor(x / CELL_W))) + Math.min(GRID_H - 1, Math.max(0, Math.floor(y / CELL_H))) * GRID_W;
export const cellCenter = c => [(c % GRID_W) * CELL_W + CELL_W / 2, Math.floor(c / GRID_W) * CELL_H + CELL_H / 2];
export const encode = (op, a, b) => [op, a & 255, b & 255];
// Choices while an offer is open: 0–2 take that card, 3 reroll, 4–6 ignore the type of slot 0–2, 7–9 lock it.
export const CHOICE = Object.freeze({ REROLL: 3, IGNORE: 4, LOCK: 7 });

// --- §3 random streams ---
const rng = makeRng({ trickle: 1, event: 2, offer: 3, chest: 4, foe: 5, rarity: 6 });

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
  worker: { armor: 0, hp: 30, def: 0, atk: 'slash', dmg: 3, period: 50, range: 16, speed: 110, aggro: 50, leash: 60, train: 180, repair: 3 },
  // unlockable through achievements (gdd/08 §4); behaviour follows ROLE
  spearman: { armor: 1, hp: 70, def: 1, atk: 'slash', dmg: 7, period: 70, range: 36, speed: 85, engage: 80, leash: 60, retreatPct: 30, rallyPct: 60, cost: 10, train: 180 },
  crossbow: { armor: 0, hp: 40, def: 0, atk: 'blast', dmg: 13, period: 110, range: 170, speed: 90, push: 6, pushMax: 40, homeAfter: 60, cost: 12, train: 210 },
  knight: { armor: 1, hp: 170, def: 3, atk: 'slash', dmg: 9, period: 45, range: 20, speed: 130, engage: 130, leash: 120, retreatPct: 30, rallyPct: 60, cost: 16, train: 300 },
  // summoned by a bone tower: weak, free (no population), never moved by the player; guards around its tower
  // engage / leash are measured from its tower; defend = how long after the tower is hit they rush back to it
  skeleton: { armor: 0, hp: 20, def: 0, atk: 'slash', dmg: 3, period: 50, range: 16, speed: 95, engage: 110, leash: 130, defend: 120 },
});
export const UNIT_KINDS = ['archer', 'shield', 'priest'];        // default loadout (barracks menu order)
// role: which behaviour a kind uses ('ranged' = archer rules, 'melee' = shield rules, 'healer' = priest rules)
export const ROLE = Object.freeze({ archer: 'ranged', crossbow: 'ranged', shield: 'melee', spearman: 'melee', knight: 'melee', priest: 'healer', worker: 'worker', skeleton: 'skeleton' });

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
  // v19 (gdd/04 §9): four foes with their own mechanic each
  slime: { armor: 0, hp: 24, def: 0, atk: 'slash', dmg: 3, period: 50, range: 14, speed: 70, score: 2, gold: 2, wall: 'mixed', split: 'slimelet', splitN: 2 },
  slimelet: { armor: 0, hp: 8, def: 0, atk: 'slash', dmg: 2, period: 45, range: 12, speed: 95, score: 1, gold: 1, wall: 'mixed', art: 'slime' },
  boar: { armor: 1, hp: 70, def: 2, atk: 'slash', dmg: 8, period: 60, range: 18, speed: 75, score: 6, gold: 7, wall: 'bash', charge: { r: 110, speed: 230, mult: 3 } },
  shaman: { armor: 0, hp: 28, def: 0, atk: 'blast', dmg: 3, period: 60, range: 16, speed: 45, score: 5, gold: 6, wall: 'detour', heal: { period: 120, r: 80, pct: 15 } },
  mole: { armor: 0, hp: 30, def: 1, atk: 'slash', dmg: 5, period: 45, range: 14, speed: 60, score: 5, gold: 6, wall: 'bash', burrow: 50 },
  bossWeak: { armor: 0, hp: 500, def: 1, atk: 'slash', dmg: 14, period: 60, range: 30, speed: 55, score: 20, gold: 30, aoe: 40, wall: 'bash', boss: true },
  bossMini: { armor: 1, hp: 1000, def: 2, atk: 'blast', dmg: 20, period: 90, range: 40, speed: 40, score: 40, gold: 50, aoe: 50, wall: 'bash', boss: true },
  boss: { armor: 1, hp: 1800, def: 3, atk: 'blast', dmg: 30, period: 120, range: 60, speed: 30, score: 60, gold: 80, aoe: 60, wall: 'bash', boss: true },
  bossSuper: { armor: 1, hp: 3600, def: 4, atk: 'blast', dmg: 40, period: 120, range: 70, speed: 26, score: 100, gold: 120, aoe: 70, wall: 'bash', boss: true },
});
export const FOE_KINDS = Object.keys(FOE);

// --- §5 economy & buildings: one currency (gold). Everything else grows through cards (gdd/06). ---
export const START_GOLD = 30;
// Outside-match settings from the menu (src/meta/meta.js modsFrom). Part of the match definition: replays need them.
export const NO_MODS = Object.freeze({ loadout: ['archer', 'shield', 'priest'], startGold: 0, trainPct: 0, vetXp: 0, pop: 0, wallPct: 0,
  castleHp: 0, repairPct: 0, palisade: false, killGold: 0, rerolls: 0, ignores: 0, locks: 0 });
export const POP_BASE = 4, POP_PER_BARRACKS = 4, POP_MAX = 32, LIGHT_BASE = 340;   // reaches 60 px past the wall line: soldiers can hold ground outside the walls
export const CASTLE = Object.freeze({ hp: 1000, def: 3, atk: 'pierce', dmg: 6, period: 60, r: 56 });
export const BARRACKS = Object.freeze({ cost: 20, costStep: 15, hp: [150, 220, 300], up: [30, 50] });   // n-th costs 20 + 15n; Lv2 / Lv3 unlock shield / priest
export const BUILD_TICKS = 60, QUEUE_MAX = 3, WORKER_MAX = 4, BLDG_AGGRO = 70;
// Workers get dearer the more you have: the n-th one (counting the ones alive and queued) costs WORKER_COST(n).
// The first is free; when one dies the next one is cheap again.
export const WORKER_COST = n => (n === 0 ? 0 : 5 + 5 * n);
// Build slots: the inner ring (0–5) takes barracks only, the outer ring (6–11) mage towers only.
export const INNER = k => k < 6;   // inner slots: barracks only; outer slots: barracks or mage tower
export const DEMOLISH = 9, REFUND_PCT = 70;   // OP.MENU b = DEMOLISH tears a building down for 70% of what it cost
// Mage towers (outer ring). Lv1 is a plain arcane tower (bolt). Then it specialises into one branch (Lv2) and
// levels inside it (Lv3, Lv4). Every tower keeps its bolt. tier = lv − 1 (0 for a plain tower).
export const TOWER = Object.freeze({ cost: 30, hp: [200, 260, 320, 380], range: 150, dmg: 5, period: 60, branchCost: 40, up: [50, 70] });
export const BRANCHES = Object.freeze(['frost', 'poison', 'banner', 'bone']);
export const BRANCH = Object.freeze({
  frost: { name: '冰霜塔', pulse: 90, radius: 110, radiusUp: 20, slow: 90, slowUp: 30, text: '範圍內敵人緩速' },
  poison: { name: '毒霧塔', pulse: 60, radius: 100, radiusUp: 15, dps: 2, dpsUp: 1, text: '範圍內敵人中毒（每 0.5 秒持續傷害）' },
  banner: { name: '戰旗塔', radius: 120, radiusUp: 15, atk: 30, atkUp: 15, def: 2, defUp: 1, text: '範圍內友軍攻擊、防禦提升' },
  bone: { name: '骸骨塔', pulse: 600, summon: 3, cap: [6, 9, 12], text: '每 10 秒召喚 3 名骷髏兵（可累積到上限，不能指揮）' },
});
// No redeploy cooldown (RTS-style): a soldier can be re-ordered at any time, even mid-walk.
export const SETUP_TICKS = 60, DEPLOY_NEAR_ALLY = 120;
export const MAX_UNITS = 64, MAX_FOES = 400;

// 12 build slots: 6 inner (r 140), 6 outer (r 215) — spaced so neighbouring buildings are easy to tap apart.
const ring = (n, r, off) => Array.from({ length: n }, (_, i) => { const a = (off + (i * 256) / n) & 255; return [CX + Math.trunc((COS[a] * r) / ONE), CY + Math.trunc((SIN[a] * r) / ONE)]; });
export const SLOTS = Object.freeze([...ring(6, 140, 21), ...ring(6, 215, 0)]);
// Door of each building: new soldiers step out on the side facing away from the castle (a barracks on the right
// sends them right, one at the top sends them up), 44 px from the building centre. Fixed-point offsets.
export const DOOR = Object.freeze(SLOTS.map(([x, y]) => { const dx = x - CX, dy = y - CY, d = Math.floor(Math.sqrt(dx * dx + dy * dy)); return [Math.trunc((dx * 44 * ONE) / d), Math.trunc((dy * 44 * ONE) / d)]; }));

// Walls: 24 segments on a ring. Gold builds and upgrades them (palisade -> stone -> iron); workers repair them.
// Gaps are routes: detouring foes walk the ring to the nearest gap, so the player shapes where enemies come in.
export const WALL_R = 280, WALL_SEGS = 24;
// The wall line is an octagon, not a circle: eight straight sides, each facing one lane (side normals at the lane
// angles, multiples of 32 in 256ths of a turn), WALL_R from the castle at the middle of a side, further at the corners.
// Three wall segments make one side. wallR(a) = distance from the castle to the wall line at angle a (fixed table).
export const WALL_RS = Object.freeze(Array.from({ length: 256 }, (_, a) => { const d = (((a + 16) & 31) - 16 + 256) & 255; return Math.trunc((WALL_R * ONE) / COS[d]); }));
export const wallR = a => WALL_RS[a & 255];
export const WALL = Object.freeze([null, { hp: 80, def: 1, cost: 5 }, { hp: 180, def: 3, cost: 12 }, { hp: 320, def: 5, cost: 20 }]);   // per segment
// v24: walls are built and upgraded a whole side at a time (8 sides x 3 segments; side k is centred on gate k's lane).
// Segments still break one by one (breaches), and workers repair them one by one.
export const WALL_SIDES = 8;
export const sideSegs = k => [(3 * k + 23) % 24, 3 * k, 3 * k + 1];
export const sideOf = seg => Math.floor(((seg + 1) % 24) / 3);
/** The level one tap brings the side to (lowest segment + 1), or 0 when the side is all iron. */
export const sideUpgradeTo = (sim, k) => { const lo = Math.min(...sideSegs(k).map(w => sim.walls[w].lv)); return lo >= 3 ? 0 : lo + 1; };
export function sideUpgradeCost(sim, k) {
  const to = sideUpgradeTo(sim, k);
  let c = 0;
  for (const w of sideSegs(k)) for (let l = sim.walls[w].lv + 1; l <= to; l++) c += WALL[l].cost;
  return c;
}
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
// v25: fewer monsters on screen (stages.js DENSITY), so each kill is worth more: XP per level x0.8, kill gold x1.3.
export const XP_NEED = L => Math.ceil(((4 + 3 * L + 2 * L * L) * 80) / 100);   // watch XP needed for level L -> L+1 (L from 0)
export const KILL_GOLD_PCT = 130;
export const LEVEL_MAX = 30, CARD_MAX = 3, REROLLS = 2, IGNORES = 1, LOCKS = 1;
// Chests: no dice. The number of cards depends only on where the chest came from (store rule: luck never decides).
export const CHEST_KILLS = [100, 250], CHEST_CARDS = Object.freeze({ kills: 1, event: 2 });
// A boss gives a pick, not a chest: its trait cards come at least at this rarity (2 頂級, 3 史詩, 4 傳說).
export const BOSS_FLOOR = Object.freeze({ weak: 2, mini: 3, big: 4, super: 4 });
export const POUCH_GOLD = 15;

// Card pool (gdd/06).
//   Trait cards: four per unit kind, no level cap, stack forever. Each offer of a trait card comes in one of five
//   rarities (一般／稀有／頂級／史詩／傳說); `val` is what that rarity adds. Percent traits add %, count traits add +n.
//   Special cards (elements, castle, walls, economy): Lv1–3 as before.
export const RARITY = Object.freeze([
  { name: '一般', color: '#e6e6e6' }, { name: '稀有', color: '#6ee07a' }, { name: '頂級', color: '#5aa8ff' },
  { name: '史詩', color: '#c27bff' }, { name: '傳說', color: '#ffa13d' },
]);
const PCT = [8, 10, 12, 15, 20], PCT_LOW = [6, 8, 10, 12, 15], PCT_HIGH = [10, 12, 15, 18, 25];
const N_SMALL = [1, 1, 2, 2, 3], N_DEF = [1, 1, 2, 3, 4], N_BIG = [1, 2, 3, 4, 5];
const T = (type, name, unit, val, text, cap) => ({ type, name, trait: true, unit, val, text, cap });
const TRAITS = {
  a_speed: T('archer', '連射', '%', PCT, '弓箭手攻速'),
  a_range: T('archer', '長弓', '%', PCT_LOW, '弓箭手射程（最多 +60%）', 60),
  a_dmg: T('archer', '強弓', '%', PCT, '弓箭手攻擊'),
  a_split: T('archer', '分裂箭', '+', N_SMALL, '箭多打中目標旁的敵人數（最多 6）', 6),
  s_hp: T('shield', '盾陣', '%', PCT_HIGH, '盾兵血量'),
  s_def: T('shield', '鐵甲', '+', N_DEF, '盾兵防禦（最多 +15）', 15),
  s_dmg: T('shield', '重擊', '%', PCT, '盾兵攻擊'),
  s_cleave: T('shield', '橫掃', '+', N_SMALL, '盾兵每擊多打的敵人數（最多 6）', 6),
  p_heal: T('priest', '祝禱', '%', PCT_HIGH, '牧師治療量'),
  p_cast: T('priest', '速詠', '%', PCT, '牧師詠唱與施法速度'),
  p_multi: T('priest', '群療', '+', N_SMALL, '每次治療多照顧的友軍數（最多 6）', 6),
  p_bless: T('priest', '庇護', '+', N_DEF, '被治療者 3 秒內防禦（最多 +10）', 10),
};
for (const [k, nm] of [['spearman', '長槍兵'], ['crossbow', '弩手'], ['knight', '騎士']]) {
  TRAITS[`${k}_dmg`] = T(k, `${nm}・攻擊`, '%', PCT, `${nm}攻擊`);
  TRAITS[`${k}_spd`] = T(k, `${nm}・速攻`, '%', PCT, `${nm}攻速`);
  TRAITS[`${k}_hp`] = T(k, `${nm}・體魄`, '%', PCT_HIGH, `${nm}血量`);
  TRAITS[`${k}_def`] = T(k, `${nm}・護甲`, '+', N_DEF, `${nm}防禦（最多 +15）`, 15);
}
export const CARDS = Object.freeze({
  ...TRAITS,
  reinforce: { type: 'economy', name: '援軍', text: '立刻來 2/3/4 名弓箭手（不佔人口）' },
  fireArrow: { type: 'element', name: '火箭', text: '弓箭手點燃敵人：每 0.5 秒 1/2/3 傷害，2 秒' },
  frostArrow: { type: 'element', name: '冰箭', text: '弓箭手緩速敵人 40%：1.5/2/2.5 秒' },
  chain: { type: 'element', name: '感電', text: '弓箭手每第 4 箭放電，跳 2/3/4 隻' },
  frostShield: { type: 'element', needs: 'shield', name: '霜盾', text: '盾兵的攻擊凍住敵人 0.33/0.67/1 秒' },
  burst: { type: 'castle', name: '爆裂', text: '敵人死亡時爆炸：半徑 50，8/12/16 傷害' },
  thunder: { type: 'castle', name: '落雷', text: '每 5/4.2/3.3 秒雷擊血最多的敵人 25/35/45' },
  fireWall: { type: 'wall', name: '火牆', text: '城牆灼燒貼牆的敵人 2/4/6 每 0.5 秒' },
  stoneWall: { type: 'wall', name: '石牆', text: '城牆耐久 +50%/級、防禦 +1/級，選到時全牆補滿' },
});
export const CARD_IDS = Object.freeze(Object.keys(CARDS));
// Card types (by unit) for ignore / lock.
export const CARD_TYPES = Object.freeze({ archer: '弓箭手', shield: '盾兵', priest: '牧師', spearman: '長槍兵', crossbow: '弩手', knight: '騎士', element: '元素', castle: '主城', wall: '城牆', economy: '經濟' });

export const EVOS = Object.freeze({
  arrowStorm: { name: '箭雨', from: 'a_speed', with: 'a_split', text: '每 4 秒朝最密的怪群降 3 波箭雨（半徑 90，每波 8）' },
  inferno: { name: '煉獄', from: 'burst', with: 'fireArrow', text: '死亡爆炸半徑 80，並點燃周圍敵人' },
  tempest: { name: '雷暴', from: 'thunder', with: 'chain', text: '落雷一次打 3 隻，每道都會跳' },
  winter: { name: '永冬', from: 'frostArrow', with: 'frostShield', text: '每 5 秒冰封燈光內所有敵人 1 秒' },
});
export const EVO_IDS = Object.freeze(Object.keys(EVOS));

// --- §5.6 spawn script (gdd/07) ---
export const GATES = 8, SPAWN_R = 700;
export const PREWARN_TICKS = 360, LULL_TICKS = 480, EVENT_CLEAR_TICKS = 30 * TPS;
const s = t => Math.round(t * TPS);
// The trickle tiers and the event timeline come from the stage (stages.js buildScript); they live on sim.script.
export const SPAWN_GAP = 12;

// --- §6 scoring ---
export const SCORE = Object.freeze({ eventClear: 40, eventPerSec: 8, boss: 300, bossPerSec: 10, castlePct: 2, vet: 10 });

// ---------------------------------------------------------------------------------------------
const F = v => v * ONE;                                     // px -> fixed
const isqrt = n => Math.floor(Math.sqrt(n));                // exact for n < 2^52
const d2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const within = (ax, ay, bx, by, r) => d2(ax, ay, bx, by) <= F(r) * F(r);
const perTick = pxPerSec => Math.trunc(F(pxPerSec) / TPS);
const emit = (sim, ev) => { if (sim.recordEvents) sim.events.push(ev); };
export function damage(atk, dmg, armor, def) { return Math.max(1, Math.floor((dmg * COUNTER[atk][armor]) / 100) - def); }

function gateXY(g) { const a = (g * 32 + 192) & 255; return [F(CX) + COS[a] * SPAWN_R, F(CY) + SIN[a] * SPAWN_R]; }   // gate 0 = top

export function createSim(seed, stage = DEFAULT_STAGE, mods = NO_MODS) {
  const script = buildScript(stage);
  const castleMax = CASTLE.hp + mods.castleHp;
  const sim = {
    seed: seed >>> 0, stage, script, mods, castleMax, diamonds: 0, bossKills: {}, tick: 0, killScore: 0, eventScore: 0, bossScore: 0,
    gold: START_GOLD + mods.startGold, xp: 0, level: 0, picks: 0, pending: 0, rerolls: REROLLS + mods.rerolls, ignores: IGNORES + mods.ignores, locks: LOCKS + mods.locks, lockType: '',
    cards: Object.fromEntries(CARD_IDS.map(id => [id, 0])), evo: Object.fromEntries(EVO_IDS.map(id => [id, false])),
    seen: { archer: true }, owned: [], trait: {}, floors: [], ignored: Object.fromEntries(Object.keys(CARD_TYPES).map(t => [t, false])), offer: null, rerollN: 0,
    chests: 0, chestKillN: 0,
    thunderCd: 0, rainCd: 0, rain: null, winterCd: 0, arrowN: 0, towersBuilt: 0, ironRing: false,
    castle: { hp: castleMax, cd: 0, queue: 0, progress: 0 },
    slots: SLOTS.map(() => ({ kind: '', lv: 0, hp: 0, build: 0, queue: [], progress: 0, branch: '', pulse: 0, cd: 0, spent: 0 })),
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
  if (mods.palisade) for (let g = 0; g < GATES; g++) { const w = sim.walls[segOf((g * 32 + 192) & 255)]; w.lv = 1; w.hp = wallMaxHp(sim, 1); }
  return sim;
}

export const lv = (sim, id) => sim.cards[id];
/** accumulated value of a trait card (%, or +n), 0 if never taken */
export const tr = (sim, id) => Math.min(sim.trait[id] ?? 0, CARDS[id]?.cap ?? Infinity);   // stacks forever, counts up to its cap
const pct = (v, p) => Math.trunc((v * (100 + p)) / 100);
const faster = (t, p) => Math.max(1, Math.trunc((t * 100) / (100 + p)));   // +p% speed -> shorter interval
export const barracksCount = sim => sim.slots.reduce((n, sl) => n + (sl.kind === 'barracks' ? 1 : 0), 0);
export const barracksCost = sim => BARRACKS.cost + BARRACKS.costStep * barracksCount(sim);
export const popCap = sim => Math.min(POP_MAX + sim.mods.pop, POP_BASE + sim.mods.pop + sim.level + POP_PER_BARRACKS * barracksCount(sim));
export const pop = sim => sim.units.reduce((n, u) => n + (u.alive && !u.free ? 1 : 0), 0) + sim.slots.reduce((n, sl) => n + sl.queue.length, 0) + sim.castle.queue;
export const workerCount = sim => sim.units.reduce((n, u) => n + (u.alive && u.kind === 'worker' ? 1 : 0), 0) + sim.castle.queue;
export const barracksMaxHp = sl => (sl.kind === 'tower' ? TOWER.hp : BARRACKS.hp)[Math.max(1, sl.lv) - 1];   // any building
export const isBldg = sl => sl.kind === 'barracks' || sl.kind === 'tower';
export const trainTicks = (sim, kind) => Math.trunc((UNIT[kind].train * (100 + sim.mods.trainPct)) / 100);
export const workerCost = sim => WORKER_COST(workerCount(sim));
export const towerTier = sl => sl.lv - 1;
export const towerRange = () => TOWER.range;                 // towers grow with their gold upgrades (v24: no tower cards)
export function towerRadius(sim, sl) { const b = BRANCH[sl.branch]; return b ? b.radius + b.radiusUp * (towerTier(sl) - 1) : 0; }
// 戰旗塔 aura: the best banner in range of this unit
function bannerAt(sim, u) {
  let atk = 0, def = 0;
  for (let k = 6; k < SLOTS.length; k++) {
    const sl = sim.slots[k];
    if (sl.kind !== 'tower' || sl.branch !== 'banner' || sl.build || !within(u.x, u.y, F(SLOTS[k][0]), F(SLOTS[k][1]), towerRadius(sim, sl))) continue;
    const b = BRANCH.banner, t = towerTier(sl) - 1;
    atk = Math.max(atk, b.atk + b.atkUp * t); def = Math.max(def, b.def + b.defUp * t);
  }
  return [atk, def];
}
export const lightR = () => LIGHT_BASE;
export const wallMaxHp = (sim, lv) => (lv > 0 ? Math.trunc((WALL[lv].hp * (100 + 50 * sim.cards.stoneWall + sim.mods.wallPct)) / 100) : 0);
const wallDef = (sim, lv) => WALL[lv].def + sim.cards.stoneWall;

const SKELETON_RESERVE = 6;
const freeUnitSlots = sim => { let n = 0; for (const u of sim.units) if (!u.alive) n++; return n; };
/** The nearest spot to (x, y) on rings 18 px apart where no living soldier has its post (fixed-point in and out). */
function freeSpot(sim, x, y) {
  for (let ring = 0; ring < 5; ring++) {
    const n = ring ? 6 * ring : 1;
    for (let k = 0; k < n; k++) {
      const a = ring ? ((k * 256) / n + ring * 11) & 255 : 0, rr = ring * 18;
      const px = x + Math.trunc((COS[a] * rr * ONE) / ONE), py = y + Math.trunc((SIN[a] * rr * ONE) / ONE);
      const [bx, by] = besideBuildings(sim, px, py);
      if (!sim.units.some(u => u.alive && u.kind !== 'skeleton' && d2(u.hx, u.hy, bx, by) < F(14) * F(14))) return [bx, by];
    }
  }
  return [x, y];
}
function spawnUnit(sim, kind, x, y, free = false) {
  const i = sim.units.findIndex(u => !u.alive);
  if (i < 0) return -1;
  if (!sim.seen[kind]) { sim.seen[kind] = true; emit(sim, { type: 'firstOf', kind }); }
  const d = UNIT[kind];
  sim.units[i] = { alive: true, gen: ++sim.unitGen, kind, lv: 1, xp: 0, xpAcc: 0, hp: d.hp, x, y, hx: x, hy: y,
    state: 'guard', cd: 0, setup: 0, target: -1, free, hurt: 0, job: -1, idle: 0, retreat: false, cast: 0, healTo: -1, bless: 0, blessDef: 0 };
  sim.units[i].hp = unitMaxHp(sim, sim.units[i]);
  if (sim.mods.vetXp && !free && kind !== 'worker') gainXp(sim, i, sim.mods.vetXp);
  emit(sim, { type: 'unitTrained', i, kind });
  return i;
}
export const unitMaxHp = (sim, u) => {
  const base = Math.trunc((UNIT[u.kind].hp * LV_MUL[u.lv - 1]) / 100);
  const hpTrait = { shield: 's_hp', spearman: 'spearman_hp', crossbow: 'crossbow_hp', knight: 'knight_hp' }[u.kind];
  return hpTrait ? pct(base, tr(sim, hpTrait)) : base;
};
const DEF_TRAIT = { shield: 's_def', spearman: 'spearman_def', crossbow: 'crossbow_def', knight: 'knight_def' };
const unitDef = (sim, u) => UNIT[u.kind].def + LV_DEF[u.lv - 1] + tr(sim, DEF_TRAIT[u.kind]) + (u.blessDef || 0) + bannerAt(sim, u)[1];
const unitDmg = (sim, u) => {
  let v = Math.trunc(((UNIT[u.kind].dmg ?? UNIT[u.kind].heal) * LV_MUL[u.lv - 1]) / 100);
  if (!UNIT[u.kind].heal) { const a = bannerAt(sim, u)[0]; if (a) v = Math.trunc((v * (100 + a)) / 100); }
  const dmgTrait = { archer: 'a_dmg', shield: 's_dmg', priest: 'p_heal', spearman: 'spearman_dmg', crossbow: 'crossbow_dmg', knight: 'knight_dmg' }[u.kind];
  return dmgTrait ? pct(v, tr(sim, dmgTrait)) : v;
};
const SPD_TRAIT = { archer: 'a_speed', spearman: 'spearman_spd', crossbow: 'crossbow_spd', knight: 'knight_spd' };
const unitPeriod = (sim, u) => faster(UNIT[u.kind].period, tr(sim, SPD_TRAIT[u.kind]));
export const unitReach = (sim, u) => (ROLE[u.kind] === 'ranged' ? archerReachOf(sim, u) : ROLE[u.kind] === 'melee' ? shieldEngage(sim, u.kind) : UNIT[u.kind].range);

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

// Soldiers never share a spot with a building (it would steal the tap): a post inside the castle or a building's
// footprint is moved straight out to the footprint's edge.
export const FOOT = Object.freeze({ castle: CASTLE.r + 18, slot: 34 });
export function besideBuildings(sim, x, y) {
  const out = (cx, cy, r) => {
    const dx = x - cx, dy = y - cy, d = isqrt(dx * dx + dy * dy);
    if (d >= F(r)) return false;
    if (d === 0) { y = cy + F(r); return true; }
    x = cx + Math.trunc((dx * F(r)) / d); y = cy + Math.trunc((dy * F(r)) / d);
    return true;
  };
  out(F(CX), F(CY), FOOT.castle);
  for (let k = 0; k < SLOTS.length; k++) if (sim.slots[k].kind) out(F(SLOTS[k][0]), F(SLOTS[k][1]), FOOT.slot);
  return [x, y];
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
  if (op === OP.BUILD) {                                    // a = slot; b = 0 barracks / 1 mage tower
    const sl = sim.slots[a];
    if (!sl || sl.kind) return;
    if (b === 0) {                                          // barracks: any slot
      const cost = barracksCost(sim);
      if (sim.gold < cost) return;
      sim.gold -= cost;
      Object.assign(sl, { kind: 'barracks', lv: 1, hp: 1, build: BUILD_TICKS, queue: [], progress: 0, branch: '', pulse: 0, cd: 0, spent: cost });
      emit(sim, { type: 'build', slot: a, kind: 'barracks' });
    } else if (b === 1) {                                   // mage tower: outer ring only
      if (INNER(a) || sim.gold < TOWER.cost) return;
      sim.gold -= TOWER.cost;
      Object.assign(sl, { kind: 'tower', lv: 1, hp: 1, build: BUILD_TICKS, queue: [], progress: 0, branch: '', pulse: 0, cd: 0, spent: TOWER.cost });
      if (!sim.seen.tower) { sim.seen.tower = true; emit(sim, { type: 'firstOf', kind: 'tower' }); }
      sim.towersBuilt++;                                    // achievement 法師議會 counts every tower built this match
      emit(sim, { type: 'build', slot: a, kind: 'tower' });
    }
  } else if (op === OP.MENU) {
    if (a === 255) {                                        // castle: 0 = train a worker
      const cost = workerCost(sim);
      if (b !== 0 || sim.castle.queue >= QUEUE_MAX || workerCount(sim) >= WORKER_MAX || pop(sim) >= popCap(sim) || sim.gold < cost) return;
      sim.gold -= cost; sim.castle.queue++;
      emit(sim, { type: 'queued', slot: 255, kind: 'worker' });
      return;
    }
    const sl = sim.slots[a];
    if (b === DEMOLISH) {                                   // tear down: 70% of build + upgrades back; queued recruits refunded in full
      if (!sl || !sl.kind) return;
      const refund = Math.trunc((sl.spent * REFUND_PCT) / 100) + sl.queue.reduce((t, k) => t + UNIT[k].cost, 0);
      sim.gold += refund;
      if (sl.kind === 'tower') clearSkeletons(sim, a);
      emit(sim, { type: 'demolish', slot: a, kind: sl.kind, refund });
      Object.assign(sl, { kind: '', lv: 0, hp: 0, build: 0, queue: [], progress: 0, branch: '', pulse: 0, cd: 0, spent: 0 });
      return;
    }
    if (sl && sl.kind === 'tower' && !sl.build) {          // tower: 0–3 specialise (from Lv1), 4 level up the branch
      if (b < 4 && sl.lv === 1 && sim.gold >= TOWER.branchCost) {
        sim.gold -= TOWER.branchCost; sl.spent += TOWER.branchCost; sl.branch = BRANCHES[b]; sl.lv = 2; sl.hp += TOWER.hp[1] - TOWER.hp[0]; sl.pulse = 0;
        emit(sim, { type: 'towerBranch', slot: a, branch: sl.branch });
      } else if (b === 4 && sl.lv >= 2 && sl.lv < 4 && sim.gold >= TOWER.up[sl.lv - 2]) {
        sim.gold -= TOWER.up[sl.lv - 2]; sl.spent += TOWER.up[sl.lv - 2]; sl.lv++; sl.hp += TOWER.hp[sl.lv - 1] - TOWER.hp[sl.lv - 2];
        emit(sim, { type: 'upgrade', slot: a, lv: sl.lv, kind: 'tower' });
      }
      return;
    }
    // barracks: 0 archer / 1 shield / 2 priest / 3 upgrade
    if (!sl || sl.kind !== 'barracks' || sl.build > 0) return;
    if (b === 3) {
      if (sl.lv >= 3 || sim.gold < BARRACKS.up[sl.lv - 1]) return;
      sim.gold -= BARRACKS.up[sl.lv - 1]; sl.spent += BARRACKS.up[sl.lv - 1]; sl.lv++; sl.hp += BARRACKS.hp[sl.lv - 1] - BARRACKS.hp[sl.lv - 2];
      emit(sim, { type: 'upgrade', slot: a, lv: sl.lv });
      return;
    }
    const kind = sim.mods.loadout[b];
    if (!kind || !UNIT[kind] || sl.lv < b + 1 || sl.queue.length >= QUEUE_MAX || pop(sim) >= popCap(sim) || sim.gold < UNIT[kind].cost) return;
    sim.gold -= UNIT[kind].cost; sl.queue.push(kind);
    emit(sim, { type: 'queued', slot: a, kind });
  } else if (op === OP.MOVE) {                              // a = unit index, b = cell (workers decide for themselves)
    const u = sim.units[a];
    if (!u || !u.alive || u.kind === 'worker' || u.kind === 'skeleton' || b >= GRID_W * GRID_H) return;
    const [px, py] = cellCenter(b), x = F(px), y = F(py);
    if (!canPlace(sim, x, y, a)) return;
    [u.hx, u.hy] = besideBuildings(sim, x, y);               // never stand on a building: step to its edge
    u.state = 'moving'; u.target = -1;
    emit(sim, { type: 'unitMoved', i: a, x: px, y: py });
  } else if (op === OP.RALLY) {                             // move every free soldier of one kind, spread out
    const kind = RALLY_KINDS[a];
    if (!kind || b >= GRID_W * GRID_H) return;
    const [px, py] = cellCenter(b), cx = F(px), cy = F(py);
    if (!canPlace(sim, cx, cy, -1)) return;
    // who moves: free soldiers of that kind, nearest to the rally point first (they take the centre)
    const team = [];
    sim.units.forEach((u, i) => { if (u.alive && u.kind === kind) team.push(i); });
    team.sort((i, j) => d2(sim.units[i].x, sim.units[i].y, cx, cy) - d2(sim.units[j].x, sim.units[j].y, cx, cy) || i - j);
    // formation: the centre, then rings of 6, 12, 18 ... spots RALLY_GAP apart; spots that break placement are skipped
    const spots = [];
    for (let ring = 0; spots.length < team.length && ring < 8; ring++) {
      const n = ring ? 6 * ring : 1;
      for (let k = 0; k < n && spots.length < team.length; k++) {
        const ang = ring ? ((k * 256) / n + ring * 11) & 255 : 0, rr = ring * RALLY_GAP;
        const x = cx + Math.trunc((COS[ang] * rr * ONE) / ONE), y = cy + Math.trunc((SIN[ang] * rr * ONE) / ONE);
        if (!canPlace(sim, x, y, -1)) continue;
        const [hx, hy] = besideBuildings(sim, x, y);
        if (spots.some(([sx, sy]) => d2(sx, sy, hx, hy) < F(RALLY_GAP - 6) * F(RALLY_GAP - 6))) continue;   // no stacking on a pushed-out spot
        spots.push([hx, hy]);
      }
    }
    team.slice(0, spots.length).forEach((i, n) => {
      const u = sim.units[i];
      [u.hx, u.hy] = spots[n]; u.state = 'moving'; u.target = -1;
    });
    emit(sim, { type: 'rally', kind, x: px, y: py, n: Math.min(team.length, spots.length) });
  } else if (op === OP.WALL) {                              // a = side 0–7 (v24: a whole side per tap), b = 0 build / upgrade
    if (a >= WALL_SIDES || b !== 0) return;
    const segs = sideSegs(a), target = sideUpgradeTo(sim, a);
    if (!target) return;
    const cost = sideUpgradeCost(sim, a);
    if (sim.gold < cost) return;
    sim.gold -= cost;
    for (const k of segs) {                                 // every segment below the target level comes up to it
      const w = sim.walls[k];
      if (w.lv >= target) continue;
      const before = wallMaxHp(sim, w.lv);
      w.lv = target; w.hp = w.hp + wallMaxHp(sim, target) - before;
    }
    if (sim.walls.every(x => x.lv === 3)) sim.ironRing = true;   // achievement: at any moment, not only at the end
    emit(sim, { type: 'wallBuild', side: a, seg: segs[1], lv: target });
  }
}

// --- level-ups and offers (gdd/06 §2) ---
// The k-th offer (k = picks made so far) and its r-th reroll come from a seeded weighted order of the card list:
// every card holds 2 tickets, cards of the locked type 3 (×1.5); maxed cards and ignored types are left out.
// Integer tickets only, so every engine draws the same order. A ready evolution always comes first, then the first
// card you already own in that order, then the rest of the order.
export function readyEvos(sim) { return EVO_IDS.filter(e => !sim.evo[e] && sim.cards[EVOS[e].from] >= CARD_MAX && sim.cards[EVOS[e].with] > 0); }
// A unit card enters the pool only once that unit has been on the field (worker, shield, priest, tower).
const NEEDS = { archer: 'archer', shield: 'shield', priest: 'priest', spearman: 'spearman', crossbow: 'crossbow', knight: 'knight' };
export const cardOk = (sim, id) => (CARDS[id].trait || sim.cards[id] < CARD_MAX) && !sim.ignored[CARDS[id].type] && (!NEEDS[CARDS[id].type] || !!sim.seen[NEEDS[CARDS[id].type]]) && (!CARDS[id].needs || !!sim.seen[CARDS[id].needs]);
// Draw weight: every card 2, a locked type 3 (x1.5). (v24: the worker cards these weights once damped are gone.)
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
  let order = offerOrder(sim);
  if (sim.floors.length) { const tr_ = order.filter(id => CARDS[id].trait); if (tr_.length) order = tr_; }   // boss pick: trait cards only, so the rarity floor counts
  const ids = [];
  const evo = readyEvos(sim)[0];
  if (evo) ids.push(evo);
  const owned = order.find(id => sim.cards[id] > 0);       // one slot always levels something you own
  if (owned) ids.push(owned);
  // fill in draw order, at most two cards of one type (never three of a kind)
  const typeOf = id => CARDS[id]?.type ?? id;
  for (const id of order) { if (ids.length >= 3) break; if (!ids.includes(id) && ids.filter(o => typeOf(o) === typeOf(id)).length < 2) ids.push(id); }
  for (const id of order) { if (ids.length >= 3) break; if (!ids.includes(id)) ids.push(id); }
  while (ids.length < 3) ids.push('pouch');
  // rarity of each trait card: tickets shift toward the rare end as the watch level rises (fixed per seed, no luck)
  const L = sim.level, tickets = [Math.max(4, 40 - 5 * L), 32 + L, 16 + 2 * L, 8 + 2 * L, 3 + L];
  const floor = sim.floors[0] ?? 0;                           // a boss pick waiting: rarity floor
  const rar = ids.map((id, n) => {
    if (!CARDS[id]?.trait) return 0;
    let t = rng.int(sim.seed, 'rarity', (sim.picks * 8 + sim.rerollN) * 4 + n, tickets.reduce((a, b) => a + b, 0)), r = 0;   // own stream: independent of the card order
    while (t >= tickets[r]) t -= tickets[r++];
    return Math.max(r, floor);
  });
  sim.offer = { ids, rar, k: sim.picks, boss: floor > 0 };
  emit(sim, { type: 'offer', ids: ids.slice(), rar: rar.slice(), k: sim.picks });
}
function applyCard(sim, id, how, rar = 0) {
  if (id === 'pouch') { sim.gold += POUCH_GOLD; emit(sim, { type: 'card', id, lv: 0, how }); return; }
  if (EVOS[id]) { sim.evo[id] = true; emit(sim, { type: 'evolve', id, how }); return; }
  const lvl = ++sim.cards[id];
  if (lvl === 1) sim.owned.push(id);
  if (CARDS[id].trait) sim.trait[id] = tr(sim, id) + CARDS[id].val[rar];
  if (id === 'reinforce') for (let n = 0; n <= lvl; n++) spawnUnit(sim, 'archer', F(CX - 30 + n * 20), F(CY + 80), true);
  if (id === 'stoneWall') for (const w of sim.walls) if (w.lv > 0) w.hp = wallMaxHp(sim, w.lv);
  emit(sim, { type: 'card', id, lv: lvl, how, rar });
}

export function choose(sim, index) {
  const o = sim.offer;
  if (!o || !Number.isInteger(index)) return false;
  if (index >= 0 && index < 3) {
    sim.offer = null; sim.picks++; sim.pending--; sim.rerollN = 0;
    if (o.boss) sim.floors.shift();
    applyCard(sim, o.ids[index], 'pick', o.rar[index]);
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
  const ups = [], rars = [];
  for (let j = 0; j < n; j++) {
    const evo = readyEvos(sim)[0];
    if (evo) { ups.push(evo); rars.push(0); applyCard(sim, evo, 'chest'); continue; }
    // the lowest-level card you own, oldest first: a fixed rule, so the player can plan around it
    let id = 'pouch';
    for (const k of sim.owned) if ((CARDS[k].trait || sim.cards[k] < CARD_MAX) && (id === 'pouch' || sim.cards[k] < sim.cards[id])) id = k;
    const rar = why === 'boss' ? 2 : 1;                     // chest traits come at 稀有, boss chests at 頂級
    ups.push(id); rars.push(CARDS[id]?.trait ? rar : 0); applyCard(sim, id, 'chest', rar);
  }
  emit(sim, { type: 'chest', n, ups, rars, why });
}

// --- spawning ---
function spawnFoe(sim, kind, gate, ev, at) {
  let living = 0; for (const f of sim.foes) if (f.hp > 0) living++;   // this tick's dead are still in the array
  if (living >= MAX_FOES) return false;
  const [x, y] = at ?? gateXY(gate), d = FOE[kind];
  const detour = d.wall === 'detour' || (d.wall === 'mixed' && rng.int(sim.seed, 'foe', sim.foeId, 2) === 1);
  const sec = Math.trunc(sim.tick / TPS);
  const hp = Math.trunc((d.hp * (d.boss ? bossHpPct(sec) : foeHpPct(sec, sim.script.hpLate))) / 100);
  const dmg = Math.trunc((d.dmg * foeDmgPct(sec)) / 100);
  sim.foes.push({ id: sim.foeId++, kind, x, y, hp, max: hp, lv: foeLevel(sec), dmg, cd: 0, ev, tKind: '', target: -1, gate, burn: 0, burnDmg: 0, slow: 0, stun: 0, poison: 0, poisonDmg: 0, done: false, detour,
    burrow: !!d.burrow, charged: false });
  if (ev >= 0) sim.eventState[ev].alive++;
  emit(sim, { type: 'spawn', kind, gate, id: sim.foeId - 1, hp });
  return true;
}

/** Tests only: put one foe of a kind at a world point (px). */
export const spawnForTest = (sim, kind, x, y) => { spawnFoe(sim, kind, 0, -1, [F(x), F(y)]); return sim.foes[sim.foes.length - 1]; };

function clearIfDone(sim, e) {
  const st = sim.eventState[e];
  if (st.alive !== 0 || st.spawned !== st.total || st.cleared || !st.started) return;
  st.cleared = true; st.clearTick = sim.tick;
  const EV = sim.script.events[e];
  const left = (EV.limit ?? EVENT_CLEAR_TICKS) - (sim.tick - EV.at);   // faster = more points
  const pts = left >= 0 ? SCORE.eventClear + Math.trunc(left / TPS) * SCORE.eventPerSec : 0;
  sim.eventScore += pts;
  emit(sim, { type: 'eventClear', ev: e, pts });
  if (pts && EV.chest) openChest(sim, 'event');
}
function tierAt(sim, t) { const tr = sim.script.trickle; let k = 0; while (k + 1 < tr.length && t >= tr[k + 1].from) k++; return tr[k]; }
export const lullUntil = sim => sim.eventState.reduce((m, e) => (e.cleared ? Math.max(m, e.clearTick + LULL_TICKS) : m), 0);

function stepSpawns(sim) {
  if (sim.tick > 0 && sim.tick % (LEVEL_SEC * TPS) === 0) emit(sim, { type: 'foeLevel', lv: foeLevel(sim.tick / TPS) });   // monsters level up every minute
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
    for (const q of sim.spawnQueue) {
      if (q.tick > sim.tick) { keep.push(q); continue; }
      const ok = spawnFoe(sim, q.kind, q.gate, q.ev);
      if (q.ev >= 0) { const st = sim.eventState[q.ev]; if (ok) st.spawned++; else st.total--; clearIfDone(sim, q.ev); }   // a foe the cap dropped no longer counts
    }
    sim.spawnQueue = keep;
  }
}

// --- economy ---
function stepEconomy(sim) {
  const c = sim.castle;
  if (c.queue > 0 && c.progress < UNIT.worker.train) c.progress++;
  if (c.queue > 0 && c.progress >= UNIT.worker.train && freeUnitSlots(sim) > 0) {   // no free unit slot: wait, never lose it
    c.progress = 0; c.queue--;
    const [wx, wy] = freeSpot(sim, F(CX - 30), F(CY + 70));
    const i = spawnUnit(sim, 'worker', wx, wy);
    if (i >= 0) emit(sim, { type: 'workerBorn', i });
  }
  for (let k = 0; k < SLOTS.length; k++) {
    const sl = sim.slots[k];
    if (!isBldg(sl)) continue;
    if (sl.build > 0) { sl.build--; sl.hp = Math.max(sl.hp, Math.trunc((barracksMaxHp(sl) * (BUILD_TICKS - sl.build)) / BUILD_TICKS)); continue; }
    if (sl.kind === 'barracks' && sl.queue.length) {
      if (sl.progress < trainTicks(sim, sl.queue[0])) sl.progress++;
      if (sl.progress >= trainTicks(sim, sl.queue[0]) && freeUnitSlots(sim) > 0) {   // trained, and room to stand: out it comes
        sl.progress = 0;
        const [ox, oy] = DOOR[k];                            // the side facing away from the castle
        const [x, y] = freeSpot(sim, F(SLOTS[k][0]) + ox, F(SLOTS[k][1]) + oy);   // never on top of a soldier already there
        spawnUnit(sim, sl.queue.shift(), x, y);
      }
    }
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
function cellInfo(x, y) {                                    // [segment, wall radius] of the 8 px cell under a point
  const cx = Math.floor(x / ONE / 8), cy = Math.floor(y / ONE / 8), key = cx * 100003 + cy;
  let v = segCache.get(key);
  if (v === undefined) { const a = angleOf(cx * 8 + 4 - CX, cy * 8 + 4 - CY); v = [segOf(a), wallR(a)]; segCache.set(key, v); }
  return v;
}
const wallSegAt = (x, y) => cellInfo(x, y)[0];
const wallRAt = (x, y) => cellInfo(x, y)[1];

// --- foes ---
/** A closed wall stands between a ground foe outside the wall line and a target inside it. Ranged foes already in
 *  range shoot over it; everyone else has to break the wall or walk to a gap first. */
function walledOff(sim, f, d, tx, ty) {
  if (d.fly) return false;
  if (isqrt(d2(f.x, f.y, F(CX), F(CY))) <= F(wallRAt(f.x, f.y))) return false;          // the foe is already inside
  if (isqrt(d2(tx, ty, F(CX), F(CY))) > F(wallRAt(tx, ty))) return false;              // the target is outside too
  if (d.ranged && within(f.x, f.y, tx, ty, d.range)) return false;
  return sim.walls[wallSegAt(f.x, f.y)].lv > 0;
}
function foeRetarget(sim, f) {
  const d = FOE[f.kind];
  f.tKind = ''; f.target = -1;
  let best = -1, bestD = Infinity;
  if (!d.fly) {                                            // buildings first: a barracks in reach draws every ground foe
    for (let k = 0; k < SLOTS.length; k++) {
      if (!isBldg(sim.slots[k])) continue;
      const dd = d2(f.x, f.y, F(SLOTS[k][0]), F(SLOTS[k][1]));
      if (dd <= F(BLDG_AGGRO) * F(BLDG_AGGRO) && dd < bestD && !walledOff(sim, f, d, F(SLOTS[k][0]), F(SLOTS[k][1]))) { bestD = dd; best = k; }
    }
    if (best >= 0) { f.tKind = 'slot'; f.target = best; return; }
  }
  for (let i = 0; i < MAX_UNITS; i++) {
    const u = sim.units[i];
    if (!u.alive) continue;
    const r = UNIT[u.kind].taunt ?? 40, dd = d2(f.x, f.y, u.x, u.y);
    if (dd <= F(r) * F(r) && dd < bestD && !walledOff(sim, f, d, u.x, u.y)) { bestD = dd; best = i; }
  }
  if (best >= 0) { f.tKind = 'unit'; f.target = best; return; }
  if (d.fly) {
    for (let k = 0; k < SLOTS.length; k++) {
      if (!isBldg(sim.slots[k])) continue;
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
function clearSkeletons(sim, k) { for (const u of sim.units) if (u.alive && u.kind === 'skeleton' && u.owner === k) { u.hp = 0; u.alive = false; } }
// A foe that just hit a building or the castle is a raider for ALERT.ticks: ranged soldiers shoot raiders first.
function markRaider(sim) { const f = sim.foes.find(x => x.id === sim.curFoe); if (f) f.raidT = sim.tick; }
function hurtSlot(sim, k, dmg, atk) {
  const sl = sim.slots[k];
  if (!isBldg(sl)) return;
  sl.hp -= damage(atk, dmg, ARMOR.bldg, 2); sl.hitT = sim.tick;
  markRaider(sim);
  emit(sim, { type: 'hit', who: 'slot', k, by: sim.curFoe });
  if (sl.hp <= 0) {
    emit(sim, { type: 'bldgDown', slot: k, kind: sl.kind });
    if (sl.kind === 'tower') clearSkeletons(sim, k);           // a fallen tower takes its skeletons with it
    Object.assign(sl, { kind: '', lv: 0, hp: 0, build: 0, queue: [], progress: 0, branch: '', pulse: 0, cd: 0, spent: 0 });
  }
}
function hurtWall(sim, w, dmg, atk) {
  const wl = sim.walls[w], max = wallMaxHp(sim, wl.lv), before = wl.hp;
  wl.hp -= damage(atk, dmg, ARMOR.bldg, wallDef(sim, wl.lv));
  emit(sim, { type: 'wallHit', seg: w, crack: before * 10 >= max * 6 && wl.hp * 10 < max * 6, by: sim.curFoe });
  if (wl.hp <= 0) { wl.lv = 0; wl.hp = 0; emit(sim, { type: 'wallBreak', seg: w }); }
}
function hurtCastle(sim, dmg, atk) {
  sim.castle.hp -= damage(atk, dmg, ARMOR.bldg, CASTLE.def); sim.castle.hitT = sim.tick;
  markRaider(sim);
  emit(sim, { type: 'castleHit', by: sim.curFoe });
}

function splash(sim, x, y, r, dmg, atk) {                  // enemy area attacks: hit our side
  for (let i = 0; i < MAX_UNITS; i++) { const u = sim.units[i]; if (u.alive && within(x, y, u.x, u.y, r)) hurtUnit(sim, i, dmg, atk); }
  for (let k = 0; k < SLOTS.length; k++) if (isBldg(sim.slots[k]) && within(x, y, F(SLOTS[k][0]), F(SLOTS[k][1]), r)) hurtSlot(sim, k, dmg, atk);
  const seg = wallSegAt(x, y), wl = sim.walls[seg];
  const rr = isqrt(d2(x, y, F(CX), F(CY)));
  if (wl.lv > 0 && Math.abs(rr - F(wallRAt(x, y))) <= F(r)) hurtWall(sim, seg, dmg, atk);
  if (within(x, y, F(CX), F(CY), r + CASTLE.r)) hurtCastle(sim, dmg, atk);
}

function foeSpeed(sim, f, d) {
  let v = d.speed;
  if (f.slow > 0) v = Math.trunc((v * 60) / 100);
  return v;
}

function stepFoe(sim, fi) {
  const f = sim.foes[fi], d = FOE[f.kind];
  if (f.burn > 0) { f.burn--; if (f.burn % 30 === 0) trueHurt(sim, fi, f.burnDmg, 'burn'); if (f.hp <= 0) return; }
  if (f.poison > 0) { f.poison--; if (f.poison % 30 === 0) trueHurt(sim, fi, f.poisonDmg, 'poison'); if (f.hp <= 0) return; }
  if (f.slow > 0) f.slow--;
  if (f.stun > 0) { f.stun--; return; }
  if (f.cd > 0) f.cd--;
  if (f.burrow) {                                           // mole: tunnels under walls and buildings, surfaces inside the wall line
    if (isqrt(d2(f.x, f.y, F(CX), F(CY))) <= F(wallRAt(f.x, f.y) - d.burrow)) { f.burrow = false; emit(sim, { type: 'surface', id: f.id, x: f.x / ONE, y: f.y / ONE }); }
    else { moveToward(f, F(CX), F(CY), foeSpeed(sim, f, d)); return; }
  }
  if (d.heal && (f.id + sim.tick) % d.heal.period === 0) {  // shaman: heals every foe around it (itself too)
    let n = 0;
    // one heal per foe per period, however many shamans are around; bosses are never healed
    for (const o of sim.foes) {
      if (o.hp <= 0 || o.hp >= o.max || FOE[o.kind].boss || sim.tick - (o.healT ?? -1e9) < d.heal.period || !within(f.x, f.y, o.x, o.y, d.heal.r)) continue;
      o.hp = Math.min(o.max, o.hp + Math.max(1, Math.trunc((o.max * d.heal.pct) / 100))); o.healT = sim.tick; n++;
    }
    emit(sim, { type: 'foeHeal', id: f.id, x: f.x / ONE, y: f.y / ONE, r: d.heal.r, n });
  }
  if ((f.id + sim.tick) % 6 === 0) foeRetarget(sim, f);
  if (f.tKind === 'unit' && !sim.units[f.target].alive) { f.tKind = ''; f.target = -1; }
  if (f.tKind === 'slot' && !isBldg(sim.slots[f.target])) { f.tKind = ''; f.target = -1; }
  if (f.tKind === 'unit' && walledOff(sim, f, d, sim.units[f.target].x, sim.units[f.target].y)) { f.tKind = ''; f.target = -1; }   // the target stepped behind a wall
  if (f.tKind === 'slot' && walledOff(sim, f, d, F(SLOTS[f.target][0]), F(SLOTS[f.target][1]))) { f.tKind = ''; f.target = -1; }
  let speed = foeSpeed(sim, f, d);
  if (d.charge && !f.charged) {                             // boar: sprints at the first thing it reaches, and that first hit lands triple
    const r0 = isqrt(d2(f.x, f.y, F(CX), F(CY)));
    const near = f.tKind === 'unit' ? within(f.x, f.y, sim.units[f.target].x, sim.units[f.target].y, d.charge.r)
      : f.tKind === 'slot' ? within(f.x, f.y, F(SLOTS[f.target][0]), F(SLOTS[f.target][1]), d.charge.r)
      : r0 <= F(wallRAt(f.x, f.y) + d.charge.r) && r0 > F(wallRAt(f.x, f.y));
    if (near) { speed = Math.trunc((d.charge.speed * speed) / d.speed); if (!f.rush) { f.rush = true; emit(sim, { type: 'charge', id: f.id }); } }
  }

  const attack = fn => {
    if (f.cd !== 0) return;
    f.cd = d.period;
    const first = d.charge && !f.charged, base = f.dmg;
    if (first) { f.dmg = base * d.charge.mult; f.charged = true; }
    fn();
    f.dmg = base;
    emit(sim, { type: 'foeAtk', id: f.id, heavy: first });
    if (d.boom) { f.hp = 0; f.boomed = true; }
  };
  const boom = () => { splash(sim, f.x, f.y, d.boom, f.dmg, d.atk); emit(sim, { type: 'boom', x: f.x / ONE, y: f.y / ONE }); };
  if (d.boom && f.tKind === 'unit' && within(f.x, f.y, sim.units[f.target].x, sim.units[f.target].y, d.range + 8)) { attack(boom); return; }
  if (f.tKind === 'unit') {
    const u = sim.units[f.target];
    if (within(f.x, f.y, u.x, u.y, d.range + 8)) {
      attack(() => { if (d.aoe) splash(sim, u.x, u.y, d.aoe, f.dmg, d.atk); else { hurtUnit(sim, f.target, f.dmg, d.atk); if (u.alive && ROLE[u.kind] === 'ranged' && !d.ranged) pushUnit(sim, u, f); } });
      return;
    }
    moveToward(f, u.x, u.y, speed); return;
  }
  if (f.tKind === 'slot') {
    const tx = F(SLOTS[f.target][0]), ty = F(SLOTS[f.target][1]);
    if (within(f.x, f.y, tx, ty, d.range + 24)) { attack(() => hurtSlot(sim, f.target, f.dmg, d.atk)); return; }
    moveToward(f, tx, ty, speed); return;
  }
  const r = isqrt(d2(f.x, f.y, F(CX), F(CY)));
  if (!d.fly) {
    const seg = wallSegAt(f.x, f.y), wl = sim.walls[seg];
    const reach = d.ranged ? d.range : d.range + 8;
    const WR = wallRAt(f.x, f.y);
    if (wl.lv > 0 && r > F(WR) && r <= F(WR + Math.max(reach, DETOUR_BAND))) {
      const dir = f.detour ? gapDir(sim, seg) : 0;
      if (dir) {                                              // walk along the outside of the ring, one segment at a time
        const a = segAngle((seg + dir + WALL_SEGS) % WALL_SEGS);
        moveToward(f, F(CX) + COS[a] * (wallR(a) + DETOUR_BAND - 8), F(CY) + SIN[a] * (wallR(a) + DETOUR_BAND - 8), speed);
        return;
      }
      if (r <= F(WR + reach)) { attack(() => (d.boom ? boom() : hurtWall(sim, seg, f.dmg, d.atk))); return; }
    }
    for (let k = 0; k < SLOTS.length; k++) {
      if (isBldg(sim.slots[k]) && within(f.x, f.y, F(SLOTS[k][0]), F(SLOTS[k][1]), 30 + d.range)) { attack(() => (d.boom ? boom() : hurtSlot(sim, k, f.dmg, d.atk))); return; }
    }
  }
  if (r <= F(CASTLE.r + d.range)) { attack(() => (d.boom ? boom() : hurtCastle(sim, f.dmg, d.atk))); return; }
  moveToward(f, F(CX), F(CY), speed);
}

// --- our damage and card effects ---
function hurtFoe(sim, fi, dmg, atk, by) {
  const f = sim.foes[fi], d = FOE[f.kind];
  if (f.hp <= 0 || f.burrow) return;
  let dd = damage(atk, dmg, d.armor, d.def);
  f.hp -= dd;
  emit(sim, { type: 'hit', who: 'foe', id: f.id, dmg: dd, counter: COUNTER[atk][d.armor] - 100 });
  if (f.hp <= 0 && by >= 0) gainXp(sim, by, 1);
}
function trueHurt(sim, fi, n, why) {
  const f = sim.foes[fi];
  if (f.hp <= 0 || n <= 0 || f.burrow) return;
  f.hp -= n;
  emit(sim, { type: 'hit', who: 'foe', id: f.id, dmg: n, counter: 0, why });
}
function blastFoes(sim, x, y, r, dmg, atk, skip = -1) {
  for (let j = 0; j < sim.foes.length; j++) if (j !== skip && sim.foes[j].hp > 0 && within(x, y, sim.foes[j].x, sim.foes[j].y, r)) hurtFoe(sim, j, dmg, atk, -1);
}
function ignite(sim, fi, n, ticks = 120) {
  const f = sim.foes[fi];
  if (f.hp <= 0 || f.burrow) return;
  f.burn = Math.max(f.burn, ticks); f.burnDmg = Math.max(f.burnDmg, n);
}
function chill(sim, fi, ticks) {
  const f = sim.foes[fi];
  if (f.hp <= 0 || f.burrow) return;
  f.slow = Math.max(f.slow, ticks);
}
// An electric strike that jumps between foes.
function zap(sim, fi, jumps, dmg, from) {
  const pts = from ? [from] : [];
  const seen = new Set();
  let cur = fi;
  for (let j = 0; j <= jumps && cur >= 0; j++) {
    const f = sim.foes[cur];
    seen.add(cur); pts.push([f.x / ONE, f.y / ONE]);
    hurtFoe(sim, cur, dmg, 'slash', -1);
    let next = -1, bd = F(80) * F(80) + 1;
    for (let k = 0; k < sim.foes.length; k++) {
      if (seen.has(k) || sim.foes[k].hp <= 0 || sim.foes[k].burrow) continue;
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
  if (tr(sim, 'a_split')) {
    let n = tr(sim, 'a_split');
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

function nearestFoe(sim, x, y, r, only) {
  let best = -1, bestD = F(r) * F(r) + 1;
  for (let i = 0; i < sim.foes.length; i++) {
    const f = sim.foes[i];
    if (f.hp <= 0 || f.burrow || (only && !only(f))) continue;                    // a burrowed mole cannot be seen or hit
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
const archerReachOf = (sim, u) => (u.kind === 'archer' ? pct(UNIT.archer.range, tr(sim, 'a_range')) : UNIT[u.kind].range);
const shieldEngage = (sim, k = 'shield') => UNIT[k].engage;
const shieldLeash = (sim, k = 'shield') => UNIT[k].leash;
const priestCast = sim => faster(UNIT.priest.cast, tr(sim, 'p_cast'));
const priestPeriod = sim => faster(UNIT.priest.period, tr(sim, 'p_cast'));
export const archerPushMax = (sim, k = 'archer') => UNIT[k].pushMax;

/** A melee hit shoves an archer away from the attacker, never further than pushMax from its post. */
function pushUnit(sim, u, f) {
  const max = archerPushMax(sim, u.kind);
  if (max <= 0) return;
  const dx = u.x - f.x, dy = u.y - f.y, d = isqrt(dx * dx + dy * dy) || 1, st = F(UNIT.archer.push);
  let nx = u.x + Math.trunc((dx * st) / d), ny = u.y + Math.trunc((dy * st) / d);
  const hx = nx - u.hx, hy = ny - u.hy, hd = isqrt(hx * hx + hy * hy);
  if (hd > F(max)) { nx = u.hx + Math.trunc((hx * F(max)) / hd); ny = u.hy + Math.trunc((hy * F(max)) / hd); }
  u.x = nx; u.y = ny; u.idle = 0;
}

// --- v23: foes push each other apart, heavy hits knock them back (gdd/04 §10) ---
// Body radius by kind (px); bosses push others but are never moved; fliers and burrowed moles take no part.
const FOE_BODY = Object.freeze({ rat: 6, moth: 6, slimelet: 5, shade: 7, shroom: 7, slime: 8, shaman: 7, mole: 7, beetle: 9, boar: 10, snail: 12, wolf: 11 });
export const KNOCK = Object.freeze({ shield: 6, spearman: 8, knight: 10, crossbow: 5 });   // px per heavy hit; elites take half, bosses none
/** Move a foe by (dx, dy) fixed-point, unless that would carry it from outside a closed wall to inside it. */
function nudgeFoe(sim, f, dx, dy) {
  if (!dx && !dy) return;
  const nx = f.x + dx, ny = f.y + dy;
  if (!FOE[f.kind].fly) {
    const r0 = isqrt(d2(f.x, f.y, F(CX), F(CY))), r1 = isqrt(d2(nx, ny, F(CX), F(CY)));
    if (r0 > F(wallRAt(f.x, f.y)) && r1 <= F(wallRAt(nx, ny)) && sim.walls[wallSegAt(nx, ny)].lv > 0) return;
  }
  f.x = nx; f.y = ny;
}
function separateFoes(sim) {
  const CELL = 24, grid = new Map(), body = f => FOE_BODY[f.kind] ?? (FOE[f.kind].boss ? 24 : 7);
  const key = (cx, cy) => cx * 8192 + cy;
  for (let i = 0; i < sim.foes.length; i++) {
    const f = sim.foes[i];
    if (f.hp <= 0 || f.burrow || FOE[f.kind].fly) continue;
    const k = key(Math.floor(f.x / ONE / CELL), Math.floor(f.y / ONE / CELL));
    let b = grid.get(k); if (!b) grid.set(k, (b = [])); b.push(i);
  }
  for (let i = 0; i < sim.foes.length; i++) {
    const a = sim.foes[i];
    if (a.hp <= 0 || a.burrow || FOE[a.kind].fly) continue;
    const cx = Math.floor(a.x / ONE / CELL), cy = Math.floor(a.y / ONE / CELL);
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
      for (const j of grid.get(key(gx, gy)) ?? []) {
        if (j <= i) continue;
        const b = sim.foes[j], min = F(body(a) + body(b));
        let dx = b.x - a.x, dy = b.y - a.y; const dd = dx * dx + dy * dy;
        if (dd >= min * min) continue;
        if (dd === 0) { dx = (a.id & 1) ? ONE : -ONE; dy = 0; }
        const d = Math.max(1, isqrt(dx * dx + dy * dy)), over = min - d;
        const pa = FOE[a.kind].boss ? 0 : FOE[b.kind].boss ? over : over >> 1, pb = FOE[b.kind].boss ? 0 : over - pa;
        nudgeFoe(sim, a, -Math.trunc((dx * pa) / d), -Math.trunc((dy * pa) / d));
        nudgeFoe(sim, b, Math.trunc((dx * pb) / d), Math.trunc((dy * pb) / d));
      }
    }
  }
}
function knockBack(sim, u, f) {
  const k = KNOCK[u.kind];
  if (!k || f.hp <= 0 || f.burrow || FOE[f.kind].boss) return;
  const px = FOE[f.kind].elite ? k >> 1 : k, dx = f.x - u.x, dy = f.y - u.y, d = Math.max(1, isqrt(dx * dx + dy * dy));
  nudgeFoe(sim, f, Math.trunc((dx * F(px)) / d), Math.trunc((dy * F(px)) / d));
}

function unitStrike(sim, i, fi) {
  const u = sim.units[i], d = UNIT[u.kind], f = sim.foes[fi];
  u.cd = unitPeriod(sim, u);
  emit(sim, { type: 'shot', i, kind: u.kind, x: u.x / ONE, y: u.y / ONE, tx: f.x / ONE, ty: f.y / ONE });
  if (u.kind === 'archer') { archerHit(sim, i, fi); return; }
  if (u.kind === 'crossbow') { hurtFoe(sim, fi, unitDmg(sim, u), d.atk, i); knockBack(sim, u, f); return; }
  hurtFoe(sim, fi, unitDmg(sim, u), d.atk, i);
  knockBack(sim, u, f);
  if (sim.cards.frostShield && f.hp > 0) { f.stun = Math.max(f.stun, 20 * sim.cards.frostShield); emit(sim, { type: 'react', id: 'freeze', x: f.x / ONE, y: f.y / ONE, r: 16 }); }
  let n = u.kind === 'shield' ? tr(sim, 's_cleave') : 0;    // 橫掃: the swing also hits foes right next to the target
  for (let k = 0; k < sim.foes.length && n > 0; k++) {
    if (k === fi || sim.foes[k].hp <= 0 || !within(f.x, f.y, sim.foes[k].x, sim.foes[k].y, 30)) continue;
    n--; hurtFoe(sim, k, unitDmg(sim, u), d.atk, i);
  }
}

// Call to arms (v26): a building or the castle hit in the last ALERT.ticks draws the soldiers whose post is within
// ALERT.r of it. Melee soldiers chase the attacker past their usual leash; ranged soldiers step forward until it is in
// reach. Each goes home when the attacker is gone. Walls do not call (they are hit all the time; posts would empty).
export const ALERT = Object.freeze({ r: 200, ticks: 120, near: 90 });
function alertTarget(sim, u) {
  let best = -1, bd = F(ALERT.r) * F(ALERT.r) + 1, bx = 0, by = 0;
  const consider = (x, y, hitT) => {
    if (sim.tick - (hitT ?? -1e9) >= ALERT.ticks) return;
    const dd = d2(u.hx, u.hy, x, y);
    if (dd < bd) { bd = dd; best = 1; bx = x; by = y; }
  };
  for (let k = 0; k < SLOTS.length; k++) if (isBldg(sim.slots[k])) consider(F(SLOTS[k][0]), F(SLOTS[k][1]), sim.slots[k].hitT);
  consider(F(CX), F(CY), sim.castle.hitT);
  return best < 0 ? -1 : nearestFoe(sim, bx, by, ALERT.near);
}

function stepArcher(sim, i) {
  const u = sim.units[i], d = UNIT[u.kind], reach = archerReachOf(sim, u);
  if ((i + sim.tick) % 4 === 0 || u.target < 0 || !sim.foes[u.target] || sim.foes[u.target].hp <= 0) {
    u.target = nearestFoe(sim, u.x, u.y, reach, f => sim.tick - (f.raidT ?? -1e9) < ALERT.ticks);   // raiders in reach first
    if (u.target < 0) u.target = nearestFoe(sim, u.x, u.y, reach);
  }
  if (u.target >= 0) { u.idle = 0; if (u.cd === 0) unitStrike(sim, i, u.target); return; }
  const a = (i + sim.tick) % 4 === 0 ? alertTarget(sim, u) : -1;    // a building under attack nearby: step up into range
  if (a >= 0) { const f = sim.foes[a], ox = u.x, oy = u.y; moveToward(u, f.x, f.y, d.speed); if (!within(u.x, u.y, u.hx, u.hy, ALERT.r)) { u.x = ox; u.y = oy; } u.idle = 0; return; }
  if (++u.idle >= d.homeAfter) moveToward(u, u.hx, u.hy, d.speed);   // nothing in reach for a while: back to the post
}

function stepShield(sim, i) {
  const u = sim.units[i], d = UNIT[u.kind];
  const pct = Math.trunc((u.hp * 100) / unitMaxHp(sim, u));
  if (pct < d.retreatPct) u.retreat = true; else if (pct >= d.rallyPct) u.retreat = false;
  if (u.retreat) { moveToward(u, u.hx, u.hy, d.speed); u.target = -1; return; }
  if ((i + sim.tick) % 4 === 0 || u.target < 0 || !sim.foes[u.target] || sim.foes[u.target].hp <= 0) {
    u.target = nearestFoe(sim, u.hx, u.hy, shieldEngage(sim, u.kind)); u.alert = false;
    if (u.target < 0) { u.target = alertTarget(sim, u); u.alert = u.target >= 0; }     // nothing at the post: answer a call
  }
  if (u.target < 0) { moveToward(u, u.hx, u.hy, d.speed); return; }
  const f = sim.foes[u.target];
  if (within(u.x, u.y, f.x, f.y, d.range + 8)) { if (u.cd === 0) unitStrike(sim, i, u.target); return; }
  const ox = u.x, oy = u.y;
  moveToward(u, f.x, f.y, d.speed);
  if (!within(u.x, u.y, u.hx, u.hy, u.alert ? ALERT.r + 40 : shieldLeash(sim, u.kind))) { u.x = ox; u.y = oy; }   // hold at the leash (longer when called)
}

// Skeletons guard their bone tower: the tower is the centre of everything they do.
//   1. tower hit in the last 2 s -> rush to the foe nearest the tower (defence first, no leash)
//   2. a foe within `engage` of the tower -> chase it, but never further than `leash` from the tower
//   3. nothing to do -> walk back to their spot beside the tower
function stepSkeleton(sim, i) {
  const u = sim.units[i], d = UNIT.skeleton, sl = sim.slots[u.owner];
  const tx = F(SLOTS[u.owner][0]), ty = F(SLOTS[u.owner][1]);
  const defending = sl.kind === 'tower' && sim.tick - (sl.hitT ?? -9999) < d.defend;
  if (defending) u.target = nearestFoe(sim, tx, ty, d.engage);
  else if ((i + sim.tick) % 4 === 0 || u.target < 0 || !sim.foes[u.target] || sim.foes[u.target].hp <= 0) u.target = nearestFoe(sim, tx, ty, d.engage);
  if (u.target < 0) { moveToward(u, u.hx, u.hy, d.speed); return; }
  const f = sim.foes[u.target];
  if (within(u.x, u.y, f.x, f.y, d.range + 8)) {
    if (u.cd === 0) { u.cd = d.period; emit(sim, { type: 'shot', i, kind: 'skeleton', x: u.x / ONE, y: u.y / ONE, tx: f.x / ONE, ty: f.y / ONE }); hurtFoe(sim, u.target, unitDmg(sim, u), d.atk, -1); }
    return;
  }
  const ox = u.x, oy = u.y;
  moveToward(u, f.x, f.y, d.speed);
  if (!defending && !within(u.x, u.y, tx, ty, d.leash)) { u.x = ox; u.y = oy; u.target = -1; moveToward(u, u.hx, u.hy, d.speed); }   // too far: fall back
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
    if (tr(sim, 'p_bless')) { v.bless = 180; v.blessDef = tr(sim, 'p_bless'); }
    let extra = tr(sim, 'p_multi');                       // 群療: also heals this many hurt allies near the target
    for (let j = 0; j < MAX_UNITS && extra > 0; j++) {
      const w = sim.units[j];
      if (j === u.healTo || !w.alive || w.hp >= unitMaxHp(sim, w) || !within(v.x, v.y, w.x, w.y, 60)) continue;
      extra--;
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
  if (u.bless > 0 && --u.bless === 0) u.blessDef = 0;
  if (u.state === 'moving') { if (moveToward(u, u.hx, u.hy, UNIT[u.kind].speed)) { u.state = 'setup'; u.setup = SETUP_TICKS; emit(sim, { type: 'unitSetup', i }); } return; }
  if (u.state === 'setup') { if (--u.setup <= 0) u.state = 'guard'; return; }
  if (u.hurt > 0) u.hurt--;
  if (u.kind === 'worker') stepWorker(sim, i);
  else if (ROLE[u.kind] === 'ranged') stepArcher(sim, i);
  else if (ROLE[u.kind] === 'melee') stepShield(sim, i);
  else if (u.kind === 'skeleton') stepSkeleton(sim, i);
  else stepPriest(sim, i);
}

// Workers: fight back first (when hit in the last 2 s or a foe is right next to them), else repair the most damaged
// wall or barracks that no other worker is on, else wait by the castle. Jobs: wall segment 0–23, barracks 100 + slot.
const jobPoint = j => {
  if (j >= 100) return [F(SLOTS[j - 100][0]), F(SLOTS[j - 100][1] + 30)];
  const a = segAngle(j);
  return [F(CX) + COS[a] * (wallR(a) - 18), F(CY) + SIN[a] * (wallR(a) - 18)];
};
function jobNeed(sim, j) {                                  // missing hp in per-mille, 0 = nothing to do
  if (j >= 100) { const sl = sim.slots[j - 100]; return isBldg(sl) && !sl.build && sl.hp < barracksMaxHp(sl) ? 1000 - Math.trunc((sl.hp * 1000) / barracksMaxHp(sl)) : 0; }
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
  u.xpAcc += d.repair * (100 + sim.mods.repairPct);   // hp per second × 100
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
  c.cd = CASTLE.period;
  const f = sim.foes[t];
  emit(sim, { type: 'shot', i: -1, kind: 'castle', x: CX, y: CY - 60, tx: f.x / ONE, ty: f.y / ONE });
  hurtFoe(sim, t, CASTLE.dmg, CASTLE.atk, -1);
}

// Timed card powers: thunder, arrow storm, eternal winter, burning walls.
// Mage towers: every tower shoots a bolt; a specialised tower also pulses its branch effect.
function stepTowers(sim) {
  for (let k = 6; k < SLOTS.length; k++) {
    const sl = sim.slots[k];
    if (sl.kind !== 'tower' || sl.build) continue;
    const x = F(SLOTS[k][0]), y = F(SLOTS[k][1]) - F(30);
    if (sl.cd > 0) sl.cd--;
    else {
      const t = nearestFoe(sim, x, y, towerRange(sim, sl));
      if (t >= 0) {
        sl.cd = TOWER.period;
        const f = sim.foes[t];
        emit(sim, { type: 'shot', i: -1, kind: 'tower', branch: sl.branch, x: x / ONE, y: y / ONE, tx: f.x / ONE, ty: f.y / ONE });
        hurtFoe(sim, t, TOWER.dmg + 2 * towerTier(sl), 'blast', -1);
      }
    }
    const b = BRANCH[sl.branch];
    if (!b || !b.pulse) continue;
    if (++sl.pulse < b.pulse) continue;
    sl.pulse = 0;
    const tier = towerTier(sl) - 1, r = towerRadius(sim, sl), cx = F(SLOTS[k][0]), cy = F(SLOTS[k][1]);
    if (sl.branch === 'frost' || sl.branch === 'poison') {
      let n = 0;
      for (let j = 0; j < sim.foes.length; j++) {
        const f = sim.foes[j];
        if (f.hp <= 0 || f.burrow || !within(cx, cy, f.x, f.y, r)) continue;
        n++;
        if (sl.branch === 'frost') chill(sim, j, b.slow + b.slowUp * tier);
        else { f.poison = Math.max(f.poison, 120); f.poisonDmg = Math.max(f.poisonDmg, b.dps + b.dpsUp * tier); }
      }
      emit(sim, { type: 'towerPulse', slot: k, branch: sl.branch, r: r, n });
    } else if (sl.branch === 'bone') {
      const cap = b.cap[tier];
      let have = 0;
      for (const u of sim.units) if (u.alive && u.kind === 'skeleton' && u.owner === k) have++;
      // skeletons never take the unit slots the army needs: keep room for the population cap and reinforcements
      const room = freeUnitSlots(sim) - Math.max(0, popCap(sim) - pop(sim)) - SKELETON_RESERVE;
      for (let n = 0; n < b.summon && have < cap && n < room; n++, have++) {
        const i = spawnUnit(sim, 'skeleton', cx + F(-20 + 20 * n), cy + F(36), true);
        if (i < 0) break;
        sim.units[i].owner = k;
      }
      emit(sim, { type: 'towerPulse', slot: k, branch: 'bone', r: 40, n: have });
    }
  }
}

function stepPowers(sim) {
  const th = sim.cards.thunder;
  if (th && --sim.thunderCd <= 0) {
    let period = 300 - 50 * (th - 1);
    sim.thunderCd = period;
    const R = lightR(sim) + 200, picks = [];
    for (let n = 0; n < (sim.evo.tempest ? 3 : 1); n++) {
      let best = -1;
      for (let k = 0; k < sim.foes.length; k++) {
        const f = sim.foes[k];
        if (f.hp <= 0 || f.burrow || picks.includes(k) || !within(f.x, f.y, F(CX), F(CY), R)) continue;
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
    for (const f of sim.foes) if (f.hp > 0 && !f.burrow && within(f.x, f.y, F(CX), F(CY), lightR(sim))) { f.stun = Math.max(f.stun, 60); f.slow = Math.max(f.slow, 60); n++; }
    emit(sim, { type: 'winter', n, r: lightR(sim) });
  }
  const fw = sim.cards.fireWall;
  if (fw && sim.tick % 30 === 0) {
    for (let k = 0; k < sim.foes.length; k++) {
      const f = sim.foes[k];
      if (f.hp <= 0 || FOE[f.kind].fly) continue;
      const r = isqrt(d2(f.x, f.y, F(CX), F(CY)));
      const WR = wallRAt(f.x, f.y);
      if (r < F(WR) || r > F(WR + 40) || sim.walls[wallSegAt(f.x, f.y)].lv === 0) continue;
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
        const gold = Math.trunc((d.gold * KILL_GOLD_PCT + 99) / 100);
        sim.gold += gold; sim.killScore += d.score; sim.kills++; chain++;
        if (sim.mods.killGold && sim.kills % 50 === 0) sim.gold += sim.mods.killGold;
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
      } else emit(sim, { type: 'kill', id: f.id, kind: f.kind, x: f.x / ONE, y: f.y / ONE, gold: 0 });
      if (d.split) for (let k = 0; k < d.splitN; k++) {        // slime splits; a half never lands across a closed wall
        const at = { kind: f.kind, x: f.x, y: f.y };
        nudgeFoe(sim, at, F(k ? 8 : -8), F(k ? 4 : -4));
        spawnFoe(sim, d.split, f.gate, f.ev, [at.x, at.y]);
      }
      if (d.boss && f.ev >= 0) {
        const ev = sim.script.events[f.ev];
        emit(sim, { type: 'bossDown', tier: ev.boss, final: ev.final });
        sim.bossKills[ev.boss] = (sim.bossKills[ev.boss] ?? 0) + 1;
        // diamonds: a mini boss gives 1, +1 if the castle is at 80% or more, +1 if it fell within 30 s; the final boss 3
        if (ev.boss === 'mini') {
          const n = 1 + (sim.castle.hp * 100 >= sim.castleMax * 80 ? 1 : 0) + (sim.tick - ev.at <= 30 * TPS ? 1 : 0);
          sim.diamonds += n; emit(sim, { type: 'diamonds', n });
        }
        if (ev.final) { sim.diamonds += 3; emit(sim, { type: 'diamonds', n: 3 }); }
        // the boss reward is a real pick: one extra three-way choice whose trait cards come at a rarity floor
        sim.floors.push(BOSS_FLOOR[ev.boss]); sim.pending++;
        emit(sim, { type: 'bossPick', tier: ev.boss, floor: BOSS_FLOOR[ev.boss] });
        if (ev.final) { sim.bossDead = true; sim.bossTick = sim.tick; }
      }
      if (f.ev >= 0) {
        const st = sim.eventState[f.ev];
        st.alive--;
        clearIfDone(sim, f.ev);
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
  separateFoes(sim);
  for (let i = 0; i < MAX_UNITS; i++) if (sim.units[i].alive) stepUnit(sim, i);
  stepCastle(sim);
  stepTowers(sim);
  stepPowers(sim);
  reap(sim);
  sim.tick++;
  if (sim.pending > 0 && !sim.offer && sim.castle.hp > 0) drawOffer(sim);
  if (phase(sim) === 'over') emit(sim, { type: 'over', win: sim.bossDead });
}

export const phase = sim => (sim.tick >= sim.script.matchTicks || sim.castle.hp <= 0 || sim.bossDead ? 'over' : sim.offer ? 'choice' : 'play');

export function scoreBreakdown(sim) {
  const castlePct = Math.max(0, Math.trunc((sim.castle.hp * 100) / sim.castleMax));
  const vets = sim.units.filter(u => u.alive && u.lv === 3).length;
  const boss = sim.bossDead ? SCORE.boss + Math.trunc((sim.script.matchTicks - sim.bossTick) / TPS) * SCORE.bossPerSec : 0;
  const over = sim.tick >= sim.script.matchTicks || sim.castle.hp <= 0 || sim.bossDead;
  return { kills: sim.killScore, events: sim.eventScore, boss, castle: over ? castlePct * SCORE.castlePct : 0, veterans: vets * SCORE.vet };
}
export const score = sim => Object.values(scoreBreakdown(sim)).reduce((a, b) => a + b, 0);

export function stateHash(sim) {
  const h = createHasher(sim.tick).mixAll([sim.diamonds, sim.gold, sim.castle.hp, sim.killScore, sim.eventScore, sim.foes.length, sim.cmd.length,
    sim.xp, sim.level, sim.picks, sim.pending, sim.floors.length, sim.rerolls, sim.ignores, sim.locks, sim.lockType.length, sim.chests, sim.castle.queue]);
  for (const id of CARD_IDS) h.mixAll([sim.cards[id], tr(sim, id)]);
  for (const t of Object.keys(CARD_TYPES)) h.mixAll([sim.ignored[t] ? 1 : 0, sim.lockType === t ? 1 : 0]);
  for (const id of EVO_IDS) h.mix(sim.evo[id] ? 1 : 0);
  for (const sl of sim.slots) h.mixAll([sl.kind.length, sl.lv, sl.hp, sl.queue.length, sl.branch.length, sl.pulse, sl.cd, sl.spent]);
  for (const w of sim.walls) h.mixAll([w.lv, w.hp]);
  for (const u of sim.units) if (u.alive) h.mixAll([u.gen, u.lv, u.xp, u.hp, u.x, u.y, u.hx, u.hy, u.job, u.cast, u.retreat ? 1 : 0, u.bless]);
  for (const f of sim.foes) h.mixAll([f.id, f.hp, f.x, f.y, f.burn, f.slow, f.stun, f.poison, f.burrow ? 1 : 0, f.charged ? 1 : 0]);
  return h.value();
}

/** GameDef for one stage (core/match.js). Each stage is its own leaderboard: id `lantern-hold-<stage>`. */
// Mods (talents, loadout) are part of the match definition, so they are part of the game id: a replay checked against
// another id is refused, and gameFromId rebuilds the exact GameDef from an upload (no mods = the plain stage id).
const MOD_KEYS = ['startGold', 'trainPct', 'vetXp', 'pop', 'wallPct', 'castleHp', 'repairPct', 'killGold', 'rerolls', 'ignores', 'locks'];
export function modsKey(m) {
  const parts = MOD_KEYS.filter(k => m[k]).map(k => `${k}${m[k]}`);
  if (m.palisade) parts.push('palisade');
  if (m.loadout.join() !== NO_MODS.loadout.join()) parts.push(`L${m.loadout.join('.')}`);
  return parts.join('_');
}
export function gameFromId(id) {
  const [, stage, key = ''] = /^lantern-hold-(s\d+)(?:~(.*))?$/.exec(id) ?? [];
  if (!stage || !STAGES[stage]) return null;
  const m = { ...NO_MODS };
  for (const part of key ? key.split('_') : []) {
    if (part === 'palisade') m.palisade = true;
    else if (part[0] === 'L') m.loadout = part.slice(1).split('.');
    else { const k = MOD_KEYS.find(x => part.startsWith(x)); if (!k) return null; m[k] = Number(part.slice(k.length)); }
  }
  const g = makeGame(stage, Object.freeze(m));
  return g.id === id ? g : null;                              // one spelling per mods set
}
export function makeGame(stage, mods = NO_MODS) {
  const script = buildScript(stage), ticks = script.matchTicks, key = modsKey(mods);
  const bossPicks = script.events.filter(e => e.boss).length;   // every boss kill adds one pick
  return Object.freeze({
    id: `lantern-hold-${stage}${key ? `~${key}` : ''}`, stage, mods, version: 26, maxTicks: ticks,
    maxChoices: LEVEL_MAX + bossPicks + REROLLS + IGNORES + LOCKS + mods.rerolls + mods.ignores + mods.locks + 4,
    createSim: seed => createSim(seed, stage, mods), step, phase, choose, score, stateHash, scoreBreakdown,
  });
}
export const GAMES = Object.freeze(Object.fromEntries(Object.keys(STAGES).map(k => [k, makeGame(k)])));
/** The default stage's GameDef (tests, tools, audit). */
export const GAME = GAMES[DEFAULT_STAGE];
