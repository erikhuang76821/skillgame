// Stage scenery (gdd/02 §3.2): per stage a far strip and a near strip (art/tools/scenery.py), plus one props sheet.
// Render only. Strips load when their stage is entered; until then (or if a load fails) the baked placeholder stays.
import { Assets, Spritesheet } from 'pixi.js';
import propsPng from '../assets/cel/props.png';
import propsData from '../assets/cel/props.json';

// cel strips are stored at RES x the world size (art/tools/cel_build.py); world.js draws them at 1 / RES
export const RES = 2;
const URLS = import.meta.glob('../assets/cel/{far,near}_*.png', { eager: true, import: 'default' });
const url = (layer, id) => URLS[`../assets/cel/${layer}_${id}.png`];

const cache = new Map();
/** Resolves to { far, near } textures for stage id, or null when they cannot be loaded. */
export function stageStrips(id) {
  if (!cache.has(id)) {
    cache.set(id, (async () => {
      try {
        const [far, near] = await Promise.all([Assets.load(url('far', id)), Assets.load(url('near', id))]);
        return { far, near, res: RES };
      } catch (e) { console.warn('scenery failed for', id, e); return null; }
    })());
  }
  return cache.get(id);
}

/** Prop and item cutouts: { jar, crate, lamp, stele, bun, pill, ore, mound, chest, chestOpen } or null. */
export async function loadProps() {
  try {
    const tex = await Assets.load(propsPng);
    const sheet = new Spritesheet(tex, propsData);
    await sheet.parse();
    return sheet.textures;
  } catch (e) { console.warn('props sheet failed', e); return null; }
}
