// Leg two, "the push into the inner planets" (gdd/05 「第十二版」, design in gdd/13). A leg of the same game: it runs on
// the engine in sim.js and supplies only what differs. sim.js never imports this file, so nothing here can change leg
// one or leg six.
//
// Four chapters; each brings ONE new machine of its own, the rest are leg one's (same rules, same numbers):
//   1 the moon     orbit guard   + drone, gunner, diver          convoy (leg one's)      Endymion -> Selene
//   2 Mercury      shutter pod   + weaver, lancer, miner         storm (as solar flares) Argus    -> Pan
//   3 Venus        twin-vector   + splitter, bulwark, seeker     gorge (as acid clouds)  Eros     -> the Morning and Evening Star
//   4 Earth ruins  discord rammer + beamer, lancer, seeker       shower (as debris)      Eris     -> Nemesis
// The four places do what leg one's four do (its convoy, lightning, gorge and meteors), under other pictures.
// Ground attacks taken from a reference video (gdd/05 v12 §10): stripes, a cone, rings of circles; first grade only.
//
// Deterministic and pure: integers only, no DOM, no clock, no Math.random. Positions are sub-pixels (ONE per px).

import { makeRng, ONE, SIN, COS, angleOf } from './core/index.js';
import {
  ENGINE, KIND, registerKinds, createSim, step, phase, choose, score, stateHash, scoreBreakdown,
  SCRIPT, sectionAt, UNIT_TICKS, WORLD_W, WORLD_H, LANES, LANE_X0, LANE_STEP, DROP_CHANCE, SUPPLIES, MAX_TICKS,
  BEAM_TELEGRAPH, BEAM_W, isBoss, isMid, SHOT_R, PLAYER_MARGIN_X, SPAWN_Y,
  DRONE, GUNNER, DIVER, WEAVER, LANCER, MINER, SPLITTER, BULWARK, SEEKER, BEAMER, CARRIER, MINE, CARRIERS, CARRIER_VX,
  strikes, obstacles as legOneObstacles,
} from './sim.js';

const { fire, ring, emit, px, near, aimed3, spiral, dropKind, add, damage, kill } = ENGINE;
// streams 1, 2, 6, 7, 13 mean what they mean in leg one; 21 and up are this leg's (gdd/05 v12 §6)
/** What a bullet looks like (the picture only; leg six uses 1 and 2): a gold arrow, a lead arrow, Selene's moonlight. */
export const GOLD = 11, LEAD = 12, MOON = 13;
const rng = makeRng({ lane: 1, order: 2, drop: 6, dropKind: 7, event: 13, shutter: 21, eye: 22, apple: 23, rings: 24 });

// ---------- kinds ----------
const FIRST = registerKinds([
  { name: 'orbiter', hp: 2, r: 22, pts: 15 },
  { name: 'shutter', hp: 6, r: 30, pts: 45 },
  { name: 'twinvec', hp: 7, r: 34, pts: 50 },
  { name: 'rammer', hp: 2, r: 26, pts: 25 },
  { name: 'endymion', hp: 90, r: 60, pts: 500, mid: 1 },
  { name: 'argus', hp: 110, r: 65, pts: 750, mid: 1 },
  { name: 'eros', hp: 210, r: 70, pts: 1250, mid: 1 },
  { name: 'eris', hp: 260, r: 74, pts: 2000, mid: 1 },
  { name: 'selene', hp: 280, r: 92, pts: 1000, boss: 1, armour: [80, 165, -60, 290] },
  { name: 'pan', hp: 360, r: 100, pts: 1500, boss: 1, armour: [85, 174, -100, 240] },
  { name: 'twins', hp: 620, r: 108, pts: 2500, boss: 1, armour: [90, 183, -110, 150] },
  { name: 'nemesis', hp: 1300, r: 116, pts: 4000, boss: 1 },   // its plates are this leg's (blocks()): what they stop is counted
]);
export const ORBITER = FIRST, SHUTTER = FIRST + 1, TWINVEC = FIRST + 2, RAMMER = FIRST + 3;
export const L2_MIDS = Object.freeze([FIRST + 4, FIRST + 5, FIRST + 6, FIRST + 7]);
export const L2_BOSSES = Object.freeze([FIRST + 8, FIRST + 9, FIRST + 10, FIRST + 11]);
export const [ENDYMION, ARGUS, EROS, ERIS] = L2_MIDS;
export const [SELENE, PAN, TWINS, NEMESIS] = L2_BOSSES;
const bossType = slot => (slot % 2 === 0 ? L2_MIDS : L2_BOSSES)[slot >> 1];

// ---------- numbers (gdd/05 v12 §3, §4, §10; all starting values) ----------
export const L2_HP_ADD = Object.freeze([0, 0, 1, 0]);
export const L2_ROSTER = Object.freeze([[ORBITER, DRONE, GUNNER, DIVER], [SHUTTER, WEAVER, LANCER, MINER], [TWINVEC, SPLITTER, BULWARK, GUNNER], [RAMMER, BEAMER, LANCER, WEAVER]]);
const HEAVY = new Set([SHUTTER, TWINVEC, BULWARK, BEAMER]);                 // come one (or one pair) at a time
const SWARM = new Set([ORBITER, DRONE, DIVER, SEEKER, RAMMER]);             // come in numbers: no chapter health for them
const MORE = Object.freeze([2, 1, 5, 3]);                                   // how many more of a chapter's machines a wave unit gets

