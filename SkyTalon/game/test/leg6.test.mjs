// Leg six (gdd/05 「第十一版」): determinism, fairness and the rules written so far. Leg one's own tests are in
// determinism.test.mjs; the first test here is the one that says loading leg six changes nothing in leg one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playMatch, verify, ONE } from '../src/sim/core/index.js';
import { GAME, KIND, SCRIPT, sectionAt, step, phase, choose, UNIT_TICKS, WORLD_W, PLAYER_SPEED, PLAYER_R, PLAYER_MAX_Y, isBoss, isMid, BOSS_Y, PEAK, METEOR, OBST_R } from '../src/sim/sim.js';
import {
  GAME6, EUDI, COELO, STEGO, ORNI, PTERA, ELASMO, TRIKE, ANKY, L6_MIDS, L6_BOSSES, schedule, bombs, obstacles, danger, windAt, sweepSpan, blowing, FIRE, VENOM,
  L6_STEGO_SPIKES, L6_STEGO_Y, L6_SHIELD_HALF, L6_ANKY_PERIOD, L6_ANKY_RING, L6_ANKY_GAP, L6_NECK_WARN, L6_SWEEP_X, L6_SWEEP_Y, L6_SWEEP_LEN, L6_SWEEP_HALF, L6_SWEEP_WARN,
  L6_WIND_PUSH, L6_WIND_WARN, L6_WIND_PERIOD, L6_SLOW_KEEP, L6_WELL_R, L6_CLAW_WARN, L6_CLAW_STAYS, L6_PTERA_WARN, L6_TRIKE_WARN,
  L6_DIVE_HOLD, L6_DIVE_Y, L6_GROUND_VY, L6_PACK_BONUS, L6_BOMB_WARN, L6_BOMB_R, L6_BOMB_APART, L6_BOMB_LIVE, L6_CLOSED_PCT, L6_HP_ADD,
} from '../src/sim/leg6.js';
import { STRATEGIES } from '../tools/strategies.mjs';

const play = role => Object.values(STRATEGIES).find(s => s.role === role).policy;
const STRONG = play('strong'), SIMPLE = play('simple');
/** A leg-six sim past its opening supply, with nothing scheduled: the test puts in what it needs. */
const bare = (seed = 5) => {
  const sim = GAME6.createSim(seed);
  while (phase(sim) === 'choice') choose(sim, 0);
  sim.plan = []; sim.nextSpawn = 0; sim.l6.bombPlan = []; sim.l6.packs.clear(); sim.skip = 10 * UNIT_TICKS;
  return sim;
};
const enemy = (sim, type, x, y, extra = {}) => { const e = { id: sim.nextId++, type, x: x * ONE, y: y * ONE, hp: KIND[type].hp, t: 0, ax: x * ONE, aux: 0, vx: 0, pk: 0, pv: 0, pw: 0, a: 64, bt: 0, bm: 0, dr: 0, sh: 0, el: 0, ac: 0, q: 0, qd: 0, st: 0, stun: 0, shd: 0, idle: 0, refills: 0, ch: 0, cw: 0, ...extra }; sim.enemies.push(e); return e; };

test('leg six does not touch leg one: with leg six loaded, leg one plays the same golden match', () => {
  assert.deepEqual(playMatch(GAME, 1234, STRONG).result(),
    { game: 'sky-talon', version: 13, seed: 1234, ticks: 20204, score: 54425, hash: 4263489266 });
  assert.equal(KIND.slice(0, 21).every(k => !k.leg), true, "leg one's kinds are as they were");
});

test('leg six: same seed + same inputs => identical result; golden match; an uploaded match verifies', () => {
  const a = playMatch(GAME6, 1234, STRONG).result();
  assert.deepEqual(a, playMatch(GAME6, 1234, STRONG).result());
  assert.deepEqual(a, GOLDEN6);
  const up = playMatch(GAME6, 98765, SIMPLE).upload();
  assert.equal(verify(GAME6, up).valid, true);
  assert.equal(verify(GAME6, { ...up, score: up.score + 10 }).valid, false);
});

