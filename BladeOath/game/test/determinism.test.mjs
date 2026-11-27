// Game-rule determinism and fairness for BladeOath v5 (spec gdd/05 §12). Test names of the template are kept.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Recorder, playMatch, verify, replay } from '../src/sim/core/index.js';
import {
  GAME, S, FOES, SKILLS, COMBO, STAGES, PROPS, SCORE_MAX, PARRY_WIN, PERFECT_DODGE_WIN, DODGE_IFRAME_FROM, CONTROL_CAP, XP_DECAY_PCT,
  SLAM_SPEED, DEPTH, HIT_Z, GRAB_PUSH, GRAB_TICKS, VIEW_W, CH_ROUTE, CH_LEAVE, FACE_LEFT, FACE_RIGHT,
  bodyR, hitReaches, createSim, step, choose, layout, encodeInput, ACT_BLOCK, ACT_DODGE, ACT_ATTACK, ACT_JUMP,
} from '../src/sim/sim.js';
import { STRATEGIES } from '../tools/strategies.mjs';
import { runEvidence } from '../tools/lib/evidence.mjs';

const play = role => Object.values(STRATEGIES).find(s => s.role === role).policy;
const STRONG = play('strong'), SIMPLE = play('simple'), RANDOM = play('random');
const PX = 256;
const RIGHT = 2, UP = 4;

test('same seed + same inputs => identical result', () => {
  assert.deepEqual(playMatch(GAME, 1234, STRONG).result(), playMatch(GAME, 1234, STRONG).result());
});

const GOLDEN = { ticks: 18764, score: 12600, hash: 3640265960 };
test('golden match (cross-engine determinism; update only when GAME.version is bumped)', () => {
  assert.deepEqual(playMatch(GAME, 1234, STRONG).result(),
    { game: 'blade-oath', version: 6, seed: 1234, ticks: GOLDEN.ticks, score: GOLDEN.score, hash: GOLDEN.hash });
});

test('uploaded match verifies; tampered score, version or mound choices do not', () => {
  const up = playMatch(GAME, 98765, STRONG).upload();
  assert.ok(up.choices.length > 0, 'the strong strategy uses the mound panel and the route choice');
  assert.equal(verify(GAME, up).valid, true);
  assert.equal(verify(GAME, { ...up, score: up.score + 10 }).valid, false);
  assert.equal(verify(GAME, { ...up, version: up.version + 1 }).valid, false);
  const choices = up.choices.map(c => [...c]);
  choices[0][2] = 999;
  assert.equal(verify(GAME, { ...up, choices }).valid, false);
});

test('different seeds diverge', () => {
  assert.notEqual(playMatch(GAME, 1, STRONG).result().hash, playMatch(GAME, 2, STRONG).result().hash);
});

test('the challenge depends only on the seed, not on player behaviour (fairness E2)', () => {
  // The spawn plan (types, entry sides, delays) and every slot's combo order are fixed by the seed.
  const a = playMatch(GAME, 77, STRONG).sim, b = playMatch(GAME, 77, RANDOM).sim;
  assert.deepEqual(a.plan, b.plan);
  assert.deepEqual(layout(77), a.plan);
  assert.notDeepEqual(layout(77).map(s => [s.type, s.side, s.delay]), layout(78).map(s => [s.type, s.side, s.delay]));
  // Drops, props and stages are constants: the same on every seed.
  assert.deepEqual(layout(77).filter(s => s.drop).map(s => s.drop), layout(78).filter(s => s.drop).map(s => s.drop));
  assert.deepEqual(createSim(77).props, createSim(78).props);
});

/** Walk right until the first wave of the gate locks the screen. */
function toFirstWave(seed) {
  const sim = createSim(seed);
  for (let i = 0; i < 2000 && !sim.waveOn; i++) step(sim, encodeInput(RIGHT));
  assert.equal(sim.waveOn, 1);
  return sim;
}
const waveFoes = sim => sim.foes.filter(f => sim.plan[f.slot].wave === 0);