export const L2_ORBIT_VY = 2, L2_ORBIT_FIRE = 50, L2_ORBIT_WARN = 20, L2_ORBIT_SPEED = 4, L2_ORBIT_RX = 155, L2_ORBIT_RY = 100, L2_GUARDS = 5, L2_GUARDS_MORE = 4;
export const L2_SHUT_CLOSED = 70, L2_SHUT_OPEN = 100, L2_SHUT_WARN = 20, L2_SHUT_CYCLES = 4, L2_SHUT_FAN = Object.freeze([-18, -9, 0, 9, 18]), L2_SHUT_SPEED = 4;
export const L2_TWIN_Y = 240, L2_TWIN_PERIOD = 80, L2_TWIN_WARN = 24, L2_TWIN_VOLLEYS = 4, L2_GOLD_SPEED = 3, L2_GOLD_TURN = 45, L2_LEAD_SPEED = 9;
export const L2_RAM_Y = -20, L2_RAM_IN = 2, L2_RAM_GAP = 80, L2_RAM_WARN = 30, L2_RAM_SPEED = 5, L2_BLAST_R = 90, L2_BLAST_DMG = 3, L2_BLAST_LINKS = 3;
// mid-bosses and bosses: what each keeps up besides its own move. fan of three every `fan`; ring [period, bullets, twist]
export const L2_PATTERNS = Object.freeze({
  endymion: { fan: 90, ring: [140, 10, 9] }, argus: { fan: 90, ring: [150, 8, 11] }, eros: { fan: 75, ring: [125, 12, 9] }, eris: { fan: 70, ring: [120, 12, 13] },
  selene: { fan: 80, ring: [125, 12, 9] }, pan: { fan: 75, ring: [115, 12, 11] }, twins: { fan: 70, ring: [110, 14, 9] }, nemesis: { fan: 65, ring: [105, 14, 13] },
});
export const L2_WAKE_WARN = 45, L2_WAKE_TICKS = 120, L2_WAKE_EVERY = 12, L2_WAKE_ARMS = 5, L2_WAKE_TURN = 7;
export const L2_SELENE_PERIOD = 110, L2_SELENE_WARN = 30, L2_SELENE_SLOTS = 10, L2_SELENE_STEP = 72, L2_SELENE_SPEED = 3, L2_SELENE_GAPS = Object.freeze([0, 1, 2, 3, 4, 3, 2, 1]);
export const L2_EYES = 7, L2_EYE_STEP = 26, L2_EYE_HALF = 20, L2_EYE_OPEN = 3, L2_EYE_PERIOD = 156, L2_EYE_WARN = 30, L2_EYE_FIRE = 64;
export const L2_PIPE_PERIOD = 300, L2_PIPE_LEN = Object.freeze([360, 520, 680, 840, 680, 520, 360]), L2_PIPE_X0 = 90, L2_PIPE_STEP = 90, L2_PIPE_HALF = 17, L2_PIPE_DELAY = 13, L2_PIPE_WARN = 40, L2_PIPE_LIVE = 45;
export const L2_EROS_PERIOD = 70, L2_EROS_WING = 70;
export const L2_TWIN_SWAP = 360, L2_TWIN_SWAP_WARN = 45, L2_TWIN_X = Object.freeze([200, 520]), L2_TWIN_MOVE = 8;
export const L2_MORNING_PERIOD = 50, L2_MORNING_SPEED = 6, L2_EVENING_PERIOD = 70, L2_EVENING_SPEED = 3;
export const L2_ERIS_CALL = 240, L2_APPLE_PERIOD = 300, L2_APPLE_WARN = 45, L2_APPLE_TICKS = 150, L2_APPLE_PULL = 5, L2_DISCORD_R = 38, L2_DISCORD_PTS = 500, L2_DISCORD_REACH = 260, L2_DISCORD_DMG = 8;
export const L2_NEMESIS_ARMOUR = Object.freeze([125, 192, -60, 150]), L2_NEMESIS_PERIOD = 240, L2_NEMESIS_WARN = 30, L2_NEMESIS_CAP = 24, L2_NEMESIS_SPEED = 3;
// v2 (user, 2026-11-22: "raise the density, the rate and the bullet speed of the chapter-four boss once its armour breaks"):
// from the frame stage on, besides her common patterns: a spiral (2 arms, 3 as a core, every 11 ticks), a fan of five at speed 6, a
// second ring of 12 at speed 4 (ring: [period, bullets, speed])
export const L2_NEMESIS_SPIRAL_EVERY = 11, L2_NEMESIS_FAN_PERIOD = 70, L2_NEMESIS_FAN_STEP = 9, L2_NEMESIS_FAN_SPEED = 6, L2_NEMESIS_RING = Object.freeze([130, 12, 4]);
// ground attacks (§10), first grade
export const L2_STRIPE_HALF = 45, L2_STRIPE_WARN = 48, L2_STRIPE_LIVE = 12, L2_STRIPE_Y = Object.freeze([600, 780, 960]);
export const L2_CONE_HALF = 8, L2_CONE_WARN = 60, L2_CONE_LIVE = 12, L2_CONE_REACH = 1500;   // 8 of 256 a side = about 11 degrees
export const L2_RINGS_R = 60, L2_RINGS_WARN = 54, L2_RINGS_LIVE = 8, L2_RINGS_GAP = 200, L2_RINGS_LATER = 30, L2_RINGS_PERIOD = 300;
const PIPE = 0, STRIPE = 1, CONE = 2, CIRCLE = 3;

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
    out.push({ at, type, lane, x, hp: KIND[type].hp + (SWARM.has(type) ? 0 : L2_HP_ADD[chapterOf(k)]), sh: 0, drop, ...extra });
  };
  /** One appearance of a machine, its idx-th. */
  const one = (t0, type, idx) => {
    const lane = rng.int(seed, 'lane', 9000 + idx, LANES), x = laneX(lane);
    switch (type) {
      case ORBITER: { const dir = rng.int(seed, 'order', 4096 + idx, 2) ? 1 : -1, x0 = Math.min(WORLD_W - 180, Math.max(180, x)); for (let j = 0; j < 4; j++) push(t0 + j * 12, ORBITER, lane, x0 + dir * (j - 1.5) * 60 | 0); return; }
      case DRONE: { const x0 = Math.min(WORLD_W - 200, Math.max(200, x)); for (let j = -2; j <= 2; j++) push(t0 + Math.abs(j) * 14, DRONE, lane, x0 + j * 56); return; }   // the moon's V (the demo's strafe darts)
      case DIVER: case SEEKER: push(t0, type, lane, x); push(t0 + 30, type, (lane + 3) % LANES, laneX((lane + 3) % LANES)); return;
      case SHUTTER: push(t0, SHUTTER, 1, 180); push(t0, SHUTTER, 4, 540); return;
      case RAMMER: { const x0 = Math.min(WORLD_W - 140, Math.max(140, x)); for (let j = 0; j < 3; j++) push(t0 + j * 12, RAMMER, lane, x0 + (j - 1) * L2_RAM_GAP, { y: L2_RAM_Y }); return; }   // close enough that one burst reaches the next
      default: return push(t0, type, lane, x);
    }
  };
  SCRIPT.forEach((sec, k) => {
    if (sec.boss || sec.boost || sec.event) return;
    const ch = sec.chapter, [a, b, c, d] = L2_ROSTER[ch], climax = isClimax(k);
    const old = L2_ROSTER.slice(0, ch).flat().filter(t => !HEAVY.has(t));   // what earlier chapters taught
    for (let u = sec.from; u < sectionEnd(k); u++) {
      const t0 = u * UNIT_TICKS, i = u - sec.from, idx = u * 16;
      const spare = n => { if (old.length) one(t0 + 100 + n * 60, old[(u + n) % old.length], idx + 12 + n); };
      // 起: the chapter's new machine alone, then a shooter alone, then both
      if (sec.safe || (ch === 0 && sec.name === SCRIPT[1].name)) {
        if (i === 0) one(t0 + 20, a, idx);
        else if (i === 1) one(t0 + 20, c, idx);
        else { one(t0 + 10, a, idx); one(t0 + 110, c, idx + 1); if (i >= 2) one(t0 + 60, d, idx + 3); if (i >= 3) { one(t0 + 170, b, idx + 2); spare(0); } }
        continue;
      }
      // 承 and 合: everything together, more each unit (the other three are leg one's, met there: they need no unit alone)
      const n = Math.min(1 + MORE[ch] + (climax ? 2 : 0) + (i >> 1), climax ? 9 : 8), mix = [a, c, b, d, a, c, d, b, b, d, a, c];
      for (let j = 0, placed = 0; placed < n && j < mix.length; j++) { if (HEAVY.has(mix[j]) && j >= 4) continue; one(t0 + 10 + placed * Math.floor(200 / n), mix[j], idx + j); placed++; }
      spare(0); if (climax || i >= 3 || ch >= 2) spare(1);
    }
  });
  // leg one's convoy and the storm's two mines, in the same units
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

