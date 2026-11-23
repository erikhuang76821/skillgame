// Leg four, "the underworld's edge" (gdd/05 「第十四版」, design in gdd/13 §4.3). A leg of the same game: it runs on the
// engine in sim.js and supplies only what differs. sim.js never imports this file, so nothing here can change another leg.
//
// Four chapters; each brings ONE new machine of its own, the rest are leg one's (same rules, same numbers):
//   1 Uranus   metronome gunboat + gunner, diver, weaver    convoy (leg one's)            Brontes -> Briareus
//   2 Titania  faint scout       + lancer, drone, miner     storm (a magnetic storm)      Circe   -> Mnemosyne
//   3 Neptune  sonar buoy        + bulwark, beamer, seeker  gorge (an ice-volcano rift)   Triton  -> Proteus
//   4 Pluto    revenant          + splitter, lancer, weaver shower (ice blocks)           Charon  -> Styx
//
// Deterministic and pure: integers only, no DOM, no clock, no Math.random. Positions are sub-pixels (ONE per px).

import { makeRng, ONE, SIN, COS, angleOf } from './core/index.js';
import {
  ENGINE, KIND, registerKinds, createSim, step, phase, choose, score, stateHash, scoreBreakdown,
  SCRIPT, sectionAt, UNIT_TICKS, WORLD_W, WORLD_H, LANES, LANE_X0, LANE_STEP, DROP_CHANCE, SUPPLIES, MAX_TICKS,
  BEAM_TELEGRAPH, BEAM_W, isBoss, PLAYER_MARGIN_X, STAGE_FLOOR_PCT,
  DRONE, GUNNER, DIVER, WEAVER, LANCER, MINER, SPLITTER, BULWARK, SEEKER, BEAMER, CARRIER, MINE, CARRIERS, CARRIER_VX,
  strikes, obstacles as legOneObstacles,
} from './sim.js';
import './leg6.js'; import './leg2.js'; import './leg3.js';   // the other legs' kinds first, so this leg's kind numbers never depend on what loaded it

const { fire, ring, emit, px, near, aimed3, spiral, dropKind, add, damage, kill } = ENGINE;
// streams 1, 2, 6, 7, 13 mean what they mean in leg one; 28 and up are this leg's (gdd/05 v14 §6)
const rng = makeRng({ lane: 1, order: 2, drop: 6, dropKind: 7, event: 13, lanes: 28, gap: 29, ferry: 30, rain: 31 });
/** What a bullet looks like (the picture only): frost, a sonar pellet, the Styx's dark water, a thunderbolt's shard. */
export const FROST = 26, SONAR = 27, STYGIAN = 28, THUNDER = 29;

// ---------- kinds ----------
const FIRST = registerKinds([
  { name: 'metronome', hp: 4, r: 26, pts: 40 },
  { name: 'scout', hp: 2, r: 18, pts: 20 },
  { name: 'beast', hp: 12, r: 30, pts: 120 },                  // a scout once it is charmed (or left too long)
  { name: 'buoy', hp: 5, r: 26, pts: 45 },
  { name: 'revenant', hp: 3, r: 24, pts: 35 },
  { name: 'husk', hp: 1, r: 20, pts: 10, ground: 1 },          // what a revenant leaves; harmless to touch
  { name: 'arm', hp: 50, r: 30, pts: 200 },                    // Briareus's arms
  { name: 'ferry', hp: 24, r: 34, pts: 150 },                  // Charon's boats
  { name: 'heel', hp: 9999, r: 26, pts: 0, ground: 1 },        // Styx's one weak point (takes nothing itself)
  { name: 'brontes', hp: 140, r: 58, pts: 500, mid: 1 },
  { name: 'circe', hp: 200, r: 62, pts: 750, mid: 1 },
  { name: 'triton', hp: 240, r: 66, pts: 1250, mid: 1 },
  { name: 'charon', hp: 340, r: 70, pts: 2000, mid: 1 },
  { name: 'briareus', hp: 340, r: 96, pts: 1000, boss: 1, armour: [84, 120, -60, 150] },
  { name: 'mnemosyne', hp: 360, r: 102, pts: 1500, boss: 1, armour: [86, 176, -90, 230] },
  { name: 'proteus', hp: 560, r: 106, pts: 2500, boss: 1, armour: [90, 182, -100, 160] },
  { name: 'styx', hp: 560, r: 104, pts: 4000, boss: 1 },
]);
export const METRONOME = FIRST, SCOUT = FIRST + 1, BEAST = FIRST + 2, BUOY = FIRST + 3, REVENANT = FIRST + 4, HUSK = FIRST + 5;
export const ARM = FIRST + 6, FERRY = FIRST + 7, HEEL = FIRST + 8;
export const L4_MIDS = Object.freeze([FIRST + 9, FIRST + 10, FIRST + 11, FIRST + 12]);
export const L4_BOSSES = Object.freeze([FIRST + 13, FIRST + 14, FIRST + 15, FIRST + 16]);
export const [BRONTES, CIRCE, TRITON, CHARON] = L4_MIDS;
export const [BRIAREUS, MNEMOSYNE, PROTEUS, STYX] = L4_BOSSES;
const bossType = slot => (slot % 2 === 0 ? L4_MIDS : L4_BOSSES)[slot >> 1];

