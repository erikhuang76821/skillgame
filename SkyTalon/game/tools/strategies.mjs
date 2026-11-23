// Comparison strategies for SkyTalon's skill evidence (tools/skill-evidence.mjs; spec §9).
// Freeze them before a confirmation run.
//   strong  the best play scripted without seeing more than the player sees
//   random  uniform choice among the nine steering actions (the ship fires by itself, so every action plays)
//   simple  rules a beginner can follow from one sentence, with no precise timing or aim
//
// makePilot() is the steering planner behind the strong strategy; tools/humanBots.mjs reuses it with human limits
// (reaction time, aim error, lapses). It reads only what is on screen: where the ship, the enemies, the bullets, the
// obstacles and the drops are and which way each is heading; how an enemy will move is guessed from its kind, the way
// a player who has met that kind before would. It returns only bytes a person could send.
// Deterministic: plain + - * / on doubles and hash32, so the same question always gets the same answer.
//
// Gear (v6, spec §8): every strategy also has pick(sim) -> 0-2, the slot it takes at a choice. It sees what the
// choice screen shows: the three pieces of gear on offer and the levels it already holds.
import { hash32, ONE, DX, DY, COS, SIN } from '../src/sim/core/index.js';
import {
  WORLD_W, WORLD_H, PLAYER_SPEED, PLAYER_R, GRAZE_R, BULLET_R, PLAYER_MIN_Y, PLAYER_MAX_Y, PLAYER_MARGIN_X, PLAYER_START_Y, KIND,
  DRONE, GUNNER, WEAVER, DIVER, DRONE_VY, WEAVER_VY, DIVER_VY, DIVER_HOLD_TICKS,
  MINE, SPLITTER, SHARD, MINE_VY, SPLITTER_VY, SHARD_VY, WALL_SPEED, isBoss,
  CARRIER, MINER, SHOT_V, SEEKER, SEEKER_SPEED, BEAM_W, BEAM_TICKS, beamColumns, CHARGE_HALF_W, CHARGE_DEPTH, CHARGE_REACH, BOSS_Y, OBST_R, radius, RAY_ON, RAY_OFF, RAY_H,
  offer, GEAR_MAX_LV, RAPID, SPREAD, PIERCE, HEAVY, LASER, WINGMAN, BARRIER, THRUSTERS,
} from '../src/sim/sim.js';

const roll = (seed, salt, i) => hash32(seed, salt, i) / 4294967296;
const FALL = { [DRONE]: DRONE_VY, [WEAVER]: WEAVER_VY, [MINE]: MINE_VY, [SPLITTER]: SPLITTER_VY, [SHARD]: SHARD_VY };
const guessVy = e => (e.type === DIVER ? (e.t > DIVER_HOLD_TICKS ? DIVER_VY : 0) : FALL[e.type] || 0);
const RIGHT = 3, LEFT = 7;             // direction codes (core DX/DY order: down, down-right, right, ...)

/** Gear choice by a fixed wish list: of the three on offer, take the one that comes first in `order`.
 *  A piece already at its top level is worth one point of life at most: it goes behind everything that can still grow. */
export const pickBy = order => sim => {
  const on = offer(sim), rank = g => order.indexOf(g) + (sim.gear[g] >= GEAR_MAX_LV ? order.length : 0);
  let best = 0;
  for (let i = 1; i < 3; i++) if (rank(on[i]) < rank(on[best])) best = i;
  return best;
};
const FIRST = () => 0, LAST = () => 2;
// The strong strategy's wish list (fixed on the tuning questions in N5, then frozen).
const EXPERT_GEAR = [RAPID, BARRIER, SPREAD, PIERCE, LASER, WINGMAN, HEAVY, THRUSTERS];

/**
 * @param p {
 *   salt      hash salt for this pilot's errors
 *   replan    ticks between decisions (reaction time)
 *   horizon   how many ticks ahead danger is checked
 *   margin    extra px kept from bullets and bodies
 *   homeY     preferred height on screen (px)
 *   grazeW    how much a near pass is worth chasing (0 = never)
 *   aimNoise  px of error on where the target is (0 = none)
 *   lapsePm   per mille of decisions that are skipped (the last direction is kept)
 *   dodge     false = never looks at bullets, bodies, beams or obstacles
 *   loot      true = goes for drops when one is within reach
 * }
 */
