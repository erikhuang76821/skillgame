import { playMatch } from '../src/sim/core/index.js';
import { GAME } from '../src/sim/sim.js';
import { BOTS } from './bots.mjs';
const seeds = [1, 2, 3, 4, 5, 6];
for (const t of Object.keys(BOTS)) {
  const t0 = performance.now();
  const rows = seeds.map(s => { const r = playMatch(GAME, s, BOTS[t]); return { s: r.sim.score, sec: (r.ticks/60)|0, tr: r.sim.troops, w: r.sim.weapon, boss: r.sim.boss.hp, ...GAME.scoreBreakdown(r.sim) }; });
  console.log(t, ((performance.now()-t0)/seeds.length).toFixed(0)+'ms/match');
  for (const r of rows) console.log('  ', JSON.stringify(r));
}
