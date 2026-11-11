// Game-rule determinism and fairness. Rewrite the bodies for your game, keep the test names (spec §12).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Recorder, playMatch, verify, replay } from '../src/sim/core/index.js';
import { GAME, IN_TAP, createSim, step } from '../src/sim/sim.js';
import { BOTS } from '../tools/bots.mjs';
import { runDominance } from '../tools/lib/dominance.mjs';

test('same seed + same inputs => identical result', () => {
  assert.deepEqual(playMatch(GAME, 1234, BOTS.expert).result(), playMatch(GAME, 1234, BOTS.expert).result());
});

test('golden match (cross-engine determinism; update only when GAME.version is bumped)', () => {
  assert.deepEqual(playMatch(GAME, 1234, BOTS.expert).result(),
    { game: 'beat-tap', version: 2, seed: 1234, ticks: 1800, score: 423, hash: 2394985397 });
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
  const beats = taps => {
    const sim = createSim(77), seen = [];
    for (let t = 0; t < GAME.maxTicks; t++) {
      if (!seen.includes(sim.nextBeat)) seen.push(sim.nextBeat);
      step(sim, taps(t) ? IN_TAP : 0);
    }
    return seen;
  };
  assert.deepEqual(beats(() => false), beats(t => t % 3 === 0));
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

// Only games with scripted progression have a difficulty curve to check (RULE-CURVE-*, RULE-GAME-DOCS). A game whose
// <Game>/game.profile.json says scriptedProgression: false skips this test; the template itself (no profile) runs it.
const noCurve = (() => {
  try { return JSON.parse(readFileSync(new URL('../../game.profile.json', import.meta.url), 'utf8')).scriptedProgression === false; } catch { return false; }
})();

test('scripted difficulty curve passes the D-gates (knowledge-base/16; full report: npm run playtest)', { skip: noCurve && 'game.profile.json: scriptedProgression is false' }, async () => {
  const { execFileSync } = await import('node:child_process');
  // tools/playtest.mjs exits 1 when any check fails; 8 seeds keep the test fast
  assert.doesNotThrow(() => execFileSync(process.execPath, ['tools/playtest.mjs', '8'], { cwd: new URL('..', import.meta.url), stdio: 'pipe' }));
});

test('full-match replay fits the server budget', () => {
  const rec = playMatch(GAME, 4242, BOTS.expert);
  const t0 = performance.now();
  assert.equal(replay(GAME, 4242, rec.log, rec.choices, rec.ticks).valid, true);
  assert.ok(performance.now() - t0 < 500);
});
