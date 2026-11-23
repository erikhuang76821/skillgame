// Game-rule determinism and fairness. Rewrite the bodies for your game, keep the test names (spec §12).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Recorder, playMatch, verify, replay, COS, SIN, ONE } from '../src/sim/core/index.js';
import {
  GAME, SCORE_CAP, BOSS, createSim, step, phase, schedule, obstacles, choose, offer, offerAt, stateHash,
  SUPPLIES, SUPPLY_UNIT, BOSS_SLOTS, WAVES, PICK_INVULN, PICK_CLEAR_R, SHIELDS, SHIELD_PTS, INVULN_TICKS, KIND, isBoss, FIRE_PERIOD, PLAYER_SPEED,
  clock, UNIT_TICKS, CHAPTER_FROM, CHAPTERS, SCRIPT, sectionAt,
  LANCER, MINER, MINE, BULWARK, SPLITTER, SHARD, DRONE, LANCER_TELEGRAPH, LANCER_SPEED, MINE_RING,
  SEEKER, BEAMER, SEEKER_TURN, BEAM_TELEGRAPH, BEAM_TICKS, BEAM_W,
  GEAR, GEAR_MAX_LV, RAPID, SPREAD, PIERCE, HEAVY, LASER, WINGMAN, BARRIER, THRUSTERS,
  RAPID_PERIOD, HEAVY_DMG, HEAVY_DELAY, LASER_PERIOD, LASER_DMG, WING_OFFSET, THRUST_SPEED, BARRIER_INVULN, BARRIER_REBUILD,
  REPAIR, HASTE, BOOST, AEGIS, OVERHAUL, UPGRADE, BUFF_TICKS, BOOST_SPEED, AEGIS_TICKS, DROP_R, PEAK, METEOR, PEAK_R,
} from '../src/sim/sim.js';
import { STRATEGIES } from '../tools/strategies.mjs';
import { runEvidence } from '../tools/lib/evidence.mjs';

// The game's own comparison strategies (tools/strategies.mjs) play the matches here; no tier bots are needed.
const play = role => Object.values(STRATEGIES).find(s => s.role === role).policy;
const STRONG = play('strong'), SIMPLE = play('simple'), RANDOM = play('random');

test('same seed + same inputs => identical result', () => {
  assert.deepEqual(playMatch(GAME, 1234, STRONG).result(), playMatch(GAME, 1234, STRONG).result());
});

test('golden match (cross-engine determinism; update only when GAME.version is bumped)', () => {
  assert.deepEqual(playMatch(GAME, 1234, STRONG).result(),
    { game: 'sky-talon', version: 12, seed: 1234, ticks: 19803, score: 53902, hash: 2439202323 });
});

test('uploaded match verifies; tampered score does not', () => {
  const up = playMatch(GAME, 98765, SIMPLE).upload();
  assert.equal(verify(GAME, up).valid, true);
  assert.equal(verify(GAME, { ...up, score: up.score + 10 }).valid, false);
});

test('different seeds diverge', () => {
  assert.notEqual(playMatch(GAME, 1, STRONG).result().hash, playMatch(GAME, 2, STRONG).result().hash);
});

test('the challenge depends only on the seed, not on player behaviour (fairness E2)', () => {
  // What enters and when (every enemy as it first appears) and where each boss ring starts, under two ways of flying.
  const seen = policy => {
    const sim = createSim(77), ids = new Set(), log = [];
    while (phase(sim) !== 'over' && sim.tick < GAME.maxTicks) {
      if (phase(sim) === 'choice') { choose(sim, 0); continue; }
      step(sim, policy(sim));
      for (const e of sim.enemies) if (!ids.has(e.id)) { ids.add(e.id); log.push([sim.tick, e.id, e.type, e.type === BOSS ? 0 : e.ax]); }
    }
    return { log, ticks: sim.tick };
  };
  const still = seen(() => 0), strong = seen(sim => STRONG.input(sim));
  assert.ok(still.ticks < strong.ticks, 'the two runs really differ (standing still is shot down early)');
  assert.deepEqual(still.log, strong.log.slice(0, still.log.length));
  assert.deepEqual(schedule(77), createSim(77).plan);
});

test('no strategy scores above the theoretical cap (spec §6)', () => {
  for (const s of Object.values(STRATEGIES)) for (const seed of [1, 2, 3]) {
    const r = playMatch(GAME, seed, s.policy).result();
    assert.ok(r.score >= 0 && r.score <= SCORE_CAP, `${r.score} > ${SCORE_CAP}`);
  }
});

test('render events never change the outcome (recordEvents off = same hash)', () => {
  const rec = new Recorder(GAME, 4242);                  // events on, like the live client
  while (rec.phase !== 'over') { if (rec.phase === 'choice') rec.choose(RANDOM.pick(rec.sim)); else rec.step(RANDOM.input(rec.sim)); }
  assert.equal(rec.sim.recordEvents, true);
  const r = replay(GAME, 4242, rec.log, rec.choices, rec.ticks);   // events off, like the server
  assert.equal(r.hash, rec.result().hash);
});

// --- v2 cards (spec §3 offer stream, §5 cards, §8 choices) ---
function flyWithPicks(seed, picks, input = () => 0, until = Infinity) {
  const sim = createSim(seed), offers = [];
  while (phase(sim) !== 'over' && (sim.tick < until || phase(sim) === 'choice')) {
    if (phase(sim) === 'choice') {
      if (choiceKind(sim) === 'card') offers.push([clock(sim), ...offer(sim)]);
      assert.equal(choose(sim, picks[sim.choices] ?? 0), true);
      continue;
    }
    step(sim, input(sim));
  }
  return { sim, offers };
}

test('a refused choice leaves the sim untouched; time stands still while a choice is pending', () => {
  const sim = createSim(9);
  assert.equal(choose(sim, 0), false, 'not a choice yet');
  while (phase(sim) === 'play') step(sim, 0);
  assert.equal(phase(sim), 'choice');
  const h = stateHash(sim), tick = sim.tick;
  for (const bad of [-1, 3, 1.5, '1', undefined]) assert.equal(choose(sim, bad), false);
  step(sim, 3);                                            // stepping during a choice does nothing
  assert.equal(stateHash(sim), h);
  assert.equal(sim.tick, tick);
  assert.equal(choose(sim, 1), true);
  assert.notEqual(stateHash(sim), h);
  assert.equal(phase(sim), 'play');
  assert.equal(choose(sim, 1), false, 'one card per choice');
});

test('a match never asks for more choices than the script has, and a recorded match with choices verifies', () => {
  const rec = playMatch(GAME, 31, STRONG);
  assert.equal(GAME.maxChoices, SUPPLIES);
  assert.ok(rec.choices.length >= 2 && rec.choices.length <= SUPPLIES);
  const up = rec.upload();
  assert.equal(verify(GAME, up).valid, true);
  assert.equal(verify(GAME, { ...up, choices: up.choices.slice(0, 3) }).valid, false, 'a missing choice');
  assert.equal(verify(GAME, { ...up, choices: up.choices.map((c, i) => (i ? c : [c[0], c[1], (c[2] + 1) % 3])) }).valid, false, 'another card, same claimed score');
});

