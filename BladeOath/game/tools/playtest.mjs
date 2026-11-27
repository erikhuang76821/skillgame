// Whole-game automated playtest for BladeOath (knowledge-base/16 D2–D6): the scripted curve with the human-factor bots.
//   units, targets and hit rate: tools/units.mjs (shared with the human playtest report)
//   DI        = Σ over the unit's enemies of (health / 30) × (mean glow weight: white 1, gold 1.5, red 2), averaged over seeds
// Elite and boss fights are one target each: they are reported as their own sections, not main sections (like SkyTalon).
// Usage: node tools/playtest.mjs [seeds=30] [--out ../docs/playtest_report.md]   (exit 1 if a check fails)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { hash32, TPS } from '../src/sim/core/index.js';
import { GAME, FOES, layout } from '../src/sim/sim.js';
import { SECTIONS, UNITS, profileMatch } from './units.mjs';
import { HUMANS } from './humanBots.mjs';
import { curveChecks, checksTable, mean, pct } from './lib/curve.mjs';

const args = process.argv.slice(2);
const N = Number(args.find(a => /^\d+$/.test(a))) || 30;
const outIdx = args.indexOf('--out');
const seeds = Array.from({ length: N }, (_, i) => hash32(2026, 9, i));

const GLOW_W = [1, 1.5, 2];
const threat = type => (FOES[type].hp / 30) * mean(FOES[type].pool.map(m => GLOW_W[m.glow]));
const run = (seed, bot) => profileMatch(seed, sim => bot.input(sim), sim => bot.pick(sim));

// ---------- measure ----------
const units = UNITS.map((u, k) => ({ ...u, k, name: `#${k + 1}`, di: mean(seeds.map(s => { const plan = layout(s); return u.slots.reduce((a, sl) => a + threat(plan[sl].type), 0); })), hit: {}, at: [] }));
const runs = {};
for (const [name, bot] of Object.entries(HUMANS)) {
  runs[name] = seeds.map(s => run(s, bot));
  units.forEach((u, k) => {
    const rates = runs[name].map(r => { const sw = r.swings.filter(x => x.unit === k); return sw.length ? sw.filter(x => !x.fail).length / sw.length : NaN; });
    u.hit[name] = mean(rates);
    if (name === 'regular') u.at = runs[name].map(r => r.first.get(k)).filter(Number.isFinite);
  });
}
// t = when the regular player first meets the unit (seconds, mean over runs that got there); unreached units keep order
units.forEach((u, k) => { u.t = u.at.length ? mean(u.at) / TPS : NaN; });
units.forEach((u, k) => { if (!Number.isFinite(u.t)) u.t = (k ? units[k - 1].t : 0) + 30; });
const curve = curveChecks(units, SECTIONS);
const checks = [
  ...curve.checks,
  { name: '拍格與樂句長度（RULE-CURVE-BEATGRID / PHRASE，節奏類才檢查）', ok: null, detail: '動作對決沒有小節' },
];

// ---------- targets (reported, not gates; knowledge-base/16 §4) ----------
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
const sec = t => `${Math.round(t / TPS)} s`;
const summary = Object.entries(runs).map(([name, rs]) => {
  const downs = rs.map(r => (r.down >= 0 ? r.down : r.ticks));
  return `| ${name} | ${pct(mean(rs.map(r => (r.cleared ? 1 : 0))))} | ${sec(med(rs.map(r => r.ticks)))} | ${sec(med(downs))} | ${mean(rs.map(r => r.deaths)).toFixed(1)} | ${Math.round(mean(rs.map(r => r.score)))} |`;
});

const md = [
  `# Playtest Report — ${GAME.id} v${GAME.version}（自動產生）`,
  '',
  `- 產生：\`node tools/playtest.mjs ${N}\`；${N} 個種子；sim v${GAME.version}；單位 = 一場遭遇（2–3 個配置點），依路線順序`,
  '- 命中率 = 威脅到玩家的敵招中，玩家沒有被打實的比例（卸勁、格擋、閃避、走出範圍都算）；DI = Σ 敵人（氣血 / 30）×（光色權重平均：白 1、金 1.5、赤 2）',
  '- 人性化試玩：tools/humanBots.mjs（新手 / 一般 / 熟手：反應、時機誤差、光色誤讀與學習）',
  '',
  '## 檢查',
  '',
  checksTable(checks),
  '',
  '## 整局（目標：一般玩家打完、局長 4–6 分鐘；新手第一次倒下落在全長的 55–80%）',
  '',
  '| 玩家 | 打倒終頭目 | 局長中位數 | 第一次倒下中位數 | 平均倒下 | 平均分數 |',
  '|---|---|---|---|---|---|',
  ...summary,
  '',
  '## 段落',
  '',
  '| 段落 | 主段落 | DI 平均 / 高峰 | 命中率 新手 · 一般 · 熟手 |',
  '|---|---|---|---|',
  ...curve.sec.map(s => `| ${s.name} | ${s.main ? '✓' : ''} | ${s.di.toFixed(2)} / ${s.peak.toFixed(2)} | ${pct(s.hit.casual)} · ${pct(s.hit.regular)} · ${pct(s.hit.skilled)} |`),
  '',
  '## 單位',
  '',
  '| 單位 | 段落 | 一般玩家抵達 | DI | 命中率 新手 · 一般 · 熟手 |',
  '|---|---|---|---|---|',
  ...units.map(u => `| ${u.name} | ${SECTIONS[u.section].name} | ${u.t.toFixed(0)} s | ${u.di.toFixed(2)} | ${pct(u.hit.casual)} · ${pct(u.hit.regular)} · ${pct(u.hit.skilled)} |`),
  '',
  `曲線擬合（主段落）：DI ≈ ${curve.fit.icpt.toFixed(2)} + ${curve.fit.slope.toFixed(3)} × 秒，R² ${curve.fit.r2.toFixed(2)}，Spearman ρ ${curve.fit.rho.toFixed(2)}。`,
  '',
].join('\n');

if (outIdx >= 0) { mkdirSync(dirname(args[outIdx + 1]), { recursive: true }); writeFileSync(args[outIdx + 1], md, 'utf8'); }
console.log(md);
process.exitCode = checks.every(c => c.ok !== false) ? 0 : 1;
