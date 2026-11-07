import { NextRequest, NextResponse } from "next/server";
import {
  searchTWMovies, TMDBResearchError,
} from "@/lib/watchpilot/tmdb-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Personal-research endpoint. Not a public bulk-access or catalog proxy. */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  try {
    const result = await searchTWMovies(query, process.env.MOVIE_DB_API_KEY);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (cause) {
    if (cause instanceof TMDBResearchError) {
      const message = cause.code === "NO_KEY"
        ? "請先在本機.env.local設定MOVIE_DB_API_KEY，或繼續使用/lab的離線測試。"
        : cause.code === "INVALID_QUERY"
        ? "請輸入2至80字元的電影名稱。"
        : cause.code === "RATE_LIMITED"
        ? "TMDB要求降低呼叫頻率，請稍後再試。"
        : "TMDB資料暫時無法取得，不能據此判定作品下架。";
      return NextResponse.json({ code: cause.code, error: message }, {
        status: cause.status,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    return NextResponse.json({
      code: "INTERNAL_ERROR",
      error: "研究資料查詢失敗，請查看本機伺服器紀錄。",
    }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
