// Skill-vs-chance evidence for any GameDef: N seeds x skill-tier bots on the same seeds.
// Reports score by tier, same-seed head-to-head win rates, and a two-way variance decomposition
// (skill tier vs seed vs interaction). Game-agnostic: the game supplies GAME + BOTS.
import { hash32, playMatch, TPS } from '../../src/sim/core/index.js';

export const THRESHOLDS = Object.freeze({ skillShare: 0.7, topWinRate: 0.7 });

const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };

/**
 * @param game  GameDef (src/sim/sim.js GAME); optional game.scoreBreakdown(sim) adds columns
 * @param bots  { tierName: policy } ordered weakest -> strongest
 * @param n     number of seeds
 */
export function runDominance(game, bots, n = 30, seedBase = 2026) {
  const tiers = Object.keys(bots);
  const seeds = Array.from({ length: n }, (_, i) => hash32(seedBase, 7, i));
  const t0 = performance.now();
  const rows = seeds.map(seed => {
    const r = { seed };
    for (const t of tiers) {
      const rec = playMatch(game, seed, bots[t]);
      r[t] = { score: game.score(rec.sim), secs: Math.floor(rec.ticks / TPS), ...(game.scoreBreakdown?.(rec.sim) ?? {}) };
    }
    return r;
  });
  const ms = performance.now() - t0;

  const extraKeys = Object.keys(rows[0][tiers[0]]).filter(k => k !== 'score');
  const stats = Object.fromEntries(tiers.map(t => {
    const sc = rows.map(r => r[t].score);
    const extra = Object.fromEntries(extraKeys.map(k => [k, Math.round(mean(rows.map(r => Number(r[t][k]) || 0)) * 10) / 10]));
    return [t, { mean: Math.round(mean(sc)), sd: Math.round(sd(sc)), min: Math.min(...sc), max: Math.max(...sc), ...extra }];
  }));

  const winRate = (a, b) => mean(rows.map(r => (r[a].score > r[b].score ? 1 : r[a].score === r[b].score ? 0.5 : 0)));
  const h2h = {};
  for (let i = tiers.length - 1; i > 0; i--) for (let j = i - 1; j >= 0; j--) h2h[`${tiers[i]} vs ${tiers[j]}`] = winRate(tiers[i], tiers[j]);

  const all = rows.flatMap(r => tiers.map(t => r[t].score));
  const g = mean(all);
  const ssTotal = all.reduce((s, v) => s + (v - g) ** 2, 0) || 1;
  const ssTier = tiers.reduce((s, t) => s + n * (mean(rows.map(r => r[t].score)) - g) ** 2, 0);
  const ssSeed = rows.reduce((s, r) => s + tiers.length * (mean(tiers.map(t => r[t].score)) - g) ** 2, 0);
  const shares = { skillTier: ssTier / ssTotal, seed: ssSeed / ssTotal, interaction: 1 - (ssTier + ssSeed) / ssTotal };

  const top = h2h[`${tiers.at(-1)} vs ${tiers.at(-2)}`];
  const pass = shares.skillTier >= THRESHOLDS.skillShare && top >= THRESHOLDS.topWinRate;
  return { game: game.id, version: game.version, n, tiers, ms, stats, h2h, shares, top, pass };
}

export function toMarkdown(r, command) {
  const pct = v => `${(v * 100).toFixed(1)}%`;
  const cols = Object.keys(r.stats[r.tiers[0]]);
  return [
    `# Skill Dominance Report — ${r.game} v${r.version}（自動產生）`,
    '',
    `- 產生：\`${command}\`；${r.n} 個種子 × ${r.tiers.length} 個技巧等級 bot；耗時 ${(r.ms / 1000).toFixed(1)} s`,
    '- Bot 只送出與真人相同的輸入，由確定性模擬判分',
    `- 門檻：技巧佔比 ≥ ${pct(THRESHOLDS.skillShare)}、最強 vs 次強同種子勝率 ≥ ${pct(THRESHOLDS.topWinRate)} → **${r.pass ? '通過' : '未通過'}**`,
    '',
    '## 各等級分數',
    '',
    `| 等級 | ${cols.join(' | ')} |`,
    `|---|${cols.map(() => '---').join('|')}|`,
    ...r.tiers.map(t => `| ${t} | ${cols.map(c => r.stats[t][c]).join(' | ')} |`),
    '',
    '## 同種子對戰勝率',
    '',
    '| 對戰 | 前者勝率 |',
    '|---|---|',
    ...Object.entries(r.h2h).map(([k, v]) => `| ${k} | ${pct(v)} |`),
    '',
    '## 分數變異來源',
    '',
    '| 來源 | 佔總變異 |',
    '|---|---|',
    `| 技巧等級 | ${pct(r.shares.skillTier)} |`,
    `| 種子（題目難度） | ${pct(r.shares.seed)} |`,
    `| 交互 / 殘差 | ${pct(r.shares.interaction)} |`,
    '',
    '> 同種子對戰時「種子」一欄被完全抵銷；它只影響跨種子排行（Daily Seed），跨日排行請用當日百分位。',
    '',
  ].join('\n');
}
