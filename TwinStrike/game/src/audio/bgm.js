// Beat-locked procedural BGM (gdd/06_combo_feel.md §2). The grid is the sim's fixed segment table, so the
// music speeds up exactly when the chart does (v3 script: 112 -> 171 BPM, gdd/07). Layers are added by the
// combo tier; everything is scheduled on the AudioContext clock ~0.25 s ahead (knowledge-base/14 §4).
// Render layer only: reads the sim clock, never writes to the sim.
import { SEGMENTS } from '../sim/sim.js';
import { FEEL } from '../fx/feel.js';

const LOOKAHEAD_TICKS = 15;                         // 0.25 s
export const BASS = [0, 0, 7, 9];                          // semitones per beat of a 4-beat bar (pentatonic)
const ARP = [0, 4, 7, 9, 12, 9, 7, 4];              // per 8th note across a bar

// Every 8th note of the match: { tick, beat (global), half (0 on the beat, 1 off-beat), fever }
const STEPS = [];
{
  let beat = 0;
  for (const s of SEGMENTS) {
    for (let start = s.from; start + s.beatTicks <= s.to; start += s.beatTicks, beat++) {
      STEPS.push({ tick: start, beat, half: 0, fever: s.fever });
      STEPS.push({ tick: start + s.beatTicks / 2, beat, half: 1, fever: s.fever });
    }
  }
}

export class Bgm {
  /** @param latency () => seconds between scheduling a sound and hearing it (calibrated, or the browser's estimate) */
  constructor(sfx, latency) { this.sfx = sfx; this.latency = latency; this.i = 0; this.on = false; this.tier = 0; }

  start() { this.on = true; this.i = 0; this.setTier(0, 0.05); }
  stop() { this.on = false; }

  setTier(t, seconds = 0.3) {
    this.tier = t;
    this.sfx.bgmFilter(FEEL.combo.lowpass[t], seconds);
  }

  /** Combo broke: filter dips and recovers to T0; a down-sweep plays (gdd/06 §4). */
  comboBreak() {
    this.tier = 0;
    this.sfx.bgmFilter(FEEL.combo.lowpass[0], 0.6, 400);
    this.sfx.play('sweepDown');
  }

  /** Call every frame with the sim clock as a float tick (same clock the enemies are drawn with). */
  update(nowTick) {
    const ctx = this.sfx.ctx;
    if (!this.on || !ctx || ctx.state !== 'running') return;
    const latency = this.latency();
    const at = tick => ctx.currentTime + (tick - nowTick) / 60 - latency;   // heard on the frame the enemy lands
    while (this.i < STEPS.length && STEPS[this.i].tick <= nowTick + LOOKAHEAD_TICKS) {
      const st = STEPS[this.i++];
      const when = at(st.tick);
      if (when < ctx.currentTime) continue;                                   // late (hitch / tab switch): skip, never cram
      this.play(st, when);
    }
  }

  play(st, when) {
    const t = this.tier, key = FEEL.combo.transpose[t], note = s => 2 ** ((s + key) / 12), sfx = this.sfx;
    const bar = st.beat % 4, step8 = bar * 2 + st.half;
    if (!st.half) sfx.schedule('taiko', when, { gain: t ? 1 : 0.7 });
    if (t >= 1 || st.fever) sfx.schedule('shaker', when, { gain: st.half ? 1.3 : 0.8 });
    if (t >= 2) {
      if (!st.half) sfx.schedule('bass', when, { pitch: note(BASS[bar]) });
      if (st.half && bar % 2 === 1) sfx.schedule('clap', when);
    }
    if (t >= 3) sfx.schedule('arp', when, { pitch: note(ARP[step8]) });
    if (t >= 4 && step8 === 0) sfx.schedule('sparkle', when, { pitch: note(0) });
  }
}
