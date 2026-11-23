"""Turns the boss sheets (art/raw/boss/big_*.png, drawn by Codex from art/boss_brief.md) into pixel sprites the game
draws. A sheet is one ship in three stages side by side on a flat green background: armour on, plates off, the core
alone. For each sheet: key out the green, split into the three panels, scale all three by one factor so the first is
WIDTH art pixels wide, reduce to one palette per ship, and write
  game/src/render/bossForms.js   palettes + rows of palette indices + where the core sits (the game ships no image file)
  art/preview/v9_boss_forms.png  the result, for review
Mechanical only, no hand edits. Run from SkyTalon/:  python art/tools/boss_forms.py

  python art/tools/boss_forms.py leg2   does the same for leg two (art/raw/leg2/*.png): game/src/render/leg2Forms.js and
  art/preview/leg2_boss_forms.png; the cores are found as for leg one.
  python art/tools/boss_forms.py leg6   does the same for leg six (art/raw/leg6/*.png, the Mesozoic bosses): writes
  game/src/render/leg6Forms.js and art/preview/leg6_boss_forms.png. There the core is the fragment on the animal's
  head, found as the centre of the most saturated pixels in the front (lower) part of the first stage.
"""
import json
import sys
import numpy as np
from PIL import Image

# name in the game, sheet, width of the armoured ship in art pixels. The sheets are drawn at about 110 art pixels across,
# so the widths stay near that; a boss is shown at BOSS_PX world px per art pixel, a mid-boss at MID_PX.
BOSSES = [("boss", "art/raw/boss/big_oceanus.png", 110), ("boss2", "art/raw/boss/big_nyx.png", 116),
          ("boss3", "art/raw/boss/big_eos.png", 122), ("boss4", "art/raw/boss/big_atlas.png", 128)]
BOSS_PX, MID_PX = 3, 2
# the four mid-bosses share one sheet (no stages): name and width in art pixels (1.1 x the hit circle at 2 world px)
MIDS = ("art/raw/boss/mids.png", [("mid1", 66), ("mid2", 72), ("mid3", 77), ("mid4", 81)])
COLOURS = 44
LEG6 = len(sys.argv) > 1 and sys.argv[1] == "leg6"
if LEG6:
    BOSSES = [("boss", "art/raw/leg6/boss1_plateosaurus.png", 104), ("boss2", "art/raw/leg6/boss2_diplodocus.png", 124),
              ("boss3", "art/raw/leg6/boss3_mosasaurus.png", 118), ("boss4", "art/raw/leg6/boss4_tyrannosaurus.png", 130)]
    MIDS = (None, [("mid1", 84, "art/raw/leg6/mid1_postosuchus.png"), ("mid2", 80, "art/raw/leg6/mid2_allosaurus.png"),
                   ("mid3", 150, "art/raw/leg6/mid3_quetzalcoatlus.png"), ("mid4", 88, "art/raw/leg6/mid4_spinosaurus.png")])
LEG2 = len(sys.argv) > 1 and sys.argv[1] == "leg2"           # leg two (art/raw/leg2/*.png): ships like leg one's, the twins twice (one per form)
if LEG2:
    BOSSES = [("boss", "art/raw/leg2/boss1_selene.png", 110), ("boss2", "art/raw/leg2/boss2_pan.png", 116),
              ("boss3m", "art/raw/leg2/boss3_morning.png", 112), ("boss3e", "art/raw/leg2/boss3_evening.png", 122),
              ("boss4", "art/raw/leg2/boss4_nemesis.png", 128)]
    MIDS = ("art/raw/leg2/mids.png", [("mid1", 66), ("mid2", 80), ("mid3", 77), ("mid4", 81)])
LEG3 = len(sys.argv) > 1 and sys.argv[1] == "leg3"           # leg three (art/raw/leg3/*.png): five on the mid sheet (Deimos rides with Phobos)
if LEG3:
    BOSSES = [("boss", "art/raw/leg3/boss1_enyo.png", 112), ("boss2", "art/raw/leg3/boss2_amalthea.png", 118),
              ("boss3", "art/raw/leg3/boss3_prometheus.png", 116), ("boss4", "art/raw/leg3/boss4_janus.png", 124)]
    MIDS = ("art/raw/leg3/mids.png", [("mid1", 64), ("deimos", 56), ("mid2", 70), ("mid3", 72), ("mid4", 77)])
