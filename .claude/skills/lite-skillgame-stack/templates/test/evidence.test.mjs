// The skill-evidence tool (tools/lib/evidence.mjs) and the turn-based example it is validated on.
// Keep this file unchanged in every game; delete the example's tests if you delete examples/ends/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash32, playMatch, verify } from '../src/sim/core/index.js';
import { GAME as ENDS, MOVES } from '../examples/ends/sim.js';
import { STRATEGIES as ENDS_STRATEGIES } from '../examples/ends/strategies.mjs';
import { GAME as DEMO } from '../src/sim/sim.js';
import { STRATEGIES as DEMO_STRATEGIES } from '../tools/strategies.mjs';
import { checkLedger, checkStrategies, questions, recordConfirmation, runEvidence, signTest, toMarkdown } from '../tools/lib/evidence.mjs';

// Test fixture for the library: the command line takes the real values from RULE-SKILL-EVIDENCE (see the CLI tests).
const T = { alpha: 0.05, minQuestions: 30 };
const close = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('sign test matches hand-computed binomial tails', () => {
  close(signTest(5, 0), 1 / 32);
  close(signTest(8, 2), 56 / 1024);
  close(signTest(2, 8), 1013 / 1024);
  close(signTest(3, 3), 42 / 64);
  assert.equal(signTest(0, 0), 1, 'nothing decided: no evidence either way');
  assert.equal(signTest(0, 7), 1);
  const big = signTest(1500, 1500);
  assert.ok(big > 0.5 && big < 0.52, `large samples neither underflow nor overflow: ${big}`);
  assert.ok(signTest(1700, 1300) < 1e-10);
  assert.throws(() => signTest(1.5, 2));
});

test('question batches: same inputs repeat, tuning and each confirmation generation never overlap', () => {
  assert.deepEqual(questions(2026, 20), questions(2026, 20));
  const sets = [questions(2026, 200), questions(2026, 200, { mode: 'confirm' }), questions(2026, 200, { mode: 'confirm', generation: 2 })];
  assert.equal(new Set(sets.flat()).size, 600);
  assert.throws(() => questions(1, 5, { mode: 'final' }));
  assert.throws(() => questions(1, 5, { mode: 'confirm', generation: 0 }));
});

test('the turn-based example is a valid GameDef: choices only, replays and verifies', () => {
  const rec = playMatch(ENDS, 4242, ENDS_STRATEGIES.optimal.policy), up = rec.upload();
  assert.deepEqual([up.ticks, up.log, up.choices.length], [0, '', MOVES]);
  assert.equal(verify(ENDS, up).valid, true);
  assert.equal(verify(ENDS, { ...up, score: up.score + 1 }).valid, false);
  assert.deepEqual(playMatch(ENDS, 4242, ENDS_STRATEGIES.optimal.policy).result(), rec.result());
  const before = JSON.stringify(rec.sim);
  assert.equal(ENDS.choose(rec.sim, 0), false, 'no move after the match is over');
  const fresh = ENDS.createSim(1), snap = JSON.stringify(fresh);
  assert.equal(ENDS.choose(fresh, 2), false);
  assert.deepEqual([JSON.stringify(rec.sim), JSON.stringify(fresh)], [before, snap], 'a refused choice leaves the sim untouched');
});

test('turn-based example through the whole evidence flow: the optimal strategy never loses a question', () => {
  const r = runEvidence(ENDS, ENDS_STRATEGIES, { n: 60, thresholds: T });
  assert.deepEqual([r.game, r.version, r.n, r.mode, r.strong, r.sampling], ['example-ends', 1, 60, 'tuning', 'optimal', 'seeded']);
  for (const p of r.pairs) {
    assert.equal(p.losses, 0, `${p.other}: optimal play cannot score less on the same cards`);
    assert.equal(p.wins + p.ties + p.losses, 60);
    close(p.advantage, (p.wins + p.ties / 2) / 60);
    close(p.p, signTest(p.wins, p.losses));
  }
  const simple = r.pairs.find(p => p.role === 'simple'), random = r.pairs.find(p => p.role === 'random');
  assert.ok(simple.ties > 0, 'the one-sentence rule is often already optimal here: ties are part of the picture');
  assert.ok(simple.scoreRatio > random.scoreRatio && simple.scoreRatio <= 1);
  assert.deepEqual(r.verdict, { enoughQuestions: true, beatsRandom: true, beatsEverySimple: true, pass: true });
  assert.deepEqual(runEvidence(ENDS, ENDS_STRATEGIES, { n: 60, thresholds: T }).rows, r.rows, 'the table is reproducible');
});

