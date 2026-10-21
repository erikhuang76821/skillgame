// Portrait title, level-up and results screens (720 x H logical). GSAP is used only here (UI),
// never in the sim. In low-FX / reduced-motion mode intros are skipped entirely.
import { Container, Graphics, Sprite } from 'pixi.js';
import { gsap } from 'gsap';
import S from '../i18n/en-US.js';
import { UPGRADES } from '../sim/content.js';
import { C, button, icon, panel, pips, text } from './theme.js';

const W = 720;

// gsap.killTweensOf([a, b]) leaves not-yet-started tweens alive (GSAP 3.15); kill per target.
const killAll = list => list.forEach(t => gsap.killTweensOf(t));

// Intro = jump to an offset/transparent state, then gsap.to() back. Plain to() tweens hold no
// start-state to revert, so killing them right before destroy() is always safe.
function intro(rich, targets, { dx = 0, dy = 0, stagger = 0, delay = 0, ...timing }) {
  if (!rich) return;
  [].concat(targets).forEach((t, i) => {
    const { x, y } = t;
    t.x += dx; t.y += dy; t.alpha = 0;
    gsap.to(t, { x, y, alpha: 1, ...timing, delay: delay + i * stagger });
  });
}

function dim(h, alpha = 0.6) {
  return new Graphics().rect(0, 0, W, h).fill({ color: 0x03060c, alpha });
}

// Ribbon banner used for LEVEL UP / results headlines.
function banner(label, color, darker) {
  const c = new Container();
  const g = c.addChild(new Graphics());
  g.poly([-300, 0, -330, 34, -300, 68, -260, 68, -260, 0]).fill(darker).stroke({ width: 4, color: C.ink });
  g.poly([300, 0, 330, 34, 300, 68, 260, 68, 260, 0]).fill(darker).stroke({ width: 4, color: C.ink });
  g.roundRect(-270, -8, 540, 80, 12).fill(color).stroke({ width: 4, color: C.ink });
  g.roundRect(-258, -2, 516, 18, 8).fill({ color: 0xffffff, alpha: 0.28 });
  text(c, label, 46, C.text, 0, 32, { stroke: { color: C.ink, width: 8 }, letterSpacing: 2 }, [0.5, 0.5]);
  return c;
}

const LOGO = { stroke: { color: 0x2a1408, width: 14 }, dropShadow: { color: 0x05080c, distance: 8, angle: Math.PI / 2, blur: 0, alpha: 1 } };

