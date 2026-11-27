"""Encode music sources at several codecs/bitrates, decode back, report size and crude quality proxies.
usage: python -I bench.py <dir> <src.wav> [...]
Quality proxies (listening is the real test):
  bw_kHz   highest frequency where the decoded long-term spectrum stays within 20 dB of the source
  bandSNR  mean per-frame, per-1/3-octave-band SNR in dB (clipped 0..40), alignment by cross-correlation
"""
import subprocess, sys, os, json
import numpy as np
from scipy.io import wavfile
from scipy.signal import stft, correlate

VARIANTS = [
    # name, ext, ffmpeg args
    ('opus_s96', 'webm', ['-c:a', 'libopus', '-b:a', '96k', '-application', 'audio']),
    ('opus_s64', 'webm', ['-c:a', 'libopus', '-b:a', '64k', '-application', 'audio']),
    ('opus_s48', 'webm', ['-c:a', 'libopus', '-b:a', '48k', '-application', 'audio']),
    ('opus_s32', 'webm', ['-c:a', 'libopus', '-b:a', '32k', '-application', 'audio']),
    ('opus_s24', 'webm', ['-c:a', 'libopus', '-b:a', '24k', '-application', 'audio']),
    ('opus_m48', 'webm', ['-ac', '1', '-c:a', 'libopus', '-b:a', '48k', '-application', 'audio']),
    ('opus_m32', 'webm', ['-ac', '1', '-c:a', 'libopus', '-b:a', '32k', '-application', 'audio']),
    ('opus_m24', 'webm', ['-ac', '1', '-c:a', 'libopus', '-b:a', '24k', '-application', 'audio']),
    ('aac_s96', 'm4a', ['-c:a', 'aac', '-b:a', '96k']),
    ('aac_s64', 'm4a', ['-c:a', 'aac', '-b:a', '64k']),
    ('mp3_s128', 'mp3', ['-c:a', 'libmp3lame', '-b:a', '128k']),
    ('mp3_s64', 'mp3', ['-c:a', 'libmp3lame', '-b:a', '64k']),
    ('vorbis_q0', 'ogg', ['-c:a', 'libvorbis', '-q:a', '0']),
]

def ff(*a):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *a], check=True)

def load(p):
    sr, x = wavfile.read(p)
    x = x.astype(np.float64) / (32768.0 if x.dtype == np.int16 else 1.0)
    if x.ndim == 1: x = x[:, None]
    return sr, x

def bands(sr, nfft):
    f = np.fft.rfftfreq(nfft, 1 / sr)
    edges = 25 * 2 ** (np.arange(0, 30) / 3)
    edges = edges[edges < min(20000, sr / 2)]
    return [(f >= lo) & (f < hi) for lo, hi in zip(edges[:-1], edges[1:])]

def metrics(ref, dec, sr):
    r, d = ref.mean(1), dec.mean(1)  # mid channel (mono variants compared on mid)
    n = min(len(r), len(d), sr * 60)
    lag = int(np.argmax(correlate(d[: sr * 4], r[: sr * 4], mode='full', method='fft')) - (sr * 4 - 1))
    d = d[lag:] if lag > 0 else np.concatenate([np.zeros(-lag), d])
    n = min(len(r), len(d), n); r, d = r[:n], d[:n]
    _, _, R = stft(r, sr, nperseg=2048); _, _, D = stft(d, sr, nperseg=2048)
    Pr, Pe = np.abs(R) ** 2, np.abs(R - D) ** 2
    snr = []
    for m in bands(sr, 2048):
        s, e = Pr[m].sum(0), Pe[m].sum(0)
        live = s > s.max() * 1e-4
        if live.sum(): snr.append(np.clip(10 * np.log10(s[live] / (e[live] + 1e-20)), 0, 40).mean())
    lr, ld = 10 * np.log10(Pr.mean(1) + 1e-20), 10 * np.log10((np.abs(D) ** 2).mean(1) + 1e-20)
    f = np.fft.rfftfreq(2048, 1 / sr)
    ok = (ld > lr - 20) & (lr > lr.max() - 70)
    bw = f[np.nonzero(ok)[0].max()] / 1000 if ok.any() else 0
    return lag, round(float(np.mean(snr)), 1), round(float(bw), 1)

def main():
    out_dir, srcs = sys.argv[1], sys.argv[2:]
    rows = []
    for src in srcs:
        base = os.path.splitext(os.path.basename(src))[0]
        sr, ref = load(src); sec = len(ref) / sr
        rows.append({'src': base, 'variant': 'wav16', 'KB': round(os.path.getsize(src) / 1024), 'KB_per_min': round(os.path.getsize(src) / 1024 / sec * 60), 'bandSNR': 40, 'bw_kHz': sr / 2000, 'lenDiff_ms': 0})
        for name, ext, args in VARIANTS:
            enc = os.path.join(out_dir, f'{base}.{name}.{ext}'); dec = enc + '.dec.wav'
            ff('-i', src, *args, enc)
            ff('-i', enc, '-ar', str(sr), '-ac', '2', '-c:a', 'pcm_f32le', dec)
            _, x = load(dec)
            lag, snr, bw = metrics(ref, x, sr)
            kb = os.path.getsize(enc) / 1024
            rows.append({'src': base, 'variant': name, 'KB': round(kb), 'KB_per_min': round(kb / sec * 60), 'bandSNR': snr, 'bw_kHz': bw,
                         'lenDiff_ms': round((len(x) - len(ref)) / sr * 1000, 1), 'lag': lag})
            os.remove(dec)
    print(json.dumps(rows, ensure_ascii=False))

main()
