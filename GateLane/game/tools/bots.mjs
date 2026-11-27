// Scripted players for Gate Lane, one per skill tier (spec §9).
// Bots send only the byte a human sends (a lane position), read only what is on screen
// (objects within VIEW_AHEAD), and stay deterministic (hash32, not Math.random).
import { hash32 } from '../src/sim/core/index.js';
import { RULES, LANE_W, VIEW_AHEAD, WEAPON_DMG, encodeX, halfWidth } from '../src/sim/sim.js';

const SIDE_X = [LANE_W >> 2, (LANE_W * 3) >> 2];
const jitter = (sim, salt, key, spread) => (hash32(sim.seed, salt, key) % (2 * spread + 1)) - spread;

/** Next unused gate row on screen: [leftGate, rightGate] or null. */
function nextGates(sim) {
  for (let i = 0; i < sim.gates.length; i += 2) {
    const g = sim.gates[i];
    if (g.used || g.y <= sim.dist) continue;
    return g.y - sim.dist <= VIEW_AHEAD ? [sim.gates[i], sim.gates[i + 1]] : null;
  }
  return null;
}

const nearestZombieX = sim => {
  let best = null;
  for (const z of sim.zombies) if (z.hp > 0 && z.active && z.y > sim.dist && (!best || z.y < best.y)) best = z;
  return best ? best.x : LANE_W >> 1;
};

const apply = (troops, g, hits = 0) => (g.kind === 'mul' ? troops * g.v : troops + g.v + Math.min(RULES.pumpMax - g.hits, hits) * g.step);

/** Wanders: a new random spot every 2 s, ignores what is on the lane. */
function novice(salt) {
  return { input: sim => encodeX(hash32(sim.seed, salt, Math.trunc(sim.tick / 120)) % (LANE_W + 1)) };
}

/** Reads the gate values at face value; otherwise drifts toward the closest zombies. */
function intermediate(salt) {
  return {
    input(sim) {
      if (sim.boss.active) return encodeX(sim.boss.x + jitter(sim, salt, sim.tick >> 5, 40));
      // Notices a barrel late (300 px) and, half the time, sidesteps it; never plans to break one.
      for (const br of sim.barrels) {
        const d = br.y - sim.dist;
        if (br.hp <= 0 || d < -2 * RULES.barrelHalf - RULES.runSpeed || d > 300 || hash32(sim.seed, salt, br.id) % 2) continue;
        const clear = halfWidth(sim.troops) + RULES.barrelHalf + 30;
        return encodeX(br.x < LANE_W >> 1 ? br.x + clear : br.x - clear);
      }
      const pair = nextGates(sim);
      if (pair && pair[0].y - sim.dist < 600) {
        const side = apply(sim.troops, pair[1]) > apply(sim.troops, pair[0]) ? 1 : 0;
        return encodeX(SIDE_X[side] + jitter(sim, salt, pair[0].id, 30));
      }
      return encodeX(nearestZombieX(sim) + jitter(sim, salt, sim.tick >> 6, 30));
    },
  };
}

/** Plans ahead: dodges barrels it cannot break, clears zombies before they bite, picks gates counting the pumps it
 *  can still add, breaks barrels only when the reward is still useful, and tracks the boss. */
function expert(salt) {
  return {
    input(sim) {
      if (sim.boss.active) return encodeX(sim.boss.x + jitter(sim, salt, sim.tick >> 5, 10));
      const hw = halfWidth(sim.troops);
      const k = Math.min(sim.troops, 2 + sim.weapon, RULES.maxBullets);
      const spacing = k > 1 ? (2 * hw) / (k - 1) : 1e9;
      const landing = Math.min(k, 1 + Math.floor((2 * RULES.barrelHalf) / spacing));
      const perVolley = Math.ceil((sim.troops * WEAPON_DMG[sim.weapon]) / (10 * k)) * landing;   // damage per volley when centred on a barrel
      let chase = null;
      for (const br of sim.barrels) {
        const d = br.y - RULES.barrelHalf - sim.dist;
        if (br.hp <= 0 || d < -2 * RULES.barrelHalf - RULES.runSpeed || d > 900) continue;
        const volleys = Math.trunc(d / RULES.runSpeed / RULES.firePeriod) - 2;   // minus bullet flight time
        const breakable = perVolley * volleys > br.hp * 1.5;
        if (!breakable && d < 500) {
          const clear = hw + RULES.barrelHalf + 40;
          return encodeX(br.x < LANE_W >> 1 ? Math.min(LANE_W, br.x + clear) : Math.max(0, br.x - clear));
        }
        const useful = br.reward === 'troops' || sim.weapon < RULES.weaponCap;
        if (breakable && useful && !chase) chase = br;
      }
      // Gate plan: which side, and whether it still has pumps left to shoot in.
      const pair = nextGates(sim);
      let side = -1, gap = 1e9;
      if (pair) {
        gap = pair[0].y - sim.dist;
        const volleys = Math.trunc(gap / RULES.runSpeed / RULES.firePeriod);
        const shots = gap > 300 ? Math.trunc((volleys * k) / 4) : 0;   // conservative: zombies soak up part of the volleys
        const val = pair.map(g => apply(sim.troops, g, g.kind === 'add' ? shots : 0));
        side = val[1] > val[0] ? 1 : 0;
      }
      const pumping = side >= 0 && gap < 650 && pair[side].kind === 'add' && pair[side].hits < RULES.pumpMax;
      if (side >= 0 && gap < 160) return encodeX(SIDE_X[side] + jitter(sim, salt, pair[0].id, 10));   // be on the right side when the row arrives
      // Zombies about to arrive come first (sooner while there is a gate to pump): centre on the nearest cluster.
      let near = null;
      for (const z of sim.zombies) if (z.hp > 0 && z.active && z.y > sim.dist && (!near || z.y < near.y)) near = z;
      if (near && near.y - sim.dist < (pumping ? 220 : 380)) {
        let sx = 0, n = 0;
        for (const z of sim.zombies) if (z.hp > 0 && z.active && z.y - near.y < 90 && z.y >= near.y && Math.abs(z.x - near.x) < 150) { sx += z.x; n++; }
        return encodeX(sx / n + jitter(sim, salt, sim.tick >> 4, 8));
      }
      if (side >= 0 && (gap < 360 || pumping)) return encodeX(SIDE_X[side] + jitter(sim, salt, pair[0].id, 10));
      if (chase) return encodeX(chase.x + jitter(sim, salt, chase.id, 8));
      return encodeX((near ? near.x : LANE_W >> 1) + jitter(sim, salt, sim.tick >> 6, 10));
    },
  };
}

export const BOTS = {
  novice: novice(101),
  intermediate: intermediate(202),
  expert: expert(303),
};

// One-sentence fixed strategies (RULE-SKILL-BASELINE): a beginner told just this rule plays it perfectly.
// If any of them scores close to the top tier, the game rewards the rule, not the skill.
const gateSide = sim => { const p = nextGates(sim); return p ? SIDE_X[apply(sim.troops, p[1]) > apply(sim.troops, p[0]) ? 1 : 0] : LANE_W >> 1; };
export const BASELINES = {
  '站中間不動': { input: () => 0 },
  '一直靠左': { input: () => encodeX(SIDE_X[0]) },
  '只選數字大的門': { input: sim => encodeX(gateSide(sim)) },
  '只追最近的怪': { input: sim => encodeX(nearestZombieX(sim)) },
  '選大的門＋頭目戰追頭目': { input: sim => encodeX(sim.boss.active ? sim.boss.x : gateSide(sim)) },
};