export function titleScreen(h, safe, keyArt, settings, info, onStart) {
  const root = new Container();
  const art = root.addChild(new Sprite(keyArt));
  art.scale.set(Math.max(W / keyArt.width, h / keyArt.height)); // cover; key art is centred on the hero
  art.position.set((W - art.width) / 2, (h - art.height) / 2);
  root.addChild(new Graphics().rect(0, 0, W, h).fill({ color: 0x03060c, alpha: 0.15 }));
  root.addChild(new Graphics().rect(0, h * 0.56, W, h * 0.44).fill({ color: 0x03060c, alpha: 0.6 }));

  const top = safe.top + Math.max(80, h * 0.07);
  const logo = root.addChild(new Container());
  logo.position.set(W / 2, top);
  text(logo, 'SWARM', 118, 0xffe9a8, 0, 0, LOGO);
  text(logo, 'DUEL', 118, 0xffc23a, 0, 104, LOGO);
  const sub = root.addChild(new Container());
  sub.position.set(W / 2, top + 250);
  sub.addChild(new Graphics().roundRect(-170, 0, 340, 46, 23).fill(C.limeDark).stroke({ width: 4, color: C.ink }));
  text(sub, S.subtitle, 28, C.text, 0, 23, { stroke: { color: C.ink, width: 6 }, letterSpacing: 6 }, [0.5, 0.5]);

  // Daily / challenge card
  let y = h * 0.6;
  const card = root.addChild(new Container());
  card.position.set(60, y);
  card.addChild(panel(600, 120, { border: C.gold }));
  card.addChild(icon('bounty', 72)).position.set(64, 60);
  text(card, info.title, 22, C.gold, 120, 20, {}, [0, 0]);
  text(card, info.seed, 30, C.text, 120, 46, { stroke: { color: C.ink, width: 5 } }, [0, 0]);
  text(card, info.best, 18, C.mute, 120, 84, { fontWeight: 'normal' }, [0, 0]);
  y += 150;

  const play = root.addChild(button(S.play, 420, 104, onStart, 'primary'));
  play.pivot.set(210, 52);
  play.position.set(W / 2, y + 52);
  y += 140;
  const rules = text(root, S.rules, 18, 0xc9d6e2, W / 2, y, { fontWeight: 'normal', align: 'center', lineHeight: 26, wordWrap: true, wordWrapWidth: 620 });
  y += rules.height + 14;
  const controls = text(root, settings.touch ? S.touchControls : S.controls, 16, C.mute, W / 2, y, { fontWeight: 'normal', wordWrap: true, wordWrapWidth: 640, align: 'center' });
  root.fxLine = text(root, S.fx(settings.fx), 15, 0x6f8294, W / 2, y + controls.height + 10);
  text(root, S.prototype, 14, 0x6f8294, W / 2, h - safe.bottom - 30);

  const rich = settings.fx === 'high' && !settings.reducedMotion;
  intro(rich, logo, { dy: -70, duration: 0.7, ease: 'back.out(1.6)' });
  intro(rich, [sub, card], { dy: 20, duration: 0.45, delay: 0.3, stagger: 0.08 });
  intro(rich, play, { dy: 30, duration: 0.45, delay: 0.45, ease: 'back.out(1.8)' });
  if (rich) gsap.to(play.scale, { x: 1.04, y: 1.04, duration: 0.7, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 1 });

  root.kill = () => killAll([logo, sub, card, play, play.scale]);
  return root;
}

export function levelUpPanel(h, sim, settings, onPick) {
  const root = new Container();
  root.addChild(dim(h, 0.7));
  const CW = 640, CH = 196, gap = 22, total = CH * 3 + gap * 2;
  const y0 = Math.max(230, (h - total) / 2 + 60);
  const head = root.addChild(banner(S.levelUpBanner, 0x4fae1e, 0x2f6a10));
  head.position.set(W / 2, y0 - 150);
  text(root, S.pickOne, 22, C.mute, W / 2, y0 - 58);

  const cards = sim.offer.map((key, i) => {
    const info = S.upgrades[key], cur = sim.levels[key] | 0, def = UPGRADES[key];
    const isNew = def && cur === 0;
    const accent = !def ? C.sky : isNew ? C.gold : C.lime;
    const c = root.addChild(new Container());
    c.position.set((W - CW) / 2, y0 + i * (CH + gap));
    c.addChild(panel(CW, CH, { border: accent }));
    c.addChild(new Graphics().roundRect(20, 20, 140, 140, 18).fill(0x0d151d).stroke({ width: 3, color: accent }));
    c.addChild(icon(key, 112)).position.set(90, 90);
    text(c, info.name, 34, C.text, 184, 26, { stroke: { color: C.ink, width: 6 } }, [0, 0]);
    if (def) c.addChild(pips(cur + 1, def.max, accent)).position.set(186, 76);
    text(c, info.desc, 21, 0xc9d6e2, 184, def ? 100 : 82, { fontWeight: 'normal', wordWrap: true, wordWrapWidth: CW - 210, lineHeight: 26 }, [0, 0]);
    if (isNew) {
      const tag = c.addChild(new Container());
      tag.position.set(CW - 24, 18);
      tag.addChild(new Graphics().roundRect(-78, 0, 78, 32, 8).fill(C.gold).stroke({ width: 3, color: C.ink }));
      text(tag, S.newItem, 20, C.ink, -39, 16, {}, [0.5, 0.5]);
    } else if (!settings.touch) {
      text(c, `${i + 1}`, 28, C.mute, CW - 30, CH / 2, { stroke: { color: C.ink, width: 5 } }, [1, 0.5]);
    }
    c.eventMode = 'static'; c.cursor = 'pointer';
    c.on('pointertap', () => onPick(i));
    return c;
  });
  const rich = settings.fx === 'high' && !settings.reducedMotion;
  intro(rich, head, { dy: -30, duration: 0.3, ease: 'back.out(2)' });
  intro(rich, cards, { dx: 80, duration: 0.26, stagger: 0.06, delay: 0.08, ease: 'power2.out' });
  root.kill = () => killAll([head, ...cards]);
  return root;
}

