"""Write LanternHold/art/manifest.json for the pixel set (run after build.py, then: node shared/tools/index-build.mjs --update-hashes).

One entry per character / building group / fx group so the central index (knowledge-base/index/assets.json) can be searched by
keyword; several entries share the same atlas files, like TwinStrike's enemies.png.
"""
import json
from pathlib import Path

ART = Path(__file__).resolve().parents[1]
GAME = ART.parent
PIX = GAME / "game" / "src" / "assets" / "pixel"
P = "game/src/assets/pixel/"
STYLE = ["pixel", "night", "top-down-3/4", "1px-outline", "palette-32", "side-view-right"]
TOOLS = "art/tools/build.py（chroma key → BOX 縮圖 → 局部量化 → 共用 32 色 → 1 px 外框 → 打包）"
JOB1, JOB2, JOB3 = "job_20261118-120547_307", "job_20261118-120851_308", "job_20261118-121508_309"
ORDER1 = ["unit_worker", "unit_archer", "unit_shield", "unit_priest", "foe_rat", "foe_beetle", "foe_moth", "foe_shroom", "foe_snail",
          "foe_wolf", "foe_shadow_archer", "foe_boss_maw", "bld_castle", "bld_barracks", "wall_tiers", "props_forest", "fx_bursts",
          "fx_misc", "ground_forest", "ground_path"]
ORDER2 = ["icons_cards_a", "icons_cards_b", "icons_evo_res"]
JOB4 = "job_20261118-134634_310"   # batch 2: towers, skeleton, poison/aura/summon, missing card icons
THEMES = ["plains", "desert", "highland", "spring", "autumn", "winter"]
JOB5A, JOB5B, JOB6 = "job_20261118-140930_311", "job_20261118-141139_312", "job_20261118-141442_313"   # batch 3
ORDER5A = [f"tile_{k}_{t}" for t in THEMES for k in ("ground", "path")] + ["props_dry", "props_season", "pads"]
ORDER5B = ["unit_spearman", "unit_crossbow", "unit_knight", "icons_talents_a", "icons_meta", "icons_portraits"]
ORDER6 = ["icon_achievement_v2", "icon_reroll_v2"]
JOB7 = "job_20261118-150714_319"   # batch 4: trait-card icons (two takes; #0 used)
ORDER7 = ["icons_traits"]
JOB8 = "job_20261118-151138_320"   # batch 5: new foes
ORDER8 = ["foe_slime", "foe_boar", "foe_shaman", "foe_mole"]
ORDER4 = ["bld_towers", "bld_tower_poison", "unit_skeleton_t1a", "unit_skeleton_t1b", "fx_new", "icons_new_a", "icons_new_b"]


def job(raw):
    if raw in ORDER1: return f"{JOB1}#{ORDER1.index(raw)}"
    if raw in ORDER2: return f"{JOB2}#{ORDER2.index(raw)}"
    if raw in ORDER4: return f"{JOB4}#{ORDER4.index(raw)}"
    if raw in ORDER5A: return f"{JOB5A}#{ORDER5A.index(raw)}"
    if raw in ORDER5B: return f"{JOB5B}#{ORDER5B.index(raw)}"
    if raw in ORDER6: return f"{JOB6}#{ORDER6.index(raw)}"
    if raw in ORDER7: return f"{JOB7}#0"
    if raw in ORDER8: return f"{JOB8}#{ORDER8.index(raw)}"
    raise KeyError(raw)


def atlas(name):
    return json.loads((PIX / f"{name}.json").read_text(encoding="utf-8"))


def entry(id_, kind, name, raw, atlas_name, frames, keywords, extra_shipped=(), technical=None, note=None, prompt=None,
          jobref=None, status="shipped", reuse="reusable"):
    a = atlas(atlas_name)
    t = {"atlas": atlas_name, "format": "png8", "artPxToWorldPx": 2, "scaleMode": "nearest", "frames": frames}
    f0 = a["frames"].get(frames[0]) if frames else None
    if f0: t["cell"] = [f0["frame"]["w"], f0["frame"]["h"]]; t["anchor"] = [f0["anchor"]["x"], f0["anchor"]["y"]]
    t.update(technical or {})
    e = {"id": id_, "kind": kind, "status": status, "name": name,
         "files": {"raw": [f"art/raw/{r}.png" for r in raw],
                   "prompt": [f"art/prompts/{p}.txt" for p in (prompt or [r.rsplit('_t', 1)[0] for r in raw])],
                   "shipped": [P + f"{atlas_name}.png", P + f"{atlas_name}.json", *extra_shipped]},
         "technical": t, "styleTags": STYLE,
         "provenance": {"tool": "picanywhere", "job": jobref or job(raw[0].rsplit('_t', 1)[0]), "postprocess": TOOLS,
                        "promptBlock": "art/tools/prompts.py STYLE_LOCK"},
         "keywords": keywords, "reusePolicy": reuse, "contentHash": ""}
    if note: e["note"] = note
    return e


