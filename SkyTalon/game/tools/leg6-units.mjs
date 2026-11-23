// What the tools need to know about leg six besides its sim (shared by tools/playtest6.mjs and tools/human-report.mjs).
import { COELO, ORNI } from '../src/sim/leg6.js';

/** A creature that counts as a target: a coelophysis pack is a bonus, an ornitholestes is an ambush from the side
 *  (it is dodged, not hunted). */
export const counts6 = p => p.type !== COELO && p.type !== ORNI;
/** Leg six's names for the sections of the script (the script itself is leg one's). */
export const NAMES6 = { 暖身: '暖身', 上升: '一起', 運輸機隊: '火山彈', 加速: '一承', 高潮: '一合', 雷雲: '尾掃', 窄谷: '側風', 隕石雨: '隕石' };
export const sectionName6 = s => NAMES6[s.name] ?? s.name;
