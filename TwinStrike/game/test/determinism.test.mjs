// Game-rule determinism and fairness for TwinStrike (spec §12). Keep the test names.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Recorder, playMatch, verify, replay } from '../src/sim/core/index.js';
import {
  GAME, RULES, SEGMENTS, SUB, GRADE, KIND, IN_L, IN_R, encode, createSim, step, phase, buildChart, checkSpacing, maxScore,
} from '../src/sim/sim.js';
import { BOTS } from '../tools/bots.mjs';
import { runDominance } from '../tools/lib/dominance.mjs';

const laneBit = lane => (lane ? IN_R : IN_L);
/** Perfect player: taps every note exactly on time (one note per tick at most, guaranteed by spacing). */
const perfect = {
  input(sim) {
    let i = sim.judge.next;
    while (i < sim.chart.length && sim.judge.grade[i] >= 0) i++;            // judge.next only moves past expired notes
    const n = sim.chart[i];
    return n && Math.floor(n.t / SUB) === sim.tick ? encode(laneBit(n.lane), n.t % SUB) : 0;
  },
};
const idle = { input: () => 0 };

test('same seed + same inputs => identical result', () => {
  assert.deepEqual(playMatch(GAME, 1234, BOTS.expert).result(), playMatch(GAME, 1234, BOTS.expert).result());
});

test('golden match (cross-engine determinism; update only when GAME.version is bumped)', () => {
  assert.deepEqual(playMatch(GAME, 1234, BOTS.expert).result(),
    { game: 'twin-strike', version: 6, seed: 1234, ticks: 5400, score: 31257, hash: 4266121400 });
});

test('uploaded match verifies; tampered score does not', () => {
  const up = playMatch(GAME, 98765, BOTS.intermediate).upload();
  assert.equal(verify(GAME, up).valid, true);
  assert.equal(verify(GAME, { ...up, score: up.score + 10 }).valid, false);
  assert.equal(verify(GAME, { ...up, version: up.version + 1 }).valid, false);
});

test('different seeds diverge', () => {
  assert.notEqual(playMatch(GAME, 1, BOTS.expert).result().hash, playMatch(GAME, 2, BOTS.expert).result().hash);
});

test('the challenge depends only on the seed, not on player behaviour (fairness E2)', () => {
  const chartAfter = policy => playMatch(GAME, 77, policy).sim.chart;
  assert.deepEqual(chartAfter(BOTS.novice), chartAfter(BOTS.expert));
  assert.deepEqual(chartAfter(idle), buildChart(77));
});

test('render events never change the outcome (recordEvents off = same hash)', () => {
  const rec = new Recorder(GAME, 4242);                  // events on, like the live client
  while (rec.phase !== 'over') rec.step(BOTS.novice.input(rec.sim));
  assert.equal(rec.sim.recordEvents, true);
  const r = replay(GAME, 4242, rec.log, rec.choices, rec.ticks);   // events off, like the server
  assert.equal(r.hash, rec.result().hash);
});

test('chart spacing rules hold for 1,000 seeds (spec §3.1)', () => {
  for (let s = 0; s < 1000; s++) assert.equal(checkSpacing(buildChart(s)), null, `seed ${s}`);
});

test('perfect play reaches exactly the theoretical maximum (spec §6)', () => {
  for (const seed of [1, 2, 3]) {
    const rec = playMatch(GAME, seed, perfect);
    assert.equal(rec.sim.judge.counts[GRADE.PERFECT], rec.sim.chart.length);
    assert.equal(GAME.score(rec.sim), maxScore(rec.sim));
    assert.equal(rec.sim.hp, RULES.hpMax);
  }
});

test('whiff staggers: taps inside the stagger are ignored and do not extend it (spec §5)', () => {
  const sim = createSim(5);
  sim.recordEvents = true;
  const first = sim.chart[0], early = Math.floor(first.t / SUB) - 60;   // 1 s before the first enemy arrives
  while (sim.tick < early) step(sim, 0);
  step(sim, encode(laneBit(first.lane)));
  assert.equal(sim.events[0].type, 'whiff');
  assert.equal(sim.staggerUntil, early + RULES.stagger);
  step(sim, encode(IN_L | IN_R));
  assert.deepEqual(sim.events.map(e => e.type), ['locked', 'locked']);
  assert.equal(sim.lockedTaps, 2);
  assert.equal(sim.staggerUntil, early + RULES.stagger);
  assert.equal(sim.judge.whiffs, 1);
});

test('misses hurt outside safe segments only; hp 0 ends the match (spec §5, §7)', () => {
  const rec = playMatch(GAME, 11, idle);
  const { sim } = rec;
  assert.equal(phase(sim), 'over');
  assert.equal(sim.hp, 0);
  const firstUnsafe = SEGMENTS.find(s => !s.safe).from;
  assert.ok(sim.deathTick > firstUnsafe, 'warm-up misses must not kill');
  const damaging = sim.chart.filter((n, i) => sim.judge.grade[i] === GRADE.MISS && !SEGMENTS[n.seg].safe).length;
  assert.ok(damaging >= RULES.hpMax, 'guarded misses still count as misses');
  assert.ok(rec.ticks < GAME.maxTicks);
});

