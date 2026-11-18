// Scripted players for LanternHold (spec §9). They send only what a player can send: 3-byte commands and card choices.
// They see what is on screen: gold, units, walls, the open offer, and an event's gates only from its prewarn tick on.
import { hash32 } from '../src/sim/core/index.js';
import {
  OP, encode, cellOf, CX, CY, COS, SIN, EVENTS, PREWARN_TICKS, SLOTS, WALL_SEGS, UNIT, UNIT_KINDS, barracksCost, WALL, REPAIR,
  popCap, pop, canPlace, segOf, ONE, wallMaxHp, CARDS, EVOS, SYNERGY, CHOICE, tagCount, CARD_MAX,
} from './botApi.mjs';

const state = new WeakMap();
const S = sim => { let s = state.get(sim); if (!s) { s = { bytes: [], next: 0 }; state.set(sim, s); } return s; };
const gateAngle = g => (g * 32 + 192) & 255;
const pointAt = (a, r) => [CX + Math.trunc((COS[a] * r) / ONE), CY + Math.trunc((SIN[a] * r) / ONE)];

function visibleEvent(sim, notice = 0) {             // notice = ticks the player needs to notice the warning
  let cur = -1;
  for (let e = 0; e < EVENTS.length; e++) if (sim.tick >= EVENTS[e].at - PREWARN_TICKS + notice) cur = e;
  return cur;
}

/** The gates an event really uses, as the warning arrows show them ('b' = opposite of 'a', 'all' = every gate). */
function eventGates(sim, e) {
  const [a, n] = sim.eventState[e].gates, out = new Set();
  for (const g of EVENTS[e].groups) {
    if (g.gate === 'all') return [0, 1, 2, 3, 4, 5, 6, 7];
    out.add(g.gate === 'a' ? a : g.gate === 'b' ? (a + 4) % 8 : n);
  }
  return [...out];
}