test('a fall restarts the stage: back at the mound, every wave returns with the same foes, sides and delays', () => {
  const sim = toFirstWave(5);
  const at = waveFoes(sim).map(f => [f.type, f.x, f.y, f.wait]);
  for (const f of waveFoes(sim)) { f.hp = 1; f.x += 40 * PX; }
  waveFoes(sim)[0].alive = 0;
  sim.p.st = S.DOWN; sim.p.stT = 59;
  step(sim, 0);                                     // back up at the stage start
  assert.equal(sim.deaths, 1);
  assert.equal(sim.p.hp, sim.p.hpMax);
  assert.deepEqual([sim.cam, sim.wave, sim.waveOn], [0, 0, 0]);
  assert.ok(waveFoes(sim).every(f => f.alive && !f.on && f.hp === f.hpMax), 'the wave waits to be walked into again');
  for (let i = 0; i < 2000 && !sim.waveOn; i++) step(sim, encodeInput(RIGHT));
  assert.deepEqual(waveFoes(sim).map(f => [f.type, f.x, f.y, f.wait]), at);
});

test('render events never change the outcome (recordEvents off = same hash)', () => {
  const rec = new Recorder(GAME, 4242);                  // events on, like the live client
  while (rec.phase !== 'over') {
    if (rec.phase === 'choice') rec.choose(STRONG.pick(rec.sim)); else rec.step(STRONG.input(rec.sim));
  }
  assert.equal(rec.sim.recordEvents, true);
  const r = replay(GAME, 4242, rec.log, rec.choices, rec.ticks);   // events off, like the server
  assert.equal(r.hash, rec.result().hash);
});

// ---------------------------------------------------------------- combat rules on a cleared screen
/** A gate screen with no waves left, no props, the player at x 200 px and the given foes beside it (offsets in px). */
function arena(type, offsets, extra = {}) {
  const sim = createSim(1);
  for (const f of sim.foes) f.alive = 0;
  sim.wave = STAGES[0].waves.length; sim.props = [];
  Object.assign(sim.p, { x: 200 * PX, y: 48 * PX, face: FACE_RIGHT });
  const foes = offsets.map(([dx, dy], k) => {
    const f = sim.foes.filter(x => FOES[x.type].kind === 0)[k];
    Object.assign(f, { type, kind: FOES[type].kind, alive: 1, on: 1, wait: 0, inside: 1, x: sim.p.x + dx * PX, y: sim.p.y + dy * PX,
      st: S.READY, stT: 0, gap: 9999, hp: 999, hpMax: 999, face: dx > 0 ? FACE_LEFT : FACE_RIGHT, order: null, iframe: 0, ...extra });
    return f;
  });
  return { sim, foes };
}
/** One foe of `type` beside the player (on its right), about to use move `mv` (phase 1 or 2). */
function duel(type, mv, { phase = 1, side = 1 } = {}) {
  const m = (phase === 2 ? FOES[type].phase2 : FOES[type].pool)[mv];
  const { sim, foes: [f] } = arena(type, [[side * Math.max(10, m.len - 6), 0]], { phase, stT: 99, gap: 0, order: [mv], i: 0, phaseLock: 0 });
  sim.p.face = side > 0 ? FACE_RIGHT : FACE_LEFT;
  return { sim, f, m };
}
/** Step until the foe's wind-up has `left` ticks to go (or it is no longer winding up). */
function untilLeft(sim, f, m, left) {
  for (let i = 0; i < 400 && !(f.st === S.WINDUP && m.w - f.stT === left); i++) step(sim, 0);
  assert.equal(f.st, S.WINDUP);
}
const run = (sim, n, input = 0) => { const ev = []; for (let i = 0; i < n; i++) { step(sim, input); ev.push(...sim.events); input = 0; } return ev; };

