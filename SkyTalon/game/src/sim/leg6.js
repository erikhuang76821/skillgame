// Leg six, "the lost Mesozoic" (gdd/05 「第十一版」, design in gdd/12). A second leg of the same game: it runs on the
// engine in sim.js and supplies only what differs: its kinds, its schedule, its hazards, its bosses. sim.js never
// imports this file, so nothing here can change leg one.
//
// Four chapters, each with four creatures of its own, one thing the place does, a mid-boss and a boss:
//   1 Triassic rift      eudimorphodon, coelophysis pack, herrerasaurus, peteinosaurus   volcanic bombs     postosuchus -> plateosaurus
//   2 Jurassic forest    stegosaurus, ornitholestes, dilophosaurus, rhamphorhynchus      trees, the sweep   allosaurus  -> diplodocus
//   3 Cretaceous seaway  pteranodon, elasmosaurus, archelon, ichthyornis                 crosswind          quetzalcoatlus -> mosasaurus
//   4 the end            triceratops, ankylosaurus, dromaeosaurus, pachycephalosaurus    meteors            spinosaurus -> tyrannosaurus
// A chapter's creatures keep coming in the chapters after it.
// The creatures have been changed by the fragments scattered among them: besides diving and charging they breathe
// red fire and spit black-violet venom from a distance (a bullet's `c`: 1 fire, 2 venom; the picture only). The
// bosses, which carry a fragment each, do what no animal can. A boss's fragment is its weak point: closed, a hit
// counts for L6_CLOSED_PCT; it opens while the boss uses its borrowed attack.
//
// Deterministic and pure: integers only, no DOM, no clock, no Math.random. Positions are sub-pixels (ONE per px).

import { makeRng, ONE, SIN, COS, angleOf } from './core/index.js';
import {
  ENGINE, KIND, registerKinds, createSim, step, phase, choose, score, stateHash, scoreBreakdown,
  SCRIPT, sectionAt, clock, UNIT_TICKS, WORLD_W, WORLD_H, LANES, LANE_X0, LANE_STEP, DROP_CHANCE, SUPPLIES, MAX_TICKS,
  CHARGE_HOLD, CHARGE_PERIOD, RAY_ON, WALL_TELEGRAPH, BEAM_TELEGRAPH, BEAM_W, isMid, isBoss,
  PEAK, METEOR, METEOR_VY, OBST_R, OBST_HP, PLAYER_MARGIN_X, SHOT_R,
} from './sim.js';

const { fire, ring, emit, px, near, chargeUp, aimed3, spiral, dropKind } = ENGINE;
// streams 1, 2, 6, 7 mean what they mean in leg one; 14 and up are this leg's (gdd/05 v11 §8)
const rng = makeRng({ lane: 1, order: 2, drop: 6, dropKind: 7, bomb: 14, tree: 15, pack: 16, ambush: 17, neck: 18, well: 19, meteor: 20 });
export const FIRE = 1, VENOM = 2;                             // what a creature's bullet is made of (the picture only)

// ---------- kinds ----------
const FIRST = registerKinds([
  { name: 'eudimorphodon', hp: 1, r: 16, pts: 15 },
  { name: 'coelophysis', hp: 1, r: 14, pts: 20, ground: 1 },
  { name: 'stegosaurus', hp: 4, r: 30, pts: 40, ground: 1 },
  { name: 'ornitholestes', hp: 1, r: 16, pts: 25 },
  { name: 'pteranodon', hp: 2, r: 18, pts: 30 },
  { name: 'elasmosaurus', hp: 5, r: 22, pts: 45, ground: 1 },
  { name: 'triceratops', hp: 6, r: 34, pts: 60 },
  { name: 'ankylosaurus', hp: 8, r: 36, pts: 70, ground: 1 },
  { name: 'postosuchus', hp: 150, r: 60, pts: 500, mid: 1 },
  { name: 'allosaurus', hp: 170, r: 65, pts: 750, mid: 1 },
  { name: 'quetzalcoatlus', hp: 260, r: 70, pts: 1250, mid: 1 },
  { name: 'spinosaurus', hp: 340, r: 74, pts: 2000, mid: 1 },
  { name: 'plateosaurus', hp: 120, r: 70, pts: 1000, boss: 1 },
  { name: 'diplodocus', hp: 150, r: 70, pts: 1500, boss: 1 },
  { name: 'mosasaurus', hp: 270, r: 80, pts: 2500, boss: 1 },
  { name: 'tyrannosaurus', hp: 620, r: 90, pts: 4000, boss: 1 },
  // second pass: two more of its own for every chapter, most of them shooters
  { name: 'herrerasaurus', hp: 3, r: 24, pts: 35, ground: 1 },      // on the ground, breathes a fan of fire as it goes by
  { name: 'peteinosaurus', hp: 2, r: 16, pts: 25 },                 // weaves down, dropping fire
  { name: 'dilophosaurus', hp: 2, r: 26, pts: 45, ground: 1 },      // on the ground, spits a wide fan of venom
  { name: 'rhamphorhynchus', hp: 2, r: 16, pts: 30 },               // weaves down fast, two bolts of venom at a time
  { name: 'archelon', hp: 8, r: 30, pts: 55, ground: 1 },           // a great turtle in the water: a slow spiral of bullets
  { name: 'ichthyornis', hp: 1, r: 17, pts: 20 },                   // crosses the screen in a line, dropping fire
  { name: 'dromaeosaurus', hp: 2, r: 20, pts: 30, ground: 1 },      // runs across the ground in a pack, spitting venom at the ship
  { name: 'pachycephalosaurus', hp: 5, r: 24, pts: 50 },            // rams down a line, then bursts into a ring of fire
]);
export const EUDI = FIRST, COELO = FIRST + 1, STEGO = FIRST + 2, ORNI = FIRST + 3, PTERA = FIRST + 4, ELASMO = FIRST + 5, TRIKE = FIRST + 6, ANKY = FIRST + 7;
export const L6_MIDS = Object.freeze([FIRST + 8, FIRST + 9, FIRST + 10, FIRST + 11]);
export const L6_BOSSES = Object.freeze([FIRST + 12, FIRST + 13, FIRST + 14, FIRST + 15]);
export const HERRERA = FIRST + 16, PETEINO = FIRST + 17, DILOPHO = FIRST + 18, RHAM = FIRST + 19, ARCHELON = FIRST + 20, ICHTHY = FIRST + 21, DROMAEO = FIRST + 22, PACHY = FIRST + 23;
const [POSTO, ALLO, QUETZ, SPINO] = L6_MIDS, [PLATEO, DIPLO, MOSA, TREX] = L6_BOSSES;
/** The boss of slot k: mid-boss, boss, mid-boss, boss, ... */
const bossType = slot => (slot % 2 === 0 ? L6_MIDS : L6_BOSSES)[slot >> 1];

