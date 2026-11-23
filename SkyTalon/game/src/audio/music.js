// Battle music, synthesised as it plays (0 bytes of audio): an epic, orchestral-leaning arrangement built from Web
// Audio voices: a string ostinato, a sustained low-brass and sub bass, a warm pad, a heroic brass melody, taiko-style
// drums with a marching snare, a cymbal swell into every phrase, all through a generated hall reverb. Two loops: the
// flight theme and a darker, faster boss theme. It goes through the effects' master, so the mute button silences it.
// Render layer only; nothing here touches the sim.
//
// A theme: bpm, a chord per bar (root MIDI note, minor 'm' or major 'M'), the key's tonic for the melody, a melody as
// [scale degree, beats] pairs per 8 bars ('7#' = raised seventh, null = rest), and 16-step drum and ostinato patterns.
const MIDI = n => 440 * 2 ** ((n - 69) / 12);
const MINOR = { 1: 0, 2: 2, 3: 3, 4: 5, 5: 7, 6: 8, 7: 10, '7#': 11, 8: 12, 9: 14, 10: 15 };
const TRIAD = { m: [0, 3, 7], M: [0, 4, 7] };

export const THEMES = {
  // the flight: D minor, heroic and wide, 104 bpm (i VI III VII i VI iv V)
  flight: {
    bpm: 104, gain: 0.2, tonic: 62,
    chords: [[50, 'm'], [46, 'M'], [53, 'M'], [48, 'M'], [50, 'm'], [46, 'M'], [55, 'm'], [57, 'M']],
    melody: [[5, 1.5], [4, 0.5], [5, 1], [8, 1], [7, 2], [6, 1], [5, 1], [3, 1.5], [4, 0.5], [5, 1], [3, 1], [4, 3], [null, 1],
      [5, 1.5], [4, 0.5], [5, 1], [8, 1], [9, 2], [8, 1], [7, 1], [6, 1], [5, 1], [4, 1], [3, 1], [5, 2], ['7#', 1], [5, 1]],
    ostinato: 'x.xxx.xxx.xxx.xx', taiko: 'x.......x.x.....', snare: '....x.......x..x', brassOct: 0,
  },
  // the boss: C minor, 132 bpm, driving sixteenths, heavier drums, the melody an octave down in the low brass
  boss: {
    bpm: 132, gain: 0.21, tonic: 60,
    chords: [[48, 'm'], [44, 'M'], [51, 'M'], [46, 'M'], [48, 'm'], [44, 'M'], [53, 'm'], [55, 'M']],
    melody: [[1, 1], [1, 0.5], [1, 0.5], [3, 1], [1, 1], [6, 2], [5, 1], [4, 1], [3, 1], [4, 1], [5, 1], [7, 1], [8, 2], ['7#', 2],
      [8, 1], [8, 0.5], [8, 0.5], [7, 1], [6, 1], [5, 2], [4, 1], [3, 1], [4, 1], [3, 1], [2, 1], ['7#', 1], [1, 4]],
    ostinato: 'xxxxxxxxxxxxxxxx', taiko: 'x..x..x.x..x..x.', snare: '....x.......x.xx', brassOct: -12,
  },
};

export class Music {
  /** @param sfx the Sfx whose context and master this plays through */
  constructor(sfx) { this.sfx = sfx; this.theme = null; this.timer = 0; this.step = 0; this.next = 0; this.out = null; this.wet = null; }

  /** Play a theme by name (from its start), or keep playing if it already is. Waits for audio to be unlocked. */
  play(name) {
    if (this.theme === THEMES[name]) return;
    this.stop();
    this.theme = THEMES[name] ?? null;
    if (!this.theme) return;
    this.step = 0; this.next = 0;
    this.notes = melodySteps(this.theme.melody);
    this.timer = setInterval(() => this.tick(), 40);
  }

  /** Fade out and stop. */
  stop() {
    clearInterval(this.timer); this.timer = 0; this.theme = null;
    const ctx = this.sfx.ctx, out = this.out;
    if (ctx && out) { out.gain.setTargetAtTime(0, ctx.currentTime, 0.25); setTimeout(() => out.disconnect(), 1500); }
    this.out = null; this.wet = null;
  }

  /** the music bus: a dry path and a generated hall reverb (decaying noise impulse, 2.4 s), both to the master */
  bus() {
    const ctx = this.sfx.ctx, T = this.theme;
    this.out = ctx.createGain(); this.out.gain.value = T.gain; this.out.connect(this.sfx.master);
    const len = Math.floor(ctx.sampleRate * 2.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let s = 0x1234567 + c * 977; for (let i = 0; i < len; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; d[i] = ((s >>> 0) / 2147483648 - 1) * (1 - i / len) ** 2.6; } }
    const conv = ctx.createConvolver(), wetGain = ctx.createGain();
    conv.buffer = ir; wetGain.gain.value = 0.42;
    this.wet = ctx.createGain(); this.wet.connect(conv).connect(wetGain).connect(this.out);
  }

  tick() {
    const ctx = this.sfx.ctx, T = this.theme;
    if (!ctx || ctx.state !== 'running' || !T) return;
    if (!this.out) { this.bus(); this.next = ctx.currentTime + 0.08; }
    const dt = 60 / T.bpm / 4;
    while (this.next < ctx.currentTime + 0.25) { this.at(this.step, this.next, dt); this.step++; this.next += dt; }
  }