/** Tick (after the wind-up starts) at which the swing lands on a player who does nothing. */
function landsAt(type, mv) {
  const { sim, f, m } = duel(type, mv);
  untilLeft(sim, f, m, m.w - 1);
  for (let t = 1; t < 200; t++) { step(sim, 0); if (sim.events.some(e => e.type === 'hurt')) return t; }
  throw new Error('never landed');
}

test('parry window: a hit on the last parry tick is a parry, one tick later a plain block', () => {
  const land = landsAt(0, 0), kinds = [];
  for (const blockT of [PARRY_WIN - 1, PARRY_WIN]) {
    const { sim, f, m } = duel(0, 0);
    untilLeft(sim, f, m, m.w - 1);
    const press = land - blockT;                    // the guard goes up on tick `press`; blockT ticks later the hit lands
    const ev = [];
    for (let t = 1; t <= land + 2; t++) { step(sim, t === press ? encodeInput(-1, ACT_BLOCK) : 0); ev.push(...sim.events); }
    kinds.push(ev.find(e => e.type === 'parry' || e.type === 'block')?.type);
  }
  assert.deepEqual(kinds, ['parry', 'block']);
});

test('perfect dodge window: a swing inside the first PERFECT_DODGE_WIN invulnerable ticks counts, a later one does not', () => {
  const land = landsAt(0, 0), got = [];
  for (const late of [PERFECT_DODGE_WIN - 1, PERFECT_DODGE_WIN]) {
    const { sim, f, m } = duel(0, 0);
    untilLeft(sim, f, m, m.w - 1);
    const press = land - DODGE_IFRAME_FROM - late;  // invulnerability starts DODGE_IFRAME_FROM ticks after the dodge
    const ev = [];
    for (let t = 1; t <= land + 4; t++) { step(sim, t === press ? encodeInput(UP, ACT_DODGE) : 0); ev.push(...sim.events); }
    got.push(ev.some(e => e.type === 'perfectDodge'));
    assert.equal(sim.p.hp, sim.p.hpMax, 'the dodge avoids the hit either way');
  }
  assert.deepEqual(got, [true, false]);
});

test('control cap: being knocked down again and again never holds the player longer than CONTROL_CAP', () => {
  const { sim, f } = duel(3, 0);                    // 屍傀力士 衝撞: red, control
  f.order = [0, 0, 0, 0]; sim.p.hp = sim.p.hpMax = 999;
  let held = 0, worst = 0;
  for (let i = 0; i < 1200; i++) {
    step(sim, 0);
    held = sim.p.st === S.CONTROL || sim.p.st === S.HITSTUN ? held + 1 : 0;
    worst = Math.max(worst, held);
  }
  assert.ok(worst <= CONTROL_CAP, `held ${worst}`);
});

test('experience and technique points from a minion killed again decay to nothing on the fourth kill', () => {
  assert.equal(XP_DECAY_PCT.at(-1), 0);
  const { sim, foes: [f] } = arena(1, [[16, 0]]);   // 蠱蟲
  sim.slotKills[f.slot] = 3;
  f.hp = 1; f.st = S.BROKEN; f.stT = 0;
  run(sim, 30, encodeInput(-1, ACT_ATTACK));
  assert.equal(f.alive, 0);
  assert.equal(sim.p.xp, 0);
  assert.equal(sim.tech.exec, 1);
  assert.equal(sim.tech.execPts, 0);
});

test('no score exceeds the theoretical maximum', () => {
  for (const s of Object.values(STRATEGIES)) for (const seed of [1, 2]) assert.ok(playMatch(GAME, seed, s.policy).result().score <= SCORE_MAX);
});

