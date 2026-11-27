"""Build the v5 scenery from art/raw (run after scenes.py + picanywhere; see art/raw/LOG.md).

  far_<stage>_t1.png  -> game/src/assets/scene/far_<stage>.png   whole picture, FAR_H px tall (the sky above the floor)
  near_<stage>_t1.png -> game/src/assets/scene/near_<stage>.png  the wall band -> WALL_H px, the floor -> FLOOR_H px
  props_v5_t1.png     -> game/src/assets/scene/props.png + props.json (7 cutouts, bottom-centre anchors)

Each strip is box-downscaled to its pixel size and reduced to <= 48 colours (PNG-8). The game tiles a strip by mirroring
every other copy (render/world.js), so the edges always meet.
Where each near picture's wall and floor start was read off the picture by eye (fractions of its height, NEAR_CUT).
"""
import json
from pathlib import Path
from PIL import Image

ART = Path(__file__).resolve().parents[1]
RAW = ART / "raw"
OUT = ART.parent / "game" / "src" / "assets" / "scene"
PREVIEW = ART / "preview"
FAR_H, WALL_H, FLOOR_H = 150, 34, 120          # FLOOR_TOP 150 − 34 = 116 … 270 (96 px band + 24 px front lip)
STAGES = ["gate", "forest", "well", "hall", "cloister", "terrace"]
# (wall top, floor top) as fractions of the near picture's height
NEAR_CUT = {"gate": (0.31, 0.56), "forest": (0.0, 0.36), "well": (0.0, 0.34), "hall": (0.0, 0.34),
            "cloister": (0.29, 0.49), "terrace": (0.43, 0.63)}
PROPS = [("jar", 19), ("crate", 16), ("lamp", 30), ("stele", 30), ("bun", 9), ("pill", 12), ("ore", 9)]   # name, height px


def to8(img, colors=48):
    return img.convert("RGB").quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)


def band(img, y0, y1, h):
    crop = img.crop((0, round(y0 * img.height), img.width, round(y1 * img.height)))
    return crop.resize((max(1, round(crop.width * h / crop.height)), h), Image.Resampling.BOX)


def chroma(img):
    """RGBA with the green key removed (green-dominant pixels become transparent)."""
    rgba = img.convert("RGBA")
    px = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, _ = px[x, y]
            if g > 150 and g > r * 1.5 and g > b * 1.5:
                px[x, y] = (0, 0, 0, 0)
    return rgba


def blobs(rgba):
    """Bounding boxes of the opaque objects, left to right (column runs separated by empty columns)."""
    a = rgba.getchannel("A")
    cols = [any(a.getpixel((x, y)) for y in range(0, a.height, 2)) for x in range(a.width)]
    boxes, start = [], None
    for x, on in enumerate(cols + [False]):
        if on and start is None: start = x
        if not on and start is not None:
            if x - start > 12: boxes.append((start, x))
            start = None
    out = []
    for x0, x1 in boxes:
        sub = a.crop((x0, 0, x1, a.height)).getbbox()
        out.append((x0, sub[1], x1, sub[3]))
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEW.mkdir(exist_ok=True)
    sizes = {}
    for sid in STAGES:
        far = Image.open(RAW / f"far_{sid}_t1.png")
        f = to8(far.resize((round(far.width * FAR_H / far.height), FAR_H), Image.Resampling.BOX))
        f.save(OUT / f"far_{sid}.png", optimize=True)
        near = Image.open(RAW / f"near_{sid}_t1.png")
        w0, f0 = NEAR_CUT[sid]
        floor = band(near, f0, 1.0, FLOOR_H)
        width = floor.width                               # the wall band is squashed to the floor's width (it sits far back)
        wall = near.crop((0, round(w0 * near.height), near.width, round(f0 * near.height))).resize((width, WALL_H), Image.Resampling.BOX)
        n = Image.new("RGB", (width, WALL_H + FLOOR_H))
        n.paste(wall.crop((0, 0, width, WALL_H)), (0, 0)); n.paste(floor.crop((0, 0, width, FLOOR_H)), (0, WALL_H))
        n = to8(n)
        n.save(OUT / f"near_{sid}.png", optimize=True)
        sizes[sid] = {"far": list(f.size), "near": list(n.size)}
    # props: cut, scale to height, pack in one row (1 px gaps)
    rgba = chroma(Image.open(RAW / "props_v5_t1.png"))
    boxes = blobs(rgba)
    assert len(boxes) == len(PROPS), f"expected {len(PROPS)} props, found {len(boxes)}"
    parts = []
    for (name, h), box in zip(PROPS, boxes):
        im = rgba.crop(box)
        im = im.resize((max(1, round(im.width * h / im.height)), h), Image.Resampling.BOX)
        a = im.getchannel("A").point(lambda v: 255 if v >= 128 else 0)
        im.putalpha(a)
        parts.append((name, im))
    W = sum(im.width + 1 for _, im in parts); H = max(im.height for _, im in parts)
    sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0)); frames = {}; x = 0
    for name, im in parts:
        sheet.paste(im, (x, H - im.height), im)
        frames[name] = {"frame": {"x": x, "y": H - im.height, "w": im.width, "h": im.height}, "anchor": {"x": 0.5, "y": 1}}
        x += im.width + 1
    rgb = Image.new("RGB", sheet.size, (0, 255, 0)); rgb.paste(sheet, mask=sheet.getchannel("A"))
    q = rgb.quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    key = q.getpixel((0, 0)) if sheet.getpixel((0, 0))[3] == 0 else None
    q.info["transparency"] = key
    q.save(OUT / "props.png", optimize=True, transparency=key)
    (OUT / "props.json").write_text(json.dumps({"frames": frames, "meta": {"image": "props.png", "size": {"w": W, "h": H}, "scale": 1}}, indent=1) + "\n", encoding="utf-8")
    # 3x preview of every stage: far on top of near
    tiles = []
    for sid in STAGES:
        f = Image.open(OUT / f"far_{sid}.png").convert("RGB"); n = Image.open(OUT / f"near_{sid}.png").convert("RGB")
        w = min(480, f.width, n.width); t = Image.new("RGB", (w, 270))
        t.paste(f.crop((0, 0, w, FAR_H)), (0, 0)); t.paste(n.crop((0, 0, w, n.height)), (0, FAR_H - WALL_H))
        tiles.append(t)
    prev = Image.new("RGB", (480 * 2, 270 * 3))
    for i, t in enumerate(tiles): prev.paste(t, ((i % 2) * 480, (i // 2) * 270))
    prev.resize((prev.width * 2, prev.height * 2), Image.Resampling.NEAREST).save(PREVIEW / "scenes_x2.png")
    Image.open(OUT / "props.png").convert("RGBA").resize((W * 6, H * 6), Image.Resampling.NEAREST).save(PREVIEW / "props_x6.png")
    print(json.dumps(sizes))


if __name__ == "__main__":
    main()
