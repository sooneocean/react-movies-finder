/**
 * WatchPilot Lab local subscription scheduling research.
 * All candidate titles are synthetic; prices must be explicitly marked
 * example or user-entered. No actual subscription is bought/cancelled.
 */
import { planViewing, type Candidate, type PlanOutput, type ProviderAccessPeriod } from "./engine.ts";
import { makeLabInput } from "./fixtures.ts";
import { applyTastePassport, validateTastePassport, type TastePassport } from "./taste-passport.ts";

export type PriceSource = "EXAMPLE" | "USER_ENTERED";
export type BillingCycle = "monthly" | "annual";
export interface SubscriptionAccount {
  providerId: string;
  name: string;
  priceTwd: number;
  cycle: BillingCycle;
  active: boolean;
  paidThroughOn: string | null; // inclusive, previously paid access
  canAvoidRenewal: boolean; // user's own assessment; not verified with OTT
}
export interface SubscriptionStudyInput {
  startDate: string;
  weeklyMinutes: number;
  dailyMinutes: number;
  preferenceText: string;
  profile: TastePassport;
  accounts: SubscriptionAccount[];
  priceSource: PriceSource;
  penaltyPer100Twd: number;
}
export interface BillingEstimate {
  providerId: string;
  chargedOn: string;
  priceTwd: number;
  cycle: BillingCycle;
}
export interface SubscriptionScenario {
  label: "CURRENT_CONTINUATION" | "NO_OPTIONAL_RENEWALS" | "BALANCED" | "MAX_WATCH_VALUE";
  selectedAfterPrepay: string[];
  estimatedNewChargesTwd: number;
  billingEvents: BillingEstimate[];
  watchValue: number;
  objective: number;
  plan: PlanOutput;
}
export interface SubscriptionStudy {
  mode: "FIXTURE";
  priceSource: PriceSource;
  startDate: string;
  endDate: string;
  plannedHours: number;
  simulatedChoices: number;
  baseline: SubscriptionScenario;
  noOptionalRenewals: SubscriptionScenario;
  balanced: SubscriptionScenario;
  maxWatchValue: SubscriptionScenario;
  /** Difference in simulated future charges, not money already saved. */
  baselineVsBalancedFutureCostDifferenceTwd: number;
  algorithm: "subset_enumeration_greedy_viewing_v1";
  usedTasteEntries: number;
}
function day(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid subscription date");
  const dt = new Date(value + "T00:00:00.000Z");
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== value) {
    throw new Error("Invalid calendar date");
  }
  return value;
}
function addDays(value: string, n: number): string {
  const dt = new Date(day(value) + "T00:00:00.000Z");
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
/** Preserve billing anchor day unless it falls beyond target month end. */
function addMonths(value: string, count: number): string {
  const dt = new Date(day(value) + "T00:00:00.000Z");
  const d = dt.getUTCDate();
  const month = dt.getUTCMonth() + count;
  const target = new Date(Date.UTC(dt.getUTCFullYear(), month, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}
function validAccounts(input: SubscriptionAccount[], startDate: string): SubscriptionAccount[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 6) {
    throw new Error("Only 1–6 subscription providers supported");
  }
  const ids = new Set<string>();
  return input.map(row => {
    if (!row || !/^[a-zA-Z0-9:_-]{1,64}$/.test(row.providerId) ||
        ids.has(row.providerId) || row.name.trim().length === 0 ||
        row.name.length > 80 || !Number.isSafeInteger(row.priceTwd) ||
        row.priceTwd < 0 || row.priceTwd > 50000 ||
        (row.cycle !== "monthly" && row.cycle !== "annual") ||
        typeof row.active !== "boolean" || typeof row.canAvoidRenewal !== "boolean") {
      throw new Error("Invalid subscription account settings");
    }
    ids.add(row.providerId);
    if (row.active) {
      if (!row.paidThroughOn) throw new Error("Active subscription requires paid-through date");
      day(row.paidThroughOn);
      // Allow historical date for future planning, but not wildly stale dates.
      if (row.paidThroughOn < addDays(startDate, -366)) throw new Error("Paid-through date is too old");
    } else if (row.paidThroughOn !== null) {
      throw new Error("Inactive provider must not report prepaid access");
    }
    return { ...row };
  });
}
function coverage(
  account: SubscriptionAccount, renewed: boolean, start: string, end: string,
): { periods: ProviderAccessPeriod[]; charges: BillingEstimate[] } {
  const periods: ProviderAccessPeriod[] = [];
  const charges: BillingEstimate[] = [];
  const prepaidEnd = account.active ? account.paidThroughOn : null;
  if (prepaidEnd && prepaidEnd >= start) {
    periods.push({ startOn: start, endOn: prepaidEnd < end ? prepaidEnd : end });
  }
  if (renewed) {
    let due = prepaidEnd && prepaidEnd >= start ? addDays(prepaidEnd, 1) : start;
    let safety = 0;
    while (due <= end && safety++ < 5) {
      const next = addMonths(due, account.cycle === "annual" ? 12 : 1);
      const cycleEnd = addDays(next, -1);
      periods.push({ startOn: due, endOn: cycleEnd < end ? cycleEnd : end });
      charges.push({
        providerId: account.providerId, chargedOn: due,
        priceTwd: account.priceTwd, cycle: account.cycle,
      });
      due = next;
    }
  }
  return { periods, charges };
}
function compareValue(a: SubscriptionScenario, b: SubscriptionScenario): number {
  return b.watchValue - a.watchValue ||
    a.estimatedNewChargesTwd - b.estimatedNewChargesTwd ||
    a.selectedAfterPrepay.length - b.selectedAfterPrepay.length ||
    a.selectedAfterPrepay.join(",").localeCompare(b.selectedAfterPrepay.join(","));
}
function compareBalanced(a: SubscriptionScenario, b: SubscriptionScenario): number {
  return b.objective - a.objective || compareValue(a, b);
}
function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}
function fixtureCandidates(startDate: string, input: SubscriptionStudyInput): Candidate[] {
  const base = makeLabInput({
    startDate, weeklyMinutes: Math.min(2400, input.weeklyMinutes),
    subscribedProviders: input.accounts.map(x => x.providerId),
    text: input.preferenceText,
  });
  const candidateExtra: Candidate[] = [
    { id: "study-free-01", title: "研究樣本I｜合成免費紀錄片",
      runtimeMinutes: 88, genres: ["documentary"], tasteScore: 67, qualityScore: 80,
      offers: [{ providerId: "synthetic-free", region: "TW", access: "free",
        evidence: "FIXTURE", source: "fixture://watchpilot-subscription",
        observedOn: startDate }] },
    { id: "study-cross-01", title: "研究樣本J｜合成跨平台電影",
      runtimeMinutes: 110, genres: ["drama", "mystery"], tasteScore: 80, qualityScore: 85,
      offers: ["disney", "max"].map(providerId => ({
        providerId, region: "TW", access: "subscription" as const,
        evidence: "FIXTURE" as const, source: "fixture://watchpilot-subscription",
        observedOn: startDate,
      })) },
  ];
  return applyTastePassport([...base.candidates, ...candidateExtra], input.profile)
    .filter(result => !result.excluded)
    .map(result => result.candidate);
}
export function simulateSubscriptionMonth(input: SubscriptionStudyInput): SubscriptionStudy {
  const start = day(input.startDate);
  if (!Number.isInteger(input.weeklyMinutes) || input.weeklyMinutes < 60 || input.weeklyMinutes > 2400 ||
      !Number.isInteger(input.dailyMinutes) || input.dailyMinutes < 30 || input.dailyMinutes > 480 ||
      !Number.isFinite(input.penaltyPer100Twd) || input.penaltyPer100Twd < 0 ||
      input.penaltyPer100Twd > 100 || input.priceSource !== "EXAMPLE" && input.priceSource !== "USER_ENTERED" ||
      typeof input.preferenceText !== "string" || input.preferenceText.length > 400) {
    throw new Error("Invalid subscription study input");
  }
  const passport = validateTastePassport(input.profile);
  const accounts = validAccounts(input.accounts, start);
  const end = addDays(start, 29);
  const candidates = fixtureCandidates(start, input);
  const days = Array.from({ length: 30 }, (_, i) =>
    ({ date: addDays(start, i), minutes: input.dailyMinutes }));
  const budget = Math.floor(input.weeklyMinutes * 30 / 7);
  const mandatory = accounts.filter(a => a.active && !a.canAvoidRenewal)
    .map(a => a.providerId);
  const choices: SubscriptionScenario[] = [];
  const limit = 2 ** accounts.length;
  for (let mask = 0; mask < limit; mask++) {
    const selection = accounts.filter((a, index) => (mask & (1 << index)) !== 0)
      .map(a => a.providerId);
    if (mandatory.some(id => !selection.includes(id))) continue;
    const periods: Record<string, ProviderAccessPeriod[]> = {};
    const billingEvents: BillingEstimate[] = [];
    for (const account of accounts) {
      const chosen = selection.includes(account.providerId);
      const data = coverage(account, chosen, start, end);
      periods[account.providerId] = data.periods;
      billingEvents.push(...data.charges);
    }
    const plan = planViewing({
      mode: "fixture", region: "TW", subscribedProviders: [],
      providerAccessPeriods: periods, excludedGenres: passport.avoidedGenres,
      weeklyBudgetMinutes: budget,
      observationMaxAgeDays: 30,
      slots: days, candidates,
    });
    const futureCost = billingEvents.reduce((sum, ev) => sum + ev.priceTwd, 0);
    const watchValue = rounded(plan.items.reduce((sum, item) => sum + item.score, 0));
    const objective = rounded(watchValue - input.penaltyPer100Twd * futureCost / 100);
    choices.push({
      label: "BALANCED", selectedAfterPrepay: selection,
      estimatedNewChargesTwd: futureCost, billingEvents, watchValue,
      objective, plan,
    });
  }
  if (choices.length === 0) throw new Error("No valid subscription scenarios");
  const current = accounts.filter(x => x.active).map(x => x.providerId);
  const matching = (ids: string[]) => choices.find(choice =>
    choice.selectedAfterPrepay.length === ids.length &&
    ids.every(id => choice.selectedAfterPrepay.includes(id)));
  const baseline = matching(current);
  const noOptional = matching(mandatory);
  if (!baseline || !noOptional) throw new Error("Subscription baseline unavailable");
  const balanced = [...choices].sort(compareBalanced)[0];
  const maxValue = [...choices].sort(compareValue)[0];
  const label = (data: SubscriptionScenario, type: SubscriptionScenario["label"]) =>
    ({ ...data, label: type });
  return {
    mode: "FIXTURE", priceSource: input.priceSource, startDate: start,
    endDate: end, plannedHours: rounded(budget / 60), simulatedChoices: choices.length,
    baseline: label(baseline, "CURRENT_CONTINUATION"),
    noOptionalRenewals: label(noOptional, "NO_OPTIONAL_RENEWALS"),
    balanced: label(balanced, "BALANCED"),
    maxWatchValue: label(maxValue, "MAX_WATCH_VALUE"),
    baselineVsBalancedFutureCostDifferenceTwd:
      baseline.estimatedNewChargesTwd - balanced.estimatedNewChargesTwd,
    algorithm: "subset_enumeration_greedy_viewing_v1",
    usedTasteEntries: passport.entries.length,
  };
}
