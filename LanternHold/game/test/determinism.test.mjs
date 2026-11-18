// Game-rule determinism and fairness for LanternHold (spec 禮12).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Recorder, playMatch, verify, replay } from '../src/sim/core/index.js';
import { GAME, GAMES, createSim, step, choose, phase, OP, encode, REDEPLOY_CD, CHOICE, CARDS, EVOS, STAGE_IDS, WALL } from '../src/sim/sim.js';
import { BOTS } from '../tools/bots.mjs';

test('same seed + same inputs => identical result', () => {
  assert.deepEqual(playMatch(GAME, 1234, BOTS.expert).result(), playMatch(GAME, 1234, BOTS.expert).result());
});

test('golden match (cross-engine determinism; update only when GAME.version is bumped)', () => {
  const r = playMatch(GAME, 1234, BOTS.expert).result();
  assert.deepEqual(r, GOLDEN, JSON.stringify(r));
});
const GOLDEN = { game: 'lantern-hold-s5', version: 7, seed: 1234, ticks: 19369, score: 4152, hash: 3254229519 };

test('uploaded match verifies; tampered score does not', () => {
  const up = playMatch(GAME, 98765, BOTS.intermediate).upload();
  assert.equal(verify(GAME, up).valid, true);
  assert.equal(verify(GAME, { ...up, score: up.score + 10 }).valid, false);
});

test('different seeds diverge', () => {
  assert.notEqual(playMatch(GAME, 1, BOTS.expert).result().hash, playMatch(GAME, 2, BOTS.expert).result().hash);
});

test('the challenge depends only on the seed, not on player behaviour (fairness E2)', () => {
  const spawns = policy => {
    const sim = createSim(77), seen = [];
    for (let t = 0; t < sim.script.events[3].at; t++) { step(sim, policy(sim, t)); for (const e of sim.events) if (e.type === 'spawn') seen.push(`${e.kind}@${e.gate}`); }
    return { seen, gates: sim.eventState.map(e => e.gates.join()) };
  };
  const idle = spawns(() => 0);
  const busy = spawns((sim, t) => [1, 0, 0][t % 3] && t < 6 ? [OP.BUILD, 0, 0][t % 3] : 0);
  assert.deepEqual(idle.gates, busy.gates);
  assert.deepEqual(idle.seen.slice(0, 20), busy.seen.slice(0, 20));
});

test('render events never change the outcome (recordEvents off = same hash)', () => {
  const rec = new Recorder(GAME, 4242);
  while (rec.phase !== 'over') { if (rec.phase === 'choice') rec.choose(BOTS.novice.pick(rec.sim)); else rec.step(BOTS.novice.input(rec.sim)); }
  const r = replay(GAME, 4242, rec.log, rec.choices, rec.ticks);
  assert.equal(r.hash, rec.result().hash);
});

test('redeploy: a unit cannot be moved again during its cooldown, and a refused command changes nothing', () => {
  const sim = createSim(5);
  const feed = cmd => { for (const b of cmd) step(sim, b); };
  const archer = sim.units.findIndex(u => u.alive);
  feed(encode(OP.MOVE, archer, 9 * 12 + 6));
  const u = sim.units[archer];
  assert.equal(u.state, 'moving');
  const home = [u.hx, u.hy];
  feed(encode(OP.MOVE, archer, 9 * 12 + 4));            // still cooling down -> ignored
  assert.deepEqual([u.hx, u.hy], home);
  for (let t = 0; t < REDEPLOY_CD; t++) step(sim, 0);
  feed(encode(OP.MOVE, archer, 9 * 12 + 4));
  assert.notDeepEqual([u.hx, u.hy], home);
});

test('placement outside the light and away from allies is refused', () => {
  const sim = createSim(5);
  const archer = sim.units.findIndex(u => u.alive);
  for (const b of encode(OP.MOVE, archer, 0)) step(sim, b);  // top-left corner cell
  assert.equal(sim.units[archer].state, 'guard');
});