// ---------- numbers (gdd/05 v14 §3, §4; all starting values) ----------
export const L4_HP_ADD = Object.freeze([1, 1, 1, 4]);   // v2: chapter four 5 -> 4 (the ship fires 10% slower from v12)
export const L4_ROSTER = Object.freeze([[METRONOME, GUNNER, DIVER, WEAVER], [SCOUT, LANCER, DRONE, MINER], [BUOY, BULWARK, BEAMER, SEEKER], [REVENANT, SPLITTER, LANCER, WEAVER]]);
const HEAVY = new Set([BULWARK, BEAMER]);
const SWARM = new Set([DRONE, DIVER, SEEKER, SCOUT]);
const MORE = Object.freeze([4, 3, 2, 8]);   // v2: chapter four 9 -> 8 (slower fire from v12)

export const L4_BEAT = 20, L4_BEAT_HOLD = 360, L4_BEAT_SPEED = 5;
export const L4_SCOUT_VY = 2, L4_SCOUT_RIPEN = 300, L4_SCOUT_WARN = 45, L4_BEAST_HP = 12, L4_BEAST_FIRE = 70;
export const L4_BUOY_PERIOD = 100, L4_BUOY_HOLD = 300, L4_BUOY_PULSE = 24, L4_BUOY_N = 12;
export const L4_REV_VY = 3, L4_REV_FIRE = 80, L4_HUSK_TICKS = 120, L4_HUSK_WARN = 45, L4_REV_RISEN_HP = 2;
export const L4_PATTERNS = Object.freeze({
  brontes: { fan: 0, ring: [160, 12, 11] }, circe: { fan: 70, ring: [120, 12, 9] }, triton: { fan: 70, ring: [110, 14, 13] }, charon: { fan: 65, ring: [105, 14, 9] },
  briareus: { fan: 65, ring: [130, 14, 9] }, mnemosyne: { fan: 60, ring: [100, 16, 11] }, proteus: { fan: 60, ring: [95, 16, 13] }, styx: { fan: 55, ring: [120, 16, 11] },
});
export const L4_SPIRAL_EVERY = 8;
export const L4_BOLT_W = 60, L4_BOLT_LIVE = 8, L4_BOLT_FAN = 7, L4_BOLT_STEP = 9;
export const L4_ARM_HP = 50, L4_ARM_DX = Object.freeze([-250, -160, 160, 250]), L4_ARM_DY = 60, L4_ARM_FIRE = 150, L4_ARM_PASS = 45;
export const L4_CIRCE_CALL = 180, L4_CIRCE_CHARM = 140, L4_WAND = 45;
export const L4_LANE_W = 180, L4_FIRST_WARN = 90, L4_DEMO_WARN = 60, L4_REPLAY_WARN = 36, L4_STRIPE_LIVE = 10, L4_MNEMO_PAUSE = 60, L4_MNEMO_PERIOD = 720, L4_MNEMO_FROM = 30;
export const L4_ROW_H = 140, L4_ROWS_Y = Object.freeze([760, 900, 1040]);
export const L4_TRITON_PERIOD = 120, L4_TRITON_N = 24, L4_TRITON_GAP = 4, L4_TRITON_WARN = 40;
export const L4_MORPH_WARN = 60, L4_TRUE_TURN = 180;
export const L4_FERRY_PERIOD = 240, L4_FERRY_WARN = 60, L4_FERRY_Y = 340, L4_FERRY_RUN = 150, L4_FERRY_DROP = 3;
export const L4_HEEL_R = 140, L4_HEEL_TURN = 240, L4_HEEL_PASS = 150;
export const L4_RIVER_Y = 776, L4_RIVER_AMP = 90, L4_RIVER_W = 44;
export const L4_RAIN_PERIOD = 300, L4_RAIN_R = 60, L4_RAIN_WARN = 54, L4_RAIN_LIVE = 8, L4_RAIN_LATER = 30, L4_RAIN_SLIDE = 30;
export const L4_RAIN_ROWS = Object.freeze([[620, [160, 360, 560]], [810, [60, 260, 460, 660]], [1000, [160, 360, 560]]]);
const V = 1, H = 2, C = 3;                                   // zone kinds: a vertical stripe, a horizontal one, a circle
const LANE_X = x => L4_LANE_W / 2 + x * L4_LANE_W;

// ---------- schedule ----------
const chapterOf = k => SCRIPT[k].chapter;
const sectionEnd = k => (k + 1 < SCRIPT.length ? SCRIPT[k + 1].from : SCRIPT[k].from);
const isClimax = k => !!SCRIPT[k + 1]?.boss && SCRIPT[k + 1].slot % 2 === 1;
const unitOf = name => SCRIPT.find(s => s.event === name).from;
const laneX = lane => LANE_X0 + lane * LANE_STEP;

