import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim, makeOffer, IN_DASH, IN_HOWL } from '../src/sim/sim.js';
import { Recorder, replay, encodeLog, decodeLog } from '../src/sim/replay.js';
import { hash32 } from '../src/sim/rng.js';
import { SIN, COS } from '../src/sim/fixed.js';

// Scripted "player": circles the arena, dashes on a timer, howls when charged.
// `style` changes the route so two bots on one seed behave differently.
function play(seed, style = 0) {
  const rec = new Recorder(seed);
  while (rec.sim.state !== 'over') {
    const s = rec.sim;
    if (s.state === 'levelup') { rec.choose((s.levelups + style) % 3); continue; }
    const dir = 1 + ((Math.floor(s.tick / (40 + style * 7)) + style) % 8);
    let input = dir;
    if (s.tick % 150 === 75) input |= IN_DASH;
    if (s.player.howl >= 100) input |= IN_HOWL;
    rec.step(input);
  }
  return rec;
}

test('same seed + same inputs => identical result', () => {
  const a = play(1234).result(), b = play(1234).result();
  assert.deepEqual(a, b);
  assert.ok(a.ticks > 600, `bot should survive a while, got ${a.ticks} ticks`);
});

test('replay of the recorded log verifies the claimed score', () => {
  const rec = play(98765, 1);
  const res = rec.result();
  const enc = encodeLog(rec.log, res.ticks);
  const r = replay(rec.seed, decodeLog(enc), rec.choices);
  assert.equal(r.valid, true);
  assert.equal(r.score, res.score);
  assert.equal(r.hash, res.hash);
  assert.ok(enc.length < 4096, `encoded log ${enc.length} B`);
});

test('tampered log fails verification', () => {
  const rec = play(555, 2);
  const res = rec.result();
  const log = rec.log.slice();
  for (let i = 300; i < 900; i++) log[i] = 3; // run right instead
  const r = replay(rec.seed, log, rec.choices);
  assert.ok(!r.valid || r.hash !== res.hash);
});

test('first level-up offer depends only on the seed (fairness)', () => {
  for (const seed of [1, 2, 3, 42, 777]) {
    const a = createSim(seed), b = createSim(seed);
    b.player.x += 5000; b.kills = 99; // different behaviour, same state of upgrades
    a.levelups = b.levelups = 1;
    assert.deepEqual(makeOffer(a), makeOffer(b));
  }
});

test('different seeds diverge', () => {
  assert.notEqual(play(1).result().hash, play(2).result().hash);
});

test('trig table and hash are exact constants (cross-engine guard)', () => {
  assert.equal(SIN[64], 256);
  assert.equal(COS[0], 256);
  assert.equal(SIN[32], 181);
  // Golden values: run this suite on every target engine (Node/V8, Safari/JSC, Firefox) in CI.
  // Any drift means client and server replays would disagree.
  assert.equal([...SIN].reduce((s, v) => s + v * v, 0), 8388772);
  assert.equal(hash32(1, 2, 3), 1647877407);
});

test('golden match hash (cross-engine determinism)', () => {
  assert.deepEqual(play(1234).result(), { seed: 1234, score: 1076, hash: 20147071, ticks: 3675 });
});

test('full-match replay cost (server verification budget)', () => {
  const rec = play(4242, 3);
  const t0 = performance.now();
  const r = replay(rec.seed, rec.log, rec.choices);
  const ms = performance.now() - t0;
  console.log(`replay ${r.sim.tick} ticks, score ${r.score}, ${ms.toFixed(1)} ms`);
  assert.equal(r.valid, true);
});

test('skill matters on the same seed: kiting bot beats random walker', async () => {
  const { playMatch } = await import('../tools/bots.mjs');
  const { score } = await import('../src/sim/sim.js');
  for (const seed of [11, 22, 33]) {
    assert.ok(score(playMatch(seed, 'intermediate').sim) > score(playMatch(seed, 'novice').sim));
  }
});