// ---------- numbers (gdd/05 v11 §3–§6; all starting values) ----------
export const L6_HP_ADD = Object.freeze([2, 0, 1, 3]);   // v4: chapter one +2, chapter four +1 (the opening supply gives the wingman)         // every creature's extra health, by chapter
// what stands on the ground is carried down the screen with it, at the speed the ground is drawn going by (and the
// speed leg one's peaks come down at, so that this leg's trees stand still on it too)
export const L6_GROUND_VY = 3;
// chapter 1
export const L6_DIVE_Y = 256, L6_DIVE_IN = 4, L6_DIVE_HOLD = 30, L6_DIVE_SPEED = 14, L6_EUDI_FIRE_ONE_IN = 2, L6_EUDI_FIRE_SPEED = 5;   // one in three breathes a ball of fire as it locks on
export const L6_PACK_VX = 3, L6_PACK_BONUS = 300, L6_PACK_Y0 = 300, L6_PACK_GAP = 46;
export const L6_BOMB_WARN = 66, L6_BOMB_R = 70, L6_BOMB_LIVE = 6, L6_BOMB_APART = 260;
// chapter 2
export const L6_STEGO_Y = 300, L6_STEGO_IN = 3, L6_STEGO_PERIOD = 100, L6_STEGO_WARN = 30, L6_STEGO_SPIKES = Object.freeze([-13, -4, 4, 13]), L6_SPIKE_SPEED = 6, L6_STEGO_VOLLEYS = 4;
export const L6_ORNI_WARN = 30, L6_ORNI_SPEED = 11, L6_ORNI_VENOM_SPEED = 5;   // it spits venom from the trees, then leaps
export const L6_TREE_EVERY = 150;
// the sweep: a bar turning about a fixed point; everything below its reach is never touched
export const L6_SWEEP_X = 360, L6_SWEEP_Y = 520, L6_SWEEP_LEN = 400, L6_SWEEP_HALF = 13, L6_SWEEP_WARN = 48;
// chapter 3
export const L6_PTERA_Y = 100, L6_PTERA_WARN = 50, L6_PTERA_SPEED = 26, L6_PTERA_FIRE_SPEED = 4;   // two balls of fire to either side as it starts down
export const L6_NECK_WARN = 45, L6_NECK_LEN = 260, L6_NECK_HALF = 14, L6_NECK_OUT = 60, L6_NECK_SHOT = 4;
export const L6_WIND_PUSH = 3, L6_WIND_PERIOD = 420, L6_WIND_WARN = 60, L6_WIND_BLOW = 210;
// chapter 4
export const L6_TRIKE_WARN = 39, L6_TRIKE_SPEED = 9, L6_SHIELD_HALF = 20, L6_TRIKE_FIRE_SPEED = 7;   // a fan of fire ahead of it as it sets off
export const L6_ANKY_IN = 1, L6_ANKY_PERIOD = 120, L6_ANKY_WARN = 42, L6_ANKY_RING = 24, L6_ANKY_GAP = 3, L6_ANKY_SPEED = 4;
export const L6_METEOR_EVERY = Object.freeze([80, 60, 45]), L6_METEOR_TIER_UNITS = 3, L6_METEOR_OVERTIME = 40;
// second pass: the shooters
export const L6_TURRET_FROM = 80, L6_TURRET_TO = 1000;        // a creature on the ground attacks while it is between these heights
export const L6_HERRERA_PERIOD = 60, L6_HERRERA_FAN = Object.freeze([-9, 0, 9]), L6_HERRERA_SPEED = 5;
export const L6_PETEINO_VY = 3, L6_PETEINO_SWAY = 3, L6_PETEINO_PERIOD = 40, L6_PETEINO_SPEED = 4;
export const L6_DILOPHO_PERIOD = 95, L6_DILOPHO_FAN = Object.freeze([-20, -10, 0, 10, 20]), L6_DILOPHO_SPEED = 4, L6_DILOPHO_WARN = 24;
export const L6_RHAM_VY = 3, L6_RHAM_SWAY = 2, L6_RHAM_PERIOD = 45, L6_RHAM_SPEED = 6;
export const L6_ARCHELON_PERIOD = 6, L6_ARCHELON_STEP = 13, L6_ARCHELON_SPEED = 3;
export const L6_ICHTHY_VX = 3, L6_ICHTHY_PERIOD = 24, L6_ICHTHY_SPEED = 4;
export const L6_DROMAEO_VX = 3, L6_DROMAEO_PERIOD = 28, L6_DROMAEO_SPEED = 5;
export const L6_PACHY_WARN = 33, L6_PACHY_SPEED = 11, L6_PACHY_BURST_Y = 760, L6_PACHY_RING = 14, L6_PACHY_RING_SPEED = 4;
// the weak point: closed, a hit counts for this share; open while a borrowed attack is on and a little after
export const L6_CLOSED_PCT = 15, L6_OPEN_TAIL = 30;
// mid-bosses
// second pass: what every mid-boss and boss keeps up besides its borrowed attack (periods in ticks; D() from the
// engine shortens them by leg one's BOSS_DENSITY_PCT, P() again for a boss that is down to its core).
//                                fan of three, ring: [period, bullets, twist per ring], spiral: arms (every L6_SPIRAL_EVERY ticks; from the frame stage on)
export const L6_PATTERNS = Object.freeze({
  postosuchus: { fan: 80, ring: [130, 10, 9] },
  allosaurus: { fan: 65, ring: [120, 12, 11] },
  quetzalcoatlus: { fan: 60, ring: [110, 14, 9] },
  spinosaurus: { fan: 55, ring: [100, 14, 13] },
  plateosaurus: { fan: 70, ring: [110, 12, 9], spiral: 2 },
  diplodocus: { fan: 65, ring: [95, 14, 11], spiral: 2 },
  mosasaurus: { fan: 60, ring: [90, 16, 9], spiral: 2 },
  tyrannosaurus: { fan: 55, ring: [85, 16, 13], spiral: 2 },
});
export const L6_SPIRAL_EVERY = 7;
export const L6_ROW_STEP = 44, L6_ROW_GAP = 130, L6_ROW_SPEED = 3, L6_ROW_SHIFT = 200;                    // postosuchus: the stones its lunge throws up
export const L6_CLAW_PERIOD = 300, L6_CLAW_WARN = 36, L6_CLAW_LEN = 300, L6_CLAW_HALF = 11, L6_CLAW_STAYS = 60;   // allosaurus: the mark its claw leaves
export const L6_GUST_PERIOD = 480, L6_ICE = 6, L6_ICE_SPEED = 4;                                           // quetzalcoatlus: a gust and falling ice
export const L6_BOLT_PERIOD = 420, L6_BOLTS = 5, L6_BOLT_STEP = 110, L6_BOLT_EVERY = 20;                  // spinosaurus: lightning from each spine in turn
// bosses
export const L6_B1_SHOT_PERIOD = 50, L6_B1_SHOT_SPEED = 4, L6_B1_SWEEP_PERIOD = 540, L6_B1_OPEN = 210;    // plateosaurus: the ray
export const L6_SLOW_PERIOD = 510, L6_SLOW_WARN = 30, L6_SLOW_TICKS = 150, L6_SLOW_TOP = 420, L6_SLOW_H = 260, L6_SLOW_KEEP = 5, L6_B2_RING_PERIOD = 100, L6_B2_RING = 14;   // diplodocus: bullets crawl in the band (1 / KEEP of their speed)
export const L6_B3_SHOT_PERIOD = 70, L6_B3_RING = 16, L6_B3_RING_SPEED = 3, L6_B3_RING_GAP = 22, L6_B3_OPEN = 190;   // mosasaurus: its lunge, then two rings turned against each other
export const L6_B4_RING_PERIOD = 90, L6_B4_RING = 12, L6_RIFT_PERIOD = 510, L6_RIFT_WARN = 45, L6_RIFT_TICKS = 150, L6_RIFT_X = 230, L6_RIFT_EVERY = 12, L6_RIFT_SPEED = 4;   // tyrannosaurus: rifts either side
export const L6_WELL_PERIOD = 660, L6_WELL_WARN = 45, L6_WELL_TICKS = 300, L6_WELL_R = 150, L6_WELL_PULL_SHIFT = 1;   // ... and, as a core, a gravity well: pull = COS >> SHIFT sub-px per tick

// ---------- schedule ----------
const chapterOf = k => SCRIPT[k].chapter;
const EVENT_UNITS = SCRIPT.filter(s => s.event).map(s => s.from);   // one per chapter: the place shows its hazard alone
const sectionEnd = k => (k + 1 < SCRIPT.length ? SCRIPT[k + 1].from : SCRIPT[k].from);
const isClimax = k => !!SCRIPT[k + 1]?.boss && SCRIPT[k + 1].slot % 2 === 1;   // the wave section before a boss (合)
// each chapter's own four: its first flyer or charger, its second creature, and two shooters
export const ROSTER = Object.freeze([[EUDI, PETEINO, HERRERA, COELO], [STEGO, ORNI, DILOPHO, RHAM], [PTERA, ELASMO, ARCHELON, ICHTHY], [TRIKE, ANKY, DROMAEO, PACHY]]);
const HEAVY = new Set([STEGO, TRIKE, ANKY, ARCHELON, DILOPHO]);   // come one at a time
const SWARM = new Set([EUDI, COELO, PETEINO, RHAM, ICHTHY, DROMAEO]);     // come in numbers: a chapter does not make each of them tougher
const laneX = lane => Math.min(WORLD_W - 110, Math.max(110, LANE_X0 + lane * LANE_STEP));
// how many more of a chapter's creatures a wave unit gets, by chapter
const MORE = Object.freeze([2, 2, 4, 4]);

