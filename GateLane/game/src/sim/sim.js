// Gate Lane — gate-and-barrel lane shooter (spec: GateLane/gdd/05_game_spec.md).
// Deterministic: integers only, no rendering, no wall clock, no unseeded randomness.
// The whole course is generated from the seed in createSim(); afterwards nothing random happens,
// so the challenge depends only on the seed (fairness E2). Same seed + same input bytes = same score.
import { makeRng, createHasher, TPS } from './core/index.js';

export { TICK_MS } from './core/index.js';

// --- Spec §3 random streams (never renumber after release) ---
const rng = makeRng({ course: 1 });

// --- Spec §0 / §5 / §6 tuning ---
export const LANE_W = 600;
export const VIEW_AHEAD = 1000;
export const MAX_TICKS = 110 * TPS;
export const RULES = Object.freeze({
  startTroops: 5, runSpeed: 4, moveSpeed: 12,
  firePeriod: 8, maxBullets: 9, bulletSpeed: 20, bulletRange: 1000,
  troopCap: 9999, weaponCap: 6, pumpMax: 6,
  zombieHome: 1, homeRange: 400, zombieR: 14, biteDiv: 25, armoredBite: 3, armoredHpMul: 4,
  barrelHalf: 30, barrelHitDiv: 10, crashMaxPct: 40,
  bossHpPerRef: 35, bossHalf: 110, bossDepth: 40, bossStopGap: 900, bossSpeed: 1, bossSway: 120, bossSwayPeriod: 240,
  ptsKill: 2, ptsArmored: 6, ptsBarrel: 50, ptsBoss: 300, ptsBossSec: 30, bossDmgPerPt: 100,
});

/** Damage per soldier per volley, in tenths, by weapon level: higher levels mostly add bullets (coverage). */
export const WEAPON_DMG = [0, 10, 12, 14, 16, 18, 20];

// --- Course script (spec §5, knowledge-base/16 §2): waves of WAVE_LEN px (4 s); each level adds ONE new thing ---
export const WAVE_LEN = 960;
export const LEVELS = Object.freeze({
  1: { groups: [6], gate: 'easy', hits: 6 },                                                    // one group, one obvious gate
  2: { groups: [6, 6], gate: 'easy', hits: 14 },                                                // two groups: pick which to shoot
  3: { groups: [7, 7], gate: 'easy', hits: 14, barrel: 'weapon' },                              // + weapon barrel to break
  4: { groups: [8, 8], gate: 'neg', hits: 15, barrel: 'weapon' },                               // + a negative gate
  5: { groups: [8, 8], gate: 'mul', hits: 16, barrel: 'weapon' },                               // + ×2 vs +N (depends on your army)
  6: { groups: [9, 9], gate: 'neg', hits: 17, barrel: 'weapon', armored: 2 },                   // + armoured zombies
  7: { groups: [9, 9], gate: 'easy', hits: 13, armored: 2, speed: 3 },                        // + fast zombies
  8: { groups: [7, 7, 7], gate: 'bothNeg', hits: 12, armored: 1, speed: 3, barrel: 'dodge' }, // + third group, both gates bad, a barrel to dodge
  B: { groups: [6], gate: 'easy', hits: 8, barrel: 'troops' },                                  // breather: one easy group, a gift barrel
});
export const SCRIPT = Object.freeze([
  { id: 'W', name: '暖身', waves: [1, 1], warmup: true },
  { id: 'A', name: '起手', waves: [2, 2, 3, 3] },
  { id: 'R1', name: '調息', waves: ['B'], breather: true },
  { id: 'B', name: '交鋒', waves: [3, 4, 4, 5] },
  { id: 'R2', name: '調息', waves: ['B'], breather: true },
  { id: 'C', name: '激戰', waves: [5, 6, 6, 7] },
  { id: 'R3', name: '調息', waves: ['B'], breather: true },
  { id: 'D', name: '決戰', waves: [7, 7, 8, 8] },
]);
export const COURSE_START = 500;
const WAVES = SCRIPT.flatMap((g, seg) => g.waves.map(level => ({ seg, level })));

/** Designer's reference army for an average player, wave by wave (integer, +30% a wave). Sizes HP, gates, barrels. */
export const REF_TROOPS = (() => { const a = []; let t = 8; for (let i = 0; i < WAVES.length + 1; i++) { a.push(t); t = Math.trunc((t * 13) / 10); } return a; })();
export const REF_DMG = REF_TROOPS.map(t => Math.max(1, Math.trunc(t / 3)));   // reference damage per bullet

