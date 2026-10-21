// Placeholder art (gdd/02_art_spec.md §3.3): every frame the spec lists, drawn with Canvas 2D into ONE
// atlas (one texture source -> characters, effects and markers batch into a single draw call), plus the
// dojo background. Frame names, cell sizes and anchors match the spec, so the AI-generated atlas can
// replace this module without touching render logic. 0 bytes of image files.
import { Texture, Rectangle } from 'pixi.js';
import { PAL } from './palette.js';

const OUT = 7;                                         // outline width (half of it shows outside the fill)
const TAU = Math.PI * 2;

function shape(g, fill, build, out = OUT) {
  g.beginPath(); build();
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.lineWidth = out; g.strokeStyle = PAL.ink; g.stroke();
  g.fillStyle = fill; g.fill();
}
const circle = (g, x, y, r, fill) => shape(g, fill, () => g.arc(x, y, r, 0, TAU));
const ellipse = (g, x, y, rx, ry, fill, rot = 0) => shape(g, fill, () => g.ellipse(x, y, rx, ry, rot, 0, TAU));
function limb(g, x1, y1, x2, y2, w, color) {
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
  g.lineWidth = w + OUT; g.strokeStyle = PAL.ink; g.stroke();
  g.lineWidth = w; g.strokeStyle = color; g.stroke();
}
function eyes(g, kind, pts, r = 7) {
  g.lineWidth = 4; g.strokeStyle = PAL.ink; g.fillStyle = PAL.ink; g.lineCap = 'round';
  for (const [x, y] of pts) {
    g.beginPath();
    if (kind === 'open') { g.ellipse(x, y, r * 0.8, r * 1.15, 0, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 2, y - 4, r * 0.32, 0, TAU); g.fill(); g.fillStyle = PAL.ink; }
    else if (kind === 'shut') { g.moveTo(x - r, y); g.quadraticCurveTo(x, y + r * 0.8, x + r, y); g.stroke(); }
    else if (kind === 'happy') { g.moveTo(x - r, y + 2); g.quadraticCurveTo(x, y - r, x + r, y + 2); g.stroke(); }
    else if (kind === 'x') { g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke(); }
    else { for (let a = 0; a < 4 * Math.PI; a += 0.3) { const rr = (a / (4 * Math.PI)) * r * 1.2; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.lineWidth = 3; g.stroke(); }
  }
}
function star(g, x, y, R, r, fill) {
  shape(g, fill, () => { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : R; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); }, 5);
}
function paw(g, x, y, s, fill) {
  ellipse(g, x, y + 6 * s, 15 * s, 12 * s, fill);
  for (const [dx, dy] of [[-15, -10], [-5, -18], [6, -18], [16, -10]]) circle(g, x + dx * s, y + dy * s, 6 * s, fill);
}