test('leg six: the schedule and the bombs depend only on the seed; every boss slot has a boss of this leg', () => {
  assert.deepEqual(schedule(77), schedule(77));
  assert.notDeepEqual(schedule(77), schedule(78));
  assert.deepEqual(bombs(77), bombs(77));
  for (const t of [...L6_MIDS, ...L6_BOSSES]) assert.equal(isBoss(t), true);
  assert.deepEqual(L6_MIDS.map(isMid), [true, true, true, true]);
  assert.deepEqual(L6_BOSSES.map(isMid), [false, false, false, false]);
  // each chapter flies its own two creatures (and chapter one's flyers and packs throughout); no machine of leg one
  const own = [[EUDI, COELO], [STEGO, ORNI], [PTERA, ELASMO], [TRIKE, ANKY]], plan = schedule(77);
  const seen = [0, 1, 2, 3].map(c => new Set(plan.filter(p => SCRIPT[sectionAt(p.at)].chapter === c).map(p => p.type)));
  own.forEach((pair, c) => {
    for (const t of pair) assert.ok(seen[c].has(t), `chapter ${c + 1} has ${KIND[t].name}`);
    for (const t of seen[c]) assert.ok(KIND[t].leg, 'a creature of this leg');
    own.forEach((other, d) => { if (d > c) for (const t of other) assert.ok(!seen[c].has(t), `${KIND[t].name} does not come before its chapter`); });
  });
  // a chapter's second creature first shows by itself: nothing else comes in that unit
  for (const c of [1, 2, 3]) {
    const second = own[c][1], firstAt = Math.min(...plan.filter(p => p.type === second).map(p => p.at)), unit = Math.floor(firstAt / UNIT_TICKS);
    assert.deepEqual([...new Set(plan.filter(p => Math.floor(p.at / UNIT_TICKS) === unit).map(p => p.type))], [second], `chapter ${c + 1}: ${KIND[second].name} is introduced alone`);
  }
});

test('leg six: an eudimorphodon comes down, holds while it locks on where the ship is, then dives along that line without turning', () => {
  const sim = bare(), e = enemy(sim, EUDI, 200, 100);
  sim.px = 500 * ONE; sim.py = 1000 * ONE;
  let lock = null, n = 0;
  while (!lock && n++ < 200) { sim.invuln = 5; step(sim, 0); lock = sim.events.find(v => v.type === 'diveLock'); }
  assert.ok(lock && lock.ticks === L6_DIVE_HOLD && e.y >= L6_DIVE_Y * ONE);
  const held = { x: e.x, y: e.y };
  for (let i = 0; i < L6_DIVE_HOLD - 1; i++) { sim.invuln = 5; step(sim, 0); assert.deepEqual({ x: e.x, y: e.y }, held, 'it does not move while it holds'); }
  sim.px = 100 * ONE;                                         // the ship moves away after the lock: the dive does not follow
  const path = [];
  for (let i = 0; i < 12; i++) { sim.invuln = 5; step(sim, 0); path.push([e.x, e.y]); }
  const d = path.slice(1).map((p, i) => [p[0] - path[i][0], p[1] - path[i][1]]);
  assert.ok(d.every(v => v[0] === d[0][0] && v[1] === d[0][1]), 'a straight line');
  assert.ok(d[0][0] > 0 && d[0][1] > 0, 'toward where the ship was (down and to the right)');
});

test('leg six: a coelophysis pack is on the ground (the ship flies over it), can be shot, and pays a bonus only if every one of it is downed', () => {
  assert.equal(KIND[COELO].ground, 1);
  const run = spare => {
    const sim = bare(), unit = 10;
    const pack = [0, 1, 2].map(i => enemy(sim, COELO, 300 + i * 46, 760, { vx: 3 * ONE, pv: unit, t: 5 }));
    sim.l6.packs.set(unit, { lost: 0, paid: 0 });
    sim.px = pack[0].x; sim.py = pack[0].y;                   // right on top of one: no hit
    sim.invuln = 0; const hits = sim.hits; step(sim, 0);
    assert.equal(sim.hits, hits, 'no collision with the ground layer');
    const before = sim.score;
    pack.forEach((e, i) => { if (!(spare && i === 2)) e.hp = 0; });   // downed (as if shot)
    sim.enemies = sim.enemies.filter(e => e.hp > 0);
    let bonus = 0;
    for (let i = 0; i < 400; i++) { sim.invuln = 5; sim.px = 40 * ONE; sim.py = PLAYER_MAX_Y * ONE; step(sim, 0); if (sim.events.some(v => v.type === 'packBonus')) bonus++; }
    return { gained: sim.score - before, bonus };
  };
  assert.deepEqual(run(false), { gained: L6_PACK_BONUS, bonus: 1 });
  assert.deepEqual(run(true), { gained: 0, bonus: 0 }, 'one got away: no bonus');
});

