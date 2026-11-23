// SkyTalon — top-down scrolling shooter. Spec: ../../../gdd/05_game_spec.md (every number here is in the spec).
// Deterministic: integers only, no rendering, no wall clock, no unseeded randomness.
// Same seed + same input bytes = same score.
//
// The ship fires by itself; the player only steers (8 directions). Points come from destroying enemies (worth more
// while the chain of kills without being hit is long), from letting enemy bullets pass close (graze), from downing
// the boss early and from the shields left at the end. Difficulty is a fixed script (WAVES): the seed only picks
// lanes and the order inside a 4-second unit, never how much there is to deal with.
//
// v2: at four fixed ticks the match stops for a choice (phase 'choice'): one of three cards, one per axis (firepower,
// defence, scoring). Cards rotate in a fixed order per axis; the seed only sets where each rotation starts, and what
// the player picks never changes what is offered later. Cards only change parameters: picking one scores nothing.
//
// v4: three chapters on one script clock (clock = tick + skip). Downing a chapter's boss early skips the rest of its
// window, so the next chapter starts on the next tick; a boss that outlasts its window leaves and scores nothing.
// Chapters 2 and 3 bring telegraphed attacks (aimed lances, walls with a gap), mines and splitting enemies. After
// bosses 1 and 2 the player picks an airframe mod (three fixed options, the same for everyone).
//
// v7: every chapter has a mid-boss and a boss; between the parts and between chapters comes a boost unit with nothing
// entering. Downing either gives a supply: a paused choice of one of three pieces of gear, then straight on.
//
// v10: a boss is a ship far bigger than the screen. Only its core takes damage. While its armour is on (stage 0) the
// plated parts either side of the core stop shots dead: the way in is the lane straight under the core. Two bosses
// (Oceanus, Eos) also charge: an announced lunge down the screen, lethal along its lane, back again afterwards.
//
// v9: bosses are bigger and come in three stages (armour, frame, core): a stage has to be shot through before the
// next takes damage, and when it breaks the boss stops for a second and its bullets are gone. A mid-boss is behind a
// shield that returns if it is left alone for three seconds.
//
// v8: one match is one leg of four chapters. Chapters are a little longer and less alike: some drones enter in
// formation, each chapter has one set-piece unit (a convoy, a storm, a gorge, a meteor shower) and two elites that are
// seen to carry a drop. Later chapters are tougher (more health, then a shell that weak shots must chip off). A boss
// below half health attacks faster and gains one attack of its own. A supply is the boost: after the pick only a short
// run-up is left.
//
// v6: cards and mods became one set of gear (eight kinds, all can be held at once); none of it touches a scoring
// parameter. Some enemies of the spawn list carry a drop (decided by the seed, never rolled at the kill); canyon peaks
// and meteors are obstacles that cannot be destroyed. The end bonus counts hits taken, so healing buys no points.
//
// v5: a fourth chapter above the atmosphere. Seekers turn toward the ship (the player leads them); beams are columns
// that stay for a while after a warning and are not bullets: nothing clears them and they cannot be grazed.
import { makeRng, createHasher, TPS, ONE, SIN, COS, DX, DY, angleOf, clamp } from './core/index.js';

export { TICK_MS } from './core/index.js';

// --- Spec §2 input byte: bits 0-3 = direction code (0 stop, 1-8 = DX/DY[code - 1]) ---
export const IN_DIR_MASK = 15;

// --- Spec §3 random streams (never renumber after release) ---
const rng = makeRng({ lane: 1, order: 2, boss: 3, offer: 4, gap: 5, drop: 6, dropKind: 7, gear: 8, obstacle: 9, obstLane: 10, formation: 11, elite: 12, event: 13 });

// --- Spec §0 world (pixels; positions are stored in 1/ONE sub-pixels) ---
export const WORLD_W = 720;
export const WORLD_H = 1280;
export const UNIT_TICKS = 4 * TPS;
export const CHAPTERS = 4;
export const CHAPTER_FROM = Object.freeze([0, 27, 50, 74]); // script units
export const END_UNIT = 97;
export const MATCH_TICKS = END_UNIT * UNIT_TICKS;           // 23280: only reached when every boss runs out its window
export const BOOST_TICKS = 120;        // v8: a boost after a boss that got away
export const BOOST_AFTER_PICK = 30;    // v8: after a supply the choice was the boost; only this run-up is left

// --- Spec §5 player ---
export const PLAYER_SPEED = 7;        // px per tick on an axis
export const PLAYER_R = 9;            // hit circle
export const GRAZE_R = 38;            // a bullet this close without hitting = graze
export const SHIELDS = 3;
export const INVULN_TICKS = 90;
export const PICK_INVULN = 45;         // v3: after a pick, spec §8
export const PICK_CLEAR_R = 200;       // v3: a pick removes the enemy bullets this close to the ship (a full sweep was a free bomb)
export const FIRE_PERIOD = 5.5;       // v12: ticks between volleys with no rapid fire (was 5): 10% slower. Counted in half ticks below
export const SHOT_SPEED = 22;          // px per tick before the cut below (kept: the spec quotes both)
export const SHOT_SLOW_PCT = 20;       // v8: every shot of the ship and of the wingmen starts this much slower
export const SHOT_V = Math.trunc((SHOT_SPEED * ONE * (100 - SHOT_SLOW_PCT)) / 100);   // sub-pixels per tick (17.6 px)
export const SHOT_R = 8;
export const SHOT_OFFSET = 14;        // twin shots at x ± this
export const PLAYER_MIN_Y = 230;       // v8: the room to fly reaches 15% higher (was 360)
export const PLAYER_MAX_Y = 1230;
export const PLAYER_MARGIN_X = 30;
export const PLAYER_START_Y = 1040;

// --- Spec §5 enemies ---
export const DRONE = 0, GUNNER = 1, WEAVER = 2, DIVER = 3, BOSS = 4;
export const LANCER = 5, MINER = 6, MINE = 7, BULWARK = 8, SPLITTER = 9, SHARD = 10, BOSS2 = 11, BOSS3 = 12;
export const SEEKER = 13, BEAMER = 14, BOSS4 = 15;
export const MID1 = 16, MID2 = 17, MID3 = 18, MID4 = 19;
export const CARRIER = 20;             // v8: the convoy's transports (no guns, always carry a drop)
export const isMid = type => (type >= MID1 && type <= MID4) || !!KIND[type]?.mid;
export const isBoss = type => type === BOSS || type === BOSS2 || type === BOSS3 || type === BOSS4 || isMid(type) || !!KIND[type]?.boss;
/** The eight boss slots in order: a mid-boss and a boss per chapter. `from`..`end` is its window in script units;
 *  `end` is also the boost unit that follows (the end of the match for the last one). */