export const BOSS_AT = COURSE_START + WAVES.length * WAVE_LEN + 900;
export const BOSS_STOP = BOSS_AT - RULES.bossStopGap;
export const BOSS_HP = REF_TROOPS[WAVES.length] * RULES.bossHpPerRef;

/** Curve units for tools/playtest.mjs (knowledge-base/16): one wave each, grouped into the script's segments. */
export const CURVE = Object.freeze({
  segments: SCRIPT,
  units: WAVES.map((w, i) => ({ i, seg: w.seg, level: w.level, from: COURSE_START + i * WAVE_LEN, to: COURSE_START + (i + 1) * WAVE_LEN, refDmg: REF_DMG[i] })),
});
const GROUP_OFFSETS = [100, 460, 280], BARREL_OFFSET = 300, GATE_OFFSET = 760;

/** Integer square root (no float sqrt in the sim). */
export function isqrt(n) {
  if (n < 2) return n;
  let x = n, y = (x + 1) >> 1;
  while (y < x) { x = y; y = (x + Math.trunc(n / x)) >> 1; }
  return x;
}

export const halfWidth = troops => Math.min(140, 10 + 6 * isqrt(Math.max(troops, 1)));

function buildCourse(seed) {
  const zombies = [], gates = [], barrels = [];
  let zid = 0, gid = 0, bid = 0;
  const group = (n, hp, cx, y, armored, spd, bite) => {
    const cols = Math.min(n, 6);
    for (let i = 0; i < n; i++) {
      const col = i % cols, row = Math.trunc(i / cols);
      const arm = i >= n - armored;
      const h = arm ? hp * RULES.armoredHpMul : hp;
      zombies.push({ id: zid++, x: cx + (col - (cols - 1) / 2) * 30 | 0, y: y + row * 30, hp: h, maxHp: h, armored: arm ? 1 : 0, spd, bite: arm ? bite * RULES.armoredBite : bite, active: 0 });
    }
  };
  WAVES.forEach(({ level }, wi) => {
    const L = LEVELS[level], base = COURSE_START + wi * WAVE_LEN, ref = REF_TROOPS[wi], dmg = REF_DMG[wi];
    let k = 0;
    const r = (lo, hi) => rng.range(seed, 'course', wi * 64 + k++, lo, hi);
    const hp = Math.max(1, Math.trunc((dmg * L.hits) / 10)), spd = L.speed ?? 2;
    // Groups: seeded x, never both on the same side so the player has to choose what to shoot.
    const firstLeft = r(0, 1) === 0;
    L.groups.forEach((n, gi) => {
      const half = Math.min(n, 6) * 15, left = gi === 2 ? r(0, 1) === 0 : (gi === 0) === firstLeft;
      const cx = left ? r(40 + half, 300) : r(300, LANE_W - 40 - half);
      group(n, hp, cx, base + GROUP_OFFSETS[gi], L.armored ?? 0, spd, Math.max(1, Math.trunc(ref / RULES.biteDiv)));
    });
    if (L.barrel) {
      const bhp = L.barrel === 'weapon' ? dmg * 12 : L.barrel === 'dodge' ? dmg * 80 : dmg * 6;
      barrels.push({ id: bid++, x: r(90, LANE_W - 90), y: base + BARREL_OFFSET, hp: bhp, maxHp: bhp, reward: L.barrel === 'weapon' ? 'weapon' : 'troops', amount: L.barrel === 'weapon' ? 1 : Math.trunc(ref / 8) });
    }
    // Gate row: the good side is seeded; values scale with the reference army so late gates still matter.
    const sc = Math.max(1, Math.trunc(ref / 10)), goodLeft = r(0, 1) === 0, y = base + GATE_OFFSET;
    const add = (lo, hi, sign = 1) => ({ kind: 'add', v: sign * r(lo, hi) * sc, step: Math.max(1, sc >> 1) });
    let good, bad;
    if (L.gate === 'easy') { good = add(2, 4); bad = add(0, 1); }
    else if (L.gate === 'neg') { good = add(1, 2); bad = add(4, 8, -1); }
    else if (L.gate === 'mul') { good = { kind: 'mul', v: 2, step: 0 }; bad = add(4, 7); }   // ×2 beats +N only once your army is past the reference
    else { good = add(1, 2, -1); bad = add(5, 9, -1); }                                       // bothNeg: pick the lesser evil (or pump it)
    gates.push({ id: gid++, y, side: 0, ...(goodLeft ? good : bad), hits: 0 });
    gates.push({ id: gid++, y, side: 1, ...(goodLeft ? bad : good), hits: 0 });
  });
  // Escort wave that walks in with the boss.
  const escortHp = REF_DMG[WAVES.length] * 2;
  for (let i = 0; i < 3; i++) group(12, escortHp, [150, 300, 450][i], BOSS_AT - 200 + i * 90, 0, 2, Math.max(1, Math.trunc(REF_TROOPS[WAVES.length] / RULES.biteDiv)));
  return { zombies, gates, barrels };
}

