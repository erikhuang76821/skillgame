// Tests for game-audit.mjs: a fixture game that breaks each must-level rule on purpose (fixtures/audit-bad).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { auditGame } from './game-audit.mjs';
import { findRoot } from './rules.mjs';

const root = findRoot(fileURLToPath(import.meta.url));
const r = await auditGame(root, 'shared/tools/fixtures/audit-bad');
const find = (rule, item) => r.filter(x => x.rule === rule && (!item || x.item.includes(item)));

test('missing gdd files fail RULE-GAME-DOCS', () => {
  assert.equal(find('RULE-GAME-DOCS', 'gdd/03_skill_integrity.md')[0].ok, false);
  assert.equal(find('RULE-GAME-DOCS', 'gdd/05_game_spec.md')[0].ok, true);
});

test('a stale report fails RULE-REPORT-FRESH; a current one passes', () => {
  const dom = find('RULE-REPORT-FRESH', 'skill_dominance')[0], play = find('RULE-REPORT-FRESH', 'playtest')[0];
  assert.equal(dom.ok, false); assert.match(dom.detail, /v2.*v3/);
  assert.equal(play.ok, true);
});

test('a failed check inside a report fails RULE-GAME-REPORTS', () => {
  assert.equal(find('RULE-GAME-REPORTS', 'playtest')[0].ok, false);
  assert.equal(find('RULE-GAME-REPORTS', 'skill_dominance')[0].ok, true);
});

test('spec numbers are reconciled with sim constants (RULE-SPEC-CONSTANTS)', () => {
  const c = find('RULE-SPEC-CONSTANTS')[0];
  assert.equal(c.ok, false);
  assert.match(c.detail, /RUN_SPEED.*sim 5/);           // 4 in the spec, 5 in the sim
  assert.doesNotMatch(c.detail, /TABLE|hpMax|maxTicks/); // padded array, RULES field and GAME field all match
  assert.match(c.item, /比對 4 個/);
});

test('blank or placeholder fairness answers fail RULE-SPEC-FAIRNESS', () => {
  const c = find('RULE-SPEC-FAIRNESS')[0];
  assert.equal(c.ok, false); assert.match(c.detail, /E3、E5/);
});

test('every adaptation item needs an answer (RULE-AF-ADAPTATION)', () => {
  const c = find('RULE-AF-ADAPTATION')[0];
  assert.equal(c.ok, false); assert.match(c.detail, /第 2、3、4、5、6 條/);
});

test('wall clock and unseeded randomness in sim/ code fail RULE-SIM-PURITY; comments do not', () => {
  const c = find('RULE-SIM-PURITY')[0];
  assert.equal(c.ok, false);
  assert.match(c.detail, /sim\.js:7 Date/); assert.match(c.detail, /sim\.js:8 Math\.random/);
  assert.doesNotMatch(c.detail, /sim\.js:1 /);
});

test('should-level findings are warnings, not failures', () => {
  assert.ok(find('RULE-KB-CITED').length > 0);
  assert.ok(r.filter(x => x.level === 'should').every(x => x.ok === false));
});