// --- v4: chapters on a script clock, new enemies, card level 3, airframe mods (spec §5 「第三期」) ---
const U = UNIT_TICKS;
/** A sim whose spawn list is replaced by `plan` (white box: the script itself is checked by the curve test). */
const stage = (plan, seed = 1) => { const sim = createSim(seed); sim.plan = plan.map(p => ({ at: 0, lane: 0, x: 360, hp: KIND[p.type].hp, drop: -1, ...p })); sim.rocks = []; return sim; };
const run = (sim, ticks, input = () => 0, seen = []) => { for (let i = 0; i < ticks && phase(sim) === 'play'; i++) { step(sim, input(sim)); seen.push(...sim.events.map(e => ({ ...e, at: sim.tick }))); } return seen; };

test('v4: a lancer shows its line, then fires along it; moving after the lock gets clear', () => {
  const sim = stage([{ type: LANCER, x: 600, hp: 999 }]);
  const seen = run(sim, 215);                                   // long enough for the first shot to arrive, not the second
  const aim = seen.find(e => e.type === 'aim'), shot = seen.find(e => e.type === 'lance');
  assert.equal(shot.at - aim.at, LANCER_TELEGRAPH);
  const sim2 = stage([{ type: LANCER, x: 600, hp: 999 }]);
  let fired = null;
  for (let i = 0; i < 200 && !fired; i++) { step(sim2, sim2.enemies[0]?.pk ? 7 : 0); if (sim2.events.some(e => e.type === 'lance')) fired = sim2.bullets.at(-1); }
  assert.deepEqual([fired.vx, fired.vy], [COS[aim.angle] * LANCER_SPEED, SIN[aim.angle] * LANCER_SPEED], 'the shot keeps the locked line');
  run(sim2, 100, () => 0);
  assert.equal(sim2.hits, 0, 'the player who stepped aside after the lock is not hit');
  assert.equal(sim.hits, 1, 'the player who stayed is');
});

test('v4: a mine left alone bursts into a ring; a mine shot down in time does not', () => {
  const sim = stage([{ type: MINER, hp: 9999 }]);
  const mines = new Set();
  let bursts = 0, shotDown = 0, fromBursts = 0;
  for (let i = 0; i < 520; i++) {
    const before = sim.bullets.length;
    step(sim, 0);
    for (const e of sim.enemies) if (e.type === MINE) mines.add(e.id);
    const b = sim.events.filter(e => e.type === 'mineBurst').length;
    bursts += b; if (b) fromBursts += sim.bullets.length - before;
    shotDown += sim.events.filter(e => e.type === 'kill' && e.kind === MINE).length;
  }
  assert.ok(shotDown >= 1 && bursts >= 2, 'the ship sat under one mine and not under the others');
  assert.equal(bursts + shotDown, mines.size);
  assert.equal(fromBursts, bursts * MINE_RING);
});

test('v8 (no forced hit): a wall is a ray across the screen, announced beforehand, live and dead in a fixed rhythm; it only hurts while live, and the dead spell is long enough to cross', async () => {
  const { RAY_ON, RAY_OFF, RAY_H, WALL_SPEED, rayLive, PLAYER_R } = await import('../src/sim/sim.js');
  const sim = stage([{ type: BULWARK, hp: 9999 }], 5);
  let announced = 0, fired = 0;
  for (let i = 0; i < 420; i++) {
    const rays = sim.rays.length, bullets = sim.bullets.length;
    sim.invuln = 5; step(sim, 0);
    if (sim.events.some(e => e.type === 'wall')) announced++;
    if (sim.events.some(e => e.type === 'wallFire')) { fired++; assert.equal(sim.rays.length, rays + 1); assert.equal(sim.bullets.length, bullets, 'a ray, not bullets'); assert.ok(announced >= fired); }
  }
  assert.ok(fired >= 2);
  for (let t = 0; t < 2 * (RAY_ON + RAY_OFF); t++) assert.equal(rayLive({ t }), t % (RAY_ON + RAY_OFF) < RAY_ON);
  const cross = phase0 => { const s2 = stage([]); s2.rays.push({ y: s2.py - 40 * ONE, t: phase0 }); for (let i = 0; i < 30; i++) step(s2, 0); return s2.hits; };
  assert.equal(cross(0), 1, 'live when it reaches the ship: a hit');
  assert.equal(cross(RAY_ON), 0, 'dead when it reaches the ship: nothing');
  assert.ok(Math.ceil((2 * (RAY_H + PLAYER_R)) / WALL_SPEED) + 6 < RAY_OFF, 'a ship that stays put is passed within one dead spell, with ticks to spare');
});

test('v4: a splitter breaks into two shards flying apart', () => {
  const sim = stage([{ type: SPLITTER }]);
  const seen = run(sim, 400);
  assert.ok(seen.some(e => e.type === 'split'));
  const shards = seen.filter(e => e.type === 'kill' && e.kind === SHARD).length + sim.enemies.filter(e => e.type === SHARD).length + seen.filter(e => e.type === 'escape' && e.kind === SHARD).length;
  assert.equal(shards, 2);
});

// --- v5: chapter 4 (spec §5 「第四章」) ---
test('v5: a seeker turns toward the ship, never faster than SEEKER_TURN a tick', () => {
  const sim = stage([{ type: SEEKER, x: 120, hp: 999 }]);
  sim.px = 600 * ONE;                                        // the ship is far to the right
  let prev = null, turned = 0;
  for (let i = 0; i < 120; i++) {
    step(sim, 0);
    const e = sim.enemies.find(v => v.type === SEEKER);
    if (prev !== null) { const d = ((e.a - prev + 128) & 255) - 128; assert.ok(Math.abs(d) <= SEEKER_TURN); turned += d; }
    prev = e.a;
  }
  assert.ok(turned < 0, 'it swung from straight down toward the ship on its right (smaller angles point right)');
  const e = sim.enemies.find(v => v.type === SEEKER);
  assert.ok(e.x > 120 * ONE, 'and moved that way');
});

test('v5: a beam comes after its warning, stays BEAM_TICKS, hurts only inside its column, and no choice clears it', () => {
  const play = offset => {
    const sim = stage([{ type: BEAMER, x: 360, hp: 9999 }]), seen = [];
    sim.px = (360 + offset) * ONE;
    run(sim, 420, () => 0, seen);
    return { sim, seen };
  };
  const inside = play(0), outside = play(BEAM_W + 40);
  const up = inside.seen.find(e => e.type === 'beamUp'), on = inside.seen.find(e => e.type === 'beam');
  assert.equal(on.at - up.at, BEAM_TELEGRAPH);
  assert.equal(inside.sim.hits >= 1, true, 'standing in the column is a hit');
  assert.equal(outside.sim.hits, 0, 'standing beside it is not');
  // while a beam is on, the enemy keeps it for exactly BEAM_TICKS ticks
  const sim = stage([{ type: BEAMER, x: 100, hp: 9999 }]);
  let onTicks = 0;
  for (let i = 0; i < 260; i++) { step(sim, 0); if (sim.enemies[0].bt > 0) onTicks++; if (onTicks && sim.enemies[0].bt === 0) break; }
  assert.equal(onTicks, BEAM_TICKS);
  assert.equal(sim.bullets.length, 0, 'a beam is not a bullet');
});

// --- v7: two bosses a chapter, boost units, supplies (spec §5 「章節結構與補給」) ---
test('v7: the script has a mid-boss and a boss per chapter, three wave units between them, and nothing entering in boss or boost units', () => {
  assert.equal(BOSS_SLOTS.length, 2 * CHAPTERS);
  for (let c = 0; c < CHAPTERS; c++) {
    const mid = BOSS_SLOTS[2 * c], boss = BOSS_SLOTS[2 * c + 1];
    assert.equal(boss.from - (mid.end + 1), 3, 'one boost unit, then three wave units, then the boss');
    assert.equal(SCRIPT[sectionAt(mid.end * U)].boost, true);
    if (c + 1 < CHAPTERS) assert.equal(CHAPTER_FROM[c + 1], boss.end + 1, 'the next chapter starts after the boost that follows the boss');
  }
  WAVES.forEach((w, u) => { const sec = SCRIPT[sectionAt(u * U)]; if (sec.boss || sec.boost) assert.equal(w.reduce((a, b) => a + b, 0), 0); });
  for (const p of schedule(77)) { const sec = SCRIPT[sectionAt(p.at)]; assert.ok(!sec.boss && !sec.boost); }
});

