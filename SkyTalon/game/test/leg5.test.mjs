// Leg five (gdd/05 「第十五版」): determinism, fairness, the small hit circle, and the rules of its machines, mid-bosses and
// bosses. The first test is the one that says loading leg five changes nothing in the other legs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playMatch, verify, ONE, angleOf } from '../src/sim/core/index.js';
import { GAME, KIND, SCRIPT, sectionAt, step, phase, choose, UNIT_TICKS, WORLD_W, PLAYER_R, PLAYER_MIN_Y, PLAYER_MAX_Y, PLAYER_MARGIN_X, isBoss, isMid } from '../src/sim/sim.js';
import { GAME6 } from '../src/sim/leg6.js';
import { GAME2 } from '../src/sim/leg2.js';
import { GAME3 } from '../src/sim/leg3.js';
import { GAME4 } from '../src/sim/leg4.js';
import {
  GAME5, LEG5, schedule, danger, eyeAt, gateOf, PROMSKIFF, FLARESKIFF, SLOWSHIP, TALISMAN, L5_MIDS, L5_BOSSES, L5_ROSTER,
  PHAETHON, HELIOS, HYPERION, ZHUYIN, HUNDUN, YATA, TORII, SOLAR, SLOWB, TALIS, PETAL,
  L5_SMALL_R, L5_PROM_WARN, L5_FLARE_WARN, L5_SHADE_X, L5_SHADE_W, L5_SLOW_N, L5_STRIPE_W, L5_STRIPE_WARN, L5_NIGHT_WARN, L5_STOP, L5_EYES, L5_EYE_PERIOD,
  L5_THREAD_WARN, L5_CONE_WARN, L5_CONE_REACH, L5_RAIN_R, L5_HELIOS_PROM, L5_PROM_R, L5_PROM_OUT,
} from '../src/sim/leg5.js';
import { STRATEGIES } from '../tools/strategies.mjs';

const play = role => Object.values(STRATEGIES).find(s => s.role === role).policy;
const STRONG = play('strong'), SIMPLE = play('simple');
const GOLDEN5 = { game: 'sky-talon-leg5', version: 4, seed: 1234, ticks: 31313, score: 38467, hash: 643017539 };
const bare = (seed = 5, chapter = 0) => {
  const sim = GAME5.createSim(seed);
  while (phase(sim) === 'choice') choose(sim, 0);
  sim.plan = []; sim.nextSpawn = 0; sim.rocks = []; sim.l5.sky = []; sim.skip = 10 * UNIT_TICKS; sim.gear = sim.gear.map(() => 0); sim.barrier = 0; sim.chapter = chapter;
  return sim;
};
const enemy = (sim, type, x, y, extra = {}) => { const e = { id: sim.nextId++, type, x: x * ONE, y: y * ONE, hp: KIND[type].hp, t: 0, ax: x * ONE, aux: 0, vx: 0, pk: 0, pv: 0, pw: 0, a: 64, bt: 0, bm: 0, dr: 0, sh: 0, el: 0, ac: 0, q: 0, qd: 0, st: 0, stun: 0, shd: 0, idle: 0, refills: 0, ch: 0, cw: 0, ...extra }; sim.enemies.push(e); return e; };
const OPTS = { sig: false, rage: false, P: p => p, D: p => p };
const hold = sim => { sim.invuln = 5; step(sim, 0); };
const roomHasSafe = (sim, k) => {
  for (let y = PLAYER_MIN_Y; y <= PLAYER_MAX_Y; y += 10) for (let x = PLAYER_MARGIN_X; x <= WORLD_W - PLAYER_MARGIN_X; x += 10) if (!danger(sim, x * ONE, y * ONE, PLAYER_R, k)) return true;
  return false;
};

test('leg five does not touch the other legs: legs one, two, three, four and six play their golden matches', () => {
  assert.deepEqual(playMatch(GAME, 1234, STRONG).result(), { game: 'sky-talon', version: 13, seed: 1234, ticks: 20204, score: 54425, hash: 4263489266 });
  assert.deepEqual(playMatch(GAME6, 1234, STRONG).result(), { game: 'sky-talon-leg6', version: 5, seed: 1234, ticks: 23198, score: 57259, hash: 45493420 });
  assert.deepEqual(playMatch(GAME2, 1234, STRONG).result(), { game: 'sky-talon-leg2', version: 4, seed: 1234, ticks: 19792, score: 54909, hash: 1116054496 });
  assert.deepEqual(playMatch(GAME3, 1234, STRONG).result(), { game: 'sky-talon-leg3', version: 3, seed: 1234, ticks: 21230, score: 49713, hash: 1066595090 });
  assert.deepEqual(playMatch(GAME4, 1234, STRONG).result(), { game: 'sky-talon-leg4', version: 3, seed: 1234, ticks: 25142, score: 48505, hash: 1487769243 });
});

