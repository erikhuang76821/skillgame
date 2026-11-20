// 冰矢的畫面狀態 = f(時間, 參數, 種子)。不碰 Pixi / GSAP，不累積上一幀，所以任意 seek 都得到同一畫面。
// 規格：knowledge-base/assets/vfx-spec/examples/ice-bolt.json（projectile + trail + impact）。

/** render 專用的種子亂數（不得取用 sim 的亂數流）。 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const outCubic = (u) => 1 - (1 - u) ** 3;

/**
 * 依參數預先算好不隨時間變的東西（碎片的方向、速度、壽命）。
 * @param {{from:{x:number,y:number}, to:{x:number,y:number}, seed:number, p:object}} o
 */
export function planIceBolt({ from, to, seed, p }) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const dir = Math.atan2(dy, dx);
  const rnd = mulberry32(seed);
  const shards = [];
  for (let i = 0; i < p.shards; i++) {
    // 偏向飛行方向的扇形爆散，均分再抖動，避免擠成一團
    const base = dir + ((i + 0.5) / p.shards - 0.5) * Math.PI * 1.5;
    const ang = base + (rnd() - 0.5) * 0.5;
    const speed = p.shardSpeed[0] + rnd() * (p.shardSpeed[1] - p.shardSpeed[0]);
    const life = p.shardLife[0] + rnd() * (p.shardLife[1] - p.shardLife[0]);
    const size = 1 + rnd() * 0.7;
    shards.push({ ang, speed, life, size });
  }
  const impactAt = p.flightPreview;
  return {
    from, to, dir, len, nx: -dy / len, ny: dx / len, shards, p,
    impactAt,
    end: impactAt + p.clearAfterImpact,
  };
}

/** 飛行位置：略為加速（起速 0.6），可帶弧高。u = 0..1 */
export function flightPos(plan, u) {
  const e = u * (0.6 + 0.4 * u);
  const arc = 4 * u * (1 - u) * plan.p.arc;
  return {
    x: plan.from.x + (plan.to.x - plan.from.x) * e + plan.nx * arc,
    y: plan.from.y + (plan.to.y - plan.from.y) * e + plan.ny * arc,
  };
}

/**
 * @returns 各圖層在時間 t 的狀態（純資料，數字四捨五入前就決定好）
 */
export function iceBoltAt(plan, t) {
  const { p, impactAt } = plan;
  const flying = t < impactAt;
  const u = clamp01(t / impactAt);

  const core = flying
    ? { visible: true, ...flightPos(plan, u), rotation: plan.dir, alpha: 1, stretch: 1 + 1.6 * u }
    : { visible: false, x: plan.to.x, y: plan.to.y, rotation: plan.dir, alpha: 0, stretch: 1 };

  // 拖尾：回看 trailSpan 秒內的路徑點；命中後尾巴收向爆點並淡出
  const after = Math.max(0, t - impactAt);
  const trailFade = 1 - clamp01(after / 0.08);
  const trail = [];
  for (let k = 1; k <= p.trailSamples; k++) {
    const tk = Math.min(impactAt, Math.max(0, t - (k * p.trailSpan) / p.trailSamples));
    const w = 1 - k / (p.trailSamples + 1);
    const pos = flightPos(plan, clamp01(tk / impactAt));
    trail.push({ ...pos, alpha: t > 0 ? 0.75 * w * trailFade : 0, scale: 0.35 + 0.65 * w });
  }

  // 命中閃光：一個實心亮點＋一圈擴散環
  const ft = clamp01(after / p.flashTime);
  const flashOn = !flying && ft < 1;
  const flash = {
    visible: flashOn, x: plan.to.x, y: plan.to.y,
    ringScale: (p.flashRadius * (0.3 + 0.7 * outCubic(ft))) / 32,
    ringAlpha: flashOn ? 1 - ft : 0,
    dotScale: (p.flashRadius * 0.6 * (1 - ft)) / 8,
    dotAlpha: flashOn ? 1 - ft * ft : 0,
  };

  // 碎片：速度指數衰減 → 位移解析解 d(τ) = v(1 - e^{-kτ}) / k
  const k = p.shardDrag;
  const shards = plan.shards.map((s) => {
    const live = !flying && after < s.life;
    const d = (s.speed * (1 - Math.exp(-k * after))) / k;
    const a = clamp01(after / s.life);
    return {
      visible: live,
      x: plan.to.x + Math.cos(s.ang) * d,
      y: plan.to.y + Math.sin(s.ang) * d,
      rotation: s.ang,
      alpha: live ? 1 - a : 0,
      scale: s.size * (1 - 0.6 * a),
    };
  });

  return { t, flying, done: t >= plan.end, core, trail, flash, shards };
}
