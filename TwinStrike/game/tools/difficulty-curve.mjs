// Difficulty-curve playtest (gdd/07_difficulty_curve.md): runs the human-factor bots over N seeds and reports,
// per scripted section, the chart load and how each kind of player does. Flags "cliffs" (a section where the
// regular player's hit rate drops much more than the curve's step) and "dead zones" (too easy late in the match).
// Usage: node tools/difficulty-curve.mjs [seeds=30] [--out ../docs/difficulty_curve.md]   (exit 1 on a cliff)
import { writeFileSync } from 'node:fs';
import { hash32 } from '../src/sim/core/index.js';
import { createSim, step, phase, SEGMENTS, SUB, GRADE, KIND, RULES } from '../src/sim/sim.js';
import { HUMANS } from './humanBots.mjs';

const args = process.argv.slice(2);
const N = Number(args.find(a => /^\d+$/.test(a))) || 30;
const outIdx = args.indexOf('--out');
const CLIFF_PP = 12;                                                // max allowed hit-rate drop between consecutive hard sections

const seeds = Array.from({ length: N }, (_, i) => hash32(2026, 9, i));
const secOf = n => n.seg;
const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);

// chart load per section (averaged over seeds)
const load = SEGMENTS.map(() => ({ nps: [], sw: [], runner: [], brute: [], di: [] }));
for (const seed of seeds) {
  const chart = createSim(seed).chart;
  SEGMENTS.forEach((s, k) => {
    const notes = chart.filter(n => secOf(n) === k), secs = (s.to - s.from) / 60;
    let sw = 0;
    notes.forEach((n, i) => { const p = notes[i - 1]; if (p && p.lane !== n.lane && (n.t - p.t) / SUB < 18) sw++; });
    const nps = notes.length / secs, swr = sw / (notes.length || 1);
    const rr = notes.filter(n => n.kind === KIND.RUNNER).length / (notes.length || 1);
    const br = notes.filter(n => n.kind === KIND.BRUTE).length / (notes.length || 1);
    Object.entries({ nps, sw: swr, runner: rr, brute: br, di: nps * (1 + 0.5 * swr) * (1 + 0.3 * rr + 0.2 * br) }).forEach(([key, v]) => load[k][key].push(v));
  });
}

// play each human profile
const play = {};
for (const [name, bot] of Object.entries(HUMANS)) {
  const per = SEGMENTS.map(() => ({ hit: [], perfect: [], hpLoss: [], alive: [] }));
  const finish = [];
  for (const seed of seeds) {
    const sim = createSim(seed); sim.recordEvents = true;
    const loss = SEGMENTS.map(() => 0);
    while (phase(sim) === 'play') {
      step(sim, bot.input(sim));
      for (const e of sim.events) if (e.type === 'hurt' && !e.safe) loss[sim.chart[e.note].seg]++;
    }
    finish.push(sim.hp > 0 ? 1 : 0);
    SEGMENTS.forEach((s, k) => {
      const ids = sim.chart.map((n, i) => (n.seg === k ? i : -1)).filter(i => i >= 0);
      const alive = sim.deathTick < 0 || sim.deathTick >= s.to;
      per[k].alive.push(alive ? 1 : 0);
      if (!alive) return;                                          // only judge sections the player actually reached
      const g = ids.map(i => sim.judge.grade[i]);
      per[k].hit.push(g.filter(x => x > GRADE.MISS).length / (g.length || 1));
      per[k].perfect.push(g.filter(x => x === GRADE.PERFECT).length / (g.length || 1));
      per[k].hpLoss.push(loss[k]);
    });
  }
  play[name] = { per, finish: mean(finish) };
}

// cliffs: consecutive non-breather, non-safe sections where the regular player's hit rate falls > CLIFF_PP
const pct = v => `${(v * 100).toFixed(0)}%`;
const hard = SEGMENTS.map((s, k) => k).filter(k => SEGMENTS[k].levels.length > 1);
const cliffs = [];
for (let a = 1; a < hard.length; a++) {
  const p = mean(play.regular.per[hard[a - 1]].hit), q = mean(play.regular.per[hard[a]].hit);
  if ((p - q) * 100 > CLIFF_PP) cliffs.push(`${SEGMENTS[hard[a - 1]].name} → ${SEGMENTS[hard[a]].name}：${pct(p)} → ${pct(q)}`);
}

const rows = SEGMENTS.map((s, k) => {
  const L = load[k], bpm = Math.round(3600 / s.beatTicks);
  const cell = name => { const P = play[name].per[k]; return P.hit.length ? `${pct(mean(P.hit))} / ${pct(mean(P.perfect))} / ${mean(P.hpLoss).toFixed(1)}` : '—'; };
  return `| ${s.name}${s.fever ? '（無雙）' : s.safe ? '（安全）' : ''} | ${(s.from / 60).toFixed(0)}–${(s.to / 60).toFixed(0)} s | ${bpm} | L${Math.min(...s.levels)}–L${Math.max(...s.levels)} | ${mean(L.nps).toFixed(1)} | ${pct(mean(L.sw))} | ${mean(L.di).toFixed(1)} | ${cell('casual')} | ${cell('regular')} | ${cell('skilled')} | ${pct(mean(play.casual.per[k].alive))} |`;
});

const md = [
  `# Difficulty Curve Report — twin-strike（自動產生）`,
  '',
  `- 產生：\`node tools/difficulty-curve.mjs ${N}\`；${N} 個種子 × 3 種人性化試玩 bot（tools/humanBots.mjs）`,
  '- 負荷：notes/s、快速換邊比例（相鄰兩敵 < 0.3 s 且換邊）、難度指數 DI = notes/s × (1 + 0.5 × 換邊) × (1 + 0.3 × 疾兵 + 0.2 × 重甲)',
  '- 玩家欄位：命中率 / Perfect 率 / 該段扣血數（只算有活到該段的局）',
  `- 斷崖檢查：相鄰兩個主要段落，一般玩家命中率下降 > ${CLIFF_PP} pp → **${cliffs.length ? '有斷崖' : '無斷崖'}**`,
  '',
  '| 段落 | 時間 | BPM | 難度級 | notes/s | 快速換邊 | DI | 新手 | 一般 | 熟手 | 新手存活 |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows,
  '',
  `打完全場比例：新手 ${pct(play.casual.finish)}、一般 ${pct(play.regular.finish)}、熟手 ${pct(play.skilled.finish)}（HP ${RULES.hpMax}）`,
  '',
  ...(cliffs.length ? ['## 斷崖', '', ...cliffs.map(c => `- ${c}`), ''] : []),
].join('\n');

if (outIdx >= 0) writeFileSync(args[outIdx + 1], md, 'utf8');
console.log(md);
process.exitCode = cliffs.length ? 1 : 0;
