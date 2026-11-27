// BladeOath boot: Pixi app + fixed-step sim loop + render-only juice (gdd/05 §11).
// The match is recorded by core/Recorder (input bytes + shrine choices) and re-verified on device at the end.
import { loadActors } from './render/actors.js';
import { loadProps } from './render/scenery.js';
import { loadCel } from './render/cel.js';
import { Application } from 'pixi.js';
import { gsap } from 'gsap';
import { Recorder, verify } from './sim/core/index.js';
import { InputClock, TapQueue } from './sim/core/input.js';
import { GAME, TICK_MS, SKILLS, FOES, STAGES, SHRINE_X, FLOOR_TOP, VIEW_W, CH_LEAVE, CH_NODE, CH_SLOT, encodeInput, scoreBreakdown } from './sim/sim.js';
import { FEEL } from './fx/feel.js';
import { shake } from './fx/shake.js';
import { hurt, flash } from './fx/overlay.js';
import { Particles } from './fx/particles.js';
import { WorldView } from './render/world.js';
import { Controls } from './ui/controls.js';
import { Hud, Panel, startPanel, shrinePanel, routePanel, endPanel, settingsRow, announce } from './ui/hud.js';
import { Sfx } from './audio/sfx.js';
import { PlaytestLog } from './ui/playtestLog.js';

// --- GSAP global settings (references/gsap.md §1) ---
gsap.defaults({ duration: 0.25, ease: 'power2.out', overwrite: 'auto' });
gsap.config({ force3D: true, nullTargetWarn: import.meta.env.DEV });
gsap.ticker.lagSmoothing(500, 33);
// Effects level = system reduced-motion OR the in-game "降低特效" switch (UX #9); the switches persist per device.
const PREFS_KEY = 'blade-oath.prefs';
const prefs = { low: false, cancelHint: true };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); } catch { /* storage blocked: defaults */ }
let reducedMotion = false;
function applyFeel() { FEEL.enabled = !(reducedMotion || prefs.low); FEEL.cancelHint = !!prefs.cancelHint; }
function togglePref(key) {
  prefs[key] = !prefs[key]; applyFeel();
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* not saved; still applies this session */ }
  return prefs;
}
gsap.matchMedia().add('(prefers-reduced-motion: reduce)', () => { reducedMotion = true; applyFeel(); return () => { reducedMotion = false; applyFeel(); }; });
applyFeel();

// --- Pixi ---
const stage = document.getElementById('stage');
const shakeEl = document.getElementById('stage-shake');
const fxEl = document.getElementById('fx');
const app = new Application();
await app.init({ preference: 'webgl', resizeTo: stage, backgroundColor: 0x0c0f14, antialias: false, autoDensity: true,
  resolution: Math.min(devicePixelRatio, 2), roundPixels: true });
shakeEl.appendChild(app.canvas);
const world = new WorldView(app, await loadActors(), await loadProps(), await loadCel());
// Touch layout: the button pad sits over the bottom-right of the view, so frame the player left/up of centre (UX #2).
const coarse = matchMedia('(pointer: coarse)');
const frame = () => { world.bias.x = coarse.matches ? FEEL.camBias.x : 0; world.bias.y = coarse.matches ? FEEL.camBias.y : 0; };
coarse.addEventListener?.('change', frame); frame();
document.documentElement.style.setProperty('--pad-idle', String(FEEL.padIdle));
const particles = new Particles(app.renderer);
world.camera.addChild(particles.view);

// --- HUD, controls, panels ---
const hudEl = document.getElementById('hud');
const hud = new Hud(hudEl);
const panel = new Panel();
const sfx = new Sfx();
const SEED = Number(new URLSearchParams(location.search).get('seed')) || 20261124;
let rec, clock, taps, mode = 'title', panelAt = 0, pauses = 0;
// --- Human playtest mode (N9): ?playtest=1&tester=<name> keeps every finished match for export; nothing is sent ---
const query = new URLSearchParams(location.search);
const playtest = new PlaytestLog(query.get('playtest') ? (query.get('tester') || 'anon').replace(/[^\w一-鿿-]/g, '').slice(0, 24) || 'anon' : '');

