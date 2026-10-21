// Boot: Pixi app + fixed-step sim loop + render-only juice (gdd/05 §11). The match is recorded by
// core/Recorder and re-verified on device at the end (the same check the server runs).
// URL: ?seed=<n> fixed seed (default: today's daily seed) · ?offset=<ms> latency calibration · dev only: ?bot=novice|intermediate|expert
import { Application, Assets, Spritesheet } from 'pixi.js';
import { gsap } from 'gsap';
import { Recorder, verify, seedFromString } from './sim/core/index.js';
import { InputClock, TapQueue } from './sim/core/input.js';
import { GAME, TICK_MS, SUB, GRADE, WINDOWS, IN_L, IN_R, encode, MATCH_TICKS, RULES, SEGMENTS, maxScore, scoreBreakdown } from './sim/sim.js';
import { FEEL } from './fx/feel.js';
import { shake } from './fx/shake.js';
import { hurt, flash } from './fx/overlay.js';
import { buildPlaceholderAtlas } from './render/placeholderArt.js';
import { GameView, LAYOUT, segmentName, STRIKES, beatAt } from './render/view.js';
import { Sfx } from './audio/sfx.js';
import { HitFx } from './audio/hitFx.js';
import { Bgm } from './audio/bgm.js';
import { ComboFeel, tierOf } from './fx/comboFeel.js';
import { Calibration, loadLatency } from './ui/calibration.js';
import { PlaytestLog } from './ui/playtestLog.js';
import catSheetData from './assets/cat.json';           // art/tools/pack_atlas.py output (gdd/02 §4)
import catSheetUrl from './assets/cat.png';
import enemySheetData from './assets/enemies.json';     // frames named '<group>.<pose>'
import enemySheetUrl from './assets/enemies.png';
import fxSheetData from './assets/fx.json';               // frames 'fx.<name>'
import fxSheetUrl from './assets/fx.png';
import bgUrl from './assets/bg_dojo.webp';
import titleArtUrl from './assets/title_keyart.webp';   // art/tools/bake_keyart.py: portrait slice of the key art                 // art/tools/bake_bg.py: 720x1280, wall/floor line at y 876

// --- GSAP global settings (references/gsap.md §1) ---
gsap.defaults({ duration: 0.25, ease: 'power2.out', overwrite: 'auto' });
gsap.config({ force3D: true, nullTargetWarn: import.meta.env.DEV });
gsap.ticker.lagSmoothing(500, 33);
gsap.matchMedia().add('(prefers-reduced-motion: reduce)', () => {
  FEEL.enabled = false;
  return () => { FEEL.enabled = true; };
});

const params = new URLSearchParams(location.search);
const today = new Date();                                // render layer only: picks the daily seed, never read by the sim
const SEED = Number(params.get('seed')) || seedFromString(`daily-${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`);
// Latency (knowledge-base/13 §3): ?offset=<ms> wins, else this device's saved calibration (ui/calibration.js), else 0.
const saved = loadLatency();
// Human playtest mode (docs/human_playtest_plan.md): ?playtest=1&tester=<name> keeps every match for export.
const playtest = new PlaytestLog(params.get('playtest') ? (params.get('tester') || 'anon').slice(0, 24) : '');
const latency = {
  input: params.has('offset') ? Math.max(-150, Math.min(150, Number(params.get('offset')) || 0)) : saved?.inputOffsetMs ?? 0,
  audio: saved?.audioLatencyMs ?? null,                 // ms; null = trust the browser's outputLatency estimate
};

// --- Pixi ---
const stage = document.getElementById('stage');
const shakeEl = document.getElementById('stage-shake');
const app = new Application();
await app.init({ preference: 'webgl', resizeTo: stage, backgroundColor: 0x5a3a22, antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio, 2) });
shakeEl.appendChild(app.canvas);

