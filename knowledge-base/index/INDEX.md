# 規則 ↔ 知識庫 ↔ 資產 索引（自動產生）

> 產生物，禁止手改：`node shared/tools/index-build.mjs`。規則來源 [rules.json](rules.json)，資產來源各款 `art/manifest.json` 與 `shared/recipes/`，知識卡來源各頁 front-matter，測試卡來源 `shared/tests/registry.json`；機器可讀版 [assets.json](assets.json)、[kb.json](kb.json)、[tests.json](tests.json)。

## 規則（35 條）

| 規則 | 等級 | 把關 | 測試卡 | 為什麼 | 怎麼做 |
|---|---|---|---|---|---|
| `RULE-BUNDLE-SIZE` | must | 程式 | `TEST-SIZE` | [04_tech-stack.md](../../knowledge-base/04_tech-stack.md) | [stack-and-budget.md](../../.claude/skills/lite-skillgame-stack/references/stack-and-budget.md) |
| `RULE-NO-RUNTIME-CDN` | must | 程式 | `TEST-SIZE` | [04_tech-stack.md](../../knowledge-base/04_tech-stack.md) | [SKILL.md](../../.claude/skills/lite-skillgame-stack/SKILL.md) |
| `RULE-DRAWCALL-2D` | must | 人工審查 | `TEST-DRAWCALL-REVIEW` | [04_tech-stack.md](../../knowledge-base/04_tech-stack.md) | [drawcalls-assets.md](../../.claude/skills/lite-skillgame-stack/references/drawcalls-assets.md) |
| `RULE-DRAWCALL-3D` | must | 人工審查 | `TEST-DRAWCALL-REVIEW` | [04_tech-stack.md](../../knowledge-base/04_tech-stack.md) | [drawcalls-assets.md](../../.claude/skills/lite-skillgame-stack/references/drawcalls-assets.md) |
| `RULE-SIM-PURITY` | must | 程式 | `TEST-AUDIT` | [01_skill-integrity.md](../../knowledge-base/01_skill-integrity.md) | [SKILL.md](../../.claude/skills/lite-skillgame-stack/SKILL.md) |
| `RULE-NO-FORCED-HIT` | must | 程式 | `TEST-AUDIT` | [01_skill-integrity.md](../../knowledge-base/01_skill-integrity.md) | [determinism.test.mjs](../../SkyTalon/game/test/determinism.test.mjs) |
| `RULE-SKILL-DOMINANCE` | should | 程式 | `TEST-SKILL-DOMINANCE` | [01_skill-integrity.md](../../knowledge-base/01_skill-integrity.md) | [12_genre-recipes.md](../../knowledge-base/12_genre-recipes.md) |
| `RULE-SKILL-BASELINE` | should | 程式 | `TEST-SKILL-BASELINE` | [01_skill-integrity.md](../../knowledge-base/01_skill-integrity.md) | [01_skill-integrity.md](../../knowledge-base/01_skill-integrity.md) |
| `RULE-SKILL-EVIDENCE` | must | 程式 | `TEST-SKILL-EVIDENCE` | [01_skill-integrity.md](../../knowledge-base/01_skill-integrity.md) | [2026-11-11-skill-evidence.md](../../knowledge-base/decisions/2026-11-11-skill-evidence.md) |
| `RULE-SKILL-NOT-LUCK` | must | 程式 | `TEST-SKILL-NOT-LUCK` | [01_skill-integrity.md](../../knowledge-base/01_skill-integrity.md) | [2026-11-11-skill-evidence.md](../../knowledge-base/decisions/2026-11-11-skill-evidence.md) |
| `RULE-SKILL-BEATS-SIMPLE` | must | 程式 | `TEST-SKILL-BEATS-SIMPLE` | [01_skill-integrity.md](../../knowledge-base/01_skill-integrity.md) | [2026-11-11-skill-evidence.md](../../knowledge-base/decisions/2026-11-11-skill-evidence.md) |
| `RULE-SKILL-CLOSENESS` | must | 人工審查 | `TEST-SKILL-CLOSENESS-REVIEW` | [01_skill-integrity.md](../../knowledge-base/01_skill-integrity.md) | [2026-11-11-skill-evidence.md](../../knowledge-base/decisions/2026-11-11-skill-evidence.md) |
| `RULE-CURVE-TREND` | must | 程式 | `TEST-CURVE` | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) |
| `RULE-CURVE-LINEARITY` | must | 程式 | `TEST-CURVE` | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) |
| `RULE-CURVE-PEAKS` | must | 程式 | `TEST-CURVE` | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) |
| `RULE-CURVE-CLIFF` | must | 程式 | `TEST-CURVE` | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) |
| `RULE-CURVE-FLOW` | must | 程式 | `TEST-CURVE` | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) |
| `RULE-CURVE-BEATGRID` | must | 程式 | `TEST-CURVE` | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) | [12_genre-recipes.md](../../knowledge-base/12_genre-recipes.md) |
| `RULE-CURVE-PHRASE` | must | 程式 | `TEST-CURVE` | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) | [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) |
| `RULE-FX-FILTER` | should | 人工審查 | `TEST-FX-FILTER-REVIEW` | [05_juice-and-feel.md](../../knowledge-base/05_juice-and-feel.md) | [juice.md](../../.claude/skills/lite-skillgame-stack/references/juice.md) |
| `RULE-MUSIC-ENCODE` | should | 程式 | `TEST-MUSIC-PACK` | [14_audio.md](../../knowledge-base/14_audio.md) | [14_audio.md](../../knowledge-base/14_audio.md) |
| `RULE-MUSIC-LOOP` | should | 程式 | `TEST-MUSIC-PACK` | [14_audio.md](../../knowledge-base/14_audio.md) | [14_audio.md](../../knowledge-base/14_audio.md) |
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

