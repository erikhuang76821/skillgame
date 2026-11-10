# 規則 ↔ 知識庫 ↔ 資產 索引（自動產生）

> 產生物，禁止手改：`node shared/tools/index-build.mjs`。規則來源 [rules.json](rules.json)，資產來源各款 `art/manifest.json` 與 `shared/recipes/`，知識卡來源各頁 front-matter，測試卡來源 `shared/tests/registry.json`；機器可讀版 [assets.json](assets.json)、[kb.json](kb.json)、[tests.json](tests.json)。

## 規則（27 條）

| 規則 | 等級 | 把關 | 測試卡 | 為什麼 | 怎麼做 |
|---|---|---|---|---|---|
| `RULE-BUNDLE-SIZE` | must | 程式 | `TEST-SIZE` | [04_tech-stack.md](../../knowledge-base/04_tech-stack.md) | [stack-and-budget.md](../../.claude/skills/lite-skillgame-stack/references/stack-and-budget.md) |
| `RULE-NO-RUNTIME-CDN` | must | 程式 | `TEST-SIZE` | [04_tech-stack.md](../../knowledge-base/04_tech-stack.md) | [SKILL.md](../../.claude/skills/lite-skillgame-stack/SKILL.md) |
| `RULE-DRAWCALL-2D` | must | 人工審查 | `TEST-DRAWCALL-REVIEW` | [04_tech-stack.md](../../knowledge-base/04_tech-stack.md) | [drawcalls-assets.md](../../.claude/skills/lite-skillgame-stack/references/drawcalls-assets.md) |
| `RULE-DRAWCALL-3D` | must | 人工審查 | `TEST-DRAWCALL-REVIEW` | [04_tech-stack.md](../../knowledge-base/04_tech-stack.md) | [drawcalls-assets.md](../../.claude/skills/lite-skillgame-stack/references/drawcalls-assets.md) |
| `RULE-SIM-PURITY` | must | 程式 | `TEST-AUDIT` | [01_skill-integrity.md](../../knowledge-base/01_skill-integrity.md) | [SKILL.md](../../.claude/skills/lite-skillgame-stack/SKILL.md) |
| `RULE-SKILL-DOMINANCE` | must | 程式 | `TEST-SKILL-DOMINANCE` | [01_skill-integrity.md](../../knowledge-base/01_skill-integrity.md) | [12_genre-recipes.md](../../knowledge-base/12_genre-recipes.md) |
| `RULE-CURVE-TREND` | must | 程式 | `TEST-CURVE` | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) |
| `RULE-CURVE-LINEARITY` | must | 程式 | `TEST-CURVE` | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) |
| `RULE-CURVE-PEAKS` | must | 程式 | `TEST-CURVE` | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) |
| `RULE-CURVE-CLIFF` | must | 程式 | `TEST-CURVE` | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) |
| `RULE-CURVE-FLOW` | must | 程式 | `TEST-CURVE` | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) |
| `RULE-CURVE-BEATGRID` | must | 程式 | `TEST-CURVE` | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) | [12_genre-recipes.md](../../knowledge-base/12_genre-recipes.md) |
| `RULE-CURVE-PHRASE` | must | 程式 | `TEST-CURVE` | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) |
| `RULE-FX-FILTER` | should | 人工審查 | `TEST-FX-FILTER-REVIEW` | [05_juice-and-feel.md](../../knowledge-base/05_juice-and-feel.md) | [juice.md](../../.claude/skills/lite-skillgame-stack/references/juice.md) |
| `RULE-LEGAL-EXCLUDE-CHANCE` | should | 人工審查 | `TEST-LEGAL-EXCLUDE-REVIEW` | [02_market-and-legal.md](../../knowledge-base/02_market-and-legal.md) | [01_skill-integrity.md](../../knowledge-base/01_skill-integrity.md) |
| `RULE-ART-TW-TABOO` | must | 人工審查 | `TEST-ART-TABOO-REVIEW` | [tw-themes.md](../../SwarmDuel/knowledge/themes/tw-themes.md) | [02_art_spec.md](../../TwinStrike/gdd/02_art_spec.md) |
| `RULE-GAME-DOCS` | must | 程式 | `TEST-AUDIT` | [08_production-workflow.md](../../knowledge-base/08_production-workflow.md) | [bootstrap.md](../../.claude/skills/lite-skillgame-stack/references/bootstrap.md) |
| `RULE-GAME-REPORTS` | must | 程式 | `TEST-AUDIT` | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) | [playtest.mjs](../../.claude/skills/lite-skillgame-stack/templates/tools/playtest.mjs) |
| `RULE-AF-ADAPTATION` | must | 程式 | `TEST-AUDIT` | [16_ad-funnel-games.md](../../knowledge-base/16_ad-funnel-games.md) | [_TEMPLATE_spec.md](../../knowledge-base/ad-funnel/_TEMPLATE_spec.md) |
| `RULE-TEMPLATE-LEFTOVER` | should | 程式 | `TEST-AUDIT` | [05_juice-and-feel.md](../../knowledge-base/05_juice-and-feel.md) | [bootstrap.md](../../.claude/skills/lite-skillgame-stack/references/bootstrap.md) |
| `RULE-REPORT-FRESH` | must | 程式 | `TEST-AUDIT` | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) | [dominance.mjs](../../.claude/skills/lite-skillgame-stack/templates/tools/lib/dominance.mjs) |
| `RULE-SPEC-CONSTANTS` | must | 程式 | `TEST-AUDIT` | [game-spec-template.md](../../.claude/skills/lite-skillgame-stack/references/game-spec-template.md) | [08_production-workflow.md](../../knowledge-base/08_production-workflow.md) |
| `RULE-SPEC-FAIRNESS` | must | 程式 | `TEST-AUDIT` | [01_skill-integrity.md](../../knowledge-base/01_skill-integrity.md) | [game-spec-template.md](../../.claude/skills/lite-skillgame-stack/references/game-spec-template.md) |
| `RULE-KB-CITED` | should | 程式 | `TEST-AUDIT` | [README.md](../../knowledge-base/README.md) | [bootstrap.md](../../.claude/skills/lite-skillgame-stack/references/bootstrap.md) |
| `RULE-ASSET-REGISTER` | should | 程式 | `TEST-AUDIT` | [2026-10-21-kb-asset-architecture.md](../../knowledge-base/decisions/2026-10-21-kb-asset-architecture.md) | [10_asset-library.md](../../knowledge-base/10_asset-library.md) |
| `RULE-KB-CARDS` | must | 程式 | `TEST-INDEX` | [2026-11-10-libraries-and-loop.md](../../knowledge-base/decisions/2026-11-10-libraries-and-loop.md) | [2026-11-10-libraries-and-loop.md](../../knowledge-base/decisions/2026-11-10-libraries-and-loop.md) |
| `RULE-KB-CARD-SIZE` | should | 程式 | `TEST-INDEX` | [2026-11-10-libraries-and-loop.md](../../knowledge-base/decisions/2026-11-10-libraries-and-loop.md) | [2026-11-10-libraries-and-loop.md](../../knowledge-base/decisions/2026-11-10-libraries-and-loop.md) |

