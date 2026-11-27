// Gate Lane boot: Pixi app + fixed-step sim loop + render-only juice.
// Drag left/right anywhere to steer the squad; it fires on its own. The match is recorded by core/Recorder
// and re-verified on device at the end (the same check the server runs).
import { Application, Container, Sprite, TilingSprite, BitmapText } from 'pixi.js';
import { gsap } from 'gsap';
import { Recorder, verify } from './sim/core/index.js';
import { InputClock, SteerInput } from './sim/core/input.js';
import { GAME, TICK_MS, LANE_W, BOSS_STOP, RULES, KEY_STEP, encodeX, halfWidth } from './sim/sim.js';
import { FEEL } from './fx/feel.js';
import { shake } from './fx/shake.js';
import { hurt, flash } from './fx/overlay.js';
import { Shockwave } from './fx/shockwave.js';
import { Particles } from './fx/particles.js';
import { makeArt, FONT, ROAD_TILE } from './render/art.js';
import { Sfx } from './audio/sfx.js';

// --- GSAP global settings (references/gsap.md §1) ---
gsap.defaults({ duration: 0.25, ease: 'power2.out', overwrite: 'auto' });
gsap.config({ force3D: true, nullTargetWarn: import.meta.env.DEV });
gsap.ticker.lagSmoothing(500, 33);
gsap.matchMedia().add('(prefers-reduced-motion: reduce)', () => {
  FEEL.enabled = false;
  return () => { FEEL.enabled = true; };
});

// --- Pixi: a fixed 720x1280 portrait view, letterboxed to the screen (same field of view on every device, E3) ---
const VIEW_W = 720, VIEW_H = 1280, LANE_X = 60, SQUAD_Y = 1060;
const stage = document.getElementById('stage');
const shakeEl = document.getElementById('stage-shake');
const app = new Application();
await app.init({
  preference: 'webgl', resizeTo: stage, backgroundColor: 0x10161d,
  antialias: false, autoDensity: true, resolution: Math.min(devicePixelRatio, 2),
});
shakeEl.appendChild(app.canvas);
const art = makeArt(app.renderer);

const view = new Container();                 // logical 720x1280
const world = new Container();                // what the shockwave distorts
const road = new TilingSprite({ texture: art.road, width: VIEW_W, height: VIEW_H });
const layer = new Container();                // gates, barrels, zombies, boss, squad, labels (one batch)
const gateLayer = new Container(), barrelLayer = new Container(), zombieLayer = new Container(), labelLayer = new Container(), squadLayer = new Container();
layer.addChild(gateLayer, barrelLayer, zombieLayer, labelLayer, squadLayer);   // labels above zombies so gate values stay readable
const bulletLayer = new Container();          // additive, drawn after the batch
bulletLayer.blendMode = 'add';
world.addChild(road, layer, bulletLayer);
view.addChild(world);
app.stage.addChild(view);

const particles = new Particles(app.renderer);
view.addChild(particles.view);
const shock = new Shockwave(world, app.screen);

function fit() {
  const s = Math.min(app.screen.width / VIEW_W, app.screen.height / VIEW_H);
  view.scale.set(s);
  view.position.set(Math.round((app.screen.width - VIEW_W * s) / 2), Math.round((app.screen.height - VIEW_H * s) / 2));
}
fit();
app.renderer.on('resize', fit);

const sx = x => LANE_X + x;                                   // lane x -> view x
const sy = (ty, dist) => SQUAD_Y - (ty - dist);               // track y -> view y

// --- DOM HUD ---
const $ = q => document.querySelector(q);
const scoreEl = $('#hud .score'), progressEl = $('#hud .progress > i'), weaponEl = $('#hud .weapon');
const bossEl = $('#hud .boss'), bossBar = $('#hud .boss > i'), panel = $('#panel');
if (import.meta.env.DEV) {
  const { drawCallCounter } = await import('./debug/drawCalls.js');
  const dc = drawCallCounter(app);
  const dcEl = $('#hud .dc');
  dcEl.hidden = false;
  setInterval(() => { dcEl.textContent = `DC ${dc()}  FPS ${app.ticker.FPS.toFixed(0)}`; }, 250);
}