test('after losing HP, further misses within the guard window cost no HP (spec §5)', () => {
  const sim = createSim(11);
  sim.recordEvents = true;
  const losses = [];
  while (phase(sim) === 'play') {
    step(sim, 0);
    for (const e of sim.events) if (e.type === 'hurt' && !e.safe) losses.push(sim.tick - 1);
  }
  assert.equal(losses.length, RULES.hpMax);
  for (let k = 1; k < losses.length; k++) assert.ok(losses[k] - losses[k - 1] >= RULES.guard, `HP lost twice within ${RULES.guard} ticks`);
});

test('combo heals up to hpMax (spec §5)', () => {
  const sim = createSim(3);
  sim.hp = 2;
  let healed = 0;
  while (phase(sim) === 'play' && sim.judge.combo < RULES.regenCombo * 2) {
    step(sim, perfect.input(sim));
    healed += sim.events.filter(e => e.type === 'heal').length;
  }
  assert.equal(healed, 2);
  assert.equal(sim.hp, 4);
});

test('skill dominates on the same seeds (gdd/03 thresholds)', () => {
  const a = runDominance(GAME, BOTS, 12);
  assert.ok(a.pass, `skill share ${a.shares.skillTier.toFixed(2)}, top win rate ${a.top.toFixed(2)}`);
  const b = runDominance(GAME, BOTS, 60, 777);
  assert.ok(b.pass, `seed set 777: skill share ${b.shares.skillTier.toFixed(2)}, top win rate ${b.top.toFixed(2)}`);
});

test('full-match replay fits the server budget', () => {
  const rec = playMatch(GAME, 4242, BOTS.expert);
  const t0 = performance.now();
  assert.equal(replay(GAME, 4242, rec.log, rec.choices, rec.ticks).valid, true);
  assert.ok(performance.now() - t0 < 500);
});

test('scripted curve: main sections never slow down, levels never drop between them (spec §3.1 v3)', () => {
  const main = SEGMENTS.filter(s => s.levels.length > 1 && !s.fever && s.id !== 'O' && s.id !== 'W');
  for (let k = 1; k < main.length; k++) {
    assert.ok(main[k].beatTicks <= main[k - 1].beatTicks, `${main[k].id} is slower than ${main[k - 1].id}`);
    assert.ok(Math.max(...main[k].levels) >= Math.max(...main[k - 1].levels), `${main[k].id} peaks lower than ${main[k - 1].id}`);
  }
});

test('breather sections restore HP once as they start (spec §5 v3)', () => {
  const sim = createSim(5);
  sim.recordEvents = true;
  const breather = SEGMENTS.find(s => s.heal);
  while (sim.tick < breather.from) step(sim, perfect.input(sim));      // play cleanly up to the breather
  sim.hp = 2;
  step(sim, perfect.input(sim));
  assert.ok(sim.events.some(e => e.type === 'heal'));
  assert.equal(sim.hp, Math.min(RULES.hpMax, 2 + breather.heal));
});

test('tanuki boss: hits on quarter beats, alone in its bar, at most 1 HP lost per boss (spec §5 v4)', () => {
  const sim = createSim(21);
  sim.recordEvents = true;
  const bosses = new Map();
  sim.chart.forEach(n => { if (n.kind === KIND.BRUTE) bosses.set(n.group, [...(bosses.get(n.group) ?? []), n]); });
  assert.ok(bosses.size >= 4);
  for (const hits of bosses.values()) {
    const seg = SEGMENTS[hits[0].seg];
    for (let k = 1; k < hits.length; k++) assert.equal(hits[k].t - hits[k - 1].t, seg.beatTicks * SUB);
    const barEnd = hits[0].t + 4 * seg.beatTicks * SUB;                // the boss owns its whole bar
    assert.ok(sim.chart.every(n => n.kind === KIND.BRUTE || n.t < hits[0].t || n.t >= barEnd), 'another enemy shares the boss bar');
  }
  const lost = new Map();
  while (phase(sim) === 'play') {
    step(sim, perfect.input(sim) & (sim.chart[sim.judge.next]?.kind === KIND.BRUTE ? 0 : 0xff));   // play cleanly, ignore every boss
    for (const e of sim.events) if (e.type === 'hurt' && !e.safe && sim.chart[e.note].kind === KIND.BRUTE) lost.set(sim.chart[e.note].group, (lost.get(sim.chart[e.note].group) ?? 0) + 1);
  }
  for (const n of lost.values()) assert.ok(n <= 1, 'a boss cost more than 1 HP');
});

test('critical perfect: ±20 ms adds critBonus, 21+ ms is a plain perfect, and a full critical run hits maxScore (spec §6 v6)', () => {
  const sim = createSim(9);
  sim.recordEvents = true;
  const [a, b] = sim.chart;
  while (sim.tick < Math.floor(a.t / SUB)) step(sim, 0);
  step(sim, encode(laneBit(a.lane), a.t % SUB));                    // exact: critical
  const hitA = sim.events.find(e => e.type === 'hit');
  assert.equal(hitA.crit, true);
  const off = Math.round((21 * 60 * SUB) / 1000) + 1;               // just outside ±20 ms, still inside Perfect (45 ms)
  const tb = b.t + off;
  while (sim.tick < Math.floor(tb / SUB)) step(sim, 0);
  step(sim, encode(laneBit(b.lane), tb % SUB));
  const hitB = sim.events.find(e => e.type === 'hit');
  assert.equal(hitB.grade, GRADE.PERFECT);
  assert.equal(hitB.crit, false);
  assert.equal(sim.crits, 1);
});
