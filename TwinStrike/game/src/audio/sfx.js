// Synthesised sound effects (knowledge-base/14): oscillators + noise + envelopes, 0 bytes of audio.
// Render layer only — play() is called from sim events, never the other way round.
// A recipe is a list of layers; every number lives in RECIPES so sounds are tuned like FEEL.
//   osc:   { type: 'osc', wave, f0, f1 (end freq), dur, attack, gain, delay?, filter? }
//   noise: { type: 'noise', dur, attack, gain, delay?, filter: { type, f0, f1?, q? } }
export const RECIPES = {
  // --- Hit feedback designed by Gemini via agy (2026-10-21). `fixed: true` layers ignore the play-time pitch,
  // so the body thump keeps its weight while only the tonal layer climbs the combo's pentatonic scale. ---
  // sub-thump + square transient click + paw snap noise + pentatonic bell (pitched)
  perfect: [
    { type: 'osc', wave: 'sine', f0: 210, f1: 48, dur: 0.11, attack: 0.001, gain: 0.34, fixed: true },
    { type: 'osc', wave: 'square', f0: 720, f1: 140, dur: 0.028, attack: 0.001, gain: 0.2, fixed: true, filter: { type: 'lowpass', f0: 2200, f1: 400 } },
    { type: 'noise', dur: 0.045, attack: 0.001, gain: 0.18, fixed: true, filter: { type: 'bandpass', f0: 1800, f1: 950, q: 1.4 } },
    { type: 'osc', wave: 'triangle', f0: 523.25, f1: 526, dur: 0.18, attack: 0.003, gain: 0.16, delay: 0.006, filter: { type: 'lowpass', f0: 2600, f1: 1200 } },
  ],
  // ~70% of perfect, softer tonal note (pitched)
  great: [
    { type: 'osc', wave: 'sine', f0: 185, f1: 55, dur: 0.085, attack: 0.001, gain: 0.26, fixed: true },
    { type: 'osc', wave: 'triangle', f0: 580, f1: 150, dur: 0.025, attack: 0.001, gain: 0.16, fixed: true, filter: { type: 'lowpass', f0: 1800, f1: 450 } },
    { type: 'noise', dur: 0.038, attack: 0.001, gain: 0.15, fixed: true, filter: { type: 'bandpass', f0: 1450, f1: 800, q: 1.6 } },
    { type: 'osc', wave: 'sine', f0: 523.25, f1: 523.25, dur: 0.12, attack: 0.003, gain: 0.12, delay: 0.005 },
  ],
  // soft padded "pof"
  good: [
    { type: 'osc', wave: 'triangle', f0: 150, f1: 62, dur: 0.075, attack: 0.002, gain: 0.24, filter: { type: 'lowpass', f0: 550, f1: 180 } },
    { type: 'noise', dur: 0.045, attack: 0.002, gain: 0.18, filter: { type: 'bandpass', f0: 750, f1: 380, q: 1.5 } },
    { type: 'osc', wave: 'sine', f0: 320, f1: 190, dur: 0.03, attack: 0.001, gain: 0.08 },
  ],
  // air swing "fwip"
  whiff: [
    { type: 'noise', dur: 0.095, attack: 0.004, gain: 0.26, filter: { type: 'bandpass', f0: 1600, f1: 380, q: 2.2 } },
    { type: 'osc', wave: 'sine', f0: 540, f1: 190, dur: 0.08, attack: 0.004, gain: 0.1 },
  ],
  // cartoon bonk + downward boing (the cat gets hit)
  hurt: [
    { type: 'osc', wave: 'triangle', f0: 260, f1: 75, dur: 0.11, attack: 0.001, gain: 0.3 },
    { type: 'noise', dur: 0.04, attack: 0.001, gain: 0.16, filter: { type: 'lowpass', f0: 700, f1: 220 } },
    { type: 'osc', wave: 'sawtooth', f0: 195, f1: 115, dur: 0.19, attack: 0.004, gain: 0.22, delay: 0.015, filter: { type: 'bandpass', f0: 520, f1: 240, q: 3.2 } },
  ],
  // punch on the tanuki pot-lid shield: hollow wooden tok
  block: [
    { type: 'osc', wave: 'triangle', f0: 440, f1: 310, dur: 0.075, attack: 0.001, gain: 0.32, filter: { type: 'bandpass', f0: 520, q: 3.5 } },
    { type: 'osc', wave: 'sine', f0: 1120, f1: 690, dur: 0.042, attack: 0.001, gain: 0.2 },
    { type: 'noise', dur: 0.022, attack: 0.001, gain: 0.18, filter: { type: 'bandpass', f0: 2200, f1: 1100, q: 2.5 } },
  ],
  // tanuki knocked out: heavy thump + wood crack + three pot-lid clatters
  shieldBreak: [
    { type: 'osc', wave: 'sine', f0: 230, f1: 42, dur: 0.16, attack: 0.001, gain: 0.32 },
    { type: 'noise', dur: 0.065, attack: 0.001, gain: 0.18, filter: { type: 'bandpass', f0: 1900, f1: 650, q: 1.3 } },
    { type: 'osc', wave: 'triangle', f0: 680, f1: 360, dur: 0.07, attack: 0.001, gain: 0.14, delay: 0.012, filter: { type: 'bandpass', f0: 900, q: 3 } },
    { type: 'osc', wave: 'triangle', f0: 860, f1: 490, dur: 0.075, attack: 0.001, gain: 0.12, delay: 0.055, filter: { type: 'bandpass', f0: 1150, q: 3 } },
    { type: 'osc', wave: 'sine', f0: 590, f1: 340, dur: 0.09, attack: 0.001, gain: 0.11, delay: 0.115 },
  ],
  // +1 HP: warm pentatonic arpeggio + breathy sparkle
  heal: [
    { type: 'osc', wave: 'sine', f0: 587.33, f1: 592, dur: 0.18, attack: 0.004, gain: 0.2 },
    { type: 'osc', wave: 'sine', f0: 880, f1: 888, dur: 0.2, attack: 0.004, gain: 0.2, delay: 0.055 },
    { type: 'osc', wave: 'triangle', f0: 1174.66, f1: 1188, dur: 0.24, attack: 0.004, gain: 0.18, delay: 0.115, filter: { type: 'lowpass', f0: 3200, f1: 1600 } },
    { type: 'noise', dur: 0.14, attack: 0.005, gain: 0.1, delay: 0.055, filter: { type: 'highpass', f0: 3200 } },
  ],
  // --- Strike bodies + combo escalation layers, designed by Gemini via agy (2026-10-21, second pass) ---
  // jab: fixed sub thump + pitched mid punch + crisp high snap
  jab: [
    { type: 'osc', wave: 'sine', f0: 130, f1: 42, dur: 0.075, attack: 0.002, gain: 0.32, fixed: true },
    { type: 'osc', wave: 'triangle', f0: 340, f1: 95, dur: 0.065, attack: 0.002, gain: 0.3 },
    { type: 'noise', dur: 0.035, attack: 0.001, gain: 0.23, filter: { type: 'bandpass', f0: 2600, f1: 1400, q: 2.2 } },
  ],
  // kick: short leg whoosh into a deep fixed sub thud and a meaty mid knock
  kick: [
    { type: 'noise', dur: 0.045, attack: 0.004, gain: 0.18, filter: { type: 'bandpass', f0: 420, f1: 1300, q: 2.5 } },
    { type: 'osc', wave: 'sine', f0: 115, f1: 34, dur: 0.13, attack: 0.003, delay: 0.018, gain: 0.38, fixed: true },
    { type: 'osc', wave: 'sawtooth', f0: 240, f1: 65, dur: 0.095, attack: 0.002, delay: 0.018, gain: 0.32, filter: { type: 'lowpass', f0: 950, f1: 180, q: 1.4 } },
  ],
  // palm: fixed low body + resonant hollow smack + airy high slap
  palm: [
    { type: 'osc', wave: 'sine', f0: 145, f1: 48, dur: 0.085, attack: 0.002, gain: 0.28, fixed: true },
    { type: 'osc', wave: 'square', f0: 480, f1: 140, dur: 0.055, attack: 0.001, gain: 0.24, filter: { type: 'bandpass', f0: 900, f1: 380, q: 2.8 } },
    { type: 'noise', dur: 0.075, attack: 0.001, gain: 0.34, filter: { type: 'highpass', f0: 1800, f1: 900, q: 1.2 } },
  ],
  // tier 1+: whip crack on top
  crack: [
    { type: 'noise', dur: 0.028, attack: 0.001, gain: 0.38, filter: { type: 'bandpass', f0: 4200, f1: 2200, q: 3 } },
    { type: 'osc', wave: 'sawtooth', f0: 1400, f1: 280, dur: 0.022, attack: 0.001, gain: 0.24, filter: { type: 'highpass', f0: 1200, q: 1.5 } },
  ],
  // tier 2+: sub drop + chest punch (on the beat only)
  boom: [
    { type: 'osc', wave: 'sine', f0: 95, f1: 28, dur: 0.22, attack: 0.003, gain: 0.48, fixed: true },
    { type: 'osc', wave: 'triangle', f0: 190, f1: 52, dur: 0.11, attack: 0.002, gain: 0.28, fixed: true, filter: { type: 'lowpass', f0: 360, f1: 90, q: 1.2 } },
  ],
  // tier 3+: rising air rush
  swish: [
    { type: 'noise', dur: 0.065, attack: 0.004, gain: 0.38, filter: { type: 'bandpass', f0: 550, f1: 2800, q: 3.2 } },
    { type: 'osc', wave: 'sine', f0: 260, f1: 920, dur: 0.055, attack: 0.01, delay: 0.008, gain: 0.2 },
  ],
  // tier 3+: double-hit afterimage ~68 ms later (skipped when the next enemy is close)
  echo: [
    { type: 'osc', wave: 'triangle', f0: 380, f1: 110, dur: 0.065, attack: 0.002, delay: 0.068, gain: 0.24 },
    { type: 'noise', dur: 0.045, attack: 0.001, delay: 0.068, gain: 0.2, filter: { type: 'bandpass', f0: 3100, f1: 1500, q: 2.4 } },
    { type: 'osc', wave: 'sine', f0: 125, f1: 44, dur: 0.075, attack: 0.002, delay: 0.068, gain: 0.12, fixed: true },
  ],
  // tier 4: heroic glassy fifth sparkle (bar downbeats / phrase ends only)
  shimmer: [
    { type: 'osc', wave: 'sine', f0: 1760, f1: 1720, dur: 0.26, attack: 0.003, delay: 0.01, gain: 0.2 },
    { type: 'osc', wave: 'triangle', f0: 2637, f1: 2680, dur: 0.22, attack: 0.003, delay: 0.022, gain: 0.18, filter: { type: 'highpass', f0: 2000, q: 1.5 } },
    { type: 'noise', dur: 0.18, attack: 0.002, delay: 0.005, gain: 0.16, filter: { type: 'bandpass', f0: 5800, f1: 3800, q: 4.5 } },
  ],
  // hit on the first beat of a bar: taiko barrel + rim clap
  accent: [
    { type: 'osc', wave: 'sine', f0: 135, f1: 54, dur: 0.19, attack: 0.002, gain: 0.4, fixed: true },
    { type: 'osc', wave: 'triangle', f0: 270, f1: 108, dur: 0.11, attack: 0.002, gain: 0.2, fixed: true, filter: { type: 'bandpass', f0: 220, f1: 120, q: 1.8 } },
    { type: 'noise', dur: 0.042, attack: 0.001, gain: 0.2, filter: { type: 'bandpass', f0: 2100, f1: 1200, q: 2.6 } },
  ],
  // enemy reactions (cooldown + probability gated in audio/hitFx.js)
  mouseSqueak: [
    { type: 'osc', wave: 'sine', f0: 1350, f1: 2700, dur: 0.048, attack: 0.003, gain: 0.32 },
    { type: 'osc', wave: 'triangle', f0: 2650, f1: 1550, dur: 0.055, attack: 0.002, delay: 0.038, gain: 0.2, filter: { type: 'lowpass', f0: 3600, q: 1.5 } },
  ],
  squirrelChitter: [
    { type: 'osc', wave: 'triangle', f0: 1600, f1: 2450, dur: 0.036, attack: 0.002, gain: 0.26, filter: { type: 'bandpass', f0: 2100, q: 2.5 } },
    { type: 'osc', wave: 'triangle', f0: 1850, f1: 2850, dur: 0.04, attack: 0.002, delay: 0.048, gain: 0.28, filter: { type: 'bandpass', f0: 2400, q: 2.5 } },
    { type: 'noise', dur: 0.025, attack: 0.001, delay: 0.048, gain: 0.08, filter: { type: 'highpass', f0: 3000, q: 1.2 } },
  ],
  // keysounds (audio/keysound.js): left side = low pluck (C3 at pitch 1), right side = high bell-pluck (C4 at pitch 1)
  keyLo: [
    { type: 'osc', wave: 'triangle', f0: 130.81, f1: 130.81, dur: 0.26, attack: 0.002, gain: 0.26, filter: { type: 'lowpass', f0: 1500, f1: 600 } },
    { type: 'osc', wave: 'square', f0: 130.81, f1: 130.81, dur: 0.06, attack: 0.001, gain: 0.05, filter: { type: 'lowpass', f0: 900 } },
  ],
  keyHi: [
    { type: 'osc', wave: 'triangle', f0: 261.63, f1: 261.63, dur: 0.22, attack: 0.002, gain: 0.2 },
    { type: 'osc', wave: 'sine', f0: 523.25, f1: 523.25, dur: 0.12, attack: 0.002, gain: 0.06 },
    { type: 'noise', dur: 0.012, attack: 0.001, gain: 0.04, fixed: true, filter: { type: 'highpass', f0: 6000 } },
  ],
  // pentatonic bell carried by PERFECT hits (the combo melody; superseded by keysounds, kept for tuning)
  bell: [
    { type: 'osc', wave: 'triangle', f0: 523.25, f1: 526, dur: 0.18, attack: 0.003, gain: 0.13, filter: { type: 'lowpass', f0: 2600, f1: 1200 } },
  ],
  // --- template recipes (kept for UI / BGM) ---
  miss: [
    { type: 'osc', wave: 'sawtooth', f0: 220, f1: 110, dur: 0.18, attack: 0.004, gain: 0.12, filter: { type: 'lowpass', f0: 900 } },
  ],
  pickup: [
    { type: 'osc', wave: 'square', f0: 660, f1: 990, dur: 0.06, attack: 0.002, gain: 0.1 },
    { type: 'osc', wave: 'square', f0: 990, f1: 1320, dur: 0.07, attack: 0.002, gain: 0.1, delay: 0.055 },
  ],
  click: [
    { type: 'osc', wave: 'sine', f0: 1200, f1: 900, dur: 0.03, attack: 0.001, gain: 0.12 },
  ],
  boom: [
    { type: 'osc', wave: 'sine', f0: 110, f1: 38, dur: 0.38, attack: 0.003, gain: 0.5 },
    { type: 'noise', dur: 0.26, attack: 0.002, gain: 0.28, filter: { type: 'lowpass', f0: 900, f1: 200 } },
  ],
  // --- TwinStrike combo feel (gdd/06): BGM instruments and stingers. Pitch-1 frequencies are the key of C. ---
  taiko: [
    { type: 'osc', wave: 'sine', f0: 150, f1: 48, dur: 0.24, attack: 0.002, gain: 0.55 },
    { type: 'noise', dur: 0.05, attack: 0.001, gain: 0.12, filter: { type: 'lowpass', f0: 1200 } },
  ],
  shaker: [{ type: 'noise', dur: 0.045, attack: 0.004, gain: 0.12, filter: { type: 'highpass', f0: 6500 } }],
  clap: [
    { type: 'noise', dur: 0.09, attack: 0.002, gain: 0.22, filter: { type: 'bandpass', f0: 1400, q: 1.4 } },
    { type: 'noise', dur: 0.05, attack: 0.001, gain: 0.12, delay: 0.012, filter: { type: 'bandpass', f0: 2200, q: 2 } },
  ],
  bass: [{ type: 'osc', wave: 'triangle', f0: 130.8, f1: 128, dur: 0.22, attack: 0.004, gain: 0.32, filter: { type: 'lowpass', f0: 900 } }],
  arp: [{ type: 'osc', wave: 'square', f0: 523.3, f1: 523.3, dur: 0.09, attack: 0.003, gain: 0.05, filter: { type: 'lowpass', f0: 2600 } }],
  sparkle: [
    { type: 'osc', wave: 'sine', f0: 2093, f1: 2093, dur: 0.18, attack: 0.002, gain: 0.06 },
    { type: 'osc', wave: 'sine', f0: 3136, f1: 3136, dur: 0.14, attack: 0.002, gain: 0.04, delay: 0.05 },
  ],
  stinger: [                                                    // milestone: root, fifth, octave + boom
    { type: 'osc', wave: 'triangle', f0: 523.3, f1: 523.3, dur: 0.12, attack: 0.003, gain: 0.22 },
    { type: 'osc', wave: 'triangle', f0: 784, f1: 784, dur: 0.12, attack: 0.003, gain: 0.22, delay: 0.07 },
    { type: 'osc', wave: 'triangle', f0: 1046.5, f1: 1046.5, dur: 0.28, attack: 0.003, gain: 0.24, delay: 0.14 },
    { type: 'osc', wave: 'sine', f0: 110, f1: 40, dur: 0.35, attack: 0.003, gain: 0.35, delay: 0.14 },
  ],
  sweepDown: [{ type: 'osc', wave: 'sawtooth', f0: 520, f1: 90, dur: 0.42, attack: 0.01, gain: 0.1, filter: { type: 'lowpass', f0: 1600, f1: 300 } }],
};