test('no verdict without thresholds; too few questions cannot pass; a strategy against itself cannot pass', () => {
  assert.equal(runEvidence(ENDS, ENDS_STRATEGIES, { n: 40 }).verdict, null);
  const few = runEvidence(ENDS, ENDS_STRATEGIES, { n: 10, thresholds: T });
  assert.deepEqual([few.verdict.enoughQuestions, few.verdict.pass], [false, false]);
  const o = ENDS_STRATEGIES.optimal;
  const mirror = { optimal: o, twin: { ...o, role: 'random' }, twin2: { ...o, role: 'simple' } };
  const same = runEvidence(ENDS, mirror, { n: 60, thresholds: T });
  for (const p of same.pairs) assert.deepEqual([p.wins, p.losses, p.ties, p.p, p.pass], [0, 0, 60, 1, false]);
  assert.equal(same.verdict.pass, false, 'all ties is not evidence of skill');
  // The weak side as "strong": it must fail, and the report must say so.
  const flipped = { ...ENDS_STRATEGIES, optimal: { ...ENDS_STRATEGIES['uniform random end'], role: 'strong' }, 'uniform random end': { ...o, role: 'random' } };
  const lost = runEvidence(ENDS, flipped, { n: 60, thresholds: T });
  assert.equal(lost.verdict.beatsRandom, false);
  assert.match(toMarkdown(lost), /排除純運氣 → \*\*未通過\*\*/);
});

test('strategy sets are validated: roles, policies, and what each strategy sees', () => {
  assert.deepEqual(checkStrategies(ENDS_STRATEGIES), []);
  assert.deepEqual(checkStrategies(DEMO_STRATEGIES), []);
  const { optimal, ...noStrong } = ENDS_STRATEGIES;
  assert.match(checkStrategies(noStrong).join('\n'), /恰好一個 strong/);
  assert.match(checkStrategies({ ...ENDS_STRATEGIES, extra: { role: 'strong', sees: 'x', limits: 'y', policy: { pick: () => 0 } } }).join('\n'), /恰好一個 strong/);
  assert.match(checkStrategies({ optimal, r: ENDS_STRATEGIES['uniform random end'] }).join('\n'), /至少要一個 simple/);
  assert.match(checkStrategies({ ...ENDS_STRATEGIES, bad: { role: 'boss', policy: {} } }).join('\n'), /bad: role[\s\S]*bad: policy[\s\S]*bad: 缺 sees/);
  assert.throws(() => runEvidence(ENDS, noStrong), /策略定義不完整/);
});

test('the same tool runs a tick-driven game (the demo) without knowing about ticks', () => {
  const r = runEvidence(DEMO, DEMO_STRATEGIES, { n: 30, thresholds: T });
  assert.equal(r.game, DEMO.id);
  assert.equal(r.pairs.length, Object.keys(DEMO_STRATEGIES).length - 1);
  assert.equal(r.verdict.pass, true);
  const md = toMarkdown(r);
  assert.match(md, new RegExp(`^# Skill Evidence Report — ${DEMO.id} v${DEMO.version}（自動產生）`));
  assert.match(md, /調校用（不能當確認證據）/);
  assert.match(md, /簡單策略的接近程度（人工判定，沒有通過線）/);
});

test('confirmation ledger: batches are used in order and never reused for changed strategies', () => {
  const run = (generation, strategyHash) => runEvidence(ENDS, ENDS_STRATEGIES, { n: 30, mode: 'confirm', generation, thresholds: T, strategyHash });
  const first = recordConfirmation([], run(1, 'aaaa'));
  assert.equal(first.ok, true);
  assert.deepEqual(first.ledger.map(e => [e.generation, e.strategyHash, e.pass]), [[1, 'aaaa', true]]);
  assert.match(toMarkdown(run(1, 'aaaa')), /確認用第 1 批/);
  // Same strategies, same batch: a re-run, nothing new recorded.
  assert.deepEqual(recordConfirmation(first.ledger, run(1, 'aaaa')), { ok: true, ledger: first.ledger });
  // Changed strategies on the used batch: refused, pointed at the next one.
  const reuse = recordConfirmation(first.ledger, run(1, 'bbbb'));
  assert.equal(reuse.ok, false); assert.match(reuse.reason, /第 2 批/);
  const second = recordConfirmation(first.ledger, run(2, 'bbbb'));
  assert.deepEqual(second.ledger.map(e => e.generation), [1, 2]);
  assert.equal(recordConfirmation(first.ledger, run(3, 'bbbb')).ok, false, 'batches cannot be skipped');
  assert.equal(recordConfirmation([], runEvidence(ENDS, ENDS_STRATEGIES, { n: 30 })).ok, false, 'tuning runs are never recorded');
  assert.equal(recordConfirmation([], run(1, null)).ok, false, 'a confirmation needs the strategy hash');
});

