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


def job(raw):
    if raw in ORDER1: return f"{JOB1}#{ORDER1.index(raw)}"
    if raw in ORDER2: return f"{JOB2}#{ORDER2.index(raw)}"
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
    }
    for n, (zh, kw) in units.items():
        raw = [f"unit_{n}_t1"] if n != "priest" else ["unit_priest_v2_t2a"]
        A.append(entry(f"lanternhold.chr.{n}", "sprite-sheet", f"{zh}：idle 2、walk 4、attack 3（朝右，左向鏡像）", raw, "units",
                       anim_frames("units", n), kw + ["pixel", "像素", "night", "夜"],
                       prompt=[f"unit_{n}" if n != "priest" else "unit_priest_v2"],
                       jobref=f"{JOB3}#0" if n == "priest" else None))
    A.append({**entry("lanternhold.ref.priest.t1", "reference", "治療者 t1（米色長袍，縮到 18 px 變雜訊，未採用）", ["unit_priest_t1"], "units", [],
                      ["healer", "priest", "rejected"], status="rejected-take", reuse="game-only"),
              "files": {"raw": ["art/raw/unit_priest_t1.png"], "prompt": ["art/prompts/unit_priest.txt"], "shipped": []}})
    A.append({**entry("lanternhold.ref.priest.t2b", "reference", "治療者 t2b（與 t2a 同 prompt，輪廓較糊，未採用）", ["unit_priest_v2_t2b"], "units", [],
                      ["healer", "priest", "rejected"], status="rejected-take", reuse="game-only", jobref=f"{JOB3}#1"),
              "files": {"raw": ["art/raw/unit_priest_v2_t2b.png"], "prompt": ["art/prompts/unit_priest_v2.txt"], "shipped": []}})
    foes = {
        "rat": ("foe_rat", "影鼠：walk 4", ["rat", "mouse", "swarm", "鼠", "小怪"]),
        "beetle": ("foe_beetle", "甲蟲：walk 4", ["beetle", "bug", "armored", "甲蟲", "蟲"]),
        "moth": ("foe_moth", "飛蛾（飛行）：fly 4", ["moth", "flying", "insect", "飛蛾", "飛行"]),
        "shroom": ("foe_shroom", "爆菇：walk 4、swell 2（膨脹待爆）", ["mushroom", "shroom", "exploder", "bomb", "蘑菇", "自爆"]),
        "snail": ("foe_snail", "攻城蝸牛：walk 4、attack 2", ["snail", "siege", "slow", "tank", "蝸牛", "攻城"]),
        "wolf": ("foe_wolf", "鐵甲狼（精英）：walk 4、attack 2", ["wolf", "elite", "armored", "fast", "狼", "精英"]),
        "shadowArcher": ("foe_shadow_archer", "暗影弓手（遠程、射牆）：walk 4、attack 2", ["goblin", "archer", "ranged", "shooter", "哥布林", "弓手", "遠程"]),
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
    A.append(entry("lanternhold.fx.bursts", "fx-sheet", "爆炸／冰爆／火焰／蒸汽 各 4 格", ["fx_bursts_t1"], "fx",
                   anim_frames("fx", "explosion") + anim_frames("fx", "frost") + anim_frames("fx", "fire") + anim_frames("fx", "steam"),
                   ["explosion", "frost", "ice", "fire", "flame", "steam", "smoke", "爆炸", "冰", "火", "蒸汽", "特效"]))
    A.append(entry("lanternhold.fx.misc", "fx-sheet", "箭、主城光束、閃電段、打擊火花 3、升級閃光 4、金塊、寶箱開／關（螢火）", ["fx_misc_t1"], "fx",
                   ["arrow", "beam", "bolt", *anim_frames("fx", "spark"), *anim_frames("fx", "sparkle"), "nugget", "chest_closed", "chest_open"],
                   ["arrow", "beam", "laser", "lightning", "bolt", "spark", "hit", "sparkle", "level up", "gold nugget", "chest", "firefly",
                    "箭", "光束", "閃電", "火花", "升級", "金塊", "寶箱", "螢火蟲"]))
    A.append(entry("lanternhold.ui.icons", "ui", "卡片圖示 18、進化 4、資源 3（24×24）", ["icons_cards_a_t1", "icons_cards_b_t1", "icons_evo_res_t1"],
                   "icons", list(atlas("icons")["frames"]),
                   ["icon", "card", "skill", "upgrade", "evolution", "arrow", "fire", "frost", "thunder", "shield", "lantern", "pouch",
                    "gold nugget", "population", "star", "圖示", "卡片", "技能", "進化", "金塊", "人口", "星"],
                   prompt=["icons_cards_a", "icons_cards_b", "icons_evo_res"]))
    A.append(entry("lanternhold.bg.ground", "background", "夜林地表 tile 與道路 tile（64×64 無縫）", ["ground_forest_t1", "ground_path_t1"], "ground",
                   ["ground_forest", "ground_path"],
                   ["ground", "tile", "seamless", "grass", "forest floor", "path", "dirt", "road", "地表", "草地", "道路", "泥土", "無縫"],
                   extra_shipped=[P + "ground_forest.png", P + "ground_path.png"], prompt=["ground_forest", "ground_path"],
                   technical={"tile": [64, 64], "note": "standalone PNGs for TilingSprite; ground.png is the same two tiles as an atlas"}))
    pal = {"id": "lanternhold.ref.palette", "kind": "reference", "status": "shipped", "name": "像素組共用 32 色調色盤",
           "files": {"raw": [], "prompt": [], "shipped": [P + "palette.json"]},
           "technical": {"colors": 32, "outlineIndex": 0, "fixed": ["#1b1530", "#ffb64a", "#c6a8ff", "#6fd3c4", "#c4c8d6", "#848aa0", "#54586e"]},
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
