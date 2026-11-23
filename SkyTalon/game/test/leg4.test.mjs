// Leg four (gdd/05 「第十四版」): determinism, fairness and the rules of its machines, mid-bosses and bosses. The first
// test is the one that says loading leg four changes nothing in the other legs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playMatch, verify, ONE, angleOf } from '../src/sim/core/index.js';
import { GAME, KIND, SCRIPT, sectionAt, step, phase, choose, UNIT_TICKS, WORLD_W, PLAYER_R, PLAYER_MIN_Y, PLAYER_MAX_Y, PLAYER_MARGIN_X, STAGE_FLOOR_PCT, isBoss, isMid } from '../src/sim/sim.js';
import { GAME6 } from '../src/sim/leg6.js';
import { GAME2 } from '../src/sim/leg2.js';
import { GAME3 } from '../src/sim/leg3.js';
import {
  GAME4, LEG4, schedule, danger, riverY, safeLanes, laneOf, proteusForm, METRONOME, SCOUT, BEAST, BUOY, REVENANT, HUSK, ARM, FERRY, HEEL, L4_MIDS, L4_BOSSES, L4_ROSTER,
  BRONTES, BRIAREUS, CIRCE, MNEMOSYNE, TRITON, PROTEUS, CHARON, STYX,
  L4_BEAT, L4_SCOUT_RIPEN, L4_WAND, L4_HUSK_TICKS, L4_REV_RISEN_HP, L4_BOLT_W, L4_ARM_PASS, L4_HEEL_PASS, L4_FERRY_WARN, L4_FERRY_RUN, L4_FERRY_DROP, L4_FERRY_PERIOD,
  L4_TRITON_PERIOD, L4_TRITON_WARN, L4_TRITON_N, L4_MNEMO_FROM, L4_LANE_W, L4_RIVER_Y, L4_RIVER_AMP, L4_RIVER_W, L4_RAIN_R,
} from '../src/sim/leg4.js';
import { STRATEGIES } from '../tools/strategies.mjs';

const play = role => Object.values(STRATEGIES).find(s => s.role === role).policy;
const STRONG = play('strong'), SIMPLE = play('simple');
const GOLDEN4 = { game: 'sky-talon-leg4', version: 2, seed: 1234, ticks: 22197, score: 49116, hash: 57143342 };
const bare = (seed = 5) => {
  const sim = GAME4.createSim(seed);
  while (phase(sim) === 'choice') choose(sim, 0);
  sim.plan = []; sim.nextSpawn = 0; sim.rocks = []; sim.l4.sky = []; sim.skip = 10 * UNIT_TICKS; sim.gear = sim.gear.map(() => 0); sim.barrier = 0;
  return sim;
};
const enemy = (sim, type, x, y, extra = {}) => { const e = { id: sim.nextId++, type, x: x * ONE, y: y * ONE, hp: KIND[type].hp, t: 0, ax: x * ONE, aux: 0, vx: 0, pk: 0, pv: 0, pw: 0, a: 64, bt: 0, bm: 0, dr: 0, sh: 0, el: 0, ac: 0, q: 0, qd: 0, st: 0, stun: 0, shd: 0, idle: 0, refills: 0, ch: 0, cw: 0, ...extra }; sim.enemies.push(e); return e; };
const OPTS = { sig: false, rage: false, P: p => p, D: p => p };
const hold = sim => { sim.invuln = 5; step(sim, 0); };
const shoot = (sim, e, dmg = 1) => { sim.enemies.forEach(o => { o.idle = 0; }); LEG4.scale(sim, e, dmg) > 0 && (e.hp -= dmg); };

test('leg four does not touch the other legs: legs one, two, three and six play their golden matches', () => {
  assert.deepEqual(playMatch(GAME, 1234, STRONG).result(), { game: 'sky-talon', version: 12, seed: 1234, ticks: 19803, score: 53902, hash: 2439202323 });
  assert.deepEqual(playMatch(GAME6, 1234, STRONG).result(), { game: 'sky-talon-leg6', version: 3, seed: 1234, ticks: 20992, score: 55213, hash: 873819208 });
  assert.deepEqual(playMatch(GAME2, 1234, STRONG).result(), { game: 'sky-talon-leg2', version: 3, seed: 1234, ticks: 19404, score: 48660, hash: 24234368 });
  assert.deepEqual(playMatch(GAME3, 1234, STRONG).result(), { game: 'sky-talon-leg3', version: 2, seed: 1234, ticks: 20989, score: 46734, hash: 1933554312 });
});

