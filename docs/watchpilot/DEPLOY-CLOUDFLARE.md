# WatchPilot Lab｜Cloudflare Workers部署手冊

更新：2026-11-08。目標：非營利開源研究、公開可操作、無需秘密金鑰。

## 一、已發布的零金鑰研究版

**公開網址**：https://watchpilot-lab-research.sooneocean.workers.dev/

Cloudflare帳號已經透過已授權API建立獨立Worker：\`watchpilot-lab-research\`。
原始碼在\`deploy/cloudflare/research-worker.mjs\`，**不是完整Next.js程式**。

可直接使用：合成電影7天觀影排程、個人品味／已看記憶（瀏覽器localStorage）、30天訂閱情境與研究說明。

安全預設：無TMDB／Jev API Key，無需Cloudflare D1或R2，無個人資料伺服器端存放，沒有公開付費API代理；合成電影與範例費率一律明確標示。單一使用者測試為主，非OTT官方片庫服務。

已通過GitHub Actions（2026-11-07）：
- /health、首頁、JS與CSS的公開HTTP驗證。
- Chromium實際開啟公開網址，執行4項E2E：首頁、7天排程、品味儲存、訂閱模擬。
- Actions Run \`42398953695\`，亦有後續多次綠燈。

本Worker透過Cloudflare API上傳，**不會因為git push而自動更新**。

## 二、完整版Next.js Workers版本

在獨立分支\`feat/watchpilot-vinext-generated\`完成Cloudflare建置配置，並保持原本Next.js開發命令及全部WatchPilot原始碼。

- \`cloudflare.config.ts\`：Worker名稱\`watchpilot-lab\`（不同於Lite Worker）、vinext Server入口、Assets綁定。
- \`vite.config.ts\`：vinext與Cloudflare Vite plugin。
- \`package.json\`／\`package-lock.json\`：npm相容依賴，避免上游\`bun.lock\`造成vinext誤選套件管理器。
- \`npm run build:vinext\`：產生Cloudflare部署的完整Worker與靜態資源。
- \`.github/workflows/watchpilot-vinext-build.yml\`：無任何私人Key的Cloudflare產物建置驗證。
- \`/api/watchpilot/decision/compare\`允許同源、零金鑰的Fixture A/B；**只有localhost＋開發模式**才能啟用付費Jev。
- 其他包含TMDB的路由若未設定\`MOVIE_DB_API_KEY\`，回報沒有金鑰，不公開使用者的Key。

### 先行指令

\`\`\`bash
git fetch origin
git switch --track origin/feat/watchpilot-vinext-generated
npm ci
npm run test:watchpilot
npm run type-check
npm run lint
npm run build:vinext
\`\`\`

請勿把任何API Key放入GitHub或放在\`NEXT_PUBLIC_*\`環境變數中。

### 開始自動部署：Cloudflare控制台一次性連結GitHub

目前Cloudflare帳號可以管理Workers，但**尚未建立Workers Builds所需的GitHub App與Build Token**。所以ChatGPT與GitHub彼此連線，不代表Cloudflare的建置系統已取得GitHub儲存庫讀取權。

操作：
1. 打開 https://dash.cloudflare.com/?to=/:account/workers-and-pages 。
2. 選擇「Create application」→「GitHub」，依Cloudflare畫面授權**Cloudflare GitHub App**只存取\`sooneocean/react-movies-finder\`。
3. 選擇Repository \`sooneocean/react-movies-finder\`。
4. **請選\`feat/watchpilot-vinext-generated\`分支，而不是目前尚未合併的\`master\`。**
5. Worker名稱使用\`watchpilot-lab\`，不要覆蓋已正常工作的\`watchpilot-lab-research\`。
6. Build command：\`npm run build:vinext\`；Deploy command：\`npm run deploy:vinext\`（Cloudflare介面實際支援方式以當時Builds提示為準）。
7. 安裝依賴使用\`npm ci\`。不要設定私人TMDB或Jev Key。先檢查第一次Build完整成功、部署URL及Cloudflare Worker綁定的靜態資源。
8. 先以/、/lab、/lab/compare、/lab/strategy、/lab/radar、/lab/verify及免費API回應執行公開端到端檢查。任何404、500或付費API暴露均不得升正式版。
9. **不要**以Worker的API直接公開所有TMDB查詢：若需要真實片源，必須另加存取控制、速率限制、來源授權檢查與伺服器端秘密管理。

如果用自己的電腦部署，可先用\`npx cf auth login\`登入，再測\`npm run build:vinext\`及\`npm run deploy:vinext\`，但是直接連GitHub Builds更適合自動化持續部署。

Cloudflare官方參考：
- https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- https://developers.cloudflare.com/workers/ci-cd/builds/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/

## 三、獨立環境與維運

| 環境 | Worker名稱 | 對應來源 | 目前狀態 |
| --- | --- | --- | --- |
| 公開Lite研究站 | watchpilot-lab-research | feat/watchpilot-cloudflare-launch | 已部署、外網E2E通過 |
| 完整Next.js待部署 | watchpilot-lab | feat/watchpilot-vinext-generated | vinext建置成功，待Cloudflare Builds串接與公開端E2E |
| 原本Screenbox main/master | 不部署 | master | 保持未改動 |

預設私人資料仍保留在使用者瀏覽器。若想要多裝置備份，未來另開需求，不能在沒有同意與資安設計的情況下擴充到D1。

最後關鍵區分：**已公開可用的是Lite合成研究版；完整版Next.js的Worker尚未獲得Cloudflare正式部署回執，也尚未有公開URL。**
