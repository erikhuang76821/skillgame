// Every juice tunable lives here. Effects read FEEL at call time, so editing window.FEEL in dev takes effect live.
export const FEEL = {
  enabled: true,                       // false = LOW effects / prefers-reduced-motion
  shake: {
    light: { px: 3, dur: 0.1 },
    crit: { px: 7, dur: 0.22 },
    boss: { px: 12, dur: 0.4 },
    step: 0.032,
    rotPerPx: 0.05,
  },
  flash: { alpha: 0.45, dur: 0.12 },
  hurt: { dur: 0.5, ease: 'power2.out' },
  shot: { dur: 0.14, ease: 'none' },                 // arrow / beam flight (render only; damage already applied)
  hitFlash: 0.08,                                    // white tint on hit
  struck: { dur: 0.16, tint: 0xff7070, jitter: 2 }, // our buildings, walls and soldiers when hit: red tint + 1-art-px shake
  dmgNum: { rise: 18, dur: 0.6, merge: 0.15, max: 48, pop: 1.5, big: 1.3, small: 0.75 },   // floating damage numbers
  hitStop: { ms: 50, dmg: 20 },                       // a countering or 20+ hit freezes only that foe's animation
  levelUp: { scale: 1.6, dur: 0.35, ease: 'back.out(1.7)' },
  build: { from: 0.3, dur: 0.35, ease: 'back.out(1.7)' },
  warn: { in: 0.2, hold: 2.2, out: 0.4 },
  particles: { burst: 14, speed: 260, life: 0.45, gravity: 500, max: 400 },
  card: { in: 0.3, stagger: 0.08, ease: 'back.out(1.7)', out: 0.15 },           // level-up offer
  chest: { delay: 0.35, stagger: 0.4, flip: 0.3, hold: 1.1 },                  // chest reveal, one card at a time
  banner: { in: 0.25, hold: 1.4, out: 0.3, ease: 'back.out(1.7)' },          // synergy / evolution / reaction
  ring: { dur: 0.35, ease: 'power2.out' },                                     // explosions, steam, winter
  zap: { dur: 0.2 },
  combo: { min: 4, scale: 1.5, dur: 0.5 },
  defeat: { fade: 1.2, slam: 0.35 },                                         // 團滅: darken, then the title slams in
  ui: { in: 0.2, out: 0.12, inEase: 'back.out(1.7)', outEase: 'power2.in' },
};

if (import.meta.env?.DEV) window.FEEL = FEEL;
