// Tests for game-audit.mjs: a fixture game that breaks each must-level rule on purpose (fixtures/audit-bad).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { auditGame, musicChecks } from './game-audit.mjs';
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
  // A should-level row may pass (the legacy dominance report is checked at should level and shows ✅ when fine);
  // the ones that fail are warnings: they never count among the must failures.
  assert.ok(r.some(x => x.level === 'should' && !x.ok));
  assert.ok(r.filter(x => !x.ok && x.level === 'must').every(x => x.rule !== 'RULE-KB-CITED'));
});

test('shipped media missing from every art/manifest.json is a RULE-ASSET-REGISTER warning', () => {
  const c = find('RULE-ASSET-REGISTER')[0];
  assert.equal(c.level, 'should'); assert.match(c.detail, /unregistered\.png/);
});

// Step 2 (generality backlog): gdd/07 and the playtest report are required only for games with scripted progression.
const CURVE_DOCS = ['gdd/07_difficulty_curve.md', 'docs/playtest_report.md'];
const docsRows = async profile => (await auditGame(root, 'shared/tools/fixtures/audit-bad', { profile })).filter(x => x.rule === 'RULE-GAME-DOCS');

test('RULE-GAME-DOCS: an unanswered scriptedProgression fails the audit instead of assuming either way', async () => {
  for (const rows of [r.filter(x => x.rule === 'RULE-GAME-DOCS'), await docsRows({ schemaVersion: 1 })]) {   // no profile file / flag not set
    const flag = rows.find(x => x.item.includes('scriptedProgression'));
    assert.equal(flag.ok, false); assert.match(flag.detail, /資料待補/);
    for (const f of CURVE_DOCS) assert.ok(!rows.some(x => x.item === f), `${f} is neither required nor waived yet`);
  }
});

test('RULE-GAME-DOCS: scripted games must have the curve document and the playtest report; other games are not asked', async () => {
  const yes = await docsRows({ scriptedProgression: true }), no = await docsRows({ scriptedProgression: false });
  assert.equal(yes.find(x => x.item === 'gdd/07_difficulty_curve.md').ok, false);   // the fixture has no gdd/07
  assert.equal(yes.find(x => x.item === 'docs/playtest_report.md').ok, true);
  for (const rows of [yes, no]) assert.ok(!rows.some(x => x.item.includes('scriptedProgression')));
  for (const f of CURVE_DOCS) assert.ok(!no.some(x => x.item === f));
  assert.equal(no.find(x => x.item === 'gdd/03_skill_integrity.md').ok, false, 'the unconditional documents are still required');
});

test('a report that exists is still checked even when the game is not asked to have it', async () => {
  const all = await auditGame(root, 'shared/tools/fixtures/audit-bad', { profile: { scriptedProgression: false } });
  assert.equal(all.find(x => x.rule === 'RULE-GAME-REPORTS' && x.item.includes('playtest')).ok, false);
});

test('a game with documents but no game/ yet (the N2 spec gate): document rules are judged, sim rules fail explicitly', async () => {
  const d = await auditGame(root, 'shared/tools/fixtures/audit-docs-only');
  const one = rule => d.filter(x => x.rule === rule);
  assert.ok(one('RULE-SPEC-FAIRNESS').every(x => x.ok));
  assert.ok(one('RULE-GAME-DOCS').some(x => x.item.includes('涵蓋規格範本每一節') && x.ok));
  const c = one('RULE-SPEC-CONSTANTS')[0];
  assert.equal(c.ok, false); assert.match(c.detail, /無法載入 sim\.js/);
  const p = one('RULE-SIM-PURITY')[0];
  assert.equal(p.ok, false); assert.match(p.detail, /沒有 game\/src\/sim\//);   // nothing to check never counts as pure
});

test('the audit card runs on documents alone, so the N2 gate is not blocked by a file N4 produces', () => {
  const card = JSON.parse(readFileSync(join(root, 'shared', 'tests', 'registry.json'), 'utf8')).tests.find(t => t.id === 'TEST-AUDIT');
  assert.ok(card.needs.every(n => !n.startsWith('game/')), `TEST-AUDIT needs ${card.needs.join(', ')}`);
});

test('file-based music: a .webm and its sidecar must ship as one kind=music asset, with matching hash and fileMusic', () => {
  const dir = mkdtempSync(join(tmpdir(), 'audit-music-'));
  try {
    mkdirSync(join(dir, 'G', 'music'), { recursive: true });
    const webm = Buffer.from('not really opus');
    writeFileSync(join(dir, 'G', 'music', 'battle.webm'), webm);
    const sha = createHash('sha256').update(webm).digest('hex');
    const side = s => writeFileSync(join(dir, 'G', 'music', 'battle.loop.json'), JSON.stringify(s));
    const asset = shipped => ({ m: { game: 'G', pathBase: 'G/', assets: [{ id: 'G.music.battle', kind: 'music', files: { shipped } }] } });
    const run = (profile, shipped = ['music/battle.webm', 'music/battle.loop.json']) => musicChecks(dir, 'G', profile, [asset(shipped)]);
    const bad = rows => rows.filter(r => !r[2]).map(r => r[4]).join(' | ');

    side({ file: 'battle.webm', samples: 768000, sampleRate: 48000, sha256: sha });
    assert.equal(bad(run({ fileMusic: true })), '');
    assert.match(bad(run({ fileMusic: false })), /fileMusic 不是 true/);
    assert.match(bad(run({ fileMusic: true }, ['music/battle.webm'])), /同時有 \.webm 與 \.loop\.json/);
    assert.match(bad(run({ fileMusic: true }, ['music/battle.loop.json', 'music/battle.webm'])), /第一個/);
    side({ file: 'battle.webm', samples: 768000, sampleRate: 48000, sha256: 'x' });
    assert.match(bad(run({ fileMusic: true })), /sha256 與 \.webm 不符/);
    side({ file: 'other.webm', samples: 0, sampleRate: 48000, sha256: sha });
    assert.match(bad(run({ fileMusic: true })), /正整數.*other\.webm/);
    assert.match(bad(musicChecks(dir, 'G', { fileMusic: true }, [])), /沒有 kind=music/);
    assert.deepEqual(musicChecks(dir, 'G', { fileMusic: false }, []), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