// ---------------------------------------------------------------- v3 physics and timelines (spec §5.0)
test('v3 physics: bodies never stay overlapped (separation), and the same inputs give the same physics', () => {
  const { sim, foes } = arena(0, [[2, 0], [-2, 1], [0, 3]]);
  for (let i = 0; i < 30; i++) step(sim, 0);
  const all = [sim.p, ...foes];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j], d = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    assert.ok(d >= bodyR(a) + bodyR(b) - PX, `bodies ${i},${j} overlap: ${(d / PX).toFixed(1)} px`);
  }
});

test('v3 knockback: the same hit pushes a light body farther than a heavy one', () => {
  const dist = type => {
    const { sim, foes: [f] } = arena(type, [[20, 0]]);
    const x0 = f.x;
    let far = 0;
    for (let i = 0; i < 40; i++) { step(sim, i ? 0 : encodeInput(-1, ACT_ATTACK)); far = Math.max(far, f.x - x0); }
    return far;
  };
  const light = dist(1), heavy = dist(3);           // 蠱蟲 (mass 1) vs 屍傀力士 (mass 3), neither guards
  assert.ok(light > heavy && heavy >= 0, `bug ${light / PX}px, brute ${heavy / PX}px`);
});

test('v3 cancel window: a dodge pressed one tick before cancel.dodge waits; on cancel.dodge it cuts the recovery', () => {
  const m = COMBO[0], at = [];
  for (const late of [m.cancel.dodge - 1, m.cancel.dodge]) {
    const { sim } = arena(0, [[200, 0]]);
    step(sim, encodeInput(-1, ACT_ATTACK));
    while (!(sim.p.st === S.RECOVER && sim.p.stT === late - 1)) step(sim, 0);   // the next step counts this tick as `late`
    sim.p.bufT = 0; sim.p.buf = 0;
    step(sim, encodeInput(UP, ACT_DODGE));
    at.push([sim.p.st, sim.p.stT]);
  }
  assert.equal(at[0][0], S.RECOVER, 'before the window the dodge is only buffered');
  assert.equal(at[1][0], S.DODGE);
});

test('v3 clash: two white swings meeting in the same tick bounce both fighters', () => {
  // Search the press time: some timing makes the player's blade meet the soldier's (both white).
  let found = false;
  for (let press = 0; press < 40 && !found; press++) {
    const { sim, foes: [f] } = arena(0, [[20, 0]]);
    f.gap = 0; f.order = [0]; f.stT = 99; f.st = S.READY;
    let t0 = -1;
    for (let i = 0; i < 80; i++) {
      if (t0 < 0 && f.st === S.WINDUP) t0 = i;
      step(sim, t0 >= 0 && i - t0 === press ? encodeInput(-1, ACT_ATTACK) : 0);
      if (sim.events.some(e => e.type === 'clash')) { found = sim.p.hp === sim.p.hpMax && f.st === S.RECOVER; break; }
    }
  }
  assert.ok(found, 'some press time produces a clash with no damage');
});

test('v3 slam: knockback faster than SLAM_SPEED into a locked screen edge damages and stuns', () => {
  const { sim, foes: [f] } = arena(0, [[20, 0]]);
  sim.waveOn = 1; sim.goT = 0;
  f.x = sim.cam + VIEW_W * PX - bodyR(f) - 4 * PX; sim.p.x = f.x - 30 * PX;
  f.vx = SLAM_SPEED * 2; f.kb = 20;
  const hp = f.hp;
  const ev = run(sim, 10);
  assert.ok(ev.some(e => e.type === 'slam' && e.who === f.id), 'slammed');
  assert.ok(f.hp < hp && f.st === S.HITSTUN);
});

