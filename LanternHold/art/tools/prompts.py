"""LanternHold pixel set: every generation prompt = STYLE_LOCK + body. Writes art/prompts/<name>.txt.

Run:  python LanternHold/art/tools/prompts.py            -> writes the txt files
      python LanternHold/art/tools/prompts.py --json     -> prints [names], [prompts] for the picanywhere call
"""
import json, sys
from pathlib import Path

STYLE_LOCK = (
    "Style lock (LanternHold pixel set, shared by every asset): original 16-bit pixel art for a top-down 3/4 view "
    "night-forest tower-defense game. TRUE LOW-RESOLUTION pixel art: every art pixel is a large crisp square block of "
    "equal size, chunky clean clusters, no anti-aliasing, no gradients, no blur, no dithering noise. 1-pixel dark outline "
    "in deep indigo (#1b1530), never pure black. Small shared palette: deep indigo and teal night tones, warm lamp orange "
    "#ffb64a as the key light, light comes from the upper-left. Enemies are cool violet shadow creatures with a bright "
    "lilac rim highlight (#c6a8ff); allies are warm readable silhouettes in amber, brown and teal (#6fd3c4). No large "
    "areas of pure black or pure white. No coins, no religious symbols, no deities. Original design only, no existing "
    "franchise or game. Background: perfectly flat solid pure green #00FF00 chroma-key filling the whole canvas, no "
    "checkerboard, no ground plane, no cast shadow, no text, no letters, no numbers, no grid lines, no frames."
)

SHEET = (
    "Sprite sheet layout: {rows}. Each row is one animation, frames ordered left to right. Every frame shows the SAME "
    "character at the identical scale, facing RIGHT (side view as seen from a 3/4 top-down camera), feet on one shared "
    "baseline per row. Frames are evenly spaced with wide empty green gaps; no two frames touch. The character is about "
    "{w}x{h} art pixels, so each art pixel is a big visible square."
)

def chr_sheet(desc, rows, w, h):
    return f"{desc}\n\n" + SHEET.format(rows=rows, w=w, h=h)

ALLY_ROWS = "3 rows: row 1 idle (2 frames, gentle breathing), row 2 walk cycle (4 frames), row 3 attack (3 frames: wind-up, strike, recover)"