export function schedule(seed) {
  const out = [];
  const push = (at, type, lane, x, extra = {}) => {
    const i = out.length, k = sectionAt(at);
    const drop = rng.int(seed, 'drop', i, 100) < DROP_CHANCE ? dropKind(seed, i) : -1;
    out.push({ at, type, lane, x, hp: KIND[type].hp + (SWARM.has(type) ? 0 : L4_HP_ADD[chapterOf(k)]), sh: 0, drop, ...extra });
  };
  const one = (t0, type, idx) => {
    const lane = rng.int(seed, 'lane', 9000 + idx, LANES), x = laneX(lane);
    switch (type) {
      case DRONE: { const x0 = Math.min(WORLD_W - 200, Math.max(200, x)); for (let j = -2; j <= 2; j++) push(t0 + Math.abs(j) * 14, DRONE, lane, x0 + j * 56); return; }
      case DIVER: case SEEKER: push(t0, type, lane, x); push(t0 + 30, type, (lane + 3) % LANES, laneX((lane + 3) % LANES)); return;
      case SCOUT: { const x0 = Math.min(WORLD_W - 180, Math.max(180, x)); for (let j = 0; j < 4; j++) push(t0 + j * 10, SCOUT, lane, x0 + (j - 1.5) * 70 | 0); return; }
      default: return push(t0, type, lane, x);
    }
  };
  SCRIPT.forEach((sec, k) => {
    if (sec.boss || sec.boost || sec.event) return;
    const ch = sec.chapter, [a, b, c, d] = L4_ROSTER[ch], climax = isClimax(k);
    const old = L4_ROSTER.slice(0, ch).flat().filter(t => !HEAVY.has(t));
    for (let u = sec.from; u < sectionEnd(k); u++) {
      const t0 = u * UNIT_TICKS, i = u - sec.from, idx = u * 16;
      const spare = n => { if (old.length) one(t0 + 100 + n * 60, old[(u + n) % old.length], idx + 12 + n); };
      if (sec.safe || (ch === 0 && sec.name === SCRIPT[1].name)) {      // 起: the new machine alone, then a shooter alone, then more
        if (i === 0) one(t0 + 20, a, idx);
        else if (i === 1) one(t0 + 20, c, idx);
        else { one(t0 + 10, a, idx); one(t0 + 110, c, idx + 1); if (i >= 2) one(t0 + 60, d, idx + 3); if (i >= 3) { one(t0 + 170, b, idx + 2); spare(0); } }
        continue;
      }
      const n = Math.min(1 + MORE[ch] + (climax ? 2 : 0) + (i >> 1), ch === 3 ? 10 : climax ? 9 : 8), mix = [a, c, b, d, a, c, d, b, b, d, a, c];
      for (let j = 0, placed = 0; placed < n && j < mix.length; j++) { if (HEAVY.has(mix[j]) && j >= 4) continue; one(t0 + 10 + placed * Math.floor(200 / n), mix[j], idx + j); placed++; }
      spare(0); if (climax || i >= 3 || ch >= 2) spare(1);
    }
  });
  const cu = unitOf('convoy') * UNIT_TICKS, cm = rng.int(seed, 'event', 0, 2);
  for (let i = 0; i < CARRIERS; i++) {
    const left = (i + cm) % 2 === 0;
    push(cu + i * 50, CARRIER, 0, left ? -50 : WORLD_W + 50, { y: 150 + i * 70, vx: (left ? CARRIER_VX : -CARRIER_VX) * ONE });
    Object.assign(out[out.length - 1], { hp: KIND[CARRIER].hp, drop: dropKind(seed, 6000 + i) });
  }
  const su = unitOf('storm') * UNIT_TICKS;
  for (let i = 0; i < 2; i++) { const lane = rng.int(seed, 'event', 10 + i, LANES); push(su + 50 + i * 80, MINE, lane, laneX(lane)); Object.assign(out[out.length - 1], { hp: KIND[MINE].hp, drop: -1 }); }
  return out.map((p, i) => [p, i]).sort((x, y) => x[0].at - y[0].at || x[1] - y[1]).map(v => v[0]);
}

