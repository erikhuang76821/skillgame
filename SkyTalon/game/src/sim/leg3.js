// Leg three, "the outer giants" (gdd/05 「第十三版」, design in gdd/13 §4.2). A leg of the same game: it runs on the
// engine in sim.js and supplies only what differs. sim.js never imports this file, so nothing here can change another leg.
//
// Four chapters; each brings ONE new machine of its own, the rest are leg one's (same rules, same numbers):
//   1 Mars    siege mortar  + gunner, weaver, drone       convoy (leg one's)        Phobos & Deimos -> Enyo
//   2 Jupiter aegis guard   + lancer, diver, miner        storm                     Ganymede        -> Amalthea
//   3 Titan   crystal       + bulwark, seeker, weaver     gorge (as an icy ridge)   Pandora         -> Prometheus
//   4 Saturn  chrono echo   + beamer, splitter, lancer    shower (as ring ice)      Epimetheus      -> Janus
// The leg keeps the ship's last 64 positions (the echo, Epimetheus and Janus aim at where it was, or will be).
//
// Deterministic and pure: integers only, no DOM, no clock, no Math.random. Positions are sub-pixels (ONE per px).

import { makeRng, ONE, SIN, COS, angleOf } from './core/index.js';
import {
  ENGINE, KIND, registerKinds, createSim, step, phase, choose, score, stateHash, scoreBreakdown,
  SCRIPT, sectionAt, UNIT_TICKS, WORLD_W, WORLD_H, LANES, LANE_X0, LANE_STEP, DROP_CHANCE, SUPPLIES, MAX_TICKS,
  BEAM_TELEGRAPH, BEAM_W, isBoss, SHOT_R, PLAYER_MARGIN_X, PLAYER_MIN_Y, PLAYER_MAX_Y, CHARGE_HOLD, CHARGE_PERIOD, PEAK, OBST_HP, REPAIR,
  DRONE, GUNNER, DIVER, WEAVER, LANCER, MINER, SPLITTER, BULWARK, SEEKER, BEAMER, CARRIER, MINE, CARRIERS, CARRIER_VX,
  strikes, obstacles as legOneObstacles,
} from './sim.js';

const { fire, ring, emit, px, near, aimed3, spiral, chargeUp, dropKind, add, damage, kill } = ENGINE;
// streams 1, 2, 6, 7, 13 mean what they mean in leg one; 25 and up are this leg's (gdd/05 v13 §6)
const rng = makeRng({ lane: 1, order: 2, drop: 6, dropKind: 7, event: 13, boulder: 25, rain: 26, eagle: 27 });
/** What a bullet looks like (the picture only): fire from Mars, Jupiter's gold, the crystals' shards, an echo's shot, a bouncing ball. */
export const EMBER = 21, NECTAR = 22, SHARD3 = 23, ECHOSHOT = 24, BALL = 25;

// ---------- kinds ----------
const FIRST = registerKinds([
  { name: 'mortar', hp: 4, r: 26, pts: 40 },
  { name: 'aegis', hp: 6, r: 30, pts: 45 },
  { name: 'crystal', hp: 3, r: 22, pts: 30 },
  { name: 'echo', hp: 3, r: 22, pts: 35 },
  { name: 'deimos', hp: 60, r: 44, pts: 300 },                 // Phobos's twin chariot (not a boss)
  { name: 'anchor', hp: 40, r: 34, pts: 200 },                 // Prometheus's chains
  { name: 'eagle', hp: 40, r: 30, pts: 250 },
  { name: 'phobos', hp: 100, r: 58, pts: 500, mid: 1 },
  { name: 'ganymede', hp: 170, r: 62, pts: 750, mid: 1 },
  { name: 'pandora', hp: 190, r: 66, pts: 1250, mid: 1 },
  { name: 'epimetheus', hp: 260, r: 70, pts: 2000, mid: 1 },
  { name: 'enyo', hp: 280, r: 96, pts: 1000, boss: 1, armour: [82, 168, -60, 280] },
  { name: 'amalthea', hp: 360, r: 102, pts: 1500, boss: 1, armour: [86, 176, -90, 230] },
  { name: 'prometheus', hp: 400, r: 106, pts: 2500, boss: 1, armour: [90, 182, -100, 160] },
  { name: 'janus', hp: 1150, r: 114, pts: 4000, boss: 1, armour: [120, 190, -60, 150] },
]);
export const MORTAR = FIRST, AEGIS = FIRST + 1, CRYSTAL = FIRST + 2, ECHO = FIRST + 3, DEIMOS = FIRST + 4, ANCHOR = FIRST + 5, EAGLE = FIRST + 6;
export const L3_MIDS = Object.freeze([FIRST + 7, FIRST + 8, FIRST + 9, FIRST + 10]);
export const L3_BOSSES = Object.freeze([FIRST + 11, FIRST + 12, FIRST + 13, FIRST + 14]);
export const [PHOBOS, GANYMEDE, PANDORA, EPIMETHEUS] = L3_MIDS;
export const [ENYO, AMALTHEA, PROMETHEUS, JANUS] = L3_BOSSES;
const bossType = slot => (slot % 2 === 0 ? L3_MIDS : L3_BOSSES)[slot >> 1];

