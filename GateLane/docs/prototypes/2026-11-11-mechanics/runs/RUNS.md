# GateLane 機制原型量測紀錄（2026-11-11，第二輪，依 Codex 審查修正後）

原型：`../prototype.diff` 套在 GateLane/game 的副本上（sim v3 + PROTO 開關）
指令：`PROTO=<組合> PROTO_HZ=<halfGap,killPct,period> node tools/skill-dominance.mjs 30 --baseline`
預設 PROTO_HZ = 150,100,180。種子：hash32(2026, 7, i)，i = 0..29。

修正：分道牆改成整個隊形不得越牆；第二列門值以預告牌在第一列可見時公開（bot 只在第一列入畫面後讀）；
柵欄改成依隊形超出缺口的比例受傷（loss = troops × 超出寬度 ÷ 隊形寬 × killPct）；加入 Codex 的 C1–C5 基準策略。

| 檔案 | PROTO | PROTO_HZ | expert | inter | 技巧佔比 | 高手 vs 中手 | 最佳基準策略 |
|---|---|---|---|---|---|---|---|
| run_B.md | B | — | 4202 | 3300 | 84.0% | 93.3% | 牆前算兩列 47.9% |
| run_ABG.md | ABG | — | 4186 | 3342 | 87.9% | 93.3% | 永遠選成長門 51.9% |
| run_fixedgap.md | ABGC | 150,100,0 | 4211 | 3162 | 94.5% | 100% | C4 口訣 48.9% |
| run_base.md | ABGC | 150,100,180 | 4214 | 3260 | 96.1% | 100% | 柵欄回中間 22.7% |
| run_wide50.md | ABGC | 190,50,180 | 4214 | 3503 | 94.8% | 86.7% | 柵欄回中間 41.7% |
| run_mid50.md | ABGC | 170,50,180 | 4214 | 3489 | 95.0% | 86.7% | 柵欄回中間 36.9% |

mid50 柵欄碰撞率：novice 71%、intermediate 22%、expert 0%、C4 77%；難度曲線 D1–D6 全過（pt_mid50.md）。