// ---------- the leg's own state ----------
function init(sim) {
  sim.l4 = {
    sky: strikes(sim.seed), nextSky: 0,
    zones: [],                                                // { k (V | H | C), x, y, w (stripe width), r (circle), at (drawn), from, to (live) }
    arms: 0, armAcc: 0,                                       // Briareus: arms set up (his id); damage owed to him, in hundredths
    lanes: [0, 0, 0, 0],                                      // Mnemosyne: this round's safe lanes
    charmId: 0, charmLeft: 0,                                 // Circe (and Proteus): the scout the wand points at; ticks until it turns
    gaps: 0, gapNext: -1,                                     // Triton (and Proteus): rings laid; the gap of the next one (-1 none shown)
    form: -1, formWait: 0,                                    // Proteus: the form he shows; ticks of warning before it acts
    ferries: 0, ferryLeft: 0, ferrySide: 0,                   // Charon: boats sent; ticks to the next boat; which side it comes from (0 left)
    styx: 0, riverFrom: 0, heelAcc: 0, pass: 0, rains: 0,     // Styx: set up (her id); the tick her river started; damage owed; a pass under way; rain laid
  };
}
const clampX = x => Math.min((WORLD_W - PLAYER_MARGIN_X) * ONE, Math.max(PLAYER_MARGIN_X * ONE, x));
const findBoss = sim => sim.enemies.find(e => e.hp > 0 && isBoss(e.type));
const tag = (sim, c) => { sim.bullets[sim.bullets.length - 1].c = c; };
const fan = (sim, x, y, tx, ty, n, step, speed, c) => { const a = angleOf(tx - x, ty - y); for (let k = 0; k < n; k++) { fire(sim, x, y, a + (2 * k - n + 1) * step / 2 | 0, speed); tag(sim, c); } };
function zone(sim, k, x, y, w, r, warn, live) {
  sim.l4.zones.push({ k, x, y, w, r, at: sim.tick, from: sim.tick + warn, to: sim.tick + warn + live });
  emit(sim, { type: 'zoneUp', k, x: px(x), y: px(y), w, r, ticks: warn, live });
}
/** A ring with a gap: `n` bullets, the ones from `g` for `gn` places left out. Speed in halves of a pixel. */
function gapRing(sim, x, y, n, off, g, gn, halfSpeed, c) {
  for (let k = 0; k < n; k++) {
    if ((k - g + n) % n < gn) continue;
    const a = (off + Math.floor((k * 256) / n)) & 255;
    sim.bullets.push({ x, y, vx: (COS[a] * halfSpeed) >> 1, vy: (SIN[a] * halfSpeed) >> 1, grazed: 0, c });
  }
}
/** A scout turns into the beast (charmed, or left too long). */
function ripen(sim, e) { e.type = BEAST; e.hp = L4_BEAST_HP; e.t = 0; e.qd = 0; emit(sim, { type: 'charm', id: e.id, x: px(e.x), y: px(e.y) }); }

function before(sim, now) {
  const L = sim.l4;
  while (L.nextSky < L.sky.length && L.sky[L.nextSky].at <= now) {   // the magnetic storm, leg one's lightning
    const k = L.sky[L.nextSky++];
    sim.strikes.push({ x: k.x * ONE, pw: BEAM_TELEGRAPH, bt: 0 });
    emit(sim, { type: 'strikeUp', x: k.x, w: BEAM_W, ticks: BEAM_TELEGRAPH });
  }
  for (let i = L.zones.length - 1; i >= 0; i--) if (L.zones[i].to <= sim.tick) L.zones.splice(i, 1);
  // the wand: the scout it points at turns, if it is still a scout
  if (L.charmLeft > 0 && --L.charmLeft === 0) { const s = sim.enemies.find(o => o.id === L.charmId && o.hp > 0 && o.type === SCOUT); if (s) ripen(sim, s); L.charmId = 0; }
  // Charon's boat sets out once its side has been shown
  if (L.ferryLeft > 0 && --L.ferryLeft === 0 && sim.enemies.some(o => o.type === CHARON && o.hp > 0)) {
    const left = L.ferrySide === 0, f = add(sim, FERRY, (left ? -40 : WORLD_W + 40) * ONE, L4_FERRY_Y * ONE, 0, KIND[FERRY].hp);
    f.vx = left ? 1 : -1;
    emit(sim, { type: 'ferry', id: f.id, side: L.ferrySide });
  }
  const b = findBoss(sim);
  if (!b || b.type !== STYX) L.styx = 0;
}

