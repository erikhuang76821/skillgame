// What the tools need to know about leg three besides its sim (shared by tools/playtest3.mjs and tools/human-report.mjs).
/** Every machine of leg three counts as a target. */
export const counts3 = () => true;
/** Leg three's names for the sections of the script (the script itself is leg one's; gdd/05 v13 §2). */
export const NAMES3 = { 上升: '一起', 運輸機隊: '軌道補給艦', 加速: '一承', 高潮: '一合', 雷雲: '雷暴', 窄谷: '冰脊峽谷', 隕石雨: '光環碎冰雨' };
export const sectionName3 = s => NAMES3[s.name] ?? s.name;