// --- Seed ---
const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed')) || 20261021;

// --- Input: drag anywhere; the finger's x maps to the lane. Arrow keys / A-D also steer. ---
// Events go to SteerInput with their timestamp; each sim tick samples it, so the input log does not
// depend on the frame rate (spec §2, knowledge-base/13).
let steer = null, dragging = false, keyDir = 0;
const setKey = (e, dir) => { if (dir !== keyDir) { keyDir = dir; if (state === 'play') steer.key(e.timeStamp, dir); } };
const sfx = new Sfx();
function laneXFromEvent(e) {
  const r = app.canvas.getBoundingClientRect();
  return ((e.clientX - r.left) - view.x) / view.scale.x - LANE_X;
}
stage.addEventListener('pointerdown', e => {
  sfx.unlock();
  if (state !== 'play') {
    if (performance.now() < restartLock) return;           // a finger still on the glass at death must not skip the results
    sfx.play('click'); start();
    steer.x = laneXFromEvent(e);
  } else steer.point(e.timeStamp, laneXFromEvent(e));
  dragging = true;
});
addEventListener('pointermove', e => { if (dragging && state === 'play') steer.point(e.timeStamp, laneXFromEvent(e)); });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointercancel', () => { dragging = false; });
addEventListener('keydown', e => {
  sfx.unlock();
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') setKey(e, -1);
  else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') setKey(e, 1);
  else if (e.key === 'm' || e.key === 'M') sfx.setMuted(!sfx.muted);
  else if ((e.key === ' ' || e.key === 'Enter') && state !== 'play' && performance.now() >= restartLock) start();
});
addEventListener('keyup', e => {
  if (['ArrowLeft', 'a', 'A'].includes(e.key) && keyDir < 0) setKey(e, 0);
  if (['ArrowRight', 'd', 'D'].includes(e.key) && keyDir > 0) setKey(e, 0);
});

// --- Entity views (pooled by sim id) ---
const zombieViews = new Map(), barrelViews = new Map(), gateViews = new Map();
const soldiers = [];
const MAX_SOLDIERS = 90;
const squadShadow = new Sprite({ texture: art.shadow, anchor: 0.5 });
const squadLabel = new BitmapText({ text: '3', style: { fontFamily: FONT, fontSize: 40 }, anchor: 0.5 });
const boss = new Sprite({ texture: art.boss, anchor: { x: 0.5, y: 0.85 } });
boss.visible = false;
boss.scale.set(1.45);
const bulletPool = [];

function label(text, size) { return new BitmapText({ text, style: { fontFamily: FONT, fontSize: size }, anchor: 0.5 }); }
const gateText = g => (g.kind === 'mul' ? `×${g.v}` : g.v >= 0 ? `+${g.v}` : `${g.v}`);
const gateTint = g => (g.kind === 'mul' ? 0x41b8ff : g.v < 0 ? (g.hits >= RULES.pumpMax ? 0xb02a2a : 0xff4d4d) : g.hits >= RULES.pumpMax ? 0xe0a920 : 0x3f8cff);   // a maxed gate that is still negative stays red
// Shots left on a + gate, shown as pips under its value; a full gate reads MAX and lets bullets through.
const pipText = g => (g.hits >= RULES.pumpMax ? 'MAX' : '●'.repeat(g.hits) + '○'.repeat(RULES.pumpMax - g.hits));

function buildGate(g) {
  const c = new Container();
  const p = new Sprite({ texture: art.panel, anchor: 0.5 });
  p.tint = gateTint(g);
  const t = label(gateText(g), 44);
  const pips = label(g.kind === 'add' ? pipText(g) : '', 20);
  c.addChild(p);
  c.x = t.x = pips.x = sx(g.side === 0 ? LANE_W / 4 : (LANE_W * 3) / 4);
  gateLayer.addChild(c);
  labelLayer.addChild(t, pips);
  return { c, p, t, pips, hits: g.hits };
}
function buildPosts(y) {
  const out = [0, LANE_W / 2, LANE_W].map(x => {
    const s = new Sprite({ texture: art.post, anchor: { x: 0.5, y: 0.9 } });
    s.x = sx(x);
    gateLayer.addChild(s);
    return s;
  });
  return { posts: out, y };
}
const postRows = new Map();

