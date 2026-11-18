// Pixel-art atlases (LanternHold/art/manifest.json, gdd/02). 1 art px = 2 world px, nearest-neighbour.
// PNGs and JSONs are imported through Vite so both get hashed into the build together.
import { Assets, Spritesheet, Texture } from 'pixi.js';
import unitsPng from '../assets/pixel/units.png';
import foesPng from '../assets/pixel/foes.png';
import buildingsPng from '../assets/pixel/buildings.png';
import fxPng from '../assets/pixel/fx.png';
import iconsPng from '../assets/pixel/icons.png';
import forestPng from '../assets/pixel/ground_forest.png';
import pathPng from '../assets/pixel/ground_path.png';
import unitsData from '../assets/pixel/units.json';
import foesData from '../assets/pixel/foes.json';
import buildingsData from '../assets/pixel/buildings.json';
import fxData from '../assets/pixel/fx.json';
import iconsData from '../assets/pixel/icons.json';

// Decode images on the main thread: worker blobs are not needed and keep the single-file build simple.
Assets.setPreferences({ preferWorkers: false });

export const PX = 2;                                          // world px per art px

async function sheet(png, data) {
  const tex = await Assets.load(png);
  tex.source.scaleMode = 'nearest';
  const s = new Spritesheet(tex, data);
  await s.parse();
  return s;
}
async function tile(png) {
  const tex = await Assets.load(png);
  tex.source.scaleMode = 'nearest';
  tex.source.addressMode = 'repeat';
  return tex;
}

export async function loadPixel() {
  const [units, foes, buildings, fx, icons, forest, path] = await Promise.all([
    sheet(unitsPng, unitsData), sheet(foesPng, foesData), sheet(buildingsPng, buildingsData), sheet(fxPng, fxData), sheet(iconsPng, iconsData),
    tile(forestPng), tile(pathPng),
  ]);
  return { units, foes, buildings, fx, icons, forest, path, iconsUrl: iconsPng, iconsData };
}

/** CSS for a 24x24 icon from the icons atlas, drawn at `size` css px (pixelated). */
export function iconStyle(px, name, size = 40) {
  const f = px.iconsData.frames[`icon_${name}`]?.frame;
  if (!f) return '';
  const k = size / f.w, { w, h } = px.iconsData.meta.size;
  return `background:url(${px.iconsUrl}) ${-f.x * k}px ${-f.y * k}px / ${w * k}px ${h * k}px no-repeat;width:${size}px;height:${size}px;image-rendering:pixelated;`;
}

export const tex = (s, name) => s.textures[name] ?? Texture.EMPTY;
