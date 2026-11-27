// Card offer stats: share of offered cards by type, and share of offers with 2+ cards of one type.
// Usage: node tools/offer-stats.mjs [seeds=20] [bot=expert]
import { Recorder } from '../src/sim/core/index.js';
import { GAME, CARDS } from '../src/sim/sim.js';
import { BOTS } from './bots.mjs';
const N = Number(process.argv[2] ?? 20), bot = BOTS[process.argv[3] ?? 'expert'];
const byType = {}; let cards = 0, offers = 0, dup = 0;
for (let seed = 1; seed <= N; seed++) {
  const rec = new Recorder(GAME, seed);
  for (let t = 0; t < GAME.maxTicks && rec.phase !== 'over'; t++) {
    if (rec.phase === 'choice') { rec.choose(bot.pick(rec.sim)); continue; }
    rec.step(bot.input(rec.sim));
    for (const e of rec.sim.events) if (e.type === 'offer') {
      offers++;
      const types = e.ids.map(id => CARDS[id]?.type ?? id);
      if (new Set(types).size < types.length) dup++;
      for (const ty of types) { byType[ty] = (byType[ty] ?? 0) + 1; cards++; }
    }
  }
}
console.log(`offers ${offers}, offers with a repeated type ${(dup / offers * 100).toFixed(0)}%`);
for (const [ty, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) console.log(`${ty.padEnd(10)} ${(n / cards * 100).toFixed(1)}%`);
