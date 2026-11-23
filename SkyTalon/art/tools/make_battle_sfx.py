"""Build the battle clips (game/src/assets/sfx/{shot,hit,kill,boom,bossdown}.mp3) from 効果音ラボ (soundeffect-lab.info).

効果音ラボ's terms: free, commercial use and editing allowed, but the files may not be redistributed. So the raw files
(art/raw/audio/selab/) and these outputs stay out of the public repository (SkyTalon/.gitignore); a clone without them
plays the synthesised recipes in audio/sfx.js instead. Download the five raw files from
https://soundeffect-lab.info/sound/battle/battle2.html into art/raw/audio/selab/ and run this to rebuild them.

Every clip starts ~8 ms before its loudest moment, so it lands on the tick that triggers it (no lead-in that reads as
late), then is trimmed, faded and loudness-normalised to 22 kHz mono MP3 at 48 kbps. The kill is also slowed a little
(deeper) and given two quieter echoes of its own boom 0.11 s apart: a rolling "boom-boom-boom".
Run: python art/tools/make_battle_sfx.py
"""
import subprocess
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'raw/audio/selab'
OUT = ROOT.parent / 'game/src/assets/sfx'
SR = 22050
# name: (source, seconds kept, speed (below 1 = deeper), rolls)
CLIPS = {
    'shot': ('shot1', 0.22, 1.0, False),
    'hit': ('shot-struck1', 0.2, 1.0, False),
    'kill': ('bomb3', 1.0, 0.85, True),
    'boom': ('bomb1', 1.4, 1.0, False),
    'bossdown': ('big-explosion1', 2.6, 1.0, False),
}


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


def write(y, path):
    pcm = (y * 32767).astype(np.int16).tobytes()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-', '-af', 'loudnorm=I=-16:TP=-1.5',
                    '-ar', str(SR), '-map_metadata', '-1', '-id3v2_version', '0', '-write_id3v1', '0', '-b:a', '48k', str(path)], input=pcm, check=True)


if __name__ == '__main__':
    for name, (src, keep, speed, rolls) in CLIPS.items():
        path = OUT / f'{name}.mp3'
        write(build(src, keep, speed, rolls), path)
        print(f'{name:9s} <- {src:15s} {path.stat().st_size // 1024} KB')