test('leg six (no forced hit): a volcanic bomb shows its shadow for the whole warning, hurts only inside its circle and only when it lands; never more than three at once, well apart, and the warning is long enough to walk out', () => {
  assert.ok((L6_BOMB_R + PLAYER_R) / PLAYER_SPEED < L6_BOMB_WARN / 2, 'out of the circle in under half the warning');
  for (const seed of [1, 2, 3, 77, 1234]) {
    const plan = bombs(seed);
    for (const b of plan) {
      const together = plan.filter(o => Math.abs(o.at - b.at) < L6_BOMB_WARN + L6_BOMB_LIVE);
      assert.ok(together.length <= 3, `seed ${seed}: at most three in the air`);
      for (const o of together) if (o !== b) assert.ok((o.x - b.x) ** 2 + (o.y - b.y) ** 2 >= L6_BOMB_APART ** 2, 'apart');
      assert.ok(b.x >= L6_BOMB_R && b.x <= WORLD_W - L6_BOMB_R);
    }
  }
  const sim = bare();
  sim.l6.bombPlan = [{ at: 0, x: 360, y: 800 }]; sim.l6.nextBomb = 0;
  const landY = 800 + L6_BOMB_WARN * L6_GROUND_VY;            // the mark drifts with the ground while it warns
  sim.px = 360 * ONE; sim.py = landY * ONE;                   // standing where it will land
  let up = -1, land = -1, hurtAt = -1;
  for (let i = 0; i < L6_BOMB_WARN + 20; i++) {
    sim.invuln = 0; const h = sim.hits; step(sim, 0);
    if (up < 0 && sim.events.some(v => v.type === 'bombUp')) up = i;
    if (land < 0 && sim.events.some(v => v.type === 'bomb')) land = i;
    if (hurtAt < 0 && sim.hits > h) hurtAt = i;
  }
  assert.equal(land - up, L6_BOMB_WARN, 'the whole warning passes first');
  assert.ok(hurtAt >= land, 'it does not hurt before it lands');
  const out = bare();
  out.l6.bombPlan = [{ at: 0, x: 360, y: 800 }];
  out.px = (360 + L6_BOMB_R + PLAYER_R + 12) * ONE; out.py = landY * ONE;
  const h0 = out.hits;
  for (let i = 0; i < L6_BOMB_WARN + 20; i++) { out.invuln = 0; step(out, 0); }
  assert.equal(out.hits, h0, 'just outside the circle: untouched');
});

test('leg six: a boss whose weak point is closed takes 15% of a hit, exactly (a remainder is kept); open, it takes all of it; a mid-boss is not affected', () => {
  assert.equal(L6_CLOSED_PCT, 15);
  const sim = bare(), b = enemy(sim, L6_BOSSES[0], 360, BOSS_Y, { t: 300, aux: 100 });
  sim.bossState = 1; sim.px = 40 * ONE; sim.py = PLAYER_MAX_Y * ONE;
  const leg = sim.leg, hp = b.hp;
  let taken = 0;
  for (let i = 0; i < 20; i++) taken += leg.scale(sim, b, 1);
  assert.equal(taken, 3, '20 hits of 1 at 15% = 3');
  assert.equal(sim.l6.acc, 0);
  assert.equal(leg.scale(sim, b, 3), 0); assert.equal(sim.l6.acc, 45);
  sim.l6.open = 10;
  assert.equal(leg.scale(sim, b, 3), 3, 'open: all of it');
  assert.equal(sim.l6.acc, 45, 'the remainder is kept across an opening');
  const m = enemy(sim, L6_MIDS[0], 360, BOSS_Y);
  sim.l6.open = 0;
  assert.equal(leg.scale(sim, m, 1), 1);
  assert.equal(b.hp, hp);
});

