# WatchPilot Lab｜v0.7瀏覽器E2E驗收

## 目的與範圍

本階段只驗證目前個人非營利研究版的**實際頁面操作**，不向TMDB、Jev或任何OTT平台進行付費請求。以Chrome內核（Playwright Chromium）、Next.js本機開發伺服器與合成Fixture完成以下操作。

涵蓋8項瀏覽器情境：
1. 無私人API金鑰時的WatchPilot研究首頁與`/lab`進入。
2. Fixture七天排程、明確排除恐怖類型、取消OTT訂閱後不誤排、每週1小時不超時。
3. 品味護照「避開科幻」儲存、重整後保留，並在`/lab`正確排除科幻樣本。
4. 30天訂閱模擬產出四種方案，明示合成費率及未來費用差額不等於真正省下的錢。
5. 雷達Fixture IN／OUT演練及返回真實觀測紀錄。
6. 無TMDB Key時台灣片源查詢明確返回錯誤，不偽裝已下架。
7. LINE TV官方公告人工貼上合成文字後能解析，但無追蹤作品時不能直接核准。
8. 免費A／B規則比較成功，沒有呼叫付費Jev的虛假結果。

## CI執行方式

`.github/workflows/watchpilot-validation.yml`新增`browser-smoke`Job，與原`offline-tests`並行。

- 首先執行`npm ci`（既有Lockfile）。
- 僅在此CI Job安裝固定版`@playwright/test@1.56.1`（`--no-save --package-lock=false`，不改產品本身依賴）。
- 安裝Playwright Chromium與必要Linux依賴。
- Playwright以`127.0.0.1:3000`啟動Next.js，環境變數強制清空`MOVIE_DB_API_KEY`、`TYPESAFE_API_KEY`並設定`WATCHPILOT_ENABLE_JEV=0`。
- 任一測試失敗即將截圖、Trace及錄影上傳為`watchpilot-e2e-failure`，供除錯；注意失敗影片／截圖可能含當次合成測試情境，切勿放入私人資料。

## 個人本機重跑

先切到`feat/watchpilot-e2e-qa`並安裝既有依賴：

```bash
npm ci
npm install --no-save --package-lock=false @playwright/test@1.56.1
npx playwright install chromium
MOVIE_DB_API_KEY= TYPESAFE_API_KEY= WATCHPILOT_ENABLE_JEV=0 npx playwright test --config=tests/e2e/playwright.config.mjs
```

上述變數清空寫法適用macOS／Linux Shell；Windows PowerShell請在同一個Session分別設定`$env:MOVIE_DB_API_KEY=""`、`$env:TYPESAFE_API_KEY=""`、`$env:WATCHPILOT_ENABLE_JEV="0"`後，再執行`npx playwright test --config=tests/e2e/playwright.config.mjs`。

測試預設使用單個Worker以降低本機Next.js開發模式重新編譯競爭。

## 驗收與限制

- GitHub Actions若為綠燈，只代表**自動化瀏覽器Fixture流程通過**；不能宣稱真實OTT版權、實際播放、Jev計費、使用者主觀觀影體驗皆已驗證。
- 仍需研究者手動依`QA.md`、`QA-TW.md`、`QA-RADAR.md`、`QA-LINE-TV.md`、`QA-JEV.md`與`QA-STRATEGY.md`完成真人驗收。
- 此PR不直接更新上游Fork的`master`；維持Draft直至研究者核准。
