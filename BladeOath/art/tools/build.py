"""BladeOath cutout set (gdd/02): raw generations -> native-size rig parts -> shared palette -> one atlas + Pixi JSON.

Run from the repo root:  python BladeOath/art/tools/build.py
Inputs : BladeOath/art/raw/<name>_t1.png (picanywhere, flat #00FF00 or #FF00FF background; prompts in art/prompts/<name>.txt)
Outputs: BladeOath/game/src/assets/pixel/{actors.png, actors.json, palette.json}, BladeOath/art/preview/actors_x6.png
Mechanical only (no hand edits): chroma key -> slice row 2 by empty gaps -> one premultiplied BOX downscale per character
(torso front height = the gdd/02 target, so head, torso and weapon keep their drawn proportions) -> binary alpha ->
per-character colour reduction -> hard map to the shared palette (no dither) -> 1 px outline -> weapon pre-rotated to
16 angles (8x nearest upscale, nearest rotate, 8x majority downscale) -> shelf pack.
Frame names: <kind>/head_{front,side,back}, <kind>/torso_{front,side,back}, <kind>/weapon_{00..15} (angle k * 22.5 deg,
screen space, 0 = pointing right, clockwise), props/{mound,chest,chest_open}. Anchors are written per frame.
"""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from slice import key, cells

ART = Path(__file__).resolve().parents[1]
RAW, PREV = ART / "raw", ART / "preview"
OUT = ART.parent / "game" / "src" / "assets" / "pixel"
OUTLINE = (22, 26, 38)                       # #161a26
FIXED = [OUTLINE, (34, 38, 46), (53, 58, 68), (76, 82, 92),                    # outline, ink 0-2
         (184, 194, 204), (124, 136, 148), (78, 88, 102),                      # steel
         (111, 180, 200), (63, 127, 153), (38, 80, 106),                       # indigo (player)
         (168, 154, 124), (125, 111, 86), (82, 72, 58),                        # ochre (corpse)
         (143, 176, 105), (95, 125, 72), (59, 80, 48),                         # moss (gu)
         (201, 180, 143), (143, 122, 94),                                      # skin
         (156, 134, 192), (94, 79, 124)]                                       # lilac (fallen)
N_COLORS = 32
ANGLES = 16

# kind -> (raw name, background, row-2 part count, torso front target height, weapon target length) ; gdd/02 §3
# Weapon lengths follow the rig (render/world.js weaponLen * scale) so the blade tip the trail follows matches the art.
KINDS = {
    "player":  ("chr_player",  "green",   7, 10, 16),
    "soldier": ("chr_soldier", "green",   7, 10, 14),
    "bug":     ("chr_bug",     "magenta", 4, 8, 5),
    "caster":  ("chr_caster",  "magenta", 7, 11, 18),
    "brute":   ("chr_brute",   "green",   7, 15, 12),
    "mother":  ("chr_mother",  "magenta", 7, 15, 15),
    "general": ("chr_general", "green",   7, 17, 37),
    "fallen":  ("chr_fallen",  "green",   7, 17, 45),
}
VIEWS = ("front", "side", "back")


def shrink_to(img, w, h):
    small = img.convert("RGBa").resize((max(1, w), max(1, h)), Image.Resampling.BOX).convert("RGBA")
    a = np.asarray(small)
    return a[..., :3].astype(np.float32), a[..., 3] >= 128


def shrink(img, s):
    return shrink_to(img, round(img.width * s), round(img.height * s))


def localq(parts, k=10):
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


def build_palette(all_parts):
    px = np.concatenate([rgb[m] for rgb, m in all_parts]).clip(0, 255).astype(np.uint8)
    free = N_COLORS - len(FIXED)
    q = Image.fromarray(px.reshape(1, -1, 3), "RGB").quantize(free, method=Image.Quantize.MEDIANCUT, kmeans=4)
    extra = [tuple(c) for c in np.array(q.getpalette()[: 3 * free]).reshape(-1, 3)]
    pal = list(FIXED)
    for c in extra:   # keep the reserved hues out: nothing gold / saturated red / near white sneaks in
        r, g, b = c
        if min(c) > 225 or (r > 170 and g > 130 and b < 90) or (r > 170 and g < 90 and b < 90): continue
        if all(sum((a - b_) ** 2 for a, b_ in zip(c, p)) > 120 for p in pal): pal.append(tuple(int(v) for v in c))
    return pal[:N_COLORS]