/** Pentatonic note for the n-th hit of a combo (do re mi sol la, then an octave up; repeats every 10),
 *  transposed by the combo tier (gdd/06 §3). Returns a pitch multiplier for the tonal layer of perfect / great. */
const PENTA = [0, 2, 4, 7, 9];
export function comboNote(combo, transpose = 0) {
  const i = (Math.max(combo, 1) - 1) % 10;
  return 2 ** ((PENTA[i % 5] + (i >= 5 ? 12 : 0) - 7 + transpose) / 12);
}

/** Pitch multiplier for a combo: one semitone per step, capped (rising pitch = rising tension). */
export const comboPitch = (combo, cap = 12) => 2 ** (Math.min(Math.max(combo - 1, 0), cap) / 12);

const noiseBuffers = new WeakMap();
function noiseBuffer(ctx) {
  let b = noiseBuffers.get(ctx);
  if (b) return b;
  b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = 0x2545f491;
  for (let i = 0; i < d.length; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; d[i] = (s >>> 0) / 2147483648 - 1; }
  noiseBuffers.set(ctx, b);
  return b;
}

/**
 * Schedule `recipe` on any BaseAudioContext (live or OfflineAudioContext) at time `when`.
 * @returns end time (s)
 */
export function scheduleRecipe(ctx, dest, recipe, when, { pitch: pitchIn = 1, gain = 1 } = {}) {
  let end = when;
  for (const L of recipe) {
    const t = when + (L.delay ?? 0), stop = t + L.dur;
    const pitch = L.fixed ? 1 : pitchIn;                    // `fixed` layers (body thumps) keep their frequency
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(L.gain * gain, t + (L.attack ?? 0.002));
    env.gain.exponentialRampToValueAtTime(0.0001, stop);
    let src;
    if (L.type === 'osc') {
      src = ctx.createOscillator();
      src.type = L.wave;
      src.frequency.setValueAtTime(L.f0 * pitch, t);
      if (L.f1 && L.f1 !== L.f0) src.frequency.exponentialRampToValueAtTime(L.f1 * pitch, stop);
    } else {
      src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      src.playbackRate.value = pitch;
    }
    let out = src;
    if (L.filter) {
      const f = ctx.createBiquadFilter();
      f.type = L.filter.type;
      f.frequency.setValueAtTime(L.filter.f0 * pitch, t);
      if (L.filter.f1) f.frequency.exponentialRampToValueAtTime(L.filter.f1 * pitch, stop);
      if (L.filter.q) f.Q.value = L.filter.q;
      src.connect(f);
      out = f;
    }
    out.connect(env).connect(dest);
    src.start(t);
    src.stop(stop + 0.02);
    end = Math.max(end, stop);
  }
  return end;
}

