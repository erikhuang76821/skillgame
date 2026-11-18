"""Chroma-key + slicing helpers for the LanternHold pixel set (mechanical only, no hand edits).

key(img)            -> RGBA with the #00FF00 background removed and green spill suppressed
bands(mask, n, ax)  -> n (start, end) bands along an axis; the smallest empty gaps are merged until n remain
cells(img, layout)  -> list of rows, each a list of RGBA crops (tight alpha bbox), following layout = [n_row0, n_row1, ...]
block_size(img)     -> estimated size in source px of one 'art pixel' (mode of colour run lengths)
"""
import numpy as np
from PIL import Image


def key(img):
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    bg = (g > 140) & (g > r + 50) & (g > b + 50)
    # soft edge: partly green pixels (anti-aliased fringe) are also background when green clearly dominates
    fringe = (g > r + 30) & (g > b + 30) & (g > 110)
    alpha = np.where(bg | fringe, 0, 255).astype(np.uint8)
    # despill: clamp green to max(r, b) + small margin on kept pixels that lean green
    lim = np.maximum(r, b) + 24
    g2 = np.where((alpha > 0) & (g > lim), lim, g)
    out = np.dstack([r, g2, b, alpha]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def _segments(occ):
    segs, start = [], None
    for i, v in enumerate(occ):
        if v and start is None: start = i
        if not v and start is not None: segs.append([start, i]); start = None
    if start is not None: segs.append([start, len(occ)])
    return segs


def bands(occ, n, min_size=0):
    segs = [s for s in _segments(occ) if s[1] - s[0] >= min_size] or _segments(occ)
    while len(segs) > n:
        gaps = [segs[i + 1][0] - segs[i][1] for i in range(len(segs) - 1)]
        i = int(np.argmin(gaps))
        segs[i] = [segs[i][0], segs[i + 1][1]]; del segs[i + 1]
    return segs


def cells(img, layout, noise=40):
    """layout: list of item counts per row (top to bottom). Returns rows of tight RGBA crops."""
    a = np.asarray(img)[..., 3] > 0
    rows_occ = a.sum(axis=1) > 2
    out = []
    for (y0, y1), n in zip(bands(rows_occ, len(layout)), layout):
        sub = a[y0:y1]
        col_occ = sub.sum(axis=0) > 1
        row = []
        for x0, x1 in bands(col_occ, n):
            crop = img.crop((x0, y0, x1, y1))
            bb = crop.getchannel("A").getbbox()
            row.append(crop.crop(bb) if bb else crop)
        out.append(row)
    return out


def block_size(img, lo=3, hi=16):
    """Mode of horizontal + vertical colour-run lengths inside opaque areas (the AI's art-pixel size)."""
    a = np.asarray(img).astype(np.int16)
    rgb, al = a[..., :3], a[..., 3] > 0
    hist = np.zeros(64, int)
    for arr, m in ((rgb, al), (rgb.transpose(1, 0, 2), al.T)):
        diff = (np.abs(np.diff(arr, axis=1)).sum(axis=2) > 40) | ~(m[:, 1:] & m[:, :-1])
        for y in range(0, arr.shape[0], 2):
            idx = np.flatnonzero(diff[y])
            d = np.diff(idx)
            d = d[(d >= lo) & (d < 64)]
            np.add.at(hist, d, 1)
    # runs are multiples of the block; score each candidate by how many runs it explains
    best, score = lo, -1
    for s in range(lo, hi + 1):
        k = np.arange(1, 64)
        mult = [m for m in k * s if m < 64]
        sc = sum(hist[m - 1:m + 2].sum() for m in mult) / len(mult) ** 0.5
        if sc > score: best, score = s, sc
    return best
