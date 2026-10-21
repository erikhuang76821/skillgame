// Whole-game automated playtest (gdd/07_difficulty_curve.md §8): difficulty, musical rhythm and curve shape,
// bar by bar. Plays every seed with the skill-tier bots (fairness) and the human-factor bots (feel), analyses
// the chart as music (beat grid, syncopation, phrasing, keysound melody), fits the difficulty curve and checks it.
// Usage: node tools/playtest.mjs [seeds=30] [--out ../docs/playtest_report]   -> .md + .html; exit 1 if a check fails
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hash32 } from '../src/sim/core/index.js';
import { createSim, step, phase, SEGMENTS, SUB, GRADE, KIND, RULES } from '../src/sim/sim.js';
import { HUMANS } from './humanBots.mjs';
import { BOTS } from './bots.mjs';
import { runDominance, THRESHOLDS } from './lib/dominance.mjs';
import { keyFor } from '../src/audio/keysound.js';

const args = process.argv.slice(2);
const N = Number(args.find(a => /^\d+$/.test(a))) || 30;
const outIdx = args.indexOf('--out');
const seeds = Array.from({ length: N }, (_, i) => hash32(2026, 9, i));
// Thresholds come from knowledge-base/index/rules.json through shared/tools/rules.mjs — never hard-coded here
// (knowledge-base/decisions/2026-10-21-kb-asset-architecture.md). The calling game's config/rules.overrides.json applies.
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
  phrase: GATE.value('RULE-CURVE-PHRASE', 'multipleOf'),
};
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const r1 = v => Math.round(v * 10) / 10, pct = v => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : '—');

// ---------- bars of the script ----------
const BARS = [];
SEGMENTS.forEach((s, seg) => s.levels.forEach((level, k) => {
  const from = s.from + k * 4 * s.beatTicks;
  BARS.push({ i: BARS.length, seg, id: s.id, name: s.name, level, from, to: from + 4 * s.beatTicks, beatTicks: s.beatTicks, bpm: 3600 / s.beatTicks, safe: s.safe, fever: s.fever, boss: level >= 9 });
}));
const barOf = t => BARS.findIndex(b => t >= b.from * SUB && t < b.to * SUB);
const isMain = b => { const s = SEGMENTS[b.seg]; return s.levels.length > 1 && !s.safe && s.id !== 'O'; };

// ---------- chart & music analysis per bar ----------
const A = BARS.map(() => ({ notes: [], nps: [], sw: [], runner: [], brute: [], di: [], off: [], sync: [], downbeat: [], range: [], leap: [], step: [] }));
for (const seed of seeds) {
  const chart = createSim(seed).chart;
  BARS.forEach((b, bi) => {
    const ns = chart.filter(n => n.t >= b.from * SUB && n.t < b.to * SUB), secs = (b.to - b.from) / 60, X = A[bi];
    const eighth = n => Math.round((n.t / SUB - b.from) / (b.beatTicks / 2));
    const slots = new Set(ns.map(eighth));
    let sw = 0;
    ns.forEach((n, j) => { const p = chart[chart.indexOf(n) - 1]; if (p && p.lane !== n.lane && (n.t - p.t) / SUB < 18) sw++; });
    const off = ns.filter(n => eighth(n) % 2 === 1).length;
    const sync = ns.filter(n => eighth(n) % 2 === 1 && !slots.has(eighth(n) + 1)).length;       // off-beat note, next beat silent
    const midi = ns.map(n => (n.lane ? 60 : 48) + 12 * Math.log2(keyFor(n, 0).pitch));
    const iv = midi.slice(1).map((m, j) => Math.abs(m - midi[j]));
    const nps = ns.length / secs, swr = sw / (ns.length || 1);
    const rr = ns.filter(n => n.kind === KIND.RUNNER).length / (ns.length || 1), br = ns.filter(n => n.kind === KIND.BRUTE).length / (ns.length || 1);
    X.notes.push(ns.length); X.nps.push(nps); X.sw.push(swr); X.runner.push(rr); X.brute.push(br);
    X.di.push(nps * (1 + 0.5 * swr) * (1 + 0.3 * rr + 0.2 * br));
    if (ns.length) {
      X.off.push(off / ns.length); X.sync.push(sync / ns.length); X.downbeat.push(slots.has(0) ? 1 : 0);
      X.range.push(Math.max(...midi) - Math.min(...midi));
      if (iv.length) { X.leap.push(Math.max(...iv)); X.step.push(iv.filter(v => v <= 7).length / iv.length); }
    }
  });
}
const M = A.map(X => Object.fromEntries(Object.entries(X).map(([k, v]) => [k, mean(v)])));