// Final art replaces placeholder frames by name; anything not generated yet stays a placeholder.
const atlas = buildPlaceholderAtlas();
async function overlay(url, data, group = null) {
  const sheet = new Spritesheet(await Assets.load(url), data);
  await sheet.parse();
  for (const [name, tex] of Object.entries(sheet.textures)) {
    const [g, pose] = group ? [group, name] : name.split('.');
    (atlas.tex[g] ??= {})[pose] = tex;
  }
}
await overlay(catSheetUrl, catSheetData, 'cat');
await overlay(enemySheetUrl, enemySheetData);
await overlay(fxSheetUrl, fxSheetData);
const view = new GameView(atlas, await Assets.load(bgUrl));
view.onBoss = () => banner('狸貓頭目登場！', 'boss');           // gdd/07 §7
app.stage.addChild(view.root);

// Fixed 720x1280 world, contained and centred (E3); the DOM HUD gets the same box.
const hudEl = document.getElementById('hud');
function fit() {
  const { width: w, height: h } = app.screen, s = Math.min(w / LAYOUT.w, h / LAYOUT.h);
  view.root.scale.set(s);
  view.root.position.set(Math.round((w - LAYOUT.w * s) / 2), Math.round((h - LAYOUT.h * s) / 2));
  Object.assign(hudEl.style, { left: `${view.root.x}px`, top: `${view.root.y}px`, width: `${LAYOUT.w * s}px`, height: `${LAYOUT.h * s}px` });
}
fit();
app.renderer.on('resize', fit);

// --- DOM HUD ---
const $ = sel => hudEl.querySelector(sel);
const ui = {
  score: $('.score'), combo: $('.combo'), hp: $('.hp'), seg: $('.seg'), bar: $('.bar i'), cutin: $('.cutin'),
  pops: [$('.pop.l'), $('.pop.r')], title: $('.title'), result: $('.result'), milestone: $('.milestone'),
};
ui.title.style.backgroundImage = `url(${titleArtUrl})`;
$('.seed').textContent = `今日題目 #${(SEED % 100000).toString().padStart(5, '0')}`;
ui.hp.innerHTML = '<span>🐾</span>'.repeat(RULES.hpMax);
if (import.meta.env.DEV) {
  const { drawCallCounter } = await import('./debug/drawCalls.js');
  const dc = drawCallCounter(app), dcEl = $('.dc');
  dcEl.hidden = false;
  setInterval(() => { dcEl.textContent = `DC ${dc()}  FPS ${app.ticker.FPS.toFixed(0)}`; }, 250);
}

// --- Coaching for mashers (docs/persona_playtest.md #1): explain the stagger the first times it happens ---
const coach = {
  el: null, shown: 0, whiffTimes: [],
  say(text) {
    this.el ??= hudEl.querySelector('.coach');
    this.el.textContent = text;
    gsap.timeline().fromTo(this.el, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.18, overwrite: true }).to(this.el, { opacity: 0, duration: 0.3 }, '>+1.6');
    this.shown++;
  },
  reset() { this.whiffTimes.length = 0; this.runShown = 0; },
  whiff() {
    const now = performance.now();
    this.whiffTimes = this.whiffTimes.filter(t => now - t < 3000).concat(now);
    if (this.shown === 0) this.say('等敵人踏進框再點！');                       // very first whiff on this device
    else if (this.whiffTimes.length >= 3 && this.runShown < 2) { this.runShown++; this.say('狂按會露出破綻，貓會暈 0.2 秒'); }
  },
  locked() { if (this.runShown < 2 && this.whiffTimes.length >= 2) { this.runShown++; this.say('暈眩中！先停手，等下一隻'); } },
};
coach.runShown = 0;
try { coach.shown = Number(localStorage.getItem('twinstrike-coach-v1')) || 0; } catch { /* storage blocked */ }
const remember = () => { try { localStorage.setItem('twinstrike-coach-v1', String(coach.shown)); } catch { /* storage blocked */ } };

