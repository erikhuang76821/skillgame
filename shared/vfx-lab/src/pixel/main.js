// 像素特效預覽：6 格 atlas → 一張 BufferImageSource（nearest）→ 一個 Sprite，整數倍放大。
import { Application, BufferImageSource, Graphics, Sprite, Texture } from 'pixi.js';
import { EFFECTS } from './effects.js';
import { createCell, blit, quantize } from './raster.js';
import { drawCallCounter } from '../debug/drawCalls.js';

const COLS = 3, CELL = 64, GAP_S = 0.45;                 // 每輪播完空 0.45 s 再重播
const ROWS = Math.ceil(EFFECTS.length / COLS);
const AW = COLS * CELL, AH = ROWS * CELL;
const $ = (id) => document.getElementById(id);

const app = new Application();
await app.init({ width: AW * 4, height: AH * 4, background: 0x07090d, antialias: false, roundPixels: true, resolution: 1, autoDensity: false, preference: 'webgl' });
$('stage').appendChild(app.canvas);
const dc = drawCallCounter(app);

const pixels = new Uint8Array(AW * AH * 4);
const source = new BufferImageSource({ resource: pixels, width: AW, height: AH, format: 'rgba8unorm', alphaMode: 'no-premultiply-alpha', scaleMode: 'nearest' });
const grid = new Graphics();
const sprite = new Sprite(new Texture({ source }));
app.stage.addChild(grid, sprite);

const cells = EFFECTS.map((fx, i) => ({ fx, cell: createCell(fx.w, fx.h), ox: (i % COLS) * CELL, oy: Math.floor(i / COLS) * CELL, frame: -2 }));
const scratch = createCell(CELL, CELL);
const tags = cells.map(() => { const d = document.createElement('div'); d.className = 'tag'; $('stage').appendChild(d); return d; });

let S = 4, seed = 1, speed = 1, playing = true, clock = 0, stress = 1;
function layout() {
  app.renderer.resize(AW * S, AH * S);
  sprite.scale.set(S);
  grid.clear();
  cells.forEach((c, i) => {
    grid.rect(c.ox * S, c.oy * S, CELL * S, CELL * S).fill((i + Math.floor(i / COLS)) % 2 ? 0x0c1118 : 0x10161f);
    Object.assign(tags[i].style, { left: `${c.ox * S + 6}px`, top: `${c.oy * S + 6}px` });
    c.frame = -2;
  });
}

// 量測：最近 120 tick 的光柵耗時
const rasterMs = [];
function step() {
  const t0 = performance.now();
  let dirty = false;
  for (const c of cells) {
    const { fx } = c, period = fx.duration + GAP_S;
    const local = clock % period;
    const frame = local < fx.duration ? Math.floor(local * fx.fps + 1e-6) : -1;
    if (frame === c.frame && !$('force').checked) continue;
    c.frame = frame;
    c.cell.clear();
    if (frame >= 0) {
      const t = quantize(local, fx.fps);
      fx.draw(c.cell, t, seed);
      for (let k = 1; k < stress; k++) { scratch.clear(); fx.draw(scratch, t, seed + k); }
    }
    blit(c.cell, fx.ramp, pixels, AW, c.ox, c.oy);
    dirty = true;
  }
  if (dirty) source.update();
  rasterMs.push(performance.now() - t0);
  if (rasterMs.length > 120) rasterMs.shift();
}

app.ticker.add((tk) => {
  if (playing) clock += (tk.deltaMS / 1000) * speed;
  step();
  cells.forEach((c, i) => {
    const n = Math.ceil(c.fx.duration * c.fx.fps);
    tags[i].innerHTML = `<b>${c.fx.name}</b> ${c.fx.id} · ${c.fx.fps} fps · ${c.frame < 0 ? '—' : c.frame + 1}/${n}`;
  });
});

// 讀數每 0.5 s 更新一次（避免讀數本身吃效能）
setInterval(() => {
  const avg = rasterMs.reduce((a, b) => a + b, 0) / Math.max(1, rasterMs.length);
  const max = Math.max(0, ...rasterMs);
  const fps = app.ticker.FPS;
  const ok = fps >= 55 && max < 8 && dc() <= 2;
  $('stats').textContent = `FPS ${fps.toFixed(1)} · 光柵 avg ${avg.toFixed(2)} ms / max ${max.toFixed(2)} ms · DC ${dc()} · atlas ${AW}×${AH} ×${S} nearest`;
  const v = $('verdict');
  v.className = ok ? 'ok' : 'bad';
  v.textContent = ok ? '✔ 60 fps 內、DC ≤ 2' : '✘ 掉幀或光柵過重';
  window.__pixelLab = { fps, avg, max, dc: dc(), S, stress, scaleMode: source.scaleMode };
}, 500);

$('play').onclick = () => { playing = !playing; $('play').textContent = playing ? '⏸ 暫停' : '▶ 播放'; };
$('speed').onchange = (e) => { speed = Number(e.target.value); };
$('scale').onchange = (e) => { S = Number(e.target.value); layout(); };
$('seed').onchange = (e) => { seed = Number(e.target.value) || 1; cells.forEach((c) => { c.frame = -2; }); };
$('stress').oninput = (e) => { stress = Number(e.target.value); $('stressOut').textContent = String(stress); };

layout();
if (import.meta.env.DEV) window.__lab = { app, cells, source };
