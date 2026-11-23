// v4: three looks, one per chapter (uChapter): the coast at dusk, a night flight above a sea of cloud, a canyon at dawn.
// The ground under the fight: islands, coast and autumn woodland seen from altitude, drawn by one fragment shader into
// a small render texture and shown enlarged with nearest sampling (1 ground pixel = PIXEL world px, the same pixel
// size as the sprites). 0 bytes of images. Render layer only: nothing here is read by the sim.
//
// Fake 3D, all in the shader:
//   - perspective: the top of the screen is farther away, so the ground is compressed there and scrolls slower
//   - relief: the height field is lit from the sun's side, slopes facing away fall into shade (three flat tones)
//   - clouds below the aircraft drift faster than the ground (parallax) and drop a shadow offset from themselves
//   - distance haze toward the top
//   - speed: a near layer of low cloud streaks races past under the aircraft, and the perspective deepens as the
//     flight speeds up (uRush)
// Clouds never cover the play field's bullets: they are part of this background, under every sprite (fairness E3).
import { Geometry, GlProgram, Mesh, RenderTexture, Shader, Sprite } from 'pixi.js';

export const PIXEL = 3;                 // world px per ground pixel (and per sprite art pixel)

// Legs two to five, chapter by chapter: where the world's edge sits (a fraction of the screen height from the top; NONE
// = the world fills the view) and how its air glows. Seen as the real bodies would be: the airless moon, Titania and
// Pluto's thin layered haze from orbit; Mercury, Venus, Jupiter, Titan, Uranus and Neptune from low enough that their
// ground or cloud fills the view; the sun from inside its own light; the black hole has no edge, only its shadow.
const NONE = -0.10;
const FRAMES = {
  2: { horizon: [0.16, NONE, NONE, 0.13], air: [0, 0, 0, 1] },
  3: { horizon: [0.14, NONE, NONE, 0.24], air: [0.6, 0, 0, 1] },
  4: { horizon: [NONE, 0.20, NONE, 0.16], air: [0, 0, 0, 0.9] },
  5: { horizon: [NONE, NONE, NONE, NONE], air: [0, 0, 0, 0] },
};

