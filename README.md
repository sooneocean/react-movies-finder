# Screenbox

> Formerly **Movies Finder**. The project has been renamed to Screenbox as of v3. The repository name (`react-movies-finder`) remains unchanged.

A lightweight, open-source movie and TV show discovery app. Browse trending titles, explore genres, build shareable watchlists, and find your next watch. No accounts, no tracking.

Built with Next.js 16, React 19, Tailwind CSS 4, and the TMDB API.

## Features

- **Home**: trending spotlight hero, horizontal carousels for trending/popular/upcoming
- **Movie Details**: cinematic hero, trailer player, cast, reviews, recommendations, watch providers, collection links
- **TV Show Details**: status badges, season browser with episode lists, network logos, next/last episode info
- **Genres**: backdrop-image genre cards for movies, dedicated TV genre browse with sorting
- **Upcoming**: discover endpoint with future date range, spotlight hero, countdown badges, grouped by month
- **Search**: multi-search with results split by Movies/TV Shows
- **Surprise Me**: random movie picker with genre and streaming provider filters
- **Watchlist**: localStorage-based, shareable via URL (base64 encoded), bookmark toggle on detail pages
- **Actors**: cinematic hero with best performances highlight, filmography grouped by decade
- **Collections**: hero with average rating, movies in release order
- **Seasons**: per-season episode list with best-rated episode hero, trailer, watch providers

## Tech Stack

| Layer      | Technology                               |
| ---------- | ---------------------------------------- |
| Framework  | Next.js 16.2.1 (App Router, Turbopack)   |
| UI         | React 19, Tailwind CSS 4.2, shadcn/ui v2 |
| Animation  | Framer Motion 12                         |
| Icons      | Lucide React                             |
| API        | TMDB (The Movie Database) v3             |
| Deployment | Vercel                                   |

## Getting Started

### Prerequisites

