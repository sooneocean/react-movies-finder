/**
 * Local-only WatchPilot radar workspace.
 * Stores only user-selected, minimal title metadata and limited offer observations.
 * The catalog snapshots are NOT an exportable third-party media database.
 */
import type { TWTitle } from "./tmdb-tw";
import type { PlanOutput } from "./engine";
import {
  type RadarSnapshot, type RadarOffer, type ReviewedNotice,
  trimRadarSnapshots, validateReviewedNotice,
} from "./catalog-radar.ts";

export const RADAR_STORAGE_KEY = "watchpilot-radar-research-v1";
export interface RadarWorkspace {
  version: 1;
  tracked: TWTitle[];
  snapshots: RadarSnapshot[];
  reviewedNotices: ReviewedNotice[];
  lastPlan?: { generatedAt: string; output: PlanOutput };
}
export function emptyRadarWorkspace(): RadarWorkspace {
  return { version: 1, tracked: [], snapshots: [], reviewedNotices: [] };
}
export function minimalTitle(item: TWTitle): TWTitle {
  return {
    ...item,
    overview: "", posterPath: null,
    genres: item.genres.slice(0, 20),
    genreLabels: item.genreLabels.slice(0, 20),
    offers: item.offers.slice(0, 40).map(offer => ({ ...offer })),
  };
}
export function radarSnapshotFromTitle(item: TWTitle): RadarSnapshot {
  const offers: RadarOffer[] = item.offers.map(offer => ({
    providerId: offer.providerId, providerName: offer.providerName,
    access: offer.access,
  }));
  return {
    workId: "tmdb:" + item.tmdbId,
    workTitle: item.title, region: "TW", source: "TMDB_JUSTWATCH",
    observedAt: item.checkedAt, status: "SUCCESS", offers,
  };
}
function trimAll(workspace: RadarWorkspace, now: Date): RadarWorkspace {
  const recent = workspace.snapshots.filter(snap => workspace.tracked.some(
    title => snap.workId === "tmdb:" + title.tmdbId));
  const ids = [...new Set(recent.map(snap => snap.workId))];
  const snapshots = ids.flatMap(id => trimRadarSnapshots(
    recent.filter(snap => snap.workId === id), now));
  return {
    ...workspace,
    tracked: workspace.tracked.slice(-20),
    snapshots: snapshots.slice(-400),
    reviewedNotices: workspace.reviewedNotices.filter(
      notice => workspace.tracked.some(title => notice.workId === "tmdb:" + title.tmdbId),
    ).slice(-60),
  };
}
export function upsertTrackedTitle(
  workspace: RadarWorkspace, item: TWTitle, now: Date = new Date(),
): RadarWorkspace {
  if (item.region !== "TW" || item.evidence !== "OBSERVED" || !item.checkedAt) {
    throw new Error("Expected a Taiwanese TMDB observation");
  }
  if (Date.parse(item.checkedAt) > now.getTime() + 60_000) throw new Error("Observation is in the future");
  const tracked = [
    ...workspace.tracked.filter(title => title.tmdbId !== item.tmdbId),
    minimalTitle(item),
  ].slice(-20);
  const entry = radarSnapshotFromTitle(item);
  const snapshots = workspace.snapshots.filter(snap => {
    if (snap.workId !== entry.workId) return true;
    return snap.observedAt !== entry.observedAt;
  }).concat(entry);
  return trimAll({ ...workspace, tracked, snapshots }, now);
}
/**
 * Audit a failed refresh without overwriting prior valid offers or claiming removal.
 * The missing data is not an empty successful catalog snapshot.
 */
export function recordRadarRefreshFailure(
  workspace: RadarWorkspace, tmdbId: number, now: Date = new Date(),
): RadarWorkspace {
  const title = workspace.tracked.find(item => item.tmdbId === tmdbId);
  if (!title || Number.isNaN(now.getTime())) throw new Error("Invalid tracked refresh");
  const snapshot: RadarSnapshot = {
    workId: "tmdb:" + tmdbId, workTitle: title.title, region: "TW",
    source: "TMDB_JUSTWATCH", observedAt: now.toISOString(), status: "FAILED",
    offers: [], error: "Refresh failed; availability unchanged",
  };
  return trimAll({
    ...workspace,
    snapshots: workspace.snapshots.filter(existing =>
      existing.workId !== snapshot.workId || existing.observedAt !== snapshot.observedAt).concat(snapshot),
  }, now);
}

export function removeTrackedTitle(workspace: RadarWorkspace, tmdbId: number): RadarWorkspace {
  const id = "tmdb:" + tmdbId;
  return {
    ...workspace,
    tracked: workspace.tracked.filter(t => t.tmdbId !== tmdbId),
    snapshots: workspace.snapshots.filter(s => s.workId !== id),
    reviewedNotices: workspace.reviewedNotices.filter(n => n.workId !== id),
  };
}
export function upsertReviewedNotice(workspace: RadarWorkspace, notice: ReviewedNotice): RadarWorkspace {
  validateReviewedNotice(notice);
  const titleId = Number(notice.workId.replace(/^tmdb:/, ""));
  if (!Number.isSafeInteger(titleId) || !workspace.tracked.some(title => title.tmdbId === titleId)) {
    throw new Error("Official notice must reference a tracked movie");
  }
  const notices = workspace.reviewedNotices.filter(
    existing => !(existing.workId === notice.workId && existing.providerId === notice.providerId),
  ).concat({ ...notice });
  return { ...workspace, reviewedNotices: notices };
}
/** Add manual deadlines to eligible TMDB offers, without promoting their OBSERVED availability. */
export function withReviewedExpiry(titles: TWTitle[], notices: ReviewedNotice[]): TWTitle[] {
  return titles.map(item => ({
    ...item,
    offers: item.offers.map(offer => {
      const notice = notices.find(n => n.workId === "tmdb:" + item.tmdbId &&
        n.providerId === offer.providerId && n.reviewedByUser);
      if (!notice) return offer;
      validateReviewedNotice(notice);
      return {
        ...offer, expiresOn: notice.expiresOn,
        expiryEvidence: "USER_REVIEWED_OFFICIAL" as const,
      };
    }),
  }));
}
export function loadRadarWorkspace(store: Pick<Storage, "getItem">, now: Date = new Date()): RadarWorkspace {
  try {
    const raw = store.getItem(RADAR_STORAGE_KEY);
    if (!raw || raw.length > 250_000) return emptyRadarWorkspace();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("version" in parsed) || parsed.version !== 1 ||
      !("tracked" in parsed) || !Array.isArray(parsed.tracked) ||
      !("snapshots" in parsed) || !Array.isArray(parsed.snapshots) ||
      !("reviewedNotices" in parsed) || !Array.isArray(parsed.reviewedNotices)) {
      return emptyRadarWorkspace();
    }
    const workspace = parsed as RadarWorkspace;
    if (workspace.tracked.length > 20 || workspace.snapshots.length > 400 ||
      workspace.reviewedNotices.length > 60) return emptyRadarWorkspace();
    return trimAll(workspace, now);
  } catch {
    return emptyRadarWorkspace();
  }
}
export function saveRadarWorkspace(store: Pick<Storage, "setItem">, workspace: RadarWorkspace) {
  const payload = JSON.stringify(trimAll(workspace, new Date()));
  if (payload.length > 250_000) throw new Error("Local radar data exceeds storage limit");
  store.setItem(RADAR_STORAGE_KEY, payload);
}
