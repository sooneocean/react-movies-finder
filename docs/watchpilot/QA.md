# WatchPilot Lab｜v0.0.1人工驗收

## 本機執行
1. `npm ci`
2. `npm run test:watchpilot`
3. `npm run type-check`
4. `npm run dev`，瀏覽器前往`http://localhost:3000/lab`

注意：原始Screenbox其他頁面依賴TMDB API金鑰。`/lab`為離線Fixture，無金鑰即可使用。

## 必測案例
- [ ] 選Netflix＋Disney+、每週6小時，執行後產生清單與各日期分配。
- [ ] 取消Disney+後，不能再排入只有Disney+的樣本。
- [ ] 取消所有訂閱後，不能把僅限訂閱觀看的測試作品排入。
- [ ] 輸入「不要恐怖片」後，不能排入恐怖樣本。
- [ ] 將可觀看時數改為1小時，不得超過60分鐘。
- [ ] 檢查所有作品都標明「研究樣本／Fixture」。
- [ ] 確認測試到期日期沒有被呈現為實際OTT下架資訊。
- [ ] 選擇未來日期與不同平台後可再次產生計畫。

## 驗收資訊
請記錄：Git Commit、瀏覽器版本、測試案例、預期結果、實際結果及截圖／錯誤訊息。

## 已知限制
- 本PR未整合真實片源與Jev API。
- 中文輸入是有限關鍵字規則，尚非LLM。
- Greedy排程不保證全域最優。
- 未完成跨瀏覽器E2E及人工驗收。