BODIES = {
    # --- allies ---
    "unit_worker": chr_sheet("Ally unit 'worker': a stocky friendly villager builder with a brown leather apron, rolled sleeves, "
                             "a small orange cap, carrying a wooden hammer.", ALLY_ROWS + "; the attack row swings the hammer", 16, 18),
    "unit_archer": chr_sheet("Ally unit 'archer': a nimble young archer in a teal hooded cloak with amber trim, holding a short wooden "
                             "bow, quiver on the back.", ALLY_ROWS + "; the attack row draws and releases the bow (no arrow flying away)", 16, 18),
    "unit_shield": chr_sheet("Ally unit 'shield soldier': a sturdy soldier in a rounded steel helmet and teal tabard, holding a big "
                             "round wooden shield with an iron rim on the front arm and a short sword.", ALLY_ROWS + "; the attack row is a shield bash", 16, 18),
    "unit_priest": chr_sheet("Ally unit 'healer': a gentle healer in a long hooded cream-and-amber robe holding a tall wooden staff with "
                             "a small glowing lantern hanging from its tip. No crosses, no religious symbols, no halo.",
                             ALLY_ROWS + "; the attack row raises the lantern staff and the lantern flares warm orange", 16, 18),
    # take 2: the t1 cream robe turns to speckle at 18 px; simpler, darker, two-tone robe
    "unit_priest_v2": chr_sheet("Ally unit 'healer': a small gentle healer in a simple hooded robe of flat teal (#6fd3c4) with a warm "
                                "amber sash, simple face, holding a tall wooden staff with a small glowing orange lantern hanging from its "
                                "tip. Big simple shapes, few details, readable at tiny size. No crosses, no religious symbols, no halo.",
                                ALLY_ROWS + "; the attack row raises the lantern staff and the lantern flares warm orange", 16, 18),
    # --- enemies ---
    "foe_rat": chr_sheet("Enemy 'shadow rat': a small skittering rat made of violet shadow, glowing pale lilac eyes, bright lilac rim light "
                         "on the back.", "1 row: walk cycle (4 frames, scurrying)", 12, 10),
    "foe_beetle": chr_sheet("Enemy 'shadow beetle': a squat armoured beetle with a dark violet shell, lilac rim highlights, small glowing "
                            "eyes, six short legs.", "1 row: walk cycle (4 frames)", 16, 12),
    "foe_moth": chr_sheet("Enemy 'shadow moth': a flying moth with dusky purple wings with pale lilac edge markings, fuzzy body, "
                          "glowing eyes, hovering in the air.", "1 row: flying cycle (4 frames of wing flaps)", 16, 14),
    "foe_shroom": chr_sheet("Enemy 'shroom': a walking mushroom with a swollen violet spotted cap, tiny stubby legs, glowing lilac spots "
                            "that will explode.", "2 rows: row 1 walk cycle (4 frames, waddling), row 2 about to burst (2 frames: cap "
                            "swelling, cap swollen and glowing hot)", 12, 14),
    "foe_snail": chr_sheet("Enemy 'siege snail': a big slow armoured snail with a heavy violet spiral shell plated with dark iron, lilac "
                           "rim light, eye stalks, used to batter walls.", "2 rows: row 1 crawl cycle (4 frames), row 2 attack (2 "
                           "frames: rearing back, slamming the shell forward)", 22, 18),
    "foe_wolf": chr_sheet("Enemy 'armoured shadow wolf' (elite): a lean violet shadow wolf wearing dark iron plates on its shoulders and "
                          "head, glowing lilac eyes, bright rim light along the back.", "2 rows: row 1 run cycle (4 frames), row 2 "
                          "attack (2 frames: crouch, lunging bite)", 22, 16),
    "foe_shadow_archer": chr_sheet("Enemy 'shadow archer': a small hunched goblin-like shadow creature with long pointed ears, ragged "
                                   "violet hood, glowing lilac eyes, holding a crooked dark bow.", "2 rows: row 1 walk cycle (4 frames), "
                                   "row 2 attack (2 frames: drawing the bow, releasing)", 14, 18),
    "foe_boss_maw": chr_sheet("Boss 'Maw of Endless Night': a huge hulking shadow beast that is mostly a giant gaping maw with rows of "
                              "pale teeth, deep violet body, many small glowing lilac eyes, smoky tendrils, short heavy legs, bright lilac "
                              "rim light. Menacing but readable, not gory.", "2 rows: row 1 walk (4 frames, heavy stomping), row 2 "
                              "attack (3 frames: maw closed and rearing, maw wide open, exhaling a burst of dark mist)", 56, 48),
    # --- buildings & props ---
    "bld_castle": "A single building: the central castle keep, a round stone tower keep with a wooden gate, crenellations, and a big "
                  "glowing brass lantern on the very top casting warm orange light. 3/4 top-down view, front facing the viewer. About "
                  "64x72 art pixels, so each art pixel is a big visible square. Centered with a wide green margin.",
    "bld_barracks": "Three versions of the same barracks building side by side left to right, same scale, same 3/4 top-down view, "
                    "evenly spaced with wide green gaps: (1) level 1 a canvas army tent with a small teal pennant and a lantern; (2) "
                    "level 2 a wooden hall with a shingled roof, a weapon rack and a lantern; (3) level 3 a sturdy stone hall with a "
                    "slate roof, a teal banner and two lanterns. Each about 36x36 art pixels, so each art pixel is a big visible square.",
    "wall_tiers": "A 3x3 grid of horizontal defensive wall segments, wide green gaps between all of them, same 3/4 top-down view, each "
                  "segment about 30x10 art pixels (long and low, drawn horizontally), so each art pixel is a big visible square. Rows = "
                  "material: row 1 sharpened wooden palisade logs; row 2 grey stone block wall; row 3 dark iron-plated wall with rivets. "
                  "Columns = condition: column 1 intact; column 2 cracked and chipped; column 3 badly broken with a gap and fallen pieces.",
    "props_forest": "A props sheet in a 3/4 top-down view, every object separate with wide green gaps, each art pixel a big visible "
                    "square: row 1 three different dark night-forest trees (a pine, a round leafy oak, a twisted dead tree), each about "
                    "20x28 art pixels, in deep teal and indigo with a warm orange lantern-lit edge; row 2 two mossy rocks (about 14x10), "
                    "a pile of rubble from a broken stone wall (about 30x10, long and low), and two wooden posts each with a hanging "
                    "glowing lantern (about 8x20).",
    # --- fx ---
    "fx_bursts": "An effects sprite sheet, 4 rows x 4 frames, every frame separate with wide green gaps, each frame about 16x16 art "
                 "pixels, each art pixel a big visible square, frames left to right are an animation: row 1 fiery explosion (small "
                 "flash, big orange-yellow burst, breaking up, fading smoke puffs); row 2 frost burst (ice crystal shards in pale cyan "
                 "and white-blue expanding and shattering); row 3 flame (a flickering fire, 4 frames loop, orange and red); row 4 steam "
                 "puff (soft pale grey-teal steam cloud growing and dissolving).",
    "fx_misc": "An effects and pickups sprite sheet, every object separate with wide green gaps, each art pixel a big visible square: "
               "row 1 a wooden arrow flying right (about 12x3), a castle light beam segment (horizontal warm orange-white beam, about "
               "24x6), a lightning bolt segment (horizontal jagged pale-cyan electric bolt, about 24x8); row 2 hit spark (3 frames, "
               "small star-shaped white-orange spark appearing and fading, about 10x10), level-up sparkle (4 frames, golden-teal "
               "twinkling stars rising, about 14x14); row 3 a single gold nugget pickup (a shiny lumpy gold ore nugget, NOT a coin, "
               "about 8x8), a wooden treasure chest closed and the same chest open (about 18x16 each) lit by a few small green-yellow "
               "firefly lights floating around it, no golden glow, no coins inside (soft teal light inside).",
    # --- ground ---
    "ground_forest": "A seamless tileable top-down texture of dark night-forest ground: deep indigo-teal soil with tiny grass tufts, "
                     "a few fallen leaves and small pebbles, very low contrast so sprites read on top of it, evenly distributed with no "
                     "focal point, no objects, no light spots. Fill the whole square canvas edge to edge (no green background for this "
                     "one). Chunky pixel art, about 64x64 art pixels across the whole image.",
    "ground_path": "A seamless tileable top-down texture of a worn dirt forest path: packed muted brown-indigo earth with small "
                   "stones and footprints, slightly lighter than dark forest grass, evenly distributed with no focal point, no "
                   "objects. Fill the whole square canvas edge to edge (no green background for this one). Chunky pixel art, about "
                   "64x64 art pixels across the whole image.",
}

