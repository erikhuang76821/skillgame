// Cutout pixel parts for the rigs (gdd/02): one atlas built by art/tools/build.py. Render only.
// Returns null when the atlas fails to load; the rigs then keep the procedural capsule look (N7).
import { Assets, Spritesheet } from 'pixi.js';
import actorsPng from '../assets/pixel/actors.png';
import actorsData from '../assets/pixel/actors.json';

Assets.setPreferences({ preferWorkers: false });

export const KINDS = ['soldier', 'bug', 'caster', 'brute', 'mother', 'general', 'fallen'];   // index = sim foe type
export const WEAPON_ANGLES = 16;
const VIEWS = ['front', 'side', 'back'];

export async function loadActors() {
  try {
    const tex = await Assets.load(actorsPng);
    tex.source.scaleMode = 'nearest';
    const sheet = new Spritesheet(tex, actorsData);
    await sheet.parse();
    const T = sheet.textures, kind = k => ({
      head: T[`${k}/head_front`] ? Object.fromEntries(VIEWS.map(v => [v, T[`${k}/head_${v}`]])) : null,
      torso: Object.fromEntries(VIEWS.map(v => [v, T[`${k}/torso_${v}`]])),
      weapon: Array.from({ length: WEAPON_ANGLES }, (_, i) => T[`${k}/weapon_${String(i).padStart(2, '0')}`]),
    });
    return {
      player: kind('player'),
      foes: KINDS.map(kind),
      props: { mound: T['props/mound'], chest: T['props/chest'], chestOpen: T['props/chest_open'] },
    };
  } catch (e) {
    console.warn('actors atlas failed, using procedural rigs', e);
    return null;
  }
}
