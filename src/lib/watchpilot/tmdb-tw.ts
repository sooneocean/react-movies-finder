/**
 * TMDB + JustWatch TW normalization. Pure functions; no API credentials.
 * Movie metadata and provider coverage are third-party observations,
 * not official licensing guarantees or verified expiry dates.
 */
import type { Candidate, Offer } from "./engine";

export type Monetization = "flatrate" | "free" | "ads" | "rent" | "buy";
export interface TWOffer extends Offer {
  providerName: string;
  tmdbProviderId: number;
  monetization: Monetization;
}
export interface TWTitle {
  tmdbId: number;
  title: string;
  originalTitle: string;
  year: string | null;
  runtimeMinutes: number | null;
  genres: string[];
  genreLabels: string[];
  overview: string;
  posterPath: string | null;
  voteAverage: number;
  voteCount: number;
  offers: TWOffer[];
  watchLink: string | null;
  checkedAt: string;
  region: "TW";
  evidence: "OBSERVED";
  source: "TMDB / JustWatch";
  availabilityStatus: "TW_OFFERS_FOUND" | "NO_TW_OFFERS";
}

const GENRES: Record<number, string> = {
  28: "action", 12: "adventure", 16: "animation", 35: "comedy",
  80: "crime", 99: "documentary", 18: "drama", 14: "fantasy",
  36: "history", 27: "horror", 10402: "music", 9648: "mystery",
  10749: "romance", 878: "science-fiction", 53: "thriller",
  10752: "war", 37: "western", 10751: "family",
};
const PLATFORM_ALIASES: Record<string, string> = {
  "netflix": "netflix",
  "disney plus": "disney",
  "disney+": "disney",
  "amazon prime video": "prime",
  "prime video": "prime",
  "hbo max": "max",
  "max": "max",
  "hami video": "hami",
  "myvideo": "myvideo",
  "friday影音": "friday",
  "friday video": "friday",
  "line tv": "line",
};
function asObj(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function asPositiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}
function asFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function taiwanDay(isoInstant: string): string {
  const parsed = new Date(isoInstant);
  if (Number.isNaN(parsed.valueOf())) throw new Error("Invalid observation timestamp");
  return new Date(parsed.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function providerId(provider: Record<string, unknown>): { id: string; name: string; tmdbId: number } | null {
  const tmdbId = asPositiveInt(provider.provider_id);
  if (!tmdbId) return null;
  const name = asString(provider.provider_name).trim();
  if (!name) return null;
  const normalized = name.toLowerCase().replace(/\s+/g, " ");
  return { id: PLATFORM_ALIASES[normalized] ?? "tmdb:" + tmdbId, name, tmdbId };
}
function tmdbWatchLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const link = new URL(value);
    return link.protocol === "https:" &&
      (link.hostname === "www.themoviedb.org" || link.hostname === "themoviedb.org")
      ? link.href : null;
  } catch {
    return null;
  }
}
function sanitizePosterPath(value: unknown): string | null {
  return typeof value === "string" && /^\/[a-zA-Z0-9_./-]{1,200}$/.test(value) &&
    !value.includes("..") ? value : null;
}
/** Never reads another region if results.TW is missing. */
export function normalizeTWMovie(detail: unknown, providersResponse: unknown, checkedAt: string): TWTitle {
  const rawMovie = asObj(detail);
  const id = asPositiveInt(rawMovie?.id);
  if (!rawMovie || !id) throw new Error("Invalid TMDB movie detail payload");
  const result = asObj(providersResponse);
  const results = asObj(result?.results);
  const tw = asObj(results?.TW);
  const collected: TWOffer[] = [];
  const observedOn = taiwanDay(checkedAt);
  const buckets = [
    ["flatrate", "subscription"],
    ["free", "free"],
    ["ads", "ads"],
    ["rent", "rent"],
    ["buy", "buy"],
  ] as const;
  const seen = new Set<string>();
  for (const [key, access] of buckets) {
    const entries = tw?.[key];
    if (!Array.isArray(entries)) continue;
    for (const item of entries.slice(0, 100)) {
      const p = asObj(item);
      if (!p) continue;
      const identity = providerId(p);
      if (!identity) continue;
      const duplicateKey = key + ":" + identity.tmdbId;
      if (seen.has(duplicateKey)) continue;
      seen.add(duplicateKey);
      collected.push({
        providerId: identity.id, providerName: identity.name,
        tmdbProviderId: identity.tmdbId, monetization: key, access,
        region: "TW", evidence: "OBSERVED",
        source: "TMDB / JustWatch (TW)", observedOn,
        expiresOn: null,
      });
    }
  }
  const genres = Array.isArray(rawMovie.genres) ? rawMovie.genres : [];
  const genreKeys: string[] = [];
  const genreLabels: string[] = [];
  for (const value of genres) {
    const genre = asObj(value);
    const genreId = asPositiveInt(genre?.id);
    if (!genreId) continue;
    const tag = GENRES[genreId] ?? "tmdb-genre:" + genreId;
    if (!genreKeys.includes(tag)) genreKeys.push(tag);
    const label = asString(genre?.name).trim();
    if (label && !genreLabels.includes(label)) genreLabels.push(label);
  }
  const releaseDate = asString(rawMovie.release_date);
  const year = /^\d{4}-\d{2}-\d{2}$/.test(releaseDate) ? releaseDate.slice(0, 4) : null;
  const runtimeMinutes = asPositiveInt(rawMovie.runtime);
  return {
    tmdbId: id,
    title: asString(rawMovie.title, asString(rawMovie.original_title, "未命名電影")),
    originalTitle: asString(rawMovie.original_title),
    year, runtimeMinutes, genres: genreKeys, genreLabels,
    overview: asString(rawMovie.overview),
    posterPath: sanitizePosterPath(rawMovie.poster_path),
    voteAverage: Math.max(0, Math.min(10, asFiniteNumber(rawMovie.vote_average))),
    voteCount: Math.max(0, Math.floor(asFiniteNumber(rawMovie.vote_count))),
    offers: collected,
    watchLink: tmdbWatchLink(tw?.link),
    checkedAt: new Date(checkedAt).toISOString(),
    region: "TW", evidence: "OBSERVED", source: "TMDB / JustWatch",
    availabilityStatus: collected.length > 0 ? "TW_OFFERS_FOUND" : "NO_TW_OFFERS",
  };
}
/**
 * Research-only projection. TMDB observation != certified availability.
 * Scores are experimental estimates, not independent review ratings.
 */
export function toResearchCandidate(item: TWTitle, preferredGenres: string[]): Candidate | null {
  if (item.runtimeMinutes === null) return null;
  const priorMean = 65, priorVotes = 50;
  const qualityScore = (item.voteAverage * 10 * item.voteCount + priorMean * priorVotes) /
    (item.voteCount + priorVotes);
  const genreBoost = item.genres.some(x => preferredGenres.includes(x)) ? 20 : 0;
  const tasteScore = Math.min(100, 55 + genreBoost);
  return {
    id: "tmdb:" + item.tmdbId, title: item.title,
    runtimeMinutes: item.runtimeMinutes, genres: item.genres,
    tasteScore, qualityScore,
    offers: item.offers.map(({ providerId, region, access, evidence, source, observedOn, expiresOn, expiryEvidence }) => ({
      providerId, region, access, evidence, source, observedOn, expiresOn, expiryEvidence,
    })),
  };
}
