// Human-factor playtest bots for BladeOath (knowledge-base/16 §3). They model WHY people get hit in a reading duel:
//   reaction   a wind-up cannot be answered before the player has seen it (ticks after it starts)
//   timing     a parry or a dodge lands early or late (a bell-shaped error, in ticks)
//   greed      it swings without waiting for an opening and gets caught in its own recovery
//   misread    the glow is read wrong (white taken for gold, …), more often for a glow met only a few times (learning)
// Same rules as every bot: only bytes a player could send, only what is on screen, deterministic (hash32, no Math.random).
// Parameters follow knowledge-base/16 §3.1 (novice σ ≈ 58 ms / reaction 320 ms, regular 34 / 250, skilled 20 / 200);
// recalibrate with real playtest data (N9).
import { hash32, TPS } from '../src/sim/core/index.js';
import { fighterPolicy, perMatch, PLAIN_NODES } from './strategies.mjs';

const MS = 1000 / TPS;
const bell = (seed, salt, i) => { let s = 0; for (let k = 0; k < 4; k++) s += (hash32(seed, salt + k, i) / 4294967296) * 2 - 1; return s / 2 / 0.58; };
const roll = (seed, salt, i) => hash32(seed, salt, i) / 4294967296;

function human({ sigmaMs, reactionMs, misreadStart, misreadFloor, learnAfter, greed }) {
  return perMatch(() => fighterPolicy({
    reaction: Math.round(reactionMs / MS),
    timing: (sim, salt, k) => Math.round(bell(sim.seed, salt * 31, k) * (sigmaMs / MS)),
    // Misreads fall from misreadStart to misreadFloor over the first `learnAfter` wind-ups of a glow.
    misread: (sim, k, seen) => roll(sim.seed, 977, k) < misreadFloor + (misreadStart - misreadFloor) * Math.max(0, 1 - seen / learnAfter),
    greed: (sim, k) => roll(sim.seed, 919, k) < greed,
    nodes: PLAIN_NODES,
  }));
}

export const HUMANS = {
  casual: human({ sigmaMs: 58, reactionMs: 320, misreadStart: 0.3, misreadFloor: 0.08, learnAfter: 6, greed: 0.4 }),
  regular: human({ sigmaMs: 34, reactionMs: 250, misreadStart: 0.15, misreadFloor: 0.03, learnAfter: 6, greed: 0.15 }),
  skilled: human({ sigmaMs: 20, reactionMs: 200, misreadStart: 0.05, misreadFloor: 0.01, learnAfter: 6, greed: 0.05 }),
};
