// Human-factor playtest bots for SkyTalon (knowledge-base/16 §3). They model WHY people lose enemies or get hit:
// reaction time (a decision only every `replan` ticks), aim error (where they think the target is), a short look-ahead
// (bullets are noticed late), lapses (a decision skipped) and late-match fatigue (more aim error after a minute).
// tools/playtest.mjs uses them to check the scripted difficulty curve.
// Same rules as every strategy: only bytes a human could send, only what is on screen, deterministic.
// The numbers are starting values (reaction 320 / 250 / 200 ms from knowledge-base/16 §3.1); recalibrate with human data (N9).
import { TPS } from '../src/sim/core/index.js';
import { PLAYER_START_Y, RAPID, SPREAD, PIERCE, HEAVY, LASER, WINGMAN, BARRIER, THRUSTERS } from '../src/sim/sim.js';
import { makePilot, pickBy } from './strategies.mjs';

const FATIGUE_FROM = 60 * TPS;

/** @param p makePilot() parameters plus { fatigueK: extra aim error after a minute, as a fraction; cards: the order in
 *  which this person wants the gear (see pickBy in strategies.mjs), loot: goes for drops } */
export function makeHumanBot(p) {
  const fresh = makePilot({ loot: true, ...p, homeY: PLAYER_START_Y, dodge: true });
  const tired = makePilot({ loot: true, ...p, salt: p.salt + 50, homeY: PLAYER_START_Y, dodge: true, aimNoise: p.aimNoise * (1 + p.fatigueK) });
  return { input: sim => (sim.tick < FATIGUE_FROM ? fresh : tired).input(sim), pick: pickBy(p.gear) };
}

// Three people, not three skill levels of the same machine: a first-time casual player, a regular, a skilled player.
// How they take cards (v2): the casual player wants firepower and then not to die; the regular mixes firepower with
// shields; the skilled player takes the scoring cards that pay for flying well.
export const HUMANS = {
  casual: makeHumanBot({ salt: 1100, replan: 19, horizon: 30, margin: 2, grazeW: 0, aimNoise: 34, lapsePm: 60, fatigueK: 0.3, gear: [LASER, WINGMAN, SPREAD, RAPID, BARRIER, PIERCE, HEAVY, THRUSTERS] }),
  regular: makeHumanBot({ salt: 1200, replan: 15, horizon: 36, margin: 4, grazeW: 0, aimNoise: 20, lapsePm: 20, fatigueK: 0.15, gear: [RAPID, BARRIER, SPREAD, LASER, WINGMAN, PIERCE, HEAVY, THRUSTERS] }),
  skilled: makeHumanBot({ salt: 1300, replan: 12, horizon: 42, margin: 5, grazeW: 6, aimNoise: 10, lapsePm: 5, fatigueK: 0.05, gear: [RAPID, BARRIER, SPREAD, PIERCE, HEAVY, THRUSTERS, LASER, WINGMAN] }),
};
