// 六個高對比像素戰鬥特效，以 Pixel Composer Gallery 同名專案的動態為參考，程式重做（0 bytes）。
// 每個特效：draw(cell, t, seed) 是時間的純函式——不累積上一幀、不用 Math.random。
// 數值是做法參數（tool-level），不是驗收門檻；要進遊戲就搬進該遊戲的 fx/feel.js。
import { hash, noise2, ease, span, clamp01, drag } from './raster.js';

// 色階由暗到亮（knowledge-base/18 §7：發光色階不從近黑起；暗階偏紫藍、亮階收在暖白）
export const RAMPS = {
  fire: [0x1e0e1a, 0x4a1a2c, 0xa8232f, 0xe8601c, 0xffb627, 0xfff4c2],
  steel: [0x14204a, 0x2d5bd1, 0x4fb3ff, 0xa8ecff, 0xffffff],
  bolt: [0x3a1d00, 0x9c4a00, 0xffa21a, 0xffe35c, 0xffffff],
  plasma: [0x1a0f3d, 0x5a2ad0, 0xc04dff, 0xff8af0, 0xffe8ff, 0xffffff],
};

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;

/** 斬擊：彎月由慢而快掃出，前端最亮；收尾碎成像素而不是淡出。 */
const slash = {
  id: 'slash', name: '彎月斬', ref: 'Slash', ramp: RAMPS.steel,
  w: 64, h: 64, fps: 20, duration: 0.5,
  draw(c, t, seed) {
    const cx = 32, cy = 36, R = 24;
    const a0 = -160 * D2R, a1 = 25 * D2R;
    const head = a0 + (a1 - a0) * ease.expoOut(span(t + 0.04, 0, 0.2)); // 第 0 格就有刀形
    const tail = a0 + (a1 - a0) * ease.power3In(span(t, 0.06, 0.36)); // 尾端先拖住、後段快速收
    const shrink = 1 - span(t, 0.26, 0.46);
    const erode = span(t, 0.3, 0.5);
    const frame = Math.round(t * 20);
    if (head - tail > 0.02 && shrink > 0) {
      for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
        const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
        if (a < tail || a > head) continue;
        const u = (a - tail) / (head - tail);
        const th = 10 * Math.sin(Math.PI * Math.min(1, u * 1.08)) * shrink;
        const d = R - r;
        if (d < 0 || d > th) continue;
        if (erode > 0 && hash(seed, y * 64 + x, frame) < erode) continue;
        let lv = d < 1.3 ? 5 : d < th * 0.45 ? 4 : d < th * 0.75 ? 3 : 2;
        if (u > 0.85 && lv < 5) lv++;
        c.put(x, y, lv);
      }
    }
    // 起手閃：前兩格刀尖一點大亮（命中前 1–2 格最大最亮）
    if (t < 0.1) c.disc(cx + Math.cos(head) * R, cy + Math.sin(head) * R, 3 - t * 20, 5);
    // 火花：沿切線飛出，阻力減速、重力下墜
    for (let i = 0; i < 9; i++) {
      const te = 0.04 + i * 0.018, age = t - te;
      if (age < 0 || age > 0.26) continue;
      const a = a0 + (a1 - a0) * ease.expoOut(span(te, 0, 0.16)) + (hash(seed, i, 3) - 0.5) * 0.3;
      const v = 60 + hash(seed, i, 4) * 60, s = drag(v, 9, age);
      const x = cx + Math.cos(a) * R - Math.sin(a) * s;
      const y = cy + Math.sin(a) * R + Math.cos(a) * s + 40 * age * age;
      c.put(x, y, age < 0.1 ? 5 : age < 0.18 ? 3 : 2);
    }
  },
};

