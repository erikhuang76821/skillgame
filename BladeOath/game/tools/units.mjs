// How one match is cut into sections and units and measured. Shared by the bot playtest (tools/playtest.mjs) and the
// human playtest report (tools/human-report.mjs), so people and bots are profiled by exactly the same code.
//   unit      = an encounter: two or three spawn slots that meet the player together, in route order (UNITS below)
//   target    = an enemy swing that starts while the player is within its reach (a wind-up that threatens)
//   hit rate  = share of those swings the player came through without a clean hit (parried, blocked, dodged, stepped out)
import { GAME, STAGES, layout, foeMove, createSim, step, choose, phase } from '../src/sim/sim.js';

// One unit per wave on the route the bots take (gate → forest → hall → cloister → terrace); slot indices are the
// layout's (the seed changes only which foe stands on a slot, not the slots).
const ROUTE = [0, 1, 3, 4, 5];
export const SECTIONS = [
  { name: '山門', main: true }, { name: '蠱林', main: true }, { name: '蠱母（精英）', main: false },
  { name: '屍傀將（中頭目）', main: false }, { name: '殿後迴廊', main: true }, { name: '墮仙（終頭目）', main: false },
];
const PLAN = layout(0);
export const UNITS = [];
for (const si of ROUTE) STAGES[si].waves.forEach((w, wi) => {
  const section = si === 0 ? 0 : si === 1 ? (w.unique ? 2 : 1) : si === 3 ? 3 : si === 4 ? 4 : 5;
  const wave = Math.min(...PLAN.filter(x => x.stage === si).map(x => x.wave)) + wi;
  UNITS.push({ section, slots: PLAN.map((x, i) => (x.stage === si && x.wave === wave ? i : -1)).filter(i => i >= 0) });
});
const unitOfSlot = new Map(UNITS.flatMap((u, k) => u.slots.map(s => [s, k])));

/**
 * Play one match and measure it.
 * @param input  (sim, t) => input byte for step t     @param pick  (sim, c) => index for choice c
 */
export function profileMatch(seed, input, pick) {
  const sim = createSim(seed), swings = [], open = new Map(), first = new Map(), downs = [];
  let t = 0, c = 0;
  while (phase(sim) !== 'over') {
    if (phase(sim) === 'choice') { if (choose(sim, pick(sim, c++)) !== true) throw new Error(`invalid choice ${c - 1}`); continue; }
    step(sim, input(sim, t++));
    for (const e of sim.events) {
      if (e.type === 'windup') {
        const f = sim.foes[e.id], m = foeMove(f);
        const near = !!m && Math.abs(f.y - sim.p.y) <= 24 * 256 && Math.abs(f.x - sim.p.x) <= (m.len + m.lunge + 24) * 256;
        if (near && unitOfSlot.has(f.slot)) {
          const r = { unit: unitOfSlot.get(f.slot), tick: sim.tick, fail: false };
          swings.push(r); open.set(e.id, r);
          if (!first.has(r.unit)) first.set(r.unit, sim.tick);
        } else open.delete(e.id);
      } else if (e.type === 'hurt' && open.has(e.by)) open.get(e.by).fail = true;
      else if (e.type === 'down') downs.push(sim.tick);
    }
  }
  const lastUnit = Math.max(-1, ...first.keys());
  return { swings, first, ticks: sim.tick, down: downs.length ? downs[0] : -1, downs, deaths: sim.deaths,
    cleared: (sim.bossDown & 2) !== 0, bossDown: sim.bossDown, score: GAME.score(sim), reached: lastUnit };
}

/** Hit rate per unit (NaN where the match had no threatening swing in that unit). */
export const unitRates = p => UNITS.map((_, k) => { const sw = p.swings.filter(x => x.unit === k); return sw.length ? sw.filter(x => !x.fail).length / sw.length : NaN; });
/** Hit rate per section, pooled over its units' swings. */
export const sectionRates = p => SECTIONS.map((_, s) => { const sw = p.swings.filter(x => UNITS[x.unit].section === s); return sw.length ? sw.filter(x => !x.fail).length / sw.length : NaN; });