// ---------- review fixes (Codex, step 4a) ----------

// A one-choice game for input-validation tests: pick 1 scores what `scoreOf` says, pick 0 scores 0.
const coin = (scoreOf = sim => 1 + (sim.seed & 7)) => ({
  id: 'test-coin', version: 1, maxTicks: 0, maxChoices: 1,
  createSim: seed => ({ seed: seed >>> 0, done: false, pick: 0 }),
  step() {}, phase: sim => (sim.done ? 'over' : 'choice'),
  choose(sim, c) { if (sim.done || (c !== 0 && c !== 1)) return false; sim.pick = c; sim.done = true; return true; },
  score: sim => (sim.pick ? scoreOf(sim) : 0), stateHash: sim => sim.pick,
});
const strat = (role, pick) => ({ role, sees: 'x', limits: 'y', policy: { pick } });
const COIN_STRATEGIES = { one: strat('strong', () => 1), flip: strat('random', sim => sim.seed & 1), zero: strat('simple', () => 0) };

test('sign test: the extreme and the large cases stay exact enough', () => {
  assert.equal(signTest(0, 1000000), 1, 'no wins is exactly 1, not a rounded sum');
  assert.ok(signTest(1, 999999) > 0.999999 && signTest(1, 999999) <= 1);
  const half = signTest(500000, 500000);
  assert.ok(half > 0.5 && half < 0.501, `${half}`);
  assert.ok(signTest(1000000, 0) >= 0 && signTest(1000000, 0) < 1e-300);
  close(signTest(7, 0), 1 / 128); close(signTest(1, 6), 127 / 128);
  for (const [w, l] of [[0, 0], [3, 3], [40, 20], [20, 40], [1500, 1500]]) { const p = signTest(w, l); assert.ok(p >= 0 && p <= 1 && !Number.isNaN(p)); }
});

test('batches: invalid inputs are refused instead of being silently converted', () => {
  for (const bad of [-1, 2 ** 32, 1.5, NaN, '7']) assert.throws(() => questions(bad, 5), /seedBase/);
  for (const bad of [0, -3, 1.5, NaN]) assert.throws(() => questions(1, bad), /題數/);
  for (const bad of [0, 1.5, 2 ** 32, 2 ** 32 + 1]) assert.throws(() => questions(1, 5, { mode: 'confirm', generation: bad }), /generation/);
  const q = questions(2026, 5000);
  assert.equal(new Set(q).size, 5000, 'no repeated question inside a batch');
  assert.deepEqual(questions(2026, 100), q.slice(0, 100), 'a smaller batch is the start of the larger one');
});

test('a confirmation batch never shares a question with the tuning batch of the same size', () => {
  // Generation 1970 is one whose raw 32-bit stream does hit the tuning stream within 3000 questions (found by
  // search); the confirmation batch must have skipped those seeds and still be full.
  const N = 3000, G = 1970, raw = s => Array.from({ length: N }, (_, i) => hash32(2026, s, i));
  const tuningRaw = new Set(raw(7));
  assert.ok(raw(0xc0f + G).some(s => tuningRaw.has(s)), 'the raw streams overlap, so this test bites');
  const tuning = new Set(questions(2026, N)), confirm = questions(2026, N, { mode: 'confirm', generation: G });
  assert.deepEqual([...tuning], raw(7), 'the tuning batch is its raw stream');
  assert.equal(confirm.filter(s => tuning.has(s)).length, 0);
  assert.equal(new Set(confirm).size, N);
  // Any generation can be drawn directly; nothing scans the earlier ones.
  assert.equal(questions(2026, 3, { mode: 'confirm', generation: 4000000000 }).length, 3);
});

