// What the tools need to know about leg five besides its sim (shared by tools/playtest5.mjs and tools/human-report.mjs).
/** Every machine of leg five counts as a target. */
export const counts5 = () => true;
/** Leg five's names for the sections of the script (the script itself is leg one's; gdd/05 v15 §2). */
export const NAMES5 = { 上升: '一起', 運輸機隊: '軌道補給艦', 加速: '一承', 高潮: '一合', 雷雲: '太陽風暴', 窄谷: '磁力管道', 隕石雨: '吸積碎屑雨' };
export const sectionName5 = s => NAMES5[s.name] ?? s.name;
