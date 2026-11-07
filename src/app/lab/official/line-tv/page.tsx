"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  LINE_TV_PROVIDER_ID, LINE_TV_TW_SOURCE_URL, isNoticeUpcoming,
  normalizeOfficialTitle, parseLineTvTaiwanNotice,
  suggestExactTrackedMatch, validateLineTvTwUrl,
  type LineTvNoticeRow, type LineTvParseResult,
} from "@/lib/watchpilot/line-tv-official";
import {
  emptyRadarWorkspace, loadRadarWorkspace, saveRadarWorkspace,
  upsertReviewedNotice, type RadarWorkspace,
} from "@/lib/watchpilot/radar-workspace";

function taiwanToday(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function truncateTitle(value: string): string {
  return value.length > 56 ? value.slice(0, 56) + "…" : value;
}

export default function LineTvOfficialResearchPage() {
  const [workspace, setWorkspace] = useState<RadarWorkspace>(emptyRadarWorkspace);
  const [ready, setReady] = useState(false);
  const [sourceUrl, setSourceUrl] = useState(LINE_TV_TW_SOURCE_URL);
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState<LineTvParseResult | null>(null);
  const [selectedRow, setSelectedRow] = useState("");
  const [selectedMovie, setSelectedMovie] = useState("");
  const [approved, setApproved] = useState(false);
  const [aliasConfirmed, setAliasConfirmed] = useState(false);
  const [includePast, setIncludePast] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const today = taiwanToday();

  useEffect(() => {
    setWorkspace(loadRadarWorkspace(window.localStorage));
    setReady(true);
  }, []);

  const rows = parsed?.rows.filter(row => includePast || isNoticeUpcoming(row.expiresOn, today)) ?? [];
  const selected = rows.find(row => String(row.rowNumber) === selectedRow);
  const identity = workspace.tracked.find(item => "tmdb:" + item.tmdbId === selectedMovie);
  const matching = selected ? suggestExactTrackedMatch(selected, workspace.tracked) : null;
  const isExact = Boolean(selected && identity &&
    [identity.title, identity.originalTitle].some(label => label &&
      normalizeOfficialTitle(label) === normalizeOfficialTitle(selected.title)));
  const sameTitleConflicts = selected && parsed ? new Set(parsed.rows.filter(row =>
    normalizeOfficialTitle(row.title) === normalizeOfficialTitle(selected.title))
    .map(row => row.expiresOn)).size > 1 : false;
  const hasLineOffer = identity?.offers.some(offer =>
    offer.providerId === LINE_TV_PROVIDER_ID) ?? false;

  function resetSelection() {
    setSelectedMovie(""); setApproved(false); setAliasConfirmed(false); setSuccess(null);
  }
  function chooseRow(value: string) {
    setSelectedRow(value); resetSelection();
    const row = rows.find(x => String(x.rowNumber) === value);
    if (!row) return;
    const guess = suggestExactTrackedMatch(row, workspace.tracked);
    if (guess.status === "EXACT") setSelectedMovie("tmdb:" + guess.tmdbId);
  }
  function parse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null); setSuccess(null);
    try {
      const result = parseLineTvTaiwanNotice(rawText, sourceUrl);
      setParsed(result);
      setSelectedRow(""); resetSelection();
    } catch (cause) {
      setParsed(null);
      setError(cause instanceof Error ? cause.message : "公告解析失敗");
    }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setSuccess(null);
    try {
      if (!ready || !parsed || !selected || !identity) throw new Error("請先選擇公告及追蹤電影");
      if (!approved) throw new Error("請核對官方來源、電影、平台與日期後勾選確認");
      if (!isExact && !aliasConfirmed) {
        throw new Error("官方片名與追蹤作品不完全相同，需額外人工確認身份");
      }
      if (sameTitleConflicts) {
        throw new Error("同一片名存在不同下架日期，請先回官方網站確認衝突");
      }
      if (validateLineTvTwUrl(sourceUrl) !== parsed.sourceUrl) {
        throw new Error("公告URL已變更，請重新解析後再匯入");
      }
      const notice = {
        workId: "tmdb:" + identity.tmdbId,
        providerId: LINE_TV_PROVIDER_ID,
        expiresOn: selected.expiresOn,
        sourceUrl: parsed.sourceUrl,
        checkedAt: new Date().toISOString(),
        reviewedByUser: true as const,
      };
      const current = loadRadarWorkspace(window.localStorage);
      if (!current.tracked.some(item => item.tmdbId === identity.tmdbId)) {
        throw new Error("追蹤片單已變更，請重新載入頁面");
      }
      const next = upsertReviewedNotice(current, notice);
      saveRadarWorkspace(window.localStorage, next);
      setWorkspace(next);
      setSuccess(
        "已儲存使用者人工核對的LINE TV日期：" + identity.title +
        "｜" + notice.expiresOn + "。請至片庫雷達重新排程。" +
        (hasLineOffer ? "" : "目前沒有LINE TV觀測片源，本期限僅供參考。"),
      );
      setApproved(false); setAliasConfirmed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "匯入失敗");
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-7 px-4 py-10 sm:px-8">
      <div className="space-y-3">
        <Link href="/lab/radar" className="text-sm text-amber hover:underline">返回片庫IN／OUT雷達</Link>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber">
          WatchPilot Lab / Official Notice Research
        </p>
        <h1 className="text-3xl font-bold">LINE TV台灣官方下架公告匯入</h1>
        <p className="text-muted-foreground">
          將LINE TV官方客服頁的下架表格複製貼上，系統協助解析日期並與個人追蹤片單配對。
          你必須核對每部作品後才能儲存；不會自動爬取網站或發布公告資料。
        </p>
        <div role="status" className="rounded-xl border border-amber/40 bg-amber/10 p-4 text-sm text-amber">
          <strong>來源確認≠身份自動驗證。</strong>官方清單可能更新、過期或存在同名作品。
          只有使用者親自查閱、配對並勾選後，才會標記「使用者人工查核」。
          LINE TV官方說明的最後觀看時間為標示下架日23:59（台灣時間），本工具不臆測其他OTT期限。
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 text-xl font-semibold">1.貼入官方公告文字</h2>
        <p className="mb-3 text-sm">
          <a href={LINE_TV_TW_SOURCE_URL} target="_blank" rel="noopener noreferrer"
            className="text-amber underline">開啟LINE TV台灣即將下架清單</a>
          {" "}（僅支援這一篇台灣地區公告）。
        </p>
        <form className="space-y-3" onSubmit={parse}>
          <label className="block space-y-1 text-sm">
            <span>官方來源網址</span>
            <input type="url" required value={sourceUrl}
              onChange={event => { setSourceUrl(event.target.value); setParsed(null); }}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"/>
          </label>
          <label className="block space-y-1 text-sm">
            <span>貼上表格文字（支援直線分隔、Tab與部分純文字格式）</span>
            <textarea required rows={8} maxLength={40_000} value={rawText}
              onChange={event => { setRawText(event.target.value); setParsed(null); }}
              placeholder={"類別 | 影片名稱 | 預計下架日\n電影 | 虛構電影A | 2026-11-20"}
              className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm"/>
          </label>
          <p className="text-xs text-muted-foreground">
            文字僅在你的瀏覽器解析，不會傳至WatchPilot伺服器或上傳GitHub。
            僅儲存逐筆核准的作品ID、日期、公告網址及核對時間。
          </p>
          <button type="submit" className="rounded-lg bg-amber px-4 py-2 font-semibold text-black">
            解析官方清單
          </button>
        </form>
        {parsed && <div className="mt-4 space-y-2 rounded-lg bg-secondary/50 p-3 text-sm">
          <p>辨識到{parsed.rows.length}筆資料（其中{parsed.rows.filter(row => isNoticeUpcoming(row.expiresOn, today)).length}筆日期尚未過期）。</p>
          <p className="text-xs text-muted-foreground">
            重複列{parsed.duplicates}筆，無效日期／片名{parsed.rejected.length}筆；
            此處僅表示格式解析成功，並非已核實官方內容。
          </p>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={includePast}
              onChange={event => { setIncludePast(event.target.checked); setSelectedRow(""); resetSelection(); }}/>
            同時顯示過期日期（研究歷史用途）
          </label>
        </div>}
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="text-xl font-semibold">2.逐筆配對並人工核對</h2>
        {!ready && <p className="text-sm text-muted-foreground">讀取個人追蹤片單中…</p>}
        {workspace.tracked.length === 0 && ready &&
          <p className="text-sm text-muted-foreground">
            尚未追蹤電影。請先至<Link href="/lab/tw" className="text-amber underline">台灣電影搜尋頁</Link>加入雷達，再匯入公告。
          </p>}
        {parsed && rows.length === 0 &&
          <p className="text-sm text-muted-foreground">目前沒有可選取的未過期項目；可勾選顯示歷史日期。</p>}
        <form onSubmit={save} className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span>LINE TV公告中的作品</span>
            <select required value={selectedRow} onChange={event => chooseRow(event.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2" disabled={!parsed || rows.length === 0}>
              <option value="">先解析公告，再選擇作品</option>
              {rows.map(row => <option key={row.rowNumber} value={String(row.rowNumber)}>
                {truncateTitle(row.title)}｜{row.expiresOn}｜{row.category || "類別未提供"}
              </option>)}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span>對應的個人追蹤電影（TMDB ID）</span>
            <select required value={selectedMovie} disabled={!selected || workspace.tracked.length === 0}
              onChange={event => { setSelectedMovie(event.target.value); setApproved(false); setAliasConfirmed(false); }}
              className="w-full rounded-lg border border-input bg-background px-3 py-2">
              <option value="">請指定實際作品</option>
              {workspace.tracked.map(item => <option key={item.tmdbId} value={"tmdb:" + item.tmdbId}>
                {item.title}（#{item.tmdbId}）
              </option>)}
            </select>
          </label>
          {selected && <div className="space-y-2 rounded-xl border border-border bg-secondary/50 p-4 text-sm">
            <p><strong>公告片名：</strong>{selected.title}</p>
            <p><strong>官方公告日期：</strong>{selected.expiresOn}（23:59，台灣時間）</p>
            <p><strong>系統配對：</strong>
              {matching?.status === "EXACT" ? "有唯一標題完全相符候選" :
                matching?.status === "AMBIGUOUS" ? "同名作品不只一部，必須人工選擇" :
                  "無完全相符的追蹤片名，需要人工配對"}
            </p>
            {identity && <p><strong>目前選擇：</strong>{identity.title}（TMDB #{identity.tmdbId}）</p>}
            {identity && !hasLineOffer && <p className="text-amber text-xs">
              TMDB目前未觀測到此電影在LINE TV的片源；公告期限可以保留，但不會自行創造可觀看權益。
            </p>}
            {sameTitleConflicts && <p className="text-amber">
              同一公告片名有多個不同下架日期，本工具會阻止匯入，請先人工確認哪一筆適用。
            </p>}
            {!isNoticeUpcoming(selected.expiresOn, today) && <p className="text-amber text-xs">
              日期已過，僅作歷史研究記錄；不得顯示成目前即將下架通知。
            </p>}
          </div>}
          {identity && !isExact && <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={aliasConfirmed}
              onChange={event => setAliasConfirmed(event.target.checked)}/>
            <span>公告與TMDB名稱不完全一致。我已自行核對電影身份，確定為同一部作品。</span>
          </label>}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={approved}
              onChange={event => setApproved(event.target.checked)}/>
            <span>我已開啟LINE TV官方台灣頁面、確認這筆片名／作品身份／日期，並同意將結果寫入自己的本機研究資料。</span>
          </label>
          <button type="submit" disabled={!selected || !identity || !approved || sameTitleConflicts || (!isExact && !aliasConfirmed)}
            className="w-full rounded-lg border border-amber/50 px-4 py-3 font-semibold text-amber disabled:opacity-40">
            儲存這一筆人工查核期限
          </button>
        </form>
        {error && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-red-400">{error}</p>}
        {success && <p role="status" className="rounded-lg border border-emerald-500/40 p-3 text-sm text-emerald-300">
          {success} <Link href="/lab/radar" className="underline">返回雷達</Link>
        </p>}
      </section>
      <footer className="rounded-xl border border-border p-4 text-xs text-muted-foreground">
        LINE TV公告內容著作權歸屬原發布者；本研究只解析你提供的文字與保留你確認的必要欄位。
        不提供整站同步、公開鏡像或資料再散布。該功能亦不會改動TMDB／JustWatch來源的可觀看性可信等級。
      </footer>
    </main>
  );
}
