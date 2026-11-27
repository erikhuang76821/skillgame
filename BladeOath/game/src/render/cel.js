// Cel-shaded pose sprites (gdd/02 v5 art): one atlas of 12 whole-body poses per kind (art/tools/cel_build.py),
// including a four-frame walk cycle.
// Render only. The pose is picked from the sim state every frame; facing left mirrors the sprite. The wind-up glow,
// telegraphs and blade trails stay procedural (world.js), so what you see is still timed by the sim.
// Returns null when the atlas fails to load; world.js then keeps the procedural bone rigs (render/rig.js).
import { Assets, Container, Sprite, Spritesheet } from 'pixi.js';
import celPng from '../assets/cel/actors.png';
import celData from '../assets/cel/actors.json';
import { S, MOVE_AIR, playerMove, foeMove } from '../sim/sim.js';

export const CEL_KINDS = ['soldier', 'bug', 'caster', 'brute', 'mother', 'general', 'fallen'];   // index = sim foe type
const POSES = ['idle', 'walk1', 'walk2', 'walk3', 'walk4', 'windup', 'strike', 'guard', 'dodge', 'hurt', 'jump', 'down'];
const WALK_STEP = 7;                 // world px walked per walk frame (four frames = one stride)
const HEIGHT = { player: 40, soldier: 40, bug: 15, caster: 40, brute: 56, mother: 56, general: 64, fallen: 66 };   // idle, world px

export async function loadCel() {
  try {
    const tex = await Assets.load(celPng);
    const sheet = new Spritesheet(tex, celData);   // meta.scale 2: textures are twice the world size (sharp when scaled up)
    await sheet.parse();
    const kind = k => ({ height: HEIGHT[k], ...Object.fromEntries(POSES.map(p => [p, sheet.textures[`${k}/${p}`]])) });
    return { player: kind('player'), foes: CEL_KINDS.map(kind) };
  } catch (e) {
    console.warn('cel atlas failed, using bone rigs', e);
    return null;
  }
}

/** Which pose shows actor `e` this frame (walk = 0..3, the walk-cycle frame). */
export function celPose(e, isPlayer, walk) {
  const m = e.mv >= 0 ? (isPlayer ? playerMove(e.mv) : foeMove(e)) : null;
  switch (e.st) {
    case S.WINDUP: return isPlayer && e.mv === MOVE_AIR ? 'jump' : m?.stance ? 'guard' : 'windup';
    case S.ACTIVE: return m?.stance ? 'guard' : 'strike';
    case S.RECOVER: return m && e.stT < (m.r >> 1) ? 'strike' : e.z > 0 ? 'jump' : 'idle';
    case S.BLOCK: return 'guard';
    case S.DODGE: return 'dodge';
    case S.LAND: return 'dodge';
    case S.GRAB: return 'guard';
    case S.HITSTUN: case S.BROKEN: case S.HELD: return 'hurt';
    case S.CONTROL: return e.z > 0 ? 'hurt' : 'down';
    case S.DOWN: case S.DEAD: return 'down';
    case S.JUMP: return 'jump';
    case S.MOVE: return `walk${walk + 1}`;
    default: return 'idle';
  }
}

/** Drop-in for render/rig.js's Rig (same fields world.js reads: c, glow, tip, scale, flash, update). */
export class CelActor {
  constructor(tex, frames, isPlayer) {
    this.frames = frames; this.isPlayer = isPlayer;
    this.c = new Container();
    this.scale = frames.height / 38;                // world.js places glyphs and bars in units of the old 24 px rig
    this.shadow = new Sprite(tex.dot); this.shadow.anchor.set(0.5); this.shadow.tint = 0x000000; this.shadow.alpha = 0.3;
    this.glow = new Sprite(tex.ring); this.glow.anchor.set(0.5); this.glow.alpha = 0;
    this.sp = new Sprite(frames.idle);
    this.c.addChild(this.shadow, this.glow, this.sp);
    this.tip = { x: 0, y: 0 };
    this.flash = 0; this.step = 0; this.lastX = 0;
  }

  update(e, x, y, lift, _pose, dt) {
    const moved = Math.abs(x - this.lastX);
    this.lastX = x;
    const dy = Math.abs(y - (this.lastY ?? y)); this.lastY = y;
    if ((moved > 0.05 || dy > 0.05) && moved < 8) this.step += moved + dy; else if (e.st !== S.MOVE && e.st !== S.READY) this.step = 0;
    this.c.position.set(Math.round(x), Math.round(y));
    // foes walk while READY too (they have no MOVE state): show the cycle whenever they are actually moving
    const walking = !this.isPlayer && e.st === S.READY && (moved > 0.05 || dy > 0.05);
    const pose = walking ? `walk${Math.floor(this.step / WALK_STEP) % 4 + 1}` : celPose(e, this.isPlayer, Math.floor(this.step / WALK_STEP) % 4);
    const t = this.frames[pose];
    if (this.sp.texture !== t) { this.sp.texture = t; this.sp.anchor.copyFrom(t.defaultAnchor); }
    const d = e.face === 128 ? -1 : 1;
    this.sp.scale.set(d, 1);
    this.sp.y = -lift;
    const H = this.frames.height;
    this.shadow.scale.set(H / 40 * (pose === 'down' ? 2.2 : 1.3), H / 40 * 0.45);
    this.shadow.alpha = 0.3 * Math.max(0.3, 1 - lift / 60);
    this.tip.x = x + d * t.width * 0.42; this.tip.y = y - lift - H * (pose === 'strike' ? 0.55 : 0.6);
    if (this.flash > 0) this.flash -= dt;
    this.sp.alpha = this.flash > 0 ? 0.45 : 1;     // no filter, no extra batch: the hit flash blinks the sprite
  }
}
