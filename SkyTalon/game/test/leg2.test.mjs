// Leg two (gdd/05 「第十二版」): determinism, fairness and the rules of its machines, mid-bosses and bosses. The first
// test is the one that says loading leg two changes nothing in leg one or leg six.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playMatch, verify, ONE, SIN, COS, angleOf } from '../src/sim/core/index.js';
import { GAME, KIND, SCRIPT, sectionAt, step, phase, choose, UNIT_TICKS, WORLD_W, PLAYER_SPEED, PLAYER_R, PLAYER_MIN_Y, PLAYER_MAX_Y, PLAYER_MARGIN_X, isBoss, isMid, DRONE } from '../src/sim/sim.js';
import { GAME6 } from '../src/sim/leg6.js';
import {
  GAME2, LEG2, schedule, danger, ORBITER, SHUTTER, TWINVEC, RAMMER, L2_MIDS, L2_BOSSES, ENDYMION, SELENE, ARGUS, PAN, TWINS, ERIS, NEMESIS, L2_ROSTER,
  L2_SHUT_WARN, L2_SELENE_GAPS, L2_SELENE_PERIOD, L2_SELENE_SLOTS, L2_SELENE_STEP, L2_EYES, L2_EYE_STEP, L2_PIPE_LEN, L2_PIPE_X0, L2_PIPE_STEP, L2_PIPE_DELAY, L2_PIPE_WARN, L2_PIPE_LIVE, L2_PIPE_PERIOD,
  L2_STRIPE_Y, L2_STRIPE_HALF, L2_CONE_WARN, L2_CONE_LIVE, L2_RINGS_GAP, L2_RINGS_PERIOD, L2_NEMESIS_ARMOUR, L2_NEMESIS_CAP, L2_GOLD_SPEED, L2_APPLE_WARN, L2_DISCORD_PTS, L2_BLAST_R, L2_RAM_WARN,
} from '../src/sim/leg2.js';
import { STRATEGIES } from '../tools/strategies.mjs';

const play = role => Object.values(STRATEGIES).find(s => s.role === role).policy;
const STRONG = play('strong'), SIMPLE = play('simple');
const GOLDEN2 = { game: 'sky-talon-leg2', version: 4, seed: 1234, ticks: 19792, score: 54909, hash: 1116054496 };
/** A leg-two sim past its opening supply, with nothing scheduled and no gear: the test puts in what it needs. */
const bare = (seed = 5) => {
  const sim = GAME2.createSim(seed);
  while (phase(sim) === 'choice') choose(sim, 0);
  sim.plan = []; sim.nextSpawn = 0; sim.rocks = []; sim.l2.sky = []; sim.skip = 10 * UNIT_TICKS; sim.gear = sim.gear.map(() => 0); sim.barrier = 0;
  return sim;
};
const enemy = (sim, type, x, y, extra = {}) => { const e = { id: sim.nextId++, type, x: x * ONE, y: y * ONE, hp: KIND[type].hp, t: 0, ax: x * ONE, aux: 0, vx: 0, pk: 0, pv: 0, pw: 0, a: 64, bt: 0, bm: 0, dr: 0, sh: 0, el: 0, ac: 0, q: 0, qd: 0, st: 0, stun: 0, shd: 0, idle: 0, refills: 0, ch: 0, cw: 0, ...extra }; sim.enemies.push(e); return e; };
const OPTS = { sig: false, rage: false, P: p => p, D: p => p };
const shotAt = (x, y) => ({ x: x * ONE, y: y * ONE, vx: 0, vy: 0, left: 0, dmg: 1, hit: [] });

test('leg two does not touch leg one or leg six: with leg two loaded, both play their golden matches', () => {
  assert.deepEqual(playMatch(GAME, 1234, STRONG).result(), { game: 'sky-talon', version: 13, seed: 1234, ticks: 20204, score: 54425, hash: 4263489266 });
  assert.deepEqual(playMatch(GAME6, 1234, STRONG).result(), { game: 'sky-talon-leg6', version: 4, seed: 1234, ticks: 21383, score: 58897, hash: 3556292689 });
  assert.equal(KIND.slice(0, 21).every(k => !k.leg), true, "leg one's kinds are as they were");
});