export function schedule(seed) {
  const out = [];
  const push = (at, type, x, extra = {}) => {
    const i = out.length, k = sectionAt(at);
    const drop = rng.int(seed, 'drop', i, 100) < DROP_CHANCE ? dropKind(seed, i) : -1;
    out.push({ at, type, lane: 0, x, hp: KIND[type].hp + (SWARM.has(type) ? 0 : L6_HP_ADD[chapterOf(k)]), sh: type === ANKY ? 1 : type === ARCHELON ? 1 : 0, drop, ...extra });
  };
  const line = (t0, type, idx, size, gapT, gapX) => {            // a slanted line of flyers
    const dir = rng.int(seed, 'order', 4096 + idx, 2) ? 1 : -1, x0 = laneX(rng.int(seed, 'lane', idx, LANES));
    for (let j = 0; j < size; j++) push(t0 + j * gapT, type, Math.min(WORLD_W - 40, Math.max(40, x0 + dir * (j - (size >> 1)) * gapX)));
  };
  const across = (t0, type, idx, size, vx, y0, extra = {}) => {  // a file crossing the screen from one side
    // one after another from the same spot just off the edge (a creature placed further out than that is taken for
    // one that has left)
    const left = rng.int(seed, 'pack', 2 * idx, 2) === 0, every = Math.ceil(L6_PACK_GAP / vx);
    for (let j = 0; j < size; j++) push(t0 + j * every, type, left ? -40 : WORLD_W + 40, { y: y0 + (j % 2) * 26, vx: (left ? vx : -vx) * ONE, ...extra });
  };
  /** One appearance of a creature, its idx-th. */
  const one = (t0, type, idx) => {
    const x = laneX(rng.int(seed, 'lane', 9000 + idx, LANES));
    switch (type) {
      case EUDI: return line(t0, EUDI, idx, 5 + rng.int(seed, 'order', idx, 3), 9, 34);
      case PETEINO: return line(t0, PETEINO, idx, 3, 22, 70);
      case RHAM: return line(t0, RHAM, idx, 2, 26, 60);
      case COELO: { const u0 = Math.floor(t0 / UNIT_TICKS) * UNIT_TICKS + 10, n0 = out.length; across(u0, COELO, idx, 6 + rng.int(seed, 'pack', 2 * idx + 1, 5), L6_PACK_VX, L6_PACK_Y0); for (let q = n0; q < out.length; q++) out[q].drop = -1; return; }   // a pack starts with its unit, so that all of it comes in that unit (the unit is its number)
      case DROMAEO: return across(t0, DROMAEO, idx, 4, L6_DROMAEO_VX, 120);
      case ICHTHY: return across(t0, ICHTHY, idx, 4, L6_ICHTHY_VX, 150 + rng.int(seed, 'ambush', 500 + idx, 160));
      case ORNI: { const y = 320 + rng.int(seed, 'ambush', idx, 360); push(t0, ORNI, 50, { y }); push(t0, ORNI, WORLD_W - 50, { y }); return; }
      case PTERA: return push(t0, PTERA, x, { y: -30 });
      case ELASMO: return push(t0, ELASMO, 120 + rng.int(seed, 'neck', 2 * idx, WORLD_W - 240), { y: 180 + rng.int(seed, 'neck', 2 * idx + 1, 220) });
      default: return push(t0, type, x);                         // walks or flies in down a lane
    }
  };
  SCRIPT.forEach((sec, k) => {
    if (sec.boss || sec.boost || sec.event) return;
    const ch = sec.chapter, [a, b, c, d] = ROSTER[ch], climax = isClimax(k);
    const old = ROSTER.slice(0, ch).flat().filter(t => t !== COELO);   // what earlier chapters taught
    for (let u = sec.from; u < sectionEnd(k); u++) {
      const t0 = u * UNIT_TICKS, i = u - sec.from, idx = u * 16;
      const spare = n => { if (old.length) one(t0 + 100 + n * 60, old[(u + n) % old.length], idx + 12 + n); };
      // 起 (the chapter's opening, or the warm-up): the first creature alone, then the first shooter alone, then both
      if (sec.safe || (ch === 0 && sec.name === SCRIPT[1].name)) {
        if (i === 0) { one(t0 + 20, a, idx); if (ch === 0) one(t0 + 130, a, idx + 6); }
        else if (i === 1) { one(t0 + 20, c, idx); if (ch === 0) one(t0 + 130, c, idx + 4); }   // v4: the leg's first lesson shows each newcomer twice (still alone; the opening supply gives the wingman)
        else { one(t0 + 10, a, idx); one(t0 + 110, c, idx + 1); if (ch === 0 && i === 2) { one(t0 + 160, c, idx + 7); one(t0 + 210, c, idx + 8); } /* v4: the first unit with both gets two more shooters */ if (i >= 3) { one(t0 + 170, a, idx + 2); spare(0); } }
        continue;
      }
      // 承: the second creature alone in its first unit, the fourth alone in its second, then everything together, more each unit
      if (!climax && i === 0) { one(t0 + 30, b, idx); continue; }
      if (!climax && i === 1) { one(t0 + 30, d, idx); continue; }
      const n = Math.min(2 + MORE[ch] + (climax ? (ch <= 1 ? 1 : 2) : 0) + (i >> 1), 8), mix = [a, c, b, d, a, c, d, a];   // v3: chapter two climax +2 -> +1 (slower fire from v12)
      for (let j = 0, placed = 0; placed < n && j < mix.length; j++) { if (HEAVY.has(mix[j]) && j >= 4) continue; one(t0 + 10 + placed * Math.floor(200 / n), mix[j], idx + j); placed++; }
      spare(0); if (climax || i >= 3 || ch === 3) spare(1);
      if (ch > 0 && i === 2) one(t0 + 90, COELO, idx + 9);       // a pack to chase, once a section
    }
  });
  return out.map((p, i) => [p, i]).sort((x, y) => x[0].at - y[0].at || x[1] - y[1]).map(v => v[0]);
}

/** Volcanic bombs (chapter one): [{ at, x, y }] on the script clock. Alone in the event unit, with the waves in the
 *  section before the boss. Never more than three in the air at once, and those at least L6_BOMB_APART apart. */
export function bombs(seed) {
  const out = [];
  const volley = (t0, count, salt) => {
    const placed = [];
    for (let i = 0, tries = 0; i < count && tries < 40; tries++) {
      // where its mark first shows; it lands L6_BOMB_WARN * L6_GROUND_VY further down
      const x = 90 + rng.int(seed, 'bomb', salt * 64 + tries * 2, WORLD_W - 180), y = 240 + rng.int(seed, 'bomb', salt * 64 + tries * 2 + 1, 660);
      if (placed.some(p => (p.x - x) ** 2 + (p.y - y) ** 2 < L6_BOMB_APART ** 2)) continue;
      placed.push({ x, y }); out.push({ at: t0 + i * 24, x, y }); i++;
    }
  };
  // two volleys in the event unit, the second only once the first has landed (never more than three in the air)
  for (let v = 0; v < 2; v++) volley(EVENT_UNITS[0] * UNIT_TICKS + 10 + v * (L6_BOMB_WARN + L6_BOMB_LIVE + 2 * 24 + 4), 3, v);
  SCRIPT.forEach((sec, k) => { if (sec.chapter === 0 && !sec.boss && !sec.boost && !sec.event && isClimax(k)) for (let u = sec.from; u < sectionEnd(k); u++) volley(u * UNIT_TICKS + 40, 2, 100 + u); });
  return out.sort((a, b) => a.at - b.at);
}

/** Obstacles: the forest's trees (chapter two; leg one's peaks under another picture, so they block and can be
 *  felled the same way), one at a time so that there is always a way round; the end's meteors (chapter four), in
 *  three steps of how often they come. [{ at, kind, x, vx }] on the script clock. */
