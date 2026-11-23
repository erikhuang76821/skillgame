// Every sprite in the game, drawn by code into one small canvas (0 bytes of images, one texture = one batch).
// Pixel art from polygons: shapes are rasterised by hand at art-pixel centres (no canvas anti-aliasing), then every
// sprite gets a bevel (lit from the upper left, shaded on the lower right) and a dark outline, which is what makes the
// flat shapes read as solid objects from above. Sprites are shown at PIXEL (3) world px per art pixel, nearest sampling.
// Render layer only. Frame sizes are tied to the sim's radii in gdd/05 §5 (radius ≈ half the sprite width).

import { SHIP_PALETTE, SHIP_FORMS } from './shipForms.js';
import { BOSS_FORMS } from './bossForms.js';
import { LEG6_FORMS } from './leg6Forms.js';
import { LEG6_CREATURES } from './leg6Creatures.js';
import { LEG2_FORMS } from './leg2Forms.js';
import { LEG2_MACHINES } from './leg2Machines.js';
import { LEG3_FORMS } from './leg3Forms.js';
import { LEG3_MACHINES } from './leg3Machines.js';
import { LEG4_FORMS } from './leg4Forms.js';
import { LEG4_MACHINES } from './leg4Machines.js';
import { LEG5_FORMS } from './leg5Forms.js';
import { LEG5_MACHINES } from './leg5Machines.js';

const hex = (c, a = 255) => [(c >> 16) & 255, (c >> 8) & 255, c & 255, a];
const OUTLINE = hex(0x1c1626);

/** A w x h art-pixel grid with polygon fill, bevel and outline. */
class Grid {
  constructor(w, h) { this.w = w; this.h = h; this.px = new Array(w * h).fill(null); }
  at(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.px[y * this.w + x]; }
  /** Fill a polygon [[x, y], ...]; `mirror` also fills its reflection about the vertical centre line. */
  poly(points, color, mirror = false) {
    const sets = mirror ? [points, points.map(([x, y]) => [this.w - x, y])] : [points];
    for (const pts of sets) {
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
        const cx = x + 0.5, cy = y + 0.5;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > cy) !== (yj > cy) && cx < ((xj - xi) * (cy - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.px[y * this.w + x] = color.slice();
      }
    }
    return this;
  }
  disc(cx, cy, r, color) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) this.px[y * this.w + x] = color.slice();
    }
    return this;
  }
  ring(cx, cy, r0, r1, color) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = dx * dx + dy * dy;
      if (d <= r1 * r1 && d >= r0 * r0) this.px[y * this.w + x] = color.slice();
    }
    return this;
  }
  /** Lighten pixels whose upper-left neighbours are empty, darken those whose lower-right neighbours are. */
  bevel(light = 1.22, dark = 0.72) {
    const src = this.px.map(p => p && p.slice());
    const empty = (x, y) => { const p = x < 0 || y < 0 || x >= this.w || y >= this.h ? null : src[y * this.w + x]; return !p; };
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const p = this.px[y * this.w + x];
      if (!p) continue;
      const k = empty(x - 1, y) || empty(x, y - 1) ? light : empty(x + 1, y) || empty(x, y + 1) ? dark : 1;
      for (let c = 0; c < 3; c++) p[c] = Math.min(255, Math.round(p[c] * k));
    }
    return this;
  }
  /** Scale tones left / right of the centre line (a banked aircraft shows one wing lit, the other in shade). */
  tilt(k) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const p = this.px[y * this.w + x];
      if (!p) continue;
      const side = x + 0.5 < this.w / 2 ? 1 + k : 1 - k;
      for (let c = 0; c < 3; c++) p[c] = Math.max(0, Math.min(255, Math.round(p[c] * side)));
    }
    return this;
  }
  outline(color = OUTLINE) {
    const src = this.px.slice();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[y * this.w + x]) continue;
      const n = (dx, dy) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < this.w && Y < this.h && src[Y * this.w + X]; };
      if (n(1, 0) || n(-1, 0) || n(0, 1) || n(0, -1)) this.px[y * this.w + x] = color.slice();
    }
    return this;
  }
}

