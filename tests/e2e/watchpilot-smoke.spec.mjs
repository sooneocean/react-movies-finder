import { test, expect } from "@playwright/test";

// All tests are intentionally credential-free. No real OTT API or paid Jev requests.
test("No-key homepage exposes the local WatchPilot research entry", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "台灣OTT觀影決策研究" })).toBeVisible();
  await page.getByRole("link", { name: "進入觀影實驗室" }).click();
  await expect(page).toHaveURL(/\/lab$/);
  await expect(page.getByRole("heading", { name: "AI觀影決策實驗室" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Fixture合成資料模式");
});

test("Seven-day fixture plan respects exclusions and the weekly time budget", async ({ page }) => {
  await page.goto("/lab");
  await page.getByRole("button", { name: "產生7天觀影計畫" }).click();
  await expect(page.getByText("研究樣本A｜科幻探索")).toBeVisible();
  await expect(page.getByText("研究樣本B｜懸疑推理")).toBeVisible();
  await expect(page.getByText("研究樣本E｜恐怖驚悚")).toHaveCount(0);
  await expect(page.getByText("360分", { exact: true })).toBeVisible();

  await page.getByLabel("Disney+").uncheck();
  await page.getByRole("button", { name: "產生7天觀影計畫" }).click();
  await expect(page.getByText("研究樣本B｜懸疑推理")).toHaveCount(0);

  await page.getByRole("spinbutton", { name: "每週可觀看時數" }).fill("1");
  await page.getByRole("button", { name: "產生7天觀影計畫" }).click();
  await expect(page.getByText("0部", { exact: true })).toBeVisible();
});

test("Taste Passport preferences persist across reloads and affect the plan", async ({ page }) => {
  await page.goto("/lab/strategy");
  await expect(page.getByRole("heading", { name: "個人品味護照＋OTT訂閱策略" })).toBeVisible();
  await expect(page.getByRole("button", { name: "產生30天訂閱／看片方案" })).toBeEnabled();
  const scienceFiction = page.locator("select").first();
  await scienceFiction.selectOption("avoid");
  await expect(scienceFiction).toHaveValue("avoid");
  await page.reload();
  await expect(page.locator("select").first()).toHaveValue("avoid");

  await page.goto("/lab");
  await page.getByRole("button", { name: "產生7天觀影計畫" }).click();
  await expect(page.getByText("研究樣本A｜科幻探索")).toHaveCount(0);
  await expect(page.getByText("研究樣本B｜懸疑推理")).toBeVisible();
});

test("Synthetic prices produce four 30-day strategies without claiming real savings", async ({ page }) => {
  await page.goto("/lab/strategy");
  const generate = page.getByRole("button", { name: "產生30天訂閱／看片方案" });
  await expect(generate).toBeEnabled();
  await generate.click();
  await expect(page.getByRole("heading", { name: "3.30天策略比較" })).toBeVisible();
  await expect(page.getByText("所有費率均為合成示例")).toBeVisible();
  for (const label of [
    "維持目前訂閱",
    "停止可取消續費",
    "觀影價值／費用平衡",
    "最大化觀影價值",
  ]) {
    await expect(page.getByRole("button", { name: new RegExp(label) })).toBeVisible();
  }
  await page.getByRole("button", { name: /停止可取消續費/ }).click();
  await expect(page.getByRole("heading", { name: /停止可取消續費｜詳細規劃/ })).toBeVisible();
  await expect(page.getByText(/不等於實際省下的錢/)).toBeVisible();
});

test("Radar simulation displays observations rather than license-expiry claims", async ({ page }) => {
  await page.goto("/lab/radar");
  await page.getByRole("button", { name: "展示離線合成IN／OUT演練" }).click();
  await expect(page.getByText("首次建立觀測基準")).toBeVisible();
  await expect(page.getByText("首次觀測片源缺失")).toBeVisible();
  await expect(page.getByText("相隔至少24小時仍未觀測到片源")).toBeVisible();
  await expect(page.getByText("目前展示的事件全部為Fixture")).toBeVisible();
  await page.getByRole("button", { name: "返回真實觀測紀錄" }).click();
  await expect(page.getByText("目前展示的事件全部為Fixture")).toHaveCount(0);
});

test("Taiwan movie lookup without credentials fails explicitly without false delisting", async ({ page }) => {
  await page.goto("/lab/tw");
  await page.getByRole("textbox", { name: "輸入電影名稱" }).fill("星際效應");
  await page.getByRole("button", { name: "搜尋" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "請先在本機.env.local設定MOVIE_DB_API_KEY" })).toBeVisible();
  await expect(page.getByText("TMDB未提供台灣觀看平台資訊；不等於確定下架。")).toHaveCount(0);
});

