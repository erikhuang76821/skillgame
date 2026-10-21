import { Application, Assets, Container, Graphics, TextureSource } from 'pixi.js';
import { gsap } from 'gsap';
import { Recorder, replay, encodeLog, decodeLog } from './sim/replay.js';
import { seedFromString } from './sim/rng.js';
import { TPS, scoreBreakdown } from './sim/sim.js';
import { VIEW_WORLD } from './sim/content.js';
import { WorldView } from './render/world.js';
import { makeTextures } from './render/textures.js';
import { Hud } from './ui/hud.js';
import { titleScreen, levelUpPanel, resultsPanel } from './ui/panels.js';
import { Input } from './input.js';
import { registerIcons } from './ui/theme.js';
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-700.css';
import S from './i18n/en-US.js';

import sasqIdleUrl from './assets/sasq_idle.png';
import sasqIdleMeta from './assets/sasq_idle.json';
import sasqWalkUrl from './assets/sasq_walk.png';
import sasqWalkMeta from './assets/sasq_walk.json';
import greylingWalkUrl from './assets/greyling_walk.png';
import greylingWalkMeta from './assets/greyling_walk.json';
import pineUrl from './assets/pine.png';
import keyArtUrl from './assets/key_art.webp';
import iconsUrl from './assets/icons.png';
import iconsMeta from './assets/icons.json';

// Portrait-only (gdd/10). Logical width is fixed at 720; height follows the phone's aspect
// (9:16 .. 9:20). The WORLD window is always 720x1280 on every device so nobody sees more of the
// arena than their opponent; extra height on tall phones only holds HUD and thumb space.
const W = 720, H_MIN = 1280, H_MAX = 1600;
const STEP_MS = 1000 / TPS;

TextureSource.defaultOptions.scaleMode = 'nearest'; // pixel art: nearest-neighbour everywhere

const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
};

const settings = {
  fx: store.get('sd.fx') || 'high',
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  touch: matchMedia('(pointer: coarse)').matches,
};
const sideways = matchMedia('(orientation: landscape) and (pointer: coarse)');

const app = new Application();
await app.init({ width: W, height: H_MIN, background: 0x0e1620, antialias: false, roundPixels: true, resolution: 1, preference: 'webgl' });
document.getElementById('app').appendChild(app.canvas);
document.body.style.setProperty('--bg', `url(${keyArtUrl})`);

// World viewport: fixed 720x1280 window, masked, centred vertically in the canvas.
const port = app.stage.addChild(new Container());
const portMask = port.addChild(new Graphics().rect(0, 0, VIEW_WORLD.w, VIEW_WORLD.h).fill(0xffffff));
port.mask = portMask;
const ui = app.stage.addChild(new Container());

const layout = { h: H_MIN, scale: 1, safe: { top: 0, bottom: 0 } };
const safeEl = document.getElementById('safe');
function measure() {
  const h = Math.round(Math.min(H_MAX, Math.max(H_MIN, (W * innerHeight) / innerWidth)));
  const scale = Math.min(innerWidth / W, innerHeight / h);
  const cs = getComputedStyle(safeEl);
  layout.h = h;
  layout.scale = scale;
  layout.safe = { top: parseFloat(cs.paddingTop) / scale || 0, bottom: parseFloat(cs.paddingBottom) / scale || 0 };
  app.renderer.resize(W, h);
  app.canvas.style.width = `${Math.floor(W * scale)}px`;
  app.canvas.style.height = `${Math.floor(h * scale)}px`;
  port.position.set(0, Math.floor((h - VIEW_WORLD.h) / 2));
}
const toLogical = (cx, cy) => {
  const r = app.canvas.getBoundingClientRect();
  return { x: ((cx - r.left) * W) / r.width, y: ((cy - r.top) * layout.h) / r.height };
};