// ---------- numbers (gdd/05 v13 §3, §4; all starting values) ----------
export const L3_HP_ADD = Object.freeze([1, 1, 2, 7]);   // v3: chapters three and four +1, so four still climbs above three
export const L3_ROSTER = Object.freeze([[MORTAR, GUNNER, WEAVER, DRONE], [AEGIS, LANCER, DIVER, MINER], [CRYSTAL, BULWARK, SEEKER, WEAVER], [ECHO, BEAMER, SPLITTER, LANCER]]);
const HEAVY = new Set([AEGIS, BULWARK, BEAMER]);
const SWARM = new Set([DRONE, DIVER, SEEKER, CRYSTAL]);
const MORE = Object.freeze([4, 3, 3, 6]);   // v3: chapters two and three +1 (the opening supply gives the wingman)

export const L3_HIST = 64;                                    // ship positions kept (a ring, one a tick)
export const L3_MORTAR_PERIOD = 120, L3_MORTAR_R = 56, L3_MORTAR_WARN = 54, L3_MORTAR_LIVE = 8, L3_MORTAR_MAX = 2, L3_MORTAR_HOLD = 360;
export const L3_AEGIS_HALF = 18, L3_AEGIS_FIRE = 70;
export const L3_CRYSTAL_VY = 3, L3_CRYSTAL_SPEED = 3;
export const L3_ECHO_LAG = 48, L3_ECHO_PERIOD = 60, L3_ECHO_HOLD = 300, L3_ECHO_SPEED = 5;
export const L3_PATTERNS = Object.freeze({
  phobos: { fan: 80, ring: [130, 10, 11] }, ganymede: { fan: 75, ring: [125, 12, 9] }, pandora: { fan: 70, ring: [115, 12, 13] }, epimetheus: { fan: 70, ring: [110, 12, 9] },
  enyo: { fan: 70, ring: [110, 14, 9] }, amalthea: { fan: 65, ring: [105, 14, 11], spiral: 2 }, prometheus: { fan: 65, ring: [100, 14, 13], spiral: 2 }, janus: { fan: 60, ring: [95, 16, 11], spiral: 2 },
});
export const L3_SPIRAL_EVERY = 8;
export const L3_TWIN_GAP = 220, L3_TWIN_FAN = 60, L3_RAGE_WARN = 60, L3_POLE_HALF = 14;
export const L3_COVER_X = Object.freeze([150, 290, 430, 570]), L3_COVER_Y = 900;
export const L3_BOULDER_PERIOD = 240, L3_BOULDER_WARN = 66, L3_BOULDER_R = 70, L3_BOULDER_RING = 12;
export const L3_RAIN_PERIOD = 300, L3_RAIN_R = 60, L3_RAIN_WARN = 54, L3_RAIN_LIVE = 8, L3_RAIN_LATER = 30, L3_RAIN_SLIDE = 30;
export const L3_RAIN_ROWS = Object.freeze([[500, [160, 360, 560]], [690, [60, 260, 460, 660]], [880, [160, 360, 560]], [1070, [60, 260, 460, 660]]]);
export const L3_RIVER_TICKS = 120, L3_RIVER_EVERY = 4, L3_RIVER_SWAY = 160, L3_RIVER_SPEED = 4;
export const L3_SHIELD_HALF = 60, L3_SHIELD_DOWN = 276, L3_HORN_PERIOD = 90, L3_HORN_MAX = 5, L3_HORN_NEED = 3;
export const L3_BOX_WARN = 45, L3_BALL_PERIOD = 90, L3_BALLS = 4, L3_BALL_SPEED = 4;
export const L3_ANCHOR_X = Object.freeze([140, 580]), L3_ANCHOR_Y = 300, L3_EAGLE_Y = 150, L3_EAGLE_FIRE = 80, L3_GIFT = 720;
export const L3_CONE_PERIOD = 300, L3_CONE_HALF = 8, L3_CONE_WARN = 60, L3_CONE_LIVE = 12, L3_CONE_SPLIT = 18, L3_CONE_REACH = 1500;
export const L3_EPI_LAG = 60, L3_EPI_PERIOD = 50, L3_JANUS_PERIOD = 50, L3_JANUS_LAG = 48, L3_JANUS_AHEAD = 42, L3_JANUS_BASE = 10, L3_FACE_X = 60, L3_AIM_SPEED = 5;
const CONE = 2, CIRCLE = 3;

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
    out.push({ at, type, lane, x, hp: KIND[type].hp + (SWARM.has(type) ? 0 : L3_HP_ADD[chapterOf(k)]), sh: 0, drop, ...extra });
  };
  const one = (t0, type, idx) => {
    const lane = rng.int(seed, 'lane', 9000 + idx, LANES), x = laneX(lane);
    switch (type) {
      case DRONE: { const x0 = Math.min(WORLD_W - 200, Math.max(200, x)); for (let j = -2; j <= 2; j++) push(t0 + Math.abs(j) * 14, DRONE, lane, x0 + j * 56); return; }
      case DIVER: case SEEKER: push(t0, type, lane, x); push(t0 + 30, type, (lane + 3) % LANES, laneX((lane + 3) % LANES)); return;
      case CRYSTAL: for (let j = 0; j < 3; j++) push(t0 + j * 20, CRYSTAL, (lane + j) % LANES, laneX((lane + 2 * j) % LANES)); return;
      default: return push(t0, type, lane, x);
    }
  };
  SCRIPT.forEach((sec, k) => {
    if (sec.boss || sec.boost || sec.event) return;
    const ch = sec.chapter, [a, b, c, d] = L3_ROSTER[ch], climax = isClimax(k);
    const old = L3_ROSTER.slice(0, ch).flat().filter(t => !HEAVY.has(t));
    for (let u = sec.from; u < sectionEnd(k); u++) {
      const t0 = u * UNIT_TICKS, i = u - sec.from, idx = u * 16;
      const spare = n => { if (old.length) one(t0 + 100 + n * 60, old[(u + n) % old.length], idx + 12 + n); };
      if (sec.safe || (ch === 0 && sec.name === SCRIPT[1].name)) {      // 起: the new machine alone, then a shooter alone, then more
        if (i === 0) one(t0 + 20, a, idx);
        else if (i === 1) one(t0 + 20, c, idx);
        else { one(t0 + 10, a, idx); one(t0 + 110, c, idx + 1); if (i >= 2) one(t0 + 60, d, idx + 3); if (i >= 3) { one(t0 + 170, b, idx + 2); spare(0); } }
        continue;
      }
      const n = Math.min(1 + MORE[ch] + (climax ? 2 : 0) + (i >> 1), climax || ch === 3 ? 9 : 8), mix = [a, c, b, d, a, c, d, b, b, d, a, c];
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
  sim.l3 = {
    sky: strikes(sim.seed), nextSky: 0,
    hx: new Int32Array(L3_HIST), hy: new Int32Array(L3_HIST),  // the ship's last positions, one a tick (index = tick & 63)
    zones: [],                                                // { k (CONE | CIRCLE), x, y, a, r, from, to, act (1 = a boulder: breaks a cover when it lands) }
    watch: [],                                                // things whose going matters: [id, x, y, tag] (tags below)
    rage: 0,                                                  // Phobos: 0 no, > 0 ticks to its rage, -1 raging
    covers: 0, boulders: 0, rains: 0,                         // Enyo: covers laid (her id); boulders thrown; rain patterns laid
    river: 0, riverX: 0,                                      // Ganymede: ticks of the river left; where it pours from
    shieldDown: 0, horn: 0, hornKills: 0,                     // Amalthea: ticks the shield stays down; machines out of the horn this round; of those shot down
    opened: 0,                                                // Pandora: 0 shut, > 0 ticks to opening, -1 open
    chained: 0, freed: 0, gifted: 0,                          // Prometheus: chains set up (his id); all broken; the fire given
  };
}
const W_CRYSTAL = 1, W_DEIMOS = 2, W_HORN = 3, W_CHAIN = 4;
const clampX = x => Math.min((WORLD_W - PLAYER_MARGIN_X) * ONE, Math.max(PLAYER_MARGIN_X * ONE, x));
const findBoss = sim => sim.enemies.find(e => e.hp > 0 && isBoss(e.type));
/** Where the ship was `k` ticks ago (its present position for the first ticks of a match). */
export const pastPos = (sim, k) => { const L = sim.l3, i = Math.max(0, sim.tick - Math.min(k, L3_HIST - 1)); return i === sim.tick ? [sim.px, sim.py] : [L.hx[i & (L3_HIST - 1)], L.hy[i & (L3_HIST - 1)]]; };
/** Where the ship will be `k` ticks from now if it keeps its last L3_JANUS_BASE ticks' motion (kept inside its room to fly). */
export const aheadPos = (sim, k) => {
  const [bx, by] = pastPos(sim, L3_JANUS_BASE);
  const x = sim.px + Math.trunc(((sim.px - bx) * k) / L3_JANUS_BASE), y = sim.py + Math.trunc(((sim.py - by) * k) / L3_JANUS_BASE);
  return [clampX(x), Math.min(PLAYER_MAX_Y * ONE, Math.max(PLAYER_MIN_Y * ONE, y))];
};
const fan3 = (sim, x, y, tx, ty, speed, c) => { const a = angleOf(tx - x, ty - y); for (let k = -1; k <= 1; k++) { fire(sim, x, y, a + k * 9, speed); sim.bullets[sim.bullets.length - 1].c = c; } };
function circle(sim, x, y, r, warn, live, act = 0) {
  sim.l3.zones.push({ k: CIRCLE, x, y, a: 0, r, from: sim.tick + warn, to: sim.tick + warn + live, act });
  emit(sim, { type: 'zoneUp', k: CIRCLE, x: px(x), y: px(y), r, ticks: warn, live });
}

function before(sim, now) {
  const L = sim.l3;
  L.hx[sim.tick & (L3_HIST - 1)] = sim.px; L.hy[sim.tick & (L3_HIST - 1)] = sim.py;
  while (L.nextSky < L.sky.length && L.sky[L.nextSky].at <= now) {   // the storm, leg one's lightning
    const k = L.sky[L.nextSky++];
    sim.strikes.push({ x: k.x * ONE, pw: BEAM_TELEGRAPH, bt: 0 });
    emit(sim, { type: 'strikeUp', x: k.x, w: BEAM_W, ticks: BEAM_TELEGRAPH });
  }
  // a boulder lands: the cover it was aimed at breaks, and stones fly out
  for (const z of L.zones) if (z.act === 1 && z.from === sim.tick) {
    const i = sim.obst.findIndex(o => o.vy === 0 && near(o.x, o.y, z.x, z.y, 10));
    if (i >= 0) { const o = sim.obst.splice(i, 1)[0]; emit(sim, { type: 'obstBreak', kind: o.kind, x: px(o.x), y: px(o.y) }); }
    ring(sim, z.x, z.y, L3_BOULDER_RING, 5, 3);
    emit(sim, { type: 'boulder', x: px(z.x), y: px(z.y) });
  }
  for (let i = L.zones.length - 1; i >= 0; i--) if (L.zones[i].to <= sim.tick) L.zones.splice(i, 1);
  // what went since last tick, and was still on the screen: it was shot down
  const alive = new Map(sim.enemies.filter(e => e.hp > 0).map(e => [e.id, e]));
  for (const [id, x, y, tag] of L.watch) {
    if (alive.has(id) || y >= WORLD_H * ONE || x < 0 || x > WORLD_W * ONE) continue;
    if (tag === W_CRYSTAL) { for (const a of [32, 96, 160, 224]) { fire(sim, x, y, a, L3_CRYSTAL_SPEED); sim.bullets[sim.bullets.length - 1].c = SHARD3; } emit(sim, { type: 'shatter', x: px(x), y: px(y) }); }
    else if (tag === W_DEIMOS && findBoss(sim)?.type === PHOBOS && L.rage === 0) { L.rage = L3_RAGE_WARN; emit(sim, { type: 'rageUp', ticks: L3_RAGE_WARN }); }
    else if (tag === W_HORN && ++L.hornKills >= L3_HORN_NEED && L.shieldDown === 0) { L.shieldDown = L3_SHIELD_DOWN; L.horn = 0; L.hornKills = 0; emit(sim, { type: 'shieldDown', ticks: L3_SHIELD_DOWN }); }
  }
  L.watch = [];
  for (const e of alive.values()) {
    const tag = e.type === CRYSTAL ? W_CRYSTAL : e.type === DEIMOS ? W_DEIMOS : e.aux === -3 ? W_HORN : e.type === ANCHOR || e.type === EAGLE ? W_CHAIN : 0;
    if (tag) L.watch.push([e.id, e.x, e.y, tag]);
  }
  if (L.rage > 0 && --L.rage === 0) { L.rage = -1; emit(sim, { type: 'rage' }); }
  if (L.shieldDown > 0 && --L.shieldDown === 0) emit(sim, { type: 'shieldUpAgain' });
  if (L.opened > 0 && --L.opened === 0) { L.opened = -1; emit(sim, { type: 'boxOpen' }); }
  // Prometheus is free once his chains and the eagle are gone: the fire comes once
  if (L.chained && !L.freed && !sim.enemies.some(e => e.hp > 0 && (e.type === ANCHOR || e.type === EAGLE))) {
    L.freed = 1;
    if (!L.gifted) { L.gifted = 1; sim.haste = Math.max(sim.haste, L3_GIFT); emit(sim, { type: 'fireGift', ticks: L3_GIFT }); }
  }
  // the river Ganymede pours after its dive
  if (L.river > 0) {
    const t = L3_RIVER_TICKS - L.river--;
    if (t % L3_RIVER_EVERY === 0) { sim.bullets.push({ x: clampX(L.riverX + SIN[(t * 4) & 255] * L3_RIVER_SWAY), y: 300 * ONE, vx: 0, vy: L3_RIVER_SPEED * ONE, grazed: 0, c: NECTAR }); }
  }
  for (const e of sim.enemies) if (e.type === GANYMEDE && e.ch === 2 && e.cw === CHARGE_HOLD) { L.river = L3_RIVER_TICKS; L.riverX = e.x; emit(sim, { type: 'river', x: px(e.x) }); }
  // a boss gone: what it brought leaves with it (Deimos, the chains, the covers)
  const b = findBoss(sim);
  if (!b || b.type !== ENYO) for (let i = sim.obst.length - 1; i >= 0; i--) if (sim.obst[i].vy === 0 && L.covers) sim.obst.splice(i, 1);
  if (!b || b.type !== ENYO) L.covers = 0;
}

// ---------- machines ----------
function move(sim, e) {
  const L = sim.l3;
  switch (e.type) {
    case MORTAR: {                                            // q 0 coming down, 1 holding and lobbing, 2 leaving
      if (e.q === 0) { const stop = (200 + ((e.id * 37) % 61)) * ONE; e.y = Math.min(stop, e.y + 3 * ONE); if (e.y === stop) { e.q = 1; e.qd = 0; } }
      else if (e.q === 1) {
        if (++e.qd % L3_MORTAR_PERIOD === L3_MORTAR_PERIOD >> 1 && L.zones.filter(z => z.act === 2).length < L3_MORTAR_MAX) circle(sim, sim.px, sim.py, L3_MORTAR_R, L3_MORTAR_WARN, L3_MORTAR_LIVE, 2);
        if (e.qd >= L3_MORTAR_HOLD) e.q = 2;
      } else e.y += 4 * ONE;
      return;
    }
    case AEGIS:
      e.y += 2 * ONE;
      if (e.t % L3_AEGIS_FIRE === L3_AEGIS_FIRE - 20) emit(sim, { type: 'flash', id: e.id, ticks: 20 });
      if (e.t % L3_AEGIS_FIRE === 0 && e.y > 0 && e.y < 900 * ONE) { fire(sim, e.x, e.y, angleOf(sim.px - e.x, sim.py - e.y), 4); sim.bullets[sim.bullets.length - 1].c = NECTAR; }
      return;
    case CRYSTAL: e.y += L3_CRYSTAL_VY * ONE; e.x = clampX(e.x + SIN[(e.t * 3 + e.id * 41) & 255] * 2); return;
    case ECHO: {
      if (e.q === 0) { e.y = Math.min(220 * ONE, e.y + 4 * ONE); if (e.y === 220 * ONE) { e.q = 1; e.qd = 0; } }
      else if (e.q === 1) {
        if (++e.qd % L3_ECHO_PERIOD === 0) { const [tx, ty] = pastPos(sim, L3_ECHO_LAG); fire(sim, e.x, e.y, angleOf(tx - e.x, ty - e.y), L3_ECHO_SPEED); sim.bullets[sim.bullets.length - 1].c = ECHOSHOT; emit(sim, { type: 'echoShot', x: px(tx), y: px(ty) }); }
        if (e.qd >= L3_ECHO_HOLD) e.q = 2;
      } else e.y += 4 * ONE;
      return;
    }
    case DEIMOS: {                                            // keeps beside Phobos; flees once Phobos is gone
      const b = sim.enemies.find(o => o.type === PHOBOS && o.hp > 0);
      if (!b) { e.y -= 6 * ONE; return; }
      e.x = clampX(b.x + L3_TWIN_GAP * ONE); e.y = b.y;
      if (e.t % L3_TWIN_FAN === 30) fan3(sim, e.x, e.y, sim.px, sim.py, 4, EMBER);
      return;
    }
    case ANCHOR: if (!sim.enemies.some(o => o.type === PROMETHEUS && o.hp > 0)) e.hp = 0; return;
    case EAGLE: {
      if (!sim.enemies.some(o => o.type === PROMETHEUS && o.hp > 0)) { e.hp = 0; return; }
      e.x = (WORLD_W / 2) * ONE + SIN[(e.t * 2 + e.aux) & 255] * 280; e.y = L3_EAGLE_Y * ONE;
      if (e.t % L3_EAGLE_FIRE === 40) { fire(sim, e.x, e.y, angleOf(sim.px - e.x, sim.py - e.y), 5); sim.bullets[sim.bullets.length - 1].c = EMBER; }
      return;
    }
    default: e.y += 4 * ONE;
  }
}

// ---------- mid-bosses and bosses ----------
/** Enyo's fire rain (her core stage): the second grade of the rings of circles (gdd/13 §10), two waves of rows. */
function rain(sim) {
  const L = sim.l3, slide = rng.int(sim.seed, 'rain', L.rains++, 2 * L3_RAIN_SLIDE + 1) - L3_RAIN_SLIDE;
  L3_RAIN_ROWS.forEach(([y, xs], row) => { for (const x0 of xs) circle(sim, (x0 + (row % 2 === 0 ? slide : 0)) * ONE, y * ONE, L3_RAIN_R, L3_RAIN_WARN + (row >= 2 ? L3_RAIN_LATER : 0), L3_RAIN_LIVE); });
}
function boss(sim, e, t, { sig, rage, P, D }) {
  const L = sim.l3, at = (period, ph) => t % period === ph;
  const pat = L3_PATTERNS[KIND[e.type].name];
  if (pat) {
    const fan = D(P(pat.fan)), [rp, rn, twist] = pat.ring, ringP = D(P(rp));
    if (t % fan === 0 && t > 0) aimed3(sim, e);
    if (t % ringP === ringP >> 1) { ring(sim, e.x, e.y, rn, (Math.floor(t / ringP) * twist) & 255, 3); emit(sim, { type: 'bossRing', x: px(e.x), y: px(e.y) }); }
    const spiralOn = pat.spiral && (sig || (e.type === PANDORA && L.opened === -1));
    if (spiralOn && t % L3_SPIRAL_EVERY === 0) spiral(sim, e, pat.spiral + (rage ? 1 : 0));
  }
  switch (e.type) {
    case PHOBOS:                                              // its twin beside it, a pole between them; when the twin falls it rages
      if (t === 0) { const d = add(sim, DEIMOS, clampX(e.x + L3_TWIN_GAP * ONE), e.y, 0, KIND[DEIMOS].hp); d.t = 0; L.rage = 0; }
      if (t % (L.rage === -1 ? L3_TWIN_FAN >> 1 : L3_TWIN_FAN) === 0 && t > 0) fan3(sim, e.x, e.y, sim.px, sim.py, 4, EMBER);
      return;
    case ENYO: {                                              // four covers; a boulder on one of them; as a core, fire rain
      if (L.covers !== e.id) { L.covers = e.id; for (const x of L3_COVER_X) sim.obst.push({ kind: PEAK, x: x * ONE, y: L3_COVER_Y * ONE, vx: 0, vy: 0, hp: OBST_HP[PEAK] }); }
      if (!rage && at(L3_BOULDER_PERIOD, 90)) {
        const left = sim.obst.filter(o => o.vy === 0);
        if (left.length) { const o = left[rng.int(sim.seed, 'boulder', L.boulders++, left.length)]; circle(sim, o.x, o.y, L3_BOULDER_R, L3_BOULDER_WARN, 8, 1); }
      }
      if (rage && at(L3_RAIN_PERIOD, 60)) rain(sim);
      return;
    }
    case GANYMEDE: if (at(CHARGE_PERIOD - 120, 120) && !e.pk) chargeUp(sim, e); return;   // the dive (the engine's charge); the river after it is in before()
    case AMALTHEA:                                            // the horn pours drones out of her right side; three shot down drop the shield
      if (rage || L.shieldDown > 0) return;
      if (at(L3_HORN_PERIOD, 45) && L.horn < L3_HORN_MAX) { const d = add(sim, DRONE, clampX(e.x + 140 * ONE), e.y + 40 * ONE, -3, KIND[DRONE].hp); d.vx = 0; L.horn++; emit(sim, { type: 'horn', x: px(d.x), y: px(d.y) }); }
      if (L.horn >= L3_HORN_MAX && !sim.enemies.some(o => o.aux === -3 && o.hp > 0)) { L.horn = 0; L.hornKills = 0; }   // a round that got away: start again
      return;
    case PANDORA: {                                           // at half health the box opens: a spiral (see above) and bouncing balls; it always drops a repair
      if (t === 0) e.dr = REPAIR + 1;
      if (L.opened === 0 && e.hp <= KIND[PANDORA].hp >> 1) { L.opened = L3_BOX_WARN; emit(sim, { type: 'boxUp', ticks: L3_BOX_WARN }); }
      if (L.opened === -1 && at(L3_BALL_PERIOD, 30)) { const a = angleOf(sim.px - e.x, sim.py - e.y); for (let k = 0; k < L3_BALLS; k++) { fire(sim, e.x, e.y, a + (k - 1.5) * 22 | 0, L3_BALL_SPEED); Object.assign(sim.bullets[sim.bullets.length - 1], { c: BALL, bn: 1 }); } }
      return;
    }
    case PROMETHEUS:                                          // chained (he cannot be hurt) until two anchors and the eagle are down
      if (L.chained !== e.id) {
        L.chained = e.id; L.freed = 0;
        for (const x of L3_ANCHOR_X) add(sim, ANCHOR, x * ONE, L3_ANCHOR_Y * ONE, 0, KIND[ANCHOR].hp);
        add(sim, EAGLE, (WORLD_W / 2) * ONE, L3_EAGLE_Y * ONE, rng.int(sim.seed, 'eagle', 0, 2) * 128, KIND[EAGLE].hp);
        emit(sim, { type: 'chains' });
      }
      if (!L.freed && at(L3_CONE_PERIOD, 100)) for (const d of [-1, 1]) {
        const a = (64 + d * L3_CONE_SPLIT) & 255;
        L.zones.push({ k: CONE, x: e.x, y: e.y, a, r: 0, from: sim.tick + L3_CONE_WARN, to: sim.tick + L3_CONE_WARN + L3_CONE_LIVE, act: 0 });
        emit(sim, { type: 'zoneUp', k: CONE, x: px(e.x), y: px(e.y), a, ticks: L3_CONE_WARN, live: L3_CONE_LIVE });
      }
      return;
    case EPIMETHEUS:                                          // at where the ship was a second ago
      if (at(L3_EPI_PERIOD, 25)) { const [tx, ty] = pastPos(sim, L3_EPI_LAG); fan3(sim, e.x, e.y, tx, ty, L3_AIM_SPEED, ECHOSHOT); emit(sim, { type: 'echoShot', x: px(tx), y: px(ty) }); }
      return;
    case JANUS:                                               // the left face at where the ship was, the right face at where it is going
      if (at(L3_JANUS_PERIOD, 0) && t > 0) { const [tx, ty] = pastPos(sim, L3_JANUS_LAG); fan3(sim, e.x - L3_FACE_X * ONE, e.y, tx, ty, L3_AIM_SPEED, ECHOSHOT); emit(sim, { type: 'echoShot', x: px(tx), y: px(ty) }); }
      if (at(L3_JANUS_PERIOD, L3_JANUS_PERIOD >> 1)) { const [tx, ty] = aheadPos(sim, L3_JANUS_AHEAD); fan3(sim, e.x + L3_FACE_X * ONE, e.y, tx, ty, L3_AIM_SPEED, EMBER); emit(sim, { type: 'aheadShot', x: px(tx), y: px(ty) }); }
      return;
    default:
  }
}

// ---------- geometry ----------
function inZone(z, x, y, r) {
  if (z.k === CIRCLE) return near(x, y, z.x, z.y, z.r + r);
  const dx = x - z.x, dy = y - z.y;
  if (dx * dx + dy * dy > (L3_CONE_REACH * ONE) ** 2) return false;
  return Math.abs(((angleOf(dx, dy) - z.a + 128) & 255) - 128) <= L3_CONE_HALF;
}
export function danger(sim, x, y, r, k = 0) {
  const when = sim.tick + k;
  for (const z of sim.l3.zones) if (when >= z.from && when < z.to && inZone(z, x, y, r)) return true;
  return false;
}
export function predict(sim, e, k) {
  switch (e.type) {
    case CRYSTAL: return [e.x, e.y + L3_CRYSTAL_VY * ONE * k];
    case AEGIS: return [e.x, e.y + 2 * ONE * k];
    case MORTAR: case ECHO: return [e.x, e.q === 2 ? e.y + 4 * ONE * k : e.q === 0 ? Math.min(260 * ONE, e.y + 4 * ONE * k) : e.y];
    case EAGLE: return [(WORLD_W / 2) * ONE + SIN[((e.t + k) * 2 + e.aux) & 255] * 280, e.y];
    default: return [e.x, e.y];
  }
}
const poleBlocks = (sim, e, s) => {
  const d = sim.enemies.find(o => o.type === DEIMOS && o.hp > 0);
  return !!d && s.x > Math.min(e.x, d.x) + KIND[PHOBOS].r * ONE && s.x < Math.max(e.x, d.x) - KIND[DEIMOS].r * ONE && Math.abs(s.y - e.y) <= (L3_POLE_HALF + SHOT_R) * ONE;
};

// ---------- hooks the engine calls ----------
export const LEG3 = Object.freeze({
  schedule, obstacles: legOneObstacles, init, before, move, boss, bossType, danger, predict,
  /** An aegis guard: aim at its flank on the ship's side; Amalthea with her shield up: the same, wider. */
  aim(sim, e) {
    if (e.type === AEGIS) return (sim.px >= e.x ? 1 : -1) * (L3_AEGIS_HALF + 8);
    if (e.type === AMALTHEA && sim.l3.shieldDown === 0 && e.st < 2) return (sim.px >= e.x ? 1 : -1) * (L3_SHIELD_HALF + 14);
    return 0;
  },
  /** A bouncing ball turns back once off a side of the screen. */
  bend(sim, a, isShot) {
    if (isShot || !a.bn) return;
    if ((a.x < 16 * ONE && a.vx < 0) || (a.x > (WORLD_W - 16) * ONE && a.vx > 0)) { a.vx = -a.vx; a.bn = 0; }
  },
  /** Is this shot stopped? An aegis guard's front; Amalthea's shield; the pole between Phobos and Deimos. */
  blocks(sim, e, s) {
    if (e.type === AEGIS) return Math.abs(s.x - e.x) <= L3_AEGIS_HALF * ONE && s.y >= e.y - 10 * ONE && s.y <= e.y + (KIND[AEGIS].r + SHOT_R) * ONE;
    if (e.type === AMALTHEA) return sim.l3.shieldDown === 0 && e.st < 2 && Math.abs(s.x - e.x) <= L3_SHIELD_HALF * ONE && s.y >= e.y && s.y <= e.y + (KIND[AMALTHEA].r + 30) * ONE;
    if (e.type === PHOBOS) return poleBlocks(sim, e, s);
    return false;
  },
  hazard(sim, bodyR) { return danger(sim, sim.px, sim.py, bodyR, 0); },
  /** Prometheus takes nothing while he is chained. */
  scale(sim, e, dmg) { return e.type === PROMETHEUS && !sim.l3.freed ? 0 : dmg; },
  hash(sim, h) {
    const L = sim.l3;
    h.mixAll([L.nextSky, L.rage, L.covers, L.boulders, L.rains, L.river, L.riverX, L.shieldDown, L.horn, L.hornKills, L.opened, L.chained, L.freed, L.gifted, L.zones.length, L.watch.length]);
    h.mixAll([...L.hx, ...L.hy]);
    for (const z of L.zones) h.mixAll([z.k, z.x, z.y, z.a, z.r, z.from, z.to, z.act]);
    for (const w of L.watch) h.mixAll(w);
    for (const b of sim.bullets) if (b.bn) h.mixAll([b.x, b.bn]);
  },
});

export const GAME3 = Object.freeze({
  id: 'sky-talon-leg3', version: 3, maxTicks: MAX_TICKS, maxChoices: SUPPLIES,
  createSim: seed => createSim(seed, LEG3), step, phase, choose, score, stateHash, scoreBreakdown,
});
