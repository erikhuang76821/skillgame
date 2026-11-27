"""BladeOath v5 scenery (gdd/02 §3.2): two layers per stage + one props sheet. Writes art/prompts/<name>.txt.

Run:  python BladeOath/art/tools/scenes.py          -> writes the txt files
      python BladeOath/art/tools/scenes.py --json   -> prints {"names": [...], "prompts": [...]} for the picanywhere call
Every stage is a long side-scrolling strip: a FAR layer (sky and distance, scrolls slowly) and a NEAR layer (a back wall
strip above a walkable floor band, scrolls with the camera). Both are tiled by mirroring copies, so only the overall
look matters, not a seamless edge. The props sheet is a cutout sheet on a chroma key, like the characters.
"""
import json, sys
from pathlib import Path

LOOK = (
    "Original dark xianxia 'ink and indigo' 16-bit pixel art for a side-scrolling beat-'em-up. TRUE LOW-RESOLUTION pixel art: "
    "every art pixel is a large crisp square block, chunky clean clusters, no anti-aliasing, no smooth gradients, no blur. "
    "Muted low-saturation palette of ink greys, indigo and slate, plus the stage's own accent named below; light from the "
    "upper-left. Gold, bright red and large white areas are RESERVED for gameplay: never use them (no sunsets, no lit "
    "lanterns, no fire glow). No religious buildings or symbols: no temples, pagodas, shrines, statues of deities, incense "
    "burners, talismans, bagua, halos, lotus thrones. No text, letters, plaques with writing, numbers, frames or UI. "
    "No characters, no animals, no people. Original design, no existing game or franchise."
)
FAR = (
    LOOK + "\nFAR LAYER: a wide horizontal side-view panorama of the distance only: {scene}. Seen from the side like a "
    "theatre backdrop. The bottom fifth of the picture fades into dark silhouettes (it sits behind a wall later). Nothing in "
    "the foreground, no ground plane, no path. Wide landscape composition, about three times wider than tall."
)
NEAR = (
    LOOK + "\nNEAR LAYER (the walkable strip): a wide horizontal side-view strip, exactly two horizontal bands. "
    "TOP 26 percent: {wall}, a straight horizontal top edge, the boundary to the floor is a straight horizontal line. "
    "BOTTOM 74 percent: {floor}, a flat even floor seen from slightly above (3/4 side view), evenly lit with no spotlight, "
    "rows of {tiles} that run horizontally and get slightly larger toward the bottom, low contrast so fighters stand out. "
    "No objects on the floor, no props, no puddles, no shadows of anything. Wide landscape composition, about three times "
    "wider than tall."
)
STAGES = {
    "gate": ("a ruined mountain pass at dusk under a deep indigo sky, layered cold grey cliffs and pine silhouettes, a "
             "broken plain stone gateway of two square pillars far away (no roof, no ornaments), drifting mist",
             "a low wall of rough grey fieldstone with a few plain square stone posts",
             "worn grey stone flagstones with moss in the joints", "flagstones"),
    "forest": ("a dark poisoned forest at night, twisted leafless trees, pale grey-green hanging cocoons and webs, low "
               "moss-green fog, a muted teal sky",
               "a dense row of dark twisted tree trunks with roots and hanging grey cocoons",
               "dark damp earth with roots and moss patches", "packed earth and flat roots"),
    "well": ("a dry abandoned well courtyard in a dead village at night, cracked grey plaster walls and collapsed tiled roofs "
             "far away (plain houses, no temple), dust in the air, slate sky",
             "a cracked grey plaster courtyard wall with a broken plain wooden fence",
             "dusty cracked grey paving stones", "paving stones"),
    "hall": ("the inside of a ruined fortress hall at night, tall dark brown-red stone walls and broken wooden beams, torn "
             "dark cloth banners without any writing, dim cold light from high slits",
             "a dark reddish-brown stone wall base with broken weapon racks (no weapons glowing)",
             "large dark reddish-brown stone tiles, scratched", "large square tiles"),
    "cloister": ("a long covered corridor of a ruined fortress at night seen from the side, rows of dark wooden pillars, a "
                 "blue-grey moonlit sky between them, broken lattice panels",
                 "the base of a corridor railing with dark wooden posts and a low plank balustrade",
                 "long dark blue-grey wooden floor planks", "floor planks"),
    "terrace": ("a high stone terrace above a sea of clouds at night, a muted violet sky with cold stars, broken grey stone "
                "columns far away, thin lilac mist (no glow, no halo, no throne)",
                "a low parapet of pale grey carved stone blocks (no symbols) with a few broken columns",
                "pale grey stone slabs with thin cracks", "stone slabs"),
}
PROPS = (
    LOOK + "\nPROPS SHEET (cutouts): seven separate objects in one row on a perfectly flat solid pure green #00FF00 "
    "chroma-key background, wide empty gaps between them, none touching, each with a 1-pixel dark indigo (#161a26) outline, "
    "seen from the side with a slight top-down angle, same pixel scale. Left to right: (1) a fat brown clay wine jar with a "
    "cloth-tied lid, (2) a plain wooden crate with dark iron corners, (3) an UNLIT stone lantern on a short post, plain grey, "
    "(4) a broken blank stone stele leaning slightly, no writing at all, (5) a steamed bun on a green leaf, (6) a small "
    "blue-grey porcelain medicine bottle with a cork, (7) a lump of dark iron ore with steel-grey flecks. No cast shadows, no "
    "ground under them, no text."
)


def prompts():
    out = {}
    for sid, (scene, wall, floor, tiles) in STAGES.items():
        out[f"far_{sid}"] = FAR.format(scene=scene)
        out[f"near_{sid}"] = NEAR.format(wall=wall, floor=floor, tiles=tiles)
    out["props_v5"] = PROPS
    return out


def main():
    ps = prompts()
    if "--json" in sys.argv:
        print(json.dumps({"names": list(ps), "prompts": list(ps.values())}, ensure_ascii=False))
        return
    d = Path(__file__).resolve().parents[1] / "prompts"
    d.mkdir(exist_ok=True)
    for name, text in ps.items():
        (d / f"{name}.txt").write_text(text + "\n", encoding="utf-8")
    print(f"wrote {len(ps)} prompts")


if __name__ == "__main__":
    main()
