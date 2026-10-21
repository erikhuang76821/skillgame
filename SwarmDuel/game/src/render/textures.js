// Code-native pixel textures (0 bytes of download): night ground, decor, pickups, projectiles,
// lighting, white hit-flash sheets. Per the skill, simple props/VFX stay in code.
import { Texture } from 'pixi.js';
import { hash32 } from '../sim/rng.js';

function canvasTexture(w, h, draw, scaleMode) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, c);
  const t = Texture.from(c);
  if (scaleMode) t.source.scaleMode = scaleMode;
  return t;
}

const px = (g, color, x, y, w = 1, h = 1) => { g.fillStyle = color; g.fillRect(x, y, w, h); };

// Night campground palette (matches the key art: moonlit teal-green, warm firelight).
const GRASS = ['#1d3a30', '#22443a', '#1a3329', '#2a5244', '#16302a'];

export function makeTextures() {
  const decor = {
    tuft: canvasTexture(9, 6, g => {
      for (const [x, h] of [[1, 3], [3, 5], [5, 4], [7, 3]]) { px(g, '#0f241c', x, 6 - h, 1, h); px(g, '#3f7a5a', x, 6 - h, 1, 1); }
      px(g, '#2c5b45', 2, 4, 5, 2);
    }),
    rock: canvasTexture(11, 8, g => {
      px(g, '#0d1418', 1, 1, 9, 7); px(g, '#0d1418', 0, 3, 11, 4);
      px(g, '#4c5a63', 1, 2, 9, 4); px(g, '#6c7d87', 2, 2, 5, 2); px(g, '#36424a', 1, 5, 9, 2);
    }),
    flower: canvasTexture(5, 5, g => { px(g, '#9fd6ff', 1, 0, 3, 3); px(g, '#e8f6ff', 2, 1); px(g, '#2c5b45', 2, 3, 1, 2); }),
    mushroom: canvasTexture(6, 6, g => { px(g, '#3a0e0e', 0, 0, 6, 3); px(g, '#c8413a', 1, 0, 4, 2); px(g, '#f2e6d0', 2, 1); px(g, '#e8dcc0', 2, 3, 2, 3); }),
    log: canvasTexture(22, 8, g => {
      px(g, '#1a0e07', 0, 1, 22, 7); px(g, '#6b3f1f', 1, 2, 20, 4); px(g, '#8a5a30', 1, 2, 20, 1);
      px(g, '#c49a62', 18, 2, 3, 4); px(g, '#8a5a30', 19, 3, 1, 2);
    }),
    dirt: canvasTexture(28, 14, g => {
      g.fillStyle = '#2b2a22'; g.beginPath(); g.ellipse(14, 7, 13, 6, 0, 0, Math.PI * 2); g.fill();
      px(g, '#3a382c', 8, 4, 4, 1); px(g, '#3a382c', 15, 8, 5, 1);
    }),
  };

  return {
    grass: canvasTexture(64, 64, g => {
      px(g, GRASS[0], 0, 0, 64, 64);
      for (let i = 0; i < 260; i++) {
        const h = hash32(91, 6, i);
        px(g, GRASS[1 + (h % 4)], (h >>> 4) % 64, (h >>> 12) % 64, 1 + ((h >>> 20) % 2), 1 + ((h >>> 22) % 2));
      }
    }),
    decor,
    orb: canvasTexture(7, 7, g => {
      px(g, '#1f5410', 2, 0, 3, 7); px(g, '#1f5410', 0, 2, 7, 3); px(g, '#1f5410', 1, 1, 5, 5);
      px(g, '#7fe63a', 2, 1, 3, 5); px(g, '#7fe63a', 1, 2, 5, 3); px(g, '#d9ffb0', 2, 2, 2, 1);
    }),
    pinecone: canvasTexture(6, 7, g => {
      px(g, '#1a0e07', 1, 0, 4, 7); px(g, '#1a0e07', 0, 1, 6, 5);
      px(g, '#8a5527', 1, 1, 4, 5); px(g, '#c07a3a', 1, 1); px(g, '#c07a3a', 3, 2); px(g, '#c07a3a', 2, 4); px(g, '#5a3315', 4, 5);
    }),
    flame: canvasTexture(7, 9, g => {
      px(g, '#5a1206', 1, 2, 5, 7); px(g, '#5a1206', 2, 0, 3, 2);
      px(g, '#ff6a1a', 2, 2, 3, 6); px(g, '#ff6a1a', 1, 4, 5, 4); px(g, '#ffd04a', 2, 5, 3, 3); px(g, '#fff4c2', 3, 6);
    }),
    hotdog: canvasTexture(12, 7, g => {
      px(g, '#3a1a08', 0, 1, 12, 6); px(g, '#e8b46a', 1, 3, 10, 3);
      px(g, '#b8442a', 0, 1, 12, 3); px(g, '#ffd23f', 2, 2); px(g, '#ffd23f', 5, 1); px(g, '#ffd23f', 8, 2);
    }),
    shadow: canvasTexture(14, 5, g => { g.fillStyle = 'rgba(0,6,4,0.45)'; g.fillRect(2, 0, 10, 5); g.fillRect(0, 1, 14, 3); }),
    spark: canvasTexture(3, 3, g => { px(g, '#ffffff', 1, 0, 1, 3); px(g, '#ffffff', 0, 1, 3, 1); }),
    // Darkness with a soft hole around the hero (20 Minutes Till Dawn style). Linear-filtered.
    darkness: canvasTexture(256, 256, g => {
      const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      r.addColorStop(0.0, 'rgba(3,6,16,0)');
      r.addColorStop(0.07, 'rgba(3,6,16,0)');
      r.addColorStop(0.2, 'rgba(3,6,16,0.45)');
      r.addColorStop(0.4, 'rgba(3,6,16,0.66)');
      r.addColorStop(1.0, 'rgba(3,6,16,0.74)');
      g.fillStyle = r; g.fillRect(0, 0, 256, 256);
    }, 'linear'),
    glow: canvasTexture(128, 128, g => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,170,80,0.85)'); r.addColorStop(0.4, 'rgba(255,120,40,0.3)'); r.addColorStop(1, 'rgba(255,90,20,0)');
      g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    }, 'linear'),
    campfire: [0, 1].map(f => canvasTexture(24, 22, g => {
      px(g, '#1a0e07', 2, 15, 20, 6); px(g, '#6b3f1f', 3, 16, 18, 2); px(g, '#8a5a30', 5, 18, 14, 2);
      for (const [x, y] of [[1, 17], [20, 17], [10, 20]]) px(g, '#4c5a63', x, y, 3, 3);
      const s = f ? 1 : 0;
      px(g, '#5a1206', 7 - s, 6, 10 + s, 10); px(g, '#ff6a1a', 8 - s, 7 + s, 8, 9 - s); px(g, '#ffd04a', 10, 10 + s, 4, 6 - s);
      px(g, '#ff6a1a', 11 + s, 3 + s, 2, 4); px(g, '#fff4c2', 11, 13, 2, 2);
    })),
    tent: canvasTexture(30, 22, g => {
      px(g, '#0a0f14', 0, 21, 30, 1);
      for (let y = 0; y < 21; y++) {
        const half = Math.floor((y + 1) * 14 / 21);
        px(g, '#0a0f14', 15 - half - 1, y, half * 2 + 2, 1);
        px(g, '#2f6b8f', 15 - half, y, half, 1); px(g, '#23506b', 15, y, half, 1);
      }
      px(g, '#0d1a24', 12, 11, 6, 10); px(g, '#f2b45a', 14, 15, 2, 6);
    }),
  };
}

// White silhouette of a sheet for hit flashes (Pixi tint can only darken). Built once per sheet.
export function flashSheet(texture) {
  const res = texture.source.resource;
  return canvasTexture(texture.width, texture.height, g => {
    g.drawImage(res, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, texture.width, texture.height);
  });
}
