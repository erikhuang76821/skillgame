// Human-factor playtest bots (knowledge-base/16 §3). Unlike the skill-tier bots in bots.mjs, these model WHY
// people lose a lane shooter: they notice things late (short look-ahead), steer with a shaky thumb and only
// re-aim every few hundred ms, misread gates (more often when the two values are close or the first few
// times a negative gate shows up), misjudge whether a barrel will break, miss a barrel entirely, lag behind
// the boss's sway, and get sloppier late in the run.
// Same rules as every bot: only bytes a human could send, only what is on screen, deterministic (hash32).
import { hash32, TPS } from '../src/sim/core/index.js';
import { RULES, LANE_W, WEAPON_DMG, encodeX, halfWidth } from '../src/sim/sim.js';

const bell = (seed, salt, i) => { let s = 0; for (let k = 0; k < 4; k++) s += (hash32(seed, salt + k, i) / 4294967296) * 2 - 1; return s / 2; };
const roll = (seed, salt, i) => hash32(seed, salt, i) / 4294967296;
const SIDE_X = [LANE_W >> 2, (LANE_W * 3) >> 2];
const gateValue = (troops, g, hits = 0) => (g.kind === 'mul' ? troops * g.v : troops + g.v + Math.min(RULES.pumpMax - g.hits, hits) * g.step);

/**
 * @param p { noticePx, steerSdPx, holdTicks, gateErrPm, closeCallPm, negNoveltyPm, barrelMissPm, judgeSd, pumpAware, bossSdPx, densityK, fatigueK }
 */
export function makeHumanBot(salt, p) {
  const memo = new WeakMap();   // per sim: decisions made once per object, plus the held aim
  const state = sim => {
    let m = memo.get(sim);
    if (!m) { m = { gate: new Map(), barrel: new Map(), negSeen: 0, aim: LANE_W >> 1, until: 0 }; memo.set(sim, m); }
    return m;
  };
  const sdNow = (sim, visible) => p.steerSdPx * (1 + p.densityK * visible / 10) * (sim.tick > 60 * TPS ? 1 + p.fatigueK : 1);

  return {
    input(sim) {
      const m = state(sim), seed = sim.seed, hw = halfWidth(sim.troops);
      // Boss: chase the sway, re-aiming every holdTicks (so the aim lags), with a shaky thumb.
      if (sim.boss.active) {
        if (sim.tick >= m.until) { m.aim = sim.boss.x + bell(seed, salt, sim.tick) * p.bossSdPx; m.until = sim.tick + p.holdTicks; }
        return encodeX(m.aim);
      }
      // Barrels: decide once per barrel when it comes into view: missed it / will break it / must dodge.
      const k = Math.min(sim.troops, 2 + sim.weapon, RULES.maxBullets);
      for (const br of sim.barrels) {
        const d = br.y - RULES.barrelHalf - sim.dist;
        if (br.hp <= 0 || d < -2 * RULES.barrelHalf - RULES.runSpeed || d > p.noticePx) continue;
        let plan = m.barrel.get(br.id);
        if (!plan) {
          const landing = Math.min(k, 1 + Math.floor((2 * RULES.barrelHalf * (k - 1)) / Math.max(1, 2 * hw)));
          const dmg = Math.ceil((sim.troops * WEAPON_DMG[sim.weapon]) / (10 * k)) * landing * Math.max(0, Math.trunc(d / RULES.runSpeed / RULES.firePeriod) - 2);
          const guess = dmg * Math.max(0.1, 1 + bell(seed, salt + 20, br.id) * p.judgeSd);
          plan = roll(seed, salt + 21, br.id) * 1000 < p.barrelMissPm ? 'miss' : guess > br.hp * 1.2 ? 'break' : 'dodge';
          m.barrel.set(br.id, plan);
        }
        if (plan === 'break') return encodeX(br.x + bell(seed, salt + 22, br.id) * p.steerSdPx);
        if (plan === 'dodge' && d < 420) {
          const clear = hw + RULES.barrelHalf + 30;
          return encodeX(br.x < LANE_W >> 1 ? Math.min(LANE_W, br.x + clear) : Math.max(0, br.x - clear));
        }
      }
      // Gates: pick a side once, when the row is close enough to read; misreads are more likely on close calls
      // and on the first negative gates.
      for (let i = 0; i < sim.gates.length; i += 2) {
        const a = sim.gates[i], b = sim.gates[i + 1], d = a.y - sim.dist;
        if (a.used || d <= 0) continue;
        if (d > Math.min(p.noticePx, 560)) break;
        let side = m.gate.get(a.id);
        if (side === undefined) {
          const shots = p.pumpAware ? Math.trunc((Math.trunc(d / RULES.runSpeed / RULES.firePeriod) * k) / 2) : 0;
          const va = gateValue(sim.troops, a, a.kind === 'add' ? shots : 0), vb = gateValue(sim.troops, b, b.kind === 'add' ? shots : 0);
          const best = vb > va ? 1 : 0;
          const close = Math.abs(va - vb) <= Math.max(va, vb, 1) * 0.2;
          const hasNeg = a.v < 0 || b.v < 0;
          const errPm = p.gateErrPm + (close ? p.closeCallPm : 0) + (hasNeg ? p.negNoveltyPm * Math.exp(-m.negSeen / 3) : 0);
          if (hasNeg) m.negSeen++;
          side = roll(seed, salt + 30, a.id) * 1000 < errPm ? 1 - best : best;
          m.gate.set(a.id, side);
        }
        return encodeX(SIDE_X[side] + bell(seed, salt + 31, a.id) * p.steerSdPx);
      }
      // Otherwise: aim at the nearest zombies on screen, re-aiming every holdTicks.
      if (sim.tick >= m.until) {
        let visible = 0, best = null;
        for (const z of sim.zombies) {
          if (z.hp <= 0 || !z.active || z.y <= sim.dist) continue;
          visible++;
          if (z.y - sim.dist <= p.noticePx && (!best || z.y < best.y)) best = z;
        }
        const want = best ? best.x : m.aim;
        m.aim = want + bell(seed, salt + 40, sim.tick) * sdNow(sim, visible);
        m.until = sim.tick + p.holdTicks;
      }
      return encodeX(m.aim);
    },
  };
}

// Three people, not three skill levels of one machine: a first-time casual player, a regular, a skilled player.
export const HUMANS = {
  casual: makeHumanBot(1100, { noticePx: 420, steerSdPx: 45, holdTicks: 24, gateErrPm: 120, closeCallPm: 150, negNoveltyPm: 300, barrelMissPm: 300, judgeSd: 0.6, pumpAware: false, bossSdPx: 70, densityK: 0.3, fatigueK: 0.15 }),
  regular: makeHumanBot(1200, { noticePx: 600, steerSdPx: 25, holdTicks: 15, gateErrPm: 40, closeCallPm: 80, negNoveltyPm: 150, barrelMissPm: 100, judgeSd: 0.35, pumpAware: false, bossSdPx: 40, densityK: 0.2, fatigueK: 0.08 }),
  skilled: makeHumanBot(1300, { noticePx: 800, steerSdPx: 12, holdTicks: 8, gateErrPm: 10, closeCallPm: 30, negNoveltyPm: 40, barrelMissPm: 25, judgeSd: 0.15, pumpAware: true, bossSdPx: 15, densityK: 0.1, fatigueK: 0.04 }),
};
