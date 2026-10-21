// Skill-tier bots for TwinStrike (spec §9). Rules: send only bytes a human could send, read only what is on
// screen (an enemy is visible from visibleTick(note)), stay deterministic (hash32, never Math.random).
import { hash32 } from '../src/sim/core/index.js';
import { msToSub } from '../src/sim/core/timing.js';
import { SUB, KIND, IN_L, IN_R, encode, visibleTick } from '../src/sim/sim.js';

const bell = (seed, salt, i) => {                        // sum of 4 uniforms -> ~normal, sd ≈ 0.58
  let s = 0;
  for (let k = 0; k < 4; k++) s += (hash32(seed, salt + k, i) / 4294967296) * 2 - 1;
  return s / 2;
};
const pct = (seed, salt, i, permille) => hash32(seed, salt, i) % 1000 < permille;

/**
 * @param sdMs        timing error (sd) vs. the note's arrival
 * @param runnerMul   error multiplier on runners (short telegraph = harder read)
 * @param reactMs     earliest tap after the enemy appears
 * @param missPm      ‰ of notes not tapped at all
 * @param wrongPm     ‰ of notes tapped on the wrong side
 * @param rushPm      ‰ of notes tapped 150–250 ms early (impatience -> whiff + stagger)
 */
function strikeBot(salt, { sdMs, runnerMul, reactMs, missPm, wrongPm, rushPm }) {
  const react = Math.round((reactMs * 60) / 1000);
  return {
    input(sim) {
      const from = sim.tick * SUB, to = from + SUB, { chart, judge } = sim;
      for (let i = judge.next; i < chart.length && chart[i].t < to + msToSub(400); i++) {
        const n = chart[i];
        if (judge.grade[i] >= 0 || sim.tick < visibleTick(n) + react) continue;
        if (pct(sim.seed, salt + 9, i, missPm)) continue;
        const sd = msToSub(sdMs * (n.kind === KIND.RUNNER ? runnerMul : 1)) / 0.58;
        let at = n.t + Math.round(bell(sim.seed, salt, i) * sd);
        if (pct(sim.seed, salt + 7, i, rushPm)) at = n.t - msToSub(150 + (hash32(sim.seed, salt + 6, i) % 101));
        if (at < from || at >= to) continue;
        const lane = n.lane ^ (pct(sim.seed, salt + 8, i, wrongPm) ? 1 : 0);
        return encode(lane ? IN_R : IN_L, at - from);
      }
      return 0;
    },
  };
}

export const BOTS = {
  novice: strikeBot(100, { sdMs: 75, runnerMul: 1.5, reactMs: 280, missPm: 40, wrongPm: 30, rushPm: 30 }),
  intermediate: strikeBot(200, { sdMs: 38, runnerMul: 1.25, reactMs: 200, missPm: 10, wrongPm: 8, rushPm: 8 }),
  expert: strikeBot(300, { sdMs: 16, runnerMul: 1.1, reactMs: 160, missPm: 2, wrongPm: 1, rushPm: 0 }),
};
