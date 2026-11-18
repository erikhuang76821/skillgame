// LanternHold boot: Pixi view + fixed-step sim loop + DOM menus. Tap buildings for menus; drag units to (re)deploy.
// Every action becomes a 3-byte command fed to the sim one byte per tick (sim.js §2); card picks are recorder choices.
// The match is recorded and re-verified on device at the end (the same check the server runs).
import { Application, Container, Sprite, AnimatedSprite, TilingSprite, Texture, Rectangle, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import { Recorder, verify, ONE } from './sim/core/index.js';
import {
  GAMES, STAGES, STAGE_IDS, DEFAULT_STAGE, TICK_MS, CX, CY, VIEW_W, VIEW_H, OP, encode, cellOf, cellCenter, SLOTS,
  BARRACKS, UNIT, UNIT_KINDS, WALL, WALL_R, WALL_SEGS, CASTLE, QUEUE_MAX, segOf, wallMaxHp, barracksMaxHp, WORKER_MAX, workerCount, CARD_TYPES,
  EVENT_CLEAR_TICKS, lightR, popCap, pop, barracksCost, unitReach, POP_PER_BARRACKS, canPlace, unitMaxHp, scoreBreakdown, score, REDEPLOY_CD, XP_NEED, LEVEL_MAX,
  CARDS, CARD_IDS, EVOS, SYNERGY, TAGS, REACTIONS, CHOICE, CARD_MAX, POUCH_GOLD, tagCount, FOE,
} from './sim/sim.js';
import { angleOf } from './sim/core/index.js';
import { FEEL } from './fx/feel.js';
import { shake } from './fx/shake.js';
import { hurt, flash } from './fx/overlay.js';
import { Particles } from './fx/particles.js';
import { makeArt, COLORS } from './render/art.js';
import { loadPixel, tex, PX, iconStyle } from './render/pixel.js';
import { Sfx } from './audio/sfx.js';

gsap.defaults({ duration: 0.25, ease: 'power2.out', overwrite: 'auto' });
gsap.config({ force3D: true, nullTargetWarn: import.meta.env.DEV });
gsap.ticker.lagSmoothing(500, 33);
gsap.matchMedia().add('(prefers-reduced-motion: reduce)', () => { FEEL.enabled = false; return () => { FEEL.enabled = true; }; });

// --- Pixi: true-pixel renderer. The whole frame is drawn into a fixed low-resolution canvas where 1 art pixel =
// 1 canvas pixel (ART_W x ART_H), then the canvas is enlarged with nearest-neighbour scaling — an integer multiple
// whenever the screen allows. Nothing is drawn at a fractional pixel size, so the picture stays real pixel art.
// The same field of view everywhere (E3). World units are 2 per art pixel (pixel.js PX).
let shadowCache = null;                              // filled on first shadowTex() call
const SHADE = [0x3a3550, 0x55506e, 0x77728f, 0x9a96b0];   // voxel layer tints, bottom to top (used by stacked())
// Zoom steps: the canvas holds more art pixels when zoomed out, so pixels stay pixels and far enemies come into view.
const ZOOMS = [[540, 960], [720, 1280], [900, 1600]];
let zoomI = 1, ART_W = ZOOMS[zoomI][0], ART_H = ZOOMS[zoomI][1];
const stage = document.getElementById('stage');
const shakeEl = document.getElementById('stage-shake');
const app = new Application();
await app.init({ preference: 'webgl', width: ART_W, height: ART_H, backgroundColor: 0x141a33, antialias: false, resolution: 1, autoDensity: false, roundPixels: true });
app.canvas.classList.add('pixel');
shakeEl.appendChild(app.canvas);
function fitCanvas() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (app.renderer.width !== ART_W) app.renderer.resize(ART_W, ART_H);
  let k = Math.min(w / ART_W, h / ART_H);
  if (k >= 1) k = Math.max(1, Math.floor(k * devicePixelRatio) / devicePixelRatio);   // integer device-pixel multiple
  app.canvas.style.width = `${Math.round(ART_W * k)}px`; app.canvas.style.height = `${Math.round(ART_H * k)}px`;
  app.canvas.style.left = `${Math.round((w - ART_W * k) / 2) + 12}px`; app.canvas.style.top = `${Math.round((h - ART_H * k) / 2) + 12}px`;
}
fitCanvas();
addEventListener('resize', fitCanvas);
const art = makeArt(app.renderer);
const px = await loadPixel();
document.querySelectorAll('#zoom button').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); setZoom(zoomI + (b.dataset.z === '+' ? -1 : 1)); }));

const view = new Container();
// Camera: 1 world unit = 1/PX canvas pixel; the castle sits in the middle of the canvas.
const cam = new Container();
cam.scale.set(1 / PX);
const centerCam = () => cam.position.set(Math.round(ART_W / 2 - CX / PX), Math.round(ART_H / 2 - CY / PX));
centerCam();
function setZoom(i) {
  zoomI = Math.max(0, Math.min(ZOOMS.length - 1, i));
  [ART_W, ART_H] = ZOOMS[zoomI];
  fitCanvas(); centerCam();
  document.querySelectorAll('#zoom button').forEach(b => { b.disabled = (b.dataset.z === '+' && zoomI === 0) || (b.dataset.z === '-' && zoomI === ZOOMS.length - 1); });
}
stage.addEventListener('wheel', e => { e.preventDefault(); setZoom(zoomI + (e.deltaY > 0 ? 1 : -1)); }, { passive: false });
// pinch: two fingers apart = closer, together = further
const touches = new Map();
let pinch0 = 0;
stage.addEventListener('pointerdown', e => { touches.set(e.pointerId, [e.clientX, e.clientY]); if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } }, true);
addEventListener('pointermove', e => {
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, [e.clientX, e.clientY]);
  if (touches.size !== 2 || !pinch0) return;
  const [a, b] = [...touches.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
  if (d > pinch0 * 1.3) { setZoom(zoomI - 1); pinch0 = d; } else if (d < pinch0 / 1.3) { setZoom(zoomI + 1); pinch0 = d; }
}, true);
const untouch = e => { touches.delete(e.pointerId); if (touches.size < 2) pinch0 = 0; };
addEventListener('pointerup', untouch, true); addEventListener('pointercancel', untouch, true);
const ground = buildGround();
const light = new Sprite({ texture: art.disc, anchor: 0.5, tint: COLORS.lamp, alpha: 0.08 });
light.position.set(CX, CY);
const world = new Container();               // walls, buildings, castle, units, foes (y-sorted)
world.sortableChildren = true;
const overlay = new Container();             // drag ghost, rings, warnings
const fxLayer = new Container(); fxLayer.blendMode = 'add';
cam.addChild(ground, light, world, overlay, fxLayer);
view.addChild(cam);
app.stage.addChild(view);
const particles = new Particles(app.renderer);
fxLayer.addChild(particles.view);

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