// ---------- the leg's own state on the sim ----------
function init(sim) {
  sim.l2 = {
    sky: strikes(sim.seed), nextSky: 0,                       // leg one's storm lightning (the engine runs only leg one's own sky)
    zones: [],                                                // ground attacks: { k (PIPE..CIRCLE), x, y, a, len, from, to } (ticks of sim.tick)
    rams: [],                                                 // rammers seen last tick: [id, x, y] (one that is gone and was on screen was shot down)
    guarded: 0, wakes: 0,                                     // Endymion: guards sent out (the id of the boss); times it has woken
    rows: 0,                                                  // Selene: rows laid so far (the gap's place in the moon's phases)
    eyes: 0,                                                  // Argus: bit i = eye i open
    side: 0, swapTo: -1, coneDue: 0,                          // the twins: which is out (0 morning, left); where it is going; a cone owed on arrival
    apple: null, apples: 0,                                   // Eris: { x, y, pw, bt }; how many thrown
    ret: 0,                                                   // Nemesis: shots her plates have stopped since she last paid them back
    rings: 0,                                                 // rings of circles laid (the seed stream's index)
  };
}

const clampX = x => Math.min((WORLD_W - PLAYER_MARGIN_X) * ONE, Math.max(PLAYER_MARGIN_X * ONE, x));
const findBoss = sim => sim.enemies.find(e => e.hp > 0 && isBoss(e.type));
function zone(sim, z, warn, live) {
  sim.l2.zones.push({ x: 0, y: 0, a: 0, len: 0, ...z, from: sim.tick + warn, to: sim.tick + warn + live });
  emit(sim, { type: 'zoneUp', k: z.k, x: px(z.x || 0), y: px(z.y || 0), a: z.a || 0, len: z.len || 0, ticks: warn, live });
}

function before(sim, now) {
  const L = sim.l2;
  // the storm (chapter two's event unit): leg one's lightning, as solar flares
  while (L.nextSky < L.sky.length && L.sky[L.nextSky].at <= now) {
    const k = L.sky[L.nextSky++];
    sim.strikes.push({ x: k.x * ONE, pw: BEAM_TELEGRAPH, bt: 0 });
    emit(sim, { type: 'strikeUp', x: k.x, w: BEAM_W, ticks: BEAM_TELEGRAPH });
  }
  for (let i = L.zones.length - 1; i >= 0; i--) if (L.zones[i].to <= sim.tick) L.zones.splice(i, 1);
  blasts(sim);
  discord(sim);
}