def to_palette(rgb, m, pal):
    P = np.array(pal, np.float32)
    idx = ((rgb[:, :, None, :] - P[None, None]) ** 2).sum(-1).argmin(-1)
    out = np.zeros(rgb.shape[:2] + (4,), np.uint8)
    out[..., :3] = P[idx].astype(np.uint8); out[..., 3] = np.where(m, 255, 0)
    return out


def outline(a):
    """Pad 1 px and put the outline colour on every transparent pixel 4-adjacent to an opaque one."""
    a = np.pad(a, ((1, 1), (1, 1), (0, 0)))
    o = a[..., 3] > 0
    n = np.zeros_like(o)
    n[1:] |= o[:-1]; n[:-1] |= o[1:]; n[:, 1:] |= o[:, :-1]; n[:, :-1] |= o[:, 1:]
    ring = n & ~o
    a[ring, :3] = OUTLINE; a[ring, 3] = 255
    return a


def rotate(a, deg, grip):
    """Nearest rotation without new colours: 8x upscale, rotate, 8x majority-by-centre downscale. Returns image, grip px."""
    k = 8
    im = Image.fromarray(a, "RGBA").resize((a.shape[1] * k, a.shape[0] * k), Image.Resampling.NEAREST)
    gx, gy = (grip[0] + 0.5) * k, (grip[1] + 0.5) * k
    cx, cy = im.width / 2, im.height / 2
    r = im.rotate(-deg, resample=Image.Resampling.NEAREST, expand=True)
    t = np.radians(deg)
    dx, dy = gx - cx, gy - cy
    ngx = r.width / 2 + dx * np.cos(t) - dy * np.sin(t)
    ngy = r.height / 2 + dx * np.sin(t) + dy * np.cos(t)
    arr = np.asarray(r)
    w, h = r.width // k, r.height // k
    small = arr[k // 2::k, k // 2::k][:h, :w].copy()
    bb = Image.fromarray(small, "RGBA").getchannel("A").getbbox() or (0, 0, w, h)
    small = small[bb[1]:bb[3], bb[0]:bb[2]]
    return small, (ngx / k - bb[0], ngy / k - bb[1])


def pack(frames, width=256):
    frames = sorted(frames, key=lambda f: -f["img"].shape[0])
    x = y = shelf = 0
    for f in frames:
        h, w = f["img"].shape[:2]
        if x + w + 1 > width: x, y, shelf = 0, y + shelf + 1, 0
        f["x"], f["y"] = x, y
        x += w + 1; shelf = max(shelf, h)
    H = 1 << int(np.ceil(np.log2(y + shelf + 1)))
    sheet = np.zeros((H, width, 4), np.uint8)
    for f in frames:
        h, w = f["img"].shape[:2]
        sheet[f["y"]:f["y"] + h, f["x"]:f["x"] + w] = f["img"]
    return sheet, frames


def main():
    groups = {}                       # kind -> list of (name, rgb, mask, anchor-rule)
    for kind, (name, bg, n, torso_h, wlen) in KINDS.items():
        img = key(Image.open(RAW / f"{name}_t1.png"), bg)
        rows = cells(img, [3, n])
        parts = rows[1]
        if len(parts) != n: raise SystemExit(f"{name}: expected {n} parts in row 2, got {len(parts)}")
        if kind == "bug":
            torsos, heads, weapon = parts[0:3], [], parts[3]
        else:
            heads, torsos, weapon = parts[0:3], parts[3:6], parts[6]
        s = torso_h / torsos[0].height
        items = [(f"head_{v}", *shrink(p, s)) for v, p in zip(VIEWS, heads)]
        items += [(f"torso_{v}", *shrink(p, s)) for v, p in zip(VIEWS, torsos)]
        ws = wlen / weapon.width          # the weapon is sized by length so the rig's blade tip lands on the art
        items.append(("weapon", *shrink(weapon, ws)))
        red = localq([(r, m) for _, r, m in items], 10 if kind != "fallen" else 12)
        groups[kind] = [(nm, r, m) for (nm, _, _), (r, m) in zip(items, red)]
    props = cells(key(Image.open(RAW / "props_t1.png"), "green"), [3])[0]
    ptargets = [("mound", 22), ("chest", 11), ("chest_open", 13)]
    pitems = [(nm, *shrink(p, h / p.height)) for (nm, h), p in zip(ptargets, props)]
    groups["props"] = [(nm, r, m) for (nm, _, _), (r, m) in zip(pitems, localq([(r, m) for _, r, m in pitems], 12))]

    pal = build_palette([(r, m) for g in groups.values() for _, r, m in g])
    frames = []
    for kind, items in groups.items():
        for nm, rgb, m in items:
            a = outline(to_palette(rgb, m, pal))
            h, w = a.shape[:2]
            if nm == "weapon":
                # grip = the left end, mid height (weapons are drawn pointing right); anchor = grip after rotation
                grip = (1 + max(1, round(w * 0.08)), h / 2 - 0.5)
                for k in range(ANGLES):
                    r, g = rotate(a, k * 360 / ANGLES, grip)
                    frames.append({"name": f"{kind}/weapon_{k:02d}", "img": r, "anchor": (g[0] / r.shape[1], g[1] / r.shape[0])})
                continue
            if nm.startswith("head"): anc = (0.5, 0.85)          # neck
            elif nm.startswith("torso"): anc = (0.5, 0.5)        # placed at the middle of hip -> shoulder
            else: anc = (0.5, 1.0)                               # props: feet
            frames.append({"name": f"{kind}/{nm}", "img": a, "anchor": anc})

    sheet, frames = pack(frames)
    OUT.mkdir(parents=True, exist_ok=True); PREV.mkdir(exist_ok=True)
    Image.fromarray(sheet, "RGBA").save(OUT / "actors.png", optimize=True)
    # PNG-8: the palette is <= 33 entries (incl. transparent), so quantize losslessly
    im = Image.open(OUT / "actors.png").convert("RGBA")
    im.quantize(colors=len(pal) + 1, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(OUT / "actors.png", optimize=True)
    js = {"frames": {f["name"]: {"frame": {"x": f["x"], "y": f["y"], "w": f["img"].shape[1], "h": f["img"].shape[0]},
                                  "anchor": {"x": round(f["anchor"][0], 4), "y": round(f["anchor"][1], 4)}} for f in frames},
          "meta": {"image": "actors.png", "format": "RGBA8888", "size": {"w": sheet.shape[1], "h": sheet.shape[0]}, "scale": 1}}
    (OUT / "actors.json").write_text(json.dumps(js, separators=(",", ":")), encoding="utf-8")
    (OUT / "palette.json").write_text(json.dumps(["#%02x%02x%02x" % c for c in pal]), encoding="utf-8")
    bgc = np.zeros_like(sheet); bgc[..., :3] = (45, 50, 58); bgc[..., 3] = 255
    a = sheet[..., 3:4] / 255.0
    prev = (sheet[..., :3] * a + bgc[..., :3] * (1 - a)).astype(np.uint8)
    Image.fromarray(prev, "RGB").resize((sheet.shape[1] * 6, sheet.shape[0] * 6), Image.Resampling.NEAREST).save(PREV / "actors_x6.png")
    sizes = {k: {nm: f"{r.shape[1]}x{r.shape[0]}" for nm, r, _ in v if nm in ("head_front", "torso_front", "weapon")} for k, v in groups.items()}
    print(json.dumps({"frames": len(frames), "sheet": f"{sheet.shape[1]}x{sheet.shape[0]}", "colors": len(pal),
                      "bytes": (OUT / "actors.png").stat().st_size, "sizes": sizes}, ensure_ascii=False))


if __name__ == "__main__":
    main()