## 知識卡（134 張，20 頁；未分卡 27 頁）

| 頁 | id | kind | topic | 卡片 | 略過 |
|---|---|---|---|---|---|
| [01_skill-integrity.md](../../knowledge-base/01_skill-integrity.md) | `KB-skill-integrity` | principle | fairness | 6 | 0 |
| [02_market-and-legal.md](../../knowledge-base/02_market-and-legal.md) | `KB-market-legal` | research | market, legal | 7 | 0 |
| [03_design-patterns.md](../../knowledge-base/03_design-patterns.md) | `KB-design-patterns` | method | design | 6 | 0 |
| [04_tech-stack.md](../../knowledge-base/04_tech-stack.md) | `KB-tech-stack` | principle | tech | 9 | 0 |
| [05_juice-and-feel.md](../../knowledge-base/05_juice-and-feel.md) | `KB-juice-feel` | method | juice | 5 | 0 |
| [06_art-pipeline.md](../../knowledge-base/06_art-pipeline.md) | `KB-art-pipeline` | method | art | 6 | 0 |
| [07_themes-and-liveops.md](../../knowledge-base/07_themes-and-liveops.md) | `KB-themes-liveops` | research | theme | 4 | 0 |
| [08_production-workflow.md](../../knowledge-base/08_production-workflow.md) | `KB-production-workflow` | method | process | 4 | 0 |
| [10_asset-library.md](../../knowledge-base/10_asset-library.md) | `KB-asset-library` | method | art | 2 | 4 |
| [11_terrain-style-kit.md](../../knowledge-base/11_terrain-style-kit.md) | `KB-terrain-style-kit` | recipe | art | 8 | 0 |
| [12_genre-recipes.md](../../knowledge-base/12_genre-recipes.md) | `KB-genre-recipes` | recipe | design, tech | 4 | 0 |
| [13_input-fairness.md](../../knowledge-base/13_input-fairness.md) | `KB-input-fairness` | method | input, fairness | 6 | 0 |
| [14_audio.md](../../knowledge-base/14_audio.md) | `KB-audio` | method | audio | 8 | 0 |
| [15_reference-games.md](../../knowledge-base/15_reference-games.md) | `KB-reference-games` | research | market, tech, art | 10 | 0 |
| [16_ad-funnel-games.md](../../knowledge-base/16_ad-funnel-games.md) | `KB-ad-funnel-games` | research | market, design | 6 | 0 |
| [16_difficulty-curve.md](../../knowledge-base/16_difficulty-curve.md) | `KB-difficulty-curve` | method | difficulty | 7 | 0 |
| [17_design-principles.md](../../knowledge-base/17_design-principles.md) | `KB-design-principles` | principle | design | 9 | 1 |
| [18_pixel-vfx-codex.md](../../knowledge-base/18_pixel-vfx-codex.md) | `KB-pixel-vfx-codex` | research | juice, art | 10 | 0 |
| [19_vfx-spec-templates.md](../../knowledge-base/19_vfx-spec-templates.md) | `KB-vfx-spec` | method | art | 6 | 0 |
| [af-gate-lane-shooter.md](../../knowledge-base/ad-funnel/af-gate-lane-shooter.md) | `KB-af-gate-lane-shooter` | research | design, market | 11 | 0 |

