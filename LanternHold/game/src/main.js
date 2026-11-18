// LanternHold boot: Pixi view + fixed-step sim loop + DOM menus. Tap buildings for menus; drag units to (re)deploy.
// Every action becomes a 3-byte command fed to the sim one byte per tick (sim.js §2); card picks are recorder choices.
// The match is recorded and re-verified on device at the end (the same check the server runs).
import { Application, Container, Sprite } from 'pixi.js';
import { gsap } from 'gsap';
import { Recorder, verify, ONE } from './sim/core/index.js';
import {
  GAME, TICK_MS, MATCH_TICKS, CX, CY, VIEW_W, VIEW_H, OP, encode, cellOf, cellCenter, SLOTS,
  BARRACKS, UNIT, UNIT_KINDS, WALL, WALL_R, WALL_SEGS, REPAIR, CASTLE, QUEUE_MAX, EVENTS, segOf, wallMaxHp,
  EVENT_CLEAR_TICKS, lightR, popCap, pop, barracksCost, POP_PER_BARRACKS, canPlace, unitMaxHp, scoreBreakdown, score, REDEPLOY_CD, XP_NEED, LEVEL_MAX,
  CARDS, CARD_IDS, EVOS, SYNERGY, TAGS, REACTIONS, CHOICE, CARD_MAX, POUCH_GOLD, tagCount,
} from './sim/sim.js';
import { angleOf } from './sim/core/index.js';
import { FEEL } from './fx/feel.js';
import { shake } from './fx/shake.js';
import { hurt, flash } from './fx/overlay.js';
import { Particles } from './fx/particles.js';
import { makeArt, COLORS } from './render/art.js';
import { Sfx } from './audio/sfx.js';

gsap.defaults({ duration: 0.25, ease: 'power2.out', overwrite: 'auto' });
gsap.config({ force3D: true, nullTargetWarn: import.meta.env.DEV });
gsap.ticker.lagSmoothing(500, 33);
gsap.matchMedia().add('(prefers-reduced-motion: reduce)', () => { FEEL.enabled = false; return () => { FEEL.enabled = true; }; });

// --- Pixi: fixed 720x1280 logical view, letterboxed (same field of view everywhere, E3) ---
const stage = document.getElementById('stage');
const shakeEl = document.getElementById('stage-shake');
const app = new Application();
await app.init({ preference: 'webgl', resizeTo: stage, backgroundColor: 0x141a33, antialias: true, autoDensity: true, resolution: Math.min(devicePixelRatio, 2) });
shakeEl.appendChild(app.canvas);
const art = makeArt(app.renderer);

const view = new Container();
const ground = new Sprite(art.ground);
const light = new Sprite({ texture: art.disc, anchor: 0.5, tint: COLORS.lamp, alpha: 0.08 });
light.position.set(CX, CY);
const world = new Container();               // walls, buildings, castle, units, foes (y-sorted)
world.sortableChildren = true;
const overlay = new Container();             // drag ghost, rings, warnings
const fxLayer = new Container(); fxLayer.blendMode = 'add';
view.addChild(ground, light, world, overlay, fxLayer);
app.stage.addChild(view);
const particles = new Particles(app.renderer);
fxLayer.addChild(particles.view);

function fit() {
  const s = Math.min(app.screen.width / VIEW_W, app.screen.height / VIEW_H);
  view.scale.set(s);
  view.position.set(Math.round((app.screen.width - VIEW_W * s) / 2), Math.round((app.screen.height - VIEW_H * s) / 2));
}
fit();
app.renderer.on('resize', fit);
const toWorld = e => { const r = app.canvas.getBoundingClientRect(); return [((e.clientX - r.left) - view.x) / view.scale.x, ((e.clientY - r.top) - view.y) / view.scale.y]; };

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

