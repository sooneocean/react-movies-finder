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

## WP-004｜IN／OUT片庫變動（PR #3）
- [x] BASELINE／NEWLY_OBSERVED／ACCESS_CHANGED／MISSING_FIRST／MISSING_REPEATED／RETURNED_OBSERVED事件
- [x] 只有成功觀測可產生片源IN／OUT事件，失敗僅記稽核
- [x] 兩次缺失至少相隔24小時，且仍不宣稱版權到期
- [x] 自己查閱官方公告後可手動儲存USER_REVIEWED_OFFICIAL期限
- [x] 人工查核期限與片源OBSERVED可信度保持分離
- [x] 重新規劃觀影計畫並顯示新增／移除差異
- [x] 本機少量快照記錄與30天資料保留
- [x] 合成IN／OUT演練頁，不需要任何金鑰
- [ ] GitHub Actions通過＋研究者瀏覽器驗收
- [ ] 20部台灣電影片源人工交叉驗證
- [ ] 正規官方OTT公告Adapter及自動來源核驗
- [ ] 本機可選合法排程器（目前仍為手動查詢）

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

## WP-004B｜LINE TV官方下架公告Adapter（PR #4）
- [x] 確認LINE TV台灣官方客服公開下架清單URL與公告日23:59規則
- [x] 僅允許LINE TV台灣文章、拒絕相似域名及其他地區文章
- [x] 支援官方常見三欄／Tab／純文字下架資料解析與日期驗證
- [x] 完全重複資料去重，片名多日期衝突阻止匯入
- [x] 只針對使用者的追蹤電影提出完全同名配對建議
- [x] 需逐筆核對及明確同意，才將期限寫進本機研究工作區
- [x] 若無LINE TV觀測片源，不自行創造可觀看權益
- [x] 加入離線解析單元測試與人工驗收文件
- [ ] 實際Node單元測試、TypeScript檢查、Next.js完整建置證據
- [ ] 研究者對當前LINE TV公告頁面執行手動核對
- [ ] 後續可選擇合法官方更新接口，實作來源按需檢查
