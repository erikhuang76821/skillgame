// Leg five, "the sun and the black hole" (gdd/05 「第十五版」, design in gdd/13 §4.4). A leg of the same game: it runs on the
// engine in sim.js and supplies only what differs. sim.js never imports this file, so nothing here can change another leg.
//
// Four chapters; each brings ONE new thing, carried by a machine of its own; the rest are leg one's (same rules, same numbers):
//   1 corona        prominence skiff (prominences)       + gunner, weaver, diver     Phaethon -> Helios
//   2 photosphere   flare skiff (flares, shade pillars)  + lancer, drone, miner      Heliades -> Hyperion
//   3 black hole I  slow mothership (slow, dense)        + bulwark, seeker, weaver   Zhuyin   -> Hundun
//   4 black hole II talisman pillars (wall talismans)    + beamer, splitter, lancer  Yata     -> Yomi torii
// From chapter three on the ship is hit only inside a small radius (enemy bullets and this leg's areas); see bend().
//
// Deterministic and pure: integers only (Math.hypot only where its result is truncated), no DOM, no clock, no Math.random.

import { makeRng, ONE, SIN, COS, angleOf } from './core/index.js';
import {
  ENGINE, KIND, registerKinds, createSim, step, phase, choose, score, stateHash, scoreBreakdown,
  SCRIPT, sectionAt, UNIT_TICKS, WORLD_W, WORLD_H, LANES, LANE_X0, LANE_STEP, DROP_CHANCE, SUPPLIES, MAX_TICKS,
  BEAM_TELEGRAPH, BEAM_W, isBoss, PLAYER_MARGIN_X, PLAYER_MIN_Y, PLAYER_MAX_Y, BULLET_R, GRAZE_PTS,
  DRONE, GUNNER, DIVER, WEAVER, LANCER, MINER, SPLITTER, BULWARK, SEEKER, BEAMER, CARRIER, MINE, CARRIERS, CARRIER_VX,
  strikes, obstacles as legOneObstacles,
} from './sim.js';
import './leg6.js'; import './leg2.js'; import './leg3.js'; import './leg4.js';   // the other legs' kinds first, so this leg's kind numbers never depend on what loaded it

const { fire, ring, emit, px, near, aimed3, spiral, dropKind, add, playerR } = ENGINE;
// streams 1, 2, 6, 7, 13 mean what they mean in leg one; 32 and up are this leg's (gdd/05 v15 §6)
const rng = makeRng({ lane: 1, order: 2, drop: 6, dropKind: 7, event: 13, prom: 32, stripe: 33, gate: 34, sway: 35, rain: 36 });
/** What a bullet looks like (the picture only): solar fire, a slow bullet of the black hole, a talisman, a petal. */
export const SOLAR = 30, SLOWB = 31, TALIS = 32, PETAL = 33;

// ---------- kinds ----------
const FIRST = registerKinds([
  { name: 'promskiff', hp: 5, r: 28, pts: 45 },
  { name: 'flareskiff', hp: 8, r: 28, pts: 50 },
  { name: 'slowship', hp: 8, r: 34, pts: 60 },
  { name: 'talisman', hp: 6, r: 26, pts: 40 },
  { name: 'phaethon', hp: 100, r: 58, pts: 500, mid: 1 },
  { name: 'heliades', hp: 170, r: 62, pts: 750, mid: 1 },
  { name: 'zhuyin', hp: 190, r: 66, pts: 1250, mid: 1 },
  { name: 'yata', hp: 260, r: 70, pts: 2000, mid: 1 },
  { name: 'helios', hp: 360, r: 96, pts: 1000, boss: 1, armour: [84, 168, -60, 200] },
  { name: 'hyperion', hp: 420, r: 102, pts: 1500, boss: 1, armour: [86, 176, -90, 230] },
  { name: 'hundun', hp: 450, r: 106, pts: 2500, boss: 1, armour: [90, 182, -100, 160] },
  { name: 'torii', hp: 600, r: 110, pts: 4000, boss: 1, armour: [96, 186, -80, 150] },
]);
export const PROMSKIFF = FIRST, FLARESKIFF = FIRST + 1, SLOWSHIP = FIRST + 2, TALISMAN = FIRST + 3;
export const L5_MIDS = Object.freeze([FIRST + 4, FIRST + 5, FIRST + 6, FIRST + 7]);
export const L5_BOSSES = Object.freeze([FIRST + 8, FIRST + 9, FIRST + 10, FIRST + 11]);
export const [PHAETHON, HELIADES, ZHUYIN, YATA] = L5_MIDS;
export const [HELIOS, HYPERION, HUNDUN, TORII] = L5_BOSSES;
const bossType = slot => (slot % 2 === 0 ? L5_MIDS : L5_BOSSES)[slot >> 1];

