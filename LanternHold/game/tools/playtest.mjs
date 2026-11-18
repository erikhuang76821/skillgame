// Whole-game automated playtest for LanternHold (knowledge-base/16 D1–D8): the scripted difficulty curve checked unit
// by unit with the human-factor bots (tools/humanBots.mjs). Skill evidence is a separate report (tools/skill-evidence.mjs).
//   unit     = one event: from its start to the next event (at least 25 s, so a short gap does not fake a spike)
//   section  = a chapter that ends with a boss (knowledge-base/16: 段末頭目); the opening before the first event is
//              the warm-up. 10-second slices are listed for reference only.
//   DI       = enemy toughness arriving per second: Σ HP × armour factor (heavy ×2, since arrows do half) ÷ 10 s ÷ 10
//   hit rate = hold rate: share of the enemies spawned in the unit that were stopped outside the wall ring
//              (never came within WALL_R − 20 of the castle). The wall ring is the line the player builds and defends.
// D7 / D8 (beat grid, phrase length) are rhythm-only and do not apply.
// Usage: node tools/playtest.mjs [seeds=30] [--out ../docs/playtest_report.md]   (exit 1 if a check fails)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Recorder, hash32, TPS, ONE } from '../src/sim/core/index.js';
import { GAMES, DEFAULT_STAGE, step, phase, FOE, CX, CY, WALL_R } from '../src/sim/sim.js';
import { HUMANS } from './humanBots.mjs';
import { curveChecks, checksTable, mean, pct } from './lib/curve.mjs';

const args = process.argv.slice(2);
const N = Number(args.find(a => /^\d+$/.test(a))) || 30;
const outIdx = args.indexOf('--out'), si = args.indexOf('--stage');
const GAME = GAMES[si >= 0 ? args[si + 1] : DEFAULT_STAGE], createSim = GAME.createSim;
const EVENTS = createSim(1).script.events, MATCH_TICKS = GAME.maxTicks;
const seeds = Array.from({ length: N }, (_, i) => hash32(2026, 9, i));

// ---------- sections and units ----------
// chapters: warm-up, then one per boss (from the event after the previous boss up to and including this boss)
const bossEv = EVENTS.filter(e => e.boss);
const sections = [{ name: '開局', from: 0, main: false }, ...bossEv.map((b, k) => ({ name: `第 ${k + 1} 章（${b.name}）`, from: k ? bossEv[k - 1].at + 1 : EVENTS[0].at, main: true }))];
const sectionAt = t => { let k = 0; for (let j = 0; j < sections.length; j++) if (t >= sections[j].from) k = j; return k; };
const SLICE = 10 * TPS;
const slices = Array.from({ length: MATCH_TICKS / SLICE }, (_, k) => ({ name: `${k * 10}–${k * 10 + 10} s`, from: k * SLICE, t: k * 10, section: sectionAt(k * SLICE) }));
const sliceOf = tick => Math.min(slices.length - 1, Math.floor(tick / SLICE));
const marks = [{ name: '開局', at: 0 }, ...EVENTS];
const units = marks.map((e, k) => {
  const to = k + 1 < marks.length ? marks[k + 1].at : MATCH_TICKS;
  return { name: e.name, from: e.at, t: e.at / TPS, section: sectionAt(e.at), secs: Math.max(25, (to - e.at) / TPS) };
});
const unitOf = tick => { let k = 0; for (let j = 0; j < marks.length; j++) if (tick >= marks[j].at) k = j; return k; };

// ---------- DI: spawns depend only on the seed, so read them from a run whose castle cannot fall ----------
const di = units.map(() => []), sdi = slices.map(() => []);
for (const seed of seeds) {
  const sim = createSim(seed), load = units.map(() => 0), sload = slices.map(() => 0);
  sim.castle.hp = 1e9;
  while (phase(sim) !== 'over') {
    if (phase(sim) === 'choice') { sim.offer = null; sim.pending = 0; continue; }   // measuring spawns only
    step(sim, 0);
    for (const e of sim.events) if (e.type === 'spawn') { const w = e.hp * (FOE[e.kind].armor ? 2 : 1); load[unitOf(sim.tick - 1)] += w; sload[sliceOf(sim.tick - 1)] += w; }
  }
  load.forEach((v, k) => di[k].push(v / units[k].secs / 10));
  sload.forEach((v, k) => sdi[k].push(v / 10 / 10));
}
units.forEach((u, k) => { u.di = mean(di[k]); u.hit = {}; u.reach = {}; });
slices.forEach((u, k) => { u.di = mean(sdi[k]); u.hit = {}; u.reach = {}; });

