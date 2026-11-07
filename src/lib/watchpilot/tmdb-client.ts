/**
 * Server-only TMDB client for the Taiwanese personal research view.
 * Never place an API key in the browser or in a public fixture.
 */
import { normalizeTWMovie, type TWTitle } from "./tmdb-tw.ts";

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
export class TMDBResearchError extends Error {
  constructor(
    public readonly code: "INVALID_QUERY" | "NO_KEY" | "UPSTREAM" | "RATE_LIMITED",
    public readonly status: number,
  ) {
    super(code);
    this.name = "TMDBResearchError";
  }
}
export interface TWSearchResult {
  region: "TW";
  query: string;
  checkedAt: string;
  titles: TWTitle[];
  warnings: { tmdbId: number; reason: "DETAIL_OR_PROVIDER_UNAVAILABLE" }[];
  source: "TMDB / JustWatch";
}
function validKey(value: string | undefined): value is string {
  return Boolean(value && value.length >= 6 &&
    value !== "your_tmdb_api_key_here" &&
    !value.toLowerCase().startsWith("your_"));
}
function validTitleQuery(input: string): string {
  const query = input.trim().replace(/\s+/g, " ");
  if (query.length < 2 || query.length > 80 || /[\u0000-\u001f\u007f]/.test(query)) {
    throw new TMDBResearchError("INVALID_QUERY", 400);
  }
  return query;
}
async function readTMDB(
  path: string, params: Record<string, string>, apiKey: string,
  fetcher: FetchLike,
): Promise<unknown> {
  const url = new URL("https://api.themoviedb.org/3" + path);
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
      // Next.js supports next.revalidate; standard fetch ignores this extra property.
      next: { revalidate: 3600 },
    } as RequestInit);
  } catch {
    throw new TMDBResearchError("UPSTREAM", 502);
  }
  if (response.status === 429) throw new TMDBResearchError("RATE_LIMITED", 429);
  if (!response.ok) throw new TMDBResearchError("UPSTREAM", 502);
  try {
    return await response.json();
  } catch {
    throw new TMDBResearchError("UPSTREAM", 502);
  }
}
/**
 * Searches only five results for a user-supplied movie title.
 * It does not provide a bulk catalog endpoint.
 */
export async function searchTWMovies(
  rawQuery: string,
  apiKey: string | undefined,
  fetcher: FetchLike = fetch,
  now: Date = new Date(),
): Promise<TWSearchResult> {
  const query = validTitleQuery(rawQuery);
  if (!validKey(apiKey)) throw new TMDBResearchError("NO_KEY", 503);
  if (Number.isNaN(now.getTime())) throw new Error("Invalid clock");
  const checkedAt = now.toISOString();
  const search = await readTMDB("/search/movie", {
    query, language: "zh-TW", region: "TW", include_adult: "false", page: "1",
  }, apiKey, fetcher);
  const results = search && typeof search === "object" && "results" in search &&
    Array.isArray(search.results) ? search.results.slice(0, 5) as unknown[] : null;
  if (results === null) throw new TMDBResearchError("UPSTREAM", 502);
  const titles: TWTitle[] = [];
  const warnings: TWSearchResult["warnings"] = [];
  // Small sequential batches prevent accidentally fan-out to an entire TMDB catalog.
  for (let offset = 0; offset < results.length; offset += 2) {
    const batch = results.slice(offset, offset + 2);
    const fetched = await Promise.all(batch.map(async raw => {
      if (!raw || typeof raw !== "object" || !("id" in raw) ||
        typeof raw.id !== "number" || !Number.isSafeInteger(raw.id) || raw.id <= 0) return null;
      const id = raw.id;
      try {
        const [detail, providers] = await Promise.all([
          readTMDB("/movie/" + id, { language: "zh-TW" }, apiKey, fetcher),
          readTMDB("/movie/" + id + "/watch/providers", {}, apiKey, fetcher),
        ]);
        return { id, title: normalizeTWMovie(detail, providers, checkedAt) };
      } catch {
        warnings.push({ tmdbId: id, reason: "DETAIL_OR_PROVIDER_UNAVAILABLE" });
        return null;
      }
    }));
    for (const item of fetched) if (item !== null) titles.push(item.title);
  }
  // Zero matches in search is normal; failing all fetched details is not.
  if (results.length > 0 && titles.length === 0) throw new TMDBResearchError("UPSTREAM", 502);
  return { region: "TW", query, checkedAt, titles, warnings, source: "TMDB / JustWatch" };
}


/** One-title-on-demand refresh. Never returns a bulk provider catalog. */
export async function fetchTWMovieById(
  rawId: number,
  apiKey: string | undefined,
  fetcher: FetchLike = fetch,
  now: Date = new Date(),
): Promise<TWTitle> {
  if (!Number.isSafeInteger(rawId) || rawId <= 0 || rawId > 2147483647) {
    throw new TMDBResearchError("INVALID_QUERY", 400);
  }
  if (!validKey(apiKey)) throw new TMDBResearchError("NO_KEY", 503);
  if (Number.isNaN(now.getTime())) throw new Error("Invalid clock");
  const [detail, providers] = await Promise.all([
    readTMDB("/movie/" + rawId, { language: "zh-TW" }, apiKey, fetcher),
    readTMDB("/movie/" + rawId + "/watch/providers", {}, apiKey, fetcher),
  ]);
  if (!detail || typeof detail !== "object" || !("id" in detail) || detail.id !== rawId) {
    throw new TMDBResearchError("UPSTREAM", 502);
  }
  return normalizeTWMovie(detail, providers, now.toISOString());
}
