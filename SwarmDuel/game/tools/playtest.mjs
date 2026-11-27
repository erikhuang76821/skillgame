// Whole-game automated playtest (knowledge-base/16 D2–D6): the scripted difficulty curve, unit by unit, with the
// human-factor bots of tools/humanBots.mjs. D1 (skill dominance) is tools/skill-dominance.mjs; D7–D8 are for games
// with a beat. Usage: node tools/playtest.mjs [seeds=30] [--out ../docs/playtest_report.md]   (exit 1 if a check fails)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { GAME, createSim, step, choose, TPS, MATCH_TICKS } from '../src/sim/sim.js';
import { ENEMIES, WAVES, EVENTS } from '../src/sim/content.js';
import { hash32 } from '../src/sim/rng.js';
import { HUMANS } from './humanBots.mjs';
import { curveChecks, checksTable, mean, pct } from './lib/curve.mjs';

const args = process.argv.slice(2);
const N = Number(args.find(a => /^\d+$/.test(a))) || 30;
const outIdx = args.indexOf('--out');
const seeds = Array.from({ length: N }, (_, i) => hash32(2026, 9, i));

// ---------- units and sections ----------
// Unit = 10 s. Sections = the 30-second blocks of the script (knowledge-base/16 §6: survivor games cut by time).
// The first block is the warm-up (one enemy kind, the lowest spawn rate), so it is not a rising main section.
const UNIT_S = 10, SEC_S = 30;
const SECTIONS = [
  { name: '0–30 s 暖身（灰仔）', main: false },
  { name: '30–60 s 探針登場', main: true },
  { name: '60–90 s 巨灰登場', main: true },
  { name: '90–120 s 包圍環', main: true },
  { name: '120–150 s 偵察飛碟', main: true },
  { name: '150–180 s 母艦＋光束', main: true },
];
const units = Array.from({ length: MATCH_TICKS / TPS / UNIT_S }, (_, k) => ({
  name: `${k * UNIT_S}–${(k + 1) * UNIT_S} s`, t: k * UNIT_S, section: Math.floor((k * UNIT_S) / SEC_S),
}));

// ---------- DI: incoming threat per second, from the script alone (same for every seed and every player) ----------
// Threat of one enemy = its HP ÷ a greyling's: the damage the player must deal to clear it (every enemy hurts on
// contact, and the longer one lives the longer it presses). Waves contribute spawn rate × the kind-weighted mean;
// boss and ring events their whole HP in the unit they arrive in; each beam (a hit you can only walk out of) counts 2.
const threat = k => ENEMIES[k].hp / ENEMIES.greyling.hp;
const BEAMS = EVENTS.find(e => e.type === 'beams');
units.forEach(u => {
  let sum = 0;
  for (let t = u.t * TPS; t < (u.t + UNIT_S) * TPS; t++) {               // an event at 60 s opens the 60–70 s unit
    const w = WAVES.find(w => t > w.t0 * TPS && t <= w.t1 * TPS);
    if (w) {
      const rate = w.rate[0] + ((w.rate[1] - w.rate[0]) * (t - w.t0 * TPS)) / ((w.t1 - w.t0) * TPS);
      const tot = Object.values(w.kinds).reduce((a, b) => a + b, 0);
      sum += (rate / TPS) * Object.entries(w.kinds).reduce((s, [k, n]) => s + (n / tot) * threat(k), 0);
    }
    for (const ev of EVENTS) if (ev.at * TPS === t && ev.enemy) sum += (ev.count ?? 1) * threat(ev.enemy);
    if (t >= BEAMS.at * TPS && (t - BEAMS.at * TPS) % BEAMS.every === 0) sum += 2;
  }
  u.di = sum / UNIT_S;
});