function plan(sim, o) {
  const cmds = [], soldiers = [];
  sim.units.forEach((u, i) => { if (u.alive) soldiers.push(i); });
  const bars = sim.slots.map((sl, i) => i).filter(i => sim.slots[i].kind === 'barracks');
  const free = SLOTS.findIndex((_, i) => !sim.slots[i].kind);
  const room = pop(sim) < popCap(sim);
  const ev = visibleEvent(sim, o.notice);

  // 1) barracks: the first one at once; more when the population cap is what holds us back
  if (!bars.length) { if (free >= 0 && sim.gold >= barracksCost(sim)) return [encode(OP.BUILD, free, 0)]; return []; }
  if (bars.length < o.barracks && free >= 0 && !room && sim.gold >= barracksCost(sim) + o.reserve) cmds.push(encode(OP.BUILD, free, 0));
  // 2) soldiers on the barracks with the shortest queue
  const ready = bars.filter(i => sim.slots[i].build === 0).sort((x, y) => sim.slots[x].queue.length - sim.slots[y].queue.length);
  if (ready.length && room && sim.slots[ready[0]].queue.length < 2) {
    const n = soldiers.length;
    const want = o.mix ? (n % 4 === 1 ? 1 : n % 6 === 3 ? 2 : 0) : 0;
    if (sim.gold >= UNIT[UNIT_KINDS[want]].cost + o.reserve) cmds.push(encode(OP.MENU, ready[0], want));
  }
  // 3) walls: the warned side first; with spare gold, close the whole ring
  if (o.walls && (!room || sim.gold >= 20 || soldiers.length >= 8)) {           // soldiers first while the army is small
    const segs = [];
    if (ev >= 0) for (const g of eventGates(sim, ev)) { const seg = segOf(gateAngle(g)); segs.push(seg, (seg + 1) % WALL_SEGS, (seg + WALL_SEGS - 1) % WALL_SEGS); }
    if (o.wallAll && (!room || sim.gold >= 40)) for (let g = 0; g < 8; g++) segs.push(segOf(gateAngle(g)));
    if (o.wallAll && sim.gold >= 60) for (let w = 0; w < WALL_SEGS; w++) segs.push(w);
    for (const w of segs) {
      const wl = sim.walls[w];
      if (wl.lv === 0 && sim.gold >= WALL.cost + o.reserve) { cmds.push(encode(OP.WALL, w, 0)); break; }
      if (wl.lv > 0 && wl.hp < wallMaxHp(sim) / 2 && wl.repair === 0 && sim.gold >= REPAIR.cost) { cmds.push(encode(OP.WALL, w, 1)); break; }
    }
  }
  // 4) soldiers: every unit has a stable home on the ring (from its id); a squad answers each warning, then goes home
  if (o.deploy) {
    const s = S(sim);
    s.squad ??= new Map();                                  // unit index -> event it answered
    const gates = ev >= 0 && o.react ? eventGates(sim, ev) : null;
    const evDone = ev >= 0 && sim.eventState[ev].cleared;
    const home = u => {
      const a = (u.gen * 37 + 192) & 255;
      return pointAt(a, u.kind === 'archer' ? 185 : u.kind === 'shield' ? 225 : 160);
    };
    let moved = false;
    if (gates && !evDone && o.react === 'squad') {
      for (const g of gates.length > 2 ? [] : gates) {
        const ga = gateAngle(g);
        // nearest free units by angle: up to `squad` of them
        const cand = soldiers.filter(i => sim.units[i].redeploy === 0 && sim.units[i].state === 'guard' && !s.squad.has(i))
          .map(i => { const u = sim.units[i], ua = (u.gen * 37 + 192) & 255; return [i, Math.min((ua - ga) & 255, (ga - ua) & 255)]; })
          .sort((x, y) => x[1] - y[1]).slice(0, o.squad);
        for (const [i, da] of cand) {
          if (da < 20 || moved) continue;                      // already covering that side
          const u = sim.units[i], [x, y] = pointAt((ga + (i % 3 - 1) * 6) & 255, u.kind === 'shield' ? 225 : 195), cell = cellOf(x, y);
          if (canPlace(sim, x * ONE, y * ONE, i)) { cmds.push(encode(OP.MOVE, i, cell)); s.squad.set(i, ev); moved = true; }
        }
      }
    }
    for (const i of soldiers) {
      if (moved) break;
      const u = sim.units[i];
      if (u.redeploy > 0 || u.state !== 'guard') continue;
      const tag = s.squad.get(i);
      if (tag !== undefined && !(sim.eventState[tag].cleared || sim.tick > EVENTS[tag].at + 30 * 60)) continue;
      const [x, y] = gates && o.react === true && soldiers.indexOf(i) % 3 !== 2
        ? pointAt((gateAngle(gates[soldiers.indexOf(i) % 2]) + ((soldiers.indexOf(i) >> 1) % 3 - 1) * 8) & 255, 190)
        : home(u);
      const cell = cellOf(x, y);
      if (cellOf(Math.trunc(u.hx / ONE), Math.trunc(u.hy / ONE)) !== cell && canPlace(sim, x * ONE, y * ONE, i)) { cmds.push(encode(OP.MOVE, i, cell)); s.squad.delete(i); moved = true; }
    }
  }
  return cmds;
}

