import { Recorder, hash32 } from './src/sim/core/index.js';
import { GAME } from './src/sim/sim.js';
import { BOTS, BASELINES } from './tools/bots.mjs';
const who = { ...BOTS, 'C4': BASELINES['C4 口訣：柵欄跟缺口＋牆算兩列＋成長門射到最後'], '柵欄回中間': BASELINES['柵欄前回到中間（否則選大的門）'] };
for (const [t, bot] of Object.entries(who)) {
  let fences = 0, hits = 0, lost = 0, peak = 0;
  for (let i = 0; i < 30; i++) {
    const rec = new Recorder(GAME, hash32(2026, 7, i));
    while (rec.phase !== 'over') { const before = rec.sim.dist; rec.step(bot.input(rec.sim)); for (const h of rec.sim.hazards) if (h.y > before && h.y <= rec.sim.dist) fences++; for (const e of rec.sim.events) if (e.type === 'hurt' && e.cause === 'hazard') { hits++; lost += e.n; } }
    peak += rec.sim.peakTroops / 30;
  }
  console.log(`${t}: 通過柵欄 ${fences} 次，碰到 ${hits} 次（${(100 * hits / Math.max(1, fences)).toFixed(0)}%），平均每局柵欄失兵 ${Math.round(lost / 30)}，平均最多兵 ${Math.round(peak)}`);
}