hud.pauseEl.addEventListener('click', () => { sfx.unlock(); togglePause(); });
const controls = new Controls(hudEl, stage, {
  onAction: (act, ts) => { if (mode === 'play') taps.push(ts, { act }); },
  toWorld: (x, y) => { const r = app.canvas.getBoundingClientRect(); return world.toWorld(x - r.left, y - r.top); },
  onGesture: () => sfx.unlock(),
  uiOpen: () => panel.open,
});
let leaveShrine = null;
addEventListener('keydown', e => {
  if (e.code === 'KeyM') sfx.setMuted(!sfx.muted);
  if (e.code !== 'Escape') return;
  if (mode === 'choice' && leaveShrine) leaveShrine();   // Esc leaves the shrine (UX #10)
  else togglePause();
});

// Wind-up glyphs (UX #1): the glyph names the answer, matching the button label — 擋 white, 斷 gold, 閃 red.
// (A hollow diamond for white was dropped: it read as the lock-on marker right under it.) DOM over the canvas = 0 draw calls.
const GLYPH = [['w', '擋'], ['g', '斷'], ['r', '閃']];
const markPool = [];
function drawMarks() {
  const ms = mode === 'play' ? world.marks : [];
  while (markPool.length < ms.length) { const n = document.createElement('div'); n.className = 'mark'; fxEl.append(n); markPool.push(n); }
  markPool.forEach((n, i) => {
    const m = ms[i];
    if (!m) { n.hidden = true; return; }
    const s = world.toScreen(m.x, m.y), [cls, ch] = GLYPH[m.glow];
    n.hidden = false; n.className = `mark ${cls}`; if (n.textContent !== ch) n.textContent = ch;
    n.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -100%)`;
  });
}

// Wayfinding (A3, A5): name tags over unlocked shrines on screen; edge arrows to the nearest unlocked shrine and the next
// boss when they are off screen. DOM over the canvas, render only.
const PAUSES = 3;
const beaconPool = [];
function beacons(list) {
  while (beaconPool.length < list.length) { const n = document.createElement('div'); n.innerHTML = '<i></i><span></span>'; fxEl.append(n); beaconPool.push(n); }
  beaconPool.forEach((n, i) => {
    const b = list[i];
    if (!b) { n.hidden = true; return; }
    n.hidden = false; n.className = `beacon ${b.kind}`;
    const lab = n.lastChild; if (lab.textContent !== b.label) lab.textContent = b.label;
    n.firstChild.style.display = b.ang === undefined ? 'none' : '';
    n.style.flexDirection = b.ang !== undefined && Math.cos(b.ang) > 0 ? 'row-reverse' : '';   // label on the inner side of the arrow
    if (b.ang !== undefined) n.firstChild.style.transform = `rotate(${b.ang}rad)`;
    n.style.transform = `translate(${Math.round(b.x)}px, ${Math.round(b.y)}px) translate(-50%, -100%)`;
  });
}
function wayfind(sim) {
  if (mode !== 'play') { beacons([]); return; }
  const out = [], st = STAGES[sim.stage];
  // the sword mound at the stage start while it is on screen; a "go" arrow on the right edge when the way is open
  const m = world.toScreen(SHRINE_X, FLOOR_TOP - 4);
  if (m.x > 20 && m.x < app.screen.width - 20) out.push({ kind: 'shrine', label: '劍塚', x: m.x, y: m.y });
  const clear = !sim.waveOn && !sim.foes.some(f => f.alive && f.on && f.wait === 0 && Math.abs(f.x - sim.p.x) < VIEW_W * 256);
  if (clear && sim.p.x < (st.len - 60) * 256 && sim.tick % 60 < 40) {
    const s = world.toScreen(sim.cam / 256 + VIEW_W - 24, FLOOR_TOP + 40);
    out.push({ kind: 'boss', label: '前進', x: s.x, y: s.y, ang: 0 });
  }
  beacons(out);
}

if (import.meta.env.DEV && new URLSearchParams(location.search).has('debug')) {   // DC / FPS readout only with ?debug (A9)
  hud.dcEl.hidden = false;
  const { drawCallCounter } = await import('./debug/drawCalls.js');
  const dc = drawCallCounter(app);
  setInterval(() => { hud.dcEl.textContent = `DC ${dc()}  FPS ${app.ticker.FPS.toFixed(0)}`; }, 250);
}

// --- Juice: driven by sim events, never feeds back into sim ---
let freeze = 0;
const at = id => { const f = id >= 0 ? rec.sim.foes[id] : rec.sim.p; return world.toScreen(f.x / 256, FLOOR_TOP + (f.y - f.z) / 256 - 20); };
function pop(text, pos, color = '#e9e4d8', size = 22) {
  const n = document.createElement('div');
  n.className = 'pop'; n.textContent = text; n.style.color = color; n.style.fontSize = `${size}px`;
  n.style.left = `${pos.x}px`; n.style.top = `${pos.y}px`;
  fxEl.append(n);
  gsap.to(n, { y: -FEEL.popup.rise, opacity: 0, duration: FEEL.popup.dur, ease: FEEL.popup.ease, onComplete: () => n.remove() });
}
const stop = kind => { if (FEEL.enabled) freeze = Math.max(freeze, FEEL.hitStop[kind]); };
const burst = (id, tint, n) => { const f = id >= 0 ? rec.sim.foes[id] : rec.sim.p; particles.burst(f.x / 256, FLOOR_TOP + (f.y - f.z) / 256 - 10, tint, n); };
const dirAng = d => (d === undefined ? undefined : d > 0 ? 0 : 128);

function playJuice(ev) {
  switch (ev.type) {
    case 'windup': if (ev.glow === 1) sfx.play('windupGold'); else if (ev.glow === 2) sfx.play('windupRed'); break;
    case 'swing': if (ev.who === -1) sfx.play('swing', { gain: 0.7 }); break;
    case 'hitFoe': sfx.play('slash'); shake(shakeEl, ev.force >= 120 ? 'crit' : 'light'); stop(ev.force >= 120 ? 'crit' : 'light'); burst(ev.id, 0xe9e4d8, 8); world.flashRig(ev.id); world.kick(dirAng(ev.dir), FEEL.camera.kick); if (ev.back) pop('背', at(ev.id), '#d8923a', 16); break;
    case 'parry': sfx.play('parry'); shake(shakeEl, 'crit'); stop('crit'); burst(ev.id, FEEL.colors.parry, 22); pop('卸', at(-1), '#fff3c4', 26); break;
    case 'block': sfx.play('block'); burst(-1, 0x9aa3a8, 6); pop('擋', at(-1), '#9aa3a8', 15); break;   // A12
    case 'deflect': sfx.play('deflect'); pop('彈', at(-1), '#9aa3a8'); break;
    case 'hurt': sfx.play('hurt'); hurt(0.8); shake(shakeEl, 'crit'); burst(-1, FEEL.colors.hurt, 12); world.flashRig(-1); world.kick(dirAng(ev.dir), FEEL.camera.kick); break;
    case 'clash': sfx.play('parry', { pitch: 0.8 }); shake(shakeEl, 'crit'); stop('crit'); burst(ev.b, 0xfff3c4, 18); pop('拼', at(ev.b), '#fff3c4', 24); break;
    case 'slam': sfx.play('execute', { pitch: 1.4, gain: 0.7 }); shake(shakeEl, 'boss'); stop('crit'); { const f = ev.who >= 0 ? rec.sim.foes[ev.who] : rec.sim.p; world.crack(f.x / 256, FLOOR_TOP + f.y / 256); } pop('撞壁', at(ev.who), '#d8923a', 20); break;
    case 'stagger': world.flashRig(ev.who); break;
    case 'launch': sfx.play('hurt', { pitch: 0.7 }); break;
    case 'land': shake(shakeEl, 'light'); burst(-1, 0x9a8f7a, 10); break;
    case 'cancelOpen': if (FEEL.enabled && FEEL.cancelHint) world.flashRig(-1); break;
    case 'dodge': sfx.play('dodge'); break;
    case 'perfectDodge': {
      sfx.play('perfect'); pop('閃', at(-1), '#9fd6e0', 26);
      const g = world.ghost(); gsap.to(g, { alpha: 0, duration: FEEL.ghost.dur, onComplete: () => g.destroy() });
      break;
    }
    case 'interrupt': sfx.play('interrupt'); shake(shakeEl, 'crit'); stop('crit'); burst(ev.id, FEEL.colors.gold, 26); pop('斷', at(ev.id), '#e3b34a', 30); break;
    case 'broken':
      sfx.play('broken');
      if (ev.id === -1) { shake(shakeEl, 'boss'); hurt(1); pop('破防', at(-1), '#e0503c'); }
      else pop('破', at(ev.id), '#d8923a', 28);
      break;
    case 'execute': sfx.play('execute'); shake(shakeEl, 'boss'); stop('boss'); flash(); burst(ev.id, 0xffffff, 40); pop('絕殺', at(ev.id), '#ffffff', 34); break;
    case 'escape': sfx.play('escape'); if (ev.who !== -1) pop('脫', at(ev.who), '#9aa3a8'); break;
    case 'kill': sfx.play('kill'); burst(ev.id, 0x6f6a80, 14); if (ev.xp) pop(`+${ev.xp}`, at(ev.id), '#b9c9a0', 15); break;
    case 'bossRoom': sfx.play('boss'); hud.toast(FOES[rec.sim.foes[ev.id].type].name, '#e0503c'); break;
    case 'bossPhase': sfx.play('boss'); shake(shakeEl, 'boss'); hud.toast('墮仙・二', '#e0503c'); break;
    case 'bossDown': hud.toast('頭目斬落', '#e3b34a'); break;
    case 'down': hurt(1); hud.toast('倒下', '#c8423a'); break;
    case 'respawn': hud.toast('回到劍塚：這一關重來'); sfx.play('rest'); break;
    case 'pickup': sfx.play('pickup'); pop(['氣血 +30', '內力 +30', '鍛材 +1'][ev.kind], at(-1), '#b9c9a0', 15); break;
    case 'jump': sfx.play('dodge', { pitch: 1.2, gain: 0.6 }); break;
    case 'grab': sfx.play('block'); pop('抓', at(-1), '#d8923a', 18); break;
    case 'knee': sfx.play('slash', { gain: 0.6 }); burst(ev.id, 0xe9e4d8, 5); world.flashRig(ev.id); break;
    case 'throw': sfx.play('execute', { pitch: 1.3, gain: 0.6 }); shake(shakeEl, 'crit'); pop('摔', at(ev.id), '#d8923a', 22); break;
    case 'breakFree': pop('掙脫', at(-1), '#9aa3a8', 14); break;
    case 'propBreak': sfx.play('deflect', { pitch: 0.7 }); { const pr = rec.sim.props[ev.prop]; particles.burst(pr.x / 256, FLOOR_TOP + pr.y / 256 - 6, 0x8a6a48, 12); } break;
    case 'waveLock': hud.toast('敵人來襲', '#c8423a'); break;
    case 'go': hud.toast('前進 →', '#e9e4d8'); break;
    case 'stageEnter': hud.toast(STAGES[ev.stage].name, '#f0a040'); break;
    case 'chest': sfx.play('pickup'); pop(`鍛材 +${ev.ore}`, at(-1), '#e3b34a', 16); break;
    case 'rest': sfx.play('rest'); break;
    case 'levelUp': sfx.play('levelUp'); break;
  }
}

// --- Match ---
function start() {
  sfx.unlock(); sfx.play('click');
  rec = new Recorder(GAME, SEED);
  clock = new InputClock(performance.now(), 0, TICK_MS);
  taps = new TapQueue(clock, 8);
  pauses = 0; mode = 'play'; panel.hide();
  world.cam.init = false;
  hud.toast('往右走；劍塚在身後可以休息', '#f0a040');   // A3: first goal
}
function openShrine() {
  mode = 'choice'; panelAt = performance.now();
  const refresh = ok => {
    if (ok === false) sfx.play('deny'); else sfx.play('click');
    if (rec.phase === 'choice') shrinePanel(panel, rec.sim, choose, refresh);
    else { leaveShrine = null; panel.hide(); clock.skip(performance.now() - panelAt); mode = 'play'; }   // panel time is not match time
  };
  if (rec.sim.panel === 2) { leaveShrine = null; routePanel(panel, i => refresh(rec.choose(i))); return; }   // the fork after the gate
  leaveShrine = () => refresh(rec.choose(CH_LEAVE));
  shrinePanel(panel, rec.sim, choose, refresh);
}
// A7: unlocking a sword skill also puts it in the first empty slot. That is one more logged choice, same as the player's tap.
function choose(i) {
  const ok = rec.choose(i), p = rec.sim.p, skill = i - CH_NODE - 6;
  if (ok !== false && skill >= 2 && skill < SKILLS.length && !p.slots.includes(skill)) {
    const empty = p.slots.indexOf(-1);
    if (empty >= 0 && rec.choose(CH_SLOT + empty * 8 + skill) !== false) announce(`${SKILLS[skill].name}放進第 ${empty + 1} 格`);
  }
  return ok;
}
function finish() {
  mode = 'over';
  const up = rec.upload(), v = verify(GAME, up), b = scoreBreakdown(rec.sim);
  playtest.add(up, { ...b, score: GAME.score(rec.sim), bossDown: rec.sim.bossDown, verified: v.valid });
  const pt = playtest.enabled ? { label: `匯出試玩紀錄（${playtest.count} 局）`, note: `試玩者：${playtest.tester}・紀錄只存在這台裝置，按匯出後把檔案交回`, onExport: () => playtest.download() } : null;
  endPanel(panel, rec.sim, b, v.valid ? `重播驗證 ✓（題目 #${SEED}，${rec.ticks} tick）` : `重播驗證失敗：${v.reason}`, start, pt);
}
function togglePause() {
  if (mode === 'play' && pauses >= PAUSES) { hud.toast('暫停次數已用完', '#9aa3a8'); return; }   // A11
  if (mode === 'play') {
    mode = 'paused'; pauses++; panelAt = performance.now();
    panel.show(c => {
      c.innerHTML = `<h1>暫停</h1><p>本局還能暫停 ${PAUSES - pauses} 次。暫停時畫面遮住。</p><h2>設定</h2>`;
      c.append(settingsRow(prefs, togglePref));
      const b = document.createElement('button'); b.className = 'btn primary'; b.type = 'button'; b.textContent = '繼續（Esc）'; b.onclick = togglePause;
      const row = document.createElement('div'); row.className = 'cta'; row.append(b); c.append(row);
    });
    panel.el.style.background = '#05070a';
  } else if (mode === 'paused') {
    panel.hide(); panel.el.style.background = ''; clock.skip(performance.now() - panelAt); mode = 'play';
  }
}

// --- Loop: fixed 60 Hz sim, render at display rate ---
rec = new Recorder(GAME, SEED);
startPanel(panel, SEED, start, prefs, togglePref);
let lastFrame = performance.now();
app.ticker.add(t => {
  const now = performance.now();
  if (mode === 'play') {
    if (now - lastFrame > 250) clock.skip(now - lastFrame - TICK_MS);   // hidden tab / long hitch: pause, don't fast-forward
    const upTo = clock.targetTick(now);
    while (rec.phase === 'play' && rec.sim.tick <= upTo) {
      const tap = taps.take(rec.sim.tick), p = rec.sim.p;
      rec.step(encodeInput(controls.direction(p.x / 256, FLOOR_TOP + p.y / 256), tap?.data.act ?? 0));
      for (const ev of rec.sim.events) playJuice(ev);
      if (rec.phase === 'choice') { openShrine(); break; }
      if (rec.phase === 'over') { finish(); break; }
    }
    if (mode === 'play' && rec.phase === 'choice') openShrine();   // a shrine opened outside the loop above
    else if (mode === 'play' && rec.phase === 'over') finish();
  }
  lastFrame = now;
  const sim = rec.sim, p = sim.p;
  const dt = t.deltaMS / 1000;
  world.update(sim, freeze > 0, dt);
  hud.update(sim, GAME.score(sim));
  controls.update(sim, p.slots.map(s => (s >= 0 ? SKILLS[s].name : '')));
  const stc = STAGES[sim.stage].chest;
  const shrine = Math.abs(p.x - SHRINE_X * 256) <= 32 * 256;
  const chest = stc && !(sim.opened & 1) && Math.abs(p.x - stc.x * 256) <= 32 * 256 && Math.abs(p.y - stc.y * 256) <= 32 * 256;
  controls.showInteract(mode === 'play' && !!(shrine || chest), shrine ? '劍塚' : '開箱');
  drawMarks();
  wayfind(sim);
  hud.pauseButton(mode === 'play', PAUSES - pauses);
  if (mode === 'play') {
    const pts = [world.toScreen(p.x / 256, FLOOR_TOP + p.y / 256 - 12)];
    for (const f of sim.foes) if (f.alive && f.on) pts.push(world.toScreen(f.x / 256, FLOOR_TOP + f.y / 256 - 12));
    hud.fadeBars(pts);
  }
  if (freeze > 0) { freeze -= dt; return; }                 // render-only hit-stop; the sim kept stepping above
  particles.update(dt);
});

if (import.meta.env.DEV) window.__game = { app, world, get rec() { return rec; }, controls, sfx, playtest };   // console inspection only
