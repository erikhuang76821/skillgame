// Scripted players for the demo game, one per skill tier. Replace with bots for your game (spec §9).
// Rules for bots: emit only the input bytes a human could send, read only what a human could see
// (here: when the next beat opens — the on-screen cue), and stay deterministic (hash32, not Math.random).
import { hash32 } from '../src/sim/core/index.js';
import { IN_TAP, RULES } from '../src/sim/sim.js';

// Timing error per beat, uniform in [-spread/2, +spread/2] ticks around the window centre.
// `spam` = chance per tick of a nervous extra tap (models button mashing).
function timingBot(salt, spread, spam) {
  return {
    input(sim) {
      const centre = sim.nextBeat + (RULES.window >> 1);
      const err = (hash32(sim.seed, salt, sim.beat) % (spread + 1)) - (spread >> 1);
      if (sim.tick === centre + err) return IN_TAP;
      return spam && hash32(sim.seed, salt + 1, sim.tick) % 1000 < spam ? IN_TAP : 0;
    },
  };
}

export const BOTS = {
  novice: timingBot(101, 40, 8),        // ±20 ticks, mashes
  intermediate: timingBot(202, 16, 0),  // ±8 ticks
  expert: timingBot(303, 10, 0),        // ±5 ticks
};
