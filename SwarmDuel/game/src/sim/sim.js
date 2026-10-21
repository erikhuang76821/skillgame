// Deterministic match simulation (gdd/02, gdd/10). No DOM, Pixi, GSAP, Math.random or Date.
// Positions are integer sub-units (1 world unit = 256), one step = 1/60 s.
import { rng } from './rng.js';
import { COS, SIN, DX, DY, trunc } from './fixed.js';
import {
  ARENA, TUNING as T, ENEMIES, WAVES, EVENTS, UPGRADES, FALLBACK, SLOTS, WEAPONS, TREES,
} from './content.js';

export const SUB = 256;
export const TPS = 60;
export const MATCH_TICKS = 180 * TPS;
export const IN_DASH = 16;
export const IN_HOWL = 32;

const u = v => trunc(v * SUB);
const BEAMS = EVENTS.find(e => e.type === 'beams');

export function createSim(seed) {
  return {
    seed: seed >>> 0, tick: 0, nextId: 1, state: 'play', survived: false, recordEvents: true,
    player: {
      x: u(ARENA.w / 2), y: u(ARENA.h / 2), hp: T.hp, maxHp: T.hp, dir: 0, moving: false,
      dashT: 0, dashCd: 0, dashDir: 0, dashSeq: 0, invuln: 0, howl: 0, xp: 0, level: 1,
    },
    levels: { pinecone: 1 }, cds: { pinecone: 1, static_fur: 1 },
    enemies: [], shots: [], orbs: [], pickups: [], beams: [], flames: [],
    spawnIndex: 0, spawnAcc: 0, beamIndex: 0, levelups: 0, offer: null,
    kills: 0, combo: 0, maxCombo: 0, hits: 0, orbsCollected: 0, killScore10: 0, bonus: 0, grazes: 0, grazeScore10: 0,
    events: [],
  };
}

export const lvl = (sim, key) => sim.levels[key] | 0;

function emit(sim, ev) { if (sim.recordEvents) sim.events.push(ev); }

export function step(sim, input) {
  if (sim.state !== 'play') return sim;
  sim.tick++;
  updatePlayer(sim, input | 0);
  spawn(sim);
  updateEnemies(sim);
  updateWeapons(sim);
  updateShots(sim);
  updateBeams(sim);
  contact(sim);
  sweep(sim);
  updateOrbs(sim);
  if (sim.player.hp <= 0) end(sim, false);
  else if (sim.tick >= MATCH_TICKS) end(sim, true);
  else checkLevel(sim);
  return sim;
}

// ---------- player ----------
function updatePlayer(sim, input) {
  const p = sim.player, mv = input & 15;
  if (p.invuln > 0) p.invuln--;
  if (p.dashCd > 0) p.dashCd--;
  p.moving = mv >= 1 && mv <= 8;
  if (p.moving) p.dir = mv - 1;
  if ((input & IN_DASH) && p.dashCd === 0) {
    p.dashT = T.dashTicks; p.dashCd = T.dashCd; p.dashDir = p.dir; p.dashSeq++;
    emit(sim, { type: 'dash' });
  }
  if ((input & IN_HOWL) && p.howl >= T.howlCost) howl(sim);

  let spd = trunc(T.speed * SUB * (10 + lvl(sim, 'p_speed')) / (10 * TPS));
  let d = p.dir, go = p.moving;
  if (p.dashT > 0) { p.dashT--; spd *= T.dashMul; d = p.dashDir; go = true; }
  if (go) { p.x += trunc(spd * DX[d] / 256); p.y += trunc(spd * DY[d] / 256); }
  p.x = clamp(p.x, u(24), u(ARENA.w - 24));
  p.y = clamp(p.y, u(40), u(ARENA.h - 8));
  for (const t of TREES) pushOut(p, u(t.x), u(t.y), u(T.playerR + t.r));
}

export const playerInvulnerable = p => p.invuln > 0 || p.dashT >= T.dashTicks - T.dashInvuln;

