// Battle music, synthesised as it plays (0 bytes of audio): an epic, orchestral-leaning arrangement built from Web
// Audio voices: an ostinato, a sustained low-brass and sub bass, a pad, a lead melody, taiko-style drums with a
// marching snare, a cymbal swell into every phrase, all through a generated hall reverb. Every leg has its own flight
// theme (it starts with the leg's cutscene and runs on into the match) and a darker, faster boss variant. It goes
// through the effects' master, so the mute button silences it. Render layer only; nothing here touches the sim.
//
// A theme: bpm, a chord per bar (root MIDI note, minor 'm' or major 'M'), the key's tonic and scale for the melody, a
// melody as [scale degree, beats] pairs per 8 bars ('7#' = raised seventh, null = rest), 16-step drum and ostinato
// patterns, and the voices: lead 'brass' | 'horn' | 'pluck', pad 'strings' | 'choir', ostinato 'strings' | 'mallet'.
const MIDI = n => 440 * 2 ** ((n - 69) / 12);
const MINOR = { 1: 0, 2: 2, 3: 3, 4: 5, 5: 7, 6: 8, 7: 10, '7#': 11, 8: 12, 9: 14, 10: 15 };
const PHRYGIAN = { ...MINOR, 2: 1, 9: 13 };
const DORIAN = { ...MINOR, 6: 9 };
const TRIAD = { m: [0, 3, 7], M: [0, 4, 7] };
const VOICES = { lead: 'brass', pad: 'strings', ost: 'strings', scale: MINOR, arp: [0, 7, 12, 7], taikoGain: 0.9, brassOct: 0 };

/** the boss variant of a flight theme: faster, driving sixteenths, heavier drums, the melody an octave down */
const bossOf = (T, extra = {}) => ({
  ...T, bpm: Math.round(T.bpm * 1.25), gain: T.gain + 0.01, ostinato: 'xxxxxxxxxxxxxxxx', taiko: 'x..x..x.x..x..x.',
  snare: '....x.......x.xx', brassOct: T.brassOct < 0 ? T.brassOct : -12, taikoGain: Math.max(1, T.taikoGain), ...extra,
});

