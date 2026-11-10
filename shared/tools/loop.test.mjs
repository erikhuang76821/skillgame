// Tests for loop.mjs (decision 2026-11-10 §4.2–§4.3, §8 item 3, phase D) and the profile-scoped card filter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContext, fitsProfile } from './context.mjs';
import { loadVocabulary } from './kb-index.mjs';
import { applyMustRead, checkNodes, deriveStatus, formatEvent, loadNodes, parseEvent, planGate, routeFor, runGate, topoOrder } from './loop.mjs';
import { findRoot, loadRules } from './rules.mjs';

const root = findRoot(fileURLToPath(import.meta.url));
const doc = loadNodes(root), nodes = doc.nodes;
const ctx = () => ({
  ruleIds: loadRules({ from: root }).rules.map(r => r.id),
  testIds: JSON.parse(readFileSync(join(root, 'shared', 'tests', 'registry.json'), 'utf8')).tests.map(t => t.id),
  vocab: loadVocabulary(root),
});

test('nodes.json validates and is acyclic, N0 first', () => {
  assert.deepEqual(checkNodes(doc, ctx()).errors, []);
  assert.equal(topoOrder(nodes)[0], 'N0-kickoff');
});

test('checkNodes rejects unknown rules, tests, gotos, facets and cycles', () => {
  const bad = { schemaVersion: 1, nodes: [
    { id: 'N0-a', name: 'a', after: ['N1-b'], budget: { kbTokens: 0 }, maxIterations: 1, gate: { must: ['RULE-NOPE'], tests: ['TEST-NOPE'] }, pull: { kb: { genre: ['chess'] } }, onFail: [{ when: 'x', goto: 'N9-zz' }] },
    { id: 'N1-b', name: 'b', after: ['N0-a'], budget: { kbTokens: 0 }, maxIterations: 1, gate: { must: [] }, produces: ['../x'] },
  ] };
  const e = checkNodes(bad, ctx()).errors.join('\n');
  for (const m of ['RULE-NOPE', 'TEST-NOPE', 'N9-zz', 'chess', '循環', '../x']) assert.match(e, new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

// Phase C pilot steps → the nodes that replaced them: the union of their GateLane packs still covers the hand-written pages.
const pilot = JSON.parse(readFileSync(join(root, 'shared', 'tools', 'fixtures', 'context-pilot.json'), 'utf8')).steps;
const MAP = { kickoff: ['N0-kickoff', 'N1-derandomize'], adaptation: ['N2-spec'], spec: ['N2-spec'], difficulty: ['N5-tune'], feel: ['N7-feel'], art: ['N6-art'], tech: ['N8-budget', 'N4-sim'] };
test('every node builds a GateLane pack without errors, and the nodes cover the phase C pilot pages', () => {
  const pages = new Map();
  for (const n of nodes) {
    const { errors, pack } = buildContext(root, 'GateLane', n);
    assert.deepEqual(errors, [], n.id);
    pages.set(n.id, new Set(pack.cards.map(c => c.id.split('.')[0])));
  }
  for (const s of pilot) for (const p of s.expectPages) assert.ok(MAP[s.id].some(id => pages.get(id).has(p)), `${s.id}: ${p} 不在 ${MAP[s.id].join('/')}`);
});

test('cards scoped to another source / genre stay out of the pack', () => {
  assert.equal(fitsProfile({ source: ['af-x'] }, { source: ['original'] }), false);
  assert.equal(fitsProfile({ source: ['af-x'] }, { source: ['af-x'] }), true);
  assert.equal(fitsProfile({ genre: ['*'] }, { genre: ['rhythm'] }), true);
  assert.equal(fitsProfile({ topic: ['art'] }, { genre: ['rhythm'] }), true);
  const n1 = nodes.find(n => n.id === 'N1-derandomize'), n2 = nodes.find(n => n.id === 'N2-spec');
  assert.ok(!buildContext(root, 'TwinStrike', n1).pack.cards.some(c => c.id.startsWith('KB-af-')));
  assert.ok(buildContext(root, 'GateLane', n2).pack.cards.some(c => c.id.startsWith('KB-af-gate-lane-shooter')));
});

test('event files round-trip (front-matter is one JSON value per key)', () => {
  const ev = { schema: 1, eventId: '2026-11-10-N4-sim-1', parent: null, type: 'gate', node: 'N4-sim', result: 'pass', rules: [{ id: 'R', result: 'pass' }], route: { goto: ['N5-tune'], reason: '關卡通過' }, at: '2026-11-10T00:00:00.000Z' };
  assert.deepEqual(parseEvent(formatEvent(ev, '# body\n')), ev);
});

// deriveStatus is pure: events + current hashes.
const H = (i = 'i', o = 'o') => Object.fromEntries(nodes.map(n => [n.id, { inputHash: i, outputHash: o }]));
const gate = (node, result, { at = 1, ...extra } = {}) => ({ type: 'gate', node, result, inputHash: 'i', outputHash: 'o', needsApproval: false, eventId: `${node}-${at}`, at: `t${at}`, ...extra });
test('status: todo, pass, awaiting approval, approval binds to the output hash, stale, escalated, reopened, waived', () => {
  assert.equal(deriveStatus(nodes, [], H()).current, 'N0-kickoff');
  const pass0 = gate('N0-kickoff', 'pass', { needsApproval: true, at: 1 });
  assert.equal(deriveStatus(nodes, [pass0], H()).nodes['N0-kickoff'].status, 'awaiting-approval');
  const ok = { type: 'approval', node: 'N0-kickoff', inputHash: 'i', outputHash: 'o', approval: { by: 'pm' }, eventId: 'a', at: 't2' };
  const st = deriveStatus(nodes, [pass0, ok], H());
  assert.equal(st.nodes['N0-kickoff'].status, 'passed');
  assert.equal(st.current, 'N1-derandomize');
  assert.equal(deriveStatus(nodes, [pass0, ok], H('i', 'changed')).nodes['N0-kickoff'].status, 'stale');
  const fails = [1, 2, 3].map(at => gate('N1-derandomize', 'fail', { at: at + 2 }));
  assert.equal(deriveStatus(nodes, [pass0, ok, ...fails], H()).nodes['N1-derandomize'].status, 'escalated');
  assert.equal(deriveStatus(nodes, [pass0, ok, fails[0]], H()).nodes['N1-derandomize'].iteration, 1);
  const back = { type: 'rollback', node: 'N1-derandomize', rollback: 'N0-kickoff', inputHash: 'i', outputHash: 'o', eventId: 'r', at: 't9' };
  const re = deriveStatus(nodes, [pass0, ok, back], H());
  assert.equal(re.nodes['N0-kickoff'].status, 'reopened');
  assert.equal(re.current, 'N0-kickoff');
  const waive = { type: 'approval', node: 'N9-human', inputHash: 'i', outputHash: 'o', approval: { by: 'pm', waive: true }, eventId: 'w', at: 't9' };
  assert.equal(deriveStatus(nodes, [waive], H()).nodes['N9-human'].status, 'waived');
});

test('gate: cheap tests all run, medium stops at the first failure, review needs approval, missing needs block', async () => {
  const t = (id, cost, impl, kind = 'script', runnable = true) => ({ id, kind, cost, implements: impl, run: id, cwd: '.', runnable, missing: runnable ? [] : ['x'] });
  const pack = {
    rules: ['R-A', 'R-B', 'R-C', 'R-D', 'R-E'].map(id => ({ id, level: 'must', gate: true })),
    tests: [t('M2', 'medium', ['R-C']), t('C1', 'cheap', ['R-A']), t('C2', 'cheap', ['R-B']), t('M1', 'medium', ['R-B']), t('V', 'human', ['R-D'], 'review'), t('X', 'medium', ['R-E'], 'script', false)],
  };
  const ran = [];
  const runner = x => { ran.push(x.id); return { ok: !['C1', 'M1'].includes(x.id), detail: 'boom' }; };
  const node = { id: 'N5-tune', produces: [], gate: { must: ['R-*'] }, checkpoint: null };
  const g = await runGate(root, 'GateLane', node, { pack, runner, registry: [] });
  assert.deepEqual(ran, ['C1', 'C2', 'M1']);                 // M2 is not run after M1 failed
  assert.deepEqual(planGate(pack.tests).map(x => x.id).slice(0, 2), ['C1', 'C2']);
  const r = Object.fromEntries(g.rules.map(x => [x.id, x.result]));
  assert.deepEqual(r, { 'R-A': 'fail', 'R-B': 'fail', 'R-C': 'not-run', 'R-D': 'review', 'R-E': 'not-run' });
  assert.equal(g.result, 'fail');
  assert.equal(g.needsApproval, true);
});

test('route: most upstream onFail target, owner node for unrouted rules, escalation at maxIterations', () => {
  const n5 = nodes.find(n => n.id === 'N5-tune'), n10 = nodes.find(n => n.id === 'N10-release'), n8 = nodes.find(n => n.id === 'N8-budget');
  const fail = ids => ({ result: 'fail', missing: [], needsApproval: false, rules: ids.map(id => ({ id, result: 'fail' })) });
  assert.equal(routeFor(nodes, n5, fail(['RULE-SKILL-DOMINANCE']), 1).goto, 'N4-sim');
  assert.equal(routeFor(nodes, n8, fail(['RULE-DRAWCALL-2D', 'RULE-BUNDLE-SIZE']), 1).goto, 'N6-art');
  assert.equal(routeFor(nodes, n10, fail(['RULE-ART-TW-TABOO', 'RULE-SPEC-FAIRNESS']), 1).goto, 'N2-spec');
  assert.equal(routeFor(nodes, n10, fail(['RULE-REPORT-FRESH']), 1).goto, 'N10-release');
  assert.equal(routeFor(nodes, n5, fail(['RULE-SKILL-DOMINANCE']), 5).goto, 'human');
  assert.deepEqual(routeFor(nodes, n5, { result: 'pass', rules: [], missing: [] }, 0).goto, ['N9-human']);
});

test('bootstrap §0 must-read table is generated and current', () => {
  const r = applyMustRead(root, doc);
  assert.equal(r.error, undefined);
  assert.equal(r.changed, false, '跑 node shared/tools/index-build.mjs');
  for (const n of nodes) assert.ok(r.text.includes(`**${n.id}**`), n.id);
  assert.ok(!/af-gate-lane-shooter/.test(r.text.split('generated:loop-mustread')[1]), 'a generic (original) game does not get one adaptation\'s cards');
});