export const BOSS_SLOTS = Object.freeze([
  { type: MID1, from: 14, end: 17 }, { type: BOSS, from: 21, end: 26 }, { type: MID2, from: 37, end: 40 }, { type: BOSS2, from: 44, end: 49 },
  { type: MID3, from: 60, end: 63 }, { type: BOSS3, from: 67, end: 73 }, { type: MID4, from: 84, end: 87 }, { type: BOSS4, from: 91, end: 97 },
]);
export const BOSS_TICK = BOSS_SLOTS[0].from * UNIT_TICKS;
// v12: the spread's angled shots leave from in front of the wings (SPREAD_WING_X), not from the nose; with no rapid fire
// the ship fires every 5.5 ticks (FIRE_PERIOD), 10% slower than before.
//
// v11: a leg may add kinds of its own after these (registerKinds). An added kind may carry: boss / mid (it is one),
// ground (the ship does not collide with it), armour ([inner, outer, top, bottom], as BOSS_ARMOUR), leg (its moves
// are the leg's). Leg one's entries are never changed by another leg.
export const KIND = [
  { name: 'drone', hp: 2, r: 22, pts: 10 },
  { name: 'gunner', hp: 6, r: 26, pts: 30 },
  { name: 'weaver', hp: 4, r: 24, pts: 25 },
  { name: 'diver', hp: 2, r: 20, pts: 20 },
  { name: 'boss', hp: 255, r: 92, pts: 1000 },
  { name: 'lancer', hp: 5, r: 22, pts: 35 },
  { name: 'miner', hp: 3, r: 24, pts: 30 },
  { name: 'mine', hp: 2, r: 16, pts: 5 },
  { name: 'bulwark', hp: 14, r: 34, pts: 60 },
  { name: 'splitter', hp: 6, r: 26, pts: 20 },
  { name: 'shard', hp: 1, r: 14, pts: 10 },
  { name: 'boss2', hp: 440, r: 100, pts: 1500 },
  { name: 'boss3', hp: 650, r: 108, pts: 2500 },
  { name: 'seeker', hp: 3, r: 18, pts: 25 },
  { name: 'beamer', hp: 10, r: 28, pts: 50 },
  { name: 'boss4', hp: 1700, r: 116, pts: 4000 },
  { name: 'mid1', hp: 98, r: 60, pts: 500 },
  { name: 'mid2', hp: 140, r: 65, pts: 750 },
  { name: 'mid3', hp: 190, r: 70, pts: 1250 },
  { name: 'mid4', hp: 280, r: 74, pts: 2000 },
  { name: 'carrier', hp: 18, r: 36, pts: 40 },
];
/** Add a leg's kinds to the table; returns the type number of the first one. Call once, when the leg's module loads. */
export function registerKinds(list) { const first = KIND.length; for (const k of list) KIND.push(Object.freeze({ ...k, leg: 1 })); return first; }
// v8 variety
export const COLUMN = 0, VEE = 1, PINCER = 2, ARC = 3;
export const FORM_MIN = 3;              // a unit needs this many drones to fly them in formation
/** How many of a unit's `d` drones fly in the formation: all of them, less one where the shape needs a pair or a tip. */
export const formSize = (kind, d) => (kind === VEE ? d - (d % 2 ? 0 : 1) : kind === PINCER ? d - (d % 2) : d);
export const FORM_VX = 3;              // pincer drones come in sideways this fast
export const ARC_VX = 4;               // an arc starts sideways this fast and bends back by ARC_BEND sub-pixels per tick
export const ARC_BEND = 6;
export const ELITE_HP = 4;             // an elite: this many times the health and its shell twice over,
export const ELITE_PTS = 3;            // this many times the base points,
export const ELITE_R = [3, 2];         // 1.5 times the size
export const CARRIERS = 3;
export const CARRIER_VX = 3;
export const STRIKES = 3;              // lightning columns of the storm (the beam's warning and duration)
export const GORGE_ROWS = 6;
export const GORGE_HALF = 110;         // half the width of the way through, px
export const GORGE_SWAY = 130;
export const SHOWER = 12;              // meteors in the shower unit
// v9 bosses: three stages. Health at which the armour (stage 0) and the frame (stage 1) break, as a percentage of the
// whole; the frame stage adds the boss's own attack, the core stage is BOSS_RAGE_PCT faster and a smaller target.
export const STAGE_FLOOR_PCT = Object.freeze([60, 25]);
export const CORE_R_PCT = 60;
export const BREAK_STUN = 60;          // ticks a boss or mid-boss holds its fire after a stage or its shield breaks
export const BREAK_PTS = Object.freeze([200, 300]);
export const MID_SHIELD_PCT = 25;      // a mid-boss's shield, as a percentage of its health
export const MID_SHIELD_REGEN = 180;   // ticks without being hit before a broken shield returns,
export const MID_SHIELD_REFILLS = 2;   // at most this many times
export const BOSS_RAGE_PCT = 25;
// v10: a boss's bullet patterns (rings, aimed fans, spirals) come this much more often than their base periods say
export const BOSS_DENSITY_PCT = 120;
// v10: bosses have more health than their windows were cut for, so a window that runs out is held open this much
// longer (a percentage of its own length: mid-boss, boss) before the boss leaves. The script clock stands still meanwhile.
export const OVERTIME_PCT = Object.freeze([100, 100]);
export const LAST_OVERTIME_PCT = 150;                       // the last boss is the long fight of the match: its window is held open far longer
export const overtime = slot => { const sl = BOSS_SLOTS[slot]; return Math.trunc(((sl.end - sl.from) * UNIT_TICKS * (slot === BOSS_SLOTS.length - 1 ? LAST_OVERTIME_PCT : OVERTIME_PCT[slot % 2])) / 100); };
export const MAX_TICKS = MATCH_TICKS + BOSS_SLOTS.reduce((n, _, i) => n + overtime(i), 0);   // the longest a match can last
// v10 armour, per boss, in px from the core: [inner, outer, top, bottom]. A shot whose |dx| is between inner and outer
// and whose dy is between top and bottom is stopped (no damage) while the boss is in stage 0. The plasma is not a shot.
export const BOSS_ARMOUR = Object.freeze({ 4: [80, 165, -60, 290], 11: [85, 174, -100, 240], 12: [90, 183, -110, 150], 15: [125, 192, -60, 150] });
// v10 charge (Oceanus and Eos, from the frame stage on): it stops and announces for CHARGE_WARN ticks, lunges
// CHARGE_DEPTH px down at CHARGE_SPEED, holds, and climbs back at CHARGE_BACK. While it is down, the lane
// CHARGE_HALF_W either side of it, from the core to CHARGE_REACH below it, costs a hit.
export const CHARGE_BOSSES = Object.freeze([4, 12]);
export const CHARGE_PERIOD = 480, CHARGE_WARN = 60, CHARGE_SPEED = 16, CHARGE_DEPTH = 360, CHARGE_HOLD = 18, CHARGE_BACK = 5;
export const CHARGE_HALF_W = 110, CHARGE_REACH = 290;
export const BOSS_TIDE_PERIOD = 160;   // Oceanus: four small rings in a row, turning one way, then the other
export const BOSS_TIDE_PULSES = 4;
export const BOSS_TIDE_STEP = 6;
export const BOSS2_CROSS_PERIOD = 120; // Nyx: two fast shots from the screen edges that cross on the ship
export const CROSS_X = 40;
export const BOSS3_PAIR_SHIFT = 4;     // Eos: a second wall whose gap has moved this many slots
export const BOSS4_VAULT_PERIOD = 170; // Atlas: a wide pair of beams, then the usual pair inside it
export const BOSS4_VAULT_OFFSET = 260;
export const LANES = 6;
export const LANE_X0 = 90;
export const LANE_STEP = 108;
export const SPAWN_Y = -40;
export const DRONE_VY = 3;
export const GUNNER_VY = 4;
export const GUNNER_HOVER_Y = 240;
export const GUNNER_HOVER_STEP = 28;   // each lane hovers this much lower than the previous one
export const GUNNER_HOVER_TICKS = 240;
export const GUNNER_PERIOD = 70;
export const WEAVER_VY = 2;
export const WEAVER_AMP = 110;
export const WEAVER_PERIOD = 80;
export const WEAVER_SPREAD = 14;       // angle steps (of 256) between the three bullets
export const DIVER_HOLD_Y = 110;
export const DIVER_HOLD_TICKS = 60;
export const DIVER_VY = 11;
export const DIVER_VX_MAX = 5;
export const BULLET_R = 7;
export const BULLET_SPEED = 4;         // aimed bullets, px per tick
export const SPREAD_SPEED = 3;
export const BOSS_Y = 220;
export const BOSS_AMP = 130;
export const BOSS_RING = 16;
export const BOSS_RING_PERIOD = 96;
export const BOSS_RING_PERIOD_LOW = 64;   // once below half health
export const BOSS_AIM_PERIOD = 48;
export const BOSS_AIM_SPREAD = 10;
export const BOSS_AIM_SPEED = 5;
// v4 enemies
export const LANCER_Y = 180;
export const LANCER_STEP = 20;
export const LANCER_PERIOD = 110;
export const LANCER_TELEGRAPH = 40;
export const LANCER_SPEED = 10;
export const LANCER_HOVER_TICKS = 330;
export const MINER_VX = 3;
export const MINER_Y = 150;
export const MINER_STEP = 30;
export const MINER_PERIOD = 50;
export const MINE_VY = 2;
export const MINE_FUSE = 150;
export const MINE_RING = 8;
export const BULWARK_Y = 200;
export const BULWARK_PERIOD = 130;
export const BULWARK_HOVER_TICKS = 400;
export const WALL_TELEGRAPH = 30;
export const WALL_SHOTS = 24;          // 30 px apart: nothing slips between two wall bullets, only through the gap
export const WALL_GAP = 5;
export const WALL_SPEED = 3;
// v8: the wall is a horizontal ray across the whole screen (not bullets). It comes down at WALL_SPEED and is live and
// dead by turns, in a fixed rhythm that starts live: the way past it is to cross while it is dead.
export const RAY_ON = 50;              // ticks live
export const RAY_OFF = 45;             // ticks dead (shrunk to a thread)
export const RAY_H = 10;               // half its thickness while live, px
export const rayLive = r => r.t % (RAY_ON + RAY_OFF) < RAY_ON;
export const SPLITTER_VY = 2;
export const SHARD_VX = 3;
export const SHARD_VY = 4;
export const BOSS2_SPIRAL_PERIOD = 6;
export const BOSS2_SPIRAL_STEP = 11;
export const BOSS2_LANCE_PERIOD = 90;
export const BOSS3_WALL_PERIOD = 100;
export const BOSS3_WALL_PERIOD_LOW = 140;
export const BOSS3_AIM_PERIOD = 60;
export const BOSS3_RING = 20;
export const BOSS3_RING_PERIOD = 72;
export const BOSS3_MINE_PERIOD = 120;
// v5 chapter 4
export const SEEKER_SPEED = 3;
export const SEEKER_TURN = 2;          // angle steps (of 256) per tick
export const SEEKER_LIFE = 420;
export const BEAMER_Y = 170;
export const BEAMER_STEP = 24;
export const BEAMER_PERIOD = 150;
export const BEAMER_HOVER_TICKS = 420;
export const BEAM_TELEGRAPH = 45;
export const BEAM_TICKS = 40;
export const BEAM_W = 26;              // half width, px
export const BOSS4_BEAM_PERIOD = 110;
export const BOSS4_BEAM_PERIOD_LOW = 130;
export const BOSS4_BEAM_OFFSET = 150;
export const BOSS4_SEEKER_PERIOD = 90;
export const BOSS4_RING_PERIOD = 80;
// v7 mid-bosses: each rehearses its chapter's boss with attacks the player has already met
export const MID_AIM_PERIOD = 60;
export const MID1_RING = 8;
export const MID1_RING_PERIOD = 120;
export const MID2_LANCE_PERIOD = 80;
export const MID2_MINE_PERIOD = 100;
export const MID3_WALL_PERIOD = 120;
export const MID4_SEEKER_PERIOD = 100;
export const MID4_BEAM_PERIOD = 140;

// --- Spec §6 scoring ---
export const CHAIN_STEP = 2;
export const CHAIN_CAP = 20;
export const GRAZE_PTS = 2;
export const SHIELD_PTS = 150;
export const BOSS_TIME_DIV = 4;        // 1 point per this many ticks left when the boss goes down

// --- Spec §5 gear (v6). Tables are indexed by level - 1. ---
export const RAPID = 0, SPREAD = 1, PIERCE = 2, HEAVY = 3, LASER = 4, WINGMAN = 5, BARRIER = 6, THRUSTERS = 7;
export const GEAR = Object.freeze([
  { id: 'rapid', name: '連射' }, { id: 'spread', name: '散射' }, { id: 'pierce', name: '穿透' }, { id: 'heavy', name: '重彈' },
  { id: 'laser', name: '電漿砲' }, { id: 'wingman', name: '僚機' }, { id: 'barrier', name: '護盾' }, { id: 'thrusters', name: '推進器' },
]);
export const GEAR_MAX_LV = 3;
export const RAPID_PERIOD = Object.freeze([4, 3, 2]);
export const SPREAD_SHOTS = Object.freeze([2, 2, 4]);
export const SPREAD_EVERY = Object.freeze([2, 1, 1]);   // v8: at level 1 the angled shots go out every second volley only
export const SPREAD_ANGLE = 10;        // angle steps (of 256) between neighbouring angled shots
export const SPREAD_WING_X = 24;       // v12: the angled shots leave from in front of the wings, this far to each side of the ship
export const PIERCE_COUNT = Object.freeze([1, 2, 3]);
// v8: each level is a step, none a leap. Firepower against the base (damage x rate): about x1.4, x1.7, x2.5.
export const HEAVY_DMG = Object.freeze([2, 2, 3]);
export const HEAVY_DELAY = Object.freeze([2, 1, 1]);
export const LASER_PERIOD = 30;
export const LASER_DMG = 2;
export const LASER_TARGETS = Object.freeze([1, 2, 3]);
export const LASER_RANGE = 700;
export const WING_OFFSET = 70;
export const WING_PERIOD = Object.freeze([15, 9, 6]);
export const BARRIER_INVULN = 60;
export const BARRIER_REBUILD = Object.freeze([300, 210, 210]);
export const BARRIER_CHARGES = Object.freeze([1, 1, 2]);
export const THRUST_SPEED = Object.freeze([8, 9, 9]);
export const THRUST_R = Object.freeze([8, 7, 6]);
const SPREAD_VX = [1, 2, 3].map(j => Math.trunc((SIN[j * SPREAD_ANGLE] * SHOT_V) / ONE)), SPREAD_VY = [1, 2, 3].map(j => Math.trunc((COS[j * SPREAD_ANGLE] * SHOT_V) / ONE));

// --- Spec §8 supplies (v7): a paused choice of one of three pieces of gear; one at the start, one for every mid-boss
// or boss shot down (not for one that got away) ---
export const SUPPLIES = 8;
export const SUPPLY_UNIT = 2;

// --- Spec §5 drops (v6): carried by enemies of the spawn list, picked up by flying into them ---
export const REPAIR = 0, HASTE = 1, BOOST = 2, AEGIS = 3, OVERHAUL = 4, UPGRADE = 5;
export const DROPS = Object.freeze(['repair', 'haste', 'boost', 'aegis', 'overhaul', 'upgrade']);
export const DROP_CHANCE = 4;          // of 100: how many enemies of the spawn list carry something
export const DROP_WEIGHTS = Object.freeze([36, 24, 20, 10, 0, 10]);   // v9: the full repair no longer drops (its share went to the +1 repair)
export const LIFE_CAP = 6;             // v9: picking gear that is already full raises the most life the ship can hold, up to this
export const DROP_VY = 2;               // (v6; since v8 a drop drifts and bounces instead of falling)
export const DROP_SPEED = [3, 2];      // v8: px per tick as a fraction (1.5)
export const DROP_LIFE = 1200;         // v8: a drop stays 20 s,
export const DROP_FADE_FROM = 900;     // and from 15 s on it is seen to fade
export const DROP_MIN_X = 40, DROP_MIN_Y = 60;   // the frame it bounces off (the bottom is the ship's own limit)
export const DROP_R = 44;
export const BUFF_TICKS = 480;
export const BOOST_SPEED = 2;
export const AEGIS_TICKS = 180;

// --- Spec §5 obstacles (v6): cannot be destroyed, stop shots and bullets, hurt on contact ---
export const PEAK = 0, METEOR = 1;
export const PEAK_R = 46;
export const PEAK_VY = 3;
export const PEAK_CHANCE = 25;
export const METEOR_R = 24;
export const METEOR_VY = 5;
export const METEOR_CHANCE = 30;
export const OBST_WARN = 45;
export const OBST_R = Object.freeze([PEAK_R, METEOR_R]);
// v10 (a hidden trick): heavy shots, and only those, break an obstacle: this many of them for a peak, for a meteor
export const OBST_HP = Object.freeze([3, 4]);

const lvl = (sim, g, table, base) => (sim.gear[g] ? table[sim.gear[g] - 1] : base);
/** The net evolution: with both spread and pierce, the angled shots pierce too. */
export const hasNet = sim => sim.gear[SPREAD] > 0 && sim.gear[PIERCE] > 0;

/** The order the eight kinds of gear come round in for this seed, and the three on offer at the k-th choice. */
const gearOrder = seed => rng.shuffle(seed >>> 0, 'offer', 0, [0, 1, 2, 3, 4, 5, 6, 7]);
export const offerAt = (seed, k) => { const o = gearOrder(seed); return [0, 1, 2].map(j => o[(3 * k + j) % o.length]); };
export const clock = sim => sim.tick + sim.skip;
const picking = sim => !sim.over && sim.supply >= 0;       // sim.supply = which supply is waiting (-1 none)
/** What is on offer right now (null outside a choice): three gear ids. */
export const offer = sim => (picking(sim) ? offerAt(sim.seed, sim.supply) : null);
const playerR = sim => lvl(sim, THRUSTERS, THRUST_R, PLAYER_R);

