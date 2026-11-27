// Procedural skeleton (gdd/12 §7). Render only: reads sim state, never writes it.
// A rig is a handful of part sprites (legs, torso, head, two arms, weapon) placed every frame from a pose. The pose comes
// from the SAME move timeline the sim judges with (startup / active / recovery ticks, the hit shape's sweep angles), so
// the wind-up you see is exactly as long as the real one and the blade sweeps exactly where the hit box sweeps.
// Top-down 3/4 view: the ground plane is squashed vertically (GROUND_Y); the camera and the whole image never rotate,
// only the bones do. Angles are the sim's 256-per-turn units.
import { Container, Sprite, Texture } from 'pixi.js';
import { S, playerMove, foeMove } from '../sim/sim.js';

const GROUND_Y = 0.6;
const TAU = Math.PI * 2;
const rad = a => (a / 256) * TAU;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - (1 - t) * (1 - t);
const easeIn = t => t * t;
const ART_ANGLES = 16;                 // weapon frames in the atlas (art/tools/build.py ANGLES)
const REST = 44;                     // blade rest angle, relative to facing (down and to the side)

/** Pose of an actor this frame: all angles relative to the facing; lengths in px before the kind's scale. */
export function poseOf(e, isPlayer) {
  const P = { lean: 0, crouch: 0, wAng: REST, reach: 5, wLift: 0, arms: 0, bob: 0, flat: 0 };
  const mv = isPlayer ? (e.mv >= 0 ? playerMove(e.mv) : null) : foeMove(e);
  const st = e.st;
  if (mv && (st === S.WINDUP || st === S.ACTIVE || st === S.RECOVER) && !mv.stance) {
    // v5 hit shapes are lines along the facing: a lunge or a long reach poses as a thrust, a sweep both ways as a spin,
    // a low sweep as a chop to the floor, the rest as a slash across the body (alternating with the combo step).
    const spin = mv.both && !mv.low, alt = isPlayer && e.mv === 1 ? -1 : 1;
    const m = { ...mv, shape: mv.lunge || mv.len >= 40 ? 'rect' : spin ? 'arc' : mv.low || mv.zHi > 100 ? 'circle' : 'arc',
      from: spin ? -128 : 43 * alt, to: spin ? 128 : -43 * alt };
    const wind = m.shape === 'arc' ? m.from + Math.sign(m.from || 1) * 26 : 0;   // pull the blade past the start of the sweep
    if (st === S.WINDUP) {
      const t = easeOut(clamp01(e.stT / Math.max(1, m.w)));
      P.lean = -3 * t; P.crouch = 2 * t;
      if (m.shape === 'arc') { P.wAng = lerp(REST, wind, t); P.reach = 6; }
      else if (m.shape === 'rect' || m.shape === 'capsule') { P.wAng = lerp(REST, 8, t); P.reach = lerp(5, 1, t); }
      else { P.wAng = lerp(REST, 0, t); P.wLift = 14 * t; P.arms = t; }
    } else if (st === S.ACTIVE) {
      const k = clamp01((e.stT + 1) / Math.max(1, m.a));
      P.lean = 4; P.crouch = 1;
      if (m.shape === 'arc') { P.wAng = lerp(m.from, m.to, k); P.reach = 10; }
      else if (m.shape === 'rect' || m.shape === 'capsule') { P.wAng = 0; P.reach = 13; P.lean = 5; }
      else { P.wAng = 0; P.wLift = lerp(14, -4, easeIn(k)); P.arms = 1 - k; P.crouch = 4 * k; P.reach = 9; }
    } else {
      const t = easeOut(clamp01(e.stT / Math.max(1, m.r)));
      const end = m.shape === 'arc' ? m.to + Math.sign(m.to || 1) * 12 : 0;      // follow-through, then back to rest
      P.wAng = lerp(end, REST, t); P.reach = lerp(10, 5, t); P.lean = lerp(3, 0, t); P.crouch = lerp(1, 0, t);
    }
    return P;
  }
  switch (st) {
    case S.BLOCK: P.wAng = 64; P.reach = 7; P.wLift = 6; P.lean = 1; P.crouch = 2; break;
    case S.JUMP: P.crouch = 3; P.lean = 2; P.wAng = 20; P.wLift = 4; break;
    case S.LAND: P.crouch = 6; P.lean = 3; P.wAng = 70; break;
    case S.GRAB: P.wAng = 0; P.reach = 11; P.arms = 1; P.lean = 3; break;
    case S.HELD: P.lean = -6; P.flat = 0.25; P.wAng = 100; break;
    case S.DODGE: P.crouch = 5; P.lean = 5; P.wAng = 90; break;
    case S.HITSTUN: P.lean = -5; P.crouch = 1; P.wAng = 80; break;
    case S.CONTROL: P.lean = -7; P.flat = 0.6; P.wAng = 100; break;
    case S.BROKEN: P.crouch = 6; P.lean = 6; P.wAng = 90; P.reach = 3; break;
    case S.DOWN: case S.DEAD: P.flat = 1; P.crouch = 9; P.wAng = 100; break;
    case S.ACTIVE: P.wAng = 64; P.reach = 8; P.wLift = 8; break;   // stance (劍幕)
    default: break;
  }
  return P;
}

