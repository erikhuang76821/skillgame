// Leg two's automated playtest (knowledge-base/16 D2–D6): its scripted difficulty curve, unit by unit, with the same
// human-factor bots and the same curve checks as leg one (tools/playtest.mjs). A report of its own, so that leg
// one's stays what the audit reads.
//   target = a machine that enters during the unit
//   DI     = firing time the unit's machines ask for + how much they threaten + up to 1 for the place's obstacles
// Usage: node tools/playtest2.mjs [seeds=30] [--out ../docs/playtest_report_leg2.md]   (exit 1 if a check fails)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { hash32, TPS } from '../src/sim/core/index.js';
import { SCRIPT, KIND, FIRE_PERIOD, BOSS_SLOTS, UNIT_TICKS, GUNNER, WEAVER, SPLITTER, DIVER, LANCER, MINER, SEEKER, BULWARK, BEAMER, obstacles } from '../src/sim/sim.js';
import { GAME2, schedule, ORBITER, SHUTTER, TWINVEC, RAMMER, L2_MIDS, L2_BOSSES } from '../src/sim/leg2.js';
import { HUMANS } from './humanBots.mjs';
import { UNIT_S, UNITS, sectionOfUnit as sectionOf, profileMatch } from './units.mjs';
import { curveChecks, checksTable, mean, pct } from './lib/curve.mjs';
import { counts2, sectionName2 } from './leg2-units.mjs';

const args = process.argv.slice(2);
const N = Number(args.find(a => /^\d+$/.test(a))) || 30;
const outIdx = args.indexOf('--out');
const seeds = Array.from({ length: N }, (_, i) => hash32(2026, 9, i));

// ---------- units ----------
const DPS = (2 * TPS) / FIRE_PERIOD;
// how much one of each threatens: leg one's numbers for leg one's machines; an orbit guard is one of four, a rammer one of three
export const PRESSURE2 = { [GUNNER]: 0.5, [WEAVER]: 0.5, [SPLITTER]: 0.5, [DIVER]: 1, [LANCER]: 1, [MINER]: 1, [SEEKER]: 1, [BULWARK]: 1.5, [BEAMER]: 1.5, [ORBITER]: 0.4, [SHUTTER]: 1, [TWINVEC]: 1.2, [RAMMER]: 0.8 };
const counts = counts2;
const plans = seeds.map(seed => ({ plan: schedule(seed).filter(counts), rocks: obstacles(seed) }));
const bossOf = slot => (slot % 2 === 0 ? L2_MIDS : L2_BOSSES)[slot >> 1];
const di = k => {
  const sec = SCRIPT[sectionOf(k)];
  if (sec.boss) { const b = BOSS_SLOTS[sec.slot], t = bossOf(sec.slot); return KIND[t].hp / (b.end - b.from) / (UNIT_S * DPS) * 4 + 2; }
  if (sec.boost) return 0;
  const from = k * UNIT_TICKS, to = from + UNIT_TICKS, inUnit = a => a.at >= from && a.at < to;
  const per = plans.map(({ plan, rocks }) => {
    const mine = plan.filter(inUnit);
    const fire = mine.reduce((s, p) => s + p.hp + (p.sh | 0), 0) / (UNIT_S * DPS) * 4, threat = mine.reduce((s, p) => s + (PRESSURE2[p.type] || 0), 0);
    const hazard = Math.min(1, rocks.filter(inUnit).length / 4);
    return fire + threat + hazard;
  });
  return mean(per);
};
const units = Array.from({ length: UNITS }, (_, k) => ({ name: `${k * UNIT_S}–${(k + 1) * UNIT_S} s`, t: k * UNIT_S, section: sectionOf(k), di: di(k), hit: {} }));