function howl(sim) {
  const p = sim.player;
  p.howl = 0;
  const doubled = sim.combo >= T.howlComboGate;
  const dmg = T.howlDmg * (doubled ? 2 : 1), r = u(T.howlR);
  for (const e of sim.enemies) {
    const dx = e.x - p.x, dy = e.y - p.y, d2 = dx * dx + dy * dy;
    if (d2 > r * r) continue;
    damage(sim, e, dmg);
    if (!e.dead && !ENEMIES[e.kind].boss && d2 > 0) {
      const d = Math.sqrt(d2);
      e.knock = 10; e.kx = trunc(dx * u(6) / d); e.ky = trunc(dy * u(6) / d);
    }
  }
  emit(sim, { type: 'howl', x: p.x, y: p.y, doubled });
}

// ---------- spawning ----------
function spawn(sim) {
  const t = sim.tick;
  const w = WAVES.find(w => t > w.t0 * TPS && t <= w.t1 * TPS);
  if (w) {
    const span = (w.t1 - w.t0) * TPS;
    const r0 = trunc(w.rate[0] * 1000), r1 = trunc(w.rate[1] * 1000);
    sim.spawnAcc += r0 + trunc((r1 - r0) * (t - w.t0 * TPS) / span);
    while (sim.spawnAcc >= 1000 * TPS) {
      sim.spawnAcc -= 1000 * TPS;
      const i = sim.spawnIndex++;
      if (sim.enemies.length >= T.enemyCap) continue;
      spawnEnemy(sim, pickKind(sim.seed, w.kinds, i), rng(sim.seed, 'spawn', i) & 255, T.spawnR);
    }
  }
  for (const ev of EVENTS) {
    if (ev.at * TPS !== t) continue;
    if (ev.type === 'boss') spawnEnemy(sim, ev.enemy, rng(sim.seed, 'spawn', 1e6 + ev.at) & 255, T.bossR);
    if (ev.type === 'ring') {
      for (let i = 0; i < ev.count; i++) spawnEnemy(sim, ev.enemy, trunc(i * 256 / ev.count), ev.radius);
    }
    emit(sim, { type: ev.type, enemy: ev.enemy });
  }
}

function pickKind(seed, kinds, i) {
  let total = 0;
  for (const k in kinds) total += kinds[k];
  let r = rng(seed, 'kind', i) % total;
  for (const k in kinds) { r -= kinds[k]; if (r < 0) return k; }
  return Object.keys(kinds)[0];
}

function spawnEnemy(sim, kind, angle, radius) {
  const p = sim.player, def = ENEMIES[kind], id = sim.nextId++;
  sim.enemies.push({
    id, kind, hp: def.hp, flash: 0, fireCd: 0, grazed: 0, knock: 0, kx: 0, ky: 0, vx: 0, vy: 0, dead: false,
    x: clamp(p.x + trunc(COS[angle] * u(radius) / 256), u(16), u(ARENA.w - 16)),
    y: clamp(p.y + trunc(SIN[angle] * u(radius) / 256), u(16), u(ARENA.h - 16)),
    phase: rng(sim.seed, 'ai', id) % 90,
  });
}

// ---------- enemies ----------
function updateEnemies(sim) {
  const p = sim.player;
  for (const e of sim.enemies) {
    const def = ENEMIES[e.kind];
    if (e.flash > 0) e.flash--;
    if (e.fireCd > 0) e.fireCd--;
    if (e.knock > 0) { e.knock--; e.x += e.kx; e.y += e.ky; continue; }
    let spd = trunc(def.speed * SUB / TPS);
    if (def.behavior === 'dash' && (sim.tick + e.phase) % 90 < 20) spd *= 2;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0) { e.vx = trunc(dx * spd / d); e.vy = trunc(dy * spd / d); e.x += e.vx; e.y += e.vy; }
  }
  separate(sim.enemies);
  for (const e of sim.enemies) {
    e.x = clamp(e.x, u(16), u(ARENA.w - 16));
    e.y = clamp(e.y, u(16), u(ARENA.h - 16));
  }
}

