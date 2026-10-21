// TwinStrike — left/right strike game (OFDP / Timberman family). Spec: ../../../gdd/05_game_spec.md
// Deterministic: no rendering, no wall clock, no unseeded randomness. Same seed + same input bytes = same score.
//
// Enemies walk in from the left and right; each one is a note on core/timing.js. Tap the matching side
// as it reaches strike range. Tapping with nothing in range (too early, wrong side) is a whiff: combo
// reset and a short stagger in which taps are ignored. A note that passes unhit hurts the hero
// (except in safe segments: the warm-up and the two fever segments). Score = capped-combo timing points only; survival is not scored.
import { makeRng, createHasher, TPS } from './core/index.js';
import { SUB, GRADE, msToSub, createJudge, judgeTap, judgeMisses, maxScore as chartMax } from './core/timing.js';

export { TICK_MS } from './core/index.js';
export { SUB, GRADE };

// Judgement half-widths (spec §5). Wider than the core recipe default (35 / 70 / 110 ms) for a casual audience (v2).
export const WINDOWS = Object.freeze({ perfect: msToSub(45), great: msToSub(85), good: msToSub(135) });

// --- Spec §2 input byte: bit 0 left, bit 1 right, bits 4..7 sub-tick phase ---
export const IN_L = 1, IN_R = 2;
export const encode = (lanes, phase = 0) => lanes | ((phase & 15) << 4);

// --- Spec §3 random streams (never renumber after release) ---
const rng = makeRng({ pattern: 1, lane: 2, kind: 3 });

// --- Spec §0 / §1 / §5 tuning ---
export const MATCH_TICKS = 90 * TPS;
export const KIND = Object.freeze({ GRUNT: 0, RUNNER: 1, BRUTE: 2 });
export const RULES = Object.freeze({
  hpMax: 6,
  regenCombo: 12,                    // every N-th consecutive hit restores 1 HP (capped at hpMax)
  guard: 30,                         // ticks after losing HP in which further misses cost no HP (0.5 s)
  stagger: 12,                       // ticks of whiff stagger (200 ms); render greys the hero for exactly this long
  approach: [66, 44, 78],            // ticks from screen edge to strike range, by KIND
  minGap: 6,                         // any two notes (ticks)
  minGapSameLane: 7,                 // same-side neighbours (ticks)
  lastNoteTick: 5280,
});

// --- Spec §3.1 scripted difficulty curve (v3). The script is fixed; the seed only picks among phrases of the
// same level and mirrors left/right, so every seed has the same difficulty shape (fair across days, E2).
// Phrase = one 4-beat bar written as 8 eighth-notes:  '.' rest · A/B grunt · a/b runner (short telegraph) ·
// X/Y one hit of the tanuki boss (all X/Y of a bar = ONE tanuki). A = the bar's first side, B = the other side.
// v4: the tanuki only appears as a boss bar (alone, hits on quarter beats) at the end of main sections.
// Levels introduce ONE new idea at a time (teach -> test -> mix): see gdd/07_difficulty_curve.md.
export const PHRASES = Object.freeze([
  [],
  ['A...A...', 'A...B...', 'A.......', 'A...A...'],                // L1 two hits a bar, one side at a time
  ['A.A.A.A.', 'A.A.B.B.', 'A.B.A.B.', 'A.A.A.B.'],                // L2 every beat, simple side changes
  ['AA..A.B.', 'A.A.BB..', 'AA..BB..', 'A.B.AA..'],                // L3 + eighth-note doubles on one side
  ['A.A.a...', 'A...a.B.', 'a...B.B.', 'A.B...b.'],                // L4 + runner, with space around it
  ['A.A.B.b.', 'a.A.B...', 'AA..b.B.', 'A.b.A...'],                // L5 runners on both sides
  ['ABA.BAB.', 'AB..AB..', 'A.BA.B.A', 'AABBA.B.'],                // L6 quick side switches
  ['Aa..B.b.', 'a.AAb.BB', 'AAB.a.B.', 'AB.b.A.a'],                // L7 runners mixed into switches
  ['ABABAB.a', 'AABBAABB', 'AAB.ABAB', 'aBAb.ABA'],                // L8 dense streams
  ['X.X.X...'],                                                    // L9  boss: 3 hits, one side
  ['X.X.Y.Y.', 'X.X.X.Y.'],                                        // L10 boss: 4 hits, one switch
  ['X.Y.X.Y.', 'X.X.Y.X.'],                                        // L11 boss: 4 hits, switching
].map(Object.freeze));
export const BOSS_LEVEL = 9;                                       // levels >= this are tanuki boss bars