const [sasqIdle, sasqWalk, greylingWalk, pine, keyArt, icons] = await Promise.all(
  [sasqIdleUrl, sasqWalkUrl, greylingWalkUrl, pineUrl, keyArtUrl, iconsUrl].map(u => Assets.load(u)));
// Bundled pixel font (~16 KB) must be ready before any Text is rasterised.
await Promise.all(['400', '700'].map(w => document.fonts.load(`${w} 32px "Pixelify Sans"`))).catch(() => {});
registerIcons(icons, iconsMeta);
keyArt.source.scaleMode = 'linear';
// One 8-direction sheet + metadata per animation (pokesurvivor contract).
const assets = {
  sasq: { Idle: { texture: sasqIdle, meta: sasqIdleMeta }, Walk: { texture: sasqWalk, meta: sasqWalkMeta } },
  greyling: { Walk: { texture: greylingWalk, meta: greylingWalkMeta } },
  pine,
};
const tex = makeTextures();
const input = new Input(app.canvas);

const hex = n => (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
const today = new Date().toISOString().slice(0, 10);
const params = new URLSearchParams(location.search);
const urlSeed = /^[0-9a-f]{8}$/i.test(params.get('seed') || '') ? parseInt(params.get('seed'), 16) >>> 0 : null;
const target = Number(params.get('score')) || 0;
const newSeed = () => seedFromString(`${today}:${performance.now()}`);

const game = {
  mode: 'title', seed: urlSeed ?? seedFromString(today), screen: null, world: null, hud: null, rec: null, acc: 0, results: null,

  dropScreen() {
    if (!this.screen) return;
    this.screen.kill?.();
    this.screen.destroy({ children: true });
    this.screen = null;
  },

  clear() {
    this.dropScreen();
    this.world?.destroy(); this.world = null;
    this.hud?.destroy(); this.hud = null;
  },

  title() {
    this.clear();
    this.mode = 'title';
    input.enabled = false;
    const challenge = urlSeed !== null && this.seed === urlSeed;
    const best = store.get(`sd.best.${hex(this.seed)}`)?.score;
    const info = {
      title: challenge ? S.challengeTitle : `${S.dailyTitle} · ${today}`,
      seed: `#${hex(this.seed)}`,
      best: challenge && target ? `${S.beat(target)}  ·  ${S.bestOnSeed(best)}` : S.bestOnSeed(best),
    };
    this.screen = ui.addChild(titleScreen(layout.h, layout.safe, keyArt, settings, info, () => this.start(this.seed)));
  },

  start(seed) {
    this.clear();
    this.seed = seed >>> 0;
    this.rec = new Recorder(this.seed);
    this.world = new WorldView(assets, tex, settings, VIEW_WORLD);
    port.addChildAt(this.world.root, 0);
    this.hud = new Hud(settings, hex(this.seed));
    this.hud.layout(layout.h, layout.safe);
    ui.addChild(this.hud.root);
    this.mode = 'run';
    this.acc = 0;
    input.reset();
    input.enabled = true;
    this.world.sync(this.rec.sim);
    this.hud.update(this.rec.sim, null);
  },

  stickLogical() {
    const s = input.stick;
    if (!s?.live) return null;
    const o = toLogical(s.ox, s.oy), p = toLogical(s.x, s.y);
    return { ox: o.x, oy: o.y, x: p.x, y: p.y };
  },

  frame(dtMs) {
    if (this.mode !== 'run') return;
    if (sideways.matches) { this.acc = 0; return; } // paused behind the rotate overlay
    this.acc += Math.min(dtMs, 100);
    const sim = this.rec.sim;
    while (this.acc >= STEP_MS && sim.state === 'play') {
      this.acc -= STEP_MS;
      this.rec.step(input.byte());
    }
    this.world.sync(sim);
    this.hud.update(sim, this.stickLogical());
    if (sim.state === 'levelup') this.levelUp();
    else if (sim.state === 'over') this.finish();
  },

  levelUp() {
    this.mode = 'levelup';
    this.acc = 0;
    input.enabled = false;
    input.reset();
    this.hud.update(this.rec.sim, null);
    this.screen = ui.addChild(levelUpPanel(layout.h, this.rec.sim, settings, i => this.pick(i)));
  },

  pick(i) {
    if (this.mode !== 'levelup' || !this.rec.choose(i)) return;
    this.dropScreen();
    if (this.rec.sim.state === 'levelup') { this.levelUp(); return; }
    this.mode = 'run';
    input.reset();
    input.enabled = true;
    this.world.sync(this.rec.sim);
  },

  finish() {
    this.mode = 'results';
    input.enabled = false;
    const rec = this.rec, sim = rec.sim, res = rec.result();

    // What the server would do: re-simulate the uploaded inputs and compare.
    const t0 = performance.now();
    const check = replay(rec.seed, rec.log, rec.choices);
    const verifyMs = Math.round(performance.now() - t0);
    const verified = check.valid && check.score === res.score && check.hash === res.hash;

    const key = `sd.best.${hex(rec.seed)}`;
    let best = store.get(key);
    if (best) {
      const again = replay(rec.seed, decodeLog(best.log), best.choices);
      if (!again.valid || again.score !== best.score) best = null; // tampered or from an older sim build
    }
    const isNewBest = verified && (!best || res.score > best.score);
    if (isNewBest) store.set(key, { score: res.score, log: encodeLog(rec.log, res.ticks), choices: rec.choices });

    const secs = Math.floor(sim.tick / TPS);
    this.results = {
      survived: sim.survived, score: res.score, breakdown: scoreBreakdown(sim), kills: sim.kills, maxCombo: sim.maxCombo,
      grazes: sim.grazes, hits: sim.hits, time: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`,
      level: sim.player.level, verified, verifyMs, best: isNewBest ? res.score : best?.score ?? res.score, isNewBest,
      challengeUrl: `${location.origin}${location.pathname}?seed=${hex(rec.seed)}&score=${res.score}`,
    };
    this.showResults();
  },

  showResults() {
    this.dropScreen();
    this.screen = ui.addChild(resultsPanel(layout.h, layout.safe, this.results, settings, {
      retry: () => this.start(this.seed),
      newSeed: () => this.start(newSeed()),
      title: () => this.title(),
    }));
  },

  relayout() {
    measure();
    this.hud?.layout(layout.h, layout.safe);
    if (this.mode === 'title') this.title();
    else if (this.mode === 'levelup') { this.dropScreen(); this.levelUp(); }
    else if (this.mode === 'results') this.showResults();
  },
};

input.isButton = (cx, cy) => {
  if (!game.hud) return false;
  const p = toLogical(cx, cy);
  return game.hud.hitsHowl(p.x, p.y) ? 'howl' : false;
};

addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'q') {
    settings.fx = settings.fx === 'high' ? 'low' : 'high';
    store.set('sd.fx', settings.fx);
    if (game.mode === 'title' && game.screen?.fxLine) game.screen.fxLine.text = S.fx(settings.fx);
    return;
  }
  if (game.mode === 'title' && (k === 'enter' || k === ' ')) game.start(game.seed);
  else if (game.mode === 'levelup' && ['1', '2', '3'].includes(k)) game.pick(Number(k) - 1);
  else if (game.mode === 'results') {
    if (k === 'enter') game.start(game.seed);
    else if (k === 'n') game.start(newSeed());
    else if (k === 'escape') game.title();
  }
});

let resizeTimer = 0;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => game.relayout(), 120); });
document.addEventListener('visibilitychange', () => { game.acc = 0; });
measure();
app.ticker.add(t => game.frame(t.deltaMS));
gsap.ticker.lagSmoothing(500, 33);
game.title();
window.__game = Object.assign(game, { app, layout }); // debug handle for the prototype
