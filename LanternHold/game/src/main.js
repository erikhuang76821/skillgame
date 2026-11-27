// LanternHold boot: Pixi view + fixed-step sim loop + DOM menus. Tap buildings for menus; drag units to (re)deploy.
// Every action becomes a 3-byte command fed to the sim one byte per tick (sim.js §2); card picks are recorder choices.
// The match is recorded and re-verified on device at the end (the same check the server runs).
import { Application, Container, Sprite, AnimatedSprite, TilingSprite, Texture, Rectangle, Graphics, BitmapFont, BitmapText } from 'pixi.js';
import { gsap } from 'gsap';
import { Recorder, verify, ONE } from './sim/core/index.js';
import {
  GAMES, STAGES, STAGE_IDS, DEFAULT_STAGE, BOSS_TIERS, TICK_MS, CX, CY, VIEW_W, VIEW_H, OP, encode, cellOf, cellCenter, SLOTS,
  BARRACKS, UNIT, UNIT_KINDS, WALL, WALL_R, WALL_SEGS, CASTLE, QUEUE_MAX, segOf, wallMaxHp, barracksMaxHp, WORKER_MAX, workerCount, CARD_TYPES,
  EVENT_CLEAR_TICKS, makeGame, tr, RARITY, RALLY_KINDS, lightR, popCap, pop, barracksCost, unitReach, trainTicks, besideBuildings, workerCost, INNER, DEMOLISH, REFUND_PCT, sideOf, sideSegs, sideUpgradeTo, sideUpgradeCost, ROLE, towerRange, TOWER, BRANCH, BRANCHES, POP_PER_BARRACKS, canPlace, unitMaxHp, scoreBreakdown, score, XP_NEED, LEVEL_MAX,
  CARDS, CARD_IDS, EVOS, CHOICE, CARD_MAX, POUCH_GOLD, FOE,
} from './sim/sim.js';
import { angleOf } from './sim/core/index.js';
import { FEEL } from './fx/feel.js';
import { shake } from './fx/shake.js';
import { hurt, flash } from './fx/overlay.js';
import { Particles } from './fx/particles.js';
import { makeArt, COLORS } from './render/art.js';
import { loadPixel, tex, PX, iconStyle, THEMES, themeTiles, themeThumb } from './render/pixel.js';
import { loadProfile, saveProfile, modsFrom, settle, stageOpen, TALENTS, rank, canBuy, buy, refund, ROSTER, ACHIEVEMENTS, TIER_NAME, equip, fits } from './meta/meta.js';
import { Sfx } from './audio/sfx.js';

gsap.defaults({ duration: 0.25, ease: 'power2.out', overwrite: 'auto' });
gsap.config({ force3D: true, nullTargetWarn: import.meta.env.DEV });
gsap.ticker.lagSmoothing(500, 33);
gsap.matchMedia().add('(prefers-reduced-motion: reduce)', () => { FEEL.enabled = false; return () => { FEEL.enabled = true; }; });

// --- Pixi: true-pixel renderer. The whole frame is drawn into a fixed low-resolution canvas where 1 art pixel =
// 1 canvas pixel (ART_W x ART_H), then the canvas is enlarged with nearest-neighbour scaling — an integer multiple
// whenever the screen allows. Nothing is drawn at a fractional pixel size, so the picture stays real pixel art.
// The same field of view everywhere (E3). World units are 2 per art pixel (pixel.js PX).
// The territory is an octagon (sim.js wallR): sides face the lanes (multiples of 45°), WALL_R at a side's middle.
const octR = ang => WALL_R / Math.cos(ang - Math.round(ang / (Math.PI / 4)) * (Math.PI / 4));
let shadowCache = null;                              // filled on first shadowTex() call
const SHADE = [0x3a3550, 0x55506e, 0x77728f, 0x9a96b0];   // voxel layer tints, bottom to top (used by stacked())
// Zoom steps: the canvas holds more art pixels when zoomed out, so pixels stay pixels and far enemies come into view.
// Five steps, closest first (canvas width in art px). Default 270: characters take ~8% of the screen width and the
// wall ring fills it edge to edge (gdd/02 §畫面比例); the minimap covers what is off-screen.
const ZOOMS = [200, 270, 360, 540, 720];
let zoomI = 1, ART_W = 270, ART_H = 480;
const stage = document.getElementById('stage');
const shakeEl = document.getElementById('stage-shake');
const app = new Application();
await app.init({ preference: 'webgl', width: ART_W, height: ART_H, backgroundColor: 0x141a33, antialias: false, resolution: 1, autoDensity: false, roundPixels: true });
app.canvas.classList.add('pixel');
shakeEl.appendChild(app.canvas);
// The canvas is sized from the screen: pick the whole-number scale f that brings the screen closest to the zoom
// step's width in art px, then make the canvas exactly screen / f. It always fills the screen, every art pixel is
// exactly f device pixels, and the zoom step only changes how much of the world that is.
// The view is capped (VIEW_CAP): on a big or very wide window the canvas stops growing and sits centred, so the
// world never shows past the painted ground and a maximised window does not turn into a zoomed-out overview.
const VIEW_CAP = { w: 1.6, h: 16 / 9 * 1.15, maxW: 940, maxH: 1640 };   // x the zoom step; absolute art-px limits (ground is 1000 x 1700)
function fitCanvas() {
  const dpr = devicePixelRatio || 1, dw = Math.round(stage.clientWidth * dpr), dh = Math.round(stage.clientHeight * dpr);
  const f = Math.max(1, Math.round(Math.min(dw, dh * 9 / 16) / ZOOMS[zoomI]));
  const capW = Math.min(VIEW_CAP.maxW, Math.round(ZOOMS[zoomI] * VIEW_CAP.w)), capH = Math.min(VIEW_CAP.maxH, Math.round(ZOOMS[zoomI] * VIEW_CAP.h));
  ART_W = Math.min(Math.ceil(dw / f), capW); ART_H = Math.min(Math.ceil(dh / f), capH);
  if (app.renderer.width !== ART_W || app.renderer.height !== ART_H) app.renderer.resize(ART_W, ART_H);
  const cw = (ART_W * f) / dpr, ch = (ART_H * f) / dpr;
  app.canvas.style.width = `${cw}px`; app.canvas.style.height = `${ch}px`;
  app.canvas.style.left = `${Math.max(12, 12 + (stage.clientWidth - cw) / 2)}px`; app.canvas.style.top = `${Math.max(12, 12 + (stage.clientHeight - ch) / 2)}px`;
}
fitCanvas();
addEventListener('resize', () => { fitCanvas(); setCam(camX, camY); });
const art = makeArt(app.renderer);
const px = await loadPixel();
document.querySelectorAll('#zoom button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); if (b.dataset.z === 'c') setCam(CX, CY); else setZoom(zoomI + (b.dataset.z === '+' ? -1 : 1)); }));

const view = new Container();
// Camera: 1 world unit = 1/PX canvas pixel; the castle sits in the middle of the canvas.
const cam = new Container();
cam.scale.set(1 / PX);
// The camera looks at (camX, camY) in world units; one-finger drag on empty ground pans it, within the ground.
let camX = CX, camY = CY;
function setCam(x, y) {
  const hw = (ART_W / 2) * PX, hh = (ART_H / 2) * PX;
  camX = Math.max(CX - 1000 + hw, Math.min(CX + 1000 - hw, x));
  camY = Math.max(CY - 1700 + hh, Math.min(CY + 1700 - hh, y));
  cam.position.set(Math.round(ART_W / 2 - camX / PX), Math.round(ART_H / 2 - camY / PX));
}
setCam(CX, CY);
function setZoom(i) {
  zoomI = Math.max(0, Math.min(ZOOMS.length - 1, i));
  fitCanvas(); setCam(camX, camY);
  document.querySelectorAll('#zoom button').forEach(b => { b.disabled = (b.dataset.z === '+' && zoomI === 0) || (b.dataset.z === '-' && zoomI === ZOOMS.length - 1); });
}
let ground = new Container();
const light = new Sprite({ texture: art.disc, anchor: 0.5, tint: COLORS.lamp, alpha: 0.08 });
light.position.set(CX, CY);
const world = new Container();               // walls, buildings, castle, units, foes (y-sorted)
world.sortableChildren = true;
const overlay = new Container();             // drag ghost, rings, warnings
const fxLayer = new Container(); fxLayer.blendMode = 'add';
const dmgLayer = new Container();            // floating damage numbers (one bitmap-font atlas, generated at start: 0 bytes)
cam.addChild(ground, light, world, overlay, fxLayer, dmgLayer);
BitmapFont.install({ name: 'dmg', chars: [['0', '9'], '-'], resolution: 2,
  style: { fontFamily: 'monospace', fontSize: 15, fontWeight: 'bold', fill: '#ffffff', stroke: { color: '#1b1530', width: 4 } } });

// Damage numbers: hits on one foe within FEEL.dmgNum.merge seconds add up into one number (no pile of overlapping
// digits). Countering hits are big and amber, resisted hits small and grey, burn / poison ticks small and violet.
const dmgPool = [], dmgByFoe = new Map();
function dmgNumber(id, x, y, n, counter, why) {
  const D = FEEL.dmgNum;
  if (!FEEL.enabled || n <= 0) return;
  const now = performance.now();
  let d = dmgByFoe.get(id);
  if (d && now - d.at < D.merge * 1000) { d.total += n; d.at = now; }
  else {
    if (dmgLayer.children.length >= D.max) return;
    const t = dmgPool.pop() ?? new BitmapText({ text: '', style: { fontFamily: 'dmg', fontSize: 15 } });
    t.anchor.set(0.5); dmgLayer.addChild(t);
    d = { t, total: n, at: now, x: x + ((id * 7) % 11) - 5, y: y - 22 };
    dmgByFoe.set(id, d);
  }
  const big = counter > 0, small = counter < 0 || !!why;
  d.t.text = `-${d.total}`;
  d.t.tint = big ? 0xffb64a : why ? 0xc6a8ff : small ? 0x9aa0b4 : 0xfff2c0;
  d.t.position.set(d.x, d.y); d.t.alpha = 1;
  gsap.killTweensOf(d.t); gsap.killTweensOf(d.t.scale);
  gsap.fromTo(d.t.scale, { x: (big ? D.big : small ? D.small : 1) * D.pop, y: (big ? D.big : small ? D.small : 1) * D.pop },
    { x: big ? D.big : small ? D.small : 1, y: big ? D.big : small ? D.small : 1, duration: 0.12, ease: 'back.out(3)' });
  const t = d.t;
  gsap.to(t, { y: d.y - D.rise, duration: D.dur, ease: 'power2.out' });
  gsap.to(t, { alpha: 0, duration: D.dur * 0.4, delay: D.dur * 0.6, onComplete: () => { t.removeFromParent(); dmgPool.push(t); if (dmgByFoe.get(id)?.t === t) dmgByFoe.delete(id); } });
}
view.addChild(cam);
app.stage.addChild(view);
const particles = new Particles(app.renderer);
fxLayer.addChild(particles.view);

// Build pad art; until the pixel pads exist, a crisp pixel fallback (stone square / violet plinth) drawn once.
const padCache = {};
function padTex(inner) {
  const name = inner ? 'pad_inner' : 'pad_outer';
  if (px.buildings.textures[name]) return px.buildings.textures[name];
  if (!padCache[name]) {
    const g = new Graphics();
    if (inner) g.rect(0, 2, 30, 18).fill(0x5a5560).rect(1, 3, 28, 16).fill(0x7a7684).rect(3, 5, 24, 12).fill(0x8c8898).rect(0, 20, 30, 3).fill(0x3e3a46);
    else g.ellipse(15, 11, 15, 9).fill(0x3e3a52).ellipse(15, 10, 13, 7).fill(0x6a5a8a).ellipse(15, 10, 9, 4).fill(0x9a86c8);
    padCache[name] = app.renderer.generateTexture(g); padCache[name].source.scaleMode = 'nearest';
  }
  return padCache[name];
}

// Voxel-style depth without new art: a sprite is drawn `layers` times, one art pixel apart vertically, the lower
// copies darker, so walls and buildings read as solid blocks. Shadows are flat pixel ovals under anything standing.
function stacked(texture, layers, anchor = { x: 0.5, y: 1 }) {
  const c = new Container();
  for (let k = 0; k < layers; k++) {
    const s = new Sprite({ texture, anchor });
    s.scale.set(PX); s.y = -k * PX;
    if (k < layers - 1) s.tint = SHADE[Math.min(SHADE.length - 1, Math.floor((k * SHADE.length) / (layers - 1)))];
    c.addChild(s);
  }
  return c;
}
function shadowTex() {                                  // a function, so buildGround() can use it before this line runs
  if (!shadowCache) { shadowCache = app.renderer.generateTexture(new Graphics().ellipse(8, 3, 8, 3).fill(0x000000)); shadowCache.source.scaleMode = 'nearest'; }
  return shadowCache;
}
function shadowAt(x, y, w) { const s = new Sprite({ texture: shadowTex(), anchor: 0.5, alpha: 0.35 }); s.position.set(x, y); s.scale.set(w / 8, PX); return s; }

// Ground, painted pixel by pixel once at boot (render only): grass from the forest tile, worn dirt along the eight
// lanes and in a few clearings, cobbles inside the wall ring. Edges are dithered and wobble with value noise, so the
// paths read as part of the terrain instead of lines drawn on top. One texture, 1 art px = 1 texel.
function tilePixels(t) {
  const src = t.source.resource, w = t.source.width, h = t.source.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(src, 0, 0);
  return { w, h, d: g.getImageData(0, 0, w, h).data };
}
function makeNoise(seed) {
  const hsh = (x, y) => { let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const sm = t => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const a = hsh(xi, yi), b = hsh(xi + 1, yi), c = hsh(xi, yi + 1), d = hsh(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}
// Terrain hints (render only): no drawn roads. The 8 straight approaches the foes walk stay open grass; the land
// between them holds ponds, rock shelves (with a dark cliff face on their south side) and tree clusters, so the open
// corridors read by what frames them. Each corridor wobbles a little and its width varies, so nothing looks ruled.
const TERRAIN = { corridor: 58, corridorVar: 34, wobble: 22, wildFrom: 70 };   // px; wildFrom = distance past the wall line
const nT = makeNoise(41), nF = makeNoise(53), nW = makeNoise(67), nR = makeNoise(79);
function corridorD(wx, wy) {
  const dx = wx - CX, dy = wy - CY, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx), k = Math.round(a / (Math.PI / 4)) * (Math.PI / 4);
  return r * Math.abs(Math.sin(a - k)) + TERRAIN.wobble * (nW(wx / 140, wy / 140) - 0.5) * 2;
}
/** 0 open, 1 water, 2 rock shelf — only in the wild land between corridors, outside the walls. */
function wildAt(wx, wy) {
  const dx = wx - CX, dy = wy - CY, r = Math.hypot(dx, dy);
  if (r < octR(Math.atan2(dy, dx)) + TERRAIN.wildFrom) return 0;
  const free = corridorD(wx, wy) - (TERRAIN.corridor + TERRAIN.corridorVar * nT(wx / 200, wy / 200));
  if (free < 0) return 0;
  // two octaves: broad shapes with rough, irregular edges; features start a little back from the corridor
  const f = 0.72 * nF(wx / 150, wy / 150) + 0.28 * nR(wx / 38, wy / 38) - Math.max(0, 0.12 - free / 400);
  return f > 0.68 ? 1 : f < 0.3 && f > 0.04 ? 2 : 0;
}
function paintGround(W, H, x0, y0, th, tiles) {
  const grass = tilePixels(tiles.grass), dirt = tilePixels(tiles.path);
  const n1 = makeNoise(11);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), img = g.createImageData(W, H), o = img.data;
  const STONE = th.stone, GR = th.grass, WATER = th.water ?? [56, 104, 146];
  const put = (q, c, l = 1) => { o[q] = Math.min(255, c[0] * l); o[q + 1] = Math.min(255, c[1] * l); o[q + 2] = Math.min(255, c[2] * l); o[q + 3] = 255; };
  const wild = new Uint8Array(W * H);                                   // terrain kind per texel, computed once
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) wild[j * W + i] = wildAt(x0 + i * PX, y0 + j * PX);
  const wd = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? 0 : wild[j * W + i]);   // offsets below are in texels (1 = 2 px)
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const wx = x0 + i * PX, wy = y0 + j * PX, r = Math.hypot(wx - CX, wy - CY);
      const tx = i % 64, ty = j % 64, p = (ty * 64 + tx) * 4, q = (j * W + i) * 4;
      const lumD = (dirt.d[p] + dirt.d[p + 1] + dirt.d[p + 2]) / 3 / 128;
      // small cobbled yard with a ragged edge round the keep
      const yard = 58 + 20 * (n1(wx / 90, wy / 90) - 0.5) - r;
      if (yard > 0 && !(yard < 2.5 && ((i + j) & 1))) { put(q, STONE, lumD); continue; }
      const w = wild[j * W + i];
      if (w === 1) {                                                        // pond: dark rim, lighter shallows, a few glints
        const rim = wd(i, j - 3) !== 1 || wd(i, j + 3) !== 1 || wd(i - 3, j) !== 1 || wd(i + 3, j) !== 1;
        const shallow = !rim && (wd(i, j - 7) !== 1 || wd(i - 7, j) !== 1);
        const glint = !rim && ((i * 7 + j * 13) % 97 === 0);
        put(q, WATER, rim ? 0.62 : glint ? 1.6 : shallow ? 1.18 : 0.95 + 0.08 * lumD);
        continue;
      }
      if (w === 2) {                                                        // rock shelf: textured stone, moss on top, lit upper lip
        const lip = wd(i, j - 2) !== 2, moss = nR(wx / 9, wy / 9) > 0.62;
        if (moss && !lip) {
          if (tiles.native || !GR) put(q, [grass.d[p], grass.d[p + 1], grass.d[p + 2]], 0.82);
          else put(q, GR, ((grass.d[p] + grass.d[p + 1] + grass.d[p + 2]) / 3 / 96) * 0.82);
        } else put(q, STONE, (lip ? 1.08 : 0.78) * (0.55 + 0.5 * lumD) * (0.9 + 0.2 * nR(wx / 5, wy / 5)));
        continue;
      }
      if (wd(i, j - 7) === 2) { put(q, STONE, (0.36 + 0.12 * lumD) * (((i + (j >> 1)) % 5) ? 1 : 0.8)); continue; }   // cliff face with vertical cracks                              // cliff face below a shelf
      const shade = wd(i, j - 11) === 2 ? 0.78 : 1;                                                         // cast shadow at its foot
      if (tiles.native || !GR) put(q, [grass.d[p], grass.d[p + 1], grass.d[p + 2]], shade);
      else put(q, GR, ((grass.d[p] + grass.d[p + 1] + grass.d[p + 2]) / 3 / 96) * shade);
    }
  }
  g.putImageData(img, 0, 0);
  const t = Texture.from(cv);
  t.source.scaleMode = 'nearest';
  return t;
}

