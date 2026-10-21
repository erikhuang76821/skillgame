// Strike sound design (gdd/06_combo_feel.md §7). Each hit = a strike body (jab / kick / palm, matching the
// hero's pose) whose pitch climbs through an 8-hit phrase, plus layers that stack up with the combo tier:
//   T0 body · T1 + crack · T2 + boom on the beat · T3 + swish, echo · T4 + shimmer on downbeats / phrase ends
// Bar downbeats get a taiko accent; enemies squeak (rate-limited). Every layer is scheduled `delay` seconds ahead so a
// clean hit lands ON the beat (gdd/06 §8), and the note's keysound carries the melody. Render layer only.
import { FEEL } from '../fx/feel.js';
import { keyFor } from './keysound.js';

// Pitch per hit inside an 8-hit phrase: a rising pentatonic line that resets every 8 hits (relief for the ear).
export const PHRASE_PITCH = [0.89, 1.0, 1.12, 1.26, 1.33, 1.5, 1.33, 1.5];
const GRADE_GAIN = { 3: 1, 2: 0.85, 1: 0.6 };                       // PERFECT / GREAT / GOOD

export class HitFx {
  constructor(sfx) { this.sfx = sfx; this.lastSqueak = 0; }

  /**
   * @param o { strike: 'jab'|'kick'|'palm', grade 1..3, combo, tier, downbeat, onBeat, nextGapMs, kind, note (chart note), delay (s) }
   */
  strike(o) {
    const { sfx } = this, C = FEEL.combo, t = o.tier;
    const step = (Math.max(o.combo, 1) - 1) % 8, phraseEnd = step === 7;
    const lift = 2 ** (C.transpose[t] / 24);                          // half the BGM key change: brighter, still weighty
    const body = PHRASE_PITCH[step] * lift, g = GRADE_GAIN[o.grade] ?? 0.6, delay = o.delay ?? 0;
    const key = o.note ? keyFor(o.note, t) : null;
    if (o.grade === 1) {                                              // GOOD: soft "pof" + a quiet keysound, at tap time
      sfx.play('good', { gain: 1 });
      if (key) sfx.play(key.recipe, { pitch: key.pitch, gain: 0.5, exact: true });
      this.react(o.kind);
      return;
    }
    if (key) sfx.play(key.recipe, { pitch: key.pitch, gain: o.grade === 3 ? 1 : 0.8, exact: true, delay });
    sfx.play(o.strike, { pitch: body, gain: g * (t >= 3 ? 0.82 : 1), exact: true, delay });
    if (t >= 1) sfx.play('crack', { pitch: body, gain: g * 0.8, delay });
    if (t >= 2 && (o.onBeat || phraseEnd)) sfx.play('boom', { gain: g * 0.9, delay });
    if (t >= 3) {
      sfx.play('swish', { pitch: body, gain: g * 0.55, delay });
      if (o.nextGapMs > 180) sfx.play('echo', { pitch: body, gain: g * 0.8, delay });   // never collide with the next real hit
    }
    if (t >= 4 && (o.downbeat || phraseEnd)) sfx.play('shimmer', { gain: 0.8, delay });
    if (o.downbeat) sfx.play('accent', { gain: 0.8 + 0.05 * t, delay });
    this.react(o.kind);
  }

  /** Cute enemy reaction: rate-limited (≥ 0.4 s) and only on some hits so it never turns into a screech. */
  react(kind) {
    const now = performance.now();
    if (kind === 2 || now - this.lastSqueak < 400 || Math.random() > 0.4) return;
    this.lastSqueak = now;
    this.sfx.play(kind === 1 ? 'squirrelChitter' : 'mouseSqueak', { gain: 0.6 });
  }
}
