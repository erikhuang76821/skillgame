// Boot: Pixi app + fixed-step sim loop + render-only juice (spec §11). The match is recorded by core/Recorder and
// re-verified on device at the end (the same check a server would run). Nothing in this file can change a score:
// it only turns what the player does into one input byte per tick and plays effects from the sim's events.
import { Application } from 'pixi.js';
import { gsap } from 'gsap';
import { Recorder, verify, ONE } from './sim/core/index.js';
import { InputClock } from './sim/core/input.js';
import { GAME, TICK_MS, SCRIPT, SHIELDS, KIND, BOSS_SLOTS, GEAR, UPGRADE, CHAPTERS, CHAPTER_FROM, UNIT_TICKS, GEAR_MAX_LV, WORLD_W, WORLD_H, OBST_R, RAPID, BARRIER, SPREAD, LASER, WINGMAN, PIERCE, HEAVY, THRUSTERS, isBoss, isMid, shieldMax, clock as scriptClock, sectionAt, scoreBreakdown } from './sim/sim.js';
import { GAME6 } from './sim/leg6.js';
import { GAME2 } from './sim/leg2.js';
import { GAME3 } from './sim/leg3.js';
import { GAME4 } from './sim/leg4.js';
import { GAME5 } from './sim/leg5.js';
import { LEGS } from './ui/map.js';
import { choiceView, buildOf, dropName } from './ui/cards.js';
import { FEEL } from './fx/feel.js';
import { shake } from './fx/shake.js';
import { hurt, flash } from './fx/overlay.js';
import { View } from './render/view.js';
import { Sfx, comboPitch } from './audio/sfx.js';
import { CLIPS } from './audio/clips.js';
import { Music } from './audio/music.js';
import { hud } from './ui/hud.js';
import { stageMap } from './ui/map.js';
import { playIntro, INTROS } from './ui/intro.js';
import { PlaytestLog } from './ui/playtestLog.js';
import { hydrateForms } from './render/formsSheets.js';

const q = new URLSearchParams(location.search);
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage may be blocked */ } } };

// --- GSAP global settings (references/gsap.md §1) ---
gsap.defaults({ duration: 0.25, ease: 'power2.out', overwrite: 'auto' });
gsap.config({ force3D: true, nullTargetWarn: import.meta.env.DEV });
gsap.ticker.lagSmoothing(500, 33);

// --- low effects: the system's reduced-motion setting picks the default, the in-game switch overrides it either way.
// (Phones often report reduced motion, e.g. Android's battery saver or "remove animations"; that must not lock the
// switch on low.) Stored as '1' low, '0' full, nothing = follow the system.
const lowSaved = store.get('sky-talon-low');
let lowChosen = lowSaved === '1' ? true : lowSaved === '0' ? false : null;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const applyLow = () => { FEEL.enabled = !(lowChosen ?? reduced.matches); };
reduced.addEventListener('change', () => { applyLow(); hud.toggles({ muted: sfx.muted, low: !FEEL.enabled }); });

