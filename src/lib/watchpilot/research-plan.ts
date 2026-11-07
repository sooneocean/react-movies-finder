import { planViewing, type PlanOutput } from "./engine.ts";
import { parsePreferenceHint } from "./fixtures.ts";
import { toResearchCandidate, type TWTitle } from "./tmdb-tw.ts";
import { applyTastePassport, validateTastePassport, type TastePassport } from "./taste-passport.ts";

export interface TWResearchSettings {
  startDate: string;
  weeklyMinutes: number;
  dailyMinutes: number;
  subscribedProviders: string[];
  preferenceText: string;
  tastePassport?: TastePassport;
}
export interface TWResearchResult {
  plan: PlanOutput;
  unschedulable: { tmdbId: number; reason: "UNKNOWN_RUNTIME" }[];
  preference: ReturnType<typeof parsePreferenceHint>;
}
function dateAfter(start: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error("請填寫有效開始日期");
  const dt = new Date(start + "T00:00:00Z");
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== start)
    throw new Error("請填寫有效開始日期");
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
export function generateTWResearchPlan(titles: TWTitle[], settings: TWResearchSettings): TWResearchResult {
  const { weeklyMinutes, dailyMinutes } = settings;
  if (!Number.isInteger(weeklyMinutes) || weeklyMinutes < 60 || weeklyMinutes > 40 * 60) {
    throw new Error("每週觀看時間須介於60至2400分鐘");
  }
  if (!Number.isInteger(dailyMinutes) || dailyMinutes < 30 || dailyMinutes > 8 * 60) {
    throw new Error("每日可用時間須介於30至480分鐘");
  }
  const preference = parsePreferenceHint(settings.preferenceText);
  const unschedulable: TWResearchResult["unschedulable"] = [];
  const candidates = titles.flatMap(item => {
    const projected = toResearchCandidate(item, preference.preferredGenres);
    if (!projected) {
      unschedulable.push({ tmdbId: item.tmdbId, reason: "UNKNOWN_RUNTIME" });
      return [];
    }
    return [projected];
  });
  const personal = settings.tastePassport ? validateTastePassport(settings.tastePassport) : null;
  const adapted = personal ? applyTastePassport(candidates, personal) : null;
  const plannedCandidates = adapted ? adapted.filter(x => !x.excluded).map(x => x.candidate) : candidates;
  const excludedGenres = personal
    ? [...new Set([...preference.excludedGenres, ...personal.avoidedGenres])]
    : preference.excludedGenres;
  const slots = Array.from({ length: 7 }, (_, idx) => ({
    date: dateAfter(settings.startDate, idx),
    minutes: dailyMinutes,
  }));
  const plan = planViewing({
    mode: "research",
    region: "TW",
    subscribedProviders: settings.subscribedProviders,
    excludedGenres,
    slots, candidates: plannedCandidates,
    weeklyBudgetMinutes: weeklyMinutes,
    observationMaxAgeDays: 7,
  });
  return { plan, unschedulable, preference };
}