const sfx = new Sfx();                                   // knowledge-base/14: synthesised, 0 bytes
const audioLatencySec = () => (latency.audio != null ? latency.audio / 1000
  : sfx.ctx ? (sfx.ctx.outputLatency || 0) + (sfx.ctx.baseLatency || 0) : 0);
const bgm = new Bgm(sfx, audioLatencySec);
const hitFx = new HitFx(sfx);                            // gdd/06 §7: strike bodies + combo-tier layers                                // gdd/06: beat-locked, layered by combo tier
const comboFeel = new ComboFeel({ view, bgm, sfx, counter: ui.combo, banner: ui.milestone });
const GRADE_TEXT = { critical: ['critical', 'Critical!'], [GRADE.PERFECT]: ['perfect', 'Perfect!'], [GRADE.GREAT]: ['great', 'Great'], [GRADE.GOOD]: ['good', 'Good'], whiff: ['whiff', '破綻！'] };
const hooks = {
  shake: kind => shake(shakeEl, kind),
  popup(grade, lane, combo, pts, crit) {
    const el = ui.pops[lane], [cls, text] = GRADE_TEXT[crit ? 'critical' : grade];
    if (grade === 'whiff') coach.whiff();
    const tier = typeof grade === 'number' ? tierOf(combo) : 0;
    el.className = `pop ${lane ? 'r' : 'l'} ${cls} t${tier}`;
    el.innerHTML = tier >= 2 && pts ? `${text}<small>+${pts}</small>` : text;
    gsap.fromTo(el, { opacity: 1, y: 0, scale: 1.3 }, { y: -FEEL.popup.rise, scale: 1, opacity: 0, duration: FEEL.popup.dur, ease: FEEL.popup.ease, overwrite: true });
    if (grade === 'whiff') { sfx.play('whiff'); return; }
    if (grade === GRADE.PERFECT && tier >= 2) flash();                // strike sounds: hooks.strike / audio/hitFx.js
  },
  strike(o) {                                                      // sim-confirmed hit: sound it unless the press already did
    if (sounded.has(o.id)) return;
    sounded.add(o.id);
    hitFx.strike({ ...o, delay: beatDelay(o.note.t) });
  },
  hurt(safe) { hurt(safe ? 0.35 : 0.9); shake(shakeEl, 'light'); sfx.play('hurt', { gain: safe ? 0.5 : 1 }); },
  locked() { coach.locked(); sfx.play('click', { pitch: 0.5, gain: 0.5 }); },
  brute(last) { sfx.play(last ? 'shieldBreak' : 'block'); },
};

// --- Input (knowledge-base/13): timestamped taps land on the tick they physically happened in ---
let rec = null, clock = null, taps = null, bot = null, playing = false, lastFrame = performance.now();
function press(ts, lane) {
  sfx.unlock();
  if (calib.active) { calib.tap(ts); return; }
  if (!playing) return;
  taps.push(ts, lane);
  predictHit(ts, lane);
}

