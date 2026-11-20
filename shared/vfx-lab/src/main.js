// 預覽台：播放、暫停、拖時間軸、圖層開關、低畫質、路徑疊圖、正反向自檢。
import { Application, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import { createIceBolt } from './fx/iceBolt.js';
import { flightPos } from './fx/iceBoltState.js';
import { drawCallCounter } from './debug/drawCalls.js';

gsap.defaults({ duration: 0.25, ease: 'power2.out', overwrite: 'auto' });
gsap.ticker.lagSmoothing(500, 33);

const W = 960, H = 540;
const app = new Application();
await app.init({ width: W, height: H, background: 0x0a0f14, antialias: true, preference: 'webgl' });
const stage = document.getElementById('stage');
stage.appendChild(app.canvas);
const dc = drawCallCounter(app);

const $ = (id) => document.getElementById(id);
const from = { x: 140, y: 300 };
let to = { x: 780, y: 230 };
let impacts = 0;
let fx = null;

// 背景與錨點：施法者、目標（只是參照物，不是特效）
const props = new Graphics();
app.stage.addChild(props);
const guides = new Graphics();
function drawProps() {
  props.clear()
    .rect(0, 400, W, 140).fill(0x111922)
    .circle(from.x, from.y, 16).fill(0x3b4f63)
    .circle(to.x, to.y, 22).fill(0x4a3340);
}

function drawGuides() {
  guides.clear();
  if (!$('guides').checked || !fx) return;
  const pl = fx.plan;
  // 路徑取樣
  for (let i = 0; i <= 24; i++) {
    const s = flightPos(pl, i / 24);
    guides.circle(s.x, s.y, 1.5).fill(0xffe066);
  }
  guides.circle(pl.from.x, pl.from.y, 4).stroke({ width: 1, color: 0xffe066 });
  guides.circle(pl.to.x, pl.to.y, 22).stroke({ width: 1, color: 0xff6b6b }); // 判定形狀（示意：目標半徑）
}

function quality() { return $('low').checked ? 'low' : 'high'; }

function build(keepTime = true) {
  const t = fx ? fx.timeline.time() : 0;
  fx?.dispose();
  fx = createIceBolt(app.renderer, {
    from, to,
    seed: Number($('seed').value) || 1,
    quality: quality(),
    params: { flightPreview: Number($('flight').value), arc: Number($('arc').value) },
    onImpact: () => { impacts++; },
  });
  app.stage.addChild(fx.view);
  app.stage.addChild(guides);
  for (const cb of document.querySelectorAll('[data-layer]')) fx.layers[cb.dataset.layer].visible = cb.checked;
  $('scrub').max = String(Math.round(fx.duration * 1000));
  fx.seek(keepTime ? Math.min(t, fx.duration) : 0);
  drawGuides();
}

drawProps();
build(false);

// 控制
$('play').onclick = () => fx.play();
$('pause').onclick = () => fx.pause();
$('hit').onclick = () => { if (!fx.timeline.isActive()) fx.play(); fx.hit(); };
$('scrub').oninput = (e) => fx.seek(Number(e.target.value) / 1000);
for (const cb of document.querySelectorAll('[data-layer]')) cb.onchange = () => { fx.layers[cb.dataset.layer].visible = cb.checked; };
$('guides').onchange = drawGuides;
$('low').onchange = () => build();
$('seed').onchange = () => build();
$('flight').oninput = (e) => { $('flightOut').value = `${Number(e.target.value).toFixed(2)} s`; build(); };
$('arc').oninput = (e) => { $('arcOut').value = `${e.target.value} px`; build(); };
app.canvas.addEventListener('pointerdown', (e) => {
  const r = app.canvas.getBoundingClientRect();
  to = { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  drawProps();
  build(false);
  fx.play();
});

// 自檢：同種子，從 0.10 與 0.55 跳到 0.40，讀實際 Sprite 屬性比對；且不得觸發命中事件
function readView() {
  const out = [];
  fx.view.children.forEach((layer) => layer.children.forEach((s) => {
    out.push([s.visible ? 1 : 0, s.x.toFixed(3), s.y.toFixed(3), s.alpha.toFixed(4), s.scale.x.toFixed(4), s.rotation.toFixed(4)].join(','));
  }));
  return out.join('|');
}
$('selftest').onclick = () => {
  const before = impacts;
  fx.seek(0.10); fx.seek(0.40); const a = readView();
  fx.seek(0.55); fx.seek(0.40); const b = readView();
  fx.seek(0.95); fx.seek(0.40); const c = readView();
  const same = a === b && b === c;
  const quiet = impacts === before;
  const el = $('check');
  el.className = same && quiet ? 'ok' : 'bad';
  el.textContent = `${same ? '✔ 0.40 s 畫面一致' : '✘ 畫面不同'}；${quiet ? '✔ 未觸發命中事件' : '✘ 觸發了命中事件'}`;
  window.__selftest = { same, quiet };
};

// 每幀更新讀數
app.ticker.add(() => {
  const t = fx.timeline.time();
  $('time').value = `${t.toFixed(3)} s`;
  if (document.activeElement !== $('scrub')) $('scrub').value = String(Math.round(t * 1000));
  $('stats').textContent = `impact ${impacts} 次 · DC ${dc()} · 爆點 ${fx.plan.impactAt.toFixed(2)} s · 清除 ${fx.duration.toFixed(2)} s`;
});

if (import.meta.env.DEV) window.__lab = { app, get fx() { return fx; } };