// --- Pixi ---
const stage = document.getElementById('stage');
const shakeEl = document.getElementById('stage-shake');
const frameEl = document.getElementById('frame');
const app = new Application();
await app.init({ preference: 'webgl', resizeTo: stage, backgroundColor: 0x14121c, antialias: false, autoDensity: true, resolution: Math.min(devicePixelRatio, 2), roundPixels: true });
shakeEl.appendChild(app.canvas);
await hydrateForms();                                      // the sprite sheets (PNG) back into rows before the atlases are built
const view = new View(app);
function layout() {
  const r = view.layout();
  Object.assign(frameEl.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
}
layout();
app.renderer.on('resize', layout);

const sfx = new Sfx();
const panAt = x => ((x ?? 360) / 360 - 1) * 0.7;          // field x (world px) -> stereo pan, never hard left or right
sfx.clipSource = CLIPS;                                     // recorded combat clips, decoded on the first gesture
const music = new Music(sfx);                               // synthesised themes, one flight and one boss per leg
applyLow();
hud.toggles({ muted: sfx.muted, low: !FEEL.enabled });
hud.onMute(() => { sfx.unlock(); sfx.setMuted(!sfx.muted); hud.toggles({ muted: sfx.muted, low: !FEEL.enabled }); });
hud.onLow(() => { lowChosen = FEEL.enabled; store.set('sky-talon-low', lowChosen ? '1' : '0'); applyLow(); hud.toggles({ muted: sfx.muted, low: !FEEL.enabled }); });

if (import.meta.env.DEV) {
  const { drawCallCounter } = await import('./debug/drawCalls.js');
  const dc = drawCallCounter(app), dcEl = document.querySelector('#hud .dc');
  dcEl.hidden = false;
  setInterval(() => { dcEl.textContent = `DC ${dc()}  FPS ${app.ticker.FPS.toFixed(0)}`; }, 250);
}

// --- Input (spec §2): one direction code per tick. Keys and touch produce the same nine values. ---
// Direction codes follow core DX/DY: 1 down, 2 down-right, 3 right, 4 up-right, 5 up, 6 up-left, 7 left, 8 down-left.
const CODE = [[6, 5, 4], [7, 0, 3], [8, 1, 2]];             // [dy + 1][dx + 1]
const keys = new Set();
const KEY_DIR = { ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0], ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1] };
// A virtual stick: pressing anywhere on the play field puts the stick's centre there; dragging away from it steers in
// that direction (one of eight, by 45-degree sectors), and letting go stops. The ship does not follow the finger, so the
// finger never covers it (E3). Screen px, so it feels the same on every screen size.
let pointer = null;                                         // { ox, oy, x, y } client px while a finger / button is down
let pace = 0, paceAcc = 0;                                  // the current pace (0..1) and the error carried between ticks
const stick = document.createElement('div');
stick.className = 'stick'; stick.hidden = true; stick.innerHTML = '<i></i>';
document.body.append(stick);
function showStick() {
  if (!pointer) { stick.hidden = true; return; }
  const R = FEEL.steer.reach, dx = pointer.x - pointer.ox, dy = pointer.y - pointer.oy, m = Math.hypot(dx, dy), k = m > R ? R / m : 1;
  stick.hidden = false;
  stick.style.left = `${pointer.ox}px`; stick.style.top = `${pointer.oy}px`;
  stick.firstChild.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
}
// One tick's direction code. A small push of the stick flies slower than a full one, and every start builds up speed:
// the pace (0..1) is spread over the ticks by carrying the remainder (a pace of 0.5 steers every other tick), so what
// the sim records stays one of the nine codes and a replay is unchanged.
function directionCode() {
  const S = FEEL.steer;
  let dx = 0, dy = 0, want = 0;
  for (const k of keys) { const d = KEY_DIR[k]; if (d) { dx += d[0]; dy += d[1]; } }
  if (dx || dy) want = 1;
  else if (pointer) {
    const tx = pointer.x - pointer.ox, ty = pointer.y - pointer.oy, m = Math.hypot(tx, ty);
    if (m > S.dead) {
      const a = Math.round(Math.atan2(ty, tx) / (Math.PI / 4)) * (Math.PI / 4);
      dx = Math.round(Math.cos(a)); dy = Math.round(Math.sin(a));
      want = S.min + (1 - S.min) * Math.pow(Math.min(1, (m - S.dead) / (S.full - S.dead)), S.curve);
    }
  }
  if (!want) { pace = 0; paceAcc = 0; return 0; }
  pace = pace === 0 ? Math.min(want, S.start) : pace < want ? Math.min(want, pace + S.accel) : want;
  paceAcc += pace;
  if (paceAcc < 1) return 0;
  paceAcc -= 1;
  return CODE[Math.sign(dy) + 1][Math.sign(dx) + 1];
}
addEventListener('keydown', e => {
  sfx.unlock();
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === 'm') { sfx.setMuted(!sfx.muted); hud.toggles({ muted: sfx.muted, low: !FEEL.enabled }); return; }
  if (k === 'Escape' || k === 'p') { setPause(!paused); return; }
  if (paused) return;
  if (pickOpen && (k === '1' || k === '2' || k === '3')) { takePick(Number(k) - 1); return; }
  if (KEY_DIR[k]) { keys.add(k); e.preventDefault(); }
  if (state === 'title' && !introOn && (KEY_DIR[k] || k === ' ' || k === 'Enter')) start();
});
addEventListener('keyup', e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
addEventListener('blur', () => { keys.clear(); pointer = null; });
// the stage map's quiet theme: after the opening, on the way back from a match, or at the first tap when the opening was skipped
addEventListener('pointerdown', () => { if (state === 'title' && !introOn && !music.theme) { sfx.unlock(); music.play('menu'); } });
stage.addEventListener('pointerdown', e => {
  sfx.unlock();
  if (state === 'play' && !paused) {
    pointer = { ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
    showStick();
    try { stage.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone; steering still works */ }
  }
});
frameEl.querySelector('#panel-title').style.pointerEvents = 'auto';
// the start layer is a stage map: a leg that is open starts the match; everything else only scrolls
// every leg opens with its departure cutscene, skippable, every time it is entered from the map
let introOn = false;
const map = stageMap(frameEl.querySelector('#map'), i => {
  sfx.unlock();
  if (state !== 'title' || introOn) return;
  game = { 2: GAME2, 3: GAME3, 4: GAME4, 5: GAME5, 6: GAME6 }[LEGS[i].leg] ?? GAME;
  const n = LEGS[i].leg ?? 1;
  music.play(`leg${n}`);                                    // the leg's theme starts with its cutscene and runs on into the match
  if (!INTROS[n]) { start(); return; }
  introOn = true;
  playIntro(n, { onReveal: () => { if (state === 'title') start(); } }).then(() => { introOn = false; });
});
const LEGS_KEY = 'sky-talon-legs-cleared';                  // how many legs have been flown to the end (kept on this device only)
// dev only: ?unlock=N marks the first N legs as flown (?unlock=0 puts the map back to new); ?unlock alone opens them all
if (import.meta.env.DEV && new URLSearchParams(location.search).has('unlock')) { const v = new URLSearchParams(location.search).get('unlock'); store.set(LEGS_KEY, String(v === '' ? 9 : Math.max(0, Number(v) || 0))); }
// the best score on each leg (any seed), kept on this device only, shown on the map
const legBestKey = i => `sky-talon-leg-best-${i}`;
const refreshMap = () => map.refresh(Number(store.get(LEGS_KEY) || 0), LEGS.map((_, i) => Number(store.get(legBestKey(i))) || 0));
refreshMap();
stage.addEventListener('pointermove', e => { if (pointer) { pointer.x = e.clientX; pointer.y = e.clientY; showStick(); } });
for (const t of ['pointerup', 'pointercancel']) stage.addEventListener(t, () => { pointer = null; showStick(); });
document.getElementById('btn-retry').addEventListener('click', () => { sfx.unlock(); sfx.play('click'); start(); });
// another stage: back to the stage map (the next seed is ready there), not straight into a match
document.getElementById('btn-next').addEventListener('click', () => {
  sfx.unlock(); sfx.play('click'); seed = (seed + 1) >>> 0; music.play('menu');
  rec = new Recorder(game, seed); view.clearFx(); pointer = null; pickOpen = false; resumeAt = 0;
  hud.result(null); hud.pick(null); hud.reset(SHIELDS); hud.title(true); state = 'title'; map.toStart();
});
// a leg flown to the end: back to the stage map, which points at the leg that has just opened
document.getElementById('btn-home').addEventListener('click', () => {
  sfx.unlock(); sfx.play('click');
  document.getElementById('btn-next').click();
  map.guide(legIndex() + 1);
});
/** Where the flown leg is on the stage map. */
const legNo = () => LEGS[legIndex()]?.leg ?? 1;
const legIndex = () => LEGS.findIndex(l => (l.leg ?? 1) === (game === GAME6 ? 6 : game === GAME2 ? 2 : game === GAME3 ? 3 : game === GAME4 ? 4 : game === GAME5 ? 5 : 1));

// --- Human playtest mode (N9): ?playtest=1&tester=<name> keeps every finished match for export; nothing is sent ---
const playtest = new PlaytestLog(q.get('playtest') ? (q.get('tester') || 'anon').replace(/[^\w一-鿿-]/g, '').slice(0, 24) || 'anon' : '');
const exportBtn = document.getElementById('btn-export'), playtestNote = document.querySelector('.playtest-note');
exportBtn.addEventListener('click', () => { sfx.play('click'); playtest.download(); });
function showPlaytest() {
  if (!playtest.enabled) return;
  exportBtn.parentElement.hidden = false; playtestNote.hidden = false;
  exportBtn.textContent = `匯出試玩紀錄（${playtest.count} 局）`;
  playtestNote.textContent = `試玩者：${playtest.tester} · 紀錄只存在這台裝置，按匯出後把檔案交回`;
}

// --- Juice: driven by sim events, never feeds back into the sim ---
let freeze = 0, shotSound = 0;
const clangAt = {};                                         // when armour last made a sound and last showed its note
function playJuice(ev, sim) {
  switch (ev.type) {
    case 'fire':
      view.muzzle(sim);
      if (++shotSound % 2 === 0) sfx.play('shot', { pitch: 0.9 + Math.random() * 0.14, pan: panAt(sim.px / ONE) * 0.6 });   // every other volley; each shot a little higher or lower (render only)
      break;
    case 'hit': view.hitFlash(sim, ev.x, ev.y); sfx.play('hit', { gain: 0.7, pan: panAt(ev.x), room: 0.25, pitch: 0.9 + Math.random() * 0.2 }); break;
    case 'kill':
      view.explode(ev.x, ev.y, isBoss(ev.kind));
      sfx.play('punch', { pan: panAt(ev.x) });                // the impact, at once
      sfx.play('kill', { pitch: 2 ** (Math.min(Math.max(ev.chain - 1, 0), 8) / 24), pan: panAt(ev.x), room: 0.35 });   // the chain lifts it by at most a third: it stays low
      shake(shakeEl, 'light');
      break;
    case 'graze': view.graze(ev.x, ev.y); sfx.play('graze'); break;
    case 'hurt':
      hurt(1); shake(shakeEl, 'crit'); sfx.play('hurt', { pan: panAt(ev.x) * 0.5, room: 0.45 });
      view.explode(ev.x, ev.y);
      freeze = Math.max(freeze, FEEL.hitStop.crit);
      break;
    case 'dive': sfx.play('dive'); break;
    case 'bossIn': hud.banner(names().boss[ev.boss]); sfx.play('warn'); sfx.play('appear'); music.play(`leg${legNo()}boss`); break;
    case 'bossLeave': hud.banner(`${names().boss[ev.boss].split(' ')[0]} 離開了`); break;
    // leg six
    case 'bombUp': sfx.play('dive', { gain: 0.4, pitch: 0.6 }); break;
    case 'bomb': view.bomb(ev.x, ev.y, ev.r); shake(shakeEl, 'light'); sfx.play('boom', { gain: 0.7 }); break;
    case 'weakOpen': hud.note('弱點打開了：現在打'); sfx.play('ring', { pitch: 1.6, gain: 0.8 }); break;
    case 'weakClose': sfx.play('graze', { pitch: 0.5, gain: 0.8 }); break;
    case 'packBonus': hud.note(`整隊擊破 +${ev.pts}`); sfx.play('kill', { pitch: 1.6 }); break;
    case 'stoneRow': shake(shakeEl, 'light'); sfx.play('boom', { gain: 0.5, pitch: 1.5 }); break;
    case 'diveLock': sfx.play('dive', { gain: 0.25, pitch: 1.8 }); break;
    case 'windUp': hud.note(ev.dir > 0 ? '側風：往右吹' : '側風：往左吹'); sfx.play('warn', { gain: 0.5, pitch: 1.5 }); break;
    case 'sweepUp': hud.note('尾掃：繞開，或待在下方'); sfx.play('warn', { gain: 0.6 }); break;
    case 'clawUp': case 'chargeLine': case 'diveLine': sfx.play('dive', { gain: 0.5, pitch: 1.2 }); break;
    case 'claw': shake(shakeEl, 'light'); sfx.play('boom', { gain: 0.5, pitch: 1.8 }); break;
    case 'slowUp': hud.note('減速區：裡面的敵彈會突然恢復速度'); sfx.play('ring', { pitch: 0.6 }); break;
    case 'riftUp': hud.note('裂縫：從兩側往中間射'); sfx.play('warn', { pitch: 0.7 }); break;
    case 'wellUp': hud.note('重力井：雙方的子彈都會被拉彎'); sfx.play('warn', { pitch: 0.5 }); break;
    case 'frillUp': case 'spikeUp': case 'clubUp': case 'ambush': case 'ripple': sfx.play('dive', { gain: 0.3, pitch: 1.5 }); break;
    case 'club': shake(shakeEl, 'light'); sfx.play('boom', { gain: 0.5, pitch: 1.2 }); break;
    case 'neck': case 'spikes': sfx.play('hit', { gain: 0.6, pitch: 0.8 }); break;
    // leg two
    case 'zoneUp': if (ev.k !== 3 || ev.ticks <= 60) sfx.play('dive', { gain: 0.35, pitch: [1.4, 0.8, 1.1, 1.7][ev.k] }); break;
    case 'gapUp': view.markGap(ev.x, ev.w, ev.ticks / 60); break;
    case 'crescent': sfx.play('ring', { pitch: 1.3, gain: 0.6 }); break;
    case 'eyesUp': view.markEyes(ev.eyes, ev.ticks / 60); break;
    case 'swapUp': view.markSwap(ev.x, ev.ticks / 60); hud.note('換邊：另一顆星要來了'); sfx.play('warn', { gain: 0.5, pitch: 1.2 }); break;
    case 'wakeUp': hud.note('恩底彌翁醒了'); sfx.play('warn', { pitch: 1.4 }); break;
    case 'guards': sfx.play('ring', { pitch: 1.8, gain: 0.5 }); break;
    case 'appleUp': hud.note('金蘋果：敵機會搶著去撞'); sfx.play('warn', { gain: 0.6, pitch: 1.6 }); break;
    case 'discord': view.explode(ev.x, ev.y); view.wave(ev.x, ev.y, 1, FEEL.l2.apple); shake(shakeEl, 'light'); sfx.play('kill', { pitch: 1.3 }); break;
    case 'retributionUp': if (ev.n > 0) hud.note(`報應：裝甲擋下的 ${ev.n} 發要還回來了`); sfx.play('warn', { gain: 0.5, pitch: 0.7 }); break;
    case 'retribution': view.pulseBoss(); sfx.play('ring', { pitch: 0.6 }); break;
    case 'shellCrack': sfx.play('dive', { gain: 0.25, pitch: 1.9 }); break;
    case 'goldArrow': sfx.play('shot', { pitch: 1.5, gain: 0.5 }); break;
    case 'summon': sfx.play('warn', { gain: 0.4, pitch: 1.1 }); break;
    // leg three
    case 'rageUp': hud.note('得摩斯倒下：福波斯要狂暴了'); sfx.play('warn', { pitch: 0.8 }); break;
    case 'rage': shake(shakeEl, 'light'); sfx.play('boom', { gain: 0.5, pitch: 0.7 }); break;
    case 'boulder': view.explode(ev.x, ev.y, true); shake(shakeEl, 'light'); sfx.play('boom', { gain: 0.7 }); break;
    case 'river': hud.note('金色彈河：找縫隙穿過'); sfx.play('ring', { pitch: 1.4 }); break;
    case 'horn': sfx.play('dive', { gain: 0.25, pitch: 1.6 }); break;
    case 'shieldDown': hud.note('神盾放下了：現在打'); sfx.play('ring', { pitch: 1.6, gain: 0.8 }); break;
    case 'shieldUpAgain': sfx.play('graze', { pitch: 0.6, gain: 1.0 }); break;
    case 'boxUp': hud.note('潘朵拉要開盒了'); sfx.play('warn', { pitch: 1.3 }); break;
    case 'boxOpen': view.wave(ev.x ?? 360, ev.y ?? 220, 2, FEEL.spit.shard); sfx.play('boom', { gain: 0.5, pitch: 1.4 }); break;
    case 'chains': hud.note('先打斷鎖鏈錨與巨鷹，核心才打得動'); sfx.play('warn', { gain: 0.6 }); break;
    case 'fireGift': hud.note('普羅米修斯的火：連射強化 12 秒'); flash(); sfx.play('clear'); break;
    case 'shatter': view.sparks(ev.x, ev.y, 8, 220, 0.3, FEEL.spit.shard); sfx.play('hit', { pitch: 1.8, gain: 0.5 }); break;
    case 'fade': view.fadeBullets(ev.bullets, ev.rays); break;
    // leg five
    case 'flareUp': hud.note('閃焰倒數：躲到遮蔽柱正下方'); sfx.play('warn', { gain: 0.6, pitch: 1.3 }); break;
    case 'flareOff': hud.note('閃焰取消了'); sfx.play('graze', { pitch: 0.6, gain: 0.8 }); break;
    case 'stripesUp': hud.note('條紋帶：橫、斜、直接連'); sfx.play('warn', { gain: 0.5, pitch: 1.2 }); break;
    case 'nightUp': hud.note('入夜：子彈要停住，然後朝你現在的位置飛'); sfx.play('warn', { gain: 0.6, pitch: 0.7 }); break;
    case 'timeStop': sfx.play('ring', { pitch: 0.5, gain: 0.8 }); break;
    case 'timeGo': sfx.play('dive', { gain: 0.4, pitch: 0.8 }); break;
    case 'eyes': hud.note('綠色的是生門：那一個不開火'); sfx.play('warn', { gain: 0.6 }); break;
    case 'eyeVolley': sfx.play('ring', { pitch: 1.6, gain: 0.3 }); break;
    case 'gates': hud.note('花瓣照固定的搖擺落下'); sfx.play('warn', { gain: 0.5, pitch: 0.9 }); break;
    // leg four
    case 'beat': sfx.play('ring', { pitch: [1.0, 1.26, 1.5, 2.0][ev.n - 1], gain: ev.n === 4 ? 0.6 : 0.35 }); break;   // three rising beats, the fourth fires
    case 'ripenUp': sfx.play('graze', { pitch: 1.6, gain: 0.5 }); break;
    case 'wand': hud.note('魔杖指向的斥候：快打掉，否則會變成重裝獸機'); sfx.play('warn', { gain: 0.5, pitch: 1.6 }); break;
    case 'charm': view.sparks(ev.x, ev.y, 10, 200, 0.35, FEEL.l4.charm); sfx.play('dive', { gain: 0.4, pitch: 0.7 }); break;
    case 'pulse': sfx.play('ring', { pitch: 0.8, gain: 0.25 }); break;
    case 'husk': sfx.play('graze', { pitch: 0.5, gain: 0.6 }); break;
    case 'huskGlow': sfx.play('graze', { pitch: 0.7, gain: 0.5 }); break;
    case 'rise': view.sparks(ev.x, ev.y, 8, 160, 0.3, FEEL.l4.rise); sfx.play('dive', { gain: 0.35, pitch: 0.8 }); break;
    case 'arms': hud.note('拆掉機械臂：每拆一組彈幕少一截，本體也會受傷'); sfx.play('warn', { gain: 0.6 }); break;
    case 'memory': hud.note('記住安全道的順序：等一下會加速重放'); sfx.play('ring', { pitch: 1.2 }); break;
    case 'recall': hud.note('重放：照剛才的順序'); sfx.play('warn', { gain: 0.5, pitch: 1.4 }); break;
    case 'rowsUp': sfx.play('dive', { gain: 0.3, pitch: 0.9 }); break;
    case 'tritonGap': sfx.play('ring', { pitch: 1.7, gain: 0.4 }); break;
    case 'morphUp': hud.note(['普羅透斯化身布戎忒斯', '普羅透斯化身喀耳刻', '普羅透斯化身特里同', '普羅透斯現出原形'][ev.form]); sfx.play('warn', { pitch: 0.9 }); break;
    case 'morph': view.pulseBoss(); sfx.play('boom', { gain: 0.4, pitch: 1.2 }); break;
    case 'ferryUp': hud.note(ev.side === 0 ? '擺渡船從左邊來：靠岸前打掉' : '擺渡船從右邊來：靠岸前打掉'); sfx.play('warn', { gain: 0.5, pitch: 1.1 }); break;
    case 'dock': sfx.play('boom', { gain: 0.4, pitch: 1.6 }); break;
    case 'styxRiver': hud.note('只有腳踵打得動；冥河碰到會受傷，畫面下方永遠安全'); sfx.play('warn', { gain: 0.6, pitch: 0.6 }); break;
    case 'armorBreak': {
      const r = KIND[BOSS_SLOTS[ev.boss].type].r;
      view.armorBreak(ev.x, ev.y, r); flash(); shake(shakeEl, 'boss'); sfx.play('boom', { pitch: 1.2 });
      freeze = Math.max(freeze, FEEL.hitStop.boss);
      hud.note(ev.stage === 1 ? '外甲爆裂' : '骨架崩解，核心外露');
      break;
    }
    case 'shieldBreak': view.midShieldBreak(ev.x, ev.y, KIND[BOSS_SLOTS[rec.sim.slot]?.type ?? 16].r); shake(shakeEl, 'light'); sfx.play('ring', { pitch: 1.4 }); hud.note('護盾擊破'); break;
    case 'shieldUp': sfx.play('graze', { pitch: 0.6, gain: 1.2 }); hud.note('護盾重生：別離開火線'); break;
    case 'ray': sfx.play(ev.live ? 'ring' : 'graze', { pitch: ev.live ? 0.5 : 0.7, gain: 0.5 }); break;
    case 'clang': {                                            // v10: armour stopped a shot
      const now = performance.now() / 1000;
      view.clang(ev.x, ev.y);
      if (now - (clangAt.sfx || 0) > FEEL.clang.sfxEvery) { clangAt.sfx = now; sfx.play('hit', { pitch: 2.3, gain: 0.35 }); }
      if (now - (clangAt.note || -99) > FEEL.clang.noteEvery) { clangAt.note = now; hud.note('裝甲擋住了：對準核心正下方'); }
      break;
    }
    case 'obstHit': view.obstHit(ev.x, ev.y); sfx.play('hit', { pitch: 0.7, gain: 0.8 }); break;
    case 'obstBreak': view.obstBreak(ev.x, ev.y, OBST_R[ev.kind]); shake(shakeEl, 'light'); sfx.play('boom', { gain: 0.7, pitch: 1.3 }); break;
    case 'chargeWarn': sfx.play('warn', { pitch: 0.8 }); hud.note('衝鋒：離開紅色航道'); break;
    case 'charge': sfx.play('dive', { gain: 1.1, pitch: 0.7 }); break;
    case 'chargeHit': shake(shakeEl, 'light'); sfx.play('boom', { gain: 0.5, pitch: 0.8 }); break;
    case 'shell': view.shell(ev.x, ev.y, ev.broke); sfx.play('hit', { pitch: ev.broke ? 0.6 : 1.7, gain: ev.broke ? 1.1 : 0.6 }); break;
    case 'elite': hud.note('精英機：打掉必掉補給'); sfx.play('warn', { gain: 0.5, pitch: 1.4 }); break;
    case 'strikeUp': sfx.play('dive', { gain: 0.5, pitch: 1.6 }); break;
    case 'strike': flash(); sfx.play('boom', { gain: 0.6, pitch: 1.4 }); break;
    case 'cross': sfx.play('dive', { gain: 0.6, pitch: 1.1 }); break;
    case 'chapter': hud.note(names().chapter[ev.chapter]); break;       // no banner, no hold: the boost carries the change
    case 'boost': sfx.play('boost'); break;
    case 'pick': sfx.play('click'); break;
    case 'evolve': hud.note('彈幕網：斜射彈也能穿透'); sfx.play('clear'); break;
    case 'drop': view.sparks(ev.x, ev.y, 6, 200, 0.3, 0xfff1c9); break;
    case 'pickup': hud.note(ev.kind === UPGRADE && ev.gear !== undefined ? `${GEAR[ev.gear].name} 升到第 ${ev.level} 級` : dropName(ev.kind)); view.sparks(ev.x, ev.y, 10, 260, 0.3, 0x8ff6ff); sfx.play('pickup'); hud.build(buildOf(sim)); break;
    case 'block': view.shieldBreak(ev.x, ev.y); shake(shakeEl, 'light'); sfx.play('ring', { pitch: 1.5 }); break;
    case 'barrier': sfx.play('graze', { pitch: 0.8 }); break;
    case 'laser': view.laser(ev.x, ev.y, ev.targets); break;
    case 'obstacleUp': view.warnObstacle(ev.x, ev.ticks / 60); break;
    case 'beamUp': sfx.play('dive', { gain: 0.5, pitch: 1.6 }); break;
    case 'beam': sfx.play('ring', { pitch: 0.6, gain: 1.2 }); break;
    case 'clear': view.clearRing(ev.x, ev.y, ev.r); break;
    case 'burst': if (ev.link) { view.explode(ev.x, ev.y); view.wave(ev.x, ev.y, 1, 0xffb347); shake(shakeEl, 'light'); sfx.play('boom', { gain: 0.6, pitch: 1.2 + 0.2 * ev.link }); } else { view.clearRing(ev.x, ev.y, ev.r); sfx.play('ring'); } break;   // leg two: a rammer's burst (it has a link in the chain)
    case 'recharge': sfx.play('graze', { pitch: 1.6, gain: 1.4 }); break;
    case 'aim': sfx.play('dive', { gain: 0.6, pitch: 1.3 }); break;
    case 'lance': sfx.play('shot', { pitch: 0.55, gain: 1.3 }); break;
    case 'wall': sfx.play('warn', { gain: 0.5, pitch: 0.8 }); break;
    case 'wallFire': sfx.play('ring', { pitch: 0.8 }); break;
    case 'mineBurst': view.explode(ev.x, ev.y); sfx.play('hit'); break;
    case 'split': view.sparks(ev.x, ev.y, 8); break;
    case 'bossRing': view.pulseBoss(); sfx.play('ring'); break;
    case 'bossDown':
      flash(); shake(shakeEl, 'boss'); sfx.play('boom'); sfx.play('bossdown'); music.play(`leg${legNo()}`);
      freeze = Math.max(freeze, FEEL.hitStop.boss);
      if (game === GAME5 && ev.boss === 3) { view.soulMorph(rec.sim.px / ONE, rec.sim.py / ONE); hud.note('機體化成靈魂體：只有胸口的亮點會被打中'); }   // the sun is behind: the black hole next (gdd/13 §7 point 3)
      break;
    default: break;
  }
}

// leg six flies leg one's skeleton: the same sections under its own names
const SECTION_6 = { 暖身: '暖身', 上升: '一起', 運輸機隊: '火山彈', 加速: '一承', 高潮: '一合', 雷雲: '尾掃', 窄谷: '側風', 隕石雨: '隕石' };
const sectionName = n => names().section[n] ?? n;
const CHAPTER_NAMES_1 = ['海岸黃昏', '雲海夜航', '峽谷黎明', '軌道深空'], CHAPTER_NAMES_6 = ['三疊紀裂谷', '侏羅紀巨木林', '白堊紀內海', '白堊紀末日'];
const BOSS_NAMES_6 = ['波斯特鱷 Postosuchus', '板龍 Plateosaurus', '異特龍 Allosaurus', '梁龍 Diplodocus', '風神翼龍 Quetzalcoatlus', '滄龍 Mosasaurus', '棘龍 Spinosaurus', '暴龍 Tyrannosaurus'];
// Leg one, "hold the Earth": the gods' vanguard, a mid-boss and a boss per chapter (spec §5 「航段與世界觀」).
const BOSS_NAMES = ['涅柔斯 Nereus', '俄刻阿諾斯 Oceanus', '玻瑞阿斯 Boreas', '倪克斯 Nyx', '安泰俄斯 Antaeus', '厄俄斯 Eos', '伊里斯 Iris', '阿特拉斯 Atlas'];
// leg two, "the push into the inner planets" (gdd/05 v12)
const SECTION_2 = { 上升: '一起', 運輸機隊: '月面補給艦', 加速: '一承', 高潮: '一合', 雷雲: '日焰柱', 窄谷: '硫酸雲谷', 隕石雨: '軌道殘骸雨' };
const CHAPTER_NAMES_2 = ['月球', '水星', '金星', '地球廢墟'];
const BOSS_NAMES_2 = ['恩底彌翁 Endymion', '塞勒涅 Selene', '阿耳戈斯 Argus', '潘 Pan', '厄洛斯 Eros', '晨星與昏星 Phosphorus & Hesperus', '厄里斯 Eris', '涅墨西斯 Nemesis'];
// leg three, "the outer giants" (gdd/05 v13)
const SECTION_3 = { 上升: '一起', 運輸機隊: '軌道補給艦', 加速: '一承', 高潮: '一合', 雷雲: '雷暴', 窄谷: '冰脊峽谷', 隕石雨: '光環碎冰雨' };
const CHAPTER_NAMES_3 = ['火星', '木星', '土衛泰坦', '土星'];
const SECTION_4 = { 上升: '一起', 運輸機隊: '軌道補給艦', 加速: '一承', 高潮: '一合', 雷雲: '磁暴', 窄谷: '冰火山峽谷', 隕石雨: '冰塊雨' };
const CHAPTER_NAMES_4 = ['天王星', '天衛三', '海王星', '冥王星'];
const SECTION_5 = { 上升: '一起', 運輸機隊: '軌道補給艦', 加速: '一承', 高潮: '一合', 雷雲: '太陽風暴', 窄谷: '磁力管道', 隕石雨: '吸積碎屑雨' };
const CHAPTER_NAMES_5 = ['日冕', '日面深處', '黑洞（一）', '黑洞（二）'];
const BOSS_NAMES_5 = ['法厄同 Phaethon', '赫利俄斯 Helios', '赫利阿得斯 Heliades', '許珀里翁 Hyperion', '燭陰 Zhuyin', '混沌 Hundun', '八咫鏡 Yata', '黃泉鳥居 Yomi Torii'];
const BOSS_NAMES_4 = ['布戎忒斯 Brontes', '布里阿瑞俄斯 Briareus', '喀耳刻 Circe', '謨涅摩緒涅 Mnemosyne', '特里同 Triton', '普羅透斯 Proteus', '卡戎 Charon', '斯堤克斯 Styx'];
const BOSS_NAMES_3 = ['福波斯與得摩斯 Phobos & Deimos', '厄倪俄 Enyo', '伽倪墨得斯 Ganymede', '阿瑪爾忒亞 Amalthea', '潘朵拉 Pandora', '普羅米修斯 Prometheus', '厄庇墨透斯 Epimetheus', '雅努斯 Janus'];
/** The names the flown leg gives its bosses, chapters and sections. */
const names = () => game === GAME5 ? { boss: BOSS_NAMES_5, chapter: CHAPTER_NAMES_5, section: SECTION_5 } : game === GAME4 ? { boss: BOSS_NAMES_4, chapter: CHAPTER_NAMES_4, section: SECTION_4 } : game === GAME3 ? { boss: BOSS_NAMES_3, chapter: CHAPTER_NAMES_3, section: SECTION_3 } : game === GAME6 ? { boss: BOSS_NAMES_6, chapter: CHAPTER_NAMES_6, section: SECTION_6 } : game === GAME2 ? { boss: BOSS_NAMES_2, chapter: CHAPTER_NAMES_2, section: SECTION_2 } : { boss: BOSS_NAMES, chapter: CHAPTER_NAMES_1, section: {} };

// --- Choices (spec §8): the sim stands still at a choice; this layer shows the panel, then counts the player back in.
// Wall time spent choosing and counting in is taken out of the input clock, so no tick is skipped or rushed. ---
// A supply won from a boss does not cut the flight: the wreck burns for a moment, then the panel comes in while the
// ground keeps rushing by as the boost. Only the opening supply (nothing was shot down) holds the picture still.
let pickOpen = false, pickShown = false, pickBoost = false, showAt = 0, pausedAt = 0, resumeAt = 0;
// Pause: the sim stops stepping (no input is recorded), the picture holds; going on counts down first, and the input
// clock skips the paused time (like a supply), so the replay is the same as if there had been no pause.
// A leg allows FEEL.pause.max pauses (leaving the page counts); the count-in after one counts 3, 2, 1 evenly.
let paused = false, pausesLeft = 0, countIn = 0;
const pauseBtn = document.getElementById('btn-pause'), pausePanel = document.getElementById('panel-pause');
const COUNT_IN = FEEL.pause.steps.reduce((a, b) => a + b, 0) * 1000;
function showPausesLeft() {
  pauseBtn.querySelector('sup').textContent = state === 'play' ? pausesLeft : '';
  pausePanel.querySelector('.left').textContent = pausesLeft > 0 ? `這個航段還能暫停 ${pausesLeft} 次。` : '這個航段的暫停次數用完了。';
}
function setPause(on) {
  if (state !== 'play' || on === paused || (on && (pickOpen || resumeAt || pausesLeft <= 0))) return;
  const now = performance.now();
  paused = on; pausePanel.hidden = !on;
  if (on) {
    pausesLeft--; showPausesLeft();
    pauseBtn.classList.add('down');
    pausedAt = now; pickBoost = false; pointer = null; keys.clear(); showStick(); sfx.play('click');
  } else { resumeAt = now + COUNT_IN; countIn = resumeAt; }
}
function leavePause() { paused = false; pausePanel.hidden = true; }
pauseBtn.addEventListener('pointerdown', e => e.stopPropagation());
pauseBtn.addEventListener('click', e => { e.stopPropagation(); sfx.unlock(); setPause(!paused); });
document.getElementById('btn-resume').addEventListener('click', () => { sfx.play('click'); setPause(false); });
document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });
function openPick(now) {
  pickOpen = true; pickShown = false; pickBoost = rec.sim.supply > 0; pausedAt = now; pointer = null; keys.clear();
  if (auto) { pickShown = true; takePick(auto.pick(rec.sim)); return; }
  showAt = now + (pickBoost ? FEEL.pick.delay * 1000 : 0);
}
function showPick() {
  pickShown = true;
  sfx.play('click');
  hud.pick(choiceView(rec.sim), takePick, pickBoost);
}
function takePick(i) {
  if (!pickOpen || !pickShown || !rec.choose(i)) return;
  sfx.play('powerup'); sfx.play('confirm');
  for (const ev of rec.sim.events) playJuice(ev, rec.sim);
  pickOpen = false;
  hud.pick(null);
  hud.build(buildOf(rec.sim));
  resumeAt = performance.now() + (auto ? 0 : FEEL.pick.resume * 1000);
}