test('a full match replays within the server budget', () => {
  const rec = playMatch(GAME, 31337, BOTS.expert);
  const t0 = performance.now();
  replay(GAME, 31337, rec.log, rec.choices, rec.ticks);
  assert.ok(performance.now() - t0 < 500, `${(performance.now() - t0).toFixed(0)} ms`);
});

// --- cards (gdd/06) ---
const toOffer = sim => { while (phase(sim) === 'play') step(sim, 0); return sim.offer.ids.slice(); };

test('the k-th offer is the same for every player who reaches it with the same cards (fairness E2)', () => {
  const a = createSim(321), b = createSim(321);
  const oa = toOffer(a);
  for (const x of encode(OP.WALL, 3, 0)) step(b, x);        // b plays differently before the first level-up
  assert.deepEqual(toOffer(b), oa);
});

test('reroll, ignore a type, lock a type: limited, and a refused choice changes nothing', () => {
  const sim = createSim(99);
  const first = toOffer(sim);
  assert.equal(choose(sim, CHOICE.REROLL), true);
  assert.notDeepEqual(sim.offer.ids, first);
  assert.equal(choose(sim, CHOICE.REROLL), true);
  assert.equal(choose(sim, CHOICE.REROLL), false);           // out of rerolls
  const type = CARDS[sim.offer.ids[1]].type;
  assert.equal(choose(sim, CHOICE.IGNORE + 1), true);        // ignore that card's type for the match
  assert.equal(sim.ignored[type], true);
  assert.ok(!sim.offer.ids.some(id => CARDS[id]?.type === type));
  assert.equal(choose(sim, CHOICE.IGNORE), false);           // out of ignores
  const lockType = CARDS[sim.offer.ids[0]].type;
  assert.equal(choose(sim, CHOICE.LOCK), true);
  assert.equal(sim.lockType, lockType);
  assert.equal(choose(sim, CHOICE.LOCK + 1), false);         // out of locks
  assert.equal(choose(sim, 7), false);
  assert.equal(choose(sim, 0), true);
  assert.equal(sim.picks, 1);
});

test('a ready evolution is always offered first', () => {
  const sim = createSim(7);
  toOffer(sim);
  sim.cards.rapid = 3; sim.cards.split = 1;                  // set up the recipe directly
  sim.offer = null; sim.pending = 1;
  step(sim, 0);                                               // the next tick opens a fresh offer
  assert.equal(sim.offer.ids[0], 'arrowStorm');
  assert.equal(choose(sim, 0), true);
  assert.equal(sim.evo.arrowStorm, true);
});

test('card picks replay: same seed, inputs and choices give the same hash', () => {
  const rec = playMatch(GAME, 2024, BOTS.expert);
  assert.ok(rec.choices.length >= 5, `only ${rec.choices.length} picks`);
  const r = replay(GAME, 2024, rec.log, rec.choices, rec.ticks);
  assert.equal(r.valid, true);
  assert.equal(r.hash, rec.result().hash);
  const bad = rec.choices.map((c, k) => (k === 0 ? [c[0], c[1], (c[2] + 1) % 3] : c));
  assert.notEqual(replay(GAME, 2024, rec.log, bad, rec.ticks).hash, rec.result().hash);
});

// --- v6: walls, barracks, workers, stages ---
const feed = (sim, cmd) => { for (const b of cmd) step(sim, b); };

test('walls upgrade palisade -> stone -> iron with gold; there is no gold repair', () => {
  const sim = createSim(11);
  sim.gold = 100;
  feed(sim, encode(OP.WALL, 4, 0)); feed(sim, encode(OP.WALL, 4, 0)); feed(sim, encode(OP.WALL, 4, 0));
  assert.equal(sim.walls[4].lv, 3);
  assert.equal(sim.gold, 100 - WALL[1].cost - WALL[2].cost - WALL[3].cost);
  feed(sim, encode(OP.WALL, 4, 1));                          // the old repair command does nothing
  assert.equal(sim.gold, 100 - WALL[1].cost - WALL[2].cost - WALL[3].cost);
});