function buildGround(th, tiles) {
  const c = new Container();
  const W = 2000, H = 3400, x0 = CX - W / 2, y0 = CY - H / 2;   // covers the furthest zoom step
  const base = new Sprite({ texture: paintGround(W / PX, H / PX, x0, y0, th, tiles) });
  base.position.set(x0, y0); base.scale.set(PX);
  c.addChild(base);
  // build pads: pixel foundations (square = barracks, round plinth = mage tower) instead of plain circles
  SLOTS.forEach(([x, y], k) => { const pad = new Sprite({ texture: padTex(INNER(k)), anchor: 0.5 }); pad.position.set(x, y + 10); pad.scale.set(PX); c.addChild(pad); });
  // props: tree / bush clusters in the wild land (never in a corridor, a pond or on a rock shelf); denser away from
  // the corridors so the open approaches read on their own
  let h = 9301;
  const rnd = () => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296);
  let props = th.props.filter(n => px.buildings.textures[n]);
  if (!props.length) props = THEMES.forest.props;
  const placed = [];
  for (let i = 0; i < 5000 && placed.length < 700; i++) {
    const x = x0 + rnd() * W, y = y0 + rnd() * H, dx = x - CX, dy = y - CY, r = Math.hypot(dx, dy);
    if (r < octR(Math.atan2(dy, dx)) + TERRAIN.wildFrom - 20) continue;
    const free = corridorD(x, y) - (TERRAIN.corridor + TERRAIN.corridorVar * nT(x / 200, y / 200));
    if (free < 6 || wildAt(x, y) || wildAt(x, y + 14) || wildAt(x, y - 14)) continue;
    if (nF(x / 90 + 7, y / 90) < 0.36 - Math.min(0.3, free / 500)) continue;   // clusters, not an even sprinkle
    if (placed.some(([px_, py_]) => (px_ - x) ** 2 + (py_ - y) ** 2 < 16 * 16)) continue;
    placed.push([x, y]);
  }
  placed.sort((a, b) => a[1] - b[1]).forEach(([x, y], n) => {
    const t = stacked(tex(px.buildings, props[n % props.length]), 2);
    t.position.set(Math.round(x / PX) * PX, Math.round(y / PX) * PX);
    c.addChild(shadowAt(t.x, t.y, 14), t);
  });
  c.cacheAsTexture?.(true);
  return c;
}

const toWorld = e => {
  const r = app.canvas.getBoundingClientRect();
  const vx = ((e.clientX - r.left) * ART_W) / r.width, vy = ((e.clientY - r.top) * ART_H) / r.height;
  return [(vx - cam.x) * PX, (vy - cam.y) * PX];
};

// --- HUD ---
const $ = q => document.querySelector(q);
const el = {
  gold: $('#gold'), pop: $('#pop'), score: $('#score'), time: $('#time'), hp: $('#castlehp'), warn: $('#warn'), hint: $('#hint'),
  menu: $('#menu'), panel: $('#panel'), lv: $('#lv'), xp: $('#xpbar'), build: $('#build'), cards: $('#cards'), chest: $('#chest'),
  banner: $('#banner'), combo: $('#combo'), defeat: $('#defeat'), rally: $('#rally'), skills: $('#skills'), kills: $('#kills'), minimap: $('#minimap'),
};
if (import.meta.env.DEV) {
  const { drawCallCounter } = await import('./debug/drawCalls.js');
  const dc = drawCallCounter(app), dcEl = $('#hud .dc');
  dcEl.hidden = false;
  setInterval(() => { dcEl.textContent = `DC ${dc()}  FPS ${app.ticker.FPS.toFixed(0)}`; }, 250);
}

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed')) || 20261117;
const sfx = new Sfx();

// --- game state (render side) ---
// state: title | play | pick (offer open, sim paused by the rules) | chest (render-only pause for the reveal) | over
let rec = null, state = 'title', acc = 0;
const bytes = [];
const send = cmd => { bytes.push(...cmd); sfx.play('click', { gain: 0.5 }); };
const sim = () => rec.sim;

// --- static views: castle, slots, walls (pixel sprites at PX, never rotated) ---
const castle = stacked(tex(px.buildings, 'castle'), 4);
castle.position.set(CX, CY + 40); castle.zIndex = CY + 40;
world.addChild(shadowAt(CX, CY + 40, 60), castle);
const slotViews = SLOTS.map(([x, y]) => {
  const s = stacked(tex(px.buildings, 'barracks_1'), 3);
  s.visible = false; s.position.set(x, y + 16); s.zIndex = y + 16;
  const sh = shadowAt(x, y + 16, 30); sh.visible = false; s.shadow = sh; world.addChild(sh);
  const bar = new Sprite({ texture: art.pip, anchor: { x: 0, y: 0.5 }, tint: 0x8ff03c });
  bar.position.set(x - 25, y + 24); bar.zIndex = y + 25; bar.visible = false;
  world.addChild(s, bar);
  return { s, bar, kind: '', key: '' };
});
// A wall segment is three square blocks cut from the wall art, placed along the arc without rotation.
// placeholder tints until the tower art lands (only used when a tower frame is missing from the atlas)
const TOWER_TINT = { basic: 0xc8a8ff, frost: 0x9fdcff, poison: 0x9fef8f, banner: 0xffc870, bone: 0xe8e0d0 };
const WALL_ART = ['', 'wood', 'stone', 'iron'], WALL_STATE = pct => (pct > 0.6 ? 'intact' : pct > 0.3 ? 'cracked' : 'broken');
const blockTex = new Map();
function wallBlock(lv, state) {
  const key = `${lv}_${state}`;
  if (!blockTex.has(key)) {
    const t = tex(px.buildings, `wall_${WALL_ART[lv]}_${state}`), f = t.frame;
    blockTex.set(key, new Texture({ source: t.source, frame: new Rectangle(f.x + Math.floor(f.width / 2) - 5, f.y, 10, f.height) }));
  }
  return blockTex.get(key);
}
// Corner towers: a stone pillar at each of the octagon's 8 corners, shown only once a wall next to it is built
// (nothing marks the wall line on an empty map).
const cornerViews = [];
for (let c = 0; c < 8; c++) {
  const ang = (c + 0.5) * (Math.PI / 4), rr = WALL_R / Math.cos(Math.PI / 8);
  const t = stacked(wallBlock(2, 'intact'), 7, { x: 0.5, y: 0.7 });
  t.position.set(Math.round((CX + Math.cos(ang) * rr) / PX) * PX, Math.round((CY + Math.sin(ang) * rr) / PX) * PX);
  t.zIndex = t.y; t.scale.set(1.3, 1);
  const sh = shadowAt(t.x, t.y + 2, 16);
  t.visible = sh.visible = false;
  world.addChild(sh, t);
  const segs = [(c * WALL_SEGS) / 8 + Math.floor(WALL_SEGS / 16), (c * WALL_SEGS) / 8 + Math.floor(WALL_SEGS / 16) + 1].map(w => w % WALL_SEGS);
  cornerViews.push({ t, sh, segs });
}
const wallViews = Array.from({ length: WALL_SEGS }, (_, w) => {
  // a segment is a straight run along its octagon side: four blocks on the chord between its two end points
  const wc = (w * Math.PI * 2) / WALL_SEGS, normal = Math.round(wc / (Math.PI / 4)) * (Math.PI / 4);   // the side this segment lies on
  const at = t => { const ang = ((w - 0.5 + t) * Math.PI * 2) / WALL_SEGS, rr = WALL_R / Math.cos(ang - normal); return [CX + Math.cos(ang) * rr, CY + Math.sin(ang) * rr]; };
  const [ax, ay] = at(0), [bx, by] = at(1);
  const blocks = [1, 3, 5, 7].map(k => {
    const b = stacked(Texture.EMPTY, 4, { x: 0.5, y: 0.7 });
    b.visible = false;
    b.position.set(Math.round((ax + ((bx - ax) * k) / 8) / PX) * PX, Math.round((ay + ((by - ay) * k) / 8) / PX) * PX);
    b.zIndex = b.y;
    world.addChild(b);
    return b;
  });
  return { blocks, key: '' };
});