## 知識卡（103 張，17 頁；未分卡 23 頁）

| 頁 | id | kind | topic | 卡片 | 略過 |
|---|---|---|---|---|---|
| [01_skill-integrity.md](../../knowledge-base/01_skill-integrity.md) | `KB-skill-integrity` | principle | fairness | 6 | 0 |
| [02_market-and-legal.md](../../knowledge-base/02_market-and-legal.md) | `KB-market-legal` | research | market, legal | 7 | 0 |
| [03_design-patterns.md](../../knowledge-base/03_design-patterns.md) | `KB-design-patterns` | method | design | 6 | 0 |
| [04_tech-stack.md](../../knowledge-base/04_tech-stack.md) | `KB-tech-stack` | principle | tech | 9 | 0 |
| [05_juice-and-feel.md](../../knowledge-base/05_juice-and-feel.md) | `KB-juice-feel` | method | juice | 5 | 0 |
| [06_art-pipeline.md](../../knowledge-base/06_art-pipeline.md) | `KB-art-pipeline` | method | art | 5 | 0 |
| [07_themes-and-liveops.md](../../knowledge-base/07_themes-and-liveops.md) | `KB-themes-liveops` | research | theme | 4 | 0 |
| [08_production-workflow.md](../../knowledge-base/08_production-workflow.md) | `KB-production-workflow` | method | process | 4 | 0 |
| [10_asset-library.md](../../knowledge-base/10_asset-library.md) | `KB-asset-library` | method | art | 2 | 4 |
| [11_terrain-style-kit.md](../../knowledge-base/11_terrain-style-kit.md) | `KB-terrain-style-kit` | recipe | art | 8 | 0 |
| [12_genre-recipes.md](../../knowledge-base/12_genre-recipes.md) | `KB-genre-recipes` | recipe | design, tech | 4 | 0 |
| [13_input-fairness.md](../../knowledge-base/13_input-fairness.md) | `KB-input-fairness` | method | input, fairness | 5 | 0 |
| [14_audio.md](../../knowledge-base/14_audio.md) | `KB-audio` | method | audio | 5 | 0 |
| [15_reference-games.md](../../knowledge-base/15_reference-games.md) | `KB-reference-games` | research | market, tech, art | 9 | 0 |
| [16_ad-funnel-games.md](../../knowledge-base/16_ad-funnel-games.md) | `KB-ad-funnel-games` | research | market, design | 6 | 0 |
| [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) | `KB-difficulty-curve` | method | difficulty | 7 | 0 |
| [af-gate-lane-shooter.md](../../knowledge-base/ad-funnel/af-gate-lane-shooter.md) | `KB-af-gate-lane-shooter` | research | design, market | 11 | 0 |

