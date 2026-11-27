// Human-factor playtest bots for SwarmDuel (knowledge-base/16 §3). Unlike the skill tiers in bots.mjs, these model
// WHY people get hit in a survivor-like: they decide only every so often (reaction time), steer worse when many enemies
// are close (reading load), sometimes keep going the wrong way (lapses), dash late, and tire in the last minute.
// tools/playtest.mjs uses them to check the scripted curve. Same rules as every bot: only the input byte a human could
// send, only what is on screen (enemies near the player, orbs), deterministic (hash32 of seed, salt and decision index).
import { IN_DASH, IN_HOWL, SUB, TPS } from '../src/sim/sim.js';
import { ARENA } from '../src/sim/content.js';
import { hash32 } from '../src/sim/rng.js';

const SECTOR_TO_CODE = [3, 2, 1, 8, 7, 6, 5, 4];          // right, down_right, down, down_left, left, up_left, up, up_right
const sectorOf = (dx, dy) => ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
const roll = (seed, salt, i) => hash32(seed, salt, i) / 4294967296;
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
  for (const o of sim.orbs) { const d = (o.x - p.x) ** 2 + (o.y - p.y) ** 2; if (d < bd) { bd = d; best = o; } }
  return best ? { o: best, dist: Math.sqrt(bd) / SUB } : null;
}

/**
 * @param p { reactMs: time between decisions, dashAt: px at which a threat is noticed for a dash,
 *            loadK: chance per close enemy (≤ 110 px) of steering one sector off, lapsePm: decisions per mille that
 *            keep the previous direction, fatigueK: extra load error in the last minute, orbit: 0 flee … 1 circle-kite,
 *            picks: 'first' | 'priority' }
 */
export function makeHumanBot(salt, p) {
  const memo = new WeakMap();                              // per sim: the held input and the next decision tick
  return {
    input(sim) {
      let m = memo.get(sim);
      if (!m) memo.set(sim, (m = { held: 0, next: 0, k: 0 }));
      if (sim.tick < m.next) return m.held & 15;           // between decisions the stick stays where it was; buttons are taps
      const k = m.k++, seed = sim.seed, pl = sim.player, s = survey(sim, 240), w = wallPush(pl);
      m.next = sim.tick + Math.max(1, Math.round((p.reactMs * TPS) / 1000));
      let dx = s.rx * 400 - s.ry * 260 * p.orbit + w.wx * 1.5, dy = s.ry * 400 + s.rx * 260 * p.orbit + w.wy * 1.5;
      const o = nearestOrb(sim);
      if (o && (s.crowd === 0 || (s.nearDist > 150 && o.dist < 260))) { dx = o.o.x - pl.x; dy = o.o.y - pl.y; }
      // a beam's red warning circle is on screen for 0.8 s: step out of it (still only at decision time)
      for (const bm of sim.beams) {
        const bx = pl.x - bm.x, by = pl.y - bm.y, bd = Math.hypot(bx, by) / SUB;
        if (bm.warn > 0 && bd < 64) { dx = bx || 1; dy = by; break; }
      }
      if (Math.abs(dx) + Math.abs(dy) < 1e-9) { m.held = 0; return 0; }
      let sector = sectorOf(dx, dy);
      const tired = sim.tick > 120 * TPS ? 1 + p.fatigueK : 1;
      if (roll(seed, salt, k) < Math.min(0.6, p.loadK * s.close * tired)) sector = (sector + (roll(seed, salt + 1, k) < 0.5 ? 1 : 7)) % 8;
      let b = roll(seed, salt + 2, k) * 1000 < p.lapsePm ? m.held & 15 : SECTOR_TO_CODE[sector];
      if (pl.dashCd === 0 && s.nearDist < p.dashAt) b |= IN_DASH;
      if (pl.howl >= 100 && (s.crowd >= 10 || pl.hp < pl.maxHp * 0.3)) b |= IN_HOWL;
      m.held = b;
      return b;
    },
    pick(sim) {
      if (p.picks === 'first') return 0;
      let best = 0, rank = Infinity;
      sim.offer.forEach((key, i) => { const r = PRIORITY.indexOf(key); if (r >= 0 && r < rank) { rank = r; best = i; } });
      return best;
    },
  };
}

// Three people, not three settings of one machine: a first-time casual player, a regular, a skilled player.
// Parameters are guesses until real players are recorded (knowledge-base/16 §5 step 5).
export const HUMANS = {
  casual: makeHumanBot(2100, { reactMs: 320, dashAt: 26, loadK: 0.05, lapsePm: 60, fatigueK: 0.3, orbit: 0, picks: 'first' }),
  regular: makeHumanBot(2200, { reactMs: 250, dashAt: 32, loadK: 0.03, lapsePm: 25, fatigueK: 0.2, orbit: 0.6, picks: 'priority' }),
  skilled: makeHumanBot(2300, { reactMs: 200, dashAt: 36, loadK: 0.015, lapsePm: 8, fatigueK: 0.1, orbit: 1, picks: 'priority' }),
};