// Pairwise push-apart through a spatial grid. Enemies are visited in id order and each pair is
// resolved once, so the result is identical on every run.
function separate(list) {
  const CELL = u(24), grid = new Map();
  for (const e of list) {
    const cx = trunc(e.x / CELL), cy = trunc(e.y / CELL);
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
      const cell = grid.get(gx * 4096 + gy);
      if (!cell) continue;
      for (const o of cell) {
        const dx = e.x - o.x, dy = e.y - o.y, d2 = dx * dx + dy * dy;
        const m = u(ENEMIES[e.kind].r + ENEMIES[o.kind].r);
        if (d2 >= m * m || d2 === 0) continue;
        const d = Math.sqrt(d2), push = (m - d) / 2;
        const px = trunc(dx * push / d), py = trunc(dy * push / d);
        e.x += px; e.y += py; o.x -= px; o.y -= py;
      }
    }
    const key = cx * 4096 + cy, cell = grid.get(key);
    if (cell) cell.push(e); else grid.set(key, [e]);
  }
}

// ---------- weapons ----------
function cooldown(sim, base) { return Math.max(1, trunc(base * (100 - 8 * lvl(sim, 'p_cooldown')) / 100)); }

function updateWeapons(sim) {
  const p = sim.player;
  const pine = lvl(sim, 'pinecone');
  if (pine && --sim.cds.pinecone <= 0) {
    const W = WEAPONS.pinecone, targets = nearest(sim, W.shots[pine - 1]);
    sim.cds.pinecone = targets.length ? cooldown(sim, W.cd) : 1;
    for (const e of targets) {
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1, s = u(W.speed / TPS);
      sim.shots.push({ id: sim.nextId++, x: p.x, y: p.y - u(16), vx: trunc(dx * s / d), vy: trunc(dy * s / d),
        life: W.life, dmg: W.dmg[pine - 1], dead: false });
    }
  }
  const fire = lvl(sim, 'campfire');
  sim.flames.length = 0;
  if (fire) {
    const W = WEAPONS.campfire, n = fire + 1, R = u(W.radius);
    for (let i = 0; i < n; i++) {
      const a = (sim.tick * W.spin + trunc(i * 256 / n)) & 255;
      const fx = p.x + trunc(COS[a] * R / 256), fy = p.y - u(10) + trunc(SIN[a] * R / 256);
      sim.flames.push({ x: fx, y: fy });
      for (const e of sim.enemies) {
        if (e.dead || e.fireCd > 0) continue;
        const r = u(8 + ENEMIES[e.kind].r), dx = e.x - fx, dy = e.y - fy;
        if (dx * dx + dy * dy < r * r) { e.fireCd = W.hitCd; damage(sim, e, W.dmg[fire - 1]); }
      }
    }
  }
  const fur = lvl(sim, 'static_fur');
  if (fur && --sim.cds.static_fur <= 0) {
    const W = WEAPONS.static_fur, R = u(W.radius[fur - 1]);
    sim.cds.static_fur = cooldown(sim, W.cd);
    for (const e of sim.enemies) {
      const dx = e.x - p.x, dy = e.y - p.y;
      if (dx * dx + dy * dy < R * R) damage(sim, e, W.dmg[fur - 1]);
    }
    emit(sim, { type: 'zap' });
  }
}

function nearest(sim, n) {
  const p = sim.player, list = [];
  for (const e of sim.enemies) {
    if (e.dead) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    list.push({ e, d2: dx * dx + dy * dy });
  }
  list.sort((a, b) => a.d2 - b.d2 || a.e.id - b.e.id);
  return list.slice(0, n).map(v => v.e);
}

function updateShots(sim) {
  const R = WEAPONS.pinecone.r;
  for (const s of sim.shots) {
    s.x += s.vx; s.y += s.vy;
    if (--s.life <= 0) { s.dead = true; continue; }
    for (const e of sim.enemies) {
      if (e.dead) continue;
      const r = u(R + ENEMIES[e.kind].r), dx = e.x - s.x, dy = e.y - s.y;
      if (dx * dx + dy * dy < r * r) { damage(sim, e, s.dmg); s.dead = true; break; }
    }
  }
}

function damage(sim, e, dmg) {
  if (e.dead) return;
  const dealt = trunc(dmg * (10 + lvl(sim, 'p_might')) / 10);
  e.hp -= dealt;
  e.flash = 6;
  emit(sim, { type: 'hit', x: e.x, y: e.y, dmg: dealt }); // render-only (damage numbers)
  if (e.hp <= 0) kill(sim, e);
}

