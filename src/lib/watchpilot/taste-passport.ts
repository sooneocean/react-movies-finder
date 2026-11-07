/**
 * Local-only, explicit personal movie taste profile.
 * No inference of sensitive traits, no profile API, no external upload.
 */
import type { Candidate } from "./engine.ts";

export const TASTE_STORAGE_KEY = "watchpilot-taste-passport-v1";
export const SUPPORTED_TASTE_GENRES = [
  "science-fiction", "mystery", "crime", "comedy", "drama", "horror",
  "action", "animation", "romance", "documentary", "fantasy",
] as const;

export type Opinion = "love" | "like" | "neutral" | "dislike";
export interface TasteEntry {
  workId: string;
  opinion: Opinion;
  genres: string[];
  watched: boolean;
}
export interface TastePassport {
  version: 1;
  likedGenres: string[];
  avoidedGenres: string[];
  entries: TasteEntry[];
}
export interface TasteChange {
  candidate: Candidate;
  baseScore: number;
  adjustedScore: number;
  excluded: boolean;
  watched: boolean;
}
export interface LocalTasteStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const genreSet = new Set<string>(SUPPORTED_TASTE_GENRES);
const opinionSet = new Set<Opinion>(["love", "like", "neutral", "dislike"]);
export function emptyTastePassport(): TastePassport {
  return { version: 1, likedGenres: [], avoidedGenres: [], entries: [] };
}
function validIdentifier(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 80 &&
    /^[\w:-]+$/.test(id);
}
function validateGenres(values: unknown): string[] {
  if (!Array.isArray(values) || values.length > 20) throw new Error("Invalid taste genres");
  const result = [...new Set(values)];
  if (result.some(v => typeof v !== "string" || !genreSet.has(v))) {
    throw new Error("Unknown taste genre");
  }
  return result as string[];
}
export function validateTastePassport(value: unknown): TastePassport {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid taste passport");
  }
  const input = value as Record<string, unknown>;
  if (input.version !== 1) throw new Error("Unsupported taste version");
  const likedGenres = validateGenres(input.likedGenres);
  const avoidedGenres = validateGenres(input.avoidedGenres);
  if (likedGenres.some(x => avoidedGenres.includes(x))) {
    throw new Error("Conflicting taste preferences");
  }
  if (!Array.isArray(input.entries) || input.entries.length > 100) {
    throw new Error("Too many movie opinions");
  }
  const ids = new Set<string>();
  const entries: TasteEntry[] = [];
  for (const row of input.entries) {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Invalid movie opinion");
    const r = row as Record<string, unknown>;
    if (!validIdentifier(r.workId) || ids.has(r.workId) ||
        !opinionSet.has(r.opinion as Opinion) ||
        typeof r.watched !== "boolean") {
      throw new Error("Invalid or duplicated movie opinion");
    }
    ids.add(r.workId);
    entries.push({
      workId: r.workId, opinion: r.opinion as Opinion,
      genres: validateGenres(r.genres), watched: r.watched,
    });
  }
  return { version: 1, likedGenres, avoidedGenres, entries };
}
export function setGenrePreference(
  profile: TastePassport,
  genre: string,
  preference: "like" | "avoid" | "neutral",
): TastePassport {
  const safe = validateTastePassport(profile);
  if (!genreSet.has(genre)) throw new Error("Unsupported genre");
  const likedGenres = safe.likedGenres.filter(x => x !== genre);
  const avoidedGenres = safe.avoidedGenres.filter(x => x !== genre);
  if (preference === "like") likedGenres.push(genre);
  else if (preference === "avoid") avoidedGenres.push(genre);
  else if (preference !== "neutral") throw new Error("Invalid preference");
  return { ...safe, likedGenres, avoidedGenres };
}
export function rateTasteWork(
  profile: TastePassport, workId: string, genres: string[], opinion: Opinion, watched: boolean,
): TastePassport {
  const safe = validateTastePassport(profile);
  if (!validIdentifier(workId) || !opinionSet.has(opinion) || typeof watched !== "boolean") {
    throw new Error("Invalid movie rating");
  }
  const normalizedGenres = validateGenres(genres);
  const entries = safe.entries.filter(x => x.workId !== workId);
  entries.push({ workId, genres: normalizedGenres, opinion, watched });
  return { ...safe, entries: entries.slice(-100) };
}
export function removeTasteWork(profile: TastePassport, workId: string): TastePassport {
  const safe = validateTastePassport(profile);
  return { ...safe, entries: safe.entries.filter(x => x.workId !== workId) };
}
function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}
/**
 * Explainable, deterministic additive offsets; no ML claims.
 * Genre avoidance is a hard filter, while liked genres and opinions are soft signals.
 */
export function applyTastePassport(candidates: Candidate[], profile: TastePassport): TasteChange[] {
  const safe = validateTastePassport(profile);
  const opinions = new Map(safe.entries.map(e => [e.workId, e]));
  const byGenre = new Map<string, number[]>();
  const opinionsWeight: Record<Opinion, number> = { love: 16, like: 8, neutral: 0, dislike: -15 };
  for (const entry of safe.entries) {
    for (const genre of entry.genres) {
      const scores = byGenre.get(genre) ?? [];
      scores.push(opinionsWeight[entry.opinion]);
      byGenre.set(genre, scores);
    }
  }
  return candidates.map(candidate => {
    const explicit = opinions.get(candidate.id);
    const avoided = candidate.genres.some(g => safe.avoidedGenres.includes(g));
    const liked = candidate.genres.filter(g => safe.likedGenres.includes(g));
    const derived = candidate.genres
      .map(g => byGenre.get(g))
      .filter((v): v is number[] => Boolean(v))
      .map(values => values.reduce((sum, value) => sum + value, 0) / (values.length + 2));
    const inferred = derived.length === 0 ? 0 :
      Math.max(-12, Math.min(12, derived.reduce((a, b) => a + b, 0) / derived.length));
    const personal = explicit ? opinionsWeight[explicit.opinion] : 0;
    const adjustedScore = clamp(candidate.tasteScore + liked.length * 10 + inferred + personal);
    return {
      candidate: { ...candidate, tasteScore: adjustedScore,
        watched: Boolean(candidate.watched || explicit?.watched) },
      baseScore: candidate.tasteScore, adjustedScore,
      excluded: avoided,
      watched: Boolean(candidate.watched || explicit?.watched),
    };
  });
}
export function loadTastePassport(store: LocalTasteStore): TastePassport {
  try {
    const raw = store.getItem(TASTE_STORAGE_KEY);
    if (!raw || raw.length > 30000) return emptyTastePassport();
    return validateTastePassport(JSON.parse(raw));
  } catch {
    return emptyTastePassport();
  }
}
export function saveTastePassport(store: LocalTasteStore, profile: TastePassport): void {
  const serialized = JSON.stringify(validateTastePassport(profile));
  if (serialized.length > 30000) throw new Error("Taste profile storage limit exceeded");
  store.setItem(TASTE_STORAGE_KEY, serialized);
}
