#!/usr/bin/env python3
"""Derive native-size CONCEPT PLACEHOLDER sprites from Codex identity sheets.

Mechanical only (skill rule): split poses by empty alpha columns, crop, box-downsample
to the native frame with bottom-center feet, threshold alpha, quantize palette.
Output is a 4-row sheet (down,right,up,left=mirror of right). Production art must
replace it with true 8-direction frames packed by pokesurvivor sprite_sheet.py.
"""
import json, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW, OUT, NATIVE = ROOT / "art/raw", ROOT / "game/src/assets", ROOT / "art/native"

def split_poses(img, min_gap=12):
    a = img.getchannel("A").point(lambda v: 255 if v > 32 else 0)
    w, h = img.size
    px = a.load()
    cols = [any(px[x, y] for y in range(0, h, 2)) for x in range(w)]
    spans, start, gap = [], None, 0
    for x, on in enumerate(cols + [False] * min_gap):
        if on:
            if start is None: start = x
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                spans.append((start, x - gap + 1)); start = None
    poses = []
    for x0, x1 in spans:
        if x1 - x0 < w * 0.05: continue
        crop = img.crop((x0, 0, x1, h))
        poses.append(crop.crop(crop.getchannel("A").point(lambda v: 255 if v > 32 else 0).getbbox()))
    return poses

def outline(frame, color=(18, 10, 8, 255)):
    """1-px dark contour outside the silhouette (skill art contract: dark outline)."""
    a = frame.getchannel("A").load()
    out = frame.copy(); o = out.load()
    w, h = frame.size
    for y in range(h):
        for x in range(w):
            if a[x, y]: continue
            if any(0 <= x + dx < w and 0 <= y + dy < h and a[x + dx, y + dy] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                o[x, y] = color
    return out

def to_native(pose, fw, fh, pad=1, colors=24, resample=Image.Resampling.BOX, contour=False):
    pad = pad + (1 if contour else 0)
    s = min((fw - 2 * pad) / pose.width, (fh - 2 * pad if contour else fh - pad) / pose.height)
    tw, th = max(1, round(pose.width * s)), max(1, round(pose.height * s))
    small = pose.resize((tw, th), resample)
    r, g, b, a = small.split()
    a = a.point(lambda v: 255 if v >= 128 else 0)
    rgb = Image.merge("RGB", (r, g, b)).quantize(colors, method=Image.Quantize.MEDIANCUT).convert("RGB")
    small = Image.merge("RGBA", (*rgb.split(), a))
    frame = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
    frame.paste(small, ((fw - tw) // 2, fh - th - (1 if contour else 0)), small)  # feet at bottom-center
    return outline(frame) if contour else frame

def character(name, raw, fw, fh, **kw):
    poses = split_poses(Image.open(RAW / raw).convert("RGBA"))
    if len(poses) != 3: sys.exit(f"{raw}: expected 3 poses, found {len(poses)}")
    down, right, up = (to_native(p, fw, fh, **kw) for p in poses)
    rows = [down, right, up, right.transpose(Image.Transpose.FLIP_LEFT_RIGHT)]
    sheet = Image.new("RGBA", (fw, fh * 4), (0, 0, 0, 0))
    for i, f in enumerate(rows): sheet.paste(f, (0, i * fh))
    (NATIVE / name).mkdir(parents=True, exist_ok=True)
    for d, f in zip(("down", "right", "up", "left"), rows): f.save(NATIVE / name / f"{d}.png", optimize=True)
    sheet.save(OUT / f"{name}.png", optimize=True)
    meta = {"w": fw, "h": fh, "n": 1, "r": 4, "d": [60], "ax": fw / 2, "ay": fh - 1,
            "dirs": ["down", "right", "up", "left"], "placeholder": True, "source": f"art/raw/{raw}"}
    (OUT / f"{name}.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return meta

def prop(name, raw, fw, fh):
    pose = split_poses(Image.open(RAW / raw).convert("RGBA"))[0]
    f = to_native(pose, fw, fh, colors=12)
    f.save(OUT / f"{name}.png", optimize=True)
    return f.size

ICONS = ["pinecone", "campfire", "static_fur", "p_speed", "p_might", "p_magnet",
         "p_cooldown", "p_hp", "snack", "bounty", "skull", "ecto"]

def icon_atlas(size=64, cols=4):
    """12 Codex icons -> one 4x3 atlas of 64x64 cells (order = ICONS)."""
    rows = (len(ICONS) + cols - 1) // cols
    atlas = Image.new("RGBA", (size * cols, size * rows), (0, 0, 0, 0))
    for i, key in enumerate(ICONS):
        im = Image.open(RAW / f"icon_{key}_1.png").convert("RGBA")
        im = im.crop(im.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox())
        cell = to_native(im, size, size, pad=2, colors=32)
        art = cell.crop(cell.getbbox())  # re-centre vertically (to_native aligns to the feet)
        atlas.paste(art, ((i % cols) * size + (size - art.width) // 2, (i // cols) * size + (size - art.height) // 2), art)
    atlas.save(OUT / "icons.png", optimize=True)
    (OUT / "icons.json").write_text(json.dumps({"size": size, "cols": cols, "keys": ICONS}) + "\n", encoding="utf-8")

def key_art(raw, width=960):
    img = Image.open(RAW / raw).convert("RGB")
    img = img.resize((width, round(img.height * width / img.width)), Image.Resampling.LANCZOS)
    img.save(OUT / "key_art.webp", "WEBP", quality=78, method=6)

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    # Characters are now real 8-direction animation sheets from tools/anim_frames.py; the old
    # 4-row placeholders (character() above) are kept in art/native/placeholder_v02/ for reference.
    icon_atlas()
    print("pine", prop("pine", "prop_pine_1.png", 24, 40))
    key_art("key_art_1.png")
    for f in sorted(OUT.iterdir()): print(f"{f.name:20} {f.stat().st_size:>8} B")