ICON_TAIL = ("Each icon is a single bold readable symbol inside its own cell, about 24x24 art pixels, each art pixel a big visible "
             "square, centered with wide green gaps between icons, no card frame, no border, no text.")
BODIES.update({
    "icons_cards_a": "A 3x3 grid of 9 game skill icons in the same pixel style. Row 1: (1) 'rapid fire' two arrows in quick succession "
                     "with speed lines; (2) 'split arrow' one arrow splitting into three; (3) 'reinforcements' a small teal banner with "
                     "a bow beside it. Row 2: (4) 'fire arrow' an arrow with a flaming orange head; (5) 'burst' an orange explosion "
                     "starburst; (6) 'fire wall' a short wooden palisade with flames on top. Row 3: (7) 'frost arrow' an arrow with a "
                     "pale cyan ice crystal head; (8) 'frost aura' a swirling pale cyan mist ring with snowflake sparkles; (9) 'frost "
                     "shield' a round shield covered in ice. " + ICON_TAIL,
    "icons_cards_b": "A 3x3 grid of 9 game skill icons in the same pixel style. Row 1: (1) 'thunder' a jagged yellow lightning bolt "
                     "striking down from a dark cloud; (2) 'chain lightning' a zigzag bolt linking three dots; (3) 'lightning rod' a "
                     "small stone tower with a metal rod and a spark on top. Row 2: (4) 'shield wall' two overlapping round shields; "
                     "(5) 'blessing' two open cupped hands holding a small warm glowing lantern light (no religious symbols); (6) "
                     "'stone wall' a stack of grey stone blocks. Row 3: (7) 'beacon' a tall lantern with wide warm orange light rays; "
                     "(8) 'bounty' a tied brown leather pouch with a gold nugget peeking out (no coins); (9) 'ranch' a small wooden "
                     "fence pen with a fluffy sheep. " + ICON_TAIL,
    "icons_evo_res": "A grid of 7 game icons in the same pixel style. Row 1, four evolved ultimate skill icons with a richer glow: (1) "
                     "'arrow storm' many arrows raining down diagonally; (2) 'inferno' a towering orange-red fire column; (3) "
                     "'tempest' a dark storm cloud with several lightning bolts; (4) 'winter' a large pale cyan ice crystal "
                     "snowflake. Row 2, three resource icons: (5) a shiny lumpy gold ore nugget (NOT a coin); (6) 'population' a small "
                     "friendly villager head-and-shoulders silhouette in teal; (7) 'watch level' a bright amber five-pointed star with "
                     "a teal outline glow. " + ICON_TAIL,
})

def prompt(name):
    return STYLE_LOCK + "\n\n" + BODIES[name]

if __name__ == "__main__":
    out = Path(__file__).resolve().parents[1] / "prompts"
    out.mkdir(exist_ok=True)
    names = [n for n in sys.argv[1:] if not n.startswith("--")] or list(BODIES)
    if "--json" in sys.argv:
        print(json.dumps({"names": names, "prompts": [prompt(n) for n in names]}, ensure_ascii=False))
    else:
        for n in names:
            (out / f"{n}.txt").write_text(prompt(n) + "\n", encoding="utf-8")
        print(f"wrote {len(names)} prompts to {out}")
