// Stages and the stage-script generator (gdd/07). A stage is data — length, boss schedule, map — and buildScript()
// turns it into the trickle tiers and the event timeline the sim runs. Pure and deterministic: the script depends
// only on the stage; the seed then picks gates and trickle content inside it, the same for every player.
import { TPS } from './core/index.js';

// Map: theme picks palette and props (render only); `gates` = how many of the 8 lanes this map opens (sim).
// Bosses: [second, tier]. The last one is the final boss; the match ends when it dies or GRACE seconds after it appears.
export const STAGES = Object.freeze({
  s5: { name: '春之原野', minutes: 5, hpLate: 0, theme: 'spring', gates: 8, bosses: [[120, 'weak'], [210, 'mini'], [300, 'big']], bans: ['shaman', 'mole'] },   // first stage: one new mechanic per chapter (slime, boar)
  s8: { name: '烈日沙丘', minutes: 8, hpLate: 12, theme: 'desert', gates: 8, bosses: [[120, 'weak'], [210, 'mini'], [300, 'big'], [390, 'mini'], [480, 'big']] },
  s10: { name: '高嶺隘口', minutes: 10, hpLate: 8, theme: 'highland', gates: 8, bosses: [[120, 'weak'], [210, 'mini'], [300, 'big'], [390, 'mini'], [480, 'big'], [600, 'big']] },
  s12: { name: '秋楓谷', minutes: 12, hpLate: 6, theme: 'autumn', gates: 8, bosses: [[120, 'weak'], [210, 'mini'], [300, 'big'], [390, 'mini'], [480, 'big'], [720, 'big']] },
  s15: { name: '永夜雪原', minutes: 15, hpLate: 4, theme: 'winter', gates: 8, bosses: [[120, 'weak'], [210, 'mini'], [300, 'big'], [390, 'mini'], [480, 'big'], [720, 'big'], [900, 'super']] },
});
export const STAGE_IDS = Object.freeze(Object.keys(STAGES));
export const DEFAULT_STAGE = 's5';
export const GRACE = 90;                                     // seconds to kill the final boss
export const EVENT_EVERY = 25, BOSS_CLEARANCE = 20;          // an event slot every 25 s, none within 20 s of a boss
// Events and escorts grow with time: +60% per 100 s after the second minute, +120% per 100 s after the fourth (the defence grows too: cards, walls, workers).
// Foe toughness grows too (survivor-style): +2/3 % hp per second after 3:00 (bosses: see bossHpPct).
// Early ease (v18): before 3:40 foes have 70% hp (same numbers, so kills, gold and XP still flow) — the opening teaches.
export const EARLY_EASE = { until: 220, hpPct: 70 };
// Monster levels (v19): every LEVEL_SEC the monsters go up one level (shown on screen). From Lv4 each level adds
// LEVEL_HP % hp; the early levels bring new kinds instead (KINDS_AT).
export const LEVEL_SEC = 60, LEVEL_HP = 15;
export const foeLevel = sec => 1 + Math.floor(sec / LEVEL_SEC);
export const foeHpPct = (sec, hpLate = 0) => (sec < EARLY_EASE.until ? EARLY_EASE.hpPct : 100) + LEVEL_HP * Math.max(0, foeLevel(sec) - 3) + Math.max(0, sec - 360) * hpLate;
// Long stages: after 6:00 the player's power stops growing (population, cards and walls are maxed), so foe toughness
// speeds up (the stage's hpLate % per second: shorter stages climb faster, so every stage ends hard) and bosses that come after 5:00 get tougher with time (BOSS_LATE % per second).
export const BOSS_LATE = 0.5;
export const bossHpPct = sec => 100 + Math.trunc(Math.max(0, sec - 300) * BOSS_LATE);
// ...and foes hit harder after 6:00, so maxed iron walls and repair crews can still be broken (DMG_LATE % per second).
export const DMG_LATE = 1;
export const foeDmgPct = sec => 100 + Math.max(0, sec - 360) * DMG_LATE;
export const growthPct = sec => 100 + Math.trunc(((Math.max(0, sec - 120) + Math.max(0, sec - 240) / 2) * 3) / 5);   // and twice as fast after 4:00

// Event templates in load order (each one is a step up; gdd/07 §2). [kind, count, gate] with gate 'a' (warned
// side), 'b' (opposite of a), 'n' (a second warned side) or 'all'. After the last one the list loops from LOOP_FROM;
// growthPct keeps long stages climbing.
const T = [
  { name: '小股突襲', groups: [['rat', 10, 'a']] },            // first two waves are a gentle start (v18)
  { name: '飛蛾群', groups: [['moth', 20, 'a']] },
  { name: '鼠潮', groups: [['rat', 15, 'a'], ['rat', 15, 'b']] },
  { name: '甲蟲隊', chest: true, groups: [['beetle', 5, 'a'], ['beetle', 5, 'n']] },
  { name: '史萊姆潮', groups: [['slime', 8, 'a'], ['rat', 12, 'n']] },
  { name: '攻城蝸牛', chest: true, limit: 45, groups: [['snail', 1, 'a'], ['snail', 1, 'n'], ['rat', 24, 'a'], ['beetle', 4, 'n'], ['moth', 12, 'n']] },
  { name: '野豬衝鋒', groups: [['boar', 4, 'a'], ['beetle', 4, 'a'], ['rat', 12, 'b']] },
  { name: '巫菇祭儀', chest: true, groups: [['shaman', 3, 'a'], ['beetle', 6, 'a'], ['rat', 12, 'a'], ['slime', 4, 'n']] },
  { name: '精英夾擊', chest: true, groups: [['wolf', 2, 'a'], ['rat', 18, 'a'], ['wolf', 2, 'b'], ['rat', 18, 'b'], ['snail', 2, 'n']] },
  { name: '鼴鼠地道', groups: [['mole', 8, 'a'], ['rat', 14, 'n'], ['boar', 2, 'b']] },
  { name: '影弓伏擊', groups: [['shade', 12, 'a'], ['rat', 20, 'a'], ['shade', 12, 'n'], ['beetle', 6, 'n']] },
  { name: '爆裂菇', groups: [['shroom', 21, 'a'], ['beetle', 9, 'a']] },
  { name: '月蝕', chest: true, groups: [['rat', 9, 'all'], ['beetle', 4, 'all'], ['moth', 4, 'all'], ['shade', 2, 'all']] },
];
const LOOP_FROM = 3;

