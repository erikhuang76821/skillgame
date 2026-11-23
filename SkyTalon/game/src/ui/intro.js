// Each leg's departure cutscene: four painted keyframes played as a short film (camera drift, crossfades, embers, a
// shake when the wave wall rises, the launch's flash and speed lines) with subtitles. DOM + GSAP only, over the
// stage: 0 draw calls, no video file (the four pictures are the whole cost). Click, tap, Space, Enter or Esc skips.
// Story: gdd/05 v8 §5 (the ancient gods want to rule the universe; Earth is the last bastion). Leg two picks up where
// leg one ends: Atlas falls in orbit, the vanguard pulls back, and Earth turns to attack the moon, the gods' forward base.
import { gsap } from 'gsap';
import { FEEL } from '../fx/feel.js';
import s1 from '../assets/intro/s1_gods_descend.webp';
import s2 from '../assets/intro/s2_last_bastion.webp';
import s3 from '../assets/intro/s3_hangar.webp';
import s4 from '../assets/intro/s4_launch.webp';
import t1 from '../assets/intro2/s1_atlas_falls.webp';
import t2 from '../assets/intro2/s2_moon_base.webp';
import t3 from '../assets/intro2/s3_fleet_gathers.webp';
import t4 from '../assets/intro2/s4_to_the_moon.webp';
import l3s1 from '../assets/intro3/s1_inner_retaken.webp';
import l3s2 from '../assets/intro3/s2_mars_twins.webp';
import l3s3 from '../assets/intro3/s3_jupiter_storm.webp';
import l3s4 from '../assets/intro3/s4_outer_giants.webp';
import l4s1 from '../assets/intro4/s1_rings_fall.webp';
import l4s2 from '../assets/intro4/s2_flee_to_edge.webp';
import l4s3 from '../assets/intro4/s3_styx.webp';
import l4s4 from '../assets/intro4/s4_into_the_dark.webp';
import l5s1 from '../assets/intro5/s1_styx_breaks.webp';
import l5s2 from '../assets/intro5/s2_sun_fire.webp';
import l5s3 from '../assets/intro5/s3_black_hole.webp';
import l5s4 from '../assets/intro5/s4_into_the_glare.webp';
import l6s1 from '../assets/intro6/s1_chaos_breaks.webp';
import l6s2 from '../assets/intro6/s2_time_warp.webp';
import l6s3 from '../assets/intro6/s3_mesozoic.webp';
import l6s4 from '../assets/intro6/s4_prehistoric_sortie.webp';

