// Portrait HUD (720 x H logical), mobile survivor conventions:
// top = XP bar + level badge, kills, timer pill, combo; bottom = dash state + big Howl button.
// HP lives under the hero in the world (render/world.js). Strings only re-render on change.
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { MATCH_TICKS, TPS, comboMult10, score, xpNeed } from '../sim/sim.js';
import { TUNING } from '../sim/content.js';
import { C, icon, panel, text } from './theme.js';
import S from '../i18n/en-US.js';

export const HOWL_R = 66;

export class Hud {
  constructor(settings, seedHex) {
    this.settings = settings;
    this.root = new Container();
    this.cache = {};

    // XP bar across the top with a level badge
    this.top = this.root.addChild(new Container());
    this.top.addChild(new Graphics().roundRect(0, 0, 720 - 32, 24, 12).fill(C.ink)).position.set(16, 0);
    this.xpFill = this.top.addChild(new Sprite(Texture.WHITE));
    this.xpFill.position.set(62, 4); this.xpFill.height = 16; this.xpFill.tint = C.lime;
    this.xpShine = this.top.addChild(new Sprite(Texture.WHITE));
    this.xpShine.position.set(62, 4); this.xpShine.height = 5; this.xpShine.tint = 0xd9ffb0;
    this.top.addChild(new Graphics().circle(0, 0, 30).fill(C.gold).stroke({ width: 4, color: C.ink })).position.set(40, 12);
    this.level = text(this.top, '1', 26, C.ink, 40, 12, {}, [0.5, 0.5]);

    // timer pill
    this.top.addChild(panel(170, 58, { r: 29 })).position.set(275, 40);
    this.time = text(this.top, '3:00', 40, C.text, 360, 69, { stroke: { color: C.ink, width: 6 } }, [0.5, 0.5]);
    this.seed = text(this.top, S.seed(seedHex), 15, C.mute, 360, 104, {}, [0.5, 0]);

    // kills + score (left)
    const k = this.top.addChild(icon('skull', 40)); k.position.set(42, 70);
    this.kills = text(this.top, '0', 30, C.text, 68, 70, { stroke: { color: C.ink, width: 6 } }, [0, 0.5]);
    this.score = text(this.top, `${S.score} 0`, 20, C.gold, 24, 96, { stroke: { color: C.ink, width: 5 } }, [0, 0]);

    // combo (right)
    this.combo = this.top.addChild(new Container());
    this.combo.position.set(696, 54);
    this.comboMult = text(this.combo, '', 44, C.gold, 0, 0, { stroke: { color: C.ink, width: 8 } }, [1, 0]);
    this.comboCount = text(this.combo, '', 18, C.text, 0, 52, { stroke: { color: C.ink, width: 5 } }, [1, 0]);

    // bottom: dash pill + Howl button
    this.bottom = this.root.addChild(new Container());
    this.dashPill = this.bottom.addChild(new Container());
    this.dashBg = this.dashPill.addChild(new Graphics());
    this.dashText = text(this.dashPill, '', 22, C.text, 95, 24, { stroke: { color: C.ink, width: 5 } }, [0.5, 0.5]);
    this.howl = this.bottom.addChild(new Container());
    this.howlRing = this.howl.addChild(new Graphics());
    this.howlText = text(this.howl, '', 22, C.text, 0, 0, { stroke: { color: C.ink, width: 6 } }, [0.5, 0.5]);

    this.stick = this.root.addChild(new Graphics());
    this.ready = false;
  }

  // safe = { top, bottom } in logical px (notch / home indicator)
  layout(h, safe) {
    this.top.position.set(0, safe.top + 14);
    const bottom = h - safe.bottom;
    this.dashPill.position.set(24, bottom - 80);
    this.howl.position.set(720 - 30 - HOWL_R, bottom - 36 - HOWL_R);
    this.bottom.position.set(0, 0);
  }

  hitsHowl(x, y) {
    const dx = x - this.howl.x, dy = y - this.howl.y;
    return dx * dx + dy * dy <= (HOWL_R + 18) ** 2;
  }

  set(key, obj, value) { if (this.cache[key] !== value) { this.cache[key] = value; obj.text = value; } }

  // stick: { ox, oy, x, y } already in logical px, or null
  update(sim, stick) {
    const p = sim.player;
    const left = Math.max(0, Math.ceil((MATCH_TICKS - sim.tick) / TPS));
    this.set('time', this.time, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    this.time.tint = left <= 10 ? C.red : 0xffffff;
    this.set('kills', this.kills, String(sim.kills));
    this.set('score', this.score, `${S.score} ${score(sim)}`);
    this.set('lv', this.level, String(p.level));
    this.xpFill.width = this.xpShine.width = 640 * Math.min(1, p.xp / xpNeed(p.level));

    const showCombo = sim.combo >= 10;
    this.combo.visible = showCombo;
    if (showCombo) {
      this.set('mult', this.comboMult, `×${(comboMult10(sim) / 10).toFixed(1)}`);
      this.set('cc', this.comboCount, S.comboCount(sim.combo));
    }

    const dashReady = p.dashCd === 0;
    if (this.cache.dashReady !== dashReady) {
      this.cache.dashReady = dashReady;
      this.dashBg.clear().roundRect(0, 0, 190, 48, 24).fill(dashReady ? 0x1f4a6a : C.panel).stroke({ width: 3, color: dashReady ? C.sky : C.edge });
      this.dashText.text = this.settings.touch ? S.dashTouch : S.dash;
      this.dashPill.alpha = dashReady ? 1 : 0.5;
    }

    const pct = Math.floor((p.howl / TUNING.howlCost) * 100), ready = pct >= 100;
    if (this.cache.howlPct !== pct) {
      this.cache.howlPct = pct;
      const a = -Math.PI / 2;
      this.howlRing.clear()
        .circle(0, 6, HOWL_R).fill(C.ink)
        .circle(0, 0, HOWL_R).fill(ready ? 0xc98a14 : 0x16222e).stroke({ width: 4, color: C.ink })
        .circle(0, 0, HOWL_R - 10).fill(ready ? C.gold : 0x223446);
      if (!ready) this.howlRing.arc(0, 0, HOWL_R - 4, a, a + (Math.PI * 2 * pct) / 100).stroke({ width: 8, color: C.sky });
      this.set('howl', this.howlText, ready ? S.howlButton : `${pct}%`);
      this.howlText.style.fill = ready ? C.ink : C.text;
      this.howlText.style.stroke = { color: ready ? C.gold : C.ink, width: 6 };
    }
    if (ready !== this.ready) {
      this.ready = ready;
      gsap.killTweensOf(this.howl.scale);
      this.howl.scale.set(1);
      if (ready && this.settings.fx === 'high' && !this.settings.reducedMotion) {
        gsap.to(this.howl.scale, { x: 1.08, y: 1.08, duration: 0.45, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      }
    }

    this.stick.clear();
    if (stick) {
      const dx = stick.x - stick.ox, dy = stick.y - stick.oy, d = Math.hypot(dx, dy), k = d > 70 ? 70 / d : 1;
      this.stick.circle(stick.ox, stick.oy, 74).fill({ color: C.ink, alpha: 0.25 }).stroke({ width: 4, color: 0xffffff, alpha: 0.4 })
        .circle(stick.ox + dx * k, stick.oy + dy * k, 32).fill({ color: 0xffffff, alpha: 0.45 }).stroke({ width: 3, color: C.ink, alpha: 0.4 });
    }
  }

  destroy() { gsap.killTweensOf(this.howl.scale); this.root.destroy({ children: true }); }
}
