// Whole-game automated playtest (knowledge-base/16 D2–D6): the scripted difficulty curve with the human-factor bots,
// unit by unit. Skill evidence is a separate report (tools/skill-evidence.mjs).
//   unit      = 4 seconds (UNIT_TICKS), the same grid the script (WAVES) is written on
//   target    = an enemy that enters during the unit; hit = it was shot down before it left
//   hit rate  = share of the unit's enemies shot down, over the runs that were still alive when the unit began
//   DI        = firing time the unit asks for + how much it shoots back (see di() below)
// Boss and mid-boss sections have one target and boost sections none, so they are not main sections.
// Usage: node tools/playtest.mjs [seeds=30] [--out ../docs/playtest_report.md]   (exit 1 if a check fails)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { hash32, TPS } from '../src/sim/core/index.js';
import { GAME, SCRIPT, WAVES, WAVE_TYPES, KIND, FIRE_PERIOD, GUNNER, WEAVER, DIVER, LANCER, MINER, BULWARK, SPLITTER, SEEKER, BEAMER, BOSS_SLOTS, SECTION_HP, SECTION_SHELL, PEAK_CHANCE, METEOR_CHANCE } from '../src/sim/sim.js';
import { HUMANS } from './humanBots.mjs';
import { UNIT_S, UNITS, sectionOfUnit as sectionOf, profileMatch } from './units.mjs';
import { curveChecks, checksTable, mean, pct } from './lib/curve.mjs';

const args = process.argv.slice(2);
const N = Number(args.find(a => /^\d+$/.test(a))) || 30;
const outIdx = args.indexOf('--out');
const seeds = Array.from({ length: N }, (_, i) => hash32(2026, 9, i));

// ---------- units ----------
// DI: seconds of on-target fire the unit's enemies need, as a share of the unit, plus the pressure of what shoots or
// rams (a gunner, weaver or splitter = half a point; a diver, lancer, miner or seeker = one; a bulwark or beamer = one and a half).
// The boss units take that boss's health spread over its window.
const DPS = (2 * TPS) / FIRE_PERIOD;
const PRESSURE = { [GUNNER]: 0.5, [WEAVER]: 0.5, [SPLITTER]: 0.5, [DIVER]: 1, [LANCER]: 1, [MINER]: 1, [SEEKER]: 1, [BULWARK]: 1.5, [BEAMER]: 1.5 };
const di = k => {
  const sec = SCRIPT[sectionOf(k)], c = sec.chapter;
  if (sec.boss) { const b = BOSS_SLOTS[sec.slot]; return KIND[b.type].hp / (b.end - b.from) / (UNIT_S * DPS) * 4 + 2; }
  if (sec.boost) return 0;                                  // nothing enters during a boost
  const w = WAVES[k];
  const hp = w.reduce((s, n, i) => s + n * (KIND[WAVE_TYPES[i]].hp + SECTION_HP[sectionOf(k)] + SECTION_SHELL[sectionOf(k)]), 0);   // a shell layer costs a base shot, like a point of health   // base firepower: cards are the player's answer
  const rocks = c === 2 ? PEAK_CHANCE / 100 : c === 3 ? METEOR_CHANCE / 100 : 0;   // an obstacle is one point; a unit has this share of one
  return (hp / (UNIT_S * DPS)) * 4 + w.reduce((s, n, i) => s + n * (PRESSURE[WAVE_TYPES[i]] || 0), 0) + rocks;
};
const units = Array.from({ length: UNITS }, (_, k) => ({ name: `${k * UNIT_S}–${(k + 1) * UNIT_S} s`, t: k * UNIT_S, section: sectionOf(k), di: di(k), hit: {} }));

/** Play one run with a bot; the profile is cut into units by tools/units.mjs (shared with the human report). */
const run = (seed, bot) => profileMatch(seed, sim => bot.input(sim), sim => bot.pick(sim));

const people = Object.keys(HUMANS), summary = {};
for (const name of people) {
  const hit = units.map(() => []), runs = seeds.map(seed => run(seed, HUMANS[name]));
  for (const r of runs) units.forEach((u, k) => { if (r.reached[k] && r.spawned[k]) hit[k].push(r.killed[k] / r.spawned[k]); });
  units.forEach((u, k) => { u.hit[name] = mean(hit[k]); });
  summary[name] = {
    survived: mean(runs.map(r => +r.survived)), boss: mean(runs.map(r => +r.bossDown)), hits: mean(runs.map(r => r.hits)),
    score: mean(runs.map(r => r.score)), bossTime: mean(runs.filter(r => r.bossDown).map(r => r.ticks / TPS)),
    bossKills: mean(runs.map(r => r.bossKills)), secs: mean(runs.map(r => r.ticks / TPS)), pickups: mean(runs.map(r => r.pickups)),
    ch2: mean(runs.map(r => +(r.chapter >= 1))), ch3: mean(runs.map(r => +(r.chapter >= 2))), ch4: mean(runs.map(r => +(r.chapter >= 3))),
  };
}

// ---------- checks ----------
const sections = SCRIPT.map(s => ({ name: s.name, main: !s.safe && !s.boss && !s.boost }));
const curve = curveChecks(units, sections);
const checks = [
  ...curve.checks,
  { name: '拍格與樂句長度（RULE-CURVE-BEATGRID / PHRASE，節奏類才檢查）', ok: null, detail: '本作不是節奏類' },
];

const three = h => people.map(p => pct(h[p])).join(' · ');
const md = [
  `# Playtest Report — ${GAME.id}（自動產生）`,
  '',
  `- 產生：\`node tools/playtest.mjs ${N}\`；${N} 個種子；sim v${GAME.version}；單位 = ${UNIT_S} 秒`,
  '- 命中率 = 該單位進場的敵機被擊破的比例（只計單位開始時還活著的那幾局）',
  '- DI = 擊破該單位敵機所需的對位開火時間佔比 × 4 + 0.5 ×（砲艇 + 蛇行機 + 分裂機）+ 1 ×（俯衝機 + 狙擊機 + 佈雷機 + 追獵體）+ 1.5 ×（彈牆艦 + 光柱體）+ 障礙物的出現比例；人性化試玩：tools/humanBots.mjs（新手 / 一般 / 熟手）',
  '- 單位是腳本時鐘上的單位：頭目早倒時剩下的頭目單位會被跳過',
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
  ...units.map(u => `| ${u.name} | ${SCRIPT[u.section].name} | ${u.di.toFixed(2)} | ${three(u.hit)} |`),
  '',
  `曲線擬合（主段落）：DI ≈ ${curve.fit.icpt.toFixed(2)} + ${curve.fit.slope.toFixed(3)} × 秒，R² ${curve.fit.r2.toFixed(2)}，Spearman ρ ${curve.fit.rho.toFixed(2)}。`,
  '',
].join('\n');

if (outIdx >= 0) { mkdirSync(dirname(args[outIdx + 1]), { recursive: true }); writeFileSync(args[outIdx + 1], md, 'utf8'); }
console.log(md);
process.exitCode = checks.every(c => c.ok !== false) ? 0 : 1;
