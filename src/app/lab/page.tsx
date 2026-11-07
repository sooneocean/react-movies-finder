"use client";

import Link from "next/link";

import { useState, type FormEvent } from "react";
import { planViewing, type PlanOutput } from "@/lib/watchpilot/engine";
import {
  LAB_PROVIDERS, makeLabInput, parsePreferenceHint,
} from "@/lib/watchpilot/fixtures";

function taipeiToday(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
const reasons: Record<string, string> = {
  already_watched: "已看過",
  excluded_genre: "排除的類型",
  invalid_runtime_or_score: "資料不完整",
  no_eligible_offer: "沒有符合條件的片源",
  no_slot_fits: "觀看時間不足",
};
const providerNames: Record<string, string> = Object.fromEntries(
  LAB_PROVIDERS.map(provider => [provider.id, provider.name]),
);

export default function WatchPilotLabPage() {
  const [startDate, setStartDate] = useState(taipeiToday);
  const [weeklyHours, setWeeklyHours] = useState(6);
  const [providers, setProviders] = useState<string[]>(["netflix", "disney"]);
  const [description, setDescription] = useState("這週想看科幻、懸疑，不要恐怖片。");
  const [result, setResult] = useState<PlanOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<ReturnType<typeof parsePreferenceHint> | null>(null);

  function toggleProvider(id: string) {
    setProviders(current => current.includes(id)
      ? current.filter(value => value !== id)
      : [...current, id]);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const next = makeLabInput({
        startDate, weeklyMinutes: Math.round(weeklyHours * 60),
        subscribedProviders: providers, text: description,
      });
      setResult(planViewing(next));
      setPreferences(parsePreferenceHint(description));
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : "排程失敗，請檢查輸入");
    }
  }
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-10 sm:px-8">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber">WatchPilot Lab / Research Alpha</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">AI觀影決策實驗室</h1>
        <p className="max-w-3xl text-muted-foreground">
          用有限的觀看時間安排最值得看的電影。這個版本先驗證可解釋的排程規則，
          後續再接入真實台灣OTT資料與Jev決策API。
        </p>
        <div role="status" className="rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-amber">
          目前為<strong>Fixture合成資料模式</strong>：所有片名、平台權益與下架日期皆是測試案例，不代表任何真實OTT片庫資訊。
          目前未呼叫TMDB、Jev或其他付費API。
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <form onSubmit={submit} className="space-y-5 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-xl font-semibold">1.設定觀影條件</h2>
          <div className="space-y-2">
            <label htmlFor="watchpilot-prompt" className="block text-sm font-medium">繁體中文觀影需求</label>
            <textarea
              id="watchpilot-prompt" value={description}
              onChange={event => setDescription(event.target.value)}
              rows={4} maxLength={800}
              placeholder="例：想看科幻和懸疑，不要恐怖片"
              className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-amber"
            />
            <p className="text-xs text-muted-foreground">
              目前只辨識科幻、懸疑、犯罪、喜劇、劇情、恐怖等字詞，以及「不要／排除」等明確否定。這不是LLM語意理解。
            </p>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">已訂閱的平台（測試條件）</legend>
            <div className="grid grid-cols-2 gap-2">
              {LAB_PROVIDERS.map(provider => (
                <label key={provider.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm">
                  <input type="checkbox" checked={providers.includes(provider.id)}
                    onChange={() => toggleProvider(provider.id)} className="accent-amber-500" />
                  {provider.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label htmlFor="watchpilot-hours" className="block text-sm font-medium">每週可觀看時數</label>
              <input type="number" id="watchpilot-hours" min={1} max={40} step={1}
                value={weeklyHours} onChange={event => setWeeklyHours(Number(event.target.value))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div className="space-y-2">
              <label htmlFor="watchpilot-date" className="block text-sm font-medium">計畫開始日期</label>
              <input type="date" id="watchpilot-date" required value={startDate}
                onChange={event => setStartDate(event.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <button type="submit"
            className="w-full rounded-lg bg-amber px-4 py-3 font-semibold text-black transition-opacity hover:opacity-90">
            產生7天觀影計畫
          </button>
          <p className="text-xs text-muted-foreground">每次點擊會重新依照設定計算，不上傳個人偏好。</p>
        </form>
        <section aria-live="polite" className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">2.觀影排程結果</h2>
            <span className="rounded-full border border-amber/30 bg-amber/10 px-3 py-1 text-xs text-amber">Greedy Baseline v0</span>
          </div>
          {error && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-red-400">{error}</p>}
          {!result && !error && <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
            選擇OTT與觀看時間後，點選「產生7天觀影計畫」。
          </div>}
          {result && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Summary label="已排入" value={String(result.items.length) + "部"} />
                <Summary label="預估觀看" value={String(result.scheduledMinutes) + "分"} />
                <Summary label="總時數上限" value={String(result.requestedMinutes) + "分"} />
              </div>
              {preferences && (
                <p className="text-xs text-muted-foreground">
                  辨識喜好：{preferences.preferredGenres.join("、") || "未指定"}；
                  排除：{preferences.excludedGenres.join("、") || "未指定"}
                </p>
              )}
              {result.items.length === 0
                ? <p className="rounded-lg bg-secondary p-4 text-sm">目前沒有符合片源、喜好與時間限制的測試作品。請調整平台或可觀看時數。</p>
                : <ol className="space-y-3">
                  {result.items.map((item, index) => (
                    <li key={item.movieId} className="rounded-xl border border-border bg-background p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">{item.date} · 第{index + 1}部</p>
                          <h3 className="mt-1 font-semibold">{item.title}</h3>
                        </div>
                        <span className="shrink-0 rounded-md bg-amber/10 px-2 py-1 text-sm font-semibold text-amber">{item.score}分</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {item.runtimeMinutes}分鐘 · {providerNames[item.providerId] ?? item.providerId} · 合成片源
                      </p>
                      {item.confirmedExpiryOn && <p className="mt-2 text-xs text-amber">
                        測試用截止日期：{item.confirmedExpiryOn}（非真實下架公告）
                      </p>}
                      <p className="mt-2 text-xs text-muted-foreground">理由：符合目前的測試偏好、評分及可用時段限制。</p>
                    </li>
                  ))}
                </ol>}
              {result.rejections.length > 0 &&
                <details className="rounded-lg bg-secondary/50 p-3 text-sm">
                  <summary className="cursor-pointer font-medium">查看未排入作品（{result.rejections.length}部）</summary>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    {result.rejections.map(item => <li key={item.movieId}>
                      {item.movieId}：{reasons[item.reason] ?? item.reason}
                    </li>)}
                  </ul>
                </details>}
              <p className="text-xs text-muted-foreground">
                排程使用確定性貪婪演算法，並非保證全域最優解。此結果只供研究，不應作為實際訂閱或觀看決策。
              </p>
            </>
          )}
        </section>
      </div>
      <section className="rounded-xl border border-amber/40 bg-amber/5 p-4 text-sm">
        <h2 className="font-semibold">Jev決策A/B研究</h2>
        <p className="mt-1 text-muted-foreground">免費比較兩種規則排序，或在明確啟用並確認成本後呼叫Jev。所有候選均先通過硬限制。</p>
        <Link href="/lab/compare" className="mt-3 inline-flex rounded-lg border border-amber/50 px-4 py-2 text-amber hover:bg-amber/10">
          進入A/B決策實驗 →
        </Link>
      </section>
      <section className="rounded-xl border border-amber/40 bg-amber/5 p-4 text-sm">
        <h2 className="font-semibold">台灣TMDB真實資料研究</h2>
        <p className="mt-1 text-muted-foreground">已新增以自己API Key搜尋台灣第三方片源觀測、加入候選及產生排程的實驗頁。</p>
        <Link href="/lab/tw" className="mt-3 inline-flex rounded-lg border border-amber/50 px-4 py-2 text-amber hover:bg-amber/10">進入台灣片源研究 →</Link>
      </section>
      <section className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
        <h2 className="mb-2 font-medium text-foreground">研究進度</h2>
        已完成：離線Fixture、來源可信度隔離、觀看時數限制、排除條件及自動化測試。
        尚未完成：真實台灣片源抽樣驗證、Jev API、收藏同步、下架監控及訂閱最佳化。
      </section>
    </main>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-secondary/50 p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 text-lg font-semibold">{value}</p>
  </div>;
}