const vertex = `#version 300 es
in vec2 aPosition;
out vec2 vUV;
void main() {
  vUV = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const fragment = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 finalColor;
uniform vec2 uSize;      // render texture size in ground pixels
uniform float uScroll;   // ground pixels flown
uniform float uDrift;    // seconds, for cloud drift and water shimmer
uniform float uCamX;     // sideways parallax, ground pixels
uniform float uOctaves;  // 5 = full, 3 = low effects
uniform float uRush;     // 0 cruising .. 1 flat out: stronger perspective and more low cloud racing past
uniform float uLeg;      // 0 = leg one's looks, 1 = leg six's (the Mesozoic): rift, forest, seaway, the burning end;
                         // 2 = leg two's (the inner planets): the moon, Mercury, Venus, the ruined Earth;
                         // 3 = leg three's (the outer giants): Mars, Jupiter, Titan, Saturn (seen the same way as leg two's);
                         // 4 = leg four's (the underworld's edge): Uranus, Titania, Neptune, Pluto;
                         // 5 = leg five's (the sun and the black hole): corona, photosphere, the black hole twice
uniform float uView;     // sideways view shift, ground pixels: what the clouds, the near layer, the far sky and the
                         // planet's dark rim follow (the ground itself follows uCamX, which leg six keeps at 0)
uniform float uChapter;  // 0 coast at dusk .. 1 night above a sea of cloud .. 2 canyon at dawn .. 3 orbit (fractions blend)
uniform vec4 uHorizon;   // legs two to five, per chapter: how far down the screen the world's edge sits (a fraction of the
                         // height); below zero = no edge in view, the world fills the screen
uniform vec4 uAir;       // per chapter: how strongly the air glows above that edge (0 = airless, a sharp rim)

float bayer(vec2 p);
// a far body in the sky (a moon, a planet), shaded as a ball lit from the upper left: a soft terminator stepped into
// dithered pixel tones, darker toward its limb, its edge blended over one pixel (no outline). halo = the colour its
// air glows just outside the limb and along the lit edge (black = airless). w = how much of it shows.
const vec3 LIGHT = vec3(-0.55, -0.55, 0.63);
vec3 body(vec3 sky, vec2 p, vec2 c, float r, vec3 col, vec3 halo, float w) {
  vec2 q = (p - c) / r;
  float d = length(q), out_ = (d - 1.0) * r;
  if (w <= 0.0 || out_ > 12.0) return sky;
  vec3 outside = sky + halo * exp(-max(out_, 0.0) / 2.2);
  vec3 n = vec3(q, sqrt(max(1.0 - d * d, 0.0)));
  float lit = smoothstep(-0.20, 0.60, dot(n, normalize(LIGHT)));
  lit = floor(lit * 5.0 + 0.5 + bayer(p) * 0.9) / 5.0;
  vec3 b = col * (0.08 + 1.02 * lit) * (0.72 + 0.28 * n.z) + halo * pow(1.0 - n.z, 3.0) * lit;
  return mix(sky, mix(outside, b, clamp(-out_ + 0.5, 0.0, 1.0)), w);
}

float hash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p, float octaves) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) {
    if (float(i) >= octaves) break;
    s += a * noise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s;
}
float bayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float m = mod(q.x * 5.0 + q.y * 3.0 + mod(q.x, 2.0) * 8.0 + mod(q.y, 2.0) * 2.0, 16.0);
  return m / 16.0 - 0.5;
}
float height(vec2 g) {
  float h = fbm(g * 0.0105, uOctaves);
  h += 0.22 * (noise(g * 0.0031 + 40.0) - 0.5);           // big shapes: where the islands are
  return h;
}

void main() {
  vec2 px = floor(vUV * uSize);
  // The render target's rows run downward on screen (row 0 is the top). t is measured from the bottom of the screen:
  // 0 = the near edge, under the ship; 1 = the far edge, ahead. Ground the ship flies over comes down the screen.
  float t = 1.0 - (px.y + 0.5) / uSize.y;
  // leg six is seen from straight above (no perspective): its ground carries things that stand on it (a pack, the
  // mark where a bomb will land), and they can only stay put on ground that moves at one speed everywhere.
  float L2 = step(1.5, uLeg), L3 = step(2.5, uLeg) * (1.0 - step(3.5, uLeg)), L4 = step(3.5, uLeg) * (1.0 - step(4.5, uLeg)), L5 = step(4.5, uLeg);   // L2 = seen from orbit (legs two to five); L3..L5 = each leg's own worlds
  float persp = 1.0 - step(0.5, uLeg) * (1.0 - L2);
  float far = t * (1.0 + (0.85 + 0.55 * uRush) * t * persp);                 // perspective: far rows cover more ground
  float widen = 1.0 + (0.55 + 0.35 * uRush) * t * persp;
  vec2 g = vec2((px.x - uSize.x * 0.5) * widen + uCamX, far * uSize.y + uScroll);
  float d = bayer(px) * 0.018;

  float h = height(g) + d;
  float hs = height(g + vec2(-4.0, 4.0));                   // toward the sun (upper left)
  float slope = (h - d - hs) * 6.0;                         // > 0: facing the sun
  float patch_ = noise(g * 0.021 + 7.0) + 0.5 * noise(g * 0.05 + 3.0) + d * 3.0;

  float night = clamp(1.0 - abs(uChapter - 1.0), 0.0, 1.0), dawn = clamp(uChapter - 1.0, 0.0, 1.0) * clamp(3.0 - uChapter, 0.0, 1.0), space = clamp(uChapter - 2.0, 0.0, 1.0);
  // leg six: the same relief, its own four looks. c0..c3 are how much of each chapter's look shows (they sum to 1).
  float L = step(0.5, uLeg) * (1.0 - L2);
  float c0 = clamp(1.0 - uChapter, 0.0, 1.0), c1 = clamp(1.0 - abs(uChapter - 1.0), 0.0, 1.0), c2 = clamp(1.0 - abs(uChapter - 2.0), 0.0, 1.0), c3 = clamp(uChapter - 2.0, 0.0, 1.0);
  night *= 1.0 - L - L2; dawn *= 1.0 - L - L2; space *= 1.0 - L - L2;
  vec3 col;
  float sea = 0.47 - 0.13 * dawn;                           // the canyon: water only in the deepest cuts
  if (L > 0.5) sea = 0.40 * c0 + 0.43 * c1 + 0.60 * c2 + 0.38 * c3;   // the seaway is mostly water; the rift and the end have only cuts
  if (h < sea) {
    float depth = (sea - h) / sea;
    vec3 deep = vec3(0.10, 0.25, 0.42), mid = vec3(0.13, 0.42, 0.55), shallow = vec3(0.30, 0.68, 0.66), lagoon = vec3(0.62, 0.86, 0.74);
    col = depth > 0.30 ? deep : depth > 0.16 ? mid : depth > 0.06 ? shallow : lagoon;
    float glint = noise(vec2(g.x * 0.09, g.y * 0.32 + uDrift * 0.6));
    if (depth > 0.06 && glint > 0.80) col += 0.07;
    float foam = noise(g * 0.07 + vec2(uDrift * 0.15, 0.0));
    if (depth < 0.022 + 0.012 * foam) col = vec3(0.93, 0.95, 0.88);
  } else {
    float e = (h - sea) / (1.0 - sea);
    vec3 sand = vec3(0.90, 0.80, 0.56);
    vec3 gold = vec3(0.89, 0.66, 0.24), amber = vec3(0.85, 0.47, 0.17), rust = vec3(0.67, 0.29, 0.17);
    vec3 pine = vec3(0.20, 0.38, 0.31), moss = vec3(0.45, 0.55, 0.28), rock = vec3(0.73, 0.62, 0.55), cream = vec3(0.95, 0.88, 0.76);
    if (e < 0.035) col = sand;
    else if (e > 0.50) col = e > 0.60 ? cream : rock;
    else col = patch_ < 0.42 ? pine : patch_ < 0.62 ? moss : patch_ < 0.86 ? gold : patch_ < 1.08 ? amber : rust;
    if (dawn > 0.0 && e >= 0.035) {                         // canyon: banded rock instead of woodland
      float band = fract(e * 9.0 + 0.15 * noise(g * 0.03));
      vec3 mesa = e > 0.50 ? vec3(0.86, 0.66, 0.50) : band < 0.30 ? vec3(0.66, 0.36, 0.27) : band < 0.62 ? vec3(0.76, 0.48, 0.31) : band < 0.86 ? vec3(0.83, 0.60, 0.38) : vec3(0.50, 0.27, 0.24);
      if (patch_ < 0.34) mesa = vec3(0.40, 0.44, 0.31);                           // sparse scrub
      col = mix(col, mesa, dawn);
    }
    // relief in three flat tones
    if (e >= 0.035) col *= slope > 0.10 ? 1.10 : slope < -0.10 ? 0.74 : 0.93;
    // tree-top speckle on the woodland
    if (e >= 0.035 && e <= 0.50 && hash(floor(g / 2.0)) > 0.86) col *= 0.86;
  }

  if (L > 0.5) {
    vec3 m;
    if (h < sea) {
      float depth = (sea - h) / sea;
      vec3 lava = depth > 0.10 ? vec3(0.74, 0.30, 0.10) : vec3(0.40, 0.15, 0.10);            // the rift: dim lava in the cuts
      vec3 river = depth > 0.20 ? vec3(0.06, 0.15, 0.20) : vec3(0.09, 0.23, 0.26);           // the forest: a dark river
      vec3 water = depth > 0.30 ? vec3(0.07, 0.17, 0.33) : depth > 0.14 ? vec3(0.10, 0.30, 0.42) : depth > 0.05 ? vec3(0.20, 0.50, 0.52) : vec3(0.50, 0.74, 0.66);
      vec3 fire = depth > 0.12 ? vec3(0.58, 0.19, 0.07) : vec3(0.28, 0.09, 0.07);            // the end: the low ground burns
      m = lava * c0 + river * c1 + water * c2 + fire * c3;
      float foam = noise(g * 0.07 + vec2(uDrift * 0.15, 0.0));
      if (c2 > 0.5 && depth < 0.022 + 0.012 * foam) m = vec3(0.90, 0.93, 0.86);
    } else {
      float e = (h - sea) / (1.0 - sea);
      vec3 rift = e > 0.55 ? vec3(0.50, 0.30, 0.24) : patch_ < 0.50 ? vec3(0.34, 0.37, 0.21) : patch_ < 0.85 ? vec3(0.45, 0.27, 0.20) : vec3(0.57, 0.35, 0.24);
      vec3 wood = e > 0.62 ? vec3(0.21, 0.33, 0.19) : patch_ < 0.45 ? vec3(0.07, 0.19, 0.13) : patch_ < 0.80 ? vec3(0.11, 0.27, 0.15) : vec3(0.25, 0.25, 0.13);
      vec3 reef = e < 0.07 ? vec3(0.80, 0.72, 0.52) : e > 0.42 ? vec3(0.52, 0.50, 0.44) : patch_ < 0.60 ? vec3(0.24, 0.42, 0.30) : vec3(0.44, 0.48, 0.28);
      vec3 char_ = e > 0.50 ? vec3(0.26, 0.22, 0.24) : patch_ < 0.50 ? vec3(0.10, 0.09, 0.10) : patch_ < 0.85 ? vec3(0.20, 0.14, 0.12) : vec3(0.44, 0.17, 0.08);
      m = rift * c0 + wood * c1 + reef * c2 + char_ * c3;
      m *= slope > 0.10 ? 1.10 : slope < -0.10 ? 0.74 : 0.93;
      // tree crowns: blobs several pixels across, lit on one side. Not leg one's 2 px speckle: on ground that is all
      // woodland the speckle is the only texture, and far rows step across it faster than its size, so it strobes and
      // the ground seems to run backwards.
      float crown = noise(g * 0.115), lit = noise((g + vec2(-2.0, 2.0)) * 0.115);
      m *= crown > 0.60 ? (lit < crown ? 1.16 : 1.04) : crown < 0.36 ? 0.78 : 0.94;
    }
    col = m;
  }

  if (L2 > 0.5) {                                           // leg two: four worlds seen from low orbit
    float tone = slope > 0.10 ? 1.12 : slope < -0.10 ? 0.72 : 0.92;
    // the moon: grey dust, and craters: a dark floor with a rim lit on the sun's side (upper left)
    vec3 moon = h > 0.60 ? vec3(0.56, 0.58, 0.63) : h > 0.46 ? vec3(0.42, 0.44, 0.50) : h > 0.34 ? vec3(0.31, 0.33, 0.39) : vec3(0.22, 0.24, 0.30);
    vec2 cell = floor(g / 34.0), f = g - cell * 34.0 - 17.0 - (vec2(hash(cell), hash(cell + 5.1)) - 0.5) * 16.0;
    float cr = 5.0 + 9.0 * hash(cell + 2.7), cd = length(f) / cr;
    if (hash(cell + 9.3) > 0.30) {
      if (cd < 0.82) moon *= 0.66 + 0.12 * step(0.0, f.x + f.y);
      else if (cd < 1.18) moon *= f.x + f.y < 0.0 ? 1.30 : 0.80;
    }
    // Mercury: scorched basalt with glowing seams of lava along the contour lines
    vec3 merc = patch_ < 0.55 ? vec3(0.24, 0.20, 0.19) : patch_ < 0.95 ? vec3(0.33, 0.27, 0.24) : vec3(0.44, 0.36, 0.30);
    float seam = abs(fract(h * 7.0 + 0.3 * noise(g * 0.02)) - 0.5);
    if (seam < 0.035) merc = seam < 0.015 ? vec3(0.88, 0.46, 0.16) : vec3(0.56, 0.22, 0.10);
    // Venus: no ground, a sea of acid cloud swirling in bands
    float sw = fbm(g * 0.008 + vec2(3.0 * fbm(g * 0.004 + vec2(0.0, uDrift * 0.03), 3.0), 0.0), uOctaves);
    vec3 venus = sw > 0.62 ? vec3(0.93, 0.80, 0.48) : sw > 0.52 ? vec3(0.84, 0.64, 0.33) : sw > 0.42 ? vec3(0.70, 0.48, 0.24) : vec3(0.52, 0.33, 0.18);
    // the ruined Earth: dark sea, broken land, fires, grey city grids
    vec3 earth;
    if (h < 0.45) earth = h < 0.36 ? vec3(0.06, 0.13, 0.24) : vec3(0.09, 0.20, 0.32);
    else {
      earth = patch_ < 0.50 ? vec3(0.18, 0.22, 0.16) : patch_ < 0.90 ? vec3(0.27, 0.24, 0.19) : vec3(0.35, 0.33, 0.30);
      vec2 blk = floor(g / 6.0);
      if (patch_ > 0.80 && hash(blk) > 0.55) earth = mod(g.x, 6.0) < 1.0 || mod(g.y, 6.0) < 1.0 ? vec3(0.22, 0.22, 0.24) : vec3(0.42, 0.42, 0.44);
      if (noise(g * 0.06 + 31.0) > 0.86) earth = vec3(0.72, 0.28, 0.10);
    }
    col = (moon * tone) * c0 + (merc * (seam < 0.035 ? 1.0 : tone)) * c1 + venus * c2 + (earth * (h < 0.45 ? 1.0 : tone)) * c3;
    if (L3 > 0.5) {
      // Mars: red dust and rock, a canyon wall where the relief is steep, a few dark dunes
      vec3 mars = h > 0.58 ? vec3(0.70, 0.36, 0.22) : h > 0.44 ? vec3(0.58, 0.27, 0.16) : h > 0.34 ? vec3(0.46, 0.20, 0.13) : vec3(0.30, 0.13, 0.10);
      if (abs(slope) > 0.22) mars = vec3(0.24, 0.10, 0.08);
      // Jupiter: bands across the screen, bent by eddies, and the great red storm
      float lat = g.y * 0.012 + 1.6 * fbm(g * 0.006 + vec2(uDrift * 0.02, 0.0), uOctaves), band = fract(lat);
      vec3 jup = band < 0.22 ? vec3(0.86, 0.74, 0.58) : band < 0.45 ? vec3(0.70, 0.48, 0.32) : band < 0.70 ? vec3(0.92, 0.86, 0.72) : vec3(0.58, 0.38, 0.26);
      vec2 spot = vec2(mod(g.x + 60.0, 260.0) - 130.0, mod(g.y, 900.0) - 450.0);
      float sp = length(spot * vec2(1.0, 1.7));
      if (sp < 46.0) jup = sp < 30.0 ? vec3(0.74, 0.30, 0.20) : vec3(0.84, 0.48, 0.32);
      // Titan: orange haze over dark methane lakes and ridges of ice
      vec3 titan = h < 0.42 ? (h < 0.34 ? vec3(0.10, 0.10, 0.12) : vec3(0.18, 0.16, 0.14)) : h > 0.60 ? vec3(0.78, 0.70, 0.54) : vec3(0.58, 0.44, 0.24);
      // Saturn: pale gold bands, and the rings crossing the view as bright arcs with a dark gap
      float sb = fract(g.y * 0.009 + 0.6 * fbm(g * 0.004, 3.0));
      vec3 sat = sb < 0.5 ? vec3(0.86, 0.78, 0.56) : vec3(0.76, 0.66, 0.44);
      float rr = abs(g.x * 0.35 + (g.y - 400.0 * floor(g.y / 400.0)) - 200.0);
      if (rr < 26.0) sat = rr < 4.0 ? vec3(0.20, 0.18, 0.16) : rr < 14.0 ? vec3(0.94, 0.90, 0.78) : vec3(0.80, 0.74, 0.60);
      col = (mars * tone) * c0 + jup * c1 + (titan * (h < 0.42 ? 1.0 : tone)) * c2 + sat * c3;
    }
    if (L4 > 0.5) {
      // Uranus: a pale cyan-green haze, almost featureless; faint bands tilted across the view
      float ub = fract((g.y + g.x * 0.35) * 0.006 + 0.4 * fbm(g * 0.003 + vec2(uDrift * 0.01, 0.0), 3.0));
      vec3 ura = ub < 0.5 ? vec3(0.56, 0.80, 0.80) : vec3(0.48, 0.72, 0.76);
      if (ub > 0.93) ura = vec3(0.70, 0.90, 0.88);
      // Titania: grey ice plains, long fault scarps where the relief is steep, fresh bright craters
      vec3 tita = h > 0.58 ? vec3(0.66, 0.66, 0.68) : h > 0.44 ? vec3(0.52, 0.52, 0.56) : h > 0.34 ? vec3(0.40, 0.40, 0.45) : vec3(0.28, 0.28, 0.33);
      if (abs(slope) > 0.20) tita = vec3(0.18, 0.18, 0.22);
      vec2 tc = floor(g / 46.0), tf = g - tc * 46.0 - 23.0 - (vec2(hash(tc + 2.3), hash(tc + 7.7)) - 0.5) * 18.0;
      float tr = length(tf);
      if (hash(tc) > 0.72 && tr < 11.0) tita = tr < 8.0 ? vec3(0.30, 0.31, 0.36) : vec3(0.84, 0.86, 0.88);
      // Neptune: deep blue storm bands, white streaks of high cloud, and the dark spot
      float nl = g.y * 0.010 + 1.4 * fbm(g * 0.005 + vec2(uDrift * 0.03, 0.0), uOctaves), nb = fract(nl);
      vec3 nep = nb < 0.30 ? vec3(0.14, 0.26, 0.62) : nb < 0.62 ? vec3(0.20, 0.36, 0.74) : vec3(0.12, 0.20, 0.52);
      if (fract(nl * 3.0 + 0.2) < 0.06 && noise(g * 0.02) > 0.55) nep = vec3(0.86, 0.90, 0.96);
      vec2 dsp = vec2(mod(g.x + 180.0, 320.0) - 160.0, mod(g.y + 300.0, 1000.0) - 500.0);
      if (length(dsp * vec2(1.0, 1.6)) < 40.0) nep = vec3(0.06, 0.10, 0.30);
      // Pluto: rust-dark tholin ground, and the pale heart of nitrogen ice cut into cells
      float heart = fbm(g * 0.0025 + vec2(5.0, 1.0), 3.0);
      vec3 plu = h > 0.56 ? vec3(0.46, 0.30, 0.24) : h > 0.40 ? vec3(0.36, 0.22, 0.18) : vec3(0.24, 0.15, 0.13);
      if (heart > 0.56) {
        vec2 pc = floor(g / 28.0), pf = g - pc * 28.0 - 14.0 - (vec2(hash(pc + 1.1), hash(pc + 3.9)) - 0.5) * 8.0;
        plu = max(abs(pf.x), abs(pf.y)) > 12.0 ? vec3(0.66, 0.66, 0.70) : vec3(0.88, 0.86, 0.84);
      }
      col = (ura * (0.92 + 0.08 * tone)) * c0 + (tita * tone) * c1 + nep * c2 + (plu * (heart > 0.56 ? 1.0 : tone)) * c3;
    }
    if (L5 > 0.5) {
      // the corona: gold plasma in filaments that drift, bright loops where it gathers
      float fil = fbm(vec2(g.x * 0.010, g.y * 0.004 + uDrift * 0.05), uOctaves);
      vec3 cor = fil > 0.62 ? vec3(1.00, 0.90, 0.58) : fil > 0.52 ? vec3(0.96, 0.66, 0.26) : fil > 0.42 ? vec3(0.78, 0.40, 0.12) : vec3(0.48, 0.20, 0.08);
      float loop = abs(fract((g.x + 60.0 * sin(g.y * 0.006)) * 0.004) - 0.5);
      if (loop < 0.012) cor = mix(cor, vec3(1.00, 0.96, 0.80), 0.7);
      // the photosphere: granules (bright cells, dark lanes between) and a few sunspots
      vec2 gc = floor(g / 22.0), gf = g - gc * 22.0 - 11.0 - (vec2(hash(gc + 4.2), hash(gc + 8.6)) - 0.5) * 9.0;
      float gr = length(gf) / 11.0;
      vec3 pho = gr < 0.55 ? vec3(1.00, 0.74, 0.34) : gr < 0.85 ? vec3(0.92, 0.56, 0.20) : vec3(0.62, 0.28, 0.08);
      vec2 sp = vec2(mod(g.x + 100.0, 340.0) - 170.0, mod(g.y, 760.0) - 380.0);
      float sl = length(sp * vec2(1.0, 1.3));
      if (sl < 34.0) pho = sl < 20.0 ? vec3(0.12, 0.05, 0.03) : vec3(0.44, 0.18, 0.06);
      // the black hole: near-black violet space, the accretion disk's bands sweeping round a centre above the screen, starlight drawn out into arcs
      vec2 q = g - vec2(uCamX * 0.2, uScroll - 1400.0);
      float rad = length(q), ang = atan(q.y, q.x);
      float disk = fbm(vec2(rad * 0.010, ang * 3.0 + uDrift * 0.15 - rad * 0.002), 3.0);
      vec3 hole = mix(vec3(0.03, 0.02, 0.07), vec3(0.10, 0.04, 0.16), noise(g * 0.004));
      if (disk > 0.60) hole = disk > 0.70 ? vec3(0.98, 0.70, 0.40) : vec3(0.52, 0.22, 0.30);
      float st = hash(floor(vec2(rad * 0.5, ang * 220.0)));
      if (st > 0.994) hole = vec3(0.86, 0.88, 1.00);
      vec3 hole2 = hole * vec3(0.80, 0.86, 1.10);
      col = (cor * 0.55) * c0 + (pho * 0.52) * c1 + hole * c2 + hole2 * c3;   // the sun a step darker than its own fire: bullets and warnings must read on it
    }
  }

  // clouds below the aircraft: faster than the ground, with a shadow down-right of each one
  vec2 cg = vec2((px.x - uSize.x * 0.5) * widen * 1.25 + uView * 1.6, far * uSize.y * 1.25 + uScroll * 1.7);
  cg += vec2(uDrift * 3.0, 0.0);
  float cloud = fbm(cg * 0.0075, 4.0) + 0.25 * (noise(cg * 0.002 + 11.0) - 0.5);
  float shadow = fbm((cg + vec2(-16.0, 22.0)) * 0.0075, 4.0) + 0.25 * (noise((cg + vec2(-16.0, 22.0)) * 0.002 + 11.0) - 0.5);
  float cover = 0.64 - 0.13 * night + 0.07 * dawn + 0.09 * L + L2 * mix(mix(0.40 * c0 + 0.30 * c1 + 0.04 * c2 + 0.10 * c3, 0.36 * c0 + 0.10 * c1 + 0.02 * c2 + 0.30 * c3, L3), 0.12 * c0 + 0.40 * c1 + 0.10 * c2 + 0.36 * c3, L4) + 2.0 * L5;   // leg two: no air on the moon or Mercury   // night: a sea of cloud; dawn: clear air; leg six: a few clouds only (the ground carries what matters there)
  if (uOctaves > 3.5 && shadow > cover) col *= vec3(0.70, 0.68, 0.80);
  // evening grade and distance haze (before the clouds, so they stay the brightest thing on the ground layer)
  col = mix(col, col * vec3(1.06, 0.97, 0.90), 0.6 * (1.0 - L2));
  col = mix(col, col * vec3(0.34, 0.42, 0.72) + vec3(0.02, 0.03, 0.07), night);   // moonlight: dark, never black
  col = mix(col, col * vec3(1.04, 0.92, 0.90), dawn);
  vec3 haze = mix(mix(vec3(0.98, 0.78, 0.66), vec3(0.26, 0.31, 0.56), night), vec3(1.00, 0.80, 0.72), dawn);
  col = mix(col, haze, t * t * 0.42 * (1.0 - L2));
  col = mix(col, vec3(dot(col, vec3(0.30, 0.50, 0.20))), 0.34 * dawn);   // dusty rock: enemy bullets must stay the loudest colour
  col *= 0.86 - 0.16 * dawn;                                // keep the field a step darker than bullets and ships
  if (cloud + d > cover) {
    vec3 lit = mix(vec3(0.95, 0.87, 0.82), vec3(0.50, 0.56, 0.80), night), mid = mix(vec3(0.85, 0.74, 0.78), vec3(0.36, 0.42, 0.70), night), under = mix(vec3(0.66, 0.58, 0.72), vec3(0.24, 0.28, 0.52), night);
    float up = fbm((cg + vec2(5.0, -6.0)) * 0.0075, 4.0) + 0.25 * (noise((cg + vec2(5.0, -6.0)) * 0.002 + 11.0) - 0.5);
    col = cloud + d < cover + 0.022 ? under : up < cloud - 0.012 ? mid : lit;
  }

  if (L > 0.5) {                                            // leg six's grade: a red sky over the end; smoke, not cloud
    if (cloud + d > cover) col = mix(col, col * vec3(0.44, 0.40, 0.42), c3);
    col = mix(col, col * vec3(1.06, 0.74, 0.64) + vec3(0.05, 0.0, 0.02), 0.55 * c3);
    col *= 0.94;
  }

  // orbit (chapter 4): the ground falls away into a deep blue-violet sky (never black) with stars drifting past, a
  // band of aurora, and the planet's lit limb along the bottom of the screen
  if (space > 0.0) {
    vec2 sg = vec2(px.x + uCamX * 0.3, (uSize.y - px.y) + uScroll * 0.35);
    vec3 sky = mix(vec3(0.07, 0.07, 0.17), vec3(0.13, 0.09, 0.24), noise(sg * 0.012));
    float glow = fbm(vec2(sg.x * 0.006, sg.y * 0.02 + uDrift * 0.05), 3.0);
    if (glow > 0.56) sky += vec3(0.04, 0.16, 0.14) * (glow > 0.62 ? 1.0 : 0.5);                     // aurora
    float star = hash(floor(sg / 2.0));
    if (star > 0.992) sky = vec3(0.92, 0.90, 0.80); else if (star > 0.982) sky += 0.16;
    float limb = t + 0.05 * sin(px.x / uSize.x * 3.1416);                                         // the planet's edge, curved, along the bottom of the screen, falling away behind the ship
    // the ground itself darkening toward its edge, a soft band of blue air over it, no drawn rim
    float lp = (limb - 0.11) * uSize.y;                                                            // ground pixels above the edge
    vec3 below = mix(col * 0.8, col * 0.55, smoothstep(-14.0, 0.0, lp));
    below = mix(below, vec3(0.45, 0.70, 0.86), smoothstep(-6.0, 0.0, lp) * 0.45);
    sky = mix(sky, vec3(0.30, 0.52, 0.74), clamp(0.70 * exp(-max(lp, 0.0) / 3.0) + 0.25 * exp(-max(lp, 0.0) / 12.0) + 0.03 * bayer(px), 0.0, 0.85));
    sky = mix(below, sky, clamp(lp + 0.5, 0.0, 1.0));
    col = mix(col, sky, space);
  }

  // near layer: hair-thin streaks of mist racing past just under the aircraft, 3.4x the ground's speed. Only there
  // while the flight is fast (uRush); still background (under every sprite) and faint, so nothing is hidden by it.
  vec2 wg = vec2((px.x - uSize.x * 0.5) * 1.6 + uView * 2.6, t * uSize.y * 1.6 + uScroll * 3.4);
  // dashes, not lines: a streak that ran the whole height stood still on screen whenever the ship did and read as a
  // seam in the ground. None on leg six, whose ground is seen from straight above and carries what stands on it.
  float streak = noise(vec2(wg.x * 0.37, wg.y * 0.05)) * (0.6 + 0.4 * noise(vec2(wg.x * 0.05 + 9.0, wg.y * 0.02)));
  if (uOctaves > 3.5 && uRush > 0.05 && L < 0.5 && streak > 0.80 - 0.12 * uRush) col = mix(col, vec3(0.98, 0.93, 0.88), 0.16 + 0.14 * uRush);
  if (L2 > 0.5) {
    // far: the planet's edge ahead, a circle much wider than the screen, with space and stars beyond it. It shifts the
    // least (0.12 of the view). Measured in ground pixels from the circle (sdf < 0 = on the planet), so the edge can be
    // blended over one pixel (no staircase), the surface can darken toward the limb as a ball does, and a thin
    // atmosphere can glow just outside it.
    float R = uSize.x * 2.4;
    vec4 cw = vec4(c0, c1, c2, c3);
    vec2 centre = vec2(uSize.x * 0.5 - uView * 0.12, uSize.y * dot(uHorizon, cw) + R);
    float sdf = length(px + 0.5 - centre) - R;
    vec3 rim = mix(mix(mix(vec3(0.70, 0.76, 0.90) * c0 + vec3(1.00, 0.66, 0.36) * c1 + vec3(1.00, 0.88, 0.58) * c2 + vec3(0.52, 0.76, 1.00) * c3,
                   vec3(1.00, 0.62, 0.44) * c0 + vec3(1.00, 0.90, 0.74) * c1 + vec3(1.00, 0.78, 0.40) * c2 + vec3(1.00, 0.94, 0.76) * c3, L3),
                   vec3(0.66, 0.96, 0.92) * c0 + vec3(0.80, 0.84, 0.90) * c1 + vec3(0.52, 0.70, 1.00) * c2 + vec3(0.94, 0.86, 0.80) * c3, L4),
                   vec3(1.00, 0.92, 0.60) * c0 + vec3(1.00, 0.80, 0.46) * c1 + vec3(1.00, 0.66, 0.40) * c2 + vec3(0.80, 0.70, 1.00) * c3, L5);
    vec3 air = mix(mix(mix(vec3(0.20, 0.24, 0.36) * c0 + vec3(0.42, 0.20, 0.10) * c1 + vec3(0.62, 0.46, 0.22) * c2 + vec3(0.14, 0.34, 0.66) * c3,
                   vec3(0.46, 0.20, 0.12) * c0 + vec3(0.50, 0.40, 0.30) * c1 + vec3(0.66, 0.42, 0.14) * c2 + vec3(0.54, 0.48, 0.34) * c3, L3),
                   vec3(0.24, 0.46, 0.46) * c0 + vec3(0.14, 0.16, 0.22) * c1 + vec3(0.10, 0.20, 0.52) * c2 + vec3(0.30, 0.44, 0.70) * c3, L4),
                   vec3(0.70, 0.40, 0.10) * c0 + vec3(0.66, 0.28, 0.06) * c1 + vec3(0.30, 0.10, 0.24) * c2 + vec3(0.18, 0.10, 0.34) * c3, L5);
    float airK = dot(uAir, cw);
    if (sdf > -40.0) {
      // no drawn rim: the ground darkens smoothly toward the limb as a ball does, and on a world with air the air seen
      // edge-on brightens the last pixels toward its own colour (an airless world keeps only a faint lit edge)
      float limb = clamp(-sdf / 40.0, 0.0, 1.0);                                   // 0 at the edge .. 1 well inside
      vec3 ground = col * (0.50 + 0.50 * sqrt(limb));
      float scat = pow(1.0 - limb, 5.0) * (0.12 + 0.48 * airK) + 0.025 * bayer(px);
      ground = mix(ground, rim * 0.85, clamp(scat, 0.0, 1.0));
      vec2 sg = vec2(px.x + uView * 0.12, px.y + uScroll * 0.05);
      vec3 sky = vec3(0.03, 0.04, 0.09) + vec3(0.05, 0.03, 0.08) * noise(sg * 0.02);
      float star = hash(floor(sg / 2.0));
      if (star > 0.990) sky = vec3(0.86, 0.88, 0.92); else if (star > 0.978) sky += 0.10;
      // what each world's sky holds, after the real ones: Earth rising over the moon; the moon over Earth; Phobos and
      // Deimos over Mars; Saturn's rings arching over its cloud tops; Uranus and its upright rings over Titania; Charon
      // and the far-off sun, a bright star, over Pluto
      vec2 bp = px + 0.5 + vec2(uView * 0.05, 0.0);
      float W = uSize.x, Hh = uSize.y, k2 = 1.0 - L3 - L4 - L5;
      vec2 ec = vec2(W * 0.74, Hh * 0.06);
      float cl = smoothstep(0.52, 0.68, fbm((bp - ec) * 0.22 + 3.0, 3.0) + 0.15);
      sky = body(sky, bp, ec, 13.0, mix(vec3(0.20, 0.38, 0.66), vec3(0.80, 0.82, 0.86), cl), vec3(0.10, 0.22, 0.46), c0 * k2);
      sky = body(sky, bp, vec2(W * 0.22, Hh * 0.05), 8.0, vec3(0.58, 0.60, 0.64), vec3(0.0), c3 * k2);
      sky = body(sky, bp, vec2(W * 0.66, Hh * 0.07), 5.0, vec3(0.50, 0.42, 0.36), vec3(0.0), c0 * L3);
      sky = body(sky, bp, vec2(W * 0.24, Hh * 0.04), 2.5, vec3(0.58, 0.50, 0.42), vec3(0.0), c0 * L3);
      if (c3 * L3 > 0.0) {
        // Saturn's rings arching over the sky: soft-edged bands of ice, the Cassini division a gap that fades in and
        // out, fine ringlets, thin enough that the stars still show through
        vec2 ac = vec2(W * 0.5 - uView * 0.08, Hh * 0.04 + 150.0);
        float rr = 150.0 - length(bp - ac);
        if (rr > -1.0 && rr < 14.0) {
          float dens = smoothstep(-0.5, 1.5, rr) * (1.0 - smoothstep(11.5, 13.5, rr));
          dens *= 1.0 - 0.90 * exp(-pow((rr - 5.2) / 0.8, 2.0));
          dens *= (rr < 5.2 ? 0.70 : 0.95) * (0.80 + 0.20 * noise(vec2(rr * 2.6, 1.0)));
          vec3 ring = mix(vec3(0.50, 0.46, 0.38), vec3(0.76, 0.70, 0.56), smoothstep(5.0, 10.0, rr)) * (0.95 + 0.05 * bayer(bp));
          sky = mix(sky, ring, dens * 0.92 * c3 * L3);
        }
      }
      if (c1 * L4 > 0.0) {
        // Uranus from Titania, its rings a tilted ellipse: the far half hidden behind the planet, the near half across it
        vec2 uc = vec2(W * 0.26, Hh * 0.05), uq = bp - uc;
        vec2 rq = vec2(uq.x * 0.94 + uq.y * 0.34, -uq.x * 0.34 + uq.y * 0.94);
        float ue = length(vec2(rq.x, rq.y * 5.0)) / 34.0;
        float ring = exp(-pow((ue - 1.62) / 0.05, 2.0)) * 0.55 + exp(-pow((ue - 1.78) / 0.03, 2.0)) * 0.35;
        vec3 rc = vec3(0.56, 0.62, 0.66);
        sky = mix(sky, rc, ring * c1 * L4);
        sky = body(sky, bp, uc, 34.0, vec3(0.48, 0.72, 0.74), vec3(0.10, 0.20, 0.22), c1 * L4);
        if (rq.y > 0.0 && length(uq) < 34.0) sky = mix(sky, rc * 0.8, ring * c1 * L4);
      }
      sky = body(sky, bp, vec2(W * 0.30, Hh * 0.06), 11.0, vec3(0.52, 0.50, 0.50), vec3(0.0), c3 * L4);
      if (c3 * L4 > 0.0) {
        float sd = length(bp - vec2(W * 0.80, Hh * 0.04));
        if (sd < 6.0) sky = mix(sky, sd < 1.5 ? vec3(1.00, 0.98, 0.90) : sky + vec3(0.14, 0.13, 0.10) * (1.0 - sd / 6.0), c3 * L4);
      }
      // the atmosphere above the edge: a bright thin layer and a wide faint one, both thinning outward, dithered so the
      // falloff has no bands; Pluto's haze lies in soft layers
      float s = max(sdf, 0.0);
      float glow = airK * (0.70 * exp(-s / 3.0) + 0.30 * exp(-s / 14.0)) + 0.04 * bayer(px) * airK;
      glow *= 1.0 - 0.30 * c3 * L4 * (0.5 + 0.5 * sin(s * 1.6));
      sky = mix(sky, air, clamp(glow, 0.0, 0.85));
      col = mix(ground, sky, clamp(sdf + 0.5, 0.0, 1.0));                          // the edge blended over one pixel
    }
    if (L5 > 0.5 && c2 + c3 > 0.0) {
      // the black hole itself, no world's edge: its shadow at the top of the screen, ringed by a thin photon ring, the
      // far side of the accretion disk bent up over it by the lensing. Close in the first chapter, nearer still in the second.
      float bw = c2 + c3, br = uSize.x * (0.30 * c2 + 0.56 * c3) / bw;
      vec2 bq = px + 0.5 - vec2(uSize.x * 0.5 - uView * 0.10, -br * 0.35);
      float bd = length(bq);
      vec3 bh = col;
      float e = bd - br, ang = atan(bq.y, bq.x);
      // the disk's far side, bent up over the shadow: a soft band, brighter on the side turning toward us, in streaks
      float band = exp(-pow((bd - br * 1.22) / (br * 0.075), 2.0));
      float beam = 0.45 + 0.55 * smoothstep(-1.0, 1.0, -cos(ang));
      float streak = 0.70 + 0.30 * noise(vec2(ang * 16.0 - uDrift * 0.8, bd * 0.12));
      bh += vec3(0.56, 0.30, 0.20) * band * beam * streak;
      // the photon ring: bright where light skims the edge, falling off to both sides, a faint glow farther out
      float ring = exp(-pow(e / 1.2, 2.0)) * (0.70 + 0.30 * beam) + 0.30 * exp(-max(e, 0.0) / 6.0);
      bh = mix(bh, vec3(1.00, 0.86, 0.62), clamp(ring + 0.03 * bayer(px), 0.0, 0.92));
      // the shadow, its edge eased in over a few pixels, never outlined
      bh = mix(bh, vec3(0.0, 0.0, 0.012), smoothstep(-0.5, 3.0, -e));
      col = mix(col, bh, bw);
    }
    float hz = sdf < 0.0 ? 0.0 : 2.0;                                              // for the near layer: drawn on the planet only
    // near: things drifting between the ship and the ground (moon rock, embers, wisps of acid cloud, wreckage),
    // faster than the ground and shifted most (1.35 of the view); dark, so they never look like bullets
    vec2 ng = vec2(px.x + uView * 1.35, px.y - uScroll * 2.2);
    vec2 nc = floor(ng / 22.0), nf = ng - nc * 22.0 - 11.0;
    float nr = 2.0 + 4.0 * hash(nc + 1.3);
    if (hash(nc) > 0.93 && length(nf) < nr && hz < 1.0) {
      vec3 bit = mix(mix(mix(vec3(0.16, 0.17, 0.21) * c0 + vec3(0.30, 0.12, 0.06) * c1 + vec3(0.62, 0.48, 0.28) * c2 + vec3(0.14, 0.15, 0.18) * c3,
                     vec3(0.26, 0.10, 0.07) * c0 + vec3(0.56, 0.42, 0.30) * c1 + vec3(0.40, 0.30, 0.14) * c2 + vec3(0.70, 0.72, 0.76) * c3, L3),
                     vec3(0.72, 0.92, 0.90) * c0 + vec3(0.62, 0.64, 0.70) * c1 + vec3(0.80, 0.88, 1.00) * c2 + vec3(0.40, 0.34, 0.46) * c3, L4),
                     vec3(1.00, 0.84, 0.46) * c0 + vec3(1.00, 0.70, 0.30) * c1 + vec3(0.70, 0.50, 0.90) * c2 + vec3(0.60, 0.70, 1.00) * c3, L5);   // leg three: Mars rock, Jupiter cloud, Titan haze, ring ice; leg four: methane haze, ice dust, high cloud, Styx's mist; leg five: sparks, embers, infalling dust
      col = nf.x + nf.y < -nr * 0.6 ? bit * 1.7 : bit;
    }
  }
  // the planet's curve: the sides fall into shade, the shade sliding with the view
  float side = (px.x - uSize.x * 0.5 + uView * 0.65) / (uSize.x * 0.5);
  col *= 1.0 - (0.10 + 0.30 * L2) * side * side;
  finalColor = vec4(col, 1.0);
}`;