test('leg four: same seed + same inputs => identical result; golden match; an uploaded match verifies', () => {
  const a = playMatch(GAME4, 1234, STRONG).result();
  assert.deepEqual(a, playMatch(GAME4, 1234, STRONG).result());
  assert.deepEqual(a, GOLDEN4);
  const up = playMatch(GAME4, 98765, SIMPLE).upload();
  assert.equal(verify(GAME4, up).valid, true);
  assert.equal(verify(GAME4, { ...up, score: up.score + 10 }).valid, false);
});

test('leg four: the schedule depends only on the seed; each chapter brings its one new machine, first seen alone', () => {
  assert.deepEqual(schedule(77), schedule(77));
  assert.notDeepEqual(schedule(77), schedule(78));
  for (const t of [...L4_MIDS, ...L4_BOSSES]) assert.equal(isBoss(t), true);
  assert.deepEqual(L4_MIDS.map(isMid), [true, true, true, true]);
  const plan = schedule(77), chapterOf = p => SCRIPT[sectionAt(p.at)].chapter;
  L4_ROSTER.forEach(([fresh], c) => {
    const mine = plan.filter(p => p.type === fresh);
    assert.equal(Math.min(...mine.map(chapterOf)), c, `${KIND[fresh].name} first comes in chapter ${c + 1}`);
    const unit = Math.floor(Math.min(...mine.map(p => p.at)) / UNIT_TICKS);
    assert.deepEqual([...new Set(plan.filter(p => Math.floor(p.at / UNIT_TICKS) === unit).map(p => p.type))], [fresh], 'alone in its first unit');
  });
});

test('leg four: a metronome gunboat lights three beats and fires on the fourth', () => {
  const sim = bare(), e = enemy(sim, METRONOME, 600, 220, { q: 1, qd: 0 });
  sim.px = 100 * ONE; sim.py = 1000 * ONE;
  const fired = [];
  for (let i = 0; i < 4 * L4_BEAT; i++) { const n = sim.bullets.length; hold(sim); if (sim.bullets.length > n) fired.push(e.qd); }
  assert.deepEqual(fired, [3 * L4_BEAT]);
  assert.equal(sim.bullets.filter(b => b.c === 26).length, 3);
});

test('leg four: a scout left alone turns into the beast; the wand turns the nearest scout after its warning', () => {
  const sim = bare(), s = enemy(sim, SCOUT, 600, 100);
  sim.px = 100 * ONE;
  for (let i = 0; i < L4_SCOUT_RIPEN - 1; i++) hold(sim);
  assert.equal(s.type, SCOUT);
  hold(sim);
  assert.equal(s.type, BEAST);
  const s2 = bare(), c = enemy(s2, CIRCE, 360, 220), far = enemy(s2, SCOUT, 640, 200), close = enemy(s2, SCOUT, 420, 260);
  s2.px = 100 * ONE;
  LEG4.boss(s2, c, 70, OPTS);
  assert.equal(s2.l4.charmId, close.id, 'the nearest one');
  for (let i = 0; i < L4_WAND; i++) hold(s2);
  assert.equal(close.type, BEAST);
  assert.equal(far.type, SCOUT);
});

test('leg four: a sonar buoy rings with its gap straight down', () => {
  const sim = bare(), e = enemy(sim, BUOY, 360, 250, { q: 1, qd: 99 });
  sim.px = 100 * ONE; hold(sim);
  const ring = sim.bullets.filter(b => b.c === 27);
  assert.equal(ring.length, 10);
  for (const b of ring) assert.ok(Math.abs(((angleOf(b.vx, b.vy) - 64 + 128) & 255) - 128) > 8, 'nothing straight down');
  assert.ok(e.hp > 0);
});

test('leg four: a revenant leaves a husk that rises once unless it is shot; risen, it falls for good', () => {
  const sim = bare(), e = enemy(sim, REVENANT, 360, 300);
  sim.px = 100 * ONE;
  assert.equal(LEG4.scale(sim, e, KIND[REVENANT].hp), 0);
  assert.equal(e.type, HUSK);
  assert.equal(sim.kills, 1, 'the fall counts');
  for (let i = 0; i < L4_HUSK_TICKS; i++) hold(sim);
  assert.equal(e.type, REVENANT);
  assert.equal(e.hp, L4_REV_RISEN_HP);
  assert.equal(LEG4.scale(sim, e, L4_REV_RISEN_HP), L4_REV_RISEN_HP, 'risen: no second husk');
  const s2 = bare(), f = enemy(s2, REVENANT, 360, 300);
  LEG4.scale(s2, f, 9);
  assert.equal(LEG4.scale(s2, f, 1), 1, 'a husk takes the shot and goes');
  assert.equal(KIND[HUSK].ground, 1, 'harmless to touch');
});