function kill(sim, e) {
  const def = ENEMIES[e.kind], p = sim.player;
  e.dead = true;
  sim.kills++; sim.combo++;
  if (sim.combo > sim.maxCombo) sim.maxCombo = sim.combo;
  p.howl = Math.min(T.howlCost, p.howl + 1);
  sim.killScore10 += def.pts * comboMult10(sim);
  dropOrb(sim, e.x, e.y, def.boss ? 20 : 1);
  if (sim.kills % T.hotdogEvery === 0) sim.pickups.push({ id: sim.nextId++, x: e.x, y: e.y, dead: false });
  emit(sim, { type: 'kill', x: e.x, y: e.y, boss: !!def.boss });
}

export const comboMult10 = sim => Math.min(30, 10 + trunc(sim.combo / 10));

// ---------- hazards & contact ----------
function updateBeams(sim) {
  const p = sim.player;
  if (sim.tick >= BEAMS.at * TPS && (sim.tick - BEAMS.at * TPS) % BEAMS.every === 0) {
    const i = sim.beamIndex++, a = rng(sim.seed, 'beam', i) & 255, dist = u(rng(sim.seed, 'beam', i + 1e5) % 121);
    sim.beams.push({ id: sim.nextId++, x: p.x + trunc(COS[a] * dist / 256), y: p.y + trunc(SIN[a] * dist / 256),
      warn: BEAMS.warn, live: BEAMS.live, dead: false });
  }
  for (const b of sim.beams) {
    if (b.warn > 0) { b.warn--; continue; }
    if (--b.live <= 0) b.dead = true;
    const r = u(BEAMS.radius + T.playerR), dx = p.x - b.x, dy = p.y - b.y;
    if (dx * dx + dy * dy < r * r && !playerInvulnerable(p)) hurt(sim, BEAMS.dmg);
  }
}

function contact(sim) {
  const p = sim.player;
  for (const pk of sim.pickups) {
    const dx = p.x - pk.x, dy = p.y - pk.y, r = u(18);
    if (dx * dx + dy * dy < r * r) {
      pk.dead = true;
      p.hp = Math.min(p.maxHp, p.hp + T.hotdogHeal);
      emit(sim, { type: 'heal' });
    }
  }
  if (p.dashT >= T.dashTicks - T.dashInvuln) { graze(sim); return; }
  if (playerInvulnerable(p)) return;
  for (const e of sim.enemies) {
    if (e.dead) continue;
    const r = u(T.playerR + ENEMIES[e.kind].r), dx = p.x - e.x, dy = p.y - e.y;
    if (dx * dx + dy * dy < r * r) { hurt(sim, ENEMIES[e.kind].atk); return; }
  }
}

// Perfect Dodge: passing through an enemy during the dash's i-frames is a timing skill, rewarded
// once per enemy per dash (score x combo, Howl charge) and it does not break the combo (gdd/03).
function graze(sim) {
  const p = sim.player;
  for (const e of sim.enemies) {
    if (e.dead || e.grazed === p.dashSeq) continue;
    const r = u(T.playerR + ENEMIES[e.kind].r + T.grazeMargin), dx = p.x - e.x, dy = p.y - e.y;
    if (dx * dx + dy * dy >= r * r) continue;
    e.grazed = p.dashSeq;
    sim.grazes++;
    sim.grazeScore10 += T.grazePts * comboMult10(sim);
    p.howl = Math.min(T.howlCost, p.howl + T.grazeHowl);
    emit(sim, { type: 'graze', x: e.x, y: e.y });
  }
}

function hurt(sim, atk) {
  const p = sim.player;
  p.hp -= atk; p.invuln = T.invulnTicks;
  sim.combo = 0; sim.hits++;
  emit(sim, { type: 'hurt' });
}

function sweep(sim) {
  for (const key of ['enemies', 'shots', 'pickups', 'beams']) {
    if (sim[key].some(v => v.dead)) sim[key] = sim[key].filter(v => !v.dead);
  }
}

// ---------- orbs & levels ----------
function dropOrb(sim, x, y, v) {
  if (sim.orbs.length >= T.orbCap) { sim.orbs[sim.kills % T.orbCap].v += v; return; }
  sim.orbs.push({ id: sim.nextId++, x, y, v, homing: false, dead: false });
}