/** A rammer that is gone since last tick, and was not past the bottom of the screen, was shot down: it bursts, and
 *  every other machine within L2_BLAST_R takes L2_BLAST_DMG; a rammer the burst brings down bursts in turn. The burst
 *  never hurts the ship. Each link of a chain doubles that link's points. */
function blasts(sim) {
  const L = sim.l2, alive = new Set(sim.enemies.filter(e => e.type === RAMMER && e.hp > 0).map(e => e.id));
  const burst = (x, y, link) => {
    emit(sim, { type: 'burst', x: px(x), y: px(y), r: L2_BLAST_R, link });
    for (const o of sim.enemies) {
      if (o.hp <= 0 || isBoss(o.type) || !near(o.x, o.y, x, y, L2_BLAST_R)) continue;
      damage(sim, o, L2_BLAST_DMG);
      if (o.hp > 0) continue;
      kill(sim, o);
      const bonus = KIND[o.type].pts * ((1 << Math.min(link, L2_BLAST_LINKS)) - 1);
      sim.score += bonus; sim.killPts += bonus;
      if (o.type === RAMMER) { alive.delete(o.id); burst(o.x, o.y, link + 1); }
    }
  };
  for (const [id, x, y] of L.rams) if (!alive.has(id) && y < WORLD_H * ONE) burst(x, y, 1);
  L.rams = sim.enemies.filter(e => e.type === RAMMER && e.hp > 0).map(e => [e.id, e.x, e.y]);
}

/** Eris's golden apple: announced, then for a while every machine on screen makes for it; two that meet blow up
 *  together (points, and a hurt to Eris when it is near her). */
function discord(sim) {
  const L = sim.l2, ap = L.apple;
  if (!ap) return;
  if (ap.pw > 0) { if (--ap.pw === 0) emit(sim, { type: 'apple', x: px(ap.x), y: px(ap.y), ticks: ap.bt }); return; }
  if (--ap.bt <= 0) { L.apple = null; emit(sim, { type: 'appleEnd' }); return; }
  const eris = sim.enemies.find(e => e.type === ERIS && e.hp > 0), crowd = sim.enemies.filter(e => e.hp > 0 && !isBoss(e.type) && !KIND[e.type].ground);
  for (const e of crowd) {
    const a = angleOf(ap.x - e.x, ap.y - e.y);
    e.x += COS[a] * L2_APPLE_PULL; e.y += SIN[a] * L2_APPLE_PULL;
  }
  for (let i = 0; i < crowd.length; i++) {
    const e = crowd[i];
    if (e.hp <= 0) continue;
    for (let j = i + 1; j < crowd.length; j++) {
      const o = crowd[j];
      if (o.hp <= 0 || !near(e.x, e.y, o.x, o.y, L2_DISCORD_R)) continue;
      e.hp = 0; o.hp = 0; L.rams = L.rams.filter(([id]) => id !== e.id && id !== o.id);   // a rammer that goes this way has burst already
      sim.score += L2_DISCORD_PTS; sim.killPts += L2_DISCORD_PTS;
      const x = (e.x + o.x) >> 1, y = (e.y + o.y) >> 1;
      emit(sim, { type: 'discord', x: px(x), y: px(y), pts: L2_DISCORD_PTS });
      if (eris && near(x, y, eris.x, eris.y, L2_DISCORD_REACH)) { damage(sim, eris, L2_DISCORD_DMG); if (eris.hp <= 0) kill(sim, eris); }
      break;
    }
  }
}

// ---------- machines ----------
/** A gold arrow: flies straight down, and after L2_GOLD_TURN ticks turns once toward where the ship was when it was
 *  fired (the bullet carries that point and its countdown; bend() makes the turn). A lead arrow goes straight there. */
function arrows(sim, x, y) {
  const tx = sim.px, ty = sim.py;
  sim.bullets.push({ x, y, vx: 0, vy: L2_GOLD_SPEED * ONE, grazed: 0, c: GOLD, tt: L2_GOLD_TURN, tx, ty });
  emit(sim, { type: 'goldArrow', x: px(x), y: px(y), turnY: px(y) + L2_GOLD_SPEED * L2_GOLD_TURN, tx: px(tx), ty: px(ty) });
  fire(sim, x, y, angleOf(tx - x, ty - y), L2_LEAD_SPEED);
  sim.bullets[sim.bullets.length - 1].c = LEAD;
}

