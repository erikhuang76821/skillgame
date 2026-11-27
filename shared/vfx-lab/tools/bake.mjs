// 精靈圖產生腳本：用與預覽相同的純函式，把每個像素特效烘成橫向 PNG strip＋JSON（格數、幀率、尺寸）。
// 用法：node tools/bake.mjs [輸出目錄=out/pixel] [種子=1]
// 只在需要逐格手繪感、或要給不跑程式特效的環境時才烘；能用程式畫就不出貨圖檔（knowledge-base/18 §6-4）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { EFFECTS } from '../src/pixel/effects.js';
import { createCell, blit, quantize } from '../src/pixel/raster.js';

const outDir = process.argv[2] ?? 'out/pixel';
const seed = Number(process.argv[3] ?? 1);

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => { let c = ~0; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return ~c >>> 0; };
function chunk(type, data) {
  const b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
}
export function encodePng(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** 一個特效的所有格 → RGBA strip。 */
export function bakeStrip(fx, s = seed) {
  const frames = Math.ceil(fx.duration * fx.fps);
  const W = fx.w * frames, out = new Uint8Array(W * fx.h * 4), cell = createCell(fx.w, fx.h);
  for (let f = 0; f < frames; f++) {
    cell.clear();
    fx.draw(cell, quantize(f / fx.fps, fx.fps), s);
    blit(cell, fx.ramp, out, W, f * fx.w, 0);
  }
  return { rgba: out, width: W, height: fx.h, frames };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  mkdirSync(outDir, { recursive: true });
  let total = 0;
  for (const fx of EFFECTS) {
    const { rgba, width, height, frames } = bakeStrip(fx);
    const png = encodePng(rgba, width, height);
    writeFileSync(join(outDir, `${fx.id}.png`), png);
    writeFileSync(join(outDir, `${fx.id}.json`), JSON.stringify({ id: fx.id, ref: fx.ref, frameW: fx.w, frameH: fx.h, frames, fps: fx.fps, seed, scaleMode: 'nearest' }, null, 2));
    total += png.length;
    console.log(`${fx.id.padEnd(16)} ${String(frames).padStart(2)} 格 × ${fx.w}×${fx.h} @ ${fx.fps} fps  ${(png.length / 1024).toFixed(1)} KB`);
  }
  console.log(`✔ ${EFFECTS.length} 條 strip → ${outDir}（合計 ${(total / 1024).toFixed(1)} KB）`);
}
