# Cloudflare正式版啟用｜一次性GitHub授權

更新：2026-11-08

## 目前狀態（由Cloudflare與GitHub實際驗證）

- 公開Lite研究站：**https://watchpilot-lab-research.sooneocean.workers.dev/**。Cloudflare已實際部署，Chromium遠端E2E通過。
- 完整版`watchpilot-lab`：Cloudflare API已建立獨立Worker，**workers.dev公開子網域目前關閉**，避免佔位程式被當成正式完成品。
- 完整Next.js程式已在`feat/watchpilot-vinext-generated`建置為vinext Workers，GitHub Actions的Build與本機Workers Preview已成功。
- Cloudflare目前**沒有Workers Builds Token**；連接repo的API回應`8000008`，表示Cloudflare尚未授權對GitHub帳戶的存取。ChatGPT連接的GitHub工具權限無法替Cloudflare GitHub App授權。
- 不要直接連`master`，因WatchPilot PR目前還採堆疊審查，尚未合併。

## 你只需在Cloudflare做一次的操作

1. 開啟 **https://dash.cloudflare.com/?to=/:account/workers-and-pages**，選到Cloudflare帳號。
2. 找到已建立的**`watchpilot-lab`**（不是`watchpilot-lab-research`），點進去。
3. 前往 **Settings → Builds → Connect → GitHub**。
4. 依Cloudflare畫面完成**Cloudflare GitHub App安裝／Repository授權**；只開放`sooneocean/react-movies-finder`即可。
5. 選取`sooneocean/react-movies-finder`、分支`feat/watchpilot-vinext-generated`、根目錄`/`。
6. 安裝命令使用`npm ci`；Build command使用`npm run build:vinext`；Deploy command使用`npm run deploy:vinext`（如控制台顯示不同預設，依當時Cloudflare Builder與專案腳本確認）。
7. 先**不要**設定`MOVIE_DB_API_KEY`、`TYPESAFE_API_KEY`或啟用`WATCHPILOT_ENABLE_JEV`。公開版本的TMDB代理在production會直接403，Jev付費API僅供本機開發，避免任何人濫用第三方金鑰。
8. 首次Build／Deploy成功後，先查Worker部署狀態、靜態資源與應用Health，再決定是否啟用`watchpilot-lab.sooneocean.workers.dev`公開網址。

## 發布後的最低驗收條件

- `/`、`/lab`、`/lab/compare`、`/lab/strategy`、`/lab/radar`、`/lab/verify`可開啟，不產生500。
- `/lab`七天觀影計畫、品味設定LocalStorage、訂閱情境都可正常使用。
- `POST /api/watchpilot/decision/compare`的**免費**同源Fixture比較可正常使用；`useJev=true`不得呼叫付費Jev。
- `GET /api/watchpilot/tw/search`與`GET /api/watchpilot/tw/title`在production皆返回`403 PUBLIC_TMDB_DISABLED`，不可允許匿名TMDB代理。
- 不得公開任何API Key、個人觀看紀錄或未授權片庫快照。
- 全部功能仍只代表研究／合成Fixture，不等於真實OTT平台上架、下架或停訂節省證明。
- 在正式部署／公開網址E2E與人工驗收之前，保留PR Draft。

## 需要後續升級才會開放的能力

要在Cloudflare提供「真正即時台灣OTT資料」給匿名使用者，需要先完成官方API授權、Cloudflare Access／使用者驗證、每IP與每帳戶限流、快取與資料來源核對。**不可在公網站直接加入個人TMDB Key變成無限制查詢代理。**

參考：https://developers.cloudflare.com/workers/ci-cd/builds/ 、https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/ 。