/** 閃電：由上劈下，每格重新抖形；落點地面環＋火花。 */
const sparkBolt = {
  id: 'spark-bolt', name: '落雷', ref: 'Spark Bolt', ramp: RAMPS.bolt,
  w: 64, h: 64, fps: 15, duration: 0.6,
  draw(c, t, seed) {
    const k = Math.round(t * 15);
    const top = { x: 26 + hash(seed, 0, 1) * 12, y: 0 }, bot = { x: 32, y: 54 };
    // 中點位移，深度 4 → 17 點；每格換一組偏移（閃爍）
    let pts = [top, bot];
    for (let d = 0, amp = 9; d < 4; d++, amp *= 0.55) {
      const nx = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        nx.push(p, { x: (p.x + q.x) / 2 + (hash(seed, d * 32 + i, 100 + k) - 0.5) * 2 * amp, y: (p.y + q.y) / 2 });
      }
      nx.push(pts[pts.length - 1]);
      pts = nx;
    }
    const reveal = ease.expoOut(span(t, 0, 0.08));
    const end = span(t, 0.32, 0.55);
    const n = Math.max(1, Math.round((pts.length - 1) * reveal));
    const bright = t < 0.32 && hash(seed, k, 7) < 0.8;
    const drawPath = (P, from, to, core, glow) => {
      for (let i = from; i < to; i++) {
        if (end > 0 && hash(seed, i, 200 + k) < end) continue;
        const p = P[i], q = P[i + 1];
        if (glow) { c.line(p.x - 1, p.y, q.x - 1, q.y, glow); c.line(p.x + 1, p.y, q.x + 1, q.y, glow); }
        c.line(p.x, p.y, q.x, q.y, core);
      }
    };
    if (end < 1) {
      drawPath(pts, 0, n, bright ? 5 : 4, bright ? 3 : 2);
      // 兩條分支：從主幹第 5、10 點斜下岔出
      for (const [b, from] of [[0, 5], [1, 10]]) {
        if (n <= from) continue;
        const dir = hash(seed, b, 9) < 0.5 ? -1 : 1;
        const br = [pts[from]];
        for (let j = 1; j <= 4; j++) {
          const pr = br[j - 1];
          br.push({ x: pr.x + dir * (2 + hash(seed, b * 8 + j, 300 + k) * 4), y: pr.y + 3 + hash(seed, b * 8 + j, 400) * 2 });
        }
        drawPath(br, 0, br.length - 1, bright ? 4 : 3, 0);
      }
    }
    // 落點：閃光、地面橢圓環、往上噴的火花
    if (t < 0.13) c.disc(bot.x, bot.y, 5 - t * 20, 5);
    const pr = span(t, 0.05, 0.4);
    if (pr > 0 && pr < 1) c.ring(bot.x, bot.y, 3 + 14 * ease.expoOut(pr), Math.max(1, 3 * (1 - pr)), pr < 0.5 ? 4 : 3, 0.35);
    for (let i = 0; i < 8; i++) {
      const age = t - 0.06;
      if (age < 0 || age > 0.35) continue;
      const a = -Math.PI / 2 + (hash(seed, i, 11) - 0.5) * 2.2, v = 50 + hash(seed, i, 12) * 50, s = drag(v, 7, age);
      c.put(bot.x + Math.cos(a) * s, bot.y + Math.sin(a) * s + 60 * age * age, age < 0.15 ? 5 : 3);
    }
  },
};

