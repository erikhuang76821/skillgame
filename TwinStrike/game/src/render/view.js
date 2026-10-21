// Game view: draws the sim state at render time and plays sim events as juice. Never writes to the sim.
// World units 720x1280 (spec §0, fixed viewport E3). Enemy positions are a pure function of
// (note time, render time), so the cue a player times against is exact whatever the frame rate.
import { Container, Sprite } from 'pixi.js';
import { gsap } from 'gsap';
import { SUB, RULES, KIND, GRADE, visibleTick, SEGMENTS } from '../sim/sim.js';
import { TICK_MS } from '../sim/core/index.js';
import { FEEL } from '../fx/feel.js';

export const LAYOUT = Object.freeze({ w: 720, h: 1280, floor: 900, heroX: 360, range: 120, edge: 440, airY: 70 });
const ART = { cat: 0.95, enemy: 0.95 };                                  // anchors: feet at 95% of the cell
export const STRIKES = ['jab', 'kick', 'palm'];

export class GameView {
  constructor(atlas, bgTexture) {
    this.tex = atlas.tex;
    this.root = new Container();
    this.bg = new Sprite(bgTexture);
    this.bg.anchor.set(0.5); this.bg.position.set(LAYOUT.w / 2, LAYOUT.h / 2);   // centred so the beat pulse scales from the middle
    this.wall = new Container();                                        // combo speed lines: behind every actor (gdd/06 §5)
    this.ground = new Container();                                      // glow, shadows, range markers
    this.actors = new Container();
    this.fx = new Container();
    this.root.addChild(this.bg, this.wall, this.ground, this.actors, this.fx);

    const { floor, heroX, range } = LAYOUT;
    this.glow = this.sprite(this.ground, this.tex.misc.glow, heroX, floor, 0.5, 0.5);
    this.glow.alpha = 0;
    this.markers = [-1, 1].map(dir => this.sprite(this.ground, this.tex.misc.marker, heroX + dir * range, floor + 14, 0.5, 0.5));
    this.heroShadow = this.sprite(this.ground, this.tex.misc.shadow, heroX, floor, 0.5, 0.5);
    this.hero = this.sprite(this.actors, this.tex.cat.idle_a, heroX, floor, 0.5, ART.cat);
    this.hero.scale.set(0.95);
    this.heroState = { pose: 'idle', until: 0, facing: 1, lunge: 0 };

    this.pool = { enemy: [], shadow: [], mark: [], corpse: [], fx: [], streak: [] };
    this.groupFx = new Map();                                           // brute hop / knock-back offsets per group
    this.renderMs = 0;
    this.tier = 0;                                                      // combo tier T0..T4 (set by fx/comboFeel.js)
    this.seenBoss = new Set();                                          // boss groups already announced
    this.onBoss = null;                                                 // main.js: boss banner
    this.lastBeat = -1;
    this.dim = { v: 0 };                                                // 0..1 background dim after a combo break
  }

  sprite(parent, texture, x, y, ax = 0.5, ay = 0.5) {
    const s = new Sprite(texture);
    s.anchor.set(ax, ay); s.position.set(x, y);
    parent.addChild(s);
    return s;
  }

  take(kind, parent) {
    const free = this.pool[kind].find(s => !s.visible && !s.busy);
    if (free) { free.visible = true; return free; }
    const s = this.sprite(parent, this.tex.misc.dot);
    this.pool[kind].push(s);
    return s;
  }

  reset() {
    for (const list of Object.values(this.pool)) for (const s of list) { gsap.killTweensOf(s); gsap.killTweensOf(s.scale); s.visible = false; s.busy = false; }
    this.groupFx.clear();
    this.tier = 0; this.lastBeat = -1; this.dim.v = 0; this.seenBoss.clear();
    Object.assign(this.heroState, { pose: 'idle', until: 0, facing: 1, lunge: 0 });
    this.hero.tint = 0xffffff;
    this.hero.texture = this.tex.cat.idle_a;
  }

  /** x of an enemy whose note arrives at `t` (sub-ticks) on `lane`, at render time `now` (sub-ticks). */
  enemyX(note, now) {
    const { heroX, range, edge } = LAYOUT;
    const frac = Math.max(-0.12, (note.t - now) / SUB / RULES.approach[note.kind]);
    const dir = note.lane ? 1 : -1;
    return heroX + dir * (range + frac * edge);
  }

