# PR #6｜個人品味護照與OTT訂閱研究人工驗收

本PR接續PR #5，仍是Stacked Draft PR。**不修改master、不自動合併。**

## 啟動
```bash
git fetch origin
git switch feat/watchpilot-taste-subscriptions
npm ci
npm run test:watchpilot
npm run type-check
npm run lint
npm run build
npm run dev
```

在本機開啟`http://localhost:3000/lab/strategy`。**不需要TMDB或Jev金鑰。**

## 人工驗收
- [ ] 不填任何API Key可直接開啟策略頁。
- [ ] 初始價格明確標記為**合成示例**，不可被看成台灣各平台現價。
- [ ] 喜歡科幻後，相關合成片加分；避開科幻後，相關片應排除；已看電影不再進入排程。
- [ ] 重新載入瀏覽器，品味護照保留且適用於`/lab`、`/lab/tw`及雷達重新排程。
- [ ] 取消目前訂閱但已預付至某日期，日期之前仍可安排合成電影；之後不能繼續看。
- [ ] 目前已付費期限超過30天的年訂，未來新增費用應為0，不可宣稱已省下一整年費用。
- [ ] 自行輸入真實費用時，未勾選人工確認就不能產生策略。
- [ ] 月繳在計畫期間發生續費，詳細結果列出日期與金額；年繳方案按整期金額計費，不自動按月攤銷成可避免費用。
- [ ] 四種方案的每週與每日看片時數、片源可用時段均符合限制。
- [ ] 「未來費用差額」允許負值，不應顯示為實際現金節省。
- [ ] 儲存訂閱設定、重開頁面後可讀回；按清除時只刪本功能資料，不刪其他雷達紀錄。
- [ ] 切回既有`/lab`、`/lab/tw`、`/lab/radar`及`/lab/compare`，確認沒有回歸錯誤。

## 自動測試
`tests/watchpilot-taste.test.mjs`與`tests/watchpilot-subscriptions.test.mjs`加入23項測試；
`tests/watchpilot-research-plan.test.mjs`補2項本機品味記憶整合測試。
同時檢查TypeScript、Lint及完整Next.js build。

## 目前不驗收的功能
- 真實OTT版權到期、即時價格、自動訂閱／取消。
- 帳戶自動登入、推薦內容是否真能觀看。
- 多用戶同步或廣告／聯盟行銷。
- 數學上的全域觀影最佳解。