// ---------- the player's aircraft: five bank frames (-2 hard left .. +2 hard right), nose up ----------
// Drawn at twice the art resolution of everything else (shown at PIXEL / 2), so it carries panel lines, intakes,
// twin fins and markings in the same footprint. Gear parts are separate sprites laid over it (see gearParts()).
export const JET_SCALE = 0.5;                                // of PIXEL
const JET_W = 44, JET_H = 48;
export const JET_SQUEEZE = [1, 0.86, 0.68];                  // a banked wing is seen edge-on, so it gets narrower
function jet(bank) {
  const g = new Grid(JET_W, JET_H), cx = JET_W / 2, squeeze = JET_SQUEEZE[Math.abs(bank)];
  const P = pts => pts.map(([x, y]) => [cx + (x - cx) * squeeze, y]);
  const hull = hex(0xdfe7ee), panel = hex(0xc3ced9), edge = hex(0xc9d6e2), wing = hex(0xa9b8c9), wing2 = hex(0x8fa0b6), tail = hex(0x8797ae);
  const navy = hex(0x34506e), glass = hex(0x2f8f9d), glassHi = hex(0x8fe3ea), trim = hex(0xe2574c), glow = hex(0xffb347);
  g.poly(P([[20, 20], [4, 34], [4, 39], [19.2, 36]]), wing, true);                   // delta wings
  g.poly(P([[20, 20], [4, 34], [5.2, 35], [20, 22.4]]), edge, true);                 // leading edges
  g.poly(P([[9, 31.5], [18.5, 30], [18.5, 31], [9, 32.6]]), wing2, true);            // panel line
  g.poly(P([[6, 37.4], [17, 35.4], [17, 36.6], [6, 38.6]]), wing2, true);            // flaps
  g.poly(P([[4, 34], [8.4, 30.2], [8.4, 37.2], [4, 39]]), trim, true);               // wing-tip markings
  g.poly(P([[5.4, 34.4], [7, 33], [7, 37], [5.4, 37.8]]), hull, true);               // a stripe in them
  g.poly(P([[11, 29], [12.6, 29], [12.6, 37], [11, 37]]), navy, true);               // hardpoints
  g.poly(P([[18.8, 36], [12, 45.2], [19.2, 44]]), tail, true);                       // tail planes
  g.poly(P([[17.2, 36], [16, 43], [18.2, 43]]), navy, true);                         // twin fins
  g.poly(P([[17, 17], [19, 15], [19, 24], [17, 24]]), navy, true);                   // intakes
  g.poly(P([[22, 2], [25.2, 12], [26, 30], [24.4, 44], [19.6, 44], [18, 30], [18.8, 12]]), hull);   // fuselage
  g.poly(P([[22, 22], [23.2, 30], [22, 42], [20.8, 30]]), panel);                    // spine
  g.poly(P([[22, 2], [23.4, 6.4], [20.6, 6.4]]), navy);                              // nose cone
  g.poly(P([[22, 9], [24, 16], [22, 23], [20, 16]]), glass);                         // canopy
  g.poly(P([[21.4, 11], [22.2, 11], [21.6, 16], [20.8, 16]]), glassHi);              // its glint
  g.bevel().tilt(bank * 0.09);
  g.poly(P([[20.2, 44], [21.6, 44], [21.6, 46.8], [20.2, 46.8]]), glow, true);       // twin engines
  return g.outline();
}
// Gear on the airframe: one sprite per piece (per level where the part grows), in the jet's own grid so it lands on
// the right spot; the view squeezes it sideways with the bank. Wingmen and the plasma orb are drawn separately.
const part = draw => { const g = new Grid(JET_W, JET_H); draw(g); return g.bevel().outline(); };
const rect = (g, c, x0, y0, x1, y1, mirror = true) => g.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], c, mirror);
// The look is that of add-on equipment on a real-robot model kit: angular white armour blocks over dark inner frames,
// with small accents in blue, red and yellow (vents, muzzle rings, stripes) and one glowing part per weapon. Nothing
// is a plain coloured block. (A style, not any existing machine: no part copies a published design.)
function gearParts() {
  const white = hex(0xe8eef4), grey = hex(0xb8c4d2), navy = hex(0x2f4468), blue = hex(0x3f66c0), red = hex(0xd9463e), yellow = hex(0xf2c53d), dark = hex(0x1f2a3c);
  const cyan = hex(0x8ff6ff), green = hex(0x6ff0a8), violet = hex(0xa24bff), lilac = hex(0xf1dcff);
  const out = {};
  for (const lv of [1, 2, 3]) {
    // rapid fire: cheek vulcans. A white shroud beside the nose, dark barrels that reach further forward each level
    const y0 = 13.4 - 2.6 * lv;
    out[`gRapid${lv}`] = part(g => { rect(g, dark, 17.5, y0, 18.7, 15); g.poly([[16.8, 12.4], [19.2, 11.6], [19.2, 16.4], [16.8, 16.4]], white, true); rect(g, blue, 17.1, 14.4, 18.9, 15.4); rect(g, yellow, 17.5, y0 - 1, 18.7, y0); });
    // heavy rounds: a long cannon under each wing. White shroud with a red stripe, a navy barrel with a yellow muzzle ring
    const top = 25 - 2.6 * lv;
    out[`gHeavy${lv}`] = part(g => {
      rect(g, navy, 10.9, top, 12.9, 28); rect(g, yellow, 10.5, top, 13.3, top + 1.2);
      g.poly([[10, 27], [13.8, 27], [14.2, 34], [13, 36], [10.8, 36], [9.6, 34]], white, true);
      rect(g, red, 10, 30.4, 13.8, 31.6); rect(g, grey, 11, 33, 12.8, 35);
    });
    // spread: angular wing binders swept outboard, white over blue, red at the tip
    const o = 1.5 * lv;
    out[`gSpread${lv}`] = part(g => {
      g.poly([[18.2, 14.6], [13.2 - o, 17 + 0.6 * lv], [12.2 - o, 20.4 + lv], [14.4, 22 + lv], [18.2, 18.8]], white, true);
      g.poly([[17.4, 16.2], [14.6 - o * 0.8, 18.2 + 0.6 * lv], [15, 20.6 + 0.6 * lv], [17.4, 18.4]], blue, true);
      g.poly([[13.2 - o, 17 + 0.6 * lv], [12.2 - o, 20.4 + lv], [13.4 - o, 20 + lv]], red, true);
    });
    // thrusters: backpack verniers. White binders with a yellow vent, dark bells, a blue-white flame
    const t = 0.7 * lv;
    out[`gThrust${lv}`] = part(g => {
      g.poly([[17.8 - t, 37.6], [21.4, 37], [21.6, 44], [17.2 - t, 44]], white, true);
      rect(g, yellow, 18.4 - t, 39.6, 20.8, 40.6); rect(g, navy, 18.4 - t, 41.6, 20.8, 42.4);
      g.poly([[17.6 - t, 44], [21.4, 44], [21, 45.6], [18 - t, 45.6]], dark, true);
      g.poly([[18.2 - t, 45.6], [20.8, 45.6], [19.5 - t / 2, 46.4 + 0.5 * lv]], cyan, true);
    });
  }
  // pierce: a long rifle barrel slung under the nose, a white collar, a green emitter at the tip
  out.gPierce = part(g => { rect(g, dark, 21.2, 1.6, 22.8, 9, false); g.poly([[20.4, 6.6], [23.6, 6.6], [24, 9.4], [20, 9.4]], white); rect(g, blue, 20.8, 8, 23.2, 8.8, false); g.poly([[22, 0.2], [23.2, 2.2], [20.8, 2.2]], green); });
  // plasma cannon: a generator on the spine. An angular white housing, navy cooling fins, the violet core showing
  out.gPlasma = part(g => {
    g.poly([[18.8, 26], [16.4, 24.8], [16.4, 30.2], [18.8, 29.4]], navy, true);
    g.poly([[19.6, 23.6], [24.4, 23.6], [25.6, 27], [24.4, 32], [19.6, 32], [18.4, 27]], white);
    rect(g, yellow, 20.4, 30.4, 23.6, 31.2, false);
    g.disc(22, 27.4, 2.2, violet); g.disc(22, 27.4, 1, lilac);
  });
  // barrier: a small shield on each shoulder with a green crystal, and an emitter on the back
  out.gBarrier = part(g => {
    g.poly([[14, 18.6], [16.6, 17.6], [16.8, 24.6], [14.8, 26.8], [13.2, 22.8]], white, true);
    g.poly([[14.4, 20.4], [15.8, 19.8], [15.8, 22], [14.6, 22.4]], blue, true);
    g.disc(15.1, 23.8, 0.9, green); g.disc(JET_W - 15.1, 23.8, 0.9, green); g.disc(22, 34.4, 1.2, green);
  });
  return out;
}