  /** Per frame. `now` = render time in sub-ticks (continuous). */
  update(sim, now, ms) {
    this.renderMs = ms;
    const { chart, judge } = sim, nowTick = now / SUB;
    for (const k of ['enemy', 'shadow', 'mark']) for (const s of this.pool[k]) s.visible = false;
    const near = [0, 0];
    this.bossLane = -1;

    // enemies: first unjudged note of each group that is on screen
    const seen = new Set();
    const horizon = now + 80 * SUB;
    for (let i = judge.next; i < chart.length && chart[i].t <= horizon; i++) {
      const n = chart[i];
      if (judge.grade[i] >= 0 || seen.has(n.group) || nowTick < visibleTick(n)) continue;
      seen.add(n.group);
      const fxs = this.groupFx.get(n.group);
      const x = this.enemyX(n, now) + (fxs?.x ?? 0), dir = n.lane ? 1 : -1;
      const air = n.kind === KIND.RUNNER ? LAYOUT.airY : 0;
      const y = LAYOUT.floor - air + (fxs?.y ?? 0);
      const step = Math.floor(ms / 140) % 2;
      const tex = n.kind === KIND.GRUNT ? this.tex.mouse[step ? 'run_b' : 'run_a']
        : n.kind === KIND.RUNNER ? this.tex.squirrel[step ? 'glide_b' : 'glide_a']
          : this.tex.tanuki[fxs?.block > ms ? 'block' : step ? 'walk_b' : 'walk_a'];
      const e = this.take('enemy', this.actors);
      e.texture = tex; e.anchor.set(0.5, ART.enemy); e.position.set(x, y);
      e.scale.set(-dir, 1);                                             // final art is sized in the atlas; it faces right, left-side enemies walk right
      e.alpha = 1; e.rotation = 0; e.tint = 0xffffff;
      const sh = this.take('shadow', this.ground);
      sh.texture = this.tex.misc.shadow; sh.anchor.set(0.5); sh.position.set(x, LAYOUT.floor);
      sh.scale.set(n.kind === KIND.BRUTE ? 1.3 : 0.8, 1); sh.alpha = air ? 0.5 : 1;
      const frac = (n.t - now) / SUB / RULES.approach[n.kind];
      if (frac < 0.35) near[n.lane] = Math.max(near[n.lane], 1 - frac / 0.35);
      if (n.kind === KIND.BRUTE) {
        this.brutemarks(chart, judge, i, x, y, now);
        if (!this.seenBoss.has(n.group)) { this.seenBoss.add(n.group); this.onBoss?.(); }
      }
    }
    // combo tier: beat pulse, floor glow, speed lines (gdd/06 §2). Scales the background and the markers only.
    const C = FEEL.combo, beat = beatAt(nowTick), t = this.tier;
    const pulse = beat && FEEL.enabled ? Math.exp(-beat.phase * 6) : 0;
    this.bg.scale.set(1 + C.pulse[t] * pulse);
    const d = Math.round(255 * (1 - 0.35 * this.dim.v));
    this.bg.tint = (d << 16) | (d << 8) | d;
    this.markers.forEach((m, lane) => {
      m.alpha = 0.35 + 0.65 * near[lane]; m.tint = this.bossLane === lane ? FEEL.boss.color : near[lane] > 0.75 ? 0xfff2b0 : 0xffffff;
      m.scale.set(1 + C.markerPulse[t] * pulse);
    });
    this.glow.alpha = C.glow[t] * (0.7 + 0.3 * pulse); this.glow.tint = C.color[t];
    this.glow.x = this.hero.x;
    if (beat && beat.index !== this.lastBeat) {
      this.lastBeat = beat.index;
      if (FEEL.enabled) for (let k = 0; k < C.streaks[t]; k++) for (const side of [-1, 1]) this.streak(side, beat.secs, C.color[t]);
    }

    // hero pose
    const h = this.heroState, idle = Math.floor(ms / 500) % 2 ? 'idle_b' : 'idle_a';
    const staggered = sim.tick < sim.staggerUntil;
    if (h.pose !== 'idle' && ms > h.until && !staggered) h.pose = 'idle';
    this.hero.texture = this.tex.cat[h.pose === 'idle' ? idle : h.pose];
    this.hero.scale.x = 0.95 * h.facing;
    this.hero.x = LAYOUT.heroX + h.lunge;
    this.hero.tint = staggered ? 0x8a8a8a : 0xffffff;
  }

  /** A speed line on the wall band, flying from the screen edge toward the hero (render-only randomness). */
  streak(side, beatSecs, tint) {
    const s = this.take('streak', this.wall), y = 340 + Math.random() * 420, len = 0.6 + Math.random() * 0.8;
    s.busy = true; s.texture = this.tex.misc.streak; s.anchor.set(side < 0 ? 1 : 0, 0.5); s.tint = tint;
    s.scale.set(-side * len, 1); s.alpha = 0.35; s.position.set(side < 0 ? -40 : LAYOUT.w + 40, y);
    gsap.timeline({ onComplete: () => { s.busy = false; s.visible = false; } })
      .to(s, { x: LAYOUT.w / 2 + side * (140 + Math.random() * 60), duration: beatSecs * 1.6, ease: 'power2.out' }, 0)
      .to(s, { alpha: 0, duration: beatSecs * 0.8, ease: 'power1.in' }, beatSecs * 0.8);
  }

  setTier(t) { this.tier = t; }

  /** Combo broke: dim the background briefly and drop the speed lines (gdd/06 §4). */
  comboBreak() {
    for (const s of this.pool.streak) { gsap.killTweensOf(s); s.busy = false; s.visible = false; }
    gsap.fromTo(this.dim, { v: 1 }, { v: 0, duration: FEEL.combo.breakDim, ease: 'power1.in', overwrite: true });
    this.tier = 0;
  }

  /**
   * Tanuki boss cues (gdd/07 §7): the NEXT hit gets a big arrow above the range marker of the side to tap, with a
   * Cytus-style ring that shrinks onto it exactly on the beat; the remaining hits queue as small arrows over the
   * tanuki's head. Pure function of (chart, render time) like every other cue.
   */
  brutemarks(chart, judge, i, x, y, now) {
    const { heroX, floor, range } = LAYOUT, C = FEEL.boss;
    let k = 0, next = -1;
    for (let j = i; j < chart.length && chart[j].group === chart[i].group; j++) {
      if (judge.grade[j] >= 0) continue;
      if (next < 0) next = j;
      const m = this.take('mark', this.fx);
      m.texture = this.tex.misc.arrow; m.anchor.set(0.5); m.rotation = 0; m.tint = 0xffffff;
      m.position.set(Math.max(130, Math.min(LAYOUT.w - 130, x)) + (k - 1.5) * C.queueGap, y - 230);   // kept on screen near the edges
      const s = j === next ? C.queueNext : C.queueScale;
      m.scale.set(chart[j].lane ? s : -s, s); m.alpha = j === next ? 1 : 0.6;
      k++;
    }
    if (next < 0) return;
    const n = chart[next], dir = n.lane ? 1 : -1, beat = SEGMENTS[n.seg].beatTicks * SUB;
    const toGo = Math.max(0, (n.t - now) / beat);                        // beats until this hit
    const cx = heroX + dir * range, cy = floor - C.cueY;
    const cue = this.take('mark', this.fx);
    cue.texture = this.tex.misc.arrow; cue.anchor.set(0.5); cue.rotation = 0; cue.tint = C.color;
    const pulse = 1 + 0.08 * Math.max(0, 1 - toGo);
    cue.scale.set(dir * C.cueScale * pulse, C.cueScale * pulse); cue.position.set(cx, cy); cue.alpha = 1;
    const ring = this.take('mark', this.fx);
    ring.texture = this.tex.misc.ring; ring.anchor.set(0.5); ring.rotation = 0; ring.tint = C.color;
    const r = C.ringEnd + (C.ringStart - C.ringEnd) * Math.min(1, toGo);   // closes on the beat
    ring.scale.set(r); ring.position.set(cx, cy); ring.alpha = 0.35 + 0.65 * (1 - Math.min(1, toGo));
    this.bossLane = n.lane;
  }

  setHero(pose, facing, holdMs) {
    Object.assign(this.heroState, { pose, facing, until: this.renderMs + holdMs });
  }

  /** Juice for one sim event. `ui` = DOM hooks (popups, shake, flash, sfx). */
  onEvent(ev, sim, now, ui) {
    const { heroX, floor, range } = LAYOUT, dir = ev.lane ? 1 : -1;
    if (ev.type === 'hit') {
      const n = sim.chart[ev.note], rich = FEEL.enabled;
      this.setHero(STRIKES[ev.note % 3], dir, FEEL.strike.hold * 1000);
      gsap.fromTo(this.heroState, { lunge: dir * FEEL.strike.lunge }, { lunge: 0, duration: FEEL.strike.back, ease: 'power2.out', overwrite: true });
      const x = this.enemyX(n, now), y = floor - (n.kind === KIND.RUNNER ? LAYOUT.airY : 0);
      this.stamp(heroX + dir * (range - 20), y - 110, ev.grade);
      if (n.kind === KIND.BRUTE && !ev.last) this.bruteHit(sim, ev.note, x);
      else this.corpse(n, x, y, dir, ev.grade);
      if (rich && ev.grade === GRADE.PERFECT) this.burst(heroX + dir * range, y - 90, 'star', 3);
      if (n.kind === KIND.BRUTE) ui.brute(ev.last);                   // wooden tok / shield break on top of the hit sound
      if (n.kind === KIND.BRUTE && ev.last) { this.ring(heroX + dir * range, y - 90); ui.shake('crit'); }
      else if (ev.grade === GRADE.PERFECT) ui.shake('light');
      ui.popup(ev.grade, ev.lane, ev.combo, ev.pts);
      const b = beatAt(n.t / SUB), next = sim.chart[ev.note + 1];       // the note's own time is exactly on the beat grid
      ui.strike({ id: ev.note, note: n, strike: STRIKES[ev.note % 3], grade: ev.grade, combo: ev.combo, tier: this.tier, kind: n.kind, last: ev.last,
        onBeat: !!b && b.phase === 0, downbeat: !!b && b.phase === 0 && b.index % 4 === 0,
        nextGapMs: next ? ((next.t - n.t) / SUB) * TICK_MS : 1e9 });
    } else if (ev.type === 'whiff') {
      this.setHero('whiff', dir, RULES.stagger * TICK_MS);
      this.burst(heroX + dir * 40, floor - 210, 'sweat', 1);
      ui.popup('whiff', ev.lane);
    } else if (ev.type === 'locked') {
      gsap.fromTo(this.heroState, { lunge: 6 }, { lunge: 0, duration: 0.12, ease: 'elastic.out(1, 0.3)', overwrite: true });
    } else if (ev.type === 'hurt') {
      const n = sim.chart[ev.note];
      this.setHero('hurt', dir, 260);                                   // art: faces the attacker, flinches backwards
      this.corpse(n, heroX + dir * 70, floor - (n.kind === KIND.RUNNER ? LAYOUT.airY : 0), -dir, -1);
      this.burst(heroX, floor - 150, 'fur', 4);
      ui.hurt(ev.safe);
    } else if (ev.type === 'death') {
      this.setHero('ko', this.heroState.facing, 1e9);
    }
  }

  /** Brute took a non-final hit: knock back + block pose; hop over the hero if the next hit is on the other side. */
  bruteHit(sim, i, x) {
    const n = sim.chart[i], next = sim.chart[i + 1], st = { x: 0, y: 0, block: this.renderMs + 160 };
    this.groupFx.set(n.group, st);
    if (next && next.lane !== n.lane) {
      st.x = x - this.enemyX(next, next.t - 6 * SUB);                     // start from where it was, land on the other side
      gsap.to(st, { x: 0, duration: FEEL.brute.hop, ease: 'power1.inOut' });
      gsap.fromTo(st, { y: 0 }, { y: -120, duration: FEEL.brute.hop / 2, ease: 'power2.out', yoyo: true, repeat: 1 });
    } else {
      st.x = (n.lane ? 1 : -1) * FEEL.brute.knock;
      gsap.to(st, { x: 0, duration: 0.18, ease: 'power2.out' });
    }
    this.burst(x, LAYOUT.floor - 200, 'leaf', 1);
  }