LEG4 = len(sys.argv) > 1 and sys.argv[1] == "leg4"           # leg four (art/raw/leg4/*.png): four on the mid sheet
if LEG4:
    BOSSES = [("boss", "art/raw/leg4/boss1_briareus.png", 116), ("boss2", "art/raw/leg4/boss2_mnemosyne.png", 120),
              ("boss3", "art/raw/leg4/boss3_proteus.png", 118), ("boss4", "art/raw/leg4/boss4_styx.png", 126)]
    MIDS = ("art/raw/leg4/mids.png", [("mid1", 66), ("mid2", 58), ("mid3", 70), ("mid4", 62)])
LEG5 = len(sys.argv) > 1 and sys.argv[1] == "leg5"           # leg five (art/raw/leg5/*.png): four on the mid sheet
if LEG5:
    BOSSES = [("boss", "art/raw/leg5/boss1_helios.png", 116), ("boss2", "art/raw/leg5/boss2_hyperion.png", 120),
              ("boss3", "art/raw/leg5/boss3_hundun.png", 122), ("boss4", "art/raw/leg5/boss4_torii.png", 126)]
    MIDS = ("art/raw/leg5/mids.png", [("mid1", 66), ("mid2", 70), ("mid3", 60), ("mid4", 72)])
OUT_JS, OUT_PNG, EXPORT = ("game/src/render/leg5Forms.js", "art/preview/leg5_boss_forms.png", "LEG5_FORMS") if LEG5 else ("game/src/render/leg4Forms.js", "art/preview/leg4_boss_forms.png", "LEG4_FORMS") if LEG4 else ("game/src/render/leg3Forms.js", "art/preview/leg3_boss_forms.png", "LEG3_FORMS") if LEG3 else ("game/src/render/leg6Forms.js", "art/preview/leg6_boss_forms.png", "LEG6_FORMS") if LEG6 else ("game/src/render/leg2Forms.js", "art/preview/leg2_boss_forms.png", "LEG2_FORMS") if LEG2 else ("game/src/render/bossForms.js", "art/preview/v9_boss_forms.png", "BOSS_FORMS")


HEAD_FROM = {104: 0.86}                                       # by sprite width: where the head starts, for an animal whose glowing neck would be picked instead (the plateosaur)


def fragment(px):
    """Where the fragment on the head is: the centre of the most saturated opaque pixels in the front (lower) part of the sprite."""
    h = px.shape[0]
    y0 = int(h * HEAD_FROM.get(px.shape[1], 0.55))
    part = px[y0:].astype(np.int32)
    sat = (part[..., :3].max(axis=-1) - part[..., :3].min(axis=-1)) * (part[..., 3] > 0)
    ys, xs = np.nonzero(sat >= max(60, np.percentile(sat[sat > 0], 97)))
    return int(round(xs.mean())), int(round(ys.mean())) + y0


def panels(alpha, count=3):
    """The `count` widest runs of occupied columns, left to right."""
    cols = alpha.sum(axis=0) > 2
    runs, start = [], None
    for x, on in enumerate(list(cols) + [False]):
        if on and start is None:
            start = x
        elif not on and start is not None:
            runs.append((start, x)); start = None
    merged = []
    for a, b in runs:                                           # close gaps of a few columns inside one ship
        if merged and a - merged[-1][1] < 12:
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((a, b))
    merged = sorted(sorted(merged, key=lambda r: r[0] - r[1])[:count])
    if len(merged) != count:
        raise SystemExit(f"expected {count} panels, found {len(merged)}")
    return merged


def convert(path, width, widths=None):
    """One ship in three stages at one scale; or, with `widths`, that many separate ships each scaled to its own width."""
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    keep = ~((g > 140) & (g > r * 1.35) & (g > b * 1.35))       # everything that is not the green screen
    out, core = [], None
    spans = panels(keep, len(widths) if widths else 3)
    x0, x1 = spans[0]
    scale = width / (x1 - x0) if not widths else 0
    top0 = None
    for i, (xa, xb) in enumerate(spans):
        if widths:
            scale = widths[i] / (xb - xa)
        rows = np.nonzero(keep[:, xa:xb].sum(axis=1) > 2)[0]
        ya, yb = rows.min(), rows.max() + 1
        w, h = max(1, round((xb - xa) * scale)), max(1, round((yb - ya) * scale))
        rgb = Image.fromarray(a[ya:yb, xa:xb].astype(np.uint8), "RGB").resize((w, h), Image.Resampling.BOX)
        al = Image.fromarray((keep[ya:yb, xa:xb] * 255).astype(np.uint8), "L").resize((w, h), Image.Resampling.BOX)
        px = np.dstack([np.asarray(rgb), (np.asarray(al) > 140) * 255]).astype(np.uint8)
        # a green fringe survives the box filter on the rim: drop pixels that are still mostly green
        pr, pg, pb = px[..., 0].astype(int), px[..., 1].astype(int), px[..., 2].astype(int)
        px[(pg > 120) & (pg > pr * 1.3) & (pg > pb * 1.3), 3] = 0
        out.append(px)
        if i == 0:
            top0 = ya
        if i == 2 and not widths and not LEG6:                  # the core's centre, measured from the top of the armoured ship
            core = (round(width / 2), round(((ya + yb) / 2 - top0) * scale))
        if i == 0 and LEG6:
            core = fragment(px)
    return out, core