// --- Spec §5 difficulty script: one new pressure per section, a breather before the climax, the boss last ---
// `from` is in units of UNIT_TICKS. WAVES[k] = [drones, gunners, weavers, divers] entering during unit k.
// `hp` = extra health of the enemies entering in that section (bosses, mines, shards and seekers a boss lets out are not affected).
export const SCRIPT = Object.freeze([
  { name: '暖身', from: 0, safe: true, chapter: 0, hp: 0 },
  { name: '上升', from: 2, chapter: 0, hp: 1 },
  { name: '運輸機隊', from: 7, safe: true, event: 'convoy', chapter: 0, hp: 0 },
  { name: '加速', from: 8, chapter: 0, hp: 1 },
  { name: '小王一', from: 14, boss: true, slot: 0, chapter: 0 },
  { name: '過場', from: 17, boost: true, chapter: 0 },
  { name: '高潮', from: 18, chapter: 0, hp: 1 },
  { name: '頭目一', from: 21, boss: true, slot: 1, chapter: 0 },
  { name: '過場', from: 26, boost: true, chapter: 0 },
  { name: '二起', from: 27, safe: true, chapter: 1, hp: 2 },
  { name: '雷雲', from: 31, safe: true, event: 'storm', chapter: 1, hp: 0 },
  { name: '二承', from: 32, chapter: 1, hp: 2 },
  { name: '小王二', from: 37, boss: true, slot: 2, chapter: 1 },
  { name: '過場', from: 40, boost: true, chapter: 1 },
  { name: '二合', from: 41, chapter: 1, hp: 2 },
  { name: '頭目二', from: 44, boss: true, slot: 3, chapter: 1 },
  { name: '過場', from: 49, boost: true, chapter: 1 },
  { name: '三起', from: 50, safe: true, chapter: 2, hp: 2 },
  { name: '窄谷', from: 54, safe: true, event: 'gorge', chapter: 2, hp: 0 },
  { name: '三承', from: 55, chapter: 2, hp: 2 },
  { name: '小王三', from: 60, boss: true, slot: 4, chapter: 2 },
  { name: '過場', from: 63, boost: true, chapter: 2 },
  { name: '三合', from: 64, chapter: 2, hp: 2 },
  { name: '頭目三', from: 67, boss: true, slot: 5, chapter: 2 },
  { name: '過場', from: 73, boost: true, chapter: 2 },
  { name: '四起', from: 74, safe: true, chapter: 3, hp: 3, shell: 1 },
  { name: '隕石雨', from: 78, safe: true, event: 'shower', chapter: 3, hp: 0 },
  { name: '四承', from: 79, chapter: 3, hp: 3, shell: 1 },
  { name: '小王四', from: 84, boss: true, slot: 6, chapter: 3 },
  { name: '過場', from: 87, boost: true, chapter: 3 },
  { name: '四合', from: 88, chapter: 3, hp: 2, shell: 1 },
  { name: '頭目四', from: 91, boss: true, slot: 7, chapter: 3 },
]);
// WAVES[unit] = how many of each WAVE_TYPES enter during that script unit (missing columns are 0; boss, boost and event units are empty).
export const WAVE_TYPES = Object.freeze([DRONE, GUNNER, WEAVER, DIVER, LANCER, MINER, BULWARK, SPLITTER, SEEKER, BEAMER]);
const ROWS = {
  0: [[2, 0, 0, 0], [3, 0, 0, 0],                                                                  // 暖身
    [3, 1, 0, 0], [4, 1, 0, 0], [4, 2, 0, 0], [5, 2, 0, 0], [5, 3, 0, 0]],                        // 上升
  8: [[4, 1, 1, 0], [4, 2, 2, 0], [4, 2, 2, 0], [5, 2, 3, 0], [5, 2, 3, 0], [7, 2, 2, 0]],         // 加速（最後一個單位是編隊）
  18: [[4, 2, 2, 2], [4, 2, 3, 2], [4, 2, 3, 2]],                                                  // 高潮
  27: [[3, 0, 0, 0, 0], [3, 1, 0, 0, 1], [3, 1, 1, 0, 1], [4, 1, 1, 0, 2]],                        // 二起
  32: [[3, 1, 0, 0, 1, 1], [3, 1, 1, 0, 1, 1], [4, 1, 1, 1, 1, 2], [4, 2, 1, 1, 2, 2], [5, 2, 1, 1, 2, 2]],   // 二承
  41: [[4, 2, 2, 1, 1, 1], [4, 2, 2, 1, 2, 2], [4, 2, 2, 2, 2, 2]],                                // 二合
  50: [[3, 0, 0, 0, 0, 0, 0], [3, 1, 1, 0, 0, 0, 1], [4, 1, 1, 0, 1, 0, 1], [4, 1, 1, 1, 1, 0, 2]], // 三起
  55: [[3, 1, 1, 0, 1, 0, 1, 1], [3, 1, 1, 1, 1, 1, 1, 1], [4, 1, 1, 1, 1, 1, 1, 2], [4, 1, 2, 1, 1, 1, 2, 2], [5, 1, 2, 1, 1, 1, 1, 2]],   // 三承
  64: [[4, 1, 2, 1, 1, 1, 1, 2], [4, 2, 2, 1, 2, 1, 1, 2], [4, 2, 2, 2, 2, 1, 2, 2]],              // 三合
  74: [[3, 0, 0, 0, 0, 0, 0, 0, 2], [3, 1, 1, 0, 0, 0, 0, 1, 2], [4, 1, 1, 0, 1, 0, 1, 1, 3], [4, 1, 1, 1, 1, 1, 1, 1, 3]],   // 四起
  79: [[3, 1, 1, 0, 1, 0, 1, 1, 2, 1], [3, 1, 1, 1, 1, 1, 1, 1, 2, 1], [4, 1, 2, 1, 1, 1, 1, 2, 3, 2], [4, 2, 2, 1, 1, 1, 2, 2, 3, 2], [5, 2, 2, 1, 1, 1, 2, 2, 3, 2]],   // 四承
  88: [[4, 2, 2, 1, 1, 1, 1, 2, 3, 2], [4, 2, 2, 1, 2, 1, 2, 2, 3, 2], [4, 2, 2, 2, 2, 1, 2, 2, 3, 2]],   // 四合
};
export const WAVES = Object.freeze(Array.from({ length: END_UNIT }, (_, u) => {
  let row = [];
  for (const [from, rows] of Object.entries(ROWS)) if (u >= +from && u < +from + rows.length) row = rows[u - from];
  return Object.freeze(WAVE_TYPES.map((_, i) => row[i] || 0));
}));
export const SECTION_HP = Object.freeze(SCRIPT.map(s => s.hp || 0));
export const SECTION_SHELL = Object.freeze(SCRIPT.map(s => s.shell || 0));
export const sectionAt = tick => { const u = Math.floor(tick / UNIT_TICKS); let k = 0; while (k + 1 < SCRIPT.length && u >= SCRIPT[k + 1].from) k++; return k; };

/** Which formation the drones of a unit come in (-1 none): fixed by the script, the four kinds in turn over the units
 *  of the main sections that have enough drones. */
export const FORM_AT = Object.freeze((() => {
  let n = 0;
  return WAVES.map((w, u) => {
    const sec = SCRIPT[sectionAt(u * UNIT_TICKS)];
    if (sec.safe || w[0] < FORM_MIN) return -1;
    const kind = n++ % 4;
    return kind === PINCER && w[0] < 4 ? VEE : kind;
  });
})());
/** The units an elite enters in (two a chapter) and the kinds it may be in each chapter. */
export const ELITE_AT = Object.freeze([10, 19, 34, 42, 57, 65, 81, 89]);
const ELITE_KINDS = [[GUNNER, WEAVER], [GUNNER, WEAVER, LANCER], [GUNNER, WEAVER, LANCER, SPLITTER], [GUNNER, WEAVER, LANCER, BEAMER]];
const dropKind = (seed, i) => { let r = rng.int(seed, 'dropKind', i, 100), d = 0; while (r >= DROP_WEIGHTS[d]) r -= DROP_WEIGHTS[d++]; return d; };
const unitOf = name => SCRIPT.find(s => s.event === name).from;

/** The whole spawn list of a seed: [{ at, type, x (px), lane, hp, sh, drop, vx?, ac?, y?, el? }], in time order.
 *  Depends on the seed only. */
export function schedule(seed) {
  const out = [];
  const push = (at, type, lane, x, extra = {}) => {
    const i = out.length, k = sectionAt(at);                 // what it carries is settled here, by the seed, not at the kill
    const drop = rng.int(seed, 'drop', i, 100) < DROP_CHANCE ? dropKind(seed, i) : -1;
    out.push({ at, type, lane, x, hp: KIND[type].hp + SECTION_HP[k], sh: SECTION_SHELL[k], drop, ...extra });
  };
  WAVES.forEach((w, k) => {
    const types = [], form = FORM_AT[k], inForm = form < 0 ? 0 : formSize(form, w[0]), t0 = k * UNIT_TICKS;
    w.forEach((n, i) => { for (let j = i === 0 ? inForm : 0; j < n; j++) types.push(WAVE_TYPES[i]); });
    if (types.length) {
      const order = rng.shuffle(seed, 'order', k, types);
      order.forEach((type, j) => { const lane = rng.int(seed, 'lane', out.length, LANES); push(t0 + Math.floor((j * UNIT_TICKS) / order.length), type, lane, LANE_X0 + lane * LANE_STEP); });
    }
    if (form >= 0) {                                         // the seed only mirrors it and picks where it starts
      const m = rng.int(seed, 'formation', 2 * k, 2) ? 1 : -1, lane = rng.int(seed, 'formation', 2 * k + 1, LANES), lx = LANE_X0 + lane * LANE_STEP, at = t0 + 60;
      for (let i = 0; i < inForm; i++) {
        if (form === COLUMN) push(at + i * 16, DRONE, lane, lx);
        else if (form === VEE) { const j = i - (inForm >> 1); push(at + Math.abs(j) * 14, DRONE, lane, clamp(lx, 200, WORLD_W - 200) + j * 64); }
        else if (form === PINCER) { const left = (i % 2 === 0) === (m > 0); push(at + (i >> 1) * 20, DRONE, lane, left ? -40 : WORLD_W + 40, { vx: (left ? FORM_VX : -FORM_VX) * ONE }); }
        else push(at + i * 16, DRONE, lane, m > 0 ? 80 : WORLD_W - 80, { vx: m * ARC_VX * ONE, ac: -m * ARC_BEND });
      }
    }
  });
  ELITE_AT.forEach((u, n) => {                               // an elite: which kind is the seed's, that it carries a drop is not
    const kinds = ELITE_KINDS[n >> 1], type = kinds[rng.int(seed, 'elite', 2 * n, kinds.length)], lane = 1 + rng.int(seed, 'elite', 2 * n + 1, LANES - 2);
    push(u * UNIT_TICKS + 120, type, lane, LANE_X0 + lane * LANE_STEP);
    const e = out[out.length - 1];
    e.hp *= ELITE_HP; e.sh *= 2; e.el = 1; e.drop = dropKind(seed, 5000 + n);
  });
  // the convoy: transports that cross the screen one above the other; each carries a drop
  const cu = unitOf('convoy') * UNIT_TICKS, cm = rng.int(seed, 'event', 0, 2);
  for (let i = 0; i < CARRIERS; i++) {
    const left = (i + cm) % 2 === 0;
    push(cu + i * 50, CARRIER, 0, left ? -50 : WORLD_W + 50, { y: 150 + i * 70, vx: (left ? CARRIER_VX : -CARRIER_VX) * ONE });
    Object.assign(out[out.length - 1], { hp: KIND[CARRIER].hp, sh: 0, drop: dropKind(seed, 6000 + i) });
  }
  // the storm: two mines drift through between the lightning (the strikes themselves are in strikes())
  const su = unitOf('storm') * UNIT_TICKS;
  for (let i = 0; i < 2; i++) { const lane = rng.int(seed, 'event', 10 + i, LANES); push(su + 50 + i * 80, MINE, lane, LANE_X0 + lane * LANE_STEP); Object.assign(out[out.length - 1], { hp: KIND[MINE].hp, sh: 0, drop: -1 }); }
  return out.map((p, i) => [p, i]).sort((a, b) => a[0].at - b[0].at || a[1] - b[1]).map(v => v[0]);
}
/** The storm's lightning: [{ at (clock tick its warning starts), x (px) }], three different lanes. */
export function strikes(seed) {
  const su = unitOf('storm') * UNIT_TICKS, lanes = rng.shuffle(seed >>> 0, 'event', 20, [0, 1, 2, 3, 4, 5]);
  return Array.from({ length: STRIKES }, (_, i) => ({ at: su + 20 + i * 70, x: LANE_X0 + lanes[i] * LANE_STEP }));
}

