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

TOWER = ("Each tower is a slim round stone watchtower with a pointed roof cradle holding a large glowing crystal on top, wooden door "
         "at the base, about 36x44 art pixels, 3/4 top-down view, front facing the viewer, each art pixel a big visible square. Same "
         "tower shape for all, only the crystal colour and decoration change. Evenly spaced with wide empty gaps, nothing touching.")
BODIES.update({
    # batch 2 (2026-11-18): towers, skeleton ally, poison/aura/summon fx, missing card icons
    "bld_towers": "Four towers side by side left to right: (1) 'arcane tower' plain grey stone with a violet crystal; (2) 'frost tower' "
                  "an icy pale-blue crystal, frost and icicles on the stones; (3) 'banner tower' a warm gold-orange crystal and a teal "
                  "war banner hanging on the side; (4) 'bone tower' a pale bone-ivory crystal, decorated with animal bones and ribs "
                  "around the roof (no skulls, no religious symbols). " + TOWER,
    "bld_tower_poison": "One tower: 'poison tower' with a sickly toxic green crystal, dripping dark vines on the stones and a small "
                        "bubbling green cauldron glow at the base (no skulls). " + TOWER,
    "unit_skeleton": chr_sheet("Ally unit 'skeleton': a small friendly summoned bone soldier, pale ivory-grey bones (not pure white), "
                               "dark indigo outline, tiny glowing teal eyes, holding a short sword and a small round wooden buckler.",
                               ALLY_ROWS + "; the attack row is a sword slash", 16, 18),
    "fx_new": "An effects sprite sheet, 3 rows x 4 frames, every frame separate with wide empty gaps, each frame about 16x16 art "
              "pixels, each art pixel a big visible square, frames left to right are an animation: row 1 poison cloud (a toxic green "
              "bubbling gas cloud puffing up, peaking, bubbles popping, fading); row 2 aura pulse (a warm golden-orange flat ground ring "
              "seen from above at 3/4, expanding and fading, a plain ring, not a halo, not a coin); row 3 summon dust (pale bone-grey "
              "dust and small bone fragments rising from the ground in a swirl, growing then dissipating).",
    "icons_new_a": "A 3x2 grid of 6 game icons in the same pixel style. Row 1: (1) 'tower' a slim stone watchtower with a glowing violet "
                   "crystal on top; (2) 'arcane range' a violet crystal with concentric range rings expanding outward; (3) 'arcane power' "
                   "a violet crystal with a bright burst of energy. Row 2: (4) 'arcane haste' a violet crystal with speed lines and a "
                   "small arrow-shaped spark; (5) 'artisan' a crossed hammer and chisel over a stone block; (6) 'longbow' a tall wooden "
                   "longbow with a drawn arrow. " + ICON_TAIL,
    "icons_new_b": "A grid of 5 game icons in the same pixel style. Row 1: (1) 'sturdy' a thick steel breastplate armour; (2) 'charge' a "
                   "soldier's round shield and spear thrusting forward with motion lines; (3) 'cleave' a broad axe with a wide orange "
                   "sweeping slash arc. Row 2: (4) 'chant' a small warm lantern sending out curved sound waves and musical notes (no "
                   "religious symbols); (5) 'blessing' a warm teal-and-gold sparkle burst over an open hand with a small rising "
                   "heart-shaped light (no halo, no religious symbols). " + ICON_TAIL,
})
MAGENTA = {"bld_tower_poison", "fx_new"}   # green subjects: key on magenta instead of the default green


# ---------------------------------------------------------------- batch 3 (2026-11-18): scene themes, pads, unlockable units, meta icons
def tile(desc):
    return ("A seamless tileable top-down texture of " + desc + ", evenly distributed with no focal point, no objects, low contrast "
            "so sprites read on top of it. Fill the whole square canvas edge to edge (no chroma-key background for this one). Chunky "
            "pixel art, about 64x64 art pixels across the whole image. Dusky evening light so it matches a lantern-lit night set, but "
            "keep the theme colours clearly recognisable.")


THEMES = {
    "plains": ("a green meadow with short grass tufts and a few tiny pebbles", "a worn dirt road through a meadow, packed brown earth with small stones"),
    "desert": ("warm golden desert sand with soft wind ripples and a few tiny pebbles", "a packed darker sand trail with small stones and wheel ruts"),
    "highland": ("rocky alpine grass, muted green tufts broken by small grey stone patches", "a grey gravel mountain path with small loose stones"),
    "spring": ("fresh bright green grass with tiny pale pink and cream flower specks", "a light tan earth path with a few small pebbles"),
    "autumn": ("forest floor covered in orange, red and brown fallen leaf litter", "a dark brown earth path with a few scattered orange leaves"),
    "winter": ("snow-covered ground with soft bluish shading and small drifts, light grey-blue, NOT pure white", "a trampled snow-and-mud path, grey-brown slush with footprints"),
}
for t, (g, p) in THEMES.items():
    BODIES[f"tile_ground_{t}"] = tile(g)
    BODIES[f"tile_path_{t}"] = tile(p)