test('everything is validated before the first match is played', () => {
  let played = 0;
  const game = { ...coin(), createSim: seed => { played++; return { seed: seed >>> 0, done: false, pick: 0 }; } };
  for (const bad of [{ n: 0 }, { n: 1.5 }, { seedBase: -1 }, { thresholds: { alpha: 0, minQuestions: 1 } }, { thresholds: { alpha: 1, minQuestions: 1 } },
    { thresholds: { alpha: NaN, minQuestions: 1 } }, { thresholds: { alpha: 0.05, minQuestions: 1.5 } }, { thresholds: { alpha: '0.05', minQuestions: 1 } }]) {
    assert.throws(() => runEvidence(game, COIN_STRATEGIES, bad), /evidence:/, JSON.stringify(bad));
  }
  assert.equal(played, 0);
  assert.equal(runEvidence(game, COIN_STRATEGIES, { n: 5 }).n, 5);
});

test('scores must be finite numbers; ratios are not reported for negative scores', () => {
  for (const bad of [Infinity, -Infinity, NaN, '9', null]) {
    assert.throws(() => runEvidence(coin(() => bad), COIN_STRATEGIES, { n: 10, thresholds: T }), /策略「one」在題目 \d+ 的分數不是有限數值/, String(bad));
  }
  const neg = runEvidence(coin(sim => -1 - (sim.seed & 3)), COIN_STRATEGIES, { n: 40, thresholds: T });
  for (const p of neg.pairs) assert.equal(p.scoreRatio, null);
  assert.equal(neg.verdict.pass, false, 'a "strong" strategy that scores below the others does not pass');
  assert.match(toMarkdown(neg), /\| zero \| simple \|.*\| — \| \*\*未通過\*\* \|/);
  const zero = runEvidence(coin(() => 0), COIN_STRATEGIES, { n: 10 });
  for (const p of zero.pairs) assert.deepEqual([p.scoreRatio, p.ties], [null, 10]);
  // Each score is finite, but their sum or difference is not: no report, no verdict.
  assert.throws(() => runEvidence(coin(() => 1e308), COIN_STRATEGIES, { n: 10, thresholds: T }), /大到無法計算/);
  const swing = { ...COIN_STRATEGIES, zero: strat('simple', () => 0) };
  assert.throws(() => runEvidence({ ...coin(() => 1e308), score: sim => (sim.pick ? 1e308 : -1e308) }, swing, { n: 10, thresholds: T }), /大到無法計算/);
});

test('large batches do not overflow the stack', () => {
  const r = runEvidence(coin(), COIN_STRATEGIES, { n: 130000 });
  assert.equal(r.rows.length, 130000);
  assert.ok(Number.isFinite(r.summary.one.min) && Number.isFinite(r.pairs[0].maxDiff));
});

test('a strategy must fit the game, play without failing, and give the same result twice', () => {
  const pickOnly = { ...DEMO_STRATEGIES, expert: { ...DEMO_STRATEGIES.expert, policy: { pick: () => 0 } } };
  assert.match(checkStrategies(pickOnly, DEMO).join('\n'), /expert: 這款遊戲會跑 tick/);
  assert.throws(() => runEvidence(DEMO, pickOnly, { n: 5 }), /策略定義不完整/);
  const inputOnly = { ...ENDS_STRATEGIES, optimal: { ...ENDS_STRATEGIES.optimal, policy: { input: () => 0 } } };
  assert.match(checkStrategies(inputOnly, ENDS).join('\n'), /optimal: 這款遊戲有選擇/);
  assert.deepEqual([checkStrategies(DEMO_STRATEGIES, DEMO), checkStrategies(ENDS_STRATEGIES, ENDS)], [[], []]);

  const illegal = { ...COIN_STRATEGIES, zero: strat('simple', () => 5) };
  assert.throws(() => runEvidence(coin(), illegal, { n: 5 }), /策略「zero」在題目 \d+ 失敗/);
  const crash = { ...COIN_STRATEGIES, zero: strat('simple', () => { throw new Error('boom'); }) };
  assert.throws(() => runEvidence(coin(), crash, { n: 5 }), /策略「zero」在題目 \d+ 失敗：boom/);
  let calls = 0;
  const drifting = { ...COIN_STRATEGIES, flip: strat('random', () => (calls++ === 0 ? 1 : 0)) };
  assert.throws(() => runEvidence(coin(), drifting, { n: 5 }), /策略「flip」在題目 \d+ 重跑的結果不同/);
  // Drift on a later question only: every question is replayed, not just the first.
  const third = questions(2026, 5)[2], seen = new Map();
  const late = { ...COIN_STRATEGIES, flip: strat('random', sim => { const c = seen.get(sim.seed) ?? 0; seen.set(sim.seed, c + 1); return sim.seed === third ? c & 1 : 1; }) };
  assert.throws(() => runEvidence(coin(), late, { n: 5 }), new RegExp(`策略「flip」在題目 ${third} 重跑的結果不同`));
});

