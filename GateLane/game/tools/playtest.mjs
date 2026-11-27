// Whole-game automated playtest (knowledge-base/16): difficulty curve unit by unit, checked against D1–D8.
// Plays every seed with the skill-tier bots (fairness, D1) and the human-factor bots (feel, D5–D6), fits the
// difficulty curve of the main segments (D2–D4). D7 (beat grid) and D8 (phrase length) are for rhythm games only.
// Usage: node tools/playtest.mjs [seeds=30] [--out ../docs/playtest_report]   -> .md + .html; exit 1 if a check fails
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hash32, TPS } from '../src/sim/core/index.js';
import { GAME, createSim, step, phase, CURVE, RULES, BOSS_STOP } from '../src/sim/sim.js';
import { HUMANS } from './humanBots.mjs';
import { BOTS } from './bots.mjs';
import { runDominance, THRESHOLDS } from './lib/dominance.mjs';

const args = process.argv.slice(2);
const N = Number(args.find(a => /^\d+$/.test(a))) || 30;
const outIdx = args.indexOf('--out');
const seeds = Array.from({ length: N }, (_, i) => hash32(2026, 9, i));
// Thresholds come from knowledge-base/index/rules.json through shared/tools/rules.mjs — never hard-coded here.
const GATE = await (async () => {
  let d = fileURLToPath(new URL('.', import.meta.url));
  while (!existsSync(join(d, 'shared', 'tools', 'rules.mjs'))) {
    const up = dirname(d);
    if (up === d) throw new Error('shared/tools/rules.mjs not found above ' + fileURLToPath(import.meta.url));
    d = up;
  }
  const { loadRules } = await import(pathToFileURL(join(d, 'shared', 'tools', 'rules.mjs')).href);
  return loadRules({ from: fileURLToPath(import.meta.url) });
})();
const R = {
  rho: GATE.value('RULE-CURVE-TREND', 'rho'), r2: GATE.value('RULE-CURVE-LINEARITY', 'r2'),
  peakTol: GATE.value('RULE-CURVE-PEAKS', 'tolerance'), cliff: GATE.value('RULE-CURVE-CLIFF', 'maxDropPp'),
  flowMin: GATE.value('RULE-CURVE-FLOW', 'min'), flowMax: GATE.value('RULE-CURVE-FLOW', 'max'),
};
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const r1 = v => Math.round(v * 10) / 10, pct = v => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : '—');
const PX_PER_SEC = RULES.runSpeed * TPS;

const { segments: SEGS, units: U } = CURVE;
const unitOf = y => U.findIndex(u => y >= u.from && y < u.to);
const isMain = u => !SEGS[u.seg].breather && !SEGS[u.seg].warmup;
const tSec = u => u.from / PX_PER_SEC;

// ---------- load per unit (pure function of the course) ----------
// DI = (bullet hits needed per second at the reference damage) × (speed / 2) + 0.6 × barrels to judge + 0.4 × negative gates.
// Zombie HP is divided by the wave's reference damage per bullet (sim REF_DMG), so DI measures load against the designed power curve.
const A = U.map(() => ({ zps: [], arm: [], spd: [], barrels: [], neg: [], di: [] }));
for (const seed of seeds) {
  const s = createSim(seed);
  U.forEach((u, ui) => {
    const zs = s.zombies.filter(z => z.y >= u.from && z.y < u.to);
    const secs = (u.to - u.from) / PX_PER_SEC;
    const zps = zs.length / secs, arm = zs.filter(z => z.armored).length / (zs.length || 1), spd = zs.length ? mean(zs.map(z => z.spd)) : 2;
    const hitsPs = zs.reduce((t, z) => t + Math.ceil(z.maxHp / u.refDmg), 0) / secs;
    const barrels = s.barrels.filter(b => b.y >= u.from && b.y < u.to && b.reward === 'weapon' || b.y >= u.from && b.y < u.to && b.maxHp > u.refDmg * 20).length;
    const neg = s.gates.filter(g => g.y >= u.from && g.y < u.to && g.kind === 'add' && g.v < 0).length;
    const X = A[ui];
    X.zps.push(zps); X.arm.push(arm); X.spd.push(spd); X.barrels.push(barrels); X.neg.push(neg);
    X.di.push(hitsPs * (spd / 2) + 0.6 * barrels + 0.4 * neg);
  });
}
const M = A.map(X => Object.fromEntries(Object.entries(X).map(([k, v]) => [k, mean(v)])));

