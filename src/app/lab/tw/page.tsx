"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { TWTitle, TWOffer } from "@/lib/watchpilot/tmdb-tw";
import {
  generateTWResearchPlan, type TWResearchResult,
} from "@/lib/watchpilot/research-plan";
import { LAB_PROVIDERS } from "@/lib/watchpilot/fixtures";
import { loadRadarWorkspace, saveRadarWorkspace, upsertTrackedTitle } from "@/lib/watchpilot/radar-workspace";

const ACCESS_LABEL: Record<TWOffer["monetization"], string> = {
  flatrate: "訂閱",
  free: "免費",
  ads: "含廣告",
  rent: "租借",
  buy: "購買",
};
const REJECTION_LABELS: Record<string, string> = {
  already_watched: "已看過",
  excluded_genre: "排除類型",
  invalid_runtime_or_score: "片長或分數無效",
  no_eligible_offer: "沒有符合訂閱／地區／時效的片源",
  no_slot_fits: "每天時段或每週總時間不足",
};
function todayTW(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}
type SearchPayload = {
  titles?: TWTitle[];
  checkedAt?: string;
  warnings?: { tmdbId: number; reason: string }[];
  error?: string;
};

export default function TWCatalogResearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TWTitle[]>([]);
  const [selected, setSelected] = useState<TWTitle[]>([]);
  const [trackedIds, setTrackedIds] = useState<number[]>([]);
  const [subscribed, setSubscribed] = useState<string[]>([]);
  const [preference, setPreference] = useState("想看科幻、懸疑，不要恐怖片");
  const [startDate, setStartDate] = useState(todayTW);
  const [weeklyHours, setWeeklyHours] = useState(6);
  const [dailyHours, setDailyHours] = useState(3.5);
  const [plan, setPlan] = useState<TWResearchResult | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const currentRequest = useRef(0);
  useEffect(() => {
    const workspace = loadRadarWorkspace(window.localStorage);
    setTrackedIds(workspace.tracked.map(title => title.tmdbId));
  }, []);
  function addRadar(item: TWTitle) {
    setError(null);
    try {
      const current = loadRadarWorkspace(window.localStorage);
      const next = upsertTrackedTitle(current, item);
      saveRadarWorkspace(window.localStorage, next);
      setTrackedIds(next.tracked.map(title => title.tmdbId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法加入雷達");
    }
  }

  const providerLabels = new Map<string, string>(
    LAB_PROVIDERS.map(provider => [provider.id, provider.name] as [string, string]),
  );
  for (const item of [...selected, ...results]) {
    for (const offer of item.offers) {
      if (offer.access === "subscription" && !providerLabels.has(offer.providerId)) {
        providerLabels.set(offer.providerId, offer.providerName);
      }
    }
  }
  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const seq = ++currentRequest.current;
    setError(null);
    setWarnings([]);
    setLoading(true);
    try {
      const response = await fetch("/api/watchpilot/tw/search?q=" + encodeURIComponent(query.trim()), {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const payload = await response.json() as SearchPayload;
      if (!response.ok) throw new Error(payload.error || "無法取得TMDB資料");
      if (seq !== currentRequest.current) return;
      setResults(payload.titles ?? []);
      setCheckedAt(payload.checkedAt ?? null);
      setWarnings((payload.warnings ?? []).map(x => x.tmdbId));
    } catch (cause) {
      if (seq !== currentRequest.current) return;
      setResults([]);
      setError(cause instanceof Error ? cause.message : "查詢失敗");
    } finally {
      if (seq === currentRequest.current) setLoading(false);
    }
  }
  function toggleProvider(id: string) {
    setSubscribed(current => current.includes(id)
      ? current.filter(x => x !== id) : [...current, id]);
    setPlan(null);
  }
  function toggleTitle(item: TWTitle) {
    setSelected(current => current.some(x => x.tmdbId === item.tmdbId)
      ? current.filter(x => x.tmdbId !== item.tmdbId)
      : [...current, item]);
    setPlan(null);
  }
  function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const next = generateTWResearchPlan(selected, {
        startDate,
        weeklyMinutes: Math.round(weeklyHours * 60),
        dailyMinutes: Math.round(dailyHours * 60),
        subscribedProviders: subscribed,
        preferenceText: preference,
      });
      setPlan(next);
    } catch (cause) {
      setPlan(null);
      setError(cause instanceof Error ? cause.message : "無法產生研究計畫");
    }
  }
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-10 sm:px-8">
      <div className="space-y-3">
        <Link href="/lab" className="text-sm text-amber hover:underline">返回離線研究實驗室</Link>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber">WatchPilot Lab / TW API Research</p>
        <h1 className="text-3xl font-bold">台灣OTT片源研究</h1>
        <Link href="/lab/radar" className="inline-flex rounded-lg border border-amber/50 px-4 py-2 text-sm font-medium text-amber hover:bg-amber/10">
          查看片庫IN／OUT雷達
        </Link>
        <p className="text-muted-foreground">
          使用自己的TMDB API Key搜尋電影。可加入候選片單，再依觀看時數、個人偏好及台灣觀測到的觀看來源排程。
        </p>
        <div role="status" className="rounded-xl border border-amber/40 bg-amber/10 p-4 text-sm text-amber">
          TMDB／JustWatch提供的是第三方<strong>台灣片源觀測資訊</strong>，不是OTT官方授權證明或保證。
          本頁沒有真實下架日期、沒有Jev模型，也不會把同步失敗解讀為影片下架。
          API金鑰只設定於本機伺服器，不會回傳瀏覽器。
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-5 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-xl font-semibold">1.查詢電影名稱</h2>
          <form className="flex gap-2" onSubmit={search}>
            <input
              aria-label="輸入電影名稱" value={query}
              onChange={event => setQuery(event.target.value)}
              minLength={2} maxLength={80} required
              placeholder="例：星際效應、Inception"
              className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
            <button disabled={loading} type="submit"
              className="rounded-lg bg-amber px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
              {loading ? "查詢中" : "搜尋"}
            </button>
          </form>
          <p className="text-xs text-muted-foreground">
            每次查詢最多取得5部作品，並讀取各作品的詳細資料與台灣觀看平台。
            不提供整庫匯出。若未設定Key，請使用<Link href="/lab" className="underline">Fixture模式</Link>。
          </p>
          {checkedAt && <p className="text-xs text-muted-foreground">
            資料查詢：{new Date(checkedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}（台灣時間）
          </p>}
          {warnings.length > 0 && <p className="text-sm text-amber">
            部分查詢失敗（TMDB ID：{warnings.join("、")}），未將其視為無片源。
          </p>}
          {results.length === 0 && checkedAt && <p className="text-sm text-muted-foreground">
            沒有找到可處理的作品。這不表示所有OTT均無片源。
          </p>}
          <ul className="space-y-3">
            {results.map(item => {
              const added = selected.some(x => x.tmdbId === item.tmdbId);
              return (
                <li key={item.tmdbId} className="space-y-2 rounded-xl border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{item.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        {item.year ?? "年份未知"} · {item.runtimeMinutes ? item.runtimeMinutes + "分鐘" : "片長未知"} · TMDB #{item.tmdbId}
                      </p>
                      {item.originalTitle !== item.title && <p className="text-xs text-muted-foreground">{item.originalTitle}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      <button type="button" disabled={!item.runtimeMinutes} onClick={() => toggleTitle(item)}
                        className="rounded-lg border border-amber/40 px-3 py-2 text-xs font-medium text-amber disabled:opacity-40">
                        {added ? "移除" : item.runtimeMinutes ? "加入候選" : "缺少片長"}
                      </button>
                      <button type="button" onClick={() => addRadar(item)}
                        className="rounded-lg border border-border px-3 py-2 text-xs">
                        {trackedIds.includes(item.tmdbId) ? "更新雷達基準" : "加入雷達"}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {item.offers.map(offer => (
                      <span key={offer.tmdbProviderId + ":" + offer.monetization}
                        className="rounded bg-secondary px-2 py-1 text-xs">
                        {offer.providerName}·{ACCESS_LABEL[offer.monetization]}
                      </span>
                    ))}
                  </div>
                  {item.availabilityStatus === "NO_TW_OFFERS" &&
                    <p className="text-xs text-muted-foreground">TMDB未提供台灣觀看平台資訊；不等於確定下架。</p>}
                  <div className="text-xs">
                    {item.watchLink
                      ? <a href={item.watchLink} target="_blank" rel="noopener noreferrer" className="text-amber underline">查看TMDB觀看資訊</a>
                      : <span className="text-muted-foreground">無可驗證的觀看頁面連結</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="space-y-5 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-xl font-semibold">2.組合個人觀影計畫</h2>
          <p className="text-sm text-muted-foreground">
            已選{selected.length}部；僅有片長與足夠新鮮的台灣片源觀測，才可能排入研究計畫。
          </p>
          {selected.length > 0 && <div className="flex flex-wrap gap-2">
            {selected.map(item => <button key={item.tmdbId} type="button" onClick={() => toggleTitle(item)}
              className="rounded-full border border-border px-3 py-1 text-xs hover:border-amber"
              aria-label={"移除" + item.title}>{item.title} ×</button>)}
          </div>}
          <form onSubmit={generate} className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">我的訂閱平台</legend>
              <div className="grid grid-cols-2 gap-2">
                {[...providerLabels.entries()].map(([id, name]) => (
                  <label key={id} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
                    <input type="checkbox" checked={subscribed.includes(id)} onChange={() => toggleProvider(id)} />
                    <span>{name}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-1">
              <label htmlFor="tw-preference" className="text-sm font-medium">觀影偏好</label>
              <textarea id="tw-preference" rows={3} value={preference}
                onChange={event => { setPreference(event.target.value); setPlan(null); }}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"/>
              <p className="text-xs text-muted-foreground">目前使用關鍵字規則，非LLM語意理解。</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1 text-xs">開始日期
                <input type="date" required value={startDate}
                  onChange={event => { setStartDate(event.target.value); setPlan(null); }}
                  className="w-full rounded-lg border border-input bg-background p-2 text-xs"/>
              </label>
              <label className="space-y-1 text-xs">每週時數
                <input type="number" min={1} max={40} step={1} value={weeklyHours}
                  onChange={event => { setWeeklyHours(Number(event.target.value)); setPlan(null); }}
                  className="w-full rounded-lg border border-input bg-background p-2 text-xs"/>
              </label>
              <label className="space-y-1 text-xs">每日上限(小時)
                <input type="number" min={0.5} max={8} step={0.5} value={dailyHours}
                  onChange={event => { setDailyHours(Number(event.target.value)); setPlan(null); }}
                  className="w-full rounded-lg border border-input bg-background p-2 text-xs"/>
              </label>
            </div>
            <button type="submit" disabled={selected.length === 0}
              className="w-full rounded-lg bg-amber px-4 py-3 font-semibold text-black disabled:opacity-40">
              產生台灣片源研究計畫
            </button>
          </form>
          {error && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-red-400">{error}</p>}
          {plan && <div aria-live="polite" className="space-y-3">
            <p className="text-sm font-medium">
              已排入{plan.plan.items.length}部，共{plan.plan.scheduledMinutes}／{plan.plan.requestedMinutes}分鐘
            </p>
            {plan.unschedulable.length > 0 && <p className="text-xs text-amber">
              片長未知而跳過：{plan.unschedulable.map(x => x.tmdbId).join("、")}
            </p>}
            {plan.plan.items.map(item => (
              <div key={item.movieId} className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">{item.date} · {item.providerId}</p>
                <p className="font-semibold">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {item.runtimeMinutes}分鐘 · 實驗分數{item.score} · {item.evidence === "OBSERVED" ? "第三方觀測" : item.evidence}
                </p>
              </div>
            ))}
            {plan.plan.items.length === 0 && <p className="text-sm text-muted-foreground">
              尚無合格片源。可能是未勾選訂閱平台、影片缺少TW資料、片源觀測超過7天或觀看時間不足。
            </p>}
            {plan.plan.rejections.length > 0 && <details className="rounded-lg bg-secondary/50 p-3 text-sm">
              <summary className="cursor-pointer">未排入候選（{plan.plan.rejections.length}）</summary>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {plan.plan.rejections.map(x => <li key={x.movieId}>
                  {x.movieId}：{REJECTION_LABELS[x.reason] ?? x.reason}
                </li>)}
              </ul>
            </details>}
            <p className="text-xs text-muted-foreground">
              僅做觀影決策研究。第三方觀測不保證現在可播放；沒有已確認下架倒數。
              演算法是Greedy基準，不保證全域最優。
            </p>
          </div>}
        </section>
      </div>
      <footer className="rounded-xl border border-border p-4 text-xs text-muted-foreground">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" aria-label="TMDB官方網站">
            {/* TMDB官方核准標誌；保持原比例與色彩，不代表TMDB認可本研究。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="TMDB" width={95} height={28}
              src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg" />
          </a>
          <strong>資料來源：TMDB／JustWatch。</strong>
        </div>
        觀看平台資訊由TMDB透過JustWatch合作資料提供，需進一步以各平台確認。
        <p className="mt-1">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        <a className="mt-2 inline-block text-amber underline"
          href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">
          前往TMDB
        </a>
      </footer>
    </main>
  );
}
