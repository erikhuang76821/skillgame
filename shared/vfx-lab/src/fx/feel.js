// 手感數值集中處。ice-bolt 的值來自 knowledge-base/assets/vfx-spec/examples/ice-bolt.json（basis 全為「暫定」，未證實）。
export const FEEL = {
  iceBolt: {
    flightPreview: 0.32,   // s，只供預覽；遊戲裡命中由 sim 的 hit 事件決定
    clearAfterImpact: 0.28, // s，清除 = 爆點 + 這段
    color: 0x8adfff,
    coreColor: 0xeafaff,
    shards: 12,
    shardSpeed: [260, 520], // px/s
    shardLife: [0.18, 0.28], // s
    shardDrag: 6,           // 1/s，速度指數衰減
    trailSamples: 10,
    trailSpan: 0.09,        // s，拖尾回看多久
    flashRadius: 34,        // px
    flashTime: 0.14,        // s
    coreSize: 7,            // px（半徑）
    arc: 0,                 // px，弧高；直線為 0
  },
  low: { shards: 4, trailSamples: 4 },
};