test('leg two: same seed + same inputs => identical result; golden match; an uploaded match verifies', () => {
  const a = playMatch(GAME2, 1234, STRONG).result();
  assert.deepEqual(a, playMatch(GAME2, 1234, STRONG).result());
  assert.deepEqual(a, GOLDEN2);
  const up = playMatch(GAME2, 98765, SIMPLE).upload();
  assert.equal(verify(GAME2, up).valid, true);
  assert.equal(verify(GAME2, { ...up, score: up.score + 10 }).valid, false);
});

test('leg two: the schedule depends only on the seed; each chapter brings its one new machine, which is first seen alone', () => {
  assert.deepEqual(schedule(77), schedule(77));
  assert.notDeepEqual(schedule(77), schedule(78));
  for (const t of [...L2_MIDS, ...L2_BOSSES]) assert.equal(isBoss(t), true);
  assert.deepEqual(L2_MIDS.map(isMid), [true, true, true, true]);
  const plan = schedule(77), chapterOf = p => SCRIPT[sectionAt(p.at)].chapter;
  L2_ROSTER.forEach(([fresh], c) => {
    const mine = plan.filter(p => p.type === fresh);
    assert.ok(mine.length > 0, `${KIND[fresh].name} comes`);
    assert.equal(Math.min(...mine.map(chapterOf)), c, `${KIND[fresh].name} first comes in chapter ${c + 1}`);
    const unit = Math.floor(Math.min(...mine.map(p => p.at)) / UNIT_TICKS);
    assert.deepEqual([...new Set(plan.filter(p => Math.floor(p.at / UNIT_TICKS) === unit).map(p => p.type))], [fresh], 'alone in its first unit');
  });
  assert.ok(plan.every(p => p.type !== RAMMER || p.y < 0), 'a rammer comes in from above the screen');
});

test('leg two: a shut pod stops shots; an open one is hurt; it cracks before it opens', () => {
  const sim = bare(), e = enemy(sim, SHUTTER, 360, 300, { q: 1, qd: 1000 });
  assert.equal(LEG2.blocks(sim, e, shotAt(360, 310)), true);
  e.q = 2;
  assert.equal(LEG2.blocks(sim, e, shotAt(360, 310)), false);
  assert.equal(LEG2.blocks(sim, e, shotAt(500, 310)), false, 'a shot that misses it is not its business');
  e.q = 1; e.qd = L2_SHUT_WARN + 1;
  sim.px = 100 * ONE; sim.invuln = 5; step(sim, 0);
  assert.ok(sim.events.some(v => v.type === 'shellCrack' && v.ticks === L2_SHUT_WARN));
  // under it with the gun: shut, it takes nothing; open, it goes down
  const s2 = bare(), p = enemy(s2, SHUTTER, 360, 300, { q: 1, qd: 1000 });
  s2.px = 360 * ONE; s2.py = 900 * ONE;
  for (let i = 0; i < 90; i++) { s2.invuln = 5; step(s2, 0); }
  assert.equal(p.hp, KIND[SHUTTER].hp);
  p.q = 2; p.qd = 1000;
  for (let i = 0; i < 90 && p.hp > 0; i++) { s2.invuln = 5; step(s2, 0); }
  assert.ok(p.hp <= 0);
});

