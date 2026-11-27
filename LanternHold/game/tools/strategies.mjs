// Comparison strategies for LanternHold's skill evidence (tools/skill-evidence.mjs). Prototype: not frozen yet.
//   strong  the expert planner (sees only the screen: resources, units, the prewarned event gates)
//   random  sends a random legal-looking command every second (build / buy / move to a random cell)
//   simple  one-sentence plans from tools/bots.mjs BASELINES
import { hash32 } from '../src/sim/core/index.js';
import { OP, encode } from '../src/sim/sim.js';
import { BOTS, BASELINES } from './bots.mjs';

const simple = (limits, policy) => ({ role: 'simple', sees: '只看資源數字', limits, policy });
const pending = new WeakMap();
const randomPolicy = {
  input(sim) {
    let q = pending.get(sim);
    if (!q) { q = []; pending.set(sim, q); }
    if (q.length) return q.shift();
    if (sim.tick % 60) return 0;
    const h = k => hash32(sim.seed, 0xbad + k, sim.tick);
    const pick = h(0) % 4;
    const cmd = pick === 0 ? encode(OP.BUILD, h(1) % 12, h(1) % 12 < 6 ? 0 : 1)
      : pick === 1 ? encode(OP.MENU, h(3) % 12, h(2) % 3)
      : pick === 2 ? encode(OP.MOVE, h(1) % 16, h(2) % 240)
      : encode(OP.WALL, h(1) % 8, 0);
    q.push(...cmd);
    return q.shift();
  },
  pick: sim => hash32(sim.seed, 0xca7d, sim.picks) % 3,
};

export const STRATEGIES = {
  expert: { role: 'strong', sees: '畫面上的資源、單位、事件預警方向', limits: '每 20–30 tick 想一次，每次最多 3 個指令', policy: BOTS.expert },
  'random command every second': { role: 'random', sees: '無', limits: '每秒一個隨機指令（建造、選單、移動、城牆），卡片隨機選', policy: randomPolicy },
  ...Object.fromEntries(Object.entries(BASELINES).map(([name, policy]) => [name, simple('一句話規則', policy)])),
};
