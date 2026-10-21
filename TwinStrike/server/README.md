# 喵拳道場 後端雛形（路線 A：台灣 F2P 排位）

每日題目、重播驗分、排行榜、訪客帳號。設計與取捨見 [docs/backend_design.md](../docs/backend_design.md)。

- **零執行期依賴**：只用 Node 內建模組（`node:http`、`node:crypto`、`node:fs`），不需要 `npm install`。
- **不另寫 sim**：`src/sims.js` 直接 import `../game/src/sim/` 的 `sim.js`、`core/index.js`（`verify`）、`core/input.js`（`macroSuspicion` / `errorSuspicion`）——跟用戶端同一份檔案。
- 需要 Node ≥ 20（開發時用 24.14 測過）。

## 啟動

```bash
cd TwinStrike/server
npm start
```

預設 `http://localhost:8787`，資料存在 `server/data/store.json`（已加進 `.gitignore`）。

| 環境變數 | 預設 | 說明 |
|---|---|---|
| `DAILY_SECRET` | 開發用固定值（會警告） | 每日種子的 HMAC 金鑰。`NODE_ENV=production` 時必填，否則拒絕啟動 |
| `ADMIN_TOKEN` | 無（審核端點關閉） | `/admin/*` 的 Bearer token |
| `PORT` | `8787` | |
| `DATA_FILE` | `server/data/store.json` | JSON 存檔位置 |
| `CORS_ORIGIN` | 開發 `*`、正式 `null` | 正式環境填遊戲網域 |

試打一輪：

```bash
curl http://localhost:8787/daily
```

```bash
curl -X POST http://localhost:8787/account/guest -H "content-type: application/json" -d "{\"name\":\"cat\"}"
```

```bash
curl http://localhost:8787/leaderboard/2026-10-21
```

上傳成績：`POST /submit`，`Authorization: Bearer <token>`，body `{ "date": "<GET /daily 的 date>", "upload": <Recorder.upload()> }`。

## 端點

| 端點 | 說明 |
|---|---|
| `GET /health` | 載入的 sim 版本、伺服器今天的日期 |
| `GET /daily[?date=]` | 當日（台北）題目：`seed`、`version`、`maxScore`、開放 / 截止時間。未來日期 404 |
| `POST /account/guest` | 建訪客帳號，回 token（只顯示這一次） |
| `POST /account/line` | 501，尚未實作（設計見 §2.4） |
| `POST /submit` | 硬檢查 → `verify()` 重播 → 分析重播標記 → `ok` 上榜或 `review` 待審 |
| `GET /leaderboard/:date[?limit=]` | 每人當日最佳公開成績；帶 token 會多回 `me` |
| `GET /admin/review-queue` | 待審成績與標記原因 |
| `POST /admin/runs/:id/review` | `{ "decision": "clear" \| "void", "note": "…" }` |

錯誤碼一覽在設計文件 §2.2。

## 測試與效能

```bash
npm test
```

`test/server.test.mjs`（9 項）經由 HTTP 驗證：合法上傳通過並排名、竄改分數被拒、版本不符回 409、超過理論滿分被拒、錯種子 / 過期 / 延遲校正越界 / 抄別人 log / 未登入被拒、bot 式成績進審核且審核後上榜、重複驗證失敗的帳號被送審、滿局驗證 < 500 ms。測試用遊戲的 `tools/bots.mjs` 產生真實的上傳。

```bash
npm run bench
```

各 bot 50 局的驗證耗時（verify 重播 + 分析重播）。2026-10-21 在 i5-12500 / Node 24.14：滿局 p50 ≈ 4.4 ms、p99 ≈ 7.7 ms。

## 檔案

| 檔案 | 內容 |
|---|---|
| `src/sims.js` | 依版本號載入遊戲 sim；換版時舊版凍結到 `server/sims/v<N>/` 再加一列 |
| `src/daily.js` | 台北換日、HMAC 種子 |
| `src/check.js` | 驗分流程（純函式）：形狀 → 題目 / 版本 / 時間 → 理論滿分 → 校正範圍 → `verify()` → 標記 |
| `src/app.js` | HTTP 路由、帳號、排行、審核 |
| `src/store.js` | 記憶體 + JSON 檔儲存（欄位對應設計文件 §6，換 Postgres 只改這裡） |
| `src/main.js` | 讀環境變數並啟動 |
