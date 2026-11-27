"""Write BladeOath/art/manifest.json for the cutout set (run after build.py, then: node shared/tools/index-build.mjs --update-hashes).

One entry per character / prop group so the central index (knowledge-base/index/assets.json) can be searched by keyword;
every entry ships in the same atlas (actors.png / actors.json).
"""
import json
from pathlib import Path

ART = Path(__file__).resolve().parents[1]
P = "game/src/assets/pixel/"
SHIPPED = [P + "actors.png", P + "actors.json", P + "palette.json"]
STYLE = ["pixel", "ink-indigo", "dark-xianxia", "top-down-3/4", "1px-outline", "palette-32", "cutout-rig"]
TOOLS = "art/tools/build.py（chroma key → 第 2 列切件 → BOX 縮圖 → 局部量化 → 共用 32 色 → 1 px 外框 → 武器預轉 16 角 → 打包）"
JOB = "job_20261125-204617_322"

CHARS = [
    ("player", "chr_player", "玩家・劍客：頭／軀幹 正側背、直劍 16 角", ["swordsman", "jian", "player", "劍客"]),
    ("soldier", "chr_soldier", "屍兵：頭／軀幹 正側背、斷刀 16 角", ["undead", "corpse", "soldier", "saber", "屍兵"]),
    ("bug", "chr_bug", "蠱蟲：甲殼 正側背、口器 16 角（無頭、無手）", ["insect", "beetle", "gu", "蠱蟲"]),
    ("caster", "chr_caster", "蠱師：頭／軀幹 正側背、蠱杖 16 角", ["sorcerer", "gu", "staff", "jar", "蠱師"]),
    ("brute", "chr_brute", "屍傀力士：頭／軀幹 正側背、鐵錘 16 角", ["undead", "brute", "hammer", "chains", "力士"]),
    ("mother", "chr_mother", "蠱母（精英）：頭／軀幹 正側背、骨爪 16 角", ["elite", "gu", "matriarch", "claws", "蠱母"]),
    ("general", "chr_general", "屍傀將（中頭目）：頭／軀幹 正側背、偃月刀 16 角", ["boss", "undead", "general", "guandao", "屍傀將"]),
    ("fallen", "chr_fallen", "墮仙（終頭目）：頭／軀幹 正側背、長劍 16 角", ["boss", "fallen", "cultivator", "sword", "墮仙"]),
]


def frames(kind):
    out = [f"{kind}/torso_{v}" for v in ("front", "side", "back")]
    if kind != "bug": out = [f"{kind}/head_{v}" for v in ("front", "side", "back")] + out
    return out + [f"{kind}/weapon_{i:02d}" for i in range(16)]


def entry(id_, name, raw, prompt, fr, tags, kind):
    return {"id": id_, "kind": "sprite-sheet", "status": "shipped", "reusePolicy": "reusable", "name": name,
            "files": {"raw": [f"art/raw/{raw}_t1.png"], "prompt": [f"art/prompts/{prompt}.txt"], "shipped": SHIPPED},
            "technical": {"atlas": "actors", "format": "png8", "artPxToWorldPx": 1, "scaleMode": "nearest", "frames": fr,
                          "anchors": "per frame in actors.json（頭＝頸點、軀幹＝中心、武器＝握柄、道具＝底部中央）"},
            "provenance": {"generator": "picanywhere (gpt-image-2)", "job": JOB, "pipeline": TOOLS, "log": "art/raw/LOG.md"},
            "style": STYLE, "tags": tags, "reusable": "換題材時沿用 prompts.py 的 STYLE_LOCK、版面與 build.py 重生；骨架契約見 gdd/02 §2"}