// ---------- human-factor play, unit by unit ----------
const P = {};
for (const [name, bot] of Object.entries(HUMANS)) {
  const clear = U.map(() => []), crash = U.map(() => []), alive = U.map(() => []), troops = U.map(() => []);
  const deaths = [], wins = [], bossSecs = [];
  for (const seed of seeds) {
    const sim = createSim(seed);
    const zUnit = sim.zombies.map(z => unitOf(z.y)), bUnit = sim.barrels.map(b => unitOf(b.y));
    const killed = U.map(() => 0), bitten = U.map(() => 0), crashed = U.map(() => 0), troopsAt = new Map();
    let bossFrom = -1;
    while (phase(sim) === 'play') {
      const before = sim.dist;
      step(sim, bot.input(sim));
      for (const e of sim.events) {
        if (e.type === 'kill' && zUnit[e.id] >= 0) killed[zUnit[e.id]]++;
        if (e.type === 'hurt' && e.cause === 'zombie' && zUnit[e.id] >= 0) bitten[zUnit[e.id]]++;
        if (e.type === 'crash' && bUnit[e.id] >= 0) crashed[bUnit[e.id]]++;
        if (e.type === 'boss') bossFrom = sim.tick;
      }
      for (const u of U) if (before < u.to && sim.dist >= u.to) troopsAt.set(u.i, sim.troops);
    }
    const deadAt = sim.result === -1 && !sim.boss.active ? sim.dist : Infinity;
    deaths.push(sim.result === 1 ? Infinity : sim.tick / TPS);
    wins.push(sim.result === 1 ? 1 : 0);
    if (sim.result === 1) bossSecs.push((sim.tick - bossFrom) / TPS);
    U.forEach((u, ui) => {
      alive[ui].push(deadAt >= u.to ? 1 : 0);
      if (deadAt < u.from) return;
      if (killed[ui] + bitten[ui]) clear[ui].push(killed[ui] / (killed[ui] + bitten[ui]));
      crash[ui].push(crashed[ui]);
      if (troopsAt.has(ui)) troops[ui].push(troopsAt.get(ui));
    });
  }
  deaths.sort((a, b) => a - b);
  P[name] = { clear: clear.map(mean), crash: crash.map(mean), alive: alive.map(mean), troops: troops.map(mean), win: mean(wins), medianDeath: deaths[deaths.length >> 1], bossSecs: mean(bossSecs) };
}