test('v7: a boss shot down early skips the rest of its window and brings a supply; one that outlasts its window leaves for nothing', async () => {
  const fly = flawless => {
    const sim = createSim(77), seen = [], offers = [];
    if (flawless) { sim.gear[RAPID] = GEAR_MAX_LV; sim.gear[HEAVY] = GEAR_MAX_LV; }   // v10: enough firepower to down it well inside its window
    while (phase(sim) !== 'over' && sim.slot === 0) {
      if (phase(sim) === 'choice') { offers.push([sim.supply, ...offer(sim)]); choose(sim, 0); continue; }
      sim.shields = 3;                                              // keep the run alive: this test is about the clock
      const boss = sim.enemies.find(e => isBoss(e.type));
      if (boss && !flawless) boss.hp = 9999;                        // a boss nobody can down
      step(sim, STRONG.input(sim));
      seen.push(...sim.events);
    }
    return { sim, seen, offers };
  };
  const early = fly(true), late = fly(false), end = BOSS_SLOTS[0].end * U;
  for (const r of [early, late]) {
    assert.equal(r.sim.slot, 1);
    assert.equal(clock(r.sim), end, 'the script clock stands at the boost unit');
    assert.ok(r.seen.some(e => e.type === 'boost'));
    assert.deepEqual(r.offers[0], [0, ...offerAt(77, 0)], 'the opening supply');
  }
  assert.ok(early.seen.some(e => e.type === 'bossDown') && early.sim.skip > 0 && early.sim.bossPts > 0);
  assert.equal(phase(early.sim), 'choice', 'shot down: a supply is waiting');
  assert.deepEqual([early.sim.supply, ...offer(early.sim)], [1, ...offerAt(77, 1)]);
  // v10: before it leaves, the window is held open for its overtime (the script clock stands still for that long)
  const { overtime, OVERTIME_PCT } = await import('../src/sim/sim.js');
  assert.equal(overtime(0), Math.trunc(((BOSS_SLOTS[0].end - BOSS_SLOTS[0].from) * U * OVERTIME_PCT[0]) / 100));
  assert.ok(late.seen.some(e => e.type === 'bossLeave') && late.sim.skip === -overtime(0));
  assert.deepEqual([late.sim.bossPts, late.sim.bossKills, phase(late.sim)], [0, 0, 'play'], 'left: no points, no supply');
  assert.ok(!late.sim.enemies.some(e => isBoss(e.type)));
});

test('v7: what a supply offers depends only on the seed and its number; every piece of gear comes round three times', () => {
  for (const seed of [5, 77, 4242]) {
    const all = Array.from({ length: SUPPLIES }, (_, k) => offerAt(seed, k));
    for (const o of all) assert.equal(new Set(o).size, 3);
    assert.deepEqual(GEAR.map((_, g) => all.flat().filter(v => v === g).length), GEAR.map(() => 3));
    const seen = picks => {
      const sim = createSim(seed), out = [];
      while (phase(sim) !== 'over') {
        if (phase(sim) === 'choice') { out.push([sim.supply, ...offer(sim)]); choose(sim, picks[out.length - 1] ?? 0); continue; }
        sim.shields = 3; step(sim, STRONG.input(sim));
      }
      return out;
    };
    for (const run of [seen([]), seen([2, 1, 2, 1, 2, 1, 2, 1])]) {
      assert.ok(run.length >= 2);
      for (const o of run) assert.deepEqual(o.slice(1), offerAt(seed, o[0]), 'whatever was picked before, supply k is the same three');
    }
  }
  assert.notDeepEqual(offerAt(5, 0).concat(offerAt(5, 1)), offerAt(6, 0).concat(offerAt(6, 1)));
});

test('v7: four chapters, eight bosses, eight supplies when every one is shot down, and the last boss ends the match', () => {
  const sim = createSim(77);
  let picks = 0, ended = null, chapters = 0, boosts = 0;
  while (phase(sim) !== 'over') {
    if (phase(sim) === 'choice') { picks++; choose(sim, 0); continue; }
    sim.shields = 3;                                          // this test is about the script, not survival
    const boss = sim.enemies.find(e => isBoss(e.type));
    if (boss) boss.hp = Math.min(boss.hp, 1);                 // every boss falls to the next shot that reaches it
    step(sim, STRONG.input(sim));
    for (const e of sim.events) { if (e.type === 'chapter') chapters++; if (e.type === 'boost') boosts++; if (e.type === 'over') ended = e; }
  }
  assert.deepEqual([picks, sim.chapter, sim.bossKills, chapters, boosts], [SUPPLIES, 3, 8, 3, 7]);
  assert.equal(ended.bossDown, true);
});

// --- v6: gear, barrier, drops, obstacles; none of it touches the score (spec §5 「裝備與掉落物」, §6) ---
test('v6: a full piece of gear on offer heals a point instead', () => {
  const sim = createSim(9);
  while (phase(sim) === 'play') step(sim, 0);
  const g = offer(sim)[0];
  sim.gear[g] = GEAR_MAX_LV; sim.shields = 1;
  assert.equal(choose(sim, 0), true);
  assert.equal(sim.gear[g], GEAR_MAX_LV);
  assert.equal(sim.shields, 2);
});

test('v6: each piece of gear does what the spec says', () => {
  const volleys = sim => run(sim, 60).filter(e => e.type === 'fire').length;
  const bare = () => stage([]);
  let sim = bare(); sim.gear[RAPID] = 3;
  assert.equal(volleys(sim), 60 / RAPID_PERIOD[2]);
  sim = bare(); sim.gear[HEAVY] = 3;
  assert.equal(volleys(sim), Math.ceil(60 / (FIRE_PERIOD + HEAVY_DELAY[2])));
  assert.ok(sim.shots.length && sim.shots.every(v => v.dmg === HEAVY_DMG[2]));
  sim = bare(); sim.gear[SPREAD] = 3; run(sim, 6);
  assert.equal(new Set(sim.shots.filter(v => v.vx).map(v => v.vx)).size, SPREAD_SHOTS[2], 'two angles each side at the top level (v8)');
  assert.ok(sim.shots.filter(v => v.vx).every(v => v.left === 0), 'side shots do not pierce without the pierce gear');
  sim = bare(); sim.gear[SPREAD] = 1; sim.gear[PIERCE] = 2; run(sim, 6);
  assert.ok(sim.shots.every(v => v.left === 2), 'with both, the angled shots pierce too (the net)');
  sim = bare(); sim.gear[WINGMAN] = 1; run(sim, 31);
  assert.ok(sim.shots.some(v => v.x === sim.px - WING_OFFSET * ONE) && sim.shots.some(v => v.x === sim.px + WING_OFFSET * ONE));
  const travel = l => { const t = bare(); t.gear[THRUSTERS] = l; const x0 = t.px; run(t, 10, () => 3); return (t.px - x0) / ONE / 10; };
  assert.deepEqual([travel(0), travel(1), travel(2)], [PLAYER_SPEED, THRUST_SPEED[0], THRUST_SPEED[1]]);
});

