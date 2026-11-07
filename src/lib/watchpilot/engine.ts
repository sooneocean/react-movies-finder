/**
 * WatchPilot Lab: offline, deterministic research baseline (MIT).
 * Does not fetch streaming data or infer licensing expiry.
 */
export type Evidence = "FIXTURE" | "VERIFIED" | "OBSERVED" | "UNVERIFIED";
export type Access = "subscription" | "free" | "ads" | "rent" | "buy";
export type Mode = "fixture" | "research";
export interface Offer {
  providerId: string;
  region: string;
  access: Access;
  evidence: Evidence;
  source: string;
  observedOn: string;
  expiresOn?: string | null;
  /** Expiry evidence is separate from availability evidence. */
  expiryEvidence?: "USER_REVIEWED_OFFICIAL" | "UNVERIFIED";
}
export interface Candidate {
  id: string;
  title: string;
  runtimeMinutes: number;
  genres: string[];
  tasteScore: number;
  qualityScore: number;
  watched?: boolean;
  offers: Offer[];
}
export interface Slot {
  date: string;
  minutes: number;
}
export interface PlanInput {
  mode: Mode;
  region: string;
  subscribedProviders: string[];
  excludedGenres: string[];
  slots: Slot[];
  candidates: Candidate[];
  observationMaxAgeDays?: number;
  /** Global time cap for the whole planning period; separate from daily slots. */
  weeklyBudgetMinutes?: number;
}
export type RejectionReason =
  | "already_watched"
  | "excluded_genre"
  | "invalid_runtime_or_score"
  | "no_eligible_offer"
  | "no_slot_fits";
