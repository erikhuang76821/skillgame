// DOM HUD and panels (0 draw calls). Reads sim values handed to it; never writes to the sim.
// Panels: title (how points are scored, spec §6 / fairness E4) and result (the score broken down item by item,
// plus the on-device replay check, fairness E7).
import { gsap } from 'gsap';
import { GEAR_ICON } from './icons.js';
import { FEEL } from '../fx/feel.js';

const $ = sel => document.querySelector(sel);
const el = {
  score: $('#hud .score'), chain: $('#hud .chain'), shields: $('#hud .shields'), section: $('#hud .section'),
  boss: $('#hud .boss'), bossFill: $('#hud .boss i'), bossShield: $('#hud .boss u'), banner: $('#hud .banner'),
  title: $('#panel-title'), result: $('#panel-result'), rows: $('#panel-result .rows'), total: $('#panel-result .total'),
  verify: $('#panel-result .verify'), best: $('#panel-result .best'), headline: $('#panel-result h2'),
  mute: $('#btn-mute'), low: $('#btn-low'),
  build: $('#hud .build'), shade: $('#hud .shade'), count: $('#hud .count'), note: $('#hud .note'),
  pick: $('#panel-pick'), pickTitle: $('#panel-pick h2'), pickSub: $('#panel-pick .sub'), opts: $('#panel-pick .opts'), next: $('#panel-pick .next'),
};
let builtKey = '';

let shown = { score: -1, chain: -1, shields: -1, section: '' };

const punch = node => {
  if (!FEEL.enabled) return;
  gsap.fromTo(node, { scale: FEEL.ui.punch }, { scale: 1, duration: FEEL.ui.punchDur, ease: 'back.out(3)', overwrite: true });
};

function panel(node, on) {
  if (on === !node.hidden) return;
  if (on) {
    node.hidden = false;
    if (FEEL.enabled) gsap.fromTo(node, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: FEEL.ui.in, ease: FEEL.ui.inEase, overwrite: true });
    else gsap.set(node, { opacity: 1, y: 0 });
  } else if (FEEL.enabled) gsap.to(node, { opacity: 0, y: -12, duration: FEEL.ui.out, ease: FEEL.ui.outEase, overwrite: true, onComplete: () => { node.hidden = true; } });
  else node.hidden = true;
}

