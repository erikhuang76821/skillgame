// Playtest stats across seeds: troops per section, damage causes, boss timing, idle stretches.
import { hash32, Recorder, TPS } from '../src/sim/core/index.js';
import { GAME, CURVE } from '../src/sim/sim.js';
import { BOTS } from './bots.mjs';
const N = Number(process.argv[2]) || 20;
for (const tier of Object.keys(BOTS)) {
  const agg = { win: 0, troopsAt: Array(CURVE.segments.length).fill(0), cause: {}, bossSecs: [], deathSec: [], capHit: 0, idle: 0, pumped: 0, gatesNeg: 0 };
  for (let i = 0; i < N; i++) {
    const rec = new Recorder(GAME, hash32(2026, 7, i));
    let lastKillTick = 0, bossStart = 0, longestIdle = 0;
    while (rec.phase !== 'over') {
      rec.step(BOTS[tier].input(rec.sim));
      const s = rec.sim;
      for (const e of s.events) {
        if (e.type === 'hurt') agg.cause[e.cause] = (agg.cause[e.cause] || 0) + e.n;
        if (e.type === 'kill' || e.type === 'gate' || e.type === 'barrel') { longestIdle = Math.max(longestIdle, s.tick - lastKillTick); lastKillTick = s.tick; }
        if (e.type === 'boss') bossStart = s.tick;
        if (e.type === 'gate' && e.after < e.before) agg.gatesNeg++;
      }
      const sec = CURVE.segments.findIndex((g, gi) => CURVE.units.find(u => u.seg === gi).from === s.dist);
      if (sec >= 0) agg.troopsAt[sec] += s.troops / N;
      if (s.troops >= 999) agg.capHit += 1 / N / 60;
    }
    const s = rec.sim;
    if (s.result === 1) { agg.win++; agg.bossSecs.push(((s.tick - bossStart) / TPS).toFixed(1)); }
    else agg.deathSec.push((s.tick / TPS) | 0);
    agg.idle += longestIdle / TPS / N;
    agg.pumped += s.gatesPumped / N;
  }
  console.log(`\n## ${tier}: win ${agg.win}/${N}`);
  console.log('troops at segment start:', agg.troopsAt.map(v => v | 0).join(' / '));
  console.log('troops lost by cause (total):', JSON.stringify(agg.cause));
  console.log('boss kill secs:', agg.bossSecs.join(' '));
  console.log('death at sec:', agg.deathSec.join(' '));
  console.log('avg secs at troop cap:', agg.capHit.toFixed(1), ' longest idle stretch (avg s):', agg.idle.toFixed(1), ' gate pumps/run:', agg.pumped | 0, ' bad gates taken:', agg.gatesNeg);
}