/** 螺旋火球：蓄力後加速衝出，兩股火繩繞核心旋轉；命中爆開。 */
const spiralFireball = {
  id: 'spiral-fireball', name: '螺旋火球', ref: 'Spiral Fireball', ramp: RAMPS.fire,
  w: 64, h: 64, fps: 15, duration: 1.0,
  draw(c, t, seed) {
    const cy = 30, x0 = 8, x1 = 50, hitT = 0.55;
    const xAt = (s) => x0 + (x1 - x0) * ease.power3In(span(s, 0.15, hitT));
    if (t < hitT) {
      const x = xAt(t);
      const charge = ease.backOut(span(t, 0, 0.15));
      const r = 1.5 + 2 * charge;
      // 蓄力：火星往核心收
      for (let i = 0; i < 8 && t < 0.15; i++) {
        const a = (i / 8) * TAU + hash(seed, i, 1), d = 12 * (1 - ease.power3In(span(t, 0, 0.15)));
        c.put(x + Math.cos(a) * d, cy + Math.sin(a) * d, 4);
      }
      // 尾巴火星
      for (let i = 0; i < 16; i++) {
        const te = 0.15 + i * 0.025, age = t - te;
        if (age < 0 || age > 0.28) continue;
        const ex = xAt(te) - drag(20 + hash(seed, i, 2) * 25, 6, age);
        const ey = cy + (hash(seed, i, 3) - 0.5) * 4 - 25 * age;
        c.put(ex, ey, age < 0.08 ? 4 : age < 0.18 ? 3 : 2);
      }
      // 兩股火繩：取過去的位置，前面亮、後面暗；轉到前方的那股更亮
      for (const ph of [0, Math.PI]) for (let j = 0; j < 12; j++) {
        const s = t - j * 0.018;
        if (s < 0.12) continue;
        const ang = s * 38 + ph;
        const amp = (4 + r) * (1 - j / 14);
        const front = Math.cos(ang) > 0 ? 1 : 0;
        c.put(xAt(s) - j * 0.6, cy + Math.sin(ang) * amp, Math.max(1, 5 - Math.floor(j / 3) + front - 1));
      }
      // 核心：3 層同心圓，飛行時沿速度方向拉長（smear）
      const stretch = span(t, 0.3, hitT) * 3;
      for (let k = 0; k <= Math.round(stretch); k++) {
        c.disc(x - k, cy, r + 1, 4); c.disc(x - k, cy, r, 5);
      }
      c.disc(x, cy, Math.max(1, r - 1.5), 6);
      return;
    }
    // 命中：閃光 → 火球膨脹冷卻 → 衝擊環 → 碎片
    const cx = x1, p = span(t, hitT, hitT + 0.25);
    if (t < hitT + 0.08) c.disc(cx, cy, 6 + 40 * (t - hitT), 6);
    const R = 3 + 10 * ease.expoOut(p) * (1 - 0.5 * span(t, 0.8, 1.0));
    const heat = 1 - span(t, hitT + 0.04, 0.95), erode = span(t, 0.82, 1.0), f = Math.round(t * 15);
    for (let y = Math.floor(cy - R - 2); y <= cy + R + 2; y++) for (let x = Math.floor(cx - R - 2); x <= cx + R + 2; x++) {
      const d = Math.hypot(x - cx, y - cy), a = Math.atan2(y - cy, x - cx);
      const Re = R * (0.8 + 0.35 * noise2(seed, a * 2.5 + 9, t * 8));
      if (d > Re || (erode > 0 && hash(seed, y * 64 + x, f) < erode)) continue;
      const v = clamp01((1 - d / Re) * 0.7 + heat * 0.8 - 0.15 + 0.2 * noise2(seed, x * 0.5, y * 0.5 - t * 10));
      c.put(x, y, 1 + Math.floor(v * 5.99));
    }
    const rp = span(t, hitT, hitT + 0.28);
    if (rp < 1) c.ring(cx, cy, 4 + 16 * ease.expoOut(rp), Math.max(1, 3 * (1 - rp)), rp < 0.6 ? 5 : 3);
    for (let i = 0; i < 9; i++) {
      const age = t - hitT;
      if (age > 0.4) continue;
      const a = hash(seed, i, 21) * TAU, s = drag(70 + hash(seed, i, 22) * 50, 6, age);
      c.put(cx + Math.cos(a) * s, cy + Math.sin(a) * s + 50 * age * age, age < 0.2 ? 5 : 3);
    }
  },
};