test('leg six: the plateosaurus opens its weak point when it announces its sweep and closes it again; the sweep is a ray like leg one\'s', () => {
  const sim = bare(), b = enemy(sim, L6_BOSSES[0], 360, BOSS_Y, { t: 200, aux: 100 });
  sim.bossState = 1; sim.px = 40 * ONE; sim.py = PLAYER_MAX_Y * ONE;
  let opened = -1, wall = -1, ray = -1, closed = -1;
  for (let i = 0; i < 700 && closed < 0; i++) {
    b.hp = 9999; sim.invuln = 5; sim.shots.length = 0; step(sim, 0);
    for (const v of sim.events) {
      if (v.type === 'weakOpen' && opened < 0) opened = i;
      if (v.type === 'wall' && wall < 0) wall = i;
      if (v.type === 'wallFire' && ray < 0) ray = i;
      if (v.type === 'weakClose') closed = i;
    }
  }
  assert.ok(opened >= 0 && opened === wall, 'open from the announcement');
  assert.ok(ray > wall && closed > ray, 'the ray comes while it is open; it closes afterwards');
  assert.ok(sim.l6.open === 0);
});

const ticks = (sim, n, each) => { for (let i = 0; i < n; i++) { sim.invuln = 5; step(sim, 0); if (each) each(i); } };

test('leg six: creatures also attack from a distance: fire and venom are ordinary bullets with a colour; a stegosaurus throws four spikes with none straight at the ship', () => {
  const sim = bare(); enemy(sim, STEGO, 360, L6_STEGO_Y, { q: 1, qd: 2, aux: 0 });
  sim.px = 360 * ONE; sim.py = 1000 * ONE;
  ticks(sim, 3);
  assert.equal(sim.bullets.length, L6_STEGO_SPIKES.length);
  assert.ok(sim.bullets.every(b => b.vx !== 0), 'the ship is straight below: no spike comes straight down');
  assert.equal(sim.bullets.filter(b => b.vx < 0).length, sim.bullets.filter(b => b.vx > 0).length, 'as many to either side');
  const o = bare(); enemy(o, ORNI, 50, 400); o.px = 400 * ONE; o.py = 900 * ONE;
  let venom = 0; ticks(o, 20, () => { venom = Math.max(venom, o.bullets.filter(b => b.c === VENOM).length); });
  assert.equal(venom, 1, 'the ornitholestes spits venom before it leaps');
  const p = bare(); enemy(p, PTERA, 300, 100, { q: 1, qd: 1 }); p.px = 40 * ONE;
  ticks(p, 2);
  assert.equal(p.bullets.filter(b => b.c === FIRE).length, 2, 'the pteranodon breathes fire to either side as it starts down');
});

test('leg six: a triceratops cannot be shot from straight in front (its shield), only in the flank', () => {
  const run = dx => {
    const sim = bare(), e = enemy(sim, TRIKE, 360, 500, { q: 2 }), hp = e.hp;
    sim.px = 40 * ONE; sim.py = PLAYER_MAX_Y * ONE;
    sim.shots.push({ x: (360 + dx) * ONE, y: 540 * ONE, vx: 0, vy: 4 * ONE, dmg: 1, left: 0, hit: [] });
    let clang = false;
    ticks(sim, 3, () => { clang = clang || sim.events.some(v => v.type === 'clang'); sim.shots = sim.shots.filter(q => q.vy === 4 * ONE); });
    return { lost: hp - e.hp, clang };
  };
  assert.deepEqual(run(0), { lost: 0, clang: true });
  assert.deepEqual(run(L6_SHIELD_HALF + 8), { lost: 1, clang: false });
  assert.ok(L6_SHIELD_HALF < KIND[TRIKE].r - 8, 'there is a flank to hit');
});

test("leg six (no forced hit): an ankylosaurus's ring has two ways through; a neck, a dive and a charge each show where they will be first", () => {
  const sim = bare(); enemy(sim, ANKY, 360, 500, { t: L6_ANKY_PERIOD - 1 });
  sim.px = 40 * ONE; sim.py = PLAYER_MAX_Y * ONE;
  ticks(sim, 1);
  assert.equal(sim.bullets.length, L6_ANKY_RING - 2 * L6_ANKY_GAP);
  const neck = bare(), n = enemy(neck, ELASMO, 360, 600);
  let hurtAt = -1;
  for (let i = 0; i < L6_NECK_WARN + 30 && hurtAt < 0; i++) { neck.px = n.x; neck.py = n.y - 40 * ONE; neck.invuln = 0; const h = neck.hits; step(neck, 0); if (neck.hits > h) hurtAt = i; }
  assert.ok(hurtAt >= L6_NECK_WARN - 2, `the neck does not hurt before its ripples have shown (${hurtAt})`);
  assert.ok(L6_PTERA_WARN * PLAYER_SPEED > KIND[PTERA].r + PLAYER_R + 40 && L6_TRIKE_WARN * PLAYER_SPEED > KIND[TRIKE].r + PLAYER_R + 40, 'time to step off the line');
  const d = bare(); enemy(d, PTERA, 300, 100, { q: 1, qd: 20 });
  assert.equal(danger(d, 300 * ONE, 900 * ONE, PLAYER_R, 25), true, 'the line is known ahead');
  assert.equal(danger(d, 300 * ONE, 900 * ONE, PLAYER_R, 10), false, 'not before it starts');
  assert.equal(danger(d, 400 * ONE, 900 * ONE, PLAYER_R, 25), false, 'beside the line is clear');
});

