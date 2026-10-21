// Draws sim state. Layer order follows the skill's contract:
// ground -> ground effects/pickups -> feet-Y sorted props & actors -> projectiles/air FX -> overlay (-> HUD elsewhere).
// Everything here is render-only: FX level never changes the simulation.
import { BitmapText, Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import { gsap } from 'gsap';
import { ARENA, ENEMIES, TREES, WEAPONS, EVENTS } from '../sim/content.js';
import { SUB, lvl } from '../sim/sim.js';
import { hash32 } from '../sim/rng.js';
import { sliceSheet, rowFor, makeActor, dirFromVector, Animator } from './spriteContract.js';
import { flashSheet } from './textures.js';

const ART = 2; // world units per art pixel (source game: 2)
const BEAM = EVENTS.find(e => e.type === 'beams');
const MAX_PARTICLES = 140;
const MAX_NUMBERS = 32;
export const PIXEL_FONT = '"Pixelify Sans", "Trebuchet MS", system-ui, sans-serif';

export class WorldView {
  constructor(assets, tex, settings, view) {
    this.settings = settings;
    this.view = view;
    this.tex = tex;
    this.root = new Container();
    this.layers = {};
    for (const name of ['ground', 'groundFx', 'actors', 'air', 'overlay']) {
      this.layers[name] = this.root.addChild(new Container());
    }
    this.layers.actors.sortableChildren = true;

    const ground = new TilingSprite({ texture: tex.grass, width: ARENA.w, height: ARENA.h });
    ground.tileScale.set(ART);
    this.layers.ground.addChild(ground);
    this.scatterDecor();

    this.pineTex = assets.pine;
    for (const t of TREES) this.addPine(t.x, t.y);
    for (let x = 0; x <= ARENA.w; x += 46) { this.addPine(x + (x % 3) * 6, 24 + (x % 5) * 4); this.addPine(x + 20, ARENA.h + 34); }
    for (let y = 60; y < ARENA.h; y += 52) { this.addPine(4 + (y % 4) * 5, y); this.addPine(ARENA.w - 4, y + 22); }

    // Camp set dressing at the start point (the player spawns next to the fire).
    const cx = ARENA.w / 2, cy = ARENA.h / 2 + 90;
    this.fire = this.actor(new Sprite(tex.campfire[0]), cx, cy, 0.5, 1);
    this.actor(new Sprite(tex.tent), cx - 120, cy - 60, 0.5, 1);
    this.actor(new Sprite(tex.tent), cx + 130, cy - 40, 0.5, 1);

    this.hero = { Idle: clip(assets.sasq.Idle), Walk: clip(assets.sasq.Walk) };
    this.grey = clip(assets.greyling.Walk);

    this.playerShadow = this.layers.groundFx.addChild(new Sprite(tex.shadow));
    this.playerShadow.anchor.set(0.5); this.playerShadow.scale.set(ART + 1);
    this.player = this.layers.actors.addChild(makeActor(this.hero.Idle.rows, this.hero.Idle.meta, ART));
    this.heroAnim = 'Idle';
    this.heroAnimator = new Animator(this.hero.Idle.meta);
    this.lastTick = 0;

    this.aura = this.layers.groundFx.addChild(new Graphics());
    this.auraRadius = 0;
    this.beams = this.layers.groundFx.addChild(new Graphics());

    this.pools = {
      enemy: { map: new Map(), free: [], layer: this.layers.actors, make: () => {
        const s = makeActor(this.grey.rows, this.grey.meta, ART);
        s.anim = new Animator(this.grey.meta);
        return s;
      } },
      eshadow: { map: new Map(), free: [], layer: this.layers.groundFx, make: () => this.simple(tex.shadow, 0.5) },
      orb: { map: new Map(), free: [], layer: this.layers.groundFx, make: () => this.simple(tex.orb, 0.5) },
      shot: { map: new Map(), free: [], layer: this.layers.air, make: () => this.simple(tex.pinecone, 0.5) },
      pickup: { map: new Map(), free: [], layer: this.layers.groundFx, make: () => this.simple(tex.hotdog, 0.5) },
    };
    this.flames = [];

    // Lighting: darkness follows the hero; additive glow stays on the fire.
    this.dark = this.layers.overlay.addChild(new Sprite(tex.darkness));
    this.dark.anchor.set(0.5); this.dark.width = this.dark.height = 3200;
    this.fireGlow = this.layers.overlay.addChild(new Sprite(tex.glow));
    this.fireGlow.anchor.set(0.5); this.fireGlow.scale.set(3.2); this.fireGlow.blendMode = 'add';
    this.fireGlow.position.set(cx, cy - 16);

    // Hero HP bar under the feet (Survivor.io convention: eyes stay on the hero).
    this.hpBar = this.layers.overlay.addChild(new Container());
    const bg = this.hpBar.addChild(new Sprite(Texture.WHITE)); bg.width = 52; bg.height = 8; bg.tint = 0x05080c;
    this.hpFill = this.hpBar.addChild(new Sprite(Texture.WHITE)); this.hpFill.position.set(2, 2); this.hpFill.height = 4;

    this.particles = [];
    this.numbers = [];
    this.stamp = 0;
    this.shake = 0;
    this.frameNo = 0;
    this.rings = new Set();
  }

  get rich() { return this.settings.fx === 'high' && !this.settings.reducedMotion; }

  simple(texture, anchor) {
    const s = new Sprite(texture);
    s.anchor.set(anchor);
    s.scale.set(ART);
    return s;
  }

  actor(s, x, y, ax, ay) {
    s.anchor.set(ax, ay); s.scale.set(ART); s.position.set(x, y); s.zIndex = y;
    return this.layers.actors.addChild(s);
  }

  addPine(x, y) { this.actor(new Sprite(this.pineTex), x, y, 0.5, 39 / 40); } // feet = trunk base (24x40, ay 39)

  // Deterministic flat decals so the ground reads as a place, not a grid.
  scatterDecor() {
    const d = this.tex.decor, kinds = [d.tuft, d.tuft, d.tuft, d.tuft, d.flower, d.flower, d.rock, d.mushroom, d.dirt, d.dirt];
    for (let i = 0; i < 360; i++) {
      const h = hash32(4242, 6, i);
      const s = this.layers.ground.addChild(new Sprite(kinds[h % kinds.length]));
      s.anchor.set(0.5);
      s.scale.set(ART * (((h >>> 8) & 1) ? 1 : -1), ART);
      s.position.set(40 + ((h >>> 3) % (ARENA.w - 80)), 40 + ((h >>> 15) % (ARENA.h - 80)));
    }
  }

  syncPool(kind, list, update) {
    const pool = this.pools[kind], stamp = this.stamp;
    for (const ent of list) {
      let s = pool.map.get(ent.id);
      if (!s) {
        s = pool.free.pop() || pool.layer.addChild(pool.make());
        s.visible = true;
        pool.map.set(ent.id, s);
      }
      s._stamp = stamp;
      update(s, ent);
    }
    for (const [id, s] of pool.map) {
      if (s._stamp !== stamp) { s.visible = false; pool.free.push(s); pool.map.delete(id); }
    }
  }

  sync(sim) {
    this.stamp++;
    this.frameNo++;
    const rich = this.rich, t = sim.tick, p = sim.player;
    const px = p.x / SUB, py = p.y / SUB;
    const dt = Math.max(0, t - this.lastTick); // animation runs on sim ticks: frozen while paused / levelling up
    this.lastTick = t;

    // player (feet point = sim position): Walk while moving or dashing, Idle otherwise
    const anim = p.moving || p.dashT > 0 ? 'Walk' : 'Idle', hero = this.hero[anim];
    if (anim !== this.heroAnim) {
      this.heroAnim = anim;
      this.heroAnimator = new Animator(hero.meta);
      this.player.anchor.set(hero.meta.ax / hero.meta.w, hero.meta.ay / hero.meta.h);
    }
    const flashing = p.invuln > 24;
    this.player.texture = (flashing ? hero.flash : hero.rows)[rowFor(hero.meta, p.dir)][this.heroAnimator.advance(dt)];
    this.player.position.set(Math.round(px), Math.round(py));
    this.player.zIndex = py;
    this.player.alpha = p.dashT > 0 ? 0.55 : (p.invuln > 0 && !flashing && (t >> 2) & 1 ? 0.45 : 1);
    this.playerShadow.position.set(Math.round(px), Math.round(py));
    const hpRatio = Math.max(0, p.hp / p.maxHp);
    this.hpFill.width = 48 * hpRatio;
    this.hpFill.tint = hpRatio > 0.5 ? 0x5fe05a : hpRatio > 0.25 ? 0xffc23a : 0xff4a3a;
    this.hpBar.position.set(Math.round(px) - 26, Math.round(py) + 8);

    this.syncPool('enemy', sim.enemies, (s, e) => {
      const v = ENEMIES[e.kind].visual, g = this.grey, r = rowFor(g.meta, dirFromVector(e.vx, e.vy));
      if (s.eid !== e.id) { s.eid = e.id; s.anim.frame = e.id % g.meta.n; s.anim.ticks = 0; } // desync the swarm
      const f = s.anim.advance(e.vx || e.vy ? dt : 0);
      s.texture = (e.flash > 3 ? g.flash : g.rows)[r][f];
      s.scale.set(v.scale);
      s.tint = e.flash > 3 ? 0xffffff : v.tint;
      const hover = rich ? Math.round(Math.sin((t + e.id * 7) / 9) * 1.5) : 0;
      s.position.set(Math.round(e.x / SUB), Math.round(e.y / SUB) + hover - 4);
      s.zIndex = e.y / SUB;
    });
    this.syncPool('eshadow', sim.enemies, (s, e) => {
      s.position.set(Math.round(e.x / SUB), Math.round(e.y / SUB));
      s.scale.set(ENEMIES[e.kind].visual.scale * 0.9);
    });
    this.syncPool('orb', sim.orbs, (s, o) => {
      const bob = rich ? ((t + o.id * 5) >> 4) & 1 : 0;
      s.position.set(Math.round(o.x / SUB), Math.round(o.y / SUB) - bob * 2);
      s.tint = o.v >= 20 ? 0xffd36b : 0xffffff;
      s.scale.set(o.v >= 20 ? ART + 1 : ART);
    });
    this.syncPool('shot', sim.shots, (s, sh) => {
      s.position.set(Math.round(sh.x / SUB), Math.round(sh.y / SUB));
      s.rotation = rich ? t * 0.35 : 0;
    });
    this.syncPool('pickup', sim.pickups, (s, pk) => s.position.set(Math.round(pk.x / SUB), Math.round(pk.y / SUB)));

    while (this.flames.length < sim.flames.length) this.flames.push(this.layers.air.addChild(this.simple(this.tex.flame, 0.5)));
    this.flames.forEach((s, i) => {
      const f = sim.flames[i];
      s.visible = !!f;
      if (f) { s.position.set(Math.round(f.x / SUB), Math.round(f.y / SUB)); s.scale.y = ART + (rich && (t + i * 5) % 12 < 6 ? 0.5 : 0); }
    });
    this.fire.texture = this.tex.campfire[rich ? (this.frameNo >> 3) & 1 : 0];
    this.fireGlow.alpha = rich ? 0.85 + 0.15 * Math.sin(this.frameNo / 6) : 0.9;

    const fur = lvl(sim, 'static_fur');
    const r = fur ? WEAPONS.static_fur.radius[fur - 1] : 0;
    if (r !== this.auraRadius) {
      this.auraRadius = r;
      this.aura.clear();
      if (r) this.aura.circle(0, 0, r).fill({ color: 0x7fd7ff, alpha: 0.1 }).stroke({ width: 2, color: 0x9fe4ff, alpha: 0.55 });
    }
    this.aura.position.set(Math.round(px), Math.round(py) - 10);

    this.beams.clear();
    for (const b of sim.beams) {
      const bx = Math.round(b.x / SUB), by = Math.round(b.y / SUB);
      if (b.warn > 0) {
        this.beams.circle(bx, by, BEAM.radius).fill({ color: 0xff3030, alpha: 0.15 }).stroke({ width: 3, color: 0xff4040, alpha: 0.5 + 0.5 * ((b.warn >> 2) & 1) });
      } else {
        this.beams.rect(bx - BEAM.radius * 0.6, by - 900, BEAM.radius * 1.2, 900).fill({ color: 0x9cff5a, alpha: 0.35 });
        this.beams.circle(bx, by, BEAM.radius).fill({ color: 0xc8ff8a, alpha: 0.6 });
      }
    }

    for (const ev of sim.events) this.onEvent(ev, px, py);
    sim.events.length = 0;
    this.updateParticles();

    this.dark.position.set(Math.round(px), Math.round(py) - 20);

    // camera: follow feet, clamp to arena, integer pixels
    const cx = clamp(px - this.view.w / 2, 0, ARENA.w - this.view.w);
    const cy = clamp(py - 20 - this.view.h / 2, 0, ARENA.h - this.view.h);
    let sx = 0, sy = 0;
    if (this.shake > 0) { this.shake--; sx = ((this.shake * 7) % 5) - 2; sy = ((this.shake * 3) % 5) - 2; }
    this.root.position.set(-Math.round(cx) + sx * 2, -Math.round(cy) + sy * 2);
  }

  // ---------- render-only feedback ----------
  burst(x, y, n, colors, speed = 2.4) {
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const h = hash32(this.frameNo, 9, i + this.particles.length * 31);
      const a = (h % 628) / 100, v = speed * (0.5 + ((h >>> 10) % 100) / 100);
      const s = this.layers.air.addChild(new Sprite(this.tex.spark));
      s.anchor.set(0.5); s.scale.set(ART); s.tint = colors[(h >>> 20) % colors.length];
      s.position.set(x, y);
      this.particles.push({ s, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 18 + (h % 10) });
    }
  }

  number(x, y, dmg) {
    if (this.numbers.length >= MAX_NUMBERS) return;
    const t = this.layers.air.addChild(new BitmapText({
      text: String(dmg), style: { fontFamily: PIXEL_FONT, fontSize: 22, fill: 0xffffff, fontWeight: 'bold', stroke: { color: 0x05080c, width: 4 } },
    }));
    t.anchor.set(0.5);
    t.position.set(x + ((this.frameNo * 7) % 13) - 6, y - 34);
    this.numbers.push({ t, life: 26 });
  }

  updateParticles() {
    this.particles = this.particles.filter(p => {
      p.s.x += p.vx; p.s.y += p.vy; p.vy += 0.12; p.s.alpha = Math.min(1, p.life / 8);
      if (--p.life > 0) return true;
      p.s.destroy(); return false;
    });
    this.numbers = this.numbers.filter(n => {
      n.t.y -= 1.1; n.t.alpha = Math.min(1, n.life / 8);
      if (--n.life > 0) return true;
      n.t.destroy(); return false;
    });
  }

  onEvent(ev, px, py) {
    const rich = this.rich;
    if (ev.type === 'hurt') {
      if (rich) { this.shake = 10; this.burst(Math.round(px), Math.round(py) - 30, 8, [0xff4a3a, 0xffffff]); }
    }
    if (ev.type === 'hit' && rich) this.number(Math.round(ev.x / SUB), Math.round(ev.y / SUB), ev.dmg);
    if (ev.type === 'kill' && rich) {
      const x = Math.round(ev.x / SUB), y = Math.round(ev.y / SUB) - 16;
      this.burst(x, y, ev.boss ? 40 : 5, ev.boss ? [0xffd36b, 0xffffff, 0x8ff03c] : [0x8ff03c, 0xc9d3dc, 0xffffff], ev.boss ? 4.5 : 2.2);
      if (ev.boss) this.shake = 18;
    }
    if (ev.type === 'graze') {
      // Perfect Dodge feedback: a gold star where the alien was passed (static in low FX).
      const spark = this.layers.air.addChild(new Graphics());
      spark.star(0, 0, 4, 16, 6).fill({ color: 0xffd36b }).stroke({ width: 2, color: 0x3a2508 });
      spark.position.set(Math.round(ev.x / SUB), Math.round(ev.y / SUB) - 24);
      this.rings.add(spark);
      const done = () => { this.rings.delete(spark); spark.destroy(); };
      if (rich) gsap.to(spark, { y: spark.y - 28, alpha: 0, rotation: 1.2, duration: 0.4, onComplete: done });
      else spark.timer = gsap.delayedCall(0.15, done);
    }
    if (ev.type === 'howl') {
      const ring = this.layers.air.addChild(new Graphics());
      const color = ev.doubled ? 0xffd36b : 0xe8f6ff;
      ring.circle(0, 0, 160).fill({ color, alpha: 0.12 }).stroke({ width: 8, color, alpha: 0.95 });
      ring.position.set(Math.round(px), Math.round(py) - 16);
      this.rings.add(ring);
      const done = () => { this.rings.delete(ring); ring.destroy(); };
      if (rich) {
        this.shake = 8;
        ring.scale.set(0.2);
        gsap.to(ring.scale, { x: 1, y: 1, duration: 0.35, ease: 'power2.out' });
        gsap.to(ring, { alpha: 0, duration: 0.3, delay: 0.15, onComplete: done });
      } else {
        ring.timer = gsap.delayedCall(0.12, done); // low FX: one static flash, no scaling motion
      }
    }
  }

  destroy() {
    for (const ring of this.rings) { gsap.killTweensOf(ring); gsap.killTweensOf(ring.scale); ring.timer?.kill(); }
    this.rings.clear();
    this.root.destroy({ children: true });
  }
}

// One animation of an 8-direction sheet: frame textures plus their white hit-flash copies.
function clip({ texture, meta }) {
  return { meta, rows: sliceSheet(texture, meta), flash: sliceSheet(flashSheet(texture), meta) };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
