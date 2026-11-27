// Data-driven content (gdd/04). Visual fields live under `visual` so balance review can ignore them.
import { hash32 } from './rng.js';

// Portrait arena (gdd/10: portrait-only). Every device sees the same 720x1280 world window.
export const ARENA = { w: 1440, h: 2560 };
export const VIEW_WORLD = { w: 720, h: 1280 };

export const TUNING = {
  hp: 100, speed: 120, magnet: 48, pickup: 14, playerR: 10, invulnTicks: 30,
  dashTicks: 15, dashInvuln: 12, dashCd: 100, dashMul: 3,
  howlCost: 100, howlR: 160, howlDmg: 40, howlComboGate: 50,
  grazeMargin: 8, grazePts: 40, grazeHowl: 3, spawnR: 780, bossR: 760,
  enemyCap: 300, orbCap: 400, hotdogEvery: 150, hotdogHeal: 30,
  survivalBonus: 300, // no per-second points: surviving pays by giving more time to score (gdd/03 R9)
};

export const ENEMIES = {
  greyling:     { hp: 10,   atk: 5,  speed: 60,  pts: 1,   r: 9,  behavior: 'chase', visual: { sprite: 'greyling', scale: 2,   tint: 0xffffff } },
  probe:        { hp: 6,    atk: 4,  speed: 80,  pts: 2,   r: 7,  behavior: 'dash',  visual: { sprite: 'greyling', scale: 1.5, tint: 0x9fd8ff } },
  hulk:         { hp: 80,   atk: 15, speed: 35,  pts: 5,   r: 16, behavior: 'chase', visual: { sprite: 'greyling', scale: 3,   tint: 0xc0a8ff } },
  saucer_scout: { hp: 600,  atk: 20, speed: 50,  pts: 100, r: 28, behavior: 'chase', boss: true, visual: { sprite: 'greyling', scale: 5, tint: 0xffd36b } },
  mother_probe: { hp: 900,  atk: 25, speed: 45,  pts: 300, r: 34, behavior: 'chase', boss: true, visual: { sprite: 'greyling', scale: 6, tint: 0xff8080 } },
};

// rate = spawns per second, interpolated from rate[0] at t0 to rate[1] at t1 (seconds).
export const WAVES = [
  { t0: 0,   t1: 30,  rate: [1, 2],       kinds: { greyling: 1 } },
  { t0: 30,  t1: 60,  rate: [2, 2.5],     kinds: { greyling: 5, probe: 1 } },
  { t0: 60,  t1: 90,  rate: [2.5, 3],     kinds: { greyling: 6, probe: 1, hulk: 1 } },
  { t0: 90,  t1: 120, rate: [3, 3.5],     kinds: { greyling: 6, probe: 1, hulk: 1 } },
  { t0: 120, t1: 150, rate: [3.5, 3.75],  kinds: { greyling: 5, probe: 2, hulk: 1 } },
  { t0: 150, t1: 180, rate: [3.75, 4.25], kinds: { greyling: 9, probe: 2, hulk: 1 } },
];

export const EVENTS = [
  { at: 115, type: 'ring', enemy: 'greyling', count: 18, radius: 420 },
  { at: 120, type: 'boss', enemy: 'saucer_scout' },
  { at: 160, type: 'boss', enemy: 'mother_probe' },
  { at: 170, type: 'beams', every: 150, warn: 60, live: 12, radius: 40, dmg: 20 },
];

export const UPGRADES = {
  pinecone:   { type: 'weapon',  max: 5 },
  campfire:   { type: 'weapon',  max: 5 },
  static_fur: { type: 'weapon',  max: 5 },
  p_speed:    { type: 'passive', max: 5 },
  p_might:    { type: 'passive', max: 5 },
  p_magnet:   { type: 'passive', max: 5 },
  p_cooldown: { type: 'passive', max: 5 },
  p_hp:       { type: 'passive', max: 5 },
};
export const FALLBACK = ['snack', 'bounty'];
export const SLOTS = { weapon: 4, passive: 4 };

export const WEAPONS = {
  pinecone:   { cd: 20, shots: [1, 1, 2, 2, 3], dmg: [10, 13, 13, 16, 16], speed: 300, life: 90, r: 4 },
  campfire:   { radius: 70, spin: 3, hitCd: 20, dmg: [7, 8, 9, 10, 11] },
  static_fur: { cd: 30, radius: [72, 84, 96, 108, 120], dmg: [4, 5, 6, 7, 8] },
};

// Fixed map layout (same for every seed): solid pines inside the arena, away from the start point.
export const TREES = [];
for (let i = 0; TREES.length < 18 && i < 400; i++) {
  const x = 120 + (hash32(0x7ee, 6, i * 2) % (ARENA.w - 240));
  const y = 140 + (hash32(0x7ee, 6, i * 2 + 1) % (ARENA.h - 240));
  const far = (x - ARENA.w / 2) ** 2 + (y - ARENA.h / 2) ** 2 > 320 ** 2;
  const spaced = TREES.every(t => (t.x - x) ** 2 + (t.y - y) ** 2 > 220 ** 2);
  if (far && spaced) TREES.push({ x, y, r: 12 });
}