// --- static views: castle, slots, walls ---
const castle = new Sprite({ texture: art.castle, anchor: { x: 0.5, y: 0.8 } });
castle.position.set(CX, CY + 30); castle.zIndex = CY + 30;
world.addChild(castle);
const slotViews = SLOTS.map(([x, y]) => {
  const s = new Sprite({ texture: art.house, anchor: { x: 0.5, y: 0.75 }, visible: false });
  s.position.set(x, y); s.zIndex = y; s.scale.set(0.85);
  const bar = new Sprite({ texture: art.pip, anchor: { x: 0, y: 0.5 }, tint: 0x8ff03c });
  bar.position.set(x - 25, y + 22); bar.zIndex = y + 1; bar.visible = false;
  world.addChild(s, bar);
  return { s, bar, kind: '' };
});
const wallViews = Array.from({ length: WALL_SEGS }, (_, w) => {
  const a = (w * 256) / WALL_SEGS, rad = (a * Math.PI * 2) / 256;
  const s = new Sprite({ texture: art.wall, anchor: 0.5, visible: false });
  s.position.set(CX + Math.cos(rad) * WALL_R, CY + Math.sin(rad) * WALL_R);
  s.rotation = rad + Math.PI / 2; s.zIndex = s.y; s.scale.set(1.05, 1);
  world.addChild(s);
  return { s };
});

// --- dynamic views ---
const unitViews = new Map(), foeViews = new Map();
function unitView(i, u) {
  let v = unitViews.get(i);
  if (v && v.gen === u.gen) return v;
  if (v) v.c.destroy({ children: true });
  const c = new Container();
  const body = new Sprite({ texture: art.body, anchor: { x: 0.5, y: 0.9 }, tint: COLORS[u.kind] });
  body.scale.set(0.95);
  const pips = [0, 1, 2].map(k => { const p = new Sprite({ texture: art.pip, tint: COLORS.lamp }); p.position.set(-16 + k * 12, -42); p.visible = false; c.addChild(p); return p; });
  const hp = new Sprite({ texture: art.pip, anchor: { x: 0, y: 0.5 }, tint: 0x8ff03c }); hp.position.set(-14, 6); hp.scale.set(2.8, 0.8);
  const cd = new Sprite({ texture: art.ring, anchor: 0.5, tint: 0xffffff, alpha: 0.35, scale: 0.12 }); cd.position.set(0, -14); cd.visible = false;
  c.addChild(body, hp, cd);
  world.addChild(c);
  v = { c, body, pips, hp, cd, gen: u.gen };
  unitViews.set(i, v);
  gsap.from(body.scale, { x: 0.2, y: 0.2, duration: FEEL.build.dur, ease: FEEL.build.ease });
  return v;
}
function foeView(f) {
  let v = foeViews.get(f.id);
  if (v) return v;
  const tex = f.kind === 'moth' ? art.wing : f.kind === 'snail' || f.kind === 'boss' || f.kind === 'shroom' ? art.shell : art.foe;
  const s = new Sprite({ texture: tex, anchor: 0.5, tint: COLORS[f.kind] });
  const scale = { rat: 0.6, beetle: 0.95, moth: 0.6, shroom: 0.45, snail: 1.2, wolf: 1.1, boss: 3.2 }[f.kind];
  s.scale.set(scale);
  world.addChild(s);
  v = { s, scale };
  foeViews.set(f.id, v);
  return v;
}

// --- overlay: drag ghost, placement range, prewarn arrows ---
const rangeRing = new Sprite({ texture: art.ring, anchor: 0.5, tint: COLORS.ally, alpha: 0.5, visible: false });
const ghost = new Sprite({ texture: art.body, anchor: { x: 0.5, y: 0.9 }, alpha: 0.6, visible: false });
const aggroRing = new Sprite({ texture: art.ring, anchor: 0.5, alpha: 0.35, visible: false });
const lightRing = new Sprite({ texture: art.ring, anchor: 0.5, tint: COLORS.lamp, alpha: 0.35 });
lightRing.position.set(CX, CY);
const warnArrows = [0, 1].map(() => { const s = new Sprite({ texture: art.arrow, anchor: 0.5, tint: COLORS.danger, visible: false }); s.scale.set(2.2); overlay.addChild(s); return s; });
overlay.addChild(lightRing, rangeRing, aggroRing, ghost);