export function obstacles(seed) {
  const out = [], end0 = SCRIPT.find(s => s.chapter === 3).from;
  SCRIPT.forEach((sec, k) => {
    if (sec.boss || sec.boost) return;
    const from = sec.from * UNIT_TICKS, to = sectionEnd(k) * UNIT_TICKS;
    if (sec.chapter === 1 && !sec.event) for (let t = from + 20, i = 0; t < to; t += L6_TREE_EVERY, i++) out.push({ at: t, kind: PEAK, x: 70 + rng.int(seed, 'tree', k * 64 + i, WORLD_W - 140), vx: 0 });
    if (sec.chapter === 3) {
      for (let t = from + 30, i = 0; t < to; i++) {
        const tier = Math.min(L6_METEOR_EVERY.length - 1, Math.floor((Math.floor(t / UNIT_TICKS) - end0) / (2 * L6_METEOR_TIER_UNITS)));
        out.push({ at: t, kind: METEOR, x: 50 + rng.int(seed, 'meteor', k * 64 + i, WORLD_W - 100), vx: 0 });
        t += sec.event ? L6_METEOR_EVERY[2] : L6_METEOR_EVERY[tier] * (sec.safe ? 2 : 1);
      }
    }
  });
  return out.sort((a, b) => a.at - b.at);
}

// ---------- when the place does its thing (all on the script clock) ----------
/** Is the sweep turning at clock `c`? In chapter two's event unit and in its section before the boss. */
export const sweepSpan = c => {
  const k = sectionAt(c), sec = SCRIPT[k];
  if (sec.chapter !== 1 || sec.boss || sec.boost) return null;
  if (!sec.event && !isClimax(k)) return null;
  return { from: sec.from * UNIT_TICKS, to: sectionEnd(k) * UNIT_TICKS };
};
/** The crosswind's cycle at clock `c`: null outside chapter three's event unit and the wave sections after it. */
export const windAt = c => {
  const sec = SCRIPT[sectionAt(c)];
  if (sec.chapter !== 2 || sec.boss || sec.boost || (sec.safe && !sec.event)) return null;
  const t = c - EVENT_UNITS[2] * UNIT_TICKS;
  if (t < 0) return null;
  const n = Math.floor(t / L6_WIND_PERIOD), at = t % L6_WIND_PERIOD;
  return { dir: n % 2 ? -1 : 1, warn: at < L6_WIND_WARN, blow: at >= L6_WIND_WARN && at < L6_WIND_WARN + L6_WIND_BLOW, left: at < L6_WIND_WARN ? L6_WIND_WARN - at : L6_WIND_WARN + L6_WIND_BLOW - at };
};

// ---------- the leg's own state on the sim ----------
function init(sim) {
  const packs = new Map();
  for (const p of sim.plan) if (p.type === COELO) packs.set(Math.floor(p.at / UNIT_TICKS), { lost: 0, paid: 0 });
  sim.l6 = {
    bombPlan: bombs(sim.seed), nextBomb: 0, bombs: [],        // bombs in the air: { x, y, pw (warning left), bt (ticks it burns) }
    packs,                                                    // pack id (the unit it came in) -> { lost (one got away), paid }
    open: 0, acc: 0,                                          // the boss's weak point: ticks it stays open; the remainder of closed hits
    sweep: 0, sweepA: 0, sweepT: 0,                           // the sweep: 0 off, 1 announced, 2 turning; its angle (256 = a turn); warning left
    gust: null,                                               // a gust a boss raised: { dir, pw, bt } (the chapter's own wind is windAt)
    marks: [],                                                // claw marks: { x0, y0, x1, y1, pw, bt }
    band: null,                                               // the slow band: { y0, y1, pw, bt }
    rifts: null,                                              // rifts: { xl, xr, pw, bt, n }
    well: null,                                               // the gravity well: { x, y, pw, bt }
    bolts: [], rings: [],                                     // lightning and rings still to come: { at (tick), ... }
    wells: 0, meteors: 0,                                     // counters for the seed streams
  };
}

/** Open the boss's weak point for `ticks` (longer if it already is). */
function openFor(sim, e, ticks) {
  if (sim.l6.open <= 0) emit(sim, { type: 'weakOpen', id: e.id, x: px(e.x), y: px(e.y), ticks });
  sim.l6.open = Math.max(sim.l6.open, ticks);
}
/** A creature's ranged attack: one bullet of fire or venom. */
function spit(sim, x, y, angle, speed, c) { fire(sim, x, y, angle, speed); sim.bullets[sim.bullets.length - 1].c = c; }
const clampX = x => Math.min((WORLD_W - PLAYER_MARGIN_X) * ONE, Math.max(PLAYER_MARGIN_X * ONE, x));
/** The wind that is blowing this tick: -1, 0 or 1. */
export const blowing = sim => {
  const g = sim.l6.gust;
  if (g && g.pw === 0 && g.bt > 0) return g.dir;
  if (sim.bossState) return 0;                                // the chapter's own wind rests while a boss is on
  const w = windAt(clock(sim));
  return w && w.blow ? w.dir : 0;
};

function before(sim, now) {
  const L = sim.l6;
  // volcanic bombs: a mark on the ground that grows for L6_BOMB_WARN ticks, then the impact. Bombs already in the
  // air count down first, so that a new one keeps its whole warning.
  for (let i = L.bombs.length - 1; i >= 0; i--) {
    const b = L.bombs[i];
    b.y += L6_GROUND_VY * ONE;                                // the mark is on the ground, and the ground goes by
    if (b.pw > 0) { if (--b.pw === 0) { b.bt = L6_BOMB_LIVE; emit(sim, { type: 'bomb', x: px(b.x), y: px(b.y), r: L6_BOMB_R }); } }
    else if (--b.bt <= 0) L.bombs.splice(i, 1);
  }
  while (L.nextBomb < L.bombPlan.length && L.bombPlan[L.nextBomb].at <= now) {
    const b = L.bombPlan[L.nextBomb++];
    L.bombs.push({ x: b.x * ONE, y: b.y * ONE, pw: L6_BOMB_WARN, bt: 0 });
    emit(sim, { type: 'bombUp', x: b.x, y: b.y, r: L6_BOMB_R, ticks: L6_BOMB_WARN });
  }
  settlePacks(sim);
  if (L.open > 0 && --L.open === 0) emit(sim, { type: 'weakClose' });

  // the sweep (chapter two): announced, then it turns one step a tick for as long as its span lasts
  const span = sim.bossState ? null : sweepSpan(now);
  if (!span) { if (L.sweep) { L.sweep = 0; emit(sim, { type: 'sweepEnd' }); } }
  else if (L.sweep === 0) { L.sweep = 1; L.sweepA = (span.from / UNIT_TICKS) & 1 ? 192 : 64; L.sweepT = L6_SWEEP_WARN; emit(sim, { type: 'sweepUp', x: L6_SWEEP_X, y: L6_SWEEP_Y, len: L6_SWEEP_LEN, a: L.sweepA, ticks: L6_SWEEP_WARN }); }
  else if (L.sweep === 1) { if (--L.sweepT <= 0) L.sweep = 2; }
  else L.sweepA = (L.sweepA + 1) & 255;

  // the wind (chapter three, or a gust): it carries the ship; shots and bullets are carried in bend()
  const w = sim.bossState ? null : windAt(now);
  if (w && w.warn && w.left === L6_WIND_WARN) emit(sim, { type: 'windUp', dir: w.dir, ticks: L6_WIND_WARN });
  if (w && w.blow && w.left === L6_WIND_BLOW) emit(sim, { type: 'wind', dir: w.dir, ticks: L6_WIND_BLOW });
  if (L.gust) { const g = L.gust; if (g.pw > 0) { if (--g.pw === 0) emit(sim, { type: 'wind', dir: g.dir, ticks: g.bt }); } else if (--g.bt <= 0) L.gust = null; }
  const push = blowing(sim);
  if (push) sim.px = clampX(sim.px + push * L6_WIND_PUSH * ONE);

  // claw marks, the slow band, rifts, the well: each counts down its warning, then its time
  for (let i = L.marks.length - 1; i >= 0; i--) { const m = L.marks[i]; if (m.pw > 0) { if (--m.pw === 0) emit(sim, { type: 'claw', x0: px(m.x0), y0: px(m.y0), x1: px(m.x1), y1: px(m.y1), ticks: m.bt }); } else if (--m.bt <= 0) L.marks.splice(i, 1); }
  if (L.band) { const b = L.band; if (b.pw > 0) b.pw--; else if (--b.bt <= 0) { L.band = null; emit(sim, { type: 'slowEnd' }); } }
  if (L.rifts) {
    const r = L.rifts;
    if (r.pw > 0) r.pw--;
    else {
      if (r.bt % L6_RIFT_EVERY === 0) { const y = (300 + (r.n % 5) * 150) * ONE; sim.bullets.push({ x: r.xl, y, vx: L6_RIFT_SPEED * ONE, vy: ONE, grazed: 0, c: VENOM }, { x: r.xr, y: y + 75 * ONE, vx: -L6_RIFT_SPEED * ONE, vy: ONE, grazed: 0, c: VENOM }); r.n++; }
      if (--r.bt <= 0) L.rifts = null;
    }
  }
  if (L.well) { const g = L.well; if (g.pw > 0) g.pw--; else if (--g.bt <= 0) { L.well = null; emit(sim, { type: 'wellEnd' }); } }
  // what was set for later: lightning columns (the engine's storm lightning) and second rings
  for (let i = L.bolts.length - 1; i >= 0; i--) if (L.bolts[i].at <= sim.tick) { const b = L.bolts.splice(i, 1)[0]; sim.strikes.push({ x: b.x, pw: BEAM_TELEGRAPH, bt: 0 }); emit(sim, { type: 'strikeUp', x: px(b.x), w: BEAM_W, ticks: BEAM_TELEGRAPH }); }
  for (let i = L.rings.length - 1; i >= 0; i--) if (L.rings[i].at <= sim.tick) { const r = L.rings.splice(i, 1)[0]; ring(sim, r.x, r.y, r.n, r.off, r.speed); emit(sim, { type: 'bossRing', x: px(r.x), y: px(r.y) }); }

  // a lunge that has just landed: the postosuchus throws up a row of stones (the way through is to one side of it);
  // the mosasaurus sends out two rings turned against each other
  for (const e of sim.enemies) {
    if (e.ch !== 2 || e.cw !== CHARGE_HOLD) continue;
    if (e.type === POSTO) {
      const gap = e.x + (e.x < (WORLD_W / 2) * ONE ? L6_ROW_SHIFT : -L6_ROW_SHIFT) * ONE;
      for (let x = L6_ROW_STEP >> 1; x < WORLD_W; x += L6_ROW_STEP) if (Math.abs(x * ONE - gap) > (L6_ROW_GAP / 2) * ONE) sim.bullets.push({ x: x * ONE, y: e.y, vx: 0, vy: L6_ROW_SPEED * ONE, grazed: 0 });
      emit(sim, { type: 'stoneRow', y: px(e.y), gap: px(gap), w: L6_ROW_GAP });
    } else if (e.type === MOSA) {
      ring(sim, e.x, e.y, L6_B3_RING, 0, L6_B3_RING_SPEED); emit(sim, { type: 'bossRing', x: px(e.x), y: px(e.y) });
      L.rings.push({ at: sim.tick + L6_B3_RING_GAP, x: e.x, y: e.y, n: L6_B3_RING, off: Math.floor(128 / L6_B3_RING), speed: L6_B3_RING_SPEED });
    }
  }
  // the end: while a boss is in overtime the meteors come faster still (the script clock stands still then, so the
  // schedule cannot do it)
  if (sim.chapter === 3 && sim.stall > 0 && sim.stall % L6_METEOR_OVERTIME === 0) {
    sim.obst.push({ kind: METEOR, x: (50 + rng.int(sim.seed, 'meteor', 100000 + L.meteors++, WORLD_W - 100)) * ONE, y: -OBST_R[METEOR] * ONE, vx: 0, vy: METEOR_VY * ONE, hp: OBST_HP[METEOR] });
  }
}