// ---------------- hero: Master Miao (256 cell, feet at y 243) ----------------
const CAT_POSES = {
  idle_a: { lean: 0, front: [176, 158], back: [104, 156], legF: [150, 243], legB: [104, 243], eyes: 'open' },
  idle_b: { lean: 0, lift: -4, front: [178, 152], back: [104, 150], legF: [150, 243], legB: [104, 243], eyes: 'open', tailUp: true },
  jab: { lean: 0.14, front: [238, 150], back: [118, 160], legF: [172, 243], legB: [82, 243], eyes: 'open' },
  kick: { lean: -0.16, front: [118, 128], back: [92, 150], legF: [238, 176], legB: [116, 243], eyes: 'open' },
  palm: { lean: 0.2, front: [230, 168], back: [110, 162], legF: [168, 243], legB: [86, 243], eyes: 'open', open: true },
  whiff: { lean: 0.38, front: [214, 214], back: [130, 196], legF: [176, 243], legB: [92, 238], eyes: 'swirl', sweat: true },
  hurt: { lean: -0.32, front: [118, 108], back: [86, 120], legF: [140, 243], legB: [92, 243], eyes: 'shut' },
  win: { lean: -0.05, front: [168, 52], back: [100, 168], legF: [146, 243], legB: [108, 243], eyes: 'happy', tailUp: true },
  ko: { lean: -0.1, sit: 40, front: [176, 214], back: [90, 214], legF: [226, 243], legB: [196, 243], eyes: 'swirl' },
};
function drawCat(g, p) {
  const sit = p.sit ?? 0, hipX = 128, hipY = 200 + sit;
  // tail
  limb(g, 92, hipY - 6, p.tailUp ? 50 : 44, p.tailUp ? hipY - 70 : hipY - 30, 13, PAL.tabby);
  // legs (not leaned)
  limb(g, hipX - 12, hipY + 4, p.legB[0], p.legB[1] - 6, 22, PAL.dogi);
  g.save(); g.translate(hipX, hipY); g.rotate(p.lean); g.translate(-hipX, -hipY + (p.lift ?? 0));
  const sh = [150, 160 + sit], shB = [110, 162 + sit];
  limb(g, shB[0], shB[1], p.back[0], p.back[1] + (p.lean ? 0 : 0), 20, PAL.dogi);
  circle(g, p.back[0], p.back[1], 12, PAL.cream);
  ellipse(g, 128, 172 + sit, 48, 46, PAL.dogi);                       // gi body
  shape(g, PAL.belt, () => g.rect(82, 186 + sit, 92, 12), 5);
  limb(g, 150, 196 + sit, 158, 222 + sit, 6, PAL.belt);
  // head
  shape(g, PAL.tabby, () => { g.moveTo(84, 92 + sit); g.lineTo(96, 40 + sit); g.lineTo(122, 64 + sit); g.closePath(); });
  shape(g, PAL.tabby, () => { g.moveTo(134, 60 + sit); g.lineTo(162, 36 + sit); g.lineTo(170, 84 + sit); g.closePath(); });
  circle(g, 132, 104 + sit, 56, PAL.tabby);
  g.strokeStyle = PAL.tabbyDark; g.lineWidth = 6;
  for (const x of [112, 128, 144]) { g.beginPath(); g.moveTo(x, 54 + sit); g.lineTo(x + 2, 72 + sit); g.stroke(); }
  ellipse(g, 166, 124 + sit, 26, 20, PAL.cream);
  eyes(g, p.eyes, [[146, 100 + sit], [172, 100 + sit]]);
  circle(g, 186, 118 + sit, 5, PAL.pink);
  if (p.sweat) shape(g, PAL.sky, () => { g.moveTo(96, 62 + sit); g.quadraticCurveTo(84, 82 + sit, 96, 86 + sit); g.quadraticCurveTo(108, 82 + sit, 96, 62 + sit); }, 4);
  // front arm
  limb(g, sh[0], sh[1], p.front[0], p.front[1], 20, PAL.dogi);
  if (p.open) paw(g, p.front[0], p.front[1], 0.9, PAL.cream); else circle(g, p.front[0], p.front[1], 14, PAL.cream);
  g.restore();
  limb(g, hipX + 14, hipY + 4, p.legF[0], p.legF[1] - 6, 22, PAL.dogi);
  ellipse(g, p.legF[0] + 4, p.legF[1] - 6, 14, 8, PAL.cream);
}