export function makePilot(p) {
  const mem = new WeakMap();
  return {
    input(sim) {
      let st = mem.get(sim);
      if (!st) { st = { dir: 0, next: 0, n: 0 }; mem.set(sim, st); }
      if (sim.tick < st.next) return st.dir;
      st.next = sim.tick + p.replan;
      const n = st.n++;
      if (p.lapsePm && roll(sim.seed, p.salt + 1, n) * 1000 < p.lapsePm) return st.dir;
      st.dir = decide(sim, p, n);
      return st.dir;
    },
  };
}

// A drop is only worth leaving the firing line for once it has drifted down out of the enemies' own airspace.
const LOOT_MIN_Y = 320;

function decide(sim, p, n) {
  const x0 = sim.px / ONE, y0 = sim.py / ONE;
  // Target: the enemy that is cheapest to get under, with a nudge toward the ones that are lower (about to get away)
  // and toward the gunners; a boss comes last, once nothing else is left to catch.
  let tx = WORLD_W / 2, ty = p.homeY, yW = 0.25, best = Infinity;
  for (const e of sim.enemies) {
    const ey = e.y / ONE;
    if (ey < -20 || ey > y0 - 30) continue;
    // something crossing the screen in a straight line is led by the time a shot takes to climb to it
    const ex = e.x / ONE + (e.type === CARRIER || e.type === MINER || (e.type === DRONE && e.vx) ? (e.vx / ONE) * (y0 - ey) / (SHOT_V / ONE) : 0) + (sim.leg ? sim.leg.aim(sim, e) : 0);   // another leg may want the aim to one side (a shield straight ahead)
    // an enemy with a peak or a meteor between it and the ship cannot be hit from below: look for another one first
    const hidden = sim.obst.some(o => Math.abs(o.x / ONE - ex) < OBST_R[o.kind] + 14 && o.y / ONE > ey && o.y / ONE < y0);
    const c = Math.abs(ex - x0) - ey * 0.25 - (e.type === GUNNER ? 40 : 0) + (isBoss(e.type) ? 200 : 0) + (hidden ? 150 : 0);
    if (c < best) { best = c; tx = ex; }
  }
  // A wall of bullets coming down (straight-falling bullets in one row): head for its gap while there is still time.
  // Only the nearest row above the ship counts; the gap is read off the row itself, the way a player would.
  if (p.dodge) {
    let rowY = -Infinity;
    for (const b of sim.bullets) if (b.vx === 0 && b.vy === WALL_SPEED * ONE && b.y < sim.py && b.y > rowY) rowY = b.y;
    if (rowY > -Infinity && (sim.py - rowY) / ONE < 460) {
      const xs = [0];
      for (const b of sim.bullets) if (b.vx === 0 && b.y === rowY) xs.push(b.x / ONE);
      xs.push(WORLD_W); xs.sort((a, b) => a - b);
      let wide = 0, mid = tx;
      for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > wide) { wide = xs[i] - xs[i - 1]; mid = (xs[i] + xs[i - 1]) / 2; }
      if (xs.length > 8 && wide > 80) tx = Math.min(mid + wide / 2 - 30, Math.max(mid - wide / 2 + 30, tx));   // anywhere inside the gap will do
    }
  }
  // A drop the ship can reach (it drifts and bounces; one still above the ship's ceiling is left alone until it comes
  // down): go and get the nearest, height included.
  if (p.loot) {
    let low = null, bd = Infinity;
    for (const d of sim.drops) { const dd = Math.abs(d.x - sim.px) + Math.abs(d.y - sim.py); if (d.y / ONE > LOOT_MIN_Y && dd < bd) { bd = dd; low = d; } }
    if (low) { tx = (low.x + (low.vx | 0) * p.replan) / ONE; ty = Math.min(PLAYER_MAX_Y, Math.max(PLAYER_MIN_Y, (low.y + (low.vy | 0) * p.replan) / ONE)); yW = 1; }
  }
  if (p.aimNoise) tx += (roll(sim.seed, p.salt + 2, n) * 2 - 1) * p.aimNoise;

  const hitR = PLAYER_R + BULLET_R + p.margin, steps = Math.max(1, Math.floor(p.horizon / 3));
  let bestDir = 0, bestCost = Infinity;
  for (let dir = 0; dir <= 8; dir++) {
    const vx = dir ? (DX[dir - 1] / ONE) * PLAYER_SPEED : 0, vy = dir ? (DY[dir - 1] / ONE) * PLAYER_SPEED : 0;
    let cost = 0, x = x0, y = y0;
    for (let s = 1; s <= steps; s++) {
      const k = s * 3;
      x = Math.min(WORLD_W - PLAYER_MARGIN_X, Math.max(PLAYER_MARGIN_X, x0 + vx * k));
      y = Math.min(PLAYER_MAX_Y, Math.max(PLAYER_MIN_Y, y0 + vy * k));
      if (!p.dodge || sim.invuln > k) continue;
      for (const b of sim.bullets) {
        const dx = (b.x + b.vx * k) / ONE - x, dy = (b.y + b.vy * k) / ONE - y, d2 = dx * dx + dy * dy;
        if (d2 <= hitR * hitR) cost += 4000 / s;
        else if (p.grazeW && !b.grazed && d2 <= GRAZE_R * GRAZE_R) cost -= p.grazeW / steps;
      }
      // another leg's own hazards (bombs, the sweep, claw marks, a neck, the line of a dive): all of them are drawn
      // on screen before they can hurt, and the leg says where they will be
      if (sim.leg && sim.leg.danger(sim, x * ONE, y * ONE, PLAYER_R + p.margin + 6, k)) cost += 4000 / s;
      for (const e of sim.enemies) {
        if (KIND[e.type].ground) continue;                    // on the ground: the ship flies over it
        const r = radius(e) + PLAYER_R + p.margin + 6;
        if (KIND[e.type].leg && !isBoss(e.type)) { const [fx, fy] = sim.leg.predict(sim, e, k), qx = fx / ONE - x, qy = fy / ONE - y; if (qx * qx + qy * qy <= r * r) cost += 4000 / s; continue; }
        // a seeker is assumed to keep its heading (it will turn, but which way depends on where the ship goes)
        const dx = e.type === SEEKER ? (e.x + COS[e.a] * SEEKER_SPEED * k) / ONE - x : (e.x + e.vx * k) / ONE - x;
        const dy = e.type === SEEKER ? (e.y + SIN[e.a] * SEEKER_SPEED * k) / ONE - y : e.y / ONE + guessVy(e) * k - y;
        if (dx * dx + dy * dy <= r * r) cost += 4000 / s;
        // a beam that is on, or announced and due within this look-ahead: stay out of its column
        const on = e.bt > 0 ? k < e.bt : e.pk === 3 && k >= e.pw && k < e.pw + BEAM_TICKS;
        // a boss that has announced a charge, or is in one: stay out of its lane (it is drawn on screen)
        if ((e.ch || (e.pk === 6 && k >= e.pw)) && Math.abs(x - e.x / ONE) <= CHARGE_HALF_W + PLAYER_R + p.margin + 6 && y <= BOSS_Y + CHARGE_DEPTH + CHARGE_REACH + PLAYER_R + p.margin + 6) cost += 4000 / s;
        if (on && y > e.y / ONE) for (const cx of beamColumns(e)) if (Math.abs(x - cx / ONE) <= BEAM_W + PLAYER_R + p.margin + 4) cost += 4000 / s;
      }
      for (const r of sim.rays) {                             // a ray: where it will be and whether it will be live then
        const live = (r.t + k) % (RAY_ON + RAY_OFF) < RAY_ON;
        if (live && Math.abs(y - (r.y / ONE + WALL_SPEED * k)) <= RAY_H + PLAYER_R + p.margin + 4) cost += 4000 / s;
      }
      for (const k2 of sim.strikes) {                         // the storm's lightning: announced on screen, then a column from the top
        const on = k2.pw > 0 ? k >= k2.pw && k < k2.pw + BEAM_TICKS : k < k2.bt;
        if (on && Math.abs(x - k2.x / ONE) <= BEAM_W + PLAYER_R + p.margin + 4) cost += 4000 / s;
      }
      for (const o of sim.obst) {                             // peaks and meteors: they move in a straight line
        const r = OBST_R[o.kind] + PLAYER_R + p.margin + 8, dx = (o.x + o.vx * k) / ONE - x, dy = (o.y + o.vy * k) / ONE - y;
        if (dx * dx + dy * dy <= r * r) cost += 4000 / s;
      }
    }
    // Aim is judged where this direction puts the ship by the next decision (judging it at the end of the horizon
    // would make every move look like an overshoot).
    const ax = Math.min(WORLD_W - PLAYER_MARGIN_X, Math.max(PLAYER_MARGIN_X, x0 + vx * p.replan));
    const ay = Math.min(PLAYER_MAX_Y, Math.max(PLAYER_MIN_Y, y0 + vy * p.replan));
    cost += Math.abs(ax - tx) + Math.abs(ay - ty) * yW;
    if (dir === 0) cost -= 2;                                  // prefer holding still to jittering
    if (cost < bestCost) { bestCost = cost; bestDir = dir; }
  }
  return bestDir;
}

