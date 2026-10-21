// Skill-vs-chance evidence (gdd/03): N seeds x 3 skill tiers.
// Reports score by tier, same-seed head-to-head win rates, and how much of the score variance
// is explained by skill tier vs. by the seed.  Usage: node tools/skill-dominance.mjs [seeds]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { playMatch } from './bots.mjs';
import { score, scoreBreakdown, TPS } from '../src/sim/sim.js';
import { hash32 } from '../src/sim/rng.js';

const N = Number(process.argv[2]) || 30;
const TIERS = ['novice', 'intermediate', 'expert'];
const seeds = Array.from({ length: N }, (_, i) => hash32(2026, 7, i));

const t0 = performance.now();
const rows = seeds.map(seed => {
  const r = { seed };
  for (const t of TIERS) {
    const sim = playMatch(seed, t).sim;
    r[t] = { score: score(sim), secs: Math.floor(sim.tick / TPS), survived: sim.survived, grazes: sim.grazes, ...scoreBreakdown(sim) };
  }
  return r;
});
const ms = performance.now() - t0;

const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
const stats = Object.fromEntries(TIERS.map(t => {
  const sc = rows.map(r => r[t].score);
  return [t, {
    mean: Math.round(mean(sc)), sd: Math.round(sd(sc)), min: Math.min(...sc), max: Math.max(...sc),
    survivalRate: mean(rows.map(r => (r[t].survived ? 1 : 0))), meanSecs: Math.round(mean(rows.map(r => r[t].secs))),
    meanGrazes: Math.round(mean(rows.map(r => r[t].grazes))),
  }];
}));
const winRate = (a, b) => mean(rows.map(r => (r[a].score > r[b].score ? 1 : r[a].score === r[b].score ? 0.5 : 0)));
const h2h = {
  'expert vs intermediate': winRate('expert', 'intermediate'),
  'intermediate vs novice': winRate('intermediate', 'novice'),
  'expert vs novice': winRate('expert', 'novice'),
};

// Two-way decomposition (one observation per tier x seed cell).
const all = rows.flatMap(r => TIERS.map(t => r[t].score));
const g = mean(all);
const ssTotal = all.reduce((s, v) => s + (v - g) ** 2, 0);
const ssTier = TIERS.reduce((s, t) => s + N * (mean(rows.map(r => r[t].score)) - g) ** 2, 0);
const ssSeed = rows.reduce((s, r) => s + TIERS.length * (mean(TIERS.map(t => r[t].score)) - g) ** 2, 0);
const shares = { skillTier: ssTier / ssTotal, seed: ssSeed / ssTotal, interaction: 1 - (ssTier + ssSeed) / ssTotal };

const pct = v => `${(v * 100).toFixed(1)}%`;
const md = [
  '# Skill Dominance Report（自動產生）',
  '',
  `- 產生：\`node tools/skill-dominance.mjs ${N}\`；${N} 個種子 × 3 個技巧等級 bot；模擬耗時 ${(ms / 1000).toFixed(1)} s`,
  '- Bot 只送出與真人相同的輸入（8 向 + Dash + Howl + 選卡），由確定性模擬判分',
  '',
  '## 各等級分數',
  '',
  '| 等級 | 平均 | 標準差 | 最低 | 最高 | 撐滿 180s 比例 | 平均存活秒 | 平均 Perfect Dodge |',
  '|---|---|---|---|---|---|---|---|',
  ...TIERS.map(t => { const s = stats[t]; return `| ${t} | ${s.mean} | ${s.sd} | ${s.min} | ${s.max} | ${pct(s.survivalRate)} | ${s.meanSecs} | ${s.meanGrazes} |`; }),
  '',
  '## 同種子對戰勝率（Duel 的實際判勝方式）',
  '',
  '| 對戰 | 前者勝率 |',
  '|---|---|',
  ...Object.entries(h2h).map(([k, v]) => `| ${k} | ${pct(v)} |`),
  '',
  '## 分數變異來源',
  '',
  '| 來源 | 佔總變異 |',
  '|---|---|',
  `| 技巧等級 | ${pct(shares.skillTier)} |`,
  `| 種子（題目難度） | ${pct(shares.seed)} |`,
  `| 交互/殘差 | ${pct(shares.interaction)} |`,
  '',
  '> Duel / Tournament 中所有對手共用同一種子，所以「種子」那一欄在判勝時被完全抵銷；它只影響跨種子的排行榜（例如不同日的 Daily Seed），因此跨日排行以「當日百分位」而非原始分數比較。',
  '',
].join('\n');

const out = fileURLToPath(new URL('../../docs/skill_dominance_report.md', import.meta.url));
writeFileSync(out, md, 'utf8');
console.log(md);
console.log(JSON.stringify({ stats, h2h, shares }, null, 1));
