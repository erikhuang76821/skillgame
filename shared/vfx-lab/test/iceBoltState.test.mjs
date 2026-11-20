import test from 'node:test';
import assert from 'node:assert/strict';
import { planIceBolt, iceBoltAt } from '../src/fx/iceBoltState.js';
import { FEEL } from '../src/fx/feel.js';

const mk = (over = {}, seed = 1) => planIceBolt({ from: { x: 0, y: 0 }, to: { x: 600, y: 0 }, seed, p: { ...FEEL.iceBolt, ...over } });

test('state is a pure function of (plan, t): same seed, same t, same frame', () => {
  assert.deepEqual(iceBoltAt(mk(), 0.4), iceBoltAt(mk(), 0.4));
});

test('different seeds scatter shards differently', () => {
  assert.notDeepEqual(iceBoltAt(mk({}, 1), 0.4).shards, iceBoltAt(mk({}, 2), 0.4).shards);
});

test('core reaches the target at impact, shards and flash only appear after impact', () => {
  const p = mk();
  const before = iceBoltAt(p, p.impactAt - 1e-6);
  assert.ok(before.core.visible && Math.abs(before.core.x - 600) < 0.01);
  assert.ok(before.shards.every((s) => !s.visible) && !before.flash.visible);
  const after = iceBoltAt(p, p.impactAt + 0.01);
  assert.ok(!after.core.visible && after.flash.visible && after.shards.some((s) => s.visible));
});

test('changing flightPreview moves impact and clear time together (clear = impact + clearAfterImpact)', () => {
  const p = mk({ flightPreview: 0.5 });
  assert.equal(p.impactAt, 0.5);
  assert.equal(p.end, 0.5 + FEEL.iceBolt.clearAfterImpact);
});

test('nothing is left visible at the end', () => {
  const p = mk();
  const s = iceBoltAt(p, p.end);
  assert.ok(s.done && !s.core.visible && !s.flash.visible);
  assert.ok(s.shards.every((d) => !d.visible) && s.trail.every((d) => d.alpha === 0));
});