// ---------- creatures ----------
const dive = (e, speed) => { e.x += COS[e.pv & 255] * speed; e.y += SIN[e.pv & 255] * speed; };
function move(sim, e) {
  switch (e.type) {
    case EUDI:                                                // q: 0 coming down, 1 holding (locked on where the ship is now), 2 diving along that line
      if (e.q === 0) {
        e.y += L6_DIVE_IN * ONE;
        if (e.y >= L6_DIVE_Y * ONE) {
          e.q = 1; e.qd = L6_DIVE_HOLD; e.pv = angleOf(sim.px - e.x, sim.py - e.y);
          emit(sim, { type: 'diveLock', id: e.id, x: px(e.x), y: px(e.y), tx: px(sim.px), ty: px(sim.py), ticks: L6_DIVE_HOLD });
          if (e.id % L6_EUDI_FIRE_ONE_IN === 0) spit(sim, e.x, e.y, e.pv, L6_EUDI_FIRE_SPEED, FIRE);   // a ball of fire ahead of its dive
        }
      } else if (e.q === 1) { if (--e.qd <= 0) e.q = 2; }
      else dive(e, L6_DIVE_SPEED);
      return;
    case COELO: {                                             // it runs across ground that is going by
      if (e.t === 1) e.pv = Math.floor(clock(sim) / UNIT_TICKS);   // its pack is the unit it came in (one pack a unit at most)
      e.x += e.vx; e.y += L6_GROUND_VY * ONE;
      const k = sim.l6.packs.get(e.pv);
      if (k && ((e.vx > 0 ? e.x > (WORLD_W + 60) * ONE : e.x < -60 * ONE) || e.y > (WORLD_H + 40) * ONE)) k.lost = 1;   // this one got away: no bonus for the pack
      return;
    }
    case STEGO:                                               // walks in, stops, throws four spikes at the ship three times, walks on with the ground
      if (e.q === 0) { e.y += L6_STEGO_IN * ONE; if (e.y >= L6_STEGO_Y * ONE) { e.q = 1; e.qd = L6_STEGO_PERIOD >> 1; e.aux = 0; } }
      else if (e.q === 1) {
        e.qd--;
        if (e.qd === L6_STEGO_WARN) emit(sim, { type: 'spikeUp', id: e.id, x: px(e.x), y: px(e.y), ticks: L6_STEGO_WARN });
        if (e.qd <= 0) {
          const a = angleOf(sim.px - e.x, sim.py - e.y);
          for (const off of L6_STEGO_SPIKES) fire(sim, e.x, e.y, a + off, L6_SPIKE_SPEED);   // an even number: straight at the ship there is none
          emit(sim, { type: 'spikes', x: px(e.x), y: px(e.y) });
          e.qd = L6_STEGO_PERIOD; if (++e.aux >= L6_STEGO_VOLLEYS) e.q = 2;
        }
      } else e.y += L6_GROUND_VY * ONE;
      return;
    case ORNI:                                                // waits in the trees (its eyes show), spits venom, then leaps at where the ship is
      if (e.q === 0) {
        e.y += L6_GROUND_VY * ONE;
        if (e.t === 1) emit(sim, { type: 'ambush', id: e.id, x: px(e.x), y: px(e.y), ticks: L6_ORNI_WARN });
        if (e.t === L6_ORNI_WARN >> 1) spit(sim, e.x, e.y, angleOf(sim.px - e.x, sim.py - e.y), L6_ORNI_VENOM_SPEED, VENOM);
        if (e.t >= L6_ORNI_WARN) { e.q = 1; e.pv = angleOf(sim.px - e.x, sim.py - e.y); }
      } else dive(e, L6_ORNI_SPEED);
      return;
    case PTERA:                                               // hangs at the top, shows the line it will take, then falls straight down it
      if (e.q === 0) { e.y += 8 * ONE; if (e.y >= L6_PTERA_Y * ONE) { e.q = 1; e.qd = L6_PTERA_WARN; e.x = clampX(sim.px); emit(sim, { type: 'diveLine', id: e.id, x: px(e.x), ticks: L6_PTERA_WARN }); } }
      else if (e.q === 1) { if (--e.qd <= 0) { e.q = 2; for (const off of [-26, 26]) spit(sim, e.x, e.y, 64 + off, L6_PTERA_FIRE_SPEED, FIRE); } }   // 64 = straight down: fire to either side of its line
      else e.y += L6_PTERA_SPEED * ONE;
      return;
    case ELASMO:                                              // ripples on the water, then the neck comes up out of it and spits venom; it goes with the ground
      e.y += L6_GROUND_VY * ONE;
      if (e.q === 0) { if (e.t === 1) emit(sim, { type: 'ripple', id: e.id, x: px(e.x), y: px(e.y), ticks: L6_NECK_WARN }); if (e.t >= L6_NECK_WARN) { e.q = 1; e.qd = L6_NECK_OUT; emit(sim, { type: 'neck', id: e.id, x: px(e.x), y: px(e.y), len: L6_NECK_LEN, ticks: L6_NECK_OUT }); } }
      else if (e.q === 1) { if (e.qd === L6_NECK_OUT - 12) { const a = angleOf(sim.px - e.x, sim.py - e.y); for (const off of [-20, -10, 0, 10, 20]) spit(sim, e.x, e.y, a + off, L6_NECK_SHOT, VENOM); } if (--e.qd <= 0) e.q = 2; }
      return;
    case TRIKE:                                               // picks its line, paws the ground, breathes fire down it, then charges behind its shield
      if (e.q === 0) { e.y += 4 * ONE; if (e.y >= 70 * ONE) { e.q = 1; e.qd = L6_TRIKE_WARN; e.x = clampX(sim.px); emit(sim, { type: 'chargeLine', id: e.id, x: px(e.x), w: KIND[TRIKE].r, ticks: L6_TRIKE_WARN }); } }
      else if (e.q === 1) { if (--e.qd <= 0) { e.q = 2; for (const off of [-18, -9, 0, 9, 18]) spit(sim, e.x, e.y, 64 + off, L6_TRIKE_FIRE_SPEED, FIRE); } }
      else e.y += L6_TRIKE_SPEED * ONE;
      return;
    case ANKY:                                                // plods on with the ground and, every so often, brings its club down: a ring with two ways through
      e.y += ((L6_GROUND_VY + L6_ANKY_IN) * ONE) >> 1;
      if (e.t % L6_ANKY_PERIOD === L6_ANKY_PERIOD - L6_ANKY_WARN) emit(sim, { type: 'clubUp', id: e.id, x: px(e.x), y: px(e.y), ticks: L6_ANKY_WARN });
      if (e.t % L6_ANKY_PERIOD === 0) {
        const gap = (e.id * 7 + (e.t / L6_ANKY_PERIOD) * 5) % L6_ANKY_RING;
        for (let k = 0; k < L6_ANKY_RING; k++) { const d = (k - gap + L6_ANKY_RING) % L6_ANKY_RING, d2 = (d + (L6_ANKY_RING >> 1)) % L6_ANKY_RING; if (d < L6_ANKY_GAP || d2 < L6_ANKY_GAP) continue; fire(sim, e.x, e.y, Math.floor((k * 256) / L6_ANKY_RING), L6_ANKY_SPEED); }
        emit(sim, { type: 'club', x: px(e.x), y: px(e.y) });
      }
      return;
    case HERRERA: case DILOPHO: case ARCHELON:                // on the ground, going by with it: they attack while they are in view
      e.y += L6_GROUND_VY * ONE;
      if (e.y < L6_TURRET_FROM * ONE || e.y > L6_TURRET_TO * ONE) return;
      if (e.type === HERRERA) { if (e.t % L6_HERRERA_PERIOD === 0) { const a = angleOf(sim.px - e.x, sim.py - e.y); for (const off of L6_HERRERA_FAN) spit(sim, e.x, e.y, a + off, L6_HERRERA_SPEED, FIRE); emit(sim, { type: 'enemyFire', x: px(e.x), y: px(e.y) }); } }
      else if (e.type === DILOPHO) {
        if (e.t % L6_DILOPHO_PERIOD === L6_DILOPHO_PERIOD - L6_DILOPHO_WARN) emit(sim, { type: 'frillUp', id: e.id, x: px(e.x), y: px(e.y), ticks: L6_DILOPHO_WARN });
        if (e.t % L6_DILOPHO_PERIOD === 0) { const a = angleOf(sim.px - e.x, sim.py - e.y); for (const off of L6_DILOPHO_FAN) spit(sim, e.x, e.y, a + off, L6_DILOPHO_SPEED, VENOM); emit(sim, { type: 'enemyFire', x: px(e.x), y: px(e.y) }); }
      } else if (e.t % L6_ARCHELON_PERIOD === 0) { e.a = (e.a + L6_ARCHELON_STEP) & 255; spit(sim, e.x, e.y, e.a, L6_ARCHELON_SPEED, VENOM); spit(sim, e.x, e.y, e.a + 128, L6_ARCHELON_SPEED, VENOM); }
      return;
    case PETEINO: case RHAM: {                                // weave down the screen, shooting at the ship
      const rh = e.type === RHAM;
      e.y += (rh ? L6_RHAM_VY : L6_PETEINO_VY) * ONE; e.x += Math.trunc((SIN[(e.t * (rh ? 5 : 3) + e.id * 37) & 255] * (rh ? L6_RHAM_SWAY : L6_PETEINO_SWAY)));
      if (e.t % (rh ? L6_RHAM_PERIOD : L6_PETEINO_PERIOD) === 20 && e.y > 0 && e.y < 900 * ONE) {
        const a = angleOf(sim.px - e.x, sim.py - e.y);
        if (rh) { spit(sim, e.x, e.y, a - 5, L6_RHAM_SPEED, VENOM); spit(sim, e.x, e.y, a + 5, L6_RHAM_SPEED, VENOM); } else spit(sim, e.x, e.y, a, L6_PETEINO_SPEED, FIRE);
      }
      return;
    }
    case ICHTHY:                                              // crosses in a line, dropping fire straight down
      e.x += e.vx;
      if (e.t % L6_ICHTHY_PERIOD === (e.id * 7) % L6_ICHTHY_PERIOD && e.x > 30 * ONE && e.x < (WORLD_W - 30) * ONE) spit(sim, e.x, e.y, 64, L6_ICHTHY_SPEED, FIRE);
      return;
    case DROMAEO:                                             // a pack running across the ground, spitting at the ship as it goes
      e.x += e.vx; e.y += L6_GROUND_VY * ONE;
      if (e.t % L6_DROMAEO_PERIOD === (e.id * 11) % L6_DROMAEO_PERIOD && e.x > 20 * ONE && e.x < (WORLD_W - 20) * ONE) spit(sim, e.x, e.y, angleOf(sim.px - e.x, sim.py - e.y), L6_DROMAEO_SPEED, VENOM);
      return;
    case PACHY:                                               // picks its line, rams down it, and where it pulls up it bursts into a ring of fire
      if (e.q === 0) { e.y += 4 * ONE; if (e.y >= 70 * ONE) { e.q = 1; e.qd = L6_PACHY_WARN; e.x = clampX(sim.px); emit(sim, { type: 'chargeLine', id: e.id, x: px(e.x), w: KIND[PACHY].r, ticks: L6_PACHY_WARN }); } }
      else if (e.q === 1) { if (--e.qd <= 0) e.q = 2; }
      else if (e.q === 2) { e.y += L6_PACHY_SPEED * ONE; if (e.y >= L6_PACHY_BURST_Y * ONE) { e.q = 3; for (let k = 0; k < L6_PACHY_RING; k++) spit(sim, e.x, e.y, Math.floor((k * 256) / L6_PACHY_RING) + 13, L6_PACHY_RING_SPEED, FIRE); emit(sim, { type: 'club', x: px(e.x), y: px(e.y) }); } }
      else e.y += 6 * ONE;
      return;
    default: e.y += 4 * ONE;
  }
}