// --- card choice ---
// planned: aim at the evolution closest to completion, finish tag synergies, reroll a weak offer.
function cardValue(sim, id) {
  if (EVOS[id]) return 100;
  if (id === 'pouch') return 0;
  const lvNow = sim.cards[id];
  let v = lvNow > 0 ? 3 : 1;
  let bestEvo = 0;
  for (const e of Object.values(EVOS)) {
    const have = (sim.cards[e.from] > 0 ? 1 : 0) + (sim.cards[e.with] > 0 ? 1 : 0) + sim.cards[e.from] / CARD_MAX;
    if (id === e.from || id === e.with) bestEvo = Math.max(bestEvo, 2 + have * 2);
  }
  v += bestEvo;
  // cards that need a unit kind you do not field are worth little; damage matters most early
  const kinds = k => sim.units.filter(u => u.alive && u.kind === k).length;
  if ((id === 'shieldWall' || id === 'frostShield') && kinds('shield') < 3) v -= 4;
  if (id === 'prayer' && kinds('priest') < 2) v -= 4;
  if ((id === 'stoneWall' || id === 'fireWall') && sim.walls.filter(w => w.lv).length < 8) v -= 3;
  if (sim.picks < 4 && ['rapid', 'split', 'fireArrow', 'burst', 'thunder', 'chain'].includes(id)) v += 2;
  if (lvNow === 0) for (const t of CARDS[id].tags) if (tagCount(sim, t) === SYNERGY[t].n - 1) v += 2;
  if (id === 'reinforce' && sim.picks < 4) v += 3;
  if (id === 'bounty' && sim.picks < 3) v += 2;
  return v;
}
const PICKERS = {
  first: () => 0,
  owned: sim => { const ids = sim.offer.ids; const k = ids.findIndex(id => EVOS[id] || sim.cards[id] > 0); return k >= 0 ? k : 0; },
  planned: sim => {
    const vals = sim.offer.ids.map(id => cardValue(sim, id));
    const best = Math.max(...vals);
    if (best < 4 && sim.rerolls > 0) return CHOICE.REROLL;
    return vals.indexOf(best);
  },
};

export function makePlanner(name, o) {
  return {
    name,
    // pickSlipPm: per-mille chance of taking the first card instead of thinking (attention, impatience)
    pick: sim => (o.pickSlipPm && hash32(sim.seed, 0x51b, sim.picks * 8 + sim.rerolls) % 1000 < o.pickSlipPm ? 0 : PICKERS[o.picker](sim)),
    input(sim) {
      const s = S(sim);
      if (s.bytes.length) return s.bytes.shift();
      if (sim.tick < s.next) return 0;
      s.next = sim.tick + o.think + (hash32(sim.seed, 0x5eed + o.think, sim.tick) % (o.jitter + 1));
      if (o.lapsePm && hash32(sim.seed, 0x1a95e, sim.tick) % 1000 < o.lapsePm) return 0;   // looked away this time
      for (const c of plan(sim, o).slice(0, o.perThink)) s.bytes.push(...c);
      return s.bytes.length ? s.bytes.shift() : 0;
    },
  };
}

export const BASE = { notice: 0, lapsePm: 0, pickSlipPm: 0, mix: false, walls: false, wallAll: false, deploy: false, react: false, squad: 2, barracks: 1, reserve: 0, think: 30, jitter: 0, perThink: 3, picker: 'first' };
export const BOTS = {
  novice: makePlanner('novice', { ...BASE, think: 90, jitter: 60, perThink: 1 }),
  intermediate: makePlanner('intermediate', { ...BASE, deploy: true, walls: true, barracks: 2, think: 45, jitter: 30, perThink: 2, picker: 'owned' }),
  expert: makePlanner('expert', { ...BASE, mix: true, walls: true, wallAll: true, deploy: true, react: 'squad', squad: 5, barracks: 4, think: 20, jitter: 10, perThink: 3, picker: 'planned' }),
};

/** One-sentence plans a beginner could follow (simple strategies for skill evidence). */
export const BASELINES = {
  'one barracks, archers only, take the first card': makePlanner('only-archers', { ...BASE, think: 30 }),
  'max barracks, archers only, level what you own': makePlanner('mass', { ...BASE, barracks: 6, think: 30, picker: 'owned' }),
  'spread evenly, plan cards, never react': makePlanner('spread', { ...BASE, mix: true, walls: true, wallAll: true, deploy: true, barracks: 4, think: 30, picker: 'planned' }),
};