test('leg two: Argus is hurt only through an open eye', () => {
  const sim = bare(), e = enemy(sim, ARGUS, 360, 220);
  sim.l2.eyes = 1 << 3;                                       // the middle eye
  assert.equal(LEG2.blocks(sim, e, shotAt(360, 230)), false);
  assert.equal(LEG2.blocks(sim, e, shotAt(360 + 2 * L2_EYE_STEP, 230)), true);
  sim.l2.eyes = 1 << 5;
  assert.equal(LEG2.blocks(sim, e, shotAt(360 + 2 * L2_EYE_STEP, 230)), false);
  assert.equal(LEG2.aim(sim, e), 2 * L2_EYE_STEP, 'the pilots aim at the open eye');
  // three of seven open at a time, the same for the same seed
  const a = bare(9), b = bare(9), ea = enemy(a, ARGUS, 360, 220), eb = enemy(b, ARGUS, 360, 220), masks = [];
  for (let t = 0; t < 1000; t += 37) { LEG2.boss(a, ea, t, OPTS); LEG2.boss(b, eb, t, OPTS); assert.equal(a.l2.eyes, b.l2.eyes); masks.push(a.l2.eyes); }
  assert.ok(masks.every(m => [...Array(L2_EYES).keys()].filter(i => m >> i & 1).length === 3));
  assert.ok(new Set(masks).size > 1, 'the eyes change');
});

test('leg two: a shot-down rammer bursts and the burst carries on to its neighbours; the burst never hurts the ship', () => {
  const sim = bare();
  const r = [300, 380, 460].map(x => enemy(sim, RAMMER, x, 400, { t: L2_RAM_WARN + 5, q: 0 }));
  for (const e of r) e.q = 0;
  sim.px = 380 * ONE; sim.py = 470 * ONE;                     // inside the burst, below the middle one
  sim.invuln = 0;
  const bursts = [];
  for (let i = 0; i < 4; i++) {                               // the middle one goes down (as if shot), the others are within L2_BLAST_R of it
    if (i === 1) r[1].hp = 0;
    r.forEach(e => { e.q = 0; e.t = 0; e.y = 400 * ONE; });
    step(sim, 0); bursts.push(...sim.events.filter(v => v.type === 'burst'));
  }
  assert.ok(bursts.length >= 3 && bursts.some(b => b.link === 2), 'a chain');
  assert.ok(r.every(e => e.hp <= 0));
  assert.equal(sim.hits, 0);
  assert.ok(L2_BLAST_R > 80, 'the three of a group are close enough to carry it on');
});

test("leg two: Selene's gap walks the moon's phases in a fixed order, two slots wide", () => {
  const sim = bare(), e = enemy(sim, SELENE, 360, 220);
  const gaps = [];
  for (let k = 1; k <= 8; k++) {
    sim.bullets.length = 0;
    LEG2.boss(sim, e, k * L2_SELENE_PERIOD, OPTS);
    const xs = new Set(sim.bullets.filter(b => b.vx === 0 && b.y === e.y + 40 * ONE).map(b => b.x / ONE));
    const missing = [...Array(L2_SELENE_SLOTS).keys()].filter(i => !xs.has(36 + L2_SELENE_STEP * i));
    assert.equal(missing.length, 2); assert.equal(missing[1] - missing[0], 1);
    gaps.push(missing[0] >> 1);
  }
  assert.deepEqual(gaps, [...L2_SELENE_GAPS]);
});

/** Is there a place the ship can be at tick `when` that no zone covers, within reach of where it starts? */
const safeSpot = (sim, when, from, reach) => {
  for (let y = PLAYER_MIN_Y; y <= PLAYER_MAX_Y; y += 20) for (let x = PLAYER_MARGIN_X; x <= WORLD_W - PLAYER_MARGIN_X; x += 20) {
    if (Math.hypot(x - from[0], y - from[1]) > reach) continue;
    if (!danger(sim, x * ONE, y * ONE, PLAYER_R, when - sim.tick)) return true;
  }
  return false;
};