let rec, state = 'title', restartLock = 0, freeze = 0, lastHitSfx = 0, bossFlash = 0;

function clearViews() {
  for (const m of [zombieViews, barrelViews, gateViews]) { for (const v of m.values()) { (v.c ?? v).destroy({ children: true }); if (v.t && !v.t.destroyed) v.t.destroy(); v.pips?.destroy(); v.reward?.destroy(); } m.clear(); }
  for (const r of postRows.values()) r.posts.forEach(p => p.destroy());
  postRows.clear();
  for (const b of bulletPool) b.destroy();
  bulletPool.length = 0;
  if (!soldiers.length) {
    squadLayer.addChild(squadShadow, boss);
    for (let i = 0; i < MAX_SOLDIERS; i++) {
      const s = new Sprite({ texture: art.soldier, anchor: { x: 0.5, y: 0.8 } });
      s.scale.set(1.5);
      s.visible = false;
      soldiers.push(s);
      squadLayer.addChild(s);
    }
    squadLayer.addChild(squadLabel);
  }
}

// --- Match ---
let clock;
function start() {
  rec = new Recorder(GAME, SEED);
  clock = new InputClock(performance.now(), 0, TICK_MS);
  steer = new SteerInput(clock, LANE_W / 2, KEY_STEP, 0, LANE_W);
  steer.dir = keyDir;
  clearViews();
  boss.visible = false;
  bossEl.style.opacity = 0;
  panel.style.display = 'none';
  scoreEl.textContent = '0';
  weaponEl.textContent = '武器 Lv1';
  state = 'play';
}

function showTitle() {
  panel.style.display = '';
  panel.innerHTML = `<h1>GATE LANE</h1>
    <p>左右拖曳移動小隊，射擊自動進行</p>
    <p class="hint">射 + 門可以加值（每扇 ${RULES.pumpMax} 次，滿了顯示 MAX）· 打爆桶子拿武器 · 撐到擊倒頭目</p>
    <p class="hint">計分：殭屍 ${RULES.ptsKill} · 裝甲殭屍 ${RULES.ptsArmored} · 桶子 ${RULES.ptsBarrel} · 頭目每 ${RULES.bossDmgPerPt} 傷害 1 分<br>擊倒頭目 ${RULES.ptsBoss} ＋ 剩餘每秒 ${RULES.ptsBossSec} ＋ 生還士兵每名 1（只在擊倒頭目時）</p>
    <p style="margin-top:16px">點一下開始</p>
    <p class="hint">種子 ${SEED}</p>`;
}

function finish() {
  state = 'over';
  dragging = false;
  restartLock = performance.now() + 1200;
  const up = rec.upload();
  const v = verify(GAME, up);
  const b = GAME.scoreBreakdown(rec.sim), sim = rec.sim;
  const row = (k, n, pts) => `<tr><td>${k}</td><td>${n}</td><td>${pts}</td></tr>`;
  panel.style.display = '';
  const TITLE = { win: '擊倒頭目！', wiped: '小隊全滅', boss: '頭目衝到面前', timeout: '時間到' };
  panel.innerHTML = `<h1 class="${b.win ? 'win' : 'lose'}">${TITLE[b.cause]}</h1>
    <table>
      ${row('擊殺殭屍', b.kills, b.kills * RULES.ptsKill)}
      ${row('擊殺裝甲殭屍', b.armored, b.armored * RULES.ptsArmored)}
      ${row('打爆桶子', b.barrels, b.barrels * RULES.ptsBarrel)}
      ${row('頭目傷害', '', b.bossDmg)}
      ${b.win ? row('擊倒頭目', '', RULES.ptsBoss) : ''}
      ${b.win ? row('剩餘時間', `${b.bossSecs} 秒`, b.bossSecs * RULES.ptsBossSec) : ''}
      ${b.win ? row('生還士兵', sim.troops, b.survivors) : ''}
      <tr class="total"><td>總分</td><td></td><td>${sim.score}</td></tr>
    </table>
    <p class="hint">${v.valid ? '重播驗證 ✓' : `重播驗證失敗：${v.reason}`} · 最多士兵 ${b.peakTroops}</p>
    <p id="again" style="opacity:0">點一下再玩一次（同種子 ${SEED}）</p>`;
  gsap.to('#again', { opacity: 1, delay: 1.2, duration: 0.3 });
  gsap.from(panel, { scale: 0.85, opacity: 0, duration: FEEL.ui.in, ease: FEEL.ui.inEase });
}

