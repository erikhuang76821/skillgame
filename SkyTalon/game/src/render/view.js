// The whole picture: ground, shadows, ships, shots and effects. Reads the sim, never writes to it.
// Draw calls: the ground's render-texture pass + one sprite batch (every sprite comes from the one atlas texture, the
// ground sprite is a second texture in the same batch). No filters, no masks, no blend-mode switches.
// Sprites are drawn immediate-mode from pools: each frame every pool is refilled from the sim's arrays, so there is
// no per-entity bookkeeping that could drift from the sim.
import { Assets, Container, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
// The painted grounds come from the shmup-bosses-3phase pack, whose terms for passing the files on are unknown, so they
// stay out of the public repository (SkyTalon/.gitignore). A checkout without them draws the shader's own grounds.
const GROUNDS = import.meta.glob('../assets/leg{5,6}/ground_ch*.webp', { eager: true, query: '?url', import: 'default' });
const grounds = leg => { const u = [1, 2, 3, 4].map(i => GROUNDS[`../assets/leg${leg}/ground_ch${i}.webp`]); return u.every(Boolean) ? u : null; };
// painted grounds (art manifest skytalon.bg.leg5-ground, skytalon.bg.leg6-ground): per leg, the four chapters' pictures,
// how many world px the picture spans across (wider than the field = room to slide with the view), and how far it
// follows the view sideways (leg six none: what stands on its ground must stay put)
const PAINTED = Object.fromEntries([
  [5, { urls: grounds(5), span: 960, follow: 0.65 }],
  [6, { urls: grounds(6), span: 720, follow: 0 }],
].filter(([, p]) => p.urls));
import { ONE } from '../sim/core/index.js';
import {
  WORLD_W, WORLD_H, DIVER, DIVER_HOLD_TICKS, MINE, MINE_FUSE, LANCER_TELEGRAPH, LANCER_SPEED, WALL_TELEGRAPH, RAY_ON, RAY_OFF, RAY_H, rayLive, WING_OFFSET, WINGMAN, SHOT_OFFSET,
  LASER, LASER_PERIOD, RAPID, HEAVY, SPREAD, PIERCE, BARRIER, THRUSTERS, isMid, radius, CARRIER, CROSS_X, DROP_LIFE, DROP_FADE_FROM, BEAM_TICKS,
  SEEKER, BEAM_TELEGRAPH, BEAM_W, beamColumns, CHARGE_WARN, CHARGE_HALF_W, CHARGE_DEPTH, CHARGE_REACH, BOSS_Y, OBST_R, OBST_HP, PEAK, SCRIPT, KIND,
  isBoss, clock, sectionAt,
} from '../sim/sim.js';
import {
  EUDI, COELO, STEGO, ORNI, PTERA, ELASMO, TRIKE, ANKY, HERRERA, PETEINO, DILOPHO, RHAM, ARCHELON, ICHTHY, DROMAEO, PACHY, L6_MIDS, L6_BOSSES, L6_BOMB_R, L6_BOMB_WARN, L6_GROUND_VY, FIRE, VENOM, blowing, windAt,
  L6_SWEEP_X, L6_SWEEP_Y, L6_SWEEP_LEN, L6_SWEEP_HALF, L6_CLAW_HALF, L6_NECK_LEN, L6_NECK_HALF, L6_WELL_R,
} from '../sim/leg6.js';
import {
  ORBITER, SHUTTER, TWINVEC, RAMMER, L2_MIDS, L2_BOSSES, TWINS, ARGUS, NEMESIS, ENDYMION, GOLD, LEAD, MOON, L2_SHUT_WARN, L2_EYES, L2_EYE_STEP, L2_PIPE_HALF, L2_STRIPE_HALF, L2_CONE_HALF, L2_CONE_REACH,
  L2_RINGS_R, L2_NEMESIS_ARMOUR, L2_NEMESIS_CAP,
} from '../sim/leg2.js';
import {
  MORTAR, AEGIS, CRYSTAL, ECHO, DEIMOS, ANCHOR, EAGLE, L3_MIDS, L3_BOSSES, PHOBOS, AMALTHEA, PANDORA, PROMETHEUS, EPIMETHEUS, JANUS,
  EMBER, NECTAR, SHARD3, ECHOSHOT, BALL, L3_ECHO_LAG, L3_EPI_LAG, L3_JANUS_LAG, L3_JANUS_AHEAD, L3_SHIELD_HALF, L3_CONE_HALF, L3_CONE_REACH, pastPos, aheadPos,
} from '../sim/leg3.js';
import {
  METRONOME, SCOUT, BEAST, BUOY, REVENANT, HUSK, ARM, FERRY, HEEL, L4_MIDS, L4_BOSSES, CIRCE, TRITON, PROTEUS,
  FROST, SONAR, STYGIAN, THUNDER, L4_BEAT, L4_SCOUT_RIPEN, L4_SCOUT_WARN, L4_HUSK_TICKS, L4_HUSK_WARN, L4_BUOY_PERIOD, L4_BUOY_PULSE, L4_TRITON_N, L4_TRITON_GAP, L4_FERRY_Y, L4_RIVER_W, riverY,
} from '../sim/leg4.js';
import {
  PROMSKIFF, FLARESKIFF, SLOWSHIP, TALISMAN, L5_MIDS, L5_BOSSES, HUNDUN, ZHUYIN, SOLAR, SLOWB, TALIS, PETAL, L5_SHADE_X, L5_SHADE_W, L5_EYES, L5_FLARE_WARN,
  inHole, eyeAt, gateOf,
} from '../sim/leg5.js';
import { FEEL } from '../fx/feel.js';
import { Ground, PIXEL } from './ground.js';
import { buildAtlas, buildShips, buildBosses, SHIP_ORDER, SHIP_SCALE, jetFrameFor, JET_SCALE, JET_SQUEEZE, SHIELD_FRAMES, WAVE_FRAMES, PLATE_FRAMES, VFX_RAMPS } from './atlas.js';

const KIND_FRAME = ['drone', 'gunner', 'weaver', 'diver', 'boss', 'lancer', 'miner', 'mine', 'bulwark', 'splitter', 'shard', 'boss2', 'boss3', 'seeker', 'beamer', 'boss4', 'mid1', 'mid2', 'mid3', 'mid4', 'carrier'];
const DROP_FRAME = ['dropRepair', 'dropHaste', 'dropBoost', 'dropAegis', 'dropOverhaul', 'dropUpgrade'];
const TURN = (Math.PI * 2) / 256, FAST2 = ((LANCER_SPEED - 1) * ONE) ** 2;
const noise = (a, b, c) => { const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return v - Math.floor(v) - 0.5; };   // -0.5..0.5, render only
const rnd = (a, b) => a + Math.random() * (b - a);         // render-only randomness (never reaches the sim)

class Pool {
  constructor(layer, texture) { this.layer = layer; this.sprites = []; this.n = 0; this.blank = texture; }
  begin() { this.n = 0; }
  draw(texture, x, y, sx = PIXEL, sy = sx, alpha = 1, tint = 0xffffff, rotation = 0) {
    let s = this.sprites[this.n];
    if (!s) { s = this.sprites[this.n] = new Sprite({ texture: this.blank, anchor: 0.5 }); this.layer.addChild(s); }
    this.n++;
    s.visible = true; s.texture = texture; s.position.set(x, y); s.scale.set(sx, sy); s.alpha = alpha; s.tint = tint; s.rotation = rotation;
    return s;
  }
  end() { for (let i = this.n; i < this.sprites.length; i++) this.sprites[i].visible = false; }
}

/** The same sheet with every opaque pixel white: drawn over a sprite, it lights the sprite's own shape (a hit flash). */
function whitened(canvas) {
  const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(canvas, 0, 0); ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  const source = Texture.from(c).source; source.scaleMode = 'nearest';
  return source;
}
/** Three small smooth textures drawn once at boot (0 bytes shipped): a beam's column (full across its middle 80%, the
 *  part that hurts, falling off at the sides; bright at its source, thinner down the middle, pooling where it lands),
 *  a round glow, and a haze that is soft across and even along its length. */
function softTextures() {
  const make = (w, h, alpha) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * Math.max(0, Math.min(1, alpha((x + 0.5) / w * 2 - 1, (y + 0.5) / h))));
    }
    g.putImageData(img, 0, 0);
    const t = Texture.from(c); t.source.scaleMode = 'linear';
    return t;
  };
  const column = make(64, 256, (u, v) => {
    const a = Math.min(1, Math.max(0, (Math.abs(u) - 0.5) / 0.5)), across = 1 - a * a * (3 - 2 * a);   // full to half width, then eases out
    return across * (0.30 + 0.70 * Math.exp(-v * 4) + 0.60 * Math.exp(-(1 - v) * 7));
  });
  const glow = make(64, 64, (u, v) => { const r = Math.hypot(u, v * 2 - 1); return r >= 1 ? 0 : (1 - r) ** 2.2; });
  const haze = make(64, 8, u => Math.exp(-((u / 0.42) ** 2)));
  // a comet: a round bright head near the top, a tail that narrows and fades to nothing at the bottom
  const H = 0.12, comet = make(32, 128, (u, v) => {
    const w = v < H ? Math.sqrt(Math.max(0, 1 - ((H - v) / H) ** 2)) : 1 - (v - H) / (1 - H);
    if (w <= 0) return 0;
    return Math.exp(-2.4 * (u / w) ** 2) * (v < H ? 1 : (1 - (v - H) / (1 - H)) ** 1.5);
  });
  // a lane: the column's soft sides, brighter toward the bottom (where a lunge lands), its ends eased in
  const slab = make(64, 256, (u, v) => {
    const a = Math.min(1, Math.max(0, (Math.abs(u) - 0.5) / 0.5)), across = 1 - a * a * (3 - 2 * a);
    return across * (0.55 + 0.45 * v) * Math.min(1, v / 0.06, (1 - v) / 0.04);
  });
  // a rod: soft across like the haze, its ends eased in
  const rod = make(64, 256, (u, v) => Math.exp(-((u / 0.42) ** 2)) * Math.min(1, v / 0.06, (1 - v) / 0.06));
  // a lane: the column's soft sides, even along its length, its ends eased in
  const lane = make(64, 256, (u, v) => { const a = Math.min(1, Math.max(0, (Math.abs(u) - 0.5) / 0.5)); return (1 - a * a * (3 - 2 * a)) * Math.min(1, v / 0.05, (1 - v) / 0.05); });
  // a ring: a thin soft circle at 88% of the half-size, for the edge of a round danger area
  const ring = make(128, 128, (u, v) => { const d = Math.hypot(u, v * 2 - 1); return Math.exp(-(((d - 0.88) / 0.05) ** 2)); });
  return { column, glow, haze, comet, cometHead: H, slab, rod, lane, ring };
}
// leg six's kinds -> frame names (bosses and mid-bosses are in the boss sheet, see buildBosses)
const L6_FRAME = new Map([...[[EUDI, 'eudi'], [COELO, 'coelo'], [STEGO, 'stego'], [ORNI, 'orni'], [PTERA, 'ptera'], [ELASMO, 'elasmo'], [TRIKE, 'trike'], [ANKY, 'anky'], [HERRERA, 'herrera'], [PETEINO, 'peteino'], [DILOPHO, 'dilopho'], [RHAM, 'rham'], [ARCHELON, 'archelon'], [ICHTHY, 'ichthy'], [DROMAEO, 'dromaeo'], [PACHY, 'pachy']].map(([t, n]) => [t, `l6c_${n}`]), ...L6_MIDS.map((t, i) => [t, `l6mid${i + 1}`]), ...L6_BOSSES.map((t, i) => [t, i ? `l6boss${i + 1}` : 'l6boss'])]);
// leg two's kinds -> frame names (all in the boss sheet; the twins have a picture per form, chosen when drawn)
const L2_FRAME = new Map([[ORBITER, 'l2c_orbiter'], [SHUTTER, 'l2c_shut'], [TWINVEC, 'l2c_twinvec'], [RAMMER, 'l2c_rammer'], ...L2_MIDS.map((t, i) => [t, `l2mid${i + 1}`]), ...L2_BOSSES.map((t, i) => [t, i ? `l2boss${i + 1}` : 'l2boss'])]);
// leg three's kinds -> frame names (all in the boss sheet)
const L3_FRAME = new Map([[MORTAR, 'l3c_mortar'], [AEGIS, 'l3c_aegis'], [CRYSTAL, 'l3c_crystal'], [ECHO, 'l3c_echo'], [ANCHOR, 'l3c_anchor'], [EAGLE, 'l3c_eagle'], [DEIMOS, 'l3deimos'], ...L3_MIDS.map((t, i) => [t, `l3mid${i + 1}`]), ...L3_BOSSES.map((t, i) => [t, i ? `l3boss${i + 1}` : 'l3boss'])]);
// leg four's kinds -> frame names (all in the boss sheet)
const L4_FRAME = new Map([[METRONOME, 'l4c_metronome'], [SCOUT, 'l4c_scout'], [BEAST, 'l4c_beast'], [BUOY, 'l4c_buoy'], [REVENANT, 'l4c_revenant'], [HUSK, 'l4c_husk'], [ARM, 'l4c_arm'], [FERRY, 'l4c_ferry'], [HEEL, 'l4c_heel'], ...L4_MIDS.map((t, i) => [t, `l4mid${i + 1}`]), ...L4_BOSSES.map((t, i) => [t, i ? `l4boss${i + 1}` : 'l4boss'])]);
// leg five's kinds -> frame names (all in the boss sheet)
const L5_FRAME = new Map([[PROMSKIFF, 'l5c_promskiff'], [FLARESKIFF, 'l5c_flareskiff'], [SLOWSHIP, 'l5c_slowship'], [TALISMAN, 'l5c_talisman'], ...L5_MIDS.map((t, i) => [t, `l5mid${i + 1}`]), ...L5_BOSSES.map((t, i) => [t, i ? `l5boss${i + 1}` : 'l5boss'])]);
const L6_GLOW = new Map([...L6_MIDS.map((t, i) => [t, [0xff9a4a, 0xe2574c, 0x8fd8ff, 0xb46aff][i]]), ...L6_BOSSES.map((t, i) => [t, [0xffa8b8, 0x6fe0b0, 0x5fe0e0, 0xc89aff][i]])]);
export class View {
  /** @param {import('pixi.js').Application} app */
  constructor(app) {
    this.app = app;
    const atlas = buildAtlas(), source = Texture.from(atlas.canvas).source;
    source.scaleMode = 'nearest';
    this.frames = atlas.frames;
    this.tex = Object.fromEntries(Object.entries(atlas.frames).map(([k, f]) => [k, new Texture({ source, frame: new Rectangle(f.x, f.y, f.w, f.h) })]));
    const white = whitened(atlas.canvas);                   // hit flash: the sprite's own silhouette in white
    this.texW = Object.fromEntries(Object.entries(atlas.frames).map(([k, f]) => [k, new Texture({ source: white, frame: new Rectangle(f.x, f.y, f.w, f.h) })]));
    const ships = buildShips(), shipSource = Texture.from(ships.canvas).source;   // the upgraded airframes: finer art, smooth sampling
    shipSource.scaleMode = 'linear';
    this.ship = Object.fromEntries(Object.entries(ships.frames).map(([k, f]) => [k, new Texture({ source: shipSource, frame: new Rectangle(f.x, f.y, f.w, f.h) })]));
    const bosses = buildBosses(), bossSource = Texture.from(bosses.canvas).source;   // bosses and mid-bosses: pictures of their own
    bossSource.scaleMode = 'nearest';
    this.bossFrames = bosses.frames; this.bossInfo = bosses.info;
    this.bossTex = Object.fromEntries(Object.entries(bosses.frames).map(([k, f]) => [k, new Texture({ source: bossSource, frame: new Rectangle(f.x, f.y, f.w, f.h) })]));
    const bossWhite = whitened(bosses.canvas);
    this.bossTexW = Object.fromEntries(Object.entries(bosses.frames).map(([k, f]) => [k, new Texture({ source: bossWhite, frame: new Rectangle(f.x, f.y, f.w, f.h) })]));
    this.bossFlashAt = -9;
    this.form = 0;                                          // which airframe is showing (0 = the plain one)
    this.ground = new Ground(app.renderer);
    this.world = new Container();                           // the fixed 720 x 1280 play field
    // legs five and six are painted grounds: two tiling layers, the second fading in while the chapter changes. They
    // scroll exactly as the shader ground would, so what stands on the ground (bomb shadows, rifts) stays put on it.
    // Until a leg's pictures have loaded, the shader's own ground for that leg shows.
    this.paintedLayer = new Container();
    this.paintedTiles = [0, 1].map(() => this.paintedLayer.addChild(new TilingSprite({ texture: Texture.EMPTY, width: 8, height: 8 })));
    this.paintedTex = {};
    for (const [leg, P] of Object.entries(PAINTED)) Assets.load(P.urls).then(t => { this.paintedTex[leg] = P.urls.map(u => t[u]); }).catch(() => {});
    app.stage.addChild(this.ground.view, this.paintedLayer, this.world);
    const layer = () => new Pool(this.world.addChild(new Container()), this.tex.dot);
    // back to front; enemy bullets are above everything that could hide them
    this.shadows = layer(); this.trail = layer(); this.shots = layer(); this.enemies = layer(); this.player = layer(); this.fx = layer(); this.glow = layer(); this.bullets = layer();
    this.glow.layer.blendMode = 'add';                      // light that adds up: the plasma's halo (one extra draw call, only while something glows)
    this.soft = softTextures();                             // smooth light for the beams and shots (linear sampling, batched with the sheet)
    this.shotKind = new WeakMap();                          // shot -> 0 plain, 1 spread, 2 wingman, 3 heavy (render only)
    this.live = [];                                        // plasma bolts in flight: { tx, ty, side, t, seed }
    this.particles = [];
    this.speed = FEEL.scroll.idle; this.rush = 0; this.windT = 0;
    this.bank = 0; this.contrailT = 0; this.flash = new Map(); this.bossPulse = 0; this.time = 0;
    this.scale = 1; this.ox = 0; this.oy = 0;
    this.look = 0;                                          // which chapter's ground is showing (eases between chapters)
    this.shieldUp = 0; this.hadBarrier = 0;                 // seconds since the barrier last came up (for its pop); charges seen last frame
    this.waves = Array.from({ length: WAVE_FRAMES }, (_, j) => this.tex[`wave${j}`]);
    this.discharge = 0;                                     // seconds left of the flash after the plasma goes off
    this.warns = [];                                        // marks at the top of the screen for obstacles about to enter
    this.gapMark = null; this.swapMark = null; this.eyesNext = 0; this.eyesT = 0;   // leg two's marks (see markGap ...)
  }

