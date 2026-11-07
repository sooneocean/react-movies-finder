import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyTastePassport, setGenrePreference, rateTasteWork,
  removeTasteWork, validateTastePassport, applyTastePassport,
  loadTastePassport, saveTastePassport, TASTE_STORAGE_KEY,
} from "../src/lib/watchpilot/taste-passport.ts";

const sample = (id = "test-1", genres = ["science-fiction"]) => ({
  id, title: "合成研究作品", runtimeMinutes: 120,
  genres, tasteScore: 60, qualityScore: 80,
  offers: [{ providerId: "netflix", access: "subscription", region: "TW", evidence: "FIXTURE", source: "fixture://test", observedOn: "2026-11-07" }],
});
test("empty passport starts without inferred genres or watched movies", () => {
  assert.deepEqual(emptyTastePassport(), { version: 1, likedGenres: [], avoidedGenres: [], entries: [] });
});
test("user can explicitly like, avoid, or neutralize a genre without overlaps", () => {
  let p = setGenrePreference(emptyTastePassport(), "science-fiction", "like");
  assert.deepEqual(p.likedGenres, ["science-fiction"]);
  p = setGenrePreference(p, "science-fiction", "avoid");
  assert.deepEqual(p.likedGenres, []);
  assert.deepEqual(p.avoidedGenres, ["science-fiction"]);
  p = setGenrePreference(p, "science-fiction", "neutral");
  assert.deepEqual(p.avoidedGenres, []);
});
test("unknown genres, conflicting likes and malformed stored preferences are rejected", () => {
  assert.throws(() => setGenrePreference(emptyTastePassport(), "not-real", "like"));
  assert.throws(() => validateTastePassport({
    ...emptyTastePassport(), likedGenres: ["science-fiction"],
    avoidedGenres: ["science-fiction"],
  }));
  assert.throws(() => validateTastePassport({ ...emptyTastePassport(), entries: [{}] }));
});
test("liking a genre increases score and explicit avoidance remains a hard exclusion", () => {
  let p = setGenrePreference(emptyTastePassport(), "science-fiction", "like");
  const preferred = applyTastePassport([sample()], p)[0];
  assert.equal(preferred.adjustedScore, 70);
  assert.equal(preferred.excluded, false);
  p = setGenrePreference(p, "science-fiction", "avoid");
  const avoided = applyTastePassport([sample()], p)[0];
  assert.equal(avoided.excluded, true);
});
test("rating one film updates individual and genre signals without changing original candidate", () => {
  const original = sample();
  const p = rateTasteWork(emptyTastePassport(), "test-1", ["science-fiction"], "love", false);
  const result = applyTastePassport([original], p)[0];
  assert.ok(result.adjustedScore > 60);
  assert.equal(original.tasteScore, 60);
  const other = applyTastePassport([sample("test-2")], p)[0];
  assert.ok(other.adjustedScore > 60);
});
test("watched status is honored and deleting opinion restores unmodified baseline", () => {
  const p = rateTasteWork(emptyTastePassport(), "test-1", ["science-fiction"], "dislike", true);
  assert.equal(applyTastePassport([sample()], p)[0].watched, true);
  const cleared = removeTasteWork(p, "test-1");
  const actual = applyTastePassport([sample()], cleared)[0];
  assert.equal(actual.adjustedScore, 60);
  assert.equal(actual.watched, false);
});
test("rating updates same work without duplicate, and personal opinions stay bounded", () => {
  let p = rateTasteWork(emptyTastePassport(), "test-1", ["drama"], "like", false);
  p = rateTasteWork(p, "test-1", ["science-fiction"], "dislike", true);
  assert.equal(p.entries.length, 1);
  assert.equal(p.entries[0].watched, true);
  assert.equal(p.entries[0].opinion, "dislike");
  for (let i = 0; i < 110; i++) p = rateTasteWork(p, "title:" + i, ["drama"], "neutral", false);
  assert.equal(p.entries.length, 100);
});
test("localStorage-style import/export works without cloud and fails closed on corrupt JSON", () => {
  const cache = new Map();
  const store = { getItem: k => cache.get(k) ?? null, setItem: (k,v) => cache.set(k,v) };
  const p = setGenrePreference(emptyTastePassport(), "mystery", "like");
  saveTastePassport(store, p);
  assert.ok(cache.has(TASTE_STORAGE_KEY));
  assert.deepEqual(loadTastePassport(store), p);
  cache.set(TASTE_STORAGE_KEY, "{broken");
  assert.deepEqual(loadTastePassport(store), emptyTastePassport());
});
test("non-sensical opinions, invalid IDs and untrusted oversized content fail safely", () => {
  assert.throws(() => rateTasteWork(emptyTastePassport(), "x", ["drama"], "evil", false));
  assert.throws(() => rateTasteWork(emptyTastePassport(), "space id", ["drama"], "love", false));
  assert.throws(() => validateTastePassport({ ...emptyTastePassport(), likedGenres: ["finance"] }));
});