// ---------------- enemies ----------------
function drawMouse(g, pose) {
  g.save();
  if (pose === 'hit') { g.translate(80, 100); g.rotate(-0.7); g.translate(-80, -100); }
  const a = pose === 'run_a', up = pose === 'run_b' ? -4 : 0;
  limb(g, 50, 120 + up, 14, 92 + up, 6, PAL.pink);                       // tail
  limb(g, 70, 132 + up, a ? 56 : 86, 150, 12, PAL.mouseDark);            // back leg
  circle(g, 50, 102 + up, 16, '#e7d3a8');                                 // sack
  ellipse(g, 78, 116 + up, 36, 28, PAL.mouse);
  limb(g, 90, 134 + up, a ? 104 : 72, 150, 12, PAL.mouseDark);           // front leg
  circle(g, 96, 62 + up, 18, PAL.mouse); circle(g, 96, 62 + up, 9, PAL.pink);
  circle(g, 120, 94 + up, 28, PAL.mouse);
  circle(g, 128, 66 + up, 16, PAL.mouse); circle(g, 128, 66 + up, 8, PAL.pink);
  shape(g, PAL.ink, () => g.roundRect(104, 84 + up, 40, 14, 7), 2);       // thief mask
  eyes(g, pose === 'hit' ? 'x' : 'open', [[130, 91 + up]], 5);
  circle(g, 147, 100 + up, 5, PAL.pink);
  if (pose === 'hit') { star(g, 150, 50, 14, 6, PAL.star); star(g, 112, 36, 10, 4, PAL.star); }
  g.restore();
}
function drawSquirrel(g, pose) {
  g.save();
  if (pose === 'hit') { g.translate(80, 96); g.rotate(2.3); g.translate(-80, -96); }
  const down = pose === 'glide_b' ? 8 : 0;
  ellipse(g, 34, 70 - down, 24, 34, PAL.squirrel, -0.5);                  // tail
  shape(g, PAL.squirrelDark, () => { g.moveTo(48, 92); g.lineTo(112, 92); g.lineTo(122, 120 + down); g.lineTo(38, 120 + down); g.closePath(); });
  ellipse(g, 80, 98, 42, 18, PAL.squirrel);
  shape(g, PAL.cape, () => { g.moveTo(96, 84); g.lineTo(60, 76 - down); g.lineTo(70, 96); g.closePath(); }, 5);
  circle(g, 124, 90, 22, PAL.squirrel);
  shape(g, PAL.cape, () => g.roundRect(104, 74, 40, 10, 5), 4);
  circle(g, 114, 66, 9, PAL.squirrel);
  eyes(g, pose === 'hit' ? 'x' : 'open', [[134, 90]], 5);
  circle(g, 146, 98, 4, PAL.pink);
  g.restore();
}
function drawTanuki(g, pose) {
  g.save();
  if (pose === 'hit') { g.translate(112, 160); g.rotate(-0.35); g.translate(-112, -160); }
  const a = pose === 'walk_a', block = pose === 'block';
  limb(g, 84, 188, a ? 70 : 96, 210, 24, PAL.tanukiDark);
  ellipse(g, 52, 160, 22, 30, PAL.tanukiDark, 0.6);                       // tail
  circle(g, 108, 146, 62, PAL.tanuki);
  ellipse(g, 124, 160, 34, 40, '#e8d2b0');                                // belly
  limb(g, 132, 188, a ? 150 : 120, 210, 24, PAL.tanukiDark);
  circle(g, 92, 54, 14, PAL.tanukiDark); circle(g, 150, 54, 14, PAL.tanukiDark);
  circle(g, 124, 82, 46, PAL.tanuki);
  ellipse(g, 136, 84, 34, 16, PAL.tanukiDark);                            // mask
  eyes(g, pose === 'hit' ? 'swirl' : 'open', [[128, 82], [152, 82]], 6);
  ellipse(g, 160, 100, 14, 10, '#e8d2b0'); circle(g, 172, 98, 5, PAL.ink);
  if (block) { ellipse(g, 112, 102, 10, 8, PAL.pink); ellipse(g, 156, 106, 8, 6, PAL.pink); }
  if (pose !== 'hit') shape(g, PAL.leaf, () => { g.moveTo(118, 40); g.lineTo(128, 18); g.lineTo(134, 32); g.lineTo(146, 22); g.lineTo(140, 42); g.closePath(); }, 4);
  const sx = block ? 176 : 170, sy = block ? 118 : 150;                   // pot-lid shield
  circle(g, sx, sy, 34, PAL.wood); circle(g, sx, sy, 8, PAL.woodDark);
  g.restore();
}