/** Upper bound of any legal score (spec §6): every enemy at full chain, every possible bullet grazed, instant boss kill.
 *  Loose on purpose: it assumes every scoring card and the plating at top level at once, which four picks cannot buy. */
export const SCORE_CAP = (() => {
  const n = WAVE_TYPES.map(() => 0);
  for (const w of WAVES) w.forEach((c, i) => { n[i] += c; });
  const N = type => n[WAVE_TYPES.indexOf(type)];
  const cap = CHAIN_STEP * CHAIN_CAP, per = type => KIND[type].pts + cap;
  const win = i => (BOSS_SLOTS[i].end - BOSS_SLOTS[i].from) * UNIT_TICKS, up = (i, period) => Math.ceil(win(i) / period);
  const mines = N(MINER) * Math.ceil((WORLD_W + 160) / MINER_VX / MINER_PERIOD) + up(5, BOSS3_MINE_PERIOD) + up(2, MID2_MINE_PERIOD);
  const seekers = up(7, BOSS4_SEEKER_PERIOD) + up(6, MID4_SEEKER_PERIOD);
  const elites = ELITE_AT.length * (ELITE_PTS * KIND[BULWARK].pts + cap + 2 * per(SHARD));   // looser than any elite can be
  const kills = WAVE_TYPES.reduce((s, t) => s + N(t) * per(t), 0) + (mines + 2) * per(MINE) + 2 * N(SPLITTER) * per(SHARD) + elites + CARRIERS * per(CARRIER)
    + seekers * per(SEEKER) + BOSS_SLOTS.reduce((s, b) => s + KIND[b.type].pts + cap, 0);
  const wall = WALL_SHOTS - WALL_GAP;
  const bullets = 2 * MINE_RING + ELITE_AT.length * wall * Math.ceil(BULWARK_HOVER_TICKS / BULWARK_PERIOD)
    + (BOSS_RING >> 1) * BOSS_TIDE_PULSES * up(1, BOSS_TIDE_PERIOD) + 2 * up(3, BOSS2_CROSS_PERIOD)
    + 2 * (N(GUNNER) * Math.ceil(GUNNER_HOVER_TICKS / GUNNER_PERIOD)
    + N(WEAVER) * 3 * Math.ceil((WORLD_H - SPAWN_Y) / WEAVER_VY / WEAVER_PERIOD)
    + N(LANCER) * Math.ceil(LANCER_HOVER_TICKS / LANCER_PERIOD)
    + mines * MINE_RING
    + N(BULWARK) * wall * Math.ceil(BULWARK_HOVER_TICKS / BULWARK_PERIOD)
    + 3 * up(0, MID_AIM_PERIOD) + MID1_RING * up(0, MID1_RING_PERIOD)
    + BOSS_RING * up(1, BOSS_RING_PERIOD_LOW) + 3 * up(1, BOSS_AIM_PERIOD)
    + up(2, MID2_LANCE_PERIOD)
    + 2 * up(3, BOSS2_SPIRAL_PERIOD) + up(3, BOSS2_LANCE_PERIOD)
    + wall * up(4, MID3_WALL_PERIOD) + 3 * up(4, MID_AIM_PERIOD)
    + wall * up(5, BOSS3_WALL_PERIOD) + 3 * up(5, BOSS3_AIM_PERIOD) + BOSS3_RING * up(5, BOSS3_RING_PERIOD) + 3 * up(5, BOSS2_SPIRAL_PERIOD)
    + 3 * up(7, BOSS3_AIM_PERIOD) + BOSS3_RING * up(7, BOSS4_RING_PERIOD) + 3 * up(7, BOSS2_SPIRAL_PERIOD));
  const time = BOSS_SLOTS.reduce((s, _, i) => s + Math.floor(win(i) / BOSS_TIME_DIV), 0) + CHAPTERS * (BREAK_PTS[0] + BREAK_PTS[1]);
  return kills + bullets * GRAZE_PTS + time + SHIELDS * SHIELD_PTS;
})();

/** Every obstacle of a seed: [{ at (clock tick it enters), kind, x (px), vx (px per tick) }]. Wave units of chapters 3
 *  and 4 only: nothing new enters once a boss is on. Depends on the seed only. */
export function obstacles(seed) {
  const out = [];
  let n = 0;
  for (let u = 0; u < END_UNIT; u++) {
    const sec = SCRIPT[sectionAt(u * UNIT_TICKS)];
    if (sec.boss || sec.boost || sec.chapter < 2) continue;
    if (sec.event === 'gorge') {                           // two walls of peaks with a winding way through
      const m = rng.int(seed, 'event', 30, 2) ? 1 : -1;
      for (let r = 0; r < GORGE_ROWS; r++) {
        const c = WORLD_W / 2 + Math.trunc((m * GORGE_SWAY * SIN[(r * 20) & 255]) / ONE), at = u * UNIT_TICKS + r * 30;
        for (let x = c - GORGE_HALF - PEAK_R; x > -PEAK_R; x -= 2 * PEAK_R) out.push({ at, kind: PEAK, x, vx: 0 });
        for (let x = c + GORGE_HALF + PEAK_R; x < WORLD_W + PEAK_R; x += 2 * PEAK_R) out.push({ at, kind: PEAK, x, vx: 0 });
      }
      continue;
    }
    if (sec.event === 'shower') {
      for (let i = 0; i < SHOWER; i++) out.push({ at: u * UNIT_TICKS + i * 20, kind: METEOR, x: LANE_X0 + rng.int(seed, 'obstLane', 500 + i, LANES) * LANE_STEP, vx: rng.int(seed, 'obstacle', 2000 + i, 3) - 1 });
      continue;
    }
    const kind = sec.chapter === 2 ? PEAK : METEOR, k = n++;
    if (rng.int(seed, 'obstacle', k, 100) >= (kind === PEAK ? PEAK_CHANCE : METEOR_CHANCE)) continue;
    const lane = rng.int(seed, 'obstLane', out.length, LANES);
    out.push({ at: u * UNIT_TICKS + 60, kind, x: LANE_X0 + lane * LANE_STEP, vx: kind === METEOR ? rng.int(seed, 'obstacle', 1000 + k, 3) - 1 : 0 });
  }
  return out;
}

/** @param leg another leg's rules (v11; see sim/leg6.js for what one supplies), or nothing for leg one */
export function createSim(seed, leg = null) {
  seed >>>= 0;
  const sim = {
    seed, tick: 0, skip: 0, chapter: 0, score: 0, over: 0,
    px: (WORLD_W / 2) * ONE, py: PLAYER_START_Y * ONE, bank: 0,
    shields: SHIELDS, maxShields: SHIELDS, invuln: 0, chain: 0, bestChain: 0,
    kills: 0, grazes: 0, hits: 0, escaped: 0, killPts: 0, grazePts: 0, bossPts: 0, shieldPts: 0,
    nextSpawn: 0, nextId: 1, bossState: 0, slot: 0, bossKills: 0, bossFell: 0, won: 0, rings: 0, walls: 0, spiral: 0,   // bossState: 1 = a boss is on screen; slot = which BOSS_SLOTS entry is next or on
    supply: -1,                                              // which supply is waiting to be chosen (-1 none)
    boostEnd: 0, boostTo: 0,                                 // the boost under way: the tick it ends, the clock tick it jumps to
    rays: [],                                                // the rays on screen: { y, t (ticks since it started; its rhythm) }
    nextStrike: 0, strikes: [],                              // the storm: { x, pw (warning ticks left), bt (ticks it stays on) }
    enemies: [], bullets: [], shots: [], drops: [], obst: [],
    picks: 0, gear: [0, 0, 0, 0, 0, 0, 0, 0], barrier: 0, rebuild: 0, haste: 0, boost: 0, upgrades: 0, pickups: 0,
    nextObst: 0, nextWarn: 0, dropN: 0, volley: 0, breaks: 0, stall: 0,
    plan: leg ? leg.schedule(seed) : schedule(seed), rocks: leg ? leg.obstacles(seed) : obstacles(seed), sky: leg ? [] : strikes(seed),   // derived from the seed; not hashed
    events: [], recordEvents: true,
    leg,                                                     // the leg's rules (null = leg one); not hashed, it is the same object for every match of that leg
  };
  if (leg) leg.init(sim);
  return sim;
}

const emit = (sim, ev) => { if (sim.recordEvents) sim.events.push(ev); };
const px = v => Math.floor(v / ONE);                       // sub-pixels -> whole pixels for events
const near = (ax, ay, bx, by, r) => { const dx = ax - bx, dy = ay - by, rr = r * ONE; return dx * dx + dy * dy <= rr * rr; };

/** An enemy's hit circle and base points: an elite is half as big again and worth three times as much. */
export const radius = e => (e.el ? Math.trunc((KIND[e.type].r * ELITE_R[0]) / ELITE_R[1]) : e.st === 2 ? Math.trunc((KIND[e.type].r * CORE_R_PCT) / 100) : KIND[e.type].r);
/** A mid-boss's full shield; the health at which a boss's current stage breaks (0 in its last stage). */
export const shieldMax = type => Math.trunc((KIND[type].hp * MID_SHIELD_PCT) / 100);
/** Would a shot at (x, y) (sub-pixels) be stopped by e's armour? */
export const armoured = (e, x, y) => {
  const a = e.st === 0 ? BOSS_ARMOUR[e.type] ?? KIND[e.type].armour : null;
  if (!a) return false;
  const dx = Math.abs(x - e.x), dy = y - e.y;
  return dx >= a[0] * ONE && dx <= a[1] * ONE && dy >= a[2] * ONE && dy <= a[3] * ONE;
};
/** Is (x, y) inside the lane of e's charge (announced or under way)? */
export const inCharge = (e, x, y, pad = 0) => Math.abs(x - e.x) <= (CHARGE_HALF_W + pad) * ONE && y >= e.y - KIND[e.type].r * ONE && y <= e.y + (CHARGE_REACH + pad) * ONE;
export const stageFloor = e => (e.st < 2 ? Math.trunc((KIND[e.type].hp * STAGE_FLOOR_PCT[e.st]) / 100) : 0);
const basePts = e => KIND[e.type].pts * (e.el ? ELITE_PTS : 1);
// Enemy fields: ax = anchor x, aux = lane (bosses: the tick they took position), vx = sideways speed,
// pk / pv / pw = a telegraphed attack waiting to fire (kind 1 lance / 2 wall / 3 beam; its angle, gap or column x; ticks left),
// a = heading (seekers), bt = ticks the beam stays on, bm = 1 when the beam is a pair at pv ± BOSS4_BEAM_OFFSET.
function add(sim, type, x, y, aux, hp, vx = 0) {
  const e = { id: sim.nextId++, type, x, y, hp, t: 0, ax: x, aux, vx, pk: 0, pv: 0, pw: 0, a: 64, bt: 0, bm: 0, dr: 0, sh: 0, el: 0, ac: 0, q: 0, qd: 0, st: 0, stun: 0, shd: 0, idle: 0, refills: 0, ch: 0, cw: 0 };   // ch = charge (1 lunging, 2 holding, 3 climbing back), cw = ticks left to hold
  // st = a boss's stage (0 armour, 1 frame, 2 core); stun = ticks it holds its fire; shd = a mid-boss's shield; idle = ticks since it was last hit; refills = shields regrown
  // dr = drop kind + 1 it carries; sh = shell layers; el = 1 for an elite; ac = sideways bend (arc drones); q, qd = a boss's own attack in progress
  sim.enemies.push(e);
  return e;
}
function spawn(sim, type, x, lane, hp = KIND[type].hp) {
  if (isBoss(type)) { const b = add(sim, type, x * ONE, -KIND[type].r * ONE, 0, hp); if (isMid(type)) b.shd = shieldMax(type); sim.bossState = 1; emit(sim, { type: 'bossIn', boss: sim.slot, mid: sim.slot % 2 === 0 }); return; }
  if (type === MINER) { const left = lane % 2 === 0; add(sim, type, (left ? -40 : WORLD_W + 40) * ONE, (MINER_Y + lane * MINER_STEP) * ONE, lane, hp, (left ? MINER_VX : -MINER_VX) * ONE); return; }
  add(sim, type, x * ONE, SPAWN_Y * ONE, lane, hp);
}

