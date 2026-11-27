"""Build the cel-shaded set from art/raw/cel_*_t1.png (prompts: cel_prompts.py; log: art/raw/LOG.md).

  characters -> game/src/assets/cel/actors.png + actors.json   9 poses per kind, feet-centre anchors
  scenes     -> game/src/assets/cel/far_<stage>.png, near_<stage>.png
  props      -> game/src/assets/cel/props.png + props.json
Everything is stored at RES x the world size (texture resolution RES in Pixi, linear filtering) so the cel lines stay
clean when the 480x270 view is scaled up. Character poses keep soft alpha edges; the chroma fringe is despilled.
"""
import json
from pathlib import Path
from PIL import Image

ART = Path(__file__).resolve().parents[1]
RAW, OUT, PREVIEW = ART / "raw", ART.parent / "game" / "src" / "assets" / "cel", ART / "preview"
RES = 2
# t2 sheets (2026-11-27): 12 poses in two rows of 6 (a four-frame walk cycle); t1 had one row of 9
POSES = ["idle", "walk1", "walk2", "walk3", "walk4", "windup", "strike", "guard", "dodge", "hurt", "jump", "down"]
ROWS = 2
# kind -> (idle height in world px, key colour)
KINDS = {"player": (40, "g"), "soldier": (40, "g"), "bug": (15, "m"), "caster": (40, "m"), "brute": (56, "g"),
         "mother": (56, "m"), "general": (64, "g"), "fallen": (66, "g")}
STAGES = ["gate", "forest", "well", "hall", "cloister", "terrace"]
FAR_H, WALL_H, FLOOR_H = 150, 34, 120
# (wall top, floor top) as fractions of each near picture's height, read off the pictures
NEAR_CUT = {"gate": (0.0, 0.33), "forest": (0.0, 0.40), "well": (0.0, 0.40), "hall": (0.0, 0.40),
            "cloister": (0.0, 0.35), "terrace": (0.30, 0.45)}
PROPS = [("jar", 19), ("crate", 16), ("lamp", 30), ("stele", 30), ("bun", 9), ("pill", 12), ("ore", 9)]


def key(img, kc):
    """RGBA with the chroma key removed: alpha from how far a pixel is from the key, green / magenta spill pulled back."""
    rgba = img.convert("RGBA"); px = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, _ = px[x, y]
            if kc == "g":
                k = g - max(r, b)
                if k > 90: px[x, y] = (0, 0, 0, 0); continue
                if k > 20: px[x, y] = (r, max(r, b), b, int(255 * (90 - k) / 70)); continue
            else:
                k = min(r, b) - g
                if k > 90: px[x, y] = (0, 0, 0, 0); continue
                if k > 20: px[x, y] = (min(r, g + 20), g, min(b, g + 20), int(255 * (90 - k) / 70)); continue
    return rgba


