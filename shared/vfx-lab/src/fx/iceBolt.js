// 冰矢特效模組（PixiJS 8 + GSAP 3）。畫面只由 iceBoltAt(plan, t) 決定；GSAP timeline 只負責時間與事件。
// 遊戲裡：起手呼叫 play()，sim 發出 hit 事件時呼叫 hit()；飛行秒數只是預覽，不能拿來結算。
import { Container, Graphics, Sprite } from 'pixi.js';
import { gsap } from 'gsap';
import { FEEL } from './feel.js';
import { planIceBolt, iceBoltAt } from './iceBoltState.js';

/** 共用貼圖：每個 renderer 產一次，dispose 不銷毀。 */
const texCache = new WeakMap();
function textures(renderer) {
  let t = texCache.get(renderer);
  if (t) return t;
  const glow = new Graphics()
    .circle(8, 8, 8).fill({ color: 0xffffff, alpha: 0.18 })
    .circle(8, 8, 5.5).fill({ color: 0xffffff, alpha: 0.45 })
    .circle(8, 8, 3).fill({ color: 0xffffff, alpha: 1 });
  const ring = new Graphics().circle(34, 34, 32).stroke({ width: 3, color: 0xffffff });
  const shard = new Graphics().poly([0, 3, 7, 0, 18, 3, 7, 6]).fill(0xffffff);
  t = {
    glow: renderer.generateTexture(glow),
    ring: renderer.generateTexture(ring),
    shard: renderer.generateTexture(shard),
  };
  glow.destroy(); ring.destroy(); shard.destroy();
  texCache.set(renderer, t);
  return t;
}

/** 把 FEEL 與畫質合成這次播放用的參數。 */
export function iceBoltParams(overrides = {}, quality = 'high') {
  const p = { ...FEEL.iceBolt, ...overrides };
  if (quality === 'low') Object.assign(p, FEEL.low);
  return p;
}

/**
 * @param {import('pixi.js').Renderer} renderer
 * @param {{from:{x,y}, to:{x,y}, seed?:number, quality?:'high'|'low', params?:object, onImpact?:Function, onEnd?:Function}} o
 */
export function createIceBolt(renderer, o) {
  const tex = textures(renderer);
  const p = iceBoltParams(o.params, o.quality);
  const plan = planIceBolt({ from: o.from, to: o.to, seed: o.seed ?? 1, p });

  const view = new Container();
  const mk = (texture, tint, anchor = 0.5) => {
    const s = new Sprite(texture);
    s.anchor.set(anchor, 0.5);
    s.tint = tint;
    s.blendMode = 'add';
    return s;
  };
  // 圖層名稱對應規格的 layers
  const layers = {
    trail: new Container({ label: 'trail' }),
    core: new Container({ label: 'core' }),
    'hit-flash': new Container({ label: 'hit-flash' }),
    'ice-shards': new Container({ label: 'ice-shards' }),
  };
  for (const c of Object.values(layers)) view.addChild(c);

  const trail = plan.p.trailSamples ? Array.from({ length: p.trailSamples }, () => layers.trail.addChild(mk(tex.glow, p.color))) : [];
  const coreGlow = layers.core.addChild(mk(tex.glow, p.color));
  const coreHot = layers.core.addChild(mk(tex.glow, p.coreColor));
  const ring = layers['hit-flash'].addChild(mk(tex.ring, p.color));
  const flashDot = layers['hit-flash'].addChild(mk(tex.glow, p.coreColor));
  const shards = plan.shards.map(() => layers['ice-shards'].addChild(mk(tex.shard, p.color, 0.4)));

  function render(t) {
    const s = iceBoltAt(plan, t);
    const c = s.core;
    for (const g of [coreGlow, coreHot]) {
      g.visible = c.visible; g.position.set(c.x, c.y); g.rotation = c.rotation;
    }
    const base = p.coreSize / 8;
    coreGlow.scale.set(base * 2.2 * c.stretch, base * 1.5);
    coreHot.scale.set(base * 1.4 * c.stretch, base * 0.7);
    // 拖尾：每段沿飛行方向拉長到接上下一段，看起來是連續光痕而不是一串點
    s.trail.forEach((d, i) => {
      const sp = trail[i];
      const prev = i === 0 ? c : s.trail[i - 1];
      const gap = Math.hypot(prev.x - d.x, prev.y - d.y);
      sp.visible = d.alpha > 0.01; sp.position.set(d.x, d.y); sp.alpha = d.alpha;
      sp.rotation = plan.dir;
      sp.scale.set(Math.max(base * d.scale, (gap / 16) * 1.6), base * 1.1 * d.scale);
    });
    const f = s.flash;
    ring.visible = flashDot.visible = f.visible;
    ring.position.set(f.x, f.y); ring.scale.set(f.ringScale); ring.alpha = f.ringAlpha;
    flashDot.position.set(f.x, f.y); flashDot.scale.set(f.dotScale); flashDot.alpha = f.dotAlpha;
    s.shards.forEach((d, i) => {
      const sp = shards[i];
      sp.visible = d.visible; sp.position.set(d.x, d.y); sp.rotation = d.rotation;
      sp.alpha = d.alpha; sp.scale.set(d.scale);
    });
    return s;
  }

  // 時間軸：一段空補間撐出總長，事件掛在標籤上；seek(t, true) 會抑制事件
  const tl = gsap.timeline({ paused: true, onUpdate: () => render(tl.time()) });
  tl.to({}, { duration: plan.end, ease: 'none' }, 0)
    .addLabel('impact', plan.impactAt)
    .call(() => o.onImpact?.(), null, 'impact')
    .call(() => o.onEnd?.(), null, plan.end);
  render(0);

  return {
    view, plan, layers, timeline: tl,
    duration: plan.end,
    play() { tl.restart(); return this; },
    pause() { tl.pause(); return this; },
    resume() { tl.resume(); return this; },
    /** 拖時間軸用：不觸發 onImpact / onEnd，畫面直接由 t 重建 */
    seek(t) { tl.pause(); tl.seek(t, true); return render(tl.time()); },
    /** 遊戲的 hit 事件：還在飛就直接跳到爆點（觸發 onImpact） */
    hit() { if (tl.time() < plan.impactAt) tl.seek('impact', false).play(); return this; },
    /** 目前畫面狀態（自檢用） */
    snapshot() { return iceBoltAt(plan, tl.time()); },
    dispose() {
      tl.kill();
      view.destroy({ children: true }); // 不帶 texture: true，共用貼圖保留
    },
  };
}