// ---------- numbers (gdd/05 v15 §3, §4; all starting values) ----------
export const L5_HP_ADD = Object.freeze([1, 2, 2, 2]);
export const L5_ROSTER = Object.freeze([[PROMSKIFF, GUNNER, WEAVER, DIVER], [FLARESKIFF, LANCER, DRONE, MINER], [SLOWSHIP, BULWARK, SEEKER, WEAVER], [TALISMAN, BEAMER, SPLITTER, LANCER]]);
const HEAVY = new Set([BULWARK, BEAMER]);
const SWARM = new Set([DRONE, DIVER, SEEKER]);
const MORE = Object.freeze([5, 4, 4, 5]);   // v3: chapters one to three +1 (the opening supply gives the wingman)

export const L5_SMALL_R = 4;                                  // the ship's hit radius in the black hole (chapters three and four)
export const L5_PROM_R = 320, L5_PROM_W = 36, L5_PROM_OUT = 120, L5_PROM_WARN = 87, L5_PROM_LIVE = 81, L5_PROM_HOLD = 360;
export const L5_FLARE_WARN = 120, L5_FLARE_LIVE = 1, L5_SHADE_X = Object.freeze([150, 360, 570]), L5_SHADE_W = 110, L5_FLARE_HOLD = 300;
export const L5_SLOW_PERIOD = 160, L5_SLOW_N = 16, L5_SLOW_HALF = 3;   // a ring of 16 at 1.5 px a tick (speeds in half pixels)
export const L5_TALIS_PERIOD = 60, L5_TALIS_SPEED = 2, L5_TALIS_X = Object.freeze([40, 680]);
export const L5_PATTERNS = Object.freeze({
  phaethon: { fan: 75, ring: [140, 12, 11] }, heliades: { fan: 70, ring: [130, 12, 9] }, zhuyin: { fan: 70, ring: [130, 12, 13] }, yata: { fan: 65, ring: [120, 14, 9] },
  helios: { fan: 65, ring: [120, 14, 9] }, hyperion: { fan: 60, ring: [110, 16, 11] }, hundun: { fan: 60, ring: null }, torii: { fan: 55, ring: null },
});
export const L5_SPIRAL_EVERY = 8;
export const L5_PHAETHON_AMP = 200, L5_PHAETHON_DROP = 12, L5_PHAETHON_PROM = 300;
export const L5_HELIOS_PROM = 360, L5_CONE_PERIOD = 300, L5_CONE_HALF = 21, L5_CONE_WARN = 60, L5_CONE_REACH = 480, L5_CONE_FROM = 21, L5_CONE_TO = 107;
export const L5_HELIADES_FAN = 60, L5_HELIADES_FLARE = 420;
export const L5_STRIPE_PERIOD = 420, L5_STRIPE_WARN = 36, L5_STRIPE_LIVE = 10, L5_STRIPE_W = 120;
export const L5_DAY_ARC = 110, L5_NIGHT_PERIOD = 300, L5_NIGHT_WARN = 45, L5_STOP = 45;
export const L5_EYES = 8, L5_EYE_TURN = 1200, L5_EYE_RX = 330, L5_EYE_RY = 600, L5_EYE_CY = 640, L5_EYE_PERIOD = 130, L5_EYE_SHOTS = 3, L5_EYE_STEP = 7;
export const L5_THREAD_PERIOD = 240, L5_THREAD_WARN = 66, L5_THREAD_LIVE = 30, L5_THREAD_W = 16, L5_THREAD_DROP = 400;
export const L5_GATE_X = Object.freeze([135, 285, 435, 585]), L5_GATE_Y = 120, L5_PETAL_EVERY = 24, L5_PETAL_SPEED = 2;
export const L5_RAIN_PERIOD = 300, L5_RAIN_R = 60, L5_RAIN_WARN = 54, L5_RAIN_LIVE = 8, L5_RAIN_LATER = 30, L5_RAIN_SLIDE = 30;
export const L5_RAIN_ROWS = Object.freeze([[620, [160, 360, 560]], [810, [60, 260, 460, 660]], [1000, [160, 360, 560]]]);
export const L5_READ_EARLY = 30;
const C = 1, B = 2, A = 3, F = 4, K = 5;                     // zone kinds: circle, band (a stripe or a thread), arc (a prominence), flare, cone

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
    out.push({ at, type, lane, x, hp: KIND[type].hp + (SWARM.has(type) ? 0 : L5_HP_ADD[chapterOf(k)]), sh: 0, drop, ...extra });
  };
  const one = (t0, type, idx) => {
    const lane = rng.int(seed, 'lane', 9000 + idx, LANES), x = laneX(lane);
    switch (type) {
      case DRONE: { const x0 = Math.min(WORLD_W - 200, Math.max(200, x)); for (let j = -2; j <= 2; j++) push(t0 + Math.abs(j) * 14, DRONE, lane, x0 + j * 56); return; }
      case DIVER: case SEEKER: push(t0, type, lane, x); push(t0 + 30, type, (lane + 3) % LANES, laneX((lane + 3) % LANES)); return;
      case TALISMAN: for (const tx of L5_TALIS_X) push(t0, TALISMAN, lane, tx); return;
      default: return push(t0, type, lane, x);
    }
  };
  SCRIPT.forEach((sec, k) => {
    if (sec.boss || sec.boost || sec.event) return;
    const ch = sec.chapter, [a, b, c, d] = L5_ROSTER[ch], climax = isClimax(k);
    const old = L5_ROSTER.slice(0, ch).flat().filter(t => !HEAVY.has(t) && t !== FLARESKIFF);
    for (let u = sec.from; u < sectionEnd(k); u++) {
      const t0 = u * UNIT_TICKS, i = u - sec.from, idx = u * 16;
      const spare = n => { if (old.length) one(t0 + 100 + n * 60, old[(u + n) % old.length], idx + 12 + n); };
      if (sec.safe || (ch === 0 && sec.name === SCRIPT[1].name)) {      // 起: the new machine alone, then a shooter alone, then more
        if (i === 0) one(t0 + 20, a, idx);
        else if (i === 1) one(t0 + 20, c, idx);
        else { one(t0 + 10, a, idx); one(t0 + 110, c, idx + 1); if (i >= 2) one(t0 + 60, d, idx + 3); if (i >= 3) { one(t0 + 170, b, idx + 2); spare(0); } }
        continue;
      }
      const n = Math.min(1 + MORE[ch] + (climax ? (ch === 0 ? 1 : 2) : 0) + (i >> 1), ch === 3 ? 10 : climax ? 9 : 8), mix = [a, c, b, d, a, c, d, b, b, d, a, c];
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
  sim.l5 = {
    sky: strikes(sim.seed), nextSky: 0,
    zones: [],                                                // { k, x, y, a, w, r, owner, at (drawn), from, to (live) } (kinds above)
    proms: 0, flareBy: 0,                                     // prominences laid; the machine whose flare is counting down (0 none)
    stripes: 0, rains: 0,                                     // Hyperion's sets laid; rain patterns laid
    night: 0, stop: 0, sx: 0, sy: 0,                          // Zhuyin: ticks to the stop (announced); ticks of the stop left; where the ship was when it began
    hundun: 0, gate: 0, volleys: 0,                           // Hundun: set up (his id); the first life gate; volleys fired
    torii: 0,                                                 // Yomi torii: set up (her id)
    fake: 0,                                                  // the small hit circle: the ship's invulnerability was lent for one bullet
  };
}
const clampX = x => Math.min((WORLD_W - PLAYER_MARGIN_X) * ONE, Math.max(PLAYER_MARGIN_X * ONE, x));
const findBoss = sim => sim.enemies.find(e => e.hp > 0 && isBoss(e.type));
const tag = (sim, c) => { sim.bullets[sim.bullets.length - 1].c = c; };
/** The black hole: chapters three and four (small hit circle, slow and dense bullets). */
export const inHole = sim => sim.chapter >= 2;
/** A bullet at `half` half-pixels a tick (1.5 px = 3). */
const slow = (sim, x, y, a, half, c) => { a &= 255; sim.bullets.push({ x, y, vx: (COS[a] * half) >> 1, vy: (SIN[a] * half) >> 1, grazed: 0, c }); };
function zone(sim, k, f) {
  const z = { k, x: 0, y: 0, a: 0, w: 0, r: 0, owner: 0, ...f, at: sim.tick };
  sim.l5.zones.push(z);
  emit(sim, { type: 'zoneUp', k, x: px(z.x), y: px(z.y), a: z.a, w: z.w, r: z.r, ticks: z.from - sim.tick, live: z.to - z.from });
  return z;
}
/** A prominence: an arc of fire curling in from one side of the screen, around a centre just outside it. */
function prominence(sim, left, y) {
  const cy = Math.min(1000, Math.max(500, Math.floor(y / ONE)));
  zone(sim, A, { x: (left ? -L5_PROM_OUT : WORLD_W + L5_PROM_OUT) * ONE, y: cy * ONE, r: L5_PROM_R, w: L5_PROM_W, from: sim.tick + L5_PROM_WARN, to: sim.tick + L5_PROM_WARN + L5_PROM_LIVE });
}
/** A flare, counted down: anywhere in the room to fly but under a shade pillar is hit once, on its tick. */
function flare(sim, owner) {
  if (sim.l5.flareBy) return;
  sim.l5.flareBy = owner;
  zone(sim, F, { owner, from: sim.tick + L5_FLARE_WARN, to: sim.tick + L5_FLARE_WARN + L5_FLARE_LIVE });
  emit(sim, { type: 'flareUp', ticks: L5_FLARE_WARN, shade: L5_SHADE_X, w: L5_SHADE_W });
}

function before(sim, now) {
  const L = sim.l5;
  if (L.fake) { L.fake = 0; if (sim.invuln === 1) sim.invuln = 0; }
  while (L.nextSky < L.sky.length && L.sky[L.nextSky].at <= now) {   // the solar storm, leg one's lightning
    const k = L.sky[L.nextSky++];
    sim.strikes.push({ x: k.x * ONE, pw: BEAM_TELEGRAPH, bt: 0 });
    emit(sim, { type: 'strikeUp', x: k.x, w: BEAM_W, ticks: BEAM_TELEGRAPH });
  }
  for (let i = L.zones.length - 1; i >= 0; i--) if (L.zones[i].to <= sim.tick) L.zones.splice(i, 1);
  // a flare whose machine is gone before it goes off is called off
  if (L.flareBy && !sim.enemies.some(e => e.id === L.flareBy && e.hp > 0)) {
    for (let i = L.zones.length - 1; i >= 0; i--) if (L.zones[i].owner === L.flareBy && L.zones[i].from > sim.tick) { L.zones.splice(i, 1); emit(sim, { type: 'flareOff' }); }
    L.flareBy = 0;
  }
  if (L.flareBy && !L.zones.some(z => z.owner === L.flareBy)) L.flareBy = 0;
  // Zhuyin's night: when it falls, every bullet stops and is shown where it will go (at where the ship is now)
  if (L.night > 0 && --L.night === 0) { L.stop = L5_STOP; L.sx = sim.px; L.sy = sim.py; emit(sim, { type: 'timeStop', ticks: L5_STOP, x: px(sim.px), y: px(sim.py) }); }
  if (L.stop > 0) {
    for (const b of sim.bullets) if (b.nvx === undefined) {
      const a = angleOf(L.sx - b.x, L.sy - b.y), sp = Math.max(1, Math.trunc(Math.hypot(b.vx, b.vy) / ONE / 2));
      b.nvx = COS[a] * sp; b.nvy = SIN[a] * sp; b.vx = 0; b.vy = 0;
    }
    if (--L.stop === 0) { for (const b of sim.bullets) if (b.nvx !== undefined) { b.vx = b.nvx; b.vy = b.nvy; delete b.nvx; delete b.nvy; } emit(sim, { type: 'timeGo' }); }
  }
  // the small hit circle: the bullet farthest from the ship is looked at last (see bend)
  if (inHole(sim) && sim.bullets.length > 1) {
    let far = 0, fd = -1;
    sim.bullets.forEach((b, i) => { const dx = (b.x - sim.px) / ONE, dy = (b.y - sim.py) / ONE, d = dx * dx + dy * dy; if (d > fd) { fd = d; far = i; } });
    if (far) { const t = sim.bullets[0]; sim.bullets[0] = sim.bullets[far]; sim.bullets[far] = t; }
  }
  const b = findBoss(sim);
  if (!b || b.type !== HUNDUN) L.hundun = 0;
  if (!b || b.type !== TORII) L.torii = 0;
  if (!b || b.type !== ZHUYIN) { L.night = 0; if (L.stop) { L.stop = 0; for (const x of sim.bullets) if (x.nvx !== undefined) { x.vx = x.nvx; x.vy = x.nvy; delete x.nvx; delete x.nvy; } } }
}

// ---------- machines ----------
function hold(sim, e, stopY, holdTicks, act) {                // q 0 coming down, 1 holding and acting, 2 leaving
  if (e.q === 0) { const stop = stopY * ONE; e.y = Math.min(stop, e.y + 3 * ONE); if (e.y === stop) { e.q = 1; e.qd = 0; } }
  else if (e.q === 1) { act(++e.qd); if (e.qd >= holdTicks) e.q = 2; }
  else e.y += 4 * ONE;
}
function move(sim, e) {
  const L = sim.l5;
  switch (e.type) {
    case PROMSKIFF: return hold(sim, e, 180 + ((e.id * 37) % 81), L5_PROM_HOLD, d => {
      if (d === 60) prominence(sim, rng.int(sim.seed, 'prom', L.proms++, 2) === 0, sim.py);
      if (d % 90 === 45) { fire(sim, e.x, e.y, angleOf(sim.px - e.x, sim.py - e.y), 4); tag(sim, SOLAR); }
    });
    case FLARESKIFF: return hold(sim, e, 200, L5_FLARE_HOLD, d => { if (d === 30) flare(sim, e.id); });
    case SLOWSHIP:
      e.y += ONE;
      if (e.t % L5_SLOW_PERIOD === L5_SLOW_PERIOD - 20) emit(sim, { type: 'flash', id: e.id, ticks: 20 });
      if (e.t % L5_SLOW_PERIOD === 0 && e.y > 0) for (let k = 0; k < L5_SLOW_N; k++) slow(sim, e.x, e.y, Math.floor((k * 256) / L5_SLOW_N) + (e.t >> 4), L5_SLOW_HALF, SLOWB);
      return;
    case TALISMAN: {
      e.y += ONE;
      const left = e.x < (WORLD_W / 2) * ONE, ph = left ? 0 : L5_TALIS_PERIOD >> 1;
      if ((e.t + ph) % L5_TALIS_PERIOD === L5_TALIS_PERIOD - 20) emit(sim, { type: 'flash', id: e.id, ticks: 20 });
      if ((e.t + ph) % L5_TALIS_PERIOD === 0 && e.y > 0) { fire(sim, e.x, e.y, left ? 0 : 128, L5_TALIS_SPEED); tag(sim, TALIS); }
      return;
    }
    default: e.y += 4 * ONE;
  }
}

// ---------- mid-bosses and bosses ----------
/** Hyperion's stripes: the third grade (gdd/13 §10): across, aslant, down, one set after the other. */
export function stripeSet(seed, n, s) {
  const a = [0, 32, 64][s], off = rng.int(seed, 'stripe', 3 * n + s, 2 * L5_STRIPE_W);
  return { a, off };
}
function stripes(sim, n, s) {
  const { a, off } = stripeSet(sim.seed, n, s), from = sim.tick + L5_STRIPE_WARN;
  // bands every 240 along the normal (-sin a, cos a) of the direction `a`, from a corner of the room to fly: across from its
  // top left, aslant and down from its top right (so the normal points into the room)
  const ox = a === 0 ? 0 : WORLD_W, oy = PLAYER_MIN_Y, nx = -SIN[a], ny = COS[a];
  for (let k = 0; k < 6; k++) {
    const d = off + L5_STRIPE_W / 2 + k * 2 * L5_STRIPE_W;
    zone(sim, B, { x: ox * ONE + nx * d, y: oy * ONE + ny * d, a, w: L5_STRIPE_W, from, to: from + L5_STRIPE_LIVE });
  }
}
function rain(sim) {                                          // the torii's core: the rings of circles (gdd/13 §10, third grade: the petals keep falling)
  const L = sim.l5, slide = rng.int(sim.seed, 'rain', L.rains++, 2 * L5_RAIN_SLIDE + 1) - L5_RAIN_SLIDE;
  L5_RAIN_ROWS.forEach(([y, xs], row) => { for (const x0 of xs) { const warn = L5_RAIN_WARN + (row >= 2 ? L5_RAIN_LATER : 0); zone(sim, C, { x: (x0 + (row % 2 === 0 ? slide : 0)) * ONE, y: y * ONE, r: L5_RAIN_R, from: sim.tick + warn, to: sim.tick + warn + L5_RAIN_LIVE }); } });
}
/** Hundun's eyes on their ellipse round the screen at tick `t` of the fight: [x, y] in sub-pixels. */
export const eyeAt = (t, i) => { const a = (Math.floor((t * 256) / L5_EYE_TURN) + i * (256 / L5_EYES)) & 255; return [(WORLD_W / 2) * ONE + COS[a] * L5_EYE_RX, L5_EYE_CY * ONE + SIN[a] * L5_EYE_RY]; };
/** The life gate of volley `v`: the first is the seed's, then one eye on, clockwise. */
export const gateOf = (L, v) => (L.gate + v) % L5_EYES;

function boss(sim, e, t, { sig, rage, P, D }) {
  const L = sim.l5, at = (period, ph) => t % period === ph, hole = inHole(sim);
  const pat = L5_PATTERNS[KIND[e.type].name];
  const quiet = e.type === HYPERION && t % L5_STRIPE_PERIOD < 3 * L5_STRIPE_WARN + L5_STRIPE_LIVE + 10;
  if (pat && !quiet) {
    const fanP = D(P(pat.fan));
    if (t % fanP === 0 && t > 0) aimed3(sim, e);
    if (pat.ring) {
      const [rp, rn, twist] = pat.ring, ringP = D(P(rp));
      if (t % ringP === ringP >> 1) {
        const off = (Math.floor(t / ringP) * twist) & 255;
        if (!hole) ring(sim, e.x, e.y, rn, off, 3);
        else if (Math.floor(t / ringP) % 2 === 0) for (let k = 0; k < 2 * rn; k++) slow(sim, e.x, e.y, off + Math.floor((k * 256) / (2 * rn)), 3, SLOWB);   // the black hole: every other ring, twice as many, half as fast
        emit(sim, { type: 'bossRing', x: px(e.x), y: px(e.y) });
      }
    }
    if (pat.spiral && sig && t % L5_SPIRAL_EVERY === 0) spiral(sim, e, pat.spiral + (rage ? 1 : 0));
  }
  switch (e.type) {
    case PHAETHON:                                            // a wide sway, fire straight down, now and then a prominence
      e.x = e.ax + SIN[t & 255] * L5_PHAETHON_AMP;
      if (at(L5_PHAETHON_DROP, 0)) { fire(sim, e.x, e.y, 64, 4); tag(sim, SOLAR); }
      if (at(L5_PHAETHON_PROM, 150)) prominence(sim, rng.int(sim.seed, 'prom', L.proms++, 2) === 0, sim.py);
      return;
    case HELIOS:                                              // a prominence from each side at once; as a core, a turning cone
      if (at(L5_HELIOS_PROM, 120)) { prominence(sim, true, sim.py); prominence(sim, false, sim.py); }
      if (rage && at(L5_CONE_PERIOD, 60)) zone(sim, K, { x: e.x, y: e.y, a: L5_CONE_FROM, w: L5_CONE_HALF, r: L5_CONE_REACH, from: sim.tick + L5_CONE_WARN, to: sim.tick + L5_CONE_WARN + (L5_CONE_TO - L5_CONE_FROM) });
      return;
    case HELIADES:
      if (at(L5_HELIADES_FAN, 30)) { const a = angleOf(sim.px - e.x, sim.py - e.y); for (let k = -1; k <= 1; k++) { fire(sim, e.x, e.y, a + k * 10, 4); tag(sim, SOLAR); } }
      if (at(L5_HELIADES_FLARE, 200)) flare(sim, e.id);
      return;
    case HYPERION: {
      const c = t % L5_STRIPE_PERIOD, n = Math.floor(t / L5_STRIPE_PERIOD);
      for (let s = 0; s < 3; s++) if (c === s * L5_STRIPE_WARN) stripes(sim, n, s);
      if (c === 0) emit(sim, { type: 'stripesUp' });
      return;
    }
    case ZHUYIN:                                              // by day, wide arcs; by night, everything stops and turns
      if (at(L5_DAY_ARC, 40) && !L.stop) { const a = angleOf(sim.px - e.x, sim.py - e.y); for (let k = -2; k <= 2; k++) slow(sim, e.x, e.y, a + k * 18, 4, SLOWB); }
      if (at(L5_NIGHT_PERIOD, 0) && t > 0 && !L.night && !L.stop) { L.night = L5_NIGHT_WARN; emit(sim, { type: 'nightUp', ticks: L5_NIGHT_WARN }); }
      return;
    case HUNDUN:                                              // eight eyes round the screen; seven fire at its middle, the life gate does not
      if (L.hundun !== e.id) { L.hundun = e.id; L.gate = rng.int(sim.seed, 'gate', 0, L5_EYES); L.volleys = 0; emit(sim, { type: 'eyes' }); }
      if (at(L5_EYE_PERIOD, 45)) {
        const g = gateOf(L, L.volleys++);
        for (let i = 0; i < L5_EYES; i++) {
          if (i === g) continue;
          const [x, y] = eyeAt(t, i), a = angleOf((WORLD_W / 2) * ONE - x, L5_EYE_CY * ONE - y);
          for (let k = 0; k < L5_EYE_SHOTS; k++) slow(sim, x, y, a + (k - 1) * L5_EYE_STEP, 3, SLOWB);
        }
        emit(sim, { type: 'eyeVolley', gate: gateOf(L, L.volleys) });
      }
      return;
    case YATA: {                                              // two threads crossing below it, and a talisman from each wall
      if (at(L5_THREAD_PERIOD, 100)) for (const a of [32, 96]) zone(sim, B, { x: e.x, y: e.y + L5_THREAD_DROP * ONE, a, w: L5_THREAD_W, from: sim.tick + L5_THREAD_WARN, to: sim.tick + L5_THREAD_WARN + L5_THREAD_LIVE });
      for (const [i, tx] of L5_TALIS_X.entries()) if ((t + i * 30) % L5_TALIS_PERIOD === 0 && t > 0) { fire(sim, tx * ONE, sim.py, i ? 128 : 0, L5_TALIS_SPEED); tag(sim, TALIS); }
      return;
    }
    case TORII:                                               // petals from four gates, each gate its own sway
      if (L.torii !== e.id) { L.torii = e.id; emit(sim, { type: 'gates' }); }
      L5_GATE_X.forEach((gx, i) => {
        if ((t + i * 3) % L5_PETAL_EVERY !== 0) return;
        const amp = 40 + rng.int(sim.seed, 'sway', 2 * i, 51), ph = rng.int(sim.seed, 'sway', 2 * i + 1, 256);
        sim.bullets.push({ x: gx * ONE, y: L5_GATE_Y * ONE, vx: 0, vy: L5_PETAL_SPEED * ONE, grazed: 0, c: PETAL, x0: gx * ONE, pa: amp, pp: ph, pt: 0 });
      });
      if (rage && at(L5_RAIN_PERIOD, 60)) rain(sim);
      return;
    default:
  }
}

// ---------- geometry ----------
const shaded = (x, r) => L5_SHADE_X.some(s => Math.abs(x - s * ONE) + r * ONE <= (L5_SHADE_W >> 1) * ONE);
function inZone(z, x, y, r, when) {
  switch (z.k) {
    case C: return near(x, y, z.x, z.y, z.r + r);
    case B: { const d = ((x - z.x) * -SIN[z.a & 255] + (y - z.y) * COS[z.a & 255]) / ONE; return Math.abs(d) <= ((z.w >> 1) + r) * ONE; }
    case A: { const d = Math.hypot((x - z.x) / ONE, (y - z.y) / ONE); return Math.abs(d - z.r) <= (z.w >> 1) + r; }
    case F: return y >= PLAYER_MIN_Y * ONE && !shaded(x, r);
    case K: {
      const dx = x - z.x, dy = y - z.y;
      if (dx * dx + dy * dy > ((z.r + r) * ONE) ** 2) return false;
      const a = (z.a + Math.max(0, when - z.from)) & 255;
      return Math.abs(((angleOf(dx, dy) - a + 128) & 255) - 128) <= z.w;
    }
    default: return false;
  }
}
/** Is (x, y) unsafe `k` ticks from now? Now (k = 0) means live. Ahead (k > 0) a zone counts a little before it goes off and
 *  up to the tick it ends, the way a player reads a marked area (leg four's rule, gdd/07 §17.2). */
export function danger(sim, x, y, r, k = 0) {
  const when = sim.tick + k;
  for (const z of sim.l5.zones) if (when >= (k > 0 ? Math.max(z.at, z.from - L5_READ_EARLY) : z.from) && when < z.to + (k > 0 ? 1 : 0) && inZone(z, x, y, r, when)) return true;
  return false;
}
export function predict(sim, e, k) {
  switch (e.type) {
    case SLOWSHIP: case TALISMAN: return [e.x, e.y + ONE * k];
    case PROMSKIFF: case FLARESKIFF: return [e.x, e.q === 2 ? e.y + 4 * ONE * k : e.q === 0 ? Math.min(260 * ONE, e.y + 3 * ONE * k) : e.y];
    default: return [e.x, e.y];
  }
}

// ---------- hooks the engine calls ----------
export const LEG5 = Object.freeze({
  schedule, obstacles: legOneObstacles, init, before, move, boss, bossType, danger, predict,
  aim() { return 0; },
  /** A petal sways on its gate's sine. In the black hole a bullet about to land inside the usual hit circle but outside
   *  the small one does not hit: the ship's invulnerability is lent for that one bullet (and given back at the next), and
   *  the graze is counted here, since the engine skips it while the ship cannot be hit. */
  bend(sim, b, isShot) {
    if (isShot) return;
    const L = sim.l5;
    if (L.fake) { L.fake = 0; if (sim.invuln === 1) sim.invuln = 0; }
    if (b.pa) { b.pt++; b.vx = b.x0 + Math.trunc((SIN[(b.pp + b.pt * 2) & 255] * b.pa)) - b.x; }
    if (!inHole(sim) || sim.invuln !== 0) return;
    const nx = b.x + b.vx, ny = b.y + b.vy;
    if (near(nx, ny, sim.px, sim.py, playerR(sim) + BULLET_R) && !near(nx, ny, sim.px, sim.py, L5_SMALL_R + BULLET_R)) {
      sim.invuln = 1; L.fake = 1;
      if (!b.grazed) { b.grazed = 1; sim.grazes++; sim.score += GRAZE_PTS; sim.grazePts += GRAZE_PTS; emit(sim, { type: 'graze', x: px(nx), y: px(ny) }); }
    }
  },
  blocks() { return false; },
  hazard(sim, bodyR) { return danger(sim, sim.px, sim.py, inHole(sim) ? Math.min(bodyR, L5_SMALL_R) : bodyR, 0); },
  scale(sim, e, dmg) { return dmg; },
  hash(sim, h) {
    const L = sim.l5;
    h.mixAll([L.nextSky, L.proms, L.flareBy, L.stripes, L.rains, L.night, L.stop, L.sx, L.sy, L.hundun, L.gate, L.volleys, L.torii, L.fake, L.zones.length]);
    for (const z of L.zones) h.mixAll([z.k, z.x, z.y, z.a, z.w, z.r, z.owner, z.at, z.from, z.to]);
    for (const b of sim.bullets) if (b.c || b.pa || b.nvx !== undefined) h.mixAll([b.c | 0, b.x0 | 0, b.pa | 0, b.pp | 0, b.pt | 0, b.nvx | 0, b.nvy | 0]);
  },
});

export const GAME5 = Object.freeze({
  id: 'sky-talon-leg5', version: 3, maxTicks: MAX_TICKS, maxChoices: SUPPLIES,
  createSim: seed => createSim(seed, LEG5), step, phase, choose, score, stateHash, scoreBreakdown,
});
