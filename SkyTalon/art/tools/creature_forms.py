"""Turns leg six's creature sheets (art/raw/leg6/round3/creatures_ch*.png and tree.png, drawn by Codex from
art/raw/leg6/prompts/round3_creatures_and_mids.sh) into pixel sprites the game draws. A sheet is four animals in a row
on a flat green background, seen from above, head down. For each: key out the green, cut the four apart, scale each to
its width in the game, reduce to its own small palette, and write
  game/src/render/leg6Creatures.js   palettes + rows of palette indices (the game ships no image file)
  art/preview/leg6_creatures.png     the result at three times its size, for review
Mechanical only, no hand edits. Run from SkyTalon/:  python art/tools/creature_forms.py
"""
import json
import sys
import numpy as np
from scipy import ndimage
from PIL import Image

SRC = "art/raw/leg6/round3/"
# sheet -> (name in the game, widest and longest it may be in art pixels = world px), left to right. The widths are
# what the placeholder sprites measured on screen; the lengths are about four times the hit circle in sim/leg6.js.
SHEETS = [
    ("creatures_ch1.png", [("eudi", 48, 70), ("peteino", 54, 70), ("herrera", 48, 124), ("coelo", 26, 84)]),
    ("creatures_ch2.png", [("stego", 66, 126), ("orni", 44, 84), ("dilopho", 60, 110), ("rham", 66, 90)]),
    ("creatures_ch3.png", [("ptera", 76, 80), ("elasmo", 44, 80), ("archelon", 90, 100), ("ichthy", 48, 60)]),
    ("creatures_ch4.png", [("trike", 72, 144), ("anky", 72, 150), ("dromaeo", 60, 90), ("pachy", 60, 124)]),
    ("tree.png", [("tree", 96, 96)]),
]
COLOURS = 24
PX = 1                                                         # world px per art pixel
OUT_JS, OUT_PNG, EXPORT, WHAT = "game/src/render/leg6Creatures.js", "art/preview/leg6_creatures.png", "LEG6_CREATURES", "art/raw/leg6/round3/*.png"
if len(sys.argv) > 1 and sys.argv[1] == "leg2":                # leg two's machines: one sheet, the shutter pod shut and open
    SRC = "art/raw/leg2/"
    SHEETS = [("minions.png", [("orbiter", 44, 44), ("shut", 60, 66), ("open", 72, 66), ("twinvec", 72, 74), ("rammer", 52, 74)])]
    OUT_JS, OUT_PNG, EXPORT, WHAT = "game/src/render/leg2Machines.js", "art/preview/leg2_machines.png", "LEG2_MACHINES", "art/raw/leg2/minions.png"
if len(sys.argv) > 1 and sys.argv[1] == "leg3":                # leg three's machines, and Prometheus's anchors and eagle
    SRC = "art/raw/leg3/"
    SHEETS = [("minions.png", [("mortar", 52, 60), ("aegis", 64, 80), ("crystal", 48, 48), ("echo", 44, 70), ("anchor", 72, 90), ("eagle", 96, 70)])]
    OUT_JS, OUT_PNG, EXPORT, WHAT = "game/src/render/leg3Machines.js", "art/preview/leg3_machines.png", "LEG3_MACHINES", "art/raw/leg3/minions.png"

if len(sys.argv) > 1 and sys.argv[1] == "leg4":                # leg four's machines (a revenant and its husk), and the bosses' parts
    SRC = "art/raw/leg4/"
    SHEETS = [("minions.png", [("metronome", 56, 60), ("scout", 40, 36), ("beast", 66, 66), ("buoy", 56, 56), ("revenant", 52, 64), ("husk", 48, 60)]),
              ("parts.png", [("arm", 48, 90), ("ferry", 96, 48), ("heel", 54, 54)])]
    OUT_JS, OUT_PNG, EXPORT, WHAT = "game/src/render/leg4Machines.js", "art/preview/leg4_machines.png", "LEG4_MACHINES", "art/raw/leg4/minions.png and parts.png"

if len(sys.argv) > 1 and sys.argv[1] == "leg5":                # leg five's machines, Hundun's eye and life gate, and the soul figure (three leans)
    SRC = "art/raw/leg5/"
    SHEETS = [("minions.png", [("promskiff", 60, 60), ("flareskiff", 60, 60), ("slowship", 76, 70), ("talisman", 36, 70), ("eye", 48, 48), ("gate", 48, 48)]),
              ("soul.png", [("soul0", 56, 60), ("soul1", 56, 60), ("soul2", 56, 60)])]
    OUT_JS, OUT_PNG, EXPORT, WHAT = "game/src/render/leg5Machines.js", "art/preview/leg5_machines.png", "LEG5_MACHINES", "art/raw/leg5/minions.png and soul.png"