// ---------- enemies, nose down ----------
function drone() {
  const g = new Grid(17, 17);
  g.poly([[4.5, 6], [0.8, 2.5], [1.6, 10.5]], hex(0xb565b8), true);
  g.poly([[8.5, 16], [12.6, 8.5], [8.5, 1.2], [4.4, 8.5]], hex(0x7a4a94));
  g.bevel();
  g.disc(8.5, 8.5, 1.6, hex(0xff6b5a));
  return g.outline();
}
function gunner() {
  const g = new Grid(20, 20);
  g.poly([[4, 6], [1, 6], [1, 14], [4, 13]], hex(0x8296cf), true);              // gun pods
  g.poly([[10, 19], [15.5, 13.5], [16.5, 5.5], [10, 1.2], [3.5, 5.5], [4.5, 13.5]], hex(0x4f61a0));
  g.poly([[10, 16], [13, 12], [10, 9], [7, 12]], hex(0x6b80c0));
  g.bevel();
  g.disc(10, 7, 2.1, hex(0xffd24a));
  g.poly([[1.6, 13.2], [3.4, 13.2], [3.4, 15.4], [1.6, 15.4]], hex(0xffd24a), true);   // muzzles
  return g.outline();
}
function weaver() {
  const g = new Grid(18, 16);
  g.poly([[9, 14.5], [17, 3.2], [13.6, 1.6], [9, 7.6]], hex(0x66c49c), true);
  g.poly([[9, 14.5], [11.6, 8], [9, 3], [6.4, 8]], hex(0x3a8a72));
  g.bevel();
  g.disc(9, 8, 1.4, hex(0xc8ff6a));
  return g.outline();
}
function diver() {
  const g = new Grid(16, 18);
  g.poly([[8, 17], [11.2, 7], [15, 1.2], [8, 4.6]], hex(0xd95c6f), true);
  g.poly([[8, 17], [9.6, 8], [8, 3], [6.4, 8]], hex(0x9c3b4f));
  g.bevel();
  g.disc(8, 9.5, 1.3, hex(0xbff4ff));
  return g.outline();
}
function carrier() {                                         // the convoy's transport: a freighter with three containers on deck
  const g = new Grid(24, 20);
  g.poly([[3, 2.6], [21, 2.6], [23.2, 8], [21, 17.4], [3, 17.4], [0.8, 8]], hex(0x5f6f8a));
  g.poly([[5, 4.6], [10, 4.6], [10, 9], [5, 9]], hex(0xc9a24a)); g.poly([[11, 4.6], [16, 4.6], [16, 9], [11, 9]], hex(0x7fa6c9)); g.poly([[17, 4.6], [20.4, 4.6], [20.4, 9], [17, 9]], hex(0xb86a5a));
  g.poly([[5, 10.4], [20.4, 10.4], [20.4, 12], [5, 12]], hex(0x8494b0));
  g.bevel();
  g.disc(12, 15, 1.6, hex(0xbff4ff));
  g.poly([[1.2, 6.4], [2.6, 6.4], [2.6, 9.6], [1.2, 9.6]], hex(0xffb347), true);
  return g.outline();
}
// ---------- pixel VFX (knowledge-base/18_pixel-vfx-codex.md, redone in code: 0 bytes) ----------
// Rules followed: each material is a ramp of four tones from a saturated dark (shifted toward blue) to a warm white, no
// smooth gradients; soft edges are a 4x4 Bayer dither, not alpha; every effect is a sequence of frames drawn at whole
// art pixels, so nothing is a scaled-up smooth ring.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
export const VFX_RAMPS = { G: [0x1f6f7a, 0x2fae7c, 0x7fe7a0, 0xe9ffd8], C: [0x2a4f9a, 0x3f9fd6, 0x8ff6ff, 0xf4fff4], Y: [0x8a4a2a, 0xd9902f, 0xffd24a, 0xfff6d0] };
export const SHIELD_FRAMES = 8, WAVE_FRAMES = 6, PLATE_FRAMES = 2;
const SHIELD_SIZE = 30, SHIELD_R = 13.8;
/** An energy shield seen from above, frame i of SHIELD_FRAMES: a lit rim, a dithered haze inside it, a glint that
 *  travels round the rim and a faint scan band crossing the dome. */