test('leg six (no forced hit): the sweep is announced, turns at a fixed rate, and never reaches the bottom of the screen', () => {
  const from = SCRIPT.find(x => x.chapter === 1 && x.event).from * UNIT_TICKS;
  assert.deepEqual(sweepSpan(from), { from, to: from + UNIT_TICKS });
  assert.equal(sweepSpan(0), null);
  const sim = bare(); sim.skip = from - sim.tick; sim.chapter = 1;
  let up = -1, live = -1; const angles = [];
  for (let i = 0; i < 200; i++) { sim.invuln = 5; sim.px = 40 * ONE; sim.py = PLAYER_MAX_Y * ONE; step(sim, 0); if (up < 0 && sim.events.some(v => v.type === 'sweepUp')) up = i; if (sim.l6.sweep === 2) { if (live < 0) live = i; angles.push(sim.l6.sweepA); } }
  assert.ok(up >= 0 && live - up >= L6_SWEEP_WARN, `it turns only after its warning (${up}, ${live})`);
  assert.ok(angles.slice(1).every((a, i) => ((a - angles[i]) & 255) === 1), 'one step a tick');
  const low = bare(); low.l6.sweep = 2;
  const floor = L6_SWEEP_Y + L6_SWEEP_LEN + L6_SWEEP_HALF + PLAYER_R + 2;
  for (let a = 0; a < 256; a++) { low.l6.sweepA = a; for (let x = 30; x <= WORLD_W - 30; x += 30) assert.equal(danger(low, x * ONE, floor * ONE, PLAYER_R), false); }
  assert.ok(floor < PLAYER_MAX_Y - 100, 'there is room below it');
  low.l6.sweepA = 0;
  assert.equal(danger(low, (L6_SWEEP_X + 200) * ONE, L6_SWEEP_Y * ONE, PLAYER_R), true, 'on the bar it hurts');
});

test('leg six (no forced hit): the crosswind is announced, blows left and right by turns, and is slower than the ship; it carries bullets too', () => {
  assert.ok(L6_WIND_PUSH * 2 <= PLAYER_SPEED, 'the ship can fly against it');
  const t0 = SCRIPT.find(x => x.chapter === 2 && x.event).from * UNIT_TICKS;
  assert.equal(windAt(t0 - 1), null);
  const a = windAt(t0), b = windAt(t0 + L6_WIND_WARN), c2 = windAt(t0 + L6_WIND_PERIOD + L6_WIND_WARN);
  assert.deepEqual([a.warn, a.blow, b.warn, b.blow], [true, false, false, true]);
  assert.equal(b.dir, -c2.dir, 'the next one blows the other way');
  const sim = bare(); sim.skip = t0 + L6_WIND_WARN + 5 - sim.tick; sim.chapter = 2;
  sim.px = 360 * ONE; sim.py = 1000 * ONE;
  sim.bullets.push({ x: 300 * ONE, y: 300 * ONE, vx: 0, vy: 0, grazed: 0 });
  const dir = blowing(sim); assert.notEqual(dir, 0);
  ticks(sim, 10);
  assert.equal(sim.px, (360 + dir * L6_WIND_PUSH * 10) * ONE, 'the ship drifts with it when it does nothing');
  assert.equal(sim.bullets[0].x, (300 + dir * L6_WIND_PUSH * 10) * ONE, 'so does a bullet');
  const fly = bare(); fly.skip = t0 + L6_WIND_WARN + 5 - fly.tick; fly.chapter = 2; fly.px = 360 * ONE;
  for (let i = 0; i < 10; i++) { fly.invuln = 5; step(fly, dir > 0 ? 7 : 3); }   // steer into the wind (7 = left, 3 = right)
  assert.ok(dir > 0 ? fly.px < 360 * ONE : fly.px > 360 * ONE, 'steering into it still gains ground');
});