test('v6: the lock-on laser hits the nearest enemies above the ship, wherever they are', () => {
  // two enemies far off the gun line: only the laser can reach them
  const sim = stage([{ type: BULWARK, x: 90, hp: 500 }, { type: BULWARK, x: 630, hp: 500 }]);
  sim.gear[LASER] = 1; sim.px = 200 * ONE; sim.py = 700 * ONE;   // both in reach, the one on the left nearer
  const seen = run(sim, LASER_PERIOD * 6 + 120);
  const [left, right] = sim.enemies;
  assert.ok(left.hp < 500 && right.hp === 500, 'level 1: one target, the nearer one');
  assert.equal((500 - left.hp) % LASER_DMG, 0);
  assert.ok(seen.some(e => e.type === 'laser' && e.targets.length === 1));
  const two = stage([{ type: BULWARK, x: 90, hp: 500 }, { type: BULWARK, x: 630, hp: 500 }]);
  two.gear[LASER] = 2; two.px = 200 * ONE; two.py = 700 * ONE;
  run(two, LASER_PERIOD * 6 + 120);
  assert.ok(two.enemies.every(e => e.hp < 500), 'level 2: both');
});

test('v6: the barrier takes one hit of anything, then rebuilds; the hit still breaks the chain and counts', () => {
  const sim = stage([]);
  sim.gear[BARRIER] = 1; sim.barrier = 1; sim.chain = 7;
  sim.bullets.push({ x: sim.px, y: sim.py - 4 * ONE, vx: 0, vy: ONE, grazed: 0 });
  const seen = run(sim, 1);
  assert.ok(seen.some(e => e.type === 'block'));
  assert.deepEqual([sim.shields, sim.barrier, sim.hits, sim.chain], [SHIELDS, 0, 1, 0]);
  assert.equal(sim.invuln, BARRIER_INVULN - 1);
  run(sim, BARRIER_REBUILD[0] - 2);
  assert.equal(sim.barrier, 0);
  const back = run(sim, 2);
  assert.equal(sim.barrier, 1);
  assert.ok(back.some(e => e.type === 'barrier'));
  // without a charge the same hit costs a point of life
  sim.barrier = 0; sim.rebuild = 9999; sim.invuln = 0;
  sim.bullets.push({ x: sim.px, y: sim.py - 4 * ONE, vx: 0, vy: ONE, grazed: 0 });
  run(sim, 1);
  assert.deepEqual([sim.shields, sim.hits, sim.invuln], [SHIELDS - 1, 2, INVULN_TICKS - 1]);
});

test('v6: which enemies carry a drop is in the spawn list (seed only); it drops when that enemy is shot down, not when it gets away', () => {
  assert.deepEqual(schedule(77).map(v => v.drop), schedule(77).map(v => v.drop));
  const carriers = schedule(77).filter(v => v.drop >= 0).length;
  assert.ok(carriers > 5 && carriers < schedule(77).length / 8, 'a few, not most');
  const shot = run(stage([{ type: DRONE, x: 360, drop: REPAIR }]), 300);
  assert.ok(shot.some(e => e.type === 'drop' && e.kind === REPAIR));
  const fled = run(stage([{ type: DRONE, x: 90, drop: REPAIR }]), 600);
  assert.ok(fled.some(e => e.type === 'escape') && !fled.some(e => e.type === 'drop'));
});

test('v6: every drop does what the spec says, and none of them scores', () => {
  const take = (kind, prep = () => {}) => { const sim = stage([]); prep(sim); sim.drops.push({ x: sim.px, y: sim.py - 10 * ONE, kind }); const seen = run(sim, 1); return { sim, seen }; };
  assert.equal(take(REPAIR, v => { v.shields = 1; }).sim.shields, 2);
  assert.equal(take(REPAIR).sim.shields, SHIELDS, 'never above the cap');
  assert.equal(take(OVERHAUL, v => { v.shields = 1; }).sim.shields, SHIELDS);
  assert.equal(take(AEGIS).sim.invuln, AEGIS_TICKS - 1);
  const hasty = take(HASTE).sim, quick = take(BOOST).sim;
  assert.equal(hasty.haste, BUFF_TICKS - 1);
  const fired = run(hasty, 60).filter(e => e.type === 'fire').length, per = 60 / (FIRE_PERIOD - 1);   // v12: 4.5 ticks, so 13 or 14 in 60
  assert.ok(fired >= Math.floor(per) && fired <= Math.ceil(per), `haste fires every ${FIRE_PERIOD - 1} ticks (${fired} in 60)`);
  const x0 = quick.px; run(quick, 10, () => 3);
  assert.equal((quick.px - x0) / ONE / 10, PLAYER_SPEED + BOOST_SPEED);
  const up = take(UPGRADE, v => { v.gear[SPREAD] = 1; });
  assert.equal(up.sim.gear[SPREAD], 2, 'an upgrade goes to gear already held');
  assert.equal(take(UPGRADE).sim.gear.reduce((a, b) => a + b, 0), 1, 'with nothing held, to any gear');
  for (const kind of [REPAIR, HASTE, BOOST, AEGIS, OVERHAUL, UPGRADE]) assert.equal(take(kind).sim.score, 0);
  const far = stage([]); far.drops.push({ x: far.px + (DROP_R + 30) * ONE, y: far.py, kind: REPAIR }); far.shields = 1; run(far, 1);
  assert.equal(far.shields, 1, 'out of reach is not taken');
});

test('v6: the end bonus counts hits taken, so healing and the barrier buy no points', () => {
  const end = prep => { const sim = createSim(3); prep(sim); sim.chapter = CHAPTERS - 1; sim.skip = GAME.maxTicks; step(sim, 0); assert.equal(phase(sim), 'over'); return sim.shieldPts; };
  assert.equal(end(() => {}), SHIELDS * SHIELD_PTS);
  assert.equal(end(v => { v.hits = 2; v.shields = 1; }), SHIELD_PTS);
  assert.equal(end(v => { v.hits = 2; v.shields = 3; }), SHIELD_PTS, 'healed back to full: the same bonus');
  assert.equal(end(v => { v.hits = 5; v.shields = 3; }), 0);
});