// ---------------------------------------------------------------- v5: depth, jump, grab, scroll, props, route
test('hit shape: off the line misses; ground moves miss above HIT_Z; low sweeps miss anything off the floor', () => {
  const a = { x: 0, y: 48 * PX, face: FACE_RIGHT }, r = 6 * PX;
  const ground = FOES[3].pool[1], low = FOES[3].pool[2];      // 重拳 (white), 掃地 (red, low)
  assert.equal(hitReaches(ground, a, 16 * PX, 48 * PX, 0, r), true);
  assert.equal(hitReaches(ground, a, 16 * PX, 48 * PX + 14 * PX, 0, r), false, 'off the line');
  assert.equal(hitReaches(ground, a, -16 * PX, 48 * PX, 0, r), false, 'behind');
  assert.equal(hitReaches(ground, a, 16 * PX, 48 * PX, HIT_Z * PX, r), true);
  assert.equal(hitReaches(ground, a, 16 * PX, 48 * PX, HIT_Z * PX + 1, r), false, 'jumped over');
  assert.equal(hitReaches(low, a, 16 * PX, 48 * PX, 1, r), false, 'a low sweep only hits the floor');
  assert.equal(hitReaches(low, a, -16 * PX, 48 * PX, 0, r), true, 'a sweep both ways');
});

test('jump: a low sweep can be jumped without damage', () => {
  const { sim, f, m } = duel(3, 2);                  // 屍傀力士 掃地
  untilLeft(sim, f, m, 3);
  run(sim, 60, encodeInput(-1, ACT_JUMP));
  assert.equal(sim.p.hp, sim.p.hpMax);
});

test('grab: pushing into a small foe for GRAB_PUSH ticks grabs it; a big one or a swinging one cannot be grabbed; GRAB_TICKS frees it', () => {
  const tryGrab = (type, extra = {}) => {
    const { sim, foes: [f] } = arena(type, [[13, 0]], extra);
    for (let i = 0; i < GRAB_PUSH + 4 && sim.p.st !== S.GRAB; i++) { step(sim, encodeInput(RIGHT)); if (extra.st === S.WINDUP) f.st = S.WINDUP; }
    return { sim, f, grabbed: sim.p.st === S.GRAB && f.st === S.HELD };
  };
  const ok = tryGrab(0);
  assert.equal(ok.grabbed, true);
  run(ok.sim, GRAB_TICKS + 1);
  assert.notEqual(ok.f.st, S.HELD, 'broke free');
  assert.equal(tryGrab(3).grabbed, false, 'too heavy');
  assert.equal(tryGrab(0, { st: S.WINDUP, mv: 0, stT: 0 }).grabbed, false, 'mid-swing');
});

test('scroll: the camera never moves back (except a fall back to the stage start); a locked wave keeps the player on that screen', () => {
  const sim = createSim(9);
  let cam = sim.cam, lockedOk = true;
  for (let i = 0; i < 3000; i++) {
    step(sim, encodeInput(i % 400 < 300 ? RIGHT : 6));
    if (sim.events.some(e => e.type === 'respawn')) cam = 0;   // a fall restarts the stage from its start
    assert.ok(sim.cam >= cam); cam = sim.cam;
    if (sim.waveOn && (sim.p.x < sim.cam || sim.p.x > sim.cam + VIEW_W * PX)) lockedOk = false;
  }
  assert.ok(lockedOk);
});

test('props: unbreakables never take more than half the depth at any x and always leave a way through; ≤ 2 per locked screen', () => {
  const pass = 2 * 6 + 8;                           // player diameter + 8 px
  for (const st of STAGES) {
    const solid = st.props.filter(([k]) => !PROPS[k].hp).map(([k, x, y]) => ({ x0: x - PROPS[k].w / 2, x1: x + PROPS[k].w / 2, y0: y - PROPS[k].d / 2, y1: y + PROPS[k].d / 2 }));
    for (let x = 0; x <= st.len; x++) {
      const here = solid.filter(b => x >= b.x0 && x <= b.x1).sort((a, b) => a.y0 - b.y0);
      assert.ok(here.reduce((s, b) => s + (b.y1 - b.y0), 0) <= DEPTH / 2, `${st.name} x ${x}`);
      let y = 0, gap = 0;
      for (const b of here) { gap = Math.max(gap, b.y0 - y); y = Math.max(y, b.y1); }
      gap = Math.max(gap, DEPTH - y);
      assert.ok(gap >= pass, `${st.name} x ${x}: widest way ${gap} px`);
    }
    for (const w of st.waves) assert.ok(solid.filter(b => b.x1 >= w.cam && b.x0 <= w.cam + VIEW_W).length <= 2, `${st.name} wave at ${w.cam}`);
  }
});