// ---------- the human-factor runs ----------
// Per unit: share of the seconds the player was alive in it that passed without taking damage ("clean seconds").
// A run that has died does not count for the units after its death (NaN), as in knowledge-base/16 §3.
function run(seed, bot) {
  const sim = createSim(seed), clean = units.map(() => [0, 0]);
  sim.recordEvents = false;
  let hits = sim.hits;
  while (sim.state !== 'over') {
    if (sim.state === 'levelup') { choose(sim, bot.pick(sim)); continue; }
    step(sim, bot.input(sim));
    if (sim.tick % TPS === 0 || sim.state === 'over') {
      const k = Math.min(units.length - 1, Math.floor((sim.tick - 1) / TPS / UNIT_S));
      clean[k][0] += sim.hits === hits ? 1 : 0; clean[k][1]++; hits = sim.hits;
    }
  }
  return { clean: clean.map(([c, n]) => (n ? c / n : NaN)), secs: sim.tick / TPS, survived: sim.survived };
}
const people = {};
for (const [name, bot] of Object.entries(HUMANS)) {
  const runs = seeds.map(s => run(s, bot));
  units.forEach((u, k) => { (u.hit ??= {})[name] = mean(runs.map(r => r.clean[k])); });
  const secs = runs.map(r => r.secs).sort((a, b) => a - b);
  people[name] = { survival: mean(runs.map(r => (r.survived ? 1 : 0))), medianSecs: secs[Math.floor(secs.length / 2)] };
}

// ---------- checks ----------
const curve = curveChecks(units, SECTIONS);
const checks = [
  ...curve.checks,
  { name: '拍格與樂句長度（RULE-CURVE-BEATGRID / PHRASE，節奏類才檢查）', ok: null, detail: '生存類，沒有節拍' },
];
const total = MATCH_TICKS / TPS;
const md = [
  `# Playtest Report — ${GAME.id} v${GAME.version}（自動產生）`,
  '',
  `- 產生：\`node tools/playtest.mjs ${N}\`；${N} 個種子；單位 = ${UNIT_S} 秒，段落 = ${SEC_S} 秒`,
  '- DI = 每秒進場的敵人 HP（灰仔 = 1；頭目與包圍環整批算在抵達的單位，光束每道算 2），只由腳本決定，每個種子相同',
  '- 命中率欄位 = 無傷秒數比例（活著的秒數裡沒有受傷的比例）；倒下後的單位不計',
  '- 人性化試玩：tools/humanBots.mjs（新手 / 一般 / 熟手；參數未經真人校正）；技巧主導（D1）見 docs/skill_dominance_report.md',
  '',
  '## 檢查',
  '',
  checksTable(checks),
  '',
  '## 玩家',
  '',
  '| 玩家 | 撐完全場 | 倒下時間中位數 |',
  '|---|---|---|',
  ...Object.entries(people).map(([n, p]) => `| ${{ casual: '新手', regular: '一般', skilled: '熟手' }[n]} | ${pct(p.survival)} | ${Math.round(p.medianSecs)} / ${total} 秒 |`),
  '',
  '## 段落',
  '',
  '| 段落 | 主段落 | DI 平均 / 高峰 | 無傷秒數 新手 · 一般 · 熟手 |',
  '|---|---|---|---|',
  ...curve.sec.map(s => `| ${s.name} | ${s.main ? '✓' : ''} | ${s.di.toFixed(2)} / ${s.peak.toFixed(2)} | ${pct(s.hit.casual)} · ${pct(s.hit.regular)} · ${pct(s.hit.skilled)} |`),
  '',
  '## 單位',
  '',
  '| 時間 | 段落 | DI | 無傷秒數 新手 · 一般 · 熟手 |',
  '|---|---|---|---|',
  ...units.map(u => `| ${u.name} | ${SECTIONS[u.section].name} | ${u.di.toFixed(2)} | ${pct(u.hit.casual)} · ${pct(u.hit.regular)} · ${pct(u.hit.skilled)} |`),
  '',
  `曲線擬合（主段落）：DI ≈ ${curve.fit.icpt.toFixed(2)} + ${curve.fit.slope.toFixed(3)} × 秒，R² ${curve.fit.r2.toFixed(2)}，Spearman ρ ${curve.fit.rho.toFixed(2)}。`,
  '',
].join('\n');

if (outIdx >= 0) { mkdirSync(dirname(args[outIdx + 1]), { recursive: true }); writeFileSync(args[outIdx + 1], md, 'utf8'); }
console.log(md);
process.exitCode = checks.every(c => c.ok !== false) ? 0 : 1;