PROP = "each object separate with wide empty gaps, 3/4 top-down view, each art pixel a big visible square, feet at the bottom."
BODIES.update({
    "props_dry": "A props sheet for three scene themes, " + PROP + " Row 1 desert: (1) a tall saguaro cactus with two arms, about 16x28; "
                 "(2) a short round barrel cactus, about 14x14; (3) a dry tumbleweed-like desert bush, about 16x12; (4) a weathered "
                 "sandstone rock, about 20x14. Row 2 highland: (5) a jagged grey mountain crag rock, about 24x22; (6) a smaller crag rock, "
                 "about 18x16; (7) a slim alpine pine tree, about 18x30. Row 3 plains: (8) a round leafy green bush, about 18x14; (9) a "
                 "golden haystack, about 22x18. No skulls.",
    "props_season": "A props sheet for three scene themes, " + PROP + " Row 1 spring: (1) a blossom tree with a pale pink and cream "
                    "flower canopy and brown trunk, about 24x30; (2) a small patch of white and pale pink flowers with dark teal leaves, "
                    "about 16x10. Row 2 autumn: (3) a maple tree with an orange-red canopy, about 24x30; (4) a second, smaller maple tree "
                    "with a golden-orange canopy, about 20x26; (5) a pile of orange and brown fallen leaves, about 18x10. Row 3 winter: (6) "
                    "a dark teal pine tree heavily covered in snow, about 20x30; (7) a second, smaller snowy pine, about 16x24; (8) a grey "
                    "rock with a cap of snow, about 18x14. Snow is light grey-blue, never pure white.",
    "pads": "Two build-site foundations seen from a 3/4 top-down view, side by side with wide empty gaps, each about 36x28 art pixels, "
            "each art pixel a big visible square, flat on the ground (low, not buildings): (1) a square grey stone foundation slab with "
            "a small wooden hammer and a tiny teal flag marker on it; (2) a round arcane stone plinth with faint glowing violet abstract "
            "geometric rune lines carved into it (simple lines and dots, no religious symbols, no letters).",
    "unit_spearman": chr_sheet("Ally unit 'spearman': a lean soldier in light leather and teal cloth armour with a small open steel cap, "
                               "holding a long wooden spear.", ALLY_ROWS + "; the attack row is a forward spear thrust", 16, 18),
    "unit_crossbow": chr_sheet("Ally unit 'crossbowman': a stocky soldier in a round steel helmet and brown padded jacket with teal trim, "
                               "holding a heavy wooden crossbow.", ALLY_ROWS + "; the attack row aims and fires the crossbow (no bolt flying away)", 16, 18),
    "unit_knight": chr_sheet("Ally unit 'knight' on foot (no horse): a sturdy knight in steel plate armour with a teal surcoat, closed "
                             "helmet with a small orange plume, holding a sword and a kite shield.", ALLY_ROWS + "; the attack row is a sword swing", 16, 18),
    "icons_talents_a": "A 3x3 grid of 9 game talent icons in the same pixel style. Row 1: (1) 'walls' a grey stone wall with a small "
                       "upward teal arrow; (2) 'castle' a small stone keep with a glowing lantern on top; (3) 'repair' a hammer crossed "
                       "with a trowel over a cracked stone. Row 2: (4) 'palisade' a row of sharpened wooden stakes; (5) 'gold' a small "
                       "pile of shiny gold ore nuggets (NOT coins); (6) 'train' a straw training dummy on a post. Row 3: (7) 'veteran' a "
                       "teal shoulder badge with three gold chevron stripes; (8) 'horn' a curved brown war horn with a brass rim; (9) "
                       "'reroll' a playing card with two circular arrows around it. " + ICON_TAIL,
    "icons_meta": "A 4x2 grid of 8 game icons in the same pixel style. Row 1: (1) 'ignore' a card with a red diagonal strike line; "
                  "(2) 'lock' a brass padlock; (3) 'bounty' a brown leather pouch with a gold nugget and a small plus sparkle (no coins); "
                  "(4) 'diamond' a faceted cut blue gemstone (NOT a coin). Row 2: (5) 'talent' a small glowing teal skill tree of three "
                  "linked nodes; (6) 'achievement' a ribbon medal with a teal ribbon and a gold star disc (no religious symbol); (7) "
                  "'campaign' two crossed swords; (8) 'loadout' three small soldier helmets side by side. " + ICON_TAIL,
    "icons_portraits": "A 3x2 grid of 6 head-and-shoulders unit portrait icons in the same pixel style, each facing slightly right: Row "
                       "1: (1) an archer in a teal hood; (2) a shield soldier in a rounded steel helmet holding a round wooden shield "
                       "edge; (3) a gentle healer in a teal hooded robe with a small glowing lantern. Row 2: (4) a spearman with a small "
                       "open steel cap and a spear tip; (5) a crossbowman in a round steel helmet with the crossbow stock; (6) a knight in "
                       "a closed steel helmet with a small orange plume. " + ICON_TAIL,
})
MAGENTA |= {"props_dry"}
# key art (2026-11-18): home-screen cover, shipped at 270x200 native
BODIES["key_cover"] = ("Title cover key art, one full illustrated scene filling the whole landscape canvas edge to edge (no chroma-key "
                       "background for this one), wide 4:3 framing, chunky pixel art at about 270x200 art pixels across the whole image. "
                       "A stone castle keep with a big glowing brass lantern on its top stands on a low hill in the centre, ringed by "
                       "wooden palisade and stone wall segments; a few tiny archers and a shield soldier stand on the walls. From the "
                       "dark forest edges at the left, right and bottom, purple shadow creatures (small rats, beetles, a wolf) swarm in "
                       "along winding dirt paths, and the huge silhouette of a shadow beast with a giant toothy maw and many small "
                       "glowing lilac eyes looms in the lower-right forest. Warm orange lamp light pools around the castle against a "
                       "cool deep-indigo dusk-to-night; a sense of an imminent siege. The top 20% of the image is a calm, simple indigo "
                       "sky with a few faint stars and soft clouds, empty enough for a title to sit on. No text, no logo, no letters, no "
                       "skulls, no coins, no religious symbols.")