// --- Keysounds on press, snapped to the beat (gdd/06 §8; DJMAX / Cytus style) ---
// The press finds the note it will hit (same rule as the sim: earliest unjudged note of that side inside the
// window) and schedules the strike + keysound on the AudioContext clock AT THAT NOTE'S BEAT: an early press is
// held until the beat, a late one plays at once. Scoring is untouched; this only decides when the sound starts.
const sounded = new Set();                                 // chart notes whose hit sound is already scheduled
function beatDelay(noteT) {
  const ctx = sfx.ctx;
  if (!ctx || !clock) return 0;
  const lat = audioLatencySec();
  const nowTick = (performance.now() - clock.t0) / TICK_MS;
  return Math.max(0, (noteT / SUB - nowTick) / 60 - lat);
}
function predictHit(ts, lane) {
  const sim = rec.sim, { chart, judge } = sim, at = clock.at(ts), t = at.tick * SUB + at.phase;
  if (at.tick < sim.staggerUntil) return;                  // the sim will ignore this press (stagger)
  let i = judge.next;
  for (; i < chart.length && chart[i].t <= t + WINDOWS.great; i++) {
    if (judge.grade[i] < 0 && !sounded.has(i) && chart[i].lane === lane && Math.abs(chart[i].t - t) <= WINDOWS.great) break;
  }
  if (i >= chart.length || chart[i].t > t + WINDOWS.great) return;   // nothing clean in reach: the sim decides (good / whiff)
  let pending = 0;
  for (const k of sounded) if (judge.grade[k] < 0) pending++;
  sounded.add(i);
  const n = chart[i], combo = judge.combo + 1 + pending, b = beatAt(n.t / SUB), next = chart[i + 1];
  hitFx.strike({
    id: i, note: n, strike: STRIKES[i % 3], grade: Math.abs(n.t - t) <= WINDOWS.perfect ? GRADE.PERFECT : GRADE.GREAT,
    combo, tier: tierOf(combo), kind: n.kind, onBeat: !!b && b.phase === 0, downbeat: !!b && b.phase === 0 && b.index % 4 === 0,
    nextGapMs: next ? ((next.t - n.t) / SUB) * TICK_MS : 1e9, delay: beatDelay(n.t),
  });
}
stage.addEventListener('pointerdown', e => {
  const r = hudEl.getBoundingClientRect();
  press(e.timeStamp, e.clientX >= r.left + r.width / 2 ? 1 : 0);
});
const KEYS = { ArrowLeft: 0, KeyA: 0, KeyF: 0, ArrowRight: 1, KeyD: 1, KeyJ: 1 };
addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'KeyM') { sfx.unlock(); sfx.setMuted(!sfx.muted); return; }
  if (e.code in KEYS) { e.preventDefault(); press(e.timeStamp, KEYS[e.code]); }
  else if ((e.code === 'Space' || e.code === 'Enter') && !playing && !calib.active) start();
});
addEventListener('contextmenu', e => e.preventDefault());
$('.start').addEventListener('click', () => { sfx.unlock(); sfx.play('click'); start(); });
$('.again').addEventListener('click', () => { sfx.play('click'); start(); });
$('.export').addEventListener('click', () => { sfx.play('click'); playtest.download(); });

// --- Latency calibration (ui/calibration.js) ---
const calStatus = $('.cal-status');
const showLatency = () => {
  calStatus.textContent = saved || latency.audio != null
    ? `目前校正：觸控 ${latency.input} ms · 音訊 ${latency.audio ?? '—'} ms`
    : '第一次玩建議先做延遲校正（約 30 秒）';
};
showLatency();
let calReturn = null;
const calib = new Calibration({
  sfx, panel: $('.calib'),
  onDone(r) {
    if (r && !params.has('offset')) { latency.input = r.inputOffsetMs; latency.audio = r.audioLatencyMs; }
    else if (r) latency.audio = r.audioLatencyMs;
    showLatency();
    if (calReturn) calReturn.hidden = false;
  },
});
hudEl.querySelectorAll('.calibrate').forEach(b => b.addEventListener('click', () => {
  sfx.play('click');
  calReturn = !ui.title.hidden ? ui.title : !ui.result.hidden ? ui.result : null;
  ui.title.hidden = true; ui.result.hidden = true;
  calib.start();
}));

if (import.meta.env.DEV && params.get('bot')) {
  const { BOTS } = await import('../tools/bots.mjs');
  bot = BOTS[params.get('bot')] ?? null;
}

// --- Match ---
let lastSeg = -1, shownHp = RULES.hpMax, shownScore = 0;
function start() {
  rec = new Recorder(GAME, SEED);
  rec.meta.inputOffsetMs = latency.input;                // server checks the ±150 ms range (core/match.js meta)
  rec.meta.audioLatencyMs = latency.audio;
  clock = new InputClock(performance.now(), latency.input, TICK_MS);
  taps = new TapQueue(clock);
  lastFrame = performance.now();                         // the title / result screen is not a hitch
  view.reset();
  comboFeel.reset();
  coach.reset();
  hitErrors.length = 0;
  sounded.clear();
  bgm.start();
  lastSeg = -1; shownHp = RULES.hpMax; shownScore = 0; scoreRoll.v = 0;
  ui.title.hidden = true; ui.result.hidden = true;
  ui.score.textContent = '0'; ui.combo.textContent = '';
  [...ui.hp.children].forEach(s => s.classList.remove('off'));
  document.body.classList.remove('fever');
  playing = true;
}