const BREAKDOWN_ICONS = { kills: 'skull', dodges: 'p_speed', ecto: 'ecto', survival: 'p_cooldown', bonus: 'bounty' };

export function resultsPanel(h, safe, data, settings, actions) {
  const root = new Container();
  root.addChild(dim(h, 0.82));
  const rich = settings.fx === 'high' && !settings.reducedMotion;
  let y = safe.top + Math.max(70, h * 0.06);
  const head = root.addChild(banner(data.survived ? S.timeUp : S.overrun, data.survived ? 0x4fae1e : 0xc8382c, data.survived ? 0x2f6a10 : 0x6e1a14));
  head.position.set(W / 2, y);
  y += 100;
  const scoreText = text(root, '0', 120, 0xffe9a8, W / 2, y, { ...LOGO, stroke: { color: 0x2a1408, width: 12 } });
  const counter = { v: 0 };
  if (rich) gsap.to(counter, { v: data.score, duration: 1.1, ease: 'power2.out', onUpdate: () => { scoreText.text = String(Math.round(counter.v)); } });
  else scoreText.text = String(data.score);
  y += 150;

  // Transparent score breakdown: the player sees exactly where every point came from.
  const keys = Object.keys(data.breakdown);
  const box = root.addChild(new Container());
  box.position.set(60, y);
  box.addChild(panel(600, keys.length * 48 + 24));
  keys.forEach((k, i) => {
    const ry = 12 + i * 48 + 24;
    box.addChild(icon(BREAKDOWN_ICONS[k] || 'bounty', 36)).position.set(40, ry);
    text(box, S.breakdown[k] || k, 22, 0xc9d6e2, 72, ry, { fontWeight: 'normal' }, [0, 0.5]);
    text(box, String(data.breakdown[k]), 26, data.breakdown[k] ? C.text : 0x56697a, 572, ry, { stroke: { color: C.ink, width: 5 } }, [1, 0.5]);
  });
  y += keys.length * 48 + 44;

  const texts = [
    [S.stats(data), 18, 0xd4dee8],
    [data.verified ? S.verified(data.verifyMs) : S.notVerified, 17, data.verified ? C.lime : C.red],
    [S.best(data.best, data.isNewBest), 24, data.isNewBest ? C.gold : 0xd4dee8],
    [S.challenge(data.challengeUrl), 14, C.mute],
  ].map(([value, size, fill], i) => {
    const extra = i === 2 ? { stroke: { color: C.ink, width: 5 } } : { fontWeight: 'normal' };
    const t = text(root, value, size, fill, W / 2, y, { align: 'center', wordWrap: true, wordWrapWidth: 640, breakWords: true, ...extra });
    y += t.height + 12;
    return t;
  });

  const bw = 480, bh = 84, gap = 20;
  const by = Math.max(y + 12, h - safe.bottom - 36 - bh - gap - 76);
  const retry = root.addChild(button(S.retry(settings.touch), bw, bh, actions.retry, 'primary'));
  retry.position.set((W - bw) / 2, by);
  const again = root.addChild(button(S.newSeed(settings.touch), 300, 70, actions.newSeed, 'secondary'));
  again.position.set(W / 2 - 310, by + bh + gap);
  const home = root.addChild(button(S.toTitle(settings.touch), 300, 70, actions.title, 'secondary'));
  home.position.set(W / 2 + 10, by + bh + gap);

  intro(rich, head, { dy: -30, duration: 0.35, ease: 'back.out(2)' });
  intro(rich, [box, ...texts], { dy: 16, duration: 0.3, delay: 0.5, stagger: 0.07 });
  intro(rich, [retry, again, home], { dy: 30, duration: 0.3, delay: 0.9, stagger: 0.06, ease: 'back.out(1.6)' });
  root.kill = () => killAll([counter, head, box, ...texts, retry, again, home]);
  return root;
}