export class Ground {
  /** @param {import('pixi.js').Renderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.shader = new Shader({
      glProgram: GlProgram.from({ vertex, fragment, name: 'sky-talon-ground' }),
      resources: {
        ground: {
          uSize: { value: new Float32Array([240, 427]), type: 'vec2<f32>' },
          uScroll: { value: 0, type: 'f32' },
          uDrift: { value: 0, type: 'f32' },
          uCamX: { value: 0, type: 'f32' },
          uOctaves: { value: 5, type: 'f32' },
          uRush: { value: 0, type: 'f32' },
          uChapter: { value: 0, type: 'f32' },
          uLeg: { value: 0, type: 'f32' },
          uView: { value: 0, type: 'f32' },
          uHorizon: { value: new Float32Array(4), type: 'vec4<f32>' },
          uAir: { value: new Float32Array(4), type: 'vec4<f32>' },
        },
      },
    });
    this.mesh = new Mesh({
      geometry: new Geometry({ attributes: { aPosition: [-1, -1, 1, -1, 1, 1, -1, 1] }, indexBuffer: [0, 1, 2, 0, 2, 3] }),
      shader: this.shader,
    });
    this.rt = RenderTexture.create({ width: 240, height: 427, resolution: 1, antialias: false });
    this.rt.source.scaleMode = 'nearest';
    this.view = new Sprite(this.rt);
    this.scroll = 0;
    this.drift = 0;
  }

  /** Fit the ground to a screen area of `w` x `h` CSS px where one world px is `scale` CSS px. */
  resize(w, h, scale) {
    const cell = PIXEL * scale, gw = Math.max(8, Math.ceil(w / cell)), gh = Math.max(8, Math.ceil(h / cell));
    // a new texture, not rt.resize(): after a resize the render target kept drawing into its old area, so a window
    // made wider showed the ground cut off partway across with a hard vertical edge
    if (gw !== this.rt.width || gh !== this.rt.height) {
      const old = this.rt;
      this.rt = RenderTexture.create({ width: gw, height: gh, resolution: 1, antialias: false });
      this.rt.source.scaleMode = 'nearest';
      this.view.texture = this.rt;
      old.destroy(true);
    }
    const u = this.shader.resources.ground.uniforms;
    u.uSize[0] = gw; u.uSize[1] = gh;
    this.view.scale.set(cell);
  }