// ---------- curve shape over the main segments ----------
const main = U.filter(isMain);
const xs = main.map(tSec), ys = main.map(u => M[u.i].di);
const mx = mean(xs), my = mean(ys);
const slope = xs.reduce((s, x, j) => s + (x - mx) * (ys[j] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
const icpt = my - slope * mx, fit = x => icpt + slope * x;
const ssRes = ys.reduce((s, y, j) => s + (y - fit(xs[j])) ** 2, 0), ssTot = ys.reduce((s, y) => s + (y - my) ** 2, 0);
const R2 = 1 - ssRes / ssTot, resSd = Math.sqrt(ssRes / ys.length);
const rank = a => { const o = a.map((v, j) => [v, j]).sort((p, q) => p[0] - q[0]); const r = []; o.forEach(([, j], k) => { r[j] = k; }); return r; };
const rx = rank(xs), ry = rank(ys), n = xs.length;
const spearman = 1 - (6 * rx.reduce((s, v, j) => s + (v - ry[j]) ** 2, 0)) / (n * (n * n - 1));
const spikes = main.filter((u, j) => ys[j] - fit(xs[j]) > 2 * resSd).map(u => u.i);
// DI should predict trouble: correlation of DI with the regular player's clear rate (expected negative)
const corr = (() => {
  const pts = U.map(u => [M[u.i].di, P.regular.clear[u.i]]).filter(([, c]) => Number.isFinite(c));
  const ax = mean(pts.map(p => p[0])), ay = mean(pts.map(p => p[1]));
  const cov = pts.reduce((s, [x, y]) => s + (x - ax) * (y - ay), 0);
  return cov / Math.sqrt(pts.reduce((s, [x]) => s + (x - ax) ** 2, 0) * pts.reduce((s, [, y]) => s + (y - ay) ** 2, 0));
})();

const SEC = SEGS.map((g, gi) => {
  g = { ...g, name: g.name + (g.warmup ? '（暖身）' : '') };
  const us = U.filter(u => u.seg === gi), m = k => mean(us.map(u => M[u.i][k]));
  return { g, units: us.length, from: tSec(us[0]), to: us.at(-1).to / PX_PER_SEC, di: m('di'), peak: Math.max(...us.map(u => M[u.i].di)), zps: m('zps'),
    clear: Object.fromEntries(Object.keys(P).map(p => [p, mean(us.map(u => P[p].clear[u.i]).filter(Number.isFinite))])),
    crash: Object.fromEntries(Object.keys(P).map(p => [p, us.reduce((s, u) => s + P[p].crash[u.i], 0)])),
    alive: Object.fromEntries(Object.keys(P).map(p => [p, P[p].alive[us.at(-1).i]])),
    troops: mean(us.map(u => P.regular.troops[u.i]).filter(Number.isFinite)) };
});
const mainSec = SEC.filter(x => !x.g.breather && !x.g.warmup);

// ---------- checks ----------
const dom = runDominance(GAME, BOTS, Math.min(N, 30));
const checks = [];
const check = (id, name, ok, detail) => checks.push({ id, name, ok, detail });
check('D1', `技巧主導（技巧佔比 ≥ ${pct(THRESHOLDS.skillShare)}、高手 vs 中等 ≥ ${pct(THRESHOLDS.topWinRate)}）`, dom.pass, `${pct(dom.shares.skillTier)} / ${pct(dom.top)}`);
check('D2', `難度整體上升（主段落逐單位 Spearman ρ ≥ ${R.rho}）`, spearman >= R.rho, `ρ = ${spearman.toFixed(2)}`);
check('D3', `難度接近線性（主段落 R² ≥ ${R.r2}）`, R2 >= R.r2, `R² = ${R2.toFixed(2)}，斜率 ${slope.toFixed(3)} DI/秒`);
const peaksOk = mainSec.every((x, j) => j === 0 || x.peak >= mainSec[j - 1].peak - R.peakTol);
check('D4', '鋸齒向上（每個主段落的高峰 ≥ 前一段）', peaksOk, mainSec.map(x => `${x.g.name} ${r1(x.peak)}`).join(' → '));
const cliffs = mainSec.slice(1).filter((x, j) => (mainSec[j].clear.regular - x.clear.regular) * 100 > R.cliff).map(x => x.g.name);
check('D5', `無斷崖（一般玩家相鄰主段落清怪率下降 ≤ ${R.cliff} pp）`, !cliffs.length, cliffs.join('、') || mainSec.map(x => pct(x.clear.regular)).join(' → '));
check('D6', `一般玩家在心流帶（主段落清怪率 ${Math.round(R.flowMin * 100)}–${pct(R.flowMax)}）`, mainSec.every(x => x.clear.regular >= R.flowMin && x.clear.regular <= R.flowMax), mainSec.map(x => `${x.g.name} ${(x.clear.regular * 100).toFixed(1)}%`).join(' / '));
check('D7', '拍格（節奏類專用）', true, '不適用：非節奏品類');
check('D8', '樂句長度（節奏類專用）', true, '不適用：非節奏品類');

// ---------- markdown ----------
const v = GAME.version;
const sectionRows = SEC.map(x => `| ${x.g.name} | ${x.from.toFixed(0)}–${x.to.toFixed(0)} s | ${x.units} | ${r1(x.zps)} | ${r1(x.di)} / ${r1(x.peak)} | ${pct(x.clear.casual)} · ${pct(x.clear.regular)} · ${pct(x.clear.skilled)} | ${r1(x.crash.casual)} · ${r1(x.crash.regular)} · ${r1(x.crash.skilled)} | ${pct(x.alive.casual)} · ${pct(x.alive.regular)} | ${Math.round(x.troops)} |`);
const runLen = BOSS_STOP / PX_PER_SEC;
const md = [
  '# Playtest Report — Gate Lane（自動產生）',
  '',
  `- 產生：\`node tools/playtest.mjs ${N}\`；${N} 個種子；sim v${v}；${U.length} 個單位（每單位 ${(U[0].to - U[0].from) / PX_PER_SEC} 秒）`,
  '- 難度指數 DI = 每秒需要的命中數（殭屍 HP ÷ 該波參考單發傷害）× (速度 / 2) + 0.6 × 要判斷的桶子 + 0.4 × 負數門；人性化試玩：tools/humanBots.mjs（新手 / 一般 / 熟手）',
  '- 清怪率 = 該單位的殭屍被擊殺 ÷（擊殺 + 咬到小隊）；相當於節奏類的命中率',
  '',
  '## 檢查',
  '',
  '| # | 檢查 | 結果 | 數據 |',
  '|---|---|---|---|',
  ...checks.map(c => `| ${c.id} | ${c.name} | ${c.ok ? '✅' : '❌'} | ${c.detail} |`),
  '',
  '## 段落',
  '',
  '| 段落 | 時間 | 單位 | 殭屍/秒 | DI 平均 / 高峰 | 清怪率 新手 · 一般 · 熟手 | 撞桶次數 新手 · 一般 · 熟手 | 段末存活 新手 · 一般 | 一般玩家士兵 |',
  '|---|---|---|---|---|---|---|---|---|',
  ...sectionRows,
  '',
  '## 逐單位',
  '',
  '| # | 段落 | 級 | DI | 清怪率 新手 · 一般 · 熟手 | 存活 新手 · 一般 · 熟手 |',
  '|---|---|---|---|---|---|',
  ...U.map(u => `| ${u.i + 1} | ${SEGS[u.seg].name} | ${u.level} | ${r1(M[u.i].di)} | ${pct(P.casual.clear[u.i])} · ${pct(P.regular.clear[u.i])} · ${pct(P.skilled.clear[u.i])} | ${pct(P.casual.alive[u.i])} · ${pct(P.regular.alive[u.i])} · ${pct(P.skilled.alive[u.i])} |`),
  '',
  '## 目標值（不做硬門檻）',
  '',
  '| 項目 | 目標 | 實測 |',
  '|---|---|---|',
  `| 新手中位倒下時間 | 全長的 55–80%（跑道 ${runLen.toFixed(0)} 秒） | ${Number.isFinite(P.casual.medianDeath) ? `${Math.round(P.casual.medianDeath)} 秒（${pct(P.casual.medianDeath / runLen)}）` : '未倒下'} |`,
  `| 一般玩家打完（擊倒頭目） | 全部 | ${pct(P.regular.win)} |`,
  `| 熟手清怪率 | ≥ 95% | ${pct(mean(U.map(u => P.skilled.clear[u.i]).filter(Number.isFinite)))} |`,
  `| 擊倒頭目 新手 · 一般 · 熟手 | — | ${pct(P.casual.win)} · ${pct(P.regular.win)} · ${pct(P.skilled.win)}（熟手平均 ${r1(P.skilled.bossSecs)} 秒） |`,
  `| DI 與一般玩家清怪率的相關係數 | 明顯為負 | ${corr.toFixed(2)} |`,
  '',
  `曲線擬合（主段落）：DI ≈ ${icpt.toFixed(2)} + ${slope.toFixed(3)} × 秒，R² ${R2.toFixed(2)}，Spearman ρ ${spearman.toFixed(2)}。高於擬合線 2σ 的單位（尖峰）：${spikes.map(i => `#${i + 1}`).join('、') || '無'}。`,
  '',
].join('\n');

// ---------- html (self-contained, inline SVG) ----------
const W = 760, H = 220, PADL = 44, PADR = 12, PADT = 14, PADB = 30;
const tmax = U.at(-1).to / PX_PER_SEC, xpx = t => PADL + (t / tmax) * (W - PADL - PADR);
function chart(title, series, { yMax, yFmt = x => x, fitLine = null }) {
  const ypx = val => PADT + (1 - val / yMax) * (H - PADT - PADB);
  const bands = SEC.map((x, k) => `<rect x="${xpx(x.from)}" y="${PADT}" width="${xpx(x.to) - xpx(x.from)}" height="${H - PADT - PADB}" class="${x.g.breather ? 'band-safe' : k % 2 ? 'band-a' : 'band-b'}"><title>${x.g.name}</title></rect>`).join('');
  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => `<line x1="${PADL}" x2="${W - PADR}" y1="${ypx(yMax * f)}" y2="${ypx(yMax * f)}" class="grid"/><text x="${PADL - 6}" y="${ypx(yMax * f) + 4}" class="tick" text-anchor="end">${yFmt(yMax * f)}</text>`).join('');
  const xt = [0, 20, 40, 60, 80].filter(t => t <= tmax + 1).map(t => `<text x="${xpx(t)}" y="${H - 10}" class="tick" text-anchor="middle">${t}s</text>`).join('');
  const lines = series.map((sr, k) => {
    const pts = U.map(u => [xpx((u.from + u.to) / 2 / PX_PER_SEC), sr.values[u.i]]).filter(q => Number.isFinite(q[1]));
    return `<polyline class="line s${k + 1}" points="${pts.map(([x, y]) => `${x.toFixed(1)},${ypx(Math.min(y, yMax)).toFixed(1)}`).join(' ')}"/>`;
  }).join('');
  const fl = fitLine ? `<line x1="${xpx(tSec(main[0]))}" x2="${xpx(main.at(-1).to / PX_PER_SEC)}" y1="${ypx(fitLine(tSec(main[0])))}" y2="${ypx(fitLine(main.at(-1).to / PX_PER_SEC))}" class="fit"/>` : '';
  const legend = series.length > 1 ? `<div class="legend">${series.map((sr, k) => `<span><i class="sw s${k + 1}"></i>${sr.name}</span>`).join('')}</div>` : '';
  return `<figure class="chart"><figcaption>${title}</figcaption>${legend}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">${bands}${grid}${xt}${fl}${lines}</svg></figure>`;
}
const pctFmt = x => `${Math.round(x * 100)}%`;
const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gate Lane Playtest</title>
<style>
:root{color-scheme:light;--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--muted:#8a8984;--grid:#e6e5e0;--band-a:#f4f3ef;--band-b:#fbfbf9;--band-safe:#e9f5ee;--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--fit:#8a8984}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--muted:#8f8e86;--grid:#2e2e2b;--band-a:#232321;--band-b:#1d1d1c;--band-safe:#1d2a22;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--fit:#8f8e86}}
body{margin:0;background:var(--surface);color:var(--ink);font:15px/1.5 system-ui,"Noto Sans TC",sans-serif}main{max-width:820px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:8px 0}h2{font-size:17px;margin:24px 0 8px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid var(--grid);padding:4px 6px;text-align:left}th{color:var(--ink2);font-weight:600}
.chart{margin:16px 0}.chart figcaption{font-weight:600;margin-bottom:4px}svg{width:100%;height:auto;display:block}
.band-a{fill:var(--band-a)}.band-b{fill:var(--band-b)}.band-safe{fill:var(--band-safe)}.grid{stroke:var(--grid)}.tick{fill:var(--muted);font-size:11px}
.line{fill:none;stroke-width:2;stroke-linejoin:round}.line.s1{stroke:var(--s1)}.line.s2{stroke:var(--s2)}.line.s3{stroke:var(--s3)}.fit{stroke:var(--fit);stroke-width:1.5;stroke-dasharray:5 4}
.legend{display:flex;gap:14px;font-size:13px;color:var(--ink2)}.sw{display:inline-block;width:14px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle}.sw.s1{background:var(--s1)}.sw.s2{background:var(--s2)}.sw.s3{background:var(--s3)}
.ok{color:var(--s3)}.bad{color:var(--s2)}
</style></head><body><main>
<h1>Gate Lane Playtest</h1><p style="color:var(--ink2)">${N} 個種子 · sim v${v} · ${U.length} 個單位 · 淡綠底 = 調息段</p>
<h2>檢查</h2><table><tr><th>#</th><th>檢查</th><th>結果</th><th>數據</th></tr>${checks.map(c => `<tr><td>${c.id}</td><td>${c.name}</td><td class="${c.ok ? 'ok' : 'bad'}">${c.ok ? '✔ 通過' : '✘ 未通過'}</td><td>${c.detail}</td></tr>`).join('')}</table>
${chart('難度指數 DI（每單位，虛線 = 主段落線性擬合）', [{ name: 'DI', values: M.map(m => m.di) }], { yMax: Math.ceil(Math.max(...M.map(m => m.di)) + 0.5), yFmt: x => x.toFixed(1), fitLine: fit })}
${chart('清怪率（每單位）', [{ name: '新手', values: P.casual.clear }, { name: '一般', values: P.regular.clear }, { name: '熟手', values: P.skilled.clear }], { yMax: 1, yFmt: pctFmt })}
${chart('存活率（單位結束時）', [{ name: '新手', values: P.casual.alive }, { name: '一般', values: P.regular.alive }, { name: '熟手', values: P.skilled.alive }], { yMax: 1, yFmt: pctFmt })}
<h2>段落</h2><table><tr><th>段落</th><th>DI 平均/高峰</th><th>清怪 新手·一般·熟手</th><th>撞桶 新手·一般·熟手</th><th>段末存活 新手·一般</th></tr>
${SEC.map(x => `<tr><td>${x.g.name}</td><td>${r1(x.di)} / ${r1(x.peak)}</td><td>${pct(x.clear.casual)} · ${pct(x.clear.regular)} · ${pct(x.clear.skilled)}</td><td>${r1(x.crash.casual)} · ${r1(x.crash.regular)} · ${r1(x.crash.skilled)}</td><td>${pct(x.alive.casual)} · ${pct(x.alive.regular)}</td></tr>`).join('')}</table>
</main></body></html>`;

if (outIdx >= 0) { writeFileSync(args[outIdx + 1] + '.md', md, 'utf8'); writeFileSync(args[outIdx + 1] + '.html', html, 'utf8'); }
console.log(md);
process.exitCode = checks.every(c => c.ok) ? 0 : 1;
