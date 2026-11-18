// Prototype art: every texture is drawn once at boot from Graphics (0 bytes of images). Shapes are white and
// tinted per kind, so the same texture batches for every unit. Real sprites replace these later (gdd/02).
import { Graphics, Container, Rectangle } from 'pixi.js';
import { CX, CY, SLOTS, WALL_R, GATES, SPAWN_R } from '../sim/sim.js';

export const COLORS = {
  ground: 0x1f2a4a, path: 0x2b375c, plaza: 0x35416a, lamp: 0xffb64a,
  worker: 0xd8c39a, archer: 0x6fd3c4, shield: 0x8fb3d9, priest: 0xb6f0a0,
  rat: 0x9a7be0, beetle: 0x6a4fb8, moth: 0xd0a8ff, shroom: 0xe07ab8, snail: 0x5b4a9a, wolf: 0x8c6ad8, shade: 0xb0e0ff,
  bossWeak: 0x8a5ad0, bossMini: 0x5e3fa8, boss: 0x3d2a7a, bossSuper: 0x6a1f5a,
  barracks: 0xc0763f, ranch: 0xd9a35b, mine: 0x7f8fa8, site: 0x6b6b7a,
  wall: [0, 0x9c7a4f, 0x8a8f9c, 0xc7d4e6], danger: 0xff5a5a, ally: 0x6fd3c4,
};

export function makeArt(renderer) {
  const tex = g => { const t = renderer.generateTexture(g); t.source.scaleMode = 'nearest'; return t; };   // true-pixel: no smoothing
  const art = {
    dot: tex(new Graphics().circle(16, 16, 16).fill(0xffffff)),
    disc: tex(new Graphics().circle(64, 64, 64).fill(0xffffff)),
    ring: tex(new Graphics().circle(128, 128, 126).stroke({ width: 4, color: 0xffffff })),
    body: tex(new Graphics().roundRect(0, 0, 28, 34, 10).fill(0xffffff).circle(14, 6, 9).fill(0xffffff)),
    foe: tex(new Graphics().ellipse(20, 16, 20, 14).fill(0xffffff).circle(10, 12, 3).fill(0x000000).circle(30, 12, 3).fill(0x000000)),
    wing: tex(new Graphics().poly([0, 14, 18, 0, 24, 14, 18, 28]).fill(0xffffff).poly([48, 14, 30, 0, 24, 14, 30, 28]).fill(0xffffff)),
    shell: tex(new Graphics().circle(30, 30, 30).fill(0xffffff).circle(30, 30, 18).stroke({ width: 5, color: 0x000000, alpha: 0.3 })),
    house: tex(new Graphics().rect(6, 26, 60, 40).fill(0xffffff).poly([0, 28, 36, 0, 72, 28]).fill(0xffffff).rect(28, 44, 16, 22).fill(0x000000)),
    wall: tex(new Graphics().roundRect(0, 0, 60, 16, 4).fill(0xffffff)),
    pip: tex(new Graphics().rect(0, 0, 10, 4).fill(0xffffff)),
    arrow: tex(new Graphics().poly([0, 0, 22, 10, 0, 20, 6, 10]).fill(0xffffff)),
    bolt: tex(new Graphics().rect(0, 0, 16, 3).fill(0xffffff)),
  };
  art.castle = tex(new Graphics()
    .rect(10, 60, 100, 70).fill(0x4a5578).rect(0, 40, 26, 90).fill(0x56628a).rect(94, 40, 26, 90).fill(0x56628a)
    .rect(40, 10, 40, 80).fill(0x606c96).circle(60, 30, 13).fill(COLORS.lamp).rect(50, 100, 20, 30).fill(0x1a1f36));
  art.ground = makeGround(renderer);
  art.groundOrigin = [G0X, G0Y];
  return art;
}

// The camera zooms out (main.js ZOOM), so the ground covers more than the 720x1280 view: [G0X, G0X + GW] x [G0Y, G0Y + GH].
const G0X = -520, G0Y = -560, GW = 1760, GH = 2400;
function makeGround(renderer) {
  const g = new Graphics().rect(G0X, G0Y, GW, GH).fill(COLORS.ground);
  for (let k = 0; k < GATES; k++) {
    const a = ((k * 32 + 192) & 255) * Math.PI * 2 / 256;   // render-only float math is fine
    g.moveTo(CX, CY).lineTo(CX + Math.cos(a) * SPAWN_R, CY + Math.sin(a) * SPAWN_R).stroke({ width: 46, color: COLORS.path });
  }
  g.circle(CX, CY, WALL_R + 26).fill({ color: 0x27325a });
  g.circle(CX, CY, 150).fill(COLORS.plaza);
  for (const [x, y] of SLOTS) g.circle(x, y, 26).stroke({ width: 2, color: 0xffffff, alpha: 0.18 });
  // a few trees at the rim (deterministic positions)
  for (let i = 0; i < 160; i++) {
    const a = i * 2.39996, r = 380 + (i * 37) % 520;
    const x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r * 1.3;
    if (x < G0X || x > G0X + GW || y < G0Y || y > G0Y + GH) continue;
    g.circle(x, y, 14 + (i % 4) * 4).fill({ color: 0x18213d });
  }
  const c = new Container(); c.addChild(g);
  return renderer.generateTexture({ target: c, frame: new Rectangle(G0X, G0Y, GW, GH) });   // paths run off-screen: keep the frame fixed
}