test("leg two no forced hit: Pan's pipes, and its stripes as a core, always leave somewhere to be that the ship can reach", () => {
  const sim = bare(), e = enemy(sim, PAN, 360, 220);
  LEG2.boss(sim, e, 100, { ...OPTS, rage: true });
  const pipes = sim.l2.zones;
  assert.deepEqual(pipes.map(z => z.len), [...L2_PIPE_LEN]);
  pipes.forEach((z, i) => { assert.equal(z.x, (L2_PIPE_X0 + i * L2_PIPE_STEP) * ONE); assert.equal(z.from, sim.tick + i * L2_PIPE_DELAY + L2_PIPE_WARN); assert.equal(z.to - z.from, L2_PIPE_LIVE); });
  const mid = pipes[3];
  assert.equal(danger(sim, mid.x, mid.y + 400 * ONE, PLAYER_R, mid.from - sim.tick), true, 'live: it hurts');
  assert.equal(danger(sim, mid.x, mid.y + 400 * ONE, PLAYER_R, mid.from - sim.tick - 1), false, 'announced: not yet');
  for (let t = 101; t < L2_PIPE_PERIOD; t++) LEG2.boss(sim, e, t, { ...OPTS, rage: true });
  assert.equal(sim.l2.zones.filter(z => z.k === 1).map(z => z.y / ONE).join(), L2_STRIPE_Y.join(), 'a core: three stripes after the pipes');
  const end = Math.max(...sim.l2.zones.map(z => z.to));
  for (const start of [[360, 1040], [90, 600], [630, 300]]) for (let w = sim.tick; w < end; w += 3) assert.ok(safeSpot(sim, w, start, PLAYER_SPEED * (w - sim.tick + L2_PIPE_WARN)), `from ${start} at ${w}`);
  assert.ok(L2_STRIPE_Y.every((y, i) => i === 0 || y - L2_STRIPE_Y[i - 1] - 2 * L2_STRIPE_HALF >= 4 * PLAYER_R), 'the way between two stripes is wide');
});

test('leg two: the twins change sides on a fixed beat; each arrival casts a cone at where the ship was, and a step aside clears it', () => {
  const sim = bare(), e = enemy(sim, TWINS, 200, 220);
  sim.px = 360 * ONE; sim.py = 1000 * ONE;
  LEG2.boss(sim, e, 0, OPTS);
  for (let t = 1; t <= 360 + 80 && !sim.l2.zones.length; t++) { LEG2.boss(sim, e, t, OPTS); e.x = e.ax; }
  assert.equal(e.ax, 520 * ONE, 'the evening star on the right');
  const z = sim.l2.zones[0];
  assert.equal(z.k, 2); assert.equal(z.to - z.from, L2_CONE_LIVE); assert.equal(z.from - sim.tick, L2_CONE_WARN);
  const k = L2_CONE_WARN;
  assert.equal(danger(sim, sim.px, sim.py, PLAYER_R, k), true, 'where the ship was');
  assert.equal(danger(sim, sim.px - 260 * ONE, sim.py, PLAYER_R, k), false, 'a step aside');
  assert.ok(260 <= PLAYER_SPEED * L2_CONE_WARN);
});

test("leg two: Nemesis's plates stop shots and count them (no more than the cap); none as a core; a burst pays them back", () => {
  const sim = bare(), e = enemy(sim, NEMESIS, 360, 220);
  const plate = shotAt(360 + (L2_NEMESIS_ARMOUR[0] + L2_NEMESIS_ARMOUR[1]) / 2, 260);
  assert.equal(LEG2.blocks(sim, e, shotAt(360, 260)), false, 'the core is open');
  for (let i = 0; i < 40; i++) assert.equal(LEG2.blocks(sim, e, plate), true);
  assert.equal(sim.l2.ret, L2_NEMESIS_CAP);
  sim.bullets.length = 0;
  LEG2.boss(sim, e, 120, OPTS);
  assert.equal(sim.bullets.length, L2_NEMESIS_CAP); assert.equal(sim.l2.ret, 0);
  e.st = 2;
  assert.equal(LEG2.blocks(sim, e, plate), false, 'a core has no plates');
  const clean = bare(), n = enemy(clean, NEMESIS, 360, 220);
  clean.bullets.length = 0; LEG2.boss(clean, n, 120, OPTS);
  assert.equal(clean.bullets.length, 0, 'nothing stopped, nothing paid back');
});