function move(sim, e) {
  switch (e.type) {
    case ORBITER: {                                           // q 9 = guarding a boss: round it; else down, firing at the ship
      if (e.q === 9) {
        const b = findBoss(sim);
        if (!b) { e.q = 0; return; }
        e.a = (e.a + 1) & 255;
        e.x = b.x + COS[e.a] * L2_ORBIT_RX; e.y = b.y + SIN[e.a] * L2_ORBIT_RY;
        return;
      }
      e.y += L2_ORBIT_VY * ONE;
      const p = e.t % L2_ORBIT_FIRE;
      if (p === L2_ORBIT_FIRE - L2_ORBIT_WARN) emit(sim, { type: 'flash', id: e.id, ticks: L2_ORBIT_WARN });
      if (p === 0 && e.y > 0) { fire(sim, e.x, e.y, angleOf(sim.px - e.x, sim.py - e.y), L2_ORBIT_SPEED); emit(sim, { type: 'enemyFire', x: px(e.x), y: px(e.y) }); }
      return;
    }
    case SHUTTER: {                                           // q 0 coming down, 1 shut, 2 open (only then hurt, only then firing), 3 leaving; pv = cycles done (aux is its lane)
      if (e.q === 0) {
        const stop = (270 + rng.int(sim.seed, 'shutter', e.id, 81)) * ONE;
        e.y = Math.min(stop, e.y + 3 * ONE);
        if (e.y === stop) { e.q = 1; e.qd = L2_SHUT_CLOSED; }
      } else if (e.q === 1) {
        if (--e.qd === L2_SHUT_WARN) emit(sim, { type: 'shellCrack', id: e.id, x: px(e.x), y: px(e.y), ticks: L2_SHUT_WARN });
        if (e.qd <= 0) { e.q = 2; e.qd = L2_SHUT_OPEN; emit(sim, { type: 'shellOpen', id: e.id }); }
      } else if (e.q === 2) {
        if (e.qd === L2_SHUT_OPEN) {
          const a = angleOf(sim.px - e.x, sim.py - e.y);
          for (const off of L2_SHUT_FAN) fire(sim, e.x, e.y, a + off, L2_SHUT_SPEED);
          emit(sim, { type: 'enemyFire', x: px(e.x), y: px(e.y) });
        }
        if (--e.qd <= 0) { e.pv++; e.q = e.pv >= L2_SHUT_CYCLES ? 3 : 1; e.qd = L2_SHUT_CLOSED; emit(sim, { type: 'shellShut', id: e.id }); }
      } else e.y += 4 * ONE;
      return;
    }
    case TWINVEC:                                             // q 0 coming down, 1 firing pairs of arrows, 2 leaving
      if (e.q === 0) { e.y = Math.min(L2_TWIN_Y * ONE, e.y + 4 * ONE); if (e.y === L2_TWIN_Y * ONE) { e.q = 1; e.qd = L2_TWIN_PERIOD >> 1; } }
      else if (e.q === 1) {
        if (--e.qd === L2_TWIN_WARN) emit(sim, { type: 'flash', id: e.id, ticks: L2_TWIN_WARN });
        if (e.qd <= 0) { arrows(sim, e.x, e.y); e.qd = L2_TWIN_PERIOD; if (++e.pv >= L2_TWIN_VOLLEYS) e.q = 2; }
      } else e.y += 4 * ONE;
      return;
    case RAMMER:                                              // q 0 showing its line, 1 straight down it
      if (e.q === 0) {
        if (e.t === 1) emit(sim, { type: 'chargeLine', id: e.id, x: px(e.x), w: KIND[RAMMER].r, ticks: L2_RAM_WARN });
        e.y += L2_RAM_IN * ONE;                               // it comes in from above the screen while its line shows
        if (e.t >= L2_RAM_WARN) e.q = 1;
      } else e.y += L2_RAM_SPEED * ONE;
      return;
    default: e.y += 4 * ONE;
  }
}

// ---------- mid-bosses and bosses ----------
function guards(sim, b, n) {
  const have = sim.enemies.filter(e => e.type === ORBITER && e.q === 9 && e.hp > 0).length, m = Math.min(n, L2_GUARDS - have);
  for (let i = 0; i < m; i++) { const g = add(sim, ORBITER, b.x, b.y, 0, KIND[ORBITER].hp); g.q = 9; g.a = Math.floor((i * 256) / m); }
  if (m > 0) emit(sim, { type: 'guards', id: b.id, n: m });
}
const eyeOff = i => (i - (L2_EYES >> 1)) * L2_EYE_STEP;
/** The eyes Argus has open in its p-th period: the first three of a shuffle the seed fixes. */
const eyesAt = (seed, p) => rng.shuffle(seed, 'eye', p, [0, 1, 2, 3, 4, 5, 6]).slice(0, L2_EYE_OPEN).reduce((m, i) => m | (1 << i), 0);

/** The scales: twelve circles in four staggered rows below Nemesis, the two nearer rows first (5), the two further
 *  ones L2_RINGS_LATER ticks later (7). Every centre is at least L2_RINGS_GAP from every other; the seed (stream 24)
 *  only slides the first three rows sideways by up to L2_RINGS_SLIDE (the fourth reaches both edges and stays). */
export const L2_RINGS_ROWS = Object.freeze([[500, [160, 360, 560]], [690, [260, 460]], [880, [160, 360, 560]], [1070, [60, 260, 460, 660]]]);
export const L2_RINGS_SLIDE = 30;
function ringsOfCircles(sim) {
  const L = sim.l2, n = L.rings++, slide = rng.int(sim.seed, 'rings', n, 2 * L2_RINGS_SLIDE + 1) - L2_RINGS_SLIDE;
  L2_RINGS_ROWS.forEach(([y, xs], row) => {
    const later = row >= 2 ? L2_RINGS_LATER : 0;
    for (const x0 of xs) {
      const x = (x0 + (row < 3 ? slide : 0)) * ONE;
      L.zones.push({ k: CIRCLE, x, y: y * ONE, a: 0, len: 0, from: sim.tick + later + L2_RINGS_WARN, to: sim.tick + later + L2_RINGS_WARN + L2_RINGS_LIVE });
      emit(sim, { type: 'zoneUp', k: CIRCLE, x: px(x), y, r: L2_RINGS_R, ticks: later + L2_RINGS_WARN, live: L2_RINGS_LIVE });
    }
  });
}

