// Tests for context.mjs (the dynamic index) and the GateLane pilot of decision 2026-11-10 §6 phase C.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContext, facetMatch, loadProfile, renderPack, resolveValues, ruleApplies } from './context.mjs';
import { findRoot } from './rules.mjs';

const root = findRoot(fileURLToPath(import.meta.url));
const pilot = JSON.parse(readFileSync(join(root, 'shared', 'tools', 'fixtures', 'context-pilot.json'), 'utf8')).steps;

test('facet match: exact, explicit "*", unknown ranks lower, unknown jurisdiction never matches, all-unknown does not match', () => {
  assert.deepEqual(facetMatch({ topic: ['art'], genre: ['rhythm'] }, { topic: ['art'], genre: ['rhythm'] }), { ok: true, exact: 2, unknown: 0 });
  assert.deepEqual(facetMatch({ topic: ['art'], genre: ['*'] }, { topic: ['art'], genre: ['rhythm'] }), { ok: true, exact: 1, unknown: 0 });
  assert.deepEqual(facetMatch({ topic: ['art'] }, { topic: ['art'], genre: ['rhythm'] }), { ok: true, exact: 1, unknown: 1 });
  assert.equal(facetMatch({ topic: ['art'], genre: ['physics'] }, { genre: ['rhythm'] }).ok, false);
  assert.equal(facetMatch({ topic: ['legal'] }, { topic: ['legal'], jurisdiction: ['TW'] }).ok, false);
  assert.equal(facetMatch({ topic: ['legal'], jurisdiction: ['*'] }, { jurisdiction: ['TW'] }).ok, true);
  assert.equal(facetMatch({ topic: ['art'] }, { source: ['af-x'] }).ok, false);
  assert.equal(facetMatch({}, { kind: ['method'] }).ok, true);
});

test('$profile values resolve; rule scope selectors exclude what does not apply to the game', () => {
  assert.deepEqual(resolveValues({ genre: '$profile.genre', topic: ['art'] }, { genre: ['rhythm'] }), { genre: ['rhythm'], topic: ['art'] });
  const prof = { genre: ['lane-shooter'], renderer: ['2d'], source: ['af-gate-lane-shooter'] };
  assert.equal(ruleApplies({ scope: { selector: { genre: 'rhythm' } } }, prof), false);
  assert.equal(ruleApplies({ scope: { selector: { renderer: '3d' } } }, prof), false);
  assert.equal(ruleApplies({ scope: { selector: { source: 'ad-funnel' } } }, prof), true);
  assert.equal(ruleApplies({ scope: { selector: { source: 'ad-funnel' } } }, { source: ['original'] }), false);
});

test('every game profile validates against the facet vocabulary', () => {
  for (const g of ['GateLane', 'TwinStrike', 'SwarmDuel']) assert.deepEqual(loadProfile(root, g).errors, [], g);
});

for (const step of pilot) {
  test(`GateLane pilot «${step.name}»: the final pack covers the hand-written must-read pages`, () => {
    const { errors, pack } = buildContext(root, 'GateLane', step);
    assert.deepEqual(errors, []);
    const pages = new Set(pack.cards.map(c => c.id.split('.')[0]));
    for (const p of step.expectPages) assert.ok(pages.has(p), `${p} 不在脈絡包`);
    assert.ok(pack.budget.used <= pack.budget.kbTokens);
    assert.ok(pack.cards.every(c => c.text.length > 0), 'every card carries its text');
    const gate = pack.rules.filter(r => r.gate).map(r => r.id);
    const floor = pack.cards.filter(c => c.why === 'floor');
    assert.ok(floor.length > 0 || gate.length === 0 || !step.gate, 'gate rules bring their cards in as floor');
    assert.match(renderPack(pack), /^# Context pack — GateLane/);
  });
}

test('rhythm-only rules are not applicable to GateLane but are to TwinStrike', () => {
  const step = pilot.find(s => s.id === 'difficulty');
  const gl = buildContext(root, 'GateLane', step).pack, ts = buildContext(root, 'TwinStrike', step).pack;
  assert.ok(gl.notApplicable.includes('RULE-CURVE-BEATGRID'));
  assert.ok(ts.rules.some(r => r.id === 'RULE-CURVE-BEATGRID'));
});

test('a floor larger than the budget is an error, never a truncation', () => {
  const step = { ...pilot.find(s => s.id === 'difficulty'), budget: { kbTokens: 10 } };
  const { errors, pack } = buildContext(root, 'GateLane', step);
  assert.match(errors.join(), /保底卡片共 \d+ tokens，超過預算 10/);
  assert.ok(pack.cards.every(c => c.why === 'floor'));
});

test('tests are listed cheapest first and say whether this game can run them', () => {
  const { pack } = buildContext(root, 'GateLane', pilot.find(s => s.id === 'tech'));
  const order = ['cheap', 'medium', 'heavy', 'human'];
  assert.deepEqual(pack.tests.map(t => order.indexOf(t.cost)), [...pack.tests.map(t => order.indexOf(t.cost))].sort((a, b) => a - b));
  assert.ok(pack.tests.find(t => t.id === 'TEST-SIZE').runnable);
});