/** 電漿爆：粒子加速收進核心 → 一格大閃 → 細環高速擴張＋放射光刺 → 核心收縮。 */
const plasmaBurst = {
  id: 'plasma-burst', name: '電漿爆', ref: 'Plasma Ball', ramp: RAMPS.plasma,
  w: 64, h: 64, fps: 15, duration: 0.9,
  draw(c, t, seed) {
    const cx = 32, cy = 32, burstT = 0.35;
    if (t < burstT) {
      for (let i = 0; i < 18; i++) {
        const ts = hash(seed, i, 1) * 0.12, p = span(t, ts, burstT);
        if (t < ts) continue;
        const a = hash(seed, i, 2) * TAU + p * 1.5, d = 28 * (1 - ease.power3In(p));
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        c.put(x, y, p > 0.6 ? 5 : 3);
        c.put(x + Math.cos(a), y + Math.sin(a), 2);           // 拖尾 1 px
      }
      const pulse = (1 - ((t * 10) % 1)) ** 3;                    // 尖起慢落
      const r = 2 + 3 * span(t, 0, burstT) + pulse;
      c.disc(cx, cy, r + 1, 3); c.disc(cx, cy, r, 5); c.disc(cx, cy, Math.max(1, r - 2), 6);
      return;
    }
    const p = span(t, burstT, burstT + 0.4);
    if (t < burstT + 0.1) c.disc(cx, cy, 14 - (t - burstT) * 40, 6);
    if (p < 1) c.ring(cx, cy, 5 + 25 * ease.expoOut(p), Math.max(1, 4 * (1 - p)), p < 0.5 ? 5 : 3);
    const p2 = span(t, burstT + 0.08, burstT + 0.45);
    if (p2 > 0 && p2 < 1) c.ring(cx, cy, 3 + 15 * ease.expoOut(p2), 1, 3);
    const sp = span(t, burstT, burstT + 0.2);
    if (sp < 1) for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + hash(seed, 0, 5);
      const r0 = 4 + 10 * ease.expoOut(sp), r1 = r0 + 6 + 10 * (1 - sp);
      c.line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, sp < 0.5 ? 6 : 4);
    }
    const core = 4 * (1 - ease.power3In(span(t, burstT, burstT + 0.3)));
    if (core > 0.5) { c.disc(cx, cy, core + 1, 4); c.disc(cx, cy, core, 6); }
    for (let i = 0; i < 12; i++) {
      const age = t - burstT;
      if (age > 0.5) continue;
      const a = hash(seed, i, 31) * TAU, s = drag(90 + hash(seed, i, 32) * 60, 7, age);
      c.put(cx + Math.cos(a) * s, cy + Math.sin(a) * s, age < 0.2 ? 5 : age < 0.35 ? 3 : 2);
    }
  },
};

/** 火龍捲：上寬下窄的漏斗，火粒繞柱旋轉上升（轉到前面的較亮、下方較熱）；收尾向外散開。 */
const fireTornado = {
  id: 'fire-tornado', name: '火龍捲', ref: 'Fire Tornado', ramp: RAMPS.fire,
  w: 64, h: 64, fps: 12, duration: 1.4,
  draw(c, t, seed) {
    const cx = 32, base = 58;
    const grow = ease.backOut(span(t, 0, 0.3));
    const die = ease.power3In(span(t, 1.05, 1.4));
    const H = 50 * Math.min(1, grow);
    if (H < 1) return;
    const rAt = (h) => (2 + 15 * (h / H) ** 1.4) * (1 + die * 0.8);
    c.ring(cx, base, 6 + 6 * grow, 1, 2, 0.3);                 // 地面焦痕
    const f = Math.round(t * 12);
    for (let i = 0; i < 170; i++) {
      const h = (hash(seed, i, 1) * H + t * 34) % H;
      const ang = hash(seed, i, 2) * TAU + t * (10 - 5 * h / H);
      const depth = Math.sin(ang);
      if (die > 0 && hash(seed, i, 50 + f) < die) continue;
      const x = cx + Math.cos(ang) * rAt(h) + (noise2(seed, h * 0.15, t * 3) - 0.5) * 4;
      const y = base - h - depth * 1.5;
      const heat = 1 - h / H;
      const lv = Math.max(1, Math.min(6, 2 + Math.round(3 * heat) + (depth > 0.3 ? 1 : depth < -0.4 ? -1 : 0)));
      c.put(x, y, lv); c.put(x + (Math.cos(ang) > 0 ? -1 : 1), y, lv - 1); // 2 px 橫向拖影
    }
    // 柱心：底部最熱
    for (let h = 0; h < H * 0.5; h++) if (noise2(seed, h * 0.4, t * 9) > 0.35 && die < 0.5)
      c.put(cx + (noise2(seed, h * 0.3, t * 5) - 0.5) * 3, base - h, h < H * 0.2 ? 6 : 5);
    // 頂部甩出的火星
    for (let i = 0; i < 8; i++) {
      const per = 0.5, ph = (t + hash(seed, i, 7) * per) % per;
      if (t < 0.3 || die > 0.5) continue;
      const a = hash(seed, i, 8) < 0.5 ? Math.PI + 0.4 : -0.4;
      c.put(cx + Math.cos(a) * (rAt(H) + drag(40, 4, ph)), base - H + 2 - 20 * ph + 30 * ph * ph, ph < 0.2 ? 5 : 3);
    }
  },
};

