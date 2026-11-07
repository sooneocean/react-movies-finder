/**
 * WatchPilot Lab - transparent catalog observation timeline.
 *
 * Absence from third-party feeds is NEVER proof of a license expiry.
 * A baseline is not an arrival; a failed/partial fetch is not a delisting.
 * Repeated absence remains "observed", never "officially removed".
 */
import type { Access } from "./engine";

export type RadarSource = "TMDB_JUSTWATCH" | "FIXTURE";
export type SnapshotStatus = "SUCCESS" | "FAILED" | "PARTIAL";
export interface RadarOffer {
  providerId: string;
  providerName: string;
  access: Access;
}
export interface RadarSnapshot {
  workId: string;
  workTitle: string;
  region: "TW";
  source: RadarSource;
  observedAt: string;
  status: SnapshotStatus;
  offers: RadarOffer[];
  error?: string;
}
export type RadarEventKind =
  | "BASELINE"
  | "SOURCE_FAILED"
  | "SOURCE_PARTIAL"
  | "NEWLY_OBSERVED"
  | "RETURNED_OBSERVED"
  | "ACCESS_CHANGED"
  | "MISSING_FIRST"
  | "MISSING_REPEATED";
export interface RadarEvent {
  id: string;
  workId: string;
  workTitle: string;
  observedAt: string;
  source: RadarSource;
  kind: RadarEventKind;
  providerId?: string;
  providerName?: string;
  fromAccess?: Access[];
  toAccess?: Access[];
  /** This is an observed event, never an official removal date. */
  confidence: "FIXTURE" | "OBSERVED" | "UNKNOWN";
}
export interface ReviewedNotice {
  workId: string;
  providerId: string;
  expiresOn: string;
  sourceUrl: string;
  checkedAt: string;
  reviewedByUser: true;
}
function validInstant(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || !/^\d{4}-\d{2}-\d{2}T/.test(value)) throw new Error("Invalid observation instant");
  return parsed;
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
function grouped(offers: RadarOffer[]): Map<string, { name: string; access: Access[] }> {
  const result = new Map<string, { name: string; access: Access[] }>();
  for (const offer of offers) {
    if (!offer.providerId || !offer.providerName ||
      !["subscription", "free", "ads", "rent", "buy"].includes(offer.access)) {
      throw new Error("Invalid catalog offer");
    }
    const entry = result.get(offer.providerId) ?? { name: offer.providerName, access: [] };
    if (!entry.access.includes(offer.access)) entry.access.push(offer.access);
    result.set(offer.providerId, entry);
  }
  for (const value of result.values()) value.access.sort();
  return result;
}
function identical(a: Access[], b: Access[]): boolean {
  return a.length === b.length && a.every((v, idx) => v === b[idx]);
}
function event(
  snap: RadarSnapshot, kind: RadarEventKind,
  providerId?: string, providerName?: string,
  fromAccess?: Access[], toAccess?: Access[],
): RadarEvent {
  return {
    id: [snap.workId, snap.observedAt, kind, providerId ?? ""].join("::"),
    workId: snap.workId, workTitle: snap.workTitle,
    observedAt: snap.observedAt, source: snap.source,
    kind, providerId, providerName, fromAccess, toAccess,
    confidence: kind === "SOURCE_FAILED" || kind === "SOURCE_PARTIAL"
      ? "UNKNOWN" : snap.source === "FIXTURE" ? "FIXTURE" : "OBSERVED",
  };
}
/**
 * Pure recomputation from complete per-title history. Results are stable.
 * Each SUCCESS means the provider endpoint responded for *that title*,
 * not that it has a comprehensive catalog or official expiration metadata.
 */
