// Score verification pipeline (docs/backend_design.md §5). Pure: (upload, daily, now) -> verdict.
// Hard checks reject the upload outright; soft flags accept it but hold it for human review.
import { SIMS, GAME_ID } from './sims.js';
import { SUBMIT_GRACE_MS } from './daily.js';

export const LIMITS = Object.freeze({
  offsetMs: 150,           // knowledge-base/13 §3: calibration is clamped to ±150 ms on the client
  maxChoices: 64,
  maxMetaBytes: 1024,
  topRatePermille: 980,    // >= 98 % of the theoretical max: always reviewed before it goes public
  lateTapShare: 0.25,      // share of taps the client delivered a tick late (lag spikes or a tampered clock)
});

const isInt = (v, lo = -Infinity, hi = Infinity) => Number.isInteger(v) && v >= lo && v <= hi;
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const reject = (http, code, detail) => ({ ok: false, http, code, ...(detail === undefined ? {} : { detail }) });

/** Shape check before any replay: types, ranges and sizes (the body itself is capped in app.js). */
function shapeError(u, maxTicks) {
  if (!u || typeof u !== 'object') return 'upload';
  if (typeof u.game !== 'string') return 'game';
  if (!isInt(u.version, 1)) return 'version';
  if (!isInt(u.seed, 0, 0xffffffff)) return 'seed';
  if (!isInt(u.ticks, 1, maxTicks)) return 'ticks';
  if (!isInt(u.score, 0)) return 'score';
  if (!isInt(u.hash, 0, 0xffffffff)) return 'hash';
  // RLE pairs (value, count) -> at most 2 bytes per tick -> base64
  if (typeof u.log !== 'string' || u.log.length > Math.ceil((maxTicks * 2) / 3) * 4 || !B64_RE.test(u.log)) return 'log';
  if (!Array.isArray(u.choices) || u.choices.length > LIMITS.maxChoices
    || !u.choices.every(c => Array.isArray(c) && c.length === 3 && c.every(x => isInt(x, 0)))) return 'choices';
  if (!u.meta || typeof u.meta !== 'object' || Array.isArray(u.meta) || JSON.stringify(u.meta).length > LIMITS.maxMetaBytes) return 'meta';
  return null;
}

/**
 * Second pass with sim events on: tap times per lane (for macroSuspicion), timing error of every hit
 * (for errorSuspicion), and bytes the official client can never produce (TapQueue delivers one tap per tick).
 */
export function analyze(S, seed, log, ticks) {
  const sim = S.createSim(seed), msPerSub = S.TICK_MS / S.SUB;
  const taps = [[], []], errors = [];
  let impossible = 0;
  for (let t = 0; t < ticks && S.phase(sim) === 'play'; t++) {
    const b = log[t], at = t * S.SUB + ((b >> 4) & 15);
    if ((b & S.IN_L) && (b & S.IN_R)) impossible++;
    if (b & ~(S.IN_L | S.IN_R | 0xf0)) impossible++;
    if (b & S.IN_L) taps[0].push(at * msPerSub);
    if (b & S.IN_R) taps[1].push(at * msPerSub);
    S.step(sim, b);
    for (const ev of sim.events) if (ev.type === 'hit') errors.push((at - sim.chart[ev.note].t) * msPerSub);
  }
  return { taps, errors, impossible };
}

/** Soft flags. Codes only go to reviewers, never back to the client (so bots cannot tune against them). */
export function flagsFor(S, a, ratePermille, meta) {
  const flags = [];
  for (const lane of [0, 1]) {
    const m = S.macroSuspicion(a.taps[lane]);
    if (m.suspicious) flags.push({ code: 'macro', lane, reasons: m.reasons });
  }
  const e = S.errorSuspicion(a.errors);
  if (e.suspicious) flags.push({ code: 'error_sd', sdMs: Math.round(e.sdMs * 100) / 100, hits: e.n });
  if (ratePermille >= LIMITS.topRatePermille) flags.push({ code: 'top_score', ratePermille });
  if (a.impossible) flags.push({ code: 'non_client_input', bytes: a.impossible });
  const tapCount = a.taps[0].length + a.taps[1].length;
  if (isInt(meta.lateTaps, 0) && tapCount >= 20 && meta.lateTaps / tapCount > LIMITS.lateTapShare) flags.push({ code: 'late_taps', late: meta.lateTaps, taps: tapCount });
  return flags;
}

/**
 * @param upload  Recorder.upload() from the client
 * @param daily   the day's record (date, game, version, seed, maxScore, opensAt, closesAt)
 * @param now     server time (ms)
 * @returns { ok: false, http, code, detail? } | { ok: true, score, hash, ticks, ratePermille, breakdown, flags, verifyMs }
 */
export function checkSubmission(upload, daily, now) {
  const S = SIMS.get(daily.version);
  if (!S) return reject(500, 'sim_missing', `server has no sim v${daily.version}`);
  const bad = shapeError(upload, S.GAME.maxTicks);
  if (bad) return reject(400, 'bad_upload', bad);

  if (upload.game !== GAME_ID) return reject(422, 'wrong_game');
  if (upload.version !== daily.version) return reject(409, 'version_mismatch', { need: daily.version });
  if (upload.seed !== daily.seed) return reject(422, 'wrong_seed');
  if (now < daily.opensAt) return reject(422, 'not_open');
  if (now > daily.closesAt + SUBMIT_GRACE_MS) return reject(422, 'window_closed');
  if (upload.score > daily.maxScore) return reject(422, 'above_max', { max: daily.maxScore });
  const off = upload.meta.inputOffsetMs;
  if (typeof off !== 'number' || !Number.isFinite(off) || Math.abs(off) > LIMITS.offsetMs) return reject(422, 'offset_out_of_range');

  const t0 = performance.now();
  let v, log;
  try {
    log = S.decodeLog(upload.log, S.GAME.maxTicks);
    v = S.verify(S.GAME, upload);
  } catch {
    return reject(400, 'bad_upload', 'log');
  }
  if (!v.valid) return reject(422, 'replay_failed', v.reason);
  const breakdown = S.scoreBreakdown(v.sim);
  const a = analyze(S, upload.seed, log, upload.ticks);
  const verifyMs = Math.round((performance.now() - t0) * 10) / 10;

  return {
    ok: true, score: v.score, hash: v.hash, ticks: v.ticks, ratePermille: breakdown.ratePermille, breakdown,
    flags: flagsFor(S, a, breakdown.ratePermille, upload.meta), verifyMs,
  };
}
