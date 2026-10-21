#!/usr/bin/env python3
"""Write one Codex prompt per (character, animation, direction) into art/prompts/anim/.

Only the five unique facings are generated; up_left / left / down_left are horizontal
mirrors of up_right / right / down_right (done in tools/anim_frames.py).
Also crops the three identity poses (down/right/up) into art/raw/ref/ as direction references.
"""
from pathlib import Path
from PIL import Image
import derive_native as dn

ROOT = Path(__file__).resolve().parent.parent
PROMPTS, REF = ROOT / "art/prompts/anim", ROOT / "art/raw/ref"

FACING = {
    "down": "facing the camera (front view, viewer sees the face)",
    "down_right": "three-quarter FRONT view turned toward the viewer's right (face visible, body angled 45 degrees to the right, toward the bottom-right of the screen)",
    "right": "side profile facing the viewer's right",
    "up_right": "three-quarter BACK view: the character walks away toward the top-right of the screen, body rotated 45 degrees, so we see its back AND its right side (right arm and right shoulder fully visible, left arm mostly hidden behind the body, face hidden). Every frame keeps exactly this rotation and size",
    "up": "facing away from the camera (back view, face not visible)",
}
NEAREST_REF = {"down": "down", "down_right": "down", "right": "right", "up_right": "up", "up": "up"}

# `size` = art size requested from the model for ONE pose (character + outline).
# It is not the native frame: tools/anim_frames.py SPEC sets the frame box (sasq 32x40, greyling 28x28)
# and scales every strip so the character is (box height - 4) tall, leaving a 2-px top margin and
# the ground line at row h-2. greyling: requested 24 = 28 - 4 (1:1); sasq: requested 40, placed at 36.
CHAR = {
    "sasq": dict(
        desc='"Sasq", a young friendly Bigfoot with chestnut-brown shaggy fur, tan face, big eyes, a red-and-black plaid scarf, chunky feet, chibi proportions (head ~40% of height)',
        size=(32, 40), sheet="native_hero_1.png"),
    "greyling": dict(
        desc='"Greyling", a tiny grey alien with a big round head, huge glossy black eyes, a short antenna with a lime-green glowing tip, and a small silver suit with a jetpack',
        size=(24, 24), sheet="native_greyling_1.png"),
}
ANIM = {
    "Idle": (2, [
        "frame 1: relaxed standing pose, arms down",
        "frame 2: the same standing pose breathing in: head and shoulders exactly 1 art pixel lower, arms 1 art pixel further from the body; feet do not move",
    ]),
    "Walk": (4, [
        "frame 1: contact pose, left foot forward and right foot back, arms swinging opposite to the legs",
        "frame 2: passing pose, legs together under the body, body 1 art pixel higher",
        "frame 3: contact pose, right foot forward and left foot back (mirror of the frame 1 leg/arm positions)",
        "frame 4: passing pose, legs together under the body, body 1 art pixel higher",
    ]),
}

ANIMS = {"sasq": ["Idle", "Walk"], "greyling": ["Walk"]}


def prompt(name, anim, direction):
    c = CHAR[name]; n, beats = ANIM[anim]; w, h = c["size"]
    # gen_anim.sh attaches image 3 only when an accepted Idle strip exists for this facing.
    idle_ref = anim == "Walk" and "Idle" in ANIMS[name]
    scarf = (" The hanging scarf tail stays on the same side of the body as in attached image 3."
             if name == "sasq" and idle_ref else "")
    return f"""Generate one image with your image generation tool. Do not write any files.

Draw an animation strip for the original game character {c['desc']}.
Attached image 1 is the accepted identity sheet (front, right side, back): copy its exact species, proportions, face, colors, accessories, outline and pixel-art style. Attached image 2 is the identity pose closest to the requested facing.{' Attached image 3 is the accepted Idle frame for this exact facing: keep its camera, size and proportions.' if idle_ref else ''}

Action: {anim}. Facing: {FACING[direction]}. Every frame faces the same direction.
Show exactly {n} frames of the SAME character in ONE horizontal row, left to right, same scale, feet on the same ground line, separated by wide transparent gaps:
{chr(10).join('- ' + b for b in beats)}
Only the limbs/body described change between frames; head size, colors, scarf/suit details and outline stay identical.{scarf}

Draw it as TRUE LOW-RESOLUTION pixel art: each frame is exactly {w}x{h} art pixels, and the whole image is upscaled with nearest-neighbour so every art pixel is a clean, equal, hard-edged square block (about 16x16 screen pixels per art pixel). No sub-pixel detail, no anti-aliasing, no gradients, no smooth curves. 1-art-pixel dark outline around the whole silhouette. Limited palette (max 16 colors). Light from upper-left. Actual transparent background (alpha). No text, labels, frame numbers, grid, ground, or shadow.
"""

if __name__ == "__main__":
    PROMPTS.mkdir(parents=True, exist_ok=True); REF.mkdir(parents=True, exist_ok=True)
    for name, c in CHAR.items():
        poses = dn.split_poses(Image.open(ROOT / "art/raw" / c["sheet"]).convert("RGBA"))
        assert len(poses) == 3, name
        for d, p in zip(("down", "right", "up"), poses): p.save(REF / f"{name}_{d}.png")
        for anim in ANIMS[name]:
            for d in FACING:
                (PROMPTS / f"{name}_{anim}_{d}.txt").write_text(prompt(name, anim, d), encoding="utf-8")
    print(sorted(p.name for p in PROMPTS.iterdir()))
