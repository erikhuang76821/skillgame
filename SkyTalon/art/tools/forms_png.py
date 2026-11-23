"""Move the sprite pixels out of the generated sprite modules into one PNG per module (the size of the shipped game).

The generators (boss_forms.py, creature_forms.py, ship_forms.py) write each sprite as rows of text, one character per
art pixel ('.' = empty, chr(48 + n) = palette index n). As text that is ~2 MB of the game. This tool finds every sprite
(a list of equal-length strings) in each module, packs them all into one grayscale sheet (lossless WebP; pixel value =
the character's code), and rewrites the module so each sprite is a reference {"$png": [x, y, w, h]} into that sheet. At
boot, render/formsSheets.js decodes the sheets and puts the rows back, so nothing else in the game changes. The PNG is
imported like any other asset: a hashed file on the web, inlined into the single file for the store build.

Run after any generator:  python art/tools/forms_png.py            (all modules)
                          python art/tools/forms_png.py --check    (exit 1 if a module still holds text sprites)
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

GAME = Path(__file__).resolve().parents[2] / 'game' / 'src' / 'render'
MODULES = ['bossForms', 'leg2Forms', 'leg3Forms', 'leg4Forms', 'leg5Forms', 'leg6Forms', 'leg6Creatures',
           'leg2Machines', 'leg3Machines', 'leg4Machines', 'leg5Machines', 'shipForms']
SHEET_W = 1024
EXPORT = re.compile(r'^export const (\w+) = (.*);\s*$')


def is_sprite(o):
    return (isinstance(o, list) and len(o) > 0 and all(isinstance(s, str) for s in o)
            and len(o[0]) >= 2 and len({len(s) for s in o}) == 1 and all(32 < ord(c) < 256 for s in o for c in s))


def collect(o, out):
    """Every sprite in `o`, in a fixed walk order, replaced in place by a placeholder index."""
    if isinstance(o, dict):
        for k, v in o.items():
            if is_sprite(v): out.append(v); o[k] = {'$png': len(out) - 1}
            else: collect(v, out)
    elif isinstance(o, list):
        for i, v in enumerate(o):
            if is_sprite(v): out.append(v); o[i] = {'$png': len(out) - 1}
            else: collect(v, out)


def place(o, boxes):
    if isinstance(o, dict):
        for k, v in o.items():
            if isinstance(v, dict) and '$png' in v and isinstance(v['$png'], int): o[k] = {'$png': boxes[v['$png']]}
            else: place(v, boxes)
    elif isinstance(o, list):
        for i, v in enumerate(o):
            if isinstance(v, dict) and '$png' in v and isinstance(v['$png'], int): o[i] = {'$png': boxes[v['$png']]}
            else: place(v, boxes)


def pack(sprites):
    """Shelf packing, tallest first; returns the boxes (in the sprites' order) and the sheet size."""
    order = sorted(range(len(sprites)), key=lambda i: -len(sprites[i]))
    boxes, x, y, shelf = [None] * len(sprites), 0, 0, 0
    for i in order:
        w, h = len(sprites[i][0]), len(sprites[i])
        if x + w > SHEET_W: x, y, shelf = 0, y + shelf, 0
        boxes[i] = [x, y, w, h]
        x += w; shelf = max(shelf, h)
    return boxes, (SHEET_W, y + shelf)


def convert(name):
    path = GAME / f'{name}.js'
    lines = path.read_text(encoding='utf8').splitlines()
    exports, sprites = [], []
    for n, line in enumerate(lines):
        m = EXPORT.match(line)
        if not m: continue
        obj = json.loads(m.group(2))
        if is_sprite(obj): obj = {'$png': None}   # never at the top level in practice
        collect(obj, sprites)
        exports.append((n, m.group(1), obj))
    if not sprites:
        return None
    boxes, (w, h) = pack(sprites)
    img = Image.new('L', (w, h), 0)
    px = img.load()
    for rows, (x0, y0, _, _) in zip(sprites, boxes):
        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                px[x0 + x, y0 + y] = ord(ch)
    png = GAME / f'{name}.forms.webp'
    img.convert('RGB').save(png, 'WEBP', lossless=True, quality=100, method=6)   # lossless: every value comes back exact; ~8% under PNG
    for n, ident, obj in exports:
        place(obj, boxes)
        lines[n] = f'export const {ident} = {json.dumps(obj, separators=(",", ":"), ensure_ascii=False)};'
    stem = f'{name}.forms.webp'
    head = [f'// Sprite pixels live in ./{stem} (art/tools/forms_png.py); render/formsSheets.js puts the rows back at boot.',
            f"import sheet from './{stem}';",
            'export const SHEET = sheet;']
    lines = [l for l in lines if not l.startswith("import sheet from './") and not l.startswith('export const SHEET =')
             and not l.startswith('// Sprite pixels live in')]
    first = next(i for i, l in enumerate(lines) if EXPORT.match(l))
    lines[first:first] = head
    path.write_text('\n'.join(lines) + '\n', encoding='utf8')
    return len(sprites), png.stat().st_size, path.stat().st_size


def main():
    if '--check' in sys.argv:
        bad = [m for m in MODULES if any(EXPORT.match(l) and '"..' in l or EXPORT.match(l) and re.search(r'\["[.0-~]{8,}', l)
                                         for l in (GAME / f'{m}.js').read_text(encoding='utf8').splitlines())]
        print('text sprites left in: ' + ', '.join(bad) if bad else 'all modules use PNG sheets')
        sys.exit(1 if bad else 0)
    for m in MODULES:
        r = convert(m)
        print(f'{m}: ' + ('nothing to convert' if r is None else f'{r[0]} sprites -> PNG {r[1] // 1024} KB, module {r[2] // 1024} KB'))


if __name__ == '__main__':
    main()