export function createSim(seed) {
  const course = buildCourse(seed >>> 0);
  return {
    seed: seed >>> 0, tick: 0, dist: 0, sx: LANE_W >> 1, target: LANE_W >> 1,
    troops: RULES.startTroops, weapon: 1, peakTroops: RULES.startTroops,
    zombies: course.zombies, gates: course.gates, barrels: course.barrels, bullets: [],
    boss: { x: LANE_W >> 1, y: BOSS_AT, hp: BOSS_HP, maxHp: BOSS_HP, active: 0 },
    score: 0, kills: 0, armoredKills: 0, barrelsBroken: 0, gatesPumped: 0, bossDmgPts: 0, bossBonus: 0, survivorBonus: 0,
    result: 0,   // 0 running, 1 win, -1 lose
    events: [], recordEvents: true,
  };
}

const emit = (sim, ev) => { if (sim.recordEvents) sim.events.push(ev); };

function hurt(sim, n, x, cause, id = -1) {
  sim.troops = Math.max(0, sim.troops - n);
  emit(sim, { type: 'hurt', n, x, cause, id });
  if (sim.troops === 0) end(sim, -1);
}

function end(sim, result) {
  if (sim.result) return;
  sim.result = result;
  sim.bossDmgPts = Math.trunc((sim.boss.maxHp - sim.boss.hp) / RULES.bossDmgPerPt);
  sim.score += sim.bossDmgPts;
  if (result === 1) {
    const secs = Math.trunc(Math.max(0, sim.boss.y - sim.dist) / (RULES.bossSpeed * TPS));
    sim.bossBonus = RULES.ptsBoss + secs * RULES.ptsBossSec;
    sim.survivorBonus = sim.troops;
    sim.score += sim.bossBonus + sim.survivorBonus;
  }
  emit(sim, { type: 'over', win: result === 1 });
}

function fire(sim) {
  const k = Math.min(sim.troops, 2 + sim.weapon, RULES.maxBullets);
  const dmg = Math.ceil((sim.troops * WEAPON_DMG[sim.weapon]) / (10 * k));
  const hw = halfWidth(sim.troops);
  for (let i = 0; i < k; i++) {
    const x = k === 1 ? sim.sx : sim.sx - hw + Math.trunc((2 * hw * i) / (k - 1));
    sim.bullets.push({ x, y: sim.dist, dmg });
  }
}

function killZombie(sim, z) {
  z.hp = 0;
  if (z.armored) { sim.armoredKills++; sim.score += RULES.ptsArmored; } else { sim.kills++; sim.score += RULES.ptsKill; }
  emit(sim, { type: 'kill', id: z.id, x: z.x, y: z.y, armored: z.armored });
}