// --- Match: record every input byte; at the end replay it exactly like a server would ---
let lastFrame = performance.now();
let seed = (Number(q.get('seed')) || 20261118) >>> 0;
let game = { 2: GAME2, 3: GAME3, 4: GAME4, 5: GAME5, 6: GAME6 }[q.get('leg')] ?? GAME;   // which leg is flown (v11); ?leg=2, 3 or 6 starts on that leg
let state = 'title', rec = new Recorder(game, seed), clock = null, auto = null;
if (import.meta.env.DEV && q.get('auto')) auto = (await import('../tools/strategies.mjs')).STRATEGIES[q.get('auto')]?.policy ?? null;   // dev only: watch a strategy play

// --- Dev only: jump into the middle of a leg to look at a later part (never in a build). ---
//   ?ch=3            start at chapter 3 (1-4)            ?at=mid | boss   start at that chapter's mid-boss or boss
//   ?gear=2          every piece of gear at this level    ?god=1           the ship cannot lose a life
// A match started this way is not a real match: the state is edited by hand, so it does not verify and is not saved.
const CHEAT = import.meta.env.DEV && (q.has('ch') || q.has('at') || q.has('gear') || q.has('god'))
  ? { ch: Math.max(1, Math.min(CHAPTERS, Number(q.get('ch')) || 1)) - 1, at: q.get('at'), gear: Math.max(0, Math.min(GEAR_MAX_LV, Number(q.get('gear')) || 0)), real: q.get('gear') === 'real', god: q.get('god') === '1' } : null;
