# ADR-005｜Jev與規則式觀影選擇A/B研究

## 設計目標
第一輪只比較「**今晚先看哪部**」，不把硬限制與OTT片庫事實交給Jev。研究者仍是單一使用者。已通過`planViewing`的合格候選（最多6部）才可以進入A/B比較。

## 三種判斷
- **A｜排程分數（免費）**：現有Greedy排程策略中的`planScore`最高者。
- **B｜品質分數（免費）**：同一候選中`qualityScore`最高者，不是AI。
- **C｜Jev Choice（自帶Key、明確啟用才呼叫）**：由TypeSafe System One的`choice`問「哪部最符合今晚觀影意圖」。預設完全停用。此決策只在同一候選集合中選擇，不得編造片源、期限或作品。

## 付費與資料安全
- 原生fetch呼叫`POST https://api.typesafe.ai/v1/systemone`，請求包含`model=jev-latest`、`state`與`questions.tonight`。
- `TYPESAFE_API_KEY`僅保存在本機伺服器`.env.local`；任何Key不得傳到瀏覽器、git或測試資料。
- 必須手動設定`WATCHPILOT_ENABLE_JEV=1`，只允許`NODE_ENV=development`與localhost來源。
- 前台只有研究者**按下付費測試按鈕並確認**，才會要求Jev。每次請求最多6個已排程的合成候選。
- 每30秒最多嘗試一次，在非成功回覆、429或網路異常時也不自動重試；不同執行程序的限流不是全域保證，**不得對公開網路部署這個按需付費端點**。
- 模型回覆必須是請求列出的`opt_1`到`opt_N`之一，機率與信心需合法；無效回應拒絕，不可轉成假的Jev答案。
- 記錄模型實際servedModel和已回報的輸入Token數；未回報使用量標示未知，不臆測成本。
- 資料只來自WatchPilot合成Fixture＋使用者輸入的簡短觀影需求；現階段不向外部Jev傳送TMDB／JustWatch原始資料、觀影歷史或登入資訊。

## 可比較的實驗資料
採用同一時段、同一個人偏好、相同合成片單，記錄A/B/C推薦差異和使用者本人實際偏好。前台回饋只存瀏覽器localStorage，最多50筆，不能推論整個台灣市場。

## 驗證
已在獨立Node.js 22本機測試執行14項新純函式與HTTP Mock測試且通過；這**不代表整個Screenbox／Next.js專案建置成功**。GitHub PR和CI須另行驗收。

## 資料來源
- TypeSafe官方SDK： https://github.com/typesafe-ai/typesafe-sdk-js
- TypeSafe API文件： https://docs.typesafe.ai/
- 官方Quickstart： https://www.typesafeai.org/guides/jev-api-quickstart
