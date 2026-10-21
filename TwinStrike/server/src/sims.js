// The only place the server touches game code: the SAME sim files the client ships (no copy, no fork),
// keyed by GAME.version. A day's board is pinned to one version (docs/backend_design.md §4), so before the
// game bumps GAME.version, freeze the old sim folder into server/sims/v<N>/ and add it here; otherwise days
// already issued with the old version can no longer be verified (startup fails fast in app.js).
import * as current from '../../game/src/sim/sim.js';
import * as currentCore from '../../game/src/sim/core/index.js';
import * as currentInput from '../../game/src/sim/core/input.js';

const entry = (sim, core, input) => Object.freeze({
  ...sim,                                   // GAME, createSim, step, phase, maxScore, scoreBreakdown, SUB, IN_L, IN_R …
  verify: core.verify,
  decodeLog: core.decodeLog,
  TICK_MS: core.TICK_MS,
  macroSuspicion: input.macroSuspicion,
  errorSuspicion: input.errorSuspicion,
});

export const GAME_ID = current.GAME.id;
export const CURRENT_VERSION = current.GAME.version;
export const SIMS = new Map([
  [current.GAME.version, entry(current, currentCore, currentInput)],
  // [5, entry(v5, v5Core, v5Input)],      // e.g. after the client moves to v6: import * as v5 from '../sims/v5/sim.js'
]);