function moveBullets(sim) {
  const { zombies, gates, barrels, boss } = sim;
  const R = RULES.zombieR, bh = RULES.barrelHalf;
  const hits = [];
  let w = 0;
  for (const b of sim.bullets) {
    const y0 = b.y, y1 = b.y + RULES.bulletSpeed;
    hits.length = 0;
    for (const z of zombies) {
      if (z.hp > 0 && z.active && z.y > y0 - R && z.y <= y1 + R && z.x - R <= b.x && b.x <= z.x + R) hits.push(z.y, 0, z);
    }
    for (const g of gates) {
      if (g.kind === 'add' && g.hits < RULES.pumpMax && !g.used && g.y > y0 && g.y <= y1 && (b.x < LANE_W >> 1) === (g.side === 0)) hits.push(g.y, 1, g);   // a maxed gate lets bullets through
    }
    for (const br of barrels) {
      if (br.hp > 0 && br.y - bh > y0 && br.y - bh <= y1 && Math.abs(br.x - b.x) <= bh) hits.push(br.y - bh, 2, br);
    }
    if (boss.active && boss.hp > 0) {
      const by = boss.y - RULES.bossDepth;
      if (by > y0 && by <= y1 && Math.abs(boss.x - b.x) <= RULES.bossHalf) hits.push(by, 3, boss);
    }
    // Resolve nearest first (y, then kind, then id) so the order never depends on array layout.
    const order = [];
    for (let i = 0; i < hits.length; i += 3) order.push(i);
    order.sort((a, c) => hits[a] - hits[c] || hits[a + 1] - hits[c + 1] || (hits[a + 2].id ?? 0) - (hits[c + 2].id ?? 0));
    let alive = true;
    for (const i of order) {
      const kind = hits[i + 1], t = hits[i + 2];
      if (kind === 0) {
        t.hp = Math.max(0, t.hp - b.dmg);
        if (t.hp === 0) killZombie(sim, t);
        alive = false; break;
      } else if (kind === 1) {
        t.v += t.step; t.hits++; sim.gatesPumped++; emit(sim, { type: 'gateHit', id: t.id, v: t.v });
        alive = false; break;
      } else if (kind === 2) {
        t.hp = Math.max(0, t.hp - b.dmg);
        emit(sim, { type: 'barrelHit', id: t.id });
        if (t.hp === 0) breakBarrel(sim, t);
        alive = false; break;
      } else {
        t.hp = Math.max(0, t.hp - b.dmg);
        emit(sim, { type: 'bossHit', dmg: b.dmg });
        if (t.hp === 0) { emit(sim, { type: 'bossDead', x: t.x, y: t.y }); end(sim, 1); }
        alive = false; break;
      }
    }
    if (alive && y1 - sim.dist < RULES.bulletRange) { b.y = y1; sim.bullets[w++] = b; }
  }
  sim.bullets.length = w;
}

function breakBarrel(sim, br) {
  sim.barrelsBroken++;
  sim.score += RULES.ptsBarrel;
  if (br.reward === 'weapon') sim.weapon = Math.min(RULES.weaponCap, sim.weapon + 1);
  else sim.troops = Math.min(RULES.troopCap, sim.troops + br.amount);
  sim.peakTroops = Math.max(sim.peakTroops, sim.troops);
  emit(sim, { type: 'barrel', id: br.id, x: br.x, y: br.y, reward: br.reward, weapon: sim.weapon, troops: sim.troops });
}

function moveZombies(sim) {
  const hw = halfWidth(sim.troops);
  for (const z of sim.zombies) {
    if (z.hp <= 0) continue;
    if (!z.active) { if (z.y - sim.dist <= VIEW_AHEAD) z.active = 1; else continue; }
    z.y -= z.spd;
    if (z.y - sim.dist <= RULES.homeRange) z.x += Math.sign(sim.sx - z.x) * Math.min(RULES.zombieHome, Math.abs(sim.sx - z.x));
    if (z.y - sim.dist <= 0) {
      if (Math.abs(z.x - sim.sx) <= hw + RULES.zombieR) {
        z.hp = 0;
        hurt(sim, z.bite, z.x, 'zombie', z.id);
        if (sim.result) return;
      } else if (z.y - sim.dist < -40) z.hp = 0;   // walked past: gone, no penalty
    }
  }
}

function touchBarrels(sim) {
  const hw = halfWidth(sim.troops);
  for (const br of sim.barrels) {
    if (br.hp <= 0 || br.y - RULES.barrelHalf > sim.dist) continue;
    if (Math.abs(br.x - sim.sx) <= hw + RULES.barrelHalf) {
      const n = Math.min(Math.ceil(br.hp / RULES.barrelHitDiv), Math.ceil((sim.troops * RULES.crashMaxPct) / 100));
      br.hp = 0;
      emit(sim, { type: 'crash', id: br.id });
      hurt(sim, n, br.x, 'barrel', br.id);
      if (sim.result) return;
    } else if (br.y + RULES.barrelHalf < sim.dist) br.hp = 0;
  }
}

function passGates(sim, prevDist) {
  for (let i = 0; i < sim.gates.length; i += 2) {
    const g = sim.gates[i];
    if (g.used || !(g.y > prevDist && g.y <= sim.dist)) continue;
    const pick = sim.sx < LANE_W >> 1 ? sim.gates[i] : sim.gates[i + 1];
    sim.gates[i].used = sim.gates[i + 1].used = 1;
    const before = sim.troops;
    sim.troops = pick.kind === 'mul' ? sim.troops * pick.v : sim.troops + pick.v;
    sim.troops = Math.min(RULES.troopCap, Math.max(0, sim.troops));
    sim.peakTroops = Math.max(sim.peakTroops, sim.troops);
    emit(sim, { type: 'gate', id: pick.id, kind: pick.kind, v: pick.v, before, after: sim.troops });
    if (sim.troops === 0) { emit(sim, { type: 'hurt', n: before, x: sim.sx, cause: 'gate' }); end(sim, -1); return; }
  }
}

