"""LanternHold pixel set: raw generations -> native-resolution frames -> shared 32-colour palette -> atlases + Pixi JSON.

Run from the repo root:  python LanternHold/art/tools/build.py
Inputs : LanternHold/art/raw/<name>_t1.png (picanywhere, flat #00FF00 background; prompts in art/prompts/<name>.txt)
Outputs: LanternHold/game/src/assets/pixel/{units,foes,buildings,fx,icons,ground}.{png,json}, ground_forest.png, ground_path.png,
         palette.json, preview (6x) in LanternHold/art/preview/
Mechanical only (no hand edits): chroma key -> slice by empty gaps -> premultiplied BOX downscale to the target size ->
binary alpha -> hard-map to the shared palette (no dither) -> 1 px indigo outline -> shelf-pack.
Contract: 1 art px = 2 world px, nearest-neighbour. Anchors are written per frame (Pixi v8 reads frames[*].anchor).
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from slice import key, cells

ART = Path(__file__).resolve().parents[1]
RAW = ART / "raw"
OUT = ART.parent / "game" / "src" / "assets" / "pixel"
PREV = ART / "preview"
OUTLINE = (27, 21, 48)          # #1b1530 deep indigo, never pure black
FIXED = [OUTLINE, (255, 182, 74), (198, 168, 255), (111, 211, 196),  # outline, lamp, foe-rim, ally
         (196, 200, 214), (132, 138, 160), (84, 88, 110)]                # steel / stone greys (else greys snap to lilac)
N_COLORS = 32


KEPT = {"unit_priest": "unit_priest_v2_t2a"}   # name -> kept take (default <name>_t1); see art/raw/LOG.md


def raw(name):
    return key(Image.open(RAW / f"{KEPT.get(name, name + '_t1')}.png"))


# ---------------------------------------------------------------- reduce
def shrink(img, s):
    """Premultiplied BOX downscale by factor s, binary alpha. Returns float RGB array + bool mask."""
    tw, th = max(1, round(img.width * s)), max(1, round(img.height * s))
    small = img.convert("RGBa").resize((tw, th), Image.Resampling.BOX).convert("RGBA")
    a = np.asarray(small)
    return a[..., :3].astype(np.float32), a[..., 3] >= 128


def localq(parts, k):
    """Reduce a group (one character / one sprite) to k colours of its own before the shared-palette map:
    removes the speckle a BOX downscale leaves, so the hard palette map lands on clean clusters."""
    px = np.concatenate([rgb[m] for rgb, m in parts]).clip(0, 255).astype(np.uint8)
    if len(px) < k: return parts
    q = Image.fromarray(px.reshape(1, -1, 3), "RGB").quantize(k, method=Image.Quantize.MEDIANCUT, kmeans=4)
    lp = np.array(q.getpalette()[: 3 * k]).reshape(-1, 3).astype(np.float32)
    li = np.asarray(q).reshape(-1)
    out, i = [], 0
    for rgb, m in parts:
        r = rgb.copy(); n = int(m.sum()); r[m] = lp[li[i:i + n]]; i += n
        out.append((r, m))
    return out


def centroid_x(mask, frac=0.6):
    h = mask.shape[0]
    top = mask[: max(1, int(h * frac))]
    ys, xs = np.nonzero(top)
    if len(xs) == 0: ys, xs = np.nonzero(mask)
    return xs.mean() if len(xs) else mask.shape[1] / 2


class Frame:
    def __init__(self, name, rgb, mask, anchor, outline=True):
        self.name, self.rgb, self.mask, self.anchor, self.outline = name, rgb, mask, anchor, outline


def place(parts, pad, align="feet"):
    """parts: list of (rgb, mask). Put them on one shared canvas size so the animation does not jump.
    feet: bottom aligned + upper-body centroid at the centre; center: bbox centre at the centre."""
    o = pad
    if align == "feet":
        cx = [centroid_x(m) for _, m in parts]
        left = max(c for c in cx); right = max(m.shape[1] - c for (_, m), c in zip(parts, cx))
        half = int(np.ceil(max(left, right)))
        fw, fh = 2 * half + 2 * o, max(m.shape[0] for _, m in parts) + 2 * o
        out = []
        for (rgb, m), c in zip(parts, cx):
            x0 = int(round(half - c)) + o; y0 = fh - o - m.shape[0]
            out.append(_paste(rgb, m, fw, fh, x0, y0))
        return out, (round((half + o) / fw, 4), round((fh - o) / fh, 4))
    fw = max(m.shape[1] for _, m in parts) + 2 * o
    fh = max(m.shape[0] for _, m in parts) + 2 * o
    out = [_paste(rgb, m, fw, fh, (fw - m.shape[1]) // 2, (fh - m.shape[0]) // 2) for rgb, m in parts]
    return out, (0.5, 0.5)


def _paste(rgb, m, fw, fh, x0, y0):
    R = np.zeros((fh, fw, 3), np.float32); M = np.zeros((fh, fw), bool)
    R[y0:y0 + m.shape[0], x0:x0 + m.shape[1]] = rgb; M[y0:y0 + m.shape[0], x0:x0 + m.shape[1]] = m
    return R, M


def median_size(crops):
    return float(np.median([c.width for c in crops])), float(np.median([c.height for c in crops]))


# ---------------------------------------------------------------- asset definitions
FRAMES = {k: [] for k in ("units", "foes", "buildings", "fx", "icons")}
ANIMS = {k: {} for k in FRAMES}


def add_anim(atlas, base, groups, target, align="feet", scale_rows=None, outline=True, s=None, k=10):
    """groups: {anim: [crops]} for one character; one scale + one canvas for all of its animations."""
    if s is None:
        ref = [c for a in (scale_rows or groups) for c in groups[a]]
        w, h = median_size(ref)
        s = min(target[0] / w, target[1] / h)
    flat = [(a, i, c) for a, cs in groups.items() for i, c in enumerate(cs)]
    parts = localq([shrink(c, s) for _, _, c in flat], k)
    placed, anchor = place(parts, 1 if outline else 0, align)
    for (a, i, _), (rgb, m) in zip(flat, placed):
        anim = f"{base}_{a}" if a else base
        n = f"{anim}_{i}"
        FRAMES[atlas].append(Frame(n, rgb, m, anchor, outline))
        ANIMS[atlas].setdefault(anim, []).append(n)
    return s


def add_static(atlas, name, crop, s, align="feet", outline=True, k=12):
    (rgb, m), = localq([shrink(crop, s)], k)
    (placed,), anchor = place([(rgb, m)], 1 if outline else 0, align)
    FRAMES[atlas].append(Frame(name, *placed, anchor, outline))


def build_defs():
    for n in ("worker", "archer", "shield", "priest"):
        idle, walk, atk = cells(raw(f"unit_{n}"), [2, 4, 3])
        add_anim("units", n, {"idle": idle, "walk": walk, "attack": atk}, (18, 20), scale_rows=["idle", "walk"])

    foes = {  # name: (raw, layout, anim names, target)
        "rat": ("foe_rat", [4], ["walk"], (12, 10)),
        "beetle": ("foe_beetle", [4], ["walk"], (16, 12)),
        "moth": ("foe_moth", [4], ["fly"], (16, 14)),
        "shroom": ("foe_shroom", [4, 2], ["walk", "swell"], (12, 14)),
        "snail": ("foe_snail", [4, 2], ["walk", "attack"], (22, 18)),
        "wolf": ("foe_wolf", [4, 2], ["walk", "attack"], (22, 16)),
        "shadowArcher": ("foe_shadow_archer", [4, 2], ["walk", "attack"], (14, 18)),
        "boss": ("foe_boss_maw", [4, 3], ["walk", "attack"], (56, 48)),
    }
    for n, (r, lay, names, t) in foes.items():
        rows = cells(raw(r), lay)
        add_anim("foes", n, dict(zip(names, rows)), t, scale_rows=[names[0]])

    # buildings and props
    (castle,), = cells(raw("bld_castle"), [1])
    add_static("buildings", "castle", castle, min(64 / castle.width, 72 / castle.height))
    (b1, b2, b3), = cells(raw("bld_barracks"), [3])
    s = min(36 / b3.width, 36 / b3.height)
    for i, c in enumerate((b1, b2, b3), 1): add_static("buildings", f"barracks_{i}", c, s)
    walls = cells(raw("wall_tiers"), [3, 3, 3])
    s = 30 / max(c.width for r in walls for c in r)
    for tier, row in zip(("wood", "stone", "iron"), walls):
        for state, c in zip(("intact", "cracked", "broken"), row):
            add_static("buildings", f"wall_{tier}_{state}", c, s, align="center")
    trees, small = cells(raw("props_forest"), [3, 5])
    s = 28 / max(c.height for c in trees)
    for n, c in zip(("tree_pine", "tree_oak", "tree_dead"), trees): add_static("buildings", n, c, s)
    rock0, rock1, rubble, lamp0, lamp1 = small
    for n, c in (("rock_0", rock0), ("rock_1", rock1), ("lamppost_0", lamp0), ("lamppost_1", lamp1)):
        add_static("buildings", n, c, s)
    add_static("buildings", "rubble", rubble, 30 / rubble.width, align="center")

    # fx (no added outline: the generated art already carries its own dark edge where wanted)
    bursts = cells(raw("fx_bursts"), [4, 4, 4, 4])
    for n, row in zip(("explosion", "frost", "fire", "steam"), bursts):
        s = 16 / max(max(c.width, c.height) for c in row)
        add_anim("fx", n, {"": row}, None, align="center", outline=False, s=s)
    r1, r2, r3 = cells(raw("fx_misc"), [3, 7, 3])
    arrow, beam, bolt = r1
    beam = beam.crop((int(beam.width * 0.21), 0, beam.width, beam.height))   # drop the little lantern drawn at the beam root
    beam = beam.crop(beam.getchannel("A").getbbox())
    add_static("fx", "arrow", arrow, 12 / arrow.width, align="center", outline=False)
    add_static("fx", "beam", beam, 24 / beam.width, align="center", outline=False)
    add_static("fx", "bolt", bolt, 24 / bolt.width, align="center", outline=False)
    spark, sparkle = r2[:3], r2[3:]
    add_anim("fx", "spark", {"": spark}, None, align="center", outline=False, s=10 / max(max(c.size) for c in spark))
    add_anim("fx", "sparkle", {"": sparkle}, None, align="center", outline=False, s=14 / max(max(c.size) for c in sparkle))
    nug, chest_c, chest_o = r3
    add_static("fx", "nugget", nug, 8 / max(nug.size), align="center", outline=False)
    s = 20 / max(chest_c.width, chest_o.width)
    add_static("fx", "chest_closed", chest_c, s, outline=False)
    add_static("fx", "chest_open", chest_o, s, outline=False)

    # icons: each scaled into a 24x24 cell with 1 px outline
    names_a = ["rapid", "split", "reinforce", "fireArrow", "burst", "fireWall", "frostArrow", "frostAura", "frostShield"]
    names_b = ["thunder", "chain", "rod", "shieldWall", "prayer", "stoneWall", "beacon", "bounty", "ranch"]
    names_c = ["arrowStorm", "inferno", "tempest", "winter", "gold", "population", "star"]
    for r, lay, names in (("icons_cards_a", [3, 3, 3], names_a), ("icons_cards_b", [3, 3, 3], names_b),
                          ("icons_evo_res", [4, 3], names_c)):
        crops = [c for row in cells(raw(r), lay) for c in row]
        for n, c in zip(names, crops):
            (rgb, m), = localq([shrink(c, 22 / max(c.size))], 8)
            R, M = _paste(rgb, m, 24, 24, (24 - m.shape[1]) // 2, (24 - m.shape[0]) // 2)
            FRAMES["icons"].append(Frame(f"icon_{n}", R, M, (0.5, 0.5), True))


# ---------------------------------------------------------------- ground
def ground_tile(name, grade=None):
    im = Image.open(RAW / f"{name}_t1.png").convert("RGB")
    a = np.asarray(im.resize((64, 64), Image.Resampling.BOX)).astype(np.float32)
    if grade is not None: a = grade(a)
    # seamless: cross-fade with the half-rolled tile, weight 0 at the borders and 1 in the middle
    rolled = np.roll(np.roll(a, 32, 0), 32, 1)
    t = np.minimum(np.arange(64), 63 - np.arange(64)) / 31.5
    w = np.clip(np.minimum.outer(t, t) * 2.2, 0, 1)[..., None]
    return w * a + (1 - w) * rolled, np.ones((64, 64), bool)


# ---------------------------------------------------------------- palette
def build_palette(frames, tiles):
    samples = []
    rng = np.random.default_rng(7)
    for f in frames:
        px = f.rgb[f.mask]
        if len(px): samples.append(px[rng.integers(0, len(px), 600)])
    for rgb, _ in tiles:
        px = rgb.reshape(-1, 3); samples.append(px[rng.integers(0, len(px), 2400)])
    allpx = np.concatenate(samples).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(allpx.reshape(1, -1, 3), "RGB")
    q = img.quantize(N_COLORS - len(FIXED), method=Image.Quantize.MEDIANCUT, kmeans=8)
    pal = np.array(q.getpalette()[: 3 * (N_COLORS - len(FIXED))]).reshape(-1, 3)
    pal = np.vstack([np.array(FIXED), pal]).astype(np.float32)
    # taboo: no pure black / pure white entries
    pal = np.clip(pal, 0, 255)
    pal[pal.min(axis=1) > 236] = np.minimum(pal[pal.min(axis=1) > 236], 236)   # no pure white
    dark = pal.max(axis=1) < 36                       # near-black neutrals lean to the outline indigo instead
    pal[dark] = np.round(0.5 * pal[dark] + 0.5 * np.array(OUTLINE, np.float32))
    return pal


def to_pal(rgb, pal):
    d = ((rgb[..., None, :] - pal[None, None]) ** 2).sum(-1)
    return d.argmin(-1)


def finalize(f, pal):
    idx = to_pal(f.rgb, pal)
    m = f.mask.copy()
    if f.outline:
        lum = pal[:, 0] * 0.3 + pal[:, 1] * 0.59 + pal[:, 2] * 0.11
        h, w = m.shape
        pm = np.pad(m, 1)
        nb_empty = ~pm[:-2, 1:-1] | ~pm[2:, 1:-1] | ~pm[1:-1, :-2] | ~pm[1:-1, 2:]
        edge = m & nb_empty
        # dark silhouette edge pixels become the outline colour; outside pixels next to light edges get one
        idx[edge & (lum[idx] < 70)] = 0
        light_edge = edge & (idx != 0)
        pl = np.pad(light_edge, 1)
        grow = ~m & (pl[:-2, 1:-1] | pl[2:, 1:-1] | pl[1:-1, :-2] | pl[1:-1, 2:])
        idx[grow] = 0; m = m | grow
    return idx, m


# ---------------------------------------------------------------- packing
def pack(items, maxw=256, pad=1):
    items = sorted(items, key=lambda it: (-it[1].shape[0], -it[1].shape[1]))
    x = y = rowh = 0; pos = {}
    W = max(maxw, max(m.shape[1] for _, m, *_ in items) + pad)
    for it in items:
        h, w = it[1].shape
        if x + w + pad > W: x = 0; y += rowh + pad; rowh = 0
        pos[it[0]] = (x, y); x += w + pad; rowh = max(rowh, h)
    H = y + rowh
    return pos, W, H


def write_atlas(name, finals, anims, pal, maxw=256):
    pos, W, H = pack(finals, maxw)
    canvas = np.full((H, W), 255, np.uint8)  # 255 = transparent index
    frames = {}
    for n, idx, m, anchor in [(f[0], f[2], f[1], f[3]) for f in finals]:
        x, y = pos[n]; h, w = m.shape
        canvas[y:y + h, x:x + w][m] = idx[m]
        frames[n] = {"frame": {"x": x, "y": y, "w": w, "h": h}, "rotated": False, "trimmed": False,
                     "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h}, "sourceSize": {"w": w, "h": h},
                     "anchor": {"x": anchor[0], "y": anchor[1]}}
    img = Image.fromarray(canvas, "P")
    flat = [int(v) for v in pal.flatten()] + [0, 0, 0] * (256 - len(pal))
    img.putpalette(flat)
    img.info["transparency"] = 255
    img.save(OUT / f"{name}.png", optimize=True, transparency=255)
    meta = {"app": "LanternHold/art/tools/build.py", "version": "1.0", "image": f"{name}.png", "format": "RGBA8888",
            "size": {"w": W, "h": H}, "scale": "1",
            "note": "pixel art: 1 art px = 2 world px, use scaleMode 'nearest'; anchor per frame (feet = bottom-centre)"}
    data = {"frames": frames, "animations": anims, "meta": meta}
    (OUT / f"{name}.json").write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8")
    preview(name, img.convert("RGBA"))
    return W, H


def preview(name, rgba, k=6):
    PREV.mkdir(exist_ok=True)
    bg = Image.new("RGBA", rgba.size, (31, 42, 74, 255))   # night-1
    bg.alpha_composite(rgba)
    bg.resize((rgba.width * k, rgba.height * k), Image.Resampling.NEAREST).save(PREV / f"{name}_x{k}.png")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    build_defs()
    tiles = {"ground_forest": ground_tile("ground_forest"),
             "ground_path": ground_tile("ground_path", grade=lambda a: a * np.array([0.6, 0.56, 0.56]) + np.array([10, 12, 20]))}
    allframes = [f for fs in FRAMES.values() for f in fs]
    pal = build_palette(allframes, tiles.values())
    report = {}
    for atlas, fs in FRAMES.items():
        finals = []
        for f in fs:
            idx, m = finalize(f, pal)
            finals.append((f.name, m, idx, f.anchor))
        anims = ANIMS[atlas]
        W, H = write_atlas(atlas, finals, anims, pal, maxw=256 if atlas != "buildings" else 256)
        report[atlas] = {"size": [W, H], "frames": len(fs), "animations": len(anims)}
    # ground atlas (two 64x64 tiles side by side) + standalone tiles for TilingSprite
    gfin = []
    for n, (rgb, m) in tiles.items():
        idx = to_pal(rgb, pal)
        gfin.append((n, m, idx, (0, 0)))
        im = Image.fromarray(idx.astype(np.uint8), "P"); im.putpalette([int(v) for v in pal.flatten()])
        im.save(OUT / f"{n}.png", optimize=True)
    W, H = write_atlas("ground", gfin, {}, pal, maxw=130)
    report["ground"] = {"size": [W, H], "frames": 2}
    (OUT / "palette.json").write_text(json.dumps({"about": "LanternHold pixel set shared palette (index 0 = outline #1b1530)",
                                                   "colors": ["#%02x%02x%02x" % tuple(int(v) for v in c) for c in pal]}, indent=1) + "\n",
                                      encoding="utf-8")
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
