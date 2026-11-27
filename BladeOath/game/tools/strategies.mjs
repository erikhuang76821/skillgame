// Comparison strategies for the skill evidence (tools/skill-evidence.mjs), spec gdd/05 §9.
// Freeze them before a confirmation run. Every strategy sends only bytes a player could send and reads only what is on
// screen (foes inside the camera's view, their glow and wind-up, the stage's props, its own bars and cooldowns).
// Walking the stage (right, around obstacles, resting at each stage's sword mound) is shared by all strategies: it is
// not the skill being measured.
import { hash32, TPS } from '../src/sim/core/index.js';
import {
  S, FOES, SKILLS, PROPS, STAGES, VIEW_W, LEVEL_CAP, XP_TABLE, NODES, FORGE_COST, DEPTH, DEPTH_HIT, SHRINE_X,
  DODGE_STA, JUMP_STA, BUFFER_TICKS, GRAB_HITS, behind, playerMove, foeMove, encodeInput, fdir, waypoint,
  ACT_ATTACK, ACT_BLOCK, ACT_DODGE, ACT_SKILL1, ACT_INTERACT, ACT_JUMP,
  CH_LEAVE, CH_LEVEL, CH_NODE, CH_SLOT, CH_ARMOR, CH_FORGE, CH_ROUTE,
} from '../src/sim/sim.js';

const PX = 256;
const COMBO0 = playerMove(0);
// direction codes (core DX / DY): 0 down (toward the camera), 1 down-right, 2 right, 3 up-right, 4 up, 5 up-left, 6 left, 7 down-left
const RIGHT = 2, LEFT = 6, UP = 4, DOWN = 0;
const horiz = dx => (dx >= 0 ? RIGHT : LEFT);
/** Closest of the 8 directions toward (dx, dy); depth counts double (it is walked at half speed). */
const dirToward = (dx, dy) => {
  const ax = Math.abs(dx), ay = Math.abs(dy) * 2;
  if (ax > ay * 2) return dx > 0 ? RIGHT : LEFT;
  if (ay > ax * 2) return dy > 0 ? DOWN : UP;
  return dx > 0 ? (dy > 0 ? 1 : 3) : (dy > 0 ? 7 : 5);
};

// ---------------------------------------------------------------- what the player can see
const onScreen = (sim, e) => e.x >= sim.cam - 8 * PX && e.x <= sim.cam + (VIEW_W + 8) * PX;
const visible = sim => sim.foes.filter(f => f.alive && f.on && f.wait === 0 && onScreen(sim, f));
const moveOf = f => foeMove(f);
const lineGap = (a, b) => Math.abs(a.y - b.y);
const d2 = (a, b) => (a.x - b.x) ** 2 + (2 * (a.y - b.y)) ** 2;
const nearest = (sim, list) => list.reduce((b, f) => (!b || d2(f, sim.p) < d2(b, sim.p) ? f : b), null);
const engaged = sim => visible(sim).filter(f => f.st !== S.HELD);
const facingAway = (f, p) => behind(f.face, f.x, p.x);
const LINE = (DEPTH_HIT + 3) * PX;
/** Would this swing plausibly reach me (generous: length + lunge + a margin, near my line)? */
const threatens = (f, p) => {
  const m = moveOf(f);
  if (!m || lineGap(f, p) > LINE + 10 * PX) return false;
  return Math.abs(f.x - p.x) <= (m.len + m.lunge + 24) * PX;
};

