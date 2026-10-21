// Human-factor playtest bots (gdd/07_difficulty_curve.md). Unlike the skill-tier bots in bots.mjs, these
// model WHY people miss: reading load (density, quick side switches, short telegraphs), novelty of a new
// enemy type (and learning it), reaction time, impatience and late-match fatigue. Used by
// tools/difficulty-curve.mjs to check that the scripted curve rises steadily without cliffs.
// Same rules as every bot: only bytes a human could send, only what is on screen, deterministic (hash32).
import { hash32 } from '../src/sim/core/index.js';
import { msToSub } from '../src/sim/core/timing.js';
import { SUB, KIND, IN_L, IN_R, encode, visibleTick } from '../src/sim/sim.js';

const bell = (seed, salt, i) => { let s = 0; for (let k = 0; k < 4; k++) s += (hash32(seed, salt + k, i) / 4294967296) * 2 - 1; return s / 2; };
const roll = (seed, salt, i) => hash32(seed, salt, i) / 4294967296;

/** Per-note load for a chart (pure function of the chart, cached per chart). */
const loadCache = new WeakMap();
function loads(chart) {
  let L = loadCache.get(chart);
  if (L) return L;
  const seen = [0, 0, 0];
  L = chart.map((n, i) => {
    const win = SUB * 30;                                          // ±0.5 s
    let d = 0;
    for (let j = i; j >= 0 && n.t - chart[j].t <= win; j--) d++;
    for (let j = i + 1; j < chart.length && chart[j].t - n.t <= win; j++) d++;
    const prev = chart[i - 1], gapMs = prev ? ((n.t - prev.t) / SUB) * (1000 / 60) : 1e9;
    const sw = prev && prev.lane !== n.lane && gapMs < 300;
    const novelty = Math.exp(-seen[n.kind] / 6);                   // first few runners / brutes are hard, then learnt
    seen[n.kind]++;
    return { density: d, gapMs, sw, novelty: n.kind === KIND.GRUNT ? 0 : novelty };
  });
  loadCache.set(chart, L);
  return L;
}

/**
 * @param p { sdMs, reactMs, missPm, wrongPm, switchWrongPm, rushPm, densityK, switchK, noveltyK, runnerK, fastK, fatigueK }
 */
function humanBot(salt, p) {
  const plans = new WeakMap();                                     // per sim: note -> { at, lane } | null
  const plan = (sim, i) => {
    let m = plans.get(sim);
    if (!m) { m = new Map(); plans.set(sim, m); }
    if (m.has(i)) return m.get(i);
    const n = sim.chart[i], l = loads(sim.chart)[i], seed = sim.seed;
    let sd = p.sdMs * (1 + p.densityK * Math.max(0, l.density - 2)) * (l.sw ? 1 + p.switchK : 1)
      * (1 + p.noveltyK * l.novelty) * (n.kind === KIND.RUNNER ? 1 + p.runnerK : 1) * (l.gapMs < 150 ? 1 + p.fastK : 1)
      * (n.t / SUB > 3600 ? 1 + p.fatigueK : 1);
    const visibleMs = (n.t / SUB - visibleTick(n)) * (1000 / 60);
    let late = Math.max(0, p.reactMs - visibleMs);                 // saw it too late: tap drifts late
    let r = null;
    const missPm = p.missPm * (1 + Math.max(0, l.density - 3) * 0.5) + (late > 0 ? 200 : 0);
    if (roll(seed, salt + 9, i) * 1000 >= missPm) {
      let at = n.t + msToSub(late) + Math.round(bell(seed, salt, i) * (msToSub(sd) / 0.58));
      if (roll(seed, salt + 7, i) * 1000 < p.rushPm) at = n.t - msToSub(150 + (hash32(seed, salt + 6, i) % 101));
      const wrongPm = p.wrongPm + (l.sw ? p.switchWrongPm : 0) + l.novelty * 20;
      r = { at, lane: n.lane ^ (roll(seed, salt + 8, i) * 1000 < wrongPm ? 1 : 0) };
    }
    m.set(i, r);
    return r;
  };
  return {
    input(sim) {
      const from = sim.tick * SUB, to = from + SUB, { chart, judge } = sim;
      for (let i = judge.next; i < chart.length && chart[i].t < to + msToSub(500); i++) {
        if (judge.grade[i] >= 0 || sim.tick < visibleTick(chart[i])) continue;
        const r = plan(sim, i);
        if (!r || r.at < from || r.at >= to) continue;
        return encode(r.lane ? IN_R : IN_L, r.at - from);
      }
      return 0;
    },
  };
}

// Three people, not three skill levels of the same machine: a first-time casual player, a regular, a skilled player.
export const HUMANS = {
  casual: humanBot(1100, { sdMs: 58, reactMs: 320, missPm: 15, wrongPm: 10, switchWrongPm: 60, rushPm: 15, densityK: 0.12, switchK: 0.35, noveltyK: 0.8, runnerK: 0.25, fastK: 0.3, fatigueK: 0.08 }),
  regular: humanBot(1200, { sdMs: 34, reactMs: 250, missPm: 6, wrongPm: 4, switchWrongPm: 25, rushPm: 5, densityK: 0.09, switchK: 0.25, noveltyK: 0.6, runnerK: 0.15, fastK: 0.2, fatigueK: 0.05 }),
  skilled: humanBot(1300, { sdMs: 20, reactMs: 200, missPm: 2, wrongPm: 1, switchWrongPm: 8, rushPm: 0, densityK: 0.06, switchK: 0.15, noveltyK: 0.4, runnerK: 0.1, fastK: 0.1, fatigueK: 0.03 }),
};