# batch 3 retakes: t1 achievement read as a gold disc (coin risk); t1 reroll lost its arrows at 24 px
BODIES["icon_achievement_v2"] = ("One single game icon, large and centered: 'achievement' a teal ribbon rosette badge with pleated teal "
                                 "petals, two ribbon tails hanging below, and a small amber five-pointed star in the middle. NOT a "
                                 "coin, no round gold disc, no religious symbol. " + ICON_TAIL)
BODIES["icon_reroll_v2"] = ("One single game icon, large and centered: 'reroll' two thick bright teal curved arrows chasing each other "
                            "in a circle around a small cream playing card. Bold, simple, readable at tiny size. " + ICON_TAIL)


# batch 4 (2026-11-18): trait-card icons that had no art (the other trait cards reuse existing icons, see main.js TRAIT_ICON)
BODIES["icons_traits"] = ("A 3x3 grid of 9 game skill icons in the same pixel style. Row 1: (1) 'heavy bow' a thick recurve wooden bow "
                          "with a big glowing orange arrowhead; (2) 'heavy blow' a steel war hammer striking down with an orange impact "
                          "spark; (3) 'group heal' three small warm lanterns in a row linked by soft teal light ribbons (no religious "
                          "symbols). Row 2: (4) 'vitality' a sturdy brown leather vest with a bright teal plus sign on the chest; (5) "
                          "'sledgehammer' a big iron sledgehammer with a wooden handle; (6) 'swift feet' a brown leather boot with three "
                          "teal motion lines behind it. Row 3: (7) 'bone pact' two crossed pale bones wrapped in a violet glow (no skull); "
                          "(8) 'attack' a steel sword pointing up with a small orange upward arrow beside it; (9) 'attack speed' a steel "
                          "sword with three teal speed streaks. " + ICON_TAIL)


# batch 5 (2026-11-18): four new enemies with their own mechanics (gdd/04 §9)
BODIES["foe_slime"] = chr_sheet("Enemy 'shadow slime': a round wobbly blob of translucent violet goo with a darker core, two glowing "
                                "lilac eyes and a bright lilac rim highlight on top.", "2 rows: row 1 hop cycle (4 frames: squash, "
                                "stretch up, airborne, land), row 2 attack (2 frames: rearing up tall, slapping forward flat)", 14, 12)
BODIES["foe_boar"] = chr_sheet("Enemy 'shadow boar': a stocky charging boar with dark violet bristly hide, two curved pale tusks, "
                               "glowing lilac eyes and a lilac rim light along the spine.", "2 rows: row 1 run cycle (4 frames), row 2 "
                               "charge attack (2 frames: head lowered, tusk ram forward with dust puff)", 20, 14)
BODIES["foe_shaman"] = chr_sheet("Enemy 'shroom shaman': a small hunched mushroom creature with a wide violet cap, a ragged lilac shawl "
                                 "and a crooked twig staff tipped with a glowing lilac orb (no skulls, no religious symbols).", "2 rows: row "
                                 "1 walk cycle (4 frames, shuffling), row 2 cast (2 frames: staff raised with the orb glowing bright, orb "
                                 "pulsing with small lilac sparkles)", 14, 18)
BODIES["foe_mole"] = chr_sheet("Enemy 'shadow mole': a chunky digging mole with dark violet fur, big pale claws, a pointed snout and "
                               "tiny glowing lilac eyes.", "2 rows: row 1 walk cycle above ground (4 frames, waddling), row 2 burrowed "
                               "(4 frames: a small mound of dark earth moving forward with soil clods kicked up, only the claws peeking "
                               "out in some frames)", 16, 12)


def prompt(name):
    lock = STYLE_LOCK.replace("pure green #00FF00", "pure magenta #FF00FF") if name in MAGENTA else STYLE_LOCK
    return lock + "\n\n" + BODIES[name]

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