export const hud = {
  reset(maxShields) {
    shown = { score: -1, chain: -1, shields: -1, section: '' };
    el.shields.replaceChildren(...Array.from({ length: maxShields }, () => document.createElement('i')));
    el.boss.hidden = true;
    el.banner.hidden = true;
    el.build.replaceChildren(); builtKey = '';
    el.shade.hidden = true; el.count.hidden = true; el.pick.hidden = true; el.note.hidden = true;
  },

  /** The build row: [{ name, level, kind }] (ui/cards.js buildOf). Touches the DOM only when the build changed. */
  build(items) {
    const key = items.map(i => i.name + i.level).join('|');
    if (key === builtKey) return;
    builtKey = key;
    el.build.replaceChildren(...items.map(i => { const s = document.createElement('span'); s.className = i.kind; s.textContent = i.level ? `${i.name} ${i.level}` : i.name; return s; }));
  },

  /** The choice panel (spec §8). `v` from ui/cards.js choiceView(); onPick(0-2) is called once. v = null closes it. */
  /** `reward` = this supply was won from a boss: the panel pops in as a prize instead of sliding in. */
  pick(v, onPick, reward = false) {
    el.shade.hidden = !v; el.shade.style.opacity = v && reward ? FEEL.pick.shade : '';   // a boss's supply: a lighter shade, the flight behind it stays readable
    if (!v) { panel(el.pick, false); return; }
    el.pickTitle.textContent = v.title; el.pickSub.textContent = v.sub; el.next.textContent = v.next;
    el.opts.replaceChildren(...v.options.map((o, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'opt';
      b.innerHTML = '<span class="pic"><span class="ico"></span><span class="tag"></span></span><span class="name"></span><span class="lv"></span><span class="text"></span><span class="evo"></span>';
      b.querySelector('.ico').innerHTML = GEAR_ICON[o.icon];   // our own static SVG, not user text
      b.querySelector('.tag').textContent = o.tag; b.children[1].textContent = o.name; b.children[2].textContent = `第 ${o.level}／${o.max} 級　[${i + 1}]`;
      b.children[3].textContent = o.text; b.children[4].textContent = o.evo ?? ''; b.children[4].hidden = !o.evo;
      b.addEventListener('click', e => { e.stopPropagation(); onPick(i); });
      return b;
    }));
    panel(el.pick, true);
    if (FEEL.enabled && reward) gsap.fromTo(el.pick, { scale: FEEL.pick.popFrom }, { scale: 1, duration: FEEL.pick.pop, ease: 'back.out(1.7)' });
    else gsap.set(el.pick, { scale: 1 });
    if (FEEL.enabled) gsap.from(el.opts.children, { opacity: 0, y: 14, duration: 0.2, stagger: { each: FEEL.ui.stagger }, immediateRender: true });
  },

  /** A quiet line for things that must not interrupt (a new chapter's name during a boost): no bar, no hold. */
  note(text) {
    el.note.textContent = text;
    el.note.hidden = false;
    const hide = () => { el.note.hidden = true; };
    if (!FEEL.enabled) { gsap.set(el.note, { opacity: 1 }); gsap.delayedCall(2, hide); return; }
    gsap.timeline({ onComplete: hide }).fromTo(el.note, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4 }).to(el.note, { opacity: 0, duration: 0.5, ease: 'power2.in' }, '+=1.6');
  },

  /** The count-in after a choice: a number, or null to hide. */
  countdown(n) {
    if (n === null) { el.count.hidden = true; return; }
    if (el.count.hidden || el.count.textContent !== String(n)) { el.count.hidden = false; el.count.textContent = n; punch(el.count); }
  },

  /** Called every frame; touches the DOM only when a value changed. */
  update({ score, chain, shields, maxShields = 0, section, bossHp, bossMax, bossStaged = false, bossShield = -1 }) {
    if (maxShields && maxShields !== el.shields.children.length) {   // the ship can hold more life now: one more pip
      el.shields.replaceChildren(...Array.from({ length: maxShields }, () => document.createElement('i')));
      shown.shields = -1;
    }
    if (score !== shown.score) { el.score.textContent = score; if (shown.score >= 0) punch(el.score); shown.score = score; }
    if (chain !== shown.chain) {
      el.chain.textContent = chain > 1 ? `連鎖 ${chain}` : '';
      if (chain > shown.chain && chain > 1 && chain % 5 === 0) punch(el.chain);
      shown.chain = chain;
    }
    if (shields !== shown.shields) {
      [...el.shields.children].forEach((n, i) => n.classList.toggle('lost', i >= shields));
      shown.shields = shields;
    }
    if (section !== shown.section) { el.section.textContent = section; shown.section = section; }
    if (bossHp > 0) {
      el.boss.hidden = false; el.bossFill.style.transform = `scaleX(${Math.max(0, bossHp / bossMax)})`;
      el.boss.classList.toggle('staged', bossStaged);        // a boss: the bar is cut where its stages break
      el.bossShield.hidden = bossShield < 0; if (bossShield >= 0) el.bossShield.style.transform = `scaleX(${Math.max(0, bossShield)})`;
    }
    else el.boss.hidden = true;
  },

  banner(text) {
    el.banner.textContent = text;
    el.banner.hidden = false;
    const hide = () => { el.banner.hidden = true; };
    if (!FEEL.enabled) { gsap.set(el.banner, { opacity: 1, scaleX: 1 }); gsap.delayedCall(1.4, hide); return; }
    gsap.timeline({ onComplete: hide })
      .fromTo(el.banner, { opacity: 0, scaleX: 0.6 }, { opacity: 1, scaleX: 1, duration: 0.2, ease: 'power4.out' })
      .to(el.banner, { opacity: 0, duration: 0.25, ease: 'power2.in' }, '+=1.1');
  },

  title(on) { panel(el.title, on); },

  /** @param r { headline, rows: [[label, detail, points]], total, best, isBest, verified, reason, cleared?: { line, next } }
   *  With `cleared` (a leg flown to the end): a congratulation, and one button back to the stage map instead of the
   *  retry buttons. */
  result(r) {
    if (!r) { panel(el.result, false); return; }
    el.headline.textContent = r.headline;
    const box = el.result.querySelector('.congrats'), won = !!r.cleared;
    box.hidden = !won;
    if (won) { box.querySelector('.line').textContent = r.cleared.line; box.querySelector('.next-leg').textContent = r.cleared.next; }
    for (const id of ['btn-retry', 'btn-next']) document.getElementById(id).hidden = won;
    document.getElementById('btn-home').hidden = !won;
    el.rows.replaceChildren(...r.rows.map(([label, detail, pts]) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = '<span></span><span class="detail"></span><b></b>';
      row.children[0].textContent = label; row.children[1].textContent = detail; row.children[2].textContent = pts;
      return row;
    }));
    el.total.textContent = r.total;
    el.best.textContent = r.isBest ? '新的最佳紀錄' : `最佳紀錄 ${r.best}`;
    el.verify.textContent = r.verified ? '重播驗證通過 ✓' : `重播驗證失敗：${r.reason}`;
    el.verify.classList.toggle('bad', !r.verified);
    panel(el.result, true);
    if (FEEL.enabled) gsap.from(el.rows.children, { opacity: 0, x: -16, duration: 0.2, stagger: { each: FEEL.ui.stagger }, delay: 0.1 });
    if (FEEL.enabled && won) gsap.from([el.headline, box], { scale: 0.6, opacity: 0, duration: 0.35, ease: 'back.out(1.7)', stagger: { each: 0.08 } });
  },

  toggles({ muted, low }) {
    el.mute.textContent = muted ? '靜音' : '音效';
    el.mute.setAttribute('aria-pressed', String(!muted));
    el.low.textContent = low ? '低特效' : '特效';
    el.low.setAttribute('aria-pressed', String(!low));
  },
  onMute(fn) { el.mute.addEventListener('click', e => { e.stopPropagation(); fn(); }); },
  onLow(fn) { el.low.addEventListener('click', e => { e.stopPropagation(); fn(); }); },
};