// ---------- machines ----------
function hold(sim, e, stopY, holdTicks, act) {                // q 0 coming down, 1 holding and acting, 2 leaving
  if (e.q === 0) { const stop = stopY * ONE; e.y = Math.min(stop, e.y + 3 * ONE); if (e.y === stop) { e.q = 1; e.qd = 0; } }
  else if (e.q === 1) { act(++e.qd); if (e.qd >= holdTicks) e.q = 2; }
  else e.y += 4 * ONE;
}
function move(sim, e) {
  const L = sim.l4;
  switch (e.type) {
    case METRONOME: return hold(sim, e, 180 + ((e.id * 37) % 81), L4_BEAT_HOLD, d => {
      const c = d % (4 * L4_BEAT);
      if (c === 0 || c === L4_BEAT || c === 2 * L4_BEAT) emit(sim, { type: 'beat', id: e.id, n: c / L4_BEAT + 1, x: px(e.x), y: px(e.y) });
      if (c === 3 * L4_BEAT) { fan(sim, e.x, e.y, sim.px, sim.py, 3, 9, L4_BEAT_SPEED, FROST); emit(sim, { type: 'beat', id: e.id, n: 4, x: px(e.x), y: px(e.y) }); }
    });
    case SCOUT:
      e.y += L4_SCOUT_VY * ONE; e.x = clampX(e.x + SIN[(e.t * 2 + e.id * 41) & 255]);
      if (++e.qd === L4_SCOUT_RIPEN - L4_SCOUT_WARN) emit(sim, { type: 'ripenUp', id: e.id, ticks: L4_SCOUT_WARN });
      if (e.qd >= L4_SCOUT_RIPEN) ripen(sim, e);
      return;
    case BEAST:
      e.y += ONE;
      if (++e.qd % L4_BEAST_FIRE === 0 && e.y > 0) fan(sim, e.x, e.y, sim.px, sim.py, 3, 9, 4, FROST);
      return;
    case BUOY: return hold(sim, e, 200 + ((e.id * 53) % 101), L4_BUOY_HOLD, d => {
      if (d % L4_BUOY_PERIOD === L4_BUOY_PERIOD - L4_BUOY_PULSE) emit(sim, { type: 'pulse', id: e.id, ticks: L4_BUOY_PULSE });
      if (d % L4_BUOY_PERIOD === 0) gapRing(sim, e.x, e.y, L4_BUOY_N, 64 + 256 / (2 * L4_BUOY_N) | 0, L4_BUOY_N - 1, 2, 5, SONAR);   // the two around straight down are left out
    });
    case REVENANT:
      e.y += L4_REV_VY * ONE;
      if (e.t % L4_REV_FIRE === 40 && e.y > 0) { fire(sim, e.x, e.y, angleOf(sim.px - e.x, sim.py - e.y), 4); tag(sim, STYGIAN); }
      return;
    case HUSK:
      if (++e.qd === L4_HUSK_TICKS - L4_HUSK_WARN) emit(sim, { type: 'huskGlow', id: e.id, ticks: L4_HUSK_WARN });
      if (e.qd >= L4_HUSK_TICKS) { e.type = REVENANT; e.hp = L4_REV_RISEN_HP; e.pv = 1; e.t = 0; e.qd = 0; emit(sim, { type: 'rise', id: e.id, x: px(e.x), y: px(e.y) }); }
      return;
    case ARM: {
      const b = sim.enemies.find(o => o.type === BRIAREUS && o.hp > 0);
      if (!b || b.st >= 2) { e.hp = 0; return; }
      e.x = b.x + L4_ARM_DX[e.aux] * ONE; e.y = b.y + L4_ARM_DY * ONE;
      if (b.stun > 0) return;
      const c = (e.t + e.aux * 22) % L4_ARM_FIRE;
      if (c === L4_ARM_FIRE - 20) emit(sim, { type: 'flash', id: e.id, ticks: 20 });
      if (c === 0) fan(sim, e.x, e.y, sim.px, sim.py, 3, 9, 4, FROST);
      return;
    }
    case FERRY:                                               // in 300 px, sets three revenants down, turns back
      if (e.q === 0) {
        e.x += e.vx * 2 * ONE;
        if (++e.qd >= L4_FERRY_RUN || !sim.enemies.some(o => o.type === CHARON && o.hp > 0)) {
          if (e.qd >= L4_FERRY_RUN) { for (let j = 0; j < L4_FERRY_DROP; j++) add(sim, REVENANT, e.x + (j - 1) * 50 * ONE, e.y + 30 * ONE, 0, KIND[REVENANT].hp); emit(sim, { type: 'dock', id: e.id, x: px(e.x), y: px(e.y) }); }
          e.q = 1;
        }
      } else e.x -= e.vx * 4 * ONE;
      return;
    case HEEL: {                                              // round Styx; only the lower half of the turn shows
      const b = sim.enemies.find(o => o.type === STYX && o.hp > 0);
      if (!b) { e.hp = 0; return; }
      const a = Math.floor((e.t * 256) / L4_HEEL_TURN) & 255;
      if (a < 128) { e.x = b.x + COS[a] * L4_HEEL_R; e.y = b.y + SIN[a] * L4_HEEL_R; } else { e.x = b.x; e.y = -100 * ONE; }
      return;
    }
    default: e.y += 4 * ONE;
  }
}