const seg = tex => { const s = new Sprite(tex); s.anchor.set(0, 0.5); return s; };

export class Rig {
  /**
   * @param tex   { px (white 1x1), dot (white disc) }
   * @param o     { color, skin, weapon, scale, weaponLen, heavy, art }
   *              art: cutout parts from render/actors.js ({ head|null, torso, weapon[16] }); null keeps the capsule look
   */
  constructor(tex, { color, skin = 0xd9c7a3, weaponColor = 0xdfe6ea, scale = 1, weaponLen = 16, bulk = 1, art = null }) {
    this.c = new Container();
    this.scale = scale; this.weaponLen = weaponLen; this.bulk = bulk; this.color = color;
    const P = tex.px, D = tex.dot;
    this.shadow = new Sprite(D); this.shadow.anchor.set(0.5); this.shadow.tint = 0x000000; this.shadow.alpha = 0.3;
    this.legL = seg(P); this.legR = seg(P);
    this.torso = seg(P);
    this.head = new Sprite(D); this.head.anchor.set(0.5);
    this.armB = seg(P); this.foreB = seg(P);        // weapon arm
    this.armF = seg(P);                              // off arm
    this.weapon = seg(P);
    this.glow = new Sprite(tex.ring); this.glow.anchor.set(0.5); this.glow.alpha = 0;
    this.c.addChild(this.shadow, this.glow, this.legL, this.legR, this.armF, this.torso, this.head, this.armB, this.foreB, this.weapon);
    this.art = art;
    if (art) {
      // pixel parts replace the torso capsule, the head disc and the blade line; limbs stay procedural (gdd/02 §2)
      this.torso.visible = false;
      this.body = new Sprite(art.torso.front); this.c.addChildAt(this.body, this.c.getChildIndex(this.torso) + 1);
      this.head.visible = !!art.head;
      if (art.head) { this.head.texture = art.head.front; this.head.tint = 0xffffff; }
      this.weapon.texture = art.weapon[0]; this.weapon.tint = 0xffffff;
      if (!art.head) for (const s of [this.armB, this.foreB, this.armF]) s.visible = false;   // the bug: carapace + mandibles only
    }
    for (const s of [this.legL, this.legR, this.torso, this.armB, this.foreB, this.armF]) s.tint = color;
    this.head.tint = skin; this.weapon.tint = weaponColor;
    this.step = 0; this.flash = 0; this.lastX = 0; this.lastY = 0;
    this.tip = { x: 0, y: 0 };
  }

  /** Ground point (forward, side, height) -> local screen offset, for facing angle a (sim units). */
  pt(a, f, s, h) {
    const c = Math.cos(rad(a)), n = Math.sin(rad(a));
    return [(c * f - n * s) * this.scale, ((n * f + c * s) * GROUND_Y - h) * this.scale];
  }
  line(sp, [x0, y0], [x1, y1], thick) {
    const dx = x1 - x0, dy = y1 - y0;
    sp.position.set(x0, y0); sp.rotation = Math.atan2(dy, dx);
    sp.scale.set(Math.max(0.5, Math.hypot(dx, dy)), thick * this.scale);
  }

