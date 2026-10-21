# Remove a painted grey checkerboard: low-saturation mid/light grey pixels connected to the border
# (or forming large enclosed regions) become transparent. Writes <out>.png and a preview on a dojo colour.
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

src, out, preview = sys.argv[1:4]
im = np.asarray(Image.open(src).convert('RGB')).astype(np.int16)
mx, mn = im.max(2), im.min(2)
grey = ((mx - mn) <= 16) & (mn >= 100) & (mx <= 225)
lab, n = ndimage.label(grey)
sizes = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.zeros_like(grey)
for i, s in enumerate(sizes, start=1):
    if i in border or s > 4000:            # enclosed gaps (tail loop, between legs) are big too
        bg |= lab == i
bg = ndimage.binary_dilation(bg, iterations=1) & grey | bg
alpha = np.where(bg, 0, 255).astype(np.uint8)
alpha = ndimage.median_filter(alpha, size=3)
rgba = np.dstack([im.astype(np.uint8), alpha])
Image.fromarray(rgba, 'RGBA').save(out)
canvas = Image.new('RGBA', (im.shape[1], im.shape[0]), (233, 211, 173, 255))
canvas.alpha_composite(Image.fromarray(rgba, 'RGBA'))
canvas.convert('RGB').save(preview, quality=88)
print(src, 'transparent %.1f%%' % (100 * (alpha == 0).mean()))
