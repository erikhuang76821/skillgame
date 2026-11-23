// Leg three (gdd/05 「第十三版」): determinism, fairness and the rules of its machines, mid-bosses and bosses. The first
// test is the one that says loading leg three changes nothing in the other legs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { playMatch, verify, ONE, angleOf } from '../src/sim/core/index.js';
import { GAME, KIND, SCRIPT, sectionAt, step, phase, choose, UNIT_TICKS, WORLD_W, PLAYER_R, PLAYER_MIN_Y, PLAYER_MAX_Y, PLAYER_MARGIN_X, isBoss, isMid, DRONE } from '../src/sim/sim.js';
import { GAME6 } from '../src/sim/leg6.js';
import { GAME2 } from '../src/sim/leg2.js';
import {
  GAME3, LEG3, schedule, danger, pastPos, aheadPos, MORTAR, AEGIS, CRYSTAL, ECHO, DEIMOS, ANCHOR, EAGLE, L3_MIDS, L3_BOSSES, PHOBOS, ENYO, GANYMEDE, AMALTHEA, PANDORA, PROMETHEUS, JANUS, L3_ROSTER,
  L3_MORTAR_MAX, L3_AEGIS_HALF, L3_ECHO_LAG, L3_RAGE_WARN, L3_COVER_X, L3_BOULDER_WARN, L3_HORN_NEED, L3_SHIELD_DOWN, L3_GIFT, L3_CONE_WARN, L3_JANUS_AHEAD, L3_JANUS_BASE, L3_RAIN_R,
} from '../src/sim/leg3.js';
import { STRATEGIES } from '../tools/strategies.mjs';

const play = role => Object.values(STRATEGIES).find(s => s.role === role).policy;
const STRONG = play('strong'), SIMPLE = play('simple');
const GOLDEN3 = { game: 'sky-talon-leg3', version: 3, seed: 1234, ticks: 21230, score: 49713, hash: 1066595090 };
const bare = (seed = 5) => {
  const sim = GAME3.createSim(seed);
  while (phase(sim) === 'choice') choose(sim, 0);
  sim.plan = []; sim.nextSpawn = 0; sim.rocks = []; sim.l3.sky = []; sim.skip = 10 * UNIT_TICKS; sim.gear = sim.gear.map(() => 0); sim.barrier = 0;
  return sim;
};
const enemy = (sim, type, x, y, extra = {}) => { const e = { id: sim.nextId++, type, x: x * ONE, y: y * ONE, hp: KIND[type].hp, t: 0, ax: x * ONE, aux: 0, vx: 0, pk: 0, pv: 0, pw: 0, a: 64, bt: 0, bm: 0, dr: 0, sh: 0, el: 0, ac: 0, q: 0, qd: 0, st: 0, stun: 0, shd: 0, idle: 0, refills: 0, ch: 0, cw: 0, ...extra }; sim.enemies.push(e); return e; };
const OPTS = { sig: false, rage: false, P: p => p, D: p => p };
const shotAt = (x, y) => ({ x: x * ONE, y: y * ONE, vx: 0, vy: 0, left: 0, dmg: 1, hit: [] });
const hold = sim => { sim.invuln = 5; step(sim, 0); };

test('leg three does not touch the other legs: legs one, two and six play their golden matches', () => {
  assert.deepEqual(playMatch(GAME, 1234, STRONG).result(), { game: 'sky-talon', version: 13, seed: 1234, ticks: 20204, score: 54425, hash: 4263489266 });
  assert.deepEqual(playMatch(GAME6, 1234, STRONG).result(), { game: 'sky-talon-leg6', version: 5, seed: 1234, ticks: 23198, score: 57259, hash: 45493420 });
  assert.deepEqual(playMatch(GAME2, 1234, STRONG).result(), { game: 'sky-talon-leg2', version: 4, seed: 1234, ticks: 19792, score: 54909, hash: 1116054496 });
});

test('leg three: same seed + same inputs => identical result; golden match; an uploaded match verifies', () => {
  const a = playMatch(GAME3, 1234, STRONG).result();
  assert.deepEqual(a, playMatch(GAME3, 1234, STRONG).result());
  assert.deepEqual(a, GOLDEN3);
  const up = playMatch(GAME3, 98765, SIMPLE).upload();
  assert.equal(verify(GAME3, up).valid, true);
  assert.equal(verify(GAME3, { ...up, score: up.score + 10 }).valid, false);
});

test('leg three: the schedule depends only on the seed; each chapter brings its one new machine, first seen alone', () => {
  assert.deepEqual(schedule(77), schedule(77));
  assert.notDeepEqual(schedule(77), schedule(78));
  for (const t of [...L3_MIDS, ...L3_BOSSES]) assert.equal(isBoss(t), true);
  assert.deepEqual(L3_MIDS.map(isMid), [true, true, true, true]);
  const plan = schedule(77), chapterOf = p => SCRIPT[sectionAt(p.at)].chapter;
  L3_ROSTER.forEach(([fresh], c) => {
    const mine = plan.filter(p => p.type === fresh);
    assert.equal(Math.min(...mine.map(chapterOf)), c, `${KIND[fresh].name} first comes in chapter ${c + 1}`);
    const unit = Math.floor(Math.min(...mine.map(p => p.at)) / UNIT_TICKS);
    assert.deepEqual([...new Set(plan.filter(p => Math.floor(p.at / UNIT_TICKS) === unit).map(p => p.type))], [fresh], 'alone in its first unit');
  });
});

