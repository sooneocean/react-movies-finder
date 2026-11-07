import { NextRequest, NextResponse } from "next/server";
import { fetchTWMovieById, TMDBResearchError } from "@/lib/watchpilot/tmdb-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Private, manual on-demand refresh; do not publicly deploy without authentication and rate limits. */
export async function GET(request: NextRequest) {
  // Never allow an unauthenticated full-catalog proxy on public Workers.
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({
      code:"PUBLIC_TMDB_DISABLED",
      error:"公開研究站不提供匿名TMDB片源刷新；請在本機使用自己的TMDB金鑰。",
    }, {status:403,headers:{"Cache-Control":"private, no-store"}});
  }
  const raw = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[1-9]\d{0,9}$/.test(raw)) {
    return NextResponse.json({ code: "INVALID_QUERY", error: "請提供有效TMDB電影ID。" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
  try {
    const title = await fetchTWMovieById(Number(raw), process.env.MOVIE_DB_API_KEY);
    return NextResponse.json({ title, source: "TMDB / JustWatch", region: "TW" },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    if (cause instanceof TMDBResearchError) {
      const message = cause.code === "NO_KEY"
        ? "尚未設定個人的TMDB API Key；可先使用離線演練。"
        : cause.code === "RATE_LIMITED"
        ? "TMDB限制請求頻率，請稍後重試。"
        : cause.code === "INVALID_QUERY"
        ? "電影ID無效。"
        : "片源資料暫時無法取得，本次不新增成功快照，也不判定為下架。";
      return NextResponse.json({ code: cause.code, error: message },
        { status: cause.status, headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({ code: "INTERNAL_ERROR", error: "本機查詢失敗，請檢查伺服器日誌。" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
