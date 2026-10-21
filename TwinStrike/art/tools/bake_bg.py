"""Bake a background into the fixed 720x1280 world (gdd/02_art_spec.md §2) as WebP.

    python -I art/tools/bake_bg.py art/raw/bg_dojo.png --contact 1100 --target 876 \
        --out game/src/assets/bg_dojo.webp --quality 80

--contact  y (source px) of the wall/floor contact line (bottom of the baseboard)
--target   world y where that line must land. Feet stand at LAYOUT.floor = 900, so 876 puts every
           character ~24 world px in front of the wall, on the floorboards.
The image is scaled just enough to put the line there while still covering 720x1280, then centre-cropped.
Also writes art/review/<name>_baked.jpg with the contact line (blue) and the feet line (red).
"""
import argparse, os
from PIL import Image, ImageDraw

W, H, FEET = 720, 1280, 900

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('--contact', type=float, required=True); ap.add_argument('--target', type=float, default=876)
ap.add_argument('--out', required=True); ap.add_argument('--quality', type=int, default=80)
a = ap.parse_args()

im = Image.open(a.src).convert('RGB')
s = max(W / im.width, a.target / a.contact, (H - a.target) / (im.height - a.contact))
sw, sh = round(im.width * s), round(im.height * s)
big = im.resize((sw, sh), Image.LANCZOS)
top = round(a.contact * s - a.target)                 # crop so the contact line lands on target
left = (sw - W) // 2
if top < 0 or top + H > sh:
    raise SystemExit(f'cannot place contact line: top={top}, scaled height={sh}')
out = big.crop((left, top, left + W, top + H))
os.makedirs(os.path.dirname(a.out), exist_ok=True)
out.save(a.out, 'WEBP', quality=a.quality, method=6)
print(f'scale {s:.4f} -> {sw}x{sh}, crop ({left},{top}); {a.out} {os.path.getsize(a.out) / 1024:.0f} KB')

review = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(a.src))), 'review')
chk = out.copy(); d = ImageDraw.Draw(chk)
d.line([0, a.target, W, a.target], fill=(40, 90, 255), width=3)
d.line([0, FEET, W, FEET], fill=(230, 40, 40), width=3)
chk.save(os.path.join(review, os.path.splitext(os.path.basename(a.out))[0] + '_baked.jpg'), quality=88)