test('the demo random strategy plays every beat: it scores, but far below the strong strategy', () => {
  const r = runEvidence(DEMO, DEMO_STRATEGIES, { n: 30 });
  const random = r.pairs.find(p => p.role === 'random');
  const simple = Math.max(...r.pairs.filter(p => p.role === 'simple').map(p => p.scoreRatio));
  assert.ok(random.scoreRatio > 0.02 && random.scoreRatio < 0.8, `ratio ${random.scoreRatio}`);
  assert.ok(random.scoreRatio > simple, 'it plays the beats, unlike tapping blind');
});

test('a confirmation batch cannot be re-drawn: question count, seedBase, thresholds and result are frozen', () => {
  const run = (o = {}) => runEvidence(coin(), COIN_STRATEGIES, { n: 30, mode: 'confirm', generation: 1, thresholds: T, strategyHash: 'aaaa', ...o });
  // "flip" ties with "one" on odd seeds, so a tiny batch fails; the failed batch is still used up.
  const small = run({ n: 2 });
  assert.equal(small.verdict.pass, false);
  const first = recordConfirmation(null, small);
  assert.deepEqual([first.ok, first.ledger.length, first.ledger[0].pass, first.ledger[0].n], [true, 1, false, 2]);
  assert.deepEqual(first.ledger[0].thresholds, T);
  const bigger = recordConfirmation(first.ledger, run());
  assert.equal(bigger.ok, false); assert.match(bigger.reason, /n 與紀錄不同[\s\S]*第 2 批/);
  assert.equal(bigger.ledger, first.ledger, 'a refused run leaves the ledger as it was');
  assert.match(recordConfirmation(first.ledger, run({ n: 2, thresholds: { alpha: 0.5, minQuestions: 1 } })).reason, /thresholds 與紀錄不同/);
  assert.match(recordConfirmation(first.ledger, run({ n: 2, thresholds: null })).reason, /thresholds 與紀錄不同/);
  assert.match(recordConfirmation(first.ledger, run({ n: 2, seedBase: 99 })).reason, /不能換遊戲或基準種子/);
  assert.match(recordConfirmation(first.ledger, run({ generation: 2, seedBase: 99 })).reason, /不能換遊戲或基準種子/);
  assert.equal(recordConfirmation(first.ledger, run({ n: 2 })).ok, true, 'the identical run is a re-run');
  // The whole outcome is frozen: the verdict, the counts, and a hash of every per-question result.
  assert.deepEqual(Object.keys(first.ledger[0]).sort(), ['game', 'generation', 'n', 'pairs', 'pass', 'resultHash', 'schema', 'seedBase', 'strategyHash', 'thresholds', 'version']);
  for (const change of [{ pass: true }, { resultHash: 'ffffffffffffffff' }, { pairs: first.ledger[0].pairs.map(p => ({ ...p, wins: p.ties, ties: p.wins })) }]) {
    assert.match(recordConfirmation([{ ...first.ledger[0], ...change }], run({ n: 2 })).reason, /結果與紀錄不同/, JSON.stringify(change));
  }
  assert.match(recordConfirmation(first.ledger, { ...run({ n: 2 }), verdict: { pass: true } }).reason, /結果與紀錄不同/);
  assert.match(recordConfirmation(first.ledger, { ...run({ n: 2 }), resultHash: 'ffffffffffffffff' }).reason, /結果與紀錄不同/);
  const second = recordConfirmation(first.ledger, run({ generation: 2 }));
  assert.deepEqual([second.ok, second.ledger.map(e => e.generation)], [true, [1, 2]]);
});