def main():
    data, sheets = {}, []
    if LEG6:                                                    # one file per mid-boss
        mid_jobs = [(name, *convert(path, 0, [w])) for name, w, path in MIDS[1]]
    else:
        mids, _ = convert(MIDS[0], 0, [w for _, w in MIDS[1]])
        mid_jobs = [(name, [m], (0, 0)) for (name, _), m in zip(MIDS[1], mids)]
    jobs = [(name, *convert(path, width)) for name, path, width in BOSSES] + mid_jobs
    for name, stages, core in jobs:
        stack = np.concatenate([s[..., :3][s[..., 3] > 0] for s in stages])
        pal_img = Image.fromarray(stack.reshape(1, -1, 3), "RGB").quantize(COLOURS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        pal = np.array(pal_img.getpalette()[:COLOURS * 3]).reshape(-1, 3)
        frames = []
        for s in stages:
            rgb = s[..., :3].astype(np.int32)
            idx = np.argmin(((rgb[:, :, None, :] - pal[None, None, :, :]) ** 2).sum(-1), axis=-1)
            frames.append(["".join("." if s[y, x, 3] == 0 else chr(48 + int(idx[y, x])) for x in range(s.shape[1])) for y in range(s.shape[0])])
        data[name] = {"px": BOSS_PX if len(stages) == 3 else MID_PX, "palette": [int(r) << 16 | int(g) << 8 | int(b) for r, g, b in pal], "core": core, "stages": frames}
        sheets.append((stages, core))
        print(f"{name}: " + ", ".join(f"{s.shape[1]}x{s.shape[0]}" for s in stages) + f", core at {core}")
    js = "// GENERATED by art/tools/boss_forms.py from " + ("art/raw/leg6/*.png (drawn by Codex from gdd/12_leg6_mesozoic.md)" if LEG6 else "art/raw/leg2/*.png (drawn by Codex from art/raw/leg2/prompts/round1.sh)" if LEG2 else "art/raw/leg3/*.png (drawn by Codex from art/raw/leg3/prompts/round1.sh)" if LEG3 else "art/raw/leg4/*.png (drawn by Codex from art/raw/leg4/prompts/round1.sh)" if LEG4 else "art/raw/leg5/*.png (drawn by Codex from art/raw/leg5/prompts/round1.sh)" if LEG5 else "art/raw/boss/big_*.png (drawn by Codex from art/boss_brief.md)") + ". Do not edit.\n"
    js += "// Per boss: px = world px per art pixel, palette, core = [x, y] of the core's centre in the first two stages (art pixels from the top left),\n"
    js += "// stages = three sprites as rows, one character per art pixel: '.' = empty, chr(48 + n) = palette index n.\n"
    js += "export const " + EXPORT + " = " + json.dumps(data, separators=(",", ":")) + ";\n"
    open(OUT_JS, "w", encoding="utf-8", newline="\n").write(js)
    pad = 12
    W = max(sum(s.shape[1] for s in st) + pad * 4 for st, _ in sheets)
    H = sum(max(s.shape[0] for s in st) + pad for st, _ in sheets) + pad
    img = Image.new("RGB", (W, H), (58, 106, 122))
    y0 = pad
    for stages, core in sheets:
        x0 = pad
        for i, s in enumerate(stages):
            img.paste(Image.fromarray(s[..., :3], "RGB"), (x0, y0), Image.fromarray(s[..., 3], "L"))
            if core and (LEG6 or (i < 2 and len(stages) == 3)):
                img.paste((255, 0, 255), (x0 + core[0] - 1, y0 + core[1] - 1, x0 + core[0] + 2, y0 + core[1] + 2))   # the core mark
            x0 += s.shape[1] + pad
        y0 += max(s.shape[0] for s in stages) + pad
    img.save(OUT_PNG)


main()