test("leg two: Nemesis's rings of circles keep their distance from each other", () => {
  const sim = bare(), e = enemy(sim, NEMESIS, 360, 220, { st: 2 });
  LEG2.boss(sim, e, 60, { ...OPTS, rage: true });
  const c = sim.l2.zones.filter(z => z.k === 3);
  assert.equal(c.length, 12);
  assert.equal(c.filter(z => z.from === c[0].from).length, 5, 'the nearer five first');
  for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) assert.ok(Math.hypot(c[i].x - c[j].x, c[i].y - c[j].y) / ONE >= L2_RINGS_GAP);
  assert.ok(c.every(z => z.x >= 60 * ONE && z.x <= (WORLD_W - 60) * ONE && z.y <= PLAYER_MAX_Y * ONE), 'on the screen');
  assert.ok(safeSpot(sim, c[0].from, [360, 1040], 1e9) && safeSpot(sim, c[11].from, [360, 1040], 1e9), 'room between them');
  assert.ok(L2_RINGS_PERIOD > 0);
});

test('leg two: a gold arrow turns once, toward where the ship was when it was fired', () => {
  const sim = bare(), b = { x: 200 * ONE, y: 300 * ONE, vx: 0, vy: L2_GOLD_SPEED * ONE, grazed: 0, tt: 2, tx: 500 * ONE, ty: 1000 * ONE };
  LEG2.bend(sim, b, 0); assert.equal(b.vx, 0);
  LEG2.bend(sim, b, 0);
  const a = angleOf(300 * ONE, 700 * ONE);
  assert.deepEqual([b.vx, b.vy], [COS[a] * L2_GOLD_SPEED, SIN[a] * L2_GOLD_SPEED]);
  LEG2.bend(sim, b, 0); assert.deepEqual([b.vx, b.vy], [COS[a] * L2_GOLD_SPEED, SIN[a] * L2_GOLD_SPEED], 'only once');
});

test("leg two: Eris's apple is shown first; then machines make for it and two that meet blow up together, for points", () => {
  const sim = bare(), eris = enemy(sim, ERIS, 360, 220);
  LEG2.boss(sim, eris, 150, OPTS);
  const ap = sim.l2.apple;
  assert.ok(ap && ap.pw === L2_APPLE_WARN);
  const a = enemy(sim, DRONE, ap.x / ONE - 20, ap.y / ONE), b = enemy(sim, DRONE, ap.x / ONE + 20, ap.y / ONE);
  sim.px = 100 * ONE; sim.py = 1200 * ONE;
  for (let i = 0; i < L2_APPLE_WARN - 1; i++) { sim.invuln = 5; step(sim, 0); a.y = b.y = ap.y; a.x = ap.x - 20 * ONE; b.x = ap.x + 20 * ONE; }
  const s0 = sim.score;
  for (let i = 0; i < 3; i++) { sim.invuln = 5; step(sim, 0); }
  assert.ok(a.hp <= 0 && b.hp <= 0);
  assert.ok(sim.score - s0 >= L2_DISCORD_PTS);
});

test('leg two: Endymion sends out its guard when it takes position', () => {
  const sim = bare(), e = enemy(sim, ENDYMION, 360, 220);
  LEG2.boss(sim, e, 0, OPTS);
  assert.equal(sim.enemies.filter(g => g.type === ORBITER && g.q === 9).length, 5);
});

test('leg two v2: once her plates are gone, Nemesis fires more, and faster, than with them on', () => {
  const fired = st => {
    const sim = bare(), e = enemy(sim, NEMESIS, 360, 220, { st });
    let n = 0, fast = 0;
    for (let t = 1; t <= 600; t++) { sim.bullets.length = 0; LEG2.boss(sim, e, t, { ...OPTS, sig: st >= 1, rage: st >= 2 }); n += sim.bullets.length; fast += sim.bullets.filter(b => b.vx * b.vx + b.vy * b.vy > (4 * ONE) ** 2).length; }
    return { n, fast };
  };
  const on = fired(0), off = fired(1), core = fired(2);
  assert.ok(off.n > on.n * 1.5, `frame stage ${off.n} vs armour ${on.n}`);
  assert.ok(off.fast > on.fast, 'faster bullets');
  assert.ok(core.n >= off.n, 'the core no less');
});