// ---------------- effects & markers ----------------
const FX = {
  paw: g => paw(g, 48, 52, 1.5, PAL.tabby),
  star: g => star(g, 48, 50, 34, 15, PAL.star),
  fur: g => { circle(g, 38, 52, 16, PAL.tabby); circle(g, 56, 44, 14, PAL.tabby); circle(g, 56, 60, 12, PAL.tabby); },
  leaf: g => shape(g, PAL.leaf, () => { const pts = [[48, 12], [58, 36], [82, 30], [66, 52], [76, 78], [48, 62], [20, 78], [30, 52], [14, 30], [38, 36]]; pts.forEach(([x, y]) => g.lineTo(x, y)); g.closePath(); }, 5),
  sweat: g => shape(g, PAL.sky, () => { g.moveTo(48, 14); g.quadraticCurveTo(22, 58, 48, 76); g.quadraticCurveTo(74, 58, 48, 14); }, 5),
  birds: g => { g.lineWidth = 4; g.strokeStyle = PAL.ink; g.beginPath(); g.ellipse(48, 48, 40, 14, 0, 0, TAU); g.stroke(); for (const x of [14, 48, 82]) circle(g, x, 48 + (x === 48 ? 14 : 0), 8, PAL.star); },
};
const MISC = {
  shadow: [128, 32, g => { g.fillStyle = 'rgba(43,29,20,0.28)'; g.beginPath(); g.ellipse(64, 16, 62, 14, 0, 0, TAU); g.fill(); }],
  marker: [200, 44, g => { g.lineWidth = 6; g.strokeStyle = PAL.paper; g.fillStyle = 'rgba(246,236,214,0.22)'; g.beginPath(); g.roundRect(5, 5, 190, 34, 17); g.fill(); g.stroke(); }],
  arrow: [64, 64, g => { shape(g, PAL.paper, () => { g.moveTo(8, 18); g.lineTo(40, 18); g.lineTo(40, 6); g.lineTo(60, 32); g.lineTo(40, 58); g.lineTo(40, 46); g.lineTo(8, 46); g.closePath(); }, 6); paw(g, 24, 32, 0.55, PAL.tabby); }],
  slash: [200, 200, g => { g.fillStyle = '#fff'; g.beginPath(); g.arc(100, 100, 92, -1.2, 1.2); g.arc(70, 100, 80, 1.1, -1.1, true); g.closePath(); g.fill(); }],
  ring: [200, 200, g => { g.lineWidth = 12; g.strokeStyle = '#fff'; g.beginPath(); g.arc(100, 100, 90, 0, TAU); g.stroke(); }],
  dot: [16, 16, g => { g.fillStyle = '#fff'; g.beginPath(); g.arc(8, 8, 7, 0, TAU); g.fill(); }],
  glow: [320, 96, g => {                                    // soft floor glow under the hero (tinted per combo tier)
    g.save(); g.translate(0, 48); g.scale(1, 0.3);         // circle squashed into an ellipse 320 x 96
    const r = g.createRadialGradient(160, 0, 4, 160, 0, 158);
    r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.5, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, -160, 320, 320); g.restore();
  }],
  streak: [240, 14, g => {                                  // speed line: thick head, tapering tail
    const l = g.createLinearGradient(0, 0, 240, 0);
    l.addColorStop(0, 'rgba(255,255,255,0)'); l.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = l; g.beginPath(); g.moveTo(0, 7); g.lineTo(232, 1); g.arc(232, 7, 6, -Math.PI / 2, Math.PI / 2); g.lineTo(0, 7); g.fill();
  }],
};