const LEG1 = [
  { src: s1, text: '古代眾神甦醒，要把整個宇宙收進祂們手中。', from: { scale: 1.16, yPercent: 4 }, to: { scale: 1.02, yPercent: 0 }, embers: true },
  { src: s2, text: '先鋒艦隊壓境，海岸防線一盞接一盞熄滅。地球，是最後的壁壘。', from: { scale: 1.04, yPercent: -2 }, to: { scale: 1.14, yPercent: 2 }, shake: true, embers: true },
  { src: s3, text: '臨海地下機庫，最後一排誘導燈亮起。', from: { scale: 1.2, yPercent: 6 }, to: { scale: 1.04, yPercent: -2 } },
  { src: s4, text: '航段一　守住地球　出擊！', from: { scale: 1.02, yPercent: 0 }, to: { scale: 1.22, yPercent: -6 }, launch: true, highlight: true },
];
const LEG2 = [
  { src: t1, text: '天穹碎裂，阿特拉斯倒下。先鋒艦隊撤出了地球軌道。', from: { scale: 1.18, yPercent: 3 }, to: { scale: 1.04, yPercent: 0 }, shake: true, embers: true, burst: true },
  { src: t2, text: '但月亮已落入塞勒涅手中，成了眾神的前進基地。', from: { scale: 1.04, yPercent: -3 }, to: { scale: 1.16, yPercent: 2 } },
  { src: t3, text: '地球集結最後的艦隊，這一次，換我們出擊。', from: { scale: 1.16, yPercent: 4 }, to: { scale: 1.03, yPercent: -2 } },
  { src: t4, text: '航段二　反攻內圈　出擊！', from: { scale: 1.02, yPercent: 2 }, to: { scale: 1.2, yPercent: -6 }, launch: true, highlight: true },
];
// each leg picks up where the last one ended
const LEG3 = [
  { src: l3s1, text: '涅墨西斯倒下，內圈重回人類手中。', from: { scale: 1.16, yPercent: 3 }, to: { scale: 1.03, yPercent: 0 }, embers: true },
  { src: l3s2, text: '但火星的紅色天空裡，戰神的雙子艦隊正在集結。', from: { scale: 1.04, yPercent: -2 }, to: { scale: 1.15, yPercent: 2 } },
  { src: l3s3, text: '木星的雷雲深處，外圈的巨神在等著我們。', from: { scale: 1.18, yPercent: 4 }, to: { scale: 1.04, yPercent: -2 }, shake: true },
  { src: l3s4, text: '航段三　外圈巨神　出擊！', from: { scale: 1.02, yPercent: 2 }, to: { scale: 1.2, yPercent: -6 }, launch: true, highlight: true },
];
const LEG4 = [
  { src: l4s1, text: '雅努斯沉入土星環，外圈巨神潰散。', from: { scale: 1.16, yPercent: 3 }, to: { scale: 1.03, yPercent: 0 }, burst: true },
  { src: l4s2, text: '殘存的艦隊逃往太陽系的邊緣，冥界的入口。', from: { scale: 1.04, yPercent: -2 }, to: { scale: 1.15, yPercent: 2 } },
  { src: l4s3, text: '冥河在冥王星外流淌，渡船在霧裡等著。', from: { scale: 1.18, yPercent: 4 }, to: { scale: 1.04, yPercent: -2 } },
  { src: l4s4, text: '航段四　冥界邊境　出擊！', from: { scale: 1.02, yPercent: 2 }, to: { scale: 1.2, yPercent: -6 }, launch: true, highlight: true },
];
const LEG5 = [
  { src: l5s1, text: '冥河斷流，眾神失去了最後的退路。', from: { scale: 1.16, yPercent: 3 }, to: { scale: 1.03, yPercent: 0 }, burst: true },
  { src: l5s2, text: '祂們把剩下的力量全押在太陽上，日冕翻湧成一片火海。', from: { scale: 1.04, yPercent: -2 }, to: { scale: 1.15, yPercent: 2 }, embers: true },
  { src: l5s3, text: '而在太陽背後，一個黑洞正睜開眼睛。', from: { scale: 1.2, yPercent: 4 }, to: { scale: 1.04, yPercent: -2 }, shake: true },
  { src: l5s4, text: '航段五　太陽與黑洞　出擊！', from: { scale: 1.02, yPercent: 2 }, to: { scale: 1.2, yPercent: -6 }, launch: true, highlight: true },
];
const LEG6 = [
  { src: l6s1, text: '混沌碎裂，黑洞吞下了眾神艦隊的殘骸。', from: { scale: 1.16, yPercent: 3 }, to: { scale: 1.03, yPercent: 0 }, burst: true, shake: true },
  { src: l6s2, text: '戰機被捲進黑洞，時間開始倒轉。', from: { scale: 1.04, yPercent: 0 }, to: { scale: 1.22, yPercent: 0 } },
  { src: l6s3, text: '醒來時，眼前是一億年前的地球。發光的碎片，嵌進了恐龍的身體。', from: { scale: 1.18, yPercent: 4 }, to: { scale: 1.04, yPercent: -2 }, embers: true },
  { src: l6s4, text: '航段六　失落的中生代　出擊！', from: { scale: 1.02, yPercent: 2 }, to: { scale: 1.2, yPercent: -6 }, launch: true, highlight: true },
];
/** The cutscene that opens each leg (by the leg number on the map; leg one is LEGS[0], which has no `leg` field). */
export const INTROS = { 1: LEG1, 2: LEG2, 3: LEG3, 4: LEG4, 5: LEG5, 6: LEG6 };

/** Play the cutscene over the page; resolves when it ends or is skipped. Plays nothing (resolves at once) if a
 *  picture fails to load. `onReveal` runs the moment it starts to hand over (the match starts under the film), so the
 *  last thing seen is the camera diving into the sky and the battlefield coming through, never the stage map. */
