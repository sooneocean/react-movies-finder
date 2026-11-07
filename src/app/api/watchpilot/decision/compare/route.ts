import { NextRequest, NextResponse } from "next/server";
import { createExperiment, type WatchChoice } from "@/lib/watchpilot/decision-ab";
import { evaluateWithJev, JevEvaluationError } from "@/lib/watchpilot/jev-service";
import { planViewing } from "@/lib/watchpilot/engine";
import { LAB_PROVIDERS, makeLabInput } from "@/lib/watchpilot/fixtures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let lastLiveCallAt = 0;
const COOLDOWN_MS = 30_000;
const providerIds = new Set<string>(LAB_PROVIDERS.map(p => p.id));
function error(code: string, message: string, status: number) {
  return NextResponse.json({ code, error: message }, {
    status, headers: { "Cache-Control": "private, no-store" },
  });
}
function isRecord(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === "object" && !Array.isArray(input);
}
function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get("origin") ?? "";
  try {
    const actual = new URL(request.url);
    const submitted = new URL(origin);
    return submitted.origin === actual.origin &&
      (actual.protocol === "https:" || actual.hostname === "localhost" ||
        actual.hostname === "127.0.0.1" || actual.hostname === "::1");
  } catch {
    return false;
  }
}
function isLoopbackRequest(request: NextRequest): boolean {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  const origin = request.headers.get("origin") ?? "";
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host)) return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" && parsed.host.toLowerCase() === host;
  } catch {
    return false;
  }
}
/**
 * A personal research endpoint, NOT a public paid-API gateway.
 * The server constructs candidates from an audited, synthetic Fixture only.
 * Never accepts the client-supplied film list or external media API data.
 */
export async function POST(request: NextRequest) {
  // Free fixture calculations can run on public same-origin Cloudflare Workers.
  // Paid Jev still requires explicit localhost + development gate below.
  if (!isSameOriginRequest(request)) {
    return error("SAME_ORIGIN_ONLY", "研究請求必須從同一來源的WatchPilot頁面送出。", 403);
  }
  const raw: unknown = await request.json().catch(() => null);
  if (!isRecord(raw) || typeof raw.prompt !== "string" || raw.prompt.length > 400 ||
      typeof raw.startDate !== "string" ||
      typeof raw.weeklyMinutes !== "number" || !Number.isInteger(raw.weeklyMinutes) ||
      raw.weeklyMinutes < 60 || raw.weeklyMinutes > 2400 ||
      !Array.isArray(raw.subscribedProviders) || raw.subscribedProviders.length > 4 ||
      !raw.subscribedProviders.every(x => typeof x === "string" && providerIds.has(x)) ||
      typeof raw.useJev !== "boolean") {
    return error("INVALID_INPUT", "請提供有效的研究情境（繁體中文需求、日期、時數與訂閱）。", 400);
  }
  try {
    const input = makeLabInput({
      startDate: raw.startDate,
      weeklyMinutes: raw.weeklyMinutes,
      subscribedProviders: [...new Set<string>(raw.subscribedProviders)],
      text: raw.prompt,
    });
    const scheduled = planViewing(input);
    const source = new Map(input.candidates.map(candidate => [candidate.id, candidate]));
    const candidates: WatchChoice[] = scheduled.items.slice(0, 6).map(item => {
      const candidate = source.get(item.movieId);
      if (!candidate || item.evidence !== "FIXTURE") {
        throw new Error("Non-fixture or missing candidate in offline A/B");
      }
      return {
        id: item.movieId,
        title: item.title,
        genres: [...candidate.genres],
        runtimeMinutes: item.runtimeMinutes,
        planScore: item.score,
        tasteScore: candidate.tasteScore,
        qualityScore: candidate.qualityScore,
        providerId: item.providerId,
        evidence: item.evidence,
      };
    });
    if (candidates.length < 2) {
      return error("INSUFFICIENT_CHOICES",
        "目前只有一部或沒有可安排作品；請增加每週時數或訂閱平台，取得至少兩部候選。", 422);
    }
    const exp = createExperiment(raw.prompt, candidates, "fixture");
    let jev = null;
    if (raw.useJev) {
      if (!isLoopbackRequest(request)) {
        return error("PAID_LOCAL_ONLY",
          "付費Jev只能在本機localhost實驗環境呼叫，不對外提供付費代理。", 403);
      }
      if (process.env.NODE_ENV !== "development" ||
          process.env.WATCHPILOT_ENABLE_JEV !== "1") {
        return error("JEV_DISABLED",
          "付費Jev預設停用。僅在本機開發環境設定WATCHPILOT_ENABLE_JEV=1後可呼叫。", 403);
      }
      const now = Date.now();
      if (now - lastLiveCallAt < COOLDOWN_MS) {
        return error("JEV_COOLDOWN", "Jev研究呼叫間隔至少30秒，避免重複付費。", 429);
      }
      // A failed external call also consumes cooldown; never silently retry.
      lastLiveCallAt = now;
      jev = await evaluateWithJev(exp, {
        enabled: true, apiKey: process.env.TYPESAFE_API_KEY,
      });
    }
    return NextResponse.json({
      dataMode: "FIXTURE",
      algorithm: scheduled.algorithm,
      scheduledMinutes: scheduled.scheduledMinutes,
      candidates: exp.candidates,
      baselinePick: exp.baselinePick,
      qualityPick: exp.qualityPick,
      jev,
      jevStatus: raw.useJev ? "LIVE" : "NOT_REQUESTED",
      source: "synthetic WatchPilot fixture (not actual OTT catalog)",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    if (cause instanceof JevEvaluationError) {
      const messages: Record<JevEvaluationError["code"], string> = {
        DISABLED: "Jev尚未啟用。",
        NO_KEY: "Jev API Key尚未在本機設定。",
        RATE_LIMITED: "Jev服務限制頻率。本次不重試，避免增加費用。",
        UPSTREAM: "Jev請求失敗，請檢查服務狀態。本次沒有替代成假AI結果。",
        BAD_RESPONSE: "Jev回傳無法驗證的結果，本次不採納。",
      };
      return error(cause.code, messages[cause.code], cause.status);
    }
    return error("INVALID_RESEARCH_STATE", "研究情境無法建立，請檢查輸入並重試。", 400);
  }
}