// ---------- human-factor play ----------
const LINE2 = (WALL_R - 20) ** 2;
const summary = {};
for (const [name, bot] of Object.entries(HUMANS)) {
  const hold = units.map(() => []), reached = units.map(() => 0), shold = slices.map(() => []), sreached = slices.map(() => 0);
  const ends = [], scores = [], bosses = [], evos = [];
  for (const seed of seeds) {
    const rec = new Recorder(GAME, seed);
    const born = new Map(), sborn = new Map(), leaked = new Set();
    while (rec.phase !== 'over') {
      if (rec.phase === 'choice') { rec.choose(bot.pick(rec.sim)); continue; }
      rec.step(bot.input(rec.sim));
      for (const e of rec.sim.events) {
        if (e.type === 'spawn') { born.set(e.id, unitOf(rec.sim.tick - 1)); sborn.set(e.id, sliceOf(rec.sim.tick - 1)); }
      }
      if (rec.sim.tick % 6 === 0) for (const f of rec.sim.foes) { const dx = f.x / ONE - CX, dy = f.y / ONE - CY; if (dx * dx + dy * dy < LINE2) leaked.add(f.id); }
    }
    const s = rec.sim, end = unitOf(Math.max(0, s.tick - 1));
    const spawned = units.map(() => 0), lost = units.map(() => 0);
    for (const [id, k] of born) { spawned[k]++; if (leaked.has(id)) lost[k]++; }
    units.forEach((u, k) => { if (k <= end && spawned[k]) { hold[k].push(1 - lost[k] / spawned[k]); reached[k]++; } });
    const send = sliceOf(Math.max(0, s.tick - 1)), sp = slices.map(() => 0), sl = slices.map(() => 0);
    for (const [id, k] of sborn) { sp[k]++; if (leaked.has(id)) sl[k]++; }
    slices.forEach((u, k) => { if (k <= send && sp[k]) { shold[k].push(1 - sl[k] / sp[k]); sreached[k]++; } });
    ends.push(s.tick / TPS); scores.push(GAME.score(s)); bosses.push(s.bossDead ? 1 : 0); evos.push(Object.values(s.evo).some(Boolean) ? 1 : 0);
  }
  units.forEach((u, k) => { u.hit[name] = mean(hold[k]); u.reach[name] = reached[k] / N; });
  slices.forEach((u, k) => { u.hit[name] = mean(shold[k]); u.reach[name] = sreached[k] / N; });
  summary[name] = { score: mean(scores), end: mean(ends), full: ends.filter(t => t >= MATCH_TICKS / TPS).length + bosses.filter(Boolean).length, boss: bosses.filter(Boolean).length, evo: evos.filter(Boolean).length };
}

// ---------- checks ----------
const curve = curveChecks(units, sections.map(s => ({ name: s.name, main: s.main })));
const checks = [
  ...curve.checks,
  { name: '拍格與樂句長度（RULE-CURVE-BEATGRID / PHRASE，節奏類才檢查）', ok: null, detail: '塔防沒有小節' },
];

const md = [
  `# Playtest Report — ${GAME.id}（自動產生）`,
  '',
  `- 產生：\`node tools/playtest.mjs ${N}\`；${N} 個種子；sim v${GAME.version}；關卡 ${GAME.stage}（${MATCH_TICKS / TPS} 秒）；單位 = 一個事件（到下一個事件為止，最短算 25 秒）；段落 = 以首領收尾的一章（開局為暖身，不算主段落）；另列 10 秒切片供參考`,
  '- DI = 該單位生成的敵人耐久（含隨時間成長）× 護甲係數（重甲 ×2）÷ 單位秒數 ÷ 10',
  '- 命中率 = 守線率：該段生成的敵人中，在城牆環（半徑 WALL_R − 20）外被擋下的比例（只算撐到該段的局；每 6 tick 取樣位置）',
  '- 人性化試玩：tools/humanBots.mjs（新手 / 一般 / 熟手：注意到預警的延遲、偶爾分心、不看卡就選的比例不同）',
  '',
  '## 檢查',
  '',
  checksTable(checks),
  '',
  '## 整局',
  '',
  '| 玩家 | 平均分 | 平均存活 | 撐完（含擊倒 Boss） | 擊倒 Boss | 有進化 |',
  '|---|---|---|---|---|---|',
  ...Object.entries(summary).map(([k, v]) => `| ${{ casual: '新手', regular: '一般', skilled: '熟手' }[k]} | ${Math.round(v.score)} | ${Math.round(v.end)} s | ${v.full}/${N} | ${v.boss}/${N} | ${v.evo}/${N} |`),
  '',
  '## 段落',
  '',
  '| 段落 | 主段落 | DI 平均 / 高峰 | 守線率 新手 · 一般 · 熟手 |',
  '|---|---|---|---|',
  ...curve.sec.map(s => `| ${s.name} | ${s.main ? '✓' : ''} | ${s.di.toFixed(2)} / ${s.peak.toFixed(2)} | ${pct(s.hit.casual)} · ${pct(s.hit.regular)} · ${pct(s.hit.skilled)} |`),
  '',
  '## 單位（事件）',
  '',
  '| 時間 | 事件 | 章 | DI | 守線率 新手 · 一般 · 熟手 |',
  '|---|---|---|---|---|',
  ...units.map(u => `| ${Math.round(u.t)} s | ${u.name} | ${sections[u.section].name} | ${u.di.toFixed(2)} | ${pct(u.hit.casual)} · ${pct(u.hit.regular)} · ${pct(u.hit.skilled)} |`),
  '',
  '## 10 秒切片（參考，不進檢查）',
  '',
  '| 時間 | 段落 | DI | 守線率 新手 · 一般 · 熟手 | 撐到此處 新手 · 一般 · 熟手 |',
  '|---|---|---|---|---|',
  ...slices.map(u => `| ${u.name} | ${sections[u.section].name} | ${u.di.toFixed(2)} | ${pct(u.hit.casual)} · ${pct(u.hit.regular)} · ${pct(u.hit.skilled)} | ${pct(u.reach.casual)} · ${pct(u.reach.regular)} · ${pct(u.reach.skilled)} |`),
  '',
  `曲線擬合（主段落，逐段）：DI ≈ ${curve.fit.icpt.toFixed(2)} + ${curve.fit.slope.toFixed(3)} × 秒，R² ${curve.fit.r2.toFixed(2)}，Spearman ρ ${curve.fit.rho.toFixed(2)}。`,
  '',
].join('\n');

if (outIdx >= 0) { mkdirSync(dirname(args[outIdx + 1]), { recursive: true }); writeFileSync(args[outIdx + 1], md, 'utf8'); }
console.log(md);
process.exitCode = checks.every(c => c.ok !== false) ? 0 : 1;