export function playIntro(leg, { onReveal } = {}) {
  const SCENES = INTROS[leg];
  if (!SCENES) { onReveal?.(); return Promise.resolve(); }
  const C = FEEL.intro, reduce = !FEEL.enabled;
  return new Promise(resolve => {
    const root = document.createElement('div');
    root.className = 'intro';
    root.innerHTML = '<div class="intro-film"></div><div class="intro-sub"></div><button type="button" class="intro-skip">跳過 ▸</button>';
    const film = root.querySelector('.intro-film'), sub = root.querySelector('.intro-sub');
    const layers = SCENES.map(s => { const img = document.createElement('img'); img.src = s.src; img.alt = ''; img.decoding = 'async'; film.append(img); return img; });
    const flash = document.createElement('div'); flash.className = 'intro-flash'; film.append(flash);
    document.body.append(root);

    let done = false;
    const tl = gsap.timeline({ paused: true, onComplete: () => finish() });
    const finish = () => {
      if (done) return; done = true;
      removeEventListener('keydown', onKey, true);
      tl.kill();
      onReveal?.();
      // the hand-over: the camera dives forward into the sky, a warm flash, and the battlefield shows through
      gsap.timeline({ onComplete: () => { root.remove(); resolve(); } })
        .to(film, { scale: reduce ? 1 : C.dive, duration: C.outro, ease: 'power2.in' }, 0)
        .to(sub, { opacity: 0, duration: 0.2 }, 0)
        .to(flash, { opacity: reduce ? 0.4 : 0.9, duration: C.outro * 0.55, ease: 'power2.in' }, 0)
        .to(root, { opacity: 0, duration: C.outro * 0.55, ease: 'power1.out' }, C.outro * 0.45);
    };
    const onKey = e => { if ([' ', 'Enter', 'Escape'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); finish(); } };
    root.addEventListener('pointerdown', e => { e.stopPropagation(); finish(); });
    addEventListener('keydown', onKey, true);

    // embers drifting up (scenes that burn); speed lines for the launch
    const motes = [];
    const ember = () => { const d = document.createElement('i'); d.className = 'intro-ember'; film.append(d); motes.push(d); return d; };
    const streak = () => { const d = document.createElement('i'); d.className = 'intro-streak'; film.append(d); motes.push(d); return d; };

    let t = 0;
    SCENES.forEach((s, i) => {
      const img = layers[i], len = C.scene[i];
      tl.set(img, { opacity: 0, ...s.from }, 0);
      tl.to(img, { opacity: 1, duration: C.fade, ease: 'power1.out' }, t);
      tl.to(img, { ...(reduce ? {} : s.to), duration: len + C.fade, ease: 'none' }, t);
      if (i > 0) tl.to(layers[i - 1], { opacity: 0, duration: C.fade, ease: 'power1.in' }, t);
      tl.call(() => { sub.textContent = s.text; sub.classList.toggle('hl', !!s.highlight); }, null, t + C.fade * 0.5);
      tl.fromTo(sub, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', immediateRender: false }, t + C.fade * 0.5);
      tl.to(sub, { opacity: 0, duration: 0.25, ease: 'power1.in' }, t + len + C.fade * 0.4);
      if (!reduce && s.embers) for (let k = 0; k < C.embers; k++) {
        const d = ember(), x = Math.random() * 100, at = t + Math.random() * len;
        tl.fromTo(d, { left: `${x}%`, top: '104%', opacity: 0, scale: 0.6 + Math.random() * 0.8 },
          { top: `${40 + Math.random() * 40}%`, left: `${x + (Math.random() - 0.5) * 12}%`, opacity: 0.9, duration: 1.6 + Math.random() * 1.4, ease: 'power1.out', immediateRender: false }, at);
        tl.to(d, { opacity: 0, duration: 0.5 }, at + 1.4);
      }
      if (!reduce && s.shake) tl.to(film, { x: () => (Math.random() - 0.5) * C.shake, y: () => (Math.random() - 0.5) * C.shake, duration: 0.05, repeat: 23, yoyo: true, ease: 'none' }, t + len * 0.35)
        .set(film, { x: 0, y: 0 }, t + len * 0.35 + 1.25);
      if (s.burst) tl.fromTo(flash, { opacity: 0 }, { opacity: reduce ? 0.35 : 0.75, duration: 0.1, ease: 'power4.out', immediateRender: false }, t + len * 0.3)
        .to(flash, { opacity: 0, duration: 0.8, ease: 'power2.out' }, '>');
      if (s.launch) {
        tl.fromTo(flash, { opacity: 0 }, { opacity: reduce ? 0.4 : 0.85, duration: 0.12, ease: 'power4.out', immediateRender: false }, t + len * 0.25)
          .to(flash, { opacity: 0, duration: 0.6, ease: 'power2.out' }, '>');
        if (!reduce) for (let k = 0; k < C.streaks; k++) {
          const d = streak(), x = Math.random() * 100, at = t + len * 0.25 + Math.random() * (len * 0.7);
          tl.fromTo(d, { left: `${x}%`, top: '-30%', opacity: 0 }, { top: '120%', opacity: 0.7, duration: 0.35 + Math.random() * 0.25, ease: 'none', immediateRender: false }, at);
        }
      }
      t += len;
    });
    tl.to({}, { duration: C.hold }, t);

    // start once the pictures have loaded, so the film never shows a half-loaded frame
    Promise.all(layers.map(img => (img.complete && img.naturalWidth ? Promise.resolve() : new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('intro picture')); }))))   // load events: decode() can stall in a background tab
      .then(() => { if (!done) tl.play(0); })
      .catch(() => { done = true; removeEventListener('keydown', onKey, true); root.remove(); resolve(); });
  });
}