/** Called by the engine once a boss is in position and not stunned or charging; t = ticks since it took position. */
function boss(sim, e, t, { sig, rage, P, D }) {
  const L = sim.l6, at = (period, phase) => t % period === phase;
  // what it keeps up all the time: a fan of three at the ship, rings that turn a little each time, and (a boss, from
  // its frame stage on) a spiral
  const pat = L6_PATTERNS[KIND[e.type].name];
  if (pat) {
    const fan = D(P(pat.fan)), [rp, rn, twist] = pat.ring, ringP = D(P(rp));
    if (t % fan === 0 && t > 0) aimed3(sim, e);
    if (t % ringP === ringP >> 1) { ring(sim, e.x, e.y, rn, (Math.floor(t / ringP) * twist) & 255, 3); emit(sim, { type: 'bossRing', x: px(e.x), y: px(e.y) }); }
    if (pat.spiral && sig && t % L6_SPIRAL_EVERY === 0) spiral(sim, e, pat.spiral + (rage ? 1 : 0));
  }
  switch (e.type) {
    case POSTO: if (at(CHARGE_PERIOD, CHARGE_PERIOD >> 1) && !e.pk) chargeUp(sim, e); return;
    case ALLO:                                                // the claw: a line from it toward where the ship is, announced, then it stays for a second
      if (at(L6_CLAW_PERIOD, 150)) {
        const a = angleOf(sim.px - e.x, sim.py - e.y), x0 = e.x + COS[a] * 200, y0 = e.y + SIN[a] * 200, x1 = e.x + COS[a] * (L6_CLAW_LEN + 200), y1 = e.y + SIN[a] * (L6_CLAW_LEN + 200);
        L.marks.push({ x0, y0, x1, y1, pw: L6_CLAW_WARN, bt: L6_CLAW_STAYS });
        emit(sim, { type: 'clawUp', x0: px(x0), y0: px(y0), x1: px(x1), y1: px(y1), ticks: L6_CLAW_WARN });
      }
      return;
    case QUETZ:                                               // a gust, and ice from its wings
      if (at(L6_GUST_PERIOD, 200) && !L.gust) { const dir = Math.floor(t / L6_GUST_PERIOD) % 2 ? -1 : 1; L.gust = { dir, pw: L6_WIND_WARN, bt: L6_WIND_BLOW }; emit(sim, { type: 'windUp', dir, ticks: L6_WIND_WARN }); }
      if (at(L6_GUST_PERIOD, 200 + L6_WIND_WARN + 30)) for (let i = 0; i < L6_ICE; i++) sim.bullets.push({ x: e.x + Math.trunc((i - (L6_ICE - 1) / 2) * 90) * ONE, y: e.y + 20 * ONE, vx: 0, vy: L6_ICE_SPEED * ONE, grazed: 0 });
      return;
    case SPINO:                                               // each spine in turn: a column of lightning, left to right
      if (at(L6_BOLT_PERIOD, 180)) for (let i = 0; i < L6_BOLTS; i++) L.bolts.push({ at: sim.tick + i * L6_BOLT_EVERY, x: clampX(e.x + (i - (L6_BOLTS >> 1)) * L6_BOLT_STEP * ONE) });
      return;
    case PLATEO:                                              // aimed shots; the sweep: a ray across the screen, live and dead by turns
      if (at(L6_B1_SHOT_PERIOD, 0) && t > 0) fire(sim, e.x, e.y, angleOf(sim.px - e.x, sim.py - e.y), L6_B1_SHOT_SPEED);
      if (at(L6_B1_SWEEP_PERIOD, 120)) { e.q = 1; e.qd = WALL_TELEGRAPH; openFor(sim, e, L6_B1_OPEN + L6_OPEN_TAIL); emit(sim, { type: 'wall', id: e.id, y: px(e.y), ticks: WALL_TELEGRAPH }); }
      if (e.q === 1 && --e.qd <= 0) { e.q = 0; sim.rays.push({ y: e.y, t: sig ? RAY_ON : 0 }); emit(sim, { type: 'wallFire', x: px(e.x), y: px(e.y) }); }
      return;
    case DIPLO:                                               // rings; its tail lays a band across the screen where bullets crawl, then spring back to speed
      if (at(L6_SLOW_PERIOD, 120) && !L.band) {
        L.band = { y0: L6_SLOW_TOP * ONE, y1: (L6_SLOW_TOP + L6_SLOW_H) * ONE, pw: L6_SLOW_WARN, bt: L6_SLOW_TICKS };
        openFor(sim, e, L6_SLOW_WARN + L6_SLOW_TICKS + L6_OPEN_TAIL); emit(sim, { type: 'slowUp', y0: L6_SLOW_TOP, y1: L6_SLOW_TOP + L6_SLOW_H, warn: L6_SLOW_WARN, ticks: L6_SLOW_TICKS });
      }
      return;
    case MOSA:                                                // darts; the lunge (the engine's charge), whose landing sends the rings out (see before())
      if (at(L6_B3_SHOT_PERIOD, 0) && t > 0) { const a = angleOf(sim.px - e.x, sim.py - e.y); fire(sim, e.x - 30 * ONE, e.y, a, 5); fire(sim, e.x + 30 * ONE, e.y, a, 5); }
      if (at(CHARGE_PERIOD, CHARGE_PERIOD >> 1) && !e.pk) { chargeUp(sim, e); openFor(sim, e, L6_B3_OPEN + L6_OPEN_TAIL); }
      return;
    case TREX:                                                // rings; rifts either side that spit needles inward; as a core, a gravity well
      if (!rage && at(L6_RIFT_PERIOD, 150) && !L.rifts) {
        L.rifts = { xl: clampX(e.x - L6_RIFT_X * ONE), xr: clampX(e.x + L6_RIFT_X * ONE), pw: L6_RIFT_WARN, bt: L6_RIFT_TICKS, n: 0 };
        openFor(sim, e, L6_RIFT_WARN + L6_RIFT_TICKS + L6_OPEN_TAIL); emit(sim, { type: 'riftUp', xl: px(L.rifts.xl), xr: px(L.rifts.xr), warn: L6_RIFT_WARN, ticks: L6_RIFT_TICKS });
      }
      if (rage && at(L6_WELL_PERIOD, 100) && !L.well) {
        const n = L.wells++, x = (160 + rng.int(sim.seed, 'well', 2 * n, 400)) * ONE, y = (480 + rng.int(sim.seed, 'well', 2 * n + 1, 320)) * ONE;
        L.well = { x, y, pw: L6_WELL_WARN, bt: L6_WELL_TICKS };
        openFor(sim, e, L6_WELL_WARN + L6_WELL_TICKS + L6_OPEN_TAIL); emit(sim, { type: 'wellUp', x: px(x), y: px(y), r: L6_WELL_R, warn: L6_WELL_WARN, ticks: L6_WELL_TICKS });
      }
      return;
    default:
  }
}

