"""BladeOath pixel set (gdd/02): every generation prompt = STYLE_LOCK + body. Writes art/prompts/<name>.txt.

Run:  python BladeOath/art/tools/prompts.py          -> writes the txt files
      python BladeOath/art/tools/prompts.py --json   -> prints {"names": [...], "prompts": [...]} for the picanywhere call
Characters are cutout parts hung on the procedural skeleton (gdd/12 §7): head and torso in three views + one weapon.
Limbs stay procedural, so no arms or legs are drawn on the parts.
"""
import json, sys
from pathlib import Path

STYLE_LOCK = (
    "Style lock (original dark xianxia 'ink and indigo' pixel set): 16-bit pixel art for a top-down 3/4 view action game. "
    "TRUE LOW-RESOLUTION pixel art: every art pixel is a large crisp square block of equal size, chunky clean clusters, "
    "no anti-aliasing, no gradients, no blur, no dithering noise. 1-pixel dark indigo outline (#161a26), never pure black. "
    "Muted low-saturation palette: ink greys (#22262e, #353a44, #4c525c) and cold steel (#b8c2cc, #7c8894, #4e5866); "
    "light from the upper-left, 3 shades per material. Gold, bright red and white are RESERVED for gameplay effects: "
    "never use gold, bright red or large white areas. No large areas of pure black. No coins, no dice, no religious "
    "symbols, no talismans or paper charms, no bagua, no Taoist robes, no temples, no incense burners, no deities, no "
    "halos. Original design only, no existing franchise or game. Background: perfectly flat solid {bg} chroma-key filling "
    "the whole canvas, no checkerboard, no ground plane, no cast shadow, no text, no letters, no numbers, no grid lines, "
    "no frames."
)
GREEN, MAGENTA = "pure green #00FF00", "pure magenta #FF00FF"

PARTS = (
    "Layout: exactly 2 rows on the {bg} background, wide empty gaps between every item, no two items touch.\n"
    "Row 1 (reference): the full character three times, standing, same scale: FRONT view, SIDE view facing RIGHT, BACK view.\n"
    "Row 2 (cutout parts for a skeletal rig, each part drawn separately and centred in its own space, same scale as row 1): "
    "{parts}.\n"
    "Each part has its own 1-pixel outline all round and nothing attached to it. The character is about {h} art pixels tall, "
    "so every art pixel is a big visible square."
)
HUMAN_PARTS = ("(1) head FRONT view, (2) head SIDE view facing right, (3) head BACK view, (4) torso FRONT view, (5) torso SIDE "
               "view facing right, (6) torso BACK view, (7) the weapon alone, lying horizontal, pointing RIGHT. "
               "The torso is shoulders to hips only: NO head, NO arms, NO legs on it")


def human(desc, weapon, h, bg=GREEN):
    return f"{desc} Weapon: {weapon}.\n\n" + PARTS.format(bg=bg, parts=HUMAN_PARTS, h=h)


BODIES = {
    "chr_player": (human("Player character 'swordsman': a lean young wandering swordsman in a short indigo robe (#6fb4c8, #3f7f99, "
                         "#26506a) with a dark ink sash, hair tied up in a simple topknot with a dark cloth band, plain "
                         "cloth shoes. No ornaments, no hat.", "a straight plain steel jian sword, cold grey blade, dark grip", 24), GREEN),
    "chr_soldier": (human("Enemy 'corpse soldier': an undead foot soldier in torn dull ochre cloth (#a89a7c, #7d6f56, #52483a) and "
                          "cracked lamellar plates, head hanging forward, grey-ochre skin, empty dark eye sockets. No paper "
                          "talisman on the forehead.", "a broken single-edged saber, chipped grey blade", 24), GREEN),
    "chr_caster": (human("Enemy 'gu sorcerer': a hunched poison-insect witch-doctor in layered moss-green rags (#8fb069, #5f7d48, "
                         "#3b5030), a cloth veil hiding the lower face, a small clay jar tied on the back. Not a priest: no "
                         "robes with symbols, no charms.", "a gnarled wooden staff with a small clay jar on top", 24, MAGENTA), MAGENTA),
    "chr_brute": (human("Enemy 'corpse brute': a huge hulking undead strongman, very broad shoulders, ochre skin and rags "
                        "(#a89a7c, #7d6f56, #52483a), heavy iron chains wrapped across the chest.", "a short heavy iron war hammer", 34), GREEN),
    "chr_mother": (human("Elite enemy 'gu mother': a tall gaunt insect-matriarch woman, a hunched mantle made of grey-green "
                         "cocoons and husks (#5f7d48, #3b5030, #4c525c), long dark hair, pale grey skin. Not glamorous, eerie.",
                         "long curved bone claws held like a blade", 36, MAGENTA), MAGENTA),
    "chr_general": (human("Mid-boss 'corpse general': an undead armoured general, broken heavy lamellar armour in dark ochre and "
                          "ink grey (#7d6f56, #52483a, #353a44), a cracked helmet with a short plume-less crest, tattered cape.",
                          "a long guandao halberd with a crescent blade, cold grey", 40), GREEN),
    "chr_fallen": (human("Final boss 'fallen immortal': a tall gaunt fallen cultivator swordsman in tattered pale grey layered "
                         "robes with drifting torn lilac ribbons (#9c86c0, #5e4f7c), long loose grey hair, ashen skin, "
                         "melancholic. Not a god: no halo, no throne, no lotus, no golden light.",
                         "a very long slender straight sword, cold steel", 42), GREEN),
    "chr_bug": ("Enemy 'gu bug': a fat poisonous beetle-like insect, segmented moss-green carapace (#8fb069, #5f7d48, #3b5030) "
                "with ink-grey plates, short pincer mandibles.\n\n" + PARTS.format(
                    bg=MAGENTA, h=12,
                    parts="(1) carapace body seen from FRONT (head towards viewer), (2) carapace body SIDE view facing right, "
                          "(3) carapace body seen from BACK, (4) the pincer mandibles alone, horizontal, pointing RIGHT. "
                          "The body parts have NO legs (legs are drawn by the game)").replace("The character is", "The bug is"), MAGENTA),
    "props": (("Two props for checkpoints and loot.\n\nLayout: one row on the {bg} background, wide empty gaps, nothing touches: "
               "(1) 'sword mound': a small heap of grey stones with a broken old jian sword planted slanted in it and a tiny "
               "plain stone lantern beside it (unlit, no flame), about 16x22 art pixels; NOT an incense burner, NOT a shrine, "
               "NOT a grave tablet, no writing. (2) a closed wooden chest with dark iron corners, about 14x11 art pixels. "
               "(3) the same chest OPEN and empty (no coins, no gold inside). Every art pixel is a big visible square."), GREEN),
}


def prompts():
    out = {}
    for name, (body, bg) in BODIES.items():
        out[name] = STYLE_LOCK.format(bg=bg) + "\n\n" + body.format(bg=bg)
    return out


if __name__ == "__main__":
    P = prompts()
    d = Path(__file__).resolve().parents[1] / "prompts"
    d.mkdir(exist_ok=True)
    for n, p in P.items(): (d / f"{n}.txt").write_text(p, encoding="utf-8")
    if "--json" in sys.argv: print(json.dumps({"names": list(P), "prompts": list(P.values())}, ensure_ascii=False))
    else: print(f"wrote {len(P)} prompts to {d}")
