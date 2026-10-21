"""Bake the 16:9 key art into the portrait title background (gdd/02_art_spec.md §3.1).

    python -I art/tools/bake_keyart.py art/raw/key_art.png --out game/src/assets/title_keyart.webp [--center 0.5] [--quality 80]

Takes the full-height 9:16 slice centred at --center (0..1 of the width, default the middle where the hero is),
scales it to 720x1280 and saves WebP. The top 25% of the key art is kept clear for the logo, so it stays clear here.
Also writes art/review/<name>_baked.jpg with the 25% logo line.
"""
import argparse, os
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('--out', required=True)
ap.add_argument('--center', type=float, default=0.5); ap.add_argument('--quality', type=int, default=80)
a = ap.parse_args()

im = Image.open(a.src).convert('RGB')
w = round(im.height * 9 / 16)
x = min(max(0, round(im.width * a.center - w / 2)), im.width - w)
out = im.crop((x, 0, x + w, im.height)).resize((720, 1280), Image.LANCZOS)
os.makedirs(os.path.dirname(a.out), exist_ok=True)
out.save(a.out, 'WEBP', quality=a.quality, method=6)
print(f'slice x={x}..{x + w} of {im.width}; {a.out} {os.path.getsize(a.out) / 1024:.0f} KB')

review = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(a.src))), 'review')
chk = out.copy(); ImageDraw.Draw(chk).line([0, 320, 720, 320], fill=(40, 90, 255), width=3)
chk.save(os.path.join(review, os.path.splitext(os.path.basename(a.out))[0] + '_baked.jpg'), quality=86)