test('route: the gate ends in a two-way choice taken once; both ways lead to the hall', () => {
  const sim = createSim(3);
  sim.wave = STAGES[0].waves.length; sim.p.x = (STAGES[0].len - 60) * PX; sim.cam = (STAGES[0].len - VIEW_W) * PX;
  for (let i = 0; i < 60 && !sim.panel; i++) step(sim, encodeInput(RIGHT));
  assert.equal(sim.panel, 2);
  assert.equal(choose(sim, CH_LEAVE), false);
  assert.equal(choose(sim, CH_ROUTE + 2), false);
  assert.equal(choose(sim, CH_ROUTE + 1), true);
  assert.equal(sim.stage, 2);
  assert.equal(sim.panel, 0);
  assert.equal(STAGES[1].next, STAGES[2].next);
  assert.equal(STAGES[STAGES[1].next].id, 'hall');
});

// no forced hit (spec §5.8): every swing, alone or together with a second foe of the same wave pool, can be avoided entirely.
const WAVE_TYPES = [[0, 1], [0, 2, 4], [2, 1], [3, 2, 0]];
const movesOf = type => [...FOES[type].pool.map((m, i) => ({ type, mv: i, phase: 1, m })), ...(FOES[type].phase2 ?? []).map((m, i) => ({ type, mv: i, phase: 2, m }))];
// Witness search: at most two defensive inputs (a dodge in any of 8 directions, a guard or a jump) that take no damage.
const DEFENCES = [...Array.from({ length: 8 }, (_, d) => encodeInput(d, ACT_DODGE)), encodeInput(-1, ACT_BLOCK), encodeInput(-1, ACT_JUMP)];
function trial(attacks, plan) {
  const sim = createSim(1);
  for (const f of sim.foes) f.alive = 0;
  sim.wave = STAGES[0].waves.length; sim.props = [];
  Object.assign(sim.p, { x: 200 * PX, y: 48 * PX, face: FACE_RIGHT });
  const used = new Set();
  attacks.forEach((a, k) => {
    const f = sim.foes.find(x => !used.has(x.id) && FOES[x.type].kind === 0);
    used.add(f.id);
    const side = k ? -1 : 1, gap = Math.max(10, a.m.len - 6) * PX;
    Object.assign(f, { type: a.type, kind: FOES[a.type].kind, alive: 1, on: 1, wait: 0, inside: 1, x: sim.p.x + side * gap, y: sim.p.y,
      phase: a.phase, st: S.READY, stT: 99, gap: 0, order: [a.mv], i: 0, iframe: 0, phaseLock: 0, hp: 9999, hpMax: 9999,
      face: side > 0 ? FACE_LEFT : FACE_RIGHT });
  });
  // Watch only the first swing of each attacker: the defence is not meant to cover the next round.
  const foes = sim.foes.filter(f => f.alive), swung = f => f.k >= 1 && f.st !== S.WINDUP && f.st !== S.ACTIVE;
  for (let t = 0; t < 300 && !foes.every(swung); t++) {
    step(sim, plan.find(x => x[0] === t)?.[1] ?? 0);
    if (sim.p.hp < sim.p.hpMax) return t;
  }
  return -1;
}
function avoidable(attacks) {
  const firsts = [];
  for (let lead = 0; lead <= 130; lead++) for (const d of DEFENCES) {
    const hurt = trial(attacks, [[lead, d]]);
    if (hurt < 0) return true;
    firsts.push([hurt, lead, d]);
  }
  // Keep the single defences that held out longest, then add a second one before that hit.
  firsts.sort((a, b) => b[0] - a[0]);
  for (const [hurt, lead, d] of firsts.slice(0, 6)) {
    for (let lead2 = lead + 1; lead2 < hurt; lead2++) for (const d2 of DEFENCES) if (trial(attacks, [[lead, d], [lead2, d2]]) < 0) return true;
  }
  return false;
}