// ---------- mid-bosses and bosses ----------
function brontes(sim, e, t) {                                 // three beats and the fourth: lightning on the stripe laid at the first, and seven
  const c = t % (4 * L4_BEAT);
  if (c === 0) zone(sim, V, sim.px, 0, L4_BOLT_W, 0, 3 * L4_BEAT, L4_BOLT_LIVE);
  if (c % L4_BEAT === 0) emit(sim, { type: 'beat', id: e.id, n: c / L4_BEAT + 1, x: px(e.x), y: px(e.y) });
  if (c === 3 * L4_BEAT) fan(sim, e.x, e.y, sim.px, sim.py, L4_BOLT_FAN, L4_BOLT_STEP, 4, THUNDER);
}
function circe(sim, e, t) {                                   // calls two scouts; the wand turns the nearest one
  const L = sim.l4;
  if (t % L4_CIRCE_CALL === 0) for (const d of [-1, 1]) add(sim, SCOUT, clampX(e.x + d * 120 * ONE), e.y + 40 * ONE, 0, KIND[SCOUT].hp);
  if (t % L4_CIRCE_CHARM === L4_CIRCE_CHARM >> 1 && !L.charmLeft) {
    let best = null, bd = 0;
    for (const o of sim.enemies) {
      if (o.hp <= 0 || o.type !== SCOUT || o.y < 0) continue;
      const dx = (o.x - e.x) / ONE, dy = (o.y - e.y) / ONE, d2 = dx * dx + dy * dy;
      if (!best || d2 < bd || (d2 === bd && o.id < best.id)) { best = o; bd = d2; }
    }
    if (best) { L.charmId = best.id; L.charmLeft = L4_WAND; emit(sim, { type: 'wand', id: best.id, from: e.id, ticks: L4_WAND }); }
  }
}
function triton(sim, e, t) {                                  // a widening ring with a gap the seed chose, shown first
  const L = sim.l4, c = t % L4_TRITON_PERIOD;
  if (c === L4_TRITON_PERIOD - L4_TRITON_WARN) { L.gapNext = rng.int(sim.seed, 'gap', L.gaps, L4_TRITON_N); emit(sim, { type: 'tritonGap', x: px(e.x), y: px(e.y), n: L4_TRITON_N, g: L.gapNext, gn: L4_TRITON_GAP, ticks: L4_TRITON_WARN }); }
  if (c === 0 && t > 0 && L.gapNext >= 0) { gapRing(sim, e.x, e.y, L4_TRITON_N, 0, L.gapNext, L4_TRITON_GAP, 6, SONAR); L.gaps++; L.gapNext = -1; }
}
/** Mnemosyne's four safe lanes of round `n`, the ship in lane `from` when she starts: a walk of one lane at most a step,
 *  starting next to the ship and ending next to where it started (so the replay's first lane is a lane away too). */
export function safeLanes(seed, n, from) {
  const c = v => Math.min(3, Math.max(0, v)), out = [c(from + rng.int(seed, 'lanes', 8 * n, 3) - 1)];
  for (let s = 1; s < 3; s++) out.push(c(out[s - 1] + rng.int(seed, 'lanes', 8 * n + s, 3) - 1));
  const last = [out[2] - 1, out[2], out[2] + 1].filter(v => v >= 0 && v <= 3 && Math.abs(v - out[0]) <= 1);
  out.push(last[rng.int(seed, 'lanes', 8 * n + 3, last.length)]);
  return out;
}
export const laneOf = x => Math.min(3, Math.max(0, Math.floor(x / (L4_LANE_W * ONE))));
export const safeRow = (seed, n, s) => rng.int(seed, 'lanes', 8 * n + 4 + s, 3);
function stripes(sim, lane, warn, rows, n, s) {
  for (let l = 0; l < 4; l++) if (l !== lane) zone(sim, V, LANE_X(l) * ONE, 0, L4_LANE_W, 0, warn, L4_STRIPE_LIVE);
  if (rows) { const r = safeRow(sim.seed, n, s); L4_ROWS_Y.forEach((y, i) => { if (i !== r) sim.l4.zones.push({ k: H, x: 0, y: y * ONE, w: L4_ROW_H, r: 0, at: sim.tick, from: sim.tick + 2 * warn, to: sim.tick + 2 * warn + L4_STRIPE_LIVE }); });
    emit(sim, { type: 'rowsUp', safe: r, ys: L4_ROWS_Y, h: L4_ROW_H, after: warn, ticks: warn }); }
}
/** Where Mnemosyne is in her round: shows four, waits, plays them again faster. True while the stripes are on. */
function mnemosyne(sim, e, t, rage) {
  const L = sim.l4, n = Math.floor(t / L4_MNEMO_PERIOD), c = t % L4_MNEMO_PERIOD;
  if (c === L4_MNEMO_FROM) L.lanes = safeLanes(sim.seed, n, laneOf(sim.px));
  const lanes = L.lanes;
  // the first of each four comes with a longer warning: its safe lane can be anywhere (the next ones are a lane away at most)
  const lead = L4_FIRST_WARN - L4_DEMO_WARN, demo = s => L4_MNEMO_FROM + (s ? lead : 0) + s * (L4_DEMO_WARN + L4_STRIPE_LIVE), replay0 = demo(4) + L4_MNEMO_PAUSE, replay = s => replay0 + (s ? L4_FIRST_WARN - L4_REPLAY_WARN : 0) + s * (L4_REPLAY_WARN + L4_STRIPE_LIVE);
  for (let s = 0; s < 4; s++) {
    if (c === demo(s)) { stripes(sim, lanes[s], s ? L4_DEMO_WARN : L4_FIRST_WARN, rage, n, s); if (s === 0) emit(sim, { type: 'memory', round: n }); }
    if (c === replay(s)) { stripes(sim, lanes[s], s ? L4_REPLAY_WARN : L4_FIRST_WARN, rage, n, s); if (s === 0) emit(sim, { type: 'recall', round: n }); }
  }
  return c >= L4_MNEMO_FROM && c < replay(4) + (rage ? L4_REPLAY_WARN + L4_STRIPE_LIVE : 0);
}
function rain(sim) {                                          // Styx's core: the second grade of the rings of circles (gdd/13 §10)
  const L = sim.l4, slide = rng.int(sim.seed, 'rain', L.rains++, 2 * L4_RAIN_SLIDE + 1) - L4_RAIN_SLIDE;
  L4_RAIN_ROWS.forEach(([y, xs], row) => { for (const x0 of xs) zone(sim, C, (x0 + (row % 2 === 0 ? slide : 0)) * ONE, y * ONE, 0, L4_RAIN_R, L4_RAIN_WARN + (row >= 2 ? L4_RAIN_LATER : 0), L4_RAIN_LIVE); });
}
/** Proteus's form: 0 Brontes, 1 Circe, 2 Triton (his stages), 3 his own (half his core gone). */
export const proteusForm = e => (e.st < 2 ? e.st : e.hp <= Math.trunc((KIND[PROTEUS].hp * STAGE_FLOOR_PCT[1]) / 200) ? 3 : 2);

