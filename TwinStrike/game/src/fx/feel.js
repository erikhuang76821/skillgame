// Every juice tunable lives here. Effects read FEEL at call time, so editing window.FEEL in dev takes effect live.
// Durations in seconds, distances in CSS / logical px. Copy tuned values back into this file.
export const FEEL = {
  enabled: true,                       // false = LOW effects / prefers-reduced-motion
  shake: {
    light: { px: 4, dur: 0.12 },
    crit: { px: 8, dur: 0.25 },
    boss: { px: 14, dur: 0.4 },
    step: 0.032,                       // seconds per random offset; smaller = buzzier
    rotPerPx: 0.05,                    // degrees of rotation per px of offset
  },
  hitStop: { light: 0.03, crit: 0.06, boss: 0.1 }, // render-only freeze
  flash: { alpha: 0.6, dur: 0.12 },
  hurt: { dur: 0.6, ease: 'power2.out' },
  squash: { sx: 1.25, sy: 0.8, in: 0.06, out: 0.2, outEase: 'elastic.out(1, 0.35)' },
  popup: { rise: 40, dur: 0.6, ease: 'power3.out' },
  shockwave: { radius: 260, width: 40, amp: 18, dur: 0.45, ease: 'power2.out' },
  particles: { burst: 24, speed: 420, life: 0.5, gravity: 900, max: 512 },
  ui: { in: 0.25, out: 0.15, inEase: 'back.out(1.7)', outEase: 'power2.in', stagger: 0.04 },
  // TwinStrike (gdd/05 §11). Distances in world units (720x1280).
  strike: { lunge: 46, back: 0.16, hold: 0.18 },                  // hero steps toward the hit side, then returns
  fly: { dist: 520, height: 220, spin: 6, dur: 0.6 },             // knocked-out enemy arc (PERFECT = full, others ×0.75)
  stamp: { in: 0.08, hold: 0.06, out: 0.16, scale: 0.6 },         // paw-print impact (scale of the 160 px fx frame at Great)
  burst: { scale: 0.4 },                                          // stars / fur / leaf / sweat pieces (160 px fx frames)
  brute: { hop: 0.12, knock: 40 },                                // tanuki hop over the hero / knock-back
  // tanuki boss cues (gdd/07 §7): big arrow over the side to tap + ring closing on the beat; queue over its head
  boss: { color: 0xffb020, cueY: 250, cueScale: 1.5, ringStart: 1.15, ringEnd: 0.42, queueGap: 54, queueScale: 0.55, queueNext: 0.75 },
  cutIn: { in: 0.22, hold: 0.6, out: 0.18 },                      // fever banner (top 20% only, never pauses the sim)
  // Combo tiers (gdd/06_combo_feel.md). Index = tier T0..T4; render / audio only, scoring is unchanged.
  combo: {
    at: [0, 10, 25, 50, 100],                                      // combo needed for each tier
    name: ['', '好身手', '火力全開', '喵拳無雙', '傳說貓師父'],
    color: [0xffffff, 0xffb347, 0xff7a3d, 0xffd34a, 0xfff2a8],     // glow / streak tint
    pulse: [0, 0.006, 0.012, 0.018, 0.022],                        // background scale kick per beat
    markerPulse: [0, 0.05, 0.07, 0.09, 0.1],                       // range-marker scale kick per beat
    streaks: [0, 0, 2, 4, 6],                                      // speed lines per beat (each side)
    glow: [0, 0.18, 0.3, 0.42, 0.5],                               // floor glow alpha under the hero
    lowpass: [900, 1800, 3500, 9000, 12000],                       // BGM bus cutoff (Hz)
    transpose: [0, 2, 4, 6, 8],                                    // semitones (BGM + hit notes)
    repeatEvery: 50,                                               // after the last threshold, a banner every N
    banner: { in: 0.2, hold: 0.7, out: 0.2 },
    breakMin: 10,                                                  // breaking a combo below this shows nothing extra
    breakDim: 0.3,                                                 // seconds the background dims on a break
  },
};

if (import.meta.env?.DEV) window.FEEL = FEEL;
