// One-thumb portrait controls + keyboard, quantised to one byte per sim tick:
// bits0-3 direction (0 = idle, 1..8 = sprite-row order + 1), bit4 dash, bit5 howl (gdd/10).
//   Touch / mouse: drag anywhere = floating stick · quick tap (any finger) = dash · Howl button.
//   Keyboard:      WASD / arrows · Space or Shift = dash · E = howl.
import { IN_DASH, IN_HOWL } from './sim/sim.js';

// [dx+1][dy+1] -> direction code
const CODE = [
  [6, 7, 8], // dx = -1: up_left, left, down_left
  [5, 0, 1], // dx =  0: up, idle, down
  [4, 3, 2], // dx = +1: up_right, right, down_right
];
const DEADZONE = 14;   // css px before a press becomes a stick
const TAP_MS = 220;    // shorter press without movement = dash

export class Input {
  constructor(target) {
    this.keys = new Set();
    this.dash = false;
    this.howl = false;
    this.enabled = false;
    this.stick = null;        // { id, ox, oy, x, y, live }
    this.taps = new Map();    // pointerId -> { t, x, y }
    this.isButton = () => false; // set by the game: (clientX, clientY) -> 'howl' | false

    addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (k.startsWith('arrow') || k === ' ') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(k);
      if (k === ' ' || k === 'shift') this.dash = true;
      if (k === 'e') this.howl = true;
    });
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => { this.keys.clear(); this.reset(); });

    target.addEventListener('pointerdown', e => this.down(e));
    addEventListener('pointermove', e => this.move(e));
    addEventListener('pointerup', e => this.up(e));
    addEventListener('pointercancel', e => { this.taps.delete(e.pointerId); if (this.stick?.id === e.pointerId) this.stick = null; });
    target.addEventListener('contextmenu', e => e.preventDefault());
  }

  down(e) {
    if (!this.enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    if (this.isButton(e.clientX, e.clientY) === 'howl') { this.howl = true; return; }
    this.taps.set(e.pointerId, { t: performance.now(), x: e.clientX, y: e.clientY });
    if (!this.stick) this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, live: false };
  }

  move(e) {
    const s = this.stick;
    if (s && e.pointerId === s.id) {
      s.x = e.clientX; s.y = e.clientY;
      if (!s.live && Math.hypot(s.x - s.ox, s.y - s.oy) > DEADZONE) s.live = true;
    }
    const tap = this.taps.get(e.pointerId);
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > DEADZONE) this.taps.delete(e.pointerId);
  }

  up(e) {
    const tap = this.taps.get(e.pointerId);
    this.taps.delete(e.pointerId);
    if (tap && performance.now() - tap.t < TAP_MS && this.enabled) this.dash = true;
    if (this.stick?.id === e.pointerId) this.stick = null;
  }

  direction() {
    const k = this.keys;
    let dx = (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('a') ? 1 : 0);
    let dy = (k.has('arrowdown') || k.has('s') ? 1 : 0) - (k.has('arrowup') || k.has('w') ? 1 : 0);
    const s = this.stick;
    if (!dx && !dy && s?.live) {
      const sector = ((Math.round(Math.atan2(s.y - s.oy, s.x - s.ox) / (Math.PI / 4)) % 8) + 8) % 8; // 0 = right, clockwise
      dx = [1, 1, 0, -1, -1, -1, 0, 1][sector];
      dy = [0, 1, 1, 1, 0, -1, -1, -1][sector];
    }
    return CODE[dx + 1][dy + 1];
  }

  // Consumes the edge-triggered buttons; call once per sim step.
  byte() {
    let b = this.direction();
    if (this.dash) b |= IN_DASH;
    if (this.howl) b |= IN_HOWL;
    this.dash = this.howl = false;
    return b;
  }

  reset() { this.dash = this.howl = false; this.stick = null; this.taps.clear(); }
}