// ---------------------------------------------------------------- walking the stage (shared)
/** Walk right; step round a solid prop ahead on this line; break a jar when hurt (fixed drops are on screen). */
function walkInput(sim, mem, wantFood) {
  const p = sim.p;
  if (mem.rested !== sim.stage && Math.abs(p.x - SHRINE_X * PX) <= 30 * PX) { mem.rested = sim.stage; return encodeInput(-1, ACT_INTERACT); }
  if (wantFood) {
    const food = sim.items.find(it => it.kind === 0 && onScreen(sim, it));
    if (food) return encodeInput(dirToward(food.x - p.x, food.y - p.y));
    const jar = sim.props.find(pr => pr.kind === 0 && pr.hp > 0 && onScreen(sim, pr));
    if (jar) {
      const dx = jar.x - p.x, dy = jar.y - p.y;
      if (Math.abs(dy) <= 4 * PX && Math.abs(dx) <= 24 * PX) return encodeInput(horiz(dx), ACT_ATTACK);
      return encodeInput(dirToward(dx - (dx > 0 ? 18 : -18) * PX, dy));
    }
  }
  const ahead = sim.props.find(pr => pr.hp !== 0 && pr.x > p.x && pr.x - p.x <= 40 * PX
    && Math.abs(pr.y - p.y) < ((PROPS[pr.kind].d >> 1) + 8) * PX);
  if (ahead) return encodeInput(ahead.y > p.y ? (ahead.y - 30 * PX > 0 ? 3 : 1) : (ahead.y + 30 * PX < DEPTH * PX ? 1 : 3));
  if (Math.abs(p.y - 48 * PX) > 20 * PX) return encodeInput(p.y > 48 * PX ? 3 : 1);
  return encodeInput(RIGHT);
}

// ---------------------------------------------------------------- mound choices (shared; only legal indices)
const hasNode = (p, n) => (p.nodes >> n) & 1;
function makePicker(order, { forge = true, armor = true, slots = true, route = 0 } = {}) {
  return sim => {
    const p = sim.p;
    if (sim.panel === 2) return CH_ROUTE + route;
    if (p.lv < LEVEL_CAP && p.xp >= XP_TABLE[p.lv - 1]) return CH_LEVEL;
    if (p.sp > 0) for (const n of order) if (!hasNode(p, n)) return CH_NODE + n;
    if (forge && p.forge < FORGE_COST.length && p.ore >= FORGE_COST[p.forge]) return CH_FORGE;
    if (armor && (p.armors >> 1) & 1 && p.armor !== 1) return CH_ARMOR + 1;
    if (slots) {                                       // fill empty slots with unlocked skills, best first
      for (const s of [5, 3, 2]) {
        if (s >= 2 && !hasNode(p, 6 + s)) continue;
        if (p.slots.includes(s)) continue;
        const free = p.slots.indexOf(-1);
        if (free >= 0) return CH_SLOT + free * 8 + s;
      }
    }
    return CH_LEAVE;
  };
}
// node indices: 0 hp, 1 stamina, 2 dodge, 3 parry window, 4 escape, 5 qi, 6 posture, 7 weight, 8 回風, 9 連星, 10 劍幕, 11 流光, 12 basic posture, 13 cd
const EXPERT_NODES = [3, 12, 11, 9, 0, 6, 13, 1, 5, 2];
const PLAIN_NODES = [0, 1, 6, 5, 2, 3, 4, 7];

/** Out of the line in depth: toward the side with more room. */
const outOfLine = p => (p.y > (DEPTH >> 1) * PX ? UP : DOWN);
/** Approach a target: line up in depth first, then close to `dist` px on its near side. */
function approach(p, t, dist, sim) {
  const gx = t.x - (t.x > p.x ? dist : -dist) * PX;
  if (sim) {                                       // round an obstacle in the way first
    const [wx, wy] = waypoint(sim, p.x, p.y, 6 * PX, gx, t.y);
    if (wx !== gx || wy !== t.y) return encodeInput(dirToward(wx - p.x, wy - p.y));
  }
  const dy = t.y - p.y, dx = t.x - p.x;
  const want = dx - (dx > 0 ? dist : -dist) * PX;
  if (Math.abs(dy) > 4 * PX) return encodeInput(dirToward(Math.abs(want) > 6 * PX ? want : 0, dy));
  return Math.abs(want) > 3 * PX ? encodeInput(horiz(want)) : -1;
}