test('leg five: same seed + same inputs => identical result; golden match; an uploaded match verifies', () => {
  const a = playMatch(GAME5, 1234, STRONG).result();
  assert.deepEqual(a, playMatch(GAME5, 1234, STRONG).result());
  assert.deepEqual(a, GOLDEN5);
  const up = playMatch(GAME5, 98765, SIMPLE).upload();
  assert.equal(verify(GAME5, up).valid, true);
  assert.equal(verify(GAME5, { ...up, score: up.score + 10 }).valid, false);
});

test('leg five: the schedule depends only on the seed; each chapter brings its one new machine, first seen alone', () => {
  assert.deepEqual(schedule(77), schedule(77));
  assert.notDeepEqual(schedule(77), schedule(78));
  for (const t of [...L5_MIDS, ...L5_BOSSES]) assert.equal(isBoss(t), true);
  assert.deepEqual(L5_MIDS.map(isMid), [true, true, true, true]);
  const plan = schedule(77), chapterOf = p => SCRIPT[sectionAt(p.at)].chapter;
  L5_ROSTER.forEach(([fresh], c) => {
    const mine = plan.filter(p => p.type === fresh);
    assert.equal(Math.min(...mine.map(chapterOf)), c, `${KIND[fresh].name} first comes in chapter ${c + 1}`);
    const unit = Math.floor(Math.min(...mine.map(p => p.at)) / UNIT_TICKS);
    assert.deepEqual([...new Set(plan.filter(p => Math.floor(p.at / UNIT_TICKS) === unit).map(p => p.type))], [fresh], 'alone in its first unit');
  });
  assert.ok(plan.filter(p => p.type === TALISMAN).every((p, i, all) => all.filter(q => q.at === p.at).length === 2), 'talisman pillars come in pairs');
});

test('leg five: a prominence hurts only after its path has been drawn for 87 ticks', () => {
  const sim = bare(), e = enemy(sim, PROMSKIFF, 600, 220, { q: 1, qd: 59 });
  sim.px = 100 * ONE; sim.py = 800 * ONE;
  hold(sim);
  const z = sim.l5.zones.find(z => z.k === 3);
  assert.ok(z && z.from - z.at === L5_PROM_WARN);
  const onArc = [z.x / ONE + (z.x < 0 ? 1 : -1) * L5_PROM_R, z.y / ONE];
  assert.equal(danger(sim, onArc[0] * ONE, onArc[1] * ONE, PLAYER_R, 0), false, 'not yet');
  assert.equal(danger(sim, onArc[0] * ONE, onArc[1] * ONE, PLAYER_R, z.from - sim.tick), true);
  assert.equal(Math.abs(z.x / ONE - (z.x < 0 ? -L5_PROM_OUT : WORLD_W + L5_PROM_OUT)), 0);
  assert.ok(e.hp > 0);
});

test('leg five: a flare spares only the ground under the shade pillars; one counts down at a time; shot down, it is called off', () => {
  const sim = bare(), a = enemy(sim, FLARESKIFF, 600, 200, { q: 1, qd: 29 }), b = enemy(sim, FLARESKIFF, 120, 200, { q: 1, qd: 29 });
  sim.px = 360 * ONE; sim.py = 1000 * ONE;
  hold(sim);
  const flares = sim.l5.zones.filter(z => z.k === 4);
  assert.equal(flares.length, 1, 'one at a time');
  const k = flares[0].from - sim.tick;
  assert.equal(k, L5_FLARE_WARN - 1);
  for (const s of L5_SHADE_X) assert.equal(danger(sim, s * ONE, 1000 * ONE, PLAYER_R, k), false, 'under a pillar');
  assert.equal(danger(sim, (L5_SHADE_X[0] + L5_SHADE_W) * ONE, 1000 * ONE, PLAYER_R, k), true, 'between pillars');
  const by = sim.l5.flareBy === a.id ? a : b;
  by.hp = 0; hold(sim);
  assert.equal(sim.l5.zones.filter(z => z.k === 4).length, 0, 'called off');
});