  /** Fit the play field into the screen; returns its rectangle in CSS px (for the DOM frame). */
  layout() {
    const w = this.app.screen.width, h = this.app.screen.height, s = Math.min(w / WORLD_W, h / WORLD_H);
    this.scale = s; this.ox = Math.round((w - WORLD_W * s) / 2); this.oy = Math.round((h - WORLD_H * s) / 2);
    this.world.scale.set(s); this.world.position.set(this.ox, this.oy);
    this.ground.resize(w, h, s);
    return { x: this.ox, y: this.oy, w: WORLD_W * s, h: WORLD_H * s };
  }
  /** A painted ground (legs five and six): the chapter showing (and the next fading in), scrolled with the shader
   *  ground, centred on the field and sliding with the view as far as the leg allows. leg 0 = none (the shader shows). */
  paintGround(leg, view = 0) {
    const P = PAINTED[leg], tex = P && this.paintedTex[leg];
    this.paintedLayer.visible = !!tex; this.ground.view.visible = !tex;
    if (!tex) return;
    const w = this.app.screen.width, h = this.app.screen.height, k = (this.scale * P.span) / tex[0].width;
    const x = this.ox + (720 - P.span) / 2 * this.scale - view * P.follow * this.scale, y = this.oy + this.ground.scroll * PIXEL * this.scale;
    const base = Math.max(0, Math.min(3, Math.floor(this.look))), f = Math.min(1, this.look - base);
    this.paintedTiles.forEach((t, i) => {
      t.texture = tex[Math.min(3, base + i)]; t.width = w; t.height = h; t.tileScale.set(k); t.tilePosition.set(x, y);
      t.alpha = i === 0 ? 1 : f; t.visible = i === 0 || f > 0.01;
    });
  }

  toWorld(cssX, cssY) { return { x: (cssX - this.ox) / this.scale, y: (cssY - this.oy) / this.scale }; }

  // Soft shapes for every attack's warning and its live area: no flat boxes, no drawn outlines. A lane's half-bright
  // edge is the shape's real edge (what hurts), so softening never changes what the player reads as safe.
  /** a soft lane centred at (cx, cy): w across, h along, turned by rot (0 = along y) */
  srect(pool, cx, cy, w, h, alpha, tint, rot = 0) { pool.draw(this.soft.lane, cx, cy, w / 0.75 / 64, h / 256, alpha, tint, rot); }
  /** a soft band from (x0, y0) to (x1, y1), w across */
  sbar(pool, x0, y0, x1, y1, w, alpha, tint) { const dx = x1 - x0, dy = y1 - y0; this.srect(pool, (x0 + x1) / 2, (y0 + y1) / 2, w, Math.hypot(dx, dy), alpha, tint, Math.atan2(dy, dx) - Math.PI / 2); }
  /** a glowing core (additive), drawn only with effects on */
  score(cx, cy, w, h, alpha, tint, rot = 0) { if (FEEL.enabled) this.glow.draw(this.soft.rod, cx, cy, w / 64, h / 256, alpha, tint, rot); }

  /**
   * A beam as moving light, not a flat bar with drawn edges: a soft column (full across the width that hurts, falling off
   * beyond it; bright where it leaves its source, thinner down the middle, pooling where it lands), a white-hot core,
   * glowing caps at both ends, motes drifting down it and fast streaks raining through. The warning is the same column,
   * faint and narrow, widening as it fills, with motes rising toward the source. Motion comes from the render clock and
   * the column's x, so nothing here reaches the sim. `on` = live; k = warning progress 0..1; fade = 0..1 as it dies.
   */
  beamFx(bx, top, h, P, on, k, fade, seed) {
    const S = this.soft, F = FEEL.beam, t = this.time, cy = top + h / 2, W = BEAM_W, s = (seed / ONE) * 0.137;
    const body = (w, a, tint) => this.fx.draw(S.column, bx, cy, (w * 2.5) / 64, h / 256, a, tint);
    if (!on) {
      body(W * (0.3 + 0.7 * k), (F.warn[0] + (F.warn[1] - F.warn[0]) * k) * 0.75, P.warn);
      if (!FEEL.enabled) return;
      const n = Math.round(F.motes * (0.3 + 0.7 * k) * 0.6);
      for (let i = 0; i < n; i++) {
        const sp = 90 + (noise(i, s, 11) + 0.5) * 120, y = top + h - (((t * sp + (noise(i, s, 12) + 0.5) * h) % h + h) % h);
        this.glow.draw(S.glow, bx + noise(i, s, 13) * W * 1.4 * k, y, 5 / 64, 5 / 64, (0.4 + 0.5 * k) * (0.5 + 0.5 * Math.sin(t * 7 + i * 1.9)), P.mote);
      }
      return;
    }
    body(W, F.on * fade, P.tint);
    if (!FEEL.enabled) { this.fx.draw(S.haze, bx, cy, (W * 0.8) / 64, h / 8, 0.7 * fade, 0xffffff); return; }
    this.glow.draw(S.haze, bx, cy, (W * 6) / 64, h / 8, F.halo * fade, P.tint);
    this.glow.draw(S.column, bx, cy, (W * 2.5) / 64, h / 256, F.fill * fade, P.tint);
    this.glow.draw(S.column, bx, cy, (W * 1.1) / 64, h / 256, F.core * fade, P.core);
    for (const [y, big] of [[top, 1], [top + h, 1.25]]) {
      this.glow.draw(S.glow, bx, y, (W * 3.4 * big) / 64, (26 * big) / 64, 0.85 * fade, P.tint);
      this.glow.draw(S.glow, bx, y, (W * 1.8 * big) / 64, (10 * big) / 64, fade, P.core);
    }
    for (let i = 0; i < F.motes; i++) {
      const sp = 160 + (noise(i, s, 1) + 0.5) * 260, y = top + (((t * sp + (noise(i, s, 2) + 0.5) * h) % h + h) % h);
      const tw = 0.5 + 0.5 * Math.sin(t * 9 + i * 1.7), r = 5 + 7 * (noise(i, s, 4) + 0.5);
      this.glow.draw(S.glow, bx + noise(i, s, 3) * W * 1.7, y, r / 64, r / 64, 0.9 * tw * fade, i % 3 ? P.mote : 0xffffff);
    }
    for (let i = 0; i < F.streaks; i++) {
      const sp = 900 + (noise(i, s, 5) + 0.5) * 700, len = 36 + (noise(i, s, 6) + 0.5) * 70;
      const y = top + (((t * sp + (noise(i, s, 7) + 0.5) * h) % h + h) % h);
      this.glow.draw(S.haze, bx + noise(i, s, 8) * W * 1.5, y, 3 / 64, len / 8, 0.6 * fade, P.core);
    }
  }