/** Called by the engine once a boss is in position and not stunned; t = ticks since it took position. */
function boss(sim, e, t, { sig, rage, P, D }) {
  const L = sim.l2, at = (period, ph) => t % period === ph;
  const pat = L2_PATTERNS[KIND[e.type].name];
  if (pat) {
    const fan = D(P(pat.fan)), [rp, rn, twist] = pat.ring, ringP = D(P(rp));
    if (t % fan === 0 && t > 0) aimed3(sim, e);
    if (t % ringP === ringP >> 1) { ring(sim, e.x, e.y, rn, (Math.floor(t / ringP) * twist) & 255, 3); emit(sim, { type: 'bossRing', x: px(e.x), y: px(e.y) }); }
  }
  switch (e.type) {
    case ENDYMION: {                                          // asleep under its guard; wakes at every quarter of its health lost
      if (L.guarded !== e.id) { L.guarded = e.id; guards(sim, e, L2_GUARDS); }
      const full = KIND[e.type].hp;
      if (e.q === 0 && L.wakes < 3 && e.hp <= Math.trunc((full * (3 - L.wakes)) / 4)) { L.wakes++; e.q = 1; e.qd = L2_WAKE_WARN; emit(sim, { type: 'wakeUp', id: e.id, x: px(e.x), y: px(e.y), ticks: L2_WAKE_WARN }); }
      else if (e.q === 1) { if (--e.qd <= 0) { e.q = 2; e.qd = L2_WAKE_TICKS; guards(sim, e, L2_GUARDS_MORE); emit(sim, { type: 'wake', id: e.id }); } }
      else if (e.q === 2) {
        if (e.qd % L2_WAKE_EVERY === 0) { e.a = (e.a + L2_WAKE_TURN) & 255; ring(sim, e.x, e.y, L2_WAKE_ARMS, e.a, 3); }
        if (--e.qd <= 0) { e.q = 0; emit(sim, { type: 'sleep', id: e.id }); }
      }
      return;
    }
    case SELENE: {                                            // a row of bullets across the top, its gap walking the phases of the moon
      const g = L2_SELENE_GAPS[L.rows % L2_SELENE_GAPS.length];
      if (at(L2_SELENE_PERIOD, L2_SELENE_PERIOD - L2_SELENE_WARN)) emit(sim, { type: 'gapUp', x: 36 + L2_SELENE_STEP * 2 * g, w: 2 * L2_SELENE_STEP, ticks: L2_SELENE_WARN });
      if (at(L2_SELENE_PERIOD, 0) && t > 0) {
        for (let i = 0; i < L2_SELENE_SLOTS; i++) {
          if (i >> 1 === g) continue;
          for (const dy of [40]) sim.bullets.push({ x: (36 + L2_SELENE_STEP * i) * ONE, y: e.y + dy * ONE, vx: 0, vy: L2_SELENE_SPEED * ONE, grazed: 0, c: MOON });
        }
        L.rows++; emit(sim, { type: 'crescent', y: px(e.y), gap: g });
      }
      return;
    }
    case ARGUS: {                                             // three eyes of seven open; only they shoot, only they can be hurt
      const p = Math.floor(t / L2_EYE_PERIOD);
      L.eyes = eyesAt(sim.seed, p);
      if (t % L2_EYE_PERIOD === L2_EYE_PERIOD - L2_EYE_WARN) emit(sim, { type: 'eyesUp', id: e.id, eyes: eyesAt(sim.seed, p + 1), ticks: L2_EYE_WARN });
      if (t % L2_EYE_FIRE === L2_EYE_FIRE >> 1) for (let i = 0; i < L2_EYES; i++) if (L.eyes >> i & 1) { const x = e.x + eyeOff(i) * ONE, y = e.y + 10 * ONE; fire(sim, x, y, angleOf(sim.px - x, sim.py - y), 4); }
      return;
    }
    case PAN: {                                               // seven pipes of fixed lengths, left to right; as a core, a set of stripes after them
      if (at(L2_PIPE_PERIOD, 100)) {
        L2_PIPE_LEN.forEach((len, i) => {
          const from = sim.tick + i * L2_PIPE_DELAY + L2_PIPE_WARN, x = (L2_PIPE_X0 + i * L2_PIPE_STEP) * ONE;
          L.zones.push({ k: PIPE, x, y: e.y, a: 0, len, from, to: from + L2_PIPE_LIVE });
          emit(sim, { type: 'zoneUp', k: PIPE, x: px(x), y: px(e.y), len, w: L2_PIPE_HALF, ticks: i * L2_PIPE_DELAY + L2_PIPE_WARN, live: L2_PIPE_LIVE });
        });
      }
      const after = 100 + 6 * L2_PIPE_DELAY + L2_PIPE_WARN + L2_PIPE_LIVE + 30 - L2_STRIPE_WARN;
      if (rage && at(L2_PIPE_PERIOD, after)) for (const y of L2_STRIPE_Y) zone(sim, { k: STRIPE, y: y * ONE }, L2_STRIPE_WARN, L2_STRIPE_LIVE);
      return;
    }
    case EROS:                                                // the wings by turns: a gold arrow and a lead arrow each
      if (t % L2_EROS_PERIOD === L2_EROS_PERIOD - 24 || t % L2_EROS_PERIOD === (L2_EROS_PERIOD >> 1) - 24) emit(sim, { type: 'flash', id: e.id, ticks: 24 });
      if (t > 0 && at(L2_EROS_PERIOD, 0)) arrows(sim, e.x - L2_EROS_WING * ONE, e.y);
      if (at(L2_EROS_PERIOD, L2_EROS_PERIOD >> 1)) arrows(sim, e.x + L2_EROS_WING * ONE, e.y);
      return;
    case TWINS: {                                             // morning (left) and evening (right) by turns; each arrival, a cone at the ship
      if (t === 0) e.ax = L2_TWIN_X[0] * ONE;
      if (t > 0 && at(L2_TWIN_SWAP, L2_TWIN_SWAP - L2_TWIN_SWAP_WARN)) emit(sim, { type: 'swapUp', x: L2_TWIN_X[1 - L.side], ticks: L2_TWIN_SWAP_WARN });
      if (t > 0 && at(L2_TWIN_SWAP, 0)) { L.side = 1 - L.side; L.swapTo = L2_TWIN_X[L.side] * ONE; emit(sim, { type: 'swap', side: L.side }); }
      if (L.swapTo >= 0) {
        const d = L.swapTo - e.ax, s = L2_TWIN_MOVE * ONE;
        e.ax += Math.max(-s, Math.min(s, d));
        if (e.ax === L.swapTo) { L.swapTo = -1; L.coneDue = 1; }
        return;
      }
      if (L.coneDue) { L.coneDue = 0; zone(sim, { k: CONE, x: e.x, y: e.y, a: angleOf(sim.px - e.x, sim.py - e.y) }, L2_CONE_WARN, L2_CONE_LIVE); }
      if (L.side === 0 && at(L2_MORNING_PERIOD, 10)) { const a = angleOf(sim.px - e.x, sim.py - e.y); for (let k = -2; k <= 2; k++) fire(sim, e.x, e.y, a + k * 8, L2_MORNING_SPEED); }
      if (L.side === 1 && at(L2_EVENING_PERIOD, 20)) { const a = angleOf(sim.px - e.x, sim.py - e.y); for (let k = -3; k <= 3; k++) fire(sim, e.x, e.y, a + k * 10, L2_EVENING_SPEED); }
      return;
    }
    case ERIS: {                                              // calls up machines; throws the golden apple
      if (at(L2_ERIS_CALL, 60)) {
        for (const [type, dx] of [[LANCER, -120], [LANCER, 120], [SEEKER, -60], [SEEKER, 60]]) {
          const lane = Math.max(0, Math.min(LANES - 1, Math.round((px(e.x) + dx - LANE_X0) / LANE_STEP)));
          add(sim, type, clampX(e.x + dx * ONE), e.y + 40 * ONE, lane, KIND[type].hp);
        }
        emit(sim, { type: 'summon', id: e.id });
      }
      if (at(L2_APPLE_PERIOD, 150) && !L.apple) {
        const n = L.apples++, x = (150 + rng.int(sim.seed, 'apple', 2 * n, 421)) * ONE, y = (380 + rng.int(sim.seed, 'apple', 2 * n + 1, 241)) * ONE;
        L.apple = { x, y, pw: L2_APPLE_WARN, bt: L2_APPLE_TICKS };
        emit(sim, { type: 'appleUp', x: px(x), y: px(y), ticks: L2_APPLE_WARN });
      }
      return;
    }
    case NEMESIS:                                             // with plates on: pays back what they stopped; as a core: the scales (rings of circles)
      if (e.st === 0 && at(L2_NEMESIS_PERIOD, 120 - L2_NEMESIS_WARN)) emit(sim, { type: 'retributionUp', id: e.id, n: L.ret, ticks: L2_NEMESIS_WARN });
      if (e.st === 0 && at(L2_NEMESIS_PERIOD, 120) && L.ret > 0) {
        const n = L.ret, half = Math.ceil(n / 2);
        for (const side of [-1, 1]) {
          const m = side < 0 ? half : n - half, x = e.x + side * 158 * ONE, y = e.y + 40 * ONE;
          for (let k = 0; k < m; k++) fire(sim, x, y, 40 + Math.floor((k * 48) / Math.max(1, m - 1)), L2_NEMESIS_SPEED);
        }
        emit(sim, { type: 'retribution', id: e.id, n });
        L.ret = 0;
      }
      if (sig) {                                              // v2: her plates gone, she presses harder: a spiral, a fast aimed fan, faster rings
        if (t % D(L2_NEMESIS_SPIRAL_EVERY) === 0) spiral(sim, e, rage ? 3 : 2);
        const fan5 = D(P(L2_NEMESIS_FAN_PERIOD));
        if (t % fan5 === fan5 >> 1) { const a = angleOf(sim.px - e.x, sim.py - e.y); for (let k = -2; k <= 2; k++) fire(sim, e.x, e.y, a + k * L2_NEMESIS_FAN_STEP, L2_NEMESIS_FAN_SPEED); emit(sim, { type: 'enemyFire', x: px(e.x), y: px(e.y) }); }
        const rp = D(P(L2_NEMESIS_RING[0]));
        if (t % rp === 0 && t > 0) { ring(sim, e.x, e.y, L2_NEMESIS_RING[1], (Math.floor(t / rp) * 7) & 255, L2_NEMESIS_RING[2]); emit(sim, { type: 'bossRing', x: px(e.x), y: px(e.y) }); }
      }
      if (rage && at(L2_RINGS_PERIOD, 60)) ringsOfCircles(sim);
      return;
    default:
  }
}