function shieldFrame(pal, i) {
  const g = new Grid(SHIELD_SIZE, SHIELD_SIZE), ramp = VFX_RAMPS[pal].map(c => hex(c)), c0 = SHIELD_SIZE / 2, glint = (i / SHIELD_FRAMES) * Math.PI * 2;
  for (let y = 0; y < SHIELD_SIZE; y++) for (let x = 0; x < SHIELD_SIZE; x++) {
    const dx = x + 0.5 - c0, dy = y + 0.5 - c0, d = Math.hypot(dx, dy), light = -(dx + dy) / ((d || 1) * 1.4142);
    let tone = -1;
    if (d >= 12.4 && d <= SHIELD_R) {
      const da = Math.abs(((Math.atan2(dy, dx) - glint + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      tone = da < 0.34 ? 3 : light > 0.5 ? 3 : light > -0.1 ? 2 : light > -0.6 ? 1 : 0;
    } else if (d >= 10.4 && d < 12.4) { if (bayer(x, y) > (12.4 - d) / 1.9) tone = light > 0.2 ? 2 : 1; }
    else if (d > 4 && d < 10.4 && ((x - y + i * 4 + 64) % 32) < 3 && bayer(x, y) < 0.42) tone = 2;
    if (tone >= 0) g.px[y * SHIELD_SIZE + x] = ramp[tone].slice();
  }
  return g;
}
/** A shell plate on an enemy: a hexagonal rim in the cyan ramp with a dithered inner edge; two frames (the lit corner moves). */
function plateFrame(i) {
  const g = new Grid(30, 30), ramp = VFX_RAMPS.C.map(c => hex(c));
  for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) {
    const dx = x + 0.5 - 15, dy = y + 0.5 - 15, ax = Math.abs(dx), ay = Math.abs(dy), d = Math.max(ax, ax * 0.5 + ay * 0.866), light = (i ? dx - dy : -(dx + dy)) / ((Math.hypot(dx, dy) || 1) * 1.4142);
    let tone = -1;
    if (d >= 11.8 && d <= 13.6) tone = light > 0.55 ? 3 : light > 0 ? 2 : light > -0.5 ? 1 : 0;
    else if (d >= 10.2 && d < 11.8 && bayer(x, y) > (11.8 - d) / 1.5) tone = 0;
    if (tone >= 0) g.px[y * 30 + x] = ramp[tone].slice();
  }
  return g;
}
/** A shock ring, frame j of WAVE_FRAMES: it grows fast then slows (the radii are an expo-out curve) and gets thinner;
 *  the last frames break up into dither and gaps instead of fading. White, tinted by the view. */
const WAVE_R = [6, 12, 17, 21, 24, 26], WAVE_TH = [3.4, 3, 2.4, 1.8, 1.3, 1], WAVE_SIZE = 54;
function waveFrame(j) {
  const g = new Grid(WAVE_SIZE, WAVE_SIZE), lite = hex(0xffffff), mid = hex(0xc8c8c8), c0 = WAVE_SIZE / 2;
  for (let y = 0; y < WAVE_SIZE; y++) for (let x = 0; x < WAVE_SIZE; x++) {
    const dx = x + 0.5 - c0, dy = y + 0.5 - c0, d = Math.hypot(dx, dy), r = WAVE_R[j], th = WAVE_TH[j];
    if (d < r - th || d > r) continue;
    if (j >= 3 && bayer(x, y) < (j - 2) * 0.24) continue;                      // breaking up
    if (j === 5 && Math.floor((Math.atan2(dy, dx) + Math.PI) * 5) % 2) continue;   // and into segments
    g.px[y * WAVE_SIZE + x] = (d > r - th / 2 ? lite : mid).slice();
  }
  return g;
}
const bit = (w, h) => { const g = new Grid(w, h); g.px.fill(null); for (let k = 0; k < w * h; k++) g.px[k] = hex(0xffffff); return g; };
function vfx() {
  const out = {};
  for (const pal of ['G', 'C', 'Y']) for (let i = 0; i < SHIELD_FRAMES; i++) out[`shield${pal}${i}`] = shieldFrame(pal, i);
  for (let i = 0; i < PLATE_FRAMES; i++) out[`plate${i}`] = plateFrame(i);
  for (let j = 0; j < WAVE_FRAMES; j++) out[`wave${j}`] = waveFrame(j);
  out.bitA = bit(3, 2); out.bitB = bit(2, 3); out.bitC = bit(2, 1);
  return out;
}
function lancer() {                                          // a thin dart: it shoots one fast, aimed lance
  const g = new Grid(16, 19);
  g.poly([[8, 9], [1.2, 3], [3.4, 11.5]], hex(0xe09a4a), true);                  // swept fins
  g.poly([[8, 18.4], [10.6, 9], [9.4, 1.2], [6.6, 1.2], [5.4, 9]], hex(0x9a5226));
  g.poly([[8, 15], [9.2, 9], [8, 5], [6.8, 9]], hex(0xd9823a));
  g.bevel();
  g.disc(8, 10, 1.4, hex(0x8ff6ff));
  g.poly([[7.4, 16.4], [8.6, 16.4], [8.6, 18.6], [7.4, 18.6]], hex(0xfff1c9));    // muzzle
  return g.outline();
}
function miner() {                                           // a wide saucer crossing the screen, dropping mines
  const g = new Grid(22, 14);
  g.poly([[11, 12.6], [20.6, 8], [18, 3], [11, 1.4]], hex(0x4f8f96), true);
  g.poly([[11, 10], [15, 7.4], [11, 4], [7, 7.4]], hex(0x2f5f6a));
  g.bevel();
  g.disc(11, 7.2, 1.6, hex(0xffa23d));
  g.poly([[2.6, 7], [4.6, 7], [4.6, 9], [2.6, 9]], hex(0xffa23d), true);          // bay lights
  return g.outline();
}
function mine() {                                            // a spiked ball; the core is the fuse
  const g = new Grid(11, 11);
  g.poly([[5.5, 0.4], [6.6, 3], [4.4, 3]], hex(0x6a6488));
  g.poly([[5.5, 10.6], [6.6, 8], [4.4, 8]], hex(0x6a6488));
  g.poly([[0.4, 5.5], [3, 4.4], [3, 6.6]], hex(0x6a6488), true);
  g.disc(5.5, 5.5, 3.3, hex(0x4a4468));
  g.bevel();
  g.disc(5.5, 5.5, 1.5, hex(0xff5a4a));
  return g.outline();
}
function bulwark() {                                         // a slab with a row of emitters: the wall of bullets
  const g = new Grid(24, 22);
  g.poly([[12, 20], [23, 15], [23, 6], [17, 1.4], [12, 3]], hex(0x7c8460), true);
  g.poly([[12, 17], [18, 13], [18, 7], [12, 5], [6, 7], [6, 13]], hex(0x4d5540));
  g.bevel();
  g.disc(12, 10, 2.2, hex(0xffd24a));
  for (const x of [3, 7.5, 16.5, 21]) g.poly([[x - 1, 15.6], [x + 1, 15.6], [x + 1, 18], [x - 1, 18]], hex(0xfff1c9));   // emitters
  return g.outline();
}
function splitter() {                                        // two hulls joined at a seam: it breaks in two
  const g = new Grid(19, 18);
  g.poly([[9.5, 16.6], [1.2, 9], [4.4, 1.4], [8.4, 6]], hex(0x9aa6b8));
  g.poly([[9.5, 16.6], [17.8, 9], [14.6, 1.4], [10.6, 6]], hex(0x7c889c));
  g.bevel();
  g.poly([[9, 6], [10, 6], [10, 16], [9, 16]], hex(0x2a2440));                    // the seam
  g.disc(5.6, 8.4, 1.3, hex(0xc8ff6a)); g.disc(13.4, 8.4, 1.3, hex(0xc8ff6a));
  return g.outline();
}
function shard() {
  const g = new Grid(10, 10);
  g.poly([[5, 9.4], [9, 3.4], [5, 0.8], [1, 3.4]], hex(0x8a96aa));
  g.bevel();
  g.disc(5, 4.6, 1.1, hex(0xc8ff6a));
  return g.outline();
}
function seeker() {                                          // a small hunter with a tail: it turns toward the ship
  const g = new Grid(13, 15);
  g.disc(6.5, 8.6, 4.4, hex(0xb86ad6));
  g.poly([[6.5, 0.6], [8.4, 5.2], [4.6, 5.2]], hex(0x8a4cb0));                    // tail (it flies head first, nose down)
  g.bevel();
  g.disc(6.5, 9.4, 1.7, hex(0xfff1c9));
  return g.outline(hex(0x2a1a3e));
}
function beamer() {                                          // a bell with an eye: the beam comes out of the eye
  const g = new Grid(21, 19);
  g.poly([[10.5, 1], [18.6, 5.4], [19.6, 12], [15, 17.6], [6, 17.6], [1.4, 12], [2.4, 5.4]], hex(0x3f9fb0));
  g.poly([[10.5, 4], [15.6, 7], [16, 11.6], [10.5, 14.6], [5, 11.6], [5.4, 7]], hex(0x2a6f86));
  g.bevel();
  g.disc(10.5, 10, 2.8, hex(0xbff4ff));
  g.disc(10.5, 10, 1.2, hex(0x1c1626));
  return g.outline(hex(0x12303c));
}
function peak() {
  const g = new Grid(32, 32);
  g.poly([[16, 1], [30.6, 24], [24, 31], [8, 31], [1.4, 24]], hex(0x7a6258));
  g.poly([[16, 1], [22, 16], [16, 31], [8, 31], [1.4, 24]], hex(0x9a8070));       // the lit face
  g.poly([[16, 1], [19, 8], [16, 11], [13, 8]], hex(0xe8dcc8));                   // snow cap
  g.bevel(1.12, 0.78);
  return g.outline(hex(0x2a2028));
}
// v10: a peak a heavy shot has hit. The summit is gone (a broken, flat top, no snow), a bite is out of the shaded
// flank, cracks run down the lit face and the break shows darker, fresh rock.
function peakHurt() {
  const g = new Grid(32, 32), rock = hex(0x7a6258), lit = hex(0x9a8070), raw = hex(0x5a4640), crack = hex(0x33262a), dust = hex(0xc8b49a);
  g.poly([[11, 9], [14, 6.4], [18.4, 8], [21, 6.6], [23, 12], [27.4, 19], [25, 21.4], [28.6, 26], [24, 31], [8, 31], [1.4, 24]], rock);
  g.poly([[11, 9], [14, 6.4], [17, 8.4], [20, 17], [16, 31], [8, 31], [1.4, 24]], lit);
  g.poly([[11, 9], [14, 6.4], [18.4, 8], [21, 6.6], [22.4, 10.6], [18, 12.4], [13.6, 11.4]], raw);   // the broken top
  g.poly([[23, 12], [27.4, 19], [25, 21.4], [22, 17]], raw);                                          // the bite out of the flank
  g.bevel(1.12, 0.78);
  g.poly([[15.4, 11.6], [16.4, 11.6], [14.2, 18], [15.6, 22], [14.8, 22.4], [13.2, 18]], crack);      // cracks
  g.poly([[9.4, 15], [10.2, 15], [11.8, 20], [10, 25], [9.2, 24.6], [10.6, 20]], crack);
  g.poly([[18.4, 13], [19.2, 13.4], [21, 19], [20, 24.4], [19.2, 24], [20, 19.2]], crack);
  for (const [x, y] of [[12, 12.6], [20, 11], [24.6, 22.6], [6, 26], [17, 27]]) g.disc(x, y, 0.75, dust);   // rubble
  return g.outline(hex(0x2a2028));
}
// v10: a meteor a heavy shot has hit: a chunk gone from one side, a crack across it, the break glowing faintly.
function meteorHurt() {
  const g = new Grid(17, 17), raw = hex(0x4a4658), hot = hex(0xff9a5a);
  g.poly([[8, 0.8], [11, 2], [10, 5.4], [13.4, 7], [16.2, 9], [12.6, 15.4], [5, 16], [0.8, 10], [2.4, 3.4]], hex(0x6e6a7a));
  g.bevel(1.2, 0.7);
  g.poly([[10.4, 2.4], [11.4, 5], [13.4, 6.4], [12, 7.6], [9.6, 5.8]], raw);                           // where the chunk came off
  g.poly([[9.6, 6], [10.4, 6.2], [7.4, 10], [8.4, 13.6], [7.6, 13.8], [6.4, 10]], hex(0x2a2634));      // the crack
  g.disc(6, 6, 1.5, raw); g.disc(11, 11, 1.2, raw);
  g.disc(11, 5.6, 0.7, hot); g.disc(7.6, 9.6, 0.6, hot);
  return g.outline(hex(0x1c1626));
}
function meteor() {
  const g = new Grid(17, 17);
  g.poly([[8, 0.8], [14, 3], [16.2, 9], [12.6, 15.4], [5, 16], [0.8, 10], [2.4, 3.4]], hex(0x6e6a7a));
  g.bevel(1.2, 0.7);
  g.disc(6, 6, 1.5, hex(0x4a4658)); g.disc(11, 11, 1.2, hex(0x4a4658));           // craters
  return g.outline(hex(0x1c1626));
}
// drops (v6): a capsule with a plain symbol; the six kinds differ in colour and shape
function capsule(color, draw) {
  const g = new Grid(13, 13);
  g.disc(6.5, 6.5, 5.6, hex(0x1c2a3e));
  g.ring(6.5, 6.5, 4.6, 5.6, hex(color));
  draw(g, hex(color));
  return g.outline(hex(0x0c1220));
}
const bar = (g, c, x0, y0, x1, y1) => g.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], c);
const dropRepair = () => capsule(0x7fe7a0, (g, c) => { bar(g, c, 5.5, 3.5, 7.5, 9.5); bar(g, c, 3.5, 5.5, 9.5, 7.5); });
const dropOverhaul = () => capsule(0xfff1c9, (g, c) => { bar(g, c, 5.5, 3, 7.5, 10); bar(g, c, 3, 5.5, 10, 7.5); g.disc(6.5, 6.5, 1.2, hex(0xff6b5a)); });
const dropHaste = () => capsule(0xffd24a, (g, c) => { for (const y of [3.4, 6.2]) g.poly([[6.5, y], [9.4, y + 2.6], [3.6, y + 2.6]], c); });
const dropBoost = () => capsule(0x8ff6ff, (g, c) => { g.poly([[6.5, 3], [9.6, 7], [7.4, 7], [7.4, 10], [5.6, 10], [5.6, 7], [3.4, 7]], c); });
const dropAegis = () => capsule(0xb8a0ff, (g, c) => { g.poly([[4, 3.6], [9, 3.6], [9, 7], [6.5, 10], [4, 7]], c); });
const dropUpgrade = () => capsule(0xff8a4a, (g, c) => { g.poly([[6.5, 2.6], [7.8, 5.4], [10.4, 5.6], [8.4, 7.6], [9, 10.2], [6.5, 8.8], [4, 10.2], [4.6, 7.6], [2.6, 5.6], [5.2, 5.4]], c); });

