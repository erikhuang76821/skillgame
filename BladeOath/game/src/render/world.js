// BladeOath world view, v5 side-scroller (render only; reads the sim, never writes it). Placeholder scenery until N6.
// - each stage is baked once into two strips: a far layer (sky, ridges; parallax) and the near layer (back wall + floor band)
// - every fighter is a procedural skeleton (render/rig.js) posed from the sim's move timeline, drawn at
//   screen (x − camera, FLOOR_TOP + y − z); nearer the camera (larger y) draws in front
// - telegraphs are drawn from the sim's own hit shape (telegraph = judgement): the stretch along the facing, as thick as
//   the line a hit needs (DEPTH_HIT), on the floor
// - blade trails follow the weapon tip during active ticks; slams leave a crack
import { Container, Graphics, Sprite, Texture, Rectangle } from 'pixi.js';
import {
  S, FOES, STAGES, PROPS, VIEW_W, VIEW_H, DEPTH, DEPTH_HIT, FLOOR_TOP, SHRINE_X, playerMove, foeMove, fdir,
} from '../sim/sim.js';
import { FEEL } from '../fx/feel.js';
import { Rig, poseOf } from './rig.js';
import { stageStrips } from './scenery.js';
import { CelActor } from './cel.js';

const PX = 256, FAR = 0.45;                          // far layer scrolls at 45 % of the camera
export const FOE_COLOR = [0xa89a7c, 0x8fb069, 0x6f9a8e, 0x9b7a6a, 0x7fbf6a, 0xb86a5a, 0xb48fd8];
const FOE_LOOK = [
  { scale: 1, bulk: 1, weaponLen: 14 }, { scale: 0.55, bulk: 1.3, weaponLen: 4 }, { scale: 1, bulk: 0.9, weaponLen: 18 },
  { scale: 1.45, bulk: 1.3, weaponLen: 8 }, { scale: 1.5, bulk: 1.4, weaponLen: 10 }, { scale: 1.7, bulk: 1.2, weaponLen: 22 },
  { scale: 1.75, bulk: 1, weaponLen: 26 },
];
const PLAYER_COLOR = 0x6fb4c8;
// stage palettes: sky top, sky low, ridge, wall, floor (ink-indigo, away from the reserved white / gold / red)
const LOOK = {
  gate: [0x1b2130, 0x3a3b4a, 0x2a2f3c, 0x3c3d44, 0x4a4b4e], forest: [0x142026, 0x2a3c3a, 0x1d2d2a, 0x2c3b35, 0x3a4a40],
  well: [0x191d24, 0x34383e, 0x262a31, 0x3a3a3d, 0x47464a], hall: [0x1a1418, 0x3a2a2c, 0x2a1d20, 0x3d2c2c, 0x4a3a38],
  cloister: [0x161a24, 0x2e3546, 0x222838, 0x343a48, 0x424858], terrace: [0x17141f, 0x332c44, 0x251f33, 0x352e45, 0x433b52],
};
const shade = (c, k) => (Math.min(255, ((c >> 16) & 255) * k) << 16) | (Math.min(255, ((c >> 8) & 255) * k) << 8) | Math.min(255, (c & 255) * k);
const noise = (i, salt) => { let h = (i * 374761393 + salt * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

function bake(renderer, draw, w, h) {
  const g = new Graphics(); draw(g);
  const tex = renderer.generateTexture({ target: g, frame: new Rectangle(0, 0, w, h) });
  tex.source.scaleMode = 'nearest'; g.destroy();
  return tex;
}
/** Far layer: sky bands and two ridge lines. */
function bakeFar(renderer, st) {
  const [top, low, ridge] = LOOK[st.id], w = Math.ceil(st.len * FAR) + VIEW_W + 8, h = FLOOR_TOP;
  return bake(renderer, g => {
    for (let i = 0; i < 8; i++) { const k = i / 7; g.rect(0, (i * h) / 8, w, h / 8 + 1).fill(((((top >> 16) * (1 - k) + (low >> 16) * k) & 255) << 16) | (((((top >> 8) & 255) * (1 - k) + ((low >> 8) & 255) * k) & 255) << 8) | ((top & 255) * (1 - k) + (low & 255) * k)); }
    for (const [base, amp, col, salt] of [[h - 46, 26, shade(ridge, 1.15), 3], [h - 22, 16, ridge, 7]]) {
      const pts = [0, h];
      for (let x = 0; x <= w; x += 12) pts.push(x, base - amp * (0.5 + 0.5 * Math.sin(x / 70 + salt)) * (0.6 + 0.4 * noise(x >> 4, salt)));
      pts.push(w, h); g.poly(pts).fill(col);
    }
  }, w, h);
}
/** Near layer: the back wall above the floor band, and the floor band itself (stone courses that recede in depth). */
function bakeNear(renderer, st) {
  const [, , , wall, floor] = LOOK[st.id], w = st.len, top = FLOOR_TOP - 34, h = VIEW_H - top;
  return bake(renderer, g => {
    g.rect(0, 0, w, 34).fill(wall);
    for (let x = 0; x < w; x += 96) {                                     // pillars / trunks on the back wall
      const px = x + Math.floor(noise(x, 11) * 50);
      g.rect(px, 0, 10, 34).fill(shade(wall, 0.72)); g.rect(px - 2, 30, 14, 4).fill(shade(wall, 0.6));
    }
    g.rect(0, 32, w, 2).fill(shade(wall, 0.5));
    for (let r = 0; r < 6; r++) {                                         // floor courses: darker far, lighter near
      const y0 = 34 + (r * DEPTH) / 6, k = 0.82 + r * 0.05;
      g.rect(0, y0, w, DEPTH / 6 + 1).fill(shade(floor, k));
      for (let x = (r & 1) * 14; x < w; x += 28) g.rect(x, y0, 1, DEPTH / 6).fill(shade(floor, k * 0.8));
    }
    g.rect(0, 34 + DEPTH, w, h - 34 - DEPTH).fill(shade(floor, 0.55));   // front lip below the band
  }, w, h);
}

function shapes(renderer) {
  const make = (draw, w, h) => bake(renderer, draw, w, h);
  return {
    px: Texture.WHITE,
    dot: make(g => g.circle(8, 8, 8).fill(0xffffff), 16, 16),
    ring: make(g => g.circle(14, 14, 12).stroke({ width: 2, color: 0xffffff }), 28, 28),
    mound: make(g => { g.rect(2, 10, 14, 8).fill(0x8a8578); g.rect(7, 0, 3, 12).fill(0xb8c2cc); }, 18, 18),
    chest: make(g => g.rect(0, 0, 16, 11).fill(0xffffff), 16, 11),
    jar: make(g => { g.ellipse(7, 11, 7, 8).fill(0x7a5a3c); g.rect(4, 0, 6, 4).fill(0x5a4030); }, 14, 19),
    crate: make(g => { g.rect(0, 0, 20, 16).fill(0x6e5536); g.rect(0, 7, 20, 2).fill(0x4e3b26); g.rect(9, 0, 2, 16).fill(0x4e3b26); }, 20, 16),
    lamp: make(g => { g.rect(4, 6, 6, 22).fill(0x6c6f78); g.rect(1, 0, 12, 7).fill(0x8a8e98); g.rect(2, 26, 10, 4).fill(0x55585f); }, 14, 30),
    stele: make(g => { g.rect(0, 4, 24, 26).fill(0x5d6068); g.poly([0, 4, 10, 0, 24, 6, 24, 10]).fill(0x0c0f14); g.rect(4, 12, 16, 1).fill(0x45474e); }, 24, 30),
    item: make(g => g.circle(4, 4, 4).fill(0xffffff), 8, 8),
  };
}
const PROP_TEX = ['jar', 'crate', 'lamp', 'stele'];
const ITEM_TEX = ['bun', 'pill', 'ore'];
// the terrace floor is pale stone: dimmed so the white glow stays the brightest thing on screen (gdd/02 保留色)
const NEAR_TINT = { terrace: 0xb4b4c4 };
const ITEM_TINT = [0xd8b88a, 0x6fb4c8, 0x9aa3a8];   // 肉包 warm, 丹藥 cyan-ish, 鍛材 steel
const sprite = (tex, { ax = 0.5, ay = 0.5, tint = 0xffffff, alpha = 1 } = {}) => { const s = new Sprite(tex); s.anchor.set(ax, ay); s.tint = tint; s.alpha = alpha; return s; };

export class WorldView {
  constructor(app, art = null, propArt = null, cel = null) {
    this.cel = cel;                                  // cel pose sprites (render/cel.js); null = bone rigs
    this.app = app;
    this.art = art;                                  // cutout pixel parts (render/actors.js); null = procedural look
    this.propArt = propArt;                          // scenery props and items (render/scenery.js); null = baked shapes
    this.tex = shapes(app.renderer);
    this.root = new Container();
    this.camera = new Container();
    // each layer is a row of copies of one strip, every other copy mirrored so the edges always meet
    this.far = new Container();
    this.near = new Container(); this.near.y = FLOOR_TOP - 34;
    this.tele = new Graphics();                     // telegraphs, trails, cracks: one Graphics redrawn each frame
    this.actors = new Container({ sortableChildren: true });
    this.camera.addChild(this.far, this.near, this.tele, this.actors);
    this.bars = [0, 1, 2, 3].map(() => sprite(this.tex.px, { ax: 0, ay: 0, tint: 0x000000 }));
    this.root.addChild(this.camera, ...this.bars);
    app.stage.addChild(this.root);
    this.rigs = new Map();
    this.stageTex = new Map();
    this.stage = -1;
    this.propSprites = [];
    this.itemSprites = new Map();
    const P = propArt?.mound ? { mound: propArt.mound, chest: propArt.chest, chestOpen: propArt.chestOpen } : art?.props;
    this.P = P;
    this.mound = sprite(P ? P.mound : this.tex.mound, { ay: 1 }); this.actors.addChild(this.mound);
    this.chest = sprite(P ? P.chest : this.tex.chest, { ay: 1, tint: P ? 0xffffff : 0xb08a48 }); this.actors.addChild(this.chest);
    this.player = cel ? new CelActor(this.tex, cel.player, true) : new Rig(this.tex, { color: PLAYER_COLOR, weaponLen: 16, art: art?.player });
    this.actors.addChild(this.player.c);
    this.trails = new Map();                         // id -> [{x, y, a}]
    this.cracks = [];
    this.cam = { x: 0, init: false, kx: 0, ky: 0 };
    this.marks = [];                                 // wind-up glyphs this frame (world px); drawn as DOM by main.js
    this.bias = { x: 0, y: 0 };                      // kept for main.js (touch framing); a side view needs no vertical bias
    this.layout();
    app.renderer.on('resize', () => this.layout());
  }

  layout() {
    const W = this.app.screen.width, H = this.app.screen.height;
    const s = Math.min(W / VIEW_W, H / VIEW_H);
    this.scale = s >= 2 ? Math.floor(s) : s;
    this.root.scale.set(this.scale);
    this.ox = (W / this.scale - VIEW_W) / 2; this.oy = (H / this.scale - VIEW_H) / 2;
    const [l, r, t, b] = this.bars, w = W / this.scale, h = H / this.scale;
    l.position.set(0, 0); l.scale.set(Math.max(0, this.ox), h);
    r.position.set(this.ox + VIEW_W, 0); r.scale.set(Math.max(0, this.ox) + 1, h);
    t.position.set(0, 0); t.scale.set(w, Math.max(0, this.oy));
    b.position.set(0, this.oy + VIEW_H); b.scale.set(w, Math.max(0, this.oy) + 1);
  }

  /** World (x along the stage, screen-space y inside the view) -> CSS px. */
  toScreen(wx, wy) { return { x: (wx + this.camera.x) * this.scale, y: (wy + this.camera.y) * this.scale }; }
  toWorld(sx, sy) { return { x: sx / this.scale - this.camera.x, y: sy / this.scale - this.camera.y }; }
  /** Sim position (sub-px) -> world px drawn: floor band offset, height lifts. */
  static at(e) { return { x: e.x / PX, y: FLOOR_TOP + e.y / PX - (e.z || 0) / PX }; }
  /** Sim (x, depth) -> the ground point under it, for click-to-move: inverse of the floor projection. */
  groundOf(wx, wy) { return { x: wx, y: wy - FLOOR_TOP }; }

  /** Render-only camera kick toward a direction (sim angle units: 0 right, 128 left). */
  kick(ang, px) { if (!FEEL.enabled || ang === undefined) return; this.cam.kx += Math.cos((ang / 256) * Math.PI * 2) * px; }
  flashRig(id) { const r = id === -1 ? this.player : this.rigs.get(id); if (r) r.flash = FEEL.rig.flash; }
  crack(x, y) { this.cracks.push({ x, y, t: 0 }); }

  rigFor(f) {
    let r = this.rigs.get(f.id);
    if (!r) {
      const look = FOE_LOOK[f.type];
      r = this.cel ? new CelActor(this.tex, this.cel.foes[f.type], false) : new Rig(this.tex, { color: FOE_COLOR[f.type], ...look, art: this.art?.foes[f.type] });
      this.rigs.set(f.id, r); this.actors.addChild(r.c);
    }
    return r;
  }

  enterStage(sim) {
    const st = STAGES[sim.stage];
    let t = this.stageTex.get(st.id);
    if (!t) { t = { far: bakeFar(this.app.renderer, st), near: bakeNear(this.app.renderer, st) }; this.stageTex.set(st.id, t); }
    this.strips(t.far, t.near, st);
    const want = sim.stage;
    stageStrips(st.id).then(art => { if (art && this.stage === want) this.strips(art.far, art.near, st, art.res); });
    for (const s of this.propSprites) s.destroy();
    this.propSprites = sim.props.map(pr => {
      const s = sprite(this.propArt?.[PROP_TEX[pr.kind]] ?? this.tex[PROP_TEX[pr.kind]], { ay: 1 });
      s.position.set(pr.x / PX, FLOOR_TOP + pr.y / PX + (PROPS[pr.kind].d >> 1)); s.zIndex = pr.y / PX + (PROPS[pr.kind].d >> 1);
      this.actors.addChild(s); return s;
    });
    for (const [, s] of this.itemSprites) s.destroy();
    this.itemSprites.clear();
    for (const [, r] of this.rigs) r.c.visible = false;
    this.trails.clear();
    this.mound.position.set(SHRINE_X, FLOOR_TOP + 20); this.mound.zIndex = 20;
    this.chest.visible = !!st.chest;
    if (st.chest) { this.chest.position.set(st.chest.x, FLOOR_TOP + st.chest.y); this.chest.zIndex = st.chest.y; }
    this.stage = sim.stage;
    this.cam.init = false;
  }

  /** Fill a layer with copies of `tex` (mirrored every other one) across the length it scrolls over. */
  fill(layer, tex, length, tint = 0xffffff, res = 1) {
    layer.removeChildren().forEach(c => c.destroy());
    const w = tex.width / res;
    for (let i = 0, x = 0; x < length; i++, x += w) {
      const s = new Sprite(tex); s.tint = tint; s.scale.set(1 / res);
      if (i & 1) { s.scale.x = -1 / res; s.x = x + w; } else s.x = x;
      layer.addChild(s);
    }
  }
  strips(far, near, st, res = 1) {
    this.fill(this.far, far, Math.ceil(st.len * FAR) + VIEW_W + 8, 0xffffff, res);
    this.fill(this.near, near, st.len, res > 1 ? 0xffffff : NEAR_TINT[st.id] ?? 0xffffff, res);
  }

  /** Floor outline of move `m` for entity e (world px): the stretch along its facing, DEPTH_HIT thick each side. */
  shapePts(m, e, x0) {
    if (m.stance || !m.len) return null;
    const d = fdir(e.face), x = e.x / PX, fy = FLOOR_TOP + e.y / PX, half = DEPTH_HIT + 3;
    const a = m.both ? x - m.len : x0, b = m.both ? x + m.len : x + d * (m.len + (m.lunge || 0));
    const lo = Math.min(a, b), hi = Math.max(a, b);
    return [lo, fy - half, hi, fy - half, hi, fy + half, lo, fy + half];
  }

  /**
   * One telegraph of move `m`. The outline style repeats the glow colour so colour is never the only cue (UX #1):
   * white = thin solid line, gold = dashed line, red = thick line; a low sweep adds a floor hatch. glow −1 = the player's own swing.
   */
  drawShape(g, m, e, color, alpha, glow = -1) {
    const pts = this.shapePts(m, e, e.x / PX);
    if (!pts) return;
    g.poly(pts).fill({ color, alpha });
    const line = { width: glow === 2 ? 2.5 : glow === 1 ? 1.5 : 1, color, alpha: Math.max(glow >= 0 ? FEEL.telegraph.outline : 0, Math.min(1, alpha * 2.5)) };
    if (m.low && glow >= 0) for (let x = pts[0]; x < pts[2]; x += 6) g.moveTo(x, pts[5]).lineTo(x + 4, pts[1]);
    if (glow !== 1) { g.poly(pts).stroke(line); return; }
    const dash = FEEL.telegraph.dash;                 // dashed outline: walk the closed polygon, draw every other dash
    let on = true, left = dash;
    for (let i = 0; i < pts.length; i += 2) {
      let ax = pts[i], ay = pts[i + 1];
      const bx = pts[(i + 2) % pts.length], by = pts[(i + 3) % pts.length];
      let d = Math.hypot(bx - ax, by - ay);
      while (d > 0) {
        const step = Math.min(left, d), k = step / d, nx = ax + (bx - ax) * k, ny = ay + (by - ay) * k;
        if (on) g.moveTo(ax, ay).lineTo(nx, ny);
        ax = nx; ay = ny; d -= step; left -= step;
        if (left <= 0) { on = !on; left = dash; }
      }
    }
    g.stroke(line);
  }

  update(sim, freeze, dt) {
    if (sim.stage !== this.stage) this.enterStage(sim);
    const p = sim.p, st = STAGES[sim.stage];
    const tx = sim.cam / PX;
    if (!this.cam.init) { this.cam.x = tx; this.cam.init = true; }
    const k = FEEL.enabled ? 1 - FEEL.camera.lerp : 1;
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.x = Math.max(0, Math.min(st.len - VIEW_W, this.cam.x));
    this.cam.kx *= 0.8;
    this.camera.position.set(Math.round(this.ox - this.cam.x + this.cam.kx), Math.round(this.oy));
    this.far.x = Math.round(this.cam.x * (1 - FAR));
    if (freeze) return;

    const g = this.tele; g.clear();
    this.marks.length = 0;
    const GLOW = [FEEL.colors.white, FEEL.colors.gold, FEEL.colors.red];
    const t = sim.tick;

    // player
    const P0 = WorldView.at(p);
    this.player.update(p, P0.x, FLOOR_TOP + p.y / PX, (p.z || 0) / PX, poseOf(p, true), dt);
    this.player.c.zIndex = p.y / PX;
    this.player.c.alpha = p.iframe > 0 && p.st === S.DODGE ? 0.55 : 1;
    if (p.st === S.ACTIVE && p.mv >= 0) {
      const m = playerMove(p.mv);
      if (!m.stance) this.drawShape(g, m, p, 0xffffff, 0.1);
      this.trail(-1, this.player.tip, true);
    } else this.trail(-1, null, false);

    // foes
    const seen = new Set(), left = sim.cam - 40 * PX, right = sim.cam + (VIEW_W + 40) * PX;
    for (const f of sim.foes) {
      if (!f.alive || !f.on || f.wait > 0 || f.x < left || f.x > right) continue;
      const r = this.rigFor(f); seen.add(f.id); r.c.visible = true;
      const x = f.x / PX, y = FLOOR_TOP + f.y / PX;
      r.update(f, x, y, (f.z || 0) / PX, poseOf(f, false), dt);
      r.c.zIndex = f.y / PX;
      const m = foeMove(f), top = y - (f.z || 0) / PX;
      r.glow.alpha = 0;
      if (m && f.st === S.WINDUP) {
        const pulse = FEEL.enabled ? 0.7 + 0.3 * Math.sin(t * FEEL.telegraph.pulse) : 1;
        r.glow.tint = GLOW[m.glow]; r.glow.alpha = pulse; r.glow.position.set(0, -10 * r.scale - (f.z || 0) / PX); r.glow.scale.set(0.9 * r.scale);
        this.drawShape(g, m, f, GLOW[m.glow], FEEL.telegraph.alpha * (0.5 + 0.5 * f.stT / m.w), m.glow);
        this.marks.push({ x, y: top - 42 * r.scale, glow: m.glow });
        if (m.glow === 1) {                               // gold: a charge bar over the head
          const w = 18 * r.scale, by = top - 30 * r.scale;
          g.rect(x - w / 2, by, w, 3).fill({ color: 0x000000, alpha: 0.6 }).rect(x - w / 2, by, (w * f.stT) / m.w, 3).fill(GLOW[1]);
        }
      } else if (m && f.st === S.ACTIVE) {
        this.drawShape(g, m, f, GLOW[m.glow], 0.35, m.glow);
        this.trail(f.id, r.tip, true);
      } else this.trail(f.id, null, false);
      if (f.st === S.BROKEN) g.circle(x, top - 34 * r.scale, 3).fill(0xd8923a);
      if (f.kb > 0 && FEEL.enabled && Math.abs(f.vx) > 200) g.circle(x - (f.vx / PX) * 2, y, 1.5).fill({ color: 0x9a8f7a, alpha: 0.6 });
    }
    for (const [id, r] of this.rigs) if (!seen.has(id)) { r.c.visible = false; this.trails.delete(id); }

    // trails
    for (const [, pts] of this.trails) {
      for (let i = 1; i < pts.length; i++) {
        const a = i / pts.length;
        g.moveTo(pts[i - 1].x, pts[i - 1].y).lineTo(pts[i].x, pts[i].y).stroke({ width: 1 + 2.5 * a, color: 0xffffff, alpha: 0.7 * a });
      }
    }
    // cracks
    for (let i = this.cracks.length - 1; i >= 0; i--) {
      const c = this.cracks[i]; c.t += dt;
      if (c.t > 1.2) { this.cracks.splice(i, 1); continue; }
      const al = 1 - c.t / 1.2;
      for (let k2 = 0; k2 < 5; k2++) { const an = k2 * 1.3; g.moveTo(c.x, c.y).lineTo(c.x + Math.cos(an) * 9, c.y + Math.sin(an) * 4).stroke({ width: 1, color: 0x1a1a1a, alpha: al }); }
    }

    // props, items, mound, chest
    sim.props.forEach((pr, i) => { const s = this.propSprites[i]; if (s) s.visible = pr.hp !== 0; });
    const live = new Set();
    for (const it of sim.items) {
      live.add(it.id);
      let s = this.itemSprites.get(it.id);
      if (!s) {
        const a = this.propArt?.[ITEM_TEX[it.kind]];
        s = a ? sprite(a, { ay: 1 }) : sprite(this.tex.item, { tint: ITEM_TINT[it.kind] });
        this.actors.addChild(s); this.itemSprites.set(it.id, s);
      }
      s.position.set(it.x / PX, FLOOR_TOP + it.y / PX + (s.anchor.y ? 2 : -4) - (FEEL.enabled ? Math.abs(Math.sin(t * 0.08)) * 2 : 0)); s.zIndex = it.y / PX;
    }
    for (const [id, s] of this.itemSprites) if (!live.has(id)) { s.destroy(); this.itemSprites.delete(id); }
    const A = this.P;
    this.mound.tint = A ? (sim.shrine === sim.stage ? 0xffffff : 0x8c8f98) : 0xffffff;
    if (st.chest) { if (A) this.chest.texture = sim.opened & 1 ? A.chestOpen : A.chest; else this.chest.tint = sim.opened & 1 ? 0x3a3028 : 0xb08a48; }
  }

  trail(id, tip, on) {
    if (!on || !FEEL.enabled) { this.trails.delete(id); return; }
    const pts = this.trails.get(id) ?? [];
    pts.push({ x: tip.x, y: tip.y });
    if (pts.length > FEEL.rig.trail) pts.shift();
    this.trails.set(id, pts);
  }

  /** A fading copy of the player (perfect dodge). */
  ghost() {
    const g = sprite(this.tex.dot, { tint: 0x9fd6e0, alpha: FEEL.ghost.alpha });
    g.scale.set(0.9, 1.6);
    g.position.set(this.player.c.x, this.player.c.y - 12); g.zIndex = this.player.c.zIndex - 1;
    this.actors.addChild(g);
    return g;
  }
}
