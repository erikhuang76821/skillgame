// 像素光柵：逐格寫「色階編號」到低解析 buffer，最亮者勝（不混色、無反鋸齒）。
// 不碰 DOM / Pixi / Math.random / Date：瀏覽器預覽與 Node 烘焙（tools/bake.mjs）共用。

/** 整數雜湊 → [0, 1)。同 (seed, i, salt) 永遠同值。 */
export function hash(seed, i, salt = 0) {
  let h = (seed * 374761393 + i * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 2D value noise，格距 1，回傳 [0, 1)。 */
export function noise2(seed, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const v = (a, b) => hash(seed, a * 7919 + b * 104729, 17);
  const top = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * sx;
  const bot = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * sx;
  return top + (bot - top) * sy;
}

// 緩動（與 GSAP 同名同形，給純函式用）
export const ease = {
  expoOut: (p) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p)),
  power3Out: (p) => 1 - (1 - p) ** 3,
  power3In: (p) => p ** 3,
  backIn: (p, s = 1.70158) => p * p * ((s + 1) * p - s),
  backOut: (p, s = 1.70158) => 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2,
};
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** t 落在 [a, b] 的進度，夾在 0..1。 */
export const span = (t, a, b) => clamp01((t - a) / (b - a));
/** 阻力位移：v0 起速、k 阻力，先快後慢（18 §3）。 */
export const drag = (v0, k, t) => (v0 / k) * (1 - Math.exp(-k * t));

/** 一格畫布：Uint8 色階編號，0 = 透明。 */
export function createCell(w, h) {
  const lv = new Uint8Array(w * h);
  const put = (x, y, level) => {
    x = Math.round(x); y = Math.round(y);
    if (level <= 0 || x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (level > lv[i]) lv[i] = level;
  };
  return {
    w, h, lv, put,
    clear() { lv.fill(0); },
    disc(cx, cy, r, level) {
      const r2 = r * r;
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
          if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) put(x, y, level);
    },
    /** 環：半徑 r、厚度 th（像素），sy 壓扁成橢圓。 */
    ring(cx, cy, r, th, level, sy = 1) {
      const ro = r + th / 2, ri = Math.max(0, r - th / 2);
      for (let y = Math.floor(cy - ro * sy); y <= Math.ceil(cy + ro * sy); y++)
        for (let x = Math.floor(cx - ro); x <= Math.ceil(cx + ro); x++) {
          const d = Math.hypot(x - cx, (y - cy) / sy);
          if (d <= ro && d >= ri) put(x, y, level);
        }
    },
    /** Bresenham 線段。 */
    line(x0, y0, x1, y1, level) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        put(x0, y0, level);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    },
  };
}

/** 色階 → RGBA，寫進目標 buffer 的 (ox, oy)。alpha 只有 0 或 255（像素銳利）。 */
export function blit(cell, ramp, out, outW, ox, oy) {
  const { w, h, lv } = cell;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const l = lv[y * w + x];
      const o = ((oy + y) * outW + ox + x) * 4;
      if (!l) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; continue; }
      const c = ramp[Math.min(l, ramp.length) - 1];
      out[o] = c >> 16; out[o + 1] = (c >> 8) & 255; out[o + 2] = c & 255; out[o + 3] = 255;
    }
}

/** 步進：特效幀率下的時間（12 fps 等，遊戲本身仍 60 fps）。 */
export const quantize = (t, fps) => Math.floor(t * fps + 1e-6) / fps;
