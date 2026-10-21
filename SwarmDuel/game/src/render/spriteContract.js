// PixiJS adapter for the PokéSurvivor sprite contract (pokesurvivor-asset-dev skill,
// references/repo-contract.md): sheet columns = frames, rows = 8 facing directions,
// per-animation {w,h,n,r,d,ax,ay}, feet anchor, nearest-neighbour scaling, feet-Y depth sort.
import { Rectangle, Sprite, Texture } from 'pixi.js';

export const DIRECTIONS = Object.freeze([
  'down', 'down_right', 'right', 'up_right', 'up', 'up_left', 'left', 'down_left',
]);

export function assertMeta(m) {
  const int = v => Number.isInteger(v) && v > 0;
  if (!m || !int(m.w) || !int(m.h) || !int(m.n) || !int(m.r) ||
      !Array.isArray(m.d) || m.d.length !== m.n || !m.d.every(int) ||
      !(m.ax >= 0 && m.ax <= m.w) || !(m.ay >= 0 && m.ay <= m.h)) {
    throw new Error('Invalid animation metadata: expected w,h,n,r,d,ax,ay');
  }
  if (m.dirs && m.dirs.length !== m.r) throw new Error('dirs must list one direction per row');
}

// Returns textures[row][frame], cut with sourceRect = (frame*w, row*h, w, h).
export function sliceSheet(texture, meta) {
  assertMeta(meta);
  if (texture.width !== meta.w * meta.n || texture.height !== meta.h * meta.r) {
    throw new Error(`Sprite-sheet ${texture.width}x${texture.height} does not match metadata`);
  }
  const rows = [];
  for (let r = 0; r < meta.r; r++) {
    const frames = [];
    for (let f = 0; f < meta.n; f++) {
      frames.push(new Texture({ source: texture.source, frame: new Rectangle(f * meta.w, r * meta.h, meta.w, meta.h) }));
    }
    rows.push(frames);
  }
  return rows;
}

// Production sheets have the full 8 rows. Concept placeholders declare `dirs`
// (e.g. down,right,up,left); diagonals then fall back to the horizontal facing.
const DIAGONAL_FALLBACK = { down_right: 'right', up_right: 'right', up_left: 'left', down_left: 'left' };
export function rowFor(meta, dir8) {
  if (!meta.dirs) return Math.min(dir8, meta.r - 1);
  const name = DIRECTIONS[dir8];
  const i = meta.dirs.indexOf(name);
  return Math.max(0, i >= 0 ? i : meta.dirs.indexOf(DIAGONAL_FALLBACK[name]));
}

// Render-side only (the sim never calls atan2).
export function dirFromVector(dx, dy) {
  if (!dx && !dy) return 0;
  const angle = Math.atan2(dy, dx);
  return ((Math.round((Math.PI / 2 - angle) / (Math.PI / 4)) % 8) + 8) % 8;
}

// Advances by 1/60 s ticks, consuming d[frame] like the source animator.
export class Animator {
  constructor(meta) { this.meta = meta; this.frame = 0; this.ticks = 0; }
  advance(ticks) {
    const { d, n } = this.meta;
    this.ticks += ticks;
    while (this.ticks >= d[this.frame]) { this.ticks -= d[this.frame]; this.frame = (this.frame + 1) % n; }
    return this.frame;
  }
}

// Feet anchor -> normalised pivot (ax/w, ay/h); world position = feet point.
export function makeActor(rows, meta, artScale = 2) {
  const s = new Sprite(rows[0][0]);
  s.anchor.set(meta.ax / meta.w, meta.ay / meta.h);
  s.scale.set(artScale);
  return s;
}
