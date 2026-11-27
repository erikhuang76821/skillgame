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

export const PX = 2;

// Scene themes (stages.js `theme`). Ground / path tiles are picked up by name: ground_<theme>.png, path_<theme>.png.
// A theme whose tiles are missing falls back to the night-forest tiles recoloured with its palette.
const TILE_URLS = import.meta.glob('../assets/pixel/{ground,path}_*.png', { eager: true, query: '?url', import: 'default' });
export const THEMES = Object.freeze({
  forest: { water: [40, 70, 112], props: ['tree_pine', 'tree_oak', 'tree_pine', 'tree_dead', 'rock_0', 'rock_1'], grass: null, dirt: [118, 96, 66], stone: [92, 98, 122], bg: 0x141a33, night: true },
  plains: { water: [62, 112, 152], props: ['bush_0', 'haystack', 'tree_oak', 'bush_0'], grass: [92, 150, 70], dirt: [150, 120, 80], stone: [140, 140, 150], bg: 0x2c4a2a },
  spring: { water: [70, 132, 172], props: ['blossom_tree', 'flower_patch', 'bush_0', 'tree_oak', 'flower_patch'], grass: [96, 160, 84], dirt: [156, 124, 86], stone: [150, 150, 160], bg: 0x2e4c30 },
  desert: { water: [64, 140, 150], props: ['cactus_0', 'cactus_1', 'desert_rock', 'dry_bush'], grass: [206, 170, 110], dirt: [170, 128, 80], stone: [186, 166, 134], bg: 0x6a5030 },
  highland: { water: [58, 98, 132], props: ['crag_0', 'crag_1', 'alpine_pine', 'rock_0'], grass: [104, 128, 92], dirt: [124, 114, 104], stone: [132, 134, 142], bg: 0x2a3a3a },
  autumn: { water: [58, 92, 112], props: ['maple_tree', 'maple_tree_1', 'leaf_pile', 'tree_dead'], grass: [166, 104, 52], dirt: [112, 80, 56], stone: [124, 112, 112], bg: 0x3a2a1a },
  winter: { water: [168, 200, 228], props: ['snow_pine', 'snow_pine_1', 'snow_rock'], grass: [208, 220, 236], dirt: [124, 112, 112], stone: [150, 160, 182], bg: 0x2a3448 },
});
/** URL of a theme's ground tile (for menu thumbnails); falls back to the night-forest tile. */
export const themeThumb = theme => TILE_URLS[`../assets/pixel/ground_${theme}.png`] ?? TILE_URLS['../assets/pixel/ground_forest.png'];
export async function themeTiles(px, theme) {
  const url = k => TILE_URLS[`../assets/pixel/${k}_${theme}.png`];
  const g = url('ground'), p = url('path');
  return { grass: g ? await tile(g) : px.forest, path: p ? await tile(p) : px.path, native: !!g };
}                                          // world px per art px

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