test('leg three: siege mortars mark where the ship is, never more than two marks at once', () => {
  const sim = bare();
  for (const x of [150, 360, 570]) enemy(sim, MORTAR, x, 230, { q: 1, qd: 0 });
  sim.px = 360 * ONE; sim.py = 1000 * ONE;
  let most = 0;
  for (let i = 0; i < 400; i++) { hold(sim); most = Math.max(most, sim.l3.zones.filter(z => z.act === 2).length); }
  assert.equal(most, L3_MORTAR_MAX);
  const z = sim.l3.zones.find(z => z.act === 2) ?? null;
  if (z) assert.ok(Math.abs(z.x - 360 * ONE) < 8 * ONE);
});

test('leg three: an aegis guard stops shots straight on; its flank can be hit', () => {
  const sim = bare(), e = enemy(sim, AEGIS, 360, 300);
  assert.equal(LEG3.blocks(sim, e, shotAt(360, 310)), true);
  assert.equal(LEG3.blocks(sim, e, shotAt(360 + L3_AEGIS_HALF + 6, 310)), false);
  sim.px = 500 * ONE;
  assert.equal(LEG3.aim(sim, e), L3_AEGIS_HALF + 8, 'the pilots aim at the flank on their side');
});

test('leg three: a crystal shot down sends four shards out diagonally, none straight down', () => {
  const sim = bare(), e = enemy(sim, CRYSTAL, 360, 300);
  sim.px = 100 * ONE; hold(sim);
  e.hp = 0; hold(sim); sim.bullets.length = 0; e.hp = 0;
  const s2 = bare(), c = enemy(s2, CRYSTAL, 360, 300);
  s2.px = 100 * ONE; hold(s2);                                // seen alive once
  c.hp = 0; s2.invuln = 5; step(s2, 0);                       // gone (as if shot): the burst comes at the next look
  s2.bullets.length = 0; hold(s2);
  const ours = s2.bullets.filter(b => b.c === 23);
  assert.equal(ours.length, 0, 'once only');
  const s3 = bare(), d = enemy(s3, CRYSTAL, 360, 300);
  s3.px = 100 * ONE; hold(s3); d.hp = 0;
  hold(s3);
  const shards = s3.bullets.filter(b => b.c === 23);
  assert.equal(shards.length, 4);
  assert.ok(shards.every(b => b.vx !== 0), 'diagonal');
});

test('leg three: the ship\'s past is kept; an echo fires at where the ship was', () => {
  const sim = bare(), e = enemy(sim, ECHO, 360, 220, { q: 1, qd: 0 });
  sim.px = 100 * ONE; sim.py = 1000 * ONE;
  for (let i = 0; i < 59; i++) { sim.px = (100 + i * 5) * ONE; hold(sim); }
  const [wx, wy] = pastPos(sim, L3_ECHO_LAG);
  assert.equal(wx, (100 + (59 - L3_ECHO_LAG) * 5) * ONE, 'the position of 48 ticks ago');
  sim.bullets.length = 0; hold(sim);
  const b = sim.bullets.find(b => b.c === 24);
  assert.ok(b, 'it fired');
  const a = angleOf(wx - e.x, wy - e.y), got = angleOf(b.vx, b.vy);
  assert.ok(Math.abs(((got - a + 128) & 255) - 128) <= 2, 'at the old position');
});

test('leg three: the pole between Phobos and Deimos stops shots; Deimos down, Phobos rages after a warning', () => {
  const sim = bare(), p = enemy(sim, PHOBOS, 200, 220);
  LEG3.boss(sim, p, 0, OPTS);
  const d = sim.enemies.find(e => e.type === DEIMOS);
  assert.ok(d);
  hold(sim);
  assert.equal(LEG3.blocks(sim, p, { x: (p.x + d.x) / 2, y: p.y, vx: 0, vy: 0 }), true);
  d.hp = 0; hold(sim);
  assert.equal(sim.l3.rage, L3_RAGE_WARN - 1, 'announced');
  for (let i = 0; i < L3_RAGE_WARN; i++) hold(sim);
  assert.equal(sim.l3.rage, -1);
});

