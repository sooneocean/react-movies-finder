import { test, expect } from "@playwright/test";

test("Published Cloudflare preview loads without any API key",async({page})=>{
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"把找片時間，還給看片時間。"})).toBeVisible();
  await expect(page.getByText("研究模式｜非真實片庫")).toBeVisible();
  await expect(page.getByRole("button",{name:"7天看片計畫"})).toBeVisible();
});
test("Published seven-day planner creates real interactive results",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"產生7天觀影計畫"}).click();
  await expect(page.getByText("研究樣本A｜科幻探索")).toBeVisible();
  await expect(page.getByText("研究樣本B｜懸疑推理")).toBeVisible();
  await expect(page.getByText("使用分鐘")).toBeVisible();
});
test("Public personal taste is local and changes watch eligibility",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"個人品味護照"}).click();
  const genre=page.locator(".genre").filter({hasText:"科幻"}).locator("select");
  await genre.selectOption("avoid");
  await page.reload();
  await page.getByRole("button",{name:"個人品味護照"}).click();
  await expect(page.locator(".genre").filter({hasText:"科幻"}).locator("select")).toHaveValue("avoid");
  await page.getByRole("button",{name:"7天看片計畫"}).click();
  await page.getByRole("button",{name:"產生7天觀影計畫"}).click();
  await expect(page.getByText("研究樣本A｜科幻探索")).toHaveCount(0);
});
test("Live thirty-day subscription view is labelled as synthetic",async({page})=>{
  await page.goto("/");
  await page.getByRole("button",{name:"30天訂閱情境"}).click();
  await expect(page.getByText(/預設費率是/)).toBeVisible();
  await page.getByRole("button",{name:"比較30天訂閱策略"}).click();
  await expect(page.getByRole("heading",{name:"四種研究情境"})).toBeVisible();
  await expect(page.getByText("平衡觀影價值與費用")).toBeVisible();
  await expect(page.getByText(/不代表已省下現金/)).toBeVisible();
});