test('a barracks trains shields only from Lv2 and priests only from Lv3', () => {
  const sim = createSim(12);
  sim.gold = 500;
  feed(sim, encode(OP.BUILD, 0, 0));
  for (let t = 0; t < 70; t++) step(sim, 0);
  feed(sim, encode(OP.MENU, 0, 1));
  assert.equal(sim.slots[0].queue.length, 0);
  feed(sim, encode(OP.MENU, 0, 3));                          // upgrade to Lv2
  feed(sim, encode(OP.MENU, 0, 1));
  assert.deepEqual(sim.slots[0].queue, ['shield']);
  feed(sim, encode(OP.MENU, 0, 2));
  assert.deepEqual(sim.slots[0].queue, ['shield']);
});

test('workers repair a damaged wall for free', () => {
  const sim = createSim(13);
  sim.gold = 100;
  feed(sim, encode(OP.WALL, 18, 0));
  feed(sim, encode(OP.MENU, 255, 0));
  sim.walls[18].hp = 10;
  const gold = sim.gold;
  for (let t = 0; t < 900 && sim.walls[18].hp < 80; t++) { if (phase(sim) === 'choice') choose(sim, 0); else step(sim, 0); }
  assert.ok(sim.walls[18].hp > 10, `wall hp ${sim.walls[18].hp}`);
  assert.ok(sim.gold >= gold);
});

test('every stage builds a rising script that ends with its final boss', () => {
  for (const id of STAGE_IDS) {
    const sim = GAMES[id].createSim(1), ev = sim.script.events;
    assert.ok(ev.length > 5);
    assert.ok(ev.every((e, k) => k === 0 || e.at > ev[k - 1].at));
    assert.equal(ev.filter(e => e.final).length, 1);
    assert.equal(ev[ev.length - 1].final, true);
    assert.equal(GAMES[id].maxTicks, ev[ev.length - 1].at + 90 * 60);
  }
});

// --- unit behaviours and fixed chests ---
test('a chest gives a fixed number of cards for its source (no dice)', () => {
  const a = createSim(1), b = createSim(999);
  for (const sim of [a, b]) { sim.cards.rapid = 1; sim.owned.push('rapid'); sim.cards.split = 1; sim.owned.push('split'); }
  // the same chest source upgrades the same number of cards whatever the seed
  const before = s => s.cards.rapid + s.cards.split;
  const open = sim => { sim.chestKillN = 0; sim.kills = 99; sim.foes.push({ id: 9e6, kind: 'rat', x: 0, y: 0, hp: 0, ev: -1, done: false, burn: 0, slow: 0, stun: 0 }); step(sim, 0); };
  const ba = before(a), bb = before(b);
  open(a); open(b);
  assert.equal(before(a) - ba, before(b) - bb);
});

test('an archer pushed by melee hits never ends up further than pushMax from its post', () => {
  const sim = createSim(21);
  const i = sim.units.findIndex(u => u.alive && u.kind === 'archer'), u = sim.units[i];
  sim.foes.push({ id: 8e6, kind: 'wolf', x: u.x + 10 * 256, y: u.y, hp: 9999, cd: 0, ev: -1, tKind: 'unit', target: i, gate: 0, burn: 0, burnDmg: 0, slow: 0, stun: 0, done: false, detour: false });
  for (let t = 0; t < 600 && u.alive; t++) { if (phase(sim) === 'choice') choose(sim, 0); else step(sim, 0); }
  const d = Math.hypot(u.x - u.hx, u.y - u.hy) / 256;
  assert.ok(d <= 48 + 1, `pushed ${d.toFixed(1)} px`);
});
