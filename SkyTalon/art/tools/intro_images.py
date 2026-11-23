"""Encode the cutscene keyframes (art/raw/intro*/*.png) for the game: game/src/assets/intro*/<name>.avif (540x960,
the picture everyone sees) and <name>.lo.webp (270x480, a small fallback for browsers without AVIF, e.g. iOS before 16).
Both are inlined into the single-file build, so the fallback is kept small on purpose.

Each raw frame is centre-cropped to 9:16 and resized with LANCZOS, the same as the earlier WebP files. --check compares
the AVIF against the previous WebP of the same name (if present) and fails if they differ in framing.
Run: python art/tools/intro_images.py [--check]
"""
import io, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW, OUT = ROOT / 'raw', ROOT.parent / 'game/src/assets'
DIRS = ['intro0', 'intro', 'intro2', 'intro3', 'intro4', 'intro5', 'intro6']
AVIF_Q, LO_SIZE, LO_Q = 50, (270, 480), 50


def frame(path):
    im = Image.open(path).convert('RGB'); w, h = im.size; tw = round(h * 9 / 16)
    if tw < w: im = im.crop(((w - tw) // 2, 0, (w - tw) // 2 + tw, h))
    return im.resize((540, 960), Image.LANCZOS)


def psnr(a, b):
    x, y = np.asarray(a, np.float64), np.asarray(b.convert('RGB').resize(a.size), np.float64)
    return 10 * np.log10(255 ** 2 / max(((x - y) ** 2).mean(), 1e-9))


if __name__ == '__main__':
    check, bad, total = '--check' in sys.argv, 0, [0, 0]
    for d in DIRS:
        for raw in sorted((RAW / d).glob('*.png')):
            im, out = frame(raw), OUT / d
            old = out / f'{raw.stem}.webp'
            if old.exists():
                p = psnr(im, Image.open(old))
                if p < 25: print(f'framing differs: {d}/{raw.stem} ({p:.1f} dB)'); bad += 1
            if check: continue
            im.save(out / f'{raw.stem}.avif', 'AVIF', quality=AVIF_Q, speed=4)
            im.resize(LO_SIZE, Image.LANCZOS).save(out / f'{raw.stem}.lo.webp', 'WEBP', quality=LO_Q, method=6)
            total[0] += (out / f'{raw.stem}.avif').stat().st_size; total[1] += (out / f'{raw.stem}.lo.webp').stat().st_size
    if not check: print(f'avif {total[0] // 1024} KB, fallback webp {total[1] // 1024} KB')
    sys.exit(1 if bad else 0)