  at(step, t, dt) {
    const T = this.theme, ctx = this.sfx.ctx, s = step % 16, barN = Math.floor(step / 16), bar = barN % T.chords.length, [root, q] = T.chords[bar];
    const beat = dt * 4, triad = TRIAD[q];
    // a voice: oscillators (detuned stack) -> lowpass with its own envelope -> amp envelope -> dry and reverb sends
    const voice = ({ wave = 'sawtooth', freqs, len, gain, attack = 0.01, release = 0.15, cut = [1800, 1800], q: Q = 0.7, wet = 0.3 }) => {
      const flt = ctx.createBiquadFilter(), amp = ctx.createGain();
      flt.type = 'lowpass'; flt.Q.value = Q;
      flt.frequency.setValueAtTime(cut[0], t); flt.frequency.linearRampToValueAtTime(cut[1], t + Math.min(len, attack * 3 + 0.05));
      amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(gain, t + attack);
      amp.gain.setValueAtTime(gain, t + Math.max(attack, len - release)); amp.gain.exponentialRampToValueAtTime(0.0001, t + len + release);
      for (const f of freqs) { const o = ctx.createOscillator(); o.type = wave; o.frequency.value = f; o.connect(flt); o.start(t); o.stop(t + len + release + 0.05); }
      flt.connect(amp); amp.connect(this.out);
      const send = ctx.createGain(); send.gain.value = wet; amp.connect(send).connect(this.wet);
    };
    const noise = (len, gain, type, f, Q = 1, wet = 0.2, rise = 0) => {
      const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = this.sfx.noise(); flt.type = type; flt.frequency.value = f; flt.Q.value = Q;
      if (rise) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + rise); g.gain.exponentialRampToValueAtTime(0.0001, t + rise + len); }
      else { g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len); }
      src.connect(flt).connect(g).connect(this.out);
      const send = ctx.createGain(); send.gain.value = wet; g.connect(send).connect(this.wet);
      src.start(t); src.stop(t + rise + len + 0.05);
    };
    const det = (f, n = 3, cents = 9) => Array.from({ length: n }, (_, i) => f * 2 ** (((i - (n - 1) / 2) * cents) / 1200));

    // once a bar: the pad (the chord, wide and soft) and the low brass with a sub under it
    if (s === 0) {
      voice({ freqs: triad.flatMap(iv => det(MIDI(root + 12 + iv), 2, 12)), len: beat * 4, gain: 0.05, attack: 0.5, release: 0.6, cut: [500, 1400], wet: 0.6 });
      voice({ freqs: det(MIDI(root - 12), 3, 7), len: beat * 4 * 0.95, gain: 0.11, attack: 0.08, release: 0.3, cut: [300, 900], wet: 0.25 });
      voice({ wave: 'sine', freqs: [MIDI(root - 24)], len: beat * 4 * 0.95, gain: 0.22, attack: 0.02, release: 0.2, cut: [400, 400], wet: 0 });
    }
    // the string ostinato: root, fifth and octave in short bowed strokes
    if (T.ostinato[s] === 'x') {
      const pick = [0, 7, 12, 7][s % 4] + (q === 'm' || s % 8 < 4 ? 0 : 0);
      voice({ freqs: det(MIDI(root + pick), 2, 10), len: dt * 0.85, gain: 0.07, attack: 0.008, release: 0.05, cut: [2600, 1400], q: 1.2, wet: 0.25 });
    }
    // the brass melody
    const n = this.notes.get(step % this.notes.len);
    if (n && n.deg !== null) {
      const f = MIDI(T.tonic + MINOR[n.deg] + T.brassOct);
      voice({ freqs: det(f, 3, 8), len: n.len * dt * 0.96, gain: 0.12, attack: 0.045, release: 0.18, cut: [700, 2600], q: 1.4, wet: 0.35 });
      voice({ freqs: det(f / 2, 2, 6), len: n.len * dt * 0.96, gain: 0.06, attack: 0.06, release: 0.18, cut: [500, 1500], wet: 0.3 });
    }
    // taiko: a deep pitched drop plus a skin slap; the marching snare
    if (T.taiko[s] === 'x') {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.35);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g).connect(this.out); const send = ctx.createGain(); send.gain.value = 0.35; g.connect(send).connect(this.wet); o.start(t); o.stop(t + 0.6);
      noise(0.09, 0.35, 'bandpass', 260, 1.2, 0.3);
    }
    if (T.snare[s] === 'x') noise(0.18, 0.28, 'bandpass', 1700, 0.8, 0.35);
    // into every second bar of a four-bar phrase: a cymbal swell; on the phrase's first beat, the crash it swells into
    if (s === 12 && barN % 4 === 3) noise(0.05, 0.12, 'highpass', 5000, 0.7, 0.5, beat);
    if (s === 0 && barN % 4 === 0 && barN > 0) noise(1.6, 0.14, 'highpass', 4500, 0.7, 0.6);
  }
}

/** The melody laid out on sixteenth steps: a map from step to { deg, len } and the loop length in steps. */
function melodySteps(melody) {
  const m = new Map(); let step = 0;
  for (const [deg, beats] of melody) { const len = Math.round(beats * 4); m.set(step, { deg, len }); step += len; }
  return { get: k => m.get(k), len: step };
}