## 資產（85 筆）

依遊戲：SwarmDuel 63、TwinStrike 17、shared 5　依狀態：placeholder 6、procedural 35、raw-only 5、rejected-take 5、shipped 28、template 6

### SwarmDuel

| id | 類型 | 狀態 | 名稱 | 檔案 | 重用 |
|---|---|---|---|---|---|
| `swarmduel.chr.sasq.identity_v01` | sprite-sheet | raw-only | Sasq 身分參考圖 v0.1（大圖） | [hero_bigfoot_1.png](../../SwarmDuel/art/raw/hero_bigfoot_1.png) | game-only |
| `swarmduel.chr.sasq.identity` | sprite-sheet | raw-only | Sasq 真低解析度身分圖（正/側/背） | [native_hero_1.png](../../SwarmDuel/art/raw/native_hero_1.png) | game-only |
| `swarmduel.chr.sasq.idle` | sprite-sheet | shipped | Sasq Idle（呼吸 2 格） | [sasq_idle.png](../../SwarmDuel/game/src/assets/sasq_idle.png) | game-only |
| `swarmduel.chr.sasq.walk` | sprite-sheet | shipped | Sasq Walk（接觸/經過 4 格） | [sasq_walk.png](../../SwarmDuel/game/src/assets/sasq_walk.png) | game-only |
| `swarmduel.chr.sasq.placeholder_v02` | sprite-sheet | placeholder | Sasq 4 方向單格佔位（v0.2） | [sasq.png](../../SwarmDuel/art/native/placeholder_v02/sasq.png) | game-only |
| `swarmduel.enm.greyling.identity_v01` | sprite-sheet | raw-only | Greyling 身分參考圖 v0.1（大圖） | [enemy_greyling_1.png](../../SwarmDuel/art/raw/enemy_greyling_1.png) | game-only |
| `swarmduel.enm.greyling.identity` | sprite-sheet | raw-only | Greyling 真低解析度身分圖（正/側/背） | [native_greyling_1.png](../../SwarmDuel/art/raw/native_greyling_1.png) | game-only |
| `swarmduel.enm.greyling.walk` | sprite-sheet | shipped | Greyling Walk（4 格） | [greyling_walk.png](../../SwarmDuel/game/src/assets/greyling_walk.png) | game-only |
| `swarmduel.enm.greyling.placeholder_v02` | sprite-sheet | placeholder | Greyling 4 方向單格佔位（v0.2） | [greyling.png](../../SwarmDuel/art/native/placeholder_v02/greyling.png) | game-only |
| `swarmduel.enm.probe` | sprite-sheet | placeholder | probe（Greyling 換色＋縮放） | [greyling_walk.png](../../SwarmDuel/game/src/assets/greyling_walk.png) | game-only |
| `swarmduel.enm.hulk` | sprite-sheet | placeholder | hulk（Greyling 換色＋縮放） | [greyling_walk.png](../../SwarmDuel/game/src/assets/greyling_walk.png) | game-only |
| `swarmduel.enm.saucer_scout` | sprite-sheet | placeholder | saucer_scout（Greyling 換色＋縮放） | [greyling_walk.png](../../SwarmDuel/game/src/assets/greyling_walk.png) | game-only |
| `swarmduel.enm.mother_probe` | sprite-sheet | placeholder | mother_probe（Greyling 換色＋縮放） | [greyling_walk.png](../../SwarmDuel/game/src/assets/greyling_walk.png) | game-only |
| `swarmduel.prp.pine` | sprite-sheet | shipped | 太平洋西北松樹 | [pine.png](../../SwarmDuel/game/src/assets/pine.png) | game-only |
| `swarmduel.icn.pinecone` | ui | shipped | 松果投擲（武器 Pinecone Toss） | [icons.png](../../SwarmDuel/game/src/assets/icons.png) | game-only |
| `swarmduel.icn.campfire` | ui | shipped | 營火環（武器 Campfire Ring） | [icons.png](../../SwarmDuel/game/src/assets/icons.png) | game-only |
| `swarmduel.icn.static_fur` | ui | shipped | 靜電毛（武器 Static Fur） | [icons.png](../../SwarmDuel/game/src/assets/icons.png) | game-only |
| `swarmduel.icn.p_speed` | ui | shipped | Trail Legs +10% 移速；結算 dodges 列 | [icons.png](../../SwarmDuel/game/src/assets/icons.png) | game-only |
| `swarmduel.icn.p_might` | ui | shipped | Big Fists +10% 傷害 | [icons.png](../../SwarmDuel/game/src/assets/icons.png) | game-only |
| `swarmduel.icn.p_magnet` | ui | shipped | Ecto Sense +25% 拾取半徑 | [icons.png](../../SwarmDuel/game/src/assets/icons.png) | game-only |
| `swarmduel.icn.p_cooldown` | ui | shipped | Quick Reflex −8% 冷卻；結算 survival 列 | [icons.png](../../SwarmDuel/game/src/assets/icons.png) | game-only |
| `swarmduel.icn.p_hp` | ui | shipped | Thick Fur +20 HP | [icons.png](../../SwarmDuel/game/src/assets/icons.png) | game-only |
| `swarmduel.icn.snack` | ui | shipped | Camp Snack 補 30 HP | [icons.png](../../SwarmDuel/game/src/assets/icons.png) | game-only |
| `swarmduel.icn.bounty` | ui | shipped | Bounty +100 分；標題每日卡、結算 bonus | [icons.png](../../SwarmDuel/game/src/assets/icons.png) | game-only |
| `swarmduel.icn.skull` | ui | shipped | HUD 擊殺數；結算 kills 列 | [icons.png](../../SwarmDuel/game/src/assets/icons.png) | game-only |
| `swarmduel.icn.ecto` | ui | shipped | Ecto 經驗球；結算 ecto 列 | [icons.png](../../SwarmDuel/game/src/assets/icons.png) | game-only |
| `swarmduel.icn.p_speed.alt` | ui | rejected-take | Trail Legs 圖示第 2 張（未採用） | [icon_p_speed_2.png](../../SwarmDuel/art/raw/icon_p_speed_2.png) | game-only |
| `swarmduel.key.key_art` | key-art | shipped | 主視覺：夜間營地＋飛碟＋外星人包圍 | [key_art.webp](../../SwarmDuel/game/src/assets/key_art.webp) | game-only |
| `swarmduel.prc.ground.grass` | procedural | procedural | 夜間草地 tile | [textures.js](../../SwarmDuel/game/src/render/textures.js) | game-only |
| `swarmduel.prc.decor.tuft` | procedural | procedural | 地面裝飾：草叢 | [textures.js](../../SwarmDuel/game/src/render/textures.js) | game-only |
| `swarmduel.prc.decor.rock` | procedural | procedural | 地面裝飾：石頭 | [textures.js](../../SwarmDuel/game/src/render/textures.js) | game-only |
| `swarmduel.prc.decor.flower` | procedural | procedural | 地面裝飾：藍花 | [textures.js](../../SwarmDuel/game/src/render/textures.js) | game-only |
| `swarmduel.prc.decor.mushroom` | procedural | procedural | 地面裝飾：紅蘑菇 | [textures.js](../../SwarmDuel/game/src/render/textures.js) | game-only |
| `swarmduel.prc.decor.log` | procedural | procedural | 地面裝飾：原木 | [textures.js](../../SwarmDuel/game/src/render/textures.js) | game-only |
| `swarmduel.prc.decor.dirt` | procedural | procedural | 地面裝飾：泥地 | [textures.js](../../SwarmDuel/game/src/render/textures.js) | game-only |
| `swarmduel.prc.campfire` | procedural | procedural | 營火（2 格） | [textures.js](../../SwarmDuel/game/src/render/textures.js) | game-only |
| `swarmduel.prc.tent` | procedural | procedural | 帳篷 | [textures.js](../../SwarmDuel/game/src/render/textures.js) | game-only |
| `swarmduel.prc.orb` | procedural | procedural | Ecto 經驗球 | [textures.js](../../SwarmDuel/game/src/render/textures.js) | game-only |
| `swarmduel.prc.pinecone_shot` | procedural | procedural | 松果投射物 | [textures.js](../../SwarmDuel/game/src/render/textures.js) | game-only |
| `swarmduel.prc.flame` | procedural | procedural | 營火環火焰 | [textures.js](../../SwarmDuel/game/src/render/textures.js) | game-only |
| `swarmduel.prc.hotdog` | procedural | procedural | 熱狗拾取物 | [textures.js](../../SwarmDuel/game/src/render/textures.js) | game-only |
| `swarmduel.prc.shadow` | procedural | procedural | 腳底陰影 | [textures.js](../../SwarmDuel/game/src/render/textures.js) | game-only |
| `swarmduel.prc.spark` | procedural | procedural | 碎片/火花粒子 | [textures.js](../../SwarmDuel/game/src/render/textures.js) | game-only |
| `swarmduel.prc.darkness` | procedural | procedural | 夜色暗角（跟隨英雄的光圈） | [textures.js](../../SwarmDuel/game/src/render/textures.js) | game-only |
| `swarmduel.prc.glow` | procedural | procedural | 營火暖光 | [textures.js](../../SwarmDuel/game/src/render/textures.js) | game-only |
| `swarmduel.prc.flash_sheet` | procedural | procedural | 受擊白色剪影 sheet | [textures.js](../../SwarmDuel/game/src/render/textures.js) | game-only |
| `swarmduel.vfx.howl_ring` | procedural | procedural | Howl 衝擊波環（sprite 擴散環，無 filter） | [world.js](../../SwarmDuel/game/src/render/world.js) | game-only |
| `swarmduel.vfx.graze_star` | procedural | procedural | Perfect Dodge 金星 | [world.js](../../SwarmDuel/game/src/render/world.js) | game-only |
| `swarmduel.vfx.damage_number` | procedural | procedural | 傷害數字 | [world.js](../../SwarmDuel/game/src/render/world.js) | game-only |
| `swarmduel.vfx.kill_burst` | procedural | procedural | 擊殺碎片爆 | [world.js](../../SwarmDuel/game/src/render/world.js) | game-only |
| `swarmduel.vfx.hurt_burst` | procedural | procedural | 英雄受傷紅白碎片＋震屏 | [world.js](../../SwarmDuel/game/src/render/world.js) | game-only |
| `swarmduel.vfx.screen_shake` | procedural | procedural | 鏡頭震動（root 位移） | [world.js](../../SwarmDuel/game/src/render/world.js) | game-only |
| `swarmduel.vfx.static_aura` | procedural | procedural | 靜電毛光環 | [world.js](../../SwarmDuel/game/src/render/world.js) | game-only |
| `swarmduel.vfx.beam_warning` | procedural | procedural | 光束預警圈＋光束 | [world.js](../../SwarmDuel/game/src/render/world.js) | game-only |
| `swarmduel.vfx.hp_bar` | procedural | procedural | 腳下血條 | [world.js](../../SwarmDuel/game/src/render/world.js) | game-only |
| `swarmduel.vfx.enemy_hover` | procedural | procedural | 敵人懸浮＋錯開動畫 | [world.js](../../SwarmDuel/game/src/render/world.js) | game-only |
| `swarmduel.ui.panel` | procedural | procedural | 斜角面板 | [theme.js](../../SwarmDuel/game/src/ui/theme.js) | game-only |
| `swarmduel.ui.button` | procedural | procedural | 3D 膠囊按鈕（primary/secondary/gold） | [theme.js](../../SwarmDuel/game/src/ui/theme.js) | game-only |
| `swarmduel.ui.pips` | procedural | procedural | 等級點 | [theme.js](../../SwarmDuel/game/src/ui/theme.js) | game-only |
| `swarmduel.ui.banner` | procedural | procedural | 緞帶標題 | [panels.js](../../SwarmDuel/game/src/ui/panels.js) | game-only |
| `swarmduel.ui.logo` | procedural | procedural | SWARM / DUEL 文字 Logo | [panels.js](../../SwarmDuel/game/src/ui/panels.js) | game-only |
| `swarmduel.ui.hud` | procedural | procedural | HUD：經驗條、等級徽章、計時膠囊、擊殺、連擊、Dash 膠囊、Howl 按鈕、搖桿 | [hud.js](../../SwarmDuel/game/src/ui/hud.js) | game-only |
| `swarmduel.ui.font.pixelify` | ui | shipped | Pixelify Sans 字型（400/700，latin） | [main.js](../../SwarmDuel/game/src/main.js) | game-only |

