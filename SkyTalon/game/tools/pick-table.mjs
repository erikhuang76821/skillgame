// Does the gear choice matter? (spec §12: a report, not a gate.) The strong strategy's flying with different ways of
// taking gear, on the same questions. If one fixed way wins on every question, the choices have no trade-off.
//   node tools/pick-table.mjs [questions=30]      prints a markdown table
import { hash32, playMatch } from '../src/sim/core/index.js';
import { GAME, RAPID, SPREAD, PIERCE, HEAVY, LASER, WINGMAN, BARRIER, THRUSTERS } from '../src/sim/sim.js';
import { STRATEGIES, pickBy } from './strategies.mjs';

const N = Number(process.argv[2]) || 30;
const seeds = Array.from({ length: N }, (_, i) => hash32(2026, 21, i));   // tuning questions of this table only
const fly = STRATEGIES.expert.policy.input;
export const WAYS = {
  '強策略的優先表': STRATEGIES.expert.policy.pick,
  '一律第一個選項': () => 0,
  '一律第二個選項': () => 1,
  '一律第三個選項': () => 2,
  '火力優先（連射、散射、穿透、重彈）': pickBy([RAPID, SPREAD, PIERCE, HEAVY, LASER, WINGMAN, BARRIER, THRUSTERS]),
  '自動火力優先（雷射、僚機）': pickBy([LASER, WINGMAN, RAPID, SPREAD, BARRIER, PIERCE, HEAVY, THRUSTERS]),
  '存活優先（護盾、推進器）': pickBy([BARRIER, THRUSTERS, RAPID, LASER, SPREAD, WINGMAN, PIERCE, HEAVY]),
};

const names = Object.keys(WAYS);
const runs = names.map(n => seeds.map(seed => { const r = playMatch(GAME, seed, { input: fly, pick: WAYS[n] }); return { score: r.result().score, alive: r.sim.shields > 0, bosses: r.sim.bossKills }; }));
const best = seeds.map((_, i) => Math.max(...runs.map(r => r[i].score)));
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
console.log(`| 選法 | 平均分 | 最低 | 最高 | 活到最後 | 平均擊破頭目 | 在幾題是最高分（共 ${N} 題） |\n|---|---|---|---|---|---|---|`);
names.forEach((n, k) => { const sc = runs[k].map(r => r.score); console.log(`| ${n} | ${Math.round(mean(sc))} | ${Math.min(...sc)} | ${Math.max(...sc)} | ${Math.round(100 * mean(runs[k].map(r => +r.alive)))}% | ${mean(runs[k].map(r => r.bosses)).toFixed(1)} | ${sc.filter((v, i) => v === best[i]).length} |`); });
