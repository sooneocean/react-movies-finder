/**
 * Human-attested Taiwan OTT cross-checks for a deliberately small local sample.
 * This is NOT provider certification. Neither an absent TMDB offer nor one human
 * check establishes a platform-wide absence or predicts any license expiry.
 */
import type { TWTitle } from "./tmdb-tw.ts";
import { generateTWResearchPlan, type TWResearchSettings, type TWResearchResult } from "./research-plan.ts";

export const TW_CHECK_STORAGE_KEY = "watchpilot-tw-human-checks-v1";
export type CheckResult = "subscription" | "free" | "ads" | "rent" | "buy" | "not_found" | "unknown";
export interface HumanCheck {
  workId: string;
  providerId: string;
  checkedAt: string;
  tmdbCheckedAt: string; // bind the review to the exact observation being compared
  sourceUrl: string; // user-supplied site inspected, not independently certified
  result: CheckResult;
  reviewerConfirmed: true;
}
export interface CheckStore { version: 1; checks: HumanCheck[] }
export type CheckStatus = "MATCH" | "DISAGREEMENT" | "STALE" | "UNKNOWN";
export interface CheckAssessment {
  check: HumanCheck;
  status: CheckStatus;
  tmdbAccess: string[];
}
export interface CoverageSummary {
  reviewed: number;
  comparable: number;
  matched: number;
  disagreements: number;
  stale: number;
  unknown: number;
  distinctTitles: number;
  distinctProviders: number;
  agreementRate: number | null;
  readyForBroadResearch: boolean;
  blockers: string[];
  byProvider: { providerId: string; comparable: number; matched: number; disagreements: number }[];
}
export interface VerifiedResearch {
  sourceLabel: "USER_CROSS_CHECKED_TMDB_TW";
  coverage: CoverageSummary;
  assessments: CheckAssessment[];
  plan: TWResearchResult;
  eligibleCandidateCount: number;
  caution: string;
}
export interface CheckStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const allowed = new Set<CheckResult>(["subscription","free","ads","rent","buy","not_found","unknown"]);
function instant(value: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value)) throw Error("Invalid UTC evidence time");
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) throw Error("Invalid evidence time");
  return ms;
}
function date(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error("Invalid date");
  const ms = Date.parse(value + "T00:00:00.000Z");
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0,10) !== value) throw Error("Invalid calendar date");
  return value;
}
function taiwanDay(value: string): string {
  return new Date(instant(value) + 8*3600000).toISOString().slice(0,10);
}
function addDays(value: string, days: number): string {
  const d = new Date(date(value) + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0,10);
}
function checkedUrl(value: string): string {
  if (typeof value !== "string" || value.length > 600) throw Error("Invalid reference URL");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname.includes(".") ||
      url.username || url.password || url.port || url.hostname === "localhost" ||
      /(?:^|\.)localhost$/.test(url.hostname) || /^\d+(?:\.\d+){3}$/.test(url.hostname)) {
      throw Error("Unsafe reference URL");
    }
    // Drop trackers and fragments. Do not make network calls from this URL.
    url.search = ""; url.hash = "";
    return url.toString();
  } catch { throw Error("Reference must be an HTTPS web page"); }
}
export function validateHumanCheck(input: HumanCheck): HumanCheck {
  if (!input || typeof input !== "object" ||
    typeof input.workId !== "string" || !/^tmdb:[1-9]\d{0,9}$/.test(input.workId) ||
    typeof input.providerId !== "string" || !/^[a-zA-Z0-9:_-]{1,64}$/.test(input.providerId) ||
    !allowed.has(input.result) || input.reviewerConfirmed !== true) throw Error("Incomplete user cross-check");
  const checkedAt = instant(input.checkedAt);
  const tmdbCheckedAt = instant(input.tmdbCheckedAt);
  if (checkedAt < tmdbCheckedAt - 5 * 60_000) throw Error("Review precedes catalog observation");
  return { ...input, sourceUrl: checkedUrl(input.sourceUrl) };
}
export function emptyCheckStore(): CheckStore { return { version: 1, checks: [] }; }
/** Keep the newest review for each (title, provider), no raw third-party title data. */
export function saveHumanCheck(store: CheckStore, entry: HumanCheck): CheckStore {
  if (store.version !== 1 || !Array.isArray(store.checks)) throw Error("Invalid check storage");
  const check = validateHumanCheck(entry);
  const existing = store.checks.filter(x => !(x.workId === check.workId && x.providerId === check.providerId));
  return { version: 1, checks: [...existing, check].slice(-200) };
}
export function validateCheckStore(value: unknown): CheckStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid check storage");
  const v = value as Record<string,unknown>;
  if (v.version !== 1 || !Array.isArray(v.checks) || v.checks.length > 200) throw Error("Unsupported check data");
  const checks = (v.checks as HumanCheck[]).map(validateHumanCheck);
  if (new Set(checks.map(x => x.workId+"::"+x.providerId)).size !== checks.length) throw Error("Duplicate reviews");
  return { version: 1, checks };
}
export function loadCheckStore(local: CheckStorage): CheckStore {
  try {
    const raw = local.getItem(TW_CHECK_STORAGE_KEY);
    if (!raw || raw.length > 150_000) return emptyCheckStore();
    return validateCheckStore(JSON.parse(raw));
  } catch { return emptyCheckStore(); }
}
export function persistCheckStore(local: CheckStorage, store: CheckStore): void {
  const serialized = JSON.stringify(validateCheckStore(store));
  if (serialized.length > 150_000) throw Error("Local check storage full");
  local.setItem(TW_CHECK_STORAGE_KEY, serialized);
}
function assessment(check: HumanCheck, movie: TWTitle | undefined, now: Date): CheckAssessment {
  const safe = validateHumanCheck(check);
  const claims = movie?.offers.filter(o => o.providerId === safe.providerId)
    .map(o => o.access) ?? [];
  const access = [...new Set(claims)].sort();
  const age = now.getTime() - instant(safe.checkedAt);
  const catalogAge = now.getTime() - instant(safe.tmdbCheckedAt);
  const maxAge = 72*3600000;
  const sameMovie = movie && safe.workId === "tmdb:"+movie.tmdbId;
  if (!sameMovie || movie.checkedAt !== safe.tmdbCheckedAt ||
      age < 0 || age > maxAge || catalogAge < 0 || catalogAge > maxAge) {
    return { check:safe, status:"STALE", tmdbAccess:access };
  }
  if (safe.result === "unknown") return { check:safe, status:"UNKNOWN", tmdbAccess:access };
  const matching = safe.result === "not_found" ? access.length === 0 : access.includes(safe.result);
  return { check:safe, status:matching ? "MATCH" : "DISAGREEMENT", tmdbAccess:access };
}
export function reviewCoverage(titles: TWTitle[], store: CheckStore, now: Date = new Date()): {
  assessments: CheckAssessment[]; coverage: CoverageSummary;
} {
  const safe = validateCheckStore(store);
  if (Number.isNaN(now.getTime())) throw Error("Invalid reference clock");
  const map = new Map(titles.map(x => [x.tmdbId,x]));
  const assessments = safe.checks.map(c =>
    assessment(c,map.get(Number(c.workId.slice(5))),now));
  const comparable = assessments.filter(a => a.status === "MATCH" || a.status === "DISAGREEMENT");
  const matched = comparable.filter(a => a.status === "MATCH").length;
  const providerMap = new Map<string,{providerId:string;comparable:number;matched:number;disagreements:number}>();
  for (const a of comparable) {
    const id=a.check.providerId;
    const row=providerMap.get(id) ?? { providerId:id,comparable:0,matched:0,disagreements:0 };
    row.comparable++;
    row[a.status === "MATCH" ? "matched" : "disagreements"]++;
    providerMap.set(id,row);
  }
  const byProvider=[...providerMap.values()].sort((a,b)=>a.providerId.localeCompare(b.providerId));
  const distinctTitles = new Set(comparable.map(x=>x.check.workId)).size;
  const distinctProviders = byProvider.length;
  const agreementRate = comparable.length ? Math.round(100*matched/comparable.length)/100 : null;
  // Research readiness policy, not statistical proof of every Taiwanese OTT catalog.
  const blockers:string[]=[];
  if(distinctTitles < 20) blockers.push("須交叉核對至少20部不同電影（目前"+distinctTitles+"部）");
  if(distinctProviders < 2) blockers.push("至少核對2個OTT平台");
  if(byProvider.filter(x=>x.comparable>=5).length < 2) blockers.push("至少2個平台各需5筆有效比對");
  if(comparable.length && agreementRate!==null && agreementRate<0.8) blockers.push("一致率低於本研究設定的80%門檻");
  if(assessments.some(x=>x.status==="STALE")) blockers.push("存在逾72小時、未追蹤或片庫已更新的舊核對資料");
  return { assessments, coverage:{
    reviewed:safe.checks.length, comparable:comparable.length, matched,
    disagreements:comparable.length-matched,
    stale:assessments.filter(x=>x.status==="STALE").length,
    unknown:assessments.filter(x=>x.status==="UNKNOWN").length,
    distinctTitles,distinctProviders,agreementRate,
    readyForBroadResearch:blockers.length===0,blockers,byProvider,
  }};
}
/**
 * A positive human review cannot fabricate availability absent from TMDB.
 * The output remains OBSERVED, not VERIFIED, even when two sources agree.
 */