/** 爆炸：一格白閃 → 火球膨脹上升並冷卻成煙（同一條色階往暗走）→ 地面衝擊環 → 碎片受重力。 */
const blast = {
  id: 'blast', name: '爆炸', ref: 'Mushroom Cloud', ramp: RAMPS.fire,
  w: 64, h: 64, fps: 12, duration: 1.25,
  draw(c, t, seed) {
    const cx = 32, ground = 58;
    if (t < 0.09) c.disc(cx, 42, 16, 6);
    const R = 4 + 13 * ease.expoOut(span(t, 0, 0.3));
    const cy = 42 - 14 * ease.power3Out(span(t, 0.08, 1.1));
    const heat = 1 - span(t, 0.08, 0.85), erode = span(t, 0.85, 1.25), f = Math.round(t * 12);
    // 菇柱
    if (t > 0.15) for (let y = Math.round(cy + R * 0.6); y <= ground; y++) {
      const wdt = 1.5 + 2 * span(t, 0.15, 0.4) + (ground - y) * 0.05;
      for (let x = Math.floor(cx - wdt); x <= cx + wdt; x++) {
        if (erode > 0 && hash(seed, y * 64 + x, f) < erode) continue;
        const v = clamp01(heat * 0.7 + 0.35 * noise2(seed, x * 0.6, y * 0.4 + t * 6));
        c.put(x, y, 1 + Math.floor(v * 3.99));
      }
    }
    // 火球 / 煙團
    for (let y = Math.floor(cy - R - 3); y <= cy + R + 3; y++) for (let x = Math.floor(cx - R - 4); x <= cx + R + 4; x++) {
      const dx = (x - cx) / 1.15, dy = y - cy, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const Re = R * (0.82 + 0.3 * noise2(seed, a * 3 + 5, t * 5));
      if (d > Re || (erode > 0 && hash(seed, y * 64 + x, f) < erode)) continue;
      const v = clamp01((1 - d / Re) * 0.55 + heat * 0.85 - 0.2 + 0.3 * noise2(seed, x * 0.35, y * 0.35 + t * 7));
      c.put(x, y, 1 + Math.floor(v * 5.99));
    }
    // 地面衝擊環（壓扁橢圓）
    const rp = span(t, 0.02, 0.5);
    if (rp < 0.95) c.ring(cx, ground, 4 + 26 * ease.expoOut(rp), Math.max(1, 3 * (1 - rp)), rp < 0.4 ? 5 : 3, 0.28);
    // 碎片
    for (let i = 0; i < 12; i++) {
      const age = t - 0.03;
      if (age > 0.9) continue;
      const a = -Math.PI / 2 + (hash(seed, i, 41) - 0.5) * 2.6, v = 60 + hash(seed, i, 42) * 70;
      const x = cx + Math.cos(a) * drag(v, 3, age), y = 44 + Math.sin(a) * drag(v, 3, age) + 70 * age * age;
      if (y > ground) continue;
      c.put(x, y, age < 0.25 ? 5 : age < 0.55 ? 3 : 2);
    }
  },
};

export const EFFECTS = [slash, sparkBolt, spiralFireball, plasmaBurst, fireTornado, blast];
