"""Pack AI pose sheets into a Pixi spritesheet (gdd/02_art_spec.md §4).

Per-sheet options: grid, names, prefix, scale_ref {frame, height|width}, merge_px, torso_band, dx,
assign: 'nearest' (frames = K largest pieces, small pieces join the nearest frame by pixel distance;
use when pieces cross the nominal grid), center: true (centre each frame in its cell; effects / icons).

    python -I art/tools/pack_atlas.py art/atlas.json

Per sheet: alpha mask -> dilate (so sweat drops / motion lines stay with their pose) -> connected
components -> each component goes to the grid cell holding its centroid (poses may cross the
nominal grid lines) -> one frame per cell. All frames of a sheet share ONE scale (from a reference
frame's height), feet (bbox bottom) sit on the anchor line, and the body is centred on the anchor x
(median x of the torso band; per-frame `dx` overrides in the config). Writes <out>.png + <out>.json
(Pixi spritesheet format with per-frame anchors; optional per-sheet `prefix` for frame names) and <review>/<name>_contact.jpg with anchor guides.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage


def load_cfg(path):
    with open(path, encoding='utf8') as f:
        cfg = json.load(f)
    cfg['_dir'] = os.path.dirname(os.path.abspath(path))
    return cfg


def rel(cfg, p):
    return os.path.normpath(os.path.join(cfg['_dir'], p))


def cut_sheet(img, sheet):
    a = np.asarray(img)[:, :, 3]
    solid = a > sheet.get('alpha_min', 16)
    merged = ndimage.binary_dilation(solid, iterations=sheet.get('merge_px', 8))
    lab, n = ndimage.label(merged)
    rows, cols = sheet['grid']
    H, W = a.shape
    comps = []
    for i in range(1, n + 1):
        comp = (lab == i) & solid
        if int(comp.sum()) >= sheet.get('min_px', 150):
            comps.append(comp)
    cells = {}
    if sheet.get('assign') == 'nearest':
        # The K largest pieces are the frames, ordered by grid row then x; every smaller piece (impact lines,
        # sparkles) joins the frame whose PIXELS are closest (not centroids: a burst's lines sit far from its centre).
        k = len(sheet['names'])
        comps.sort(key=lambda c: -int(c.sum()))
        anchors, rest = comps[:k], comps[k:]
        def order(c):
            ys, xs = np.nonzero(c)
            return (min(rows - 1, int(ys.mean() * rows // H)), xs.mean())
        anchors.sort(key=order)
        dist = [ndimage.distance_transform_edt(~c) for c in anchors]
        for idx, c in enumerate(anchors):
            cells[idx] = c.copy()
        for c in rest:
            best = min(range(k), key=lambda j: float(dist[j][c].min()))
            cells[best] |= c
    else:
        # default: each piece goes to the equal grid cell holding its centroid
        for comp in comps:
            ys, xs = np.nonzero(comp)
            r = min(rows - 1, int(ys.mean() * rows // H))
            c = min(cols - 1, int(xs.mean() * cols // W))
            cells.setdefault(r * cols + c, np.zeros_like(solid))
            cells[r * cols + c] |= comp
    frames = {}
    for idx, name in enumerate(sheet['names']):
        if idx not in cells:
            raise SystemExit(f"{sheet['src']}: no pixels for cell {idx} ({name})")
        m = cells[idx]
        ys, xs = np.nonzero(m)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        rgba = np.asarray(img)[y0:y1, x0:x1].copy()
        rgba[:, :, 3] = np.where(m[y0:y1, x0:x1], rgba[:, :, 3], 0)
        h = y1 - y0
        lo, hi = sheet.get('torso_band', [0.35, 0.6])
        band = m[y0 + int(h * lo):y0 + int(h * hi), x0:x1]
        bx = np.nonzero(band)[1]
        body_x = (x1 - x0) / 2 if sheet.get('center') else (float(np.median(bx)) if len(bx) else (x1 - x0) / 2)
        frames[name] = {'img': Image.fromarray(rgba, 'RGBA'), 'body_x': body_x}
    return frames


def place(frames, sheet, cell, anchor):
    cw, ch = cell
    ref = frames[sheet['scale_ref']['frame']]['img']
    sr = sheet['scale_ref']
    s = sr['height'] / ref.height if 'height' in sr else sr['width'] / ref.width
    out = {}
    for name, f in frames.items():
        im = f['img']
        w, h = max(1, round(im.width * s)), max(1, round(im.height * s))
        small = im.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')   # premultiplied: no dark fringes
        dx = sheet.get('dx', {}).get(name, 0)
        ox = round(anchor[0] * cw - f['body_x'] * s) + dx
        oy = round(anchor[1] * ch - h / 2) if sheet.get('center') else round(anchor[1] * ch) - h   # centre mode: effects, icons
        canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
        canvas.alpha_composite(small, (max(ox, 0), max(oy, 0)), (max(-ox, 0), max(-oy, 0)))
        clipped = ox < 0 or oy < 0 or ox + w > cw or oy + h > ch
        if clipped:
            print(f'  warning: {name} clipped (frame {w}x{h} at {ox},{oy} in {cw}x{ch})')
        out[name] = canvas
    return out, s


def main():
    cfg = load_cfg(sys.argv[1])
    for atlas in cfg['atlases']:
        cell, anchor = atlas['cell'], atlas['anchor']
        placed = {}
        for sheet in atlas['sheets']:
            img = Image.open(rel(cfg, sheet['src'])).convert('RGBA')
            frames = cut_sheet(img, sheet)
            got, s = place(frames, sheet, cell, anchor)
            print(f"{sheet['src']}: {len(got)} frames, scale {s:.3f}")
            pre = sheet.get('prefix', '')                     # e.g. 'mouse.' -> frame 'mouse.hit' (names must be unique per atlas)
            placed.update({pre + k: v for k, v in got.items()})

        cols = max(1, atlas.get('max_width', 2048) // (cell[0] + 2))
        names = list(placed)
        rows = -(-len(names) // cols)
        W = min(len(names), cols) * (cell[0] + 2)
        H = rows * (cell[1] + 2)
        sheet_img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        meta = {}
        for i, n in enumerate(names):
            x, y = (i % cols) * (cell[0] + 2), (i // cols) * (cell[1] + 2)
            sheet_img.alpha_composite(placed[n], (x, y))
            meta[n] = {'frame': {'x': x, 'y': y, 'w': cell[0], 'h': cell[1]}, 'rotated': False, 'trimmed': False,
                       'spriteSourceSize': {'x': 0, 'y': 0, 'w': cell[0], 'h': cell[1]},
                       'sourceSize': {'w': cell[0], 'h': cell[1]}, 'anchor': {'x': anchor[0], 'y': anchor[1]}}

        out = rel(cfg, atlas['out'])
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if atlas.get('png8', True):
            q = sheet_img.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
            q.save(out + '.png', optimize=True)
        else:
            sheet_img.save(out + '.png', optimize=True)
        with open(out + '.json', 'w', encoding='utf8') as f:
            json.dump({'frames': meta, 'meta': {'image': os.path.basename(out) + '.png', 'format': 'RGBA8888',
                                                'size': {'w': W, 'h': H}, 'scale': '1'}}, f, indent=1)
        print(f"-> {out}.png {W}x{H} {os.path.getsize(out + '.png') / 1024:.0f} KB")

        # contact sheet on the dojo colour with anchor guides
        review = rel(cfg, cfg.get('review', 'review'))
        os.makedirs(review, exist_ok=True)
        rgba = Image.open(out + '.png').convert('RGBA')
        bg = Image.new('RGBA', rgba.size, (233, 211, 173, 255))
        bg.alpha_composite(rgba)
        d = ImageDraw.Draw(bg)
        for i, n in enumerate(names):
            x, y = (i % cols) * (cell[0] + 2), (i // cols) * (cell[1] + 2)
            ax, ay = x + anchor[0] * cell[0], y + anchor[1] * cell[1]
            d.rectangle([x, y, x + cell[0] - 1, y + cell[1] - 1], outline=(154, 95, 50, 255))
            d.line([x, ay, x + cell[0], ay], fill=(214, 69, 61, 255))
            d.line([ax, y, ax, y + cell[1]], fill=(214, 69, 61, 255))
            d.text((x + 4, y + 2), n, fill=(43, 29, 20, 255))
        bg.convert('RGB').save(os.path.join(review, os.path.basename(out) + '_contact.jpg'), quality=90)


if __name__ == '__main__':
    main()
