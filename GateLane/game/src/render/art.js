// All art is drawn in code at boot (0 bytes of image files). Original designs only — nothing from Last War.
// Every texture comes from generateTexture, so the world draws in one batch (Pixi 8 batches up to 16 sources).
import { Graphics, BitmapFont, Rectangle } from 'pixi.js';

export const FONT = 'GateLaneFont';
export const ROAD_TILE = { w: 720, h: 256 };

export function makeArt(renderer) {
  const tex = g => renderer.generateTexture({ target: g, resolution: 2, antialias: true });

  // Road: grass verges, kerbs, asphalt lane (x 60..660) with dashed centre line and side lines.
  const road = new Graphics()
    .rect(0, 0, 720, 256).fill(0x2c4a2f)
    .rect(40, 0, 20, 256).fill(0xd9dde2).rect(660, 0, 20, 256).fill(0xd9dde2)
    .rect(40, 0, 20, 32).fill(0xc8423a).rect(40, 128, 20, 32).fill(0xc8423a)
    .rect(660, 0, 20, 32).fill(0xc8423a).rect(660, 128, 20, 32).fill(0xc8423a)
    .rect(60, 0, 600, 256).fill(0x39414b)
    .rect(355, 0, 10, 96).fill({ color: 0xf2f2f2, alpha: 0.55 })
    .rect(64, 0, 4, 256).fill({ color: 0xf6c945, alpha: 0.7 }).rect(652, 0, 4, 256).fill({ color: 0xf6c945, alpha: 0.7 });
  for (let i = 0; i < 18; i++) road.circle(8 + ((i * 37) % 30), (i * 53) % 256, 3).fill({ color: 0x3f6a42, alpha: 0.8 });
  for (let i = 0; i < 14; i++) road.circle(688 + ((i * 29) % 26), (i * 71) % 256, 3).fill({ color: 0x3f6a42, alpha: 0.8 });

  // Soldier (blue team): helmet, body, rifle pointing up.
  const soldier = new Graphics()
    .roundRect(4, 10, 14, 14, 4).fill(0x2f7de1).stroke({ color: 0x0d2a52, width: 2 })
    .circle(11, 8, 6).fill(0xf1c79b).stroke({ color: 0x0d2a52, width: 2 })
    .roundRect(4, 1, 14, 6, 3).fill(0x2a5e2c)
    .rect(16, -2, 3, 14).fill(0x30353b);

  // Zombie: green, hunched, red eyes. Armored: steel plates and a bucket helmet.
  const zombieBody = (skin, shirt) => new Graphics()
    .roundRect(4, 14, 20, 18, 6).fill(shirt).stroke({ color: 0x1c1c1c, width: 2 })
    .circle(14, 11, 9).fill(skin).stroke({ color: 0x1c1c1c, width: 2 })
    .rect(0, 18, 6, 4).fill(skin).rect(22, 18, 6, 4).fill(skin)
    .circle(10, 10, 2).fill(0xff3030).circle(18, 10, 2).fill(0xff3030);
  const zombie = zombieBody(0x7fbf5a, 0x8a5a3c);
  const armored = zombieBody(0x6ea24f, 0x5b6470)
    .roundRect(3, 0, 22, 9, 3).fill(0x9aa3ad).stroke({ color: 0x1c1c1c, width: 2 })
    .rect(6, 20, 16, 4).fill(0xb7c0c9);

  // Barrel: red drum with hazard stripes and a white label plate for the HP number.
  const barrel = new Graphics()
    .roundRect(0, 0, 64, 72, 10).fill(0xc8322b).stroke({ color: 0x3a0d0b, width: 3 })
    .rect(0, 12, 64, 6).fill(0x8f1f1a).rect(0, 54, 64, 6).fill(0x8f1f1a)
    .roundRect(8, 24, 48, 24, 6).fill(0xf4efe6);

  // Gate panel (tinted per gate) and its posts.
  const panel = new Graphics().roundRect(0, 0, 280, 64, 12).fill({ color: 0xffffff, alpha: 0.42 }).stroke({ color: 0xffffff, width: 4 });
  const post = new Graphics().roundRect(0, 0, 14, 96, 6).fill(0xe8edf2).stroke({ color: 0x40464e, width: 2 });

  // Boss: hulking brute with a jaw and claws.
  const boss = new Graphics()
    .roundRect(10, 40, 140, 90, 30).fill(0x5d8a3d).stroke({ color: 0x14200e, width: 4 })
    .circle(80, 40, 38).fill(0x79ad4f).stroke({ color: 0x14200e, width: 4 })
    .rect(56, 52, 48, 10).fill(0xffffff).rect(62, 52, 4, 10).fill(0x14200e).rect(78, 52, 4, 10).fill(0x14200e).rect(94, 52, 4, 10).fill(0x14200e)
    .circle(66, 32, 6).fill(0xff2a2a).circle(94, 32, 6).fill(0xff2a2a)
    .roundRect(0, 80, 26, 46, 10).fill(0x79ad4f).stroke({ color: 0x14200e, width: 4 })
    .roundRect(134, 80, 26, 46, 10).fill(0x79ad4f).stroke({ color: 0x14200e, width: 4 });

  const bullet = new Graphics().roundRect(0, 0, 6, 18, 3).fill(0xffe27a);
  const shadow = new Graphics().ellipse(0, 0, 16, 6).fill({ color: 0x000000, alpha: 0.28 });

  BitmapFont.install({
    name: FONT,
    style: { fontFamily: 'system-ui, sans-serif', fontSize: 44, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x101418, width: 8, join: 'round' } },
    chars: [['0', '9'], '+-×xLvMA●○ '],
    resolution: 2,
  });

  return {
    road: renderer.generateTexture({ target: road, frame: new Rectangle(0, 0, ROAD_TILE.w, ROAD_TILE.h), resolution: 1, antialias: false }), soldier: tex(soldier), zombie: tex(zombie), armored: tex(armored), barrel: tex(barrel),
    panel: tex(panel), post: tex(post), boss: tex(boss), bullet: tex(bullet), shadow: tex(shadow),
  };
}