test('leg five: a slow mothership rings sixteen at a pixel and a half; talisman pillars fire flat across', () => {
  const sim = bare(), m = enemy(sim, SLOWSHIP, 600, 200, { t: 159 });
  sim.px = 100 * ONE; hold(sim);
  const ring = sim.bullets.filter(b => b.c === SLOWB);
  assert.equal(ring.length, L5_SLOW_N);
  for (const b of ring) assert.ok(Math.abs(Math.hypot(b.vx, b.vy) / ONE - 1.5) < 0.05);
  const s2 = bare(), t = enemy(s2, TALISMAN, 40, 300, { t: 59 });
  s2.px = 360 * ONE; hold(s2);
  const tb = s2.bullets.find(b => b.c === TALIS);
  assert.ok(tb && tb.vy === 0 && tb.vx > 0);
  assert.ok(m.hp > 0 && t.hp > 0);
});

test('leg five: the small hit circle: in the black hole only a bullet within 4 px hits, and the graze still counts; not before', () => {
  const graze = ch => {
    const sim = bare(5, ch);
    sim.px = 360 * ONE; sim.py = 1000 * ONE; sim.invuln = 0;
    sim.bullets.push({ x: (360 + 12) * ONE, y: 990 * ONE, vx: 0, vy: 0, grazed: 0 }, { x: 100 * ONE, y: 300 * ONE, vx: 0, vy: 0, grazed: 0 });
    const hits = sim.hits, grazes = sim.grazes;
    step(sim, 0);
    return [sim.hits - hits, sim.grazes - grazes];
  };
  assert.deepEqual(graze(0), [1, 0], 'chapter one: the usual circle');
  assert.deepEqual(graze(2), [0, 1], 'chapter three: passes, grazes');
  const sim = bare(5, 2);
  sim.px = 360 * ONE; sim.py = 1000 * ONE; sim.invuln = 0;
  sim.bullets.push({ x: 362 * ONE, y: 1000 * ONE, vx: 0, vy: 0, grazed: 0 }, { x: 100 * ONE, y: 300 * ONE, vx: 0, vy: 0, grazed: 0 });
  step(sim, 0);
  assert.equal(sim.hits, 1, 'within 4 px it hits');
  assert.ok(L5_SMALL_R < PLAYER_R);
});

test('leg five: Phaethon drops fire straight down only', () => {
  const sim = bare(), e = enemy(sim, PHAETHON, 360, 220);
  for (let t = 1; t <= 48; t++) LEG5.boss(sim, e, t, OPTS);
  const fire = sim.bullets.filter(b => b.c === SOLAR);
  assert.ok(fire.length >= 4);
  for (const b of fire) assert.equal(angleOf(b.vx, b.vy), 64);
});

test("leg five: Helios's two prominences leave a way between them; its turning cone keeps to its reach", () => {
  const sim = bare(), e = enemy(sim, HELIOS, 360, 220);
  sim.py = 800 * ONE;
  LEG5.boss(sim, e, 120, OPTS);
  const arcs = sim.l5.zones.filter(z => z.k === 3);
  assert.equal(arcs.length, 2);
  const k = arcs[0].from - sim.tick;
  let room = 0;
  for (let x = 0; x <= WORLD_W; x += 4) if (!danger(sim, x * ONE, sim.py, PLAYER_R, k)) room++;
  assert.ok(room * 4 >= 240, 'a way of 240 or more');
  const s2 = bare(), h = enemy(s2, HELIOS, 360, 220, { st: 2 });
  LEG5.boss(s2, h, 60, { ...OPTS, sig: true, rage: true });
  const cone = s2.l5.zones.find(z => z.k === 5);
  assert.ok(cone && cone.from - s2.tick === L5_CONE_WARN);
  for (let t = 0; t < cone.to - cone.from; t += 5) assert.equal(danger(s2, 360 * ONE, (220 + L5_CONE_REACH + 40) * ONE, PLAYER_R, cone.from - s2.tick + t), false, 'beyond its reach');
});

test("leg five no forced hit: Hyperion's three sets of stripes each leave room, and each set's room meets the next one's", () => {
  const sim = bare(), e = enemy(sim, HYPERION, 360, 220);
  for (let t = 0; t <= 2 * L5_STRIPE_WARN; t++) { LEG5.boss(sim, e, t, OPTS); sim.tick++; }
  sim.tick -= 2 * L5_STRIPE_WARN + 1;
  const sets = [...new Set(sim.l5.zones.filter(z => z.k === 2).map(z => z.from))];
  assert.equal(sets.length, 3);
  assert.ok(sim.l5.zones.filter(z => z.k === 2).every(z => z.w === L5_STRIPE_W));
  for (let s = 0; s < 3; s++) assert.ok(roomHasSafe(sim, sets[s] - sim.tick), `set ${s}`);
  for (let s = 0; s < 2; s++) {
    let both = false;
    for (let y = PLAYER_MIN_Y; y <= PLAYER_MAX_Y && !both; y += 10) for (let x = PLAYER_MARGIN_X; x <= WORLD_W - PLAYER_MARGIN_X; x += 10) if (!danger(sim, x * ONE, y * ONE, PLAYER_R, sets[s] - sim.tick) && !danger(sim, x * ONE, y * ONE, PLAYER_R, sets[s + 1] - sim.tick)) { both = true; break; }
    assert.ok(both, `sets ${s} and ${s + 1} share room`);
  }
});