test("leg six: the diplodocus's band holds bullets back to a fifth of their speed; the tyrannosaurus's well bends bullets and shots the same way every time", () => {
  const sim = bare(), leg = sim.leg;
  sim.l6.band = { y0: 400 * ONE, y1: 600 * ONE, pw: 0, bt: 50 };
  const b = { x: 100 * ONE, y: 500 * ONE, vx: 10 * ONE, vy: 5 * ONE, grazed: 0 }, x0 = b.x, y0 = b.y;
  leg.bend(sim, b, 0); b.x += b.vx; b.y += b.vy;
  assert.deepEqual([b.x - x0, b.y - y0], [Math.trunc((10 * ONE) / L6_SLOW_KEEP), Math.trunc((5 * ONE) / L6_SLOW_KEEP)]);
  const out = { x: 100 * ONE, y: 300 * ONE, vx: 10 * ONE, vy: 5 * ONE, grazed: 0 }; leg.bend(sim, out, 0);
  assert.deepEqual([out.x, out.y], [100 * ONE, 300 * ONE], 'outside the band nothing happens');
  sim.l6.band = null;
  sim.l6.well = { x: 360 * ONE, y: 600 * ONE, pw: 0, bt: 100 };
  const bend = () => { const q = { x: 300 * ONE, y: 600 * ONE, vx: 0, vy: 4 * ONE, grazed: 0 }; leg.bend(sim, q, 0); return [q.vx, q.vy]; };
  assert.deepEqual(bend(), bend());
  assert.ok(bend()[0] > 0, 'pulled toward the well');
  const s2 = { x: 300 * ONE, y: 600 * ONE, vx: 0, vy: 20 * ONE, left: 0, dmg: 1, hit: [] }; leg.bend(sim, s2, 1);
  assert.ok(s2.vx > 0, "the ship's shots bend too");
  const far = { x: (360 + L6_WELL_R + 30) * ONE, y: 600 * ONE, vx: 0, vy: 4 * ONE, grazed: 0 }; leg.bend(sim, far, 0);
  assert.deepEqual([far.vx, far.vy], [0, 4 * ONE], 'out of its reach nothing bends');
  sim.l6.well.pw = 10;
  const warn = { x: 300 * ONE, y: 600 * ONE, vx: 0, vy: 4 * ONE, grazed: 0 }; leg.bend(sim, warn, 0);
  assert.equal(warn.vx, 0, 'not while it is only announced');
});

test("leg six (no forced hit): a claw mark is shown for its whole warning before it can hurt; trees come one at a time; the end's meteors do not thin out", () => {
  const sim = bare(), a = enemy(sim, L6_MIDS[1], 360, BOSS_Y, { t: 100 + 150 - 1, aux: 100 });
  sim.bossState = 1; sim.px = 360 * ONE; sim.py = 600 * ONE;
  let up = -1, live = -1, hurt = -1;
  for (let i = 0; i < L6_CLAW_WARN + L6_CLAW_STAYS + 20; i++) {
    a.hp = 9999; sim.invuln = 0; const h = sim.hits; sim.bullets.length = 0; sim.shots.length = 0; step(sim, 0);
    for (const v of sim.events) { if (v.type === 'clawUp' && up < 0) up = i; if (v.type === 'claw' && live < 0) live = i; }
    if (hurt < 0 && sim.hits > h) hurt = i;
  }
  assert.equal(live - up, L6_CLAW_WARN);
  assert.ok(hurt >= live, `the ship stood in it and was hurt only once it was live (${hurt} >= ${live})`);
  const rocks = obstacles(77), trees = rocks.filter(o => o.kind === PEAK), met = rocks.filter(o => o.kind === METEOR);
  assert.ok(trees.length > 0 && met.length > 0);
  assert.ok(trees.every(o => SCRIPT[sectionAt(o.at)].chapter === 1) && met.every(o => SCRIPT[sectionAt(o.at)].chapter === 3));
  const times = trees.map(o => o.at);
  assert.equal(new Set(times).size, times.length, 'never two trees abreast');
  assert.ok(2 * OBST_R[PEAK] < WORLD_W - 200, 'a tree leaves most of the width open');
  const gap = k => { const m = met.filter(o => sectionAt(o.at) === k).map(o => o.at); return m.length > 1 ? (m[m.length - 1] - m[0]) / (m.length - 1) : Infinity; };
  const secs = [...new Set(met.map(o => sectionAt(o.at)))].filter(k => !SCRIPT[k].event && !SCRIPT[k].safe);
  assert.ok(gap(secs[secs.length - 1]) <= gap(secs[0]), 'the last wave section has them at least as thick as the first');
});