// the wingman of the airframe mod: a small copy of the player's ship in the same colours
function wing() {
  const g = new Grid(12, 13);
  g.poly([[5.4, 5], [1, 9], [1, 10.6], [5.4, 9.6]], hex(0xa9b8c9), true);
  g.poly([[6, 0.6], [7.2, 4], [7, 12], [5, 12], [4.8, 4]], hex(0xdfe7ee));
  g.poly([[6, 2.6], [6.7, 4.6], [6, 6.4], [5.3, 4.6]], hex(0x2f8f9d));
  g.bevel();
  g.poly([[5.5, 12], [6.5, 12], [6.5, 12.8], [5.5, 12.8]], hex(0xffb347));
  return g.outline();
}

// ---------- shots, shadows, effects ----------
const enemyShot = () => new Grid(9, 9).disc(4.5, 4.5, 3.4, hex(0xff3d8b)).disc(4.5, 4.5, 1.7, hex(0xfff1c9)).outline(hex(0x3a0f2e));
// the lancers' fast shot: long and narrow so its heading reads at a glance (drawn rotated to its direction, nose down here)
const lance = () => new Grid(7, 15).poly([[3.5, 14.4], [6, 9], [5, 1], [2, 1], [1, 9]], hex(0xff3d8b)).poly([[3.5, 12], [4.4, 8], [3.5, 3], [2.6, 8]], hex(0xfff1c9)).outline(hex(0x3a0f2e));
// the heavy-rounds mod: a thicker, warmer player shot
const heavyShot = () => new Grid(7, 12).poly([[1, 11], [1, 4], [3.5, 0.6], [6, 4], [6, 11]], hex(0xffe08a)).poly([[2.6, 10], [2.6, 4], [4.4, 4], [4.4, 10]], hex(0xffffff)).outline(hex(0x6b4a14));
// marks the safe gap of a coming wall (a chevron pointing down; tinted by the view)
const gapMark = () => new Grid(11, 8).poly([[1, 1], [5.5, 5], [10, 1], [10, 3.4], [5.5, 7.4], [1, 3.4]], hex(0xffffff));
const playerShot = () => new Grid(5, 11).poly([[1, 10], [1, 3], [2.5, 0.5], [4, 3], [4, 10]], hex(0x8ff6ff)).poly([[2, 9], [2, 3], [3, 3], [3, 9]], hex(0xffffff)).outline(hex(0x14536b));
// the ship's shots at rapid-fire levels 1 to 3: longer, then an arrowhead, then a white-hot bolt with swept wings
const shotB = () => new Grid(7, 14).poly([[1, 13], [1, 4], [3.5, 0.5], [6, 4], [6, 13]], hex(0x5fd0ff)).poly([[2.4, 12], [2.4, 4], [4.6, 4], [4.6, 12]], hex(0xffffff)).outline(hex(0x12406b));
const shotC = () => new Grid(9, 17).poly([[1, 16], [1, 7], [4.5, 0.5], [8, 7], [8, 16], [4.5, 13]], hex(0x7fe9ff)).poly([[3, 13], [3, 6], [4.5, 3], [6, 6], [6, 13]], hex(0xffffff)).outline(hex(0x1a4a8a));
const shotD = () => new Grid(11, 19).poly([[0.5, 18], [2, 8], [5.5, 0.5], [9, 8], [10.5, 18], [5.5, 14]], hex(0x9ffbff)).poly([[3, 15], [3.4, 7], [5.5, 2.5], [7.6, 7], [8, 15], [5.5, 12.5]], hex(0xffffff)).poly([[4.6, 11], [4.6, 6], [6.4, 6], [6.4, 11]], hex(0xfff3b0)).outline(hex(0x2060c0));
function shadow() {                                          // soft-edged by a checker fringe, not by blur
  const g = new Grid(20, 12);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 20; x++) {
    const dx = (x + 0.5 - 10) / 10, dy = (y + 0.5 - 6) / 6, d = dx * dx + dy * dy;
    if (d <= 0.62 || (d <= 1 && (x + y) % 2 === 0)) g.px[y * 20 + x] = hex(0x141024, 110);
  }
  return g;
}
const ring = () => new Grid(32, 32).ring(16, 16, 12.6, 15.2, hex(0xffffff));
const puff = () => new Grid(7, 7).disc(3.5, 3.5, 3.2, hex(0xffffff));
const spark = () => new Grid(2, 2).disc(1, 1, 2, hex(0xffffff));
const dot = () => new Grid(1, 1).disc(0.5, 0.5, 1, hex(0xffffff));
const core = () => new Grid(5, 5).disc(2.5, 2.5, 2.2, hex(0xfff7d6)).outline(hex(0x1c1626));   // the ship's hit point