// --- dynamic views ---
const unitViews = new Map(), foeViews = new Map();
const anim = (sheet, name) => sheet.animations[name] ?? [Texture.EMPTY];
function unitView(i, u) {
  let v = unitViews.get(i);
  if (v && v.gen === u.gen) return v;
  if (v) v.c.destroy({ children: true });
  const c = new Container();
  const art_ = u.kind === 'skeleton' && !px.units.animations.skeleton_idle ? 'worker' : u.kind;   // placeholder until the skeleton art lands
  const body = new AnimatedSprite({ textures: anim(px.units, `${art_}_idle`), animationSpeed: 0.06, autoUpdate: true });
  if (art_ !== u.kind) body.tint = 0xe8e0d0;
  body.scale.set(PX); body.play();
  const pips = [0, 1, 2].map(k => { const p = new Sprite({ texture: art.pip, tint: COLORS.lamp }); p.position.set(-16 + k * 12, -52); p.visible = false; c.addChild(p); return p; });
  const hp = new Sprite({ texture: art.pip, anchor: { x: 0, y: 0.5 }, tint: 0x8ff03c }); hp.position.set(-14, 6); hp.scale.set(2.8, 0.8);
  const sh = new Sprite({ texture: shadowTex(), anchor: 0.5, alpha: 0.35 }); sh.scale.set(1.6, PX); sh.y = -2;
  c.addChild(sh, body, hp);
  world.addChild(c);
  v = { c, body, pips, hp, gen: u.gen, mode: 'idle', attackUntil: 0, face: 1, art: art_ };
  unitViews.set(i, v);
  return v;
}
function setAnim(v, sheet, name, speed) {
  if (v.mode === name) return;
  v.mode = name;
  v.body.textures = anim(sheet, name); v.body.animationSpeed = speed; v.body.play();
}
// Foe art per kind (bosses share the maw at different sizes and hues).
const FOE_ART = { rat: ['rat_walk', 1, 0xffffff], beetle: ['beetle_walk', 1, 0xffffff], moth: ['moth_fly', 1, 0xffffff], shroom: ['shroom_walk', 1, 0xffffff],
  snail: ['snail_walk', 1, 0xffffff], wolf: ['wolf_walk', 1, 0xffffff], shade: ['shadowArcher_walk', 1, 0xffffff],
  slime: ['slime_walk', 1, 0xffffff], slimelet: ['slime_walk', 0.6, 0xe0c8ff], boar: ['boar_walk', 1, 0xffffff],
  shaman: ['shaman_walk', 1, 0xffffff], mole: ['mole_walk', 1, 0xffffff],
  bossWeak: ['boss_walk', 0.5, 0xd8b0ff], bossMini: ['boss_walk', 0.75, 0xb0c8ff], boss: ['boss_walk', 1, 0xffffff], bossSuper: ['boss_walk', 1.5, 0xff9ab8] };
function foeView(f) {
  let v = foeViews.get(f.id);
  if (v) return v;
  const [name, k, tint] = FOE_ART[f.kind];
  const s = new AnimatedSprite({ textures: anim(px.foes, px.foes.animations[name] ? name : 'rat_walk'), animationSpeed: 0.12, autoUpdate: true, tint });
  s.scale.set(PX * k); s.play(); s.gotoAndPlay(f.id % 4);
  const sh = FOE[f.kind].fly ? null : new Sprite({ texture: shadowTex(), anchor: 0.5, alpha: 0.3 });
  if (sh) { sh.scale.set(1.4 * k, PX); world.addChild(sh); }
  world.addChild(s);
  // monster level: one small lilac pip per level above 1 (max 5), above the head
  const lvPips = Math.min(5, (f.lv ?? 1) - 1), pips = [];
  for (let n = 0; n < lvPips; n++) { const p = new Sprite({ texture: art.pip, tint: 0xc6a8ff, anchor: 0.5 }); p.scale.set(0.5); world.addChild(p); pips.push(p); }
  v = { s, sh, k, tint, lastX: f.x, pips, mode: 'walk' };
  foeViews.set(f.id, v);
  return v;
}

// --- overlay: drag ghost, placement range, prewarn arrows ---
const rangeRing = new Sprite({ texture: art.ring, anchor: 0.5, tint: COLORS.ally, alpha: 0.5, visible: false });
const ghost = new Sprite({ texture: Texture.EMPTY, anchor: { x: 0.5, y: 0.95 }, alpha: 0.6, visible: false });
const aggroRing = new Sprite({ texture: art.ring, anchor: 0.5, alpha: 0.35, visible: false });
const lightRing = new Sprite({ texture: art.ring, anchor: 0.5, tint: COLORS.lamp, alpha: 0.35, visible: false });   // shown only while placing
lightRing.position.set(CX, CY);
const warnArrows = [0, 1].map(() => { const s = new Sprite({ texture: art.arrow, anchor: 0.5, tint: COLORS.danger, visible: false }); s.scale.set(2.2); overlay.addChild(s); return s; });
// Selection ring: tapping a soldier (or a mage tower) shows how far it reaches, live, while its info is open.
const selRing = new Sprite({ texture: art.ring, anchor: 0.5, tint: COLORS.ally, alpha: 0.55, visible: false });
overlay.addChild(lightRing, rangeRing, aggroRing, ghost, selRing);

// --- input arbiter (touch first; gdd/10 §操作) ---------------------------------------------------------------
// Priority, decided once per gesture:
//   1. DOM UI (menus, cards, zoom buttons) sits above the canvas and takes its own events.
//   2. Two fingers = pinch zoom. It cancels whatever one finger had started (drag, tap, pan).
//   3. One finger, by what is under it:
//        soldier (archer / shield / priest)  -> press shows its info; moving past the slop starts a deploy drag
//        building / castle / wall            -> tap on release (only if the finger did not move) opens its menu
//        empty ground                        -> moving past the slop pans the view; a still tap closes the menu
//      Workers and skeletons are never hit: they work on their own.
//   4. Hit areas are at least finger-sized on screen at every zoom step.
//   5. Dragging a soldier near a screen edge pans the view so you can place it off-screen.
let demolishArm = -1;
let menuFor = null, gesture = null, drag = null, rallyKind = -1;
// Rally (bottom right): one icon per soldier kind on the field (kinds you have none of are hidden). Tap an icon,
// then tap the ground: every free soldier of that kind goes there in formation. Tap the icon again to cancel.
let rallySig = '';
function setRally(k) {
  rallyKind = k; rallySig = '';
  renderRally();
  if (k >= 0) toastHint(`點地面：所有${UNIT_NAME[RALLY_KINDS[k]]}到那裡集合`);
}
function renderRally() {
  const s = sim(), counts = RALLY_KINDS.map(k => s.units.filter(u => u.alive && u.kind === k).length);
  const sig = counts.join() + '|' + rallyKind;
  if (sig === rallySig) return;
  rallySig = sig;
  el.rally.innerHTML = RALLY_KINDS.map((k, i) => (counts[i] ? `<button data-rk="${i}" class="${i === rallyKind ? 'on' : ''}" aria-label="集合${UNIT_NAME[k]}"><i style="${iconStyle(px, `u_${k}`, 30)}"></i><b>${counts[i]}</b></button>` : '')).join('');
  if (rallyKind >= 0 && !counts[rallyKind]) rallyKind = -1;
  el.rally.querySelectorAll('[data-rk]').forEach(b => b.addEventListener('pointerdown', ev => { ev.stopPropagation(); }));
  el.rally.querySelectorAll('[data-rk]').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); sfx.play('click'); const k = Number(b.dataset.rk); setRally(k === rallyKind ? -1 : k); }));
}
const ptrs = new Map();                                      // pointerId -> [clientX, clientY]
const SLOP = 10, DRAG_SLOP = 4;                              // css px: taps may drift 10, a soldier drag starts at 4
const near = (ax, ay, bx, by, r) => (ax - bx) ** 2 + (ay - by) ** 2 <= r * r;
const worldPerCss = () => (ART_W / app.canvas.getBoundingClientRect().width) * PX;
function unitAt(x, y, r) {
  let best = -1, bd = r * r;
  sim().units.forEach((u, i) => {
    if (!u.alive || u.kind === 'worker' || u.kind === 'skeleton') return;
    const d = (u.x / ONE - x) ** 2 + (u.y / ONE - 14 - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
function slotAt(x, y, r) {
  let best = -1, bd = r * r;
  SLOTS.forEach(([sx, sy], k) => { const d = (x - sx) ** 2 + (y - sy) ** 2; if (d < bd) { bd = d; best = k; } });
  return best;
}
function wallAt(x, y, r) {
  if (Math.abs(Math.hypot(x - CX, y - CY) - octR(Math.atan2(y - CY, x - CX))) > r) return -1;
  return segOf(angleOf(Math.round(x - CX), Math.round(y - CY)));
}
function hitTest(x, y) {
  const k = worldPerCss();
  const u = unitAt(x, y, Math.max(30, 24 * k));
  if (u >= 0) return { type: 'unit', i: u };
  const s = slotAt(x, y, Math.max(36, 26 * k));
  if (s >= 0) return { type: 'slot', i: s };
  if (near(x, y, CX, CY - 10, Math.max(62, 26 * k))) return { type: 'castle' };
  const w = wallAt(x, y, Math.max(24, 20 * k));
  if (w >= 0) return { type: 'wall', i: sideOf(w) };            // walls are built a whole side at a time
  return { type: 'ground' };
}
const pinchDist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); };

stage.addEventListener('pointerdown', e => {
  sfx.unlock();
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2) { endDrag(); gesture = { kind: 'pinch', d0: pinchDist() }; return; }
  if (ptrs.size > 2 || state !== 'play') return;
  const [x, y] = toWorld(e), hit = rallyKind >= 0 ? { type: 'rally', x, y } : hitTest(x, y);   // rally mode: any tap is the rally point
  gesture = { kind: hit.type === 'unit' ? 'unit' : 'press', hit, cx0: e.clientX, cy0: e.clientY, cam0: [camX, camY] };
  if (hit.type === 'unit') showUnitInfo(hit.i);
});
addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (!gesture) return;
  if (gesture.kind === 'pinch') {
    if (ptrs.size < 2) return;
    const d = pinchDist();
    if (d > gesture.d0 * 1.3) { setZoom(zoomI - 1); gesture.d0 = d; } else if (d < gesture.d0 / 1.3) { setZoom(zoomI + 1); gesture.d0 = d; }
    return;
  }
  const moved = Math.hypot(e.clientX - gesture.cx0, e.clientY - gesture.cy0) > SLOP;
  if (gesture.kind === 'unit' && Math.hypot(e.clientX - gesture.cx0, e.clientY - gesture.cy0) > DRAG_SLOP) { startDrag(gesture.hit.i); gesture.last = [e.clientX, e.clientY]; updateDrag(); }
  if (gesture.kind === 'press' && moved) gesture.kind = 'pan';
  if (gesture.kind === 'pan') {
    const k = worldPerCss();
    setCam(gesture.cam0[0] - (e.clientX - gesture.cx0) * k, gesture.cam0[1] - (e.clientY - gesture.cy0) * k);
  }
  if (gesture.kind === 'drag') { gesture.last = [e.clientX, e.clientY]; updateDrag(); }
});
function release(e) {
  if (!ptrs.delete(e.pointerId) || !gesture) return;
  const g = gesture;
  if (g.kind === 'pinch') { if (ptrs.size === 0) gesture = null; return; }
  gesture = null;
  if (g.kind === 'drag' && e.type === 'pointerup') finishDrag();
  else if (g.kind === 'press' && e.type === 'pointerup') tapOn(g.hit);
  endDrag();
}
addEventListener('pointerup', release);
addEventListener('pointercancel', release);
stage.addEventListener('wheel', e => { e.preventDefault(); setZoom(zoomI + (e.deltaY > 0 ? 1 : -1)); }, { passive: false });