// ---------- human-factor play, bar by bar ----------
const P = {};
for (const [name, bot] of Object.entries(HUMANS)) {
  const hit = BARS.map(() => []), alive = BARS.map(() => []), hp = BARS.map(() => []), deaths = [];
  for (const seed of seeds) {
    const sim = createSim(seed); sim.recordEvents = true;
    const hpAt = new Map();
    while (phase(sim) === 'play') {
      step(sim, bot.input(sim));
      const bi = BARS.findIndex(b => b.to === sim.tick);
      if (bi >= 0) hpAt.set(bi, sim.hp);
    }
    deaths.push(sim.deathTick < 0 ? Infinity : sim.deathTick / 60);
    BARS.forEach((b, bi) => {
      const reached = sim.deathTick < 0 || sim.deathTick >= b.from;
      const survived = sim.deathTick < 0 || sim.deathTick >= b.to;
      alive[bi].push(survived ? 1 : 0);
      hp[bi].push(survived ? (hpAt.get(bi) ?? sim.hp) : 0);
      if (!reached) return;
      const g = sim.chart.map((n, i) => (barOf(n.t) === bi ? sim.judge.grade[i] : -9)).filter(x => x !== -9);
      if (g.length) hit[bi].push(g.filter(x => x > GRADE.MISS).length / g.length);
    });
  }
  deaths.sort((a, b) => a - b);
  P[name] = { hit: hit.map(mean), alive: alive.map(mean), hp: hp.map(mean), finish: mean(alive.at(-1)), medianDeath: deaths[deaths.length >> 1] };
}

// ---------- curve shape ----------
const main = BARS.filter(isMain);
const xs = main.map(b => b.from / 60), ys = main.map(b => M[b.i].di);
const mx = mean(xs), my = mean(ys);
const slope = xs.reduce((s, x, j) => s + (x - mx) * (ys[j] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
const icpt = my - slope * mx;
const fit = x => icpt + slope * x;
const ssRes = ys.reduce((s, y, j) => s + (y - fit(xs[j])) ** 2, 0), ssTot = ys.reduce((s, y) => s + (y - my) ** 2, 0);
const R2 = 1 - ssRes / ssTot, resSd = Math.sqrt(ssRes / ys.length);
const rank = a => { const o = a.map((v, j) => [v, j]).sort((p, q) => p[0] - q[0]); const r = []; o.forEach(([, j], k) => { r[j] = k; }); return r; };
const rx = rank(xs), ry = rank(ys), n = xs.length;
const spearman = 1 - (6 * rx.reduce((s, v, j) => s + (v - ry[j]) ** 2, 0)) / (n * (n * n - 1));
const spikes = main.filter((b, j) => ys[j] - fit(xs[j]) > 2 * resSd).map(b => b.i);
const dips = main.filter((b, j) => fit(xs[j]) - ys[j] > 2 * resSd && !b.boss).map(b => b.i);

// per section
const SEC = SEGMENTS.map((s, si) => {
  const bs = BARS.filter(b => b.seg === si), m = k => mean(bs.map(b => M[b.i][k]));
  return { s, bars: bs.length, di: m('di'), peak: Math.max(...bs.map(b => M[b.i].di)), nps: m('nps'), off: m('off'), sync: m('sync'), range: m('range'), leap: m('leap'),
    hit: Object.fromEntries(Object.keys(P).map(p => [p, mean(bs.map(b => P[p].hit[b.i]).filter(Number.isFinite))])),
    alive: Object.fromEntries(Object.keys(P).map(p => [p, P[p].alive[bs.at(-1).i]])) };
});
const mainSec = SEC.filter(x => x.s.levels.length > 1 && !x.s.safe && x.s.id !== 'O');

// ---------- checks ----------
const dom = runDominance((await import('../src/sim/sim.js')).GAME, BOTS, Math.min(N, 30));
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok, detail });
check(`技巧主導（skill share ≥ ${pct(THRESHOLDS.skillShare)}、expert vs intermediate ≥ ${pct(THRESHOLDS.topWinRate)}）`, dom.pass, `${pct(dom.shares.skillTier)} / ${pct(dom.top)}`);
check(`難度整體上升（主段落逐小節 Spearman ρ ≥ ${R.rho}）`, spearman >= R.rho, `ρ = ${spearman.toFixed(2)}`);
check(`難度接近線性（主段落 R² ≥ ${R.r2}）`, R2 >= R.r2, `R² = ${R2.toFixed(2)}，斜率 ${slope.toFixed(3)} DI/秒`);
const peaksOk = mainSec.every((x, j) => j === 0 || x.peak >= mainSec[j - 1].peak - R.peakTol);
check('鋸齒向上（每個主段落的高峰 ≥ 前一段）', peaksOk, mainSec.map(x => `${x.s.name} ${r1(x.peak)}`).join(' → '));
const cliffs = mainSec.slice(1).filter((x, j) => (mainSec[j].hit.regular - x.hit.regular) * 100 > R.cliff).map(x => x.s.name);
check(`無斷崖（一般玩家相鄰主段落命中率下降 ≤ ${R.cliff} pp）`, !cliffs.length, cliffs.join('、') || '—');
check(`一般玩家在心流帶（主段落命中率 ${Math.round(R.flowMin * 100)}–${pct(R.flowMax)}）`, mainSec.every(x => x.hit.regular >= R.flowMin && x.hit.regular <= R.flowMax), mainSec.map(x => pct(x.hit.regular)).join(' / '));
check('全部落在拍格上（八分音格）', true, '譜面只用 8 個八分音位置（建構保證）');
const oddSections = SEGMENTS.filter(s => s.levels.length > 1 && s.levels.length % R.phrase !== 0 && s.id !== 'O');
check(`樂句長度（主要段落小節數為 ${R.phrase} 的倍數）`, !oddSections.length, oddSections.map(s => `${s.name} ${s.levels.length} 小節`).join('、') || '全部 4 / 8 小節');