export function generateCrossCheckedTWPlan(
  titles: TWTitle[], store: CheckStore, settings: TWResearchSettings,
  now: Date = new Date(),
): VerifiedResearch {
  if(settings.startDate < taiwanDay(now.toISOString()) ||
     settings.startDate > addDays(taiwanDay(now.toISOString()), 7)) {
    throw Error("只允許從今天至7天後開始研究排程");
  }
  const {assessments,coverage}=reviewCoverage(titles,store,now);
  const validated = new Map(assessments
    .filter(x=>x.status==="MATCH" &&
      (x.check.result==="subscription" || x.check.result==="free"))
    .map(x=>[x.check.workId+"::"+x.check.providerId,x.check]));
  const filtered:TWTitle[]=titles.map(title=>({
    ...title,
    offers:title.offers.filter(o => {
      const check = validated.get("tmdb:"+title.tmdbId+"::"+o.providerId);
      return check && check.result===o.access;
    }),
  }));
  const eligibleCandidateCount=filtered.filter(x=>x.offers.length>0 && x.runtimeMinutes!==null).length;
  const plan=generateTWResearchPlan(filtered,settings);
  return {
    sourceLabel:"USER_CROSS_CHECKED_TMDB_TW",coverage,assessments,plan,
    eligibleCandidateCount,
    caution:"僅以72小時內的人工作品級核對進行研究，片源未來仍可能變動；不可依此直接取消或購買OTT訂閱。",
  };
}