def runs(alpha, n, min_w=8):
    """n pose slices, left to right: weighted 1-D k-means on the opaque pixels per column finds n body centres; each cut
    goes at the emptiest column between two neighbouring centres, so a detached blade tip stays with its own pose."""
    w, h = alpha.size
    small = alpha.resize((w // 2, h // 2), Image.Resampling.BOX)
    dens = [sum(1 for y in range(small.height) if small.getpixel((x, y)) > 60) for x in range(small.width)]
    xs = [x for x in range(len(dens)) if dens[x] > 0]
    c = [xs[0] + (xs[-1] - xs[0]) * (i + 0.5) / n for i in range(n)]
    for _ in range(40):
        acc = [[0.0, 0.0] for _ in range(n)]
        for x in xs:
            k = min(range(n), key=lambda i: abs(x - c[i])); acc[k][0] += x * dens[x] ** 2; acc[k][1] += dens[x] ** 2
        c = sorted(acc[i][0] / acc[i][1] if acc[i][1] else c[i] for i in range(n))
    cuts = [0]
    for i in range(n - 1):
        lo, hi = int(c[i]), int(c[i + 1])
        seg = dens[lo:hi + 1]; cuts.append((lo + seg.index(min(seg))) * 2)
    cuts.append(w)
    return [[cuts[i], cuts[i + 1]] for i in range(n)]


def rows(alpha, n):
    """n horizontal bands: cut at the emptiest row between the n densest row clusters (same idea as runs, on rows)."""
    t = alpha.transpose(Image.Transpose.TRANSPOSE)
    return runs(t, n)


def drop_slivers(im):
    """Remove bits of the neighbouring pose that the cut carried in: connected pieces that touch the left or right edge of
    the crop and are small next to the body (under 15 % of the largest piece). The pose's own blade tips do not touch the
    cut, so they stay. Labelled on a half-size mask (fast enough without scipy)."""
    w, h = im.size
    m = im.getchannel("A").resize((max(1, w // 2), max(1, h // 2)), Image.Resampling.BOX).point(lambda v: 1 if v > 40 else 0)
    mw, mh = m.size; px = m.load(); lab = [[0] * mw for _ in range(mh)]; comps = []
    for y0 in range(mh):
        for x0 in range(mw):
            if not px[x0, y0] or lab[y0][x0]: continue
            n = len(comps) + 1; stack = [(x0, y0)]; lab[y0][x0] = n; cells = []
            while stack:
                x, y = stack.pop(); cells.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < mw and 0 <= ny < mh and px[nx, ny] and not lab[ny][nx]:
                        lab[ny][nx] = n; stack.append((nx, ny))
            comps.append(cells)
    if len(comps) < 2: return im
    big = max(len(c) for c in comps)
    a = im.getchannel("A").load()
    for cells in comps:
        edge = any(x <= 1 or x >= mw - 2 for x, _ in cells)
        if edge and len(cells) < big * 0.15:
            for x, y in cells:
                for dy in (0, 1):
                    for dx in (0, 1):
                        X, Y = x * 2 + dx, y * 2 + dy
                        if X < w and Y < h: a[X, Y] = 0
    bb = im.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
    return im.crop(bb) if bb else im


def feet_x(im):
    """Centre of the opaque pixels in the bottom fifth (the feet), so a swung weapon does not shift the anchor."""
    a = im.getchannel("A"); w, h = a.size; y0 = int(h * 0.8); xs = []
    for y in range(y0, h):
        for x in range(w):
            if a.getpixel((x, y)) > 128: xs.append(x)
    return sum(xs) / len(xs) / w if xs else 0.5


def shelf(items, width):
    """Shelf-pack (name, image) -> positions, total height."""
    x = y = row = 0; pos = {}
    for name, im in sorted(items, key=lambda t: -t[1].height):
        if x + im.width > width: x, y, row = 0, y + row + 2, 0
        pos[name] = (x, y); x += im.width + 2; row = max(row, im.height)
    return pos, y + row


def characters():
    items, anchors = [], {}
    for kind, (h, kc) in KINDS.items():
        rgba = key(Image.open(RAW / f"cel_chr_{kind}_t2.png"), kc)
        crops, per = [], len(POSES) // ROWS
        for r0, r1 in rows(rgba.getchannel("A"), ROWS):
            band_ = rgba.crop((0, r0, rgba.width, r1))
            for x0, x1 in runs(band_.getchannel("A"), per):
                sub = band_.crop((x0, 0, x1, band_.height)); bb = sub.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
                crops.append(drop_slivers(sub.crop(bb)))
        assert len(crops) == len(POSES), f"{kind}: found {len(crops)} poses"
        s = h * RES / crops[0].height                     # one scale per character, from the idle pose
        for pose, im in zip(POSES, crops):
            im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.Resampling.LANCZOS)
            name = f"{kind}/{pose}"
            items.append((name, im)); anchors[name] = {"x": round(feet_x(im), 3), "y": 1}
    pos, H = shelf(items, 1024)
    sheet = Image.new("RGBA", (1024, H), (0, 0, 0, 0)); frames = {}
    for name, im in items:
        x, y = pos[name]; sheet.paste(im, (x, y))
        frames[name] = {"frame": {"x": x, "y": y, "w": im.width, "h": im.height}, "anchor": anchors[name]}
    sheet.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(OUT / "actors.png", optimize=True)   # soft edges kept
    (OUT / "actors.json").write_text(json.dumps({"frames": frames, "meta": {"image": "actors.png", "size": {"w": 1024, "h": H}, "scale": RES}}, indent=1) + "\n", encoding="utf-8")
    prev = Image.new("RGBA", sheet.size, (40, 44, 52, 255)); prev.alpha_composite(sheet); prev.save(PREVIEW / "cel_actors.png")
    return sheet.size


def band(img, y0, y1, w, h):
    return img.crop((0, round(y0 * img.height), img.width, round(y1 * img.height))).resize((w, h), Image.Resampling.LANCZOS)


def scenes():
    sizes = {}
    for sid in STAGES:
        far = Image.open(RAW / f"cel_far_{sid}_t1.png").convert("RGB")
        fw = round(far.width * FAR_H / far.height) * RES
        far.resize((fw, FAR_H * RES), Image.Resampling.LANCZOS).quantize(128, dither=Image.Dither.NONE).save(OUT / f"far_{sid}.png", optimize=True)
        near = Image.open(RAW / f"cel_near_{sid}_t1.png").convert("RGB")
        w0, f0 = NEAR_CUT[sid]
        nw = round(near.width * FLOOR_H / ((1 - f0) * near.height)) * RES
        n = Image.new("RGB", (nw, (WALL_H + FLOOR_H) * RES))
        n.paste(band(near, w0, f0, nw, WALL_H * RES), (0, 0)); n.paste(band(near, f0, 1, nw, FLOOR_H * RES), (0, WALL_H * RES))
        n.quantize(128, dither=Image.Dither.NONE).save(OUT / f"near_{sid}.png", optimize=True)
        sizes[sid] = [fw // RES, nw // RES]
    return sizes


PROPS2 = [("mound", 24), ("chest", 13), ("chestOpen", 15)]   # sword mound, chest closed / open (cel_props2)


def props():
    items = []
    for raw, spec in (("cel_props_t1.png", PROPS), ("cel_props2_t1.png", PROPS2)):
        rgba = key(Image.open(RAW / raw), "g")
        cols = runs(rgba.getchannel("A"), len(spec))
        items += cut(rgba, spec, cols)
    write_props(items)


def cut(rgba, spec, cols):
    items = []
    for (name, h), (x0, x1) in zip(spec, cols):
        sub = rgba.crop((x0, 0, x1, rgba.height)); sub = sub.crop(sub.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox())
        items.append((name, sub.resize((max(1, round(sub.width * h * RES / sub.height)), h * RES), Image.Resampling.LANCZOS)))
    return items


def write_props(items):
    W = sum(im.width + 2 for _, im in items); H = max(im.height for _, im in items)
    sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0)); frames = {}; x = 0
    for name, im in items:
        sheet.paste(im, (x, H - im.height))
        frames[name] = {"frame": {"x": x, "y": H - im.height, "w": im.width, "h": im.height}, "anchor": {"x": 0.5, "y": 1}}
        x += im.width + 2
    sheet.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(OUT / "props.png", optimize=True)
    (OUT / "props.json").write_text(json.dumps({"frames": frames, "meta": {"image": "props.png", "size": {"w": W, "h": H}, "scale": RES}}, indent=1) + "\n", encoding="utf-8")


def main():
    OUT.mkdir(parents=True, exist_ok=True); PREVIEW.mkdir(exist_ok=True)
    print("actors", characters())
    print("scenes", scenes())
    props(); print("props ok")


if __name__ == "__main__":
    main()