// ---------- geometry ----------
/** Does one of the leg's ground attacks cover (x, y) (sub-pixels) for a body of radius r px, k ticks from now? Only
 *  live time counts; every one of them is on screen from the moment it is laid. */
function inZone(z, x, y, r) {
  const R = r * ONE;
  switch (z.k) {
    case PIPE: return Math.abs(x - z.x) <= (L2_PIPE_HALF + r) * ONE && y >= z.y - R && y <= z.y + (z.len + r) * ONE;
    case STRIPE: return Math.abs(y - z.y) <= (L2_STRIPE_HALF + r) * ONE;
    case CONE: { const dx = x - z.x, dy = y - z.y; if (dx * dx + dy * dy > (L2_CONE_REACH * ONE) ** 2) return false; const d = ((angleOf(dx, dy) - z.a + 128) & 255) - 128; return Math.abs(d) <= L2_CONE_HALF; }
    default: return near(x, y, z.x, z.y, L2_RINGS_R + r);
  }
}
export function danger(sim, x, y, r, k = 0) {
  const when = sim.tick + k;
  for (const z of sim.l2.zones) if (when >= z.from && when < z.to && inZone(z, x, y, r)) return true;
  if (k > 0) for (const e of sim.enemies) if (e.type === RAMMER && e.hp > 0 && Math.abs(x - e.x) <= (KIND[RAMMER].r + r) * ONE && y >= e.y && (e.q === 1 || k >= L2_RAM_WARN - e.t)) return true;
  return false;
}
/** Where a machine will be k ticks from now, as far as can be told from what it shows. */
export function predict(sim, e, k) {
  switch (e.type) {
    case RAMMER: { if (e.q === 1) return [e.x, e.y + L2_RAM_SPEED * ONE * k]; const w = Math.max(0, L2_RAM_WARN - e.t), a = Math.min(k, w); return [e.x, e.y + L2_RAM_IN * ONE * a + L2_RAM_SPEED * ONE * (k - a)]; }
    case ORBITER: return e.q === 9 ? [e.x, e.y] : [e.x, e.y + L2_ORBIT_VY * ONE * k];
    case SHUTTER: return [e.x, e.q === 3 ? e.y + 4 * ONE * k : e.q === 0 ? Math.min((270 + 80) * ONE, e.y + 3 * ONE * k) : e.y];   // leaving, it comes down through the screen
    case TWINVEC: return [e.x, e.q === 2 ? e.y + 4 * ONE * k : e.q === 0 ? Math.min(L2_TWIN_Y * ONE, e.y + 4 * ONE * k) : e.y];
    default: return [e.x, e.y];
  }
}
const nemesisPlate = (e, s) => { const a = L2_NEMESIS_ARMOUR, dx = Math.abs(s.x - e.x), dy = s.y - e.y; return e.st === 0 && dx >= a[0] * ONE && dx <= a[1] * ONE && dy >= a[2] * ONE && dy <= a[3] * ONE; };

