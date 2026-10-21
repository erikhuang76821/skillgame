// Input recording, replay verification (server-side score check, gdd/10) and compact log encoding.
import { createSim, step, choose, score, stateHash, MATCH_TICKS } from './sim.js';

export class Recorder {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.sim = createSim(seed);
    this.log = new Uint8Array(MATCH_TICKS);
    this.choices = []; // [tick, levelupIndex, choice]
  }

  step(input) {
    if (this.sim.state !== 'play') return;
    this.log[this.sim.tick] = input;
    step(this.sim, input);
  }

  choose(index) {
    const s = this.sim;
    if (s.state !== 'levelup') return false;
    const entry = [s.tick, s.levelups, index];
    if (!choose(s, index)) return false;
    this.choices.push(entry);
    return true;
  }

  result() {
    return { seed: this.seed, score: score(this.sim), hash: stateHash(this.sim), ticks: this.sim.tick };
  }
}

export function replay(seed, log, choices) {
  const sim = createSim(seed);
  sim.recordEvents = false;
  let c = 0;
  while (sim.state !== 'over') {
    if (sim.state === 'levelup') {
      const ch = choices[c++];
      if (!ch || ch[0] !== sim.tick || ch[1] !== sim.levelups || !choose(sim, ch[2])) return { valid: false, sim };
    } else {
      if (sim.tick >= log.length) return { valid: false, sim };
      step(sim, log[sim.tick]);
    }
  }
  return { valid: c === choices.length, sim, score: score(sim), hash: stateHash(sim) };
}

// Run-length encode (value, count<=255) pairs -> base64. A 180 s log is usually well under 2 KB.
export function encodeLog(log, length) {
  let bin = '';
  for (let i = 0; i < length;) {
    let n = 1;
    while (i + n < length && n < 255 && log[i + n] === log[i]) n++;
    bin += String.fromCharCode(log[i], n);
    i += n;
  }
  return btoa(bin);
}

export function decodeLog(text) {
  const bin = atob(text), log = new Uint8Array(MATCH_TICKS);
  let i = 0;
  for (let k = 0; k + 1 < bin.length; k += 2) {
    const n = bin.charCodeAt(k + 1);
    log.fill(bin.charCodeAt(k), i, i + n);
    i += n;
  }
  return log;
}
