// Keysounds (gdd/06_combo_feel.md §8), DJMAX / Cytus style: every enemy IS a note of the song. A clean hit plays
// that note, a miss leaves a hole in the music. Pitches are chord tones of the BGM bar (audio/bgm.js BASS), so
// whatever the player hits is consonant; the left side plays a low pluck, the right side a high bell-pluck, so
// left/right patterns become call-and-response. Render layer only.
import { SUB, SEGMENTS } from '../sim/sim.js';
import { FEEL } from '../fx/feel.js';
import { BASS } from './bgm.js';

// chord tones (semitones from C) per bar root: C (0), G (7), Am (9)
const HI = { 0: [12, 16, 19, 24], 7: [14, 19, 21, 26], 9: [12, 16, 21, 24] };
const LO = { 0: [12, 19], 7: [7, 14], 9: [9, 16] };            // one octave above the recipe base: leaps between sides stay under ~1.5 octaves

/** Beat position of a sub-tick time on the scripted grid: { bar beat 0..3, eighth 0..7, onBeat } or null. */
export function gridAt(t) {
  const tick = t / SUB;
  for (const s of SEGMENTS) {
    if (tick < s.from || tick >= s.to) continue;
    const k = (tick - s.from) / s.beatTicks, beat = Math.floor(k), half = k - beat >= 0.5 ? 1 : 0;
    return { beat: beat % 4, eighth: (beat % 4) * 2 + half, onBeat: k === beat, downbeat: k === beat && beat % 4 === 0 };
  }
  return null;
}

/** The keysound for chart note `n` at combo tier `tier`: { recipe, pitch }. */
export function keyFor(n, tier) {
  const g = gridAt(n.t) ?? { beat: 0, eighth: 0 };
  const root = BASS[g.beat], key = FEEL.combo.transpose[tier];
  const semis = n.lane ? HI[root][g.eighth % 4] : LO[root][g.eighth % 2];
  return { recipe: n.lane ? 'keyHi' : 'keyLo', pitch: 2 ** ((semis + key) / 12) };
}