function startDrag(i) {
  const u = sim().units[i];
  if (!u?.alive) return;
  gesture.kind = 'drag';
  drag = { i };
  ghost.texture = anim(px.units, `${u.kind}_idle`)[0]; ghost.scale.set(PX);
}
function updateDrag() {
  if (!drag || !gesture?.last) return;
  const u = sim().units[drag.i];
  if (!u?.alive) { endDrag(); return; }
  const [x, y] = toWorld({ clientX: gesture.last[0], clientY: gesture.last[1] });
  const cell = cellOf(x, y), [cx, cy] = cellCenter(cell);
  const ok = canPlace(sim(), cx * ONE, cy * ONE, drag.i);
  const [hx, hy] = besideBuildings(sim(), cx * ONE, cy * ONE).map(v => v / ONE);   // where it will really stand
  // the ghost sticks to the finger (no lag, no snapping); the ring shows the post it will take
  ghost.visible = true; ghost.position.set(Math.round(x / PX) * PX, Math.round((y + 18) / PX) * PX); ghost.alpha = ok ? 0.85 : 0.35;
  aggroRing.visible = true; aggroRing.position.set(hx, hy); aggroRing.tint = ok ? COLORS.ally : COLORS.danger;
  aggroRing.scale.set(unitReach(sim(), u) / 128);              // archers: reach; shields: engage radius; priests: heal range
  rangeRing.visible = true; lightRing.visible = true;
  drag.target = { cell, ok };
}
function edgePan() {                                          // called every frame while dragging a soldier
  if (gesture?.kind !== 'drag' || !gesture.last) return;
  const r = app.canvas.getBoundingClientRect(), [px_, py_] = gesture.last, m = 44, k = worldPerCss() * 6;
  const dx = px_ < r.left + m ? -k : px_ > r.right - m ? k : 0, dy = py_ < r.top + m ? -k : py_ > r.bottom - m ? k : 0;
  if (dx || dy) { setCam(camX + dx, camY + dy); updateDrag(); }
}
function finishDrag() {
  if (!drag?.target) return;
  const { i, target } = drag;
  if (target.ok) send(encode(OP.MOVE, i, target.cell));
  else toastHint('只能放在燈光範圍內或友軍附近');
}
function endDrag() { drag = null; ghost.visible = aggroRing.visible = rangeRing.visible = lightRing.visible = false; }
function tapOn(hit) {
  if (hit.type === 'rally') { send(encode(OP.RALLY, rallyKind, cellOf(hit.x, hit.y))); setRally(-1); return; }
  if (hit.type === 'castle') return openMenu({ type: 'castle' });
  if (hit.type === 'slot') return openMenu({ type: 'slot', i: hit.i });
  if (hit.type === 'wall') return openMenu({ type: 'wall', i: hit.i });
  closeMenu();
}
function tapAt(x, y) { tapOn(hitTest(x, y)); }               // dev helper (window.__lh)

// --- menus (DOM) ---
function openMenu(m) { if (JSON.stringify(m) !== JSON.stringify(menuFor)) demolishArm = -1; menuFor = m; renderMenu(); el.menu.style.display = 'block'; gsap.fromTo(el.menu, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: FEEL.ui.in, ease: FEEL.ui.inEase }); }
function closeMenu() { menuFor = null; demolishArm = -1; el.menu.style.display = 'none'; }
function showUnitInfo(i) { demolishArm = -1; menuFor = { type: 'unit', i }; el.menu.style.display = 'block'; renderMenu(); }
function btn(label, sub, enabled, onClick) {
  const b = document.createElement('button');
  b.innerHTML = `${label}<small>${sub ?? ''}</small>`;
  b.dataset.label = label;
  b.disabled = !enabled;
  b.onclick = ev => { ev.stopPropagation(); onClick(); };   // a property, so a live update can hand the handler over
  return b;
}
// Trait cards (gdd/06 §10) share icons: most reuse the card / talent art, the rest come from icons_traits.
const TRAIT_ICON = {
  a_speed: 'rapid', a_range: 'longbow', a_dmg: 'heavyBow', a_split: 'split',
  s_hp: 'shieldWall', s_def: 'sturdy', s_dmg: 'heavyBlow', s_cleave: 'cleave',
  p_heal: 'prayer', p_cast: 'chant', p_multi: 'groupHeal', p_bless: 'blessing',
};
for (const k of ['spearman', 'crossbow', 'knight']) Object.assign(TRAIT_ICON, { [`${k}_dmg`]: 'atkUp', [`${k}_spd`]: 'atkSpeed', [`${k}_hp`]: 'vitality', [`${k}_def`]: 'sturdy' });
const cardIcon = id => (id === 'pouch' ? 'gold' : TRAIT_ICON[id] ?? id);
const FOE_LEVEL_NOTE = { 2: ['slime', '史萊姆出現：打死會分裂成兩隻'], 3: ['boar', '野豬出現：會衝鋒，第一擊三倍傷害'],
  4: ['shaman', '巫菇出現：會治療身邊的怪，先打它'], 5: ['mole', '鼴鼠出現：從地下鑽過城牆，牆內要留人'] };   // [foe, note]; a stage that bans the foe just says 更耐打了
const UNIT_NAME = { archer: '弓箭手', shield: '盾兵', priest: '牧師', worker: '工人', spearman: '長槍兵', crossbow: '弩手', knight: '騎士', skeleton: '骷髏兵' };
const profile = loadProfile();
let game = null;                                       // GameDef of the running match: stage + mods from the profile
const UNIT_TIP = { archer: '遠程，打輕甲', shield: '坦，嘲諷，打重甲', priest: '治療友軍' };
let menuSig = '';
function renderMenu(force = true) {
  if (!menuFor || !rec) return;
  const s = sim();
  const sig = JSON.stringify([menuFor, s.gold, s.level, pop(s), menuFor.type === 'slot' ? s.slots[menuFor.i] : 0, menuFor.type === 'wall' ? sideSegs(menuFor.i).map(w => s.walls[w]) : 0, menuFor.type === 'unit' ? s.units[menuFor.i] : 0]);
  if (!force && sig === menuSig) return;
  menuSig = sig;
  const m = el.menu;
  const h = document.createElement('h3'); const row = document.createElement('div'); row.className = 'row';
  const p = document.createElement('p');
  const room = pop(s) < popCap(s);
  if (menuFor.type === 'castle') {
    h.innerHTML = `主城 <small>耐久 ${Math.max(0, s.castle.hp)}/${s.castleMax}　人口 ${pop(s)}/${popCap(s)}　工人 ${workerCount(s)}/${WORKER_MAX}</small>`;
    p.textContent = s.castle.queue ? `訓練工人中（${Math.round((s.castle.progress / UNIT.worker.train) * 100)}%，佇列 ${s.castle.queue}）` : '工人會自己去修城牆和軍營；被打時先反擊。';
    const wc = workerCost(s);
    row.append(btn('工人', `${wc ? `金 ${wc}` : '免費'}　${UNIT.worker.train / 60} 秒・越多越貴`, s.castle.queue < QUEUE_MAX && workerCount(s) < WORKER_MAX && room && s.gold >= wc, () => send(encode(OP.MENU, 255, 0))));
  } else if (menuFor.type === 'slot') {
    const i = menuFor.i, sl = s.slots[i];
    if (!sl.kind) {
      if (INNER(i)) {
        h.innerHTML = '內圈空地 <small>只能蓋軍營</small>';
        p.textContent = `軍營：點它買兵，每座人口上限 +${POP_PER_BARRACKS}，越蓋越貴。`;
        row.append(btn('軍營', `金 ${barracksCost(s)}　人口 +${POP_PER_BARRACKS}`, s.gold >= barracksCost(s), () => send(encode(OP.BUILD, i, 0))));
      } else {
        h.innerHTML = '外圈空地 <small>軍營或法師塔</small>';
        p.textContent = '軍營：買兵、加人口。法師塔：先蓋一般塔（魔彈），再選冰霜、毒霧、戰旗、骸骨其一。';
        row.append(btn('軍營', `金 ${barracksCost(s)}　人口 +${POP_PER_BARRACKS}`, s.gold >= barracksCost(s), () => send(encode(OP.BUILD, i, 0))));
        row.append(btn('法師塔', `金 ${TOWER.cost}　射程 ${TOWER.range}`, s.gold >= TOWER.cost, () => send(encode(OP.BUILD, i, 1))));
      }
    } else if (sl.kind === 'tower') {
      const b = BRANCH[sl.branch];
      h.innerHTML = `${b ? b.name : '法師塔'} ${sl.lv > 1 ? `Lv${sl.lv - 1}` : ''} <small>耐久 ${sl.hp}/${barracksMaxHp(sl)}${sl.build ? '　施工中' : ''}</small>`;
      if (sl.lv === 1) {
        p.textContent = '選一種發展（之後可以再升兩級）。卡片「奧術」系列對所有塔有效。';
        BRANCHES.forEach((k, idx) => row.append(btn(BRANCH[k].name, `金 ${TOWER.branchCost}　${BRANCH[k].text}`, !sl.build && s.gold >= TOWER.branchCost, () => send(encode(OP.MENU, i, idx)))));
      } else {
        p.textContent = b.text + (sl.branch === 'bone' ? `（上限 ${BRANCH.bone.cap[sl.lv - 2]}）` : '');
        if (sl.lv < 4) row.append(btn(`升級 Lv${sl.lv}`, `金 ${TOWER.up[sl.lv - 2]}　範圍與效果提升`, !sl.build && s.gold >= TOWER.up[sl.lv - 2], () => send(encode(OP.MENU, i, 4))));
      }
    } else {
      h.innerHTML = `軍營 Lv${sl.lv} <small>耐久 ${sl.hp}/${barracksMaxHp(sl)}${sl.build ? '　施工中' : ''}</small>`;
      p.textContent = sl.queue.length ? `訓練中：${sl.queue.map((k, n) => UNIT_NAME[k] + (n ? '' : ` ${Math.round((sl.progress / trainTicks(s, k)) * 100)}%`)).join(' → ')}` : '新兵出現在軍營門口，拖曳到想守的位置。';
      s.mods.loadout.forEach((k, idx) => {
        const locked = sl.lv < idx + 1;
        row.append(btn(UNIT_NAME[k], locked ? `軍營 Lv${idx + 1} 解鎖` : `金 ${UNIT[k].cost}　${(trainTicks(s, k) / 60).toFixed(1)} 秒`, !locked && !sl.build && room && sl.queue.length < QUEUE_MAX && s.gold >= UNIT[k].cost, () => send(encode(OP.MENU, i, idx))));
      });
      if (sl.lv < 3) row.append(btn(`升級 Lv${sl.lv + 1}`, `金 ${BARRACKS.up[sl.lv - 1]}　解鎖${UNIT_NAME[s.mods.loadout[sl.lv]]}`, !sl.build && s.gold >= BARRACKS.up[sl.lv - 1], () => send(encode(OP.MENU, i, 3))));
    }
    if (sl.kind) {                                          // demolish: two taps (the first arms it) so a stray tap never tears a building down
      const back = Math.trunc((sl.spent * REFUND_PCT) / 100) + sl.queue.reduce((t, k) => t + UNIT[k].cost, 0);
      const armKey = `${i}:${sl.kind}:${sl.spent}`, armed = demolishArm === armKey;
      const b = btn(armed ? '確定拆除？' : '拆除', `退回 金 ${back}（${REFUND_PCT}%）`, true, () => {
        if (armed) { demolishArm = -1; send(encode(OP.MENU, i, DEMOLISH)); closeMenu(); }
        else { demolishArm = armKey; renderMenu(); }
      });
      b.classList.add('danger'); row.append(b);
    }
  } else if (menuFor.type === 'wall') {
    const segs = sideSegs(menuFor.i).map(k => s.walls[k]), names = ['缺口', '木柵', '石牆', '鐵牆'];
    const lo = Math.min(...segs.map(w => w.lv)), hi = Math.max(...segs.map(w => w.lv)), to = sideUpgradeTo(s, menuFor.i), cost = sideUpgradeCost(s, menuFor.i);
    const DIR = ['東', '東南', '南', '西南', '西', '西北', '北', '東北'];
    h.innerHTML = `${DIR[menuFor.i]}側城牆・${hi === 0 ? '缺口' : lo === hi ? names[lo] : `${names[lo]}～${names[hi]}`} <small>${segs.map(w => (w.lv ? `${w.hp}/${wallMaxHp(s, w.lv)}` : '空')).join('　')}</small>`;
    p.textContent = '留缺口可以把會繞路的怪（狼、巫菇、一半的影鼠和史萊姆）引到同一個入口；甲蟲、蝸牛、影弓手、野豬一定拆牆（野豬第一擊三倍）；鼴鼠從地下鑽過城牆。工人會自動修。';
    if (to) row.append(btn(to === 1 ? `蓋${names[1]}（整面 3 段）` : `整面升到${names[to]}`, `金 ${cost}　每段耐久 ${wallMaxHp(s, to)}`, s.gold >= cost, () => send(encode(OP.WALL, menuFor.i, 0))));
  } else if (menuFor.type === 'unit') {
    const u = s.units[menuFor.i];
    if (!u?.alive) return closeMenu();
    const next = u.lv < 3 ? `　經驗 ${u.xp}/${[5, 15][u.lv - 1]}` : '　滿級';
    const reachName = ROLE[u.kind] === 'ranged' ? '射程' : ROLE[u.kind] === 'melee' ? '警戒' : '範圍';
    h.innerHTML = `${UNIT_NAME[u.kind]} Lv${u.lv} <small>血 ${u.hp}/${unitMaxHp(s, u)}${next}　${reachName} ${unitReach(s, u)}</small>`;
    p.textContent = u.kind === 'worker' ? (u.job >= 0 ? '正在修復' : '待命（有東西壞了就會去修）') : '拖曳到新位置，隨時可以改令（走過去途中不攻擊，抵達後 1 秒架設）。';
  }
  // Live updates (gold, hp, progress change every few ticks) keep the same button elements and only refresh their
  // text and state: replacing a button between finger-down and finger-up would swallow the tap.
  const key = JSON.stringify(menuFor), oldRow = m.querySelector('.row'), oldB = oldRow ? [...oldRow.children] : [], newB = [...row.children];
  const same = m.dataset.for === key && oldB.length === newB.length && oldB.every((b, k) => b.dataset.label === newB[k].dataset.label && b.className === newB[k].className);
  if (same) {
    const oh = m.querySelector('h3'), op = m.querySelector('p');
    if (oh.innerHTML !== h.innerHTML) oh.innerHTML = h.innerHTML;
    if (op.textContent !== p.textContent) op.textContent = p.textContent;
    oldB.forEach((b, k) => { const n = newB[k]; if (b.innerHTML !== n.innerHTML) b.innerHTML = n.innerHTML; b.disabled = n.disabled; b.onclick = n.onclick; });
  } else { m.innerHTML = ''; m.dataset.for = key; m.append(h, p, row); }
}
el.menu.addEventListener('pointerdown', e => e.stopPropagation());