function boss(sim, e, t, { sig, rage, P, D }) {
  const L = sim.l4, at = (period, ph) => t % period === ph;
  const pat = L4_PATTERNS[KIND[e.type].name];
  let quiet = false;
  if (e.type === MNEMOSYNE) quiet = mnemosyne(sim, e, t, rage);
  if (pat && !quiet) {
    const fanP = D(P(pat.fan)), [rp, rn, twist] = pat.ring, ringP = D(P(rp));
    if (pat.fan && t % fanP === 0 && t > 0) aimed3(sim, e);
    if (t % ringP === ringP >> 1) { ring(sim, e.x, e.y, rn, (Math.floor(t / ringP) * twist) & 255, 3); emit(sim, { type: 'bossRing', x: px(e.x), y: px(e.y) }); }
    const arms = e.type === PROTEUS ? (L.form === 3 ? 3 : 0) : pat.spiral && sig ? pat.spiral + (rage ? 1 : 0) : 0;
    if (arms && t % L4_SPIRAL_EVERY === 0) spiral(sim, e, arms);
  }
  switch (e.type) {
    case BRONTES: return brontes(sim, e, t);
    case BRIAREUS:
      if (L.arms !== e.id) { L.arms = e.id; L.armAcc = 0; L4_ARM_DX.forEach((dx, i) => add(sim, ARM, e.x + dx * ONE, e.y + L4_ARM_DY * ONE, i, L4_ARM_HP)); emit(sim, { type: 'arms' }); }
      return;
    case CIRCE: return circe(sim, e, t);
    case TRITON: return triton(sim, e, t);
    case PROTEUS: {
      const f = proteusForm(e);
      if (f !== L.form) { L.form = f; L.formWait = L4_MORPH_WARN; L.gapNext = -1; emit(sim, { type: 'morphUp', form: f, ticks: L4_MORPH_WARN }); }
      if (L.formWait > 0) { if (--L.formWait === 0) emit(sim, { type: 'morph', form: f }); return; }
      const g = f === 3 ? Math.floor(t / L4_TRUE_TURN) % 3 : f;
      if (g === 0) brontes(sim, e, t); else if (g === 1) circe(sim, e, t); else triton(sim, e, t);
      return;
    }
    case CHARON:
      if (at(L4_FERRY_PERIOD, 0) && t > 0 && !L.ferryLeft) {
        L.ferrySide = rng.int(sim.seed, 'ferry', L.ferries++, 2); L.ferryLeft = L4_FERRY_WARN;
        emit(sim, { type: 'ferryUp', side: L.ferrySide, y: L4_FERRY_Y, ticks: L4_FERRY_WARN });
      }
      return;
    case STYX:
      if (L.styx !== e.id) { L.styx = e.id; L.riverFrom = sim.tick; L.heelAcc = 0; add(sim, HEEL, e.x, e.y, 0, KIND[HEEL].hp); emit(sim, { type: 'styxRiver' }); }
      if (rage && at(L4_RAIN_PERIOD, 60)) rain(sim);
      return;
    default:
  }
}