// --- Timing-bias check (docs/persona_playtest.md #3): a steady late / early average usually means device or
// Bluetooth latency, not skill -> suggest calibration. The median is robust to a few wild taps.
const hitErrors = [];
function timingAdvice() {
  if (hitErrors.length < 20) return null;
  const s = [...hitErrors].sort((a, b) => a - b), med = s[s.length >> 1];
  if (Math.abs(med) < 35) return null;
  return { med: Math.round(med), text: `你的點擊平均${med > 0 ? '偏晚' : '偏早'} ${Math.abs(Math.round(med))} ms，可能是裝置或藍牙耳機的延遲 → 建議做「延遲校正」` };
}

function finish() {
  playing = false;
  remember();
  bgm.stop();
  rec.meta.lateTaps = taps.late;
  const v = verify(GAME, rec.upload()), b = scoreBreakdown(rec.sim), sim = rec.sim;
  if (sim.hp > 0) view.setHero('win', 1, 1e9);
  document.body.classList.remove('fever');
  $('.score-final').textContent = GAME.score(sim).toLocaleString('zh-TW');
  $('.rate').textContent = `達成率 ${(b.ratePermille / 10).toFixed(1)}%（理論滿分 ${maxScore(sim).toLocaleString('zh-TW')}）${sim.hp > 0 ? '' : ' · 第 ' + Math.floor(sim.deathTick / 60) + ' 秒倒下'}`;
  const bias = timingAdvice();
  const advice = [];
  if (bias) advice.push(bias.text);
  if (b.whiffs >= 8 || b.locked >= 3) advice.push(`破綻 ${b.whiffs} 次：等敵人踏進框再點，狂按會讓貓暈眩 0.2 秒、漏掉下一隻`);
  $('.advice').textContent = advice.join('\n');
  hudEl.querySelectorAll('.result .calibrate').forEach(btn => btn.classList.toggle('suggest', !!bias));
  $('.breakdown').innerHTML = [
    ['Critical（±20 ms）', b.critical], ['Perfect（含 Critical）', b.perfect], ['Great', b.great], ['Good', b.good], ['漏接', b.miss],
    ['破綻（空揮）', b.whiffs], ['最大連擊', b.maxCombo],
  ].map(([k, n]) => `<tr><td>${k}</td><td>${n}</td></tr>`).join('');
  if (playtest.enabled) {
    playtest.add(rec, { ...b, hp: sim.hp, deathTick: sim.deathTick, verified: v.valid, timingMedianMs: bias?.med ?? null }, latency);
    $('.export').hidden = false;
    $('.export').textContent = `匯出試玩紀錄（${playtest.count} 局）`;
    $('.playtest-note').hidden = false;
    $('.playtest-note').textContent = `試玩者：${playtest.tester} · 紀錄只存在這台裝置，按匯出後把檔案傳給我們`;
  }
  $('.verify').textContent = v.valid ? `重播驗證通過 ✓ · 題目 #${(SEED % 100000).toString().padStart(5, '0')}` : `重播驗證失敗：${v.reason}`;
  gsap.delayedCall(sim.hp > 0 ? 0.8 : 1.2, () => { ui.result.hidden = false; gsap.from(ui.result, { scale: 0.85, opacity: 0, duration: FEEL.ui.in, ease: FEEL.ui.inEase }); });
}