// ---------------------------------------------------------------- the reading fighter (strong strategy; human bots reuse it)
const err = (sim, salt, i, spread) => (hash32(sim.seed, salt, i) % (2 * spread + 1)) - spread;   // integer error in [-spread, spread]
/**
 * A player who reads the glow and answers it. Human factors (tools/humanBots.mjs) are optional:
 *   reaction  ticks after a wind-up starts before it can be answered (0 = the strong strategy)
 *   timing    (sim, salt, key) -> integer tick error of a parry / dodge / jump (default: uniform ±2)
 *   misread   (sim, key, seen) -> true when this wind-up's glow is misread (seen = how many of that glow it met before)
 *   greed     (sim, k) -> true when it attacks without waiting for an opening this moment
 *   nodes     skill-tree order
 */
export function fighterPolicy({ reaction = 0, timing = (sim, salt, k) => err(sim, salt, k, 2), misread = () => false, greed = () => false, nodes = EXPERT_NODES } = {}) {
  const mem = { rested: -1, done: new Set(), tried: new Set(), seen: [0, 0, 0], glow: new Map() };
  return {
    pick: makePicker(nodes),
    input(sim) {
      const p = sim.p;
      if (p.st === S.DOWN) return 0;
      if (p.st === S.GRAB) {                       // knee three times, then throw it at the others (or forward)
        if (p.grabHits < GRAB_HITS) return sim.tick % 6 ? 0 : encodeInput(-1, ACT_ATTACK);
        const others = engaged(sim).filter(f => f.id !== p.grab);
        const toward = others.length ? horiz(nearest(sim, others).x - p.x) : horiz(fdir(p.face));
        return encodeInput(toward, ACT_ATTACK);
      }
      const foes = engaged(sim);
      if (!foes.length) return walkInput(sim, mem, p.hp * 10 < p.hpMax * 6);
      // Defence: read the most urgent wind-up in reach that it has had time to react to.
      const winds = foes.filter(f => f.st === S.WINDUP && f.stT >= reaction && threatens(f, p)).sort((a, b) => (moveOf(a).w - a.stT) - (moveOf(b).w - b.stT));
      if (winds.length) {
        const f = winds[0], m = moveOf(f), left = m.w - f.stT, k = f.id * 4096 + f.k * 16 + f.i + (f.air ? 8 : 0);
        if (!mem.glow.has(k)) { mem.glow.set(k, misread(sim, k, mem.seen[m.glow]) ? (m.glow + 1) % 3 : m.glow); mem.seen[m.glow]++; }
        const glow = mem.glow.get(k);
        if (mem.done.has(k)) return 0;
        if (glow === 1) {
          const slot = p.slots.findIndex(s => s >= 0 && SKILLS[s].brk && p.cd[2 + p.slots.indexOf(s)] === 0 && p.qi >= SKILLS[s].qi
            && lineGap(f, p) <= LINE && Math.abs(f.x - p.x) <= (SKILLS[s].len + SKILLS[s].lunge + 4) * PX);
          // One interrupt attempt per wind-up; when it misses, the dodge below is still there.
          if (slot >= 0 && left > 8 && !mem.tried.has(k)) { mem.tried.add(k); return encodeInput(horiz(f.x - p.x), ACT_SKILL1 + slot); }
          if (slot < 0 && left > 24) { const a = approach(p, f, 14, sim); if (a >= 0) return a; }   // close in to interrupt
        }
        // A minion's swing that has not left yet: strike first (a hit at least its poise staggers it) when the blade lands in time.
        const first = COMBO0.w + 1 + (lineGap(f, p) > 4 * PX ? 4 : 0);
        if (glow !== 2 && f.kind === 0 && COMBO0.force >= FOES[f.type].poise && left > first + 1 && p.st <= S.MOVE && p.z === 0
          && lineGap(f, p) <= 8 * PX && Math.abs(f.x - p.x) <= (COMBO0.len + 2) * PX + 6 * PX) return encodeInput(horiz(f.x - p.x), ACT_ATTACK);
        if (glow === 0 && p.cd[0] === 0 && p.z === 0) {
          if (left <= 4 + timing(sim, 11, k)) { mem.done.add(k); return encodeInput(horiz(f.x - p.x), ACT_BLOCK); }   // parry: lands in the first PARRY_WIN ticks
          return 0;
        }
        // A low sweep: jump over it (no stamina for a dodge needed).
        if (m.low && p.sta >= JUMP_STA && left <= 5 + timing(sim, 17, k) && left >= 1) { mem.done.add(k); return encodeInput(-1, ACT_JUMP); }
        // Ticks before a dodge can start: mid-swing it waits for the move's dodge cancel. A player presses early and lets the
        // input buffer fire it there (only within the buffer: an earlier press would expire).
        const own = p.st === S.WINDUP || p.st === S.ACTIVE || p.st === S.RECOVER ? playerMove(p.mv) : null;
        const busy = !own ? 0 : p.st === S.WINDUP ? own.w - p.stT + own.a + own.cancel.dodge
          : p.st === S.ACTIVE ? own.a - p.stT + own.cancel.dodge : Math.max(0, own.cancel.dodge - p.stT);
        if (p.sta >= DODGE_STA && busy >= BUFFER_TICKS) return 0;
        if (p.sta >= DODGE_STA) {
          // Red / gold: aim for a perfect dodge. A white swing with the guard on cooldown: just get out safely.
          if (left <= (glow === 0 ? 8 : 5) + timing(sim, 13, k) + busy) { mem.done.add(k); return encodeInput(outOfLine(p), ACT_DODGE); }
          return 0;
        }
        return encodeInput(outOfLine(p));                                            // no stamina: step off the line
      }
      // Offence: hit a target that is open (recovering, broken, stunned, turned away) or after a parry / perfect dodge.
      const greedy = greed(sim, sim.tick >> 4);
      const open = foes.filter(f => f.st !== S.WINDUP && (f.st === S.RECOVER || f.st === S.BROKEN || f.st === S.HITSTUN || f.st === S.CONTROL
        || f.st === S.ACTIVE && !threatens(f, p) || p.counter > 0
        || (facingAway(f, p) || !FOES[f.type].guard) && (greedy || f.st !== S.READY || f.stT + 22 < f.gap)));
      const t = nearest(sim, open.length ? open : foes);
      // A guarding minion deflects basic attacks: walk into it and grab it instead (§5.17).
      const guarding = !open.includes(t) && FOES[t.type].mass <= 1 && t.st === S.READY && FOES[t.type].guard;
      if (guarding && lineGap(t, p) <= 4 * PX && Math.abs(t.x - p.x) <= 22 * PX) return encodeInput(horiz(t.x - p.x));
      // Nobody open: hold the ground and let them come (their swings are the openings); only close a long gap.
      if (!open.includes(t) && !guarding) return Math.abs(t.x - p.x) > 48 * PX ? approach(p, t, 40, sim) : 0;
      const a = approach(p, t, 18, sim);
      if (a >= 0) return a;
      if (!open.includes(t)) return 0;                                               // guarding big foe: wait for its swing
      const ready = p.slots.findIndex(s => s >= 0 && !SKILLS[s].stance && p.cd[2 + p.slots.indexOf(s)] === 0 && p.qi >= SKILLS[s].qi && SKILLS[s].dmg >= 10);
      if (ready >= 0 && (t.st === S.BROKEN || t.kind > 0)) return encodeInput(horiz(t.x - p.x), ACT_SKILL1 + ready);
      return encodeInput(horiz(t.x - p.x), ACT_ATTACK);
    },
  };
}
const expertPolicy = () => fighterPolicy();

