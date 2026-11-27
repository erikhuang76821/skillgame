// One set of on-screen controls for touch, mouse and keyboard (gdd/05 §2, README §7). All three end in the same byte:
//   movement  = 8 directions + "moving": the floating stick (touch / mouse inside the stick zone), WASD / arrows,
//               or click-to-move (mouse anywhere else: the player walks to the clicked point, holding keeps following)
//   actions   = one action code per tick, stamped with the event time (InputClock) so frame rate never matters
// The virtual buttons light up when their key is pressed, so keyboard players see the same feedback.
import {
  ACT_ATTACK, ACT_BLOCK, ACT_DODGE, ACT_SKILL1, ACT_SKILL2, ACT_SKILL3, ACT_SKILL4, ACT_ESCAPE, ACT_INTERACT, ACT_JUMP,
} from '../sim/sim.js';

export const BUTTONS = [
  { act: ACT_ATTACK, cls: 'attack', label: '攻', key: 'J' },
  { act: ACT_BLOCK, cls: 'block', label: '擋', key: 'K' },
  { act: ACT_DODGE, cls: 'dodge', label: '閃', key: 'Shift' },
  { act: ACT_JUMP, cls: 'jump', label: '跳', key: 'Space' },
  { act: ACT_ESCAPE, cls: 'escape', label: '脫', key: 'L' },
  { act: ACT_SKILL1, cls: 's1', label: '招一', key: 'U', slot: 0 },
  { act: ACT_SKILL2, cls: 's2', label: '招二', key: 'I', slot: 1 },
  { act: ACT_SKILL3, cls: 's3', label: '招三', key: 'O', slot: 2 },
  { act: ACT_SKILL4, cls: 's4', label: '招四', key: 'P', slot: 3 },
  { act: ACT_INTERACT, cls: 'interact', label: '互動', key: 'E' },
];
const KEY_ACT = { KeyJ: ACT_ATTACK, KeyK: ACT_BLOCK, ShiftLeft: ACT_DODGE, ShiftRight: ACT_DODGE, Space: ACT_JUMP, KeyL: ACT_ESCAPE, KeyU: ACT_SKILL1, KeyI: ACT_SKILL2,
  KeyO: ACT_SKILL3, KeyP: ACT_SKILL4, KeyE: ACT_INTERACT };
const KEY_DIR = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
// DX/DY order in the sim: down, down_right, right, up_right, up, up_left, left, down_left
const DIRS = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
/** 8-way index of a vector (screen axes), or -1 inside the dead zone. */
export function dirIndex(dx, dy, dead = 0) {
  if (dx * dx + dy * dy <= dead * dead) return -1;
  let best = -1, bd = -Infinity;
  for (let i = 0; i < 8; i++) { const [x, y] = DIRS[i], v = (x * dx + y * dy) / Math.hypot(x, y); if (v > bd) { bd = v; best = i; } }
  return best;
}

