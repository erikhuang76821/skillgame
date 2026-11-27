// Game-rule determinism and fairness. Rewrite the bodies for your game, keep the test names (spec §12).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Recorder, playMatch, verify, replay } from '../src/sim/core/index.js';
import { GAME, createSim, step, encodeX } from '../src/sim/sim.js';
import { BOTS } from '../tools/bots.mjs';
import { runDominance } from '../tools/lib/dominance.mjs';

test('same seed + same inputs => identical result', () => {
  assert.deepEqual(playMatch(GAME, 1234, BOTS.expert).result(), playMatch(GAME, 1234, BOTS.expert).result());
});

test('golden match (cross-engine determinism; update only when GAME.version is bumped)', () => {
  assert.deepEqual(playMatch(GAME, 1234, BOTS.expert).result(),
    { game: 'gate-lane', version: 3, seed: 1234, ticks: 5369, score: 4951, hash: 2753871742 });
});

test('uploaded match verifies; tampered score does not', () => {
  const up = playMatch(GAME, 98765, BOTS.intermediate).upload();
  assert.equal(verify(GAME, up).valid, true);
  assert.equal(verify(GAME, { ...up, score: up.score + 10 }).valid, false);
});

test('different seeds diverge', () => {
  assert.notEqual(playMatch(GAME, 1, BOTS.expert).result().hash, playMatch(GAME, 2, BOTS.expert).result().hash);
});

test('the challenge depends only on the seed, not on player behaviour (fairness E2)', () => {
  const course = x => {
    const sim = createSim(77);
    for (let t = 0; t < 600; t++) step(sim, encodeX(x(t)));
    const c = createSim(77);
    return JSON.stringify([c.zombies.map(z => [z.x, z.y, z.maxHp]), c.gates.map(g => [g.kind, g.y]), c.barrels.map(b => [b.x, b.y, b.maxHp])]);
  };
  assert.equal(course(() => 0), course(t => (t * 7) % 600));
  // Two different players see the same gates, barrels and zombie spawns.
  const a = createSim(77), b = createSim(77);
  for (let t = 0; t < 300; t++) { step(a, encodeX(100)); step(b, encodeX(500)); }
  assert.deepEqual(a.barrels.map(x => [x.x, x.y, x.maxHp]), b.barrels.map(x => [x.x, x.y, x.maxHp]));
  assert.deepEqual(a.gates.map(g => g.y), b.gates.map(g => g.y));
});

test('render events never change the outcome (recordEvents off = same hash)', () => {
  const rec = new Recorder(GAME, 4242);                  // events on, like the live client
  while (rec.phase !== 'over') rec.step(BOTS.novice.input(rec.sim));
  assert.equal(rec.sim.recordEvents, true);
  const r = replay(GAME, 4242, rec.log, rec.choices, rec.ticks);   // events off, like the server
  assert.equal(r.hash, rec.result().hash);
});

test('skill dominates on the same seeds (gdd/03 thresholds)', () => {
  const r = runDominance(GAME, BOTS, 12);
  assert.ok(r.pass, `skill share ${r.shares.skillTier.toFixed(2)}, top win rate ${r.top.toFixed(2)}`);
});

test('full-match replay fits the server budget', () => {
  const rec = playMatch(GAME, 4242, BOTS.expert);
  const t0 = performance.now();
  assert.equal(replay(GAME, 4242, rec.log, rec.choices, rec.ticks).valid, true);
  assert.ok(performance.now() - t0 < 500);
});