test("leg four: Brontes's lightning falls on the stripe laid at the first beat, not on the ship", () => {
  const sim = bare(), e = enemy(sim, BRONTES, 360, 220);
  sim.px = 200 * ONE; sim.py = 1000 * ONE;
  LEG4.boss(sim, e, 0, OPTS);
  const z = sim.l4.zones[0];
  assert.equal(z.x, 200 * ONE);
  assert.equal(z.w, L4_BOLT_W);
  assert.equal(z.from - sim.tick, 3 * L4_BEAT);
  sim.px = 400 * ONE;
  assert.equal(danger(sim, sim.px, sim.py, PLAYER_R, 3 * L4_BEAT), false, 'moved away: safe');
  assert.equal(danger(sim, 200 * ONE, sim.py, PLAYER_R, 3 * L4_BEAT), true);
});

test("leg four: Briareus's four arms; an arm passes some of its hurt on; an arm gone takes its fire with it", () => {
  const sim = bare(), b = enemy(sim, BRIAREUS, 360, 220);
  LEG4.boss(sim, b, 0, OPTS);
  const arms = sim.enemies.filter(e => e.type === ARM);
  assert.equal(arms.length, 4);
  const hp = b.hp;
  for (let i = 0; i < 20; i++) LEG4.scale(sim, arms[0], 1);
  assert.equal(hp - b.hp, Math.floor((20 * L4_ARM_PASS) / 100));
  sim.px = 360 * ONE; sim.py = 1000 * ONE;
  for (const a of arms.slice(1)) a.hp = 0;
  hold(sim);
  let fans = 0;
  for (let i = 0; i < 300; i++) { const n = sim.bullets.filter(x => x.c === 26).length; hold(sim); if (sim.bullets.filter(x => x.c === 26).length > n) fans++; }
  assert.equal(fans, 2, 'one arm: one fan each 150 ticks');
});

test("leg four: Mnemosyne's four lanes start next to the ship, step a lane at most and end next to where they began; the replay repeats them", () => {
  for (let n = 0; n < 50; n++) for (const from of [0, 1, 2, 3]) {
    const l = safeLanes(99, n, from);
    assert.ok(Math.abs(l[0] - from) <= 1);
    for (let s = 1; s < 4; s++) assert.ok(Math.abs(l[s] - l[s - 1]) <= 1);
    assert.ok(Math.abs(l[3] - l[0]) <= 1);
  }
  const sim = bare(), e = enemy(sim, MNEMOSYNE, 360, 220);
  sim.px = 100 * ONE; sim.py = 1000 * ONE;
  const safe = [];
  for (let t = 0; t < 700; t++) {
    LEG4.boss(sim, e, t, OPTS);
    for (const ev of sim.events.splice(0)) if (ev.type === 'zoneUp' && ev.k === 1) safe.push(ev.x);
    sim.tick++;
  }
  const rounds = [];
  for (let i = 0; i + 3 <= safe.length; i += 3) rounds.push([0, 1, 2, 3].find(l => !safe.slice(i, i + 3).map(x => laneOf(x * ONE)).includes(l)));
  assert.equal(rounds.length, 8);
  assert.deepEqual(rounds.slice(4), rounds.slice(0, 4), 'the replay is the same four');
  assert.ok(Math.abs(rounds[0] - laneOf(100 * ONE)) <= 1);
});

test("leg four: Triton's ring leaves out the gap it showed first", () => {
  const sim = bare(), e = enemy(sim, TRITON, 360, 220);
  LEG4.boss(sim, e, L4_TRITON_PERIOD - L4_TRITON_WARN, OPTS);
  const up = sim.events.find(ev => ev.type === 'tritonGap');
  assert.ok(up && up.ticks === L4_TRITON_WARN);
  LEG4.boss(sim, e, L4_TRITON_PERIOD, OPTS);
  const ring = sim.bullets.filter(b => b.c === 27), gone = [];
  for (let k = 0; k < L4_TRITON_N; k++) { const a = Math.floor((k * 256) / L4_TRITON_N); if (!ring.some(b => Math.abs(((angleOf(b.vx, b.vy) - a + 128) & 255) - 128) <= 2)) gone.push(k); }
  assert.deepEqual(gone, [0, 1, 2, 3].map(i => (up.g + i) % L4_TRITON_N));
});

