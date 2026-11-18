// Game-rule determinism and fairness for LanternHold (spec 禮12).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Recorder, playMatch, verify, replay } from '../src/sim/core/index.js';
import { GAME, createSim, step, choose, phase, OP, encode, REDEPLOY_CD, EVENTS, CHOICE, CARDS, EVOS } from '../src/sim/sim.js';
import { BOTS } from '../tools/bots.mjs';

test('same seed + same inputs => identical result', () => {
  assert.deepEqual(playMatch(GAME, 1234, BOTS.expert).result(), playMatch(GAME, 1234, BOTS.expert).result());
});

test('golden match (cross-engine determinism; update only when GAME.version is bumped)', () => {
  const r = playMatch(GAME, 1234, BOTS.expert).result();
  assert.deepEqual(r, GOLDEN, JSON.stringify(r));
});
const GOLDEN = { game: 'lantern-hold', version: 5, seed: 1234, ticks: 16200, score: 2538, hash: 3817885536 };

test('uploaded match verifies; tampered score does not', () => {
  const up = playMatch(GAME, 98765, BOTS.intermediate).upload();
  assert.equal(verify(GAME, up).valid, true);
  assert.equal(verify(GAME, { ...up, score: up.score + 10 }).valid, false);
});

test('different seeds diverge', () => {
  assert.notEqual(playMatch(GAME, 1, BOTS.expert).result().hash, playMatch(GAME, 2, BOTS.expert).result().hash);
});

test('the challenge depends only on the seed, not on player behaviour (fairness E2)', () => {
  const spawns = policy => {
    const sim = createSim(77), seen = [];
    for (let t = 0; t < EVENTS[3].at; t++) { step(sim, policy(sim, t)); for (const e of sim.events) if (e.type === 'spawn') seen.push(`${e.kind}@${e.gate}`); }
    return { seen, gates: sim.eventState.map(e => e.gates.join()) };
  };
  const idle = spawns(() => 0);
  const busy = spawns((sim, t) => [1, 0, 0][t % 3] && t < 6 ? [OP.BUILD, 0, 0][t % 3] : 0);
  assert.deepEqual(idle.gates, busy.gates);
  assert.deepEqual(idle.seen.slice(0, 20), busy.seen.slice(0, 20));
});

test('render events never change the outcome (recordEvents off = same hash)', () => {
  const rec = new Recorder(GAME, 4242);
  while (rec.phase !== 'over') { if (rec.phase === 'choice') rec.choose(BOTS.novice.pick(rec.sim)); else rec.step(BOTS.novice.input(rec.sim)); }
  const r = replay(GAME, 4242, rec.log, rec.choices, rec.ticks);
  assert.equal(r.hash, rec.result().hash);
});

test('redeploy: a unit cannot be moved again during its cooldown, and a refused command changes nothing', () => {
  const sim = createSim(5);
  const feed = cmd => { for (const b of cmd) step(sim, b); };
  const archer = sim.units.findIndex(u => u.alive);
  feed(encode(OP.MOVE, archer, 9 * 12 + 6));
  const u = sim.units[archer];
  assert.equal(u.state, 'moving');
  const home = [u.hx, u.hy];
  feed(encode(OP.MOVE, archer, 9 * 12 + 4));            // still cooling down -> ignored
  assert.deepEqual([u.hx, u.hy], home);
  for (let t = 0; t < REDEPLOY_CD; t++) step(sim, 0);
  feed(encode(OP.MOVE, archer, 9 * 12 + 4));
  assert.notDeepEqual([u.hx, u.hy], home);
});

test('placement outside the light and away from allies is refused', () => {
  const sim = createSim(5);
  const archer = sim.units.findIndex(u => u.alive);
  for (const b of encode(OP.MOVE, archer, 0)) step(sim, b);  // top-left corner cell
  assert.equal(sim.units[archer].state, 'guard');
});

test('a full match replays within the server budget', () => {
  const rec = playMatch(GAME, 31337, BOTS.expert);
  const t0 = performance.now();
  replay(GAME, 31337, rec.log, rec.choices, rec.ticks);
  assert.ok(performance.now() - t0 < 500, `${(performance.now() - t0).toFixed(0)} ms`);
});

// --- cards (gdd/06) ---
const toOffer = sim => { while (phase(sim) === 'play') step(sim, 0); return sim.offer.ids.slice(); };

test('the k-th offer is the same for every player who reaches it with the same cards (fairness E2)', () => {
  const a = createSim(321), b = createSim(321);
  const oa = toOffer(a);
  for (const x of encode(OP.WALL, 3, 0)) step(b, x);        // b plays differently before the first level-up
  assert.deepEqual(toOffer(b), oa);
});

test('reroll and ban: limited, and a refused choice changes nothing', () => {
  const sim = createSim(99);
  const first = toOffer(sim);
  assert.equal(choose(sim, CHOICE.REROLL), true);
  assert.notDeepEqual(sim.offer.ids, first);
  assert.equal(choose(sim, CHOICE.REROLL), true);
  assert.equal(choose(sim, CHOICE.REROLL), false);           // out of rerolls
  const banned = sim.offer.ids[1];
  assert.equal(choose(sim, CHOICE.BAN + 1), true);
  assert.equal(sim.banned[banned], true);
  assert.ok(!sim.offer.ids.includes(banned));
  assert.equal(choose(sim, CHOICE.BAN), false);              // out of bans
  assert.equal(choose(sim, 7), false);
  assert.equal(choose(sim, 0), true);
  assert.equal(sim.picks, 1);
});

test('a ready evolution is always offered first', () => {
  const sim = createSim(7);
  toOffer(sim);
  sim.cards.rapid = 3; sim.cards.split = 1;                  // set up the recipe directly
  sim.offer = null; sim.pending = 1;
  step(sim, 0);                                               // the next tick opens a fresh offer
  assert.equal(sim.offer.ids[0], 'arrowStorm');
  assert.equal(choose(sim, 0), true);
  assert.equal(sim.evo.arrowStorm, true);
});

test('card picks replay: same seed, inputs and choices give the same hash', () => {
  const rec = playMatch(GAME, 2024, BOTS.expert);
  assert.ok(rec.choices.length >= 5, `only ${rec.choices.length} picks`);
  const r = replay(GAME, 2024, rec.log, rec.choices, rec.ticks);
  assert.equal(r.valid, true);
  assert.equal(r.hash, rec.result().hash);
  const bad = rec.choices.map((c, k) => (k === 0 ? [c[0], c[1], (c[2] + 1) % 3] : c));
  assert.notEqual(replay(GAME, 2024, rec.log, bad, rec.ticks).hash, rec.result().hash);
});
