# WatchPilot Lab｜PR #5 A/B觀影決策測試與驗收

## 基本測試
```bash
git fetch origin
git checkout feat/watchpilot-jev-ab
npm ci
npm run test:watchpilot
npm run type-check
npm run lint
npm run dev
```

開啟`http://localhost:3000/lab/compare`。

## 沒有付費Key的驗收
- [ ] 保持`.env.local`不含`TYPESAFE_API_KEY`與`WATCHPILOT_ENABLE_JEV`。
- [ ] 點「免費規則式A/B比較」，產生A（排程分數）及B（品質分數），C顯示「未呼叫」。
- [ ] 候選清單只包含已通過同一排程引擎的電影；全是合成Fixture，沒有真實OTT宣稱。
- [ ] 將每週時數改為1小時時，至少兩部候選條件不滿足，應提示不足，不應顯示假的模型結果。
- [ ] 點付費Jev按鈕，需要二次確認；未啟用時應返回明確訊息，不會發出TypeSafe API請求。
- [ ] 點選自己實際偏好的電影，會將極簡的實驗紀錄存本機，不上傳GitHub。

## 有付費Key的可選實測（非本次必備）
1. 在`.env.local`設定`TYPESAFE_API_KEY=自己的金鑰`和`WATCHPILOT_ENABLE_JEV=1`。
2. 使用`npm run dev`，僅在`localhost`開啟，不要部署到公網。
3. 使用者按下「呼叫Jev」並確認可能計費後，系統向TypeSafe送出至多一次有界Choice請求。
4. 回覆必須選自目前已通過硬限制的候選電影；顯示實際服務模型、信心及輸入Token（若API提供）。
5. 30秒內再次點擊應收到冷卻提示，不得連續重試或無聲新增費用。
6. 模型不可用、回傳不在候選清單內等狀況應出錯，不可假裝Jev已成功。
7. 對照使用者實際看片選擇，記錄分歧／一致。這是單人探索性研究，非盲測。

## 自動化測試
`tests/watchpilot-decision-ab.test.mjs`及`tests/watchpilot-jev-service.test.mjs`共14項，涵蓋邊界、回應格式、未啟用零網路呼叫、429不重試、拒絕未授權候選、模型版本與Token紀錄。

## CI狀態
原Fork Actions目前查不到歷史執行。PR #5新增`.github/workflows/watchpilot-validation.yml`監看`feat/watchpilot-*`push及stacked PR。是否實際啟動仍取決於GitHub Actions權限與Fork設定；未有官方Check結果前不能視為整個Repo CI通過。