function toastHint(t) { el.hint.textContent = t; gsap.fromTo(el.hint, { opacity: 1 }, { opacity: 0.75, duration: 1.2 }); }

// --- battle strip (v24): only evolution progress — what the player is building toward; owned cards live in the offer
let buildSig = '';
function renderBuild() {
  const s = sim();
  const sig = JSON.stringify([s.cards, s.evo]);
  if (sig === buildSig) return;
  buildSig = sig;
  el.build.innerHTML = '';
  const slots = Object.entries(EVOS).filter(([e, v]) => s.evo[e] || s.cards[v.from] || s.cards[v.with]).map(([e, v]) =>
    [e, s.evo[e] ? '★' : `${Math.min(s.cards[v.from], 3)}/3${s.cards[v.with] ? '✓' : ''}`, s.evo[e]]);
  el.skills.innerHTML = slots.map(([id, lv, done]) => `<div class="sk evo ${done ? '' : 'todo'}" title="${EVOS[id].name}"><i style="${iconStyle(px, cardIcon(id), 34)}"></i><b>${lv}</b></div>`).join('');
}

// --- level-up offer (DOM) ---
function cardHints(s, id) {
  if (EVOS[id]) return [`進化：${CARDS[EVOS[id].from].name} Lv3 ＋ ${CARDS[EVOS[id].with].name}`];
  if (id === 'pouch') return ['卡池已空：拿金幣'];
  const out = [];
  for (const e of Object.values(EVOS)) {
    if (id !== e.from && id !== e.with) continue;
    const a = s.cards[e.from] + (id === e.from ? 1 : 0), b = s.cards[e.with] + (id === e.with ? 1 : 0);
    out.push(`→ ${e.name}：${CARDS[e.from].name} ${Math.min(a, 3)}/3 · ${CARDS[e.with].name} ${b ? '✓' : '✗'}`);
  }
  return out;
}
function renderOffer(animate) {
  const s = sim(), o = s.offer;
  if (!o) return;
  const cards = o.ids.map((id, k) => {
    const evo = !!EVOS[id], c = evo ? EVOS[id] : CARDS[id];
    const lvNow = evo || id === 'pouch' ? 0 : s.cards[id];
    const tags = evo ? '<span class="tag evo">進化</span>' : '';
    const typeChip = CARDS[id] ? `<span class="tag type ${CARDS[id].type === s.lockType ? 'locked' : ''}">${CARD_TYPES[CARDS[id].type]}${CARDS[id].type === s.lockType ? ' 🔒' : ''}</span>` : '';
    const isTrait = !!CARDS[id]?.trait, r = o.rar?.[k] ?? 0, R = RARITY[r];
    const fmt = v => (CARDS[id].unit === '%' ? `+${v}%` : `+${v}`);
    const pips = evo || id === 'pouch' ? '' : isTrait
      ? `<div class="pips rar" style="color:${R.color}">${R.name}　${tr(s, id) ? `已疊 ${fmt(tr(s, id))}` : '新'}</div>`
      : `<div class="pips">${'●'.repeat(lvNow)}<b>●</b>${'○'.repeat(CARD_MAX - lvNow - 1)}　${lvNow ? `Lv${lvNow} → Lv${lvNow + 1}` : '新'}</div>`;
    const text = id === 'pouch' ? `+${POUCH_GOLD} 金` : isTrait ? `<b class="val" style="color:${R.color}">${fmt(CARDS[id].val[r])}</b> ${c.text}` : c.text;
    const hints = cardHints(s, id).map(t => `<div class="hint2">${t}</div>`).join('');
    const ico = `<i class="ico" style="${iconStyle(px, cardIcon(id), 48)}"></i>`;
    // per-card side buttons: grey when this card cannot be ignored / locked or no uses are left
    const canIgnore = !!CARDS[id] && s.ignores > 0, canLock = !!CARDS[id] && s.locks > 0 && CARDS[id].type !== s.lockType;
    const side = `<div class="side"><button class="ign" data-k="${k}" ${canIgnore ? '' : 'disabled'}>忽略</button><button class="lck" data-k="${k}" ${canLock ? '' : 'disabled'}>鎖定</button></div>`;
    return `<div class="cardcol"><button class="card ${evo ? 'evo' : ''} ${isTrait ? `rar${r}` : ''}" data-k="${k}" ${isTrait ? `style="border-color:${R.color};box-shadow:0 0 ${4 + r * 5}px ${R.color}55"` : ''}>${ico}<h4>${id === 'pouch' ? '金袋' : c.name}</h4><div class="tags">${typeChip}${tags}</div>${pips}<p>${text}</p>${hints}</button>${side}</div>`;
  }).join('');
  el.cards.innerHTML = `<h2>${o.boss ? `首領戰利品・三選一　<small style="color:${RARITY[s.floors[0]]?.color}">至少${RARITY[s.floors[0]]?.name}</small>` : `守望 Lv${s.level}`}${s.pending > 1 ? `　<small>還有 ${s.pending - 1} 次</small>` : ''}</h2><div class="hand">${cards}</div>
    <p class="uses">忽略剩 ${s.ignores}・鎖定剩 ${s.locks}${s.lockType ? `（已鎖：${CARD_TYPES[s.lockType]}）` : ''}</p>
    <div class="row"><button id="reroll" ${s.rerolls ? '' : 'disabled'}>3 張重抽<small>剩 ${s.rerolls}</small></button></div>`;
  el.cards.style.display = 'block';
  el.cards.querySelectorAll('.card').forEach(b => b.addEventListener('click', () => doChoose(Number(b.dataset.k))));
  el.cards.querySelectorAll('.ign').forEach(b => b.addEventListener('click', () => doChoose(CHOICE.IGNORE + Number(b.dataset.k))));
  el.cards.querySelectorAll('.lck').forEach(b => b.addEventListener('click', () => doChoose(CHOICE.LOCK + Number(b.dataset.k))));
  $('#reroll').addEventListener('click', () => doChoose(CHOICE.REROLL));
  if (animate) gsap.fromTo(el.cards.querySelectorAll('.cardcol'), { y: 40, opacity: 0, scale: 0.85 }, { y: 0, opacity: 1, scale: 1, duration: FEEL.card.in, ease: FEEL.card.ease, stagger: FEEL.card.stagger });
}
function doChoose(index) {
  if (!rec.choose(index)) return;
  sfx.play(index < 3 ? 'card' : 'click');
  playEvents(rec.sim.events); rec.sim.events.length = 0;
  if (rec.phase === 'choice') { renderOffer(true); return; }
  el.cards.style.display = 'none'; document.body.classList.remove('modal-open');
  if (state === 'pick') state = 'play';
  sync(performance.now());
}
function openOffer() {
  state = 'pick'; closeMenu(); endDrag();
  document.body.classList.add('modal-open');
  sfx.play('perfect');
  renderOffer(true);
}

// --- chest reveal: a render-only pause; the sim already applied the upgrades ---
function showChest(ev) {
  state = 'chest';
  document.body.classList.add('modal-open');                // reward screen spec (gdd/02 §UI 彈窗): nothing else on top
  const s = sim(), why = ev.why === 'event' ? '事件獎勵' : '擊殺里程碑';
  const card = (id, k) => {
    if (EVOS[id]) return `<div class="rw-card evo"><i style="${iconStyle(px, cardIcon(id), 48)}"></i><h4>${EVOS[id].name}</h4><b class="rw-val">進化！</b><small>${EVOS[id].text}</small></div>`;
    if (id === 'pouch') return `<div class="rw-card"><i style="${iconStyle(px, 'gold', 48)}"></i><h4>金袋</h4><b class="rw-val">+${POUCH_GOLD} 金</b><small>卡池已空</small></div>`;
    const c = CARDS[id], r = ev.rars?.[k] ?? 0, R = RARITY[r];
    const val = c.trait ? `${c.unit === '%' ? `+${c.val[r]}%` : `+${c.val[r]}`}` : `Lv${s.cards[id]}`;
    const note = c.trait ? `${c.text}・已疊 ${c.unit === '%' ? `${tr(s, id)}%` : `+${tr(s, id)}`}` : c.text;
    return `<div class="rw-card" style="--rc:${c.trait ? R.color : '#d8c39a'}"><i style="${iconStyle(px, cardIcon(id), 48)}"></i><h4>${c.name}</h4>
      <b class="rw-val">${val}</b>${c.trait ? `<span class="rw-rar">${R.name}</span>` : ''}<small>${note}</small></div>`;
  };
  el.chest.innerHTML = `<div class="rw-panel"><div class="rw-head"><h2>寶箱</h2><p>${why}・自動獲得 ${ev.n} 項</p></div>
    <div class="rw-cards">${ev.ups.map(card).join('')}</div><button class="rw-go">繼續</button></div>`;
  el.chest.style.display = 'block';
  const tl = gsap.timeline();
  tl.fromTo(el.chest.querySelector('.rw-panel'), { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: FEEL.ui.in, ease: FEEL.ui.inEase });
  el.chest.querySelectorAll('.rw-card').forEach((m, k) => {
    tl.fromTo(m, { rotationY: 90, opacity: 0 }, { rotationY: 0, opacity: 1, duration: FEEL.chest.flip, ease: 'back.out(1.7)', onStart: () => { sfx.play(EVOS[ev.ups[k]] ? 'evolve' : 'pickup', { pitch: 1 + k * 0.12 }); particles.burst(CX, CY - 200, EVOS[ev.ups[k]] ? 0x8ff0ff : 0xfff2b0, 18); } }, k ? `>+${FEEL.chest.stagger - FEEL.chest.flip}` : `>+${FEEL.chest.delay}`);
  });
  let done = false;
  const close = () => { if (done) return; done = true; tl.progress(1); el.chest.style.display = 'none'; document.body.classList.remove('modal-open'); state = 'play'; };
  el.chest.onclick = close;
  // stays until tapped, so it is never mistaken for a pick that vanished
}

function banner(text, sub, kind) {
  el.banner.innerHTML = `<b>${text}</b><small>${sub}</small>`;
  el.banner.className = `banner ${kind}`;
  gsap.timeline().fromTo(el.banner, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: FEEL.banner.in, ease: FEEL.banner.ease })
    .to(el.banner, { opacity: 0, duration: FEEL.banner.out }, `+=${FEEL.banner.hold}`);
}

// --- one-shot effects ---
function animFx(name, x, y, k = 1) {                 // one-shot pixel animation (explosion, frost, fire, steam, spark)
  const s = new AnimatedSprite({ textures: anim(px.fx, name), animationSpeed: 0.3, loop: false, autoUpdate: true });
  s.anchor.set(0.5); s.position.set(x, y); s.scale.set(PX * k);
  s.onComplete = () => s.destroy();
  fxLayer.addChild(s); s.play();
}
function ringFx(x, y, r, tint, alpha = 0.9) {
  const s = new Sprite({ texture: art.ring, anchor: 0.5, tint, alpha });
  s.position.set(x, y); s.scale.set(0.05);
  fxLayer.addChild(s);
  gsap.to(s.scale, { x: r / 128, y: r / 128, duration: FEEL.ring.dur, ease: FEEL.ring.ease });
  gsap.to(s, { alpha: 0, duration: FEEL.ring.dur, ease: 'power1.in', onComplete: () => s.destroy() });
}
function zapFx(pts) {
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
    const s = new Sprite({ texture: tex(px.fx, 'bolt'), anchor: { x: 0, y: 0.5 } });
    s.position.set(ax, ay - 10); s.rotation = Math.atan2(by - ay, bx - ax); s.scale.set(Math.hypot(bx - ax, by - ay) / 24, PX);
    fxLayer.addChild(s);
    gsap.to(s, { alpha: 0, duration: FEEL.zap.dur, ease: 'none', onComplete: () => s.destroy() });
    particles.burst(bx, by - 10, 0xc9a2ff, 4);
  }
}
function rainFx(x, y, r) {
  ringFx(x, y, r, 0x6fd3c4, 0.6);
  for (let k = 0; k < 7; k++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * r, tx = x + Math.cos(a) * d, ty = y + Math.sin(a) * d;
    const s = new Sprite({ texture: tex(px.fx, 'arrow'), anchor: 0.5, rotation: Math.PI / 2, scale: PX });
    s.position.set(tx, ty - 160); fxLayer.addChild(s);
    gsap.to(s, { y: ty, duration: 0.16, ease: 'power2.in', delay: k * 0.02, onComplete: () => { particles.burst(tx, ty, 0x6fd3c4, 3); s.destroy(); } });
  }
}
let comboT = 0;
function comboFx(n) {
  el.combo.textContent = `連鎖 ×${n}`;
  comboT = performance.now();
  gsap.fromTo(el.combo, { scale: FEEL.combo.scale, opacity: 1 }, { scale: 1, duration: FEEL.combo.dur, ease: 'back.out(2)' });
  gsap.to(el.combo, { opacity: 0, duration: 0.4, delay: 0.9 });
}

