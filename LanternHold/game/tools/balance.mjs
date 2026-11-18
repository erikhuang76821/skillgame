// Balance probe: run every bot and baseline on N seeds and print survival, score, boss kills, evolutions and
// where the castle took its damage. Usage: node tools/balance.mjs [seeds=12] [botName]
import { Recorder, TPS } from '../src/sim/core/index.js';
import { GAME, EVENTS, EVOS } from '../src/sim/sim.js';
import { BOTS, BASELINES } from './bots.mjs';

const N = Number(process.argv[2] ?? 12), only = process.argv[3];
const all = { ...BOTS, ...BASELINES };
const evName = t => { let n = '開局'; for (const e of EVENTS) if (t >= e.at) n = e.name; return n; };

for (const [name, p] of Object.entries(all)) {
  if (only && !name.includes(only)) continue;
  const rows = [];
  for (let seed = 1; seed <= N; seed++) {
    const rec = new Recorder(GAME, seed);
    let firstEvo = 0, hurtAt = {};
    while (rec.phase !== 'over') {
      if (rec.phase === 'choice') { rec.choose(p.pick(rec.sim)); continue; }
      const before = rec.sim.castle.hp;
      rec.step(p.input(rec.sim));
      const s = rec.sim, lost = before - s.castle.hp;
      if (lost > 0) { const k = evName(s.tick); hurtAt[k] = (hurtAt[k] ?? 0) + lost; }
      if (!firstEvo && Object.values(s.evo).some(Boolean)) firstEvo = s.tick;
    }
    const s = rec.sim;
    rows.push({ seed, score: GAME.score(s), t: Math.round(s.tick / TPS), boss: s.bossDead, lv: s.level, evo: Object.keys(EVOS).filter(e => s.evo[e]).length, firstEvo: Math.round(firstEvo / TPS), hurtAt, units: s.units.filter(u => u.alive).length, kills: s.kills, events: s.eventState.filter(e => e.cleared).length });
  }
  const avg = k => Math.round(rows.reduce((a, r) => a + r[k], 0) / rows.length);
  const full = rows.filter(r => r.t >= 270 || r.boss).length;
  const hurt = {};
  for (const r of rows) for (const [k, v] of Object.entries(r.hurtAt)) hurt[k] = (hurt[k] ?? 0) + v;
  const top = Object.entries(hurt).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${Math.round(v / rows.length)}`).join('、');
  const evoAt = rows.filter(r => r.firstEvo).map(r => r.firstEvo);
  console.log(`${name.padEnd(42)} 分 ${String(avg('score')).padStart(4)}（${Math.min(...rows.map(r => r.score))}–${Math.max(...rows.map(r => r.score))}）  存活 ${String(avg('t')).padStart(3)} s  撐完 ${full}/${N}  Boss ${rows.filter(r => r.boss).length}  進化 ${rows.filter(r => r.evo).length}/${N}${evoAt.length ? `（首次 ${Math.min(...evoAt)}–${Math.max(...evoAt)} s）` : ''}  兵 ${avg('units')}  事件 ${avg('events')}`);
  console.log(`${''.padEnd(42)} 主城失血最多：${top || '—'}`);
}
