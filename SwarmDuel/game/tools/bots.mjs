// Scripted players of three skill tiers. They only emit the same input byte a human would
// (8-way direction + dash + howl) and pick level-up cards; the sim stays the judge.
import { IN_DASH, IN_HOWL, SUB } from '../src/sim/sim.js';
import { ARENA } from '../src/sim/content.js';
import { hash32 } from '../src/sim/rng.js';
import { Recorder } from '../src/sim/replay.js';

const SECTOR_TO_CODE = [3, 2, 1, 8, 7, 6, 5, 4]; // right, down_right, down, down_left, left, up_left, up, up_right
function code8(dx, dy) {
  if (Math.abs(dx) + Math.abs(dy) < 1e-6) return 0;
  const sector = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  return SECTOR_TO_CODE[sector];
}

const PRIORITY = ['campfire', 'static_fur', 'p_might', 'pinecone', 'p_cooldown', 'p_hp', 'p_magnet', 'p_speed', 'snack', 'bounty'];

function survey(sim, radius) {
  const p = sim.player, r2 = (radius * SUB) ** 2, close2 = (110 * SUB) ** 2;
  let rx = 0, ry = 0, near = null, nearD2 = Infinity, crowd = 0, close = 0;
  for (const e of sim.enemies) {
    const dx = p.x - e.x, dy = p.y - e.y, d2 = dx * dx + dy * dy;
    if (d2 < nearD2) { nearD2 = d2; near = e; }
    if (d2 < close2) close++;
    if (d2 < r2) { crowd++; const d = Math.sqrt(d2) || 1; rx += dx / d / d; ry += dy / d / d; }
  }
  return { rx, ry, near, nearDist: Math.sqrt(nearD2) / SUB, crowd, close };
}

function wallPush(p) {
  const x = p.x / SUB, y = p.y / SUB, m = 220;
  return {
    wx: (x < m ? (m - x) / m : 0) - (x > ARENA.w - m ? (x - ARENA.w + m) / m : 0),
    wy: (y < m ? (m - y) / m : 0) - (y > ARENA.h - m ? (y - ARENA.h + m) / m : 0),
  };
}

function nearestOrb(sim) {
  const p = sim.player;
  let best = null, bd = Infinity;
  for (const o of sim.orbs) {
    const d = (o.x - p.x) ** 2 + (o.y - p.y) ** 2;
    if (d < bd) { bd = d; best = o; }
  }
  return best ? { o: best, dist: Math.sqrt(bd) / SUB } : null;
}

export const BOTS = {
  // Wanders, never dashes on purpose, takes the first card.
  novice: {
    input(sim) {
      let b = hash32(777, 9, Math.floor(sim.tick / 60)) % 9;
      if (sim.player.howl >= 100) b |= IN_HOWL;
      return b;
    },
    pick: () => 0,
  },
  // Runs away from the crowd, panic-dashes, howls when full, takes the first card.
  intermediate: {
    input(sim) {
      const p = sim.player, s = survey(sim, 220), w = wallPush(p);
      let dx = s.rx * 400 + w.wx, dy = s.ry * 400 + w.wy;
      if (s.crowd === 0) { const o = nearestOrb(sim); if (o) { dx = o.o.x - p.x; dy = o.o.y - p.y; } }
      let b = code8(dx, dy);
      if (s.nearDist < 36 && p.dashCd === 0) b |= IN_DASH;
      if (p.howl >= 100) b |= IN_HOWL;
      return b;
    },
    pick: () => 0,
  },
  // Circle-kites the swarm, collects orbs when safe, dashes *through* enemies for Perfect Dodges,
  // saves Howl for big combos / big crowds, drafts a build by priority.
  expert: {
    input(sim) {
      const p = sim.player, s = survey(sim, 240), w = wallPush(p);
      // tangential component = orbit around the swarm instead of fleeing in a straight line
      let dx = s.rx * 400 - s.ry * 260 + w.wx * 1.5, dy = s.ry * 400 + s.rx * 260 + w.wy * 1.5;
      const o = nearestOrb(sim);
      if (o && s.nearDist > 150 && o.dist < 260) { dx = o.o.x - p.x; dy = o.o.y - p.y; }
      let b = code8(dx, dy);
      if (p.dashCd === 0 && s.near && s.nearDist < 52) {
        const safeDive = s.close <= 3 && p.hp > p.maxHp * 0.5 && s.nearDist > 18;
        // dive through an isolated enemy for the Perfect Dodge; otherwise dash out of trouble
        b = safeDive ? code8(s.near.x - p.x, s.near.y - p.y) | IN_DASH : (s.nearDist < 36 ? b | IN_DASH : b);
      }
      if (p.howl >= 100 && (sim.combo >= 50 || s.crowd >= 14 || p.hp < p.maxHp * 0.3)) b |= IN_HOWL;
      return b;
    },
    pick(sim) {
      let best = 0, rank = Infinity;
      sim.offer.forEach((k, i) => { const r = PRIORITY.indexOf(k); if (r >= 0 && r < rank) { rank = r; best = i; } });
      return best;
    },
  },
};

export function playMatch(seed, botName) {
  const bot = BOTS[botName], rec = new Recorder(seed);
  rec.sim.recordEvents = false;
  while (rec.sim.state !== 'over') {
    if (rec.sim.state === 'levelup') rec.choose(bot.pick(rec.sim));
    else rec.step(bot.input(rec.sim));
  }
  return rec;
}