test('no forced hit: every enemy swing, alone or with a second attacker of its wave, can be avoided without damage', () => {
  const bad = [];
  for (const type of FOES.keys()) for (const a of movesOf(type)) if (!avoidable([a])) bad.push(`${FOES[type].name}/${a.m.name}`);
  for (const pool of WAVE_TYPES) {
    const ms = pool.flatMap(movesOf);
    for (const a of ms) for (const b of ms) if (!avoidable([a, b])) bad.push(`${FOES[a.type].name}/${a.m.name} + ${FOES[b.type].name}/${b.m.name}`);
  }
  assert.deepEqual(bad, []);
});

// Thresholds come from RULE-SKILL-EVIDENCE through shared/tools/rules.mjs (never written here). Tuning questions only:
// the confirmation run is npm run evidence:confirm, done by a person once the strategies are frozen.
async function evidenceThresholds() {
  const { dirname, join } = await import('node:path'), { existsSync } = await import('node:fs'), { fileURLToPath, pathToFileURL } = await import('node:url');
  let d = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(d, 'shared', 'tools', 'rules.mjs'))) { const up = dirname(d); if (up === d) throw new Error('shared/tools/rules.mjs not found'); d = up; }
  const rules = (await import(pathToFileURL(join(d, 'shared', 'tools', 'rules.mjs')).href)).loadRules({ from: fileURLToPath(import.meta.url) });
  return { alpha: rules.value('RULE-SKILL-EVIDENCE', 'alpha'), minQuestions: rules.value('RULE-SKILL-EVIDENCE', 'minQuestions') };
}

test('skill evidence on the tuning questions: the strong strategy beats the random one and every simple one', async () => {
  const thresholds = await evidenceThresholds();
  const r = runEvidence(GAME, STRATEGIES, { n: thresholds.minQuestions, thresholds });
  assert.deepEqual(r.verdict, { enoughQuestions: true, beatsRandom: true, beatsEverySimple: true, pass: true }, r.pairs.map(p => `${p.other}: ${p.wins}-${p.ties}-${p.losses} p=${p.p}`).join('; '));
});

// The template's legacy tier test is gone with tools/bots.mjs (new games do not use RULE-SKILL-DOMINANCE).

// Only games with scripted progression have a difficulty curve to check (RULE-CURVE-*, RULE-GAME-DOCS).
const curveReady = !readFileSync(new URL('../tools/playtest.mjs', import.meta.url), 'utf8').includes('Beat Tap')
  && !readFileSync(new URL('../tools/playtest.mjs', import.meta.url), 'utf8').includes('sectionAt');
test('scripted difficulty curve passes the D-gates (knowledge-base/16; full report: npm run playtest)', { skip: !curveReady && 'N5：tools/playtest.mjs 還是範本的示範遊戲，本作的試玩在 N5 寫' }, async () => {
  const { execFileSync } = await import('node:child_process');
  assert.doesNotThrow(() => execFileSync(process.execPath, ['tools/playtest.mjs', '8'], { cwd: new URL('..', import.meta.url), stdio: 'pipe' }));
});

test('full-match replay fits the server budget', () => {
  const rec = playMatch(GAME, 4242, SIMPLE);
  const t0 = performance.now();
  assert.equal(replay(GAME, 4242, rec.log, rec.choices, rec.ticks).valid, true);
  assert.ok(performance.now() - t0 < 500);
});

void SKILLS;