export class Controls {
  /**
   * @param hud      the #hud element (buttons are built into it)
   * @param stage    the element that receives pointer input on the game view
   * @param onAction (act, timeStamp) — called for every pressed action
   * @param toWorld  (clientX, clientY) -> { x, y } world pixels, for click-to-move
   */
  constructor(hud, stage, { onAction, toWorld, onGesture, uiOpen = () => false }) {
    this.onAction = onAction; this.toWorld = toWorld; this.onGesture = onGesture; this.uiOpen = uiOpen;
    this.keys = new Set(); this.stickDir = -1; this.target = null; this.enabled = true;
    // stick
    this.zone = el('div', 'stick-zone'); this.stick = el('div', 'stick'); this.knob = el('i');
    this.stick.append(this.knob); this.zone.append(this.stick); hud.append(this.zone);
    // buttons
    this.pad = el('div', 'pad'); this.btn = new Map();
    for (const b of BUTTONS) {
      const n = el('button', b.cls);
      n.type = 'button'; n.tabIndex = -1; n.setAttribute('aria-label', `${b.label}（${b.key}）`);   // in play Tab = retarget, so pad buttons stay out of the tab order
      n.innerHTML = `<span>${b.label}</span><kbd>${b.key}</kbd><span class="cd"></span>`;
      n.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.onGesture?.(); this.press(b.act, e.timeStamp); });
      this.pad.append(n); this.btn.set(b.act, n);
    }
    hud.append(this.pad);
    this.bindStick(); this.bindKeys(); this.bindMouse(stage);
  }

  press(act, ts) {
    if (!this.enabled) return;
    this.onAction(act, ts);
    const n = this.btn.get(act);
    if (n) { n.classList.add('down'); clearTimeout(n._t); n._t = setTimeout(() => n.classList.remove('down'), 110); }
    // touch layout: the pad is see-through while idle and opaque for a moment after any press (UX #2)
    this.pad.classList.add('hot'); clearTimeout(this._hot); this._hot = setTimeout(() => this.pad.classList.remove('hot'), 1500);
  }

  bindStick() {
    let id = null, ox = 0, oy = 0;
    const R = 46;
    this.zone.addEventListener('pointerdown', e => {
      if (id !== null) return;
      e.preventDefault(); this.onGesture?.();
      id = e.pointerId; ox = e.clientX; oy = e.clientY; this.target = null;
      this.zone.setPointerCapture(id);
      Object.assign(this.stick.style, { display: 'block', left: `${ox}px`, top: `${oy}px` });
      this.knob.style.transform = '';
    });
    this.zone.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.stickDir = dirIndex(dx, dy, 12);
    });
    const end = e => { if (e.pointerId !== id) return; id = null; this.stickDir = -1; this.stick.style.display = 'none'; };
    this.zone.addEventListener('pointerup', end); this.zone.addEventListener('pointercancel', end);
  }

  bindKeys() {
    addEventListener('keydown', e => {
      this.onGesture?.();
      if (this.uiOpen()) return;          // a panel is open: Tab / Space / Enter / arrows belong to its buttons (UX #3)
      if (KEY_DIR[e.code]) { this.keys.add(e.code); this.target = null; e.preventDefault(); return; }
      const act = KEY_ACT[e.code];
      if (act && !e.repeat) { e.preventDefault(); this.press(act, e.timeStamp); }
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  // Mouse only: click (and hold) on the ground = walk there. A mouse cannot hold a stick and click a button at once,
  // so movement becomes "go to the point"; attacks turn toward the foe on the player's line by themselves.
  bindMouse(stage) {
    let held = false;
    stage.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      this.onGesture?.(); held = true; this.target = this.toWorld(e.clientX, e.clientY);
    });
    stage.addEventListener('pointermove', e => { if (held && e.pointerType === 'mouse') this.target = this.toWorld(e.clientX, e.clientY); });
    addEventListener('pointerup', e => { if (e.pointerType === 'mouse') held = false; });
  }

  /** Direction index for this tick, given the player's position in world pixels (-1 = stand still). */
  direction(px, py) {
    let dx = 0, dy = 0;
    for (const k of this.keys) { dx += KEY_DIR[k][0]; dy += KEY_DIR[k][1]; }
    if (dx || dy) return dirIndex(dx, dy);
    if (this.stickDir >= 0) return this.stickDir;
    if (this.target) {
      const d = dirIndex(this.target.x - px, this.target.y - py, 3);
      if (d < 0) this.target = null;
      return d;
    }
    return -1;
  }

  /** Cooldowns, empty skill slots and the interact button (render only). */
  update(sim, slotsNames) {
    const p = sim.p;
    const cd = (act, ticks) => {
      const n = this.btn.get(act); if (!n) return;
      n.classList.toggle('cooling', ticks > 0);
      n.querySelector('.cd').textContent = ticks > 0 ? Math.ceil(ticks / 60) : '';
    };
    cd(ACT_BLOCK, p.st === 5 ? 0 : p.cd[0]); cd(ACT_ESCAPE, p.cd[1]);
    for (let s = 0; s < 4; s++) {
      const n = this.btn.get(ACT_SKILL1 + s), name = slotsNames[s];
      n.classList.toggle('empty', !name);  // empty slots are hidden until a skill is put there (UX #6)
      n.querySelector('span').textContent = name || '';
      cd(ACT_SKILL1 + s, p.cd[2 + s]);
    }
  }
  showInteract(on, label = '互動') {
    const n = this.btn.get(ACT_INTERACT);
    n.classList.toggle('show', on); n.querySelector('span').textContent = label;
  }
}

function el(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }
