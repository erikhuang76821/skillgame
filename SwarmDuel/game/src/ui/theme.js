// Shared UI look: chunky mobile-game panels and buttons (Survivor.io-style readability),
// bundled pixel font, icon atlas. Pure Graphics + one atlas: no filters, no extra images.
import { Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';

export const FONT = '"Pixelify Sans", "Trebuchet MS", system-ui, sans-serif';
export const C = {
  ink: 0x05080c, panel: 0x16222e, panelHi: 0x223446, edge: 0x0a1018,
  lime: 0x8ff03c, limeDark: 0x3e7a16, gold: 0xffd36b, goldDark: 0x8a5a12,
  red: 0xff5a4a, sky: 0x7fd7ff, text: 0xf2f6fa, mute: 0x9fb3c4,
};

export const style = (size, fill = C.text, extra = {}) => ({
  fontFamily: FONT, fontSize: size, fill, fontWeight: 'bold', ...extra,
});

export function text(parent, value, size, fill, x, y, extra = {}, anchor = [0.5, 0]) {
  const t = parent.addChild(new Text({ text: value, style: style(size, fill, extra) }));
  t.anchor.set(...anchor);
  t.position.set(x, y);
  return t;
}

// Bevelled panel: dark edge, body, lighter top strip.
export function panel(w, h, { fill = C.panel, edge = C.edge, hi = C.panelHi, r = 18, border = 0 } = {}) {
  const g = new Graphics();
  g.roundRect(0, 4, w, h, r).fill({ color: C.ink, alpha: 0.55 });          // drop shadow
  g.roundRect(0, 0, w, h, r).fill(edge);
  g.roundRect(3, 3, w - 6, h - 6, r - 3).fill(fill);
  g.roundRect(3, 3, w - 6, Math.min(26, h / 3), r - 3).fill({ color: hi, alpha: 0.6 });
  if (border) g.roundRect(1.5, 1.5, w - 3, h - 3, r - 1).stroke({ width: 3, color: border });
  return g;
}

// 3D pill button with a pressed state.
export function button(label, w, h, onTap, kind = 'primary') {
  const colors = {
    primary: [0x6fd42a, 0x2f6a10, 0xb4ff74],
    secondary: [0x2e4a66, 0x15253a, 0x4f7396],
    gold: [0xffc23a, 0x8a5a12, 0xffe69a],
  }[kind];
  const c = new Container();
  const face = new Graphics();
  const draw = pressed => {
    face.clear();
    face.roundRect(0, 6, w, h, h / 2).fill(colors[1]);
    face.roundRect(0, pressed ? 5 : 0, w, h, h / 2).fill(colors[0]).stroke({ width: 3, color: C.ink });
    face.roundRect(10, (pressed ? 5 : 0) + 6, w - 20, h * 0.28, h * 0.14).fill({ color: colors[2], alpha: 0.55 });
  };
  draw(false);
  c.addChild(face);
  const t = text(c, label, Math.round(h * 0.42), C.text, w / 2, h / 2, { stroke: { color: C.ink, width: 6 } }, [0.5, 0.5]);
  c.eventMode = 'static'; c.cursor = 'pointer';
  c.hitArea = new Rectangle(0, 0, w, h + 6);
  c.on('pointerdown', () => { draw(true); t.y = h / 2 + 5; });
  const release = () => { draw(false); t.y = h / 2; };
  c.on('pointerup', release); c.on('pointerupoutside', release);
  c.on('pointertap', onTap);
  return c;
}

// Icon atlas (art/raw/icon_*.png -> tools/derive_native.py -> assets/icons.png).
let ICONS = {};
export function registerIcons(texture, meta) {
  meta.keys.forEach((key, i) => {
    const x = (i % meta.cols) * meta.size, y = Math.floor(i / meta.cols) * meta.size;
    ICONS[key] = new Texture({ source: texture.source, frame: new Rectangle(x, y, meta.size, meta.size) });
  });
}
export function icon(key, size) {
  const s = new Sprite(ICONS[key] || Texture.EMPTY);
  s.anchor.set(0.5);
  s.width = s.height = size;
  return s;
}

// Level / progress pips (e.g. upgrade level 3 of 5).
export function pips(n, max, color = C.gold) {
  const g = new Graphics();
  for (let i = 0; i < max; i++) {
    g.roundRect(i * 22, 0, 16, 10, 3).fill(i < n ? color : 0x0d151d).stroke({ width: 2, color: C.ink });
  }
  return g;
}