// --- events -> juice ---
let lastHitSfx = 0, lastZap = 0;
function playEvents(evs) {
  for (const ev of evs) {
    switch (ev.type) {
      case 'shot': spawnShot(ev); break;
      case 'kill': {
        particles.burst(ev.x, ev.y, COLORS[ev.kind] ?? 0xffffff, ev.kind === 'boss' ? 60 : 8);
        if (ev.gold) particles.burst(ev.x, ev.y - 6, 0xf0c35a, 3);
        if (performance.now() - lastHitSfx > 60) { sfx.play('pickup', { gain: 0.35 }); lastHitSfx = performance.now(); }
        if (ev.kind === 'boss') { shake(shakeEl, 'boss'); flash(); }
        break;
      }
      case 'hit': {
        const until = performance.now() + (ev.who === 'foe' ? FEEL.hitFlash : FEEL.struck.dur) * 1000;
        const v = ev.who === 'foe' ? foeViews.get(ev.id) : ev.who === 'slot' ? slotViews[ev.k] : ev.who === 'unit' ? unitViews.get(ev.i) : null;
        if (v) v.flashUntil = until;
        if (ev.who === 'foe' && v) {
          dmgNumber(ev.id, v.s.x, v.s.y - 6 * v.k, ev.dmg, ev.counter, ev.why);
          if (ev.counter > 0 || ev.dmg >= FEEL.hitStop.dmg) v.stopUntil = performance.now() + FEEL.hitStop.ms;   // local hit-stop: only this foe freezes
        }
        break;
      }
      case 'unitLevelUp': { const v = unitViews.get(ev.i); if (v) gsap.fromTo(v.body.scale, { x: FEEL.levelUp.scale, y: FEEL.levelUp.scale }, { x: 0.95, y: 0.95, duration: FEEL.levelUp.dur, ease: FEEL.levelUp.ease }); sfx.play('perfect', { gain: 0.5 }); break; }
      case 'unitDown': particles.burst(sim().units[ev.i].x / ONE, sim().units[ev.i].y / ONE, 0xff6b5a, 10); sfx.play('miss', { gain: 0.5 }); break;
      case 'wallHit': wallViews[ev.seg].flashUntil = performance.now() + FEEL.struck.dur * 1000; break;
      case 'castleHit': if (performance.now() - (playEvents.ch ?? 0) > 400) { hurt(0.5); shake(shakeEl, 'light'); playEvents.ch = performance.now(); } break;
      case 'wallBreak': { const b = wallViews[ev.seg].blocks[1]; particles.burst(b.x, b.y, 0x9c7a4f, 16); animFx('explosion', b.x, b.y - 8); shake(shakeEl, 'crit'); sfx.play('boom', { gain: 0.6 }); break; }
      case 'boom': particles.burst(ev.x, ev.y, 0xe07ab8, 20); shake(shakeEl, 'light'); sfx.play('boom', { gain: 0.4 }); break;
      case 'bldgDown': shake(shakeEl, 'crit'); sfx.play('boom'); break;
      case 'demolish': { const [x, y] = SLOTS[ev.slot]; particles.burst(x, y, 0x9c7a4f, 14); sfx.play('pickup', { gain: 0.5 }); toastHint(`拆除，退回 ${ev.refund} 金`); break; }
      case 'build': case 'wallBuild': sfx.play('perfect', { gain: 0.4 }); break;
      case 'produce': particles.burst(CX, CY - 60, 0xf0c35a, 8); toastHint(`牧場 +${ev.amount} 金`); break;
      case 'prewarn': showWarn(ev); break;
      case 'foeLevel': { const note = FOE_LEVEL_NOTE[ev.lv]; banner(`怪物升到 Lv${ev.lv}`, note && !sim().script.bans.includes(note[0]) ? note[1] : '更耐打了', 'react'); sfx.play('miss', { gain: 0.5 }); break; }
      case 'foeHeal': if (ev.n) { particles.burst(ev.x, ev.y - 10, 0xc6a8ff, 10); } break;
      case 'charge': { const v = foeViews.get(ev.id); if (v) particles.burst(v.s.x, v.s.y, 0x9c7a4f, 8); break; }
      case 'surface': particles.burst(ev.x, ev.y, 0x6b4a2e, 14); animFx('explosion', ev.x, ev.y, 0.5); sfx.play('boom', { gain: 0.3 }); break;
      case 'foeAtk': if (ev.heavy) shake(shakeEl, 'light'); break;
      case 'eventStart': sfx.play('boom', { gain: 0.3 }); break;
      case 'eventClear': if (ev.pts) toastHint(`${sim().script.events[ev.ev].name} 清除 +${ev.pts}${sim().script.events[ev.ev].chest ? '　寶箱！' : ''}`); break;
      case 'bossDown': banner(ev.final ? '大王倒下！' : '擊倒首領！', ev.final ? '守住了這一關' : '首領戰利品：三選一', 'evo'); flash(); shake(shakeEl, 'boss'); sfx.play('evolve'); break;
      case 'ignore': toastHint(`已忽略：${CARD_TYPES[ev.cardType]}卡本局不再出現`); break;
      case 'lock': toastHint(`已鎖定：${CARD_TYPES[ev.cardType]}卡出現率 +50%`); break;
      case 'repair': if (Math.random() < 0.5) particles.burst(sim().units[ev.i].x / ONE, sim().units[ev.i].y / ONE - 10, 0xd8c39a, 2); break;
      case 'castStart': { const u = sim().units[ev.i]; if (u) animFx('sparkle', u.x / ONE, u.y / ONE - 40); break; }
      case 'heal': { const u = sim().units[ev.to]; if (u) { animFx('sparkle', u.x / ONE, u.y / ONE - 20, 1.5); particles.burst(u.x / ONE, u.y / ONE - 20, 0xb6f0a0, 6); } break; }
      case 'firstOf': if (['shield', 'priest', 'worker', 'tower'].includes(ev.kind)) toastHint(`${{ shield: '盾兵', priest: '牧師', worker: '工人', tower: '法師塔' }[ev.kind]}卡開始出現在三選一`); break;
      case 'towerBranch': sfx.play('perfect'); toastHint(`${BRANCH[ev.branch].name}：${BRANCH[ev.branch].text}`); break;
      case 'towerPulse': { const [tx, ty] = SLOTS[ev.slot]; if (ev.branch === 'frost') ringFx(tx, ty, ev.r, 0x9fdcff, 0.5); else if (ev.branch === 'poison') { ringFx(tx, ty, ev.r, 0x9fef8f, 0.4); animFx(px.fx.animations.poison ? 'poison' : 'steam', tx, ty - 10, 1.5); } else if (ev.branch === 'bone') animFx(px.fx.animations.summon ? 'summon' : 'sparkle', tx, ty + 30, 1.5); break; }
      case 'rally': ringFx(ev.x, ev.y, 60, COLORS.ally, 0.8); toastHint(`${UNIT_NAME[ev.kind]} ×${ev.n} 前往集合`); break;
      case 'upgrade': sfx.play('perfect'); toastHint(ev.kind === 'tower' ? `法師塔升到 Lv${ev.lv - 1}` : `軍營升到 Lv${ev.lv}：可以生產${UNIT_NAME[sim().mods.loadout[ev.lv - 1]]}`); break;
      case 'diamonds': toastHint(`◆ +${ev.n} 鑽石`); particles.burst(CX, CY - 80, 0x8fd3ff, 20); sfx.play('pickup'); break;
      case 'workerBorn': toastHint('工人出發：會自動修城牆和軍營'); break;
      // card powers
      case 'explode': animFx('explosion', ev.x, ev.y, ev.r / 40); if (ev.inferno) animFx('fire', ev.x, ev.y - 6, 1.5); particles.burst(ev.x, ev.y, 0xff8a3d, ev.inferno ? 10 : 6); break;
      case 'zap': zapFx(ev.pts); if (performance.now() - lastZap > 80) { sfx.play('zap', { gain: 0.5 }); lastZap = performance.now(); } break;
      case 'thunder': flash(); shake(shakeEl, 'light'); break;
      case 'rain': rainFx(ev.x, ev.y, ev.r); sfx.play('whiff', { gain: 0.4 }); break;
      case 'winter': ringFx(CX, CY, ev.r, 0x8fd3ff, 1); particles.burst(CX, CY, 0xcfefff, 30); sfx.play('whiff', { pitch: 0.6 }); break;
      case 'react': animFx('frost', ev.x, ev.y, Math.max(1, ev.r / 30)); break;   // 霜盾 freeze
      case 'chain': if (ev.n >= FEEL.combo.min) { comboFx(ev.n); if (ev.n >= 8) shake(shakeEl, 'crit'); } break;
      // growth
      case 'levelUp': particles.burst(CX, CY - 80, COLORS.lamp, 24); break;
      case 'evolve': banner(`進化：${EVOS[ev.id].name}`, EVOS[ev.id].text, 'evo'); sfx.play('evolve'); flash(); shake(shakeEl, 'crit'); particles.burst(CX, CY - 60, 0x8ff0ff, 60); break;
      case 'card': if (ev.id === 'reinforce') toastHint('援軍抵達！拖曳他們布陣'); else if (CARDS[ev.id]?.trait && ev.rar >= 3) { banner(`${RARITY[ev.rar].name}・${CARDS[ev.id].name}`, `${CARDS[ev.id].text} ${CARDS[ev.id].unit === '%' ? '+' + CARDS[ev.id].val[ev.rar] + '%' : '+' + CARDS[ev.id].val[ev.rar]}`, 'evo'); } break;
      case 'chest': pendingChest = ev; break;
    }
  }
}
let pendingChest = null;
function spawnShot(ev) {
  if (ev.i >= 0) { const v = unitViews.get(ev.i); if (v) { v.attackUntil = performance.now() + 300; v.face = ev.tx < ev.x ? -1 : 1; } }
  if (ev.kind === 'shield' || ev.kind === 'worker' || ev.kind === 'skeleton') { animFx('spark', ev.tx, ev.ty - 8); return; }
  const name = ev.kind === 'castle' ? 'beam' : ev.kind === 'priest' ? 'sparkle' : ev.kind === 'tower' ? 'bolt' : 'arrow';
  const s = new Sprite({ texture: tex(px.fx, name), anchor: 0.5 });
  s.scale.set(PX); s.position.set(ev.x, ev.y - 16); s.rotation = Math.atan2(ev.ty - ev.y, ev.tx - ev.x);
  fxLayer.addChild(s);
  gsap.to(s, { x: ev.tx, y: ev.ty - 8, duration: FEEL.shot.dur, ease: FEEL.shot.ease, onComplete: () => s.destroy() });
}
function showWarn(ev) {
  const EVENTS = sim().script.events;
  el.warn.textContent = `⚠ 6 秒後：${EVENTS[ev.ev].boss ? '👑 ' : ''}${ev.name}${EVENTS[ev.ev].chest ? `（${(EVENTS[ev.ev].limit ?? EVENT_CLEAR_TICKS) / 60} 秒內清完得寶箱）` : ''}`;
  gsap.timeline().to(el.warn, { opacity: 1, duration: FEEL.warn.in }).to(el.warn, { opacity: 0, duration: FEEL.warn.out }, `+=${FEEL.warn.hold}`);
  warnUntil = performance.now() + 9000; warnGates = ev.gates.slice(0, EVENTS[ev.ev].groups.some(g => g.gate === 'n' || g.gate === 'b') ? 2 : 1);
  if (EVENTS[ev.ev].groups.some(g => g.gate === 'b')) warnGates = [ev.gates[0], (ev.gates[0] + 4) % 8];
  if (EVENTS[ev.ev].groups.some(g => g.gate === 'all')) warnGates = [0, 1, 2, 3, 4, 5, 6, 7];
  sfx.play('miss', { gain: 0.4, pitch: 0.6 });
}
let warnUntil = 0, warnGates = [];

// --- minimap (top right): the whole field, enemies, our side and the camera; tap or drag it to move the view ---
let minimapN = 0;
const MM = { half: 760 };                                    // world units from the castle shown at the minimap edge
function drawMinimap(s) {
  const c = el.minimap, g = c.getContext('2d'), w = c.width, h = c.height, k = w / (MM.half * 2);
  const X = x => (x - CX) * k + w / 2, Y = y => (y - CY) * k + h / 2;
  g.fillStyle = '#1d3326'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#3e5a42'; g.lineWidth = 3;
  for (let a = 0; a < 8; a++) { const r = (a * Math.PI) / 4; g.beginPath(); g.moveTo(X(CX), Y(CY)); g.lineTo(X(CX + Math.cos(r) * 900), Y(CY + Math.sin(r) * 900)); g.stroke(); }
  g.lineWidth = 2;
  s.walls.forEach((wl, i) => {
    if (!wl.lv) return;
    const n = Math.round((i * Math.PI * 2) / WALL_SEGS / (Math.PI / 4)) * (Math.PI / 4), p = t => { const ang = ((i - 0.5 + t) * Math.PI * 2) / WALL_SEGS, rr = WALL_R / Math.cos(ang - n); return [X(CX + Math.cos(ang) * rr), Y(CY + Math.sin(ang) * rr)]; };
    const [x0, y0] = p(0), [x1, y1] = p(1);
    g.strokeStyle = ['', '#9c7a4f', '#a8acb8', '#d8e2f0'][wl.lv]; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  });
  g.fillStyle = '#ffb64a'; g.fillRect(X(CX) - 3, Y(CY) - 3, 6, 6);
  s.slots.forEach((sl, i) => { if (!sl.kind) return; g.fillStyle = sl.kind === 'tower' ? '#c8a8ff' : '#c0763f'; g.fillRect(X(SLOTS[i][0]) - 2, Y(SLOTS[i][1]) - 2, 4, 4); });
  g.fillStyle = '#6fd3c4';
  for (const u of s.units) if (u.alive) g.fillRect(X(u.x / ONE) - 1, Y(u.y / ONE) - 1, 2, 2);
  for (const f of s.foes) { const big = FOE[f.kind].boss; g.fillStyle = big ? '#ff3d6e' : '#ff8a8a'; const r = big ? 3 : 1; g.fillRect(X(f.x / ONE) - r, Y(f.y / ONE) - r, r * 2, r * 2); }
  const vw = ART_W * PX * k, vh = ART_H * PX * k;
  g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.strokeRect(X(camX) - vw / 2, Y(camY) - vh / 2, vw, vh);
}
function minimapTo(e) {
  const r = el.minimap.getBoundingClientRect(), k = (MM.half * 2) / r.width;
  setCam(CX + (e.clientX - r.left - r.width / 2) * k, CY + (e.clientY - r.top - r.height / 2) * k);
}
el.minimap.addEventListener('pointerdown', e => { e.stopPropagation(); el.minimap.setPointerCapture(e.pointerId); minimapTo(e); });
el.minimap.addEventListener('pointermove', e => { if (e.buttons) minimapTo(e); });

