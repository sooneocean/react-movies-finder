import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeTWMovie, toResearchCandidate } from "../src/lib/watchpilot/tmdb-tw.ts";
import { searchTWMovies, TMDBResearchError } from "../src/lib/watchpilot/tmdb-client.ts";

const checkedAt = "2026-11-07T15:55:00.000Z"; // 2026-11-07? TW = 2026-11-07 23:55
const detail = {
  id: 42, title: "研究電影", original_title: "Research Film",
  release_date: "2020-05-01", runtime: 124,
  genres: [{ id: 878, name: "科幻" }, { id: 27, name: "恐怖" }],
  vote_average: 8.1, vote_count: 120,
  poster_path: "/abcdef.jpg", overview: "合成資料，非真實電影。",
};
const provider = (provider_id, provider_name) => ({ provider_id, provider_name, logo_path: "/foo.png", display_priority: 1 });
const providerResponse = {
  results: {
    TW: {
      link: "https://www.themoviedb.org/movie/42-research/watch?locale=TW",
      flatrate: [provider(8, "Netflix"), provider(337, "Disney Plus")],
      rent: [provider(8, "Netflix"), provider(9999, "台灣自訂租借平台")],
      buy: [provider(9, "Amazon Prime Video")],
      free: [provider(1111, "測試免費平台")],
      ads: [provider(2222, "測試廣告平台")],
    },
    US: { flatrate: [provider(8, "Netflix")] },
  },
};
test("TW offers keep access categories, provider identity and JustWatch evidence", () => {
  const row = normalizeTWMovie(detail, providerResponse, checkedAt);
  assert.equal(row.region, "TW");
  assert.equal(row.evidence, "OBSERVED");
  assert.equal(row.offers.length, 7);
  assert.ok(row.offers.every(o => o.region === "TW" && o.evidence === "OBSERVED" && o.expiresOn === null));
  assert.ok(row.offers.some(o => o.providerId === "netflix" && o.access === "subscription"));
  assert.ok(row.offers.some(o => o.providerId === "netflix" && o.access === "rent"));
  assert.ok(row.offers.some(o => o.providerId === "tmdb:9999" && o.monetization === "rent"));
  assert.ok(row.offers.some(o => o.access === "ads"));
});
test("Missing TW is not replaced with US availability", () => {
  const row = normalizeTWMovie(detail, { results: { US: providerResponse.results.US } }, checkedAt);
  assert.equal(row.offers.length, 0);
  assert.equal(row.availabilityStatus, "NO_TW_OFFERS");
});
test("deduplicate same provider in a category but preserve distinct access types", () => {
  const row = normalizeTWMovie(detail, { results: { TW: {
    flatrate: [provider(8, "Netflix"), provider(8, "Netflix")],
    rent: [provider(8, "Netflix")],
  } } }, checkedAt);
  assert.equal(row.offers.length, 2);
});
test("Strict TW-day timestamps around UTC midnight", () => {
  const row = normalizeTWMovie(detail, providerResponse, "2026-11-07T20:00:00.000Z");
  assert.equal(row.offers[0].observedOn, "2026-11-08");
});
test("No source data fabricates an expiry date or a direct platform link", () => {
  const row = normalizeTWMovie(detail, { results: { TW: { flatrate: [provider(8, "Netflix")] } } }, checkedAt);
  assert.equal(row.watchLink, null);
  assert.equal(row.offers[0].expiresOn, null);
});
test("Provider watch URL is restricted to TMDB HTTPS domain", () => {
  const row = normalizeTWMovie(detail, { results: { TW: {
    link: "https://malicious.example/watch",
    flatrate: [provider(8, "Netflix")],
  } } }, checkedAt);
  assert.equal(row.watchLink, null);
});
test("Missing or invalid runtime is not schedulable", () => {
  const row = normalizeTWMovie({ ...detail, runtime: null }, providerResponse, checkedAt);
  assert.equal(row.runtimeMinutes, null);
  assert.equal(toResearchCandidate(row, ["science-fiction"]), null);
});
test("Candidate uses observed source and bounded experimental scores", () => {
  const row = normalizeTWMovie(detail, providerResponse, checkedAt);
  const candidate = toResearchCandidate(row, ["science-fiction"]);
  assert.ok(candidate);
  assert.equal(candidate.id, "tmdb:42");
  assert.equal(candidate.tasteScore, 75);
  assert.ok(candidate.qualityScore > 0 && candidate.qualityScore <= 100);
  assert.ok(candidate.genres.includes("horror"));
  assert.ok(candidate.offers.every(o => o.evidence === "OBSERVED"));
});
test("Malformed IDs and timestamps fail without silently accepting rows", () => {
  assert.throws(() => normalizeTWMovie({ ...detail, id: 0 }, providerResponse, checkedAt));
  assert.throws(() => normalizeTWMovie(detail, providerResponse, "invalid"));
});
test("Search validates query and refuses missing API credentials", async () => {
  await assert.rejects(searchTWMovies("a", "fake-key"), err => err.code === "INVALID_QUERY");
  await assert.rejects(searchTWMovies("研究電影", undefined), err => err.code === "NO_KEY");
});
function fakeResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
test("TMDB search is bounded, zh-TW, TW, and never returns API key", async () => {
  const urls = [];
  const fetcher = async url => {
    const parsed = new URL(url);
    urls.push(parsed);
    if (parsed.pathname.endsWith("/search/movie")) return fakeResponse({ results: [
      { id: 42 }, { id: 43 }, { id: 44 }, { id: 45 }, { id: 46 }, { id: 47 },
    ] });
    if (parsed.pathname.endsWith("/watch/providers")) return fakeResponse(providerResponse);
    const tmdbId = Number(parsed.pathname.split("/").at(-1));
    return fakeResponse({ ...detail, id: tmdbId, title: "測試影片" + tmdbId });
  };
  const result = await searchTWMovies("  中文   片名  ", "test-api-key", fetcher, new Date(checkedAt));
  assert.equal(result.titles.length, 5);
  assert.equal(result.region, "TW");
  assert.equal(urls.length, 11); // search + 5 details + 5 provider queries
  assert.equal(urls[0].searchParams.get("language"), "zh-TW");
  assert.equal(urls[0].searchParams.get("region"), "TW");
  assert.equal(urls[0].searchParams.get("page"), "1");
  assert.ok(!JSON.stringify(result).includes("test-api-key"));
});
test("No movie matches is a valid zero-result search, not an error", async () => {
  const result = await searchTWMovies("找不到的電影", "test-api-key",
    async () => fakeResponse({ results: [] }), new Date(checkedAt));
  assert.deepEqual(result.titles, []);
});
test("A failed provider call is flagged rather than mislabeled as no TW availability", async () => {
  const fetcher = async url => {
    const path = new URL(url).pathname;
    if (path.endsWith("/search/movie")) return fakeResponse({ results: [{ id: 42 }, { id: 43 }] });
    if (path.endsWith("/42/watch/providers")) return fakeResponse({}, 500);
    if (path.endsWith("/watch/providers")) return fakeResponse(providerResponse);
    return fakeResponse({ ...detail, id: Number(path.split("/").at(-1)) });
  };
  const result = await searchTWMovies("測試作品", "test-api-key", fetcher, new Date(checkedAt));
  assert.equal(result.titles.length, 1);
  assert.equal(result.warnings[0].tmdbId, 42);
});
test("All provider calls failing returns upstream error, not empty catalog", async () => {
  const fetcher = async url => {
    const path = new URL(url).pathname;
    if (path.endsWith("/search/movie")) return fakeResponse({ results: [{ id: 42 }] });
    if (path.endsWith("/watch/providers")) return fakeResponse({}, 502);
    return fakeResponse(detail);
  };
  await assert.rejects(searchTWMovies("測試作品", "test-api-key", fetcher),
    error => error instanceof TMDBResearchError && error.code === "UPSTREAM");
});
test("Upstream 429 is a distinguishable rate-limit error", async () => {
  await assert.rejects(searchTWMovies("測試作品", "test-api-key", async () => fakeResponse({}, 429)),
    error => error instanceof TMDBResearchError && error.code === "RATE_LIMITED");
});
