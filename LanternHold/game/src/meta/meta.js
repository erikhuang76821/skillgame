// Outside-the-match layer (gdd/08_meta.md): profile, talents, loadout, achievements, stage unlocks.
// Pure data + pure functions, except load/save which use localStorage (offline only, store rule: no cloud saves).
// The sim never reads the profile: the menu turns it into a plain `mods` object passed to createSim, so a match is
// still fully defined by (stage, mods, seed, inputs) and replays exactly.
import { STAGE_IDS } from '../sim/stages.js';

// tier: 1 basic, 2 advanced, 3 top. Slot n (0-based) takes units of tier ≤ n + 1 — slots 2 and 3 are backward
// compatible — and slot n is trained from barracks Lv n + 1.
export const ROSTER = Object.freeze({
  archer: { tier: 1, name: '弓箭手', text: '遠程，站樁射擊' },
  shield: { tier: 1, name: '盾兵', text: '迎敵、嘲諷、撤退' },
  priest: { tier: 1, name: '牧師', text: '詠唱治療' },
  spearman: { tier: 2, name: '長槍兵', text: '長距離刺擊，剋重甲' },
  crossbow: { tier: 2, name: '弩手', text: '慢速重弩，打穿重甲' },
  knight: { tier: 3, name: '騎士', text: '高血量、快速衝鋒' },
});
export const TIER_NAME = ['', '基礎', '進階', '頂階'];
export const fits = (unit, slot) => !!ROSTER[unit] && ROSTER[unit].tier <= slot + 1;
/** Equip a unit into a slot (default: the first slot it fits). Swaps if it was in another slot and the other unit fits there. */
export function equip(p, unit, slot = [0, 1, 2].find(n => fits(unit, n))) {
  if (!p.units.includes(unit) || !fits(unit, slot)) return false;
  const from = p.loadout.indexOf(unit), old = p.loadout[slot];
  p.loadout[slot] = unit;
  if (from >= 0 && from !== slot) p.loadout[from] = fits(old, from) ? old : START_UNITS.find(u => !p.loadout.includes(u) && fits(u, from)) ?? old;
  return true;
}
export const START_UNITS = ['archer', 'shield', 'priest'];

// Talents: three branches, each tier needs one rank in the tier above. Costs are per rank, in diamonds.
export const TALENTS = Object.freeze([
  { id: 'gold', branch: '軍需', tier: 1, max: 3, cost: [1, 2, 3], name: '預備金', text: '開局金幣 +10／級', icon: 't_gold' },
  { id: 'train', branch: '軍需', tier: 2, max: 3, cost: [2, 3, 4], name: '快速訓練', text: '兵種訓練時間 −10%／級', icon: 't_train' },
  { id: 'veteran', branch: '軍需', tier: 3, max: 2, cost: [3, 5], name: '老兵', text: '新兵出生就帶 2／4 經驗', icon: 't_veteran' },
  { id: 'horn', branch: '軍需', tier: 4, max: 1, cost: [6], name: '集結號角', text: '人口上限 +3', icon: 't_horn' },
  { id: 'walls', branch: '守城', tier: 1, max: 3, cost: [1, 2, 3], name: '堅固城牆', text: '城牆耐久 +10%／級', icon: 't_walls' },
  { id: 'castle', branch: '守城', tier: 2, max: 3, cost: [2, 3, 4], name: '主城石壁', text: '主城耐久 +100／級', icon: 't_castle' },
  { id: 'repair', branch: '守城', tier: 3, max: 2, cost: [3, 5], name: '熟練工匠', text: '工人修復 +25%／級', icon: 't_repair' },
  { id: 'palisade', branch: '守城', tier: 4, max: 1, cost: [6], name: '開局木柵', text: '開局 8 條路口各有一段木柵', icon: 't_palisade' },
  { id: 'bounty', branch: '謀略', tier: 1, max: 3, cost: [1, 2, 3], name: '戰利品', text: '每 50 擊殺 +5 金／級', icon: 't_bounty' },
  { id: 'reroll', branch: '謀略', tier: 2, max: 2, cost: [3, 5], name: '再抽一次', text: '每局重抽 +1／級', icon: 't_reroll' },
  { id: 'ignore', branch: '謀略', tier: 3, max: 1, cost: [5], name: '果斷', text: '每局忽略 +1', icon: 't_ignore' },
  { id: 'lock', branch: '謀略', tier: 4, max: 1, cost: [6], name: '專精', text: '每局鎖定 +1', icon: 't_lock' },
]);
export const TALENT = Object.freeze(Object.fromEntries(TALENTS.map(t => [t.id, t])));