### TwinStrike

| id | 類型 | 狀態 | 名稱 | 檔案 | 重用 |
|---|---|---|---|---|---|
| `twinstrike.ref.cat.identity` | reference | raw-only | 貓師父身分參考圖（採用 t1b） | [cat_identity.png](../../TwinStrike/art/raw/cat_identity.png) | game-only |
| `twinstrike.ref.cat.identity.t1a` | reference | rejected-take | 貓師父身分圖 t1a（未採用） | [cat_identity_t1a.png](../../TwinStrike/art/raw/cat_identity_t1a.png) | game-only |
| `twinstrike.chr.cat` | sprite-sheet | shipped | 貓師父 9 格姿勢 | [cat.png](../../TwinStrike/game/src/assets/cat.png) | game-only |
| `twinstrike.enm.mouse` | sprite-sheet | shipped | 老鼠（步兵）3 格 | [enemies.png](../../TwinStrike/game/src/assets/enemies.png) | game-only |
| `twinstrike.enm.squirrel` | sprite-sheet | shipped | 飛鼠（疾兵）3 格（採用 t2） | [enemies.png](../../TwinStrike/game/src/assets/enemies.png) | game-only |
| `twinstrike.enm.squirrel.t1` | sprite-sheet | rejected-take | 飛鼠 t1（未採用：貼紙感不足） | [squirrel_poses_t1.png](../../TwinStrike/art/raw/squirrel_poses_t1.png) | game-only |
| `twinstrike.enm.tanuki` | sprite-sheet | shipped | 狸貓（重甲 / 頭目）4 格 | [enemies.png](../../TwinStrike/game/src/assets/enemies.png) | game-only |
| `twinstrike.bg.dojo` | background | shipped | 道場背景（直版 720×1280） | [bg_dojo.webp](../../TwinStrike/game/src/assets/bg_dojo.webp) | game-only |
| `twinstrike.fx.sheet` | fx-sheet | shipped | 特效貼紙 6 格 | [fx.png](../../TwinStrike/game/src/assets/fx.png) | game-only |
| `twinstrike.keyart.title` | key-art | shipped | 主視覺（標題畫面，採用 t2a） | [title_keyart.webp](../../TwinStrike/game/src/assets/title_keyart.webp) | game-only |
| `twinstrike.keyart.t1` | key-art | rejected-take | 主視覺 t1（未採用：Logo 空間不足） | [key_art_t1.png](../../TwinStrike/art/raw/key_art_t1.png) | game-only |
| `twinstrike.keyart.t2b` | key-art | rejected-take | 主視覺 t2b（未採用） | [key_art_t2b.png](../../TwinStrike/art/raw/key_art_t2b.png) | game-only |
| `twinstrike.prc.placeholder-art` | procedural | procedural | 佔位美術（Canvas 2D 程式繪製 atlas，0 bytes） | [placeholderArt.js](../../TwinStrike/game/src/render/placeholderArt.js) | reusable |
| `twinstrike.aud.sfx` | audio-recipe | shipped | 打擊音效與 UI 音效合成配方 | [sfx.js](../../TwinStrike/game/src/audio/sfx.js) | reusable |
| `twinstrike.aud.keysound` | audio-recipe | shipped | keysound（命中音跟 BGM 和弦）與拍點吸附 | [keysound.js](../../TwinStrike/game/src/audio/keysound.js) | reusable |
| `twinstrike.aud.bgm` | audio-recipe | shipped | 程序化 BGM（照譜面拍長排程） | [bgm.js](../../TwinStrike/game/src/audio/bgm.js) | reusable |
| `twinstrike.scene.dust` | background | template | 範本地表 tile 複本（未使用） | [dust.png](../../TwinStrike/game/src/assets/terrain/dust.png) | template |

### shared

| id | 類型 | 狀態 | 名稱 | 檔案 | 重用 |
|---|---|---|---|---|---|
| `shared.tpl.fx.shake` | fx-sheet | template | skill 範本 shake.js | [shake.js](../../.claude/skills/lite-skillgame-stack/templates/src/fx/shake.js) | template |
| `shared.tpl.fx.overlay` | fx-sheet | template | skill 範本 overlay.js | [overlay.js](../../.claude/skills/lite-skillgame-stack/templates/src/fx/overlay.js) | template |
| `shared.tpl.fx.shockwave` | fx-sheet | template | skill 範本 shockwave.js | [shockwave.js](../../.claude/skills/lite-skillgame-stack/templates/src/fx/shockwave.js) | template |
| `shared.tpl.fx.particles` | fx-sheet | template | skill 範本 particles.js | [particles.js](../../.claude/skills/lite-skillgame-stack/templates/src/fx/particles.js) | template |
| `shared.tpl.terrain.dust` | background | template | skill 範本地表材質 dust（AI 生成 tile） | [dust.png](../../.claude/skills/lite-skillgame-stack/templates/src/assets/terrain/dust.png) | template |
