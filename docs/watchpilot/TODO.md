# WatchPilot Lab｜開發TODO

> 以獨立分支與PR開發，**不得直接改master**。資料來源與授權檢查優先於全面監控。

## WP-001｜v0.0.1：離線7天決策實驗室（本PR）
- [x] 確認Fork權限與保留MIT License
- [x] 建立/watchpilot資料型別與資料可信度規則
- [x] 實作Greedy確定性排程基準
- [x] 新增研究Fixture及中文偏好關鍵字解析
- [x] 建立/lab互動頁、平台與每週時數設定
- [x] 從既有Header提供入口
- [x] 用真正的自動化測試取代原npm test空實作
- [ ] GitHub CI執行成功
- [ ] 專案發起人實際在瀏覽器驗收

## WP-002｜持久化與上游功能整合
- [ ] 為既有localStorage收藏提供SQLite匯入（保留回退）
- [ ] 儲存已觀看、偏好及歷次計畫
- [ ] 不同日期、平台、時數及偏好可以重算
- [ ] 20組可重現繁中輸入情境

## WP-003｜台灣OTT資料（PR #2）
- [x] TMDB zh-TW伺服器端查詢及results.TW限定解析
- [x] 區分訂閱／免費／含廣告／租／買
- [x] 來源時間與JustWatch/TMDB署名
- [x] TMDB可觀測候選接到7天研究排程
- [x] 無API Key時保持Fixture可用
- [x] 為TW資料、邊界與部分失敗新增單元測試
- [ ] GitHub CI真實執行與TypeScript建置結果
- [ ] 研究者在本機提供TMDB Key並實測
- [ ] 以官方OTT來源交叉驗證20部作品及實際平台覆蓋
- [ ] 確認TMDB官方Logo顯示正確及來源署名符合要求
- [ ] 公網部署前增加認證／限流與授權檢查

## WP-004｜IN/OUT片庫變動
- [ ] FIRST_SEEN、UPCOMING、LEAVING_CONFIRMED、REMOVED_OBSERVED、RETURNED、ACCESS_CHANGED
- [ ] 同步失敗隔離，絕不當成下架
- [ ] 有官方證據才能顯示確定下架倒數
- [ ] 下架變更重新提出計畫，使用者確認採納

## WP-005｜AI與最優化實驗
- [ ] 規則排序 vs Jev Choice/Score對照
- [ ] LLM中文意圖抽取選配；禁止編造片庫事實
- [ ] 找出Greedy反例，必要時升級精確求解器
- [ ] 紀錄模型版本、Token成本與輸出品質

## WP-006｜訂閱與成本分析
- [ ] 輸入真實價格、年繳／月繳及續期日期
- [ ] 依片單覆蓋與觀看時間模擬訂閱輪替
- [ ] 沉沒成本不得當可節省金額

## Definition of Done
型別檢查、單元測試與CI通過；沒有API Key可運行合成模式；公開Repo不含私密Key或受限片庫快照；由研究者完成瀏覽器驗收。
