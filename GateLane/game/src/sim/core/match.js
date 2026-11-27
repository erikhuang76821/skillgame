// Recording, replay verification and compact log encoding for any game that implements the
// GameDef contract below. The server runs replay() on the uploaded log; a mismatch voids the score.
//
// GameDef (exported by src/sim/sim.js as GAME):
//   id, version          string / int — bump `version` whenever a rule change alters outcomes
//   maxTicks             hard cap on match length (log buffer size)
//   createSim(seed)      -> sim
//   step(sim, input)     one fixed tick; `input` is one byte (see spec §2 for the bit layout)
//   phase(sim)           'play' | 'choice' | 'over'
//   choose(sim, index)   -> boolean (only while phase === 'choice'); omit if the game has none
//   score(sim)           -> int
//   stateHash(sim)       -> uint32

export class Recorder {
  constructor(game, seed) {
    this.game = game;
    this.seed = seed >>> 0;
    this.sim = game.createSim(this.seed);
    this.log = new Uint8Array(game.maxTicks);
    this.ticks = 0;
    this.choices = []; // [tick, ordinal, index]
    this.meta = {};    // client facts the server checks but the sim never reads (e.g. inputOffsetMs, late taps)
  }

  get phase() { return this.game.phase(this.sim); }

  step(input) {
    if (this.phase !== 'play' || this.ticks >= this.game.maxTicks) return false;
    this.log[this.ticks++] = input;
    this.game.step(this.sim, input);
    return true;
  }

  choose(index) {
    if (this.phase !== 'choice') return false;
    const entry = [this.ticks, this.choices.length, index];
    if (!this.game.choose(this.sim, index)) return false;
    this.choices.push(entry);
    return true;
  }

  /** What the client uploads (plus the encoded log). */
  result() {
    const { game, sim } = this;
    return { game: game.id, version: game.version, seed: this.seed, ticks: this.ticks, score: game.score(sim), hash: game.stateHash(sim) };
  }

  upload() {
    return { ...this.result(), log: encodeLog(this.log, this.ticks), choices: this.choices, meta: this.meta };
  }
}

/**
 * Re-run a match from (seed, log, choices). Returns { valid, score, hash, ticks, sim }.
 * Pass `ticks` (the claimed match length) to also reject logs that run past the end of the match.
 */
export function replay(game, seed, log, choices = [], ticks) {
  const exact = ticks !== undefined;
  if (!exact) ticks = log.length;
  const sim = game.createSim(seed >>> 0);
  if ('recordEvents' in sim) sim.recordEvents = false;
  let t = 0, c = 0;
  const fail = reason => ({ valid: false, reason, sim, ticks: t });
  while (game.phase(sim) !== 'over') {
    if (game.phase(sim) === 'choice') {
      const ch = choices[c];
      if (!ch || ch[0] !== t || ch[1] !== c || !game.choose(sim, ch[2])) return fail(`choice ${c}`);
      c++;
    } else {
      if (t >= ticks || t >= game.maxTicks) return fail('log ended before match');
      game.step(sim, log[t++]);
    }
  }
  if (c !== choices.length) return fail('unused choices');
  if (exact && t !== ticks) return fail('log longer than match');
  return { valid: true, score: game.score(sim), hash: game.stateHash(sim), ticks: t, sim };
}

/** Server-side check of an upload from Recorder.upload(). */
export function verify(game, upload) {
  if (upload.game !== game.id) return { valid: false, reason: 'wrong game' };
  if (upload.version !== game.version) return { valid: false, reason: `sim version ${upload.version} != ${game.version}` };
  const r = replay(game, upload.seed, decodeLog(upload.log, game.maxTicks), upload.choices, upload.ticks);
  if (!r.valid) return r;
  if (r.score !== upload.score || r.hash !== upload.hash) return { ...r, valid: false, reason: 'score/hash mismatch' };
  return r;
}

// Run-length encode (value, count<=255) pairs -> base64. A 3-minute log is usually well under 2 KB.
export function encodeLog(log, length = log.length) {
  let bin = '';
  for (let i = 0; i < length;) {
    let n = 1;
    while (i + n < length && n < 255 && log[i + n] === log[i]) n++;
    bin += String.fromCharCode(log[i], n);
    i += n;
  }
  return btoa(bin);
}

export function decodeLog(text, maxTicks) {
  const bin = atob(text), log = new Uint8Array(maxTicks);
  let i = 0;
  for (let k = 0; k + 1 < bin.length && i < maxTicks; k += 2) {
    const n = bin.charCodeAt(k + 1);
    log.fill(bin.charCodeAt(k), i, Math.min(i + n, maxTicks));
    i += n;
  }
  return log;
}

/** Drive a match with a policy (bots, tests): policy.input(sim) -> byte, policy.pick(sim) -> index. */
export function playMatch(game, seed, policy) {
  const rec = new Recorder(game, seed);
  if ('recordEvents' in rec.sim) rec.sim.recordEvents = false;
  while (rec.phase !== 'over') {
    if (rec.phase === 'choice') { if (!rec.choose(policy.pick?.(rec.sim) ?? 0)) throw new Error('bot picked an invalid choice'); }
    else if (!rec.step(policy.input(rec.sim))) throw new Error(`match exceeded maxTicks (${game.maxTicks})`);
  }
  return rec;
}