// --- per-frame sync from sim ---
function sync(now) {
  const s = sim();
  el.gold.textContent = s.gold; el.kills.textContent = s.kills;
  renderRally();
  if ((++minimapN & 3) === 0) drawMinimap(s);
  el.pop.textContent = `${pop(s)}/${popCap(s)}`; el.score.textContent = score(s);
  const left = Math.max(0, Math.ceil((s.script.matchTicks - s.tick) / 60));
  el.time.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  el.hp.style.transform = `scaleX(${Math.max(0, s.castle.hp) / s.castleMax})`;
  el.lv.textContent = `Lv${s.level}`;
  el.xp.style.transform = `scaleX(${s.level >= LEVEL_MAX ? 1 : s.xp / XP_NEED(s.level)})`;
  renderBuild();
  selRing.visible = false;
  if (!drag && menuFor?.type === 'unit' && s.units[menuFor.i]?.alive) {
    const u = s.units[menuFor.i];
    selRing.visible = true; selRing.position.set(u.x / ONE, u.y / ONE); selRing.scale.set(unitReach(s, u) / 128);
  } else if (!drag && menuFor?.type === 'slot' && s.slots[menuFor.i]?.kind === 'tower') {
    const [tx, ty] = SLOTS[menuFor.i];
    selRing.visible = true; selRing.position.set(tx, ty); selRing.scale.set(towerRange(s, s.slots[menuFor.i]) / 128);
  }
  const lr = lightR(s); light.scale.set(lr / 64); lightRing.scale.set(lr / 128); rangeRing.scale.set(lr / 128); rangeRing.position.set(CX, CY);

  s.slots.forEach((sl, i) => {
    const v = slotViews[i];
    v.s.visible = !!sl.kind; v.bar.visible = sl.kind === 'barracks'; v.s.shadow.visible = !!sl.kind;
    if (!sl.kind) { v.kind = ''; return; }
    const key = sl.kind === 'tower' ? `tower_${sl.branch || 'basic'}` : `barracks_${sl.lv}`;
    if (v.key !== key) { v.key = key; const t = px.buildings.textures[key] ?? tex(px.buildings, 'barracks_1'); for (const l of v.s.children) { l.texture = t; l.tint = l === v.s.children[v.s.children.length - 1] && !px.buildings.textures[key] ? TOWER_TINT[sl.branch || 'basic'] : l.tint; } }
    v.s.shadow.visible = true;
    v.kind = sl.kind;
    v.s.alpha = sl.build ? 0.55 : 1;
    v.bar.scale.set((sl.hp / barracksMaxHp(sl)) * 5, 1);
  });
  s.walls.forEach((w, i) => {
    const v = wallViews[i];
    const planning = !w.lv && menuFor?.type === 'wall' && menuFor.i === sideOf(i);   // an empty side shows a faint wall only while its menu is open
    const key = w.lv ? `${w.lv}_${WALL_STATE(w.hp / wallMaxHp(s, w.lv))}` : planning ? 'plan' : '';
    if (v.key === key) return;
    v.key = key;
    for (const b of v.blocks) {
      b.visible = !!key; b.alpha = planning ? 0.4 : 1;
      if (key) for (const l of b.children) l.texture = wallBlock(w.lv || 1, planning ? 'intact' : key.split('_')[1]);
    }
  });
  for (const cv of cornerViews) cv.t.visible = cv.sh.visible = cv.segs.some(w => s.walls[w].lv > 0);
  // struck look: each hit building / wall segment flashes red and shakes on its own
  const nowS = performance.now(), jit = FEEL.struck.jitter * PX * (Math.floor(nowS / 40) % 2 ? 1 : -1);
  const struck = (layers, on) => { for (const l of layers) l.tint = on ? FEEL.struck.tint : 0xffffff; };
  slotViews.forEach((v, k) => {
    const on = (v.flashUntil ?? 0) > nowS;
    if (on === !!v.struck && !on) return;
    v.struck = on; struck(v.s.children, on); v.s.x = SLOTS[k][0] + (on ? jit : 0);
  });
  wallViews.forEach(v => {
    const on = (v.flashUntil ?? 0) > nowS;
    if (on === !!v.struck && !on) return;
    v.struck = on;
    v.blocks.forEach((b, n) => { struck(b.children, on); b.x = (b.baseX ??= b.x) + (on ? (n % 2 ? jit : -jit) : 0); });
  });

  const seen = new Set();
  s.units.forEach((u, i) => {
    if (!u.alive) return;
    seen.add(i);
    const v = unitView(i, u);
    v.c.position.set(u.x / ONE, u.y / ONE); v.c.zIndex = u.y / ONE;
    const moving = u.state === 'moving' || (u.kind === 'worker' && Math.abs(u.x - (v.px ?? u.x)) + Math.abs(u.y - (v.py ?? u.y)) > 0);
    if (u.x !== (v.px ?? u.x)) v.face = u.x < v.px ? -1 : 1;
    v.px = u.x; v.py = u.y;
    if (now < v.attackUntil) setAnim(v, px.units, `${v.art}_attack`, 0.18);
    else if (moving || (u.kind === 'skeleton' && (u.x !== u.hx || u.y !== u.hy))) setAnim(v, px.units, `${v.art}_walk`, 0.15);
    else setAnim(v, px.units, `${v.art}_idle`, 0.05);
    v.body.scale.set(PX * v.face, PX);
    v.body.alpha = u.state === 'setup' ? 0.7 : 1;
    v.baseTint ??= v.body.tint;
    v.body.tint = (v.flashUntil ?? 0) > performance.now() ? FEEL.struck.tint : v.baseTint;   // struck: red flash
    v.pips.forEach((p, k) => { p.visible = k < u.lv; });
    v.hp.scale.x = 2.8 * Math.max(0, u.hp / unitMaxHp(s, u));
  });
  for (const [i, v] of unitViews) if (!seen.has(i) || !s.units[i].alive) { v.c.destroy({ children: true }); unitViews.delete(i); }

  const live = new Set();
  for (const f of s.foes) {
    live.add(f.id);
    const v = foeView(f);
    v.s.position.set(f.x / ONE, f.y / ONE); v.s.zIndex = f.y / ONE;
    if (v.sh) { v.sh.position.set(f.x / ONE, f.y / ONE - 2); v.sh.zIndex = f.y / ONE - 1; }
    if (f.x !== v.lastX) { v.s.scale.x = PX * v.k * (f.x < v.lastX ? -1 : 1); v.lastX = f.x; }
    const mode = f.burrow ? 'burrow' : 'walk';                 // the mole shows a moving dirt mound while underground
    if (mode !== v.mode && px.foes.animations[`mole_${mode}`]) { v.mode = mode; v.s.textures = anim(px.foes, `mole_${mode}`); v.s.play(); }
    v.pips.forEach((p, n) => { p.visible = !f.burrow; p.position.set(f.x / ONE - (v.pips.length - 1) * 3 + n * 6, f.y / ONE - 30 * v.k); p.zIndex = f.y / ONE + 1; });
    v.s.animationSpeed = (v.stopUntil ?? 0) > now ? 0 : 0.12;
    v.s.tint = v.flashUntil > now ? 0xffffff : f.stun > 0 ? 0xc8ecff : f.burn > 0 ? 0xffb080 : f.slow > 0 ? 0xa8dcff : v.tint;
  }
  for (const [id, v] of foeViews) if (!live.has(id)) { v.s.destroy(); v.sh?.destroy(); v.pips.forEach(p => p.destroy()); foeViews.delete(id); }

  const showWarnArrows = now < warnUntil;
  warnArrows.forEach((a, k) => {
    a.visible = showWarnArrows && k < warnGates.length && warnGates.length <= 2;
    if (!a.visible) return;
    const g = warnGates[k], rad = (((g * 32 + 192) & 255) * Math.PI * 2) / 256;
    a.position.set(CX + Math.cos(rad) * 330, CY + Math.sin(rad) * 330 * 1.25);
    a.rotation = rad + Math.PI; a.alpha = 0.55 + 0.45 * Math.sin(now / 120);
  });
  if (menuFor) renderMenu(false);
}

// --- loop ---
function tick() {
  rec.step(bytes.length ? bytes.shift() : 0);
  playEvents(rec.sim.events);
  if (rec.phase === 'over') { finish(); return false; }
  if (pendingChest) { const ev = pendingChest; pendingChest = null; showChest(ev); return false; }
  if (rec.phase === 'choice') { openOffer(); return false; }
  return true;
}
app.ticker.add(t => {
  particles.update(t.deltaMS / 1000);
  edgePan();
  if (state === 'play' && rec.phase === 'choice') openOffer();   // a chest closed over a pending level-up
  if (state !== 'play') { if (rec && state !== 'over') sync(performance.now()); return; }
  acc += Math.min(t.deltaMS, 250);
  while (acc >= TICK_MS) {
    acc -= TICK_MS;
    if (!tick()) { acc = 0; break; }
  }
  if (state !== 'over') sync(performance.now());
});

let stageId = params.get('stage') && STAGES[params.get('stage')] ? params.get('stage') : DEFAULT_STAGE;
// Scene theme of the stage: ground, props and backdrop are rebuilt when the stage changes.
let themeNow = '';
async function setTheme(name) {
  if (name === themeNow) return;
  const th = THEMES[name] ?? THEMES.forest, tiles = await themeTiles(px, name);
  const next = buildGround(th, tiles), at = cam.getChildIndex(ground);
  cam.removeChild(ground); ground.destroy({ children: true });
  ground = next; cam.addChildAt(ground, at);
  app.renderer.background.color = th.bg; light.visible = !!th.night;
  themeNow = name;
}
async function start(st = stageId) {
  stageId = st;
  await setTheme(STAGES[st].theme);
  game = makeGame(stageId, modsFrom(profile));
  rallyKind = -1;
  rec = new Recorder(game, SEED);
  setZoom(zoomI);
  el.defeat.style.display = 'none'; stage.style.filter = 'none';
  bytes.length = 0; acc = 0; pendingChest = null; buildSig = ''; document.body.classList.remove('modal-open');
  for (const [, v] of unitViews) v.c.destroy({ children: true });
  for (const [, v] of foeViews) { v.s.destroy(); v.sh?.destroy(); }
  unitViews.clear(); foeViews.clear();
  el.panel.style.display = 'none'; el.cards.style.display = 'none'; el.chest.style.display = 'none';
  state = 'play';
  toastHint('點空地蓋軍營、點軍營買兵；按住小兵拖曳布陣');
  sync(performance.now());
}

function finish() {
  state = 'over'; closeMenu(); endDrag(); gesture = null;
  el.cards.style.display = 'none'; el.chest.style.display = 'none';
  const s = sim(), b = scoreBreakdown(s), up = rec.upload(), v = verify(game, up);
  const got = v.valid ? settle(profile, s) : { diamonds: 0, achievements: [], units: [] };   // only verified matches pay out
  saveProfile(profile);
  const reward = rewardText(got);
  const lost = s.castle.hp <= 0;
  if (lost) return defeat(s, v, reward);
  const win = s.bossDead, rows = [['擊殺', b.kills], ['事件清除', b.events], ['Boss', b.boss], ['主城耐久', b.castle], ['3 級老兵', b.veterans]];
  const evos = Object.keys(EVOS).filter(e => s.evo[e]).map(e => EVOS[e].name);
  el.panel.innerHTML = `<h1>${win ? '守住了！' : '撐過來了'}</h1><p style="opacity:.75">${STAGES[stageId].name}・${STAGES[stageId].minutes} 分鐘${win ? '' : '・大王沒倒下'}</p>
    <p>撐了 ${Math.floor(s.tick / 60)} 秒　擊殺 ${s.kills}　守望 Lv${s.level}${evos.length ? `　進化：${evos.join('、')}` : ''}</p>
    <table>${rows.map(([k, n]) => `<tr><td>${k}</td><td>${n}</td></tr>`).join('')}<tr class="total"><td>總分</td><td>${score(s)}</td></tr></table>
    ${reward}<p style="opacity:.7;font-size:13px">${v.valid ? '重播驗證 ✓' : `重播驗證失敗：${v.reason}`}　種子 ${SEED}</p>
    <button id="again">重新開始</button> <button id="menu-stages" class="ghost">回主畫面</button>`;
  el.panel.classList.remove('menu-panel');
  el.panel.style.display = 'block';
  gsap.fromTo(el.panel, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: FEEL.ui.in, ease: FEEL.ui.inEase });
  $('#again').addEventListener('click', () => { sfx.play('click'); start(); });
  $('#menu-stages').addEventListener('click', () => { sfx.play('click'); showTitle('home'); });
}