const LEG1 = {
  // the departure: D minor, heroic and wide, 104 bpm (i VI III VII i VI iv V)
  ...VOICES, bpm: 104, gain: 0.2, tonic: 62,
  chords: [[50, 'm'], [46, 'M'], [53, 'M'], [48, 'M'], [50, 'm'], [46, 'M'], [55, 'm'], [57, 'M']],
  melody: [[5, 1.5], [4, 0.5], [5, 1], [8, 1], [7, 2], [6, 1], [5, 1], [3, 1.5], [4, 0.5], [5, 1], [3, 1], [4, 3], [null, 1],
    [5, 1.5], [4, 0.5], [5, 1], [8, 1], [9, 2], [8, 1], [7, 1], [6, 1], [5, 1], [4, 1], [3, 1], [5, 2], ['7#', 1], [5, 1]],
  ostinato: 'x.xxx.xxx.xxx.xx', taiko: 'x.......x.x.....', snare: '....x.......x..x',
};
const LEG2 = {
  // out into the cold: E minor, rising and hopeful, a horn over harp-like mallets, 112 bpm
  ...VOICES, bpm: 112, gain: 0.2, tonic: 64, lead: 'horn', ost: 'mallet', arp: [0, 7, 12, 15],
  chords: [[52, 'm'], [48, 'M'], [55, 'M'], [50, 'M'], [52, 'm'], [48, 'M'], [57, 'm'], [59, 'M']],
  melody: [[5, 1], [6, 1], [7, 1], [8, 1], [9, 2], [8, 1], [7, 1], [8, 1.5], [7, 0.5], [5, 2], [6, 2], [5, 2],
    [5, 1], [6, 1], [7, 1], [8, 1], [10, 2], [9, 1], [8, 1], [7, 1], [6, 1], [4, 2], ['7#', 2], [5, 2]],
  ostinato: 'x.x.x.x.x.x.x.x.', taiko: 'x.......x.......', snare: '............x...',
};
const LEG3 = {
  // the giants' war drums: C minor, slow and heavy, the melody in the low brass, 92 bpm
  ...VOICES, bpm: 92, gain: 0.21, tonic: 60, brassOct: -12, taikoGain: 1.15,
  chords: [[48, 'm'], [44, 'M'], [53, 'm'], [55, 'M'], [48, 'm'], [51, 'M'], [46, 'M'], [55, 'M']],
  melody: [[1, 2], [5, 2], [6, 2], [5, 1], [4, 1], [3, 2], [4, 1], [5, 1], ['7#', 4],
    [1, 2], [3, 2], [5, 3], [6, 1], [7, 2], [6, 1], [5, 1], [5, 4]],
  ostinato: 'x..xx..xx..xx.x.', taiko: 'x..x....x..x..x.', snare: '....x.......x...',
};
const LEG4 = {
  // the underworld: B phrygian, a choir pad and a dark brass line, 96 bpm
  ...VOICES, bpm: 96, gain: 0.2, tonic: 59, scale: PHRYGIAN, pad: 'choir', arp: [0, 1, 7, 1],
  chords: [[47, 'm'], [48, 'M'], [47, 'm'], [45, 'M'], [43, 'M'], [48, 'M'], [47, 'm'], [42, 'M']],
  melody: [[1, 1], [2, 1], [1, 2], [5, 2], [6, 1], [5, 1], [3, 1.5], [2, 0.5], [1, 2], [2, 4],
    [8, 1], [7, 1], [6, 2], [5, 2], [6, 1], [2, 1], [3, 1], [2, 1], [1, 2], ['7#', 2], [1, 2]],
  ostinato: 'x.x.xx.xx.x.xx.x', taiko: 'x.....x...x.....', snare: '............x...',
};
const LEG5 = {
  // into the sun: A minor pentatonic, a koto-like plucked lead over pounding taiko, 120 bpm
  ...VOICES, bpm: 120, gain: 0.2, tonic: 69, lead: 'pluck', taikoGain: 1.1, arp: [0, 7, 12, 10],
  chords: [[45, 'm'], [41, 'M'], [43, 'M'], [40, 'm'], [45, 'm'], [50, 'm'], [41, 'M'], [52, 'M']],
  melody: [[1, 0.5], [3, 0.5], [4, 1], [5, 2], [7, 1], [5, 1], [4, 1], [3, 1], [4, 1], [5, 1], [8, 2], [7, 1], [5, 1], [4, 2],
    [5, 0.5], [7, 0.5], [8, 1], [10, 2], [8, 1], [7, 1], [5, 2], [4, 1], [3, 1], [1, 1], [3, 1], [1, 4]],
  ostinato: 'x.xxx.xxx.xxx.xx', taiko: 'x..x..x.x.x.x...', snare: '....x.......x..x',
};
const LEG6 = {
  // the primal world: D dorian, a wooden marimba ostinato, tribal drums and a horn call, 100 bpm
  ...VOICES, bpm: 100, gain: 0.2, tonic: 62, scale: DORIAN, lead: 'horn', ost: 'mallet', taikoGain: 1, arp: [0, 7, 9, 12],
  chords: [[50, 'm'], [55, 'M'], [50, 'm'], [48, 'M'], [50, 'm'], [55, 'M'], [57, 'm'], [48, 'M']],
  melody: [[1, 1], [1, 0.5], [3, 0.5], [4, 1], [5, 1], [6, 2], [5, 2], [4, 1], [3, 1], [4, 1], [5, 1], [1, 4],
    [5, 1], [5, 0.5], [6, 0.5], [8, 1], [7, 1], [6, 2], [5, 2], [4, 1], [6, 1], [5, 1], [3, 1], [1, 4]],
  ostinato: 'xxx.xx.xxxx.xx.x', taiko: 'x..x.x..x..x.x.x', snare: '....x.......x...',
};