export const BANKS = [-2, -1, 0, 1, 2];
const jetFrame = bank => `jet${bank + 2}`;

/** @returns { canvas, frames: { name: { x, y, w, h } } } — draw once at boot. */
export function buildAtlas() {
  const sprites = {
    ...Object.fromEntries(BANKS.map(b => [jetFrame(b), jet(b)])), ...gearParts(),
    carrier: carrier(), ...vfx(),
    drone: drone(), gunner: gunner(), weaver: weaver(), diver: diver(),
    lancer: lancer(), miner: miner(), mine: mine(), bulwark: bulwark(), splitter: splitter(), shard: shard(), wing: wing(),
    seeker: seeker(), beamer: beamer(), peak: peak(), meteor: meteor(), peakHurt: peakHurt(), meteorHurt: meteorHurt(),
    dropRepair: dropRepair(), dropHaste: dropHaste(), dropBoost: dropBoost(), dropAegis: dropAegis(), dropOverhaul: dropOverhaul(), dropUpgrade: dropUpgrade(),
    enemyShot: enemyShot(), lance: lance(), playerShot: playerShot(), shotB: shotB(), shotC: shotC(), shotD: shotD(), heavyShot: heavyShot(), gapMark: gapMark(), shadow: shadow(), ring: ring(), puff: puff(), spark: spark(), dot: dot(), core: core(),
  };
  const W = 256, frames = {};
  let x = 1, y = 1, rowH = 0;
  for (const [name, g] of Object.entries(sprites)) {          // simple shelf packing, 1 px gutters
    if (x + g.w + 1 > W) { x = 1; y += rowH + 1; rowH = 0; }
    frames[name] = { x, y, w: g.w, h: g.h, grid: g };
    x += g.w + 1; rowH = Math.max(rowH, g.h);
  }
  const H = y + rowH + 1;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(W, H);
  for (const f of Object.values(frames)) {
    const g = f.grid;
    for (let py = 0; py < g.h; py++) for (let px = 0; px < g.w; px++) {
      const p = g.px[py * g.w + px];
      if (p) img.data.set(p, ((f.y + py) * W + f.x + px) * 4);
    }
    delete f.grid;
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, frames };
}

