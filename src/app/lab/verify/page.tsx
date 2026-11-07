"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { normalizeTWMovie, type TWTitle } from "@/lib/watchpilot/tmdb-tw";
import { LAB_PROVIDERS } from "@/lib/watchpilot/fixtures";
import {
  emptyRadarWorkspace, loadRadarWorkspace, withReviewedExpiry, type RadarWorkspace,
} from "@/lib/watchpilot/radar-workspace";
import { loadTastePassport } from "@/lib/watchpilot/taste-passport";
import {
  emptyCheckStore, generateCrossCheckedTWPlan, loadCheckStore,
  persistCheckStore, removeHumanCheck, reviewCoverage, saveHumanCheck,
  type CheckResult, type CheckStore, type VerifiedResearch,
} from "@/lib/watchpilot/tw-crosscheck";

const statusText = {
  MATCH: "與TMDB觀測一致",
  DISAGREEMENT: "與TMDB觀測不一致",
  STALE: "逾72小時／來源已更新／作品不存在",
  UNKNOWN: "未完成實際查核",
} as const;
const accessText: Record<CheckResult, string> = {
  subscription: "已見到訂閱可看",
  free: "已見到免費可看",
  ads: "已見到含廣告可看",
  rent: "只能租借",
  buy: "只能購買",
  not_found: "該平台未找到此作品",
  unknown: "無法確認",
};
const extraProviders = [
  {id:"line",name:"LINE TV"},
  {id:"myvideo",name:"MyVideo"},
  {id:"hami",name:"Hami Video"},
  {id:"friday",name:"friDay影音"},
];
function taiwanDay(now = new Date()): string {
  return new Date(now.getTime() + 8*3600000).toISOString().slice(0,10);
}
/** Demo is wholly synthetic and never written to the user's radar or checks. */
function sampleForDemo(now: Date): { titles: TWTitle[]; checks: CheckStore } {
  const stamp=now.toISOString();
  const make=(id:number,title:string,providerName:string,providerId:number) =>
    normalizeTWMovie({
      id,title,original_title:title,runtime:115,genres:[{id:878,name:"科幻"}],
      vote_average:8.1,vote_count:150,overview:"",poster_path:null,
    },{results:{TW:{flatrate:[{provider_id:providerId,provider_name:providerName}]}}},stamp);
  const a=make(900001,"Fixture演練電影A","Netflix",8);
  const b=make(900002,"Fixture演練電影B","Disney Plus",337);
  return {titles:[a,b],checks:{version:1,checks:[
    {workId:"tmdb:900001",providerId:"netflix",checkedAt:stamp,tmdbCheckedAt:stamp,
      result:"subscription",sourceUrl:"https://example.org/fictional-research",reviewerConfirmed:true},
    {workId:"tmdb:900002",providerId:"disney",checkedAt:stamp,tmdbCheckedAt:stamp,
      result:"not_found",sourceUrl:"https://example.org/fictional-research",reviewerConfirmed:true},
  ]}};
}
const registered = [...LAB_PROVIDERS, ...extraProviders];
export default function TWVerificationPage() {
  const [radar,setRadar]=useState<RadarWorkspace>(emptyRadarWorkspace);
  const [checks,setChecks]=useState<CheckStore>(emptyCheckStore);
  const [loaded,setLoaded]=useState(false);
  const [demo,setDemo]=useState(false);
  const [workId,setWorkId]=useState("");
  const [providerId,setProviderId]=useState("netflix");
  const [reviewResult,setReviewResult]=useState<CheckResult>("subscription");
  const [url,setUrl]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [subscribed,setSubscribed]=useState<string[]>(["netflix"]);
  const [startDate,setStartDate]=useState(taiwanDay);
  const [weeklyHours,setWeeklyHours]=useState(6);
  const [dailyHours,setDailyHours]=useState(3);
  const [preference,setPreference]=useState("想看科幻與懸疑，不要恐怖片");
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const [plan,setPlan]=useState<VerifiedResearch|null>(null);
  const [demoTimestamp,setDemoTimestamp]=useState<string|null>(null);
  useEffect(()=>{
    const timer=window.setTimeout(()=>{
      setRadar(loadRadarWorkspace(window.localStorage));
      setChecks(loadCheckStore(window.localStorage));
      setLoaded(true);
    },0);
    return ()=>window.clearTimeout(timer);
  },[]);
  const synthetic=useMemo(()=>sampleForDemo(new Date(demoTimestamp??Date.now())),[demoTimestamp]);
  const titles=demo?synthetic.titles:radar.tracked;
  const usedChecks=demo?synthetic.checks:checks;
  const checked=useMemo(()=>reviewCoverage(titles,usedChecks),[titles,usedChecks]);
  const providers=useMemo(()=>{
    const map=new Map(registered.map(x=>[x.id,x.name]));
    for(const t of titles)for(const o of t.offers)map.set(o.providerId,o.providerName);
    return [...map.entries()].map(([id,name])=>({id,name}));
  },[titles]);
  const selectedTitle=titles.find(t=>"tmdb:"+t.tmdbId===workId);
  function toggleDemo() {
    setDemo(v=>!v);
    setDemoTimestamp(new Date().toISOString());
    setPlan(null);setError(null);setNotice(null);
  }
  function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setError(null);setNotice(null);setPlan(null);
    try {
      if(demo)throw Error("Fixture演練不能當成真人查核紀錄儲存");
      if(!loaded || !selectedTitle || !confirmed)throw Error("請先選擇追蹤電影並勾選人工查核");
      const now=new Date().toISOString();
      const next=saveHumanCheck(checks,{
        workId,providerId,result:reviewResult,checkedAt:now,
        tmdbCheckedAt:selectedTitle.checkedAt,sourceUrl:url,reviewerConfirmed:true,
      });
      persistCheckStore(window.localStorage,next);
      setChecks(next);setNotice("已儲存此一作品／平台的使用者查核結果。這不是OTT平台官方認證。");
      setConfirmed(false);setUrl("");
    } catch (cause) {setError(cause instanceof Error?cause.message:"儲存失敗");}
  }
  function dropCheck(id:string,provider:string) {
    try {
      const next=removeHumanCheck(checks,id,provider);
      persistCheckStore(window.localStorage,next);
      setChecks(next);setPlan(null);
      setNotice("已從個人瀏覽器移除這筆人工查核。");
    } catch (cause) {setError(cause instanceof Error?cause.message:"移除失敗");}
  }
  function generate(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setError(null);setNotice(null);
    try {
      const officialExpiries=demo?[]:radar.reviewedNotices;
      const withExpiry=withReviewedExpiry(titles,officialExpiries);
      setPlan(generateCrossCheckedTWPlan(withExpiry,usedChecks,{
        startDate,weeklyMinutes:Math.round(weeklyHours*60),
        dailyMinutes:Math.round(dailyHours*60),
        subscribedProviders:subscribed,
        preferenceText:preference,
        tastePassport:loadTastePassport(window.localStorage),
      }));
    } catch (cause) {
      setPlan(null);setError(cause instanceof Error?cause.message:"研究計畫無法建立");
    }
  }
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-7 px-4 py-10 sm:px-8">
      <div className="space-y-3">
        <Link href="/lab/tw" className="text-sm text-amber hover:underline">返回台灣片源研究</Link>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber">WatchPilot Lab / TW Cross-Check</p>
        <h1 className="text-3xl font-bold">台灣OTT片源交叉驗證</h1>
        <p className="text-muted-foreground">
          把TMDB的台灣觀看來源與你親自查看的OTT平台結果逐部比對。
          僅用近期、相符的雙來源觀測作為研究排程候選；不會因此推定整個平台的片庫完整或應取消訂閱。
        </p>
        <div role="status" className="rounded-xl border border-amber/40 bg-amber/10 p-4 text-sm text-amber">
          <strong>人工核對≠平台認證。</strong>記錄僅保存於這台瀏覽器；
          時間超過72小時、TMDB資料刷新後未重核對、存取方式不符，均不會成為合格推薦片源。
          無法查明時請選「無法確認」，不要填成「該平台未找到」。沒有金鑰可先進行合成演練。
        </div>
      </div>
      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">1.建立交叉查核清單</h2>
          <button type="button" onClick={toggleDemo} className="rounded-lg border border-amber/50 px-3 py-2 text-sm text-amber">
            {demo?"結束Fixture演練":"顯示離線Fixture演練"}
          </button>
        </div>
        {demo && <p className="rounded-lg bg-amber/10 p-3 text-sm text-amber">
          以下兩部電影、平台與檢查結果全部是合成資料，並非台灣OTT真實片庫。演練資料不會寫入本機查核紀錄。
        </p>}
        <p className="text-sm text-muted-foreground">目前追蹤{titles.length}部電影；{usedChecks.checks.length}筆人工核對。最多以20部追蹤作品進行本機研究。</p>
        {!loaded && <p className="text-sm text-muted-foreground">讀取本機片庫中…</p>}
        {!demo && titles.length===0 && <p className="text-sm text-muted-foreground">
          尚未追蹤真實電影。先開啟<Link href="/lab/tw" className="text-amber underline">台灣電影搜尋</Link>，
          設定自己的TMDB Key，搜尋後按「加入雷達」，再回此頁核對。
        </p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {titles.map(t=><div key={t.tmdbId} className="rounded-lg border border-border p-3">
            <p className="font-semibold">{t.title}</p>
            <p className="text-xs text-muted-foreground">TMDB #{t.tmdbId}｜{t.offers.length}筆第三方觀測權益</p>
            <p className="text-xs text-muted-foreground">來源時間：{new Date(t.checkedAt).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"})}</p>
          </div>)}
        </div>
      </section>
      {!demo && <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-xl font-semibold">2.儲存單片單平台人工查核</h2>
        <p className="text-xs text-muted-foreground">
          你需要自行在OTT網站查找該部作品，記錄看到的實際觀看權益與參考頁面。
          本工具不會自動開啟、登入或驗證該OTT網站。平台官方頁的內容可能變動。
        </p>
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">追蹤電影
            <select required value={workId} onChange={e=>{setWorkId(e.target.value);setConfirmed(false);}}
              className="w-full rounded-md border border-input bg-background p-2">
              <option value="">選擇電影</option>
              {titles.map(t=><option key={t.tmdbId} value={"tmdb:"+t.tmdbId}>{t.title}（#{t.tmdbId}）</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">核對的平台
            <select value={providerId} onChange={e=>{setProviderId(e.target.value);setConfirmed(false);}}
              className="w-full rounded-md border border-input bg-background p-2">
              {providers.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">你實際看到的權益
            <select value={reviewResult} onChange={e=>{setReviewResult(e.target.value as CheckResult);setConfirmed(false);}}
              className="w-full rounded-md border border-input bg-background p-2">
              {Object.entries(accessText).map(([key,value])=><option key={key} value={key}>{value}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm">你親自查閱的HTTPS參考網址
            <input type="url" required maxLength={600} value={url} placeholder="https://..."
              onChange={e=>setUrl(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-2"/>
          </label>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
            我已親自核對這部電影、平台與權益，明白這是使用者查核紀錄而非官方保證。
          </label>
          <button type="submit" disabled={!selectedTitle || !confirmed}
            className="rounded-lg bg-amber px-4 py-3 font-semibold text-black disabled:opacity-40 sm:col-span-2">
            儲存人工查核
          </button>
        </form>
      </section>}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-xl font-semibold">3.台灣片源交叉驗證品質</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="有效比對" value={String(checked.coverage.comparable)}/>
          <Metric label="雙來源一致" value={String(checked.coverage.matched)}/>
          <Metric label="資料差異" value={String(checked.coverage.disagreements)}/>
          <Metric label="樣本一致率" value={checked.coverage.agreementRate===null?"未足量":(checked.coverage.agreementRate*100).toFixed(0)+"%"}/>
        </div>
        <p className="text-sm text-muted-foreground">
          已覆核{checked.coverage.distinctTitles}部不同電影、{checked.coverage.distinctProviders}個平台；
          逾時或來源更動{checked.coverage.stale}筆、未知{checked.coverage.unknown}筆。
        </p>
        <p className="text-sm">
          {checked.coverage.readyForBroadResearch
            ? "已達本研究設定的最小交叉驗證樣本門檻（不代表全台平台完整覆蓋）。"
            : "尚未達到擴大訂閱策略研究的樣本門檻。"}
        </p>
        {!checked.coverage.readyForBroadResearch && <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {checked.coverage.blockers.map(reason=><li key={reason}>{reason}</li>)}
        </ul>}
        {checked.assessments.length>0 && <div className="space-y-2">
          {checked.assessments.map(a=><div key={a.check.workId+"::"+a.check.providerId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{titles.find(t=>"tmdb:"+t.tmdbId===a.check.workId)?.title??a.check.workId}
                {"｜"+(providers.find(p=>p.id===a.check.providerId)?.name??a.check.providerId)}</p>
              <p className="text-xs text-muted-foreground">
                人工：{accessText[a.check.result]}｜TMDB：{a.tmdbAccess.join("、")||"未觀測到"}｜
                {statusText[a.status]}
              </p>
              <p className="text-xs text-muted-foreground">人工核對時間：{new Date(a.check.checkedAt).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"})}</p>
            </div>
            {!demo && <button type="button"
              onClick={()=>dropCheck(a.check.workId,a.check.providerId)}
              className="rounded border border-border px-3 py-2 text-xs">刪除</button>}
          </div>)}
        </div>}
      </section>
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-xl font-semibold">4.僅用雙來源相符作品進行7天實驗排程</h2>
        <p className="text-sm text-muted-foreground">
          此處不是完整的30天訂閱建議。只有最近72小時內、作品與平台權益相符、符合已訂閱平台的候選電影才會排入。
          免費觀看依原有資料允許，租借、購買及含廣告選項不自動當作訂閱可看。
        </p>
        <form onSubmit={generate} className="space-y-3">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">已訂閱平台（由你確認）</legend>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {providers.map(p=><label key={p.id} className="flex items-center gap-2 rounded-lg border border-border p-2 text-xs">
                <input type="checkbox" checked={subscribed.includes(p.id)}
                  onChange={e=>{setSubscribed(old=>e.target.checked?[...old,p.id]:old.filter(x=>x!==p.id));setPlan(null);}}/>
                {p.name}
              </label>)}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm">計畫開始日
              <input type="date" required value={startDate} onChange={e=>{setStartDate(e.target.value);setPlan(null);}}
                className="w-full rounded-md border border-input bg-background p-2"/>
            </label>
            <label className="space-y-1 text-sm">每週觀看時數
              <input type="number" min={1} max={40} required value={weeklyHours}
                onChange={e=>{setWeeklyHours(Number(e.target.value));setPlan(null);}}
                className="w-full rounded-md border border-input bg-background p-2"/>
            </label>
            <label className="space-y-1 text-sm">每日時數上限
              <input type="number" min={0.5} max={8} step={0.5} required value={dailyHours}
                onChange={e=>{setDailyHours(Number(e.target.value));setPlan(null);}}
                className="w-full rounded-md border border-input bg-background p-2"/>
            </label>
          </div>
          <label className="block space-y-1 text-sm">個人觀影需求
            <textarea rows={2} maxLength={400} value={preference} onChange={e=>{setPreference(e.target.value);setPlan(null);}}
              className="w-full rounded-md border border-input bg-background p-3"/>
          </label>
          <button type="submit" disabled={!loaded}
            className="rounded-lg bg-amber px-4 py-3 font-semibold text-black disabled:opacity-40">
            產生交叉驗證研究片單
          </button>
        </form>
        {error && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-red-400">{error}</p>}
        {notice && <p role="status" className="text-sm text-amber">{notice}</p>}
        {plan && <div className="space-y-3">
          <p className="text-sm font-semibold">符合雙來源條件的候選{plan.eligibleCandidateCount}部；
            排入{plan.plan.plan.items.length}部，觀看{plan.plan.plan.scheduledMinutes}分鐘。</p>
          {plan.plan.plan.items.map(item=><div key={item.movieId} className="rounded-lg border border-border p-3">
            <p className="font-medium">{item.title}</p>
            <p className="text-xs text-muted-foreground">{item.date}｜{item.providerId}｜{item.runtimeMinutes}分鐘｜來源：OBSERVED＋使用者核對</p>
          </div>)}
          {plan.eligibleCandidateCount===0 && <p className="text-sm text-muted-foreground">
            尚無兩個來源一致且足夠新鮮的訂閱或免費片源。不要把此結果當成任何平台無片可看的證據。
          </p>}
          <p className="text-xs text-amber">{plan.caution}</p>
        </div>}
      </section>
      <footer className="text-xs text-muted-foreground">
        資料來源：TMDB／JustWatch及使用者自行查看的OTT頁面。各平台資料可能延遲或變動。
        本研究不會連接OTT帳號、蒐集登入資料、代購或代取消訂閱。只要未通過樣本門檻，就不會提供平台層級停訂判斷。
      </footer>
    </main>
  );
}
function Metric({label,value}:{label:string;value:string}) {
  return <div className="rounded-lg bg-secondary/50 p-3">
    <p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p>
  </div>;
}