// Boss tiers: the boss foe, its escort, and the chest it drops (extra cards on top of the usual roll).
export const BOSS_TIERS = Object.freeze({
  weak: { kind: 'bossWeak', name: '弱王・影鼠王', escort: [['rat', 12, 'a']], bonus: 1 },
  mini: { kind: 'bossMini', name: '小王・甲殼巨蟲', escort: [['beetle', 6, 'a'], ['moth', 10, 'n']], bonus: 2 },
  big: { kind: 'boss', name: '大王・永夜之喉', escort: [['beetle', 12, 'a'], ['wolf', 4, 'b'], ['shade', 12, 'n'], ['rat', 24, 'b'], ['snail', 3, 'b']], bonus: 3 },
  super: { kind: 'bossSuper', name: '超大王・無月之母', escort: [['beetle', 16, 'a'], ['wolf', 6, 'b'], ['snail', 2, 'n']], bonus: 3 },
});

// Trickle: a tier every 30 s. Gaps between batches shrink with time; kinds join as the match goes on.
// Each monster level brings a new kind into the trickle: Lv2 slime, Lv3 boar, Lv4 shaman, Lv5 mole.
const KINDS_AT = [[0, ['rat']], [60, ['rat', 'rat', 'beetle', 'slime']], [120, ['rat', 'beetle', 'moth', 'slime', 'boar']],
  [150, ['rat', 'beetle', 'moth', 'shade', 'slime', 'boar']], [180, ['rat', 'beetle', 'moth', 'wolf', 'shade', 'shaman', 'boar']],
  [210, ['rat', 'beetle', 'moth', 'shroom', 'shade', 'shaman', 'boar']], [240, ['rat', 'beetle', 'moth', 'shroom', 'shade', 'shaman', 'boar', 'mole', 'slime']]];

// Density (v25): fewer monsters on screen for a calmer, readable fight. Event groups are DENSITY.event % of the
// template (elites and bosses, n <= 2, untouched); trickle batches come DENSITY.trickle % further apart.
export const DENSITY = Object.freeze({ event: 80, trickle: 130 });
const scaleGroups = (groups, pct) => groups.map(([kind, n, gate]) => ({ kind, n: n <= 2 ? n : Math.max(1, Math.trunc((n * pct * DENSITY.event) / 10000)), gate }));

/** Stage -> { matchTicks, trickle: [{from, period, gates, kinds}], events: [{at, name, groups, chest?, limit?, boss?, final?}] } */
export function buildScript(stageId) {
  const st = STAGES[stageId];
  if (!st) throw new Error(`unknown stage ${stageId}`);
  const finalAt = st.bosses[st.bosses.length - 1][0];
  const matchSec = finalAt + GRACE;
  const trickle = [], bans = st.bans ?? [], ok = kind => !bans.includes(kind);
  const pool = T.filter(tpl => tpl.groups.every(([kind]) => ok(kind))), loopFrom = pool.indexOf(T[LOOP_FROM]);   // events with a banned foe are left out
  for (let k = 0; k * 30 < matchSec; k++) {
    const t = k * 30;
    let kinds = KINDS_AT[0][1];
    for (const [from, ks] of KINDS_AT) if (t >= from) kinds = ks.filter(ok);
    trickle.push({ from: t * TPS, period: Math.round((Math.max(50, Math.round((216 * 30) / (30 + 4 * k + (t > 210 ? 4 * (k - 7) : 0)))) * DENSITY.trickle) / 100), gates: t < 30 ? 1 : t < 90 ? 4 : Math.min(8, st.gates), kinds });
  }
  const events = [];
  let n = 0;
  for (let t = EVENT_EVERY; t < finalAt; t += EVENT_EVERY) {
    if (st.bosses.some(([at]) => Math.abs(at - t) < BOSS_CLEARANCE)) continue;
    const loop = n < pool.length ? 0 : 1 + Math.floor((n - pool.length) / (pool.length - loopFrom));
    const tpl = n < pool.length ? pool[n] : pool[loopFrom + ((n - pool.length) % (pool.length - loopFrom))];
    n++;
    events.push({ at: t * TPS, name: loop ? `${tpl.name} ${'+'.repeat(loop)}` : tpl.name, chest: !!tpl.chest, limit: tpl.limit ? tpl.limit * TPS : undefined, groups: scaleGroups(tpl.groups, growthPct(t)) });
  }
  st.bosses.forEach(([at, tier], k) => {
    const b = BOSS_TIERS[tier];
    events.push({ at: at * TPS, name: b.name, boss: tier, final: k === st.bosses.length - 1, groups: [{ kind: b.kind, n: 1, gate: 'a' }, ...scaleGroups(b.escort, growthPct(at))] });
  });
  events.sort((x, y) => x.at - y.at);
  return Object.freeze({ stage: stageId, bans: Object.freeze(bans.slice()), hpLate: st.hpLate, matchTicks: matchSec * TPS, trickle: Object.freeze(trickle), events: Object.freeze(events) });
}