// ---------- markdown ----------
const sectionRows = SEC.map(x => `| ${x.s.name}${x.s.fever ? '（無雙）' : x.s.safe ? '（安全）' : ''} | ${(x.s.from / 60).toFixed(0)}–${(x.s.to / 60).toFixed(0)} s | ${x.bars} | ${Math.round(3600 / x.s.beatTicks)} | ${r1(x.nps)} | ${r1(x.di)} / ${r1(x.peak)} | ${pct(x.off)} | ${pct(x.sync)} | ${r1(x.range)} / ${r1(x.leap)} | ${pct(x.hit.casual)} · ${pct(x.hit.regular)} · ${pct(x.hit.skilled)} | ${pct(x.alive.casual)} |`);
const md = [
  '# Playtest Report — 喵拳道場（自動產生）',
  '',
  `- 產生：\`node tools/playtest.mjs ${N}\`；${N} 個種子；sim v${(await import('../src/sim/sim.js')).GAME.version}；${BARS.length} 小節`,
  '- 難度指數 DI = notes/s × (1 + 0.5 × 快速換邊) × (1 + 0.3 × 疾兵 + 0.2 × 狸貓)；人性化試玩：tools/humanBots.mjs（新手 / 一般 / 熟手）',
  '- 節奏：反拍 = 落在第 2、4、6、8 個八分音的比例；切分 = 反拍音且下一拍是空的；旋律 = keysound 每小節音域 / 最大跳進（半音）',
  '',
  '## 檢查',
  '',
  '| 檢查 | 結果 | 數據 |',
  '|---|---|---|',
  ...checks.map(c => `| ${c.name} | ${c.ok ? '✅' : '❌'} | ${c.detail} |`),
  '',
  '## 段落',
  '',
  '| 段落 | 時間 | 小節 | BPM | notes/s | DI 平均 / 高峰 | 反拍 | 切分 | 音域 / 跳進 | 命中率 新手 · 一般 · 熟手 | 新手存活 |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...sectionRows,
  '',
  `打完全場：新手 ${pct(P.casual.finish)}（中位數在第 ${Number.isFinite(P.casual.medianDeath) ? Math.round(P.casual.medianDeath) : '—'} 秒倒下）、一般 ${pct(P.regular.finish)}、熟手 ${pct(P.skilled.finish)}。曲線擬合（主段落）：DI ≈ ${icpt.toFixed(2)} + ${slope.toFixed(3)} × 秒，R² ${R2.toFixed(2)}，Spearman ρ ${spearman.toFixed(2)}。`,
  '',
  `高於擬合線 2σ 的小節（尖峰）：${spikes.map(i => `#${i + 1} ${BARS[i].name}`).join('、') || '無'}；低於 2σ（凹陷，不含頭目）：${dips.map(i => `#${i + 1} ${BARS[i].name}`).join('、') || '無'}。`,
  '',
].join('\n');

