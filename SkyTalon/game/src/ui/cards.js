// What the supply screen says (spec §8): the three pieces of gear on offer and what each would do at its next level.
// Text only; every number is read from the sim's tables. Nothing here mentions chapters or stages: a supply is about
// gear, the change of scene belongs to the boost that follows.
import {
  GEAR, GEAR_MAX_LV, offer, hasNet, SPREAD, PIERCE,
  RAPID_PERIOD, SPREAD_SHOTS, SPREAD_EVERY, PIERCE_COUNT, HEAVY_DMG, LASER_TARGETS, LASER_PERIOD, WING_PERIOD, BARRIER_REBUILD, BARRIER_CHARGES, THRUST_SPEED, THRUST_R,
  DROPS,
} from '../sim/sim.js';
import { TPS } from '../sim/core/index.js';

const TAG = ['火力', '火力', '火力', '火力', '自動', '自動', '防禦', '機動'];
const TEXT = [
  l => `每秒開火 ${Math.round(TPS / RAPID_PERIOD[l])} 輪`,
  l => `${SPREAD_EVERY[l] > 1 ? `每 ${SPREAD_EVERY[l]} 輪` : '每輪'}多 ${SPREAD_SHOTS[l]} 發斜射`,
  l => `子彈可多穿過 ${PIERCE_COUNT[l]} 架`,
  l => `正前方子彈傷害 ${HEAVY_DMG[l]}，射速略降`,
  l => `每 ${(LASER_PERIOD / TPS).toFixed(1)} 秒放出電漿，自動打最近的 ${LASER_TARGETS[l]} 架`,
  l => `左右各一架僚機，每秒各 ${(TPS / WING_PERIOD[l]).toFixed(1)} 發`,
  l => `擋下一次任何傷害，${(BARRIER_REBUILD[l] / TPS).toFixed(1)} 秒重建${BARRIER_CHARGES[l] > 1 ? `，可存 ${BARRIER_CHARGES[l]} 層` : ''}`,
  l => `移動速度 ${THRUST_SPEED[l]}，被彈判定縮到 ${THRUST_R[l]}`,
];
export const DROP_NAME = { repair: '修復 +1', haste: '急速射擊', boost: '加速飛行', aegis: '無敵', overhaul: '全修', upgrade: '裝備升級' };
export const dropName = kind => DROP_NAME[DROPS[kind]];

/** @returns { title, sub, options: [{ icon (gear id), tag, name, text, level, max, evo }], next } for the supply that is waiting, or null */
export function choiceView(sim) {
  const ids = offer(sim);
  if (!ids) return null;
  return {
    title: '補給', sub: '選一件裝備（時間已暫停）。',
    options: ids.map(g => {
      const lv = sim.gear[g], full = lv >= GEAR_MAX_LV;
      const net = !hasNet(sim) && ((g === SPREAD && sim.gear[PIERCE] > 0) || (g === PIERCE && sim.gear[SPREAD] > 0));
      return { icon: g, tag: TAG[g], name: GEAR[g].name, text: full ? '已滿級，改成生命上限 +1（並回 1 點）' : TEXT[g](lv), level: Math.min(lv + 1, GEAR_MAX_LV), max: GEAR_MAX_LV, evo: net ? '湊成「彈幕網」：斜射彈也能穿透' : null };
    }),
    next: '打掉小王或頭目才有下一次補給。',
  };
}

/** The build so far, for the HUD row and the result panel: [{ name, level, kind }]. */
export function buildOf(sim) {
  return [
    ...GEAR.map((g, i) => ({ name: g.name, level: sim.gear[i], kind: 'card' })).filter(g => g.level),
    ...(hasNet(sim) ? [{ name: '彈幕網', level: 0, kind: 'evo' }] : []),
  ];
}
