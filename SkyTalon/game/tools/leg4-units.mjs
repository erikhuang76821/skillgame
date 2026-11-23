// What the tools need to know about leg four besides its sim (shared by tools/playtest4.mjs and tools/human-report.mjs).
/** Every machine of leg four counts as a target. */
export const counts4 = () => true;
/** Leg four's names for the sections of the script (the script itself is leg one's; gdd/05 v14 §2). */
export const NAMES4 = { 上升: '一起', 運輸機隊: '軌道補給艦', 加速: '一承', 高潮: '一合', 雷雲: '磁暴', 窄谷: '冰火山峽谷', 隕石雨: '冰塊雨' };
export const sectionName4 = s => NAMES4[s.name] ?? s.name;