test("leg three: Enyo's four covers; a boulder announced on one breaks it", () => {
  const sim = bare(), e = enemy(sim, ENYO, 360, 220);
  LEG3.boss(sim, e, 0, OPTS);
  assert.deepEqual(sim.obst.filter(o => o.vy === 0).map(o => o.x / ONE).sort((a, b) => a - b), [...L3_COVER_X]);
  LEG3.boss(sim, e, 90, OPTS);
  const z = sim.l3.zones.find(z => z.act === 1);
  assert.ok(z && z.from - sim.tick === L3_BOULDER_WARN);
  assert.ok(sim.obst.some(o => o.x === z.x && o.y === z.y), 'on a cover');
  sim.px = 360 * ONE; sim.py = 1200 * ONE;
  for (let i = 0; i <= L3_BOULDER_WARN; i++) hold(sim);
  assert.equal(sim.obst.filter(o => o.vy === 0).length, 3);
});

test("leg three: Amalthea's shield drops for good only after three of the horn's drones are shot down, not ones that got away", () => {
  const sim = bare(), e = enemy(sim, AMALTHEA, 360, 220);
  assert.equal(LEG3.blocks(sim, e, shotAt(360, 260)), true);
  const horn = [0, 1, 2, 3].map(i => enemy(sim, DRONE, 200 + i * 100, 400, { aux: -3 }));
  hold(sim);
  horn[0].y = 1400 * ONE; hold(sim);                          // one got away: it does not count
  horn[1].hp = 0; horn[2].hp = 0; hold(sim); hold(sim);
  assert.equal(sim.l3.shieldDown, 0, 'two are not enough');
  horn[3].hp = 0; hold(sim); hold(sim);
  assert.ok(sim.l3.shieldDown > L3_SHIELD_DOWN - 3);
  assert.equal(LEG3.blocks(sim, e, shotAt(360, 260)), false);
});

test('leg three: Pandora always drops a repair', () => {
  const sim = bare(), e = enemy(sim, PANDORA, 360, 220);
  LEG3.boss(sim, e, 0, OPTS);
  assert.equal(e.dr, 1);
});

test('leg three: Prometheus takes nothing while chained; the fire comes once, when the anchors and the eagle are down', () => {
  const sim = bare(), e = enemy(sim, PROMETHEUS, 360, 220);
  LEG3.boss(sim, e, 0, OPTS);
  assert.equal(sim.enemies.filter(o => o.type === ANCHOR).length, 2);
  assert.equal(sim.enemies.filter(o => o.type === EAGLE).length, 1);
  assert.equal(LEG3.scale(sim, e, 5), 0);
  LEG3.boss(sim, e, 100, OPTS);
  const cones = sim.l3.zones.filter(z => z.k === 2);
  assert.equal(cones.length, 2);
  assert.equal(danger(sim, e.x, 1100 * ONE, PLAYER_R, L3_CONE_WARN), false, 'the way straight down between them is clear');
  for (const o of sim.enemies) if (o.type === ANCHOR || o.type === EAGLE) o.hp = 0;
  hold(sim);
  assert.equal(sim.l3.freed, 1);
  assert.ok(sim.haste >= L3_GIFT - 2);
  assert.equal(LEG3.scale(sim, e, 5), 5);
  sim.haste = 0; sim.l3.chained = 0; LEG3.boss(sim, e, 0, OPTS);
  for (const o of sim.enemies) if (o.type === ANCHOR || o.type === EAGLE) o.hp = 0;
  hold(sim);
  assert.equal(sim.haste, 0, 'only once');
});

test("leg three: Janus's right face aims at where the ship's last ten ticks of motion take it", () => {
  const sim = bare();
  sim.py = 1000 * ONE;
  for (let i = 0; i < 20; i++) { sim.px = (200 + i * 6) * ONE; hold(sim); }
  const [ax] = aheadPos(sim, L3_JANUS_AHEAD), [bx] = pastPos(sim, L3_JANUS_BASE);
  assert.equal(bx, sim.px - 9 * 6 * ONE, 'ten ticks back (the present position was recorded a tick ago)');
  assert.equal(ax, sim.px + Math.trunc(((sim.px - bx) * L3_JANUS_AHEAD) / L3_JANUS_BASE));
  assert.ok(ax > sim.px, 'ahead of the ship, the way it is going');
});

test('leg three no forced hit: the fire rain leaves room between its circles, and the room is on the screen', () => {
  const sim = bare(), e = enemy(sim, ENYO, 360, 220, { st: 2 });
  LEG3.boss(sim, e, 0, OPTS);
  LEG3.boss(sim, e, 60, { ...OPTS, sig: true, rage: true });
  const c = sim.l3.zones.filter(z => z.k === 3);
  assert.equal(c.length, 14);
  for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) assert.ok(Math.hypot(c[i].x - c[j].x, c[i].y - c[j].y) / ONE >= 200);
  let safe = false;
  for (let y = PLAYER_MIN_Y; y <= PLAYER_MAX_Y && !safe; y += 20) for (let x = PLAYER_MARGIN_X; x <= WORLD_W - PLAYER_MARGIN_X; x += 20) if (!danger(sim, x * ONE, y * ONE, PLAYER_R, c[13].from - sim.tick)) { safe = true; break; }
  assert.ok(safe && L3_RAIN_R < 100);
});