// ---------- hooks the engine calls ----------
export const LEG2 = Object.freeze({
  schedule, obstacles: legOneObstacles, init, before, move, boss, bossType, danger, predict,
  /** Where to aim at e, px to one side: Argus, the open eye nearest the ship; a shut pod that is not about to open is
   *  not worth getting under (the offset puts it out of reach of a pilot's choice). */
  aim(sim, e) {
    if (e.type === SHUTTER) return e.q === 2 || (e.q === 1 && e.qd <= L2_SHUT_WARN) ? 0 : 2000;
    if (e.type !== ARGUS) return 0;
    let best = 0, bd = 1e9;
    for (let i = 0; i < L2_EYES; i++) if (sim.l2.eyes >> i & 1) { const d = Math.abs(px(sim.px) - px(e.x) - eyeOff(i)); if (d < bd) { bd = d; best = eyeOff(i); } }
    return best;
  },
  /** The gold arrow's one turn (see arrows()). */
  bend(sim, a, isShot) {
    if (isShot || !a.tt || --a.tt > 0) return;
    const ang = angleOf(a.tx - a.x, a.ty - a.y);
    a.vx = COS[ang] * L2_GOLD_SPEED; a.vy = SIN[ang] * L2_GOLD_SPEED;
  },
  /** Is this shot stopped by e? A shut pod; Argus anywhere but an open eye; Nemesis's plates (which count what they stop). */
  blocks(sim, e, s) {
    if (e.type === SHUTTER) return e.q !== 2 && near(s.x, s.y, e.x, e.y, KIND[SHUTTER].r + SHOT_R);
    if (e.type === ARGUS) {
      if (!near(s.x, s.y, e.x, e.y, KIND[ARGUS].r + SHOT_R)) return false;
      for (let i = 0; i < L2_EYES; i++) if (sim.l2.eyes >> i & 1 && Math.abs(s.x - e.x - eyeOff(i) * ONE) <= (L2_EYE_HALF + SHOT_R) * ONE) return false;
      return true;
    }
    if (e.type === NEMESIS && nemesisPlate(e, s)) { sim.l2.ret = Math.min(L2_NEMESIS_CAP, sim.l2.ret + 1); return true; }
    return false;
  },
  hazard(sim, bodyR) { return danger(sim, sim.px, sim.py, bodyR, 0); },
  scale(sim, e, dmg) { return dmg; },
  hash(sim, h) {
    const L = sim.l2;
    h.mixAll([L.nextSky, L.guarded, L.wakes, L.rows, L.eyes, L.side, L.swapTo, L.coneDue, L.apples, L.ret, L.rings, L.zones.length, L.rams.length]);
    for (const z of L.zones) h.mixAll([z.k, z.x, z.y, z.a, z.len, z.from, z.to]);
    for (const [id, x, y] of L.rams) h.mixAll([id, x, y]);
    if (L.apple) h.mixAll([L.apple.x, L.apple.y, L.apple.pw, L.apple.bt]);
    for (const b of sim.bullets) if (b.tt) h.mixAll([b.tt, b.tx, b.ty]);
  },
});

export const GAME2 = Object.freeze({
  id: 'sky-talon-leg2', version: 3, maxTicks: MAX_TICKS, maxChoices: SUPPLIES,
  createSim: seed => createSim(seed, LEG2), step, phase, choose, score, stateHash, scoreBreakdown,
});