// [id, name, beatTicks, levels per bar, safe, fever, heal]. heal = HP restored as the section starts (breathers). Tempo climbs 112 -> 171 BPM (fever II 180) as a rising
// sawtooth: build, peak, one short breather bar, then a harder build. Safe = misses cost no HP.
const SCRIPT = [
  ['W', '暖身', 32, [1, 1, 2, 2], true, false],
  ['A', '起手', 30, [2, 2, 3, 3], false, false],
  ['A2', '調息', 30, [1], false, false, 1],
  ['B', '交鋒', 28, [3, 4, 3, 4, 4, 5, 5, 9], false, false],
  ['F1', '貓薄荷時間', 26, [5, 6, 5, 6], true, true],
  ['B2', '調息', 26, [2], false, false, 1],
  ['C', '激戰', 25, [5, 6, 5, 6, 6, 7, 6, 10], false, false],
  ['D', '猛攻', 23, [7, 7, 8, 10], false, false],
  ['F2', '貓薄荷時間', 22, [7, 7, 7, 7], true, true],
  ['D2', '調息', 22, [3], false, false, 1],
  ['E', '決戰', 21, [7, 8, 7, 8, 8, 8, 8, 11], false, false],
  ['O', '收尾', 24, [2, 1], false, false],
];
const FIRST_BAR = 120;
export const SEGMENTS = Object.freeze((() => {
  let from = FIRST_BAR;
  return SCRIPT.map(([id, name, beatTicks, levels, safe, fever, heal = 0]) => {
    const seg = { id, name, from, to: from + levels.length * 4 * beatTicks, beatTicks, levels: Object.freeze(levels), safe, fever, heal };
    from = seg.to;
    return Object.freeze(seg);
  });
})());

/**
 * Spec §3: the whole chart, from the seed only. Notes { t (sub-ticks), lane, kind, group, seg, level },
 * sorted by t; id = index. group = one enemy (the tanuki boss is 3–4 notes with one group).
 */
export function buildChart(seed) {
  const notes = [];
  let bar = 0, group = 0;
  SEGMENTS.forEach((s, seg) => {
    s.levels.forEach((level, k) => {
      const list = PHRASES[level], phrase = list[rng.int(seed, 'pattern', bar, list.length)];
      const sideA = rng.int(seed, 'lane', bar, 2), start = s.from + k * 4 * s.beatTicks;
      let boss = -1;                                                  // one tanuki per bar: all its hits share a group
      for (let pos = 0; pos < 8; pos++) {
        const c = phrase[pos];
        if (c === '.') continue;
        const brute = c === 'X' || c === 'Y';
        const lane = (c === 'A' || c === 'a' || c === 'X') ? sideA : 1 - sideA;
        const kind = brute ? KIND.BRUTE : c === 'a' || c === 'b' ? KIND.RUNNER : KIND.GRUNT;
        if (brute && boss < 0) boss = group++;
        notes.push({ t: start * SUB + pos * s.beatTicks * (SUB / 2), lane, kind, group: brute ? boss : group++, seg, level });
      }
      bar++;
    });
  });
  return notes;
}

/** Spec §3.1 spacing rules; returns the first violation or null (tests run it over many seeds). */
export function checkSpacing(chart) {
  const lastByLane = [-Infinity, -Infinity];
  for (let i = 0; i < chart.length; i++) {
    const n = chart[i];
    if (i > 0 && n.t - chart[i - 1].t < RULES.minGap * SUB) return { i, rule: 'minGap' };
    if (n.t - lastByLane[n.lane] < RULES.minGapSameLane * SUB) return { i, rule: 'minGapSameLane' };
    if (n.t >= RULES.lastNoteTick * SUB || n.t / SUB - RULES.approach[n.kind] < 0) return { i, rule: 'range' };
    lastByLane[n.lane] = n.t;
  }
  return null;
}

/** First tick on which the enemy for `note` is on screen (what a player — or a bot — can see). */
export const visibleTick = note => Math.floor(note.t / SUB) - RULES.approach[note.kind];
export const segmentAt = tick => SEGMENTS.findIndex(s => tick >= s.from && tick < s.to);

