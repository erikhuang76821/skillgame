// Every juice tunable of BladeOath lives here. Effects read FEEL at call time, so editing window.FEEL in dev takes effect
// live. Durations in seconds, distances in CSS / logical px. Judgement numbers (windows, damage) live in the sim, not here.
export const FEEL = {
  enabled: true,                       // false = LOW effects / prefers-reduced-motion
  shake: {
    light: { px: 3, dur: 0.10 },       // landing a hit
    crit: { px: 7, dur: 0.22 },        // parry, interrupt, getting hit
    boss: { px: 12, dur: 0.38 },       // execution, boss phase, being broken
    step: 0.032,
    rotPerPx: 0.04,
  },
  // Render-only freeze (sim keeps running). A parry gets a short, crisp stop; an execution a long one.
  hitStop: { light: 0.025, crit: 0.07, boss: 0.12 },
  flash: { alpha: 0.45, dur: 0.1 },
  hurt: { dur: 0.55, ease: 'power2.out' },
  popup: { rise: 34, dur: 0.7, ease: 'power3.out' },
  ghost: { alpha: 0.55, dur: 0.28 },   // perfect-dodge afterimage
  cancelHint: true,                    // flash the player when a recovery can be cut by a dodge (assist; can be turned off)
  particles: { burst: 18, speed: 260, life: 0.38, gravity: 500, max: 384 },
  telegraph: { alpha: 0.22, pulse: 0.35, outline: 0.8, dash: 3 },   // wind-up range box (sim's hit box: telegraph = judgement); outline alpha floor; gold dash px
  camera: { lerp: 0.25, kick: 3 },  // render-only follow smoothing; kick = px nudge toward a hit
  rig: { flash: 0.07, trail: 7 },     // hit flash seconds on the skeleton; blade-trail length in frames
  camBias: { x: 48, y: 24 },          // touch layout: player framed left/up of centre so the button pad covers less (logical px)
  padIdle: 0.45,                       // touch layout: button opacity while no button is pressed
  ui: { in: 0.2, out: 0.14, inEase: 'back.out(1.7)', outEase: 'power2.in', stagger: 0.03 },
  colors: { white: 0xf3efe4, gold: 0xe3b34a, red: 0xe0503c, parry: 0xfff3c4, hurt: 0xc8423a, qi: 0x4f8fd8 },
};

if (import.meta.env?.DEV) window.FEEL = FEEL;