// ---------- bosses and mid-bosses ----------
// Finished pictures (art/raw/boss/*.png, drawn from art/boss_brief.md and turned into palette data by
// art/tools/boss_forms.py), in a canvas of their own. A boss is a ship far bigger than the screen, bow down: three
// frames (armour on, plates off, the core alone). `core` says where its core sits in the first two, which is where the
// sim's hit circle is; the view hangs the picture from that point, so at rest only the bow is on screen.
export const BOSS_STAGES = 3;
/** @returns { canvas, frames: { name | name_1 | name_2: { x, y, w, h } }, info: { name: { px, core: [x, y] } } } */
export function buildBosses() {
  const sprites = {}, info = {};
  // leg six's are named l6boss, l6boss2, ..., l6mid1, ...; their third stage is still the whole animal (full: the
  // picture hangs from the core in every stage), where a leg-one boss's third stage is its core alone
  // leg two's are ships like leg one's (their third stage is the core alone): l2boss, l2boss2, l2boss3m / l2boss3e (the
  // twins, one picture per form), l2boss4, l2mid1, ...
  const all = [...Object.entries(BOSS_FORMS), ...Object.entries(LEG6_FORMS).map(([n, v]) => [`l6${n}`, { ...v, full: true }]), ...Object.entries(LEG2_FORMS).map(([n, v]) => [`l2${n}`, v]), ...Object.entries(LEG3_FORMS).map(([n, v]) => [`l3${n}`, v]), ...Object.entries(LEG4_FORMS).map(([n, v]) => [`l4${n}`, v]), ...Object.entries(LEG5_FORMS).map(([n, v]) => [`l5${n}`, v])];
  for (const [name, { px, palette, core, stages, full }] of all) {
    info[name] = { px, core, full: !!full };
    stages.forEach((rows, st) => {
      const g = new Grid(rows[0].length, rows.length);
      rows.forEach((row, y) => { for (let x = 0; x < g.w; x++) if (row[x] !== '.') g.px[y * g.w + x] = hex(palette[row.charCodeAt(x) - 48]); });
      sprites[st ? `${name}_${st}` : name] = g;
    });
  }
  // leg six's creatures and its tree (art/tools/creature_forms.py), named l6c_<name>: finer than the atlas's shapes,
  // so they live here with the other pictures
  // ... and leg two's machines (the same converter), named l2c_<name>
  for (const [prefix, set] of [['l6c_', LEG6_CREATURES], ['l2c_', LEG2_MACHINES], ['l3c_', LEG3_MACHINES], ['l4c_', LEG4_MACHINES], ['l5c_', LEG5_MACHINES]]) for (const [name, { px, palette, rows }] of Object.entries(set)) {
    const g = new Grid(rows[0].length, rows.length);
    rows.forEach((row, y) => { for (let x = 0; x < g.w; x++) if (row[x] !== '.') g.px[y * g.w + x] = hex(palette[row.charCodeAt(x) - 48]); });
    sprites[`${prefix}${name}`] = g; info[`${prefix}${name}`] = { px, core: null, full: false };
  }
  const W = 1024, frames = {};
  let x = 1, y = 1, rowH = 0;
  for (const [name, g] of Object.entries(sprites)) {
    if (x + g.w + 1 > W) { x = 1; y += rowH + 1; rowH = 0; }
    frames[name] = { x, y, w: g.w, h: g.h, grid: g };
    x += g.w + 1; rowH = Math.max(rowH, g.h);
  }
  const H = y + rowH + 1, canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(W, H);
  for (const f of Object.values(frames)) { const g = f.grid; for (let py = 0; py < g.h; py++) for (let px = 0; px < g.w; px++) { const p = g.px[py * g.w + px]; if (p) img.data.set(p, ((f.y + py) * W + f.x + px) * 4); } delete f.grid; }
  ctx.putImageData(img, 0, 0);
  return { canvas, frames, info };
}

