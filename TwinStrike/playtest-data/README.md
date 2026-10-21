# 試玩紀錄

把試玩者匯出的 `twinstrike-playtest-<代號>-<日期>.json` 放在這個資料夾，然後在專案根目錄執行：

```
npm --prefix TwinStrike/game run human-report
```

報告會寫到 `TwinStrike/docs/human_playtest_report.md`。流程見 [docs/human_playtest_plan.md](../docs/human_playtest_plan.md)。

`simulated/` 是角色扮演 bot 產生的**模擬**紀錄（`game/tools/persona-playtest.mjs`）。`npm run human-report` 只讀這個資料夾根目錄的 .json，不會讀到 `simulated/`，所以真人檔案直接放在根目錄即可。