const run = (seed, bot) => profileMatch(seed, sim => bot.input(sim), sim => bot.pick(sim), GAME2.createSim, counts);
const people = Object.keys(HUMANS), summary = {};
for (const name of people) {
  const hit = units.map(() => []), runs = seeds.map(seed => run(seed, HUMANS[name]));
  for (const r of runs) units.forEach((u, k) => { if (r.reached[k] && r.spawned[k]) hit[k].push(r.killed[k] / r.spawned[k]); });
  units.forEach((u, k) => { u.hit[name] = mean(hit[k]); });
  summary[name] = {
    survived: mean(runs.map(r => +r.survived)), boss: mean(runs.map(r => +r.bossDown)), hits: mean(runs.map(r => r.hits)), score: mean(runs.map(r => r.score)),
    bossKills: mean(runs.map(r => r.bossKills)), secs: mean(runs.map(r => r.ticks / TPS)), pickups: mean(runs.map(r => r.pickups)),
    ch2: mean(runs.map(r => +(r.chapter >= 1))), ch3: mean(runs.map(r => +(r.chapter >= 2))), ch4: mean(runs.map(r => +(r.chapter >= 3))),
  };
}

// ---------- checks ----------
const sections = SCRIPT.map(s => ({ name: sectionName2(s), main: !s.safe && !s.boss && !s.boost }));
const curve = curveChecks(units, sections);
const checks = [...curve.checks, { name: '拍格與樂句長度（RULE-CURVE-BEATGRID / PHRASE，節奏類才檢查）', ok: null, detail: '本作不是節奏類' }];

const three = h => people.map(p => pct(h[p])).join(' · ');
const md = [
  `# Playtest Report — ${GAME2.id}（自動產生）`,
  '',
  `- 產生：\`node tools/playtest2.mjs ${N}\`；${N} 個種子；航段二 v${GAME2.version}；單位 = ${UNIT_S} 秒`,
  '- 命中率 = 該單位進場的敵機被擊破的比例（只計單位開始時還活著的那幾局）',
  '- DI = 擊破該單位敵機所需的對位開火時間佔比 × 4 + 威脅（航段一的權重；月塵護衛機 0.4、自爆艇 0.8、鏡面砲艇 1、雙極追擊機 1.2）+ 山峰與隕石依數量最多 1',
  '',
  '## 檢查',
  '',
  checksTable(checks),
  '',
  '## 段落',
  '',
  '| 段落 | 主段落 | DI 平均 / 高峰 | 命中率 新手 · 一般 · 熟手 |',
  '|---|---|---|---|',
  ...curve.sec.map(s => `| ${s.name} | ${s.main ? '✓' : ''} | ${s.di.toFixed(2)} / ${s.peak.toFixed(2)} | ${three(s.hit)} |`),
  '',
  '## 整局',
  '',
  '| 玩家 | 活到最後 | 進到第二章 | 進到第三章 | 進到第四章 | 頭目全破 | 平均擊破頭目數 | 平均局長（秒） | 平均被打中 | 平均拾取 | 平均分數 |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...people.map(p => { const s = summary[p]; return `| ${p} | ${pct(s.survived)} | ${pct(s.ch2)} | ${pct(s.ch3)} | ${pct(s.ch4)} | ${pct(s.boss)} | ${s.bossKills.toFixed(1)} | ${s.secs.toFixed(0)} | ${s.hits.toFixed(1)} | ${s.pickups.toFixed(1)} | ${s.score.toFixed(0)} |`; }),
  '',
  '## 單位',
  '',
  '| 時間 | 段落 | DI | 命中率 新手 · 一般 · 熟手 |',
  '|---|---|---|---|',
  ...units.map(u => `| ${u.name} | ${sections[u.section].name} | ${u.di.toFixed(2)} | ${three(u.hit)} |`),
  '',
  `曲線擬合（主段落）：DI ≈ ${curve.fit.icpt.toFixed(2)} + ${curve.fit.slope.toFixed(3)} × 秒，R² ${curve.fit.r2.toFixed(2)}，Spearman ρ ${curve.fit.rho.toFixed(2)}。`,
  '',
].join('\n');

if (outIdx >= 0) { mkdirSync(dirname(args[outIdx + 1]), { recursive: true }); writeFileSync(args[outIdx + 1], md, 'utf8'); }
console.log(md);
process.exitCode = checks.every(c => c.ok !== false) ? 0 : 1;