test("leg five: Zhuyin's night: everything stops, then sets out, slower, at where the ship was", () => {
  const sim = bare(5, 2), e = enemy(sim, ZHUYIN, 360, 220);
  sim.px = 200 * ONE; sim.py = 1000 * ONE;
  sim.bullets.push({ x: 500 * ONE, y: 500 * ONE, vx: 0, vy: 4 * ONE, grazed: 0 });
  LEG5.boss(sim, e, 300, OPTS);
  for (let i = 0; i < L5_NIGHT_WARN; i++) hold(sim);
  const b = sim.bullets.find(b => b.x === 500 * ONE && b.nvx !== undefined) ?? sim.bullets[0];
  const y0 = b.y;
  hold(sim);
  assert.equal(b.y, y0, 'stopped');
  sim.px = 600 * ONE;
  for (let i = 0; i < L5_STOP; i++) hold(sim);
  const a = angleOf(b.vx, b.vy), want = angleOf(200 * ONE - 500 * ONE, 1000 * ONE - y0);
  assert.ok(Math.abs(((a - want + 128) & 255) - 128) <= 2, 'at where the ship was when it stopped');
  assert.ok(Math.hypot(b.vx, b.vy) / ONE <= 2.01, 'half as fast');
});

test("leg five: Hundun's life gate does not fire and moves one eye on each volley", () => {
  const sim = bare(5, 2), e = enemy(sim, HUNDUN, 360, 220);
  LEG5.boss(sim, e, 0, OPTS);
  const g0 = gateOf(sim.l5, 0);
  LEG5.boss(sim, e, 45, OPTS);
  const shots = sim.bullets.filter(b => b.c === SLOWB);
  assert.equal(shots.length, (L5_EYES - 1) * 3);
  const [gx, gy] = eyeAt(45, g0);
  assert.ok(!shots.some(b => b.x === gx && b.y === gy), 'nothing from the gate');
  assert.equal(gateOf(sim.l5, 1), (g0 + 1) % L5_EYES);
  for (let i = 0; i < L5_EYES; i++) for (let t = 0; t < 1200; t += 50) { const [x, y] = eyeAt(t, i); assert.ok(Math.hypot(x / ONE - 360, y / ONE - 730) >= 300 || x / ONE < 40 || x / ONE > 680 || y / ONE < 100 || y / ONE > 1220); }
  assert.ok(L5_EYE_PERIOD > 0);
});

test("leg five: Yata's two threads cross and leave room; the torii's petals sway the same way for the same seed", () => {
  const sim = bare(5, 3), e = enemy(sim, YATA, 360, 220);
  LEG5.boss(sim, e, 100, OPTS);
  const th = sim.l5.zones.filter(z => z.k === 2);
  assert.equal(th.length, 2);
  assert.equal(th[0].from - sim.tick, L5_THREAD_WARN);
  assert.ok(roomHasSafe(sim, L5_THREAD_WARN));
  const petals = seed => { const s = bare(seed, 3), t = enemy(s, TORII, 360, 220); s.px = 100 * ONE; for (let i = 0; i < 80; i++) { LEG5.boss(s, t, i, OPTS); hold(s); } return s.bullets.filter(b => b.c === PETAL).map(b => [b.x, b.y]); };
  assert.deepEqual(petals(9), petals(9));
  assert.notDeepEqual(petals(9), petals(10));
});

test('leg five no forced hit: the rings of circles leave room among the petals', () => {
  const sim = bare(5, 3), e = enemy(sim, TORII, 360, 220, { st: 2 });
  LEG5.boss(sim, e, 60, { ...OPTS, sig: true, rage: true });
  const c = sim.l5.zones.filter(z => z.k === 1);
  assert.ok(c.length >= 10);
  for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) assert.ok(Math.hypot(c[i].x - c[j].x, c[i].y - c[j].y) / ONE >= 200);
  for (const k of [c[0].from - sim.tick, c[c.length - 1].from - sim.tick]) assert.ok(roomHasSafe(sim, k));
  assert.ok(L5_RAIN_R < 100 && L5_HELIOS_PROM > 0);
});
