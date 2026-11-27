// Core guarantees, independent of the game rules. Keep this file unchanged in every game.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hash32, makeRng, seedFromString, SIN, COS, angleOf, createHasher,
  Recorder, replay, verify, encodeLog, decodeLog, playMatch,
} from '../src/sim/core/index.js';

test('golden constants (run on every target engine: Node/V8, Safari/JSC, Firefox)', () => {
  // Any drift here means client and server replays would disagree.
  assert.equal(hash32(1, 2, 3), 1647877407);
  assert.equal(seedFromString('daily-2026-10-19'), 1943510868);
  assert.equal([...SIN].reduce((s, v) => s + v * v, 0), 8388772);
  assert.equal(SIN[64], 256);
  assert.equal(COS[0], 256);
  assert.equal(SIN[32], 181);
  const r = makeRng({ a: 1 });
  assert.equal(r(42, 'a', 0), 481396865);
  assert.equal(r.shuffle(42, 'a', 0, [1, 2, 3, 4, 5]).join(','), '4,2,1,3,5');
});

test('rng is stateless: order of draws never changes values', () => {
  const r = makeRng({ spawn: 1, offer: 2 });
  const forward = [0, 1, 2, 3].map(i => r(7, 'spawn', i));
  r(7, 'offer', 99);
  const backward = [3, 2, 1, 0].map(i => r(7, 'spawn', i)).reverse();
  assert.deepEqual(forward, backward);
  assert.notEqual(r(7, 'spawn', 0), r(7, 'offer', 0));
  assert.throws(() => r(7, 'typo', 0));
  for (let i = 0; i < 200; i++) {
    const v = r.range(7, 'spawn', i, 3, 5);
    assert.ok(v >= 3 && v <= 5);
  }
});

test('angleOf inverts the trig table exactly', () => {
  for (let a = 0; a < 256; a++) assert.equal(angleOf(COS[a] * 1000, SIN[a] * 1000), a);
  assert.equal(angleOf(1, 1), 32);
  assert.equal(angleOf(0, -3), 192);
});

// A tiny game with a mid-match choice, to exercise Recorder / replay / verify.
const MINI = {
  id: 'mini', version: 3, maxTicks: 120,
  createSim: seed => ({ seed, tick: 0, x: 0, mult: 1, picked: false }),
  step(s, input) { s.x += (input & 3) * s.mult; s.tick++; },
  phase: s => (s.tick >= 100 ? 'over' : s.tick === 50 && !s.picked ? 'choice' : 'play'),
  choose(s, i) { if (i < 0 || i > 2) return false; s.mult = i + 1; s.picked = true; return true; },
  score: s => s.x,
  stateHash: s => createHasher(s.tick).mixAll([s.x, s.mult]).value(),
};
const policy = { input: s => hash32(s.seed, 1, s.tick) & 3, pick: () => 2 };

test('record -> upload -> verify round trip', () => {
  const rec = playMatch(MINI, 99, policy);
  const up = rec.upload();
  assert.equal(up.ticks, 100);
  assert.deepEqual(up.choices, [[50, 0, 2]]);
  const v = verify(MINI, up);
  assert.equal(v.valid, true);
  assert.equal(v.score, up.score);
});

test('verify rejects tampering, wrong version, wrong choices, overlong logs', () => {
  const up = playMatch(MINI, 99, policy).upload();
  assert.equal(verify(MINI, { ...up, score: up.score + 1 }).valid, false);
  assert.equal(verify(MINI, { ...up, version: 2 }).valid, false);
  assert.equal(verify(MINI, { ...up, choices: [[50, 0, 0]] }).valid, false);
  assert.equal(verify(MINI, { ...up, choices: [] }).valid, false);
  assert.equal(verify(MINI, { ...up, ticks: 110 }).valid, false);
  const log = decodeLog(up.log, MINI.maxTicks);
  log[10] ^= 1;
  assert.equal(verify(MINI, { ...up, log: encodeLog(log, up.ticks) }).valid, false);
});

test('log encoding is lossless and compact', () => {
  const log = new Uint8Array(10800);
  for (let i = 0; i < log.length; i++) log[i] = (i >> 7) & 9;
  const enc = encodeLog(log);
  assert.deepEqual(decodeLog(enc, log.length), log);
  assert.ok(enc.length < 2048, `${enc.length} B`);
});

test('recorder refuses input outside the play phase', () => {
  const rec = new Recorder(MINI, 1);
  for (let i = 0; i < 50; i++) rec.step(1);
  assert.equal(rec.phase, 'choice');
  assert.equal(rec.step(1), false);
  assert.equal(rec.choose(5), false);
  assert.equal(rec.choose(0), true);
  assert.equal(replay(MINI, 1, rec.log, rec.choices, rec.ticks).valid, false, 'claimed 50 ticks, match needs 100');
});