/** Render a recipe offline (tests, previews, exporting to a file if a platform needs one). */
export async function renderOffline(recipe, opts = {}, sampleRate = 22050) {
  const len = Math.ceil(sampleRate * (Math.max(...recipe.map(L => (L.delay ?? 0) + L.dur)) + 0.05));
  const ctx = new OfflineAudioContext(1, len, sampleRate);
  scheduleRecipe(ctx, ctx.destination, recipe, 0, opts);
  return (await ctx.startRendering()).getChannelData(0);
}

export class Sfx {
  /** @param o { volume 0..1, maxVoices, variation: ± random pitch spread (render-only randomness is fine) } */
  constructor({ volume = 0.6, maxVoices = 28, variation = 0.04 } = {}) {
    this.volume = volume; this.maxVoices = maxVoices; this.variation = variation;
    this.ctx = null; this.master = null; this.voices = 0;
    try { this.muted = localStorage.getItem('sfx-muted') === '1'; } catch { this.muted = false; }
  }

  /** Call from the first user gesture (pointerdown / keydown): browsers start audio only after one. */
  unlock() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      // BGM bus: its own gain and a low-pass that opens up as the combo tier rises (gdd/06 §2).
      this.bgmLowpass = this.ctx.createBiquadFilter();
      this.bgmLowpass.type = 'lowpass'; this.bgmLowpass.frequency.value = 900; this.bgmLowpass.Q.value = 0.8;
      this.bgmBus = this.ctx.createGain();
      this.bgmBus.gain.value = 0.55;
      this.bgmBus.connect(this.bgmLowpass).connect(this.master);
      // Gentle limiter so stacked hits never clip.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.ratio.value = 8;
      this.master.connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
    try { localStorage.setItem('sfx-muted', m ? '1' : '0'); } catch { /* storage may be blocked */ }
  }

  /** Output latency in ms (feeds the calibration test of knowledge-base/13). */
  get latencyMs() { return this.ctx ? ((this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0)) * 1000 : 0; }

  /** Schedule an instrument on the BGM bus at audio time `when` (no voice cap: the sequencer is sparse). */
  schedule(name, when, { pitch = 1, gain = 1 } = {}) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    scheduleRecipe(this.ctx, this.bgmBus, RECIPES[name], when, { pitch, gain });
  }

  /** Ramp the BGM low-pass; `dip` first drops it (combo break), then ramps to `hz`. */
  bgmFilter(hz, seconds = 0.3, dip = 0) {
    if (!this.ctx || !this.bgmLowpass) return;
    const f = this.bgmLowpass.frequency, t = this.ctx.currentTime;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    if (dip) { f.exponentialRampToValueAtTime(dip, t + 0.06); f.exponentialRampToValueAtTime(hz, t + 0.06 + seconds); }
    else f.exponentialRampToValueAtTime(hz, t + seconds);
  }

  /** `delay` (s) schedules ahead on the audio clock (layered hits); `exact` skips the random pitch variation. */
  play(name, { pitch = 1, gain = 1, delay = 0, exact = false } = {}) {
    const recipe = RECIPES[name];
    if (!recipe || !this.ctx || this.muted || this.ctx.state !== 'running' || this.voices >= this.maxVoices) return;
    const p = exact ? pitch : pitch * (1 + (Math.random() * 2 - 1) * this.variation);
    const end = scheduleRecipe(this.ctx, this.master, recipe, this.ctx.currentTime + delay, { pitch: p, gain });
    this.voices++;
    setTimeout(() => { this.voices--; }, (end - this.ctx.currentTime) * 1000 + 30);
  }
}
