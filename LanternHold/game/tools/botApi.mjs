// What bots may read: the sim's public constants and helpers (the same facts the player sees on screen).
export { ONE, COS, SIN } from '../src/sim/core/index.js';
export {
  OP, encode, cellOf, CX, CY, PREWARN_TICKS, SLOTS, WALL_SEGS, WALL_R, WALL, WALL_SIDES, sideOf, sideSegs, sideUpgradeTo, sideUpgradeCost, UNIT, UNIT_KINDS, BARRACKS, barracksCost, CASTLE, WORKER_MAX, workerCount, workerCost, INNER, TOWER, EVENT_CLEAR_TICKS,
  popCap, pop, canPlace, segOf, wallMaxHp, CARDS, EVOS, CHOICE, CARD_MAX,
} from '../src/sim/sim.js';