export const THEMES = {
  leg1: LEG1,
  // leg one's boss keeps its own C minor theme
  leg1boss: bossOf(LEG1, {
    bpm: 132, gain: 0.21, tonic: 60, taikoGain: 0.9,
    chords: [[48, 'm'], [44, 'M'], [51, 'M'], [46, 'M'], [48, 'm'], [44, 'M'], [53, 'm'], [55, 'M']],
    melody: [[1, 1], [1, 0.5], [1, 0.5], [3, 1], [1, 1], [6, 2], [5, 1], [4, 1], [3, 1], [4, 1], [5, 1], [7, 1], [8, 2], ['7#', 2],
      [8, 1], [8, 0.5], [8, 0.5], [7, 1], [6, 1], [5, 2], [4, 1], [3, 1], [4, 1], [3, 1], [2, 1], ['7#', 1], [1, 4]],
  }),
  leg2: LEG2, leg2boss: bossOf(LEG2, { lead: 'brass' }),
  leg3: LEG3, leg3boss: bossOf(LEG3, { bpm: 120 }),
  leg4: LEG4, leg4boss: bossOf(LEG4),
  leg5: LEG5, leg5boss: bossOf(LEG5, { brassOct: 0 }),
  leg6: LEG6, leg6boss: bossOf(LEG6, { ost: 'strings' }),
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
      if (T.pad === 'choir') {
        // a wordless choir: soft triangles with a slow swell through a vowel-like band, "aah"
        voice({ wave: 'triangle', freqs: triad.flatMap(iv => det(MIDI(root + 12 + iv), 3, 14)), len: beat * 4, gain: 0.07, attack: 0.9, release: 0.8, cut: [700, 1100], q: 2.2, wet: 0.75 });
      } else voice({ freqs: triad.flatMap(iv => det(MIDI(root + 12 + iv), 2, 12)), len: beat * 4, gain: 0.05, attack: 0.5, release: 0.6, cut: [500, 1400], wet: 0.6 });
      voice({ freqs: det(MIDI(root - 12), 3, 7), len: beat * 4 * 0.95, gain: 0.11, attack: 0.08, release: 0.3, cut: [300, 900], wet: 0.25 });
      voice({ wave: 'sine', freqs: [MIDI(root - 24)], len: beat * 4 * 0.95, gain: 0.22, attack: 0.02, release: 0.2, cut: [400, 400], wet: 0 });
    }
    // the ostinato: the theme's arpeggio over the bar's root, in short bowed strokes or struck wooden mallets
    if (T.ostinato[s] === 'x') {
      const f = MIDI(root + T.arp[s % T.arp.length]);
      if (T.ost === 'mallet') voice({ wave: 'sine', freqs: [f * 2, f * 8], len: 0.02, gain: 0.09, attack: 0.003, release: 0.32, cut: [3000, 1200], wet: 0.35 });
      else voice({ freqs: det(f, 2, 10), len: dt * 0.85, gain: 0.07, attack: 0.008, release: 0.05, cut: [2600, 1400], q: 1.2, wet: 0.25 });
    }
    // the lead melody: heroic brass, a rounder horn, or a plucked koto-like string
    const n = this.notes.get(step % this.notes.len);
    if (n && n.deg !== null) {
      const f = MIDI(T.tonic + T.scale[n.deg] + T.brassOct), len = n.len * dt * 0.96;
      if (T.lead === 'pluck') {
        voice({ wave: 'triangle', freqs: [f, f * 1.003], len: 0.03, gain: 0.16, attack: 0.002, release: Math.max(0.35, len), cut: [4200, 900], q: 2, wet: 0.4 });
        voice({ wave: 'sawtooth', freqs: [f], len: 0.015, gain: 0.05, attack: 0.001, release: 0.12, cut: [6000, 1500], wet: 0.3 });
      } else if (T.lead === 'horn') {
        voice({ freqs: det(f, 3, 6), len, gain: 0.11, attack: 0.08, release: 0.25, cut: [500, 1500], q: 0.9, wet: 0.45 });
        voice({ wave: 'triangle', freqs: [f / 2], len, gain: 0.07, attack: 0.1, release: 0.25, cut: [800, 800], wet: 0.35 });
      } else {
        voice({ freqs: det(f, 3, 8), len, gain: 0.12, attack: 0.045, release: 0.18, cut: [700, 2600], q: 1.4, wet: 0.35 });
        voice({ freqs: det(f / 2, 2, 6), len, gain: 0.06, attack: 0.06, release: 0.18, cut: [500, 1500], wet: 0.3 });
      }
    }
    // taiko: a deep pitched drop plus a skin slap; the marching snare
    if (T.taiko[s] === 'x') {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.35);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(T.taikoGain, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
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