def cut(path, count):
    """The `count` biggest connected shapes, left to right, each as its own mask and bounding columns. (Columns alone
    cannot separate two animals when a wing tip reaches over its neighbour.)"""
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    keep = ~((g > 170) & (r < 110) & (b < 110))               # the screen is pure green; a leaf or a ripple that is merely greenish stays
    lab, n = ndimage.label(ndimage.binary_dilation(keep, iterations=3))   # dilated: a glow or a ripple stays with its animal
    sizes = ndimage.sum(keep, lab, range(1, n + 1))
    best = sorted(np.argsort(sizes)[::-1][:count] + 1, key=lambda i: ndimage.center_of_mass(lab == i)[1])
    if len(best) != count:
        raise SystemExit(f"{path}: expected {count} animals, found {len(best)}")
    out = []
    for i in best:
        m = keep & (lab == i)
        cols = np.nonzero(m.any(axis=0))[0]
        out.append((m, cols.min(), cols.max() + 1))
    return a, out


def sprite(a, keep, xa, xb, width, length):
    rows = np.nonzero(keep[:, xa:xb].sum(axis=1) > 2)[0]
    ya, yb = rows.min(), rows.max() + 1
    scale = min(width / (xb - xa), length / (yb - ya))
    w, h = max(1, round((xb - xa) * scale)), max(1, round((yb - ya) * scale))
    rgb = Image.fromarray(a[ya:yb, xa:xb].astype(np.uint8), "RGB").resize((w, h), Image.Resampling.BOX)
    al = Image.fromarray((keep[ya:yb, xa:xb] * 255).astype(np.uint8), "L").resize((w, h), Image.Resampling.BOX)
    px = np.dstack([np.asarray(rgb), (np.asarray(al) > 140) * 255]).astype(np.uint8)
    pr, pg, pb = px[..., 0].astype(int), px[..., 1].astype(int), px[..., 2].astype(int)
    px[(pg > 170) & (pr < 110) & (pb < 110), 3] = 0   # the green fringe the box filter leaves on the rim
    return px


def main():
    data, shown = {}, []
    for sheet, animals in SHEETS:
        a, shapes = cut(SRC + sheet, len(animals))
        for (name, width, length), (keep, xa, xb) in zip(animals, shapes):
            s = sprite(a, keep, xa, xb, width, length)
            solid = s[..., :3][s[..., 3] > 0]
            pal_img = Image.fromarray(solid.reshape(1, -1, 3), "RGB").quantize(COLOURS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
            pal = np.array(pal_img.getpalette()[:COLOURS * 3]).reshape(-1, 3)
            rgb = s[..., :3].astype(np.int32)
            idx = np.argmin(((rgb[:, :, None, :] - pal[None, None, :, :]) ** 2).sum(-1), axis=-1)
            rows = ["".join("." if s[y, x, 3] == 0 else chr(48 + int(idx[y, x])) for x in range(s.shape[1])) for y in range(s.shape[0])]
            data[name] = {"px": PX, "palette": [int(r) << 16 | int(g) << 8 | int(b) for r, g, b in pal], "rows": rows}
            out = np.dstack([pal[idx].astype(np.uint8), s[..., 3]])
            shown.append((name, out))
            print(f"{name}: {s.shape[1]}x{s.shape[0]}")
    js = "// GENERATED by art/tools/creature_forms.py from " + WHAT + " (drawn by Codex). Do not edit.\n"
    js += "// Per creature: px = world px per art pixel, palette, rows = one character per art pixel: '.' = empty, chr(48 + n) = palette index n.\n"
    js += "// Every picture is seen from above with its head toward the bottom of the screen.\n"
    js += "export const " + EXPORT + " = " + json.dumps(data, separators=(",", ":")) + ";\n"
    open(OUT_JS, "w", encoding="utf-8", newline="\n").write(js)
    k, pad = 3, 10
    rows_of = [shown[i:i + 8] for i in range(0, len(shown), 8)]
    W = max(sum(s.shape[1] * k + pad for _, s in r) for r in rows_of) + pad
    H = sum(max(s.shape[0] for _, s in r) * k + pad for r in rows_of) + pad
    img = Image.new("RGB", (W, H), (58, 106, 82))
    y0 = pad
    for r in rows_of:
        x0 = pad
        for _, s in r:
            big = Image.fromarray(s, "RGBA").resize((s.shape[1] * k, s.shape[0] * k), Image.Resampling.NEAREST)
            img.paste(big, (x0, y0), big)
            x0 += s.shape[1] * k + pad
        y0 += max(s.shape[0] for _, s in r) * k + pad
    img.save(OUT_PNG)


main()
