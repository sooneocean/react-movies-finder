# WatchPilot Lab v0.8｜台灣OTT片源交叉驗證QA

## 建置與測試

```bash
git fetch origin
git switch --track origin/feat/watchpilot-tw-verification
npm ci
npm run test:watchpilot
npm run type-check
npm run lint
npm run build
npm run dev
```

若本地分支已存在，請執行`git switch feat/watchpilot-tw-verification`。

啟動後：
- `http://localhost:3000/lab/verify`：交叉驗證研究工作台。
- `http://localhost:3000/lab/tw`：需要使用者自帶TMDB Key才能搜尋真實電影；按「加入雷達」。
- `http://localhost:3000/lab/radar`：查看已追蹤電影及手動更新片源。

## 無金鑰離線測試

1. 前往`/lab/verify`，點擊「顯示離線Fixture演練」。
2. 應看到兩部標記為Fixture的虛構作品：一筆兩來源一致、一筆不一致。
3. 研究門檻必須顯示尚未達成，不能因為兩筆比對就宣稱台灣平台片庫準確。
4. 在已訂Netflix條件下產生研究片單，只能排入一致的Fixture A，不得排入不一致的Fixture B。
5. 結束演練，必須恢復原本的個人資料，不可將合成Fixture寫入真實研究紀錄。

## 真實資料逐部測試（需要使用者自備API Key）

1. 在`.env.local`自行設定`MOVIE_DB_API_KEY`，開啟`/lab/tw`搜尋並加入追蹤電影。
2. 至少20部電影，涵蓋至少兩個OTT，每個平台至少核對5筆。不可憑搜尋到的片名自動聲稱官方可看。
3. 開啟`/lab/verify`選取作品與平台，親自檢查OTT網站，輸入看見的實際存取方式，貼上HTTPS頁面連結並勾選查核。
4. 核對時間必須以使用者主動提交當下的時間保存，原TMDB快照時間不得被覆寫。
5. 當查核結果與TMDB一致，顯示`MATCH`；不同時顯示`DISAGREEMENT`，不能自動產生看片權益。
6. 超過72小時、TMDB重新更新或追蹤作品消失，應標記`STALE`，不可進入研究片單。
7. 指定租借、購買、含廣告或未知狀態不能自動當作訂閱可看的來源。
8. 僅當至少20部、兩平台各5筆、一致率至少80%且沒有失效紀錄時，才顯示「達到最小研究門檻」，仍不得宣稱完整台灣平台準確。
9. 改變已訂閱平台與品味護照，7天片單不得違反使用者時間、平台、排斥類型及已看狀態。
10. 自己核對的官方下架期限應保留於排程資料，不得被錯誤轉換丟失。
11. 重新整理瀏覽器後人工核對仍存在，刪除後不再計入驗證；資料不得傳到雲端或GitHub。

## 自動化與人工驗收邊界

`tests/watchpilot-crosscheck.test.mjs`覆蓋不完整來源、72小時時效、同名／作品範圍、存取權益分離及研究門檻；
`tests/e2e/watchpilot-smoke.spec.mjs`增加Fixture與人工核對本機持久化的瀏覽器案例。

CI通過只能表示程式及合成情境可重現；**實際20部台灣OTT作品的人工交叉驗證仍須研究者完成**。