// ---------------------------------------------------------------- simple strategies (one-sentence combat rules)
function simplePolicy(rule) {
  const mem = { rested: -1 };
  return {
    pick: makePicker(PLAIN_NODES, { forge: true, armor: true, slots: false }),
    input(sim) {
      const p = sim.p;
      if (p.st === S.DOWN) return 0;
      if (p.st === S.GRAB) return p.grabHits < GRAB_HITS ? (sim.tick % 6 ? 0 : encodeInput(-1, ACT_ATTACK)) : encodeInput(horiz(fdir(p.face)), ACT_ATTACK);
      const foes = engaged(sim);
      if (!foes.length) return walkInput(sim, mem, false);
      const t = nearest(sim, foes);
      if (rule === 'grab') {
        if (FOES[t.type].mass <= 1) { const a = approach(p, t, 10, sim); return a >= 0 ? a : encodeInput(horiz(t.x - p.x)); }
      }
      const wind = foes.find(f => f.st === S.WINDUP && threatens(f, p));
      if (wind && rule === 'block' && p.cd[0] === 0) return encodeInput(horiz(wind.x - p.x), ACT_BLOCK);
      if (wind && rule === 'dodge' && p.sta >= DODGE_STA) return encodeInput(-1, ACT_DODGE);
      if (rule === 'jump') {
        if (p.st === S.JUMP) return encodeInput(-1, ACT_ATTACK);
        const a = approach(p, t, 30, sim);
        if (a >= 0 && Math.abs(t.y - p.y) > 4 * PX) return a;
        return encodeInput(horiz(t.x - p.x), ACT_JUMP);
      }
      const a = approach(p, t, 18, sim);
      if (a >= 0) return a;
      if (p.cd[2] === 0 && p.slots[0] >= 0 && sim.tick % 2) return encodeInput(horiz(t.x - p.x), ACT_SKILL1);
      return encodeInput(horiz(t.x - p.x), ACT_ATTACK);
    },
  };
}

