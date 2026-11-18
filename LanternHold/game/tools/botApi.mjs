// What bots may read: the sim's public constants and helpers (the same facts the player sees on screen).
export { ONE, COS, SIN } from '../src/sim/core/index.js';
export {
  OP, encode, cellOf, CX, CY, PREWARN_TICKS, SLOTS, WALL_SEGS, WALL, UNIT, UNIT_KINDS, BARRACKS, barracksCost, CASTLE, WORKER_MAX, workerCount, EVENT_CLEAR_TICKS,
  popCap, pop, canPlace, segOf, wallMaxHp, CARDS, EVOS, SYNERGY, CHOICE, tagCount, CARD_MAX,
} from '../src/sim/sim.js';