test('v6: obstacles are set by the seed, come only in the wave units of chapters 3 and 4, block shots and bullets, and hurt on contact', () => {
  assert.deepEqual(obstacles(77), obstacles(77));
  const rocks = [1, 2, 3, 4, 5, 6].flatMap(obstacles);
  assert.ok(rocks.length > 6);
  for (const o of rocks) { const sec = SCRIPT[sectionAt(o.at)]; assert.ok(!sec.boss && !sec.boost && sec.chapter >= 2); assert.equal(o.kind, sec.chapter === 2 ? PEAK : METEOR); }
  const sim = stage([{ type: BULWARK, x: 360, hp: 500 }]);
  sim.obst.push({ kind: PEAK, x: 360 * ONE, y: 500 * ONE, vx: 0, vy: 0 });      // a peak parked between the ship and the enemy
  sim.bullets.push({ x: 360 * ONE, y: 300 * ONE, vx: 0, vy: 4 * ONE, grazed: 0 });
  run(sim, 200);
  assert.equal(sim.enemies[0].hp, 500, 'no shot gets past it');
  assert.equal(sim.hits, 0, 'and neither did the bullet');
  const crash = stage([]);
  crash.obst.push({ kind: PEAK, x: crash.px, y: crash.py - (PEAK_R + 30) * ONE, vx: 0, vy: 3 * ONE });
  run(crash, 40);
  assert.equal(crash.hits, 1, 'flying into it is one hit');
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

test('v3: a pick removes the enemy bullets near the ship only, gives a short invulnerability, and touches nothing else', () => {
  let swept = 0, kept = 0;
  const R = PICK_CLEAR_R * 256, close = (sim, b) => (b.x - sim.px) ** 2 + (b.y - sim.py) ** 2 <= R * R;
  for (const seed of [5, 77]) {
    const sim = createSim(seed);
    while (phase(sim) !== 'over') {
      if (phase(sim) !== 'choice') { step(sim, STRONG.input(sim)); continue; }
      // v8: a boss's bullets fade when it goes down, so a supply usually opens on an empty sky; put one bullet inside
      // the radius and one outside to show what the pick itself does
      sim.bullets.push({ x: sim.px + 50 * ONE, y: sim.py - 50 * ONE, vx: 0, vy: 0, grazed: 0 }, { x: sim.px, y: sim.py - (PICK_CLEAR_R + 80) * ONE, vx: 0, vy: 0, grazed: 0 });
      const far = sim.bullets.filter(b => !close(sim, b));
      const before = { bullets: sim.bullets.length - far.length, enemies: sim.enemies.length, shots: sim.shots.length, score: sim.score, chain: sim.chain, tick: sim.tick };
      assert.equal(choose(sim, 2), true);                  // a scoring card: no shield or fire side effect
      swept += before.bullets; kept += far.length;
      assert.deepEqual(sim.bullets, far, 'bullets outside the radius are all still there, in order');
      assert.ok(sim.invuln >= PICK_INVULN);
      assert.deepEqual({ enemies: sim.enemies.length, shots: sim.shots.length, score: sim.score, chain: sim.chain, tick: sim.tick },
        { enemies: before.enemies, shots: before.shots, score: before.score, chain: before.chain, tick: before.tick });
      assert.equal(sim.events.find(e => e.type === 'clear').n, before.bullets);
    }
  }
  assert.ok(swept > 0 && kept > 0, 'the picks really had bullets both inside and outside the radius');
});

test('skill evidence on the tuning questions: the strong strategy beats the random one and every simple one', async () => {
  const thresholds = await evidenceThresholds();
  const r = runEvidence(GAME, STRATEGIES, { n: thresholds.minQuestions, thresholds });
  assert.deepEqual(r.verdict, { enoughQuestions: true, beatsRandom: true, beatsEverySimple: true, pass: true }, r.pairs.map(p => `${p.other}: ${p.wins}-${p.ties}-${p.losses} p=${p.p}`).join('; '));
});

// Legacy measure (RULE-SKILL-DOMINANCE applies to the three existing games only). It runs only while tools/bots.mjs
// exists: a new game deletes bots.mjs and skill-dominance.mjs, and this test skips itself. (tools/lib/dominance.mjs
// stays while examples/ and test/recipes.test.mjs are kept: the recipe examples still use it.)
const hasTiers = existsSync(new URL('../tools/bots.mjs', import.meta.url));
test('legacy: skill tiers separate on the same seeds (only with tools/bots.mjs)', { skip: !hasTiers && 'no tools/bots.mjs' }, async () => {
  const { runDominance } = await import('../tools/lib/dominance.mjs');
  const { BOTS } = await import('../tools/bots.mjs');
  const r = runDominance(GAME, BOTS, 12);
  assert.ok(r.pass, `skill share ${r.shares.skillTier.toFixed(2)}, top win rate ${r.top.toFixed(2)}`);
});

// Only games with scripted progression have a difficulty curve to check (RULE-CURVE-*, RULE-GAME-DOCS). A game whose
// <Game>/game.profile.json says scriptedProgression: false skips this test; the template itself (no profile) runs it.
const noCurve = (() => {
  try { return JSON.parse(readFileSync(new URL('../../game.profile.json', import.meta.url), 'utf8')).scriptedProgression === false; } catch { return false; }
})();

test('scripted difficulty curve passes the D-gates (knowledge-base/16; full report: npm run playtest)', { skip: noCurve && 'game.profile.json: scriptedProgression is false' }, async () => {
  const { execFileSync } = await import('node:child_process');
  // tools/playtest.mjs exits 1 when any check fails; 12 seeds keep the test fast (v11: at 8 the last section sat a fraction over the band's top; 12 to 30 agree)
  assert.doesNotThrow(() => execFileSync(process.execPath, ['tools/playtest.mjs', '12'], { cwd: new URL('..', import.meta.url), stdio: 'pipe' }));
});

test('full-match replay fits the server budget', () => {
  const rec = playMatch(GAME, 4242, STRONG);
  const t0 = performance.now();
  assert.equal(replay(GAME, 4242, rec.log, rec.choices, rec.ticks).valid, true);
  assert.ok(performance.now() - t0 < 500);
});

// --- v8: formations, elites, set pieces, shells, the short boost, drifting drops (spec §5 「第八版」) ---
import {
  FORM_AT, ELITE_AT, CARRIER, CARRIERS, strikes, STRIKES, formSize, ELITE_HP, ELITE_PTS, BOOST_TICKS, BOOST_AFTER_PICK,
  SPREAD_SHOTS, DROP_LIFE, DROP_MIN_X, DROP_MIN_Y, PLAYER_MAX_Y, GORGE_HALF, WORLD_W, radius, GUNNER, CHAIN_STEP,
} from '../src/sim/sim.js';

test('v8: formations, elites and the set pieces come from the script and the seed only; a formation takes its drones from the unit, it adds none', () => {
  for (const seed of [5, 77, 4242]) {
    const plan = schedule(seed);
    assert.deepEqual(plan, schedule(seed));
    WAVES.forEach((w, u) => {
      const drones = plan.filter(p => p.type === DRONE && !p.el && Math.floor(p.at / U) === u && sectionAt(p.at) === sectionAt(u * U));
      if (FORM_AT[u] >= 0) assert.ok(formSize(FORM_AT[u], w[0]) >= 3 && formSize(FORM_AT[u], w[0]) <= w[0]);
      if (w[0]) assert.ok(drones.length <= w[0]);
    });
    assert.equal(plan.filter(p => p.type === DRONE && !p.el).length, WAVES.reduce((s, w) => s + w[0], 0));
    const elites = plan.filter(p => p.el);
    assert.equal(elites.length, ELITE_AT.length);
    for (const e of elites) { assert.ok(e.drop >= 0, 'an elite always carries a drop'); assert.equal(e.hp % ELITE_HP, 0); assert.ok(!SCRIPT[sectionAt(e.at)].boss && !SCRIPT[sectionAt(e.at)].boost); }
    const convoy = plan.filter(p => p.type === CARRIER);
    assert.equal(convoy.length, CARRIERS);
    for (const c of convoy) { assert.ok(c.drop >= 0); assert.equal(SCRIPT[sectionAt(c.at)].event, 'convoy'); }
    const sky = strikes(seed);
    assert.equal(sky.length, STRIKES);
    assert.equal(new Set(sky.map(k => k.x)).size, STRIKES);
    for (const k of sky) assert.equal(SCRIPT[sectionAt(k.at)].event, 'storm');
  }
  assert.ok(new Set(FORM_AT.filter(k => k >= 0)).size === 4, 'all four formations are used');
  for (const s of SCRIPT) if (s.event) assert.ok(WAVES[s.from].every(n => n === 0), 'nothing else enters during a set piece');
});

test('v8: the gorge leaves a way through every row; the shower and the gorge are the same for everyone', () => {
  for (const seed of [5, 77, 4242]) {
    const rocks = obstacles(seed), gorge = rocks.filter(o => SCRIPT[sectionAt(o.at)].event === 'gorge');
    assert.deepEqual(rocks, obstacles(seed));
    assert.ok(gorge.length > 0 && rocks.some(o => SCRIPT[sectionAt(o.at)].event === 'shower'));
    for (const at of new Set(gorge.map(o => o.at))) {
      const xs = gorge.filter(o => o.at === at).map(o => o.x).sort((a, b) => a - b);
      let gap = 0;
      for (let i = 1; i < xs.length; i++) gap = Math.max(gap, xs[i] - xs[i - 1] - 2 * PEAK_R);
      assert.ok(gap >= 2 * GORGE_HALF - 1, `row at ${at}: the way through is ${gap} px`);
    }
  }
});

test('v8: a shell is chipped one layer per weak shot and takes no health with it; a heavy round breaks it and still hurts', () => {
  const shelled = gear => {
    const sim = stage([{ type: GUNNER, hp: 40, sh: 4 }]); sim.gear[HEAVY] = gear;   // the twin shots land on the same tick
    const seen = [];
    for (let i = 0; i < 200 && seen.length < 4; i++) { step(sim, 0); seen.push(...sim.events.filter(e => e.type === 'shell')); if (seen.length && sim.enemies[0].sh === 0) break; }
    return { sim, seen };
  };
  const weak = shelled(0);
  assert.deepEqual(weak.seen.map(e => e.left), [3, 2, 1, 0]);
  assert.equal(weak.sim.enemies[0].hp, 40, 'the shell took the shots: no health lost yet');
  const heavy = shelled(1);
  assert.deepEqual([heavy.seen.length, heavy.seen[0].left, heavy.seen[0].broke], [1, 0, 1]);
  assert.equal(heavy.sim.enemies[0].hp, 40 - 2 * HEAVY_DMG[0], 'the first heavy round broke the shell and still hurt; so did its twin');
});

test('v8: an elite is bigger and worth three times the base points', () => {
  const sim = stage([{ type: GUNNER, hp: 1, el: 1 }]);
  const seen = run(sim, 200), kill = seen.find(e => e.type === 'kill');
  assert.equal(kill.elite, 1);
  assert.equal(kill.pts, KIND[GUNNER].pts * ELITE_PTS + CHAIN_STEP);
  assert.ok(radius({ type: GUNNER, el: 1 }) > radius({ type: GUNNER, el: 0 }));
});

test('v8: after a supply only a short run-up is left of the boost; after a boss that got away the boost is two seconds', () => {
  const fly = down => {
    const sim = createSim(77);
    while (phase(sim) !== 'over' && sim.slot === 0) {
      if (phase(sim) === 'choice') { choose(sim, 0); continue; }
      sim.shields = 3;
      const boss = sim.enemies.find(e => isBoss(e.type));
      if (boss) boss.hp = down ? Math.min(boss.hp, 1) : 9999;
      step(sim, STRONG.input(sim));
    }
    const next = (BOSS_SLOTS[0].end + 1) * U, t0 = sim.tick;
    if (phase(sim) === 'choice') choose(sim, 0);
    while (clock(sim) < next) { sim.shields = 3; step(sim, 0); }
    return sim.tick - t0;
  };
  assert.equal(fly(true), BOOST_AFTER_PICK);
  assert.equal(fly(false), BOOST_TICKS);
});

test('v8: a drop drifts, bounces off the frame and is gone after its life; nothing about it is rolled at play time', () => {
  const sim = stage([]);
  sim.px = 600 * ONE; sim.py = 1200 * ONE;
  sim.drops.push({ x: 60 * ONE, y: 80 * ONE, kind: REPAIR, vx: -300, vy: -300, t: 0 });
  let gone = -1;
  while (gone < 0 && sim.tick < DROP_LIFE + 5) {
    if (phase(sim) === 'choice') { choose(sim, 0); continue; }
    step(sim, 0);
    for (const d of sim.drops) assert.ok(d.x >= DROP_MIN_X * ONE && d.x <= (WORLD_W - DROP_MIN_X) * ONE && d.y >= DROP_MIN_Y * ONE && d.y <= PLAYER_MAX_Y * ONE);
    if (sim.events.some(e => e.type === 'dropGone')) gone = sim.tick;
    if (sim.events.some(e => e.type === 'pickup')) assert.fail('it was never near the ship');
  }
  assert.equal(gone, DROP_LIFE);
  const a = playMatch(GAME, 4242, STRONG), b = playMatch(GAME, 4242, STRONG);
  assert.deepEqual(a.result(), b.result());
});

// --- RULE-NO-FORCED-HIT: the fixed hazards (obstacles, the gorge, the shower, the storm's lightning) never close every
// way through, alone or together; and a wall of bullets is never fired while the gorge is on, because its gap could
// then lie inside the rock. Aimed bullets are not covered here: they depend on where the ship is. ---
import { inGorge, strikes as skyOf, OBST_R, PEAK_VY, METEOR_VY, PLAYER_R, PLAYER_MARGIN_X, PLAYER_START_Y, MATCH_TICKS, OBST_WARN } from '../src/sim/sim.js';

test('no forced hit: at every tick some spot the ship can still reach is clear of every obstacle and every lightning column', () => {
  const STEP = 5, MARGIN = 6, xs = [];
  for (let x = PLAYER_MARGIN_X; x <= WORLD_W - PLAYER_MARGIN_X; x += STEP) xs.push(x);
  const reach = Math.floor(PLAYER_SPEED / STEP), y = PLAYER_START_Y;
  for (const seed of [5, 77, 1234, 4242, 20261118]) {
    const rocks = obstacles(seed), sky = skyOf(seed);
    let safe = xs.map(() => true), narrowest = xs.length;
    for (let t = 0; t < MATCH_TICKS; t++) {
      const live = rocks.filter(o => t >= o.at && (t - o.at) * (o.kind === PEAK ? PEAK_VY : METEOR_VY) < 1280 + 200);
      const lit = sky.filter(k => t >= k.at + BEAM_TELEGRAPH && t < k.at + BEAM_TELEGRAPH + BEAM_TICKS);
      if (!live.length && !lit.length) { safe = xs.map(() => true); continue; }
      const danger = x => live.some(o => { const r = OBST_R[o.kind] + PLAYER_R + MARGIN, dx = o.x + o.vx * (t - o.at) - x, dy = -OBST_R[o.kind] + (o.kind === PEAK ? PEAK_VY : METEOR_VY) * (t - o.at) - y; return dx * dx + dy * dy <= r * r; })
        || lit.some(k => Math.abs(k.x - x) <= BEAM_W + PLAYER_R + MARGIN);
      const next = xs.map((x, i) => { if (danger(x)) return false; for (let j = Math.max(0, i - reach); j <= Math.min(xs.length - 1, i + reach); j++) if (safe[j]) return true; return false; });
      const n = next.filter(Boolean).length;
      assert.ok(n > 0, `seed ${seed}, tick ${t}: every reachable spot is covered`);
      narrowest = Math.min(narrowest, n);
      safe = next;
    }
    assert.ok(narrowest * STEP >= 2 * PLAYER_R, `seed ${seed}: the tightest way through is ${narrowest * STEP} px`);
  }
});

test('no forced hit: no wall of bullets is announced while the gorge is on', () => {
  const sim = createSim(77), from = SCRIPT.find(s => s.event === 'gorge').from * U - OBST_WARN;
  sim.plan = []; sim.sky = []; sim.skip = from - 400;                // start a little before the gorge, with a bulwark already hovering
  sim.plan = [{ at: from - 400, type: BULWARK, lane: 2, x: 360, hp: 9999, drop: -1 }];
  let walls = 0, during = 0, ticksIn = 0;
  for (let i = 0; i < 1500; i++) {
    if (phase(sim) === 'choice') { choose(sim, 0); continue; }
    sim.shields = 3; sim.invuln = 5; sim.gear = [0, 0, 0, 0, 0, 0, 0, 0];
    const on = inGorge(sim);
    step(sim, 0);
    for (const e of sim.events) if (e.type === 'wall') { walls++; if (on) during++; }
    if (on) ticksIn++;
  }
  assert.ok(ticksIn > 300, 'the run covered the gorge');
  assert.equal(during, 0);
});

test('v8: when a boss goes down its bullets are gone that tick (no hit, no graze from them) and reported so the picture can fade them', () => {
  const sim = createSim(77), seen = [];
  while (phase(sim) !== 'over' && sim.slot === 0) {
    if (phase(sim) === 'choice') { choose(sim, 0); continue; }
    sim.shields = 3;
    const boss = sim.enemies.find(e => isBoss(e.type));
    if (boss && sim.bullets.length > 6) boss.hp = Math.min(boss.hp, 1);   // let it fire first
    step(sim, STRONG.input(sim));
    seen.push(...sim.events.map(e => ({ ...e, bulletsAfter: sim.bullets.length })));
  }
  const fade = seen.find(e => e.type === 'fade');
  assert.ok(fade && fade.bullets.length > 0);
  assert.equal(fade.bulletsAfter, 0);
});

// --- v9: bosses in three stages, mid-bosses behind a shield (spec §5 「第九版」) ---
import { STAGE_FLOOR_PCT, CORE_R_PCT, BREAK_STUN, BREAK_PTS, MID_SHIELD_REGEN, MID_SHIELD_REFILLS, shieldMax, stageFloor, MID1, BOSS_Y } from '../src/sim/sim.js';
const bossOn = (type, seed = 5) => {                         // a boss already in position, nothing else around
  const sim = stage([], seed);
  sim.sky = []; sim.skip = 10 * U;                           // past the opening supply
  sim.enemies.push({ id: sim.nextId++, type, x: sim.px, y: BOSS_Y * ONE, hp: KIND[type].hp, t: 200, ax: sim.px, aux: 100, vx: 0, pk: 0, pv: 0, pw: 0, a: 64, bt: 0, bm: 0, dr: 0, sh: 0, el: 0, ac: 0, q: 0, qd: 0, st: 0, stun: 0, shd: type >= MID1 ? shieldMax(type) : 0, idle: 0, refills: 0, ch: 0, cw: 0 });
  sim.bossState = 1;
  return sim;
};

test('v9: a boss is shot through one stage at a time; a break stops it for a second, leaves its bullets in the air (v11), drops something and pays points; the core is a smaller target', () => {
  const sim = bossOn(BOSS), boss = sim.enemies[0], full = KIND[BOSS].hp, floors = STAGE_FLOOR_PCT.map(p => Math.trunc((full * p) / 100));
  assert.equal(stageFloor(boss), floors[0]);
  const r0 = radius(boss);
  sim.gear[HEAVY] = 3;                                       // big hits: the overshoot must not carry into the next stage
  boss.hp = floors[0] + 1;
  let ev = [];
  while (boss.st === 0) { sim.invuln = 5; step(sim, 0); ev.push(...sim.events); }
  const brk = ev.find(e => e.type === 'armorBreak');
  assert.deepEqual([boss.hp, boss.st, brk.stage, brk.pts], [floors[0], 1, 1, BREAK_PTS[0]]);
  assert.ok(ev.some(e => e.type === 'drop'), 'a break drops something');
  assert.ok(!ev.some(e => e.type === 'fade'), 'v11: a break clears nothing');
  sim.bullets.push({ x: 60 * ONE, y: 300 * ONE, vx: 0, vy: ONE, grazed: 0 });
  assert.ok(boss.stun > 0 && boss.stun <= BREAK_STUN);
  const quiet = [];
  while (boss.stun > 0) { sim.invuln = 5; const hp = boss.hp; boss.hp = 9999; step(sim, 0); boss.hp = hp; quiet.push(...sim.events.filter(e => ['enemyFire', 'bossRing', 'aim', 'wall', 'beamUp'].includes(e.type))); }
  assert.deepEqual(quiet, [], 'no attack while it is stunned');
  assert.ok(sim.bullets.length > 0, 'v11: what was in the air is still there after the stun');
  boss.hp = floors[1] + 1;
  while (boss.st === 1) { sim.invuln = 5; step(sim, 0); }
  assert.deepEqual([boss.hp, boss.st], [floors[1], 2]);
  assert.equal(radius(boss), Math.trunc((r0 * CORE_R_PCT) / 100));
  assert.equal(stageFloor(boss), 0);
});

test('v9: a mid-boss loses its shield before its health; the shield returns after three seconds without a hit, twice at most', () => {
  const sim = bossOn(MID1), mid = sim.enemies[0], max = shieldMax(MID1);
  assert.equal(mid.shd, max);
  let broke = 0;
  for (let i = 0; i < 600 && !broke; i++) { sim.invuln = 5; step(sim, 0); if (sim.events.some(e => e.type === 'shieldBreak')) broke = 1; }
  assert.ok(broke);
  assert.ok(mid.hp >= KIND[MID1].hp - 1, 'the shield took everything; only the twin of the shot that broke it reached the hull');
  const away = () => { sim.px = 60 * ONE; sim.shots.length = 0; };   // off the firing line
  for (let n = 1; n <= MID_SHIELD_REFILLS; n++) {
    away(); mid.idle = 0;
    let back = -1;
    for (let i = 0; i <= MID_SHIELD_REGEN + 5 && back < 0; i++) { sim.invuln = 5; away(); mid.x = 600 * ONE; mid.ax = 600 * ONE; step(sim, 0); if (sim.events.some(e => e.type === 'shieldUp')) back = mid.idle; }
    assert.equal(mid.shd, max, 'refill ' + n);
    mid.shd = 0;
  }
  mid.idle = 0;
  for (let i = 0; i <= MID_SHIELD_REGEN + 5; i++) { sim.invuln = 5; away(); mid.x = 600 * ONE; mid.ax = 600 * ONE; step(sim, 0); }
  assert.equal(mid.shd, 0, 'no third refill');
});

test('v9: gear that is already full raises the life the ship can hold (and gives one life back), up to the cap; the full repair no longer drops', async () => {
  const { LIFE_CAP, DROP_WEIGHTS } = await import('../src/sim/sim.js');
  const sim = createSim(77);
  while (phase(sim) !== 'choice') step(sim, 0);
  const g = offer(sim)[0];
  sim.gear[g] = GEAR_MAX_LV; sim.shields = 1;
  choose(sim, 0);
  assert.deepEqual([sim.maxShields, sim.shields, sim.gear[g]], [SHIELDS + 1, 2, GEAR_MAX_LV]);
  sim.maxShields = LIFE_CAP; sim.shields = LIFE_CAP; sim.supply = 0; sim.gear[offer(sim)[0]] = GEAR_MAX_LV;
  choose(sim, 0);
  assert.deepEqual([sim.maxShields, sim.shields], [LIFE_CAP, LIFE_CAP], 'never past the cap');
  sim.shields = 1; sim.drops.push({ x: sim.px, y: sim.py, kind: REPAIR, vx: 0, vy: 0, t: 0 });
  step(sim, 0);
  assert.equal(sim.shields, 2, 'a repair is one life');
  assert.equal(DROP_WEIGHTS[OVERHAUL], 0);
  for (const seed of [5, 77, 4242]) assert.ok(schedule(seed).every(p => p.drop !== OVERHAUL));
});

// --- v10: boss armour and the charge (spec §5 「第十版」) ---
import { BOSS_ARMOUR, armoured, inCharge, CHARGE_BOSSES, CHARGE_PERIOD, CHARGE_WARN, CHARGE_DEPTH, CHARGE_REACH, CHARGE_HALF_W, BOSS2, BOSS3, BOSS4 } from '../src/sim/sim.js';

test('v10: while a boss has its armour on, a shot that meets a plated part is stopped and does nothing; the lane under the core is open; with the plates off nothing stops a shot', () => {
  for (const type of [BOSS, BOSS2, BOSS3, BOSS4]) {
    const [inner, outer, top, bottom] = BOSS_ARMOUR[type];
    assert.ok(inner >= 50, 'the lane to the core is at least 100 px wide');
    const sim = bossOn(type), boss = sim.enemies[0];
    const shot = dx => { const before = boss.hp; sim.shots.length = 0; sim.shots.push({ x: boss.x + dx * ONE, y: boss.y + (bottom - 4) * ONE, vx: 0, vy: 4 * ONE, dmg: 1, left: 0, hit: [] }); const b = { ...boss }; let ev = []; for (let i = 0; i < 120 && sim.shots.some(q => q.vy === 4 * ONE); i++) { Object.assign(boss, b, { hp: boss.hp }); sim.invuln = 5; step(sim, 0); ev.push(...sim.events); sim.shots = sim.shots.filter(q => q.vy === 4 * ONE); } return { lost: before - boss.hp, clang: ev.some(e => e.type === 'clang') }; };
    assert.deepEqual(shot((inner + outer) >> 1), { lost: 0, clang: true }, `type ${type}: plate`);
    assert.deepEqual(shot(0), { lost: 1, clang: false }, `type ${type}: core`);
    boss.st = 1;
    assert.equal(armoured(boss, boss.x + ((inner + outer) >> 1) * ONE, boss.y), false);
    assert.equal(top < 0 && bottom > 0, true);
  }
});

test('v10 (no forced hit): only Oceanus and Eos charge, never with the armour on; it holds still while it announces, the lane can be left in time, and the bottom of the screen is out of reach', () => {
  assert.deepEqual([...CHARGE_BOSSES], [BOSS, BOSS3]);
  assert.ok((CHARGE_HALF_W + PLAYER_R) / PLAYER_SPEED < CHARGE_WARN / 2, 'out of the lane sideways in under half the warning');
  assert.ok(BOSS_Y + CHARGE_DEPTH + CHARGE_REACH + PLAYER_R < PLAYER_MAX_Y - 100, 'room below the lunge');
  assert.ok(2 * (CHARGE_HALF_W + PLAYER_R) < WORLD_W - 2 * PLAYER_MARGIN_X - 200, 'room beside the lane');
  for (const type of [BOSS, BOSS2, BOSS3, BOSS4]) {
    for (const st of [0, 1]) {
      const sim = bossOn(type), boss = sim.enemies[0];
      boss.st = st; sim.py = PLAYER_MAX_Y * ONE; sim.px = 40 * ONE;       // far from everything
      let warnAt = -1, goAt = -1, backAt = -1, xAtWarn = 0, moved = false, deepest = 0;
      for (let i = 0; i < CHARGE_PERIOD * 2 + 400; i++) {
        boss.hp = 9999; sim.invuln = 5; step(sim, 0);
        if (phase(sim) === 'over') break;
        for (const e of sim.events) { if (e.type === 'chargeWarn' && warnAt < 0) { warnAt = i; xAtWarn = boss.x; } if (e.type === 'charge' && goAt < 0) goAt = i; }
        if (warnAt >= 0 && goAt < 0 && boss.x !== xAtWarn) moved = true;
        if (goAt >= 0 && backAt < 0) { deepest = Math.max(deepest, boss.y); if (!boss.ch) backAt = i; }
      }
      const charges = CHARGE_BOSSES.includes(type) && st >= 1;
      assert.equal(warnAt >= 0, charges, `type ${type} stage ${st}`);
      if (!charges) continue;
      assert.equal(goAt - warnAt, CHARGE_WARN);
      assert.equal(moved, false, 'it holds still while it announces');
      assert.equal(deepest, (BOSS_Y + CHARGE_DEPTH) * ONE);
      assert.ok(backAt > goAt && boss.y === BOSS_Y * ONE, 'it comes back to where it was');
    }
  }
  // the lane hurts only while the charge is on
  const sim = bossOn(BOSS), boss = sim.enemies[0];
  assert.equal(inCharge(boss, boss.x, boss.y + CHARGE_REACH * ONE), true);
  assert.equal(inCharge(boss, boss.x + (CHARGE_HALF_W + 1) * ONE, boss.y + 10 * ONE), false);
});

test('v10 (hidden trick): heavy shots break an obstacle, three for a peak and four for a meteor; ordinary shots are stopped and do nothing to it', async () => {
  const { OBST_HP } = await import('../src/sim/sim.js');
  assert.deepEqual([...OBST_HP], [3, 4]);
  for (const kind of [PEAK, METEOR]) {
    const sim = stage([], 5);
    sim.sky = []; sim.skip = 10 * U;
    const rock = { kind, x: 600 * ONE, y: 300 * ONE, vx: 0, vy: 0, hp: OBST_HP[kind] };
    sim.obst.push(rock); sim.px = 100 * ONE;                           // the ship is nowhere near: only the shots placed here reach it
    const fireAt = dmg => { sim.shots.push({ x: rock.x, y: rock.y + 200 * ONE, vx: 0, vy: 20 * ONE, dmg, left: 2, hit: [] }); const ev = []; for (let i = 0; i < 20; i++) { rock.y = 300 * ONE; sim.invuln = 5; step(sim, 0); ev.push(...sim.events); } return ev; };
    for (let i = 0; i < 6; i++) fireAt(1);
    assert.equal(rock.hp, OBST_HP[kind], 'ordinary shots do nothing');
    assert.ok(sim.obst.includes(rock));
    let broke = [];
    for (let i = 0; i < OBST_HP[kind]; i++) { assert.ok(sim.obst.includes(rock), `still there before heavy shot ${i + 1}`); broke = fireAt(2); }
    assert.equal(sim.obst.includes(rock), false);
    assert.ok(broke.some(e => e.type === 'obstBreak' && e.kind === kind));
  }
});

test('v10: a boss takes no damage while a stage is breaking (the stun after a break); it does again the moment it moves', () => {
  const sim = bossOn(BOSS), boss = sim.enemies[0], floor = stageFloor(boss);
  sim.gear[HEAVY] = 3; boss.hp = floor + 1;
  while (boss.st === 0) { sim.invuln = 5; sim.px = boss.x; step(sim, 0); }
  assert.ok(boss.stun > 0);
  const hp = boss.hp;
  while (boss.stun > 0) { sim.invuln = 5; sim.px = boss.x; step(sim, 0); assert.equal(boss.hp, hp, 'untouched while it breaks'); }
  for (let i = 0; i < 120 && boss.hp === hp; i++) { sim.invuln = 5; sim.px = boss.x; step(sim, 0); }
  assert.ok(boss.hp < hp, 'it can be hurt again');
});
