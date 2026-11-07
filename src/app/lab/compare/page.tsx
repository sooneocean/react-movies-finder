"use client";

import Link from "next/link";
import { useState } from "react";
import type { JevDecision, WatchChoice } from "@/lib/watchpilot/decision-ab";
import { LAB_PROVIDERS } from "@/lib/watchpilot/fixtures";

interface ComparisonResult {
  dataMode: "FIXTURE";
  candidates: WatchChoice[];
  baselinePick: string;
  qualityPick: string;
  jev: JevDecision | null;
  jevStatus: "LIVE" | "NOT_REQUESTED";
  scheduledMinutes: number;
  algorithm: string;
  source: string;
}
interface ExperimentFeedback {
  at: string;
  chosenId: string;
  baselinePick: string;
  qualityPick: string;
  jevPick: string | null;
  source: "FIXTURE";
  model: string | null;
}
function todayTW(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}
const STORE_KEY = "watchpilot-ab-feedback-v1";
export default function ComparisonPage() {
  const [prompt, setPrompt] = useState("我想看有懸疑感、節奏明快的科幻電影，不要恐怖片");
  const [weeklyHours, setWeeklyHours] = useState(6);
  const [startDate, setStartDate] = useState(todayTW);
  const [providers, setProviders] = useState<string[]>(["netflix","disney"]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  function toggleProvider(id: string) {
    setProviders(values => values.includes(id) ? values.filter(p => p !== id) : [...values,id]);
    setResult(null); setSaved(null);
  }
  async function run(useJev: boolean) {
    if (busy) return;
    setBusy(true); setError(null); setSaved(null);
    try {
      const response = await fetch("/api/watchpilot/decision/compare", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt, startDate, weeklyMinutes: weeklyHours * 60,
          subscribedProviders: providers, useJev,
        }), cache: "no-store",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(payload && typeof payload === "object" && "error" in payload &&
          typeof payload.error === "string" ? payload.error : "研究請求失敗");
      }
      setResult(payload as ComparisonResult);
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : "無法產生比較結果");
    } finally {
      setBusy(false);
    }
  }
  function pickMovie(id: string) {
    if (!result || !result.candidates.some(c => c.id === id)) return;
    const feedback: ExperimentFeedback = {
      at: new Date().toISOString(),
      chosenId: id, baselinePick: result.baselinePick,
      qualityPick: result.qualityPick, jevPick: result.jev?.selectedId ?? null,
      source: "FIXTURE", model: result.jev?.servedModel ?? null,
    };
    try {
      const stored = window.localStorage.getItem(STORE_KEY);
      let current: ExperimentFeedback[] = [];
      if (stored && stored.length < 30_000) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) current = parsed.slice(-49) as ExperimentFeedback[];
      }
      window.localStorage.setItem(STORE_KEY, JSON.stringify([...current, feedback]));
      setSaved("已在本機保存你選擇的測試作品，最多保留50筆；這是個人主觀回饋，不代表真實觀看。");
    } catch {
      setSaved("瀏覽器無法儲存本機回饋；本次選擇未保存。");
    }
  }
  const find = (id: string) => result?.candidates.find(x => x.id === id);
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-7 px-4 py-10 sm:px-8">
      <div className="space-y-2">
        <Link href="/lab" className="text-sm text-amber hover:underline">返回觀影決策實驗室</Link>
        <p className="text-xs uppercase tracking-[0.18em] text-amber">WatchPilot Lab / Decision A-B</p>
        <h1 className="text-3xl font-bold">Jev與規則式觀影決策比較</h1>
        <p className="text-muted-foreground">
          同一份已通過硬限制的合成電影候選，由兩種規則與選配Jev評選「今晚先看哪部」。
          排程、片源與期限仍由程式檢查，Jev只參與偏好選擇。
        </p>
        <div role="status" className="rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm text-amber">
          全部作品均為<strong>Fixture虛構資料</strong>。Jev預設停用，只有你點選「呼叫Jev」且本機伺服器明確啟用並配置金鑰後，才可能產生第三方API費用。
        </div>
      </div>
      <form className="space-y-4 rounded-xl border border-border bg-card p-5" onSubmit={event => { event.preventDefault(); void run(false); }}>
        <label className="block space-y-2 text-sm">
          <span>繁體中文觀影需求（不超過400字）</span>
          <textarea rows={3} maxLength={400} value={prompt}
            onChange={event => { setPrompt(event.target.value); setResult(null); }}
            className="w-full rounded-lg border border-input bg-background p-3"/>
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">目前訂閱平台（實驗條件）</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {LAB_PROVIDERS.map(p => <label key={p.id}
              className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
              <input type="checkbox" checked={providers.includes(p.id)} onChange={() => toggleProvider(p.id)}/>
              {p.name}
            </label>)}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm">每週時數
            <input type="number" min={1} max={40} step={1} value={weeklyHours}
              onChange={event => { setWeeklyHours(Number(event.target.value)); setResult(null); }}
              className="w-full rounded-lg border border-input bg-background p-2"/>
          </label>
          <label className="space-y-1 text-sm">開始日期
            <input type="date" required value={startDate}
              onChange={event => { setStartDate(event.target.value); setResult(null); }}
              className="w-full rounded-lg border border-input bg-background p-2"/>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy}
            className="rounded-lg bg-amber px-4 py-2 font-semibold text-black disabled:opacity-50">
            {busy ? "分析中" : "免費規則式A/B比較"}
          </button>
          <button type="button" disabled={busy || prompt.trim().length === 0}
            onClick={() => {
              if (window.confirm("這會向TypeSafe Jev發送你的觀影需求，若本機已啟用服務可能產生費用。確定進行？")) {
                void run(true);
              }
            }}
            className="rounded-lg border border-amber/40 px-4 py-2 font-semibold text-amber disabled:opacity-50">
            呼叫Jev（需自行啟用付費API）
          </button>
        </div>
      </form>
      {error && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-red-400">{error}</p>}
      {result && <section aria-live="polite" className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="text-xl font-semibold">本次比較結果</h2>
        <p className="text-xs text-muted-foreground">
          {result.source}；排程演算法：{result.algorithm}；總排程：{result.scheduledMinutes}分鐘。
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Recommendation title="A｜排程分數規則" movie={find(result.baselinePick)} />
          <Recommendation title="B｜純品質分數規則" movie={find(result.qualityPick)} />
          <Recommendation title="C｜Jev" movie={result.jev ? find(result.jev.selectedId) : undefined}
            note={result.jev ? result.jev.servedModel : "未呼叫，不是假AI結果"} />
        </div>
        {result.jev && <p className="text-xs text-muted-foreground">
          Jev選擇的模型：{result.jev.servedModel}；信心指標：
          {result.jev.confidence === null ? "未提供" : result.jev.confidence.toFixed(3)}；
          輸入Token：{result.jev.inputTokens ?? "未提供"}。
        </p>}
        <h3 className="font-semibold">你實際會優先選哪部？</h3>
        <p className="text-sm text-muted-foreground">
          點選以下電影可在本機保存個人偏好回饋。這是研究紀錄，不會代表真的已經看完電影。
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {result.candidates.map(item => <button key={item.id} type="button"
            onClick={() => pickMovie(item.id)}
            className="rounded-lg border border-border p-3 text-left text-sm hover:border-amber">
            {item.title}<span className="block text-xs text-muted-foreground">
              {item.runtimeMinutes}分鐘·排程分數{item.planScore}
            </span>
          </button>)}
        </div>
        {saved && <p role="status" className="text-sm text-amber">{saved}</p>}
      </section>}
      <footer className="text-xs text-muted-foreground">
        研究限制：此介面不是盲測，也無法代表真實看片品質；請在後續版本針對同一真實片單建立交叉驗證。
        使用者選擇紀錄只保留在瀏覽器localStorage，不傳送至GitHub。
      </footer>
    </main>
  );
}
function Recommendation({title,movie,note}: {title: string; movie?: WatchChoice; note?: string}) {
  return <div className="rounded-lg border border-border p-4">
    <p className="text-xs text-muted-foreground">{title}</p>
    <p className="mt-2 font-semibold">{movie?.title ?? "尚無結果"}</p>
    {movie && <p className="mt-1 text-xs text-muted-foreground">{movie.runtimeMinutes}分鐘·{movie.providerId}</p>}
    {note && <p className="mt-2 text-xs text-amber">{note}</p>}
  </div>;
}