// --- input: drag units, tap buildings / walls / castle ---
let drag = null, menuFor = null;
const near = (ax, ay, bx, by, r) => (ax - bx) ** 2 + (ay - by) ** 2 <= r * r;
function unitAt(x, y) {
  let best = -1, bd = 34 * 34;
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
  const [x, y] = toWorld(e);
  const i = unitAt(x, y);
  if (i >= 0) {
    const u = sim().units[i];
    drag = { i, x0: x, y0: y, moved: false };
    showUnitInfo(i);
    ghost.tint = COLORS[u.kind]; ghost.scale.set(0.95);
    return;
  }
  tapAt(x, y);
});
addEventListener('pointermove', e => {
  if (!drag || state !== 'play') return;
  const [x, y] = toWorld(e);
  if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) > 12) drag.moved = true;
  if (!drag.moved) return;
  const u = sim().units[drag.i];
  if (!u?.alive) { endDrag(); return; }
  const cell = cellOf(x, y), [cx, cy] = cellCenter(cell);
  const ok = u.redeploy === 0 && canPlace(sim(), cx * ONE, cy * ONE, drag.i);
  ghost.visible = true; ghost.position.set(cx, cy); ghost.alpha = ok ? 0.75 : 0.3;
  aggroRing.visible = true; aggroRing.position.set(cx, cy); aggroRing.tint = ok ? COLORS.ally : COLORS.danger;
  aggroRing.scale.set(UNIT[u.kind].aggro / 128);
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
const UNIT_NAME = { archer: '弓箭手', shield: '盾兵', priest: '牧師' };
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
    h.innerHTML = `主城 <small>耐久 ${Math.max(0, s.castle.hp)}/${CASTLE.hp}　人口 ${pop(s)}/${popCap(s)}</small>`;
    p.textContent = `打怪累積守望值，升級時三選一。人口上限 = 4 ＋ 守望等級 ＋ 每座軍營 ${POP_PER_BARRACKS}。`;
  } else if (menuFor.type === 'slot') {
    const i = menuFor.i, sl = s.slots[i];
    if (!sl.kind) {
      h.innerHTML = '空地';
      p.textContent = `軍營：點它買兵，每座人口上限 +${POP_PER_BARRACKS}，越蓋越貴。牧場只能從卡片拿到。`;
      row.append(btn('軍營', `金 ${barracksCost(s)}　人口 +${POP_PER_BARRACKS}`, s.gold >= barracksCost(s), () => send(encode(OP.BUILD, i, 0))));
    } else if (sl.kind === 'ranch') {
      h.innerHTML = `牧場 <small>卡片 Lv${s.cards.ranch}</small>`;
      p.textContent = `每 10 秒 +${4 * s.cards.ranch} 金。怪不會打它。`;
    } else {
      h.innerHTML = `軍營 <small>耐久 ${sl.hp}${sl.build ? '　施工中' : ''}</small>`;
      p.textContent = sl.queue.length ? `訓練中：${sl.queue.map(k => UNIT_NAME[k]).join('、')}` : '新兵出現在軍營門口，拖曳到想守的位置。';
      UNIT_KINDS.forEach((k, idx) => row.append(btn(UNIT_NAME[k], `金 ${UNIT[k].cost}　${UNIT_TIP[k]}`, !sl.build && room && sl.queue.length < QUEUE_MAX && s.gold >= UNIT[k].cost, () => send(encode(OP.MENU, i, idx)))));
    }
  } else if (menuFor.type === 'wall') {
    const w = s.walls[menuFor.i];
    h.innerHTML = `城牆 <small>${w.lv ? `耐久 ${w.hp}/${wallMaxHp(s)}` : '空'}</small>`;
    p.textContent = '甲蟲會啃牆、蝸牛專打牆、爆裂菇對牆傷害加倍；飛蛾飛過牆。「石牆」卡讓所有牆更硬。';
    if (!w.lv) row.append(btn('蓋木柵', `金 ${WALL.cost}`, s.gold >= WALL.cost, () => send(encode(OP.WALL, menuFor.i, 0))));
    else row.append(btn('修理', `金 ${REPAIR.cost}　慢慢補滿`, w.repair === 0 && w.hp < wallMaxHp(s) && s.gold >= REPAIR.cost, () => send(encode(OP.WALL, menuFor.i, 1))));
  } else if (menuFor.type === 'unit') {
    const u = s.units[menuFor.i];
    if (!u?.alive) return closeMenu();
    const next = u.lv < 3 ? `　經驗 ${u.xp}/${[5, 15][u.lv - 1]}` : '　滿級';
    h.innerHTML = `${UNIT_NAME[u.kind]} Lv${u.lv} <small>血 ${u.hp}/${unitMaxHp(s, u)}${next}</small>`;
    p.textContent = u.redeploy > 0 ? `調防冷卻 ${Math.ceil(u.redeploy / 60)} 秒` : '拖曳到新位置（走過去途中不攻擊，抵達後 1 秒架設）。';
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
let banMode = false;
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
    return `<button class="card ${evo ? 'evo' : ''} ${banMode && !evo && id !== 'pouch' ? 'banning' : ''}" data-k="${k}"><div class="tags">${tags}</div><h4>${id === 'pouch' ? '金袋' : c.name}</h4>${pips}<p>${text}</p>${hints}</button>`;
  }).join('');
  el.cards.innerHTML = `<h2>守望 Lv${s.level}${s.pending > 1 ? `　<small>還有 ${s.pending - 1} 次</small>` : ''}</h2><div class="hand">${cards}</div>
    <div class="row"><button id="reroll" ${s.rerolls ? '' : 'disabled'}>重抽<small>剩 ${s.rerolls}</small></button>
    <button id="ban" class="${banMode ? 'active' : ''}" ${s.bans ? '' : 'disabled'}>${banMode ? '取消封禁' : '封禁一張'}<small>剩 ${s.bans}・本局不再出現</small></button></div>`;
  el.cards.style.display = 'block';
  el.cards.querySelectorAll('.card').forEach(b => b.addEventListener('click', () => {
    const k = Number(b.dataset.k);
    if (banMode) { if (EVOS[o.ids[k]] || o.ids[k] === 'pouch') return; banMode = false; doChoose(CHOICE.BAN + k); }
    else doChoose(k);
  }));
  $('#reroll').addEventListener('click', () => { banMode = false; doChoose(CHOICE.REROLL); });
  $('#ban').addEventListener('click', () => { banMode = !banMode; renderOffer(false); });
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
  state = 'pick'; banMode = false; closeMenu(); endDrag();
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
    const s = new Sprite({ texture: art.bolt, anchor: { x: 0, y: 0.5 }, tint: 0xd8c2ff });
    s.position.set(ax, ay - 10); s.rotation = Math.atan2(by - ay, bx - ax); s.scale.set(Math.hypot(bx - ax, by - ay) / 16, 1.8);
    fxLayer.addChild(s);
    gsap.to(s, { alpha: 0, duration: FEEL.zap.dur, ease: 'none', onComplete: () => s.destroy() });
    particles.burst(bx, by - 10, 0xc9a2ff, 4);
  }
}
function rainFx(x, y, r) {
  ringFx(x, y, r, 0x6fd3c4, 0.6);
  for (let k = 0; k < 7; k++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * r, tx = x + Math.cos(a) * d, ty = y + Math.sin(a) * d;
    const s = new Sprite({ texture: art.arrow, anchor: 0.5, tint: 0xbff7ee, rotation: Math.PI / 2, scale: 0.7 });
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
      case 'wallBreak': { const v = wallViews[ev.seg]; particles.burst(v.s.x, v.s.y, 0x9c7a4f, 16); shake(shakeEl, 'crit'); sfx.play('boom', { gain: 0.6 }); break; }
      case 'boom': particles.burst(ev.x, ev.y, 0xe07ab8, 20); shake(shakeEl, 'light'); sfx.play('boom', { gain: 0.4 }); break;
      case 'bldgDown': shake(shakeEl, 'crit'); sfx.play('boom'); break;
      case 'build': case 'wallBuild': sfx.play('perfect', { gain: 0.4 }); break;
      case 'produce': particles.burst(SLOTS[ev.slot][0], SLOTS[ev.slot][1] - 30, 0xf0c35a, 6); break;
      case 'prewarn': showWarn(ev); break;
      case 'eventStart': sfx.play('boom', { gain: 0.3 }); break;
      case 'eventClear': if (ev.pts) toastHint(`${EVENTS[ev.ev].name} 清除 +${ev.pts}${EVENTS[ev.ev].chest ? '　寶箱！' : ''}`); break;
      // card powers
      case 'explode': ringFx(ev.x, ev.y, ev.r, ev.inferno ? 0xff5a2a : 0xff8a3d); particles.burst(ev.x, ev.y, 0xff8a3d, ev.inferno ? 10 : 6); break;
      case 'zap': zapFx(ev.pts); if (performance.now() - lastZap > 80) { sfx.play('zap', { gain: 0.5 }); lastZap = performance.now(); } break;
      case 'thunder': flash(); shake(shakeEl, 'light'); break;
      case 'rain': rainFx(ev.x, ev.y, ev.r); sfx.play('whiff', { gain: 0.4 }); break;
      case 'winter': ringFx(CX, CY, ev.r, 0x8fd3ff, 1); particles.burst(CX, CY, 0xcfefff, 30); sfx.play('whiff', { pitch: 0.6 }); break;
      case 'react': ringFx(ev.x, ev.y, ev.r, ev.id === 'steam' ? 0xeaf6ff : ev.id === 'overload' ? 0xff6ad5 : 0x9fe0ff); break;
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
  const s = new Sprite({ texture: ev.kind === 'castle' ? art.bolt : ev.kind === 'archer' || ev.kind === 'split' ? art.arrow : art.dot, anchor: 0.5, tint: ev.kind === 'castle' ? COLORS.lamp : ev.kind === 'priest' ? 0xb6f0a0 : 0xffffff });
  s.scale.set(ev.kind === 'archer' ? 0.6 : ev.kind === 'split' ? 0.45 : ev.kind === 'castle' ? 1.4 : 0.35);
  s.position.set(ev.x, ev.y - 16); s.rotation = Math.atan2(ev.ty - ev.y, ev.tx - ev.x);
  fxLayer.addChild(s);
  gsap.to(s, { x: ev.tx, y: ev.ty - 8, duration: FEEL.shot.dur, ease: FEEL.shot.ease, onComplete: () => s.destroy() });
}
function showWarn(ev) {
  el.warn.textContent = `⚠ 6 秒後：${ev.name}${EVENTS[ev.ev].chest ? `（${(EVENTS[ev.ev].limit ?? EVENT_CLEAR_TICKS) / 60} 秒內清完得寶箱）` : ''}`;
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
  const left = Math.max(0, Math.ceil((MATCH_TICKS - s.tick) / 60));
  el.time.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  el.hp.style.transform = `scaleX(${Math.max(0, s.castle.hp) / CASTLE.hp})`;
  el.lv.textContent = `守望 Lv${s.level}`;
  el.xp.style.transform = `scaleX(${s.level >= LEVEL_MAX ? 1 : s.xp / XP_NEED(s.level)})`;
  renderBuild();
  const lr = lightR(s); light.scale.set(lr / 64); lightRing.scale.set(lr / 128); rangeRing.scale.set(lr / 128); rangeRing.position.set(CX, CY);

  s.slots.forEach((sl, i) => {
    const v = slotViews[i];
    v.s.visible = !!sl.kind; v.bar.visible = sl.kind === 'barracks';
    if (!sl.kind) { v.kind = ''; return; }
    if (v.kind !== sl.kind) { v.kind = sl.kind; gsap.fromTo(v.s.scale, { x: 0.3, y: 0.3 }, { x: 0.85, y: 0.85, duration: FEEL.build.dur, ease: FEEL.build.ease }); }
    v.s.tint = sl.build ? COLORS.site : COLORS[sl.kind];
    v.s.alpha = sl.build ? 0.6 : 1;
    v.bar.scale.set((sl.hp / BARRACKS.hp) * 5, 1);
  });
  const wmax = wallMaxHp(s);
  s.walls.forEach((w, i) => {
    const v = wallViews[i];
    v.s.visible = w.lv > 0;
    if (w.lv > 0) { const pct = w.hp / wmax; v.s.tint = COLORS.wall[Math.min(3, 1 + s.cards.stoneWall)]; v.s.alpha = pct < 0.3 ? 0.45 : pct < 0.6 ? 0.7 : 1; }
  });

  const seen = new Set();
  s.units.forEach((u, i) => {
    if (!u.alive) return;
    seen.add(i);
    const v = unitView(i, u);
    v.c.position.set(u.x / ONE, u.y / ONE); v.c.zIndex = u.y / ONE;
    v.body.alpha = u.state === 'moving' || u.state === 'setup' ? 0.6 : 1;
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
    v.s.tint = v.flashUntil > now ? 0xffffff : f.stun > 0 ? 0xe8f6ff : f.burn > 0 ? 0xff8a3d : f.slow > 0 ? 0x8fd3ff : COLORS[f.kind];
  }
  for (const [id, v] of foeViews) if (!live.has(id)) { v.s.destroy(); foeViews.delete(id); }

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

function start() {
  rec = new Recorder(GAME, SEED);
  bytes.length = 0; acc = 0; pendingChest = null; buildSig = '';
  for (const [, v] of unitViews) v.c.destroy({ children: true });
  for (const [, v] of foeViews) v.s.destroy();
  unitViews.clear(); foeViews.clear();
  el.panel.style.display = 'none'; el.cards.style.display = 'none'; el.chest.style.display = 'none';
  state = 'play';
  toastHint('點空地蓋軍營、點軍營買兵；按住小兵拖曳布陣');
  sync(performance.now());
}

function finish() {
  state = 'over'; closeMenu();
  el.cards.style.display = 'none'; el.chest.style.display = 'none';
  const s = sim(), b = scoreBreakdown(s), up = rec.upload(), v = verify(GAME, up);
  const win = s.bossDead, rows = [['擊殺', b.kills], ['事件清除', b.events], ['Boss', b.boss], ['主城耐久', b.castle], ['3 級老兵', b.veterans]];
  const evos = Object.keys(EVOS).filter(e => s.evo[e]).map(e => EVOS[e].name);
  el.panel.innerHTML = `<h1>${win ? '守住了！' : s.castle.hp <= 0 ? '燈熄了' : '天亮了'}</h1>
    <p>撐了 ${Math.floor(s.tick / 60)} 秒　擊殺 ${s.kills}　守望 Lv${s.level}${evos.length ? `　進化：${evos.join('、')}` : ''}</p>
    <table>${rows.map(([k, n]) => `<tr><td>${k}</td><td>${n}</td></tr>`).join('')}<tr class="total"><td>總分</td><td>${score(s)}</td></tr></table>
    <p style="opacity:.7;font-size:13px">${v.valid ? '重播驗證 ✓' : `重播驗證失敗：${v.reason}`}　種子 ${SEED}</p>
    <button id="again">再來一局</button>`;
  el.panel.style.display = 'block';
  gsap.fromTo(el.panel, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: FEEL.ui.in, ease: FEEL.ui.inEase });
  $('#again').addEventListener('click', () => { sfx.play('click'); start(); });
}

el.panel.innerHTML = `<h1>守望之戰</h1><p>怪從八方湧來，守住中央的主城 4 分 30 秒。</p>
  <ul class="rules">
    <li>打怪得<b style="color:var(--gold)">金</b>：蓋軍營、買兵、蓋城牆。</li>
    <li>打怪也累積<b>守望值</b>：升級時<b>三選一</b>張卡。同屬性湊齊觸發<b>羈絆</b>；特定兩張卡湊滿會<b>進化</b>。</li>
    <li>清掉有寶箱標記的事件、擊殺里程碑 → <b>寶箱</b>，一次升 1 / 3 / 5 張。</li>
    <li><b>按住小兵拖曳</b>到想守的位置；可重拖，但有 10 秒冷卻、走過去途中不攻擊。</li>
    <li>剋制：<b>弓打輕、劍打重、爆打牆</b>。紅色箭頭 = 6 秒後的事件方向。</li>
  </ul>
  <button id="go">開始</button>`;
$('#go').addEventListener('click', () => { sfx.unlock(); sfx.play('click'); start(); });
if (import.meta.env.DEV) {
  // Dev only: drive the same loop body without rAF (hidden previews throttle animation frames).
  window.__lh = {
    get sim() { return rec?.sim; }, get state() { return state; }, send, start, tapAt, toWorld, choose: doChoose,
    advance(n) { for (let k = 0; k < n && state === 'play'; k++) if (!tick()) break; if (state !== 'over') sync(performance.now()); app.render(); },
  };
}