function fire(sim, x, y, angle, speed) {
  const a = angle & 255;
  sim.bullets.push({ x, y, vx: COS[a] * speed, vy: SIN[a] * speed, grazed: 0 });
}
const ring = (sim, x, y, n, off, speed) => { for (let k = 0; k < n; k++) fire(sim, x, y, off + Math.floor((k * 256) / n), speed); };
/** Telegraph an aimed fast shot at where the player is now; it fires LANCER_TELEGRAPH ticks later along that line. */
function lockOn(sim, e) {
  e.pk = 1; e.pv = angleOf(sim.px - e.x, sim.py - e.y); e.pw = LANCER_TELEGRAPH;
  emit(sim, { type: 'aim', id: e.id, x: px(e.x), y: px(e.y), tx: px(sim.px), ty: px(sim.py), angle: e.pv, ticks: LANCER_TELEGRAPH });
}
const WALL_STEP = WORLD_W / WALL_SHOTS;
/** True from the gorge's first warning until its last peak has left the screen. A wall fired before that stays below
 *  the first row of peaks (both fall at the same speed), so it never ends up inside the way through. */
const GORGE_FROM = SCRIPT.find(s => s.event === 'gorge').from * UNIT_TICKS - OBST_WARN;
const GORGE_TO = GORGE_FROM + OBST_WARN + GORGE_ROWS * 30 + Math.ceil((WORLD_H + 2 * PEAK_R + 80) / PEAK_VY);
export const inGorge = sim => { const c = clock(sim); return c >= GORGE_FROM && c < GORGE_TO; };
/** Telegraph a wall of bullets across the screen with one gap; where the gap is depends on the seed and the wall's number. */
function wallUp(sim, e) {
  if (inGorge(sim)) return;                                  // no wall while the gorge is on: its gap could be inside the rock
  e.pk = 2; e.pv = 0; e.pw = WALL_TELEGRAPH; sim.walls++;      // pv = the phase the ray starts in (0 live first, RAY_ON dead first)
  emit(sim, { type: 'wall', id: e.id, y: px(e.y), ticks: WALL_TELEGRAPH });
}
/** Telegraph a beam: a column straight down from here (or a pair either side). Its place is fixed now. */
function beamUp(sim, e, pair) {
  e.pk = 3; e.pv = e.x; e.bm = pair ? 1 : 0; e.pw = BEAM_TELEGRAPH;
  emit(sim, { type: 'beamUp', id: e.id, x: px(e.x), y: px(e.y), w: BEAM_W, pair: e.bm, ticks: BEAM_TELEGRAPH });
}
/** The x (sub-pixels) of the columns of e's beam. */
export const beamColumns = e => { const off = (e.q === 1 ? BOSS4_VAULT_OFFSET : BOSS4_BEAM_OFFSET) * ONE; return e.bm ? [e.pv - off, e.pv + off] : [e.pv]; };
function chargeUp(sim, e) {
  e.pk = 6; e.pw = CHARGE_WARN;
  emit(sim, { type: 'chargeWarn', id: e.id, x: px(e.x), y: px(e.y), w: CHARGE_HALF_W, reach: CHARGE_DEPTH + CHARGE_REACH, ticks: CHARGE_WARN });
}
function release(sim, e) {
  if (e.pk === 6) { e.pk = 0; e.ch = 1; emit(sim, { type: 'charge', id: e.id, x: px(e.x), y: px(e.y) }); return; }
  if (e.pk === 3) { e.bt = BEAM_TICKS; e.pk = 0; emit(sim, { type: 'beam', id: e.id, x: px(e.pv), y: px(e.y), w: BEAM_W, pair: e.bm, ticks: BEAM_TICKS }); return; }
  if (e.pk === 5) {                                           // Nyx's cross: one fast shot from each edge of the screen
    fire(sim, CROSS_X * ONE, e.y, e.pv, LANCER_SPEED); fire(sim, (WORLD_W - CROSS_X) * ONE, e.y, e.a, LANCER_SPEED);
    emit(sim, { type: 'lance', x: px(e.x), y: px(e.y) }); e.pk = 0; return;
  }
  if (e.pk === 1) fire(sim, e.x, e.y, e.pv, LANCER_SPEED);
  else sim.rays.push({ y: e.y, t: e.pv });
  emit(sim, { type: e.pk === 1 ? 'lance' : 'wallFire', x: px(e.x), y: px(e.y) });
  if (e.pk === 2 && e.type === BOSS3 && e.st >= 1 && !e.q) {   // Eos: a second wall, its gap moved toward the roomier side
    e.q = 1; e.pv = RAY_ON; e.pw = WALL_TELEGRAPH + 14;       // the second ray runs the other way round: dead while the first is live
    emit(sim, { type: 'wall', id: e.id, y: px(e.y), ticks: e.pw });
    return;
  }
  e.q = e.type === BOSS3 ? 0 : e.q;
  e.pk = 0;
}
/** Come down to hoverY; returns the ticks spent there so far (0 while still descending). */
function descend(e, hoverY, vy) {
  const arrive = Math.ceil((hoverY - SPAWN_Y * ONE) / (vy * ONE));
  if (e.t <= arrive) { e.y = Math.min(hoverY, e.y + vy * ONE); return 0; }
  return e.t - arrive;
}
const aimed3 = (sim, e) => {
  const a = angleOf(sim.px - e.x, sim.py - e.y);
  for (let k = -1; k <= 1; k++) fire(sim, e.x, e.y, a + k * BOSS_AIM_SPREAD, BOSS_AIM_SPEED);
  emit(sim, { type: 'enemyFire', x: px(e.x), y: px(e.y) });
};
const spiral = (sim, e, arms) => {
  for (let k = 0; k < arms; k++) fire(sim, e.x, e.y, sim.spiral + Math.floor((k * 256) / arms), SPREAD_SPEED);
  sim.spiral = (sim.spiral + BOSS2_SPIRAL_STEP) & 255;
};

function moveEnemy(sim, e) {
  e.t++;
  if (e.bt > 0 && --e.bt === 0 && e.q === 1 && e.type === BOSS4) { e.q = 0; beamUp(sim, e, true); }   // Atlas: the inner pair follows the wide one
  if (e.pw > 0 && --e.pw === 0) release(sim, e);
  switch (e.type) {
    case DRONE: e.y += DRONE_VY * ONE; e.x += e.vx; e.vx += e.ac; break;   // vx, ac: only drones that came in a pincer or an arc
    case CARRIER: e.x += e.vx; break;
    case GUNNER: {
      const h = descend(e, (GUNNER_HOVER_Y + e.aux * GUNNER_HOVER_STEP) * ONE, GUNNER_VY);
      if (h > GUNNER_HOVER_TICKS) e.y += GUNNER_VY * ONE;
      else if (h > 0 && h % GUNNER_PERIOD === GUNNER_PERIOD >> 1) {
        fire(sim, e.x, e.y, angleOf(sim.px - e.x, sim.py - e.y), BULLET_SPEED);
        emit(sim, { type: 'enemyFire', x: px(e.x), y: px(e.y) });
      }
      break;
    }
    case WEAVER:
      e.y += WEAVER_VY * ONE;
      e.x = e.ax + SIN[(e.t * 2) & 255] * WEAVER_AMP;
      e.x = clamp(e.x, 40 * ONE, (WORLD_W - 40) * ONE);
      if (e.t % WEAVER_PERIOD === WEAVER_PERIOD >> 1 && e.y < (WORLD_H - 320) * ONE) {
        for (let k = -1; k <= 1; k++) fire(sim, e.x, e.y, 64 + k * WEAVER_SPREAD, SPREAD_SPEED);
        emit(sim, { type: 'enemyFire', x: px(e.x), y: px(e.y) });
      }
      break;
    case DIVER:
      if (e.t <= DIVER_HOLD_TICKS) {
        e.y = Math.min(DIVER_HOLD_Y * ONE, e.y + 8 * ONE);
        if (e.t === DIVER_HOLD_TICKS) {                                  // lock on where the player is now
          const ticks = Math.max(1, Math.trunc((sim.py - e.y) / (DIVER_VY * ONE)));
          e.vx = clamp(Math.trunc((sim.px - e.x) / ticks), -DIVER_VX_MAX * ONE, DIVER_VX_MAX * ONE);
          emit(sim, { type: 'dive', x: px(e.x), y: px(e.y) });
        }
      } else { e.y += DIVER_VY * ONE; e.x += e.vx; }
      break;
    case LANCER: {
      const h = descend(e, (LANCER_Y + e.aux * LANCER_STEP) * ONE, GUNNER_VY);
      if (h > LANCER_HOVER_TICKS) e.y += GUNNER_VY * ONE;
      else if (h > 0 && h % LANCER_PERIOD === 20) lockOn(sim, e);
      break;
    }
    case MINER:
      e.x += e.vx;
      if (e.t % MINER_PERIOD === MINER_PERIOD >> 1 && e.x > 60 * ONE && e.x < (WORLD_W - 60) * ONE) add(sim, MINE, e.x, e.y, 0, KIND[MINE].hp);
      break;
    case MINE:
      e.y += MINE_VY * ONE;
      if (e.t >= MINE_FUSE) {                                            // goes off: a ring of bullets, no points
        ring(sim, e.x, e.y, MINE_RING, 0, SPREAD_SPEED);
        emit(sim, { type: 'mineBurst', x: px(e.x), y: px(e.y) });
        e.hp = 0;
      }
      break;
    case BULWARK: {
      const h = descend(e, BULWARK_Y * ONE, DRONE_VY);
      if (h > BULWARK_HOVER_TICKS) e.y += DRONE_VY * ONE;
      else if (h > 0 && h % BULWARK_PERIOD === 30) wallUp(sim, e);
      break;
    }
    case SPLITTER: e.y += SPLITTER_VY * ONE; break;
    case SEEKER: {                                                       // turns toward the ship, a little each tick
      if (e.t <= SEEKER_LIFE) {
        const d = ((angleOf(sim.px - e.x, sim.py - e.y) - e.a + 128) & 255) - 128;
        e.a = (e.a + clamp(d, -SEEKER_TURN, SEEKER_TURN)) & 255;
      }
      e.x += COS[e.a] * SEEKER_SPEED; e.y += SIN[e.a] * SEEKER_SPEED;
      break;
    }
    case BEAMER: {
      const h = descend(e, (BEAMER_Y + e.aux * BEAMER_STEP) * ONE, GUNNER_VY);
      if (h > BEAMER_HOVER_TICKS) e.y += GUNNER_VY * ONE;
      else if (h > 0 && h % BEAMER_PERIOD === 30 && !e.pk && !e.bt) beamUp(sim, e, false);
      break;
    }
    case SHARD: e.x += e.vx; e.y += SHARD_VY * ONE; break;
    default: if (isBoss(e.type)) moveBoss(sim, e); else if (sim.leg) sim.leg.move(sim, e); break;   // v11: bosses of any leg; a leg's own kinds
  }
}