test('leg six: the strong player beats the simple ones on every one of a few seeds (a first look; the evidence batches come with N5)', () => {
  for (const seed of [11, 22, 33]) {
    const strong = playMatch(GAME6, seed, STRONG).result().score, simple = playMatch(GAME6, seed, SIMPLE).result().score;
    assert.ok(strong > simple * 3, `seed ${seed}: ${strong} vs ${simple}`);
  }
});

const GOLDEN6 = { game: 'sky-talon-leg6', version: 5, seed: 1234, ticks: 23198, score: 57259, hash: 45493420 };

// --- second pass: sixteen creatures, standing boss patterns ---
import { ROSTER, L6_PATTERNS, L6_SPIRAL_EVERY } from '../src/sim/leg6.js';

test('leg six: four creatures of its own per chapter; each one first shows by itself; a file of creatures really comes on (none is thrown away as it spawns)', () => {
  assert.deepEqual(ROSTER.map(r => r.length), [4, 4, 4, 4]);
  assert.equal(new Set(ROSTER.flat()).size, 16, 'sixteen different creatures');
  const plan = schedule(77);
  ROSTER.forEach((row, c) => { for (const t of row) { const firstAt = Math.min(...plan.filter(p => p.type === t).map(p => p.at)); assert.equal(SCRIPT[sectionAt(firstAt)].chapter, c, `${KIND[t].name} comes in with chapter ${c + 1}`); } });
  for (const t of ROSTER.flat()) {
    if (t === ROSTER[0][0]) continue;                          // the very first creature opens the match
    const firstAt = Math.min(...plan.filter(p => p.type === t).map(p => p.at)), unit = Math.floor(firstAt / UNIT_TICKS);
    assert.deepEqual([...new Set(plan.filter(p => Math.floor(p.at / UNIT_TICKS) === unit).map(p => p.type))], [t], `${KIND[t].name} is introduced alone`);
  }
  for (const p of plan) if (p.y !== undefined && p.vx) assert.ok(p.x >= -80 && p.x <= WORLD_W + 80, 'a file starts just off the edge, one after another');
  // and in play: every coelophysis of the first pack is seen on the field
  const sim = GAME6.createSim(77), want = plan.filter(p => p.type === COELO && Math.floor(p.at / UNIT_TICKS) === Math.floor(plan.find(q => q.type === COELO).at / UNIT_TICKS)).length, seen = new Set();
  for (let i = 0; i < 12000 && seen.size < want && phase(sim) !== 'over'; i++) { if (phase(sim) === 'choice') { choose(sim, 0); continue; } sim.shields = 3; sim.invuln = 5; step(sim, 0); for (const e of sim.enemies) if (e.type === COELO) seen.add(e.id); }
  assert.equal(seen.size, want);
});

test('leg six: every mid-boss and boss keeps up a fan and rings besides its borrowed attack, and a boss adds a spiral once its armour is off', () => {
  for (const t of [...L6_MIDS, ...L6_BOSSES]) assert.ok(L6_PATTERNS[KIND[t].name], `${KIND[t].name} has standing patterns`);
  for (const t of L6_BOSSES) assert.ok(L6_PATTERNS[KIND[t].name].spiral >= 2);
  const count = (type, st) => { const sim = bare(), b = enemy(sim, type, 360, BOSS_Y, { t: 150, aux: 100, st }); sim.bossState = 1; sim.px = 40 * ONE; sim.py = PLAYER_MAX_Y * ONE; let n = 0; for (let i = 0; i < 300; i++) { b.hp = 9999; sim.invuln = 5; sim.shots.length = 0; const before = sim.bullets.length; step(sim, 0); n += Math.max(0, sim.bullets.length - before); sim.bullets.length = Math.min(sim.bullets.length, 400); } return n; };
  const armour = count(L6_BOSSES[1], 0), frame = count(L6_BOSSES[1], 1);
  assert.ok(armour >= 40, `five seconds of a boss with its armour on: ${armour} bullets`);
  assert.ok(frame >= armour + Math.floor(300 / L6_SPIRAL_EVERY), `the spiral comes with the frame stage (${armour} -> ${frame})`);
  assert.ok(count(L6_MIDS[0], 0) >= 20, 'a mid-boss too');
});
