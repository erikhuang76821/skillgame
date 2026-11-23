// Every juice tunable for SkyTalon lives here (spec §11 names the keys). Effects read FEEL at call time, so editing
// window.FEEL in dev takes effect live. Durations in seconds, distances in world px unless noted. Render layer only:
// nothing here can change a score.
export const FEEL = {
  enabled: true,                       // false = low effects / prefers-reduced-motion: motion goes, information stays
  shake: {                             // CSS px on the wrapper around the canvas (fx/shake.js)
    light: { px: 3, dur: 0.1 },        // an enemy goes down
    crit: { px: 9, dur: 0.28 },        // the ship is hit
    boss: { px: 14, dur: 0.5 },        // the boss goes down
    step: 0.032,
    rotPerPx: 0.04,
  },
  hitStop: { light: 0, crit: 0.07, boss: 0.12 },   // render-only freeze of the effects; the sim keeps stepping
  flash: { alpha: 0.5, dur: 0.14 },
  hurt: { dur: 0.7, ease: 'power2.out' },
  ui: { in: 0.25, out: 0.15, inEase: 'back.out(1.7)', outEase: 'power2.in', stagger: 0.05, punch: 1.3, punchDur: 0.18 },

  // --- the world: fake 3D ---
  // Ground speed in ground pixels per second (1 ground pixel = 3 world px). One value per script section (warm-up,
  // rise, speed-up, breather, climax, boss): the flight gets faster as the match does. A long chain adds to it, so
  // flying well is felt as speed. `rush` (0..1) is this speed mapped onto rushFrom..rushTo; it drives the perspective,
  // the near cloud layer, the wind lines and the wind sound. Render only: the sim never sees any of it.
  // v7: speed by chapter, slower in an intro section and during a boss, flat out in a boost unit.
  scroll: { byChapter: [96, 112, 126, 140], safe: 0.75, boss: 0.62, boost: 240, idle: 50, perChain: 1.6, chainCap: 20, follow: 1.4, rushFrom: 60, rushTo: 170 },
  // Wind lines: thin streaks falling past the aircraft. They sit under every ship and bullet and stay faint.
  wind: { perSecond: 30, minRush: 0.12, len: [70, 200], speed: [1500, 2500], alpha: [0.08, 0.2], width: 2 },
  windSound: { gain: 0.05, f0: 380, f1: 1700 },
  parallax: 0.06,                                   // ground pixels of sideways shift per world px the ship is off-centre
  bank: { follow: 9, frames: 2.2 },                 // how fast the roll catches up (1/s), roll at full sideways speed
  altitude: { player: 54, enemy: 40, boss: 70, shadowX: 0.6, shadowAlpha: 0.9 },   // shadow offset = altitude down, altitude × shadowX right
  contrail: { every: 0.03, life: 0.5, rushLife: 0.5, drift: 1.15, size: 0.55, alpha: 0.5, wing: 26 },   // drift = × the ground's speed; life grows by rushLife at full rush
  // --- hits ---
  muzzle: { life: 0.05, size: 1.4 },
  spark: { n: 3, speed: 240, life: 0.18 },
  enemyFlashAlpha: 0.7,                             // how white (the sprite's own silhouette is drawn over it)
  enemyFlash: 0.07,                                 // seconds an enemy stays white after a hit
  explode: { puffs: 7, sparks: 9, speed: 300, life: 0.42, ring: 0.3, ringScale: 3.2, bossPuffs: 26, bossSparks: 40, bossRing: 0.7, bossRingScale: 11 },
  graze: { n: 2, speed: 160, life: 0.22, tint: 0x9fe8ff },
  invulnBlink: 0.08,                                // seconds per blink while the ship cannot be hit
  telegraph: { alpha: 0.75, blink: 0.12, width: 3 },   // the diver's warning line
  aim: { alpha: [0.2, 0.85], width: 3, len: 1500 },    // a lancer's line: faint at the lock, bright when it fires
  wall: { dot: 6, alpha: 0.5, markDrop: 46 },          // a coming wall: dim dots where bullets will be, a mark on the gap
  mineWarn: 45,                                        // ticks before a mine goes off that it starts blinking red
  // after a pause: "3", "2", "1" evenly (2.3 s in all); max = pauses per leg, leaving the page included
  // (a pause freezes the bullets on screen, so an unlimited one would let a player study every pattern)
  pause: { steps: [2.3 / 3, 2.3 / 3, 2.3 / 3], max: 3 },
  pick: { resume: 0.4, clearLife: 0.35, shield: 0.5, delay: 0.5, pop: 0.35, popFrom: 0.84, shade: 0.45 },   // delay: a boss's wreck burns this long before its supply shows; pop: the panel's entrance
  // resume: seconds before play resumes after a supply (short: the boost follows at once); the clear ring; the invulnerability ring's alpha
  // a beam: its warning column fills in, then moving light (view.beamFx): body alpha, the wide halo, how many motes and streaks
  beam: { warn: [0.12, 0.5], on: 0.8, fill: 0.35, core: 0.3, halo: 0.28, motes: 22, streaks: 14,
    boss: { tint: 0x46c8ff, core: 0xe6fbff, mote: 0x9ff4ff, warn: 0x8ff6ff },
    storm: { tint: 0x8a3cff, core: 0xf0e0ff, mote: 0xd29bff, warn: 0xc9a8ff } },
  // the lock-on gear is drawn as plasma: a curved violet arc to each target, an orb that charges on the ship's nose
  plasma: {
    life: 0.46, reach: 0.07, hold: 0.24,                             // a bolt: seconds it lasts, to reach the target, before it lets go of the ship
    segs: 16, bend: 0.28, width: [9, 5], core: 0.4,                  // pieces, sideways bulge (x distance), width ship -> target, core width (x)
    twist: 13, waves: 2.5, speed: 26, jitter: 15, flicker: 30,       // two strands wind round each other: px, turns, rad/s; lightning jitter px, re-rolled per second
    glow: 3.4, glowAlpha: 0.2, orbs: 2, orbSpeed: 3.2,               // additive halo: width (x) and alpha; bright knots that run along the bolt, laps per second
    tint: 0xa24bff, hot: 0xf1dcff, burst: 6, arcs: 4, arcLen: [14, 34], // colours; sparks and crackling arcs where it lands
    nose: 30, orb: [0.35, 1.5], orbAlpha: 0.85, halo: 2.6,           // the charging orb: px ahead of the ship, size from empty to full, its halo (x)
    motes: 3, moteR: [22, 5], moteSpin: 9, tendrils: 4, tendrilLen: [6, 22], // specks spiralling in; arcs that lick out of the orb
    crackle: 0.55, crackleLen: [8, 18], flash: 0.16, flashScale: 2.6, // arcs over the hull from this charge on; the discharge flash
  },
  // the ship's own shots by gear level (index = level 0..3): frame, size, glow; heavy rounds grow and run hotter
  shot: {
    frames: ['playerShot', 'shotB', 'shotC', 'shotD'], glowFrom: 2, glow: [0, 0, 1.5, 2.1], glowAlpha: 0.28, glowTint: 0x9fe8ff,
    heavyScale: [1, 1, 1.25, 1.5], heavyTint: [0xffffff, 0xffffff, 0xffd9a8, 0xffb080], heavyGlow: 0xffb347,
    back: { w: 1.7, len: 1.1, alpha: 0.55, tint: 0x0a0a1e, dy: 2 },     // the dark comet under the main and heavy shots: width and length (x), alpha, colour, px lower
    haloK: 0.6,                                                       // all the ship's shot halos × this: light around them, never over the enemy's bullets
    // drawn as light (world px): width, length, the white core's width, how much longer per rapid-fire level, the head's glow
    plain: { w: 18, len: 40, core: 8, tint: 0x5ab4ff, tintByLv: [0x5ab4ff, 0x5fd0ff, 0x9fe8ff, 0xe0f8ff], rapidLen: 0.12, headGlow: 0.55 },
    heavy: { w: 22, len: 55, core: 11, halo: 2.28, haloByLv: [1, 1, 1.25, 1.55], trailByLv: [1, 1, 1.25, 1.55], tint: 0xff5a10, hot: 0xffe2a0, embers: 4, emberRate: 5, ember: 9, emberTint: 0xffa040 },
    wing: { w: 15, len: 46, core: 6.5, tint: 0xffc23a, hot: 0xfffbe6, headGlow: 1 },   // the wingmen: thin gold needles
    spreadOrb: { r: 13, tail: 26, tint: 0x22e0a8, halo: 2, haloAlpha: 0.45 },   // the spread's side shots: teal-green orbs (size grows with sideScale)
    pierceTail: 13, pierceTint: 0x7dffb0, pierceAlpha: 0.5,           // px of tail per pierce level
    sideAlpha: [0.55, 0.55, 0.62, 0.7], sideScale: [1, 1, 1.12, 1.25],
    muzzle: [1, 1.2, 1.45, 1.75],                                     // muzzle flash size (x) by rapid-fire level
  },
  drop: { bob: 5, bobRate: 4, pulse: 0.12, fadeRate: 5, fadeMin: 0.2, halo: 1.7, haloAlpha: 0.3 },   // from DROP_FADE_FROM on a drop breathes fainter and fainter until it is gone
  // the ray: live = a thick red band with a white-hot core and crackle; dead = a thin dim thread; it swells just before it goes live
  ray: { live: 0xff2a3c, core: 0xfff0f0, dead: 0x8a2a3a, thread: 2, deadAlpha: 0.45, glow: 4.5, glowAlpha: 0.22, swell: 12, crackle: 9, warn: [0.15, 0.6] },
  // pixel VFX (knowledge-base/18): frame rates, the pop when a shield comes up, shards when it breaks
  vfx: {
    shieldFps: 10, plateFps: 3, pop: 0.22, popOver: 0.35,             // frames per second; seconds of the pop-in and how far it overshoots
    wave: 0.32, pulse: 0.07, pulseRate: 1.4,                          // a shock ring's life; the shield's pulse (sharp up, slow down), per second
    shards: 12, shardSpeed: [220, 520], shardDrag: 5, shardLife: [0.28, 0.55],   // a broken shield: pieces fly out and slow down
    invulnBlink: 24,                                                  // ticks from the end at which the invulnerability shield starts to flicker
  },
  // the ship changes airframe as its gear adds up: total gear levels at which it becomes the wing, the heavy and the
  // rail form (in space it is at least the heavy form). dy = how far the form's picture is shifted so its centre sits on the hit point
  ship: { forms: [3, 7, 12], dy: 4 },
  // v9 bosses: the shake of a stunned boss, the size of a break's burst
  boss: { flash: 0.4, flashEvery: 0.22, stunShake: 3, breakShards: 26, coreGlow: 0.5 },
  fade: { life: 0.55, shrink: 0.5, alpha: 0.9 },       // a downed boss's bullets: harmless at once, seen to fade
  elite: { tint: 0xffd24a, ring: 0.5, ringSpin: 1.2 },  // an elite: a slow gold ring round it (it is known to carry a drop)
  // v10: a shot stopped by a boss's armour (a few grey chips, a note at most every `noteEvery` s, a tick at most every
  // `sfxEvery` s); the lane of a charge while it is announced (fills in, blinking) and while it is under way
  obst: { chips: 5, burst: 18, tints: [0xc49a6c, 0x8a6142, 0xe9d2a8] },   // v10: a heavy shot chips a peak or a meteor; the last one bursts it
  // leg six: a volcanic bomb's shadow (alpha from, to), the ring that shows the last ticks, the burst; a weak point's glow
  bomb: { shadow: [0.25, 0.8], ring: [0.35, 0.9], ringFrom: 22, tint: 0xff7a3a, shards: 14, fall: 520, drift: 60, lift: 90 },   // fall/drift/lift: the falling bomb's arc (px above, px sideways, extra height mid-flight)
  weak: { glow: 0.55 },
  // leg six: what a creature's bullet is made of; the lines and areas that announce and show its hazards
  spit: { fire: 0xff6a3a, venom: 0xb46aff, gold: 0xffd24a, lead: 0xa8b0bc, moon: 0xd8f0ff, ember: 0xff7a3a, nectar: 0xffd24a, shard: 0xc084fc, echo: 0x7ff0ff, ball: 0xe8a8ff, frost: 0x9ff4ff, sonar: 0x5ab8ff, stygian: 0xb48cff, thunder: 0xfff27a, solar: 0xff3a8a, slow: 0xc7f9ff, talis: 0xff4a5a, petal: 0xff8ad8 },
  // leg three: the ship's past (an echo's mark), where Janus thinks it is going, Amalthea's shield, the pole, the chains
  l3: { past: 0x7ff0ff, ahead: 0xff7ae0, shield: 0x8fdcff, pole: 0xff6a4a, chain: 0xffb347, mortar: 0xff5a3a, rain: 0xff7a3a, cone: 0xffb347 },
  // leg four: Brontes's bolt and Mnemosyne's lanes and rows, the rain of circles, the river, the wand, Triton's gap, the heel
  l4: { warn: 0.32, live: 0.8, bolt: 0xfff27a, lane: 0x8b3dff, row: 0x6d28d9, rain: 0xb48cff, river: 0x2a1a5a, riverAlpha: 0.85, riverGlint: 0x38bdf8, charm: 0x34d399, rise: 0xb48cff, sonar: 0x5ab8ff, heel: 0xff5ad8, gap: 0xd8f0ff, morph: 0x14b8a6, ferry: 0xc4b5fd, beat: 0xfde047 },
  // leg five: prominences, flares and the shade, stripes, threads, the cone, the night, the stopped bullets' arrows, Hundun's eyes, the soul
  // leg one's departure cutscene (ui/intro.js): seconds each scene shows, crossfade, the hold at the end, the hand-over
  // (seconds; the camera dives to dive× while the battlefield fades in),
  // embers per burning scene, speed lines at the launch, shake in px when the wave wall rises
  intro: { scene: [3.6, 3.8, 3.2, 3.4], fade: 0.7, hold: 0.4, outro: 0.8, dive: 1.6, embers: 18, streaks: 26, shake: 8 },
  // steering feel (input layer only; the sim still takes one direction per tick at full speed, so a slower pace is the
  // share of ticks that carry the direction). Stick: screen px. min = the pace just past the dead zone, curve shapes the
  // rest (above 1 = finer near the centre), full = the deflection that reaches full speed. The pace starts at `start` when
  // steering begins and climbs by `accel` per tick to what the stick (or a key, always full) asks for; letting go stops at once.
  steer: { dead: 10, full: 56, reach: 56, min: 0.28, curve: 1.6, start: 0.35, accel: 0.07 },
  l5: { warn: 0.34, live: 0.75, prom: 0xff8a2a, flare: 0xffc24a, flareAlpha: 0.38, shade: 0x5a2a10, shadeAlpha: 0.22,
    // the flare (view: soft lanes, no flat boxes): pillar colour and its glow, the glare from start to end of the countdown,
    // breathing rate (rad/s), motes of light rising in the gaps, the burst's fill and bloom and how long its afterglow lasts (s)
    pr: { glowW: 3, glowA: 0.4, body: 0xe8360c, core: 0xfff4c2, flicker: 0.18, rate: 9, warnW: 10, sparks: 14, sparkRate: 1.3 },   // a prominence: halo width (x) and alpha, core colour, flicker, warning breath and width, sparks
    fl: { cool: 0x2a3a7a, coolHot: 0x8fb8ff, hot: 0xfff0c0, glare: [0.06, 0.34], rate: [6, 20], motes: 5, moteRate: 0.9, burst: 0.75, bloom: 0.35, after: 0.45 },
    stripe: 0x3a6bff, thread: 0x9ff4ff, cone: 0x5ab8ff, rain: 0xc084fc, night: 0x0a0820, arrow: 0xfff27a, eye: 0xc7f9ff, gate: 0x34d399, soul: 0x9ff4ff, soulScale: 1.4 },
  // leg two: ground attacks (pipes, stripes, cones, circles) announced faint and blinking, then bright; the apple, the eyes
  l2: { warn: 0.24, live: 0.75, edge: 0.9, pipe: 0xffa040, stripe: 0xff4a5a, cone: 0xffd24a, circle: 0xff5a7a, apple: 0xffd24a, eye: 0x7ff0ff, plate: 0xff5a7a, gap: 0xd8f0ff, line: 0xff5a4a, swap: 0xc8a8ff },
  l6: { warn: 0.28, live: 0.8, sweep: 0x6fe0b0, claw: 0xe2574c, line: 0xff5a4a, neck: 0x5fc8c8, band: 0x6fe0b0, bandAlpha: 0.16, rift: 0xc89aff, well: 0x1c1030, wellField: 0x7a2ad8, wellRim: 0xf4f0ff, wind: 0xcfeeff, windAlpha: 0.5 },
  clang: { shards: 2, tints: [0xdfe7ee, 0x8797ae, 0xffffff], noteEvery: 6, sfxEvery: 0.09 },
  // the dark halo under every enemy bullet (world px across, alpha, colour): keeps its edge readable over any light
  bulletBack: { size: 36, alpha: 0.6, tint: 0x0a0614 },
  // a boss's lunge warning (view: soft lane, no outline): fill alpha from start to end of the warning, breathing rate (rad/s)
  // from start to end, the hot core's alpha, bands of light running down it (count, laps per second, thickness, alpha)
  charge: { tint: 0xff3a4a, hot: 0xffb0a0, warn: [0.3, 0.62], on: 0.14, rate: [8, 22], core: 0.4, bands: 3, bandSpeed: 1.6, bandH: 48, bandAlpha: 0.5 },
  shell: { tint: 0x9fe8ff, alpha: 0.55, step: 0.14, crack: 8, broke: 16 },   // shell layers as rings; sparks when one cracks or the lot breaks
  cross: { alpha: [0.2, 0.85], width: 3, len: 1500 },  // Nyx's cross: two lines from the screen edges           // drops bob and pulse so they are never mistaken for a bullet
  barrier: { r: 1.5, alpha: 0.75 },                    // the barrier's ring around the ship while a charge is up
  obstacleWarn: 0.6,                                   // alpha of the mark at the top of the screen before a peak or a meteor enters
  chapter: { follow: 0.7 },                            // how fast the ground changes look between chapters (1/s)
  bossPulse: { scale: 1.08, dur: 0.16 },
  particles: { max: 420, gravity: 0 },
};

if (import.meta.env?.DEV) window.FEEL = FEEL;