/** A boss or mid-boss: come down, hold position, then attack. The part every leg's bosses share is up to the sway. */
function moveBoss(sim, e) {
  if (e.y < BOSS_Y * ONE && !e.ch) { e.y = Math.min(BOSS_Y * ONE, e.y + 2 * ONE); e.aux = e.t; return; }
  e.idle++;
  if (isMid(e.type) && e.shd === 0 && e.refills < MID_SHIELD_REFILLS && e.idle >= MID_SHIELD_REGEN) {   // left alone: the shield is back
    e.shd = shieldMax(e.type); e.refills++; emit(sim, { type: 'shieldUp', id: e.id, x: px(e.x), y: px(e.y), refills: e.refills });
  }
  if (e.stun > 0) { e.stun--; e.aux++; return; }                    // after a break: no fire, no movement (aux++ holds its pattern clock)
  if (e.pk === 6) { e.aux++; return; }                              // announcing a charge: it holds still, so the lane shown is the lane it takes
  if (e.ch) {                                                      // charging: down, hold, back; nothing else until it is home
    const deep = (BOSS_Y + CHARGE_DEPTH) * ONE;
    if (e.ch === 1) { e.y = Math.min(deep, e.y + CHARGE_SPEED * ONE); if (e.y === deep) { e.ch = 2; e.cw = CHARGE_HOLD; emit(sim, { type: 'chargeHit', x: px(e.x), y: px(e.y) }); } }
    else if (e.ch === 2) { if (--e.cw <= 0) e.ch = 3; }
    else { e.y = Math.max(BOSS_Y * ONE, e.y - CHARGE_BACK * ONE); if (e.y === BOSS_Y * ONE) { e.ch = 0; return; } }   // home: its clock runs again from the next tick
    e.aux++;
    return;
  }
  const t = e.t - e.aux, full = KIND[e.type].hp;                     // ticks since it took position
  const sig = e.st >= 1, rage = e.st >= 2, P = p => (rage ? Math.max(1, Math.trunc((p * (100 - BOSS_RAGE_PCT)) / 100)) : p);
  const D = p => Math.max(1, Math.trunc((p * 100) / BOSS_DENSITY_PCT));   // v10: 20% more bullets from a boss (not from a mid-boss)
  e.x = e.ax + SIN[t & 255] * BOSS_AMP;
  if (KIND[e.type].leg) { sim.leg.boss(sim, e, t, { sig, rage, P, D }); return; }   // v11: a leg's boss attacks its own way
  if (e.type === MID1) {
    if (t % MID_AIM_PERIOD === 0 && t > 0) aimed3(sim, e);
    if (t % MID1_RING_PERIOD === MID1_RING_PERIOD >> 1) { ring(sim, e.x, e.y, MID1_RING, rng.int(sim.seed, 'boss', sim.rings++, 256 / MID1_RING), SPREAD_SPEED); emit(sim, { type: 'bossRing', x: px(e.x), y: px(e.y) }); }
  } else if (e.type === MID2) {
    if (t % MID2_LANCE_PERIOD === MID2_LANCE_PERIOD >> 1 && !e.pk) lockOn(sim, e);
    if (t % MID2_MINE_PERIOD === 0 && t > 0) add(sim, MINE, e.x, e.y + KIND[MID2].r * ONE, 0, KIND[MINE].hp);
  } else if (e.type === MID3) {
    if (t % MID3_WALL_PERIOD === MID3_WALL_PERIOD >> 1 && !e.pk) wallUp(sim, e);
    if (t % MID_AIM_PERIOD === 0 && t > 0) aimed3(sim, e);
  } else if (e.type === MID4) {
    if (t % MID4_SEEKER_PERIOD === 0 && t > 0) add(sim, SEEKER, e.x, e.y + KIND[MID4].r * ONE, 0, KIND[SEEKER].hp);
    if (t % MID4_BEAM_PERIOD === MID4_BEAM_PERIOD >> 1 && !e.pk && !e.bt) beamUp(sim, e, false);
  } else if (e.type === BOSS) {
    const period = D(sig ? BOSS_RING_PERIOD_LOW : BOSS_RING_PERIOD), aim = D(P(BOSS_AIM_PERIOD));
    if (t % period === period >> 1) {
      ring(sim, e.x, e.y, BOSS_RING, rng.int(sim.seed, 'boss', sim.rings++, 256 / BOSS_RING), SPREAD_SPEED);
      emit(sim, { type: 'bossRing', x: px(e.x), y: px(e.y) });
    }
    if (t % aim === 0 && t > 0) aimed3(sim, e);
    if (sig && t % BOSS_TIDE_PERIOD === BOSS_TIDE_PERIOD >> 1) { e.q = BOSS_TIDE_PULSES; e.qd = e.qd > 0 ? -1 : 1; emit(sim, { type: 'bossRing', x: px(e.x), y: px(e.y) }); }
    if (e.q > 0 && (t & 7) === 0) { e.a = (e.a + e.qd * BOSS_TIDE_STEP) & 255; ring(sim, e.x, e.y, BOSS_RING >> 1, e.a, SPREAD_SPEED); e.q--; }   // the tide
    if (sig && t % CHARGE_PERIOD === CHARGE_PERIOD >> 2 && !e.pk && !e.q) chargeUp(sim, e);   // v10: the claws lunge
  } else if (e.type === BOSS2) {
    if (t % D(BOSS2_SPIRAL_PERIOD) === 0) spiral(sim, e, 2);
    const lance = P(BOSS2_LANCE_PERIOD);
    if (sig && t % lance === 0 && !e.pk) lockOn(sim, e);
    if (sig && t % BOSS2_CROSS_PERIOD === BOSS2_CROSS_PERIOD >> 1 && !e.pk) {   // night falls from both sides
      e.pk = 5; e.pw = LANCER_TELEGRAPH;
      e.pv = angleOf(sim.px - CROSS_X * ONE, sim.py - e.y); e.a = angleOf(sim.px - (WORLD_W - CROSS_X) * ONE, sim.py - e.y);
      emit(sim, { type: 'cross', id: e.id, y: px(e.y), tx: px(sim.px), ty: px(sim.py), ticks: LANCER_TELEGRAPH });
    }
  } else if (e.type === BOSS4) {
    const stage = e.st, idle = !e.pk && !e.bt;
    if (sig && t % BOSS4_VAULT_PERIOD === BOSS4_VAULT_PERIOD >> 1 && idle) { e.q = 1; beamUp(sim, e, true); }   // the vault closes in
    else if (stage === 0) {
      if (t % BOSS4_BEAM_PERIOD === BOSS4_BEAM_PERIOD >> 1 && idle) beamUp(sim, e, true);
      if (t % D(BOSS3_AIM_PERIOD) === 0 && t > 0) aimed3(sim, e);
    } else if (stage === 1) {
      if (t % P(BOSS4_SEEKER_PERIOD) === 0) add(sim, SEEKER, e.x, e.y + KIND[BOSS4].r * ONE, 0, KIND[SEEKER].hp);
      if (t % D(BOSS4_RING_PERIOD) === D(BOSS4_RING_PERIOD) >> 1) {
        ring(sim, e.x, e.y, BOSS3_RING, rng.int(sim.seed, 'boss', sim.rings++, Math.floor(256 / BOSS3_RING)), SPREAD_SPEED);
        emit(sim, { type: 'bossRing', x: px(e.x), y: px(e.y) });
      }
    } else {
      if (t % D(BOSS2_SPIRAL_PERIOD) === 0) spiral(sim, e, 3);
      if (t % BOSS4_BEAM_PERIOD_LOW === BOSS4_BEAM_PERIOD_LOW >> 1 && idle) beamUp(sim, e, false);
    }
  } else {
    const stage = e.st;
    if (stage >= 1 && t % CHARGE_PERIOD === CHARGE_PERIOD >> 2 && !e.pk && !e.q) chargeUp(sim, e);   // v10: the chariot charges
    if (stage === 0) {
      if (t % BOSS3_WALL_PERIOD === BOSS3_WALL_PERIOD >> 1 && !e.pk) wallUp(sim, e);
      if (t % D(BOSS3_AIM_PERIOD) === 0 && t > 0) aimed3(sim, e);
    } else if (stage === 1) {
      const rp = D(P(BOSS3_RING_PERIOD));
      if (t % rp === rp >> 1) {
        ring(sim, e.x, e.y, BOSS3_RING, rng.int(sim.seed, 'boss', sim.rings++, Math.floor(256 / BOSS3_RING)), SPREAD_SPEED);
        emit(sim, { type: 'bossRing', x: px(e.x), y: px(e.y) });
      }
      if (t % BOSS3_MINE_PERIOD === 0) add(sim, MINE, e.x, e.y + KIND[BOSS3].r * ONE, 0, KIND[MINE].hp);
      if (t % BOSS3_WALL_PERIOD_LOW === BOSS3_WALL_PERIOD_LOW >> 1 && !e.pk) wallUp(sim, e);   // v9: the frame stage brings the paired rays
    } else {
      if (t % D(BOSS2_SPIRAL_PERIOD) === 0) spiral(sim, e, 3);
      if (t % BOSS3_WALL_PERIOD_LOW === BOSS3_WALL_PERIOD_LOW >> 1 && !e.pk) wallUp(sim, e);
    }
  }
}

/** One piece of gear a level up (a full one heals a point instead). Shared by choices and upgrade drops. */
function gain(sim, g) {
  if (sim.gear[g] >= GEAR_MAX_LV) {                                      // already full: one more life the ship can hold, and one life back
    if (sim.maxShields < LIFE_CAP) sim.maxShields++;
    if (sim.shields < sim.maxShields) sim.shields++;
    return false;
  }
  const net = hasNet(sim);
  sim.gear[g]++;
  if (g === BARRIER && sim.gear[g] === 1) sim.barrier = 1;               // a new barrier comes up charged
  if (!net && hasNet(sim)) emit(sim, { type: 'evolve', evo: 0 });
  return true;
}

/** Anything that hits the ship. A barrier charge takes it (no life lost); either way the chain is gone and it counts as a hit. */
function hurt(sim) {
  sim.hits++; sim.chain = 0;
  if (sim.barrier > 0) {
    sim.barrier--; sim.invuln = BARRIER_INVULN; sim.rebuild = BARRIER_REBUILD[sim.gear[BARRIER] - 1];
    emit(sim, { type: 'block', left: sim.barrier, x: px(sim.px), y: px(sim.py) });
    return;
  }
  sim.shields--; sim.invuln = INVULN_TICKS;
  emit(sim, { type: 'hurt', shields: sim.shields, x: px(sim.px), y: px(sim.py) });
}

/** Whatever a downed boss had in the air is harmless from this tick on (the picture lets it fade). */
function fadeAll(sim) {
  if (!sim.bullets.length && !sim.rays.length) return;
  emit(sim, { type: 'fade', bullets: sim.bullets.map(b => [px(b.x), px(b.y)]), rays: sim.rays.map(r => px(r.y)) });
  sim.bullets.length = 0; sim.rays.length = 0;
}
/** A drop appears here and drifts off in a direction the seed fixed (downward at first). */
function dropAt(sim, x, y, kind) {
  const a = 16 + rng.int(sim.seed, 'drop', 100000 + sim.dropN++, 97);
  sim.drops.push({ x, y, kind, vx: Math.trunc((COS[a] * DROP_SPEED[0]) / DROP_SPEED[1]), vy: Math.trunc((SIN[a] * DROP_SPEED[0]) / DROP_SPEED[1]), t: 0 });
  emit(sim, { type: 'drop', kind, x: px(x), y: px(y) });
}
/** It stops firing: whatever it was about to do is called off. v11: what is already in the air stays (bullets,
 *  rays, traps); only a boss going down clears it. */
function stun(sim, e) { e.stun = BREAK_STUN; e.pk = 0; e.pw = 0; e.bt = 0; e.q = 0; if (e.ch) e.ch = 3; }   // broken mid-charge: it climbs back once it can move
/** Damage to an enemy from a shot or the plasma. A mid-boss's shield takes it first; a boss cannot be taken below the
 *  floor of its stage in one go: reaching the floor breaks the stage (the rest of that hit is lost). */
function damage(sim, e, dmg) {
  e.idle = 0;
  if (sim.leg) { dmg = sim.leg.scale(sim, e, dmg); if (dmg <= 0) return; }   // v11: a weak point that is closed takes only part of it
  if (e.stun > 0 && isBoss(e.type) && !isMid(e.type)) return;   // v10: a boss takes nothing while its stage is breaking apart (the stun after a break)
  if (e.shd > 0) {
    e.shd -= dmg;
    if (e.shd <= 0) { e.shd = 0; stun(sim, e); emit(sim, { type: 'shieldBreak', id: e.id, x: px(e.x), y: px(e.y) }); }
    return;
  }
  if (isBoss(e.type) && !isMid(e.type) && e.st < 2) {
    const floor = stageFloor(e);
    if (e.hp - dmg <= floor) {
      e.hp = Math.min(e.hp, floor);
      const pts = BREAK_PTS[e.st];
      sim.score += pts; sim.bossPts += pts; e.st++;
      stun(sim, e);
      emit(sim, { type: 'armorBreak', id: e.id, boss: sim.slot, stage: e.st, x: px(e.x), y: px(e.y), pts });
      dropAt(sim, e.x, e.y, dropKind(sim.seed, 7000 + sim.breaks++));
      return;
    }
  }
  e.hp -= dmg;
}

