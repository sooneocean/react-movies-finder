"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { TWTitle } from "@/lib/watchpilot/tmdb-tw";
import { generateTWResearchPlan } from "@/lib/watchpilot/research-plan";
import { deriveRadarEvents, type RadarEvent, type RadarSnapshot, type ReviewedNotice } from "@/lib/watchpilot/catalog-radar";
import {
  emptyRadarWorkspace, loadRadarWorkspace, removeTrackedTitle, recordRadarRefreshFailure,
  saveRadarWorkspace, upsertTrackedTitle, upsertReviewedNotice,
  withReviewedExpiry, type RadarWorkspace,
} from "@/lib/watchpilot/radar-workspace";

const EVENT_LABELS: Record<RadarEvent["kind"], string> = {
  BASELINE: "首次建立觀測基準",
  SOURCE_FAILED: "同步失敗：不判定下架",
  SOURCE_PARTIAL: "來源不完整：不判定下架",
  NEWLY_OBSERVED: "觀測到新增片源",
  RETURNED_OBSERVED: "觀測到片源回歸",
  ACCESS_CHANGED: "觀看權益變動",
  MISSING_FIRST: "首次觀測片源缺失",
  MISSING_REPEATED: "相隔至少24小時仍未觀測到片源",
};
const ACCESS_LABELS: Record<string, string> = {
  subscription: "訂閱", free: "免費", ads: "含廣告",
  rent: "租借", buy: "購買",
};
function currentTWDay(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function fixtureTimeline(): RadarSnapshot[] {
  const now = Date.now();
  const date = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString();
  const base = {
    workId: "fixture:radar-demo", workTitle: "合成研究影片：雷達演練",
    region: "TW" as const, source: "FIXTURE" as const,
    status: "SUCCESS" as const,
  };
  return [
    { ...base, observedAt: date(3), offers: [
      { providerId: "netflix", providerName: "Netflix", access: "subscription" as const },
    ] },
    { ...base, observedAt: date(2), offers: [] },
    { ...base, observedAt: date(0), offers: [] },
  ];
}
function twTime(value: string): string {
  return new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
}
function allEvents(workspace: RadarWorkspace): RadarEvent[] {
  const groups = new Map<string, RadarSnapshot[]>();
  for (const snap of workspace.snapshots) {
    const list = groups.get(snap.workId) ?? [];
    list.push(snap);
    groups.set(snap.workId, list);
  }
  return [...groups.values()].flatMap(history => deriveRadarEvents(history))
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
    .slice(0, 80);
}
export default function CatalogRadarPage() {
  const [workspace, setWorkspace] = useState<RadarWorkspace>(emptyRadarWorkspace);
  const [hydrated, setHydrated] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [chosenWork, setChosenWork] = useState("");
  const [chosenProvider, setChosenProvider] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [officialUrl, setOfficialUrl] = useState("");
  const [userReviewed, setUserReviewed] = useState(false);
  const [weeklyHours, setWeeklyHours] = useState(6);
  const [dailyHours, setDailyHours] = useState(3.5);
  const [startDate, setStartDate] = useState(currentTWDay);
  const [subscribed, setSubscribed] = useState<string[]>([]);
  const [planNote, setPlanNote] = useState<string | null>(null);
  const [plan, setPlan] = useState<RadarWorkspace["lastPlan"]>(undefined);

  useEffect(() => {
    const loaded = loadRadarWorkspace(window.localStorage);
    setWorkspace(loaded);
    setPlan(loaded.lastPlan);
    setHydrated(true);
  }, []);

  const events = useMemo(
    () => demo ? deriveRadarEvents(fixtureTimeline()).reverse() : allEvents(workspace),
    [workspace, demo],
  );
  const selectedTitle = workspace.tracked.find(item => "tmdb:" + item.tmdbId === chosenWork);
  const providers = [
    ...(selectedTitle?.offers.filter(offer => offer.access === "subscription")
      .map(offer => ({ id: offer.providerId, name: offer.providerName })) ?? []),
    ...workspace.snapshots
      .filter(snap => snap.workId === chosenWork && snap.status === "SUCCESS")
      .flatMap(snap => snap.offers.map(offer => ({
        id: offer.providerId, name: offer.providerName,
      }))),
  ];
  const dedupProviders = [...new Map(providers.map(provider => [provider.id, provider])).values()];
  const subscriptionOptions = [...new Map(workspace.tracked.flatMap(item => item.offers)
    .filter(offer => offer.access === "subscription")
    .map(offer => [offer.providerId, offer.providerName] as const)).entries()];
  function commit(next: RadarWorkspace) {
    saveRadarWorkspace(window.localStorage, next);
    setWorkspace(next);
  }
  async function refresh(item: TWTitle) {
    if (busyId !== null) return;
    setError(null);
    setBusyId(item.tmdbId);
    try {
      const response = await fetch("/api/watchpilot/tw/title?id=" + item.tmdbId, {
        headers: { Accept: "application/json" }, cache: "no-store",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = payload && typeof payload === "object" && "error" in payload
          && typeof payload.error === "string" ? payload.error : "無法更新片源觀測";
        throw new Error(message);
      }
      if (!payload || typeof payload !== "object" || !("title" in payload) ||
        !payload.title || typeof payload.title !== "object") throw new Error("上游資料格式錯誤");
      const title = payload.title as TWTitle;
      if (title.tmdbId !== item.tmdbId || title.region !== "TW") throw new Error("作品或地區不符");
      const next = upsertTrackedTitle(workspace, title);
      commit(next);
    } catch (cause) {
      // Failed fetch is retained as an audit event, NEVER as a successful empty snapshot.
      try {
        commit(recordRadarRefreshFailure(workspace, item.tmdbId));
      } catch {
        // Local storage may be blocked; keep showing the original error.
      }
      setError(cause instanceof Error ? cause.message : "更新失敗，沒有記錄為下架");
    } finally {
      setBusyId(null);
    }
  }
  function remove(item: TWTitle) {
    commit(removeTrackedTitle(workspace, item.tmdbId));
    if (chosenWork === "tmdb:" + item.tmdbId) setChosenWork("");
    setPlan(undefined);
    setPlanNote(null);
  }
  function addNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      if (!userReviewed) throw new Error("必須先自行核對官方網頁並勾選已查核");
      const notice: ReviewedNotice = {
        workId: chosenWork, providerId: chosenProvider,
        expiresOn, sourceUrl: officialUrl.trim(),
        checkedAt: new Date().toISOString(), reviewedByUser: true,
      };
      commit(upsertReviewedNotice(workspace, notice));
      setOfficialUrl(""); setExpiresOn(""); setUserReviewed(false);
      setPlanNote("已儲存使用者人工查核期限，請重新產生觀影計畫。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "公告資料不完整");
    }
  }
  function replan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const before = workspace.lastPlan?.output.items.map(item => item.movieId) ?? [];
      const reviewed = withReviewedExpiry(workspace.tracked, workspace.reviewedNotices);
      const result = generateTWResearchPlan(reviewed, {
        startDate, weeklyMinutes: Math.round(weeklyHours * 60),
        dailyMinutes: Math.round(dailyHours * 60),
        subscribedProviders: subscribed, preferenceText: "喜歡科幻、懸疑、犯罪、劇情，不要恐怖片",
      });
      const now = new Date().toISOString();
      const nextPlan = { generatedAt: now, output: result.plan };
      commit({ ...workspace, lastPlan: nextPlan });
      setPlan(nextPlan);
      const after = result.plan.items.map(item => item.movieId);
      const added = after.filter(id => !before.includes(id));
      const removed = before.filter(id => !after.includes(id));
      setPlanNote(before.length === 0
        ? "已建立第一份觀影計畫。"
        : "重新排程：新增" + added.length + "部、移除" + removed.length +
          "部；同一作品的時間或平台也可能改變，請核對下列結果。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "重新排程失敗");
    }
  }
  function clearAll() {
    if (!window.confirm("確定刪除本機WatchPilot雷達追蹤、快照與人工查核紀錄？")) return;
    commit(emptyRadarWorkspace());
    setPlan(undefined); setChosenWork(""); setError(null); setPlanNote(null);
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-7 px-4 py-10 sm:px-8">
      <div className="space-y-3">
        <Link href="/lab/tw" className="text-sm text-amber hover:underline">返回台灣片源研究</Link>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber">WatchPilot Lab / Catalog Intelligence</p>
        <h1 className="text-3xl font-bold">台灣OTT片庫IN／OUT雷達</h1>
        <p className="text-muted-foreground">
          為自己追蹤的電影儲存少量台灣片源觀測快照，查看權益變化、人工查核下架期限，並重新安排觀影計畫。
        </p>
        <div role="status" className="rounded-xl border border-amber/40 bg-amber/10 p-4 text-sm text-amber">
          <strong>個人研究／非官方監控。</strong>所有自動變動均為TMDB／JustWatch第三方觀測。
          片源消失不代表版權到期或確定下架；人工查核期限也不代表系統獨立驗證。
          本研究不會在背景自動登入或爬取任何OTT。
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">1.追蹤的電影</h2>
            <Link href="/lab/tw" className="text-xs text-amber underline">搜尋並加入作品</Link>
          </div>
          {!hydrated && <p className="text-sm text-muted-foreground">讀取本機研究紀錄中…</p>}
          {hydrated && workspace.tracked.length === 0 && <p className="text-sm text-muted-foreground">
            尚未追蹤作品。先到台灣片源研究頁搜尋電影，按「加入雷達」。或者使用下方離線合成演練。
          </p>}
          {workspace.tracked.map(item => {
            const count = workspace.snapshots.filter(snap => snap.workId === "tmdb:" + item.tmdbId).length;
            return <div key={item.tmdbId} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-xs text-muted-foreground">TMDB #{item.tmdbId} · {count}次有效快照（最多保留30天）</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busyId !== null} onClick={() => refresh(item)}
                    className="rounded-lg border border-amber/50 px-3 py-2 text-xs text-amber disabled:opacity-40">
                    {busyId === item.tmdbId ? "查詢中" : "重新查詢"}
                  </button>
                  <button type="button" onClick={() => remove(item)}
                    className="rounded-lg border border-border px-3 py-2 text-xs">移除</button>
                </div>
              </div>
            </div>;
          })}
          {error && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-red-400">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setDemo(value => !value)}
              className="rounded-lg bg-secondary px-3 py-2 text-sm">
              {demo ? "返回真實觀測紀錄" : "展示離線合成IN／OUT演練"}
            </button>
            {workspace.tracked.length > 0 && <button type="button" onClick={clearAll}
              className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
              清除本機研究資料
            </button>}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-xl font-semibold">2.片庫事件時間線</h2>
          <p className="text-xs text-muted-foreground">
            第一次同步建立基準；失敗不等於下架；連續缺失需間隔24小時才會標記重複缺失。
          </p>
          {demo && <p className="rounded-lg bg-amber/10 p-3 text-xs text-amber">目前展示的事件全部為Fixture，無任何真實平台資訊。</p>}
          {events.length === 0 && <p className="text-sm text-muted-foreground">尚無可分析的成功快照。</p>}
          <ol className="max-h-[440px] space-y-2 overflow-auto">
            {events.map(item => <li key={item.id} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{twTime(item.observedAt)} · {item.confidence === "FIXTURE" ? "合成演練" : item.confidence === "UNKNOWN" ? "資料取得異常" : "第三方觀測"}</p>
              <p className="mt-1 font-medium">{EVENT_LABELS[item.kind]}</p>
              <p className="text-sm">{item.workTitle}{item.providerName ? "｜" + item.providerName : ""}</p>
              {item.fromAccess && item.toAccess &&
                <p className="text-xs text-muted-foreground">
                  {item.fromAccess.map(x => ACCESS_LABELS[x] ?? x).join("、") || "未觀測到"}
                  {" → "}
                  {item.toAccess.map(x => ACCESS_LABELS[x] ?? x).join("、") || "未觀測到"}
                </p>}
              {(item.kind === "MISSING_FIRST" || item.kind === "MISSING_REPEATED") &&
                <p className="text-xs text-amber">僅表示資料來源未觀測到，並非確定下架。</p>}
            </li>)}
          </ol>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-xl font-semibold">3.人工查核官方下架公告</h2>
          <p className="text-sm text-muted-foreground">
            僅在你親自查閱平台官方公告後填寫。系統將明確標示「使用者人工查核」，不假裝已由獨立服務認證。
          </p>
          <form className="space-y-3" onSubmit={addNotice}>
            <label className="block space-y-1 text-sm">
              <span>電影</span>
              <select required value={chosenWork} onChange={event => { setChosenWork(event.target.value); setChosenProvider(""); }}
                className="w-full rounded-lg border border-input bg-background px-3 py-2">
                <option value="">選擇追蹤作品</option>
                {workspace.tracked.map(title => <option value={"tmdb:" + title.tmdbId} key={title.tmdbId}>{title.title}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span>下架的OTT平台</span>
              <select required value={chosenProvider} onChange={event => setChosenProvider(event.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2">
                <option value="">選擇平台</option>
                {dedupProviders.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span>官方公告的最後可觀看日期（台灣日曆日）</span>
              <input type="date" required value={expiresOn} onChange={event => setExpiresOn(event.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2"/>
            </label>
            <label className="block space-y-1 text-sm">
              <span>官方公告HTTPS網址</span>
              <input type="url" required value={officialUrl} maxLength={500}
                onChange={event => setOfficialUrl(event.target.value)}
                placeholder="https://..." className="w-full rounded-lg border border-input bg-background px-3 py-2"/>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" required checked={userReviewed} onChange={event => setUserReviewed(event.target.checked)} />
              <span>我已自行開啟並核對官方公告、作品、平台及下架日期。</span>
            </label>
            <button type="submit" disabled={!chosenWork || !chosenProvider}
              className="w-full rounded-lg border border-amber/50 px-4 py-2 text-amber disabled:opacity-40">
              儲存人工查核紀錄
            </button>
          </form>
          {workspace.reviewedNotices.length > 0 && <ul className="space-y-2">
            {workspace.reviewedNotices.map(note => <li key={note.workId + "::" + note.providerId}
              className="rounded-lg border border-border p-3 text-xs">
              <p className="font-medium">{workspace.tracked.find(x => "tmdb:" + x.tmdbId === note.workId)?.title ?? note.workId}
                {"｜" + note.providerId}｜{note.expiresOn}</p>
              <p className="text-muted-foreground">使用者人工查核｜{twTime(note.checkedAt)}</p>
              <a href={note.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-amber underline">查看人工查核的公告來源</a>
            </li>)}
          </ul>}
        </section>

        <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-xl font-semibold">4.重新規劃7天片單</h2>
          <p className="text-sm text-muted-foreground">
            使用最新觀測的片源與你人工查核的期限，計算可執行的觀影計畫。請自行確認實際播放權限。
          </p>
          <form className="space-y-3" onSubmit={replan}>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">目前訂閱</legend>
              <div className="grid grid-cols-2 gap-2">
                {subscriptionOptions.map(([id, name]) => <label key={id} className="flex items-center gap-2 rounded-lg border border-border p-2 text-xs">
                  <input type="checkbox" checked={subscribed.includes(id)}
                    onChange={() => { setSubscribed(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]); setPlan(undefined); }}/>
                  {name}
                </label>)}
              </div>
            </fieldset>
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1 text-xs">開始日期
                <input type="date" required value={startDate} onChange={event => setStartDate(event.target.value)}
                  className="w-full rounded-lg border border-input bg-background p-2 text-xs"/>
              </label>
              <label className="space-y-1 text-xs">每週時數
                <input type="number" min={1} max={40} step={1} value={weeklyHours}
                  onChange={event => setWeeklyHours(Number(event.target.value))}
                  className="w-full rounded-lg border border-input bg-background p-2 text-xs"/>
              </label>
              <label className="space-y-1 text-xs">每日上限(小時)
                <input type="number" min={0.5} max={8} step={0.5} value={dailyHours}
                  onChange={event => setDailyHours(Number(event.target.value))}
                  className="w-full rounded-lg border border-input bg-background p-2 text-xs"/>
              </label>
            </div>
            <button type="submit" disabled={workspace.tracked.length === 0}
              className="w-full rounded-lg bg-amber px-4 py-3 font-semibold text-black disabled:opacity-40">
              重新排程並比較
            </button>
          </form>
          {planNote && <p className="rounded-lg bg-secondary p-3 text-sm">{planNote}</p>}
          {plan && <div className="space-y-2">
            <p className="text-sm font-medium">共{plan.output.items.length}部，{plan.output.scheduledMinutes}／{plan.output.requestedMinutes}分鐘</p>
            {plan.output.items.map(item => <div key={item.movieId} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{item.date}｜{item.providerId}</p>
              <p className="font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.runtimeMinutes}分鐘｜{item.evidence === "OBSERVED" ? "片源觀測" : item.evidence}</p>
              {item.confirmedExpiryOn && <p className="text-xs text-amber">
                {item.expiryEvidence === "USER_REVIEWED_OFFICIAL" ? "使用者人工查核期限：" : "已確認期限："}
                {item.confirmedExpiryOn}
              </p>}
            </div>)}
            {plan.output.items.length === 0 && <p className="text-sm text-muted-foreground">
              無可安排作品：可能沒有勾選有效訂閱、片源觀測太舊、時間不足，或期限已過。
            </p>}
          </div>}
        </section>
      </div>
      <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
        本機研究資料以少量必要作品資訊儲存於瀏覽器localStorage；每部作品最多保留20筆、30天內的觀測快照。
        支援人工更新，不提供背景自動監控。真實第三方片源資料不得在公開GitHub大量再散布。
        <p className="mt-2">資料來源：TMDB／JustWatch。This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
      </div>
    </main>
  );
}