function applyCheat(sim) {
  const unit = CHEAT.at === 'mid' ? BOSS_SLOTS[2 * CHEAT.ch].from : CHEAT.at === 'boss' ? BOSS_SLOTS[2 * CHEAT.ch + 1].from : CHAPTER_FROM[CHEAT.ch], T = unit * UNIT_TICKS;
  const past = list => { const i = list.findIndex(p => p.at >= T); return i < 0 ? list.length : i; };
  if (T > 0) {
    sim.skip = T; sim.chapter = CHEAT.ch; sim.slot = BOSS_SLOTS.filter(b => b.from * UNIT_TICKS < T).length;
    sim.nextSpawn = past(sim.plan); sim.nextObst = sim.nextWarn = past(sim.rocks); sim.nextStrike = past(sim.sky);
  }
  if (CHEAT.gear) { sim.gear = sim.gear.map(() => CHEAT.gear); sim.barrier = 1; }
  // gear=real: what a regular player has by this point (measured: 3 levels in all per boss slot passed), handed out in
  // the order the regular model takes them
  if (CHEAT.real) {
    const n = Math.round(1.5 * (sim.slot + (CHEAT.at ? 1 : 0))), order = [RAPID, BARRIER, SPREAD, LASER, WINGMAN, PIERCE, HEAVY, THRUSTERS];
    for (let i = 0; i < n; i++) sim.gear[order[i % order.length]] = Math.min(GEAR_MAX_LV, sim.gear[order[i % order.length]] + 1);
    if (sim.gear[BARRIER]) sim.barrier = 1;
  }
}

