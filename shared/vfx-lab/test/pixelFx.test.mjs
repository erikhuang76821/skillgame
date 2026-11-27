import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { EFFECTS } from '../src/pixel/effects.js';
import { createCell, blit } from '../src/pixel/raster.js';
import { bakeStrip, encodePng } from '../tools/bake.mjs';

const render = (fx, t, seed = 1) => { const c = createCell(fx.w, fx.h); fx.draw(c, t, seed); return c.lv; };

for (const fx of EFFECTS) {
  test(`${fx.id}: pure function of (t, seed) — scrubbing back and forth gives the same frame`, () => {
    const mid = fx.duration * 0.4;
    const a = render(fx, mid);
    render(fx, fx.duration * 0.9);
    assert.deepEqual(render(fx, mid), a);
  });

  test(`${fx.id}: draws something at its peak and only uses its ramp levels`, () => {
    let peak = 0;
    for (let f = 0; f < fx.duration * fx.fps; f++) {
      const lv = render(fx, f / fx.fps);
      peak = Math.max(peak, lv.reduce((n, v) => n + (v > 0), 0));
      for (const v of lv) assert.ok(v <= fx.ramp.length, `level ${v} > ramp ${fx.ramp.length}`);
    }
    assert.ok(peak > 40, `peak ${peak} px`);
  });

  test(`${fx.id}: ends clean (last frame nearly empty, effect does not linger)`, () => {
    const lv = render(fx, fx.duration);
    assert.ok(lv.reduce((n, v) => n + (v > 0), 0) < 20);
  });

  test(`${fx.id}: baked pixels are hard-edged (alpha only 0 or 255)`, () => {
    const { rgba } = bakeStrip(fx);
    for (let i = 3; i < rgba.length; i += 4) assert.ok(rgba[i] === 0 || rgba[i] === 255);
  });
}

test('effects never call Math.random or Date', () => {
  for (const f of ['effects.js', 'raster.js']) {
    const src = readFileSync(new URL(`../src/pixel/${f}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /Math\.random|Date\b|document|window/);
  }
});

test('PNG encoder writes a valid signature and IHDR size', () => {
  const c = createCell(2, 1); c.put(0, 0, 1);
  const out = new Uint8Array(8); blit(c, [0xff0000], out, 2, 0, 0);
  const png = encodePng(out, 2, 1);
  assert.deepEqual([...png.subarray(1, 4)], [80, 78, 71]);
  assert.equal(png.readUInt32BE(16), 2);
});