export interface ScheduledItem {
  movieId: string;
  title: string;
  date: string;
  runtimeMinutes: number;
  score: number;
  providerId: string;
  evidence: Evidence;
  source: string;
  confirmedExpiryOn: string | null;
  expiryEvidence?: "USER_REVIEWED_OFFICIAL" | "UNVERIFIED";
}
export interface PlanOutput {
  items: ScheduledItem[];
  rejections: { movieId: string; reason: RejectionReason }[];
  requestedMinutes: number;
  scheduledMinutes: number;
  mode: Mode;
  algorithm: "deterministic_greedy_v0";
}
function validDay(value: string): string {
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) ||
      Number.isNaN(Date.parse(day + "T00:00:00Z")) ||
      new Date(day + "T00:00:00Z").toISOString().slice(0, 10) !== day) {
    throw new Error("Invalid ISO date: " + value);
  }
  return day;
}
function daysBetween(start: string, end: string): number {
  return (Date.parse(validDay(end) + "T00:00:00Z") -
    Date.parse(validDay(start) + "T00:00:00Z")) / 86400000;
}
function eligible(offer: Offer, date: string, input: PlanInput): boolean {
  if (offer.region !== input.region) return false;
  if (offer.access !== "free" &&
      !(offer.access === "subscription" && input.subscribedProviders.includes(offer.providerId))) return false;
  if (input.mode === "fixture"
      ? offer.evidence !== "FIXTURE"
      : offer.evidence !== "VERIFIED" && offer.evidence !== "OBSERVED") return false;
  const age = daysBetween(offer.observedOn, date);
  if (age < 0 || age > (input.observationMaxAgeDays ?? 7)) return false;
  if (hasTrustedExpiry(offer) && offer.expiresOn && date > validDay(offer.expiresOn)) return false;
  return true;
}
function hasTrustedExpiry(offer: Offer): boolean {
  return offer.evidence === "FIXTURE" || offer.evidence === "VERIFIED" ||
    offer.expiryEvidence === "USER_REVIEWED_OFFICIAL";
}
function rank(candidate: Candidate, offer: Offer, date: string): number {
  let urgency = 0;
  if (hasTrustedExpiry(offer) && offer.expiresOn) {
    const days = daysBetween(date, offer.expiresOn);
    if (days >= 0) urgency = days <= 1 ? 100 : days <= 3 ? 85 : days <= 7 ? 65 : days <= 14 ? 30 : 0;
  }
  return Math.round((candidate.tasteScore * 0.55 +
    candidate.qualityScore * 0.25 + urgency * 0.2) * 100) / 100;
}
function validScore(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}
/** Stable greedy baseline. Not a globally optimal scheduling solver. */
export function planViewing(input: PlanInput): PlanOutput {
  if (input.mode !== "fixture" && input.mode !== "research") throw new Error("Invalid data mode");
  if (input.observationMaxAgeDays !== undefined &&
      (!Number.isInteger(input.observationMaxAgeDays) || input.observationMaxAgeDays < 0)) {
    throw new Error("Invalid observation age");
  }
  const requestedMinutes = input.weeklyBudgetMinutes ?? input.slots.reduce((sum, slot) => sum + slot.minutes, 0);
  if (!Number.isInteger(requestedMinutes) || requestedMinutes < 0) throw new Error("Invalid weekly budget");
  let remainingBudget = requestedMinutes;
  const slots = input.slots.map(slot => ({
    date: validDay(slot.date),
    remaining: slot.minutes,
  }));
  for (const slot of slots) {
    if (!Number.isInteger(slot.remaining) || slot.remaining < 0) throw new Error("Invalid slot minutes");
  }
  slots.sort((a, b) => a.date.localeCompare(b.date));
  const ids = new Set<string>();
  const rejections: PlanOutput["rejections"] = [];
  const ranked: { candidate: Candidate; maxScore: number }[] = [];
  for (const candidate of input.candidates) {
    if (ids.has(candidate.id)) throw new Error("Duplicate candidate ID: " + candidate.id);
    ids.add(candidate.id);
    let reason: RejectionReason | undefined;
    if (candidate.watched) reason = "already_watched";
    else if (candidate.genres.some(genre => input.excludedGenres.some(
      excluded => excluded.toLowerCase() === genre.toLowerCase()))) reason = "excluded_genre";
    else if (!Number.isInteger(candidate.runtimeMinutes) || candidate.runtimeMinutes <= 0 ||
      !validScore(candidate.tasteScore) || !validScore(candidate.qualityScore)) {
      reason = "invalid_runtime_or_score";
    } else if (!slots.some(slot => candidate.offers.some(offer => eligible(offer, slot.date, input)))) {
      reason = "no_eligible_offer";
    }
    if (reason) {
      rejections.push({ movieId: candidate.id, reason });
      continue;
    }
    const maxScore = Math.max(...slots.flatMap(slot => candidate.offers
      .filter(offer => eligible(offer, slot.date, input))
      .map(offer => rank(candidate, offer, slot.date))));
    ranked.push({ candidate, maxScore });
  }
  ranked.sort((a, b) => b.maxScore - a.maxScore || a.candidate.id.localeCompare(b.candidate.id));
  const items: ScheduledItem[] = [];
  for (const { candidate } of ranked) {
    let best: { idx: number; offer: Offer; score: number } | undefined;
    for (let idx = 0; idx < slots.length; idx++) {
      const slot = slots[idx];
      if (slot.remaining < candidate.runtimeMinutes || remainingBudget < candidate.runtimeMinutes) continue;
      for (const offer of candidate.offers) {
        if (!eligible(offer, slot.date, input)) continue;
        const value = rank(candidate, offer, slot.date);
        if (!best || value > best.score ||
            (value === best.score && slot.date < slots[best.idx].date)) {
          best = { idx, offer, score: value };
        }
      }
    }
    if (!best) {
      rejections.push({ movieId: candidate.id, reason: "no_slot_fits" });
      continue;
    }
    slots[best.idx].remaining -= candidate.runtimeMinutes;
    remainingBudget -= candidate.runtimeMinutes;
    items.push({
      movieId: candidate.id, title: candidate.title, date: slots[best.idx].date,
      runtimeMinutes: candidate.runtimeMinutes, score: best.score,
      providerId: best.offer.providerId, evidence: best.offer.evidence,
      source: best.offer.source,
      confirmedExpiryOn: hasTrustedExpiry(best.offer) && best.offer.expiresOn
        ? validDay(best.offer.expiresOn) : null,
      expiryEvidence: best.offer.expiryEvidence,
    });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) ||
    b.score - a.score || a.movieId.localeCompare(b.movieId));
  return {
    items, rejections,
    requestedMinutes,
    scheduledMinutes: items.reduce((sum, item) => sum + item.runtimeMinutes, 0),
    mode: input.mode, algorithm: "deterministic_greedy_v0",
  };
}