  // ---------- effects (called from sim events) ----------
  emit(p) { if (this.particles.length >= FEEL.particles.max) this.particles.shift(); this.particles.push({ t: 0, vx: 0, vy: 0, s0: PIXEL, s1: PIXEL, a0: 1, tint: 0xffffff, ...p }); }
  sparks(x, y, n = FEEL.spark.n, speed = FEEL.spark.speed, life = FEEL.spark.life, tint = 0xfff1c9) {
    if (!FEEL.enabled) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2), v = speed * rnd(0.4, 1); this.emit({ tex: this.tex.spark, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * rnd(0.6, 1), s0: PIXEL * 1.5, s1: PIXEL * 0.5, tint }); }
  }
  explode(x, y, big = false) {
    const E = FEEL.explode, lite = FEEL.enabled ? 1 : 0.34;
    const puffs = Math.ceil((big ? E.bossPuffs : E.puffs) * lite), sparks = Math.ceil((big ? E.bossSparks : E.sparks) * lite), spread = big ? 90 : 14;
    for (let i = 0; i < puffs; i++) {
      const a = rnd(0, Math.PI * 2), v = E.speed * rnd(0.1, 0.5) * (big ? 1.6 : 1);
      this.emit({ tex: this.tex.puff, x: x + rnd(-spread, spread), y: y + rnd(-spread, spread), vx: Math.cos(a) * v, vy: Math.sin(a) * v + 60, life: E.life * rnd(0.7, 1.3) * (big ? 1.8 : 1), s0: PIXEL * rnd(1.2, 2.2) * (big ? 1.8 : 1), s1: PIXEL * 0.3, tint: [0xffe9b0, 0xffb347, 0xe2574c, 0x6b5a78][i % 4], a0: 0.95 });
    }
    this.sparks(x, y, sparks, E.speed * (big ? 1.7 : 1), E.life, 0xfff1c9);
    // an expanding ring instead of a distortion filter (0 extra passes); in low effects it is a short static ring
    const life = big ? E.bossRing : E.ring, to = PIXEL * (big ? E.bossRingScale : E.ringScale) / 3;
    this.wave(x, y, big ? 3 : 1, 0xfff1c9, FEEL.enabled ? life : life / 2);
  }
  graze(x, y) { this.sparks(x, y, FEEL.graze.n, FEEL.graze.speed, FEEL.graze.life, FEEL.graze.tint); }
  muzzle(sim) {
    if (!FEEL.enabled) return;
    const x = sim.px / ONE, y = sim.py / ONE - 34, k = FEEL.shot.muzzle[sim.gear[RAPID]], hot = sim.gear[HEAVY] > 0;
    for (const dx of [-14, 14]) this.emit({ tex: this.tex.puff, x: x + dx, y, life: FEEL.muzzle.life, s0: PIXEL * FEEL.muzzle.size * k, s1: PIXEL * 0.6, tint: hot ? 0xffe2a8 : 0xcffaff, a0: 0.9 });
  }
  hitFlash(sim, x, y) {                                     // whiten the enemy nearest to where the shot landed
    let best = null, bd = Infinity;
    for (const e of sim.enemies) { const dx = e.x / ONE - x, dy = e.y / ONE - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = e; } }
    // a boss under steady fire would never stop flashing: it blinks at most every FEEL.boss.flashEvery seconds
    if (best && isBoss(best.type)) { if (this.time - this.bossFlashAt >= FEEL.boss.flashEvery) { this.bossFlashAt = this.time; this.flash.set(best.id, FEEL.enemyFlash); } }
    else if (best) this.flash.set(best.id, FEEL.enemyFlash);
    this.sparks(x, y);
  }
  pulseBoss() { this.bossPulse = FEEL.bossPulse.dur; }
  /** The ring that shows how far a choice (or the burst card) cleared the bullets: `r` world px. */
  /** A shock ring as pixel frames: it jumps out, slows, thins and breaks up. `k` = whole-number scale (1 = about 78 px radius). */
  /** Leg five: the ship breaks into light and gathers again as a soul (after the sun, before the black hole). */
  soulMorph(x, y) { this.wave(x, y, 2, FEEL.l5.soul); this.wave(x, y, 3.5, 0xffffff); this.shards(x, y, 16 * PIXEL, [0x9ff4ff, 0xc7f9ff, 0xffffff], 18); }
  wave(x, y, k = 1, tint = 0xffffff, life = FEEL.vfx.wave) { this.emit({ frames: this.waves, x, y, life, s0: PIXEL * k, a0: 1, tint }); }
  /** Pieces of a rim flying out from a ring of radius r: fast at first, slowed by drag, then gone at once (no fade). */
  shards(x, y, r, tints, n = FEEL.vfx.shards) {
    const V = FEEL.vfx, bits = [this.tex.bitA, this.tex.bitB, this.tex.bitC];
    if (!FEEL.enabled) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.2, 0.2), v = rnd(V.shardSpeed[0], V.shardSpeed[1]);
      this.emit({ tex: bits[i % 3], x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: V.shardDrag, life: rnd(V.shardLife[0], V.shardLife[1]), s0: PIXEL, s1: PIXEL, a0: 1, tint: tints[i % tints.length], steady: true, rot: a });
    }
  }
  clearRing(x, y, r) { this.wave(x, y, Math.max(1, Math.round(r / (26 * PIXEL))), 0x8ff6ff, FEEL.pick.clearLife); }
  /** The barrier took a hit: an impact frame, then it shatters. */
  shieldBreak(x, y) { this.wave(x, y, 1, 0xe9ffd8); this.shards(x, y, 13 * PIXEL, VFX_RAMPS.G.slice(1)); }
  /** The plasma cannon going off (the hit already happened in the sim; this is its picture): one live bolt per target,
   *  redrawn every frame by bolts() below. */
  laser(x, y, targets) {
    const P = FEEL.plasma;
    this.discharge = P.flash;
    targets.forEach(([tx, ty], i) => {
      this.live.push({ tx, ty, side: i % 2 ? -1 : 1, t: 0, seed: rnd(0, 100) });
      this.sparks(tx, ty, P.burst, FEEL.spark.speed, FEEL.spark.life, P.tint);
    });
  }
  /** Draw the bolts: a curve from the nose to the target that two strands wind around, each strand jittering like
   *  lightning; it shoots out, holds while knots of light run along it, then lets go of the ship and is drawn in. */
  bolts(px, py, dt) {
    const P = FEEL.plasma, T = this.tex, lite = !FEEL.enabled, N = lite ? P.segs >> 1 : P.segs, x0 = px, y0 = py - P.nose, frame = Math.floor(this.time * P.flicker);
    const seg = (pool, ax, ay, bx, by, w, alpha, tint) => pool.draw(this.soft.rod, (ax + bx) / 2, (ay + by) / 2, (w * 2.2) / 64, (Math.hypot(bx - ax, by - ay) * 1.3) / 256, alpha, tint, Math.atan2(by - ay, bx - ax) - Math.PI / 2);
    for (let n = this.live.length - 1; n >= 0; n--) {
      const b = this.live[n];
      b.t += dt;
      if (b.t >= P.life) { this.live.splice(n, 1); continue; }
      const dx = b.tx - x0, dy = b.ty - y0, dist = Math.hypot(dx, dy) || 1, side = b.side * (dx >= 0 ? 1 : -1);
      const cx = x0 + dx / 2 - (dy / dist) * dist * P.bend * side, cy = y0 + dy / 2 + (dx / dist) * dist * P.bend * side;
      const head = Math.min(1, b.t / P.reach), tail = Math.max(0, (b.t - P.hold) / (P.life - P.hold)), fade = 1 - 0.5 * tail;
      const at = (u, strand, i) => {                          // a point on strand `strand` (-1 = the bare curve)
        const v = 1 - u, bx = v * v * x0 + 2 * v * u * cx + u * u * b.tx, by = v * v * y0 + 2 * v * u * cy + u * u * b.ty;
        if (strand < 0) return [bx, by];
        const tx = 2 * v * (cx - x0) + 2 * u * (b.tx - cx), ty = 2 * v * (cy - y0) + 2 * u * (b.ty - cy), tl = Math.hypot(tx, ty) || 1;
        const off = Math.sin(Math.PI * u) * (P.twist * Math.sin(u * P.waves * 2 * Math.PI - this.time * P.speed + strand * Math.PI + b.seed) + (lite ? 0 : P.jitter * noise(i, frame, strand + b.seed)));
        return [bx - (ty / tl) * off, by + (tx / tl) * off];
      };
      for (let strand = 0; strand < (lite ? 1 : 2); strand++) {
        let [ax, ay] = at(tail, strand, 0);
        for (let i = 1; i <= N; i++) {
          const u = tail + (head - tail) * i / N, [bx, by] = at(u, strand, i), w = (P.width[0] + (P.width[1] - P.width[0]) * u) * (0.8 + 0.5 * (noise(i, frame, 9 + strand) + 0.5));
          if (!lite) seg(this.glow, ax, ay, bx, by, w * P.glow, P.glowAlpha * fade, P.tint);
          seg(this.fx, ax, ay, bx, by, w, 0.9 * fade, P.tint);
          seg(this.fx, ax, ay, bx, by, w * P.core, fade, P.hot);
          ax = bx; ay = by;
        }
      }
      if (lite) continue;
      for (let k = 0; k < P.orbs; k++) {                      // knots of light running from the ship to the target
        const [ox, oy] = at(tail + (head - tail) * ((this.time * P.orbSpeed + k / P.orbs + b.seed) % 1), -1), s = PIXEL * 1.1;
        this.glow.draw(T.puff, ox, oy, s * 1.8, s * 1.8, 0.5 * fade, P.tint); this.glow.draw(T.puff, ox, oy, s, s, 0.9 * fade, P.hot);
      }
      const [hx, hy] = at(head, -1), beat = 1 + 0.3 * noise(frame, 3, b.seed);
      this.glow.draw(T.puff, hx, hy, PIXEL * 2.6 * beat, PIXEL * 2.6 * beat, 0.55 * fade, P.tint);
      this.glow.draw(T.puff, hx, hy, PIXEL * 1.2 * beat, PIXEL * 1.2 * beat, fade, P.hot);
      if (head >= 1) for (let i = 0; i < P.arcs; i++) {       // arcs crackling over the target, new ones every flicker
        const a = (noise(i, frame, b.seed) + 0.5) * Math.PI * 2, len = P.arcLen[0] + (noise(i, frame, 5) + 0.5) * (P.arcLen[1] - P.arcLen[0]), mx = hx + Math.cos(a) * len * 0.5 + noise(i, frame, 7) * 10, my = hy + Math.sin(a) * len * 0.5 + noise(i, frame, 8) * 10;
        seg(this.fx, hx, hy, mx, my, 3, 0.9 * fade, P.hot); seg(this.fx, mx, my, hx + Math.cos(a) * len, hy + Math.sin(a) * len, 2, 0.8 * fade, P.tint);
      }
    }
  }
  /** A boss went down: its bullets are gone from the sim; here they fade where they were. */
  fadeBullets(list, rays = []) { const F = FEEL.fade; for (const y of rays) this.emit({ tex: this.tex.dot, x: WORLD_W / 2, y, life: F.life, s0: WORLD_W, s1: WORLD_W, len: 6, a0: 0.7, tint: FEEL.ray.live }); for (const [x, y] of list) this.emit({ tex: this.tex.enemyShot, x, y, life: FEEL.enabled ? F.life : F.life / 3, s0: PIXEL, s1: PIXEL * F.shrink, a0: F.alpha }); }
  /** A boss's stage breaks: plates fly off all round its hull. */
  armorBreak(x, y, r) { this.explode(x, y, true); this.shards(x, y, r * 0.8, [0xdfe7ee, 0xffb347, 0x8797ae, 0xfff1c9], FEEL.boss.breakShards); this.wave(x, y, 2, 0xffe9b0, 0.4); }
  /** A mid-boss's shield goes: a ring and shards at its size. */
  midShieldBreak(x, y, r) { this.wave(x, y, Math.max(1, Math.round(r / (26 * PIXEL))), 0x8ff6ff); this.shards(x, y, r, VFX_RAMPS.C.slice(1), 16); }
  /** A shell layer cracking off (or the whole shell breaking under a heavy round). */
  /** Leg two: the ground attacks (announced faint and blinking, live bright), the apple, Argus's eyes, Nemesis's
   *  plates filling up, the lines a rammer or a gold arrow will take. All read from the sim. */
  drawLeg2(sim, T) {
    const L = sim.l2, F = FEEL.l2, now = sim.tick, blink = !FEEL.enabled || Math.floor(this.time / 0.09) % 2 === 0;
    const bar = (x0, y0, x1, y1, w, alpha, tint) => this.sbar(this.fx, x0, y0, x1, y1, w, alpha, tint);
    for (const z of L.zones) {
      const live = now >= z.from, a = live ? F.live : (blink ? F.warn * 1.7 : F.warn) * (0.5 + 0.5 * Math.min(1, 1 - (z.from - now) / 60));
      const x = z.x / ONE, y = z.y / ONE;
      if (z.k === 0) { this.srect(this.fx, x, y + z.len / 2, L2_PIPE_HALF * 2, z.len, a, F.pipe); if (live) this.score(x, y + z.len / 2, 14, z.len, 0.8, 0xffffff); }
      else if (z.k === 1) { this.srect(this.fx, WORLD_W / 2, y, L2_STRIPE_HALF * 2, WORLD_W + 80, a, F.stripe, Math.PI / 2); if (live) this.score(WORLD_W / 2, y, L2_STRIPE_HALF * 0.6, WORLD_W + 80, 0.5, 0xffffff, Math.PI / 2); }
      else if (z.k === 2) {                                   // a cone: its two edges, and the inside filled by fanned bars
        const half = (L2_CONE_HALF / 256) * Math.PI * 2, a0 = (z.a / 256) * Math.PI * 2, R = L2_CONE_REACH;
        for (let i = -3; i <= 3; i++) { const ang = a0 + (i / 3) * half * 0.86; bar(x, y, x + Math.cos(ang) * R, y + Math.sin(ang) * R, 70, a * 0.7, F.cone); }
        for (const d of [-1, 1]) bar(x, y, x + Math.cos(a0 + d * half) * R, y + Math.sin(a0 + d * half) * R, 3, F.edge, F.cone);
      } else { const k = (L2_RINGS_R * 2) / this.frames.ring.w; this.fx.draw(T.ring, x, y, k, k, live ? 1 : a * 2, F.circle); this.fx.draw(T.puff, x, y, k * 1.1, k * 1.1, a * 0.8, F.circle); }
    }
    if (L.apple) { const ap = L.apple, x = ap.x / ONE, y = ap.y / ONE, k = (FEEL.enabled ? 1 + 0.15 * Math.sin(this.time * 8) : 1) * 2.2; this.fx.draw(T.ring, x, y, k, k, ap.pw > 0 ? (blink ? 0.9 : 0.3) : 0.9, F.apple); if (ap.pw === 0) this.glow.draw(T.puff, x, y, 4, 4, 0.8, F.apple); }
    if (this.gapMark && this.gapMark.t > 0 && blink) { const g = this.gapMark; for (const d of [0, 1]) { this.srect(this.fx, g.x - 36 + d * g.w, 160, 6, 160, 0.8, F.gap); this.score(g.x - 36 + d * g.w, 160, 14, 160, 0.5, F.gap); } }
    if (this.swapMark && this.swapMark.t > 0 && blink) this.fx.draw(T.ring, this.swapMark.x, BOSS_Y, 9, 9, 0.6, F.swap);
    for (const e of sim.enemies) {
      const x = e.x / ONE, y = e.y / ONE;
      if (e.type === RAMMER && e.q === 0) this.srect(this.fx, x, (Math.max(0, y) + WORLD_H) / 2, 52, WORLD_H - Math.max(0, y), 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(this.time * 14)), F.line);
      else if (e.type === SHUTTER && e.q === 1 && e.qd <= L2_SHUT_WARN && blink) this.fx.draw(T.ring, x, y, 3.2, 3.2, 0.9, F.pipe);
      else if (e.type === TWINVEC && e.q === 1 && e.qd <= 24 && blink) this.fx.draw(T.ring, x, y, 3.4, 3.4, 0.8, FEEL.spit.gold);
      else if (e.type === ARGUS) for (let i = 0; i < L2_EYES; i++) {
        const open = L.eyes >> i & 1, next = this.eyesNext >> i & 1, ex = x + (i - (L2_EYES >> 1)) * L2_EYE_STEP;
        if (open) this.glow.draw(T.puff, ex, y + 10, 2.2, 2.2, 0.9, F.eye); else if (next && this.eyesT > 0 && blink) this.fx.draw(T.ring, ex, y + 10, 1.2, 1.2, 0.8, F.eye);
      } else if (e.type === NEMESIS && e.st === 0 && L.ret > 0) for (const d of [-1, 1]) { const k = 1 + 3 * (L.ret / L2_NEMESIS_CAP); this.glow.draw(T.puff, x + d * (L2_NEMESIS_ARMOUR[0] + L2_NEMESIS_ARMOUR[1]) / 2, y + 40, k, k * 2, 0.35 + 0.5 * (L.ret / L2_NEMESIS_CAP), F.plate); }
      else if (e.type === ENDYMION && e.q === 1 && blink) this.fx.draw(T.ring, x, y, 7, 7, 0.8, 0x9fd8ff);
    }
    // a gold arrow shows where it will turn and where it is going
    for (const b of sim.bullets) if (b.tt > 0) { const x = b.x / ONE, y = b.y / ONE, ty = y + (b.vy / ONE) * b.tt; bar(x, y, x, ty, 2, 0.5, FEEL.spit.gold); bar(x, ty, b.tx / ONE, b.ty / ONE, 1, 0.22, FEEL.spit.gold); this.fx.draw(T.dot, x, ty, 6, 6, 0.9, FEEL.spit.gold, Math.PI / 4); }
  }
  /** Leg three: circles (mortars, boulders, fire rain) and cones, faint then bright; the ship's past where an echo or
   *  Epimetheus or Janus aims; where Janus thinks it is going; Amalthea's shield; the pole; Prometheus's chains. */
  drawLeg3(sim, T) {
    const L = sim.l3, F = FEEL.l3, now = sim.tick, blink = !FEEL.enabled || Math.floor(this.time / 0.09) % 2 === 0;
    const bar = (x0, y0, x1, y1, w, alpha, tint) => this.sbar(this.fx, x0, y0, x1, y1, w, alpha, tint);
    for (const z of L.zones) {
      const live = now >= z.from, a = live ? 0.75 : (blink ? 0.4 : 0.24) * (0.5 + 0.5 * Math.min(1, 1 - (z.from - now) / 60)), x = z.x / ONE, y = z.y / ONE;
      if (z.k === 3) { const k = (z.r * 2) / this.frames.ring.w, tint = z.act === 2 ? F.mortar : F.rain; this.fx.draw(T.ring, x, y, k, k, live ? 1 : a * 2, tint); this.fx.draw(T.puff, x, y, k * 1.1, k * 1.1, a * 0.8, tint); }
      else {
        const half = (L3_CONE_HALF / 256) * Math.PI * 2, a0 = (z.a / 256) * Math.PI * 2, R = L3_CONE_REACH;
        for (let i = -3; i <= 3; i++) { const ang = a0 + (i / 3) * half * 0.86; bar(x, y, x + Math.cos(ang) * R, y + Math.sin(ang) * R, 70, a * 0.7, F.cone); }
        for (const d of [-1, 1]) bar(x, y, x + Math.cos(a0 + d * half) * R, y + Math.sin(a0 + d * half) * R, 3, 0.9, F.cone);
      }
    }
    const mark = ([x, y], tint) => { const X = x / ONE, Y = y / ONE; this.fx.draw(T.ring, X, Y, 2.2, 2.2, 0.8, tint); for (const [dx, dy] of [[1, 0], [0, 1]]) this.fx.draw(T.dot, X, Y, dx ? 26 : 2, dy ? 26 : 2, 0.7, tint); };
    let past = 0, ahead = false;
    for (const e of sim.enemies) {
      const x = e.x / ONE, y = e.y / ONE;
      if (e.type === ECHO) past = Math.max(past, L3_ECHO_LAG);
      else if (e.type === EPIMETHEUS) past = Math.max(past, L3_EPI_LAG);
      else if (e.type === JANUS) { past = Math.max(past, L3_JANUS_LAG); ahead = true; }
      else if (e.type === AMALTHEA && L.shieldDown === 0 && e.st < 2) { this.srect(this.fx, x, y + 70, 10, L3_SHIELD_HALF * 2, 0.75, F.shield, Math.PI / 2); this.glow.draw(T.puff, x, y + 70, 9, 3, 0.35, F.shield); }
      else if (e.type === PHOBOS) { const d = sim.enemies.find(o => o.type === DEIMOS && o.hp > 0); if (d) bar(x, y, d.x / ONE, d.y / ONE, 8, 0.85, F.pole); if (L.rage > 0 && blink) this.fx.draw(T.ring, x, y, 7, 7, 0.9, F.pole); }
      else if (e.type === PANDORA && L.opened > 0 && blink) this.fx.draw(T.ring, x, y, 7, 7, 0.9, FEEL.spit.shard);
      else if (e.type === PROMETHEUS && !L.freed) for (const o of sim.enemies) if (o.type === ANCHOR && o.hp > 0) bar(x, y, o.x / ONE, o.y / ONE, 5, 0.8, F.chain);
    }
    if (past) mark(pastPos(sim, past), F.past);
    if (ahead) mark(aheadPos(sim, L3_JANUS_AHEAD), F.ahead);
  }
  /** Leg four: stripes, rows and circles, faint then bright; the river of the Styx; the wand on the scout it will turn;
   *  the gap Triton (or Proteus) has shown; the side Charon's boat comes from; the heel; what is about to rise or turn. */
  drawLeg4(sim, T) {
    const L = sim.l4, F = FEEL.l4, now = sim.tick, blink = !FEEL.enabled || Math.floor(this.time / 0.09) % 2 === 0, TAU = Math.PI * 2;
    const bar = (x0, y0, x1, y1, w, alpha, tint) => this.sbar(this.fx, x0, y0, x1, y1, w, alpha, tint);
    for (const z of L.zones) {
      const live = now >= z.from, soon = Math.min(1, 1 - (z.from - now) / 60), a = live ? F.live : (blink ? F.warn * 1.6 : F.warn) * (0.5 + 0.5 * soon), x = z.x / ONE, y = z.y / ONE;
      if (z.k === 3) { const k = (z.r * 2) / this.frames.ring.w; this.fx.draw(T.ring, x, y, k, k, live ? 1 : a * 2, F.rain); this.fx.draw(T.puff, x, y, k * 1.1, k * 1.1, a * 0.8, F.rain); }
      else if (z.k === 1) { const tint = z.w < 100 ? F.bolt : F.lane; this.srect(this.fx, x, WORLD_H / 2, z.w, WORLD_H + 80, a, tint); if (live) this.score(x, WORLD_H / 2, z.w * 0.35, WORLD_H + 80, 0.6, 0xffffff); }
      else { this.srect(this.fx, WORLD_W / 2, y, z.w, WORLD_W + 80, a, F.row, Math.PI / 2); if (live) this.score(WORLD_W / 2, y, z.w * 0.35, WORLD_W + 80, 0.6, 0xffffff, Math.PI / 2); }
    }
    if (L.styx) for (let x = 0; x < WORLD_W; x += 12) {          // the river: always drawn, it is always there
      const y0 = riverY(sim, x) / ONE, y1 = riverY(sim, x + 12) / ONE;
      bar(x, y0, x + 12, y1, L4_RIVER_W, F.riverAlpha, F.river);
      bar(x, y0, x + 12, y1, 3, 0.8, F.riverGlint);
    }
    const ring = (x, y, k, alpha, tint) => this.fx.draw(T.ring, x, y, k, k, alpha, tint);
    for (const e of sim.enemies) {
      const x = e.x / ONE, y = e.y / ONE;
      if (e.type === METRONOME && e.q === 1) { const n = Math.min(3, Math.floor((e.qd % (4 * L4_BEAT)) / L4_BEAT)); for (let i = 0; i < 3; i++) this.fx.draw(T.dot, x + (i - 1) * 12, y - 30, 8, 8, i < n ? 1 : 0.25, i < n ? F.beat : 0x445566); }
      else if (e.type === SCOUT && e.qd >= L4_SCOUT_RIPEN - L4_SCOUT_WARN && blink) ring(x, y, 2.6, 0.9, F.charm);
      else if (e.type === HUSK && e.qd >= L4_HUSK_TICKS - L4_HUSK_WARN && blink) ring(x, y, 2.6, 0.9, F.rise);
      else if (e.type === BUOY && e.q === 1 && e.qd % L4_BUOY_PERIOD >= L4_BUOY_PERIOD - L4_BUOY_PULSE) ring(x, y, 2 + (e.qd % L4_BUOY_PERIOD - (L4_BUOY_PERIOD - L4_BUOY_PULSE)) / 6, 0.8, F.sonar);
      else if (e.type === HEEL && e.y > 0) { this.glow.draw(T.puff, x, y, 7, 7, 0.45, F.heel); ring(x, y, 3.6, blink ? 1 : 0.7, F.heel); }   // the one place Styx can be hurt: lit up on her dark hull
      else if ((e.type === CIRCE || e.type === PROTEUS) && L.charmLeft > 0) { const s = sim.enemies.find(o => o.id === L.charmId); if (s) { bar(x, y, s.x / ONE, s.y / ONE, 3, blink ? 0.9 : 0.5, F.charm); ring(s.x / ONE, s.y / ONE, 3, 0.9, F.charm); } }
      if ((e.type === TRITON || e.type === PROTEUS) && L.gapNext >= 0) for (let i = 0; i < L4_TRITON_GAP; i++) { const a = ((L.gapNext + i) / L4_TRITON_N) * TAU; ring(x + Math.cos(a) * 110, y + Math.sin(a) * 110, 1.4, blink ? 1 : 0.6, F.gap); }
      if (e.type === PROTEUS && L.formWait > 0 && blink) ring(x, y, 9, 0.8, F.morph);
    }
    if (L.ferryLeft > 0) { const left = L.ferrySide === 0, x = left ? 24 : WORLD_W - 24, d = left ? 1 : -1; for (let i = 0; i < 3; i++) bar(x + d * i * 14, L4_FERRY_Y - 10, x + d * (i * 14 + 10), L4_FERRY_Y, 4, blink ? 1 : 0.5, F.ferry), bar(x + d * i * 14, L4_FERRY_Y + 10, x + d * (i * 14 + 10), L4_FERRY_Y, 4, blink ? 1 : 0.5, F.ferry); }
  }
  /** Leg five: prominences, flares and their shade, stripes and threads, the turning cone, circles; the night and the
   *  stopped bullets' arrows; Hundun's eyes and the life gate. */
  drawLeg5(sim, T) {
    const L = sim.l5, F = FEEL.l5, now = sim.tick, blink = !FEEL.enabled || Math.floor(this.time / 0.09) % 2 === 0, TAU = Math.PI * 2;
    const bar = (x0, y0, x1, y1, w, alpha, tint) => this.sbar(this.fx, x0, y0, x1, y1, w, alpha, tint);
    // the shade pillars: always there in the photosphere, cool soft lanes (their half-bright edge is the pillar's edge)
    const SOFT = this.soft, FL = F.fl, laneW = L5_SHADE_W / 0.75 / 64;
    if (sim.chapter === 1) for (const s of L5_SHADE_X) this.fx.draw(SOFT.lane, s, 730, laneW, 1000 / 256, F.shadeAlpha, FL.cool);
    // the flare's light: in the gaps between the pillars, soft at the pillars' edges (drawn over x0..x1 of each gap)
    const gaps = (fn) => { let x0 = -80; for (const s of [...L5_SHADE_X, WORLD_W + 80 + L5_SHADE_W / 2]) { const x1 = s - L5_SHADE_W / 2; if (x1 > x0) fn((x0 + x1) / 2, x1 - x0); x0 = s + L5_SHADE_W / 2; } };
    const flash = Math.max(0, 1 - (this.time - (this.flareAt ?? -9)) / FL.after);   // the burst's afterglow, render time only
    if (flash > 0) {                                        // the burst: white-gold light floods the gaps, a bloom over everything, fading out
      gaps((cx, w) => { this.fx.draw(SOFT.lane, cx, 730, (w + L5_SHADE_W * 0.5) / 64, 1000 / 256, FL.burst * flash, F.flare); if (FEEL.enabled) this.glow.draw(SOFT.lane, cx, 730, (w + L5_SHADE_W * 0.5) / 64, 1000 / 256, FL.burst * flash, FL.hot); });
      if (FEEL.enabled) this.glow.draw(SOFT.glow, WORLD_W / 2, 200, 1400 / 64, 900 / 64, FL.bloom * flash, FL.hot);
    }
    for (const z of L.zones) {
      const live = now >= z.from, soon = Math.min(1, 1 - (z.from - now) / 60), a = live ? F.live : (blink ? F.warn * 1.6 : F.warn) * (0.5 + 0.5 * soon), x = z.x / ONE, y = z.y / ONE;
      if (z.k === 1) { const k = (z.r * 2) / this.frames.ring.w; this.fx.draw(T.ring, x, y, k, k, live ? 1 : a * 2, F.rain); this.fx.draw(T.puff, x, y, k * 1.1, k * 1.1, a * 0.8, F.rain); }
      else if (z.k === 2) {                                   // a band: a stripe (wide) or a thread (narrow), across the whole screen
        const ang = (z.a / 256) * TAU, L2 = 1600, dx = Math.cos(ang) * L2, dy = Math.sin(ang) * L2, tint = z.w < 40 ? F.thread : F.stripe;
        if (z.w < 40 && !live) { for (let i = -20; i <= 20; i += 2) bar(x + dx * i / 20, y + dy * i / 20, x + dx * (i + 1) / 20, y + dy * (i + 1) / 20, 3, blink ? 1 : 0.6, tint); }   // a thread: dashed while announced
        else { bar(x - dx, y - dy, x + dx, y + dy, z.w, a, tint); if (live) bar(x - dx, y - dy, x + dx, y + dy, 3, 1, 0xffffff); }
      } else if (z.k === 3) {                                 // a prominence: a soft arc of plasma (glow, body, white-hot core) that flickers, sparks along it; announced as a faint breathing dashed arc
        const P = F.pr, n = 96, seg = (TAU * z.r) / n, br = 0.5 + 0.5 * Math.sin(this.time * P.rate);
        for (let i = 0; i < n; i++) {
          const a0 = ((i + 0.5) / n) * TAU, cx = x + Math.cos(a0) * z.r, cy = y + Math.sin(a0) * z.r, rot = a0;   // the rod lies along the arc's tangent
          if (cx < -40 || cx > WORLD_W + 40 || cy < -40 || cy > WORLD_H + 40) continue;
          if (live) {
            const fl = 1 + P.flicker * noise(i, Math.floor(this.time * 18), z.r);
            if (FEEL.enabled) this.glow.draw(SOFT.glow, cx, cy, (z.w * P.glowW) / 64, (seg * 2.4) / 64, P.glowA * fl, F.prom, rot);
            this.fx.draw(SOFT.rod, cx, cy, (z.w / 0.7) / 64, (seg * 1.3) / 256, 0.9, P.body, rot);
            this.glow.draw(SOFT.rod, cx, cy, (z.w * 0.4) / 64, (seg * 1.3) / 256, 0.9 * fl, P.core, rot);
          } else if (i % 2 === 0) this.fx.draw(SOFT.rod, cx, cy, P.warnW / 64, seg / 256, (a * 1.4) * (0.6 + 0.4 * br), F.prom, rot);
        }
        if (live && FEEL.enabled) for (let i = 0; i < P.sparks; i++) {   // sparks drifting off the arc
          const ph = (this.time * P.sparkRate + i / P.sparks) % 1, a0 = ((i * 0.618 + Math.floor(this.time * P.sparkRate + i / P.sparks) * 0.37) % 1) * TAU, r = z.r + (ph - 0.3) * z.w * 2;
          const sx = x + Math.cos(a0) * r, sy = y + Math.sin(a0) * r;
          if (sx > -20 && sx < WORLD_W + 20 && sy > -20 && sy < WORLD_H + 20) this.glow.draw(SOFT.glow, sx, sy, 10 / 64, 10 / 64, Math.sin(ph * Math.PI), P.core);
        }
      } else if (z.k === 4) {                                 // a flare: counting down, the shade pillars light up; on its tick, a burst everywhere but under them
        if (!live) {                                         // the glare builds where it will burn; the pillars cool and breathe; light rains in the gaps
          const k = 1 - (z.from - now) / L5_FLARE_WARN, br = 0.5 + 0.5 * Math.sin(this.time * (FL.rate[0] + (FL.rate[1] - FL.rate[0]) * k));
          gaps((cx, w) => {
            this.fx.draw(SOFT.lane, cx, 730, (w + L5_SHADE_W * 0.5) / 64, 1000 / 256, FL.glare[0] + (FL.glare[1] - FL.glare[0]) * k * (0.75 + 0.25 * br), F.flare);
            if (FEEL.enabled) for (let i = 0; i < FL.motes; i++) { const ph = (this.time * FL.moteRate + i / FL.motes + cx * 0.01) % 1; this.glow.draw(SOFT.glow, cx + noise(i, cx, 3) * w * 0.8, 1230 - ph * 1000, 10 / 64, 18 / 64, 0.7 * k * Math.sin(ph * Math.PI), FL.hot); }
          });
          for (const s of L5_SHADE_X) { this.fx.draw(SOFT.lane, s, 730, laneW, 1000 / 256, 0.25 + 0.35 * k * (0.6 + 0.4 * br), FL.cool); if (FEEL.enabled) this.glow.draw(SOFT.rod, s, 730, (L5_SHADE_W * 0.5) / 64, 1000 / 256, 0.18 * k * br, FL.coolHot); }
        } else this.flareAt = this.time;
      } else if (z.k === 5) {                                 // the turning cone: its edge first, then the wedge where it points now
        const turn = ((z.a + Math.max(0, now - z.from)) / 256) * TAU, half = (z.w / 256) * TAU;
        if (!live) for (const d of [-1, 1]) bar(x, y, x + Math.cos(turn + d * half) * z.r, y + Math.sin(turn + d * half) * z.r, 3, blink ? 1 : 0.6, F.cone);
        else for (let i = -3; i <= 3; i++) { const g = turn + (i / 3) * half * 0.86; bar(x, y, x + Math.cos(g) * z.r, y + Math.sin(g) * z.r, 60, 0.5, F.cone); }
      }
    }
    if (L.night > 0) this.fx.draw(T.dot, WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0.35 * (1 - L.night / 45), F.night);
    if (L.stop > 0) { this.fx.draw(T.dot, WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0.3, F.night); for (const b of sim.bullets) if (b.nvx !== undefined) { const x = b.x / ONE, y = b.y / ONE, a = Math.atan2(b.nvy, b.nvx); bar(x, y, x + Math.cos(a) * 22, y + Math.sin(a) * 22, 2, 0.9, F.arrow); } }
    const h = sim.enemies.find(e => e.type === HUNDUN && e.hp > 0);
    if (h && L.hundun) {
      const t = h.t - h.aux, g = gateOf(L, L.volleys);
      for (let i = 0; i < L5_EYES; i++) {
        const [ex, ey] = eyeAt(t, i), name = i === g ? 'l5c_gate' : 'l5c_eye', f = this.bossTex[name], info = this.bossInfo[name];
        if (f) this.enemies.draw(f, ex / ONE, ey / ONE, info.px, info.px, 1); else this.fx.draw(T.ring, ex / ONE, ey / ONE, 2.4, 2.4, 1, i === g ? F.gate : F.eye);
        if (i === g) this.glow.draw(T.puff, ex / ONE, ey / ONE, 5, 5, blink ? 0.6 : 0.35, F.gate);
      }
    }
  }
  /** Leg six: what the place and its bosses are doing: lines and areas, announced faint, live bright. */
  drawLeg6(sim, T) {
    const L = sim.l6, F = FEEL.l6, TAU = Math.PI * 2;
    const blink = !FEEL.enabled || Math.floor(this.time / 0.09) % 2 === 0;
    /** A bar from (x0, y0) to (x1, y1), `w` px across. */
    const bar = (x0, y0, x1, y1, w, alpha, tint) => this.sbar(this.fx, x0, y0, x1, y1, w, alpha, tint);
    if (L.sweep) {                                            // the sweep: where it will start (faint), then the bar itself
      const a = (L.sweepA / 256) * TAU, x1 = L6_SWEEP_X + Math.cos(a) * L6_SWEEP_LEN, y1 = L6_SWEEP_Y + Math.sin(a) * L6_SWEEP_LEN, live = L.sweep === 2;
      bar(L6_SWEEP_X, L6_SWEEP_Y, x1, y1, L6_SWEEP_HALF * 2, live ? F.live : blink ? F.warn * 1.6 : F.warn, F.sweep);
      if (live) bar(L6_SWEEP_X, L6_SWEEP_Y, x1, y1, 4, 1, 0xffffff);
      const S = this.soft;
      this.glow.draw(S.glow, L6_SWEEP_X, L6_SWEEP_Y, 54 / 64, 54 / 64, 0.8, F.sweep);   // the pivot
      if (!live) this.fx.draw(S.ring, L6_SWEEP_X, L6_SWEEP_Y, (L6_SWEEP_LEN * 2 / 0.88) / 128, (L6_SWEEP_LEN * 2 / 0.88) / 128, 0.45, F.sweep);   // how far it reaches
      else if (FEEL.enabled) for (let i = 0; i < 6; i++) { const ph = (this.time * 3 + i / 6) % 1, r = L6_SWEEP_LEN * (0.55 + 0.45 * ph); this.glow.draw(S.glow, L6_SWEEP_X + Math.cos(a) * r + noise(i, 1, ph) * 20, L6_SWEEP_Y + Math.sin(a) * r + noise(i, 2, ph) * 20, 12 / 64, 12 / 64, 1 - ph, 0xffffff); }   // sparks off the swinging tail
    }
    for (const m of L.marks) bar(m.x0 / ONE, m.y0 / ONE, m.x1 / ONE, m.y1 / ONE, L6_CLAW_HALF * 2, m.pw > 0 ? (blink ? F.warn * 1.6 : F.warn) : F.live, F.claw);
    if (L.band) { const b = L.band, y0 = b.y0 / ONE, h = (b.y1 - b.y0) / ONE, fading = b.pw === 0 && b.bt < 30 && !blink; this.srect(this.fx, WORLD_W / 2, y0 + h / 2, h, WORLD_W + 80, (b.pw > 0 ? F.bandAlpha * 0.5 : F.bandAlpha) * 1.6 * (fading ? 0.4 : 1), F.band, Math.PI / 2); }
    const breathe = 0.5 + 0.5 * Math.sin(this.time * 14), SOFT = this.soft;   // soft lines, no hard bars: a steady pulse instead of a blink
    if (L.rifts) for (const x of [L.rifts.xl / ONE, L.rifts.xr / ONE]) { const live = L.rifts.pw === 0; this.fx.draw(SOFT.rod, x, 660, (live ? 30 : 16) / 64, 760 / 256, live ? 0.9 : 0.35 + 0.3 * breathe, F.rift); if (live && FEEL.enabled) this.glow.draw(SOFT.rod, x, 660, 10 / 64, 760 / 256, 0.6, 0xffffff); }
    if (L.well) {                                            // the gravity well: a violet field, accretion arcs turning in, a black core with a white-hot rim
      const w = L.well, x = w.x / ONE, y = w.y / ONE, on = w.pw === 0, S = this.soft, R = L6_WELL_R, rk = (R * 2 / 0.88) / 128;
      this.fx.draw(S.ring, x, y, rk, rk, on ? 0.6 : 0.25 + 0.3 * breathe, F.wellRim);   // how far it pulls
      if (FEEL.enabled) this.glow.draw(S.glow, x, y, (R * 2.2) / 64, (R * 2.2) / 64, on ? 0.45 : 0.15, F.wellField);
      if (on) {
        if (FEEL.enabled) for (let j = 0; j < 3; j++) {           // three arcs, each a run of soft pieces, spinning faster inward
          const r = 46 + j * 26, spin = this.time * (3.2 - j * 0.8) + j * 2.1;
          for (let i = 0; i < 10; i++) { const a0 = spin + i * 0.16; this.glow.draw(S.rod, x + Math.cos(a0) * r, y + Math.sin(a0) * r, 7 / 64, (r * 0.2) / 256, 0.85 * (1 - i / 12), F.wellRim, a0); }
        }
        const s = 64 + 8 * Math.sin(this.time * 9);
        this.fx.draw(S.glow, x, y, (s * 1.25) / 64, (s * 1.25) / 64, 0.95, F.well);   // the core
        this.fx.draw(S.ring, x, y, (s / 0.88) / 128 * 0.55, (s / 0.88) / 128 * 0.55, 1, 0xffffff);   // its event horizon
      }
    }
    for (const e of sim.enemies) {
      const x = e.x / ONE, y = e.y / ONE;
      if (e.type === ELASMO) { if (e.q === 0) this.fx.draw(T.ring, x, y, 3 + (e.t % 15) / 4, 3 + (e.t % 15) / 4, 0.7, F.neck); else if (e.q === 1) { this.srect(this.fx, x, y - L6_NECK_LEN / 2, L6_NECK_HALF * 2, L6_NECK_LEN, 0.85, F.neck); this.score(x, y - L6_NECK_LEN / 2, L6_NECK_HALF * 0.8, L6_NECK_LEN, 0.5, 0xffffff); } }
      else if ((e.type === PTERA || e.type === TRIKE || e.type === PACHY) && e.q === 1) {   // its dive or charge lane: soft-edged, breathing (its half-bright edge is the lane's edge)
        const w = e.type === PTERA ? 6 : e.type === TRIKE ? 68 : 48, a = 0.22 + 0.25 * breathe;
        if (e.type === PTERA) {   // a soft streak plus sparks running down it, so it reads as "it dives here", never as a crack in the ground
          this.fx.draw(SOFT.rod, x, (y + WORLD_H) / 2, 26 / 64, (WORLD_H - y) / 256, a, F.line);
          if (FEEL.enabled) for (let i = 0; i < 4; i++) { const ph = (this.time * 1.4 + i / 4) % 1; this.glow.draw(SOFT.glow, x, y + ph * (WORLD_H - y), 18 / 64, 30 / 64, 0.8 * Math.sin(ph * Math.PI), F.line); }
        }
        else this.fx.draw(SOFT.slab, x, (y + WORLD_H) / 2, w / 0.75 / 64, (WORLD_H - y) / 256, a, F.line);
      }
      else if (e.type === DILOPHO && e.t % 95 >= 95 - 24 && blink) this.fx.draw(T.ring, x, y, 3.4, 3.4, 0.8, FEEL.spit.venom);   // its frill opens before it spits
      else if (e.type === ORNI && e.q === 0 && blink) this.fx.draw(T.ring, x, y, 3, 3, 0.8, F.claw);
      else if (e.type === EUDI && e.q === 1) this.fx.draw(T.ring, x, y, 2.4, 2.4, blink ? 0.9 : 0.4, F.line);
    }
    // the wind: bars sliding across from the side it blows from, faint while it is only announced
    const w = sim.bossState ? null : windAt(clock(sim)), g = L.gust, dir = blowing(sim) || (g ? g.dir : w && (w.warn || w.blow) ? w.dir : 0);
    if (dir) {
      const live = blowing(sim) !== 0;
      for (let i = 0; i < 9; i++) { const y = 80 + i * 140, x = ((this.time * (live ? 520 : 160) * dir + i * 197) % (WORLD_W + 200) + (WORLD_W + 200)) % (WORLD_W + 200) - 100; this.srect(this.fx, x, y, 5, live ? 110 : 50, live ? F.windAlpha : F.windAlpha * 0.5, F.wind, Math.PI / 2); }
      this.fx.draw(this.soft.haze, dir > 0 ? 0 : WORLD_W, WORLD_H / 2, 56 / 64, WORLD_H / 8, live ? 0.5 : 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(this.time * 14)), F.wind);   // the side the wind comes from glows softly, no bar
    }
  }
  /** Leg six: a volcanic bomb lands. */
  bomb(x, y, r) { this.explode(x, y, true); this.wave(x, y, 2, FEEL.bomb.tint, 0.4); this.shards(x, y, r * 0.6, FEEL.obst.tints, FEEL.bomb.shards); }
  /** A heavy shot chips an obstacle; the last one breaks it apart. */
  obstHit(x, y) { this.shards(x, y, 4 * PIXEL, FEEL.obst.tints, FEEL.obst.chips); }
  obstBreak(x, y, r) { this.explode(x, y, false); this.shards(x, y, r, FEEL.obst.tints, FEEL.obst.burst); this.wave(x, y, 1, 0xffe9b0, 0.3); }
  /** A shot stopped by armour: a few chips of plate, nothing more. */
  clang(x, y) { this.shards(x, y, 3 * PIXEL, FEEL.clang.tints, FEEL.clang.shards); }
  shell(x, y, broke) { this.shards(x, y, 10 * PIXEL, VFX_RAMPS.C.slice(1), broke ? FEEL.shell.broke : FEEL.shell.crack >> 1); if (broke) this.wave(x, y, 1, 0x8ff6ff, 0.22); }
  warnObstacle(x, seconds) { this.warns.push({ x, t: seconds }); }
  /** Leg two: where Selene's gap will be; where the other twin will come; which of Argus's eyes open next. */
  markGap(x, w, seconds) { this.gapMark = { x, w, t: seconds }; }
  markSwap(x, seconds) { this.swapMark = { x, t: seconds }; }
  markEyes(mask, seconds) { this.eyesNext = mask; this.eyesT = seconds; }
  clearFx() { this.gapMark = null; this.swapMark = null; this.eyesNext = 0; this.eyesT = 0; this.form = 0; this.discharge = 0; this.live.length = 0; this.particles.length = 0; this.flash.clear(); this.bossPulse = 0; this.look = 0; this.warns.length = 0; }

  /**
   * Draw one frame.
   * @param sim     the live sim (read only)
   * @param dt      seconds of render time
   * @param frozen  true during a hit-stop: effects hold still, the sim's entities still move
   * @param flying  true while a match is being played (contrails, scrolling at full speed)
   * @param boosting true while a boss's supply is being chosen: the ground rushes by as in a boost
   */
  draw(sim, dt, frozen, flying, boosting = false) {
    const T = this.tex, A = FEEL.altitude, fxDt = frozen ? 0 : dt;
    this.time += dt;
    const px = sim.px / ONE, py = sim.py / ONE;

    // How fast the flight feels: set by the script section, pushed up by the chain, eased so it never jumps.
    // Purely a picture: the sim's enemies and bullets move exactly the same whatever this is.
    const S = FEEL.scroll;
    const sec = SCRIPT[sectionAt(clock(sim))];
    // leg six: the ground goes by at exactly the speed the sim moves what stands on it (ground px per second)
    const want = sim.l6 && flying && !(sec.boost || boosting) ? (L6_GROUND_VY * 60) / PIXEL : !flying ? S.idle : sec.boost || boosting ? S.boost : S.byChapter[sec.chapter] * (sec.boss ? S.boss : sec.safe ? S.safe : 1) + S.perChain * Math.min(sim.chain, S.chainCap);
    this.speed += (want - this.speed) * Math.min(1, dt * S.follow);
    this.rush = Math.max(0, Math.min(1, (this.speed - S.rushFrom) / (S.rushTo - S.rushFrom)));
    this.look = FEEL.enabled ? this.look + (sim.chapter - this.look) * Math.min(1, dt * FEEL.chapter.follow) : sim.chapter;
    const view = (px - WORLD_W / 2) * FEEL.parallax;          // leg six's ground carries what stands on it, so only its sky and near layer follow the view
    this.ground.update(fxDt, this.speed, sim.l6 ? 0 : view, !FEEL.enabled, this.rush, this.look, sim.l6 ? 1 : sim.l2 ? 2 : sim.l3 ? 3 : sim.l4 ? 4 : sim.l5 ? 5 : 0, view);
    this.paintGround(sim.l6 ? 6 : sim.l5 ? 5 : 0, view);
    for (const m of [this.gapMark, this.swapMark]) if (m) m.t -= fxDt;
    if (this.eyesT > 0) this.eyesT -= fxDt;

    // wind lines: more of them, and longer, the faster the flight
    if (FEEL.enabled && this.rush > FEEL.wind.minRush && (this.look < 2.5 || sim.l6)) {   // no wind above the atmosphere
      const W = FEEL.wind;
      this.windT += fxDt * W.perSecond * this.rush;
      while (this.windT >= 1) {
        this.windT -= 1;
        const len = rnd(W.len[0], W.len[1]) * (0.6 + 0.4 * this.rush), vy = rnd(W.speed[0], W.speed[1]);
        this.emit({ tex: T.dot, x: rnd(0, WORLD_W), y: -len, vy, life: (WORLD_H + 2 * len) / vy, s0: W.width, s1: W.width, len, a0: rnd(W.alpha[0], W.alpha[1]), tint: 0xfff3e6, trail: true, steady: true });
      }
    }

    // roll follows the steering with a short lag
    const target = flying ? sim.bank * FEEL.bank.frames : 0;
    this.bank += (target - this.bank) * Math.min(1, dt * FEEL.bank.follow);

    for (const [id, t] of this.flash) { if (t - dt <= 0) this.flash.delete(id); else this.flash.set(id, t - dt); }
    if (this.bossPulse > 0) this.bossPulse = Math.max(0, this.bossPulse - dt);
    if (this.discharge > 0) this.discharge = Math.max(0, this.discharge - fxDt);

    // contrails from the wing tips: puffs left behind that the ground carries away
    const alive = sim.shields > 0;
    if (flying && alive && FEEL.enabled) {
      this.contrailT += fxDt;
      while (this.contrailT >= FEEL.contrail.every) {
        this.contrailT -= FEEL.contrail.every;
        const wing = FEEL.contrail.wing * [1, 0.86, 0.68][Math.min(2, Math.round(Math.abs(this.bank)))];
        for (const side of [-1, 1]) this.emit({ tex: T.puff, x: px + side * wing, y: py + 22, vy: this.speed * PIXEL * FEEL.contrail.drift, life: FEEL.contrail.life * (1 + FEEL.contrail.rushLife * this.rush), s0: PIXEL * FEEL.contrail.size, s1: PIXEL * 0.15, a0: FEEL.contrail.alpha, trail: true });
      }
    }

    const pools = [this.shadows, this.trail, this.shots, this.enemies, this.player, this.fx, this.glow, this.bullets];
    for (const p of pools) p.begin();
    // obstacles: solid rock, drawn under the ships; a mark at the top of the screen before one enters
    for (const o of sim.obst) {
      const hurt = o.hp < OBST_HP[o.kind];                    // a heavy shot has hit it: the damaged picture (v10)
      const r = OBST_R[o.kind], tree = sim.l6 && o.kind === PEAK, name = tree ? 'l6c_tree' : (o.kind === PEAK ? 'peak' : 'meteor') + (hurt ? 'Hurt' : ''), k = (r * 2.1) / (tree ? this.bossFrames : this.frames)[name].w;   // leg six: the forest's trees
      this.shadows.draw(T.shadow, o.x / ONE + 14, o.y / ONE + 22, (r * 2) / 20, (r * 2) / 20, A.shadowAlpha);
      this.trail.draw((tree ? this.bossTex : T)[name], o.x / ONE, o.y / ONE, k, k, 1, tree && hurt ? 0xc8a070 : 0xffffff, o.kind === PEAK ? 0 : this.time * 1.5);
    }
    for (let i = this.warns.length - 1; i >= 0; i--) {
      const w = this.warns[i];
      w.t -= fxDt;
      if (w.t <= 0) { this.warns.splice(i, 1); continue; }
      if (Math.floor(this.time / FEEL.telegraph.blink) % 2 === 0 || !FEEL.enabled) this.fx.draw(T.gapMark, w.x, 26, PIXEL * 1.3, PIXEL * 1.3, FEEL.obstacleWarn, 0xff8a4a);
    }
    // drops: capsules that bob and pulse
    for (const d of sim.drops) {
      const D = FEEL.drop, s = PIXEL * (1 + (FEEL.enabled ? D.pulse * Math.sin(this.time * 6) : 0)), age = d.t | 0;
      // its last five seconds: it breathes, and each breath is fainter
      const left = age < DROP_FADE_FROM ? 1 : 1 - (age - DROP_FADE_FROM) / (DROP_LIFE - DROP_FADE_FROM);
      const a = age < DROP_FADE_FROM ? 1 : D.fadeMin + (1 - D.fadeMin) * left * (0.55 + 0.45 * Math.sin(this.time * D.fadeRate));
      if (FEEL.enabled) this.glow.draw(T.puff, d.x / ONE, d.y / ONE, s * D.halo, s * D.halo, D.haloAlpha * a, 0xfff1c9);
      this.trail.draw(T[DROP_FRAME[d.kind]], d.x / ONE, d.y / ONE, s, s, a);
    }
    // rays: a red band across the screen. Live: thick, white-hot core, crackling; dead: a thin thread that swells
    // again in the last ticks before it goes live, so the rhythm can be read ahead
    for (const r of sim.rays) {
      const R = FEEL.ray, y = r.y / ONE, ph = r.t % (RAY_ON + RAY_OFF), live = rayLive(r), frame = Math.floor(this.time * 30);
      if (live) {
        const beat = FEEL.enabled ? 1 + 0.15 * noise(frame, 3, y) : 1;
        if (FEEL.enabled) this.glow.draw(this.soft.haze, WORLD_W / 2, y, (RAY_H * R.glow) / 64, (WORLD_W + 80) / 8, R.glowAlpha, R.live, Math.PI / 2);
        this.srect(this.fx, WORLD_W / 2, y, RAY_H * 2 * beat, WORLD_W + 80, 0.9, R.live, Math.PI / 2);
        this.score(WORLD_W / 2, y, RAY_H * 0.9, WORLD_W + 80, 1, R.core, Math.PI / 2);
        if (FEEL.enabled) for (let i = 0; i < R.crackle; i++) { const x = (noise(i, frame, 21) + 0.5) * WORLD_W, s = 8 + (noise(i, frame, 23) + 0.5) * 14; this.glow.draw(this.soft.glow, x, y + noise(i, frame, 22) * RAY_H * 3, s / 64, s / 64, 0.85, R.core); }
      } else {
        const left = RAY_ON + RAY_OFF - ph, k = left < R.swell ? 1 - left / R.swell : 0;   // about to go live
        this.srect(this.fx, WORLD_W / 2, y, R.thread + 2 + k * RAY_H, WORLD_W + 80, R.deadAlpha + 0.4 * k, k > 0 ? R.live : R.dead, Math.PI / 2);
      }
    }
    // the storm's lightning: the same picture as a beam, from the top of the screen
    for (const k of sim.strikes) {
      const bx = k.x / ONE;
      if (k.pw > 0) this.beamFx(bx, 0, WORLD_H, FEEL.beam.storm, false, 1 - k.pw / BEAM_TELEGRAPH, 1, k.x);
      else this.beamFx(bx, 0, WORLD_H, FEEL.beam.storm, true, 1, Math.min(1, k.bt / 6), k.x);
    }
    const shadow = (x, y, alt, widthPx) => this.shadows.draw(T.shadow, x + alt * A.shadowX, y + alt, (widthPx / 20) * 0.9, (widthPx / 20) * 0.9, A.shadowAlpha);

    // side shots are turned to their heading and drawn a step fainter: the enemy's bullets stay the loudest thing
    // what a shot looks like follows the gear behind it: rapid fire changes the bolt, heavy rounds grow and run hotter,
    // piercing rounds drag a green tail, the spread's side shots get bigger. Enemy bullets never change.
    // Every shot is light now, drawn in the additive glow layer (no extra draw call; still under the enemy bullets) from smooth textures: the plain shot a blue comet, a heavy round an orange
    // fireball with embers falling off it, the wingmen's a small cyan orb. Wingman shots look like any other shot to the
    // sim; the first time one is seen it is told apart by where it started (beside the ship, not in front of it).
    const F = FEEL.shot, SOFT = this.soft, rapid = sim.gear[RAPID], heavy = sim.gear[HEAVY], spread = sim.gear[SPREAD], pierce = sim.gear[PIERCE];
    const sx = sim.px / ONE, comet = (x, y, w, len, a, tint, rot = 0, pool = this.glow) => {
      const off = len * (0.5 - SOFT.cometHead);
      pool.draw(SOFT.comet, x - Math.sin(rot) * off, y + Math.cos(rot) * off, w / 32, len / 128, a, tint, rot);
    };
    // light added over a bright cloud or the sun turns white and is lost: the main and heavy shots first lay a dark comet
    // of their own shape (normal blend, in the shots layer under the glow), so their light always sits on a dark edge
    const backing = (x, y, w, len) => { const B = F.back; comet(x, y + B.dy, w * B.w, len * B.len, B.alpha, B.tint, 0, this.shots); };
    for (const s of sim.shots) {
      const x = s.x / ONE, y = s.y / ONE;
      let kind = this.shotKind.get(s);
      if (kind === undefined) { kind = s.vx ? 1 : Math.abs(x - sx) > (WING_OFFSET + SHOT_OFFSET) / 2 ? 2 : s.dmg > 1 ? 3 : 0; this.shotKind.set(s, kind); }
      if (kind === 1) {                                     // a spread shot: a teal-green orb with a halo and a short tail along its heading
        const P = F.spreadOrb, r = P.r * F.sideScale[spread], rot = Math.atan2(s.vx, -s.vy), tw = 0.8 + 0.2 * Math.sin(this.time * 30 + x * 0.3);
        comet(x, y, r * 1.1, P.tail, 0.7, P.tint, rot);
        this.glow.draw(SOFT.glow, x, y, (r * P.halo) / 64, (r * P.halo) / 64, P.haloAlpha * tw * F.haloK, P.tint);
        this.glow.draw(SOFT.glow, x, y, (r * 2.2) / 64, (r * 2.2) / 64, 0.95 * tw * F.haloK, P.tint);
        this.glow.draw(SOFT.glow, x, y, (r * 1.0) / 64, (r * 1.0) / 64, 1, 0xffffff);
        continue;
      }
      if (kind === 2) {                                     // a wingman's shot: a thin gold needle
        const W = F.wing;
        backing(x, y, W.w, W.len);
        comet(x, y, W.w, W.len, 1, W.tint);
        comet(x, y, W.core, W.len * 0.7, 1, W.hot);
        if (FEEL.enabled) this.glow.draw(SOFT.glow, x, y, (W.w * 2.4) / 64, (W.w * 3.2) / 64, W.headGlow * F.haloK, W.tint);
        continue;
      }
      if (s.left > 0 && pierce) comet(x, y + 10, F.plain.w * 0.7, F.plain.len + F.pierceTail * pierce, F.pierceAlpha, F.pierceTint);
      if (kind === 3) {                                     // a heavy round: the same fireball at every level; each level adds halo and a longer trail
        const P = F.heavy, hk = P.haloByLv[heavy], tk = P.trailByLv[heavy];
        backing(x, y, P.w, P.len * tk);
        comet(x, y, P.w, P.len * tk, 1, P.tint);
        comet(x, y, P.core, P.len * 0.6 * tk, 1, P.hot);
        this.glow.draw(SOFT.glow, x, y, (P.w * P.halo * hk) / 64, (P.w * P.halo * hk) / 64, 0.55 * F.haloK, P.tint);
        if (FEEL.enabled) for (let i = 0; i < P.embers; i++) {
          const ph = (this.time * P.emberRate + i / P.embers + (x % 7) * 0.13) % 1;
          this.glow.draw(SOFT.glow, x + noise(i, Math.floor(this.time * P.emberRate + i / P.embers), x) * P.w, y + 10 + ph * P.len * tk, (P.ember * (1 - ph)) / 64, (P.ember * (1 - ph)) / 64, 0.9 * (1 - ph), P.emberTint);
        }
        continue;
      }
      const P = F.plain, len = P.len * (1 + P.rapidLen * rapid), tint = P.tintByLv[rapid];   // the plain shot: a comet, longer and whiter with rapid fire
      backing(x, y, P.w, len);
      comet(x, y, P.w, len, 1, tint);
      comet(x, y, P.core, len * 0.62, 1, 0xffffff);
      if (FEEL.enabled) this.glow.draw(SOFT.glow, x, y, (P.w * 1.8) / 64, (P.w * 1.8) / 64, P.headGlow * F.haloK, tint);
    }
    if (sim.l6) this.drawLeg6(sim, T);
    if (sim.l2) this.drawLeg2(sim, T);
    if (sim.l3) this.drawLeg3(sim, T);
    if (sim.l4) this.drawLeg4(sim, T);
    if (sim.l5) this.drawLeg5(sim, T);
    // leg six: volcanic bombs. The shadow grows through the warning to the size of what it will hit.
    if (sim.l6) for (const b of sim.l6.bombs) {
      const B = FEEL.bomb, S = this.soft, k = b.pw > 0 ? 1 - b.pw / L6_BOMB_WARN : 1, x = b.x / ONE, y = b.y / ONE, d = L6_BOMB_R * 2 * (0.3 + 0.7 * k);
      this.shadows.draw(S.glow, x, y, (d * 1.3) / 64, (d * 1.0) / 64, B.shadow[0] + (B.shadow[1] - B.shadow[0]) * k, 0x000000);   // the shadow grows as it comes
      if (b.pw > 0) {
        // the edge of what it will hit: a soft ring, brighter as it comes, breathing fast at the end
        const rk = (L6_BOMB_R * 2 / 0.88) / 128, late = b.pw < B.ringFrom, br = 0.5 + 0.5 * Math.sin(this.time * 30);
        this.fx.draw(S.ring, x, y, rk, rk, late ? 0.7 + 0.3 * br : B.ring[0] + (B.ring[1] - B.ring[0]) * k, late ? 0xffffff : B.tint);
        if (FEEL.enabled) this.glow.draw(S.glow, x, y, (L6_BOMB_R * 2) / 64, (L6_BOMB_R * 2) / 64, 0.18 * k, B.tint);
        // the bomb itself, falling in an arc from high up the screen onto the mark, its fire trailing back up the arc
        const h = (1 - k) * B.fall, fx = x + (1 - k) * B.drift, fy = y - h - Math.sin(k * Math.PI) * B.lift, a = Math.atan2(B.drift, B.fall + B.lift);
        if (FEEL.enabled) for (let i = 1; i <= 5; i++) { const q = Math.max(0, k - i * 0.035), tx = x + (1 - q) * B.drift, ty = y - (1 - q) * B.fall - Math.sin(q * Math.PI) * B.lift; this.glow.draw(S.glow, tx, ty, (40 - i * 5) / 64, (40 - i * 5) / 64, 0.75 - i * 0.12, B.tint); }
        this.glow.draw(S.glow, fx, fy, 70 / 64, 70 / 64, 0.8, B.tint);
        this.fx.draw(S.glow, fx, fy, 34 / 64, 34 / 64, 1, 0xfff0b0, a);
      }
    }
    const blinkOn = !FEEL.enabled || Math.floor(this.time / FEEL.telegraph.blink) % 2 === 0;

    for (const e of sim.enemies) {
      let kind = KIND_FRAME[e.type] ?? L6_FRAME.get(e.type) ?? L2_FRAME.get(e.type) ?? L3_FRAME.get(e.type) ?? L4_FRAME.get(e.type) ?? L5_FRAME.get(e.type) ?? 'drone';
      if (e.type === TWINS) kind += sim.l2.side ? 'e' : 'm';                                 // the evening star or the morning star
      else if (e.type === SHUTTER && e.q === 2) kind = 'l2c_open';
      let name = e.st ? `${kind}_${e.st}` : kind;
      if (!this.bossFrames[name] && !this.frames[name]) { kind = isBoss(e.type) ? 'mid1' : 'drone'; name = kind; }   // no picture yet: a stand-in
      const big = isBoss(e.type), sheet = !!this.bossFrames[name] && (big || kind.startsWith('l6c_') || kind.startsWith('l2c_') || kind.startsWith('l3') || kind.startsWith('l4') || kind.startsWith('l5')), f = (sheet ? this.bossFrames : this.frames)[name], x = e.x / ONE, y = e.y / ONE;   // a boss has a frame per stage
      // a boss's picture hangs from its core (the hit circle): the ship is far longer than that, and most of it is above the screen
      const bi = big ? this.bossInfo[kind] ?? null : null, hang = bi && !isMid(e.type) && (e.st < 2 || bi.full);
      const ox = hang ? (f.w / 2 - bi.core[0]) * bi.px : 0, oy = hang ? (f.h / 2 - bi.core[1]) * bi.px : 0;
      // an elite is half as big again; a boss is drawn to its hit circle (v9: bigger, and its core stage is smaller)
      const fit = bi ? bi.px / PIXEL : big ? 1 : (sheet ? this.bossInfo[kind].px / PIXEL : 1) * (e.el ? radius(e) / KIND[e.type].r : 1);   // a picture from the boss sheet has its own pixel size
      const jolt = e.stun > 0 && FEEL.enabled ? (Math.floor(this.time * 40) % 2 ? 1 : -1) * FEEL.boss.stunShake : 0;   // stunned: it shudders
      const pulse = big && this.bossPulse > 0 ? 1 + (FEEL.bossPulse.scale - 1) * (this.bossPulse / FEEL.bossPulse.dur) : 1;
      shadow(x + ox, y + oy, big ? A.boss : A.enemy, f.w * PIXEL * fit);
      const fuse = e.type === MINE && MINE_FUSE - e.t < FEEL.mineWarn && blinkOn;        // about to go off
      // a seeker points where it flies; leg six's files face the way they run (their pictures face down)
      const turn = e.type === SEEKER ? (e.a * TURN) - Math.PI / 2 : e.type === ICHTHY || e.type === DROMAEO || e.type === COELO ? (e.vx > 0 ? -Math.PI / 2 : Math.PI / 2) : 0;                   // a seeker points where it flies
      if (e.st === 2 && FEEL.enabled) this.glow.draw(T.puff, x, y, radius(e) / 3, radius(e) / 3, FEEL.boss.coreGlow * (0.7 + 0.3 * Math.sin(this.time * 14)), 0xff8a5a);   // the exposed core burns
      this.enemies.draw((sheet ? this.bossTex : T)[name], x + jolt + ox, y + oy, PIXEL * pulse * fit, PIXEL * pulse * fit, 1, fuse ? 0xff7a6a : e.el ? 0xffe9a8 : 0xffffff, e.type === CARRIER ? (e.vx > 0 ? -Math.PI / 2 : Math.PI / 2) : turn);
      const sf = Math.floor(this.time * FEEL.vfx.shieldFps + e.id) % SHIELD_FRAMES;
      if (e.shd > 0) { const k = (radius(e) * 1.12 / 13.8); this.fx.draw(T[`shieldC${sf}`], x, y, k, k, 1); }   // a mid-boss's shield, the size of its hit circle
      if (e.el) this.fx.draw(T[`shieldY${sf}`], x, y, PIXEL, PIXEL, 1);                 // an elite: a gold field round it (it is known to carry a drop)
      for (let i = 0; i < e.sh; i++) this.fx.draw(T[`plate${(Math.floor(this.time * FEEL.vfx.plateFps) + i) % PLATE_FRAMES}`], x, y, PIXEL, PIXEL, 1, 0xffffff, i * 0.5236);   // shell plates, each turned 30 degrees
      // leg six: a boss's weak point. Open: its fragment burns in its own colour and pulses. Closed: nothing (hits sound dull).
      if (sim.l6 && big && !isMid(e.type) && sim.l6.open > 0 && FEEL.enabled) {
        const k = (radius(e) / 7) * (0.8 + 0.25 * Math.sin(this.time * 16));
        this.glow.draw(T.puff, x, y, k, k, FEEL.weak.glow, L6_GLOW.get(e.type) ?? 0xffffff);
      }
      // a charge: its lane, from the core to as far as the bow will reach, filling in while it is announced
      if (e.pk === 6 || e.ch) {
        const C = FEEL.charge, k = e.pk === 6 ? 1 - e.pw / CHARGE_WARN : 1, top = Math.min(y, BOSS_Y), bottom = BOSS_Y + CHARGE_DEPTH + CHARGE_REACH, h = bottom - top;
        // no outline: a soft lane (its edge, half bright, is where the lunge reaches), brighter toward where it lands and
        // breathing faster as the lunge nears; bands of light run down it to say which way it comes; a glow pools at the end
        const SOFT = this.soft, W = (CHARGE_HALF_W * 2) / 0.75, pulse = 0.5 + 0.5 * Math.sin(this.time * (C.rate[0] + (C.rate[1] - C.rate[0]) * k));
        const lit = e.ch ? C.on : (C.warn[0] + (C.warn[1] - C.warn[0]) * k) * (FEEL.enabled ? 0.75 + 0.25 * pulse : 1);
        this.fx.draw(SOFT.slab, x, top + h / 2, W / 64, h / 256, lit, C.tint);
        if (FEEL.enabled && !e.ch) {
          this.glow.draw(SOFT.slab, x, top + h / 2, (W * 0.6) / 64, h / 256, C.core * k * (0.6 + 0.4 * pulse), C.hot);
          for (let i = 0; i < C.bands; i++) {
            const ph = (this.time * C.bandSpeed + i / C.bands) % 1;
            this.glow.draw(SOFT.haze, x, top + ph * h, C.bandH / 64, (CHARGE_HALF_W * 1.8) / 8, C.bandAlpha * k * Math.sin(ph * Math.PI), C.hot, Math.PI / 2);
          }
          this.glow.draw(SOFT.glow, x, bottom, (W * 1.3) / 64, 46 / 64, (0.35 + 0.4 * k) * (0.7 + 0.3 * pulse), C.tint);
        }
      }
      // beams: the warning column fills in, then the beam itself (see beamFx)
      if (e.pk === 3 || e.bt > 0) {
        const k = e.pk === 3 ? 1 - e.pw / BEAM_TELEGRAPH : 1, h = WORLD_H - y;
        for (const cx of beamColumns(e)) this.beamFx(cx / ONE, y, h, FEEL.beam.boss, e.bt > 0, k, e.bt > 0 ? Math.min(1, e.bt / 6) : 1, cx);
      }
      if (e.pk === 5) {                                     // Nyx's cross: a line from each edge of the screen to where the ship was
        const C = FEEL.cross, k = 1 - e.pw / LANCER_TELEGRAPH;
        for (const [ox, a] of [[CROSS_X, e.pv * TURN], [WORLD_W - CROSS_X, e.a * TURN]]) { this.srect(this.fx, ox + Math.cos(a) * C.len / 2, y + Math.sin(a) * C.len / 2, C.width + 2, C.len, C.alpha[0] + (C.alpha[1] - C.alpha[0]) * k, 0xb46bff, a - Math.PI / 2); this.score(ox + Math.cos(a) * C.len / 2, y + Math.sin(a) * C.len / 2, C.width * 3, C.len, 0.35 * k, 0xb46bff, a - Math.PI / 2); }
      }
      if (e.pk === 1) {                                     // a lance is coming along this line: faint at the lock, bright at the shot
        const a = e.pv * TURN, k = 1 - e.pw / LANCER_TELEGRAPH, L = FEEL.aim;
        this.srect(this.fx, x + Math.cos(a) * L.len / 2, y + Math.sin(a) * L.len / 2, L.width + 2, L.len, L.alpha[0] + (L.alpha[1] - L.alpha[0]) * k, 0xff3d8b, a - Math.PI / 2); this.score(x + Math.cos(a) * L.len / 2, y + Math.sin(a) * L.len / 2, L.width * 3, L.len, 0.35 * k, 0xff3d8b, a - Math.PI / 2);
      } else if (e.pk === 2) {                              // a wall is coming: where its bullets will be, and the gap
        const R = FEEL.ray, k = 1 - e.pw / WALL_TELEGRAPH;   // a ray is about to leave from this height: a red line that fills in
        this.srect(this.fx, WORLD_W / 2, y, R.thread + 4, WORLD_W * (0.2 + 0.8 * k), R.warn[0] + (R.warn[1] - R.warn[0]) * k, R.live, Math.PI / 2);
      }
      // hit flash: the sprite's own shape lit white for a moment (not a blob laid over it)
      if (this.flash.has(e.id)) this.enemies.draw((sheet ? this.bossTexW : this.texW)[name], x + jolt + ox, y + oy, PIXEL * pulse * fit, PIXEL * pulse * fit, big ? FEEL.boss.flash : FEEL.enemyFlashAlpha, 0xffffff, e.type === CARRIER ? (e.vx > 0 ? -Math.PI / 2 : Math.PI / 2) : turn);
      if (e.type === DIVER && e.t <= DIVER_HOLD_TICKS) {    // warning line toward where it will dive
        const dx = px - x, dy = py - y, len = Math.hypot(dx, dy);
        this.srect(this.fx, x + dx / 2, y + dy / 2, FEEL.telegraph.width + 2, len, FEEL.telegraph.alpha * (blinkOn ? 1 : 0.55), 0xff5a6e, Math.atan2(dy, dx) - Math.PI / 2);
      }
    }

    if (alive) {
      const blink = sim.invuln > 0 && Math.floor(this.time / FEEL.invulnBlink) % 2 === 0;
      shadow(px, py, A.player, 22 * PIXEL);
      // Which airframe: the plain one with its gear parts while there is little gear, then a finished form that grows
      // with the total of gear levels; above the atmosphere at least the heavy form.
      const J = PIXEL * JET_SCALE, a = blink ? 0.35 : 1, bank = Math.max(-2, Math.min(2, Math.round(this.bank))), sq = JET_SQUEEZE[Math.abs(bank)], G = sim.gear;
      const total = G.reduce((n, v) => n + v, 0), at = FEEL.ship.forms;
      const form = Math.max(total >= at[2] ? 3 : total >= at[1] ? 2 : total >= at[0] ? 1 : 0, sim.chapter >= 3 ? 2 : 0);
      if (form !== this.form) { if (form > this.form && flying) { this.wave(px, py, 1, 0x8ff6ff); this.shards(px, py, 10 * PIXEL, [0xdfe7ee, 0x8ff6ff, 0xffffff], 8); } this.form = form; }   // a new airframe snaps on
      const soul = sim.l5 && inHole(sim) && this.bossTex[`l5c_soul${Math.sign(bank) + 1}`];
      if (soul) { const info = this.bossInfo[`l5c_soul${Math.sign(bank) + 1}`]; this.glow.draw(T.puff, px, py, 6, 6, 0.35, FEEL.l5.soul); this.player.draw(soul, px, py, info.px * FEEL.l5.soulScale, info.px * FEEL.l5.soulScale, a); }
      else if (form) this.player.draw(this.ship[`${SHIP_ORDER[form - 1]}${bank + 2}`], px, py + FEEL.ship.dy, SHIP_SCALE, SHIP_SCALE, a);
      else {
        const on = name => this.player.draw(T[name], px, py, J * sq, J, a);
        if (G[THRUSTERS]) on(`gThrust${G[THRUSTERS]}`);
        this.player.draw(T[jetFrameFor(this.bank)], px, py, J, J, a);
        if (G[SPREAD]) on(`gSpread${G[SPREAD]}`);
        if (G[HEAVY]) on(`gHeavy${G[HEAVY]}`);
        if (G[RAPID]) on(`gRapid${G[RAPID]}`);
        if (G[PIERCE]) on('gPierce');
        if (G[LASER]) on('gPlasma');
        if (G[BARRIER]) on('gBarrier');
      }
      this.player.draw(T.core, px, py);                    // the actual hit point
      if (sim.gear[LASER]) {                                // plasma charging on the nose: a glowing orb that swells, specks spiralling in, arcs licking out
        const P = FEEL.plasma, k = (sim.tick % LASER_PERIOD) / LASER_PERIOD, ny = py - P.nose, frame = Math.floor(this.time * P.flicker);
        const beat = FEEL.enabled ? 1 + 0.18 * noise(frame, 1, 2) + 0.1 * Math.sin(this.time * 30) : 1, size = PIXEL * (P.orb[0] + (P.orb[1] - P.orb[0]) * k) / 2 * beat;
        if (FEEL.enabled) this.glow.draw(T.puff, px, ny, size * P.halo, size * P.halo, 0.35 + 0.3 * k, P.tint);
        this.player.draw(T.puff, px, ny, size, size, P.orbAlpha * (0.5 + 0.5 * k), P.tint);
        this.player.draw(T.puff, px, ny, size * 0.5, size * 0.5, 0.95, P.hot);
        if (FEEL.enabled) {
          const r = P.moteR[0] + (P.moteR[1] - P.moteR[0]) * k;
          for (let i = 0; i < P.motes; i++) { const a = this.time * P.moteSpin + i * 2 * Math.PI / P.motes; this.glow.draw(T.spark, px + Math.cos(a) * r, ny + Math.sin(a) * r * 0.6, PIXEL * 1.3, PIXEL * 1.3, 0.9, P.hot); }
          for (let i = 0; i < P.tendrils; i++) {              // arcs out of the orb, two pieces each, re-rolled every flicker
            const a = (noise(i, frame, 11) + 0.5) * Math.PI * 2, len = (P.tendrilLen[0] + (P.tendrilLen[1] - P.tendrilLen[0]) * k) * (0.6 + 0.8 * (noise(i, frame, 12) + 0.5));
            const mx = px + Math.cos(a) * len * 0.5 + noise(i, frame, 13) * 8, my = ny + Math.sin(a) * len * 0.5 + noise(i, frame, 14) * 8, ex = px + Math.cos(a) * len, ey = ny + Math.sin(a) * len;
            for (const [ax, ay, bx, by] of [[px, ny, mx, my], [mx, my, ex, ey]]) this.fx.draw(this.soft.rod, (ax + bx) / 2, (ay + by) / 2, 5 / 64, (Math.hypot(bx - ax, by - ay) * 1.25) / 256, 0.5 + 0.4 * k, i % 2 ? P.hot : P.tint, Math.atan2(by - ay, bx - ax) - Math.PI / 2);
          }
          if (k > P.crackle) for (let i = 0; i < 2; i++) {    // short arcs that jump over the hull
            const j = frame * 7 + i * 13, ax = px + ((j * 37) % 29 - 14), ay = py - 18 + ((j * 53) % 31), rot = ((j * 17) % 20 - 10) / 10;
            this.fx.draw(this.soft.rod, ax, ay, 5 / 64, (P.crackleLen[0] + (j % 3) * (P.crackleLen[1] - P.crackleLen[0]) / 2) / 256 * 1.2, 0.85, i ? P.hot : P.tint, rot);
          }
        }
        if (this.discharge > 0) { const d = this.discharge / P.flash; this.glow.draw(this.waves[Math.min(WAVE_FRAMES - 1, Math.floor((1 - d) * 4))], px, ny, PIXEL, PIXEL, 1, P.tint); this.glow.draw(T.puff, px, ny, PIXEL * 3 * d, PIXEL * 3 * d, 0.8 * d, P.tint); }
      }
      if (sim.gear[WINGMAN]) for (const d of [-1, 1]) { shadow(px + d * WING_OFFSET, py, A.player, 12 * PIXEL); this.player.draw(T.wing, px + d * WING_OFFSET, py + 4); }
      // shields as pixel frames: they pop in with an overshoot, pulse sharp-up slow-down, and flicker frame by frame
      // (never a fade) when about to run out
      const V = FEEL.vfx, frame = Math.floor(this.time * V.shieldFps) % SHIELD_FRAMES;
      if (sim.barrier > this.hadBarrier) this.shieldUp = 0;
      this.hadBarrier = sim.barrier; this.shieldUp += dt;
      if (sim.invuln > 0 && (sim.invuln > V.invulnBlink || Math.floor(this.time * 20) % 2 === 0)) this.player.draw(T[`shieldC${frame}`], px, py, PIXEL, PIXEL, 1);
      if (sim.barrier > 0) {
        const u = Math.min(1, this.shieldUp / V.pop), pop = FEEL.enabled && u < 1 ? 1 + V.popOver * Math.sin(u * Math.PI) * (1 - u) - (1 - u) * (1 - u) * 0.6 : 1;   // back-out: grows past its size, settles
        const ph = (this.time * V.pulseRate) % 1, s = PIXEL * pop * (FEEL.enabled ? 1 + V.pulse * (1 - ph) ** 3 : 1);
        this.player.draw(T[`shieldG${(frame + 3) % SHIELD_FRAMES}`], px, py, s, s, 1);
        for (let i = 1; i < sim.barrier; i++) { const a = this.time * 2.2 + i * 2.1; this.player.draw(T.bitA, px + Math.cos(a) * 15 * PIXEL, py + Math.sin(a) * 15 * PIXEL, PIXEL, PIXEL, 1, VFX_RAMPS.G[3], a); }   // a spare charge: a chip orbiting the rim
      }
    }

    this.bolts(px, py, fxDt);

    // every enemy bullet sits on a small dark halo: whatever light is behind it (the ship's shots, beams, the sun), its
    // edge stays a dark-to-bright step, so it reads first (E3). Same layer and batch as the bullets.
    const BK = FEEL.bulletBack;
    for (const b of sim.bullets) if (BK.alpha > 0) this.bullets.draw(this.soft.glow, b.x / ONE, b.y / ONE, BK.size / 64, BK.size / 64, BK.alpha, BK.tint);
    for (const b of sim.bullets) {
      if (b.vx * b.vx + b.vy * b.vy >= FAST2) this.bullets.draw(T.lance, b.x / ONE, b.y / ONE, PIXEL, PIXEL, 1, 0xffffff, Math.atan2(b.vy, b.vx) - Math.PI / 2);
      else this.bullets.draw(T.enemyShot, b.x / ONE, b.y / ONE, PIXEL, PIXEL, 1, b.c === FIRE ? FEEL.spit.fire : b.c === VENOM ? FEEL.spit.venom : b.c === GOLD ? FEEL.spit.gold : b.c === LEAD ? FEEL.spit.lead : b.c === MOON ? FEEL.spit.moon : b.c === EMBER ? FEEL.spit.ember : b.c === NECTAR ? FEEL.spit.nectar : b.c === SHARD3 ? FEEL.spit.shard : b.c === ECHOSHOT ? FEEL.spit.echo : b.c === BALL ? FEEL.spit.ball : b.c === FROST ? FEEL.spit.frost : b.c === SONAR ? FEEL.spit.sonar : b.c === STYGIAN ? FEEL.spit.stygian : b.c === THUNDER ? FEEL.spit.thunder : b.c === SOLAR ? FEEL.spit.solar : b.c === SLOWB ? FEEL.spit.slow : b.c === TALIS ? FEEL.spit.talis : b.c === PETAL ? FEEL.spit.petal : 0xffffff);   // a creature's fire or venom: the same bullet, another colour
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += fxDt;
      if (p.t >= p.life) { this.particles.splice(i, 1); continue; }
      if (p.drag) { const f = Math.exp(-p.drag * fxDt); p.vx *= f; p.vy *= f; }   // fast at first, then slowing: never a straight-line spray
      p.x += p.vx * fxDt; p.y += p.vy * fxDt;
      if (p.frames) {                                        // a frame sequence on an expo-out clock, at a fixed whole-pixel scale, no fade
        const n = p.frames.length, e = 1 - Math.pow(2, -7 * (p.t / p.life));
        this.fx.draw(p.frames[Math.min(n - 1, Math.floor(e * n))], p.x, p.y, p.s0, p.s0, p.a0, p.tint);
        continue;
      }
      const k = p.t / p.life, s = p.s0 + (p.s1 - p.s0) * k;
      // `len` = a stretched streak (wind line); `steady` = keeps its alpha instead of fading out
      (p.trail ? this.trail : this.fx).draw(p.tex, p.x, p.y, s, p.len ?? s, p.steady ? p.a0 : p.a0 * (1 - k), p.tint, p.rot ?? 0);
    }
    for (const p of pools) p.end();
  }
}
