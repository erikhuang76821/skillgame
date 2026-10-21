#!/usr/bin/env python3
"""Reduce accepted Codex animation strips to native frames, then pack 8-direction sheets.

Mechanical only (pokesurvivor-asset-dev rule): split the n poses of a strip by empty alpha
columns, scale every pose of a strip by ONE factor (strip height -> frame height) with
Lanczos + hard palette mapping, keep the strip's common ground line as the feet row, align poses on the
upper-body alpha centroid (so swinging legs do not jitter the body), map all frames of a
character to one shared palette (from the raw strips), add the 1-px outline from derive_native.py.
up_left / left / down_left are horizontal mirrors of up_right / right / down_right.

Inputs : art/raw/anim/{name}_{Anim}_{dir}.png   (accepted takes, 5 facings)
Outputs: art/frames/{name}/{Anim}/{direction}/{i}.png, game/src/assets/{name}_{anim}.png/.json
"""
import subprocess, sys
from pathlib import Path
from PIL import Image
from derive_native import outline

ROOT = Path(__file__).resolve().parent.parent
RAW, FRAMES, OUT = ROOT / "art/raw/anim", ROOT / "art/frames", ROOT / "game/src/assets"
PACKER = Path.home() / ".codex/skills/pokesurvivor-asset-dev/scripts/sprite_sheet.py"
GEN = ("down", "down_right", "right", "up_right", "up")
MIRROR = {"up_left": "up_right", "left": "right", "down_left": "down_right"}

# name -> (frame w, h, palette colours, {Anim: durations in 1/60 s ticks}, accent test)
# Accent pixels (scarf red, antenna lime) get their own palette slots so the dominant fur/suit
# colours cannot crowd them out.
SPEC = {
    "sasq": (32, 40, 24, {"Idle": [36, 24], "Walk": [8, 8, 8, 8]}, lambda r, g, b: r - max(g, b) > 110),
    "greyling": (28, 28, 20, {"Walk": [9, 9, 9, 9]}, lambda r, g, b: max(r, g, b) - min(r, g, b) > 90),
}
ACCENTS = 6

def split_strip(img, n, min_gap=40):
    a = img.getchannel("A").point(lambda v: 255 if v > 32 else 0)
    bbox = a.getbbox()
    w, _ = img.size
    cols = [a.crop((x, 0, x + 1, img.height)).getbbox() is not None for x in range(w)]
    spans, start, gap = [], None, 0
    for x, on in enumerate(cols + [False] * min_gap):
        if on:
            if start is None: start = x
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= min_gap: spans.append((start, x - gap + 1)); start = None
    spans = [s for s in spans if s[1] - s[0] > w * 0.04]
    if len(spans) != n: raise SystemExit(f"expected {n} poses, found {len(spans)}")
    return [(img.crop((x0, bbox[1], x1, bbox[3])), a.crop((x0, bbox[1], x1, bbox[3]))) for x0, x1 in spans]

def centroid_x(mask, frac=0.6):
    m = mask.crop((0, 0, mask.width, int(mask.height * frac))).load()
    tot = sx = 0
    for y in range(int(mask.height * frac)):
        for x in range(mask.width):
            if m[x, y]: tot += 1; sx += x
    return sx / tot

def to_palette(img, pal, tw, th):
    """Lanczos downscale, then hard-map to the character palette (no dither) and binary alpha.
    Tested against nearest and majority-vote sampling: those drop the 1-2 px eyes because the
    model's art grid is never an exact multiple of the native frame; Lanczos keeps them."""
    alpha = img.getchannel("A").resize((tw, th), Image.Resampling.BOX).point(lambda v: 255 if v >= 128 else 0)
    small = img.convert("RGB").resize((tw, th), Image.Resampling.LANCZOS)
    out = small.quantize(palette=pal, dither=Image.Dither.NONE).convert("RGBA")
    out.putalpha(alpha)
    return out

def reduce_strip(path, n, fw, fh, pal):
    poses = split_strip(Image.open(path).convert("RGBA"), n)
    s = (fh - 4) / poses[0][0].height           # all poses share the strip's top/ground rows
    out = []
    for img, mask in poses:
        tw, th = max(1, round(img.width * s)), fh - 4
        small = to_palette(img, pal, tw, th)
        frame = Image.new("RGBA", (fw, fh), (0, 0, 0, 0))
        x = round(fw / 2 - centroid_x(mask) * s)
        frame.paste(small, (x, fh - th - 1), small)  # feet row fh-2, outline fh-1
        if frame.getchannel("A").histogram()[255] < small.getchannel("A").histogram()[255]:
            print(f"  WARN {path.name}: pose clipped at frame edge")
        out.append(outline(frame))
    return out

def source_palette(paths, colors, accent):
    """One palette per character, from the opaque pixels of all its accepted strips."""
    base, acc = [], []
    for p in paths:
        im = Image.open(p).convert("RGBA").reduce(4)
        for c in im.get_flattened_data():
            if c[3] > 127: (acc if accent(*c[:3]) else base).append(c[:3])
    def quant(px, n):
        flat = Image.new("RGB", (len(px), 1)); flat.putdata(px)
        return flat.quantize(n, method=Image.Quantize.MEDIANCUT).getpalette()[:3 * n]
    pal = Image.new("P", (1, 1))
    pal.putpalette(quant(base, colors - ACCENTS) + quant(acc, ACCENTS))
    return pal

def build(name):
    fw, fh, colors, anims, accent = SPEC[name]
    pal = source_palette([RAW / f"{name}_{a}_{d}.png" for a in anims for d in GEN], colors, accent)
    for anim, dur in anims.items():
        dirs = {d: reduce_strip(RAW / f"{name}_{anim}_{d}.png", len(dur), fw, fh, pal) for d in GEN}
        for d, src in MIRROR.items(): dirs[d] = [f.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for f in dirs[src]]
        for d, fs in dirs.items():
            folder = FRAMES / name / anim / d
            folder.mkdir(parents=True, exist_ok=True)
            for old in folder.glob("*.png"): old.unlink()
            for i, f in enumerate(fs): f.save(folder / f"{i}.png", optimize=True)
        sheet, meta = OUT / f"{name}_{anim.lower()}.png", OUT / f"{name}_{anim.lower()}.json"
        run = lambda *a: subprocess.run([sys.executable, str(PACKER), *a], check=True)
        run("pack", "--frames", str(FRAMES / name / anim), "--output", str(sheet), "--metadata", str(meta),
            "--width", str(fw), "--height", str(fh), "--durations", ",".join(map(str, dur)),
            "--anchor", f"{fw // 2},{fh - 1}", "--force")
        run("validate", "--sheet", str(sheet), "--metadata", str(meta), "--require-eight")
        Image.open(sheet).save(sheet, optimize=True)  # same pixels, smaller file

if __name__ == "__main__":
    for name in sys.argv[1:] or SPEC: build(name)