function updateOrbs(sim) {
  const p = sim.player, pick = u(T.pickup);
  const mag = u(trunc(T.magnet * (100 + 25 * lvl(sim, 'p_magnet')) / 100));
  let any = false;
  for (const o of sim.orbs) {
    const dx = p.x - o.x, dy = p.y - o.y, d2 = dx * dx + dy * dy;
    if (!o.homing && d2 < mag * mag) o.homing = true;
    if (!o.homing) continue;
    if (d2 <= pick * pick) { o.dead = true; any = true; p.xp += o.v; sim.orbsCollected += o.v; continue; }
    const d = Math.sqrt(d2), s = Math.min(u(7), d);
    o.x += trunc(dx * s / d); o.y += trunc(dy * s / d);
  }
  if (any) sim.orbs = sim.orbs.filter(o => !o.dead);
}

export const xpNeed = level => 5 + 3 * level;

function checkLevel(sim) {
  const p = sim.player;
  if (sim.state !== 'play' || p.xp < xpNeed(p.level)) return;
  p.xp -= xpNeed(p.level);
  p.level++;
  sim.levelups++;
  sim.offer = makeOffer(sim);
  sim.state = 'levelup';
  emit(sim, { type: 'levelup' });
}

// Offer k = the whole pool shuffled by rng(seed,'offer',k), first three still-eligible entries.
// Same seed + same level-up count => same shuffle for every player (gdd/02).
export function makeOffer(sim) {
  const used = { weapon: 0, passive: 0 };
  for (const k in sim.levels) used[UPGRADES[k].type]++;
  const ok = k => {
    const cur = lvl(sim, k), type = UPGRADES[k].type;
    return cur < UPGRADES[k].max && (cur > 0 || used[type] < SLOTS[type]);
  };
  const offer = Object.keys(UPGRADES)
    .map((k, i) => ({ k, r: rng(sim.seed, 'offer', sim.levelups * 64 + i) }))
    .sort((a, b) => a.r - b.r || (a.k < b.k ? -1 : 1))
    .map(v => v.k)
    .filter(ok)
    .slice(0, 3);
  for (let i = 0; offer.length < 3; i++) offer.push(FALLBACK[i % FALLBACK.length]);
  return offer;
}

export function choose(sim, index) {
  if (sim.state !== 'levelup') return false;
  const key = sim.offer[index];
  if (key === undefined) return false;
  const p = sim.player;
  if (key === 'snack') p.hp = Math.min(p.maxHp, p.hp + 30);
  else if (key === 'bounty') sim.bonus += 100;
  else {
    sim.levels[key] = lvl(sim, key) + 1;
    if (key === 'p_hp') { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); }
  }
  sim.offer = null;
  sim.state = 'play';
  emit(sim, { type: 'chose', key });
  checkLevel(sim);
  return true;
}

function end(sim, survived) {
  sim.state = 'over';
  sim.survived = survived;
  emit(sim, { type: 'over', survived });
}

// Fully transparent scoring (shown to the player as a breakdown on the results screen).
export function scoreBreakdown(sim) {
  return {
    kills: trunc(sim.killScore10 / 10),
    dodges: trunc(sim.grazeScore10 / 10),
    ecto: sim.orbsCollected,
    survival: sim.survived ? T.survivalBonus : 0,
    bonus: sim.bonus,
  };
}

export function score(sim) {
  const b = scoreBreakdown(sim);
  return b.kills + b.dodges + b.ecto + b.survival + b.bonus;
}

// ---------- utils ----------
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function pushOut(p, x, y, min) {
  const dx = p.x - x, dy = p.y - y, d2 = dx * dx + dy * dy;
  if (d2 >= min * min || d2 === 0) return;
  const d = Math.sqrt(d2);
  p.x = x + trunc(dx * min / d); p.y = y + trunc(dy * min / d);
}

export function stateHash(sim) {
  let h = (0x9e3779b9 ^ sim.tick) >>> 0;
  const mix = v => { h = Math.imul(h ^ (v | 0), 0x01000193) >>> 0; };
  const p = sim.player;
  [p.x, p.y, p.hp, p.xp, p.level, sim.kills, sim.hits, sim.orbsCollected, sim.killScore10, sim.grazeScore10, sim.enemies.length].forEach(mix);
  for (const e of sim.enemies) { mix(e.id); mix(e.x); mix(e.y); mix(e.hp); }
  return h;
}
