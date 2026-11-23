// Art review page (N6): the ground with every sprite laid out on it at game scale, shadows included, and the aircraft
// banking. Not part of the shipped game (art-preview.html is not a build input).
import { Application, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { Ground, PIXEL } from './ground.js';
import { buildAtlas, BANKS, jetFrameFor, JET_SCALE } from './atlas.js';

const q = new URLSearchParams(location.search);
const LOW = q.get('low') === '1', STILL = q.get('still') === '1', RUSH = Math.max(0, Math.min(1, Number(q.get('rush')) || 0));
const CHAPTER = Math.max(0, Math.min(2, Number(q.get('ch')) || 0));      // ?ch=0 coast, 1 night clouds, 2 canyon
const SHEET = q.get('sheet') === '2';                                    // ?sheet=2: the v4 sprites instead of the v1 ones
const WORLD_W = 720, WORLD_H = 1280;

const stage = document.getElementById('stage');
const app = new Application();
await app.init({ preference: 'webgl', resizeTo: stage, backgroundColor: 0x14121c, antialias: false, autoDensity: true, resolution: Math.min(devicePixelRatio, 2) });
stage.appendChild(app.canvas);

const atlas = buildAtlas();
const source = Texture.from(atlas.canvas).source;
source.scaleMode = 'nearest';
const tex = Object.fromEntries(Object.entries(atlas.frames).map(([k, f]) => [k, new Texture({ source, frame: new Rectangle(f.x, f.y, f.w, f.h) })]));

const ground = new Ground(app.renderer);
const world = new Container();                       // the fixed 720 x 1280 play field
app.stage.addChild(ground.view, world);

const put = (name, x, y, { alt = 40, tint = 0xffffff, scale = PIXEL } = {}) => {
  const sh = new Sprite({ texture: tex.shadow, anchor: 0.5 });
  const f = atlas.frames[name];
  sh.scale.set((f.w * PIXEL) / 20 * 0.9, (f.w * PIXEL) / 20 * 0.9);
  sh.position.set(x + alt * 0.6, y + alt);           // the higher it flies, the farther its shadow falls
  const s = new Sprite({ texture: tex[name], anchor: 0.5 });
  s.scale.set(scale); s.position.set(x, y); s.tint = tint;
  world.addChild(sh, s);
  return s;
};

const bare = (name, x, y, rot = 0, tint = 0xffffff) => { const s = world.addChild(Object.assign(new Sprite({ texture: tex[name], anchor: 0.5 }), { x, y, rotation: rot, tint })); s.scale.set(PIXEL); return s; };
if (!SHEET) {
  // row 1: the five bank frames; row 2: enemies; row 3: boss; row 4: shots and effects; bottom: a flying aircraft
  BANKS.forEach((b, i) => put(jetFrameFor(b), 120 + i * 120, 190, { alt: 54, scale: PIXEL * JET_SCALE }));   // the ship is drawn at twice the art detail
  ['drone', 'gunner', 'weaver', 'diver'].forEach((n, i) => put(n, 150 + i * 140, 360));
  for (let i = 0; i < 8; i++) bare('enemyShot', 110 + i * 34, 760 + (i % 3) * 22);
  for (let i = 0; i < 4; i++) bare('playerShot', 470 + (i % 2) * 28, 740 + (i >> 1) * 60);
  bare('ring', 600, 770);
} else {
  // v4 sheet. row 1: chapter 2 enemies and a mine field; row 2: chapter 3 enemies; rows 3-4: the two bosses;
  // row 5: a wall with its gap and the gap marker, lances at three headings, heavy shots; bottom: the ship with wingmen
  ['lancer', 'miner', 'mine', 'mine'].forEach((n, i) => put(n, 120 + i * 150, 130, { alt: n === 'mine' ? 24 : 40 }));
  ['bulwark', 'splitter', 'shard', 'shard'].forEach((n, i) => put(n, 120 + i * 150, 270, { alt: 40 }));
  for (let k = 0; k < 24; k++) if (k < 9 || k >= 14) bare('enemyShot', k * 30 + 15, 700);
  bare('gapMark', 345, 668, 0, 0x8ff6ff);
  [0, 0.5, -0.6].forEach((r, i) => bare('lance', 110 + i * 70, 800, r));
  for (let i = 0; i < 4; i++) bare('heavyShot', 420 + (i % 2) * 28, 780 + (i >> 1) * 60);
  for (let i = 0; i < 4; i++) bare('playerShot', 540 + (i % 2) * 28, 780 + (i >> 1) * 60);
}
const flyer = put('jet2', 360, 1040, { alt: 54, scale: PIXEL * JET_SCALE });
const flyerCore = world.addChild(Object.assign(new Sprite({ texture: tex.core, anchor: 0.5 }), { x: 360, y: 1040 }));
flyerCore.scale.set(PIXEL);
const flyerShadow = world.children[world.getChildIndex(flyer) - 1];
const wings = SHEET ? [-1, 1].map(d => Object.assign(bare('wing', 360, 1040), { side: d })) : [];

function layout() {
  const w = app.screen.width, h = app.screen.height, s = Math.min(w / WORLD_W, h / WORLD_H);
  world.scale.set(s);
  world.position.set(Math.round((w - WORLD_W * s) / 2), Math.round((h - WORLD_H * s) / 2));
  ground.resize(w, h, s);
}
layout();
app.renderer.on('resize', layout);

let t = 0;
app.ticker.add(tk => {
  const dt = tk.deltaMS / 1000;
  t += dt;
  const sway = Math.sin(t * 1.3), x = 360 + sway * 220;
  flyer.texture = tex[jetFrameFor(Math.cos(t * 1.3) * 2.2)];
  flyer.x = flyerCore.x = x; flyerShadow.x = x + 54 * 0.6;
  for (const w of wings) w.x = x + w.side * 70;
  ground.update(STILL ? 0 : dt, 60 + 110 * RUSH, (x - 360) * 0.06, LOW, RUSH, CHAPTER);   // ?rush=0..1 previews the speed look
});

if (import.meta.env.DEV) window.__art = { app, ground, atlas };
