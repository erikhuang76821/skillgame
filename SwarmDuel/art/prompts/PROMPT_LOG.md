# Prompt 版本紀錄（自動產生：`python tools/prompt_ledger.py`）

每張原始產出對應「產生它的那份 prompt 原文」快照（`_history/`）。`art/prompts/` 下的檔案是**現行版**，重生會用它；快照不會被覆寫。新產出請用 `tools/gen_anim.sh`（動畫）或 `tools/gen_image.sh`（靜態），兩者在生成前自動存快照。

- **快照來源**：`snapshot` = 生成時由腳本凍結；`log 回填` = 從 Codex log 取回（log 原樣保留了送出的 prompt，可信）；`prompt 檔回填（早於產出）` = 依修改時間推定為同一份；`未知` = prompt 檔在產出後被改過，生成當時的原文已無法取得。回填來源記在 `_history/provenance.json`。
- **備註「現行檔已改」**：現行 prompt 與該次產出用的不同，重生不會得到同樣的條件。

## 動畫條（`art/raw/anim/`）

| 產出 | take | prompt 檔 | 快照 sha | 快照來源 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `anim/greyling_Walk_down_right_t1.png` | 1 | `anim/greyling_Walk_down_right.txt` | [ee7a2580fc89](_history/anim/greyling_Walk_down_right_t1.txt) | log 回填 | 採用 | 現行檔已改 |
| `anim/greyling_Walk_down_t1.png` | 1 | `anim/greyling_Walk_down.txt` | [84e4c914cd00](_history/anim/greyling_Walk_down_t1.txt) | log 回填 | 採用 | 現行檔已改 |
| `anim/greyling_Walk_right_t1.png` | 1 | `anim/greyling_Walk_right.txt` | [cc601c5f5d32](_history/anim/greyling_Walk_right_t1.txt) | log 回填 | 採用 | 現行檔已改 |
| `anim/greyling_Walk_up_right_t1.png` | 1 | `anim/greyling_Walk_up_right.txt` | [28b47dfe1444](_history/anim/greyling_Walk_up_right_t1.txt) | log 回填 | 拒絕：與 up 幾乎相同（只有天線偏右） | 現行檔已改 |
| `anim/greyling_Walk_up_right_t2.png` | 2 | `anim/greyling_Walk_up_right.txt` | [444a6e172493](_history/anim/greyling_Walk_up_right_t2.txt) | log 回填 | 採用 | 現行檔已改 |
| `anim/greyling_Walk_up_t1.png` | 1 | `anim/greyling_Walk_up.txt` | [52a0ddb4ae17](_history/anim/greyling_Walk_up_t1.txt) | log 回填 | 採用 | 現行檔已改 |
| `anim/sasq_Idle_down_right_t1.png` | 1 | `anim/sasq_Idle_down_right.txt` | [da60dc2f70a4](_history/anim/sasq_Idle_down_right_t1.txt) | log 回填 | 採用 |  |
| `anim/sasq_Idle_down_t1.png` | 1 | `anim/sasq_Idle_down.txt` | [0aa86ba4809a](_history/anim/sasq_Idle_down_t1.txt) | log 回填 | 採用 |  |
| `anim/sasq_Idle_right_t1.png` | 1 | `anim/sasq_Idle_right.txt` | [ebec54e3e0b8](_history/anim/sasq_Idle_right_t1.txt) | log 回填 | 採用 |  |
| `anim/sasq_Idle_up_right_t1.png` | 1 | `anim/sasq_Idle_up_right.txt` | [b7131506e829](_history/anim/sasq_Idle_up_right_t1.txt) | log 回填 | 拒絕：第 2 格轉成正背面且縮小；改寫 up_right 方向描述後重生 | 現行檔已改 |
| `anim/sasq_Idle_up_right_t2.png` | 2 | `anim/sasq_Idle_up_right.txt` | [44b9841a0520](_history/anim/sasq_Idle_up_right_t2.txt) | log 回填 | 採用 |  |
| `anim/sasq_Idle_up_right_t3.png` | 3 | `anim/sasq_Idle_up_right.txt` | [44b9841a0520](_history/anim/sasq_Idle_up_right_t3.txt) | log 回填 | 未採用：與 t2 同 prompt 的重生備選（文件未記錄取捨原因；t2 採用） |  |
| `anim/sasq_Idle_up_t1.png` | 1 | `anim/sasq_Idle_up.txt` | [2e44f78b5aba](_history/anim/sasq_Idle_up_t1.txt) | log 回填 | 採用 |  |
| `anim/sasq_Walk_down_right_t1.png` | 1 | `anim/sasq_Walk_down_right.txt` | [251e50858c27](_history/anim/sasq_Walk_down_right_t1.txt) | log 回填 | 採用 | 現行檔已改 |
| `anim/sasq_Walk_down_t1.png` | 1 | `anim/sasq_Walk_down.txt` | [1220977f737a](_history/anim/sasq_Walk_down_t1.txt) | log 回填 | 採用 | 現行檔已改 |
| `anim/sasq_Walk_right_t1.png` | 1 | `anim/sasq_Walk_right.txt` | [27c3873b0024](_history/anim/sasq_Walk_right_t1.txt) | log 回填 | 採用 | 現行檔已改 |
| `anim/sasq_Walk_up_right_t1.png` | 1 | `anim/sasq_Walk_up_right.txt` | [c7f66170be1d](_history/anim/sasq_Walk_up_right_t1.txt) | log 回填 | 未採用：懷疑圍巾換邊（複查後同側）；prompt 加圍巾同側句後重生 t2、t3 | 現行檔已改 |
| `anim/sasq_Walk_up_right_t2.png` | 2 | `anim/sasq_Walk_up_right.txt` | [75d408459483](_history/anim/sasq_Walk_up_right_t2.txt) | log 回填 | 採用 |  |
| `anim/sasq_Walk_up_right_t3.png` | 3 | `anim/sasq_Walk_up_right.txt` | [75d408459483](_history/anim/sasq_Walk_up_right_t3.txt) | log 回填 | 未採用：與 t2 同 prompt，t2 步幅較清楚 |  |
| `anim/sasq_Walk_up_t1.png` | 1 | `anim/sasq_Walk_up.txt` | [73909440dd26](_history/anim/sasq_Walk_up_t1.txt) | log 回填 | 採用 | 現行檔已改 |