## 資產（176 筆）

依遊戲：BladeOath 24、LanternHold 41、SkyTalon 26、SwarmDuel 63、TwinStrike 17、shared 5　依狀態：placeholder 6、procedural 37、raw-only 15、rejected-take 9、shipped 103、template 6

### BladeOath

| id | 類型 | 狀態 | 名稱 | 檔案 | 重用 |
|---|---|---|---|---|---|
| `bladeoath.chr.player` | sprite-sheet | shipped | 玩家・劍客：頭／軀幹 正側背、直劍 16 角 | [actors.png](../../BladeOath/game/src/assets/pixel/actors.png) | reusable |
| `bladeoath.chr.soldier` | sprite-sheet | shipped | 屍兵：頭／軀幹 正側背、斷刀 16 角 | [actors.png](../../BladeOath/game/src/assets/pixel/actors.png) | reusable |
| `bladeoath.chr.bug` | sprite-sheet | shipped | 蠱蟲：甲殼 正側背、口器 16 角（無頭、無手） | [actors.png](../../BladeOath/game/src/assets/pixel/actors.png) | reusable |
| `bladeoath.chr.caster` | sprite-sheet | shipped | 蠱師：頭／軀幹 正側背、蠱杖 16 角 | [actors.png](../../BladeOath/game/src/assets/pixel/actors.png) | reusable |
| `bladeoath.chr.brute` | sprite-sheet | shipped | 屍傀力士：頭／軀幹 正側背、鐵錘 16 角 | [actors.png](../../BladeOath/game/src/assets/pixel/actors.png) | reusable |
| `bladeoath.chr.mother` | sprite-sheet | shipped | 蠱母（精英）：頭／軀幹 正側背、骨爪 16 角 | [actors.png](../../BladeOath/game/src/assets/pixel/actors.png) | reusable |
| `bladeoath.chr.general` | sprite-sheet | shipped | 屍傀將（中頭目）：頭／軀幹 正側背、偃月刀 16 角 | [actors.png](../../BladeOath/game/src/assets/pixel/actors.png) | reusable |
| `bladeoath.chr.fallen` | sprite-sheet | shipped | 墮仙（終頭目）：頭／軀幹 正側背、長劍 16 角 | [actors.png](../../BladeOath/game/src/assets/pixel/actors.png) | reusable |
| `bladeoath.prop.mound-chest` | sprite-sheet | shipped | 劍塚（石堆＋斷劍＋石燈）、寶箱 關／開 | [actors.png](../../BladeOath/game/src/assets/pixel/actors.png) | reusable |
| `bladeoath.cel.player` | sprite-sheet | shipped | 玩家・劍客：賽璐璐 9 姿勢（待機、走、起手、出招、格擋、閃避、受擊、跳、倒地） | [actors.png](../../BladeOath/game/src/assets/cel/actors.png) | reusable |
| `bladeoath.cel.soldier` | sprite-sheet | shipped | 屍兵：賽璐璐 9 姿勢（待機、走、起手、出招、格擋、閃避、受擊、跳、倒地） | [actors.png](../../BladeOath/game/src/assets/cel/actors.png) | reusable |
| `bladeoath.cel.bug` | sprite-sheet | shipped | 蠱蟲：賽璐璐 9 姿勢（待機、走、起手、出招、格擋、閃避、受擊、跳、倒地） | [actors.png](../../BladeOath/game/src/assets/cel/actors.png) | reusable |
| `bladeoath.cel.caster` | sprite-sheet | shipped | 蠱師：賽璐璐 9 姿勢（待機、走、起手、出招、格擋、閃避、受擊、跳、倒地） | [actors.png](../../BladeOath/game/src/assets/cel/actors.png) | reusable |
| `bladeoath.cel.brute` | sprite-sheet | shipped | 屍傀力士：賽璐璐 9 姿勢（待機、走、起手、出招、格擋、閃避、受擊、跳、倒地） | [actors.png](../../BladeOath/game/src/assets/cel/actors.png) | reusable |
| `bladeoath.cel.mother` | sprite-sheet | shipped | 蠱母（精英）：賽璐璐 9 姿勢（待機、走、起手、出招、格擋、閃避、受擊、跳、倒地） | [actors.png](../../BladeOath/game/src/assets/cel/actors.png) | reusable |
| `bladeoath.cel.general` | sprite-sheet | shipped | 屍傀將（中頭目）：賽璐璐 9 姿勢（待機、走、起手、出招、格擋、閃避、受擊、跳、倒地） | [actors.png](../../BladeOath/game/src/assets/cel/actors.png) | reusable |
| `bladeoath.cel.fallen` | sprite-sheet | shipped | 墮仙（終頭目）：賽璐璐 9 姿勢（待機、走、起手、出招、格擋、閃避、受擊、跳、倒地） | [actors.png](../../BladeOath/game/src/assets/cel/actors.png) | reusable |
| `bladeoath.cel.scene.gate` | background | shipped | 山門：賽璐璐遠景＋近景地面帶（橫向卷軸） | [far_gate.png](../../BladeOath/game/src/assets/cel/far_gate.png) | reusable |
| `bladeoath.cel.scene.forest` | background | shipped | 蠱林：賽璐璐遠景＋近景地面帶（橫向卷軸） | [far_forest.png](../../BladeOath/game/src/assets/cel/far_forest.png) | reusable |
| `bladeoath.cel.scene.well` | background | shipped | 枯井：賽璐璐遠景＋近景地面帶（橫向卷軸） | [far_well.png](../../BladeOath/game/src/assets/cel/far_well.png) | reusable |
| `bladeoath.cel.scene.hall` | background | shipped | 屍傀將殿：賽璐璐遠景＋近景地面帶（橫向卷軸） | [far_hall.png](../../BladeOath/game/src/assets/cel/far_hall.png) | reusable |
| `bladeoath.cel.scene.cloister` | background | shipped | 殿後迴廊：賽璐璐遠景＋近景地面帶（橫向卷軸） | [far_cloister.png](../../BladeOath/game/src/assets/cel/far_cloister.png) | reusable |
| `bladeoath.cel.scene.terrace` | background | shipped | 墮仙台：賽璐璐遠景＋近景地面帶（橫向卷軸） | [far_terrace.png](../../BladeOath/game/src/assets/cel/far_terrace.png) | reusable |
| `bladeoath.cel.props` | sprite-sheet | shipped | 賽璐璐道具：酒罈、木箱、石燈、斷碑、肉包、丹藥、鍛材、劍塚、寶箱（關／開） | [props.png](../../BladeOath/game/src/assets/cel/props.png) | reusable |