function start() {
  music.play(`leg${legNo()}`);
  rec = new Recorder(game, seed);
  if (CHEAT) applyCheat(rec.sim);
  clock = new InputClock(performance.now(), 0, TICK_MS);
  lastFrame = performance.now();                             // a stall before the match began is not a stall inside it
  view.clearFx(); freeze = 0; pointer = null; pickOpen = false; pausedAt = 0; resumeAt = 0;
  leavePause(); pausesLeft = FEEL.pause.max; countIn = 0;
  pauseBtn.disabled = false; pauseBtn.classList.remove('down'); hud.countdown(null);
  hud.reset(SHIELDS); hud.title(false); hud.result(null);
  state = 'play';
  showPausesLeft();
}
function finish() {
  music.stop();
  pauseBtn.disabled = true; pauseBtn.classList.remove('down');
  state = 'over';
  showPausesLeft();
  pointer = null;
  const sim = rec.sim, b = scoreBreakdown(sim), up = rec.upload(), v = verify(game, up);
  const cleared = sim.won === 1;
  // a leg flown to the end opens the next one on the map; in the dev build a skipped-ahead test run counts too
  if (cleared && Number(store.get(LEGS_KEY) || 0) < legIndex() + 1) store.set(LEGS_KEY, String(legIndex() + 1));
  const lk = legBestKey(legIndex());
  if (!auto && !CHEAT && sim.score > (Number(store.get(lk)) || 0)) store.set(lk, String(sim.score));   // a cheated or bot run is never a record
  refreshMap();
  if (!auto && !CHEAT) { playtest.add(up, { ...b, score: sim.score, shields: sim.shields, bossDown: cleared, verified: v.valid }); showPlaytest(); }
  const key = `sky-talon-best-${seed}`, prev = Number(store.get(key)) || 0, isBest = !CHEAT && sim.score > prev;
  if (isBest) store.set(key, String(sim.score));           // a cheated run is never a record
  if (sim.shields > 0) sfx.play('clear');
  hud.result({
    headline: cleared ? '航段通關' : sim.shields > 0 ? '時間到' : `在第 ${b.chapter + 1} 章被擊落`,
    rows: [
      ['擊破', `${b.kills} 架，最佳連鎖 ${b.bestChain}`, b.killPts],
      ['擦彈', `${b.grazes} 顆`, b.grazePts],
      ['頭目速殺', `擊破 ${b.bossKills}／${BOSS_SLOTS.length}（含小王）`, b.bossPts],
      ['少被打中', `被打中 ${b.hits} 次（含護盾擋下）`, b.shieldPts],
      ['裝備', buildOf(sim).map(i => (i.level ? `${i.name}${i.level}` : i.name)).join(' ') || '—', ''],
    ],
    total: sim.score, best: CHEAT ? prev : Math.max(prev, sim.score), isBest, verified: !CHEAT && v.valid, reason: CHEAT ? '跳關測試局，不計分' : v.reason,
    cleared: cleared ? (() => {
      const i = legIndex(), nx = LEGS[i + 1];
      return { line: `恭喜！航段${'一二三四五六'[i]}「${LEGS[i].name}」八個頭目全數擊破`, next: nx && !nx.teaser ? `下一站：航段${'一二三四五六七'[i + 1]}「${nx.name}」${nx.open ? '已開啟' : '已解鎖（製作中）'}` : `所有航段都飛完了，航段${'一二三四五六七'[i + 1]}敬請期待` };
    })() : null,
  });
}
hud.reset(SHIELDS);