function moveBoss(sim) {
  const b = sim.boss;
  if (!b.active) {
    if (sim.dist >= BOSS_STOP) { b.active = 1; emit(sim, { type: 'boss' }); }
    else return;
  }
  b.y -= RULES.bossSpeed;
  const p = sim.tick % RULES.bossSwayPeriod, half = RULES.bossSwayPeriod >> 1;
  const tri = p < half ? p : RULES.bossSwayPeriod - p;
  b.x = (LANE_W >> 1) - RULES.bossSway + Math.trunc((2 * RULES.bossSway * tri) / half);
  if (b.y - sim.dist <= 0) { emit(sim, { type: 'bossReached' }); end(sim, -1); }
}

/** Spec §4 tick order. */
export function step(sim, input) {
  sim.events.length = 0;
  if (sim.result || sim.tick >= MAX_TICKS) return;

  if (input) sim.target = Math.trunc(((input - 1) * LANE_W + 127) / 254);
  const dx = sim.target - sim.sx;
  sim.sx += Math.sign(dx) * Math.min(RULES.moveSpeed, Math.abs(dx));

  const prev = sim.dist;
  if (sim.dist < BOSS_STOP) sim.dist = Math.min(BOSS_STOP, sim.dist + RULES.runSpeed);

  if (sim.tick % RULES.firePeriod === 0) fire(sim);
  moveBullets(sim);
  if (!sim.result) moveZombies(sim);
  if (!sim.result) touchBarrels(sim);
  if (!sim.result) passGates(sim, prev);
  if (!sim.result) moveBoss(sim);
  sim.tick++;
  if (!sim.result && sim.tick >= MAX_TICKS) end(sim, -1);
}

/** Client steering: lane px per tick while a steer key is held (spec §2). Not read by step(). */
export const KEY_STEP = 10;

/** Byte a client sends for lane position x (0..600). */
export const encodeX = x => 1 + Math.round((Math.max(0, Math.min(LANE_W, x)) * 254) / LANE_W);

export const phase = sim => (sim.result || sim.tick >= MAX_TICKS ? 'over' : 'play');
export const score = sim => sim.score;
export const scoreBreakdown = sim => ({
  win: sim.result === 1 ? 1 : 0, kills: sim.kills, armored: sim.armoredKills, barrels: sim.barrelsBroken,
  bossDmg: sim.bossDmgPts, bossBonus: sim.bossBonus, survivors: sim.survivorBonus, peakTroops: sim.peakTroops,
  bossSecs: sim.result === 1 ? (sim.bossBonus - RULES.ptsBoss) / RULES.ptsBossSec : 0,
  // Why the run ended (read-only, derived from state): 'win' | 'wiped' (troops hit 0) | 'timeout' | 'boss' (boss reached the squad)
  cause: sim.result === 1 ? 'win' : sim.troops === 0 ? 'wiped' : sim.tick >= MAX_TICKS ? 'timeout' : 'boss',
});

export function stateHash(sim) {
  const h = createHasher(sim.tick).mixAll([
    sim.dist, sim.sx, sim.target, sim.troops, sim.weapon, sim.score, sim.result,
    sim.kills, sim.armoredKills, sim.barrelsBroken, sim.gatesPumped,
    sim.boss.x, sim.boss.y, sim.boss.hp, sim.boss.active, sim.bullets.length,
  ]);
  for (const z of sim.zombies) h.mix(z.x).mix(z.y).mix(z.hp);
  for (const g of sim.gates) h.mix(g.v).mix(g.used | 0);
  for (const b of sim.barrels) h.mix(b.hp);
  for (const b of sim.bullets) h.mix(b.x).mix(b.y).mix(b.dmg);
  return h.value();
}

/** GameDef consumed by core/match.js (Recorder, replay, verify) and tools/skill-dominance.mjs. */
export const GAME = Object.freeze({
  id: 'gate-lane', version: 3, maxTicks: MAX_TICKS,
  createSim, step, phase, score, stateHash, scoreBreakdown,
});