  corpse(n, x, y, dir, grade) {
    const s = this.take('corpse', this.actors);
    const set = n.kind === KIND.GRUNT ? this.tex.mouse : n.kind === KIND.RUNNER ? this.tex.squirrel : this.tex.tanuki;
    s.busy = true; s.texture = set.hit; s.anchor.set(0.5, 0.6); s.position.set(x, y - 60); s.alpha = 1; s.rotation = 0;
    s.scale.set(-dir, 1); s.tint = grade === GRADE.PERFECT ? 0xfff0c0 : 0xffffff;
    const f = FEEL.fly, d = grade < 0 ? 0.6 : grade === GRADE.PERFECT ? 1 : 0.75;
    gsap.timeline({ onComplete: () => { s.busy = false; s.visible = false; } })
      .to(s, { x: x + dir * f.dist * d, rotation: dir * f.spin * d, duration: f.dur, ease: 'power1.out' }, 0)
      .to(s, { y: y - 60 - f.height * d, duration: f.dur * 0.45, ease: 'power2.out' }, 0)
      .to(s, { y: y + 40, duration: f.dur * 0.55, ease: 'power2.in' }, f.dur * 0.45)
      .to(s, { alpha: 0, duration: 0.2 }, f.dur - 0.2);
  }

  stamp(x, y, grade) {
    const s = this.take('fx', this.fx);
    s.busy = true; s.texture = this.tex.fx.paw; s.anchor.set(0.5); s.position.set(x, y); s.alpha = 1; s.rotation = 0;
    const k = FEEL.stamp.scale * (grade === GRADE.PERFECT ? 1.25 : grade === GRADE.GREAT ? 1 : 0.8);
    gsap.timeline({ onComplete: () => { s.busy = false; s.visible = false; } })
      .fromTo(s.scale, { x: 0.4 * k, y: 0.4 * k }, { x: k, y: k, duration: FEEL.stamp.in, ease: 'back.out(2.5)' })
      .to(s, { alpha: 0, duration: FEEL.stamp.out }, `>+${FEEL.stamp.hold}`);
  }

  ring(x, y) {
    if (!FEEL.enabled) return;
    const s = this.take('fx', this.fx);
    s.busy = true; s.texture = this.tex.misc.ring; s.anchor.set(0.5); s.position.set(x, y); s.alpha = 0.9; s.rotation = 0; s.tint = 0xffe08a;
    gsap.timeline({ onComplete: () => { s.busy = false; s.visible = false; } })
      .fromTo(s.scale, { x: 0.2, y: 0.2 }, { x: 1.4, y: 1.4, duration: 0.35, ease: 'power2.out' }, 0)
      .to(s, { alpha: 0, duration: 0.3 }, 0.12);
  }

  burst(x, y, name, n) {
    if (!FEEL.enabled) n = Math.min(n, 1);
    for (let i = 0; i < n; i++) {
      const s = this.take('fx', this.fx), a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.7, r = 60 + 20 * (i % 2);
      s.busy = true; s.texture = this.tex.fx[name]; s.anchor.set(0.5); s.position.set(x, y); s.alpha = 1; s.rotation = 0; s.tint = 0xffffff;
      s.scale.set(FEEL.burst.scale);
      gsap.timeline({ onComplete: () => { s.busy = false; s.visible = false; } })
        .to(s, { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, rotation: a, duration: 0.45, ease: 'power2.out' }, 0)
        .to(s, { alpha: 0, duration: 0.2 }, 0.3);
    }
  }
}

/** Beat grid of the fixed segment table at render time `tick` (float): { index, phase 0..1, secs per beat } or null. */
export function beatAt(tick) {
  let base = 0;
  for (const s of SEGMENTS) {
    const beats = Math.floor((s.to - s.from) / s.beatTicks);
    if (tick >= s.from && tick < s.to) {
      const k = (tick - s.from) / s.beatTicks;
      return { index: base + Math.floor(k), phase: k - Math.floor(k), secs: s.beatTicks / 60, beatTicks: s.beatTicks };
    }
    base += beats;
  }
  return null;
}

export const segmentName = id => SEGMENTS.find(s => s.id === id)?.name ?? '';
export { SEGMENTS };