/** Top cut-in banner (top 20% only; the sim keeps running, spec §11). */
function banner(text, kind) {
  ui.cutin.textContent = text;
  ui.cutin.dataset.kind = kind;
  const { in: tin, hold, out } = FEEL.cutIn;
  gsap.timeline().fromTo(ui.cutin, { opacity: 0, xPercent: -30 }, { opacity: 1, xPercent: 0, duration: tin, ease: 'power3.out', overwrite: true })
    .to(ui.cutin, { opacity: 0, xPercent: 30, duration: out, ease: 'power2.in' }, `>+${hold}`);
}

const scoreRoll = { v: 0 };                               // displayed score rolls up instead of jumping
function syncHud(sim) {
  const score = GAME.score(sim);
  if (score !== shownScore) {
    shownScore = score;
    gsap.to(scoreRoll, { v: score, duration: 0.25, ease: 'power1.out', overwrite: true,
      onUpdate: () => { ui.score.textContent = Math.round(scoreRoll.v).toLocaleString('zh-TW'); } });
  }
  if (sim.hp !== shownHp) {
    [...ui.hp.children].forEach((s, i) => s.classList.toggle('off', i >= sim.hp));
    if (sim.hp > shownHp) { sfx.play('heal'); gsap.fromTo(ui.hp.children[sim.hp - 1], { scale: 1.8 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' }); }
    shownHp = sim.hp;
  }
  ui.bar.style.width = `${Math.min(100, (sim.tick / MATCH_TICKS) * 100)}%`;
  const seg = SEGMENTS.findIndex(s => sim.tick >= s.from && sim.tick < s.to);
  if (seg !== lastSeg && seg >= 0) {
    lastSeg = seg;
    ui.seg.textContent = segmentName(SEGMENTS[seg].id);
    document.body.classList.toggle('fever', SEGMENTS[seg].fever);
    if (SEGMENTS[seg].fever) { sfx.play('boom', { gain: 0.6 }); banner('貓薄荷時間！', 'fever'); }
  }
}

// --- Loop: fixed 60 Hz sim, render at display rate ---
app.ticker.add(() => {
  const now = performance.now();
  if (!rec) { lastFrame = now; view.update({ chart: [], judge: { next: 0, grade: [] }, tick: 0, staggerUntil: 0 }, 0, now); return; }
  if (playing) {
    if (now - lastFrame > 250) clock.skip(now - lastFrame - TICK_MS);   // hidden tab / long hitch: pause, don't fast-forward
    const upTo = clock.targetTick(now);
    while (rec.phase === 'play' && rec.sim.tick <= upTo) {
      let input = 0;
      if (bot) input = bot.input(rec.sim);
      else {
        const tap = taps.take(rec.sim.tick);
        if (tap) input = encode(tap.data ? IN_R : IN_L, tap.phase);
      }
      const comboBefore = rec.sim.judge.combo;
      rec.step(input);
      comboFeel.update(comboBefore, rec.sim.judge.combo);
      const t = rec.sim.tick * SUB;
      for (const ev of rec.sim.events) {
        if (ev.type === 'hit') hitErrors.push((ev.dt / SUB) * TICK_MS);   // signed timing error, ms (late > 0)
        view.onEvent(ev, rec.sim, t, hooks);
      }
      if (rec.phase === 'over') { finish(); break; }
    }
    syncHud(rec.sim);
  }
  lastFrame = now;
  // Continuous wall time on the sim clock: an enemy reaches its range marker exactly when a tap would judge
  // Perfect (the sim itself runs ≤ 1 tick behind, which only delays the juice, never the cue).
  const renderSub = playing ? ((now - clock.t0) / TICK_MS) * SUB : rec.sim.tick * SUB;
  if (playing) bgm.update(renderSub / SUB);
  view.update(rec.sim, renderSub, now);
});

if (import.meta.env.DEV) window.__game = { app, view, start, get rec() { return rec; }, get clock() { return clock; }, calib, latency, playtest, coach, hitErrors, timingAdvice, sfx, bgm, comboFeel, predictHit, beatDelay, sounded };   // console inspection only