export function deriveRadarEvents(snapshots: RadarSnapshot[]): RadarEvent[] {
  if (snapshots.length === 0) return [];
  const sorted = [...snapshots].sort((a, b) => validInstant(a.observedAt) - validInstant(b.observedAt));
  const first = sorted[0];
  const lastTimes = new Set<number>();
  for (const snap of sorted) {
    const instant = validInstant(snap.observedAt);
    if (snap.workId !== first.workId || snap.source !== first.source ||
      snap.region !== "TW" || !snap.workTitle.trim() || lastTimes.has(instant)) {
      throw new Error("Incompatible or duplicated catalog snapshots");
    }
    lastTimes.add(instant);
    if (snap.status !== "SUCCESS" && snap.offers.length) throw new Error("Incomplete snapshot must not contain offers");
    grouped(snap.offers);
  }
  const events: RadarEvent[] = [];
  let previous: RadarSnapshot | null = null;
  const everSeen = new Set<string>();
  const missingSince = new Map<string, { time: number; repeated: boolean }>();
  for (const snap of sorted) {
    if (snap.status !== "SUCCESS") {
      events.push(event(snap, snap.status === "PARTIAL" ? "SOURCE_PARTIAL" : "SOURCE_FAILED"));
      missingSince.clear(); // interrupted evidence chain cannot prove repeated absence
      continue;
    }
    const current = grouped(snap.offers);
    if (previous === null) {
      events.push(event(snap, "BASELINE"));
      for (const key of current.keys()) everSeen.add(key);
      previous = snap;
      continue;
    }
    const prior = grouped(previous.offers);
    const keys = new Set([...prior.keys(), ...current.keys(), ...missingSince.keys()]);
    for (const id of [...keys].sort()) {
      const a = prior.get(id), b = current.get(id);
      const name = b?.name ?? a?.name ?? id;
      if (a && b) {
        if (!identical(a.access, b.access)) {
          events.push(event(snap, "ACCESS_CHANGED", id, name, [...a.access], [...b.access]));
        }
        missingSince.delete(id);
        everSeen.add(id);
      } else if (a && !b) {
        events.push(event(snap, "MISSING_FIRST", id, name, [...a.access], []));
        missingSince.set(id, { time: validInstant(snap.observedAt), repeated: false });
      } else if (!a && b) {
        events.push(event(snap, everSeen.has(id) ? "RETURNED_OBSERVED" : "NEWLY_OBSERVED",
          id, name, [], [...b.access]));
        everSeen.add(id);
        missingSince.delete(id);
      } else {
        const missing = missingSince.get(id);
        if (missing && !missing.repeated &&
          validInstant(snap.observedAt) - missing.time >= 24 * 60 * 60 * 1000) {
          events.push(event(snap, "MISSING_REPEATED", id, name));
          missing.repeated = true;
        }
      }
    }
    previous = snap;
  }
  return events;
}
export function validateReviewedNotice(notice: ReviewedNotice): ReviewedNotice {
  if (!notice.reviewedByUser || !notice.workId || !notice.providerId ||
    !validDate(notice.expiresOn) || !Number.isFinite(Date.parse(notice.checkedAt))) {
    throw new Error("Missing required manual review details");
  }
  try {
    const link = new URL(notice.sourceUrl);
    if (link.protocol !== "https:" || !link.hostname.includes(".") || link.username || link.password) {
      throw new Error("Invalid official reference");
    }
  } catch {
    throw new Error("Official reference must be an HTTPS URL");
  }
  if (notice.sourceUrl.length > 500) throw new Error("Reference URL too long");
  return { ...notice };
}
/** Retention and privacy guard for local research history. */
export function trimRadarSnapshots(snapshots: RadarSnapshot[], now: Date = new Date()): RadarSnapshot[] {
  const clock = now.getTime();
  if (!Number.isFinite(clock)) throw new Error("Invalid local clock");
  const valid = snapshots.filter(snap =>
    validInstant(snap.observedAt) <= clock &&
    clock - validInstant(snap.observedAt) <= 30 * 24 * 60 * 60 * 1000);
  return [...valid].sort((a, b) => a.observedAt.localeCompare(b.observedAt)).slice(-20);
}