- Node.js 20+
- A TMDB API key ([get one here](https://www.themoviedb.org/settings/api))

### Setup

```bash
git clone https://github.com/Lazhari/react-movies-finder.git
cd react-movies-finder
npm install
```

Create a `.env.local` file (see `.env.example`):

```bash
MOVIE_DB_URL=https://api.themoviedb.org/3
MOVIE_DB_API_KEY=your_tmdb_api_key_here
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
npm start
```

## Project Structure

```
src/
  app/              # Next.js App Router pages
    actors/         # Actor detail
    collections/    # Collection detail
    genres/         # Movie genre browse
    movies/         # Movie detail
    search/         # Search results
    surprise/       # Random picker
    tv/             # TV shows, detail, genres, seasons
    upcoming/       # Upcoming movies
    watchlist/      # Shareable watchlist
  components/
    blocks/         # Header, Footer
    media/          # MediaCard, MediaCarousel, HeroSlider, RatingBadge,
                    #   VideoPlayer, ProviderList, WatchlistButton, PhotoGrid
    movies/         # Movie hero, cast, reviews
    tv/             # TV hero, seasons
    actors/         # Actor hero
    ui/             # shadcn/ui components
  hooks/            # useWatchlist
  lib/
    api/            # TMDB client (tmdb.ts) and types
    constants.ts    # Image sizes, YouTube embed URL
    movies.ts       # URL helpers, date formatting
    utils.ts        # cn() utility
  types/            # TypeScript interfaces
```

## License

MIT License. Copyright (c) 2020 Lazhari.


## WatchPilot Lab（台灣繁體中文個人研究Fork）

這個Fork新增免費、非營利、開源的OTT觀影決策研究功能；上游Screenbox與其MIT授權保留不變。

- 打開 `/lab` 可使用**完全合成的Fixture**測試7天觀影排程，**不需要API Key**。
- 所有Fixture片名、片源、期限均非真實OTT資訊；Jev只在獨立的`/lab/compare`選配A/B研究中使用，不在此離線排程頁直接呼叫；訂閱最佳化尚未整合。
- 執行 `npm run test:watchpilot`；詳細規格與驗收流程見 [PRD](docs/watchpilot/PRD.md)／[TODO](docs/watchpilot/TODO.md)／[QA](docs/watchpilot/QA.md)。
- 第三方影視資料依資料供應商條款使用；請參閱 [DATA-POLICY](docs/watchpilot/DATA-POLICY.md)。

### 台灣OTT真實片源研究（PR #2）

- 開啟 [台灣片源研究頁](http://localhost:3000/lab/tw)：搜尋繁體中文電影名稱、檢查台灣觀看來源、加入候選、產生7天計畫。
- 需自行在本機`.env.local`設定`MOVIE_DB_API_KEY=your_v3_tmdb_api_key`。**不要把Key提交到GitHub。**
- 每次搜尋最多5部電影，來源為TMDB／JustWatch的**第三方觀測**，並非OTT官方授權或下架日證明。
- 沒有API Key仍可使用`/lab`的合成Fixture模式。
- 詳細查核流程：[TW驗收清單](docs/watchpilot/QA-TW.md)與[資料來源決策](docs/watchpilot/ADR-002-TMDB-TW.md)。

### 片庫IN／OUT觀測雷達（PR #3）

- 在`/lab/tw`查詢電影後按「加入雷達」，再開`/lab/radar`手動更新台灣片源觀測。
- `/lab/radar`提供離線合成IN／OUT演練，不需要金鑰。
- 片庫事件僅是TMDB／JustWatch**觀測結果**；首次收錄不算新上線，片源缺失不等於官方下架。
- 官方公告日期須由使用者自行核對HTTPS來源後明確標記「人工查核」，才能影響重新排程。
- 雷達工作區僅儲存於個人瀏覽器localStorage，最多20部作品、每部20個30天內快照，可從介面清除。
- 使用與限制詳見[雷達驗收清單](docs/watchpilot/QA-RADAR.md)及[設計決策](docs/watchpilot/ADR-003-CATALOG-RADAR.md)。

### LINE TV台灣官方下架公告研究匯入（PR #4）

- 在`/lab/radar`進入`/lab/official/line-tv`，開啟指定的LINE TV台灣客服文章，自行複製當前清單文字。
- 系統解析台灣公告片名及日期，並建議完全同名的已追蹤TMDB電影；**不會自動宣告官方驗證或自行抓取整個網站**。
- 使用者必須逐筆核對並勾選同意才儲存個人本機期限紀錄；日期以台灣下架日23:59為截止。
- 沒有對應LINE TV觀測片源的作品不會被憑空視為可看。
- 原始貼入的文字不提交GitHub，不自動同步到外部服務；本研究仍遵守來源網站條款。
- 見[PR #4驗收](docs/watchpilot/QA-LINE-TV.md)及[來源Adapter設計決策](docs/watchpilot/ADR-004-LINE-TV-OFFICIAL.md)。

### 規則式與Jev決策A/B實驗（PR #5）

- 開啟`/lab/compare`：不需要Key即可比較兩種免費規則式首選（排程分數／品質分數）。
- 要執行付費Jev Choice，需在本機`.env.local`設定`TYPESAFE_API_KEY`及`WATCHPILOT_ENABLE_JEV=1`，使用開發模式`npm run dev`，並在頁面上**主動確認本次請求可能計費**。
- 預設不啟用Jev。每次只比較最多6部已通過硬限制的**合成Fixture**電影，不把真實第三方片庫大規模發送到模型。
- 任何JeV錯誤均有明確訊息，單次呼叫不自動重試；30秒冷卻僅供單一本機程序降低誤觸風險。
- 當前介面只做「今晚先看哪部」研究，Jev不能覆寫片庫證據、下架日期或排程限制。
- 參考[設計決策](docs/watchpilot/ADR-005-JEV-AB.md)／[PR #5驗收](docs/watchpilot/QA-JEV.md)。

- 2026-11-07 CI：88項離線測試、TypeScript、Lint及無私人Key正式Build通過，請以最新PR Checks為準（歷史成功紀錄：[Actions Run 42360787945](https://github.com/sooneocean/react-movies-finder/actions/runs/42360787945)）。

### 個人品味護照＋30天OTT訂閱策略研究（PR #6）

- 開啟`/lab/strategy`：設定喜歡／避開類型、對合成電影評價與標記已看；資料僅存在本機瀏覽器。
- 在同一頁輸入OTT月繳／年繳價格、目前有無訂閱、**已付費可用期限**及續費能否避免，執行30天情境比較。
- 初始價格與所有片庫作品、上下架日期為**明確標記的合成研究Fixture**，不代表任何OTT的實際價格或目前授權。若切換個人金額模式，需自行確認。
- 四種情境：維持目前訂閱、停止可取消續費、平衡觀影價值與未來費用、最大化觀影價值。已付費部分不會被算成可節省費用。
- 全部訂閱子集合最多64種確定性計算；每個看片計畫仍採Greedy基準，不保證全域最優。訂閱費用僅是情境估計，**不會登入或取消任何平台**。
- 同一品味護照也會套用到`/lab`、`/lab/tw`及`/lab/radar`的排程；不會送到Jev。
- 詳見[設計決策](docs/watchpilot/ADR-006-TASTE-SUBSCRIPTIONS.md)與[PR #6驗收](docs/watchpilot/QA-STRATEGY.md)。

### 真實台灣片源逐部交叉核對（PR #8）

- 在`/lab/tw`用自己的TMDB Key搜尋、加入最多20部電影到`/lab/radar`，再進入`/lab/verify`逐部比較OTT平台的實際觀看權益。
- 手動記錄你實際查看的作品、平台、觀看類型（訂閱／免費／含廣告／租借／購買／未找到／無法確認）、查核時間及HTTPS連結。
- TMDB與人工查核若不同，會標示「資料差異」；任一來源超過72小時或TMDB更新後未重新確認，就不再採用該筆。
- 只有同一部電影／平台／訂閱或免費權益近期相符的結果，才可進入7天研究排程；**不會升級成平台官方認證，也不能直接作為退訂建議**。
- 以至少20部作品、兩平台各5筆及80%一致率作為研究樣本門檻（只是一個內部驗收門檻，不是完整台灣OTT片庫準確率）。
- 無API Key時可在`/lab/verify`進行兩部合成作品的離線Fixture演練，不會保存至真實查核紀錄。
- 交叉核對只保存少量必要欄位在本機localStorage，不上傳官方資料庫、個人登入資訊或第三方片庫快照。
- 人工核對官方下架日的`expiryEvidence`已修復資料轉換遺失問題；與可觀看性仍是兩個獨立證據。
- 詳情見[資料品質決策](docs/watchpilot/ADR-008-TW-CROSSCHECK.md)與[QA檢查清單](docs/watchpilot/QA-TW-CROSSCHECK.md)。