// ---------- the ship's upgraded forms ----------
// Three finished airframes (art/raw/ship_*.jpg, turned into palette data by art/tools/ship_forms.py). They are drawn
// from that data into a canvas of their own at one world pixel per art pixel, sampled smoothly: their art is three
// times finer than the rest of the atlas, so it cannot share the atlas's nearest-neighbour scale.
export const SHIP_ORDER = ['wing', 'heavy', 'rail'];
export const SHIP_SCALE = 1;                                  // world px per art pixel
/** @returns { canvas, frames: { '<form><bank + 2>': { x, y, w, h } } } — five bank frames per form. */
export function buildShips() {
  const sprites = {};
  for (const name of SHIP_ORDER) {
    const rows = SHIP_FORMS[name], w = rows[0].length, h = rows.length;
    for (const b of BANKS) {
      const sq = JET_SQUEEZE[Math.abs(b)], w2 = Math.round(w * sq), g = new Grid(w2, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w2; x++) {
        const ch = rows[y][Math.min(w - 1, Math.max(0, Math.floor((x + 0.5 - w2 / 2) / sq + w / 2)))];
        if (ch !== '.') g.px[y * w2 + x] = hex(SHIP_PALETTE[ch.charCodeAt(0) - 48]);
      }
      sprites[`${name}${b + 2}`] = g.tilt(b * 0.09);
    }
  }
  const W = 512, frames = {};
  let x = 1, y = 1, rowH = 0;
  for (const [name, g] of Object.entries(sprites)) {
    if (x + g.w + 1 > W) { x = 1; y += rowH + 1; rowH = 0; }
    frames[name] = { x, y, w: g.w, h: g.h, grid: g };
    x += g.w + 1; rowH = Math.max(rowH, g.h);
  }
  const H = y + rowH + 1, canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(W, H);
  for (const f of Object.values(frames)) { const g = f.grid; for (let py = 0; py < g.h; py++) for (let px = 0; px < g.w; px++) { const p = g.px[py * g.w + px]; if (p) img.data.set(p, ((f.y + py) * W + f.x + px) * 4); } delete f.grid; }
  ctx.putImageData(img, 0, 0);
  return { canvas, frames };
}

export const jetFrameFor = bank => jetFrame(Math.max(-2, Math.min(2, Math.round(bank))));