export function createSim(seed) {
  const chart = buildChart(seed >>> 0);
  return {
    seed: seed >>> 0, tick: 0, chart, judge: createJudge(chart),
    hp: RULES.hpMax, guardUntil: 0, bossHurt: -1, staggerUntil: 0, lockedTaps: 0, hurts: 0, deathTick: -1,
    events: [], recordEvents: true,
  };
}

const emit = (sim, ev) => { if (sim.recordEvents) sim.events.push(ev); };

/** Spec §4 tick order. */
export function step(sim, input) {
  sim.events.length = 0;
  if (phase(sim) === 'over') return;
  const { chart, judge } = sim;

  // 3. input
  const time = sim.tick * SUB + ((input >> 4) & 15);
  for (const [bit, lane] of [[IN_L, 0], [IN_R, 1]]) {
    if (!(input & bit)) continue;
    if (sim.tick < sim.staggerUntil) { sim.lockedTaps++; emit(sim, { type: 'locked', lane }); continue; }
    const r = judgeTap(judge, chart, time, lane, WINDOWS);
    if (r.whiff) {
      sim.staggerUntil = sim.tick + RULES.stagger;
      emit(sim, { type: 'whiff', lane });
    } else {
      const n = chart[r.note];
      if (judge.combo % RULES.regenCombo === 0 && sim.hp < RULES.hpMax) { sim.hp++; emit(sim, { type: 'heal', hp: sim.hp }); }
      emit(sim, { type: 'hit', note: r.note, lane, grade: r.grade, pts: r.pts, kind: n.kind, combo: judge.combo, last: chart[r.note + 1]?.group !== n.group });
    }
  }

  // 4. misses -> hurt
  judgeMisses(judge, chart, sim.tick * SUB, WINDOWS, i => {
    sim.hurts++;
    const safe = SEGMENTS[chart[i].seg].safe;
    const n = chart[i];
    const guarded = sim.tick < sim.guardUntil                        // one damage per 0.5 s cluster of misses
      || (n.kind === KIND.BRUTE && n.group === sim.bossHurt);        // and at most 1 HP per tanuki boss (v4)
    if (!safe && !guarded && sim.hp > 0) {
      sim.hp--; sim.guardUntil = sim.tick + RULES.guard;
      if (n.kind === KIND.BRUTE) sim.bossHurt = n.group;
    }
    emit(sim, { type: 'hurt', note: i, lane: chart[i].lane, hp: sim.hp, safe: safe || guarded });   // safe = no HP lost
    if (sim.hp === 0 && sim.deathTick < 0) { sim.deathTick = sim.tick; emit(sim, { type: 'death' }); }
  });

  // 5. segment change
  const seg = SEGMENTS.findIndex(s => s.from === sim.tick);
  if (seg >= 0) {
    const S = SEGMENTS[seg];
    emit(sim, { type: 'segment', id: S.id, fever: S.fever });
    if (S.heal && sim.hp > 0 && sim.hp < RULES.hpMax) { sim.hp = Math.min(RULES.hpMax, sim.hp + S.heal); emit(sim, { type: 'heal', hp: sim.hp }); }
  }

  sim.tick++;
}

export const phase = sim => (sim.hp <= 0 || sim.tick >= MATCH_TICKS ? 'over' : 'play');
export const score = sim => sim.judge.score;
export const maxScore = sim => chartMax(sim.chart);

/** Spec §6 result breakdown (shown on the result screen; numeric so skill-dominance can average it). */
export function scoreBreakdown(sim) {
  const [miss, good, great, perfect] = sim.judge.counts;
  return {
    perfect, great, good, miss, whiffs: sim.judge.whiffs, locked: sim.lockedTaps,
    maxCombo: sim.judge.maxCombo, hurts: sim.hurts, notes: sim.chart.length,
    ratePermille: Math.trunc((sim.judge.score * 1000) / chartMax(sim.chart)),
  };
}

export function stateHash(sim) {
  const j = sim.judge;
  return createHasher(sim.tick).mixAll([
    sim.hp, sim.guardUntil, sim.bossHurt, sim.staggerUntil, sim.lockedTaps, sim.hurts, sim.deathTick,
    j.score, j.combo, j.maxCombo, j.whiffs, j.next, ...j.counts, ...j.grade,
  ]).value();
}

/** GameDef consumed by core/match.js (Recorder, replay, verify) and tools/skill-dominance.mjs. */
export const GAME = Object.freeze({
  id: 'twin-strike', version: 5, maxTicks: MATCH_TICKS,
  createSim, step, phase, score, stateHash, scoreBreakdown,
});
