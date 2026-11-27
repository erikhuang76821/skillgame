"""Cut a seamless N-beat loop out of a full track.
usage: python -I mkloop.py <in.wav> <out.wav> [beats=32] [startFrac=0.3]
1. tempo from the autocorrelation of a spectral-flux onset envelope (70-180 bpm)
2. start on the strongest onset near startFrac of the track
3. loop length = beats; refined (+-2 %) so the music right after the end matches the music right after the start
4. sample-level align by waveform correlation (+-10 ms), then a 25 ms equal-power crossfade of the
   continuation into the head, so end -> start is continuous
prints JSON: bpm, start_s, len_s, matchScore (0..1 cosine of log-mel frames after start vs after end)
"""
import sys, json
import numpy as np
from scipy.io import wavfile
from scipy.signal import stft

src, dst = sys.argv[1], sys.argv[2]
beats = int(sys.argv[3]) if len(sys.argv) > 3 else 32
frac = float(sys.argv[4]) if len(sys.argv) > 4 else 0.3
sr, x = wavfile.read(src)
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
ok = (bpm_of >= 70) & (bpm_of <= 180)
lag = lags[ok][np.argmax(ac[ok])]
# parabolic refine
if 1 <= lag < len(ac) - 1:
    a, b, c = ac[lag - 1], ac[lag], ac[lag + 1]; lag = lag + 0.5 * (a - c) / (a - 2 * b + c)
bpm = 60 * fps / lag
beat = 60 / bpm

# features: coarse log spectrum bands per frame
nb = 40
edges = np.unique(np.geomspace(1, S.shape[0] - 1, nb + 1).astype(int))
F = np.stack([S[e0:e1].mean(0) for e0, e1 in zip(edges[:-1], edges[1:])])
def feat(t, dur=2.0):
    i = int(t * fps); n = int(dur * fps); v = F[:, i:i + n].ravel(); return v - v.mean()
def match(t0, t1):
    a, b = feat(t0), feat(t1); n = min(len(a), len(b)); a, b = a[:n], b[:n]
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))

# start: strongest onset within +-1 beat of frac
t_guess = frac * len(mono) / sr
i0, i1 = int((t_guess - beat) * fps), int((t_guess + beat) * fps)
start = (i0 + int(np.argmax(flux[i0:i1]))) / fps
L0 = beats * beat
cands = np.linspace(L0 * 0.98, L0 * 1.02, 81)
scores = [match(start, start + L) for L in cands]
L = cands[int(np.argmax(scores))]
score = max(scores)

# sample-level: align waveform right after start with right after start+L
a, Ls = int(start * sr), int(L * sr)
w, r = int(0.05 * sr), int(0.01 * sr)
ref = mono[a:a + w]
best, bestk = -1e9, 0
for k in range(-r, r + 1):
    seg = mono[a + Ls + k:a + Ls + k + w]
    c = ref @ seg / (np.linalg.norm(ref) * np.linalg.norm(seg) + 1e-12)
    if c > best: best, bestk = c, k
Ls += bestk

out = x[a:a + Ls].copy()
Fd = int(0.025 * sr)
t = np.linspace(0, np.pi / 2, Fd)[:, None]
out[:Fd] = x[a:a + Fd] * np.sin(t) + x[a + Ls:a + Ls + Fd] * np.cos(t)
wavfile.write(dst, sr, (np.clip(out, -1, 1) * 32767).astype(np.int16))
print(json.dumps({'bpm': round(bpm, 2), 'start_s': round(start, 3), 'len_s': round(Ls / sr, 3), 'samples': int(Ls),
                  'matchScore': round(score, 3), 'waveCorr': round(float(best), 3)}))
