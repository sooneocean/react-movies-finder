import { test, expect } from "@playwright/test";

test("vinext Workers preview serves the complete WatchPilot research lab", async ({page}) => {
  await page.goto("/lab");
  await expect(page.getByRole("heading", { name: "AI觀影決策實驗室" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Fixture合成資料模式");
  await page.getByRole("button", { name: "產生7天觀影計畫" }).click();
  await expect(page.getByText("研究樣本A｜科幻探索")).toBeVisible();
});
test("vinext public-origin zero-key A/B is functional while Jev remains disabled",async({page})=>{
  await page.goto("/lab/compare");
  await page.getByRole("button",{name:"免費規則式A/B比較"}).click();
  await expect(page.getByRole("heading",{name:"本次比較結果"})).toBeVisible();
  await expect(page.getByText("未呼叫，不是假AI結果")).toBeVisible();
  await page.getByRole("button",{name:"呼叫Jev（需自行啟用付費API）"}).click();
  page.once("dialog",dialog=>dialog.accept());
});
test("vinext serves research strategy page without TMDB key",async({page})=>{
  await page.goto("/lab/strategy");
  await expect(page.getByRole("heading",{name:"個人品味護照＋OTT訂閱策略"})).toBeVisible();
  await page.getByRole("button",{name:"產生30天訂閱／看片方案"}).click();
  await expect(page.getByRole("heading",{name:"3.30天策略比較"})).toBeVisible();
});
test("vinext source verification renders offline fixture without exposing TMDB proxy",async({page})=>{
  await page.goto("/lab/verify");
  await expect(page.getByRole("heading",{name:"台灣OTT片源交叉驗證"})).toBeVisible();
  await page.getByRole("button",{name:"顯示離線Fixture演練"}).click();
  await expect(page.getByText(/以下兩部電影、平台與檢查結果全部是合成資料/)).toBeVisible();
});

test("production Workers preview rejects anonymous TMDB catalog proxy",async({page})=>{
  await page.goto("/lab/tw");
  const result=await page.evaluate(async()=>{
    const [search,title]=await Promise.all([
      fetch("/api/watchpilot/tw/search?q=Inception"),
      fetch("/api/watchpilot/tw/title?id=27205"),
    ]);
    return {
      search:{status:search.status,code:(await search.json()).code},
      title:{status:title.status,code:(await title.json()).code},
    };
  });
  expect(result.search).toEqual({status:403,code:"PUBLIC_TMDB_DISABLED"});
  expect(result.title).toEqual({status:403,code:"PUBLIC_TMDB_DISABLED"});
});