function kill(sim, e) {
  sim.kills++; sim.chain++;
  if (sim.chain > sim.bestChain) sim.bestChain = sim.chain;
  const pts = basePts(e) + CHAIN_STEP * Math.min(sim.chain, CHAIN_CAP);
  sim.score += pts; sim.killPts += pts;
  emit(sim, { type: 'kill', kind: e.type, x: px(e.x), y: px(e.y), pts, chain: sim.chain, elite: e.el });
  if (e.type === SPLITTER) {
    for (const d of [-1, 1]) add(sim, SHARD, e.x, e.y, 0, KIND[SHARD].hp, d * SHARD_VX * ONE);
    emit(sim, { type: 'split', x: px(e.x), y: px(e.y) });
  }
  const drop = e.dr - 1;                                                 // what it carried, if anything (settled by the seed)
  if (drop >= 0) dropAt(sim, e.x, e.y, drop);
  if (isBoss(e.type)) {                                                  // the rest of its window, on the script clock
    const bonus = Math.max(0, Math.floor((BOSS_SLOTS[sim.slot].end * UNIT_TICKS - clock(sim)) / BOSS_TIME_DIV));
    sim.score += bonus; sim.bossPts += bonus; sim.bossState = 0; sim.bossKills++; sim.bossFell = 1;
    // v8: its bullets are harmless from this tick on (the picture lets them fade); no points, no graze for them
    fadeAll(sim);
    emit(sim, { type: 'bossDown', boss: sim.slot, mid: sim.slot % 2 === 0, x: px(e.x), y: px(e.y), bonus });
  }
}

/** Spec §6: the end bonus is for hits not taken, not for life left, so healing and the barrier buy no points. */
function finish(sim) {
  sim.over = 1;
  if (sim.shields > 0) { sim.shieldPts = SHIELD_PTS * Math.max(0, SHIELDS - sim.hits); sim.score += sim.shieldPts; }
  emit(sim, { type: 'over', survived: sim.shields > 0, bossDown: sim.won === 1, bossKills: sim.bossKills, chapter: sim.chapter });
}

function pickUp(sim, d) {
  const ev = { type: 'pickup', kind: d.kind, x: px(d.x), y: px(d.y) };
  sim.pickups++;
  switch (d.kind) {
    case REPAIR: if (sim.shields < sim.maxShields) sim.shields++; break;
    case OVERHAUL: sim.shields = sim.maxShields; break;                  // kept for old recordings; it has no weight any more
    case HASTE: sim.haste = BUFF_TICKS; break;
    case BOOST: sim.boost = BUFF_TICKS; break;
    case AEGIS: if (sim.invuln < AEGIS_TICKS) sim.invuln = AEGIS_TICKS; break;
    default: {                                                           // upgrade: one of the gear held that can still grow
      const all = [0, 1, 2, 3, 4, 5, 6, 7].filter(g => sim.gear[g] < GEAR_MAX_LV), held = all.filter(g => sim.gear[g] > 0);
      const from = held.length ? held : all;
      if (!from.length) { if (sim.shields < sim.maxShields) sim.shields++; break; }
      const g = from[rng.int(sim.seed, 'gear', sim.upgrades++, from.length)];
      gain(sim, g); ev.gear = g; ev.level = sim.gear[g];
    }
  }
  emit(sim, ev);
}

/** Spec §8: take slot 0-2 of the supply that is waiting. False and no change outside a choice or for a bad index. */
export function choose(sim, index) {
  if (!picking(sim) || !(index === 0 || index === 1 || index === 2)) return false;
  sim.events.length = 0;
  const g = offerAt(sim.seed, sim.supply)[index];
  const grew = gain(sim, g);
  sim.supply = -1; sim.picks++;
  sim.events.unshift({ type: 'pick', slot: index, gear: g, level: sim.gear[g], healed: !grew });
  if (!sim.recordEvents) sim.events.length = 0;
  // v3: play resumes with clear space around the ship whatever was picked. No points, no graze, the chain is untouched.
  const n0 = sim.bullets.length;
  for (let i = n0 - 1; i >= 0; i--) if (near(sim.bullets[i].x, sim.bullets[i].y, sim.px, sim.py, PICK_CLEAR_R)) sim.bullets.splice(i, 1);
  emit(sim, { type: 'clear', n: n0 - sim.bullets.length, x: px(sim.px), y: px(sim.py), r: PICK_CLEAR_R });
  if (sim.invuln < PICK_INVULN) sim.invuln = PICK_INVULN;
  return true;
}

const shot = (x, y, vx, vy, left, dmg) => ({ x, y, vx, vy, left, dmg, hit: [] });
const blocked = (sim, x, y, r) => sim.obst.some(o => near(x, y, o.x, o.y, OBST_R[o.kind] + r));

