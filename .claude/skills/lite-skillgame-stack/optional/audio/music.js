// Music loops packed by shared/tools/music-pack.mjs (knowledge-base/14 §5, RULE-MUSIC-ENCODE / RULE-MUSIC-LOOP):
// <name>.webm (stereo Opus) + <name>.loop.json { file, samples, sampleRate, ... }. Plays through the Sfx master, so
// mute and the compressor apply. Render layer only; nothing here touches the sim.
// Optional: not part of templates/ — copy to <Game>/game/src/audio/ when game.profile.json has "fileMusic": true.
//
//   import battle from './assets/music/battle.loop.json';
//   import battleUrl from './assets/music/battle.webm?url';
//   const music = new Music(sfx, { battle: { url: battleUrl, meta: battle } });
//   music.play('battle');   // after sfx.unlock(); decodes on first use (preload() earlier to avoid the wait)
//
// loopEnd comes from meta.samples, never from the decoded length: WebM Opus decodes a few samples short in Chromium
// and the file carries a padded tail for exactly that reason.

/** mix tunables, edited like FEEL */
export const MUSIC = { gain: 0.5, fadeIn: 0.4, fadeOut: 0.8 };

export class Music {
  /** @param sfx an unlocked-or-later Sfx (its ctx and master) @param tracks { name: { url, meta } } */
  constructor(sfx, tracks) { this.sfx = sfx; this.tracks = tracks; this.buffers = {}; this.src = null; this.out = null; this.name = null; }

  /** fetch + decode a track (cached); resolves to its AudioBuffer */
  preload(name) {
    const t = this.tracks[name], ctx = this.sfx.ctx;
    if (!t) return Promise.reject(new Error(`music: unknown track ${name}`));
    if (!ctx) return Promise.reject(new Error('music: call sfx.unlock() first'));
    return (this.buffers[name] ??= fetch(t.url).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)));
  }

  /** crossfade to `name` (from its start); a no-op if it is already playing */
  async play(name) {
    if (this.name === name) return;
    this.name = name;
    const buf = await this.preload(name);
    if (this.name !== name) return;                    // another play() or stop() came in while decoding
    this.fadeOut();
    const ctx = this.sfx.ctx, { meta } = this.tracks[name];
    const src = ctx.createBufferSource(), out = ctx.createGain();
    src.buffer = buf; src.loop = true; src.loopStart = 0; src.loopEnd = meta.samples / meta.sampleRate;
    out.gain.setValueAtTime(0, ctx.currentTime); out.gain.linearRampToValueAtTime(MUSIC.gain, ctx.currentTime + MUSIC.fadeIn);
    src.connect(out).connect(this.sfx.master); src.start();
    this.src = src; this.out = out;
  }

  stop() { this.name = null; this.fadeOut(); }

  fadeOut() {
    const ctx = this.sfx.ctx, { src, out } = this;
    if (!src) return;
    out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setValueAtTime(out.gain.value, ctx.currentTime);
    out.gain.linearRampToValueAtTime(0, ctx.currentTime + MUSIC.fadeOut); src.stop(ctx.currentTime + MUSIC.fadeOut + 0.05);
    this.src = null; this.out = null;
  }
}