test('leg four: Proteus shows a form per stage and his own once half his core is gone', () => {
  const full = KIND[PROTEUS].hp, core = Math.trunc((full * STAGE_FLOOR_PCT[1]) / 100);
  assert.equal(proteusForm({ st: 0, hp: full }), 0);
  assert.equal(proteusForm({ st: 1, hp: full }), 1);
  assert.equal(proteusForm({ st: 2, hp: core }), 2);
  assert.equal(proteusForm({ st: 2, hp: core >> 1 }), 3);
});

test("leg four: Charon's boat shot before it lands sets nobody down; one that lands sets down three", () => {
  for (const shot of [true, false]) {
    const sim = bare(), c = enemy(sim, CHARON, 360, 220);
    sim.px = 360 * ONE; sim.py = 1200 * ONE;
    LEG4.boss(sim, c, L4_FERRY_PERIOD, OPTS);
    for (let i = 0; i < L4_FERRY_WARN; i++) hold(sim);
    const f = sim.enemies.find(e => e.type === FERRY);
    assert.ok(f, 'out after its warning');
    if (shot) f.hp = 0;
    for (let i = 0; i < L4_FERRY_RUN + 2; i++) hold(sim);
    assert.equal(sim.enemies.filter(e => e.type === REVENANT).length, shot ? 0 : L4_FERRY_DROP);
  }
});

test('leg four: Styx takes nothing but through her heel, half as much again; the river hurts and never reaches below y 900', () => {
  const sim = bare(), s = enemy(sim, STYX, 360, 220);
  LEG4.boss(sim, s, 0, OPTS);
  const heel = sim.enemies.find(e => e.type === HEEL);
  assert.ok(heel);
  assert.equal(LEG4.scale(sim, s, 5), 0);
  const hp = s.hp;
  for (let i = 0; i < 10; i++) LEG4.scale(sim, heel, 1);
  assert.equal(hp - s.hp, Math.floor((10 * L4_HEEL_PASS) / 100));
  assert.equal(danger(sim, 360 * ONE, riverY(sim, 360), PLAYER_R, 0), true);
  for (let k = 0; k < 256; k += 7) for (let x = PLAYER_MARGIN_X; x <= WORLD_W - PLAYER_MARGIN_X; x += 30) assert.equal(danger(sim, x * ONE, 900 * ONE, PLAYER_R, k), false);
  assert.ok(L4_RIVER_Y + L4_RIVER_AMP + (L4_RIVER_W >> 1) + PLAYER_R < 900);
});

test('leg four no forced hit: the river and the rain of circles together leave room, and the room is on the screen', () => {
  const sim = bare(), e = enemy(sim, STYX, 360, 220, { st: 2 });
  LEG4.boss(sim, e, 0, OPTS);
  LEG4.boss(sim, e, 60, { ...OPTS, sig: true, rage: true });
  const c = sim.l4.zones.filter(z => z.k === 3);
  assert.ok(c.length >= 10);
  for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) assert.ok(Math.hypot(c[i].x - c[j].x, c[i].y - c[j].y) / ONE >= 200);
  for (const k of [c[0].from - sim.tick, c[c.length - 1].from - sim.tick]) {
    let safe = false;
    for (let y = PLAYER_MIN_Y; y <= PLAYER_MAX_Y && !safe; y += 20) for (let x = PLAYER_MARGIN_X; x <= WORLD_W - PLAYER_MARGIN_X; x += 20) if (!danger(sim, x * ONE, y * ONE, PLAYER_R, k)) { safe = true; break; }
    assert.ok(safe && L4_RAIN_R < 100);
  }
});

test('leg four no forced hit: every stripe of Mnemosyne leaves its lane open, rows and all', () => {
  const sim = bare(), e = enemy(sim, MNEMOSYNE, 360, 220, { st: 2 });
  sim.px = 600 * ONE; sim.py = 1000 * ONE;
  for (let t = 0; t < 720; t++) {
    LEG4.boss(sim, e, t, { ...OPTS, sig: true, rage: true });
    sim.tick++;
    for (let i = sim.l4.zones.length - 1; i >= 0; i--) if (sim.l4.zones[i].to <= sim.tick) sim.l4.zones.splice(i, 1);
    let safe = false;
    for (let y = PLAYER_MIN_Y; y <= PLAYER_MAX_Y && !safe; y += 10) for (let x = PLAYER_MARGIN_X; x <= WORLD_W - PLAYER_MARGIN_X; x += 10) if (!danger(sim, x * ONE, y * ONE, PLAYER_R, 0)) { safe = true; break; }
    assert.ok(safe, `room at tick ${t}`);
  }
  assert.equal(L4_LANE_W * 4, WORLD_W);
  assert.ok(L4_MNEMO_FROM > 0);
});