// Achievements: checked after every match against the profile's running stats. Rewards: diamonds and/or unlocks.
export const ACHIEVEMENTS = Object.freeze([
  { id: 'first', name: '初陣', text: '完成任一關（擊倒最後的首領）', test: st => st.clears >= 1, reward: { diamonds: 2 } },
  { id: 'rats', name: '掃蕩者', text: '累計擊殺 500', test: st => st.kills >= 500, reward: { unit: 'spearman' } },
  { id: 'weak3', name: '弱王剋星', text: '擊倒弱王 3 次', test: st => st.weak >= 3, reward: { unit: 'crossbow' } },
  { id: 'flawless', name: '毫髮無傷', text: '主城滿血過關', test: st => st.flawless >= 1, reward: { unit: 'knight' } },
  { id: 'evo2', name: '進化大師', text: '一局內完成 2 次進化', test: st => st.bestEvos >= 2, reward: { diamonds: 3 } },
  { id: 'mage4', name: '法師議會', text: '一局內蓋 4 座法師塔', test: st => st.bestTowers >= 4, reward: { diamonds: 2 } },
  { id: 'ring', name: '鐵桶陣', text: '一局內 24 段城牆全部升到鐵牆', test: st => st.ironRing >= 1, reward: { diamonds: 3 } },
  { id: 'long', name: '長夜將盡', text: '通過 15 分關「永夜雪原」', test: st => (st.cleared ?? []).includes('s15'), reward: { diamonds: 5 } },
]);

export function newProfile() {
  return { v: 1, diamonds: 0, talents: {}, loadout: START_UNITS.slice(), units: START_UNITS.slice(), cleared: [], ach: {},
    stats: { kills: 0, weak: 0, clears: 0, flawless: 0, bestEvos: 0, bestTowers: 0, ironRing: 0, cleared: [] } };
}
const KEY = 'lanternhold.profile.v1';
export function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (p && p.v === 1) {
      const out = { ...newProfile(), ...p, stats: { ...newProfile().stats, ...p.stats } };
      // older saves may hold a unit in the wrong slot: slot n only takes a tier n+1 unit you own
      out.loadout = [0, 1, 2].map(n => (fits(out.loadout?.[n], n) && out.units.includes(out.loadout[n]) ? out.loadout[n] : START_UNITS[n]));
      return out;
    }
  } catch { /* private mode etc. */ }
  return newProfile();
}
export function saveProfile(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* not fatal */ } }

/** Stages unlock in order: a stage opens when the one before it has been cleared. */
export const stageOpen = (p, id) => { const i = STAGE_IDS.indexOf(id); return i <= 0 || p.cleared.includes(STAGE_IDS[i - 1]); };

export const rank = (p, id) => p.talents[id] ?? 0;
export function canBuy(p, id) {
  const t = TALENT[id], r = rank(p, id);
  if (r >= t.max || p.diamonds < t.cost[r]) return false;
  return t.tier === 1 || TALENTS.some(o => o.branch === t.branch && o.tier === t.tier - 1 && rank(p, o.id) > 0);
}
export function buy(p, id) { if (!canBuy(p, id)) return false; p.diamonds -= TALENT[id].cost[rank(p, id)]; p.talents[id] = rank(p, id) + 1; return true; }
export function refund(p) { for (const t of TALENTS) for (let r = 0; r < rank(p, t.id); r++) p.diamonds += t.cost[r]; p.talents = {}; }

/** The plain numbers the sim applies (gdd/08 §3). */
export function modsFrom(p) {
  const r = id => rank(p, id);
  return Object.freeze({
    loadout: [0, 1, 2].map(n => (fits(p.loadout?.[n], n) ? p.loadout[n] : START_UNITS[n])),
    startGold: 10 * r('gold'), trainPct: -10 * r('train'), vetXp: 2 * r('veteran'), pop: 3 * r('horn'),
    wallPct: 10 * r('walls'), castleHp: 100 * r('castle'), repairPct: 25 * r('repair'), palisade: r('palisade') > 0,
    killGold: 5 * r('bounty'), rerolls: r('reroll'), ignores: r('ignore'), locks: r('lock'),
  });
}

/** Fold one finished match into the profile: diamonds, stats, clears, achievements. Returns what changed. */
export function settle(p, sim) {
  const got = { diamonds: sim.diamonds, achievements: [], units: [] };
  p.diamonds += sim.diamonds;
  const st = p.stats;
  st.kills += sim.kills;
  st.weak += sim.bossKills.weak ?? 0;
  st.bestEvos = Math.max(st.bestEvos, Object.values(sim.evo).filter(Boolean).length);
  st.bestTowers = Math.max(st.bestTowers, sim.towersBuilt ?? 0);   // towers built this match, torn down or not
  if (sim.ironRing || sim.walls.every(w => w.lv === 3)) st.ironRing++;
  if (sim.bossDead) {
    st.clears++;
    if (!p.cleared.includes(sim.stage)) p.cleared.push(sim.stage);
    st.cleared = p.cleared.slice();
    if (sim.castle.hp >= sim.castleMax) st.flawless++;
  }
  for (const a of ACHIEVEMENTS) {
    if (p.ach[a.id] || !a.test(st)) continue;
    p.ach[a.id] = true; got.achievements.push(a);
    if (a.reward.diamonds) { p.diamonds += a.reward.diamonds; got.diamonds += a.reward.diamonds; }
    if (a.reward.unit && !p.units.includes(a.reward.unit)) { p.units.push(a.reward.unit); got.units.push(a.reward.unit); }
  }
  return got;
}