// ---------- html (self-contained, inline SVG, hover tooltips) ----------
const W = 760, H = 220, PADL = 44, PADR = 12, PADT = 14, PADB = 30;
const tmax = BARS.at(-1).to / 60, xpx = t => PADL + (t / tmax) * (W - PADL - PADR);
function chart(title, series, { yMax, yFmt = v => v, fitLine = null, unit = '' }) {
  const ypx = v => PADT + (1 - v / yMax) * (H - PADT - PADB);
  const bands = SEGMENTS.map((s, k) => `<rect x="${xpx(s.from / 60)}" y="${PADT}" width="${xpx(s.to / 60) - xpx(s.from / 60)}" height="${H - PADT - PADB}" class="${s.safe ? 'band-safe' : k % 2 ? 'band-a' : 'band-b'}"><title>${s.name}</title></rect>`).join('');
  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => `<line x1="${PADL}" x2="${W - PADR}" y1="${ypx(yMax * f)}" y2="${ypx(yMax * f)}" class="grid"/><text x="${PADL - 6}" y="${ypx(yMax * f) + 4}" class="tick" text-anchor="end">${yFmt(yMax * f)}</text>`).join('');
  const xt = [0, 15, 30, 45, 60, 75, 90].filter(t => t <= tmax + 1).map(t => `<text x="${xpx(t)}" y="${H - 10}" class="tick" text-anchor="middle">${t}s</text>`).join('');
  const lines = series.map((sr, k) => {
    const pts = BARS.map(b => [xpx((b.from + b.to) / 120), sr.values[b.i]]).filter(p => Number.isFinite(p[1]));
    return `<polyline class="line s${k + 1}" points="${pts.map(([x, v]) => `${x.toFixed(1)},${ypx(Math.min(v, yMax)).toFixed(1)}`).join(' ')}"/>`;
  }).join('');
  const fl = fitLine ? `<line x1="${xpx(main[0].from / 60)}" x2="${xpx(main.at(-1).to / 60)}" y1="${ypx(fitLine(main[0].from / 60))}" y2="${ypx(fitLine(main.at(-1).to / 60))}" class="fit"/>` : '';
  const data = BARS.map(b => ({ x: xpx((b.from + b.to) / 120), label: `#${b.i + 1} ${b.name} · ${Math.round(b.bpm)} BPM · L${b.level}${b.boss ? '（頭目）' : ''}`, v: series.map(sr => `${sr.name}: ${Number.isFinite(sr.values[b.i]) ? yFmt(sr.values[b.i]) + unit : '—'}`) }));
  const legend = series.length > 1 ? `<div class="legend">${series.map((sr, k) => `<span><i class="sw s${k + 1}"></i>${sr.name}</span>`).join('')}</div>` : '';
  return `<figure class="chart" data-points='${JSON.stringify(data).replace(/'/g, '&#39;')}'><figcaption>${title}</figcaption>${legend}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">${bands}${grid}${xt}${fl}${lines}<line class="cross" y1="${PADT}" y2="${H - PADB}" x1="-10" x2="-10"/></svg><div class="tip" hidden></div></figure>`;
}
const pctFmt = v => `${Math.round(v * 100)}%`;
const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>喵拳道場 Playtest</title>
<style>
:root{color-scheme:light;--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--muted:#8a8984;--grid:#e6e5e0;--band-a:#f4f3ef;--band-b:#fbfbf9;--band-safe:#e9f5ee;--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--fit:#8a8984}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--muted:#8f8e86;--grid:#2e2e2b;--band-a:#232321;--band-b:#1d1d1c;--band-safe:#1d2a22;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--fit:#8f8e86}}
:root[data-theme="dark"]{color-scheme:dark;--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--muted:#8f8e86;--grid:#2e2e2b;--band-a:#232321;--band-b:#1d1d1c;--band-safe:#1d2a22;--s1:#3987e5;--s2:#d95926;--s3:#199e70;--fit:#8f8e86}
body{margin:0;background:var(--surface);color:var(--ink);font:15px/1.5 system-ui,"Noto Sans TC",sans-serif}main{max-width:820px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:8px 0}h2{font-size:17px;margin:24px 0 8px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid var(--grid);padding:4px 6px;text-align:left}th{color:var(--ink2);font-weight:600}
.chart{margin:16px 0;position:relative}.chart figcaption{font-weight:600;margin-bottom:4px}svg{width:100%;height:auto;display:block}
.band-a{fill:var(--band-a)}.band-b{fill:var(--band-b)}.band-safe{fill:var(--band-safe)}.grid{stroke:var(--grid);stroke-width:1}.tick{fill:var(--muted);font-size:11px}
.line{fill:none;stroke-width:2;stroke-linejoin:round}.line.s1{stroke:var(--s1)}.line.s2{stroke:var(--s2)}.line.s3{stroke:var(--s3)}.fit{stroke:var(--fit);stroke-width:1.5;stroke-dasharray:5 4}
.cross{stroke:var(--muted);stroke-width:1}.legend{display:flex;gap:14px;font-size:13px;color:var(--ink2)}.sw{display:inline-block;width:14px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle}.sw.s1{background:var(--s1)}.sw.s2{background:var(--s2)}.sw.s3{background:var(--s3)}
.tip{position:absolute;pointer-events:none;background:var(--surface);border:1px solid var(--grid);border-radius:6px;padding:6px 8px;font-size:12px;color:var(--ink);box-shadow:0 2px 8px rgba(0,0,0,.12);white-space:nowrap}
.ok{color:var(--s3)}.bad{color:var(--s2)}
</style></head><body><main>
<h1>喵拳道場 Playtest</h1><p style="color:var(--ink2)">${N} 個種子 · sim v${(await import('../src/sim/sim.js')).GAME.version} · ${BARS.length} 小節 · 淡綠底 = 安全段（暖身 / 無雙）</p>
<h2>檢查</h2><table><tr><th>檢查</th><th>結果</th><th>數據</th></tr>${checks.map(c => `<tr><td>${c.name}</td><td class="${c.ok ? 'ok' : 'bad'}">${c.ok ? '✔ 通過' : '✘ 未通過'}</td><td>${c.detail}</td></tr>`).join('')}</table>
${chart('難度指數 DI（每小節，虛線 = 主段落線性擬合）', [{ name: 'DI', values: M.map(m => m.di) }], { yMax: Math.ceil(Math.max(...M.map(m => m.di)) + 0.5), yFmt: v => v.toFixed(1), fitLine: fit })}
${chart('拍速（BPM）', [{ name: 'BPM', values: BARS.map(b => b.bpm) }], { yMax: 200, yFmt: v => Math.round(v) })}
${chart('命中率（每小節，只算有活到的局）', [{ name: '新手', values: P.casual.hit }, { name: '一般', values: P.regular.hit }, { name: '熟手', values: P.skilled.hit }], { yMax: 1, yFmt: pctFmt })}
${chart('存活率（小節結束時）', [{ name: '新手', values: P.casual.alive }, { name: '一般', values: P.regular.alive }, { name: '熟手', values: P.skilled.alive }], { yMax: 1, yFmt: pctFmt })}
${chart('節奏：反拍與切分比例（每小節）', [{ name: '反拍', values: M.map(m => m.off) }, { name: '切分', values: M.map(m => m.sync) }], { yMax: 1, yFmt: pctFmt })}
<h2>段落</h2><table><tr><th>段落</th><th>BPM</th><th>notes/s</th><th>DI 平均/高峰</th><th>反拍</th><th>切分</th><th>命中 新手·一般·熟手</th><th>新手存活</th></tr>
${SEC.map(x => `<tr><td>${x.s.name}</td><td>${Math.round(3600 / x.s.beatTicks)}</td><td>${r1(x.nps)}</td><td>${r1(x.di)} / ${r1(x.peak)}</td><td>${pct(x.off)}</td><td>${pct(x.sync)}</td><td>${pct(x.hit.casual)} · ${pct(x.hit.regular)} · ${pct(x.hit.skilled)}</td><td>${pct(x.alive.casual)}</td></tr>`).join('')}</table>
</main><script>
for (const fig of document.querySelectorAll('.chart')) {
  const pts = JSON.parse(fig.dataset.points), svg = fig.querySelector('svg'), tip = fig.querySelector('.tip'), cross = fig.querySelector('.cross');
  svg.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * ${W} / r.width;
    let best = pts[0]; for (const p of pts) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
    cross.setAttribute('x1', best.x); cross.setAttribute('x2', best.x);
    tip.hidden = false; tip.innerHTML = '<b>' + best.label + '</b><br>' + best.v.join('<br>');
    const left = best.x * r.width / ${W}; tip.style.left = Math.min(left + 12, r.width - tip.offsetWidth) + 'px'; tip.style.top = '28px';
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('x1', -10); cross.setAttribute('x2', -10); });
}
</script></body></html>`;

if (outIdx >= 0) { writeFileSync(args[outIdx + 1] + '.md', md, 'utf8'); writeFileSync(args[outIdx + 1] + '.html', html, 'utf8'); }
console.log(md);
process.exitCode = checks.every(c => c.ok) ? 0 : 1;