// Ground: forest tiles, lanes stamped from un-rotated path tiles, a lit plaza; drawn once and cached.
function buildGround() {
  const c = new Container();
  const W = 2000, H = 3400, x0 = CX - W / 2, y0 = CY - H / 2;   // covers the furthest zoom step
  const base = new TilingSprite({ texture: px.forest, width: W / PX, height: H / PX });
  base.position.set(x0, y0); base.scale.set(PX);
  c.addChild(base);
  const crop = new Texture({ source: px.path.source, frame: new Rectangle(16, 16, 24, 24) });
  for (let g = 0; g < 8; g++) {
    const a = ((g * 32 + 192) & 255) * Math.PI * 2 / 256;
    for (let d = 150; d < 1500; d += 18) {
      const t = new Sprite({ texture: crop, anchor: 0.5 });
      t.position.set(Math.round((CX + Math.cos(a) * d) / PX) * PX, Math.round((CY + Math.sin(a) * d) / PX) * PX); t.scale.set(PX);
      c.addChild(t);
    }
  }
  const plaza = new Sprite({ texture: art.disc, anchor: 0.5, tint: 0x35416a, alpha: 0.55 });
  plaza.position.set(CX, CY); plaza.scale.set(150 / 64);
  c.addChild(plaza);
  for (const [x, y] of SLOTS) { const r = new Sprite({ texture: art.ring, anchor: 0.5, alpha: 0.2 }); r.position.set(x, y); r.scale.set(26 / 128); c.addChild(r); }
  // props: deterministic scatter outside the wall ring, off the lanes
  let h = 9301;
  const rnd = () => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296);
  const props = ['tree_pine', 'tree_oak', 'tree_pine', 'tree_dead', 'rock_0', 'rock_1', 'tree_pine'];
  for (let i = 0; i < 320; i++) {
    const x = x0 + rnd() * W, y = y0 + rnd() * H, dx = x - CX, dy = y - CY, r = Math.hypot(dx, dy);
    if (r < WALL_R + 80) continue;
    const ang = ((Math.atan2(dy, dx) / (Math.PI * 2)) * 8 + 8.5) % 1;    // distance to the nearest lane, in lane widths
    if (Math.abs(ang - 0.5) * r * Math.PI * 2 / 8 < 40) continue;
    const t = stacked(tex(px.buildings, props[i % props.length]), 2);
    t.position.set(Math.round(x / PX) * PX, Math.round(y / PX) * PX);
    c.addChild(shadowAt(t.x, t.y, 14), t);
  }
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
  banner: $('#banner'), combo: $('#combo'),
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
const wallViews = Array.from({ length: WALL_SEGS }, (_, w) => {
  const blocks = [-1, 0, 1].map(k => {
    const a = ((w + k / 3) * Math.PI * 2) / WALL_SEGS;
    const b = stacked(Texture.EMPTY, 4, { x: 0.5, y: 0.7 });
    b.visible = false;
    b.position.set(Math.round((CX + Math.cos(a) * WALL_R) / PX) * PX, Math.round((CY + Math.sin(a) * WALL_R) / PX) * PX);
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
  const body = new AnimatedSprite({ textures: anim(px.units, `${u.kind}_idle`), animationSpeed: 0.06, autoUpdate: true });
  body.scale.set(PX); body.play();
  const pips = [0, 1, 2].map(k => { const p = new Sprite({ texture: art.pip, tint: COLORS.lamp }); p.position.set(-16 + k * 12, -52); p.visible = false; c.addChild(p); return p; });
  const hp = new Sprite({ texture: art.pip, anchor: { x: 0, y: 0.5 }, tint: 0x8ff03c }); hp.position.set(-14, 6); hp.scale.set(2.8, 0.8);
  const cd = new Sprite({ texture: art.ring, anchor: 0.5, tint: 0xffffff, alpha: 0.35, scale: 0.12 }); cd.position.set(0, -24); cd.visible = false;
  const sh = new Sprite({ texture: shadowTex(), anchor: 0.5, alpha: 0.35 }); sh.scale.set(1.6, PX); sh.y = -2;
  c.addChild(sh, body, hp, cd);
  world.addChild(c);
  v = { c, body, pips, hp, cd, gen: u.gen, mode: 'idle', attackUntil: 0, face: 1 };
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
  bossWeak: ['boss_walk', 0.5, 0xd8b0ff], bossMini: ['boss_walk', 0.75, 0xb0c8ff], boss: ['boss_walk', 1, 0xffffff], bossSuper: ['boss_walk', 1.5, 0xff9ab8] };
function foeView(f) {
  let v = foeViews.get(f.id);
  if (v) return v;
  const [name, k, tint] = FOE_ART[f.kind];
  const s = new AnimatedSprite({ textures: anim(px.foes, name), animationSpeed: 0.12, autoUpdate: true, tint });
  s.scale.set(PX * k); s.play(); s.gotoAndPlay(f.id % 4);
  const sh = FOE[f.kind].fly ? null : new Sprite({ texture: shadowTex(), anchor: 0.5, alpha: 0.3 });
  if (sh) { sh.scale.set(1.4 * k, PX); world.addChild(sh); }
  world.addChild(s);
  v = { s, sh, k, tint, lastX: f.x };
  foeViews.set(f.id, v);
  return v;
}

// --- overlay: drag ghost, placement range, prewarn arrows ---
const rangeRing = new Sprite({ texture: art.ring, anchor: 0.5, tint: COLORS.ally, alpha: 0.5, visible: false });
const ghost = new Sprite({ texture: Texture.EMPTY, alpha: 0.6, visible: false });
const aggroRing = new Sprite({ texture: art.ring, anchor: 0.5, alpha: 0.35, visible: false });
const lightRing = new Sprite({ texture: art.ring, anchor: 0.5, tint: COLORS.lamp, alpha: 0.35 });
lightRing.position.set(CX, CY);
const warnArrows = [0, 1].map(() => { const s = new Sprite({ texture: art.arrow, anchor: 0.5, tint: COLORS.danger, visible: false }); s.scale.set(2.2); overlay.addChild(s); return s; });
overlay.addChild(lightRing, rangeRing, aggroRing, ghost);

// --- input: drag units, tap buildings / walls / castle ---
let drag = null, menuFor = null;
const near = (ax, ay, bx, by, r) => (ax - bx) ** 2 + (ay - by) ** 2 <= r * r;
function unitAt(x, y) {
  let best = -1, bd = 48 * 48;                       // finger-sized at the zoomed-out camera
  sim().units.forEach((u, i) => {
    if (!u.alive) return;
    const d = (u.x / ONE - x) ** 2 + (u.y / ONE - 14 - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}
function slotAt(x, y) { return SLOTS.findIndex(([sx, sy]) => near(x, y, sx, sy, 36)); }
function wallAt(x, y) {
  const r = Math.hypot(x - CX, y - CY);
  if (Math.abs(r - WALL_R) > 26) return -1;
  return segOf(angleOf(Math.round(x - CX), Math.round(y - CY)));
}

stage.addEventListener('pointerdown', e => {
  sfx.unlock();
  if (state !== 'play') return;
  if (touches.size >= 2) { endDrag(); return; }          // second finger = pinch zoom
  const [x, y] = toWorld(e);
  const i = unitAt(x, y);
  if (i >= 0) {
    const u = sim().units[i];
    showUnitInfo(i);
    if (u.kind === 'worker') return;                     // workers pick their own jobs
    drag = { i, x0: x, y0: y, moved: false };
    ghost.texture = anim(px.units, `${u.kind}_idle`)[0]; ghost.scale.set(PX);
    return;
  }
  tapAt(x, y);
});
addEventListener('pointermove', e => {
  if (!drag || state !== 'play') return;
  if (touches.size >= 2) { endDrag(); return; }
  const [x, y] = toWorld(e);
  if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) > 12) drag.moved = true;
  if (!drag.moved) return;
  const u = sim().units[drag.i];
  if (!u?.alive) { endDrag(); return; }
  const cell = cellOf(x, y), [cx, cy] = cellCenter(cell);
  const ok = u.redeploy === 0 && canPlace(sim(), cx * ONE, cy * ONE, drag.i);
  ghost.visible = true; ghost.position.set(cx, cy); ghost.alpha = ok ? 0.75 : 0.3;
  aggroRing.visible = true; aggroRing.position.set(cx, cy); aggroRing.tint = ok ? COLORS.ally : COLORS.danger;
  aggroRing.scale.set(unitReach(sim(), u) / 128);              // archers: reach; shields: engage radius; priests: heal range
  rangeRing.visible = true;
  drag.target = { cell, ok };
});
addEventListener('pointerup', () => {
  if (!drag) return;
  const { i, moved, target } = drag;
  if (moved && target?.ok) send(encode(OP.MOVE, i, target.cell));
  else if (moved && target && !target.ok) toastHint(sim().units[i].redeploy > 0 ? '調防冷卻中' : '只能放在燈光範圍內或友軍附近');
  endDrag();
});
addEventListener('pointercancel', endDrag);
function endDrag() { drag = null; ghost.visible = aggroRing.visible = rangeRing.visible = false; }

function tapAt(x, y) {
  if (near(x, y, CX, CY - 10, 62)) return openMenu({ type: 'castle' });
  const s = slotAt(x, y);
  if (s >= 0) return openMenu({ type: 'slot', i: s });
  const w = wallAt(x, y);
  if (w >= 0) return openMenu({ type: 'wall', i: w });
  closeMenu();
}

// --- menus (DOM) ---
function openMenu(m) { menuFor = m; renderMenu(); el.menu.style.display = 'block'; gsap.fromTo(el.menu, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: FEEL.ui.in, ease: FEEL.ui.inEase }); }
function closeMenu() { menuFor = null; el.menu.style.display = 'none'; }
function showUnitInfo(i) { menuFor = { type: 'unit', i }; el.menu.style.display = 'block'; renderMenu(); }
function btn(label, sub, enabled, onClick) {
  const b = document.createElement('button');
  b.innerHTML = `${label}<small>${sub ?? ''}</small>`;
  b.disabled = !enabled;
  b.addEventListener('click', ev => { ev.stopPropagation(); onClick(); });
  return b;
}
const UNIT_NAME = { archer: '弓箭手', shield: '盾兵', priest: '牧師', worker: '工人' };
const UNIT_TIP = { archer: '遠程，打輕甲', shield: '坦，嘲諷，打重甲', priest: '治療友軍' };
const TAG_NAME = { bow: '弓', fire: '火', frost: '冰', storm: '雷', fort: '守', gold: '金' };
let menuSig = '';
function renderMenu(force = true) {
  if (!menuFor || !rec) return;
  const s = sim();
  const sig = JSON.stringify([menuFor, s.gold, s.level, pop(s), menuFor.type === 'slot' ? s.slots[menuFor.i] : 0, menuFor.type === 'wall' ? s.walls[menuFor.i] : 0, menuFor.type === 'unit' ? s.units[menuFor.i] : 0]);
  if (!force && sig === menuSig) return;
  menuSig = sig;
  const m = el.menu; m.innerHTML = '';
  const h = document.createElement('h3'); const row = document.createElement('div'); row.className = 'row';
  const p = document.createElement('p');
  const room = pop(s) < popCap(s);
  if (menuFor.type === 'castle') {
    h.innerHTML = `主城 <small>耐久 ${Math.max(0, s.castle.hp)}/${CASTLE.hp}　人口 ${pop(s)}/${popCap(s)}　工人 ${workerCount(s)}/${WORKER_MAX}</small>`;
    p.textContent = s.castle.queue ? `訓練工人中（${Math.round((s.castle.progress / UNIT.worker.train) * 100)}%，佇列 ${s.castle.queue}）` : '工人會自己去修城牆和軍營；被打時先反擊。';
    row.append(btn('工人', `金 ${UNIT.worker.cost}　${UNIT.worker.train / 60} 秒`, s.castle.queue < QUEUE_MAX && workerCount(s) < WORKER_MAX && room && s.gold >= UNIT.worker.cost, () => send(encode(OP.MENU, 255, 0))));
  } else if (menuFor.type === 'slot') {
    const i = menuFor.i, sl = s.slots[i];
    if (!sl.kind) {
      h.innerHTML = '空地';
      p.textContent = `軍營：點它買兵，每座人口上限 +${POP_PER_BARRACKS}，越蓋越貴。`;
      row.append(btn('軍營', `金 ${barracksCost(s)}　人口 +${POP_PER_BARRACKS}`, s.gold >= barracksCost(s), () => send(encode(OP.BUILD, i, 0))));
    } else {
      h.innerHTML = `軍營 Lv${sl.lv} <small>耐久 ${sl.hp}/${barracksMaxHp(sl)}${sl.build ? '　施工中' : ''}</small>`;
      p.textContent = sl.queue.length ? `訓練中：${sl.queue.map((k, n) => UNIT_NAME[k] + (n ? '' : ` ${Math.round((sl.progress / UNIT[k].train) * 100)}%`)).join(' → ')}` : '新兵出現在軍營門口，拖曳到想守的位置。';
      UNIT_KINDS.forEach((k, idx) => {
        const locked = sl.lv < UNIT[k].barracksLv;
        row.append(btn(UNIT_NAME[k], locked ? `軍營 Lv${UNIT[k].barracksLv} 解鎖` : `金 ${UNIT[k].cost}　${UNIT[k].train / 60} 秒`, !locked && !sl.build && room && sl.queue.length < QUEUE_MAX && s.gold >= UNIT[k].cost, () => send(encode(OP.MENU, i, idx))));
      });
      if (sl.lv < 3) row.append(btn(`升級 Lv${sl.lv + 1}`, `金 ${BARRACKS.up[sl.lv - 1]}　解鎖${UNIT_NAME[UNIT_KINDS[sl.lv]]}`, !sl.build && s.gold >= BARRACKS.up[sl.lv - 1], () => send(encode(OP.MENU, i, 3))));
    }
  } else if (menuFor.type === 'wall') {
    const w = s.walls[menuFor.i];
    const names = ['空', '木柵', '石牆', '鐵牆'];
    h.innerHTML = `城牆 ${names[w.lv]} <small>${w.lv ? `耐久 ${w.hp}/${wallMaxHp(s, w.lv)}` : '缺口'}</small>`;
    p.textContent = '留缺口可以把會繞路的怪（狼、一半的影鼠）引到同一個入口；甲蟲、蝸牛、影弓手一定拆牆。工人會自動修。';
    if (w.lv < 3) row.append(btn(w.lv ? `升級${names[w.lv + 1]}` : `蓋${names[1]}`, `金 ${WALL[w.lv + 1].cost}　耐久 ${wallMaxHp(s, w.lv + 1)}`, s.gold >= WALL[w.lv + 1].cost, () => send(encode(OP.WALL, menuFor.i, 0))));
  } else if (menuFor.type === 'unit') {
    const u = s.units[menuFor.i];
    if (!u?.alive) return closeMenu();
    const next = u.lv < 3 ? `　經驗 ${u.xp}/${[5, 15][u.lv - 1]}` : '　滿級';
    h.innerHTML = `${UNIT_NAME[u.kind]} Lv${u.lv} <small>血 ${u.hp}/${unitMaxHp(s, u)}${next}</small>`;
    p.textContent = u.kind === 'worker' ? (u.job >= 0 ? '正在修復' : '待命（有東西壞了就會去修）') : u.redeploy > 0 ? `調防冷卻 ${Math.ceil(u.redeploy / 60)} 秒` : '拖曳到新位置（走過去途中不攻擊，抵達後 1 秒架設）。';
  }
  m.append(h, p, row);
}
el.menu.addEventListener('pointerdown', e => e.stopPropagation());

function toastHint(t) { el.hint.textContent = t; gsap.fromTo(el.hint, { opacity: 1 }, { opacity: 0.75, duration: 1.2 }); }

// --- build strip: owned cards and synergies, so the player can see what they are building toward ---
let buildSig = '';
function renderBuild() {
  const s = sim();
  const sig = JSON.stringify([s.cards, s.evo, s.synOn]);
  if (sig === buildSig) return;
  buildSig = sig;
  const chips = [];
  for (const t of TAGS) {
    const n = tagCount(s, t);
    if (n) chips.push(`<span class="syn ${s.synOn[t] ? 'on' : ''} t-${t}">${TAG_NAME[t]} ${n}/${SYNERGY[t].n}${s.synOn[t] ? ' ' + SYNERGY[t].name : ''}</span>`);
  }
  for (const e of Object.keys(EVOS)) if (s.evo[e]) chips.push(`<span class="syn on evo">${EVOS[e].name}</span>`);
  for (const id of CARD_IDS) if (s.cards[id]) chips.push(`<span class="own t-${CARDS[id].tags[0]}">${CARDS[id].name}${'●'.repeat(s.cards[id])}${'○'.repeat(CARD_MAX - s.cards[id])}</span>`);
  el.build.innerHTML = chips.join('');
}

// --- level-up offer (DOM) ---
let cardMode = '';                                    // '' pick | 'ignore' | 'lock'
function cardHints(s, id) {
  if (EVOS[id]) return [`進化：${CARDS[EVOS[id].from].name} Lv3 ＋ ${CARDS[EVOS[id].with].name}`];
  if (id === 'pouch') return ['卡池已空：拿金幣'];
  const out = [];
  if (!s.cards[id]) {
    for (const t of CARDS[id].tags) if (tagCount(s, t) + 1 === SYNERGY[t].n) out.push(`★ 羈絆「${SYNERGY[t].name}」`);
    for (const r of Object.values(REACTIONS)) {
      const mine = CARDS[id].tags.includes(r.a) ? r.b : CARDS[id].tags.includes(r.b) ? r.a : null;
      if (mine && tagCount(s, mine) > 0 && !CARDS[id].tags.some(t => (t === r.a || t === r.b) && tagCount(s, t) > 0)) out.push(`★ 反應「${r.name}」`);
    }
  }
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
    const tags = evo ? '<span class="tag evo">進化</span>' : id === 'pouch' ? '' : CARDS[id].tags.map(t => `<span class="tag t-${t}">${TAG_NAME[t]}</span>`).join('');
    const pips = evo || id === 'pouch' ? '' : `<div class="pips">${'●'.repeat(lvNow)}<b>●</b>${'○'.repeat(CARD_MAX - lvNow - 1)}　${lvNow ? `Lv${lvNow} → Lv${lvNow + 1}` : '新'}</div>`;
    const text = id === 'pouch' ? `+${POUCH_GOLD} 金` : c.text;
    const hints = cardHints(s, id).map(t => `<div class="hint2">${t}</div>`).join('');
    const typeChip = CARDS[id] ? `<span class="tag type ${CARDS[id].type === s.lockType ? 'locked' : ''}">${CARD_TYPES[CARDS[id].type]}${CARDS[id].type === s.lockType ? ' 🔒' : ''}</span>` : '';
    const ico = `<i class="ico" style="${iconStyle(px, id === 'pouch' ? 'gold' : id, 40)}"></i>`;
    return `<button class="card ${evo ? 'evo' : ''} ${cardMode && !evo && id !== 'pouch' ? 'banning' : ''}" data-k="${k}">${ico}<div class="tags">${typeChip}${tags}</div><h4>${id === 'pouch' ? '金袋' : c.name}</h4>${pips}<p>${text}</p>${hints}</button>`;
  }).join('');
  el.cards.innerHTML = `<h2>守望 Lv${s.level}${s.pending > 1 ? `　<small>還有 ${s.pending - 1} 次</small>` : ''}</h2><div class="hand">${cards}</div>
    <div class="row"><button id="reroll" ${s.rerolls ? '' : 'disabled'}>重抽<small>剩 ${s.rerolls}</small></button>
    <button id="ignore" class="${cardMode === 'ignore' ? 'active' : ''}" ${s.ignores ? '' : 'disabled'}>${cardMode === 'ignore' ? '取消' : '忽略類型'}<small>剩 ${s.ignores}・該類卡本局不再出現</small></button>
    <button id="lock" class="${cardMode === 'lock' ? 'active' : ''}" ${s.locks ? '' : 'disabled'}>${cardMode === 'lock' ? '取消' : '鎖定類型'}<small>${s.lockType ? `已鎖：${CARD_TYPES[s.lockType]}` : `剩 ${s.locks}・該類出現率 +50%`}</small></button></div>
    ${cardMode ? `<p class="modehint">點一張卡：${cardMode === 'ignore' ? '忽略' : '鎖定'}它的類型</p>` : ''}`;
  el.cards.style.display = 'block';
  el.cards.querySelectorAll('.card').forEach(b => b.addEventListener('click', () => {
    const k = Number(b.dataset.k);
    if (cardMode) { if (!CARDS[o.ids[k]]) return; const m = cardMode; cardMode = ''; doChoose((m === 'ignore' ? CHOICE.IGNORE : CHOICE.LOCK) + k); }
    else doChoose(k);
  }));
  $('#reroll').addEventListener('click', () => { cardMode = ''; doChoose(CHOICE.REROLL); });
  $('#ignore').addEventListener('click', () => { cardMode = cardMode === 'ignore' ? '' : 'ignore'; renderOffer(false); });
  $('#lock').addEventListener('click', () => { cardMode = cardMode === 'lock' ? '' : 'lock'; renderOffer(false); });
  if (animate) gsap.fromTo(el.cards.querySelectorAll('.card'), { y: 40, opacity: 0, scale: 0.85 }, { y: 0, opacity: 1, scale: 1, duration: FEEL.card.in, ease: FEEL.card.ease, stagger: FEEL.card.stagger });
}
function doChoose(index) {
  if (!rec.choose(index)) return;
  sfx.play(index < 3 ? 'card' : 'click');
  playEvents(rec.sim.events); rec.sim.events.length = 0;
  if (rec.phase === 'choice') { renderOffer(true); return; }
  el.cards.style.display = 'none';
  if (state === 'pick') state = 'play';
  sync(performance.now());
}
function openOffer() {
  state = 'pick'; cardMode = ''; closeMenu(); endDrag();
  sfx.play('perfect');
  renderOffer(true);
}

// --- chest reveal: a render-only pause; the sim already applied the upgrades ---
function showChest(ev) {
  state = 'chest';
  const names = ev.ups.map(id => (EVOS[id] ? EVOS[id].name : id === 'pouch' ? '金袋' : CARDS[id].name));
  const lvs = ev.ups.map(id => (EVOS[id] ? '進化！' : id === 'pouch' ? `+${POUCH_GOLD} 金` : `Lv${sim().cards[id]}`));
  const why = ev.why === 'event' ? '事件獎勵' : '擊殺里程碑';
  el.chest.innerHTML = `<h2>寶箱 <b>×${ev.n}</b></h2><p>${why}</p><div class="hand">${names.map((n, k) => `<div class="mini ${EVOS[ev.ups[k]] ? 'evo' : ''}"><h4>${n}</h4><small>${lvs[k]}</small></div>`).join('')}</div><p class="tap">點一下繼續</p>`;
  el.chest.style.display = 'block';
  const minis = el.chest.querySelectorAll('.mini');
  const tl = gsap.timeline();
  tl.fromTo(el.chest.querySelector('h2'), { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: FEEL.banner.in, ease: FEEL.banner.ease });
  minis.forEach((m, k) => {
    tl.fromTo(m, { rotationY: 90, opacity: 0 }, { rotationY: 0, opacity: 1, duration: FEEL.chest.flip, ease: 'back.out(1.7)', onStart: () => { sfx.play(EVOS[ev.ups[k]] ? 'evolve' : 'pickup', { pitch: 1 + k * 0.12 }); particles.burst(CX, CY - 200, EVOS[ev.ups[k]] ? 0x8ff0ff : 0xfff2b0, 18); } }, k ? `>+${FEEL.chest.stagger - FEEL.chest.flip}` : `>+${FEEL.chest.delay}`);
  });
  let done = false;
  const close = () => { if (done) return; done = true; tl.progress(1); el.chest.style.display = 'none'; state = 'play'; };
  el.chest.onclick = close;
  tl.call(() => { setTimeout(close, FEEL.chest.hold * 1000); });
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
      case 'hit': if (ev.who === 'foe') { const v = foeViews.get(ev.id); if (v) v.flashUntil = performance.now() + FEEL.hitFlash * 1000; } break;
      case 'unitLevelUp': { const v = unitViews.get(ev.i); if (v) gsap.fromTo(v.body.scale, { x: FEEL.levelUp.scale, y: FEEL.levelUp.scale }, { x: 0.95, y: 0.95, duration: FEEL.levelUp.dur, ease: FEEL.levelUp.ease }); sfx.play('perfect', { gain: 0.5 }); break; }
      case 'unitDown': particles.burst(sim().units[ev.i].x / ONE, sim().units[ev.i].y / ONE, 0xff6b5a, 10); sfx.play('miss', { gain: 0.5 }); break;
      case 'castleHit': if (performance.now() - (playEvents.ch ?? 0) > 400) { hurt(0.5); shake(shakeEl, 'light'); playEvents.ch = performance.now(); } break;
      case 'wallBreak': { const b = wallViews[ev.seg].blocks[1]; particles.burst(b.x, b.y, 0x9c7a4f, 16); animFx('explosion', b.x, b.y - 8); shake(shakeEl, 'crit'); sfx.play('boom', { gain: 0.6 }); break; }
      case 'boom': particles.burst(ev.x, ev.y, 0xe07ab8, 20); shake(shakeEl, 'light'); sfx.play('boom', { gain: 0.4 }); break;
      case 'bldgDown': shake(shakeEl, 'crit'); sfx.play('boom'); break;
      case 'build': case 'wallBuild': sfx.play('perfect', { gain: 0.4 }); break;
      case 'produce': particles.burst(CX, CY - 60, 0xf0c35a, 8); toastHint(`牧場 +${ev.amount} 金`); break;
      case 'prewarn': showWarn(ev); break;
      case 'eventStart': sfx.play('boom', { gain: 0.3 }); break;
      case 'eventClear': if (ev.pts) toastHint(`${sim().script.events[ev.ev].name} 清除 +${ev.pts}${sim().script.events[ev.ev].chest ? '　寶箱！' : ''}`); break;
      case 'bossDown': banner(ev.final ? '大王倒下！' : '擊倒首領！', ev.final ? '守住了這一關' : '掉落寶箱', 'evo'); flash(); shake(shakeEl, 'boss'); sfx.play('evolve'); break;
      case 'ignore': toastHint(`已忽略：${CARD_TYPES[ev.cardType]}卡本局不再出現`); break;
      case 'lock': toastHint(`已鎖定：${CARD_TYPES[ev.cardType]}卡出現率 +50%`); break;
      case 'repair': if (Math.random() < 0.5) particles.burst(sim().units[ev.i].x / ONE, sim().units[ev.i].y / ONE - 10, 0xd8c39a, 2); break;
      case 'castStart': { const u = sim().units[ev.i]; if (u) animFx('sparkle', u.x / ONE, u.y / ONE - 40); break; }
      case 'heal': { const u = sim().units[ev.to]; if (u) { animFx('sparkle', u.x / ONE, u.y / ONE - 20, 1.5); particles.burst(u.x / ONE, u.y / ONE - 20, 0xb6f0a0, 6); } break; }
      case 'upgrade': sfx.play('perfect'); toastHint(`軍營升到 Lv${ev.lv}：可以生產${UNIT_NAME[UNIT_KINDS[ev.lv - 1]]}`); break;
      case 'workerBorn': toastHint('工人出發：會自動修城牆和軍營'); break;
      // card powers
      case 'explode': animFx('explosion', ev.x, ev.y, ev.r / 40); if (ev.inferno) animFx('fire', ev.x, ev.y - 6, 1.5); particles.burst(ev.x, ev.y, 0xff8a3d, ev.inferno ? 10 : 6); break;
      case 'zap': zapFx(ev.pts); if (performance.now() - lastZap > 80) { sfx.play('zap', { gain: 0.5 }); lastZap = performance.now(); } break;
      case 'thunder': flash(); shake(shakeEl, 'light'); break;
      case 'rain': rainFx(ev.x, ev.y, ev.r); sfx.play('whiff', { gain: 0.4 }); break;
      case 'winter': ringFx(CX, CY, ev.r, 0x8fd3ff, 1); particles.burst(CX, CY, 0xcfefff, 30); sfx.play('whiff', { pitch: 0.6 }); break;
      case 'react': animFx(ev.id === 'steam' ? 'steam' : ev.id === 'overload' ? 'explosion' : 'frost', ev.x, ev.y, Math.max(1, ev.r / 30)); break;
      case 'chain': if (ev.n >= FEEL.combo.min) { comboFx(ev.n); if (ev.n >= 8) shake(shakeEl, 'crit'); } break;
      // growth
      case 'levelUp': particles.burst(CX, CY - 80, COLORS.lamp, 24); break;
      case 'synergy': banner(`羈絆：${ev.name}`, SYNERGY[ev.tag].text, 'syn'); sfx.play('perfect'); break;
      case 'reactionOn': banner(`反應：${ev.name}`, REACTIONS[ev.id].text, 'react'); sfx.play('perfect'); break;
      case 'evolve': banner(`進化：${EVOS[ev.id].name}`, EVOS[ev.id].text, 'evo'); sfx.play('evolve'); flash(); shake(shakeEl, 'crit'); particles.burst(CX, CY - 60, 0x8ff0ff, 60); break;
      case 'card': if (ev.id === 'reinforce') toastHint('援軍抵達！拖曳他們布陣'); break;
      case 'chest': pendingChest = ev; break;
    }
  }
}
let pendingChest = null;
function spawnShot(ev) {
  if (ev.i >= 0) { const v = unitViews.get(ev.i); if (v) { v.attackUntil = performance.now() + 300; v.face = ev.tx < ev.x ? -1 : 1; } }
  if (ev.kind === 'shield' || ev.kind === 'worker') { animFx('spark', ev.tx, ev.ty - 8); return; }
  const name = ev.kind === 'castle' ? 'beam' : ev.kind === 'priest' ? 'sparkle' : 'arrow';
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

// --- per-frame sync from sim ---
function sync(now) {
  const s = sim();
  el.gold.textContent = s.gold;
  el.pop.textContent = `${pop(s)}/${popCap(s)}`; el.score.textContent = score(s);
  const left = Math.max(0, Math.ceil((s.script.matchTicks - s.tick) / 60));
  el.time.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  el.hp.style.transform = `scaleX(${Math.max(0, s.castle.hp) / CASTLE.hp})`;
  el.lv.textContent = `守望 Lv${s.level}`;
  el.xp.style.transform = `scaleX(${s.level >= LEVEL_MAX ? 1 : s.xp / XP_NEED(s.level)})`;
  renderBuild();
  const lr = lightR(s); light.scale.set(lr / 64); lightRing.scale.set(lr / 128); rangeRing.scale.set(lr / 128); rangeRing.position.set(CX, CY);

  s.slots.forEach((sl, i) => {
    const v = slotViews[i];
    v.s.visible = !!sl.kind; v.bar.visible = sl.kind === 'barracks'; v.s.shadow.visible = !!sl.kind;
    if (!sl.kind) { v.kind = ''; return; }
    const key = `barracks_${sl.lv}`;
    if (v.key !== key) { v.key = key; for (const l of v.s.children) l.texture = tex(px.buildings, key); }
    v.s.shadow.visible = true;
    v.kind = sl.kind;
    v.s.alpha = sl.build ? 0.55 : 1;
    v.bar.scale.set((sl.hp / barracksMaxHp(sl)) * 5, 1);
  });
  s.walls.forEach((w, i) => {
    const v = wallViews[i];
    const key = w.lv ? `${w.lv}_${WALL_STATE(w.hp / wallMaxHp(s, w.lv))}` : '';
    if (v.key === key) return;
    v.key = key;
    for (const b of v.blocks) { b.visible = !!w.lv; if (w.lv) for (const l of b.children) l.texture = wallBlock(w.lv, key.split('_')[1]); }
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
    if (now < v.attackUntil) setAnim(v, px.units, `${u.kind}_attack`, 0.18);
    else if (moving) setAnim(v, px.units, `${u.kind}_walk`, 0.15);
    else setAnim(v, px.units, `${u.kind}_idle`, 0.05);
    v.body.scale.set(PX * v.face, PX);
    v.body.alpha = u.state === 'setup' ? 0.7 : 1;
    v.pips.forEach((p, k) => { p.visible = k < u.lv; });
    v.hp.scale.x = 2.8 * Math.max(0, u.hp / unitMaxHp(s, u));
    v.cd.visible = u.redeploy > 0; v.cd.alpha = 0.15 + 0.4 * (u.redeploy / REDEPLOY_CD);
  });
  for (const [i, v] of unitViews) if (!seen.has(i) || !s.units[i].alive) { v.c.destroy({ children: true }); unitViews.delete(i); }

  const live = new Set();
  for (const f of s.foes) {
    live.add(f.id);
    const v = foeView(f);
    v.s.position.set(f.x / ONE, f.y / ONE); v.s.zIndex = f.y / ONE;
    if (v.sh) { v.sh.position.set(f.x / ONE, f.y / ONE - 2); v.sh.zIndex = f.y / ONE - 1; }
    if (f.x !== v.lastX) { v.s.scale.x = PX * v.k * (f.x < v.lastX ? -1 : 1); v.lastX = f.x; }
    v.s.tint = v.flashUntil > now ? 0xffffff : f.stun > 0 ? 0xc8ecff : f.burn > 0 ? 0xffb080 : f.slow > 0 ? 0xa8dcff : v.tint;
  }
  for (const [id, v] of foeViews) if (!live.has(id)) { v.s.destroy(); v.sh?.destroy(); foeViews.delete(id); }

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
function start(st = stageId) {
  stageId = st;
  rec = new Recorder(GAMES[stageId], SEED);
  setZoom(zoomI);
  bytes.length = 0; acc = 0; pendingChest = null; buildSig = '';
  for (const [, v] of unitViews) v.c.destroy({ children: true });
  for (const [, v] of foeViews) { v.s.destroy(); v.sh?.destroy(); }
  unitViews.clear(); foeViews.clear();
  el.panel.style.display = 'none'; el.cards.style.display = 'none'; el.chest.style.display = 'none';
  state = 'play';
  toastHint('點空地蓋軍營、點軍營買兵；按住小兵拖曳布陣');
  sync(performance.now());
}

function finish() {
  state = 'over'; closeMenu();
  el.cards.style.display = 'none'; el.chest.style.display = 'none';
  const s = sim(), b = scoreBreakdown(s), up = rec.upload(), v = verify(GAMES[stageId], up);
  const win = s.bossDead, rows = [['擊殺', b.kills], ['事件清除', b.events], ['Boss', b.boss], ['主城耐久', b.castle], ['3 級老兵', b.veterans]];
  const evos = Object.keys(EVOS).filter(e => s.evo[e]).map(e => EVOS[e].name);
  el.panel.innerHTML = `<h1>${win ? '守住了！' : s.castle.hp <= 0 ? '燈熄了' : '天亮了'}</h1><p style="opacity:.75">${STAGES[stageId].name}・${STAGES[stageId].minutes} 分鐘</p>
    <p>撐了 ${Math.floor(s.tick / 60)} 秒　擊殺 ${s.kills}　守望 Lv${s.level}${evos.length ? `　進化：${evos.join('、')}` : ''}</p>
    <table>${rows.map(([k, n]) => `<tr><td>${k}</td><td>${n}</td></tr>`).join('')}<tr class="total"><td>總分</td><td>${score(s)}</td></tr></table>
    <p style="opacity:.7;font-size:13px">${v.valid ? '重播驗證 ✓' : `重播驗證失敗：${v.reason}`}　種子 ${SEED}</p>
    <button id="again">再來一局</button> <button id="menu-stages" class="ghost">選關</button>`;
  el.panel.style.display = 'block';
  gsap.fromTo(el.panel, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: FEEL.ui.in, ease: FEEL.ui.inEase });
  $('#again').addEventListener('click', () => { sfx.play('click'); start(); });
  $('#menu-stages').addEventListener('click', () => { sfx.play('click'); showTitle(); });
}

function showTitle() {
  state = 'title';
  el.cards.style.display = 'none'; el.chest.style.display = 'none';
  el.panel.innerHTML = `<h1>守望之戰</h1><p>怪從八方湧來，守住中央的主城，擊倒最後的大王。</p>
  <ul class="rules">
    <li>打怪得<b style="color:var(--gold)">金</b>：蓋軍營、買兵、蓋城牆。軍營升級才能出盾兵、牧師。</li>
    <li>點<b>主城</b>買工人：自動修城牆和軍營，被打會先反擊。</li>
    <li>城牆留<b>缺口</b>可以引導會繞路的怪；有些怪一定拆牆。</li>
    <li>守望值滿了<b>三選一</b>：湊羈絆、進化；可以<b>忽略</b>或<b>鎖定</b>一種兵種卡。</li>
    <li>首領會掉寶箱。<b>按住小兵拖曳</b>布陣（10 秒冷卻）。</li>
  </ul>
  <div class="stages">${STAGE_IDS.map(k => `<button data-stage="${k}" class="${k === stageId ? 'sel' : ''}"><b>${STAGES[k].minutes} 分</b><small>${STAGES[k].name}・${STAGES[k].bosses.length} 王</small></button>`).join('')}</div>`;
  el.panel.style.display = 'block';
  el.panel.querySelectorAll('[data-stage]').forEach(b => b.addEventListener('click', () => { sfx.unlock(); sfx.play('click'); start(b.dataset.stage); }));
}
showTitle();
if (import.meta.env.DEV) {
  // Dev only: drive the same loop body without rAF (hidden previews throttle animation frames).
  window.__lh = {
    get sim() { return rec?.sim; }, get state() { return state; }, send, start, tapAt, toWorld, choose: doChoose,
    advance(n) { for (let k = 0; k < n && state === 'play'; k++) if (!tick()) break; if (state !== 'over') sync(performance.now()); app.render(); },
  };
}