// ---------------------------------------------------------------- random
function randomPolicy() {
  return {
    pick: sim => (sim.panel === 2 ? CH_ROUTE : CH_LEAVE),
    input(sim) {
      // Every 8 ticks a new uniformly drawn (direction or stand still, action 0–10) pair; held in between.
      const k = sim.tick >> 3, dir = hash32(sim.seed, 505, k) % 9, act = hash32(sim.seed, 606, k) % 11;
      return encodeInput(dir === 8 ? -1 : dir, sim.tick % 8 === 0 ? act : 0);
    },
  };
}

// A strategy is used for many matches: build a fresh memory per match (keyed by the sim object).
const perMatch = make => {
  const live = new WeakMap();
  const get = sim => { let s = live.get(sim); if (!s) { s = make(); live.set(sim, s); } return s; };
  return { input: sim => get(sim).input(sim), pick: sim => get(sim).pick(sim) };
};

export const STRATEGIES = {
  expert: {
    role: 'strong',
    sees: '畫面內敵人的位置、面向、起手光色與已起手幾 tick（招式幀資料已背熟）、自己的資源與冷卻、關卡的障礙物與補給',
    limits: `卸勁、完美閃避與跳躍的時機誤差 ±2 tick；不讀畫面外的敵人；走蠱林路線；格擋中的小兵改用抓投；固定配點 ${EXPERT_NODES.map(n => NODES[n]).join('、')}`,
    policy: perMatch(expertPolicy),
  },
  random: {
    role: 'random',
    sees: '不看畫面',
    limits: '每 8 tick 均勻抽一次方向（8 方向或停下）與動作碼 0–10（含互動與跳躍）；劍塚面板一律離開，選路選第一條',
    policy: perMatch(randomPolicy),
  },
  masher: { role: 'simple', sees: '最近的敵人', limits: '對齊最近敵人的深度、走過去一直普攻，招式 1 好了就放；不看起手', policy: perMatch(() => simplePolicy('mash')) },
  blocker: { role: 'simple', sees: '敵人有沒有在起手（不看光色）', limits: '見起手就格擋，其餘同 masher；不壓時機', policy: perMatch(() => simplePolicy('block')) },
  dodger: { role: 'simple', sees: '敵人有沒有在起手（不看光色）', limits: '見起手就往後閃，其餘同 masher；不壓時機', policy: perMatch(() => simplePolicy('dodge')) },
  jumper: { role: 'simple', sees: '最近的敵人', limits: '對齊深度後一直跳斬（落地就再跳）', policy: perMatch(() => simplePolicy('jump')) },
  grabber: { role: 'simple', sees: '最近的敵人', limits: '貼身抓小兵、膝撞三下再往前摔；抓不住的敵人同 masher', policy: perMatch(() => simplePolicy('grab')) },
};
export { TPS, perMatch, PLAIN_NODES, STAGES };
