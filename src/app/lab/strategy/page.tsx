"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { LAB_PROVIDERS, makeLabInput } from "@/lib/watchpilot/fixtures";
import {
  SUPPORTED_TASTE_GENRES, emptyTastePassport, loadTastePassport,
  saveTastePassport, setGenrePreference, rateTasteWork, removeTasteWork,
  TASTE_STORAGE_KEY, type Opinion, type TastePassport,
} from "@/lib/watchpilot/taste-passport";
import {
  simulateSubscriptionMonth, type BillingCycle, type PriceSource,
  type SubscriptionAccount, type SubscriptionScenario, type SubscriptionStudy,
} from "@/lib/watchpilot/subscription-study";

const ACCOUNT_KEY = "watchpilot-personal-subscriptions-v1";
const GENRE_NAMES: Record<string, string> = {
  "science-fiction": "科幻", mystery: "懸疑", crime: "犯罪",
  comedy: "喜劇", drama: "劇情", horror: "恐怖", action: "動作",
  animation: "動畫", romance: "愛情", documentary: "紀錄片", fantasy: "奇幻",
};
const OPINION_NAMES: Record<Opinion, string> = {
  love: "非常喜歡", like: "喜歡", neutral: "普通", dislike: "不喜歡",
};
const TITLES: Record<SubscriptionScenario["label"], string> = {
  CURRENT_CONTINUATION: "維持目前訂閱",
  NO_OPTIONAL_RENEWALS: "停止可取消續費",
  BALANCED: "觀影價值／費用平衡",
  MAX_WATCH_VALUE: "最大化觀影價值",
};
function taiwanToday(): string {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
}
function addDays(date: string, days: number): string {
  const value = new Date(date + "T00:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function exampleAccounts(date: string): SubscriptionAccount[] {
  const samplePrices = [260, 300, 280, 220]; // fictional; NOT market prices
  return LAB_PROVIDERS.map((provider, i) => ({
    providerId: provider.id, name: provider.name,
    priceTwd: samplePrices[i],
    cycle: "monthly" as const,
    active: i < 2,
    paidThroughOn: i < 2 ? addDays(date, 9 + i * 8) : null,
    canAvoidRenewal: true,
  }));
}
function money(amount: number): string {
  return "NT$" + new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(amount);
}
type SavedAccounts = {
  version: 1;
  accounts: SubscriptionAccount[];
  priceSource: PriceSource;
  penaltyPer100Twd: number;
};
function readSavedAccounts(): SavedAccounts | null {
  try {
    const raw = window.localStorage.getItem(ACCOUNT_KEY);
    if (!raw || raw.length > 12000) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const o = value as Partial<SavedAccounts>;
    if (o.version !== 1 || !Array.isArray(o.accounts) ||
      o.accounts.length !== LAB_PROVIDERS.length ||
      o.accounts.some((acc, i) => acc.providerId !== LAB_PROVIDERS[i].id) ||
      (o.priceSource !== "EXAMPLE" && o.priceSource !== "USER_ENTERED") ||
      typeof o.penaltyPer100Twd !== "number") return null;
    return o as SavedAccounts;
  } catch {
    return null;
  }
}
export default function StrategyResearchPage() {
  const [startDate, setStartDate] = useState(taiwanToday);
  const [profile, setProfile] = useState<TastePassport>(emptyTastePassport);
  const [accounts, setAccounts] = useState<SubscriptionAccount[]>(() => exampleAccounts(taiwanToday()));
  const [priceSource, setPriceSource] = useState<PriceSource>("EXAMPLE");
  const [priceConfirmed, setPriceConfirmed] = useState(false);
  const [weeklyHours, setWeeklyHours] = useState(6);
  const [dailyHours, setDailyHours] = useState(3);
  const [penalty, setPenalty] = useState(20);
  const [preferenceText, setPreferenceText] = useState("這個月想優先看科幻和懸疑，不要恐怖片");
  const [result, setResult] = useState<SubscriptionStudy | null>(null);
  const [scenarioLabel, setScenarioLabel] = useState<SubscriptionScenario["label"]>("BALANCED");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Load browser-only settings after hydration; never touch localStorage in SSR.
    // Scheduling this update also avoids synchronous setState inside an effect.
    const timer = window.setTimeout(() => {
      setProfile(loadTastePassport(window.localStorage));
      const cache = readSavedAccounts();
      if (cache) {
        setAccounts(cache.accounts);
        setPriceSource(cache.priceSource);
        setPenalty(cache.penaltyPer100Twd);
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const sampleWorks = useMemo(() => makeLabInput({
    startDate, weeklyMinutes: Math.round(weeklyHours * 60),
    subscribedProviders: LAB_PROVIDERS.map(provider => provider.id),
    text: "",
  }).candidates.filter(x => x.offers.some(o => o.access === "subscription"))
    .slice(0, 6), [startDate, weeklyHours]);
  function changeGenre(genre: string, mode: "like" | "avoid" | "neutral") {
    setError(null); setResult(null);
    try {
      const next = setGenrePreference(profile, genre, mode);
      saveTastePassport(window.localStorage, next);
      setProfile(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法儲存品味設定");
    }
  }
  function changeRating(id: string, genres: string[], value: string, watched?: boolean) {
    setError(null); setResult(null);
    try {
      const original = profile.entries.find(x => x.workId === id);
      const next = value === "none" && !(watched ?? original?.watched ?? false)
        ? removeTasteWork(profile, id)
        : rateTasteWork(profile, id, genres,
            value === "none" ? (original?.opinion ?? "neutral") : value as Opinion,
            watched ?? original?.watched ?? false);
      saveTastePassport(window.localStorage, next);
      setProfile(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法儲存作品評價");
    }
  }
  function updateAccount(id: string, changes: Partial<SubscriptionAccount>) {
    setResult(null); setSaved(null); setPriceConfirmed(false);
    setAccounts(current => current.map(a => a.providerId === id ? { ...a, ...changes } : a));
  }
  function switchPriceMode(value: PriceSource) {
    setPriceSource(value);
    setPriceConfirmed(false); setResult(null); setSaved(null);
    if (value === "USER_ENTERED") {
      setAccounts(values => values.map(account => ({ ...account, priceTwd: 0 })));
    } else {
      setAccounts(exampleAccounts(startDate));
    }
  }
  function buildInput() {
    return {
      startDate, weeklyMinutes: Math.round(weeklyHours * 60),
      dailyMinutes: Math.round(dailyHours * 60), preferenceText,
      profile, accounts, priceSource, penaltyPer100Twd: penalty,
    };
  }
  function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null); setSaved(null);
    if (!ready) return;
    if (priceSource === "USER_ENTERED" && !priceConfirmed) {
      setResult(null);
      setError("請先核對並勾選你填寫的真實費率、已付費期限與續費條件。");
      return;
    }
    try {
      const study = simulateSubscriptionMonth(buildInput());
      setResult(study);
      setScenarioLabel("BALANCED");
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : "無法計算訂閱情境");
    }
  }
  function saveSettings() {
    setError(null);
    if (priceSource === "USER_ENTERED" && !priceConfirmed) {
      setError("尚未確認個人訂閱設定，未保存。");
      return;
    }
    try {
      simulateSubscriptionMonth(buildInput()); // validate before saving
      const content: SavedAccounts = { version: 1, accounts, priceSource, penaltyPer100Twd: penalty };
      window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(content));
      setSaved("訂閱研究設定已儲存於這個瀏覽器，不會送至雲端或GitHub。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "儲存失敗");
    }
  }
  function clearLocal() {
    if (!window.confirm("確定清除本機品味護照與訂閱研究設定？不會清除其他WatchPilot片庫資料。")) return;
    window.localStorage.removeItem(TASTE_STORAGE_KEY);
    window.localStorage.removeItem(ACCOUNT_KEY);
    setProfile(emptyTastePassport());
    setAccounts(exampleAccounts(startDate));
    setPriceSource("EXAMPLE"); setPriceConfirmed(false);
    setResult(null); setSaved("已清除本機品味與訂閱研究資料。");
  }
  const scenarios = result ? [
    result.baseline, result.noOptionalRenewals, result.balanced, result.maxWatchValue,
  ] : [];
  const currentScenario = scenarios.find(x => x.label === scenarioLabel);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-10 sm:px-8">
      <div className="space-y-2">
        <Link href="/lab" className="text-sm text-amber hover:underline">返回觀影實驗室</Link>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber">WatchPilot Lab / Personal Strategy</p>
        <h1 className="text-3xl font-bold">個人品味護照＋OTT訂閱策略</h1>
        <p className="max-w-3xl text-muted-foreground">
          先記錄你喜歡的作品，再根據觀看時間、已付費權益和可能續費，模擬接下來30天的觀影／訂閱組合。
        </p>
        <div role="status" className="rounded-xl border border-amber/40 bg-amber/10 p-4 text-sm text-amber">
          <strong>研究資料，非即時訂閱建議。</strong>
          目前所有電影、片庫、下架時間都使用合成Fixture；初始價格也全部是虛構示例。
          真實費率須由你自行輸入和確認。此程式不登入、購買或取消任何OTT，也不承諾可以省下所顯示的金額。
        </div>
      </div>
      {!ready && <p className="text-sm text-muted-foreground">讀取本機個人設定中…</p>}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-xl font-semibold">1.品味護照（Taste Passport）</h2>
        <p className="text-sm text-muted-foreground">
          「喜歡」會提升作品分數；「避開」是硬限制。你也可以評分合成研究作品，讓演算法記住偏好。
          這些資訊只保存在本機。
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {SUPPORTED_TASTE_GENRES.map(genre => {
            const mode = profile.avoidedGenres.includes(genre) ? "avoid"
              : profile.likedGenres.includes(genre) ? "like" : "neutral";
            return <label key={genre} className="space-y-1 rounded-lg border border-border p-3">
              <span className="block text-sm font-medium">{GENRE_NAMES[genre] ?? genre}</span>
              <select value={mode}
                onChange={event => changeGenre(genre, event.target.value as "like" | "avoid" | "neutral")}
                className="w-full rounded-md border border-input bg-background p-2 text-sm">
                <option value="neutral">不指定</option>
                <option value="like">喜歡</option>
                <option value="avoid">避開</option>
              </select>
            </label>;
          })}
        </div>
        <h3 className="text-sm font-semibold">合成電影的評分與已看紀錄</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {sampleWorks.map(item => {
            const opinion = profile.entries.find(x => x.workId === item.id);
            return <div key={item.id} className="rounded-lg border border-border p-3">
              <p className="font-medium">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.genres.map(g => GENRE_NAMES[g] ?? g).join("、")}</p>
              <div className="mt-3 flex items-center gap-3">
                <select aria-label={"評價" + item.title} value={opinion?.opinion ?? "none"}
                  onChange={event => changeRating(item.id, item.genres, event.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-input bg-background p-2 text-sm">
                  <option value="none">未評價</option>
                  {Object.entries(OPINION_NAMES).map(([id, label]) =>
                    <option key={id} value={id}>{label}</option>)}
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={opinion?.watched ?? false}
                    onChange={event => changeRating(item.id, item.genres,
                      opinion?.opinion ?? "neutral", event.target.checked)} />
                  已看
                </label>
              </div>
            </div>;
          })}
        </div>
      </section>

      <form className="space-y-5 rounded-2xl border border-border bg-card p-5" onSubmit={generate}>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">2.訂閱及觀看時間</h2>
          <label className="mr-4 inline-flex items-center gap-2 text-sm">
            <input type="radio" name="price-mode" checked={priceSource === "EXAMPLE"}
              onChange={() => switchPriceMode("EXAMPLE")} />
            虛構費率演練
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="radio" name="price-mode" checked={priceSource === "USER_ENTERED"}
              onChange={() => switchPriceMode("USER_ENTERED")} />
            使用本人實際費率
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {accounts.map(a => <div key={a.providerId} className="space-y-3 rounded-xl border border-border p-4">
            <label className="flex items-center justify-between gap-2 text-sm font-semibold">
              {a.name}
              <span className="flex items-center gap-2 font-normal">
                目前訂閱
                <input type="checkbox" checked={a.active}
                  onChange={event => updateAccount(a.providerId, {
                    active: event.target.checked,
                    paidThroughOn: event.target.checked ? startDate : null,
                  })}/>
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs">續費金額（新台幣）
                <input type="number" min={0} max={50000} step={1} value={a.priceTwd}
                  onChange={event => updateAccount(a.providerId, { priceTwd: Number(event.target.value) })}
                  className="w-full rounded-md border border-input bg-background p-2 text-sm"/>
              </label>
              <label className="space-y-1 text-xs">計費週期
                <select value={a.cycle}
                  onChange={event => updateAccount(a.providerId, {cycle: event.target.value as BillingCycle})}
                  className="w-full rounded-md border border-input bg-background p-2 text-sm">
                  <option value="monthly">月繳</option>
                  <option value="annual">年繳</option>
                </select>
              </label>
            </div>
            {a.active && <>
              <label className="block space-y-1 text-xs">已付費權益可使用至（含當日）
                <input type="date" required value={a.paidThroughOn ?? ""}
                  onChange={event => updateAccount(a.providerId, {paidThroughOn: event.target.value})}
                  className="w-full rounded-md border border-input bg-background p-2 text-sm"/>
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={a.canAvoidRenewal}
                  onChange={event => updateAccount(a.providerId, {canAvoidRenewal: event.target.checked})}/>
                下次續費前可以停訂（自行判斷）
              </label>
            </>}
            {!a.active && <p className="text-xs text-muted-foreground">目前無已預付權益；如模擬啟用，將計入新付款。</p>}
          </div>)}
        </div>
        {priceSource === "USER_ENTERED" && <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={priceConfirmed}
            onChange={event => setPriceConfirmed(event.target.checked)} />
          我已自行確認上述實際費率、目前訂閱狀態、已付費截止日及可取消條件。
        </label>}
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="space-y-1 text-sm">模擬開始日
            <input type="date" required value={startDate} onChange={event => { setStartDate(event.target.value);setResult(null);setPriceConfirmed(false); }}
              className="w-full rounded-md border border-input bg-background p-2 text-sm"/>
          </label>
          <label className="space-y-1 text-sm">每週時數
            <input type="number" min={1} max={40} step={1} value={weeklyHours}
              onChange={event => { setWeeklyHours(Number(event.target.value));setResult(null); }}
              className="w-full rounded-md border border-input bg-background p-2 text-sm"/>
          </label>
          <label className="space-y-1 text-sm">每日時數上限
            <input type="number" min={0.5} max={8} step={0.5} value={dailyHours}
              onChange={event => { setDailyHours(Number(event.target.value));setResult(null); }}
              className="w-full rounded-md border border-input bg-background p-2 text-sm"/>
          </label>
          <label className="space-y-1 text-sm">每NT$100成本扣分
            <input type="number" min={0} max={100} step={5} value={penalty}
              onChange={event => { setPenalty(Number(event.target.value));setResult(null);setPriceConfirmed(false); }}
              className="w-full rounded-md border border-input bg-background p-2 text-sm"/>
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span>本月觀影需求（規則式辨識）</span>
          <textarea rows={2} maxLength={400} value={preferenceText}
            onChange={event => { setPreferenceText(event.target.value);setResult(null); }}
            className="w-full rounded-md border border-input bg-background p-3 text-sm"/>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={!ready}
            className="rounded-lg bg-amber px-5 py-3 font-semibold text-black disabled:opacity-40">
            產生30天訂閱／看片方案
          </button>
          <button type="button" onClick={saveSettings} disabled={!ready}
            className="rounded-lg border border-border px-4 py-3 text-sm">儲存本機訂閱設定</button>
          <button type="button" onClick={clearLocal}
            className="rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
            清除個人研究資料
          </button>
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-red-400">{error}</p>}
        {saved && <p role="status" className="text-sm text-amber">{saved}</p>}
      </form>

      {result && <section aria-live="polite" className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <div>
          <h2 className="text-xl font-semibold">3.30天策略比較</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {result.startDate}至{result.endDate} · 預估可看{result.plannedHours}小時 ·
            已比較{result.simulatedChoices}種訂閱組合 ·
            {result.priceSource === "EXAMPLE" ? "所有費率均為合成示例" : "費率由使用者自行輸入"}。
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {scenarios.map(s => <button type="button" key={s.label}
            onClick={() => setScenarioLabel(s.label)}
            className={"rounded-xl border p-4 text-left transition-colors " +
              (scenarioLabel === s.label ? "border-amber bg-amber/10" : "border-border hover:border-amber/40")}>
            <p className="text-sm font-semibold">{TITLES[s.label]}</p>
            <p className="mt-3 text-2xl font-bold">{money(s.estimatedNewChargesTwd)}</p>
            <p className="text-xs text-muted-foreground">研究期間可能新增的費用</p>
            <p className="mt-2 text-sm">安排{s.plan.items.length}部／觀影分數{s.watchValue}</p>
            <p className="mt-1 text-xs text-muted-foreground">平衡目標分數{s.objective}</p>
          </button>)}
        </div>
        <p className="text-sm">
          平衡情境與「繼續目前訂閱」的未來費用差額：
          <strong className="ml-2">{money(result.baselineVsBalancedFutureCostDifferenceTwd)}</strong>
          <span className="ml-2 text-xs text-muted-foreground">
            （可能為負值；不等於實際省下的錢）
          </span>
        </p>
        {currentScenario && <div className="space-y-3 rounded-xl border border-border p-4">
          <h3 className="text-lg font-semibold">{TITLES[currentScenario.label]}｜詳細規劃</h3>
          <p className="text-sm text-muted-foreground">
            模擬繼續／啟用：
            {currentScenario.selectedAfterPrepay.map(id => accounts.find(a => a.providerId === id)?.name ?? id).join("、") || "不新增任何訂閱"}。
            即使沒有續訂，已付費權益仍可用到你填寫的截止日。
          </p>
          <p className="text-sm text-muted-foreground">
            預估計費事件：{currentScenario.billingEvents.length}筆，合計{money(currentScenario.estimatedNewChargesTwd)}。
            只估算模擬期間的未來新增收費，不含歷史已支付金額。
          </p>
          {currentScenario.billingEvents.length > 0 && <ul className="text-xs text-muted-foreground">
            {currentScenario.billingEvents.map((entry, index) => <li key={entry.providerId + entry.chargedOn + index}>
              {entry.chargedOn}｜{accounts.find(a => a.providerId === entry.providerId)?.name ?? entry.providerId}｜{money(entry.priceTwd)}（{entry.cycle === "monthly" ? "月費" : "年費"}）
            </li>)}
          </ul>}
          <h4 className="font-semibold">觀看計畫（虛構作品）</h4>
          {currentScenario.plan.items.length === 0 &&
            <p className="text-sm text-muted-foreground">沒有符合觀看時數、片源及偏好的合成作品。</p>}
          <div className="grid gap-2 md:grid-cols-2">
            {currentScenario.plan.items.map(item => <div key={item.movieId}
              className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{item.date}｜{accounts.find(a => a.providerId === item.providerId)?.name ?? "合成免費平台"}</p>
              <p className="font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.runtimeMinutes}分鐘 · 分數{item.score} · Fixture</p>
            </div>)}
          </div>
        </div>}
        <p className="text-xs text-muted-foreground">
          本研究完整列舉訂閱子集合，但每組的看片排序使用Greedy基準，並非全域數學最優。
          費率、計費日期及可取消性都由使用者輸入；平台實際計費、退款及訂閱規則仍須親自確認。
          不會執行購買、取消訂閱或向第三方發送你的個人品味資料。
        </p>
      </section>}
    </main>
  );
}