/** Build the atlas. Returns { tex: { cat: {pose: Texture}, mouse, squirrel, tanuki, fx, misc } }. */
export function buildPlaceholderAtlas() {
  const items = [];
  const add = (group, name, w, h, draw) => items.push({ group, name, w, h, draw });
  for (const [k, p] of Object.entries(CAT_POSES)) add('cat', k, 256, 256, g => drawCat(g, p));
  for (const k of ['walk_a', 'walk_b', 'block', 'hit']) add('tanuki', k, 224, 224, g => drawTanuki(g, k));
  for (const k of ['run_a', 'run_b', 'hit']) add('mouse', k, 160, 160, g => drawMouse(g, k));
  for (const k of ['glide_a', 'glide_b', 'hit']) add('squirrel', k, 160, 160, g => drawSquirrel(g, k));
  for (const [k, d] of Object.entries(FX)) add('fx', k, 96, 96, d);
  for (const [k, [w, h, d]] of Object.entries(MISC)) add('misc', k, w, h, d);

  // shelf packing, 2 px gutters
  const W = 2048;
  let x = 0, y = 0, rowH = 0;
  for (const it of items) {
    if (x + it.w > W) { x = 0; y += rowH + 2; rowH = 0; }
    it.x = x; it.y = y; x += it.w + 2; rowH = Math.max(rowH, it.h);
  }
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = 2 ** Math.ceil(Math.log2(y + rowH));
  const g = canvas.getContext('2d');
  for (const it of items) { g.save(); g.translate(it.x, it.y); it.draw(g); g.restore(); }

  const base = Texture.from(canvas);
  const tex = {};
  for (const it of items) (tex[it.group] ??= {})[it.name] = new Texture({ source: base.source, frame: new Rectangle(it.x, it.y, it.w, it.h) });
  return { tex, canvas };
}

/** Dojo background, 720x1280 world units (bg.dojo placeholder). Floor line at y = 900. */
export function paintDojo() {
  const c = document.createElement('canvas');
  c.width = 720; c.height = 1280;
  const g = c.getContext('2d');
  const wall = g.createLinearGradient(0, 0, 0, 900);
  wall.addColorStop(0, '#e9d3ad'); wall.addColorStop(1, '#f3e4c6');
  g.fillStyle = wall; g.fillRect(0, 0, 720, 900);
  // round window with sunset
  const sun = g.createLinearGradient(0, 230, 0, 470);
  sun.addColorStop(0, '#ffb36b'); sun.addColorStop(1, '#ffd9a0');
  g.fillStyle = sun; g.beginPath(); g.arc(360, 350, 120, 0, TAU); g.fill();
  g.fillStyle = '#ff8d5c'; g.beginPath(); g.arc(360, 420, 46, Math.PI, 0); g.fill();
  g.lineWidth = 14; g.strokeStyle = PAL.woodDark; g.beginPath(); g.arc(360, 350, 120, 0, TAU); g.stroke();
  // shoji doors
  g.strokeStyle = 'rgba(154,95,50,0.55)'; g.lineWidth = 6;
  for (const x0 of [40, 520]) {
    g.fillStyle = PAL.paper; g.fillRect(x0, 300, 160, 600);
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(x0, 300 + i * 150); g.lineTo(x0 + 160, 300 + i * 150); g.stroke(); }
    for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(x0 + i * 80, 300); g.lineTo(x0 + i * 80, 900); g.stroke(); }
  }
  // beam, plaque, pillars, lanterns
  g.fillStyle = PAL.woodDark; g.fillRect(0, 250, 720, 30); g.fillRect(0, 0, 36, 900); g.fillRect(684, 0, 36, 900);
  g.fillStyle = PAL.wood; g.fillRect(260, 150, 200, 70); g.strokeStyle = PAL.woodDark; g.lineWidth = 8; g.strokeRect(260, 150, 200, 70);
  for (const x of [150, 570]) {
    g.strokeStyle = PAL.ink; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 280); g.lineTo(x, 320); g.stroke();
    g.fillStyle = '#f08a5d'; g.beginPath(); g.ellipse(x, 350, 26, 32, 0, 0, TAU); g.fill();
  }
  // floor
  const floor = g.createLinearGradient(0, 900, 0, 1280);
  floor.addColorStop(0, PAL.wood); floor.addColorStop(1, '#b77a43');
  g.fillStyle = floor; g.fillRect(0, 900, 720, 380);
  g.strokeStyle = 'rgba(122,74,38,0.35)'; g.lineWidth = 3;
  for (let y = 940; y < 1280; y += 56) { g.beginPath(); g.moveTo(0, y); g.lineTo(720, y); g.stroke(); }
  g.fillStyle = PAL.woodDark; g.fillRect(0, 896, 720, 8);
  const base = Texture.from(c);
  return base;
}
