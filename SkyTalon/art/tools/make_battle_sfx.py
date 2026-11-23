"""Build the battle clips (game/src/assets/sfx/{shot,hit,kill,boom,bossdown}.mp3) from 効果音ラボ (soundeffect-lab.info).

効果音ラボ's terms: free, commercial use and editing allowed, but the files may not be redistributed. So the raw files
(art/raw/audio/selab/) and these outputs stay out of the public repository (SkyTalon/.gitignore); a clone without them
plays the synthesised recipes in audio/sfx.js instead. Download the five raw files from
https://soundeffect-lab.info/sound/battle/battle2.html into art/raw/audio/selab/ and run this to rebuild them.

Every clip starts ~8 ms before its loudest moment, so it lands on the tick that triggers it (no lead-in that reads as
late), then is trimmed, faded and loudness-normalised to 22 kHz mono MP3 at 48 kbps. The kill is also slowed a little
(deeper) and given two quieter echoes of its own boom 0.11 s apart: a rolling "boom-boom-boom". The ship's own hit
(hurt) is a big explosion slowed and muffled, a metal crack on its first frames, widened to stereo: dull and long.
Run: python art/tools/make_battle_sfx.py
"""
import subprocess
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'raw/audio/selab'
OUT = ROOT.parent / 'game/src/assets/sfx'
SR = 22050
# name: (source, seconds kept, speed (below 1 = deeper), rolls, lowpass Hz or 0)
CLIPS = {
    'shot': ('shot1', 0.24, 0.8, False, 2200),       # slowed and muffled: a thud, not a hiss
    'hit': ('shot-struck1', 0.2, 1.0, False, 0),
    'kill': ('bomb3', 1.0, 0.85, True, 0),
    'boom': ('bomb1', 1.4, 1.0, False, 0),
    'bossdown': ('big-explosion1', 2.6, 1.0, False, 0),
}
HURT = ('big-explosion1', 2.1, 0.72)                  # source, seconds, speed: the ship breaking, low and drawn out


def load(name):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(RAW / f'{name}.mp3'), '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768


def build(src, keep, speed, rolls):
    x = load(src)
    env = np.convolve(np.abs(x), np.ones(110) / 110, 'same')
    x = x[max(0, int(env.argmax()) - int(0.008 * SR)):]
    if speed != 1: x = np.interp(np.arange(0, len(x) - 1, speed), np.arange(len(x)), x)
    n = int(keep * SR); y = np.zeros(n); seg = x[:n]; y[:len(seg)] = seg
    if rolls:
        seg = seg * np.exp(-np.arange(len(seg)) / SR / 0.35)          # each boom decays fast, so the first stays the loudest
        y[:] = 0; y[:len(seg)] = seg
        for delay, level in ((0.11, 0.5), (0.23, 0.3)):
            k = int(delay * SR); y[k:] += seg[:n - k] * level
    fade = int(min(0.25, keep * 0.3) * SR); y[-fade:] *= np.linspace(1, 0, fade)
    return y / (np.abs(y).max() / 0.89)


def lowpass(x, hz):
    a = np.exp(-2 * np.pi * hz / SR); y = np.empty_like(x); v = 0.0
    for _ in range(2):                                                # two one-pole passes: a soft, muffled 12 dB/oct
        for i, s in enumerate(x): v = (1 - a) * s + a * v; y[i] = v
        x = y.copy()
    return y


def hurt():
    src, keep, speed = HURT
    body = lowpass(build(src, keep, speed, False), 900)              # the dull boom
    crack = build('shot-struck1', 0.12, 0.8, False)                  # metal giving way, on the first frames
    y = body.copy(); y[:len(crack)] += crack * np.exp(-np.arange(len(crack)) / SR / 0.04) * 0.45
    y *= np.minimum(1, np.exp(-(np.arange(len(y)) / SR - 0.6) / 0.7))  # a long tail after the first 0.6 s
    # stereo: the same boom with a decorrelated side (delayed, softer copies) so it fills both ears instead of the middle
    d1, d2 = int(0.013 * SR), int(0.029 * SR)
    side = np.zeros_like(y); side[d1:] += y[:-d1] * 0.5; side[d2:] -= y[:-d2] * 0.4
    lr = np.stack([y + side, y - side], 1)
    return lr / (np.abs(lr).max() / 0.89)


def write(y, path):
    ch = 1 if y.ndim == 1 else y.shape[1]
    pcm = (y * 32767).astype(np.int16).tobytes()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', str(ch), '-i', '-', '-af', 'loudnorm=I=-16:TP=-1.5',
                    '-ar', str(SR), '-map_metadata', '-1', '-id3v2_version', '0', '-write_id3v1', '0', '-b:a', f'{48 * ch}k', str(path)], input=pcm, check=True)


if __name__ == '__main__':
    for name, (src, keep, speed, rolls, lp) in CLIPS.items():
        path = OUT / f'{name}.mp3'
        y = build(src, keep, speed, rolls)
        if lp: y = lowpass(y, lp); y /= np.abs(y).max() / 0.89
        write(y, path)
        print(f'{name:9s} <- {src:15s} {path.stat().st_size // 1024} KB')
    write(hurt(), OUT / 'hurt.mp3')
    print(f'hurt      <- {HURT[0]:15s} {(OUT / "hurt.mp3").stat().st_size // 1024} KB (stereo)')