def main():
    assets = [entry(f"bladeoath.chr.{k}", n, raw, raw, frames(k), t, "rig-parts") for k, raw, n, t in CHARS]
    assets.append(entry("bladeoath.prop.mound-chest", "劍塚（石堆＋斷劍＋石燈）、寶箱 關／開", "props", "props",
                        ["props/mound", "props/chest", "props/chest_open"], ["checkpoint", "sword", "chest", "劍塚", "寶箱"], "sprite"))
    # v5 cel set (art/tools/cel_prompts.py -> picanywhere -> art/tools/cel_build.py); replaces the pixel scenery
    C = "game/src/assets/cel/"
    CJOB = "job_20261127-084803_658（角色 12 姿勢 t2）；job_20261126-174921_609（場景、道具；角色 t1 已被 t2 取代）；job_20261126-175315_611（劍塚、寶箱）；cel_near_gate 由 Codex CLI 生成"
    CTOOLS = "art/tools/cel_build.py（去背與去溢色 → 先切上下兩列、再以每欄密度找 6 個身體中心切件 → 依待機高度統一縮放、腳底中央錨點 → 2 倍解析度打包 → 256 色含半透明）"
    CSTYLE = ["cel-shaded", "cartoon", "ink-indigo", "dark-xianxia", "side-scroller", "bold-outline"]
    CEL = [("player", "玩家・劍客", 40), ("soldier", "屍兵", 40), ("bug", "蠱蟲", 15), ("caster", "蠱師", 40), ("brute", "屍傀力士", 56),
           ("mother", "蠱母（精英）", 56), ("general", "屍傀將（中頭目）", 64), ("fallen", "墮仙（終頭目）", 66)]
    POSES = ["idle", "walk1", "walk2", "walk3", "walk4", "windup", "strike", "guard", "dodge", "hurt", "jump", "down"]
    for k, nm, h in CEL:
        assets.append({"id": f"bladeoath.cel.{k}", "kind": "sprite-sheet", "status": "shipped", "reusePolicy": "reusable",
                       "name": f"{nm}：賽璐璐 12 姿勢（待機、走路 4 格、起手、出招、格擋、閃避、受擊、跳、倒地）",
                       "files": {"raw": [f"art/raw/cel_chr_{k}_t2.png"], "prompt": [f"art/prompts/cel_chr_{k}.txt"], "shipped": [C + "actors.png", C + "actors.json"]},
                       "technical": {"atlas": "cel-actors", "format": "png-256-rgba", "textureResolution": 2, "scaleMode": "linear",
                                     "frames": [f"{k}/{p}" for p in POSES], "heightPx": h, "anchors": "腳底中央（底部五分之一的不透明像素重心）"},
                       "provenance": {"generator": "picanywhere (gpt-image-2)", "job": CJOB, "pipeline": CTOOLS, "log": "art/raw/LOG.md"},
                       "style": CSTYLE, "tags": [k, nm, "character", "pose-sheet"],
                       "reusable": "換角色時改 cel_prompts.py 的 CHARS 描述重生；12 姿勢順序與 render/cel.js 的 POSES／celPose 對應"})
    for sid, nm, tags in [("gate", "山門", ["mountain-pass", "cliff", "flagstone"]), ("forest", "蠱林", ["forest", "cocoon", "earth"]),
                          ("well", "枯井", ["village", "courtyard", "paving"]), ("hall", "屍傀將殿", ["fortress", "hall", "tile"]),
                          ("cloister", "殿後迴廊", ["corridor", "pillar", "plank"]), ("terrace", "墮仙台", ["terrace", "clouds", "slab"])]:
        assets.append({"id": f"bladeoath.cel.scene.{sid}", "kind": "background", "status": "shipped", "reusePolicy": "reusable",
                       "name": f"{nm}：賽璐璐遠景＋近景地面帶（橫向卷軸）",
                       "files": {"raw": [f"art/raw/cel_far_{sid}_t1.png", f"art/raw/cel_near_{sid}_t1.png"],
                                 "prompt": [f"art/prompts/cel_far_{sid}.txt", f"art/prompts/cel_near_{sid}.txt"],
                                 "shipped": [C + f"far_{sid}.png", C + f"near_{sid}.png"]},
                       "technical": {"format": "png8-128", "textureResolution": 2, "layers": {"far": "150 px 高、視差 0.45", "near": "154 px 高（牆 34＋地面 120）"}, "tiling": "mirror"},
                       "provenance": {"generator": "picanywhere (gpt-image-2) / Codex CLI", "job": CJOB, "pipeline": CTOOLS, "log": "art/raw/LOG.md"},
                       "style": CSTYLE + ["parallax"], "tags": tags + ["background", nm],
                       "reusable": "改 cel_prompts.py 的 SCENES 描述重生；NEAR_CUT 依新圖重量牆與地面的分界"})
    assets.append({"id": "bladeoath.cel.props", "kind": "sprite-sheet", "status": "shipped", "reusePolicy": "reusable",
                   "name": "賽璐璐道具：酒罈、木箱、石燈、斷碑、肉包、丹藥、鍛材、劍塚、寶箱（關／開）",
                   "files": {"raw": ["art/raw/cel_props_t1.png", "art/raw/cel_props2_t1.png"], "prompt": ["art/prompts/cel_props.txt"], "shipped": [C + "props.png", C + "props.json"]},
                   "technical": {"atlas": "cel-props", "format": "png-256-rgba", "textureResolution": 2,
                                 "frames": ["jar", "crate", "lamp", "stele", "bun", "pill", "ore", "mound", "chest", "chestOpen"], "anchors": "底部中央"},
                   "provenance": {"generator": "picanywhere (gpt-image-2)", "job": CJOB, "pipeline": CTOOLS, "log": "art/raw/LOG.md"},
                   "style": CSTYLE, "tags": ["jar", "crate", "lantern", "stele", "bun", "medicine", "ore", "mound", "chest", "breakable"],
                   "reusable": "沿用 cel_prompts.py 的 PROPS 描述與 cel_build.py 的切件"})
    m = {"schemaVersion": 1, "game": "BladeOath", "pathBase": "BladeOath/",
         "about": "BladeOath 資產的唯一來源（knowledge-base/decisions/2026-10-21-kb-asset-architecture.md §5.3）。分件剪紙由 art/tools/prompts.py → picanywhere → art/tools/build.py 產生，掛在 render/rig.js 的程式骨架上（gdd/02、gdd/12 §7）；本檔由 art/tools/manifest.py 寫出，生成紀錄見 art/raw/LOG.md。",
         "assets": assets}
    (ART / "manifest.json").write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(assets)} entries")


if __name__ == "__main__":
    main()
