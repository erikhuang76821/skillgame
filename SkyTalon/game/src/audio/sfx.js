// SkyTalon's synthesised sound effects (knowledge-base/14): oscillators + noise + envelopes, 0 bytes of audio.
// Render layer only — play() is called from sim events, never the other way round.
// A recipe is a list of layers; every number lives in RECIPES so sounds are tuned like FEEL.
//   osc:   { type: 'osc', wave, f0, f1 (end freq), dur, attack, gain, delay?, filter? }
//   noise: { type: 'noise', dur, attack, gain, delay?, filter: { type, f0, f1?, q? } }
export const RECIPES = {
  // Played with every kill: the impact itself at 0 ms (a click and a short sub drop), under the recorded explosion.
  punch: [
    { type: 'noise', dur: 0.012, attack: 0.0003, gain: 0.3, filter: { type: 'highpass', f0: 1800 } },
    { type: 'osc', wave: 'sine', f0: 160, f1: 48, dur: 0.09, attack: 0.0005, gain: 0.55 },
  ],
  // Style reference (2026-11-23, spectrum only, nothing sampled): a bright twin-stick shooter's gun. Each shot is a tiny
  // ~5 kHz click and a thin, almost flat sine tail of ~70 ms, its pitch varied shot to shot (the caller spreads it).
  // Very quiet and no low end, so it never masks the rest.
  shot: [
    { type: 'noise', dur: 0.014, attack: 0.003, gain: 0.05, filter: { type: 'bandpass', f0: 5200, q: 6 } },
    { type: 'osc', wave: 'sine', f0: 5200, f1: 5050, dur: 0.1, attack: 0.002, gain: 0.032 },
  ],
  // A shot lands but the enemy is still up: a bright tick, a short body and thud under it, a small metal ping on top
  // (played panned to where it landed, with a touch of room; see play's pan and room).
  hit: [
    { type: 'noise', dur: 0.025, attack: 0.0005, gain: 0.12, filter: { type: 'highpass', f0: 2500 } },
    { type: 'noise', dur: 0.06, attack: 0.001, gain: 0.12, filter: { type: 'bandpass', f0: 1200, f1: 500, q: 1 } },
    { type: 'osc', wave: 'sine', f0: 220, f1: 110, dur: 0.05, attack: 0.001, gain: 0.12 },
    { type: 'osc', wave: 'triangle', f0: 3200, f1: 2800, dur: 0.04, attack: 0.001, gain: 0.035 },
  ],
  // An enemy goes down: the clearest sound in the mix (pitch rises with the chain, see comboPitch). Same reference: a
  // full-band crack whose top end dies in ~80 ms, a darker body under it, a short thump, and a scatter of bright
  // sparkles (6 to 9 kHz) in the first 60 ms.
  kill: [
    { type: 'noise', dur: 0.09, attack: 0.0005, gain: 0.34, filter: { type: 'highpass', f0: 3000, f1: 1400 } },
    { type: 'noise', dur: 0.18, attack: 0.001, gain: 0.24, filter: { type: 'bandpass', f0: 900, f1: 250, q: 0.9 } },
    { type: 'osc', wave: 'sine', f0: 120, f1: 45, dur: 0.14, attack: 0.001, gain: 0.32 },
    { type: 'osc', wave: 'sine', f0: 6200, f1: 6000, dur: 0.03, attack: 0.001, gain: 0.05, delay: 0.01 },
    { type: 'osc', wave: 'sine', f0: 8600, f1: 8300, dur: 0.025, attack: 0.001, gain: 0.04, delay: 0.03 },
    { type: 'osc', wave: 'sine', f0: 7400, f1: 7200, dur: 0.03, attack: 0.001, gain: 0.045, delay: 0.05 },
  ],
  // A bullet passes close: a short high tick for a graze that counted.
  graze: [
    { type: 'osc', wave: 'sine', f0: 2400, f1: 3200, dur: 0.045, attack: 0.001, gain: 0.11 },
  ],
  // The ship is hit: low and short, it must not punish the ear.
  hurt: [
    { type: 'osc', wave: 'sawtooth', f0: 200, f1: 70, dur: 0.26, attack: 0.003, gain: 0.3, filter: { type: 'lowpass', f0: 1000 } },
    { type: 'noise', dur: 0.16, attack: 0.002, gain: 0.22, filter: { type: 'lowpass', f0: 1400, f1: 300 } },
  ],
  // A diver locks on.
  dive: [
    { type: 'osc', wave: 'square', f0: 900, f1: 1500, dur: 0.12, attack: 0.004, gain: 0.08, filter: { type: 'lowpass', f0: 3000 } },
  ],
  // The boss arrives: two low warning tones.
  warn: [
    { type: 'osc', wave: 'sawtooth', f0: 196, f1: 196, dur: 0.22, attack: 0.01, gain: 0.2, filter: { type: 'lowpass', f0: 1200 } },
    { type: 'osc', wave: 'sawtooth', f0: 147, f1: 147, dur: 0.32, attack: 0.01, gain: 0.2, delay: 0.26, filter: { type: 'lowpass', f0: 1200 } },
  ],
  // The boss fires a ring.
  ring: [
    { type: 'noise', dur: 0.1, attack: 0.004, gain: 0.12, filter: { type: 'bandpass', f0: 700, f1: 1800, q: 1.2 } },
  ],
  // Buttons, same reference: a sharp click, then a glassy chime of inharmonic partials (5.6 / 7.0 / 7.4 / 8.6 kHz) ~60 ms.
  click: [
    { type: 'noise', dur: 0.006, attack: 0.0005, gain: 0.12, filter: { type: 'highpass', f0: 4000 } },
    { type: 'osc', wave: 'sine', f0: 5600, f1: 5600, dur: 0.06, attack: 0.001, gain: 0.06 },
    { type: 'osc', wave: 'sine', f0: 7000, f1: 7000, dur: 0.05, attack: 0.001, gain: 0.045 },
    { type: 'osc', wave: 'sine', f0: 7400, f1: 7400, dur: 0.045, attack: 0.001, gain: 0.035 },
    { type: 'osc', wave: 'sine', f0: 8600, f1: 8600, dur: 0.04, attack: 0.001, gain: 0.03 },
  ],
  // Confirming a choice: the chime a step higher, each partial gliding down 3% as it lands.
  confirm: [
    { type: 'noise', dur: 0.006, attack: 0.0005, gain: 0.1, filter: { type: 'highpass', f0: 4000 } },
    { type: 'osc', wave: 'sine', f0: 6600, f1: 6400, dur: 0.08, attack: 0.001, gain: 0.06 },
    { type: 'osc', wave: 'sine', f0: 7830, f1: 7600, dur: 0.07, attack: 0.001, gain: 0.045 },
    { type: 'osc', wave: 'sine', f0: 8240, f1: 8000, dur: 0.065, attack: 0.001, gain: 0.035 },
    { type: 'osc', wave: 'sine', f0: 9480, f1: 9200, dur: 0.06, attack: 0.001, gain: 0.03 },
  ],
  // Bombs, slams, a stage breaking. Same reference: a deep drop, a darkening rumble, and a long bright hiss of sparkles
  // (4 to 12 kHz) that thins out over ~0.7 s.
  boom: [
    { type: 'osc', wave: 'sine', f0: 95, f1: 34, dur: 0.6, attack: 0.002, gain: 0.5 },
    { type: 'noise', dur: 0.5, attack: 0.002, gain: 0.3, filter: { type: 'lowpass', f0: 2400, f1: 250 } },
    { type: 'noise', dur: 0.75, attack: 0.01, gain: 0.12, filter: { type: 'highpass', f0: 6000, f1: 3500 } },
  ],
  // End of a match that was survived.
  clear: [
    { type: 'osc', wave: 'triangle', f0: 660, f1: 660, dur: 0.12, attack: 0.004, gain: 0.18 },
    { type: 'osc', wave: 'triangle', f0: 880, f1: 880, dur: 0.12, attack: 0.004, gain: 0.18, delay: 0.11 },
    { type: 'osc', wave: 'triangle', f0: 1320, f1: 1320, dur: 0.26, attack: 0.004, gain: 0.18, delay: 0.22 },
  ],
};

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
export function scheduleRecipe(ctx, dest, recipe, when, { pitch = 1, gain = 1 } = {}) {
  let end = when;
  for (const L of recipe) {
    const t = when + (L.delay ?? 0), stop = t + L.dur;
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

// at most this many of one sound at a time (the ones that come in bursts), and the sounds that are never dropped
const VOICE_CAP = { shot: 3, hit: 4, graze: 3, ring: 4, dive: 4 };
const PRIORITY = new Set(['kill', 'punch', 'boom', 'bossdown', 'hurt', 'clear', 'pickup', 'powerup']);

export class Sfx {
  /** @param o { volume 0..1, maxVoices, variation: ± random pitch spread (render-only randomness is fine) } */
  constructor({ volume = 0.6, maxVoices = 24, variation = 0.04 } = {}) {
    this.volume = volume; this.maxVoices = maxVoices; this.variation = variation;
    this.ctx = null; this.master = null; this.voices = 0; this.byName = {};
    try { this.muted = localStorage.getItem('sfx-muted') === '1'; } catch { this.muted = false; }
  }

  /** Call from the first user gesture (pointerdown / keydown): browsers start audio only after one. */
  unlock() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 0 });                 // the smallest buffer the device allows: a kill is heard on the tick its shot lands
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      // Gentle limiter so stacked hits never clip.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.ratio.value = 8;
      this.master.connect(comp).connect(this.ctx.destination);
      // a small room (generated 0.7 s impulse) that effects can send to, so hits and kills sit in a space, not flat
      const len = Math.floor(this.ctx.sampleRate * 0.7), ir = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let r = 0x9e3779b9 ^ (c * 7919); for (let i = 0; i < len; i++) { r ^= r << 13; r ^= r >>> 17; r ^= r << 5; d[i] = ((r >>> 0) / 2147483648 - 1) * (1 - i / len) ** 3; } }
      const conv = this.ctx.createConvolver(); conv.buffer = ir;
      this.room = this.ctx.createGain(); this.room.connect(conv).connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.clipSource) this.loadClips(this.clipSource);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
    try { localStorage.setItem('sfx-muted', m ? '1' : '0'); } catch { /* storage may be blocked */ }
  }

  /** Where one sound goes: panned (if the browser can), with an optional send to the room. */
  route(pan, room) {
    if (!pan && !room) return this.master;
    const node = this.ctx.createGain();
    let tail = node;
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p); tail = p; }
    tail.connect(this.master);
    if (room && this.room) { const sg = this.ctx.createGain(); sg.gain.value = room; tail.connect(sg).connect(this.room); }
    return node;
  }

  /** The shared white-noise buffer (the music's drums use it too). */
  noise() { return this.ctx ? noiseBuffer(this.ctx) : null; }

  /**
   * Recorded clips that take over from a recipe of the same name once decoded (the recipe plays until then, and
   * whenever a clip fails to decode). `clips` = { name: { url, gain } }. Bundled files only: in the single-file
   * build the urls are data: URIs, so nothing is fetched from the network.
   */
  loadClips(clips) {
    this.clips ??= {};
    if (!this.ctx || this.clipsLoading) return;
    this.clipsLoading = true;
    for (const [name, c] of Object.entries(clips)) {
      fetch(c.url).then(r => r.arrayBuffer()).then(b => this.ctx.decodeAudioData(b)).then(buf => { this.clips[name] = { buf, gain: c.gain ?? 1 }; }).catch(() => {});
    }
  }

  /** Output latency in ms (feeds the calibration test of knowledge-base/13). */
  get latencyMs() { return this.ctx ? ((this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0)) * 1000 : 0; }

  /**
   * Continuous wind, 0 bytes: looped noise through a band-pass whose pitch and level follow `level` (0 = silent .. 1).
   * Call every frame; it only ramps two parameters. Starts itself once audio is unlocked.
   */
  wind(level, { gain = 0.05, f0 = 380, f1 = 1700 } = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (!this.windNode) {
      const src = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), out = this.ctx.createGain();
      src.buffer = noiseBuffer(this.ctx); src.loop = true;
      filter.type = 'bandpass'; filter.Q.value = 0.8;
      out.gain.value = 0;
      src.connect(filter).connect(out).connect(this.master);
      src.start();
      this.windNode = { filter, out };
    }
    const t = this.ctx.currentTime, k = Math.max(0, Math.min(1, level));
    this.windNode.out.gain.setTargetAtTime(gain * k, t, 0.15);
    this.windNode.filter.frequency.setTargetAtTime(f0 + (f1 - f0) * k, t, 0.15);
  }

  /** pan: -1 (left) .. 1 (right), where on the field it happened; room: how much goes to the small room (0..1). */
  play(name, { pitch = 1, gain = 1, pan = 0, room = 0 } = {}) {
    const clip = this.clips?.[name], recipe = RECIPES[name];
    if ((!recipe && !clip) || !this.ctx || this.muted || this.ctx.state !== 'running') return;
    // the frequent sounds have caps of their own, so a burst of hits can never take the voice a kill needs; the sounds
    // that matter most (PRIORITY) always play
    const own = this.byName[name] ?? 0;
    if (own >= (VOICE_CAP[name] ?? Infinity) || (!PRIORITY.has(name) && this.voices >= this.maxVoices)) return;
    this.byName[name] = own + 1;
    const done = () => { this.voices--; this.byName[name]--; };
    const p = pitch * (1 + (Math.random() * 2 - 1) * this.variation);
    const out = this.route(pan, room);
    if (clip) {
      const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
      src.buffer = clip.buf; src.playbackRate.value = p; g.gain.value = clip.gain * gain;
      src.connect(g).connect(out); src.start();
      this.voices++;
      src.onended = done;
      return;
    }
    const end = scheduleRecipe(this.ctx, out, recipe, this.ctx.currentTime, { pitch: p, gain });
    this.voices++;
    setTimeout(done, (end - this.ctx.currentTime) * 1000 + 30);
  }
}