// --- Juice: driven by sim events, never feeds back into sim ---
function popup(text, x, y, tint = 0xffffff) {
  const t = label(text, 40);
  t.tint = tint;
  t.position.set(x, y);
  view.addChild(t);
  gsap.timeline({ onComplete: () => t.destroy() })
    .from(t.scale, { x: 0.4, y: 0.4, duration: 0.15, ease: 'back.out(3)' })
    .to(t, { y: y - FEEL.popup.rise * 2, alpha: 0, duration: FEEL.popup.dur, ease: FEEL.popup.ease }, '>-0.02');
}

function playJuice(ev, sim) {
  switch (ev.type) {
    case 'kill': {
      particles.burst(sx(ev.x), sy(ev.y, sim.dist), ev.armored ? 0xb7c0c9 : 0x8fd05a, ev.armored ? 14 : 6);
      const now = performance.now();
      if (now - lastHitSfx > 60) { sfx.play('hit', { gain: 0.35 }); lastHitSfx = now; }
      break;
    }
    case 'gateHit': {
      const v = gateViews.get(ev.id);
      if (v) gsap.fromTo(v.t.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: 0.12 });
      const g = sim.gates[ev.id];
      if (g.hits === RULES.pumpMax) {                       // just maxed: say so, or it looks like the gate stopped counting
        popup('MAX', sx(g.side === 0 ? LANE_W / 4 : (LANE_W * 3) / 4), sy(g.y, sim.dist) - 40, 0xffd34d);
        sfx.play('perfect', { gain: 0.5 });
      }
      break;
    }
    case 'gate': {
      const good = ev.after >= ev.before;
      sfx.play(good ? 'pickup' : 'miss', { pitch: good ? 1 + Math.min(ev.after - ev.before, 200) / 400 : 1 });
      popup(ev.kind === 'mul' ? `×${ev.v}` : `${ev.v >= 0 ? '+' : ''}${ev.v}`, sx(sim.sx), SQUAD_Y - 120, good ? 0x8ff03c : 0xff6b5a);
      if (good) flash(); else { hurt(0.7); shake(shakeEl, 'light'); }
      gsap.fromTo(squadLabel.scale, { x: 1.6, y: 1.6 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
      break;
    }
    case 'barrelHit': {
      const v = barrelViews.get(ev.id);
      if (v) gsap.fromTo(v.c.scale, { x: 1.08, y: 0.94 }, { x: 1, y: 1, duration: 0.08 });
      break;
    }
    case 'barrel': {
      const x = sx(ev.x), y = sy(ev.y, sim.dist);
      particles.burst(x, y, 0xff9a3c, 28);
      shake(shakeEl, 'crit');
      freeze = Math.max(freeze, FEEL.hitStop.crit);
      sfx.play('boom');
      popup(ev.reward === 'weapon' ? `Lv${ev.weapon}` : `+${sim.barrels[ev.id].amount}`, x, y - 40, 0xffe27a);
      gsap.fromTo(weaponEl, { scale: 1.4 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' });
      break;
    }
    case 'crash':
      particles.burst(sx(sim.barrels[ev.id].x), SQUAD_Y - 20, 0xff5a3c, 30);
      shake(shakeEl, 'boss');
      sfx.play('boom', { pitch: 0.7 });
      break;
    case 'hurt':
      if (ev.cause !== 'zombie' || ev.n > 1) hurt(Math.min(1, ev.n / 20 + 0.3));
      else hurt(0.25);
      if (ev.cause === 'zombie') shake(shakeEl, 'light');
      if (ev.cause === 'barrel') popup(`-${ev.n}`, sx(sim.sx), SQUAD_Y - 120, 0xff6b5a);
      break;
    case 'boss':
      boss.visible = true;
      bossEl.style.opacity = 1;
      sfx.play('miss', { pitch: 0.5 });
      shake(shakeEl, 'crit');
      break;
    case 'bossHit':
      bossFlash = 0.06;
      break;
    case 'bossDead':
      shake(shakeEl, 'boss');
      flash();
      shock.play(sx(ev.x) * view.scale.x + view.x, sy(ev.y, sim.dist) * view.scale.y + view.y);
      particles.burst(sx(ev.x), sy(ev.y, sim.dist) - 60, 0xff9a3c, 60);
      freeze = Math.max(freeze, FEEL.hitStop.boss);
      sfx.play('boom', { pitch: 0.6 });
      boss.visible = false;
      break;
    case 'bossReached':
      shake(shakeEl, 'boss');
      hurt(1);
      break;
  }
}

// --- Per-frame view sync (render only) ---
function syncView(dt) {
  const sim = rec.sim, dist = sim.dist;
  road.tilePosition.y = dist % ROAD_TILE.h;

  // Gates (and the posts of each row)
  for (const g of sim.gates) {
    const y = sy(g.y, dist);
    let v = gateViews.get(g.id);
    const visible = !g.used && y > -80 && y < VIEW_H + 60;
    if (visible && !v) { v = buildGate(g); gateViews.set(g.id, v); }
    if (v) {
      if (!visible) { v.c.destroy({ children: true }); v.t.destroy(); v.pips.destroy(); gateViews.delete(g.id); continue; }
      v.c.y = y;
      v.t.y = y - 8;
      v.pips.y = y + 20;
      if (v.hits !== g.hits) {
        v.hits = g.hits;
        v.t.text = gateText(g);
        v.p.tint = gateTint(g);
        v.pips.text = pipText(g);
        v.pips.tint = v.t.tint = g.hits >= RULES.pumpMax ? 0xffe27a : 0xffffff;
      }
    }
    if (g.side === 0) {
      let r = postRows.get(g.id);
      if (visible && !r) { r = buildPosts(g.y); postRows.set(g.id, r); }
      if (r) {
        if (!visible) { r.posts.forEach(p => p.destroy()); postRows.delete(g.id); }
        else r.posts.forEach(p => { p.y = y + 30; });
      }
    }
  }
  // Barrels
  for (const br of sim.barrels) {
    const y = sy(br.y, dist);
    let v = barrelViews.get(br.id);
    const visible = br.hp > 0 && y > -80 && y < VIEW_H + 80;
    if (visible && !v) {
      const c = new Container();
      const s = new Sprite({ texture: art.barrel, anchor: 0.5 });
      const t = label(String(br.hp), br.hp >= 1000 ? 30 : 36);
      const reward = label(br.reward === 'weapon' ? 'Lv+' : `+${br.amount}`, 26);   // the prize is printed on the barrel (spec §13 #3)
      reward.tint = 0xffe27a;
      c.addChild(s);
      barrelLayer.addChild(c);
      labelLayer.addChild(t, reward);
      v = { c, t, reward, hp: br.hp };
      barrelViews.set(br.id, v);
    }
    if (v) {
      if (!visible) { v.c.destroy({ children: true }); v.t.destroy(); v.reward.destroy(); barrelViews.delete(br.id); continue; }
      v.c.position.set(sx(br.x), y);
      v.t.position.set(sx(br.x), y - 52);
      v.reward.position.set(sx(br.x), y + 2);
      if (v.hp !== br.hp) { v.hp = br.hp; v.t.text = String(br.hp); }
    }
  }
  // Zombies
  for (const z of sim.zombies) {
    const y = sy(z.y, dist);
    let v = zombieViews.get(z.id);
    const visible = z.hp > 0 && z.active && y > -60 && y < VIEW_H + 60;
    if (visible && !v) {
      v = new Sprite({ texture: z.armored ? art.armored : art.zombie, anchor: { x: 0.5, y: 0.8 } });
      v.scale.set(1.4);
      zombieLayer.addChild(v);
      zombieViews.set(z.id, v);
    }
    if (v) {
      if (!visible) { v.destroy(); zombieViews.delete(z.id); continue; }
      v.position.set(sx(z.x), y);
      v.rotation = Math.sin((performance.now() / 180) + z.id) * 0.12;
    }
  }
  // Boss
  bossEl.style.opacity = sim.boss.active && sim.boss.hp > 0 ? 1 : 0;
  if (sim.boss.active && sim.boss.hp > 0) {
    boss.visible = true;
    boss.position.set(sx(sim.boss.x), sy(sim.boss.y, dist));
    boss.tint = bossFlash > 0 ? 0xff8080 : 0xffffff;
    bossFlash -= dt;
    bossBar.style.transform = `scaleX(${sim.boss.hp / sim.boss.maxHp})`;
  }
  // Squad: up to MAX_SOLDIERS sprites on a sunflower spiral inside the formation half-width
  const n = Math.min(sim.troops, MAX_SOLDIERS), hw = halfWidth(sim.troops);
  const cx = sx(sim.sx), t = performance.now() / 90;
  for (let i = 0; i < MAX_SOLDIERS; i++) {
    const s = soldiers[i];
    if (i >= n) { s.visible = false; continue; }
    const r = hw * Math.sqrt((i + 0.5) / n), a = i * 2.39996;
    s.visible = true;
    s.position.set(cx + Math.cos(a) * r, SQUAD_Y + Math.sin(a) * r * 0.6 + Math.abs(Math.sin(t + i)) * -2);
  }
  squadShadow.position.set(cx, SQUAD_Y + 6);
  squadShadow.scale.set(Math.max(1, hw / 18), Math.max(1, hw / 28));
  squadLabel.text = String(sim.troops);
  squadLabel.position.set(cx, SQUAD_Y - hw * 0.6 - 48);
  // Bullets (pooled sprites, additive layer)
  while (bulletPool.length < sim.bullets.length) {
    const s = new Sprite({ texture: art.bullet, anchor: 0.5 });
    bulletLayer.addChild(s);
    bulletPool.push(s);
  }
  for (let i = 0; i < bulletPool.length; i++) {
    const s = bulletPool[i], b = sim.bullets[i];
    s.visible = !!b;
    if (b) s.position.set(sx(b.x), sy(b.y, dist));
  }
  // HUD
  scoreEl.textContent = sim.score;
  if (weaponEl.dataset.lv !== String(sim.weapon)) { weaponEl.dataset.lv = sim.weapon; weaponEl.textContent = `武器 Lv${sim.weapon}`; }
  progressEl.style.width = `${Math.min(100, (dist / BOSS_STOP) * 100)}%`;
}

// --- Loop: fixed 60 Hz sim, render at display rate ---
let lastFrame = performance.now();
app.ticker.add(t => {
  const dt = t.deltaMS / 1000;
  if (state === 'play') {
    const now = performance.now();
    if (now - lastFrame > 250) clock.skip(now - lastFrame - TICK_MS);   // hidden tab / long hitch: pause, don't fast-forward
    lastFrame = now;
    const upTo = clock.targetTick(now);
    while (rec.phase === 'play' && rec.sim.tick <= upTo) {
      rec.step(encodeX(steer.sample(rec.sim.tick)));
      for (const ev of rec.sim.events) playJuice(ev, rec.sim);
      if (rec.phase === 'over') { finish(); break; }
    }
  } else lastFrame = performance.now();
  if (rec) syncView(dt);
  if (freeze > 0) { freeze -= dt; return; }                 // render-only hit-stop; sim kept stepping above
  particles.update(dt);
});

clearViews();
rec = new Recorder(GAME, SEED);
showTitle();

if (import.meta.env.DEV) window.__game = { app, sfx, start, finish, get rec() { return rec; } };   // console inspection only