// ---------- geometry the hazards share ----------
/** Is (x, y) within `half` px of the segment (x0, y0)-(x1, y1)? Coordinates are sub-pixels. Whole numbers only. */
function onSegment(x, y, x0, y0, x1, y1, half) {
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy;
  if (len2 === 0) return false;
  const u = (x - x0) * dx + (y - y0) * dy;                    // how far along, times the length
  const cx = u <= 0 ? x0 : u >= len2 ? x1 : x0 + Math.trunc((dx * u) / len2), cy = u <= 0 ? y0 : u >= len2 ? y1 : y0 + Math.trunc((dy * u) / len2);
  const ex = x - cx, ey = y - cy, r = half * ONE;
  return ex * ex + ey * ey <= r * r;
}
/** The sweep's far end for angle a. */
export const sweepTip = a => [L6_SWEEP_X * ONE + COS[a & 255] * L6_SWEEP_LEN, L6_SWEEP_Y * ONE + SIN[a & 255] * L6_SWEEP_LEN];

/** Does one of the leg's hazards cover (x, y) (sub-pixels) for a body of radius r px, `k` ticks from now? What is
 *  announced counts from the tick it will go live. Used for the ship this tick (k = 0) and by the pilots, who look
 *  ahead with it: everything in here is drawn on screen before it can hurt. */
export function danger(sim, x, y, r, k = 0) {
  const L = sim.l6, g = L6_GROUND_VY * ONE * k;
  for (const b of L.bombs) { const live = b.pw > 0 ? k >= b.pw && k < b.pw + L6_BOMB_LIVE : k < b.bt; if (live && near(b.x, b.y + g, x, y, L6_BOMB_R + r)) return true; }
  if (L.sweep === 2 || (L.sweep === 1 && k >= L.sweepT)) { const [tx, ty] = sweepTip(L.sweepA + (L.sweep === 2 ? k : k - L.sweepT)); if (onSegment(x, y, L6_SWEEP_X * ONE, L6_SWEEP_Y * ONE, tx, ty, L6_SWEEP_HALF + r)) return true; }
  for (const m of L.marks) { const live = m.pw > 0 ? k >= m.pw && k < m.pw + m.bt : k < m.bt; if (live && onSegment(x, y, m.x0, m.y0, m.x1, m.y1, L6_CLAW_HALF + r)) return true; }
  for (const e of sim.enemies) {
    if (e.type === ELASMO) {                                  // the neck: a column above where it came up
      const out = e.q === 1 ? k < e.qd : e.q === 0 && k >= L6_NECK_WARN - e.t && k < L6_NECK_WARN - e.t + L6_NECK_OUT;
      if (out && Math.abs(x - e.x) <= (L6_NECK_HALF + r) * ONE && y <= e.y + g + r * ONE && y >= e.y + g - (L6_NECK_LEN + r) * ONE) return true;
    } else if ((e.type === PTERA || e.type === TRIKE || e.type === PACHY) && (e.q === 1 || e.q === 2) && k > 0) {   // the line a dive or a charge will take (looking ahead only: its body is the engine's business)
      if (Math.abs(x - e.x) <= (KIND[e.type].r + r) * ONE && (e.q === 2 || k >= e.qd) && y >= e.y) return true;
    }
  }
  return false;
}

