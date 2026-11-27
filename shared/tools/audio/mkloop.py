"""Cut a seamless N-beat loop out of a full music track (knowledge-base/14 §5, RULE-MUSIC-LOOP).
Called by shared/tools/music-pack.mjs, which takes every number from rules.json; run it directly only to experiment.

usage: python -I mkloop.py <in.wav> <out.wav> --beats N --crossfade-ms MS --pad-ms MS --starts F,F,... [--bpm-range LO,HI]

1. tempo: autocorrelation of a spectral-flux onset envelope inside --bpm-range
2. for every candidate start (fractions of the track): snap to the strongest onset within one beat, then refine the
   loop length (+-2 %) so the music right after the end matches the music right after the start
3. keep the start with the best match, align the end to the sample (waveform correlation, +-10 ms)
4. equal-power crossfade of the continuation into the head (end -> start is continuous), then append --pad-ms of the
   head after the end, so a decoder that trims the last few samples (WebM Opus in Chromium drops 24) still has audio
   up to loopEnd. The player loops [0, samples) - samples is in the JSON this prints.
prints JSON: bpm, start_s, samples, sampleRate, matchScore (0..1), waveCorr, padSamples
"""
import sys, json, argparse
import numpy as np
from scipy.io import wavfile
from scipy.signal import stft

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--beats', type=int, required=True)
ap.add_argument('--crossfade-ms', type=float, required=True)
ap.add_argument('--pad-ms', type=float, required=True)
ap.add_argument('--starts', required=True)
ap.add_argument('--bpm-range', required=True)
A = ap.parse_args()

sr, x = wavfile.read(A.src)
x = x.astype(np.float64) / (32768.0 if x.dtype == np.int16 else 1.0)
if x.ndim == 1: x = x[:, None]
mono = x.mean(1)

hop = 512
_, _, Z = stft(mono, sr, nperseg=2048, noverlap=2048 - hop)
S = np.log1p(np.abs(Z) * 100)
flux = np.maximum(np.diff(S, axis=1), 0).sum(0); flux -= flux.mean()
fps = sr / hop
ac = np.correlate(flux, flux, 'full')[len(flux) - 1:]
lags = np.arange(len(ac)); bpm_of = 60 * fps / np.maximum(lags, 1)
lo, hi = (float(v) for v in A.bpm_range.split(','))
ok = (bpm_of >= lo) & (bpm_of <= hi)
lag = float(lags[ok][np.argmax(ac[ok])])
i = int(lag)
if 1 <= i < len(ac) - 1:
    a, b, c = ac[i - 1], ac[i], ac[i + 1]; lag = i + 0.5 * (a - c) / (a - 2 * b + c)
bpm = 60 * fps / lag
beat = 60 / bpm
L0 = A.beats * beat

edges = np.unique(np.geomspace(1, S.shape[0] - 1, 41).astype(int))
F = np.stack([S[e0:e1].mean(0) for e0, e1 in zip(edges[:-1], edges[1:])])
def feat(t, dur=2.0):
    k = int(t * fps); v = F[:, k:k + int(dur * fps)].ravel(); return v - v.mean()
def match(t0, t1):
    a, b = feat(t0), feat(t1); n = min(len(a), len(b))
    if n == 0: return -1.0
    a, b = a[:n], b[:n]; return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))

dur = len(mono) / sr
pad = int(A.pad_ms / 1000 * sr)
best = None
for f in (float(v) for v in A.starts.split(',')):
    t = f * dur
    if t - beat < 0 or t + L0 * 1.02 + 2.5 + pad / sr > dur: continue      # needs room for the loop, its match window and the pad
    i0, i1 = int((t - beat) * fps), int((t + beat) * fps)
    start = (i0 + int(np.argmax(flux[i0:i1]))) / fps
    cands = np.linspace(L0 * 0.98, L0 * 1.02, 81)
    scores = [match(start, start + L) for L in cands]
    k = int(np.argmax(scores))
    if best is None or scores[k] > best[2]: best = (start, cands[k], scores[k])
if best is None: sys.exit(f'mkloop: track ({dur:.1f} s) too short for a {A.beats}-beat loop at {bpm:.1f} bpm')
start, L, score = best

a, Ls = int(start * sr), int(L * sr)
w, r = int(0.05 * sr), int(0.01 * sr)
ref = mono[a:a + w]
wc, wk = -1e9, 0
for k in range(-r, r + 1):
    seg = mono[a + Ls + k:a + Ls + k + w]
    c = ref @ seg / (np.linalg.norm(ref) * np.linalg.norm(seg) + 1e-12)
    if c > wc: wc, wk = c, k
Ls += wk

loop = x[a:a + Ls].copy()
Fd = int(A.crossfade_ms / 1000 * sr)
t = np.linspace(0, np.pi / 2, Fd)[:, None]
loop[:Fd] = x[a:a + Fd] * np.sin(t) + x[a + Ls:a + Ls + Fd] * np.cos(t)
out = np.concatenate([loop, loop[:pad]])
wavfile.write(A.dst, sr, (np.clip(out, -1, 1) * 32767).astype(np.int16))
print(json.dumps({'bpm': round(bpm, 2), 'start_s': round(start, 3), 'samples': int(Ls), 'sampleRate': int(sr),
                  'matchScore': round(score, 3), 'waveCorr': round(float(wc), 3), 'padSamples': pad}))