test('a damaged ledger is refused, never treated as empty', () => {
  const report = runEvidence(coin(), COIN_STRATEGIES, { n: 30, mode: 'confirm', strategyHash: 'aaaa' });
  const good = recordConfirmation([], report).ledger;
  assert.equal(checkLedger(good), null); assert.equal(checkLedger(null), null);
  const { schema: _s, ...noSchema } = good[0], { thresholds: _t, ...noThresholds } = good[0], { resultHash: _r, ...noResult } = good[0];
  const pairs = f => good[0].pairs.map((p, i) => (i ? p : f(p)));
  for (const bad of [{ entries: good }, 'x', [null], [{ ...good[0], generation: 2 }], [{ ...good[0], n: 0 }], [{ ...good[0], strategyHash: '' }],
    [noSchema], [noThresholds], [noResult], [{ ...good[0], schema: 2 }], [{ ...good[0], seedBase: -1 }], [{ ...good[0], pass: true }],
    [{ ...good[0], thresholds: { alpha: 2, minQuestions: 1 } }], [{ ...good[0], thresholds: T }], [{ ...good[0], pairs: [] }],
    [{ ...good[0], pairs: pairs(p => ({ ...p, wins: -1, ties: p.ties + p.wins + 1 })) }], [{ ...good[0], pairs: pairs(p => ({ ...p, ties: 'x' })) }],
    [{ ...good[0], pairs: pairs(p => ({ ...p, wins: p.wins + 1 })) }],
    [good[0], { ...good[0], generation: 2, seedBase: 5 }], [good[0], { ...good[0], generation: 3 }]]) {
    assert.equal(typeof checkLedger(bad), 'string', JSON.stringify(bad));
    const rec = recordConfirmation(bad, report);
    assert.deepEqual([rec.ok, rec.ledger], [false, bad]);
  }
});

test('report wording: thresholds are the caller\'s, the verdict is the automatic part only, premises are stated', () => {
  const md = toMarkdown(runEvidence(ENDS, ENDS_STRATEGIES, { n: 60, thresholds: T, strategyHash: 'abcd', hashedFiles: ['tools/strategies.mjs', 'src/sim/sim.js'] }));
  assert.doesNotMatch(md, /來自 rules\.json/);
  assert.match(md, /自動統計判定（呼叫端傳入的門檻/);
  assert.match(md, /不含「簡單策略的接近程度」，那一項由人判定/);
  assert.match(md, /前提：題目由種子抽出、每題一局/);
  assert.match(md, /涵蓋 2 個檔案：tools\/strategies\.mjs、src\/sim\/sim\.js/);
  assert.match(md, /\| uniform random end \| random \|.*%.*\|/, 'the score ratio is reported for every pair, not only the simple ones');
});

// ---------- command line ----------
const CLI = fileURLToPath(new URL('../tools/skill-evidence.mjs', import.meta.url));
const cli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd });

test('CLI: misuse exits 2 without running; thresholds come from the rules; a tuning run exits 0', async () => {
  for (const args of [['0'], ['1.5'], ['30', '40'], ['--bogus'], ['--alpha', '0.5'], ['--min-questions', '1'], ['--out'], ['--ledger', '--confirm'],
    ['--generation', '2'], ['--confirm', '30'], ['5', '--out', join(tmpdir(), 'no-such-dir-evidence', 'x', 'report.md')]]) {
    const r = cli(args);
    assert.equal(r.status, 2, `${args.join(' ')} -> ${r.status}\n${r.stderr}`);
    assert.match(r.stderr, /✘/); assert.equal(r.stdout, '', args.join(' '));
  }
  // Thresholds come from the rules (never the command line); with no count, the rule's minimum is the batch size.
  const { loadRules } = await import(new URL('../../../../../shared/tools/rules.mjs', import.meta.url).href);
  const rules = loadRules({ from: fileURLToPath(import.meta.url) });
  const alpha = rules.value('RULE-SKILL-EVIDENCE', 'alpha'), min = rules.value('RULE-SKILL-EVIDENCE', 'minQuestions');
  const ok = cli([]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(ok.stdout.includes(`題目：${min} 題`) && ok.stdout.includes(`門檻取自 RULE-SKILL-EVIDENCE：顯著水準 ${alpha}、至少 ${min} 題`), ok.stdout.slice(0, 600));
  assert.match(ok.stdout, /調校用（不能當確認證據）[\s\S]*排除純運氣 → \*\*通過\*\*/);
  const tooFew = cli([String(min - 1)]);
  assert.equal(tooFew.status, 1, 'a failed verdict is exit 1, not misuse');
  assert.match(tooFew.stdout, /題數不足/);
});

test('CLI: the confirmation ledger is frozen, found by its path from any working directory, and never overwritten when damaged', () => {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-'));
  try {
    const ledger = join(dir, 'ledger.json'), json = join(dir, 'table.json');
    // The gate's command never opens a batch: no ledger, an empty one, or JSON null are all refused, and nothing is written.
    for (const content of [null, '[]', 'null']) {
      if (content !== null) writeFileSync(ledger, content, 'utf8'); else rmSync(ledger, { force: true });
      const gate = cli(['--confirm', '--require-recorded', '--ledger', ledger]);
      assert.equal(gate.status, 2, `${content}: ${gate.stderr}`); assert.match(gate.stderr, /第一次確認要在策略凍結後由人下/);
      assert.equal(existsSync(ledger) ? readFileSync(ledger, 'utf8') : null, content);
    }
    assert.equal(cli(['--require-recorded']).status, 2, 'only with --confirm');
    rmSync(ledger, { force: true });
    const first = cli(['30', '--confirm', '--ledger', ledger, '--json', json]);
    assert.equal(first.status, 0, first.stderr);
    const entries = JSON.parse(readFileSync(ledger, 'utf8'));
    assert.deepEqual(entries.map(e => [e.generation, e.n, e.game]), [[1, 30, DEMO.id]]);
    const table = JSON.parse(readFileSync(json, 'utf8'));
    for (const f of ['tools/strategies.mjs', 'tools/bots.mjs', 'src/sim/sim.js', 'src/sim/core/index.js', 'src/sim/core/rng.js', 'src/sim/core/match.js',
      'tools/skill-evidence.mjs', 'tools/lib/evidence.mjs']) {
      assert.ok(table.hashedFiles.includes(f), `the hash covers ${f}`);
    }
    assert.equal(entries[0].strategyHash, table.strategyHash);

    // Same batch from another working directory with a relative ledger path resolved there: same file, a plain re-run.
    const again = cli(['30', '--confirm', '--ledger', 'ledger.json'], dir);
    assert.equal(again.status, 0, again.stderr);
    assert.deepEqual(JSON.parse(readFileSync(ledger, 'utf8')), entries);

    // A refused run writes nothing at all: not the ledger, and not the report it was asked to write.
    const out = join(dir, 'report.md');
    writeFileSync(out, 'kept', 'utf8');
    const redraw = cli(['40', '--confirm', '--ledger', ledger, '--out', out, '--json', join(dir, 'refused.json')]);
    assert.equal(redraw.status, 2); assert.match(redraw.stderr, /n 與紀錄不同[\s\S]*第 2 批/);
    assert.equal(readFileSync(out, 'utf8'), 'kept');
    assert.equal(existsSync(join(dir, 'refused.json')), false);
    const skip = cli(['30', '--confirm', '--generation', '3', '--ledger', ledger]);
    assert.equal(skip.status, 2); assert.match(skip.stderr, /下一批是第 2 批/);
    assert.deepEqual(JSON.parse(readFileSync(ledger, 'utf8')), entries, 'refused runs write nothing');
    const next = cli(['40', '--confirm', '--generation', '2', '--ledger', ledger]);
    assert.equal(next.status, 0, next.stderr);
    assert.deepEqual(JSON.parse(readFileSync(ledger, 'utf8')).map(e => [e.generation, e.n]), [[1, 30], [2, 40]]);
    // With no count, a re-run keeps the recorded batch's count (40 here, not the rule's minimum): this is what the gate runs.
    const notYet = cli(['--confirm', '--require-recorded', '--generation', '3', '--ledger', ledger]);
    assert.equal(notYet.status, 2); assert.match(notYet.stderr, /第 3 批還沒有紀錄/);
    const rerun = cli(['--confirm', '--require-recorded', '--ledger', ledger, '--out', out]);
    assert.equal(rerun.status, 0, rerun.stderr);
    assert.match(readFileSync(out, 'utf8'), /題目：40 題[\s\S]*確認用第 2 批/);
    assert.equal(JSON.parse(readFileSync(ledger, 'utf8')).length, 2);

    for (const damaged of ['{ not json', JSON.stringify({ entries })]) {
      writeFileSync(ledger, damaged, 'utf8');
      const r = cli(['30', '--confirm', '--ledger', ledger]);
      assert.equal(r.status, 2, r.stderr); assert.match(r.stderr, /紀錄檔/);
      assert.equal(readFileSync(ledger, 'utf8'), damaged, 'a damaged ledger is left for a person to repair');
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
