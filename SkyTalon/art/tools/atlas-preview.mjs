// Writes the sprite atlas as a PNG for review (art/preview/v8_atlas_x4.png): the same pixels the game draws at boot,
// enlarged 4x on a mid-tone background so light and dark sprites both read. Run from SkyTalon/:
//   node art/tools/atlas-preview.mjs
// The game ships no image file; this is a picture of what game/src/render/atlas.js draws, for the art review only.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

let grabbed = null;
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext() { return { createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }), putImageData: img => { grabbed = img; } }; } }) };
const { buildAtlas } = await import('../../game/src/render/atlas.js');
const { frames } = buildAtlas(), { data, width: W, height: H } = grabbed;

const S = 4, BG = [58, 106, 122], out = Buffer.alloc((W * S * 3 + 1) * H * S);
for (let y = 0; y < H * S; y++) {
  const row = y * (W * S * 3 + 1);
  out[row] = 0;                                              // PNG filter: none
  for (let x = 0; x < W * S; x++) {
    const i = ((y / S | 0) * W + (x / S | 0)) * 4, a = data[i + 3] / 255;
    for (let c = 0; c < 3; c++) out[row + 1 + x * 3 + c] = Math.round(data[i + c] * a + BG[c] * (1 - a));
  }
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, body) => { const len = Buffer.alloc(4), t = Buffer.from(type), sum = Buffer.alloc(4); len.writeUInt32BE(body.length); sum.writeUInt32BE(crc(Buffer.concat([t, body]))); return Buffer.concat([len, t, body, sum]); };
const head = Buffer.alloc(13); head.writeUInt32BE(W * S, 0); head.writeUInt32BE(H * S, 4); head[8] = 8; head[9] = 2;
const encode = (w, h, rgbRows) => { const hd = Buffer.alloc(13); hd.writeUInt32BE(w, 0); hd.writeUInt32BE(h, 4); hd[8] = 8; hd[9] = 2; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', hd), chunk('IDAT', deflateSync(rgbRows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]); };
const png = encode(W * S, H * S, out);
writeFileSync(new URL('../preview/v8_atlas_x4.png', import.meta.url), png);

// A second sheet for the review: the ship as flown (plain, fully geared, and in its space form) and the eight boss
// slots of leg one, each enlarged 6x.
{
  const K = 6, CW = 1180, CH = 800, img = new Uint8Array(CW * CH * 3);
  for (let i = 0; i < CW * CH; i++) img.set(BG, i * 3);
  const blit = (name, cx, cy, k = K) => { const fr = frames[name]; if (!fr) throw new Error('no frame ' + name); const x0 = Math.round(cx - fr.w * k / 2), y0 = Math.round(cy - fr.h * k / 2);
    for (let y = 0; y < fr.h * k; y++) for (let x = 0; x < fr.w * k; x++) { const i = ((fr.y + (y / k | 0)) * W + fr.x + (x / k | 0)) * 4; if (data[i + 3] < 128) continue; const X = x0 + x, Y = y0 + y; if (X < 0 || Y < 0 || X >= CW || Y >= CH) continue; img.set([data[i], data[i + 1], data[i + 2]], (Y * CW + X) * 3); } };
  blit('jet2', 150, 180);
  for (const n of ['gThrust3', 'jet2', 'gSpread3', 'gHeavy3', 'gRapid3', 'gPierce', 'gPlasma', 'gBarrier']) blit(n, 430, 180);

  for (const n of ['gThrust3', 'jet2', 'gSpread3', 'gHeavy3', 'gRapid3', 'gPierce', 'gPlasma', 'gBarrier']) blit(n, 710, 180);
  const rows = Buffer.alloc((CW * 3 + 1) * CH);
  for (let y = 0; y < CH; y++) { rows[y * (CW * 3 + 1)] = 0; Buffer.from(img.buffer, y * CW * 3, CW * 3).copy(rows, y * (CW * 3 + 1) + 1); }
  writeFileSync(new URL('../preview/v8_ships_x6.png', import.meta.url), encode(CW, CH, rows));
  console.log('ships -> art/preview/v8_ships_x6.png');
}
console.log(`atlas ${W}x${H}, ${Object.keys(frames).length} frames -> art/preview/v8_atlas_x4.png (${png.length} bytes)`);
