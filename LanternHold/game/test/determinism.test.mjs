// Game-rule determinism and fairness for LanternHold (spec 禮12).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Recorder, playMatch, verify, replay } from '../src/sim/core/index.js';
import { GAME, GAMES, makeGame, tr, createSim, step, choose, phase, OP, encode, CHOICE, CARDS, EVOS, STAGE_IDS, WALL, cellOf, SLOTS } from '../src/sim/sim.js';
import { BOTS } from '../tools/bots.mjs';

test('same seed + same inputs => identical result', () => {
  assert.deepEqual(playMatch(GAME, 1234, BOTS.expert).result(), playMatch(GAME, 1234, BOTS.expert).result());
});

test('golden match (cross-engine determinism; update only when GAME.version is bumped)', () => {
  const r = playMatch(GAME, 1234, BOTS.expert).result();
  assert.deepEqual(r, GOLDEN, JSON.stringify(r));
});
const GOLDEN = { game: 'lantern-hold-s5', version: 26, seed: 1234, ticks: 23400, score: 3456, hash: 441715432 };

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

test('redeploy: no cooldown — a unit can be re-ordered mid-walk, and a refused command changes nothing', () => {
  const sim = createSim(5);
  const feed = cmd => { for (const b of cmd) step(sim, b); };
  const archer = sim.units.findIndex(u => u.alive);
  feed(encode(OP.MOVE, archer, 9 * 12 + 6));
  const u = sim.units[archer];
  assert.equal(u.state, 'moving');
  const first = [u.hx, u.hy];
  feed(encode(OP.MOVE, archer, 9 * 12 + 4));            // re-ordered at once
  assert.equal(u.state, 'moving');
  assert.notDeepEqual([u.hx, u.hy], first);
  const second = [u.hx, u.hy];
  feed(encode(OP.MOVE, archer, 0));                     // far corner: outside the light -> ignored
  assert.deepEqual([u.hx, u.hy], second);
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
  sim.cards.a_speed = 3; sim.cards.a_split = 1;              // set up the recipe directly
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

test('a whole side of wall goes palisade -> stone -> iron per tap; there is no gold repair', () => {
  const sim = createSim(11);
  sim.gold = 200;
  const full = 3 * (WALL[1].cost + WALL[2].cost + WALL[3].cost);
  feed(sim, encode(OP.WALL, 4, 0));
  assert.deepEqual([11, 12, 13].map(w => sim.walls[w].lv), [1, 1, 1]);          // side 4 = segments 11, 12, 13
  feed(sim, encode(OP.WALL, 4, 0)); feed(sim, encode(OP.WALL, 4, 0));
  assert.deepEqual([11, 12, 13].map(w => sim.walls[w].lv), [3, 3, 3]);
  assert.equal(sim.gold, 200 - full);
  feed(sim, encode(OP.WALL, 4, 1));                          // the old repair command does nothing
  feed(sim, encode(OP.WALL, 4, 0));                          // already iron: nothing
  assert.equal(sim.gold, 200 - full);
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
  feed(sim, encode(OP.WALL, 6, 0));                         // side 6 holds segment 18
  feed(sim, encode(OP.MENU, 255, 0));
  sim.walls[18].hp = 10;
  const gold = sim.gold;
  for (let t = 0; t < 900 && sim.walls[18].hp < 80; t++) {
    sim.foes.forEach(f => { f.x = 360 * 256; f.y = -2000 * 256; });   // keep foes far away: this test is about repair only
    if (phase(sim) === 'choice') choose(sim, 0); else step(sim, 0);
  }
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
  for (const sim of [a, b]) { sim.cards.burst = 1; sim.owned.push('burst'); sim.cards.thunder = 1; sim.owned.push('thunder'); }
  // the same chest source upgrades the same number of cards whatever the seed
  const before = s => s.cards.burst + s.cards.thunder;
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

// --- v8: towers, worker cost, card gating, posts beside buildings ---
test('mage towers only on the outer ring (barracks go anywhere)', () => {
  const sim = createSim(31);
  sim.gold = 500;
  feed(sim, encode(OP.BUILD, 1, 1)); assert.equal(sim.slots[1].kind, '');        // no tower inside
  feed(sim, encode(OP.BUILD, 7, 1)); assert.equal(sim.slots[7].kind, 'tower');
  for (let t = 0; t < 70; t++) step(sim, 0);
  feed(sim, encode(OP.MENU, 7, 3)); assert.equal(sim.slots[7].branch, 'bone');
  feed(sim, encode(OP.MENU, 7, 4)); assert.equal(sim.slots[7].lv, 3);
});

test('each worker costs more than the last; a dead worker makes the next one cheap again', () => {
  const sim = createSim(32);
  sim.gold = 100;
  const costs = [];
  for (let n = 0; n < 3; n++) { const g = sim.gold; feed(sim, encode(OP.MENU, 255, 0)); costs.push(g - sim.gold); }
  assert.deepEqual(costs, [0, 10, 15]);
});

test('a unit card only enters the pool after that unit has been on the field', () => {
  const sim = createSim(33);
  toOffer(sim);
  for (let r = 0; r < 3; r++) { assert.ok(sim.offer.ids.every(id => !CARDS[id] || !['shield', 'priest', 'worker', 'tower'].includes(CARDS[id].type)), sim.offer.ids.join()); if (!choose(sim, CHOICE.REROLL)) break; }
});

test('a soldier sent onto a building stands at its edge instead', () => {
  const sim = createSim(34);
  const i = sim.units.findIndex(u => u.alive && u.kind === 'archer');
  feed(sim, encode(OP.MOVE, i, cellOf(360, 600)));        // the castle's own cell
  const u = sim.units[i], d = Math.hypot(u.hx / 256 - 360, u.hy / 256 - 600);
  assert.ok(d >= 56 + 18 - 1, `post ${d.toFixed(1)} px from the castle centre`);
});

// --- v9: talents / loadout (mods), trait cards with rarity, diamonds ---
test('mods from talents change the match, and the same mods replay exactly', () => {
  const mods = { ...GAMES.s5.mods, startGold: 20, castleHp: 200, loadout: ['archer', 'knight', 'priest'] };
  const sim = createSim(5, 's5', mods);
  assert.equal(sim.gold, 50);
  assert.equal(sim.castle.hp, 1200);
  const g = makeGame('s5', mods), rec = playMatch(g, 41, BOTS.expert);
  assert.equal(replay(g, 41, rec.log, rec.choices, rec.ticks).hash, rec.result().hash);
});

test('trait cards stack with their rarity value and stop counting at their cap', () => {
  const sim = createSim(6);
  sim.trait.a_split = 40;
  assert.equal(tr(sim, 'a_split'), 6);
  assert.equal(CARDS.a_speed.val.length, 5);
});

test('a mini boss pays 1–3 diamonds by performance, never by a roll', () => {
  const run = seed => { const r = playMatch(GAME, seed, BOTS.expert); return r.sim.diamonds; };
  for (const seed of [1, 2]) assert.equal(run(seed), run(seed));
});

test('a new soldier steps out of its barracks on the side away from the castle', () => {
  for (const slot of [0, 3]) {
    const sim = createSim(50);
    sim.gold = 200;
    feed(sim, encode(OP.BUILD, slot, 0));
    for (let t = 0; t < 70; t++) step(sim, 0);
    feed(sim, encode(OP.MENU, slot, 0));
    const before = new Set(sim.units.filter(u => u.alive).map(u => u.gen));
    for (let t = 0; t < 400 && phase(sim) !== 'over'; t++) { if (phase(sim) === 'choice') choose(sim, 0); else step(sim, 0); }
    const u = sim.units.find(v => v.alive && v.kind === 'archer' && !before.has(v.gen));
    const [sx, sy] = [SLOTS[slot][0] - 360, SLOTS[slot][1] - 600], [ux, uy] = [u.hx / 256 - SLOTS[slot][0], u.hy / 256 - SLOTS[slot][1]];
    assert.ok(sx * ux + sy * uy > 0, `slot ${slot}: soldier went toward the castle`);
  }
});

test('skeletons rush back to defend their bone tower when it is hit', () => {
  const sim = createSim(60);
  sim.gold = 500;
  feed(sim, encode(OP.BUILD, 7, 1));
  for (let t = 0; t < 70; t++) step(sim, 0);
  feed(sim, encode(OP.MENU, 7, 3));
  for (let t = 0; t < 620 && phase(sim) !== 'over'; t++) { if (phase(sim) === 'choice') choose(sim, 0); else step(sim, 0); }
  const skel = sim.units.findIndex(u => u.alive && u.kind === 'skeleton');
  assert.ok(skel >= 0, 'no skeleton summoned');
  // a wolf beside the tower, far outside the normal leash of a skeleton standing elsewhere, and the tower just got hit
  const [tx, ty] = SLOTS[7];
  sim.foes.push({ id: 7e6, kind: 'wolf', x: (tx + 30) * 256, y: ty * 256, hp: 9999, dmg: 0, cd: 999, ev: -1, tKind: '', target: -1, gate: 0, burn: 0, burnDmg: 0, slow: 0, stun: 999, poison: 0, poisonDmg: 0, done: false, detour: false });
  sim.slots[7].hitT = sim.tick;
  const u = sim.units[skel], d0 = Math.hypot(u.x / 256 - tx - 30, u.y / 256 - ty);
  for (let t = 0; t < 60; t++) { if (phase(sim) === 'choice') choose(sim, 0); else step(sim, 0); }
  const d1 = Math.hypot(u.x / 256 - tx - 30, u.y / 256 - ty);
  assert.ok(d1 < d0 || d1 < 30, `skeleton did not close in (${d0.toFixed(0)} -> ${d1.toFixed(0)})`);
});

test('rally moves every free soldier of a kind into a spread-out formation', () => {
  const sim = createSim(70);
  for (let n = 0; n < 6; n++) sim.units[10 + n] = { ...sim.units[0], gen: 900 + n, x: (300 + n * 10) * 256, y: 700 * 256, hx: (300 + n * 10) * 256, hy: 700 * 256, state: 'guard' };
  feed(sim, encode(OP.RALLY, 0, cellOf(420, 600)));
  const posts = sim.units.filter(u => u.alive && u.kind === 'archer').map(u => [u.hx / 256, u.hy / 256]);
  assert.ok(posts.length >= 7);
  for (let a = 0; a < posts.length; a++) for (let b = a + 1; b < posts.length; b++) assert.ok(Math.hypot(posts[a][0] - posts[b][0], posts[a][1] - posts[b][1]) >= 19, 'two soldiers share a post');
  assert.ok(posts.every(([x, y]) => Math.hypot(x - 420, y - 608) < 110), 'formation spread too far');
});

test('killing a mini boss opens a real pick whose trait cards are at least 史詩', () => {
  const sim = createSim(80);
  sim.floors.push(3); sim.pending++;
  step(sim, 0);
  assert.equal(phase(sim), 'choice');
  assert.equal(sim.offer.boss, true);
  assert.ok(sim.offer.ids.some(id => CARDS[id]?.trait), 'boss pick offered no trait card');
  sim.offer.ids.forEach((id, n) => { if (CARDS[id]?.trait) assert.ok(sim.offer.rar[n] >= 3); });
  choose(sim, 0);
  assert.equal(sim.floors.length, 0);
});

test('outer slots take barracks too; demolish refunds 70% of build + upgrades and frees the slot', () => {
  const sim = createSim(5);
  const feed = cmd => { for (const b of cmd) step(sim, b); };
  sim.gold = 500;
  const outer = SLOTS.findIndex((_, k) => k >= 6);
  feed(encode(OP.BUILD, outer, 0));
  assert.equal(sim.slots[outer].kind, 'barracks');
  const paid = sim.slots[outer].spent;
  for (let t = 0; t < 600; t++) step(sim, 0);
  feed(encode(OP.MENU, outer, 3));                       // upgrade to Lv2
  const spent = sim.slots[outer].spent;
  assert.ok(spent > paid);
  const before = sim.gold;
  feed(encode(OP.MENU, outer, 9));                       // demolish
  assert.equal(sim.slots[outer].kind, '');
  assert.equal(sim.gold - before, Math.trunc((spent * 70) / 100));
  feed(encode(OP.BUILD, outer, 1));                      // and build something else there
  assert.equal(sim.slots[outer].kind, 'tower');
});

test('a closed wall ring keeps every ground foe out, even with buildings and soldiers just inside it', async () => {
  const { FOE, WALL_R } = await import('../src/sim/sim.js');
  const sim = createSim(77);
  sim.gold = 2000;
  for (const b of encode(OP.BUILD, 7, 0)) step(sim, b);              // an outer barracks close to the wall
  for (let w = 0; w < sim.walls.length; w++) { sim.walls[w].lv = 3; sim.walls[w].hp = 1e9; }   // unbreakable ring
  let inside = 0;
  for (let t = 0; t < 6000; t++) {
    if (phase(sim) === 'choice') { choose(sim, 0); continue; }
    step(sim, 0);
    for (const f of sim.foes) {
      if (f.hp <= 0 || FOE[f.kind].fly) continue;
      const r = Math.hypot(f.x / 256 - 360, f.y / 256 - 600);
      if (r < WALL_R - 4) inside++;
    }
  }
  assert.equal(inside, 0);
});

test('new foes: slime splits, shaman heals, boar hits triple once, mole tunnels under a closed wall unharmed', async () => {
  const { spawnForTest, FOE, WALL_R } = await import('../src/sim/sim.js');
  const run = (sim, n) => { for (let t = 0; t < n; t++) { if (phase(sim) === 'choice') choose(sim, 0); else step(sim, 0); } };
  // slime
  let sim = createSim(3);
  const sl = spawnForTest(sim, 'slime', 360, 100); const before = sim.foes.length;
  sl.hp = 0; run(sim, 1);
  assert.equal(sim.foes.filter(f => f.kind === 'slimelet').length, 2);
  assert.equal(sim.foes.length, before + 1);   // the parent is gone, two halves came out
  // shaman
  sim = createSim(3);
  const sh = spawnForTest(sim, 'shaman', 360, 60), hurt = spawnForTest(sim, 'beetle', 380, 60);
  hurt.hp = 1;
  run(sim, FOE.shaman.heal.period + 1);
  assert.ok(hurt.hp > 1, `healed to ${hurt.hp}`);
  // boar: first strike on a wall is triple
  sim = createSim(3);
  for (const w of sim.walls) { w.lv = 3; w.hp = 1e6; }
  const bo = spawnForTest(sim, 'boar', 360, 600 - WALL_R - 60);
  const hits = [];
  for (let t = 0; t < 900; t++) { step(sim, 0); for (const e of sim.events) if (e.type === 'foeAtk' && e.id === bo.id) hits.push(e.heavy); }
  assert.equal(hits[0], true); assert.ok(hits.length > 1 && hits.slice(1).every(h => !h));
  // mole: untouchable underground, comes up inside a closed ring
  sim = createSim(3);
  for (const w of sim.walls) { w.lv = 3; w.hp = 1e6; }
  const mo = spawnForTest(sim, 'mole', 360, 600 - WALL_R - 100), hp0 = mo.hp;
  let surfacedAt = -1;
  for (let t = 0; t < 1500 && surfacedAt < 0; t++) { step(sim, 0); if (!mo.burrow) surfacedAt = t; else assert.equal(mo.hp, hp0); }
  assert.ok(surfacedAt > 0);
  assert.ok(Math.hypot(mo.x / 256 - 360, mo.y / 256 - 600) < WALL_R);
});

test('card offers: an offer never shows three cards of one type', async () => {
  for (let seed = 1; seed <= 6; seed++) {
    const rec = new Recorder(GAME, seed);
    for (let t = 0; t < 12000 && rec.phase !== 'over'; t++) {
      if (rec.phase === 'choice') { const ty = rec.sim.offer.ids.map(id => CARDS[id]?.type ?? id); assert.ok(rec.sim.offer.boss || new Set(ty).size >= 2 || ty.every(x => x === 'pouch'), ty.join()); rec.choose(0); continue; }   // boss picks are trait-only: one unit kind built = one type
      rec.step(BOTS.expert.input(rec.sim));
    }
  }
});

test('QA fixes: choice cap covers boss picks; shaman heals do not stack and skip bosses', async () => {
  const { spawnForTest, FOE } = await import('../src/sim/sim.js');
  for (const id of STAGE_IDS) {
    const g = GAMES[id], bosses = g.createSim(1).script.events.filter(e => e.boss).length;
    assert.ok(g.maxChoices >= 30 + bosses, `${id} cap ${g.maxChoices}`);
  }
  const sim = createSim(3);
  for (let k = 0; k < 6; k++) spawnForTest(sim, 'shaman', 360 + k * 3, 60);
  const boss = spawnForTest(sim, 'bossMini', 370, 60), beetle = spawnForTest(sim, 'beetle', 380, 60);
  boss.hp = 100; beetle.hp = 1;
  for (let t = 0; t < FOE.shaman.heal.period; t++) step(sim, 0);
  assert.equal(boss.hp, 100);                                         // bosses are never healed
  const one = Math.max(1, Math.trunc((beetle.max * FOE.shaman.heal.pct) / 100));
  assert.ok(beetle.hp <= 1 + one, `six shamans healed ${beetle.hp - 1}, one heal is ${one}`);
});

test('QA fixes: a full unit array holds the recruit in the queue; recruits never share a post', () => {
  const sim = createSim(5);
  sim.gold = 999;
  feed(sim, encode(OP.BUILD, 0, 0));
  for (let t = 0; t < 120; t++) step(sim, 0);
  for (let n = 0; n < 4; n++) feed(sim, encode(OP.MENU, 0, 0));
  for (let t = 0; t < 1200; t++) { if (phase(sim) === 'choice') choose(sim, 0); else step(sim, 0); }
  const posts = sim.units.filter(u => u.alive && u.kind === 'archer').map(u => `${u.hx >> 8},${u.hy >> 8}`);
  assert.equal(new Set(posts).size, posts.length, posts.join(' '));
  // fill every free unit slot, then train: the archer must wait in the queue, not vanish
  for (let i = 0; i < sim.units.length; i++) if (!sim.units[i].alive) sim.units[i] = { ...sim.units.find(u => u.alive), alive: true, gen: 5000 + i, kind: 'skeleton', owner: 6, free: true };
  feed(sim, encode(OP.MENU, 0, 0));
  for (let t = 0; t < 600; t++) { if (phase(sim) === 'choice') choose(sim, 0); else step(sim, 0); }
  assert.equal(sim.slots[0].queue.length, 1);
});

test('QA fixes: talents are part of the game id, and gameFromId rebuilds the same GameDef', async () => {
  const { gameFromId, NO_MODS } = await import('../src/sim/sim.js');
  assert.equal(GAMES.s5.id, 'lantern-hold-s5');
  const mods = Object.freeze({ ...NO_MODS, startGold: 20, rerolls: 1, palisade: true, loadout: ['archer', 'spearman', 'knight'] });
  const g = makeGame('s5', mods), up = playMatch(g, 7, BOTS.intermediate).upload();
  assert.notEqual(g.id, GAMES.s5.id);
  assert.equal(verify(GAMES.s5, up).valid, false);
  const back = gameFromId(up.game);
  assert.deepEqual(back.mods, mods);
  assert.equal(verify(back, up).valid, true);
  assert.equal(gameFromId('lantern-hold-s5~bogus1'), null);
});

test('QA minors: a tower knocked down takes its skeletons; a burrowed mole takes no poison, slow or burn', async () => {
  const { spawnForTest } = await import('../src/sim/sim.js');
  const run = (sim, n, until = () => false) => { for (let t = 0; t < n && !until(); t++) { if (phase(sim) === 'choice') choose(sim, 0); else step(sim, 0); } };
  const sim = createSim(9);
  sim.gold = 999;
  feed(sim, encode(OP.BUILD, 7, 1));
  run(sim, 70);
  feed(sim, encode(OP.MENU, 7, 3));                                  // bone branch
  run(sim, 700);
  assert.ok(sim.units.some(u => u.alive && u.kind === 'skeleton' && u.owner === 7));
  const [tx, ty] = SLOTS[7];
  for (let k = 0; k < 8; k++) spawnForTest(sim, 'shroom', tx + 10 + k, ty);   // exploding shrooms right at the tower
  sim.slots[7].hp = 1;
  run(sim, 600, () => !sim.slots[7].kind);
  assert.equal(sim.slots[7].kind, '');
  assert.equal(sim.units.filter(u => u.alive && u.kind === 'skeleton' && u.owner === 7).length, 0);
  const s2 = createSim(9), mole = spawnForTest(s2, 'mole', 360, 100);
  assert.equal(mole.burrow, true);
  s2.cards.thunder = 3;
  for (let t = 0; t < 400 && mole.burrow; t++) { if (phase(s2) === 'choice') choose(s2, 0); else step(s2, 0); assert.equal(mole.poison, 0); assert.equal(mole.slow, 0); assert.equal(mole.burn, 0); assert.equal(mole.hp, mole.max); }
});

test('v23: stacked foes spread out; a shield hit knocks a foe back, a boss does not budge', async () => {
  const { spawnForTest, KNOCK } = await import('../src/sim/sim.js');
  const sim = createSim(4);
  const pack = [0, 1, 2, 3, 4, 5].map(() => spawnForTest(sim, 'rat', 360, 150));
  for (let t = 0; t < 3; t++) step(sim, 0);
  const pts = pack.map(f => `${f.x >> 8},${f.y >> 8}`);
  assert.equal(new Set(pts).size, pack.length, pts.join(' '));
  for (let a = 0; a < pack.length; a++) for (let b = a + 1; b < pack.length; b++) assert.ok(Math.hypot(pack[a].x - pack[b].x, pack[a].y - pack[b].y) / 256 >= 6, 'rats still overlapping');
  assert.equal(KNOCK.shield, 6);
});

test('v26 call to arms: soldiers whose post is within reach of a building under attack come to defend it', async () => {
  const { spawnForTest, ALERT } = await import('../src/sim/sim.js');
  const sim = createSim(5);
  const run = n => { for (let t = 0; t < n; t++) { if (phase(sim) === 'choice') choose(sim, 0); else step(sim, 0); } };
  sim.gold = 500;
  const a = sim.units.find(u => u.alive);
  let slot = -1, far = 0;
  SLOTS.forEach(([x, y], k) => { const d = Math.hypot(x - a.hx / 256, y - a.hy / 256); if (k < 6 && d > far && d < ALERT.r) { far = d; slot = k; } });
  feed(sim, encode(OP.BUILD, slot, 0)); run(80);
  const [sx, sy] = SLOTS[slot], L = Math.hypot(sx - 360, sy - 600);
  const f = spawnForTest(sim, 'beetle', sx + ((sx - 360) / L) * 30, sy + ((sy - 600) / L) * 30), hp0 = f.hp;
  run(240);
  assert.ok(far > 140, 'the barracks is out of the archer\'s normal reach');
  assert.ok(f.hp < hp0 || f.hp <= 0, 'the archer answered the call');
});