test("Official LINE TV importer parses synthetic text but does not auto-approve", async ({ page }) => {
  await page.goto("/lab/official/line-tv");
  await expect(page.getByRole("heading", { name: "LINE TV台灣官方下架公告匯入" })).toBeVisible();
  await page.locator("textarea").fill([
    "類別 | 影片名稱 | 預計下架日",
    "電影 | 虛構研究電影甲 | 2099-11-20",
    "電影 | 虛構研究電影乙 | 2099/11/30",
  ].join("\n"));
  await page.getByRole("button", { name: "解析官方清單" }).click();
  await expect(page.getByText(/辨識到2筆資料/)).toBeVisible();
  await expect(page.getByRole("button", { name: "儲存這一筆人工查核期限" })).toBeDisabled();
});

test("Free rules A/B shows two baselines and does not silently call paid Jev", async ({ page }) => {
  await page.goto("/lab/compare");
  await page.getByRole("button", { name: "免費規則式A/B比較" }).click();
  await expect(page.getByRole("heading", { name: "本次比較結果" })).toBeVisible();
  await expect(page.getByText("未呼叫，不是假AI結果")).toBeVisible();
  await expect(page.getByText("A｜排程分數規則")).toBeVisible();
  await expect(page.getByText("B｜純品質分數規則")).toBeVisible();
});


test("TW cross-check demo is fully synthetic, conservative, and gives a bounded plan", async ({ page }) => {
  await page.goto("/lab/verify");
  await expect(page.getByRole("heading", { name: "台灣OTT片源交叉驗證" })).toBeVisible();
  await expect(page.getByText("尚未追蹤真實電影。")).toBeVisible();
  await page.getByRole("button", { name: "顯示離線Fixture演練" }).click();
  await expect(page.getByText(/以下兩部電影、平台與檢查結果全部是合成資料/)).toBeVisible();
  await expect(page.getByText(/尚未達到擴大訂閱策略研究的樣本門檻/)).toBeVisible();
  await expect(page.getByText(/與TMDB觀測不一致/)).toBeVisible();
  await page.getByRole("button", { name: "產生交叉驗證研究片單" }).click();
  await expect(page.getByText(/符合雙來源條件的候選1部/)).toBeVisible();
  await expect(page.getByText("Fixture演練電影A").last()).toBeVisible();
  await expect(page.getByText(/不可依此直接取消或購買OTT訂閱/)).toBeVisible();
  await page.getByRole("button", { name: "結束Fixture演練" }).click();
  await expect(page.getByText(/以下兩部電影、平台與檢查結果全部是合成資料/)).toHaveCount(0);
  await expect(page.getByText("目前追蹤0部電影；0筆人工核對。")).toBeVisible();
});

test("TW cross-check can persist, use, and remove one manually reviewed local observation", async ({ page }) => {
  await page.addInitScript(() => {
    // Do not replace the underlying TMDB observation on reload: changing its
    // checkedAt timestamp correctly invalidates earlier human attestation.
    if (localStorage.getItem("watchpilot-radar-research-v1")) return;
    const now = new Date().toISOString();
    const day = new Date(Date.now() + 8 * 3600000).toISOString().slice(0,10);
    const title = {
      tmdbId: 7771, title: "E2E合成電影", originalTitle: "E2E test",
      year:"2026", runtimeMinutes:110, genres:["science-fiction"],genreLabels:["科幻"],
      overview:"",posterPath:null,voteAverage:8,voteCount:100, region:"TW",
      checkedAt:now,evidence:"OBSERVED",source:"TMDB / JustWatch",
      availabilityStatus:"TW_OFFERS_FOUND",watchLink:null,
      offers:[{providerId:"netflix",providerName:"Netflix",tmdbProviderId:8,
        monetization:"flatrate",region:"TW",access:"subscription",evidence:"OBSERVED",
        source:"TMDB / JustWatch (TW)",observedOn:day,expiresOn:null}],
    };
    localStorage.setItem("watchpilot-radar-research-v1",
      JSON.stringify({version:1,tracked:[title],snapshots:[],reviewedNotices:[]}));
  });
  await page.goto("/lab/verify");
  await expect(page.getByText("目前追蹤1部電影；0筆人工核對。")).toBeVisible();
  await page.getByLabel("追蹤電影").selectOption("tmdb:7771");
  await page.getByLabel("核對的平台").selectOption("netflix");
  await page.getByLabel("你親自查閱的HTTPS參考網址").fill("https://www.netflix.com/watch/123");
  await page.getByText("我已親自核對這部電影、平台與權益", { exact: false }).click();
  await page.getByRole("button", { name: "儲存人工查核" }).click();
  await expect(page.getByText("目前追蹤1部電影；1筆人工核對。")).toBeVisible();
  await expect(page.getByText(/與TMDB觀測一致/)).toBeVisible();
  await page.reload();
  await expect(page.getByText("目前追蹤1部電影；1筆人工核對。")).toBeVisible();
  await page.getByRole("button", { name: "產生交叉驗證研究片單" }).click();
  await expect(page.getByText(/符合雙來源條件的候選1部/)).toBeVisible();
  await page.getByRole("button", { name: "刪除" }).click();
  await expect(page.getByText("目前追蹤1部電影；0筆人工核對。")).toBeVisible();
});