  /** Place every part for actor `e` at world pixel (x, y), lifted by z px. */
  update(e, x, y, lift, pose, dt) {
    const a = e.face, B = this.bulk;
    const moved = Math.hypot(x - this.lastX, y - this.lastY);
    this.lastX = x; this.lastY = y;
    if (moved > 0.05 && moved < 8) this.step += moved * 0.35; else this.step *= 0.9;
    this.c.position.set(Math.round(x), Math.round(y));
    const z = lift;
    this.shadow.position.set(0, 0); this.shadow.scale.set(0.9 * this.scale * B, 0.4 * this.scale * B);
    const flat = pose.flat, crouch = pose.crouch, lean = pose.lean;
    const hipH = (10 - crouch * 0.6) * (1 - flat * 0.7) + z, shH = (17 - crouch) * (1 - flat * 0.75) + z;
    const sw = Math.sin(this.step) * 3.2 * (1 - flat), bob = Math.abs(Math.cos(this.step)) * 0.8 * (1 - flat);
    const hip = this.pt(a, lean * 0.3, 0, hipH + bob), sh = this.pt(a, lean * (1 + flat * 2), 0, shH + bob);
    // legs
    const footL = this.pt(a, sw, -3 * B, z * 0.0), footR = this.pt(a, -sw, 3 * B, 0);
    this.line(this.legL, this.pt(a, lean * 0.3, -2 * B, hipH + bob), footL, 2.6 * B);
    this.line(this.legR, this.pt(a, lean * 0.3, 2 * B, hipH + bob), footR, 2.6 * B);
    // torso + head
    this.line(this.torso, hip, sh, 6.5 * B);
    const hd = this.pt(a, lean * (1.15 + flat * 2.4), 0, shH + 4.5 * (1 - flat) + bob);
    this.head.position.set(hd[0], hd[1]); this.head.scale.set(0.42 * this.scale * B);
    if (this.art) this.placeArt(a, hip, sh, flat, lean, shH, bob);
    // weapon arm: shoulder (right side) -> hand along the blade angle -> blade
    const wa = a + pose.wAng, s0 = this.pt(a, lean, 3.5 * B, shH - 1 + bob);
    const handH = shH - 4 + pose.wLift + bob;
    const elbow = this.pt(a, lean + 2, 4.5 * B, shH - 3 + pose.wLift * 0.5 + bob);
    const hc = Math.cos(rad(wa)), hs = Math.sin(rad(wa));
    const hand = [s0[0] + hc * pose.reach * this.scale, s0[1] + hs * pose.reach * GROUND_Y * this.scale - (pose.wLift - 0) * 0.2 * this.scale];
    this.line(this.armB, s0, elbow, 2.4 * B);
    this.line(this.foreB, elbow, hand, 2.2 * B);
    const L = this.weaponLen;
    const tip = [hand[0] + hc * L * this.scale, hand[1] + hs * L * GROUND_Y * this.scale - pose.arms * 6 * this.scale];
    if (this.art) {
      const k = Math.round(Math.atan2(tip[1] - hand[1], tip[0] - hand[0]) / (TAU / ART_ANGLES));
      this.weapon.texture = this.art.weapon[((k % ART_ANGLES) + ART_ANGLES) % ART_ANGLES]; this.weapon.anchor.copyFrom(this.weapon.texture.defaultAnchor);
      this.weapon.position.set(Math.round(hand[0]), Math.round(hand[1])); this.weapon.rotation = 0; this.weapon.scale.set(1);
    } else this.line(this.weapon, hand, tip, 1.6);
    this.tip.x = x + tip[0]; this.tip.y = y + tip[1];
    // off arm hangs forward a little
    this.line(this.armF, this.pt(a, lean, -3.5 * B, shH - 1 + bob), this.pt(a, lean + 4 + pose.arms * 3, -5 * B, shH - 7 + pose.arms * 8 + bob), 2.2 * B);
    // draw order: facing away (up) puts the weapon arm behind the body
    const away = Math.sin(rad(a)) < -0.2;
    const T = this.body ? [this.torso, this.body] : [this.torso];
    const order = away ? [this.shadow, this.glow, this.armB, this.foreB, this.weapon, this.legL, this.legR, this.armF, ...T, this.head]
      : [this.shadow, this.glow, this.legL, this.legR, this.armF, ...T, this.head, this.armB, this.foreB, this.weapon];
    order.forEach((s, i) => { if (this.c.children[i] !== s) this.c.setChildIndex(s, i); });
    // hit flash
    if (this.flash > 0) this.flash -= dt;
    const tint = this.flash > 0 ? 0xffffff : this.color;
    for (const s of [this.legL, this.legR, this.torso, this.armB, this.foreB, this.armF]) s.tint = tint;
    if (this.art) {   // a multiply tint cannot whiten pixel art: the hit flash blinks the parts instead (no filter, no extra batch)
      const al = this.flash > 0 ? 0.35 : 1;
      this.body.alpha = al; this.head.alpha = al; this.weapon.alpha = al;
    }
  }

  /** Pixel torso and head: pick the front / side / back view from the facing, mirror the side view when facing left. */
  placeArt(a, hip, sh, flat, lean, shH, bob) {
    const s = Math.sin(rad(a)), c = Math.cos(rad(a));
    const view = s > 0.38 ? 'front' : s < -0.38 ? 'back' : 'side';
    const mx = view === 'side' && c < 0 ? -1 : 1;
    const b = this.body;
    b.texture = this.art.torso[view]; b.anchor.set(0.5);
    b.position.set(Math.round((hip[0] + sh[0]) / 2), Math.round((hip[1] + sh[1]) / 2));
    b.scale.set(mx, 1);
    const tilt = Math.atan2(sh[0] - hip[0], hip[1] - sh[1]);       // lying down / leaning hard: turn the torso with the spine
    b.rotation = flat > 0.3 || Math.abs(tilt) > 0.35 ? tilt : 0;
    if (!this.art.head) return;
    const nk = this.pt(a, lean * (1.15 + flat * 2.4), 0, shH + 0.5 * (1 - flat) + bob);
    this.head.texture = this.art.head[view]; this.head.anchor.copyFrom(this.head.texture.defaultAnchor);
    this.head.position.set(Math.round(nk[0]), Math.round(nk[1]));
    this.head.scale.set(mx, 1); this.head.rotation = b.rotation;
  }
}
