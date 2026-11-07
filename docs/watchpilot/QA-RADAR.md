# WatchPilot Lab｜PR #3台灣片庫雷達人工驗收

## 前置條件
PR #3為PR #2的疊加式Draft PR，尚未合併master。請先確保PR #1、#2完成自動CI與人工驗收。

```bash
git fetch origin
git checkout feat/watchpilot-catalog-radar
npm ci
npm run test:watchpilot
npm run type-check
npm run lint
npm run dev
```

## 沒有TMDB Key的離線驗收
1. 開啟`http://localhost:3000/lab/radar`。
2. 按「展示離線合成IN／OUT演練」。
3. 應看到一部**合成研究影片**的BASELINE、MISSING_FIRST、MISSING_REPEATED三種事件。
4. 所有合成事件要明確顯示為Fixture，不可宣稱真實OTT下架。
5. 關閉演練後，不得把合成快照寫進真實研究紀錄。

## 有TMDB Key的真實觀測測試
1. 在本機`.env.local`設定個人`MOVIE_DB_API_KEY`，不可提交GitHub。
2. 開`http://localhost:3000/lab/tw`搜尋一部有台灣片源資訊的電影，按「加入雷達」。
3. 開`http://localhost:3000/lab/radar`，應看到該片已追蹤及BASELINE事件。
4. 點「重新查詢」後，若片源未變，不應自動宣稱新上線或下架。
5. 移除追蹤作品後，其快照與人工查核紀錄都應消失。
6. 關閉、重開瀏覽器，本機追蹤資訊應保留。
7. 手動清除本機資料，紀錄應完全消失。
8. 沒有TMDB Key或TMDB回傳錯誤時，應出現SOURCE_FAILED，而不是MISSING_FIRST／MISSING_REPEATED。
9. 使用者實際查看官方公告並輸入HTTPS來源、平台、日期、核對勾選後，才允許儲存使用者人工查核期限。
10. 嘗試http來源或未勾選核對，應被拒絕。
11. 當人工查核日期早於排程日期，該平台的作品應被排除；資料仍應保留`OBSERVED`可用性等級。
12. 用相同訂閱與時數生成計畫，隨後改變期限或片源資料，再次生成應顯示新舊差異。

## 自動化測試要求
- baseline不能算newly_on_platform。
- 第一次缺失僅能表示觀測異常。
- 缺失重複需相隔至少24小時；不得當成官方下架。
- 同平台訂閱改租借只能顯示ACCESS_CHANGED。
- 失敗快照不可包含offer，且不能推進確認缺失計數。
- 手動期限必須有有效HTTPS來源、合法日期與使用者核對。
- 手動期限不得提升第三方來源可用性可信等級。
- 本機快照保留期限30天，每部最多20筆。

## 未完成的外部驗證
- GitHub Actions目前尚未取得執行證據；請在Repo的Actions設定確認Fork工作流程啟用狀態。
- 真實OTT片庫與TMDB間的20部作品交叉查核尚未完成。
- 沒有官方資料API或人工查核，不會提供自動官方下架倒數。
- 此原型僅支援**手動重新查詢**，並非24小時背景監控服務。
