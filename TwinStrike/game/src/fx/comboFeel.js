// Combo tiers (gdd/06_combo_feel.md): tracks the combo the sim reports and drives the DOM combo counter,
// milestone banners, the view's beat effects and the BGM layers. Never touches the sim or the score.
import { gsap } from 'gsap';
import { FEEL } from './feel.js';

export const tierOf = combo => {
  const at = FEEL.combo.at;
  let t = 0;
  while (t + 1 < at.length && combo >= at[t + 1]) t++;
  return t;
};

export class ComboFeel {
  /** @param o { view, bgm, sfx, counter: HTMLElement, banner: HTMLElement } */
  constructor(o) { Object.assign(this, o); this.tier = 0; this.best = 0; }

  reset() {
    this.tier = 0; this.best = 0;
    this.counter.dataset.tier = '0';
    this.counter.classList.remove('broken');
    this.counter.textContent = '';
    gsap.set(this.counter, { clearProps: 'all' });
    gsap.set(this.banner, { opacity: 0 });
  }

  /** Called after each sim tick with the combo before and after it. */
  update(before, after) {
    if (after > before) this.hit(after);
    else if (after < before) this.broke(before);
  }

  hit(combo) {
    this.best = Math.max(this.best, combo);
    const t = tierOf(combo), C = FEEL.combo;
    if (t !== this.tier) {
      this.tier = t;
      this.view.setTier(t);
      this.bgm.setTier(t);
      this.milestone(combo, t);
    } else if (t === C.at.length - 1 && combo > C.at[t] && (combo - C.at[t]) % C.repeatEvery === 0) {
      this.milestone(combo, t);
    }
    const el = this.counter;
    el.classList.remove('broken');
    el.dataset.tier = String(t);
    if (combo < 2) { el.textContent = ''; return; }
    el.innerHTML = `<b>${combo}</b> 連擊`;
    if (!FEEL.enabled) return;
    const k = 1.15 + 0.06 * t;                                     // higher tier = bigger, springier bump
    gsap.fromTo(el, { scale: k, rotation: t >= 2 ? -4 : 0 }, { scale: 1, rotation: 0, duration: 0.22 + 0.04 * t, ease: `elastic.out(1, ${0.5 - 0.05 * t})`, overwrite: true });
  }

  milestone(combo, t) {
    const C = FEEL.combo, el = this.banner;
    this.sfx.play('stinger', { pitch: 2 ** (C.transpose[t] / 12) });
    el.dataset.tier = String(t);
    el.innerHTML = `<b>${combo} 連擊！</b><span>${C.name[t]}</span>`;
    const { in: tin, hold, out } = C.banner;
    if (!FEEL.enabled) {                                           // reduced motion: fade only
      gsap.timeline().fromTo(el, { opacity: 0, x: 0, skewX: 0, scale: 1 }, { opacity: 1, duration: tin }).to(el, { opacity: 0, duration: out }, `>+${hold}`);
      return;
    }
    gsap.timeline()
      .fromTo(el, { opacity: 0, xPercent: -60, skewX: -18, scale: 0.9 }, { opacity: 1, xPercent: 0, skewX: -8, scale: 1, duration: tin, ease: 'power4.out' })
      .fromTo(el.querySelector('span'), { scale: 1.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(3)' }, '<0.08')
      .to(el, { opacity: 0, xPercent: 50, skewX: -18, duration: out, ease: 'power2.in' }, `>+${hold}`);
  }

  broke(prev) {
    const C = FEEL.combo;
    if (this.tier) { this.tier = 0; this.view.setTier(0); }
    if (prev < C.breakMin) { this.counter.textContent = ''; this.counter.dataset.tier = '0'; return; }
    this.view.comboBreak();
    this.bgm.comboBreak();
    const el = this.counter;
    el.dataset.tier = '0';
    el.classList.add('broken');
    el.innerHTML = `<b>斷！</b> 最高 ${this.best} 連擊`;
    gsap.timeline({ onComplete: () => { if (el.classList.contains('broken')) { el.textContent = ''; el.classList.remove('broken'); } } })
      .fromTo(el, { x: -6, y: 0, opacity: 1, rotation: 0, scale: 1.1 }, { x: 0, duration: 0.25, ease: 'elastic.out(1.2, 0.2)', overwrite: true })
      .to(el, { y: FEEL.enabled ? 24 : 0, rotation: FEEL.enabled ? 6 : 0, opacity: 0, duration: 0.45, ease: 'power2.in' }, '>+0.35');
  }
}