## 靜態圖（`art/raw/`）

| 產出 | take | prompt 檔 | 快照 sha | 快照來源 | 狀態 | 備註 |
|---|---|---|---|---|---|---|
| `enemy_greyling_1.png` | 1 | `enemy_greyling.txt` | — | 未知：prompt 檔 11:39 晚於產出 11:35 | 採用 |  |
| `hero_bigfoot_1.png` | 1 | `hero_bigfoot.txt` | — | 未知：prompt 檔 11:39 晚於產出 11:35 | 採用 |  |
| `icon_bounty_1.png` | 1 | `icon_bounty.txt` | [01b9b076e389](_history/static/icon_bounty_1.txt) | prompt 檔回填（早於產出） | 採用 |  |
| `icon_campfire_1.png` | 1 | `icon_campfire.txt` | [49b2ef660ee6](_history/static/icon_campfire_1.txt) | prompt 檔回填（早於產出） | 採用 |  |
| `icon_ecto_1.png` | 1 | `icon_ecto.txt` | [5f47151a6d42](_history/static/icon_ecto_1.txt) | prompt 檔回填（早於產出） | 採用 |  |
| `icon_p_cooldown_1.png` | 1 | `icon_p_cooldown.txt` | [ea466d7e7a26](_history/static/icon_p_cooldown_1.txt) | prompt 檔回填（早於產出） | 採用 |  |
| `icon_p_hp_1.png` | 1 | `icon_p_hp.txt` | [034b38fffe7a](_history/static/icon_p_hp_1.txt) | prompt 檔回填（早於產出） | 採用 |  |
| `icon_p_magnet_1.png` | 1 | `icon_p_magnet.txt` | [8e3549958f63](_history/static/icon_p_magnet_1.txt) | prompt 檔回填（早於產出） | 採用 |  |
| `icon_p_might_1.png` | 1 | `icon_p_might.txt` | [802226c6e5ae](_history/static/icon_p_might_1.txt) | prompt 檔回填（早於產出） | 採用 |  |
| `icon_p_speed_1.png` | 1 | `icon_p_speed.txt` | [4a1d951cc28f](_history/static/icon_p_speed_1.txt) | prompt 檔回填（早於產出） | 採用 |  |
| `icon_p_speed_2.png` | 2 | `icon_p_speed.txt` | [4a1d951cc28f](_history/static/icon_p_speed_2.txt) | prompt 檔回填（早於產出） | 未採用：同一 session 產出的第 2 張；atlas 只讀 _1 |  |
| `icon_pinecone_1.png` | 1 | `icon_pinecone.txt` | [1d4511454f89](_history/static/icon_pinecone_1.txt) | prompt 檔回填（早於產出） | 採用 |  |
| `icon_skull_1.png` | 1 | `icon_skull.txt` | [fb22591879eb](_history/static/icon_skull_1.txt) | prompt 檔回填（早於產出） | 採用 |  |
| `icon_snack_1.png` | 1 | `icon_snack.txt` | [2c14e88ce2c0](_history/static/icon_snack_1.txt) | prompt 檔回填（早於產出） | 採用 |  |
| `icon_static_fur_1.png` | 1 | `icon_static_fur.txt` | [abfe98ef4791](_history/static/icon_static_fur_1.txt) | prompt 檔回填（早於產出） | 採用 |  |
| `key_art_1.png` | 1 | `key_art.txt` | — | 未知：prompt 檔 11:39 晚於產出 11:35 | 採用 |  |
| `native_greyling_1.png` | 1 | `native_greyling.txt` | [1bcca41fce21](_history/static/native_greyling_1.txt) | prompt 檔回填（早於產出） | 採用 |  |
| `native_hero_1.png` | 1 | `native_hero.txt` | [dce833ca710f](_history/static/native_hero_1.txt) | prompt 檔回填（早於產出） | 採用 |  |
| `prop_pine_1.png` | 1 | `prop_pine.txt` | — | 未知：prompt 檔 11:39 晚於產出 11:35 | 採用 |  |
