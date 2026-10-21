#!/usr/bin/env python3
"""QA contact sheet: every frame of every packed animation at 6x on a grass-green background.
Usage: python tools/anim_preview.py <out.png> [sheet.png ...]   (default: all *_idle/_walk sheets)"""
import json, sys
from pathlib import Path
from PIL import Image
OUT = Path(__file__).resolve().parent.parent / "game/src/assets"
def preview(dst, sheets, z=6):
    rows = []
    for p in sheets:
        m = json.loads(p.with_suffix(".json").read_text())
        im = Image.open(p).convert("RGBA")
        bg = Image.new("RGBA", im.size, (52, 78, 48, 255)); bg.alpha_composite(im)
        rows.append(bg.resize((im.width * z, im.height * z), Image.Resampling.NEAREST))
    W = sum(r.width for r in rows) + 12 * (len(rows) - 1); H = max(r.height for r in rows)
    out = Image.new("RGBA", (W, H), (20, 20, 20, 255)); x = 0
    for r in rows: out.paste(r, (x, 0)); x += r.width + 12
    out.save(dst)
if __name__ == "__main__":
    sheets = [Path(p) for p in sys.argv[2:]] or sorted(OUT.glob("*_idle.png")) + sorted(OUT.glob("*_walk.png"))
    preview(sys.argv[1], sheets)
