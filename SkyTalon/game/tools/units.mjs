// One match cut into the script's 4-second units: what entered in each unit, how much of it was shot down, and how
// the match went. Shared by the bot playtest (tools/playtest.mjs) and the human playtest report
// (tools/human-report.mjs), so people and bots are measured by exactly the same code.
import { TPS } from '../src/sim/core/index.js';
import { createSim, step, phase, choose, clock, SCRIPT, UNIT_TICKS, MATCH_TICKS } from '../src/sim/sim.js';

export const UNIT_S = UNIT_TICKS / TPS;
export const UNITS = MATCH_TICKS / UNIT_TICKS;
export const sectionOfUnit = k => { let s = 0; while (s + 1 < SCRIPT.length && k >= SCRIPT[s + 1].from) s++; return s; };
/** Sections whose kill rate is checked against the curve rules: not warm-up, breather or boss. */
export const MAIN_SECTIONS = SCRIPT.map((s, k) => k).filter(k => !SCRIPT[k].safe && !SCRIPT[k].boss && !SCRIPT[k].boost);

/**
 * Play one match and profile it.
 * @param seed     the question
 * @param inputAt  sim => input byte for this tick (a strategy's input(), or a recorded log read by tick)
 * @param pickAt   sim => 0-2, the card slot taken at each choice (a strategy's pick(), or the recorded choices)
 * @param create   seed => sim: another leg's createSim (v11); leg one's by default
 * @param counts   plan entry => whether it counts as a target (a leg's bonus creatures do not)
 * @returns { spawned[k], killed[k], reached[k] (alive when script unit k began; boss units skipped by an early kill are
 *           not reached), bossDown (all three), bossKills, chapter, survived, hits, grazes, score, ticks, gear, pickups }
 */
export function profileMatch(seed, inputAt, pickAt = () => 0, create = createSim, counts = () => true) {
  const sim = create(seed), spawned = Array(UNITS).fill(0), killed = Array(UNITS).fill(0), reached = Array(UNITS).fill(false);
  const unitOf = new Map();                                // enemy id -> script unit, for the enemies of the spawn list
  const unitOfId = id => unitOf.get(id) ?? -1;             // mines, shards and bosses are not on the list
  for (const s of sim.plan) if (counts(s)) spawned[Math.floor(s.at / UNIT_TICKS)]++;
  let alive = new Map();
  while (phase(sim) !== 'over') {
    if (phase(sim) === 'choice') { if (!choose(sim, pickAt(sim))) throw new Error(`invalid card choice at tick ${sim.tick}`); continue; }
    if (clock(sim) % UNIT_TICKS === 0) reached[clock(sim) / UNIT_TICKS] = true;
    const id0 = sim.nextId, s0 = sim.nextSpawn;
    step(sim, inputAt(sim));
    for (let j = s0; j < sim.nextSpawn; j++) if (counts(sim.plan[j])) unitOf.set(id0 + j - s0, Math.floor(sim.plan[j].at / UNIT_TICKS));   // listed spawns come first in a step
    const now = new Map(sim.enemies.map(e => [e.id, e]));
    for (const [id, e] of alive) if (!now.has(id) && e.hp <= 0) { const u = unitOfId(id); if (u >= 0) killed[u]++; }
    alive = now;
  }
  return { spawned, killed, reached, bossDown: sim.won === 1, bossKills: sim.bossKills, chapter: sim.chapter, survived: sim.shields > 0, hits: sim.hits, grazes: sim.grazes, score: sim.score, ticks: sim.tick, gear: sim.gear.slice(), pickups: sim.pickups };
}

/** Kill rate per section for one profile: enemies shot down / entered, over the units that were reached (NaN if none). */
export function sectionRates(p) {
  return SCRIPT.map((s, k) => {
    let sp = 0, kl = 0;
    for (let u = 0; u < UNITS; u++) if (sectionOfUnit(u) === k && p.reached[u]) { sp += p.spawned[u]; kl += p.killed[u]; }
    return sp ? kl / sp : NaN;
  });
}