### LanternHold

| id | 類型 | 狀態 | 名稱 | 檔案 | 重用 |
|---|---|---|---|---|---|
| `lanternhold.chr.worker` | sprite-sheet | shipped | 工人（槌子）：idle 2、walk 4、attack 3（朝右，左向鏡像） | [units.png](../../LanternHold/game/src/assets/pixel/units.png) | reusable |
| `lanternhold.chr.archer` | sprite-sheet | shipped | 弓箭手：idle 2、walk 4、attack 3（朝右，左向鏡像） | [units.png](../../LanternHold/game/src/assets/pixel/units.png) | reusable |
| `lanternhold.chr.shield` | sprite-sheet | shipped | 盾兵：idle 2、walk 4、attack 3（朝右，左向鏡像） | [units.png](../../LanternHold/game/src/assets/pixel/units.png) | reusable |
| `lanternhold.chr.priest` | sprite-sheet | shipped | 治療者（提燈法杖，無宗教符號）：idle 2、walk 4、attack 3（朝右，左向鏡像） | [units.png](../../LanternHold/game/src/assets/pixel/units.png) | reusable |
| `lanternhold.chr.skeleton` | sprite-sheet | shipped | 骷髏兵（友軍召喚物，短劍＋小盾）：idle 2、walk 4、attack 3（朝右，左向鏡像） | [units.png](../../LanternHold/game/src/assets/pixel/units.png) | reusable |
| `lanternhold.chr.spearman` | sprite-sheet | shipped | 長槍兵（輕甲）：idle 2、walk 4、attack 3（朝右，左向鏡像） | [units.png](../../LanternHold/game/src/assets/pixel/units.png) | reusable |
| `lanternhold.chr.crossbow` | sprite-sheet | shipped | 弩兵（重弩、頭盔）：idle 2、walk 4、attack 3（朝右，左向鏡像） | [units.png](../../LanternHold/game/src/assets/pixel/units.png) | reusable |
| `lanternhold.chr.knight` | sprite-sheet | shipped | 騎士（步行，劍＋鳶形盾，無馬）：idle 2、walk 4、attack 3（朝右，左向鏡像） | [units.png](../../LanternHold/game/src/assets/pixel/units.png) | reusable |
| `lanternhold.ref.priest.t1` | reference | rejected-take | 治療者 t1（米色長袍，縮到 18 px 變雜訊，未採用） | [unit_priest_t1.png](../../LanternHold/art/raw/unit_priest_t1.png) | game-only |
| `lanternhold.ref.priest.t2b` | reference | rejected-take | 治療者 t2b（與 t2a 同 prompt，輪廓較糊，未採用） | [unit_priest_v2_t2b.png](../../LanternHold/art/raw/unit_priest_v2_t2b.png) | game-only |
| `lanternhold.ref.skeleton.t1b` | reference | rejected-take | 骷髏兵 t1b（與 t1a 同 prompt，擇一，未採用） | [unit_skeleton_t1b.png](../../LanternHold/art/raw/unit_skeleton_t1b.png) | game-only |
| `lanternhold.foe.rat` | sprite-sheet | shipped | 影鼠：walk 4 | [foes.png](../../LanternHold/game/src/assets/pixel/foes.png) | reusable |
| `lanternhold.foe.beetle` | sprite-sheet | shipped | 甲蟲：walk 4 | [foes.png](../../LanternHold/game/src/assets/pixel/foes.png) | reusable |
| `lanternhold.foe.moth` | sprite-sheet | shipped | 飛蛾（飛行）：fly 4 | [foes.png](../../LanternHold/game/src/assets/pixel/foes.png) | reusable |
| `lanternhold.foe.shroom` | sprite-sheet | shipped | 爆菇：walk 4、swell 2（膨脹待爆） | [foes.png](../../LanternHold/game/src/assets/pixel/foes.png) | reusable |
| `lanternhold.foe.snail` | sprite-sheet | shipped | 攻城蝸牛：walk 4、attack 2 | [foes.png](../../LanternHold/game/src/assets/pixel/foes.png) | reusable |
| `lanternhold.foe.wolf` | sprite-sheet | shipped | 鐵甲狼（精英）：walk 4、attack 2 | [foes.png](../../LanternHold/game/src/assets/pixel/foes.png) | reusable |
| `lanternhold.foe.shadowArcher` | sprite-sheet | shipped | 暗影弓手（遠程、射牆）：walk 4、attack 2 | [foes.png](../../LanternHold/game/src/assets/pixel/foes.png) | reusable |
| `lanternhold.foe.slime` | sprite-sheet | shipped | 暗影史萊姆（死亡分裂成兩隻小的）：walk 4、attack 2 | [foes.png](../../LanternHold/game/src/assets/pixel/foes.png) | reusable |
| `lanternhold.foe.boar` | sprite-sheet | shipped | 暗影野豬（衝鋒、首擊三倍）：walk 4、attack 2 | [foes.png](../../LanternHold/game/src/assets/pixel/foes.png) | reusable |
| `lanternhold.foe.shaman` | sprite-sheet | shipped | 巫菇（治療周圍的怪）：walk 4、attack 2（施法） | [foes.png](../../LanternHold/game/src/assets/pixel/foes.png) | reusable |
| `lanternhold.foe.mole` | sprite-sheet | shipped | 暗影鼴鼠（鑽地穿牆）：walk 4、burrow 4（土堆） | [foes.png](../../LanternHold/game/src/assets/pixel/foes.png) | reusable |
| `lanternhold.foe.boss` | sprite-sheet | shipped | Boss 永夜之喉：walk 4、attack 3（第 3 格含吐霧） | [foes.png](../../LanternHold/game/src/assets/pixel/foes.png) | reusable |
| `lanternhold.bld.castle` | sprite-sheet | shipped | 主城（石塔＋頂燈） | [buildings.png](../../LanternHold/game/src/assets/pixel/buildings.png) | reusable |
| `lanternhold.bld.barracks` | sprite-sheet | shipped | 軍營 Lv1–3（帳篷 → 木屋 → 石屋） | [buildings.png](../../LanternHold/game/src/assets/pixel/buildings.png) | reusable |
| `lanternhold.bld.walls` | sprite-sheet | shipped | 城牆三級 × 完好／龜裂／殘破（水平繪製，程式旋轉） | [buildings.png](../../LanternHold/game/src/assets/pixel/buildings.png) | reusable |
| `lanternhold.prop.forest` | sprite-sheet | shipped | 夜林道具：3 種樹、2 顆石頭、瓦礫、2 支燈柱 | [buildings.png](../../LanternHold/game/src/assets/pixel/buildings.png) | reusable |
| `lanternhold.bld.towers` | sprite-sheet | shipped | 法術塔 5 種（基本紫晶／冰晶／毒綠晶＋藤蔓／戰旗金晶／骨飾白晶） | [buildings.png](../../LanternHold/game/src/assets/pixel/buildings.png) | reusable |
| `lanternhold.fx.status` | fx-sheet | shipped | 毒雲、光環脈衝、召喚骨塵 各 4 格（洋紅底生成） | [fx.png](../../LanternHold/game/src/assets/pixel/fx.png) | reusable |
| `lanternhold.fx.bursts` | fx-sheet | shipped | 爆炸／冰爆／火焰／蒸汽 各 4 格 | [fx.png](../../LanternHold/game/src/assets/pixel/fx.png) | reusable |
| `lanternhold.fx.misc` | fx-sheet | shipped | 箭、主城光束、閃電段、打擊火花 3、升級閃光 4、金塊、寶箱開／關（螢火） | [fx.png](../../LanternHold/game/src/assets/pixel/fx.png) | reusable |
| `lanternhold.ui.icons` | ui | shipped | 卡片圖示 25、進化 4、資源 3、塔 1（24×24） | [icons.png](../../LanternHold/game/src/assets/pixel/icons.png) | reusable |
| `lanternhold.bg.ground` | background | shipped | 夜林地表 tile 與道路 tile（64×64 無縫） | [ground.png](../../LanternHold/game/src/assets/pixel/ground.png) | reusable |
| `lanternhold.prop.themes` | sprite-sheet | shipped | 場景主題道具：沙漠／高地／平原／春／秋／冬（腳底錨點） | [buildings.png](../../LanternHold/game/src/assets/pixel/buildings.png) | reusable |
| `lanternhold.bld.pads` | sprite-sheet | shipped | 建造地基：方形石基（軍營）、圓形符文台（法術塔），各附 _selected 燈橘描邊版 | [buildings.png](../../LanternHold/game/src/assets/pixel/buildings.png) | reusable |
| `lanternhold.ui.meta-icons` | ui | shipped | 外圍介面圖示：天賦 12、鑽石、天賦、成就、戰役、配置、兵種頭像 6（24×24） | [icons.png](../../LanternHold/game/src/assets/pixel/icons.png) | reusable |
| `lanternhold.ui.trait-icons` | ui | shipped | 兵種特性卡圖示：強弓、重擊、群療、體魄、鐵鎚、快腳、亡骨契約、攻擊、攻速（24×24） | [icons.png](../../LanternHold/game/src/assets/pixel/icons.png) | reusable |
| `lanternhold.bg.themes` | background | shipped | 場景主題地表：平原／沙漠／高地／春／秋／冬 各一張地面＋一張道路（64×64 無縫） | [ground_plains.png](../../LanternHold/game/src/assets/pixel/ground_plains.png) | reusable |
| `lanternhold.keyart.cover` | key-art | shipped | 首頁封面：燈塔主城被暗影群圍城（像素，270×200） | [cover.png](../../LanternHold/game/src/assets/pixel/cover.png) | reusable |
| `lanternhold.ref.cover.t1a` | reference | rejected-take | 封面 t1a（Boss 較清楚，但天空較雜，未採用） | [key_cover_t1a.png](../../LanternHold/art/raw/key_cover_t1a.png) | game-only |
| `lanternhold.ref.palette` | reference | shipped | 像素組共用 48 色調色盤 | [palette.json](../../LanternHold/game/src/assets/pixel/palette.json) | reusable |

### SkyTalon

| id | 類型 | 狀態 | 名稱 | 檔案 | 重用 |
|---|---|---|---|---|---|
| `skytalon.prc.ground` | procedural | procedural | 俯視地表 shader（島嶼、海岸、秋色林地、雲與雲影，0 bytes） | [ground.js](../../SkyTalon/game/src/render/ground.js) | reusable |
| `skytalon.prc.atlas` | procedural | procedural | 機體、裝備掛件、敵機、子彈、特效 atlas（多邊形手工光柵化，256×466，0 bytes） | [atlas.js](../../SkyTalon/game/src/render/atlas.js) | reusable |
| `skytalon.chr.ship-forms` | sprite-sheet | shipped | 主角機的三種升級型態（展翼型、重裝型、軌道砲型），各 5 格側傾 | [shipForms.js](../../SkyTalon/game/src/render/shipForms.js) | game-only |
| `skytalon.chr.boss-forms` | sprite-sheet | shipped | 四個頭目（各三階段：外甲、骨架、核心）與四個小王 | [bossForms.js](../../SkyTalon/game/src/render/bossForms.js) | game-only |
| `skytalon.chr.leg6-forms` | sprite-sheet | raw-only | 航段六（中生代）四個頭目（各三階段）與四個小王：板龍、梁龍、滄龍、暴龍；波斯特鱷、異特龍、風神翼龍、棘龍 | [leg6Forms.js](../../SkyTalon/game/src/render/leg6Forms.js) | game-only |
| `skytalon.chr.leg6-creatures` | sprite-sheet | raw-only | 航段六（中生代）十六種小怪與巨木：真雙型齒翼龍、派克鳥龍、艾雷拉龍、腔骨龍、劍龍、嗜鳥龍、雙脊龍、喙嘴翼龍、無齒翼龍、薄板龍、古巨龜、魚鳥、三角龍、甲龍、馳龍、厚頭龍 | [leg6Creatures.js](../../SkyTalon/game/src/render/leg6Creatures.js) | game-only |
| `skytalon.chr.leg2-forms` | sprite-sheet | raw-only | 航段二（反攻內圈）頭目與小王：塞勒涅、潘、晨星、昏星、涅墨西斯（各三階段）；恩底彌翁、阿耳戈斯、厄洛斯、厄里斯 | [leg2Forms.js](../../SkyTalon/game/src/render/leg2Forms.js) | game-only |
| `skytalon.chr.leg2-machines` | sprite-sheet | raw-only | 航段二（反攻內圈）新小怪：月塵護衛機、鏡面砲艇（關殼、開殼）、雙極追擊機、爭端自爆艇 | [leg2Machines.js](../../SkyTalon/game/src/render/leg2Machines.js) | game-only |
| `skytalon.chr.leg3-forms` | sprite-sheet | raw-only | 航段三（外圈巨神）頭目與小王：厄倪俄、阿瑪爾忒亞、普羅米修斯、雅努斯（各三階段）；福波斯、得摩斯、伽倪墨得斯、潘朵拉、厄庇墨透斯 | [leg3Forms.js](../../SkyTalon/game/src/render/leg3Forms.js) | game-only |
| `skytalon.chr.leg3-machines` | sprite-sheet | raw-only | 航段三（外圈巨神）新小怪與頭目附屬物：攻城迫擊艇、神盾護衛艇、災厄晶簇機、時序殘影機、鎖鏈錨、巨鷹 | [leg3Machines.js](../../SkyTalon/game/src/render/leg3Machines.js) | game-only |
| `skytalon.chr.leg4-forms` | sprite-sheet | raw-only | 航段四（冥界邊境）頭目與小王：布里阿瑞俄斯、謨涅摩緒涅、普羅透斯、斯堤克斯（各三階段）；布戎忒斯、喀耳刻、特里同、卡戎 | [leg4Forms.js](../../SkyTalon/game/src/render/leg4Forms.js) | game-only |
| `skytalon.chr.leg4-machines` | sprite-sheet | raw-only | 航段四（冥界邊境）新小怪與頭目附屬物：節拍砲艇、微弱斥候、重裝獸機、深淵聲納浮標、殘骸再起機與殘骸、機械臂、擺渡船、腳踵 | [leg4Machines.js](../../SkyTalon/game/src/render/leg4Machines.js) | game-only |
| `skytalon.chr.leg5-forms` | sprite-sheet | raw-only | 航段五（太陽與黑洞）頭目與小王：赫利俄斯、許珀里翁、混沌、黃泉鳥居（各三階段）；法厄同、赫利阿得斯、燭陰、八咫鏡 | [leg5Forms.js](../../SkyTalon/game/src/render/leg5Forms.js) | game-only |
| `skytalon.chr.leg5-machines` | sprite-sheet | raw-only | 航段五（太陽與黑洞）新小怪、混沌的陣眼與生門、靈魂體小人（主角在黑洞兩章的樣子，三格側傾） | [leg5Machines.js](../../SkyTalon/game/src/render/leg5Machines.js) | game-only |
| `skytalon.bg.leg6-ground` | background | shipped | 航段六（失落的中生代）四章地面：三疊紀裂谷、侏羅紀巨木林、白堊紀內海、白堊紀末日 | [ground_ch1.webp](../../SkyTalon/game/src/assets/leg6/ground_ch1.webp) | game-only |
| `skytalon.bg.leg5-ground` | background | shipped | 航段五（太陽與黑洞）四章地面：日冕、日面深處、黑洞（一）、黑洞（二） | [ground_ch1.webp](../../SkyTalon/game/src/assets/leg5/ground_ch1.webp) | game-only |
| `skytalon.cut.prologue` | key-art | shipped | 遊戲開場動畫：星門甦醒、眾神艦隊、最後的燈火、標題 | [p1_gate_wakes.avif](../../SkyTalon/game/src/assets/intro0/p1_gate_wakes.avif) | game-only |
| `skytalon.cut.leg1-intro` | key-art | shipped | 航段一出征過場：眾神艦隊降臨、最後的壁壘、地下機庫、出擊 | [s1_gods_descend.avif](../../SkyTalon/game/src/assets/intro/s1_gods_descend.avif) | game-only |
| `skytalon.cut.leg2-intro` | key-art | shipped | 航段二出征過場：阿特拉斯倒下、月面前進基地、地球艦隊集結、飛向月球 | [s1_atlas_falls.avif](../../SkyTalon/game/src/assets/intro2/s1_atlas_falls.avif) | game-only |
| `skytalon.cut.leg3-intro` | key-art | shipped | 航段三（外圈巨神）出征過場：涅墨西斯倒下、火星雙子艦隊、木星雷雲巨神、穿越小行星帶 | [s1_inner_retaken.avif](../../SkyTalon/game/src/assets/intro3/s1_inner_retaken.avif) | game-only |
| `skytalon.cut.leg4-intro` | key-art | shipped | 航段四（冥界邊境）出征過場：雅努斯沉入土星環、艦隊逃往邊緣、冥河與渡船、衝進冥界霧氣 | [s1_rings_fall.avif](../../SkyTalon/game/src/assets/intro4/s1_rings_fall.avif) | game-only |
| `skytalon.cut.leg5-intro` | key-art | shipped | 航段五（太陽與黑洞）出征過場：冥河斷流、日冕火海、太陽背後的黑洞、迎著強光出擊 | [s1_styx_breaks.avif](../../SkyTalon/game/src/assets/intro5/s1_styx_breaks.avif) | game-only |
| `skytalon.cut.leg6-intro` | key-art | shipped | 航段六（失落的中生代）出征過場：混沌碎裂、時空隧道、一億年前的地球、衝向三疊紀裂谷 | [s1_chaos_breaks.avif](../../SkyTalon/game/src/assets/intro6/s1_chaos_breaks.avif) | game-only |
| `skytalon.audio.music` | procedural | shipped | 戰鬥音樂（程式即時合成）：每個航段一首飛行主題與一首頭目變奏 | [music.js](../../SkyTalon/game/src/audio/music.js) | game-only |
| `skytalon.audio.ui-clips` | audio-recipe | shipped | 介面與道具音效：通關、拾取、選裝備、推進、頭目進場 | [clear.mp3](../../SkyTalon/game/src/assets/sfx/clear.mp3) | game-only |
| `skytalon.audio.battle-clips` | audio-recipe | shipped | 戰鬥音效：射擊、命中、擊毀（轟轟轟）、爆炸、頭目擊破、主角被擊中 | [shot.mp3](../../SkyTalon/game/src/assets/sfx/shot.mp3) | game-only |

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