def anim_frames(a, base):
    return [n for k, v in atlas(a)["animations"].items() if k == base or k.startswith(base + "_") for n in v]


def main():
    A = []
    units = {
        "worker": ("工人（槌子）", ["worker", "builder", "villager", "hammer", "工人", "村民", "槌子", "ally", "友軍"]),
        "archer": ("弓箭手", ["archer", "bow", "ranger", "hood", "弓箭手", "弓", "ally", "友軍"]),
        "shield": ("盾兵", ["shield", "soldier", "knight", "tank", "盾兵", "士兵", "坦克", "ally", "友軍"]),
        "priest": ("治療者（提燈法杖，無宗教符號）", ["healer", "priest", "support", "lantern", "staff", "治療", "牧師", "提燈", "ally", "友軍"]),
        "skeleton": ("骷髏兵（友軍召喚物，短劍＋小盾）", ["skeleton", "bones", "undead", "summon", "minion", "sword", "骷髏", "召喚", "ally", "友軍"]),
        "spearman": ("長槍兵（輕甲）", ["spearman", "spear", "pike", "lancer", "長槍兵", "槍", "ally", "友軍"]),
        "crossbow": ("弩兵（重弩、頭盔）", ["crossbow", "crossbowman", "ranged", "弩兵", "弩", "ally", "友軍"]),
        "knight": ("騎士（步行，劍＋鳶形盾，無馬）", ["knight", "paladin", "armored", "sword", "kite shield", "騎士", "重甲", "ally", "友軍"]),
    }
    for n, (zh, kw) in units.items():
        raw = {"priest": ["unit_priest_v2_t2a"], "skeleton": ["unit_skeleton_t1a"]}.get(n, [f"unit_{n}_t1"])
        A.append(entry(f"lanternhold.chr.{n}", "sprite-sheet", f"{zh}：idle 2、walk 4、attack 3（朝右，左向鏡像）", raw, "units",
                       anim_frames("units", n), kw + ["pixel", "像素", "night", "夜"],
                       prompt=[f"unit_{n}" if n != "priest" else "unit_priest_v2"],
                       jobref={"priest": f"{JOB3}#0", "skeleton": job("unit_skeleton_t1a")}.get(n)))
    A.append({**entry("lanternhold.ref.priest.t1", "reference", "治療者 t1（米色長袍，縮到 18 px 變雜訊，未採用）", ["unit_priest_t1"], "units", [],
                      ["healer", "priest", "rejected"], status="rejected-take", reuse="game-only"),
              "files": {"raw": ["art/raw/unit_priest_t1.png"], "prompt": ["art/prompts/unit_priest.txt"], "shipped": []}})
    A.append({**entry("lanternhold.ref.priest.t2b", "reference", "治療者 t2b（與 t2a 同 prompt，輪廓較糊，未採用）", ["unit_priest_v2_t2b"], "units", [],
                      ["healer", "priest", "rejected"], status="rejected-take", reuse="game-only", jobref=f"{JOB3}#1"),
              "files": {"raw": ["art/raw/unit_priest_v2_t2b.png"], "prompt": ["art/prompts/unit_priest_v2.txt"], "shipped": []}})
    A.append({**entry("lanternhold.ref.skeleton.t1b", "reference", "骷髏兵 t1b（與 t1a 同 prompt，擇一，未採用）", ["unit_skeleton_t1b"], "units", [],
                      ["skeleton", "rejected"], status="rejected-take", reuse="game-only", jobref=job("unit_skeleton_t1b")),
              "files": {"raw": ["art/raw/unit_skeleton_t1b.png"], "prompt": ["art/prompts/unit_skeleton.txt"], "shipped": []}})
    foes = {
        "rat": ("foe_rat", "影鼠：walk 4", ["rat", "mouse", "swarm", "鼠", "小怪"]),
        "beetle": ("foe_beetle", "甲蟲：walk 4", ["beetle", "bug", "armored", "甲蟲", "蟲"]),
        "moth": ("foe_moth", "飛蛾（飛行）：fly 4", ["moth", "flying", "insect", "飛蛾", "飛行"]),
        "shroom": ("foe_shroom", "爆菇：walk 4、swell 2（膨脹待爆）", ["mushroom", "shroom", "exploder", "bomb", "蘑菇", "自爆"]),
        "snail": ("foe_snail", "攻城蝸牛：walk 4、attack 2", ["snail", "siege", "slow", "tank", "蝸牛", "攻城"]),
        "wolf": ("foe_wolf", "鐵甲狼（精英）：walk 4、attack 2", ["wolf", "elite", "armored", "fast", "狼", "精英"]),
        "shadowArcher": ("foe_shadow_archer", "暗影弓手（遠程、射牆）：walk 4、attack 2", ["goblin", "archer", "ranged", "shooter", "哥布林", "弓手", "遠程"]),
        "slime": ("foe_slime", "暗影史萊姆（死亡分裂成兩隻小的）：walk 4、attack 2", ["slime", "blob", "split", "史萊姆", "分裂"]),
        "boar": ("foe_boar", "暗影野豬（衝鋒、首擊三倍）：walk 4、attack 2", ["boar", "pig", "charge", "tusk", "野豬", "衝鋒"]),
        "shaman": ("foe_shaman", "巫菇（治療周圍的怪）：walk 4、attack 2（施法）", ["mushroom", "shaman", "healer", "caster", "staff", "巫菇", "治療", "施法"]),
        "mole": ("foe_mole", "暗影鼴鼠（鑽地穿牆）：walk 4、burrow 4（土堆）", ["mole", "burrow", "dig", "tunnel", "鼴鼠", "鑽地", "土堆"]),
        "boss": ("foe_boss_maw", "Boss 永夜之喉：walk 4、attack 3（第 3 格含吐霧）", ["boss", "maw", "mouth", "giant", "beast", "頭目", "巨口", "永夜之喉"]),
    }
    for n, (raw, zh, kw) in foes.items():
        A.append(entry(f"lanternhold.foe.{n}", "sprite-sheet", zh, [f"{raw}_t1"], "foes", anim_frames("foes", n),
                       kw + ["enemy", "敵人", "shadow", "暗影", "violet", "紫", "pixel", "像素"]))
    b = atlas("buildings")["frames"]
    A.append(entry("lanternhold.bld.castle", "sprite-sheet", "主城（石塔＋頂燈）", ["bld_castle_t1"], "buildings", ["castle"],
                   ["castle", "keep", "tower", "lantern", "base", "主城", "城堡", "塔", "燈"]))
    A.append(entry("lanternhold.bld.barracks", "sprite-sheet", "軍營 Lv1–3（帳篷 → 木屋 → 石屋）", ["bld_barracks_t1"], "buildings",
                   ["barracks_1", "barracks_2", "barracks_3"], ["barracks", "tent", "hall", "upgrade", "level", "軍營", "帳篷", "升級"]))
    A.append(entry("lanternhold.bld.walls", "sprite-sheet", "城牆三級 × 完好／龜裂／殘破（水平繪製，程式旋轉）", ["wall_tiers_t1"], "buildings",
                   [n for n in b if n.startswith("wall_")], ["wall", "palisade", "stone wall", "iron", "damage", "cracked", "broken",
                                                              "城牆", "木柵", "石牆", "鐵牆", "破損"],
                   technical={"anchorNote": "center (0.5,0.5): rotate around the ring"}))
    A.append(entry("lanternhold.prop.forest", "sprite-sheet", "夜林道具：3 種樹、2 顆石頭、瓦礫、2 支燈柱", ["props_forest_t1"], "buildings",
                   ["tree_pine", "tree_oak", "tree_dead", "rock_0", "rock_1", "rubble", "lamppost_0", "lamppost_1"],
                   ["tree", "pine", "oak", "dead tree", "rock", "rubble", "lamppost", "lantern", "prop", "樹", "石頭", "瓦礫", "燈柱", "道具", "forest", "森林"],
                   technical={"anchorNote": "feet bottom-centre; rubble centre"}))
    A.append(entry("lanternhold.bld.towers", "sprite-sheet", "法術塔 5 種（基本紫晶／冰晶／毒綠晶＋藤蔓／戰旗金晶／骨飾白晶）",
                   ["bld_towers_t1", "bld_tower_poison_t1"], "buildings",
                   ["tower_basic", "tower_frost", "tower_poison", "tower_banner", "tower_bone"],
                   ["tower", "mage tower", "arcane", "crystal", "frost", "poison", "banner", "bone", "塔", "法術塔", "水晶", "冰", "毒", "戰旗", "骨"],
                   prompt=["bld_towers", "bld_tower_poison"],
                   note="tower_poison 在洋紅底單獨生成（主體是綠色），縮放到與其他塔同高"))
    A.append(entry("lanternhold.fx.status", "fx-sheet", "毒雲、光環脈衝、召喚骨塵 各 4 格（洋紅底生成）", ["fx_new_t1"], "fx",
                   anim_frames("fx", "poison") + anim_frames("fx", "aura") + anim_frames("fx", "summon"),
                   ["poison", "toxic", "gas", "aura", "ring", "pulse", "buff", "summon", "dust", "bones", "毒", "毒雲", "光環", "增益", "召喚", "骨塵", "特效"]))
    A.append(entry("lanternhold.fx.bursts", "fx-sheet", "爆炸／冰爆／火焰／蒸汽 各 4 格", ["fx_bursts_t1"], "fx",
                   anim_frames("fx", "explosion") + anim_frames("fx", "frost") + anim_frames("fx", "fire") + anim_frames("fx", "steam"),
                   ["explosion", "frost", "ice", "fire", "flame", "steam", "smoke", "爆炸", "冰", "火", "蒸汽", "特效"]))
    A.append(entry("lanternhold.fx.misc", "fx-sheet", "箭、主城光束、閃電段、打擊火花 3、升級閃光 4、金塊、寶箱開／關（螢火）", ["fx_misc_t1"], "fx",
                   ["arrow", "beam", "bolt", *anim_frames("fx", "spark"), *anim_frames("fx", "sparkle"), "nugget", "chest_closed", "chest_open"],
                   ["arrow", "beam", "laser", "lightning", "bolt", "spark", "hit", "sparkle", "level up", "gold nugget", "chest", "firefly",
                    "箭", "光束", "閃電", "火花", "升級", "金塊", "寶箱", "螢火蟲"]))
    A.append(entry("lanternhold.ui.icons", "ui", "卡片圖示 25、進化 4、資源 3、塔 1（24×24）", ["icons_cards_a_t1", "icons_cards_b_t1", "icons_evo_res_t1", "icons_new_a_t1", "icons_new_b_t1"],
                   "icons", list(atlas("icons")["frames"]),
                   ["icon", "card", "skill", "upgrade", "evolution", "arrow", "fire", "frost", "thunder", "shield", "lantern", "pouch",
                    "gold nugget", "population", "star", "圖示", "卡片", "技能", "進化", "金塊", "人口", "星"],
                   prompt=["icons_cards_a", "icons_cards_b", "icons_evo_res", "icons_new_a", "icons_new_b"]))
    A.append(entry("lanternhold.bg.ground", "background", "夜林地表 tile 與道路 tile（64×64 無縫）", ["ground_forest_t1", "ground_path_t1"], "ground",
                   ["ground_forest", "ground_path"],
                   ["ground", "tile", "seamless", "grass", "forest floor", "path", "dirt", "road", "地表", "草地", "道路", "泥土", "無縫"],
                   extra_shipped=[P + "ground_forest.png", P + "ground_path.png"], prompt=["ground_forest", "ground_path"],
                   technical={"tile": [64, 64], "note": "standalone PNGs for TilingSprite; ground.png is the same two tiles as an atlas"}))
    bf = atlas("buildings")["frames"]
    A.append(entry("lanternhold.prop.themes", "sprite-sheet", "場景主題道具：沙漠／高地／平原／春／秋／冬（腳底錨點）",
                   ["props_dry_t1", "props_season_t1"], "buildings",
                   ["cactus_0", "cactus_1", "dry_bush", "desert_rock", "crag_0", "crag_1", "alpine_pine", "bush_0", "haystack",
                    "blossom_tree", "flower_patch", "maple_tree", "maple_tree_1", "leaf_pile", "snow_pine", "snow_pine_1", "snow_rock"],
                   ["cactus", "desert", "rock", "crag", "mountain", "pine", "bush", "haystack", "blossom", "cherry", "flower", "maple",
                    "autumn", "leaves", "snow", "winter", "仙人掌", "沙漠", "岩石", "高地", "灌木", "乾草堆", "花樹", "花叢", "楓樹", "落葉",
                    "雪松", "雪", "prop", "道具"], prompt=["props_dry", "props_season"],
                   note="props_dry 在洋紅底生成（綠色植物）"))
    A.append(entry("lanternhold.bld.pads", "sprite-sheet", "建造地基：方形石基（軍營）、圓形符文台（法術塔），各附 _selected 燈橘描邊版",
                   ["pads_t1"], "buildings", ["pad_inner", "pad_outer", "pad_inner_selected", "pad_outer_selected"],
                   ["build pad", "foundation", "plinth", "slot", "selected", "highlight", "rune", "地基", "建造點", "選取", "符文"],
                   technical={"anchorNote": "center (0.5,0.5); _selected = same art with a 2 px #ffb64a rim generated in build.py"}))
    meta = ["t_walls", "t_castle", "t_repair", "t_palisade", "t_gold", "t_train", "t_veteran", "t_horn", "t_reroll", "t_ignore", "t_lock",
            "t_bounty", "diamond", "talent", "achievement", "campaign", "loadout",
            "u_archer", "u_shield", "u_priest", "u_spearman", "u_crossbow", "u_knight"]
    A.append(entry("lanternhold.ui.meta-icons", "ui", "外圍介面圖示：天賦 12、鑽石、天賦、成就、戰役、配置、兵種頭像 6（24×24）",
                   ["icons_talents_a_t1", "icons_meta_t1", "icons_portraits_t1", "icon_achievement_v2_t1", "icon_reroll_v2_t1"], "icons",
                   [f"icon_{n}" for n in meta],
                   ["icon", "talent", "meta", "diamond", "gem", "achievement", "medal", "campaign", "loadout", "portrait", "avatar",
                    "padlock", "reroll", "天賦", "鑽石", "寶石", "成就", "戰役", "配置", "頭像", "鎖", "重抽"],
                   prompt=["icons_talents_a", "icons_meta", "icons_portraits", "icon_achievement_v2", "icon_reroll_v2"],
                   note="icon_achievement、icon_t_reroll 用單張重生版（第一版成就像金幣、重抽箭頭在 24 px 消失）"))
    traits = ["heavyBow", "heavyBlow", "groupHeal", "vitality", "sledge", "swiftFeet", "bonePact", "atkUp", "atkSpeed"]
    A.append(entry("lanternhold.ui.trait-icons", "ui", "兵種特性卡圖示：強弓、重擊、群療、體魄、鐵鎚、快腳、亡骨契約、攻擊、攻速（24×24）",
                   ["icons_traits_t1"], "icons", [f"icon_{n}" for n in traits],
                   ["icon", "trait", "card", "bow", "hammer", "heal", "lantern", "vest", "boot", "bones", "sword", "attack", "speed",
                    "特性", "卡片", "強弓", "重擊", "群療", "體魄", "快腳", "攻擊", "攻速"],
                   prompt=["icons_traits"], note="其他特性卡沿用既有卡片／天賦圖示（main.js TRAIT_ICON）"))
    tiles = [f"{k}_{t}" for t in THEMES for k in ("ground", "path")]
    A.append({"id": "lanternhold.bg.themes", "kind": "background", "status": "shipped",
              "name": "場景主題地表：平原／沙漠／高地／春／秋／冬 各一張地面＋一張道路（64×64 無縫）",
              "files": {"raw": [f"art/raw/tile_{t.split('_')[0]}_{t.split('_')[1]}_t1.png" for t in tiles],
                        "prompt": [f"art/prompts/tile_{t.split('_')[0]}_{t.split('_')[1]}.txt" for t in tiles],
                        "shipped": [P + f"{t}.png" for t in tiles]},
              "technical": {"tile": [64, 64], "format": "png8", "palette": "16 colours per tile (own palette, not the sprite palette)",
                            "artPxToWorldPx": 2, "scaleMode": "nearest", "use": "TilingSprite"},
              "styleTags": STYLE, "provenance": {"tool": "picanywhere", "job": f"{JOB5A}#0-11", "postprocess": "art/tools/build.py theme_tile（BOX 64×64 → 交疊淡化無縫 → 16 色）"},
              "keywords": ["ground", "tile", "seamless", "path", "road", "meadow", "grass", "desert", "sand", "highland", "gravel", "spring",
                           "flowers", "autumn", "leaves", "winter", "snow", "地表", "道路", "草地", "沙漠", "高地", "春", "秋", "冬", "雪", "無縫"],
              "reusePolicy": "reusable", "contentHash": ""})
    A.append({"id": "lanternhold.keyart.cover", "kind": "key-art", "status": "shipped",
              "name": "首頁封面：燈塔主城被暗影群圍城（像素，270×200）",
              "files": {"raw": ["art/raw/key_cover_t1b.png"], "prompt": ["art/prompts/key_cover.txt"], "shipped": [P + "cover.png"]},
              "technical": {"size": [270, 200], "format": "png8", "palette": "64 colours (own palette)", "alpha": "opaque",
                            "scaleMode": "nearest", "titleSafe": "top ~15% is sky; the keep's lantern rises into the top-centre"},
              "styleTags": STYLE, "provenance": {"tool": "picanywhere", "job": "job_20261118-141938_315#1",
                                                  "postprocess": "art/tools/build.py cover（裁 270:200 → BOX → 64 色）"},
              "keywords": ["key art", "cover", "title", "siege", "castle", "lantern", "night", "horde", "封面", "主視覺", "標題", "圍城", "主城", "燈塔"],
              "reusePolicy": "reusable", "contentHash": ""})
    A.append({"id": "lanternhold.ref.cover.t1a", "kind": "reference", "status": "rejected-take", "name": "封面 t1a（Boss 較清楚，但天空較雜，未採用）",
              "files": {"raw": ["art/raw/key_cover_t1a.png"], "prompt": ["art/prompts/key_cover.txt"], "shipped": []},
              "provenance": {"tool": "picanywhere", "job": "job_20261118-141938_315#0"},
              "keywords": ["key art", "cover", "rejected"], "reusePolicy": "game-only", "contentHash": ""})
    pal = {"id": "lanternhold.ref.palette", "kind": "reference", "status": "shipped", "name": "像素組共用 48 色調色盤",
           "files": {"raw": [], "prompt": [], "shipped": [P + "palette.json"]},
           "technical": {"colors": 48, "outlineIndex": 0, "fixed": ["#1b1530", "#ffb64a", "#c6a8ff", "#6fd3c4", "#c4c8d6", "#848aa0", "#54586e", "#96d654", "#4a8c3e", "#f2aac4", "#4e96e8"], "note": "48 colours since batch 3 (32 before)"},
           "styleTags": STYLE, "provenance": {"tool": "art/tools/build.py", "postprocess": "median cut + k-means over every frame, 7 fixed tokens, near-white entries capped at 236, near-black neutrals pulled to the outline indigo (no pure black/white)"},
           "keywords": ["palette", "調色盤", "colors", "night", "pixel"], "reusePolicy": "reusable", "contentHash": ""}
    A.append(pal)
    m = {"schemaVersion": 1, "game": "LanternHold", "pathBase": "LanternHold/",
         "about": "LanternHold 資產的唯一來源（knowledge-base/decisions/2026-10-21-kb-asset-architecture.md §5.3）。像素組由 art/tools/prompts.py → picanywhere → art/tools/build.py 產生，本檔由 art/tools/manifest.py 寫出；生成紀錄見 art/raw/LOG.md。reusable 項目：換題材可直接重用整個 atlas，或沿用 prompts.py 的 STYLE_LOCK 與 build.py 重生。",
         "assets": A}
    (ART / "manifest.json").write_text(json.dumps(m, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(len(A), "assets")


if __name__ == "__main__":
    main()