// --- Loop: fixed 60 Hz sim, render at display rate ---
app.ticker.add(t => {
  const now = performance.now(), dt = Math.min(0.05, t.deltaMS / 1000);
  if (state === 'play' && resumeAt) {                        // counting the player back in after a choice
    const left = resumeAt - now;
    if (left <= 0) {
      clock.skip(now - pausedAt); resumeAt = 0; pausedAt = 0; countIn = 0; hud.countdown(null);
      pauseBtn.classList.remove('down'); pauseBtn.disabled = pausesLeft <= 0;
    } else if (countIn) {                                     // after a pause: 3, 2, 1, evenly
      const [a, b] = FEEL.pause.steps, gone = (COUNT_IN - left) / 1000;
      hud.countdown(gone < a ? 3 : gone < a + b ? 2 : 1);
    }
    // no numbers: a supply is followed at once by the boost, which is the cue to fly again
  }
  if (!pointer && !stick.hidden) stick.hidden = true;        // a choice, a restart or the end let go of the stick
  if (state === 'play' && pickOpen && !pickShown && now >= showAt) showPick();
  if (state === 'play' && !pickOpen && !resumeAt && !paused) {
    if (now - lastFrame > 250) clock.skip(now - lastFrame - TICK_MS);   // hidden tab / long hitch: pause, don't fast-forward
    const upTo = clock.targetTick(now);
    while (rec.phase === 'play' && rec.sim.tick <= upTo) {
      if (CHEAT?.god) rec.sim.shields = rec.sim.maxShields;
      rec.step(auto ? auto.input(rec.sim) : directionCode());
      for (const ev of rec.sim.events) playJuice(ev, rec.sim);
    }
    if (rec.phase === 'choice') openPick(now);
    else if (rec.phase === 'over') finish();
  }
  lastFrame = now;

  const sim = rec.sim, boss = sim.enemies.find(e => isBoss(e.type));
  view.hideShip = state === 'title';                          // the stage map shows the field only, not the ship
  const held = pickOpen || resumeAt > 0 || paused;                     // a choice or its count-in: the picture holds still too
  const cruising = held && pickBoost;                        // a boss's supply: the sim waits, the flight goes on as the boost
  const frozen = freeze > 0 || (held && !cruising);
  if (frozen) freeze -= dt;                                  // render-only hit-stop; the sim kept stepping above
  view.draw(sim, dt, frozen, state === 'play' && (!held || cruising), cruising);
  sfx.wind(state === 'play' && (!held || cruising) && FEEL.enabled ? view.rush : 0, FEEL.windSound);   // the faster the flight, the higher the wind
  hud.update({
    score: sim.score, chain: sim.chain, shields: sim.shields, maxShields: sim.maxShields, section: state === 'title' ? '' : sectionName(SCRIPT[sectionAt(scriptClock(sim))].name),
    bossHp: boss ? boss.hp : 0, bossMax: boss ? KIND[boss.type].hp : 1,
    bossStaged: !!boss && !isMid(boss.type), bossShield: boss && isMid(boss.type) ? boss.shd / shieldMax(boss.type) : -1,
  });
});

if (import.meta.env.DEV) window.__game = { app, view, sfx, music, FEEL, WORLD_W, WORLD_H, get rec() { return rec; }, get state() { return state; }, get dbg() { return { paused, pausesLeft, pickOpen, pickShown, resumeAt, pausedAt, now: performance.now() }; }, start, playtest, takePick };   // console inspection only

// --- The opening: every launch plays the prologue over the stage map (tap to begin, so its music can start; skippable),
// then fades into the map. ?skipintro leaves it out (dev links); so does watching a strategy play.
if (!q.has('skipintro') && !auto && state === 'title') {
  introOn = true;
  playIntro(0, { gate: '點擊畫面開始', fade: true, onStart: () => { sfx.unlock(); music.play('prologue'); } })
    .then(() => { introOn = false; music.play('menu'); });
}
document.documentElement.classList.remove('booting');        // everything is in place: show the frame (index.html)
