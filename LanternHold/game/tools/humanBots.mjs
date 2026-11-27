// Human-factor playtest bots for LanternHold (knowledge-base/16 §4). The skill-tier bots in bots.mjs ask "how much
// skill does the game reward?"; these ask "where do people struggle?". Same planner, same screen-only inputs, plus
// the reasons real players slip: they notice a warning late, look away now and then, and sometimes grab a card
// without reading it. Deterministic (seeded per tick / per pick).
import { makePlanner, BASE } from './bots.mjs';

export const HUMANS = {
  // first-time player: one barracks, buys archers, does place soldiers but rarely re-deploys, reads few cards
  casual: makePlanner('casual', { ...BASE, deploy: true, walls: true, workers: 1, barracks: 2, notice: 240, lapsePm: 250, pickSlipPm: 500, picker: 'owned', think: 60, jitter: 40, perThink: 1 }),
  // regular: knows the loop, walls the warned side, follows evolution hints, reacts a bit late
  regular: makePlanner('regular', { ...BASE, towers: 2, mix: true, deploy: true, walls: true, wallAll: true, workers: 3, wallUp: true, react: 'squad', squad: 3, barracks: 3, notice: 120, lapsePm: 120, pickSlipPm: 200, picker: 'planned', think: 40, jitter: 30, perThink: 2 }),
  // skilled: plans the build, reacts on the warning, rarely misses a beat
  skilled: makePlanner('skilled', { ...BASE, towers: 4, branchOrder: [1, 0, 2, 3], mix: true, deploy: true, walls: true, wallAll: true, workers: 4, wallUp: true, react: 'squad', squad: 5, barracks: 4, notice: 30, lapsePm: 30, pickSlipPm: 30, picker: 'planned', think: 25, jitter: 15, perThink: 3 }),
};
