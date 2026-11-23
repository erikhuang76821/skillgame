// The sprite modules keep their pixels in PNG sheets (art/tools/forms_png.py): each sprite is {"$png": [x, y, w, h]}
// and a pixel's gray value is the character the generator wrote for it. hydrateForms() decodes every sheet once at
// boot and puts the rows of text back in place, so the atlas code reads the same data it always did. No network: the
// sheets are bundled (inlined into the single file for the store build).
import * as boss from './bossForms.js';
import * as l2 from './leg2Forms.js';
import * as l3 from './leg3Forms.js';
import * as l4 from './leg4Forms.js';
import * as l5 from './leg5Forms.js';
import * as l6 from './leg6Forms.js';
import * as l6c from './leg6Creatures.js';
import * as m2 from './leg2Machines.js';
import * as m3 from './leg3Machines.js';
import * as m4 from './leg4Machines.js';
import * as m5 from './leg5Machines.js';

const MODULES = [boss, l2, l3, l4, l5, l6, l6c, m2, m3, m4, m5];

async function pixels(url) {
  // the load event, not img.decode(): decode() can wait indefinitely in a tab that is in the background
  const img = await new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = url; });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}

function rowsOf(data, [x0, y0, w, h]) {
  const out = new Array(h), d = data.data, W = data.width;
  for (let y = 0; y < h; y++) {
    let s = '';
    for (let x = 0; x < w; x++) s += String.fromCharCode(d[((y0 + y) * W + x0 + x) * 4]);
    out[y] = s;
  }
  return out;
}

function put(o, data) {
  if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) { const v = o[i]; if (v && v.$png) o[i] = rowsOf(data, v.$png); else if (v && typeof v === 'object') put(v, data); } }
  else for (const k of Object.keys(o)) { const v = o[k]; if (v && v.$png) o[k] = rowsOf(data, v.$png); else if (v && typeof v === 'object') put(v, data); }
}

let ready = null;
/** Decode every sheet and restore the sprite rows (once; later calls wait for the same work). */
export function hydrateForms() {
  ready ??= Promise.all(MODULES.map(async m => {
    const data = await pixels(m.SHEET);
    for (const [name, v] of Object.entries(m)) if (name !== 'SHEET' && v && typeof v === 'object') put(v, data);
  }));
  return ready;
}
