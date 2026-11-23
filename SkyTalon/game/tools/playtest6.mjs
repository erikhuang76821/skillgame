// Leg six's automated playtest (knowledge-base/16 D2–D6): its scripted difficulty curve, unit by unit, with the same
// human-factor bots and the same curve checks as leg one (tools/playtest.mjs). A report of its own, so that leg
// one's stays what the audit reads.
//   target = a creature that enters during the unit and can hurt (a coelophysis pack is a bonus: it does not count)
//   DI     = firing time the unit's creatures ask for + how much they threaten + 1 while the place's hazard is on
// Usage: node tools/playtest6.mjs [seeds=30] [--out ../docs/playtest_report_leg6.md]   (exit 1 if a check fails)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { hash32, TPS } from '../src/sim/core/index.js';
import { SCRIPT, KIND, FIRE_PERIOD, BOSS_SLOTS, UNIT_TICKS } from '../src/sim/sim.js';
import { GAME6, schedule, bombs, obstacles, sweepSpan, windAt, EUDI, COELO, STEGO, ORNI, PTERA, ELASMO, TRIKE, ANKY, HERRERA, PETEINO, DILOPHO, RHAM, ARCHELON, ICHTHY, DROMAEO, PACHY, L6_MIDS, L6_BOSSES, L6_CLOSED_PCT } from '../src/sim/leg6.js';
import { HUMANS } from './humanBots.mjs';
import { UNIT_S, UNITS, sectionOfUnit as sectionOf, profileMatch } from './units.mjs';
import { curveChecks, checksTable, mean, pct } from './lib/curve.mjs';
import { counts6, sectionName6 } from './leg6-units.mjs';

const args = process.argv.slice(2);
const N = Number(args.find(a => /^\d+$/.test(a))) || 30;
const outIdx = args.indexOf('--out');
const seeds = Array.from({ length: N }, (_, i) => hash32(2026, 9, i));

// ---------- units ----------
const DPS = (2 * TPS) / FIRE_PERIOD;
// how much one of each threatens: a flight's eudimorphodon is one of five to seven; the big ones count for more
export const PRESSURE6 = { [EUDI]: 0.2, [STEGO]: 0.5, [ORNI]: 1, [PTERA]: 1, [ELASMO]: 1, [TRIKE]: 1.5, [ANKY]: 1.5, [HERRERA]: 0.5, [PETEINO]: 0.4, [DILOPHO]: 1, [RHAM]: 0.7, [ARCHELON]: 1.5, [ICHTHY]: 0.3, [DROMAEO]: 0.4, [PACHY]: 1.5 };
const counts = counts6;
const plans = seeds.map(seed => ({ plan: schedule(seed).filter(counts), bombs: bombs(seed), rocks: obstacles(seed) }));
const bossOf = slot => (slot % 2 === 0 ? L6_MIDS : L6_BOSSES)[slot >> 1];
const di = k => {
  const sec = SCRIPT[sectionOf(k)];
  if (sec.boss) { const b = BOSS_SLOTS[sec.slot], t = bossOf(sec.slot), closed = sec.slot % 2 ? 100 / (35 + 65 * L6_CLOSED_PCT / 100) : 1; return (KIND[t].hp * closed) / (b.end - b.from) / (UNIT_S * DPS) * 4 + 2; }   // a boss's health counts for what its closed weak point makes of it
  if (sec.boost) return 0;
  const from = k * UNIT_TICKS, to = from + UNIT_TICKS, inUnit = a => a.at >= from && a.at < to;
  const per = plans.map(({ plan, bombs: bs, rocks }) => {
    const mine = plan.filter(inUnit);
    const fire = mine.reduce((s, p) => s + p.hp + (p.sh | 0), 0) / (UNIT_S * DPS) * 4, threat = mine.reduce((s, p) => s + (PRESSURE6[p.type] || 0), 0);
    const hazard = (bs.some(inUnit) ? 1 : 0) + (sweepSpan(from + 60) ? 1 : 0) + (windAt(from + 120) ? 1 : 0) + Math.min(1, rocks.filter(inUnit).length / 4);
    return fire + threat + hazard;
  });
  return mean(per);
};
const units = Array.from({ length: UNITS }, (_, k) => ({ name: `${k * UNIT_S}–${(k + 1) * UNIT_S} s`, t: k * UNIT_S, section: sectionOf(k), di: di(k), hit: {} }));

const run = (seed, bot) => profileMatch(seed, sim => bot.input(sim), sim => bot.pick(sim), GAME6.createSim, counts);
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
const sections = SCRIPT.map(s => ({ name: sectionName6(s), main: !s.safe && !s.boss && !s.boost }));
const curve = curveChecks(units, sections);
const checks = [...curve.checks, { name: '拍格與樂句長度（RULE-CURVE-BEATGRID / PHRASE，節奏類才檢查）', ok: null, detail: '本作不是節奏類' }];

const three = h => people.map(p => pct(h[p])).join(' · ');
const md = [
  `# Playtest Report — ${GAME6.id}（自動產生）`,
  '',
  `- 產生：\`node tools/playtest6.mjs ${N}\`；${N} 個種子；航段六 v${GAME6.version}；單位 = ${UNIT_S} 秒`,
  '- 命中率 = 該單位進場的生物被擊破的比例（只計單位開始時還活著的那幾局）；腔骨龍群是加分用的、嗜鳥龍是從側邊撲出來的伏擊，都不算目標',
  '- DI = 擊破該單位生物所需的對位開火時間佔比 × 4 + 威脅（真雙型齒翼龍 0.2、魚鳥 0.3、派克鳥龍與馳龍 0.4、劍龍與艾雷拉龍 0.5、喙嘴翼龍 0.7、嗜鳥龍／無齒翼龍／薄板龍／雙脊龍 1、三角龍／甲龍／古巨龜／厚頭龍 1.5）+ 場景機制進行中 1（火山彈、尾掃、側風各 1，巨木與隕石依數量最多 1）',
  '- 頭目單位的 DI 把弱點閉合時只有 15% 傷害算進去（假設 35% 的時間展開）',
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