/** Where a creature will be k ticks from now, as far as can be told from what it is showing: [x, y] in sub-pixels.
 *  For the pilots (tools/strategies.mjs). A creature that has not chosen its line yet is taken to choose the ship's
 *  present position. */
export function predict(sim, e, k) {
  const along = (a, n, speed) => [e.x + COS[a & 255] * speed * n, e.y + SIN[a & 255] * speed * n];
  switch (e.type) {
    case EUDI: if (e.q === 2) return along(e.pv, k, L6_DIVE_SPEED); if (e.q === 1) return along(e.pv, Math.max(0, k - e.qd), L6_DIVE_SPEED); return [e.x, Math.min(L6_DIVE_Y * ONE, e.y + L6_DIVE_IN * ONE * k)];
    case ORNI: { if (e.q === 1) return along(e.pv, k, L6_ORNI_SPEED); const wait = Math.max(0, L6_ORNI_WARN - e.t), y = e.y + L6_GROUND_VY * ONE * Math.min(k, wait); if (k <= wait) return [e.x, y]; const a = angleOf(sim.px - e.x, sim.py - y); return [e.x + COS[a] * L6_ORNI_SPEED * (k - wait), y + SIN[a] * L6_ORNI_SPEED * (k - wait)]; }
    case PETEINO: return [e.x, e.y + L6_PETEINO_VY * ONE * k];
    case RHAM: return [e.x, e.y + L6_RHAM_VY * ONE * k];
    case ICHTHY: return [e.x + e.vx * k, e.y];
    case PACHY: return [e.x, e.q === 2 ? e.y + L6_PACHY_SPEED * ONE * k : e.q === 1 ? e.y + L6_PACHY_SPEED * ONE * Math.max(0, k - e.qd) : e.q === 3 ? e.y + 6 * ONE * k : e.y];
    case PTERA: return [e.x, e.q === 2 ? e.y + L6_PTERA_SPEED * ONE * k : e.q === 1 ? e.y + L6_PTERA_SPEED * ONE * Math.max(0, k - e.qd) : e.y];
    case TRIKE: return [e.x, e.q === 2 ? e.y + L6_TRIKE_SPEED * ONE * k : e.q === 1 ? e.y + L6_TRIKE_SPEED * ONE * Math.max(0, k - e.qd) : e.y];
    default: return [e.x, e.y + (KIND[e.type].ground ? L6_GROUND_VY * ONE * k : 0)];
  }
}

// ---------- hooks the engine calls ----------
const LEG6 = Object.freeze({
  schedule, obstacles, init, before, move, boss, bossType, danger, predict,
  /** How far to one side of e a shot has to be aimed to hurt it (px): the triceratops's flank, on the ship's side of it. */
  aim(sim, e) { return e.type === TRIKE ? (sim.px >= e.x ? 1 : -1) * (L6_SHIELD_HALF + 8) : 0; },
  /** What the place does to something in flight (a bullet, or a shot when isShot): the wind carries it, the slow
   *  band holds a bullet back, the well bends both. Called just before the engine moves it. */
  bend(sim, a, isShot) {
    const L = sim.l6, push = blowing(sim);
    if (push) a.x += push * L6_WIND_PUSH * ONE;
    if (!isShot && L.band && L.band.pw === 0 && a.y >= L.band.y0 && a.y <= L.band.y1) { a.x -= a.vx - Math.trunc(a.vx / L6_SLOW_KEEP); a.y -= a.vy - Math.trunc(a.vy / L6_SLOW_KEEP); }   // it moves 1 / KEEP as far this tick
    const w = L.well;
    if (w && w.pw === 0 && near(a.x, a.y, w.x, w.y, L6_WELL_R)) {
      const ang = angleOf(w.x - a.x, w.y - a.y);
      a.vx += COS[ang] >> L6_WELL_PULL_SHIFT;
      if (isShot) a.vy -= SIN[ang] >> L6_WELL_PULL_SHIFT; else a.vy += SIN[ang] >> L6_WELL_PULL_SHIFT;   // a shot's vy counts upward
    }
  },
  /** Is this shot stopped by e? The triceratops's shield: straight on (within L6_SHIELD_HALF of its middle) nothing gets through. */
  blocks(sim, e, s) { return e.type === TRIKE && Math.abs(s.x - e.x) <= L6_SHIELD_HALF * ONE && s.y >= e.y - 10 * ONE && s.y <= e.y + (KIND[TRIKE].r + SHOT_R) * ONE; },
  hazard(sim, bodyR) { return danger(sim, sim.px, sim.py, bodyR, 0); },
  /** Damage to e after the leg's rules: a boss whose weak point is closed takes L6_CLOSED_PCT of it, kept exact by a remainder. */
  scale(sim, e, dmg) {
    if (!isBoss(e.type) || isMid(e.type) || sim.l6.open > 0) return dmg;
    sim.l6.acc += dmg * L6_CLOSED_PCT;
    const whole = Math.trunc(sim.l6.acc / 100);
    sim.l6.acc -= whole * 100;
    return whole;
  },
  hash(sim, h) {
    const L = sim.l6;
    h.mixAll([L.nextBomb, L.open, L.acc, L.bombs.length, L.sweep, L.sweepA, L.sweepT, L.marks.length, L.bolts.length, L.rings.length, L.wells, L.meteors]);
    for (const b of L.bombs) h.mixAll([b.x, b.y, b.pw, b.bt]);
    for (const [id, k] of L.packs) h.mixAll([id, k.lost, k.paid]);
    for (const m of L.marks) h.mixAll([m.x0, m.y0, m.x1, m.y1, m.pw, m.bt]);
    if (L.gust) h.mixAll([1, L.gust.dir, L.gust.pw, L.gust.bt]);
    if (L.band) h.mixAll([2, L.band.pw, L.band.bt]);
    if (L.rifts) h.mixAll([3, L.rifts.xl, L.rifts.xr, L.rifts.pw, L.rifts.bt, L.rifts.n]);
    if (L.well) h.mixAll([4, L.well.x, L.well.y, L.well.pw, L.well.bt]);
    for (const b of L.bolts) h.mixAll([b.at, b.x]);
    for (const r of L.rings) h.mixAll([r.at, r.x, r.y, r.off]);
  },
});

/** Pay for the packs that are finished: every one of it down, none got away. */
function settlePacks(sim) {
  const now = Math.floor(clock(sim) / UNIT_TICKS), alive = new Set();
  for (const e of sim.enemies) if (e.type === COELO) alive.add(e.t === 0 ? now : e.pv);
  for (let i = sim.nextSpawn; i < sim.plan.length && sim.plan[i].at < (now + 1) * UNIT_TICKS; i++) if (sim.plan[i].type === COELO) alive.add(Math.floor(sim.plan[i].at / UNIT_TICKS));
  for (const [id, k] of sim.l6.packs) {
    if (k.paid || id > now || alive.has(id)) continue;
    k.paid = 1;
    if (!k.lost) { sim.score += L6_PACK_BONUS; sim.killPts += L6_PACK_BONUS; emit(sim, { type: 'packBonus', pts: L6_PACK_BONUS }); }
  }
}

export const GAME6 = Object.freeze({
  id: 'sky-talon-leg6', version: 4, maxTicks: MAX_TICKS, maxChoices: SUPPLIES,
  createSim: seed => createSim(seed, LEG6), step, phase, choose, score, stateHash, scoreBreakdown,
});
