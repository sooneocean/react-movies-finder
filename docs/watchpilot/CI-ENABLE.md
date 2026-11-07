# GitHub Actions｜Fork啟用與驗收

截至2026-11-07，WatchPilot Lab PR #1、#2、#3已開立，但連接器查詢GitHub Actions目前回傳0筆工作流程執行紀錄，**不能視為自動測試通過**。

## Fork專案啟用
1. 開啟https://github.com/sooneocean/react-movies-finder/actions
2. 如果GitHub顯示Fork的Actions需要使用者啟用，閱讀工作流程內容後按頁面提供的啟用按鈕。
3. 到PR #1、#2、#3的Checks頁檢查是否有執行；若沒有，可手動在本機執行測試，並由GitHub上可見的Actions設定判定是否需要重新觸發。
4. 任何測試失敗都保留Draft PR，不合併master。

## 必須確認的指令
```bash
npm ci
npm run test:watchpilot
npm run type-check
npm run lint
npm run build
```

## 注意
- 上游原始主站的Next.js build可能需要TMDB環境變數；個人Fixture測試不應需要Key。
- GitHub Actions中的任何私人金鑰均應儲存在GitHub Secrets，不得提交原始碼或寫入CI日誌。
- 若沒有合法的CI Key，應先將純函式單元測試作為必要檢查，並明確標註需要外部資料的整合測試尚未驗證。
- GitHub Issues功能若要用於TODO管理，需在Repository Settings啟用，因目前API嘗試建立Issue收到「Issues has been disabled」。
