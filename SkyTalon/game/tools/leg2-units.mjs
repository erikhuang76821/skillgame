// What the tools need to know about leg two besides its sim (shared by tools/playtest2.mjs and tools/human-report.mjs).
/** Every machine of leg two counts as a target. */
export const counts2 = () => true;
/** Leg two's names for the sections of the script (the script itself is leg one's; gdd/05 v12 §2). */
export const NAMES2 = { 上升: '一起', 運輸機隊: '月面補給艦', 加速: '一承', 高潮: '一合', 雷雲: '日焰柱', 窄谷: '硫酸雲谷', 隕石雨: '軌道殘骸雨' };
export const sectionName2 = s => NAMES2[s.name] ?? s.name;