// ---------- geometry ----------
/** The river's middle at x (pixels), `k` ticks from now, in sub-pixels. */
export const riverY = (sim, x, k = 0) => L4_RIVER_Y * ONE + SIN[(Math.floor((x * 256) / WORLD_W) + sim.tick + k - sim.l4.riverFrom) & 255] * L4_RIVER_AMP;
function inZone(z, x, y, r) {
  if (z.k === C) return near(x, y, z.x, z.y, z.r + r);
  if (z.k === V) return Math.abs(x - z.x) <= ((z.w >> 1) + r) * ONE;
  return Math.abs(y - z.y) <= ((z.w >> 1) + r) * ONE;
}
/** Is (x, y) unsafe `k` ticks from now? Now (k = 0) means live. Ahead (k > 0) a zone counts a little before it goes off,
 *  the way a player reads a marked area (get out of it, do not wait in it until the last moment), and up to the tick it
 *  ends (the ship's k-th move is checked on the tick before tick + k). Not from the moment it is drawn: the next of
 *  Mnemosyne's stripes is drawn while the last is live, and the two together would leave nowhere to be. */
export const L4_READ_EARLY = 30;
export function danger(sim, x, y, r, k = 0) {
  const L = sim.l4, when = sim.tick + k;
  for (const z of L.zones) if (when >= (k > 0 ? Math.max(z.at, z.from - L4_READ_EARLY) : z.from) && when < z.to + (k > 0 ? 1 : 0) && inZone(z, x, y, r)) return true;
  return !!L.styx && Math.abs(y - riverY(sim, Math.floor(x / ONE), k)) <= ((L4_RIVER_W >> 1) + r) * ONE;
}
export function predict(sim, e, k) {
  switch (e.type) {
    case SCOUT: return [e.x, e.y + L4_SCOUT_VY * ONE * k];
    case BEAST: return [e.x, e.y + ONE * k];
    case REVENANT: return [e.x, e.y + L4_REV_VY * ONE * k];
    case METRONOME: case BUOY: return [e.x, e.q === 2 ? e.y + 4 * ONE * k : e.q === 0 ? Math.min(300 * ONE, e.y + 3 * ONE * k) : e.y];
    case FERRY: return [e.x + (e.q === 0 ? 2 : -4) * e.vx * ONE * k, e.y];
    case HEEL: { const a = Math.floor(((e.t + k) * 256) / L4_HEEL_TURN) & 255, b = findBoss(sim); return a < 128 && b ? [b.x + COS[a] * L4_HEEL_R, b.y + SIN[a] * L4_HEEL_R] : [e.x, -100 * ONE]; }
    default: return [e.x, e.y];
  }
}
/** Damage owed to a boss from somewhere else (an arm, the heel), kept in hundredths so small hits add up. */
function pass(sim, b, acc) {
  const L = sim.l4, n = Math.floor(acc / 100);
  if (n > 0 && b) { L.pass = 1; damage(sim, b, n); L.pass = 0; if (b.hp <= 0) kill(sim, b); }
  return acc - n * 100;
}

// ---------- hooks the engine calls ----------
export const LEG4 = Object.freeze({
  schedule, obstacles: legOneObstacles, init, before, move, boss, bossType, danger, predict,
  /** Styx's body takes nothing: aim at the heel, not at her. */
  aim() { return 0; },
  bend() {},
  blocks() { return false; },
  hazard(sim, bodyR) { return danger(sim, sim.px, sim.py, bodyR, 0); },
  /** A revenant's first fall leaves a husk; an arm passes some of its hurt to Briareus; the heel all of it, and more, to Styx. */
  scale(sim, e, dmg) {
    const L = sim.l4;
    if (e.type === REVENANT && !e.pv && e.hp - dmg <= 0) { kill(sim, e); e.type = HUSK; e.hp = KIND[HUSK].hp; e.dr = 0; e.t = 0; e.qd = 0; emit(sim, { type: 'husk', id: e.id, x: px(e.x), y: px(e.y) }); return 0; }
    if (e.type === ARM) { L.armAcc = pass(sim, sim.enemies.find(o => o.type === BRIAREUS && o.hp > 0), L.armAcc + dmg * L4_ARM_PASS); return dmg; }
    if (e.type === HEEL) { L.heelAcc = pass(sim, sim.enemies.find(o => o.type === STYX && o.hp > 0), L.heelAcc + dmg * L4_HEEL_PASS); return 0; }
    if (e.type === STYX) return L.pass ? dmg : 0;
    return dmg;
  },
  hash(sim, h) {
    const L = sim.l4;
    h.mixAll([...L.lanes, L.nextSky, L.arms, L.armAcc, L.charmId, L.charmLeft, L.gaps, L.gapNext, L.form, L.formWait, L.ferries, L.ferryLeft, L.ferrySide, L.styx, L.riverFrom, L.heelAcc, L.rains, L.zones.length]);
    for (const z of L.zones) h.mixAll([z.k, z.x, z.y, z.w, z.r, z.at, z.from, z.to]);
    for (const b of sim.bullets) if (b.c) h.mixAll([b.c]);
  },
});

export const GAME4 = Object.freeze({
  id: 'sky-talon-leg4', version: 3, maxTicks: MAX_TICKS, maxChoices: SUPPLIES,
  createSim: seed => createSim(seed, LEG4), step, phase, choose, score, stateHash, scoreBreakdown,
});