/** Spec §4 tick order: input -> spawns -> player fire -> shots -> enemies -> bullets -> bodies -> drops -> clock. */
export function step(sim, input) {
  if (picking(sim)) return;                                // a choice is pending: time stands still until choose()
  sim.events.length = 0;
  if (sim.over) return;
  const now = clock(sim);

  // 2. steer
  const dir = input & IN_DIR_MASK, speed = lvl(sim, THRUSTERS, THRUST_SPEED, PLAYER_SPEED) + (sim.boost > 0 ? BOOST_SPEED : 0);
  sim.bank = 0;
  if (dir >= 1 && dir <= 8) {
    sim.px = clamp(sim.px + DX[dir - 1] * speed, PLAYER_MARGIN_X * ONE, (WORLD_W - PLAYER_MARGIN_X) * ONE);
    sim.py = clamp(sim.py + DY[dir - 1] * speed, PLAYER_MIN_Y * ONE, PLAYER_MAX_Y * ONE);
    sim.bank = DX[dir - 1] > 0 ? 1 : DX[dir - 1] < 0 ? -1 : 0;
  }

  if (sim.leg) sim.leg.before(sim, now);                   // v11: the leg's hazards and whatever pushes the ship (wind)

  // 3. scripted spawns and obstacles (on the script clock)
  while (sim.nextSpawn < sim.plan.length && sim.plan[sim.nextSpawn].at <= now) {
    const s = sim.plan[sim.nextSpawn++];
    if (s.type === CARRIER || s.y !== undefined) add(sim, s.type, s.x * ONE, s.y * ONE, 0, s.hp, s.vx);   // placed, not dropped into a lane (v11: a leg's kinds too)
    else spawn(sim, s.type, s.x, s.lane, s.hp);
    const e = sim.enemies[sim.enemies.length - 1];
    e.dr = s.drop + 1; e.sh = s.sh | 0; e.el = s.el | 0;
    if (s.type === DRONE && s.vx) { e.vx = s.vx; e.ac = s.ac | 0; }
    if (e.el) emit(sim, { type: 'elite', id: e.id, kind: e.type, x: s.x });
  }
  if (!sim.bossState && sim.slot < BOSS_SLOTS.length && now === BOSS_SLOTS[sim.slot].from * UNIT_TICKS) spawn(sim, sim.leg ? sim.leg.bossType(sim.slot) : BOSS_SLOTS[sim.slot].type, WORLD_W / 2, 0);
  while (sim.nextWarn < sim.rocks.length && sim.rocks[sim.nextWarn].at - OBST_WARN <= now) {
    const o = sim.rocks[sim.nextWarn++];
    emit(sim, { type: 'obstacleUp', kind: o.kind, x: o.x, ticks: Math.max(0, o.at - now) });
  }
  while (sim.nextObst < sim.rocks.length && sim.rocks[sim.nextObst].at <= now) {
    const o = sim.rocks[sim.nextObst++];
    sim.obst.push({ kind: o.kind, x: o.x * ONE, y: -OBST_R[o.kind] * ONE, vx: o.vx * ONE, vy: (o.kind === PEAK ? PEAK_VY : METEOR_VY) * ONE, hp: OBST_HP[o.kind] });
    emit(sim, { type: 'obstacle', kind: o.kind, x: o.x });
  }

  while (sim.nextStrike < sim.sky.length && sim.sky[sim.nextStrike].at <= now) {   // the storm: a warning, then the column
    const k = sim.sky[sim.nextStrike++];
    sim.strikes.push({ x: k.x * ONE, pw: BEAM_TELEGRAPH, bt: 0 });
    emit(sim, { type: 'strikeUp', x: k.x, w: BEAM_W, ticks: BEAM_TELEGRAPH });
  }

  // 4. the ship fires by itself
  // v12: the period is counted in half ticks, so the plain 5.5 alternates 5 and 6; a whole period fires exactly as before
  const half = Math.max(2, 2 * (lvl(sim, RAPID, RAPID_PERIOD, 0) || FIRE_PERIOD) + 2 * lvl(sim, HEAVY, HEAVY_DELAY, 0) - (sim.haste > 0 ? 2 : 0));
  if (Math.floor((2 * sim.tick) / half) !== Math.floor((2 * sim.tick - 2) / half)) {
    const y = sim.py - 20 * ONE, left = lvl(sim, PIERCE, PIERCE_COUNT, 0), vy = SHOT_V, dmg = lvl(sim, HEAVY, HEAVY_DMG, 1);
    sim.shots.push(shot(sim.px - SHOT_OFFSET * ONE, y, 0, vy, left, dmg), shot(sim.px + SHOT_OFFSET * ONE, y, 0, vy, left, dmg));
    const side = sim.volley++ % lvl(sim, SPREAD, SPREAD_EVERY, 1) === 0 ? lvl(sim, SPREAD, SPREAD_SHOTS, 0) / 2 : 0, sideLeft = hasNet(sim) ? left : 0;
    for (let j = 0; j < side; j++) for (const d of [-1, 1]) sim.shots.push(shot(sim.px + d * SPREAD_WING_X * ONE, y, d * SPREAD_VX[j], SPREAD_VY[j], sideLeft, 1));   // v12: from the wing on its own side
    emit(sim, { type: 'fire' });
  }
  if (sim.gear[WINGMAN] && sim.tick % WING_PERIOD[sim.gear[WINGMAN] - 1] === 0) {
    for (const d of [-1, 1]) sim.shots.push(shot(sim.px + d * WING_OFFSET * ONE, sim.py, 0, SHOT_V, 0, 1));
  }
  // 4b. lock-on laser: the nearest enemies above the ship take damage at once (nearest first, lowest id on a tie)
  if (sim.gear[LASER] && sim.tick % LASER_PERIOD === 0) {
    const R = LASER_RANGE * ONE, inReach = [];
    for (const e of sim.enemies) {
      if (e.hp <= 0 || e.y < 0 || e.y > sim.py) continue;
      const dx = e.x - sim.px, dy = e.y - sim.py, d2 = dx * dx + dy * dy;
      if (d2 <= R * R) inReach.push([d2, e.id, e]);
    }
    inReach.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const hitNow = inReach.slice(0, LASER_TARGETS[sim.gear[LASER] - 1]).map(v => v[2]);
    if (hitNow.length) emit(sim, { type: 'laser', x: px(sim.px), y: px(sim.py), targets: hitNow.map(e => [px(e.x), px(e.y)]) });
    for (const e of hitNow) { damage(sim, e, LASER_DMG); if (e.hp <= 0) kill(sim, e); }
  }

  // 5. shots: move, stop at an obstacle, else hit the first enemy (lowest id) in reach; a piercing shot goes on and
  //    never hits the same one twice
  for (let i = sim.shots.length - 1; i >= 0; i--) {
    const s = sim.shots[i];
    if (sim.leg) sim.leg.bend(sim, s, 1);                    // v11: wind, gravity wells
    s.x += s.vx; s.y -= s.vy;
    let gone = s.y < -30 * ONE || s.x < -30 * ONE || s.x > (WORLD_W + 30) * ONE;
    const oi = gone ? -1 : sim.obst.findIndex(o => near(s.x, s.y, o.x, o.y, OBST_R[o.kind] + SHOT_R));
    if (oi >= 0) {                                                         // an obstacle stops every shot; a heavy one also chips it (v10)
      gone = true;
      const o = sim.obst[oi];
      if (s.dmg >= 2 && o.hp > 0) {
        if (--o.hp === 0) { sim.obst.splice(oi, 1); emit(sim, { type: 'obstBreak', kind: o.kind, x: px(o.x), y: px(o.y) }); }
        else emit(sim, { type: 'obstHit', kind: o.kind, x: px(s.x), y: px(s.y), left: o.hp });
      }
    }
    if (!gone) {
      for (const e of sim.enemies) {
        if (e.hp <= 0 || e.y < 0) continue;
        if (armoured(e, s.x, s.y) || (sim.leg && sim.leg.blocks(sim, e, s))) { gone = true; emit(sim, { type: 'clang', x: px(s.x), y: px(s.y) }); break; }   // v10: plate, not core
        if (s.hit.includes(e.id) || !near(s.x, s.y, e.x, e.y, radius(e) + SHOT_R)) continue;
        // a shell (v8): a shot of 1 damage only chips one layer off; a heavier one breaks it and still hurts
        if (e.sh > 0 && s.dmg < 2) { e.sh--; emit(sim, { type: 'shell', id: e.id, x: px(s.x), y: px(s.y), left: e.sh }); }
        else { if (e.sh > 0) { e.sh = 0; emit(sim, { type: 'shell', id: e.id, x: px(s.x), y: px(s.y), left: 0, broke: 1 }); } damage(sim, e, s.dmg); }
        if (s.left > 0) { s.left--; s.hit.push(e.id); } else gone = true;
        if (e.hp <= 0) kill(sim, e); else emit(sim, { type: 'hit', x: px(s.x), y: px(s.y), kind: e.type });
        break;
      }
    }
    if (gone) sim.shots.splice(i, 1);
  }

  // 6. enemies (in id order): move, fire, leave; obstacles drift down
  for (const e of sim.enemies) if (e.hp > 0) moveEnemy(sim, e);
  for (let i = sim.enemies.length - 1; i >= 0; i--) {
    const e = sim.enemies[i];
    if (e.hp <= 0) sim.enemies.splice(i, 1);
    else if (e.y > (WORLD_H + 60) * ONE || e.x < -80 * ONE || e.x > (WORLD_W + 80) * ONE || e.y < -300 * ONE) { sim.enemies.splice(i, 1); sim.escaped++; emit(sim, { type: 'escape', kind: e.type }); }
  }
  for (let i = sim.obst.length - 1; i >= 0; i--) {
    const o = sim.obst[i];
    o.x += o.vx; o.y += o.vy;
    if (o.y > (WORLD_H + 80) * ONE) sim.obst.splice(i, 1);
  }

  // 7. enemy bullets: move, stop at an obstacle, graze, hit
  const bodyR = playerR(sim);
  for (let i = sim.bullets.length - 1; i >= 0; i--) {
    const b = sim.bullets[i];
    if (sim.leg) sim.leg.bend(sim, b, 0);
    b.x += b.vx; b.y += b.vy;
    if (b.x < -20 * ONE || b.x > (WORLD_W + 20) * ONE || b.y < -20 * ONE || b.y > (WORLD_H + 20) * ONE || blocked(sim, b.x, b.y, BULLET_R)) { sim.bullets.splice(i, 1); continue; }
    if (sim.invuln > 0) continue;
    if (near(b.x, b.y, sim.px, sim.py, bodyR + BULLET_R)) { sim.bullets.splice(i, 1); hurt(sim); continue; }
    if (!b.grazed && near(b.x, b.y, sim.px, sim.py, GRAZE_R)) {
      b.grazed = 1; sim.grazes++; sim.score += GRAZE_PTS; sim.grazePts += GRAZE_PTS;
      emit(sim, { type: 'graze', x: px(b.x), y: px(b.y) });
    }
  }

  // 8. flying into an enemy or an obstacle costs a hit too
  if (sim.invuln === 0) {
    for (const e of sim.enemies) if (e.hp > 0 && !KIND[e.type].ground && (near(e.x, e.y, sim.px, sim.py, radius(e) + bodyR) || (e.ch && inCharge(e, sim.px, sim.py, bodyR)))) { hurt(sim); break; }
  }
  if (sim.invuln === 0 && blocked(sim, sim.px, sim.py, bodyR)) hurt(sim);
  if (sim.invuln === 0 && sim.leg && sim.leg.hazard(sim, bodyR)) hurt(sim);   // v11: the leg's own hazards
  // 8a. beams (v5): a column below its source for as long as it is on. Not a bullet: no graze, nothing clears it.
  if (sim.invuln === 0) {
    const reach = (BEAM_W + bodyR) * ONE;
    beams: for (const e of sim.enemies) {
      if (e.hp <= 0 || e.bt <= 0 || sim.py <= e.y) continue;
      for (const cx of beamColumns(e)) if (Math.abs(sim.px - cx) <= reach) { hurt(sim); break beams; }
    }
  }

  // 8a". rays (v8): come down, live and dead by turns; live and level with the ship = a hit. Not bullets: no graze.
  for (let i = sim.rays.length - 1; i >= 0; i--) {
    const r = sim.rays[i];
    r.y += WALL_SPEED * ONE; r.t++;
    if (r.y > (WORLD_H + 20) * ONE) { sim.rays.splice(i, 1); continue; }
    if (r.t % (RAY_ON + RAY_OFF) === 0 || r.t % (RAY_ON + RAY_OFF) === RAY_ON) emit(sim, { type: 'ray', y: px(r.y), live: rayLive(r) });
    if (sim.invuln === 0 && rayLive(r) && Math.abs(sim.py - r.y) <= (RAY_H + bodyR) * ONE) hurt(sim);
  }

  // 8a'. the storm's lightning (v8): the same rule as a beam, from the top of the screen
  for (let i = sim.strikes.length - 1; i >= 0; i--) {
    const k = sim.strikes[i];
    if (k.pw > 0) { if (--k.pw === 0) { k.bt = BEAM_TICKS; emit(sim, { type: 'strike', x: px(k.x), w: BEAM_W, ticks: BEAM_TICKS }); } continue; }
    if (sim.invuln === 0 && Math.abs(sim.px - k.x) <= (BEAM_W + bodyR) * ONE) hurt(sim);
    if (--k.bt <= 0) sim.strikes.splice(i, 1);
  }

  // 8b. drops: drift slowly and bounce off the frame (v8); flying into one takes it; one left alone fades after DROP_LIFE
  for (let i = sim.drops.length - 1; i >= 0; i--) {
    const d = sim.drops[i];
    d.t = (d.t | 0) + 1; d.x += d.vx | 0; d.y += d.vy | 0;
    if (d.x < DROP_MIN_X * ONE) { d.x = DROP_MIN_X * ONE; d.vx = -d.vx; } else if (d.x > (WORLD_W - DROP_MIN_X) * ONE) { d.x = (WORLD_W - DROP_MIN_X) * ONE; d.vx = -d.vx; }
    if (d.y < DROP_MIN_Y * ONE) { d.y = DROP_MIN_Y * ONE; d.vy = -d.vy; } else if (d.y > PLAYER_MAX_Y * ONE) { d.y = PLAYER_MAX_Y * ONE; d.vy = -d.vy; }
    if (near(d.x, d.y, sim.px, sim.py, DROP_R)) { sim.drops.splice(i, 1); pickUp(sim, d); }
    else if (d.t >= DROP_LIFE) { sim.drops.splice(i, 1); emit(sim, { type: 'dropGone', kind: d.kind, x: px(d.x), y: px(d.y) }); }
  }

  // 9. timers, clock, chapters and end of match
  if (sim.invuln > 0) sim.invuln--;
  if (sim.haste > 0) sim.haste--;
  if (sim.boost > 0) sim.boost--;
  if (sim.gear[BARRIER]) {                                  // the barrier rebuilds one charge at a time
    if (sim.rebuild > 0 && --sim.rebuild === 0 && sim.barrier < BARRIER_CHARGES[sim.gear[BARRIER] - 1]) { sim.barrier++; emit(sim, { type: 'barrier', charges: sim.barrier }); }
    if (sim.rebuild === 0 && sim.barrier < BARRIER_CHARGES[sim.gear[BARRIER] - 1]) sim.rebuild = BARRIER_REBUILD[sim.gear[BARRIER] - 1];
  }
  sim.tick++;
  if (sim.shields <= 0) return finish(sim);
  // A boss slot ends when its boss is shot down (the rest of its window is skipped) or runs out its window (it leaves
  // for nothing). Then comes the boost unit; a boss shot down also brings a supply, a boss that left does not.
  const sl = BOSS_SLOTS[sim.slot], endAt = sl ? sl.end * UNIT_TICKS : 0;
  let done = 0;
  if (sim.bossFell) { sim.bossFell = 0; done = 1; sim.skip = endAt - sim.tick; }
  else if (sim.bossState && clock(sim) >= endAt && sim.stall < overtime(sim.slot)) { sim.skip--; sim.stall++; }   // v10: overtime, the clock held at the end of the window
  else if (sim.bossState && clock(sim) >= endAt) {
    const k = sim.enemies.findIndex(e => isBoss(e.type));
    if (k >= 0) sim.enemies.splice(k, 1);
    emit(sim, { type: 'bossLeave', boss: sim.slot });
    done = 2;
  }
  if (done) {
    sim.bossState = 0; sim.slot++; sim.stall = 0;
    if (sim.slot === BOSS_SLOTS.length) { sim.won = done === 1 ? 1 : 0; return finish(sim); }
    const ch = sim.slot >> 1;
    emit(sim, { type: 'boost', toChapter: ch !== sim.chapter ? ch : -1 });
    if (ch !== sim.chapter) { sim.chapter = ch; emit(sim, { type: 'chapter', chapter: ch }); }
    if (done === 1) sim.supply = sim.slot;                  // supply k follows boss slot k - 1; a skipped one keeps its number
    // v8: the boost is short, and shorter still after a supply (choosing was the boost)
    sim.boostEnd = sim.tick + (done === 1 ? BOOST_AFTER_PICK : BOOST_TICKS); sim.boostTo = (sl.end + 1) * UNIT_TICKS;
  } else if (sim.boostEnd && sim.tick >= sim.boostEnd) { sim.skip = sim.boostTo - sim.tick; sim.boostEnd = 0; emit(sim, { type: 'boostEnd' }); }
  if (clock(sim) === SUPPLY_UNIT * UNIT_TICKS) sim.supply = 0;
  if (clock(sim) >= MATCH_TICKS) finish(sim);
}

export const phase = sim => (sim.over ? 'over' : picking(sim) ? 'choice' : 'play');
export const score = sim => sim.score;
export const scoreBreakdown = sim => ({
  kills: sim.kills, killPts: sim.killPts, bestChain: sim.bestChain, grazes: sim.grazes, grazePts: sim.grazePts,
  bossPts: sim.bossPts, bossKills: sim.bossKills, chapter: sim.chapter, shieldPts: sim.shieldPts, hits: sim.hits, escaped: sim.escaped,
  gear: sim.gear.slice(), pickups: sim.pickups, maxShields: sim.maxShields,
});

export function stateHash(sim) {
  const h = createHasher(sim.tick).mixAll([
    sim.score, sim.over, sim.px, sim.py, sim.shields, sim.maxShields, sim.invuln, sim.chain, sim.bestChain, sim.kills, sim.grazes,
    sim.hits, sim.escaped, sim.killPts, sim.grazePts, sim.bossPts, sim.shieldPts, sim.nextSpawn, sim.nextId, sim.bossState, sim.rings,
    sim.picks, sim.skip, sim.chapter, sim.slot, sim.supply, sim.won, sim.bossKills, sim.walls, sim.spiral, sim.boostEnd, sim.boostTo, sim.nextStrike, sim.dropN, sim.volley, sim.breaks, sim.stall,
    ...sim.gear, sim.barrier, sim.rebuild, sim.haste, sim.boost, sim.upgrades, sim.pickups, sim.nextObst, sim.nextWarn,
  ]);
  for (const e of sim.enemies) h.mixAll([e.id, e.type, e.x, e.y, e.hp, e.t, e.aux, e.vx, e.pk, e.pv, e.pw, e.a, e.bt, e.bm, e.dr, e.sh, e.el, e.ac, e.q, e.qd, e.st, e.stun, e.shd, e.idle, e.refills, e.ch, e.cw]);
  for (const k of sim.strikes) h.mixAll([k.x, k.pw, k.bt]);
  for (const r of sim.rays) h.mixAll([r.y, r.t]);
  for (const b of sim.bullets) h.mixAll([b.x, b.y, b.vx, b.vy, b.grazed]);
  for (const s of sim.shots) h.mixAll([s.x, s.y, s.vx, s.vy, s.left, s.dmg, s.hit.length, ...s.hit]);
  for (const d of sim.drops) h.mixAll([d.x, d.y, d.kind, d.vx | 0, d.vy | 0, d.t | 0]);
  for (const o of sim.obst) h.mixAll([o.x, o.y, o.kind, o.vx, o.hp]);
  if (sim.leg) sim.leg.hash(sim, h);
  return h.value();
}

/** GameDef consumed by core/match.js (Recorder, replay, verify) and the tools. */
/** v11: what another leg's rules are written with (sim/leg6.js). */
export const ENGINE = Object.freeze({ add, spawn, fire, ring, aimed3, spiral, emit, px, near, hurt, kill, damage, dropAt, fadeAll, stun, lockOn, beamUp, chargeUp, blocked, playerR, clamp, shot, dropKind });

export const GAME = Object.freeze({
  id: 'sky-talon', version: 12, maxTicks: MAX_TICKS, maxChoices: SUPPLIES,
  createSim, step, phase, choose, score, stateHash, scoreBreakdown,
});