  /**
   * @param dt     seconds of render time
   * @param speed  ground pixels per second flown
   * @param camX   sideways parallax in ground pixels
   * @param low    true = low effects (fewer octaves, no cloud shadows, no near layer)
   * @param rush   0..1, how fast the flight feels right now (perspective and near-layer density)
   * @param chapter 0 coast at dusk, 1 night above the clouds, 2 canyon at dawn; a fraction blends two looks
   */
  /** @param view sideways view shift in ground pixels (defaults to camX); leg = 0 leg one, 1 leg six, 2 leg two */
  update(dt, speed, camX, low, rush = 0, chapter = 0, leg = 0, view = camX) {
    this.scroll += dt * speed;
    this.drift += dt;
    const u = this.shader.resources.ground.uniforms;
    u.uScroll = Math.round(this.scroll);                    // whole ground pixels: no shimmer while scrolling
    u.uDrift = this.drift;
    u.uCamX = Math.round(camX);
    u.uOctaves = low ? 3 : 5;
    u.uRush = low ? 0 : rush;
    u.uChapter = chapter;
    u.uLeg = leg;
    u.uView = Math.round(view);
    const frame = FRAMES[leg];
    if (frame) { u.uHorizon.set(frame.horizon); u.uAir.set(frame.air); }
    this.renderer.render({ container: this.mesh, target: this.rt });
  }
}