// Defeat: the field sinks into deep crimson and greys out, 「團滅」 drops in, then two buttons. Render-only.
function rewardText(got) {
  const parts = [];
  if (got.diamonds) parts.push(`◆ +${got.diamonds} 鑽石`);
  for (const a of got.achievements) parts.push(`成就「${a.name}」`);
  for (const u of got.units) parts.push(`解鎖 ${UNIT_NAME[u]}`);
  return parts.length ? `<p class="reward">${parts.join('　')}</p>` : '';
}
// --- pause (M5): stops the sim clock (render keeps going); also opens by itself when the page goes to the background ---
function pauseGame() {
  if (state !== 'play') return;
  state = 'paused'; closeMenu(); endDrag(); gesture = null;
  const d = $('#pausemenu');
  const draw = () => {
    d.innerHTML = `<h2>暫停</h2><button id="pz-go">繼續</button><button id="pz-sfx" class="ghost">音效：${sfx.muted ? '關' : '開'}</button>
      <button id="pz-again" class="ghost">重新開始</button><button id="pz-home" class="ghost">回主畫面</button>`;
    $('#pz-go').onclick = () => { sfx.play('click'); d.style.display = 'none'; acc = 0; state = 'play'; };
    $('#pz-sfx').onclick = () => { sfx.setMuted(!sfx.muted); sfx.play('click'); draw(); };
    $('#pz-again').onclick = () => { sfx.play('click'); d.style.display = 'none'; start(); };
    $('#pz-home').onclick = () => { sfx.play('click'); d.style.display = 'none'; showTitle('home'); };
  };
  draw(); d.style.display = 'flex';
}
$('#pause').addEventListener('click', e => { e.stopPropagation(); sfx.unlock(); pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });

function defeat(s, v, reward = '') {
  const d = el.defeat;
  d.innerHTML = `<div class="dz-big">團滅</div>
    <div class="dz-line">勝敗乃兵家常事<br>大俠請重新來過</div>
    ${reward}<div class="dz-meta">${STAGES[stageId].name}・撐了 ${Math.floor(s.tick / 60)} 秒・擊殺 ${s.kills}・總分 ${score(s)}${v.valid ? '' : '・重播驗證失敗'}</div>
    <div class="dz-btns"><button id="dz-again">重新開始</button><button id="dz-home" class="ghost">回主畫面</button></div>`;
  d.style.display = 'flex';
  const big = d.querySelector('.dz-big'), line = d.querySelector('.dz-line'), meta = d.querySelector('.dz-meta'), btns = d.querySelector('.dz-btns');
  sfx.play('boom', { gain: 0.8, pitch: 0.6 });
  const tl = gsap.timeline();
  tl.fromTo(d, { opacity: 0 }, { opacity: 1, duration: FEEL.defeat.fade, ease: 'power1.in' })
    .fromTo(stage, { filter: 'grayscale(0) brightness(1)' }, { filter: 'grayscale(0.85) brightness(0.45)', duration: FEEL.defeat.fade, ease: 'power1.in' }, '<')
    .fromTo(big, { scale: 2.4, opacity: 0 }, { scale: 1, opacity: 1, duration: FEEL.defeat.slam, ease: 'power4.in', onComplete: () => { shake(shakeEl, 'boss'); sfx.play('boom', { gain: 0.6, pitch: 0.4 }); } }, `>-${FEEL.defeat.fade * 0.3}`)
    .fromTo(line, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, '+=0.15')
    .fromTo([meta, btns], { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, stagger: 0.1 }, '+=0.2');
  const close = () => { tl.kill(); gsap.set(stage, { filter: 'none' }); d.style.display = 'none'; };
  $('#dz-again').addEventListener('click', () => { sfx.play('click'); close(); start(); });
  $('#dz-home').addEventListener('click', () => { sfx.play('click'); close(); showTitle('home'); });
}

// --- main menu (gdd/08): a battlefield cover with four big buttons; each opens its own page with a back button.
// The profile lives in localStorage on this device only.
const COVER = Object.values(import.meta.glob('./assets/pixel/cover.png', { eager: true, query: '?url', import: 'default' }))[0];
let screen = 'home';
const PAGES = { campaign: ['戰役', 'campaign'], talent: ['天賦', 'talent'], loadout: ['配置', 'loadout'], ach: ['成就', 'achievement'] };
const gemsHtml = () => `<span class="gems"><i style="${iconStyle(px, 'diamond', 22)}"></i>${profile.diamonds}</span>`;
function showTitle(to = 'home') {
  state = 'title'; screen = to; document.body.classList.remove('modal-open');
  el.defeat.style.display = 'none'; stage.style.filter = 'none';
  el.cards.style.display = 'none'; el.chest.style.display = 'none';
  el.panel.classList.add('menu-panel');
  el.panel.classList.toggle('home', to === 'home');
  if (to === 'home') {
    el.panel.innerHTML = `<div class="cover">${COVER ? `<img src="${COVER}" alt="">` : ''}<div class="cover-title"><h1>守望之戰</h1><p>守住燈火，直到天明</p></div>${gemsHtml()}</div>
      <div class="bigbtns">${Object.entries(PAGES).map(([k, [n, ic]]) => `<button data-go="${k}"><i style="${iconStyle(px, ic, 36)}"></i><b>${n}</b></button>`).join('')}</div>`;
  } else {
    const [title] = PAGES[to];
    el.panel.innerHTML = `<div class="mhead"><button class="back" data-go="home">← 返回</button><h2>${title}</h2>${gemsHtml()}</div><div class="mbody">${pageBody(to)}</div>`;
  }
  el.panel.style.display = to === 'home' ? 'flex' : 'block';   // home: cover grows, buttons sit at the bottom
  gsap.fromTo(el.panel.querySelector(to === 'home' ? '.bigbtns' : '.mbody'), { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: FEEL.ui.in, ease: FEEL.ui.inEase });
  const on = (sel, fn) => el.panel.querySelectorAll(sel).forEach(b => b.addEventListener('click', e => { sfx.unlock(); sfx.play('click'); fn(b, e); }));
  on('[data-go]', b => showTitle(b.dataset.go));
  on('[data-stage]', b => start(b.dataset.stage));
  on('[data-talent]', b => { if (buy(profile, b.dataset.talent)) { saveProfile(profile); sfx.play('perfect'); } showTitle('talent'); });
  on('#refund', b => {                                    // two taps: the first only asks
    if (b.dataset.armed) { refund(profile); saveProfile(profile); showTitle('talent'); return; }
    b.dataset.armed = '1'; b.textContent = '確定全部重置？再點一次';
  });
  if (to === 'loadout') wireLoadoutDrag();
}

const mmss = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
function pageBody(to) {
  if (to === 'campaign') {
    return `<div class="stages stagelist">${STAGE_IDS.map(k => {
      const st = STAGES[k], open = stageOpen(profile, k), done = profile.cleared.includes(k);
      // one full-width card per stage, stacked top to bottom: the stage's ground as the picture, details beside it
      return `<button data-stage="${k}" ${open ? '' : 'disabled'} class="stagecard ${k === stageId ? 'sel' : ''} ${done ? 'done' : ''}">
        <span class="thumb" style="background-image:url(${themeThumb(st.theme)})"><b>${st.minutes}<small>分</small></b></span>
        <span class="info"><b>${st.name}${done ? ' ✓' : ''}</b><small>${st.bosses.length} 隻首領・最後是${BOSS_TIERS[st.bosses[st.bosses.length - 1][1]].name.split('・')[1]}</small><small>${st.minutes}:00 最後首領出現・全長 ${mmss(GAMES[k].maxTicks / 60)}</small><small>${open ? (done ? '已通過，可再挑戰' : '可挑戰') : '🔒 先通過上一關'}</small></span></button>`;
    }).join('')}</div>
    <ul class="rules"><li>點<b>主城</b>買工人；內圈蓋<b>軍營</b>、外圈蓋軍營或<b>法師塔</b>；建築可拆除退 70%。</li><li>城牆留<b>缺口</b>引導會繞路的怪。按住小兵<b>拖曳</b>布陣。</li><li>守望值滿了<b>三選一</b>；擊倒<b>小王</b>依表現得 1–3 顆鑽石。</li></ul>`;
  }
  if (to === 'talent') {
    const branches = [...new Set(TALENTS.map(t => t.branch))];
    return `<p class="sub">用鑽石點天賦。每一層要先點過上一層。</p><div class="tree">${branches.map(b => `<div class="branch"><h4>${b}</h4>${TALENTS.filter(t => t.branch === b).map(t => {
      const r = rank(profile, t.id), can = canBuy(profile, t.id);
      return `<button class="node ${r ? 'got' : ''}" data-talent="${t.id}" ${can ? '' : 'disabled'}><i style="${iconStyle(px, t.icon, 26)}"></i><b>${t.name}</b><small>${r}/${t.max}</small><small>${t.text}</small><small class="cost">${r < t.max ? `◆ ${t.cost[r]}` : '滿'}</small></button>`;
    }).join('')}</div>`).join('')}</div><button class="ghost small" id="refund">全部重置（鑽石退回）</button>`;
  }
  if (to === 'loadout') {
    return `<div class="pits">${profile.loadout.map((k, n) => `<div class="pit" data-pit="${n}"><span class="tier">第 ${n + 1} 格・軍營 Lv${n + 1}</span><i style="${iconStyle(px, `u_${k}`, 48)}"></i><b>${ROSTER[k].name}</b></div>`).join('')}</div>
      <p class="sub">把下面的兵種拖到上面的格子裝備（點一下放進第一個可放的格子）。第 1 格只放基礎兵種；第 2 格可放基礎或進階；第 3 格什麼都能放（含頂階）。</p>
      <div class="roster">${Object.keys(ROSTER).map(k => {
        const has = profile.units.includes(k), on = profile.loadout.includes(k), t = ROSTER[k].tier;
        return `<div class="unitcard tier${t} ${has ? '' : 'locked'} ${on ? 'on' : ''}" data-unit="${k}"><span class="tier">${TIER_NAME[t]}</span><i style="${iconStyle(px, `u_${k}`, 36)}"></i><b>${ROSTER[k].name}</b><small>${has ? ROSTER[k].text : '🔒 成就解鎖'}</small></div>`;
      }).join('')}</div>`;
  }
  return `<p class="sub">完成任務得鑽石或解鎖兵種。</p><div class="achs">${ACHIEVEMENTS.map(a => {
    const done = !!profile.ach[a.id], rw = a.reward.unit ? `解鎖 ${ROSTER[a.reward.unit].name}` : `◆ ${a.reward.diamonds}`;
    return `<div class="ach ${done ? 'done' : ''}"><i style="${iconStyle(px, 'achievement', 26)}"></i><div><b>${a.name}${done ? ' ✓' : ''}</b><small>${a.text}</small></div><span>${rw}</span></div>`;
  }).join('')}</div>`;
}

// Loadout: drag a unit card onto a pit to equip it. Only the pit of its tier accepts it (the others dim); a tap does the same.
function wireLoadoutDrag() {
  el.panel.querySelectorAll('.unitcard:not(.locked)').forEach(card => {
    card.addEventListener('pointerdown', e => {
      e.preventDefault();
      const unit = card.dataset.unit, tier = ROSTER[unit].tier, x0 = e.clientX, y0 = e.clientY;
      const pits = [...el.panel.querySelectorAll('.pit')];
      let ghost = null;
      pits.forEach((p, n) => p.classList.add(fits(unit, n) ? 'can' : 'cannot'));
      const move = ev => {
        if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) {
          ghost = card.cloneNode(true); ghost.classList.add('dragging'); document.body.appendChild(ghost);
        }
        if (!ghost) return;
        ghost.style.left = `${ev.clientX - 40}px`; ghost.style.top = `${ev.clientY - 40}px`;
        pits.forEach(p => { const r = p.getBoundingClientRect(); p.classList.toggle('over', ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom); });
      };
      const up = ev => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
        pits.forEach(p => p.classList.remove('can', 'cannot', 'over'));
        let target = ghost ? pits.findIndex(p => { const r = p.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom; }) : [0, 1, 2].find(n => fits(unit, n));
        ghost?.remove();
        if (ev.type === 'pointercancel') return;
        if (target >= 0 && equip(profile, unit, target)) { saveProfile(profile); sfx.play('perfect'); showTitle('loadout'); }
        else if (target >= 0) { sfx.play('miss', { gain: 0.4 }); toastHint(`${ROSTER[unit].name}是${TIER_NAME[tier]}兵種，只能放第 ${tier} 格以後`); }
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    });
  });
}

setTheme(STAGES[stageId].theme).then(() => app.render());   // scenery behind the menu
showTitle();
if (import.meta.env.DEV) {
  // Dev only: drive the same loop body without rAF (hidden previews throttle animation frames).
  window.__lh = {
    get sim() { return rec?.sim; }, get state() { return state; }, send, start, tapAt, toWorld, choose: doChoose,
    advance(n) { for (let k = 0; k < n && state === 'play'; k++) if (!tick()) break; if (state !== 'over') sync(performance.now()); app.render(); },
  };
}