const strong = makePilot({ salt: 303, replan: 3, horizon: 36, margin: 5, homeY: PLAYER_START_Y, grazeW: 14, aimNoise: 0, lapsePm: 0, dodge: true, loot: true });

// The random strategy's decision: every RANDOM_HOLD ticks, one of the nine steering actions (stop + 8 directions),
// uniformly. Nothing is excluded: the ship fires by itself, so each of the nine plays the game.
const RANDOM_HOLD = 20;
const SWEEP_TICKS = 80;                // one pass of the left-right sweep

const blind = (limits, policy) => ({ role: 'simple', sees: '不看畫面', limits: `${limits}；裝備一律選第一個選項；不特地去撿掉落物`, policy: { ...policy, pick: FIRST } });
const chaser = () => makePilot({ salt: 404, replan: 6, horizon: 3, margin: 0, homeY: PLAYER_START_Y, grazeW: 0, aimNoise: 0, lapsePm: 0, dodge: false, loot: false });

export const STRATEGIES = {
  expert: {
    role: 'strong', sees: '畫面上的機體、敵機、敵彈、障礙物、掉落物的位置與行進方向，以及已預告或已出現的光柱',
    limits: '每 3 tick 決定一次；只往前看 36 tick；敵機動向依種類猜測，不讀內部狀態（不知道哪一架帶掉落物）；射線的位置與通電節奏、閃電柱與頭目衝鋒的預告都從畫面讀出來；追獵體假設直線前進；裝備依一張固定的優先表選',
    policy: { input: strong.input, pick: pickBy(EXPERT_GEAR) },
  },
  'random steering': {
    role: 'random', sees: '不看畫面',
    limits: `每 ${RANDOM_HOLD} tick 在 9 個動作（停 + 8 向）裡均勻抽一個；裝備在三個選項裡均勻抽；沒有排除任何動作`,
    policy: { input: sim => hash32(sim.seed, 909, Math.floor(sim.tick / RANDOM_HOLD)) % 9, pick: sim => hash32(sim.seed, 910, sim.picks) % 3 },
  },
  'stay put': blind('原地不動', { input: () => 0 }),
  'sweep left and right': blind(`每 ${SWEEP_TICKS} tick 換一次左右方向`, { input: sim => (Math.floor(sim.tick / SWEEP_TICKS) % 2 ? LEFT : RIGHT) }),
  'chase the nearest enemy': {
    role: 'simple', sees: '敵機位置（不看敵彈）', limits: '一直移到最近敵機的正下方；不躲子彈、不躲撞擊；裝備一律選第一個選項；不特地去撿掉落物',
    policy: { input: chaser().input, pick: FIRST },
  },
  'chase, last option': {
    role: 'simple', sees: '敵機位置（不看敵彈）', limits: '一直移到最近敵機的正下方；不躲子彈、不躲撞擊；裝備一律選第三個選項；不特地去撿掉落物',
    policy: { input: chaser().input, pick: LAST },
  },
};
